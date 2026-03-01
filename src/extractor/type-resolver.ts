import type { IRType } from "../ir/types.js";
import { lookupPrimitive, resolveTypeConstructor } from "../lean-ts-map.js";
import type { LeanExpr } from "../sexp/lean-expr.js";
import { getAppHeadName } from "../sexp/lean-expr.js";

export { resolveType } from "./type-resolver-pp.js";

// ─── Sexp (LeanExpr) ベースの型解決 ───

/**
 * LeanExpr AST を IRType に変換する。
 * nameEnv は de Bruijn index → 変数名 の環境（先頭が最内バインダ）。
 */
export function resolveTypeFromExpr(expr: LeanExpr, nameEnv: string[] = []): IRType {
  switch (expr.tag) {
    case "const": {
      // プリミティブ
      const prim = lookupPrimitive(expr.name);
      if (prim) return prim.tsType;
      return { kind: "ref", name: stripLastComponent(expr.name) };
    }

    case "sort":
      return { kind: "primitive", name: "void" };

    case "lit":
      return { kind: "literal", value: expr.value };

    case "bvar": {
      const name = nameEnv[nameEnv.length - 1 - expr.index];
      return name ? { kind: "ref", name } : { kind: "unknown", leanName: `bvar(${expr.index})` };
    }

    case "fvar":
      return { kind: "ref", name: expr.name };

    case "mvar":
      return { kind: "unknown", leanName: `mvar(${expr.name})` };

    case "app":
      return resolveAppType(expr.fn, expr.args, nameEnv);

    case "forallE":
      return resolveForallType(expr, nameEnv);

    case "lambda":
      // ラムダ型は関数型として扱う
      return {
        kind: "function",
        params: [{ name: expr.name, type: resolveTypeFromExpr(expr.type, nameEnv) }],
        returnType: resolveTypeFromExpr(expr.body, [...nameEnv, expr.name]),
      };

    case "letE":
      // let は body の型に帰着
      return resolveTypeFromExpr(expr.body, [...nameEnv, expr.name]);

    case "proj":
      return { kind: "unknown", leanName: `proj(${expr.typeName}.${expr.idx})` };

    case "unknown":
      return { kind: "unknown", leanName: expr.raw };
  }
}

/** 関数適用型を解決 */
function resolveAppType(fn: LeanExpr, args: LeanExpr[], nameEnv: string[]): IRType {
  const headName = getAppHeadName({ tag: "app", fn, args });

  if (headName) {
    return resolveNamedAppType(headName, args, nameEnv);
  }

  // ヘッドが定数でない場合
  return resolveTypeFromExpr(fn, nameEnv);
}

/** ヘッド定数名が既知の関数適用型を解決 */
function resolveNamedAppType(headName: string, args: LeanExpr[], nameEnv: string[]): IRType {
  const resolvedArgs = args.map(a => resolveTypeFromExpr(a, nameEnv));

  // 既知の型コンストラクタ
  const resolved = resolveTypeConstructor(headName, resolvedArgs);
  if (resolved) return resolved;

  // プリミティブ（引数なし定数がapp内に出現する場合）
  const prim = lookupPrimitive(headName);
  if (prim && args.length === 0) return prim.tsType;

  // optParam/autoParam → 内部型を返す
  if (headName === "optParam" || headName === "autoParam") {
    return args[0] ? resolveTypeFromExpr(args[0], nameEnv) : { kind: "unknown", leanName: headName };
  }

  // OfNat.ofNat → number
  if (headName === "OfNat.ofNat") {
    return { kind: "primitive", name: "number" };
  }

  // 引数付きの未知型 → generic
  return resolveGenericOrRef(headName, resolvedArgs);
}

/** 引数付きなら generic、なければ ref */
function resolveGenericOrRef(name: string, resolvedArgs: IRType[]): IRType {
  if (resolvedArgs.length > 0) {
    const meaningful = resolvedArgs.filter(
      a => a.kind !== "primitive" || a.name !== "void"
    );
    if (meaningful.length > 0) {
      return { kind: "generic", name: stripLastComponent(name), args: meaningful };
    }
  }
  return { kind: "ref", name: stripLastComponent(name) };
}

/** forallE を関数型に変換（非依存の場合） */
function resolveForallType(expr: LeanExpr & { tag: "forallE" }, nameEnv: string[]): IRType {
  // implicit/instance パラメータはスキップ
  if (expr.binder === "implicit" || expr.binder === "instImplicit" || expr.binder === "strictImplicit") {
    return resolveTypeFromExpr(expr.body, [...nameEnv, expr.name]);
  }

  // non-dependent forall (body が bvar 0 を参照しない) → 関数型
  const paramType = resolveTypeFromExpr(expr.type, nameEnv);
  const bodyType = resolveTypeFromExpr(expr.body, [...nameEnv, expr.name]);

  // body も function なら params をフラット化
  if (bodyType.kind === "function") {
    return {
      kind: "function",
      params: [{ name: expr.name, type: paramType }, ...bodyType.params],
      returnType: bodyType.returnType,
    };
  }

  return {
    kind: "function",
    params: [{ name: expr.name, type: paramType }],
    returnType: bodyType,
  };
}

function stripLastComponent(name: string): string {
  // 名前空間プレフィックスを除去しない（ユーザー定義型はそのまま保持）
  return name;
}
