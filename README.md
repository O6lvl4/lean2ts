# lean2ts

Lean 4 の仕様から TypeScript の型・プロパティテスト・関数スタブを自動生成するツール。

Lean で書いた構造体・帰納型・定理・関数定義を [Pantograph](https://github.com/lenianiva/Pantograph) で解析し、型安全な TypeScript コードを出力する。

## パイプライン

```
Lean 4 ソース
  │
  ├─ Pantograph で解析（構造体・帰納型・定理・関数を抽出）
  │
  ├─ 中間表現（IR）に変換
  │
  └─ TypeScript コード生成
       ├── types.ts          型定義（interface / discriminated union）
       ├── stubs.ts          関数スタブ
       ├── arbitraries.ts    fast-check Arbitrary 生成器
       └── properties.test.ts プロパティテスト（vitest）
```

## クイックスタート

### 前提条件

- Node.js 22+
- [Lean 4](https://leanprover.github.io/lean4/doc/setup.html)
- [Pantograph](https://github.com/lenianiva/Pantograph)（`pantograph-repl` がビルド済み）

### インストール

```bash
npm install
```

### 使い方

```bash
# Lean ファイルから TypeScript を生成
npx tsx src/index.ts input.lean -o ./generated

# ドライラン（ファイル出力なし）
npx tsx src/index.ts input.lean --dry-run

# Pantograph パスを指定
npx tsx src/index.ts input.lean --pantograph /path/to/pantograph-repl
```

## 生成例

### 入力: Lean 4

```lean
import Init

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

### 出力: TypeScript

**types.ts**
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
// ...
```

**stubs.ts**
```typescript
export function double(n: number): number {
  // TODO: implement
  return 0;
}
```

**arbitraries.ts**
```typescript
import fc from "fast-check";

export const arbPoint: fc.Arbitrary<Point> = fc.record({
  x: fc.nat(),
  y: fc.nat(),
});
```

**properties.test.ts**
```typescript
describe("properties", () => {
  it("addZero", () => {
    fc.assert(fc.property(fc.nat(), (n) => (n + 0) === n));
  });
});
```

## sorry 自動証明（prove コマンド）

LLM（Cloudflare Workers AI）と Pantograph を組み合わせて、Lean ファイル内の `sorry`（証明の穴）を自動的に埋める。

```bash
export CLOUDFLARE_ACCOUNT_ID=xxx
export CLOUDFLARE_API_KEY=xxx
export CLOUDFLARE_EMAIL=xxx

npx tsx src/index.ts prove input.lean \
  --pantograph /path/to/pantograph-repl \
  --lean-path /path/to/lean/lib \
  --verbose
```

### 動作フロー

```
Lean ファイル（sorry 付き）
  │
  ├─ sorry-finder: sorry の位置と定理文を抽出
  │
  ├─ tactic-llm: Workers AI にタクティクを提案させる
  │
  └─ proof-loop: 提案 → sorry 置換 → Pantograph 検証 → 成功 or リトライ
```

### 実行例

```
$ npx tsx src/index.ts prove test/fixtures/sorry-examples/two-sorries.lean --verbose

[prove] trying "rfl" for add_zero (attempt 1)
[prove] success: add_zero proved with "rfl"
[prove] trying "rfl" for zero_add (attempt 2)
[prove] trying "simp" for zero_add (attempt 3)
[prove] success: zero_add proved with "simp"

theorem add_zero (n : Nat) : n + 0 = n := by rfl
theorem zero_add (n : Nat) : 0 + n = n := by simp

[prove] success: all sorries proved in 3 attempt(s)
```

### prove オプション

```
--model <name>         LLM モデル (default: @cf/deepseek-ai/deepseek-r1-distill-qwen-32b)
--pantograph <path>    pantograph-repl のパス
--lean-path <path>     LEAN_PATH（Lean ライブラリパス）
--max-attempts <n>     最大リトライ回数 (default: 3)
--verbose              ログ出力
```

### 環境変数

| 変数 | 説明 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID |
| `CLOUDFLARE_API_TOKEN` | API トークン（Bearer 認証） |
| `CLOUDFLARE_API_KEY` | Global API キー（`CLOUDFLARE_EMAIL` と併用） |
| `CLOUDFLARE_EMAIL` | Cloudflare メールアドレス |

## CLI リファレンス

```
Usage: lean2ts <input.lean> [options]
       lean2ts prove <input.lean> [options]

Options:
  -o, --out <dir>        出力ディレクトリ (default: ./generated)
  --pantograph <path>    pantograph-repl のパス
  --modules <names...>   Lean モジュール
  --no-tests             テスト生成スキップ
  --no-stubs             スタブ生成スキップ
  --verbose              Pantograph 通信ログ出力
  --dry-run              生成内容を表示（書き込みなし）
  -h, --help             ヘルプ表示
```

## 開発

```bash
# テスト
npm test

# 型チェック
npm run lint

# サンプル生成
npm run examples
```

## アーキテクチャ

```
src/
├── cli.ts                  CLI エントリーポイント
├── config.ts               設定型・デフォルト値
├── index.ts                実行エントリーポイント
├── lean-ts-map.ts          Lean → TypeScript 型マッピング
├── extractor/              Lean 宣言の抽出
├── generator/              TypeScript コード生成
├── ir/                     中間表現の型定義
├── pantograph/             Pantograph REPL クライアント
├── prover/                 LLM による sorry 自動証明
└── sexp/                   S 式パーサー
```

## ライセンス

MIT
