// canvas への純描画(DECISIONS §6: camera を受けて背景+セル+格子を blit するだけ)。
// 状態・DOM に依存しない。色は呼び出し側が CSS 変数(トークン)から解決して渡す
// (本ファイルに生の色値を書かない。DECISIONS §7)。

import type { Camera, Viewport } from "../domain/camera";
import { cellRectOnScreen, worldFromScreen } from "../domain/camera";
import type { CellKey, HexColor } from "../domain/types";
import { parseCellKey } from "../domain/types";

export type MapColors = {
	/** 地図地色(トークン解決済みの値) */
	readonly mapBg: string;
	/** 格子線色(トークン解決済みの値) */
	readonly gridLine: string;
};

export type DrawMapOptions = {
	readonly camera: Camera;
	readonly viewport: Viewport;
	readonly devicePixelRatio: number;
	readonly grid: number;
	readonly pixels: ReadonlyMap<CellKey, HexColor>;
	readonly colors: MapColors;
};

/** 1セルの表示pxがこれ未満なら格子線を省略する(縮小時の描画負荷・視認性対策) */
export const GRID_LINE_MIN_CELL_PX = 4;

/**
 * 背景単色 → セル塗り → 格子線 の順に blit する純描画。
 * DPR は先頭の setTransform で一度だけ適用し、以降は CSS px 座標系で描く。
 */
export function drawMap(
	ctx: CanvasRenderingContext2D,
	opts: DrawMapOptions,
): void {
	const { camera, viewport, devicePixelRatio, grid, pixels, colors } = opts;

	ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
	ctx.clearRect(0, 0, viewport.width, viewport.height);

	// 可視セル範囲にクリップして画面外の描画を省く
	const tl = worldFromScreen(camera, { sx: 0, sy: 0 });
	const br = worldFromScreen(camera, {
		sx: viewport.width,
		sy: viewport.height,
	});
	const gx0 = Math.max(0, Math.floor(tl.wx));
	const gy0 = Math.max(0, Math.floor(tl.wy));
	const gx1 = Math.min(grid, Math.ceil(br.wx));
	const gy1 = Math.min(grid, Math.ceil(br.wy));
	if (gx0 >= gx1 || gy0 >= gy1) return;

	const { scale, tx, ty } = camera;

	ctx.fillStyle = colors.mapBg;
	ctx.fillRect(
		gx0 * scale + tx,
		gy0 * scale + ty,
		(gx1 - gx0) * scale,
		(gy1 - gy0) * scale,
	);

	for (const [key, color] of pixels) {
		const cell = parseCellKey(key, grid);
		// 不正キー・グリッド範囲外は黙って捨てる(parseCellKey と同方針)
		if (!cell) continue;
		if (cell.gx < gx0 || cell.gx >= gx1 || cell.gy < gy0 || cell.gy >= gy1) {
			continue;
		}
		const rect = cellRectOnScreen(camera, cell);
		ctx.fillStyle = color;
		ctx.fillRect(rect.x, rect.y, rect.size, rect.size);
	}

	if (scale < GRID_LINE_MIN_CELL_PX) return;
	ctx.strokeStyle = colors.gridLine;
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let gx = gx0; gx <= gx1; gx++) {
		const sx = gx * scale + tx;
		ctx.moveTo(sx, gy0 * scale + ty);
		ctx.lineTo(sx, gy1 * scale + ty);
	}
	for (let gy = gy0; gy <= gy1; gy++) {
		const sy = gy * scale + ty;
		ctx.moveTo(gx0 * scale + tx, sy);
		ctx.lineTo(gx1 * scale + tx, sy);
	}
	ctx.stroke();
}
