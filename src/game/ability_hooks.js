// The four hooks `abilities_runtime.js` asks for and the game never gave it.
//
//   createAbilities({ ..., summon, allies, resurrect, utility })
//
// Without them the runtime degrades to a spoken "that is not wired yet", which
// is honest and is not a game: six summons, Resurrect, Meditate, Camp,
// Transmute and Pick Pocket all took your mana and said nothing had happened.
// This file is the wire. It is imported by `app/systems/abilities.js` and by
// `scripts/audit-abilities.mjs`, so the harness measures the same code the
// player presses and not a kinder copy of it.
//
// NO THREE AND NO DOM. Every world thing arrives as a dependency: the monsters
// container, the resolver, the pack, the rig. That is what lets the audit run
// in node against real actors.
//
// ---------------------------------------------------------------------------
// TIME
// ---------------------------------------------------------------------------
// `update(dt, nowMs, nowS)` takes three numbers because it straddles two
// clocks and pretending otherwise is how a sixty second summon lasts a
// thousandth of a second:
//
//   nowMs   the WORLD clock, in milliseconds. `combat.queueSwing` stamps its
//           blows off this and `monsters.update` walks bodies on it. A summon
//           is a body in the world, so its life, its swings and its expiry are
//           all on it. Dragon time slows a skeleton exactly as it slows a wolf.
//   nowS    the PLAYER's clock, in seconds, which is what `abilities_runtime`
//           writes into `actor.buffs[].until` and reads back in `expire`. The
//           only thing here on it is Camp's Rested buff, which has to expire
//           through the runtime's own expiry or it would never come off.
//   dt      seconds since the last frame, on the world clock.

import { ABILITIES } from '../mmo/abilities.js';
import { MONSTERS } from '../mmo/monsters.js';
import { ORES } from '../mmo/ores.js';
import { baseFor, makeItem, ORE_OF } from '../mmo/items.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2D = (a, b) => Math.hypot(num(b?.x) - num(a?.x), num(b?.z) - num(a?.z));
const alive = (a) => !!a && num(a.health) > 0 && !a.dead;

/** A number of seconds, said the way a person says it. Mirrors the runtime's. */
function saySeconds(s) {
  const v = Math.round(num(s) * 10) / 10;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} second${v === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// What a summon actually is
// ---------------------------------------------------------------------------
//
// `abilities.js` names five creatures and only three of them are rows in
// `src/mmo/monsters.js`. "imp" and "shadowHound" were never monsters at all, so
// a wire that passed the name straight to the spawner would have raised nothing
// for two of the six summons and said "Nothing answered", which is the ninth
// unlock id matching no catalog entry all over again.
//
// So the mapping is written down, and `auditSummonCreatures` runs at import and
// throws if either side drifts: a summon whose creature has no row here, or a
// row here naming a monster the roster does not have. A seventh summon added to
// the table takes this file out on import rather than shipping as a spell that
// says nothing answered.
export const SUMMON_CREATURES = {
  skeletonWarrior: { monster: 'skeletonWarrior' },
  // The necromancer's imp is the roster's Cinder Imp: small, quick, and it
  // throws fire from further back than you would, which is Summon Imp's own
  // description word for word.
  imp: { monster: 'cinderImp' },
  // The shadow hound is the roster's Bone Hound: fast, and its bite bleeds.
  shadowHound: { monster: 'boneHound' },
  boneKnight: { monster: 'boneKnight' },
  // Beast Call raises nothing. It takes what is already standing there.
  nearestWildBeast: { monster: null, wild: true },
  // Beast Call as of 2026-09-08: an animal comes to the call, and which one
  // is the caller's Animal Lore. `monster` is the floor; `bySkill` climbs.
  calledBeast: { monster: 'wolf', skill: 'animalLore', bySkill: [{ min: 0, monster: 'wolf' }, { min: 70, monster: 'boar' }, { min: 90, monster: 'direWolf' }] },
};
/** The monster a summon row stands up for this caller: the row's own, or the best its skill reaches. */
export function summonMonsterFor(row, skills = {}) {
  if (!row) return null;
  if (!Array.isArray(row.bySkill) || !row.skill) return row.monster;
  const have = Number(skills && skills[row.skill]) || 0;
  let pick = row.monster;
  for (const step of row.bySkill) if (have >= Number(step.min)) pick = step.monster;
  return pick;
}

/** Every `summon` effect in the table, creature id and all. */
export function summonCreaturesInTable(list = ABILITIES) {
  const found = new Set();
  const walk = (e) => {
    if (!e) return;
    if (e.kind === 'summon' && e.creature) found.add(e.creature);
    if (e.kind === 'combo') for (const p of e.parts) walk(p);
    if (e.applies) walk(e.applies);
  };
  for (const a of list) walk(a.effect);
  return [...found];
}

/** Both directions, and the whole list rather than the first offender. */
export function auditSummonCreatures(list = ABILITIES, table = SUMMON_CREATURES, roster = MONSTERS) {
  const bad = [];
  for (const creature of summonCreaturesInTable(list)) {
    if (!table[creature]) bad.push(`no row for the summoned creature "${creature}"`);
  }
  for (const [creature, row] of Object.entries(table)) {
    if (row.wild) continue;
    if (!row.monster) bad.push(`"${creature}" names no monster and is not marked wild`);
    else if (!roster[row.monster]) bad.push(`"${creature}" points at monster "${row.monster}", which the roster does not have`);
    for (const step of row.bySkill || []) {
      if (!roster[step.monster]) bad.push(`"${creature}" climbs to "${step.monster}" at ${row.skill} ${step.min}, which the roster does not have`);
    }
  }
  if (bad.length) {
    throw new Error(`ability_hooks: the summon table has drifted:\n  ${bad.join('\n  ')}`);
  }
  return true;
}
auditSummonCreatures();

/** How many things a caster may have standing at once. */
export const MAX_SUMMONS = 3;
/** A summon will cross this much ground for a fight, measured from its caster. */
export const SUMMON_LEASH = 22;
/** With nobody to fight it looks this far around itself for one. */
export const SUMMON_SEEK = 16;
/** It drifts this close to you when there is nothing to do. */
export const SUMMON_HEEL = 3;

/** What Beast Call is allowed to take: things that are not somebody's soldier. */
export const WILD_FAMILIES = ['beast', 'critter'];

// ---------------------------------------------------------------------------
// Meditate and Camp
// ---------------------------------------------------------------------------

/** Meditate: mana a second is the actor's own regen times this, minus its own. */
export const MEDITATE_MULT = 3;
/** Camp: a fraction of max health and stamina a second, out of a fight. */
export const CAMP_HEALTH_PER_S = 0.02;
export const CAMP_STAMINA_PER_S = 0.05;
/** How long the fire's Rested bonus lasts once the fire is built. */
export const CAMP_RESTED_S = 600;
/**
 * What Rested is worth, per second, on top of what you already regenerate.
 *
 * These are `regen` and NOT `mods`: `actor.applyEffect` has read a buff's
 * `regen` block since W1 and adds it straight into healthRegen, manaRegen and
 * staminaRegen, whereas `mods` goes through ABILITY_MODS, which has no row for
 * a regeneration key and would have dropped all three on the floor. The shape
 * the reader already knows, rather than a new one it does not.
 *
 * INVENTED: 04-CLASSES-ABILITIES says only "a rested bonus" and gives no
 * number. Half a health and half a mana a second is about a fifth of a plain
 * character's own resting rate, which is felt on a long walk and is not a
 * reason to skip a healer.
 */
export const CAMP_RESTED_REGEN = { healthRegen: 0.5, manaRegen: 0.5, staminaRegen: 1 };

// ---------------------------------------------------------------------------
// Pick Pocket
// ---------------------------------------------------------------------------

/** A purse is this hard to reach into, before Stealing is counted. */
export const STEAL_BASE = 40;
/** Stealing 100 against a difficulty 40 pocket comes out here, never above it. */
export const STEAL_MAX_CHANCE = 0.95;
export const STEAL_MIN_CHANCE = 0.05;

/** The chance a hand goes in and comes out again, 0 to 1. */
export function stealChance(stealing, difficulty = STEAL_BASE) {
  return clamp((num(stealing) - num(difficulty) + 50) / 100, STEAL_MIN_CHANCE, STEAL_MAX_CHANCE);
}

// ---------------------------------------------------------------------------
// Transmute
// ---------------------------------------------------------------------------

/** ore material id -> the material one rung up the ladder, or null at the top. */
export function nextOre(material) {
  const i = ORES.findIndex((o) => o.id === material);
  if (i < 0 || i + 1 >= ORES.length) return null;
  return ORES[i + 1];
}

// ---------------------------------------------------------------------------
// createAbilityHooks
// ---------------------------------------------------------------------------

/**
 * @param deps.character   the character document (pack, skills, gold, items)
 * @param deps.actor       the player's actor
 * @param deps.monsters    the monsters container: spawnAlly / spawnAt,
 *                         despawn, friendlies, nearestHostile, swingAt
 * @param deps.combat      the resolver, for a summon's swings
 * @param deps.inventory   the pack, for Transmute's ore and Pick Pocket's loot
 * @param deps.player      the rig, for `speed` and where the caster is standing
 * @param deps.ownerTarget () => the actor the player is fighting, or null
 * @param deps.dragon      () => the dragon's actor when it is awake, or null
 * @param deps.isDying     () => true while the death screen is up
 * @param deps.wake        () => the player system's own waking
 * @param deps.inCombat    (actor) => true while a fight is running
 */
export function createAbilityHooks(deps = {}) {
  const {
    character = {}, actor = {}, monsters = null, combat = null, inventory = null,
    hud = null, floaters = null, audio = null, player = null,
  } = deps;
  const rng = typeof deps.rng === 'function' ? deps.rng : Math.random;

  const say = (text, kind) => {
    if (!text) return text;
    if (hud?.log) hud.log(text, kind);
    else hud?.toast?.(text, kind);
    return text;
  };
  const float = (pos, text, kind) => { try { floaters?.spawn?.(pos, text, kind); } catch (err) { /* decoration */ } };
  const cue = (name) => { try { audio?.play?.(name); } catch (err) { /* never load bearing */ } };

  const pos = () => player?.pos || actor.pos || { x: 0, y: 0, z: 0 };
  const yaw = () => num(player?.yaw ?? actor.yaw);
  const moving = () => num(player?.speed) > 0.1;

  /** The list of things standing for the caster right now. */
  const summons = [];

  // ------------------------------------------------------------- the summon --

  const actorOf = (x) => (x && x.actor ? x.actor : x) || null;

  function hostileNear(at, range) {
    if (typeof monsters?.nearestHostile === 'function') {
      const found = monsters.nearestHostile(at, yaw(), range, Math.PI);
      const a = actorOf(found);
      if (alive(a) && a.faction !== 'player') return a;
      return null;
    }
    let best = null, bd = range;
    for (const a of (typeof monsters?.actors === 'function' ? monsters.actors() : [])) {
      if (!alive(a) || a.faction === 'player' || a === actor) continue;
      const d = dist2D(at, a.pos || a);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** Put one down, out loud, and give the world its body back. */
  function retire(s, why) {
    const i = summons.indexOf(s);
    if (i >= 0) summons.splice(i, 1);
    if (s.wild) {
      // A borrowed animal is not dismissed; it stops taking your side and
      // wanders off, which is what "for half a minute" was always going to mean.
      if (s.mon) monsters?.releaseAlly?.(s.mon);
      say(`${s.name} loses interest and goes back to being wild: ${why}.`, 'ability');
      return;
    }
    if (s.mon && typeof monsters?.despawn === 'function') monsters.despawn(s.mon.key);
    say(`${s.name} goes back where it came from: ${why}.`, 'ability');
  }

  /**
   * W2's spawner, with a friendly flag on it. Returns the monster record, or
   * null with the reason already said.
   */
  function summon(creature, at, meta = {}) {
    const row = SUMMON_CREATURES[creature];
    if (!row) { say(`Nothing in this world answers to "${creature}", so nothing came.`, 'bad'); return null; }
    const seconds = Math.max(1, num(meta.duration) || 30);
    const where = at || pos();

    if (row.wild) return callWild(seconds, meta);

    if (typeof monsters?.spawnAlly !== 'function' && typeof monsters?.spawnAt !== 'function') {
      say('There is no world here to raise anything in.', 'bad');
      return null;
    }
    while (summons.length >= MAX_SUMMONS) retire(summons[0], 'you called another and could not hold them all');

    const monsterId = summonMonsterFor(row, actor.skills || character.skills);
    const mon = typeof monsters.spawnAlly === 'function'
      ? monsters.spawnAlly(monsterId, num(where.x), num(where.z))
      : monsters.spawnAt(monsterId, num(where.x), num(where.z));
    if (!mon) { say(`The ground here would not give up a ${monsterId}.`, 'bad'); return null; }
    if (typeof monsters.spawnAlly !== 'function') markFriendly(mon);

    // "as strong as you are": Raise Champion's own line, and the only row that
    // asks for it. The champion's health follows the caster's rather than its
    // roster row, so a bone knight raised at Necromancy 95 is worth the 60 mana.
    if (meta.scalesWithCaster && num(actor.maxHealth) > 0) {
      const k = clamp(num(actor.maxHealth) / Math.max(1, num(mon.actor.maxHealth)), 0.5, 3);
      mon.actor.maxHealth = Math.round(num(mon.actor.maxHealth) * k);
      mon.actor.health = mon.actor.maxHealth;
    }

    const s = {
      mon, name: mon.name || row.monster, wild: false,
      until: num(meta.nowMs ?? lastMs) + seconds * 1000,
      seconds, target: null, saidTarget: null, abilityId: meta.abilityId || null,
    };
    summons.push(s);
    cue('buff');
    float(mon.actor.pos, s.name, 'gain');
    say(`${s.name} stands up beside you for ${saySeconds(seconds)}. It fights what you fight.`, 'good');
    return mon;
  }

  function markFriendly(mon) {
    if (!mon) return;
    mon.friendly = true;
    if (mon.actor) {
      mon.actor.faction = 'player';
      mon.actor.summoned = true;
      mon.actor.ai = mon.actor.ai || { home: { x: 0, z: 0 }, state: 'idle', target: null };
      mon.actor.ai.target = null;
    }
  }

  /** Beast Call: the nearest wild thing takes your side, and nothing is raised. */
  function callWild(seconds, meta = {}) {
    const list = typeof monsters?.all === 'function' ? monsters.all() : [];
    let best = null, bd = num(meta.range) || 30;
    for (const mon of list) {
      const a = mon.actor;
      if (!alive(a) || mon.friendly || a.faction === 'player') continue;
      const family = a.family || a.kind;
      const wild = WILD_FAMILIES.includes(family) || a.temperament === 'critter';
      if (!wild) continue;
      const d = dist2D(pos(), a.pos);
      if (d < bd) { bd = d; best = mon; }
    }
    if (!best) {
      say(`There is nothing wild within ${Math.round(num(meta.range) || 30)} m to call, so the call goes unanswered.`, 'bad');
      return null;
    }
    while (summons.length >= MAX_SUMMONS) retire(summons[0], 'you called another and could not hold them all');
    if (typeof monsters.makeAlly === 'function') monsters.makeAlly(best);
    else markFriendly(best);
    const s = {
      mon: best, name: best.name || 'It', wild: true,
      until: num(meta.nowMs ?? lastMs) + seconds * 1000,
      seconds, target: null, saidTarget: null, abilityId: meta.abilityId || null,
    };
    summons.push(s);
    cue('buff');
    say(`${s.name} comes to the call and takes your side for ${saySeconds(seconds)}.`, 'good');
    return best;
  }

  // ------------------------------------------------------------ the allies --

  /**
   * Everything friendly, for a buff with a radius and for the monster AI's own
   * "who else may I aggro" list. The caster is always first.
   */
  function allies() {
    const out = [actor];
    for (const a of (typeof monsters?.friendlies === 'function' ? monsters.friendlies() : [])) {
      if (alive(a) && !out.includes(a)) out.push(a);
    }
    const drake = typeof deps.dragon === 'function' ? deps.dragon() : null;
    if (alive(drake) && !out.includes(drake)) out.push(drake);
    // MP1: the other players in the room, as their mirrors here
    for (const a of (typeof deps.others === 'function' ? deps.others() || [] : [])) {
      if (alive(a) && !out.includes(a)) out.push(a);
    }
    return out;
  }

  // --------------------------------------------------------- the resurrect --

  /**
   * The player's own death code, and nothing else pretending to be it.
   *
   * WHAT THIS CAN AND CANNOT DO, said plainly. There is one player, so the
   * only bodies Resurrect can reach are the caster's own (while the death
   * screen is counting) and a fallen ally: a summon, a called beast, the
   * dragon. A dead monster is a corpse and belongs to Raise Skeleton.
   */
  function resurrect(who, caster = actor) {
    if (!who) return 'There is nobody here to raise.';
    if (who === actor) {
      if (typeof deps.isDying === 'function' && deps.isDying()) {
        if (typeof deps.wake === 'function') {
          deps.wake();
          return `You are pulled back before the count runs out, with ${Math.round(num(actor.health))} of ${Math.round(num(actor.maxHealth))}.`;
        }
        return 'You are down, and there is no waking code wired to pull you back.';
      }
      return 'You are on your feet already, so there is nothing to raise.';
    }
    if (alive(who)) return `${who.name || 'They'} never went down, so there is nothing to raise.`;
    const max = Math.max(1, num(who.maxHealth) || num(who.health) || 1);
    who.health = Math.max(1, Math.round(max * 0.5));
    who.dead = false;
    who.status = {};
    who.dots = [];
    if (who.ai) { who.ai.state = 'idle'; who.ai.target = null; }
    combat?.forget?.(who);
    float(who.pos || pos(), 'raised', 'heal');
    cue('heal');
    return `${who.name || 'They'} stands again with ${who.health} of ${max}, on ${caster === actor ? 'your' : 'their'} side.`;
  }

  // ----------------------------------------------------------- the utility --

  /** Sit still and mana comes back three times as fast, until anything happens. */
  function meditate(effect, ctx) {
    if (num(actor.mana) >= num(actor.maxMana)) {
      return 'Your mana is already full, so there is nothing to sit for.';
    }
    const mult = num(effect?.manaRegenMult) || MEDITATE_MULT;
    actor.meditating = {
      since: num(ctx?.now), manaRegenMult: mult,
      health: num(actor.health), gained: 0,
    };
    return `You sit. Mana comes back ${mult} times as fast, and anything at all ends it.`;
  }

  /** A fire, a rested bonus, and health and stamina coming back while you sit. */
  function camp(effect, ctx) {
    if (typeof deps.inCombat === 'function' && deps.inCombat(actor)) {
      return 'You are in a fight, and a fire is not built in one.';
    }
    actor.camping = {
      since: num(ctx?.now), health: num(actor.health),
      restedAt: num(ctx?.now) + 0, granted: false,
    };
    return 'The fire catches. Health and stamina come back while you sit by it, and it is safe to log out here.';
  }

  /** One stack of ore becomes the tier above it, and three tenths are lost. */
  function transmute(effect, ctx) {
    const items = character.pack?.items;
    if (!Array.isArray(items)) return 'There is no pack here to reach into.';
    let at = -1, best = null;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      const b = baseFor(it);
      if (!b || !(b.kinds || []).includes('ore')) continue;
      const count = num(it.count) || 1;
      // the biggest stack, and the lowest rung when two are the same size: a
      // spell that eats your starfall to make more starfall is not a favour
      if (!best || count > best.count || (count === best.count && num(b.tier) < num(best.tier))) {
        best = { item: it, base: b, count, tier: num(b.tier) };
        at = i;
      }
    }
    if (!best) return 'There is no ore in your pack, and Transmute changes ore.';
    const up = nextOre(best.base.material);
    if (!up) return `${best.base.name} is the last rung of the ladder, and there is nothing above it to become.`;
    const loss = clamp(num(effect?.loss) || 0.3, 0, 0.9);
    const keep = Math.floor(best.count * (1 - loss));
    if (keep < 1) {
      return `${best.count} ${best.base.name} is too small a stack to lose three tenths of and leave anything, so nothing was changed.`;
    }
    const toBase = ORE_OF[up.id];
    if (!toBase || !inventory?.remove || !inventory?.add) {
      return 'Nothing here can hold the changed ore, so the stack was left alone.';
    }
    const gone = inventory.remove({ pack: at }, best.count);
    if (!gone || gone.ok === false) return 'The ore would not come out of the pack, so nothing was changed.';
    const added = inventory.add(makeItem({ base: toBase, count: keep }));
    if (!added || added.ok === false) {
      // Put it back rather than eating it. The jam and bread failure, avoided.
      inventory.add(makeItem({ base: ORE_OF[best.base.material], count: best.count }));
      return `There was no room for ${keep} ${up.name} Ore, so your ${best.base.name} is back in the pack unchanged.`;
    }
    float(pos(), `${keep} ${up.name} Ore`, 'gain');
    cue('buff');
    return `${best.count} ${best.base.name} becomes ${keep} ${up.name} Ore. ${best.count - keep} was lost in the change.`;
  }

  /** Gold, or something common, off a humanoid that has not noticed you yet. */
  function steal(effect, ctx) {
    const t = ctx?.target;
    if (!t) return 'There is nobody in reach to have pockets.';
    const family = t.family || t.kind;
    if (effect?.from && family !== effect.from) {
      const an = family && /^[aeiou]/i.test(family) ? 'an' : 'a';
      return `${t.name || 'It'} is ${family ? `${an} ${family}` : 'not a person'}, and ${effect.from}s are the ones with pockets.`;
    }
    if (t.pickedClean) return `You have already had everything ${t.name || 'it'} was carrying.`;
    const skill = num((character.skills || {}).stealing);
    const chance = stealChance(skill, STEAL_BASE + num(t.tier) * 5);
    if (rng() >= chance) {
      t.pickedClean = false;
      if (t.ai) { t.ai.target = actor; t.ai.alerted = num(ctx?.now) * 1000; }
      cue('denied');
      float(t.pos || pos(), 'caught', 'miss');
      return `Your hand is felt. ${t.name || 'It'} turns on you, and there was ${Math.round(chance * 100)} in 100 of getting away with it.`;
    }
    t.pickedClean = true;
    const band = Array.isArray(t.gold) ? t.gold : [0, 0];
    const lo = Math.max(0, Math.round(num(band[0]))), hi = Math.max(lo, Math.round(num(band[1])));
    const coins = lo === 0 && hi === 0 ? 0 : Math.max(1, lo + Math.floor(rng() * (hi - lo + 1)));
    if (coins > 0) {
      character.gold = num(character.gold) + coins;
      float(pos(), `+${coins} gold`, 'gold');
      cue('sell');
      return `${coins} gold out of ${t.name || 'its'} purse, and it never felt a thing. You have ${character.gold}.`;
    }
    // No purse: something common instead, which is the other half of the row.
    const table = Array.isArray(t.lootTable) ? t.lootTable : [];
    const pick = table.length ? table[Math.floor(rng() * table.length)] : null;
    const baseId = typeof pick === 'string' ? pick : (pick && (pick.base || pick.id)) || null;
    if (!baseId || !baseFor(baseId) || !inventory?.add) {
      return `${t.name || 'It'} has nothing in its pockets worth the risk, and it never felt a thing.`;
    }
    const r = inventory.add(makeItem({ base: baseId }));
    if (!r || r.ok === false) return `${t.name || 'It'} had something, and your pack is too full to take it.`;
    const label = baseFor(baseId).name;
    float(pos(), label, 'loot');
    cue('sell');
    return `${label} out of ${t.name || 'its'} pockets, and it never felt a thing.`;
  }

  const utility = { transmute, steal, meditate, camp };

  // ------------------------------------------------------------- the frame --

  let lastMs = 0;
  let lastHealth = num(actor.health);

  /**
   * The summons take a step, the sitter gets their mana, the camper gets their
   * health, and everything that is over says so.
   */
  function update(dt, nowMs, nowS) {
    const d = clamp(num(dt), 0, 0.25);
    lastMs = num(nowMs);
    const t = num(nowS);

    stepSummons(d, lastMs);
    stepMeditate(d);
    stepCamp(d, t);

    lastHealth = num(actor.health);
    return summons.length;
  }

  function stepSummons(d, ms) {
    for (let i = summons.length - 1; i >= 0; i--) {
      const s = summons[i];
      const a = s.mon && s.mon.actor;
      if (!a) { summons.splice(i, 1); continue; }
      if (!alive(a)) {
        summons.splice(i, 1);
        say(`${s.name} falls, and what was holding it lets go.`, 'bad');
        continue;
      }
      if (ms >= s.until) { retire(s, 'its time is up'); continue; }

      // Who it is on. Its own quarry while that quarry lives and is close
      // enough; otherwise what you are fighting; otherwise the nearest thing
      // that would like to eat you.
      let t = s.target;
      if (!alive(t) || t.faction === 'player') t = null;
      if (t && dist2D(pos(), t.pos || t) > SUMMON_LEASH) t = null;
      if (!t && typeof deps.ownerTarget === 'function') {
        const own = actorOf(deps.ownerTarget());
        if (alive(own) && own.faction !== 'player' && own !== actor) t = own;
      }
      if (!t) t = hostileNear(a.pos, SUMMON_SEEK);
      s.target = t || null;

      // `ai.home` is what `stepMonster` drifts around when it has nothing to
      // do, so moving it is the whole of "it follows you". `ai.target` is what
      // it chases; monsters.js will not let a friendly one pick the player.
      a.ai = a.ai || { home: { x: num(a.pos.x), z: num(a.pos.z) }, state: 'idle', target: null };
      a.ai.home = a.ai.home || { x: num(a.pos.x), z: num(a.pos.z) };
      a.ai.target = t || null;
      if (!t) {
        a.ai.home.x = num(pos().x) + Math.sin(yaw() + Math.PI) * SUMMON_HEEL;
        a.ai.home.z = num(pos().z) + Math.cos(yaw() + Math.PI) * SUMMON_HEEL;
        if (s.saidTarget) { s.saidTarget = null; }
        continue;
      }
      // it fights where the fight is, so the leash is measured from you
      a.ai.home.x = num(pos().x);
      a.ai.home.z = num(pos().z);
      if (s.saidTarget !== t) {
        s.saidTarget = t;
        say(`${s.name} goes for the ${t.name || 'thing'}.`, 'good');
      }
      // The swing itself: `swingAt` is the same call the player's own blows go
      // through, so the summon pays a swing timer, a reach test and a stun the
      // way anything else does. Nothing here is a second damage formula.
      if (typeof monsters?.swingAt === 'function') monsters.swingAt(a, t, { now: ms });
      else combat?.queueSwing?.(a, t, { now: ms });
    }
  }

  function stepMeditate(d) {
    const m = actor.meditating;
    if (!m) return;
    // "broken by anything". Moving is the runtime's own line; a blow is this one.
    if (num(actor.health) < num(m.health)) {
      actor.meditating = null;
      say(`The blow breaks your meditation. ${Math.round(m.gained)} mana came back before it did.`, 'bad');
      return;
    }
    m.health = num(actor.health);
    if (moving()) return;                       // the runtime says the words
    const max = num(actor.maxMana);
    if (num(actor.mana) >= max) {
      actor.meditating = null;
      say(`Your mana is full at ${Math.round(max)}, and you get up. ${Math.round(m.gained)} came back.`, 'good');
      return;
    }
    // The multiplier is what Meditate is FOR, so only the extra is added here:
    // `tickPools` is already paying the ordinary regen every frame, and adding
    // the whole three times would have paid it four.
    const extra = num(actor.manaRegen) * (num(m.manaRegenMult) - 1) * d;
    const before = num(actor.mana);
    actor.mana = Math.min(max, before + extra);
    m.gained += actor.mana - before;
  }

  function stepCamp(d, nowS) {
    const c = actor.camping;
    if (!c) return;
    if (moving()) {
      actor.camping = null;
      say('You leave the fire, and it goes out behind you.', 'ability');
      return;
    }
    if (typeof deps.inCombat === 'function' && deps.inCombat(actor)) {
      actor.camping = null;
      say('A fight puts the fire out.', 'bad');
      return;
    }
    if (num(actor.health) < num(c.health)) {
      actor.camping = null;
      say('Something hits you, and the fire is scattered.', 'bad');
      return;
    }
    const maxH = num(actor.maxHealth), maxS = num(actor.maxStamina);
    const beforeH = num(actor.health), beforeS = num(actor.stamina);
    actor.health = Math.min(maxH, beforeH + maxH * CAMP_HEALTH_PER_S * d);
    actor.stamina = Math.min(maxS, beforeS + maxS * CAMP_STAMINA_PER_S * d);
    c.health = num(actor.health);
    if (!c.granted) {
      c.granted = true;
      actor.buffs = Array.isArray(actor.buffs) ? actor.buffs : [];
      actor.buffs = actor.buffs.filter((b) => b.abilityId !== 'camp');
      actor.buffs.push({
        id: `camp:${nowS.toFixed(3)}`, abilityId: 'camp', name: 'Rested',
        kind: 'buff', until: nowS + CAMP_RESTED_S,
        effect: { kind: 'buff', regen: { ...CAMP_RESTED_REGEN }, duration: CAMP_RESTED_S, targets: 'self' },
        mods: null, stats: null, form: null, channelled: false,
      });
      deps.recompute?.(actor);
      say(`Rested: ${CAMP_RESTED_REGEN.healthRegen} more health, ${CAMP_RESTED_REGEN.manaRegen} more mana and `
        + `${CAMP_RESTED_REGEN.staminaRegen} more stamina a second for ${Math.round(CAMP_RESTED_S / 60)} minutes.`, 'good');
    }
    if (actor.health >= maxH && actor.stamina >= maxS) {
      actor.camping = null;
      say('You are whole and rested, and you stand up from the fire.', 'good');
    }
  }

  return {
    summon, allies, resurrect, utility, update,
    /** Everything standing for you, for the HUD and for the tests. */
    get summons() { return summons; },
    /** Put them all down: a death, a teleport, a new character. */
    dismissAll(why = 'you left them behind') {
      const n = summons.length;
      while (summons.length) retire(summons[0], why);
      return n;
    },
    /** What the last frame was told, so a caller can drive one step exactly. */
    get lastMs() { return lastMs; },
    markFriendly,
  };
}
