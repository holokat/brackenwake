// What an outdoor mine looks like when you walk up to it.
//
//   buildMineMouth(mouth, { heightAt })   one cut: a timbered portal in the hill
//   buildMineYard(mine,   { heightAt })   the yard: headframe, stores, spoil, sign
//   buildSeam(seam,       { heightAt })   one surface seam: an ore banded outcrop
//
// `docs/mmo/09-WORLD-ZONES.md` section 4 authored seven mines and Z1 built the
// data for them: a yard with `flatR` 20, two to four cuts up the hill, four to
// seven surface seams on the yard. Nothing drew any of it. This file draws it
// and `site_models.js` places it.
//
// WHAT EACH PIECE IS FOR, because a mine has to be legible from a distance:
//
//   the yard      says somebody works here: a headframe with a turning wheel,
//                 crates, barrels, a trough, a rack of picks, a spoil heap and
//                 a board with the mine's name on it
//   a mouth       says you can go in: a timber portal round a black opening,
//                 rail track running out of it, a cart tipped at the end of the
//                 track, and a lantern that lights at dusk
//   a seam        says what is in the hill before you go in: grey rock with a
//                 band of the ore's own colour through it and a glint on the
//                 band you can pick out at twenty metres
//
// THE SEAM IS NOT A SECOND MINABLE THING. `flora.js` already scatters ore
// boulders on every seam (`recordsFor`, the `st.kind === 'mine'` branch) and
// those boulders are what the pickaxe swings at. What is built here is the
// OUTCROP AROUND THEM: the rock the boulders broke off. It carries
// `userData.seam` so a raycast can name it, and no harvest record, so clicking
// it is a look and never a swing.
//
// DEPTH IS PAINTED, NOT DUG. Nothing here may edit the terrain: `field.js` is
// Z1's and it flattens the yard and nothing else. So a mouth's darkness is a
// gradient plane set back behind a jamb, with the timber frame standing proud
// in front of it, and the parallax between the three is what reads as a hole.
// A real cut would need field.js to carve one; see docs/mmo/wiring/M1.md.
//
// THE GROUND IS SAMPLED, NEVER ASSUMED. Measured over the seven authored mines:
// the yard is flat to 0.00 m out to 10 m from its centre and +/- 0.21 m at 12 m,
// but the hillside at a cut falls away by 3.7 m over the six metres in front of
// it (9.5 m at the Ember Cut) and cross-slopes by up to 2 m over the width of
// the portal. So every sleeper, every post foot and every prop asks `heightAt`
// where it stands, and a post grows downward until it reaches its own ground.
// A track laid flat would have ended six metres in the air.
//
// TRIANGLES ARE COUNTED, NOT ESTIMATED, the way `log_piles.js` counts them.
// `auditMineModels()` builds a mouth, a yard and a seam of every ore at load
// against a stub ground and throws if any of them is over budget, floats, or
// sinks.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';
import { probeHostCanvas, stubCanvasFactory, normalFromHeight } from './arbor_textures.js';
// The ore hexes are ORE_WORD's, which keeps each one next to the WORD ores.js
// gives that vein ("blue black", "grey with a white flash"). Reading them from
// there rather than typing a third copy is also what makes the outcrop the same
// colour as the lumps that break off it, which `buildOreHeap` draws.
import { ORE_WORD, HOST_ROCK, buildOreHeap, buildLogPile } from '../game/log_piles.js';
import { ORE } from '../mmo/ores.js';
// The sign is lettered in the HUD's display face, so the board in the world and
// the banner on the screen say the name the same way.
import { theme } from '../game/ui_theme.js';

// ---------------------------------------------------------------- budgets --

/** No one cut may be heavier than this. Counted in `auditMineModels`. */
export const MOUTH_MAX_TRIS = 3000;
/** No yard may be heavier than this. */
export const YARD_MAX_TRIS = 8000;
/** No surface seam may be heavier than this. */
export const SEAM_MAX_TRIS = 600;
/**
 * How far a piece is allowed to stand below the ground under it. Rock is bedded
 * in, a sleeper is half buried and a sill timber sits in the dirt; anything
 * deeper than this is a bug, not a choice.
 */
export const MAX_SINK = 0.45;
/** And how far above it, before the piece is floating. */
export const MAX_FLOAT = 0.06;
/**
 * How far from the yard's centre anything in the yard may reach. MEASURED: the
 * nearest surface seam of any of the seven mines is 7.1 m out, and a seam has a
 * minable ore boulder at its exact centre, so a prop that reached further could
 * bury the thing the player came to swing at. The yard is flat to 0.00 m out to
 * 10 m, so nothing here needs to go further in order to stand level either.
 */
export const YARD_PROP_R = 6.8;

// ----------------------------------------------------------------- colour --

/** Sawn pit timber, weathered. */
export const TIMBER_COLOUR = 0x8a6a44;
/** Wrought iron: strap, band, rail and bolt. Darker and bluer than ore iron. */
export const IRON_COLOUR = 0x565b62;
/** The country rock a seam runs through, and the spoil it comes out as. */
export const ROCK_COLOUR = 0x76736c;
/** A lantern's flame, and the light it throws on its own glass. */
export const LANTERN_COLOUR = 0xffb648;
/** Standing water in a trough. */
export const WATER_COLOUR = 0x35434a;
/** A hex as the string a canvas wants, so a colour is never typed twice. */
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

/** The hex an ore reads as, from `ORE_WORD`, which reads it from `ores.js`. */
export function oreColour(id) {
  const w = ORE_WORD[id];
  return w ? w[1] : HOST_ROCK;
}
/** The word `ores.js` gives that vein, so a test can chain the hex back to it. */
export function oreWord(id) {
  const w = ORE_WORD[id];
  return w ? w[0] : null;
}

// ---------------------------------------------------------------- canvas ---
//
// The same shape `arbor_textures.js` uses: an injectable factory, so the whole
// file loads and builds real geometry in node. The one thing the arbor stub does
// not do is text, and a sign board is text, so the stub here adds `fillText` and
// RECORDS what was drawn. That is not a test seam: it is the only way a headless
// caller can find out what the board says, and `mine_models.test.mjs` reads it.

let canvasFactory = null;

/** Inject a canvas maker. Pass null to go back to the host's, or the stub. */
export function setCanvasFactory(fn) {
  canvasFactory = fn || null;
  clearMineCache();
}

/** The arbor stub plus the text calls a sign needs, recording every draw. */
export function textCanvasFactory(w, h) {
  const c = stubCanvasFactory(w, h);
  const ctx = c.getContext('2d');
  c.__texts = [];
  ctx.font = '10px serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText = (t, x, y) => { c.__texts.push({ text: String(t), x, y, font: ctx.font }); };
  ctx.strokeText = (t, x, y) => { c.__texts.push({ text: String(t), x, y, font: ctx.font, stroke: true }); };
  ctx.measureText = (t) => ({ width: String(t).length * 0.52 * (parseFloat(ctx.font) || 10) });
  return c;
}

function canvasOf(w, h) {
  if (canvasFactory) return canvasFactory(w, h);
  if (probeHostCanvas()) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return textCanvasFactory(w, h);
}

function tex(c, { srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

// --------------------------------------------------------------- textures --

const texCache = new Map();
const matCache = new Map();

const cached = (map, key, make) => {
  const hit = map.get(key);
  if (hit) return hit;
  const made = make();
  map.set(key, made);
  return made;
};

/**
 * Sawn timber: rings and long fibre along v, a plank seam every quarter, a knot
 * or two. Albedo plus a normal map off a parallel height sheet, the way
 * `arbor_textures.makeBark` does it.
 */
export function timberTexture() {
  return cached(texCache, 'timber', () => {
    const W = 256, H = 256;
    const c = canvasOf(W, H), x = c.getContext('2d');
    const hc = canvasOf(W, H), hx = hc.getContext('2d');
    x.fillStyle = css(TIMBER_COLOUR); x.fillRect(0, 0, W, H);
    hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
    const r = mulberry32(31);
    // the grain: long fibres down the plank
    for (let i = 0; i < 900; i++) {
      const px = r() * W, py = r() * H, h = 30 + r() * 190;
      const dark = r() < 0.58;
      x.fillStyle = (dark ? 'rgba(38,24,12,' : 'rgba(220,190,150,') + (0.05 + r() * 0.16) + ')';
      x.fillRect(px, py, 1 + r() * 2.4, h);
      hx.fillStyle = (dark ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (0.15 + r() * 0.3) + ')';
      hx.fillRect(px, py, 1 + r() * 2.4, h);
    }
    // plank seams, four across the sheet
    for (let i = 1; i < 4; i++) {
      const px = (i / 4) * W;
      x.fillStyle = 'rgba(28,18,10,0.55)'; x.fillRect(px - 1.5, 0, 3, H);
      hx.fillStyle = 'rgba(0,0,0,0.85)'; hx.fillRect(px - 1.5, 0, 3, H);
    }
    // knots
    for (let i = 0; i < 3; i++) {
      const px = 20 + r() * (W - 40), py = 20 + r() * (H - 40), rad = 5 + r() * 7;
      for (let k = 4; k >= 1; k--) {
        x.fillStyle = 'rgba(46,28,14,' + (0.1 + k * 0.08) + ')';
        x.beginPath(); x.ellipse(px, py, rad * k * 0.28, rad * k * 0.42, 0, 0, 6.28318); x.fill();
        hx.fillStyle = 'rgba(0,0,0,' + (0.08 + k * 0.06) + ')';
        hx.beginPath(); hx.ellipse(px, py, rad * k * 0.28, rad * k * 0.42, 0, 0, 6.28318); hx.fill();
      }
    }
    return { map: tex(c), normalMap: tex(normalFromHeight(hc), { srgb: false }) };
  });
}

/** Wrought iron: hammered, pitted, a little rust in the pits. */
export function ironTexture() {
  return cached(texCache, 'iron', () => {
    const W = 128, H = 128;
    const c = canvasOf(W, H), x = c.getContext('2d');
    const hc = canvasOf(W, H), hx = hc.getContext('2d');
    x.fillStyle = css(IRON_COLOUR); x.fillRect(0, 0, W, H);
    hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
    const r = mulberry32(37);
    for (let i = 0; i < 500; i++) {             // hammer facets
      const px = r() * W, py = r() * H, s = 4 + r() * 12;
      const light = r() < 0.5;
      x.fillStyle = (light ? 'rgba(220,228,238,' : 'rgba(18,20,24,') + (0.03 + r() * 0.1) + ')';
      x.beginPath(); x.ellipse(px, py, s, s * 0.7, r() * 3.14, 0, 6.28318); x.fill();
      hx.fillStyle = (light ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (0.1 + r() * 0.2) + ')';
      hx.beginPath(); hx.ellipse(px, py, s, s * 0.7, r() * 3.14, 0, 6.28318); hx.fill();
    }
    for (let i = 0; i < 260; i++) {             // pits, with rust in them
      const px = r() * W, py = r() * H, s = 1 + r() * 2.4;
      x.fillStyle = 'rgba(96,52,26,' + (0.10 + r() * 0.3) + ')';
      x.beginPath(); x.arc(px, py, s, 0, 6.28318); x.fill();
      hx.fillStyle = 'rgba(0,0,0,0.5)';
      hx.beginPath(); hx.arc(px, py, s, 0, 6.28318); hx.fill();
    }
    return { map: tex(c), normalMap: tex(normalFromHeight(hc), { srgb: false }) };
  });
}

/** Country rock: granular, bedded, the grey a spoil heap and an outcrop share. */
export function rockTexture() {
  return cached(texCache, 'rock', () => {
    const W = 256, H = 256;
    const c = canvasOf(W, H), x = c.getContext('2d');
    const hc = canvasOf(W, H), hx = hc.getContext('2d');
    x.fillStyle = css(ROCK_COLOUR); x.fillRect(0, 0, W, H);
    hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
    const r = mulberry32(43);
    for (let i = 0; i < 6000; i++) {            // grain
      const l = r() < 0.5;
      x.fillStyle = (l ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (0.03 + r() * 0.12) + ')';
      const s = 1 + r() * 3.5;
      x.fillRect(r() * W, r() * H, s, s * (0.5 + r()));
    }
    for (let i = 0; i < 24; i++) {              // bedding planes
      const py = r() * H;
      x.fillStyle = 'rgba(30,28,26,' + (0.06 + r() * 0.12) + ')';
      x.fillRect(0, py, W, 1 + r() * 4);
      hx.fillStyle = 'rgba(0,0,0,' + (0.2 + r() * 0.3) + ')';
      hx.fillRect(0, py, W, 1 + r() * 4);
    }
    for (let i = 0; i < 900; i++) {             // relief
      const px = r() * W, py = r() * H, s = 2 + r() * 9;
      hx.fillStyle = (r() < 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (0.08 + r() * 0.2) + ')';
      hx.beginPath(); hx.ellipse(px, py, s, s * 0.72, r() * 3.14, 0, 6.28318); hx.fill();
    }
    return { map: tex(c), normalMap: tex(normalFromHeight(hc), { srgb: false }) };
  });
}

/**
 * The darkness in a mouth: black in the middle, deep grey at the rim, so the
 * plane reads as a hole with something behind it rather than as a black sticker.
 */
export function mouthGradient() {
  return cached(texCache, 'mouth', () => {
    const S = 128;
    const c = canvasOf(S, S), x = c.getContext('2d');
    x.fillStyle = '#000000'; x.fillRect(0, 0, S, S);
    const g = x.createRadialGradient(S / 2, S * 0.62, S * 0.06, S / 2, S * 0.55, S * 0.72);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.55, '#0b0d10');
    g.addColorStop(1, '#22262b');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const r = mulberry32(53);
    for (let i = 0; i < 400; i++) {             // wet rock catching the daylight
      x.fillStyle = 'rgba(120,128,140,' + (0.02 + r() * 0.06) + ')';
      x.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 2);
    }
    return tex(c, { wrap: false });
  });
}

/**
 * A board with the mine's name burnt into it, lettered in the HUD's display
 * face. In node the canvas is the recording stub, so the geometry, the material
 * and the wiring are the real ones and the text is readable off
 * `material.map.image.__texts`.
 */
export function signTexture(name) {
  return cached(texCache, 'sign:' + name, () => {
    const W = 512, H = 160;
    const c = canvasOf(W, H), x = c.getContext('2d');
    x.fillStyle = '#7d5f3c'; x.fillRect(0, 0, W, H);
    const r = mulberry32(59);
    for (let i = 0; i < 700; i++) {             // the grain of the board itself
      x.fillStyle = (r() < 0.55 ? 'rgba(40,26,14,' : 'rgba(214,184,144,') + (0.04 + r() * 0.14) + ')';
      x.fillRect(r() * W, r() * H, 2 + r() * 40, 1 + r() * 2);
    }
    x.fillStyle = 'rgba(24,16,8,0.55)';
    x.fillRect(0, 0, W, 6); x.fillRect(0, H - 6, W, 6);
    x.fillRect(0, 0, 6, H); x.fillRect(W - 6, 0, 6, H);
    // burnt in, so it is darker than the board and lit from one side
    const size = name.length > 18 ? 40 : 50;
    x.font = `600 ${size}px ${theme.fonts.display}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(226,198,150,0.35)';
    x.fillText(name, W / 2 + 2, H / 2 + 3);
    x.fillStyle = '#231508';
    x.fillText(name, W / 2, H / 2);
    const t = tex(c, { wrap: false });
    t.userData = { signText: name };
    return t;
  });
}

// -------------------------------------------------------------- materials --

const std = (o) => new THREE.MeshStandardMaterial(o);

export const timberMat = () => cached(matCache, 'timber', () => {
  const t = timberTexture();
  return std({ color: 0xffffff, map: t.map, normalMap: t.normalMap, roughness: 0.88, metalness: 0.0 });
});
export const ironMat = () => cached(matCache, 'iron', () => {
  const t = ironTexture();
  return std({ color: 0xffffff, map: t.map, normalMap: t.normalMap, roughness: 0.52, metalness: 0.72 });
});
export const rockMat = () => cached(matCache, 'rock', () => {
  const t = rockTexture();
  return std({ color: 0xffffff, map: t.map, normalMap: t.normalMap, roughness: 0.95, metalness: 0.02 });
});
/** Rock with ore flecked through it: the spoil heap, the cart's load, an outcrop. */
export const fleckMat = () => cached(matCache, 'fleck', () => {
  const t = rockTexture();
  return std({
    color: 0xffffff, map: t.map, normalMap: t.normalMap, vertexColors: true,
    roughness: 0.78, metalness: 0.18,
  });
});
/** The rock immediately inside a mouth: unlit, so daylight never brightens it. */
export const jambMat = () => cached(matCache, 'jamb', () => std({
  color: 0x14161a, roughness: 1, metalness: 0,
}));
/** The hole. Basic, not standard: a hole does not respond to the sun. */
export const darkMat = () => cached(matCache, 'dark', () => new THREE.MeshBasicMaterial({
  color: 0xffffff, map: mouthGradient(), fog: true,
}));
export const waterMat = () => cached(matCache, 'water', () => std({
  color: WATER_COLOUR, roughness: 0.14, metalness: 0.1, transparent: true, opacity: 0.86,
}));
/** A seam's band, and the flecks in it: the ore's own colour, lit like metal. */
export const bandMat = (ore) => cached(matCache, 'band:' + ore, () => std({
  color: oreColour(ore), roughness: 0.44, metalness: 0.55,
}));
/** The glint that makes a seam findable from twenty metres. Emissive, always on. */
export const glintMat = (ore) => cached(matCache, 'glint:' + ore, () => std({
  color: oreColour(ore), emissive: oreColour(ore), emissiveIntensity: 0.85,
  roughness: 0.22, metalness: 0.6,
}));
export const signMat = (name) => cached(matCache, 'sign:' + name, () => {
  const m = std({ color: 0xffffff, map: signTexture(name), roughness: 0.9, metalness: 0 });
  m.userData = { signText: name };
  return m;
});

/** Drop every cached sheet and material. Called when the canvas factory changes. */
export function clearMineCache() {
  for (const v of texCache.values()) {
    if (v && v.isTexture) v.dispose?.();
    else if (v) { v.map?.dispose?.(); v.normalMap?.dispose?.(); }
  }
  texCache.clear();
  for (const m of matCache.values()) m.dispose?.();
  matCache.clear();
}

// ----------------------------------------------------------------- merging --
//
// `site_models.mergeByMaterial` buckets by colour and DELETES every attribute
// but position and normal, because the kit's houses do not agree about uv sets.
// Everything here is textured, so a merge that threw the uvs away would hand
// back untextured grey. This merge buckets by material IDENTITY (there are ten
// of them, all cached) and keeps uv, and colour where the material asks for it.

/** Triangles in a mesh or a subtree. */
export function trisOf(obj) {
  let n = 0;
  obj.traverse?.((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  });
  if (obj.isMesh && !obj.traverse) {
    const g = obj.geometry;
    n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  }
  return n;
}

/**
 * Bake every mesh under `root` into one geometry per material, in root's own
 * local space. `root` must be detached, so its world matrix is its own.
 */
export function mergeParts(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material) || o.isInstancedMesh) return;
    let b = buckets.get(o.material);
    if (!b) { b = { mat: o.material, geos: [] }; buckets.set(o.material, b); }
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    b.geos.push(g);
  });
  const out = new THREE.Group();
  for (const { mat, geos } of buckets.values()) {
    const want = mat.vertexColors ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
    for (const g of geos) {
      if (!g.attributes.normal) g.computeVertexNormals();
      const n = g.attributes.position.count;
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      if (mat.vertexColors && !g.attributes.color) {
        g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      }
      for (const name of Object.keys(g.attributes)) if (!want.includes(name)) g.deleteAttribute(name);
    }
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!geo) continue;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

// ----------------------------------------------------------------- helpers --

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A box, placed and turned, added to `into`. */
function box(into, mat, w, h, d, x, y, z, ry = 0, rz = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  into.add(m);
  return m;
}

/** A cylinder standing on its own axis, placed and turned. */
function cyl(into, mat, rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0, open = false) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  into.add(m);
  return m;
}

/**
 * Drop a built sub-group until its lowest vertex rests on `groundY`. A cart
 * lying on its side, a leaning post: anything whose own rotation decides where
 * its bottom is cannot be placed by arithmetic, so it is measured instead.
 */
function seatOnGround(group, groundY) {
  group.position.y = 0;
  group.updateMatrixWorld(true);
  let lo = Infinity;
  const v = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (v.y < lo) lo = v.y;
    }
  });
  if (lo === Infinity) return;
  group.position.y = groundY - lo;
  group.updateMatrixWorld(true);
}

/**
 * A local frame on the ground. `facing` turns local +z into the world bearing,
 * exactly as `site_models.js` reads a site's facing, so local +z is out of the
 * hill at a mouth and downhill at a yard.
 */
function frameOf(cx, cy, cz, facing, heightAt) {
  const c = Math.cos(facing), s = Math.sin(facing);
  const world = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  // Every ground sample a builder took, in world coordinates. This is the
  // record of "the ground is sampled, never assumed": a test can hold each foot
  // against `heightAt` at that exact point and prove the builder asked, and can
  // prove the answers differ on a slope rather than all being the site's own y.
  const feet = [];
  return {
    world,
    feet,
    /** Ground height at a local point, relative to the frame's own y. */
    gy(lx, lz) {
      const [wx, wz] = world(lx, lz);
      const h = heightAt(wx, wz);
      feet.push({ x: wx, z: wz, y: h });
      return h - cy;
    },
  };
}

// ------------------------------------------------------------------ mouth --

/** Half the gap between the portal posts. */
export const PORTAL_HALF = 1.35;
export const PORTAL_H = 3.05;
/** The opening itself, which is what you look into. */
export const OPEN_W = 2.44;
export const OPEN_H = 2.86;
/** Sleeper spacing and how far the track runs out of the mouth. */
export const SLEEPERS = 5;
export const SLEEPER_STEP = 0.52;
export const TRACK_START = 0.55;
/**
 * The stone kerb across the foot of the opening. It is a real thing at a real
 * adit, and it is also what hides the hillside where the hillside rises behind
 * the mouth. 0.45 m covers the worst of the seven mines with margin.
 */
export const MOUTH_SILL = 0.45;
/** How bright a lantern's glass goes at full night. */
export const LANTERN_GLOW = 2.2;
/** Turns per second of a headframe wheel: one turn in about seventeen seconds. */
export const WHEEL_RPS = 0.06;

/**
 * One cut, with the mouth at the origin of its own frame and +z out of the hill.
 *
 * `mouth` is a Z1 mouth record: { x, y, z, facing, name, oreBand, ... }. `opts`
 * needs `heightAt(x, z)`; without one the ground is taken as level, which is
 * what `auditMineModels` uses and what a caller with no field gets.
 *
 * Returns a THREE.Group already placed in the world, carrying
 * `userData.mineUpdate(dt, nightFactor)` for the lantern.
 */
export function buildMineMouth(mouth, opts = {}) {
  const heightAt = opts.heightAt || (() => mouth.y || 0);
  const ore = (mouth.oreBand && mouth.oreBand[0]) || 'iron';
  const seed = opts.seed ?? 0;
  const rng = mulberry32(((seed | 0) * 2654435761 + Math.round(mouth.x * 7 + mouth.z * 13)) >>> 0);
  const F = frameOf(mouth.x, mouth.y, mouth.z, mouth.facing, heightAt);

  const g = new THREE.Group();
  g.name = 'mine-mouth';
  g.position.set(mouth.x, mouth.y, mouth.z);
  g.rotation.y = mouth.facing;

  const S = new THREE.Group();      // everything that merges
  const timber = timberMat(), iron = ironMat(), rock = rockMat();

  // ---- the hole ----------------------------------------------------------
  // Four layers of depth over a metre: the rock overhang at z +0.4, the timber
  // frame at +0.10, the jamb walls from 0 back to -0.34, and the gradient plane
  // at -0.34. A deeper recess would look better and cannot be had: the hillside
  // rises behind the mouth (measured: +0.16 m at 0.3 m back, +0.78 m at 0.6 m
  // at the steepest cut) and would show as a lit wedge inside the opening.
  // MOUTH_SILL is the stone kerb that hides the worst of that intrusion, and the
  // plane's foot sits on top of it.
  const jamb = jambMat();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(OPEN_W, OPEN_H - MOUTH_SILL), darkMat());
  plane.position.set(0, MOUTH_SILL + (OPEN_H - MOUTH_SILL) / 2 - 0.16, -0.34);
  S.add(plane);
  box(S, rock, OPEN_W + 0.30, MOUTH_SILL + 0.16, 0.46, 0, (MOUTH_SILL - 0.16) / 2, -0.14);
  box(S, jamb, 0.30, OPEN_H, 0.40, -(OPEN_W / 2 + 0.15), OPEN_H / 2 - 0.16, -0.16);
  box(S, jamb, 0.30, OPEN_H, 0.40, OPEN_W / 2 + 0.15, OPEN_H / 2 - 0.16, -0.16);
  box(S, jamb, OPEN_W + 0.6, 0.34, 0.40, 0, OPEN_H - 0.16 + 0.17, -0.16);

  // ---- the timber portal --------------------------------------------------
  // A post grows DOWN until it reaches its own ground: measured, the hillside
  // cross-slopes by up to 2 m over the width of a portal, so a post cut to one
  // length would float at one side and be buried at the other.
  for (const side of [-1, 1]) {
    const px = side * PORTAL_HALF;
    const foot = Math.min(0, F.gy(px, 0.10)) - 0.22;
    const h = PORTAL_H - foot;
    box(S, timber, 0.34, h, 0.34, px, foot + h / 2, 0.10);
    // a sill timber in the dirt at the foot of each post
    box(S, timber, 0.46, 0.20, 0.62, px, foot + 0.10, 0.42);
    // a knee brace up into the lintel
    box(S, timber, 0.20, 1.05, 0.20, px - side * 0.44, PORTAL_H - 0.62, 0.10, 0, side * 0.72);
  }
  box(S, timber, PORTAL_HALF * 2 + 0.34, 0.42, 0.44, 0, PORTAL_H - 0.21, 0.10);       // lintel
  box(S, timber, PORTAL_HALF * 2 + 0.66, 0.30, 0.22, 0, PORTAL_H + 0.16, 0.24);       // head board
  for (let i = 0; i < 3; i++) {                                                        // lagging over the head
    box(S, timber, 0.62, 0.14, 0.5, (i - 1) * 0.7, PORTAL_H + 0.36, 0.06);
  }

  // ---- iron on the timber -------------------------------------------------
  for (const side of [-1, 1]) {
    const px = side * PORTAL_HALF;
    for (const y of [0.72, 2.05]) box(S, iron, 0.42, 0.15, 0.42, px, y, 0.10);
    for (const y of [0.72, 2.05]) for (const dz of [-0.14, 0.14]) {
      cyl(S, iron, 0.05, 0.05, 0.07, 8, px + side * 0.215, y, 0.10 + dz, 0, 0, Math.PI / 2);
    }
  }
  for (const side of [-1, 1]) {
    box(S, iron, 0.17, 0.50, 0.48, side * (PORTAL_HALF - 0.06), PORTAL_H - 0.21, 0.10);
    cyl(S, iron, 0.05, 0.05, 0.07, 8, side * (PORTAL_HALF - 0.06), PORTAL_H - 0.21, 0.35, Math.PI / 2);
  }

  // ---- the rock the cut is in --------------------------------------------
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2;
    const r = 0.34 + rng() * 0.66;
    const lx = Math.sin(a) * (1.85 + rng() * 1.4);
    const lz = -Math.abs(Math.cos(a)) * (0.5 + rng() * 1.4) + 0.25;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rock);
    // A dodecahedron's scale is applied BEFORE its rotation, so a squashed one
    // still reaches a full radius downward once it is turned. Seat it at 0.60 r
    // and the deepest it can bed itself is 0.40 r, inside MAX_SINK.
    m.position.set(lx, F.gy(lx, lz) + r * 0.60, lz);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    m.scale.set(1, 0.78 + rng() * 0.3, 1);
    S.add(m);
  }
  // a fan of spoil below the mouth, which is where everything taken out went
  {
    const sz = 1.9;
    const cone = new THREE.ConeGeometry(1.85, 0.72, 14, 2);
    const pos = cone.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c3 = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const j = 0.84 + rng() * 0.34;
      pos.setX(i, pos.getX(i) * j * 1.3);
      pos.setZ(i, pos.getZ(i) * j);
    }
    cone.computeVertexNormals();
    for (let f = 0; f < pos.count / 3; f++) {
      const isOre = rng() > 0.83;
      c3.setHex(isOre ? oreColour(ore) : HOST_ROCK).multiplyScalar(isOre ? 1 : 0.84 + rng() * 0.22);
      for (let v = 0; v < 3; v++) { const o = (f * 3 + v) * 3; col[o] = c3.r; col[o + 1] = c3.g; col[o + 2] = c3.b; }
    }
    cone.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const fan = new THREE.Mesh(cone, fleckMat());
    fan.position.set(-1.65, F.gy(-1.65, sz) + 0.30, sz);
    S.add(fan);
  }
  // three spare props leaning on the portal, the way spare props are left
  for (let i = 0; i < 3; i++) {
    const lx = -PORTAL_HALF - 0.30 - i * 0.16;
    box(S, timber, 0.16, 2.5, 0.16, lx, F.gy(lx, 0.5) + 1.16, 0.55 + i * 0.1, 0, 0.22 + i * 0.05, 0.12);
  }
  // one boulder over the head of the cut, which is what makes it read as cut
  {
    const r = 1.05;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rock);
    m.position.set(-0.25, PORTAL_H + 0.85, -0.55);
    m.rotation.set(0.4, 0.9, 0.2);
    m.scale.set(1.5, 0.72, 1.1);
    S.add(m);
  }

  // ---- rail track, laid on whatever ground is there -----------------------
  // Measured: the ground in front of a cut falls 3.7 m over six metres (9.5 m
  // at the Ember Cut). A track laid level would end in mid air, so every
  // sleeper asks for its own height and each rail spans the gap between two.
  const ties = [];
  for (let i = 0; i < SLEEPERS; i++) {
    const lz = TRACK_START + i * SLEEPER_STEP;
    const y = F.gy(0, lz);
    const [wx, wz] = F.world(0, lz);
    ties.push({ z: lz, y, x: wx, wz, wy: y + mouth.y });
    box(S, timber, 1.34, 0.15, 0.24, 0, y + 0.045, lz);
    // a chair each side, which is what holds a rail down on a sleeper
    for (const side of [-1, 1]) box(S, iron, 0.20, 0.09, 0.20, side * 0.44, y + 0.165, lz);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < ties.length - 1; i++) {
      const a = ties[i], b = ties[i + 1];
      const dz = b.z - a.z, dy = b.y - a.y;
      const len = Math.hypot(dz, dy);
      // a rail follows the sleepers it is spiked to: pitched, not laid level
      box(S, iron, 0.075, 0.11, len, side * 0.44, (a.y + b.y) / 2 + 0.17, (a.z + b.z) / 2,
        0, 0, -Math.atan2(dy, dz));
    }
  }

  // ---- the cart, tipped at the end of the track --------------------------
  const cz = TRACK_START + SLEEPERS * SLEEPER_STEP + 0.45;
  const cyGround = F.gy(0.35, cz);
  const cart = new THREE.Group();
  cart.position.set(0.35, cyGround, cz);
  cart.rotation.set(0, 0.32, 1.12);            // gone over on its side, load out
  S.add(cart);
  const B = 0.52;                               // half the body
  box(cart, iron, B * 2, 0.06, B * 2.6, 0, 0.34, 0);                 // floor
  for (const s of [-1, 1]) box(cart, iron, 0.06, 0.52, B * 2.6, s * B, 0.60, 0);
  for (const s of [-1, 1]) box(cart, iron, B * 2, 0.52, 0.06, 0, 0.60, s * B * 1.3);
  for (const y of [0.44, 0.78]) box(cart, iron, B * 2.1, 0.07, B * 2.7, 0, y, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(cart, iron, 0.27, 0.27, 0.09, 14, sx * (B + 0.08), 0.27, sz * 0.46, 0, 0, Math.PI / 2);
  }
  for (const sz of [-1, 1]) cyl(cart, iron, 0.045, 0.045, B * 2.2, 6, 0, 0.27, sz * 0.46, 0, 0, Math.PI / 2);
  // a cart on its side does not sit where arithmetic says it does; measure it
  seatOnGround(cart, cyGround);
  // the load, spilled out where the cart went over
  const heap = buildOreHeap(ore, 6, { seed: 3 });
  if (heap) {
    heap.material.dispose();
    heap.material = fleckMat();
    heap.scale.setScalar(2.4);
    const hz = cz + 0.95;
    heap.position.set(0.9, F.gy(0.9, hz), hz);
    S.add(heap);
  }

  // ---- what merges, merges ------------------------------------------------
  // a COPY: `add` unparents, which mutates the array being walked, and half the
  // merged meshes would be left behind without a single error anywhere
  for (const child of [...mergeParts(S).children]) g.add(child);

  // ---- the lantern, which is the one thing that changes -------------------
  const lantern = new THREE.Group();
  const lx = PORTAL_HALF, ly = 2.42;
  lantern.position.set(lx, ly, 0.42);
  g.add(lantern);
  box(lantern, iron, 0.10, 0.09, 0.46, -0.06, 0.30, -0.20);                    // bracket
  cyl(lantern, iron, 0.035, 0.035, 0.22, 6, 0, 0.19, 0);                       // hanger
  cyl(lantern, iron, 0.145, 0.16, 0.05, 10, 0, -0.16, 0);                      // base
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.13, 10), iron);
  cap.position.set(0, 0.09, 0); lantern.add(cap);
  const glassM = std({
    color: LANTERN_COLOUR, emissive: LANTERN_COLOUR, emissiveIntensity: 0,
    roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.72,
  });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.26, 10, 1, true), glassM);
  glass.position.set(0, -0.02, 0);
  lantern.add(glass);
  const flameM = std({ color: LANTERN_COLOUR, emissive: LANTERN_COLOUR, emissiveIntensity: 0, roughness: 1 });
  const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), flameM);
  flame.position.set(0, -0.04, 0);
  lantern.add(flame);
  lantern.visible = false;
  // the merged parts get their shadow flags from mergeParts; these do not, and
  // a lantern bracket that casts no shadow reads as a decal on the post
  lantern.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.material === iron;
    o.receiveShadow = o.material === iron;
  });

  let t = rng() * 10;
  g.userData.mineUpdate = (dt, nightFactor) => {
    t += dt || 0;
    const k = clamp01(nightFactor);
    lantern.visible = k > 0.02;
    if (!lantern.visible) {
      // put it out as well as hide it: a hidden thing that is still lit comes
      // back lit the moment anything else turns it on
      glassM.emissiveIntensity = 0;
      flameM.emissiveIntensity = 0;
      return;
    }
    // a flame is never steady: two slow sines beat against each other
    const flick = 0.84 + 0.16 * Math.sin(t * 7.1) * Math.sin(t * 2.3 + 1.1);
    glassM.emissiveIntensity = k * flick * LANTERN_GLOW;
    flameM.emissiveIntensity = k * flick * LANTERN_GLOW * 1.6;
    flame.scale.setScalar(0.9 + 0.18 * flick);
  };
  g.userData.mine = { part: 'mouth', ore, lantern: true, feet: F.feet, ties };
  return g;
}

// ------------------------------------------------------------------- yard --

/** Where each prop stands, in the yard's own frame. +z is downhill, out. */
export const YARD_SPOTS = {
  headframe: [0.0, -3.6],
  crates: [-4.2, 0.9],
  barrels: [-3.1, 3.3],
  trough: [4.4, -1.4],
  rack: [3.3, 2.4],
  spoil: [-3.0, 2.2],
  sign: [2.6, 5.2],
  timber: [1.6, -5.2],
  rope: [-1.9, 1.4],
  barrow: [-2.0, -1.6],
  horse: [5.0, 1.2],
};

/**
 * The yard. `mine` is a Z1 mine site: { x, y, z, facing, name, oreBand, ... }.
 * Returns a THREE.Group placed in the world with
 * `userData.mineUpdate(dt, nightFactor)` for the headframe wheel.
 *
 * Everything stands inside 6.2 m of the centre. That is not decoration: the
 * yard is flat to 0.00 m out to 10 m (measured over all seven mines), the
 * nearest surface seam of any mine is 7.1 m out, and the nearest cut is 21 m
 * out, so nothing here can land on a seam or block a mouth.
 */
export function buildMineYard(mine, opts = {}) {
  const heightAt = opts.heightAt || (() => mine.y || 0);
  const band = Array.isArray(mine.oreBand) && mine.oreBand.length ? mine.oreBand : ['iron'];
  const ore = band[band.length - 1];             // the richest of the band, on the spoil
  const seed = opts.seed ?? 0;
  const rng = mulberry32(((seed | 0) * 2654435761 + Math.round(mine.x * 11 + mine.z * 17)) >>> 0);
  const F = frameOf(mine.x, mine.y, mine.z, mine.facing, heightAt);

  const g = new THREE.Group();
  g.name = 'mine-yard';
  g.position.set(mine.x, mine.y, mine.z);
  g.rotation.y = mine.facing;

  const S = new THREE.Group();
  const timber = timberMat(), iron = ironMat(), rock = rockMat();
  const at = (spot) => {
    const [x, z] = YARD_SPOTS[spot];
    return { x, z, y: F.gy(x, z) };
  };

  // ---- the headframe ------------------------------------------------------
  const hf = at('headframe');
  const frame = new THREE.Group();
  frame.position.set(hf.x, hf.y, hf.z);
  S.add(frame);
  const LEG = 4.7, SPLAY = 0.20;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // each leg leans in toward the head beam, and finds its own footing
    const fx = sx * 1.25, fz = sz * 0.95;
    const foot = F.gy(hf.x + fx, hf.z + fz) - hf.y;
    box(frame, timber, 0.30, LEG - foot, 0.30, fx * 0.62, foot + (LEG - foot) / 2, fz * 0.62,
      0, -sx * SPLAY, sz * SPLAY * 0.7);
  }
  for (const sz of [-1, 1]) {
    box(frame, timber, 2.1, 0.20, 0.20, 0, 1.5, sz * 0.72);
    box(frame, timber, 2.2, 0.18, 0.18, 0, 3.0, sz * 0.66);
  }
  box(frame, timber, 2.5, 0.34, 0.34, 0, LEG - 0.05, 0);                  // head beam
  box(frame, timber, 0.34, 0.34, 1.9, 0, LEG - 0.05, 0);                  // and its cross
  // the winch at the foot: a drum, a frame and a crank
  cyl(frame, timber, 0.30, 0.30, 1.15, 12, 0, 0.72, 1.15, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) box(frame, timber, 0.16, 1.05, 0.4, sx * 0.68, 0.52, 1.15);
  box(frame, iron, 0.09, 0.09, 0.46, 0.78, 0.72, 1.15, 0, 0, Math.PI / 2);
  box(frame, timber, 0.09, 0.34, 0.09, 0.78, 0.90, 1.38);
  // the rope, off the drum, over the wheel and down the shaft
  cyl(frame, iron, 0.035, 0.035, 3.4, 6, 0.0, 2.6, 0.78, 0.24);
  cyl(frame, iron, 0.035, 0.035, 3.6, 6, 0.0, 2.5, -0.66, -0.10);
  // the shaft the rope goes down: a collar of timber round a black square
  box(S, timber, 2.1, 0.26, 0.22, hf.x, hf.y + 0.13, hf.z - 0.98);
  box(S, timber, 2.1, 0.26, 0.22, hf.x, hf.y + 0.13, hf.z - 2.02);
  box(S, timber, 0.22, 0.26, 1.26, hf.x - 0.94, hf.y + 0.13, hf.z - 1.5);
  box(S, timber, 0.22, 0.26, 1.26, hf.x + 0.94, hf.y + 0.13, hf.z - 1.5);
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 1.02), darkMat());
  shaft.rotation.x = -Math.PI / 2;
  shaft.position.set(hf.x, hf.y + 0.04, hf.z - 1.5);
  S.add(shaft);

  // ---- crates -------------------------------------------------------------
  {
    const p = at('crates');
    const stack = [
      [0, 0, 0, 0.0], [0.86, 0, 0.1, 0.35], [0.1, 0, 0.9, -0.28],
      [0.44, 0.78, 0.42, 0.62], [-0.7, 0, 0.7, 0.2], [-0.62, 0.78, 0.05, -0.5],
    ];
    for (const [dx, dy, dz, ry] of stack) {
      const c = new THREE.Group();
      c.position.set(p.x + dx, p.y + dy, p.z + dz);
      c.rotation.y = ry;
      S.add(c);
      box(c, timber, 0.76, 0.74, 0.76, 0, 0.37, 0);
      for (const s of [-1, 1]) box(c, timber, 0.80, 0.09, 0.09, 0, 0.37, s * 0.385);
      for (const s of [-1, 1]) box(c, timber, 0.09, 0.09, 0.80, s * 0.385, 0.37, 0);
    }
  }

  // ---- barrels ------------------------------------------------------------
  {
    const p = at('barrels');
    const spots = [[0, 0, 0], [0.72, 0, 0.24], [0.30, 0, 0.92], [1.05, 0, 1.0]];
    for (let i = 0; i < spots.length; i++) {
      const [dx, , dz] = spots[i];
      const b = new THREE.Group();
      b.position.set(p.x + dx, F.gy(p.x + dx, p.z + dz), p.z + dz);
      b.rotation.y = rng() * Math.PI;
      S.add(b);
      cyl(b, timber, 0.24, 0.22, 0.16, 16, 0, 0.08, 0);            // the chime
      cyl(b, timber, 0.28, 0.24, 0.50, 16, 0, 0.41, 0);            // the belly
      cyl(b, timber, 0.22, 0.28, 0.16, 16, 0, 0.74, 0);
      for (const y of [0.12, 0.41, 0.72]) cyl(b, iron, 0.29, 0.29, 0.07, 16, 0, y, 0, 0, 0, 0, true);
      const lid = new THREE.Mesh(new THREE.CircleGeometry(0.225, 16), timber);
      lid.rotation.x = -Math.PI / 2;
      lid.position.set(0, 0.825, 0);
      b.add(lid);
    }
  }

  // ---- the water trough ---------------------------------------------------
  {
    const p = at('trough');
    const tr = new THREE.Group();
    tr.position.set(p.x, p.y, p.z);
    tr.rotation.y = 0.42;
    S.add(tr);
    box(tr, timber, 1.90, 0.10, 0.70, 0, 0.50, 0);
    for (const s of [-1, 1]) box(tr, timber, 0.10, 0.46, 0.70, s * 0.95, 0.72, 0);
    for (const s of [-1, 1]) box(tr, timber, 1.90, 0.46, 0.10, 0, 0.72, s * 0.35);
    for (const s of [-1, 1]) box(tr, timber, 0.20, 0.46, 0.60, s * 0.70, 0.23, 0);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.50), waterMat());
    w.rotation.x = -Math.PI / 2;
    w.position.set(0, 0.83, 0);
    tr.add(w);
  }

  // ---- the tool rack, with picks in it ------------------------------------
  {
    const p = at('rack');
    const rk = new THREE.Group();
    rk.position.set(p.x, p.y, p.z);
    rk.rotation.y = -0.7;
    S.add(rk);
    for (const s of [-1, 1]) box(rk, timber, 0.14, 1.60, 0.14, s * 0.80, 0.80, 0);
    box(rk, timber, 1.74, 0.12, 0.12, 0, 1.50, 0);
    box(rk, timber, 1.74, 0.12, 0.12, 0, 0.42, 0);
    for (let i = 0; i < 3; i++) {
      const dx = (i - 1) * 0.52;
      const pick = new THREE.Group();
      pick.position.set(dx, 0, 0.06);
      pick.rotation.z = (i - 1) * 0.10;
      rk.add(pick);
      cyl(pick, timber, 0.035, 0.042, 1.34, 6, 0, 0.72, 0);
      box(pick, iron, 0.10, 0.10, 0.12, 0, 1.36, 0);
      for (const s of [-1, 1]) {
        box(pick, iron, 0.36, 0.075, 0.075, s * 0.19, 1.36, 0, 0, s * 0.22);
        box(pick, iron, 0.13, 0.055, 0.055, s * 0.40, 1.30, 0, 0, s * 0.42);
      }
    }
  }

  // ---- the spoil heap: grey rock with the band's richest ore flecked in ----
  {
    const p = at('spoil');
    const hex = oreColour(ore);
    const cone = new THREE.ConeGeometry(2.2, 1.50, 24, 4);
    const pos = cone.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c3 = new THREE.Color();
    const noise = mulberry32(71);
    // shove every ring around so the heap is a tip, not a cone, and fleck it
    const jitter = [];
    for (let i = 0; i < pos.count; i++) jitter.push(0.82 + noise() * 0.36);
    for (let i = 0; i < pos.count; i++) {
      const j = jitter[i];
      pos.setX(i, pos.getX(i) * j);
      pos.setZ(i, pos.getZ(i) * j);
      pos.setY(i, pos.getY(i) * (0.86 + (j - 0.82) * 0.5));
    }
    cone.computeVertexNormals();
    for (let f = 0; f < pos.count / 3; f++) {
      const isOre = noise() > 0.80;
      c3.setHex(isOre ? hex : HOST_ROCK).multiplyScalar(isOre ? 1.0 : 0.84 + noise() * 0.24);
      for (let v = 0; v < 3; v++) {
        const o = (f * 3 + v) * 3;
        col[o] = c3.r; col[o + 1] = c3.g; col[o + 2] = c3.b;
      }
    }
    cone.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const heap = new THREE.Mesh(cone, fleckMat());
    heap.position.set(p.x, p.y + 0.72, p.z);
    S.add(heap);
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2, d = 1.5 + rng() * 0.9;
      const lx = p.x + Math.cos(a) * d, lz = p.z + Math.sin(a) * d;
      const r = 0.16 + rng() * 0.24;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rock);
      m.position.set(lx, F.gy(lx, lz) + r * 0.55, lz);
      m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      S.add(m);
    }
  }

  // ---- a stack of pit props, which is `log_piles.js`'s own prop ------------
  {
    const p = at('timber');
    const pile = buildLogPile('oak', 6, { seed: 5 });
    if (pile) {
      pile.material.dispose();
      pile.material = timber;
      pile.position.set(p.x, p.y, p.z);
      pile.rotation.y = 0.5;
      pile.scale.setScalar(1.5);
      S.add(pile);
    }
  }

  // ---- a barrow, tipped forward on its nose, and a sawhorse ---------------
  {
    const p = at('barrow');
    const bw = new THREE.Group();
    bw.position.set(p.x, p.y, p.z);
    bw.rotation.set(0, -1.1, 0);
    S.add(bw);
    box(bw, timber, 0.62, 0.06, 0.94, 0, 0.42, 0);                          // tray floor
    for (const s of [-1, 1]) box(bw, timber, 0.05, 0.30, 0.94, s * 0.31, 0.57, 0);
    box(bw, timber, 0.62, 0.30, 0.05, 0, 0.57, -0.47);
    for (const s of [-1, 1]) box(bw, timber, 0.07, 0.07, 1.90, s * 0.27, 0.38, 0.42, 0, 0, 0.12);
    for (const s of [-1, 1]) box(bw, timber, 0.09, 0.44, 0.09, s * 0.27, 0.20, 0.30);
    cyl(bw, iron, 0.28, 0.28, 0.08, 14, 0, 0.29, -0.86, 0, 0, Math.PI / 2);
    cyl(bw, iron, 0.04, 0.04, 0.36, 6, 0, 0.29, -0.86, 0, 0, Math.PI / 2);
    seatOnGround(bw, p.y);
  }
  {
    const p = at('horse');
    const sh = new THREE.Group();
    sh.position.set(p.x, p.y, p.z);
    sh.rotation.y = 0.9;
    S.add(sh);
    box(sh, timber, 1.60, 0.16, 0.18, 0, 0.74, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(sh, timber, 0.10, 0.82, 0.10, sx * 0.58, 0.37, sz * 0.28, 0, -sx * 0.30, sz * 0.30);
    }
    // a plank being cut, still on the horse
    box(sh, timber, 2.20, 0.07, 0.34, 0.16, 0.86, 0.02, 0.14);
  }

  // ---- a coil of rope -----------------------------------------------------
  {
    const p = at('rope');
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.055, 6, 16), iron);
    coil.rotation.x = -Math.PI / 2;
    coil.position.set(p.x, p.y + 0.06, p.z);
    S.add(coil);
  }

  // ---- the board with the name on it --------------------------------------
  {
    const p = at('sign');
    const sg = new THREE.Group();
    sg.position.set(p.x, p.y, p.z);
    sg.rotation.y = 0.16;          // square to the approach, near enough
    S.add(sg);
    for (const s of [-1, 1]) box(sg, timber, 0.15, 2.05, 0.15, s * 0.86, 1.02, 0);
    box(sg, timber, 2.10, 0.72, 0.10, 0, 1.62, 0);
    for (const s of [-1, 1]) box(sg, iron, 0.13, 0.80, 0.18, s * 0.80, 1.62, 0);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.96, 0.62), signMat(mine.name));
    face.position.set(0, 1.62, 0.056);
    sg.add(face);
  }

  // a COPY: `add` unparents, which mutates the array being walked, and half the
  // merged meshes would be left behind without a single error anywhere
  for (const child of [...mergeParts(S).children]) g.add(child);

  // ---- the wheel, which is the one thing that turns -----------------------
  const mount = new THREE.Group();
  mount.position.set(hf.x, hf.y + LEG - 0.42, hf.z);
  mount.rotation.y = Math.PI / 2;
  g.add(mount);
  const spin = new THREE.Group();
  mount.add(spin);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.10, 6, 20), iron);
  spin.add(rim);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    box(spin, iron, 1.52, 0.07, 0.07, 0, 0, 0, 0, a);
  }
  cyl(spin, iron, 0.15, 0.15, 0.24, 10, 0, 0, 0, Math.PI / 2);
  spin.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  let turned = 0;
  g.userData.mineUpdate = (dt) => {
    turned += (dt || 0) * WHEEL_RPS * Math.PI * 2;
    spin.rotation.z = turned;
  };
  g.userData.mine = { part: 'yard', ore, sign: mine.name, wheel: true, feet: F.feet };
  return g;
}

// ------------------------------------------------------------------- seam --

/** How far out the outcrop reaches. Two seams can be 0.60 m apart; see below. */
export const SEAM_R = 2.60;
/**
 * The column the outcrop never enters. `flora.js` puts ONE ore boulder at each
 * seam's exact centre at a scale of `SIZE.ore` = 1.00 to 1.70 on a unit
 * icosphere, so the SMALLEST minable rock there is 1.00 m in radius. Nothing
 * built here comes inside that, so the boulder is never buried and a player
 * swinging a pickaxe is never swinging at scenery. A bigger boulder leans into
 * the collar, which is what an outcrop is supposed to look like.
 */
export const SEAM_CORE = 1.00;
/** Where the collar starts, which is the core plus the biggest lump's own half. */
export const SEAM_CLEAR = 1.65;

/**
 * One surface seam: the outcrop around the ore boulder `flora.js` already puts
 * here. Grey country rock in a collar, a band of the ore's own colour cutting
 * across it, and seven glints on the band.
 *
 * `seam` is a Z1 seam record: { x, y, z, ore, i }. Carries no harvest record on
 * purpose: the boulder in the middle is the minable thing, this is what it came
 * out of. MEASURED: the two closest seams in the world are 0.60 m apart (the
 * Low Shoulder), so the outcrop is a low collar rather than a ring wall, and two
 * that overlap read as one bigger outcrop instead of as two rocks in a fight.
 */
export function buildSeam(seam, opts = {}) {
  const heightAt = opts.heightAt || (() => seam.y || 0);
  const ore = seam.ore || 'iron';
  const rng = mulberry32(((opts.seed | 0) * 2654435761 + Math.round(seam.x * 5 + seam.z * 19) + (seam.i | 0) * 97) >>> 0);
  const yaw = rng() * Math.PI * 2;
  const F = frameOf(seam.x, seam.y, seam.z, yaw, heightAt);

  const g = new THREE.Group();
  g.name = 'mine-seam';
  g.position.set(seam.x, seam.y, seam.z);
  g.rotation.y = yaw;

  const S = new THREE.Group();
  const rock = rockMat();

  // the collar: six lumps of country rock leaning out of the turf, every one of
  // them clear of the boulder in the middle
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng() * 0.5;
    const d = SEAM_CLEAR + rng() * 0.30;
    const lx = Math.cos(a) * d, lz = Math.sin(a) * d;
    const r = 0.30 + rng() * 0.24;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rock);
    m.position.set(lx, F.gy(lx, lz) + r * 0.58, lz);
    m.rotation.set((rng() - 0.5) * 0.8, rng() * 3, (rng() - 0.5) * 0.8);
    m.scale.set(1.2, 0.70, 1.0);
    S.add(m);
  }
  // rubble at the foot of it, the same rock broken smaller
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2, d = SEAM_CORE + 0.35 + rng() * 0.9;
    const lx = Math.cos(a) * d, lz = Math.sin(a) * d;
    const r = 0.10 + rng() * 0.14;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rock);
    m.position.set(lx, F.gy(lx, lz) + r * 0.5, lz);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    S.add(m);
  }

  // The band: the reason a player walks over. Three slabs of the ore's own
  // colour outcropping on one flank of the collar, each pitched differently so
  // the band reads as bedded rock and not as paint. Kept on one side, because a
  // band that ringed the boulder would read as a fence.
  const bm = bandMat(ore);
  const bx = SEAM_CLEAR + 0.28;
  box(S, bm, 0.62, 0.20, 1.75, bx, F.gy(bx, 0) + 0.46, 0.00, 0.11, 0.16, -0.14);
  box(S, bm, 0.50, 0.14, 1.15, bx + 0.30, F.gy(bx + 0.3, -0.5) + 0.26, -0.55, -0.20, -0.10, -0.09);
  box(S, bm, 0.44, 0.12, 0.86, bx - 0.14, F.gy(bx, 0.7) + 0.66, 0.72, 0.26, 0.22, -0.18);

  // the glints, which are what carry twenty metres
  const gm = glintMat(ore);
  for (let i = 0; i < 7; i++) {
    const lz = -0.85 + rng() * 1.7;
    const lx = bx - 0.22 + rng() * 0.5;
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.075 + rng() * 0.055, 0), gm);
    m.position.set(lx, F.gy(lx, lz) + 0.30 + rng() * 0.44, lz);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    S.add(m);
  }

  // a COPY: `add` unparents, which mutates the array being walked, and half the
  // merged meshes would be left behind without a single error anywhere
  for (const child of [...mergeParts(S).children]) g.add(child);
  g.userData.mine = { part: 'seam', ore, feet: F.feet };
  return g;
}

// ------------------------------------------------------------------ audit --

/**
 * Lowest and highest vertex of a subtree, and how far out it reaches, all in the
 * subtree's OWN local space: `low` is metres above or below the group's origin,
 * which for a mouth, a yard or a seam is the ground under it.
 */
export function extentOf(obj) {
  let lo = Infinity, hi = -Infinity, out = 0;
  obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const pos = o.geometry.attributes.position;
    const m = inv.clone().multiply(o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (v.y < lo) lo = v.y;
      if (v.y > hi) hi = v.y;
      const d = Math.hypot(v.x, v.z);
      if (d > out) out = d;
    }
  });
  return { low: lo, high: hi, reach: out };
}

/**
 * Build one of everything at load and throw if it is over budget, floating or
 * sunk. Driven BOTH ways: every ore in the game gets a seam and a spoil heap,
 * and a seam of an ore that does not exist falls back to the host rock rather
 * than building a black hole.
 */
export function auditMineModels() {
  const bad = [];
  const flat = () => 0;
  const out = {};

  const mouth = {
    id: 'audit#m0', kind: 'cave', x: 0, y: 0, z: 0, facing: 0,
    name: 'the audit, the first cut', oreBand: ['iron', 'silver'],
  };
  const m = buildMineMouth(mouth, { heightAt: flat });
  const mt = trisOf(m), me = extentOf(m);
  out.mouth = { tris: mt, low: +me.low.toFixed(3), high: +me.high.toFixed(3), draws: m.children.length };
  if (mt > MOUTH_MAX_TRIS) bad.push(`a mouth is ${mt} triangles, over the ${MOUTH_MAX_TRIS} budget`);
  if (me.low < -MAX_SINK) bad.push(`a mouth reaches ${me.low.toFixed(2)} m under level ground`);
  if (me.low > MAX_FLOAT) bad.push(`a mouth floats ${me.low.toFixed(2)} m over level ground`);
  if (typeof m.userData.mineUpdate !== 'function') bad.push('a mouth has no update hook, so its lantern never lights');

  const mine = {
    id: 'audit', kind: 'mine', x: 0, y: 0, z: 0, facing: 0, flatR: 20,
    name: 'the Audit Cut', oreBand: ['iron', 'silver'],
  };
  const y = buildMineYard(mine, { heightAt: flat });
  const yt = trisOf(y), ye = extentOf(y);
  out.yard = {
    tris: yt, low: +ye.low.toFixed(3), high: +ye.high.toFixed(3),
    reach: +ye.reach.toFixed(2), draws: y.children.length,
  };
  if (ye.reach > YARD_PROP_R) {
    bad.push(`a yard reaches ${ye.reach.toFixed(2)} m from its centre, past the ${YARD_PROP_R} m a seam leaves it`);
  }
  if (yt > YARD_MAX_TRIS) bad.push(`a yard is ${yt} triangles, over the ${YARD_MAX_TRIS} budget`);
  if (ye.low < -MAX_SINK) bad.push(`a yard reaches ${ye.low.toFixed(2)} m under level ground`);
  if (ye.low > MAX_FLOAT) bad.push(`a yard floats ${ye.low.toFixed(2)} m over level ground`);
  if (typeof y.userData.mineUpdate !== 'function') bad.push('a yard has no update hook, so its wheel never turns');
  // the sign has to carry the name through the merge, or the board is blank
  let signed = null;
  y.traverse((o) => { if (o.isMesh && o.material?.userData?.signText) signed = o.material.userData.signText; });
  if (signed !== mine.name) bad.push(`the sign says ${JSON.stringify(signed)}, not ${JSON.stringify(mine.name)}`);

  out.seams = {};
  for (const id of Object.keys(ORE_WORD)) {
    const s = buildSeam({ i: 0, x: 0, y: 0, z: 0, ore: id }, { heightAt: flat });
    const st = trisOf(s), se = extentOf(s);
    out.seams[id] = { tris: st, low: +se.low.toFixed(3) };
    if (st > SEAM_MAX_TRIS) bad.push(`a ${id} seam is ${st} triangles, over the ${SEAM_MAX_TRIS} budget`);
    if (se.low < -MAX_SINK) bad.push(`a ${id} seam reaches ${se.low.toFixed(2)} m under level ground`);
    if (se.low > MAX_FLOAT) bad.push(`a ${id} seam floats ${se.low.toFixed(2)} m over level ground`);
    let banded = false;
    s.traverse((o) => { if (o.isMesh && o.material?.color?.getHex() === oreColour(id)) banded = true; });
    if (!banded) bad.push(`a ${id} seam carries no mesh in ${id}'s own colour`);
    if (!ORE[id]) bad.push(`there is a colour for "${id}" and ores.js does not tier it`);
    if (oreWord(id) !== ORE[id]?.colour) {
      bad.push(`the hex for ${id} was read off "${oreWord(id)}" and ores.js now says "${ORE[id]?.colour}"`);
    }
  }
  // The other direction: an ore nobody has heard of falls back to host rock
  // rather than to black, which is what an unknown hex would render as.
  if (oreColour('cheese') !== HOST_ROCK) bad.push('an ore that does not exist did not fall back to host rock');
  const odd = buildSeam({ i: 0, x: 0, y: 0, z: 0, ore: 'cheese' }, { heightAt: flat });
  let oddBand = false;
  odd.traverse((o) => { if (o.isMesh && o.material?.color?.getHex() === HOST_ROCK) oddBand = true; });
  if (!oddBand) bad.push('a seam of an ore that does not exist built no host rock band');

  if (bad.length) throw new Error(`mine_models: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return out;
}

export const MINE_AUDIT = auditMineModels();
