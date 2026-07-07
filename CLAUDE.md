# pokomap-next

「ぽこあポケモン」通信プレイ用の共有マップツール刷新版(旧版: ../pokomap-web)。
React 19 + TypeScript + Vite + Vitest + Biome / Firebase RTDB + Security Rules / 認証サーバー(Render)。

## ドキュメントの構成と正本

- `docs/spec/DECISIONS.md` — **設計決定の正本**。REBUILD.md 等と食い違う場合はこちらが優先
- `docs/IMPLEMENTATION-NOTES.md` — 実装中の判断記録(コミット対象)
- `.ai/` — AI作業用ファイル一式(gitignore 済み・ローカル専用): 作業メモリ・議論・検討ログ。
  **セッション開始時に `.ai/MEMORY.md` を読み、作業の区切りで更新する**
- 旧版の仕様・経緯: `../pokomap-web/docs/`(SPEC.md / REBUILD.md / HANDOFF.md)

## 必須ルール(定型作業は対応する skill の手順に従うこと)

1. **Deviations 記録**(→ skill: `deviation`): 仕様・計画から逸脱する実装判断をしたら、
   どんなに小さくても記録してから完了報告する。記録なき逸脱は禁止
2. **コミット方針**(→ skill: `ship`): ドキュメント・設定だけの小さな変更を単独コミットしない。
   まとまった変更に同梱するか、指示があったときだけコミットする。コミット時は ship の手順
   (分割規則・メッセージ規約・CI確認・メモリ更新)に従う
3. **品質チェック**(→ skill: `check`): 実装の完了報告・コミットの前に必ず check を実行し合格させる
4. **仕様の反映**(→ skill: `spec-update`): 設計判断が確定したら spec-update の手順で
   DECISIONS.md へ反映し、エージェント定義へ伝播させる
5. **グリッドサイズ 46 をハードコードしない**(`maps/<mapId>/meta.grid` で可変。DECISIONS §3)
6. 検討過程のメモ・作業ログは `.ai/` に書き、確定した内容だけを `docs/spec/` に反映する

## コマンド

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run lint`(Biome)/ `npm run typecheck` / `npm run test`(Vitest)
