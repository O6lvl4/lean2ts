import fc from "fast-check";

import type { Stock } from "./types.js";

export const arbStock: fc.Arbitrary<Stock> = fc.record({
  available: fc.nat(),
  reserved: fc.nat(),
});
