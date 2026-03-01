// ─── Pantograph REPL JSON プロトコル型定義 ───
// Pantograph コマンドは { cmd: "xxx", payload: {...} } 形式

// リクエスト

export interface FrontendProcessPayload {
  fileName: string;
  readHeader?: boolean;
  inheritEnv?: boolean;
  newConstants?: boolean;
}

export interface EnvInspectPayload {
  name: string;
  value?: boolean;
}

export interface OptionsSetPayload {
  printExprAST?: boolean;
  printExprPretty?: boolean;
  printJsonPretty?: boolean;
  printDependentMVars?: boolean;
  printAuxDecls?: boolean;
  printImplementationDetailHyps?: boolean;
  automaticMode?: boolean;
  noRepeat?: boolean;
  timeout?: number;
}

export interface PantographCommand {
  cmd: string;
  payload?: Record<string, unknown>;
}

// レスポンス

export interface FrontendProcessUnit {
  boundary: [number, number];
  messages?: Array<{ severity: string; pos: number; data: string }>;
  newConstants?: string[];
}

export interface FrontendProcessResponse {
  units?: FrontendProcessUnit[];
}

export interface EnvInspectResponse {
  type?: InspectValue;
  value?: InspectValue;
  module?: string;
  isUnsafe?: boolean;
  inductInfo?: InductInfo;
  constructorInfo?: ConstructorInfo;
  recursorInfo?: RecursorInfo;
}

export interface InspectValue {
  pp?: string;
  sexp?: string;
}

export interface InductInfo {
  numParams: number;
  numIndices: number;
  all: string[];
  ctors: string[];
  isRec: boolean;
  isReflexive: boolean;
  isNested: boolean;
}

export interface ConstructorInfo {
  induct: string;
  cidx: number;
  numParams: number;
  numFields: number;
}

export interface RecursorInfo {
  all: string[];
  numParams: number;
  numIndices: number;
  numMotives: number;
  numMinors: number;
  rules: RecursorRule[];
}

export interface RecursorRule {
  ctor: string;
  nFields: number;
  rhs: { pp?: string };
}

export interface PantographError {
  error: string;
  desc: string;
}

export type PantographResponse =
  | FrontendProcessResponse
  | EnvInspectResponse
  | PantographError
  | Record<string, unknown>;

export function isPantographError(
  resp: PantographResponse
): resp is PantographError {
  return "error" in resp;
}
