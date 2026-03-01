import type { LeanInductive, IRVariant, IRField, IRTypeParam } from "../ir/types.js";
import type { EnvInspectResponse } from "../pantograph/protocol.js";
import { resolveType, resolveTypeFromExpr } from "./type-resolver.js";
import type { LeanExpr } from "../sexp/lean-expr.js";

/**
 * 帰納型（複数コンストラクタ）をパースする。
 *
 * 各コンストラクタの型 pp から variant を構築。
 * 引数なしコンストラクタはフィールドなし variant になる。
 */
export function parseInductive(
  name: string,
  info: EnvInspectResponse,
  ctorInfos: Map<string, EnvInspectResponse>
): LeanInductive {
  const ctors = info.inductInfo?.ctors ?? [];
  const variants: IRVariant[] = [];

  for (const ctorName of ctors) {
    const ctorInfo = ctorInfos.get(ctorName);
    const typePp = ctorInfo?.type?.pp ?? "";
    const tag = extractTag(ctorName, name);
    const fields = extractVariantFields(typePp, name);

    variants.push({ name: ctorName, tag, fields });
  }

  return {
    kind: "inductive",
    name: stripNamespace(name),
    typeParams: [],
    variants,
  };
}

/**
 * コンストラクタ名から tag を抽出。
 * 例: `RecordType.revenue` → `"revenue"`
 */
function extractTag(ctorName: string, parentName: string): string {
  const prefix = parentName + ".";
  if (ctorName.startsWith(prefix)) {
    return toCamelCase(ctorName.slice(prefix.length));
  }
  // フルパスが合わない場合、最後の部分を使う
  const parts = ctorName.split(".");
  return toCamelCase(parts[parts.length - 1]);
}

/**
 * コンストラクタ型 pp からバリアントのフィールドを抽出。
 * 引数なし（型が直接 `ParentName`）の場合は空配列。
 */
function extractVariantFields(typePp: string, parentName: string): IRField[] {
  const fields: IRField[] = [];

  // 名前付きパラメータ `(name : Type) → ...`
  const namedParamRegex = /\((\w+)\s*:\s*([^)]+)\)\s*→/g;
  for (const match of typePp.matchAll(namedParamRegex)) {
    fields.push({
      name: match[1],
      type: resolveType(match[2].trim()),
      hasDefault: false,
    });
  }

  // 名前なしパラメータ
  if (fields.length === 0) {
    const parts = typePp.split("→").map((s) => s.trim());
    // 最後は戻り値型（親の型名）なので除外
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i].replace(/^\(/, "").replace(/\)$/, "").trim();
      if (part && part !== stripNamespace(parentName)) {
        fields.push({
          name: `field${i + 1}`,
          type: resolveType(part),
          hasDefault: false,
        });
      }
    }
  }

  return fields;
}

function stripNamespace(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1];
}

function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ─── Sexp ベース ───

export function parseInductiveFromExpr(
  name: string,
  info: EnvInspectResponse,
  ctorExprs: Map<string, LeanExpr>
): LeanInductive {
  const ctors = info.inductInfo?.ctors ?? [];
  const numParams = info.inductInfo?.numParams ?? 0;
  const variants: IRVariant[] = [];
  const typeParams: IRTypeParam[] = [];

  // 最初のコンストラクタから型パラメータを抽出
  if (ctors.length > 0) {
    const firstExpr = ctorExprs.get(ctors[0]);
    if (firstExpr) {
      extractTypeParamsFromCtor(firstExpr, numParams, typeParams);
    }
  }

  for (const ctorName of ctors) {
    const ctorExpr = ctorExprs.get(ctorName);
    const tag = extractTag(ctorName, name);

    if (ctorExpr) {
      const fields = extractVariantFieldsFromExpr(ctorExpr, numParams);
      variants.push({ name: ctorName, tag, fields });
    } else {
      variants.push({ name: ctorName, tag, fields: [] });
    }
  }

  return {
    kind: "inductive",
    name: stripNamespace(name),
    typeParams,
    variants,
  };
}

function extractTypeParamsFromCtor(
  expr: LeanExpr,
  numParams: number,
  typeParams: IRTypeParam[]
): void {
  let current = expr;
  let count = 0;
  while (current.tag === "forallE" && count < numParams) {
    typeParams.push({ name: current.name });
    current = current.body;
    count++;
  }
}

function extractVariantFieldsFromExpr(
  expr: LeanExpr,
  numParamsToSkip: number
): IRField[] {
  const fields: IRField[] = [];
  let current = expr;
  let skipped = 0;
  const nameEnv: string[] = [];

  while (current.tag === "forallE") {
    if (skipped < numParamsToSkip) {
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

    fields.push({
      name: current.name,
      type: resolveTypeFromExpr(current.type, nameEnv),
      hasDefault: false,
    });

    nameEnv.push(current.name);
    current = current.body;
  }

  return fields;
}
