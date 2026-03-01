import type { IRType } from "./ir/types.js";

export interface LeanTsMapping {
  tsType: IRType;
  fcArbitrary: string;
}

const primitiveMap: Record<string, LeanTsMapping> = {
  Nat: {
    tsType: { kind: "primitive", name: "number" },
    fcArbitrary: "fc.nat()",
  },
  Int: {
    tsType: { kind: "primitive", name: "number" },
    fcArbitrary: "fc.integer()",
  },
  Float: {
    tsType: { kind: "primitive", name: "number" },
    fcArbitrary: "fc.double()",
  },
  String: {
    tsType: { kind: "primitive", name: "string" },
    fcArbitrary: "fc.string()",
  },
  Char: {
    tsType: { kind: "primitive", name: "string" },
    fcArbitrary: "fc.char()",
  },
  Bool: {
    tsType: { kind: "primitive", name: "boolean" },
    fcArbitrary: "fc.boolean()",
  },
  Unit: {
    tsType: { kind: "primitive", name: "void" },
    fcArbitrary: "fc.constant(undefined)",
  },
  UInt8: {
    tsType: { kind: "primitive", name: "number" },
    fcArbitrary: "fc.nat({ max: 255 })",
  },
  UInt16: {
    tsType: { kind: "primitive", name: "number" },
    fcArbitrary: "fc.nat({ max: 65535 })",
  },
  UInt32: {
    tsType: { kind: "primitive", name: "number" },
    fcArbitrary: "fc.nat({ max: 4294967295 })",
  },
  UInt64: {
    tsType: { kind: "primitive", name: "number" },
    fcArbitrary: "fc.nat()",
  },
};

/** Lean の基本型名から TS 型 + fast-check arbitrary を引く */
export function lookupPrimitive(leanName: string): LeanTsMapping | undefined {
  return primitiveMap[leanName];
}

/**
 * 型コンストラクタ + 引数 → IRType
 *
 * List, Option, Prod, Array, Sigma, HashMap 等の型コンストラクタを解決する。
 */
export function resolveTypeConstructor(name: string, args: IRType[]): IRType | undefined {
  switch (name) {
    case "List":
    case "Array":
      return args[0] ? { kind: "array", element: args[0] } : undefined;

    case "Option":
      return args[0] ? { kind: "option", inner: args[0] } : undefined;

    case "Prod":
      return args.length >= 2
        ? { kind: "tuple", elements: args.slice(0, 2) }
        : undefined;

    case "Sigma":
    case "PSigma":
      // 依存ペアは通常のタプルに降格（述語情報は消失）
      return args.length >= 1
        ? { kind: "tuple", elements: [args[0], args[1] ?? { kind: "unknown", leanName: "Sigma.snd" }] }
        : undefined;

    case "Subtype":
      // Subtype P → P の基底型に降格
      return args[0] ?? undefined;

    case "Fin":
      return { kind: "primitive", name: "number" };

    case "HashMap":
    case "Std.HashMap":
      return args.length >= 2
        ? { kind: "map", key: args[0], value: args[1] }
        : undefined;

    case "Sum":
      // Sum A B は A | B として扱えるが、単純に unknown にフォールバック
      return args.length >= 2
        ? { kind: "generic", name: "Sum", args: args.slice(0, 2) }
        : undefined;

    default:
      return undefined;
  }
}

/** Lean の `List T` → `ReadonlyArray<T>` */
export function wrapList(inner: IRType): IRType {
  return { kind: "array", element: inner };
}

/** Lean の `Option T` → `T | undefined` */
export function wrapOption(inner: IRType): IRType {
  return { kind: "option", inner };
}

/** Lean の `T × U` → `readonly [T, U]` */
export function wrapProd(elements: IRType[]): IRType {
  return { kind: "tuple", elements };
}
