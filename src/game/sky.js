// The sky: one analytic dome, driven by the six minute day.
//
// Ported from the shaders in docs/reference/aqua-ocean-studio.jsx (the zenith
// and horizon gradient, the sun disc and its glare, the fbm cloud deck, the
// tone curve) and grown the rest of the way into a whole day: the sun rides an
// arc from below the horizon at midnight to high at noon, the palette runs
// night, dawn, gold, noon and back, stars come out in the shader, and the moon
// hangs opposite the sun.
//
//   const sky = createSky(sc);
//   sky.update(dayFactor, camera.position, dt, now);   // every frame
//   sc.scene.fog.color.copy(sky.colours.fog);
//
// Two things in here are shared on purpose:
//
//   SKY_GLSL   the glsl `skyCol(dir, withClouds)` the water reflects. water.js
//              concatenates this exact string, so there is one sky and not two
//              that drift apart.
//   skyColours a pure function of the day factor, no THREE and no renderer, so
//              the fog colour, the hemisphere light and any test can read the
//              palette without a canvas. src/game/sky.test.mjs drives it.
//
// The dome and the water both write `gl_FragColor` and then run three's own
// `<tonemapping_fragment>` and `<colorspace_fragment>` chunks, so they go
// through the SAME ACES curve and the SAME `renderer.toneMappingExposure` as
// the terrain's MeshStandardMaterial. Do not add a second tone curve in here.

import * as THREE from 'three';

/**
 * One full day. This has to equal scene.js's DAY_CYCLE_MS or the sun will
 * drift out of step with the light. sky.test.mjs imports both and compares.
 */
export const DAY_CYCLE_S = 360;

/** How high the sun climbs at noon, and how far below it sinks at midnight. */
export const MAX_ELEVATION = 1.05;      // radians, 60 degrees

/** Which way is noon. 0 puts the noon sun over +z, so it rises toward +x. */
export const NOON_AZIMUTH = 0.35;

/** Radius of the dome. Must stay inside scene.js's camera far plane (1800). */
export const SKY_RADIUS = 1500;

/**
 * The lowest the shadow casting light is allowed to sit. sin(0.25) is about
 * 14 degrees; below that a 2 m post throws an 8 m shadow, and scene.js's
 * shadow box is 55 m each way, so it starts to clip.
 */
export const SHADOW_MIN_Y = 0.25;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- palette --
//
// Keyframes on the day factor. scene.js's curve is a clamped cosine, so the
// day factor and the sun's elevation are one and the same number rescaled:
//
//   elevation = MAX_ELEVATION * ((d + 0.2) / 0.7 - 1)
//
// which is exactly 0 at d = 0.5. That is why the gold sits on 0.5: it is the
// moment the sun is on the horizon, not a guess.

const hx = (h) => ({ r: ((h >> 16) & 255) / 255, g: ((h >> 8) & 255) / 255, b: (h & 255) / 255 });

export const SKY_KEYS = [
  // d,    zenith,     horizon,    sun / moon, fog
  [0.00, 0x05070e, 0x0d1424, 0xaebbdd, 0x0a0f1c],
  [0.35, 0x16203c, 0x4a3a52, 0xff9a54, 0x23253c],
  [0.50, 0x3a4270, 0xffab5e, 0xff8a3c, 0x8a6a63],
  [0.65, 0x3f74b8, 0xffd9a8, 0xffc389, 0xb79f95],
  [1.00, 0x2f79d6, 0xdfefff, 0xfff3d6, 0xcfe0ee],
].map(([d, z, h, s, f]) => ({ d, zenith: hx(z), horizon: hx(h), sun: hx(s), fog: hx(f) }));

const mixc = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });

/** Rec. 709 luminance of an { r, g, b }. Used by the tests and by nothing else. */
export const luminance = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** How warm a colour reads: red over blue. Positive is warm. */
export const warmth = (c) => c.r - c.b;

/**
 * The sun's elevation for a day factor, in radians, negative below the
 * horizon. Saturates on the day and night plateaus, where the day factor has
 * stopped moving but the sun has not; sunPhase gives the unsaturated angle.
 */
export function elevationForDay(dayFactor) {
  const d = clamp01(dayFactor);
  return MAX_ELEVATION * clamp((d + 0.2) / 0.7 - 1, -1, 1);
}

/**
 * The palette at a moment of the day. Pure: numbers in, plain colours out, no
 * THREE, no renderer, no DOM. Components are sRGB in 0..1.
 */
export function skyColours(dayFactor, opts = {}) {
  const d = clamp01(dayFactor);
  let i = 0;
  while (i < SKY_KEYS.length - 2 && d > SKY_KEYS[i + 1].d) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  const t = b.d === a.d ? 0 : clamp01((d - a.d) / (b.d - a.d));
  const zenith = mixc(a.zenith, b.zenith, t);
  const horizon = mixc(a.horizon, b.horizon, t);
  const sun = mixc(a.sun, b.sun, t);
  const fog = mixc(a.fog, b.fog, t);
  // Glare peaks where the sun sits on the horizon and the air is long.
  const gold = 1 - Math.min(1, Math.abs(d - 0.5) / 0.28);
  return {
    zenith, horizon, sun, fog,
    glare: 0.45 + 0.35 * d + 0.5 * gold * gold,
    cloud: opts.cloud ?? 0.45,
    // stars are gone by the time the sun is a quarter of the way up
    star: 1 - smooth(0.02, 0.45, d),
    moon: 1 - smooth(0.12, 0.62, d),
    sunUp: smooth(0.42, 0.56, d),
    elevation: elevationForDay(d),
    day: d,
  };
}

function smooth(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

// ------------------------------------------------------------------ phase --
//
// The day factor alone cannot say whether it is morning or evening: the curve
// is symmetric, and it is flat for a quarter of the cycle at each end. The
// phase is the real clock position, 0 at midnight and 0.5 at noon, and it is
// what the sun's arc is drawn from.

/**
 * Phase straight off the game clock, which is the honest path: it agrees with
 * scene.js's dayFactorAt by construction because it inverts the same offset.
 */
export function phaseFromClock(nowMs, cycleS = DAY_CYCLE_S) {
  const tphase = (((nowMs / 1000 / cycleS) + 0.12) % 1 + 1) % 1;   // 0 is noon
  return (tphase + 0.5) % 1;
}

/**
 * Phase from the day factor alone, given which way the curve is going.
 * Exact wherever the curve is moving; on a plateau it returns the plateau
 * edge, which is why createSky integrates dt across the flat parts.
 */
export function phaseFromDay(dayFactor, rising) {
  const raw = clamp((clamp01(dayFactor) + 0.2) / 1.4, 0, 1);
  const a = Math.acos(clamp(2 * raw - 1, -1, 1)) / TAU;            // 0..0.5 from noon
  const tphase = rising ? 1 - a : a;
  return (tphase + 0.5) % 1;
}

/** The hour angle: 0 at noon, +-PI at midnight, positive in the afternoon. */
export function hourAngle(phase) {
  let t = (phase - 0.5) * TAU;
  while (t > Math.PI) t -= TAU;
  while (t < -Math.PI) t += TAU;
  return t;
}

/** Where the sun is. A unit vector pointing from the ground at the sun. */
export function sunDirectionAt(phase, maxEl = MAX_ELEVATION, noonAz = NOON_AZIMUTH) {
  const ha = hourAngle(phase);
  const el = maxEl * Math.cos(ha);
  const az = noonAz + ha;
  const ce = Math.cos(el);
  return { x: ce * Math.sin(az), y: Math.sin(el), z: ce * Math.cos(az), elevation: el, azimuth: az };
}

// ------------------------------------------------------------------- glsl --
//
// Shared with water.js. Everything here is a function of the uniforms below,
// so a material that concatenates this string and hands over these uniforms
// gets the same sky the dome paints.

export const SKY_GLSL = /* glsl */`
precision highp float;

uniform vec3 uZenith, uHorizon, uSunColor, uMoonColor, uSunDir, uMoonDir, uCamPos;
uniform float uGlare, uCloud, uTime, uDay, uStars, uMoonUp, uSunUp;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}

// One star per cell of a grid laid on the cube around the viewer, so the field
// is fixed to the sky and not to the screen. Ten cells in a hundred hold a
// star; the rest are empty black.
float starField(vec3 d){
  vec3 a = abs(d);
  vec2 uv; float face;
  if (a.x >= a.y && a.x >= a.z) { uv = d.yz / a.x; face = 0.0; }
  else if (a.y >= a.z) { uv = d.zx / a.y; face = 7.0; }
  else { uv = d.xy / a.z; face = 13.0; }
  vec2 g = uv * 110.0 + face * 31.0;
  vec2 ip = floor(g), fp = fract(g);
  float h = hash21(ip);
  if (h < 0.90) return 0.0;
  vec2 c = vec2(hash21(ip + 11.3), hash21(ip + 27.7));
  float mag = (h - 0.90) / 0.10;
  float tw = 0.72 + 0.28 * sin(uTime * (1.4 + mag * 3.1) + h * 40.0);
  // reversed-edge smoothstep is undefined in the spec, so it is written out
  return (1.0 - smoothstep(0.0, 0.17, length(fp - c))) * mag * tw;
}

vec3 skyCol(vec3 d, float withClouds){
  d = normalize(d);
  float t = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, pow(t, 0.38));
  if (d.y < 0.0) c = mix(uHorizon, uHorizon * 0.45, clamp(-d.y * 3.0, 0.0, 1.0));

  if (uStars > 0.002 && d.y > 0.0) {
    c += vec3(0.92, 0.95, 1.0) * starField(d) * uStars * smoothstep(0.0, 0.07, d.y);
  }

  vec3 M = normalize(uMoonDir);
  float m = max(dot(d, M), 0.0);
  c += uMoonColor * pow(m, 220.0) * 0.35 * uMoonUp;
  c += uMoonColor * smoothstep(0.9988, 0.9995, m) * 2.6 * uMoonUp;

  vec3 L = normalize(uSunDir);
  float s = max(dot(d, L), 0.0);
  c += uSunColor * pow(s, 6.0) * 0.22 * uGlare * uSunUp;
  c += uSunColor * pow(s, 64.0) * 0.35 * uGlare * uSunUp;
  c += uSunColor * smoothstep(0.9994, 0.9999, s) * 12.0 * uSunUp;

  if (withClouds > 0.5 && d.y > 0.0) {
    vec2 p = d.xz / (d.y + 0.15) * 1.6 + vec2(uTime * 0.006, uTime * 0.003);
    float n = fbm(p);
    float th = 0.78 - uCloud * 0.5;
    float cov = smoothstep(th, th + 0.22, n) * smoothstep(0.0, 0.12, d.y);
    vec3 lit = mix(vec3(1.0, 1.0, 1.02) * 1.1, vec3(0.62, 0.66, 0.74), smoothstep(th + 0.05, th + 0.42, n));
    // a cloud is only ever as bright as the day is, and it catches the low sun
    lit = mix(uHorizon * 0.55 + uMoonColor * 0.06 * uMoonUp, lit, 0.25 + 0.75 * uDay);
    lit *= (0.85 + 0.35 * pow(s, 2.0) * uSunUp);
    c = mix(c, lit, cov);
  }
  return c;
}
`;

export const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = /* glsl */`
varying vec3 vDir;
void main(){
  gl_FragColor = vec4(skyCol(vDir, 1.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Every uniform SKY_GLSL declares. water.js builds on top of this block. */
export function createSkyUniforms() {
  return {
    uZenith: { value: new THREE.Color(0x2f79d6) },
    uHorizon: { value: new THREE.Color(0xdfefff) },
    uSunColor: { value: new THREE.Color(0xfff3d6) },
    uMoonColor: { value: new THREE.Color(0xb9c6e6) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uCamPos: { value: new THREE.Vector3() },
    uGlare: { value: 0.6 },
    uCloud: { value: 0.45 },
    uTime: { value: 0 },
    uDay: { value: 1 },
    uStars: { value: 0 },
    uMoonUp: { value: 0 },
    uSunUp: { value: 1 },
  };
}

/** sRGB components in, a THREE.Color in the renderer's working space out. */
function setSRGB(col, c) {
  col.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
  return col;
}

// ------------------------------------------------------------------ build --

/**
 * The dome.
 *
 * `sc` is scene.js's return: this uses `sc.scene`, and `sc.sky` if it is there
 * (so the group world_runtime.js already hides on the way underground is the
 * one the dome lives in). scene.js's own two gradient domes, its sun ball, its
 * glow sprite and its moon have to be switched off by the caller: they sit at
 * radius 1500 and would paint straight over this one.
 */
export function createSky(sc, opts = {}) {
  const scene = sc.scene || sc;
  const radius = opts.radius ?? SKY_RADIUS;
  const uniforms = opts.uniforms || createSkyUniforms();
  let cloudCover = opts.cloud ?? 0.45;

  const geo = new THREE.SphereGeometry(radius, 48, 24);
  const material = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_GLSL + SKY_FRAG,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'sky-dome';
  mesh.frustumCulled = false;
  // first thing drawn, nothing in front of it, nothing writes depth
  mesh.renderOrder = -1000;

  // The name matters: world_runtime.js hides scene children called 'sky' when
  // you go underground, and it matches by name, not by identity.
  const group = new THREE.Group();
  group.name = opts.name ?? 'sky';
  group.add(mesh);
  scene.add(group);

  const colours = {
    zenith: new THREE.Color(), horizon: new THREE.Color(),
    sun: new THREE.Color(), fog: new THREE.Color(), moon: new THREE.Color(0xb9c6e6),
  };
  const sunDir = new THREE.Vector3(0, 1, 0);
  const moonDir = new THREE.Vector3(0, -1, 0);
  const lightDir = new THREE.Vector3(0, 1, 0);
  // The shadow light cannot follow the sun all the way down: a directional
  // light lying on the horizon throws shadows longer than scene.js's 55 m
  // shadow box, and they clip. This is the same direction with the elevation
  // floored, which is what sun.position should be placed along.
  const shadowDir = new THREE.Vector3(0, 1, 0);

  let time = opts.time ?? 0;
  let phase = 0.5;
  let lastDay = null;
  let rising = true;
  let palette = skyColours(1, { cloud: cloudCover });

  function setPhase(p) { phase = ((p % 1) + 1) % 1; }

  /**
   * dayFactor is scene.js's clamped cosine; camPos is the camera, not the
   * player, so the dome never gets closer on one side; dt is seconds; nowMs is
   * the same clock scene.js hands dayFactor, and giving it is the accurate
   * path. Without it the phase is inverted off the curve where the curve is
   * moving and integrated with dt across the flat noon and midnight, which
   * drifts if frames are dropped.
   */
  function update(dayFactor, camPos, dt = 0, nowMs = null) {
    const d = clamp01(dayFactor);
    time += Math.max(0, dt);

    if (nowMs != null && Number.isFinite(nowMs)) {
      setPhase(phaseFromClock(nowMs, opts.cycleS ?? DAY_CYCLE_S));
    } else {
      if (lastDay != null && Math.abs(d - lastDay) > 1e-7) rising = d > lastDay;
      if (d > 1e-6 && d < 1 - 1e-6) setPhase(phaseFromDay(d, rising));
      else setPhase(phase + Math.max(0, dt) / (opts.cycleS ?? DAY_CYCLE_S));
    }
    lastDay = d;

    const s = sunDirectionAt(phase, opts.maxElevation ?? MAX_ELEVATION, opts.noonAzimuth ?? NOON_AZIMUTH);
    sunDir.set(s.x, s.y, s.z);
    moonDir.set(-s.x, -s.y, -s.z);
    lightDir.copy(sunDir.y > 0 ? sunDir : moonDir);
    shadowDir.copy(lightDir);
    if (shadowDir.y < SHADOW_MIN_Y) {
      // raise it and shorten the horizontal part to match, so the result is
      // still a unit vector and its elevation really is the floor
      const h = Math.hypot(shadowDir.x, shadowDir.z) || 1;
      const want = Math.sqrt(1 - SHADOW_MIN_Y * SHADOW_MIN_Y) / h;
      shadowDir.set(shadowDir.x * want, SHADOW_MIN_Y, shadowDir.z * want);
    }

    palette = skyColours(d, { cloud: cloudCover });
    setSRGB(colours.zenith, palette.zenith);
    setSRGB(colours.horizon, palette.horizon);
    setSRGB(colours.sun, palette.sun);
    setSRGB(colours.fog, palette.fog);

    uniforms.uZenith.value.copy(colours.zenith);
    uniforms.uHorizon.value.copy(colours.horizon);
    uniforms.uSunColor.value.copy(colours.sun);
    uniforms.uMoonColor.value.copy(colours.moon);
    uniforms.uSunDir.value.copy(sunDir);
    uniforms.uMoonDir.value.copy(moonDir);
    uniforms.uGlare.value = palette.glare;
    uniforms.uCloud.value = palette.cloud;
    uniforms.uTime.value = time;
    uniforms.uDay.value = d;
    uniforms.uStars.value = palette.star;
    uniforms.uMoonUp.value = palette.moon * clamp01(moonDir.y * 4 + 0.25);
    uniforms.uSunUp.value = clamp01(sunDir.y * 6 + 0.28);

    if (camPos) {
      uniforms.uCamPos.value.set(camPos.x, camPos.y, camPos.z);
      // the group may be parented anywhere; put the dome on the camera in
      // whatever space the group is in
      group.updateWorldMatrix(true, false);
      group.worldToLocal(mesh.position.set(camPos.x, camPos.y, camPos.z));
    }
    return api;
  }

  const api = {
    group, mesh, material, uniforms, colours, sunDir, moonDir, lightDir, shadowDir,
    update,
    /** The palette as plain numbers, for the settings window and for tests. */
    get palette() { return palette; },
    get phase() { return phase; },
    get time() { return time; },
    setPhase,
    /** Cloud cover, 0 clear to 1 solid. The settings window turns this. */
    setCloud(v) {
      cloudCover = clamp01(v);
      update(lastDay ?? 1, null, 0, null);
      return cloudCover;
    },
    get cloud() { return cloudCover; },
    dispose() {
      group.remove(mesh);
      if (group.parent) group.parent.remove(group);
      geo.dispose();
      material.dispose();
    },
  };
  update(1, null, 0, null);
  return api;
}
