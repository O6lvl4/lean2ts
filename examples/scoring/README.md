# Scoring — Proving Your Aggregation Logic Is Correct

Score aggregation seems simple: add up the points. But "simple" operations have hidden assumptions. Is combining scores commutative? Does adding a bonus ever decrease the score? Does it accidentally change the maximum possible score?

These are exactly the kind of subtle invariants that slip through unit tests but are trivially expressed (and proven) in Lean.

## What Gets Generated

| Lean | Generated File | Content |
|---|---|---|
| `inductive Grade` | `types.ts` | `Grade` discriminated union (a/b/c/d/f) + type guards |
| `structure Score` | `types.ts` | `Score` interface (`earned`, `possible`) |
| `def combine`, `addBonus` | `stubs.ts` | Function stubs |
| 5 theorems | `properties.test.ts` | fast-check property tests |

## Theorems and Their Tests

| Lean Theorem | Generated Test | What It Verifies |
|---|---|---|
| `combine_earned_comm` | `combine(a, b).earned === combine(b, a).earned` | Combining scores is commutative (earned) |
| `combine_possible_comm` | `combine(a, b).possible === combine(b, a).possible` | Combining scores is commutative (possible) |
| `combine_possible_ge` | `a.possible <= combine(a, b).possible` | Combined possible score never shrinks |
| `bonus_increases` | `s.earned <= addBonus(s, bonus).earned` | Bonus never decreases earned score |
| `bonus_preserves_possible` | `addBonus(s, bonus).possible === s.possible` | Bonus doesn't affect possible score |

## The Bug That Lean Finds

Forget to add the `possible` fields when combining:

```typescript
function combine(a: Score, b: Score): Score {
  return { earned: a.earned + b.earned, possible: a.possible }; // Oops
}
```

`combinePossibleComm` fails — because `a.possible !== b.possible` in general, and the function silently drops `b.possible`. The commutativity property catches what a unit test with equal scores would miss.

## Run the Tests

```bash
npx vitest run examples/scoring/generated/properties.test.ts
```
