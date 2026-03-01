import fc from "fast-check";

import type { Discount, LineItem } from "./types.js";

export const arbDiscount: fc.Arbitrary<Discount> = fc.oneof(
  fc.constant({ tag: "none" as const }),
  fc.record({ tag: fc.constant("percent" as const), rate: fc.nat() }),
  fc.record({ tag: fc.constant("fixed" as const), amount: fc.nat() })
);

export const arbLineItem: fc.Arbitrary<LineItem> = fc.record({
  unitPrice: fc.nat(),
  quantity: fc.nat(),
});
