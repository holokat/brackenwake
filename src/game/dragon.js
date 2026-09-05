// The dragon: the one companion in the game.
//
// docs/mmo/14-KALDERA.md section 2 is the design. The player names it at
// hatching. It has four ages and each is a body. It fights what you fight,
// eats what its age likes, and it cannot die: when it falls it goes still, the
// Bond empties, and it wakes when the Bond has climbed back to a quarter. It
// cannot be sold, stabled or left behind.
//
// WHAT IS IN THIS FILE
//
//   the rules      pure functions with no THREE and no DOM: ageFor, foodFor,
//                  bondGain, bondDrain, bondRally, hungerAfter, stageBody and
//                  the fall. They run in node and dragon.test.mjs drives every
//                  one of them in both directions.
//   the record     `character.dragon`, its blank, and a defensive reader,
//                  because the save's hydrate list is another agent's file and
//                  a dragon read out of an older save must not be a crash.
//   the actor      an actor of `kind: 'dragon'` the resolver cannot tell from
//                  any other fighter, so every swing it makes and takes goes
//                  through combat_rules.js and nothing else.
//   the entity     `createDragon(deps)`: the body in the world, the following,
//                  the fighting, the feeding, the falling and the waking. The
//                  model is INJECTED (`deps.buildModel`) rather than imported,
//                  which is what keeps this file free of THREE and lets the
//                  rules be measured without a renderer. systems/dragon.js
//                  hands it `buildDragon` from dragon_models.js, so the test
//                  path and the real path are the same path.
//
// THE SIGN CONVENTION ON THE BOND, AND THE ONE RULE THAT IS INVENTED
//
// 14-KALDERA says the Bond "empties slowly when you are more than forty metres
// apart and faster when it has fallen", and that a fallen dragon "wakes when
// the Bond has climbed back to a quarter", and that while it is down the Bond
// climbs only from the player fighting near it. Read literally those two
// sentences cannot both be true: the fallen drain is 2 a second and a swing is
// worth 1 about every one and a half seconds, so a fallen dragon would lose
// ground for ever and never get up. `bondRally` is the invented third rule that
// makes the wake reachable: while the player is fighting within FALL_WATCH_M of
// where it fell, the Bond climbs at RALLY_PER_S, which is more than the fallen
// drain, so it comes round after about nine seconds of somebody standing over
// it swinging. The number is a guess; the arithmetic that forces there to BE a
// number is not.
//
// THE CLOCK. Everything timed here is in seconds of the frame clock, which is
// what `frame.dt` counts, and the two wall clock numbers on the record
// (`fallenUntil`, `fedAt`) are stamped from `frame.now`. Hunger climbs one a
// minute, which is one per sixty seconds of play, not one per game day.

import { MEAL_BASES } from '../mmo/items.js';
import { recompute, zeroBonuses, zeroResists, MONSTER_STAMINA } from './actor.js';
import { RESIST_CAP, swingSeconds } from '../mmo/combat_rules.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ the ages

/** The four bodies of 14-KALDERA section 2, youngest first. */
export const AGES = ['hatchling', 'drake', 'young', 'dragon'];

/** What a line of prose calls each one. */
export const AGE_LABEL = {
  hatchling: 'hatchling',
  drake: 'drake',
  young: 'young dragon',
  dragon: 'dragon',
};

/** The one line each age is described by, for the window and the log. */
export const AGE_LINE = {
  hatchling: 'the size of a cat, and it rides your shoulder',
  drake: 'the size of a large dog, and it walks at your heel',
  young: 'the size of a horse, and one day you will ride it',
  dragon: 'the size of a house, and the Wyrmking\'s equal',
};

// ----------------------------------------------------------------- the gifts
//
// The nine Wyrmsoul gifts of 14-KALDERA section 3, each named after the realm
// that gives it. D2 owns what they DO; this file owns only which ones are held,
// because the age is a function of them.

export const GIFTS = [
  { id: 'greenwold', realm: 'the Greenwold', gift: 'the base' },
  { id: 'verdant', realm: 'Verdant Deep', gift: 'the dragon\'s senses' },
  { id: 'saltmarch', realm: 'the Saltmarch', gift: 'the tail' },
  { id: 'ember', realm: 'Ember Wastes', gift: 'true fire' },
  { id: 'stormpeaks', realm: 'the Stormpeaks', gift: 'wings' },
  { id: 'boneyard', realm: 'the Boneyard', gift: 'the roar' },
  { id: 'frostreach', realm: 'Frostreach', gift: 'frost breath' },
  { id: 'sunken', realm: 'the Sunken Kingdom', gift: 'the deep' },
  { id: 'throne', realm: 'the Ashen Throne', gift: 'the last' },
];
export const GIFT_IDS = GIFTS.map((g) => g.id);
export const GIFT_BY_ID = Object.fromEntries(GIFTS.map((g) => [g.id, g]));

/**
 * The pairs of realms each age is bought with, in order.
 *
 * 14-KALDERA gives three lines: a drake "after Verdant Deep and the Saltmarch",
 * a young dragon "after Ember Wastes and the Stormpeaks", a dragon "after the
 * Boneyard and Frostreach". The ladder is walked from the bottom and STOPS at
 * the first pair that is not held, so a save carrying the Boneyard and
 * Frostreach but not Verdant Deep is a hatchling and not a dragon. That is a
 * decision and not an accident: the ages are a growing animal, and an animal
 * does not skip a body.
 */
export const AGE_STEPS = [
  { age: 'drake', needs: ['verdant', 'saltmarch'] },
  { age: 'young', needs: ['ember', 'stormpeaks'] },
  { age: 'dragon', needs: ['boneyard', 'frostreach'] },
];

/** The age a set of held gifts buys. Anything unrecognised is ignored. */
export function ageFor(gifts) {
  const held = new Set(Array.isArray(gifts) ? gifts.filter((g) => typeof g === 'string') : []);
  let age = 'hatchling';
  for (const step of AGE_STEPS) {
    if (!step.needs.every((n) => held.has(n))) break;
    age = step.age;
  }
  return age;
}

// ------------------------------------------------------------------- the food
//
// "What it eats, and it changes by age" (14-KALDERA section 2). The ids are
// items.js's own food bases, so a thing the player can actually be holding.

export const FOOD_BY_AGE = {
  hatchling: ['egg', 'rat_meat'],
  drake: ['fish', 'game_meat', 'crab_meat'],
  young: ['boar_meat', 'venison', 'wolf_meat', 'bear_meat'],
  dragon: ['bear_meat', ...MEAL_BASES],
};

/** The base ids this age will eat. A fresh array every call: callers sort it. */
export function foodFor(age) {
  return [...(FOOD_BY_AGE[age] || FOOD_BY_AGE.hatchling)];
}

/** True when this base is food for this age. */
export const eats = (age, base) => foodFor(age).includes(String(base));

// ------------------------------------------------------------------- the Bond

/** Metres past which the Bond drains: "more than forty metres apart". */
export const APART_M = 40;
/** Metres of a fallen dragon inside which the player's fighting rallies it. */
export const FALL_WATCH_M = 20;
/** The Bond a fallen dragon wakes at: "climbed back to a quarter". */
export const WAKE_BOND = 25;
/** How long it lies there at the least, whatever the Bond does. */
export const FALL_MIN_MS = 4000;

/** What each event is worth. Nothing else may add to the Bond. */
export const BOND_GAIN = { hitTogether: 1, fed: 8, tookBlow: 4 };
/** Points a second the Bond drains, by cause. */
export const BOND_DRAIN = { apart: 1, fallen: 2 };
/** Points a second a fallen dragon gains while somebody fights over it. */
export const RALLY_PER_S = 5;

/** The Bond an event is worth. An event with no row is worth nothing. */
export function bondGain(event) {
  return num(BOND_GAIN[event]);
}

/**
 * The Bond lost over `dt` seconds. `apart` is "further than APART_M", `fallen`
 * is "it is down". Fallen is the faster of the two and they do not add: it is
 * one drain with two rates, which is what "and faster when it has fallen"
 * means.
 */
export function bondDrain(dt, apart, fallen) {
  const d = Math.max(0, num(dt));
  if (fallen) return d * BOND_DRAIN.fallen;
  if (apart) return d * BOND_DRAIN.apart;
  return 0;
}

/** The Bond a fallen dragon gains over `dt` while somebody fights over it. */
export function bondRally(dt, fighting) {
  return fighting ? Math.max(0, num(dt)) * RALLY_PER_S : 0;
}

// ----------------------------------------------------------------- the hunger

/** Points of hunger a minute, so one a minute of play. */
export const HUNGER_PER_MIN = 1;
/** Above this it fights at half speed. */
export const HUNGRY_AT = 70;
/** What one feed takes off the hunger. */
export const FEED_HUNGER = 30;
/** A feed pays the Bond at most this often. The food is still eaten. */
export const FEED_BOND_MS = 60000;
/** How much slower a hungry dragon is, in speed and in swings. */
export const HUNGRY_FACTOR = 0.5;

/** Hunger after `dt` seconds, clamped to the 0..100 the record carries. */
export function hungerAfter(dt, hunger) {
  return clamp(num(hunger) + (Math.max(0, num(dt)) / 60) * HUNGER_PER_MIN, 0, 100);
}

/** The word the window and the log use for a hunger number. */
export function hungerWord(hunger) {
  const h = clamp(num(hunger), 0, 100);
  if (h < 15) return 'full';
  if (h < 40) return 'content';
  if (h < HUNGRY_AT) return 'peckish';
  if (h < 88) return 'hungry';
  return 'ravenous';
}

// ------------------------------------------------------------------ the body

/**
 * The size of each age, in metres, and where it rides.
 *
 * The hatchling is carried: it sits on the player rig's `back` anchor, offset
 * out to the right shoulder. `offset` is in that anchor's own frame, where the
 * back sits at (0, 0.42, -0.11) in the torso and the shoulder is 0.27 out and
 * 0.08 up from it (player.js BODY). Everything older walks to a heel point
 * behind and to the left.
 */
export const STAGE = {
  // The hatchling's reach is longer than its body because it never climbs
  // down: it bites over your shoulder at whatever you are swinging at, so its
  // reach has to cover a sword's. UNARMED.reach is 1.0 and a one hander is 1.4.
  hatchling: { length: 0.45, height: 0.27, carry: 'shoulder', anchor: 'back', offset: { x: 0.30, y: 0.10, z: 0.02 }, reach: 1.6, speed: 0, radius: 0.16 },
  drake: { length: 1.10, height: 0.58, carry: 'heel', anchor: null, offset: null, reach: 1.5, speed: 6.0, radius: 0.34 },
  young: { length: 3.20, height: 1.69, carry: 'heel', anchor: null, offset: null, reach: 2.6, speed: 7.0, radius: 0.85 },
  dragon: { length: 7.00, height: 3.70, carry: 'heel', anchor: null, offset: null, reach: 4.2, speed: 8.0, radius: 1.7 },
};

/** Where the heel point is: 1.5 m behind the player and to the left. */
export const HEEL = { back: 1.5, left: 0.8 };

/** The body of an age. Unknown ages read as a hatchling rather than throwing. */
export function stageBody(age) {
  const key = AGES.includes(age) ? age : 'hatchling';
  const s = STAGE[key];
  return { age: key, ...s, offset: s.offset ? { ...s.offset } : null };
}

// ----------------------------------------------------------------- the fighter
//
// The numbers 14-KALDERA does not give. The two ends are the brief's: a
// hatchling bites for 1 to 3 with a hit skill of 20, a full dragon for 30 to 50
// with 90. The two in between are interpolated along the same curve the monster
// tiers run on, and they are written here rather than buried so they can be
// argued with. Fire resistance is the cap at every age, because a dragon that
// could be burned to death is not a dragon; the physical resistance grows with
// the hide.

export const AGE_STATS = {
  hatchling: { damage: [1, 3], hit: 20, def: 20, hp: 40, speed: 2.2, resists: { fire: RESIST_CAP, physical: 5 }, difficulty: 10 },
  drake: { damage: [6, 12], hit: 45, def: 42, hp: 120, speed: 2.0, resists: { fire: RESIST_CAP, physical: 15 }, difficulty: 30 },
  young: { damage: [14, 26], hit: 70, def: 62, hp: 300, speed: 1.9, resists: { fire: RESIST_CAP, physical: 30 }, difficulty: 50 },
  dragon: { damage: [30, 50], hit: 90, def: 82, hp: 700, speed: 1.8, resists: { fire: RESIST_CAP, physical: 45 }, difficulty: 70 },
};

/** The skill its bite trains, and the skill it defends with. Wrestling, as fists. */
export const DRAGON_SKILL = 'wrestling';

let dragonCount = 0;

/**
 * The dragon as an actor.
 *
 * Built exactly the way `actor.spawnMonster` builds a monster, and for the same
 * reason: `combat_rules.attackSkill(actor)` has to come out at the age's `hit`
 * and `defenceSkill(actor)` at its `def`, or the numbers above are a decoration
 * and the resolver fights with something else. attackSkill is
 * weaponSkill + tactics * 0.25 + bonuses.hit and defenceSkill is
 * weaponSkill * 0.5 + parrying * 0.5 + DEX * 0.4 + bonuses.defence, so with no
 * stats and no parry the whole of the correction is one subtraction.
 *
 * `ally: true` and `faction: 'ally'` are what a monster's targeting has to see
 * to be allowed to come for it. `kind: 'dragon'` is what everything else reads.
 */
export function dragonActor(record, opts = {}) {
  const rec = readDragon(record);
  const A = AGE_STATS[rec.age] || AGE_STATS.hatchling;
  const stage = stageBody(rec.age);
  const pos = opts.pos || { x: 0, y: 0, z: 0 };

  const weapon = {
    id: 'dragon_bite',
    name: `${rec.name || 'the hatchling'}'s bite`,
    skill: DRAGON_SKILL,
    hands: 0,
    minDamage: A.damage[0],
    maxDamage: A.damage[1],
    speed: A.speed,
    weight: 0,
    damageType: 'physical',
    ranged: false,
    reach: stage.reach,
    range: null,
  };

  const bonuses = zeroBonuses();
  bonuses.defence = A.def - A.hit * 0.5;
  const resists = zeroResists();
  for (const k of Object.keys(A.resists)) if (k in resists) resists[k] = A.resists[k];

  const actor = {
    id: `dragon#${++dragonCount}`,
    kind: 'dragon',
    ally: true,
    name: rec.name || 'the hatchling',
    age: rec.age,
    tier: AGES.indexOf(rec.age) + 2,
    family: 'dragon',
    temperament: 'loyal',
    notes: ['fireImmune'],
    boss: false,
    lootTable: [],
    gold: [0, 0],

    pos: { x: num(pos.x), y: num(pos.y), z: num(pos.z) },
    yaw: 0,

    baseStats: { str: 0, dex: 0, int: 0, con: 0, wis: 0 },
    baseSkills: { [DRAGON_SKILL]: A.hit },
    equipment: {},
    stats: { str: 0, dex: 0, int: 0, con: 0, wis: 0 },
    skills: { [DRAGON_SKILL]: A.hit },
    bonuses,
    naturalBonuses: bonuses,
    resists,
    naturalResists: resists,
    weakTo: [],
    vulnerability: {},
    ar: Math.round(A.def * 0.4),
    naturalAr: Math.round(A.def * 0.4),
    naturalWeapon: weapon,
    weapon,
    naturalShield: null,
    shield: null,

    natural: {
      maxHealth: A.hp, maxMana: 0, maxStamina: MONSTER_STAMINA,
      healthRegen: 0, manaRegen: 0, staminaRegen: 0,
    },
    health: A.hp, maxHealth: A.hp,
    mana: 0, maxMana: 0,
    stamina: MONSTER_STAMINA, maxStamina: MONSTER_STAMINA,
    healthRegen: 0, manaRegen: 0, staminaRegen: 0,

    difficulty: A.difficulty,
    run: stage.speed,
    radius: stage.radius,
    aggro: 0,                 // it never picks its own fight; it takes yours
    leash: Infinity,          // and it is never leashed: it follows you anywhere
    flees: false,

    buffs: [],
    status: {},
    lastSwingAt: -A.speed * 1000,
    casting: null,
    faction: 'ally',
    ai: { home: { x: num(pos.x), z: num(pos.z) }, aggro: 0, leash: Infinity, state: 'idle', target: null, leashSince: null },
    model: null,
    anim: 'idle',
    now: 0,
  };
  return recompute(actor);
}

// ----------------------------------------------------------------- the record

/** A fresh hatchling. Hunger 20: it has just eaten the shell. */
export function blankDragon() {
  return {
    name: null,
    age: 'hatchling',
    bond: 0,
    hunger: 20,
    fallen: false,
    fallenUntil: 0,
    trueName: null,
    gifts: [],
    fedAt: 0,
  };
}

/**
 * The record, read defensively. `character.dragon` is written by another
 * agent's hydrate and may be missing, half filled, or carry an age this build
 * has never heard of; none of those may be a crash, and none of them may be a
 * silently different dragon either, so every field falls back to the blank's.
 */
export function readDragon(raw) {
  const d = blankDragon();
  if (!raw || typeof raw !== 'object') return d;
  if (typeof raw.name === 'string' && raw.name.trim()) d.name = raw.name.trim();
  if (AGES.includes(raw.age)) d.age = raw.age;
  if (Number.isFinite(raw.bond)) d.bond = clamp(raw.bond, 0, 100);
  if (Number.isFinite(raw.hunger)) d.hunger = clamp(raw.hunger, 0, 100);
  d.fallen = !!raw.fallen;
  if (Number.isFinite(raw.fallenUntil)) d.fallenUntil = raw.fallenUntil;
  if (typeof raw.trueName === 'string' && raw.trueName.trim()) d.trueName = raw.trueName.trim();
  if (Array.isArray(raw.gifts)) d.gifts = raw.gifts.filter((g) => GIFT_IDS.includes(g));
  if (Number.isFinite(raw.fedAt)) d.fedAt = raw.fedAt;
  return d;
}

// ------------------------------------------------------------------ the name

/** creation.js's rule, with the shorter cap a dragon's name is given. */
export const DRAGON_NAME_MIN = 2;
export const DRAGON_NAME_MAX = 14;
const NAME_OK = /^[A-Za-z][A-Za-z '-]*$/;

export function validateDragonName(name) {
  const n = String(name == null ? '' : name).trim();
  if (n.length < DRAGON_NAME_MIN) return { ok: false, name: n, error: `a name wants at least ${DRAGON_NAME_MIN} letters` };
  if (n.length > DRAGON_NAME_MAX) return { ok: false, name: n, error: `${DRAGON_NAME_MAX} letters is the most a dragon's name can be` };
  if (!NAME_OK.test(n)) return { ok: false, name: n, error: 'letters, spaces, apostrophes and hyphens, and it starts with a letter' };
  return { ok: true, name: n, error: null };
}

// ----------------------------------------------------------------- the entity

/** The events `on(event, fn)` fires. D2 reads all six. */
export const EVENTS = ['hitTogether', 'fed', 'tookBlow', 'fell', 'woke', 'grew'];

const dist2D = (a, b) => Math.hypot(num(a?.x) - num(b?.x), num(a?.z) - num(b?.z));

/**
 * The dragon in the world.
 *
 * @param deps {
 *   character,                the document. `character.dragon` is the record.
 *   hud,                      log and toast. Every state change owes a line.
 *   scene,                    THREE scene, or null to run headless
 *   buildModel(age),          dragon_models.buildDragon. null runs bodiless.
 *   playerRig,                { pos, yaw, parts, group } from player.js
 *   playerActor,              the actor the resolver fights over
 *   heightAt(x, z),           the ground
 *   swing(attacker, defender, opts),   monsters.swingAt, or an equal
 *   targetActor(),            the monster the player is on, or null
 *   hostiles(),               every live hostile actor, for "who is on it"
 *   inventory,                for feeding out of the pack
 *   onNeedsName(),            called once when a nameless dragon hatches
 *   stepToward,               monsters.stepToward, injected so the walk is the
 *                             same walk every other body in the game takes
 * }
 */
export function createDragon(deps = {}) {
  const {
    character = {}, hud = null, scene = null, buildModel = null,
    playerRig = null, playerActor = null, heightAt = null,
    swing = null, targetActor = null, hostiles = null, inventory = null,
    onNeedsName = null, stepToward = null,
  } = deps;

  const say = (text, kind) => {
    if (!text) return;
    if (hud && typeof hud.log === 'function') hud.log(text, kind);
    else if (hud && typeof hud.toast === 'function') hud.toast(text, kind);
  };

  // ---- the record, hatched if there is not one ----------------------------
  const hatched = !character.dragon;
  const record = readDragon(character.dragon);
  character.dragon = record;
  // A record whose gifts and age disagree is the save being older than this
  // build, or another agent's dungeon having granted a gift while the dragon
  // was not looking. The gifts are the truth; the age is a function of them.
  const wanted = ageFor(record.gifts);
  if (wanted !== record.age) record.age = wanted;

  const listeners = new Map(EVENTS.map((e) => [e, []]));
  function on(event, fn) {
    const list = listeners.get(event);
    if (!list || typeof fn !== 'function') return () => {};
    list.push(fn);
    return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
  }
  function emit(event, info = {}) {
    const list = listeners.get(event);
    if (!list) return;
    for (const fn of [...list]) {
      try { fn({ event, record, ...info }); } catch (e) { console.error(`[dragon] a ${event} listener threw`, e); }
    }
  }

  // ---- the body -----------------------------------------------------------
  let model = null;
  function startPos() {
    const p = playerRig?.pos || { x: 0, y: 0, z: 0 };
    return { x: num(p.x) - HEEL.left, y: num(p.y), z: num(p.z) - HEEL.back };
  }

  // ONE position object for the dragon's whole life, as the player system does
  // it: the model, the actor and the walk all write to this and nothing else,
  // so they can never be in two places. `dragonActor` COPIES what it is handed,
  // so every rebuilt actor is given this object back afterwards. Missing that
  // line once left a grown drake's fighter standing where it hatched, in reach
  // of nothing, for ever, while its body walked about; it was found by counting
  // swings and not by reading the code.
  const pos = startPos();

  /** A fighter at the record's age, sharing this entity's one position. */
  function makeActor(keepFraction = 1, keepYaw = 0) {
    const a = dragonActor(record, { pos });
    a.pos = pos;
    a.yaw = keepYaw;
    a.ai.home = { x: pos.x, z: pos.z };
    a.health = Math.max(1, Math.round(a.maxHealth * clamp(keepFraction, 0.05, 1)));
    return a;
  }

  let actor = makeActor(1, 0);

  function makeModel() {
    if (!buildModel) return null;
    const m = buildModel(record.age);
    if (scene && typeof scene.add === 'function') scene.add(m.group);
    return m;
  }
  function dropModel() {
    if (!model) return;
    if (model.group?.parent) model.group.parent.remove(model.group);
    model.dispose?.();
    model = null;
  }
  model = makeModel();

  // ---- the state that is not the record -----------------------------------
  const st = {
    saidHungry: false,
    lastPlayerSwingAt: num(playerActor?.lastSwingAt),
    lastPlayerHealth: num(playerActor?.health),
    hungrySwingUntil: 0,
    fightingUntil: 0,          // frame ms: the player swung recently
    speed: 0,
    riding: false,
    now: 0,
  };

  const name = () => record.name || 'the hatchling';
  const stage = () => stageBody(record.age);

  // ---- growing ------------------------------------------------------------
  /** Grow into whatever the gifts now buy, and say so. */
  function checkAge() {
    const want = ageFor(record.gifts);
    if (want === record.age) return false;
    const was = record.age;
    record.age = want;
    actor = makeActor(actor.health / (actor.maxHealth || 1), actor.yaw);
    dropModel();
    model = makeModel();
    const s = stageBody(want);
    const line = want === 'drake' && was === 'hatchling'
      ? `${name()} has grown. It is a drake now, and it will not fit on your shoulder.`
      : `${name()} has grown. It is a ${AGE_LABEL[want]} now, ${AGE_LINE[want]}.`;
    say(line, 'good');
    emit('grew', { from: was, to: want, stage: s });
    return true;
  }

  /** A realm's gift, held. The dungeons D2 and the world team write call this. */
  function grant(giftId) {
    if (!GIFT_IDS.includes(giftId)) return false;
    if (record.gifts.includes(giftId)) return false;
    record.gifts.push(giftId);
    const g = GIFT_BY_ID[giftId];
    say(`${name()} takes back ${g.gift} from ${g.realm}.`, 'good');
    checkAge();
    return true;
  }

  // ---- the Bond -----------------------------------------------------------
  function addBond(n, event, info) {
    const before = record.bond;
    record.bond = clamp(record.bond + num(n), 0, 100);
    if (event) emit(event, { ...info, bond: record.bond, gained: record.bond - before });
    return record.bond - before;
  }

  // ---- falling and waking -------------------------------------------------
  function fall(killer) {
    if (record.fallen) return false;
    record.fallen = true;
    record.fallenUntil = st.now + FALL_MIN_MS;
    record.bond = 0;
    actor.health = 0;
    actor.status = {};
    actor.ai.target = null;
    model?.setAnim('fall');
    const by = killer?.name ? ` The ${killer.name} put it down.` : '';
    say(`${name()} has fallen. It is not dead, it cannot die, but it is down and the Bond is empty.${by}`, 'bad');
    say(`Fight where it fell and it will come round; walk away and it will not.`);
    emit('fell', { killer: killer || null });
    return true;
  }

  function wake() {
    if (!record.fallen) return false;
    record.fallen = false;
    record.fallenUntil = 0;
    actor.dead = false;                 // combat.kill latches this; a wake clears it
    actor.health = Math.max(1, Math.round(actor.maxHealth * 0.5));
    actor.status = {};
    model?.setAnim('wake');
    say(`${name()} gets its feet under it, with ${actor.health} of ${actor.maxHealth} health and a Bond of ${Math.round(record.bond)}.`, 'good');
    emit('woke', {});
    return true;
  }

  // ---- feeding ------------------------------------------------------------
  /**
   * Feed it one thing. `where` is an inventory address; without one the first
   * fitting food in the pack is used. Every path says what happened, including
   * the paths where nothing happened.
   */
  function feed(baseOrWhere) {
    const likes = foodFor(record.age);
    if (!inventory) { say(`there is no pack to feed ${name()} out of.`, 'bad'); return { ok: false, reason: 'no_pack' }; }
    const items = character.pack?.items || [];

    let index = -1;
    if (typeof baseOrWhere === 'string') {
      index = items.findIndex((it) => it && it.base === baseOrWhere);
      if (index < 0) { say(`you are not carrying any ${baseOrWhere.replace(/_/g, ' ')}.`, 'bad'); return { ok: false, reason: 'not_carried' }; }
    } else if (baseOrWhere && typeof baseOrWhere === 'object' && Number.isFinite(baseOrWhere.pack)) {
      index = Math.floor(baseOrWhere.pack);
    } else if (Number.isFinite(baseOrWhere)) {
      index = Math.floor(baseOrWhere);
    } else {
      index = items.findIndex((it) => it && likes.includes(it.base));
      if (index < 0) {
        say(`${name()} eats ${listOf(likes)}, and you are carrying none of it.`, 'bad');
        return { ok: false, reason: 'nothing_it_eats' };
      }
    }

    const item = items[index];
    if (!item) { say('there is nothing in that slot.', 'bad'); return { ok: false, reason: 'empty' }; }
    if (!likes.includes(item.base)) {
      say(`${name()} sniffs at it and turns away. A ${AGE_LABEL[record.age]} eats ${listOf(likes)}.`, 'bad');
      return { ok: false, reason: 'wrong_food', base: item.base };
    }
    if (record.fallen) {
      say(`${name()} is down and will not eat.`, 'bad');
      return { ok: false, reason: 'fallen' };
    }

    const taken = inventory.remove({ pack: index }, 1);
    if (!taken || !taken.ok) { say(`the food would not come out of the pack.`, 'bad'); return { ok: false, reason: 'remove_failed' }; }

    const wasHunger = record.hunger;
    record.hunger = clamp(record.hunger - FEED_HUNGER, 0, 100);
    if (record.hunger <= HUNGRY_AT) st.saidHungry = false;

    // `fedAt` of 0 means never fed, which is what a blank record and an older
    // save both carry. Reading 0 as "fed at time zero" made the very FIRST feed
    // of a dragon's life pay no Bond at all, silently, which is exactly the kind
    // of thing an eight point gain has to be measured for rather than assumed.
    const cooled = num(record.fedAt) > 0 && st.now - num(record.fedAt) < FEED_BOND_MS;
    const gained = cooled ? 0 : addBond(bondGain('fed'), 'fed', { base: item.base, index });
    if (!cooled) record.fedAt = Math.max(1, st.now);
    else emit('fed', { base: item.base, index, bond: record.bond, gained: 0, cooled: true });

    const foodName = String(item.base).replace(/_/g, ' ');
    const hungerLine = `${hungerWord(wasHunger)} to ${hungerWord(record.hunger)}`;
    if (gained > 0) {
      say(`${name()} takes the ${foodName} whole. ${hungerLine}, and the Bond is ${Math.round(record.bond)}.`, 'good');
    } else {
      say(`${name()} takes the ${foodName} whole. ${hungerLine}. It was fed too recently for the Bond to move.`);
    }
    return { ok: true, base: item.base, gained, hunger: record.hunger, cooled };
  }

  const listOf = (ids) => {
    const words = ids.map((i) => i.replace(/_/g, ' '));
    if (words.length <= 1) return words[0] || 'nothing';
    return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  };

  // ---- the frame ----------------------------------------------------------
  //
  // Follow, fight, drain, climb, and grow hungry. In that order, because the
  // fight decides whether the Bond is climbing and the hunger decides how fast
  // any of it happens.

  function run(frame = {}) {
    const dt = clamp(num(frame.dt), 0, 0.1);
    const now = num(frame.now);
    st.now = now;
    actor.now = now;

    // A gift may have been granted by another system since the last frame, and
    // the age is a function of the gifts and never of anything else.
    checkAge();

    const p = playerRig?.pos || { x: 0, y: 0, z: 0 };
    const gap = dist2D(pos, p);
    const hungry = record.hunger > HUNGRY_AT;

    // Whatever emptied it, it falls rather than dies. combat.js's own onDeath
    // gets here first in the real game; this is the second door, so a poison
    // tick or a fall that the hook never saw cannot leave a corpse standing.
    if (actor.health <= 0 && !record.fallen) fall(actor.ai?.target || null);

    // -- what the player did since the last frame ---------------------------
    // A landed blow is not observable from outside combat.js: `onHit` only
    // fires when a weapon rolls an effect. A STARTED swing is: queueSwing
    // stamps `lastSwingAt` on the attacker, and that is the same stamp for the
    // player's click, so this counts swings begun and not blows landed. It is
    // the closest honest reading of "every hit either of you lands" that can be
    // taken without editing the resolver, and it is written down rather than
    // implied.
    const swungNow = num(playerActor?.lastSwingAt) > st.lastPlayerSwingAt;
    if (swungNow) { st.lastPlayerSwingAt = num(playerActor.lastSwingAt); st.fightingUntil = now + 3000; }
    const playerFighting = now < st.fightingUntil;

    // -- the player took a blow that was meant for it -----------------------
    // "Stand between it and an attacker": the player's health goes down while
    // something alive has the DRAGON as its target and the two of you are all
    // but touching. Nothing in monsters.js aims at the dragon yet, so this is
    // dormant until the one line named in docs/mmo/wiring/D1.md is added; it is
    // written against the real condition rather than a stand in for it.
    const health = num(playerActor?.health);
    if (health < st.lastPlayerHealth && !record.fallen && gap <= 5 && aimedAtUs()) {
      addBond(bondGain('tookBlow'), 'tookBlow', { taken: st.lastPlayerHealth - health });
      say(`You take that one instead of ${name()}. The Bond is ${Math.round(record.bond)}.`, 'good');
    }
    st.lastPlayerHealth = health;

    // -- fallen: it lies there, and only a fight over it brings it round -----
    if (record.fallen) {
      record.bond = clamp(record.bond - bondDrain(dt, gap > APART_M, true)
        + bondRally(dt, playerFighting && gap <= FALL_WATCH_M), 0, 100);
      model?.setAnim('fall');
      st.speed = 0;
      place();
      model?.update(dt, 0);
      if (record.bond >= WAKE_BOND && now >= num(record.fallenUntil)) wake();
      return;
    }

    // -- the drain ----------------------------------------------------------
    if (gap > APART_M) record.bond = clamp(record.bond - bondDrain(dt, true, false), 0, 100);

    // -- hunger -------------------------------------------------------------
    record.hunger = hungerAfter(dt, record.hunger);
    if (record.hunger > HUNGRY_AT && !st.saidHungry) {
      st.saidHungry = true;
      say(`${name()} is ${hungerWord(record.hunger)} and slowing down. It eats ${listOf(foodFor(record.age))}.`, 'bad');
    }
    if (record.hunger <= HUNGRY_AT) st.saidHungry = false;

    // -- where it wants to be ------------------------------------------------
    const s = stage();
    const target = typeof targetActor === 'function' ? targetActor() : null;
    const live = target && num(target.health) > 0 ? target : null;
    st.riding = s.carry === 'shoulder';

    if (st.riding) {
      // It rides, and it never climbs down: the anchor carries it and it bites
      // over your shoulder at whatever you are swinging at.
      pos.x = num(p.x); pos.y = num(p.y) + s.height; pos.z = num(p.z);
      actor.yaw = num(playerRig?.yaw);
      st.speed = 0;
      model?.setAnim('idle');
    } else {
      const to = live ? { x: num(live.pos.x), z: num(live.pos.z) } : heelPoint(p);
      const reach = s.reach + s.radius + num(live?.radius ?? 0.4);
      const want = live ? Math.max(0.2, reach - 0.4) : 0.35;
      const d = dist2D(pos, to);
      const speed = (live ? s.speed : s.speed * (d > 6 ? 1 : 0.7)) * (hungry ? HUNGRY_FACTOR : 1);
      let moved = 0;
      if (d > want && typeof stepToward === 'function') {
        const step = stepToward(pos, to, speed, dt, heightAt);
        if (step.moved > 0) {
          actor.yaw = Math.atan2(step.x - pos.x, step.z - pos.z);
          pos.x = step.x; pos.z = step.z; pos.y = step.y;
        }
        moved = step.moved;
      } else if (typeof heightAt === 'function') {
        pos.y = num(heightAt(pos.x, pos.z));
      }
      st.speed = dt > 0 ? moved / dt : 0;
      model?.setAnim(st.speed > 0.2 ? 'walk' : 'idle');
    }

    // -- the swing, through the same call a monster's swing goes through ----
    if (live && typeof swing === 'function' && (!hungry || now >= st.hungrySwingUntil)) {
      const r = swing(actor, live, { now });
      if (r && r.queued) {
        model?.setAnim('swing');
        // A hungry dragon swings on TWICE its own timer, which is what "at half
        // speed" means for an animal whose only act is a bite. It has to be
        // twice and not once: queueSwing's own cooldown already ends one swing
        // time from now, so a gate set to the same instant changes nothing, and
        // the first version of this line was measured at 8 swings hungry
        // against 8 swings fed.
        if (hungry) st.hungrySwingUntil = now + swingSeconds(actor) * 2000;
        addBond(bondGain('hitTogether'), 'hitTogether', { by: 'dragon', target: live.name });
      }
    }
    // and the other half of "every hit either of you lands while both are in
    // the fight": the player's own swing, with the dragon beside them
    if (swungNow && gap <= APART_M) addBond(bondGain('hitTogether'), 'hitTogether', { by: 'player' });

    place();
    model?.update(dt, st.speed);
  }

  /** True when something alive is currently on the dragon rather than on you. */
  function aimedAtUs() {
    const list = typeof hostiles === 'function' ? hostiles() : null;
    if (!Array.isArray(list)) return false;
    return list.some((a) => a && num(a.health) > 0 && a.ai && a.ai.target === actor);
  }

  /** The heel: 1.5 m behind the player and 0.8 m to their left. */
  function heelPoint(p) {
    const yaw = num(playerRig?.yaw);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // left of a +z facing is -x rotated by the same yaw
    const lx = Math.cos(yaw), lz = -Math.sin(yaw);
    return { x: num(p.x) - fx * HEEL.back - lx * HEEL.left, z: num(p.z) - fz * HEEL.back - lz * HEEL.left };
  }

  /**
   * Put the body where the actor is. A hatchling is parented to the player
   * rig's `back` anchor and offset out to the right shoulder; everything older
   * stands on the ground on its own.
   */
  function place() {
    if (!model) return;
    const s = stage();
    const anchor = s.anchor && playerRig?.parts ? playerRig.parts[s.anchor] : null;
    if (s.carry === 'shoulder' && anchor) {
      if (model.group.parent !== anchor) {
        model.group.parent?.remove(model.group);
        anchor.add(model.group);
      }
      model.group.position.set(s.offset.x, s.offset.y, s.offset.z);
      model.group.rotation.set(0, 0, 0);
      return;
    }
    if (scene && model.group.parent !== scene) {
      model.group.parent?.remove(model.group);
      scene.add?.(model.group);
    }
    model.group.position.set(pos.x, pos.y, pos.z);
    model.group.rotation.y = num(actor.yaw);
  }

  // ---- the harness's handles ---------------------------------------------
  function setAge(age) {
    if (!AGES.includes(age)) return false;
    const was = record.age;
    record.age = age;
    // keep the gifts honest with the age the harness asked for, or the very
    // next frame's checkAge would put it straight back
    for (const step of AGE_STEPS) {
      const upTo = AGES.indexOf(step.age) <= AGES.indexOf(age);
      for (const n of step.needs) {
        const has = record.gifts.includes(n);
        if (upTo && !has) record.gifts.push(n);
        if (!upTo && has) record.gifts.splice(record.gifts.indexOf(n), 1);
      }
    }
    actor = makeActor(actor.health / (actor.maxHealth || 1), actor.yaw);
    dropModel();
    model = makeModel();
    place();
    say(`${name()} is a ${AGE_LABEL[age]} now, ${AGE_LINE[age]}.`);
    if (was !== age) emit('grew', { from: was, to: age, stage: stageBody(age) });
    return true;
  }

  function rename(next) {
    const v = validateDragonName(next);
    if (!v.ok) { say(v.error, 'bad'); return v; }
    if (record.trueName) { say(`it has a true name now. ${record.trueName} is what it is called.`, 'bad'); return { ok: false, name: v.name, error: 'has a true name' }; }
    const was = record.name;
    record.name = v.name;
    actor.name = v.name;
    actor.weapon.name = `${v.name}'s bite`;
    actor.naturalWeapon.name = actor.weapon.name;
    say(was ? `The ${AGE_LABEL[record.age]} answers to ${v.name} now.` : `You call it ${v.name}. It looks at you when you say it.`, 'good');
    return v;
  }

  if (hatched) {
    say(`An egg the size of a loaf cracks in your pack, and a hatchling climbs out onto your shoulder.`, 'good');
    say(`It has no name yet. Press N and give it one.`);
    if (typeof onNeedsName === 'function') { try { onNeedsName(); } catch (e) { console.error('[dragon] the naming window would not open', e); } }
  } else if (!record.name) {
    say(`The hatchling on your shoulder still has no name. Press N and give it one.`);
  }
  place();

  return {
    record, on, emit,
    get actor() { return actor; },
    get model() { return model; },
    get pos() { return pos; },
    get age() { return record.age; },
    get bond() { return record.bond; },
    get hunger() { return record.hunger; },
    get awake() { return !record.fallen; },
    get name() { return record.trueName || record.name; },
    get named() { return !!record.name; },
    get hungry() { return record.hunger > HUNGRY_AT; },
    get speed() { return st.speed; },
    get riding() { return st.riding; },
    stage,
    run, feed, fall, wake, setAge, rename, grant, checkAge,
    /** The gifts, as the window draws them: nine rows, held or not. */
    gifts: () => GIFTS.map((g) => ({ ...g, held: record.gifts.includes(g.id) })),
    foods: () => foodFor(record.age),
    dispose() { dropModel(); },
  };
}
