// strokeDragStep: draw モードのドラッグイベント列 → ストローク操作列の判定。
// ジェスチャ配線(use-gesture)は jsdom で再現しにくいため、判定ロジックを
// 純関数として固める。ストア側の適用は applyLocalAction.test.ts が担う。

import { describe, expect, it } from "vitest";
import type { StrokeDragEvent, StrokeDragMemo } from "./strokeDrag";
import { strokeDragInit, strokeDragStep } from "./strokeDrag";

const cell = (gx: number, gy: number) => ({ gx, gy });

function ev(partial: Partial<StrokeDragEvent>): StrokeDragEvent {
	return {
		cell: null,
		pinching: false,
		canceled: false,
		last: false,
		...partial,
	};
}

/** イベント列を順に適用し、発行された操作を平坦に集める */
function run(events: readonly StrokeDragEvent[]) {
	let memo: StrokeDragMemo = strokeDragInit;
	const actions = [];
	let cancelDrag = false;
	for (const e of events) {
		const step = strokeDragStep(memo, e);
		memo = step.memo;
		actions.push(...step.actions);
		cancelDrag ||= step.cancelDrag;
	}
	return { memo, actions, cancelDrag };
}

describe("strokeDragStep", () => {
	it("ドラッグ: 開始セルで start、以降のセルで move、指を離すと end", () => {
		const { actions } = run([
			ev({ cell: cell(1, 1) }),
			ev({ cell: cell(2, 1) }),
			ev({ cell: cell(3, 2) }),
			ev({ cell: cell(3, 2), last: true }),
		]);
		expect(actions).toEqual([
			{ type: "start", cell: cell(1, 1) },
			{ type: "move", cell: cell(2, 1) },
			{ type: "move", cell: cell(3, 2) },
			{ type: "move", cell: cell(3, 2) },
			{ type: "end" },
		]);
	});

	it("タップ(単一イベントで last): start と end を発行し1セル塗りになる", () => {
		const { actions } = run([ev({ cell: cell(5, 5), last: true })]);
		expect(actions).toEqual([
			{ type: "start", cell: cell(5, 5) },
			{ type: "end" },
		]);
	});

	it("マップ外で開始した場合はマップ内に入った位置から start する", () => {
		const { actions } = run([
			ev({ cell: null }),
			ev({ cell: null }),
			ev({ cell: cell(0, 3) }),
			ev({ cell: cell(1, 3), last: true }),
		]);
		expect(actions).toEqual([
			{ type: "start", cell: cell(0, 3) },
			{ type: "move", cell: cell(1, 3) },
			{ type: "end" },
		]);
	});

	it("マップ外へ出ている間は無視し、離した位置がマップ外でも end する", () => {
		const { actions } = run([
			ev({ cell: cell(45, 45) }),
			ev({ cell: null }),
			ev({ cell: null, last: true }),
		]);
		expect(actions).toEqual([
			{ type: "start", cell: cell(45, 45) },
			{ type: "end" },
		]);
	});

	it("一度もマップ内を通らないドラッグは何も発行しない", () => {
		const { actions } = run([
			ev({ cell: null }),
			ev({ cell: null, last: true }),
		]);
		expect(actions).toEqual([]);
	});

	it("ピンチ移行: 描きかけを cancel し、ドラッグ自体の cancel を要求する", () => {
		const { actions, cancelDrag } = run([
			ev({ cell: cell(2, 2) }),
			ev({ cell: cell(3, 2), pinching: true }),
		]);
		expect(actions).toEqual([
			{ type: "start", cell: cell(2, 2) },
			{ type: "cancel" },
		]);
		expect(cancelDrag).toBe(true);
	});

	it("ストローク開始前のピンチ移行: cancel 操作は発行せずドラッグだけ止める", () => {
		const { actions, cancelDrag } = run([ev({ cell: null, pinching: true })]);
		expect(actions).toEqual([]);
		expect(cancelDrag).toBe(true);
	});

	it("cancel() 後の最終イベント(canceled)では何も発行しない", () => {
		const { actions } = run([
			ev({ cell: cell(2, 2) }),
			ev({ cell: cell(3, 2), pinching: true }),
			ev({ cell: cell(3, 2), canceled: true, last: true }),
		]);
		expect(actions).toEqual([
			{ type: "start", cell: cell(2, 2) },
			{ type: "cancel" },
		]);
	});

	it("ドラッグ終了で memo が初期状態に戻る(次のドラッグは新規ストローク)", () => {
		const first = run([ev({ cell: cell(1, 1), last: true })]);
		expect(first.memo).toEqual(strokeDragInit);
		const second = run([ev({ cell: cell(9, 9) })]);
		expect(second.actions[0]).toEqual({ type: "start", cell: cell(9, 9) });
	});
});
