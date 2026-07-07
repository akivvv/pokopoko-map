import { describe, expect, it } from "vitest";
import type { CellKey, HexColor, Mode, PinDraft } from "../domain/types";
import type { LocalAction } from "./applyLocalAction";
import { applyLocalAction } from "./applyLocalAction";
import type { MapState } from "./state";
import { createInitialState } from "./state";

// 46 前提の実装が混入していないことを検出するため、あえて 46 以外を使う
const GRID = 10;
const RED: HexColor = "#ff0000";
const BLUE: HexColor = "#0000ff";

function makeState(mode?: Mode): MapState {
	const state = createInitialState(GRID);
	return mode ? { ...state, ui: { ...state.ui, mode } } : state;
}

/** アクション列を順に適用した最終状態(途中のパッチは捨てる) */
function run(state: MapState, actions: readonly LocalAction[]): MapState {
	return actions.reduce(
		(acc, action) => applyLocalAction(acc, action).state,
		state,
	);
}

function strokeOf(state: MapState): ReadonlyMap<CellKey, HexColor | null> {
	if (state.ui.mode.kind !== "draw" || state.ui.mode.stroke === null) {
		throw new Error("draw モードでストローク中のはず");
	}
	return state.ui.mode.stroke;
}

describe("applyLocalAction: モード遷移", () => {
	it("view → pin → draw → view を網羅する", () => {
		const s1 = applyLocalAction(makeState(), { type: "mode/enterPin" }).state;
		expect(s1.ui.mode).toEqual({ kind: "pin", draft: null });

		const s2 = applyLocalAction(s1, {
			type: "mode/enterDraw",
			color: RED,
			tool: "paint",
		}).state;
		expect(s2.ui.mode).toEqual({
			kind: "draw",
			color: RED,
			tool: "paint",
			stroke: null,
		});

		const s3 = applyLocalAction(s2, { type: "mode/enterView" }).state;
		expect(s3.ui.mode).toEqual({ kind: "view" });
	});

	it("ストローク中にモードを抜けるとストロークは破棄される", () => {
		const drawing = run(makeState(), [
			{ type: "mode/enterDraw", color: RED, tool: "paint" },
			{ type: "stroke/start", cell: { gx: 1, gy: 1 } },
		]);
		const left = applyLocalAction(drawing, { type: "mode/enterView" }).state;
		expect(left.ui.mode).toEqual({ kind: "view" });
		expect(left.pending.patch).toEqual({});
	});

	it("実行時に不正な色では draw モードに入れない", () => {
		const state = makeState();
		const result = applyLocalAction(state, {
			type: "mode/enterDraw",
			color: "#zzz" as HexColor,
			tool: "paint",
		});
		expect(result.state).toBe(state);
	});

	it("draw/setColor・draw/setTool は draw モードでのみ効く", () => {
		const view = makeState();
		expect(
			applyLocalAction(view, { type: "draw/setColor", color: BLUE }).state,
		).toBe(view);
		expect(
			applyLocalAction(view, { type: "draw/setTool", tool: "erase" }).state,
		).toBe(view);

		const draw = run(view, [
			{ type: "mode/enterDraw", color: RED, tool: "paint" },
			{ type: "draw/setColor", color: BLUE },
			{ type: "draw/setTool", tool: "erase" },
		]);
		expect(draw.ui.mode).toEqual({
			kind: "draw",
			color: BLUE,
			tool: "erase",
			stroke: null,
		});
	});
});

describe("applyLocalAction: ストローク", () => {
	const enterDraw: LocalAction = {
		type: "mode/enterDraw",
		color: RED,
		tool: "paint",
	};

	it("draw モード以外での stroke/start は無視される", () => {
		const view = makeState();
		expect(
			applyLocalAction(view, { type: "stroke/start", cell: { gx: 1, gy: 1 } })
				.state,
		).toBe(view);
	});

	it("stroke/start で始点セルが色付きで入る(erase は null)", () => {
		const paint = run(makeState(), [
			enterDraw,
			{ type: "stroke/start", cell: { gx: 2, gy: 3 } },
		]);
		expect(Object.fromEntries(strokeOf(paint))).toEqual({ "2,3": RED });

		const erase = run(makeState(), [
			enterDraw,
			{ type: "draw/setTool", tool: "erase" },
			{ type: "stroke/start", cell: { gx: 2, gy: 3 } },
		]);
		expect(Object.fromEntries(strokeOf(erase))).toEqual({ "2,3": null });
	});

	it("グリッド範囲外のセルは start / move とも無視される", () => {
		const drawing = run(makeState(), [
			enterDraw,
			{ type: "stroke/start", cell: { gx: GRID, gy: 0 } },
		]);
		expect(drawing.ui.mode).toMatchObject({ kind: "draw", stroke: null });

		const started = run(makeState(), [
			enterDraw,
			{ type: "stroke/start", cell: { gx: 0, gy: 0 } },
		]);
		const moved = applyLocalAction(started, {
			type: "stroke/move",
			cell: { gx: 0, gy: GRID },
		}).state;
		expect(moved).toBe(started);
	});

	it("stroke/move は cellsBetween で補間する(斜め・飛び)", () => {
		const state = run(makeState(), [
			enterDraw,
			{ type: "stroke/start", cell: { gx: 0, gy: 0 } },
			{ type: "stroke/move", cell: { gx: 3, gy: 3 } },
		]);
		expect(Object.fromEntries(strokeOf(state))).toEqual({
			"0,0": RED,
			"1,1": RED,
			"2,2": RED,
			"3,3": RED,
		});
	});

	it("補間の始点は「最後に訪れたセル」(引き返しても正しい)", () => {
		// (0,0)→(2,0)→(0,0) と引き返してから (0,2) へ。
		// 最後に訪れた (0,0) から補間されるので (1,1) 等の斜めセルは入らない
		const state = run(makeState(), [
			enterDraw,
			{ type: "stroke/start", cell: { gx: 0, gy: 0 } },
			{ type: "stroke/move", cell: { gx: 2, gy: 0 } },
			{ type: "stroke/move", cell: { gx: 0, gy: 0 } },
			{ type: "stroke/move", cell: { gx: 0, gy: 2 } },
		]);
		const keys = new Set(strokeOf(state).keys());
		expect(keys).toEqual(new Set(["0,0", "1,0", "2,0", "0,1", "0,2"]));
	});

	it("ストローク途中の色変更は以降のセルにだけ効く", () => {
		const state = run(makeState(), [
			enterDraw,
			{ type: "stroke/start", cell: { gx: 0, gy: 0 } },
			{ type: "draw/setColor", color: BLUE },
			{ type: "stroke/move", cell: { gx: 2, gy: 0 } },
		]);
		expect(Object.fromEntries(strokeOf(state))).toEqual({
			"0,0": RED,
			"1,0": BLUE,
			"2,0": BLUE,
		});
	});

	it("stroke/end は送信すべきパッチを返し pending に積む", () => {
		const drawing = run(makeState(), [
			enterDraw,
			{ type: "stroke/start", cell: { gx: 1, gy: 1 } },
			{ type: "stroke/move", cell: { gx: 1, gy: 2 } },
		]);
		const { state, patch } = applyLocalAction(drawing, { type: "stroke/end" });
		expect(patch).toEqual({ "1,1": RED, "1,2": RED });
		expect(state.pending.patch).toEqual({ "1,1": RED, "1,2": RED });
		expect(state.ui.mode).toMatchObject({ kind: "draw", stroke: null });
	});

	it("erase ストロークの stroke/end は null 値のパッチ(セル消去)を返す", () => {
		const drawing = run(makeState(), [
			enterDraw,
			{ type: "draw/setTool", tool: "erase" },
			{ type: "stroke/start", cell: { gx: 5, gy: 5 } },
		]);
		const { patch } = applyLocalAction(drawing, { type: "stroke/end" });
		expect(patch).toEqual({ "5,5": null });
	});

	it("ストローク外の stroke/end はパッチを返さない", () => {
		const draw = run(makeState(), [enterDraw]);
		const result = applyLocalAction(draw, { type: "stroke/end" });
		expect(result.patch).toBeNull();
		expect(result.state).toBe(draw);
	});

	it("stroke/cancel はパッチも pending も残さない", () => {
		const drawing = run(makeState(), [
			enterDraw,
			{ type: "stroke/start", cell: { gx: 1, gy: 1 } },
		]);
		const result = applyLocalAction(drawing, { type: "stroke/cancel" });
		expect(result.patch).toBeNull();
		expect(result.state.ui.mode).toMatchObject({ kind: "draw", stroke: null });
		expect(result.state.pending.patch).toEqual({});
	});

	it("連続ストロークのパッチは pending に累積し pending/confirm で消える", () => {
		const first = applyLocalAction(
			run(makeState(), [
				enterDraw,
				{ type: "stroke/start", cell: { gx: 0, gy: 0 } },
			]),
			{ type: "stroke/end" },
		);
		const second = applyLocalAction(
			run(first.state, [{ type: "stroke/start", cell: { gx: 1, gy: 0 } }]),
			{ type: "stroke/end" },
		);
		expect(second.state.pending.patch).toEqual({ "0,0": RED, "1,0": RED });

		const confirmed = applyLocalAction(second.state, {
			type: "pending/confirm",
			keys: ["0,0"],
		}).state;
		expect(confirmed.pending.patch).toEqual({ "1,0": RED });
	});

	it("元の state を破壊しない(純関数)", () => {
		const drawing = run(makeState(), [
			enterDraw,
			{ type: "stroke/start", cell: { gx: 0, gy: 0 } },
		]);
		const before = new Map(strokeOf(drawing));
		applyLocalAction(drawing, { type: "stroke/move", cell: { gx: 3, gy: 0 } });
		applyLocalAction(drawing, { type: "stroke/end" });
		expect(new Map(strokeOf(drawing))).toEqual(before);
		expect(drawing.pending.patch).toEqual({});
	});
});

describe("applyLocalAction: カメラ・ピン・設定", () => {
	it("camera/set でカメラが置き換わる", () => {
		const camera = { scale: 12, tx: -30, ty: 8 };
		const state = applyLocalAction(makeState(), {
			type: "camera/set",
			camera,
		}).state;
		expect(state.ui.camera).toEqual(camera);
	});

	it("pin/select は選択中ピンを切り替える", () => {
		const selected = applyLocalAction(makeState(), {
			type: "pin/select",
			pinId: "pin1",
		}).state;
		expect(selected.ui.selectedPinId).toBe("pin1");
		const cleared = applyLocalAction(selected, {
			type: "pin/select",
			pinId: null,
		}).state;
		expect(cleared.ui.selectedPinId).toBeNull();
	});

	it("pinDraft/set・pinDraft/update は pin モードでのみ効く", () => {
		const draft: PinDraft = {
			pos: { gx: 2, gy: 2 },
			name: "巣",
			emoji: "🏠",
			desc: "",
			parentId: null,
		};
		const view = makeState();
		expect(applyLocalAction(view, { type: "pinDraft/set", draft }).state).toBe(
			view,
		);

		const withDraft = run(view, [
			{ type: "mode/enterPin" },
			{ type: "pinDraft/set", draft },
			{
				type: "pinDraft/update",
				patch: { name: "巣2", pos: { gx: 3, gy: 3 } },
			},
		]);
		expect(withDraft.ui.mode).toEqual({
			kind: "pin",
			draft: { ...draft, name: "巣2", pos: { gx: 3, gy: 3 } },
		});
	});

	it("draft が無いときの pinDraft/update は無視される", () => {
		const pinMode = run(makeState(), [{ type: "mode/enterPin" }]);
		expect(
			applyLocalAction(pinMode, {
				type: "pinDraft/update",
				patch: { name: "x" },
			}).state,
		).toBe(pinMode);
	});

	it("settings/update は部分更新できる", () => {
		const state = run(makeState(), [
			{ type: "settings/update", patch: { nickname: "あきら" } },
			{ type: "settings/update", patch: { showImage: true } },
		]);
		expect(state.settings).toEqual({ showImage: true, nickname: "あきら" });
	});
});
