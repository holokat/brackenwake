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

import {
  BASES, RARITY, RARITY_ORDER, WEAPON_IDS, setOf, makeItem, baseFor,
} from '../mmo/items.js';
import { withAffixes } from '../mmo/affixes.js';
import { METALS, METAL } from '../mmo/ores.js';
import { MONSTERS, MONSTER_LIST } from '../mmo/monsters.js';
import { ABILITIES, unlockedFor, STAT_IDS } from '../mmo/abilities.js';
import { DAY_CYCLE_MS } from './scene.js';

// --------------------------------------------------------------- the numbers

/** The three purses the bench hands over. */
export const GOLD_STEPS = [100, 1000, 10000];
/** 08: "every site within 6 km". Metres. */
export const PLACE_RADIUS = 6000;
/** How far outside a site's flat ground a teleport puts you, in metres. */
export const EDGE_PAD = 8;
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
  const off = num(site?.flatR) + pad;
  const dx = num(from?.x) - sx, dz = num(from?.z) - sz;
  const d = Math.hypot(dx, dz);
  const ux = d > 1e-3 ? dx / d : Math.sin(num(site?.facing));
  const uz = d > 1e-3 ? dz / d : Math.cos(num(site?.facing));
  const x = sx + ux * off, z = sz + uz * off;
  return { x, z, yaw: Math.atan2(sx - x, sz - z) };
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

  const line = (text, kind) => say(ctx, text, kind);
  const bad = (text) => ({ ok: false, text: line(text, 'bad') });

  const character = () => ctx.character || (ctx.state && ctx.state.character) || null;
  const here = () => (ctx.player && ctx.player.pos) || (ctx.actor && ctx.actor.pos) || { x: 0, z: 0 };
  const nowMs = () => (typeof ctx.now === 'function' ? num(ctx.now()) : Date.now());
  const heightAt = (x, z) => (typeof ctx.runtime?.heightAt === 'function' ? num(ctx.runtime.heightAt(x, z)) : 0);
  const isNight = () => (typeof ctx.sc?.dayFactor === 'function' ? ctx.sc.dayFactor(nowMs()) < NIGHT_BELOW : false);

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
  function warp(x, z, opts = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return bad('that is not a place.');
    if (typeof ctx.player?.teleport !== 'function') return bad('the player cannot be moved from here: no teleport is wired.');
    ctx.player.teleport(x, z, heightAt);
    if (ctx.camera) {
      if (Number.isFinite(opts.yaw)) ctx.camera.yaw = opts.yaw;
      ctx.camera.snap?.(ctx.player.pos || { x, y: 0, z });
    }
    ctx.state?.setPos?.(x, z);
    ctx.monsters?.rescan?.(x, z, isNight());
    ctx.combat?.forget?.(ctx.actor);
    return { ok: true, x, z, yaw: opts.yaw };
  }

  function teleport(site) {
    if (!site) return bad('there is no such place.');
    const from = here();
    const d = flat(site, from);
    const at = edgeOf(site, from);
    const res = warp(at.x, at.z, { yaw: at.yaw });
    if (!res.ok) return res;
    return { ...res, site, text: line(`${site.name}, ${round(d)} m off, and you are at the edge of it looking in.`) };
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
    return { ...res, text: line(`you stand at ${round(gx)}, ${round(gz)}, on ground ${round(heightAt(gx, gz))} m up.`) };
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

  /** The numbers along the bottom. Every one is read, never guessed. */
  function readout(dt) {
    const info = ctx.sc?.renderer?.info;
    const p = here();
    return {
      fps: dt > 0 ? Math.round(1 / dt) : null,
      monsters: Number.isFinite(ctx.monsters?.count) ? ctx.monsters.count : null,
      chunks: Number.isFinite(ctx.runtime?.world?.stats?.loaded) ? ctx.runtime.world.stats.loaded : null,
      calls: info ? num(info.render.calls) : null,
      tris: info ? num(info.render.triangles) : null,
      x: round(p.x), z: round(p.z), y: round(heightAt(p.x, p.z)),
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
    // places
    places, teleport, enterSite, dungeonGo, goTo, warp,
    // monsters
    spawn, killTarget, killNear, clearAggro,
    // world
    setTimeOfDay, toggleFly, setDebug, readout, nowClock,
    // what the panel and the tests need to look at
    debug,
    get saved() { return saved; },
    get ctx() { return ctx; },
  };
}

// ---------------------------------------------------------------------------
// The panel. Buttons, and nothing else: every one of them calls the bench.

const CSS = `
.bw-win-dev{min-width:520px}
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
.bw-win-dev .bw-list .r{display:flex;align-items:center;gap:8px;padding:2px 4px;border-radius:4px}
.bw-win-dev .bw-list .r:hover{background:rgba(255,255,255,.06)}
.bw-win-dev .bw-list .r .nm{flex:1 1 auto}
.bw-win-dev .bw-list .r .d{color:#95a08f;font-variant-numeric:tabular-nums}
.bw-win-dev .bw-group{color:#8fa387;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin:6px 0 2px}
.bw-win-dev .bw-read{margin-top:10px;padding-top:6px;border-top:1px solid #2a332a;color:#9fb096;
  font-variant-numeric:tabular-nums;font-size:12px}
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
        r.appendChild(h('span', 'd', b.slot || b.kind));
        btn(r, 'give', () => bench.giveItem({ ...spec(), base: b.id }));
        list.appendChild(r);
      }
    };
    search.addEventListener('input', drawItems);
    drawItems();

    const sets = row('Full sets');
    for (const [kind, s] of Object.entries(SETS)) btn(sets, s.label, () => bench.giveSet(kind, spec()));

    // ------------------------------------------------------------- places --
    root.appendChild(h('h3', null, 'Places'));
    const go = row('Go to', 'x and z');
    const gx = h('input'); gx.type = 'number'; gx.value = '0';
    const gz = h('input'); gz.type = 'number'; gz.value = '0';
    go.appendChild(gx); go.appendChild(gz);
    btn(go, 'walk me there', () => bench.goTo(gx.value, gz.value));
    btn(go, 'deeper', () => bench.dungeonGo('down'));
    btn(go, 'out', () => bench.dungeonGo('up'));

    const refresh = row('Sites', `within ${PLACE_RADIUS / 1000} km of you`);
    const sites = h('div', 'bw-list');
    root.appendChild(sites);
    const drawPlaces = () => {
      sites.textContent = '';
      const groups = bench.places();
      if (!groups.length) { sites.appendChild(h('div', 'r', `no site within ${PLACE_RADIUS / 1000} km`)); return; }
      for (const g of groups) {
        // The list is capped so 119 sites do not become 119 rows. The header
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
          r.appendChild(h('span', 'd', `${Math.round(d)} m`));
          btn(r, 'teleport', () => { bench.teleport(site); drawPlaces(); });
          if (ENTERABLE.includes(site.kind)) btn(r, 'enter', () => { bench.enterSite(site); drawPlaces(); });
          sites.appendChild(r);
        }
      }
    };
    btn(refresh, 'look again', drawPlaces);
    drawPlaces();

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

    const read = h('div', 'bw-read');
    root.appendChild(read);
    this._read = read;
    this._drawPlaces = drawPlaces;
    this._since = 0;
    this._fps = 0;
  },

  open() { if (this._drawPlaces) this._drawPlaces(); },

  tick(dt) {
    if (!this._read || !this._bench) return;
    // A one frame reading jumps around; this is the same smoothing the HUD uses.
    const f = dt > 0 ? 1 / dt : 0;
    this._fps = this._fps ? this._fps * 0.9 + f * 0.1 : f;
    this._since += dt || 0;
    if (this._since < 0.25) return;
    this._since = 0;
    const r = this._bench.readout(dt);
    const bits = [
      `${Math.round(this._fps)} fps`,
      r.monsters == null ? 'monsters not wired' : `${r.monsters} alive`,
      r.chunks == null ? 'chunks not wired' : `${r.chunks} chunks`,
      r.calls == null ? 'no renderer' : `${r.calls} draw calls`,
      `${r.x}, ${r.z} at ${r.y} m`,
      r.inDungeon ? `underground, level ${r.level}` : 'above ground',
      `${r.gold} gold`,
    ];
    if (r.god) bits.push('god mode');
    if (r.fly) bits.push('flying');
    this._read.textContent = bits.join('   ');
  },
};

export default panel;
