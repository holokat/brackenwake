// The portraits on the roster: one small render of each character, made once.
//
// The roster used to be a wall of words. A player with four characters knows
// them by how they look long before they read a name, so every row now carries
// a picture of the person it is offering, built from the same body the game
// walks around with and wearing the same gear the game would put on them.
//
// What this file does NOT do is invent a second way to draw a character. The
// body is player.js's buildCharacter, the gear is gear_visuals.js's dressRig,
// the pose is the rig's own idle, and the light is scene.js's curve at DAWN,
// which is the hour the creation screen frames its rig in. The only thing that
// is ours is the lens: a small perspective camera, off to one side, framing
// the head down to the knees.
//
//   createPortraits({ storage })
//     -> { of(row), forget(id), dispose(), hits, misses, drawn, size, webgl }
//
// One WebGLRenderer serves every row, and every portrait is cached against a
// signature of the look that made it, so a redraw of the list costs nothing
// and a character who changed their armour gets a new picture.
//
// Reading the save: the roster row carries a summary, and a summary has never
// held an appearance. So the look is read straight out of the character's own
// document, by the key state.js writes it under, and nothing is ever written
// back. A slot with no document, no appearance, or no WebGL at all gets the
// drawn silhouette instead, which is a picture rather than a broken image.

import * as THREE from 'three';
import { BODY, APPEARANCE_FALLBACK } from './player.js';
import { buildStudioCharacter as buildCharacter } from './studio/body.js';
import { dressRig, undress } from './gear_visuals.js';
import { lightingAt, DAWN } from './scene.js';
import { SAVE_KEY, slotKeyFor } from './state.js';
import { theme } from './ui_theme.js';

/**
 * The size of one portrait in CSS pixels, the lens that frames it, and how
 * much of the frame the body is allowed to fill. `fill` under 1 leaves air
 * over the crown and under the knee so nobody is cropped at the ear.
 */
export const PORTRAIT = Object.freeze({
  w: 160,
  h: 220,
  fov: 30,          // degrees, vertical
  fill: 0.86,       // of the frame height the head-to-knee span takes
  yawDeg: 32,       // three quarters: the body faces +z, the camera stands off it
  maxDpr: 2,
});

/**
 * Where the head and the knee are on a body of this height, in metres above
 * the sole. The rig stands with its hips at IDLE_HIP, its head group HEAD_Y
 * above that and hair HAIR_TOP above the head's own origin; the knee is the
 * ankle plus the shin. Everything scales with the height exactly as the
 * creation screen scales the group, so a 1.60 m character is the same picture
 * eight ninths of the size rather than a differently framed one.
 */
export function spanFor(height = BODY.HEIGHT) {
  const tall = Number.isFinite(height) && height > 0 ? height : BODY.HEIGHT;
  const scale = tall / BODY.HEIGHT;
  const knee = (BODY.ANKLE_Y + BODY.SHIN) * scale;
  const crown = (BODY.IDLE_HIP + BODY.HEAD_Y + BODY.HAIR_TOP) * scale;
  return { scale, knee, crown, aim: (knee + crown) / 2, span: crown - knee };
}

/**
 * The camera for a body of this height. Pure arithmetic, so the framing can be
 * measured in node with no GPU anywhere near it: the lens is put back far
 * enough that the head-to-knee span covers `fill` of the frame, level with the
 * middle of that span and turned `yawDeg` off the front.
 */
export function frameFor(height = BODY.HEIGHT, opts = {}) {
  const fov = Number.isFinite(opts.fov) ? opts.fov : PORTRAIT.fov;
  const fill = Number.isFinite(opts.fill) ? opts.fill : PORTRAIT.fill;
  const yawDeg = Number.isFinite(opts.yawDeg) ? opts.yawDeg : PORTRAIT.yawDeg;
  const s = spanFor(height);
  const halfFov = (fov * Math.PI) / 360;
  const dist = s.span / (2 * fill * Math.tan(halfFov));
  const yaw = (yawDeg * Math.PI) / 180;
  return {
    ...s, fov, fill, yaw, dist,
    /** half the world height the lens covers at the body's distance */
    halfHeight: dist * Math.tan(halfFov),
    pos: { x: Math.sin(yaw) * dist, y: s.aim, z: Math.cos(yaw) * dist },
    look: { x: 0, y: s.aim, z: 0 },
  };
}

// ------------------------------------------------------------- the silhouette

const enc = (s) => `data:image/svg+xml,${encodeURIComponent(s.replace(/\s+/g, ' ').trim())}`;

/**
 * The stand-in: a hooded figure under an arch, drawn here rather than fetched,
 * for a slot that has no character in it yet and for a browser that will not
 * give us a canvas. It is deliberately a drawing and not a render, because a
 * blurred body would read as a bug and a shape reads as "nobody yet".
 */
export function silhouetteSvg(w = PORTRAIT.w, h = PORTRAIT.h) {
  const g = theme.goldDim;
  return `<svg class="bw-ro-sil" viewBox="0 0 160 220" width="${w}" height="${h}"
    xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="bwsilg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#241f18"/>
        <stop offset="1" stop-color="#0c0a08"/>
      </linearGradient>
    </defs>
    <rect width="160" height="220" fill="url(#bwsilg)"/>
    <path d="M16 210 V96 Q16 30 80 14 Q144 30 144 96 V210" fill="none" stroke="${g}" stroke-width="1.2" opacity=".55"/>
    <g fill="#000" opacity=".55">
      <path d="M80 52 a20 22 0 0 1 20 22 v6 a20 22 0 0 1 -40 0 v-6 a20 22 0 0 1 20 -22 z"/>
      <path d="M80 96 c26 0 40 18 44 40 l6 74 H30 l6 -74 c4 -22 18 -40 44 -40 z"/>
    </g>
    <g fill="none" stroke="${g}" stroke-width="1.4" opacity=".8">
      <path d="M80 52 a20 22 0 0 1 20 22 v6 a20 22 0 0 1 -40 0 v-6 a20 22 0 0 1 20 -22 z"/>
      <path d="M80 96 c26 0 40 18 44 40 l6 74 M80 96 c-26 0 -40 18 -44 40 l-6 74"/>
      <path d="M58 118 v92 M102 118 v92"/>
    </g>
    <path d="M62 12 h36 M80 4 v16" stroke="${g}" stroke-width="1.2" opacity=".5"/>
  </svg>`;
}

/** The same drawing as a data URI, for anything that wants an image source. */
export function silhouetteUrl(w = PORTRAIT.w, h = PORTRAIT.h) {
  return enc(silhouetteSvg(w, h));
}

// -------------------------------------------------------------- the document

const defaultStore = () => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

/** The fields of one equipped item that change what it looks like on a body. */
const itemMark = (it) => (it
  ? `${it.base || '?'}/${it.rarity || 'common'}/${it.material || '-'}`
  : '-');

/**
 * A short string that changes whenever the picture would. Appearance first,
 * then the fourteen slots in whatever order the document holds them, sorted so
 * a re-saved document with the same gear in a different key order is still the
 * same look and does not throw the cache away.
 */
export function lookKey(look) {
  if (!look) return 'none';
  const a = { ...APPEARANCE_FALLBACK, ...(look.appearance || {}) };
  const eq = look.equipment || {};
  const worn = Object.keys(eq).sort().map((k) => `${k}=${itemMark(eq[k])}`).join(',');
  return `${look.opening || 'blank'}|${a.gender}/${a.build}/${a.skin}/${a.hairStyle}/${a.hairColour}/${a.mark}/${a.height}|${worn}`;
}

/**
 * The appearance and equipment of one saved character, read straight from the
 * document state.js wrote. READ ONLY: nothing here writes, deletes or migrates
 * a save, and an unreadable one is simply nobody rather than an error.
 *
 * @param {string} id        the slot id from a roster row
 * @param {object} [storage] a storage-like thing; localStorage when left out
 */
export function readLook(id, storage) {
  const store = storage === undefined ? defaultStore() : storage;
  if (!store || typeof id !== 'string' || !id) return null;
  let raw = null;
  try { raw = store.getItem(slotKeyFor(id, SAVE_KEY)); } catch { return null; }
  if (!raw) return null;
  let doc = null;
  try { doc = JSON.parse(raw); } catch { return null; }
  if (!doc || typeof doc !== 'object') return null;
  if (doc.needsCreation) return null;
  const app = doc.appearance;
  if (!app || typeof app !== 'object') return null;
  const equipment = doc.equipment && typeof doc.equipment === 'object' ? doc.equipment : {};
  return { opening: doc.opening || 'blank', appearance: { ...APPEARANCE_FALLBACK, ...app }, equipment };
}

// ------------------------------------------------------------------ the glass

/**
 * The one renderer, the one scene and the one set of lights every portrait is
 * drawn with. scene.js's own curve at DAWN, which is the hour creation.js asks
 * for, so a character looks on this screen the way they looked when they were
 * made rather than under a second invented lighting rig.
 */
export function makeKit(opts = {}) {
  const w = opts.w || PORTRAIT.w, h = opts.h || PORTRAIT.h;
  const dpr = Math.min(opts.dpr || (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1), PORTRAIT.maxDpr);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(PORTRAIT.fov, w / h, 0.05, 40);
  scene.add(camera);

  const L = lightingAt(DAWN);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, L.hemi.intensity);
  hemi.color.setRGB(L.hemi.sky[0], L.hemi.sky[1], L.hemi.sky[2]);
  hemi.groundColor.setRGB(L.hemi.ground[0], L.hemi.ground[1], L.hemi.ground[2]);
  const ambient = new THREE.AmbientLight(0xffffff, L.ambient.intensity);
  ambient.color.setRGB(L.ambient.color[0], L.ambient.color[1], L.ambient.color[2]);
  const sun = new THREE.DirectionalLight(0xffffff, L.sun.intensity);
  sun.color.setRGB(L.sun.color[0], L.sun.color[1], L.sun.color[2]);
  sun.position.set(2.2, 3.0, 2.6);
  const fill = new THREE.DirectionalLight(0xffffff, L.fill.intensity);
  fill.color.setRGB(L.fill.color[0], L.fill.color[1], L.fill.color[2]);
  fill.position.set(-2.4, 1.4, -1.8);
  renderer.toneMappingExposure = L.exposure;
  scene.add(hemi, ambient, sun, fill);

  return { renderer, scene, camera, lights: { hemi, ambient, sun, fill }, w, h, dpr };
}

/**
 * One character, drawn. The body is built, dressed, settled into the idle the
 * game itself poses it with, framed, rendered and taken apart again: a portrait
 * costs one rig, not a rig that lives on the heap for the session.
 */
export async function paint(kit, look) {
  const appearance = { ...APPEARANCE_FALLBACK, ...(look?.appearance || {}) };
  const rig = buildCharacter(appearance, { classId: look?.opening || 'blank' });
  try {

    if (look?.equipment) {
      try { dressRig(rig, look.equipment, { light: false }); } catch (e) { console.warn('[roster] the portrait could not be dressed', e); }
    }
    await rig.ready;
    if(kit.disposed)return null;
    // The rig's own update is the pose: six tenths of a second of standing
    // still settles the grip blend on whatever the hands were given, then the
    // clock is put back to zero so the breath is at the same point in every
    // portrait and two renders of one character are the same picture.
    for (let i = 0; i < 6; i++) rig.update(0.1, 0);
    rig.state.t = 0;
    rig.update(0, 0);

    const f = frameFor(appearance.height);
    kit.camera.fov = f.fov;
    kit.camera.aspect = kit.w / kit.h;
    kit.camera.position.set(f.pos.x, f.pos.y, f.pos.z);
    kit.camera.lookAt(f.look.x, f.look.y, f.look.z);
    kit.camera.updateProjectionMatrix();

    kit.scene.add(rig.group);
    kit.renderer.render(kit.scene, kit.camera);
    return kit.renderer.domElement.toDataURL('image/png');
  } finally {
    kit.scene.remove(rig.group);
    try { undress(rig); } catch { /* a rig that was never dressed has nothing to take off */ }
    rig.dispose();
  }
}

// ------------------------------------------------------------------ the cache

/**
 * The portrait maker the roster holds for as long as it is on screen.
 *
 * `render` is the seam a node test drives: everything above it (which look a
 * row has, what its signature is, what is cached and what is thrown away) is
 * the real code either way, and only the call that needs a GPU is replaced.
 *
 * @param {{ storage?: object, render?: function, dpr?: number }} [opts]
 */
export function createPortraits(opts = {}) {
  const storage = opts.storage;
  const cache = new Map();          // slot id -> { key, url }
  let hits = 0, misses = 0, drawn = 0;
  let kit = null, noGlass = false, dead = false;

  const custom = typeof opts.render === 'function' ? opts.render : null;

  function kitOf() {
    if (kit || noGlass) return kit;
    try {
      kit = makeKit({ dpr: opts.dpr });
    } catch (e) {
      noGlass = true;
      console.warn('[roster] no portraits on this browser, the silhouette stands in', e);
    }
    return kit;
  }

  function draw(look) {
    if (custom) return custom(look);
    const k = kitOf();
    if (!k) return null;
    return paint(k, look);
  }

  /**
   * The picture for one roster row, or null when there is none to make and the
   * row should draw the silhouette. Null is cached too, so a slot whose
   * document cannot be read is not re-read on every redraw of the list.
   */
  function of(row) {
    const id = row?.id;
    if (!id || dead) return null;
    const look = row.look || (row.needsCreation ? null : readLook(id, storage));
    const key = look ? lookKey(look) : 'none';
    const had = cache.get(id);
    if (had && had.key === key) { hits++; return had.url; }
    misses++;
    let url = null;
    if (look) {
      try { url = draw(look); drawn++; } catch (e) { console.warn('[roster] a portrait would not draw', e); url = null; }
    }
    const entry = { key, url: null }; cache.set(id, entry);
    if (url?.then) {
      url.then(result => { if (!dead && cache.get(id) === entry) { entry.url = result; opts.onReady?.(id, result); } }).catch(error => console.warn('[roster] portrait failed', error));
      return null;
    }
    entry.url = url; return url;
  }

  /** Throw one slot's picture away. The delete path calls this. */
  function forget(id) { return cache.delete(id); }

  /** Everything goes when the screen goes: the cache and the glass with it. */
  function dispose() {
    if (dead) return;
    dead = true;
    cache.clear();
    if (kit) {
      kit.disposed = true;
      try { kit.renderer.dispose(); } catch { /* a lost context is already gone */ }
      try { kit.renderer.forceContextLoss?.(); } catch { /* not every build has it */ }
      kit = null;
    }
  }

  return {
    of, forget, dispose,
    get hits() { return hits; },
    get misses() { return misses; },
    get drawn() { return drawn; },
    get size() { return cache.size; },
    get gone() { return dead; },
    /** False once the browser has refused us a context. Undefined until asked. */
    get webgl() { return noGlass ? false : (kit ? true : undefined); },
    has: (id) => cache.has(id),
  };
}

export default createPortraits;
