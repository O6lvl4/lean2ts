import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PantographClient } from "../pantograph/client.js";
import { proveSorries, type ProveOptions } from "./proof-loop.js";
import type { LLMConfig } from "./tactic-llm.js";

export type { LLMConfig } from "./tactic-llm.js";
export type { ProveResult, ProveOptions } from "./proof-loop.js";
export { findSorries, type SorryLocation } from "./sorry-finder.js";

export interface ProveCommandConfig {
  input: string;
  pantographPath: string;
  leanPath?: string;
  modules: string[];
  verbose: boolean;
  llmConfig: LLMConfig;
  proveOptions?: ProveOptions;
}

/**
 * prove コマンドのエントリーポイント。
 * Lean ファイルを読み込み、sorry を LLM + Pantograph で自動証明する。
 */
export async function prove(config: ProveCommandConfig): Promise<void> {
  const filePath = resolve(config.input);
  const leanSource = await readFile(filePath, "utf-8");

  console.error(`[prove] processing ${filePath}`);

  const client = new PantographClient({
    pantographPath: config.pantographPath,
    leanPath: config.leanPath,
    modules: config.modules,
    verbose: config.verbose,
  });

  try {
    await client.start();

    const result = await proveSorries(leanSource, client, config.llmConfig, {
      ...config.proveOptions,
      verbose: config.verbose,
    });

    if (result.success) {
      console.log(result.provedSource);
      console.error(
        `[prove] success: all sorries proved in ${result.attempts} attempt(s)`,
      );
      console.error(`[prove] tactics used: ${result.tactics.join(", ")}`);
    } else {
      console.error(
        `[prove] failed after ${result.attempts} attempt(s)`,
      );
      console.error(`[prove] tried tactics: ${result.tactics.join(", ")}`);
      process.exitCode = 1;
    }
  } finally {
    await client.stop();
  }
}
