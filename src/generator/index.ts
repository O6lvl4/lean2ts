import type { LeanDecl } from "../ir/types.js";
import { generateTypes } from "./type-generator.js";
import { generateArbitraries } from "./arbitrary-generator.js";
import { generateProperties } from "./property-generator.js";
import { generateStubs } from "./stub-generator.js";

export interface GeneratedFiles {
  "types.ts": string;
  "arbitraries.ts": string;
  "properties.test.ts": string;
  "stubs.ts": string;
}

export interface GenerateOptions {
  noTests?: boolean;
  noStubs?: boolean;
}

/**
 * IR 宣言群から全出力ファイルを生成する。
 */
export function generate(
  decls: LeanDecl[],
  options: GenerateOptions = {}
): GeneratedFiles {
  const types = generateTypes(decls);
  const arbitraries = generateArbitraries(decls);
  const properties = options.noTests ? "" : generateProperties(decls);
  const stubs = options.noStubs ? "" : generateStubs(decls);

  return {
    "types.ts": types,
    "arbitraries.ts": arbitraries,
    "properties.test.ts": properties,
    "stubs.ts": stubs,
  };
}
