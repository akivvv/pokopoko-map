import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import type { Camera, Viewport } from "./domain/camera";
import { fitCamera } from "./domain/camera";
import type { CellKey, CellPos, HexColor } from "./domain/types";
import { MapView } from "./map/MapView";
import type { MapColors } from "./map/render";
import type { MapStore } from "./store";
import { createMapStore, selectVisiblePixels, useMapStore } from "./store";
import type { MapSync } from "./sync";
import {
	connectMapSync,
	createFirebaseRtdbAdapter,
	ensureSignedIn,
	getDb,
} from "./sync";

/**
 * maps/<mapId>/meta.grid の初期値(DECISIONS §3: 初期46)。
 * フェーズ0はキャッシュ/サーバー未接続のため、meta を種まきする唯一の
 * ブートストラップ値としてここに置く(処理側は常に mapMeta.grid を参照する)。
 */
const INITIAL_GRID = 46;

/** 当面1マップ運用(DECISIONS §3。階層のみ確保) */
const MAP_ID = "main";

/**
 * 入室フロー(部屋一覧・招待コード。DECISIONS §8)実装までの暫定の固定部屋。
 * Security Rules はメンバーシップ制のため、dev では rooms/dev/members/<uid> を
 * コンソールから手動登録して使う(uid は起動時に console.info で出る)
 */
const ROOM_ID = "dev";

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

	// RTDB 同期: サインイン(暫定は匿名)→ 接続。失敗時はオフラインのまま動き続ける
	const syncRef = useRef<MapSync | null>(null);
	useEffect(() => {
		let disposed = false;
		let sync: MapSync | null = null;
		(async () => {
			let uid: string;
			try {
				uid = await ensureSignedIn();
			} catch (error) {
				console.error("pokomap: サインインに失敗(オフラインで続行)", error);
				return;
			}
			if (disposed) return;
			// dev: Security Rules のメンバー登録(rooms/dev/members/<uid>)に使う
			console.info(`pokomap: uid=${uid}`);
			sync = connectMapSync({
				adapter: createFirebaseRtdbAdapter(getDb()),
				store,
				roomId: ROOM_ID,
				mapId: MAP_ID,
				storage: localStorage,
			});
			syncRef.current = sync;
		})();
		return () => {
			disposed = true;
			syncRef.current = null;
			sync?.disconnect();
		};
	}, [store]);

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

	// draw モードではドラッグ(タップ含む)がストロークとして流れてくる。
	// stroke/end のパッチは RTDB へ送信し、エコーバック確認までは pending が表示を保つ。
	// 未接続(サインイン失敗等)なら送信されず pending が残る=ローカルでは描ける
	const handleStrokeStart = useCallback(
		(cell: CellPos) => {
			store.getState().dispatch({ type: "stroke/start", cell });
		},
		[store],
	);
	const handleStrokeMove = useCallback(
		(cell: CellPos) => {
			store.getState().dispatch({ type: "stroke/move", cell });
		},
		[store],
	);
	const handleStrokeEnd = useCallback(() => {
		const patch = store.getState().dispatch({ type: "stroke/end" });
		if (patch !== null) syncRef.current?.sendPatch(patch);
	}, [store]);
	const handleStrokeCancel = useCallback(() => {
		store.getState().dispatch({ type: "stroke/cancel" });
	}, [store]);

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
					drawing={mode.kind === "draw"}
					onStrokeStart={handleStrokeStart}
					onStrokeMove={handleStrokeMove}
					onStrokeEnd={handleStrokeEnd}
					onStrokeCancel={handleStrokeCancel}
					onViewportChange={handleViewportChange}
				/>
			</main>
		</div>
	);
}

export default App;
