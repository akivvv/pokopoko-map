// ジェスチャ → camera / ストローク操作への変換(DECISIONS §6: @use-gesture/react に
// 委譲し、生のポインタイベントを自前実装しない)。
// ストア非依存: camera と変更コールバックだけを受け、d3-zoom 等への差し替え境界を
// このフックに閉じる。座標変換は domain/camera、draw モードのドラッグ判定は
// strokeDrag の純関数を再利用する。

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
import type { StrokeDragMemo } from "./strokeDrag";
import { strokeDragInit, strokeDragStep } from "./strokeDrag";

export type UseMapGesturesOptions = {
	readonly camera: Camera;
	readonly viewport: Viewport;
	readonly grid: number;
	readonly onCameraChange: (camera: Camera) => void;
	/**
	 * true のとき1本指ドラッグをパンではなくストロークに割り当てる(draw モード)。
	 * ピンチ・ホイールのズームはそのまま使える(2本指でパン+ズーム)
	 */
	readonly drawing?: boolean;
	/** タップ(移動量が閾値未満の drag 終了)時にセル位置で呼ぶ。drawing 中・マップ外は呼ばない */
	readonly onTapCell?: (cell: CellPos) => void;
	readonly onStrokeStart?: (cell: CellPos) => void;
	readonly onStrokeMove?: (cell: CellPos) => void;
	readonly onStrokeEnd?: () => void;
	readonly onStrokeCancel?: () => void;
	/** ズーム上限(1セルの最大表示px)。省略時は domain のデフォルト */
	readonly maxCellPx?: number;
};

// ホイール1目盛りの拡縮を緩やかにする除数(2^(deltaY/除数) 倍)
const WHEEL_ZOOM_DIVISOR = 300;

/** drag の memo。パンとストロークで持つものが違うためタグ付きで区別する */
type DragMemo =
	| { readonly kind: "pan"; readonly start: Camera }
	| { readonly kind: "stroke"; readonly stroke: StrokeDragMemo };

/** pinch の memo: 開始時カメラと開始時原点(指追従パンの基準) */
type PinchMemo = { readonly start: Camera; readonly origin: ScreenPos };

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
 * drag(パン or ストローク)/ pinch / wheel(ズーム)/ tap(セル選択)を
 * target 要素に接続する。
 * target 要素には CSS `touch-action: none` を指定すること(ブラウザ既定のスクロールと競合するため)。
 */
export function useMapGestures(
	targetRef: RefObject<HTMLElement | null>,
	opts: UseMapGesturesOptions,
): void {
	const {
		camera,
		viewport,
		grid,
		onCameraChange,
		drawing = false,
		onTapCell,
		onStrokeStart,
		onStrokeMove,
		onStrokeEnd,
		onStrokeCancel,
		maxCellPx,
	} = opts;
	const limits = scaleLimits(viewport, grid, maxCellPx);

	useGesture(
		{
			onDrag: ({
				pinching,
				cancel,
				canceled,
				tap,
				last,
				movement: [mx, my],
				xy: [x, y],
				memo,
			}): DragMemo => {
				const prev = memo as DragMemo | undefined;
				if (drawing) {
					// ストローク中はパンしないため camera は不変。毎イベント現在値で変換してよい
					const cell = cellFromScreen(
						camera,
						grid,
						localPoint(targetRef.current, x, y),
					);
					const step = strokeDragStep(
						prev?.kind === "stroke" ? prev.stroke : strokeDragInit,
						{ cell, pinching: pinching ?? false, canceled, last },
					);
					for (const action of step.actions) {
						if (action.type === "start") onStrokeStart?.(action.cell);
						else if (action.type === "move") onStrokeMove?.(action.cell);
						else if (action.type === "end") onStrokeEnd?.();
						else onStrokeCancel?.();
					}
					if (step.cancelDrag) cancel();
					return { kind: "stroke", stroke: step.memo };
				}
				// パン: memo にドラッグ開始時カメラを固定し、累積移動量で更新する
				// (親の状態反映が follow されなくても delta が失われない)
				const start = prev?.kind === "pan" ? prev.start : camera;
				// ピンチ中の指は drag に流さない(2本指はズーム専用)
				if (pinching) {
					cancel();
					return { kind: "pan", start };
				}
				if (tap) {
					const cell = cellFromScreen(
						start,
						grid,
						localPoint(targetRef.current, x, y),
					);
					if (cell) onTapCell?.(cell);
					return { kind: "pan", start };
				}
				onCameraChange(clampCamera(panBy(start, mx, my), viewport, grid));
				return { kind: "pan", start };
			},
			onPinch: ({ movement: [ms], origin: [ox, oy], memo }): PinchMemo => {
				// ピンチ開始時カメラ・原点を memo に固定し、累積倍率 ms で拡縮しつつ
				// 原点の移動分をパンとして加える(指の直下の地点が指に追従する)
				const focus = localPoint(targetRef.current, ox, oy);
				const start: PinchMemo = (memo as PinchMemo | undefined) ?? {
					start: camera,
					origin: focus,
				};
				const zoomed = zoomAtPoint(start.start, start.origin, ms, limits);
				const next = panBy(
					zoomed,
					focus.sx - start.origin.sx,
					focus.sy - start.origin.sy,
				);
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
			// drawing 中はタップ判定不要。ポインタダウン即ストローク開始で応答をよくする
			drag: { filterTaps: !drawing },
		},
	);
}
