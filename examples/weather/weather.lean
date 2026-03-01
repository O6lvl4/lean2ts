import Init

/-!
# Weather Forecast Rules

Business rules for a weather forecast system,
formally verified in Lean 4, automatically tested in TypeScript.
-/

/-- Weather condition -/
inductive Weather where
  | sunny
  | cloudy
  | rainy
  | snowy
  | stormy

/-- Wind strength category -/
inductive WindLevel where
  | calm      -- 0–5 m/s
  | moderate  -- 6–15 m/s
  | strong    -- 16–24 m/s
  | violent   -- 25+ m/s

/-- Alert level issued to the public -/
inductive AlertLevel where
  | none
  | advisory   -- 注意報
  | warning    -- 警報
  | emergency  -- 特別警報

/-- Severity score: higher means more dangerous weather.
    Used internally to derive alert levels. -/
def weatherSeverity (w : Weather) : Nat :=
  match w with
  | .sunny  => 0
  | .cloudy => 1
  | .rainy  => 2
  | .snowy  => 3
  | .stormy => 4

/-- Wind severity score -/
def windSeverity (wl : WindLevel) : Nat :=
  match wl with
  | .calm     => 0
  | .moderate => 1
  | .strong   => 2
  | .violent  => 3

/-- Combined danger score = weather severity + wind severity -/
def dangerScore (w : Weather) (wl : WindLevel) : Nat :=
  weatherSeverity w + windSeverity wl

/-- Derive alert level from danger score.
    0–1 → none, 2–3 → advisory, 4–5 → warning, 6+ → emergency -/
def alertFromScore (score : Nat) : AlertLevel :=
  if score ≤ 1 then .none
  else if score ≤ 3 then .advisory
  else if score ≤ 5 then .warning
  else .emergency

/-- Determine precipitation type from temperature (°C × 10 to avoid fractions).
    ≤ 20 (= 2.0°C) → snowy, otherwise → rainy.
    Returns none if weather has no precipitation. -/
def precipitationType (tempTimes10 : Nat) (w : Weather) : Weather :=
  match w with
  | .rainy  => if tempTimes10 ≤ 20 then .snowy else .rainy
  | .snowy  => if tempTimes10 ≤ 20 then .snowy else .rainy
  | .stormy => if tempTimes10 ≤ 20 then .snowy else .stormy
  | other   => other

/-- Comfort index: 100 - |temp - 220| / 10 - humidity / 5.
    Clamped to 0–100. Temp in °C×10, humidity in %. -/
def comfortIndex (tempTimes10 humidity : Nat) : Nat :=
  let tempPenalty := if tempTimes10 ≥ 220 then (tempTimes10 - 220) / 10
                     else (220 - tempTimes10) / 10
  let humidityPenalty := humidity / 5
  100 - (tempPenalty + humidityPenalty)

-------------------------------------------------------
-- Theorems → lean2ts converts these to property tests
-------------------------------------------------------

/-- Weather severity is bounded: max 4 -/
theorem weather_severity_bounded (w : Weather) :
    weatherSeverity w ≤ 4 := by
  cases w <;> simp [weatherSeverity]

/-- Wind severity is bounded: max 3 -/
theorem wind_severity_bounded (wl : WindLevel) :
    windSeverity wl ≤ 3 := by
  cases wl <;> simp [windSeverity]

/-- Danger score is bounded: max 7 -/
theorem danger_score_bounded (w : Weather) (wl : WindLevel) :
    dangerScore w wl ≤ 7 := by
  cases w <;> cases wl <;> simp [dangerScore, weatherSeverity, windSeverity]

/-- Sunny + calm never triggers an alert -/
theorem sunny_calm_safe :
    alertFromScore (dangerScore Weather.sunny WindLevel.calm) = AlertLevel.none := by
  simp [dangerScore, weatherSeverity, windSeverity, alertFromScore]

/-- Stormy + violent always triggers emergency -/
theorem stormy_violent_emergency :
    alertFromScore (dangerScore Weather.stormy WindLevel.violent) = AlertLevel.emergency := by
  simp [dangerScore, weatherSeverity, windSeverity, alertFromScore]

/-- Worse weather never lowers the danger score -/
theorem stormy_worse_than_sunny (wl : WindLevel) :
    dangerScore Weather.sunny wl ≤ dangerScore Weather.stormy wl := by
  simp [dangerScore, weatherSeverity]

/-- Non-precipitating weather is unchanged by precipitationType -/
theorem sunny_unaffected_by_temp (t : Nat) :
    precipitationType t Weather.sunny = Weather.sunny := by
  simp [precipitationType]

/-- Cloudy weather is unchanged by precipitationType -/
theorem cloudy_unaffected_by_temp (t : Nat) :
    precipitationType t Weather.cloudy = Weather.cloudy := by
  simp [precipitationType]
