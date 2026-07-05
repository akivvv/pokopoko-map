# 設計決定事項(pokomap-next)

最終更新: 2026-07-05
旧版の課題と刷新方針は [pokomap-web/docs/REBUILD.md](../../pokomap-web/docs/REBUILD.md) を参照。
本書は REBUILD.md §3 の未決事項10件をすべて決着させた記録であり、**REBUILD.md と食い違う場合は本書が優先**。

---

## 1. 認証・入室設計(REBUILD §3-1〜3 の決着。§2 の「匿名認証+カスタムトークン」を上書き)

**アカウント制に引き上げる**(2026-07-05 ユーザー決定)。匿名認証+あいことば直接方式は採用しない。

| 項目 | 決定 |
|---|---|
| 個人識別 | **Firebase Authentication の Google ログイン**(まずは Google のみ。他プロバイダは必要が出たら追加) |
| 部屋への参加 | ログイン後に**招待コード**(旧あいことば相当)を1回入力 → 認証サーバーが検証し、`rooms/<roomId>/members/<uid>` を Admin SDK で登録。以降の入室はコード入力不要(メンバーシップが残るため) |
| 認証サーバーの役割 | **招待コード検証+メンバー登録のみ**。カスタムトークン発行は不要になった(標準ログインを使うため)。ID トークン検証 → コード照合 → members 書き込み |
| 実装先 | **Render / Koyeb 無料枠**(2026-07-05 ユーザー決定)。単発リクエストのみでコールドスタート許容。Cloud Functions(Blaze)は不採用 |
| roomId | あいことばハッシュではなく**ランダム ID**。招待コード→roomId の対応表は RTDB の管理領域(Rules で全拒否、Admin SDK のみアクセス)に `roomCodes/<hash(code+pepper)>: roomId` として保持。pepper は認証サーバーの環境変数 |
| 部屋の作成 | 認証サーバー経由(コード設定+作成者を members 登録+meta 作成) |
| Security Rules | `rooms/$roomId` の read/write は `root.child('rooms').child($roomId).child('members').child(auth.uid).exists()` を条件にする |
| 削除保護 | `authorId === auth.uid` を Rules で検証。強制削除モードは `meta/forceDelete` を `root.child()` 参照(REBUILD §2 のまま) |
| セッション維持 | Firebase Auth SDK 標準の永続化(REBUILD §2 のまま。独自 Cookie なし) |
| 悪用対策 | 参加/作成エンドポイントに **IP ごと 5回/分のレート制限+失敗応答の均一化**(部屋の存在有無を推測させない)。単一インスタンス前提のインメモリ実装で足りる。**Firebase App Check は見送り**(身内数人・無料枠でコスト過剰。異常な転送量が出たら再検討) |

補足: アカウント制化により旧課題「弱いあいことばへの辞書攻撃」は構造的に解消
(招待コードを割られても Google ログイン+レート制限の壁が残り、コードは部屋単位で変更可能)。
「URL+あいことばを伝えるだけ」の共有体験は「URL+招待コードを伝える(各自初回のみ Google ログイン)」に変わる。

## 2. データ移行(REBUILD §3-5 の決着)

**JSON 取り込み方式**(2026-07-05 ユーザー決定)。

- 旧アプリの 📄JSON 出力を、新アプリに実装する**インポート機能**で読み込む。DB 直接移行はしない
- 変換内容: 旧 `kind`(pokemon/landmark/item)構造 → 新「入れ物/中身」モデル、`residents` → 中身、
  座標は画像 px → グリッド単位(`round(px * 46 / 画像幅)`)
- 取り込んだピンの所有者は**取り込み実行者の uid**(旧 authorId と新 uid は対応付け不能のため)
- インポート機能は移行後も恒久機能として残す(バックアップ復元・部屋複製にも使える)

## 3. 移行方式・フロントスタック(REBUILD §3-4, 3-6 の決着 — 事実上決定済みだったものの明文化)

- **新規リポジトリ(pokomap-next)で作り直し**。pokomap-web は現行版としてそのまま残す
- **React 19 + TypeScript + Vite + Vitest + Biome**(セットアップ済み)。CSS 方針(Tailwind 導入可否)は実装着手時に判断

## 4. pixels 同期の実装方式(REBUILD §3-7 の決着)

- 初回ロード: localStorage キャッシュを即表示 → `get()` で一括取得して上書き
- 以降: `onChildAdded` / `onChildChanged` / `onChildRemoved` を pixels・pins 各ノードに張り、差分だけをローカル状態(Map)へ反映。再描画は requestAnimationFrame でバッチ
- 書き込み: ストローク終了時に変更セルをまとめて `update()`(null = セル消去)。従来仕様のまま
- `onValue` によるノード全体購読は禁止(REBUILD 課題3の解消。meta のような小さい単一ノードは例外可)

## 5. localStorage 読み取りキャッシュ(REBUILD §3-8 の決着)

- スキーマ: `{ schemaVersion: number, roomId: string, savedAt: number, pins, pixels }`
- キー: `pokomap:cache:<roomId>`
- 保存タイミング: ローカル状態変更後の debounce(1秒)+ `visibilitychange`(hidden)時
- `schemaVersion` 不一致・roomId 不一致のキャッシュは黙って破棄(マイグレーションは書かない。キャッシュは捨ててよいデータ)

## 6. pokemonLocations 占有インデックス(REBUILD §3-9 の決着)

- パス: `rooms/<roomId>/pokemonLocations/<pokemonNo>: { pinId, authorId }`
- 権限: 読み書きともメンバーのみ。作成時 `newData.authorId === auth.uid` を Rules 検証。削除は所有者 or `meta/forceDelete` ON
- 取得は `transaction()`。**「既に占有あり」による失敗は自動リトライしない**(本質的競合であり再試行しても結果は同じ)。
  「◯◯はすでに△△に登録済み」トーストを出して終了。ネットワーク起因の再試行は SDK の transaction 標準動作に任せる

## 7. 画像表示 ON/OFF(REBUILD §3-10 の決着)

- デフォルト: 端末に背景画像(ローカル保持)があれば ON、なければ自動 OFF
- 設定は端末ごと(localStorage)。共有設定にはしない
- OFF 時の表示: 単色背景+ドット地図+格子+ピン(背景画像なしで完全に成立するレンダリング)

---

## 未決として残っているもの

なし(REBUILD §3 の10件はすべて上記で決着)。
今後の設計判断はこのファイルに追記していく。
