# Generics — 型パラメータとジェネリクス

Lean の型パラメータ付き定義が TypeScript のジェネリクスに変換される例。

## Lean → TypeScript

### 型パラメータ付き構造体

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

### implicit 型パラメータ付き関数

```lean
def swap {α β : Type} (p : α × β) : β × α := (p.2, p.1)
```

```typescript
export function swap<α, β>(p: readonly [α, β]): readonly [β, α] { ... }
```

`{α : Type}` の implicit パラメータは TypeScript の型パラメータ `<α>` に変換される。`α × β`（Prod）は `readonly [α, β]`（タプル）になる。

## Arbitrary のファクトリ関数

ジェネリック型の Arbitrary は定数ではなくファクトリ関数として生成される:

```typescript
// 非ジェネリック → const
export const arbPoint: fc.Arbitrary<Point> = fc.record({ ... });

// ジェネリック → function（型パラメータの Arbitrary を引数で受け取る）
export function arbWrapper<α>(arbΑ: fc.Arbitrary<α>): fc.Arbitrary<Wrapper<α>> {
  return fc.record({
    value: arbΑ,
    label: fc.string(),
  });
}
```

使用時は具体的な Arbitrary を渡す:

```typescript
const arbStringWrapper = arbWrapper(fc.string());
const arbNumberWrapper = arbWrapper(fc.nat());
```

## 対応する Lean の機能

| Lean | TypeScript |
|---|---|
| `(α : Type)` explicit 型パラメータ | `<α>` ジェネリクス |
| `{α : Type}` implicit 型パラメータ | `<α>` ジェネリクス |
| `[ToString α]` 型クラス制約 | パラメータからは除外 |
| `α × β` (Prod) | `readonly [α, β]` |
| `List α` | `ReadonlyArray<α>` |
