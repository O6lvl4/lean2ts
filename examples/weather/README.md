<p align="right"><a href="README.ja.md">日本語</a></p>

# Weather — Alert Levels and Precipitation Logic

A weather forecast system with danger scoring, alert levels, and temperature-dependent precipitation. Lean proves the invariants; fast-check catches bugs in your TypeScript implementation.

## What Gets Generated

| Lean | Generated File | Content |
|---|---|---|
| `inductive Weather` | `types.ts` | `Weather` discriminated union (sunny/cloudy/rainy/snowy/stormy) |
| `inductive WindLevel` | `types.ts` | `WindLevel` discriminated union (calm/moderate/strong/violent) |
| `inductive AlertLevel` | `types.ts` | `AlertLevel` discriminated union (none/advisory/warning/emergency) |
| `def weatherSeverity`, `dangerScore`, etc. | `stubs.ts` | Function stubs to implement |
| 8 theorems | `properties.test.ts` | fast-check property tests |

## Theorems and Their Tests

| Lean Theorem | Generated Test | What It Verifies |
|---|---|---|
| `weather_severity_bounded` | `weatherSeverity(w) <= 4` | Severity score is bounded |
| `wind_severity_bounded` | `windSeverity(wl) <= 3` | Wind score is bounded |
| `danger_score_bounded` | `dangerScore(w, wl) <= 7` | Combined score never exceeds max |
| `sunny_calm_safe` | `alertFromScore(dangerScore(sunny, calm)) == none` | Good weather never triggers alerts |
| `stormy_violent_emergency` | `alertFromScore(dangerScore(stormy, violent)) == emergency` | Worst case always triggers emergency |
| `stormy_worse_than_sunny` | `dangerScore(sunny, wl) <= dangerScore(stormy, wl)` | Worse weather means higher danger |
| `sunny_unaffected_by_temp` | `precipitationType(t, sunny) == sunny` | Non-precipitating weather ignores temperature |
| `cloudy_unaffected_by_temp` | `precipitationType(t, cloudy) == cloudy` | Cloudy stays cloudy regardless of temperature |

## The Bugs That Lean Finds

`stubs-buggy.ts` contains three intentional bugs. Run the tests against it:

```bash
npx vitest run examples/weather/generated/properties-buggy.test.ts
```

### Bug 1: Off-by-one severity

```typescript
case "stormy": return 5;  // Should be 4
```

`weatherSeverityBounded` catches it:

```
Counterexample: [{"tag":"stormy"}]
weatherSeverity({ tag: "stormy" }) => 5  (not <= 4)
```

This cascades — `dangerScoreBounded` also fails because stormy + violent = 8 > 7.

### Bug 2: Cloudy becomes rainy

```typescript
case "cloudy": return { tag: "rainy" };  // Should stay cloudy
```

`cloudyUnaffectedByTemp` catches it instantly:

```
Counterexample: [0]
precipitationType(0, { tag: "cloudy" }) => { tag: "rainy" }  (not cloudy)
```

In a real system, this would cause false rain forecasts for cloudy days — confusing users and degrading trust.

### Why this matters

These aren't exotic edge cases. They're the kind of copy-paste and off-by-one errors that slip through code review. Lean's proofs define the exact contract. fast-check exhaustively tests your implementation against that contract.

## Run the Tests

```bash
# Correct implementation — all 8 pass
npx vitest run examples/weather/generated/properties.test.ts

# Buggy implementation — 3 fail
npx vitest run examples/weather/generated/properties-buggy.test.ts
```
