// Everything the editor can put down, read off the tables that already hold it.
//
// NOTHING HERE IS A LIST OF NAMES TYPED OUT AGAIN. Every tab is derived from
// the module that owns the thing, so a monster added to the roster, a species
// added to arbor, a kind added to a realm's kit or a model added to FOOTPRINT
// is in the palette the next time the page loads, with no second table to keep
// up to date. `editor.test.mjs` drives that both ways: it counts the palette
// against the source tables and fails if either grows without the other.
//
// The one judgement call is the ORDER, which is what a person scrolls through:
// things that are real models first, then stand-ins, then everything else
// alphabetically, because "which of these do we actually have" is the first
// question anybody asks of this list.

import { FOOTPRINT, STANDIN } from '../../mmo/plans/footprints.js';
import { MARKER_KINDS } from '../../mmo/plans/plan_schema.js';
import { hasProp, ROCK_KINDS, ROCK_KIND_IDS } from '../../world/plan_models.js';
import { MONSTER_LIST } from '../../mmo/monsters.js';
import { CRITTERS } from '../../world/fauna.js';
import { SPECIES } from '../../world/arbor.js';
import { NPCS } from '../../mmo/npcs.js';
import { STORY_ROLES } from '../../mmo/story.js';

export { MARKER_KINDS };

/** The tabs, in the order the panel shows them. */
export const TABS = [
  { id: 'structures', label: 'Structures', list: 'pieces' },
  { id: 'trees', label: 'Trees', list: 'trees' },
  { id: 'rocks', label: 'Rocks', list: 'rocks' },
  { id: 'monsters', label: 'Monsters', list: 'spawns' },
  { id: 'creatures', label: 'Creatures', list: 'spawns' },
  { id: 'people', label: 'People', list: 'people' },
  { id: 'markers', label: 'Markers', list: 'markers' },
  { id: 'terrain', label: 'Terrain', list: null },
];
export const TAB_IDS = TABS.map((t) => t.id);

/**
 * Every model in FOOTPRINT, marked with whether there is really a glb behind
 * it yet or whether it is still the stand-in built out of boxes.
 *
 * `has` is `plan_models.hasProp` and is asked at the moment the palette is
 * built, not at import, because a model lands in the cache when its plan
 * streams in. Pass your own to drive it in a test.
 */
export function structures(has = hasProp) {
  return Object.keys(FOOTPRINT).sort().map((id) => {
    const [w, d, h] = FOOTPRINT[id];
    const real = !!has(id);
    // `real` says whether there is a glb; `placeable` says whether it may be
    // put down. A stand-in is NOT real and IS placeable, which is the whole
    // point of stand-ins: the place is walkable before the models exist.
    return {
      id, label: id, real, placeable: true,
      hint: `${w} by ${d} by ${h} m, ${real ? 'modelled' : `stand-in (${STANDIN[id] ? STANDIN[id].body : 'none'})`}`,
    };
  }).sort((a, b) => (a.real === b.real ? a.id.localeCompare(b.id) : (a.real ? -1 : 1)));
}

/** Every monster row, tier first, so a tier 1 wolf is not below a tier 9 dragon. */
export function monsters() {
  return MONSTER_LIST.map((m) => ({
    id: m.id, label: m.name, real: true, placeable: true,
    hint: `tier ${m.tier}, ${m.hp} health${m.boss ? ', a boss' : ''}${m.temperament ? ', ' + m.temperament : ''}`,
    tier: m.tier,
  })).sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label));
}

/**
 * The tier 0 animals `fauna.js` grows.
 *
 * They are placed as SPAWNS, the same as any monster, because every critter is
 * also a monster row: `fauna.js` says so at its own top, and `monsters.spawnAt`
 * is what stands one up. A critter with no roster row is shown greyed and
 * refused, rather than written into a space that would then fail its audit.
 */
export function creatures(rows = MONSTER_LIST) {
  const byId = new Map(rows.map((m) => [m.id, m]));
  return Object.keys(CRITTERS).sort().map((id) => {
    const row = byId.get(id);
    return {
      id, label: row ? row.name : id, real: !!row, placeable: !!row,
      hint: row ? `tier ${row.tier}, lives in ${CRITTERS[id].biomes.join(', ')}` : 'no monster row, so it cannot be spawned',
    };
  });
}

/** Every species arbor.js can grow. */
export function trees() {
  return Object.keys(SPECIES).sort().map((id) => ({
    id, label: id, real: true, placeable: true,
    hint: `${SPECIES[id].h[0]} to ${SPECIES[id].h[1]} m, ${SPECIES[id].habit}${SPECIES[id].leafPer ? '' : ', bare'}`,
  }));
}

/** Every boulder and every dressing body, which is the scatter's own vocabulary. */
export function rocks() {
  return ROCK_KIND_IDS.slice().sort().map((id) => {
    const spec = ROCK_KINDS[id];
    return {
      id, label: id, real: true, placeable: true,
      hint: spec.boulder ? `a boulder, ${spec.size} m` : `${spec.size} m, built as a ${spec.build}`,
    };
  });
}

/** Every role a person may keep: the town's own, and the story's seven. */
export function people() {
  const rows = [];
  for (const [id, n] of Object.entries(NPCS)) rows.push({ id, label: n.name || id, real: true, placeable: true, hint: 'a townsperson' });
  for (const [id, r] of Object.entries(STORY_ROLES)) {
    if (!rows.some((x) => x.id === id)) rows.push({ id, label: r.name || id, real: true, placeable: true, hint: 'a role the story raises' });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

/** What a marker may be a marker for. The form's own dropdown. */
export function markers() {
  return MARKER_KINDS.map((id) => ({ id, label: id, real: true, placeable: true, hint: `a note that a ${id} belongs here` }));
}

// ---------------------------------------------------------------- terrain --
//
// THE BRUSHES ARE NOT A LIST IN THIS FILE. `window.__bw.terrain.kinds()` is the
// whole vocabulary: every kind, its label, and every knob it takes with the
// range that knob is allowed. The panel builds one row and one slider per thing
// that comes back, so a mountain whose radius reaches 600 m gets a slider that
// reaches 600 m without a line being changed here. What follows only READS that
// answer and gives every field a shape the panel can trust.
//
// The seven below are what the FIRST contract named, and they are here for one
// job only: to hold the line on `stroke()` when a terrain half answers `stroke`
// but not `kinds`. Nothing is drawn from them.

/** The seven the first terrain contract named. A guard, not a palette. */
export const BRUSHES = [
  { id: 'raise', label: 'raise', hint: 'pull the ground up under the brush' },
  { id: 'lower', label: 'lower', hint: 'push it down' },
  { id: 'flatten', label: 'flatten', hint: 'take it to the height it was where you started' },
  { id: 'smooth', label: 'smooth', hint: 'take the edges off what is there' },
  { id: 'pit', label: 'pit', hint: 'dig a hollow' },
  { id: 'cliff', label: 'cliff', hint: 'cut a step' },
  { id: 'cave', label: 'cave', hint: 'carve into the hill, which is what a mini cave is' },
];
export const BRUSH_IDS = BRUSHES.map((b) => b.id);

/** Param names that mean "how wide", in the order they are looked for. */
export const RADIUS_NAMES = ['r', 'radius', 'width'];
/** Param names that mean "how much", in the order they are looked for. */
export const AMOUNT_NAMES = ['amount', 'height', 'depth', 'lift', 'strength'];
/** Pairs of param names that mean "and the other end is here". */
export const SECOND_POINT = [['x2', 'z2'], ['tox', 'toz'], ['ex', 'ez']];
/**
 * The kinds that are one another turned over, for shift.
 *
 * A pair is only used when BOTH of them are in the live `kinds()`, so a
 * contract that drops `lower` does not leave shift pointing at a kind that is
 * not there. A kind with no pair here falls back to negating its amount, and a
 * kind that cannot do either says so rather than pretending: a plateau
 * flattens whether or not shift is down.
 */
export const OPPOSITE = {
  raise: 'lower', lower: 'raise',
  ridge: 'valley', valley: 'ridge',
  mountain: 'lake', lake: 'mountain',
  hill: 'pit', pit: 'hill',
};

const numOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The unit a param is measured in, so a slider can say "600 m" and not "600". */
export function unitFor(name) {
  const n = String(name || '').toLowerCase();
  if (ANGLE_NAMES.includes(n)) return 'degrees';
  if (RADIUS_NAMES.includes(n) || AMOUNT_NAMES.includes(n) || ['length', 'x2', 'z2', 'tox', 'toz', 'ex', 'ez', 'step', 'rise'].includes(n)) return 'm';
  return '';
}

/** Param names that mean "which way it points". */
export const ANGLE_NAMES = ['yaw', 'bearing', 'angle', 'turn'];

/**
 * Whether an angle knob is counted in radians or in degrees.
 *
 * THE RANGE IS THE ANSWER, and nothing else could be: a knob that runs 0 to
 * 6.28 is a turn in radians and one that runs 0 to 360 is a turn in degrees,
 * and the editor has no business holding an opinion about which the terrain
 * half chose. Getting this wrong sends 90 to a knob that stops at 6.28, and a
 * ridge drawn due east comes out pointing north west.
 */
export const angleUnitOf = (p) => (p && p.max > 7 ? 'degrees' : 'radians');

/**
 * One knob of one brush, with every field filled and in range.
 *
 * A param with no name is dropped rather than drawn as a nameless slider, and
 * a max below its min is pulled up to it, because a slider whose max is under
 * its min silently refuses every value the user drags to.
 */
export function brushParam(p) {
  const name = String((p && p.name) || '').trim();
  if (!name) return null;
  const min = numOr(p && p.min, 0);
  const max = Math.max(min, numOr(p && p.max, min + 1));
  const span = max - min;
  const step = Math.min(Math.max(span, 1e-6), Math.max(1e-6, Math.abs(numOr(p && p.step, span / 100 || 1))));
  const def = Math.min(max, Math.max(min, numOr(p && p.default, min)));
  const out = { name, min, max, step, default: def, unit: typeof (p && p.unit) === 'string' ? p.unit : unitFor(name) };
  if (ANGLE_NAMES.includes(name.toLowerCase())) out.unit = angleUnitOf(out);
  return out;
}

/** What a brush row says about itself when the contract sent no sentence. */
export function brushHint(params, words) {
  const bits = params.map((p) => `${p.name} ${p.min} to ${p.max}${p.unit ? ` ${p.unit}` : ''}`);
  if (words.length) bits.push(`paints ${words.join(', ')}`);
  return bits.join(', ');
}

/**
 * One row of `kinds()`, read into the shape the panel and the editor use.
 *
 * `line` is worked out and not asked for: a kind that takes a yaw AND a length,
 * or a kind that takes a second point, is drawn between two clicks. Everything
 * else is painted with a held button.
 */
export function brushRow(k) {
  const id = String((k && (k.kind || k.id)) || '').trim();
  if (!id) return null;
  const params = (Array.isArray(k.params) ? k.params : []).map(brushParam).filter(Boolean);
  const by = (list) => params.find((p) => list.includes(p.name.toLowerCase())) || null;
  const named = (n) => params.find((p) => p.name.toLowerCase() === n) || null;
  const yaw = named('yaw') || named('bearing');
  const length = named('length');
  const pairNames = SECOND_POINT.find(([a, b]) => named(a) && named(b)) || null;
  const pair = pairNames ? [named(pairNames[0]), named(pairNames[1])] : null;
  const words = Array.isArray(k && k.words) ? k.words.map((w) => String(w)).filter(Boolean) : [];
  // ED5: a row that says it erases. The terrain half's own flag, carried
  // through unchanged, because an eraser cannot be told from a sculpt brush by
  // its knobs and the editor is not in the business of knowing brushes by name.
  const erases = !!(k && k.erases);
  const said = typeof (k && k.words) === 'string' ? k.words : (typeof (k && k.hint) === 'string' ? k.hint : '');
  const byYaw = !!(yaw && length);
  return {
    id,
    label: String((k && k.label) || id),
    real: true,
    placeable: true,
    params,
    radius: by(RADIUS_NAMES),
    amount: by(AMOUNT_NAMES),
    words, erases,
    yaw, length, pair,
    line: byYaw || !!pair,
    hint: said || brushHint(params, words),
  };
}

/** Every row `kinds()` answered, in the order it answered them. */
export function brushRows(kinds) {
  if (!Array.isArray(kinds)) return [];
  const seen = new Set();
  const out = [];
  for (const k of kinds) {
    const row = brushRow(k);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

/**
 * Every tab's entries, built now.
 *
 * The Terrain tab is the one tab with nothing of its own: it is whatever
 * `kinds()` answered, handed in as `opts.kinds`. With nothing handed in it is
 * EMPTY, and the panel says why in words rather than showing seven brushes that
 * may not be there.
 */
export function paletteFor(tab, opts = {}) {
  switch (tab) {
    case 'structures': return structures(opts.has);
    case 'monsters': return monsters();
    case 'creatures': return creatures();
    case 'trees': return trees();
    case 'rocks': return rocks();
    case 'people': return people();
    case 'markers': return markers();
    case 'terrain': return brushRows(opts.kinds);
    default: return [];
  }
}

/**
 * The rows of a tab that match a search. Case blind, and it looks at the hint
 * as well as the name, so "boss" finds every boss and "stand-in" finds every
 * model still waiting to be made.
 */
export function search(entries, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => (e.id + ' ' + e.label + ' ' + (e.hint || '')).toLowerCase().includes(q));
}

/**
 * The entry a click on a palette row puts into the space, in the shape that
 * list really holds. This is the one place the editor turns a palette row into
 * a line of the space file, so what the panel writes and what the audit reads
 * cannot drift.
 */
export function entryFor(tab, id, x, z, opts = {}) {
  const yaw = Math.round(((opts.yaw ?? 0) % 360 + 360) % 360 * 100) / 100;
  const at = { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
  switch (tab) {
    case 'structures': return { list: 'pieces', entry: { model: id, ...at, yaw, ...(opts.scale && opts.scale !== 1 ? { scale: opts.scale } : {}) } };
    case 'trees': return { list: 'trees', entry: { species: id, ...at, yaw, scale: opts.scale ?? 1 } };
    case 'rocks': return { list: 'rocks', entry: { kind: id, ...at, yaw, scale: opts.scale ?? 1 } };
    case 'monsters':
    case 'creatures': return { list: 'spawns', entry: { id, ...at, ...(opts.night ? { night: true } : {}) } };
    case 'people': return { list: 'people', entry: { role: id, name: opts.name || null, ...at, yaw } };
    case 'markers': return {
      list: 'markers',
      entry: { ...at, label: opts.label || id, note: opts.note || '', kind: MARKER_KINDS.includes(id) ? id : 'other' },
    };
    default: return null;
  }
}
