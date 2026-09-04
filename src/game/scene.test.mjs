// The day curve, checked against the real module. Run: node src/game/scene.test.mjs
//
// scene.js is a browser module. It loads in node given these globals, and the
// curve it exports is the same function the running game calls through
// sc.dayFactor, so this is the real path and not a copy of it.

globalThis.performance ||= { now: () => Date.now() };
globalThis.document ||= {
  createElement: () => ({ style: {}, getContext: () => null, addEventListener() {} }),
  addEventListener() {}, head: { appendChild() {} }, body: { appendChild() {} },
};
globalThis.window ||= { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.navigator ||= { userAgent: 'node' };

const warn = console.warn; console.warn = () => {};
const { dayFactorAt, DAY_CYCLE_MS, PALETTE, WORLD_FOG } = await import('./scene.js');
console.warn = warn;

let bad = 0, pass = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : bad++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---- the cycle is what the docs say it is ----
ck('one day is 6 minutes', DAY_CYCLE_MS === 360000, `${DAY_CYCLE_MS} ms`);
ck('the sky is the meadow row of THEMES', PALETTE && PALETTE.id === 'meadow');
ck('fog in the open closes at 536 m, inside the 576 m ring', WORLD_FOG.near === 90 && WORLD_FOG.far === 536);

// ---- sample one whole cycle at one second steps ----
const N = 360;
const xs = [];
for (let i = 0; i < N; i++) xs.push(dayFactorAt(i * 1000));

ck('every sample is inside 0..1', xs.every((v) => v >= 0 && v <= 1),
  `min ${Math.min(...xs).toFixed(3)} max ${Math.max(...xs).toFixed(3)}`);
ck('it reaches full day', Math.max(...xs) === 1);
ck('it reaches full night', Math.min(...xs) === 0);

const dayPlateau = xs.filter((v) => v === 1).length;
const nightPlateau = xs.filter((v) => v === 0).length;
const dusk = xs.filter((v) => v > 0 && v < 1).length;
// Clamping a 1.4x cosine at 0 and 1 leaves the same slice of the circle at
// each end. d hits 1 once raw >= 6/7, which is |theta| <= acos(5/7) = 0.7752
// rad, so each plateau is 2 * 0.7752 / 2pi = 24.68% of the cycle: 88.9 of the
// 360 one-second samples.
const WANT = Math.round(2 * Math.acos(5 / 7) / (2 * Math.PI) * N);
ck(`day plateau is ${dayPlateau} of ${N} seconds`, Math.abs(dayPlateau - WANT) <= 1, `want ${WANT}, ${(dayPlateau / N * 100).toFixed(1)}%`);
ck(`night plateau is ${nightPlateau} of ${N} seconds`, Math.abs(nightPlateau - WANT) <= 1, `want ${WANT}, ${(nightPlateau / N * 100).toFixed(1)}%`);
ck(`dawn and dusk together are ${dusk} of ${N} seconds`, dusk === N - dayPlateau - nightPlateau);
ck('the plateaus are within one sample of each other', Math.abs(dayPlateau - nightPlateau) <= 1);
ck('the changing half is about half the day', dusk / N > 0.5 && dusk / N < 0.56, `${(dusk / N * 100).toFixed(1)}%`);

// ---- it is a loop ----
ck('the curve repeats every cycle', [0, 1234, 99000, 250000].every(
  (t) => Math.abs(dayFactorAt(t) - dayFactorAt(t + DAY_CYCLE_MS)) < 1e-12));
ck('and again three cycles out', Math.abs(dayFactorAt(7777) - dayFactorAt(7777 + 3 * DAY_CYCLE_MS)) < 1e-12);

// ---- it climbs and it falls, once each ----
let ups = 0, downs = 0, flats = 0;
for (let i = 1; i < N; i++) {
  const d = xs[i] - xs[i - 1];
  if (d > 1e-9) ups++; else if (d < -1e-9) downs++; else flats++;
}
ck('there is one dawn and one dusk of equal length', ups > 0 && Math.abs(ups - downs) <= 1, `${ups} up, ${downs} down`);
ck('the rest is plateau', flats === N - 1 - ups - downs);

// ---- both directions of the night gate the fauna reads ----
// fauna spawns its predators when dayFactor < 0.4, so that predicate must be
// driven true and false by this curve and not just sit on one side of it
ck('the curve goes below the 0.4 night gate', xs.some((v) => v < 0.4));
ck('and above it', xs.some((v) => v >= 0.4));

// ---- the phase offset means t = 0 is not midnight ----
ck('t = 0 is broad daylight, not midnight', dayFactorAt(0) === 1, `${dayFactorAt(0)}`);
ck('half a cycle later it is night', dayFactorAt(DAY_CYCLE_MS / 2) === 0);

// ---- out of range inputs do not produce out of range skies ----
ck('a negative clock still lands in 0..1', [-1, -99999, -DAY_CYCLE_MS * 3.7].every((t) => {
  const v = dayFactorAt(t); return v >= 0 && v <= 1;
}));
ck('a custom cycle length scales the curve', Math.abs(dayFactorAt(1000, 2000) - dayFactorAt(180000, 360000)) < 1e-12);

console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
