// ─── 型 IR ───

export type IRType =
  | { kind: "primitive"; name: "number" | "string" | "boolean" | "void" }
  | { kind: "array"; element: IRType }
  | { kind: "option"; inner: IRType }
  | { kind: "tuple"; elements: IRType[] }
  | { kind: "ref"; name: string }
  | { kind: "function"; params: IRParam[]; returnType: IRType }
  | { kind: "generic"; name: string; args: IRType[] }
  | { kind: "record"; fields: IRField[] }
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "map"; key: IRType; value: IRType }
  | { kind: "unknown"; leanName: string };

export interface IRParam {
  name: string;
  type: IRType;
}

export interface IRTypeParam {
  name: string;
  constraint?: IRType;
}

// ─── 宣言 IR ───

export type LeanDecl = LeanStructure | LeanInductive | LeanTheorem | LeanDef;

export interface LeanStructure {
  kind: "structure";
  name: string;
  typeParams: IRTypeParam[];
  fields: IRField[];
}

export interface IRField {
  name: string;
  type: IRType;
  hasDefault: boolean;
}

export interface LeanInductive {
  kind: "inductive";
  name: string;
  typeParams: IRTypeParam[];
  variants: IRVariant[];
}

export interface IRVariant {
  name: string;
  tag: string;
  fields: IRField[];
}

export interface LeanTheorem {
  kind: "theorem";
  name: string;
  universals: IRParam[];
  prop: IRProp;
}

export interface LeanDef {
  kind: "def";
  name: string;
  typeParams: IRTypeParam[];
  params: IRParam[];
  returnType: IRType;
}

// ─── プロパティ IR（定理用） ───

export type IRProp =
  | { kind: "eq"; left: IRExpr; right: IRExpr }
  | { kind: "neq"; left: IRExpr; right: IRExpr }
  | { kind: "forall_in"; variable: string; collection: IRExpr; body: IRProp }
  | { kind: "and"; left: IRProp; right: IRProp }
  | { kind: "or"; left: IRProp; right: IRProp }
  | { kind: "not"; inner: IRProp }
  | { kind: "implies"; premise: IRProp; conclusion: IRProp }
  | { kind: "iff"; left: IRProp; right: IRProp }
  | { kind: "lt"; left: IRExpr; right: IRExpr }
  | { kind: "le"; left: IRExpr; right: IRExpr }
  | { kind: "raw"; text: string };

// ─── 式 IR ───

export type IRExpr =
  | { kind: "var"; name: string }
  | { kind: "call"; func: string; args: IRExpr[] }
  | { kind: "field"; object: IRExpr; field: string }
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "let"; name: string; value: IRExpr; body: IRExpr }
  | { kind: "binop"; op: string; left: IRExpr; right: IRExpr }
  | { kind: "index"; array: IRExpr; index: IRExpr }
  | { kind: "raw"; text: string };
