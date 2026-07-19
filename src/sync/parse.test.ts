// RTDB/キャッシュ由来 unknown 値の検証変換。不正データは黙って捨てる方針の確認。

import { describe, expect, it } from "vitest";
import {
	parseMapMeta,
	parsePin,
	parsePinRecord,
	parsePixelRecord,
} from "./parse";

/** RTDB に保存される形(id はキー側なので値には含まれない) */
function rawPin(overrides?: Record<string, unknown>): Record<string, unknown> {
	return {
		pos: { gx: 3, gy: 4 },
		name: "すみか",
		emoji: "🏠",
		desc: "説明",
		parentId: null,
		residents: [1, 25],
		authorId: "uid1",
		createdAt: 1000,
		...overrides,
	};
}

describe("parsePin", () => {
	it("完全なピンを変換する", () => {
		expect(parsePin("pin1", rawPin())).toEqual({
			id: "pin1",
			pos: { gx: 3, gy: 4 },
			name: "すみか",
			emoji: "🏠",
			desc: "説明",
			parentId: null,
			residents: [1, 25],
			authorId: "uid1",
			createdAt: 1000,
		});
	});

	it("desc / parentId / residents の欠落は既定値に倒す(RTDB は空値を保存しない)", () => {
		const pin = parsePin(
			"pin1",
			rawPin({ desc: undefined, parentId: undefined, residents: undefined }),
		);
		expect(pin).toMatchObject({ desc: "", parentId: null, residents: [] });
	});

	it("必須フィールドの欠落・型不一致は null", () => {
		for (const overrides of [
			{ pos: undefined },
			{ pos: { gx: -1, gy: 0 } },
			{ pos: { gx: 1.5, gy: 0 } },
			{ pos: { gx: "1", gy: 0 } },
			{ name: undefined },
			{ name: 5 },
			{ emoji: undefined },
			{ authorId: undefined },
			{ createdAt: "1000" },
		]) {
			expect(parsePin("pin1", rawPin(overrides))).toBeNull();
		}
	});

	it("オブジェクトでない値・空IDは null", () => {
		expect(parsePin("pin1", null)).toBeNull();
		expect(parsePin("pin1", "text")).toBeNull();
		expect(parsePin("pin1", [rawPin()])).toBeNull();
		expect(parsePin("", rawPin())).toBeNull();
	});

	it("residents は不正要素だけを除いて残す", () => {
		const pin = parsePin(
			"pin1",
			rawPin({ residents: [1, 0, -2, 1.5, "3", null, 25] }),
		);
		expect(pin?.residents).toEqual([1, 25]);
	});
});

describe("parsePinRecord", () => {
	it("不正なエントリだけを除いた配列を返す", () => {
		const pins = parsePinRecord({
			a: rawPin(),
			b: "broken",
			c: rawPin({ name: 1 }),
			d: rawPin({ name: "べつ" }),
		});
		expect(pins.map((p) => p.id)).toEqual(["a", "d"]);
	});

	it("ノードが欠落(null)なら空配列", () => {
		expect(parsePinRecord(null)).toEqual([]);
		expect(parsePinRecord(undefined)).toEqual([]);
	});
});

describe("parsePixelRecord", () => {
	it("文字列値のエントリだけを残す(キー・色の検証は applyRemoteEvent の担当)", () => {
		expect(
			parsePixelRecord({ "1,1": "#ff0000", "2,2": 5, "3,3": { a: 1 } }),
		).toEqual({ "1,1": "#ff0000" });
	});

	it("ノードが欠落(null)なら空", () => {
		expect(parsePixelRecord(null)).toEqual({});
	});
});

describe("parseMapMeta", () => {
	it("正の整数 grid のみ受理する", () => {
		expect(parseMapMeta({ grid: 46 })).toEqual({ grid: 46 });
		expect(parseMapMeta({ grid: 20 })).toEqual({ grid: 20 });
		for (const grid of [0, -1, 1.5, "46", null, undefined]) {
			expect(parseMapMeta({ grid })).toBeNull();
		}
		expect(parseMapMeta(null)).toBeNull();
	});
});
