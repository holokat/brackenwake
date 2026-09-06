// The editor, with no DOM anywhere.
//
// `createEditor(ctx)` is every action the panel can take, exactly the way
// `win_dev.createBench(ctx)` is every action the dev bench can take, and for
// the same reason: the thing the tests drive has to be the thing the buttons
// press. The panel below it (panel.js) is buttons, a canvas listener and a
// ghost, and it calls this and nothing else.
//
// WHAT IT EDITS. One space at a time, out of `src/mmo/spaces/`. Everything
// placed goes into that space, the space's group is rebuilt through the SAME
// `buildPlan` the world builds it with, and saving writes the file the game
// loads. There is no preview mode and no editor-only renderer: what stands on
// the ground while you edit is what `site_models.buildSiteMarker` will put
// there when the chunk streams in.
//
// WHAT IT SAYS. Every placement, move, turn, scale, delete, undo, redo and save
// prints a line, in the editor's own status and in the HUD log. A silent real
// effect is indistinguishable from a broken button.
//
// THE TERRAIN IS SOMEBODY ELSE'S. `window.__bw.terrain` is the contract: this
// file calls `stroke`, `undo`, `redo` and `save` on it if they are there, and
// says "the terrain tools are not in yet" if they are not. It never touches
// the height field itself and never writes a terrain file.

import { buildPlan, setMarkersVisible } from '../../world/plan_models.js';
import { SPACES, emptySpace } from '../../mmo/spaces/index.js';
import { auditSpaces } from '../../mmo/plans/plan_schema.js';
import { spaceSiteRow } from '../../world/sites.js';
import { createSpaceDoc, LISTS, LIST_WORD, TURN_DEG, SCALE_STEP, labelOf, pointOf } from './space_doc.js';
import { paletteFor, entryFor, search, TAB_IDS, BRUSH_IDS } from './palette.js';

/** Where a space file lives, and where the terrain half writes its own. */
export const SPACE_PATH = (id) => `src/mmo/spaces/${id}.json`;
/** The endpoints the dev server answers. tools/editor_save.mjs is the other end. */
export const SAVE_URL = '/__editor/save';
export const LIST_URL = '/__editor/list';
/** How wide a new space is, in metres, until it is changed. */
export const NEW_RADIUS = 60;
/** How many lines of status the editor keeps. */
export const STATUS_MAX = 60;
/** The default brush, in metres and in metres of lift. */
export const BRUSH_R = 8;
export const BRUSH_AMOUNT = 1;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const round2 = (v) => Math.round(num(v) * 100) / 100;
const idFrom = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);

/**
 * The context is the panel context every window gets: `sc`, `runtime`, `hud`,
 * `dev`, `camera`, `player`. Anything missing is said out loud rather than
 * silently skipped.
 */
export function createEditor(ctx = {}) {
  const status = [];
  let doc = null;
  let disk = [];              // what /__editor/list last answered
  let tab = 'structures';
  let query = '';
  let pick = null;            // the palette id armed
  let ghostYaw = 0;
  let ghostScale = 1;
  let night = false;
  let personName = '';
  let markerLabel = '';
  let markerNote = '';
  let markerKind = 'structure';
  let brush = 'raise';
  let brushR = BRUSH_R;
  let brushAmount = BRUSH_AMOUNT;
  let group = null;           // the group standing in the scene for the open space
  let dirty = false;

  const hud = () => ctx.hud || null;
  const scene = () => (ctx.sc && ctx.sc.scene) || null;
  const heightAt = (x, z) => (typeof ctx.runtime?.heightAt === 'function' ? num(ctx.runtime.heightAt(x, z)) : 0);
  /**
   * Where "here" is. In dev mode the camera flies and the player is parked
   * where it was left, so the camera wins: a new space made at the top of a
   * hill you have flown to should be on that hill, not back in Hearthhome.
   */
  const here = () => {
    const cam = ctx.sc && ctx.sc.camera && ctx.sc.camera.position;
    if (ctx.dev && ctx.dev.on && cam) return { x: num(cam.x), z: num(cam.z) };
    return (ctx.player && ctx.player.pos) || (cam ? { x: num(cam.x), z: num(cam.z) } : { x: 0, z: 0 });
  };

  /** One line, into the editor's own status and into the HUD log. */
  function say(text, kind) {
    if (!text) return text;
    status.unshift({ text, kind: kind || null, at: Date.now() });
    status.length = Math.min(status.length, STATUS_MAX);
    const h = hud();
    if (h && typeof h.log === 'function') h.log(text, kind);
    else if (h && typeof h.toast === 'function') h.toast(text, kind);
    return text;
  }
  const bad = (text) => ({ ok: false, text: say(text, 'bad') });
  const good = (text, extra = {}) => ({ ok: true, text: say(text), ...extra });

  // ----------------------------------------------------------- the space --

  /** The site row the space stands on. The same row `sites.js` hands the world. */
  function siteOf(space) {
    const row = spaceSiteRow(space, { heightAt: (x, z) => heightAt(x, z) });
    return { ...row, realm: ctx.runtime?.field?.realmAt?.(row.x, row.z) || row.realm || 'greenwold' };
  }

  /**
   * Take down whatever is standing for this space and build it again.
   *
   * It sweeps the scene for anything the space built, not just for its own last
   * group, because the site marker streamer may already have built the space
   * from the file on disk and two copies of a village in one place is the kind
   * of thing that looks like a rendering bug for a week.
   */
  function rebuild() {
    const sc = scene();
    if (!doc || !sc) return null;
    const space = doc.space;
    for (const child of [...sc.children]) {
      if (child.userData && child.userData.plan && child.userData.plan.id === space.id) sc.remove(child);
    }
    const g = buildPlan(space, siteOf(space), (x, z) => heightAt(x, z));
    if (g) { sc.add(g); group = g; } else group = null;
    return group;
  }

  /** Open a space for editing: the one in SPACES, or one handed straight in. */
  function open(space) {
    const s = typeof space === 'string' ? SPACES[space] : space;
    if (!s) return bad(`there is no space called "${space}".`);
    doc = createSpaceDoc(JSON.parse(JSON.stringify(s)));
    dirty = false;
    setMarkersVisible(true, scene());
    rebuild();
    const c = doc.count();
    return good(`${doc.space.name} is open at ${Math.round(doc.space.at.x)}, ${Math.round(doc.space.at.z)}, ${doc.space.radius} m across, holding ${c.total} ${c.total === 1 ? 'thing' : 'things'}.`, { space: doc.space });
  }

  /**
   * A new space where the camera is looking, or where the player stands.
   *
   * It is NOT saved yet: nothing is written to disk until Save, so a space
   * begun by accident costs nothing.
   */
  function newSpace(name, radius = NEW_RADIUS, at = null) {
    const label = String(name || '').trim();
    if (!label) return bad('a space needs a name before it can be made.');
    const id = idFrom(label);
    if (!id) return bad(`"${label}" has no letters or digits in it, so it cannot be a file name.`);
    if (SPACES[id]) return bad(`there is already a space called "${id}". Open it, or give this one another name.`);
    const p = at || lookPoint() || here();
    const r = Math.max(8, num(radius) || NEW_RADIUS);
    doc = createSpaceDoc(emptySpace(id, label, p.x, p.z, r));
    dirty = true;
    setMarkersVisible(true, scene());
    rebuild();
    return good(`${label} begins at ${Math.round(p.x)}, ${Math.round(p.z)}, ${r} m across. Nothing is on disk until you save it.`, { space: doc.space });
  }

  /** Where the camera is pointing at the ground, when the panel has told us. */
  let lookAt = null;
  const setLookAt = (p) => { lookAt = p && Number.isFinite(p.x) ? { x: p.x, z: p.z } : null; return lookAt; };
  const lookPoint = () => lookAt;

  /** The point in the space's own frame for a world point. */
  function localOf(x, z) {
    if (!doc) return null;
    return { x: round2(x - doc.space.at.x), z: round2(z - doc.space.at.z) };
  }
  /** And back the other way. */
  function worldOf(x, z) {
    if (!doc) return null;
    return { x: round2(doc.space.at.x + x), z: round2(doc.space.at.z + z) };
  }

  /** How far a point is outside the space's radius, or 0 when it is inside. */
  function outsideBy(local) {
    if (!doc) return 0;
    return Math.max(0, Math.hypot(local.x, local.z) - doc.space.radius);
  }

  // --------------------------------------------------------- the palette --

  function rows() { return search(paletteFor(tab, { has: ctx.hasProp }), query); }

  function setTab(id) {
    if (!TAB_IDS.includes(id)) return bad(`there is no "${id}" tab.`);
    tab = id; pick = null;
    return { ok: true, tab, rows: rows() };
  }
  function setQuery(q) { query = String(q || ''); return rows(); }

  function arm(id) {
    const list = rows();
    const row = list.find((r) => r.id === id);
    if (!row) return bad(`"${id}" is not in the ${tab} tab.`);
    if (tab === 'terrain') { brush = id; return good(`the ${id} brush is in hand, ${brushR} m across.`); }
    // `real` and `placeable` are not the same question. A stand-in is not
    // real and is perfectly placeable; a critter with no monster row is
    // neither, and writing one would fail the space's own audit later.
    if (row.placeable === false) return bad(`${row.label} cannot be placed: ${row.hint}.`);
    pick = id;
    if (tab === 'markers') markerKind = id;
    return good(`${row.label} is on the cursor. Click the ground to put one down, Escape to drop it.`, { pick });
  }
  const disarm = () => { const had = pick; pick = null; return had ? good('the cursor is empty again.') : { ok: false, text: '' }; };

  // ---------------------------------------------------------- placement --

  /** Put the armed thing down at a world point. */
  function placeAt(x, z) {
    if (!doc) return bad('there is no space open, so there is nowhere to put it. Make one first.');
    if (!pick) return bad('nothing is on the cursor. Pick something out of the palette first.');
    const local = localOf(x, z);
    const out = outsideBy(local);
    if (out > 0) {
      return bad(`that is ${out.toFixed(1)} m outside ${doc.space.name}, which reaches ${doc.space.radius} m. Widen the space or stand closer in.`);
    }
    const made = entryFor(tab, pick, local.x, local.z, {
      yaw: ghostYaw, scale: ghostScale, night,
      name: personName || null, label: markerLabel || pick, note: markerNote, kind: markerKind,
    });
    if (!made) return bad(`the ${tab} tab does not put anything into a space.`);
    const res = doc.place(made.list, made.entry);
    if (!res.ok) return bad(res.text);
    rebuild();
    dirty = true;
    const w = worldOf(local.x, local.z);
    return good(`${labelOf(made.list, made.entry)} is down at ${local.x}, ${local.z} in ${doc.space.name}, which is ${w.x}, ${w.z} in the world. ${doc.count().total} ${doc.count().total === 1 ? 'thing stands' : 'things stand'} here now.`, { sel: res.sel });
  }

  const selection = () => (doc ? doc.selection : null);
  function select(sel) {
    if (!doc) return bad('there is no space open.');
    const got = doc.select(sel);
    if (!got) return bad('there is nothing there to select.');
    const e = doc.at(got);
    const p = pointOf(got.list, e);
    return good(`${labelOf(got.list, e)} is selected, at ${p ? `${p.x}, ${p.z}` : 'no point of its own'}.`, { sel: got });
  }

  const after = (res) => {
    if (res.ok) { rebuild(); dirty = true; return good(res.text); }
    return bad(res.text);
  };

  function moveTo(x, z) {
    if (!doc || !doc.selection) return bad('nothing is selected, so nothing moved.');
    const local = localOf(x, z);
    const out = outsideBy(local);
    if (out > 0) return bad(`that would put it ${out.toFixed(1)} m outside the space, and a space keeps everything inside its own radius.`);
    return after(doc.move(doc.selection, local.x, local.z));
  }
  const turn = (deg = TURN_DEG) => (doc ? after(doc.rotate(doc.selection, deg)) : bad('there is no space open.'));
  const grow = (mul = SCALE_STEP) => (doc ? after(doc.scale(doc.selection, mul)) : bad('there is no space open.'));
  const del = () => (doc ? after(doc.remove(doc.selection)) : bad('there is no space open.'));

  function undo() {
    if (!doc) return bad('there is no space open.');
    const res = doc.undo();
    if (!res.ok) return bad(res.text);
    rebuild(); dirty = true;
    return good(res.text);
  }
  function redo() {
    if (!doc) return bad('there is no space open.');
    const res = doc.redo();
    if (!res.ok) return bad(res.text);
    rebuild(); dirty = true;
    return good(res.text);
  }

  /** Change the space itself: its name, its note, its radius, where it stands. */
  function setSpace(patch = {}) {
    if (!doc) return bad('there is no space open.');
    const s = doc.space;
    const words = [];
    if (typeof patch.name === 'string' && patch.name.trim() && patch.name !== s.name) { s.name = patch.name.trim(); words.push(`it is called ${s.name} now`); }
    if (typeof patch.note === 'string' && patch.note !== s.note) { s.note = patch.note; words.push('the note is written'); }
    if (Number.isFinite(patch.radius) && patch.radius > 0 && patch.radius !== s.radius) {
      const outside = doc.contents().filter((r) => r.x != null && Math.hypot(r.x, r.z) > patch.radius);
      if (outside.length) return bad(`${outside.length} ${outside.length === 1 ? 'thing stands' : 'things stand'} outside ${patch.radius} m, so the space cannot shrink to it yet. The furthest is ${outside[0].label}.`);
      s.radius = patch.radius; words.push(`it reaches ${s.radius} m`);
    }
    if (!words.length) return bad('nothing about the space changed.');
    dirty = true; rebuild();
    return good(`${s.name}: ${words.join(', ')}.`);
  }

  // -------------------------------------------------------------- saving --

  /** What would be written, checked before it is written. */
  function validate() {
    if (!doc) return { ok: false, text: 'there is no space open.' };
    const json = doc.toJSON();
    try {
      const stats = auditSpaces({ [json.id]: json });
      return { ok: true, json, stats };
    } catch (err) {
      return { ok: false, text: String(err && err.message), json };
    }
  }

  /**
   * Write the space to disk, through the dev server's own endpoint.
   *
   * The audit runs FIRST, against the same `auditSpaces` the game runs at load,
   * so a space that would refuse to load is refused here with the reason in
   * words instead of being written and breaking the next reload.
   */
  async function save(fetchFn = (typeof fetch === 'function' ? fetch : null)) {
    const v = validate();
    if (!v.ok) return bad(`${doc ? doc.space.name : 'that space'} was not saved: ${v.text}`);
    if (!fetchFn) return bad('there is no way to reach the dev server from here, so nothing was written.');
    const path = SPACE_PATH(v.json.id);
    let res;
    try {
      res = await fetchFn(SAVE_URL, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, json: v.json }),
      });
    } catch (err) {
      return bad(`the save did not reach the server: ${err && err.message}. Is vite running?`);
    }
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok || !body || !body.ok) {
      return bad(`${path} was refused: ${(body && body.text) || res.status}`);
    }
    dirty = false;
    const c = doc.count();
    const parts = LISTS.filter((l) => c[l]).map((l) => `${c[l]} ${c[l] === 1 ? LIST_WORD[l] : l}`);
    return good(`${path} written, ${body.bytes} bytes: ${parts.length ? parts.join(', ') : 'nothing in it yet'}.`, { path, bytes: body.bytes });
  }

  /** What is on disk right now. */
  async function list(fetchFn = (typeof fetch === 'function' ? fetch : null)) {
    if (!fetchFn) return bad('there is no way to reach the dev server from here.');
    try {
      const res = await fetchFn(LIST_URL);
      const body = await res.json();
      disk = (body && body.spaces) || [];
      return good(`${disk.length} ${disk.length === 1 ? 'space' : 'spaces'} on disk: ${disk.map((s) => s.id).join(', ') || 'none yet'}.`, { spaces: disk });
    } catch (err) {
      return bad(`the space list did not come back: ${err && err.message}.`);
    }
  }

  /**
   * Throw away what is open and read the file again.
   *
   * It reads the MODULE, not the endpoint, because the module is what the game
   * builds from: if the two ever disagreed, reloading from the endpoint would
   * hide it. A space that has never been saved has no module and says so.
   */
  function reload() {
    if (!doc) return bad('there is no space open to reload.');
    const id = doc.space.id;
    if (!SPACES[id]) return bad(`${id} has never been saved, so there is nothing on disk to go back to.`);
    const res = open(id);
    return res.ok ? good(`${id} is back to what is on disk.`) : res;
  }

  // ------------------------------------------------------------- terrain --

  const terrain = () => (typeof window !== 'undefined' && window.__bw && window.__bw.terrain) || ctx.terrain || null;
  const NO_TERRAIN = 'the terrain tools are not in yet: nothing answers window.__bw.terrain.';

  function stroke(x, z, opts = {}) {
    const t = terrain();
    if (!t || typeof t.stroke !== 'function') return bad(NO_TERRAIN);
    const call = { kind: opts.kind || brush, x: round2(x), z: round2(z), r: num(opts.r) || brushR, amount: opts.amount != null ? num(opts.amount) : brushAmount };
    if (!BRUSH_IDS.includes(call.kind)) return bad(`"${call.kind}" is not one of ${BRUSH_IDS.join(', ')}.`);
    let out;
    try { out = t.stroke(call); } catch (err) { return bad(`the ${call.kind} brush threw: ${err && err.message}`); }
    // The strokes of one drag are not each worth a line; the drag's end is.
    return { ok: true, call, result: out };
  }

  function strokeDone(n) {
    if (!n) return { ok: false, text: '' };
    return good(`${n} ${n === 1 ? 'stroke' : 'strokes'} of ${brush}, ${brushR} m across at ${brushAmount} m.`);
  }

  function terrainUndo() {
    const t = terrain();
    if (!t || typeof t.undo !== 'function') return bad(NO_TERRAIN);
    const out = t.undo();
    return good(out === false ? 'there was no terrain stroke left to undo.' : 'the last terrain stroke is undone.');
  }
  function terrainRedo() {
    const t = terrain();
    if (!t || typeof t.redo !== 'function') return bad(NO_TERRAIN);
    const out = t.redo();
    return good(out === false ? 'there was no terrain stroke to put back.' : 'the terrain stroke is back.');
  }
  async function terrainSave() {
    const t = terrain();
    if (!t || typeof t.save !== 'function') return bad(NO_TERRAIN);
    try {
      const out = await t.save();
      return good(typeof out === 'string' ? out : 'the terrain edits are saved.');
    } catch (err) { return bad(`the terrain save threw: ${err && err.message}`); }
  }
  const terrainReady = () => {
    const t = terrain();
    return !!(t && typeof t.stroke === 'function');
  };

  function setBrush(patch = {}) {
    if (patch.kind && BRUSH_IDS.includes(patch.kind)) brush = patch.kind;
    if (Number.isFinite(patch.r)) brushR = Math.max(1, Math.min(120, patch.r));
    if (Number.isFinite(patch.amount)) brushAmount = Math.max(-20, Math.min(20, patch.amount));
    return { brush, r: brushR, amount: brushAmount };
  }

  /** Ask the terrain half to build the ground again around a point. */
  function rebuildGround(x, z, r) {
    const rt = ctx.runtime;
    if (rt && typeof rt.rebuildAround === 'function') { rt.rebuildAround(x, z, r); return true; }
    return false;
  }

  // -------------------------------------------------------------- the rest --

  return {
    // the space
    open, newSpace, reload, save, list, validate, setSpace,
    get doc() { return doc; },
    get space() { return doc ? doc.space : null; },
    get dirty() { return dirty; },
    get spaces() { return Object.keys(SPACES); },
    get disk() { return disk.slice(); },
    contents: () => (doc ? doc.contents() : []),
    count: () => (doc ? doc.count() : { total: 0 }),
    localOf, worldOf, siteOf, rebuild, outsideBy,
    setLookAt, lookPoint,
    // the palette
    get tab() { return tab; },
    get query() { return query; },
    get pick() { return pick; },
    rows, setTab, setQuery, arm, disarm,
    // the ghost's own knobs
    get ghost() { return { yaw: ghostYaw, scale: ghostScale, night, name: personName, label: markerLabel, note: markerNote, kind: markerKind }; },
    setGhost(patch = {}) {
      if (Number.isFinite(patch.yaw)) ghostYaw = ((patch.yaw % 360) + 360) % 360;
      if (Number.isFinite(patch.scale)) ghostScale = Math.max(0.2, Math.min(6, patch.scale));
      if (typeof patch.night === 'boolean') night = patch.night;
      if (typeof patch.name === 'string') personName = patch.name;
      if (typeof patch.label === 'string') markerLabel = patch.label;
      if (typeof patch.note === 'string') markerNote = patch.note;
      if (typeof patch.kind === 'string') markerKind = patch.kind;
      return this.ghost;
    },
    // editing
    placeAt, select, selection, moveTo, turn, grow, del, undo, redo,
    get canUndo() { return !!doc && doc.canUndo; },
    get canRedo() { return !!doc && doc.canRedo; },
    // terrain
    stroke, strokeDone, terrainUndo, terrainRedo, terrainSave, terrainReady, setBrush, rebuildGround,
    get brush() { return { kind: brush, r: brushR, amount: brushAmount }; },
    // words
    say,
    get status() { return status.slice(); },
    get lastLine() { return status.length ? status[0].text : ''; },
  };
}
