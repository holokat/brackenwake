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
const { dayFactorAt, DAY_CYCLE_MS, NIGHT_FRACTION, PALETTE, WORLD_FOG, lightingAt, litness, sunWarmth, DAWN, SHADOW_BOX, SHADOW_MAP, applyLighting, createScene } = await import('./scene.js');
const { REALM_SKY, skyLighting, realmMixAt, DEFAULT_REALM } = await import('./sky.js');
const { REALM_ZONES, ZONE: ZONE_BY_ID } = await import('../world/zones.js');
console.warn = warn;

let bad = 0, pass = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : bad++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---- the cycle is what the docs say it is ----
ck('one day is 25 minutes, 20 of them light', DAY_CYCLE_MS === 1500000 && NIGHT_FRACTION === 0.2, `${DAY_CYCLE_MS} ms, night ${NIGHT_FRACTION}`);
ck('the sky is the meadow row of THEMES', PALETTE && PALETTE.id === 'meadow');
ck('fog in the open closes at 280 m, inside the 320 m ring', WORLD_FOG.near === 78.4 && WORLD_FOG.far === 280);

// ---- sample one whole cycle at one second steps ----
const N = DAY_CYCLE_MS / 1000;   // one whole cycle at one second steps
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
// The sun's angle is warped so 80% of the cycle is above the horizon
// (dayclock.js): the day plateau covers acos(5/7)/2pi of the first quarter turn
// stretched over (1 - NIGHT_FRACTION)/2 of the cycle each side, and the night
// plateau the matching slice of the second quarter squeezed into NIGHT_FRACTION/2.
const A = Math.acos(5 / 7) / (2 * Math.PI);
const WANT_DAY = Math.round(2 * (A / 0.25) * ((1 - NIGHT_FRACTION) / 2) * N);
const WANT_NIGHT = Math.round(2 * ((0.5 - A - 0.25) / 0.25) * (NIGHT_FRACTION / 2) * N);
ck(`day plateau is ${dayPlateau} of ${N} seconds`, Math.abs(dayPlateau - WANT_DAY) <= 2, `want ${WANT_DAY}, ${(dayPlateau / N * 100).toFixed(1)}%`);
ck(`night plateau is ${nightPlateau} of ${N} seconds`, Math.abs(nightPlateau - WANT_NIGHT) <= 4, `want ${WANT_NIGHT}, ${(nightPlateau / N * 100).toFixed(1)}%`);
ck('the light lasts four times as long as the dark', dayPlateau > nightPlateau * 3.5, `${dayPlateau} light, ${nightPlateau} dark`);
ck(`dawn and dusk together are ${dusk} of ${N} seconds`, dusk === N - dayPlateau - nightPlateau);
ck('the plateaus are not equal any more: the day is the long one', dayPlateau > nightPlateau);
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
ck('at midnight, 0.38 of a cycle in, it is night', dayFactorAt(0.38 * DAY_CYCLE_MS) === 0, `${dayFactorAt(0.38 * DAY_CYCLE_MS)}`);

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
  // midnight is moonlit on purpose (seen black in the browser at the old numbers), so five times, not ten
  ck('noon is brighter than midnight', litness(1) > litness(0) * 2.5,
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
    noon.hemi.sky[2] > noon.hemi.sky[0] && night.hemi.intensity < noon.hemi.intensity * 0.7,
    `hemi ${night.hemi.intensity} to ${noon.hemi.intensity}`);
  ck('the ambient goes cool and low at night',
    night.ambient.color[2] > night.ambient.color[0] && noon.ambient.color[0] >= noon.ambient.color[2]
    && night.ambient.intensity < noon.ambient.intensity,
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

// ---- the realms tint the day, and the Greenwold's tint is nothing (Z3) ----

console.log('\n  -- the realms on the lights --');
{
  const green = skyLighting(1, { realm: DEFAULT_REALM });
  ck('the Greenwold\'s tint leaves the curve exactly where it was',
    JSON.stringify(lightingAt(1)) === JSON.stringify(lightingAt(1, green))
    && JSON.stringify(lightingAt(0)) === JSON.stringify(lightingAt(0, skyLighting(0, { realm: DEFAULT_REALM })))
    && JSON.stringify(lightingAt(DAWN)) === JSON.stringify(lightingAt(DAWN, skyLighting(DAWN, { realm: DEFAULT_REALM }))));
  ck('and so does no tint at all', JSON.stringify(lightingAt(0.63)) === JSON.stringify(lightingAt(0.63, null)));

  // the terrain, the water and the grass all take their light from these four
  // lamps, so what matters is that no realm turns the world off or blows it out
  const base = litness(1), baseN = litness(0);
  const rows = [];
  let worstDay = 0, worstNight = 0;
  for (const zn of REALM_ZONES) {
    const d = litness(1, skyLighting(1, { realm: zn.id })) / base;
    const n = litness(0, skyLighting(0, { realm: zn.id })) / baseN;
    rows.push(`${zn.short || zn.id} ${d.toFixed(2)}/${n.toFixed(2)}`);
    worstDay = Math.max(worstDay, Math.abs(Math.log(d)));
    worstNight = Math.max(worstNight, Math.abs(Math.log(n)));
  }
  ck('no realm is more than a quarter brighter or darker than the meadow by day',
    worstDay < Math.log(1.25), rows.join(', '));
  ck('and none of them by night either', worstNight < Math.log(1.25),
    `worst ${Math.exp(worstNight).toFixed(3)}x`);

  // and the tint is doing something, or the table is decoration
  const bone = lightingAt(1, skyLighting(1, { realm: 'boneyard' }));
  const ash = lightingAt(1, skyLighting(1, { realm: 'ashenthrone' }));
  const meadow = lightingAt(1);
  ck('the Ashen Throne\'s sun is redder than the meadow\'s',
    ash.sun.color[0] / ash.sun.color[2] > meadow.sun.color[0] / meadow.sun.color[2] * 1.2,
    `${(ash.sun.color[0] / ash.sun.color[2]).toFixed(2)} against ${(meadow.sun.color[0] / meadow.sun.color[2]).toFixed(2)}`);
  ck('and the Boneyard\'s ground is greyer than the meadow\'s',
    Math.abs(bone.hemi.ground[0] - bone.hemi.ground[2]) < Math.abs(meadow.hemi.ground[0] - meadow.hemi.ground[2]),
    `bone ${bone.hemi.ground.map((v) => v.toFixed(2)).join(',')} against meadow ${meadow.hemi.ground.map((v) => v.toFixed(2)).join(',')}`);
  ck('every realm keeps its sun above half the meadow\'s strength',
    REALM_ZONES.every((z) => lightingAt(1, skyLighting(1, { realm: z.id })).sun.intensity > meadow.sun.intensity * 0.5));

  // the tint lands on real THREE lights through the real applyLighting
  const rig = {
    renderer: { toneMappingExposure: 1 },
    sun: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight(),
    ambient: new THREE.AmbientLight(), fill: new THREE.DirectionalLight(),
  };
  applyLighting(rig, 1, skyLighting(1, { realm: 'ashenthrone' }));
  const red = rig.sun.color.clone();
  applyLighting(rig, 1, skyLighting(1, { realm: DEFAULT_REALM }));
  ck('applyLighting puts the realm on the real lamp, and takes it off again',
    red.getHexString() !== rig.sun.color.getHexString(),
    `#${red.getHexString()} in the fortress, #${rig.sun.color.getHexString()} at home`);
}

// The numbers setDay will put on the fog, computed the way setDay computes
// them, so the arithmetic is proved even where node has no GL context to run
// createScene in.
{
  const G = REALM_SKY[DEFAULT_REALM];
  for (const [id, wantFar] of [['greenwold', 280], ['boneyard', 208.955], ['sunkenkingdom', 130.597], ['emberwastes', 280]]) {
    const p = { fogNear: REALM_SKY[id].fogNear, fogFar: REALM_SKY[id].fogFar };
    const far = WORLD_FOG.far * (p.fogFar / G.fogFar);
    const near = Math.min(WORLD_FOG.near * (p.fogNear / G.fogNear), far * 0.92);
    ck(`the fog in ${REALM_SKY[id].name} runs ${near.toFixed(0)} to ${far.toFixed(0)} m`,
      Math.abs(far - wantFar) < 0.5 && near > 0 && near < far && far <= WORLD_FOG.far,
      id === 'greenwold' ? 'the modest Greenwold view range' : '');
  }
}

// ---- the scene follows the player into a realm ----
{
  const container = { clientWidth: 800, clientHeight: 600, appendChild() {} };
  let sc = null;
  try { sc = createScene(container); } catch { /* no WebGL in node */ }
  if (!sc) {
    console.log('  ..  createScene needs a GL context; the blend is checked through its parts instead');
    const bone = ZONE_BY_ID.boneyard;
    ck('realmMixAt says the Boneyard at the Boneyard', realmMixAt(bone.x, bone.z)[0][0] === 'boneyard');
    ck('and the Greenwold at the origin', realmMixAt(0, 0)[0][0] === 'greenwold');
  } else {
    sc.setRealmAt(0, 0);
    ck('the scene stands in the Greenwold at the origin', sc.realmMix[0][0] === 'greenwold');
    const before = sc.scene.fog.far;
    const bone = ZONE_BY_ID.boneyard;
    sc.useAnalyticSky(true);
    sc.follow({ x: bone.x, y: 0, z: bone.z });
    ck('and following the player into the Boneyard takes it there',
      sc.realmMix[0][0] === 'boneyard', JSON.stringify(sc.realmMix));
    sc.setDay(1);
    ck('the fog closes in with the realm',
      sc.scene.fog.far < before, `${sc.scene.fog.far.toFixed(0)} m against ${before.toFixed(0)} m`);
    sc.follow({ x: 0, y: 0, z: 0 });
    sc.setDay(1);
    ck('and opens again at home', Math.abs(sc.scene.fog.far - WORLD_FOG.far) < 1e-6,
      `${sc.scene.fog.far.toFixed(1)} m`);
    sc.dispose();
  }
}

console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
