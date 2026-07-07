import { describe, expect, it } from "vitest";
import type { CellKey, HexColor } from "../domain/types";
import { applyLocalAction } from "./applyLocalAction";
import { applyRemoteEvent } from "./applyRemoteEvent";
import {
	mergePixels,
	selectPendingCells,
	selectVisiblePixels,
} from "./selectors";
import type { MapState } from "./state";
import { createInitialState } from "./state";

const GRID = 10;
const RED: HexColor = "#ff0000";
const BLUE: HexColor = "#0000ff";
const GREEN: HexColor = "#00ff00";

describe("mergePixels", () => {
	it("pending が常にリモートより優先される", () => {
		const merged = mergePixels(
			{ "0,0": RED, "1,1": RED },
			{ "1,1": BLUE, "2,2": GREEN },
		);
		expect(merged).toEqual({ "0,0": RED, "1,1": BLUE, "2,2": GREEN });
	});

	it("pending の null はセル消去として合成される", () => {
		const merged = mergePixels({ "0,0": RED, "1,1": RED }, { "0,0": null });
		expect(merged).toEqual({ "1,1": RED });
	});

	it("入力を破壊しない(純関数)", () => {
		const remote: Readonly<Record<CellKey, HexColor>> = { "0,0": RED };
		const pending = { "0,0": null, "1,1": BLUE } as const;
		mergePixels(remote, pending);
		expect(remote).toEqual({ "0,0": RED });
		expect(pending).toEqual({ "0,0": null, "1,1": BLUE });
	});
});

describe("selectPendingCells / selectVisiblePixels", () => {
	function drawingState(): MapState {
		let state = createInitialState(GRID);
		for (const action of [
			{ type: "mode/enterDraw", color: BLUE, tool: "paint" } as const,
			{ type: "stroke/start", cell: { gx: 0, gy: 0 } } as const,
			{ type: "stroke/move", cell: { gx: 1, gy: 0 } } as const,
		]) {
			state = applyLocalAction(state, action).state;
		}
		return state;
	}

	it("ストローク中セルは確定済みパッチより優先される", () => {
		const state = drawingState();
		const withPatch: MapState = {
			...state,
			pending: { patch: { "0,0": GREEN, "5,5": null } },
		};
		expect(selectPendingCells(withPatch)).toEqual({
			"0,0": BLUE,
			"1,0": BLUE,
			"5,5": null,
		});
	});

	it("ストローク中にリモート差分が来ても pending が表示優先(DECISIONS §5)", () => {
		const state = drawingState();
		// リモートで同じセルが赤に塗られてもベース(remote)にだけ入る
		const remote = applyRemoteEvent(state.remote, {
			type: "pixel/added",
			key: "0,0",
			value: RED,
		});
		const updated: MapState = { ...state, remote };
		expect(updated.remote.pixels["0,0"]).toBe(RED);
		expect(selectVisiblePixels(updated)["0,0"]).toBe(BLUE);
		// ストロークが終わり pending が確認されるとリモートの値が現れる
		const ended = applyLocalAction(updated, { type: "stroke/end" });
		const confirmed = applyLocalAction(ended.state, {
			type: "pending/confirm",
			keys: Object.keys(ended.patch ?? {}) as CellKey[],
		}).state;
		expect(selectVisiblePixels(confirmed)["0,0"]).toBe(RED);
	});

	it("erase ストロークはリモートのセルを表示から隠す", () => {
		let state = createInitialState(GRID);
		state = {
			...state,
			remote: applyRemoteEvent(state.remote, {
				type: "pixel/added",
				key: "2,2",
				value: RED,
			}),
		};
		for (const action of [
			{ type: "mode/enterDraw", color: BLUE, tool: "erase" } as const,
			{ type: "stroke/start", cell: { gx: 2, gy: 2 } } as const,
		]) {
			state = applyLocalAction(state, action).state;
		}
		expect(selectVisiblePixels(state)).toEqual({});
	});

	it("ストローク外では pending.patch がそのまま返る", () => {
		const state = createInitialState(GRID);
		expect(selectPendingCells(state)).toBe(state.pending.patch);
	});
});
