import { CELLAR_BOSSES } from '../mmo/cellar_bosses.js';
// What a monster does that is not walking at you and swinging.
//
// `monsters.js` is the runtime: the bodies, the sweep, the dead list, the
// frame. This file is the arithmetic underneath the four behaviours that were
// named as "not done" at the end of W2, and it is pure on purpose. No THREE,
// no scene, no actors of any particular build: every function here takes plain
// objects and returns plain objects, so `monster_ai.test.mjs` can drive three
// hundred frames of a goblin standing its ground through it without a renderer
// anywhere.
//
//   1. Underground placement.  A level is rooms on a 2 m grid. This decides
//      which room holds which group, keyed so a room cleared before you climbed
//      the stair is still clear when you come back down.
//   2. Ranged and casting.     Which rows shoot, throw, cast or breathe; what
//      they throw; how far they can reach with it. What is NOT here any more
//      is a standoff band and a backing step: nothing walks away from the thing
//      it is fighting, and a row that shoots at fourteen metres puts its hands
//      up at one rather than giving ground.
//   3. Bosses.                 BOSS_PHASES read as behaviour, one plan per boss,
//      with the line each phase says.
//   4. Flying.                 How high, and when it comes down.
//
// Plus one thing that belongs nowhere else: `weaknessMultiplier`, which turns
// `actor.weakTo` into a number the damage resolver already accepts. `actor.js`
// says in its own header that a weakness "is carried as `actor.weakTo` and
// `actor.vulnerability`, and W2 applies it as a damage multiplier", because
// `combat_rules.resistOf` clamps a resist at zero and a negative one cannot be
// written. This is that application.
//
// UNITS, said once. Distances are metres. Times handed to the AI are
// MILLISECONDS, the same clock `combat.update` is given; times inside a spec
// (a cast, a warning ring) are SECONDS, because that is how the documents write
// them. Where the two meet the field name says which.

import { MONSTERS, HABITAT, BOSS_PHASES, BOSS_BY_LAIR, spawnRollFor } from '../mmo/monsters.js';
import { mulberry32 } from '../world/noise.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const notesOf = (row) => (row && row.notes) || [];
const has = (row, tag) => notesOf(row).includes(tag);

// ===========================================================================
// 1. Ranged, casting and breath
// ===========================================================================

/**
 * The note tags that mean "this row does not walk up to you".
 *
 * READ OFF `src/mmo/monsters.js` AND NOT INVENTED. `NOTE_TAGS` there is the
 * closed set, and of the tags that describe an attack at range it holds exactly
 * five: `throwsKnives` (the goblin scout), `rangedSpikes` (the manticore),
 * `boulder` (the cyclops), `casts` (the cultist, the lich, the Ashen King) and
 * `breath` (the wyvern, the bone dragon). `frostNova` is the frost giant's and
 * is an area effect around itself, not a thing it stands off and throws.
 *
 * `bow` and `crossbow` are NOT in that closed set. `bow` is nonetheless carried
 * by two rows since Wave A, the Legion Archer and Huntmaster Gallow, and it is
 * mapped here so both shoot instead of silently walking into melee, which is
 * exactly the failure this table exists to prevent. `crossbow` is mapped for
 * the day a row gains it. `auditRangedRows()` proves the mapping covers every
 * ranged tag any row actually carries, in both directions.
 */
export const RANGED_TAGS = {
  throwsKnives: 'thrown',
  rangedSpikes: 'thrown',
  boulder: 'thrown',
  // M3: the Legion Sapper's satchel. It stands off like anything else that
  // throws; the charge itself is a ground mark on its own cooldown, over in
  // `monsters.js`, and this line is only what keeps the sapper from walking
  // into sword reach with a bag of powder on his hip.
  powderCharge: 'thrown',
  bow: 'shot',
  crossbow: 'shot',
  casts: 'cast',
  // M3: the reef eel and the storm wyvern. It is a cast, so the hold and the
  // interrupt come free; what it produces is not a bolt but a mark on the
  // ground, which `spellFor` says with `ground` and `monsters.js` acts on.
  stormCall: 'cast',
  breath: 'breath',
};

/** 'melee' | 'thrown' | 'shot' | 'cast' | 'breath'. Breath beats cast beats shot. */
export function attackModeOf(row) {
  if (!row) return 'melee';
  const order = ['breath', 'cast', 'shot', 'thrown'];
  const found = new Set();
  for (const n of notesOf(row)) if (RANGED_TAGS[n]) found.add(RANGED_TAGS[n]);
  for (const mode of order) if (found.has(mode)) return mode;
  return 'melee';
}

export const isRanged = (row) => attackModeOf(row) !== 'melee';
export const isFlyer = (row) => has(row, 'flying') || (row && row.kind === 'flying');
export const isBoss = (row) => !!(row && row.boss);

/**
 * How far a thing that shoots can reach, in metres.
 *
 * 05-WORLD-CONTENT gives no standoff distance for any row, and `actor.js` gives
 * a thrown natural weapon `range: 12`, which is the only number in the tree.
 * Fourteen is written around it: it is inside the aggro radius of every row
 * that shoots (the smallest is the goblin scout's twelve, and a thing that has
 * already turned does not un-turn at fourteen).
 *
 * THERE IS NO LONGER A BAND, AND NOTHING BACKS AWAY. There used to be: a near
 * edge of 8 m, a backoff step that walked a scout backwards every time you
 * closed, and a `cornered` flag for the day it ran out of room. The result was
 * that a goblin scout could be pushed across a field and never fought, which is
 * the complaint this was written to answer. A monster gives ground for one
 * reason now, `combat_rules.fleeCheck`, and a boss's scripted retreat is the
 * one exception, since that is a phase with a line of its own. See
 * docs/mmo/wiring/C3-CON-KITE.md.
 */
export const RANGED_FAR = 14;

/** Metres a row can reach with what it throws, shoots, casts or breathes. */
export function rangeOf(row) {
  const mode = attackModeOf(row);
  if (mode === 'melee') return 0;
  if (mode === 'breath') return BREATH_RANGE;
  return RANGED_FAR;
}

/**
 * The weapon a ranged row actually throws.
 *
 * It is the row's own natural weapon with two fields changed and nothing else:
 * `ranged` true, and `reach` raised to the range. The reach matters and is not
 * cosmetic: `combat.queueSwing` gates on `reachBetween`, and `landSwing` drops
 * a blow whose distance has grown past `reachBetween * REACH_SLACK` while the
 * arm was coming round. A knife thrown twelve metres with a reach of 1.5 would
 * be queued and then silently binned three hundred milliseconds later, which is
 * the gift-that-did-not-fit failure with a different hat on.
 *
 * The skill id, the damage range and the swing speed are left exactly as they
 * were, so `attackSkill`, `defenceSkill` and `swingSeconds` still return the
 * row's tabled hit, def and speed.
 */
export function rangedWeaponFor(actor, row) {
  const base = (actor && actor.weapon) || null;
  if (!base) return null;
  const range = rangeOf(row) || RANGED_FAR;
  return { ...base, ranged: true, range, reach: range };
}

// --- spells ----------------------------------------------------------------

/** Seconds a cone of breath reaches, and how wide it opens. */
export const BREATH_RANGE = 6;
export const BREATH_HALF_ANGLE = Math.PI / 6;      // 30 degrees each side, a 60 degree cone
/** Seconds of held pose in front of each. No document gives these; INVENTED. */
export const CAST_SECONDS = 1.5;
export const BREATH_SECONDS = 1.0;
/** Seconds a bolt or a fireball is in the air on its way to the target. */
export const SPELL_TRAVEL_S = 0.35;
/**
 * The storm call. M2.md: "mark the ground under the target, wait 1.5 s, then
 * hit everything within 3 m of the mark for the row's damage as energy". The
 * warning and the radius are that sentence; the two seconds a powder charge
 * lies there fizzing are M2's too and live beside it because they are the same
 * machine with a different colour.
 */
export const STORM_WARN_S = 1.5;
export const STORM_RADIUS = 3;
export const POWDER_WARN_S = 2.0;
export const POWDER_RADIUS = 3;
export const POWDER_EVERY_S = 10;
/** A cast is broken by a blow worth more than this fraction of the caster's health. */
export const INTERRUPT_FRACTION = 0.10;

/**
 * The spell a row throws, in the shape `combat.queueSpell` wants.
 *
 * Drawn from the row and nothing else: the damage is the row's own tabled
 * range, so a cultist's fireball is the cultist's 8 to 14 and a lich's bolt is
 * its 30 to 50, and no second damage table exists to drift from the first.
 * The type is the row's:
 *
 *   poisonBreath   poison, a cone      the wyvern
 *   breath         fire, a cone        the bone dragon
 *   casts + undead energy, a bolt      the lich, the Ashen King
 *   casts          fire, a fireball    the cultist
 *
 * @returns { id, name, base, damageType, cone, seconds, travel } or null.
 */
export function spellFor(row) {
  const mode = attackModeOf(row);
  if (mode !== 'cast' && mode !== 'breath') return null;
  const base = [num(row.damage?.[0]) || 1, num(row.damage?.[1]) || 3];
  if (mode === 'breath') {
    const poison = has(row, 'poisonBreath');
    return {
      id: poison ? 'breath_poison' : 'breath_fire',
      name: poison ? 'a breath of poison' : 'a breath of fire',
      base, damageType: poison ? 'poison' : 'fire',
      cone: { range: BREATH_RANGE, halfAngle: BREATH_HALF_ANGLE },
      seconds: BREATH_SECONDS, travel: 0,
    };
  }
  // The storm call is a cast that produces no missile at all: it puts a mark on
  // the ground under whoever it is aimed at and the sky answers it a second and
  // a half later. `ground` is the whole of the difference, and `monsters.js`
  // reads it in `stepCast` instead of queueing a spell at a target.
  if (has(row, 'stormCall')) {
    return {
      id: 'stormcall', name: 'a call for the storm',
      base, damageType: 'energy', cone: null,
      seconds: CAST_SECONDS, travel: 0,
      ground: { radius: STORM_RADIUS, warn: STORM_WARN_S, colour: 0xb98cff },
    };
  }
  const energy = row.kind === 'undead';
  return {
    id: energy ? 'bolt' : 'fireball',
    name: energy ? 'a bolt' : 'a fireball',
    base, damageType: energy ? 'energy' : 'fire',
    cone: null, seconds: CAST_SECONDS, travel: SPELL_TRAVEL_S,
  };
}

/**
 * Everything inside a cone. Pure, and the same shape `targeting.js` uses:
 * `yaw` faces `(sin yaw, cos yaw)`, `halfAngle` is radians from that facing,
 * and the distance is horizontal, because a cone of breath is aimed at a person
 * standing on ground.
 */
export function coneTargets(from, yaw, range, halfAngle, candidates = []) {
  const fx = Math.sin(num(yaw)), fz = Math.cos(num(yaw));
  const cosLimit = Math.cos(clamp(num(halfAngle), 0, Math.PI));
  const out = [];
  for (const c of candidates) {
    if (!c || !c.pos || num(c.health) <= 0) continue;
    const dx = num(c.pos.x) - num(from?.x), dz = num(c.pos.z) - num(from?.z);
    const d = Math.hypot(dx, dz);
    if (d > num(range)) continue;
    if (d < 1e-6) { out.push(c); continue; }
    if ((dx * fx + dz * fz) / d < cosLimit) continue;
    out.push(c);
  }
  return out;
}

/** Would this blow break that cast? Over a tenth of the caster's health, as 04. */
export function castBroken(amount, maxHealth) {
  return num(amount) > num(maxHealth) * INTERRUPT_FRACTION;
}

// ===========================================================================
// 2. Flying
// ===========================================================================

/** Metres above the floor a flyer holds when it is not attacking. */
export const HOVER_MIN = 2.0;
export const HOVER_MAX = 3.0;
/** Metres of bob, and how fast it breathes through it. */
export const HOVER_BOB = (HOVER_MAX - HOVER_MIN) / 2;
export const HOVER_HZ = 0.45;
/** Metres a second it climbs or dives toward the height it wants. */
export const HOVER_CLIMB = 3.5;
/** Seconds it stays down after a swoop, which is the window to hit it back. */
export const SWOOP_SECONDS = 1.2;

/**
 * The height above the ground a flyer wants right now.
 *
 * Hovering it sits in the middle of the band and bobs to both ends of it, so
 * the measured height over any stretch of frames is between HOVER_MIN and
 * HOVER_MAX and never outside them. Swooping it wants the floor, which is what
 * puts it inside a sword's reach: `combat.actorDistance` is three dimensional,
 * so a harpy three metres up genuinely cannot be hit by a man on the ground,
 * and the swoop is the whole of the answer to that.
 */
export function hoverHeight(tSeconds, swooping = false) {
  if (swooping) return 0;
  const mid = (HOVER_MIN + HOVER_MAX) / 2;
  return mid + Math.sin(num(tSeconds) * HOVER_HZ * Math.PI * 2) * HOVER_BOB;
}

/** One frame of climbing toward `want`, at HOVER_CLIMB metres a second. */
export function approachHeight(have, want, dt) {
  const d = clamp(num(dt), 0, 0.1) * HOVER_CLIMB;
  const gap = num(want) - num(have);
  if (Math.abs(gap) <= d) return num(want);
  return num(have) + Math.sign(gap) * d;
}

// ===========================================================================
// 3. Bosses
// ===========================================================================

/** Swing speed a boss gains when it enrages, as a fraction. INVENTED. */
export const ENRAGE_SWING = 0.30;
/** How many minions a summon puts down, and how far out they land. */
export const SUMMON_COUNT = 3;
export const SUMMON_RING_M = 5;
/** The slam: a ring on the ground for a second, then everything still in it. */
export const SLAM_WARN_S = 1.0;
export const SLAM_RADIUS = 6;
/** A retreating boss heals this many health a second while it is running. */
export const RETREAT_HEAL_PS = 40;
export const RETREAT_SECONDS = 8;

/**
 * What each boss does at 66% and at 33%, and what it says.
 *
 * `BOSS_PHASES` in `src/mmo/monsters.js` gives the two thresholds and nothing
 * else; the four behaviours are 08-POLISH-CONTRACT's list, one to each boss so
 * that all four are reachable in play rather than three of them being written
 * and never seen. AUTHORED, and the assignment is argued here rather than
 * buried: the Ashen King and the Mother of Spiders both lead something and so
 * both summon; the Warden is a golem the size of the room and slams; the
 * Drowned Knight goes back to the water, which is the coward's phase in the
 * only place it fits, since every boss row carries `flees: 'never'` and nothing
 * else in the roster would ever run.
 *
 * Lines are in the boss's voice, one each, no em dashes.
 */
export const BOSS_PLANS = {
  ...Object.fromEntries(CELLAR_BOSSES.map(boss => [boss.id, boss.phases])),
  ashenKing: [
    { kind: 'summon', line: 'The Ashen King lifts a hand, and the floor gives up its dead.' },
    { kind: 'enrage', line: 'The Ashen King steps down off the throne, and stops being patient.' },
  ],
  motherOfSpiders: [
    { kind: 'summon', line: 'The Mother of Spiders shrieks once, and the walls come alive.' },
    { kind: 'enrage', line: 'The Mother of Spiders drops the last of her legs to the floor and rushes you.' },
  ],
  wardenOfTheCut: [
    { kind: 'slam', line: 'The Warden of the Cut raises one arm, and the room begins to shake.' },
    { kind: 'enrage', line: 'Something inside the Warden lets go, and it swings like a mill wheel.' },
  ],
  drownedKnight: [
    { kind: 'slam', line: 'The Drowned Knight brings his shield down, and the water comes up through the stone.' },
    { kind: 'retreat', line: 'The Drowned Knight turns for deep water, and the wounds close as he goes.' },
  ],

  // --- Wave A's twelve, authored in M2.md section 2 and pasted here whole.
  //
  // The kinds are chosen against the row: a boss whose row carries `summons`
  // opens with the summon, so `summonFor` has a real id and a real count to put
  // down rather than the habitat fallback; the four that carry none slam or go
  // back to the water instead. Nothing here invents a behaviour: all four kinds
  // are the ones `PHASE_WORDS` already has a plate word for.
  oramBlackhand: [
    { kind: 'summon', line: 'Oram puts two fingers in his mouth and whistles, and the cellar answers.' },
    { kind: 'enrage', line: 'Oram drops the sack of shell and comes at you with both hands.' },
  ],
  keeperOfFaces: [
    { kind: 'summon', line: 'The Keeper turns his head to the wall, and a hundred faces open their eyes.' },
    { kind: 'enrage', line: 'The Keeper takes a face off the wall and puts it on.' },
  ],
  thalassa: [
    { kind: 'slam', line: 'Thalassa brings her tail round, and the water in the cave stands up.' },
    { kind: 'retreat', line: 'Thalassa goes back under the tide, and what is torn closes.' },
  ],
  brassHeart: [
    { kind: 'slam', line: 'The Brass Heart plants both feet, and the floor of the crater rings.' },
    { kind: 'enrage', line: 'Every vent on the Brass Heart opens at once.' },
  ],
  theLibrarian: [
    { kind: 'summon', line: 'The Librarian says a name off the page, and the sand gives up who owned it.' },
    { kind: 'enrage', line: 'The Librarian closes the book on his thumb and picks up the shelf.' },
  ],
  wardenHask: [
    { kind: 'summon', line: 'Hask hauls on the chain, and two of his ogres come up the stair.' },
    { kind: 'enrage', line: 'Hask throws the goad away, which is the first honest thing he has done.' },
  ],
  huntmasterGallow: [
    { kind: 'summon', line: 'Gallow puts the whistle to his lips, and the hounds come up the throat behind you.' },
    { kind: 'enrage', line: 'Gallow puts the bow down. He would rather this part anyway.' },
  ],
  legateOssory: [
    { kind: 'summon', line: 'Ossory raises a hand without looking, and his knights step off the ice.' },
    { kind: 'enrage', line: 'Ossory shuts the visor. He has been doing this for fifty years.' },
  ],
  kingCaradoc: [
    { kind: 'summon', line: 'Caradoc strikes the stair once, and his marines come up out of the avenue.' },
    { kind: 'retreat', line: 'The king walks back down into his own light, and the sea closes what you opened.' },
  ],
  malachar: [
    { kind: 'summon', line: 'Malachar lifts one finger, and the knights of nine hunts stand up.' },
    { kind: 'enrage', line: 'Malachar stops fighting like a knight of the Eyrie, and the room slows around him.' },
  ],
  noon: [
    { kind: 'slam', line: 'Noon comes down off the rock, and the glass road cracks under him.' },
    { kind: 'enrage', line: 'Noon turns his tail on you, which is how a manticore says the hunt is over.' },
  ],
  rimemouth: [
    { kind: 'summon', line: 'Rimemouth throws his head back, and the White Pack comes out of the pines.' },
    { kind: 'enrage', line: 'Rimemouth stops circling. The frost on his coat goes to water.' },
  ],
};

/** The default plan for a boss nobody has authored yet: slam, then enrage. */
export const DEFAULT_BOSS_PLAN = [
  { kind: 'slam', line: 'It brings its weight down, and the ground answers.' },
  { kind: 'enrage', line: 'It stops measuring you, and comes on.' },
];

/** The phases a row runs, thresholds and behaviour together. */
export function bossPlanFor(row) {
  if (!isBoss(row)) return [];
  const thresholds = Array.isArray(row.phases) && row.phases.length ? row.phases : BOSS_PHASES;
  const plan = BOSS_PLANS[row.id] || DEFAULT_BOSS_PLAN;
  return thresholds.map((at, i) => ({
    index: i + 1, at: num(at),
    kind: plan[i] ? plan[i].kind : DEFAULT_BOSS_PLAN[Math.min(i, DEFAULT_BOSS_PLAN.length - 1)].kind,
    line: plan[i] ? plan[i].line : DEFAULT_BOSS_PLAN[Math.min(i, DEFAULT_BOSS_PLAN.length - 1)].line,
  }));
}

/**
 * Which phase a boss is in: 0 while it is above the first threshold, 1 below
 * it, 2 below the second. A boss at exactly 66% is NOT yet in phase one, which
 * is the same reading `fleeCheck` gives its own threshold.
 */
export function phaseIndexFor(row, health, maxHealth) {
  const plan = bossPlanFor(row);
  if (!plan.length) return 0;
  const max = num(maxHealth);
  if (max <= 0) return 0;
  const f = num(health) / max;
  let i = 0;
  for (const p of plan) if (f < p.at) i = p.index;
  return i;
}

/** One word for the plate: what it is doing now. */
export const PHASE_WORDS = {
  0: 'watching you', summon: 'calling for help', enrage: 'enraged',
  slam: 'shaking the ground', retreat: 'running',
  tide: 'calling the returning tide', brood: 'opening the ossuary',
  bells: 'ringing the answering bell', silence: 'spreading silence',
  embers: 'sweeping the furnace', furnace: 'opening the furnace',
  chains: 'crossing the chains', ritual: 'closing the archive',
  tombs: 'breaking tomb chains', gravity: 'bending the chamber',
  crown: 'raising the royal sword', collapse: 'collapsing the royal graves',
};

/** The two lines a boss's name plate carries. */
export function plateText(row, health, maxHealth) {
  const name = (row && row.name) || 'it';
  const i = phaseIndexFor(row, health, maxHealth);
  if (i <= 0) return { name, phase: PHASE_WORDS[0] };
  const plan = bossPlanFor(row);
  const step = plan[i - 1];
  return { name, phase: PHASE_WORDS[step ? step.kind : 0] || PHASE_WORDS[0] };
}

// ===========================================================================
// 4. Weaknesses
// ===========================================================================

/**
 * How much more a blow of this kind hurts this defender.
 *
 * `actor.js` builds `weakTo` and `vulnerability` from the note tags fireWeak,
 * energyWeak, holyWeak and silverWeak, each worth `WEAKNESS` (0.25), and says
 * outright that applying them is this side's job, because `resistOf` clamps a
 * resist at zero and a weakness cannot be written as a negative one.
 *
 * The kinds a blow can carry, and where each comes from:
 *   the damage type of what is swung   weapon.damageType, or an override
 *   'holy'                             a weapon enchanted holy (abilities.js's
 *                                      Consecrate Weapon writes damageType)
 *   'silver'                           the weapon's MATERIAL, from ores.js,
 *                                      which is not a damage type at all
 *
 * Only the largest single vulnerability applies; two of them do not stack into
 * 1.5, because nothing in the documents says they should and a silent doubling
 * is worse than a conservative one.
 *
 * @returns 1 when nothing applies, otherwise 1 + the vulnerability.
 */
export function weaknessMultiplier(attacker, defender, opts = {}) {
  const table = defender && defender.vulnerability;
  if (!table) return 1;
  const w = (attacker && attacker.weapon) || null;
  const kinds = new Set();
  if (opts.damageType) kinds.add(opts.damageType);
  else if (w && w.damageType) kinds.add(w.damageType);
  if (w && w.material) kinds.add(w.material);
  if (w && w.holy) kinds.add('holy');
  let best = 0;
  for (const k of kinds) best = Math.max(best, num(table[k]));
  return 1 + best;
}

// ===========================================================================
// 5. Underground placement
// ===========================================================================

/** Which HABITAT row a level reads from. */
export function dungeonHabitat(kind, level) {
  if (kind === 'cave') return 'cave';
  return `dungeon${clamp(Math.round(num(level)) || 1, 1, 3)}`;
}

/**
 * Floor area in square metres that earns a room a SECOND group.
 *
 * 05-WORLD-CONTENT gives underground density as "about one monster group per
 * 40 m of dungeon corridor" and says nothing about a room. Read here as: every
 * room that is not the one you walked in through holds a group, and a room
 * large enough to be two rooms holds two. `dungeon_gen.js` builds rooms of 3 to
 * 8 cells a side at 2 m a cell, so a room is 36 to 256 square metres and this
 * threshold makes about the largest sixth of them hold two. THIS IS AN
 * INTERPRETATION and it is the one constant to change if it plays thin.
 */
export const ROOM_AREA_PER_EXTRA_GROUP = 160;
export const ROOM_GROUPS_MAX = 3;

/** A stable 32 bit number from a site id, which may be a string or a number. */
export function hashId(id) {
  const s = String(id == null ? '' : id);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * A level in the shape this file works in, or null when it cannot be trusted.
 *
 * Null is a real answer and the runtime treats it as "no dungeon layer": a
 * level whose grid width is unknown cannot be turned into metres, and monsters
 * placed at the wrong coordinates and then dragged onto the nearest floor by
 * `clampWalkable` would look like a working feature while standing in the wrong
 * rooms. G3.md names exactly what `world_runtime.js` has to hand over.
 */
export function normalizeDungeonLayout(raw, extra = {}) {
  if (!raw || !Array.isArray(raw.rooms) || raw.rooms.length === 0) return null;
  const cellSize = num(raw.cellSize) || num(extra.cellSize) || 2;
  const gridW = num(raw.gridW) || num(raw.w);
  const gridH = num(raw.gridH) || num(raw.h);
  if (!(gridW > 0) || !(gridH > 0)) return null;
  const kind = (raw.kind === 'cave' ? 'cave' : 'dungeon');
  const level = Math.max(1, Math.round(num(raw.level)) || 1);
  const top = Math.max(level, Math.round(num(raw.top)) || (kind === 'cave' ? 1 : 3));
  const bottom = raw.bottom != null ? !!raw.bottom : level >= top;
  const siteId = raw.siteId != null ? raw.siteId : (raw.id != null ? raw.id : (extra.siteId != null ? extra.siteId : 'site'));

  const rooms = raw.rooms.map((r, i) => {
    const w = Math.max(1, Math.round(num(r.w)) || 1);
    const h = Math.max(1, Math.round(num(r.h)) || 1);
    const x = Math.round(num(r.x)), z = Math.round(num(r.z));
    return {
      i, x, z, w, h,
      cx: r.cx != null ? Math.round(num(r.cx)) : x + (w >> 1),
      cz: r.cz != null ? Math.round(num(r.cz)) : z + (h >> 1),
      kind: r.kind || null,
      area: w * h * cellSize * cellSize,
    };
  });

  // The room you walk in through. A layout that labels one wins; otherwise the
  // room holding the entrance cell; otherwise room zero, which is the room
  // dungeon_gen.js puts the entrance in by construction.
  let entry = rooms.findIndex((r) => r.kind === 'entry' || r.kind === 'entrance');
  if (entry < 0 && raw.entrance) {
    entry = rooms.findIndex((r) => num(raw.entrance.gx) >= r.x && num(raw.entrance.gx) < r.x + r.w
      && num(raw.entrance.gz) >= r.z && num(raw.entrance.gz) < r.z + r.h);
  }
  if (entry < 0) entry = 0;

  // The deepest room: labelled if the layout labels one, otherwise the room
  // whose centre is furthest from the entry room's centre, which is the same
  // rule dungeon_gen.js uses to decide where to put the stair down.
  let deepest = rooms.findIndex((r) => r.kind === 'boss' || r.kind === 'deep');
  if (deepest < 0) {
    const e = rooms[entry];
    let bd = -1;
    for (const r of rooms) {
      if (r.i === entry) continue;
      const d = Math.hypot(r.cx - e.cx, r.cz - e.cz);
      if (d > bd) { bd = d; deepest = r.i; }
    }
  }
  if (deepest < 0) deepest = entry;

  // The two things a cavern knows and a room and corridor level does not: which
  // room is the boss's hall, and which place in the sheet this is, so the boss
  // that lairs here is the boss that stands in it. Both are optional and both
  // are null on a level built by the old generator, which is what keeps that
  // generator's behaviour exactly what it was. See docs/mmo/wiring/D3.md.
  const arenaRaw = raw.arena != null ? Math.round(num(raw.arena)) : null;
  const arena = arenaRaw != null && rooms[arenaRaw] ? arenaRaw : null;
  const bossLair = typeof raw.bossLair === 'string' ? raw.bossLair
    : (typeof extra.bossLair === 'string' ? extra.bossLair : null);

  return { siteId, kind, level, top, bottom, cellSize, gridW, gridH, rooms, entry, deepest, arena, bossLair, authoredSpawns: raw.authoredSpawns };
}

/** Grid cell to the metres of its centre, exactly as dungeon_gen.worldOf. */
export function cellToWorld(L, gx, gz) {
  return {
    x: (num(gx) - (L.gridW - 1) / 2) * L.cellSize,
    z: (num(gz) - (L.gridH - 1) / 2) * L.cellSize,
  };
}

/** How many groups a room earns from its floor area. */
export function groupsForRoom(room) {
  return clamp(1 + Math.floor(num(room.area) / ROOM_AREA_PER_EXTRA_GROUP), 1, ROOM_GROUPS_MAX);
}

/**
 * The boss rows a habitat can produce, in the order the habitat lists them.
 *
 * `lair` is the place id out of realms.js. A place the roster lairs a boss at
 * produces THAT boss and no other, which is what puts Warden Hask in the
 * Eyrie's Roost rather than whichever of the four the dice liked. Without a
 * lair, or with one nothing lairs at, the habitat decides as it always did.
 */
export function bossRowsFor(habitat, lair = null) {
  const named = lair ? BOSS_BY_LAIR[lair] : null;
  if (named && named.boss) return [named];
  const h = HABITAT[habitat];
  if (!h) return [];
  const ids = [...new Set([...(h.day || []), ...(h.night || [])])];
  return ids.map((id) => MONSTERS[id]).filter((m) => m && m.boss);
}

/** One roll that is never a boss, so a boss only ever stands where it is put. */
function rollMinion(habitat, rng) {
  for (let t = 0; t < 8; t++) {
    const roll = spawnRollFor(habitat, false, rng);
    if (!roll) return null;
    if (!MONSTERS[roll.id]?.boss) return roll;
  }
  const h = HABITAT[habitat];
  const id = [...(h?.day || [])].find((x) => MONSTERS[x] && !MONSTERS[x].boss);
  return id ? { id, monster: MONSTERS[id], count: MONSTERS[id].group[0] } : null;
}

/**
 * Everything one level holds, as plain records in the same shape the overworld
 * sweep produces, so `monsters.js` spawns them through exactly one code path.
 *
 * Deterministic from the site id and the depth and nothing else, so a level
 * thrown away when you climb the stair comes back identical, and a room you
 * cleared is still clear because the keys it wrote into `deadUntil` still match.
 *
 * @returns [{ id, key, groupKey, room, level, site, x, z, y, boss, underground }]
 */
export function dungeonSpawns(layout, opts = {}) {
  const L = layout && layout.rooms ? layout : normalizeDungeonLayout(layout, opts);
  if (!L) return [];
  if (L.authoredSpawns) return L.authoredSpawns.map((s,i) => ({
    ...s, id:s.id, key:`${L.siteId}:${L.level}:authored:${s.slot}`, groupKey:`${L.siteId}:${L.level}:${s.group}`,
    ...cellToWorld(L,s.gx,s.gz), y:0, room:s.room, level:L.level, site:String(L.siteId),
    boss:!!MONSTERS[s.id]?.boss, underground:true, night:false, cx:0,cz:0,i,
  }));
  const habitat = dungeonHabitat(L.kind, L.level);
  if (!HABITAT[habitat]) return [];
  const worldSeed = num(opts.seed);
  const site = `${L.siteId}`;
  const out = [];

  for (const room of L.rooms) {
    if (room.i === L.entry) continue;                       // never in the room you arrive in
    const roomKey = `${site}:${L.level}:r${room.i}`;
    const rng = mulberry32((hashId(roomKey) ^ Math.imul(worldSeed | 0, 0x9e3779b1)) >>> 0);

    // The boss's room on the deepest level holds the boss and nothing else. It
    // is the arena when the level named one and the deepest room when it did
    // not, which is every level the old generator builds.
    if (L.bottom && room.i === (L.arena != null ? L.arena : L.deepest)) {
      const bosses = bossRowsFor(habitat, L.bossLair);
      if (bosses.length) {
        const boss = bosses[Math.min(bosses.length - 1, Math.floor(rng() * bosses.length))];
        const p = cellToWorld(L, room.cx, room.cz);
        out.push({
          id: boss.id, key: `${roomKey}:${boss.id}:0`, groupKey: roomKey,
          room: room.i, level: L.level, site, boss: true, underground: true,
          x: p.x, z: p.z, y: 0, night: false, cx: 0, cz: 0, i: 0,
        });
        continue;
      }
      // no boss lives in this habitat, so the deepest room is an ordinary one
    }

    const groups = groupsForRoom(room);
    for (let g = 0; g < groups; g++) {
      const roll = rollMinion(habitat, rng);
      if (!roll) continue;
      const groupKey = `${roomKey}:g${g}`;
      for (let i = 0; i < roll.count; i++) {
        const gx = room.x + Math.min(room.w - 1, Math.floor(rng() * room.w));
        const gz = room.z + Math.min(room.h - 1, Math.floor(rng() * room.h));
        const p = cellToWorld(L, gx, gz);
        out.push({
          id: roll.id, key: `${groupKey}:${roll.id}:${i}`, groupKey,
          room: room.i, level: L.level, site, boss: false, underground: true,
          x: p.x, z: p.z, y: 0, night: false, cx: 0, cz: 0, i,
        });
      }
    }
  }
  return out;
}

// ===========================================================================
// The guard
// ===========================================================================

/**
 * Every claim this file makes about the roster, checked at load.
 *
 * The one that matters: a row whose notes promise an attack at range must come
 * out of `attackModeOf` as something other than melee, and a caster or a
 * breather must produce a spell. A tag added to `NOTE_TAGS` that this file does
 * not know is the twenty-modifier-keys failure again, and it throws here rather
 * than shipping a wyvern that walks up and bites.
 */
export function auditRangedRows() {
  const bad = [];
  for (const row of Object.values(MONSTERS)) {
    const mode = attackModeOf(row);
    const tagged = notesOf(row).some((n) => RANGED_TAGS[n]);
    if (tagged && mode === 'melee') bad.push(`${row.id}: ranged notes and no ranged mode`);
    if (!tagged && mode !== 'melee') bad.push(`${row.id}: ranged mode with no note for it`);
    if ((mode === 'cast' || mode === 'breath') && !spellFor(row)) bad.push(`${row.id}: ${mode} with no spell`);
    if (mode === 'thrown' || mode === 'shot') {
      const w = rangedWeaponFor({ weapon: { skill: 'wrestling', minDamage: 1, maxDamage: 2, speed: 2 } }, row);
      if (!w || !(w.reach >= RANGED_FAR)) bad.push(`${row.id}: thrown weapon reaches ${w && w.reach}`);
    }
    if (isBoss(row)) {
      const plan = bossPlanFor(row);
      if (plan.length !== BOSS_PHASES.length) bad.push(`${row.id}: ${plan.length} phases, not ${BOSS_PHASES.length}`);
      for (const p of plan) {
        if (!p.line) bad.push(`${row.id}: phase ${p.index} says nothing`);
        if (p.line && p.line.includes('—')) bad.push(`${row.id}: em dash in a phase line`);
        if (!PHASE_WORDS[p.kind]) bad.push(`${row.id}: phase ${p.index} kind "${p.kind}" has no plate word`);
      }
    }
  }
  // Every dungeon and cave habitat has to be able to produce something, or a
  // level is built and stands empty.
  for (const habitat of ['dungeon1', 'dungeon2', 'dungeon3', 'cave']) {
    const h = HABITAT[habitat];
    if (!h || !h.day.length) { bad.push(`habitat ${habitat} is empty`); continue; }
    const minions = h.day.filter((id) => MONSTERS[id] && !MONSTERS[id].boss);
    if (!minions.length) bad.push(`habitat ${habitat} is nothing but bosses`);
  }
  if (!bossRowsFor('dungeon3').length) bad.push('dungeon3 has no boss to put in its last room');
  if (bad.length) throw new Error(`monster_ai: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return true;
}

auditRangedRows();
