import fc from "fast-check";

import type { Color, Shape } from "./types.js";

export const arbColor: fc.Arbitrary<Color> = fc.oneof(
  fc.constant({ tag: "red" as const }),
  fc.constant({ tag: "green" as const }),
  fc.constant({ tag: "blue" as const })
);

export const arbShape: fc.Arbitrary<Shape> = fc.oneof(
  fc.record({ tag: fc.constant("circle" as const), radius: fc.nat() }),
  fc.record({ tag: fc.constant("rect" as const), width: fc.nat(), height: fc.nat() }),
  fc.constant({ tag: "point" as const })
);
