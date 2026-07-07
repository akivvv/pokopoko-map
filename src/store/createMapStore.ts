// zustand vanilla store + React バインディング(DECISIONS §6 / STATE-DESIGN)。
// vanilla store にするのは canvas が React の再レンダリングを通さず
// store.subscribe + rAF バッチで直接再描画するため。React 側は useMapStore で購読する。
// remote/pending をファクトリにするのは複数マップ化・grid 可変に備えるため。

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { MapId } from "../domain/types";
import type { LocalAction } from "./applyLocalAction";
import { applyLocalAction } from "./applyLocalAction";
import type { RemoteEvent } from "./applyRemoteEvent";
import { applyRemoteEvent } from "./applyRemoteEvent";
import type { MapState, PixelPatch, SettingsSlice } from "./state";
import { createInitialState } from "./state";

export type MapStoreState = MapState & {
	readonly mapId: MapId;
	/** RTDB 購読ハンドラ専用。remote スライスだけを更新する */
	readonly dispatchRemote: (event: RemoteEvent) => void;
	/** UI 操作用。stroke/end のときだけ送信すべきパッチを返す */
	readonly dispatch: (action: LocalAction) => PixelPatch | null;
};

export type CreateMapStoreOptions = {
	/**
	 * mapMeta.grid の初期値。キャッシュ/サーバー(maps/<mapId>/meta.grid)由来の値を
	 * 必ず外から渡す(store 側にデフォルトを持つと 46 ハードコード禁止に反する)
	 */
	readonly grid: number;
	/** localStorage から復元した端末設定(統合側が渡す) */
	readonly settings?: Partial<SettingsSlice>;
};

export function createMapStore(mapId: MapId, options: CreateMapStoreOptions) {
	return createStore<MapStoreState>()((set, get) => ({
		mapId,
		...createInitialState(options.grid, options.settings),
		dispatchRemote: (event) => {
			set((state) => ({ remote: applyRemoteEvent(state.remote, event) }));
		},
		dispatch: (action) => {
			const result = applyLocalAction(get(), action);
			// applyLocalAction は remote を書かない契約なので remote は反映しない
			set({
				pending: result.state.pending,
				ui: result.state.ui,
				settings: result.state.settings,
			});
			return result.patch;
		},
	}));
}

export type MapStore = ReturnType<typeof createMapStore>;

/** React コンポーネント用バインディング(canvas は store.subscribe を直接使う) */
export function useMapStore<T>(
	store: MapStore,
	selector: (state: MapStoreState) => T,
): T {
	return useStore(store, selector);
}
