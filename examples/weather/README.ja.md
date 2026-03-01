<p align="right"><a href="README.md">English</a></p>

# Weather — 警報レベルと降水タイプの判定ロジック

天気予報システムの危険度スコア、警報レベル判定、気温に応じた降水タイプ変換を Lean で形式証明し、TypeScript のプロパティテストとして自動生成する例。

## Lean 仕様 → 生成コード

| Lean | 生成ファイル | 内容 |
|---|---|---|
| `inductive Weather` | `types.ts` | `Weather` 判別共用体 (sunny/cloudy/rainy/snowy/stormy) |
| `inductive WindLevel` | `types.ts` | `WindLevel` 判別共用体 (calm/moderate/strong/violent) |
| `inductive AlertLevel` | `types.ts` | `AlertLevel` 判別共用体 (none/advisory/warning/emergency) |
| `def weatherSeverity`, `dangerScore` 他 | `stubs.ts` | 関数スタブ → 自分で実装する |
| 定理 8 件 | `properties.test.ts` | fast-check プロパティテスト |

## 定理とテストの対応

| Lean 定理 | 生成されるテスト | 何を検証するか |
|---|---|---|
| `weather_severity_bounded` | `weatherSeverity(w) <= 4` | 天気の深刻度は上限 4 |
| `wind_severity_bounded` | `windSeverity(wl) <= 3` | 風の深刻度は上限 3 |
| `danger_score_bounded` | `dangerScore(w, wl) <= 7` | 合計スコアは上限 7 |
| `sunny_calm_safe` | `alertFromScore(dangerScore(sunny, calm)) == none` | 晴れ+穏やかなら警報なし |
| `stormy_violent_emergency` | `alertFromScore(dangerScore(stormy, violent)) == emergency` | 最悪ケースは必ず特別警報 |
| `stormy_worse_than_sunny` | `dangerScore(sunny, wl) <= dangerScore(stormy, wl)` | 悪天候ほどスコアが高い |
| `sunny_unaffected_by_temp` | `precipitationType(t, sunny) == sunny` | 晴れは気温で変化しない |
| `cloudy_unaffected_by_temp` | `precipitationType(t, cloudy) == cloudy` | 曇りは気温で変化しない |

## Lean が見つけるバグ

`stubs-buggy.ts` に意図的に 3 つのバグを入れた実装がある。テストを実行すると:

```bash
npx vitest run examples/weather/generated/properties-buggy.test.ts
```

### バグ 1: 深刻度の off-by-one

```typescript
case "stormy": return 5;  // 正しくは 4
```

`weatherSeverityBounded` が検出:

```
Counterexample: [{"tag":"stormy"}]
weatherSeverity({ tag: "stormy" }) => 5  (≤ 4 ではない)
```

これが連鎖して `dangerScoreBounded` も失敗する — stormy + violent = 8 > 7。

### バグ 2: 曇りが雨に化ける

```typescript
case "cloudy": return { tag: "rainy" };  // 曇りのまま返すべき
```

`cloudyUnaffectedByTemp` が即座に検出:

```
Counterexample: [0]
precipitationType(0, { tag: "cloudy" }) => { tag: "rainy" }  (cloudy ではない)
```

実際のシステムでは、曇りの日に雨予報が出てしまい、ユーザーの信頼を損なう。

### なぜこれが重要か

これらはエキゾチックなエッジケースではない。コードレビューをすり抜ける、ありふれた off-by-one やコピペミスだ。Lean の証明が正確な契約を定義し、fast-check がその契約に対して実装を網羅的にテストする。

## テスト実行

```bash
# 正しい実装 — 8 件すべて通過
npx vitest run examples/weather/generated/properties.test.ts

# バグ入り実装 — 3 件失敗
npx vitest run examples/weather/generated/properties-buggy.test.ts
```
