// The sky, driven both ways. Run: node src/game/sky.test.mjs
//
// Everything here runs the REAL module. The pure half (palette, phase, sun
// arc) needs nothing at all; the dome half builds real THREE objects, which
// works in node because geometry and materials are plain data until a renderer
// touches them. Nothing is stubbed except the browser globals scene.js wants
// at import time, and scene.js is imported only to prove the two clocks agree.

globalThis.performance ||= { now: () => Date.now() };
globalThis.document ||= {
  createElement: () => ({ style: {}, getContext: () => null, addEventListener() {} }),
  addEventListener() {}, head: { appendChild() {} }, body: { appendChild() {} },
};
globalThis.window ||= { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.navigator ||= { userAgent: 'node' };

import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  DAY_CYCLE_S, MAX_ELEVATION, SKY_RADIUS, SKY_KEYS, SHADOW_MIN_Y,
  skyColours, luminance, warmth, elevationForDay,
  phaseFromClock, phaseFromDay, hourAngle, sunDirectionAt,
  SKY_GLSL, SKY_VERT, SKY_FRAG, createSkyUniforms, createSky,
} from './sky.js';

const warn = console.warn; console.warn = () => {};
const { dayFactorAt, DAY_CYCLE_MS } = await import('./scene.js');
console.warn = warn;

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const f3 = (v) => Number(v).toFixed(3);

// ---------------------------------------------------------- the two clocks --

ck('the sky day is scene.js\'s day', DAY_CYCLE_S * 1000 === DAY_CYCLE_MS, `${DAY_CYCLE_S} s vs ${DAY_CYCLE_MS} ms`);
ck('the dome fits inside the camera far plane', SKY_RADIUS < 1800, `${SKY_RADIUS} m`);

// ------------------------------------------------------------- the palette --

const night = skyColours(0), noon = skyColours(1), dusk = skyColours(0.5);

ck('noon is brighter than midnight (zenith)',
  luminance(noon.zenith) > luminance(night.zenith),
  `noon ${f3(luminance(noon.zenith))} vs midnight ${f3(luminance(night.zenith))}`);
ck('noon is brighter than midnight (horizon)',
  luminance(noon.horizon) > luminance(night.horizon),
  `noon ${f3(luminance(noon.horizon))} vs midnight ${f3(luminance(night.horizon))}`);
ck('noon is at least ten times as bright as midnight',
  luminance(noon.zenith) / luminance(night.zenith) > 10,
  `${f3(luminance(noon.zenith) / luminance(night.zenith))}x`);

ck('dusk is warmer than noon (sun)',
  warmth(dusk.sun) > warmth(noon.sun),
  `dusk ${f3(warmth(dusk.sun))} vs noon ${f3(warmth(noon.sun))}`);
ck('dusk is warmer than noon (horizon)',
  warmth(dusk.horizon) > warmth(noon.horizon),
  `dusk ${f3(warmth(dusk.horizon))} vs noon ${f3(warmth(noon.horizon))}`);
ck('the noon horizon is cool, not warm', warmth(noon.horizon) < 0, f3(warmth(noon.horizon)));

for (const d of [0.7, 0.85, 1.0]) {
  const c = skyColours(d);
  ck(`by day the horizon is lighter than the zenith (d=${d})`,
    luminance(c.horizon) > luminance(c.zenith),
    `${f3(luminance(c.horizon))} vs ${f3(luminance(c.zenith))}`);
}

// the whole curve, not just three points
{
  let inRange = true, monotone = true, prev = -1;
  for (let i = 0; i <= 100; i++) {
    const c = skyColours(i / 100);
    for (const k of ['zenith', 'horizon', 'sun', 'fog']) {
      const v = c[k];
      if (!(v.r >= 0 && v.r <= 1 && v.g >= 0 && v.g <= 1 && v.b >= 0 && v.b <= 1)) inRange = false;
    }
    const l = luminance(c.zenith);
    if (l < prev - 1e-9) monotone = false;
    prev = l;
  }
  ck('every colour on the curve is inside 0..1', inRange);
  ck('the zenith only ever gets brighter as the day comes up', monotone);
}
ck('the palette clamps outside 0..1', luminance(skyColours(-3).zenith) === luminance(skyColours(0).zenith)
  && luminance(skyColours(9).zenith) === luminance(skyColours(1).zenith));

ck('stars are out at midnight and gone at noon',
  skyColours(0).star === 1 && skyColours(1).star === 0,
  `${f3(skyColours(0).star)} / ${f3(skyColours(1).star)}`);
ck('and they fade, they do not snap', skyColours(0.2).star > 0 && skyColours(0.2).star < 1, f3(skyColours(0.2).star));
ck('the moon is out at midnight and gone at noon',
  skyColours(0).moon === 1 && skyColours(1).moon === 0);
ck('glare peaks at the horizon crossing, not at noon',
  skyColours(0.5).glare > skyColours(1).glare && skyColours(0.5).glare > skyColours(0).glare,
  `dusk ${f3(skyColours(0.5).glare)} noon ${f3(skyColours(1).glare)} night ${f3(skyColours(0).glare)}`);

// ---------------------------------------------------------------- the arc --

ck('the sun is on the horizon at day factor 0.5', Math.abs(elevationForDay(0.5)) < 1e-12, f3(elevationForDay(0.5)));
ck('it is below at midnight and above at noon',
  elevationForDay(0) < -0.7 && elevationForDay(1) > 0.7,
  `${f3(elevationForDay(0))} .. ${f3(elevationForDay(1))} rad`);

// The pure phase and scene.js's own curve must agree about whether it is day.
{
  let bad = 0, aboveN = 0, belowN = 0;
  for (let ms = 0; ms < DAY_CYCLE_MS * 3; ms += 500) {
    const d = dayFactorAt(ms);
    const s = sunDirectionAt(phaseFromClock(ms));
    if (d > 0.5 + 1e-9 && s.y <= 0) bad++;
    if (d < 0.5 - 1e-9 && s.y >= 0) bad++;
    if (s.y > 0) aboveN++; else belowN++;
  }
  ck('the sun is up exactly when scene.js says it is day', bad === 0,
    `${bad} disagreements over 3 days, ${aboveN} up / ${belowN} down samples`);
}

// One day: one sunrise, one sunset, and a noon that reaches the top.
{
  let rises = 0, sets = 0, maxEl = -9, minEl = 9;
  let prev = sunDirectionAt(phaseFromClock(0)).y;
  for (let ms = 1000; ms <= DAY_CYCLE_MS; ms += 1000) {
    const y = sunDirectionAt(phaseFromClock(ms)).y;
    const el = Math.asin(Math.max(-1, Math.min(1, y)));
    maxEl = Math.max(maxEl, el); minEl = Math.min(minEl, el);
    if (prev <= 0 && y > 0) rises++;
    if (prev >= 0 && y < 0) sets++;
    prev = y;
  }
  ck('one sunrise and one sunset a day', rises === 1 && sets === 1, `${rises} up, ${sets} down`);
  ck('noon reaches the top of the arc', Math.abs(maxEl - MAX_ELEVATION) < 0.02, `${f3(maxEl)} of ${MAX_ELEVATION}`);
  ck('midnight sinks the same distance below', Math.abs(minEl + MAX_ELEVATION) < 0.02, f3(minEl));
}

// The sun does not rise where it set.
{
  let riseAz = null, setAz = null, prev = sunDirectionAt(phaseFromClock(0));
  for (let ms = 1000; ms <= DAY_CYCLE_MS; ms += 1000) {
    const s = sunDirectionAt(phaseFromClock(ms));
    if (prev.y <= 0 && s.y > 0) riseAz = s.azimuth;
    if (prev.y >= 0 && s.y < 0) setAz = s.azimuth;
    prev = s;
  }
  const gap = Math.abs(setAz - riseAz);
  ck('sunrise and sunset are half a turn apart', Math.abs(gap - Math.PI) < 0.05, `${f3(gap)} rad`);
}

ck('the sun direction is a unit vector', [0, 0.1, 0.37, 0.5, 0.9].every((p) => {
  const s = sunDirectionAt(p);
  return Math.abs(Math.hypot(s.x, s.y, s.z) - 1) < 1e-12;
}));
ck('hour angle is zero at noon and half a turn at midnight',
  Math.abs(hourAngle(0.5)) < 1e-12 && Math.abs(Math.abs(hourAngle(0)) - Math.PI) < 1e-12);

// phaseFromDay, the fallback, is exact wherever the curve is moving.
{
  let worst = 0, n = 0;
  for (let ms = 0; ms < DAY_CYCLE_MS; ms += 250) {
    const d = dayFactorAt(ms);
    if (d <= 1e-6 || d >= 1 - 1e-6) continue;          // plateau: no information in d
    const rising = dayFactorAt(ms + 250) > d;
    const a = phaseFromDay(d, rising), b = phaseFromClock(ms);
    let e = Math.abs(a - b); if (e > 0.5) e = 1 - e;
    worst = Math.max(worst, e); n++;
  }
  ck('phase off the day factor matches phase off the clock', worst < 2e-3,
    `worst ${(worst * DAY_CYCLE_S).toFixed(2)} s over ${n} samples`);
}
ck('and it knows morning from evening',
  Math.abs(phaseFromDay(0.5, true) - 0.25) < 1e-9 && Math.abs(phaseFromDay(0.5, false) - 0.75) < 1e-9,
  `${f3(phaseFromDay(0.5, true))} vs ${f3(phaseFromDay(0.5, false))}`);

// ---------------------------------------------------------------- the glsl --

const declared = new Set();
for (const m of SKY_GLSL.matchAll(/uniform\s+\w+\s+([^;]+);/g)) {
  for (const name of m[1].split(',')) declared.add(name.trim());
}
const provided = new Set(Object.keys(createSkyUniforms()));
ck('every uniform the sky shader declares is provided',
  [...declared].every((u) => provided.has(u)),
  [...declared].filter((u) => !provided.has(u)).join(', ') || `${declared.size} uniforms`);
ck('and nothing is provided that the shader does not declare',
  [...provided].every((u) => declared.has(u)),
  [...provided].filter((u) => !declared.has(u)).join(', ') || 'none spare');

for (const [name, src] of [['SKY_GLSL', SKY_GLSL], ['SKY_VERT', SKY_VERT], ['SKY_FRAG', SKY_FRAG]]) {
  const bal = (a, b) => src.split(a).length === src.split(b).length;
  ck(`${name} has balanced braces and parens`, bal('{', '}') && bal('(', ')'));
}
ck('the fragment shader ends on three\'s tone curve, not its own',
  SKY_FRAG.includes('#include <tonemapping_fragment>') && SKY_FRAG.includes('#include <colorspace_fragment>')
  && !SKY_GLSL.includes('uExposure'));
ck('the shared sky function is called skyCol, which water.js relies on',
  /vec3\s+skyCol\s*\(\s*vec3\s+\w+\s*,\s*float\s+\w+\s*\)/.test(SKY_GLSL));

// ---------------------------------------------------------------- the dome --

{
  const scene = new THREE.Scene();
  const sky = createSky({ scene });

  ck('the dome is in the scene under a group world_runtime hides',
    scene.children.includes(sky.group) && sky.group.name === 'sky');
  ck('it is drawn first, inside out, and writes no depth',
    sky.mesh.renderOrder === -1000 && sky.material.side === THREE.BackSide
    && sky.material.depthWrite === false && sky.material.depthTest === false);
  ck('it is never frustum culled', sky.mesh.frustumCulled === false);

  const cam = { x: 120, y: 30, z: -400 };
  sky.update(1, cam, 0.016, 0);
  ck('the dome sits on the camera', sky.mesh.position.x === 120 && sky.mesh.position.z === -400);

  // noon
  sky.update(1, cam, 0, 0);
  const noonSun = sky.uniforms.uSunDir.value.y;
  const noonStars = sky.uniforms.uStars.value;
  const noonZ = sky.uniforms.uZenith.value.clone();
  // midnight: the clock's noon sits 0.12 of a cycle before zero, so midnight is 0.38 of a cycle in
  const MIDNIGHT = 0.38 * DAY_CYCLE_MS;
  sky.update(dayFactorAt(MIDNIGHT), cam, 0, MIDNIGHT);
  const midSun = sky.uniforms.uSunDir.value.y;
  const midStars = sky.uniforms.uStars.value;
  const midZ = sky.uniforms.uZenith.value.clone();

  ck('the sun is up at noon and down at midnight', noonSun > 0 && midSun < 0, `${f3(noonSun)} / ${f3(midSun)}`);
  ck('stars come out at midnight and not at noon', midStars === 1 && noonStars === 0);
  ck('the zenith uniform darkens at night', midZ.r + midZ.g + midZ.b < noonZ.r + noonZ.g + noonZ.b);
  ck('the moon is opposite the sun', Math.abs(sky.moonDir.y + sky.sunDir.y) < 1e-12
    && Math.abs(sky.moonDir.x + sky.sunDir.x) < 1e-12);
  ck('the light to shine by follows the moon at night', sky.lightDir.y === sky.moonDir.y);
  sky.update(1, cam, 0, 0);
  ck('and the sun by day', sky.lightDir.y === sky.sunDir.y);

  ck('the fog colour comes off the palette', sky.colours.fog.isColor === true);

  // the shadow light never lies down on the horizon
  {
    let lowest = 9, unit = true;
    for (let ms = 0; ms < DAY_CYCLE_MS; ms += 2000) {
      sky.update(dayFactorAt(ms), cam, 0, ms);
      lowest = Math.min(lowest, sky.shadowDir.y);
      if (Math.abs(sky.shadowDir.length() - 1) > 1e-9) unit = false;
    }
    ck('the shadow light never drops to the horizon', lowest >= SHADOW_MIN_Y - 1e-12 && unit,
      `lowest y ${f3(lowest)}, floor ${SHADOW_MIN_Y}`);
    sky.update(1, cam, 0, 0);
    ck('and high noon it is just the sun', Math.abs(sky.shadowDir.y - sky.sunDir.y) < 1e-12);
  }
  ck('cloud cover is settable', sky.setCloud(0.9) === 0.9 && sky.uniforms.uCloud.value === 0.9);

  // the scene's clock offset moves the sun: noon on the clock plus half a cycle is midnight in the dome
  {
    const sc = { scene: new THREE.Scene(), clockOffset: 0 };
    const shifted = createSky(sc);
    const noonMs = DAY_CYCLE_MS * 0.5;   // wherever noon falls, the two reads below are half a cycle apart
    shifted.update(1, cam, 0.016, noonMs);
    const y0 = shifted.sunDir.y;
    sc.clockOffset = DAY_CYCLE_MS / 2;
    shifted.update(1, cam, 0.016, noonMs);
    const y1 = shifted.sunDir.y;
    ck('the sky adds the scene clock offset, so the sun moves when the bench moves the clock',
      Math.abs(y0 - y1) > 0.5, `sun y ${y0.toFixed(2)} then ${y1.toFixed(2)}`);
  }

  // the clockless fallback: 60 frames of dt across a whole cycle
  const sky2 = createSky({ scene: new THREE.Scene() });
  let t = 0, rose = false, set = false, prevY = null;
  for (let i = 0; i < DAY_CYCLE_MS / 500; i++) {   // one whole cycle of half second frames
    t += 500;
    sky2.update(dayFactorAt(t), cam, 0.5);
    const y = sky2.sunDir.y;
    if (prevY != null) { if (prevY <= 0 && y > 0) rose = true; if (prevY >= 0 && y < 0) set = true; }
    prevY = y;
  }
  ck('without a clock the sun still rises and sets', rose && set);
  const drift = Math.abs(sky2.phase - phaseFromClock(t));
  // the fallback integrates dt evenly while the real clock warps the night into
  // a fifth of the cycle, so it drifts a few minutes over a 25 minute day; the
  // game passes the clock, so this path only has to keep the sun moving
  ck('and it stays within a tenth of a cycle of the clock over a full day',
    Math.min(drift, 1 - drift) < 0.15, `${(Math.min(drift, 1 - drift) * DAY_CYCLE_S).toFixed(1)} s`);
  sky2.dispose();

  sky.dispose();
  ck('dispose takes the group back out of the scene', !scene.children.includes(sky.group));
}

// -------------------------------------------------------------- the prose --

for (const f of ['src/game/sky.js', 'src/world/water.js']) {
  ck(`${f} has no em dashes`, !readFileSync(f, 'utf8').includes('—'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
