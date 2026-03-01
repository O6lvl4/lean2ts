import type { LeanDecl, LeanDef, IRType } from "../ir/types.js";
import { toCamelCase, joinBlocks } from "./codegen-utils.js";
import { renderType } from "./type-generator.js";

/**
 * 関数定義(def)から TypeScript の関数スタブを生成する。
 */
export function generateStubs(decls: LeanDecl[]): string {
  const defs = decls.filter((d): d is LeanDef => d.kind === "def");
  if (defs.length === 0) return "";

  const blocks: string[] = [];

  // 型のインポート
  const typeDecls = decls.filter(
    (d) => d.kind === "structure" || d.kind === "inductive"
  );
  if (typeDecls.length > 0) {
    blocks.push(
      `import type { ${typeDecls.map((d) => d.name).join(", ")} } from "./types.js";`
    );
  }

  for (const def of defs) {
    blocks.push(genStub(def));
  }

  return joinBlocks(blocks);
}

function genStub(def: LeanDef): string {
  const name = toCamelCase(def.name);
  const params = def.params
    .map((p) => `${toCamelCase(p.name)}: ${renderType(p.type)}`)
    .join(", ");
  const retType = renderType(def.returnType);
  const defaultReturn = getDefaultReturn(def.returnType);

  return `export function ${name}(${params}): ${retType} {\n  // TODO: implement\n  ${defaultReturn}\n}`;
}

function getDefaultReturn(t: IRType): string {
  switch (t.kind) {
    case "primitive":
      switch (t.name) {
        case "number":
          return "return 0;";
        case "string":
          return 'return "";';
        case "boolean":
          return "return false;";
        case "void":
          return "return;";
      }
      break;
    case "array":
      return "return [];";
    case "option":
      return "return undefined;";
    case "tuple":
      return `return [${t.elements.map((e) => getDefaultValue(e)).join(", ")}] as const;`;
    default:
      return "throw new Error('Not implemented');";
  }
  return "throw new Error('Not implemented');";
}

function getDefaultValue(t: IRType): string {
  switch (t.kind) {
    case "primitive":
      switch (t.name) {
        case "number":
          return "0";
        case "string":
          return '""';
        case "boolean":
          return "false";
        case "void":
          return "undefined";
      }
      break;
    case "array":
      return "[]";
    case "option":
      return "undefined";
  }
  return "undefined as any";
}
