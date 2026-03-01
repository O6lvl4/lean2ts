import { describe, it } from "vitest";

import fc from "fast-check";

import type { Score } from "./types.js";

import { arbScore } from "./arbitraries.js";

import { combine, addBonus } from "./stubs.js";

describe("properties", () => {
  it("combineEarnedComm", () => {
    fc.assert(
      fc.property(arbScore, arbScore, (a, b) => {
      return combine(a, b).earned === combine(b, a).earned;
      })
    );
  });

  it("combinePossibleComm", () => {
    fc.assert(
      fc.property(arbScore, arbScore, (a, b) => {
      return combine(a, b).possible === combine(b, a).possible;
      })
    );
  });

  it("combinePossibleGe", () => {
    fc.assert(
      fc.property(arbScore, arbScore, (a, b) => {
      return a.possible <= combine(a, b).possible;
      })
    );
  });

  it("bonusIncreases", () => {
    fc.assert(
      fc.property(arbScore, fc.nat(), (s, bonus) => {
      return s.earned <= addBonus(s, bonus).earned;
      })
    );
  });

  it("bonusPreservesPossible", () => {
    fc.assert(
      fc.property(arbScore, fc.nat(), (s, bonus) => {
      return addBonus(s, bonus).possible === s.possible;
      })
    );
  });
});
