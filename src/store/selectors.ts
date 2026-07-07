// 表示用の純関数セレクタ。表示規則(DECISIONS §5):
// pending は常にリモートより優先し、リモート差分はベース(remote)にのみ適用される。
// ストローク中セル > 確定済み楽観パッチ > remote の順で新しいものが勝つ。

import type { CellKey, HexColor } from "../domain/types";
import type { MapState, PixelPatch } from "./state";

/** remote に pending を上書き合成した表示用ピクセル(null=セル消去) */
export function mergePixels(
	remote: Readonly<Record<CellKey, HexColor>>,
	pending: PixelPatch,
): Readonly<Record<CellKey, HexColor>> {
	const merged: Record<CellKey, HexColor> = { ...remote };
	for (const [key, value] of Object.entries(pending) as ReadonlyArray<
		[CellKey, HexColor | null]
	>) {
		if (value === null) delete merged[key];
		else merged[key] = value;
	}
	return merged;
}

/** pending 扱いのセル一式(確定済みパッチ+ストローク中セル。後者が優先) */
export function selectPendingCells(state: MapState): PixelPatch {
	const stroke = state.ui.mode.kind === "draw" ? state.ui.mode.stroke : null;
	if (stroke === null) return state.pending.patch;
	const cells: Record<CellKey, HexColor | null> = { ...state.pending.patch };
	for (const [key, value] of stroke) cells[key] = value;
	return cells;
}

/** canvas / React が描画に使う最終的なピクセル */
export function selectVisiblePixels(
	state: MapState,
): Readonly<Record<CellKey, HexColor>> {
	return mergePixels(state.remote.pixels, selectPendingCells(state));
}
