import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HexColor } from "../domain/types";
import { createMapStore, useMapStore } from "./createMapStore";
import { selectVisiblePixels } from "./selectors";

const RED: HexColor = "#ff0000";
const BLUE: HexColor = "#0000ff";

describe("createMapStore", () => {
	it("grid は渡した初期値と meta/changed だけで決まる(46 ハードコードなし)", () => {
		const store = createMapStore("map1", { grid: 8 });
		expect(store.getState().remote.mapMeta.grid).toBe(8);

		// grid 8 では範囲外のキーが、meta 更新後は受理される
		store.getState().dispatchRemote({
			type: "pixel/added",
			key: "9,9",
			value: RED,
		});
		expect(store.getState().remote.pixels).toEqual({});

		store
			.getState()
			.dispatchRemote({ type: "meta/changed", meta: { grid: 12 } });
		store.getState().dispatchRemote({
			type: "pixel/added",
			key: "9,9",
			value: RED,
		});
		expect(store.getState().remote.pixels).toEqual({ "9,9": RED });
	});

	it("dispatch は stroke/end のときだけパッチを返す", () => {
		const store = createMapStore("map1", { grid: 8 });
		const { dispatch } = store.getState();
		expect(
			dispatch({ type: "mode/enterDraw", color: RED, tool: "paint" }),
		).toBeNull();
		expect(
			dispatch({ type: "stroke/start", cell: { gx: 1, gy: 1 } }),
		).toBeNull();
		expect(dispatch({ type: "stroke/end" })).toEqual({ "1,1": RED });
	});

	it("ストローク中のリモート差分はベースに入り、表示は pending 優先のまま", () => {
		const store = createMapStore("map1", { grid: 8 });
		const { dispatch, dispatchRemote } = store.getState();
		dispatch({ type: "mode/enterDraw", color: BLUE, tool: "paint" });
		dispatch({ type: "stroke/start", cell: { gx: 0, gy: 0 } });
		dispatchRemote({ type: "pixel/added", key: "0,0", value: RED });

		const state = store.getState();
		expect(state.remote.pixels["0,0"]).toBe(RED);
		expect(selectVisiblePixels(state)["0,0"]).toBe(BLUE);
	});

	it("store.subscribe で React 外から購読できる(canvas 用)", () => {
		const store = createMapStore("map1", { grid: 8 });
		const seen: number[] = [];
		const unsubscribe = store.subscribe((state) => {
			seen.push(Object.keys(state.remote.pixels).length);
		});
		store.getState().dispatchRemote({
			type: "pixel/added",
			key: "1,1",
			value: RED,
		});
		store.getState().dispatchRemote({
			type: "pixel/added",
			key: "2,2",
			value: RED,
		});
		unsubscribe();
		store.getState().dispatchRemote({
			type: "pixel/added",
			key: "3,3",
			value: RED,
		});
		expect(seen).toEqual([1, 2]);
	});

	it("useMapStore で React から購読できる", () => {
		const store = createMapStore("map1", { grid: 8 });
		const { result } = renderHook(() =>
			useMapStore(store, (state) => state.remote.mapMeta.grid),
		);
		expect(result.current).toBe(8);

		act(() => {
			store
				.getState()
				.dispatchRemote({ type: "meta/changed", meta: { grid: 32 } });
		});
		expect(result.current).toBe(32);
	});

	it("settings の初期値を外から渡せる(localStorage 復元用)", () => {
		const store = createMapStore("map1", {
			grid: 8,
			settings: { nickname: "あきら", showImage: true },
		});
		expect(store.getState().settings).toEqual({
			nickname: "あきら",
			showImage: true,
		});
	});
});
