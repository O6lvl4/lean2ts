import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { SorryLocation } from "./sorry-finder.js";

export interface TacticProposal {
  tactic: string;
  confidence?: number;
}

export interface LLMConfig {
  /** OpenAI 互換エンドポイントの base URL */
  baseURL: string;
  /** API キー */
  apiKey: string;
  /** モデル名 */
  model: string;
}

/** よく使うプロバイダーのプリセット */
export const LLM_PRESETS = {
  cloudflare: (accountId: string) => ({
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
    model: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  }),
  openai: () => ({
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o",
  }),
  groq: () => ({
    baseURL: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  }),
  ollama: () => ({
    baseURL: "http://localhost:11434/v1",
    model: "deepseek-r1:32b",
  }),
} as const;

/**
 * LLM にタクティクを提案させる。
 * Vercel AI SDK 経由で任意の OpenAI 互換プロバイダーを使用する。
 */
export async function proposeTactics(
  goal: SorryLocation,
  config: LLMConfig,
  numProposals = 5,
): Promise<TacticProposal[]> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(goal, numProposals);

  const provider = createOpenAICompatible({
    name: "lean2ts-llm",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });

  const { text } = await generateText({
    model: provider(config.model),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 2048,
  });

  return parseTacticResponse(text);
}

function buildSystemPrompt(): string {
  return `You are a Lean 4 proof assistant. Your task is to suggest tactics that can fill in \`sorry\` placeholders in Lean 4 theorems.

Rules:
- Output ONLY the tactic(s), one per line
- Do NOT include \`by\` prefix — just the tactic itself
- Common useful tactics: simp, omega, decide, rfl, ring, norm_num, exact, apply, intro, cases, induction
- You may use compound tactics with semicolons or <;>
- For each suggestion, provide a single tactic or a tactic block that can directly replace \`sorry\`
- Order suggestions from most likely to least likely`;
}

function buildUserPrompt(goal: SorryLocation, numProposals: number): string {
  let prompt = "";
  if (goal.context) {
    prompt += `Context (preceding definitions):\n\`\`\`lean\n${goal.context}\n\`\`\`\n\n`;
  }
  prompt += `Fill in the \`sorry\` in the following theorem with a valid tactic.\n`;
  prompt += `\`\`\`lean\n${goal.statement}\n\`\`\`\n\n`;
  prompt += `Suggest ${numProposals} different tactics, one per line. Output ONLY the tactics, nothing else.`;
  return prompt;
}

/**
 * LLM の出力テキストからタクティク候補を抽出する。
 * 各行を 1 つのタクティクとして扱い、空行やコメントは無視する。
 * DeepSeek R1 の `<think>...</think>` ブロックは除去する。
 */
export function parseTacticResponse(response: string): TacticProposal[] {
  // <think>...</think> ブロックを除去（DeepSeek R1 対応）
  // 閉じタグがない場合（トランケート時）も除去する
  let cleaned = response.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  // 閉じタグなしの <think> ブロック（トランケート）を除去
  cleaned = cleaned.replace(/<think>[\s\S]*/g, "").trim();

  return cleaned
    .split("\n")
    .map((line) => line.trim())
    // 番号付きリスト "1. simp" → "simp"
    .map((line) => line.replace(/^\d+\.\s*/, ""))
    // "- simp" → "simp"
    .map((line) => line.replace(/^[-*]\s*/, ""))
    // バッククォート除去
    .map((line) => line.replace(/^`+|`+$/g, ""))
    .map((line) => line.trim())
    // 空行、コメント行、"by" 単体、HTMLタグを除外
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("--"))
    .filter((line) => !line.startsWith("```"))
    .filter((line) => !line.startsWith("<"))
    .filter((line) => line !== "by")
    .map((tactic) => ({ tactic }));
}
