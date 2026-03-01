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

type TypeCtorResolver = (args: IRType[]) => IRType | undefined;

const TYPE_CTOR_RESOLVERS: Record<string, TypeCtorResolver> = {
  List: (args) => args[0] ? { kind: "array", element: args[0] } : undefined,
  Array: (args) => args[0] ? { kind: "array", element: args[0] } : undefined,
  Option: (args) => args[0] ? { kind: "option", inner: args[0] } : undefined,
  Prod: (args) => args.length >= 2 ? { kind: "tuple", elements: args.slice(0, 2) } : undefined,
  Sigma: resolveSigma,
  PSigma: resolveSigma,
  Subtype: (args) => args[0] ?? undefined,
  Fin: () => ({ kind: "primitive", name: "number" }),
  HashMap: resolveHashMap,
  "Std.HashMap": resolveHashMap,
  Sum: (args) => args.length >= 2 ? { kind: "generic", name: "Sum", args: args.slice(0, 2) } : undefined,
};

function resolveSigma(args: IRType[]): IRType | undefined {
  return args.length >= 1
    ? { kind: "tuple", elements: [args[0], args[1] ?? { kind: "unknown", leanName: "Sigma.snd" }] }
    : undefined;
}

function resolveHashMap(args: IRType[]): IRType | undefined {
  return args.length >= 2 ? { kind: "map", key: args[0], value: args[1] } : undefined;
}

/**
 * 型コンストラクタ + 引数 → IRType
 *
 * List, Option, Prod, Array, Sigma, HashMap 等の型コンストラクタを解決する。
 */
export function resolveTypeConstructor(name: string, args: IRType[]): IRType | undefined {
  const resolver = TYPE_CTOR_RESOLVERS[name];
  return resolver ? resolver(args) : undefined;
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
