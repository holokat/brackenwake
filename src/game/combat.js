// Swinging at something alive.
//
// `src/game/interact.js` owns the axe against a tree. This file owns the axe
// against a deer, and it is deliberately the same shape: one pure decision
// function, every refusal carrying a reason a toast can read, and no THREE, no
// DOM and no raycaster anywhere in it. What it needs from the world it takes
// through `fauna.hitTest`, and the only change it ever makes is the one call to
// `fauna.damage`, which is the single owner of an animal's hp and of the flee
// that follows a blow.
//
// Two rules decide the target, in this order:
//
//   1. it has to be within the weapon's reach OF THE PLAYER, because your arm
//      is the length it is wherever you are pointing;
//   2. of those, the one nearest the CURSOR wins, because with two rabbits at
//      your feet the one you are looking at is the one you meant.
//
// A swing that connects starts the cooldown; a swing at empty air does not, the
// same way a blocked chop in interact.js does not. Whiffing is free, on purpose:
// the alternative is a player locked out of hitting anything for half a second
// because they clicked the sky.

import { GOODS } from '../farm/catalog.js';

/**
 * What each tool does to something alive.
 *
 * `damage` is in hit points, against the species table in fauna.js (rabbit,
 * squirrel and gull 1, fox 2, deer 3, wolf 4), so the whole table reads as:
 *
 *   |          | rabbit | fox | deer | wolf |
 *   | hands    |   1    |  2  |  3   |  4   |   swings to a kill
 *   | pickaxe  |   1    |  1  |  2   |  2   |
 *   | axe      |   1    |  1  |  1   |  2   |
 *
 * `reach` is horizontal metres from the player, `cooldown` is milliseconds
 * between swings that land. The axe hits hardest and slowest, hands are quick
 * and nearly useless, the pickaxe sits between them and is a worse weapon than
 * the axe on purpose: it is a wedge on a stick.
 *
 * The bow is defined and NOT FIRED YET. Nothing in this file launches an arrow;
 * `resolveSwing` refuses a bow unless the caller passes `allowRanged`, which is
 * the flag whoever wires the arrow flips. Its numbers are the arrow's, not a
 * bowstave used as a club.
 */
export const WEAPONS = {
  hand:    { damage: 1, reach: 2.5, cooldown: 400, ranged: false, noun: 'your hands' },
  axe:     { damage: 3, reach: 3.2, cooldown: 650, ranged: false, noun: 'the axe' },
  pickaxe: { damage: 2, reach: 2.9, cooldown: 600, ranged: false, noun: 'the pickaxe' },
  bow:     { damage: 3, reach: 45,  cooldown: 900, ranged: true,  noun: 'the bow' },
};

/** An unknown or missing tool is a pair of hands. */
export const weaponFor = (tool) => WEAPONS[tool] || WEAPONS.hand;

/**
 * What a kill leaves. Only goods that exist in the catalog today: `venison`
 * (sells 6) off a deer, `game_meat` (sells 4) off everything else, which is
 * exactly what the farm's own rabbits and squirrels already yield. There is no
 * pelt, hide or feather in `GOODS`, so nothing here promises one.
 */
export const LOOT = {
  deer:     { good: 'venison',   n: 2 },
  wolf:     { good: 'game_meat', n: 2 },
  fox:      { good: 'game_meat', n: 1 },
  rabbit:   { good: 'game_meat', n: 1 },
  squirrel: { good: 'game_meat', n: 1 },
  gull:     { good: 'game_meat', n: 1 },
};

/**
 * What a kill gives, priced from the catalog.
 * @returns null for a species with no row, otherwise
 *   { good, n, name, sell, coins } where `coins` is what the market pays for it.
 */
export function lootFor(species) {
  const row = LOOT[species];
  if (!row) return null;
  const g = GOODS[row.good];
  if (!g) return null;
  return { good: row.good, n: row.n, name: g.name, sell: g.sell, coins: g.sell * row.n };
}

/**
 * Every loot row names a good the catalog actually sells, so a rename in the
 * catalog cannot leave a kill crediting a good that is no longer there.
 *
 * IT USED TO CHECK THE OTHER DIRECTION TOO, against `KINDS` in
 * `src/world/fauna.js`: every species that could spawn had to have a row here.
 * That table is gone. The animals of the world are tier 0 monsters now
 * (F1, docs/mmo/wiring/F1.md), they are killed through the resolver in the
 * lower half of this file, and what they drop is `MONSTERS[id].lootTable` read
 * by `loot_drops.js` and `skinning.js`. Everything above this line is the
 * farmstead's hunting knife and is now UNREACHED: `interact.js` hands it a
 * fauna object that has no `hitTest`, so `pickTarget` refuses with 'no_fauna'
 * every time and the click falls through to the monster path in
 * `app/systems/input.js`, which is where a rabbit is now clicked. It is left
 * standing rather than deleted because it is not this task's file to delete;
 * F1.md names it as the next thing to go.
 */
export function auditLootTable() {
  const bad = [];
  for (const [kind, row] of Object.entries(LOOT)) {
    if (!GOODS[row.good]) bad.push(`${kind} drops "${row.good}", which is not a catalog good`);
    if (!(row.n > 0)) bad.push(`${kind} drops ${row.n} of ${row.good}`);
  }
  if (bad.length) throw new Error(`combat: bad loot table (${bad.join('; ')})`);
  return true;
}
auditLootTable();

const dist2 = (a, b) => {
  const dx = (a.x ?? 0) - (b.x ?? 0), dz = (a.z ?? 0) - (b.z ?? 0);
  return dx * dx + dz * dz;
};
const isPoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
const isFlying = (m) => !!(m && m.userData && m.userData.fly);

/**
 * What this swing WOULD hit, changing nothing. `interact.js` asks this first so
 * it can compare the animal against the tree behind it before either is struck,
 * and `resolveSwing` then uses the same function, so the thing you were told you
 * were about to hit is the thing that gets hit.
 *
 * @returns {{ animal, dist, aimDist, reason, nearest }} with `animal` null on a
 *   refusal ('out_of_reach', 'too_high', 'ranged', 'no_fauna', 'no_position').
 */
export function pickTarget({ fauna, tool, playerPos, aimPos, allowRanged = false } = {}) {
  const w = weaponFor(tool);
  const none = (reason, nearest = null) => ({ animal: null, dist: Infinity, aimDist: Infinity, reason, nearest });
  if (!fauna || typeof fauna.hitTest !== 'function') return none('no_fauna');
  if (!isPoint(playerPos)) return none('no_position');
  if (w.ranged && !allowRanged) return none('ranged');

  const inReach = fauna.hitTest(playerPos.x, playerPos.z, w.reach);
  if (!inReach.length) {
    // how far off the nearest living thing is, so a miss can say so rather than
    // leaving the player guessing whether the swing even happened
    const near = fauna.hitTest(playerPos.x, playerPos.z, w.reach * 6)[0] || null;
    return none('out_of_reach', near ? Math.hypot(near.position.x - playerPos.x, near.position.z - playerPos.z) : null);
  }
  // a swing cannot reach a bird on the wing. An arrow can, when it exists.
  const swingable = w.ranged ? inReach : inReach.filter((m) => !isFlying(m));
  if (!swingable.length) return none('too_high', 0);

  // hitTest is sorted by distance from the player already, and Array.sort is
  // stable, so sorting by distance from the cursor breaks its own ties on
  // "nearer to you", which is the right answer when the cursor cannot decide.
  const aim = isPoint(aimPos) ? aimPos : playerPos;
  const animal = swingable.slice().sort((a, b) => dist2(a.position, aim) - dist2(b.position, aim))[0];
  return {
    animal,
    dist: Math.hypot(animal.position.x - playerPos.x, animal.position.z - playerPos.z),
    aimDist: Math.sqrt(dist2(animal.position, aim)),
    reason: 'target', nearest: null,
  };
}

/**
 * Swing whatever is in hand at whatever is in front of you.
 *
 * @param fauna        the object from createFauna (hitTest and damage)
 * @param tool         'hand' | 'axe' | 'pickaxe' | 'bow'
 * @param playerPos    { x, z } where you are standing
 * @param aimPos       { x, z } where the cursor points, or null for straight ahead
 * @param now          ms
 * @param lastSwingAt  ms of the last swing that LANDED
 * @param allowRanged  let the bow resolve at its own reach (not wired yet)
 *
 * @returns {{ hit, animal, damage, killed, reason, ... }}
 *   reasons: 'killed' | 'wounded' on a hit; 'cooldown', 'out_of_reach',
 *   'too_high', 'ranged', 'no_fauna', 'no_position', 'gone' on a refusal.
 *   A refusal never touches an animal and never starts the cooldown.
 */
export function resolveSwing({ fauna, tool, playerPos, aimPos, now, lastSwingAt, allowRanged = false } = {}) {
  const w = weaponFor(tool);
  const name = WEAPONS[tool] ? tool : 'hand';
  const t = Number.isFinite(now) ? now : 0;
  const miss = (reason, extra = {}) => ({
    hit: false, animal: null, damage: 0, killed: false, reason,
    tool: name, weapon: w, loot: null, ...extra,
  });

  if (!fauna || typeof fauna.hitTest !== 'function' || typeof fauna.damage !== 'function') return miss('no_fauna');
  if (!isPoint(playerPos)) return miss('no_position');
  if (Number.isFinite(lastSwingAt) && t - lastSwingAt < w.cooldown) {
    return miss('cooldown', { wait: Math.max(0, w.cooldown - (t - lastSwingAt)) });
  }
  if (w.ranged && !allowRanged) return miss('ranged');

  const target = pickTarget({ fauna, tool, playerPos, aimPos, allowRanged });
  if (!target.animal) return miss(target.reason, { nearest: target.nearest });
  const { animal } = target;

  const res = fauna.damage(animal, w.damage, playerPos.x, playerPos.z, t);
  if (!res) return miss('gone');

  return {
    hit: true,
    animal,
    damage: res.damage,
    killed: res.killed,
    reason: res.killed ? 'killed' : 'wounded',
    kind: res.kind,
    hp: res.hp,
    hpMax: res.hpMax,
    tool: name,
    weapon: w,
    dist: target.dist,
    aimDist: target.aimDist,
    loot: res.killed ? lootFor(res.kind) : null,
  };
}

/** "2 venison". Say it only after the pack (or the purse) has really taken it. */
export function lootText(loot) {
  if (!loot) return '';
  return `${loot.n} ${loot.name.toLowerCase()}`;
}

/** "a deer", "an ox". Same rule interact.js uses for a boulder. */
export const anA = (noun) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;

/** What to call a species on screen. */
export const NAMES = { deer: 'deer', rabbit: 'rabbit', squirrel: 'squirrel', fox: 'fox', wolf: 'wolf', gull: 'gull' };
export const nameFor = (kind) => NAMES[kind] || 'animal';

/**
 * The line a swing earns. Every branch says something, including the ones that
 * changed nothing, because a silent swing and a broken button look the same.
 * `interact.js` passes this straight to `hud.toast`.
 */
export function swingText(res) {
  if (!res) return '';
  const noun = nameFor(res.kind);
  switch (res.reason) {
    case 'killed':
      // the deed only. What the kill LEAVES is `lootText`, and it belongs to
      // whoever actually put it in the pack: a line promising two venison over a
      // pack that gained nothing is the silent-effect bug wearing a hat.
      return `the ${noun} goes down`;
    case 'wounded':
      return `${res.weapon.noun} lands on the ${noun}, and it runs`;
    case 'out_of_reach':
      return res.nearest != null
        ? `you swing at nothing, the nearest of them is ${Math.round(res.nearest)} m off`
        : 'you swing at nothing';
    case 'too_high':
      return 'the gulls are well out of reach up there';
    case 'ranged':
      return 'a bow is for shooting, not for clubbing, take out a hand or an axe';
    case 'cooldown':
    case 'no_fauna':
    case 'no_position':
    case 'gone':
    default:
      return '';
  }
}

// ===========================================================================
// The MMO resolver's runtime half.
//
// Everything above this line is the hunting knife against a deer, and it stays
// exactly as it was: `interact.js` calls `pickTarget`, `resolveSwing` and
// `swingText` and gets the same answers it has always got. Everything below is
// the other combat, the one where the thing you swing at swings back.
//
// The arithmetic is not here. It is in `src/mmo/combat_rules.js`, which is pure
// and finished, and this file never re-derives a number that module already
// knows: it queues a swing, waits for the blow to land, hands the result to the
// actors, the floaters and the progression, and says so.
//
// The six things it owns, and nothing else owns:
//
//   1. TIME. `queueSwing` starts the cooldown; the blow lands SWING_LAND_S
//      later so the number arrives with the animation and not before it.
//   2. THE WRITE. `resolveMelee` mutates nothing; this is the only place that
//      takes health off a defender, stamina off an attacker, and puts leeched
//      health and mana back.
//   3. STATUS. Poison and bleed tick here, once a second, through
//      `poisonTick`, and expire here.
//   4. WORDS. Every `numbers` entry the rules emit becomes a floater over the
//      right head, and `damage` becomes `taken` when the head is the player's.
//   5. DEATH. One place decides a thing is dead, sets 'die', and tells whoever
//      is listening.
//   6. WHAT A BLOW COSTS BOTH SIDES. `afterBlow` is the whole of it: the
//      weapon's seven hit effects through `hit_effects.js`, one hit off any
//      enchantment counted in hits, the defender's Damage Reflect and Thorns
//      back down the same line, and the attacker's Stamina Leech. Every one of
//      those is a bonus key `actor.js` has been summing since W1 and nothing in
//      the tree read. See docs/mmo/wiring/G11.md.
//
// Monsters do not learn. `lessons` are routed to `progression` only for an
// actor whose `kind` is 'player', because a skeleton has no character document
// to write a gain into and `rollGain` would happily invent one.

import {
  resolveMelee, resolveSpell, applyLeech, poisonTick, swingSeconds,
  fallDamage, weaponOf, UNARMED, damage as damageOf, JUMP_ATTACK_MULT,
  HIT_BASE, HIT_PER_SKILL,
} from '../mmo/combat_rules.js';
import {
  rollHitEffects, rollSpellEffects, applyHitEffects, cssColour, EFFECT_COLOURS,
  who, target, cap,
} from './hit_effects.js';

/** Seconds between a swing starting and the blow landing. The animation's fault. */
export const SWING_LAND_S = 0.3;
/** A spell arrives almost at once; the cast time in front of it is W4's. */
export const SPELL_LAND_S = 0.1;
/** How long after a blow an actor still counts as fighting. */
export const IN_COMBAT_MS = 6000;
/** Poison and bleed both tick on this beat. */
export const TICK_MS = 1000;
/**
 * Health a second per level of bleed. NOTHING IN THE DOCUMENTS GIVES THIS
 * NUMBER: 04-CLASSES-ABILITIES writes Rend as "bleed 3 a second for 8 s", an
 * absolute rate with no level in it. So a bleed applied with an explicit
 * `perSecond` uses that figure, and only a bleed given as a bare level falls
 * back to this constant. Poison has a real rule and goes through `poisonTick`.
 */
export const BLEED_PER_LEVEL = 2;
/** Half a body, each side, added to the weapon's reach. */
export const BODY_RADIUS = 0.45;
/** How much further than its reach a swing already in the air may still land. */
export const REACH_SLACK = 1.5;

/**
 * `bonuses.parry` in DEFENCE SKILL POINTS per whole point of the fraction.
 *
 * 03-ITEMS-LOOT sells a "Parry 2 to 10%" affix and `actor.js` sums it as a
 * fraction, but `combat_rules.parryChance` reads exactly two things, the
 * defender's Parrying skill and its SHIELD's `parryFactor`, and takes no
 * additive term at all. That file is finished and is not editable here, so the
 * bonus is folded into `bonuses.defence` on a shallow copy of the defender for
 * the length of one swing.
 *
 * The conversion, out loud: `hitChance` moves by HIT_PER_SKILL (0.005) per
 * point of defence, and the fight the resolver is built around is the even one
 * at HIT_BASE (0.50). Taking 10% of the blows off an even fight is 0.05 of
 * absolute hit chance, which is 10 points of defence. So one whole point of the
 * parry fraction is worth `HIT_BASE / HIT_PER_SKILL` = 100 points, and a 10%
 * parry affix reads as +10 defence.
 *
 * The cost, said plainly: the player sees "miss" and not "parry", because the
 * roll it moved is the hit roll. When `combat_rules` grows an additive parry
 * term this constant and `guard()` below both go.
 */
export const PARRY_DEFENCE_POINTS = HIT_BASE / HIT_PER_SKILL;

/**
 * The most of a stun `bonuses.stunResist` may take off. 03 sells the affix at
 * 10 to 50% and says nothing about stacking, and four pieces of Steadfast
 * armour would add to 200%. INVENTED: a stun always lands for at least a tenth
 * of its time, because a status that can be reduced to nothing is a status a
 * player can build immunity to and then never see again.
 */
export const STUN_RESIST_CAP = 0.9;

/**
 * Thorns is on the armour, so it needs something to prick. An archer thirty
 * metres away is not touching the breastplate and does not take it; Damage
 * Reflect is magic and comes back down the same line the blow went up.
 * INVENTED, and it is the one asymmetry between the two.
 */
export const THORNS_MELEE_ONLY = true;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp01 = (v, hi = 1) => (v < 0 ? 0 : v > hi ? hi : v);
const alive = (a) => !!a && num(a.health) > 0;
const posOf = (a) => (a && a.pos ? a.pos : null);
const isPlayer = (a) => !!a && a.kind === 'player';

/** Centre to centre metres, in three dimensions. Infinity when either has no place. */
/**
 * How much higher or lower a target may stand before the rise counts against
 * reach. A slope is not a wall: the monster AI walks to `reach` measured flat,
 * and measured through the air the same two metres on a mountainside came to
 * three. Both sides then stood there for ever, each told the other was out of
 * reach. A step up to the shoulder is within a sword; more than that is over
 * your head and counts.
 */
export const REACH_RISE = 1.2;

export function actorDistance(a, b) {
  const p = posOf(a), q = posOf(b);
  if (!p || !q) return Infinity;
  const dx = num(p.x) - num(q.x), dy = num(p.y) - num(q.y), dz = num(p.z) - num(q.z);
  const rise = Math.max(0, Math.abs(dy) - REACH_RISE);
  return Math.sqrt(dx * dx + rise * rise + dz * dz);
}

/** The weapon's reach plus both bodies. What "within reach" means everywhere. */
export function reachBetween(attacker, defender) {
  const w = weaponOf(attacker);
  // a bow's reach is its range: 30 m for a crossbow, 12 for thrown knives.
  // Without this a shot was refused as out_of_reach at 2.4 m and never flew.
  const reach = Number.isFinite(w.range) ? w.range : Number.isFinite(w.reach) ? w.reach : UNARMED.reach;
  const ra = Number.isFinite(attacker && attacker.radius) ? attacker.radius : BODY_RADIUS;
  const rb = Number.isFinite(defender && defender.radius) ? defender.radius : BODY_RADIUS;
  return reach + ra + rb;
}

/** True while a stun is running. Read by queueSwing and by the monster AI. */
export const stunned = (actor, now) => !!(actor && actor.status && actor.status.stun
  && num(actor.status.stun.until) > num(now));

/**
 * A spell in the shape `resolveSpell` wants: `{ base: [lo, hi], damageType }`.
 * Accepts one already in that shape, or an `abilities.js` record, whose damage
 * hides inside `effect` and may be one part of a combo. Returns null for an
 * ability that does no damage at all, which is a real answer: Bless is not a
 * thing you resolve through the damage pipeline.
 */
export function spellShape(spell) {
  if (!spell) return null;
  if (Array.isArray(spell.base)) return spell;
  const found = findSpellDamage(spell.effect);
  if (!found) return null;
  return { ...spell, base: [found.min, found.max], damageType: found.type || 'energy' };
}

function findSpellDamage(effect) {
  if (!effect) return null;
  if (effect.kind === 'spellDamage') return effect;
  if (effect.kind === 'aoe' && effect.spellDamage) return effect.spellDamage;
  if (effect.kind === 'combo' && Array.isArray(effect.parts)) {
    for (const part of effect.parts) {
      const found = findSpellDamage(part);
      if (found) return found;
    }
  }
  return null;
}

/**
 * The runtime.
 *
 *   const combat = createCombat({ floaters, hud, audio, progression, recompute, rng });
 *   combat.queueSwing(playerActor, monsterActor, { now, jumpAttack });
 *   combat.update(dt, now);          // in the frame, after monsters.update
 *   combat.onDeath((actor, killer) => ...);
 *   combat.onHit(({ defender, colour, kind }) => effects.burst(defender.pos, colour));
 *
 * Every argument is optional. With none of them it still resolves fights
 * correctly and silently, which is what the node tests run. `recompute` is
 * `actor.js`'s, and only Hit Dispel wants it: see `hit_effects.stripOneBuff`
 * for what happens without one, which is correct but one frame slower.
 */
export function createCombat({ floaters, hud, audio, progression, recompute, rng = Math.random } = {}) {
  const pending = [];              // swings and casts in the air
  const tracked = new Set();       // actors carrying status, or lately hit
  const deathFns = [];
  const hitFns = [];               // W6's particles: see onHit below
  const lastActionAt = new WeakMap();
  let lastNow = 0;

  const say = (text, kind) => {
    if (!text) return;
    // hud.log is W4's growth and may not be there yet; toast is the one that
    // has always existed. One of them, never both.
    if (typeof hud?.log === 'function') hud.log(text, kind);
    else hud?.toast?.(text, kind);
  };
  const cue = (name, at) => audio?.play?.(name, at ? { at: { x: at.x, z: at.z } } : undefined);

  function float(actor, text, kind, extra) {
    const p = posOf(actor);
    if (!p || !floaters?.spawn) return;
    // 'damage' is what the rules emit for a blow that landed. The table in
    // 02-COMBAT.md splits it in two by whose head it is over: white when you
    // deal it, red when you take it. The resolver cannot know which; here we do.
    const k = kind === 'damage' && isPlayer(actor) ? 'taken' : kind;
    floaters.spawn(p, text, k, extra);
  }

  const touch = (actor, now) => { if (actor) { lastActionAt.set(actor, num(now)); tracked.add(actor); } };

  /** Whether this actor has swung or been struck inside the last six seconds. */
  function inCombat(actor, now = lastNow) {
    const t = lastActionAt.get(actor);
    return t != null && num(now) - t < IN_COMBAT_MS;
  }

  function onDeath(fn) { if (typeof fn === 'function') deathFns.push(fn); return () => {
    const i = deathFns.indexOf(fn); if (i >= 0) deathFns.splice(i, 1);
  }; }

  /**
   * Every hit effect that fired, so something with a particle system can paint
   * it. This file owns no THREE and never will, so the burst is main.js's:
   *
   *   combat.onHit(({ defender, colour, kind, damage }) => {
   *     effects.burst(defender.pos, colour, damage > 20 ? 1.4 : 1);
   *   });
   *
   * `colour` is a NUMBER (0x6fd0ff), which is what `effects.burst` wants, and
   * `hit_effects.cssColour` is the same value for a floater. Fires once per
   * effect, on the frame it landed, and never on a miss. `fired` is false for
   * an effect that resolved to nothing, a dispel that found no buff for
   * instance, so a listener can choose not to paint one.
   */
  function onHit(fn) { if (typeof fn === 'function') hitFns.push(fn); return () => {
    const i = hitFns.indexOf(fn); if (i >= 0) hitFns.splice(i, 1);
  }; }
  const onHitFire = (info) => { for (const fn of hitFns) fn(info); };

  /**
   * The one place a thing dies. Sets the animation the model reads, empties the
   * status so a corpse does not go on bleeding, and tells the listeners.
   */
  function kill(actor, killer) {
    if (!actor || actor.dead) return;
    actor.health = 0;
    actor.dead = true;
    actor.anim = 'die';
    actor.status = {};
    if (actor.ai) actor.ai.state = 'dead';
    tracked.delete(actor);
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].attacker === actor || pending[i].defender === actor) pending.splice(i, 1);
    }
    for (const fn of deathFns) fn(actor, killer || null);
  }

  /** Health onto an actor, never past its maximum, with the green number to prove it. */
  function heal(actor, amount, opts = {}) {
    const n = Math.max(0, Math.round(num(amount)));
    if (!actor || n <= 0) return 0;
    const max = num(actor.maxHealth) || Infinity;
    const before = num(actor.health);
    actor.health = Math.min(max, before + n);
    const got = actor.health - before;
    if (got > 0 && opts.quiet !== true) float(actor, String(got), 'heal');
    return got;
  }

  /**
   * Health off an actor, from any source that is not a resolved swing: a poison
   * tick, a fall, an ability's flat damage. Returns what actually came off.
   */
  function hurt(actor, amount, opts = {}) {
    const n = Math.max(0, Math.round(num(amount)));
    if (!alive(actor) || n <= 0) return 0;
    // the dev bench's god mode: poison, bleed and falls all come through here
    if (actor.godMode) return 0;
    const before = num(actor.health);
    actor.health = Math.max(0, before - n);
    const took = before - actor.health;
    touch(actor, opts.now ?? lastNow);
    if (opts.quiet !== true) float(actor, String(took), opts.kind || 'damage');
    if (actor.health <= 0) kill(actor, opts.killer || null);
    return took;
  }

  // -- status ---------------------------------------------------------------

  /**
   * Poison or bleed onto an actor. Poison's duration and rate come from
   * `poisonTick`, which is the document's own rule; a bleed carries its rate
   * with it, because no rule exists for one.
   *
   * A stronger level replaces a weaker one and refreshes the clock; a weaker
   * one only extends the clock. Either way it says so, because a status nobody
   * was told about is a health bar draining for no reason.
   *
   * Three things it also does, all of them for whoever is stopping a monster:
   *
   * * `spec.factor` is carried onto the entry, because `monsters.speedOf` reads
   *   `status.slow.factor` and falls back to its own SLOW_DEFAULT without one.
   *   Applying a 40% slow that arrives as a 30% one is the silent-effect bug.
   * * `bonuses.stunResist` shortens a STUN, and only a stun. A root, which is
   *   what a freeze is, is not a stun and Steadfast armour does not shorten it.
   * * `spec.quiet` suppresses the floater, for a caller that wants to say the
   *   word its own way and in its own colour, which is what hit_effects does
   *   with "frozen".
   */
  function applyStatus(actor, id, spec = {}, now = lastNow) {
    if (!alive(actor)) return null;
    const t = num(now);
    actor.status = actor.status || {};
    const level = Math.max(0, num(spec.level) || 0);
    let until, perSecond = null, seconds = Math.max(0, num(spec.seconds) || 0);
    let resisted = 0;
    if (id === 'poison') {
      if (level <= 0) return null;
      const tick = poisonTick(level);
      seconds = tick.seconds;
      until = t + seconds * 1000;
      perSecond = tick.perSecond;
    } else if (id === 'bleed') {
      perSecond = num(spec.perSecond) || level * BLEED_PER_LEVEL;
      if (perSecond <= 0) return null;
      until = t + seconds * 1000;
      if (until <= t) return null;
    } else {
      if (id === 'stun') {
        resisted = clamp01(num(actor.bonuses && actor.bonuses.stunResist), STUN_RESIST_CAP);
        seconds *= 1 - resisted;
      }
      until = t + seconds * 1000;
      if (until <= t) return null;
    }
    const had = actor.status[id];
    const stronger = !had || level > num(had.level);
    const factor = Number.isFinite(spec.factor) ? spec.factor : null;
    const entry = {
      level: stronger ? level : num(had.level),
      perSecond: stronger || perSecond > num(had.perSecond) ? perSecond : had.perSecond,
      until: Math.max(until, had ? num(had.until) : 0),
      nextTick: had && !stronger ? num(had.nextTick) : t + TICK_MS,
      seconds,
    };
    // the slow's own strength, kept only when it is the stronger of the two, so
    // a 30% slow landing on a 40% one does not quietly loosen it
    const hadFactor = had && Number.isFinite(had.factor) ? had.factor : null;
    if (factor != null || hadFactor != null) {
      entry.factor = stronger || hadFactor == null ? factor : Math.max(factor ?? 0, hadFactor);
    }
    actor.status[id] = entry;
    tracked.add(actor);
    if (spec.quiet !== true) {
      if (id === 'poison' || id === 'bleed') float(actor, id === 'poison' ? 'poisoned' : 'bleeding', 'miss');
      else if (resisted > 0) float(actor, `${id} ${seconds.toFixed(1)}s`, 'miss');
      else float(actor, id, 'miss');
    }
    if (resisted > 0 && isPlayer(actor)) {
      say(`You shrug most of it off, the stun is ${seconds.toFixed(1)} s instead of ${(seconds / (1 - resisted)).toFixed(1)}.`);
    }
    return entry;
  }

  /** Take a status off, and say so. Cure potions and Cleanse come through here. */
  function clearStatus(actor, id) {
    if (!actor || !actor.status || !actor.status[id]) return false;
    delete actor.status[id];
    float(actor, `${id} gone`, 'heal');
    return true;
  }

  /**
   * The ticks come FIRST and the expiry second, which is the difference between
   * poison 2 taking 48 and taking 44. Its last tick falls exactly on the
   * millisecond it runs out (level * 6 seconds, level * 2 a second, twelve
   * ticks of four), and an expiry checked first would eat that tick and quietly
   * make every poison in the game one second short.
   */
  function tickStatus(actor, now) {
    const st = actor.status;
    if (!st) return;
    for (const id of Object.keys(st)) {
      const e = st[id];
      if (!e) { delete st[id]; continue; }
      if (id === 'poison' || id === 'bleed') {
        while (num(e.nextTick) <= now && num(e.nextTick) <= num(e.until) && alive(actor)) {
          e.nextTick = num(e.nextTick) + TICK_MS;
          hurt(actor, e.perSecond, { now, kind: 'damage' });
        }
      }
      if (num(e.until) <= now) {
        delete st[id];
        if (id === 'poison' || id === 'bleed') float(actor, `${id} runs out`, 'heal');
      }
    }
  }

  // -- lessons --------------------------------------------------------------

  /**
   * A `lessons` list from the rules, handed to progression. Only the player
   * learns. `who` is 'attacker' or 'defender' and is resolved against the pair
   * that produced it, so a monster's swing teaches the player's Parrying and
   * raises the player's CON without either side needing to know which is which.
   */
  function teach(lessons, attacker, defender) {
    if (!progression || !Array.isArray(lessons)) return 0;
    let taught = 0;
    for (const l of lessons) {
      const who = l.who === 'defender' ? defender : attacker;
      if (!isPlayer(who)) continue;
      if (l.kind === 'stat' && l.stat) { progression.statLesson?.(who, l.stat, l.difficulty, l.success); taught++; }
      else if (l.skill) { progression.lesson?.(who, l.skill, l.difficulty, l.success); taught++; }
    }
    return taught;
  }

  /** Every `numbers` entry over the head it belongs to. */
  function show(numbers, attacker, defender) {
    if (!Array.isArray(numbers)) return;
    for (const n of numbers) float(n.over === 'attacker' ? attacker : defender, n.text, n.kind, n.extra);
  }

  // -- swings ---------------------------------------------------------------

  /**
   * Start a swing. The cooldown starts NOW; the blow lands SWING_LAND_S later.
   *
   * @returns { queued: true, at } or { queued: false, reason, wait? } with
   *   reasons 'no_actor', 'dead', 'stunned', 'cooldown', 'out_of_reach'.
   *   A refusal changes nothing at all, which is what lets the monster AI ask
   *   every frame and only pay when the answer is yes.
   */
  function queueSwing(attacker, defender, opts = {}) {
    const now = num(opts.now ?? lastNow);
    if (!attacker || !defender) return { queued: false, reason: 'no_actor' };
    if (!alive(attacker) || !alive(defender)) return { queued: false, reason: 'dead' };
    if (stunned(attacker, now)) return { queued: false, reason: 'stunned' };
    // An ability's swing is not the weapon's own rhythm. `immediate` (which is
    // what abilities_runtime.js sends, once per `shots`) skips the cooldown
    // gate AND leaves lastSwingAt alone, so a three shot ability fires three
    // times and does not also cost you your next ordinary swing.
    const free = !!(opts.immediate || opts.ignoreCooldown);
    const wait = num(attacker.lastSwingAt) + swingSeconds(attacker) * 1000 - now;
    if (!free && Number.isFinite(attacker.lastSwingAt) && wait > 0) return { queued: false, reason: 'cooldown', wait };
    const reach = reachBetween(attacker, defender) + Math.max(0, num(opts.reachBonus));
    const d = actorDistance(attacker, defender);
    if (d > reach) return { queued: false, reason: 'out_of_reach', dist: d, reach };

    if (!free) attacker.lastSwingAt = now;
    attacker.anim = 'swing';
    if (attacker.ai) attacker.ai.swingUntil = now + SWING_LAND_S * 2000;
    touch(attacker, now);
    const at = now + SWING_LAND_S * 1000;
    pending.push({ kind: 'swing', attacker, defender, at, opts });
    return { queued: true, at, reach, dist: d };
  }

  /**
   * Start a spell. `spell` is either `{ base: [lo, hi], damageType }` or an
   * ability record with damage somewhere in its effect. The cast timer in front
   * of it belongs to `abilities_runtime.js`; by the time it reaches here the
   * spell is going off.
   */
  function queueSpell(caster, spell, target, opts = {}) {
    const now = num(opts.now ?? lastNow);
    const shaped = spellShape(spell);
    if (!caster || !target) return { queued: false, reason: 'no_actor' };
    if (!shaped) return { queued: false, reason: 'no_damage' };
    if (!alive(caster) || !alive(target)) return { queued: false, reason: 'dead' };
    caster.anim = 'cast';
    touch(caster, now);
    const at = now + (opts.travel != null ? num(opts.travel) : SPELL_LAND_S) * 1000;
    pending.push({ kind: 'spell', attacker: caster, defender: target, spell: shaped, at, opts });
    return { queued: true, at };
  }

  /**
   * An attacker wearing this swing's ability bonuses, or the attacker itself.
   *
   * `abilities_runtime.js` sends `hitBonus` (skill points onto the attack roll)
   * and `ignoreARFraction` (a fraction of the target's armour ignored), and
   * `combat_rules.js` already reads both of those, by the names `bonuses.hit`
   * and `bonuses.armourPiercing`. So the ability's numbers are folded into a
   * SHALLOW COPY of the attacker rather than into a second formula here. The
   * copy matters: resolveMelee mutates nothing, so a copy resolves identically,
   * and the real actor never carries a bonus that belonged to one swing.
   */
  function swinger(attacker, opts) {
    const hit = num(opts.hitBonus);
    const pierce = num(opts.ignoreARFraction) * 100;
    if (!hit && !pierce) return attacker;
    const b = attacker.bonuses || {};
    return { ...attacker, bonuses: { ...b, hit: num(b.hit) + hit, armourPiercing: num(b.armourPiercing) + pierce } };
  }

  /**
   * A defender wearing its `bonuses.parry`, or the defender itself.
   *
   * The same trick `swinger` uses and for the same reason: `combat_rules` reads
   * a name it already knows rather than growing a term it does not. See
   * PARRY_DEFENCE_POINTS above for the conversion and for what it costs.
   */
  function guard(defender) {
    const p = num(defender && defender.bonuses && defender.bonuses.parry);
    if (!p) return defender;
    const b = defender.bonuses;
    return { ...defender, bonuses: { ...b, defence: num(b.defence) + p * PARRY_DEFENCE_POINTS } };
  }

  /**
   * Everything a landed blow owes both sides beyond the damage: the weapon's
   * hit effects, the defender's reflect and thorns, the attacker's stamina
   * leech, and one hit off any enchantment counted in hits.
   *
   * All of it runs ONLY on a blow that actually took health. A miss, a dodge
   * and a parry all arrive here with `res.damage` at zero and leave with
   * nothing said, which is the whole of "nothing fires on a miss".
   */
  function afterBlow(res, attacker, defender, now, opts = {}) {
    const dealt = num(res && res.damage);
    if (dealt <= 0) return null;
    const both = isPlayer(attacker) || isPlayer(defender);
    const out = { effects: [], lines: [], reflected: 0, thorns: 0, stamina: 0 };

    // 1. the weapon's own effects, and the enchantment on it
    const list = opts.spell
      ? rollSpellEffects(attacker, defender, res, rng)
      : rollHitEffects(attacker, defender, res, rng);
    if (list.length) {
      const applied = applyHitEffects(list, attacker, defender, api, now);
      out.effects = list;
      out.lines.push(...applied.lines);
      if (both) for (const line of applied.lines) say(line);
    }
    // a hit off the enchantment, and only for a hit: a weapon enchantment is
    // counted in hits of the WEAPON, so casting five spells does not scrub the
    // poison off the blade.
    if (!opts.spell) spendEnchant(attacker, now);

    // 2. what comes back off the defender. `hurt` owns the write and the death,
    //    so an attacker can genuinely be killed by the thing it just hit.
    const reflect = clamp01(num(defender.bonuses && defender.bonuses.damageReflect));
    if (reflect > 0 && alive(attacker)) {
      const back = Math.round(dealt * reflect);
      const took = hurt(attacker, back, { now, quiet: true, kind: 'damage', killer: defender });
      if (took > 0) {
        out.reflected = took;
        float(attacker, String(took), 'damage', { color: cssColour(EFFECT_COLOURS.dispel) });
        const line = `${cap(target(defender))} throws ${took} of it straight back at ${who(attacker)}.`;
        out.lines.push(line);
        if (both) say(line);
        onHitFire({ attacker: defender, defender: attacker, kind: 'reflect', colour: EFFECT_COLOURS.dispel, damage: took, fired: true, now });
      }
    }
    const thorns = Math.round(num(defender.bonuses && defender.bonuses.thorns));
    const outOfTouch = !!opts.spell || !!weaponOf(attacker).ranged;
    if (thorns > 0 && alive(attacker) && !(THORNS_MELEE_ONLY && outOfTouch)) {
      const took = hurt(attacker, thorns, { now, quiet: true, kind: 'damage', killer: defender });
      if (took > 0) {
        out.thorns = took;
        float(attacker, String(took), 'damage', { color: cssColour(EFFECT_COLOURS.thorns) });
        const line = `${cap(target(defender))} is barbed, and ${who(attacker)} ${isPlayer(attacker) ? 'lose' : 'loses'} ${took} on the way out.`;
        out.lines.push(line);
        if (both) say(line);
        onHitFire({ attacker: defender, defender: attacker, kind: 'thorns', colour: EFFECT_COLOURS.thorns, damage: took, fired: true, now });
      }
    }

    // 3. the attacker's stamina leech. PERCENT POINTS of the damage dealt, the
    //    same unit and the same shape as lifeLeech in combat_rules.applyLeech.
    const leech = opts.spell ? 0 : num(attacker.bonuses && attacker.bonuses.staminaLeech);
    if (leech > 0) {
      const want = Math.round(dealt * leech / 100);
      const max = num(attacker.maxStamina) || Infinity;
      const before = num(attacker.stamina);
      attacker.stamina = Math.min(max, before + want);
      const got = attacker.stamina - before;
      if (got > 0) {
        out.stamina = got;
        float(attacker, `+${got} stamina`, 'heal');
        const line = `${cap(who(attacker))} ${isPlayer(attacker) ? 'take' : 'takes'} ${got} stamina out of ${target(defender)}.`;
        out.lines.push(line);
        if (both) say(line);
      }
    }
    return out;
  }

  /**
   * One hit off a `weaponEnchant` counted in hits, and the word when it runs
   * out. NOTHING ELSE IN THE TREE DECREMENTS `hitsLeft`: abilities_runtime.js
   * writes it as 5 for Poison Blade and only ever expires an enchant by its
   * clock, so a hits-based enchantment lasted for ever. A landed blow is the
   * only thing that can spend one, and this file is where a blow lands.
   */
  function spendEnchant(attacker, now) {
    const e = attacker && attacker.enchant;
    if (!e || !Number.isFinite(e.hitsLeft)) return null;
    e.hitsLeft -= 1;
    if (e.hitsLeft > 0) return e;
    attacker.enchant = null;
    if (isPlayer(attacker)) say('The last of it goes off the blade.');
    return null;
  }

  /** The blow lands. This is the only writer of health from a resolved swing. */
  function landSwing(job, now) {
    const { attacker, defender, opts } = job;
    if (!alive(attacker) || !alive(defender)) return null;
    // it may have walked out of the way while the arm was coming round
    if (actorDistance(attacker, defender) > reachBetween(attacker, defender) * REACH_SLACK) {
      float(defender, 'out of reach', 'miss');
      cue('beastMiss', posOf(defender));
      return null;
    }
    const res = resolveMelee({ attacker: swinger(attacker, opts), defender: guard(defender), now, rng, jumpAttack: !!opts.jumpAttack });
    if (defender.godMode) { res.damage = 0; res.killed = false; res.numbers = (res.numbers || []).filter((n) => n.kind !== 'damage'); }

    // An ability multiplier: Power Strike's 1.6, Whirlwind's 0.8. resolveMelee
    // takes no multiplier of its own, only `jumpAttack`, so the same roll and
    // the same crit are put back through `combat_rules.damage` with both
    // multipliers on it. The arithmetic is still entirely the pure layer's; the
    // only thing that happens here is that the two multipliers are multiplied.
    const mult = opts.multiplier != null ? num(opts.multiplier) : 1;
    if (res.damage > 0 && mult !== 1) {
      const again = damageOf(swinger(attacker, opts), defender, res.detail.roll, {
        crit: res.crit, damageType: res.damageType,
        multiplier: (opts.jumpAttack ? JUMP_ATTACK_MULT : 1) * mult,
      });
      const was = res.damage;
      res.damage = again.final;
      res.detail = again;
      res.killed = num(defender.health) - again.final <= 0;
      // the number on screen has to be the number that came off
      for (const n of res.numbers) if (n.text === String(was)) n.text = String(again.final);
    }

    attacker.stamina = Math.max(0, num(attacker.stamina) - num(res.staminaCost));
    if (res.damage > 0) {
      defender.health = Math.max(0, num(defender.health) - res.damage);
      defender.anim = defender.health > 0 ? 'hurt' : 'die';
      touch(defender, now);
      // whoever hit it last is who it turns on: 02-COMBAT's own targeting rule
      if (defender.ai) { defender.ai.target = attacker; defender.ai.hurtAt = now; }
    }
    show(res.numbers, attacker, defender);
    teach(res.lessons, attacker, defender);
    cue(res.damage > 0 ? 'beastHit' : 'beastMiss', posOf(defender));

    const leech = applyLeech(res, attacker);
    if (leech.healed > 0) { attacker.health = Math.min(num(attacker.maxHealth) || Infinity, num(attacker.health) + leech.healed); }
    if (leech.mana > 0) { attacker.mana = Math.min(num(attacker.maxMana) || Infinity, num(attacker.mana) + leech.mana); }
    show(leech.numbers, attacker, defender);

    if (res.damage > 0 && opts.poison > 0) applyStatus(defender, 'poison', { level: opts.poison }, now);
    if (res.damage > 0 && opts.bleed) applyStatus(defender, 'bleed', opts.bleed, now);

    // The effects run BEFORE the death is declared, so a fireball off the blade
    // can be the thing that finishes it and `hurt` owns that death the way it
    // owns a poison tick's. A defender the swing itself already emptied is not
    // alive by the time they run, so they take nothing further off it, and the
    // kill below is still this swing's.
    res.after = afterBlow(res, attacker, defender, now);
    if (defender.health <= 0) kill(defender, attacker);
    return res;
  }

  function landSpell(job, now) {
    const { attacker, defender, spell, opts } = job;
    if (!alive(attacker) || !alive(defender)) return null;
    const res = resolveSpell({ caster: attacker, target: defender, spell, rng, now });
    if (defender.godMode) { res.damage = 0; res.killed = false; res.numbers = (res.numbers || []).filter((n) => n.kind !== 'damage'); }
    if (res.damage > 0) {
      defender.health = Math.max(0, num(defender.health) - res.damage);
      defender.anim = defender.health > 0 ? 'hurt' : 'die';
      touch(defender, now);
      if (defender.ai) { defender.ai.target = attacker; defender.ai.hurtAt = now; }
    }
    show(res.numbers, attacker, defender);
    teach(res.lessons, attacker, defender);
    cue(res.damage > 0 ? 'beastHit' : 'beastMiss', posOf(defender));
    const leech = applyLeech(res, attacker);
    if (leech.healed > 0) attacker.health = Math.min(num(attacker.maxHealth) || Infinity, num(attacker.health) + leech.healed);
    if (leech.mana > 0) attacker.mana = Math.min(num(attacker.maxMana) || Infinity, num(attacker.mana) + leech.mana);
    show(leech.numbers, attacker, defender);
    if (res.damage > 0 && opts.poison > 0) applyStatus(defender, 'poison', { level: opts.poison }, now);
    // A SPELL IS NOT A HIT. 03 sells the seven hit lines on a weapon and prices
    // them as a "chance per hit", and a fireball is not the sword going in, so
    // `rollSpellEffects` deliberately ignores the affixes and the powers and
    // asks only the enchantment, and only one that says `onSpell`. See G11.md
    // section 5 for what that means today, which is: nothing, loudly.
    res.after = afterBlow(res, attacker, defender, now, { spell: true });
    if (defender.health <= 0) kill(defender, attacker);
    return res;
  }

  /**
   * The ground arrives. `(metres - 4) * 6`, and nothing resists it. A drop of
   * four metres or less is free and says nothing, because nothing happened.
   *
   * @returns the damage taken, 0 for a landing that cost nothing.
   */
  function applyFall(actor, metres, now = lastNow) {
    const n = fallDamage(metres);
    if (!alive(actor) || n <= 0) return 0;
    const took = hurt(actor, n, { now, kind: 'fall' });
    cue('land', posOf(actor));
    if (isPlayer(actor)) {
      say(took >= num(actor.maxHealth) * 0.5
        ? `you hit the ground hard, ${took} off`
        : `you land badly, ${took} off`);
    }
    return took;
  }

  /** Every frame, after the monsters have moved and before the floaters update. */
  function update(dt, now) {
    lastNow = Number.isFinite(now) ? now : lastNow + Math.max(0, num(dt)) * 1000;
    const t = lastNow;
    for (let i = pending.length - 1; i >= 0; i--) {
      const job = pending[i];
      if (job.at > t) continue;
      pending.splice(i, 1);
      if (job.kind === 'swing') landSwing(job, t); else landSpell(job, t);
    }
    for (const actor of [...tracked]) {
      if (!alive(actor)) { tracked.delete(actor); continue; }
      if (actor.status && Object.keys(actor.status).length) tickStatus(actor, t);
      else if (!inCombat(actor, t)) tracked.delete(actor);
    }
  }

  const api = {
    queueSwing, queueSpell, applyFall, update, onDeath, onHit, inCombat,
    // the pieces the other runtimes need to reach without re-deriving them
    applyStatus, clearStatus, hurt, heal, kill,
    /**
     * A word over a head, in a colour if you have one. `hit_effects.js` uses it
     * for "frozen" in ice blue: `hurt` and `applyStatus` both float plainly,
     * and an effect that has a colour should not have to give it up to use
     * them. `extra.color` is a CSS string, which is what floaters.js reads.
     */
    float,
    /** What `hit_effects.applyHitEffects` calls to fan an effect out to onHit. */
    onHitFire,
    /**
     * `actor.js`'s recompute, when main.js handed one in. Hit Dispel needs it:
     * a buff taken off `actor.buffs` without one leaves its bonuses behind for
     * ever. See `hit_effects.stripOneBuff` for the two paths.
     */
    recompute: typeof recompute === 'function' ? recompute : null,
    /** Hit effects, standalone, for a caller that has its own reason to roll. */
    rollHitEffects: (a, d, res) => rollHitEffects(a, d, res, rng),
    reachBetween, distance: actorDistance, stunned: (a, n = lastNow) => stunned(a, n),
    /**
     * Drop everything in the air that involves this actor, and stop tracking
     * it. A monster despawned by the streaming cap while its arm was coming
     * round would otherwise land a blow from a body that is no longer there.
     */
    forget(actor) {
      let n = 0;
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].attacker === actor || pending[i].defender === actor) { pending.splice(i, 1); n++; }
      }
      tracked.delete(actor);
      return n;
    },
    /** What is still in the air. Tests and the debug overlay. */
    get pendingCount() { return pending.length; },
    get now() { return lastNow; },
    /** Forget everything: a death screen, a teleport, a dungeon change. */
    clear() { pending.length = 0; tracked.clear(); },
  };
  return api;
}
