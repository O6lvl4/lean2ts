<p align="right"><a href="README.ja.md">日本語</a></p>

<h1 align="center">lean2ts</h1>

<p align="center">
<strong>Prove it in Lean. Test it in TypeScript.</strong>
</p>

<p align="center">
lean2ts converts <a href="https://lean-lang.org/">Lean 4</a> formal specifications into TypeScript — types, function stubs, and <a href="https://github.com/dubzzz/fast-check">fast-check</a> property tests.
Write your business rules in Lean, prove them mathematically, and let lean2ts bring those guarantees into your TypeScript codebase as automated tests.
</p>

<p align="center">
<img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
<img src="https://img.shields.io/badge/lean-4-blueviolet" alt="Lean 4">
<img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript">
<img src="https://img.shields.io/badge/node-%3E%3D22-green" alt="Node 22+">
</p>

---

## Why?

You write a discount function. It passes unit tests. Then one day, a customer gets charged **-$1.50** — the discount exceeded the price, and JavaScript happily returned a negative number.

Lean's natural numbers *can't go negative*. If you prove your business rules in Lean, that class of bugs is impossible. But your production code is TypeScript. **lean2ts bridges that gap.**

```
                    ┌─────────────────────────┐
  pricing.lean      │  Lean 4 compiler        │
  ─────────────────▶│  Proves theorems ✓      │
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
  npx lean2ts       │  lean2ts                │
  ─────────────────▶│  Generates TypeScript   │
                    └──────────┬──────────────┘
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
          types.ts        stubs.ts     properties.test.ts
       (interfaces,    (function      (theorems become
        unions)         signatures)    fast-check tests)
```

---

## Quick Start

```bash
npx lean2ts pricing.lean -o ./generated
```

This reads a Lean file, talks to [Pantograph](https://github.com/lenianiva/Pantograph) to extract declarations, and writes TypeScript files.

### Prerequisites

- **Node.js 22+**
- **[Lean 4](https://lean-lang.org/lean4/doc/setup.html)** — install via [elan](https://github.com/leanprover/elan)
- **[Pantograph](https://github.com/lenianiva/Pantograph)** — Lean's programmatic interface

#### Installing Pantograph

```bash
git clone https://github.com/lenianiva/Pantograph.git
cd Pantograph
lake build
```

Then either add the built binary to your PATH:

```bash
export PATH="$PWD/.lake/build/bin:$PATH"
```

Or pass the path directly:

```bash
npx lean2ts pricing.lean --pantograph ./Pantograph/.lake/build/bin/pantograph-repl
```

> **Note:** Pantograph must be built with the same Lean version as your project.
> Check with `lean --version` and ensure the `lean-toolchain` file in the Pantograph repo matches.

---

## See It in Action

### 1. Write your spec in Lean

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

-- Prove: discount never exceeds the original price
theorem discount_bounded (amount : Nat) (d : Discount) :
    applyDiscount amount d ≤ amount := by
  cases d <;> simp [applyDiscount] <;> omega

-- Prove: result is always non-negative
theorem discount_nonneg (amount : Nat) (d : Discount) :
    0 ≤ applyDiscount amount d := by omega
```

If it compiles, the proofs are correct. No runtime needed.

### 2. Generate TypeScript

```bash
npx lean2ts pricing.lean
```

**types.ts** — Discriminated unions from inductive types:

```typescript
export type Discount =
  | { readonly tag: "none" }
  | { readonly tag: "percent"; readonly rate: number }
  | { readonly tag: "fixed"; readonly amount: number };
```

**stubs.ts** — Function signatures to implement:

```typescript
export function applyDiscount(amount: number, d: Discount): number {
  // TODO: implement
  return 0;
}
```

**properties.test.ts** — Theorems become property tests:

```typescript
it("discountBounded", () => {
  fc.assert(
    fc.property(fc.nat(), arbDiscount, (amount, d) => {
      return applyDiscount(amount, d) <= amount;
    })
  );
});
```

### 3. Implement and test

Write a naive implementation:

```typescript
case "percent": return amount - (amount * d.rate / 100);
case "fixed":   return amount - d.amount;
```

Run the tests:

```
FAIL  discountNonneg
  Counterexample: [1, { tag: "percent", rate: 200 }]
  applyDiscount(1, { tag: "percent", rate: 200 }) => -1
```

A 200% discount on $1 gives -$1 in JavaScript, but Lean's `Nat` subtraction floors at zero. Fix:

```typescript
case "percent": return Math.max(0, amount - Math.floor(amount * d.rate / 100));
case "fixed":   return Math.max(0, amount - d.amount);
```

**Lean's proof told you exactly what your implementation must guarantee.** The bug was found before it reached production.

> Full source: [`examples/pricing/`](examples/pricing/)

---

## What Gets Generated

| Lean construct | TypeScript output | File |
|---|---|---|
| `structure` | `interface` | types.ts |
| `inductive` | Discriminated union + type guards | types.ts |
| `theorem` | fast-check property test | properties.test.ts |
| `def` | Function stub | stubs.ts |
| Type parameters | Generic arbitraries (factory functions) | arbitraries.ts |
| `sorry` | Auto-proved via LLM + Pantograph | — |

### Type Mapping

| Lean | TypeScript | fast-check arbitrary |
|---|---|---|
| `Nat` | `number` | `fc.nat()` |
| `Int` | `number` | `fc.integer()` |
| `String` | `string` | `fc.string()` |
| `Bool` | `boolean` | `fc.boolean()` |
| `List α` | `ReadonlyArray<α>` | `fc.array(...)` |
| `Option α` | `α \| undefined` | `fc.option(...)` |
| `α × β` | `readonly [α, β]` | `fc.tuple(...)` |

### Generics

Type parameters carry over naturally:

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

## Examples

| Example | Demonstrates | Theorems |
|---|---|:---:|
| [`point/`](examples/point/) | Struct, function, basic theorem | 1 |
| [`color-shape/`](examples/color-shape/) | Inductive types as discriminated unions | — |
| [`generics/`](examples/generics/) | Type parameters and factory arbitraries | 1 |
| [`pricing/`](examples/pricing/) | **Business rules that catch real bugs** | 4 |
| [`weather/`](examples/weather/) | Alert levels, precipitation, buggy vs correct impl | 8 |
| [`scoring/`](examples/scoring/) | Commutativity and monotonicity | 5 |
| [`inventory/`](examples/inventory/) | Conservation laws in stock management | 6 |

Each example contains a `.lean` source and a `generated/` directory with the TypeScript output.

---

## Auto-Proving `sorry`

Lean lets you write `sorry` as a placeholder for proofs you haven't finished yet. lean2ts can fill these in automatically using an LLM to propose tactics, verified by Pantograph.

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

The LLM proposes candidate tactics. Pantograph checks each one against Lean's kernel. If it passes, the proof is sound — no trust in the LLM required.

### LLM Providers

Any OpenAI-compatible API works. Set environment variables and lean2ts auto-detects the provider:

```bash
# OpenAI
OPENAI_API_KEY=sk-... npx lean2ts prove input.lean

# Cloudflare Workers AI
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npx lean2ts prove input.lean

# Groq, Together, Fireworks, etc.
LLM_BASE_URL=https://api.groq.com/openai/v1 LLM_API_KEY=gsk-... \
  npx lean2ts prove input.lean --model llama-3.3-70b-versatile

# Ollama (local)
LLM_BASE_URL=http://localhost:11434/v1 \
  npx lean2ts prove input.lean --model deepseek-r1:32b
```

| Environment Variable | Provider |
|---|---|
| `OPENAI_API_KEY` | OpenAI |
| `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI |
| `LLM_BASE_URL` + `LLM_API_KEY` [+ `LLM_MODEL`] | Any OpenAI-compatible |

---

## CLI Reference

### `lean2ts <input.lean> [options]`

Generate TypeScript from a Lean file.

| Option | Description | Default |
|---|---|---|
| `-o, --out <dir>` | Output directory | `./generated` |
| `--pantograph <path>` | Path to pantograph-repl binary | `pantograph-repl` |
| `--modules <names...>` | Additional Lean modules to load | — |
| `--no-tests` | Skip test generation | — |
| `--no-stubs` | Skip stub generation | — |
| `--verbose` | Verbose logging | — |
| `--dry-run` | Print to stdout instead of writing files | — |

### `lean2ts prove <input.lean> [options]`

Automatically prove `sorry` holes.

| Option | Description | Default |
|---|---|---|
| `--model <name>` | LLM model for tactic generation | auto |
| `--base-url <url>` | OpenAI-compatible API base URL | auto |
| `--api-key <key>` | API key for the LLM provider | auto |
| `--pantograph <path>` | Path to pantograph-repl binary | `pantograph-repl` |
| `--lean-path <path>` | LEAN_PATH for module resolution | — |
| `--max-attempts <n>` | Max tactic attempts per sorry | `3` |
| `--verbose` | Verbose logging | — |

---

## How It Works

```
Lean source (.lean)
  │
  │  Pantograph REPL
  ▼
S-expression AST
  │
  │  Parser (src/s-expression/)
  ▼
Lean expression tree
  │
  │  Extractor (src/extractor/)
  │  ├── structures  → fields, types
  │  ├── inductives  → constructors, params
  │  ├── theorems    → hypotheses, conclusion
  │  └── defs        → signature, arity
  ▼
Intermediate representation
  │
  │  Generators (src/generator/)
  ▼
TypeScript files
  ├── types.ts           Interfaces & unions
  ├── arbitraries.ts     fast-check generators
  ├── stubs.ts           Function signatures
  └── properties.test.ts Property-based tests
```

### Source Layout

```
src/
├── index.ts                  Entry point (CLI)
├── cli.ts                    Argument parsing
├── lean-ts-map.ts            Lean → TS type mapping
├── s-expression/             S-expression parser
│   ├── parser.ts               Tokenizer + recursive descent
│   └── lean-expr.ts            SexpNode → LeanExpr AST
├── extractor/                Declaration extraction
│   ├── classifier.ts           Kind detection (struct/inductive/thm/def)
│   ├── structure-parser.ts     Structure → IR
│   ├── inductive-parser.ts     Inductive → IR
│   ├── theorem-parser.ts       Theorem → IR
│   ├── def-parser.ts           Function definition → IR
│   └── type-resolver.ts        Lean type → IRType
├── generator/                Code generation
│   ├── type-generator.ts       types.ts output
│   ├── arbitrary-generator.ts  arbitraries.ts output
│   ├── property-generator.ts   properties.test.ts output
│   └── stub-generator.ts       stubs.ts output
├── pantograph/               Pantograph REPL client
│   ├── client.ts               JSON-RPC over stdin/stdout
│   └── protocol.ts             Protocol type definitions
└── prover/                   Auto-proof engine
    ├── sorry-finder.ts         Locate sorry positions in source
    ├── proof-loop.ts           Propose → verify loop
    └── tactic-llm.ts           LLM tactic generation
```

---

## Development

```bash
git clone <repo-url>
cd lean2ts
npm install
npm run build

npm test              # Run test suite (vitest)
npm run test:watch    # Watch mode
npm run lint          # Type-check only
npm run examples      # Regenerate example outputs (requires Pantograph)
```

---

## License

[MIT](LICENSE)
