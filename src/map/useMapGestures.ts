// ジェスチャ → camera 操作への変換(DECISIONS §6: @use-gesture/react に委譲し、
// 生のポインタイベントを自前実装しない)。
// ストア非依存: camera と変更コールバックだけを受け、d3-zoom 等への差し替え境界を
// このフックに閉じる。座標変換は domain/camera の純関数を再利用する。

import { useGesture } from "@use-gesture/react";
import type { RefObject } from "react";
import type { Camera, Viewport } from "../domain/camera";
import {
	cellFromScreen,
	clampCamera,
	panBy,
	scaleLimits,
	zoomAtPoint,
} from "../domain/camera";
import type { CellPos, ScreenPos } from "../domain/types";

export type UseMapGesturesOptions = {
	readonly camera: Camera;
	readonly viewport: Viewport;
	readonly grid: number;
	readonly onCameraChange: (camera: Camera) => void;
	/** タップ(移動量が閾値未満の drag 終了)時にセル位置で呼ぶ。マップ外は呼ばない */
	readonly onTapCell?: (cell: CellPos) => void;
	/** ズーム上限(1セルの最大表示px)。省略時は domain のデフォルト */
	readonly maxCellPx?: number;
};

// ホイール1目盛りの拡縮を緩やかにする除数(2^(deltaY/除数) 倍)
const WHEEL_ZOOM_DIVISOR = 300;

/** client 座標 → 要素ローカル CSS px(camera は要素ローカルの世界で動く) */
function localPoint(
	el: HTMLElement | null,
	clientX: number,
	clientY: number,
): ScreenPos {
	if (!el) return { sx: clientX, sy: clientY };
	const rect = el.getBoundingClientRect();
	return { sx: clientX - rect.left, sy: clientY - rect.top };
}

/**
 * drag(パン)/ pinch / wheel(ズーム)/ tap(セル選択)を target 要素に接続する。
 * target 要素には CSS `touch-action: none` を指定すること(ブラウザ既定のスクロールと競合するため)。
 */
export function useMapGestures(
	targetRef: RefObject<HTMLElement | null>,
	opts: UseMapGesturesOptions,
): void {
	const { camera, viewport, grid, onCameraChange, onTapCell, maxCellPx } = opts;
	const limits = scaleLimits(viewport, grid, maxCellPx);

	useGesture(
		{
			onDrag: ({
				pinching,
				cancel,
				tap,
				movement: [mx, my],
				xy: [x, y],
				memo,
			}) => {
				// ピンチ中の指は drag に流さない(2本指はズーム専用)
				if (pinching) {
					cancel();
					return memo;
				}
				// memo にドラッグ開始時カメラを固定し、累積移動量で更新する
				// (親の状態反映が followされなくても deltaが失われない)
				const start: Camera = memo ?? camera;
				if (tap) {
					const cell = cellFromScreen(
						start,
						grid,
						localPoint(targetRef.current, x, y),
					);
					if (cell) onTapCell?.(cell);
					return start;
				}
				onCameraChange(clampCamera(panBy(start, mx, my), viewport, grid));
				return start;
			},
			onPinch: ({ movement: [ms], origin: [ox, oy], memo }) => {
				// ピンチ開始時カメラを memo に固定し、累積倍率 ms で拡縮する
				// (クランプが起きても開始点基準なので値が暴れない)
				const start: Camera = memo ?? camera;
				const focus = localPoint(targetRef.current, ox, oy);
				const next = zoomAtPoint(start, focus, ms, limits);
				onCameraChange(clampCamera(next, viewport, grid));
				return start;
			},
			onWheel: ({ event, delta: [, dy] }) => {
				// トラックパッドのピンチ(ctrl+wheel)は pinch 側が処理する
				if (event.ctrlKey) return;
				event.preventDefault();
				const factor = 2 ** (-dy / WHEEL_ZOOM_DIVISOR);
				const focus = localPoint(
					targetRef.current,
					event.clientX,
					event.clientY,
				);
				onCameraChange(
					clampCamera(
						zoomAtPoint(camera, focus, factor, limits),
						viewport,
						grid,
					),
				);
			},
		},
		{
			target: targetRef,
			// wheel の preventDefault に必要
			eventOptions: { passive: false },
			drag: { filterTaps: true },
		},
	);
}
