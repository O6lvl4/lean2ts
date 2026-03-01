import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PantographClient } from "../pantograph/client.js";
import type { FrontendProcessResponse } from "../pantograph/protocol.js";
import { findSorries, replaceSorry } from "./sorry-finder.js";
import { proposeTactics, type LLMConfig, type TacticProposal } from "./tactic-llm.js";

export interface ProveResult {
  success: boolean;
  /** sorry が埋まった Lean ファイル（成功時） */
  provedSource?: string;
  /** 試行回数 */
  attempts: number;
  /** 試したタクティク一覧 */
  tactics: string[];
}

export interface ProveOptions {
  maxAttempts?: number;
  numProposals?: number;
  tempFile?: string;
  verbose?: boolean;
}

/**
 * sorry を LLM の提案で埋め、Pantograph で検証する探索ループ。
 *
 * 戦略:
 * 1. findSorries() で sorry 位置を取得
 * 2. 各 sorry に対して proposeTactics() で候補を取得
 * 3. 候補のタクティクで sorry を置換 → 一時ファイルに書き出し
 * 4. pantographClient.processFile() で検証
 * 5. エラーなし → 成功、エラーあり → 次の候補
 * 6. 全候補失敗 → エラーメッセージ付きで再度 LLM に提案を求める
 * 7. maxAttempts に達したら失敗
 */
export async function proveSorries(
  leanSource: string,
  pantographClient: PantographClient,
  llmConfig: LLMConfig,
  options: ProveOptions = {},
): Promise<ProveResult> {
  const {
    maxAttempts = 3,
    numProposals = 5,
    verbose = false,
  } = options;

  const tempFile =
    options.tempFile ?? join(tmpdir(), `lean2ts-prove-${Date.now()}.lean`);

  const sorries = findSorries(leanSource);
  if (sorries.length === 0) {
    return { success: true, provedSource: leanSource, attempts: 0, tactics: [] };
  }

  const allTriedTactics: string[] = [];
  let currentSource = leanSource;
  let totalAttempts = 0;

  // sorry を 1 つずつ順番に埋める
  for (let i = 0; i < sorries.length; i++) {
    const sorry = sorries[i];
    const isLast = i === sorries.length - 1;
    let solved = false;
    let previousErrors: string[] = [];

    for (let round = 0; round < maxAttempts && !solved; round++) {
      // 現在のソースから再度 sorry 位置を取得（前の sorry が埋まると位置がずれる）
      const currentSorries = findSorries(currentSource);
      const currentSorry = currentSorries.find((s) => s.name === sorry.name);
      if (!currentSorry) {
        // 既に解決済み
        solved = true;
        break;
      }

      const proposals = await proposeTacticsWithRetry(
        currentSorry,
        llmConfig,
        numProposals,
        previousErrors,
      );

      for (const proposal of proposals) {
        totalAttempts++;
        allTriedTactics.push(proposal.tactic);

        if (verbose) {
          console.error(
            `[prove] trying "${proposal.tactic}" for ${sorry.name} (attempt ${totalAttempts})`,
          );
        }

        const candidate = replaceSorry(
          currentSource,
          currentSorry.sorryOffset,
          proposal.tactic,
        );

        // 中間ステップでは sorry 警告を許可（他の sorry がまだ残っている）
        // 最後の sorry を埋める時のみ sorry 警告もチェック
        const verifyResult = await verifyWithPantograph(
          candidate,
          tempFile,
          pantographClient,
          { allowSorryWarnings: !isLast },
        );

        if (verifyResult.ok) {
          if (verbose) {
            console.error(`[prove] success: ${sorry.name} proved with "${proposal.tactic}"`);
          }
          currentSource = candidate;
          solved = true;
          break;
        } else {
          previousErrors.push(
            `tactic "${proposal.tactic}" failed: ${verifyResult.errors.join("; ")}`,
          );
        }
      }
    }

    if (!solved) {
      // クリーンアップ
      await cleanupTempFile(tempFile);
      return {
        success: false,
        attempts: totalAttempts,
        tactics: allTriedTactics,
      };
    }
  }

  await cleanupTempFile(tempFile);
  return {
    success: true,
    provedSource: currentSource,
    attempts: totalAttempts,
    tactics: allTriedTactics,
  };
}

async function proposeTacticsWithRetry(
  sorry: { name: string; statement: string; sorryOffset: number; context: string },
  llmConfig: LLMConfig,
  numProposals: number,
  previousErrors: string[],
): Promise<TacticProposal[]> {
  if (previousErrors.length > 0) {
    // エラー情報をコンテキストに追加して再提案
    const enrichedSorry = {
      ...sorry,
      context:
        sorry.context +
        "\n\n-- Previous failed attempts:\n" +
        previousErrors.map((e) => `-- ${e}`).join("\n"),
    };
    return proposeTactics(enrichedSorry, llmConfig, numProposals);
  }
  return proposeTactics(sorry, llmConfig, numProposals);
}

interface VerifyResult {
  ok: boolean;
  errors: string[];
}

/**
 * Lean テキストを一時ファイルに書き出し、Pantograph で検証する。
 * allowSorryWarnings=true の場合、sorry 警告は無視する（中間ステップ用）。
 */
export async function verifyWithPantograph(
  leanSource: string,
  tempFile: string,
  pantographClient: PantographClient,
  options?: { allowSorryWarnings?: boolean },
): Promise<VerifyResult> {
  await writeFile(tempFile, leanSource, "utf-8");

  try {
    const diag = await pantographClient.processFileWithDiagnostics(tempFile);

    if (diag.errors.length > 0) {
      return { ok: false, errors: diag.errors };
    }

    if (!options?.allowSorryWarnings) {
      const sorryWarnings = diag.warnings.filter((w) =>
        w.includes("sorry"),
      );
      if (sorryWarnings.length > 0) {
        return { ok: false, errors: sorryWarnings };
      }
    }

    return { ok: true, errors: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [message] };
  }
}

async function cleanupTempFile(tempFile: string): Promise<void> {
  try {
    await unlink(tempFile);
  } catch {
    // ファイルが存在しない場合は無視
  }
}
