// localStorage キャッシュの往復・破棄条件・debounce 保存(DECISIONS §5)。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pin } from "../domain/types";
import {
	CACHE_SCHEMA_VERSION,
	cacheStorageKey,
	createCacheWriter,
	loadCache,
	saveCache,
} from "./cache";

const ROOM = "room1";

function makePin(overrides?: Partial<Pin>): Pin {
	return {
		id: "pin1",
		pos: { gx: 3, gy: 4 },
		name: "すみか",
		emoji: "🏠",
		desc: "",
		parentId: null,
		residents: [25],
		authorId: "uid1",
		createdAt: 1000,
		...overrides,
	};
}

beforeEach(() => {
	localStorage.clear();
});

describe("saveCache / loadCache", () => {
	it("保存した pixels / pins が読み戻せる", () => {
		const pin = makePin();
		saveCache(localStorage, ROOM, {
			pixels: { "1,1": "#ff0000" },
			pins: { pin1: pin },
		});
		expect(loadCache(localStorage, ROOM)).toEqual({
			pixels: { "1,1": "#ff0000" },
			pins: [pin],
		});
	});

	it("キャッシュが無ければ null", () => {
		expect(loadCache(localStorage, ROOM)).toBeNull();
	});

	it("schemaVersion 不一致は黙って破棄する", () => {
		saveCache(localStorage, ROOM, { pixels: {}, pins: {} });
		const raw = JSON.parse(localStorage.getItem(cacheStorageKey(ROOM)) ?? "");
		raw.schemaVersion = CACHE_SCHEMA_VERSION + 1;
		localStorage.setItem(cacheStorageKey(ROOM), JSON.stringify(raw));
		expect(loadCache(localStorage, ROOM)).toBeNull();
	});

	it("roomId 不一致は黙って破棄する(別部屋のキャッシュを読まない)", () => {
		saveCache(localStorage, "other", {
			pixels: { "1,1": "#ff0000" },
			pins: {},
		});
		localStorage.setItem(
			cacheStorageKey(ROOM),
			localStorage.getItem(cacheStorageKey("other")) ?? "",
		);
		expect(loadCache(localStorage, ROOM)).toBeNull();
	});

	it("壊れた JSON・オブジェクト以外は黙って破棄する", () => {
		for (const raw of ["{broken", '"text"', "[1,2]", "null"]) {
			localStorage.setItem(cacheStorageKey(ROOM), raw);
			expect(loadCache(localStorage, ROOM)).toBeNull();
		}
	});

	it("エントリ単位で再検証する(不正ピン・非文字列ピクセルを捨てる)", () => {
		localStorage.setItem(
			cacheStorageKey(ROOM),
			JSON.stringify({
				schemaVersion: CACHE_SCHEMA_VERSION,
				roomId: ROOM,
				savedAt: 0,
				pixels: { "1,1": "#ff0000", "2,2": 42 },
				pins: { pin1: { name: "欠落だらけ" } },
			}),
		);
		expect(loadCache(localStorage, ROOM)).toEqual({
			pixels: { "1,1": "#ff0000" },
			pins: [],
		});
	});
});

describe("createCacheWriter", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("schedule は 1秒の debounce 後に read() の内容を保存する", () => {
		const writer = createCacheWriter(localStorage, ROOM, () => ({
			pixels: { "1,1": "#ff0000" },
			pins: {},
		}));
		writer.schedule();
		expect(loadCache(localStorage, ROOM)).toBeNull();
		vi.advanceTimersByTime(999);
		expect(loadCache(localStorage, ROOM)).toBeNull();
		vi.advanceTimersByTime(1);
		expect(loadCache(localStorage, ROOM)?.pixels).toEqual({
			"1,1": "#ff0000",
		});
	});

	it("連続 schedule は最後の1回にまとまる(タイマー再スタート)", () => {
		let reads = 0;
		const writer = createCacheWriter(localStorage, ROOM, () => {
			reads += 1;
			return { pixels: {}, pins: {} };
		});
		writer.schedule();
		vi.advanceTimersByTime(500);
		writer.schedule();
		vi.advanceTimersByTime(999);
		expect(reads).toBe(0);
		vi.advanceTimersByTime(1);
		expect(reads).toBe(1);
	});

	it("flush は直ちに保存し、保留中のタイマーを破棄する", () => {
		let reads = 0;
		const writer = createCacheWriter(localStorage, ROOM, () => {
			reads += 1;
			return { pixels: {}, pins: {} };
		});
		writer.schedule();
		writer.flush();
		expect(reads).toBe(1);
		vi.advanceTimersByTime(2000);
		expect(reads).toBe(1);
	});

	it("dispose 後は保留中の保存が走らない", () => {
		let reads = 0;
		const writer = createCacheWriter(localStorage, ROOM, () => {
			reads += 1;
			return { pixels: {}, pins: {} };
		});
		writer.schedule();
		writer.dispose();
		vi.advanceTimersByTime(2000);
		expect(reads).toBe(0);
	});
});
