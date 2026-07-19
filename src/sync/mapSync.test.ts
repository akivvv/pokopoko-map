// connectMapSync: 起動シーケンス(キャッシュ→get→差分購読)・エコーバック確認・
// パッチ送信・キャッシュ保存・切断(DECISIONS §5)。RTDB は fake アダプタで再現する。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HexColor } from "../domain/types";
import { createMapStore, type MapStore } from "../store";
import { loadCache, saveCache } from "./cache";
import { connectMapSync, type RtdbAdapter, type Unsubscribe } from "./mapSync";

const ROOM = "room1";
const MAP = "main";
const GRID = 20;
const BASE = `rooms/${ROOM}/maps/${MAP}`;
const RED: HexColor = "#e0533d";

type ChildHandler = (key: string, value: unknown) => void;
type RemovedHandler = (key: string) => void;
type ValueHandler = (value: unknown) => void;

/** 手動でイベントを流し込める fake アダプタ */
function createFakeAdapter(initial: unknown = null) {
	const added = new Map<string, ChildHandler[]>();
	const changed = new Map<string, ChildHandler[]>();
	const removed = new Map<string, RemovedHandler[]>();
	const values = new Map<string, ValueHandler[]>();
	const updates: Array<{ path: string; values: Record<string, unknown> }> = [];
	let resolveGet: (value: unknown) => void = () => {};
	let rejectGet: (error: unknown) => void = () => {};
	const getPromise = new Promise<unknown>((resolve, reject) => {
		resolveGet = resolve;
		rejectGet = reject;
	});

	const push = <T>(map: Map<string, T[]>, path: string, cb: T): Unsubscribe => {
		const list = map.get(path) ?? [];
		list.push(cb);
		map.set(path, list);
		return () => {
			const current = map.get(path) ?? [];
			map.set(
				path,
				current.filter((item) => item !== cb),
			);
		};
	};

	const adapter: RtdbAdapter = {
		get: () => getPromise,
		update: (path, patch) => {
			updates.push({ path, values: { ...patch } });
			// RTDB のローカル即時イベント(latency compensation)を模倣する
			for (const [key, value] of Object.entries(patch)) {
				if (value === null) {
					for (const cb of removed.get(path) ?? []) cb(key);
				} else {
					for (const cb of added.get(path) ?? []) cb(key, value);
				}
			}
			return Promise.resolve();
		},
		onChildAdded: (path, cb) => push(added, path, cb),
		onChildChanged: (path, cb) => push(changed, path, cb),
		onChildRemoved: (path, cb) => push(removed, path, cb),
		onValue: (path, cb) => push(values, path, cb),
	};

	return {
		adapter,
		updates,
		resolveGet: (value: unknown = initial) => resolveGet(value),
		rejectGet: (error: unknown) => rejectGet(error),
		emitAdded: (path: string, key: string, value: unknown) => {
			for (const cb of added.get(path) ?? []) cb(key, value);
		},
		emitChanged: (path: string, key: string, value: unknown) => {
			for (const cb of changed.get(path) ?? []) cb(key, value);
		},
		emitRemoved: (path: string, key: string) => {
			for (const cb of removed.get(path) ?? []) cb(key);
		},
		emitValue: (path: string, value: unknown) => {
			for (const cb of values.get(path) ?? []) cb(value);
		},
		subscriberCount: () =>
			[added, changed, removed, values]
				.flatMap((map) => [...map.values()])
				.reduce((sum, list) => sum + list.length, 0),
	};
}

function makeStore(): MapStore {
	return createMapStore(MAP, { grid: GRID });
}

beforeEach(() => {
	localStorage.clear();
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe("起動シーケンス", () => {
	it("キャッシュを即表示し、get() の結果で上書きし、差分購読を開始する", async () => {
		saveCache(localStorage, ROOM, {
			pixels: { "1,1": "#111111", "9,9": "#999999" },
			pins: {},
		});
		const store = makeStore();
		const fake = createFakeAdapter();
		const sync = connectMapSync({
			adapter: fake.adapter,
			store,
			roomId: ROOM,
			mapId: MAP,
			storage: localStorage,
		});
		// キャッシュが先に見えている
		expect(store.getState().remote.pixels).toEqual({
			"1,1": "#111111",
			"9,9": "#999999",
		});
		// サーバーでは 9,9 が消され 2,2 が増えている → get() で丸ごと置き換わる
		fake.resolveGet({
			meta: { grid: GRID },
			pixels: { "1,1": "#111111", "2,2": "#222222" },
		});
		await sync.ready;
		expect(store.getState().remote.pixels).toEqual({
			"1,1": "#111111",
			"2,2": "#222222",
		});
		// 購読は get() 完了後に開始される
		expect(fake.subscriberCount()).toBe(7);
		sync.disconnect();
	});

	it("get() の meta.grid を snapshot より先に反映する(広い grid の座標を捨てない)", async () => {
		const store = makeStore();
		const fake = createFakeAdapter();
		const sync = connectMapSync({
			adapter: fake.adapter,
			store,
			roomId: ROOM,
			mapId: MAP,
		});
		fake.resolveGet({
			meta: { grid: GRID + 10 },
			pixels: { [`${GRID},0`]: "#222222" },
		});
		await sync.ready;
		expect(store.getState().remote.mapMeta.grid).toBe(GRID + 10);
		expect(store.getState().remote.pixels[`${GRID},0`]).toBe("#222222");
		sync.disconnect();
	});

	it("get() が失敗しても購読は開始する(オフライン・権限なしでも使い続けられる)", async () => {
		const store = makeStore();
		const fake = createFakeAdapter();
		const sync = connectMapSync({
			adapter: fake.adapter,
			store,
			roomId: ROOM,
			mapId: MAP,
		});
		fake.rejectGet(new Error("permission denied"));
		await sync.ready;
		expect(fake.subscriberCount()).toBe(7);
		sync.disconnect();
	});
});

describe("差分購読 → dispatchRemote", () => {
	async function connected() {
		const store = makeStore();
		const fake = createFakeAdapter();
		const sync = connectMapSync({
			adapter: fake.adapter,
			store,
			roomId: ROOM,
			mapId: MAP,
		});
		fake.resolveGet(null);
		await sync.ready;
		return { store, fake, sync };
	}

	it("pixels の added/changed/removed が remote に反映される", async () => {
		const { store, fake, sync } = await connected();
		fake.emitAdded(`${BASE}/pixels`, "1,1", "#111111");
		fake.emitChanged(`${BASE}/pixels`, "1,1", "#222222");
		expect(store.getState().remote.pixels).toEqual({ "1,1": "#222222" });
		fake.emitRemoved(`${BASE}/pixels`, "1,1");
		expect(store.getState().remote.pixels).toEqual({});
		sync.disconnect();
	});

	it("pins の added/changed/removed が remote に反映され、不正ピンは捨てる", async () => {
		const { store, fake, sync } = await connected();
		const raw = {
			pos: { gx: 3, gy: 4 },
			name: "すみか",
			emoji: "🏠",
			authorId: "uid1",
			createdAt: 1000,
		};
		fake.emitAdded(`${BASE}/pins`, "pin1", raw);
		fake.emitAdded(`${BASE}/pins`, "broken", { name: "だけ" });
		expect(Object.keys(store.getState().remote.pins)).toEqual(["pin1"]);
		fake.emitChanged(`${BASE}/pins`, "pin1", { ...raw, name: "改名" });
		expect(store.getState().remote.pins.pin1?.name).toBe("改名");
		fake.emitRemoved(`${BASE}/pins`, "pin1");
		expect(store.getState().remote.pins).toEqual({});
		sync.disconnect();
	});

	it("meta の onValue で grid が変わる", async () => {
		const { store, fake, sync } = await connected();
		fake.emitValue(`${BASE}/meta`, { grid: 64 });
		expect(store.getState().remote.mapMeta.grid).toBe(64);
		fake.emitValue(`${BASE}/meta`, "broken");
		expect(store.getState().remote.mapMeta.grid).toBe(64);
		sync.disconnect();
	});

	it("非文字列の pixel 値は無視する", async () => {
		const { store, fake, sync } = await connected();
		fake.emitAdded(`${BASE}/pixels`, "1,1", 42);
		expect(store.getState().remote.pixels).toEqual({});
		sync.disconnect();
	});
});

describe("パッチ送信とエコーバック確認", () => {
	function draw(store: MapStore, cells: ReadonlyArray<[number, number]>) {
		const { dispatch } = store.getState();
		dispatch({ type: "mode/enterDraw", color: RED, tool: "paint" });
		const [first, ...rest] = cells;
		if (!first) throw new Error("cells must not be empty");
		dispatch({ type: "stroke/start", cell: { gx: first[0], gy: first[1] } });
		for (const [gx, gy] of rest) {
			dispatch({ type: "stroke/move", cell: { gx, gy } });
		}
		return store.getState().dispatch({ type: "stroke/end" });
	}

	it("sendPatch は pixels への update() になり、ローカルエコーで pending が解ける", async () => {
		const store = makeStore();
		const fake = createFakeAdapter();
		const sync = connectMapSync({
			adapter: fake.adapter,
			store,
			roomId: ROOM,
			mapId: MAP,
		});
		fake.resolveGet(null);
		await sync.ready;

		const patch = draw(store, [
			[1, 1],
			[1, 2],
		]);
		expect(patch).toEqual({ "1,1": RED, "1,2": RED });
		expect(store.getState().pending.patch).toEqual(patch);

		sync.sendPatch(patch ?? {});
		expect(fake.updates).toEqual([
			{ path: `${BASE}/pixels`, values: { "1,1": RED, "1,2": RED } },
		]);
		// fake の update はローカル即時イベントを流す → エコー確認で pending が空になり
		// remote に同じ内容が入っている(表示は変わらない)
		expect(store.getState().pending.patch).toEqual({});
		expect(store.getState().remote.pixels).toEqual({ "1,1": RED, "1,2": RED });
		sync.disconnect();
	});

	it("消しゴムの null パッチは removed エコーで pending が解ける", async () => {
		const store = makeStore();
		const fake = createFakeAdapter();
		const sync = connectMapSync({
			adapter: fake.adapter,
			store,
			roomId: ROOM,
			mapId: MAP,
		});
		fake.resolveGet({ pixels: { "1,1": "#111111" } });
		await sync.ready;

		const { dispatch } = store.getState();
		dispatch({ type: "mode/enterDraw", color: RED, tool: "erase" });
		dispatch({ type: "stroke/start", cell: { gx: 1, gy: 1 } });
		const patch = store.getState().dispatch({ type: "stroke/end" });
		expect(patch).toEqual({ "1,1": null });

		sync.sendPatch(patch ?? {});
		expect(store.getState().pending.patch).toEqual({});
		expect(store.getState().remote.pixels).toEqual({});
		sync.disconnect();
	});

	it("他人の変更ではストローク済み pending を解かない(値が違うエコーは無視)", async () => {
		const store = makeStore();
		const fake = createFakeAdapter();
		const sync = connectMapSync({
			adapter: fake.adapter,
			store,
			roomId: ROOM,
			mapId: MAP,
		});
		fake.resolveGet(null);
		await sync.ready;

		draw(store, [[1, 1]]);
		// 送信前に他人が同じセルを別色にした
		fake.emitAdded(`${BASE}/pixels`, "1,1", "#123456");
		expect(store.getState().pending.patch).toEqual({ "1,1": RED });
		// 表示は pending(自分の色)が勝つ
		expect(store.getState().remote.pixels).toEqual({ "1,1": "#123456" });
		sync.disconnect();
	});

	it("空パッチは送信しない", async () => {
		const store = makeStore();
		const fake = createFakeAdapter();
		const sync = connectMapSync({
			adapter: fake.adapter,
			store,
			roomId: ROOM,
			mapId: MAP,
		});
		fake.resolveGet(null);
		await sync.ready;
		sync.sendPatch({});
		expect(fake.updates).toEqual([]);
		sync.disconnect();
	});
});

describe("キャッシュ保存", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("remote 変更の 1秒後にキャッシュが保存される", async () => {
		const store = makeStore();
		const fake = createFakeAdapter();
		const sync = connectMapSync({
			adapter: fake.adapter,
			store,
			roomId: ROOM,
			mapId: MAP,
			storage: localStorage,
		});
		fake.resolveGet(null);
		await sync.ready;

		fake.emitAdded(`${BASE}/pixels`, "1,1", "#111111");
		expect(loadCache(localStorage, ROOM)).toBeNull();
		vi.advanceTimersByTime(1000);
		expect(loadCache(localStorage, ROOM)?.pixels).toEqual({
			"1,1": "#111111",
		});
		sync.disconnect();
	});

	it("visibilitychange(hidden) で直ちに保存される", async () => {
		const store = makeStore();
		const fake = createFakeAdapter();
		const sync = connectMapSync({
			adapter: fake.adapter,
			store,
			roomId: ROOM,
			mapId: MAP,
			storage: localStorage,
		});
		fake.resolveGet(null);
		await sync.ready;

		fake.emitAdded(`${BASE}/pixels`, "1,1", "#111111");
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			get: () => "hidden",
		});
		document.dispatchEvent(new Event("visibilitychange"));
		expect(loadCache(localStorage, ROOM)?.pixels).toEqual({
			"1,1": "#111111",
		});
		sync.disconnect();
	});
});

describe("disconnect", () => {
	it("購読がすべて解除され、以降のイベントは反映されない", async () => {
		const store = makeStore();
		const fake = createFakeAdapter();
		const sync = connectMapSync({
			adapter: fake.adapter,
			store,
			roomId: ROOM,
			mapId: MAP,
		});
		fake.resolveGet(null);
		await sync.ready;
		expect(fake.subscriberCount()).toBe(7);
		sync.disconnect();
		expect(fake.subscriberCount()).toBe(0);
		fake.emitAdded(`${BASE}/pixels`, "1,1", "#111111");
		expect(store.getState().remote.pixels).toEqual({});
	});
});
