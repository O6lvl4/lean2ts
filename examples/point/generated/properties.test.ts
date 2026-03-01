import { describe, it } from "vitest";

import fc from "fast-check";

import type { Point } from "./types.js";

import { arbPoint } from "./arbitraries.js";

import { double } from "./stubs.js";

describe("properties", () => {
  it("addZero", () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
      return (n + 0) === n;
      })
    );
  });
});
