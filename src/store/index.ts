// store の公開API。統合側(App 等)はここから import する

export type { LocalAction, LocalActionResult } from "./applyLocalAction";
export { applyLocalAction } from "./applyLocalAction";
export type { RemoteEvent } from "./applyRemoteEvent";
export { applyRemoteEvent } from "./applyRemoteEvent";
export type {
	CreateMapStoreOptions,
	MapStore,
	MapStoreState,
} from "./createMapStore";
export { createMapStore, useMapStore } from "./createMapStore";
export {
	mergePixels,
	selectPendingCells,
	selectVisiblePixels,
} from "./selectors";
export type {
	MapMeta,
	MapState,
	PendingSlice,
	PixelPatch,
	RemoteSlice,
	SettingsSlice,
	UiSlice,
} from "./state";
export { createInitialState } from "./state";
