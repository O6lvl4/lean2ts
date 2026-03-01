<p align="right"><a href="README.md">English</a></p>

# Pricing — 割引・税計算のビジネスルール

料金計算における不変条件を Lean で証明し、TypeScript のプロパティテストとして自動生成する例。

## Lean 仕様 → 生成コード

| Lean | 生成ファイル | 内容 |
|---|---|---|
| `inductive Discount` | `types.ts` | `Discount` 判別共用体 + 型ガード (`isNone`, `isPercent`, `isFixed`) |
| `structure LineItem` | `types.ts` | `LineItem` interface |
| `def lineTotal`, `applyDiscount`, `addTax` | `stubs.ts` | 関数スタブ → 自分で実装する |
| `theorem discount_bounded` 他4件 | `properties.test.ts` | fast-check プロパティテスト |

## 定理とテストの対応

| Lean 定理 | 生成されるテスト | 何を検証するか |
|---|---|---|
| `discount_bounded` | `applyDiscount(amount, d) <= amount` | 割引後は元の金額以下 |
| `discount_nonneg` | `0 <= applyDiscount(amount, d)` | 割引後は非負（Lean では自明、TS では自明ではない） |
| `tax_increases` | `amount <= addTax(amount, rate)` | 税込は税抜以上 |
| `double_discount_le` | `applyDiscount(applyDiscount(amount, d), d) <= applyDiscount(amount, d)` | 二重割引は単一割引以下 |

## バグ検出のデモ

`stubs.ts` に素朴な実装を書くと:

```typescript
case "fixed": return amount - d.amount;  // JS では負になりうる
```

`discountNonneg` テストが失敗する:

```
Counterexample: [1, {"tag":"percent","rate":200}]
applyDiscount(1, { tag: "percent", rate: 200 }) → -1  (≥ 0 ではない)
```

正しい実装は `Math.max(0, ...)` で Lean の Nat（自然に 0 でクリップ）と同じ挙動にする。

## テスト実行

```bash
npx vitest run examples/pricing/generated/properties.test.ts
```
