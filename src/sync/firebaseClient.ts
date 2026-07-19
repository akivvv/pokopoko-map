// Firebase 初期化(DECISIONS §1, §2)。
// firebaseConfig は Web 公開前提の識別子であり秘密ではない(データ保護は Security Rules と
// 認証サーバーが担う)。GitHub Actions ビルドでも env の受け渡しなしで使えるよう
// コミット対象のソースに直接置く。

import { type FirebaseApp, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { type Database, getDatabase } from "firebase/database";
import type { Uid } from "../domain/types";

const firebaseConfig = {
	apiKey: "AIzaSyB36PPVyb-Jqdd5zaNUi-0a82mDTXflGww",
	authDomain: "pokomap-next.firebaseapp.com",
	databaseURL:
		"https://pokomap-next-default-rtdb.asia-southeast1.firebasedatabase.app",
	projectId: "pokomap-next",
	storageBucket: "pokomap-next.firebasestorage.app",
	messagingSenderId: "1044805473441",
	appId: "1:1044805473441:web:afe030a1143ae5cdb34ce0",
};

let app: FirebaseApp | null = null;

function getApp(): FirebaseApp {
	if (app === null) app = initializeApp(firebaseConfig);
	return app;
}

export function getDb(): Database {
	return getDatabase(getApp());
}

/**
 * サインイン済みの uid を返す。未サインインなら匿名認証で作る。
 * セッションは Auth SDK 標準の永続化(IndexedDB)で復元される(DECISIONS §2)。
 * Google ログイン UI・匿名→Google 昇格は入室フロー実装のフェーズで追加する。
 */
export async function ensureSignedIn(): Promise<Uid> {
	const auth = getAuth(getApp());
	await auth.authStateReady();
	if (auth.currentUser !== null) return auth.currentUser.uid;
	const credential = await signInAnonymously(auth);
	return credential.user.uid;
}
