export type Weather =
  | { readonly tag: "sunny" }
  | { readonly tag: "cloudy" }
  | { readonly tag: "rainy" }
  | { readonly tag: "snowy" }
  | { readonly tag: "stormy" };

export function isSunny(x: Weather): x is Extract<Weather, { tag: "sunny" }> {
  return x.tag === "sunny";
}

export function isCloudy(x: Weather): x is Extract<Weather, { tag: "cloudy" }> {
  return x.tag === "cloudy";
}

export function isRainy(x: Weather): x is Extract<Weather, { tag: "rainy" }> {
  return x.tag === "rainy";
}

export function isSnowy(x: Weather): x is Extract<Weather, { tag: "snowy" }> {
  return x.tag === "snowy";
}

export function isStormy(x: Weather): x is Extract<Weather, { tag: "stormy" }> {
  return x.tag === "stormy";
}

export type WindLevel =
  | { readonly tag: "calm" }
  | { readonly tag: "moderate" }
  | { readonly tag: "strong" }
  | { readonly tag: "violent" };

export function isCalm(x: WindLevel): x is Extract<WindLevel, { tag: "calm" }> {
  return x.tag === "calm";
}

export function isModerate(x: WindLevel): x is Extract<WindLevel, { tag: "moderate" }> {
  return x.tag === "moderate";
}

export function isStrong(x: WindLevel): x is Extract<WindLevel, { tag: "strong" }> {
  return x.tag === "strong";
}

export function isViolent(x: WindLevel): x is Extract<WindLevel, { tag: "violent" }> {
  return x.tag === "violent";
}

export type AlertLevel =
  | { readonly tag: "none" }
  | { readonly tag: "advisory" }
  | { readonly tag: "warning" }
  | { readonly tag: "emergency" };

export function isNone(x: AlertLevel): x is Extract<AlertLevel, { tag: "none" }> {
  return x.tag === "none";
}

export function isAdvisory(x: AlertLevel): x is Extract<AlertLevel, { tag: "advisory" }> {
  return x.tag === "advisory";
}

export function isWarning(x: AlertLevel): x is Extract<AlertLevel, { tag: "warning" }> {
  return x.tag === "warning";
}

export function isEmergency(x: AlertLevel): x is Extract<AlertLevel, { tag: "emergency" }> {
  return x.tag === "emergency";
}
