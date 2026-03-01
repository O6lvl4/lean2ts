# lean2ts

Lean 4 の仕様を解析して TypeScript コードを自動生成するツール。

[Pantograph](https://github.com/lenianiva/Pantograph) REPL 経由で Lean の構造体・帰納型・定理・関数定義を読み取り、型安全な TypeScript の型定義・テスト・関数スタブを出力する。さらに LLM を使った `sorry` の自動証明機能も備える。

## 何ができるか

```
Lean 4 ソース (.lean)
  │
  ├─ 構造体          →  TypeScript interface
  ├─ 帰納型          →  判別共用体 + 型ガード関数
  ├─ 定理            →  fast-check プロパティテスト
  ├─ 関数定義 (def)  →  関数スタブ (TODO: implement)
  │
  └─ sorry (証明の穴) →  LLM + Pantograph で自動証明
```

## 生成例

### 入力

```lean
structure Point where
  x : Nat
  y : Nat

inductive Shape where
  | circle (radius : Nat)
  | rect (width : Nat) (height : Nat)
  | point

def double (n : Nat) : Nat := n * 2

theorem add_zero (n : Nat) : n + 0 = n := by simp
```

### 出力

**types.ts** — 型定義

```typescript
export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Shape =
  | { readonly tag: "circle"; readonly radius: number }
  | { readonly tag: "rect"; readonly width: number; readonly height: number }
  | { readonly tag: "point" };

export function isCircle(x: Shape): x is Extract<Shape, { tag: "circle" }> {
  return x.tag === "circle";
}
// isRect, isPoint も同様に生成
```

**arbitraries.ts** — fast-check Arbitrary

```typescript
import fc from "fast-check";

export const arbPoint: fc.Arbitrary<Point> = fc.record({
  x: fc.nat(),
  y: fc.nat(),
});

export const arbShape: fc.Arbitrary<Shape> = fc.oneof(
  fc.record({ tag: fc.constant("circle" as const), radius: fc.nat() }),
  fc.record({ tag: fc.constant("rect" as const), width: fc.nat(), height: fc.nat() }),
  fc.constant({ tag: "point" as const })
);
```

**properties.test.ts** — プロパティテスト

```typescript
describe("properties", () => {
  it("addZero", () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        return (n + 0) === n;
      })
    );
  });
});
```

**stubs.ts** — 関数スタブ

```typescript
export function double(n: number): number {
  // TODO: implement
  return 0;
}
```

### ジェネリクス

型パラメータ付きの定義もサポートする。

```lean
structure Wrapper (α : Type) where
  value : α
  label : String

def swap {α β : Type} (a : α) (b : β) : β × α := (b, a)
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

// stubs.ts
export function swap<α, β>(a: α, b: β): readonly [β, α] { ... }
```

## セットアップ

### 前提条件

- Node.js 22+
- [Lean 4](https://leanprover.github.io/lean4/doc/setup.html)
- [Pantograph](https://github.com/lenianiva/Pantograph)（`pantograph-repl` がビルド済み）

### インストール

```bash
npm install
npm run build
```

## 使い方

### コード生成

```bash
# 基本
npx lean2ts input.lean -o ./generated

# ドライラン（ファイル出力なし、stdout に表示）
npx lean2ts input.lean --dry-run

# Pantograph パスを指定
npx lean2ts input.lean --pantograph /path/to/pantograph-repl

# テスト・スタブの生成をスキップ
npx lean2ts input.lean --no-tests --no-stubs
```

### sorry 自動証明

Lean ファイル内の `sorry`（証明の穴）を LLM（Cloudflare Workers AI）と Pantograph で自動的に埋める。

```bash
# 環境変数の設定
export CLOUDFLARE_ACCOUNT_ID=xxx
export CLOUDFLARE_API_TOKEN=xxx

# 実行
npx lean2ts prove input.lean --verbose
```

```
[prove] trying "rfl" for add_zero (attempt 1)
[prove] success: add_zero proved with "rfl"
[prove] trying "rfl" for zero_add (attempt 2)
[prove] trying "simp" for zero_add (attempt 3)
[prove] success: zero_add proved with "simp"

theorem add_zero (n : Nat) : n + 0 = n := by rfl
theorem zero_add (n : Nat) : 0 + n = n := by simp

[prove] success: all sorries proved in 3 attempt(s)
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
| `--verbose` | Pantograph 通信ログ出力 | — |
| `--dry-run` | 生成内容を表示（書き込みなし） | — |

### `lean2ts prove <input.lean> [options]`

| オプション | 説明 | デフォルト |
|---|---|---|
| `--model <name>` | LLM モデル | `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` |
| `--pantograph <path>` | pantograph-repl のパス | `pantograph-repl` |
| `--lean-path <path>` | LEAN_PATH | — |
| `--modules <names...>` | Lean モジュール | — |
| `--max-attempts <n>` | 最大リトライ回数 | `3` |
| `--verbose` | ログ出力 | — |

### 環境変数（prove コマンド）

| 変数 | 説明 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID |
| `CLOUDFLARE_API_TOKEN` | API トークン（Bearer 認証） |
| `CLOUDFLARE_API_KEY` | Global API キー（`EMAIL` と併用） |
| `CLOUDFLARE_EMAIL` | Cloudflare メールアドレス |

## Lean → TypeScript 型マッピング

| Lean | TypeScript | fast-check Arbitrary |
|---|---|---|
| `Nat` | `number` | `fc.nat()` |
| `Int` | `number` | `fc.integer()` |
| `Float` | `number` | `fc.double()` |
| `String` | `string` | `fc.string()` |
| `Bool` | `boolean` | `fc.boolean()` |
| `Unit` | `void` | `fc.constant(undefined)` |
| `List α` | `ReadonlyArray<α>` | `fc.array(...)` |
| `Option α` | `α \| undefined` | `fc.option(...)` |
| `α × β` | `readonly [α, β]` | `fc.tuple(...)` |
| `HashMap K V` | `ReadonlyMap<K, V>` | `fc.array(fc.tuple(...)).map(...)` |
| `UInt8` | `number` | `fc.nat({ max: 255 })` |
| `UInt16` | `number` | `fc.nat({ max: 65535 })` |

## アーキテクチャ

```
src/
├── index.ts               エントリーポイント
├── cli.ts                 CLI 引数パース・オーケストレーション
├── config.ts              設定型・デフォルト値
├── lean-ts-map.ts         Lean → TypeScript 型マッピング定義
│
├── s-expression/          S 式パーサー
│   ├── parser.ts            トークナイザ + パーサー → SexpNode
│   └── lean-expr.ts         SexpNode → LeanExpr AST 変換
│
├── extractor/             Lean 宣言の抽出
│   ├── index.ts             オーケストレーター
│   ├── classifier.ts        宣言種別の判定 (structure/inductive/theorem/def/skip)
│   ├── structure-parser.ts  構造体 → IR
│   ├── inductive-parser.ts  帰納型 → IR
│   ├── theorem-parser.ts    定理 → IR
│   ├── def-parser.ts        関数定義 → IR
│   └── type-resolver.ts     Lean 型 → IRType 解決
│
├── ir/                    中間表現
│   └── types.ts             LeanDecl, IRType, IRProp 等の型定義
│
├── generator/             TypeScript コード生成
│   ├── index.ts             オーケストレーター
│   ├── type-generator.ts    types.ts 生成
│   ├── arbitrary-generator.ts  arbitraries.ts 生成
│   ├── property-generator.ts   properties.test.ts 生成
│   ├── stub-generator.ts    stubs.ts 生成
│   └── codegen-utils.ts     共通ユーティリティ
│
├── pantograph/            Pantograph REPL クライアント
│   ├── client.ts            JSON RPC over stdin/stdout
│   └── protocol.ts          プロトコル型定義
│
└── prover/                sorry 自動証明
    ├── index.ts             エントリーポイント
    ├── sorry-finder.ts      sorry 位置検出
    ├── proof-loop.ts        提案 → 検証ループ
    └── tactic-llm.ts        Cloudflare Workers AI 連携
```

### パイプライン

```
.lean ファイル
    │
    ▼
Pantograph REPL ──── processFile → 定数名リスト
    │                 inspect → 型情報 (pp + sexp)
    ▼
S 式パーサー ──── sexp → SexpNode → LeanExpr AST
    │
    ▼
Classifier ──── 宣言種別の判定
    │
    ▼
Extractor ──── 各パーサーで IR に変換
    │
    ▼
Generator ──── IR から TypeScript コードを生成
    │
    ▼
types.ts / arbitraries.ts / properties.test.ts / stubs.ts
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
