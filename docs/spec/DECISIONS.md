# pokomap-next 設計仕様

本書が設計の正本。実装がここから逸脱する場合は [../IMPLEMENTATION-NOTES.md](../IMPLEMENTATION-NOTES.md) の Deviations に記録する。
画面・機能の基本仕様は旧版 `pokomap-web/docs/SPEC.md` §3〜§9 を踏襲し、本書は刷新で変わる点と技術設計を定める。

## 1. アーキテクチャ

- Firebase Realtime Database + Security Rules + Firebase Authentication の BaaS 構成。自作 API サーバー・自作 DB は持たない
- 信頼境界は Security Rules。検証・権限をクライアント JS だけに置かない
- 認証サーバー(招待コード検証専用)を1つだけ持つ。Render/Koyeb 無料枠・TypeScript・最小フレームワーク(Hono 級)
- フロントは静的ホスティング(GitHub Pages)。リポジトリ: akivvv/pokopoko-map
- Firebase プロジェクトは新版専用(旧版とは分離)。RTDB リージョンは asia-southeast1
- 全構成で無料枠内に収める

## 2. 認証・入室

- 個人識別は Firebase Authentication。**Google ログイン(推奨)と匿名認証の両対応**。identity のアンカーは常に `auth.uid` で、プロバイダによらず Rules・membership・authorId の扱いは同一
- 匿名→Google の昇格は `linkWithCredential`(uid 維持)。匿名は端末紐づきで機種変更時に別人になるため、UI で注意を出し「Google と連携」導線と PWA ホーム画面追加を促す
- 部屋参加: ログイン後に招待コード入力(または `?invite=<code>` リンク)→ 認証サーバーが ID トークン検証+コード照合 → `members/<uid>` と `userRooms/<uid>/<roomId>` を Admin SDK で登録。以降の入室はコード不要
- Google ログインは `signInWithPopup` 基本。ポップアップブロック時のみリダイレクトにフォールバック
- セッションは Firebase Auth SDK 標準の永続化(IndexedDB)。独自 Cookie は使わない
- 認証サーバーのエンドポイントは**部屋参加・部屋作成・ヘルスチェックのみ**。メンバー管理機能(kick・招待コード変更・オーナー権限)は作らない。メンバーは全員対等
- 悪用対策: IP ごと 5回/分のレート制限(`X-Forwarded-For` 先頭を参照)+失敗応答の均一化(部屋の存在有無を推測させない)。App Check は使わない
- 招待コード→roomId の対応は RTDB 管理領域 `roomCodes/<hash(code+pepper)>: roomId`(Rules 全拒否・Admin SDK のみ)。pepper は環境変数
- 秘匿情報(Admin SDK 資格情報・pepper)は環境変数のみ。ログに招待コード・トークンを残さない

## 3. データモデル(RTDB)

```
rooms/<roomId>/                     # roomId はランダムID
  meta:    { createdAt, forceDelete }
  members/<uid>: { name }           # 部屋ごとのニックネーム(初回入室時に設定・変更可)
  maps/<mapId>/                     # 当面1マップ運用(階層のみ確保)
    meta:   { grid }                # グリッドサイズ(初期46)
    pixels/"gx,gy": "#rrggbb"       # ドットレイヤー(セルごと)
    pins/<id>: { pos: {gx, gy}, name, emoji, desc,
                 parentId, residents: [no...], authorId, createdAt }
  pokemonLocations/<pokemonNo>: { pinId, authorId }   # 1匹1住処の占有インデックス
  snapshots/<YYYY-MM-DD>: { pins, pixels, savedAt }   # 日次・14日保持・地図画像は含めない
  log/<id>: { ts, who, action, target }               # 破壊的操作のみ・直近200件
userRooms/<uid>/<roomId>: true      # 部屋一覧用の逆引き
roomCodes/<hash>: roomId            # Admin 専用領域
```

- ピンは「**入れ物**」+「**中身(ポケモンのみ)**」の統一モデル。入れ物は `parentId` で2段までネスト可。`residents` の件数上限なし
- ピン座標はグリッド単位(pixels と整数比較できる)
- **グリッドサイズは `maps/<mapId>/meta.grid` で可変**(初期46)。処理側で 46 をハードコードしない
- 背景画像はサーバーに保存しない。各端末ローカルのみ(メンバーが各自スクショを取り込む)
- タイムスタンプは `ServerValue.TIMESTAMP`(スナップショットの「今日分があるか」判定のみ端末ローカル日付)
- 1匹1住処は `pokemonLocations` + `transaction()` で構造的に排他する。占有済みによる失敗は自動リトライせず「◯◯はすでに△△に登録済み」トーストで終了
- 一意性のスコープは部屋全体(room 直下)。複数マップ対応時に再設計する

## 4. Security Rules

- `rooms/$roomId` の read/write は `members/<auth.uid>` の存在を条件とする(メンバーシップ制)
- 削除保護: `authorId === auth.uid` を検証。`meta/forceDelete` が true のときのみ全削除可(`root.child()` 参照)
- `members/<uid>/name` は本人のみ書き込み可。`userRooms/<uid>` は本人のみ読み取り可。`roomCodes` は全拒否(Admin SDK のみ)
- `.validate` を必ず書く: 文字列長上限(ピン名50・説明500・ニックネーム20)/ pixels 値は `#rrggbb` 正規表現・キーは `数字,数字` / 想定外キーは `$other: { .validate: false }` で拒否
- snapshots・log はクライアント書き込み方式(改ざん耐性なしは身内利用前提で許容する)
- Rules はリポジトリで管理し、各ルールの意図をコメントで残す

## 5. 同期・キャッシュ

- 起動シーケンス: localStorage キャッシュを即表示 → `get()` 一括取得で上書き → 以降 `onChildAdded` / `onChildChanged` / `onChildRemoved` の差分購読。**`onValue` によるノード全体購読は禁止**(meta のような小さい単一ノードは例外可)
- 書き込みは楽観的更新。ストローク終了時に変更セルをまとめて `update()` でパッチ送信(null = セル消去)
- 同時編集: 各セルは独立の Last-Write-Wins。別セルは衝突せず、同一セルは後勝ちで全クライアントが同一結果に収束する(排他・ロックは持たない)
- **ストローク中の表示規則**: 描画中の変更セルは pending として保持し、表示は常にリモートより優先する。リモート差分はベース状態にのみ適用する。ストローク終了で送信 → pending クリア → エコーバックがベースに入る
- localStorage キャッシュ: `pokomap:cache:<roomId>` = `{ schemaVersion, roomId, savedAt, pins, pixels }`。変更後1秒の debounce + `visibilitychange`(hidden) で保存。schemaVersion / roomId 不一致は黙って破棄(マイグレーションは書かない)
- ログは書き込み時に直近200件へ間引く。記録対象は破壊的操作のみ(paint・savePin は記録しない)
- 日次スナップショット: 起動時に当日分がなければ保存。14日保持

## 6. フロントエンド実装方針

- スタック: React 19 + TypeScript + Vite + Vitest + Biome
- 状態は Zustand。「誰が書くか」で4スライス分離: `remote`(onChild* ハンドラのみが書く)/ `pending`(自分の操作のみ)/ `ui` / `settings`。表示は純関数セレクタ `merge(remote, pending)` の結果
- モードは判別可能ユニオン `{kind:'view'} | {kind:'pin', draft} | {kind:'draw', color, tool, stroke}`。モード固有状態を variant の外に置かない
- 座標は3系統を別型にする: `GridPos`(格子)/ `ScreenPos`(画面px)/ `CellKey`(`"gx,gy"`)
- 状態遷移は純関数 `applyRemoteEvent` / `applyLocalAction` として実装し、Vitest で単体テストする
- remote/pending スライスは `createMapStore(mapId)` ファクトリ(複数マップ化・grid 可変に備える)
- **ジェスチャは `@use-gesture/react` に委譲**: drag / pinch / wheel → camera(ui スライス)。生のポインタイベント・マルチポインタ状態遷移を自前実装しない
- **ピンは canvas に描かず DOM オーバーレイ**(React コンポーネント)。canvas のヒットテストは実装しない。PNG 出力時のみピンを canvas に合成する
- canvas の自前コードは「camera を受けて背景+セル+格子を blit する純描画」と座標変換のみ。canvas は `store.subscribe`(React 外)+ rAF バッチで再描画する
- フォントはサブセット化して self-host。PWA はアプリシェルのみキャッシュ+更新トースト
- Vite `base: '/pokopoko-map/'`。SPA ルーターは使わない(URL は `?invite=` の処理のみ)

## 7. UIデザイン「ポコポップ」

ネオブルータリズムの構造(太枠・ハードシャドウ・明快な区切り)を、こげ茶インク・パステル・大きめ角丸・丸ゴシックで緩めたスタイル。トークンは `src/styles/tokens.css` に定義し、コンポーネントに生の色値を書かない。

| トークン | 値 |
|---|---|
| 地色 / カード | `#FFF8EC` / `#FFFFFF` |
| インク(文字・枠線) | `#4A3A32`(黒ではなくこげ茶) |
| プライマリ | `#FFAE3D`(オレンジ) |
| セカンダリ | `#6FD8C0`(ミント) |
| アクセント | `#FF8FAB`(ピンク)・`#69B7E8`(空色) |
| 地図地色 / 格子線 | `#E4F0D8` / インク10% |
| 枠線・影 | 枠 2px、ハードオフセット影 `3px 3px 0`(インク85%) |
| 角丸 | カード 14-16px / ボトムシート 24px / ボタン・ピル 999px |
| フォント | Zen Maru Gothic または M PLUS Rounded 1c(self-host)。数字は tabular-nums |

- ユーザーが塗るドット色は装飾なしの純色で表示する(主役はユーザーの色。UI は引き立て役)
- ピンは白地+インク枠のステッカー風。一部を軽く回転(-6°程度)させて遊びを出す
- ダークモードは対応しない(ライトテーマ固定)
- 見出し・数字のみ DotGothic16 を使う案は任意の取り込み候補(保留)

## 8. UI・機能の要点(旧版からの変更)

- 入室フロー: Google または匿名でログイン → 部屋一覧(userRooms)→ タップで入室。新しい部屋へは招待コード入力 or `?invite=` リンク(部屋ごとに初回のみ)
- ニックネームは初回入室時に設定・変更可。Google の表示名(本名)は画面に出さない
- 複数マップ UI は作らない(データは maps 階層だが機能は1マップ前提)
- 画像表示 ON/OFF: 端末に背景画像があれば ON・なければ OFF。端末ごとの設定(localStorage)。OFF 時は単色背景+ドット地図+ピンで成立する表示
- **JSON インポート**(恒久機能): 旧アプリの JSON 出力を読み込む。旧 kind 構造→入れ物/中身、residents→中身、画像 px→グリッド座標(`round(px * grid / 画像幅)`)に変換。取り込んだピンの所有者は実行者
- 部屋参加・作成ボタンには必ずローディング表示を付ける(認証サーバーのコールドスタート数十秒に備える)
- PNG / JSON 出力、削除保護+強制削除モード、図鑑・かな検索は旧版仕様を踏襲

## 9. 廃止済みの旧案(混入禁止)

以下が実装・提案に現れたら設計逸脱として扱う:

- ピンの kind 種別(pokemon / landmark / item)、residents 上限20
- ピン座標の画像 px 基準
- `onValue` によるノード全体購読
- あいことばハッシュを DB パスに使う方式、あいことばログイン画面
- 匿名認証+カスタムトークン発行方式(REBUILD.md §2 に記載の旧案)
- 生成 AI 連携(AI プロンプト出力・生成マップ取込)
- グリッドサイズ 46 のハードコード
- 地図・操作ライブラリとしての Leaflet / Konva / d3-zoom(検討のうえ不採用)

## 10. スコープ外・保留

- 複数マップ UI、および1匹1住処の一意性スコープ(マップ間共有/非共有)の再設計 — 複数マップ対応時
- undo / redo(pending がパッチ=データの構造なので後付け可能にしておく)
- オフライン書き込みキュー
- メンバー管理機能(kick・招待コード変更・オーナー)
- E2E テスト(当面は Vitest + 手動確認)
- 依存パッケージの自動更新(安定後に Dependabot を検討)
