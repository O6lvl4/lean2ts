import type {
  LeanDecl,
  LeanStructure,
  LeanInductive,
  IRType,
} from "../ir/types.js";
import { toCamelCase, capitalize, joinBlocks, genTypeParams, safeIdent } from "./codegen-utils.js";

/**
 * IR 宣言群から TypeScript 型定義コードを生成する。
 */
export function generateTypes(decls: LeanDecl[]): string {
  const blocks: string[] = [];

  for (const decl of decls) {
    switch (decl.kind) {
      case "structure":
        blocks.push(genStructure(decl));
        break;
      case "inductive":
        blocks.push(genInductive(decl));
        break;
      // theorem, def は型定義には含めない
    }
  }

  return joinBlocks(blocks);
}

function genStructure(decl: LeanStructure): string {
  const fields = decl.fields
    .map((f) => {
      const name = toCamelCase(f.name);
      const opt = f.hasDefault ? "?" : "";
      return `  readonly ${name}${opt}: ${renderType(f.type)};`;
    })
    .join("\n");

  const tp = genTypeParams(decl.typeParams);
  return `export interface ${decl.name}${tp} {\n${fields}\n}`;
}

function genInductive(decl: LeanInductive): string {
  const lines: string[] = [];

  // 判別共用体型
  const variants = decl.variants
    .map((v) => {
      if (v.fields.length === 0) {
        return `  | { readonly tag: "${v.tag}" }`;
      }
      const fieldStr = v.fields
        .map((f) => `readonly ${toCamelCase(f.name)}: ${renderType(f.type)}`)
        .join("; ");
      return `  | { readonly tag: "${v.tag}"; ${fieldStr} }`;
    })
    .join("\n");

  const tp = genTypeParams(decl.typeParams);
  const typeName = `${decl.name}${tp}`;
  lines.push(`export type ${typeName} =\n${variants};`);

  // 型ガード関数
  for (const v of decl.variants) {
    const guardName = `is${capitalize(v.tag)}`;
    lines.push(
      `export function ${guardName}${tp}(x: ${typeName}): x is Extract<${typeName}, { tag: "${v.tag}" }> {\n  return x.tag === "${v.tag}";\n}`
    );
  }

  return lines.join("\n\n");
}

/** IRType → TypeScript 型文字列 */
export function renderType(t: IRType): string {
  switch (t.kind) {
    case "primitive":
      return t.name;
    case "array":
      return `ReadonlyArray<${renderType(t.element)}>`;
    case "option":
      return `${renderType(t.inner)} | undefined`;
    case "tuple": {
      const inner = t.elements.map(renderType).join(", ");
      return `readonly [${inner}]`;
    }
    case "ref":
      return t.name;
    case "function": {
      const params = t.params
        .map((p, i) => `${safeIdent(p.name === "_" ? `arg${i}` : p.name)}: ${renderType(p.type)}`)
        .join(", ");
      return `(${params}) => ${renderType(t.returnType)}`;
    }
    case "generic": {
      const args = t.args.map(renderType).join(", ");
      return `${t.name}<${args}>`;
    }
    case "record": {
      const fields = t.fields.map(f => `${f.name}: ${renderType(f.type)}`).join("; ");
      return `{ ${fields} }`;
    }
    case "map":
      return `ReadonlyMap<${renderType(t.key)}, ${renderType(t.value)}>`;
    case "literal":
      return typeof t.value === "string" ? `"${t.value}"` : String(t.value);
    case "unknown":
      return `unknown /* ${t.leanName} */`;
  }
}
