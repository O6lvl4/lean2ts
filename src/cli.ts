import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { Lean2TsConfig } from "./config.js";
import { defaultConfig } from "./config.js";
import { PantographClient } from "./pantograph/client.js";
import { extractDeclarations } from "./extractor/index.js";
import { generate } from "./generator/index.js";

export async function run(argv: string[]): Promise<void> {
  const config = parseCliArgs(argv);

  if (config.verbose) {
    console.error(`[lean2ts] input: ${config.input}`);
    console.error(`[lean2ts] outDir: ${config.outDir}`);
    console.error(`[lean2ts] pantograph: ${config.pantographPath}`);
  }

  // Pantograph クライアント起動
  const client = new PantographClient({
    pantographPath: config.pantographPath,
    modules: config.modules,
    verbose: config.verbose,
  });

  try {
    await client.start();

    // 抽出
    const result = await extractDeclarations(client, config.input);

    if (config.verbose) {
      console.error(
        `[lean2ts] extracted ${result.declarations.length} declarations, skipped ${result.skipped.length}`
      );
      for (const err of result.errors) {
        console.error(`[lean2ts] error: ${err.name}: ${err.error}`);
      }
    }

    // 生成
    const files = generate(result.declarations, {
      noTests: config.noTests,
      noStubs: config.noStubs,
    });

    // 出力
    if (config.dryRun) {
      for (const [name, content] of Object.entries(files)) {
        if (!content) continue;
        console.log(`\n--- ${name} ---`);
        console.log(content);
      }
    } else {
      const outDir = resolve(config.outDir);
      await mkdir(outDir, { recursive: true });

      for (const [name, content] of Object.entries(files)) {
        if (!content) continue;
        const filePath = resolve(outDir, name);
        await writeFile(filePath, content, "utf-8");
        console.log(`wrote ${filePath}`);
      }
    }
  } finally {
    await client.stop();
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

function printUsage(): void {
  console.log(`Usage: lean2ts <input.lean> [options]

Options:
  -o, --out <dir>        出力ディレクトリ (default: ./generated)
  --pantograph <path>    pantograph-repl のパス
  --modules <names...>   Lean モジュール
  --no-tests             テスト生成スキップ
  --no-stubs             スタブ生成スキップ
  --verbose              Pantograph 通信ログ出力
  --dry-run              生成内容を表示（書き込みなし）
  -h, --help             ヘルプ表示`);
}
