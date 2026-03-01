import type { LeanDecl } from "../ir/types.js";
import type { PantographClient } from "../pantograph/client.js";
import type { EnvInspectResponse } from "../pantograph/protocol.js";
import { parseSexp } from "../sexp/parser.js";
import { sexpToLeanExpr, type LeanExpr } from "../sexp/lean-expr.js";
import { classify } from "./classifier.js";
import { parseStructure, parseStructureFromExpr } from "./structure-parser.js";
import { parseInductive, parseInductiveFromExpr } from "./inductive-parser.js";
import { parseTheoremFromExpr, parseTheorem } from "./theorem-parser.js";
import { parseDef } from "./def-parser.js";
import { parseDefFromExpr } from "./def-parser.js";

export interface ExtractionResult {
  declarations: LeanDecl[];
  skipped: string[];
  errors: Array<{ name: string; error: string }>;
}

/**
 * Lean ファイルから全宣言を抽出するオーケストレーター。
 */
export async function extractDeclarations(
  client: PantographClient,
  filePath: string
): Promise<ExtractionResult> {
  const constants = await client.processFile(filePath);
  return extractFromConstants(client, constants);
}

/**
 * 定数名リストから宣言を抽出する（テスト用にも使える）
 */
export async function extractFromConstants(
  client: PantographClient,
  constants: string[]
): Promise<ExtractionResult> {
  const inspectResults = new Map<string, EnvInspectResponse>();
  const errors: Array<{ name: string; error: string }> = [];

  for (const name of constants) {
    try {
      const info = await client.inspect(name);
      inspectResults.set(name, info);
    } catch (err) {
      errors.push({ name, error: String(err) });
    }
  }

  const result = extractFromInspectResults(constants, inspectResults);
  result.errors.push(...errors);
  return result;
}

/**
 * inspect 結果から sexp を取得し、fixtures からも使えるように
 * 直接 inspect 結果を渡せるバージョン
 */
export function extractFromInspectResults(
  constants: string[],
  inspectResults: Map<string, EnvInspectResponse>
): ExtractionResult {
  const declarations: LeanDecl[] = [];
  const skipped: string[] = [];
  const errors: Array<{ name: string; error: string }> = [];

  // 帰納型名を収集（子宣言のフィルタリング用）
  const inductiveNames = collectInductiveNames(inspectResults);

  for (const name of constants) {
    const info = inspectResults.get(name);
    if (!info) continue;

    const typeExpr = tryParseSexp(info.type?.sexp);
    const kind = classify(name, info, typeExpr, inductiveNames);

    if (kind === "skip") {
      skipped.push(name);
      continue;
    }

    try {
      const decl = parseDecl({ kind, name, info, typeExpr }, inspectResults);
      if (decl) declarations.push(decl);
    } catch (err) {
      errors.push({ name, error: String(err) });
    }
  }

  return { declarations, skipped, errors };
}

interface DeclContext {
  kind: string;
  name: string;
  info: EnvInspectResponse;
  typeExpr: LeanExpr | undefined;
}

function parseDecl(
  ctx: DeclContext,
  inspectResults: Map<string, EnvInspectResponse>
): LeanDecl | undefined {
  const { kind, name, info, typeExpr } = ctx;
  switch (kind) {
    case "structure":
      return parseStructureDecl(name, info, inspectResults);
    case "inductive":
      return parseInductiveDecl(name, info, inspectResults);
    case "theorem":
      return typeExpr ? parseTheoremFromExpr(name, typeExpr) : parseTheorem(name, info);
    case "def":
      return typeExpr ? parseDefFromExpr(name, typeExpr) : parseDef(name, info);
    default:
      return undefined;
  }
}

function parseStructureDecl(
  name: string,
  info: EnvInspectResponse,
  inspectResults: Map<string, EnvInspectResponse>
): LeanDecl | undefined {
  const ctorName = info.inductInfo?.ctors[0];
  const ctorInfo = ctorName ? inspectResults.get(ctorName) : undefined;
  if (!ctorInfo) return undefined;

  const ctorExpr = tryParseSexp(ctorInfo.type?.sexp);
  return ctorExpr
    ? parseStructureFromExpr(name, info, ctorExpr)
    : parseStructure(name, info, ctorInfo);
}

function parseInductiveDecl(
  name: string,
  info: EnvInspectResponse,
  inspectResults: Map<string, EnvInspectResponse>
): LeanDecl {
  const ctorExprs = new Map<string, LeanExpr>();
  const ctorInfos = new Map<string, EnvInspectResponse>();
  let allHaveSexp = true;

  for (const cn of info.inductInfo?.ctors ?? []) {
    const ci = inspectResults.get(cn);
    if (ci) {
      ctorInfos.set(cn, ci);
      const expr = tryParseSexp(ci.type?.sexp);
      if (expr) {
        ctorExprs.set(cn, expr);
      } else {
        allHaveSexp = false;
      }
    }
  }

  return allHaveSexp && ctorExprs.size > 0
    ? parseInductiveFromExpr(name, info, ctorExprs)
    : parseInductive(name, info, ctorInfos);
}

/** inspect 結果から inductInfo を持つ名前を収集 */
function collectInductiveNames(
  inspectResults: Map<string, EnvInspectResponse>
): Set<string> {
  const names = new Set<string>();
  for (const [name, info] of inspectResults) {
    if (info.inductInfo) {
      names.add(name);
    }
  }
  return names;
}

function tryParseSexp(sexp: string | undefined): LeanExpr | undefined {
  if (!sexp) return undefined;
  try {
    return sexpToLeanExpr(parseSexp(sexp));
  } catch {
    return undefined;
  }
}
