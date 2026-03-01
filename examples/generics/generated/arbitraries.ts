import fc from "fast-check";

import type { Wrapper } from "./types.js";

export const arbWrapper: fc.Arbitrary<Wrapper> = fc.record({
  value: arbΑ,
  label: fc.string(),
});
