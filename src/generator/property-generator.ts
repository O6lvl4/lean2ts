import type { LeanDecl, LeanTheorem, IRProp, IRExpr, IRParam } from "../ir/types.js";
import { renderArbitrary } from "./arbitrary-generator.js";
import { toCamelCase, joinBlocks, safeIdent } from "./codegen-utils.js";

/**
 * 定理 IR から fast-check プロパティテストを生成する。
 */
export function generateProperties(decls: LeanDecl[]): string {
  const theorems = decls.filter((d): d is LeanTheorem => d.kind === "theorem");
  if (theorems.length === 0) return "";

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
  const tests = theorems.map((t) => genTheoremTest(t, genericTypeNames)).join("\n\n");
  blocks.push(`describe("properties", () => {\n${tests}\n});`);

  return joinBlocks(blocks);
}

function genTheoremTest(thm: LeanTheorem, genericTypeNames: ReadonlySet<string>): string {
  const name = toCamelCase(thm.name);
  const params = thm.universals;

  if (params.length === 0) {
    // パラメータなし：単純なアサーション
    const body = renderPropCheck(thm.prop, "    ");
    return `  it("${name}", () => {\n${body}\n  });`;
  }

  // パラメータあり：fc.assert + fc.property
  const arbArgs = params.map((p) => renderArbitrary(p.type, undefined, genericTypeNames)).join(", ");
  const paramNames = params.map((p) => safeIdent(toCamelCase(p.name))).join(", ");
  const body = renderPropCheck(thm.prop, "      ");

  return `  it("${name}", () => {\n    fc.assert(\n      fc.property(${arbArgs}, (${paramNames}) => {\n${body}\n      })\n    );\n  });`;
}

function renderPropCheck(prop: IRProp, indentStr: string): string {
  switch (prop.kind) {
    case "eq":
      return `${indentStr}return ${renderExpr(prop.left)} === ${renderExpr(prop.right)};`;
    case "neq":
      return `${indentStr}return ${renderExpr(prop.left)} !== ${renderExpr(prop.right)};`;
    case "and": {
      const l = renderPropInline(prop.left);
      const r = renderPropInline(prop.right);
      return `${indentStr}return (${l}) && (${r});`;
    }
    case "not": {
      const inner = renderPropInline(prop.inner);
      return `${indentStr}return !(${inner});`;
    }
    case "implies": {
      const prem = renderPropInline(prop.premise);
      const conc = renderPropInline(prop.conclusion);
      return `${indentStr}return !(${prem}) || (${conc});`;
    }
    case "forall_in": {
      const varName = safeIdent(toCamelCase(prop.variable));
      const coll = renderExpr(prop.collection);
      const bodyInline = renderPropInline(prop.body);
      return `${indentStr}return ${coll}.every((${varName}) => ${bodyInline});`;
    }
    case "or": {
      const l = renderPropInline(prop.left);
      const r = renderPropInline(prop.right);
      return `${indentStr}return (${l}) || (${r});`;
    }
    case "iff": {
      const l = renderPropInline(prop.left);
      const r = renderPropInline(prop.right);
      return `${indentStr}return ((${l}) === (${r}));`;
    }
    case "lt":
      return `${indentStr}return ${renderExpr(prop.left)} < ${renderExpr(prop.right)};`;
    case "le":
      return `${indentStr}return ${renderExpr(prop.left)} <= ${renderExpr(prop.right)};`;
    case "raw":
      return `${indentStr}// TODO: ${prop.text}\n${indentStr}return true;`;
  }
}

function renderPropInline(prop: IRProp): string {
  switch (prop.kind) {
    case "eq":
      return `${renderExpr(prop.left)} === ${renderExpr(prop.right)}`;
    case "neq":
      return `${renderExpr(prop.left)} !== ${renderExpr(prop.right)}`;
    case "and":
      return `(${renderPropInline(prop.left)}) && (${renderPropInline(prop.right)})`;
    case "or":
      return `(${renderPropInline(prop.left)}) || (${renderPropInline(prop.right)})`;
    case "not":
      return `!(${renderPropInline(prop.inner)})`;
    case "implies":
      return `!(${renderPropInline(prop.premise)}) || (${renderPropInline(prop.conclusion)})`;
    case "iff":
      return `((${renderPropInline(prop.left)}) === (${renderPropInline(prop.right)}))`;
    case "lt":
      return `${renderExpr(prop.left)} < ${renderExpr(prop.right)}`;
    case "le":
      return `${renderExpr(prop.left)} <= ${renderExpr(prop.right)}`;
    case "forall_in": {
      const varName = safeIdent(toCamelCase(prop.variable));
      return `${renderExpr(prop.collection)}.every((${varName}) => ${renderPropInline(prop.body)})`;
    }
    case "raw":
      return "true /* TODO */";
  }
}

function renderExpr(expr: IRExpr): string {
  switch (expr.kind) {
    case "var":
      return safeIdent(toCamelCase(expr.name));
    case "call": {
      const args = expr.args.map(renderExpr).join(", ");
      return `${toCamelCase(expr.func)}(${args})`;
    }
    case "field":
      return `${renderExpr(expr.object)}.${toCamelCase(expr.field)}`;
    case "literal":
      return typeof expr.value === "string" ? `"${expr.value}"` : String(expr.value);
    case "let":
      return `((() => { const ${safeIdent(expr.name)} = ${renderExpr(expr.value)}; return ${renderExpr(expr.body)}; })())`;
    case "binop":
      return `(${renderExpr(expr.left)} ${expr.op} ${renderExpr(expr.right)})`;
    case "index":
      return `${renderExpr(expr.array)}[${renderExpr(expr.index)}]`;
    case "raw":
      return expr.text;
  }
}
