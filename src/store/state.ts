// 状態は「誰が書くか」で4スライスに分離する(DECISIONS §6 / STATE-DESIGN)。
//   remote:   onChild* ハンドラ(applyRemoteEvent)のみが書く。サーバーの写し
//   pending:  自分の操作(applyLocalAction)のみが書く。楽観的更新パッチ
//   ui:       UIコンポーネントが書く。モード・カメラ・選択中ピン
//   settings: 設定UIのみが書く(localStorage 同期は統合側の責務)
// ストローク中セルは DECISIONS §6「モード固有状態を variant の外に置かない」に従い
// ui.mode(draw variant)に保持し、表示合成では pending 扱いにする(selectors.ts)。

import type { Camera } from "../domain/camera";
import type { CellKey, HexColor, Mode, Pin, PinId } from "../domain/types";

/** RTDB の update() にそのまま渡せる形のパッチ(null=セル消去。DECISIONS §5) */
export type PixelPatch = Readonly<Record<CellKey, HexColor | null>>;

export type MapMeta = {
	/** グリッドサイズ。必ずここから取得する(46 ハードコード禁止。DECISIONS §3) */
	readonly grid: number;
};

export type RemoteSlice = {
	readonly pins: Readonly<Record<PinId, Pin>>;
	readonly pixels: Readonly<Record<CellKey, HexColor>>;
	readonly mapMeta: MapMeta;
};

export type PendingSlice = {
	/** ストローク確定済み・エコーバック未確認の楽観的更新パッチ */
	readonly patch: PixelPatch;
};

export type UiSlice = {
	readonly mode: Mode;
	readonly camera: Camera;
	readonly selectedPinId: PinId | null;
};

export type SettingsSlice = {
	/** 背景画像の表示 ON/OFF(端末ごと。DECISIONS §8) */
	readonly showImage: boolean;
	readonly nickname: string;
};

export type MapState = {
	readonly remote: RemoteSlice;
	readonly pending: PendingSlice;
	readonly ui: UiSlice;
	readonly settings: SettingsSlice;
};

export function createInitialState(
	grid: number,
	settings?: Partial<SettingsSlice>,
): MapState {
	return {
		remote: { pins: {}, pixels: {}, mapMeta: { grid } },
		pending: { patch: {} },
		ui: {
			mode: { kind: "view" },
			// 正しい初期カメラ(fitCamera)は viewport 確定後に UI 側が camera/set で入れる
			camera: { scale: 1, tx: 0, ty: 0 },
			selectedPinId: null,
		},
		settings: {
			showImage: false,
			nickname: "",
			...settings,
		},
	};
}
