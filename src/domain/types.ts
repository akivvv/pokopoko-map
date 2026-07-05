// 座標3系統とドメイン型の定義(DECISIONS §3, §6)。
// 座標はプロパティ名を変えて構造的に混用不能にしている:
//   ScreenPos(sx,sy) = 画面CSS px / WorldPos(wx,wy) = グリッド単位の連続座標 / CellPos(gx,gy) = 整数セル

export type ScreenPos = { readonly sx: number; readonly sy: number };
export type WorldPos = { readonly wx: number; readonly wy: number };
export type CellPos = { readonly gx: number; readonly gy: number };

/** RTDB の pixels キー形式 "gx,gy" */
export type CellKey = `${number},${number}`;

export type HexColor = `#${string}`;

export type RoomId = string;
export type MapId = string;
export type PinId = string;
export type Uid = string;
/** 図鑑No */
export type PokemonNo = number;

/** 入れ物のネスト上限(自身を含まない深さ。DECISIONS §3) */
export const MAX_PIN_NEST = 2;

/** ピン=「入れ物」+「中身(ポケモンのみ)」の統一モデル(DECISIONS §3) */
export type Pin = {
	readonly id: PinId;
	readonly pos: CellPos;
	readonly name: string;
	readonly emoji: string;
	readonly desc: string;
	readonly parentId: PinId | null;
	readonly residents: readonly PokemonNo[];
	readonly authorId: Uid;
	readonly createdAt: number;
};

export type PinDraft = {
	readonly pos: CellPos;
	readonly name: string;
	readonly emoji: string;
	readonly desc: string;
	readonly parentId: PinId | null;
};

export type DrawTool = "paint" | "erase";

/** モード=判別可能ユニオン。モード固有の状態は variant の外に置かない(DECISIONS §6) */
export type Mode =
	| { readonly kind: "view" }
	| { readonly kind: "pin"; readonly draft: PinDraft | null }
	| {
			readonly kind: "draw";
			readonly color: HexColor;
			readonly tool: DrawTool;
			/** ストローク中の pending セル(null=消去)。ストローク外は null */
			readonly stroke: ReadonlyMap<CellKey, HexColor | null> | null;
	  };

export function cellKey(cell: CellPos): CellKey {
	return `${cell.gx},${cell.gy}`;
}

const CELL_KEY_RE = /^(0|[1-9]\d*),(0|[1-9]\d*)$/;

/**
 * RTDB から来たキーの検証付きパース。
 * 形式不正・グリッド範囲外(0 <= g < grid)は null(不正データは黙って捨てる)。
 */
export function parseCellKey(key: string, grid: number): CellPos | null {
	const m = CELL_KEY_RE.exec(key);
	if (!m || m[1] === undefined || m[2] === undefined) return null;
	const gx = Number(m[1]);
	const gy = Number(m[2]);
	if (!Number.isSafeInteger(gx) || !Number.isSafeInteger(gy)) return null;
	if (gx < 0 || gy < 0 || gx >= grid || gy >= grid) return null;
	return { gx, gy };
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** pixels の値として妥当な "#rrggbb" か(Rules 側の .validate と対で使う) */
export function isValidHexColor(value: string): value is HexColor {
	return HEX_COLOR_RE.test(value);
}
