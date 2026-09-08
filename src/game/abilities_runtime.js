// The bar, and what happens when you press it.
//
// `src/mmo/abilities.js` is pure rules: it says whether you may use a thing,
// what it costs, how long it casts, and what its effect is as data. This file
// is the only place that turns that data into something a player can see.
//
// TIME IS IN SECONDS. Every number in abilities.js is seconds, so `now` here
// is seconds on one monotonic clock and nothing in this file is milliseconds.
// main.js passes `performance.now() / 1000`. Getting this wrong would make a
// six second cooldown last a hundred minutes, which is exactly the class of
// bug the project's CLAUDE.md was written about.
//
// THE TABLE THAT CANNOT DRIFT. `abilities.js` declares twenty six effect
// kinds and its own audit proves every one of them is used by some ability.
// `EFFECT_HANDLERS` below has to answer all twenty six, and
// `auditEffectHandlers()` runs at module load, so the day someone adds a kind
// to the pure layer this file fails to import rather than silently swallowing
// the new effect. A handler that did nothing would be worse than no handler:
// the ability would take your mana and lie about it.
//
// EVERY USE OWES THE PLAYER WORDS. A refusal says why (out of range, not
// enough mana, still cooling, moving); a use says its name; an effect that
// found nothing to land on says so. There is no silent branch in `use()`.

import {
  ABILITIES_BY_ID, EFFECT_KINDS, canUse, startCast, interruptRule, lessonFor,
  manaCostFor, costKind, MELEE_RANGE, weaponCheck, weaponNeeds, burdensInArmour,
  itemsHeld, payingBases, practiceChance, isPractice, practiceText,
  requirementSentence, meetsRequirements,
} from '../mmo/abilities.js';
import { JUMP_ATTACK_MULT } from '../mmo/combat_rules.js';
import { castBurdenOf, burdenSources, offHandWeaponFrom } from './actor.js';
import { GRAVITY, JUMP_V0 } from './player.js';
import { pickTarget, DEFAULT_HALF_ANGLE, flatDistance, isTargetable } from './targeting.js';

/** Twelve slots, keys 1 to 0 then minus and equals. 06-ECONOMY-UI.md. */
export const BAR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
export const BAR_SLOTS = BAR_KEYS.length;

/**
 * The actor is "moving" above this. player.js decelerates at 40 m/s^2 and
 * calls a stop below 0.2 m/s for the gait, so 0.1 sits inside the dead band:
 * a player who has let go of the keys is not moving by the time the frame
 * after next comes round, and a player walking at 7 m/s certainly is.
 */
export const MOVING_SPEED = 0.1;

/** An armed melee ability waits this long for a swing before it lapses. */
export const NEXT_SWING_WINDOW = 10;

/** Leap Slam's arc, as a multiple of a standing jump's launch speed. */
export const LEAP_ARC = 1.6;

/**
 * A spell held on the cursor waits this long for you to say who it is for.
 *
 * INVENTED. No document names a number. Six seconds is two of the longest cast
 * in the tables and about as long as a player will hold a raised hand before
 * deciding the game has forgotten him; it is short enough that a spell cannot
 * still be waiting after the fight it was meant for. It is a constant so the
 * test drives the exact second rather than a feeling, and so it can be turned
 * without hunting for it.
 */
export const PENDING_SECONDS = 6;

/**
 * How long a Ward's or a Sanctuary's buff outlives the floor it came from.
 *
 * INVENTED. No document gives a number. The buff is refreshed every frame you
 * stand inside the ring, so this is only ever the tail after you walk out, and
 * a fifth of a second is short enough that stepping out of a Sanctuary really
 * does make you attackable again and long enough that a frame's rounding
 * cannot flicker it off while you are standing still in the middle.
 */
export const ZONE_LINGER = 0.2;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const one = (n) => (n === 1 ? '' : 's');

// ---------------------------------------------------------------------------
// The effect table
// ---------------------------------------------------------------------------
//
// Each handler is `(effect, ctx) => string | null`: the words for what it did,
// or null when it did nothing worth a line of its own. `ctx` carries the
// ability, the target, the ground point, `now`, and the shared `hit` list so
// that a combo's knockback lands on whatever its aoe just hit.

export const EFFECT_HANDLERS = {
  damageMult: (e, c) => c.api.doDamageMult(e, c),
  aoe: (e, c) => c.api.doAoe(e, c),
  spellDamage: (e, c) => c.api.doSpellDamage(e, c),
  heal: (e, c) => c.api.doHeal(e, c),
  dot: (e, c) => c.api.doDot(e, c),
  leech: (e, c) => c.api.doLeech(e, c),
  control: (e, c) => c.api.doControl(e, c),
  move: (e, c) => c.api.doMove(e, c),
  knockback: (e, c) => c.api.doKnockback(e, c),
  buff: (e, c) => c.api.doBuff(e, c),
  debuff: (e, c) => c.api.doDebuff(e, c),
  summon: (e, c) => c.api.doSummon(e, c),
  absorb: (e, c) => c.api.doAbsorb(e, c),
  zone: (e, c) => c.api.doZone(e, c),
  cure: (e, c) => c.api.doCure(e, c),
  resurrect: (e, c) => c.api.doResurrect(e, c),
  stealth: (e, c) => c.api.doStealth(e, c),
  weaponEnchant: (e, c) => c.api.doWeaponEnchant(e, c),
  passiveMod: (e, c) => c.api.doPassiveMod(e, c),
  utility: (e, c) => c.api.doUtility(e, c),
  chain: (e, c) => c.api.doChain(e, c),
  corpseBurst: (e, c) => c.api.doCorpseBurst(e, c),
  plague: (e, c) => c.api.doPlague(e, c),
  mark: (e, c) => c.api.doMark(e, c),
  bandage: (e, c) => c.api.doBandage(e, c),
  combo: (e, c) => c.api.doCombo(e, c),
};

/**
 * Both directions, the way audits in this codebase are written: every kind the
 * pure layer declares has a handler here, and every handler here answers a
 * kind that really exists. Throws with the whole list, not the first offender.
 */
export function auditEffectHandlers(kinds = EFFECT_KINDS, handlers = EFFECT_HANDLERS) {
  const bad = [];
  for (const kind of kinds) {
    if (typeof handlers[kind] !== 'function') bad.push(`no handler for effect kind ${kind}`);
  }
  for (const name of Object.keys(handlers)) {
    if (!kinds.includes(name)) bad.push(`handler ${name} answers no declared effect kind`);
  }
  if (bad.length) {
    throw new Error(`abilities_runtime: the effect table has drifted from abilities.js:\n  ${bad.join('\n  ')}`);
  }
  return true;
}

// This is the point of the audit. It must run on import, not inside
// createAbilities, so a missing handler fails the build and not a play session.
auditEffectHandlers();

// ---------------------------------------------------------------------------
// Small pure helpers, exported so the tests measure the real ones
// ---------------------------------------------------------------------------

/** Which slot a key press means. -1 for a key that is not on the bar. */
export const slotForKey = (key) => BAR_KEYS.indexOf(String(key).toLowerCase());

/** How far a leap of `distance` metres throws you, and for how long. */
export function leapArc(distance, arc = LEAP_ARC) {
  const v0 = JUMP_V0 * arc;
  const air = (2 * v0) / GRAVITY;
  return { v0, air, speed: air > 0 ? distance / air : 0, height: (v0 * v0) / (2 * GRAVITY) };
}

/** A number of seconds, said the way a person says it. */
export function saySeconds(s) {
  const v = Math.round(num(s) * 10) / 10;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} second${v === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Armour and the spell going out
// ---------------------------------------------------------------------------
//
// `actor.castBurden` (actor.js) is the mean of the worn armour's `castBurden`
// over the eight armour slots: 0 in cloth, 0.10 in leather, 0.30 studded, 0.55
// ringmail, 0.75 chainmail, 1.0 in full plate. Two things come off it, and
// only for a row `burdensInArmour` calls burdened, which is every spell except
// the nine Chivalry rows. The paladin casts in plate; nobody else does well.
//
//   cast time   ability.castTime * (1 + burden). Plate doubles a cast.
//   fizzle      burden * CAST_BURDEN_FIZZLE, rolled the moment the spell
//               would land. Plate fails three casts in five, leather one in
//               about seventeen, cloth never.
//
// A fizzle costs half the mana (the other half comes back, on the same rule a
// broken cast uses), plays the denied cue, says a sentence naming the armour,
// floats a grey word, and still teaches the skill at a failure's reduced
// chance. The whole rule is in docs/mmo/02-COMBAT.md.

/** A fizzle is this fraction of the burden: full plate fails 60% of casts. */
export const CAST_BURDEN_FIZZLE = 0.6;

/** Above this, the bar cell wears its amber corner. Below it, the tooltip alone. */
export const BURDEN_MARK = 0.25;

/** How long this row really takes with that armour on. Instants stay instant. */
export const burdenedCastTime = (castTime, burden) => num(castTime) * (1 + Math.max(0, num(burden)));

/** The chance this row fails outright. Never above CAST_BURDEN_FIZZLE. */
export const fizzleChance = (burden) => clamp(num(burden), 0, 1) * CAST_BURDEN_FIZZLE;

/** How often a step taken while hidden is rolled against Stealth. Seconds. */
export const STEALTH_STEP_S = 1;

/**
 * The chance a step holds. A floor of PRACTICE_FLOOR so a beginner is not shut
 * out of his own skill (nineteen steps in twenty still give him away), and a
 * ceiling under 1 so a grandmaster is quiet rather than invisible.
 */
export const stealthHoldChance = (skill) => clamp(0.05 + num(skill) * 0.009, 0.05, 0.95);

/** What a step while hidden is worth as a lesson. Hide's own mark plus twenty. */
export const STEALTH_DIFFICULTY = 20;

/** none, a little, often, mostly. The bands the bar's warning is worded in. */
export function burdenBand(burden) {
  const b = num(burden);
  if (b <= 0) return 'none';
  if (b <= BURDEN_MARK) return 'a little';
  if (b < 0.6) return 'often';
  return 'mostly';
}

const BURDEN_LEAD = {
  'a little': 'This armour gets in the way a little',
  often: 'This armour gets in the way often',
  mostly: 'This armour mostly stops a spell',
};

/**
 * The amber line the bar tooltip shows, in the band's words and with the two
 * numbers it is promising, so nothing here is a feeling the code does not
 * keep. Empty for a row armour does not touch, and empty in cloth.
 */
export function burdenText(burden) {
  const b = num(burden);
  if (b <= 0) return '';
  const times = Math.round((1 + b) * 100) / 100;
  const longer = times === 2 ? 'twice as long' : `${times} times as long`;
  const fizzle = Math.round(fizzleChance(b) * 100);
  return `${BURDEN_LEAD[burdenBand(b)]}: a cast takes ${longer}, and ${fizzle} in 100 fizzle.`;
}

/** "platemail", "chainmail and ringmail", "platemail, chainmail and ringmail". */
export function andList(words) {
  const w = (words || []).filter(Boolean);
  if (w.length === 0) return '';
  if (w.length === 1) return w[0];
  return `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;
}

// ---------------------------------------------------------------------------
// createAbilities
// ---------------------------------------------------------------------------

/**
 * `createAbilities({ character, actor, input, combat, monsters, effects,
 * floaters, hud, audio, player, camera, progression })`, plus these optional
 * hooks, each of which degrades to a spoken "that is not wired yet" rather
 * than to silence:
 *
 *   targeting   createTargeting's object; gives the cursor target and the
 *               ground point. Without it the cone in targeting.js answers.
 *   summon(id, pos, meta)      W2's spawner
 *   allies()                   everything friendly, for buffs with a radius
 *   heightAt(x, z)             the ground, for dashes and blinks
 *   resurrect(actor)           W1's death code
 *   spellVfx    src/game/spell_vfx.js's bridge. Optional and optional-chained
 *               everywhere, so the runtime behaves identically without it: it
 *               is told when a cast STARTS (with the cast time the armour
 *               really charged), when one LANDS (with the target and, for a
 *               chain, the actors it hopped along), and when one FAILS. It is
 *               never asked a question and never changes an outcome.
 *   utility { transmute, steal, meditate, camp }
 *   rng()                      seeded in tests, Math.random in the game
 *   recompute(actor)           else progression.recompute, else actor.recompute
 *   enabled()                  false while a window owns the keyboard, while
 *                              the market is up, or while the player is dying
 */
export function createAbilities(deps = {}) {
  const {
    character = {}, actor = {}, input = null, combat = null, monsters = null,
    effects = null, floaters = null, hud = null, audio = null, player = null,
    camera = null, progression = null, targeting = null, spellVfx = null,
    // `attack(who)` starts the auto attack on an actor (the app's combat system);
    // `onMark(target, mark)` is told when a mark lands, so a badge can follow it
    attack = null, onMark = null,
  } = deps;

  const rng = typeof deps.rng === 'function' ? deps.rng : Math.random;
  /** Whether a key press on the bar counts this frame. See update(). */
  const barEnabled = typeof deps.enabled === 'function' ? deps.enabled : () => true;
  const summonHook = typeof deps.summon === 'function' ? deps.summon : null;
  const utility = deps.utility || {};

  const cooldowns = Object.create(null);
  let cast = null;              // the rooted or moving cast in flight
  const delayed = [];           // delayed effects: Meteor's fall, Volley's rain
  const zones = [];             // traps, wards, sanctuaries, rifts
  let nextSwing = null;         // an armed melee ability waiting for a swing
  let landing = null;           // what happens when a leap touches down
  let waiting = null;           // a spell held on the cursor: { ability, slot, startedAt }
  let stealthAt = 0;            // when the last Stealth step was rolled
  let lastLine = '';

  const say = (text, kind) => {
    if (!text) return;
    lastLine = text;
    if (hud?.log) hud.log(text, kind);
    else hud?.toast?.(text, kind);
  };
  const cue = (name) => { try { audio?.play?.(name); } catch (err) { /* sound is never load bearing */ } };
  const float = (pos, text, kind) => { try { floaters?.spawn?.(pos, text, kind); } catch (err) { /* the number is decoration */ } };

  /**
   * What is in the player's hands, through the same weaponCheck canUse uses,
   * so the bar's grey cell and the refusal you hear are one rule and not two.
   * A character with no `equipment` field is not checked: see canUse.
   */
  function handsCheck(ability) {
    if (!ability) return { ok: true };
    if (character.equipment === undefined) return { ok: true };
    return weaponCheck(ability, character.equipment, character.pack ?? character.items ?? null);
  }

  /**
   * The weapon an armed next swing was set up for. `actor.weapon` is written
   * by actor.js's recompute on every equip, so this changes the moment the
   * player swaps hands. Undefined for a fixture with no weapon record, which
   * compares equal to itself and lapses nothing.
   */
  const weaponIdNow = () => actor.weapon?.id ?? character.equipment?.mainHand?.base ?? null;

  /** The paper doll, whichever object is holding it. */
  const wornNow = () => actor.equipment || character.equipment || null;

  /**
   * How much the armour on this player's back is fighting this row, 0 to 1.
   * Zero for anything that is not a burdened spell, so a warrior's Power
   * Strike and a paladin's Bless both read 0 and never look at the plate.
   *
   * `actor.castBurden` is written by actor.js's recompute, which inventory.js
   * calls on every equip, so it is the fresh number. The fallback is for a
   * fixture with a paper doll and no recompute behind it: without it such a
   * character would cast out of full plate as if naked, which is the class of
   * bug where the writer exists and the reader quietly reads nothing.
   */
  function burdenFor(ability) {
    if (!burdensInArmour(ability)) return 0;
    const own = actor.castBurden;
    const b = typeof own === 'number' && Number.isFinite(own) ? own : castBurdenOf(wornNow());
    return clamp(num(b), 0, 1);
  }

  /** The materials to blame, as a phrase: "platemail", "chainmail and ringmail". */
  const armourWords = () => andList(burdenSources(wornNow()));

  const moving = () => num(player?.speed) > MOVING_SPEED;
  const airborne = () => !!player?.airborne;
  const pos = () => player?.pos || actor.pos || { x: 0, y: 0, z: 0 };
  const yaw = () => num(player?.yaw ?? actor.yaw);
  const heightAt = typeof deps.heightAt === 'function' ? deps.heightAt : null;

  function recompute(who = actor) {
    if (typeof deps.recompute === 'function') return deps.recompute(who);
    if (typeof progression?.recompute === 'function') return progression.recompute(who);
    if (typeof who?.recompute === 'function') return who.recompute();
    return null;
  }

  /** Everything alive the world will let an ability touch. */
  const allTargets = () => {
    const list = typeof monsters?.actors === 'function' ? monsters.actors()
      : typeof monsters?.targets === 'function' ? monsters.targets() : [];
    return Array.isArray(list) ? list : [];
  };
  const allies = () => {
    if (typeof deps.allies === 'function') return deps.allies() || [actor];
    return [actor];
  };

  // ------------------------------------------------------------- the state --

  /** What abilities.js's canUse reads. Built fresh each press: pools move. */
  function snapshot(now) {
    return {
      skills: character.skills || actor.skills || {},
      stats: character.stats || actor.stats || {},
      stamina: num(actor.stamina),
      mana: num(actor.mana),
      health: num(actor.health),
      maxHealth: num(actor.maxHealth),
      items: character.items || {},
      // The paper doll and the pack, so canUse can refuse an ability you have
      // no weapon for. Left undefined when the character has neither, which is
      // how a fixture that predates the rule keeps measuring what it measured.
      equipment: character.equipment,
      pack: character.pack ?? null,
      cooldowns,
      moving: moving(),
      hasShield: !!(actor.shield || character.equipment?.offHand?.shield),
      lowerManaCost: num(actor.bonuses?.lowerManaCost),
      form: actor.form || null,
    };
  }

  function pay(rec) {
    const c = rec.cost;
    if (!c) return null;
    if (c.kind === 'stamina') { actor.stamina = Math.max(0, num(actor.stamina) - c.amount); return `${Math.round(c.amount)} stamina`; }
    if (c.kind === 'mana') {
      if (c.paidIn === 'health') { actor.health = Math.max(1, num(actor.health) - c.amount); return `${Math.round(c.amount)} health`; }
      actor.mana = Math.max(0, num(actor.mana) - c.amount);
      return `${Math.round(c.amount)} mana`;
    }
    if (c.kind === 'item') return spendItem(c.item, c.amount);
    return null;
  }

  /**
   * Take `n` of whatever pays this cost out of the PACK, and out of the count
   * map only when there is no pack to take it from.
   *
   * This is the other half of the Bandage bug. `canUse` refused for want of
   * bandages that were in the pack all along (see `itemsHeld`), and the moment
   * that was fixed this function was still decrementing `character.items`, a
   * map no save has ever carried: the ability would have healed you for ever
   * off ten bandages that never went down. A cost that is not really taken is
   * as wrong as a cost that cannot be paid.
   */
  function spendItem(costId, amount = 1) {
    const n = Math.max(1, Math.round(num(amount) || 1));
    const bases = payingBases(costId);
    // The document's pack is `{ slots, items: [...] }`; some fixtures hand over
    // the bare array. Both are read, because a cost that is not really taken is
    // as wrong as a cost that cannot be paid, and finding out which shape it was
    // is one line.
    const list = Array.isArray(character.pack) ? character.pack : character.pack?.items;
    let left = n, took = 0, label = costId;
    if (Array.isArray(list) && typeof deps.spendFromPack === 'function') {
      for (let i = 0; i < list.length && left > 0; i++) {
        const it = list[i];
        if (!it || !bases.includes(it.base || it.id)) continue;
        const got = num(deps.spendFromPack({ pack: i }, left));
        if (got > 0) { took += got; left -= got; label = it.base || it.id; }
      }
    } else if (Array.isArray(list)) {
      for (let i = 0; i < list.length && left > 0; i++) {
        const it = list[i];
        if (!it || !bases.includes(it.base || it.id)) continue;
        const have = num(it.count) || 1;
        const got = Math.min(have, left);
        label = it.base || it.id;
        if (have - got <= 0) list[i] = null; else it.count = have - got;
        took += got; left -= got;
      }
    }
    if (left > 0 && character.items) {
      const bag = character.items;
      for (const base of bases) {
        if (left <= 0) break;
        const have = num(bag[base]);
        const got = Math.min(have, left);
        if (got > 0) { bag[base] = have - got; took += got; left -= got; label = base; }
      }
    }
    return took > 0 ? `${took} ${label}${one(took)}` : null;
  }

  /**
   * The refund when a cast is broken before it lands: half the stamina or
   * mana, so a break stings without robbing you.
   *
   * An ITEM cost is never refunded. A bandage you had half unwound when
   * something hit you is a bandage on the ground, and rounding half of one
   * bandage up would have handed it back whole, which is the sort of quiet
   * arithmetic that turns into free consumables. Health paid in lich form is
   * likewise gone: it was spent as damage.
   */
  function refund(rec) {
    const c = rec?.cost;
    if (!c) return null;
    if (c.kind === 'item') return `the ${c.item} is spent`;
    if (c.kind === 'mana' && c.paidIn === 'health') return null;
    const back = Math.round(c.amount / 2);
    if (!back) return null;
    if (c.kind === 'stamina') actor.stamina = num(actor.stamina) + back;
    else actor.mana = num(actor.mana) + back;
    return `${back} ${c.kind} came back`;
  }

  // ----------------------------------------------------------- the targets --

  function acquire(ability) {
    const range = num(ability.range) || MELEE_RANGE;
    const half = ability.effect?.arcDegrees ? (ability.effect.arcDegrees * Math.PI) / 360 : DEFAULT_HALF_ANGLE;
    if (targeting?.acquire) return targeting.acquire({ range, halfAngle: half, pos: pos(), yaw: yaw() });
    return pickTarget({
      cursorHit: targeting?.hover || null,
      candidates: allTargets(),
      pos: pos(), yaw: yaw(), range, halfAngle: half, self: actor,
      nearestHostile: typeof monsters?.nearestHostile === 'function'
        ? (p, y, r, h) => { const f = monsters.nearestHostile(p, y, r, h); return f ? (f.actor || f) : null; } : null,
    });
  }

  /** How far this ability reaches, the one number every range line quotes. */
  const rangeOf = (ability) => num(ability?.range) || MELEE_RANGE;

  /**
   * The nearest hostile within this ability's reach IN ANY DIRECTION, or null.
   *
   * `acquire` looks in a cone, which is right for "who did you mean" and wrong
   * for "is there anybody at all": a wolf chewing your left elbow is not in
   * front of you and is certainly what the Fireball was for. Used only after
   * the cone has already answered nothing, so it can never take a target away
   * from the cursor or from the frame at the top of the screen.
   */
  function anyHostileInRange(ability) {
    const range = rangeOf(ability);
    if (typeof monsters?.nearestHostile === 'function') {
      const found = monsters.nearestHostile(pos(), yaw(), range, Math.PI);
      const who = found ? (found.actor || found) : null;
      if (who && isTargetable(who, actor) && flatDistance(pos(), who.pos || who) <= range) return who;
      return null;
    }
    let best = null, bd = range;
    for (const m of allTargets()) {
      if (!isTargetable(m, actor)) continue;
      const d = flatDistance(pos(), m.pos || m);
      if (d <= bd) { bd = d; best = m; }
    }
    return best;
  }

  /**
   * Which abilities can be held on the cursor waiting for a target. Enemy
   * abilities that are not armed next swings can wait. Ground, corpse, ally
   * and self rows each have their own fallback path, so they never reach a
   * second click unless the row says it targets an enemy.
   */
  const waitsForTarget = (ability) => ability?.target === 'enemy' && !ability?.effect?.nextSwing;

  /**
   * Turn to face what you are about to hit.
   *
   * `player.yaw` is a GETTER with no setter, so assigning to it throws in a
   * module. `player.state` is the object the getter reads and player.js writes
   * `group.rotation.y = s.yaw` from it every frame, so the facing is written
   * there and mirrored onto the group so it shows on this frame rather than
   * the next. `stepPlayer` only takes the yaw back when the player is actually
   * walking (speed over 0.15), so a standing cast keeps the facing it chose.
   */
  function faceTowards(target) {
    const p = target?.pos || target;
    if (!p) return false;
    const dx = num(p.x) - num(pos().x), dz = num(p.z) - num(pos().z);
    if (Math.hypot(dx, dz) < 1e-4) return false;
    const want = Math.atan2(dx, dz);          // forward is (sin yaw, cos yaw)
    const st = player?.state;
    if (st && typeof st.yaw === 'number') {
      st.yaw = want;
      if (player.group?.rotation) player.group.rotation.y = want;
      return true;
    }
    return false;
  }

  // ------------------------------------------------- the spell on the cursor --

  /** Let go of a held spell, out loud. Nothing was paid, so nothing comes back. */
  function cancelPending(why = 'you let it go') {
    if (!waiting) return null;
    const it = waiting;
    waiting = null;
    say(`${it.ability.name} is no longer waiting for a target: ${why}.`, 'bad');
    return it;
  }

  /**
   * Hold a spell on the cursor. Nothing is paid here and no cooldown starts:
   * the whole cost is taken when a target is picked, so letting it go costs
   * exactly nothing and there is no refund arithmetic to get wrong.
   */
  function holdForTarget(ability, slot, now) {
    waiting = { ability, slot: Number.isInteger(slot) ? slot : -1, startedAt: num(now) };
    effects?.hideGroundRing?.();
    say(`Choose a target for ${ability.name}. Click one, or press Escape to let it go.`, 'ability');
    return { ok: false, pending: true, reason: `choose a target for ${ability.name}`, ability };
  }

  /**
   * Where a ground ability lands: the cursor, then whatever you are fighting,
   * then `range` metres ahead.
   *
   * THE MIDDLE CLAUSE IS NEW AND IT IS WHY VOLLEY LOOKED BROKEN. With no cursor
   * hit the old rule dropped the circle a flat eight metres in front of the
   * player, so a Volley aimed at a wolf two metres away rained arrows six
   * metres past it and reported "Volley finds nothing inside 5 m" while a wolf
   * chewed your leg. A ground ability with a target chosen means THAT ground.
   * Measured by `scripts/audit-abilities.mjs`, which is where it was found.
   */
  function groundPoint(ability, target = null) {
    const max = num(ability.range) || 10;
    const clampTo = (p) => {
      const d = flatDistance(pos(), p);
      if (d <= max) return { x: num(p.x), y: num(p.y ?? pos().y), z: num(p.z) };
      const k = max / (d || 1);
      return { x: pos().x + (num(p.x) - pos().x) * k, y: num(pos().y), z: pos().z + (num(p.z) - pos().z) * k };
    };
    const g = targeting?.groundPoint?.(num(pos().y));
    if (g) return clampTo(g);
    const at = target || (targeting?.current && isTargetable(targeting.current, actor) ? targeting.current : null);
    if (at && (at.pos || at).x != null) return clampTo(at.pos || at);
    const r = Math.min(max, 8);
    return { x: pos().x + Math.sin(yaw()) * r, y: num(pos().y), z: pos().z + Math.cos(yaw()) * r };
  }

  /**
   * Everything in a circle, or in an arc of one. Nearest first.
   *
   * A BODY ON YOUR OWN SIDE IS NOT IN THE AREA. `allTargets` is whatever the
   * world hands over, and since summons exist that list can hold your own
   * skeleton: a Whirlwind that cut down the champion you had just paid sixty
   * mana for is the ability looking broken while every line of it ran. The
   * faction test is `targeting.isTargetable`'s own, so a spell and a cursor can
   * never disagree about whose side a body is on.
   */
  /**
   * The past participle of a control effect, for the line that reports it.
   * `${effect}ed` gave the player "1 stuned", "1 silenceed", "1 pacifyed" and
   * "2 provokeed"; the table covers every effect abilities.js's control rows
   * use, and the fallback handles a regular verb so a new row reads right too.
   */
  const CONTROL_WORDS = {
    stun: 'stunned', silence: 'silenced', pacify: 'pacified', provoke: 'provoked',
    sleep: 'put to sleep', fear: 'feared', root: 'rooted', slow: 'slowed', pull: 'pulled',
    disarm: 'disarmed', knockdown: 'knocked down', blind: 'blinded', taunt: 'taunted',
  };
  function controlWord(effect) {
    const w = String(effect || '');
    if (CONTROL_WORDS[w]) return CONTROL_WORDS[w];
    if (w.endsWith('e')) return `${w}d`;
    if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ied`;
    return `${w}ed`;
  }

  function inArea(centre, radius, arcDegrees, fromPos, facing) {
    const half = arcDegrees ? (arcDegrees * Math.PI) / 360 : Math.PI;
    const out = [];
    for (const m of allTargets()) {
      if (m === actor) continue;
      if (m.faction && m.faction !== 'hostile') continue;
      if (num(m.health) <= 0 || m.dead) continue;
      const p = m.pos || m;
      const d = flatDistance(centre, p);
      if (d > radius) continue;
      if (arcDegrees) {
        const dx = num(p.x) - num(fromPos.x), dz = num(p.z) - num(fromPos.z);
        const len = Math.hypot(dx, dz);
        if (len > 1e-6) {
          const a = Math.acos(clamp((Math.sin(facing) * dx + Math.cos(facing) * dz) / len, -1, 1));
          if (a > half) continue;
        }
      }
      out.push(m);
    }
    out.sort((a, b) => flatDistance(centre, a.pos || a) - flatDistance(centre, b.pos || b));
    return out;
  }

  // ------------------------------------------------------------- the moves --

  function place(x, z) {
    const y = heightAt ? num(heightAt(x, z)) : num(pos().y);
    if (player?.teleport) player.teleport(x, z, heightAt || (() => y));
    else { const p = pos(); p.x = x; p.z = z; p.y = y; }
    if (actor.pos && actor.pos !== pos()) { actor.pos.x = x; actor.pos.z = z; actor.pos.y = y; }
  }

  /**
   * A leap: the player's own jump with a longer arc. player.js owns the state
   * machine; this writes the launch into it and lets `stepPlayer` do the
   * physics, so a leap falls, lands and reports `landed.fallMetres` exactly
   * the way a jump does.
   */
  function leap(to, distance) {
    const s = player?.state;
    const from = pos();
    let dx = num(to.x) - num(from.x), dz = num(to.z) - num(from.z);
    const d = Math.hypot(dx, dz);
    if (d > distance) { dx *= distance / d; dz *= distance / d; }
    const travelled = Math.min(d, distance);
    const arc = leapArc(travelled);
    if (s) {
      s.airborne = true;
      s.vy = arc.v0;
      s.peakY = s.y;
      if (arc.air > 0) { s.vx = dx / arc.air; s.vz = dz / arc.air; }
      s.yaw = Math.atan2(dx, dz);
    } else {
      place(num(from.x) + dx, num(from.z) + dz);
    }
    return { metres: travelled, air: arc.air };
  }

  // -------------------------------------------------------- status and mods --

  // This module keeps time in seconds; combat.js and monsters.js read
  // `status.until` in milliseconds (the frame clock). A stun written here in
  // seconds read as long expired over there, so a Frost Nova never held a rat.
  // The shared field is milliseconds; `untilS` keeps the seconds for us.
  function statusOn(who, key, data) {
    if (!who) return;
    who.status = who.status || {};
    const out = { ...data };
    if (Number.isFinite(out.until)) { out.untilS = out.until; out.until = out.until * 1000; }
    who.status[key] = { ...(who.status[key] || {}), ...out };
  }

  /** MP1: an effect of ours landed on another player's mirror; the net system carries it to them. */
  function allyEffect(who, payload) {
    if (typeof deps.onAllyEffect === 'function') { try { deps.onAllyEffect(who, payload); } catch { /* the net is not this file's problem */ } }
  }

  /**
   * MP1: an effect ANOTHER player cast on us, off the wire. The words name the
   * caster, because a green number with no name is indistinguishable from
   * regen. Returns what happened, for the net system's log and the tests.
   */
  function takeRemoteEffect(fromName, payload, now) {
    const t = num(now);
    const who = String(fromName || 'Someone');
    if (!payload || typeof payload !== 'object') return null;
    const ability = ABILITIES_BY_ID[payload.ability];
    const aName = ability ? ability.name : 'a spell';
    if (payload.kind === 'heal') {
      const max = Math.max(1, num(actor.maxHealth) || num(actor.health));
      const before = num(actor.health);
      if (cannotBeHealed(actor)) { say(`${who} tries ${aName} on you, and nothing can heal you while lich form holds.`, 'bad'); return { kind: 'heal', got: 0 }; }
      actor.health = Math.min(max, before + Math.max(0, Math.round(num(payload.amount))));
      const got = actor.health - before;
      if (got > 0) float(pos(), `+${got}`, 'heal');
      say(got > 0 ? `${who} heals you with ${aName}: ${got} health back.` : `${who} casts ${aName} on you, and you were already whole.`, 'good');
      return { kind: 'heal', got };
    }
    if (payload.kind === 'buff') {
      const e = payload.effect || {};
      const held = payload.duration == null;
      addBuff(actor, {
        id: `${payload.ability}:${who}:${t.toFixed(3)}`, abilityId: payload.ability, name: payload.name || aName,
        kind: 'buff', until: held ? Infinity : t + num(payload.duration),
        effect: e, mods: e.mods || null, stats: e.stats || null, form: e.form || null, from: who,
      });
      say(`${who} puts ${payload.name || aName} on you${held ? '' : ` for ${saySeconds(num(payload.duration))}`}.`, 'good');
      return { kind: 'buff' };
    }
    if (payload.kind === 'cure') {
      const removed = [];
      for (const key of payload.removes || []) if (actor.status?.[key]) { delete actor.status[key]; removed.push(key); }
      if (payload.curses && Array.isArray(actor.buffs)) {
        const at = actor.buffs.findIndex((b) => b.kind === 'debuff');
        if (at >= 0) { removed.push(actor.buffs[at].name); actor.buffs.splice(at, 1); recompute(actor); }
      }
      say(removed.length ? `${who} lifts ${removed.join(' and ')} off you.` : `${who} casts ${aName} on you; there was nothing to lift.`, 'good');
      return { kind: 'cure', removed };
    }
    return null;
  }

  function addBuff(who, entry) {
    if (!who) return null;
    who.buffs = Array.isArray(who.buffs) ? who.buffs : [];
    const at = who.buffs.findIndex((b) => b.abilityId === entry.abilityId && b.kind === entry.kind);
    if (at >= 0) who.buffs.splice(at, 1);           // a refresh replaces, never stacks
    who.buffs.push(entry);
    recompute(who);
    return entry;
  }

  // ---------------------------------------------------------- the handlers --
  //
  // Every one of these is reachable from EFFECT_HANDLERS above and every one
  // returns the words for what it did.

  const api = {
    /**
     * A combo runs its parts in order and shares one `hit` list, so Sweep's
     * knockback lands on what Sweep's arc caught rather than on nothing.
     *
     * A leap stops the run. Leap Slam is a jump AND a slam, and the slam has
     * to happen where the player comes down: firing the aoe on the frame the
     * key was pressed would hit whatever was standing at the take-off point
     * and nothing at the landing, which is the ability looking broken while
     * every line of it ran. `onLanded` picks the rest of the parts up.
     */
    doCombo(e, c) {
      const said = [];
      for (let i = 0; i < e.parts.length; i++) {
        const words = runEffect(e.parts[i], c);
        if (words) said.push(words);
        if (c.deferToLanding) {
          landing = { ability: c.ability, fromIndex: i + 1 };
          said.push('The rest of it lands where you do.');
          break;
        }
      }
      return said.join(' ');
    },

    doDamageMult(e, c) {
      const hand = e.hand === 'offHand' ? 'offHand' : 'mainHand';
      const weapon = hand === 'offHand'
        ? (actor.offHandWeapon || offHandWeaponFrom(wornNow()?.offHand, actor.weapon))
        : null;
      if (hand === 'offHand' && !weapon) return `${c.ability.name} needs the dagger in your off hand, and it is not ready.`;
      const opts = {
        abilityId: c.ability.id, name: c.ability.name,
        multiplier: num(e.value) || 1,
        hitBonus: num(e.hitBonus),
        ignoreARFraction: num(e.ignoreARFraction),
        pierceTargets: num(e.pierceTargets) || 1,
        shots: num(e.shots) || 1,
        jumpAttack: airborne(),
        immediate: true,
        hand,
      };
      if (weapon) opts.weapon = weapon;
      if (!c.target) {
        if (e.nextSwing) {
          // The weapon is part of the arming. Power Strike set up for a
          // longsword is not a Power Strike with a bow, and takeNextSwing
          // drops it rather than multiplying a swing it was never for.
          nextSwing = { ...opts, until: c.now + NEXT_SWING_WINDOW, weaponId: weaponIdNow() };
          // An armed shot with a chosen target and no auto attack running fired
          // nothing until the player attacked by hand, which read as "Double
          // Shot only works sometimes". The target you have chosen is the
          // thing to shoot: the auto attack starts on it and the armed swing
          // is the first one out.
          const chosen = targeting?.current;
          if (chosen && typeof attack === 'function' && attack(chosen)) {
            return `${c.ability.name} is set up for your next shot, and you take aim at ${chosen.name || 'it'}.`;
          }
          return `Nothing in reach, so it waits on your next swing for ${saySeconds(NEXT_SWING_WINDOW)}.`;
        }
        return 'Nothing in reach.';
      }
      if (!combat?.queueSwing) return `${c.ability.name} has no arm to swing with yet.`;
      for (let i = 0; i < opts.shots; i++) combat.queueSwing(actor, c.target, opts);
      c.hit.push(c.target);
      const airWords = opts.jumpAttack ? ` from the air, for a quarter more` : '';
      const activeWeapon = opts.weapon || actor.weapon || {};
      const shotWords = opts.shots > 1 ? `${opts.shots} ${activeWeapon.ranged ? 'shots' : 'strikes'} at ` : '';
      return `${shotWords}${Math.round(opts.multiplier * 100)}% on ${c.target.name || 'it'}${airWords}.`;
    },

    doAoe(e, c) {
      const ground = c.ability.target === 'ground';
      const centre = ground ? c.ground : pos();
      const radius = num(e.radius) || 3;
      if (e.delay > 0 && !c.delayed) {
        delayed.push({ at: c.now + e.delay, effect: { ...e }, ctx: { ...c, delayed: true, ground: { ...centre } }, follow: c.follow || null });
        if (e.telegraph) effects?.column?.(centre, radius, effects.colourFor?.(c.ability.id) ?? 0xff7a2a, e.delay);
        else effects?.ring?.(centre, radius, effects?.colourFor?.(c.ability.id) ?? 0xffffff, e.delay);
        return `It falls in ${saySeconds(e.delay)}. Stand clear.`;
      }
      effects?.ring?.(centre, radius, effects?.colourFor?.(c.ability.id) ?? 0xffffff, 0.8);
      const found = inArea(centre, radius, e.arcDegrees, pos(), yaw());
      for (const m of found) c.hit.push(m);
      if (!found.length) {
        return `${c.ability.name} finds nothing inside ${radius} m.`;
      }
      if (e.spellDamage && combat?.queueSpell) {
        for (const m of found) {
          combat.queueSpell(actor, spellFor(c.ability, e.spellDamage), m, { abilityId: c.ability.id, name: c.ability.name, aoe: true });
        }
      } else if (combat?.queueSwing) {
        const mult = num(e.damageMult) || 1;
        for (const m of found) {
          combat.queueSwing(actor, m, {
            abilityId: c.ability.id, name: c.ability.name, multiplier: mult,
            jumpAttack: airborne(), immediate: true, aoe: true,
          });
        }
      } else {
        return `${found.length} within ${radius} m, and nothing to hit them with yet.`;
      }
      return `${found.length} caught within ${radius} m.`;
    },

    doSpellDamage(e, c) {
      if (!c.target) return 'Nothing to cast it at.';
      const spell = spellFor(c.ability, e);
      const deliver = () => {
        if (combat?.queueSpell) combat.queueSpell(actor, spell, c.target, { abilityId: c.ability.id, name: c.ability.name, line: e.line, vs: e.vs });
      };
      const colour = effects?.colourFor?.(c.ability.id) ?? 0xffffff;
      const from = effects?.handPos ? effects.handPos(player || actor) : { ...pos(), y: num(pos().y) + 1.3 };
      if (effects?.bolt) effects.bolt(from, targetPoint(c.target), colour, { onArrive: deliver });
      else deliver();
      c.hit.push(c.target);
      return `${e.min} to ${e.max}${e.type ? ` ${e.type}` : ''} at ${c.target.name || 'it'}.`;
    },

    doHeal(e, c) {
      const who = c.ability.target === 'ally' && c.target ? c.target : actor;
      if (cannotBeHealed(who)) return `${who === actor ? 'Nothing can heal you' : `Nothing can heal ${who.name || 'them'}`} while lich form holds.`;
      const max = Math.max(1, num(who.maxHealth) || num(who.health));
      const before = num(who.health);
      let amount;
      if (e.toFull) amount = max - before;
      else {
        const skill = num((character.skills || {})[e.skill]);
        amount = num(e.base) + skill * num(e.perSkill);
      }
      amount = Math.max(0, Math.round(amount));
      who.health = Math.min(max, before + amount);
      const got = who.health - before;
      if (got > 0) float(who.pos || pos(), `+${got}`, 'heal');
      // MP1: another player's body here is a mirror; the heal has to reach their
      // client, which applies it to the real one and says who did it
      if (who.remote && got > 0) allyEffect(who, { kind: 'heal', ability: c.ability.id, amount: got });
      if (e.once) { actor.usedOnce = actor.usedOnce || {}; actor.usedOnce[c.ability.id] = true; }
      return got > 0
        ? `${got} health back${who === actor ? '' : ` to ${who.name || 'them'}`}.`
        : 'Already whole, so nothing was healed.';
    },

    doDot(e, c) {
      const on = c.hit.length ? c.hit : (c.target ? [c.target] : []);
      if (!on.length) return `Nothing to bleed.`;
      for (const m of on) {
        m.dots = Array.isArray(m.dots) ? m.dots : [];
        m.dots.push({
          source: actor.id ?? 'player', abilityId: c.ability.id,
          perSecond: num(e.perSecond), until: c.now + num(e.duration),
          type: e.type || 'physical', nextTickAt: c.now + 1,
        });
      }
      return `${e.perSecond} a second for ${saySeconds(e.duration)}.`;
    },

    doLeech(e, c) {
      actor.leech = { fraction: num(e.fraction), of: e.of || 'damage', abilityId: c.ability.id, until: c.now + 2 };
      return `Half of what it takes comes back to you.`;
    },

    doControl(e, c) {
      let on = e.radius
        ? inArea(c.ability.target === 'ground' ? c.ground : pos(), e.radius, null, pos(), yaw())
        : (c.hit.length ? c.hit : (c.target ? [c.target] : []));
      // Provoke names two monsters and no radius. Setting one thing on itself
      // is not a fight, so the second is found next to the first, inside the
      // ability's own range.
      if (e.targets > on.length && c.target) {
        const near = inArea(c.target.pos || c.target, num(c.ability.range) || 15, null, pos(), yaw());
        on = [c.target, ...near.filter((m) => m !== c.target)];
      }
      // WHICH FIELD "affects" MEANS. Fear is the one row that names the kinds
      // it touches, `['beast', 'humanoid']`, and it read `m.kind` for them.
      // `actor.js` puts the roster's kind in `family` and writes the literal
      // string 'monster' into `kind` for every body in the game, so the set
      // never matched anything and Fear frightened nobody, ever. `family`
      // first, `kind` behind it for a plain fixture that carries neither.
      const kinds = e.affects ? new Set(e.affects) : null;
      const familyOf = (m) => m.family ?? m.kind;
      const list = on.filter((m) => !kinds || kinds.has(familyOf(m)));
      if (!list.length) {
        return kinds && on.length
          ? `${c.ability.name} does not touch ${[...new Set(on.map((m) => familyOf(m) || 'that'))].join(' or ')}, and that is all there is here.`
          : `Nothing to ${e.effect}.`;
      }
      const want = e.targets ? Math.min(e.targets, list.length) : list.length;
      if (e.targets && list.length < e.targets) {
        return `${c.ability.name} needs ${e.targets} of them and there ${list.length === 1 ? 'is' : 'are'} ${list.length}.`;
      }
      let done = 0, dodged = 0;
      for (let i = 0; i < want; i++) {
        const m = list[i];
        if (e.chance != null && rng() >= e.chance) { dodged++; continue; }
        statusOn(m, e.effect, {
          until: c.now + num(e.duration),
          level: num(e.magnitude) || 1,
          source: actor.id ?? 'player',
          breakOnDamage: !!e.breakOnDamage,
          abilityId: c.ability.id,
        });
        if (e.effect === 'provoke') m.provokedAt = list[(i + 1) % want];
        if (e.dropsAggro || e.effect === 'pacify') monsters?.dropAggro?.(m, actor);
        float(m.pos || pos(), e.effect, 'miss');
        done++;
      }
      const missed = dodged ? `, ${dodged} shook it off` : '';
      return done
        ? `${done} ${controlWord(e.effect)} for ${saySeconds(e.duration)}${missed}.`
        : `None of them took the ${e.effect}.`;
    },

    doMove(e, c) {
      const from = { ...pos() };
      const dist = num(e.distance) || 5;
      if (e.mode === 'leap') {
        const to = c.ability.target === 'ground' ? c.ground : (c.target ? targetPoint(c.target) : groundPoint(c.ability));
        const r = leap(to, dist);
        c.deferToLanding = true;         // doCombo reads this and stops here
        cue('land');
        return `${r.metres.toFixed(1)} m of air.`;
      }
      if (e.mode === 'jump') {
        const s = player?.state;
        if (s && !s.airborne) { s.airborne = true; s.vy = JUMP_V0; s.peakY = s.y; }
        return null;                             // the jump speaks for itself
      }
      let tx = from.x, tz = from.z;
      if (e.mode === 'blink' || e.direction === 'facing' || (!c.target && e.mode !== 'shadowstep')) {
        const back = e.direction === 'backward' ? -1 : 1;
        tx = from.x + Math.sin(yaw()) * dist * back;
        tz = from.z + Math.cos(yaw()) * dist * back;
      } else if (e.mode === 'shadowstep' && c.target) {
        const p = targetPoint(c.target);
        const ty = num(c.target.yaw);
        tx = p.x - Math.sin(ty) * 1.4;
        tz = p.z - Math.cos(ty) * 1.4;
      } else if (c.target) {
        const p = targetPoint(c.target);
        const dx = p.x - from.x, dz = p.z - from.z;
        const d = Math.hypot(dx, dz) || 1;
        const step = Math.min(dist, Math.max(0, d - MELEE_RANGE * 0.8));
        tx = from.x + (dx / d) * step;
        tz = from.z + (dz / d) * step;
      }
      place(tx, tz);
      const gone = Math.hypot(tx - from.x, tz - from.z);
      effects?.burst?.({ x: from.x, y: num(from.y) + 1, z: from.z }, effects.colourFor?.(c.ability.id) ?? 0xffffff, 0.7);
      if (e.mode === 'dash' || e.mode === 'leap') cue('land');
      return gone < 0.05 ? 'Nowhere to go, so you stayed put.' : `${gone.toFixed(1)} m, ${e.mode === 'blink' ? 'gone and back' : e.mode}.`;
    },

    doKnockback(e, c) {
      const on = c.hit.length ? c.hit : inArea(pos(), num(c.ability.range) || 3, null, pos(), yaw());
      if (!on.length) return null;
      const d = num(e.distance) || 1;
      for (const m of on) {
        const p = m.pos || m;
        const dx = num(p.x) - num(pos().x), dz = num(p.z) - num(pos().z);
        const len = Math.hypot(dx, dz) || 1;
        const nx = num(p.x) + (dx / len) * d, nz = num(p.z) + (dz / len) * d;
        if (typeof monsters?.push === 'function') monsters.push(m, nx, nz);
        else if (p.set) p.set(nx, heightAt ? heightAt(nx, nz) : num(p.y), nz);
        else { p.x = nx; p.z = nz; }
      }
      return `${on.length} knocked back ${d} m.`;
    },

    doBuff(e, c) {
      // `targets: 'ally'` is ONE friend, the chosen one, or yourself with none
      // chosen. It fell into the `[actor]` arm below, so a Bless cast at a
      // friend blessed the caster every time (found in the MP1 two tab test).
      const friend = (t) => t && t !== actor && (t.faction === 'player' || t.faction === 'ally') && num(t.health) > 0;
      const who = e.targets === 'allies' || e.targets === 'selfAndAllies'
        ? allies().filter((a) => e.targets === 'selfAndAllies' || a !== actor)
          .filter((a) => !e.radius || flatDistance(pos(), a.pos || a) <= e.radius)
        : e.targets === 'ally' && friend(c.target) ? [c.target]
          : [actor];
      if (!who.length) return 'Nobody close enough to hear it.';
      // A CHANNELLED BUFF HAS NO DURATION AND MUST NOT BE GIVEN ONE. Sprint is
      // `duration: null, channelled: true`, and `now + num(null)` is `now`, so
      // it expired on the very next frame and the log read "Sprint. +100%
      // sprinting for 0 seconds. Sprint runs out." Held is held: it runs until
      // whoever is holding it lets go.
      const held = e.channelled && e.duration == null;
      for (const a of who) {
        // MP1: a group buff on another player's mirror goes to their client as a duration
        if (a.remote) { allyEffect(a, { kind: 'buff', ability: c.ability.id, name: c.ability.name, duration: held ? null : num(e.duration), effect: e }); continue; }
        addBuff(a, {
          id: `${c.ability.id}:${c.now.toFixed(3)}`, abilityId: c.ability.id, name: c.ability.name,
          kind: 'buff', until: held ? Infinity : c.now + num(e.duration),
          effect: e, mods: e.mods || null, stats: e.stats || null, form: e.form || null,
          channelled: !!e.channelled,
        });
        if (e.form) a.form = e.form;
      }
      const list = e.mods ? Object.entries(e.mods).map(([k, v]) => `${v > 0 ? '+' : ''}${typeof v === 'boolean' ? '' : `${Math.round(v * 100)}% `}${k}`).join(', ')
        : e.stats ? Object.entries(e.stats).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k.toUpperCase()}`).join(', ')
          : c.ability.name;
      const how = held ? 'for as long as you hold it' : `for ${saySeconds(e.duration)}`;
      const onWhom = who.length > 1 ? `, on ${who.length} of you` : (who.length === 1 && who[0] !== actor ? `, on ${who[0].name || 'them'}` : '');
      return `${list} ${how}${onWhom}.`;
    },

    doDebuff(e, c) {
      const on = c.hit.length ? c.hit : (c.target ? [c.target] : []);
      if (!on.length) return 'Nothing to curse.';
      for (const m of on) {
        addBuff(m, {
          id: `${c.ability.id}:${c.now.toFixed(3)}`, abilityId: c.ability.id, name: c.ability.name,
          kind: 'debuff', until: c.now + num(e.duration), effect: e, mods: e.mods || null,
        });
      }
      const list = Object.entries(e.mods || {}).map(([k, v]) => `${v > 0 ? '+' : ''}${Math.abs(v) <= 1 ? `${Math.round(v * 100)}%` : v} ${k}`).join(', ');
      return `${on.length === 1 ? (on[0].name || 'it') : `${on.length} of them`}: ${list} for ${saySeconds(e.duration)}.`;
    },

    doSummon(e, c) {
      const skill = num((character.skills || {})[e.skill]);
      const seconds = num(e.duration) + skill * num(e.durationPerSkill);
      const where = c.target ? targetPoint(c.target) : groundPoint(c.ability);
      if (e.source === 'corpse') {
        const corpse = nearestCorpse(pos(), num(c.ability.range) || 6);
        if (!corpse) return `No corpse within ${c.ability.range} m to raise.`;
        where.x = num((corpse.pos || corpse).x); where.z = num((corpse.pos || corpse).z);
      }
      if (!summonHook) return `${e.creature} would rise here, and nothing is wired to raise it yet.`;
      const it = summonHook(e.creature, where, {
        duration: seconds, owner: actor, abilityId: c.ability.id,
        traits: e.traits || null, scalesWithCaster: !!e.scalesWithCaster,
        range: num(c.ability.range) || 30, nowS: c.now,
      });
      // The hook already said what stood up, by its real name and for how
      // long, and said why nothing did when nothing did. Repeating "imp for 60
      // seconds" over the top of it would put the CREATURE ID on screen, which
      // is not a word anybody reads.
      return null;
    },

    doAbsorb(e, c) {
      actor.absorb = { source: e.source, ratio: num(e.ratio) || 1, until: c.now + num(e.duration), abilityId: c.ability.id };
      return `Damage comes off ${e.source} at ${e.ratio}:1 for ${saySeconds(e.duration)}.`;
    },

    doZone(e, c) {
      const centre = c.ability.target === 'ground' || e.zoneKind === 'trap' ? c.ground : pos();
      const z = {
        zoneKind: e.zoneKind, x: num(centre.x), z: num(centre.z), y: num(centre.y),
        radius: num(e.radius) || 3, until: c.now + num(e.duration),
        applies: e.applies || null, triggers: e.triggers || null,
        owner: actor, abilityId: c.ability.id, name: c.ability.name, fired: new Set(),
      };
      zones.push(z);
      effects?.ring?.(centre, z.radius, effects?.colourFor?.(c.ability.id) ?? 0xffffff, num(e.duration), 0.35);
      return `A ${e.zoneKind} of ${z.radius} m for ${saySeconds(e.duration)}.`;
    },

    doCure(e, c) {
      const who = c.target && c.ability.target === 'ally' ? c.target : (c.target || actor);
      const removed = [];
      for (const key of e.removes || []) {
        if (who.status?.[key]) { delete who.status[key]; removed.push(key); }
      }
      if (e.curses && Array.isArray(who.buffs)) {
        const at = who.buffs.findIndex((b) => b.kind === 'debuff');
        if (at >= 0) { removed.push(who.buffs[at].name); who.buffs.splice(at, 1); recompute(who); }
      }
      if (who.remote) allyEffect(who, { kind: 'cure', ability: c.ability.id, removes: e.removes || [], curses: !!e.curses });
      return removed.length ? `${removed.join(' and ')} gone.` : 'There was nothing on them to lift.';
    },

    doResurrect(e, c) {
      const who = c.target;
      if (!who) return 'Nobody here to raise.';
      if (typeof deps.resurrect !== 'function') return `${who.name || 'They'} would stand, and nothing is wired to raise the fallen yet.`;
      // THE HOOK SAYS WHAT HAPPENED, not this file. Raising the player out of
      // the death count, raising a summon that fell and refusing somebody who
      // never went down are three different sentences, and only the hook knows
      // which one it just did. A hook that answers nothing gets the old line.
      const words = deps.resurrect(who, actor);
      if (typeof words === 'string' && words) return words;
      return `${who.name || 'They'} stand${who.name ? 's' : ''} again.`;
    },

    doStealth(e, c) {
      actor.hidden = {
        since: c.now, requiresStill: !!e.requiresStill, inCombat: !!e.inCombat,
        movementNeedsSkill: e.movementNeedsSkill || null, abilityId: c.ability.id,
      };
      if (e.dropAggro) monsters?.dropAggro?.(null, actor);
      return e.requiresStill ? 'Out of sight while you stay still.' : 'Out of sight.';
    },

    doWeaponEnchant(e, c) {
      const skill = num((character.skills || {})[e.skill]);
      actor.enchant = {
        damageType: e.damageType, vs: e.vs || null, mult: num(e.mult) || 1,
        until: e.duration ? c.now + num(e.duration) : Infinity,
        hitsLeft: e.hits ?? Infinity,
        level: e.levelPerSkill ? Math.max(1, Math.floor(skill * e.levelPerSkill)) : null,
        abilityId: c.ability.id,
      };
      const forHow = e.duration ? `for ${saySeconds(e.duration)}` : `for ${e.hits} hit${one(e.hits)}`;
      return `Your weapon runs ${e.damageType} ${forHow}.`;
    },

    /**
     * Passives never come through `use`: canUse refuses them by name. This is
     * the reader for `applyPassives()`, which is called on create and after
     * every skill change, so a passive is data on the actor that recompute and
     * combat can find rather than a row nothing consults.
     */
    doPassiveMod(e, c) {
      actor.passives = actor.passives || {};
      const tierBonus = {};
      for (const t of e.tiers || []) {
        if (num((character.skills || {})[t.skill]) >= num(t.at)) Object.assign(tierBonus, t.mods || {});
      }
      actor.passives[c.ability.id] = { ...(e.mods || {}), ...tierBonus };
      recompute();
      return null;
    },

    doUtility(e, c) {
      const fn = utility[e.action];
      if (typeof fn === 'function') {
        const words = fn(e, { ability: c.ability, actor, character, target: c.target, now: c.now });
        return typeof words === 'string' ? words : `${c.ability.name} done.`;
      }
      if (e.action === 'meditate') {
        actor.meditating = { since: c.now, manaRegenMult: num(e.manaRegenMult) || 3, breaks: e.breaks || [] };
        return `You sit. Mana comes back ${e.manaRegenMult} times as fast until you move.`;
      }
      return `${c.ability.name} needs the ${e.action} code, which is not wired yet, so nothing happened and nothing was spent beyond the cost.`;
    },

    doChain(e, c) {
      const first = c.hit[0] || c.target;
      if (!first) return 'Nothing to chain from.';
      const jumped = [];
      let from = first;
      const seen = new Set([first]);
      for (let i = 0; i < num(e.targets); i++) {
        const near = inArea(from.pos || from, 6, null, pos(), yaw()).filter((m) => !seen.has(m));
        if (!near.length) break;
        const nxt = near[0];
        seen.add(nxt);
        const falloff = Array.isArray(e.falloff) ? (e.falloff[i] ?? e.falloff[e.falloff.length - 1]) : num(e.falloff);
        const base = findSpell(c.ability.effect);
        if (base && combat?.queueSpell) {
          combat.queueSpell(actor, spellFor(c.ability, base, falloff), nxt, { abilityId: c.ability.id, name: c.ability.name, chain: i + 1 });
        }
        effects?.bolt?.(targetPoint(from), targetPoint(nxt), effects.colourFor?.(c.ability.id) ?? 0xffffff, {});
        c.hit.push(nxt);
        jumped.push(nxt.name || 'it');
        from = nxt;
      }
      return jumped.length ? `It jumped to ${jumped.join(', then ')}.` : 'Nothing else close enough to jump to.';
    },

    doCorpseBurst(e, c) {
      const corpse = nearestCorpse(pos(), num(e.searchRange) || 10);
      if (!corpse) return `No corpse within ${e.searchRange} m to burst.`;
      const at = corpse.pos || corpse;
      const found = inArea(at, num(e.radius) || 4, null, pos(), yaw());
      effects?.burst?.({ x: num(at.x), y: num(at.y) + 0.6, z: num(at.z) }, effects.colourFor?.(c.ability.id) ?? 0xff7a2a, 1.6);
      if (!found.length) return `The corpse went up and caught nobody.`;
      for (const m of found) {
        if (combat?.queueSpell) combat.queueSpell(actor, { id: c.ability.id, base: [num(e.min), num(e.max)], damageType: 'physical' }, m, { abilityId: c.ability.id, name: c.ability.name });
        c.hit.push(m);
      }
      monsters?.removeCorpse?.(corpse);
      return `${found.length} caught in the burst.`;
    },

    doPlague(e, c) {
      if (!c.target) return 'Nothing to plague.';
      statusOn(c.target, 'plague', {
        until: c.now + 20, onSpellHit: e.onSpellHit || null, type: e.type || 'poison',
        source: actor.id ?? 'player', abilityId: c.ability.id,
      });
      if (combat?.queueSpell) combat.queueSpell(actor, { id: c.ability.id, base: [num(e.initial), num(e.initial)], damageType: e.type || 'poison' }, c.target, { abilityId: c.ability.id, name: c.ability.name });
      c.hit.push(c.target);
      return `${e.initial} ${e.type}, and every spell you land on it now bursts.`;
    },

    doMark(e, c) {
      if (!c.target) return 'Nothing to mark.';
      c.target.marks = Array.isArray(c.target.marks) ? c.target.marks : [];
      c.target.marks = c.target.marks.filter((m) => m.abilityId !== c.ability.id);
      const mark = {
        abilityId: c.ability.id, name: c.ability.name, damageTakenMult: num(e.damageTakenMult) || 1,
        until: c.now + num(e.duration), from: e.fromCasterOnly ? (actor.id ?? 'player') : null,
        preventsHide: !!e.preventsHide,
      };
      c.target.marks.push(mark);
      if (typeof onMark === 'function') { try { onMark(c.target, mark); } catch (err) { console.warn('onMark threw', err); } }
      const pct = Math.round((num(e.damageTakenMult) - 1) * 100);
      return `${c.target.name || 'It'} takes ${pct}% more ${e.fromCasterOnly ? 'from you' : 'from everyone'} for ${saySeconds(e.duration)}.`;
    },

    /**
     * The bandage's four seconds ARE its cast, not a second timer after it:
     * abilities.js gives it castTime 4 and moving false, so the cast bar is
     * the binding. This runs when that bar fills. `interruptedByDamage` is
     * honoured in `onDamaged`, where ANY blow ends it rather than only one
     * over a tenth of your health, because that is what the document says
     * about bandages in particular.
     */
    doBandage(e, c) {
      const who = c.target && c.target.faction === 'player' ? c.target : actor;
      if (cannotBeHealed(who)) return `A bandage will not close a wound on ${who === actor ? 'you' : (who.name || 'them')} while lich form holds.`;
      const skills = character.skills || {};
      const amount = Math.round(num(skills.healing) * num(e.perHealing) + num(skills.anatomy) * num(e.perAnatomy));
      const max = Math.max(1, num(who.maxHealth) || num(who.health));
      const before = num(who.health);
      who.health = Math.min(max, before + amount);
      const got = who.health - before;
      if (got > 0) float(who.pos || pos(), `+${got}`, 'heal');
      let extra = '';
      if (num(skills.healing) >= num(e.curePoisonAt) && who.status?.poison) {
        delete who.status.poison;
        extra = ' The poison is drawn out.';
      }
      return got > 0
        ? `The wound is bound. ${got} health back.${extra}`
        : `The wound is bound and there was nothing to close.${extra}`;
    },
  };

  // -------------------------------------------------------------- plumbing --

  function findSpell(effect) {
    if (!effect) return null;
    if (effect.kind === 'spellDamage') return effect;
    if (effect.kind === 'combo') for (const p of effect.parts) { const f = findSpell(p); if (f) return f; }
    return null;
  }

  /**
   * The shape combat_rules.resolveSpell wants, scaled by a chain's falloff.
   *
   * LICH FORM'S THIRTY PERCENT LANDS HERE. `mods.necromancyDamage` is the one
   * mod in the table that is not "more damage" but "more damage of one school",
   * so combat_rules has no line for it and actor.js sums it into a bonus of its
   * own. This is the only reader: a necromancy row's base is raised by it and
   * every other school is untouched, which is what the row promises.
   */
  function spellFor(ability, roll, falloff = 1) {
    const school = ability.skill === 'necromancy' ? 1 + num(actor.bonuses?.necromancyDamage) : 1;
    return {
      id: ability.id, name: ability.name,
      base: [num(roll.min) * falloff * school, num(roll.max) * falloff * school],
      damageType: roll.type || 'energy',
      line: !!roll.line, vs: roll.vs || null,
    };
  }

  /**
   * Lich Form says "nobody can help you", and `mods.cannotBeHealed` is how the
   * row says it. actor.js's recompute puts the word in `actor.powers`; this is
   * the reader, and it refuses out loud rather than healing zero in silence.
   */
  const cannotBeHealed = (who) => Array.isArray(who?.powers) && who.powers.includes('cannotBeHealed');

  const targetPoint = (t) => {
    const p = t?.pos || t || {};
    return { x: num(p.x), y: num(p.y) + 1.1, z: num(p.z) };
  };

  function walkRuntimeEffect(effect, visit) {
    if (!effect) return;
    visit(effect);
    if (effect.kind === 'combo') for (const p of effect.parts || []) walkRuntimeEffect(p, visit);
    if (effect.applies) walkRuntimeEffect(effect.applies, visit);
  }

  function requirementFlags(ability) {
    const out = new Set();
    walkRuntimeEffect(ability?.effect, (e) => { if (e.requires) out.add(e.requires); });
    return out;
  }

  function behindTarget(target) {
    if (!target) return false;
    const p = target.pos || target;
    const dx = num(pos().x) - num(p.x), dz = num(pos().z) - num(p.z);
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return false;
    const ty = num(target.yaw);
    const facingDot = (Math.sin(ty) * dx + Math.cos(ty) * dz) / d;
    return facingDot < -0.35;
  }

  function effectRequirements(ability, target) {
    const flags = requirementFlags(ability);
    if (flags.has('behindOrHidden') && !actor.hidden && !behindTarget(target)) {
      return { ok: false, reason: `${ability.name} needs the target's back, or your hiding.` };
    }
    if (flags.has('targetBelowHalf')) {
      const max = Math.max(1, num(target?.maxHealth) || num(target?.health));
      if (!target || num(target.health) >= max / 2) {
        return { ok: false, reason: `${ability.name} needs a target under half health.` };
      }
    }
    return { ok: true };
  }

  function revealHidden(reason) {
    if (!actor.hidden) return false;
    actor.hidden = null;
    stealthAt = 0;
    say(reason, 'bad');
    return true;
  }

  function breaksHidden(ability) {
    if (!ability || ability.id === 'hide') return false;
    let hostile = ability.target === 'enemy' || ability.target === 'corpse';
    walkRuntimeEffect(ability.effect, (e) => {
      if (['damageMult', 'aoe', 'spellDamage', 'dot', 'control', 'debuff', 'corpseBurst', 'plague', 'mark'].includes(e.kind)) hostile = true;
    });
    return hostile;
  }

  function nearestCorpse(at, range) {
    if (typeof monsters?.corpsesNear === 'function') return monsters.corpsesNear(at, range)?.[0] || null;
    let best = null, bd = range;
    for (const m of allTargets()) {
      if (num(m.health) > 0 && !m.dead) continue;
      const d = flatDistance(at, m.pos || m);
      if (d <= bd) { bd = d; best = m; }
    }
    return best;
  }

  function runEffect(effect, ctx) {
    const handler = EFFECT_HANDLERS[effect?.kind];
    if (!handler) {
      // auditEffectHandlers makes this unreachable for the shipped table, and
      // it still says so rather than swallowing a spell someone paid for.
      say(`${ctx.ability.name} has an effect this build does not know how to run (${effect?.kind}).`, 'bad');
      return null;
    }
    return handler(effect, ctx);
  }

  /** The moment the ability actually happens. */
  function fire(ability, target, now, ground, follow = null) {
    const ctx = {
      ability, target, now, api, hit: [], follow,
      ground: ground || (ability.target === 'ground' ? groundPoint(ability) : { ...pos() }),
    };
    const words = runEffect(ability.effect, ctx);
    // The visual is told where the spell actually went, not where it was
    // pointed. A chain resolves its hops in here, and until this call the bolt
    // has only the first of them; see spell_vfx.js's `retarget`.
    spellVfx?.retarget?.({
      target: target || null,
      ground: ctx.ground,
      links: ctx.hit && ctx.hit.length ? ctx.hit : null,
    });
    if (words) say(`${ability.name}. ${words}`, 'ability');
    else say(`${ability.name}.`, 'ability');
    teach(ability, true, target);
    effects?.hideGroundRing?.();
    return ctx;
  }

  /**
   * "Using an ability is a lesson in its skill at its minSkill + 20."
   *
   * `success` is false for a cast the armour fumbled. progression.lesson's own
   * rule is that "a failure still teaches, at half the chance", so a plated
   * mage does learn Magery from a morning of fizzling, at half the rate of one
   * in a robe, and the reduced gain costs this file nothing but the flag.
   */
  function teach(ability, success = true, target = null) {
    if (!progression?.lesson) return;
    const l = lessonFor(ability);
    let skill = l.skill;
    if (ability.skillAny) skill = actor.weapon?.skill || character.equipment?.mainHand?.skill || l.skill;
    // "Veterinary: the same, for animals and summons" (01-STATS-SKILLS.md). A
    // bandage is a bandage; who it is wrapped around is what decides which
    // skill it teaches, and a pet is anything on your side that is not you.
    // Without this line Veterinary had no path at all: no ability names it, no
    // recipe uses it, and the only way to raise it was to pay Brannoc.
    if (skill === 'healing' && isPet(target)) skill = 'veterinary';
    if (!skill) return;
    // W1's progression teaches the character it was built with: (skillId, difficulty, success, rng)
    try { progression.lesson(skill, l.difficulty, !!success, rng); } catch (err) { /* a lesson is never worth a crash */ }
  }

  /** On your side, alive, and not you. A summon, a raised skeleton, a tamed thing. */
  function isPet(who) {
    return !!who && who !== actor && who !== player && who.faction === 'player';
  }

  /**
   * THE FUMBLE, which is the price of being allowed to try.
   *
   * `openAt` lets a character hold the first rung of a school at 0 (see
   * abilities.js). This is what stops that being a gift: below the row's own
   * mark the attempt mostly comes apart, and abilities.js owns the curve. It
   * still costs, it still says what happened, and it still TEACHES at the
   * reduced chance skills.js gives a failed lesson, which is the only way a
   * school with no other door can be started without paying a trainer.
   *
   * True when it came apart, and then it has already said so.
   */
  function fumbled(ability, rec, target) {
    const chance = practiceChance(ability, character.skills || {});
    if (chance >= 1) return false;
    if (rng() < chance) return false;
    const back = refund(rec);
    spellVfx?.interrupt?.('fizzled');
    say(
      `${ability.name} fizzles: your hand is not practised. You feel a little of how it should go.${back ? ` ${back}.` : ''}`,
      'bad',
    );
    float(pos(), `${ability.name} fizzles`, 'miss');
    cue('denied');
    teach(ability, false, target);
    return true;
  }

  /**
   * The armour's roll, taken the moment the spell would land rather than when
   * it was begun: a cast you paid for and stood still through can still come
   * apart at the end, which is what "fizzle" has meant since Ultima.
   *
   * True when it failed, and then it has already said so: half the mana back,
   * the denied cue, a sentence naming the material, a grey word over your own
   * head, and a lesson at a failure's reduced chance. Nothing silent.
   */
  function fizzled(ability, rec, now) {
    const burden = num(rec && rec.burden);
    if (burden <= 0) return false;
    if (rng() >= fizzleChance(burden)) return false;
    const back = refund(rec);
    const armour = armourWords() || 'your armour';
    // A spell that took the mana and vanished with no picture is
    // indistinguishable from a dead key. The gather coughs out and stops.
    spellVfx?.interrupt?.('fizzled');
    say(`${ability.name} fizzles: your ${armour} gets in the way.${back ? ` ${back}.` : ''}`, 'bad');
    float(pos(), `fizzle: ${burdenSources(wornNow())[0] || 'armour'}`, 'miss');
    cue('denied');
    teach(ability, false);
    return true;
  }

  /**
   * Fire, unless the armour ate it or the hand did. Every cast that finishes
   * comes through here, and the two rolls are in the order a player would tell
   * the story in: the armour first, because it was in the way from the start,
   * and then the hand, because that is the part practice fixes.
   */
  function land(ability, rec, target, now, ground, follow = null) {
    if (fizzled(ability, rec, now)) return null;
    if (fumbled(ability, rec, target)) return null;
    return fire(ability, target, now, ground, follow);
  }

  /** Where a ground ability lands now: under the body it was aimed at while that body is up, else where it was pointed. */
  function followPoint(rec) {
    const f = rec && rec.follow;
    if (f && num(f.health) > 0 && !f.dead && (f.pos || f).x != null) return { ...targetPoint(f) };
    return rec ? rec.ground : null;
  }

  // ------------------------------------------------------------------ use --

  /**
   * By id, so the Abilities window and a bar slot go down the same road.
   *
   * `opts.target` is the actor a held spell was finally pointed at. It skips
   * the search entirely, which is what makes the click that chooses a target
   * and a press with a target already chosen the same code path and not two.
   */
  /**
   * A refusal is said over the player's head as well as in the log. "It works
   * at times and not at others" (2026-09-08) was mana, a practice fumble, no
   * target or armour in turn, each one a line in the small log nobody reads in
   * a fight. The float is the first clause of the reason, so "Ward costs 25
   * mana and you have 3" floats as "Ward costs 25 mana".
   */
  function useById(id, now, opts = {}) {
    const r = useByIdQuietly(id, now, opts);
    if (r && r.ok === false && r.reason && !r.pending) {
      const brief = String(r.reason).split(/[,.:;]| and you /)[0].trim().slice(0, 44);
      if (brief) float(pos(), brief, 'miss');
    }
    return r;
  }

  function useByIdQuietly(id, now, opts = {}) {
    const ability = ABILITIES_BY_ID[id];
    if (!ability) { say(`There is no ability called ${id}.`, 'bad'); return { ok: false, reason: 'unknown' }; }
    const t = num(now);

    // Pressing a second key puts the first spell down. Saying so matters: the
    // cursor is about to stop being a crosshair and the player has to know why.
    // Pressing the SAME key again is a change of mind, not a fresh press, so it
    // puts the spell down and stops there rather than picking it straight up.
    if (waiting && !opts.fromPending) {
      const again = waiting.ability.id === ability.id;
      cancelPending(again ? 'you pressed it again' : `you reached for ${ability.name} instead`);
      if (again) return { ok: false, reason: 'let go', cancelled: true };
    }

    if (cast) { say(`You are already casting ${cast.name}.`, 'bad'); cue('denied'); return { ok: false, reason: 'casting' }; }

    const check = canUse(ability, snapshot(t), t);
    if (!check.ok) { say(check.reason, 'bad'); cue('denied'); return { ok: false, reason: check.reason }; }

    // A target, where one is needed, before a coin of the cost is spent.
    let target = null, ground = null, follow = null;   // follow: the body a ground ability was aimed at
    if (opts.target !== undefined) {
      target = opts.target;
    } else if (ability.target === 'enemy' || ability.target === 'corpse') {
      const found = acquire(ability);
      target = found.target;
      if (!target && ability.target === 'enemy' && !ability.effect?.nextSwing) {
        // THE FALLBACK, and it is why magery felt dead. `acquire` asks three
        // questions in order (the target you chose, the thing under the
        // cursor, the nearest in a 120 degree cone) and used to give up on all
        // three: a chosen target out of reach ended the press outright, and
        // nothing in the cone parked the spell on the cursor waiting for a
        // click most players never learned they had to make. Six seconds later
        // it said it had let go, and the whole press read as a key that did
        // nothing. So before either of those, the last question: is there
        // anything hostile AT ALL within this ability's reach, in any
        // direction. If there is, that is who you meant, and it is said out
        // loud so the choice is never made behind your back.
        const near = anyHostileInRange(ability);
        if (near) {
          target = near;
          targeting?.set?.(near, 'ability');
          say(`${ability.name} goes to the ${near.name || 'nearest thing'}: it is what is in reach.`, 'ability');
        } else if (found.outOfRange) {
          say(`${ability.name}: ${found.reason}. Walk closer.`, 'bad'); cue('denied');
          return { ok: false, reason: found.reason, outOfRange: true, dist: found.dist };
        } else {
          return holdForTarget(ability, opts.slot, t);
        }
      }
    } else if (ability.target === 'ally') {
      target = targeting?.current && targeting.current.faction === 'player' ? targeting.current : actor;
    } else if (ability.target === 'ground') {
      // A ground ability lands ON WHAT YOU ARE FIGHTING when there is no
      // cursor to say otherwise. See groundPoint.
      const found = acquire(ability);
      target = found.target || found.blocked || anyHostileInRange(ability) || null;
      // A GROUND ABILITY AIMED AT A BODY FOLLOWS THE BODY. The point was fixed at
      // the press, and a bandit charging at 6 m a second was five metres past it
      // by the time a 0.8 s Volley and its rain came down: "Volley finds nothing
      // inside 5 m", pressed with the cursor square on the bandit (2026-09-08).
      // So a hostile under the cursor, or the chosen target, is what the ability
      // is for, and the centre is read off it again at the release and again at
      // the fall. Bare ground with nothing hostile in reach is still the cursor.
      follow = target && isTargetable(target, actor) ? target : null;
      ground = follow ? { ...targetPoint(follow) } : groundPoint(ability, target);
      const radius = ability.effect?.radius || ability.effect?.parts?.find?.((p) => p.radius)?.radius || 3;
      effects?.showGroundRing?.(ground, radius, effects.colourFor?.(ability.id) ?? 0xffffff);
    } else {
      const found = acquire(ability);
      target = found.target;            // self and ground abilities still like to know
    }

    const req = effectRequirements(ability, target);
    if (!req.ok) { say(req.reason, 'bad'); cue('denied'); return { ok: false, reason: req.reason }; }

    const rec = startCast(ability, snapshot(t), t, target);
    if (rec.error) { say(rec.error, 'bad'); cue('denied'); return { ok: false, reason: rec.error }; }

    // You look at what you are about to hit. This is before the cast starts, so
    // a three second Meteor is aimed from the first frame and not the last.
    if (target && target !== actor) faceTowards(target);

    const paid = pay(rec);
    cooldowns[ability.id] = rec.cooldownUntil;
    rec.ground = ground;
    rec.follow = follow;
    rec.startedMoving = moving();
    if (breaksHidden(ability)) revealHidden('You are seen.');

    // The armour, before the bar is drawn and before the clock is set: a cast
    // in plate is twice as long, and the record carries the number so the bar,
    // the sentence and the moment it lands are all the same one. The fizzle
    // roll waits for the landing; see fizzled().
    rec.burden = burdenFor(ability);
    if (rec.burden > 0) {
      rec.castTime = burdenedCastTime(ability.castTime, rec.burden);
      rec.endsAt = rec.startedAt + rec.castTime;
    }

    // THE SPELL YOU CAN SEE, started once, for both branches below, and after
    // the armour has had its say so a cast slowed by plate gathers for exactly
    // as long as its bar really runs. spell_vfx.js owns everything after this:
    // which effect, which element, which socket, and when the hand opens.
    spellVfx?.start?.(ability.id, {
      ability,
      castTime: rec.castTime,
      // an armed shot has no target of its own; the arrows should still fly at
      // the thing you have chosen and not at the camera
      target: target || (ability.effect?.nextSwing ? (targeting?.current || null) : null),
      ground: ground || (ability.target === 'ground' ? groundPoint(ability, target) : null),
    });

    if (rec.castTime > 0) {
      cast = rec;
      effects?.cast?.(player, rec.castTime, effects.colourFor?.(ability.id) ?? 0xffffff);
      const slower = rec.castTime > ability.castTime ? `, slowed by your ${armourWords() || 'armour'}` : '';
      say(`${ability.name}: casting for ${saySeconds(rec.castTime)}${slower}${ability.rooted ? ', and moving ends it' : ''}.`, 'ability');
      return { ok: true, casting: true, paid, record: rec };
    }

    // An instant spell still has an armour roll, and it is taken here rather
    // than inside fire(), so a fizzled Lightning never reaches its effect.
    if (fizzled(ability, rec, t)) return { ok: true, casting: false, fizzled: true, paid, record: rec };

    // And the hand's own roll, for a row held below its mark. Same place, same
    // reason: a fumbled Hex must never reach its effect.
    if (fumbled(ability, rec, target)) return { ok: true, casting: false, fumbled: true, paid, record: rec };

    if (ability.effect?.kind === 'damageMult' || ability.effect?.parts?.some?.((p) => p.kind === 'damageMult')) {
      effects?.swing?.(player);
      if (ability.skill === 'archery' || ability.skill === 'marksmanship') cue('bowShot');
    }
    fire(ability, target, t, ground, follow);
    return { ok: true, casting: false, paid, record: rec };
  }

  /** By slot, which is what a key press means. */
  function use(slot, now) {
    const i = Math.trunc(num(slot));
    if (i < 0 || i >= BAR_SLOTS) { say(`There is no slot ${i + 1}.`, 'bad'); return { ok: false, reason: 'no such slot' }; }
    const bar = Array.isArray(character.bar) ? character.bar : [];
    const id = bar[i];
    if (!id) { say(`Slot ${BAR_KEYS[i]} is empty. Drag an ability onto it in the Abilities window.`, 'bad'); return { ok: false, reason: 'empty slot' }; }
    return useById(id, now, { slot: i });
  }

  /**
   * The click that answers "who?". main.js routes its click here whenever
   * `abilities.pending` is set, BEFORE the auto attack, so choosing a target
   * for a spell is not also a swing at it.
   *
   * `hit` is the actor, or a monster record carrying one, or null for a click
   * on bare ground. Returns null when nothing was waiting, so main.js can call
   * it without asking first.
   */
  function onTargetPicked(hit, now) {
    if (!waiting) return null;
    const t = num(now);
    const held = waiting;
    const who = hit?.actor || hit || null;

    if (!who) { cancelPending('you clicked bare ground'); return { ok: false, reason: 'no target there' }; }
    if (!isTargetable(who, actor)) {
      cancelPending(`${who.name || 'that'} is not something ${held.ability.name} can be aimed at`);
      return { ok: false, reason: 'not a target' };
    }
    const range = rangeOf(held.ability);
    const d = flatDistance(pos(), who.pos || who);
    if (d > range) {
      cancelPending(`${who.name || 'it'} is ${d.toFixed(1)} m away and the reach is ${range} m`);
      cue('denied');
      return { ok: false, reason: 'out of range', outOfRange: true, dist: d };
    }

    waiting = null;
    // The chosen one becomes the target proper, so the frame at the top of the
    // screen shows who the spell went to.
    targeting?.set?.(who, 'pick');
    return useById(held.ability.id, t, { target: who, fromPending: true, slot: held.slot });
  }

  // --------------------------------------------------------------- damage --

  /**
   * W2's combat calls this through main.js whenever the player takes a blow.
   * Damage over a tenth of max health can break a rooted cast; Focus is the
   * saving throw and abilities.js owns the arithmetic.
   */
  function onDamaged(amount, now) {
    const t = num(now);
    revealHidden('You are seen.');
    if (!cast) return { interrupted: false, reason: 'nothing casting' };

    // The bandage is the exception the document writes out in words:
    // "interrupted by damage", with no tenth-of-your-health threshold and no
    // Focus saving throw. Any blow at all ends it.
    if (breaksOnAnyDamage(cast)) {
      const r = { interrupted: true, chance: 1, reason: `the blow ended ${cast.name}` };
      breakCast(r.reason, t);
      return r;
    }

    const r = interruptRule(cast, { type: 'damage', amount: num(amount), maxHealth: num(actor.maxHealth), roll: rng() });
    // FOCUS LEARNS HERE, and nowhere else in the game. "Stamina regeneration
    // and resistance to interruption" is what the skill does, `interruptChance`
    // is the only rule that reads it, and this is the only moment that rule
    // runs. Without this line no ability, recipe, vein or swing named Focus at
    // all and Aldric's drill was the whole of it. A blow you held through is
    // the lesson that landed; one that broke the cast still teaches, at the
    // reduced chance skills.js gives a failure. The difficulty is the cast's
    // own, so holding a Meteor together is worth more than holding a Heal.
    if (r.chance > 0) {
      const l = lessonFor(ABILITIES_BY_ID[cast.abilityId] || { minSkill: 0 });
      try { progression?.lesson?.('focus', l.difficulty, !r.interrupted, rng); } catch (err) { /* a lesson is never worth a crash */ }
    }
    if (!r.interrupted) {
      if (r.chance > 0) say(r.reason, 'ability');
      return r;
    }
    breakCast(r.reason, t);
    return r;
  }

  /** True for a cast whose own effect says any damage ends it. */
  function breaksOnAnyDamage(rec) {
    const ability = ABILITIES_BY_ID[rec?.abilityId];
    let found = false;
    const walk = (e) => {
      if (!e || found) return;
      if (e.kind === 'bandage' && e.interruptedByDamage !== false) found = true;
      if (e.kind === 'combo') e.parts.forEach(walk);
      if (e.applies) walk(e.applies);
    };
    walk(ability?.effect);
    return found;
  }

  function tickDots(m, t) {
    for (let i = m.dots.length - 1; i >= 0; i--) {
      const d = m.dots[i];
      while (num(m.health) > 0 && t >= d.nextTickAt && d.nextTickAt <= d.until + 1e-6) {
        const n = Math.max(1, Math.round(num(d.perSecond)));
        if (typeof combat?.hurt === 'function') combat.hurt(m, n, { now: t * 1000, kind: d.type || 'damage', killer: actor });
        else { m.health = Math.max(0, num(m.health) - n); float(m.pos || m, String(n), 'damage'); }
        d.nextTickAt += 1;
      }
      if (t >= d.until || num(m.health) <= 0) m.dots.splice(i, 1);
    }
  }

  function breakCast(reason, now) {
    if (!cast) return;
    const back = refund(cast);
    effects?.stopCast?.(player);
    spellVfx?.interrupt?.(reason);
    say(`${reason}.${back ? ` ${back}.` : ''} ${cast.name} is still cooling.`, 'bad');
    cue('denied');
    cast = null;
  }

  // --------------------------------------------------------------- update --

  function update(dt, now) {
    const t = num(now);

    // 1. the bar. One key, one slot.
    //
    // `enabled()` is the boot's gate: a window, the market or a death takes
    // the keyboard away from the bar. It used to have a second job, because
    // keys 1 to 4 were ALSO the farm's tool row and two handlers on one press
    // was a swing and a tool change at once. T3 took that row off the screen,
    // so the twelve the runtime contract names, 1 to 0 and minus and equals,
    // are the bar's outright. See docs/mmo/wiring/T3-NO-TOOL-BAR.md.
    if (input?.pressed && barEnabled()) {
      for (let i = 0; i < BAR_SLOTS; i++) if (input.pressed(BAR_KEYS[i])) use(i, t);
    }

    // 1b. a spell held on the cursor. Escape puts it down, and so does simply
    // waiting: a crosshair that never goes away is a game that has forgotten
    // what it asked you. Escape is read whatever `enabled()` says, because the
    // held spell owns the cursor even while a window is up.
    if (waiting) {
      if (input?.pressed?.('escape')) cancelPending('you changed your mind');
      else if (t - waiting.startedAt >= PENDING_SECONDS) {
        cancelPending(`nothing was chosen in ${saySeconds(PENDING_SECONDS)}`);
      }
    }

    // 2. the cast in flight
    if (cast) {
      if (cast.rooted && moving()) {
        const r = interruptRule(cast, { type: 'move' });
        if (r.interrupted) breakCast(r.reason, t);
      }
    }
    if (cast && t >= cast.endsAt) {
      const ability = ABILITIES_BY_ID[cast.abilityId];
      const rec = cast;
      cast = null;
      effects?.stopCast?.(player);
      land(ability, rec, rec.target, t, followPoint(rec), rec.follow);
    }

    // 3. delayed effects: Meteor's fall, Volley's rain
    for (let i = delayed.length - 1; i >= 0; i--) {
      if (t >= delayed[i].at) {
        const p = delayed.splice(i, 1)[0];
        // the rain and the meteor come down on the body they were aimed at, where it is now
        const f = p.follow;
        const ground = f && num(f.health) > 0 && !f.dead ? { ...targetPoint(f) } : p.ctx.ground;
        const ctx = { ...p.ctx, now: t, api, hit: [], ground };
        const words = runEffect(p.effect, ctx);
        say(`${p.ctx.ability.name} lands. ${words || ''}`.trim(), 'ability');
      }
    }

    // 4. buffs and debuffs run out, and the pools have to follow
    expire(actor, t);
    for (const m of allTargets()) if (Array.isArray(m.buffs) && m.buffs.length) expire(m, t);

    // 4b. damage over time ticks. doDot wrote `m.dots` and, until the in-game
    // sweep of 2026-09-08, nothing read it: Fireball's "2 a second for 4
    // seconds", Rend's bleed and Rift's 10 a second were a line and no more.
    // One tick a second from the second after it was laid, the last one on the
    // duration, through combat's hurt so a kill is credited and a floater shows
    // each tick; the harness fallback takes the health off directly.
    for (const m of allTargets()) {
      if (!Array.isArray(m.dots) || !m.dots.length) continue;
      tickDots(m, t);
    }

    // 5. zones: a trap fires once on the first thing to step in it
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (t >= z.until) {
        zones.splice(i, 1);
        say(`${z.name} fades.`, 'ability');
        continue;
      }
      if (z.zoneKind === 'trap' || z.zoneKind === 'rift') {
        for (const m of inArea(z, z.radius, null, pos(), yaw())) {
          if (z.fired.has(m)) continue;
          z.fired.add(m);
          if (z.applies) {
            runEffect(z.applies, { ability: ABILITIES_BY_ID[z.abilityId], target: m, now: t, api, hit: [m], ground: z });
          }
          say(`${m.name || 'Something'} walked into your ${z.zoneKind}.`, 'good');
          if (z.zoneKind === 'trap') { zones.splice(i, 1); break; }
        }
      } else if (z.applies && (z.zoneKind === 'ward' || z.zoneKind === 'sanctuary')) {
        // A WARD AND A SANCTUARY ARE FLOOR YOU STAND ON, and until now their
        // `applies` was written into the zone record and run by nothing: Ward's
        // "everything hurts a third less" and Sanctuary's "nothing can be
        // attacked" were a ring on the ground and no more. A trap fires once on
        // the first body through it; these two are the opposite, so the buff is
        // laid on everybody inside on every frame and REFRESHED rather than
        // stacked (addBuff replaces its own row), and it runs out on its own a
        // moment after you step out. ZONE_LINGER is that moment.
        for (const a of allies()) {
          if (!a || num(a.health) <= 0) continue;
          if (flatDistance(z, a.pos || a) > z.radius) continue;
          const inside = z.fired.has(a);
          if (!inside) {
            z.fired.add(a);
            say(a === actor
              ? `You are inside your ${z.name}.`
              : `${a.name || 'Someone'} is inside your ${z.name}.`, 'good');
          }
          addBuff(a, {
            id: `${z.abilityId}:zone`, abilityId: z.abilityId, name: z.name, kind: 'buff',
            until: Math.min(z.until, t + ZONE_LINGER),
            effect: z.applies, mods: z.applies.mods || null, stats: null, form: null,
          });
        }
        for (const a of [...z.fired]) {
          if (flatDistance(z, a.pos || a) <= z.radius && num(a.health) > 0) continue;
          z.fired.delete(a);
          if (num(a.health) > 0) say(a === actor ? `You step out of your ${z.name}.` : `${a.name || 'Someone'} steps out of your ${z.name}.`, 'ability');
        }
      }
    }

    // 6. an armed melee ability that nobody swung, or that is waiting on a
    // weapon the player has since put down
    if (nextSwing && t >= nextSwing.until) {
      say(`${nextSwing.name} went unused.`, 'bad');
      nextSwing = null;
    }
    lapseOnWeaponChange();

    // 7. the enchantment and the leech, both of which are timed data on the actor
    if (actor.enchant && t >= actor.enchant.until) { say(`${ABILITIES_BY_ID[actor.enchant.abilityId]?.name || 'The enchantment'} wears off.`, 'ability'); actor.enchant = null; }
    if (actor.absorb && t >= actor.absorb.until) { say('The shield is spent.', 'ability'); actor.absorb = null; recompute(); }
    if (actor.leech && t >= actor.leech.until) actor.leech = null;
    if (actor.meditating && moving()) { actor.meditating = null; say('You get up.', 'ability'); }
    stealthStep(t);
  }

  /**
   * WALKING WHILE HIDDEN, which is the whole of the Stealth skill and is the
   * only place in the game that reads it.
   *
   * It used to be one line: `!num(skills.stealth)`, so a character at Stealth 0
   * was seen the instant he moved and a character at Stealth 0.3 was NEVER
   * seen, at any speed, for ever. A binary on a hundred point skill, and no
   * lesson either way, so the only way to get that first tenth of a point was
   * to buy it from Fenn. Now it is a roll every STEALTH_STEP_S of movement,
   * scaled by the skill, and every roll teaches: a step held is a lesson that
   * landed, a step that gave you away is a lesson at a failure's chance.
   */
  function stealthStep(t) {
    const h = actor.hidden;
    if (!h || !h.requiresStill) { stealthAt = 0; return; }
    if (!moving()) return;
    if (stealthAt && t - stealthAt < STEALTH_STEP_S) return;
    stealthAt = t;
    const skill = num((character.skills || {}).stealth);
    const held = rng() < stealthHoldChance(skill);
    try { progression?.lesson?.('stealth', STEALTH_DIFFICULTY, held, rng); } catch (err) { /* a lesson is never worth a crash */ }
    if (held) return;
    revealHidden('Moving gave you away.');
  }

  function expire(who, t) {
    if (!Array.isArray(who.buffs) || !who.buffs.length) return;
    let dropped = 0;
    for (let i = who.buffs.length - 1; i >= 0; i--) {
      const b = who.buffs[i];
      if (b.until != null && t >= b.until) {
        who.buffs.splice(i, 1);
        dropped++;
        if (b.form && who.form === b.form) who.form = null;
        if (who === actor) say(`${b.name} runs out.`, 'ability');
      }
    }
    if (dropped) recompute(who);
  }

  // ---------------------------------------------------------- the landing --

  /**
   * main.js routes `player.landed` here. Two things ride on it: the jump
   * attack flag stops, and Leap Slam's slam happens WHERE YOU LAND rather than
   * where you pressed the key, which is the difference between the ability
   * working and the ability looking broken.
   */
  function onLanded(now, fallMetres = 0) {
    if (!landing) return null;
    const l = landing;
    landing = null;
    const t = num(now);
    const ctx = { ability: l.ability, target: null, now: t, api, hit: [], ground: { ...pos() } };
    const parts = l.ability.effect.kind === 'combo' ? l.ability.effect.parts.slice(l.fromIndex) : [];
    const said = [];
    for (const part of parts) { const w = runEffect(part, ctx); if (w) said.push(w); }
    say(`${l.ability.name} lands. ${said.join(' ')}`.trim(), 'ability');
    effects?.burst?.({ x: pos().x, y: num(pos().y) + 0.3, z: pos().z }, effects.colourFor?.(l.ability.id) ?? 0xe8e2d4, 1.4);
    return ctx;
  }

  /**
   * An armed swing belongs to the weapon it was armed with. Swapping weapons
   * drops it, out loud, because a Power Strike silently spent on the next
   * dagger poke is the ability looking broken while every line of it ran.
   * Called on the update tick AND on takeNextSwing, so nothing can consume it
   * between frames.
   */
  function lapseOnWeaponChange() {
    if (!nextSwing) return false;
    if (nextSwing.weaponId === undefined) return false;
    if (nextSwing.weaponId === weaponIdNow()) return false;
    say(`${nextSwing.name} was set up for another weapon, and it lapses.`, 'bad');
    nextSwing = null;
    return true;
  }

  // ------------------------------------------------------------- the views --

  const cooldownLeft = (id, now) => Math.max(0, num(cooldowns[id]) - num(now));

  function affordable(ability) {
    if (!ability) return true;
    const kind = costKind(ability);
    if (kind === 'stamina') return num(actor.stamina) >= ability.cost.stamina;
    if (kind === 'mana') {
      const need = manaCostFor(ability, snapshot(0));
      return actor.form === 'lich' ? num(actor.health) > need : num(actor.mana) >= need;
    }
    if (kind === 'item') return itemsHeld(character, ability.cost.item) >= (ability.cost.count ?? 1);
    return true;
  }

  /** Exactly what hud.update's `view.bar` wants, twelve entries, always. */
  function barView(now) {
    const t = num(now);
    const bar = Array.isArray(character.bar) ? character.bar : [];
    const out = [];
    for (let i = 0; i < BAR_SLOTS; i++) {
      const ability = ABILITIES_BY_ID[bar[i]] || null;
      const hands = handsCheck(ability);
      // What the armour will do to this row, BEFORE it is pressed. hud.js
      // draws the sentence in amber under the description and marks the cell
      // itself above BURDEN_MARK, so a plated mage sees the problem on the bar
      // rather than in his third fizzle. Zero for a Chivalry row and for
      // everything that is not a spell, which is how those show nothing.
      const burden = ability ? burdenFor(ability) : 0;
      // THE GATE, ON THE BAR. A cell can hold a row the character no longer
      // meets: a skill marked down can fall back under a mark, and an ability
      // dragged on at Mysticism 20 is still on the bar at Mysticism 19.9. The
      // cell used to grey only for what was in your hands, so a locked row
      // looked pressable and answered a refusal the bar never hinted at. The
      // sentence here is the SAME sentence the card shows and the same one the
      // key answers with, out of abilities.js, so all three say one thing.
      const gate = ability ? meetsRequirements(ability, character.skills || {}, character.stats || {}) : { ok: true };
      const gateLine = gate.ok ? '' : requirementSentence(ability, character.skills || {}, character.stats || {});
      // And the row you are allowed to hold but have not earned: it works some
      // of the time, and the tooltip says how often before you spend the mana.
      const practice = ability && gate.ok ? practiceText(ability, character.skills || {}) : '';
      const why = [gateLine, hands.ok ? '' : hands.reason, practice].filter(Boolean).join('\n');
      out.push({
        key: BAR_KEYS[i],
        ability,
        cooldownLeft: ability ? cooldownLeft(ability.id, t) : 0,
        affordable: ability ? affordable(ability) : true,
        casting: !!(cast && ability && cast.abilityId === ability.id),
        // hud.js greys the cell on `unusable`; the reason is the tooltip.
        unusable: ability ? (!hands.ok || !gate.ok) : false,
        unusableReason: why,
        /** True while the row is held below its own mark. hud.js need not
         * read it; the sentence is already in `unusableReason`. */
        practising: !!practice,
        needs: ability ? weaponNeeds(ability).kind : 'none',
        // How many of the thing this row is paid in are actually in the pack.
        // Null for a row paid in stamina or mana. hud.js draws it under the
        // cost cell, because "1" on the Bandage cell is what it COSTS and the
        // player wanted to know what he HAS.
        held: ability ? held(ability) : null,
        burden,
        burdenText: burdenText(burden),
      });
    }
    return out;
  }

  /** What hud.update's `view.buffs` wants: icons with a countdown. */
  function buffsView(now) {
    const t = num(now);
    return (Array.isArray(actor.buffs) ? actor.buffs : []).map((b) => ({
      id: b.id, abilityId: b.abilityId, name: b.name, kind: b.kind || 'buff',
      remaining: b.until == null ? Infinity : Math.max(0, b.until - t),
    }));
  }

  /** Passives are data, not presses. Called on create and after a skill gain. */
  function applyPassives() {
    for (const ability of Object.values(ABILITIES_BY_ID)) {
      if (!ability.passive) continue;
      if (ability.effect?.kind !== 'passiveMod') continue;
      const skills = character.skills || {};
      const have = ability.skillAny
        ? ability.skillAny.reduce((b, id) => Math.max(b, num(skills[id])), 0)
        : num(skills[ability.skill]);
      if (have < ability.minSkill) { if (actor.passives) delete actor.passives[ability.id]; continue; }
      // Riposte is a parry that counters, and there is no parry without a
      // shield. main.js should call applyPassives() again on every equip
      // change (see docs/mmo/wiring/G2.md), or this is only as fresh as the
      // last skill gain.
      if (!handsCheck(ability).ok) { if (actor.passives) delete actor.passives[ability.id]; continue; }
      api.doPassiveMod(ability.effect, { ability, now: 0, api, hit: [] });
    }
    return actor.passives || {};
  }
  applyPassives();

  /**
   * How many of an ability's item cost this character is carrying. The bar's
   * cost cell shows the ability's cost (Bandage reads "1"); this is what the
   * tooltip and `hud.js` use to say how many of them are left.
   */
  const held = (ability) => (ability?.cost?.item ? itemsHeld(character, ability.cost.item) : null);

  return {
    use, useById, update, onDamaged, onLanded, applyPassives, held, spendItem,
    barView, buffsView, cooldownLeft, affordable, acquire, groundPoint, takeRemoteEffect,
    onTargetPicked, cancelPending, faceTowards,

    /** W2's combat consumes this on a plain player swing, or it lapses. */
    takeNextSwing(now) {
      if (!nextSwing) return null;
      if (lapseOnWeaponChange()) return null;
      if (num(now) >= nextSwing.until) { nextSwing = null; return null; }
      const it = nextSwing;
      nextSwing = null;
      return it;
    },

    /** The documented +25% while airborne. combat_rules applies the number. */
    get jumpAttack() { return airborne(); },
    get jumpAttackMult() { return JUMP_ATTACK_MULT; },

    get casting() { return cast; },
    /** A bandage is a cast whose bar is the binding. This is that cast. */
    get channelling() { return cast && breaksOnAnyDamage(cast) ? cast : null; },
    get cooldowns() { return cooldowns; },
    get zones() { return zones; },

    /**
     * The spell held on the cursor, `{ ability, slot, startedAt }`, or null.
     * The HUD lights its bar cell from `ability.id`; main.js reads it to know
     * that this click chooses a target rather than starting a fight.
     *
     * The delayed effects that used to answer to this name (Meteor's fall,
     * Volley's rain) are `delayed` now. They were never the same thing and one
     * word for both would have read as if they were.
     */
    get pending() { return waiting; },
    get delayed() { return delayed; },

    /** What the cursor should be. main.js applies it in updateCursor. */
    get cursor() { return waiting ? 'crosshair' : ''; },

    get armed() { return nextSwing; },
    get lastLine() { return lastLine; },

    /**
     * The spell effects bridge, or null when nothing wired one.
     *
     * Handed on rather than hidden so the dev bench can print what a spell is
     * going to draw and fire one for review without a second copy of the
     * wiring. The runtime never asks it a question.
     */
    get spellVfx() { return spellVfx; },

    dispose() {
      cast = null; nextSwing = null; landing = null; waiting = null;
      delayed.length = 0; zones.length = 0;
      effects?.hideGroundRing?.();
    },
  };
}
