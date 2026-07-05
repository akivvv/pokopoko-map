# pokomap-next

「ぽこあポケモン」通信プレイ用の共有マップツール刷新版(旧版: ../pokomap-web)。
React 19 + TypeScript + Vite + Vitest + Biome / Firebase RTDB + Security Rules / 認証サーバー(Render)。

## ドキュメントの構成と正本

- `docs/spec/DECISIONS.md` — **設計決定の正本**。REBUILD.md 等と食い違う場合はこちらが優先
- `docs/IMPLEMENTATION-NOTES.md` — 実装中の判断記録(コミット対象)
- `docs/discussion/` — 議論・検討メモ(gitignore 済み・ローカル専用)
- 旧版の仕様・経緯: `../pokomap-web/docs/`(SPEC.md / REBUILD.md / HANDOFF.md)

## 必須ルール

1. **Deviations 記録**: 仕様・計画から逸脱する実装判断をしたら、どんなに小さくても
   `docs/IMPLEMENTATION-NOTES.md` の Deviations に記録してから完了報告する。記録なき逸脱は禁止。
   恒久的な仕様変更に相当するものはユーザー確認のうえ DECISIONS.md へ昇格させる
2. **コミット方針**: ドキュメント・設定だけの小さな変更を単独コミットしない。
   まとまった変更に同梱するか、指示があったときだけコミットする
3. **グリッドサイズ 46 をハードコードしない**(`maps/<mapId>/meta.grid` で可変。DECISIONS §3)
4. 検討過程のメモは `docs/discussion/` に書き、確定した内容だけを `docs/spec/` に反映する

## コマンド

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run lint`(Biome)/ `npm run typecheck` / `npm run test`(Vitest)
