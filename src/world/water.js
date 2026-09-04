// The sea, the lakes and the flooded rivers: one surface, six Gerstner waves,
// the sky reflected off it and the world refracted through it.
//
//   const water = createWater(sc, field, { sky });
//   // every frame, after sky.update and before sc.render():
//   water.update(dt, sc.camera.position, sky.sunDir, sky.colours, now / 1000);
//   water.beforeRender(sc.renderer, sc.scene, sc.camera);
//   sc.render();
//
// Ported from docs/reference/aqua-ocean-studio.jsx: the six wave Gerstner sum,
// the camera relative warped grid, the fresnel mix of reflection and
// refraction, the subsurface light on the back of a crest, the crest and shore
// foam, and the underwater branch. What is not ported is the studio's
// interactive ripple simulation (nothing in the game drops stones yet) and its
// analytic `seabed()`: this world has a real one, so the water column is read
// off a depth texture rendered with the scene.
//
// Where the water is
// ------------------
// field.js carves every river core down to y = -1.8 and the sea floor to -14,
// while SEA_LEVEL is -0.8. So one plane at sea level floods the ocean, every
// river and every hollow the field cuts below it, and there is no lake in this
// world that sits above sea level. `addPool` exists for the day there is one.
//
// The sky
// -------
// `skyCol` comes from src/game/sky.js as a string, so the colour the water
// reflects and the colour the dome paints are the same function of the same
// uniforms. Both materials finish on three's own tonemapping and colorspace
// chunks, which means the renderer's ACES curve and toneMappingExposure, the
// same ones the terrain gets. Neither material carries a second tone curve.

import * as THREE from 'three';
import { SKY_GLSL, createSkyUniforms } from '../game/sky.js';

/**
 * The six waves, as [angle in radians, wavelength in metres, amplitude].
 * The GLSL `waveParam` below carries the same table; water.test.mjs parses the
 * shader source and compares it to this array, because two copies of a number
 * are two chances to be wrong.
 */
export const WAVES = [
  [0.00, 42.0, 1.00],
  [0.40, 27.0, 0.60],
  [-0.54, 17.0, 0.40],
  [0.96, 9.5, 0.22],
  [-1.22, 5.5, 0.12],
  [1.92, 3.2, 0.07],
];

/** Sum of the amplitudes: the crest of a wave is this times waveHeight. */
export const AMPLITUDE_SUM = WAVES.reduce((a, w) => a + w[2], 0);

/**
 * A coast, not the open ocean the studio defaults to. waveHeight 0.3 puts the
 * crest 0.72 m above the flat, which is 1.45 m peak to trough: enough to see
 * against a beach, small enough that a shoreline does not swallow itself.
 */
export const WAVE_DEFAULTS = {
  height: 0.30,      // uWaveH
  steep: 0.45,       // uSteep, how far a crest leans over
  scale: 0.85,       // uWaveScale, multiplies every wavelength
  windDir: 0.61,     // uWindDir, radians added to every wave angle (35 degrees)
  speed: 0.9,        // uSpeed
};

/**
 * Quality presets. `grid` is the vertex count per side of the ocean sheet,
 * `rtScale` the fraction of the drawing buffer the refraction pass runs at.
 * 'low' does no second pass at all, which also costs it the depth texture, so
 * it has no shore foam and no depth shading: crest foam and a colour
 * approximation only. That is the trade, stated out loud.
 */
export const QUALITY = {
  high: { grid: 192, refraction: true, rtScale: 0.5, detail: 0.9 },
  medium: { grid: 128, refraction: true, rtScale: 0.35, detail: 0.7 },
  low: { grid: 96, refraction: false, rtScale: 0, detail: 0.45 },
};

/** How far the sheet reaches. Inside scene.js's camera far plane of 1800. */
export const WATER_FAR = 1200;
/** The exponent that packs vertices toward the camera. */
export const WATER_WARP = 2.2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------ wave maths --
//
// The JS mirror of the GLSL `gerstner`. Same table, same order, same
// arithmetic, so buoyancy, the underwater test and anything else on the CPU
// agrees with what the vertex shader drew.

/**
 * Where the surface at flat position (x, z) actually is at time t.
 * Returns the displacement, the normal, and J, the fold term the shader uses
 * to find crests (J below 1 means the surface is pinching).
 */
export function gerstnerAt(x, z, t, p = WAVE_DEFAULTS) {
  const wh = p.height ?? WAVE_DEFAULTS.height;
  const st = p.steep ?? WAVE_DEFAULTS.steep;
  const ws = p.scale ?? WAVE_DEFAULTS.scale;
  const wd = p.windDir ?? WAVE_DEFAULTS.windDir;
  const sp = p.speed ?? WAVE_DEFAULTS.speed;
  let dx = 0, dy = 0, dz = 0, nx = 0, ny = 1, nz = 0, J = 1;
  for (let i = 0; i < 6; i++) {
    const ang = WAVES[i][0] + wd;
    const len = WAVES[i][1] * ws;
    const amp = WAVES[i][2] * wh;
    const ddx = Math.cos(ang), ddz = Math.sin(ang);
    const k = 6.2831853 / len;
    const w = Math.sqrt(9.81 * k) * sp;
    const qa = (st / (k * 6)) * clamp(amp * k * 3, 0, 1);
    const th = k * (ddx * x + ddz * z) - w * t + i * 1.7;
    const s = Math.sin(th), c = Math.cos(th);
    dx += qa * ddx * c; dz += qa * ddz * c; dy += amp * s;
    nx -= ddx * k * amp * c; nz -= ddz * k * amp * c;
    ny -= k * qa * s; J -= k * qa * s;
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return { dx, dy, dz, nx: nx / l, ny: ny / l, nz: nz / l, J };
}

/** How far the surface stands above its flat level at (x, z), in metres. */
export function waveHeightAt(x, z, t, p = WAVE_DEFAULTS) {
  return gerstnerAt(x, z, t, p).dy;
}

/**
 * The vertex shader's grid warp, in JS: a grid coordinate in -1..1 becomes a
 * distance from the camera. Exported so the density claim in V1.md is a
 * measurement and not a hope.
 */
export function gridWarp(g, far = WATER_FAR, warp = WATER_WARP) {
  return Math.sign(g) * Math.pow(Math.abs(g), warp) * far;
}

/** Vertex spacing, in metres, at a given distance from the camera. */
export function spacingAt(distance, grid, far = WATER_FAR, warp = WATER_WARP) {
  const g = Math.pow(clamp(distance / far, 0, 1), 1 / warp);
  const dg = 2 / (grid - 1);
  return Math.abs(gridWarp(g + dg, far, warp) - gridWarp(g, far, warp));
}

// ------------------------------------------------------------------- glsl --

export const WAVE_GLSL = /* glsl */`
uniform float uWaveH, uSteep, uWaveScale, uWindDir, uSpeed;

void waveParam(int i, out float ang, out float len, out float amp){
  if (i == 0)      { ang =  0.00; len = 42.0; amp = 1.00; }
  else if (i == 1) { ang =  0.40; len = 27.0; amp = 0.60; }
  else if (i == 2) { ang = -0.54; len = 17.0; amp = 0.40; }
  else if (i == 3) { ang =  0.96; len =  9.5; amp = 0.22; }
  else if (i == 4) { ang = -1.22; len =  5.5; amp = 0.12; }
  else             { ang =  1.92; len =  3.2; amp = 0.07; }
}

void gerstner(vec2 p, out vec3 disp, out vec3 nrm, out float J){
  disp = vec3(0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
  J = 1.0;
  for (int i = 0; i < 6; i++) {
    float ang, len, amp;
    waveParam(i, ang, len, amp);
    ang += uWindDir; len *= uWaveScale; amp *= uWaveH;
    vec2 d = vec2(cos(ang), sin(ang));
    float k = 6.2831853 / len;
    float w = sqrt(9.81 * k) * uSpeed;
    float qa = uSteep / (k * 6.0) * clamp(amp * k * 3.0, 0.0, 1.0);
    float th = k * dot(d, p) - w * uTime + float(i) * 1.7;
    float s = sin(th), c = cos(th);
    disp.xz += qa * d * c;
    disp.y += amp * s;
    n.xz -= d * k * amp * c;
    n.y -= k * qa * s;
    J -= k * qa * s;
  }
  nrm = normalize(n);
}
`;

/** The sheet that follows the camera: dense underfoot, coarse at the horizon. */
export const OCEAN_VERT = /* glsl */`
uniform float uFar, uSeaY, uWarp;
varying vec3 vWorld;
varying vec2 vBase;
varying float vViewZ;
void main(){
  vec2 g = position.xz;
  vec2 w = uCamPos.xz + sign(g) * pow(abs(g), vec2(uWarp)) * uFar;
  vec3 disp, n; float J;
  gerstner(w, disp, n, J);
  vec3 p = vec3(w.x, uSeaY, w.y) + disp;
  vWorld = p; vBase = w;
  vec4 vp = viewMatrix * vec4(p, 1.0);
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
}
`;

/** A pool or a river ribbon: an ordinary mesh, wearing its own transform. */
export const PLANE_VERT = /* glsl */`
uniform float uSeaY;
varying vec3 vWorld;
varying vec2 vBase;
varying float vViewZ;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 disp, n; float J;
  gerstner(wp.xz, disp, n, J);
  vec3 p = wp.xyz + disp;
  vWorld = p; vBase = wp.xz;
  vec4 vp = viewMatrix * vec4(p, 1.0);
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
}
`;

export const WATER_FRAG = /* glsl */`
uniform sampler2D uScene, uSceneDepth;
uniform vec2 uResolution;
uniform vec3 uDeep, uShallow, uFogColor;
uniform float uDetail, uReflect, uRefract, uFoam, uSSS, uMurk, uHasDepth,
              uCamNear, uCamFar, uFogNear, uFogFar, uShoreDepth, uSeaY,
              uFlowX, uFlowZ, uUnder;
varying vec3 vWorld;
varying vec2 vBase;
varying float vViewZ;

float detailH(vec2 q){
  vec2 fl = vec2(uFlowX, uFlowZ) * uTime;
  return vnoise((q + fl) * 1.1 + uTime * vec2(0.23, 0.14) * uSpeed) * 0.6
       + vnoise((q + fl) * 2.7 - uTime * vec2(0.12, 0.21) * uSpeed) * 0.4;
}

// Eye space distance to whatever the scene pass put behind this pixel.
float sceneEyeDepth(vec2 uv){
  float z = texture2D(uSceneDepth, uv).x;
  float ndc = z * 2.0 - 1.0;
  return (2.0 * uCamNear * uCamFar) / (uCamFar + uCamNear - ndc * (uCamFar - uCamNear));
}

void main(){
  vec3 dd, nG; float J;
  gerstner(vBase, dd, nG, J);

  vec3 toCam = uCamPos - vWorld;
  float dist = max(length(toCam), 1e-4);
  vec3 V = toCam / dist;

  // ripple detail, faded out with distance so the far water does not fizz
  float e = 0.06;
  float h0 = detailH(vWorld.xz);
  float hA = detailH(vWorld.xz + vec2(e, 0.0));
  float hB = detailH(vWorld.xz + vec2(0.0, e));
  float dfade = uDetail * 0.35 / (1.0 + dist * 0.025);
  vec3 n = normalize(nG + vec3(-(hA - h0) / e * dfade, 0.0, -(hB - h0) / e * dfade));

  vec3 L = normalize(uSunDir);
  vec3 Lm = normalize(uMoonDir);
  vec2 suv = gl_FragCoord.xy / uResolution;

  // How much water the eye looks through. The depth buffer gives the distance
  // along the view ray; the vertical drop is that times how steeply the ray
  // goes down, floored so the horizon does not read as a beach.
  float depth = uShoreDepth * 4.0;
  if (uHasDepth > 0.5) {
    float column = max(sceneEyeDepth(suv) - vViewZ, 0.0);
    depth = column * clamp(abs(V.y), 0.22, 1.0);
  }

  vec3 col;
  if (gl_FrontFacing) {
    vec3 R = reflect(-V, n);
    R.y = max(R.y, 0.02);
    vec3 refl = skyCol(R, 1.0);

    vec3 T = refract(-V, n, 0.75);
    float path = depth / max(-T.y, 0.25);
    vec3 trans = exp(-path * vec3(0.34, 0.12, 0.075) * uMurk);
    vec3 body = mix(uDeep, uShallow, exp(-depth * 0.22 * uMurk));

    vec3 sceneC = body;
    if (uHasDepth > 0.5) {
      vec2 ruv = clamp(suv + n.xz * uRefract / (1.0 + dist * 0.04), 0.001, 0.999);
      // never drag something standing IN FRONT of the water into the water:
      // that is the halo around a player's shins in the shallows
      if (sceneEyeDepth(ruv) < vViewZ) ruv = suv;
      sceneC = texture2D(uScene, ruv).rgb;
    }
    vec3 refrCol = mix(body, sceneC, trans);

    float F = clamp(0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0), 0.0, 1.0) * uReflect;
    col = mix(refrCol, refl, F);

    // light coming through the back of a crest
    float back = max(dot(V, -L), 0.0);
    float hgt = clamp((vWorld.y - uSeaY) / max(uWaveH, 0.05) * 0.5 + 0.35, 0.0, 1.0);
    float sss = (pow(back, 3.0) * 1.2 + 0.12) * hgt * uSSS;
    col += uShallow * sss * (1.0 - F) * 0.8 * max(uSunUp, uMoonUp * 0.25);

    // the glitter path, under the sun by day and under the moon at night
    vec3 H = normalize(L + V);
    float nh = max(dot(n, H), 0.0);
    col += uSunColor * (pow(nh, 1200.0) * 4.0 + pow(nh, 120.0) * 0.15) * uGlare * uSunUp;
    vec3 Hm = normalize(Lm + V);
    float nm = max(dot(n, Hm), 0.0);
    col += uMoonColor * (pow(nm, 900.0) * 1.2 + pow(nm, 90.0) * 0.05) * uMoonUp;

    // foam: where the gerstner sum folds, and where the bottom comes up
    // J falls below 1 where the sum folds. Written with rising edges because
    // smoothstep with edge0 > edge1 is undefined in the GLSL spec.
    float crest = 1.0 - smoothstep(1.0 - uSteep * 0.95, 1.0 - uSteep * 0.45, J);
    float fn = fbm(vWorld.xz * 0.3 + vec2(uTime * 0.04, -uTime * 0.02));
    float foam = crest * smoothstep(0.32, 0.68, fn + crest * 0.3);
    if (uHasDepth > 0.5) {
      float shore = (1.0 - smoothstep(0.05, uShoreDepth, depth))
        * smoothstep(0.38, 0.72, fn * 0.7 + fbm(vWorld.xz * 0.9 + uTime * vec2(0.2, -0.13)) * 0.6)
        / (1.0 + dist * 0.012);
      foam += shore;
    }
    foam = clamp(foam * uFoam, 0.0, 1.0);
    vec3 foamCol = vec3(0.90, 0.94, 0.97) * (0.35 + 0.65 * max(dot(n, L), 0.0) * uSunUp) + uHorizon * 0.25;
    col = mix(col, foamCol, foam);
  } else {
    // the underside, seen by a camera below the surface
    vec3 nb = -n;
    vec3 T = refract(-V, nb, 1.333);
    if (dot(T, T) < 0.001) col = uDeep * 0.4;                 // total internal reflection
    else col = skyCol(T, 1.0) * vec3(0.55, 0.80, 1.0) * 0.9;
    float F = clamp(0.02 + 0.98 * pow(1.0 - max(dot(nb, V), 0.0), 5.0), 0.0, 1.0);
    col = mix(col, uDeep * 0.4, F * 0.8);
  }

  // Distance haze. Above the surface this is the SAME linear fog the terrain
  // wears, read off scene.fog, so land and sea vanish on the same line.
  if (uUnder > 0.5) {
    col = mix(col, uDeep * 0.32, 1.0 - exp(-dist * 0.05 * uMurk));
  } else {
    col = mix(col, uFogColor, clamp((dist - uFogNear) / max(uFogFar - uFogNear, 1e-4), 0.0, 1.0));
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Everything WATER_FRAG and the two vertex shaders declare on their own. */
export function createWaterUniforms(seaY) {
  return {
    uScene: { value: null },
    uSceneDepth: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uDeep: { value: new THREE.Color(0x0b3550) },
    uShallow: { value: new THREE.Color(0x2f9c98) },
    uFogColor: { value: new THREE.Color(0xcfe0ee) },
    uDetail: { value: QUALITY.high.detail },
    uReflect: { value: 1.0 },
    uRefract: { value: 0.055 },
    uFoam: { value: 0.6 },    // 0.85 painted a metre deep river white from bank to bank
    uSSS: { value: 0.8 },
    uMurk: { value: 0.9 },
    uHasDepth: { value: 0 },
    uCamNear: { value: 0.1 },
    uCamFar: { value: 1800 },
    uFogNear: { value: 90 },
    uFogFar: { value: 536 },
    uShoreDepth: { value: 0.45 },   // foam is a rim on the beach, not the whole shallows
    uSeaY: { value: seaY },
    uFlowX: { value: 0 },
    uFlowZ: { value: 0 },
    uUnder: { value: 0 },
    uFar: { value: WATER_FAR },
    uWarp: { value: WATER_WARP },
    uWaveH: { value: WAVE_DEFAULTS.height },
    uSteep: { value: WAVE_DEFAULTS.steep },
    uWaveScale: { value: WAVE_DEFAULTS.scale },
    uWindDir: { value: WAVE_DEFAULTS.windDir },
    uSpeed: { value: WAVE_DEFAULTS.speed },
  };
}

/** The sheet, in grid space: a unit square that the vertex shader stretches. */
export function buildOceanGeometry(grid) {
  const g = new THREE.PlaneGeometry(2, 2, grid - 1, grid - 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

// ------------------------------------------------------------------ build --

/**
 * `sc` is scene.js's return (scene, renderer, camera). `field` is
 * world/field.js, read for its sea level and, on the CPU, for nothing else.
 *
 * The group is named 'water' on purpose: world_runtime.js hides the overworld
 * by name when you go underground, and 'water' has to be in its SKY_AND_LIGHTS
 * set or the ocean hangs in the dungeon. See docs/mmo/wiring/V1.md.
 */
export function createWater(sc, field, opts = {}) {
  const scene = sc.scene || sc;
  const skyUniforms = opts.sky ? opts.sky.uniforms : (opts.skyUniforms || createSkyUniforms());
  const ownsSky = !opts.sky && !opts.skyUniforms;
  let seaY = opts.seaLevel ?? (field && field.seaLevel != null ? field.seaLevel : -0.8);

  const own = createWaterUniforms(seaY);
  if (opts.far != null) own.uFar.value = opts.far;
  const uniforms = Object.assign({}, skyUniforms, own);

  let quality = QUALITY[opts.quality] ? opts.quality : 'high';
  let preset = QUALITY[quality];
  uniforms.uDetail.value = preset.detail;

  const group = new THREE.Group();
  group.name = opts.name ?? 'water';
  scene.add(group);

  const common = SKY_GLSL + WAVE_GLSL;
  const material = new THREE.ShaderMaterial({
    vertexShader: common + OCEAN_VERT,
    fragmentShader: common + WATER_FRAG,
    uniforms,
    side: THREE.DoubleSide,
    fog: false,
  });
  material.name = 'ocean';

  let geometry = buildOceanGeometry(preset.grid);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ocean';
  mesh.frustumCulled = false;        // the vertex shader moves it, not the matrix
  mesh.renderOrder = 5;              // after the terrain, so its depth is written
  group.add(mesh);

  // Extra surfaces: pools above sea level and river ribbons. They share every
  // uniform slot except the handful that has to differ, so there is still one
  // place that writes the scene texture and the sky.
  const extras = [];
  function planeMaterial(over) {
    const u = Object.assign({}, uniforms, over);
    const m = new THREE.ShaderMaterial({
      vertexShader: common + PLANE_VERT,
      fragmentShader: common + WATER_FRAG,
      uniforms: u,
      side: THREE.DoubleSide,
      fog: false,
    });
    extras.push(m);
    return m;
  }

  // ---------------------------------------------------------- the passes --

  let rt = null;
  const manageShadows = opts.manageShadows !== false;
  let shadowsHeld = false;
  const sizeTmp = new THREE.Vector2();
  const stats = { passes: 0, skipped: 0, rtPixels: 0, mainPixels: 0, verts: preset.grid * preset.grid };

  function makeTarget() {
    if (!preset.refraction) return null;
    const t = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });
    t.depthTexture = new THREE.DepthTexture(2, 2);
    t.depthTexture.type = THREE.UnsignedIntType;
    t.depthTexture.format = THREE.DepthFormat;
    t.depthTexture.minFilter = THREE.NearestFilter;
    t.depthTexture.magFilter = THREE.NearestFilter;
    return t;
  }
  rt = makeTarget();

  /**
   * The refraction pass. Renders the scene without the water into a half
   * resolution target with a depth attachment, then hands both to the shader.
   * Call it after update and immediately before the main render.
   *
   * Returns true if it did a pass, false if it skipped (low quality, or the
   * water is switched off because you are underground).
   */
  function beforeRender(renderer, sceneArg, camera) {
    const sc2 = sceneArg || scene;
    if (!preset.refraction || !rt || !group.visible) {
      uniforms.uHasDepth.value = 0;
      stats.skipped++;
      // whatever the last pass borrowed has to go back, or the shadows on a
      // low quality machine freeze the moment the sun moves
      if (shadowsHeld && renderer && renderer.shadowMap) {
        renderer.shadowMap.autoUpdate = true;
        shadowsHeld = false;
      }
      return false;
    }
    const size = renderer.getDrawingBufferSize(sizeTmp);
    // gl_FragCoord is in MAIN framebuffer pixels, so the resolution the shader
    // divides by is the main buffer's, never the target's
    uniforms.uResolution.value.set(size.x, size.y);
    const w = Math.max(2, Math.floor(size.x * preset.rtScale));
    const h = Math.max(2, Math.floor(size.y * preset.rtScale));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    stats.rtPixels = w * h;
    stats.mainPixels = size.x * size.y;

    const prevTarget = renderer.getRenderTarget();
    group.visible = false;
    // Two renders of one scene is two shadow map builds unless somebody says
    // otherwise. This pass builds them, the main pass borrows them: the water
    // casts no shadow, so the two passes want the same map anyway.
    if (manageShadows && renderer.shadowMap) renderer.shadowMap.autoUpdate = true;
    renderer.setRenderTarget(rt);
    renderer.render(sc2, camera);
    renderer.setRenderTarget(prevTarget);
    if (manageShadows && renderer.shadowMap) {
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      shadowsHeld = true;
    }
    group.visible = true;

    uniforms.uScene.value = rt.texture;
    uniforms.uSceneDepth.value = rt.depthTexture;
    uniforms.uHasDepth.value = 1;
    uniforms.uCamNear.value = camera.near;
    uniforms.uCamFar.value = camera.far;
    stats.passes++;
    return true;
  }

  // ----------------------------------------------------------- the frame --

  let time = 0;
  let under = false;

  function waveParams() {
    return {
      height: uniforms.uWaveH.value, steep: uniforms.uSteep.value,
      scale: uniforms.uWaveScale.value, windDir: uniforms.uWindDir.value,
      speed: uniforms.uSpeed.value,
    };
  }

  /** The surface height at (x, z) right now: sea level plus the wave. */
  function surfaceAt(x, z, t = time) {
    return seaY + waveHeightAt(x, z, t, waveParams());
  }

  /** True when the eye is below the surface, waves counted. */
  function isUnderwater(pos) {
    return !!pos && pos.y < surfaceAt(pos.x, pos.z);
  }

  function copyColour(dst, src) {
    if (!src) return;
    if (src.isColor) dst.copy(src);
    else if (src.r != null) dst.setRGB(src.r, src.g, src.b, THREE.SRGBColorSpace);
  }

  /**
   * `sunDir` and `colours` are only read when this water owns its own sky
   * block. When createWater was handed a sky, sky.update is the single writer
   * of those uniforms and this leaves them alone, so call sky.update first.
   */
  function update(dt = 0, camPos = null, sunDir = null, colours = null, nowS = null) {
    time = nowS != null && Number.isFinite(nowS) ? nowS : time + Math.max(0, dt);
    if (ownsSky) {
      uniforms.uTime.value = time;
      if (sunDir) {
        uniforms.uSunDir.value.set(sunDir.x, sunDir.y, sunDir.z);
        uniforms.uMoonDir.value.set(-sunDir.x, -sunDir.y, -sunDir.z);
        uniforms.uSunUp.value = clamp(sunDir.y * 6 + 0.28, 0, 1);
        uniforms.uMoonUp.value = clamp(-sunDir.y * 6 + 0.28, 0, 1);
      }
      if (colours) {
        copyColour(uniforms.uZenith.value, colours.zenith);
        copyColour(uniforms.uHorizon.value, colours.horizon);
        copyColour(uniforms.uSunColor.value, colours.sun);
      }
    }
    if (colours && colours.fog) copyColour(uniforms.uFogColor.value, colours.fog);
    if (camPos) {
      uniforms.uCamPos.value.set(camPos.x, camPos.y, camPos.z);
      under = isUnderwater(camPos);
      uniforms.uUnder.value = under ? 1 : 0;
    }
    const fog = scene.fog;
    if (fog && fog.near != null) {
      uniforms.uFogNear.value = fog.near;
      uniforms.uFogFar.value = fog.far;
      if (!colours || !colours.fog) uniforms.uFogColor.value.copy(fog.color);
    }
    return api;
  }

  // -------------------------------------------------------------- quality --

  function setQuality(name) {
    if (!QUALITY[name] || name === quality) return quality;
    quality = name;
    preset = QUALITY[name];
    uniforms.uDetail.value = preset.detail;
    const old = geometry;
    geometry = buildOceanGeometry(preset.grid);
    mesh.geometry = geometry;
    old.dispose();
    stats.verts = preset.grid * preset.grid;
    if (!preset.refraction && rt) {
      if (rt.depthTexture) rt.depthTexture.dispose();
      rt.dispose(); rt = null;
      uniforms.uHasDepth.value = 0;
      uniforms.uScene.value = null;
      uniforms.uSceneDepth.value = null;
    } else if (preset.refraction && !rt) {
      rt = makeTarget();
    }
    return quality;
  }

  // ---------------------------------------------------------- extra water --

  /**
   * A pool whose surface sits above sea level. This world has none: field.js
   * carves every river core to -1.8 and the sea sits at -0.8, so the one sheet
   * covers the sea, the lakes and the rivers. Here for the day it does not.
   */
  function addPool(x, z, r, y) {
    const geo = new THREE.CircleGeometry(r, 48);
    geo.rotateX(-Math.PI / 2);
    const m = planeMaterial({ uSeaY: { value: y } });
    const pool = new THREE.Mesh(geo, m);
    pool.position.set(x, y, z);
    pool.name = 'pool';
    pool.renderOrder = 5;
    group.add(pool);
    return pool;
  }

  /**
   * The same water with the waves down to a ripple and a flow direction, for
   * whoever draws river ribbons. `flow` is { x, z } in world units per second;
   * the detail noise is dragged along it.
   */
  function riverMaterial(flow = { x: 0, z: 1 }, over = {}) {
    return planeMaterial(Object.assign({
      uWaveH: { value: (over.waveHeight ?? 0.05) },
      uSteep: { value: (over.steep ?? 0.15) },
      uWaveScale: { value: (over.scale ?? 0.25) },
      uFlowX: { value: flow.x ?? 0 },
      uFlowZ: { value: flow.z ?? 0 },
      uSeaY: { value: over.seaLevel ?? seaY },
      uFoam: { value: over.foam ?? 0.5 },
    }, over.uniforms || {}));
  }

  const api = {
    group, mesh, material, uniforms, stats, field,
    update, beforeRender, setQuality, addPool, riverMaterial,
    surfaceAt, isUnderwater, waveHeightAt: (x, z, t) => waveHeightAt(x, z, t ?? time, waveParams()),
    get quality() { return quality; },
    get shadowsHeld() { return shadowsHeld; },
    get preset() { return preset; },
    get underwater() { return under; },
    get time() { return time; },
    get writesSky() { return ownsSky; },
    get target() { return rt; },
    get seaLevel() { return seaY; },
    setSeaLevel(y) {
      seaY = y;
      uniforms.uSeaY.value = y;
      return seaY;
    },
    /** Wave shape at runtime, for the settings window. */
    setWaves(p = {}) {
      if (p.height != null) uniforms.uWaveH.value = p.height;
      if (p.steep != null) uniforms.uSteep.value = p.steep;
      if (p.scale != null) uniforms.uWaveScale.value = p.scale;
      if (p.windDir != null) uniforms.uWindDir.value = p.windDir;
      if (p.speed != null) uniforms.uSpeed.value = p.speed;
      return waveParams();
    },
    get waves() { return waveParams(); },
    setVisible(v) { group.visible = !!v; return group.visible; },
    dispose() {
      for (const child of [...group.children]) {
        group.remove(child);
        if (child.geometry) child.geometry.dispose();
      }
      for (const m of extras) m.dispose();
      extras.length = 0;
      material.dispose();
      geometry.dispose();
      if (rt) {
        if (rt.depthTexture) rt.depthTexture.dispose();
        rt.dispose();
        rt = null;
      }
      if (group.parent) group.parent.remove(group);
    },
  };
  return api;
}
