import { describe, it, expect } from "vitest";

import fc from "fast-check";

import type { Weather, WindLevel, AlertLevel } from "./types.js";

import { arbWeather, arbWindLevel, arbAlertLevel } from "./arbitraries.js";

// Buggy implementation — demonstrates how Lean's proofs catch real bugs
import { weatherSeverity, windSeverity, dangerScore, alertFromScore, precipitationType, comfortIndex } from "./stubs-buggy.js";

describe("properties (buggy implementation — these SHOULD fail)", () => {
  it.fails("weatherSeverityBounded — stormy returns 5, not ≤ 4", () => {
    fc.assert(
      fc.property(arbWeather, (w) => {
        return weatherSeverity(w) <= 4;
      })
    );
  });

  it("windSeverityBounded", () => {
    fc.assert(
      fc.property(arbWindLevel, (wl) => {
        return windSeverity(wl) <= 3;
      })
    );
  });

  it.fails("dangerScoreBounded — cascading: stormy(5) + violent(3) = 8 > 7", () => {
    fc.assert(
      fc.property(arbWeather, arbWindLevel, (w, wl) => {
        return dangerScore(w, wl) <= 7;
      })
    );
  });

  it("sunnyCalmSafe", () => {
    const result = alertFromScore(dangerScore({ tag: "sunny" }, { tag: "calm" }));
    expect(result).toEqual({ tag: "none" });
  });

  it("stormyViolentEmergency", () => {
    const result = alertFromScore(dangerScore({ tag: "stormy" }, { tag: "violent" }));
    expect(result).toEqual({ tag: "emergency" });
  });

  it("stormyWorseThanSunny", () => {
    fc.assert(
      fc.property(arbWindLevel, (wl) => {
        return dangerScore({ tag: "sunny" }, wl) <= dangerScore({ tag: "stormy" }, wl);
      })
    );
  });

  it("sunnyUnaffectedByTemp", () => {
    fc.assert(
      fc.property(fc.nat(), (t) => {
        const result = precipitationType(t, { tag: "sunny" });
        return result.tag === "sunny";
      })
    );
  });

  it.fails("cloudyUnaffectedByTemp — cloudy becomes rainy", () => {
    fc.assert(
      fc.property(fc.nat(), (t) => {
        const result = precipitationType(t, { tag: "cloudy" });
        return result.tag === "cloudy";
      })
    );
  });
});
