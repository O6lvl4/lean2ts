[English](README.md)

# Color & Shape — 帰納型と判別共用体

Lean の帰納型 (`inductive`) が TypeScript の判別共用体 (discriminated union) に変換される例。

## Lean → TypeScript

### enum 相当（フィールドなし）

```lean
inductive Color where
  | red | green | blue
```

```typescript
export type Color =
  | { readonly tag: "red" }
  | { readonly tag: "green" }
  | { readonly tag: "blue" };

// 型ガード関数も自動生成
export function isRed(x: Color): x is Extract<Color, { tag: "red" }> {
  return x.tag === "red";
}
```

### フィールド付きバリアント

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

バリアントごとにフィールドの有無が異なる型を正確に生成する。

## fast-check Arbitrary

```typescript
// フィールドなし → fc.constant
export const arbColor = fc.oneof(
  fc.constant({ tag: "red" as const }),
  fc.constant({ tag: "green" as const }),
  fc.constant({ tag: "blue" as const })
);

// フィールドあり → fc.record、なし → fc.constant を混在
export const arbShape = fc.oneof(
  fc.record({ tag: fc.constant("circle" as const), radius: fc.nat() }),
  fc.record({ tag: fc.constant("rect" as const), width: fc.nat(), height: fc.nat() }),
  fc.constant({ tag: "point" as const })
);
```

`fc.oneof` でバリアントをランダムに選択し、各バリアントのフィールドも自動生成する。
