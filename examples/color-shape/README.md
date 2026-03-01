# Color & Shape — Inductive Types as Discriminated Unions

Lean's `inductive` types are one of its most powerful features. lean2ts converts them into TypeScript discriminated unions — the idiomatic way to model "one of several possible shapes" in TypeScript.

## Enum-like Types (No Fields)

```lean
inductive Color where
  | red | green | blue
```

```typescript
export type Color =
  | { readonly tag: "red" }
  | { readonly tag: "green" }
  | { readonly tag: "blue" };

// Type guard functions are auto-generated
export function isRed(x: Color): x is Extract<Color, { tag: "red" }> {
  return x.tag === "red";
}
```

Each constructor becomes a tagged variant. Type guards give you narrowing for free.

## Variants with Fields

```lean
inductive Shape where
  | circle (radius : Nat)
  | rect (width : Nat) (height : Nat)
  | point
```

```typescript
export type Shape =
  | { readonly tag: "circle"; readonly radius: number }
  | { readonly tag: "rect"; readonly width: number; readonly height: number }
  | { readonly tag: "point" };
```

Each variant gets exactly the fields it needs. No optional properties, no null checks — the type system enforces correctness.

## Arbitrary Generation

fast-check arbitraries are generated to match the union structure:

```typescript
// No fields => fc.constant
// With fields => fc.record
export const arbShape = fc.oneof(
  fc.record({ tag: fc.constant("circle" as const), radius: fc.nat() }),
  fc.record({ tag: fc.constant("rect" as const), width: fc.nat(), height: fc.nat() }),
  fc.constant({ tag: "point" as const })
);
```

`fc.oneof` randomly selects a variant, and each variant's fields are randomly generated. Your property tests exercise all branches automatically.
