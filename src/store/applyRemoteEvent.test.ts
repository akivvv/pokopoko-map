import { describe, expect, it } from "vitest";
import type { Pin } from "../domain/types";
import { applyRemoteEvent } from "./applyRemoteEvent";
import type { RemoteSlice } from "./state";

// 46 前提の実装が混入していないことを検出するため、あえて 46 以外を使う
const GRID = 20;

function makeRemote(overrides?: Partial<RemoteSlice>): RemoteSlice {
	return {
		pins: {},
		pixels: {},
		mapMeta: { grid: GRID },
		...overrides,
	};
}

function makePin(overrides?: Partial<Pin>): Pin {
	return {
		id: "pin1",
		pos: { gx: 3, gy: 4 },
		name: "テスト",
		emoji: "🍎",
		desc: "",
		parentId: null,
		residents: [],
		authorId: "uid1",
		createdAt: 1000,
		...overrides,
	};
}

describe("applyRemoteEvent: pixels", () => {
	it("pixel/added でセルが追加される", () => {
		const next = applyRemoteEvent(makeRemote(), {
			type: "pixel/added",
			key: "3,4",
			value: "#ff0000",
		});
		expect(next.pixels).toEqual({ "3,4": "#ff0000" });
	});

	it("pixel/changed で値が置き換わる", () => {
		const base = makeRemote({ pixels: { "3,4": "#ff0000" } });
		const next = applyRemoteEvent(base, {
			type: "pixel/changed",
			key: "3,4",
			value: "#00ff00",
		});
		expect(next.pixels).toEqual({ "3,4": "#00ff00" });
	});

	it("pixel/removed でセルが消える", () => {
		const base = makeRemote({
			pixels: { "3,4": "#ff0000", "5,6": "#0000ff" },
		});
		const next = applyRemoteEvent(base, { type: "pixel/removed", key: "3,4" });
		expect(next.pixels).toEqual({ "5,6": "#0000ff" });
	});

	it("不正なキー形式は黙って捨てる", () => {
		const base = makeRemote();
		for (const key of ["a,b", "-1,2", "01,2", "1", "1,2,3", ""]) {
			expect(
				applyRemoteEvent(base, { type: "pixel/added", key, value: "#ff0000" }),
			).toBe(base);
		}
	});

	it("グリッド範囲外のキーは捨てる(mapMeta.grid で判定する)", () => {
		const base = makeRemote();
		expect(
			applyRemoteEvent(base, {
				type: "pixel/added",
				key: `${GRID},0`,
				value: "#ff0000",
			}),
		).toBe(base);
		// grid を広げれば同じキーが受理される(46 ハードコードなしの確認)
		const wide = makeRemote({ mapMeta: { grid: GRID + 1 } });
		const next = applyRemoteEvent(wide, {
			type: "pixel/added",
			key: `${GRID},0`,
			value: "#ff0000",
		});
		expect(next.pixels[`${GRID},0`]).toBe("#ff0000");
	});

	it("不正な色は捨てる", () => {
		const base = makeRemote();
		for (const value of ["#fff", "red", "#ff000", "#ff00001", ""]) {
			expect(
				applyRemoteEvent(base, { type: "pixel/added", key: "1,1", value }),
			).toBe(base);
		}
	});

	it("同値の再適用・存在しないセルの削除は参照を維持する", () => {
		const base = makeRemote({ pixels: { "3,4": "#ff0000" } });
		expect(
			applyRemoteEvent(base, {
				type: "pixel/changed",
				key: "3,4",
				value: "#ff0000",
			}),
		).toBe(base);
		expect(applyRemoteEvent(base, { type: "pixel/removed", key: "9,9" })).toBe(
			base,
		);
	});

	it("元の state を破壊しない(純関数)", () => {
		const base = makeRemote({ pixels: { "3,4": "#ff0000" } });
		applyRemoteEvent(base, {
			type: "pixel/added",
			key: "1,1",
			value: "#00ff00",
		});
		applyRemoteEvent(base, { type: "pixel/removed", key: "3,4" });
		expect(base.pixels).toEqual({ "3,4": "#ff0000" });
	});
});

describe("applyRemoteEvent: pins", () => {
	it("pin/added / pin/changed / pin/removed", () => {
		const pin = makePin();
		const added = applyRemoteEvent(makeRemote(), { type: "pin/added", pin });
		expect(added.pins).toEqual({ pin1: pin });

		const renamed = makePin({ name: "改名" });
		const changed = applyRemoteEvent(added, {
			type: "pin/changed",
			pin: renamed,
		});
		expect(changed.pins.pin1?.name).toBe("改名");

		const removed = applyRemoteEvent(changed, {
			type: "pin/removed",
			id: "pin1",
		});
		expect(removed.pins).toEqual({});
	});

	it("座標が範囲外・非整数のピンは捨てる", () => {
		const base = makeRemote();
		for (const pos of [
			{ gx: GRID, gy: 0 },
			{ gx: 0, gy: GRID },
			{ gx: -1, gy: 0 },
			{ gx: 1.5, gy: 2 },
		]) {
			expect(
				applyRemoteEvent(base, { type: "pin/added", pin: makePin({ pos }) }),
			).toBe(base);
		}
	});

	it("存在しないピンの削除は参照を維持する", () => {
		const base = makeRemote();
		expect(applyRemoteEvent(base, { type: "pin/removed", id: "nope" })).toBe(
			base,
		);
	});
});

describe("applyRemoteEvent: meta", () => {
	it("meta/changed で grid が更新される", () => {
		const next = applyRemoteEvent(makeRemote(), {
			type: "meta/changed",
			meta: { grid: 64 },
		});
		expect(next.mapMeta.grid).toBe(64);
	});

	it("不正な grid(0以下・非整数)は捨てる", () => {
		const base = makeRemote();
		for (const grid of [0, -1, 1.5, Number.NaN]) {
			expect(
				applyRemoteEvent(base, { type: "meta/changed", meta: { grid } }),
			).toBe(base);
		}
	});
});
