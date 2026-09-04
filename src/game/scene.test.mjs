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

const THREE = await import('three');
const warn = console.warn; console.warn = () => {};
const { dayFactorAt, DAY_CYCLE_MS, PALETTE, WORLD_FOG, lightingAt, litness, sunWarmth, DAWN, SHADOW_BOX, SHADOW_MAP, applyLighting } = await import('./scene.js');
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

// ---- the lighting curve --------------------------------------------------
// setDay does nothing but read this and copy it onto the four lights and the
// exposure, so these are the numbers the game is actually lit by.
{
  const night = lightingAt(0), dawn = lightingAt(DAWN), noon = lightingAt(1);
  ck('noon is brighter than midnight', litness(1) > litness(0) * 10,
    `midnight ${litness(0).toFixed(3)}, noon ${litness(1).toFixed(3)}`);
  ck('and dawn sits between them', litness(DAWN) > litness(0) && litness(DAWN) < litness(1),
    `dawn ${litness(DAWN).toFixed(3)}`);
  ck('the sun is warm at dawn', sunWarmth(DAWN) > 3, `red over blue ${sunWarmth(DAWN).toFixed(2)}`);
  ck('nearly white at noon', sunWarmth(1) > 1 && sunWarmth(1) < 1.4, `${sunWarmth(1).toFixed(2)}`);
  ck('and cold at midnight', sunWarmth(0) < 0.6, `${sunWarmth(0).toFixed(2)}`);
  ck('the exposure is lifted at dawn and pulled down at night',
    dawn.exposure > noon.exposure && night.exposure < noon.exposure,
    `${night.exposure.toFixed(2)} / ${dawn.exposure.toFixed(2)} / ${noon.exposure.toFixed(2)}`);
  ck('the hemisphere is sky blue by day and near black at night',
    noon.hemi.sky[2] > noon.hemi.sky[0] && night.hemi.intensity < noon.hemi.intensity * 0.25,
    `hemi ${night.hemi.intensity} to ${noon.hemi.intensity}`);
  ck('the ambient goes cool and low at night',
    night.ambient.color[2] > night.ambient.color[0] && noon.ambient.color[0] >= noon.ambient.color[2]
    && night.ambient.intensity < noon.ambient.intensity * 0.5,
    `night ${night.ambient.intensity} warm? ${night.ambient.color[0] > night.ambient.color[2]}`);

  // every value in range, everywhere on the curve, including past both ends
  let bad2 = 0;
  for (let d = -0.5; d <= 1.5; d += 0.001) {
    const L = lightingAt(d);
    for (const c of [L.sun.color, L.hemi.sky, L.hemi.ground, L.ambient.color, L.fill.color]) {
      if (c.some((v) => v < 0 || v > 1)) bad2++;
    }
    if (L.exposure <= 0 || L.sun.intensity < 0 || L.hemi.intensity < 0) bad2++;
  }
  ck('no colour or intensity ever leaves its range, even off the ends of the curve', bad2 === 0, `${bad2} bad samples`);

  // continuous: halving the sample step halves the worst jump
  const sweep = (n) => {
    let worst = 0, prev = null;
    for (let k = 0; k <= n; k++) {
      const L = lightingAt(k / n);
      const v = [L.exposure, L.sun.intensity, L.hemi.intensity, L.ambient.intensity, L.fill.intensity,
        ...L.sun.color, ...L.hemi.sky, ...L.ambient.color];
      if (prev) worst = Math.max(worst, ...v.map((x, i) => Math.abs(x - prev[i])));
      prev = v;
    }
    return worst;
  };
  const c1 = sweep(1000), c2 = sweep(2000);
  ck('the curve is continuous through the dawn stop', c2 / c1 < 0.6, `${c1.toExponential(2)} -> ${c2.toExponential(2)}`);

  ck('the shadow box is 55 m each way at 2048', SHADOW_BOX === 55 && SHADOW_MAP === 2048,
    `one texel is ${(2 * SHADOW_BOX / SHADOW_MAP).toFixed(4)} m`);
  ck('the dawn stop is early in the day, not the middle of it', DAWN > 0.15 && DAWN < 0.5, String(DAWN));
}

// ---- the lights actually take it -----------------------------------------
// applyLighting is the function setDay calls; these are real THREE lights, so
// what lands here is what lands in the game.
{
  const rig = {
    renderer: { toneMappingExposure: 0 },
    sun: new THREE.DirectionalLight(0xffffff, 1),
    hemi: new THREE.HemisphereLight(0xffffff, 0xffffff, 1),
    ambient: new THREE.AmbientLight(0xffffff, 1),
    fill: new THREE.DirectionalLight(0xffffff, 1),
  };
  const noon = applyLighting(rig, 1);
  ck('the exposure reached the renderer', rig.renderer.toneMappingExposure === noon.exposure, String(rig.renderer.toneMappingExposure));
  ck('the sun took its noon colour and intensity',
    Math.abs(rig.sun.intensity - noon.sun.intensity) < 1e-9
    && Math.abs(rig.sun.color.r - noon.sun.color[0]) < 1e-6
    && Math.abs(rig.sun.color.b - noon.sun.color[2]) < 1e-6,
    `#${rig.sun.color.getHexString()} at ${rig.sun.intensity}`);
  ck('the hemisphere took a sky and a ground colour, and they differ',
    rig.hemi.color.getHex() !== rig.hemi.groundColor.getHex(),
    `sky #${rig.hemi.color.getHexString()} ground #${rig.hemi.groundColor.getHexString()}`);
  const dayHex = rig.sun.color.getHexString(), dayExp = rig.renderer.toneMappingExposure;
  const dayHemi = rig.hemi.color.getHexString();
  applyLighting(rig, 0);
  ck('and midnight moves every one of them',
    rig.sun.color.getHexString() !== dayHex && rig.renderer.toneMappingExposure !== dayExp
    && rig.hemi.color.getHexString() !== dayHemi && rig.sun.intensity < noon.sun.intensity,
    `night sun #${rig.sun.color.getHexString()} at ${rig.sun.intensity}, exposure ${rig.renderer.toneMappingExposure}`);
  applyLighting(rig, DAWN);
  ck('and dawn is oranger than either', rig.sun.color.r / rig.sun.color.b > 3,
    `#${rig.sun.color.getHexString()}`);
  const noRenderer = { sun: rig.sun, hemi: rig.hemi, ambient: rig.ambient, fill: rig.fill };
  let threw = false;
  try { applyLighting(noRenderer, 0.5); } catch { threw = true; }
  ck('it works without a renderer, for anything that only wants the lights', !threw);
}

console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
