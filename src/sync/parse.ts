// RTDB / localStorage キャッシュ由来の unknown 値をドメイン型へ検証変換する。
// 方針は applyRemoteEvent と同じく「不正データは黙って捨てる」(Rules をすり抜けた・
// 旧形式が混ざった場合でもクライアントを壊さない)。
// グリッド範囲の検証はここでは行わない(grid に依存する検証は applyRemoteEvent に一元化)。

import type { Pin, PokemonNo } from "../domain/types";
import type { MapMeta } from "../store";

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInt(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** residents の要素として妥当な図鑑No(正の整数)だけを残す */
function parseResidents(value: unknown): readonly PokemonNo[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(no): no is PokemonNo =>
			typeof no === "number" && Number.isSafeInteger(no) && no > 0,
	);
}

/**
 * pins/<id> の値1件を Pin に変換する。必須フィールドの欠落・型不一致は null。
 * desc / parentId / residents は RTDB が空値を保存しないため欠落を既定値に倒す。
 */
export function parsePin(id: string, value: unknown): Pin | null {
	if (id === "" || !isRecord(value)) return null;
	const pos = value.pos;
	if (
		!isRecord(pos) ||
		!isNonNegativeInt(pos.gx) ||
		!isNonNegativeInt(pos.gy)
	) {
		return null;
	}
	if (typeof value.name !== "string" || typeof value.emoji !== "string") {
		return null;
	}
	if (
		typeof value.authorId !== "string" ||
		typeof value.createdAt !== "number"
	) {
		return null;
	}
	const parentId = typeof value.parentId === "string" ? value.parentId : null;
	return {
		id,
		pos: { gx: pos.gx, gy: pos.gy },
		name: value.name,
		emoji: value.emoji,
		desc: typeof value.desc === "string" ? value.desc : "",
		parentId,
		residents: parseResidents(value.residents),
		authorId: value.authorId,
		createdAt: value.createdAt,
	};
}

/** pins ノード全体(Record<PinId, unknown>)を検証済み Pin の配列にする */
export function parsePinRecord(value: unknown): readonly Pin[] {
	if (!isRecord(value)) return [];
	const pins: Pin[] = [];
	for (const [id, raw] of Object.entries(value)) {
		const pin = parsePin(id, raw);
		if (pin !== null) pins.push(pin);
	}
	return pins;
}

/** pixels ノード全体を文字列値のみの Record にする(キー・色の検証は applyRemoteEvent) */
export function parsePixelRecord(
	value: unknown,
): Readonly<Record<string, string>> {
	if (!isRecord(value)) return {};
	const pixels: Record<string, string> = {};
	for (const [key, raw] of Object.entries(value)) {
		if (typeof raw === "string") pixels[key] = raw;
	}
	return pixels;
}

/** maps/<mapId>/meta の値を MapMeta に変換する。grid 不正は null */
export function parseMapMeta(value: unknown): MapMeta | null {
	if (!isRecord(value)) return null;
	const grid = value.grid;
	if (typeof grid !== "number" || !Number.isSafeInteger(grid) || grid <= 0) {
		return null;
	}
	return { grid };
}
