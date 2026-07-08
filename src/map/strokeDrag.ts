// draw モードの drag → ストローク割り当ての判定ロジック(DECISIONS §5/§6)。
// use-gesture のイベント列から「ストアへ流すストローク操作の列」を決める部分を
// 純関数に切り出し、jsdom で再現しにくいジェスチャ配線から独立してテストする。

import type { CellPos } from "../domain/types";

export type StrokeDragMemo = {
	/** このドラッグでストロークを開始済みか */
	readonly started: boolean;
};

export const strokeDragInit: StrokeDragMemo = { started: false };

export type StrokeDragEvent = {
	/** ポインタ直下のセル(マップ外は null) */
	readonly cell: CellPos | null;
	/** 2本目の指が触れてピンチへ移行した */
	readonly pinching: boolean;
	/** cancel() 済みドラッグの最終イベント */
	readonly canceled: boolean;
	/** ドラッグの最終イベント(指が離れた) */
	readonly last: boolean;
};

export type StrokeDragAction =
	| { readonly type: "start"; readonly cell: CellPos }
	| { readonly type: "move"; readonly cell: CellPos }
	| { readonly type: "end" }
	| { readonly type: "cancel" };

export type StrokeDragStep = {
	readonly memo: StrokeDragMemo;
	readonly actions: readonly StrokeDragAction[];
	/** true: 呼び出し側はドラッグの cancel() を呼ぶ(ピンチへの移行) */
	readonly cancelDrag: boolean;
};

/**
 * ドラッグイベント1件を処理し、発行すべきストローク操作と次の memo を返す。
 * - マップ外は無視し、マップ内に入った位置からストロークを開始する
 * - 2本目の指(ピンチ移行)で描きかけを破棄する(誤タッチのゴースト線防止)
 */
export function strokeDragStep(
	memo: StrokeDragMemo,
	ev: StrokeDragEvent,
): StrokeDragStep {
	// cancel() 後の最終イベント: ピンチ移行時に処理済みなので何もしない
	if (ev.canceled) {
		return { memo: strokeDragInit, actions: [], cancelDrag: false };
	}
	if (ev.pinching) {
		return {
			memo: strokeDragInit,
			actions: memo.started ? [{ type: "cancel" }] : [],
			cancelDrag: true,
		};
	}
	const actions: StrokeDragAction[] = [];
	let started = memo.started;
	if (ev.cell !== null) {
		actions.push(
			started
				? { type: "move", cell: ev.cell }
				: { type: "start", cell: ev.cell },
		);
		started = true;
	}
	if (ev.last) {
		if (started) actions.push({ type: "end" });
		return { memo: strokeDragInit, actions, cancelDrag: false };
	}
	return { memo: { started }, actions, cancelDrag: false };
}
