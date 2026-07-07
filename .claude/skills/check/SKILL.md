---
name: check
description: 品質チェック一式(lint→typecheck→test)を実行し、結果を判定する。実装・修正の完了報告の前、コミットの前に必ず使う。結果の解釈(既知警告の扱い)も本手順に従う。
---

# 品質チェックの実行と判定

## 手順

1. 以下を順に実行する(作業ディレクトリはリポジトリルート):
   ```
   npm run lint
   npm run typecheck
   npm run test
   ```
2. lint がフォーマット差分(`format ━━━` / `Formatter would have printed`)で失敗した場合:
   `npm run lint:fix` を実行してから、3コマンドすべてをやり直す

## 判定基準

- **既知の警告(この2件だけは無視してよい)**:
  1. `.claude/hooks/lint-on-write.cjs` の `lint/complexity/useOptionalChain`
  2. `src/main.tsx` の `lint/style/noNonNullAssertion`
- 上記以外の警告・エラーが1件でもあれば **不合格**。自分の変更が原因なら修正して再実行、
  原因が不明なら修正せずユーザーに報告する
- typecheck はエラー0件のみ合格
- test は全件パスのみ合格。失敗したテストを「テスト側を弱めて」通すのは禁止
  (仕様が変わったと考える場合は skill: deviation の手順へ)

## 完了報告

- 3コマンドの合否と、テスト件数(例: 40 passed)を報告に含める
- 不合格のまま「完了」と報告することは禁止
