// Weapons, shields and the hand held oddments, built in code.
//
// Every base in items.js whose kind is weapon, shield, offhand, instrument or
// tool gets a real model here. There are no boxes standing in for swords: a
// blade is a lofted lens section with a fuller, an axe is an extruded crescent
// with a bevelled edge, a bow is a tube along a curve with a string strung
// between its tips.
//
// THE HOLD CONTRACT
//
//   The grip is at the origin and the business end runs along +y.
//
// That is what lets `gear_visuals.js` drop a model straight into `handR` and
// have it come out of the fist the right way round. A sword's pommel therefore
// sits at negative y and its point at positive y; the total y extent of the
// model is the weapon's length, and `LENGTHS` below states every one of them
// in metres. weapon_models.test.mjs measures the bounding box against that
// table, so a model that drifts is caught rather than shipped.
//
// MATERIALS
//
// Nothing here is a flat colour. Metal is brushed with anisotropic streaks
// running along the blade, wood has grain and rings, leather has a pebbled
// grain, cloth is woven over and under. Each family generates an albedo, a
// packed roughness/metalness map and a normal map as DataTextures, which is
// the one way to make a texture that works identically in the browser and in
// node, so the tests measure the real materials and not a stub.
//
// Metal colour comes from `item.material` through the ten ore tiers of
// ores.js. The colour words in that file ("warm brown", "blue black", "matte
// black, no shine") are the source of truth; METAL_COLOURS is those words in
// hex, and auditWeaponModels() fails if a metal ever exists without one.
//
// RARITY
//
// Epic and above get an emissive rune line down the blade in the rarity
// colour. Legendary gets a soft light with it. Below epic there is no glow at
// all, because a common iron sword that shines is a lie about what it is.

import * as THREE from 'three';
import { BASES, RARITY, RARITY_ORDER, baseFor } from '../mmo/items.js';
import { ORES, ALLOYS, METAL, WOODS, LEATHERS } from '../mmo/ores.js';

// ---------------------------------------------------------------------------
// Noise. Value noise on an integer lattice, fbm on top of it. Deterministic
// from the seed, so the same texture comes out in node and in the browser.

function h2(x, y, s) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 1274126177;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t) => t * t * (3 - 2 * t);

/** Tiling value noise: the lattice wraps at `period` so the texture has no seam. */
function vnoise(x, y, s, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const w = (v) => ((v % period) + period) % period;
  const x0 = w(xi), x1 = w(xi + 1), y0 = w(yi), y1 = w(yi + 1);
  const a = h2(x0, y0, s), b = h2(x1, y0, s), c = h2(x0, y1, s), d = h2(x1, y1, s);
  const u = smooth(xf), v = smooth(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x, y, s, period, octaves = 4, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f, y * f, s + i * 977, period * f);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------------------------
// Texture generation. A family is a function (u, v) -> { l, r, m, h }:
//   l  luminance of the albedo, 0..1, multiplied by the material's colour
//   r  roughness 0..1
//   m  metalness 0..1
//   h  height, for the normal map
//
// The albedo is deliberately near grey so `material.color` is what tints it.
// That is also what keeps npcs_runtime's colour matching working on the body.

export const TEX_SIZE = 192;          // 192^2 x 3 maps x 15 families is 6.3 MB and about 140 ms, once, at boot
const TEX_CACHE = new Map();

function dataTexture(size, bytes, srgb) {
  const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Build the three maps of one family. Cached by name: every iron sword in the
 * world shares one brushed metal texture, which is the difference between a
 * texture budget and a memory leak.
 */
export function textureSet(name, repeat = 1) {
  const key = repeat === 1 ? name : `${name}@${repeat}`;
  const hit = TEX_CACHE.get(key);
  if (hit) return hit;
  if (repeat !== 1) {
    const base = textureSet(name, 1);
    const set = {};
    for (const k of Object.keys(base)) {
      const t = base[k].clone();        // shares the image, carries its own repeat
      t.repeat.set(repeat, repeat);
      t.needsUpdate = true;
      set[k] = t;
    }
    TEX_CACHE.set(key, set);
    return set;
  }
  const fn = FAMILIES[name];
  if (!fn) throw new Error(`weapon_models: no texture family "${name}"`);
  const n = TEX_SIZE;
  const alb = new Uint8Array(n * n * 4);
  const orm = new Uint8Array(n * n * 4);
  const hgt = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const s = fn(x / n, y / n);
      const l = Math.max(0, Math.min(1, s.l));
      alb[i * 4] = (l * 255) | 0;
      alb[i * 4 + 1] = (l * (s.tintG == null ? 1 : s.tintG) * 255) | 0;
      alb[i * 4 + 2] = (l * (s.tintB == null ? 1 : s.tintB) * 255) | 0;
      alb[i * 4 + 3] = 255;
      orm[i * 4] = 255;                                                   // ao, unused
      orm[i * 4 + 1] = (Math.max(0, Math.min(1, s.r)) * 255) | 0;         // roughness
      orm[i * 4 + 2] = (Math.max(0, Math.min(1, s.m || 0)) * 255) | 0;    // metalness
      orm[i * 4 + 3] = 255;
      hgt[i] = s.h;
    }
  }
  // normal map by central difference on the height field, wrapping at the edge
  const nrm = new Uint8Array(n * n * 4);
  const at = (x, y) => hgt[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
  const strength = fn.strength == null ? 2.2 : fn.strength;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(-dx, -dy, 1);
      const i = (y * n + x) * 4;
      nrm[i] = (((-dx / len) * 0.5 + 0.5) * 255) | 0;
      nrm[i + 1] = (((-dy / len) * 0.5 + 0.5) * 255) | 0;
      nrm[i + 2] = ((1 / len) * 0.5 + 0.5) * 255 | 0;
      nrm[i + 3] = 255;
    }
  }
  // The albedo is a luminance MULTIPLIER on material.color, so it is stored
  // linear. Flagged sRGB it was decoded on the way in: a 0.72 grey became 0.48,
  // and every cloth and leather on the body lost half a stop it never had in
  // its palette. Half a stop on top of a dark palette is a black character.
  const set = {
    map: dataTexture(n, alb, false),
    ormMap: dataTexture(n, orm, false),
    normalMap: dataTexture(n, nrm, false),
  };
  TEX_CACHE.set(key, set);
  return set;
}

/** The texture families. Every material in this file and in gear_visuals.js draws from one of these. */
export const FAMILIES = {
  // Brushed metal: long streaks along v, fine speckle across, a few pits.
  //
  // The r and m channels MULTIPLY the material's scalars, so they are written
  // as modulations near 1 rather than as absolute values. Writing them as
  // absolutes (roughness 0.2, metalness 1) is what made every blade in the
  // game render nearly black: there is no environment map in the scene, and a
  // fully metallic surface with nothing to reflect has no diffuse term left.
  // The steel now reads as steel off the sun alone; see METAL_METALNESS.
  metal(u, v) {
    const streak = fbm(u * 220, v * 5, 11, 220, 3, 0.55);
    const grain = fbm(u * 64, v * 64, 23, 64, 4);
    const pit = Math.max(0, fbm(u * 26, v * 26, 41, 26, 2) - 0.72) * 3;
    const l = 0.74 + streak * 0.16 + grain * 0.06 - pit * 0.25;
    return { l, r: 0.80 + streak * 0.18 + pit * 0.20, m: 0.90 + streak * 0.10 - pit * 0.40, h: streak * 0.7 + grain * 0.3 - pit * 1.4 };
  },
  // Plate: the same steel, hammered, so the streaks are broader and dented.
  plate(u, v) {
    const streak = fbm(u * 90, v * 8, 7, 90, 3, 0.55);
    const dent = fbm(u * 12, v * 12, 19, 12, 3);
    const l = 0.76 + streak * 0.10 + (dent - 0.5) * 0.10;
    return { l, r: 0.82 + streak * 0.12 + dent * 0.08, m: 0.92 + streak * 0.08, h: dent * 1.6 + streak * 0.4 };
  },
  // Wood: rings across u, fibre along v.
  wood(u, v) {
    const rings = Math.abs(Math.sin((u * 7 + fbm(u * 6, v * 2, 5, 6, 3) * 1.6) * Math.PI));
    const fibre = fbm(u * 20, v * 150, 13, 20, 3);
    const l = 0.52 + rings * 0.26 + fibre * 0.16;
    return { l, tintG: 0.93, tintB: 0.84, r: 0.60 + (1 - rings) * 0.22, m: 0, h: rings * 0.8 + fibre * 0.5 };
  },
  // Leather: a pebbled grain, cells of two sizes.
  leather(u, v) {
    const cell = fbm(u * 40, v * 40, 3, 40, 3, 0.62);
    const fine = fbm(u * 130, v * 130, 29, 130, 2);
    const crease = Math.max(0, 0.55 - Math.abs(fbm(u * 9, v * 9, 47, 9, 2) - 0.5) * 4);
    const l = 0.56 + cell * 0.24 + fine * 0.10 - crease * 0.12;
    return { l, tintG: 0.95, tintB: 0.9, r: 0.72 + cell * 0.16, m: 0, h: cell * 1.3 + fine * 0.4 - crease * 1.0 };
  },
  // A grip wrap: leather in a helix, so the ridges spiral round the handle.
  wrap(u, v) {
    const helix = Math.abs(((u * 3 + v * 9) % 1) - 0.5) * 2;
    const cell = fbm(u * 50, v * 50, 3, 50, 3, 0.62);
    const l = 0.48 + helix * 0.16 + cell * 0.18;
    return { l, tintG: 0.94, tintB: 0.88, r: 0.74 + cell * 0.14, m: 0, h: helix * 1.6 + cell * 0.5 };
  },
  // Woven cloth: warp and weft, over and under.
  cloth(u, v) {
    const warp = Math.sin(u * Math.PI * 60);
    const weft = Math.sin(v * Math.PI * 60);
    const weave = (warp * weft > 0 ? 0.62 : 0.38) + Math.abs(warp) * 0.12;
    const fuzz = fbm(u * 90, v * 90, 61, 90, 3);
    const l = 0.52 + weave * 0.26 + fuzz * 0.14;
    return { l, r: 0.86 + fuzz * 0.10, m: 0, h: weave * 1.0 + fuzz * 0.5 };
  },
  // Ring mail: rings sewn flat onto a backing, in offset rows.
  ring(u, v) {
    const rows = 14;
    const ry = v * rows, row = Math.floor(ry), fy = ry - row;
    const rx = u * rows + (row % 2) * 0.5, fx = rx - Math.floor(rx);
    const d = Math.hypot(fx - 0.5, (fy - 0.5) * 1.0);
    const ringed = Math.max(0, 1 - Math.abs(d - 0.34) * 9);
    const backing = fbm(u * 60, v * 60, 71, 60, 3);
    const l = 0.34 + ringed * 0.44 + backing * 0.12;
    return { l, r: 0.74 + (1 - ringed) * 0.26, m: 0.52 + ringed * 0.48, h: ringed * 2.0 + backing * 0.3 };
  },
  // Chain: interlocked links, denser, and every row lies the other way.
  chain(u, v) {
    const rows = 20;
    const ry = v * rows, row = Math.floor(ry), fy = ry - row;
    const rx = u * rows + (row % 2) * 0.5, fx = rx - Math.floor(rx);
    const sq = (row % 2) ? 1.35 : 0.75;
    const d = Math.hypot((fx - 0.5) * sq, (fy - 0.5) / sq);
    const linked = Math.max(0, 1 - Math.abs(d - 0.3) * 11);
    const l = 0.28 + linked * 0.5;
    return { l, r: 0.72 + (1 - linked) * 0.28, m: 0.56 + linked * 0.44, h: linked * 2.2 };
  },
  // Studded leather: the leather family with rivets punched through it.
  studded(u, v) {
    const base = FAMILIES.leather(u, v);
    const g = 9;
    const gx = u * g, gy = v * g;
    const d = Math.hypot(gx - Math.floor(gx) - 0.5, gy - Math.floor(gy) - 0.5);
    const stud = Math.max(0, 1 - d * 5);
    return {
      l: base.l * (1 - stud) + 0.78 * stud,
      tintG: 1 - (1 - 0.95) * (1 - stud), tintB: 1 - (1 - 0.9) * (1 - stud),
      r: base.r * (1 - stud) + 0.3 * stud,
      m: stud,
      h: base.h + stud * 2.4,
    };
  },
  // Bone: pale, porous, with a fine crazing.
  bone(u, v) {
    const pore = fbm(u * 110, v * 110, 83, 110, 3);
    const crack = Math.max(0, 0.5 - Math.abs(fbm(u * 14, v * 14, 89, 14, 3) - 0.5) * 5);
    const l = 0.78 + pore * 0.14 - crack * 0.22;
    return { l, tintG: 0.97, tintB: 0.88, r: 0.62 + pore * 0.2, m: 0, h: pore * 0.6 - crack * 1.4 };
  },
  // Paper, for the pages of a book.
  paper(u, v) {
    const leaves = Math.abs(Math.sin(v * Math.PI * 90));
    const stain = fbm(u * 18, v * 18, 97, 18, 3);
    const l = 0.80 - leaves * 0.16 - stain * 0.14;
    return { l, tintG: 0.97, tintB: 0.88, r: 0.92, m: 0, h: leaves * 1.2 };
  },
  // Rope and bowstring: a tight twist.
  cord(u, v) {
    const twist = Math.abs(((v * 26 + u * 2) % 1) - 0.5) * 2;
    const fuzz = fbm(u * 70, v * 70, 101, 70, 2);
    const l = 0.55 + twist * 0.24 + fuzz * 0.12;
    return { l, r: 0.88, m: 0, h: twist * 1.6 };
  },
  // Skin: pores and a faint mottling, never a flat colour.
  skin(u, v) {
    const pore = fbm(u * 150, v * 150, 131, 150, 3);
    const mottle = fbm(u * 11, v * 11, 137, 11, 3);
    const l = 0.84 + (mottle - 0.5) * 0.10 + (pore - 0.5) * 0.07;
    return { l, tintG: 0.995, tintB: 0.99, r: 0.62 + pore * 0.14, m: 0, h: pore * 0.35 };
  },
  // Hair: strands running along v, clumped.
  hair(u, v) {
    const strand = fbm(u * 190, v * 9, 149, 190, 3, 0.6);
    const clump = fbm(u * 26, v * 6, 151, 26, 2);
    const l = 0.60 + strand * 0.30 + clump * 0.14;
    return { l, r: 0.42 + strand * 0.30, m: 0, h: strand * 1.5 + clump * 0.4 };
  },
  // Stone, for a maul head and a masonry pick.
  stone(u, v) {
    const grit = fbm(u * 55, v * 55, 107, 55, 4);
    const chip = Math.max(0, fbm(u * 15, v * 15, 109, 15, 2) - 0.6) * 2.5;
    const l = 0.46 + grit * 0.26 - chip * 0.1;
    return { l, r: 0.84 + grit * 0.12, m: 0, h: grit * 1.1 - chip * 1.6 };
  },
};
FAMILIES.metal.strength = 1.4;
FAMILIES.plate.strength = 1.8;
FAMILIES.ring.strength = 3.0;
FAMILIES.chain.strength = 3.0;
FAMILIES.studded.strength = 3.0;
FAMILIES.skin.strength = 0.7;
FAMILIES.hair.strength = 2.4;

// ---------------------------------------------------------------------------
// Colours. ores.js gives every metal a colour in words; these are those words
// in hex, and nothing else in the game is allowed to invent a metal colour.

// These are BASE TINTS, multiplied by an albedo map whose mean luminance is
// about 0.74, so what a player sees is roughly three quarters of the hex here.
// Iron at the old 0x6e7378 therefore rendered at about 0x515559, which is not
// "dark grey", it is charcoal, and next to a brown leather glove in daylight
// it read as dark wood. Every hex below is chosen so that the RENDERED colour
// is the ores.js colour word, not so that the hex itself is.
export const METAL_COLOURS = {
  copper: 0xb87333,      // "warm brown"
  tin: 0xcfd3d6,         // "grey white"
  bronze: 0xc08a3e,      // the alloy of the two
  iron: 0x9aa0a8,        // "dark grey": renders about 0x727780
  silver: 0xe6e8ee,      // "bright"
  coldiron: 0x3d4757,    // "blue black": renders about 0x2d3440
  emberite: 0x8f3a2a,    // "red veined"
  rimesteel: 0xa9c8dc,   // "pale blue"
  verdite: 0x8ea14a,     // "green gold"
  voidrock: 0x28282c,    // "matte black, no shine": renders about 0x1d1d20
  starfall: 0xb9bcc4,    // "grey with a white flash"
};

export const WOOD_COLOURS = { oak: 0x8b6f47, ash: 0xc2a578, heartwood: 0x7a4a2b, ironbark: 0x4a3b30 };
export const LEATHER_COLOURS = { hide: 0x8a5a34, thickHide: 0x6b4426, scaledHide: 0x4a5a48 };
export const CLOTH_COLOUR = 0x8d7f6a;
export const BONE_COLOUR = 0xd8d0bd;

// How metal is lit here. There is no environment map in the scene: the sun,
// the hemisphere fill and nothing else. A MeshPhysicalMaterial at metalness 1
// has no diffuse response at all, so with nothing to reflect it renders black,
// which is exactly what shipped. Holding metalness below one leaves a diffuse
// share of the base colour that the sun can light, and a roughness in the
// third to the half gives the blade a specular streak instead of a mirror
// nobody can see. When an environment map exists these can go back up.
export const METAL_METALNESS = 0.70;      // 0.6 to 0.75 is the readable band
export const METAL_BASE_ROUGH = 0.38;     // times the map's 0.80..1.00 modulation
/** So a blade in shade is dark steel rather than a silhouette. */
export const METAL_EMISSIVE = 0x0a0a0c;

/** Voidrock does not shine and starfall does. Per metal roughness, added to the base. */
const METAL_ROUGH = { voidrock: 0.04, coldiron: 0.03, silver: -0.06, starfall: -0.05, rimesteel: -0.02, copper: 0.03, bronze: 0.04 };

/** The hex a material id reads as, whichever table it lives in. Null when unknown. */
export function colourOfMaterial(id) {
  if (id == null) return null;
  if (METAL_COLOURS[id] != null) return METAL_COLOURS[id];
  if (WOOD_COLOURS[id] != null) return WOOD_COLOURS[id];
  if (LEATHER_COLOURS[id] != null) return LEATHER_COLOURS[id];
  if (id === 'cloth') return CLOTH_COLOUR;
  if (id === 'bone') return BONE_COLOUR;
  return null;
}

export const isMetal = (id) => METAL_COLOURS[id] != null;

// ---------------------------------------------------------------------------
// Materials. Physically based, textured, cached by family and colour so a
// hundred iron daggers share one material.

const MAT_CACHE = new Map();

/**
 * @param {string} family  a key of FAMILIES
 * @param {number} colour  hex tint, multiplied over the albedo
 * @param {object} o       { rough, metal, sheen, clearcoat, emissive, emissiveIntensity }
 */
export function pbr(family, colour, o = {}) {
  const key = `${family}|${colour}|${o.rough ?? ''}|${o.metal ?? ''}|${o.clearcoat ?? ''}|${o.sheen ?? ''}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.normalScale ?? ''}|${o.repeat ?? ''}|${o.flat ? 'f' : ''}|${o.side ?? ''}`;
  const hit = MAT_CACHE.get(key);
  if (hit) return hit;
  const t = textureSet(family, o.repeat || 1);
  const m = new THREE.MeshPhysicalMaterial({
    color: colour,
    map: t.map,
    roughnessMap: t.ormMap,
    metalnessMap: t.ormMap,
    normalMap: t.normalMap,
    roughness: o.rough == null ? 1 : o.rough,
    metalness: o.metal == null ? 1 : o.metal,
    flatShading: !!o.flat,
    side: o.side == null ? THREE.FrontSide : o.side,
  });
  m.normalScale = new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1);
  if (o.clearcoat) { m.clearcoat = o.clearcoat; m.clearcoatRoughness = o.clearcoatRoughness ?? 0.3; }
  if (o.sheen) { m.sheen = o.sheen; m.sheenColor = new THREE.Color(o.sheenColour ?? 0xffffff); m.sheenRoughness = 0.6; }
  if (o.emissive != null) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  MAT_CACHE.set(key, m);
  return m;
}

export const metalMat = (id = 'iron') => pbr('metal', METAL_COLOURS[id] ?? METAL_COLOURS.iron, {
  rough: METAL_BASE_ROUGH + (METAL_ROUGH[id] || 0), metal: METAL_METALNESS, repeat: 3,
  emissive: METAL_EMISSIVE,
  clearcoat: id === 'silver' || id === 'starfall' ? 0.4 : 0,
});
export const plateMat = (id = 'iron') => pbr('plate', METAL_COLOURS[id] ?? METAL_COLOURS.iron, {
  rough: METAL_BASE_ROUGH + 0.02 + (METAL_ROUGH[id] || 0), metal: METAL_METALNESS, repeat: 2,
  emissive: METAL_EMISSIVE,
});
export const woodMat = (id = 'oak') => pbr('wood', WOOD_COLOURS[id] ?? WOOD_COLOURS.oak, { rough: 1, metal: 0, repeat: 2 });
export const leatherMat = (id = 'hide') => pbr('leather', LEATHER_COLOURS[id] ?? LEATHER_COLOURS.hide, { rough: 1, metal: 0, repeat: 3 });
export const wrapMat = (id = 'hide') => pbr('wrap', LEATHER_COLOURS[id] ?? LEATHER_COLOURS.hide, { rough: 1, metal: 0, repeat: 2 });
export const clothMat = (colour = CLOTH_COLOUR) => pbr('cloth', colour, { rough: 1, metal: 0, sheen: 0.4, repeat: 3 });
export const boneMat = () => pbr('bone', BONE_COLOUR, { rough: 1, metal: 0, repeat: 2 });
export const paperMat = () => pbr('paper', 0xe8dcc0, { rough: 1, metal: 0 });
export const cordMat = (colour = 0xbaa87e) => pbr('cord', colour, { rough: 1, metal: 0, repeat: 4 });
export const stoneMat = (colour = 0x7a7a74) => pbr('stone', colour, { rough: 1, metal: 0, repeat: 2 });

/** The emissive material a rune line is drawn in. */
export function runeMat(colour) {
  return pbr('metal', colour, { rough: 0.5, metal: 0, emissive: colour, emissiveIntensity: 2.2 });
}

// ---------------------------------------------------------------------------
// Geometry kit. Everything is built from four builders: a loft (a closed
// profile swept along y with per ring scale), a lathe (a silhouette spun),
// an extrusion (a 2D shape given thickness and a bevel), and a tube (a
// profile swept along a curve).

/** n points on a unit circle, counter clockwise in x/z. */
export function circle(n) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push([Math.cos(a), Math.sin(a)]); }
  return p;
}

/** A rounded rectangle profile, half extents 1 by `d`, corners rounded by `r`. */
export function roundRect(d, r = 0.35, per = 4) {
  const p = [];
  const cx = 1 - r, cz = d - r * d;
  const corners = [[cx, cz, 0], [-cx, cz, Math.PI / 2], [-cx, -cz, Math.PI], [cx, -cz, -Math.PI / 2]];
  for (const [x, z, a0] of corners) {
    for (let i = 0; i <= per; i++) {
      const a = a0 + (i / per) * (Math.PI / 2);
      p.push([x + Math.cos(a) * r, z + Math.sin(a) * r * (d > 0 ? 1 : 1)]);
    }
  }
  return p;
}

/**
 * A blade cross section: two cutting edges at x = +/-1, faces swelling to
 * z = +/-1, and a fuller (the groove down the middle of a real blade) at
 * z = +/-`fuller`. Twelve points, which is enough to catch a highlight.
 */
export function bladeSection(fuller = 0.72) {
  return [
    [1, 0], [0.72, 0.60], [0.34, 1.0], [0, fuller], [-0.34, 1.0], [-0.72, 0.60],
    [-1, 0], [-0.72, -0.60], [-0.34, -1.0], [0, -fuller], [0.34, -1.0], [0.72, -0.60],
  ];
}

/**
 * Sweep `profile` (points in x/z) along `rings` (each { y, sx, sz, dx, dz }).
 * Caps both ends. Winding is fixed after the fact by checking one normal
 * against its own radial direction, so a profile wound either way comes out
 * facing outward.
 */
export function loft(profile, rings, opts = {}) {
  const n = profile.length, m = rings.length;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < m; j++) {
    const r = rings[j];
    const sz = r.sz == null ? r.sx : r.sz;
    for (let i = 0; i <= n; i++) {
      const p = profile[i % n];
      pos.push(p[0] * r.sx + (r.dx || 0), r.y, p[1] * sz + (r.dz || 0));
      uv.push(i / n, (r.v == null ? j / (m - 1) : r.v));
    }
  }
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (ringIndex, up) => {
    const r = rings[ringIndex];
    const sz = r.sz == null ? r.sx : r.sz;
    const centre = pos.length / 3;
    pos.push(r.dx || 0, r.y, r.dz || 0);
    uv.push(0.5, 0.5);
    const first = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const p = profile[i];
      pos.push(p[0] * r.sx + (r.dx || 0), r.y, p[1] * sz + (r.dz || 0));
      uv.push(0.5 + p[0] * 0.5, 0.5 + p[1] * 0.5);
    }
    for (let i = 0; i < n; i++) {
      const a = first + i, b = first + ((i + 1) % n);
      // measured, not guessed: with the profile wound counter clockwise in x/z
      // and the rings running up +y, (centre, b, a) is the fan that faces -y.
      // Getting this backwards made every ferrule and every end cap render
      // inside out, which a solid weapon hides and a thin one does not.
      if (up) idx.push(centre, b, a); else idx.push(centre, a, b);
    }
  };
  if (opts.capBottom !== false) cap(0, false);
  if (opts.capTop !== false) cap(m - 1, true);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // face outward: compare the first side vertex's normal with its own radius
  const na = g.getAttribute('normal');
  const pa = g.getAttribute('position');
  const mid = Math.floor(m / 2) * (n + 1);
  const rx = pa.getX(mid) - (rings[Math.floor(m / 2)].dx || 0);
  const rz = pa.getZ(mid) - (rings[Math.floor(m / 2)].dz || 0);
  if (na.getX(mid) * rx + na.getZ(mid) * rz < 0) {
    const ix = g.getIndex().array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.getIndex().needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

/**
 * Spin a silhouette (points [radius, y]) about the y axis. LatheGeometry winds
 * its faces from the order of the points, so a silhouette written from the
 * crown down comes out inside out. Rather than make every caller remember
 * that, the list is turned the right way up here.
 */
export function lathe(points, segments = 20) {
  const list = points[0][1] > points[points.length - 1][1] ? [...points].reverse() : points;
  const v = list.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y));
  return new THREE.LatheGeometry(v, segments);
}

/** Give a flat shape thickness along z, with a small bevel so the edge catches light. */
export function slab(shape, depth, bevel = 0.006, curveSegments = 10) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - bevel * 2), bevelEnabled: bevel > 0,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments,
  });
  g.translate(0, 0, -depth / 2 + bevel);
  return g;
}

/** Reverse the index order of a geometry, which is what a mirror scale needs. */
export function flipWinding(g) {
  const ix = g.getIndex();
  if (ix) {
    const a = ix.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    ix.needsUpdate = true;
  } else {
    // ExtrudeGeometry arrives without an index, so the swap is on the vertices
    for (const name of Object.keys(g.attributes)) {
      const at = g.attributes[name], n = at.itemSize, a = at.array;
      for (let t = 0; t < at.count; t += 3) {
        for (let k = 0; k < n; k++) {
          const i = (t + 1) * n + k, j = (t + 2) * n + k;
          const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
      }
      at.needsUpdate = true;
    }
  }
  g.computeVertexNormals();
  return g;
}

/** A round section swept along a curve: bow limbs, wire, a bent pick head. */
export function tube(points, radius, tubular = 20, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2] || 0)));
  return new THREE.TubeGeometry(curve, tubular, radius, radial, false);
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/** Triangles in an object and everything under it. */
export function countTriangles(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += g.index ? g.index.count / 3 : (g.getAttribute('position')?.count || 0) / 3;
  });
  return Math.round(n);
}

/** Free the geometry a model owns. Materials and textures are shared and stay. */
export function disposeModel(obj) {
  if (!obj) return;
  obj.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  if (obj.parent) obj.parent.remove(obj);
}

// ---------------------------------------------------------------------------
// Parts kit. Each returns a mesh or a small group in the hold contract's
// frame: origin at the grip, business end up.

/** A leather wrapped handle from y0 to y1. */
function grip(y0, y1, r, mat) {
  const rings = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const swell = 1 + Math.sin(t * Math.PI) * 0.10;      // a handle is fatter in the middle
    rings.push({ y: y0 + (y1 - y0) * t, sx: r * swell, v: t * 2 });
  }
  return mesh(loft(circle(12), rings), mat);
}

/** A plain haft or shaft, tapering slightly toward the head. */
function haft(y0, y1, r0, r1, mat, seg = 5) {
  const rings = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    rings.push({ y: y0 + (y1 - y0) * t, sx: r0 + (r1 - r0) * t, v: t * (y1 - y0) * 3 });
  }
  return mesh(loft(circle(12), rings), mat);
}

/** A pommel: a spun counterweight under the grip. */
function pommel(y, r, mat) {
  const pts = [[0.02, -r * 1.1], [r * 0.7, -r * 0.9], [r, -r * 0.2], [r * 0.9, r * 0.4], [r * 0.4, r * 0.8], [0.02, r * 0.85]];
  const g = lathe(pts, 16);
  g.translate(0, y, 0);
  return mesh(g, mat);
}

/** A crossguard: a bar across x that flares at the ends and thins in the middle. */
function crossguard(y, halfSpan, thick, deep, mat) {
  const rings = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (t * 2 - 1) * halfSpan;
    const swell = 0.6 + 0.4 * Math.abs(t * 2 - 1) + 0.5 * Math.exp(-((t * 2 - 1) ** 2) * 12);
    rings.push({ y: x, sx: thick * swell, sz: deep * swell, v: t });
  }
  const g = loft(circle(10), rings);
  g.rotateZ(Math.PI / 2);
  g.translate(0, y, 0);
  return mesh(g, mat);
}

/**
 * A blade from y0 to y1. `w` is the half width at the base, `t` the half
 * thickness; it tapers to a point.
 *
 * Real proportions, because a blade that is as thick as it is narrow reads as
 * a stick: a longsword blade is 40 to 50 mm across and about 3 mm at the
 * spine, so w is near 0.023 and t near 0.0016. The section already carries a
 * flat, a fuller and two edges; at those numbers they are visible from two and
 * a half metres, and at the old t = 0.0062 (12 mm of spine) they were not.
 */
function blade(y0, y1, w, t, mat, opts = {}) {
  const len = y1 - y0;
  const n = opts.sections || 9;
  const tipFrom = opts.tipFrom == null ? 0.78 : opts.tipFrom;
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    let sw;
    if (u < tipFrom) sw = 1 - u * (opts.taper == null ? 0.30 : opts.taper);
    else {
      const k = (u - tipFrom) / (1 - tipFrom);
      sw = (1 - tipFrom * (opts.taper == null ? 0.30 : opts.taper)) * Math.sqrt(Math.max(0, 1 - k * k));
    }
    rings.push({ y: y0 + len * u, sx: Math.max(0.0006, w * sw), sz: Math.max(0.0004, t * (0.55 + 0.45 * sw)), v: u * len * 2 });
  }
  return mesh(loft(bladeSection(opts.fuller), rings), mat);
}

/** A rune line down a blade, drawn just proud of the face on both sides. */
function runeLine(group, y0, y1, halfW, halfT, colour) {
  const m = runeMat(colour);
  for (const s of [1, -1]) {
    const g = new THREE.BoxGeometry(halfW * 0.22, y1 - y0, 0.0016);
    g.translate(0, (y0 + y1) / 2, s * (halfT * 0.78));
    const o = new THREE.Mesh(g, m);
    o.castShadow = false;
    group.add(o);
  }
}

/** An axe bit: a crescent that sweeps out from the haft. */
function axeBit(size, mat, mirror = false, depth = 0.016) {
  const s = new THREE.Shape();
  s.moveTo(0, -size * 0.34);
  s.quadraticCurveTo(size * 0.85, -size * 0.62, size * 1.05, -size * 0.10);
  s.quadraticCurveTo(size * 1.12, size * 0.30, size * 0.80, size * 0.60);
  s.quadraticCurveTo(size * 0.40, size * 0.40, 0, size * 0.40);
  s.lineTo(0, -size * 0.34);
  const g = slab(s, depth, size * 0.05);
  // a mirror scale turns every face inside out; flipping the indices puts them back
  if (mirror) flipWinding(g.scale(-1, 1, 1));
  return mesh(g, mat);
}

/** A spear or glaive head: a leaf blade on a socket. */
function leafHead(y0, len, w, t, mat) {
  const rings = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const sw = Math.sin(Math.min(1, u * 1.15) * Math.PI) * 0.75 + (1 - u) * 0.35;
    rings.push({ y: y0 + len * u, sx: Math.max(0.0006, w * sw), sz: Math.max(0.0004, t * (0.5 + 0.5 * sw)), v: u * 2 });
  }
  return mesh(loft(bladeSection(0.8), rings), mat);
}

/** A flanged mace head. */
function maceHead(y, size, mat) {
  const g = new THREE.Group();
  const core = lathe([[0.02, -size], [size * 0.5, -size * 0.8], [size * 0.62, 0], [size * 0.5, size * 0.8], [0.02, size]], 14);
  core.translate(0, y, 0);
  g.add(mesh(core, mat));
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Shape();
    s.moveTo(0, -size * 0.85); s.lineTo(size * 0.95, -size * 0.25);
    s.lineTo(size * 0.95, size * 0.25); s.lineTo(0, size * 0.85); s.lineTo(0, -size * 0.85);
    const fg = slab(s, size * 0.16, size * 0.05, 4);
    fg.rotateY((i / 6) * Math.PI * 2);
    fg.translate(0, y, 0);
    g.add(mesh(fg, mat));
  }
  return g;
}

/** A bow: two limbs curving away from the grip, and the string between the nocks. */
function bowStave(len, mat, stringMat, opts = {}) {
  const g = new THREE.Group();
  const h = len / 2;
  const belly = opts.belly == null ? 0.10 : opts.belly;
  const recurve = opts.recurve || 0;
  // the belly the stave curves through, as a function of height, so the taper
  // below can ask for the centre line at any y instead of guessing at it from
  // a control point index
  const zAt = (y) => {
    const k = y / h;
    let z = -belly * (1 - k * k);
    if (recurve) z += recurve * Math.max(0, Math.abs(k) - 0.72) / 0.28;
    return z;
  };
  const pts = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const y = -h + len * (i / n);
    pts.push([0, y, zAt(y)]);
  }
  const r0 = opts.limbR || 0.011;
  const stave = tube(pts, r0, 26, 8);
  // a limb is thickest at the grip and thinnest at the nock: shrink each ring
  // toward the centre line, which is a scale and never a mirror, so the faces
  // stay wound the way they were
  const pa = stave.getAttribute('position');
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    const s = 1 - Math.min(1, Math.abs(y) / h) * 0.55;
    const cz = zAt(y);
    pa.setX(i, pa.getX(i) * s);
    pa.setZ(i, cz + (pa.getZ(i) - cz) * s);
  }
  pa.needsUpdate = true;
  stave.computeVertexNormals();
  g.add(mesh(stave, mat));
  const tipZ = pts[n][2];
  const sg = new THREE.CylinderGeometry(0.0022, 0.0022, len * 0.985, 5);
  sg.translate(0, 0, tipZ);
  g.add(mesh(sg, stringMat));
  return g;
}

/** A shield face: a flat shape given a gentle curve away from the bearer. */
function shieldFace(shape, depth, bulge, mat, curveSegments = 14) {
  const g = slab(shape, depth, depth * 0.3, curveSegments);
  const pa = g.getAttribute('position');
  let maxX = 0, maxY = 0;
  for (let i = 0; i < pa.count; i++) { maxX = Math.max(maxX, Math.abs(pa.getX(i))); maxY = Math.max(maxY, Math.abs(pa.getY(i))); }
  for (let i = 0; i < pa.count; i++) {
    const kx = maxX ? pa.getX(i) / maxX : 0;
    const ky = maxY ? pa.getY(i) / maxY : 0;
    pa.setZ(i, pa.getZ(i) + bulge * (1 - kx * kx) * (1 - ky * ky * 0.5));
  }
  pa.needsUpdate = true;
  g.computeVertexNormals();
  return mesh(g, mat);
}

// ---------------------------------------------------------------------------
// The table of lengths, in metres, measured as the y extent of the model.
// weapon_models.test.mjs holds every model to within 10% of its row.

export const LENGTHS = {
  // weapons
  dagger: 0.35, rapier: 1.05, spear: 2.00, shortsword: 0.75, longsword: 1.00,
  greatsword: 1.50, axe: 0.80, battleaxe: 1.40, mace: 0.70, warhammer: 1.10,
  maul: 1.20, halberd: 2.20, glaive: 2.00, quarterstaff: 1.80, bone_staff: 1.80,
  // the two foci: a wand is a forearm, a staff stands over its owner
  wand: 0.37, staff: 2.00,
  shortbow: 1.20, longbow: 1.70, crossbow: 0.75, throwing_knives: 0.28,
  // shields, measured tall
  buckler: 0.40, kite: 0.90, tower: 1.20,
  // oddments
  torch: 0.50, tome: 0.30, holy_book: 0.30, skull: 0.17, lute: 0.90,
  pickaxe: 0.90, tongs: 0.50, smith_hammer: 0.40, lockpick: 0.13, skinning_knife: 0.24,
};

// ---------------------------------------------------------------------------
// Recipes. Each is (ctx) -> THREE.Group, where ctx carries the resolved
// materials, the rarity, and the rune helper.
//
// `fists` is deliberately null: it is not an object, it is having nothing in
// your hand, and the audit knows the difference between a null recipe and a
// missing one.

const RECIPES = {
  fists: null,

  dagger: (c) => {
    const g = new THREE.Group();
    g.add(pommel(-0.055, 0.017, c.metal));
    g.add(grip(-0.045, 0.02, 0.0125, c.wrap));
    g.add(crossguard(0.026, 0.042, 0.008, 0.010, c.metal));
    g.add(blade(0.032, 0.295, 0.0175, 0.0016, c.metal, { taper: 0.35, tipFrom: 0.62 }));
    c.rune(g, 0.06, 0.24, 0.0175, 0.0016);
    return g;
  },

  rapier: (c) => {
    const g = new THREE.Group();
    g.add(pommel(-0.075, 0.017, c.metal));
    g.add(grip(-0.062, 0.03, 0.0115, c.wrap));
    // a swept hilt: a bowl and two quillons
    const bowl = lathe([[0.006, 0], [0.032, 0.010], [0.045, 0.030], [0.043, 0.036], [0.030, 0.020], [0.006, 0.008]], 16);
    bowl.translate(0, 0.036, 0);
    g.add(mesh(bowl, c.metal));
    g.add(crossguard(0.038, 0.055, 0.0055, 0.0055, c.metal));
    g.add(blade(0.052, 0.955, 0.0080, 0.0026, c.metal, { taper: 0.55, tipFrom: 0.55, fuller: 0.55, sections: 10 }));
    c.rune(g, 0.10, 0.85, 0.0080, 0.0026);
    return g;
  },

  shortsword: (c) => {
    const g = new THREE.Group();
    g.add(pommel(-0.095, 0.021, c.metal));
    g.add(grip(-0.082, 0.02, 0.0145, c.wrap));
    g.add(crossguard(0.028, 0.070, 0.0085, 0.012, c.metal));
    g.add(blade(0.036, 0.645, 0.0205, 0.0018, c.metal, { taper: 0.30, tipFrom: 0.72 }));
    c.rune(g, 0.07, 0.55, 0.0205, 0.0018);
    return g;
  },

  longsword: (c) => {
    const g = new THREE.Group();
    g.add(pommel(-0.115, 0.024, c.metal));
    g.add(grip(-0.100, 0.024, 0.0155, c.wrap));
    g.add(crossguard(0.032, 0.098, 0.0095, 0.014, c.metal));
    g.add(blade(0.042, 0.875, 0.0230, 0.0016, c.metal, { taper: 0.32, tipFrom: 0.74, sections: 10 }));
    c.rune(g, 0.09, 0.76, 0.0230, 0.0016);
    return g;
  },

  greatsword: (c) => {
    const g = new THREE.Group();
    g.add(pommel(-0.230, 0.032, c.metal));
    g.add(grip(-0.205, 0.055, 0.0185, c.wrap));
    g.add(crossguard(0.070, 0.150, 0.0130, 0.018, c.metal));
    // a ricasso, the blunt stretch above the guard a longsword hand grips
    g.add(haft(0.080, 0.155, 0.016, 0.017, c.metal, 2));
    g.add(blade(0.150, 1.268, 0.0260, 0.0022, c.metal, { taper: 0.30, tipFrom: 0.76, sections: 12 }));
    c.rune(g, 0.22, 1.10, 0.0260, 0.0022);
    return g;
  },

  axe: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.170, 0.630, 0.0135, 0.0115, c.wood, 6));
    g.add(grip(-0.165, -0.020, 0.0150, c.wrap));
    const bit = axeBit(0.135, c.metal, false, 0.017);
    bit.position.set(0.010, 0.545, 0);
    g.add(bit);
    const eye = haft(0.470, 0.615, 0.021, 0.019, c.metal, 2);
    g.add(eye);
    c.rune(g, 0.50, 0.60, 0.030, 0.010);
    return g;
  },

  battleaxe: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.320, 1.040, 0.0165, 0.0140, c.wood, 8));
    g.add(grip(-0.310, -0.060, 0.0180, c.wrap));
    for (const s of [false, true]) {
      const bit = axeBit(0.200, c.metal, s, 0.020);
      bit.position.set(s ? -0.012 : 0.012, 0.880, 0);
      g.add(bit);
    }
    g.add(haft(0.760, 1.010, 0.026, 0.023, c.metal, 2));
    const spike = lathe([[0.02, 0], [0.020, 0.02], [0.001, 0.070]], 10);
    spike.translate(0, 1.010, 0);
    g.add(mesh(spike, c.metal));
    c.rune(g, 0.80, 0.98, 0.036, 0.012);
    return g;
  },

  mace: (c) => {
    const g = new THREE.Group();
    g.add(pommel(-0.150, 0.020, c.metal));
    g.add(grip(-0.140, 0.330, 0.0155, c.wrap));
    g.add(maceHead(0.435, 0.058, c.metal));
    const collar = haft(0.330, 0.372, 0.020, 0.024, c.metal, 2);
    g.add(collar);
    c.rune(g, 0.40, 0.49, 0.050, 0.020);
    return g;
  },

  warhammer: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.260, 0.760, 0.0165, 0.0145, c.wood, 6));
    g.add(grip(-0.250, 0.020, 0.0180, c.wrap));
    const headRings = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const s = 0.86 + Math.sin(t * Math.PI) * 0.14;
      headRings.push({ y: -0.075 + 0.150 * t, sx: 0.050 * s, sz: 0.050 * s, v: t });
    }
    const head = loft(roundRect(1, 0.3, 3), headRings);
    head.rotateZ(Math.PI / 2);
    head.translate(0, 0.760, 0);
    g.add(mesh(head, c.metal));
    const beak = lathe([[0.040, 0], [0.030, 0.030], [0.002, 0.090]], 10);
    beak.rotateZ(-Math.PI / 2);
    beak.translate(-0.070, 0.760, 0);
    g.add(mesh(beak, c.metal));
    c.rune(g, 0.70, 0.83, 0.045, 0.048);
    return g;
  },

  maul: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.300, 0.840, 0.0180, 0.0160, c.wood, 6));
    g.add(grip(-0.290, 0.040, 0.0195, c.wrap));
    const head = haft(-0.090, 0.090, 0.075, 0.075, c.metal, 3);
    head.rotation.z = Math.PI / 2;
    head.position.y = 0.840;
    g.add(head);
    const band = haft(-0.095, -0.070, 0.078, 0.078, c.metal, 1);
    band.rotation.z = Math.PI / 2;
    band.position.y = 0.840;
    g.add(band);
    c.rune(g, 0.78, 0.90, 0.070, 0.070);
    return g;
  },

  /**
   * A wand: a short turned rod, a metal cap, and a small stone the cap holds.
   * 37 cm, which is a forearm, and the smallest thing in this file that is not
   * a lockpick. There is no blade to put a rune down, so a legendary wand gets
   * its rune line along the rod.
   */
  wand: (c) => {
    const g = new THREE.Group();
    // its own turned butt cap rather than pommel(), whose silhouette starts at
    // a fixed 20 mm radius and so turns inside out on anything this slender
    const butt = lathe([[0.0010, -0.062], [0.0075, -0.056], [0.0110, -0.045], [0.0104, -0.034], [0.0010, -0.030]], 12);
    g.add(mesh(butt, c.metal));
    g.add(grip(-0.040, 0.034, 0.0100, c.wrap));
    g.add(haft(0.030, 0.252, 0.0088, 0.0062, c.wood, 6));
    // three turned rings up the rod, the way a lathe leaves them
    for (const y of [0.078, 0.126, 0.174]) g.add(haft(y - 0.0035, y + 0.0035, 0.0106, 0.0106, c.metal, 1));
    const cap = lathe([[0.002, -0.022], [0.0104, -0.017], [0.0128, 0.003], [0.0092, 0.016], [0.0040, 0.021]], 12);
    cap.translate(0, 0.262, 0);
    g.add(mesh(cap, c.metal));
    // three claws, and the stone they close on
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.BoxGeometry(0.0034, 0.030, 0.0034);
      claw.translate(0, 0.290, 0.0105);
      claw.rotateY((i / 3) * Math.PI * 2);
      g.add(mesh(claw, c.metal));
    }
    const stone = new THREE.SphereGeometry(0.0118, 10, 8);
    stone.scale(1, 1.22, 1);
    stone.translate(0, 0.296, 0);
    g.add(mesh(stone, c.stone));
    c.rune(g, 0.05, 0.24, 0.009, 0.009);
    return g;
  },

  /**
   * A staff: a shaft taller than the person holding it, and a headpiece of
   * three arms curving up out of a collar to hold a stone clear of the wood.
   * Two metres, so it stands a head above the tallest character the appearance
   * table allows (2.0 m), which is what makes it read as a staff and not a
   * long stick.
   */
  staff: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.920, 0.900, 0.0185, 0.0150, c.wood, 8));
    g.add(grip(-0.140, 0.140, 0.0205, c.wrap));
    // a shod foot, so the end that goes in the mud is not bare wood
    g.add(haft(-0.955, -0.895, 0.0158, 0.0200, c.metal, 2));
    // the collar the head grows out of
    g.add(haft(0.880, 0.930, 0.0212, 0.0195, c.metal, 2));
    // three arms, each curving out from the collar and back in over the stone
    for (let i = 0; i < 3; i++) {
      const rings = [];
      const n = 7;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        rings.push({
          y: 0.925 + 0.115 * t,
          sx: 0.0058 * (1 - t * 0.45),
          dx: Math.sin(t * Math.PI) * 0.036,
          v: t,
        });
      }
      const arm = loft(circle(8), rings);
      arm.rotateY((i / 3) * Math.PI * 2);
      g.add(mesh(arm, c.metal));
    }
    const stone = new THREE.SphereGeometry(0.036, 12, 10);
    stone.scale(1, 1.15, 1);
    stone.translate(0, 0.998, 0);
    g.add(mesh(stone, c.stone));
    c.rune(g, 0.20, 0.86, 0.020, 0.020);
    return g;
  },

  quarterstaff: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.900, 0.900, 0.0175, 0.0175, c.wood, 8));
    g.add(grip(-0.120, 0.120, 0.0190, c.wrap));
    for (const y of [-0.860, 0.860]) {
      const ferrule = haft(y - 0.028, y + 0.028, 0.0195, 0.0195, c.metal, 1);
      g.add(ferrule);
    }
    c.rune(g, 0.20, 0.84, 0.020, 0.020);
    return g;
  },

  bone_staff: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.900, 0.760, 0.0175, 0.0165, c.bone, 8));
    g.add(grip(-0.120, 0.120, 0.0190, c.wrap));
    // a skull lashed to the head, which is what makes it a bone staff
    const cranium = lathe([[0.001, 0.055], [0.030, 0.048], [0.042, 0.020], [0.040, -0.020], [0.026, -0.040], [0.001, -0.044]], 14);
    cranium.translate(0, 0.845, 0);
    g.add(mesh(cranium, c.bone));
    const jaw = new THREE.BoxGeometry(0.048, 0.018, 0.056);
    jaw.translate(0, 0.795, 0.008);
    g.add(mesh(jaw, c.bone));
    for (const s of [-1, 1]) {
      const sock = new THREE.SphereGeometry(0.011, 8, 6);
      sock.translate(s * 0.016, 0.852, 0.033);
      g.add(mesh(sock, c.dark));
    }
    c.rune(g, 0.20, 0.72, 0.020, 0.020);
    return g;
  },

  spear: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.800, 1.020, 0.0150, 0.0135, c.wood, 8));
    g.add(grip(-0.120, 0.160, 0.0165, c.wrap));
    g.add(haft(1.000, 1.070, 0.0180, 0.0150, c.metal, 2));
    g.add(leafHead(1.060, 0.240, 0.028, 0.0026, c.metal));
    const butt = lathe([[0.015, 0], [0.014, -0.03], [0.002, -0.055]], 10);
    butt.translate(0, -0.800, 0);
    g.add(mesh(butt, c.metal));
    c.rune(g, 1.09, 1.26, 0.024, 0.006);
    return g;
  },

  halberd: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.860, 1.000, 0.0180, 0.0160, c.wood, 10));
    g.add(grip(-0.200, 0.140, 0.0195, c.wrap));
    g.add(haft(0.960, 1.080, 0.0215, 0.0190, c.metal, 2));
    // the axe bit on one side, a beak on the other, a spike on top
    const bit = axeBit(0.190, c.metal, false, 0.014);
    bit.position.set(0.014, 0.990, 0);
    g.add(bit);
    const beak = axeBit(0.110, c.metal, true, 0.012);
    beak.position.set(-0.014, 0.970, 0);
    beak.rotation.z = 0.5;
    g.add(beak);
    g.add(leafHead(1.070, 0.210, 0.022, 0.0024, c.metal));
    const butt = lathe([[0.018, 0], [0.016, -0.03], [0.002, -0.060]], 10);
    butt.translate(0, -0.860, 0);
    g.add(mesh(butt, c.metal));
    c.rune(g, 1.10, 1.26, 0.020, 0.006);
    return g;
  },

  glaive: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.605, 0.930, 0.0170, 0.0150, c.wood, 10));
    g.add(grip(-0.200, 0.140, 0.0185, c.wrap));
    g.add(haft(0.900, 0.990, 0.0200, 0.0180, c.metal, 2));
    // a long single edged blade, swept
    const s = new THREE.Shape();
    s.moveTo(-0.012, 0);
    s.quadraticCurveTo(0.055, 0.120, 0.048, 0.300);
    s.quadraticCurveTo(0.030, 0.395, -0.006, 0.420);
    s.quadraticCurveTo(0.006, 0.250, -0.012, 0);
    const bl = slab(s, 0.010, 0.0035, 12);
    bl.translate(0, 0.980, 0);
    g.add(mesh(bl, c.metal));
    const butt = lathe([[0.017, 0], [0.015, -0.03], [0.002, -0.055]], 10);
    butt.translate(0, -0.605, 0);
    g.add(mesh(butt, c.metal));
    c.rune(g, 1.02, 1.34, 0.030, 0.006);
    return g;
  },

  shortbow: (c) => {
    const g = bowStave(1.20, c.wood, c.cord, { belly: 0.085, limbR: 0.0105 });
    g.add(grip(-0.075, 0.075, 0.0135, c.wrap));
    c.rune(g, 0.20, 0.55, 0.012, 0.012);
    return g;
  },

  longbow: (c) => {
    const g = bowStave(1.70, c.wood, c.cord, { belly: 0.105, limbR: 0.0120, recurve: 0.02 });
    g.add(grip(-0.090, 0.090, 0.0145, c.wrap));
    c.rune(g, 0.25, 0.78, 0.013, 0.013);
    return g;
  },

  crossbow: (c) => {
    const g = new THREE.Group();
    // the stock, running up +y, with the prod across x near the top
    const stockRings = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      stockRings.push({ y: -0.28 + 0.75 * t, sx: 0.022 * (1 - t * 0.25), sz: 0.030 * (1 - t * 0.35), v: t * 2 });
    }
    g.add(mesh(loft(roundRect(1.1, 0.4, 3), stockRings), c.wood));
    g.add(grip(-0.270, -0.130, 0.0175, c.wrap));
    // the prod: a short stiff bow lying across the stock
    const prod = tube([[-0.32, 0.40, 0.02], [-0.16, 0.415, -0.005], [0, 0.42, -0.012], [0.16, 0.415, -0.005], [0.32, 0.40, 0.02]], 0.011, 18, 8);
    g.add(mesh(prod, c.wood));
    const sg = new THREE.CylinderGeometry(0.0022, 0.0022, 0.64, 5);
    sg.rotateZ(Math.PI / 2);
    sg.translate(0, 0.402, 0.020);
    g.add(mesh(sg, c.cord));
    // the lath irons, the trigger and the nut
    const irons = new THREE.BoxGeometry(0.10, 0.020, 0.046);
    irons.translate(0, 0.408, 0);
    g.add(mesh(irons, c.metal));
    const trig = new THREE.BoxGeometry(0.012, 0.055, 0.014);
    trig.translate(0, -0.075, 0.028);
    g.add(mesh(trig, c.metal));
    const groove = new THREE.BoxGeometry(0.014, 0.44, 0.008);
    groove.translate(0, 0.20, -0.026);
    g.add(mesh(groove, c.metal));
    c.rune(g, 0.05, 0.36, 0.020, 0.030);
    return g;
  },

  throwing_knives: (c) => {
    const g = new THREE.Group();
    // three of them, held fanned between the fingers
    for (let i = 0; i < 3; i++) {
      const k = new THREE.Group();
      k.add(grip(-0.060, -0.012, 0.0085, c.wrap));
      k.add(blade(-0.008, 0.218, 0.0125, 0.0013, c.metal, { taper: 0.45, tipFrom: 0.5, sections: 6 }));
      k.rotation.z = (i - 1) * 0.16;
      k.position.x = (i - 1) * 0.012;
      g.add(k);
    }
    c.rune(g, 0.02, 0.18, 0.013, 0.0028);
    return g;
  },

  // ------------------------------------------------------------- shields
  buckler: (c) => {
    const g = new THREE.Group();
    const face = lathe([
      [0.001, 0.030], [0.055, 0.036], [0.075, 0.018], [0.080, 0.006],
      [0.185, 0.020], [0.200, 0.010], [0.200, -0.004], [0.185, 0.006], [0.075, -0.010], [0.001, -0.006],
    ], 26);
    g.add(mesh(face, c.metal));
    const rim = new THREE.TorusGeometry(0.194, 0.010, 8, 30);
    rim.rotateX(Math.PI / 2);
    rim.translate(0, 0.012, 0);
    g.add(mesh(rim, c.metal));
    const handle = new THREE.TorusGeometry(0.040, 0.008, 6, 12, Math.PI);
    handle.rotateY(Math.PI / 2);
    g.add(mesh(handle, c.wrap));
    g.rotation.x = -Math.PI / 2;      // face the shield forward, not up
    const wrapG = new THREE.Group();
    wrapG.add(g);
    c.rune(wrapG, -0.16, 0.16, 0.02, 0.02);
    return wrapG;
  },

  kite: (c) => {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(-0.170, 0.360);
    s.quadraticCurveTo(0, 0.470, 0.170, 0.360);
    s.quadraticCurveTo(0.190, 0.020, 0.060, -0.360);
    s.quadraticCurveTo(0, -0.470, -0.060, -0.360);
    s.quadraticCurveTo(-0.190, 0.020, -0.170, 0.360);
    const face = shieldFace(s, 0.022, 0.045, c.leather);
    g.add(face);
    // the boss and the iron banding
    const boss = lathe([[0.001, 0.055], [0.030, 0.050], [0.048, 0.024], [0.052, 0.004], [0.052, -0.006], [0.001, -0.006]], 16);
    boss.rotateX(Math.PI / 2);
    boss.translate(0, 0.150, 0.052);
    g.add(mesh(boss, c.metal));
    for (const a of [-0.55, 0.55]) {
      const band = new THREE.BoxGeometry(0.026, 0.760, 0.010);
      band.translate(0, 0, 0.030);
      const m = mesh(band, c.metal);
      m.rotation.z = a;
      g.add(m);
    }
    const strap = new THREE.TorusGeometry(0.055, 0.010, 6, 12, Math.PI);
    strap.rotateY(Math.PI / 2);
    strap.rotateZ(Math.PI);
    strap.translate(0, 0.150, -0.035);
    g.add(mesh(strap, c.wrap));
    c.rune(g, -0.30, 0.34, 0.03, 0.03);
    return g;
  },

  tower: (c) => {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(-0.200, 0.480);
    s.quadraticCurveTo(0, 0.600, 0.200, 0.480);
    s.lineTo(0.200, -0.560);
    s.quadraticCurveTo(0, -0.620, -0.200, -0.560);
    s.lineTo(-0.200, 0.480);
    const face = shieldFace(s, 0.028, 0.050, c.wood);
    g.add(face);
    for (const y of [0.36, 0, -0.36]) {
      const band = new THREE.BoxGeometry(0.410, 0.034, 0.012);
      band.translate(0, y, 0.036);
      g.add(mesh(band, c.metal));
    }
    const boss = lathe([[0.001, 0.060], [0.034, 0.054], [0.056, 0.026], [0.060, 0.004], [0.060, -0.006], [0.001, -0.006]], 16);
    boss.rotateX(Math.PI / 2);
    boss.translate(0, 0.100, 0.058);
    g.add(mesh(boss, c.metal));
    const strap = new THREE.TorusGeometry(0.060, 0.011, 6, 12, Math.PI);
    strap.rotateY(Math.PI / 2);
    strap.rotateZ(Math.PI);
    strap.translate(0, 0.100, -0.042);
    g.add(mesh(strap, c.wrap));
    c.rune(g, -0.42, 0.44, 0.03, 0.03);
    return g;
  },

  // ------------------------------------------------------------ oddments
  torch: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.150, 0.170, 0.0140, 0.0155, c.wood, 4));
    g.add(grip(-0.145, -0.030, 0.0155, c.wrap));
    // pitch soaked rag bound round the head
    const rag = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      rag.push({ y: 0.130 + 0.095 * t, sx: 0.030 * (0.7 + Math.sin(t * Math.PI) * 0.5), v: t });
    }
    g.add(mesh(loft(circle(10), rag), c.cloth));
    const flame = lathe([[0.001, 0.130], [0.020, 0.072], [0.031, 0.026], [0.026, -0.010], [0.001, -0.020]], 12);
    flame.translate(0, 0.220, 0);
    const fm = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85 });
    const fl = new THREE.Mesh(flame, fm);
    fl.name = 'flame';
    g.add(fl);
    const light = new THREE.PointLight(0xffa64d, 4, 12, 2);
    light.position.y = 0.24;
    light.name = 'torchlight';
    g.add(light);
    return g;
  },

  tome: (c) => tomeModel(c, false),
  holy_book: (c) => tomeModel(c, true),

  skull: (c) => {
    const g = new THREE.Group();
    const cranium = lathe([
      [0.001, 0.098], [0.038, 0.090], [0.062, 0.055], [0.068, 0.010],
      [0.060, -0.030], [0.040, -0.050], [0.001, -0.052],
    ], 18);
    const pa = cranium.getAttribute('position');
    for (let i = 0; i < pa.count; i++) pa.setZ(i, pa.getZ(i) * 1.16);     // a skull is long, not round
    pa.needsUpdate = true;
    cranium.computeVertexNormals();
    cranium.translate(0, 0.058, 0);
    g.add(mesh(cranium, c.bone));
    const jaw = new THREE.BoxGeometry(0.070, 0.026, 0.086);
    jaw.translate(0, -0.002, 0.014);
    g.add(mesh(jaw, c.bone));
    for (const s of [-1, 1]) {
      const sock = new THREE.SphereGeometry(0.017, 10, 8);
      sock.translate(s * 0.024, 0.068, 0.052);
      g.add(mesh(sock, c.dark));
    }
    const nose = new THREE.ConeGeometry(0.010, 0.024, 6);
    nose.rotateX(Math.PI);
    nose.translate(0, 0.036, 0.062);
    g.add(mesh(nose, c.dark));
    c.rune(g, 0.02, 0.10, 0.03, 0.05);
    return g;
  },

  lute: (c) => {
    const g = new THREE.Group();
    // the bowl: half a lathe, flattened on the soundboard side
    const bowl = lathe([
      [0.001, 0.150], [0.075, 0.120], [0.110, 0.040], [0.112, -0.030], [0.080, -0.100], [0.001, -0.130],
    ], 18);
    const pa = bowl.getAttribute('position');
    for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.min(0, pa.getZ(i)) * 1.25);
    pa.needsUpdate = true;
    bowl.computeVertexNormals();
    bowl.translate(0, -0.150, 0);
    g.add(mesh(bowl, c.wood));
    const board = new THREE.CylinderGeometry(0.112, 0.112, 0.008, 22);
    board.rotateX(Math.PI / 2);
    board.translate(0, -0.150, 0.004);
    g.add(mesh(board, c.wood));
    const rose = new THREE.TorusGeometry(0.030, 0.006, 6, 16);
    rose.translate(0, -0.130, 0.010);
    g.add(mesh(rose, c.dark));
    // the neck and the bent back pegbox
    const neck = new THREE.BoxGeometry(0.046, 0.600, 0.026);
    neck.translate(0, 0.240, -0.004);
    g.add(mesh(neck, c.wood));
    const peg = new THREE.BoxGeometry(0.050, 0.110, 0.024);
    const pm = mesh(peg, c.dark);
    pm.position.set(0, 0.575, -0.026);
    pm.rotation.x = 0.9;
    g.add(pm);
    for (let i = 0; i < 6; i++) {
      const st = new THREE.CylinderGeometry(0.0013, 0.0013, 0.740, 4);
      st.translate((i - 2.5) * 0.0075, 0.190, 0.013);
      g.add(mesh(st, c.cord));
    }
    return g;
  },

  pickaxe: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.310, 0.540, 0.0165, 0.0140, c.wood, 6));
    g.add(grip(-0.300, -0.060, 0.0180, c.wrap));
    const head = tube([[-0.230, 0.470, 0], [-0.120, 0.545, 0], [0, 0.560, 0], [0.120, 0.545, 0], [0.230, 0.470, 0]], 0.016, 18, 8);
    const pa = head.getAttribute('position');
    for (let i = 0; i < pa.count; i++) {
      const k = Math.min(1, Math.abs(pa.getX(i)) / 0.230);
      const s = 1 - k * 0.72;
      pa.setY(i, 0.545 + (pa.getY(i) - 0.545) * (1 - k * 0.4));
      pa.setZ(i, pa.getZ(i) * s);
    }
    pa.needsUpdate = true;
    head.computeVertexNormals();
    g.add(mesh(head, c.metal));
    const eye = haft(0.500, 0.590, 0.024, 0.022, c.metal, 2);
    g.add(eye);
    return g;
  },

  tongs: (c) => {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const arm = tube([[s * 0.020, -0.230, 0], [s * 0.012, -0.060, 0], [0, 0.030, 0], [s * 0.016, 0.150, 0], [s * 0.030, 0.260, 0]], 0.0075, 14, 6);
      g.add(mesh(arm, c.metal));
    }
    const rivet = new THREE.CylinderGeometry(0.010, 0.010, 0.020, 10);
    rivet.rotateX(Math.PI / 2);
    rivet.translate(0, 0.030, 0);
    g.add(mesh(rivet, c.metal));
    return g;
  },

  smith_hammer: (c) => {
    const g = new THREE.Group();
    g.add(haft(-0.170, 0.190, 0.0125, 0.0115, c.wood, 4));
    g.add(grip(-0.165, -0.020, 0.0140, c.wrap));
    const head = haft(-0.055, 0.055, 0.031, 0.028, c.metal, 3);
    head.rotation.z = Math.PI / 2;
    head.position.y = 0.190;
    g.add(head);
    const pein = lathe([[0.026, 0], [0.016, 0.028], [0.004, 0.045]], 8);
    pein.rotateZ(-Math.PI / 2);
    pein.translate(-0.055, 0.190, 0);
    g.add(mesh(pein, c.metal));
    return g;
  },

  skinning_knife: (c) => {
    const g = new THREE.Group();
    g.add(grip(-0.085, 0.010, 0.0125, c.wrap));
    const cap = lathe([[0.001, -0.012], [0.011, -0.010], [0.013, 0.000]], 10);
    cap.translate(0, -0.085, 0);
    g.add(mesh(cap, c.metal));
    // a short blade with a curved belly, the shape that takes a hide off
    const s = new THREE.Shape();
    s.moveTo(-0.008, 0);
    s.quadraticCurveTo(0.030, 0.040, 0.028, 0.110);
    s.quadraticCurveTo(0.016, 0.145, -0.006, 0.148);
    s.quadraticCurveTo(-0.010, 0.070, -0.008, 0);
    const bl = slab(s, 0.0035, 0.0012, 10);
    bl.translate(0, 0.010, 0);
    g.add(mesh(bl, c.metal));
    c.rune(g, 0.03, 0.13, 0.014, 0.0035);
    return g;
  },

  lockpick: (c) => {
    const g = new THREE.Group();
    g.add(grip(-0.040, 0.008, 0.0060, c.wrap));
    const wire = tube([[0, 0.006, 0], [0, 0.050, 0], [0.004, 0.078, 0], [0.012, 0.088, 0]], 0.0011, 12, 5);
    g.add(mesh(wire, c.metal));
    return g;
  },
};

function tomeModel(c, holy) {
  const g = new THREE.Group();
  const W = 0.100, H = 0.145, T = 0.020;
  for (const s of [-1, 1]) {
    const cover = new THREE.BoxGeometry(W * 2, H * 2, 0.008);
    cover.translate(0, 0, s * (T + 0.004));
    g.add(mesh(cover, c.leather));
  }
  const pages = new THREE.BoxGeometry(W * 1.94, H * 1.94, T * 2);
  g.add(mesh(pages, c.paper));
  const spine = new THREE.BoxGeometry(0.014, H * 2, T * 2 + 0.016);
  spine.translate(-W, 0, 0);
  g.add(mesh(spine, c.leather));
  if (holy) {
    const bar = new THREE.BoxGeometry(0.014, 0.070, 0.004);
    bar.translate(0.010, 0.010, T + 0.010);
    g.add(mesh(bar, c.gold));
    const cross = new THREE.BoxGeometry(0.048, 0.014, 0.004);
    cross.translate(0.010, 0.030, T + 0.010);
    g.add(mesh(cross, c.gold));
  } else {
    for (const s of [-1, 1]) {
      const clasp = new THREE.BoxGeometry(0.024, 0.012, T * 2 + 0.020);
      clasp.translate(W * 0.82, s * 0.055, 0);
      g.add(mesh(clasp, c.gold));
    }
  }
  c.rune(g, -0.08, 0.08, 0.03, T + 0.01);
  return g;
}

// ---------------------------------------------------------------------------
// The bases this file is answerable for: every base whose kind is one of these.

export const MODELLED_KINDS = ['weapon', 'shield', 'offhand', 'instrument', 'tool'];

/** Every base id that must have a recipe. */
export function modelledBases() {
  return Object.values(BASES).filter((b) => MODELLED_KINDS.includes(b.kind)).map((b) => b.id);
}

const RARITY_TIER = (id) => Math.max(0, RARITY_ORDER.indexOf(id));
const EPIC = RARITY_ORDER.indexOf('epic');
const LEGENDARY = RARITY_ORDER.indexOf('legendary');

function contextFor(base, opts) {
  const rarity = RARITY[opts.rarity] ? opts.rarity : 'common';
  const tier = RARITY_TIER(rarity);
  const glow = tier >= EPIC;
  const runeColour = new THREE.Color(RARITY[rarity].colour).getHex();

  // what the thing is made of. An explicit material wins; otherwise a metal
  // base gets iron, a wooden one oak, so nothing is ever left uncoloured.
  const mat = opts.material || null;
  const metalId = isMetal(mat) ? mat : 'iron';
  const woodId = WOOD_COLOURS[mat] != null ? mat : 'oak';
  const leatherId = LEATHER_COLOURS[mat] != null ? mat : 'hide';

  return {
    base, rarity, tier, glow, metalId, woodId, leatherId,
    metal: metalMat(metalId),
    plate: plateMat(metalId),
    wood: woodMat(woodId),
    leather: leatherMat(leatherId),
    wrap: wrapMat(leatherId),
    cloth: clothMat(),
    bone: boneMat(),
    paper: paperMat(),
    cord: cordMat(),
    stone: stoneMat(),
    gold: metalMat('bronze'),
    dark: pbr('stone', 0x14140f, { rough: 1, metal: 0 }),
    runeColour,
    rune(group, y0, y1, halfW, halfT) {
      if (!glow) return;
      runeLine(group, y0, y1, halfW, halfT, runeColour);
    },
  };
}

/**
 * Build the model for an item or a base id.
 *
 * @param {object|string} itemOrBaseId  an item record, a base record, or a base id
 * @param {object} opts
 *   material  overrides item.material (an ores.js metal, wood or leather id)
 *   rarity    overrides item.rarity
 *   light     false to leave off the legendary point light
 * @returns {THREE.Group|null}  null only for `fists`, which is empty hands
 */
export function buildWeaponModel(itemOrBaseId, opts = {}) {
  const base = baseFor(itemOrBaseId);
  if (!base) throw new Error(`buildWeaponModel: unknown base ${JSON.stringify(itemOrBaseId)}`);
  if (!(base.id in RECIPES)) throw new Error(`buildWeaponModel: no recipe for base ${base.id}`);
  const recipe = RECIPES[base.id];
  if (!recipe) return null;

  const item = typeof itemOrBaseId === 'object' ? itemOrBaseId : null;
  const o = {
    material: opts.material ?? item?.material ?? null,
    rarity: opts.rarity ?? item?.rarity ?? 'common',
    light: opts.light !== false,
  };
  const c = contextFor(base, o);
  const g = recipe(c);
  g.name = `weapon:${base.id}`;

  if (c.tier >= LEGENDARY && o.light) {
    const l = new THREE.PointLight(c.runeColour, 1.6, 3.5, 2);
    l.name = 'rarityGlow';
    g.add(l);
  }

  g.userData.weapon = {
    base: base.id, rarity: o.rarity, material: o.material,
    hands: base.hands ?? null, length: LENGTHS[base.id] ?? null,
    triangles: countTriangles(g),
  };
  return g;
}

/** True when a base is one this file models. */
export const hasWeaponModel = (id) => {
  const b = baseFor(id);
  return !!b && (b.id in RECIPES) && !!RECIPES[b.id];
};

// ---------------------------------------------------------------------------
// Audit. Runs at import: builds every base this file is answerable for and
// throws on the first one that has no recipe, no length, or no colour for its
// material. A recipe that crashes fails here rather than in a player's hand.

export function auditWeaponModels() {
  const bad = (m) => { throw new Error(`auditWeaponModels: ${m}`); };

  for (const o of [...ORES, ...Object.values(ALLOYS)]) {
    if (METAL_COLOURS[o.id] == null) bad(`metal ${o.id} ("${o.colour || 'no colour word'}") has no hex`);
  }
  for (const w of WOODS) if (WOOD_COLOURS[w.id] == null) bad(`wood ${w.id} has no hex`);
  for (const l of LEATHERS) if (LEATHER_COLOURS[l.id] == null) bad(`leather ${l.id} has no hex`);
  for (const id of Object.keys(METAL_COLOURS)) {
    if (id !== 'bronze' && !METAL[id] && !ORES.some((o) => o.id === id)) bad(`METAL_COLOURS names ${id}, which ores.js does not`);
  }

  const ids = modelledBases();
  let built = 0, triangles = 0, worst = null;
  for (const id of ids) {
    if (!(id in RECIPES)) bad(`base ${id} (kind ${BASES[id].kind}) has no recipe`);
    if (RECIPES[id] === null) continue;                       // fists: empty hands, on purpose
    if (LENGTHS[id] == null) bad(`base ${id} has a recipe but no stated length`);
    let g;
    try { g = buildWeaponModel(id, { light: false }); } catch (e) { bad(`base ${id} threw while building: ${e.message}`); }
    if (!g) bad(`base ${id} built nothing`);
    const tris = countTriangles(g);
    if (tris > 6000) bad(`base ${id} is ${tris} triangles, over the 6000 budget`);
    if (!worst || tris > worst.tris) worst = { id, tris };
    triangles += tris;
    built++;
    disposeModel(g);
  }
  for (const id of Object.keys(RECIPES)) {
    if (!BASES[id]) bad(`there is a recipe for ${id}, which is not a base`);
  }
  for (const id of Object.keys(LENGTHS)) {
    if (!BASES[id]) bad(`LENGTHS names ${id}, which is not a base`);
  }
  return { bases: ids.length, built, triangles, worst };
}

auditWeaponModels();
