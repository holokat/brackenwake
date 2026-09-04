// Arbor: the forest generator from docs/reference/arbor-forest-studio.jsx, as a
// module the game can call. Trees are grown, not modelled: an axis is a tapered
// tube of rings, it spawns an apical continuation and a whorl or spiral of
// laterals, and the last order of every axis sprays leaf quads along itself.
//
//   import * as arbor from './arbor.js';
//   const protos = arbor.forestPrototypes('meadow', field.seed);       // 8 trees
//   const spots  = arbor.placeTrees('meadow', cx, cz, 64, field.seed); // per chunk
//   arbor.tick(performance.now() / 1000);                              // each frame
//
// Everything in here is deterministic from a seed. The growth pipeline has no
// DOM dependency at all; the textures come from arbor_textures.js, which takes
// an injectable canvas factory, so the whole module builds real geometry and
// real materials in node. That is what arbor.test.mjs runs on.
//
// What is the reference, unchanged: the seven species and their parameters, the
// five biome mixes, mulberry32, the value noise and its fbm, growAxis with its
// 1400 axis cap, leafSpray, emitRing, connect, the jittered placement grid and
// its fbm thinning, the density spacings (21 / 13 / 8) and thresholds
// (0.44 / 0.34 / 0.24), the wind vertex hook, and the grass blade cross.
//
// What is new, and why:
//   - four species the game's biomes need: willow (droops), palm (one trunk,
//     a crown of fronds), sakura (spreading, blossom), dead (no leaves, grey).
//     Written in the reference's own parameter language; palm needed one new
//     habit value, 'palm', which puts every lateral at the top of the trunk.
//   - forest types for the game's eight biomes on top of the reference's five.
//   - `thinByHeight`, so Mediterranean pine can thin out as a mountain rises.
//   - a wind FIELD: `uWind` is now a base that a slow world-space gust term
//     modulates inside the shader, so two stands a few hundred metres apart do
//     not sway in lockstep. `windField(x, z, t)` is the same expression in JS.
//   - prototype and texture caching, since both are pure in their inputs.
//
// No em dashes, per the house style.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { makeBark, makeLeafTex, makeGrassTex, makeGroundTex, LEAF_KINDS, BARK_STYLES } from './arbor_textures.js';

const V = THREE.Vector3, Q = THREE.Quaternion;
const YUP = new THREE.Vector3(0, 1, 0);
const GOLD = 2.39996;                 // golden angle, the reference's spiral

// ---------------------------------------------------------------- species ---

// h            metres at heightScale 1 and maturity 1, [min, max]
// trunk        base radius as a fraction of height
// levels       branch orders before an axis becomes a leaf spray
// lat          laterals per axis (a whorl count on a conical habit)
// apical       how much of an axis's length its continuation gets
// latRatio     how much of an axis's length a lateral gets
// spread       lateral angle off the parent, degrees at crownSpread 50
// tropism      upward pull along an axis (negative droops)
// gravity      downward pull, scaled by branch order (0 on the trunk)
// habit        'round' | 'conical' | 'umbrella' | 'palm'
// bole         first axis length as a fraction of h; defaults to the
//              reference's 0.34 on a conical habit and 0.4 otherwise. Only
//              palm sets it, because with levels 1 there is no chain of
//              apical continuations to stack the rest of the height out of.
// leaf         a kind in arbor_textures.LEAF_KINDS, or null for a bare tree
// autumnTo     [A, B] the leaf colours autumn 1 lerps to
export const SPECIES = {
  oak:    { h: [13, 20], trunk: 0.055, levels: 4, lat: 4, apical: 0.52, latRatio: 0.62, spread: 52, tropism: 0.28, gravity: 0.35, habit: 'round',    leaf: 'oval',     leafPer: 4, leafSize: 0.5,  bark: '#4a3a28', leafA: '#2c5a22', leafB: '#6b9a3a', barkStyle: 'rough' },
  beech:  { h: [16, 24], trunk: 0.045, levels: 4, lat: 3, apical: 0.6,  latRatio: 0.55, spread: 40, tropism: 0.35, gravity: 0.3,  habit: 'round',    leaf: 'oval',     leafPer: 4, leafSize: 0.42, bark: '#7d7565', leafA: '#3d7a2a', leafB: '#8fbf4a', barkStyle: 'smooth' },
  birch:  { h: [10, 16], trunk: 0.03,  levels: 4, lat: 3, apical: 0.62, latRatio: 0.5,  spread: 34, tropism: 0.15, gravity: 0.75, habit: 'round',    leaf: 'oval',     leafPer: 3, leafSize: 0.3,  bark: '#e2ddd0', leafA: '#6fa233', leafB: '#a8d15a', barkStyle: 'birch' },
  spruce: { h: [18, 30], trunk: 0.035, levels: 3, lat: 6, apical: 0.72, latRatio: 0.38, spread: 84, tropism: 0.2,  gravity: 0.4,  habit: 'conical',  leaf: 'needle',   leafPer: 6, leafSize: 0.55, bark: '#5a3f2c', leafA: '#213f22', leafB: '#3f6d3a', barkStyle: 'plates' },
  pine:   { h: [16, 26], trunk: 0.04,  levels: 4, lat: 3, apical: 0.5,  latRatio: 0.5,  spread: 60, tropism: 0.5,  gravity: 0.2,  habit: 'umbrella', leaf: 'needle',   leafPer: 6, leafSize: 0.6,  bark: '#7a4a30', leafA: '#2f5d2a', leafB: '#5b8a44', barkStyle: 'plates' },
  kapok:  { h: [24, 34], trunk: 0.065, levels: 4, lat: 3, apical: 0.66, latRatio: 0.55, spread: 70, tropism: 0.3,  gravity: 0.25, habit: 'umbrella', leaf: 'tropical', leafPer: 4, leafSize: 0.75, bark: '#8a8270', leafA: '#2f6b25', leafB: '#6fae3c', barkStyle: 'smooth' },
  fig:    { h: [12, 18], trunk: 0.075, levels: 4, lat: 4, apical: 0.5,  latRatio: 0.7,  spread: 62, tropism: 0.2,  gravity: 0.45, habit: 'round',    leaf: 'tropical', leafPer: 5, leafSize: 0.6,  bark: '#6a6052', leafA: '#245a1e', leafB: '#5f9b35', barkStyle: 'rough' },

  // --- new, in the same language -------------------------------------------
  // A willow droops: the trunk climbs, everything hung off it falls. gravity
  // scales with branch order in growAxis, so 1.6 leaves the bole straight and
  // pulls the whips down hard; the small negative tropism stops the tips from
  // curling back up. Long laterals (latRatio 0.72) make the curtain.
  willow: { h: [12, 18], trunk: 0.05,  levels: 4, lat: 4, apical: 0.5,  latRatio: 0.72, spread: 68, tropism: -0.22, gravity: 1.6, habit: 'round', leaf: 'oval',    leafPer: 5, leafSize: 0.4,  bark: '#5d5240', leafA: '#4a7a2c', leafB: '#93c25a', barkStyle: 'rough' },
  // A palm is one unbranched bole with a crown of fronds. levels 1 means the
  // first laterals are already the last order, so they get the leaf spray; the
  // 'palm' habit puts all of them at the very top; gravity 1.3 arches them.
  palm:   { h: [9, 15],  trunk: 0.028, levels: 1, lat: 7, apical: 0.12, latRatio: 0.3,  spread: 78, tropism: 0.1,  gravity: 1.3,  habit: 'palm',  leaf: 'frond',   leafPer: 4, leafSize: 0.95, bark: '#8a7350', leafA: '#3f8f52', leafB: '#7cc268', barkStyle: 'plates', bole: 0.92 },
  // A cherry spreads: short, wide angles, long laterals, and blossom instead
  // of leaves. Autumn takes it to the dusty rose flora.js already uses.
  sakura: { h: [8, 13],  trunk: 0.045, levels: 4, lat: 4, apical: 0.44, latRatio: 0.78, spread: 72, tropism: 0.12, gravity: 0.5,  habit: 'round', leaf: 'blossom', leafPer: 5, leafSize: 0.44, bark: '#5a4032', leafA: '#f2aac8', leafB: '#f7d2e2', barkStyle: 'rough', autumnTo: ['#d98a7a', '#e8c0a8'] },
  // A snag: grey, bare, and knotted. leafPer 0 means leafSpray emits nothing,
  // so the leaf geometry comes back empty and `hasLeaves` is false.
  dead:   { h: [10, 16], trunk: 0.05,  levels: 4, lat: 3, apical: 0.5,  latRatio: 0.55, spread: 58, tropism: 0.05, gravity: 0.55, habit: 'round', leaf: null,      leafPer: 0, leafSize: 0,    bark: '#8d8880', leafA: '#8d8880', leafB: '#8d8880', barkStyle: 'rough' },
};

export const SPECIES_IDS = Object.keys(SPECIES);

// ----------------------------------------------------------- forest types ---

// mix          [[speciesId, weight], ...], weights summing to 1
// ground       three floor colours the terrain blends between
// grass        two blade colours
// relief/fog/sky/under  the reference's per biome air and cover
// density      the default stand density for this type
// wetMix       used instead of mix where the caller says water is near
// thinByHeight [lo, hi] metres over which the stand thins to nothing
export const FOREST_TYPES = {
  // --- the reference's five, unchanged -------------------------------------
  'Temperate broadleaf': { mix: [['oak', 0.45], ['beech', 0.35], ['birch', 0.2]],  ground: ['#3e4a25', '#5a5a34', '#2f4a22'], grass: ['#3f6e24', '#7ea63c'], relief: 3.0, fog: 0.009, sky: ['#8fb7dd', '#dbe6ee'], under: 1.0, density: 'Natural' },
  'Boreal conifer':      { mix: [['spruce', 0.6], ['pine', 0.25], ['birch', 0.15]], ground: ['#3a3524', '#4d4a30', '#31401f'], grass: ['#556f2e', '#8aa34a'], relief: 5.0, fog: 0.012, sky: ['#9fb6c9', '#e3e9ee'], under: 0.6, density: 'Dense' },
  'Tropical wet':        { mix: [['kapok', 0.4], ['fig', 0.6]],                    ground: ['#2f3d1c', '#4a4a28', '#26461d'], grass: ['#357a25', '#7dc043'], relief: 2.2, fog: 0.014, sky: ['#a7c5dc', '#e8eef0'], under: 1.6, density: 'Dense' },
  'Birch grove':         { mix: [['birch', 0.85], ['spruce', 0.15]],               ground: ['#4a5a2a', '#6b6a3c', '#3d5f2a'], grass: ['#4f8a2c', '#a4cf55'], relief: 2.0, fog: 0.007, sky: ['#9cc3e6', '#e6eef3'], under: 1.2, density: 'Natural' },
  'Mediterranean pine':  { mix: [['pine', 0.7], ['oak', 0.3]],                     ground: ['#6a5a3a', '#8a7a50', '#5a5a30'], grass: ['#7d7a36', '#b8a85a'], relief: 4.0, fog: 0.004, sky: ['#7fb0e0', '#eadfc8'], under: 0.5, density: 'Open' },

  // --- the game's eight biomes (src/world/field.js BIOMES) ------------------
  // meadow and boreal are the reference types verbatim, aliased by biome id so
  // flora.js can look a type up by whatever sampleAt() handed back.
  meadow: { mix: [['oak', 0.45], ['beech', 0.35], ['birch', 0.2]],  ground: ['#3e4a25', '#5a5a34', '#2f4a22'], grass: ['#3f6e24', '#7ea63c'], relief: 3.0, fog: 0.009, sky: ['#8fb7dd', '#dbe6ee'], under: 1.0, density: 'Natural', alias: 'Temperate broadleaf' },
  boreal: { mix: [['spruce', 0.6], ['pine', 0.25], ['birch', 0.15]], ground: ['#3a3524', '#4d4a30', '#31401f'], grass: ['#556f2e', '#8aa34a'], relief: 5.0, fog: 0.012, sky: ['#9fb6c9', '#e3e9ee'], under: 0.6, density: 'Dense', alias: 'Boreal conifer' },
  // a birch grove with cherry through it: the grove's floor and air, a crown
  // that reads pink from a distance
  sakura: { mix: [['sakura', 0.5], ['birch', 0.4], ['oak', 0.1]], ground: ['#4a5a2a', '#6b6a3c', '#3d5f2a'], grass: ['#4f8a2c', '#a4cf55'], relief: 2.0, fog: 0.007, sky: ['#9cc3e6', '#e6eef3'], under: 1.2, density: 'Natural' },
  // sparse: snags on the sand, palms only where there is water to find
  desert: { mix: [['dead', 0.75], ['palm', 0.25]], wetMix: [['palm', 0.85], ['dead', 0.15]], ground: ['#8a7a52', '#a89468', '#6f6142'], grass: ['#8a8046', '#c4b071'], relief: 3.0, fog: 0.003, sky: ['#87b4e2', '#f0e2c4'], under: 0.15, density: 'Open' },
  // Mediterranean pine, thinning out as the rock takes over. field.js puts the
  // rock line at 46 m and the snow line at 78, so the stand fades between them.
  mountain: { mix: [['pine', 0.7], ['oak', 0.3]], ground: ['#6a5a3a', '#8a7a50', '#5a5a30'], grass: ['#7d7a36', '#b8a85a'], relief: 4.0, fog: 0.004, sky: ['#7fb0e0', '#eadfc8'], under: 0.35, density: 'Open', thinByHeight: [46, 78], alias: 'Mediterranean pine' },
  // above the snow line, spruce and nothing else
  snow:  { mix: [['spruce', 1.0]], ground: ['#c9d2da', '#aab6c0', '#8f9aa4'], grass: ['#7f9a86', '#a8bcae'], relief: 5.0, fog: 0.016, sky: ['#b6c8dc', '#eef3f7'], under: 0.1, density: 'Open' },
  // the shore: palms, and driftwood snags where nothing else will hold
  beach: { mix: [['palm', 0.85], ['dead', 0.15]], ground: ['#cbb98c', '#ddd0a6', '#b09f76'], grass: ['#8fa25a', '#c2c98a'], relief: 1.0, fog: 0.006, sky: ['#8fbfe6', '#eaf0ee'], under: 0.25, density: 'Open' },
  // nothing grows in the sea. placeTrees returns [] on an empty mix.
  ocean: { mix: [], ground: ['#2a3a44', '#33454f', '#22303a'], grass: ['#2f5a4a', '#3f6d5a'], relief: 0.5, fog: 0.02, sky: ['#8fb7dd', '#dbe6ee'], under: 0, density: 'Open' },
};

export const FOREST_TYPE_IDS = Object.keys(FOREST_TYPES);

/**
 * The id a prototype cache should be keyed by. 'meadow' and 'Temperate
 * broadleaf' are the same forest under two names, and building both would grow
 * and hold two identical stands. Key on this and they share one.
 */
export const canonicalType = (id) => FOREST_TYPES[id]?.alias || id;

/** field.js's biome list. Kept here so the audit can fail loudly on a ninth. */
export const GAME_BIOMES = ['ocean', 'beach', 'meadow', 'boreal', 'desert', 'sakura', 'mountain', 'snow'];

/**
 * Fails loudly rather than shipping a forest type nothing can build. Runs at
 * import: a new biome in field.js, a typo in a mix, or a species whose leaf
 * kind has no texture recipe all throw here instead of rendering as a hole in
 * the world. This is the `auditHarvestFields()` habit from CLAUDE.md.
 */
export function auditForestTypes() {
  const bad = [];
  for (const b of GAME_BIOMES) if (!FOREST_TYPES[b]) bad.push(`biome '${b}' has no forest type`);
  for (const [id, t] of Object.entries(FOREST_TYPES)) {
    let sum = 0;
    for (const m of [...(t.mix || []), ...(t.wetMix || [])]) {
      if (!SPECIES[m[0]]) bad.push(`forest type '${id}' names species '${m[0]}', which does not exist`);
    }
    for (const m of t.mix || []) sum += m[1];
    if (t.mix.length && Math.abs(sum - 1) > 1e-6) bad.push(`forest type '${id}' mix sums to ${sum.toFixed(3)}, not 1`);
    if (!t.ground || t.ground.length !== 3) bad.push(`forest type '${id}' needs three ground colours`);
    if (!t.grass || t.grass.length !== 2) bad.push(`forest type '${id}' needs two grass colours`);
  }
  for (const [id, sp] of Object.entries(SPECIES)) {
    if (sp.leaf != null && !LEAF_KINDS.includes(sp.leaf)) bad.push(`species '${id}' wants leaf kind '${sp.leaf}', which has no recipe`);
    if (!BARK_STYLES.includes(sp.barkStyle)) bad.push(`species '${id}' wants bark style '${sp.barkStyle}', which has no recipe`);
    if (sp.leaf == null && sp.leafPer !== 0) bad.push(`species '${id}' has no leaf kind but asks for ${sp.leafPer} of them`);
    if (!['round', 'conical', 'umbrella', 'palm'].includes(sp.habit)) bad.push(`species '${id}' has habit '${sp.habit}'`);
  }
  if (bad.length) throw new Error('arbor: ' + bad.join('; '));
  return true;
}
auditForestTypes();

// ------------------------------------------------------------------ noise ---

// The reference's own value noise. It is not the game's simplex, and that is
// deliberate: the stand thinning pattern is part of the look being ported, and
// swapping the noise would change where the clearings fall.
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const h = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
export function fbm(x, z) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}

/** The reference's per cell integer hash. Not noise.js's: different constants. */
export function ahash2(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + (seed | 0) * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const hexLerp = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

// ------------------------------------------------------------------- wind ---

export const WIND_DEFAULT = 0.5;          // the studio's default slider value
export const PREVAILING = Math.PI / 4;    // the direction gusts swing about

/** Shared by every material this module makes. `uWind` is the BASE strength. */
export const windUniforms = { uTime: { value: 0 }, uWind: { value: WIND_DEFAULT } };

let windVaries = true;

/** Turn the world-space gust term off and fall back to the reference's flat wind. */
export function setWindVariation(on) { windVaries = !!on; }
export const windVariationOn = () => windVaries;

// Two crossing swells, both bounded to [0, 1] by construction:
// 0.5 + 0.32 * (a product of sin and cos, in [-1, 1]) + 0.18 * (a sin, in [-1, 1]).
// These two functions are transcribed literally into the GLSL in windHook, so
// the JS answer and the shader's answer are the same expression.
const gust = (x, z, t) =>
  0.5 + 0.32 * Math.sin(x * 0.0042 + t * 0.11) * Math.cos(z * 0.0031 - t * 0.07)
      + 0.18 * Math.sin((x + z) * 0.0017 - t * 0.045);
const swing = (x, z, t) =>
  0.5 + 0.32 * Math.sin(z * 0.00252 + t * 0.055) * Math.cos(x * 0.00186 - t * 0.035)
      + 0.18 * Math.sin((z + x) * 0.00102 - t * 0.0225);

/**
 * The wind at a place and a time. Pure, bounded, and the same expression the
 * vertex shader evaluates per vertex, so an effect that spawns a leaf at (x, z)
 * and the tree it fell off agree about which way the air is going.
 *
 * strength lies in [0.35 * base, 1.65 * base]; angle in PREVAILING +- 0.55 rad.
 * The wavelength is roughly 1.5 km, so a stand sways together and the next
 * valley does not.
 */
export function windField(x, z, t, base = windUniforms.uWind.value) {
  const g = gust(x, z, t);
  const strength = base * (0.35 + 1.3 * g);
  const angle = PREVAILING + (swing(x, z, t) - 0.5) * 1.1;
  return { strength, angle, dirX: Math.sin(angle), dirZ: Math.cos(angle), gust: g };
}

/** Set the base strength every gust is measured against. 0 stills the forest. */
export function setWind(strength) { windUniforms.uWind.value = Math.max(0, strength); }
export const getWind = () => windUniforms.uWind.value;

/** Advance the sway. `nowS` is seconds, not milliseconds. */
export function tick(nowS) { windUniforms.uTime.value = nowS; }

const f4 = (v) => Number(v).toFixed(4);

/**
 * onBeforeCompile hook. `amp` is the sway amplitude per metre of local height
 * (the reference passes 0.06 for foliage); `grass` switches to the blade
 * variant, which also shrinks with camera distance and darkens toward the root.
 *
 * Two departures from the reference, both deliberate:
 *   - the instanceMatrix read is guarded, so the hook cannot break a plain mesh
 *   - `uWind` is multiplied by a world-space gust term (see windField)
 */
export function windHook(sh, amp, grass) {
  sh.uniforms.uTime = windUniforms.uTime;
  sh.uniforms.uWind = windUniforms.uWind;
  const wpos = [
    '#ifdef USE_INSTANCING',
    ' vec3 wpos=(instanceMatrix*vec4(position,1.0)).xyz;',
    '#else',
    ' vec3 wpos=position;',
    '#endif',
  ].join('\n');
  const wp = ' float wp=sin(uTime*1.4+wpos.x*0.35+wpos.z*0.25+position.y*0.4)+0.5*sin(uTime*2.9+wpos.x*1.3+wpos.y*0.8);';
  // the field, transcribed from gust() and swing() above
  const field = windVaries ? [
    ' float aGust=0.5+0.32*sin(wpos.x*0.0042+uTime*0.11)*cos(wpos.z*0.0031-uTime*0.07)+0.18*sin((wpos.x+wpos.z)*0.0017-uTime*0.045);',
    ' float aSwing=0.5+0.32*sin(wpos.z*0.00252+uTime*0.055)*cos(wpos.x*0.00186-uTime*0.035)+0.18*sin((wpos.z+wpos.x)*0.00102-uTime*0.0225);',
    ' float wStr=uWind*(0.35+1.3*aGust);',
    ' float wAng=0.7853982+(aSwing-0.5)*1.1;',
    ' vec2 wDir=vec2(sin(wAng),cos(wAng));',
  ].join('\n') : ' float wStr=uWind;\n vec2 wDir=vec2(0.8,0.6);';
  const body = grass
    ? [
      ' float dcam=distance(wpos,cameraPosition); transformed.y*=smoothstep(70.0,48.0,dcam);',
      ' transformed.x+=wp*wStr*0.45*position.y*position.y*wDir.x;',
      ' transformed.z+=wp*wStr*0.45*position.y*position.y*wDir.y;',
    ].join('\n')
    : [
      ` transformed.x+=wp*wStr*${f4(amp * 1.25)}*position.y*wDir.x;`,
      ` transformed.z+=wp*wStr*${f4(amp * 1.25)}*position.y*wDir.y;`,
    ].join('\n');
  sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace(
    '#include <begin_vertex>',
    ['#include <begin_vertex>', wpos, wp, field, body].join('\n'),
  );
  if (grass) {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n diffuseColor.rgb*=mix(0.38,1.15,vMapUv.y);',
    );
  }
  return sh;
}

// ----------------------------------------------------------------- growth ---

// The studio's seven sliders, plus `detail`.
//
// `detail` is not the reference's. It is the only lever this module gives a
// caller for the cost measured in arbor.test.mjs: at detail 1 a dense boreal
// chunk draws close to a million triangles, which is a fine number for a
// studio orbiting one stand and a bad one for a streaming world with a ring of
// chunks loaded. It scales the ring segment count and the leaves per node, and
// at 1.0 it is exactly the reference. Build the near ring at 1 and the far
// rings lower; see docs/mmo/wiring/V6.md for the measured trade.
export const PROTO_DEFAULTS = {
  heightScale: 1.0,
  crownSpread: 50,
  trunkRadius: 1.0,
  maturity: 0.75,
  gnarl: 0.35,
  foliage: 1.0,
  autumn: 0,
  detail: 1.0,
};

const AXIS_CAP = 1400;                  // the reference's recursion budget

function perp(d) {
  const a = Math.abs(d.y) < 0.98 ? YUP : new V(1, 0, 0);
  return new V().crossVectors(d, a).normalize();
}
function branchOff(axis, angle, az) {
  const u = perp(axis);
  const v = new V().crossVectors(axis, u).normalize();
  const side = u.multiplyScalar(Math.cos(az)).add(v.multiplyScalar(Math.sin(az))).normalize();
  return axis.clone().multiplyScalar(Math.cos(angle)).add(side.multiplyScalar(Math.sin(angle))).normalize();
}

function newCtx(rng, opt) {
  return { P: [], Nr: [], U: [], I: [], vbase: 0, LP: [], LN: [], LU: [], LC: [], I2: [], axisCount: 0, rng, opt };
}

function emitRing(c, center, frameU, frameV, r, vseg, vc) {
  const start = c.vbase;
  for (let i = 0; i <= vseg; i++) {
    const a = i / vseg * Math.PI * 2;
    const nn = frameU.clone().multiplyScalar(Math.cos(a)).add(frameV.clone().multiplyScalar(Math.sin(a)));
    c.P.push(center.x + nn.x * r, center.y + nn.y * r, center.z + nn.z * r);
    c.Nr.push(nn.x, nn.y, nn.z);
    c.U.push(i / vseg * 2.0, vc);
    c.vbase++;
  }
  return start;
}
function connect(c, a, b, vseg) {
  for (let i = 0; i < vseg; i++) c.I.push(a + i, b + i, a + i + 1, a + i + 1, b + i, b + i + 1);
}
function pushLeaf(c, p, q, sz, w, col) {
  const base = c.LP.length / 3;
  const hw = sz * w * 0.5;
  const corners = [[-hw, 0, 0], [hw, 0, 0], [hw, sz, 0], [-hw, sz, 0]];
  const n = new V(0, 0, 1).applyQuaternion(q);
  for (const cc of corners) {
    const v = new V(cc[0], cc[1], cc[2]).applyQuaternion(q).add(p);
    c.LP.push(v.x, v.y, v.z); c.LN.push(n.x, n.y, n.z); c.LC.push(col.r, col.g, col.b);
  }
  c.LU.push(0, 0, 1, 0, 1, 1, 0, 1);
  c.I2.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function leafSpray(c, sp, nodes, dirs, scale, leafA, leafB) {
  const per = Math.round(sp.leafPer * c.opt.foliage * c.opt.detail);
  if (per <= 0) return;
  const rng = c.rng;
  const needle = sp.leaf === 'needle';
  const frond = sp.leaf === 'frond';
  const start = Math.floor(nodes.length * (needle || frond ? 0.05 : 0.3));
  for (let i = start; i < nodes.length; i++) {
    const p = nodes[i], d = dirs[i];
    for (let j = 0; j < per; j++) {
      const pd = perp(d).applyAxisAngle(d, rng() * 6.28);
      const out = d.clone().multiplyScalar(0.3 + rng() * 0.4).add(pd.multiplyScalar(0.75));
      out.y += needle ? 0.05 : 0.3;
      out.normalize();
      const sz = sp.leafSize * scale * (0.75 + rng() * 0.5);
      const lp = p.clone().add(out.clone().multiplyScalar(sz * (0.1 + rng() * 0.4)));
      const q = new Q().setFromUnitVectors(YUP, out);
      q.multiply(new Q().setFromAxisAngle(YUP, rng() * 6.28));
      q.multiply(new Q().setFromAxisAngle(new V(1, 0, 0), (rng() - 0.5) * 0.7));
      const col = hexLerp(leafA, leafB, rng()).multiplyScalar(0.85 + rng() * 0.3);
      // needles are long and thin; a frond is longer and thinner still
      const h = needle ? sz * 1.6 : frond ? sz * 2.4 : sz;
      const w = needle ? 0.55 : frond ? 0.4 : 1.0;
      pushLeaf(c, lp, q, h, w, col);
    }
  }
}

function growAxis(c, sp, pos, dir, len, rad, order, scale, gnarl, leafA, leafB) {
  c.axisCount++;
  if (c.axisCount > AXIS_CAP) return;
  const rng = c.rng;
  const maxO = sp.levels;
  const segs = Math.max(3, Math.min(12, Math.round(len / (scale * 0.9))));
  const step = len / segs;
  const vseg = Math.max(3, Math.round((order === 0 ? 10 : (order === 1 ? 7 : 5)) * c.opt.detail));
  const last = order >= maxO;
  const endRad = last ? 0.012 : rad * (order === 0 ? 0.7 : 0.55);
  let p = pos.clone(), d = dir.clone().normalize();
  const nodes = [], dirs = [], radii = [];
  const curlAxis = perp(d).applyAxisAngle(d, rng() * 6.28);
  const curl = (rng() - 0.5) * (order === 0 ? 0.05 : 0.35) * gnarl;
  const wob = (order === 0 ? 0.025 : 0.12) * gnarl * (order + 1);
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    nodes.push(p.clone()); dirs.push(d.clone());
    let r = rad + (endRad - rad) * t;
    if (order === 0 && t < 0.12) r *= 1 + (0.12 - t) / 0.12 * 0.6;   // the flare at the root
    radii.push(Math.max(0.012, r));
    p = p.clone().add(d.clone().multiplyScalar(step));
    d.applyAxisAngle(curlAxis, curl);
    d.y -= sp.gravity * step * 0.05 * order * (sp.habit === 'conical' ? 1.6 : 1);
    d.y += sp.tropism * step * 0.12 * (order > 0 ? t * 2 : 0.3);
    d.x += (rng() - 0.5) * wob;
    d.z += (rng() - 0.5) * wob;
    d.normalize();
  }
  let fu = perp(dirs[0]);
  const rs = [];
  for (let s = 0; s <= segs; s++) {
    const dd = dirs[s];
    fu = fu.clone().sub(dd.clone().multiplyScalar(fu.dot(dd))).normalize();
    const fv = new V().crossVectors(fu, dd).normalize();
    rs.push(emitRing(c, nodes[s], fu, fv, radii[s], vseg, nodes[s].y * 0.6));
  }
  for (let s = 0; s < segs; s++) connect(c, rs[s], rs[s + 1], vseg);
  if (last || rad < 0.02) { leafSpray(c, sp, nodes, dirs, scale, leafA, leafB); return; }
  if (order >= maxO - 1) {
    const cut = Math.floor(segs * 0.5);
    leafSpray(c, sp, nodes.slice(cut), dirs.slice(cut), scale, leafA, leafB);
  }
  const ld = dirs[segs].clone();
  ld.x += (rng() - 0.5) * 0.25 * gnarl;
  ld.z += (rng() - 0.5) * 0.25 * gnarl;
  ld.normalize();
  const cont = order === 0 ? (sp.habit === 'umbrella' ? 0.62 : sp.apical) : sp.apical;
  growAxis(c, sp, nodes[segs], ld, len * cont, endRad, order + 1, scale, gnarl, leafA, leafB);
  const whorl = sp.habit === 'conical' && order === 0;
  const crown = sp.habit === 'palm' && order === 0;              // new: every lateral at the top
  const n = whorl ? segs - 1 : (crown ? sp.lat : Math.max(1, Math.round(sp.lat * (order === 0 ? 1 : 0.75))));
  let az = rng() * 6.28;
  const t0 = sp.habit === 'umbrella' && order === 0 ? 0.72 : (order === 0 ? 0.35 : 0.2);
  for (let k = 1; k <= n; k++) {
    const t = crown ? 1 : (whorl ? k / segs : t0 + (0.96 - t0) * (k / (n + 1)));
    const si = Math.max(1, Math.min(segs, Math.round(t * segs)));
    const per = whorl ? 5 : 1;
    for (let w = 0; w < per; w++) {
      az += GOLD;
      const ang = (c.opt.crownSpread * sp.spread / 50 * (0.8 + rng() * 0.4)) * Math.PI / 180;
      const cd = branchOff(dirs[si], ang, az);
      const f = sp.habit === 'conical' ? (1.15 - t * 0.95)
        : sp.habit === 'umbrella' ? (0.7 + t * 0.5)
          : sp.habit === 'palm' ? 1.0
            : (0.6 + t * 0.5);
      const cLen = len * sp.latRatio * f * (0.85 + rng() * 0.3);
      const cRad = radii[si] * (0.5 + 0.12 * (1 - t));
      if (cLen > scale * 0.3) growAxis(c, sp, nodes[si], cd, cLen, cRad, order + 1, scale, gnarl, leafA, leafB);
    }
  }
}

function xzRadius(arr) {
  let m = 0;
  for (let i = 0; i < arr.length; i += 3) {
    const d = arr[i] * arr[i] + arr[i + 2] * arr[i + 2];
    if (d > m) m = d;
  }
  return Math.sqrt(m);
}

/**
 * Grow one tree.
 *
 * Returns `{ bark, leaf, barkMat, leafMat, depthMat, height, radius,
 *            crownRadius, hasLeaves, species, seed, triangles }`.
 *
 *   bark / leaf     BufferGeometry, origin at the foot, +y up
 *   barkMat         MeshStandardMaterial with the species' bark and normal map
 *   leafMat         alpha tested, vertex coloured, wind hooked
 *   depthMat        the leaf's customDepthMaterial, so shadows are cut out too
 *   height          metres, what the trunk actually reached
 *   radius          trunk radius at the base, metres (what an axe collides with)
 *   crownRadius     the widest the tree gets in xz, metres
 *   hasLeaves       false for `dead`; do not build a leaf InstancedMesh
 *
 * The geometry is NOT scaled: flora.js instances it with its own per tree
 * scale, exactly as the reference's chunk builder does.
 */
export function buildPrototype(speciesId, seed, opts = {}) {
  const sp = SPECIES[speciesId];
  if (!sp) throw new Error(`arbor: no species '${speciesId}'`);
  const opt = { ...PROTO_DEFAULTS, ...opts };
  const rng = mulberry32(seed >>> 0);
  const c = newCtx(rng, opt);
  const maturity = Math.max(0, Math.min(1, opt.maturity));
  const h = (sp.h[0] + rng() * (sp.h[1] - sp.h[0])) * opt.heightScale * (0.5 + 0.5 * maturity);
  const scale = h / 16;
  const rad = h * sp.trunk * opt.trunkRadius * (0.7 + 0.5 * maturity);
  const [autA, autB] = sp.autumnTo || ['#a8742c', '#d9a33a'];
  const leafA = hexLerp(sp.leafA, autA, opt.autumn).getStyle();
  const leafB = hexLerp(sp.leafB, autB, opt.autumn).getStyle();
  growAxis(
    c, sp,
    new V(0, -0.4 * scale, 0),
    new V((rng() - 0.5) * 0.04, 1, (rng() - 0.5) * 0.04).normalize(),
    h * (sp.bole ?? (sp.habit === 'conical' ? 0.34 : 0.4)),
    rad, 0, scale, opt.gnarl, leafA, leafB,
  );

  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(c.P, 3));
  bg.setAttribute('normal', new THREE.Float32BufferAttribute(c.Nr, 3));
  bg.setAttribute('uv', new THREE.Float32BufferAttribute(c.U, 2));
  bg.setIndex(c.I);
  bg.computeBoundingSphere();

  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(c.LP, 3));
  lg.setAttribute('normal', new THREE.Float32BufferAttribute(c.LN, 3));
  lg.setAttribute('uv', new THREE.Float32BufferAttribute(c.LU, 2));
  lg.setAttribute('color', new THREE.Float32BufferAttribute(c.LC, 3));
  lg.setIndex(c.I2);
  if (c.LP.length) lg.computeBoundingSphere();

  const bk = makeBark(sp.barkStyle, sp.bark);
  const barkMat = new THREE.MeshStandardMaterial({
    map: bk.map, normalMap: bk.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95,
  });
  const leafKind = sp.leaf || 'oval';
  const leafTex = makeLeafTex(leafKind);
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTex, vertexColors: true, alphaTest: 0.45,
    side: THREE.DoubleSide, roughness: 0.75,
    emissive: new THREE.Color(leafA).multiplyScalar(0.18),
  });
  leafMat.onBeforeCompile = (sh) => windHook(sh, 0.06, false);
  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.45,
  });

  // The tallest bark vertex is the tree's real height above the foot; `h` is
  // only the length the trunk was asked for. Measure it, do not assert it.
  let top = 0;
  for (let i = 1; i < c.P.length; i += 3) if (c.P[i] > top) top = c.P[i];

  return {
    bark: bg, leaf: lg, barkMat, leafMat, depthMat,
    height: top, grownHeight: h, radius: rad, detail: opt.detail,
    crownRadius: Math.max(xzRadius(c.P), xzRadius(c.LP)),
    hasLeaves: c.LP.length > 0,
    species: speciesId, seed: seed >>> 0,
    triangles: c.I.length / 3 + c.I2.length / 3,
    axes: c.axisCount,
  };
}

// ------------------------------------------------------------ prototypes ----

const protoCache = new Map();
const optKey = (o) => {
  const p = { ...PROTO_DEFAULTS, ...o };
  return [p.heightScale, p.crownSpread, p.trunkRadius, p.maturity, p.gnarl, p.foliage, p.autumn, p.detail].join(',');
};

/** buildPrototype, memoised on (species, seed, options). Build trees through this. */
export function prototypeFor(speciesId, seed, opts = {}) {
  const key = speciesId + '|' + (seed >>> 0) + '|' + optKey(opts);
  let p = protoCache.get(key);
  if (!p) { p = buildPrototype(speciesId, seed, opts); protoCache.set(key, p); }
  return p;
}

export const PROTO_COUNT = 8;             // the reference builds eight per stand

/**
 * The eight prototypes a forest type streams, in the reference's own order:
 * one rng draws both the species from the mix and each tree's maturity, so a
 * stand has saplings and old growth in it.
 *
 * `placeTrees` hands back a `protoIndex` into this array.
 */
export function forestPrototypes(typeId, seed, opts = {}) {
  const type = FOREST_TYPES[typeId];
  if (!type) throw new Error(`arbor: no forest type '${typeId}'`);
  const mix = (opts.wet && type.wetMix) ? type.wetMix : type.mix;
  if (!mix.length) return [];
  const r = mulberry32(seed | 0);
  const maturity = opts.maturity ?? PROTO_DEFAULTS.maturity;
  const out = [];
  for (let i = 0; i < PROTO_COUNT; i++) {
    const spn = pickSpecies(mix, r);
    out.push(prototypeFor(spn, ((seed | 0) * 7 + i * 131) >>> 0, {
      ...opts, maturity: Math.min(1, maturity * (0.55 + r() * 0.7)),
    }));
  }
  return out;
}

/** Drop the prototype cache and free its GPU resources. */
export function clearPrototypeCache() {
  for (const p of protoCache.values()) {
    p.bark.dispose(); p.leaf.dispose();
    p.barkMat.dispose(); p.leafMat.dispose(); p.depthMat.dispose();
  }
  protoCache.clear();
}
export const prototypeCacheSize = () => protoCache.size;

/** Draw one species out of a weighted mix. `r` is a mulberry32, or Math.random. */
export function pickSpecies(mix, r) {
  let t = r();
  for (const m of mix) { t -= m[1]; if (t <= 0) return m[0]; }
  return mix[mix.length - 1][0];
}

// ------------------------------------------------------------- placement ----

export const DENSITIES = ['Open', 'Natural', 'Dense'];

/** Metres between grid cells, before jitter. The reference's three numbers. */
export function spacingFor(density) {
  return density === 'Open' ? 21 : (density === 'Dense' ? 8 : 13);
}
/** The fbm level a cell has to clear to grow anything. Higher is emptier. */
export function thresholdFor(density) {
  return density === 'Open' ? 0.44 : (density === 'Dense' ? 0.24 : 0.34);
}

/**
 * Where the trees stand in one chunk. Pure: no THREE, no scene, no field.
 *
 *   placeTrees('meadow', cx, cz, 64, field.seed, { heightAt: field.heightAt })
 *   -> [{ x, z, scale, yScale, yaw, protoIndex }, ...]
 *
 * `x` and `z` are world metres, `scale` is the uniform scale of the prototype,
 * `yScale` an extra stretch on y, `yaw` radians about y, `protoIndex` an index
 * into `forestPrototypes(...)`.
 *
 * The grid, the jitter, the four rolls per cell and the fbm thinning are the
 * reference's, including the order the rolls are drawn in: every roll happens
 * before any rejection, so removing a tree never shifts the rest.
 *
 * opts:
 *   density      'Open' | 'Natural' | 'Dense', default the forest type's own
 *   protoCount   how many prototypes the caller built, default 8
 *   clearRadius  metres about the world origin to leave bare, default 0. The
 *                reference used 9 to keep its camera clear; the game has
 *                flora.js HOME_CLEAR for that, so this is off by default.
 *   heightAt     (x, z) => metres. Only read when the type thins by height.
 *   keep         (x, z) => bool. The caller's own veto, drawn from no rng, so
 *                a rejection here also leaves the layout alone.
 */
export function placeTrees(typeId, cx, cz, size, seed, opts = {}) {
  const type = FOREST_TYPES[typeId];
  if (!type) throw new Error(`arbor: no forest type '${typeId}'`);
  const out = [];
  const mix = (opts.wet && type.wetMix) ? type.wetMix : type.mix;
  if (!mix.length) return out;
  const density = opts.density || type.density || 'Natural';
  const protoCount = opts.protoCount ?? PROTO_COUNT;
  const clearR = opts.clearRadius ?? 0;
  const spacing = opts.spacing ?? spacingFor(density);
  const thr = opts.threshold ?? thresholdFor(density);
  const thin = type.thinByHeight && opts.heightAt ? type.thinByHeight : null;
  const keep = opts.keep || null;
  const ox = cx * size, oz = cz * size;
  const r = mulberry32(ahash2(cx, cz, seed));
  for (let x = ox + spacing * 0.5; x < ox + size; x += spacing) {
    for (let z = oz + spacing * 0.5; z < oz + size; z += spacing) {
      const px = x + (r() - 0.5) * spacing * 0.9;
      const pz = z + (r() - 0.5) * spacing * 0.9;
      const pick = r();
      const sc = 0.55 + Math.pow(r(), 1.4) * 0.95;
      const sy = 0.9 + r() * 0.25;
      const rot = r() * 6.28;
      const thinRoll = thin ? r() : 0;
      if (clearR > 0 && Math.hypot(px, pz) < clearR) continue;
      if (fbm(px * 0.017 + 50, pz * 0.017) < thr) continue;
      if (thin) {
        const y = opts.heightAt(px, pz);
        const t = Math.max(0, Math.min(1, (y - thin[0]) / (thin[1] - thin[0])));
        if (thinRoll > 1 - t * t * (3 - 2 * t)) continue;     // smoothstep, keep-probability
      }
      if (keep && !keep(px, pz)) continue;
      out.push({ x: px, z: pz, scale: sc, yScale: sy, yaw: rot, protoIndex: Math.floor(pick * protoCount) });
    }
  }
  return out;
}

// ----------------------------------------------------------------- ground ---

/** The forest floor material: vertex coloured, grained, tiling every 3 m. */
export function groundMaterial(tileMetres = 96) {
  const t = makeGroundTex();
  t.repeat.set(tileMetres / 3, tileMetres / 3);
  return new THREE.MeshStandardMaterial({ vertexColors: true, map: t, roughness: 1.0 });
}

// ------------------------------------------------------------------ grass ---

export const GRASS_CHUNK = 24;            // the reference's GC
export const GRASS_PER_SQM = 7;           // GC * GC * 7 blades at density 1

let grassGeo = null, grassMat = null;

/**
 * The blade cross: three quads at three yaws merged into one geometry, so a
 * tuft reads from any angle. Built once and shared.
 */
export function buildGrassAssets() {
  if (grassGeo && grassMat) return { geo: grassGeo, mat: grassMat };
  const blade = new THREE.PlaneGeometry(0.6, 1, 1, 3);
  blade.translate(0, 0.5, 0);
  const b2 = blade.clone().rotateY(Math.PI / 2);
  const b3 = blade.clone().rotateY(-Math.PI / 2 * 0.5);
  const pos = [], uv = [], nrm = [], idx = [];
  let base = 0;
  for (const gg of [blade, b2, b3]) {
    const pa = gg.attributes.position, ua = gg.attributes.uv, ia = gg.index;
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      uv.push(ua.getX(i), ua.getY(i));
      nrm.push(0, 1, 0);
    }
    for (let i = 0; i < ia.count; i++) idx.push(ia.getX(i) + base);
    base += pa.count;
  }
  grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  grassGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  grassGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  grassGeo.setIndex(idx);
  grassMat = new THREE.MeshStandardMaterial({
    map: makeGrassTex(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.85,
  });
  grassMat.onBeforeCompile = (sh) => windHook(sh, 0, true);
  return { geo: grassGeo, mat: grassMat };
}

/** Free the shared blade geometry and material. */
export function disposeGrassAssets() {
  grassGeo?.dispose(); grassMat?.dispose();
  grassGeo = null; grassMat = null;
}

/**
 * One grass chunk as a single InstancedMesh, coloured from the forest type's
 * two blade colours and thickened where a lushness fbm says so.
 *
 * The reference read its own terrain function for the ground height; here the
 * caller passes `heightAt`, so the game's field decides where the blades sit.
 *
 *   grassChunk('meadow', gx, gz, { heightAt: field.heightAt, seed: field.seed })
 *
 * Returns null when the count works out at zero (ocean, or grass 0).
 */
export function grassChunk(typeId, gx, gz, opts = {}) {
  const type = FOREST_TYPES[typeId];
  if (!type) throw new Error(`arbor: no forest type '${typeId}'`);
  const size = opts.size ?? GRASS_CHUNK;
  const grass = opts.grass ?? 1.0;
  const seed = opts.seed ?? 1;
  const heightAt = opts.heightAt || (() => 0);
  const keep = opts.keep || null;
  const count = Math.floor(size * size * GRASS_PER_SQM * grass * type.under);
  if (count < 1) return null;
  const { geo, mat } = buildGrassAssets();
  const ox = gx * size, oz = gz * size;
  const r = mulberry32(ahash2(gx * 3 + 1, gz * 3 + 7, seed));
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new Q(), s = new V(), p = new V();
  const gA = new THREE.Color(type.grass[0]), gB = new THREE.Color(type.grass[1]);
  let n = 0;
  for (let i = 0; i < count; i++) {
    p.set(ox + r() * size, 0, oz + r() * size);
    const lush = fbm(p.x * 0.06 + 9, p.z * 0.06);
    const sc = (0.35 + r() * 0.7) * (0.5 + lush);
    const yaw = r() * 6.28;
    const tint = r() * 0.6 + lush * 0.4, shade = 0.85 + 0.3 * r();
    if (keep && !keep(p.x, p.z)) continue;
    p.y = heightAt(p.x, p.z) - 0.03;
    q.setFromAxisAngle(YUP, yaw);
    s.set(sc * 1.1, sc, sc * 1.1);
    m.compose(p, q, s);
    inst.setMatrixAt(n, m);
    inst.setColorAt(n, gA.clone().lerp(gB, tint).multiplyScalar(shade));
    n++;
  }
  if (n === 0) { inst.dispose(); return null; }
  inst.count = n;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.receiveShadow = true;
  inst.frustumCulled = false;
  return inst;
}
