import type { LeanDef, IRParam, IRTypeParam } from "../ir/types.js";
import type { EnvInspectResponse } from "../pantograph/protocol.js";
import { resolveType, resolveTypeFromExpr } from "./type-resolver.js";
import type { LeanExpr } from "../sexp/lean-expr.js";

/**
 * 関数シグネチャを抽出する。
 *
 * 型 pp 例: `(x : Nat) → (y : Nat) → Nat`
 * → params: [{name:"x", type:Nat}, {name:"y", type:Nat}]
 * → returnType: Nat
 */
export function parseDef(
  name: string,
  info: EnvInspectResponse
): LeanDef {
  const typePp = info.type?.pp ?? "";
  const { params, returnType } = extractFunctionSig(typePp);

  return {
    kind: "def",
    name: stripNamespace(name),
    typeParams: [],
    params,
    returnType,
  };
}

function extractFunctionSig(
  pp: string
): { params: IRParam[]; returnType: ReturnType<typeof resolveType> } {
  const params: IRParam[] = [];
  let rest = pp.trim();

  // 名前付きパラメータ `(name : Type) → ...` を繰り返し消費
  while (true) {
    const match = rest.match(/^\((\w+)\s*:\s*([^)]+)\)\s*→\s*/);
    if (match) {
      params.push({
        name: match[1],
        type: resolveType(match[2].trim()),
      });
      rest = rest.slice(match[0].length);
      continue;
    }

    // implicit パラメータ `{name : Type}` はスキップ
    const implicitMatch = rest.match(/^\{[^}]+\}\s*→\s*/);
    if (implicitMatch) {
      rest = rest.slice(implicitMatch[0].length);
      continue;
    }

    // instance パラメータ `[inst : Type]` もスキップ
    const instMatch = rest.match(/^\[[^\]]+\]\s*→\s*/);
    if (instMatch) {
      rest = rest.slice(instMatch[0].length);
      continue;
    }

    break;
  }

  // 残りに `→` があれば無名パラメータ + 戻り値型
  const arrowParts = splitArrows(rest);
  if (arrowParts.length > 1) {
    // 最後が戻り値型
    for (let i = 0; i < arrowParts.length - 1; i++) {
      params.push({
        name: `arg${params.length + 1}`,
        type: resolveType(arrowParts[i]),
      });
    }
    return {
      params,
      returnType: resolveType(arrowParts[arrowParts.length - 1]),
    };
  }

  // 矢印がなければ rest 全体が戻り値型
  return {
    params,
    returnType: resolveType(rest),
  };
}

/** トップレベルの `→` で分割 */
function splitArrows(s: string): string[] {
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

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function stripNamespace(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1];
}

// ─── Sexp ベース ───

export function parseDefFromExpr(
  name: string,
  typeExpr: LeanExpr
): LeanDef {
  const params: IRParam[] = [];
  const typeParams: IRTypeParam[] = [];
  let current = typeExpr;
  const nameEnv: string[] = [];

  while (current.tag === "forallE") {
    // implicit → 型パラメータとして収集
    if (current.binder === "implicit" || current.binder === "strictImplicit") {
      typeParams.push({ name: current.name });
      nameEnv.push(current.name);
      current = current.body;
      continue;
    }

    // instance → スキップ
    if (current.binder === "instImplicit") {
      nameEnv.push(current.name);
      current = current.body;
      continue;
    }

    // explicit → パラメータ
    params.push({
      name: current.name,
      type: resolveTypeFromExpr(current.type, nameEnv),
    });
    nameEnv.push(current.name);
    current = current.body;
  }

  const returnType = resolveTypeFromExpr(current, nameEnv);

  return {
    kind: "def",
    name: stripNamespace(name),
    typeParams,
    params,
    returnType,
  };
}
