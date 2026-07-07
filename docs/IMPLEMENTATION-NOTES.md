# Implementation Notes

実装中の判断記録。仕様の正本は [spec/DECISIONS.md](spec/DECISIONS.md)。
このファイルはコミット対象(ローカル専用の `.ai/` とは違いリポジトリに残す)。

## 運用ルール

- 仕様(DECISIONS.md)・計画どおりに実装**できなかった/しなかった**判断は、
  どんなに小さくても **Deviations** に記録してから完了報告する。記録なき逸脱は禁止
- Deviation が恒久的な仕様変更に相当するなら、ユーザー確認のうえ DECISIONS.md に昇格させ、
  該当エントリの状態を「DECISIONS 反映済み」に更新する
- 逸脱ではない実装上の学び(ハマりどころ・環境注意・非自明な理由)は **Notes** に書く
- 各エントリは下のフォーマットで追記(新しいものを上に)

```
### YYYY-MM-DD: 一行タイトル
- 計画: 本来どうするはずだったか(DECISIONS §N など参照付き)
- 実際: どう実装したか
- 理由: なぜ逸脱したか
- 影響: 他モジュール・仕様・データへの影響範囲
- 状態: 暫定(要再検討) / 恒久(DECISIONS反映済み) / 恒久(仕様昇格不要)
```

---

## Deviations

### 2026-07-07: canvas 再描画が store.subscribe 直結でなく React props 経由
- 計画: canvas は `store.subscribe`(React 外)+ rAF バッチで再描画する(DECISIONS §6)
- 実際: rAF バッチは MapView 内に実装済みだが、pixels 等の入力は App が useMapStore で購読して props で渡している(再描画のトリガーが React の再レンダリング)
- 理由: フェーズ0は Firebase 未接続で高頻度のセル差分が発生せず、ストア設計(vanilla store なので subscribe 可能)と MapView の props 境界を先に固めることを優先した
- 影響: 描画性能のみ(機能・データへの影響なし)。Firebase 接続でセル差分が高頻度になる段階で、App の全スライス購読を canvas 直結購読に差し替える
- 状態: 暫定(要再検討: Firebase 接続時に解消予定)

### 2026-07-07: pokemon-list.json のコピー時に Biome 整形のみ適用
- 計画: 旧リポジトリ(pokomap-web)の pokemon-list.json をそのままコピーする
- 実際: コピー後に `biome check --write` で整形のみ実施(1行1レコード → 展開形)
- 理由: 整形しないと lint(format チェック)が通らない
- 影響: なし(JSON のパース結果が完全一致することを検証済み。308件・`{no, name, emoji}`)
- 状態: 恒久(仕様昇格不要)

---

## Notes

(まだなし)
