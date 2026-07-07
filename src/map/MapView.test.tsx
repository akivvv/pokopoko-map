// MapView の配線テスト: ResizeObserver 通知 → viewport 反映 → rAF バッチ → drawMap 実行。
// ブラウザ実機で検証しにくい経路(ヘッドレス環境は rAF が回らない)をここで固める。
// 描画内容そのものの検証は render.test.ts(drawMap 単体)が担う。

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewport } from "../domain/camera";
import { MapView } from "./MapView";

/** observe した要素へテストから手動で通知できる ResizeObserver スタブ */
class ResizeObserverStub {
	static instances: ResizeObserverStub[] = [];
	private readonly callback: ResizeObserverCallback;
	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		ResizeObserverStub.instances.push(this);
	}
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
	notify(width: number, height: number): void {
		this.callback(
			[{ contentRect: { width, height } } as ResizeObserverEntry],
			this as unknown as ResizeObserver,
		);
	}
}

describe("MapView", () => {
	let rafQueue: FrameRequestCallback[] = [];
	let ctxCalls: string[] = [];

	const flushFrames = (): void => {
		const queue = rafQueue;
		rafQueue = [];
		for (const cb of queue) cb(0);
	};

	beforeEach(() => {
		ResizeObserverStub.instances = [];
		rafQueue = [];
		ctxCalls = [];
		vi.stubGlobal("ResizeObserver", ResizeObserverStub);
		// rAF は同期実行にしない(scheduleDraw は戻り値の格納より後に
		// コールバックが走る前提のため)。キューに積んで flushFrames で流す
		vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number =>
			rafQueue.push(cb),
		);
		vi.stubGlobal("cancelAnimationFrame", () => {});
		// jsdom は 2D コンテキスト未実装なので、呼び出しだけ記録するダミーを返す
		const fakeCtx = new Proxy(
			{},
			{
				get:
					(_target, prop) =>
					(..._args: unknown[]) => {
						ctxCalls.push(String(prop));
					},
				set: () => true,
			},
		);
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
			fakeCtx as unknown as CanvasRenderingContext2D,
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function renderMapView(onViewportChange?: (viewport: Viewport) => void) {
		return render(
			<MapView
				grid={46}
				pixels={new Map()}
				pins={[]}
				camera={{ scale: 10, tx: 0, ty: 0 }}
				colors={{ mapBg: "#eeeeee", gridLine: "#dddddd" }}
				onCameraChange={() => {}}
				onViewportChange={onViewportChange}
			/>,
		);
	}

	it("リサイズ通知で viewport を親へ伝える", () => {
		const onViewportChange = vi.fn();
		renderMapView(onViewportChange);
		const observer = ResizeObserverStub.instances.at(-1);
		expect(observer).toBeDefined();
		act(() => observer?.notify(800, 600));
		expect(onViewportChange).toHaveBeenCalledWith({ width: 800, height: 600 });
	});

	it("リサイズ通知の後、rAF バッチで canvas をリサイズして描画する", () => {
		const { container } = renderMapView();
		const observer = ResizeObserverStub.instances.at(-1);
		act(() => observer?.notify(800, 600));
		act(() => flushFrames());

		const canvas = container.querySelector("canvas");
		expect(canvas).not.toBeNull();
		// jsdom の devicePixelRatio は 1 なので backing = viewport
		expect(canvas?.width).toBe(800);
		expect(canvas?.height).toBe(600);
		// drawMap が実行された証跡(DPR 変換と背景 blit)
		expect(ctxCalls).toContain("setTransform");
		expect(ctxCalls).toContain("fillRect");
	});

	it("viewport が未確定(0x0)の間は描画しない", () => {
		renderMapView();
		act(() => flushFrames());
		expect(ctxCalls).toHaveLength(0);
	});
});
