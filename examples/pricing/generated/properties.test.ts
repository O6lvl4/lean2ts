import { describe, it } from "vitest";

import fc from "fast-check";

import type { Discount, LineItem } from "./types.js";

import { arbDiscount, arbLineItem } from "./arbitraries.js";

import { lineTotal, applyDiscount, addTax } from "./stubs.js";

describe("properties", () => {
  it("discountBounded", () => {
    fc.assert(
      fc.property(fc.nat(), arbDiscount, (amount, d) => {
      return applyDiscount(amount, d) <= amount;
      })
    );
  });

  it("discountNonneg", () => {
    fc.assert(
      fc.property(fc.nat(), arbDiscount, (amount, d) => {
      return 0 <= applyDiscount(amount, d);
      })
    );
  });

  it("taxIncreases", () => {
    fc.assert(
      fc.property(fc.nat(), fc.nat(), (amount, rate) => {
      return amount <= addTax(amount, rate);
      })
    );
  });
});
