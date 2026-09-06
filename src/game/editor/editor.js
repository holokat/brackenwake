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
// file calls `kinds`, `stroke`, `undo`, `redo`, `save`, `list`, `mode`, `base`,
// `setBase` and `reset` on it where they are there, and says which one is
// missing where they are not. It never touches the height field itself and
// never writes a terrain file. Not one brush is named in this repository's
// editor: `kinds()` is the vocabulary and the knobs, and the panel is built
// from the answer.

import { buildPlan, setMarkersVisible } from '../../world/plan_models.js';
import { SPACES, emptySpace } from '../../mmo/spaces/index.js';
import { auditSpaces } from '../../mmo/plans/plan_schema.js';
import { spaceSiteRow } from '../../world/sites.js';
import { createSpaceDoc, LISTS, LIST_WORD, TURN_DEG, SCALE_STEP, labelOf, pointOf } from './space_doc.js';
import { paletteFor, entryFor, search, TAB_IDS, BRUSH_IDS, brushRows, OPPOSITE, ANGLE_NAMES } from './palette.js';

/** Where a space file lives, and where the terrain half writes its own. */
export const SPACE_PATH = (id) => `src/mmo/spaces/${id}.json`;
/** The endpoints the dev server answers. tools/editor_save.mjs is the other end. */
export const SAVE_URL = '/__editor/save';
export const LIST_URL = '/__editor/list';
/** How wide a new space is, in metres, until it is changed. */
export const NEW_RADIUS = 60;
/** How many lines of status the editor keeps. */
export const STATUS_MAX = 60;
/** The default brush, in metres and in metres of lift, when kinds() is silent. */
export const BRUSH_R = 8;
export const BRUSH_AMOUNT = 1;
/** A held brush lays a stroke no oftener than this, in milliseconds. */
export const DRAG_MS = 60;
/** And no closer than this share of its own radius, so a drag is one brush. */
export const DRAG_SPACING = 0.5;
/** How long the reset button remembers having asked, in milliseconds. */
export const RESET_ASK_MS = 8000;
/** How far one press of plus or minus moves the radius, as a share of it. */
export const RADIUS_STEP = 0.15;

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

  // The terrain tab is the one tab that is not a view of a table in this
  // repository: it is whatever the terrain half answered to kinds(), which is
  // empty until that half is wired. Everything else reads its own module.
  function rows() {
    if (tab === 'terrain') return search(terrainKinds() || [], query);
    return search(paletteFor(tab, { has: ctx.hasProp }), query);
  }

  function setTab(id) {
    if (!TAB_IDS.includes(id)) return bad(`there is no "${id}" tab.`);
    tab = id; pick = null;
    return { ok: true, tab, rows: rows() };
  }
  function setQuery(q) { query = String(q || ''); return rows(); }

  function arm(id) {
    const list = rows();
    const row = list.find((r) => r.id === id);
    if (!row) {
      if (tab === 'terrain') return bad(terrainReady() ? `"${id}" is not a brush the terrain tools name.` : NO_TERRAIN);
      return bad(`"${id}" is not in the ${tab} tab.`);
    }
    if (tab === 'terrain') {
      brush = id;
      lineFrom = null;
      const w = brushWord(id);
      return good(`${row.label} is in hand, ${radiusOf(id)} m across the radius${row.amount ? ` at ${amountOf(id)} m` : ''}${w ? `, laying ${w}` : ''}. ${row.line ? 'Click where it starts, then click where it ends.' : 'Hold the left button and drag it over the ground.'}`);
    }
    // `real` and `placeable` are not the same question. A stand-in is not
    // real and is perfectly placeable; a critter with no monster row is
    // neither, and writing one would fail the space's own audit later.
    if (row.placeable === false) return bad(`${row.label} cannot be placed: ${row.hint}.`);
    pick = id;
    if (tab === 'markers') markerKind = id;
    return good(`${row.label} is on the cursor. Click the ground to put one down, Escape to drop it.`, { pick });
  }
  // Escape drops whatever is in hand, and a half drawn line is in hand too.
  const disarm = () => {
    if (lineFrom) return lineCancel();
    const had = pick;
    pick = null;
    return had ? good('the cursor is empty again.') : { ok: false, text: '' };
  };

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
  //
  // NOTHING ABOUT A BRUSH IS TYPED HERE. `terrain.kinds()` is the vocabulary,
  // the knobs and their ranges; this half reads that answer, keeps a value per
  // knob per kind, and sends every one of them back down with the stroke. A
  // mountain that reaches 600 m gets a 600 m slider because the contract said
  // 600, not because a number was copied across.
  //
  // A DRAG IS ONE THING. Strokes are laid along the drag at half the radius
  // and no oftener than every 60 ms, so a swept brush reads as a brush and not
  // as a row of dots, and the whole sweep is pushed onto this file's own stack
  // as ONE group. Undo pops the group and calls the contract's undo once per
  // stroke in it, so one ctrl Z takes the drag back the way it was made.

  const terrain = () => (typeof window !== 'undefined' && window.__bw && window.__bw.terrain) || ctx.terrain || null;
  const NO_TERRAIN = 'the terrain tools are not in yet: nothing answers window.__bw.terrain.';
  const NO_KINDS = 'the terrain tools are there but answer no kinds(), so there is nothing to sculpt with.';

  let kindRows = null;        // the live brushes, off kinds()
  let kindsFrom = null;       // the terrain object those rows came from
  const brushVals = new Map();  // kind -> { param name: number }
  const brushWords = new Map(); // kind -> the word it paints with
  let lineFrom = null;        // the first click of a line tool
  let drag = null;            // the drag in hand
  const strokeGroups = [];    // one per drag, deepest last
  const strokeUndone = [];    // the groups undo took off, for redo
  let askedAt = 0;            // when the reset button last asked

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /** The live brushes, or null when there are none and why is worth saying. */
  function terrainKinds() {
    const t = terrain();
    if (!t || typeof t.kinds !== 'function') { kindRows = null; kindsFrom = null; return null; }
    if (kindRows && kindsFrom === t) return kindRows;
    let raw = null;
    try { raw = t.kinds(); } catch (err) {
      kindRows = null; kindsFrom = null;
      say(`the terrain tools threw when asked what brushes they have: ${err && err.message}`, 'bad');
      return null;
    }
    const rows = brushRows(raw);
    if (!rows.length) { kindRows = null; kindsFrom = null; return null; }
    kindRows = rows; kindsFrom = t;
    if (!rows.some((r) => r.id === brush)) brush = rows[0].id;
    return kindRows;
  }
  /** Read kinds() again, for a terrain half that grew a brush while we watched. */
  function refreshKinds() {
    kindRows = null; kindsFrom = null;
    const rows = terrainKinds();
    if (!rows) return bad(terrain() ? NO_KINDS : NO_TERRAIN);
    return good(`${rows.length} ${rows.length === 1 ? 'brush' : 'brushes'} to sculpt with: ${rows.map((r) => r.id).join(', ')}.`);
  }

  const brushRowOf = (id) => (terrainKinds() || []).find((r) => r.id === (id || brush)) || null;
  const labelOfKind = (id) => { const r = brushRowOf(id); return r ? r.label : id; };

  /** Every knob of a kind, at the value it is set to, defaulted and in range. */
  function brushValues(id = brush) {
    const row = brushRowOf(id);
    const set = brushVals.get(id) || {};
    const out = {};
    if (!row) {
      out.r = Number.isFinite(set.r) ? set.r : brushR;
      out.amount = Number.isFinite(set.amount) ? set.amount : brushAmount;
      return out;
    }
    for (const p of row.params) out[p.name] = clamp(Number.isFinite(set[p.name]) ? set[p.name] : p.default, p.min, p.max);
    return out;
  }
  const brushValue = (id, name) => {
    const v = brushValues(id)[name];
    return Number.isFinite(v) ? v : 0;
  };
  /** Whether a knob has been moved, as against still standing on its default. */
  const brushTouched = (id, name) => {
    const set = brushVals.get(id || brush);
    return !!(set && Number.isFinite(set[name]));
  };
  const brushWord = (id = brush) => {
    const row = brushRowOf(id);
    if (!row || !row.words.length) return null;
    const w = brushWords.get(id);
    return w && row.words.includes(w) ? w : row.words[0];
  };

  /** The knob that means "how wide", and the one that means "how much". */
  function radiusOf(id = brush) {
    const row = brushRowOf(id);
    if (!row || !row.radius) return brushR;
    return brushValue(id, row.radius.name);
  }
  function amountOf(id = brush) {
    const row = brushRowOf(id);
    if (!row || !row.amount) return brushAmount;
    return brushValue(id, row.amount.name);
  }

  /**
   * Set one knob, by its own name or by the words `r` and `amount`.
   *
   * The aliases are there because the panel, the keys and the old contract all
   * speak of a radius and an amount, and a kind may call them something else.
   * Everything is clamped to the range the contract gave, and the clamped value
   * is what comes back, so a slider that asked for 9999 shows 600.
   */
  function setBrushParam(id, name, value) {
    const kind = id || brush;
    const row = brushRowOf(kind);
    if (!Number.isFinite(value)) return brushValue(kind, name);
    const n = String(name || '').toLowerCase();
    if (!row) {
      // no kinds(): the two knobs of the first contract, clamped as they were
      if (n === 'r' || n === 'radius') { brushR = clamp(value, 1, 120); return brushR; }
      if (n === 'amount') { brushAmount = clamp(value, -20, 20); return brushAmount; }
      return 0;
    }
    let p = row.params.find((q) => q.name === name) || row.params.find((q) => q.name.toLowerCase() === n);
    if (!p && (n === 'r' || n === 'radius')) p = row.radius;
    if (!p && n === 'amount') p = row.amount;
    if (!p) return 0;
    const v = round2(clamp(value, p.min, p.max));
    const set = brushVals.get(kind) || {};
    set[p.name] = v;
    brushVals.set(kind, set);
    return v;
  }

  /** The word a painting brush lays down. Refused, in words, if it is not one. */
  function setBrushWord(id, word) {
    const kind = id || brush;
    const row = brushRowOf(kind);
    if (!row || !row.words.length) return bad(`${labelOfKind(kind)} does not paint a word, so there is nothing to choose.`);
    const w = String(word || '');
    if (!row.words.includes(w)) return bad(`"${w}" is not one of ${row.words.join(', ')}.`);
    brushWords.set(kind, w);
    return good(`${row.label} lays down ${w}.`);
  }

  /** Plus and minus: the radius, by a share of itself, inside the contract's range. */
  function bumpRadius(dir = 1) {
    const row = brushRowOf(brush);
    const p = row ? row.radius : null;
    const now = radiusOf(brush);
    const step = Math.max(p ? p.step : 1, Math.abs(now) * RADIUS_STEP);
    const next = setBrushParam(brush, p ? p.name : 'r', now + step * (dir < 0 ? -1 : 1));
    if (next === now) {
      return bad(`${labelOfKind(brush)} is already as ${dir < 0 ? 'small' : 'wide'} as it goes, ${now} m across the radius.`);
    }
    return good(`${labelOfKind(brush)} is ${next} m across the radius.`);
  }

  /**
   * What shift does to a kind.
   *
   * A named pair when both halves are in the contract, else a negated amount
   * when the amount is allowed to go negative, else nothing at all AND a word
   * saying so, because a shift that silently did nothing would read as a bug.
   */
  function invert(kind) {
    const rows = terrainKinds();
    const opp = OPPOSITE[kind];
    if (opp && (rows ? rows.some((r) => r.id === opp) : BRUSH_IDS.includes(opp))) return { kind: opp, swapped: true };
    const row = brushRowOf(kind);
    if (row && row.amount && row.amount.min < 0) return { kind, negate: true };
    return { kind, none: true };
  }

  /** What one stroke did, in words, for the status line. */
  function describe(call, row, line = null) {
    const bits = [`${call.kind} at ${call.x}, ${call.z}`];
    if (Number.isFinite(call.r)) bits.push(`${call.r} m across`);
    if (Number.isFinite(call.amount) && (!row || row.amount)) bits.push(`${call.amount} m`);
    if (call.word) bits.push(`in ${call.word}`);
    // The bearing is said in degrees whichever unit the contract counts in,
    // because nobody reads a hillside in radians.
    if (line) bits.push(`${line.length} m long, bearing ${line.deg} degrees`);
    return bits.join(', ');
  }

  /**
   * One stroke, down the contract, with every knob the kind takes.
   *
   * `opts.to` is the far end of a line tool, in world metres: it is turned into
   * whichever pair of knobs the kind asked for, a yaw and a length or a second
   * point, and a line longer than the knob allows is cut to the knob AND said,
   * rather than being quietly shortened.
   */
  function stroke(x, z, opts = {}) {
    const t = terrain();
    if (!t || typeof t.stroke !== 'function') return bad(NO_TERRAIN);
    const rows = terrainKinds();
    let kind = opts.kind || brush;
    if (rows) {
      if (!rows.some((r) => r.id === kind)) return bad(`"${kind}" is not one of ${rows.map((r) => r.id).join(', ')}.`);
    } else if (!BRUSH_IDS.includes(kind)) {
      return bad(`"${kind}" is not one of ${BRUSH_IDS.join(', ')}.`);
    }
    let flip = null;
    if (opts.shift) {
      flip = invert(kind);
      kind = flip.kind;
    }
    const row = brushRowOf(kind);
    const call = { ...brushValues(kind), kind, x: round2(x), z: round2(z) };
    // `r` and `amount` are sent alongside the kind's own knob names, so a
    // terrain half reading the first contract still finds them. They are sent
    // only where the kind really has such a knob: a lake takes a floor and no
    // amount, and an amount it never asked for would read as a knob it has.
    if (!row || row.radius) call.r = radiusOf(kind);
    if (!row || row.amount) call.amount = amountOf(kind);
    if (flip && flip.negate && row && row.amount) {
      call.amount = round2(-call.amount);
      call[row.amount.name] = call.amount;
    }
    // A bearing knob on a brush that is NOT drawn between two points is left
    // out until the user moves it, so the terrain half's own answer stands: a
    // cave mouth opens downhill and a cliff faces the way the player does.
    // Sending the slider's untouched default would quietly overrule both.
    if (row && !row.line) {
      for (const p of row.params) {
        if (ANGLE_NAMES.includes(p.name.toLowerCase()) && !brushTouched(kind, p.name)) delete call[p.name];
      }
    }
    const word = brushWord(kind);
    // `word` is what the stroke list holds; `ground` is the word the panel's own
    // picker is called. Both are sent, because the terrain half accepts either
    // and a ground stroke that arrived with neither would silently paint dirt.
    if (word) { call.word = word; call.ground = word; }
    let cut = '';
    let line = null;
    if (opts.to && row && row.line) {
      const dx = round2(opts.to.x) - call.x, dz = round2(opts.to.z) - call.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.5) return bad(`${row.label} needs two points with some ground between them; those two are ${round2(len)} m apart.`);
      // The bearing is clockwise from north: sin on x, cos on z, which is what
      // every yaw in this game means and what the terrain half's own line
      // walks along.
      const rad = ((Math.atan2(dx, dz) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const deg = round2(rad * 180 / Math.PI);
      if (row.pair) {
        call[row.pair[0].name] = round2(clamp(opts.to.x, row.pair[0].min, row.pair[0].max));
        call[row.pair[1].name] = round2(clamp(opts.to.z, row.pair[1].min, row.pair[1].max));
        line = { deg, length: round2(len) };
        call.length = line.length;
      } else {
        // THE UNIT IS THE KNOB'S OWN. A yaw that runs to 6.28 is radians and
        // one that runs to 360 is degrees; sending 90 to the first would point
        // a ridge drawn due east at the north west instead.
        const inUnit = row.yaw.unit === 'degrees' ? deg : round2(rad * 10000) / 10000;
        call[row.yaw.name] = clamp(inUnit, row.yaw.min, row.yaw.max);
        const want = round2(len);
        const fits = round2(clamp(want, row.length.min, row.length.max));
        call[row.length.name] = fits;
        call.length = fits;
        line = { deg, length: fits };
        if (fits !== want) cut = `. You drew ${want} m and ${row.label} reaches ${row.length.max} m, so it was cut to ${fits} m`;
      }
    }
    let out;
    try { out = t.stroke(call); } catch (err) { return bad(`the ${call.kind} brush threw: ${err && err.message}`); }
    // The strokes of one drag are not each worth a line; the drag's end is.
    return { ok: true, call, row, line, result: out, cut, words: typeof out === 'string' ? out : '', flip };
  }

  /** One stroke that stands on its own: a click, or the far end of a line. */
  function strokeOnce(x, z, opts = {}) {
    const res = stroke(x, z, opts);
    if (!res.ok) return res;
    strokeGroups.push({ kind: res.call.kind, n: 1 });
    strokeUndone.length = 0;
    const none = res.flip && res.flip.none ? `. ${labelOfKind(res.call.kind)} has no other way round, so shift changed nothing` : '';
    return good(`${describe(res.call, res.row, res.line)}${res.cut}${none}. ${res.words || 'Ctrl Z takes it back.'}`, { call: res.call, line: res.line });
  }

  /**
   * The three calls a held brush makes: begin, then one per pointer move, then
   * end. The spacing and the interval live here and not in the panel, so what
   * the test drives is what the mouse drives.
   */
  function dragBegin(x, z, opts = {}) {
    const row = brushRowOf(brush);
    if (row && row.line) return bad(`${row.label} is drawn between two points: click where it starts, then click where it ends.`);
    drag = { kind: brush, r: radiusOf(brush), n: 0, at: -Infinity, x: NaN, z: NaN, shift: !!opts.shift, words: '' };
    const first = dragStroke(x, z, opts);
    // A drag whose very first stroke was refused is no drag at all, so it is
    // dropped here rather than left lying for the next pointer move to feed.
    if (!first.ok) drag = null;
    return first;
  }
  function dragStroke(x, z, opts = {}) {
    if (!drag || drag.dead) return { ok: false, text: '' };
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    if (drag.n) {
      if (now - drag.at < DRAG_MS) return { ok: false, text: '', early: true };
      if (Math.hypot(x - drag.x, z - drag.z) < Math.max(0.25, drag.r * DRAG_SPACING)) return { ok: false, text: '', near: true };
    }
    const res = stroke(x, z, { kind: drag.kind, shift: drag.shift });
    if (!res.ok) { drag.dead = true; return res; }
    drag.n++; drag.at = now; drag.x = x; drag.z = z; drag.words = res.words || '';
    drag.laid = res.call;
    return res;
  }
  function dragEnd() {
    const d = drag;
    drag = null;
    if (!d || !d.n) return { ok: false, text: '' };
    strokeGroups.push({ kind: d.laid.kind, n: d.n });
    strokeUndone.length = 0;
    const turned = d.shift ? (d.laid.kind === d.kind ? ', turned over' : `, turned over into ${d.laid.kind}`) : '';
    const row = brushRowOf(d.laid.kind);
    const much = !row || row.amount ? ` at ${amountOf(d.laid.kind)} m` : '';
    return good(`${d.n} ${d.n === 1 ? 'stroke' : 'strokes'} of ${labelOfKind(d.laid.kind)}, ${d.r} m across${much}${turned}. One ctrl Z takes the whole drag back.`, { strokes: d.n });
  }
  /** How much ground one drag has covered so far, for the panel's readout. */
  const dragCount = () => (drag ? drag.n : 0);

  /** The two clicks of a line tool, and the escape that lets one go. */
  function lineStart(x, z) {
    const row = brushRowOf(brush);
    if (!row || !row.line) return bad(`${labelOfKind(brush)} is not drawn between two points.`);
    lineFrom = { x: round2(x), z: round2(z) };
    return good(`${row.label} starts at ${lineFrom.x}, ${lineFrom.z}. Click the far end, or press Escape to let it go.`, { from: { ...lineFrom } });
  }
  function lineEnd(x, z, opts = {}) {
    if (!lineFrom) return lineStart(x, z);
    const from = lineFrom;
    lineFrom = null;
    return strokeOnce(from.x, from.z, { ...opts, to: { x, z } });
  }
  function lineCancel() {
    if (!lineFrom) return { ok: false, text: '' };
    lineFrom = null;
    return good('the line is let go, and no ground was moved.');
  }
  const lineAt = () => (lineFrom ? { ...lineFrom } : null);

  /**
   * Undo, a whole drag at a time.
   *
   * The contract undoes one stroke a call, so a drag of thirty is thirty calls.
   * If the contract runs out part way the count is said rather than assumed.
   */
  function terrainUndo() {
    const t = terrain();
    if (!t || typeof t.undo !== 'function') return bad(NO_TERRAIN);
    const g = strokeGroups.pop();
    if (!g) {
      const out = t.undo();
      return good(out === false ? 'there was no terrain stroke left to undo.' : (typeof out === 'string' ? out : 'the last terrain stroke is undone.'));
    }
    let n = 0;
    for (let i = 0; i < g.n; i++) { if (t.undo() === false) break; n++; }
    strokeUndone.push({ ...g, n });
    if (!n) return bad(`the ${g.kind} the editor was holding was already gone from the ground, so nothing came back.`);
    return good(n === g.n
      ? `${n} ${n === 1 ? 'stroke' : 'strokes'} of ${g.kind} undone, the whole ${g.n === 1 ? 'stroke' : 'drag'} in one.`
      : `${n} of the ${g.n} strokes of ${g.kind} came back; the ground had no more to give.`);
  }
  function terrainRedo() {
    const t = terrain();
    if (!t || typeof t.redo !== 'function') return bad(NO_TERRAIN);
    const g = strokeUndone.pop();
    if (!g) {
      const out = t.redo();
      return good(out === false ? 'there was no terrain stroke to put back.' : (typeof out === 'string' ? out : 'the terrain stroke is back.'));
    }
    let n = 0;
    for (let i = 0; i < g.n; i++) { if (t.redo() === false) break; n++; }
    strokeGroups.push({ ...g, n });
    if (!n) return bad(`there was nothing of that ${g.kind} left to put back.`);
    return good(`${n} ${n === 1 ? 'stroke' : 'strokes'} of ${g.kind} back on the ground.`);
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

  // ------------------------------------------------------- the world floor --

  /** Sculpting or generating, in the terrain half's own word, or null. */
  function terrainMode() {
    const t = terrain();
    if (!t || typeof t.mode !== 'function') return null;
    try { const m = t.mode(); return typeof m === 'string' ? m : null; } catch { return null; }
  }
  /** What the world is under every stroke: its height, its ground, its snow. */
  function terrainBase() {
    const t = terrain();
    if (!t || typeof t.base !== 'function') return null;
    try { const b = t.base(); return b && typeof b === 'object' ? b : null; } catch { return null; }
  }
  function setTerrainBase(patch = {}) {
    const t = terrain();
    if (!t || typeof t.setBase !== 'function') return bad('the terrain tools answer no setBase yet, so the world floor is what it was.');
    const want = {};
    if (Number.isFinite(patch.height)) want.height = round2(patch.height);
    if (typeof patch.ground === 'string' && patch.ground.trim()) want.ground = patch.ground.trim();
    if (Number.isFinite(patch.snowLine)) want.snowLine = round2(patch.snowLine);
    if (!Object.keys(want).length) return bad('nothing was given to set, so the world floor is what it was.');
    let out;
    try { out = t.setBase(want); } catch (err) { return bad(`setBase threw: ${err && err.message}`); }
    const said = Object.entries(want).map(([k, v]) => `${k} ${v}`).join(', ');
    return good(typeof out === 'string' && out ? out : `the world floor is ${said}.`);
  }
  /**
   * Drop every stroke, once the user has been asked.
   *
   * The first press asks and changes nothing; a second press inside eight
   * seconds does it. Reset is the one button here with no undo behind it.
   */
  function terrainReset(opts = {}) {
    const t = terrain();
    if (!t || typeof t.reset !== 'function') return bad('the terrain tools answer no reset yet, so nothing was dropped.');
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    if (!opts.sure && !(askedAt && now - askedAt <= RESET_ASK_MS)) {
      askedAt = now;
      return { ok: false, asked: true, text: say(`this drops every stroke you have made${strokeGroups.length ? `, ${strokeGroups.length} ${strokeGroups.length === 1 ? 'drag' : 'drags'} of them` : ''}, and no undo brings them back. Press it again to do it.`) };
    }
    askedAt = 0;
    let out;
    try { out = t.reset(); } catch (err) { return bad(`the terrain reset threw: ${err && err.message}`); }
    strokeGroups.length = 0;
    strokeUndone.length = 0;
    lineFrom = null;
    drag = null;
    return good(typeof out === 'string' && out ? out : 'every stroke is gone and the world is the flat one it started as.');
  }
  /** Whether the reset button is standing with its question still open. */
  const resetAsked = (now = Date.now()) => !!askedAt && now - askedAt <= RESET_ASK_MS;

  /** How many strokes the ground is carrying, when the contract will say. */
  function terrainCount() {
    const t = terrain();
    if (!t) return null;
    try {
      if (typeof t.count === 'function') { const c = t.count(); if (c && typeof c === 'object') return c; }
      if (typeof t.list === 'function') { const l = t.list(); if (Array.isArray(l)) return { strokes: l.length }; }
    } catch { return null; }
    return null;
  }

  function setBrush(patch = {}) {
    const rows = terrainKinds();
    if (patch.kind) {
      if (rows) { if (rows.some((r) => r.id === patch.kind)) brush = patch.kind; }
      else if (BRUSH_IDS.includes(patch.kind)) brush = patch.kind;
    }
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'kind' || k === 'word') continue;
      if (Number.isFinite(v)) setBrushParam(brush, k, v);
    }
    if (typeof patch.word === 'string') setBrushWord(brush, patch.word);
    return { brush, kind: brush, r: radiusOf(brush), amount: amountOf(brush), params: brushValues(brush), word: brushWord(brush) };
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
    // terrain: the brushes
    terrainKinds, refreshKinds, brushRow: brushRowOf, brushValues, brushValue, brushWord,
    setBrush, setBrushParam, setBrushWord, brushTouched, bumpRadius, invert,
    // terrain: laying ground down
    stroke, strokeOnce, dragBegin, dragStroke, dragEnd, dragCount,
    lineStart, lineEnd, lineCancel, lineAt,
    terrainUndo, terrainRedo, terrainSave, terrainReady, terrainCount, rebuildGround,
    // terrain: the world under the strokes
    terrainMode, terrainBase, setTerrainBase, terrainReset, resetAsked,
    get brush() {
      return { kind: brush, r: radiusOf(brush), amount: amountOf(brush), word: brushWord(brush), params: brushValues(brush), line: !!(brushRowOf(brush) && brushRowOf(brush).line) };
    },
    get terrainDepth() { return { done: strokeGroups.length, undone: strokeUndone.length }; },
    // words
    say,
    get status() { return status.slice(); },
    get lastLine() { return status.length ? status[0].text : ''; },
  };
}
