import { BASES as ITEM_BASES_JS } from './items.js';
// Brackenwake: the eleven openings, customisation, and appearance.
//
// Pure data and rules. No THREE, no DOM, no imports. Node-testable.
// Source of truth: docs/mmo/04-CLASSES-ABILITIES.md (the openings table),
// docs/mmo/01-STATS-SKILLS.md (stats, caps, skill names),
// docs/mmo/03-ITEMS-LOOT.md (item bases the kits draw on).
//
// SKILL IDS ARE HARDCODED HERE ON PURPOSE. `src/mmo/skills.js` is the source
// of truth for skills and is being written concurrently by another hand; this
// module must not import it. The list below is a local mirror keyed to the
// display names in docs/mmo/01-STATS-SKILLS.md, and openings.test.mjs reads
// that document and fails if any id here has no matching row.
//
// WHAT THE DOCUMENT DOES NOT SETTLE (each marked INVENTED below):
//   - Starting coins for the ten kitted openings. The document says "a few
//     coins" and gives a number only for Blank (100).
//   - A floor on a stat during customisation. The cap is 100 (01-STATS-SKILLS);
//     nothing states a minimum, and 0 WIS or 0 CON would break the pool
//     formulas, so MIN_STAT is a design choice made here.
//   - Several kit items are named in 04 but have no base row in 03: bandages,
//     lockpicks, reagent pouches, the holy book, the skull, the bone staff,
//     the lute, the leather apron, the smith's hammer, the dark robe.
//   - The count of face marks. The document says "face marks" and no number.

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * The five stats, in the document's order. Ids are lower case to match
 * `src/mmo/stats.js` and the actor shape in docs/mmo/07-RUNTIME-CONTRACT.md;
 * STAT_LABELS holds the STR/DEX/INT/CON/WIS the tables and the interface use.
 */
export const STAT_IDS = ['str', 'dex', 'int', 'con', 'wis'];

/**
 * The ability group each opening belongs to: which rows a fresh character's
 * bar is seeded from (progression.starterBar) and the colour creation.js bands
 * its card in. The paladin's one chivalry ability in abilities.js is filed
 * under `healer`, so that is the group honestly owed him. The artisan and
 * Blank take `everyone`, because neither is an archetype and a red or a blue
 * would be a promise about abilities they do not have.
 */
export const OPENING_GROUP = {
  warrior: 'warrior', paladin: 'healer', ranger: 'ranger', rogue: 'rogue',
  mage: 'mage', sorcerer: 'sorcerer', necromancer: 'necromancer',
  healer: 'healer', bard: 'bard', artisan: 'everyone', blank: 'everyone',
};

export const STAT_LABELS = {
  str: 'STR', dex: 'DEX', int: 'INT', con: 'CON', wis: 'WIS',
};

export const STAT_NAMES = {
  str: 'Strength',
  dex: 'Dexterity',
  int: 'Intellect',
  con: 'Constitution',
  wis: 'Wisdom',
};

/** 04-CLASSES-ABILITIES.md: "Each starts with 250 stat points". */
export const STARTING_STAT_TOTAL = 250;

/** 01-STATS-SKILLS.md: "Per stat cap 100 at the start". */
export const MAX_STAT_AT_START = 100;

/** INVENTED. No floor is documented; the pool formulas need a nonzero stat. */
export const MIN_STAT = 10;

// ---------------------------------------------------------------------------
// Skills (local mirror; skills.js is the source of truth)
// ---------------------------------------------------------------------------

/**
 * Every skill in docs/mmo/01-STATS-SKILLS.md, id -> the document's display
 * name. Nine groups, 52 skills, the same ids `src/mmo/skills.js` uses.
 * openings.test.mjs compares this list with the document both ways.
 */
export const SKILL_NAMES = {
  // Combat, melee
  swordsmanship: 'Swordsmanship',
  macefighting: 'Macefighting',
  fencing: 'Fencing',
  wrestling: 'Wrestling',
  polearms: 'Polearms',
  tactics: 'Tactics',
  anatomy: 'Anatomy',
  parrying: 'Parrying',
  // Combat, ranged
  archery: 'Archery',
  marksmanship: 'Marksmanship',
  tracking: 'Tracking',
  // Magic
  magery: 'Magery',
  evaluatingIntelligence: 'Evaluating Intelligence',
  meditation: 'Meditation',
  resistingSpells: 'Resisting Spells',
  necromancy: 'Necromancy',
  spiritSpeak: 'Spirit Speak',
  chivalry: 'Chivalry',
  mysticism: 'Mysticism',
  inscription: 'Inscription',
  // Healing and support
  healing: 'Healing',
  veterinary: 'Veterinary',
  poisoning: 'Poisoning',
  musicianship: 'Musicianship',
  provocation: 'Provocation',
  peacemaking: 'Peacemaking',
  discordance: 'Discordance',
  // Gathering
  mining: 'Mining',
  lumberjacking: 'Lumberjacking',
  foraging: 'Foraging',
  fishing: 'Fishing',
  skinning: 'Skinning',
  // Crafting
  blacksmithing: 'Blacksmithing',
  tailoring: 'Tailoring',
  carpentry: 'Carpentry',
  tinkering: 'Tinkering',
  alchemy: 'Alchemy',
  cooking: 'Cooking',
  fletching: 'Fletching',
  masonry: 'Masonry',
  // Roguery
  stealth: 'Stealth',
  hiding: 'Hiding',
  lockpicking: 'Lockpicking',
  detectHidden: 'Detect Hidden',
  stealing: 'Stealing',
  removeTrap: 'Remove Trap',
  // Beasts
  animalTaming: 'Animal Taming',
  animalLore: 'Animal Lore',
  herding: 'Herding',
  // Body
  camping: 'Camping',
  swimming: 'Swimming',
  focus: 'Focus',
};

export const SKILL_IDS = Object.keys(SKILL_NAMES);

/** 04-CLASSES-ABILITIES.md: "200 skill points spread as shown". */
export const STARTING_SKILL_TOTAL = 200;

/** 01-STATS-SKILLS.md: skills run "0.0 to 100.0 each". */
export const MAX_SKILL = 100;

/** 04-CLASSES-ABILITIES.md, Blank: "no skill above 50". */
export const BLANK_MAX_SKILL = 50;

// ---------------------------------------------------------------------------
// Customisation budgets
// ---------------------------------------------------------------------------

/**
 * "you may move up to 30 stat points and 30 skill points around before you set
 * foot in the world". Blank moves all of them; see applyCustomisation.
 */
export const CUSTOM_STAT_POINTS = 30;
export const CUSTOM_SKILL_POINTS = 30;

// ---------------------------------------------------------------------------
// Item bases used by the kits
// ---------------------------------------------------------------------------

/**
 * Every base id a kit refers to. `docName` is the word that appears in
 * docs/mmo/03-ITEMS-LOOT.md, which openings.test.mjs greps for. `invented:
 * true` marks a base the openings table names but the item document does not
 * define; those need rows adding to 03 before they can be spawned.
 */
const ARMOUR_PIECES = ['head', 'chest', 'hands', 'wrists', 'waist', 'legs', 'feet', 'back'];
const ARMOUR_MATERIALS = {
  cloth: 'Cloth',
  leather: 'Leather',
  studdedLeather: 'Studded leather',
  ringmail: 'Ringmail',
  chainmail: 'Chainmail',
  platemail: 'Platemail',
};

function pieceId(material, piece) {
  return material + piece[0].toUpperCase() + piece.slice(1);
}

const ITEM_BASES = {};
function base(id, docName, kind) {
  ITEM_BASES[id] = docName === null
    ? { id, kind, invented: true }
    : { id, kind, docName };
  return id;
}

// Armour: six materials x eight pieces. Every piece inherits its material's
// document row, so the whole grid is doc-sourced.
for (const [material, docName] of Object.entries(ARMOUR_MATERIALS)) {
  for (const piece of ARMOUR_PIECES) base(pieceId(material, piece), docName, 'armour');
}

// Weapons named by the kits.
base('longsword', 'Longsword', 'weapon');
base('dagger', 'Dagger', 'weapon');
base('rapier', 'Rapier', 'weapon');
base('mace', 'Mace', 'weapon');
base('quarterstaff', 'Quarterstaff', 'weapon');
base('shortbow', 'Shortbow', 'weapon');
base('axe', 'Axe', 'weapon');
// The two foci. 03-ITEMS-LOOT.md's slot table already says the main hand takes
// "a staff", which is the word this row is sourced from; it has no wand, so the
// wand is declared invented below with the rest of 04's kit oddments.
base('staff', 'staff', 'weapon');

// Shields.
base('buckler', 'buckler', 'shield');
base('kiteShield', 'kite', 'shield');
base('towerShield', 'tower', 'shield');

// Doc-sourced consumables, tools and oddments.
base('clothRobe', 'robe', 'armour');
base('arrow', 'arrows', 'ammunition');
base('ironIngot', 'ingots', 'material');
base('potionMana', 'potions', 'consumable');
base('pickaxe', 'pickaxe', 'tool');
base('tongs', 'tongs', 'tool');

// INVENTED: named in 04's kit column, absent from 03's tables.
base('bandage', null, 'consumable');
base('lockpick', null, 'tool');
base('reagentPouch', null, 'material');
base('holyBook', null, 'offHand'); // 03 gives offHand a "tome"; no base row.
base('skull', null, 'offHand');
base('boneStaff', null, 'weapon');
base('lute', null, 'instrument');
base('smithHammer', null, 'tool');
base('leatherApron', null, 'armour');
base('darkRobe', null, 'armour');
base('wand', null, 'weapon'); // 03 has no wand row; W7 added the base to items.js

export { ITEM_BASES };

// ---------------------------------------------------------------------------
// Kit ids to items.js base ids. The kits were written in camelCase from the
// document's words before items.js existed; items.js keys armour as
// material_piece and the oddments in snake case. This is the one map between
// them, and auditKitBases() throws at load if a kit names a base items.js does
// not have, so a new kit entry cannot silently spawn nothing.
// ---------------------------------------------------------------------------
const KIT_MATERIAL = { cloth: 'cloth', leather: 'leather', studdedLeather: 'studded', ringmail: 'ring', chainmail: 'chain', plate: 'plate' };
const KIT_SPECIAL = {
  // G9 split the one grey `ingot` stack into a named ingot per metal, so the
  // artisan's kit says which one it is. `iron_ingot` is what "ironIngot" always
  // meant. `auditKitBases` reads items.js BASES directly, not `baseFor`, so the
  // alias would not have saved this file: it threw at import.
  clothRobe: 'cloth_chest', kiteShield: 'kite', towerShield: 'tower', ironIngot: 'iron_ingot', potionMana: 'potion',
  holyBook: 'holy_book', boneStaff: 'bone_staff', darkRobe: 'dark_robe', leatherApron: 'leather_apron',
  smithHammer: 'smith_hammer', reagentPouch: 'reagent_pouch',
};
/** The items.js base id a kit entry's base becomes. */
export function itemBaseFor(kitId) {
  if (KIT_SPECIAL[kitId]) return KIT_SPECIAL[kitId];
  for (const [mat, matId] of Object.entries(KIT_MATERIAL)) {
    for (const piece of ARMOUR_PIECES) if (kitId === pieceId(mat, piece)) return `${matId}_${piece}`;
  }
  return kitId;
}
/** An opening's kit as items.js sees it: [{ base, count, kitId }]. */
export function kitItems(opening) {
  return opening.kit.map((e) => ({ base: itemBaseFor(e.base), count: e.count, kitId: e.base }));
}
export function auditKitBases() {
  for (const op of OPENINGS) {
    for (const e of op.kit) {
      if (!ITEM_BASES_JS[itemBaseFor(e.base)]) throw new Error(`auditKitBases: ${op.id} kit names ${e.base}, and items.js has no ${itemBaseFor(e.base)} base`);
    }
  }
  return true;
}


/** Base ids the item document does not define. Kept honest and countable. */
export const INVENTED_ITEM_BASES = Object.values(ITEM_BASES)
  .filter((b) => b.invented)
  .map((b) => b.id)
  .sort();

function setOf(material, skip = []) {
  return ARMOUR_PIECES
    .filter((p) => !skip.includes(p))
    .map((p) => ({ base: pieceId(material, p), count: 1 }));
}

function robeSet() {
  // A robe is the cloth chest piece, so the "robe set" is cloth with the robe
  // standing in for the tunic.
  return [
    ...setOf('cloth', ['chest']),
    { base: 'clothRobe', count: 1 },
  ];
}

// ---------------------------------------------------------------------------
// Coins
// ---------------------------------------------------------------------------

/**
 * INVENTED. 04 says "a few coins" for the ten kitted openings and gives a
 * number only for Blank. 06-ECONOMY-UI.md prices training at up to 400 gold a
 * skill and resurrection at 50, so "a few" is well under either.
 */
export const STARTING_COINS = 25;

/** 04-CLASSES-ABILITIES.md, Blank's kit: "dagger, cloth, 100 coins". */
export const BLANK_COINS = 100;

// ---------------------------------------------------------------------------
// The openings
// ---------------------------------------------------------------------------

function opening(o) {
  const skills = {};
  for (const id of SKILL_IDS) skills[id] = 0;
  for (const [id, v] of Object.entries(o.skills)) {
    if (!(id in SKILL_NAMES)) throw new Error(`opening ${o.id}: unknown skill ${id}`);
    skills[id] = v;
  }
  return {
    id: o.id,
    name: o.name,
    stats: { str: o.STR, dex: o.DEX, int: o.INT, con: o.CON, wis: o.WIS },
    skills,
    /** Only the skills the table lists, for the character sheet's summary. */
    startingSkills: { ...o.skills },
    kit: o.kit,
    coins: o.coins ?? STARTING_COINS,
    /** Blank alone hands the skill budget over raw. */
    freeSkillPoints: o.freeSkillPoints ?? 0,
    maxSkillAtStart: o.maxSkillAtStart ?? MAX_SKILL,
    blurb: o.blurb,
  };
}

export const OPENINGS = [
  opening({
    id: 'warrior', name: 'Warrior',
    STR: 65, DEX: 50, INT: 25, CON: 65, WIS: 45,
    skills: { swordsmanship: 50, tactics: 50, parrying: 40, anatomy: 30, healing: 30 },
    kit: [
      { base: 'longsword', count: 1 },
      { base: 'kiteShield', count: 1 },
      ...setOf('leather'),
      { base: 'bandage', count: 6 },
    ],
    blurb: 'Takes the hits. A sword, a shield, and enough anatomy to close a wound.',
  }),
  opening({
    id: 'paladin', name: 'Paladin',
    STR: 60, DEX: 40, INT: 35, CON: 60, WIS: 55,
    skills: { swordsmanship: 45, chivalry: 45, tactics: 40, parrying: 35, healing: 35 },
    kit: [
      { base: 'longsword', count: 1 },
      { base: 'buckler', count: 1 },
      { base: 'ringmailChest', count: 1 },
      { base: 'ringmailLegs', count: 1 },
      { base: 'holyBook', count: 1 },
    ],
    blurb: 'Holy magic that works in plate. Slower than a warrior, harder to put down.',
  }),
  opening({
    id: 'ranger', name: 'Ranger',
    STR: 45, DEX: 70, INT: 35, CON: 50, WIS: 50,
    skills: { archery: 50, tracking: 45, tactics: 35, foraging: 35, animalLore: 35 },
    kit: [
      { base: 'shortbow', count: 1 },
      { base: 'arrow', count: 60 },
      { base: 'dagger', count: 1 },
      ...setOf('leather'),
    ],
    blurb: 'Keeps the distance and knows what is in the trees before it moves.',
  }),
  opening({
    id: 'rogue', name: 'Rogue',
    STR: 40, DEX: 75, INT: 40, CON: 45, WIS: 50,
    skills: { fencing: 50, stealth: 45, hiding: 40, lockpicking: 35, poisoning: 30 },
    kit: [
      { base: 'dagger', count: 2 },
      { base: 'clothHead', count: 1 }, // the cloth hood; it takes the head slot
      ...setOf('leather', ['head']),
      { base: 'lockpick', count: 3 },
    ],
    blurb: 'Opens what is shut and is behind you when it matters.',
  }),
  opening({
    id: 'mage', name: 'Mage',
    STR: 30, DEX: 40, INT: 70, CON: 45, WIS: 65,
    skills: { magery: 50, evaluatingIntelligence: 45, meditation: 45, resistingSpells: 30, inscription: 30 },
    kit: [
      // was a quarterstaff, which is a Macefighting stick: under W7's casting
      // rule the mage would have started unable to cast a single one of the
      // nine spells the kit's Magery 50 unlocks.
      { base: 'staff', count: 1 },
      ...robeSet(),
      { base: 'potionMana', count: 4 },
    ],
    blurb: 'Fire, cold and lightning at range, and nothing at all to take a hit with.',
  }),
  opening({
    id: 'sorcerer', name: 'Sorcerer',
    STR: 30, DEX: 45, INT: 75, CON: 40, WIS: 60,
    skills: { mysticism: 50, evaluatingIntelligence: 45, meditation: 40, magery: 35, alchemy: 30 },
    kit: [
      { base: 'staff', count: 1 }, // the kit says "staff", and now there is one
      { base: 'clothRobe', count: 1 },
      { base: 'reagentPouch', count: 6 },
    ],
    blurb: 'Wards, curses and the odd corner of the elements.',
  }),
  opening({
    id: 'necromancer', name: 'Necromancer',
    STR: 35, DEX: 40, INT: 65, CON: 50, WIS: 60,
    skills: { necromancy: 50, spiritSpeak: 45, meditation: 40, evaluatingIntelligence: 35, anatomy: 30 },
    kit: [
      { base: 'boneStaff', count: 1 },
      { base: 'darkRobe', count: 1 },
      { base: 'skull', count: 1 },
    ],
    blurb: 'Spends the corpse. What you kill fights the next thing for you.',
  }),
  opening({
    id: 'healer', name: 'Healer',
    STR: 40, DEX: 45, INT: 50, CON: 55, WIS: 60,
    skills: { healing: 50, anatomy: 45, chivalry: 35, meditation: 35, veterinary: 35 },
    kit: [
      // the wand FIRST, and that ordering is load bearing: creation.js wears the
      // kit in the order it arrives, so the wand takes the main hand and the
      // mace waits in the pack. A healer whose first two abilities (Heal at
      // Chivalry 20, Cleanse at 35) are spells has to start holding a focus.
      { base: 'wand', count: 1 },
      { base: 'mace', count: 1 },
      ...setOf('cloth'),
      { base: 'bandage', count: 20 },
    ],
    blurb: 'Binds wounds faster than they open, and eventually raises the dead.',
  }),
  opening({
    id: 'bard', name: 'Bard',
    STR: 40, DEX: 55, INT: 50, CON: 50, WIS: 55,
    skills: { musicianship: 50, provocation: 40, peacemaking: 40, discordance: 35, fencing: 35 },
    kit: [
      { base: 'lute', count: 1 },
      { base: 'rapier', count: 1 },
      ...setOf('leather'),
    ],
    blurb: 'Sets two monsters on each other and lets them settle it.',
  }),
  opening({
    id: 'artisan', name: 'Artisan',
    STR: 55, DEX: 50, INT: 50, CON: 50, WIS: 45,
    skills: { blacksmithing: 45, mining: 45, tailoring: 40, carpentry: 35, tinkering: 35 },
    kit: [
      { base: 'pickaxe', count: 1 },
      { base: 'axe', count: 1 },
      { base: 'smithHammer', count: 1 },
      { base: 'tongs', count: 1 },
      { base: 'leatherApron', count: 1 },
      { base: 'ironIngot', count: 20 },
    ],
    blurb: 'Makes the sword the warrior wishes he had found.',
  }),
  opening({
    id: 'blank', name: 'Blank',
    STR: 50, DEX: 50, INT: 50, CON: 50, WIS: 50,
    skills: {},
    kit: [
      // Blank decides nothing for you, so it hands over both halves: a dagger
      // to swing and a wand to cast with. The dagger is listed first and takes
      // the hand; the wand is one swap away in the pack.
      { base: 'dagger', count: 1 },
      { base: 'wand', count: 1 },
      ...setOf('cloth'),
    ],
    coins: BLANK_COINS,
    freeSkillPoints: STARTING_SKILL_TOTAL,
    maxSkillAtStart: BLANK_MAX_SKILL,
    blurb: 'The points and the budget, raw. Nothing decided for you.',
  }),
];

export const OPENINGS_BY_ID = Object.fromEntries(OPENINGS.map((o) => [o.id, o]));

/** Ten openings plus Blank. */
export const OPENING_COUNT = 11;

// ---------------------------------------------------------------------------
// Customisation
// ---------------------------------------------------------------------------

function sum(obj) {
  let t = 0;
  for (const k in obj) t += obj[k];
  return t;
}

/**
 * The most points Blank can actually shift out of its five stats, given the
 * floor. Derived, not chosen: 250 - 5 * MIN_STAT.
 */
export const BLANK_STAT_POINTS = STARTING_STAT_TOTAL - STAT_IDS.length * MIN_STAT;

function checkMoves(moves, label) {
  if (!Array.isArray(moves)) return `${label} must be a list of moves`;
  for (const m of moves) {
    if (!m || typeof m !== 'object') return `${label}: each move is { from, to, amount }`;
    if (typeof m.from !== 'string' || !m.from) return `${label}: a move needs a from`;
    if (typeof m.to !== 'string' || !m.to) return `${label}: a move needs a to`;
    if (m.from === m.to) return `${label}: a move from ${m.from} to itself does nothing`;
    if (typeof m.amount !== 'number' || !Number.isFinite(m.amount)) {
      return `${label}: amount must be a number`;
    }
    if (m.amount <= 0) return `${label}: amount must be above zero`;
    if (!Number.isInteger(m.amount)) return `${label}: points move whole, not ${m.amount}`;
  }
  return null;
}

/**
 * Move points around before the character enters the world.
 *
 * A move is `{ from, to, amount }`: it takes `amount` from one and gives it to
 * another, so the total cannot change. Blank alone may use `from: 'pool'` for
 * skills, drawing on its 200 free points.
 *
 * Returns `{ stats, skills, spent, remaining }` or `{ error }`.
 */
export function applyCustomisation(opening, statMoves = [], skillMoves = []) {
  const op = typeof opening === 'string' ? OPENINGS_BY_ID[opening] : opening;
  if (!op) return { error: `unknown opening: ${opening}` };
  const isBlank = op.id === 'blank';

  const shapeError = checkMoves(statMoves, 'stat moves') || checkMoves(skillMoves, 'skill moves');
  if (shapeError) return { error: shapeError };

  const statBudget = isBlank ? BLANK_STAT_POINTS : CUSTOM_STAT_POINTS;
  const skillBudget = isBlank ? op.freeSkillPoints : CUSTOM_SKILL_POINTS;
  const skillCap = op.maxSkillAtStart;

  const statSpent = statMoves.reduce((t, m) => t + m.amount, 0);
  if (statSpent > statBudget) {
    return { error: `stat moves spend ${statSpent} of ${statBudget} points` };
  }
  const skillSpent = skillMoves.reduce((t, m) => t + m.amount, 0);
  if (skillSpent > skillBudget) {
    return { error: `skill moves spend ${skillSpent} of ${skillBudget} points` };
  }

  const stats = { ...op.stats };
  const startingStatTotal = sum(stats);
  for (const m of statMoves) {
    if (!(m.from in stats)) return { error: `no such stat: ${m.from}` };
    if (!(m.to in stats)) return { error: `no such stat: ${m.to}` };
    stats[m.from] -= m.amount;
    stats[m.to] += m.amount;
  }
  for (const id of STAT_IDS) {
    if (stats[id] > MAX_STAT_AT_START) {
      return { error: `${STAT_NAMES[id]} would be ${stats[id]}, above the cap of ${MAX_STAT_AT_START}` };
    }
    if (stats[id] < MIN_STAT) {
      return { error: `${STAT_NAMES[id]} would be ${stats[id]}, below the floor of ${MIN_STAT}` };
    }
  }
  if (sum(stats) !== startingStatTotal) {
    return { error: `the stat total changed from ${startingStatTotal} to ${sum(stats)}` };
  }

  const skills = { ...op.skills };
  const startingSkillTotal = sum(skills);
  let fromPool = 0;
  for (const m of skillMoves) {
    if (m.from === 'pool') {
      if (!isBlank) {
        return { error: 'only Blank may draw from the pool; that move would change the total' };
      }
      fromPool += m.amount;
    } else {
      if (!(m.from in skills)) return { error: `no such skill: ${m.from}` };
      skills[m.from] -= m.amount;
    }
    if (m.to === 'pool') return { error: 'points cannot be put back in the pool' };
    if (!(m.to in skills)) return { error: `no such skill: ${m.to}` };
    skills[m.to] += m.amount;
  }
  for (const id of SKILL_IDS) {
    if (skills[id] > skillCap) {
      return { error: `${SKILL_NAMES[id]} would be ${skills[id]}, above the cap of ${skillCap}` };
    }
    if (skills[id] < 0) {
      return { error: `${SKILL_NAMES[id]} would be ${skills[id]}, below zero` };
    }
  }
  if (sum(skills) !== startingSkillTotal + fromPool) {
    return {
      error: `the skill total changed from ${startingSkillTotal + fromPool} to ${sum(skills)}`,
    };
  }

  return {
    stats,
    skills,
    spent: { stat: statSpent, skill: skillSpent },
    remaining: { stat: statBudget - statSpent, skill: skillBudget - skillSpent },
  };
}

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

/**
 * "body (three builds), skin (eight), hair (twelve styles, ten colours), face
 * marks, height 1.6 to 2.0 m. Cosmetic."
 *
 * The mark list length is INVENTED; the document gives no count. Everything
 * else is exactly the counts written down, and validateAppearance's test
 * asserts them.
 */
export const APPEARANCE = {
  // GENDER IS THE ONLY ONE THE SCREEN OFFERS TODAY (CR3). The rest of this
  // table is still here, still validated and still written into every save,
  // because a character made before CR3 carries all six fields and has to load
  // without an error. What changed is the screen: two pills, and the models
  // that would make a build or a hair style mean anything are not drawn yet.
  genders: ['male', 'female'],
  builds: ['slight', 'average', 'heavy'],
  skins: ['pale', 'fair', 'sand', 'olive', 'tan', 'copper', 'umber', 'ebony'],
  hairStyles: [
    'shaved', 'cropped', 'short', 'tousled', 'swept', 'bob',
    'braid', 'twin braids', 'ponytail', 'topknot', 'long', 'wild',
  ],
  hairColours: [
    'black', 'soot', 'chestnut', 'auburn', 'copper', 'wheat', 'ash', 'silver', 'white', 'moss',
  ],
  marks: ['none', 'freckles', 'scar', 'warpaint', 'tattoo', 'burn', 'brand', 'ash smear'],
  height: { min: 1.6, max: 2.0, step: 0.01, default: 1.75 },
};

export const APPEARANCE_DEFAULT = Object.freeze({
  gender: 'male',
  build: 'average',
  skin: 'fair',
  hairStyle: 'short',
  hairColour: 'chestnut',
  mark: 'none',
  height: APPEARANCE.height.default,
});

const APPEARANCE_FIELDS = [
  ['gender', 'genders'],
  ['build', 'builds'],
  ['skin', 'skins'],
  ['hairStyle', 'hairStyles'],
  ['hairColour', 'hairColours'],
  ['mark', 'marks'],
];

/** Returns `{ ok: true, appearance }` or `{ ok: false, error }`. */
export function validateAppearance(appearance) {
  if (!appearance || typeof appearance !== 'object') {
    return { ok: false, error: 'appearance must be an object' };
  }
  for (const [field, listName] of APPEARANCE_FIELDS) {
    const value = appearance[field];
    if (!APPEARANCE[listName].includes(value)) {
      return { ok: false, error: `${field}: ${JSON.stringify(value)} is not one of the ${APPEARANCE[listName].length} choices` };
    }
  }
  const h = appearance.height;
  if (typeof h !== 'number' || !Number.isFinite(h)) {
    return { ok: false, error: 'height must be a number' };
  }
  const { min, max } = APPEARANCE.height;
  if (h < min || h > max) {
    return { ok: false, error: `height ${h} is outside ${min} to ${max} m` };
  }
  return { ok: true, appearance: { ...APPEARANCE_DEFAULT, ...appearance } };
}

// ---------------------------------------------------------------------------
// Load-time audit
// ---------------------------------------------------------------------------

/**
 * Fails loudly if the table drifts from the document's arithmetic. Runs on
 * import so a bad edit cannot reach a player.
 */
export function auditOpenings(list = OPENINGS) {
  const seen = new Set();
  for (const o of list) {
    if (seen.has(o.id)) throw new Error(`auditOpenings: duplicate opening id ${o.id}`);
    seen.add(o.id);

    const statTotal = sum(o.stats);
    if (statTotal !== STARTING_STAT_TOTAL) {
      throw new Error(`auditOpenings: ${o.name} stats sum to ${statTotal}, not ${STARTING_STAT_TOTAL}`);
    }
    for (const id of STAT_IDS) {
      if (!(id in o.stats)) throw new Error(`auditOpenings: ${o.name} has no ${STAT_LABELS[id]}`);
      if (o.stats[id] > MAX_STAT_AT_START) {
        throw new Error(`auditOpenings: ${o.name} ${STAT_LABELS[id]} is ${o.stats[id]}, above ${MAX_STAT_AT_START}`);
      }
      if (o.stats[id] < MIN_STAT) {
        throw new Error(`auditOpenings: ${o.name} ${STAT_LABELS[id]} is ${o.stats[id]}, below ${MIN_STAT}`);
      }
    }

    const placed = sum(o.skills);
    if (placed + o.freeSkillPoints !== STARTING_SKILL_TOTAL) {
      throw new Error(
        `auditOpenings: ${o.name} places ${placed} and holds ${o.freeSkillPoints} free, not ${STARTING_SKILL_TOTAL}`,
      );
    }
    for (const id of Object.keys(o.skills)) {
      if (!(id in SKILL_NAMES)) throw new Error(`auditOpenings: ${o.name} names unknown skill ${id}`);
      if (o.skills[id] > o.maxSkillAtStart) {
        throw new Error(`auditOpenings: ${o.name} ${id} is ${o.skills[id]}, above ${o.maxSkillAtStart}`);
      }
    }

    if (!o.kit.length) throw new Error(`auditOpenings: ${o.name} has an empty kit`);
    for (const entry of o.kit) {
      if (!(entry.base in ITEM_BASES)) {
        throw new Error(`auditOpenings: ${o.name} kit names unknown base ${entry.base}`);
      }
      if (!Number.isInteger(entry.count) || entry.count < 1) {
        throw new Error(`auditOpenings: ${o.name} kit entry ${entry.base} has count ${entry.count}`);
      }
    }
    const slots = o.kit.map((e) => e.base);
    if (new Set(slots).size !== slots.length) {
      throw new Error(`auditOpenings: ${o.name} kit lists the same base twice`);
    }

    if (!Number.isInteger(o.coins) || o.coins < 0) {
      throw new Error(`auditOpenings: ${o.name} has ${o.coins} coins`);
    }
  }

  if (list.length !== OPENING_COUNT) {
    throw new Error(`auditOpenings: ${list.length} openings, the document has ${OPENING_COUNT}`);
  }

  // Appearance counts, exactly as the document writes them.
  const counts = [
    ['genders', 2], ['builds', 3], ['skins', 8], ['hairStyles', 12], ['hairColours', 10],
  ];
  for (const [name, n] of counts) {
    if (APPEARANCE[name].length !== n) {
      throw new Error(`auditOpenings: APPEARANCE.${name} has ${APPEARANCE[name].length}, the document says ${n}`);
    }
    if (new Set(APPEARANCE[name]).size !== n) {
      throw new Error(`auditOpenings: APPEARANCE.${name} repeats a value`);
    }
  }
  if (APPEARANCE.height.min !== 1.6 || APPEARANCE.height.max !== 2.0) {
    throw new Error('auditOpenings: height is not 1.6 to 2.0');
  }
  return true;
}

auditOpenings();

auditKitBases();
