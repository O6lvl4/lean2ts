export type Grade =
  | { readonly tag: "a" }
  | { readonly tag: "b" }
  | { readonly tag: "c" }
  | { readonly tag: "d" }
  | { readonly tag: "f" };

export function isA(x: Grade): x is Extract<Grade, { tag: "a" }> {
  return x.tag === "a";
}

export function isB(x: Grade): x is Extract<Grade, { tag: "b" }> {
  return x.tag === "b";
}

export function isC(x: Grade): x is Extract<Grade, { tag: "c" }> {
  return x.tag === "c";
}

export function isD(x: Grade): x is Extract<Grade, { tag: "d" }> {
  return x.tag === "d";
}

export function isF(x: Grade): x is Extract<Grade, { tag: "f" }> {
  return x.tag === "f";
}

export interface Score {
  readonly earned: number;
  readonly possible: number;
}
