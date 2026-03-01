import fc from "fast-check";

import type { Point } from "./types.js";

export const arbPoint: fc.Arbitrary<Point> = fc.record({
  x: fc.nat(),
  y: fc.nat(),
});
