<p align="right"><a href="README.ja.md">日本語</a></p>

# Point — Your First lean2ts Example

The simplest possible example. One structure, one function, one theorem. If you're new to lean2ts, start here.

## What Gets Generated

| Lean | Generated | What it does |
|---|---|---|
| `structure Point` | `export interface Point { readonly x: number; readonly y: number }` | Fields become `readonly` properties |
| `def double` | `export function double(n: number): number { ... }` | Function stub with TODO |
| `theorem add_zero` | `fc.property(fc.nat(), (n) => (n + 0) === n)` | Arithmetic identity as a property test |

## Type Mapping

```
Lean Nat  =>  TypeScript number  =>  fc.nat()
```

Lean's `Nat` maps to TypeScript `number`. In fast-check, it generates `fc.nat()` which produces non-negative integers — preserving the Lean semantics.

## Run the Tests

```bash
npx vitest run examples/point/generated/properties.test.ts
```
