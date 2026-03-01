import type { Discount, LineItem } from "./types.js";

export function lineTotal(item: LineItem): number {
  return item.unitPrice * item.quantity;
}

export function applyDiscount(amount: number, d: Discount): number {
  switch (d.tag) {
    case "none":    return amount;
    case "percent": return Math.max(0, amount - Math.floor(amount * d.rate / 100));
    case "fixed":   return Math.max(0, amount - d.amount);
  }
}

export function addTax(amount: number, rate: number): number {
  return amount + Math.floor(amount * rate / 100);
}
