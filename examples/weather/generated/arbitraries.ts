import fc from "fast-check";

import type { Weather, WindLevel, AlertLevel } from "./types.js";

export const arbWeather: fc.Arbitrary<Weather> = fc.oneof(
  fc.constant({ tag: "sunny" as const }),
  fc.constant({ tag: "cloudy" as const }),
  fc.constant({ tag: "rainy" as const }),
  fc.constant({ tag: "snowy" as const }),
  fc.constant({ tag: "stormy" as const })
);

export const arbWindLevel: fc.Arbitrary<WindLevel> = fc.oneof(
  fc.constant({ tag: "calm" as const }),
  fc.constant({ tag: "moderate" as const }),
  fc.constant({ tag: "strong" as const }),
  fc.constant({ tag: "violent" as const })
);

export const arbAlertLevel: fc.Arbitrary<AlertLevel> = fc.oneof(
  fc.constant({ tag: "none" as const }),
  fc.constant({ tag: "advisory" as const }),
  fc.constant({ tag: "warning" as const }),
  fc.constant({ tag: "emergency" as const })
);
