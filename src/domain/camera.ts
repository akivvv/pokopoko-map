// カメラ(ズーム/パン)と座標変換の純関数群。
// - すべて CSS px の世界で計算する。devicePixelRatio は描画時の backingSize でのみ扱う
// - グリッドサイズは必ず引数で受ける(ハードコード禁止。DECISIONS §3)
// - screen = world * scale + t(scale = 1セルあたりの画面px)

import type { CellPos, ScreenPos, WorldPos } from "./types";

export type Camera = {
	/** 1グリッドセルあたりの画面px */
	readonly scale: number;
	readonly tx: number;
	readonly ty: number;
};

export type Viewport = { readonly width: number; readonly height: number };

export type ScaleLimits = {
	readonly minScale: number;
	readonly maxScale: number;
};

/** ズーム上限のデフォルト(1セルの最大表示px)。必要なら呼び出し側で上書き */
export const DEFAULT_MAX_CELL_PX = 80;
/** fitCamera の余白デフォルト(px) */
export const DEFAULT_FIT_PADDING = 16;

export function worldFromScreen(cam: Camera, s: ScreenPos): WorldPos {
	return { wx: (s.sx - cam.tx) / cam.scale, wy: (s.sy - cam.ty) / cam.scale };
}

export function screenFromWorld(cam: Camera, w: WorldPos): ScreenPos {
	return { sx: w.wx * cam.scale + cam.tx, sy: w.wy * cam.scale + cam.ty };
}

/**
 * 画面座標が指すセル。マップ外(0 <= g < grid を外れる)は null。
 * セル境界は左上端を含む(floor)。
 */
export function cellFromScreen(
	cam: Camera,
	grid: number,
	s: ScreenPos,
): CellPos | null {
	const w = worldFromScreen(cam, s);
	const gx = Math.floor(w.wx);
	const gy = Math.floor(w.wy);
	if (gx < 0 || gy < 0 || gx >= grid || gy >= grid) return null;
	return { gx, gy };
}

/** セルの画面上の矩形(canvas 描画・DOMピンの位置決め共用) */
export function cellRectOnScreen(
	cam: Camera,
	cell: CellPos,
): { readonly x: number; readonly y: number; readonly size: number } {
	return {
		x: cell.gx * cam.scale + cam.tx,
		y: cell.gy * cam.scale + cam.ty,
		size: cam.scale,
	};
}

export function screenFromCellCenter(cam: Camera, cell: CellPos): ScreenPos {
	return screenFromWorld(cam, { wx: cell.gx + 0.5, wy: cell.gy + 0.5 });
}

/** マップ全体(grid×grid)がパディング込みで収まる中央配置カメラ */
export function fitCamera(
	viewport: Viewport,
	grid: number,
	padding: number = DEFAULT_FIT_PADDING,
): Camera {
	const availW = Math.max(1, viewport.width - padding * 2);
	const availH = Math.max(1, viewport.height - padding * 2);
	const scale = Math.min(availW / grid, availH / grid);
	const mapPx = grid * scale;
	return {
		scale,
		tx: (viewport.width - mapPx) / 2,
		ty: (viewport.height - mapPx) / 2,
	};
}

/** ズーム可能範囲。下限=全体表示(fit)、上限=1セル maxCellPx */
export function scaleLimits(
	viewport: Viewport,
	grid: number,
	maxCellPx: number = DEFAULT_MAX_CELL_PX,
): ScaleLimits {
	const fit = fitCamera(viewport, grid);
	// マップが極端に小さい viewport でも min <= max を保証する
	const minScale = Math.min(fit.scale, maxCellPx);
	return { minScale, maxScale: maxCellPx };
}

function clampScale(scale: number, limits: ScaleLimits): number {
	return Math.min(limits.maxScale, Math.max(limits.minScale, scale));
}

/**
 * focus(画面上の点)の直下のワールド座標を動かさずに拡縮する。
 * ピンチ中心・ホイールカーソル位置を focus に渡す。
 */
export function zoomAtPoint(
	cam: Camera,
	focus: ScreenPos,
	factor: number,
	limits: ScaleLimits,
): Camera {
	const scale = clampScale(cam.scale * factor, limits);
	const ratio = scale / cam.scale;
	return {
		scale,
		tx: focus.sx - (focus.sx - cam.tx) * ratio,
		ty: focus.sy - (focus.sy - cam.ty) * ratio,
	};
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
	return { scale: cam.scale, tx: cam.tx + dx, ty: cam.ty + dy };
}

/**
 * カメラの平行移動を制限する:
 * - マップがビューポートより小さい軸 → 中央固定
 * - 大きい軸 → 端の外側に余白が出ない範囲にクランプ
 */
export function clampCamera(
	cam: Camera,
	viewport: Viewport,
	grid: number,
): Camera {
	const mapPx = grid * cam.scale;
	const clampAxis = (t: number, view: number): number => {
		if (mapPx <= view) return (view - mapPx) / 2;
		return Math.min(0, Math.max(view - mapPx, t));
	};
	return {
		scale: cam.scale,
		tx: clampAxis(cam.tx, viewport.width),
		ty: clampAxis(cam.ty, viewport.height),
	};
}

/** canvas のバッキングストア解像度(描画時のみ DPR を掛ける) */
export function backingSize(
	viewport: Viewport,
	devicePixelRatio: number,
): { readonly width: number; readonly height: number } {
	return {
		width: Math.max(1, Math.round(viewport.width * devicePixelRatio)),
		height: Math.max(1, Math.round(viewport.height * devicePixelRatio)),
	};
}
