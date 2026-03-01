import type {
  LeanDecl,
  LeanStructure,
  LeanInductive,
  IRType,
} from "../ir/types.js";
import { lookupPrimitive } from "../lean-ts-map.js";
import { toCamelCase, joinBlocks, capitalize, genTypeParams } from "./codegen-utils.js";

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
  const isGeneric = decl.typeParams.length > 0;
  const baseIndent = isGeneric ? "    " : "  ";
  const typeParamNames = new Set(decl.typeParams.map(tp => tp.name));
  const fields = decl.fields
    .map((f) => {
      const arbExpr = renderArbitrary(f.type, typeParamNames);
      if (f.hasDefault) {
        return `${baseIndent}${toCamelCase(f.name)}: fc.option(${arbExpr}, { nil: undefined }),`;
      }
      return `${baseIndent}${toCamelCase(f.name)}: ${arbExpr},`;
    })
    .join("\n");

  if (isGeneric) {
    const tp = genTypeParams(decl.typeParams);
    const arbParams = decl.typeParams.map(p => `arb${capitalize(p.name)}: fc.Arbitrary<${p.name}>`).join(", ");
    return `export function ${name}${tp}(${arbParams}): fc.Arbitrary<${decl.name}${tp}> {\n  return fc.record({\n${fields}\n  });\n}`;
  }

  return `export const ${name}: fc.Arbitrary<${decl.name}> = fc.record({\n${fields}\n});`;
}

function genInductiveArbitrary(decl: LeanInductive): string {
  const name = `arb${decl.name}`;
  const isGeneric = decl.typeParams.length > 0;
  const baseIndent = isGeneric ? "    " : "  ";
  const typeParamNames = new Set(decl.typeParams.map(tp => tp.name));

  const buildOneofs = () => {
    if (decl.variants.every((v) => v.fields.length === 0)) {
      return decl.variants
        .map((v) => `${baseIndent}fc.constant({ tag: "${v.tag}" as const })`)
        .join(",\n");
    }
    return decl.variants
      .map((v) => {
        if (v.fields.length === 0) {
          return `${baseIndent}fc.constant({ tag: "${v.tag}" as const })`;
        }
        const fields = v.fields
          .map((f) => `${toCamelCase(f.name)}: ${renderArbitrary(f.type, typeParamNames)}`)
          .join(", ");
        return `${baseIndent}fc.record({ tag: fc.constant("${v.tag}" as const), ${fields} })`;
      })
      .join(",\n");
  };

  const oneofs = buildOneofs();

  if (isGeneric) {
    const tp = genTypeParams(decl.typeParams);
    const arbParams = decl.typeParams.map(p => `arb${capitalize(p.name)}: fc.Arbitrary<${p.name}>`).join(", ");
    return `export function ${name}${tp}(${arbParams}): fc.Arbitrary<${decl.name}${tp}> {\n  return fc.oneof(\n${oneofs}\n  );\n}`;
  }

  return `export const ${name}: fc.Arbitrary<${decl.name}> = fc.oneof(\n${oneofs}\n);`;
}

/** IRType → fast-check arbitrary 式 */
export function renderArbitrary(
  t: IRType,
  typeParamNames?: ReadonlySet<string>,
  genericTypeNames?: ReadonlySet<string>,
): string {
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
      return `fc.array(${renderArbitrary(t.element, typeParamNames, genericTypeNames)})`;
    case "option":
      return `fc.option(${renderArbitrary(t.inner, typeParamNames, genericTypeNames)}, { nil: undefined })`;
    case "tuple": {
      const inner = t.elements.map(e => renderArbitrary(e, typeParamNames, genericTypeNames)).join(", ");
      return `fc.tuple(${inner})`;
    }
    case "ref": {
      // 型パラメータなら引数名を返す
      if (typeParamNames?.has(t.name)) return `arb${capitalize(t.name)}`;
      // プリミティブかチェック
      const prim = lookupPrimitive(t.name);
      if (prim) return prim.fcArbitrary;
      // ジェネリック型（ファクトリ関数）は引数なしで呼べないのでフォールバック
      if (genericTypeNames?.has(t.name)) return `fc.anything() /* ${t.name} requires type args */`;
      return `arb${capitalize(t.name)}`;
    }
    case "function":
      return `fc.func(${renderArbitrary(t.returnType, typeParamNames, genericTypeNames)})`;
    case "generic":
      return `fc.anything() /* generic: ${t.name} */`;
    case "record": {
      const fields = t.fields
        .map(f => `${f.name}: ${renderArbitrary(f.type, typeParamNames, genericTypeNames)}`)
        .join(", ");
      return `fc.record({ ${fields} })`;
    }
    case "map":
      return `fc.array(fc.tuple(${renderArbitrary(t.key, typeParamNames, genericTypeNames)}, ${renderArbitrary(t.value, typeParamNames, genericTypeNames)})).map(entries => new Map(entries))`;
    case "literal":
      return `fc.constant(${typeof t.value === "string" ? `"${t.value}"` : t.value})`;
    case "unknown":
      return `fc.anything() /* unknown: ${t.leanName} */`;
  }
}
