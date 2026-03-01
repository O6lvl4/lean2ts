<p align="right"><a href="README.ja.md">日本語</a></p>

# Pricing — When Lean Catches Bugs Your Tests Miss

This is lean2ts's flagship example. It demonstrates something subtle and important: **Lean's natural number arithmetic silently protects you from a class of bugs that JavaScript's numbers do not.**

In Lean, `Nat` subtraction floors at zero — `3 - 5 = 0`. In JavaScript, `3 - 5 = -2`. This difference is invisible in most test cases, but it causes real bugs in production.

## What Gets Generated

| Lean | Generated File | Content |
|---|---|---|
| `inductive Discount` | `types.ts` | `Discount` discriminated union + type guards |
| `structure LineItem` | `types.ts` | `LineItem` interface |
| `def lineTotal`, `applyDiscount`, `addTax` | `stubs.ts` | Function stubs for you to implement |
| 4 theorems | `properties.test.ts` | fast-check property tests |

## Theorems and Their Tests

| Lean Theorem | Generated Test | What It Verifies |
|---|---|---|
| `discount_bounded` | `applyDiscount(amount, d) <= amount` | Discounted price never exceeds original |
| `discount_nonneg` | `0 <= applyDiscount(amount, d)` | Discounted price is never negative |
| `tax_increases` | `amount <= addTax(amount, rate)` | Tax-inclusive is always >= tax-exclusive |
| `double_discount_le` | `applyDiscount(applyDiscount(a, d), d) <= applyDiscount(a, d)` | Applying discount twice gives <= single discount |

## The Bug That Lean Finds

Write the naive implementation:

```typescript
case "fixed": return amount - d.amount;  // Looks fine, right?
```

`discountNonneg` fails immediately:

```
Counterexample: [1, {"tag":"percent","rate":200}]
applyDiscount(1, { tag: "percent", rate: 200 }) => -1  (not >= 0)
```

A 200% discount on $1 gives -$1. Your customer just got paid to buy your product.

The fix is `Math.max(0, ...)` — mirroring what Lean's `Nat` does automatically.

## Run the Tests

```bash
npx vitest run examples/pricing/generated/properties.test.ts
```
