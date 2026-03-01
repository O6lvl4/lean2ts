import type { LeanTheorem, IRParam, IRProp, IRExpr } from "../ir/types.js";
import { resolveTypeFromExpr } from "./type-resolver.js";
import type { LeanExpr } from "../s-expression/lean-expr.js";
import { getAppHeadName, isPropSort } from "../s-expression/lean-expr.js";

export { parseTheorem } from "./theorem-parser-pp.js";

// ─── Sexp ベースの定理パーサー ───

/** 既知定数の explicit 引数数（先頭 implicit をスキップするため） */
const KNOWN_EXPLICIT_ARGS: Record<string, number> = {
  "Eq": 2, "Ne": 2, "And": 2, "Or": 2, "Not": 1, "Iff": 2,
  "HAdd.hAdd": 2, "HSub.hSub": 2, "HMul.hMul": 2, "HDiv.hDiv": 2, "HMod.hMod": 2,
  "LT.lt": 2, "LE.le": 2, "GT.gt": 2, "GE.ge": 2,
  "List.cons": 2, "List.nil": 0, "List.length": 1,
  "OfNat.ofNat": 1,
  "Membership.mem": 2,
};

export function parseTheoremFromExpr(
  name: string,
  typeExpr: LeanExpr
): LeanTheorem {
  const universals: IRParam[] = [];
  let current = typeExpr;
  const nameEnv: string[] = [];

  // explicit forallE → universals
  while (current.tag === "forallE") {
    if (current.binder === "implicit" || current.binder === "instImplicit" || current.binder === "strictImplicit") {
      nameEnv.push(current.name);
      current = current.body;
      continue;
    }

    if (isPropValuedExpr(current.type)) break;

    if (isPropBody(current.body)) {
      universals.push({
        name: current.name,
        type: resolveTypeFromExpr(current.type, nameEnv),
      });
      nameEnv.push(current.name);
      current = current.body;
      continue;
    }

    break;
  }

  const prop = exprToProp(current, nameEnv);

  return {
    kind: "theorem",
    name: stripNamespace(name),
    universals,
    prop,
  };
}

/** 既知の Prop-valued 定数ヘッド */
const PROP_HEADS = new Set([
  "Eq", "Ne", "And", "Or", "Not", "Iff",
  "LT.lt", "LE.le", "GT.gt", "GE.ge",
  "Membership.mem", "True", "False",
]);

function isPropValuedExpr(expr: LeanExpr): boolean {
  if (isPropSort(expr)) return true;
  const head = expr.tag === "app" ? getAppHeadName(expr) : undefined;
  return head !== undefined && PROP_HEADS.has(head);
}

function isPropBody(expr: LeanExpr): boolean {
  if (isPropValuedExpr(expr)) return true;
  if (expr.tag === "forallE") return isPropBody(expr.body);
  if (expr.tag === "letE") return isPropBody(expr.body);
  return false;
}

/** LeanExpr → IRProp */
function exprToProp(expr: LeanExpr, nameEnv: string[]): IRProp {
  if (expr.tag === "app") {
    const result = appToProp(expr, nameEnv);
    if (result) return result;
  }

  if (expr.tag === "forallE" && expr.binder === "default") {
    return {
      kind: "implies",
      premise: exprToProp(expr.type, nameEnv),
      conclusion: exprToProp(expr.body, [...nameEnv, expr.name]),
    };
  }

  if (expr.tag === "letE") {
    return exprToProp(expr.body, [...nameEnv, expr.name]);
  }

  return { kind: "raw", text: leanExprToString(expr, nameEnv) };
}

/** app 式を IRProp に変換（マッチしなければ undefined） */
function appToProp(expr: LeanExpr, nameEnv: string[]): IRProp | undefined {
  const head = getAppHeadName(expr);
  const args = getExplicitArgs(expr);

  return tryBinaryExprProp(head, args, nameEnv)
    ?? tryBinaryPropProp(head, args, nameEnv)
    ?? tryUnaryProp(head, args, nameEnv)
    ?? tryComparisonProp(head, args, nameEnv);
}

function tryBinaryExprProp(head: string | undefined, args: LeanExpr[], nameEnv: string[]): IRProp | undefined {
  if (args.length < 2) return undefined;
  const kindMap: Record<string, "eq" | "neq"> = { "Eq": "eq", "Ne": "neq" };
  const kind = head ? kindMap[head] : undefined;
  if (!kind) return undefined;
  return {
    kind,
    left: exprToIRExpr(args[args.length - 2], nameEnv),
    right: exprToIRExpr(args[args.length - 1], nameEnv),
  };
}

function tryBinaryPropProp(head: string | undefined, args: LeanExpr[], nameEnv: string[]): IRProp | undefined {
  if (args.length < 2) return undefined;
  const kindMap: Record<string, "and" | "or" | "iff"> = { "And": "and", "Or": "or", "Iff": "iff" };
  const kind = head ? kindMap[head] : undefined;
  if (!kind) return undefined;
  return {
    kind,
    left: exprToProp(args[args.length - 2], nameEnv),
    right: exprToProp(args[args.length - 1], nameEnv),
  };
}

function tryUnaryProp(head: string | undefined, args: LeanExpr[], nameEnv: string[]): IRProp | undefined {
  if (head !== "Not" || args.length < 1) return undefined;
  return { kind: "not", inner: exprToProp(args[args.length - 1], nameEnv) };
}

function tryComparisonProp(head: string | undefined, args: LeanExpr[], nameEnv: string[]): IRProp | undefined {
  if (!head || args.length < 2) return undefined;
  const compMap: Record<string, { kind: "lt" | "le"; swap: boolean }> = {
    "LT.lt": { kind: "lt", swap: false },
    "GT.gt": { kind: "lt", swap: true },
    "LE.le": { kind: "le", swap: false },
    "GE.ge": { kind: "le", swap: true },
  };
  const comp = compMap[head];
  if (!comp) return undefined;
  const leftIdx = comp.swap ? args.length - 1 : args.length - 2;
  const rightIdx = comp.swap ? args.length - 2 : args.length - 1;
  return {
    kind: comp.kind,
    left: exprToIRExpr(args[leftIdx], nameEnv),
    right: exprToIRExpr(args[rightIdx], nameEnv),
  };
}

function getExplicitArgs(expr: LeanExpr): LeanExpr[] {
  if (expr.tag !== "app") return [];
  const head = getAppHeadName(expr);
  const allArgs = expr.args;

  if (head && KNOWN_EXPLICIT_ARGS[head] !== undefined) {
    const n = KNOWN_EXPLICIT_ARGS[head];
    return allArgs.slice(Math.max(0, allArgs.length - n));
  }

  return allArgs;
}

/** 二項演算子マッピング */
const BINOP_MAP: Record<string, string> = {
  "HAdd.hAdd": "+", "HSub.hSub": "-",
  "HMul.hMul": "*", "HDiv.hDiv": "/", "HMod.hMod": "%",
};

/** LeanExpr → IRExpr */
function exprToIRExpr(expr: LeanExpr, nameEnv: string[]): IRExpr {
  switch (expr.tag) {
    case "bvar": {
      const name = nameEnv[nameEnv.length - 1 - expr.index];
      return { kind: "var", name: name ?? `_${expr.index}` };
    }
    case "fvar":
      return { kind: "var", name: expr.name };
    case "const":
      return { kind: "var", name: expr.name };
    case "lit":
      return { kind: "literal", value: expr.value };
    case "app":
      return appToIRExpr(expr, nameEnv);
    case "proj":
      return {
        kind: "field",
        object: exprToIRExpr(expr.expr, nameEnv),
        field: `${expr.typeName}.${expr.idx}`,
      };
    case "letE":
      return {
        kind: "let",
        name: expr.name,
        value: exprToIRExpr(expr.value, nameEnv),
        body: exprToIRExpr(expr.body, [...nameEnv, expr.name]),
      };
    default:
      return { kind: "raw", text: leanExprToString(expr, nameEnv) };
  }
}

function appToIRExpr(expr: LeanExpr & { tag: "app" }, nameEnv: string[]): IRExpr {
  const head = getAppHeadName(expr);
  const args = getExplicitArgs(expr);

  if (head && args.length === 2 && BINOP_MAP[head]) {
    return {
      kind: "binop",
      op: BINOP_MAP[head],
      left: exprToIRExpr(args[0], nameEnv),
      right: exprToIRExpr(args[1], nameEnv),
    };
  }

  if (head === "OfNat.ofNat" && expr.args.length >= 2) {
    const litArg = expr.args[1];
    if (litArg.tag === "lit") {
      return { kind: "literal", value: litArg.value };
    }
  }

  if (head === "Nat.succ" && args.length >= 1) {
    return {
      kind: "binop",
      op: "+",
      left: exprToIRExpr(args[args.length - 1], nameEnv),
      right: { kind: "literal", value: 1 },
    };
  }

  if (head) {
    return { kind: "call", func: head, args: args.map(a => exprToIRExpr(a, nameEnv)) };
  }

  return { kind: "raw", text: leanExprToString(expr, nameEnv) };
}

function leanExprToString(expr: LeanExpr, nameEnv: string[]): string {
  switch (expr.tag) {
    case "const": return expr.name;
    case "bvar": return nameEnv[nameEnv.length - 1 - expr.index] ?? `_${expr.index}`;
    case "fvar": return expr.name;
    case "lit": return String(expr.value);
    case "sort": return "Sort";
    case "app": {
      const head = getAppHeadName(expr);
      const args = expr.args.map(a => leanExprToString(a, nameEnv)).join(" ");
      return head ? `${head} ${args}` : `(app ${args})`;
    }
    case "forallE": return `∀ (${expr.name}), ${leanExprToString(expr.body, [...nameEnv, expr.name])}`;
    default: return `<${expr.tag}>`;
  }
}

function stripNamespace(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1];
}
