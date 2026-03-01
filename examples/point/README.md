# Point — 基本的な型変換

lean2ts の最小限の動作を示す例。構造体、関数定義、定理それぞれの変換を確認できる。

## Lean → TypeScript

| Lean | 生成 | 説明 |
|---|---|---|
| `structure Point` | `export interface Point { readonly x: number; readonly y: number }` | フィールドは `readonly` |
| `def double` | `export function double(n: number): number { ... }` | 関数スタブ（TODO 付き） |
| `theorem add_zero` | `fc.property(fc.nat(), (n) => (n + 0) === n)` | 算術の恒等式テスト |

## 型マッピング

```
Lean Nat  →  TypeScript number  →  fc.nat()
```

`Nat` は TypeScript の `number` に、fast-check では `fc.nat()`（非負整数）にマッピングされる。

## テスト実行

```bash
npx vitest run examples/point/generated/properties.test.ts
```
