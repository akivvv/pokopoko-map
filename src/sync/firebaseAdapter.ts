// RtdbAdapter の Firebase 実装。SDK 呼び出しをこのファイルに閉じる
// (ロジックは mapSync.ts にあり、テストは fake アダプタで行う)。

import {
	type Database,
	type DataSnapshot,
	get,
	onChildAdded,
	onChildChanged,
	onChildRemoved,
	onValue,
	ref,
	update,
} from "firebase/database";
import type { RtdbAdapter } from "./mapSync";

/** 購読キャンセル(権限喪失等)はコンソール記録のみ(復帰処理はスコープ外) */
function logCancel(error: Error): void {
	console.error("mapSync: 購読がキャンセルされた", error);
}

function childCallback(
	cb: (key: string, value: unknown) => void,
): (snapshot: DataSnapshot) => void {
	return (snapshot) => {
		if (snapshot.key !== null) cb(snapshot.key, snapshot.val());
	};
}

export function createFirebaseRtdbAdapter(db: Database): RtdbAdapter {
	return {
		get: async (path) => (await get(ref(db, path))).val(),
		update: (path, values) => update(ref(db, path), values),
		onChildAdded: (path, cb) =>
			onChildAdded(ref(db, path), childCallback(cb), logCancel),
		onChildChanged: (path, cb) =>
			onChildChanged(ref(db, path), childCallback(cb), logCancel),
		onChildRemoved: (path, cb) =>
			onChildRemoved(
				ref(db, path),
				(snapshot) => {
					if (snapshot.key !== null) cb(snapshot.key);
				},
				logCancel,
			),
		onValue: (path, cb) =>
			onValue(ref(db, path), (snapshot) => cb(snapshot.val()), logCancel),
	};
}
