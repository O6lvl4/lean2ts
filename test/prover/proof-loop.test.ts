import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { proveSorries } from "../../src/prover/proof-loop.js";
import type { PantographClient } from "../../src/pantograph/client.js";
import type { LLMConfig } from "../../src/prover/tactic-llm.js";

// proposeTactics をモックして LLM API 呼び出しを回避
vi.mock("../../src/prover/tactic-llm.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/prover/tactic-llm.js")>();
  return {
    ...original,
    proposeTactics: vi.fn(),
  };
});

import { proposeTactics } from "../../src/prover/tactic-llm.js";

const mockedProposeTactics = vi.mocked(proposeTactics);

const fixturesDir = resolve(import.meta.dirname, "../fixtures/sorry-examples");

function createMockPantographClient(opts: {
  successOn?: string[];
}): PantographClient {
  const { successOn = [] } = opts;

  return {
    processFileWithDiagnostics: vi.fn(async (filePath: string) => {
      const content = readFileSync(filePath, "utf-8");
      const hasSuccessTactic = successOn.some((t) => content.includes(t));
      const hasSorry = content.includes("sorry");

      if (!hasSuccessTactic) {
        return {
          constants: [],
          errors: ["type mismatch or unsolved goals"],
          warnings: [],
        };
      }

      return {
        constants: [],
        errors: [],
        warnings: hasSorry ? ["declaration uses 'sorry'"] : [],
      };
    }),
  } as unknown as PantographClient;
}

const dummyLLMConfig: LLMConfig = {
  provider: "workers-ai",
  accountId: "test-account",
  apiToken: "test-token",
  model: "@cf/test-model",
};

describe("proveSorries", () => {
  beforeEach(() => {
    mockedProposeTactics.mockReset();
  });

  it("sorry がないファイルはそのまま成功", async () => {
    const source = "theorem foo : True := by trivial\n";
    const client = createMockPantographClient({ successOn: ["trivial"] });

    const result = await proveSorries(source, client, dummyLLMConfig);

    expect(result.success).toBe(true);
    expect(result.provedSource).toBe(source);
    expect(result.attempts).toBe(0);
  });

  it("最初の提案で sorry が解決される", async () => {
    const source = readFileSync(resolve(fixturesDir, "simple.lean"), "utf-8");
    const client = createMockPantographClient({ successOn: ["simp"] });

    mockedProposeTactics.mockResolvedValueOnce([
      { tactic: "simp" },
      { tactic: "omega" },
    ]);

    const result = await proveSorries(source, client, dummyLLMConfig, {
      tempFile: `/tmp/lean2ts-test-${Date.now()}.lean`,
    });

    expect(result.success).toBe(true);
    expect(result.provedSource).toContain("simp");
    expect(result.provedSource).not.toContain("sorry");
    expect(result.attempts).toBe(1);
  });

  it("最初の候補が失敗し、2番目の候補で成功する", async () => {
    const source = readFileSync(resolve(fixturesDir, "simple.lean"), "utf-8");
    const client = createMockPantographClient({ successOn: ["omega"] });

    mockedProposeTactics.mockResolvedValueOnce([
      { tactic: "ring" },
      { tactic: "omega" },
    ]);

    const result = await proveSorries(source, client, dummyLLMConfig, {
      tempFile: `/tmp/lean2ts-test-${Date.now()}.lean`,
    });

    expect(result.success).toBe(true);
    expect(result.provedSource).toContain("omega");
    expect(result.attempts).toBe(2);
    expect(result.tactics).toContain("ring");
    expect(result.tactics).toContain("omega");
  });

  it("全候補失敗で次ラウンドに進む", async () => {
    const source = readFileSync(resolve(fixturesDir, "simple.lean"), "utf-8");
    const client = createMockPantographClient({ successOn: ["omega"] });

    // ラウンド1: 全部失敗
    mockedProposeTactics.mockResolvedValueOnce([
      { tactic: "ring" },
      { tactic: "norm_num" },
    ]);
    // ラウンド2: omega で成功
    mockedProposeTactics.mockResolvedValueOnce([
      { tactic: "omega" },
    ]);

    const result = await proveSorries(source, client, dummyLLMConfig, {
      maxAttempts: 3,
      tempFile: `/tmp/lean2ts-test-${Date.now()}.lean`,
    });

    expect(result.success).toBe(true);
    expect(result.provedSource).toContain("omega");
    expect(result.attempts).toBe(3); // ring, norm_num, omega
  });

  it("maxAttempts に達したら失敗", async () => {
    const source = readFileSync(resolve(fixturesDir, "simple.lean"), "utf-8");
    const client = createMockPantographClient({ successOn: [] });

    mockedProposeTactics.mockResolvedValue([
      { tactic: "ring" },
    ]);

    const result = await proveSorries(source, client, dummyLLMConfig, {
      maxAttempts: 2,
      tempFile: `/tmp/lean2ts-test-${Date.now()}.lean`,
    });

    expect(result.success).toBe(false);
    expect(result.provedSource).toBeUndefined();
  });

  it("複数の sorry を順番に解決する", async () => {
    const source = readFileSync(
      resolve(fixturesDir, "two-sorries.lean"),
      "utf-8",
    );
    const client = createMockPantographClient({
      successOn: ["simp", "omega"],
    });

    // 1つ目の sorry
    mockedProposeTactics.mockResolvedValueOnce([{ tactic: "simp" }]);
    // 2つ目の sorry
    mockedProposeTactics.mockResolvedValueOnce([{ tactic: "omega" }]);

    const result = await proveSorries(source, client, dummyLLMConfig, {
      tempFile: `/tmp/lean2ts-test-${Date.now()}.lean`,
    });

    expect(result.success).toBe(true);
    expect(result.provedSource).not.toContain("sorry");
    expect(result.provedSource).toContain("simp");
    expect(result.provedSource).toContain("omega");
  });
});
