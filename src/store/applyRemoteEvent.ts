// RTDB の差分購読(onChildAdded/Changed/Removed・meta 購読)を remote スライスへ
// 適用する純関数(DECISIONS §5, §6)。Vitest で単体テストするため副作用を持たない。
// 不正データは黙って捨てる: Rules の検証をすり抜けた・旧形式が混ざった場合でも
// クライアントを壊さないため(親コンポーネント側での通知等はしない)。

import type { CellKey, HexColor, Pin, PinId } from "../domain/types";
import { cellKey, isValidHexColor, parseCellKey } from "../domain/types";
import type { MapMeta, RemoteSlice } from "./state";

export type RemoteEvent =
	| {
			readonly type: "pixel/added";
			readonly key: string;
			readonly value: string;
	  }
	| {
			readonly type: "pixel/changed";
			readonly key: string;
			readonly value: string;
	  }
	| { readonly type: "pixel/removed"; readonly key: string }
	| { readonly type: "pin/added"; readonly pin: Pin }
	| { readonly type: "pin/changed"; readonly pin: Pin }
	| { readonly type: "pin/removed"; readonly id: PinId }
	| { readonly type: "meta/changed"; readonly meta: MapMeta }
	| {
			/**
			 * 起動シーケンスの一括上書き(DECISIONS §5: キャッシュ即表示 → get() で上書き)。
			 * remote の pixels/pins を丸ごと置き換える(キャッシュにだけある削除済みセルを消すため
			 * 差分イベントでは代替できない)。grid を変える場合は先に meta/changed を適用すること
			 */
			readonly type: "snapshot/replaced";
			readonly pixels: Readonly<Record<string, string>>;
			readonly pins: readonly Pin[];
	  };

export function applyRemoteEvent(
	remote: RemoteSlice,
	event: RemoteEvent,
): RemoteSlice {
	switch (event.type) {
		case "pixel/added":
		case "pixel/changed": {
			const cell = parseCellKey(event.key, remote.mapMeta.grid);
			if (cell === null || !isValidHexColor(event.value)) return remote;
			const key = cellKey(cell);
			// 同値なら参照を維持する(subscribe 側の無駄な再描画を避ける)
			if (remote.pixels[key] === event.value) return remote;
			return { ...remote, pixels: { ...remote.pixels, [key]: event.value } };
		}
		case "pixel/removed": {
			const cell = parseCellKey(event.key, remote.mapMeta.grid);
			if (cell === null) return remote;
			const key = cellKey(cell);
			if (!(key in remote.pixels)) return remote;
			const pixels = { ...remote.pixels };
			delete pixels[key];
			return { ...remote, pixels };
		}
		case "pin/added":
		case "pin/changed": {
			// 座標の検証は parseCellKey に一元化する(非整数・負数・範囲外を弾く)
			if (parseCellKey(cellKey(event.pin.pos), remote.mapMeta.grid) === null) {
				return remote;
			}
			return {
				...remote,
				pins: { ...remote.pins, [event.pin.id]: event.pin },
			};
		}
		case "pin/removed": {
			if (!(event.id in remote.pins)) return remote;
			const pins = { ...remote.pins };
			delete pins[event.id];
			return { ...remote, pins };
		}
		case "meta/changed": {
			if (!Number.isSafeInteger(event.meta.grid) || event.meta.grid <= 0) {
				return remote;
			}
			if (remote.mapMeta.grid === event.meta.grid) return remote;
			return { ...remote, mapMeta: { grid: event.meta.grid } };
		}
		case "snapshot/replaced": {
			// エントリ単位の検証は差分イベントと同一基準(不正データは黙って捨てる)
			const pixels: Record<CellKey, HexColor> = {};
			for (const [key, value] of Object.entries(event.pixels)) {
				const cell = parseCellKey(key, remote.mapMeta.grid);
				if (cell === null || !isValidHexColor(value)) continue;
				pixels[cellKey(cell)] = value;
			}
			const pins: Record<PinId, Pin> = {};
			for (const pin of event.pins) {
				if (parseCellKey(cellKey(pin.pos), remote.mapMeta.grid) === null) {
					continue;
				}
				pins[pin.id] = pin;
			}
			return { ...remote, pixels, pins };
		}
	}
}
