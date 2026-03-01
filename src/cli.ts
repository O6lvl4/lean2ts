import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { Lean2TsConfig } from "./config.js";
import { defaultConfig } from "./config.js";
import { PantographClient } from "./pantograph/client.js";
import { extractDeclarations } from "./extractor/index.js";
import { generate, type GeneratedFiles } from "./generator/index.js";
import { prove } from "./prover/index.js";
import { type LLMConfig, LLM_PRESETS } from "./prover/tactic-llm.js";

export async function run(argv: string[]): Promise<void> {
  // サブコマンド判定
  if (argv[0] === "prove") {
    return runProve(argv.slice(1));
  }

  const config = parseCliArgs(argv);
  logVerboseConfig(config);

  const client = new PantographClient({
    pantographPath: config.pantographPath,
    modules: config.modules,
    verbose: config.verbose,
  });

  try {
    await client.start();
    const result = await extractDeclarations(client, config.input);
    logVerboseResult(config, result);

    const files = generate(result.declarations, {
      noTests: config.noTests,
      noStubs: config.noStubs,
    });

    if (config.dryRun) {
      printDryRun(files);
    } else {
      await writeOutputFiles(config.outDir, files);
    }
  } finally {
    await client.stop();
  }
}

function logVerboseConfig(config: Lean2TsConfig): void {
  if (!config.verbose) return;
  console.error(`[lean2ts] input: ${config.input}`);
  console.error(`[lean2ts] outDir: ${config.outDir}`);
  console.error(`[lean2ts] pantograph: ${config.pantographPath}`);
}

function logVerboseResult(config: Lean2TsConfig, result: Awaited<ReturnType<typeof extractDeclarations>>): void {
  if (!config.verbose) return;
  console.error(`[lean2ts] extracted ${result.declarations.length} declarations, skipped ${result.skipped.length}`);
  for (const err of result.errors) {
    console.error(`[lean2ts] error: ${err.name}: ${err.error}`);
  }
}

function printDryRun(files: GeneratedFiles): void {
  for (const [name, content] of Object.entries(files)) {
    if (!content) continue;
    console.log(`\n--- ${name} ---`);
    console.log(content);
  }
}

async function writeOutputFiles(outDirPath: string, files: GeneratedFiles): Promise<void> {
  const outDir = resolve(outDirPath);
  await mkdir(outDir, { recursive: true });

  for (const [name, content] of Object.entries(files)) {
    if (!content) continue;
    const filePath = resolve(outDir, name);
    await writeFile(filePath, content, "utf-8");
    console.log(`wrote ${filePath}`);
  }
}

function parseCliArgs(argv: string[]): Lean2TsConfig {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      out: { type: "string", short: "o" },
      pantograph: { type: "string" },
      modules: { type: "string", multiple: true },
      "no-tests": { type: "boolean" },
      "no-stubs": { type: "boolean" },
      verbose: { type: "boolean" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    printUsage();
    process.exit(values.help ? 0 : 1);
  }

  return {
    input: positionals[0],
    outDir: values.out ?? defaultConfig.outDir,
    pantographPath: values.pantograph ?? defaultConfig.pantographPath,
    modules: values.modules ?? defaultConfig.modules,
    noTests: values["no-tests"] ?? defaultConfig.noTests,
    noStubs: values["no-stubs"] ?? defaultConfig.noStubs,
    verbose: values.verbose ?? defaultConfig.verbose,
    dryRun: values["dry-run"] ?? defaultConfig.dryRun,
  };
}

async function runProve(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      model: { type: "string" },
      "base-url": { type: "string" },
      "api-key": { type: "string" },
      pantograph: { type: "string" },
      "lean-path": { type: "string" },
      modules: { type: "string", multiple: true },
      "max-attempts": { type: "string" },
      verbose: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    printProveUsage();
    process.exit(values.help ? 0 : 1);
  }

  const llmConfig = resolveLLMConfig(values);

  await prove({
    input: positionals[0],
    pantographPath: values.pantograph ?? defaultConfig.pantographPath,
    leanPath: values["lean-path"],
    modules: values.modules ?? defaultConfig.modules,
    verbose: values.verbose ?? false,
    llmConfig,
    proveOptions: {
      maxAttempts: values["max-attempts"]
        ? parseInt(values["max-attempts"], 10)
        : undefined,
    },
  });
}

/**
 * CLI オプションと環境変数から LLM 設定を解決する。
 *
 * 優先順位:
 * 1. --base-url + --api-key (明示指定)
 * 2. LLM_BASE_URL + LLM_API_KEY (汎用環境変数)
 * 3. OPENAI_API_KEY (OpenAI)
 * 4. CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (後方互換)
 */
function resolveLLMConfig(values: {
  model?: string;
  "base-url"?: string;
  "api-key"?: string;
}): LLMConfig {
  // 1. CLI 明示指定
  if (values["base-url"] && values["api-key"]) {
    return {
      baseURL: values["base-url"],
      apiKey: values["api-key"],
      model: values.model ?? "gpt-4o",
    };
  }

  // 2. 汎用環境変数
  const llmBaseURL = process.env.LLM_BASE_URL;
  const llmApiKey = process.env.LLM_API_KEY;
  if (llmBaseURL && llmApiKey) {
    return {
      baseURL: llmBaseURL,
      apiKey: llmApiKey,
      model: values.model ?? process.env.LLM_MODEL ?? "gpt-4o",
    };
  }

  // 3. OpenAI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const preset = LLM_PRESETS.openai();
    return {
      baseURL: preset.baseURL,
      apiKey: openaiKey,
      model: values.model ?? preset.model,
    };
  }

  // 4. Cloudflare Workers AI (後方互換)
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const cfApiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (cfAccountId && cfApiToken) {
    const preset = LLM_PRESETS.cloudflare(cfAccountId);
    return {
      baseURL: preset.baseURL,
      apiKey: cfApiToken,
      model: values.model ?? preset.model,
    };
  }

  console.error(
    `Error: LLM provider not configured.

Set one of:
  OPENAI_API_KEY                                    — OpenAI
  CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN      — Cloudflare Workers AI
  LLM_BASE_URL + LLM_API_KEY                       — Any OpenAI-compatible provider
  --base-url <url> --api-key <key>                  — CLI explicit`,
  );
  process.exit(1);
}

function printUsage(): void {
  console.log(`Usage: lean2ts <input.lean> [options]
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

Subcommands:
  prove                  sorry を LLM で自動証明する`);
}

function printProveUsage(): void {
  console.log(`Usage: lean2ts prove <input.lean> [options]

Options:
  --model <name>         LLM model name
  --base-url <url>       OpenAI-compatible API base URL
  --api-key <key>        API key for the LLM provider
  --pantograph <path>    Path to pantograph-repl binary
  --modules <names...>   Lean modules to load
  --max-attempts <n>     Max tactic attempts per sorry (default: 3)
  --verbose              Verbose logging
  -h, --help             Show help

Environment (auto-detected in order):
  OPENAI_API_KEY                                 OpenAI
  CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN   Cloudflare Workers AI
  LLM_BASE_URL + LLM_API_KEY [+ LLM_MODEL]      Any OpenAI-compatible provider

Examples:
  OPENAI_API_KEY=sk-... npx lean2ts prove input.lean
  LLM_BASE_URL=http://localhost:11434/v1 npx lean2ts prove input.lean --model deepseek-r1:32b`);
}
