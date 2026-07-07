import { useCallback, useMemo, useRef, useState } from "react";
import "./App.css";
import type { Camera, Viewport } from "./domain/camera";
import { fitCamera } from "./domain/camera";
import type { CellKey, CellPos, HexColor } from "./domain/types";
import { MapView } from "./map/MapView";
import type { MapColors } from "./map/render";
import type { MapStore } from "./store";
import { createMapStore, selectVisiblePixels, useMapStore } from "./store";

/**
 * maps/<mapId>/meta.grid の初期値(DECISIONS §3: 初期46)。
 * フェーズ0はキャッシュ/サーバー未接続のため、meta を種まきする唯一の
 * ブートストラップ値としてここに置く(処理側は常に mapMeta.grid を参照する)。
 */
const INITIAL_GRID = 46;

/** 当面1マップ運用(DECISIONS §3。階層のみ確保) */
const MAP_ID = "main";

/** ユーザーが塗る内容色の暫定パレット(UIトークンではなく地図の中身。旧版の色UI移植までの仮) */
const DEMO_PALETTE = [
	"#e0533d",
	"#3d7be0",
	"#3dbb6e",
	"#e8c53a",
] as const satisfies readonly HexColor[];

function resolveMapColors(): MapColors {
	const style = getComputedStyle(document.documentElement);
	return {
		mapBg: style.getPropertyValue("--color-map-bg").trim(),
		gridLine: style.getPropertyValue("--color-grid-line").trim(),
	};
}

function App() {
	const storeRef = useRef<MapStore | null>(null);
	if (storeRef.current === null) {
		storeRef.current = createMapStore(MAP_ID, { grid: INITIAL_GRID });
	}
	const store = storeRef.current;

	// フェーズ0は全スライス購読で十分。高頻度更新(pixels 差分)の canvas 直結購読
	// (store.subscribe + rAF)は Firebase 接続時に導入する
	const state = useMapStore(store, (s) => s);
	const [colors] = useState(resolveMapColors);

	const { mode, camera } = state.ui;
	const grid = state.remote.mapMeta.grid;

	const pixels = useMemo(
		() =>
			new Map(
				Object.entries(selectVisiblePixels(state)) as ReadonlyArray<
					[CellKey, HexColor]
				>,
			),
		[state],
	);
	const pins = useMemo(
		() => Object.values(state.remote.pins),
		[state.remote.pins],
	);

	const viewportSeenRef = useRef(false);
	const handleViewportChange = useCallback(
		(viewport: Viewport) => {
			// 初回のみ全体表示へフィット(以降のリサイズでユーザーのカメラを上書きしない)
			if (viewportSeenRef.current) return;
			viewportSeenRef.current = true;
			const { dispatch, remote } = store.getState();
			dispatch({
				type: "camera/set",
				camera: fitCamera(viewport, remote.mapMeta.grid),
			});
		},
		[store],
	);

	const handleCameraChange = useCallback(
		(next: Camera) => {
			store.getState().dispatch({ type: "camera/set", camera: next });
		},
		[store],
	);

	const handleTapCell = useCallback(
		(cell: CellPos) => {
			const { dispatch, ui } = store.getState();
			if (ui.mode.kind !== "draw") return;
			// フェーズ0はタップ1セルの塗り/消しのみ(ドラッグ描画はモード対応ジェスチャで後続)。
			// stroke/end のパッチは backend 未接続のため送信せず、pending が表示を保つ
			dispatch({ type: "stroke/start", cell });
			dispatch({ type: "stroke/end" });
		},
		[store],
	);

	return (
		<div className="app">
			<header className="toolbar">
				<h1 className="app-title">ぽこあポケモン 共有マップ</h1>
				<div className="toolbar-group">
					<button
						type="button"
						className="mode-button"
						aria-pressed={mode.kind === "view"}
						onClick={() =>
							store.getState().dispatch({ type: "mode/enterView" })
						}
					>
						見る
					</button>
					<button
						type="button"
						className="mode-button"
						aria-pressed={mode.kind === "draw"}
						onClick={() =>
							store.getState().dispatch({
								type: "mode/enterDraw",
								color: DEMO_PALETTE[0],
								tool: "paint",
							})
						}
					>
						描く
					</button>
				</div>
				{mode.kind === "draw" && (
					<div className="toolbar-group">
						{DEMO_PALETTE.map((color) => (
							<button
								key={color}
								type="button"
								className="swatch"
								style={{ background: color }}
								aria-label={`色 ${color}`}
								aria-pressed={mode.tool === "paint" && mode.color === color}
								onClick={() => {
									const { dispatch } = store.getState();
									dispatch({ type: "draw/setTool", tool: "paint" });
									dispatch({ type: "draw/setColor", color });
								}}
							/>
						))}
						<button
							type="button"
							className="mode-button"
							aria-pressed={mode.tool === "erase"}
							onClick={() =>
								store
									.getState()
									.dispatch({ type: "draw/setTool", tool: "erase" })
							}
						>
							消す
						</button>
					</div>
				)}
			</header>
			<main className="map-area">
				<MapView
					grid={grid}
					pixels={pixels}
					pins={pins}
					camera={camera}
					colors={colors}
					onCameraChange={handleCameraChange}
					onTapCell={handleTapCell}
					onViewportChange={handleViewportChange}
				/>
			</main>
		</div>
	);
}

export default App;
