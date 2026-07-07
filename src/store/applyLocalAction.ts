// ユーザー操作を pending / ui / settings スライスへ適用する純関数(DECISIONS §6)。
// remote スライスは読むだけで決して書かない(remote を書けるのは applyRemoteEvent のみ)。
// stroke/end は「backend へ送信すべきパッチ」を返す。送信そのものは統合側の責務
// (フェーズ0では Firebase 接続を持たない)。

import type { Camera } from "../domain/camera";
import { cellsBetween } from "../domain/stroke";
import type {
	CellKey,
	CellPos,
	DrawTool,
	HexColor,
	PinDraft,
	PinId,
} from "../domain/types";
import { cellKey, isValidHexColor, parseCellKey } from "../domain/types";
import type { MapState, PixelPatch, SettingsSlice } from "./state";

export type LocalAction =
	| { readonly type: "mode/enterView" }
	| { readonly type: "mode/enterPin" }
	| {
			readonly type: "mode/enterDraw";
			readonly color: HexColor;
			readonly tool: DrawTool;
	  }
	| { readonly type: "draw/setColor"; readonly color: HexColor }
	| { readonly type: "draw/setTool"; readonly tool: DrawTool }
	| { readonly type: "stroke/start"; readonly cell: CellPos }
	| { readonly type: "stroke/move"; readonly cell: CellPos }
	| { readonly type: "stroke/end" }
	| { readonly type: "stroke/cancel" }
	| { readonly type: "camera/set"; readonly camera: Camera }
	| { readonly type: "pin/select"; readonly pinId: PinId | null }
	| { readonly type: "pinDraft/set"; readonly draft: PinDraft | null }
	| { readonly type: "pinDraft/update"; readonly patch: Partial<PinDraft> }
	| { readonly type: "pending/confirm"; readonly keys: readonly CellKey[] }
	| {
			readonly type: "settings/update";
			readonly patch: Partial<SettingsSlice>;
	  };

export type LocalActionResult = {
	readonly state: MapState;
	/** stroke/end のときのみ非 null: RTDB update() へ送信すべきパッチ */
	readonly patch: PixelPatch | null;
};

/** パッチを伴わない結果(大半のアクションはこちら) */
function noPatch(state: MapState): LocalActionResult {
	return { state, patch: null };
}

function isInsideGrid(cell: CellPos, grid: number): boolean {
	return (
		Number.isSafeInteger(cell.gx) &&
		Number.isSafeInteger(cell.gy) &&
		cell.gx >= 0 &&
		cell.gy >= 0 &&
		cell.gx < grid &&
		cell.gy < grid
	);
}

/**
 * ストローク補間の始点=最後に訪れたセル。Map の末尾エントリで表す
 * (stroke/move が再訪セルを delete→set で末尾へ移すことで不変条件を保つ)。
 */
function lastStrokeCell(
	stroke: ReadonlyMap<CellKey, HexColor | null>,
	grid: number,
): CellPos | null {
	let last: CellKey | null = null;
	for (const key of stroke.keys()) last = key;
	return last === null ? null : parseCellKey(last, grid);
}

export function applyLocalAction(
	state: MapState,
	action: LocalAction,
): LocalActionResult {
	const { ui } = state;
	switch (action.type) {
		case "mode/enterView": {
			// 描画途中のストローク・ピンドラフトはモード離脱で破棄する
			// (中途半端な状態を variant の外へ持ち出さないため)
			return noPatch({ ...state, ui: { ...ui, mode: { kind: "view" } } });
		}
		case "mode/enterPin": {
			return noPatch({
				...state,
				ui: { ...ui, mode: { kind: "pin", draft: null } },
			});
		}
		case "mode/enterDraw": {
			// HexColor は template literal 型で "#zzz" 等も通るため実行時にも検証する
			if (!isValidHexColor(action.color)) return noPatch(state);
			return noPatch({
				...state,
				ui: {
					...ui,
					mode: {
						kind: "draw",
						color: action.color,
						tool: action.tool,
						stroke: null,
					},
				},
			});
		}
		case "draw/setColor": {
			if (ui.mode.kind !== "draw" || !isValidHexColor(action.color)) {
				return noPatch(state);
			}
			return noPatch({
				...state,
				ui: { ...ui, mode: { ...ui.mode, color: action.color } },
			});
		}
		case "draw/setTool": {
			if (ui.mode.kind !== "draw") return noPatch(state);
			return noPatch({
				...state,
				ui: { ...ui, mode: { ...ui.mode, tool: action.tool } },
			});
		}
		case "stroke/start": {
			if (ui.mode.kind !== "draw") return noPatch(state);
			if (!isInsideGrid(action.cell, state.remote.mapMeta.grid)) {
				return noPatch(state);
			}
			// 既存ストロークが残っていたら破棄して新規開始する
			// (pointercancel 等で end が漏れた場合にゴースト線を引きずらないため)
			const value = ui.mode.tool === "paint" ? ui.mode.color : null;
			const stroke = new Map<CellKey, HexColor | null>([
				[cellKey(action.cell), value],
			]);
			return noPatch({
				...state,
				ui: { ...ui, mode: { ...ui.mode, stroke } },
			});
		}
		case "stroke/move": {
			if (ui.mode.kind !== "draw" || ui.mode.stroke === null) {
				return noPatch(state);
			}
			const grid = state.remote.mapMeta.grid;
			if (!isInsideGrid(action.cell, grid)) return noPatch(state);
			const last = lastStrokeCell(ui.mode.stroke, grid);
			if (last === null) return noPatch(state);
			const value = ui.mode.tool === "paint" ? ui.mode.color : null;
			const stroke = new Map(ui.mode.stroke);
			// 先頭要素は始点(=最後に訪れたセル)なので塗り直さない。
			// 再訪セルは delete→set で末尾へ移し、「末尾=最後に訪れたセル」を保つ
			for (const cell of cellsBetween(last, action.cell).slice(1)) {
				const key = cellKey(cell);
				stroke.delete(key);
				stroke.set(key, value);
			}
			return noPatch({
				...state,
				ui: { ...ui, mode: { ...ui.mode, stroke } },
			});
		}
		case "stroke/end": {
			if (ui.mode.kind !== "draw" || ui.mode.stroke === null) {
				return noPatch(state);
			}
			const patch = Object.fromEntries(ui.mode.stroke) as PixelPatch;
			// パッチは楽観的更新として pending に残し、エコーバック確認
			// (pending/confirm)まで表示優先を維持する(DECISIONS §5)
			return {
				state: {
					...state,
					pending: { patch: { ...state.pending.patch, ...patch } },
					ui: { ...ui, mode: { ...ui.mode, stroke: null } },
				},
				patch,
			};
		}
		case "stroke/cancel": {
			if (ui.mode.kind !== "draw" || ui.mode.stroke === null) {
				return noPatch(state);
			}
			return noPatch({
				...state,
				ui: { ...ui, mode: { ...ui.mode, stroke: null } },
			});
		}
		case "camera/set": {
			// clamp 等の計算は domain/camera の純関数で呼び出し側が行う
			// (store を viewport に依存させないため)
			return noPatch({ ...state, ui: { ...ui, camera: action.camera } });
		}
		case "pin/select": {
			return noPatch({ ...state, ui: { ...ui, selectedPinId: action.pinId } });
		}
		case "pinDraft/set": {
			if (ui.mode.kind !== "pin") return noPatch(state);
			return noPatch({
				...state,
				ui: { ...ui, mode: { kind: "pin", draft: action.draft } },
			});
		}
		case "pinDraft/update": {
			if (ui.mode.kind !== "pin" || ui.mode.draft === null) {
				return noPatch(state);
			}
			return noPatch({
				...state,
				ui: {
					...ui,
					mode: { kind: "pin", draft: { ...ui.mode.draft, ...action.patch } },
				},
			});
		}
		case "pending/confirm": {
			if (action.keys.length === 0) return noPatch(state);
			const patch: Record<CellKey, HexColor | null> = {
				...state.pending.patch,
			};
			for (const key of action.keys) delete patch[key];
			return noPatch({ ...state, pending: { patch } });
		}
		case "settings/update": {
			return noPatch({
				...state,
				settings: { ...state.settings, ...action.patch },
			});
		}
	}
}
