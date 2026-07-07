import { describe, expect, it } from "vitest";
import type { Camera } from "../domain/camera";
import type { CellKey, HexColor } from "../domain/types";
import type { DrawMapOptions } from "./render";
import { drawMap, GRID_LINE_MIN_CELL_PX } from "./render";

// 呼び出し列を記録する軽量 canvas モック(プロパティ代入も1操作として記録)
type Op = readonly [name: string, ...args: unknown[]];

function createCtxMock(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
	const ops: Op[] = [];
	const record =
		(name: string) =>
		(...args: unknown[]) => {
			ops.push([name, ...args]);
		};
	const target: Record<string, unknown> = {
		setTransform: record("setTransform"),
		clearRect: record("clearRect"),
		fillRect: record("fillRect"),
		beginPath: record("beginPath"),
		moveTo: record("moveTo"),
		lineTo: record("lineTo"),
		stroke: record("stroke"),
	};
	for (const prop of ["fillStyle", "strokeStyle", "lineWidth"]) {
		let value: unknown;
		Object.defineProperty(target, prop, {
			get: () => value,
			set: (v: unknown) => {
				value = v;
				ops.push([`set:${prop}`, v]);
			},
		});
	}
	return { ctx: target as unknown as CanvasRenderingContext2D, ops };
}

const COLORS = { mapBg: "var-map-bg", gridLine: "var-grid-line" } as const;

function makeOpts(overrides: Partial<DrawMapOptions> = {}): DrawMapOptions {
	return {
		camera: { scale: 20, tx: 0, ty: 0 },
		viewport: { width: 200, height: 200 },
		devicePixelRatio: 1,
		grid: 10,
		pixels: new Map<CellKey, HexColor>(),
		colors: COLORS,
		...overrides,
	};
}

function opNames(ops: Op[]): string[] {
	return ops.map(([name]) => name);
}

describe("drawMap: DPR 変換", () => {
	it("先頭で一度だけ setTransform(dpr) を適用し、以降は CSS px で描く", () => {
		const { ctx, ops } = createCtxMock();
		drawMap(ctx, makeOpts({ devicePixelRatio: 2 }));
		expect(ops[0]).toEqual(["setTransform", 2, 0, 0, 2, 0, 0]);
		expect(opNames(ops).filter((n) => n === "setTransform")).toHaveLength(1);
		// clearRect はビューポートの CSS px 寸法(DPR を掛けない)
		expect(ops[1]).toEqual(["clearRect", 0, 0, 200, 200]);
	});
});

describe("drawMap: 描画順", () => {
	it("背景 → セル塗り → 格子線 の順", () => {
		const { ctx, ops } = createCtxMock();
		const pixels = new Map<CellKey, HexColor>([["3,4", "#ff0000"]]);
		drawMap(ctx, makeOpts({ pixels }));

		const names = opNames(ops);
		const bgIndex = ops.findIndex(
			([name, v]) => name === "set:fillStyle" && v === COLORS.mapBg,
		);
		const cellIndex = ops.findIndex(
			([name, v]) => name === "set:fillStyle" && v === "#ff0000",
		);
		const strokeIndex = names.indexOf("stroke");
		expect(bgIndex).toBeGreaterThanOrEqual(0);
		expect(cellIndex).toBeGreaterThan(bgIndex);
		expect(strokeIndex).toBeGreaterThan(cellIndex);
	});

	it("背景はマップ可視領域を地図地色で塗る", () => {
		const { ctx, ops } = createCtxMock();
		drawMap(ctx, makeOpts());
		// scale=20, grid=10 でビューポート 200x200 にちょうど一致
		const bgFill = ops[opNames(ops).indexOf("clearRect") + 2];
		expect(ops[2]).toEqual(["set:fillStyle", COLORS.mapBg]);
		expect(bgFill).toEqual(["fillRect", 0, 0, 200, 200]);
	});
});

describe("drawMap: セル塗り", () => {
	it("セルは cellRect の位置に色を塗る(camera 平行移動を反映)", () => {
		const { ctx, ops } = createCtxMock();
		const pixels = new Map<CellKey, HexColor>([["2,3", "#00ff00"]]);
		drawMap(ctx, makeOpts({ camera: { scale: 20, tx: 5, ty: 7 }, pixels }));
		const i = ops.findIndex(
			([name, v]) => name === "set:fillStyle" && v === "#00ff00",
		);
		expect(ops[i + 1]).toEqual(["fillRect", 2 * 20 + 5, 3 * 20 + 7, 20, 20]);
	});

	it("グリッド範囲外・不正キーのセルは描かない", () => {
		const { ctx, ops } = createCtxMock();
		const pixels = new Map<CellKey, HexColor>([
			["99,0", "#111111"],
			["0,10", "#222222"],
			["-1,0" as CellKey, "#333333"],
		]);
		drawMap(ctx, makeOpts({ pixels }));
		const cellFills = ops.filter(
			([name, v]) =>
				name === "set:fillStyle" && typeof v === "string" && v.startsWith("#"),
		);
		expect(cellFills).toHaveLength(0);
	});

	it("ビューポート外のセルはカリングされる", () => {
		const { ctx, ops } = createCtxMock();
		// tx=-100 で世界の x<5 が画面左外。gx=0 は描かれず gx=6 は描かれる
		const pixels = new Map<CellKey, HexColor>([
			["0,0", "#aa0000"],
			["6,0", "#00aa00"],
		]);
		drawMap(
			ctx,
			makeOpts({
				camera: { scale: 20, tx: -100, ty: 0 },
				viewport: { width: 100, height: 200 },
				pixels,
			}),
		);
		const fills = ops
			.filter(([name]) => name === "set:fillStyle")
			.map(([, v]) => v);
		expect(fills).not.toContain("#aa0000");
		expect(fills).toContain("#00aa00");
	});
});

describe("drawMap: 格子線", () => {
	it("全体可視時は (grid+1) 本ずつ縦横の線を1回の stroke で描く", () => {
		const { ctx, ops } = createCtxMock();
		drawMap(ctx, makeOpts());
		const names = opNames(ops);
		expect(names.filter((n) => n === "moveTo")).toHaveLength(11 * 2);
		expect(names.filter((n) => n === "stroke")).toHaveLength(1);
		expect(ops).toContainEqual(["set:strokeStyle", COLORS.gridLine]);
		expect(ops).toContainEqual(["set:lineWidth", 1]);
	});

	it("セルが小さいとき(閾値未満)は格子線を省略する", () => {
		const { ctx, ops } = createCtxMock();
		drawMap(
			ctx,
			makeOpts({
				camera: { scale: GRID_LINE_MIN_CELL_PX - 0.5, tx: 0, ty: 0 },
			}),
		);
		expect(opNames(ops)).not.toContain("stroke");
	});

	it("閾値ちょうどのスケールでは描く", () => {
		const { ctx, ops } = createCtxMock();
		drawMap(
			ctx,
			makeOpts({ camera: { scale: GRID_LINE_MIN_CELL_PX, tx: 0, ty: 0 } }),
		);
		expect(opNames(ops)).toContain("stroke");
	});

	it("可視範囲外の線はカリングされる", () => {
		const { ctx, ops } = createCtxMock();
		// 世界の x: 5..10 のみ可視 → 縦線は 6 本(5,6,...,10)
		drawMap(
			ctx,
			makeOpts({
				camera: { scale: 20, tx: -100, ty: 0 },
				viewport: { width: 100, height: 200 },
			}),
		);
		const verticals = ops.filter(
			([name, x]) => name === "moveTo" && typeof x === "number" && x >= 0,
		);
		// 縦6本 + 横11本(横線の moveTo の x は gx0*scale+tx=0)
		expect(opNames(ops).filter((n) => n === "moveTo")).toHaveLength(6 + 11);
		expect(verticals.length).toBeGreaterThanOrEqual(6);
	});
});

describe("drawMap: マップが完全に画面外", () => {
	it("クリア以外なにも描かない", () => {
		const { ctx, ops } = createCtxMock();
		const pixels = new Map<CellKey, HexColor>([["0,0", "#ff0000"]]);
		drawMap(
			ctx,
			makeOpts({ camera: { scale: 20, tx: -10000, ty: 0 }, pixels }),
		);
		expect(opNames(ops)).toEqual(["setTransform", "clearRect"]);
	});
});

describe("drawMap: 純関数性", () => {
	it("同じ入力で同じ呼び出し列になる(camera 不変)", () => {
		const camera: Camera = { scale: 15, tx: 3, ty: 4 };
		const pixels = new Map<CellKey, HexColor>([
			["1,1", "#123456"],
			["8,9", "#abcdef"],
		]);
		const a = createCtxMock();
		const b = createCtxMock();
		drawMap(a.ctx, makeOpts({ camera, pixels }));
		drawMap(b.ctx, makeOpts({ camera, pixels }));
		expect(a.ops).toEqual(b.ops);
		expect(camera).toEqual({ scale: 15, tx: 3, ty: 4 });
	});
});
