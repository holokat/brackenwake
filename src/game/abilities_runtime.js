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
  manaCostFor, costKind, MELEE_RANGE, weaponCheck, weaponNeeds,
} from '../mmo/abilities.js';
import { JUMP_ATTACK_MULT } from '../mmo/combat_rules.js';
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
 *   utility { transmute, steal, meditate, camp }
 *   rng()                      seeded in tests, Math.random in the game
 *   recompute(actor)           else progression.recompute, else actor.recompute
 *   enabled()                  false while a window owns the keyboard, or
 *                              while main.js is giving 1 to 4 to the tools
 */
export function createAbilities(deps = {}) {
  const {
    character = {}, actor = {}, input = null, combat = null, monsters = null,
    effects = null, floaters = null, hud = null, audio = null, player = null,
    camera = null, progression = null, targeting = null,
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
    if (c.kind === 'item') {
      const bag = character.items || (character.items = {});
      bag[c.item] = Math.max(0, num(bag[c.item]) - c.amount);
      return `${c.amount} ${c.item}${one(c.amount)}`;
    }
    return null;
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
   * Which abilities can be held on the cursor waiting for a target, counted
   * rather than guessed. Of the 78 rows:
   *
   *   enemy   29, and 24 of them wait. The five that do not are the armed
   *           swings (`effect.nextSwing`), which arm the NEXT swing and want
   *           nobody in particular at the moment you press them.
   *   ground  11, aoe and ground both. They never wait: the ground ring under
   *           the cursor already says where they will land, and asking a
   *           player to click twice for a Meteor is worse, not better.
   *   corpse   2, Raise Skeleton and Corpse Explosion. Both find their own
   *           corpse and both say so when there is none, so there is nothing
   *           for a cursor to choose.
   *   ally     7. They fall back to you when nothing friendly is selected, so
   *           they never reach "no target" at all; a heal with nobody chosen
   *           is a heal on yourself, which is what it was before this.
   *   self    29. Nothing to choose.
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

  /** Where a ground ability lands: the cursor, or `range` metres ahead. */
  function groundPoint(ability) {
    const g = targeting?.groundPoint?.(num(pos().y));
    if (g) {
      const d = flatDistance(pos(), g);
      const max = num(ability.range) || 10;
      if (d <= max) return { x: g.x, y: g.y ?? num(pos().y), z: g.z };
      const k = max / (d || 1);
      return { x: pos().x + (g.x - pos().x) * k, y: num(pos().y), z: pos().z + (g.z - pos().z) * k };
    }
    const r = Math.min(num(ability.range) || 8, 8);
    return { x: pos().x + Math.sin(yaw()) * r, y: num(pos().y), z: pos().z + Math.cos(yaw()) * r };
  }

  /** Everything in a circle, or in an arc of one. Nearest first. */
  function inArea(centre, radius, arcDegrees, fromPos, facing) {
    const half = arcDegrees ? (arcDegrees * Math.PI) / 360 : Math.PI;
    const out = [];
    for (const m of allTargets()) {
      if (m === actor) continue;
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
      const opts = {
        abilityId: c.ability.id, name: c.ability.name,
        multiplier: num(e.value) || 1,
        hitBonus: num(e.hitBonus),
        ignoreARFraction: num(e.ignoreARFraction),
        pierceTargets: num(e.pierceTargets) || 1,
        shots: num(e.shots) || 1,
        jumpAttack: airborne(),
        immediate: true,
      };
      if (!c.target) {
        if (e.nextSwing) {
          // The weapon is part of the arming. Power Strike set up for a
          // longsword is not a Power Strike with a bow, and takeNextSwing
          // drops it rather than multiplying a swing it was never for.
          nextSwing = { ...opts, until: c.now + NEXT_SWING_WINDOW, weaponId: weaponIdNow() };
          return `Nothing in reach, so it waits on your next swing for ${saySeconds(NEXT_SWING_WINDOW)}.`;
        }
        return 'Nothing in reach.';
      }
      if (!combat?.queueSwing) return `${c.ability.name} has no arm to swing with yet.`;
      for (let i = 0; i < opts.shots; i++) combat.queueSwing(actor, c.target, opts);
      c.hit.push(c.target);
      const airWords = opts.jumpAttack ? ` from the air, for a quarter more` : '';
      const shotWords = opts.shots > 1 ? `${opts.shots} shots at ` : '';
      return `${shotWords}${Math.round(opts.multiplier * 100)}% on ${c.target.name || 'it'}${airWords}.`;
    },

    doAoe(e, c) {
      const ground = c.ability.target === 'ground';
      const centre = ground ? c.ground : pos();
      const radius = num(e.radius) || 3;
      if (e.delay > 0 && !c.delayed) {
        delayed.push({ at: c.now + e.delay, effect: { ...e }, ctx: { ...c, delayed: true, ground: { ...centre } } });
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
      const kinds = e.affects ? new Set(e.affects) : null;
      const list = on.filter((m) => !kinds || kinds.has(m.kind));
      if (!list.length) return `Nothing to ${e.effect}.`;
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
        ? `${done} ${e.effect}${done === 1 ? 'ed' : 'ed'} for ${saySeconds(e.duration)}${missed}.`
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
      const who = e.targets === 'allies' || e.targets === 'selfAndAllies'
        ? allies().filter((a) => e.targets === 'selfAndAllies' || a !== actor)
          .filter((a) => !e.radius || flatDistance(pos(), a.pos || a) <= e.radius)
        : [actor];
      if (!who.length) return 'Nobody close enough to hear it.';
      for (const a of who) {
        addBuff(a, {
          id: `${c.ability.id}:${c.now.toFixed(3)}`, abilityId: c.ability.id, name: c.ability.name,
          kind: 'buff', until: c.now + num(e.duration),
          effect: e, mods: e.mods || null, stats: e.stats || null, form: e.form || null,
          channelled: !!e.channelled,
        });
        if (e.form) a.form = e.form;
      }
      const list = e.mods ? Object.entries(e.mods).map(([k, v]) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}% ${k}`).join(', ')
        : e.stats ? Object.entries(e.stats).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k.toUpperCase()}`).join(', ')
          : c.ability.name;
      return `${list} for ${saySeconds(e.duration)}${who.length > 1 ? `, on ${who.length} of you` : ''}.`;
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
      });
      if (!it) return `Nothing answered.`;
      return `${e.creature} for ${saySeconds(seconds)}.`;
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
      return removed.length ? `${removed.join(' and ')} gone.` : 'There was nothing on them to lift.';
    },

    doResurrect(e, c) {
      const who = c.target;
      if (!who) return 'Nobody here to raise.';
      if (typeof deps.resurrect !== 'function') return `${who.name || 'They'} would stand, and nothing is wired to raise the fallen yet.`;
      deps.resurrect(who, actor);
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
      c.target.marks.push({
        abilityId: c.ability.id, damageTakenMult: num(e.damageTakenMult) || 1,
        until: c.now + num(e.duration), from: e.fromCasterOnly ? (actor.id ?? 'player') : null,
        preventsHide: !!e.preventsHide,
      });
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

  /** The shape combat_rules.resolveSpell wants, scaled by a chain's falloff. */
  function spellFor(ability, roll, falloff = 1) {
    return {
      id: ability.id, name: ability.name,
      base: [num(roll.min) * falloff, num(roll.max) * falloff],
      damageType: roll.type || 'energy',
      line: !!roll.line, vs: roll.vs || null,
    };
  }

  const targetPoint = (t) => {
    const p = t?.pos || t || {};
    return { x: num(p.x), y: num(p.y) + 1.1, z: num(p.z) };
  };

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
  function fire(ability, target, now, ground) {
    const ctx = {
      ability, target, now, api, hit: [],
      ground: ground || (ability.target === 'ground' ? groundPoint(ability) : { ...pos() }),
    };
    const words = runEffect(ability.effect, ctx);
    if (words) say(`${ability.name}. ${words}`, 'ability');
    else say(`${ability.name}.`, 'ability');
    teach(ability);
    effects?.hideGroundRing?.();
    return ctx;
  }

  /** "Using an ability is a lesson in its skill at its minSkill + 20." */
  function teach(ability) {
    if (!progression?.lesson) return;
    const l = lessonFor(ability);
    let skill = l.skill;
    if (ability.skillAny) skill = actor.weapon?.skill || character.equipment?.mainHand?.skill || l.skill;
    if (!skill) return;
    // W1's progression teaches the character it was built with: (skillId, difficulty, success, rng)
    try { progression.lesson(skill, l.difficulty, true, rng); } catch (err) { /* a lesson is never worth a crash */ }
  }

  // ------------------------------------------------------------------ use --

  /**
   * By id, so the Abilities window and a bar slot go down the same road.
   *
   * `opts.target` is the actor a held spell was finally pointed at. It skips
   * the search entirely, which is what makes the click that chooses a target
   * and a press with a target already chosen the same code path and not two.
   */
  function useById(id, now, opts = {}) {
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
    let target = null, ground = null;
    if (opts.target !== undefined) {
      target = opts.target;
    } else if (ability.target === 'enemy' || ability.target === 'corpse') {
      const found = acquire(ability);
      target = found.target;
      if (!target && ability.target === 'enemy' && !ability.effect?.nextSwing) {
        // Two different answers wearing one word. A thing you chose and cannot
        // reach is a distance to walk; nobody at all is a question, and the
        // spell waits on the cursor for you to answer it.
        if (found.outOfRange) {
          say(`${ability.name}: ${found.reason}. Walk closer.`, 'bad'); cue('denied');
          return { ok: false, reason: found.reason, outOfRange: true, dist: found.dist };
        }
        return holdForTarget(ability, opts.slot, t);
      }
    } else if (ability.target === 'ally') {
      target = targeting?.current && targeting.current.faction === 'player' ? targeting.current : actor;
    } else if (ability.target === 'ground') {
      ground = groundPoint(ability);
      const radius = ability.effect?.radius || ability.effect?.parts?.find?.((p) => p.radius)?.radius || 3;
      effects?.showGroundRing?.(ground, radius, effects.colourFor?.(ability.id) ?? 0xffffff);
    } else {
      const found = acquire(ability);
      target = found.target;            // self and ground abilities still like to know
    }

    const rec = startCast(ability, snapshot(t), t, target);
    if (rec.error) { say(rec.error, 'bad'); cue('denied'); return { ok: false, reason: rec.error }; }

    // You look at what you are about to hit. This is before the cast starts, so
    // a three second Meteor is aimed from the first frame and not the last.
    if (target && target !== actor) faceTowards(target);

    const paid = pay(rec);
    cooldowns[ability.id] = rec.cooldownUntil;
    rec.ground = ground;
    rec.startedMoving = moving();

    if (ability.castTime > 0) {
      cast = rec;
      effects?.cast?.(player, ability.castTime, effects.colourFor?.(ability.id) ?? 0xffffff);
      say(`${ability.name}: casting for ${saySeconds(ability.castTime)}${ability.rooted ? ', and moving ends it' : ''}.`, 'ability');
      return { ok: true, casting: true, paid, record: rec };
    }

    if (ability.effect?.kind === 'damageMult' || ability.effect?.parts?.some?.((p) => p.kind === 'damageMult')) {
      effects?.swing?.(player);
      if (ability.skill === 'archery' || ability.skill === 'marksmanship') cue('bowShot');
    }
    fire(ability, target, t, ground);
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
    if (actor.hidden) { actor.hidden = null; say('You are seen.', 'bad'); }
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

  function breakCast(reason, now) {
    if (!cast) return;
    const back = refund(cast);
    effects?.stopCast?.(player);
    say(`${reason}.${back ? ` ${back}.` : ''} ${cast.name} is still cooling.`, 'bad');
    cue('denied');
    cast = null;
  }

  // --------------------------------------------------------------- update --

  function update(dt, now) {
    const t = num(now);

    // 1. the bar. One key, one slot.
    //
    // `enabled()` is main.js's gate. It matters because keys 1 to 4 are ALSO
    // the farm's tool row in main.js, and the runtime contract gives 1 to 0,
    // minus and equals to the bar. Two handlers on one press is a swing and a
    // tool change at once. See docs/mmo/wiring/W4.md, which asks main.js to
    // settle it rather than leaving both listening.
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
      fire(ability, rec.target, t, rec.ground);
    }

    // 3. delayed effects: Meteor's fall, Volley's rain
    for (let i = delayed.length - 1; i >= 0; i--) {
      if (t >= delayed[i].at) {
        const p = delayed.splice(i, 1)[0];
        const ctx = { ...p.ctx, now: t, api, hit: [] };
        const words = runEffect(p.effect, ctx);
        say(`${p.ctx.ability.name} lands. ${words || ''}`.trim(), 'ability');
      }
    }

    // 4. buffs and debuffs run out, and the pools have to follow
    expire(actor, t);
    for (const m of allTargets()) if (Array.isArray(m.buffs) && m.buffs.length) expire(m, t);

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
    if (actor.hidden?.requiresStill && moving() && !num((character.skills || {}).stealth)) {
      actor.hidden = null;
      say('Moving gave you away.', 'bad');
    }
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
    if (kind === 'item') return num((character.items || {})[ability.cost.item]) >= (ability.cost.count ?? 1);
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
      out.push({
        key: BAR_KEYS[i],
        ability,
        cooldownLeft: ability ? cooldownLeft(ability.id, t) : 0,
        affordable: ability ? affordable(ability) : true,
        casting: !!(cast && ability && cast.abilityId === ability.id),
        // hud.js greys the cell on `unusable`; the reason is the tooltip.
        unusable: ability ? !hands.ok : false,
        unusableReason: hands.ok ? '' : hands.reason,
        needs: ability ? weaponNeeds(ability).kind : 'none',
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

  return {
    use, useById, update, onDamaged, onLanded, applyPassives,
    barView, buffsView, cooldownLeft, affordable, acquire, groundPoint,
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

    dispose() {
      cast = null; nextSwing = null; landing = null; waiting = null;
      delayed.length = 0; zones.length = 0;
      effects?.hideGroundRing?.();
    },
  };
}
