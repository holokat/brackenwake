// The dev bench. F2.
//
// 08-POLISH-CONTRACT: "gold, any item by base and rarity (identified), every
// skill to 100 or back, learn every ability, god mode (no damage), a list of
// every site within 6 km by kind with Teleport and Enter for dungeons and
// caves, spawn any monster at the cursor, time of day slider, kill target,
// heal, reset cooldowns, show colliders and chunk borders. Nothing in the dev
// bench has a second code path."
//
// That last sentence is the whole design of this file. Every button here calls
// the same function the game calls:
//
//   gold          state.earn, which is what a sale and a loot bag call
//   an item       items.makeItem, affixes.withAffixes, inventory.add, and then
//                 inventory.identify for the identified toggle
//   a teleport    player.teleport, camera.snap, state.setPos, monsters.rescan,
//                 combat.forget, in that order, which is what waking from
//                 death and arriving in a dungeon already do in main.js
//   a kill        combat.kill, so the sack drops and the dead list is written
//   a heal        combat.heal, so the green number flies
//   a skill       the character's own sheet, then ctx.recompute
//
// Nothing is previewed and nothing is simulated. A dev bench that applies a
// different thing from the game is a bench that proves nothing, which is the
// exact failure this project banned when test mode previewed story choices.
//
// ---------------------------------------------------------------------------
// The logic is separate from the DOM on purpose
// ---------------------------------------------------------------------------
// `createBench(ctx)` is every action, in node, with no document. The panel
// below is buttons that call it. win_dev.test.mjs drives the bench against a
// fake ctx, so the thing the tests exercise is the thing the buttons press.
//
// ---------------------------------------------------------------------------
// What this file needs from main.js, and what it says when it does not get it
// ---------------------------------------------------------------------------
// docs/mmo/wiring/G1.md lists the ctx fields. Where a field or a function is
// missing, the action does not pretend: it says in words what is not wired,
// and changes nothing. A silent no-op is indistinguishable from a broken
// button, and a button that claims an effect it did not have is worse.

import * as items from '../mmo/items.js';
import {
  BASES, RARITY, RARITY_ORDER, WEAPON_IDS, setOf, makeItem, baseFor,
} from '../mmo/items.js';
import { withAffixes, identify as identifyAffixes, describe as describeItemLines } from '../mmo/affixes.js';
import { METALS, METAL } from '../mmo/ores.js';
import { MONSTERS, MONSTER_LIST } from '../mmo/monsters.js';
import { ABILITIES, unlockedFor, STAT_IDS } from '../mmo/abilities.js';
import { weightsFor } from '../mmo/loot.js';
import { describeItem as sackWordsFor, rollFor } from './loot_drops.js';
import { DAY_CYCLE_MS } from './scene.js';
import { createFrameMeter } from './dev.js';
import { itemTipLines } from './inventory.js';
import { SUB_ZONES, ZONE, authoredSites } from '../world/zones.js';
import { PLACES, REALMS } from '../mmo/realms.js';

// --------------------------------------------------------------- the numbers

/** The three purses the bench hands over. */
export const GOLD_STEPS = [100, 1000, 10000];
/**
 * How far the Travel list looks, in metres. 08-POLISH-CONTRACT says 6 km; the
 * user asked for 8, and 8 km around the origin is 221 sites against 6 km's 119,
 * measured in win_dev.test.mjs. The list is capped per kind, so the extra two
 * kilometres cost one sitesNear sweep and no rows.
 */
export const PLACE_RADIUS = 8000;
/** How far outside a site's flat ground a teleport puts you, in metres. */
export const EDGE_PAD = 8;
/** How far along a wide body's own reach a landing stands, as a fraction of `bodyR`. */
export const BODY_LAND = 0.9;
/** Where a spawn lands when the cursor is not on the ground, in metres ahead. */
export const SPAWN_AHEAD_M = 6;
/** Rows kept per kind in the places list. 119 sites stand within 6 km. */
export const PLACES_PER_KIND = 12;
/** The reach of "kill all near", in metres. */
export const KILL_RADIUS = 30;
/** The ceiling a skill or a stat is driven to. */
export const MAX_SKILL = 100;
export const MAX_STAT = 100;
/** Night, the same threshold main.js hands monsters.rescan. */
export const NIGHT_BELOW = 0.4;
/** How many places the Travel section remembers. */
export const RECENT_MAX = 5;
/** Where Home is: the flat pad the world field keeps clear around the origin. */
export const HOME = { x: 0, z: 0 };

// ------------------------------------------------------------- the zone hunt
/** Metres between ring samples close in. The mesh coarsens further out. */
export const ZONE_STEP = 100;
/** How far the zone hunt will look before it gives up on a biome, in metres. */
export const ZONE_MAX_R = 24000;

// ------------------------------------------------------------- the loot lab
/** The three sample sizes the lab rolls. */
export const LOOT_COUNTS = [10, 100, 1000];
/** How many sacks "drop sacks" puts down, and the ring they land on. */
export const SACK_COUNT = 10;
export const SACK_RADIUS = 3.5;      // metres, well inside the 6 m the tests hold it to
/** How many of the rarest rolled items the lab names. */
export const RAREST_SHOWN = 20;
/** A roll that comes back empty is tried this many times before it is reported. */
export const SACK_TRIES = 12;
/** How many monsters "spawn here" puts down in one press. */
export const SPAWN_MANY = 5;

/**
 * Which base kinds carry a rarity. G7 owns the answer and may publish
 * `items.takesRarity`; until it does, these five are the rarity bearing kinds,
 * which is what `affixes.candidatesFor` already rolls against.
 */
export const RARITY_KINDS = ['weapon', 'shield', 'armour', 'jewellery', 'offhand'];

/** True when this base can be rolled above common. Asks items.js first. */
export function takesRarity(base) {
  const b = baseFor(base);
  if (!b) return false;
  if (typeof items.takesRarity === 'function') return !!items.takesRarity(b);
  return RARITY_KINDS.includes(b.kind);
}

/** Site kinds in the order the bench lists them, then anything new, sorted. */
export const KIND_ORDER = ['town', 'hamlet', 'dungeon', 'cave', 'ruin', 'shrine', 'camp'];
export const KIND_LABEL = {
  town: 'Towns', hamlet: 'Hamlets', dungeon: 'Dungeons', cave: 'Caves',
  ruin: 'Ruins', shrine: 'Shrines', camp: 'Camps',
};
/** The two kinds you can go inside. world_runtime.enterDungeon refuses the rest. */
export const ENTERABLE = ['dungeon', 'cave'];

/** The full sets the Items row hands over in one press. */
export const SETS = {
  plate: { label: 'plate set', bases: () => setOf('plate').map((b) => b.id) },
  chain: { label: 'chain set', bases: () => setOf('chain').map((b) => b.id) },
  leather: { label: 'leather set', bases: () => setOf('leather').map((b) => b.id) },
  // Fists have no slot: they are what you have when nothing is held, not a thing to carry.
  weapons: { label: 'weapon rack', bases: () => WEAPON_IDS.filter((id) => BASES[id] && BASES[id].slot) },
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const round = (v) => Math.round(num(v));
const lower = (v) => String(v == null ? '' : v).toLowerCase();
const flat = (a, b) => Math.hypot(num(a?.x) - num(b?.x), num(a?.z) - num(b?.z));

/** One line to the player. hud.log takes plain text; the bench never sends markup. */
export function say(ctx, text, kind) {
  if (!text) return text;
  const hud = ctx && ctx.hud;
  if (hud && typeof hud.log === 'function') hud.log(text, kind);
  else if (hud && typeof hud.toast === 'function') hud.toast(text, kind);
  return text;
}

// ------------------------------------------------------------------ searches

/**
 * Every base whose id or name holds the query. Empty query means all of them,
 * which is what an untouched search box shows.
 */
export function searchBases(query, opts = {}) {
  const q = lower(query).trim();
  const out = Object.values(BASES).filter((b) => !q || b.id.includes(q) || lower(b.name).includes(q));
  out.sort((a, b) => a.name.localeCompare(b.name));
  const limit = opts.limit == null ? 60 : opts.limit;
  return limit > 0 ? out.slice(0, limit) : out;
}

/** Every monster whose id or name holds the query, lowest tier first. */
export function searchMonsters(query, opts = {}) {
  const q = lower(query).trim();
  const out = MONSTER_LIST.filter((m) => !q || lower(m.id).includes(q) || lower(m.name).includes(q));
  out.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  const limit = opts.limit == null ? 60 : opts.limit;
  return limit > 0 ? out.slice(0, limit) : out;
}

// -------------------------------------------------------------------- places

/**
 * Sites gathered by kind, each group sorted by how far off it is. The kind
 * order is KIND_ORDER; a kind sitegrid.js grows later still appears, at the
 * end, rather than vanishing because this list did not know its name.
 */
export function groupSites(sites, from = { x: 0, z: 0 }) {
  const byKind = new Map();
  for (const site of sites || []) {
    if (!site) continue;
    const kind = site.kind || 'other';
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push({ site, d: flat(site, from) });
  }
  for (const rows of byKind.values()) rows.sort((a, b) => a.d - b.d || a.site.name.localeCompare(b.site.name));
  const extra = [...byKind.keys()].filter((k) => !KIND_ORDER.includes(k)).sort();
  return [...KIND_ORDER, ...extra]
    .filter((k) => byKind.has(k))
    .map((k) => ({ kind: k, label: KIND_LABEL[k] || k, rows: byKind.get(k) }));
}

/**
 * Where a teleport puts you: `pad` metres outside the site's flat ground, on
 * the side you are coming from, looking at it. Standing at the centre is no
 * direction at all, so the site's own facing is used instead.
 */
export function edgeOf(site, from, pad = EDGE_PAD) {
  const sx = num(site?.x), sz = num(site?.z);
  // A pad is what a place STANDS ON; `bodyR` is how far its stones actually
  // reach. The Standing Hedge lays no pad at all and its nine stones sit on a
  // ring 811 m out, so landing at `flatR + pad` put you eight metres from a
  // point in the middle of a mile of grass with nothing in sight. So the
  // landing is taken at nine tenths of the body's own reach, on the side the
  // player is coming from, looking in: close enough to a stone to touch it,
  // and inside the ring rather than outside it, which is where the place is.
  // `bodyR` is 0 on every site but two, so nothing else moves.
  const body = num(site?.bodyR);
  const off = body > 0 ? Math.max(num(site?.flatR) + pad, body * BODY_LAND) : num(site?.flatR) + pad;
  const dx = num(from?.x) - sx, dz = num(from?.z) - sz;
  const d = Math.hypot(dx, dz);
  const ux = d > 1e-3 ? dx / d : Math.sin(num(site?.facing));
  const uz = d > 1e-3 ? dz / d : Math.cos(num(site?.facing));
  const x = sx + ux * off, z = sz + uz * off;
  return { x, z, yaw: Math.atan2(sx - x, sz - z) };
}

// ---------------------------------------------------------------------- tour

/**
 * The order the places of one realm are visited in: the hub first, because it
 * is where a player would arrive, then the things worth looking at in the
 * order a tourist would want them, and the open country and the roads last.
 */
export const TOUR_KIND_ORDER = ['hub', 'town', 'hamlet', 'megastructure', 'landmark', 'dungeon', 'camp', 'ruin', 'shrine', 'cave', 'mine', 'wild', 'road', 'sea'];
/** Metres between ring samples when a stop's centre is water and land is wanted. */
export const TOUR_LAND_STEP = 40;

const PLACE_BY_ID = Object.fromEntries(PLACES.map((p) => [p.id, p]));
const REALM_ORDER = Object.fromEntries(REALMS.map((r, i) => [r.id, i]));
let tourCache = null;

/**
 * Every named place in the world as one ordered list of stops: realm by realm
 * in the order the sheet gives them (the heart first, the rim last), and
 * within a realm by TOUR_KIND_ORDER, then by name. A stop carries what the
 * panel and the readout need and nothing the bench has to look up again:
 * where it is, what kind of place it is, whose realm, its line, and the boss
 * if it has one. Pure and cached: the world does not move.
 */
export function tourStops() {
  if (tourCache) return tourCache;
  const stops = SUB_ZONES.map((z) => {
    const place = PLACE_BY_ID[z.id] || {};
    const realm = ZONE[z.parent] || {};
    return Object.freeze({
      id: z.id, name: z.name, kind: z.kind, x: z.x, z: z.z, r: z.r,
      realm: z.parent, realmName: realm.name || z.parent,
      line: z.line || place.geography || '',
      boss: place.boss || null, levels: place.levels || null, mechanic: place.mechanic || null,
    });
  });
  stops.sort((a, b) => (REALM_ORDER[a.realm] ?? 99) - (REALM_ORDER[b.realm] ?? 99)
    || (TOUR_KIND_ORDER.indexOf(a.kind) === -1 ? 99 : TOUR_KIND_ORDER.indexOf(a.kind)) - (TOUR_KIND_ORDER.indexOf(b.kind) === -1 ? 99 : TOUR_KIND_ORDER.indexOf(b.kind))
    || a.name.localeCompare(b.name));
  tourCache = Object.freeze(stops);
  return tourCache;
}

/**
 * Where a warp to a stop puts your feet. A stop with a built site (a town, a
 * dungeon mouth, a camp) lands you at the edge of its flat ground looking in,
 * the way the Sites list does. A stop that is only country lands you at its
 * centre, unless the centre is water, in which case the rings around it are
 * sampled outward until dry ground is found, because a "sea" stop with the
 * camera under the surface shows nothing. Pure: `field` and `sites` come in.
 */
export function landingFor(stop, field, sites = [], from = null) {
  const site = (sites || []).find((st) => st && (st.sub === stop.id || st.id === `z:${stop.id}`));
  const at = from || { x: num(stop.x) + 1, z: num(stop.z) + 1 };
  if (site) return { ...edgeOf(site, at), site, dry: true };
  const cx = num(stop.x), cz = num(stop.z);
  const wet = (x, z) => typeof field?.sampleAt === 'function' && !!field.sampleAt(x, z).water;
  if (!wet(cx, cz)) return { x: cx, z: cz, yaw: Math.atan2(num(at.x) - cx, num(at.z) - cz) + Math.PI, site: null, dry: true };
  // out to twice the place's radius: a reef stair or a bell tower in the sea
  // has its dry ground on the shore beside it, not inside its own circle
  const maxR = Math.max(num(stop.r) * 2, TOUR_LAND_STEP);
  for (let r = TOUR_LAND_STEP; r <= maxR; r += TOUR_LAND_STEP) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / TOUR_LAND_STEP));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      if (!wet(x, z)) return { x, z, yaw: Math.atan2(cx - x, cz - z), site: null, dry: true };
    }
  }
  return { x: cx, z: cz, yaw: 0, site: null, dry: false };
}

// --------------------------------------------------------------------- zones

/**
 * The nearest point of every biome the field has, found by sampling outward in
 * rings until each one has been seen.
 *
 * There is no index of biomes anywhere: `field.sampleAt` is the only thing that
 * knows what the ground is at a point, so the only honest way to find a desert
 * is to look. The rings are `ZONE_STEP` apart close in and coarsen by a tenth
 * of the radius further out, which keeps the sample count near a thousand
 * rather than the thirty thousand an even mesh would need at 12 km.
 *
 * Returns what it found, how far it had to look, and how many points it read,
 * so the panel can print the cost rather than claim it.
 */
export function zoneSearch(field, from = { x: 0, z: 0 }, opts = {}) {
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const want = (opts.biomes || field?.biomes || []).slice();
  const found = new Map();
  const fx = num(from.x), fz = num(from.z);
  const step = num(opts.step) || ZONE_STEP;
  const maxR = num(opts.maxR) || ZONE_MAX_R;
  let samples = 0, reach = 0;
  if (typeof field?.sampleAt !== 'function' || !want.length) {
    return { zones: [], missing: want, samples: 0, reach: 0, ms: 0 };
  }
  const take = (x, z) => {
    samples++;
    const b = field.sampleAt(x, z).biome;
    if (b && !found.has(b)) found.set(b, { biome: b, x, z, d: Math.hypot(x - fx, z - fz) });
  };
  take(fx, fz);
  for (let r = step, gap = step; r <= maxR && found.size < want.length; r += gap) {
    gap = Math.max(step, r / 10);
    reach = r;
    const n = Math.max(8, Math.round((2 * Math.PI * r) / gap));
    // the golden angle turn stops every ring lining up on the same eight spokes
    const spin = (r / step) * 0.618;
    for (let i = 0; i < n; i++) {
      const a = ((i + spin) / n) * Math.PI * 2;
      take(fx + Math.sin(a) * r, fz + Math.cos(a) * r);
    }
  }
  const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const zones = want.map((b) => found.get(b)).filter(Boolean).sort((a, b) => a.d - b.d);
  return {
    zones,
    missing: want.filter((b) => !found.has(b)),
    samples, reach, ms: Math.round((t1 - t0) * 10) / 10,
  };
}

// ------------------------------------------------------------------ the lab

/**
 * What a pile of rolled items came out as, against the table loot.js itself
 * computes for that tier and Luck.
 *
 * THE TWO COLUMNS ARE NOT THE SAME QUESTION, and the difference is the whole
 * reason this reads the way it does. `loot.js` rolls a rarity and then picks a
 * base off the monster's table; `items.makeItem` gives the rarity back again
 * when the base cannot carry one, because there is no such thing as a blue
 * ingot. A tier 5 monster's table is roughly half materials, so a straight
 * count of the items says "60% common" against a weight table that says no
 * common can be rolled at all, and both are telling the truth about different
 * things.
 *
 * So: `rows` counts every item, and `gearRows` counts only the ones that could
 * have taken a colour. It is `gearRows` that is comparable to the weights, and
 * it is `plain` that explains the gap. `count` is the roll count, not the item
 * count, so the six counts plus `none` always equal `count`.
 */
export function rarityTable(rolled = [], tier = 1, luck = 0, count = null) {
  const rolls = count == null ? rolled.length : count;
  const w = weightsFor(tier, luck);
  let total = 0;
  for (const x of w) total += x;
  const seen = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  const gearSeen = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  let gear = 0, plain = 0;
  for (const it of rolled) {
    if (!it || seen[it.rarity] == null) continue;
    seen[it.rarity]++;
    if (takesRarity(it.base)) { gear++; gearSeen[it.rarity]++; } else plain++;
  }
  const build = (tally, over) => RARITY_ORDER.map((r, i) => ({
    rarity: r,
    label: RARITY[r].label,
    colour: RARITY[r].colour,
    count: tally[r],
    pct: over ? (tally[r] / over) * 100 : 0,
    expected: total ? (w[i] / total) * 100 : 0,
  }));
  const rows = build(seen, rolls);
  const none = rolls - rolled.filter(Boolean).length;
  return {
    rows,
    gearRows: build(gearSeen, gear),
    gear, plain, rolls, none,
    sum: rows.reduce((n, r) => n + r.count, 0) + none,
  };
}

/** The rarest first, and within a rarity the ones with the most affixes. */
export function rarest(rolled = [], n = RAREST_SHOWN) {
  return rolled.filter(Boolean).slice().sort((a, b) => (
    RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity)
    || (b.affixes?.length || 0) - (a.affixes?.length || 0)
  )).slice(0, Math.max(0, n));
}

/** Where `n` sacks land: a ring around a point, none of them on your feet. */
export function sackRing(centre = { x: 0, z: 0 }, n = SACK_COUNT, radius = SACK_RADIUS) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    // two rings so ten sacks are not a fence you cannot see between
    const r = radius * (i % 2 ? 1 : 0.62);
    out.push({ x: num(centre.x) + Math.sin(a) * r, z: num(centre.z) + Math.cos(a) * r });
  }
  return out;
}

// --------------------------------------------------------------- the abilities

/**
 * The smallest sheet that unlocks every ability. An `anyOf` ability is met by
 * its first branch, and a `skillAny` by its first skill: one road to the door
 * is enough, and taking the first keeps the sheet from being driven up
 * everywhere for no reason.
 */
export function abilityNeeds(list = ABILITIES) {
  const skills = {}, stats = {};
  const wantSkill = (id, v) => { if (id && (!(id in skills) || skills[id] < v)) skills[id] = v; };
  const wantStat = (id, v) => { if (id && (!(id in stats) || stats[id] < v)) stats[id] = v; };
  for (const a of list) {
    if (a.anyOf && a.anyOf.length) for (const c of a.anyOf[0].all) wantSkill(c.skill, c.min);
    else if (a.skillAny && a.skillAny.length) wantSkill(a.skillAny[0], a.minSkill);
    else if (a.skill) wantSkill(a.skill, a.minSkill);
    if (a.extraReq) {
      for (const [k, v] of Object.entries(a.extraReq)) {
        if (STAT_IDS.includes(k)) wantStat(k, v); else wantSkill(k, v);
      }
    }
  }
  return { skills, stats };
}

// ------------------------------------------------------------------ the clock

/**
 * The offset that puts the day where the slider says. `t` runs 0 to 1 with 0
 * at midnight and 0.5 at noon, which is the phase scene.js's dayFactorAt is
 * built on, shifted so the slider reads like a clock.
 *
 * dayFactorAt takes ((now / cycle) + 0.12) % 1, so the offset that lands on a
 * wanted phase is (phase - 0.12) * cycle - now, wrapped into one cycle.
 */
export function clockOffsetFor(t, nowMs, cycleMs = DAY_CYCLE_MS) {
  const phase = (((num(t) + 0.5) % 1) + 1) % 1;
  const raw = (phase - 0.12) * cycleMs - num(nowMs);
  return ((raw % cycleMs) + cycleMs) % cycleMs;
}

/** The slider position as a clock, for the label. */
export function clockWords(t) {
  const hours = (((num(t) % 1) + 1) % 1) * 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- the bench

/**
 * Every action the panel can take, with no DOM anywhere. Hand it the windows
 * ctx; hand a test a fake one.
 */
export function createBench(ctx = {}) {
  // The sheets kept so "restore" has something to put back. Taken the first
  // time anything raises them, and given up the moment they are restored.
  const saved = { skills: null, stats: null };
  let seedCounter = 0x9e3779b9;
  const nextSeed = () => (seedCounter = (seedCounter * 1664525 + 1013904223) >>> 0);

  const debug = (ctx.dev && ctx.dev.debug) || ctx.debug || {};
  if (!ctx.debug) ctx.debug = debug;

  // The frame meter is the same one dev.js uses, so the bench's readout and the
  // HUD badge cannot disagree about how fast the game is running.
  const meter = createFrameMeter();
  const stat = {
    fps: 0, frameMs: 0, draws: null, tris: null,
    monsters: null, chunks: null, floaters: null, sacks: null,
  };
  /** The last few places you went, newest first. */
  const recent = [];
  /** The zone hunt is a thousand samples; it is kept until you move a long way. */
  let zoneCache = null;
  /** What the loot lab last rolled, so Give all and Inspect work on that pile. */
  let lab = null;

  const line = (text, kind) => say(ctx, text, kind);
  const bad = (text) => ({ ok: false, text: line(text, 'bad') });

  const character = () => ctx.character || (ctx.state && ctx.state.character) || null;
  const here = () => (ctx.player && ctx.player.pos) || (ctx.actor && ctx.actor.pos) || { x: 0, z: 0 };
  const nowMs = () => (typeof ctx.now === 'function' ? num(ctx.now()) : Date.now());
  const heightAt = (x, z) => (typeof ctx.runtime?.heightAt === 'function' ? num(ctx.runtime.heightAt(x, z)) : 0);
  const isNight = () => (typeof ctx.sc?.dayFactor === 'function' ? ctx.sc.dayFactor(nowMs()) < NIGHT_BELOW : false);
  const field = () => ctx.runtime?.field || null;

  /** What the ground is at a point, in one word. Underground has no biome. */
  function biomeAt(x, z) {
    if (ctx.runtime?.inDungeon) return 'underground';
    const f = field();
    if (typeof f?.biomeAt === 'function') return f.biomeAt(x, z);
    if (typeof f?.sampleAt === 'function') return f.sampleAt(x, z).biome;
    return null;
  }

  /** "meadow" or "ground the field cannot name". Never a blank. */
  const biomeWords = (x, z) => biomeAt(x, z) || 'ground the field cannot name';

  /** Remember where you went. Newest first, five kept, no duplicates in a row. */
  function remember(label, x, z) {
    const at = { label, x: round(x), z: round(z), biome: biomeAt(x, z), at: nowMs() };
    if (recent.length && recent[0].label === label && recent[0].x === at.x && recent[0].z === at.z) {
      recent[0] = at;
    } else {
      recent.unshift(at);
      recent.length = Math.min(recent.length, RECENT_MAX);
    }
    return at;
  }

  /** After a sheet changes: the pools follow the stats, the save knows, passives re-read. */
  function settle(what) {
    if (typeof ctx.recompute === 'function') ctx.recompute(ctx.actor);
    ctx.state?.touch?.(what);
    ctx.abilities?.applyPassives?.();
  }

  // ------------------------------------------------------- purse and progress

  function giveGold(n) {
    const want = Math.max(0, Math.floor(num(n)));
    if (!want) return bad('no gold was asked for, so none was given.');
    if (typeof ctx.state?.earn !== 'function') return bad('there is no purse wired up, so the gold went nowhere.');
    const got = ctx.state.earn(want);
    const purse = num(ctx.state.coins);
    return { ok: got > 0, gained: got, gold: purse, text: line(`${got} gold in. You have ${purse}.`) };
  }

  /** Take a copy of a sheet once, so restore has the real one and not a driven-up one. */
  function keep(key, sheet) {
    if (!saved[key] && sheet) saved[key] = { ...sheet };
    return saved[key];
  }

  /**
   * Drive every skill to a value. The sheet is written in place: actor.baseSkills
   * IS character.skills, and replacing the object would leave the actor reading
   * a sheet nobody writes to any more.
   */
  function setAllSkills(value = MAX_SKILL) {
    const c = character();
    if (!c || !c.skills) return bad('there is no character, so there is no sheet to teach.');
    keep('skills', c.skills);
    let changed = 0;
    for (const id of Object.keys(c.skills)) {
      if (c.skills[id] === value) continue;
      c.skills[id] = value; changed++;
    }
    settle('skills');
    return { ok: true, changed, text: line(`${changed} skills stand at ${value}. Restore puts your own sheet back.`) };
  }

  function restoreSkills() {
    const c = character();
    if (!c || !c.skills) return bad('there is no character to give a sheet back to.');
    if (!saved.skills) return bad('no sheet was kept, so there is nothing to put back.');
    let changed = 0;
    for (const id of Object.keys(c.skills)) {
      const was = num(saved.skills[id]);
      if (c.skills[id] === was) continue;
      c.skills[id] = was; changed++;
    }
    for (const id of Object.keys(saved.skills)) {
      if (id in c.skills) continue;
      c.skills[id] = saved.skills[id]; changed++;
    }
    saved.skills = null;
    settle('skills');
    return { ok: true, changed, text: line(`your own sheet is back, ${changed} skills put right.`) };
  }

  function setAllStats(value = MAX_STAT) {
    const c = character();
    if (!c || !c.stats) return bad('there is no character, so there are no stats to raise.');
    keep('stats', c.stats);
    let changed = 0;
    for (const id of Object.keys(c.stats)) {
      if (c.stats[id] === value) continue;
      c.stats[id] = value; changed++;
    }
    settle('stats');
    const a = ctx.actor;
    const pools = a ? ` Health ${round(a.maxHealth)}, mana ${round(a.maxMana)}, stamina ${round(a.maxStamina)}.` : '';
    return { ok: true, changed, text: line(`${changed} stats stand at ${value}.${pools}`) };
  }

  function restoreStats() {
    const c = character();
    if (!c || !c.stats) return bad('there is no character to give stats back to.');
    if (!saved.stats) return bad('no stats were kept, so there is nothing to put back.');
    let changed = 0;
    for (const id of Object.keys(c.stats)) {
      const was = num(saved.stats[id]);
      if (c.stats[id] === was) continue;
      c.stats[id] = was; changed++;
    }
    saved.stats = null;
    settle('stats');
    return { ok: true, changed, text: line(`your own stats are back, ${changed} put right.`) };
  }

  /**
   * Every ability on the list. There is no "known" list to write to: an ability
   * is unlocked by the sheet, so this raises exactly the skills and stats that
   * gate one and then counts what came free. The bar is not touched; what you
   * put on it is yours.
   */
  function learnAllAbilities() {
    const c = character();
    if (!c || !c.skills || !c.stats) return bad('there is no character, so there is nobody to teach.');
    const before = unlockedFor(c.skills, c.stats).length;
    const needs = abilityNeeds();
    keep('skills', c.skills);
    keep('stats', c.stats);
    for (const [id, v] of Object.entries(needs.skills)) if (num(c.skills[id]) < v) c.skills[id] = v;
    for (const [id, v] of Object.entries(needs.stats)) if (num(c.stats[id]) < v) c.stats[id] = v;
    settle('skills');
    const open = unlockedFor(c.skills, c.stats);
    const locked = ABILITIES.filter((a) => !open.includes(a));
    if (locked.length) {
      return {
        ok: false, unlocked: open.length, locked: locked.length,
        text: line(`${open.length} of ${ABILITIES.length} abilities are yours. ${locked.length} will not open: ${locked.slice(0, 3).map((a) => a.name).join(', ')}.`, 'bad'),
      };
    }
    return {
      ok: true, unlocked: open.length, gained: open.length - before, locked: 0,
      text: line(`all ${open.length} abilities are yours, ${open.length - before} of them new. Your bar is untouched; drag what you want onto it.`),
    };
  }

  /**
   * God mode, and then a real blow to see whether anything reads it. The flag
   * on its own proves nothing: combat.js has to honour `actor.godMode`, and
   * docs/mmo/wiring/G1.md carries the three lines that make it do so. Until
   * they land this says so out loud rather than promising invulnerability.
   */
  function probeGod() {
    const a = ctx.actor, combat = ctx.combat;
    if (!a || typeof combat?.hurt !== 'function' || !(num(a.health) > 1)) {
      return { honoured: null, text: 'god mode on. Nothing was struck to test it, so it is unproven.' };
    }
    const before = num(a.health);
    combat.hurt(a, 1, { quiet: true, now: nowMs() });
    const took = before - num(a.health);
    if (took > 0) {
      combat.heal?.(a, took, { quiet: true });
      return { honoured: false, text: `god mode on, but a test blow still took ${took} off. combat.js does not read actor.godMode yet; docs/mmo/wiring/G1.md has the lines.` };
    }
    return { honoured: true, text: 'god mode on. A test blow took nothing off you.' };
  }

  function toggleGod() {
    const a = ctx.actor;
    if (!a) return bad('there is no actor to make invulnerable.');
    a.godMode = !a.godMode;
    if (!a.godMode) return { ok: true, on: false, text: line('god mode off. Everything can hurt you again.') };
    const p = probeGod();
    return { ok: true, on: true, honoured: p.honoured, text: line(p.text, p.honoured === false ? 'bad' : undefined) };
  }

  function healFull() {
    const a = ctx.actor;
    if (!a) return bad('there is no actor to heal.');
    const missing = Math.max(0, num(a.maxHealth) - num(a.health));
    let healed = 0;
    if (typeof ctx.combat?.heal === 'function') healed = ctx.combat.heal(a, missing);
    else { a.health = num(a.maxHealth); healed = missing; }
    const mana = num(a.maxMana) - num(a.mana);
    const stamina = num(a.maxStamina) - num(a.stamina);
    a.mana = num(a.maxMana);
    a.stamina = num(a.maxStamina);
    return {
      ok: true, healed, mana, stamina,
      text: line(`${round(healed)} health back, ${round(mana)} mana, ${round(stamina)} stamina. You stand at ${round(a.health)} of ${round(a.maxHealth)}.`),
    };
  }

  function resetCooldowns() {
    const cds = ctx.abilities && ctx.abilities.cooldowns;
    if (!cds) return bad('the ability runtime is not wired here, so no cooldown was cleared.');
    const keys = Object.keys(cds);
    for (const k of keys) delete cds[k];
    if (!keys.length) return { ok: true, cleared: 0, text: line('nothing was cooling.') };
    return { ok: true, cleared: keys.length, text: line(`${keys.length} cooldowns cleared.`) };
  }

  // ----------------------------------------------------------------- items

  /** What a give is called in the log, before it is identified. */
  function itemWords(base, rarity, material, count) {
    const b = baseFor(base);
    const name = b ? b.name : String(base);
    const metal = material && METAL[material] ? `${METAL[material].name} ` : '';
    const word = rarity && rarity !== 'common' ? `${RARITY[rarity].label.toLowerCase()} ` : '';
    const n = count > 1 ? `${count} ` : '';
    return `${n}${word}${metal}${name}`;
  }

  /**
   * One item into the pack, the way loot does it: makeItem for the record,
   * withAffixes for anything above common, inventory.add for the pack, and
   * inventory.identify for the identified toggle. Nothing is invented at this
   * call site and nothing skips the pack's own rules, so a full pack refuses
   * this exactly as it refuses a sack.
   */
  function giveItem(spec = {}) {
    const b = baseFor(spec.base);
    if (!b) return bad(`there is no base called ${spec.base}.`);
    if (!ctx.inventory || typeof ctx.inventory.add !== 'function') return bad('there is no pack wired up, so nothing was given.');
    const rarity = RARITY_ORDER.includes(spec.rarity) ? spec.rarity : 'common';
    const count = b.stack ? Math.max(1, Math.floor(num(spec.count) || 1)) : 1;
    const seed = spec.seed == null ? nextSeed() : (num(spec.seed) >>> 0);

    let item = makeItem({ base: b.id, rarity, seed, count });
    if (rarity !== 'common') item = withAffixes(item);
    // gear_visuals.js tints metal by item.material; ores.js owns the names.
    if (spec.material && METAL[spec.material]) item.material = spec.material;

    const words = itemWords(b.id, rarity, spec.material, count);
    const res = ctx.inventory.add(item, { quiet: true });
    if (!res || !res.ok) {
      const why = res && res.reason ? res.reason : 'the pack would not take it';
      return { ok: false, item: null, reason: why, text: spec.quiet ? why : line(`${words} did not go in: ${why}`, 'bad') };
    }

    let final = item, vague = 0;
    if (spec.identified !== false && !item.identified && typeof ctx.inventory.identify === 'function') {
      // scroll: true so the bench does not lie about a line the character's INT
      // could not have read. This is inventory's own identify, not a copy of it.
      const known = ctx.inventory.identify({ pack: res.index }, { scroll: true });
      if (known && known.ok) { final = known.item; vague = known.vague || 0; }
    }
    const state = final.identified ? 'known' : 'unknown until you look at it';
    return {
      ok: true, item: final, index: res.index, vague,
      text: spec.quiet ? '' : line(`${words} into slot ${res.index + 1}, ${state}.`),
    };
  }

  /** A whole set, or every weapon, in one press. Says what did not fit. */
  function giveSet(kind, spec = {}) {
    const set = SETS[kind];
    if (!set) return bad(`there is no set called ${kind}.`);
    const ids = set.bases();
    const inCount = [];
    const refused = [];
    for (const id of ids) {
      const r = giveItem({ ...spec, base: id, count: 1, quiet: true });
      if (r.ok) inCount.push(id); else refused.push(baseFor(id)?.name || id);
    }
    if (refused.length) {
      return {
        ok: false, added: inCount.length, refused: refused.length, ids: inCount,
        text: line(`${inCount.length} of ${ids.length} of the ${set.label} went in. No room for ${refused.length}: ${refused.slice(0, 3).join(', ')}.`, 'bad'),
      };
    }
    return {
      ok: true, added: inCount.length, refused: 0, ids: inCount,
      text: line(`the ${set.label} is yours, all ${inCount.length} of it.`),
    };
  }

  // ---------------------------------------------------------------- places

  function places(radius = PLACE_RADIUS) {
    const p = here();
    const found = typeof ctx.runtime?.sitesNear === 'function' ? ctx.runtime.sitesNear(p.x, p.z, radius) : [];
    return groupSites(found, p);
  }

  /**
   * The five things a warp is, in the order main.js already does them when you
   * wake from death or arrive on a dungeon floor. The order matters: the feet
   * land first so the camera has somewhere to snap to, the document follows the
   * feet, the world is swept for what should be standing around the new spot,
   * and only then is the swing that was in the air over the old spot dropped.
   */
  /** The sentence that names the ground you are standing on. Never a blank. */
  function groundWords(x, z) {
    const b = biomeAt(x, z);
    if (b === 'underground') return 'You are underground, where the field has no biome.';
    if (!b) return 'The world field is not wired here, so the ground has no name.';
    return `The ground is ${b}.`;
  }

  function warp(x, z, opts = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return bad('that is not a place.');
    if (typeof ctx.player?.teleport !== 'function') return bad('the player cannot be moved from here: no teleport is wired.');
    // Every warp is to a place on the surface. Taken from a dungeon floor
    // without coming up first, "home" landed the player in the dungeon's field
    // at the home coordinates: a black void, 24 monsters, and no ground.
    if (ctx.runtime?.inDungeon && typeof ctx.runtime.leaveDungeon === 'function') ctx.runtime.leaveDungeon();
    ctx.player.teleport(x, z, heightAt);
    if (ctx.camera) {
      if (Number.isFinite(opts.yaw)) ctx.camera.yaw = opts.yaw;
      ctx.camera.snap?.(ctx.player.pos || { x, y: 0, z });
    }
    ctx.state?.setPos?.(x, z);
    ctx.monsters?.rescan?.(x, z, isNight());
    ctx.combat?.forget?.(ctx.actor);
    // The forage field streams around the player like the chunks do, and it is
    // told where you are once a frame from main.js. A teleport that does not
    // tell it leaves the berries a kilometre behind you until the next frame,
    // which is exactly the kind of half arrived warp this bench is for.
    ctx.forage?.update?.(x, z);
    zoneCache = null;
    if (opts.remember !== false) remember(opts.label || `${round(x)}, ${round(z)}`, x, z);
    return { ok: true, x, z, yaw: opts.yaw, biome: biomeAt(x, z) };
  }

  function teleport(site) {
    if (!site) return bad('there is no such place.');
    const from = here();
    const d = flat(site, from);
    const at = edgeOf(site, from);
    const res = warp(at.x, at.z, { yaw: at.yaw, label: site.name });
    if (!res.ok) return res;
    return {
      ...res,
      site,
      text: line(`${site.name}, ${round(d)} m off, and you are at the edge of it looking in, at ${round(at.x)}, ${round(at.z)}. ${groundWords(at.x, at.z)}`),
    };
  }

  // ------------------------------------------------------------------ zones

  /**
   * Every biome the field has, with the nearest point of each. The hunt is a
   * thousand or so samples of `field.sampleAt`, which is the only thing that
   * knows; it is kept until you warp, because it costs a few milliseconds and
   * the answer does not change while you stand still.
   */
  function zones(opts = {}) {
    const f = field();
    if (!f) {
      return { ok: false, zones: [], missing: [], samples: 0, reach: 0, text: line('there is no world field here, so there are no zones to find.', 'bad') };
    }
    const p = here();
    if (zoneCache && !opts.fresh && flat(zoneCache.from, p) < 1) return zoneCache;
    const r = zoneSearch(f, p, opts);
    const missing = r.missing.length ? ` ${r.missing.length} were not found inside ${round(ZONE_MAX_R)} m: ${r.missing.join(', ')}.` : '';
    zoneCache = {
      ok: r.missing.length === 0, ...r, from: { x: p.x, z: p.z },
      text: line(`${r.zones.length} of ${(f.biomes || []).length} biomes stand within ${round(r.reach)} m of you, found in ${r.samples} samples and ${r.ms} ms.${missing}`, r.missing.length ? 'bad' : undefined),
    };
    return zoneCache;
  }

  /** Warp to the nearest point of one biome. */
  function goToZone(biome) {
    const z = zones().zones.find((e) => e.biome === biome);
    if (!z) return bad(`no ${biome} was found within ${round(ZONE_MAX_R)} m of you.`);
    const res = warp(z.x, z.z, { label: z.biome });
    if (!res.ok) return res;
    const landed = biomeAt(z.x, z.z);
    return {
      ...res, zone: z,
      text: line(landed === biome
        ? `${biome}, ${round(z.d)} m off. You stand at ${round(z.x)}, ${round(z.z)} on ground ${round(heightAt(z.x, z.z))} m up.`
        : `you stand at ${round(z.x)}, ${round(z.z)}, which the hunt read as ${biome} and the field now reads as ${landed}.`,
        landed === biome ? undefined : 'bad'),
    };
  }

  /** Back to the pad the world field keeps flat around the origin. */
  function goHome() {
    const home = ctx.home && Number.isFinite(ctx.home.x) ? ctx.home : HOME;
    const d = flat(home, here());
    const res = warp(home.x, home.z, { label: 'home' });
    if (!res.ok) return res;
    return { ...res, text: line(`home, ${round(d)} m back the way you came, at ${round(home.x)}, ${round(home.z)}. ${groundWords(home.x, home.z)}`) };
  }

  // ------------------------------------------------------------------- tour

  /** Where the tour stands: -1 before the first stop. */
  let tourAt = -1;

  function tour() { return { stops: tourStops(), at: tourAt }; }

  /** The words a stop is announced with, so the panel and the readout agree. */
  function stopWords(stop, i, at) {
    const n = tourStops().length;
    const what = stop.kind === 'hub' ? 'the hub of' : `${stop.kind === 'megastructure' ? 'the mega structure' : stop.kind === 'wild' ? 'the open country' : 'the ' + stop.kind} of`;
    const boss = stop.boss ? ` ${stop.boss} is down there.` : '';
    const where = at.site ? 'at its edge, looking in' : (at.dry ? (at.x === stop.x && at.z === stop.z ? 'at its centre' : 'on the nearest dry ground to it') : 'on the water, since no dry ground was found near it');
    return `Stop ${i + 1} of ${n}: ${stop.name}, ${what} ${stop.realmName}. ${stop.line}${boss} You stand ${where}, at ${round(at.x)}, ${round(at.z)}.`;
  }

  /** Warp to one stop by id, and make it the tour's place. */
  function goToStop(id) {
    const stops = tourStops();
    const i = stops.findIndex((st) => st.id === id);
    if (i < 0) return bad(`no place is called ${id}.`);
    const stop = stops[i];
    const sites = typeof ctx.runtime?.sitesNear === 'function' ? ctx.runtime.sitesNear(stop.x, stop.z, Math.max(num(stop.r), 200)) : [];
    const at = landingFor(stop, field(), sites, here());
    const res = warp(at.x, at.z, { yaw: at.yaw, label: stop.name });
    if (!res.ok) return res;
    tourAt = i;
    return { ...res, stop, index: i, text: line(stopWords(stop, i, at), at.dry ? undefined : 'bad') };
  }

  /** The next stop on the tour, wrapping at the end. */
  function nextStop() {
    const n = tourStops().length;
    return goToStop(tourStops()[(tourAt + 1) % n].id);
  }

  /** The stop before, wrapping at the start. */
  function prevStop() {
    const n = tourStops().length;
    return goToStop(tourStops()[(tourAt - 1 + n) % n].id);
  }

  function enterSite(site) {
    if (!site) return bad('there is no such place.');
    if (!ENTERABLE.includes(site.kind)) return bad(`${site.name} has nothing to go into.`);
    if (typeof ctx.runtime?.enterDungeon !== 'function') return bad('nothing here knows how to go underground.');
    const t = teleport(site);
    if (!t.ok) return t;
    const d = ctx.runtime.enterDungeon(site);
    if (!d) return bad(`${site.name} would not open.`);
    // world_runtime fires onDungeonState, which main.js answers by putting the
    // feet on the entrance, snapping the camera and rescanning. It says where
    // you are, so this does not say it twice.
    return { ok: true, site, dungeon: d, text: '' };
  }

  function dungeonGo(dir) {
    if (!ctx.runtime?.inDungeon) return bad('you are not underground.');
    if (typeof ctx.runtime.dungeonGo !== 'function') return bad('there is no stair wired up.');
    const r = ctx.runtime.dungeonGo(dir);
    if (!r) return bad(dir === 'down' ? 'nothing goes deeper than this.' : 'there is no way up from here.');
    return { ok: true, result: r, text: '' };
  }

  function goTo(x, z) {
    const gx = Number(x), gz = Number(z);
    if (!Number.isFinite(gx) || !Number.isFinite(gz)) return bad('give me two numbers, an x and a z.');
    const res = warp(gx, gz, {});
    if (!res.ok) return res;
    return { ...res, text: line(`you stand at ${round(gx)}, ${round(gz)}, on ground ${round(heightAt(gx, gz))} m up. ${groundWords(gx, gz)}`) };
  }

  // -------------------------------------------------------------- monsters

  /** Six metres in front of the feet, along the way the player is facing. */
  function aheadPoint(m = SPAWN_AHEAD_M) {
    const p = here();
    const yaw = num(ctx.player?.yaw ?? ctx.actor?.yaw ?? ctx.camera?.forwardYaw);
    return { x: num(p.x) + Math.sin(yaw) * m, z: num(p.z) + Math.cos(yaw) * m };
  }

  /** Where the cursor last met the ground, if targeting has one. */
  function cursorPoint() {
    const g = ctx.targeting && ctx.targeting.lastGround;
    if (g && Number.isFinite(g.x) && Number.isFinite(g.z)) return { x: num(g.x), z: num(g.z) };
    return null;
  }

  function spawn(id, where = 'ahead') {
    const row = MONSTERS[id];
    if (!row) return bad(`nothing is called ${id}.`);
    const at = (where === 'cursor' && cursorPoint()) || aheadPoint();
    const fn = ctx.monsters && ctx.monsters.spawnAt;
    if (typeof fn !== 'function') {
      return bad(`no ${row.name} appeared: src/game/monsters.js has no spawnAt(id, x, z) yet. docs/mmo/wiring/G1.md has the one line it needs.`);
    }
    const mon = fn.call(ctx.monsters, id, at.x, at.z);
    if (!mon) return bad(`${row.name} has no body to build. Tier 0 critters live in fauna.js, not here.`);
    return {
      ok: true, monster: mon, at,
      text: line(`${row.name}, tier ${row.tier}, ${row.hp} health, stands ${round(flat(at, here()))} m off.`),
    };
  }

  /**
   * Five of them, in a ring where one would have stood, so a fight can be
   * looked at rather than a duel. Every one goes through the same spawnAt.
   */
  function spawnMany(id, n = SPAWN_MANY, where = 'ahead') {
    const row = MONSTERS[id];
    if (!row) return bad(`nothing is called ${id}.`);
    const want = Math.max(1, Math.floor(num(n)) || SPAWN_MANY);
    const fn = ctx.monsters && ctx.monsters.spawnAt;
    if (typeof fn !== 'function') {
      return bad(`no ${row.name} appeared: src/game/monsters.js has no spawnAt(id, x, z) yet. docs/mmo/wiring/G1.md has the one line it needs.`);
    }
    const at = (where === 'cursor' && cursorPoint()) || aheadPoint();
    const ring = sackRing(at, want, 3);
    const made = [];
    for (const s of ring) if (fn.call(ctx.monsters, id, s.x, s.z)) made.push(s);
    if (!made.length) return bad(`${row.name} has no body to build. Tier 0 critters live in fauna.js, not here.`);
    return {
      ok: made.length === want, spawned: made.length, at,
      text: line(made.length === want
        ? `${made.length} ${row.name}, tier ${row.tier}, ${row.hp} health each, standing ${round(flat(at, here()))} m off.`
        : `${made.length} of ${want} ${row.name} were built; the rest had no body.`,
        made.length === want ? undefined : 'bad'),
    };
  }

  /**
   * Take away everything this bench put down. `monsters.spawnAt` keys its
   * spawns `dev:<id>:<n>`, so they can be told apart from the streamer's own;
   * `despawnDev()` is the one export that can act on that, because `despawn` is
   * private to monsters.js. Until it lands this counts what is standing and
   * names the export it needs rather than killing them, which is not the same
   * thing: a kill leaves a corpse, a sack and a dead list entry.
   */
  function clearSpawned() {
    const m = ctx.monsters;
    if (!m) return bad('there is no monster runtime here.');
    if (typeof m.despawnDev === 'function') {
      const n = m.despawnDev();
      const gone = Number.isFinite(n) ? n : 0;
      return { ok: true, cleared: gone, text: line(gone ? `${gone} of the bench's monsters are gone.` : 'the bench has nothing standing.') };
    }
    const standing = typeof m.all === 'function'
      ? m.all().filter((mon) => typeof mon?.key === 'string' && mon.key.startsWith('dev:')).length
      : null;
    return bad(standing == null
      ? 'src/game/monsters.js has no despawnDev() yet, and no all() to count with. docs/mmo/wiring/U2.md has the one line it needs.'
      : `${standing} of the bench's monsters are standing and none were cleared: src/game/monsters.js has no despawnDev() yet. docs/mmo/wiring/U2.md has the one line it needs.`);
  }

  function killTarget() {
    const t = ctx.targeting && ctx.targeting.current;
    if (!t) return bad('you are not looking at anything.');
    if (typeof ctx.combat?.kill !== 'function') return bad('the resolver is not wired here, so nothing died.');
    const name = t.name || 'it';
    ctx.combat.kill(t, ctx.actor || null);
    return { ok: true, killed: t, text: line(`${name} falls.`) };
  }

  function killNear(radius = KILL_RADIUS) {
    if (typeof ctx.monsters?.actors !== 'function') return bad('nothing here can list what is alive.');
    if (typeof ctx.combat?.kill !== 'function') return bad('the resolver is not wired here, so nothing died.');
    const p = here();
    const doomed = ctx.monsters.actors().filter((a) => a && num(a.health) > 0 && flat(a.pos || a, p) <= radius);
    for (const a of doomed) ctx.combat.kill(a, ctx.actor || null);
    if (!doomed.length) return { ok: true, killed: 0, text: line(`nothing alive within ${radius} m.`) };
    return { ok: true, killed: doomed.length, text: line(`${doomed.length} down within ${radius} m.`) };
  }

  function clearAggro() {
    if (typeof ctx.monsters?.actors !== 'function') return bad('nothing here can list what is alive.');
    let n = 0;
    for (const a of ctx.monsters.actors()) {
      if (!a || !a.ai || num(a.health) <= 0) continue;
      if (!a.ai.target && a.ai.state === 'idle') continue;
      a.ai.target = null;
      a.ai.state = 'idle';
      ctx.combat?.forget?.(a);
      n++;
    }
    return { ok: true, calmed: n, text: line(n ? `${n} of them lose interest in you.` : 'nothing was interested in you.') };
  }

  // -------------------------------------------------------------- the lab

  /**
   * The monsters a roll will be made against. A single monster is itself; a
   * tier is every monster of that tier, taken in turn, so the sample covers the
   * tier's real tables rather than one representative table pretending to be
   * the tier.
   */
  function rollSubjects({ monster = null, tier = null } = {}) {
    if (monster) {
      const m = typeof monster === 'string' ? MONSTERS[monster] : monster;
      return m ? [m] : [];
    }
    if (tier == null) return [];
    return MONSTER_LIST.filter((m) => m.tier === Number(tier));
  }

  /**
   * Roll real loot, `count` times, through `loot_drops.rollFor`. That is the
   * join the game itself calls on a kill: tableFor turns the monster's words
   * into bases, loot.js shifts the rarity weights by tier and rolls the gold.
   * There is no second roller here and no second table.
   *
   * The seeds are a deterministic stream so a run can be repeated, and each
   * roll gets its own, which is what makes the counts a sample rather than one
   * answer repeated `count` times.
   */
  function rollLoot({ monster = null, tier = null, count = 100, luck = 0, seed = null } = {}) {
    const subjects = rollSubjects({ monster, tier });
    if (!subjects.length) {
      return bad(monster ? `nothing is called ${monster}.` : `no monster stands at tier ${tier}.`);
    }
    const n = Math.max(1, Math.floor(num(count)) || 1);
    const base = seed == null ? nextSeed() : (num(seed) >>> 0);
    const rolled = [];
    let gold = 0, goldLo = Infinity, goldHi = 0, empty = 0;
    for (let i = 0; i < n; i++) {
      const m = subjects[i % subjects.length];
      const r = ctx.loot && typeof ctx.loot.rollFor === 'function'
        ? ctx.loot.rollFor(m, { luck, seed: (base + i * 2654435761) >>> 0, character: character() })
        : rollFor(m, { luck, seed: (base + i * 2654435761) >>> 0, character: character() });
      gold += r.gold;
      goldLo = Math.min(goldLo, r.gold);
      goldHi = Math.max(goldHi, r.gold);
      if (!r.items.length) empty++;
      for (const it of r.items) rolled.push(it);
    }
    // The table is drawn for the tier that was rolled. A mixed tier run cannot
    // have one expected column, so the expected side is only filled in when
    // every subject shares a tier, which is every case the panel offers.
    const tiers = [...new Set(subjects.map((m) => m.tier))];
    const table = rarityTable(rolled, tiers.length === 1 ? tiers[0] : subjects[0].tier, luck, n);
    lab = {
      ok: true, rolls: n, items: rolled, table, luck,
      subjects: subjects.map((m) => m.id),
      tier: tiers.length === 1 ? tiers[0] : null, tiers,
      gold: { total: gold, low: goldLo === Infinity ? 0 : goldLo, high: goldHi, mean: Math.round(gold / n) },
      empty, seed: base,
      rarest: rarest(rolled, RAREST_SHOWN),
    };
    const who = subjects.length === 1 ? subjects[0].name : `${subjects.length} monsters of tier ${tiers.join(' and ')}`;
    const best = lab.rarest[0];
    lab.text = line(
      `${n} kills of ${who}: ${rolled.length} items, ${empty} kills with nothing, ${gold} gold between ${lab.gold.low} and ${lab.gold.high}.`
      + ` ${table.gear} of them could take a colour and ${table.plain} could not, so the plain column reads high.`
      + (best ? ` The best of them is ${sackWordsFor(best)}.` : ''),
    );
    return lab;
  }

  /** What the lab last rolled, or null. */
  const lastRoll = () => lab;

  /**
   * Ten real sacks on the ground around you, each one a real roll, put down
   * through the same `loot.drop` a kill calls. Walk to one and open it.
   *
   * A roll can come back with gold and no item, and a sack of nothing but coin
   * is not what this button is for, so each sack is re rolled up to SACK_TRIES
   * times until it has something in it. What that cost is reported, because a
   * table that needed nine tries is a table worth looking at.
   */
  function dropSacks(opts = {}) {
    const n = Math.max(1, Math.floor(num(opts.count) || SACK_COUNT));
    if (typeof ctx.loot?.drop !== 'function') return bad('there is nowhere to put a sack: ctx.loot.drop is not wired.');
    const subjects = rollSubjects(opts);
    if (!subjects.length) return bad(opts.monster ? `nothing is called ${opts.monster}.` : `no monster stands at tier ${opts.tier}.`);
    const p = here();
    const ring = sackRing(p, n, num(opts.radius) || SACK_RADIUS);
    const bags = [];
    let tries = 0, itemCount = 0, gold = 0;
    let seed = opts.seed == null ? nextSeed() : (num(opts.seed) >>> 0);
    for (let i = 0; i < n; i++) {
      const m = subjects[i % subjects.length];
      let r = null;
      for (let t = 0; t < SACK_TRIES; t++) {
        tries++;
        seed = (seed + 2654435761) >>> 0;
        r = ctx.loot.rollFor ? ctx.loot.rollFor(m, { luck: num(opts.luck), seed, character: character() }) : rollFor(m, { luck: num(opts.luck), seed, character: character() });
        if (r.items.length) break;
      }
      const at = ring[i];
      const bag = ctx.loot.drop({ x: at.x, y: heightAt(at.x, at.z), z: at.z }, { items: r.items, gold: r.gold });
      if (bag) {
        bags.push(bag);
        itemCount += r.items.length;
        gold += r.gold;
      }
    }
    const empty = n - bags.length;
    // Measured, not claimed: the farthest sack is read off where they landed.
    const far = bags.length ? Math.max(...bags.map((b) => flat(b.pos || b, p))) : 0;
    return {
      ok: bags.length === n, bags, dropped: bags.length, items: itemCount, gold, tries, farthest: far,
      text: line(
        `${bags.length} sacks on the ground, the farthest ${far.toFixed(1)} m off, ${itemCount} items and ${gold} gold between them, off ${tries} rolls.`
        + (empty ? ` ${empty} of them would not go down.` : ' Walk to one and open it.'),
        empty ? 'bad' : undefined,
      ),
    };
  }

  /**
   * One of everything the lab rolled, into the pack, through inventory.add.
   * The pack is allowed to say no and says how many times it did.
   */
  function giveAll(list = null) {
    const pile = (list || lab?.items || []).filter(Boolean);
    if (!pile.length) return bad('nothing has been rolled yet, so there is nothing to hand over.');
    if (typeof ctx.inventory?.add !== 'function') return bad('there is no pack wired up, so nothing was given.');
    let inCount = 0, refused = 0;
    for (const it of pile) {
      // A copy, so the pile the lab is still showing is not the record now in
      // the pack: two owners of one item record is how a stack gets eaten twice.
      const r = ctx.inventory.add({ ...it }, { quiet: true });
      if (r && r.ok) inCount++; else refused++;
    }
    return {
      ok: refused === 0, added: inCount, refused,
      text: line(
        refused
          ? `${inCount} of ${pile.length} went into the pack. ${refused} did not fit and are still in the lab.`
          : `all ${inCount} of them are in your pack.`,
        refused ? 'bad' : undefined,
      ),
    };
  }

  /**
   * One item's full tooltip, in its rarity colour, read out of affixes.describe
   * with the affixes rolled from the seed. Identified, because an inspector
   * that shows you "an unidentified blue longsword" inspects nothing.
   */
  function inspect(item) {
    if (!item) return { ok: false, lines: [], colour: null, text: '' };
    const known = item.identified ? item : identifyAffixes(item, 100, { scroll: true });
    return {
      ok: true,
      item: known,
      colour: (RARITY[known.rarity] || RARITY.common).colour,
      lines: describeItemLines(known),
      // the pack's own tooltip, so the bench and the bag window read alike
      tip: itemTipLines(known),
    };
  }

  // ----------------------------------------------------------------- world

  function setTimeOfDay(t) {
    const offset = clockOffsetFor(t, nowMs());
    if (typeof ctx.sc?.setClockOffset !== 'function') {
      return {
        ok: false, offset,
        text: line(`the sky has no clock to set: scene.js needs setClockOffset(ms). It is still ${clockWords(nowClock())}.`, 'bad'),
      };
    }
    ctx.sc.setClockOffset(offset);
    return { ok: true, offset, text: line(`the sky says ${clockWords(t)}.`) };
  }

  /** What the clock reads right now, as a slider position. */
  function nowClock() {
    const phase = ((num(nowMs()) / DAY_CYCLE_MS) + 0.12) % 1;
    return ((phase - 0.5) % 1 + 1) % 1;
  }

  function toggleFly() {
    if (typeof ctx.dev?.toggle !== 'function') return bad('the fly camera is not wired to this window.');
    const on = ctx.dev.toggle();
    // dev.js already toasts which way it went; saying it twice is noise.
    return { ok: true, on, text: '' };
  }

  function setDebug(key, value) {
    const on = !!value;
    if (typeof ctx.dev?.setDebug === 'function') {
      const got = ctx.dev.setDebug(key, on);
      if (got == null) return bad(`there is no debug switch called ${key}.`);
    } else debug[key] = on;
    const who = key === 'chunks'
      ? 'src/world/chunks.js has to draw the chunk grid while it is on'
      : 'the collider draw has to answer it';
    return { ok: true, on, text: line(on ? `${key} on. ${who}.` : `${key} off.`) };
  }

  /**
   * The live counts, in the shape main.js hands to hud.setDev. Every number is
   * read off the renderer or a runtime; anything that is not wired is null, and
   * never a zero this file made up. fps is a rolling second, not one frame.
   */
  function stats(dt) {
    const r = meter.push(dt);
    const info = ctx.sc?.renderer?.info;
    stat.fps = r.fps;
    stat.frameMs = r.frameMs;
    stat.draws = info ? num(info.render.calls) : null;
    stat.tris = info ? num(info.render.triangles) : null;
    stat.monsters = Number.isFinite(ctx.monsters?.count) ? ctx.monsters.count : null;
    stat.chunks = Number.isFinite(ctx.runtime?.world?.stats?.loaded) ? ctx.runtime.world.stats.loaded : null;
    stat.floaters = Number.isFinite(ctx.floaters?.count) ? ctx.floaters.count : null;
    stat.sacks = Number.isFinite(ctx.loot?.count) ? ctx.loot.count : null;
    return stat;
  }

  /** The numbers along the top. Every one is read, never guessed. */
  function readout(dt) {
    const info = ctx.sc?.renderer?.info;
    const p = here();
    const live = stats(dt);
    return {
      fps: dt > 0 ? Math.round(1 / dt) : null,
      avgFps: live.fps, frameMs: live.frameMs,
      monsters: live.monsters,
      chunks: live.chunks,
      floaters: live.floaters,
      sacks: live.sacks,
      calls: info ? num(info.render.calls) : null,
      draws: live.draws,
      tris: info ? num(info.render.triangles) : null,
      x: round(p.x), z: round(p.z), y: round(heightAt(p.x, p.z)),
      biome: biomeAt(p.x, p.z),
      inDungeon: !!ctx.runtime?.inDungeon,
      level: num(ctx.runtime?.dungeonLevel),
      gold: num(ctx.state?.coins),
      god: !!ctx.actor?.godMode,
      fly: !!ctx.dev?.on,
    };
  }

  return {
    // purse and progress
    giveGold, setAllSkills, restoreSkills, setAllStats, restoreStats,
    learnAllAbilities, toggleGod, healFull, resetCooldowns,
    // items
    giveItem, giveSet,
    // travel
    places, teleport, enterSite, dungeonGo, goTo, warp,
    tour, goToStop, nextStop, prevStop,
    zones, goToZone, goHome, biomeAt, groundWords,
    recent: () => recent.slice(),
    // the loot lab
    rollLoot, dropSacks, giveAll, inspect, lastRoll,
    // monsters
    spawn, spawnMany, clearSpawned, killTarget, killNear, clearAggro,
    // world
    setTimeOfDay, toggleFly, setDebug, readout, stats, nowClock,
    // what the panel and the tests need to look at
    debug,
    get saved() { return saved; },
    get ctx() { return ctx; },
  };
}

// ---------------------------------------------------------------------------
// The panel. Buttons, and nothing else: every one of them calls the bench.
const CSS = `
.bw-win-dev{min-width:560px}
.bw-win-dev .bw-d{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:5px 2px;border-top:1px solid #2a332a}
.bw-win-dev .bw-d .n{flex:0 0 118px;color:#cbd8c2}
.bw-win-dev .bw-d small{color:#8b9686;font-size:11.5px}
.bw-win-dev input[type=text],.bw-win-dev input[type=number]{font:inherit;font-size:12.5px;padding:3px 7px;border-radius:5px;
  border:1px solid #3f4c3b;background:#1a201a;color:#e8f0e2}
.bw-win-dev input[type=text]{width:150px}
.bw-win-dev input[type=number]{width:74px}
.bw-win-dev input[type=range]{width:170px}
.bw-win-dev select{font:inherit;font-size:12.5px;padding:3px 6px;border-radius:5px;border:1px solid #3f4c3b;background:#1a201a;color:#e8f0e2}
.bw-win-dev button{font:inherit;font-size:12px;padding:3px 9px;border-radius:6px;
  border:1px solid #4f6349;background:#2c3a2b;color:#e8f0e2;cursor:pointer}
.bw-win-dev button.on{background:#3a5030;border-color:#7c9c6c}
.bw-win-dev h3{margin:13px 0 3px;font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#8fa387}
.bw-win-dev .bw-list{max-height:190px;overflow:auto;border:1px solid #2a332a;border-radius:6px;padding:4px;width:100%}
.bw-win-dev .bw-list.tall{max-height:250px}
.bw-win-dev .bw-list .r{display:flex;align-items:center;gap:8px;padding:2px 4px;border-radius:4px}
.bw-win-dev .bw-list .r:hover{background:rgba(255,255,255,.06)}
.bw-win-dev .bw-list .r.here{background:rgba(201,167,90,.14);outline:1px solid rgba(201,167,90,.4)}
.bw-win-dev .bw-list .r .nm{flex:1 1 auto}
.bw-win-dev .bw-list .r .d{color:#95a08f;font-variant-numeric:tabular-nums}
.bw-win-dev .bw-group{color:#8fa387;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin:6px 0 2px}
.bw-win-dev .bw-read{position:sticky;top:0;z-index:2;margin:0 0 4px;padding:5px 6px;border:1px solid #2a332a;border-radius:6px;
  background:#161c16;color:#9fb096;font-variant-numeric:tabular-nums;font-size:12px;line-height:1.5}
.bw-win-dev .bw-read b{color:#dff0d4;font-weight:600}
.bw-win-dev .bw-tip{padding:4px 8px;margin:2px 0 6px;border-left:2px solid #4f6349;background:rgba(0,0,0,.25);
  border-radius:0 4px 4px 0;font-size:12px;line-height:1.45}
.bw-win-dev .bw-bar{height:7px;border-radius:3px;background:#20281f;overflow:hidden;flex:0 0 110px}
.bw-win-dev .bw-bar i{display:block;height:100%}
.bw-win-dev .bw-num{flex:0 0 62px;text-align:right;font-variant-numeric:tabular-nums;color:#c8d6c0}
.bw-win-dev .bw-exp{flex:0 0 62px;text-align:right;font-variant-numeric:tabular-nums;color:#7d8a77}
`;

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function css() {
  if (typeof document === 'undefined' || document.getElementById('bw-dev-css')) return;
  const s = document.createElement('style');
  s.id = 'bw-dev-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// The bench the open window built, for the console and the harness. windows.js
// may register a copy of the panel object, so `panel._bench` is not reliable.
let builtBench = null;
export const benchOf = () => builtBench;

/** One line of the readout: a number, or the words for why there is not one. */
const numberOr = (v, one, many) => (v == null ? `no ${many}` : `${v} ${v === 1 ? one : many}`);

export const panel = {
  id: 'dev',
  title: 'Dev bench',
  key: 'f2',

  build(root, ctx) {
    if (typeof document === 'undefined') return;
    css();
    root.classList.add('bw-win-dev');
    root.textContent = '';
    const bench = createBench(ctx);
    this._bench = bench;
    builtBench = bench;
    this._ctx = ctx;

    const row = (label, hint) => {
      const r = h('div', 'bw-d');
      const n = h('span', 'n', label);
      if (hint) n.appendChild(h('small', null, ` ${hint}`));
      r.appendChild(n);
      root.appendChild(r);
      return r;
    };
    const btn = (parent, label, fn) => {
      const b = h('button', null, label);
      b.type = 'button';
      b.addEventListener('click', () => { fn(b); });
      parent.appendChild(b);
      return b;
    };

    // --------------------------------------------------- the live readout --
    // At the top, because it is the thing you look at while you press things.
    const read = h('div', 'bw-read');
    root.appendChild(read);

    // -------------------------------------------------------------- travel --
    root.appendChild(h('h3', null, 'Travel'));

    const go = row('Go to', 'x and z');
    const gx = h('input'); gx.type = 'number'; gx.value = '0';
    const gz = h('input'); gz.type = 'number'; gz.value = '0';
    go.appendChild(gx); go.appendChild(gz);
    btn(go, 'take me there', () => { bench.goTo(gx.value, gz.value); drawRecent(); });
    btn(go, 'home', () => { bench.goHome(); drawRecent(); });
    btn(go, 'deeper', () => { bench.dungeonGo('down'); });
    btn(go, 'out', () => { bench.dungeonGo('up'); });

    // The tour: every named place in the world, realm by realm, so the zones
    // can be looked at without running or flying between them.
    const tourRow = row('Tour', `${tourStops().length} named places, realm by realm`);
    const tourList = h('div', 'bw-list tall');
    let drawTour = () => {};
    btn(tourRow, 'previous', () => { bench.prevStop(); drawTour(); drawRecent(); });
    btn(tourRow, 'next stop', () => { bench.nextStop(); drawTour(); drawRecent(); });
    const tourHere = h('span', 'd', 'nowhere on the tour yet');
    tourRow.appendChild(tourHere);
    root.appendChild(tourList);
    drawTour = () => {
      const { stops, at } = bench.tour();
      tourHere.textContent = at >= 0 ? `${at + 1} of ${stops.length}: ${stops[at].name}` : 'nowhere on the tour yet';
      tourList.textContent = '';
      let realm = null;
      stops.forEach((st, i) => {
        if (st.realm !== realm) {
          realm = st.realm;
          const rz = ZONE[realm] || {};
          tourList.appendChild(h('div', 'bw-group', `${st.realmName}${rz.danger ? ` (danger ${rz.danger[0]} to ${rz.danger[1]})` : ''}`));
        }
        const r = h('div', 'r' + (i === at ? ' here' : ''));
        r.appendChild(h('span', 'nm', st.name));
        r.appendChild(h('span', 'd', `${st.kind}${st.boss ? ', boss: ' + st.boss : ''}`));
        btn(r, 'teleport', () => { bench.goToStop(st.id); drawTour(); drawRecent(); });
        tourList.appendChild(r);
      });
      const cur = tourList.querySelector('.r.here');
      if (cur && typeof cur.scrollIntoView === 'function') cur.scrollIntoView({ block: 'nearest' });
    };
    drawTour();

    const zoneRow = row('Zones', 'the nearest of every biome');
    const zoneList = h('div', 'bw-list');
    const drawZones = (fresh) => {
      zoneList.textContent = '';
      const r = bench.zones(fresh ? { fresh: true } : {});
      if (!r.zones || !r.zones.length) {
        zoneList.appendChild(h('div', 'r', r.text || 'no biome was found'));
        return;
      }
      zoneList.appendChild(h('div', 'bw-group', `${r.zones.length} biomes, found in ${r.samples} samples out to ${Math.round(r.reach)} m`));
      for (const z of r.zones) {
        const e = h('div', 'r');
        e.appendChild(h('span', 'nm', z.biome));
        e.appendChild(h('span', 'd', `${Math.round(z.d)} m at ${Math.round(z.x)}, ${Math.round(z.z)}`));
        btn(e, 'teleport', () => { bench.goToZone(z.biome); drawRecent(); });
        zoneList.appendChild(e);
      }
      for (const b of r.missing || []) {
        const e = h('div', 'r');
        e.appendChild(h('span', 'nm', b));
        e.appendChild(h('span', 'd', 'not found out to the limit'));
        zoneList.appendChild(e);
      }
    };
    btn(zoneRow, 'look again', () => drawZones(true));
    root.appendChild(zoneList);

    const siteRow = row('Sites', `within ${PLACE_RADIUS / 1000} km of you`);
    const sites = h('div', 'bw-list tall');
    root.appendChild(sites);
    const drawPlaces = () => {
      sites.textContent = '';
      const groups = bench.places();
      if (!groups.length) { sites.appendChild(h('div', 'r', `no site within ${PLACE_RADIUS / 1000} km`)); return; }
      for (const g of groups) {
        // The list is capped so 221 sites do not become 221 rows. The header
        // says how many were kept back, because a silent truncation is a lie
        // about how many places there are.
        const shown = g.rows.slice(0, PLACES_PER_KIND);
        const head = shown.length < g.rows.length
          ? `${g.label} (the nearest ${shown.length} of ${g.rows.length})`
          : `${g.label} (${g.rows.length})`;
        sites.appendChild(h('div', 'bw-group', head));
        for (const { site, d } of shown) {
          const r = h('div', 'r');
          r.appendChild(h('span', 'nm', site.name));
          r.appendChild(h('span', 'd', `${Math.round(d)} m, ${bench.biomeAt(site.x, site.z) || 'unknown ground'}`));
          btn(r, 'teleport', () => { bench.teleport(site); drawPlaces(); drawRecent(); });
          if (ENTERABLE.includes(site.kind)) btn(r, 'enter', () => { bench.enterSite(site); drawPlaces(); drawRecent(); });
          sites.appendChild(r);
        }
      }
    };
    btn(siteRow, 'look again', drawPlaces);

    const recentRow = row('Recent', `the last ${RECENT_MAX}`);
    const recentBox = h('span', 'd', 'nowhere yet');
    recentRow.appendChild(recentBox);
    const drawRecent = () => {
      const list = bench.recent();
      recentBox.textContent = list.length
        ? list.map((e) => `${e.label} (${e.x}, ${e.z}${e.biome ? `, ${e.biome}` : ''})`).join('   ')
        : 'nowhere yet';
    };

    // ------------------------------------------------- purse and progress --
    root.appendChild(h('h3', null, 'Purse and progress'));
    const purse = row('Gold');
    for (const n of GOLD_STEPS) btn(purse, `+${n.toLocaleString('en-GB')}`, () => bench.giveGold(n));

    const sheet = row('Skills');
    btn(sheet, 'all to 100', () => bench.setAllSkills(MAX_SKILL));
    btn(sheet, 'restore mine', () => bench.restoreSkills());
    const statRow = row('Stats');
    btn(statRow, 'all to 100', () => bench.setAllStats(MAX_STAT));
    btn(statRow, 'restore mine', () => bench.restoreStats());

    const abil = row('Abilities');
    btn(abil, 'learn every one', () => bench.learnAllAbilities());
    btn(abil, 'reset cooldowns', () => bench.resetCooldowns());

    const body = row('Body');
    const godBtn = btn(body, 'god mode', () => { const r = bench.toggleGod(); godBtn.classList.toggle('on', !!r.on); });
    godBtn.classList.toggle('on', !!ctx.actor?.godMode);
    btn(body, 'heal and refill', () => bench.healFull());

    // -------------------------------------------------------------- items --
    root.appendChild(h('h3', null, 'Items'));
    const find = row('Find');
    const search = h('input');
    search.type = 'text';
    search.placeholder = 'breastplate, sword, potion';
    find.appendChild(search);

    const rarity = h('select');
    for (const r of RARITY_ORDER) rarity.appendChild(new Option(RARITY[r].label, r));
    find.appendChild(rarity);

    const metal = h('select');
    metal.appendChild(new Option('no metal', ''));
    for (const m of METALS) metal.appendChild(new Option(m.name, m.id));
    find.appendChild(metal);

    const known = btn(find, 'identified', () => { known.classList.toggle('on'); });
    known.classList.add('on');

    const count = h('input');
    count.type = 'number'; count.min = '1'; count.max = '999'; count.value = '1';
    find.appendChild(count);

    const list = h('div', 'bw-list');
    root.appendChild(list);
    const spec = () => ({
      rarity: rarity.value,
      material: metal.value || null,
      identified: known.classList.contains('on'),
      count: Math.max(1, Number(count.value) || 1),
    });
    const drawItems = () => {
      list.textContent = '';
      const found = searchBases(search.value, { limit: 40 });
      if (!found.length) { list.appendChild(h('div', 'r', 'nothing by that name')); return; }
      for (const b of found) {
        const r = h('div', 'r');
        r.appendChild(h('span', 'nm', b.name));
        // G7 decides which kinds take a rarity; a base that does not is said so
        // rather than handed over as a "rare loaf" the roller will not honour.
        r.appendChild(h('span', 'd', takesRarity(b) ? (b.slot || b.kind) : `${b.slot || b.kind}, always plain`));
        btn(r, 'give', () => bench.giveItem({ ...spec(), base: b.id }));
        list.appendChild(r);
      }
    };
    search.addEventListener('input', drawItems);
    drawItems();

    const sets = row('Full sets');
    for (const [kind, s] of Object.entries(SETS)) btn(sets, s.label, () => bench.giveSet(kind, spec()));

    // ----------------------------------------------------------- loot lab --
    // Everything here goes through loot_drops.rollFor, which is the join a kill
    // calls. There is no second roller and no sample table.
    root.appendChild(h('h3', null, 'Loot lab'));
    const subjRow = row('Roll against');
    const subjSearch = h('input');
    subjSearch.type = 'text';
    subjSearch.placeholder = 'wolf, lich, drake';
    subjRow.appendChild(subjSearch);
    const subj = h('select');
    subjRow.appendChild(subj);
    const luck = h('input');
    luck.type = 'number'; luck.min = '0'; luck.max = '100'; luck.value = '0';
    luck.title = 'Luck, which loot.js turns into +0.5% per point on every roll above common';
    subjRow.appendChild(luck);
    const drawSubjects = () => {
      const was = subj.value;
      subj.textContent = '';
      for (const t of [1, 2, 3, 4, 5, 6]) {
        const n = MONSTER_LIST.filter((m) => m.tier === t).length;
        if (n) subj.appendChild(new Option(`every tier ${t} monster (${n})`, `t:${t}`));
      }
      for (const m of searchMonsters(subjSearch.value, { limit: 40 })) {
        subj.appendChild(new Option(`${m.name}, tier ${m.tier}`, `m:${m.id}`));
      }
      if (was) subj.value = was;
      if (!subj.value) subj.selectedIndex = 0;
    };
    subjSearch.addEventListener('input', drawSubjects);
    drawSubjects();

    const pick = () => {
      const v = String(subj.value || 't:1');
      const luckN = Math.max(0, Number(luck.value) || 0);
      return v.startsWith('m:') ? { monster: v.slice(2), luck: luckN } : { tier: Number(v.slice(2)), luck: luckN };
    };

    const rollRow = row('Roll');
    for (const n of LOOT_COUNTS) btn(rollRow, `${n} kills`, () => { bench.rollLoot({ ...pick(), count: n }); drawLab(); });
    btn(rollRow, `drop ${SACK_COUNT} sacks`, () => bench.dropSacks({ ...pick(), count: SACK_COUNT }));
    btn(rollRow, 'give all', () => bench.giveAll());

    const labBox = h('div', 'bw-list tall');
    root.appendChild(labBox);
    const drawLab = () => {
      labBox.textContent = '';
      const r = bench.lastRoll();
      if (!r || !r.ok) { labBox.appendChild(h('div', 'r', 'nothing rolled yet')); return; }
      const who = r.subjects.length === 1 ? r.subjects[0] : `tier ${r.tiers.join(' and ')}, ${r.subjects.length} monsters`;
      labBox.appendChild(h('div', 'bw-group', `${r.rolls} kills of ${who}, Luck ${r.luck}`));
      const band = (rows, over) => {
        for (const line of rows) {
          const e = h('div', 'r');
          const nm = h('span', 'nm', line.label);
          nm.style.color = line.colour;
          e.appendChild(nm);
          const bar = h('div', 'bw-bar');
          const fill = h('i');
          fill.style.width = `${Math.min(100, line.pct)}%`;
          fill.style.background = line.colour;
          bar.appendChild(fill);
          e.appendChild(bar);
          e.appendChild(h('span', 'bw-num', `${line.count}  ${line.pct.toFixed(2)}%`));
          e.appendChild(h('span', 'bw-exp', `${line.expected.toFixed(2)}%`));
          labBox.appendChild(e);
        }
        return over;
      };
      // Only gear can carry a colour, so only gear is comparable to the
      // weights. Both counts are shown, and the note says why they differ.
      labBox.appendChild(h('div', 'bw-group', `of the ${r.table.gear} that can take a colour, against loot.js's own weights`));
      band(r.table.gearRows, r.table.gear);
      labBox.appendChild(h('div', 'bw-group', `of all ${r.items.length} items, ${r.table.plain} of which are materials and always plain`));
      band(r.table.rows, r.rolls);
      const foot = h('div', 'r');
      foot.appendChild(h('span', 'nm', `${r.table.sum} rolls accounted for, ${r.empty} with no item`));
      foot.appendChild(h('span', 'd', `gold ${r.gold.low} to ${r.gold.high}, ${r.gold.mean} on average`));
      labBox.appendChild(foot);

      labBox.appendChild(h('div', 'bw-group', `the ${Math.min(RAREST_SHOWN, r.rarest.length)} rarest of them`));
      for (const it of r.rarest) {
        const e = h('div', 'r');
        const nm = h('span', 'nm');
        const shown = bench.inspect(it);
        nm.textContent = shown.lines[0] || it.base;
        nm.style.color = shown.colour;
        e.appendChild(nm);
        e.appendChild(h('span', 'd', RARITY[it.rarity].label));
        const tip = h('div', 'bw-tip');
        tip.hidden = true;
        for (const l of shown.tip) {
          const p = h('div', null, l.text);
          if (l.colour) p.style.color = l.colour;
          tip.appendChild(p);
        }
        btn(e, 'inspect', () => { tip.hidden = !tip.hidden; });
        labBox.appendChild(e);
        labBox.appendChild(tip);
      }
    };
    drawLab();

    // ----------------------------------------------------------- monsters --
    root.appendChild(h('h3', null, 'Monsters'));
    const hunt = row('Find');
    const mSearch = h('input');
    mSearch.type = 'text';
    mSearch.placeholder = 'wolf, skeleton, drake';
    hunt.appendChild(mSearch);
    const where = h('select');
    where.appendChild(new Option(`${SPAWN_AHEAD_M} m ahead`, 'ahead'));
    where.appendChild(new Option('at the cursor', 'cursor'));
    hunt.appendChild(where);
    btn(hunt, 'kill target', () => bench.killTarget());
    btn(hunt, `kill all within ${KILL_RADIUS} m`, () => bench.killNear(KILL_RADIUS));
    btn(hunt, 'clear aggro', () => bench.clearAggro());
    btn(hunt, 'clear spawned', () => bench.clearSpawned());

    const mList = h('div', 'bw-list');
    root.appendChild(mList);
    const drawMonsters = () => {
      mList.textContent = '';
      const found = searchMonsters(mSearch.value, { limit: 40 });
      if (!found.length) { mList.appendChild(h('div', 'r', 'nothing by that name')); return; }
      for (const m of found) {
        const r = h('div', 'r');
        r.appendChild(h('span', 'nm', m.name));
        r.appendChild(h('span', 'd', `tier ${m.tier}, ${m.hp} hp`));
        btn(r, 'spawn', () => bench.spawn(m.id, where.value));
        btn(r, `here x${SPAWN_MANY}`, () => bench.spawnMany(m.id, SPAWN_MANY, where.value));
        mList.appendChild(r);
      }
    };
    mSearch.addEventListener('input', drawMonsters);
    drawMonsters();

    // -------------------------------------------------------------- world --
    root.appendChild(h('h3', null, 'World'));
    const clock = row('Time of day');
    const slider = h('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '0.01';
    slider.value = String(bench.nowClock().toFixed(2));
    const clockLabel = h('span', 'd', clockWords(Number(slider.value)));
    slider.addEventListener('input', () => { clockLabel.textContent = clockWords(Number(slider.value)); });
    slider.addEventListener('change', () => bench.setTimeOfDay(Number(slider.value)));
    clock.appendChild(slider);
    clock.appendChild(clockLabel);

    const view = row('View');
    const flyBtn = btn(view, 'fly (F1)', () => { bench.toggleFly(); flyBtn.classList.toggle('on', !!ctx.dev?.on); });
    flyBtn.classList.toggle('on', !!ctx.dev?.on);
    const chunkBtn = btn(view, 'chunk borders', () => {
      const r = bench.setDebug('chunks', !bench.debug.chunks);
      chunkBtn.classList.toggle('on', !!r.on);
    });
    const colBtn = btn(view, 'colliders', () => {
      const r = bench.setDebug('colliders', !bench.debug.colliders);
      colBtn.classList.toggle('on', !!r.on);
    });
    chunkBtn.classList.toggle('on', !!bench.debug.chunks);
    colBtn.classList.toggle('on', !!bench.debug.colliders);

    drawZones();
    drawPlaces();
    drawRecent();

    this._read = read;
    this._drawPlaces = drawPlaces;
    this._drawZones = drawZones;
    this._drawRecent = drawRecent;
    this._drawTour = drawTour;
    this._tourAt = -1;
    this._since = 0;
  },

  open() {
    if (this._drawPlaces) this._drawPlaces();
    if (this._drawZones) this._drawZones();
    if (this._drawRecent) this._drawRecent();
    if (this._drawTour) this._drawTour();
  },

  tick(dt) {
    if (!this._read || !this._bench) return;
    // Every frame goes into the meter, so the average is over real frames and
    // not over the four readings a second this draws.
    const r = this._bench.readout(dt);
    this._since += dt || 0;
    if (this._since < 0.25) return;
    this._since = 0;
    const bits = [
      `${r.avgFps} fps`,
      `${r.frameMs} ms`,
      r.draws == null ? 'no renderer' : `${r.draws} draws`,
      r.tris == null ? 'no triangles' : `${Math.round(r.tris / 1000)}k tris`,
      numberOr(r.monsters, 'monster', 'monsters'),
      numberOr(r.chunks, 'chunk', 'chunks'),
      numberOr(r.floaters, 'floater', 'floaters'),
      numberOr(r.sacks, 'sack', 'sacks'),
      `${r.x}, ${r.z} at ${r.y} m`,
      r.inDungeon ? `underground, level ${r.level}` : (r.biome || 'no biome'),
      `${r.gold} gold`,
    ];
    if (r.god) bits.push('god mode');
    if (r.fly) bits.push('flying');
    this._read.textContent = bits.join('   ');
    // the tour can be moved from the console or a hotkey; the row follows it
    const at = this._bench.tour ? this._bench.tour().at : -1;
    if (at !== this._tourAt) { this._tourAt = at; if (this._drawTour) this._drawTour(); }
  },
};

export default panel;
