// Grass, as blades.
//
// A cone with four sides is a tuft in the way a sphere is a tree. This is the
// other thing: crossed quads carrying a generated alpha texture of real blades,
// scattered by the world field, bent by the same wind clock the leaves use, and
// sunk back into the ground as they get far away so the near field is thick and
// the far field costs nothing.
//
//   const g = createGrass(parent, field, { homeClear });
//   g.update(nowMs, x, z)     // every frame; refills at most TILE_BUDGET tiles
//   g.setDensity(0..1)        // the settings window's "Grass density"
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

import * as THREE from 'three';
import { rand2, clamp01, lerp } from './noise.js';
import { windUniforms, encodeSRGB } from './tree_gen.js';

export const TILE = 8;                 // metres per grass tile
export const RADIUS = 56;              // grass this far from the player
export const BLADES_PER_TILE = 150;    // at density 1
export const COVER_PER_TILE = 4;       // ferns and low shrubs, the sparse layer. Seen in
                                       // the browser at 10 and 1.2 to 2.3 m wide, the cover
                                       // read as green sheets over the whole meadow.
export const TILE_BUDGET = 4;          // never more than this many tiles a frame
export const TILE_MS = 0.8;            // and never more than this long, whichever comes first
const SINK = 0.05;                     // blades start this far under the surface
/** Enough slots for a full disc of radius RADIUS plus one tile all round. */
export const MAX_TILES = Math.ceil(Math.PI * (RADIUS + TILE) ** 2 / (TILE * TILE)) + 8;

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

// ---------------------------------------------------------------------------
// Textures: a tuft of blades, and a clump of ground cover. Rasterised into a
// typed array, the same way tree_gen does its leaves, so this file runs in node.
// ---------------------------------------------------------------------------

const TEX = 256;

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
      // brighter toward the tip, darker at the base where light does not reach
      const l = 0.55 + 0.45 * t;
      for (let dx = -w; dx <= w; dx += 0.5) put(x + dx, y, l * (1 - 0.25 * Math.abs(dx) / Math.max(0.3, w)), 1);
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

// ---------------------------------------------------------------------------
// One crossed-quad clump: two quads at right angles, 8 verts, 4 triangles.
// aWind is 0 at the roots and 1 at the tips, which is the whole of the bend.
// ---------------------------------------------------------------------------

export function clumpGeometry(quads = 2) {
  const pos = [], uv = [], nor = [], wind = [], idx = [];
  for (let q = 0; q < quads; q++) {
    const a = (q / quads) * Math.PI;
    const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
    const nx = -Math.sin(a), nz = Math.cos(a);
    const base = pos.length / 3;
    const corners = [[-cx, 0, -cz, 0, 0], [cx, 0, cz, 1, 0], [cx, 1, cz, 1, 1], [-cx, 1, -cz, 0, 1]];
    for (const [x, y, z, u, v] of corners) {
      pos.push(x, y, z); uv.push(u, v); nor.push(nx, 0.35, nz); wind.push(v * v);
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

const fadeUniforms = { uFadeStart: { value: RADIUS * 0.62 }, uFadeEnd: { value: RADIUS } };

/**
 * Wind, and the fade that lets the far ring cost nothing. The fade is a scale,
 * not an opacity: a blade shrinks into the turf, so nothing pops and nothing
 * needs sorting.
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
    shader.vertexShader = `
      uniform float uTime; uniform float uWind;
      uniform float uFadeStart; uniform float uFadeEnd;
      attribute float aWind;
    ` + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 gRoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 gRoot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      float gFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distance(gRoot, cameraPosition));
      transformed.y *= gFade;
      float gT = uTime * 1.9 + gRoot.x * 0.16 + gRoot.z * 0.13;
      float gS = aWind * uWind;
      transformed.x += sin(gT) * 0.30 * gS;
      transformed.z += sin(gT * 0.83 + 2.1) * 0.24 * gS;
      transformed.y -= abs(sin(gT)) * 0.07 * gS;
    `);
  };
  m.customProgramCacheKey = () => 'grass:wind';
  return m;
}

// ---------------------------------------------------------------------------

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function createGrass(parent, field, opts = {}) {
  const homeClear = opts.homeClear ?? 0;
  const span = Math.ceil(RADIUS / TILE) + 1;
  const maxTiles = opts.maxTiles ?? MAX_TILES;
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
    L.mesh = new THREE.InstancedMesh(L.geo, L.mat, maxTiles * L.per);
    L.mesh.name = 'grass:' + L.name;
    L.mesh.frustumCulled = false;          // one mesh covers the whole ring
    L.mesh.castShadow = false;
    L.mesh.receiveShadow = true;
    L.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // instanceColor must exist before the first setColorAt or three throws
    L.mesh.setColorAt(0, new THREE.Color(0xffffff));
    for (let i = 0; i < L.mesh.count; i++) L.mesh.setMatrixAt(i, ZERO);
    L.mesh.instanceMatrix.needsUpdate = true;
    parent.add(L.mesh);
  }

  const active = new Map();               // "tx,tz" -> slot
  const free = [];
  for (let i = maxTiles - 1; i >= 0; i--) free.push(i);
  const queue = [];                       // tiles waiting to be filled
  let density = 1;
  let centre = null;
  const stats = { tiles: 0, placed: 0, filled: 0, dropped: 0, sampled: 0, lastFillMs: 0 };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();

  function clearSlot(slot) {
    for (const L of layers) {
      const base = slot * L.per;
      for (let i = 0; i < L.per; i++) L.mesh.setMatrixAt(base + i, ZERO);
      L.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function fillTile(tx, tz, slot) {
    const t0 = performance.now();
    let placed = 0, dropped = 0, sampled = 0;
    for (const L of layers) {
      const base = slot * L.per;
      const want = Math.round(L.per * density);
      for (let i = 0; i < L.per; i++) {
        if (i >= want) { L.mesh.setMatrixAt(base + i, ZERO); continue; }
        const u = rand2(tx * 733 + i, tz, 4001 + L.salt);
        const v = rand2(tx, tz * 977 + i, 4002 + L.salt);
        const x = (tx + u) * TILE, z = (tz + v) * TILE;
        if (homeClear && Math.hypot(x, z) < homeClear) { L.mesh.setMatrixAt(base + i, ZERO); dropped++; continue; }
        // the thinning roll comes BEFORE the field sample, so a desert tile
        // costs a tenth of what a meadow tile costs instead of the same
        const roll = rand2(tx * 31 + i, tz * 17, 4003 + L.salt);
        if (roll > L.maxAmount) { L.mesh.setMatrixAt(base + i, ZERO); dropped++; continue; }
        const sp = field.sampleAt(x, z);
        sampled++;
        const turf = TURF[sp.biome];
        const amount = turf ? (turf[L.key] ?? turf.d) : 0;
        if (!turf || amount <= 0 || sp.water || roll > amount || sp.river > 0.18 || sp.road > 0.20) {
          L.mesh.setMatrixAt(base + i, ZERO); dropped++; continue;
        }
        const sz = lerp(L.size[0], L.size[1], rand2(i, tx + tz, 4004));
        const hy = lerp(L.height[0], L.height[1], rand2(i, tx - tz, 4005));
        e.set(0, rand2(i, tx * 3 + tz, 4006) * Math.PI, 0);
        q.setFromEuler(e);
        p3.set(x, sp.h - SINK, z);
        s3.set(sz, hy, sz);
        m4.compose(p3, q, s3);
        L.mesh.setMatrixAt(base + i, m4);
        col.setHex(turf.col).offsetHSL(
          (rand2(i, tx + tz * 7, 4007) - 0.5) * 0.035, 0,
          (rand2(i, tx * 7 + tz, 4008) - 0.5) * 0.12);
        L.mesh.setColorAt(base + i, col);
        placed++;
      }
      L.mesh.instanceMatrix.needsUpdate = true;
      if (L.mesh.instanceColor) L.mesh.instanceColor.needsUpdate = true;
    }
    stats.filled++;
    stats.placed = placed;
    stats.dropped = dropped;
    stats.sampled = sampled;
    stats.lastFillMs = performance.now() - t0;
  }

  /** Which tiles should be alive around (x, z), nearest first. */
  function wanted(x, z) {
    const cx = Math.floor(x / TILE), cz = Math.floor(z / TILE);
    const out = [];
    for (let dz = -span; dz <= span; dz++) for (let dx = -span; dx <= span; dx++) {
      const tx = cx + dx, tz = cz + dz;
      const d = Math.hypot((tx + 0.5) * TILE - x, (tz + 0.5) * TILE - z);
      if (d <= RADIUS + TILE) out.push({ tx, tz, d, key: tx + ',' + tz });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, maxTiles);
  }

  function retile(x, z) {
    const want = wanted(x, z);
    const keep = new Set(want.map((w) => w.key));
    for (const [key, slot] of [...active]) {
      if (keep.has(key)) continue;
      clearSlot(slot);
      active.delete(key);
      free.push(slot);
    }
    queue.length = 0;
    for (const w of want) if (!active.has(w.key)) queue.push(w);
    stats.tiles = active.size;
  }

  return {
    meshes: layers.map((L) => L.mesh),
    stats,
    get queued() { return queue.length; },

    /**
     * Every frame. Fills tiles until TILE_MS of this frame is gone, or
     * TILE_BUDGET tiles are done, whichever comes first, and always at least
     * one so the ring cannot stall. A fixed count was the wrong knob: a tile
     * of thick meadow costs three times a tile of desert, so two of them was
     * 1.8 ms on one biome and 0.4 ms on another.
     */
    update(nowMs, x, z) {
      if (density <= 0) return;
      const cx = Math.floor(x / TILE), cz = Math.floor(z / TILE);
      if (!centre || centre[0] !== cx || centre[1] !== cz) { centre = [cx, cz]; retile(x, z); }
      const t0 = performance.now();
      let n = 0;
      while (queue.length && n < TILE_BUDGET && (n === 0 || performance.now() - t0 < TILE_MS)) {
        const w = queue.shift();
        if (active.has(w.key)) continue;
        const slot = free.pop();
        if (slot === undefined) break;         // every slot is spoken for
        active.set(w.key, slot);
        fillTile(w.tx, w.tz, slot);
        n++;
      }
      stats.tiles = active.size;
    },

    /** The settings window's Grass density, 0 to 1. Takes effect as tiles refill. */
    setDensity(v) {
      const k = clamp01(Number.isFinite(v) ? v : 1);
      if (k === density) return;
      density = k;
      for (const L of layers) L.mesh.visible = k > 0;
      // drop every tile; update() refills them a few per frame
      for (const [key, slot] of [...active]) { clearSlot(slot); active.delete(key); free.push(slot); }
      centre = null;
      queue.length = 0;
    },
    get density() { return density; },

    setFade(start, end) { fadeUniforms.uFadeStart.value = start; fadeUniforms.uFadeEnd.value = end; },

    // the two sprite textures are module level and shared by every grass field
    // ever made, so an instance disposing them would blank the next one
    dispose() {
      for (const L of layers) { parent.remove(L.mesh); L.mesh.dispose(); L.geo.dispose(); L.mat.dispose(); }
    },
  };
}
