// Wyrmsoul: the rules, and nothing that touches the world.
//
// `docs/mmo/14-KALDERA.md` section 3, exactly. For six seconds (ten after
// Frostreach) the player and the dragon are one creature: the world drops to a
// fifth of its speed, the dragon's breath comes out of the player's hands, and
// everything the player touched in those seconds lands at once when time
// resumes.
//
// Every function here is pure. Nothing in this file has a scene, a HUD, an
// audio cue or a clock of its own: it is handed a state, a record and a number
// and it returns what should be true. The wiring that makes any of it happen is
// `src/game/app/systems/dragon.js`, the pictures are `wyrmsoul_visuals.js`, and
// `docs/mmo/wiring/D2.md` says which is which.
//
// THE STATE, in full. One object, and the only thing that is not derived:
//
//   { record,          character.dragon, live, the same object dragon.js holds
//     phase,           'idle' | 'running' | 'ending'
//     calledAt,        player-clock ms the call went out
//     until,           player-clock ms dragon time is over
//     endsAt,          player-clock ms the end pulse is over
//     tiredUntil,      player-clock ms the dragon stops being tired
//     gifts,           what was held AT THE CALL: see giftsHeld
//     breathAt,        player-clock ms the last breath went out
//     breaths }        breaths thrown this call, for the end line's count
//
// WHY THE GIFTS ARE FROZEN AT THE CALL. A gift granted mid effect would change
// the duration under a clock that is already counting, and the wings would
// appear on a player who is halfway through a fall. The record is read once,
// when the call is made, and the effect runs on what it read.

import {
  APART_M, AGE_STATS, AGES, GIFTS, GIFT_IDS, readDragon,
} from './dragon.js';
import { TIERS } from '../mmo/monsters.js';
import { attackSkill } from '../mmo/combat_rules.js';
import { stunned } from './combat.js';

const num = (v) => (Number.isFinite(v) ? v : 0);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------- numbers --

/** The Bond the call costs, and the Bond it needs. Both are the whole meter. */
export const CALL_BOND = 100;

/** "Six seconds at the base, ten after Frostreach." */
export const BASE_MS = 6000;
export const FROST_MS = 10000;

/** "The world clock runs at one fifth." */
export const TIME_SCALE = 0.2;

/**
 * "Everything ... resolves in order over half a second." This is the length of
 * the end pulse, and it is also how long the world clock has to pay back the
 * time it did not get. See `context.js`'s `createWorldClock.catchUp`.
 */
export const END_MS = 500;

/** "The dragon is tired for thirty seconds: it fights, but no Bond is gained." */
export const TIRED_MS = 30000;

/** "A cone from the player's hands, fifteen metres." */
export const BREATH_RANGE_M = 15;
/**
 * The cone's full width. INVENTED: the design gives the length and calls it a
 * cone and gives no angle. 60 degrees is the widest arc that still reads as a
 * cone rather than a circle in front of you, and it is what `doAoe`'s
 * `arcDegrees` means in abilities_runtime, so the two are the same kind of
 * number.
 */
export const BREATH_ARC_DEG = 60;
/** "One second between breaths." */
export const BREATH_EVERY_MS = 1000;

/** "A sweep that knocks everything within four metres off its feet." */
export const TAIL_M = 4;
/** How far the tail throws what it catches. The design's own "four metres". */
export const TAIL_KNOCK_M = 4;

/** "the rest are stunned as time resumes." */
export const ROAR_STUN_S = 1.5;

/**
 * The Ember Wastes' gift: "the breath ignites the ground and burns after time
 * resumes." The design gives the effect and no numbers, so these three are
 * INVENTED and here where they can be argued with:
 *
 *   the radius is the cone's own half length, so what the breath covered burns
 *   the burn lasts eight seconds, which outlives the six second effect it was
 *     thrown inside, which is the whole point of the sentence
 *   it ticks once a second for a fifth of the breath's own low roll, so a
 *     hatchling's fire is 0.4 a second and a full dragon's is 12
 */
export const FIRE_GROUND_R = BREATH_RANGE_M / 2;
export const FIRE_GROUND_S = 8;
export const FIRE_TICK_MS = 1000;
export const FIRE_TICK_FRACTION = 0.2;

/** What one second of standing in the dragon's fire costs, at this age. */
export function groundBurn(age) {
  return Math.max(1, Math.round(breathDamage(age)[0] * FIRE_TICK_FRACTION));
}

/**
 * The zone a breath leaves when true fire is held: a disc half the cone's
 * length, centred a third of the way down it, burning for FIRE_GROUND_S.
 */
export function fireGround(from, yaw, age, now) {
  const reach = BREATH_RANGE_M * 0.45;
  return {
    x: num(from?.x) + Math.sin(num(yaw)) * reach,
    z: num(from?.z) + Math.cos(num(yaw)) * reach,
    r: FIRE_GROUND_R,
    per: groundBurn(age),
    until: num(now) + FIRE_GROUND_S * 1000,
    nextTick: num(now) + FIRE_TICK_MS,
  };
}

/** Everything alive standing in a burning patch. Pure, so it can be counted. */
export function inGround(list, zone) {
  const out = [];
  for (const a of list || []) {
    if (!a || num(a.health) <= 0 || !a.pos) continue;
    if (Math.hypot(num(a.pos.x) - zone.x, num(a.pos.z) - zone.z) <= zone.r) out.push(a);
  }
  return out;
}

/** "for the duration you fly ... bounded to the ground plus 30 m". */
export const FLY_CEILING_M = 30;

/**
 * The breath's damage, by the dragon's age, DERIVED and not tabled twice: it is
 * `AGE_STATS[age].damage` doubled. The reasoning, so it can be argued with: a
 * bite is one set of teeth and the breath is the whole animal's fire, and the
 * doubling keeps the four ages in the ratio `dragon.js` already chose rather
 * than inventing a second ladder that can drift from the first.
 *
 *   hatchling 2 to 6      drake 12 to 24      young 28 to 52      dragon 60 to 100
 */
export const BREATH_MULT = 2;
export function breathDamage(age) {
  const row = AGE_STATS[age] || AGE_STATS.hatchling;
  return [Math.round(row.damage[0] * BREATH_MULT), Math.round(row.damage[1] * BREATH_MULT)];
}

// ------------------------------------------------------------- the gifts --

/**
 * The nine gift ids of `dragon.js`, and the one thing each switches on here.
 * `dragon.js` owns which are held; this owns what holding one does, which is
 * the split `D1-DRAGON.md` asked for.
 */
export const GIFT_POWER = {
  greenwold: 'base',
  verdant: 'senses',
  saltmarch: 'tail',
  ember: 'trueFire',
  stormpeaks: 'wings',
  boneyard: 'roar',
  frostreach: 'frost',
  sunken: 'deep',
  throne: 'last',
};

/** Every power name, in the realm order. Nothing may hold a tenth. */
export const POWERS = GIFT_IDS.map((id) => GIFT_POWER[id]);

/** One line each, for the tooltip. What the player gets, in the player's words. */
export const POWER_LINE = {
  base: 'six seconds of dragon time, and fire out of your hands',
  senses: 'you see what is alive through leaf, wall and dark',
  tail: 'a tail sweep on the call throws back everything within four metres',
  trueFire: 'the fire stays in the ground and burns on after time resumes',
  wings: 'Space flies, for as long as it lasts',
  roar: 'the roar at the end routs the small and stuns the rest',
  frost: 'a second breath, frost, and ten seconds instead of six',
  deep: 'it answers underwater, and while you are drowning',
  last: 'once, in the last fight, the dragon takes your death',
};

/**
 * What this record's Wyrmsoul can do. Pure, total, and defensive: a record that
 * is a string, a null, or a save carrying a gift id this build has never heard
 * of comes back as a full set of falses rather than a crash.
 *
 * `base` is true for every call, held or not. The Greenwold's gift is the
 * ability itself and a player who somehow reached a Bond of 100 without it is
 * not made to stand there holding a key that does nothing.
 */
export function giftsHeld(record) {
  const held = new Set(readDragon(record).gifts);
  const out = { base: true };
  for (const id of GIFT_IDS) out[GIFT_POWER[id]] = held.has(id);
  out.base = true;
  return out;
}

/** The gift row (id, realm, gift) behind a power name, for the words. */
export const GIFT_FOR_POWER = Object.fromEntries(
  GIFTS.map((g) => [GIFT_POWER[g.id], g]),
);

// ------------------------------------------------------------ the state --

/** A Wyrmsoul that has never been called. */
export function blankWyrmsoul(record = null) {
  return {
    record,
    phase: 'idle',
    calledAt: 0,
    until: 0,
    endsAt: 0,
    tiredUntil: 0,
    gifts: giftsHeld(record),
    breathAt: -1e9,
    breaths: 0,
  };
}

/** True while the world is slowed. `ending` is no longer dragon time. */
export const isRunning = (state) => !!state && state.phase === 'running';
/** True while the end pulse is paying back the clock. */
export const isEnding = (state) => !!state && state.phase === 'ending';
/** True for both: the effect is up in some form and cannot be called again. */
export const isActive = (state) => isRunning(state) || isEnding(state);

/** The world's time scale right now. The one number the clock is set from. */
export function timeScaleFor(state) {
  return isRunning(state) ? TIME_SCALE : 1;
}

/** Six seconds, or ten with Frostreach's gift. */
export function durationMs(record) {
  return giftsHeld(record).frost ? FROST_MS : BASE_MS;
}

/** Is the dragon tired (fights, gains no Bond) at this instant? */
export const isTired = (state, now) => !!state && num(now) < num(state.tiredUntil);

// ----------------------------------------------------------- the calling --

/**
 * May it be called, and if not, the sentence that says why.
 *
 * Every clause of "Bond at 100 ... Not while stunned, not while dead, not
 * without the dragon within forty metres and awake", plus the Sunken Kingdom's
 * "remove the underwater guard", which is the one condition a gift lifts.
 *
 * @param {object} record  character.dragon
 * @param {object} dragon  the live entity: { awake, pos, bond }
 * @param {object} actor   the player's fighter
 * @param {object} [opts]  { now, underwater, state, playerPos }
 * @returns {{ ok: boolean, reason: string|null, say: string }}
 */
export function canCall(record, dragon, actor, opts = {}) {
  const now = num(opts.now);
  const state = opts.state || null;
  const rec = readDragon(record);
  const gifts = giftsHeld(rec);
  const no = (reason, say) => ({ ok: false, reason, say });

  if (isActive(state)) return no('active', 'Wyrmsoul is already up.');
  if (!dragon) return no('no_dragon', 'There is no dragon to answer.');
  if (!actor || num(actor.health) <= 0) return no('dead', 'You are dead. Nothing answers the dead.');
  if (stunned(actor, now)) return no('stunned', 'You are stunned, and cannot call it.');
  if (!dragon.awake) return no('fallen', 'It is down, and cannot answer. Fight over it until the Bond climbs.');

  const p = opts.playerPos || actor.pos || { x: 0, z: 0 };
  const d = dragon.pos ? Math.hypot(num(dragon.pos.x) - num(p.x), num(dragon.pos.z) - num(p.z)) : Infinity;
  if (d > APART_M) return no('far', `It is too far to answer: ${Math.round(d)} m, and the pact reaches ${APART_M}.`);

  if (opts.underwater && !gifts.deep) {
    return no('underwater', 'The fire will not take under the water. The Sunken Kingdom is where that changes.');
  }

  const bond = num(rec.bond);
  if (bond < CALL_BOND) {
    return no('bond', `The Bond is at ${Math.round(bond)}. Wyrmsoul answers at ${CALL_BOND}.`);
  }
  return { ok: true, reason: null, say: 'Wyrmsoul. The world slows.' };
}

/**
 * Make the call. Returns the NEW state; it does not touch the record, because
 * the Bond going to zero and the dragon being tired are the caller's writes and
 * both have to be said out loud where they happen.
 *
 * `bondTo` and `tiredUntil` are handed back so the caller has nothing to work
 * out for itself.
 */
export function call(state, now, record = state?.record ?? null) {
  const t = num(now);
  const gifts = giftsHeld(record);
  const ms = gifts.frost ? FROST_MS : BASE_MS;
  return {
    ...blankWyrmsoul(record),
    record,
    phase: 'running',
    calledAt: t,
    until: t + ms,
    endsAt: t + ms + END_MS,
    tiredUntil: t + ms + END_MS + TIRED_MS,
    gifts,
    breathAt: -1e9,
    breaths: 0,
    // what the caller must write, said here once so nobody has to remember it
    bondTo: 0,
    seconds: ms / 1000,
  };
}

/**
 * One frame of the effect, on the PLAYER's clock.
 *
 * @returns {{ state, running, ending, justEnded, justStarted, left }}
 *   `justEnded` is true on exactly the frame dragon time is over and the end
 *   pulse begins, which is the frame the roar and the catch up fire on.
 *   `left` is seconds of dragon time remaining, for the HUD.
 */
export function tick(state, now) {
  const t = num(now);
  if (!state || state.phase === 'idle') {
    return { state: state || blankWyrmsoul(null), running: false, ending: false, justEnded: false, justStarted: false, left: 0 };
  }
  if (state.phase === 'running') {
    if (t < state.until) {
      return { state, running: true, ending: false, justEnded: false, justStarted: false, left: (state.until - t) / 1000 };
    }
    return {
      state: { ...state, phase: 'ending' },
      running: false, ending: true, justEnded: true, justStarted: false, left: 0,
    };
  }
  // ending
  if (t < state.endsAt) {
    return { state, running: false, ending: true, justEnded: false, justStarted: false, left: 0 };
  }
  return {
    state: { ...state, phase: 'idle' },
    running: false, ending: false, justEnded: false, justStarted: false, left: 0,
  };
}

// ----------------------------------------------------------- the breath --

/**
 * The breaths this call has. Fire always; frost as a SECOND one, on the second
 * slot, when Frostreach's gift is held. The order is the bar order.
 */
export function breathFor(state) {
  const gifts = (state && state.gifts) || giftsHeld(null);
  const age = readDragon(state?.record).age;
  const [lo, hi] = breathDamage(age);
  const out = [{
    slot: 0,
    id: 'wyrmsoul_fire',
    name: 'Dragonfire',
    damageType: 'fire',
    base: [lo, hi],
    colour: 0xff7a2a,
    range: BREATH_RANGE_M,
    arcDegrees: BREATH_ARC_DEG,
    ground: !!gifts.trueFire,
    description: `A cone of the dragon's own fire, ${BREATH_RANGE_M} m, ${lo} to ${hi}.`,
  }];
  if (gifts.frost) {
    out.push({
      slot: 1,
      id: 'wyrmsoul_frost',
      name: 'Wyrmfrost',
      damageType: 'cold',
      base: [lo, hi],
      colour: 0x8fd6ff,
      range: BREATH_RANGE_M,
      arcDegrees: BREATH_ARC_DEG,
      ground: false,
      description: `The same breath, gone cold, ${BREATH_RANGE_M} m, ${lo} to ${hi}.`,
    });
  }
  return out;
}

/** May a breath go out at this instant? One a second, and only while running. */
export function canBreathe(state, now) {
  if (!isRunning(state)) return false;
  return num(now) - num(state.breathAt) >= BREATH_EVERY_MS;
}

// ------------------------------------------------------- shapes on the ground --

/**
 * Is `target` inside a cone of `range` metres and `arcDeg` degrees, opened from
 * `from` along `yaw`? Pure, flat, and the same convention player.js uses:
 * yaw 0 faces +z, and the angle grows towards +x.
 */
export function inCone(from, yaw, target, range = BREATH_RANGE_M, arcDeg = BREATH_ARC_DEG) {
  if (!from || !target) return false;
  const dx = num(target.x) - num(from.x);
  const dz = num(target.z) - num(from.z);
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d < 1e-6) return true;
  if (arcDeg >= 360) return true;
  const fx = Math.sin(num(yaw)), fz = Math.cos(num(yaw));
  const cos = (dx * fx + dz * fz) / d;
  return cos >= Math.cos((arcDeg / 2) * Math.PI / 180);
}

/** Everything alive in the cone, nearest first, out of a list of actors. */
export function coneTargets(list, from, yaw, range = BREATH_RANGE_M, arcDeg = BREATH_ARC_DEG) {
  const found = [];
  for (const a of list || []) {
    if (!a || num(a.health) <= 0 || !a.pos) continue;
    if (!inCone(from, yaw, a.pos, range, arcDeg)) continue;
    found.push(a);
  }
  found.sort((p, q) => Math.hypot(p.pos.x - from.x, p.pos.z - from.z) - Math.hypot(q.pos.x - from.x, q.pos.z - from.z));
  return found;
}

/**
 * The tail on the call: everything alive within TAIL_M, and where each of them
 * ends up, which is TAIL_KNOCK_M further out along the line from the player.
 * Held back to a list of moves so the caller does the writing and can say it.
 */
export function tailSweep(list, from, radius = TAIL_M, push = TAIL_KNOCK_M) {
  const out = [];
  for (const a of list || []) {
    if (!a || num(a.health) <= 0 || !a.pos) continue;
    const dx = num(a.pos.x) - num(from.x), dz = num(a.pos.z) - num(from.z);
    const d = Math.hypot(dx, dz);
    if (d > radius) continue;
    // Something standing exactly on you is thrown the way you are not looking;
    // any direction is as true as any other and a zero divide is not.
    const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
    out.push({ actor: a, x: num(a.pos.x) + ux * push, z: num(a.pos.z) + uz * push, distance: d });
  }
  return out;
}

// --------------------------------------------------------------- the roar --

/**
 * The player's tier, on the same 1 to 5 ladder `mmo/monsters.js` files monsters
 * under. The bands are skill bands, and the player's attack skill is the number
 * the resolver already fights with, so this is a lookup and not a new stat.
 *
 * A player of skill 0 is tier 1: the roar of a nobody still routs nothing,
 * because nothing is under tier 1.
 */
export function playerTier(actor) {
  const skill = num(attackSkill(actor || {}));
  let tier = 1;
  for (const t of [1, 2, 3, 4, 5]) {
    if (skill >= TIERS[t].band[0]) tier = t;
  }
  return tier;
}

/**
 * "monsters under your tier flee, the rest are stunned as time resumes."
 *
 * Returns the two lists rather than doing anything, so the caller can say how
 * many of each and the test can count them.
 */
export function roarOutcome(list, tier, from = null, range = Infinity) {
  const flee = [], stun = [];
  for (const a of list || []) {
    if (!a || num(a.health) <= 0) continue;
    if (from && a.pos && Math.hypot(num(a.pos.x) - num(from.x), num(a.pos.z) - num(from.z)) > range) continue;
    if (num(a.tier) < num(tier)) flee.push(a); else stun.push(a);
  }
  return { flee, stun, seconds: ROAR_STUN_S };
}

// --------------------------------------------------------------- the wings --

/**
 * Where a flying player ends up this frame. The dev fly camera's own movement
 * rule (camera.js `flyUpdate`), bounded: never below the ground and never more
 * than FLY_CEILING_M above it.
 *
 * `move` is `{ f, r, u }`, each -1, 0 or 1, exactly what `flyUpdate` builds out
 * of WASD and Space. Pure, so the bound is testable without a camera.
 */
export function flyStep(pos, yaw, pitch, move, speed, dt, ground = 0, ceiling = FLY_CEILING_M) {
  const cp = Math.cos(num(pitch)), sp = Math.sin(num(pitch));
  const fx = Math.sin(num(yaw)) * cp, fy = -sp, fz = Math.cos(num(yaw)) * cp;
  const rx = -Math.cos(num(yaw)), rz = Math.sin(num(yaw));
  const f = num(move?.f), r = num(move?.r), u = num(move?.u);
  let vx = fx * f + rx * r, vy = fy * f + u, vz = fz * f + rz * r;
  const len = Math.hypot(vx, vy, vz);
  const out = { x: num(pos?.x), y: num(pos?.y), z: num(pos?.z) };
  if (len > 1e-6) {
    const k = (num(speed) * num(dt)) / len;
    out.x += vx * k; out.y += vy * k; out.z += vz * k;
  }
  out.y = clamp(out.y, num(ground), num(ground) + num(ceiling));
  return out;
}

// ---------------------------------------------------------------- the last --

/**
 * The Ashen Throne's gift: "for one fight, the dragon takes your death and you
 * take its."
 *
 * NOT WIRED, AND SAYING SO. The Ashen Throne boss fight does not exist in this
 * build, and the design gives the swap to that fight and to no other. Calling
 * this outside a boss fight returns `{ swapped: false, reason: 'no boss fight' }`
 * and changes nothing, because a one time gift that could be burned in a meadow
 * is worse than a gift that is not there yet. When the fight is built, its own
 * code passes `{ boss: true }` and reads the two writes back off the result.
 */
export function deathSwap(actor, dragon, opts = {}) {
  if (!opts.boss) {
    return {
      swapped: false,
      reason: 'no boss fight',
      say: 'The last gift waits for the Ashen Throne. There is no such fight in this build yet.',
    };
  }
  if (!actor || !dragon) return { swapped: false, reason: 'no_actor', say: '' };
  if (opts.used) return { swapped: false, reason: 'used', say: 'It has already taken one death for you.' };
  return {
    swapped: true,
    reason: null,
    // what the caller writes: the player lives on the health it had, the dragon falls
    playerHealth: Math.max(1, num(opts.healthOnSwap) || Math.ceil(num(actor.maxHealth) * 0.25)),
    dragonFalls: true,
    say: 'It takes the blow that was yours. It cannot die, and you do not either.',
  };
}

// --------------------------------------------------------------- the words --

/** The line the call says. One sentence, the design's own. */
export const CALL_LINE = 'Wyrmsoul. The world slows.';

/**
 * The line the end says, with the count of what landed in it. Never a number
 * that was not counted: the caller passes what it measured.
 */
export function endLine({ swings = 0, breaths = 0, routed = 0, stunned: stunnedN = 0 } = {}) {
  const bits = [];
  const total = num(swings) + num(breaths);
  if (!total) bits.push('nothing of yours was in the air');
  else {
    const parts = [];
    if (swings) parts.push(swings === 1 ? 'one blow' : `${swings} blows`);
    if (breaths) parts.push(breaths === 1 ? 'one breath' : `${breaths} breaths`);
    bits.push(`${parts.join(' and ')} land${total === 1 ? 's' : ''}`);
  }
  if (routed) bits.push(routed === 1 ? 'one thing runs' : `${routed} of them run`);
  if (stunnedN) bits.push(stunnedN === 1 ? 'one is left standing and stunned' : `${stunnedN} are left standing and stunned`);
  return `Time catches up: ${bits.join(', ')}.`;
}

/** What a gift gained means for Wyrmsoul, for the line the grant says. */
export function giftGainedLine(giftId) {
  const power = GIFT_POWER[giftId];
  if (!power) return null;
  return `Wyrmsoul can do one more thing: ${POWER_LINE[power]}.`;
}

/**
 * The tooltip's body: what Wyrmsoul is, what is held, and why it cannot be
 * called right now. Pure, so the words are testable without a document.
 */
export function tooltipFor({ record, refusal = null, state = null, now = 0 } = {}) {
  const gifts = giftsHeld(record);
  const seconds = (gifts.frost ? FROST_MS : BASE_MS) / 1000;
  const head = `For ${seconds} seconds you and the dragon are one creature. `
    + 'The world moves at a fifth of its speed and you do not, the breath comes out of your hands, '
    + 'and everything you touched lands at once when time resumes.';
  const held = [];
  for (const id of GIFT_IDS) {
    const power = GIFT_POWER[id];
    if (power === 'base' || !gifts[power]) continue;
    held.push(`${GIFT_FOR_POWER[power].realm}: ${POWER_LINE[power]}`);
  }
  const chips = [`${seconds} s`, `${CALL_BOND} Bond`, `within ${APART_M} m`];
  return {
    name: 'Wyrmsoul',
    head,
    chips,
    held,
    heldLine: held.length ? held.join('. ') + '.' : 'No realm has given anything back yet.',
    reason: refusal && !refusal.ok ? refusal.say : '',
    tired: isTired(state, now) ? 'The dragon is tired. It fights, but the Bond does not climb.' : '',
  };
}

// ---------------------------------------------------------------- the audit --

/**
 * Fail loudly if the nine gifts and the nine powers ever stop lining up. The
 * class of bug this is the guard against: `D1-DRAGON.md` owns the ids, this
 * file owns what they do, and two files agreeing by hand is two files that will
 * one day disagree.
 */
export function auditWyrmsoul() {
  const bad = [];
  for (const g of GIFTS) {
    if (!GIFT_POWER[g.id]) bad.push(`gift ${g.id} (${g.realm}) switches nothing on`);
  }
  for (const id of Object.keys(GIFT_POWER)) {
    if (!GIFT_IDS.includes(id)) bad.push(`power ${GIFT_POWER[id]} hangs off ${id}, which dragon.js has never heard of`);
  }
  for (const p of POWERS) {
    if (!POWER_LINE[p]) bad.push(`power ${p} has no line to say`);
  }
  for (const age of AGES) {
    const [lo, hi] = breathDamage(age);
    if (!(hi >= lo) || !(lo > 0)) bad.push(`the ${age}'s breath is ${lo} to ${hi}`);
  }
  if (bad.length) throw new Error(`wyrmsoul: the gifts and the powers disagree:\n  ${bad.join('\n  ')}`);
  return true;
}

auditWyrmsoul();
