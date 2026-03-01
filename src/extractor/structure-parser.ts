import type { LeanStructure, IRField, IRTypeParam } from "../ir/types.js";
import type { EnvInspectResponse } from "../pantograph/protocol.js";
import { resolveType, resolveTypeFromExpr } from "./type-resolver.js";
import type { LeanExpr } from "../s-expression/lean-expr.js";
import { getAppHeadName } from "../s-expression/lean-expr.js";

/**
 * 構造体（単一コンストラクタの帰納型）をパースする。
 *
 * Pantograph の env.inspect で得たコンストラクタ型の pp 文字列から
 * フィールド名と型を抽出する。
 *
 * 例: `Foo.mk` の型が `(field1 : Nat) → (field2 : String) → Foo`
 */
export function parseStructure(
  name: string,
  _info: EnvInspectResponse,
  ctorInfo: EnvInspectResponse
): LeanStructure {
  const fields = extractFieldsFromCtorType(ctorInfo.type?.pp ?? "");

  return {
    kind: "structure",
    name: stripNamespace(name),
    typeParams: [],
    fields,
  };
}

/**
 * コンストラクタ型 pp からフィールドを抽出。
 *
 * 形式: `(field1 : Type1) → (field2 : Type2) → StructName`
 * or: `Type1 → Type2 → StructName`（名前なしの場合）
 */
function extractFieldsFromCtorType(pp: string): IRField[] {
  const fields = extractNamedFields(pp);
  return fields.length > 0 ? fields : extractUnnamedFields(pp);
}

/** 括弧の対応を考慮してトップレベルの `(name : Type) → ...` を抽出 */
function extractNamedFields(pp: string): IRField[] {
  const fields: IRField[] = [];
  let pos = 0;

  while (pos < pp.length) {
    if (pp[pos] === "(") {
      const closeIdx = findMatchingParen(pp, pos);
      if (closeIdx < 0) break;
      const field = parseParenField(pp.slice(pos + 1, closeIdx).trim());
      if (field) fields.push(field);
      pos = closeIdx + 1;
    } else {
      pos++;
    }
  }

  return fields;
}

/** `name : Type` 形式のフィールドをパース */
function parseParenField(inner: string): IRField | undefined {
  const colonIdx = inner.indexOf(":");
  if (colonIdx <= 0) return undefined;

  const fieldName = inner.slice(0, colonIdx).trim();
  const typeStr = inner.slice(colonIdx + 1).trim();
  if (!/^\w+$/.test(fieldName)) return undefined;

  const hasDefault = typeStr.startsWith("optParam") || typeStr.startsWith("autoParam");
  const cleanType = hasDefault ? extractOptParamType(typeStr) : typeStr;

  return { name: fieldName, type: resolveType(cleanType), hasDefault };
}

/** 名前付きパラメータが見つからない場合、無名パラメータを試行 */
function extractUnnamedFields(pp: string): IRField[] {
  const parts = splitTopLevelArrows(pp);
  const fields: IRField[] = [];

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i].replace(/^\(/, "").replace(/\)$/, "").trim();
    if (part) {
      fields.push({ name: `field${i + 1}`, type: resolveType(part), hasDefault: false });
    }
  }

  return fields;
}

/** 対応する閉じ括弧の位置を返す */
function findMatchingParen(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** `optParam (List (String × Nat)) []` → `List (String × Nat)` */
function extractOptParamType(typeStr: string): string {
  // `optParam <type> <default>` or `autoParam <type> <default>`
  const rest = typeStr.replace(/^(?:optParam|autoParam)\s+/, "");
  // 型部分を括弧対応で抽出
  if (rest.startsWith("(")) {
    const closeIdx = findMatchingParen(rest, 0);
    if (closeIdx >= 0) {
      return rest.slice(1, closeIdx).trim();
    }
  }
  // 括弧なし：最初のスペースまで
  const spaceIdx = rest.indexOf(" ");
  return spaceIdx >= 0 ? rest.slice(0, spaceIdx) : rest;
}

/** トップレベルの `→` で分割 */
function splitTopLevelArrows(s: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(" || s[i] === "{" || s[i] === "[") {
      depth++;
      current += s[i];
    } else if (s[i] === ")" || s[i] === "}" || s[i] === "]") {
      depth--;
      current += s[i];
    } else if (s.startsWith("→", i) && depth === 0) {
      parts.push(current.trim());
      current = "";
      i += "→".length - 1;
    } else {
      current += s[i];
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function stripNamespace(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1];
}

// ─── Sexp ベース ───

/**
 * LeanExpr (コンストラクタ型) から構造体をパースする。
 * numParams 個の先頭 forallE をスキップ（型パラメータ）。
 */
export function parseStructureFromExpr(
  name: string,
  info: EnvInspectResponse,
  ctorExpr: LeanExpr
): LeanStructure {
  const numParams = info.inductInfo?.numParams ?? 0;
  const { typeParams, fields } = extractFieldsFromExpr(ctorExpr, numParams);

  return {
    kind: "structure",
    name: stripNamespace(name),
    typeParams,
    fields,
  };
}

function extractFieldsFromExpr(
  expr: LeanExpr,
  numParamsToSkip: number
): { typeParams: IRTypeParam[]; fields: IRField[] } {
  const typeParams: IRTypeParam[] = [];
  const fields: IRField[] = [];
  let current = expr;
  let skipped = 0;
  const nameEnv: string[] = [];

  while (current.tag === "forallE") {
    if (skipped < numParamsToSkip) {
      // 型パラメータ
      typeParams.push({ name: current.name });
      nameEnv.push(current.name);
      current = current.body;
      skipped++;
      continue;
    }

    // implicit/instance はスキップ
    if (current.binder === "implicit" || current.binder === "instImplicit" || current.binder === "strictImplicit") {
      nameEnv.push(current.name);
      current = current.body;
      continue;
    }

    // フィールド
    const fieldType = current.type;
    const hasDefault = isOptParamExpr(fieldType);
    const cleanType = hasDefault ? extractOptParamTypeExpr(fieldType) : fieldType;

    fields.push({
      name: current.name,
      type: resolveTypeFromExpr(cleanType, nameEnv),
      hasDefault,
    });

    nameEnv.push(current.name);
    current = current.body;
  }

  return { typeParams, fields };
}

/** sexp で optParam/autoParam かどうか */
function isOptParamExpr(expr: LeanExpr): boolean {
  if (expr.tag === "app") {
    const head = getAppHeadName(expr);
    return head === "optParam" || head === "autoParam";
  }
  return false;
}

/** optParam の内部型を取り出す: ((:c optParam) type default) → type */
function extractOptParamTypeExpr(expr: LeanExpr): LeanExpr {
  if (expr.tag === "app" && expr.args.length >= 1) {
    return expr.args[0];
  }
  return expr;
}
