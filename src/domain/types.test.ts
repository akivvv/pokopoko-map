import { describe, expect, it } from "vitest";
import { cellKey, isValidHexColor, parseCellKey } from "./types";

describe("cellKey / parseCellKey", () => {
	it("往復変換が恒等になる", () => {
		for (const cell of [
			{ gx: 0, gy: 0 },
			{ gx: 45, gy: 45 },
			{ gx: 12, gy: 3 },
		]) {
			expect(parseCellKey(cellKey(cell), 46)).toEqual(cell);
		}
	});

	it("グリッド範囲外は null(可変グリッドで判定)", () => {
		expect(parseCellKey("46,0", 46)).toBeNull();
		expect(parseCellKey("0,46", 46)).toBeNull();
		expect(parseCellKey("46,0", 64)).toEqual({ gx: 46, gy: 0 });
		expect(parseCellKey("30,30", 31)).toEqual({ gx: 30, gy: 30 });
		expect(parseCellKey("31,30", 31)).toBeNull();
	});

	it("不正な形式は null", () => {
		for (const bad of [
			"",
			"1",
			"1,2,3",
			"a,b",
			"-1,2",
			"1,-2",
			"01,2",
			"1, 2",
			"1.5,2",
			",",
			"1,",
		]) {
			expect(parseCellKey(bad, 46)).toBeNull();
		}
	});
});

describe("isValidHexColor", () => {
	it("#rrggbb のみ許可", () => {
		expect(isValidHexColor("#a1B2c3")).toBe(true);
		expect(isValidHexColor("#000000")).toBe(true);
		for (const bad of [
			"#fff",
			"a1b2c3",
			"#a1b2c",
			"#a1b2c3d",
			"#a1b2cg",
			"rgb(0,0,0)",
			"",
		]) {
			expect(isValidHexColor(bad)).toBe(false);
		}
	});
});
