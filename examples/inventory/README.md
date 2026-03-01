# Inventory — Conservation Laws for Business Logic

In physics, energy is conserved. In inventory management, stock is conserved — reserving items moves them from `available` to `reserved`, but the total doesn't change. Shipping removes items from `reserved`, but should never touch `available`.

These conservation laws are easy to state but surprisingly easy to break in code. lean2ts lets you prove them in Lean and enforce them in TypeScript.

## What Gets Generated

| Lean | Generated File | Content |
|---|---|---|
| `structure Stock` | `types.ts` | `Stock` interface (`available`, `reserved`) |
| `def totalStock`, `reserve`, `cancelReservation`, `ship`, `restock` | `stubs.ts` | Function stubs |
| 6 theorems | `properties.test.ts` | fast-check property tests |

## Theorems and Their Tests

| Lean Theorem | Generated Test | What It Verifies |
|---|---|---|
| `reserve_preserves_total` | `totalStock(reserve(s, qty)) === totalStock(s)` | Reserving stock preserves total count |
| `cancel_preserves_total` | `totalStock(cancelReservation(s, qty)) === totalStock(s)` | Cancellation preserves total count |
| `ship_decreases_total` | `totalStock(ship(s, qty)) <= totalStock(s)` | Shipping can only decrease total |
| `restock_increases_available` | `s.available <= restock(s, qty).available` | Restocking increases availability |
| `reserve_available_le` | `reserve(s, qty).available <= s.available` | Reserving decreases availability |
| `ship_preserves_available` | `ship(s, qty).available === s.available` | Shipping doesn't touch available stock |

## Bug 1: Forgetting to Decrement `reserved`

```typescript
function cancelReservation(s: Stock, qty: number): Stock {
  if (qty <= s.reserved) {
    return { available: s.available + qty, reserved: s.reserved }; // Forgot to subtract
  }
  return s;
}
```

`cancelPreservesTotal` catches it instantly — you added to `available` but didn't subtract from `reserved`, so stock appeared out of thin air:

```
Counterexample: [{"available":0,"reserved":1}, 1]
totalStock(cancelReservation({available:0, reserved:1}, 1)) => 2  (expected 1)
```

## Bug 2: Shipping from the Wrong Bucket

```typescript
function ship(s: Stock, qty: number): Stock {
  if (qty <= s.reserved) {
    return { available: s.available - qty, reserved: s.reserved - qty }; // Touched available!
  }
  return s;
}
```

`shipPreservesAvailable` catches it — shipping should only consume `reserved` stock, never `available`:

```
Counterexample: [{"available":0,"reserved":1}, 1]
ship({available:0, reserved:1}, 1).available => -1  (expected 0)
```

## Why This Matters

Unlike the [pricing example](../pricing/), which catches Lean `Nat` vs JavaScript `number` bugs, this example catches **structural bugs** — operations that modify the wrong field or forget a step in a multi-field update. These bugs are common in real codebases and hard to catch with unit tests because they only manifest when specific field combinations are tested.

Conservation laws and field-level invariants are a natural fit for property-based testing, and Lean gives you mathematical certainty that the properties hold.

## Run the Tests

```bash
npx vitest run examples/inventory/generated/properties.test.ts
```
