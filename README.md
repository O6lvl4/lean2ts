<p align="right"><a href="README.ja.md">日本語</a></p>

# lean2ts

**Prove it in Lean. Test it in TypeScript.**

lean2ts converts Lean 4 formal specifications into TypeScript code. Theorems become property-based tests. Structures become interfaces. Inductive types become discriminated unions. You write business rules in Lean, prove them mathematically, and lean2ts brings those guarantees into your TypeScript codebase as automated tests.

## The Problem

You write a discount function. It looks correct. It passes your hand-written unit tests. Then one day, a customer gets charged -$1.50. The discount exceeded the price, and JavaScript happily returned a negative number.

Lean's natural numbers can't go negative. If you prove your business rules in Lean, that class of bugs is impossible. But your production code is in TypeScript. lean2ts bridges that gap.

## See It in Action

### Step 1: Write your spec in Lean

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

-- Prove: discount can never exceed the original amount
theorem discount_bounded (amount : Nat) (d : Discount) :
    applyDiscount amount d ≤ amount := by
  cases d <;> simp [applyDiscount] <;> omega

-- Prove: result is always non-negative
theorem discount_nonneg (amount : Nat) (d : Discount) :
    0 ≤ applyDiscount amount d := by omega
```

Lean verifies these theorems at compile time. If it compiles, the proofs are correct.

### Step 2: Generate TypeScript

```bash
npx lean2ts pricing.lean
```

This produces four files:

**types.ts** — Type-safe discriminated unions

```typescript
export type Discount =
  | { readonly tag: "none" }
  | { readonly tag: "percent"; readonly rate: number }
  | { readonly tag: "fixed"; readonly amount: number };
```

**stubs.ts** — Function signatures for you to implement

```typescript
export function applyDiscount(amount: number, d: Discount): number {
  // TODO: implement
  return 0;
}
```

**properties.test.ts** — Theorems become property tests

```typescript
it("discountNonneg", () => {
  fc.assert(
    fc.property(fc.nat(), arbDiscount, (amount, d) => {
      return 0 <= applyDiscount(amount, d);
    })
  );
});
```

### Step 3: Write your implementation

You implement the function naively:

```typescript
case "percent": return amount - (amount * d.rate / 100);
case "fixed":   return amount - d.amount;
```

Run the tests:

```
FAIL  discountNonneg
  Counterexample: [1, {"tag":"percent","rate":200}]
  applyDiscount(1, { tag: "percent", rate: 200 }) => -1
```

The test caught it instantly. A 200% discount on $1 gives -$1 in JavaScript, but Lean's `Nat` subtraction floors at zero. The fix:

```typescript
case "percent": return Math.max(0, amount - Math.floor(amount * d.rate / 100));
case "fixed":   return Math.max(0, amount - d.amount);
```

**Lean's proof told you exactly what your TypeScript implementation must guarantee.** The bug was found before it ever reached production.

> Full example: [`examples/pricing/`](examples/pricing/)

---

## What Gets Generated

```
Lean 4 source (.lean)
  |
  |-- structure        =>  interface
  |-- inductive        =>  discriminated union + type guards
  |-- theorem          =>  fast-check property test
  |-- def              =>  function stub
  |
  \-- sorry            =>  auto-proved via LLM + Pantograph
```

### Type Mapping

| Lean | TypeScript | fast-check |
|---|---|---|
| `Nat` | `number` | `fc.nat()` |
| `Int` | `number` | `fc.integer()` |
| `String` | `string` | `fc.string()` |
| `Bool` | `boolean` | `fc.boolean()` |
| `List α` | `ReadonlyArray<α>` | `fc.array(...)` |
| `Option α` | `α \| undefined` | `fc.option(...)` |
| `α × β` | `readonly [α, β]` | `fc.tuple(...)` |

### Generics

Type parameters carry over naturally.

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

// Generic arbitraries become factory functions
export function arbWrapper<α>(arbα: fc.Arbitrary<α>): fc.Arbitrary<Wrapper<α>> {
  return fc.record({ value: arbα, label: fc.string() });
}
```

---

## Examples

| Example | What it demonstrates |
|---|---|
| [`point/`](examples/point/) | The basics — struct, function, theorem |
| [`color-shape/`](examples/color-shape/) | Inductive types as discriminated unions |
| [`generics/`](examples/generics/) | Type parameters and factory arbitraries |
| [`pricing/`](examples/pricing/) | Business rules that catch real bugs |
| [`scoring/`](examples/scoring/) | Commutativity and monotonicity in score aggregation |
| [`inventory/`](examples/inventory/) | Conservation laws in stock management |

---

## Auto-Proving `sorry`

lean2ts can automatically fill in `sorry` (proof holes) using LLM-generated tactics verified by Pantograph.

```bash
export CLOUDFLARE_ACCOUNT_ID=xxx
export CLOUDFLARE_API_TOKEN=xxx

npx lean2ts prove input.lean --verbose
```

```
[prove] trying "rfl" for add_zero (attempt 1)
[prove] success: add_zero proved with "rfl"
[prove] trying "simp" for zero_add (attempt 2)
[prove] success: zero_add proved with "simp"

[prove] all sorries resolved in 3 attempt(s)
```

---

## Getting Started

### Prerequisites

- Node.js 22+
- [Lean 4](https://leanprover.github.io/lean4/doc/setup.html)
- [Pantograph](https://github.com/lenianiva/Pantograph)

### Install

```bash
npm install
npm run build
```

### Run

```bash
# Generate TypeScript from Lean
npx lean2ts input.lean -o ./generated

# Dry run (prints to stdout)
npx lean2ts input.lean --dry-run

# Auto-prove sorries
npx lean2ts prove input.lean --verbose
```

## CLI Reference

### `lean2ts <input.lean> [options]`

| Option | Description | Default |
|---|---|---|
| `-o, --out <dir>` | Output directory | `./generated` |
| `--pantograph <path>` | Path to pantograph-repl | `pantograph-repl` |
| `--modules <names...>` | Lean modules to load | — |
| `--no-tests` | Skip test generation | — |
| `--no-stubs` | Skip stub generation | — |
| `--verbose` | Verbose logging | — |
| `--dry-run` | Print to stdout, don't write files | — |

### `lean2ts prove <input.lean> [options]`

| Option | Description | Default |
|---|---|---|
| `--model <name>` | LLM model | `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` |
| `--pantograph <path>` | Path to pantograph-repl | `pantograph-repl` |
| `--lean-path <path>` | LEAN_PATH | — |
| `--max-attempts <n>` | Max retry attempts | `3` |
| `--verbose` | Verbose logging | — |

### Environment Variables (prove)

| Variable | Description |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | API token |
| `CLOUDFLARE_API_KEY` | Global API key (use with `EMAIL`) |
| `CLOUDFLARE_EMAIL` | Cloudflare email |

## Architecture

```
src/
├── index.ts               Entry point
├── cli.ts                 CLI argument parsing
├── lean-ts-map.ts         Lean → TypeScript type mapping
│
├── s-expression/          S-expression parser
│   ├── parser.ts            Tokenizer + parser
│   └── lean-expr.ts         SexpNode → LeanExpr AST
│
├── extractor/             Lean declaration extraction
│   ├── classifier.ts        Declaration kind detection
│   ├── structure-parser.ts  Structure → IR
│   ├── inductive-parser.ts  Inductive → IR
│   ├── theorem-parser.ts    Theorem → IR
│   ├── def-parser.ts        Function definition → IR
│   └── type-resolver.ts     Lean type → IRType
│
├── generator/             TypeScript code generation
│   ├── type-generator.ts    types.ts
│   ├── arbitrary-generator.ts  arbitraries.ts
│   ├── property-generator.ts   properties.test.ts
│   └── stub-generator.ts    stubs.ts
│
├── pantograph/            Pantograph REPL client
│   ├── client.ts            JSON RPC over stdin/stdout
│   └── protocol.ts          Protocol type definitions
│
└── prover/                Automatic sorry prover
    ├── sorry-finder.ts      Locate sorry positions
    ├── proof-loop.ts        Propose → verify loop
    └── tactic-llm.ts        LLM integration
```

## Development

```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run lint          # Type check
npm run examples      # Generate examples (requires Pantograph)
```

## License

MIT
