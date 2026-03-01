import type { LeanTheorem, IRParam, IRProp, IRExpr } from "../ir/types.js";
import type { EnvInspectResponse } from "../pantograph/protocol.js";
import { resolveType } from "./type-resolver.js";

/**
 * 定理の型 pp から universals と prop を抽出する。
 *
 * 例: `∀ (x : Nat) (y : Nat), x + y = y + x`
 * → universals: [{name:"x", type:Nat}, {name:"y", type:Nat}]
 * → prop: { kind: "eq", left: ..., right: ... }
 */
export function parseTheorem(
  name: string,
  info: EnvInspectResponse
): LeanTheorem {
  const typePp = info.type?.pp ?? "";
  const { universals, body } = extractForalls(typePp);
  const prop = parseProp(body);

  return {
    kind: "theorem",
    name: stripNamespace(name),
    universals,
    prop,
  };
}

/**
 * `∀ (x : T) (y : U), body` からパラメータと本体を分離
 */
function extractForalls(pp: string): { universals: IRParam[]; body: string } {
  const universals: IRParam[] = [];
  let rest = pp.trim();

  // ∀ で始まる場合
  if (rest.startsWith("∀")) {
    rest = rest.slice(1).trim();

    // パラメータ部分とカンマ以降の本体を分離
    const commaIdx = findTopLevelComma(rest);
    if (commaIdx >= 0) {
      const paramsPart = rest.slice(0, commaIdx).trim();
      rest = rest.slice(commaIdx + 1).trim();

      // 括弧付きパラメータ
      const paramRegex = /\((\w+)\s*:\s*([^)]+)\)/g;
      for (const match of paramsPart.matchAll(paramRegex)) {
        universals.push({
          name: match[1],
          type: resolveType(match[2].trim()),
        });
      }

      // 括弧なし単一パラメータ: `x : T`
      if (universals.length === 0) {
        const simpleMatch = paramsPart.match(/^(\w+)\s*:\s*(.+)$/);
        if (simpleMatch) {
          universals.push({
            name: simpleMatch[1],
            type: resolveType(simpleMatch[2].trim()),
          });
        }
      }
    }
  }

  return { universals, body: rest };
}

/** トップレベルの `,` を見つける（括弧内は無視） */
function findTopLevelComma(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) return i;
  }
  return -1;
}

/**
 * 命題文字列を IRProp にパース
 */
function parseProp(rawBody: string): IRProp {
  const body = rawBody.trim();

  // 含意: `P → Q`
  const implIdx = findTopLevelArrow(body);
  if (implIdx >= 0) {
    const premise = body.slice(0, implIdx).trim();
    const conclusion = body.slice(implIdx + "→".length).trim();
    return {
      kind: "implies",
      premise: parseProp(premise),
      conclusion: parseProp(conclusion),
    };
  }

  // 論理積: `P ∧ Q`
  const andIdx = findTopLevel(body, "∧");
  if (andIdx >= 0) {
    return {
      kind: "and",
      left: parseProp(body.slice(0, andIdx).trim()),
      right: parseProp(body.slice(andIdx + 1).trim()),
    };
  }

  // 否定: `¬P`
  if (body.startsWith("¬")) {
    return {
      kind: "not",
      inner: parseProp(body.slice(1).trim()),
    };
  }

  // ∀ item ∈ collection, body (membership)
  const memberMatch = body.match(/^∀\s+(\w+)\s+∈\s+(.+?),\s*(.+)$/s);
  if (memberMatch) {
    return {
      kind: "forall_in",
      variable: memberMatch[1],
      collection: parseExpr(memberMatch[2].trim()),
      body: parseProp(memberMatch[3].trim()),
    };
  }

  // 不等式: `a ≠ b`
  const neqIdx = body.indexOf("≠");
  if (neqIdx >= 0) {
    return {
      kind: "neq",
      left: parseExpr(body.slice(0, neqIdx).trim()),
      right: parseExpr(body.slice(neqIdx + 1).trim()),
    };
  }

  // 等式: `a = b`（:= は除外）
  const eqIdx = findEq(body);
  if (eqIdx >= 0) {
    return {
      kind: "eq",
      left: parseExpr(body.slice(0, eqIdx).trim()),
      right: parseExpr(body.slice(eqIdx + 1).trim()),
    };
  }

  // let 束縛: `let result := expr; body` → body の命題
  if (body.startsWith("let ")) {
    const letMatch = body.match(/^let\s+\w+\s*:=\s*.+?;\s*(.+)$/s);
    if (letMatch) {
      return parseProp(letMatch[1]);
    }
  }

  // フォールバック
  return { kind: "raw", text: body };
}

/** `=` の位置を見つける（`:=` は除外、括弧内は無視） */
function findEq(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "=" && depth === 0 && isStandaloneEq(s, i)) return i;
  }
  return -1;
}

function isStandaloneEq(s: string, i: number): boolean {
  if (i > 0 && s[i - 1] === ":") return false;
  if (i + 1 < s.length && s[i + 1] === "=") return false;
  return true;
}

/** トップレベルの `→` を見つける */
function findTopLevelArrow(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s.startsWith("→", i) && depth === 0) return i;
  }
  return -1;
}

/** トップレベルの特定文字を見つける */
function findTopLevel(s: string, ch: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s.startsWith(ch, i) && depth === 0) return i;
  }
  return -1;
}

/** 式文字列を IRExpr にパース */
function parseExpr(rawText: string): IRExpr {
  const text = rawText.trim();

  if (/^\d+$/.test(text)) return { kind: "literal", value: Number(text) };
  if (/^".*"$/.test(text)) return { kind: "literal", value: text.slice(1, -1) };
  if (text === "true") return { kind: "literal", value: true };
  if (text === "false") return { kind: "literal", value: false };

  const dotMatch = text.match(/^(\w+)\.(\w+)$/);
  if (dotMatch) {
    return {
      kind: "field",
      object: { kind: "var", name: dotMatch[1] },
      field: dotMatch[2],
    };
  }

  const parts = splitTopLevel(text);
  if (parts.length > 1) {
    return { kind: "call", func: parts[0], args: parts.slice(1).map(parseExpr) };
  }

  if (/^[\w.]+$/.test(text)) return { kind: "var", name: text };
  return { kind: "raw", text };
}

/** トップレベルのスペースで分割（括弧内は無視） */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") { depth++; current += s[i]; }
    else if (s[i] === ")") { depth--; current += s[i]; }
    else if (s[i] === " " && depth === 0) { if (current) parts.push(current); current = ""; }
    else { current += s[i]; }
  }
  if (current) parts.push(current);
  return parts;
}

function stripNamespace(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1];
}
