// The stage: renderer, sky, fog and the four lights that make a day.
//
// Lifted out of the farm's `_setup()` and the day/night block of `_animate`.
// The farm's version read its colours from whichever theme the player had
// picked. Brackenwake has one sky, so the palette is pinned to the meadow
// entry in THEMES and nothing here asks a theme a question again.
//
// Nothing in this file knows about the player, the camera rig, or the world.
// It owns the scene graph nodes it makes, and the names it gives them are the
// handle world_runtime.js uses to switch the overworld off when you go under
// the ground:
//
//   'sky'  - a group holding both sky domes, the sun disc, its glow, the moon
//   'sun-light' 'hemi-light' 'ambient-light' 'fill-light'
//
// Renaming any of those breaks the descent. There is a test for it.

import * as THREE from 'three';
import { dayFactorAt as dayClockFactor, DAY_CYCLE_MS } from './dayclock.js';
import { skyColours } from './sky.js';
import { THEMES } from '../farm/themes.js';
import { mulberry32, glowTexture } from '../farm/assets.js';

/** One full day to night to day again. Six minutes, per docs/OPEN-WORLD.md. */
// The length of a day and its curve live in dayclock.js, shared with the sky.
export { DAY_CYCLE_MS, NIGHT_FRACTION } from './dayclock.js';

/** The one sky. THEMES is a data table; this is the row we live in. */
export const PALETTE = THEMES.find((t) => t.id === 'meadow');

/** How far the fog reaches in the open. The streamed ring is 576 m. */
export const WORLD_FOG = { near: 90, far: 536 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The day curve, pure so it can be checked in node.
 *
 * A raw cosine spends almost all its time changing. This one is stretched by
 * 1.4 and pulled down by 0.2, then clamped, which buys a flat night and a flat
 * day with a short dawn and dusk between them. The 0.12 phase offset means
 * t = 0 is not midnight.
 */
export const dayFactorAt = dayClockFactor;

/**
 * The whole of the lighting, as a function of the day.
 *
 * Pure, no THREE, colours as linear-ish 0..1 triples, so the curve can be
 * checked in node and so anything else that wants to know what time it looks
 * like can ask without a renderer.
 *
 * Three stops, and everything is a straight lerp between the two that bracket
 * `d`. The middle stop is the whole reason this is not a single lerp: a sun
 * that goes from moonlight to noon in one interpolation is never orange, and a
 * day without an orange hour is a day nobody believes.
 *
 *   d = 0     night. A cold, low moon; a cold, low ambient; exposure pulled
 *             down so night reads as night through the ACES curve instead of
 *             as a grey day.
 *   d = DAWN  the low sun. Warm to the point of orange, half the noon
 *             intensity, exposure lifted so the warmth carries.
 *   d = 1     noon. Barely warm, full intensity, exposure at 1.
 *
 * Intensities are physical: three has had no legacy light mode since r165, so
 * these are irradiance multipliers and a directional light of 3.2 is a bright
 * clear noon against a hemisphere of 0.85.
 */
export const DAWN = 0.34;

const STOPS = [
  // Midnight is moonlit, not black: seen in the browser at the old numbers the
  // ground vanished and only the leaves against the sky were left to steer by.
  // The moon is a light source: the sun lamp points along the moon by night
  // (sky.shadowDir) and carries this cool light. The user could not see the
  // ground at the first numbers; these read as a bright moonlit night.
  { d: 0, exposure: 0.92,
    sun: { c: [0.42, 0.50, 0.72], i: 0.70 },
    hemi: { sky: [0.16, 0.22, 0.40], ground: [0.07, 0.08, 0.11], i: 0.50 },
    ambient: { c: [0.24, 0.32, 0.50], i: 0.14 },
    fill: { c: [0.24, 0.34, 0.58], i: 0.16 } },
  { d: DAWN, exposure: 1.14,
    sun: { c: [1.00, 0.52, 0.24], i: 1.45 },
    hemi: { sky: [0.55, 0.45, 0.52], ground: [0.34, 0.24, 0.18], i: 0.48 },
    ambient: { c: [0.72, 0.52, 0.42], i: 0.10 },
    fill: { c: [0.42, 0.46, 0.70], i: 0.20 } },
  // The shade at noon is a stop and a half under the sun, not three: seen from
  // the north with the sun in the south the whole character went to black
  // against grass that is lit from above everywhere. A dark leather cloak has
  // to read as brown from its shaded side.
  { d: 1, exposure: 1.0,
    sun: { c: [1.00, 0.95, 0.86], i: 3.0 },
    hemi: { sky: [0.60, 0.76, 1.00], ground: [0.46, 0.39, 0.30], i: 1.35 },
    ambient: { c: [1.00, 0.93, 0.84], i: 0.30 },
    fill: { c: [0.62, 0.72, 1.00], i: 0.50 } },
];

const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function lightingAt(dayFactor) {
  const d = clamp01(dayFactor);
  const lo = d <= DAWN ? STOPS[0] : STOPS[1];
  const hi = d <= DAWN ? STOPS[1] : STOPS[2];
  const t = (d - lo.d) / (hi.d - lo.d);
  return {
    day: d,
    exposure: lo.exposure + (hi.exposure - lo.exposure) * t,
    sun: { color: mix3(lo.sun.c, hi.sun.c, t), intensity: lo.sun.i + (hi.sun.i - lo.sun.i) * t },
    hemi: {
      sky: mix3(lo.hemi.sky, hi.hemi.sky, t),
      ground: mix3(lo.hemi.ground, hi.hemi.ground, t),
      intensity: lo.hemi.i + (hi.hemi.i - lo.hemi.i) * t,
    },
    ambient: { color: mix3(lo.ambient.c, hi.ambient.c, t), intensity: lo.ambient.i + (hi.ambient.i - lo.ambient.i) * t },
    fill: { color: mix3(lo.fill.c, hi.fill.c, t), intensity: lo.fill.i + (hi.fill.i - lo.fill.i) * t },
  };
}

/** How much light the ground actually receives, for comparing two times. */
export function litness(dayFactor) {
  const L = lightingAt(dayFactor);
  return (L.sun.intensity * 0.72 + L.hemi.intensity + L.ambient.intensity + L.fill.intensity * 0.4) * L.exposure;
}

/** Warmth of the sun at a time of day: red over blue, 1 is neutral. */
export function sunWarmth(dayFactor) {
  const c = lightingAt(dayFactor).sun.color;
  return c[0] / Math.max(c[2], 1e-4);
}

/**
 * Put the curve on the lights. This is the whole of what setDay does to the
 * lighting, lifted out so a node test can drive it with real THREE lights and
 * a stand-in renderer and see the numbers that actually land, rather than a
 * copy of the arithmetic.
 *
 * @param {{renderer?:object, sun:object, hemi:object, ambient:object, fill:object}} rig
 * @param {number} dayFactor
 * @returns {object} the lighting it applied
 */
export function applyLighting(rig, dayFactor) {
  const L = lightingAt(dayFactor);
  if (rig.renderer) rig.renderer.toneMappingExposure = L.exposure;
  rig.sun.intensity = L.sun.intensity;
  rig.sun.color.setRGB(L.sun.color[0], L.sun.color[1], L.sun.color[2]);
  rig.hemi.intensity = L.hemi.intensity;
  rig.hemi.color.setRGB(L.hemi.sky[0], L.hemi.sky[1], L.hemi.sky[2]);
  rig.hemi.groundColor.setRGB(L.hemi.ground[0], L.hemi.ground[1], L.hemi.ground[2]);
  rig.ambient.intensity = L.ambient.intensity;
  rig.ambient.color.setRGB(L.ambient.color[0], L.ambient.color[1], L.ambient.color[2]);
  rig.fill.intensity = L.fill.intensity;
  rig.fill.color.setRGB(L.fill.color[0], L.fill.color[1], L.fill.color[2]);
  return L;
}

/** How far the shadow box reaches around the player, each way, in metres. */
export const SHADOW_BOX = 55;
export const SHADOW_MAP = 2048;

/** A vertical gradient painted to a canvas, optionally salted with stars. */
export function skyGradientTexture(stops, withStars = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 512);
  if (withStars) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const rng = mulberry32(7);
    for (let i = 0; i < 90; i++) {
      const y = rng() * 300;
      ctx.globalAlpha = 0.3 + rng() * 0.7;
      ctx.fillRect(rng() * 64, y, rng() > 0.85 ? 2 : 1, rng() > 0.85 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createScene(container) {
  const w = container.clientWidth || 800, h = container.clientHeight || 600;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  // PCF, not PCFSoft: three r185 deprecated PCFSoftShadowMap and silently
  // rewrites it to this on the first shadow pass, warning once as it goes.
  // Asking for the deprecated one gets the same 3x3 kernel plus a warning,
  // so ask for what you get. One shadow texel is 0.054 m at SHADOW_BOX and
  // SHADOW_MAP, which puts the penumbra at about 0.16 m.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Filmic, and sRGB on the way out. Everything the ground material generates
  // is authored in sRGB and decoded by the sampler, so the whole chain from
  // texture byte to pixel is linear in the middle and sRGB at both ends.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMappingExposure = lightingAt(1).exposure;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const TC = PALETTE.colors;
  const fogDay = new THREE.Color(TC.fogDay);
  const fogNight = new THREE.Color(TC.fogNight);
  scene.fog = new THREE.Fog(TC.fogDay, WORLD_FOG.near, WORLD_FOG.far);
  // a solid colour behind everything, so no angle finds a black gap
  scene.background = new THREE.Color(PALETTE.skyDay[1]);

  // ---- sky: two domes crossfaded by the day, plus the two lamps in it ----
  const sky = new THREE.Group();
  sky.name = 'sky';
  scene.add(sky);

  const skyDayMat = new THREE.MeshBasicMaterial({
    map: skyGradientTexture(PALETTE.skyDay), side: THREE.BackSide, fog: false, transparent: true, depthWrite: false,
  });
  const skyNightMat = new THREE.MeshBasicMaterial({
    map: skyGradientTexture(PALETTE.skyNight, true), side: THREE.BackSide, fog: false, transparent: true, depthWrite: false, opacity: 0,
  });
  const skyDomes = [
    new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 16), skyNightMat),
    new THREE.Mesh(new THREE.SphereGeometry(1495, 24, 16), skyDayMat),
  ];
  sky.add(...skyDomes);

  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(9, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false, transparent: true })
  );
  sunBall.position.set(240, 200, -190);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('255,240,190'), transparent: true, opacity: 0.8, depthWrite: false, fog: false,
  }));
  sunGlow.scale.setScalar(90);
  sunGlow.position.copy(sunBall.position);
  // the moon rises opposite the sun
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(7, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xe8ecf5, fog: false, transparent: true, opacity: 0 })
  );
  moon.position.set(-240, 190, 170);
  sky.add(sunBall, sunGlow, moon);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0xbfe0ff, 0xa98a63, 0.9);
  hemi.name = 'hemi-light';
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffe8d0, 0.22);
  ambient.name = 'ambient-light';
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(TC.sunDay, 2.4);
  sun.name = 'sun-light';
  sun.position.set(90, 120, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  // The farm sized this box to its island. A third person camera never sees
  // more than the near ring of chunks, so 55 m each way around the player is
  // the whole of what can cast a shadow you would notice. The light sits
  // 158 m from the target, so near and far bracket that instead of running
  // 20 to 400 and spending the depth buffer on empty space.
  const SB = SHADOW_BOX;
  Object.assign(sun.shadow.camera, { left: -SB, right: SB, top: SB, bottom: -SB, near: 40, far: 300 });
  // One shadow texel is 2 * 55 / 2048 = 0.054 m. normalBias pushes the lookup
  // along the surface normal by half of that, which is what stops a curved
  // caster shadowing itself in stripes; the constant bias then only has to
  // cover the flat case, so it can be small enough not to detach a shadow
  // from the foot that casts it.
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.03;
  sun.target.name = 'sun-target';
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0x9fc0ff, 0.4);
  fill.name = 'fill-light';
  fill.position.set(-70, 40, -80);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 1800);
  camera.position.set(0, 8, 12);

  // While the fog colour is pinned (underground) the day/night pass leaves it
  // alone. setFog with a colour pins; setFog without one hands it back.
  let fogPinned = false;
  let day = 1;

  function setFog(near, far, colorHex) {
    scene.fog.near = near;
    scene.fog.far = far;
    if (colorHex != null) { scene.fog.color.setHex(colorHex); fogPinned = true; }
    else fogPinned = false;
  }

  // The analytic sky (sky.js) paints the dome and the fog colour now; the
  // painted domes, sun disc and moon below stay built for the tests and for a
  // build without sky.js, and `useAnalyticSky(true)` hides them.
  let analytic = false;
  function useAnalyticSky(on) {
    analytic = !!on;
    for (const o of [...skyDomes, sunBall, sunGlow, moon]) o.visible = !analytic;
  }

  let clockOffset = 0;   // ms added to the frame clock, for the dev bench's time of day

  function setDay(dayFactor) {
    const d = clamp01(dayFactor);
    day = d;
    applyLighting({ renderer, sun, hemi, ambient, fill }, d);
    if (!fogPinned) {
      // the fog meets the dome; the hemisphere keeps applyLighting's calibrated
      // colours (tinting it by the zenith on top of that darkened every
      // shadowed face to near black in the browser)
      if (analytic) {
        const p = skyColours(d);
        scene.fog.color.setRGB(p.fog.r, p.fog.g, p.fog.b, THREE.SRGBColorSpace);
      } else scene.fog.color.lerpColors(fogNight, fogDay, d);
    }
    skyDayMat.opacity = d;
    sunBall.material.opacity = d;
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    sunGlow.material.opacity = 0.8 * d * (0.9 + 0.1 * Math.sin(t / 2400));
    moon.material.opacity = (1 - d) * 0.95;
  }

  // The sky is painted at a fixed offset from whatever it is told to follow,
  // so it never gets closer and the shadow box stays under the player. The sun
  // light sits along `sunDir` (sky.shadowDir when the analytic sky runs, the
  // old fixed offset otherwise) so shadows swing with the day.
  const sunDir = new THREE.Vector3(90, 120, 50).normalize();
  function setSunDir(dir) { if (dir) sunDir.set(dir.x, dir.y, dir.z).normalize(); }
  function follow(pos) {
    sky.position.set(pos.x, pos.y, pos.z);
    sun.position.set(pos.x, pos.y, pos.z).addScaledVector(sunDir, 160);
    sun.target.position.set(pos.x, pos.y, pos.z);
    sun.target.updateMatrixWorld();
  }

  function resize() {
    const w2 = container.clientWidth || w, h2 = container.clientHeight || h;
    camera.aspect = w2 / h2;
    camera.updateProjectionMatrix();
    renderer.setSize(w2, h2);
  }
  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  setDay(1);

  return {
    renderer, scene, camera,
    lights: { sun, hemi, ambient, fill },
    sky, skyDomes,
    setDay, setFog, follow, resize, useAnalyticSky, setSunDir,
    get analyticSky() { return analytic; },
    render() { renderer.render(scene, camera); },
    /**
     * The clock the sky and the lights read. The dev bench moves it with
     * setClockOffset(ms) so a tester can see noon at midnight; the sky adds
     * the same offset to the frame clock it is handed, so the sun in the dome
     * and the light on the ground never disagree.
     */
    dayFactor(nowMs) { return dayFactorAt(nowMs + clockOffset); },
    get clockOffset() { return clockOffset; },
    setClockOffset(ms) { clockOffset = Number.isFinite(ms) ? ms : 0; },
    /** The curve setDay just applied, for anything that wants to match it. */
    lightingAt, applyLighting,
    get day() { return day; },
    get fogPinned() { return fogPinned; },
    dispose() {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
