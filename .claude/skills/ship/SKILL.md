---
name: ship
description: 作業の区切りでコミット→push→CI確認→作業メモリ更新までを行う一連の手順。「コミットして」「pushして」「区切りにして」と言われたとき、またはまとまった実装が完成したときに使う。
---

# コミット〜CI確認〜メモリ更新

## 前提条件(満たしていなければ先にやる)

1. skill: check が合格していること
2. 仕様からの逸脱があれば docs/IMPLEMENTATION-NOTES.md に記録済みであること(skill: deviation)

## 手順

1. `git status --short` と `git diff --stat` で変更を把握する
2. **コミット分割の規則**:
   - 論理単位で分ける(実装とそれに伴う docs/設定は同じコミットに同梱してよい)
   - **docs・設定だけの小さな変更を単独コミットしない**(未コミットのまま残し、
     次のまとまったコミットに同梱する)
   - `.ai/` 配下は gitignore 済みなので絶対にステージされない(されていたら .gitignore 破損を疑い停止)
3. **コミットメッセージ規約**: 日本語。1行目=何をしたかの要約、本文=箇条書きで要点、
   末尾に以下のトレーラーを付ける:
   ```
   Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
   ```
   (実行モデルが異なる場合はそのモデル名に置き換える)
4. `git push`(リモートは SSH 設定済み。HTTPS に変更しない。force push 禁止)
5. **CI確認**: push 後、以下で結果を確認する(public リポジトリなので認証不要):
   ```
   curl -s "https://api.github.com/repos/akivvv/pokopoko-map/actions/runs?per_page=1"
   ```
   `"status"` が `completed` になるまで30秒間隔で待ち、`"conclusion"` を見る:
   - `success` → 合格
   - それ以外 → 同 API の `jobs_url` からログを辿るか、失敗内容をユーザーに報告する。
     **既知の罠**: Windows 専用 npm パッケージを devDependencies に入れると Linux CI が
     EBADPLATFORM で落ちる → optionalDependencies に移す
6. **作業メモリ更新**: `.ai/MEMORY.md` の「現在地」「フェーズ0の残り(次の一手)」と最終更新日を
   今回の作業内容に合わせて書き換える(仕様は書かない。仕様は docs/spec/DECISIONS.md)

## 完了報告

コミットハッシュ・push 先・CI の結論(success/failure)を含めて報告する
