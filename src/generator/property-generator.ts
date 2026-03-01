import type { LeanDecl, LeanTheorem, LeanInductive, IRProp, IRExpr, IRParam, IRVariant } from "../ir/types.js";
import { renderArbitrary } from "./arbitrary-generator.js";
import { toCamelCase, joinBlocks, safeIdent } from "./codegen-utils.js";

/** コンストラクタ情報: "Weather.sunny" → { tag: "sunny", fields: [] } */
interface CtorInfo {
  typeName: string;
  tag: string;
  fields: string[];
}

/**
 * 定理 IR から fast-check プロパティテストを生成する。
 */
export function generateProperties(decls: LeanDecl[]): string {
  const theorems = decls.filter((d): d is LeanTheorem => d.kind === "theorem");
  if (theorems.length === 0) return "";

  // inductive 型からコンストラクタマップを構築
  const ctorMap = buildCtorMap(decls);

  const blocks: string[] = [];

  blocks.push('import { describe, it } from "vitest";');
  blocks.push('import fc from "fast-check";');

  // 型と arbitrary のインポート
  const typeDecls = decls.filter(
    (d) => d.kind === "structure" || d.kind === "inductive"
  );
  if (typeDecls.length > 0) {
    blocks.push(
      `import type { ${typeDecls.map((d) => d.name).join(", ")} } from "./types.js";`
    );
    // typeParams 付きの型はファクトリ関数なので定数インポートから除外
    const nonGenericTypeDecls = typeDecls.filter(
      (d) => (d.kind === "structure" || d.kind === "inductive") && d.typeParams.length === 0
    );
    if (nonGenericTypeDecls.length > 0) {
      blocks.push(
        `import { ${nonGenericTypeDecls.map((d) => `arb${d.name}`).join(", ")} } from "./arbitraries.js";`
      );
    }
  }

  // スタブのインポート
  const defs = decls.filter((d) => d.kind === "def");
  if (defs.length > 0) {
    blocks.push(
      `import { ${defs.map((d) => toCamelCase(d.name)).join(", ")} } from "./stubs.js";`
    );
  }

  // ジェネリック型名セット（arbitrary ファクトリ関数で定数インポート不可）
  const genericTypeNames = new Set(
    typeDecls
      .filter((d) => (d.kind === "structure" || d.kind === "inductive") && d.typeParams.length > 0)
      .map((d) => d.name)
  );

  // テストブロック
  const tests = theorems.map((t) => genTheoremTest(t, genericTypeNames, ctorMap)).join("\n\n");
  blocks.push(`describe("properties", () => {\n${tests}\n});`);

  return joinBlocks(blocks);
}

/** inductive 宣言からコンストラクタ名→情報のマップを構築 */
function buildCtorMap(decls: LeanDecl[]): Map<string, CtorInfo> {
  const map = new Map<string, CtorInfo>();
  for (const d of decls) {
    if (d.kind !== "inductive") continue;
    for (const v of d.variants) {
      // "Weather.sunny" → { typeName: "Weather", tag: "sunny", fields: [...] }
      const fullName = `${d.name}.${v.name}`;
      map.set(fullName, {
        typeName: d.name,
        tag: v.tag,
        fields: v.fields.map((f) => f.name),
      });
    }
  }
  return map;
}

function genTheoremTest(
  thm: LeanTheorem,
  genericTypeNames: ReadonlySet<string>,
  ctorMap: Map<string, CtorInfo>,
): string {
  const name = toCamelCase(thm.name);
  const params = thm.universals;

  if (params.length === 0) {
    // パラメータなし：単純なアサーション
    const body = renderPropCheck(thm.prop, "    ", ctorMap);
    return `  it("${name}", () => {\n${body}\n  });`;
  }

  // パラメータあり：fc.assert + fc.property
  const arbArgs = params.map((p) => renderArbitrary(p.type, undefined, genericTypeNames)).join(", ");
  const paramNames = params.map((p) => safeIdent(toCamelCase(p.name))).join(", ");
  const body = renderPropCheck(thm.prop, "      ", ctorMap);

  return `  it("${name}", () => {\n    fc.assert(\n      fc.property(${arbArgs}, (${paramNames}) => {\n${body}\n      })\n    );\n  });`;
}

/** 式がコンストラクタ参照を含むか再帰的にチェック */
function exprInvolvesConstructor(expr: IRExpr, ctorMap: Map<string, CtorInfo>): boolean {
  switch (expr.kind) {
    case "var":
      return ctorMap.has(expr.name);
    case "call":
      return ctorMap.has(expr.func) || expr.args.some((a) => exprInvolvesConstructor(a, ctorMap));
    case "field":
      // "Weather" + "sunny" → "Weather.sunny"
      if (expr.object.kind === "var") {
        return ctorMap.has(`${expr.object.name}.${expr.field}`);
      }
      return exprInvolvesConstructor(expr.object, ctorMap);
    default:
      return false;
  }
}

function renderPropCheck(prop: IRProp, indentStr: string, ctorMap: Map<string, CtorInfo>): string {
  switch (prop.kind) {
    case "eq": {
      const leftHasCtor = exprInvolvesConstructor(prop.left, ctorMap);
      const rightHasCtor = exprInvolvesConstructor(prop.right, ctorMap);
      if (leftHasCtor || rightHasCtor) {
        // コンストラクタを含む eq はオブジェクト比較が必要
        // 右辺が零フィールドコンストラクタなら .tag 比較
        const rightCtor = resolveCtorRef(prop.right, ctorMap);
        if (rightCtor && rightCtor.fields.length === 0) {
          return `${indentStr}return ${renderExpr(prop.left, ctorMap)}.tag === "${rightCtor.tag}";`;
        }
        const leftCtor = resolveCtorRef(prop.left, ctorMap);
        if (leftCtor && leftCtor.fields.length === 0) {
          return `${indentStr}return ${renderExpr(prop.right, ctorMap)}.tag === "${leftCtor.tag}";`;
        }
        // フィールド付きコンストラクタ: JSON 比較
        return `${indentStr}return JSON.stringify(${renderExpr(prop.left, ctorMap)}) === JSON.stringify(${renderExpr(prop.right, ctorMap)});`;
      }
      return `${indentStr}return ${renderExpr(prop.left, ctorMap)} === ${renderExpr(prop.right, ctorMap)};`;
    }
    case "neq": {
      const leftHasCtor = exprInvolvesConstructor(prop.left, ctorMap);
      const rightHasCtor = exprInvolvesConstructor(prop.right, ctorMap);
      if (leftHasCtor || rightHasCtor) {
        const rightCtor = resolveCtorRef(prop.right, ctorMap);
        if (rightCtor && rightCtor.fields.length === 0) {
          return `${indentStr}return ${renderExpr(prop.left, ctorMap)}.tag !== "${rightCtor.tag}";`;
        }
        const leftCtor = resolveCtorRef(prop.left, ctorMap);
        if (leftCtor && leftCtor.fields.length === 0) {
          return `${indentStr}return ${renderExpr(prop.right, ctorMap)}.tag !== "${leftCtor.tag}";`;
        }
        return `${indentStr}return JSON.stringify(${renderExpr(prop.left, ctorMap)}) !== JSON.stringify(${renderExpr(prop.right, ctorMap)});`;
      }
      return `${indentStr}return ${renderExpr(prop.left, ctorMap)} !== ${renderExpr(prop.right, ctorMap)};`;
    }
    case "and": {
      const l = renderPropInline(prop.left, ctorMap);
      const r = renderPropInline(prop.right, ctorMap);
      return `${indentStr}return (${l}) && (${r});`;
    }
    case "not": {
      const inner = renderPropInline(prop.inner, ctorMap);
      return `${indentStr}return !(${inner});`;
    }
    case "implies": {
      const prem = renderPropInline(prop.premise, ctorMap);
      const conc = renderPropInline(prop.conclusion, ctorMap);
      return `${indentStr}return !(${prem}) || (${conc});`;
    }
    case "forall_in": {
      const varName = safeIdent(toCamelCase(prop.variable));
      const coll = renderExpr(prop.collection, ctorMap);
      const bodyInline = renderPropInline(prop.body, ctorMap);
      return `${indentStr}return ${coll}.every((${varName}) => ${bodyInline});`;
    }
    case "or": {
      const l = renderPropInline(prop.left, ctorMap);
      const r = renderPropInline(prop.right, ctorMap);
      return `${indentStr}return (${l}) || (${r});`;
    }
    case "iff": {
      const l = renderPropInline(prop.left, ctorMap);
      const r = renderPropInline(prop.right, ctorMap);
      return `${indentStr}return ((${l}) === (${r}));`;
    }
    case "lt":
      return `${indentStr}return ${renderExpr(prop.left, ctorMap)} < ${renderExpr(prop.right, ctorMap)};`;
    case "le":
      return `${indentStr}return ${renderExpr(prop.left, ctorMap)} <= ${renderExpr(prop.right, ctorMap)};`;
    case "raw":
      return `${indentStr}// TODO: ${prop.text}\n${indentStr}return true;`;
  }
}

function renderPropInline(prop: IRProp, ctorMap: Map<string, CtorInfo>): string {
  switch (prop.kind) {
    case "eq": {
      const leftHasCtor = exprInvolvesConstructor(prop.left, ctorMap);
      const rightHasCtor = exprInvolvesConstructor(prop.right, ctorMap);
      if (leftHasCtor || rightHasCtor) {
        const rightCtor = resolveCtorRef(prop.right, ctorMap);
        if (rightCtor && rightCtor.fields.length === 0) {
          return `${renderExpr(prop.left, ctorMap)}.tag === "${rightCtor.tag}"`;
        }
        const leftCtor = resolveCtorRef(prop.left, ctorMap);
        if (leftCtor && leftCtor.fields.length === 0) {
          return `${renderExpr(prop.right, ctorMap)}.tag === "${leftCtor.tag}"`;
        }
        return `JSON.stringify(${renderExpr(prop.left, ctorMap)}) === JSON.stringify(${renderExpr(prop.right, ctorMap)})`;
      }
      return `${renderExpr(prop.left, ctorMap)} === ${renderExpr(prop.right, ctorMap)}`;
    }
    case "neq": {
      const leftHasCtor = exprInvolvesConstructor(prop.left, ctorMap);
      const rightHasCtor = exprInvolvesConstructor(prop.right, ctorMap);
      if (leftHasCtor || rightHasCtor) {
        const rightCtor = resolveCtorRef(prop.right, ctorMap);
        if (rightCtor && rightCtor.fields.length === 0) {
          return `${renderExpr(prop.left, ctorMap)}.tag !== "${rightCtor.tag}"`;
        }
        return `JSON.stringify(${renderExpr(prop.left, ctorMap)}) !== JSON.stringify(${renderExpr(prop.right, ctorMap)})`;
      }
      return `${renderExpr(prop.left, ctorMap)} !== ${renderExpr(prop.right, ctorMap)}`;
    }
    case "and":
      return `(${renderPropInline(prop.left, ctorMap)}) && (${renderPropInline(prop.right, ctorMap)})`;
    case "or":
      return `(${renderPropInline(prop.left, ctorMap)}) || (${renderPropInline(prop.right, ctorMap)})`;
    case "not":
      return `!(${renderPropInline(prop.inner, ctorMap)})`;
    case "implies":
      return `!(${renderPropInline(prop.premise, ctorMap)}) || (${renderPropInline(prop.conclusion, ctorMap)})`;
    case "iff":
      return `((${renderPropInline(prop.left, ctorMap)}) === (${renderPropInline(prop.right, ctorMap)}))`;
    case "lt":
      return `${renderExpr(prop.left, ctorMap)} < ${renderExpr(prop.right, ctorMap)}`;
    case "le":
      return `${renderExpr(prop.left, ctorMap)} <= ${renderExpr(prop.right, ctorMap)}`;
    case "forall_in": {
      const varName = safeIdent(toCamelCase(prop.variable));
      return `${renderExpr(prop.collection, ctorMap)}.every((${varName}) => ${renderPropInline(prop.body, ctorMap)})`;
    }
    case "raw":
      return "true /* TODO */";
  }
}

/** IRExpr が直接コンストラクタ参照ならその情報を返す */
function resolveCtorRef(expr: IRExpr, ctorMap: Map<string, CtorInfo>): CtorInfo | undefined {
  if (expr.kind === "var") {
    return ctorMap.get(expr.name);
  }
  if (expr.kind === "field" && expr.object.kind === "var") {
    return ctorMap.get(`${expr.object.name}.${expr.field}`);
  }
  return undefined;
}

function renderExpr(expr: IRExpr, ctorMap: Map<string, CtorInfo>): string {
  switch (expr.kind) {
    case "var": {
      // コンストラクタ参照 → オブジェクトリテラル
      const ctor = ctorMap.get(expr.name);
      if (ctor && ctor.fields.length === 0) {
        return `{ tag: "${ctor.tag}" }`;
      }
      return safeIdent(toCamelCase(expr.name));
    }
    case "call": {
      // コンストラクタ呼び出し（フィールド付き）
      const ctor = ctorMap.get(expr.func);
      if (ctor && ctor.fields.length > 0 && expr.args.length === ctor.fields.length) {
        const fieldAssigns = ctor.fields
          .map((f, i) => `${toCamelCase(f)}: ${renderExpr(expr.args[i], ctorMap)}`)
          .join(", ");
        return `{ tag: "${ctor.tag}", ${fieldAssigns} }`;
      }
      const args = expr.args.map((a) => renderExpr(a, ctorMap)).join(", ");
      return `${toCamelCase(expr.func)}(${args})`;
    }
    case "field": {
      // "Weather" + "sunny" → コンストラクタ参照かチェック
      if (expr.object.kind === "var") {
        const ctor = ctorMap.get(`${expr.object.name}.${expr.field}`);
        if (ctor && ctor.fields.length === 0) {
          return `{ tag: "${ctor.tag}" }`;
        }
      }
      return `${renderExpr(expr.object, ctorMap)}.${toCamelCase(expr.field)}`;
    }
    case "literal":
      return typeof expr.value === "string" ? `"${expr.value}"` : String(expr.value);
    case "let":
      return `((() => { const ${safeIdent(expr.name)} = ${renderExpr(expr.value, ctorMap)}; return ${renderExpr(expr.body, ctorMap)}; })())`;
    case "binop":
      return `(${renderExpr(expr.left, ctorMap)} ${expr.op} ${renderExpr(expr.right, ctorMap)})`;
    case "index":
      return `${renderExpr(expr.array, ctorMap)}[${renderExpr(expr.index, ctorMap)}]`;
    case "raw":
      return expr.text;
  }
}
