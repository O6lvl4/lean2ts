import { describe, it } from "vitest";
import fc from "fast-check";
import type { RecordType, RevenueInput, Shape } from "./types.js";
import { arbRecordType, arbRevenueInput, arbShape } from "./arbitraries.js";
import { totalExpenses } from "./stubs.js";

describe("properties", () => {
  it("totalExpensesEmpty", () => {
    fc.assert(
      fc.property(arbRevenueInput, (input) => {
        // TODO: input.expenses = [] → totalExpenses input = 0
        return true;
      })
    );
  });
});
