import { describe, expect, it } from "vitest";
import {
	backingSize,
	type Camera,
	cellFromScreen,
	cellRectOnScreen,
	clampCamera,
	fitCamera,
	panBy,
	scaleLimits,
	screenFromCellCenter,
	screenFromWorld,
	worldFromScreen,
	zoomAtPoint,
} from "./camera";

const GRIDS = [1, 31, 46, 64];
const VIEWPORT = { width: 390, height: 700 };

function closeTo(a: number, b: number, eps = 1e-9): void {
	expect(Math.abs(a - b)).toBeLessThan(eps);
}

describe("worldFromScreen / screenFromWorld", () => {
	it.each(GRIDS)("往復変換が恒等になる (grid=%i)", (grid) => {
		const cam = fitCamera(VIEWPORT, grid);
		for (const s of [
			{ sx: 0, sy: 0 },
			{ sx: 123.5, sy: 456.25 },
			{ sx: VIEWPORT.width, sy: VIEWPORT.height },
			{ sx: -50, sy: 900 },
		]) {
			const back = screenFromWorld(cam, worldFromScreen(cam, s));
			closeTo(back.sx, s.sx);
			closeTo(back.sy, s.sy);
		}
	});
});

describe("cellFromScreen", () => {
	const grid = 46;
	const cam: Camera = { scale: 10, tx: 20, ty: 30 };

	it("セル左上端はそのセルに含まれる(境界は左上端含み)", () => {
		expect(cellFromScreen(cam, grid, { sx: 20, sy: 30 })).toEqual({
			gx: 0,
			gy: 0,
		});
		expect(cellFromScreen(cam, grid, { sx: 20 + 10, sy: 30 })).toEqual({
			gx: 1,
			gy: 0,
		});
		expect(cellFromScreen(cam, grid, { sx: 20 + 10 - 0.001, sy: 30 })).toEqual({
			gx: 0,
			gy: 0,
		});
	});

	it("マップ外は null(左・上・右端・下端)", () => {
		expect(cellFromScreen(cam, grid, { sx: 19.999, sy: 30 })).toBeNull();
		expect(cellFromScreen(cam, grid, { sx: 20, sy: 29.999 })).toBeNull();
		expect(
			cellFromScreen(cam, grid, { sx: 20 + grid * 10, sy: 30 }),
		).toBeNull();
		expect(
			cellFromScreen(cam, grid, { sx: 20, sy: 30 + grid * 10 }),
		).toBeNull();
	});

	it.each(GRIDS)("最終セルの内側は有効 (grid=%i)", (g) => {
		const c: Camera = { scale: 8, tx: 0, ty: 0 };
		expect(
			cellFromScreen(c, g, { sx: g * 8 - 0.001, sy: g * 8 - 0.001 }),
		).toEqual({
			gx: g - 1,
			gy: g - 1,
		});
	});
});

describe("fitCamera", () => {
	it.each(
		GRIDS,
	)("マップ全体がパディング込みで収まり中央配置になる (grid=%i)", (grid) => {
		const pad = 16;
		const cam = fitCamera(VIEWPORT, grid, pad);
		const topLeft = screenFromWorld(cam, { wx: 0, wy: 0 });
		const bottomRight = screenFromWorld(cam, { wx: grid, wy: grid });
		expect(topLeft.sx).toBeGreaterThanOrEqual(pad - 1e-9);
		expect(topLeft.sy).toBeGreaterThanOrEqual(pad - 1e-9);
		expect(bottomRight.sx).toBeLessThanOrEqual(VIEWPORT.width - pad + 1e-9);
		expect(bottomRight.sy).toBeLessThanOrEqual(VIEWPORT.height - pad + 1e-9);
		closeTo(topLeft.sx, VIEWPORT.width - bottomRight.sx, 1e-6);
		closeTo(topLeft.sy, VIEWPORT.height - bottomRight.sy, 1e-6);
	});
});

describe("zoomAtPoint", () => {
	it.each(GRIDS)("focus 直下のワールド座標が不変 (grid=%i)", (grid) => {
		const limits = scaleLimits(VIEWPORT, grid);
		let cam = fitCamera(VIEWPORT, grid);
		const focus = { sx: 200, sy: 350 };
		const before = worldFromScreen(cam, focus);
		cam = zoomAtPoint(cam, focus, 1.5, limits);
		const after = worldFromScreen(cam, focus);
		closeTo(after.wx, before.wx, 1e-6);
		closeTo(after.wy, before.wy, 1e-6);
	});

	it("上限・下限でクランプされる", () => {
		const grid = 46;
		const limits = scaleLimits(VIEWPORT, grid);
		const cam = fitCamera(VIEWPORT, grid);
		const zoomedIn = zoomAtPoint(cam, { sx: 0, sy: 0 }, 1e9, limits);
		expect(zoomedIn.scale).toBe(limits.maxScale);
		const zoomedOut = zoomAtPoint(cam, { sx: 0, sy: 0 }, 1e-9, limits);
		expect(zoomedOut.scale).toBe(limits.minScale);
	});

	it("倍率1でカメラが変わらない", () => {
		const grid = 31;
		const limits = scaleLimits(VIEWPORT, grid);
		const cam = fitCamera(VIEWPORT, grid);
		const same = zoomAtPoint(cam, { sx: 100, sy: 100 }, 1, limits);
		closeTo(same.scale, cam.scale);
		closeTo(same.tx, cam.tx);
		closeTo(same.ty, cam.ty);
	});
});

describe("scaleLimits", () => {
	it("下限は全体表示スケール・上限は maxCellPx", () => {
		const grid = 46;
		const limits = scaleLimits(VIEWPORT, grid, 80);
		closeTo(limits.minScale, fitCamera(VIEWPORT, grid).scale);
		expect(limits.maxScale).toBe(80);
	});

	it("極小ビューポートでも min <= max", () => {
		const limits = scaleLimits({ width: 10, height: 10 }, 1, 80);
		expect(limits.minScale).toBeLessThanOrEqual(limits.maxScale);
	});
});

describe("clampCamera", () => {
	const grid = 46;

	it("マップがビューポートより小さい → 中央固定", () => {
		const cam: Camera = { scale: 2, tx: -500, ty: 999 };
		const clamped = clampCamera(cam, VIEWPORT, grid);
		closeTo(clamped.tx, (VIEWPORT.width - grid * 2) / 2);
		closeTo(clamped.ty, (VIEWPORT.height - grid * 2) / 2);
	});

	it("マップが大きい → 端の外に余白が出ない範囲にクランプ", () => {
		const scale = 20;
		const mapPx = grid * scale;
		const tooFar: Camera = { scale, tx: 100, ty: -mapPx * 2 };
		const clamped = clampCamera(tooFar, VIEWPORT, grid);
		expect(clamped.tx).toBe(0);
		expect(clamped.ty).toBe(VIEWPORT.height - mapPx);
	});

	it("範囲内のカメラは変化しない", () => {
		const scale = 20;
		const cam: Camera = { scale, tx: -100, ty: -150 };
		const clamped = clampCamera(cam, VIEWPORT, grid);
		expect(clamped).toEqual(cam);
	});
});

describe("panBy / cellRect / backingSize", () => {
	it("panBy は平行移動のみ", () => {
		const cam: Camera = { scale: 10, tx: 5, ty: 6 };
		expect(panBy(cam, 3, -4)).toEqual({ scale: 10, tx: 8, ty: 2 });
	});

	it("cellRectOnScreen とセル中心座標が整合する", () => {
		const cam: Camera = { scale: 12, tx: 7, ty: -3 };
		const cell = { gx: 4, gy: 9 };
		const rect = cellRectOnScreen(cam, cell);
		const center = screenFromCellCenter(cam, cell);
		closeTo(rect.x + rect.size / 2, center.sx);
		closeTo(rect.y + rect.size / 2, center.sy);
		expect(rect.size).toBe(12);
	});

	it("backingSize は DPR を掛けて丸める", () => {
		expect(backingSize({ width: 390, height: 700 }, 3)).toEqual({
			width: 1170,
			height: 2100,
		});
		expect(backingSize({ width: 393.5, height: 100 }, 2)).toEqual({
			width: 787,
			height: 200,
		});
		expect(backingSize({ width: 0.1, height: 0.1 }, 1)).toEqual({
			width: 1,
			height: 1,
		});
	});
});
