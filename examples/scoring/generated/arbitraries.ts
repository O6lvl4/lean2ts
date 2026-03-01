import fc from "fast-check";

import type { Grade, Score } from "./types.js";

export const arbGrade: fc.Arbitrary<Grade> = fc.oneof(
  fc.constant({ tag: "a" as const }),
  fc.constant({ tag: "b" as const }),
  fc.constant({ tag: "c" as const }),
  fc.constant({ tag: "d" as const }),
  fc.constant({ tag: "f" as const })
);

export const arbScore: fc.Arbitrary<Score> = fc.record({
  earned: fc.nat(),
  possible: fc.nat(),
});
