// The day. One place for the length of a day and how it is shared between
// light and dark, so the sun in the sky (sky.js) and the light on the ground
// (scene.js) cannot disagree.
//
// A cycle is 25 real minutes: 20 of daylight, 5 of night. The user asked for
// far more day than night and a night that does not arrive in a rush, so the
// clock runs evenly but the sun does not: its angle is warped so the arc above
// the horizon takes 80% of the cycle and the arc below it 20%.

export const DAY_CYCLE_MS = 25 * 60_000;
export const NIGHT_FRACTION = 0.2;       // of the cycle spent with the sun down

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Sun angle as a fraction of a turn from noon, 0 at noon, 0.25 at the horizon,
 * 0.5 at midnight, then back: symmetric, so it is a distance, not a direction.
 * `dir` says which side of noon (-1 morning, +1 afternoon) for callers that
 * need the whole circle.
 */
export function sunAngleAt(nowMs, cycleMs = DAY_CYCLE_MS) {
  const p = ((((nowMs / cycleMs) + 0.12) % 1) + 1) % 1;   // 0 is noon, the old offset kept
  const d = p < 0.5 ? p : 1 - p;                            // 0..0.5 from noon
  const dayHalf = (1 - NIGHT_FRACTION) / 2;                 // 0.4 of the cycle each side is day
  const t = d <= dayHalf
    ? (d / dayHalf) * 0.25                                  // noon to sunset: the first quarter turn
    : 0.25 + ((d - dayHalf) / (0.5 - dayHalf)) * 0.25;      // sunset to midnight: the second
  return { t, dir: p < 0.5 ? 1 : -1, p };
}

/** 0 at night, 1 at noon: the curve every light in the game is driven by. */
export function dayFactorAt(nowMs, cycleMs = DAY_CYCLE_MS) {
  const { t } = sunAngleAt(nowMs, cycleMs);
  const raw = 0.5 + 0.5 * Math.cos(t * Math.PI * 2);
  return clamp01(raw * 1.4 - 0.2);
}

/** The sky's phase, 0 at midnight and 0.5 at noon, rising through the morning. */
export function phaseAt(nowMs, cycleMs = DAY_CYCLE_MS) {
  const { t, dir } = sunAngleAt(nowMs, cycleMs);
  const fromNoon = dir > 0 ? t : -t;                        // signed: afternoon positive
  return (((0.5 + fromNoon) % 1) + 1) % 1;
}
