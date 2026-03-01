export type RecordType =
  | { readonly tag: "revenue" }
  | { readonly tag: "salary" };

export function isRevenue(x: RecordType): x is Extract<RecordType, { tag: "revenue" }> {
  return x.tag === "revenue";
}

export function isSalary(x: RecordType): x is Extract<RecordType, { tag: "salary" }> {
  return x.tag === "salary";
}

export interface RevenueInput {
  readonly monthlyRevenue: number;
  readonly expenses?: ReadonlyArray<readonly [string, number]>;
}

export type Shape =
  | { readonly tag: "circle"; readonly radius: number }
  | { readonly tag: "rect"; readonly width: number; readonly height: number };

export function isCircle(x: Shape): x is Extract<Shape, { tag: "circle" }> {
  return x.tag === "circle";
}

export function isRect(x: Shape): x is Extract<Shape, { tag: "rect" }> {
  return x.tag === "rect";
}
