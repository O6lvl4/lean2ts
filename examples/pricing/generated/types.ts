export type Discount =
  | { readonly tag: "none" }
  | { readonly tag: "percent"; readonly rate: number }
  | { readonly tag: "fixed"; readonly amount: number };

export function isNone(x: Discount): x is Extract<Discount, { tag: "none" }> {
  return x.tag === "none";
}

export function isPercent(x: Discount): x is Extract<Discount, { tag: "percent" }> {
  return x.tag === "percent";
}

export function isFixed(x: Discount): x is Extract<Discount, { tag: "fixed" }> {
  return x.tag === "fixed";
}

export interface LineItem {
  readonly unitPrice: number;
  readonly quantity: number;
}
