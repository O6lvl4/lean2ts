import type {
  LeanDecl,
  LeanStructure,
  LeanInductive,
  IRType,
} from "../ir/types.js";
import { lookupPrimitive } from "../lean-ts-map.js";
import { toCamelCase, joinBlocks, capitalize } from "./codegen-utils.js";

/**
 * IR 宣言群から fast-check Arbitrary 定義コードを生成する。
 */
export function generateArbitraries(decls: LeanDecl[]): string {
  const blocks: string[] = [];

  blocks.push('import fc from "fast-check";');

  // 型のインポート
  const typeNames = decls
    .filter((d) => d.kind === "structure" || d.kind === "inductive")
    .map((d) => d.name);
  if (typeNames.length > 0) {
    blocks.push(`import type { ${typeNames.join(", ")} } from "./types.js";`);
  }

  for (const decl of decls) {
    switch (decl.kind) {
      case "structure":
        blocks.push(genStructureArbitrary(decl));
        break;
      case "inductive":
        blocks.push(genInductiveArbitrary(decl));
        break;
    }
  }

  return joinBlocks(blocks);
}

function genStructureArbitrary(decl: LeanStructure): string {
  const name = `arb${decl.name}`;
  const fields = decl.fields
    .map((f) => {
      const arbExpr = renderArbitrary(f.type);
      if (f.hasDefault) {
        return `  ${toCamelCase(f.name)}: fc.option(${arbExpr}, { nil: undefined }),`;
      }
      return `  ${toCamelCase(f.name)}: ${arbExpr},`;
    })
    .join("\n");

  return `export const ${name}: fc.Arbitrary<${decl.name}> = fc.record({\n${fields}\n});`;
}

function genInductiveArbitrary(decl: LeanInductive): string {
  const name = `arb${decl.name}`;

  if (decl.variants.every((v) => v.fields.length === 0)) {
    // 全 variant が引数なし → fc.oneof で定数
    const oneofs = decl.variants
      .map((v) => `  fc.constant({ tag: "${v.tag}" as const })`)
      .join(",\n");
    return `export const ${name}: fc.Arbitrary<${decl.name}> = fc.oneof(\n${oneofs}\n);`;
  }

  // フィールド付き variant あり
  const oneofs = decl.variants
    .map((v) => {
      if (v.fields.length === 0) {
        return `  fc.constant({ tag: "${v.tag}" as const })`;
      }
      const fields = v.fields
        .map((f) => `${toCamelCase(f.name)}: ${renderArbitrary(f.type)}`)
        .join(", ");
      return `  fc.record({ tag: fc.constant("${v.tag}" as const), ${fields} })`;
    })
    .join(",\n");

  return `export const ${name}: fc.Arbitrary<${decl.name}> = fc.oneof(\n${oneofs}\n);`;
}

/** IRType → fast-check arbitrary 式 */
export function renderArbitrary(t: IRType): string {
  switch (t.kind) {
    case "primitive": {
      const mapping: Record<string, string> = {
        number: "fc.nat()",
        string: "fc.string()",
        boolean: "fc.boolean()",
        void: "fc.constant(undefined)",
      };
      return mapping[t.name] ?? "fc.anything()";
    }
    case "array":
      return `fc.array(${renderArbitrary(t.element)})`;
    case "option":
      return `fc.option(${renderArbitrary(t.inner)}, { nil: undefined })`;
    case "tuple": {
      const inner = t.elements.map(renderArbitrary).join(", ");
      return `fc.tuple(${inner})`;
    }
    case "ref": {
      // プリミティブかチェック
      const prim = lookupPrimitive(t.name);
      if (prim) return prim.fcArbitrary;
      return `arb${capitalize(t.name)}`;
    }
    case "function":
      return `fc.func(${renderArbitrary(t.returnType)})`;
    case "generic":
      return `fc.anything() /* generic: ${t.name} */`;
    case "record": {
      const fields = t.fields
        .map(f => `${f.name}: ${renderArbitrary(f.type)}`)
        .join(", ");
      return `fc.record({ ${fields} })`;
    }
    case "map":
      return `fc.array(fc.tuple(${renderArbitrary(t.key)}, ${renderArbitrary(t.value)})).map(entries => new Map(entries))`;
    case "literal":
      return `fc.constant(${typeof t.value === "string" ? `"${t.value}"` : t.value})`;
    case "unknown":
      return `fc.anything() /* unknown: ${t.leanName} */`;
  }
}
