import type { LeanTheorem, IRParam, IRProp, IRExpr } from "../ir/types.js";
import type { EnvInspectResponse } from "../pantograph/protocol.js";
import { resolveType, resolveTypeFromExpr } from "./type-resolver.js";
import type { LeanExpr } from "../sexp/lean-expr.js";
import { getAppHeadName, isPropSort } from "../sexp/lean-expr.js";

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
    // `(x : T) (y : U), body` or `x : T, body`
    const commaIdx = findTopLevelComma(rest);
    if (commaIdx >= 0) {
      const paramsPart = rest.slice(0, commaIdx).trim();
      rest = rest.slice(commaIdx + 1).trim();

      // 括弧付きパラメータ
      const paramRegex = /\((\w+)\s*:\s*([^)]+)\)/g;
      let match: RegExpExecArray | null;
      while ((match = paramRegex.exec(paramsPart)) !== null) {
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
function parseProp(body: string): IRProp {
  body = body.trim();

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
    else if (s[i] === "=" && depth === 0) {
      // `:=` を除外
      if (i > 0 && s[i - 1] === ":") continue;
      // `==` を除外（別のオペレータ）
      if (i + 1 < s.length && s[i + 1] === "=") continue;
      return i;
    }
  }
  return -1;
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
function parseExpr(text: string): IRExpr {
  text = text.trim();

  // 数値リテラル
  if (/^\d+$/.test(text)) {
    return { kind: "literal", value: Number(text) };
  }

  // 文字列リテラル
  if (/^".*"$/.test(text)) {
    return { kind: "literal", value: text.slice(1, -1) };
  }

  // true / false
  if (text === "true") return { kind: "literal", value: true };
  if (text === "false") return { kind: "literal", value: false };

  // フィールドアクセス: `x.field`
  const dotMatch = text.match(/^(\w+)\.(\w+)$/);
  if (dotMatch) {
    return {
      kind: "field",
      object: { kind: "var", name: dotMatch[1] },
      field: dotMatch[2],
    };
  }

  // 関数適用: `f x y`
  const parts = splitTopLevel(text);
  if (parts.length > 1) {
    return {
      kind: "call",
      func: parts[0],
      args: parts.slice(1).map(parseExpr),
    };
  }

  // 変数
  if (/^[\w.]+$/.test(text)) {
    return { kind: "var", name: text };
  }

  // フォールバック
  return { kind: "raw", text };
}

/** トップレベルのスペースで分割（括弧内は無視） */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") {
      depth++;
      current += s[i];
    } else if (s[i] === ")") {
      depth--;
      current += s[i];
    } else if (s[i] === " " && depth === 0) {
      if (current) parts.push(current);
      current = "";
    } else {
      current += s[i];
    }
  }
  if (current) parts.push(current);
  return parts;
}

function stripNamespace(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1];
}

// ─── Sexp ベースの定理パーサー ───

/** 既知定数の explicit 引数数（先頭 implicit をスキップするため） */
const knownExplicitArgs: Record<string, number> = {
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

    // パラメータの型が Prop-valued（Eq, And 等）なら含意であり、universal ではない
    if (isPropValuedExpr(current.type)) {
      break;
    }

    // body の末端が Prop なら、このパラメータは universal
    if (isPropBody(current.body)) {
      universals.push({
        name: current.name,
        type: resolveTypeFromExpr(current.type, nameEnv),
      });
      nameEnv.push(current.name);
      current = current.body;
      continue;
    }

    // Prop でない → 関数型の一部としての forall（含意等）
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

/** 式が Prop-valued（Eq, And 等の適用 or Sort 0）かを直接判定 */
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
    const head = getAppHeadName(expr);
    const args = getExplicitArgs(expr);

    switch (head) {
      case "Eq":
        if (args.length >= 2) {
          return {
            kind: "eq",
            left: exprToIRExpr(args[args.length - 2], nameEnv),
            right: exprToIRExpr(args[args.length - 1], nameEnv),
          };
        }
        break;
      case "Ne":
        if (args.length >= 2) {
          return {
            kind: "neq",
            left: exprToIRExpr(args[args.length - 2], nameEnv),
            right: exprToIRExpr(args[args.length - 1], nameEnv),
          };
        }
        break;
      case "And":
        if (args.length >= 2) {
          return {
            kind: "and",
            left: exprToProp(args[args.length - 2], nameEnv),
            right: exprToProp(args[args.length - 1], nameEnv),
          };
        }
        break;
      case "Or":
        if (args.length >= 2) {
          return {
            kind: "or",
            left: exprToProp(args[args.length - 2], nameEnv),
            right: exprToProp(args[args.length - 1], nameEnv),
          };
        }
        break;
      case "Not":
        if (args.length >= 1) {
          return {
            kind: "not",
            inner: exprToProp(args[args.length - 1], nameEnv),
          };
        }
        break;
      case "Iff":
        if (args.length >= 2) {
          return {
            kind: "iff",
            left: exprToProp(args[args.length - 2], nameEnv),
            right: exprToProp(args[args.length - 1], nameEnv),
          };
        }
        break;
      case "LT.lt":
        if (args.length >= 2) {
          return {
            kind: "lt",
            left: exprToIRExpr(args[args.length - 2], nameEnv),
            right: exprToIRExpr(args[args.length - 1], nameEnv),
          };
        }
        break;
      case "GT.gt":
        // GT.gt a b = a > b = b < a → swap args for "lt"
        if (args.length >= 2) {
          return {
            kind: "lt",
            left: exprToIRExpr(args[args.length - 1], nameEnv),
            right: exprToIRExpr(args[args.length - 2], nameEnv),
          };
        }
        break;
      case "LE.le":
        if (args.length >= 2) {
          return {
            kind: "le",
            left: exprToIRExpr(args[args.length - 2], nameEnv),
            right: exprToIRExpr(args[args.length - 1], nameEnv),
          };
        }
        break;
      case "GE.ge":
        // GE.ge a b = a ≥ b = b ≤ a → swap args for "le"
        if (args.length >= 2) {
          return {
            kind: "le",
            left: exprToIRExpr(args[args.length - 1], nameEnv),
            right: exprToIRExpr(args[args.length - 2], nameEnv),
          };
        }
        break;
    }
  }

  // non-dependent forallE → implies
  if (expr.tag === "forallE" && expr.binder === "default") {
    return {
      kind: "implies",
      premise: exprToProp(expr.type, nameEnv),
      conclusion: exprToProp(expr.body, [...nameEnv, expr.name]),
    };
  }

  // letE
  if (expr.tag === "letE") {
    return exprToProp(expr.body, [...nameEnv, expr.name]);
  }

  // フォールバック
  return { kind: "raw", text: leanExprToString(expr, nameEnv) };
}

/** 最後の N 個の引数を取得（explicit 引数） */
function getExplicitArgs(expr: LeanExpr): LeanExpr[] {
  if (expr.tag !== "app") return [];
  const head = getAppHeadName(expr);
  const allArgs = expr.args;

  if (head && knownExplicitArgs[head] !== undefined) {
    const n = knownExplicitArgs[head];
    return allArgs.slice(Math.max(0, allArgs.length - n));
  }

  // 不明な場合は全引数を返す
  return allArgs;
}

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
    case "app": {
      const head = getAppHeadName(expr);
      const args = getExplicitArgs(expr);

      // 二項演算子
      if (head && args.length === 2) {
        const opMap: Record<string, string> = {
          "HAdd.hAdd": "+", "HSub.hSub": "-",
          "HMul.hMul": "*", "HDiv.hDiv": "/", "HMod.hMod": "%",
        };
        if (opMap[head]) {
          return {
            kind: "binop",
            op: opMap[head],
            left: exprToIRExpr(args[0], nameEnv),
            right: exprToIRExpr(args[1], nameEnv),
          };
        }
      }

      // OfNat.ofNat → リテラル（全引数: [type, literal, instance]）
      if (head === "OfNat.ofNat" && expr.args.length >= 2) {
        const litArg = expr.args[1]; // 2番目の引数がリテラル値
        if (litArg.tag === "lit") {
          return { kind: "literal", value: litArg.value };
        }
      }

      // Nat.succ → n + 1
      if (head === "Nat.succ" && args.length >= 1) {
        return {
          kind: "binop",
          op: "+",
          left: exprToIRExpr(args[args.length - 1], nameEnv),
          right: { kind: "literal", value: 1 },
        };
      }

      // 一般の関数呼び出し
      if (head) {
        return {
          kind: "call",
          func: head,
          args: args.map(a => exprToIRExpr(a, nameEnv)),
        };
      }

      return { kind: "raw", text: leanExprToString(expr, nameEnv) };
    }
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

/** 簡易的な文字列化（フォールバック用） */
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
