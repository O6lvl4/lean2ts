<p align="right"><a href="README.md">English</a></p>

# Inventory — 在庫管理の不変条件

在庫 (`Stock`) の引き当て・出荷・入庫操作に対する保存則・単調性を Lean で証明し、プロパティテストとして自動生成する例。

## Lean 仕様 → 生成コード

| Lean | 生成ファイル | 内容 |
|---|---|---|
| `structure Stock` | `types.ts` | `Stock` interface (`available`, `reserved`) |
| `def totalStock`, `reserve`, `cancelReservation`, `ship`, `restock` | `stubs.ts` | 関数スタブ |
| `theorem reserve_preserves_total` 他5件 | `properties.test.ts` | fast-check プロパティテスト |

## 定理とテストの対応

| Lean 定理 | 生成されるテスト | 何を検証するか |
|---|---|---|
| `reserve_preserves_total` | `totalStock(reserve(s, qty)) === totalStock(s)` | 引き当ては在庫総数を保存する |
| `cancel_preserves_total` | `totalStock(cancelReservation(s, qty)) === totalStock(s)` | キャンセルも在庫総数を保存する |
| `ship_decreases_total` | `totalStock(ship(s, qty)) <= totalStock(s)` | 出荷は在庫総数を超えない |
| `restock_increases_available` | `s.available <= restock(s, qty).available` | 入庫で available は増える |
| `reserve_available_le` | `reserve(s, qty).available <= s.available` | 引き当てで available は減る |
| `ship_preserves_available` | `ship(s, qty).available === s.available` | 出荷は available を変更しない |

## バグ検出のデモ

### バグ 1: `cancelReservation` で `reserved` の減算を忘れる

```typescript
function cancelReservation(s: Stock, qty: number): Stock {
  if (qty <= s.reserved) {
    return { available: s.available + qty, reserved: s.reserved }; // reserved を減らし忘れ
  }
  return s;
}
```

`cancelPreservesTotal` テストが失敗する — available に加算したのに reserved から引かないと総数が増えてしまう:

```
Counterexample: [{"available":0,"reserved":1}, 1]
totalStock(cancelReservation({available:0, reserved:1}, 1)) → 2  (≠ 1)
```

### バグ 2: `ship` で `available` も減らしてしまう

```typescript
function ship(s: Stock, qty: number): Stock {
  if (qty <= s.reserved) {
    return { available: s.available - qty, reserved: s.reserved - qty }; // available も引いた
  }
  return s;
}
```

`shipPreservesAvailable` テストが失敗する — 出荷は reserved からのみ消費すべき:

```
Counterexample: [{"available":0,"reserved":1}, 1]
ship({available:0, reserved:1}, 1).available → -1  (≠ 0)
```

## ポイント

pricing の例が「Lean の Nat 自然数 vs JS の number」の差を検出するのに対し、この例は**保存則（conservation law）**と**不変条件（invariant）**の違反を検出する。

- `reserve` / `cancelReservation` は在庫を available ↔ reserved 間で移動するだけなので、**総数は不変**
- `ship` は reserved からのみ消費するので、**available は不変**
- これらの性質は Lean で証明済みであり、TypeScript 実装がそれに従うかをプロパティテストで検証する

## テスト実行

```bash
npx vitest run examples/inventory/generated/properties.test.ts
```
