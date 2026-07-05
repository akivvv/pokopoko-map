import { describe, expect, it } from "vitest";
import { cellsBetween } from "./stroke";
import type { CellPos } from "./types";

function assertNoGaps(cells: CellPos[]): void {
	for (let i = 1; i < cells.length; i++) {
		const prev = cells[i - 1];
		const cur = cells[i];
		if (!prev || !cur) throw new Error("unexpected hole");
		expect(Math.abs(cur.gx - prev.gx)).toBeLessThanOrEqual(1);
		expect(Math.abs(cur.gy - prev.gy)).toBeLessThanOrEqual(1);
		expect(cur.gx !== prev.gx || cur.gy !== prev.gy).toBe(true);
	}
}

describe("cellsBetween", () => {
	it("同一セル → そのセルのみ", () => {
		expect(cellsBetween({ gx: 3, gy: 3 }, { gx: 3, gy: 3 })).toEqual([
			{ gx: 3, gy: 3 },
		]);
	});

	it("水平・垂直・対角", () => {
		expect(cellsBetween({ gx: 0, gy: 0 }, { gx: 3, gy: 0 })).toEqual([
			{ gx: 0, gy: 0 },
			{ gx: 1, gy: 0 },
			{ gx: 2, gy: 0 },
			{ gx: 3, gy: 0 },
		]);
		expect(cellsBetween({ gx: 2, gy: 5 }, { gx: 2, gy: 2 })).toEqual([
			{ gx: 2, gy: 5 },
			{ gx: 2, gy: 4 },
			{ gx: 2, gy: 3 },
			{ gx: 2, gy: 2 },
		]);
		expect(cellsBetween({ gx: 0, gy: 0 }, { gx: 2, gy: 2 })).toEqual([
			{ gx: 0, gy: 0 },
			{ gx: 1, gy: 1 },
			{ gx: 2, gy: 2 },
		]);
	});

	it.each([
		[
			{ gx: 0, gy: 0 },
			{ gx: 10, gy: 3 },
		],
		[
			{ gx: 5, gy: 40 },
			{ gx: 38, gy: 2 },
		],
		[
			{ gx: 45, gy: 45 },
			{ gx: 0, gy: 0 },
		],
		[
			{ gx: 7, gy: 1 },
			{ gx: 8, gy: 30 },
		],
		[
			{ gx: 63, gy: 0 },
			{ gx: 0, gy: 63 },
		],
	])("始点・終点を含み、隙間も重複もない (%o → %o)", (a, b) => {
		const cells = cellsBetween(a, b);
		expect(cells[0]).toEqual(a);
		expect(cells[cells.length - 1]).toEqual(b);
		expect(cells.length).toBe(
			Math.max(Math.abs(b.gx - a.gx), Math.abs(b.gy - a.gy)) + 1,
		);
		assertNoGaps(cells);
	});
});
