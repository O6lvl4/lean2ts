<p align="right"><a href="README.md">English</a></p>

# lean2ts

Lean 4 の形式仕様から TypeScript コードを自動生成する。

定理はプロパティテストに、構造体は interface に、帰納型は判別共用体になる。**ビジネスルールを Lean で証明し、その保証を TypeScript のテストとして持ち込む。**

## 何が嬉しいか

料金計算のビジネスルールを例にする。

### Lean で仕様を書く

```lean
-- 割引種別
inductive Discount where
  | none
  | percent (rate : Nat)
  | fixed (amount : Nat)

-- 割引適用（Nat の引き算は自然に 0 で下限クリップ）
def applyDiscount (amount : Nat) (d : Discount) : Nat :=
  match d with
  | .none => amount
  | .percent rate => amount - amount * rate / 100
  | .fixed v => amount - v

-- 税込計算
def addTax (amount rate : Nat) : Nat :=
  amount + amount * rate / 100
```

ここまでは型と関数の定義。次がポイント:

```lean
-- ビジネスルール: 割引後の金額は元の金額を超えない
theorem discount_bounded (amount : Nat) (d : Discount) :
    applyDiscount amount d ≤ amount := by
  cases d <;> simp [applyDiscount] <;> omega

-- ビジネスルール: 税込は税抜以上
theorem tax_increases (amount rate : Nat) :
    amount ≤ addTax amount rate := by
  simp [addTax]; omega
```

Lean はこれらの定理を**数学的に証明**する。コンパイルが通れば正しさが保証される。

### lean2ts で TypeScript を生成

`npx lean2ts pricing.lean` を実行すると 4 ファイルが生成される:

**types.ts** — 型定義

```typescript
export type Discount =
  | { readonly tag: "none" }
  | { readonly tag: "percent"; readonly rate: number }
  | { readonly tag: "fixed"; readonly amount: number };

export function isPercent(x: Discount): x is Extract<Discount, { tag: "percent" }> {
  return x.tag === "percent";
}
// isNone, isFixed も生成
```

**stubs.ts** — 関数スタブ（あなたが実装する）

```typescript
export function applyDiscount(amount: number, d: Discount): number {
  // TODO: implement
  return 0;
}

export function addTax(amount: number, rate: number): number {
  // TODO: implement
  return 0;
}
```

**properties.test.ts** — 定理がプロパティテストになる

```typescript
describe("properties", () => {
  // discount_bounded: 割引後 ≤ 元の金額
  it("discountBounded", () => {
    fc.assert(
      fc.property(fc.nat(), arbDiscount, (amount, d) => {
        return applyDiscount(amount, d) <= amount;
      })
    );
  });

  // discount_nonneg: 割引後 ≥ 0（Lean の Nat では自明、TS では自明ではない）
  it("discountNonneg", () => {
    fc.assert(
      fc.property(fc.nat(), arbDiscount, (amount, d) => {
        return 0 <= applyDiscount(amount, d);
      })
    );
  });

  // tax_increases: 税込 ≥ 税抜
  it("taxIncreases", () => {
    fc.assert(
      fc.property(fc.nat(), fc.nat(), (amount, rate) => {
        return amount <= addTax(amount, rate);
      })
    );
  });
});
```

### バグのある実装を書くと、テストが落ちる

TypeScript で素朴に実装してみる:

```typescript
function applyDiscount(amount: number, d: Discount): number {
  switch (d.tag) {
    case "none":    return amount;
    case "percent": return amount - (amount * d.rate / 100);
    case "fixed":   return amount - d.amount;  // ← バグ: 負の値になりうる
  }
}
```

JavaScript の引き算は負の値を返す。Lean の `Nat` は 0 で止まるが、TypeScript はそうではない。`discountNonneg` テストがこれを捕まえる:

```
 FAIL  discountNonneg
   Counterexample: [1, {"tag":"percent","rate":200}]
   applyDiscount(1, { tag: "percent", rate: 200 }) → -1  (≥ 0 ではない)
```

正しい実装は `Math.max(0, ...)` で Lean の Nat と同じ振る舞いにする:

```typescript
case "percent": return Math.max(0, amount - Math.floor(amount * d.rate / 100));
case "fixed":   return Math.max(0, amount - d.amount);
```

**Lean の証明が保証する性質を、TypeScript のテストが自動で検証する。** バグは実装直後に見つかる。

> 完全な例: [`examples/pricing/`](examples/pricing/)

---

## 変換の全体像

```
Lean 4 ソース (.lean)
  │
  ├─ structure        →  interface
  ├─ inductive        →  discriminated union + type guards
  ├─ theorem          →  fast-check property test
  ├─ def              →  function stub
  │
  └─ sorry            →  LLM + Pantograph で自動証明
```

### 型マッピング

| Lean | TypeScript | fast-check |
|---|---|---|
| `Nat` | `number` | `fc.nat()` |
| `Int` | `number` | `fc.integer()` |
| `String` | `string` | `fc.string()` |
| `Bool` | `boolean` | `fc.boolean()` |
| `List α` | `ReadonlyArray<α>` | `fc.array(...)` |
| `Option α` | `α \| undefined` | `fc.option(...)` |
| `α × β` | `readonly [α, β]` | `fc.tuple(...)` |

### ジェネリクス

型パラメータ付きの定義もそのまま変換する。

```lean
structure Wrapper (α : Type) where
  value : α
  label : String
```

```typescript
// types.ts
export interface Wrapper<α> {
  readonly value: α;
  readonly label: string;
}

// arbitraries.ts — ファクトリ関数として生成
export function arbWrapper<α>(arbΑ: fc.Arbitrary<α>): fc.Arbitrary<Wrapper<α>> {
  return fc.record({
    value: arbΑ,
    label: fc.string(),
  });
}
```

---

## sorry 自動証明

Lean ファイル内の `sorry`（証明の穴）を LLM と Pantograph で自動的に埋める。

```bash
export CLOUDFLARE_ACCOUNT_ID=xxx
export CLOUDFLARE_API_TOKEN=xxx

npx lean2ts prove input.lean --verbose
```

```
[prove] trying "rfl" for add_zero (attempt 1)
[prove] success: add_zero proved with "rfl"
[prove] trying "rfl" for zero_add (attempt 2)
[prove] trying "simp" for zero_add (attempt 3)
[prove] success: zero_add proved with "simp"

[prove] success: all sorries proved in 3 attempt(s)
```

---

## セットアップ

### 前提条件

- Node.js 22+
- [Lean 4](https://leanprover.github.io/lean4/doc/setup.html)
- [Pantograph](https://github.com/lenianiva/Pantograph)

### インストール

```bash
npm install
npm run build
```

### 実行

```bash
# コード生成
npx lean2ts input.lean -o ./generated

# ドライラン
npx lean2ts input.lean --dry-run

# sorry 自動証明
npx lean2ts prove input.lean --verbose
```

## CLI リファレンス

### `lean2ts <input.lean> [options]`

| オプション | 説明 | デフォルト |
|---|---|---|
| `-o, --out <dir>` | 出力ディレクトリ | `./generated` |
| `--pantograph <path>` | pantograph-repl のパス | `pantograph-repl` |
| `--modules <names...>` | Lean モジュール | — |
| `--no-tests` | テスト生成スキップ | — |
| `--no-stubs` | スタブ生成スキップ | — |
| `--verbose` | 詳細ログ | — |
| `--dry-run` | stdout に表示（書き込みなし） | — |

### `lean2ts prove <input.lean> [options]`

| オプション | 説明 | デフォルト |
|---|---|---|
| `--model <name>` | LLM モデル | `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` |
| `--pantograph <path>` | pantograph-repl のパス | `pantograph-repl` |
| `--lean-path <path>` | LEAN_PATH | — |
| `--max-attempts <n>` | 最大リトライ回数 | `3` |
| `--verbose` | 詳細ログ | — |

### 環境変数（prove）

| 変数 | 説明 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID |
| `CLOUDFLARE_API_TOKEN` | API トークン |
| `CLOUDFLARE_API_KEY` | Global API キー（`EMAIL` と併用） |
| `CLOUDFLARE_EMAIL` | Cloudflare メールアドレス |

## アーキテクチャ

```
src/
├── index.ts               エントリーポイント
├── cli.ts                 CLI 引数パース
├── lean-ts-map.ts         Lean → TypeScript 型マッピング
│
├── s-expression/          S 式パーサー
│   ├── parser.ts            トークナイザ + パーサー
│   └── lean-expr.ts         SexpNode → LeanExpr AST
│
├── extractor/             Lean 宣言の抽出
│   ├── classifier.ts        宣言種別の判定
│   ├── structure-parser.ts  構造体 → IR
│   ├── inductive-parser.ts  帰納型 → IR
│   ├── theorem-parser.ts    定理 → IR
│   ├── def-parser.ts        関数定義 → IR
│   └── type-resolver.ts     Lean 型 → IRType
│
├── generator/             TypeScript コード生成
│   ├── type-generator.ts    types.ts
│   ├── arbitrary-generator.ts  arbitraries.ts
│   ├── property-generator.ts   properties.test.ts
│   └── stub-generator.ts    stubs.ts
│
├── pantograph/            Pantograph REPL クライアント
│   ├── client.ts            JSON RPC over stdin/stdout
│   └── protocol.ts          プロトコル型定義
│
└── prover/                sorry 自動証明
    ├── sorry-finder.ts      sorry 位置検出
    ├── proof-loop.ts        提案 → 検証ループ
    └── tactic-llm.ts        LLM 連携
```

## 開発

```bash
npm test              # テスト実行
npm run test:watch    # ウォッチモード
npm run lint          # 型チェック
npm run examples      # サンプル生成（要 Pantograph）
```

## ライセンス

MIT
