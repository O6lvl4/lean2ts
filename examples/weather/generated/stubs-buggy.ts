import type { Weather, WindLevel, AlertLevel } from "./types.js";

// --- 素朴な実装（バグあり） ---

export function weatherSeverity(w: Weather): number {
  switch (w.tag) {
    case "sunny":  return 0;
    case "cloudy": return 1;
    case "rainy":  return 2;
    case "snowy":  return 3;
    case "stormy": return 5;  // BUG: should be 4, not 5
  }
}

export function windSeverity(wl: WindLevel): number {
  switch (wl.tag) {
    case "calm":     return 0;
    case "moderate": return 1;
    case "strong":   return 2;
    case "violent":  return 3;
  }
}

export function dangerScore(w: Weather, wl: WindLevel): number {
  return weatherSeverity(w) + windSeverity(wl);
}

export function alertFromScore(score: number): AlertLevel {
  // BUG: thresholds off by one
  if (score <= 1) return { tag: "none" };
  if (score <= 3) return { tag: "advisory" };
  if (score <= 5) return { tag: "warning" };
  return { tag: "emergency" };
}

export function precipitationType(tempTimes10: number, w: Weather): Weather {
  switch (w.tag) {
    case "rainy":  return tempTimes10 <= 20 ? { tag: "snowy" } : { tag: "rainy" };
    case "snowy":  return tempTimes10 <= 20 ? { tag: "snowy" } : { tag: "rainy" };
    case "stormy": return tempTimes10 <= 20 ? { tag: "snowy" } : { tag: "stormy" };
    case "sunny":  return { tag: "sunny" };
    case "cloudy": return { tag: "rainy" };  // BUG: cloudy should stay cloudy, not become rainy
  }
}

export function comfortIndex(tempTimes10: number, humidity: number): number {
  // BUG: no Math.max(0, ...) — can go negative
  const tempPenalty = tempTimes10 >= 220
    ? Math.floor((tempTimes10 - 220) / 10)
    : Math.floor((220 - tempTimes10) / 10);
  const humidityPenalty = Math.floor(humidity / 5);
  return 100 - (tempPenalty + humidityPenalty);
}
