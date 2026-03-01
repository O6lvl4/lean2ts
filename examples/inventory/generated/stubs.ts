import type { Stock } from "./types.js";

export function totalStock(s: Stock): number {
  return s.available + s.reserved;
}

export function reserve(s: Stock, qty: number): Stock {
  if (qty <= s.available) {
    return { available: s.available - qty, reserved: s.reserved + qty };
  }
  return s;
}

export function cancelReservation(s: Stock, qty: number): Stock {
  if (qty <= s.reserved) {
    return { available: s.available + qty, reserved: s.reserved - qty };
  }
  return s;
}

export function ship(s: Stock, qty: number): Stock {
  if (qty <= s.reserved) {
    return { available: s.available, reserved: s.reserved - qty };
  }
  return s;
}

export function restock(s: Stock, qty: number): Stock {
  return { available: s.available + qty, reserved: s.reserved };
}
