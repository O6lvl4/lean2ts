<p align="right"><a href="README.md">English</a></p>

<h1 align="center">lean2ts</h1>

<p align="center">
<strong>Lean で証明し、TypeScript でテストする。</strong>
</p>

<p align="center">
lean2ts は <a href="https://lean-lang.org/">Lean 4</a> の形式仕様を TypeScript に変換する。
型、関数スタブ、そして <a href="https://github.com/dubzzz/fast-check">fast-check</a> プロパティテストを自動生成する。<br>
ビジネスルールを Lean で書いて数学的に証明し、その保証を TypeScript のテストとして持ち込む。
</p>

<p align="center">
<img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
<img src="https://img.shields.io/badge/lean-4-blueviolet" alt="Lean 4">
<img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript">
<img src="https://img.shields.io/badge/node-%3E%3D22-green" alt="Node 22+">
</p>

---

## なぜ lean2ts か

割引計算の関数を書く。ユニットテストは通る。ある日、顧客に **-150円** が請求される — 割引が金額を超え、JavaScript が負の値を返したからだ。

Lean の自然数は**負にならない**。ビジネスルールを Lean で証明すれば、この種のバグは原理的に発生しない。しかし本番コードは TypeScript だ。**lean2ts がその橋を架ける。**

```
                    ┌─────────────────────────┐
  pricing.lean      │  Lean 4 コンパイラ      │
  ─────────────────▶│  定理を証明 ✓           │
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
  npx lean2ts       │  lean2ts                │
  ─────────────────▶│  TypeScript を生成      │
                    └──────────┬──────────────┘
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
          types.ts        stubs.ts     properties.test.ts
        (型定義)        (関数スタブ)   (定理 → テスト)
```

---

## クイックスタート

```bash
npx lean2ts pricing.lean -o ./generated
```

Lean ファイルを読み、[Pantograph](https://github.com/lenianiva/Pantograph) 経由で宣言を抽出し、TypeScript ファイルを出力する。

### 前提条件

- **Node.js 22+**
- **[Lean 4](https://lean-lang.org/lean4/doc/setup.html)**
- **[Pantograph](https://github.com/lenianiva/Pantograph)** — Lean のプログラマティックインターフェース

---

## 動作例

### 1. Lean で仕様を書く

```lean
inductive Discount where
  | none
  | percent (rate : Nat)
  | fixed (amount : Nat)

def applyDiscount (amount : Nat) (d : Discount) : Nat :=
  match d with
  | .none => amount
  | .percent rate => amount - amount * rate / 100
  | .fixed v => amount - v

-- 証明: 割引後の金額は元の金額を超えない
theorem discount_bounded (amount : Nat) (d : Discount) :
    applyDiscount amount d ≤ amount := by
  cases d <;> simp [applyDiscount] <;> omega

-- 証明: 結果は常に非負
theorem discount_nonneg (amount : Nat) (d : Discount) :
    0 ≤ applyDiscount amount d := by omega
```

コンパイルが通れば、証明は正しい。実行は不要。

### 2. TypeScript を生成

```bash
npx lean2ts pricing.lean
```

**types.ts** — 帰納型が判別共用体になる:

```typescript
export type Discount =
  | { readonly tag: "none" }
  | { readonly tag: "percent"; readonly rate: number }
  | { readonly tag: "fixed"; readonly amount: number };
```

**stubs.ts** — 実装すべき関数シグネチャ:

```typescript
export function applyDiscount(amount: number, d: Discount): number {
  // TODO: implement
  return 0;
}
```

**properties.test.ts** — 定理がプロパティテストになる:

```typescript
it("discountBounded", () => {
  fc.assert(
    fc.property(fc.nat(), arbDiscount, (amount, d) => {
      return applyDiscount(amount, d) <= amount;
    })
  );
});
```

### 3. 実装してテスト

素朴に実装してみる:

```typescript
case "percent": return amount - (amount * d.rate / 100);
case "fixed":   return amount - d.amount;
```

テストを実行:

```
FAIL  discountNonneg
  Counterexample: [1, { tag: "percent", rate: 200 }]
  applyDiscount(1, { tag: "percent", rate: 200 }) => -1
```

200% 割引を 1 ドルに適用すると JavaScript では -1 になる。Lean の `Nat` は 0 で止まる。修正:

```typescript
case "percent": return Math.max(0, amount - Math.floor(amount * d.rate / 100));
case "fixed":   return Math.max(0, amount - d.amount);
```

**Lean の証明が、TypeScript の実装が満たすべき性質を正確に教えてくれる。** バグは本番に届く前に見つかる。

> 完全なソース: [`examples/pricing/`](examples/pricing/)

---

## 生成されるもの

| Lean の構文 | TypeScript の出力 | ファイル |
|---|---|---|
| `structure` | `interface` | types.ts |
| `inductive` | 判別共用体 + 型ガード | types.ts |
| `theorem` | fast-check プロパティテスト | properties.test.ts |
| `def` | 関数スタブ | stubs.ts |
| 型パラメータ | ジェネリクス（ファクトリ関数） | arbitraries.ts |
| `sorry` | LLM + Pantograph で自動証明 | — |

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

型パラメータ付きの定義もそのまま変換される:

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

export function arbWrapper<α>(arbα: fc.Arbitrary<α>): fc.Arbitrary<Wrapper<α>> {
  return fc.record({ value: arbα, label: fc.string() });
}
```

---

## サンプル一覧

| サンプル | 内容 | 定理数 |
|---|---|:---:|
| [`point/`](examples/point/) | 構造体、関数、基本的な定理 | 1 |
| [`color-shape/`](examples/color-shape/) | 帰納型を判別共用体に変換 | — |
| [`generics/`](examples/generics/) | 型パラメータとファクトリ | 1 |
| [`pricing/`](examples/pricing/) | **実際のバグを捕まえるビジネスルール** | 4 |
| [`weather/`](examples/weather/) | 警報レベル、降水判定、バグ入り実装との比較 | 8 |
| [`scoring/`](examples/scoring/) | スコア集計の可換性と単調性 | 5 |
| [`inventory/`](examples/inventory/) | 在庫管理の保存則 | 6 |
| [`inquiry-state/`](examples/inquiry-state/) | 11状態のステートマシンと遷移証明 | 8 |

各サンプルは `.lean` ソースと `generated/` ディレクトリ（TypeScript 出力）を含む。

---

## sorry 自動証明

Lean の `sorry`（証明の穴）を LLM と Pantograph で自動的に埋める。
LLM がタクティクを提案し、Pantograph が Lean カーネルで検証する。LLM を信頼する必要はない。

```bash
npx lean2ts prove input.lean --verbose
```

```
[prove] trying "rfl" for add_zero …
[prove] ✓ add_zero proved with "rfl"
[prove] trying "simp" for zero_add …
[prove] ✓ zero_add proved with "simp"

All sorries resolved (3 attempts)
```

### LLM プロバイダー

OpenAI 互換 API であれば何でも使える。環境変数を設定すれば自動検出する:

```bash
# OpenAI
OPENAI_API_KEY=sk-... npx lean2ts prove input.lean

# Cloudflare Workers AI
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npx lean2ts prove input.lean

# Groq, Together, Fireworks など
LLM_BASE_URL=https://api.groq.com/openai/v1 LLM_API_KEY=gsk-... \
  npx lean2ts prove input.lean --model llama-3.3-70b-versatile

# Ollama（ローカル）
LLM_BASE_URL=http://localhost:11434/v1 \
  npx lean2ts prove input.lean --model deepseek-r1:32b
```

| 環境変数 | プロバイダー |
|---|---|
| `OPENAI_API_KEY` | OpenAI |
| `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI |
| `LLM_BASE_URL` + `LLM_API_KEY` [+ `LLM_MODEL`] | 任意の OpenAI 互換 |

---

## CLI リファレンス

### `lean2ts <input.lean> [options]`

Lean ファイルから TypeScript を生成する。

| オプション | 説明 | デフォルト |
|---|---|---|
| `-o, --out <dir>` | 出力ディレクトリ | `./generated` |
| `--pantograph <path>` | pantograph-repl のパス | `pantograph-repl` |
| `--modules <names...>` | 追加の Lean モジュール | — |
| `--no-tests` | テスト生成をスキップ | — |
| `--no-stubs` | スタブ生成をスキップ | — |
| `--verbose` | 詳細ログ | — |
| `--dry-run` | ファイル書き込みせず stdout に出力 | — |

### `lean2ts prove <input.lean> [options]`

`sorry` を自動証明する。

| オプション | 説明 | デフォルト |
|---|---|---|
| `--model <name>` | タクティク生成の LLM モデル | 自動 |
| `--base-url <url>` | OpenAI 互換 API の base URL | 自動 |
| `--api-key <key>` | LLM プロバイダーの API キー | 自動 |
| `--pantograph <path>` | pantograph-repl のパス | `pantograph-repl` |
| `--lean-path <path>` | モジュール解決の LEAN_PATH | — |
| `--max-attempts <n>` | sorry あたりの最大試行回数 | `3` |
| `--verbose` | 詳細ログ | — |

---

## 仕組み

```
Lean ソース (.lean)
  │
  │  Pantograph REPL
  ▼
S 式 AST
  │
  │  パーサー (src/s-expression/)
  ▼
Lean 式ツリー
  │
  │  抽出器 (src/extractor/)
  │  ├── structure → フィールド、型
  │  ├── inductive → コンストラクタ、パラメータ
  │  ├── theorem   → 仮説、結論
  │  └── def       → シグネチャ、引数
  ▼
中間表現
  │
  │  ジェネレータ (src/generator/)
  ▼
TypeScript ファイル
  ├── types.ts           型定義
  ├── arbitraries.ts     fast-check ジェネレータ
  ├── stubs.ts           関数スタブ
  └── properties.test.ts プロパティテスト
```

### ソース構成

```
src/
├── index.ts                  エントリーポイント (CLI)
├── cli.ts                    引数パース
├── lean-ts-map.ts            Lean → TS 型マッピング
├── s-expression/             S 式パーサー
│   ├── parser.ts               トークナイザ + 再帰下降
│   └── lean-expr.ts            SexpNode → LeanExpr AST
├── extractor/                宣言の抽出
│   ├── classifier.ts           種別判定 (struct/inductive/thm/def)
│   ├── structure-parser.ts     構造体 → IR
│   ├── inductive-parser.ts     帰納型 → IR
│   ├── theorem-parser.ts       定理 → IR
│   ├── def-parser.ts           関数定義 → IR
│   └── type-resolver.ts        Lean 型 → IRType
├── generator/                コード生成
│   ├── type-generator.ts       types.ts
│   ├── arbitrary-generator.ts  arbitraries.ts
│   ├── property-generator.ts   properties.test.ts
│   └── stub-generator.ts       stubs.ts
├── pantograph/               Pantograph REPL クライアント
│   ├── client.ts               JSON-RPC over stdin/stdout
│   └── protocol.ts             プロトコル型定義
└── prover/                   sorry 自動証明
    ├── sorry-finder.ts         sorry の位置検出
    ├── proof-loop.ts           提案 → 検証ループ
    └── tactic-llm.ts           LLM タクティク生成
```

---

## 開発

```bash
git clone <repo-url>
cd lean2ts
npm install
npm run build

npm test              # テスト実行 (vitest)
npm run test:watch    # ウォッチモード
npm run lint          # 型チェックのみ
npm run examples      # サンプル再生成（要 Pantograph）
```

---

## ライセンス

[MIT](LICENSE)
