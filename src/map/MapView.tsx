// マップ表示の骨格: canvas(背景+セル+格子)+ DOM ピンオーバーレイ + ジェスチャ接続。
// 状態は持たず props で受ける(ストアとの統合は親が行う)。
// 描画は rAF バッチ: 同一フレーム内の複数更新を1回の drawMap に集約する(DECISIONS §6)。

import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Camera, Viewport } from "../domain/camera";
import { backingSize } from "../domain/camera";
import type { CellKey, CellPos, HexColor, Pin, PinId } from "../domain/types";
import { PinOverlay } from "./PinOverlay";
import type { DrawMapOptions, MapColors } from "./render";
import { drawMap } from "./render";
import { useMapGestures } from "./useMapGestures";

export type MapViewProps = {
	readonly grid: number;
	readonly pixels: ReadonlyMap<CellKey, HexColor>;
	readonly pins: readonly Pin[];
	readonly camera: Camera;
	/** CSS 変数(トークン)を解決した色を親が渡す(src/map に生の色値を持たせない) */
	readonly colors: MapColors;
	readonly onCameraChange: (camera: Camera) => void;
	readonly onTapCell?: (cell: CellPos) => void;
	readonly onPinClick?: (id: PinId) => void;
	/** ビューポート実寸の通知(親が fitCamera 等の初期化に使う) */
	readonly onViewportChange?: (viewport: Viewport) => void;
};

export function MapView({
	grid,
	pixels,
	pins,
	camera,
	colors,
	onCameraChange,
	onTapCell,
	onPinClick,
	onViewportChange,
}: MapViewProps): ReactElement {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
	const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);

	// ResizeObserver でビューポート追従(CSS px。DPR は描画時の backingSize でのみ扱う)
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			setViewport({
				width: entry.contentRect.width,
				height: entry.contentRect.height,
			});
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (viewport.width > 0 && viewport.height > 0) {
			onViewportChange?.(viewport);
		}
	}, [viewport, onViewportChange]);

	// DPR 変化(別モニタへの移動・ブラウザズーム)の追従
	useEffect(() => {
		const query = window.matchMedia(`(resolution: ${dpr}dppx)`);
		const onChange = () => setDpr(window.devicePixelRatio || 1);
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, [dpr]);

	// rAF コールバックは ref 経由で常に最新の描画入力を読む(古いフレームを描かない)
	const latestRef = useRef<DrawMapOptions | null>(null);
	const frameRef = useRef(0);
	const scheduleDraw = useCallback(() => {
		if (frameRef.current !== 0) return;
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = 0;
			const canvas = canvasRef.current;
			const opts = latestRef.current;
			if (!canvas || !opts) return;
			if (opts.viewport.width <= 0 || opts.viewport.height <= 0) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const backing = backingSize(opts.viewport, opts.devicePixelRatio);
			// バッキングストアの張り替えは canvas 全消去を伴うため寸法が変わったときだけ
			if (canvas.width !== backing.width) canvas.width = backing.width;
			if (canvas.height !== backing.height) canvas.height = backing.height;
			drawMap(ctx, opts);
		});
	}, []);

	useEffect(() => {
		latestRef.current = {
			camera,
			viewport,
			devicePixelRatio: dpr,
			grid,
			pixels,
			colors,
		};
		scheduleDraw();
	}, [camera, viewport, dpr, grid, pixels, colors, scheduleDraw]);

	useEffect(() => {
		return () => {
			if (frameRef.current !== 0) cancelAnimationFrame(frameRef.current);
		};
	}, []);

	useMapGestures(canvasRef, {
		camera,
		viewport,
		grid,
		onCameraChange,
		onTapCell,
	});

	return (
		<div
			ref={containerRef}
			style={{
				position: "relative",
				width: "100%",
				height: "100%",
				overflow: "hidden",
			}}
		>
			<canvas
				ref={canvasRef}
				style={{
					display: "block",
					width: "100%",
					height: "100%",
					// ブラウザ既定のタッチスクロールとジェスチャの競合防止
					touchAction: "none",
				}}
			/>
			<PinOverlay pins={pins} camera={camera} onPinClick={onPinClick} />
		</div>
	);
}
