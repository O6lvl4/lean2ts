<p align="right"><a href="README.ja.md">日本語</a></p>

# Generics — Type Parameters That Just Work

Lean's type parameters map directly to TypeScript generics. Both explicit `(α : Type)` and implicit `{α : Type}` parameters become `<α>` in the generated code.

## Generic Structures

```lean
structure Wrapper (α : Type) where
  value : α
  label : String
```

```typescript
export interface Wrapper<α> {
  readonly value: α;
  readonly label: string;
}
```

## Generic Functions

```lean
def swap {α β : Type} (p : α × β) : β × α := (p.2, p.1)
```

```typescript
export function swap<α, β>(p: readonly [α, β]): readonly [β, α] { ... }
```

Implicit parameters `{α : Type}` become type parameters `<α>` — they're inferred at the call site in both languages. `α × β` (Prod) becomes `readonly [α, β]` (tuple).

## Arbitrary Factory Functions

This is where it gets interesting. A non-generic type gets a simple constant arbitrary. But a generic type needs to know *how to generate its type parameters*. lean2ts handles this by generating factory functions:

```typescript
// Non-generic => constant
export const arbPoint: fc.Arbitrary<Point> = fc.record({ ... });

// Generic => factory function that takes an arbitrary for each type parameter
export function arbWrapper<α>(arbα: fc.Arbitrary<α>): fc.Arbitrary<Wrapper<α>> {
  return fc.record({
    value: arbα,
    label: fc.string(),
  });
}
```

Usage is natural:

```typescript
const arbStringWrapper = arbWrapper(fc.string());
const arbNumberWrapper = arbWrapper(fc.nat());
```

## Lean → TypeScript Mapping

| Lean | TypeScript |
|---|---|
| `(α : Type)` explicit type parameter | `<α>` generic |
| `{α : Type}` implicit type parameter | `<α>` generic |
| `[ToString α]` typeclass constraint | Excluded from parameters |
| `α × β` (Prod) | `readonly [α, β]` |
| `List α` | `ReadonlyArray<α>` |
