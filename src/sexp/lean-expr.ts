import type { SexpNode } from "./parser.js";

// ─── Lean Expression AST ───

export type BinderInfo = "default" | "implicit" | "strictImplicit" | "instImplicit";

export type LeanExpr =
  | { tag: "bvar"; index: number }
  | { tag: "fvar"; name: string }
  | { tag: "mvar"; name: string }
  | { tag: "sort"; level: LeanLevel }
  | { tag: "const"; name: string }
  | { tag: "app"; fn: LeanExpr; args: LeanExpr[] }
  | { tag: "lambda"; name: string; type: LeanExpr; body: LeanExpr; binder: BinderInfo }
  | { tag: "forallE"; name: string; type: LeanExpr; body: LeanExpr; binder: BinderInfo }
  | { tag: "letE"; name: string; type: LeanExpr; value: LeanExpr; body: LeanExpr }
  | { tag: "lit"; value: number | string }
  | { tag: "proj"; typeName: string; idx: number; expr: LeanExpr }
  | { tag: "unknown"; raw: string };

// ─── Universe Levels ───

export type LeanLevel =
  | { tag: "zero" }
  | { tag: "num"; value: number }
  | { tag: "param"; name: string }
  | { tag: "succ"; base: LeanLevel; offset: number }
  | { tag: "max"; a: LeanLevel; b: LeanLevel }
  | { tag: "imax"; a: LeanLevel; b: LeanLevel }
  | { tag: "mvar"; name: string };

// ─── SexpNode → LeanExpr 変換 ───

export function sexpToLeanExpr(node: SexpNode): LeanExpr {
  // bare number → bvar
  if (node.kind === "number") {
    return { tag: "bvar", index: node.value };
  }

  // bare atom → "_" は erased argument placeholder、それ以外は unknown
  if (node.kind === "atom") {
    if (node.value === "_") {
      return { tag: "const", name: "_" };
    }
    return { tag: "unknown", raw: node.value };
  }

  // string literal
  if (node.kind === "string") {
    return { tag: "lit", value: node.value };
  }

  // keyword alone (shouldn't appear at top level normally)
  if (node.kind === "keyword") {
    return { tag: "unknown", raw: `:${node.value}` };
  }

  // list
  if (node.kind !== "list" || node.children.length === 0) {
    return { tag: "unknown", raw: "" };
  }

  const head = node.children[0];

  // (:keyword ...) forms
  if (head.kind === "keyword") {
    return parseKeywordForm(head.value, node.children.slice(1));
  }

  // function application: (fn arg1 arg2 ...)
  const fn = sexpToLeanExpr(head);
  const args = node.children.slice(1).map(sexpToLeanExpr);
  return { tag: "app", fn, args };
}

function parseKeywordForm(keyword: string, rest: SexpNode[]): LeanExpr {
  switch (keyword) {
    case "c": {
      // (:c Name)
      const name = extractName(rest[0]);
      return { tag: "const", name };
    }

    case "sort": {
      // (:sort level)
      const level = rest[0] ? parseLevel(rest[0]) : { tag: "zero" as const };
      return { tag: "sort", level };
    }

    case "lit": {
      // (:lit value) - number or "string"
      if (rest[0]?.kind === "number") {
        return { tag: "lit", value: rest[0].value };
      }
      if (rest[0]?.kind === "string") {
        return { tag: "lit", value: rest[0].value };
      }
      return { tag: "lit", value: 0 };
    }

    case "forall": {
      // (:forall name type body [:i|:si|:ii])
      return parseBinderForm("forallE", rest);
    }

    case "lambda": {
      // (:lambda name type body [:i|:si|:ii])
      return parseBinderForm("lambda", rest);
    }

    case "let": {
      // (:let name type value body)
      if (rest.length < 4) return { tag: "unknown", raw: `:let(${rest.length})` };
      return {
        tag: "letE",
        name: extractName(rest[0]),
        type: sexpToLeanExpr(rest[1]),
        value: sexpToLeanExpr(rest[2]),
        body: sexpToLeanExpr(rest[3]),
      };
    }

    case "fv": {
      // (:fv name)
      return { tag: "fvar", name: extractName(rest[0]) };
    }

    case "mv":
    case "mvd": {
      // (:mv name) or (:mvd name)
      return { tag: "mvar", name: extractName(rest[0]) };
    }

    case "proj": {
      // (:proj typeName idx inner)
      const typeName = extractName(rest[0]);
      const idx = rest[1]?.kind === "number" ? rest[1].value : 0;
      const expr = rest[2] ? sexpToLeanExpr(rest[2]) : { tag: "unknown" as const, raw: "" };
      return { tag: "proj", typeName, idx, expr };
    }

    case "subst": {
      // (:subst callee args...) → treat as application
      if (rest.length === 0) return { tag: "unknown", raw: ":subst" };
      const fn = sexpToLeanExpr(rest[0]);
      const args = rest.slice(1).map(sexpToLeanExpr);
      return { tag: "app", fn, args };
    }

    default:
      return { tag: "unknown", raw: `:${keyword}` };
  }
}

function parseBinderForm(
  tag: "forallE" | "lambda",
  rest: SexpNode[]
): LeanExpr {
  if (rest.length < 3) {
    return { tag: "unknown", raw: `:${tag}(${rest.length})` };
  }

  const name = extractName(rest[0]);
  const type = sexpToLeanExpr(rest[1]);

  // body と binder info の判定
  // 末尾が :i, :si, :ii のキーワードなら binder info
  let binder: BinderInfo = "default";
  let bodyNode: SexpNode;

  const last = rest[rest.length - 1];
  if (last.kind === "keyword" && isBinderKeyword(last.value)) {
    binder = binderFromKeyword(last.value);
    bodyNode = rest[2];
  } else {
    bodyNode = rest[2];
  }

  const body = sexpToLeanExpr(bodyNode);

  return { tag, name, type, body, binder };
}

function isBinderKeyword(value: string): boolean {
  return value === "i" || value === "si" || value === "ii";
}

function binderFromKeyword(value: string): BinderInfo {
  switch (value) {
    case "i": return "implicit";
    case "si": return "strictImplicit";
    case "ii": return "instImplicit";
    default: return "default";
  }
}

function extractName(node: SexpNode | undefined): string {
  if (!node) return "_";
  if (node.kind === "atom") return node.value;
  if (node.kind === "string") return node.value;
  if (node.kind === "number") return String(node.value);
  if (node.kind === "keyword") return node.value;
  return "_";
}

// ─── Level parsing ───

function parseLevel(node: SexpNode): LeanLevel {
  if (node.kind === "number") {
    if (node.value === 0) return { tag: "zero" };
    return { tag: "num", value: node.value };
  }

  if (node.kind === "atom") {
    return { tag: "param", name: node.value };
  }

  if (node.kind === "list" && node.children.length > 0) {
    const head = node.children[0];

    // (+ base offset)
    if (head.kind === "atom" && head.value === "+") {
      const base = parseLevel(node.children[1]);
      const offset = node.children[2]?.kind === "number" ? node.children[2].value : 1;
      return { tag: "succ", base, offset };
    }

    // (:max a b)
    if (head.kind === "keyword" && head.value === "max") {
      return {
        tag: "max",
        a: parseLevel(node.children[1]),
        b: parseLevel(node.children[2]),
      };
    }

    // (:imax a b)
    if (head.kind === "keyword" && head.value === "imax") {
      return {
        tag: "imax",
        a: parseLevel(node.children[1]),
        b: parseLevel(node.children[2]),
      };
    }

    // (:mv name)
    if (head.kind === "keyword" && head.value === "mv") {
      return { tag: "mvar", name: extractName(node.children[1]) };
    }
  }

  return { tag: "zero" };
}

// ─── ユーティリティ ───

/** LeanExpr が de Bruijn index n を参照しているか（body 内の bvar 参照チェック） */
export function referencesBVar(expr: LeanExpr, index: number): boolean {
  switch (expr.tag) {
    case "bvar":
      return expr.index === index;
    case "app":
      return referencesBVar(expr.fn, index) || expr.args.some(a => referencesBVar(a, index));
    case "lambda":
    case "forallE":
      return referencesBVar(expr.type, index) || referencesBVar(expr.body, index + 1);
    case "letE":
      return (
        referencesBVar(expr.type, index) ||
        referencesBVar(expr.value, index) ||
        referencesBVar(expr.body, index + 1)
      );
    case "proj":
      return referencesBVar(expr.expr, index);
    default:
      return false;
  }
}

/** 関数適用のヘッド定数名を取得（ネストした app を掘る） */
export function getAppHeadName(expr: LeanExpr): string | undefined {
  if (expr.tag === "const") return expr.name;
  if (expr.tag === "app") return getAppHeadName(expr.fn);
  return undefined;
}

/** 関数適用の全引数をフラット化して取得 */
export function getAppArgs(expr: LeanExpr): LeanExpr[] {
  if (expr.tag === "app") {
    return expr.args;
  }
  return [];
}

/** Sort level が 0 (Prop) かどうか */
export function isPropSort(expr: LeanExpr): boolean {
  return expr.tag === "sort" && (expr.level.tag === "zero" || (expr.level.tag === "num" && expr.level.value === 0));
}

/** forallE チェインを展開して (params, body) に分離 */
export interface ForallParam {
  name: string;
  type: LeanExpr;
  binder: BinderInfo;
}

export function unfoldForalls(expr: LeanExpr): { params: ForallParam[]; body: LeanExpr } {
  const params: ForallParam[] = [];
  let current = expr;

  while (current.tag === "forallE") {
    params.push({
      name: current.name,
      type: current.type,
      binder: current.binder,
    });
    current = current.body;
  }

  return { params, body: current };
}
