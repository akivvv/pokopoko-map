// ストローク補間: 速いドラッグでセルが飛ばないように前点から補間する(DECISIONS §5)。
// Bresenham(8連結)。始点・終点を含み、隣接セル同士は各軸差が1以内になる。

import type { CellPos } from "./types";

export function cellsBetween(a: CellPos, b: CellPos): CellPos[] {
	const cells: CellPos[] = [];
	const dx = Math.abs(b.gx - a.gx);
	const dy = -Math.abs(b.gy - a.gy);
	const sx = a.gx < b.gx ? 1 : -1;
	const sy = a.gy < b.gy ? 1 : -1;
	let err = dx + dy;
	let gx = a.gx;
	let gy = a.gy;
	for (;;) {
		cells.push({ gx, gy });
		if (gx === b.gx && gy === b.gy) break;
		const e2 = 2 * err;
		if (e2 >= dy) {
			err += dy;
			gx += sx;
		}
		if (e2 <= dx) {
			err += dx;
			gy += sy;
		}
	}
	return cells;
}
