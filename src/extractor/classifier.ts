import type { EnvInspectResponse } from "../pantograph/protocol.js";
import type { LeanExpr } from "../sexp/lean-expr.js";
import { isPropSort, getAppHeadName } from "../sexp/lean-expr.js";

export type DeclKind = "structure" | "inductive" | "theorem" | "def" | "skip";

/**
 * env.inspect の結果から宣言種別を判定する。
 *
 * - inductInfo + 単一ctor → structure
 * - inductInfo + 複数ctor → inductive
 * - constructorInfo / recursorInfo → skip
 * - 型が Prop → theorem
 * - その他 → def
 */
export function classify(
  name: string,
  info: EnvInspectResponse,
  typeExpr?: LeanExpr
): DeclKind {
  // コンストラクタやリカーサーは個別には処理しない
  if (info.constructorInfo || info.recursorInfo) {
    return "skip";
  }

  // 帰納型判定
  if (info.inductInfo) {
    const ctors = info.inductInfo.ctors;
    if (ctors.length === 1) {
      return "structure";
    }
    return "inductive";
  }

  // sexp ベース: 型の末端が Sort 0 (Prop) かチェック
  if (typeExpr) {
    if (isPropTypeExpr(typeExpr)) {
      return "theorem";
    }
    return "def";
  }

  // pp フォールバック
  const typePp = info.type?.pp ?? "";
  if (isPropType(typePp)) {
    return "theorem";
  }

  return "def";
}

/** 既知の Prop-valued 定数ヘッド */
const PROP_HEADS = new Set([
  "Eq", "Ne", "And", "Or", "Not", "Iff",
  "LT.lt", "LE.le", "GT.gt", "GE.ge",
  "Membership.mem", "True", "False",
]);

/**
 * LeanExpr の末端（forallE チェインを辿った先）が Prop かどうか。
 * Sort 0 だけでなく、Eq/And/Or 等の Prop-valued な app も認識する。
 */
function isPropTypeExpr(expr: LeanExpr): boolean {
  if (isPropSort(expr)) return true;

  // forallE の body を再帰的にたどる
  if (expr.tag === "forallE") {
    return isPropTypeExpr(expr.body);
  }

  // letE の body を再帰的にたどる
  if (expr.tag === "letE") {
    return isPropTypeExpr(expr.body);
  }

  // Prop-valued な既知定数の適用（Eq, And, Or, etc.）
  if (expr.tag === "app") {
    const head = getAppHeadName(expr);
    if (head && PROP_HEADS.has(head)) return true;
  }

  return false;
}

// ─── pp フォールバック ───

function isPropType(pp: string): boolean {
  if (/\bProp\b/.test(pp)) {
    return true;
  }

  if (/[=≠]/.test(pp) && !pp.includes(":=")) {
    return true;
  }

  if (/∀/.test(pp) && !/→.*[→]/.test(pp)) {
    if (/[=≠∧∨¬∈]/.test(pp)) {
      return true;
    }
  }

  return false;
}
