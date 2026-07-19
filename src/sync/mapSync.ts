// RTDB 同期の中核(DECISIONS §5)。
// 起動シーケンス: キャッシュ即表示 → get() 一括取得で上書き → onChild* 差分購読。
// onValue のノード全体購読は禁止(meta のような小さい単一ノードのみ例外)。
// SDK 直結部分は RtdbAdapter として注入し、購読・エコー確認・キャッシュ保存の
// ロジックを Vitest でテスト可能にする(実アダプタは firebaseAdapter.ts)。

import type { CellKey, MapId, RoomId } from "../domain/types";
import type { MapStore, PixelPatch, RemoteEvent } from "../store";
import { createCacheWriter, loadCache } from "./cache";
import {
	isRecord,
	parseMapMeta,
	parsePin,
	parsePinRecord,
	parsePixelRecord,
} from "./parse";

export type Unsubscribe = () => void;

/**
 * RTDB SDK の薄い注入境界。path は DB ルートからの相対パス。
 * onChildAdded は購読開始時に既存の子全件を再生する(RTDB の仕様)。
 */
export type RtdbAdapter = {
	readonly get: (path: string) => Promise<unknown>;
	readonly update: (
		path: string,
		values: Readonly<Record<string, unknown>>,
	) => Promise<void>;
	readonly onChildAdded: (
		path: string,
		cb: (key: string, value: unknown) => void,
	) => Unsubscribe;
	readonly onChildChanged: (
		path: string,
		cb: (key: string, value: unknown) => void,
	) => Unsubscribe;
	readonly onChildRemoved: (
		path: string,
		cb: (key: string) => void,
	) => Unsubscribe;
	/** 小さな単一ノード(meta)専用。ノード全体購読の禁止(DECISIONS §5)に反する用途で使わないこと */
	readonly onValue: (path: string, cb: (value: unknown) => void) => Unsubscribe;
};

export type ConnectMapSyncOptions = {
	readonly adapter: RtdbAdapter;
	readonly store: MapStore;
	readonly roomId: RoomId;
	readonly mapId: MapId;
	/** 省略時はキャッシュなしで動く(テスト・SSR 用) */
	readonly storage?: Storage;
	readonly cacheDebounceMs?: number;
};

export type MapSync = {
	/** stroke/end のパッチを update() で送信する(null=セル消去。DECISIONS §5) */
	readonly sendPatch: (patch: PixelPatch) => void;
	/** 購読・キャッシュ保存・visibilitychange 監視をすべて解除する */
	readonly disconnect: () => void;
	/** 初期 get() の完了(失敗しても解決する。テスト・起動待ち用) */
	readonly ready: Promise<void>;
};

export function connectMapSync(opts: ConnectMapSyncOptions): MapSync {
	const { adapter, store, roomId, mapId, storage } = opts;
	const base = `rooms/${roomId}/maps/${mapId}`;
	const dispatchRemote = (event: RemoteEvent) =>
		store.getState().dispatchRemote(event);

	// --- 1. キャッシュ即表示(DECISIONS §5) ---
	if (storage) {
		const cached = loadCache(storage, roomId);
		if (cached !== null) {
			dispatchRemote({
				type: "snapshot/replaced",
				pixels: cached.pixels,
				pins: cached.pins,
			});
		}
	}

	// --- エコーバック確認: 送信済みパッチと同値のリモート反映で pending を解く ---
	// RTDB は自分の update() をローカル即時イベントとして返すため、
	// オンライン時はこれが実質「送信直後の pending クリア」になる
	const confirmIfEcho = (key: string, value: string | null) => {
		const { pending, dispatch } = store.getState();
		const cellKey = key as CellKey;
		if (cellKey in pending.patch && pending.patch[cellKey] === value) {
			dispatch({ type: "pending/confirm", keys: [cellKey] });
		}
	};

	// --- 3. 差分購読(get() 完了後に開始。間隙は onChildAdded の全件再生が埋める) ---
	const unsubscribes: Unsubscribe[] = [];
	const attach = () => {
		const onPixelUpsert =
			(type: "pixel/added" | "pixel/changed") =>
			(key: string, value: unknown) => {
				if (typeof value !== "string") return;
				dispatchRemote({ type, key, value });
				confirmIfEcho(key, value);
			};
		unsubscribes.push(
			adapter.onChildAdded(`${base}/pixels`, onPixelUpsert("pixel/added")),
			adapter.onChildChanged(`${base}/pixels`, onPixelUpsert("pixel/changed")),
			adapter.onChildRemoved(`${base}/pixels`, (key) => {
				dispatchRemote({ type: "pixel/removed", key });
				confirmIfEcho(key, null);
			}),
			adapter.onChildAdded(`${base}/pins`, (key, value) => {
				const pin = parsePin(key, value);
				if (pin !== null) dispatchRemote({ type: "pin/added", pin });
			}),
			adapter.onChildChanged(`${base}/pins`, (key, value) => {
				const pin = parsePin(key, value);
				if (pin !== null) dispatchRemote({ type: "pin/changed", pin });
			}),
			adapter.onChildRemoved(`${base}/pins`, (key) => {
				dispatchRemote({ type: "pin/removed", id: key });
			}),
			adapter.onValue(`${base}/meta`, (value) => {
				const meta = parseMapMeta(value);
				if (meta !== null) dispatchRemote({ type: "meta/changed", meta });
			}),
		);
	};

	// --- 2. get() 一括取得で上書き ---
	const ready = adapter
		.get(base)
		.then((value) => {
			const record = isRecord(value) ? value : {};
			// grid を先に反映してから snapshot を適用する(範囲検証が新 grid で行われる)
			const meta = parseMapMeta(record.meta);
			if (meta !== null) dispatchRemote({ type: "meta/changed", meta });
			dispatchRemote({
				type: "snapshot/replaced",
				pixels: parsePixelRecord(record.pixels),
				pins: parsePinRecord(record.pins),
			});
		})
		.catch((error: unknown) => {
			// 取得失敗(オフライン・権限なし等)でも購読は開始する。
			// キャッシュ/ローカル操作だけで使い続けられ、復帰後は再生イベントが埋める
			console.error("mapSync: 初期取得に失敗", error);
		})
		.then(attach);

	// --- キャッシュ保存: remote 変更後 1秒 debounce + visibilitychange(hidden) ---
	let disposeCache: () => void = () => {};
	if (storage) {
		const writer = createCacheWriter(
			storage,
			roomId,
			() => {
				const { pixels, pins } = store.getState().remote;
				return { pixels, pins };
			},
			opts.cacheDebounceMs,
		);
		const unsubscribeStore = store.subscribe((state, prev) => {
			if (state.remote !== prev.remote) writer.schedule();
		});
		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden") writer.flush();
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		disposeCache = () => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			unsubscribeStore();
			writer.dispose();
		};
	}

	return {
		sendPatch: (patch) => {
			if (Object.keys(patch).length === 0) return;
			adapter.update(`${base}/pixels`, patch).catch((error: unknown) => {
				// 失敗時はリトライしない(オフラインキューはスコープ外。DECISIONS §10)。
				// pending が残るため描いた内容は表示され続け、次の成功送信までズレは自分にだけ見える
				console.error("mapSync: パッチ送信に失敗", error);
			});
		},
		disconnect: () => {
			for (const unsubscribe of unsubscribes) unsubscribe();
			unsubscribes.length = 0;
			disposeCache();
		},
		ready,
	};
}
