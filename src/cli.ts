import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { Lean2TsConfig } from "./config.js";
import { defaultConfig } from "./config.js";
import { PantographClient } from "./pantograph/client.js";
import { extractDeclarations } from "./extractor/index.js";
import { generate, type GeneratedFiles } from "./generator/index.js";
import { prove } from "./prover/index.js";
import type { LLMConfig } from "./prover/tactic-llm.js";

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

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  const email = process.env.CLOUDFLARE_EMAIL;

  if (!accountId || (!apiToken && !(apiKey && email))) {
    console.error(
      "Error: CLOUDFLARE_ACCOUNT_ID と認証情報（CLOUDFLARE_API_TOKEN または CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL）が必要です",
    );
    process.exit(1);
  }

  const llmConfig: LLMConfig = {
    provider: "workers-ai",
    accountId,
    ...(apiToken
      ? { apiToken }
      : { apiKey: apiKey!, email: email! }),
    model:
      values.model ?? "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  };

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
  --model <name>         LLM モデル (default: @cf/deepseek-ai/deepseek-r1-distill-qwen-32b)
  --pantograph <path>    pantograph-repl のパス
  --modules <names...>   Lean モジュール
  --max-attempts <n>     最大リトライ回数 (default: 3)
  --verbose              ログ出力
  -h, --help             ヘルプ表示

Environment:
  CLOUDFLARE_ACCOUNT_ID  Cloudflare アカウント ID
  CLOUDFLARE_API_TOKEN   Cloudflare API トークン`);
}
