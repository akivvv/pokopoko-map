// localStorage キャッシュ(DECISIONS §5)。
// `pokomap:cache:<roomId>` = { schemaVersion, roomId, savedAt, pins, pixels }。
// schemaVersion / roomId 不一致・壊れた JSON は黙って破棄する(マイグレーションは書かない)。
// 保存タイミング(変更後1秒 debounce + visibilitychange hidden)は mapSync 側が
// createCacheWriter を通じて制御する。

import type { Pin, PinId, RoomId } from "../domain/types";
import { isRecord, parsePinRecord, parsePixelRecord } from "./parse";

export const CACHE_SCHEMA_VERSION = 1;

export function cacheStorageKey(roomId: RoomId): string {
	return `pokomap:cache:${roomId}`;
}

export type CachedMap = {
	readonly pixels: Readonly<Record<string, string>>;
	readonly pins: readonly Pin[];
};

/** キャッシュを読み出す。不一致・破損は null(黙って破棄) */
export function loadCache(storage: Storage, roomId: RoomId): CachedMap | null {
	let parsed: unknown;
	try {
		const raw = storage.getItem(cacheStorageKey(roomId));
		if (raw === null) return null;
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(parsed)) return null;
	if (parsed.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
	if (parsed.roomId !== roomId) return null;
	// エントリ単位でも再検証する(localStorage は他コードからも書ける信頼できない入力)
	return {
		pixels: parsePixelRecord(parsed.pixels),
		pins: parsePinRecord(parsed.pins),
	};
}

export type CacheSource = {
	readonly pixels: Readonly<Record<string, string>>;
	readonly pins: Readonly<Record<PinId, Pin>>;
};

/** 現在の remote スライスを保存する。容量超過等の失敗は無視(キャッシュは補助) */
export function saveCache(
	storage: Storage,
	roomId: RoomId,
	source: CacheSource,
): void {
	try {
		storage.setItem(
			cacheStorageKey(roomId),
			JSON.stringify({
				schemaVersion: CACHE_SCHEMA_VERSION,
				roomId,
				savedAt: Date.now(),
				pixels: source.pixels,
				pins: source.pins,
			}),
		);
	} catch {
		// quota 超過・プライベートモード等。表示はサーバー購読が担うため無視してよい
	}
}

export type CacheWriter = {
	/** 変更を通知する(1秒 debounce で保存される) */
	readonly schedule: () => void;
	/** 直ちに保存する(visibilitychange hidden 用)。schedule 済みタイマーは破棄 */
	readonly flush: () => void;
	/** タイマーを破棄する(未保存の schedule は失われる) */
	readonly dispose: () => void;
};

export function createCacheWriter(
	storage: Storage,
	roomId: RoomId,
	read: () => CacheSource,
	debounceMs = 1000,
): CacheWriter {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const clear = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
	};
	const flush = () => {
		clear();
		saveCache(storage, roomId, read());
	};
	return {
		schedule: () => {
			clear();
			timer = setTimeout(flush, debounceMs);
		},
		flush,
		dispose: clear,
	};
}
