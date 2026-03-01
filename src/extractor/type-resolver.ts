import type { IRType, IRParam } from "../ir/types.js";
import { lookupPrimitive, resolveTypeConstructor, wrapList, wrapOption, wrapProd } from "../lean-ts-map.js";
import type { LeanExpr } from "../sexp/lean-expr.js";
import { referencesBVar, getAppHeadName, isPropSort } from "../sexp/lean-expr.js";

/**
 * Lean の pp (pretty-print) 文字列を IRType に変換する再帰下降パーサー。
 * パース不能な場合は { kind: "ref", name: "unknown" } にフォールバック。
 */
export function resolveType(pp: string): IRType {
  const parser = new TypeParser(pp.trim());
  const result = parser.parseType();
  return result;
}

class TypeParser {
  private pos = 0;
  private readonly input: string;

  constructor(input: string) {
    this.input = input;
  }

  parseType(): IRType {
    return this.parseArrow();
  }

  /** `A → B → C` を右結合の function 型として解析 */
  private parseArrow(): IRType {
    const left = this.parseApp();
    this.skipSpaces();

    if (this.matchStr("→") || this.matchStr("->")) {
      this.skipSpaces();
      const right = this.parseArrow();
      // 右辺も function なら params をフラット化
      if (right.kind === "function") {
        return {
          kind: "function",
          params: [{ name: "_", type: left }, ...right.params],
          returnType: right.returnType,
        };
      }
      return {
        kind: "function",
        params: [{ name: "_", type: left }],
        returnType: right,
      };
    }

    return left;
  }

  /** `List Nat`, `Option String`, `A × B` 等の型適用 */
  private parseApp(): IRType {
    this.skipSpaces();

    // Prod（×）
    const left = this.parseAtom();
    this.skipSpaces();

    if (this.matchStr("×") || this.matchStr("*")) {
      // 次がスペースでなければ × とみなさない (identifier の一部)
      const elements: IRType[] = [left];
      do {
        this.skipSpaces();
        elements.push(this.parseAtom());
        this.skipSpaces();
      } while (this.matchStr("×") || this.matchStr("*"));
      return wrapProd(elements);
    }

    return left;
  }

  /** アトム：括弧、プリミティブ、List/Option 適用、識別子 */
  private parseAtom(): IRType {
    this.skipSpaces();

    // 括弧
    if (this.peek() === "(") {
      this.advance();
      this.skipSpaces();

      // 空の括弧 → Unit
      if (this.peek() === ")") {
        this.advance();
        return { kind: "primitive", name: "void" };
      }

      const inner = this.parseType();
      this.skipSpaces();
      this.expect(")");
      return inner;
    }

    // 識別子を読む
    const ident = this.readIdent();
    if (!ident) {
      return { kind: "ref", name: "unknown" };
    }

    // プリミティブチェック
    const prim = lookupPrimitive(ident);
    if (prim) {
      return prim.tsType;
    }

    // List / Array
    if (ident === "List" || ident === "Array") {
      this.skipSpaces();
      const elem = this.parseAtom();
      return wrapList(elem);
    }

    // Option
    if (ident === "Option") {
      this.skipSpaces();
      const inner = this.parseAtom();
      return wrapOption(inner);
    }

    // Prod (型レベル)
    if (ident === "Prod") {
      this.skipSpaces();
      const a = this.parseAtom();
      this.skipSpaces();
      const b = this.parseAtom();
      return wrapProd([a, b]);
    }

    // Prop / Sort → void
    if (ident === "Prop" || ident === "Sort" || ident === "Type") {
      return { kind: "primitive", name: "void" };
    }

    return { kind: "ref", name: ident };
  }

  private readIdent(): string {
    const start = this.pos;
    while (this.pos < this.input.length && this.isIdentChar(this.input[this.pos])) {
      this.pos++;
    }
    return this.input.slice(start, this.pos);
  }

  private isIdentChar(ch: string): boolean {
    return /[a-zA-Z0-9_.'α-ωΑ-Ω]/.test(ch);
  }

  private skipSpaces(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private peek(): string | undefined {
    return this.input[this.pos];
  }

  private advance(): void {
    this.pos++;
  }

  private matchStr(s: string): boolean {
    if (this.input.startsWith(s, this.pos)) {
      this.pos += s.length;
      return true;
    }
    return false;
  }

  private expect(ch: string): void {
    if (this.input[this.pos] === ch) {
      this.pos++;
    }
    // パースエラーは静かにスキップ
  }
}

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
    // 型コンストラクタとして解決を試みる
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
    if (resolvedArgs.length > 0) {
      // implicit 引数（Sort 等）をフィルタ
      const meaningful = resolvedArgs.filter(
        a => a.kind !== "primitive" || a.name !== "void"
      );
      if (meaningful.length > 0) {
        return { kind: "generic", name: stripLastComponent(headName), args: meaningful };
      }
    }

    return { kind: "ref", name: stripLastComponent(headName) };
  }

  // ヘッドが定数でない場合
  const fnType = resolveTypeFromExpr(fn, nameEnv);
  return fnType;
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
