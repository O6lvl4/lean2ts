import type { SorryLocation } from "./sorry-finder.js";

export interface TacticProposal {
  tactic: string;
  confidence?: number;
}

export type LLMConfig = {
  provider: "workers-ai";
  accountId: string;
  model: string;
} & (
  | { apiToken: string; apiKey?: undefined; email?: undefined }
  | { apiKey: string; email: string; apiToken?: undefined }
);

/**
 * LLM にタクティクを提案させる。
 * Workers AI の REST API を直接叩く。
 */
export async function proposeTactics(
  goal: SorryLocation,
  config: LLMConfig,
  numProposals = 5,
): Promise<TacticProposal[]> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(goal, numProposals);

  const response = await callWorkersAI(config, systemPrompt, userPrompt);
  return parseTacticResponse(response);
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

async function callWorkersAI(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${config.model}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiToken) {
    headers["Authorization"] = `Bearer ${config.apiToken}`;
  } else if (config.apiKey && config.email) {
    headers["X-Auth-Key"] = config.apiKey;
    headers["X-Auth-Email"] = config.email;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2048,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Workers AI API error (${resp.status}): ${text}`);
  }

  const json = (await resp.json()) as {
    result?: { response?: string };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(
      `Workers AI errors: ${json.errors.map((e) => e.message).join(", ")}`,
    );
  }

  return json.result?.response ?? "";
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
