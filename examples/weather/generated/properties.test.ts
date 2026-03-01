import { describe, it, expect } from "vitest";

import fc from "fast-check";

import type { Weather, WindLevel, AlertLevel } from "./types.js";

import { arbWeather, arbWindLevel, arbAlertLevel } from "./arbitraries.js";

import { weatherSeverity, windSeverity, dangerScore, alertFromScore, precipitationType, comfortIndex } from "./stubs.js";

describe("properties", () => {
  it("weatherSeverityBounded", () => {
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

  it("dangerScoreBounded", () => {
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

  it("cloudyUnaffectedByTemp", () => {
    fc.assert(
      fc.property(fc.nat(), (t) => {
        const result = precipitationType(t, { tag: "cloudy" });
        return result.tag === "cloudy";
      })
    );
  });
});
