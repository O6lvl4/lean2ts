import type { LeanDecl } from "../ir/types.js";
import type { PantographClient } from "../pantograph/client.js";
import type { EnvInspectResponse } from "../pantograph/protocol.js";
import { parseSexp } from "../sexp/parser.js";
import { sexpToLeanExpr, type LeanExpr } from "../sexp/lean-expr.js";
import { classify } from "./classifier.js";
import { parseStructure, parseStructureFromExpr } from "./structure-parser.js";
import { parseInductive, parseInductiveFromExpr } from "./inductive-parser.js";
import { parseTheorem, parseTheoremFromExpr } from "./theorem-parser.js";
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
      switch (kind) {
        case "structure": {
          const ctorName = info.inductInfo?.ctors[0];
          const ctorInfo = ctorName ? inspectResults.get(ctorName) : undefined;
          if (ctorInfo) {
            const ctorExpr = tryParseSexp(ctorInfo.type?.sexp);
            if (ctorExpr) {
              declarations.push(parseStructureFromExpr(name, info, ctorExpr));
            } else {
              declarations.push(parseStructure(name, info, ctorInfo));
            }
          }
          break;
        }
        case "inductive": {
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

          if (allHaveSexp && ctorExprs.size > 0) {
            declarations.push(parseInductiveFromExpr(name, info, ctorExprs));
          } else {
            declarations.push(parseInductive(name, info, ctorInfos));
          }
          break;
        }
        case "theorem":
          if (typeExpr) {
            declarations.push(parseTheoremFromExpr(name, typeExpr));
          } else {
            declarations.push(parseTheorem(name, info));
          }
          break;
        case "def":
          if (typeExpr) {
            declarations.push(parseDefFromExpr(name, typeExpr));
          } else {
            declarations.push(parseDef(name, info));
          }
          break;
      }
    } catch (err) {
      errors.push({ name, error: String(err) });
    }
  }

  return { declarations, skipped, errors };
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
