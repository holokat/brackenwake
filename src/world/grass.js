// Grass, as blades.
//
// A cone with four sides is a tuft in the way a sphere is a tree. This is the
// other thing: crossed quads carrying a generated alpha texture of real blades,
// scattered by the world field, bent by the same wind clock the leaves use, and
// sunk back into the ground as they get far away so the near field is thick and
// the far field costs nothing.
//
//   const g = createGrass(parent, field, { homeClear });
//   g.update(nowMs, x, z)         // every frame; fills tiles on a ms budget
//   g.setCentre(x, z, nowMs)      // a teleport: fills the inner disc NOW
//   g.setDensity(0..1)            // the settings window's "Grass density"
//
// The scatter is tiled, not rebuilt. Tiles are TILE metres square, hashed from
// their own coordinates so the same patch of ground grows the same blades every
// time you walk back to it. Each tile owns a fixed block of instance slots, so
// walking one tile costs a handful of block writes instead of a full rebuild:
// the old code threw away 8,000 instances and made 8,000 more every time the
// player crossed a 64 m chunk line.
//
// Every blade asks the field for its own ground, biome, water, river and road.
// An earlier version interpolated all of that from a 2 m grid per tile to save
// samples; it put 12 blades in a river, 4 in the open sea, and stood one 75 cm
// off the ground, because a mask read off the nearest grid point is not the
// mask at the blade. The saving was not worth a floating blade, so the tile
// budget per frame is what keeps the cost bounded instead.
//
// ---------------------------------------------------------------------------
// What V8 changed, and why
// ---------------------------------------------------------------------------
// "grass is weird and dark and shows up as I run, not ideal".
//
// SHOWS UP AS I RUN was never the tiler. Measured on the old code, a 20 m/s run
// kept every tile inside 40 m filled for every one of 600 frames. What the
// player was watching was the DISTANCE FADE: the fade is a height scale, and it
// ran from full height at 34.7 m to nothing at 56 m, so the turf visibly grew
// out of the ground eleven paces in front of the character. The ring is now 80 m
// and the fade holds full height out to 62.4 m, which puts the growing edge
// behind the fog rather than under the player's nose.
//
// WEIRD AND DARK was the normals. A blade is a card, and its card normal points
// sideways, so a sun near the zenith barely touched it; worse, DoubleSide flips
// the normal on the back face, so half of every clump was lit from below and
// went black. The blades now carry the ground's normal, straight up, and the
// fragment stage un-flips it, so a clump is lit like the turf it stands in and
// no face goes dark. The blade sprite also starts at 0.78 luminance at the root
// instead of 0.55.
//
// A tile no longer pops. It is born with a timestamp and grows in over
// FADE_IN_S with a screen-space dither, which is an alpha fade that needs no
// sorting, no transparency and no pass of its own.
//
// The ring costs little more than it did: the outer band beyond NEAR fills a
// third of its slots with bigger clumps, so 2.04x the area is 38,784 blade
// slots against the old 31,500.

import * as THREE from 'three';
import { rand2, clamp01, lerp } from './noise.js';
import { windUniforms, encodeSRGB } from './tree_gen.js';
import { BIOMES } from './field.js';

export const TILE = 8;                 // metres per grass tile
export const RADIUS = 80;              // grass this far from the player
export const NEAR = 44;                // full turf inside this, coarser beyond
export const BLADES_PER_TILE = 150;    // at density 1, in the near band
export const COVER_PER_TILE = 4;       // ferns and low shrubs, the sparse layer. Seen in
                                       // the browser at 10 and 1.2 to 2.3 m wide, the cover
                                       // read as green sheets over the whole meadow.
export const OUTER_FILL = 0.34;        // an outer tile fills this much of a near tile's block
export const OUTER_SCALE = 1.65;       // and each clump out there is this much bigger, so the
                                       // turf still reads as cover rather than as scattered dots
export const TILE_BUDGET = 16;         // never more than this many tiles a frame
export const TILE_MS = 0.8;            // the calm budget, when nothing is waiting
export const TILE_MS_MAX = 3.0;        // and the most a frame will ever spend catching up
export const CATCHUP_QUEUE = 24;       // this many NEAR tiles waiting asks for the whole TILE_MS_MAX
export const PREFILL_R = 40;           // a teleport fills this disc before the frame is drawn
export const FADE_IN_S = 0.4;          // a new tile grows in over this long
export const JUMP_TILES = 1;           // moving further than this in one update is a teleport
const SINK = 0.05;                     // blades start this far under the surface

/**
 * Slots. Two pools, sized from the two radii rather than guessed, because a
 * fixed size buffer with a capacity is the one thing in this file that fails
 * silently: run out and the far side of the ring is simply bare.
 *
 * A near tile owns BLADES_PER_TILE slots; an outer tile owns a third of that.
 * Both pools live in one InstancedMesh per layer, near blocks first, so the
 * grass is still two draw calls whatever the blade count.
 */
export const NEAR_TILES = Math.ceil(Math.PI * (NEAR + TILE) ** 2 / (TILE * TILE)) + 12;
export const OUTER_TILES = Math.ceil(Math.PI * ((RADIUS + TILE) ** 2 - NEAR ** 2) / (TILE * TILE)) + 48;
export const MAX_TILES = NEAR_TILES + OUTER_TILES;

/**
 * The most tiles of each band the ring can ever want, counted rather than
 * estimated. The area of the disc is not the answer: how many tile CENTRES
 * fall inside it depends on where in its own tile the player is standing, and
 * the peak over those offsets is what the pools have to hold. Brute forced
 * over a grid of sub-tile offsets, which costs about a millisecond once.
 */
export function ringCounts(steps = 12) {
  const span = Math.ceil(RADIUS / TILE) + 1;
  let near = 0, outer = 0, total = 0;
  for (let oz = 0; oz < steps; oz++) for (let ox = 0; ox < steps; ox++) {
    const x = (ox / steps) * TILE, z = (oz / steps) * TILE;
    let n = 0, o = 0;
    for (let dz = -span; dz <= span; dz++) for (let dx = -span; dx <= span; dx++) {
      const d = Math.hypot((dx + 0.5) * TILE - x, (dz + 0.5) * TILE - z);
      if (d > RADIUS + TILE) continue;
      if (d <= NEAR) n++; else o++;
    }
    near = Math.max(near, n); outer = Math.max(outer, o); total = Math.max(total, n + o);
  }
  return { near, outer, total };
}

/** How thick the turf is per biome, and what colour it is. 0 means bare. */
export const TURF = {
  meadow:   { d: 1.00, col: 0x74b957, cover: 1.00 },
  sakura:   { d: 0.95, col: 0x81c164, cover: 0.85 },
  boreal:   { d: 0.70, col: 0x5f9c63, cover: 1.00 },
  beach:    { d: 0.22, col: 0x9fae6a, cover: 0.25 },
  mountain: { d: 0.20, col: 0x7f8f63, cover: 0.20 },
  snow:     { d: 0.06, col: 0x93a48c, cover: 0.05 },
  desert:   { d: 0.12, col: 0xa89a5e, cover: 0.30 },
  ocean:    { d: 0, col: 0x000000, cover: 0 },
};

/**
 * How long a frame may spend filling tiles, given how far behind the ring is.
 * Pure, so the curve can be driven at both ends rather than described. Nothing
 * waiting is the calm budget; a deep backlog buys the whole catch-up budget,
 * and never a millisecond past TILE_MS_MAX.
 *
 * `urgent` is the count of NEAR tiles waiting, not the whole queue. The outer
 * band is 44 to 80 m away, it grows in over FADE_IN_S, and nobody has ever
 * noticed it arrive; buying 3 ms a frame to hurry it up only made the frame a
 * flora field rebuild lands on 3 ms worse. What is worth catching up on is the
 * ground the player is about to stand on.
 */
export function fillBudgetMs(urgent) {
  const t = clamp01((Number.isFinite(urgent) ? urgent : 0) / CATCHUP_QUEUE);
  return TILE_MS + (TILE_MS_MAX - TILE_MS) * t;
}

/** Near or outer, from a tile centre's distance to the player. */
export function bandAt(distance) { return distance <= NEAR ? 'near' : 'outer'; }

// ---------------------------------------------------------------------------
// Textures: a tuft of blades, and a clump of ground cover. Rasterised into a
// typed array, the same way tree_gen does its leaves, so this file runs in node.
// ---------------------------------------------------------------------------

const TEX = 256;
/**
 * Luminance at the root of a blade and at its tip. The old pair was 0.55 and
 * 1.00, which is a blade half in shadow before a single light has touched it.
 * Against the reference forest, where grass in sun reads light green all the
 * way down, the root was the thing that was wrong.
 */
export const BLADE_BASE_L = 0.78;
export const BLADE_TIP_L = 1.0;

function bladeSprite({ blades, curve, width, taper, seed, ragged }) {
  const S = TEX;
  const px = new Uint8Array(S * S * 4);
  const put = (x, y, l, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = ((S - 1 - (y | 0)) * S + (x | 0)) * 4;
    if (px[i + 3] >= a * 255) return;
    const b = encodeSRGB(l);
    px[i] = b; px[i + 1] = b; px[i + 2] = b; px[i + 3] = a * 255;
  };
  for (let b = 0; b < blades; b++) {
    const r0 = rand2(b, seed, 1), r1 = rand2(b, seed, 2), r2 = rand2(b, seed, 3), r3 = rand2(b, seed, 4);
    const x0 = S * (0.12 + 0.76 * r0);
    const len = S * (0.45 + 0.50 * r1) * (ragged ? 0.8 + 0.4 * r3 : 1);
    const bend = (r2 * 2 - 1) * S * curve;
    const w0 = S * width * (0.7 + 0.6 * r3);
    // one blade: a quadratic arc from the bottom edge, tapering to a point
    const steps = Math.ceil(len);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + bend * t * t;
      const y = len * t;
      const w = w0 * Math.pow(1 - t, taper);
      // brighter toward the tip, and light rather than dark at the root
      const l = BLADE_BASE_L + (BLADE_TIP_L - BLADE_BASE_L) * t;
      for (let dx = -w; dx <= w; dx += 0.5) put(x + dx, y, l * (1 - 0.15 * Math.abs(dx) / Math.max(0.3, w)), 1);
    }
  }
  const t = new THREE.DataTexture(px, S, S, THREE.RGBAFormat);
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

let bladeTex = null, coverTex = null;
/** Only for a teardown that really is throwing the whole world away. */
export function disposeGrassTextures() {
  bladeTex?.dispose(); coverTex?.dispose();
  bladeTex = coverTex = null;
}
export function grassTextures() {
  if (!bladeTex) bladeTex = bladeSprite({ blades: 9, curve: 0.16, width: 0.020, taper: 1.3, seed: 3101, ragged: false });
  if (!coverTex) coverTex = bladeSprite({ blades: 14, curve: 0.30, width: 0.018, taper: 1.1, seed: 3102, ragged: true });
  return { bladeTex, coverTex };
}

/** Mean luminance of the lit part of a sprite, 0 to 1. What "brighter" means. */
export function spriteLuminance(tex) {
  const a = tex.image.data;
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] < 128) continue;
    sum += a[i] / 255; n++;
  }
  return n ? sum / n : 0;
}

// ---------------------------------------------------------------------------
// One crossed-quad clump: two quads at right angles, 8 verts, 4 triangles.
// aWind is 0 at the roots and 1 at the tips, which is the whole of the bend.
//
// THE NORMAL IS THE GROUND'S, NOT THE CARD'S. A quad standing on its edge has a
// normal pointing sideways; under a sun near the zenith that is a face which
// receives almost nothing, and the back of the same quad, whose normal three
// flips for DoubleSide, receives less than nothing. Both halves of every clump
// were dark. A blade takes the normal of the turf it grows out of, which is up
// (the field gives a height and a slope hint but no normal, so up is the whole
// of it here), and the fragment stage below un-flips the back face.
// ---------------------------------------------------------------------------

export function clumpGeometry(quads = 2) {
  const pos = [], uv = [], nor = [], wind = [], idx = [];
  for (let q = 0; q < quads; q++) {
    const a = (q / quads) * Math.PI;
    const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
    const base = pos.length / 3;
    const corners = [[-cx, 0, -cz, 0, 0], [cx, 0, cz, 1, 0], [cx, 1, cz, 1, 1], [-cx, 1, -cz, 0, 1]];
    for (const [x, y, z, u, v] of corners) {
      pos.push(x, y, z); uv.push(u, v); nor.push(0, 1, 0); wind.push(v * v);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const fadeUniforms = {
  uFadeStart: { value: RADIUS * 0.78 },
  uFadeEnd: { value: RADIUS },
  uFadeIn: { value: FADE_IN_S },
};

/**
 * Wind, the fade that lets the far ring cost nothing, and the grow-in.
 *
 * The distance fade is a scale, not an opacity: a blade shrinks into the turf,
 * so nothing pops and nothing needs sorting. The grow-in is both: a clump comes
 * up out of the ground over FADE_IN_S and is dithered against a screen-space
 * hash while it does, which is an alpha fade that costs no sorting and no
 * transparent pass.
 */
function grassMaterial(map, { alphaTest = 0.35, roughness = 0.94 } = {}) {
  // `vertexColors` must stay FALSE here. A blade's colour is per instance, not
  // per vertex, and the clump geometry carries no `color` attribute; turning
  // vertexColors on would define USE_COLOR, declare `attribute vec3 color`,
  // leave it unbound, and WebGL would hand the shader (0, 0, 0) for every
  // blade in the world. three defines USE_COLOR in the fragment stage off
  // `instancingColor` on its own, which is what makes setColorAt work.
  const m = new THREE.MeshStandardMaterial({
    map, alphaTest, side: THREE.DoubleSide, vertexColors: false,
    roughness, metalness: 0, transparent: false,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.uniforms.uFadeStart = fadeUniforms.uFadeStart;
    shader.uniforms.uFadeEnd = fadeUniforms.uFadeEnd;
    shader.uniforms.uFadeIn = fadeUniforms.uFadeIn;
    shader.vertexShader = `
      uniform float uTime; uniform float uWind;
      uniform float uFadeStart; uniform float uFadeEnd; uniform float uFadeIn;
      attribute float aWind;
      attribute float aBorn;
      varying float vGrow;
    ` + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 gRoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 gRoot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      float gFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distance(gRoot, cameraPosition));
      float gGrow = clamp((uTime - aBorn) / max(uFadeIn, 0.0001), 0.0, 1.0);
      vGrow = gGrow;
      transformed.y *= gFade * mix(0.25, 1.0, gGrow);
      float gT = uTime * 1.9 + gRoot.x * 0.16 + gRoot.z * 0.13;
      float gS = aWind * uWind;
      transformed.x += sin(gT) * 0.30 * gS;
      transformed.z += sin(gT * 0.83 + 2.1) * 0.24 * gS;
      transformed.y -= abs(sin(gT)) * 0.07 * gS;
    `);
    shader.fragmentShader = `
      varying float vGrow;
    ` + shader.fragmentShader
      // the grow-in, as a dither. No transparency, no sort, no pass of its own.
      .replace('#include <clipping_planes_fragment>', `
      #include <clipping_planes_fragment>
      if (vGrow < 0.999) {
        float gH = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        if (gH > vGrow) discard;
      }
      `)
      // and the normal is the ground's on BOTH faces. three flips it for the
      // back face of a DoubleSided material, which is what turned half of
      // every clump black under a sun overhead.
      .replace('#include <normal_fragment_begin>', `
      #include <normal_fragment_begin>
      normal = normalize( vNormal );
      `);
  };
  m.customProgramCacheKey = () => 'grass:wind:v8';
  return m;
}

// ---------------------------------------------------------------------------

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function createGrass(parent, field, opts = {}) {
  const homeClear = opts.homeClear ?? 0;
  const span = Math.ceil(RADIUS / TILE) + 1;
  const nearCap = opts.nearTiles ?? NEAR_TILES;
  const outerCap = opts.outerTiles ?? OUTER_TILES;
  const maxTiles = nearCap + outerCap;
  const { bladeTex, coverTex } = grassTextures();

  const layers = [
    { name: 'blades', per: BLADES_PER_TILE, geo: clumpGeometry(2), mat: grassMaterial(bladeTex),
      size: [0.55, 1.15], height: [0.45, 0.95], key: 'd', salt: 0 },
    { name: 'cover', per: COVER_PER_TILE, geo: clumpGeometry(3), mat: grassMaterial(coverTex, { alphaTest: 0.30 }),
      size: [0.6, 1.0], height: [0.45, 0.75], key: 'cover', salt: 91 },
  ];
  // the richest turf any biome has for this layer: a roll above it can be
  // thrown away before the field is asked anything
  for (const L of layers) L.maxAmount = Math.max(...Object.values(TURF).map((t) => t[L.key] ?? t.d));
  for (const L of layers) {
    L.outerPer = Math.max(1, Math.round(L.per * OUTER_FILL));
    L.outerBase = nearCap * L.per;
    L.total = nearCap * L.per + outerCap * L.outerPer;
    L.mesh = new THREE.InstancedMesh(L.geo, L.mat, L.total);
    L.mesh.name = 'grass:' + L.name;
    L.mesh.frustumCulled = false;          // one mesh covers the whole ring
    L.mesh.castShadow = false;
    L.mesh.receiveShadow = true;
    L.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // instanceColor must exist before the first setColorAt or three throws
    L.mesh.setColorAt(0, new THREE.Color(0xffffff));
    // the grow-in clock, per instance. Written when a tile is filled and read
    // by the vertex shader against the same wind clock the leaves use.
    L.born = new THREE.InstancedBufferAttribute(new Float32Array(L.total).fill(-1e9), 1);
    L.born.setUsage(THREE.DynamicDrawUsage);
    L.geo.setAttribute('aBorn', L.born);
    for (let i = 0; i < L.mesh.count; i++) L.mesh.setMatrixAt(i, ZERO);
    L.mesh.instanceMatrix.needsUpdate = true;
    parent.add(L.mesh);
  }

  const active = new Map();               // "tx,tz" -> { slot, band }
  const freeNear = [], freeOuter = [];
  for (let i = nearCap - 1; i >= 0; i--) freeNear.push(i);
  for (let i = outerCap - 1; i >= 0; i--) freeOuter.push(i);
  const queue = [];                       // tiles waiting to be filled
  let density = 1;
  let centre = null;
  const stats = {
    tiles: 0, near: 0, outer: 0,
    placed: 0, filled: 0, dropped: 0, sampled: 0, lastFillMs: 0,
    budgetMs: TILE_MS, prefills: 0, lastPrefillTiles: 0, lastPrefillMs: 0,
    rebanded: 0, starved: 0, lastFrameTiles: 0, maxFrameTiles: 0, urgent: 0,
  };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();

  const poolOf = (band) => (band === 'near' ? freeNear : freeOuter);
  const baseOf = (L, band, slot) => (band === 'near' ? slot * L.per : L.outerBase + slot * L.outerPer);
  const countOf = (L, band) => (band === 'near' ? L.per : L.outerPer);

  function clearSlot(band, slot) {
    for (const L of layers) {
      const base = baseOf(L, band, slot);
      const n = countOf(L, band);
      for (let i = 0; i < n; i++) { L.mesh.setMatrixAt(base + i, ZERO); L.born.array[base + i] = -1e9; }
      L.mesh.instanceMatrix.needsUpdate = true;
      L.born.needsUpdate = true;
    }
  }

  function release(entry) {
    clearSlot(entry.band, entry.slot);
    poolOf(entry.band).push(entry.slot);
  }

  /**
   * Grow one tile into one slot. `bornS` is the wind clock's second, which is
   * what the shader compares against, so a tile filled now grows in over
   * FADE_IN_S rather than appearing between one frame and the next.
   */
  function fillTile(tx, tz, band, slot, bornS) {
    const t0 = performance.now();
    let placed = 0, dropped = 0, sampled = 0;
    const bigger = band === 'outer' ? OUTER_SCALE : 1;
    for (const L of layers) {
      const base = baseOf(L, band, slot);
      const n = countOf(L, band);
      const want = Math.round(n * density);
      for (let i = 0; i < n; i++) {
        L.born.array[base + i] = bornS;
        if (i >= want) { L.mesh.setMatrixAt(base + i, ZERO); continue; }
        // An outer tile fills a third of the slots a near one does, so its
        // sample index has to walk the whole tile rather than its first third:
        // otherwise an outer tile would grow only in one corner of itself, and
        // the ground it shares with a near tile would grow different blades.
        const k = band === 'outer' ? Math.round(i * (L.per - 1) / Math.max(1, n - 1)) : i;
        const u = rand2(tx * 733 + k, tz, 4001 + L.salt);
        const v = rand2(tx, tz * 977 + k, 4002 + L.salt);
        const x = (tx + u) * TILE, z = (tz + v) * TILE;
        if (homeClear && Math.hypot(x, z) < homeClear) { L.mesh.setMatrixAt(base + i, ZERO); dropped++; continue; }
        // the thinning roll comes BEFORE the field sample, so a desert tile
        // costs a tenth of what a meadow tile costs instead of the same
        const roll = rand2(tx * 31 + k, tz * 17, 4003 + L.salt);
        if (roll > L.maxAmount) { L.mesh.setMatrixAt(base + i, ZERO); dropped++; continue; }
        const sp = field.sampleAt(x, z);
        sampled++;
        const turf = TURF[sp.biome];
        const amount = turf ? (turf[L.key] ?? turf.d) : 0;
        // `sp.ground` is the word a hand `ground` stroke painted over this patch
        // (terrain_edits.js). Nothing grows out of painted dirt, rock, sand or
        // mud; 'grass' is the one word that means carry on. It is null on every
        // sample of a world nobody has edited.
        if (sp.ground && sp.ground !== 'grass') { L.mesh.setMatrixAt(base + i, ZERO); dropped++; continue; }
        // In a sculpt world blades grow only where a hand painted 'grass'. The
        // flat base wears the grass texture, and a blank slate has no vegetation
        // until the user says where it grows.
        if (field.sculpt && sp.ground !== 'grass') { L.mesh.setMatrixAt(base + i, ZERO); dropped++; continue; }
        if (!turf || amount <= 0 || sp.water || roll > amount || sp.river > 0.18 || sp.road > 0.20) {
          L.mesh.setMatrixAt(base + i, ZERO); dropped++; continue;
        }
        const sz = lerp(L.size[0], L.size[1], rand2(k, tx + tz, 4004)) * bigger;
        const hy = lerp(L.height[0], L.height[1], rand2(k, tx - tz, 4005)) * bigger;
        e.set(0, rand2(k, tx * 3 + tz, 4006) * Math.PI, 0);
        q.setFromEuler(e);
        p3.set(x, sp.h - SINK, z);
        s3.set(sz, hy, sz);
        m4.compose(p3, q, s3);
        L.mesh.setMatrixAt(base + i, m4);
        col.setHex(turf.col).offsetHSL(
          (rand2(k, tx + tz * 7, 4007) - 0.5) * 0.035, 0,
          (rand2(k, tx * 7 + tz, 4008) - 0.5) * 0.12);
        L.mesh.setColorAt(base + i, col);
        placed++;
      }
      L.mesh.instanceMatrix.needsUpdate = true;
      L.born.needsUpdate = true;
      if (L.mesh.instanceColor) L.mesh.instanceColor.needsUpdate = true;
    }
    stats.filled++;
    stats.placed = placed;
    stats.dropped = dropped;
    stats.sampled = sampled;
    stats.lastFillMs = performance.now() - t0;
  }

  /** Which tiles should be alive around (x, z), nearest first, with their band. */
  function wanted(x, z) {
    const cx = Math.floor(x / TILE), cz = Math.floor(z / TILE);
    const out = [];
    for (let dz = -span; dz <= span; dz++) for (let dx = -span; dx <= span; dx++) {
      const tx = cx + dx, tz = cz + dz;
      const d = Math.hypot((tx + 0.5) * TILE - x, (tz + 0.5) * TILE - z);
      if (d <= RADIUS + TILE) out.push({ tx, tz, d, band: bandAt(d), key: tx + ',' + tz });
    }
    out.sort((a, b) => a.d - b.d);
    // each pool has its own capacity, and the list is sorted by distance, so
    // trimming per band drops the FARTHEST tiles of that band rather than
    // whichever ones happened to come last
    const keep = [];
    let n = 0, o = 0;
    for (const w of out) {
      if (w.band === 'near') { if (n >= nearCap) continue; n++; } else { if (o >= outerCap) continue; o++; }
      keep.push(w);
    }
    return keep;
  }

  /**
   * Re-plan the ring around (x, z). A tile that is still wanted but has crossed
   * the near/outer line is queued for a REBAND: it keeps its old slot and stays
   * on screen until the new one is written, so the boundary never blinks.
   */
  function retile(x, z) {
    const want = wanted(x, z);
    const keep = new Map(want.map((w) => [w.key, w]));
    for (const [key, entry] of [...active]) {
      if (keep.has(key)) continue;
      release(entry);
      active.delete(key);
    }
    queue.length = 0;
    // A tile that has fallen OUT of the near band goes to the head of the
    // queue, ahead even of nearer work. It is the only entry that RELEASES a
    // near slot, and the near pool is the scarce one: leave those behind the
    // tiles coming the other way and, at speed, every near slot ends up held
    // by a tile that no longer wants one. Measured: 674 starved fills over a
    // fast sweep before this ordering, none after it.
    const rest = [];
    for (const w of want) {
      const have = active.get(w.key);
      if (!have) { rest.push({ ...w, old: null }); continue; }
      if (have.band === w.band) continue;
      if (have.band === 'near') queue.push({ ...w, old: have });
      else rest.push({ ...w, old: have });
    }
    for (const w of rest) queue.push(w);       // still nearest first: want was sorted
    stats.tiles = active.size;
  }

  /**
   * The last resort when a pool is empty: give up the slot of a tile that is
   * queued to leave this band anyway. Without it a fast enough sweep can hold
   * every near slot in tiles waiting to become outer, and the ring goes bare
   * in the one band that matters.
   */
  function reclaim(band) {
    for (const w of queue) {
      if (!w.old || w.old.band !== band) continue;
      release(w.old);
      active.delete(w.key);
      w.old = null;
      return true;
    }
    return false;
  }

  /** Put one queued tile on the ground. False when no slot was free. */
  function grow(w, bornS) {
    let slot = poolOf(w.band).pop();
    if (slot === undefined && reclaim(w.band)) slot = poolOf(w.band).pop();
    if (slot === undefined) { stats.starved++; return false; }
    fillTile(w.tx, w.tz, w.band, slot, bornS);
    if (w.old) { release(w.old); stats.rebanded++; }
    active.set(w.key, { slot, band: w.band });
    return true;
  }

  /**
   * Fill everything queued inside `radius` right now, in one call. This is what
   * a teleport and a dungeon exit need: the alternative is a bare ring for the
   * second and a half it takes the frame budget to catch up.
   */
  function prefill(bornS, radius = PREFILL_R) {
    const t0 = performance.now();
    let done = 0;
    for (let i = 0; i < queue.length;) {
      const w = queue[i];
      if (w.d > radius) { i++; continue; }
      queue.splice(i, 1);
      if (active.has(w.key) && !w.old) continue;
      if (!grow(w, bornS)) break;
      done++;
    }
    stats.prefills++;
    stats.lastPrefillTiles = done;
    stats.lastPrefillMs = performance.now() - t0;
    stats.tiles = active.size;
    return { tiles: done, ms: stats.lastPrefillMs };
  }

  function countBands() {
    let n = 0, o = 0;
    for (const entry of active.values()) { if (entry.band === 'near') n++; else o++; }
    stats.near = n; stats.outer = o; stats.tiles = active.size;
  }

  return {
    meshes: layers.map((L) => L.mesh),
    stats,
    get queued() { return queue.length; },
    /** The tiles standing right now, for a test that wants the tiler's own answer. */
    activeKeys: () => new Set(active.keys()),
    bandOf: (key) => active.get(key)?.band ?? null,
    /** Slots per pool, so a capacity can be counted rather than assumed. */
    capacity: {
      nearTiles: nearCap, outerTiles: outerCap, maxTiles,
      instances: layers.map((L) => ({ name: L.name, per: L.per, outerPer: L.outerPer, total: L.total })),
    },
    get freeSlots() { return { near: freeNear.length, outer: freeOuter.length }; },

    /**
     * Every frame. Fills tiles until this frame's budget is gone, or
     * TILE_BUDGET tiles are done, whichever comes first, and always at least
     * one so the ring cannot stall. The budget is milliseconds, not a count: a
     * tile of thick meadow costs three times a tile of desert, so two of them
     * was 1.8 ms on one biome and 0.4 ms on another. It grows with the backlog,
     * so a ring far behind catches up instead of trickling.
     *
     * A move of more than JUMP_TILES tiles in one call is a teleport, and the
     * inner PREFILL_R metres are filled before this call returns.
     */
    update(nowMs, x, z) {
      if (density <= 0) return;
      const bornS = (Number.isFinite(nowMs) ? nowMs : 0) / 1000;
      const cx = Math.floor(x / TILE), cz = Math.floor(z / TILE);
      if (!centre) {
        centre = [cx, cz]; retile(x, z); prefill(bornS);
      } else if (centre[0] !== cx || centre[1] !== cz) {
        const jump = Math.max(Math.abs(cx - centre[0]), Math.abs(cz - centre[1])) > JUMP_TILES;
        centre = [cx, cz];
        retile(x, z);
        if (jump) prefill(bornS);
      }
      let urgent = 0;
      for (const w of queue) if (w.band === 'near') urgent++;
      const budget = fillBudgetMs(urgent);
      stats.urgent = urgent;
      stats.budgetMs = budget;
      const t0 = performance.now();
      let n = 0;
      while (queue.length && n < TILE_BUDGET && (n === 0 || performance.now() - t0 < budget)) {
        const w = queue.shift();
        if (active.has(w.key) && !w.old) continue;
        if (!grow(w, bornS)) break;            // every slot is spoken for
        n++;
      }
      // What the budget actually controls is how many tiles a frame STARTS.
      // The cost of the one already running belongs to field.sampleAt, which
      // can build a road cell on its first touch, so a wall clock reading is
      // not this file's alone to promise. Count the tiles as well.
      stats.lastFrameTiles = n;
      stats.maxFrameTiles = Math.max(stats.maxFrameTiles, n);
      countBands();
    },

    /**
     * A teleport, a dungeon exit, a load. Re-plans the ring around (x, z) and
     * fills the inner disc synchronously, so the first frame after the jump has
     * grass on it. Returns what it did: `{ tiles, ms }`.
     */
    setCentre(x, z, nowMs = 0, radius = PREFILL_R) {
      if (density <= 0) return { tiles: 0, ms: 0 };
      centre = [Math.floor(x / TILE), Math.floor(z / TILE)];
      retile(x, z);
      const r = prefill((Number.isFinite(nowMs) ? nowMs : 0) / 1000, radius);
      countBands();
      return r;
    },

    /** The settings window's Grass density, 0 to 1. Takes effect as tiles refill. */
    setDensity(v) {
      const k = clamp01(Number.isFinite(v) ? v : 1);
      if (k === density) return;
      density = k;
      for (const L of layers) L.mesh.visible = k > 0;
      // drop every tile; the next update replans and prefills the inner disc
      for (const [key, entry] of [...active]) { release(entry); active.delete(key); }
      centre = null;
      queue.length = 0;
      countBands();
    },
    get density() { return density; },

    setFade(start, end) { fadeUniforms.uFadeStart.value = start; fadeUniforms.uFadeEnd.value = end; },
    get fade() { return { start: fadeUniforms.uFadeStart.value, end: fadeUniforms.uFadeEnd.value, inS: fadeUniforms.uFadeIn.value }; },

    // the two sprite textures are module level and shared by every grass field
    // ever made, so an instance disposing them would blank the next one
    dispose() {
      for (const L of layers) { parent.remove(L.mesh); L.mesh.dispose(); L.geo.dispose(); L.mat.dispose(); }
    },
  };
}

/**
 * Every biome the field can name has turf, every turf row is complete, and the
 * two slot pools are big enough for the discs they cover. Runs at load, like
 * the audits in flora.js and loot_drops.js: a biome added to field.js with no
 * turf entry would grow nothing and say nothing about it, and a pool one tile
 * too small leaves the far side of the ring bare in silence.
 */
export function auditGrass(biomes = BIOMES) {
  const bad = [];
  for (const b of biomes || []) {
    const t = TURF[b];
    if (!t) { bad.push(`${b} has no turf entry`); continue; }
    if (t.d == null || t.cover == null || t.col == null) bad.push(`${b} names no density, cover or colour`);
  }
  const want = ringCounts();
  if (NEAR_TILES < want.near) bad.push(`the near pool holds ${NEAR_TILES} tiles and the inner disc wants ${want.near}`);
  if (OUTER_TILES < want.outer) bad.push(`the outer pool holds ${OUTER_TILES} tiles and the outer band wants ${want.outer}`);
  if (fadeUniforms.uFadeStart.value >= RADIUS) bad.push('the fade starts at or past the ring edge');
  if (NEAR >= RADIUS) bad.push('the near band is the whole ring, so there is no coarse band at all');
  if (bad.length) throw new Error(`grass: ${bad.join('; ')}`);
  return { ...want, nearPool: NEAR_TILES, outerPool: OUTER_TILES };
}
auditGrass();
