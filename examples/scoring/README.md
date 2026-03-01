# Scoring — 試験スコアの集計

試験スコアの合成操作に対する性質を Lean で証明し、プロパティテストとして自動生成する例。

## Lean 仕様 → 生成コード

| Lean | 生成ファイル | 内容 |
|---|---|---|
| `inductive Grade` | `types.ts` | `Grade` 判別共用体 (a/b/c/d/f) + 型ガード |
| `structure Score` | `types.ts` | `Score` interface (`earned`, `possible`) |
| `def combine`, `addBonus` | `stubs.ts` | 関数スタブ |
| `theorem combine_earned_comm` 他4件 | `properties.test.ts` | fast-check プロパティテスト |

## 定理とテストの対応

| Lean 定理 | 生成されるテスト | 何を検証するか |
|---|---|---|
| `combine_earned_comm` | `combine(a, b).earned === combine(b, a).earned` | 合成の可換性（得点） |
| `combine_possible_comm` | `combine(a, b).possible === combine(b, a).possible` | 合成の可換性（満点） |
| `combine_possible_ge` | `a.possible <= combine(a, b).possible` | 合成すると満点は増える |
| `bonus_increases` | `s.earned <= addBonus(s, bonus).earned` | ボーナスで得点は減らない |
| `bonus_preserves_possible` | `addBonus(s, bonus).possible === s.possible` | ボーナスは満点を変えない |

## ポイント

`combine` の実装で `possible` の加算を忘れると:

```typescript
function combine(a: Score, b: Score): Score {
  return { earned: a.earned + b.earned, possible: a.possible }; // possible の合算漏れ
}
```

`combinePossibleComm` テストが失敗する — `a.possible ≠ b.possible` のケースで可換性が崩れるため。

## テスト実行

```bash
npx vitest run examples/scoring/generated/properties.test.ts
```
