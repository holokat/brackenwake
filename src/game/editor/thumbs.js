// The pictures on the editor's tiles: one small render of the thing itself.
//
// The user's words were "can you add small model previews for categories in
// left sidebar so i dont have to read everything". A tray of 159 squares that
// differ only in an eight and a half pixel word is a list to be read, not a
// palette to be picked from, and the Objects tray is exactly that: a hundred
// and four rocks and fifty five props, every one of them wearing the same
// drawn rock or the same drawn crate.
//
// So every tile that stands for a body in the world gets a render of that
// body. NOTHING HERE BUILDS A SECOND VERSION OF ANYTHING. The structure is
// `plan_models.pieceBody`, the tree is `plan_models.speciesProto`, which is
// arbor's own prototype, the rock is `rockGeometry` with `rockMaterialFor`,
// the monster is `monster_models.buildMonsterModel`, the person is
// `player.buildCharacter` wearing `npcs_runtime.ROLE_TINT`, and the marker is
// `plan_models.markerBody`. If the game changes what a thing looks like, the
// tile changes with it, because it is the same call.
//
// The glass is `roster_preview.makeKit`: one WebGLRenderer, one scene and the
// same four lights at DAWN that the roster portraits are lit by, at 112 by 112
// so a 56 px tile has two pixels for one.
//
//   thumbFor(row)   -> Promise<dataUrl | null>
//   thumbInfo(row)  -> Promise<{ url, metres, caption } | null>
//   sizeCaption(row)-> '1 by 1.4 m', from the body that was measured
//
// FOUR THINGS THAT ARE NOT OBVIOUS
//
//   THE FRAME IS THE BOUNDING BOX, NOT THE METRES. A barrel and a manor both
//   fill the tile, because a picture of a manor drawn to scale beside a barrel
//   is a picture of nothing at all. The scale that is lost that way is given
//   back in words: the caption under the name is the body's measured size.
//
//   THE MARKER POST IS BORN INVISIBLE. `markerBody` sets `visible` from
//   `markersAreVisible()`, which is false until the editor turns it on, so a
//   marker rendered straight out of the builder is a transparent square. The
//   body is turned on for the render.
//
//   AN INVISIBLE MESH IS STILL IN THE BOX. Every monster carries a hit column
//   with an invisible material, 15% wider and 10% taller than the body, and
//   `Box3.setFromObject` does not care that it cannot be seen. It is taken out
//   before the body is measured, or every monster would sit small in its tile
//   with a collar of air over its head.
//
//   ONLY DISPOSE WHAT THIS FILE MADE. A tree prototype, a rock geometry and a
//   loaded glb are SHARED with the running world: freeing one here would take
//   the forest, the boulders or the cottage off the screen. So a body says
//   what it owns, and `dispose` frees that and nothing else.

import * as THREE from 'three';
import {
  pieceBody, speciesProto, rockGeometry, rockMaterialFor, ROCK_KINDS,
  markerBody, setMarkersVisible, markersAreVisible, PROP_DIR,
} from '../../world/plan_models.js';
import { buildMonsterModel } from '../monster_models.js';
import { buildCharacter, PALETTE } from '../player.js';
import { ROLE_TINT } from '../npcs_runtime.js';
import { PALETTES } from '../../world/town_layout.js';
import { makeKit } from '../roster_preview.js';

/**
 * The picture, and the lens that takes it.
 *
 * `size` is twice `px` because the tray's tile is 56 px and a screen with two
 * device pixels for one CSS pixel would otherwise show a soft render next to a
 * crisp glyph. `fill` under 1 leaves air round the body so a wide thing is not
 * touching both walls of its square.
 */
export const THUMB = Object.freeze({
  px: 56,
  size: 112,
  fov: 30,          // degrees, vertical
  fill: 0.88,       // of the frame the body's widest projection takes
  yawDeg: 35,       // three quarters round from the front
  pitchDeg: 26,     // and up, so the eye is above the thing looking down on it
});

/**
 * Bumped by hand when a render would come out different: a new lens, a new
 * light, a different size. Everything written under an older version is thrown
 * away the moment the maker is built, before a single stale picture is shown.
 */
export const THUMB_VERSION = 'v1';

/** Where the pictures are kept between visits, and where the stamp lives. */
export const CACHE_PREFIX = 'bw.ed.thumb.';
export const STAMP_KEY = 'bw.ed.thumb.stamp';
/** The props manifest, which is the other thing that makes a picture stale. */
export const MANIFEST_URL = PROP_DIR + 'manifest.json';

/** How many pictures one frame may draw, and how long it may spend drawing. */
export const BUDGET = 2;
export const FRAME_MS = 9;
/** How much of the browser's store the pictures may take before they stop. */
export const STORE_BUDGET = 1_500_000;

/** The trays whose tiles stand for a body. Terrain's do not, and never will. */
export const THUMB_TABS = Object.freeze(['structures', 'trees', 'rocks', 'monsters', 'creatures', 'people', 'markers']);

/**
 * Whether this tile is one a picture could be made for.
 *
 * A ground word is a colour and keeps its swatch; a brush is a verb and keeps
 * its glyph. Both are answered false here rather than being built and thrown
 * away, so opening Paint costs nothing at all.
 */
export function canThumb(row) {
  if (!row || typeof row.id !== 'string' || !row.id) return false;
  if (row.colour) return false;
  if (row.what && row.what !== 'entry') return false;
  return THUMB_TABS.includes(row.tab);
}

/**
 * What one row's picture is filed under.
 *
 * `real` is in the key because a structure with no glb yet is drawn as its
 * stand-in, and the day the glb lands the same id has to make a NEW picture
 * rather than showing the boxes for the rest of the session.
 */
export function keyOf(row) {
  return `${row.tab}:${row.id}:${row.real === false ? 'standin' : 'real'}`;
}

// ------------------------------------------------------------------- bodies

/**
 * The two materials a boulder is drawn with, off the same table `plan_models`
 * builds its own from. `rockMaterialFor` asks for 'stone' or 'metal' and
 * nothing else; a dressing body never asks at all, because it carries its
 * colours in its vertices.
 */
const rockMats = new Map();
function realmColour(name) {
  let m = rockMats.get(name);
  if (m) return m;
  const p = PALETTES.greenwold;
  const metal = name === 'metal';
  m = new THREE.MeshStandardMaterial({
    color: p[name] ?? p.stone,
    roughness: metal ? 0.45 : 0.92,
    metalness: metal ? 0.4 : 0,
    flatShading: true,
  });
  rockMats.set(name, m);
  return m;
}

/** Every mesh whose material was made invisible on purpose, taken out. */
function stripInvisible(group) {
  const doomed = [];
  group.traverse((o) => {
    if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.visible === false) doomed.push(o);
  });
  for (const o of doomed) o.parent?.remove(o);
  return doomed.length;
}

/** The materials of one rig, cloned so a tint cannot reach the shared set. */
function tintTunic(rig, hex) {
  const seen = new Map();
  const mine = [];
  rig.group.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    let clone = seen.get(o.material);
    if (!clone) {
      clone = o.material.clone ? o.material.clone() : o.material;
      if (clone !== o.material) mine.push(clone);
      if (clone.color?.getHex?.() === PALETTE.tunic) clone.color.setHex(hex);
      seen.set(o.material, clone);
    }
    o.material = clone;
  });
  return mine;
}

const wrap = (geo, mat) => { const g = new THREE.Group(); g.add(new THREE.Mesh(geo, mat)); return g; };

/**
 * The body one tile stands for, built the way the game builds it, standing on
 * y = 0 and facing +z, with a `dispose` that frees what this call made and
 * leaves alone everything it borrowed.
 *
 * Null is a real answer and not a failure: a structure with neither a glb nor
 * a stand-in, a critter with no monster row, a species arbor will not grow.
 * The tile keeps its glyph and nothing is logged, because there is nothing
 * wrong.
 *
 * @param {object} row a tray tile, or a palette row carrying `tab` and `id`
 * @returns {{ group: object, source: string, dispose: function } | null}
 */
export function bodyFor(row) {
  if (!canThumb(row)) return null;
  const id = row.id;
  try {
    switch (row.tab) {
      case 'structures': {
        const b = pieceBody(id, 1);
        if (!b) return null;
        // A glb piece is a CLONE of the loaded model and shares its geometry
        // and its materials with every cottage in the world. Freeing them here
        // would empty the village.
        const own = b.source === 'stand-in';
        return {
          group: b.group,
          source: b.source,
          dispose() { if (own) b.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); },
        };
      }
      case 'trees': {
        const p = speciesProto(id);
        if (!p) return null;
        const g = new THREE.Group();
        g.add(new THREE.Mesh(p.bark, p.barkMat));
        if (p.hasLeaves) g.add(new THREE.Mesh(p.leaf, p.leafMat));
        // The prototype is cached in plan_models and every tree in the forest
        // is an instance of it. Only the two wrappers are ours.
        return { group: g, source: 'arbor', dispose() { g.clear(); } };
      }
      case 'rocks': {
        const spec = ROCK_KINDS[id];
        const geo = rockGeometry(id);
        if (!spec || !geo) return null;
        const mat = rockMaterialFor(id, realmColour);
        if (!mat) return null;
        const g = wrap(geo, mat);
        return { group: g, source: spec.boulder ? 'boulder' : spec.build, dispose() { g.clear(); } };
      }
      case 'monsters':
      case 'creatures': {
        const m = buildMonsterModel(id);
        if (!m) return null;
        stripInvisible(m.group);
        // A family with a Blender rig stands its box up FIRST and swaps the glb
        // in when the file lands. Seven of them do. A picture taken in that gap
        // is a picture of the stand-in, so it is marked provisional: it is
        // shown, it is never written to the store, and it is forgotten the
        // moment the real model arrives so the next look at the tray draws the
        // monster the world is actually walking about with.
        const waiting2 = m.loaded === false && !!m.ready;
        return {
          group: m.group,
          source: waiting2 ? 'stand-in' : (m.modelId ? 'glb' : 'built'),
          provisional: waiting2,
          ready: waiting2 ? m.ready : null,
          // The model cache hands out instances and takes them back all day as
          // monsters spawn and die; this is that same call.
          dispose() { try { m.dispose?.(); } catch { /* an instance already gone */ } },
        };
      }
      case 'people': {
        const rig = buildCharacter();
        const mats = tintTunic(rig, ROLE_TINT[id] ?? PALETTE.tunic);
        // Six tenths of a second of standing still, then the clock back to
        // zero, exactly as the roster portrait settles a body, so two renders
        // of one role are the same picture.
        try { for (let i = 0; i < 6; i++) rig.update(0.1, 0); rig.state.t = 0; rig.update(0, 0); } catch { /* a rig with no update is already still */ }
        return {
          group: rig.group,
          source: 'rig',
          dispose() { for (const m of mats) m.dispose(); rig.dispose(); },
        };
      }
      case 'markers': {
        const was = markersAreVisible();
        // markerBody is born with the world's own visibility, which is false
        // until the editor turns the posts on. A picture of an invisible post
        // is an empty square, so it is turned on for the length of the build.
        if (!was) setMarkersVisible(true);
        let g = null;
        try { g = markerBody({ kind: id, label: id, note: '' }, realmColour); } finally { if (!was) setMarkersVisible(false); }
        if (!g) return null;
        g.visible = true;
        g.traverse((o) => { o.visible = true; });
        return {
          group: g,
          source: 'marker',
          dispose() { g.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); },
        };
      }
      default: return null;
    }
  } catch (e) {
    console.warn(`[editor] no picture for ${row.tab} ${id}`, e);
    return null;
  }
}

// -------------------------------------------------------------------- sizes

/** The body's own size in metres, measured off what was built. */
export function metresOf(group) {
  const box = new THREE.Box3().setFromObject(group);
  if (!Number.isFinite(box.min.x) || box.isEmpty()) return null;
  const s = box.getSize(new THREE.Vector3());
  return { w: s.x, d: s.z, h: s.y, box };
}

const round = (v) => (v >= 10 ? String(Math.round(v)) : v >= 1 ? String(Math.round(v * 10) / 10) : String(Math.round(v * 100) / 100));

/**
 * The words under the name: how big the thing really is.
 *
 * The frame throws the scale away on purpose, so this is the only place a
 * player learns that the crate is a metre and the manor is fourteen. It is the
 * MEASURED box of the body that was rendered, in the same "by" the structures
 * hint has always used, and it is empty until the body has been built.
 */
export function captionOf(metres) {
  if (!metres) return '';
  const span = Math.max(metres.w, metres.d);
  if (!(span > 0) || !(metres.h > 0)) return '';
  return `${round(span)} by ${round(metres.h)} m`;
}

// -------------------------------------------------------------------- lens

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Where to stand to see the whole of this box and no more.
 *
 * Pure arithmetic over the eight corners, so the framing is measured in node
 * with no graphics context anywhere near it. The lens is turned `yawDeg` round
 * and `pitchDeg` up, and pushed back until the corner that reaches furthest
 * across the frame lands exactly on `fill` of it. A one metre barrel and a
 * fourteen metre manor therefore come out the same size in the tile, which is
 * the whole point: the tray is picked from at a glance, and the metres are
 * said in words underneath.
 */
export function frameBox(box, opts = {}) {
  const fov = Number.isFinite(opts.fov) ? opts.fov : THUMB.fov;
  const fill = Number.isFinite(opts.fill) ? opts.fill : THUMB.fill;
  const yawDeg = Number.isFinite(opts.yawDeg) ? opts.yawDeg : THUMB.yawDeg;
  const pitchDeg = Number.isFinite(opts.pitchDeg) ? opts.pitchDeg : THUMB.pitchDeg;
  const aspect = Number.isFinite(opts.aspect) ? opts.aspect : 1;

  const centre = box.getCenter(V(0, 0, 0));
  const yaw = (yawDeg * Math.PI) / 180, pitch = (pitchDeg * Math.PI) / 180;
  // the unit vector from the middle of the body out to the eye
  const off = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
  const fwd = off.clone().multiplyScalar(-1);
  const right = new THREE.Vector3().crossVectors(fwd, V(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();

  const tanY = Math.tan((fov * Math.PI) / 360) * fill;
  const tanX = tanY * aspect;

  let dist = 0, radius = 0;
  const c = V(0, 0, 0), v = V(0, 0, 0);
  for (let i = 0; i < 8; i++) {
    c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    v.subVectors(c, centre);
    radius = Math.max(radius, v.length());
    const depth = v.dot(fwd);            // + is behind the middle, further from the eye
    const need = Math.max(Math.abs(v.dot(right)) / tanX, Math.abs(v.dot(up)) / tanY) - depth;
    if (need > dist) dist = need;
  }
  dist = Math.max(dist, radius * 0.001, 1e-4);

  return {
    fov, fill, aspect, dist, radius,
    centre: { x: centre.x, y: centre.y, z: centre.z },
    pos: { x: centre.x + off.x * dist, y: centre.y + off.y * dist, z: centre.z + off.z * dist },
    look: { x: centre.x, y: centre.y, z: centre.z },
    near: Math.max(0.01, dist - radius * 1.5),
    far: dist + radius * 3 + 1,
    axes: { off: [off.x, off.y, off.z], right: [right.x, right.y, right.z], up: [up.x, up.y, up.z] },
    tanX, tanY,
  };
}

/**
 * One body, drawn. Framed, rendered and taken apart again: a picture costs one
 * body, not a body that lives on the heap for the session.
 */
export function paintThumb(kit, body) {
  const metres = metresOf(body.group);
  if (!metres) return { url: null, metres: null };
  const f = frameBox(metres.box, { aspect: kit.w / kit.h });
  kit.camera.fov = f.fov;
  kit.camera.aspect = f.aspect;
  kit.camera.near = f.near;
  kit.camera.far = f.far;
  kit.camera.position.set(f.pos.x, f.pos.y, f.pos.z);
  kit.camera.lookAt(f.look.x, f.look.y, f.look.z);
  kit.camera.updateProjectionMatrix();
  kit.scene.add(body.group);
  try {
    kit.renderer.render(kit.scene, kit.camera);
    return { url: kit.renderer.domElement.toDataURL('image/png'), metres };
  } finally {
    kit.scene.remove(body.group);
  }
}

// ------------------------------------------------------------------- the store

const defaultStore = () => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

/** Every key this file owns, listed off the store itself. */
function ourKeys(store) {
  const out = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (typeof k === 'string' && k.startsWith(CACHE_PREFIX) && k !== STAMP_KEY) out.push(k);
    }
  } catch { /* a store that will not be walked keeps its keys */ }
  return out;
}

// --------------------------------------------------------------- the maker

/**
 * The thumbnail maker the editor holds while it is open.
 *
 * `render` is the seam a node test drives: everything above it (which body a
 * row is, how big it is, what it is filed under, what is cached, what is
 * thrown away and how many are drawn in a frame) is the real code either way,
 * and only the call that needs a graphics context is replaced.
 *
 * @param {object}   [opts.storage]  a storage-like thing; localStorage by default
 * @param {function} [opts.render]   (body, row) -> { url, metres }
 * @param {number}   [opts.budget]   pictures per frame
 * @param {number}   [opts.frameMs]  and milliseconds per frame
 * @param {function} [opts.raf]      the frame scheduler; the window's by default
 * @param {function} [opts.fetch]    for the manifest check; the window's by default
 */
export function createThumbs(opts = {}) {
  const storage = opts.storage === undefined ? defaultStore() : opts.storage;
  const budget = Number.isFinite(opts.budget) ? Math.max(1, opts.budget) : BUDGET;
  const frameMs = Number.isFinite(opts.frameMs) ? opts.frameMs : FRAME_MS;
  const raf = typeof opts.raf === 'function' ? opts.raf
    : (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
  const clock = typeof opts.now === 'function' ? opts.now
    : (typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now());
  const custom = typeof opts.render === 'function' ? opts.render : null;

  const cache = new Map();          // key -> { url, metres, caption }
  const queue = [];                 // [{ key, row, waiting: [fn] }]
  const waiting = new Map();        // key -> the queued job
  let hits = 0, misses = 0, drawn = 0, frames = 0, spilled = 0, provisional = 0;
  let bytes = 0, persist = !!storage, dead = false, scheduled = false;
  let kit = null, noGlass = false;

  // ---- the version, thrown before anything stale is shown -----------------
  let stamp = `${THUMB_VERSION}|?`;
  if (storage) {
    let had = null;
    try { had = storage.getItem(STAMP_KEY); } catch { persist = false; }
    if (!had || !String(had).startsWith(`${THUMB_VERSION}|`)) dropStore();
    else stamp = String(had);
  }

  function dropStore() {
    if (!storage) return 0;
    const keys = ourKeys(storage);
    for (const k of keys) { try { storage.removeItem(k); } catch { /* nothing to take back */ } }
    try { storage.setItem(STAMP_KEY, stamp); } catch { persist = false; }
    bytes = 0;
    return keys.length;
  }

  /**
   * The other thing that makes a picture stale: the props manifest.
   *
   * A model added to `public/models/props` turns a boxy stand-in into a real
   * building, and the picture on the tile has to change with it. The manifest
   * is small, already served and already cached by the browser, so it is asked
   * for once in the background; nothing waits on the answer, and a mismatch
   * throws the store and starts the tray again from live renders.
   */
  async function checkManifest(fetchFn) {
    const f = typeof fetchFn === 'function' ? fetchFn
      : (typeof opts.fetch === 'function' ? opts.fetch : (typeof fetch === 'function' ? fetch : null));
    if (!f || dead) return null;
    let ids = null, revision='';
    try {
      const res = await f(MANIFEST_URL);
      const doc = await res.json();
      ids = Array.isArray(doc?.ids) ? doc.ids.slice().sort() : null;
      revision=doc?.revision||'';
    } catch { return null; }
    if (!ids || dead) return null;
    const want = `${THUMB_VERSION}|${ids.join(',')}${revision?'|'+revision:''}`;
    if (want === stamp) return { stamp, dropped: 0 };
    const before = stamp;
    stamp = want;
    const dropped = dropStore();
    cache.clear();
    return { stamp, was: before, dropped };
  }

  function kitOf() {
    if (kit || noGlass) return kit;
    try {
      kit = makeKit({ w: THUMB.size, h: THUMB.size, dpr: 1 });
    } catch (e) {
      noGlass = true;
      console.warn('[editor] no tile pictures on this browser, the glyphs stand', e);
    }
    return kit;
  }

  function readStore(key) {
    if (!storage) return null;
    let raw = null;
    try { raw = storage.getItem(CACHE_PREFIX + key); } catch { return null; }
    if (!raw) return null;
    try {
      const doc = JSON.parse(raw);
      if (!doc || typeof doc.u !== 'string') return null;
      const m = Array.isArray(doc.m) ? { w: doc.m[0], d: doc.m[1], h: doc.m[2] } : null;
      return { url: doc.u, metres: m, caption: captionOf(m) };
    } catch { return null; }
  }

  function writeStore(key, rec) {
    if (!persist || !storage || !rec.url) return false;
    const doc = JSON.stringify({ u: rec.url, m: rec.metres ? [rec.metres.w, rec.metres.d, rec.metres.h] : null });
    if (bytes + doc.length > STORE_BUDGET) { spilled++; return false; }
    try { storage.setItem(CACHE_PREFIX + key, doc); bytes += doc.length; return true; } catch {
      // A full store is not an error worth a red line: the pictures go on being
      // made, they are just made again next time.
      persist = false; spilled++; return false;
    }
  }

  /** The one call that needs a graphics context, and everything around it. */
  function draw(row) {
    const body = bodyFor(row);
    if (!body) return { rec: { url: null, metres: null, caption: '' }, ready: null };
    const done = (url, metres) => ({
      rec: { url: url ?? null, metres: metres ?? null, caption: captionOf(metres), provisional: !!body.provisional },
      ready: body.ready || null,
    });
    try {
      if (custom) {
        const out = custom(body, row) || {};
        return done(out.url, out.metres === undefined ? metresOf(body.group) : out.metres);
      }
      const k = kitOf();
      if (!k) return done(null, metresOf(body.group));
      const out = paintThumb(k, body);
      return done(out.url, out.metres);
    } finally {
      try { body.dispose(); } catch (e) { console.warn('[editor] a preview body would not come apart', e); }
    }
  }

  /** Draw one queued row now, tell everyone waiting, and file it. */
  function serve(job) {
    let rec = null, ready = null;
    try { ({ rec, ready } = draw(job.row)); } catch (e) {
      console.warn(`[editor] the picture for ${job.key} would not draw`, e);
      rec = { url: null, metres: null, caption: '' };
    }
    drawn++;
    cache.set(job.key, rec);
    if (rec.provisional) {
      provisional++;
      // Not written to the store, and dropped from this session's cache as
      // soon as the model it was standing in for arrives.
      ready?.then(() => { if (!dead) cache.delete(job.key); }).catch(() => { /* a model that never lands keeps its stand-in */ });
    } else {
      writeStore(job.key, rec);
    }
    waiting.delete(job.key);
    for (const fn of job.waiting) { try { fn(rec); } catch (e) { console.warn('[editor] a tile would not take its picture', e); } }
  }

  /**
   * One frame's worth of drawing: at most `budget` pictures, and at most
   * `frameMs` milliseconds, so opening the Objects tray with 159 rows in it
   * does not stall the editor while a hundred and fifty nine bodies are built.
   */
  function tick() {
    frames++;
    const started = clock();
    let did = 0;
    while (queue.length && did < budget) {
      serve(queue.shift());
      did++;
      if (clock() - started >= frameMs) break;
    }
    scheduled = false;
    if (queue.length) schedule();
    return did;
  }

  function schedule() {
    if (scheduled || dead || !queue.length || !raf) return;
    scheduled = true;
    raf(() => { scheduled = false; if (!dead) tick(); });
  }

  /**
   * Ask for one tile's picture. The answer comes back through `then` whether it
   * was already in hand, already on the disk or has to be drawn, and the tile
   * keeps its glyph until it lands.
   */
  function info(row) {
    if (!canThumb(row) || dead) return Promise.resolve(null);
    const key = keyOf(row);
    const had = cache.get(key);
    if (had) { hits++; return Promise.resolve(had); }
    const kept = readStore(key);
    if (kept) { hits++; cache.set(key, kept); return Promise.resolve(kept); }
    misses++;
    const job = waiting.get(key);
    if (job) return new Promise((res) => job.waiting.push(res));
    const made = { key, row, waiting: [] };
    waiting.set(key, made);
    queue.push(made);
    schedule();
    return new Promise((res) => made.waiting.push(res));
  }

  const url = (row) => info(row).then((r) => (r ? r.url : null));

  /** The caption for a row whose body has been measured, or '' before that. */
  function caption(row) {
    if (!canThumb(row)) return '';
    const had = cache.get(keyOf(row));
    return had ? had.caption : '';
  }

  function dispose() {
    if (dead) return;
    dead = true;
    queue.length = 0;
    waiting.clear();
    cache.clear();
    if (kit) {
      try { kit.renderer.dispose(); } catch { /* a lost context is already gone */ }
      try { kit.renderer.forceContextLoss?.(); } catch { /* not every build has it */ }
      kit = null;
    }
  }

  return {
    info, url, caption, tick, dispose, checkManifest, dropStore,
    has: (row) => canThumb(row) && cache.has(keyOf(row)),
    get pending() { return queue.length; },
    get hits() { return hits; },
    get misses() { return misses; },
    get drawn() { return drawn; },
    get frames() { return frames; },
    get spilled() { return spilled; },
    get provisional() { return provisional; },
    get bytes() { return bytes; },
    get stamp() { return stamp; },
    get persists() { return persist; },
    get size() { return cache.size; },
    get gone() { return dead; },
    get webgl() { return noGlass ? false : (kit ? true : undefined); },
  };
}

// ------------------------------------------------------- the editor's own one

let shared = null;

/** The maker the panel uses, made on the first tile that asks for a picture. */
export function thumbs() {
  if (!shared || shared.gone) {
    shared = createThumbs();
    // Nothing waits on this: the tray draws from whatever is already stored,
    // and if the models have changed underneath it the store goes and the
    // pictures are made again.
    shared.checkManifest();
  }
  return shared;
}

/** One tile's picture, the whole record. */
export const thumbInfo = (row) => thumbs().info(row);
/** One tile's picture. Null when the row is not a body, or cannot be drawn. */
export const thumbFor = (row) => thumbs().url(row);
/** The size under the name, once the body behind it has been measured. */
export const sizeCaption = (row) => thumbs().caption(row);
/**
 * Let go of the glass and the pictures.
 *
 * NOBODY CALLS THIS IN THE RUNNING GAME, on purpose. The maker holds one 112 px
 * context and the pictures already drawn, and the editor is opened and closed
 * with a key all afternoon: throwing the lot away every time L is pressed would
 * mean drawing 159 rocks again on the way back in. It is here for a teardown
 * that wants the context back, and the test drives it.
 */
export function disposeThumbs() { if (shared) { shared.dispose(); shared = null; } }

export default thumbFor;
