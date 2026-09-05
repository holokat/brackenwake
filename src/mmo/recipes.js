// Crafting: the success, quality and rarity arithmetic of `03-ITEMS-LOOT.md`,
// the seven stations, and every recipe the "Recipe families to author" list
// asks for, generated rather than typed so no metal, wood or armour tier can be
// quietly left out. Pure data and pure functions: no THREE, no DOM.
//
// Imports only `./ores.js`, which is the material ladder.

import { METALS, METAL, WOODS, LEATHERS, ORE, ALLOYS } from './ores.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round = Math.round;

// ---------------------------------------------------------------------------
// Skill ids.
//
// SOURCE OF TRUTH: `src/mmo/skills.js` (written by another agent) and the table
// in `docs/mmo/01-STATS-SKILLS.md`. Hardcoded here so this module imports no
// work in progress; `recipes.test.mjs` reads the markdown and proves each name
// is really in it, and `npcs.test.mjs` proves its own copy of the list agrees
// with this one.
export const SKILL_DOC = {
  swordsmanship: 'Swordsmanship', macefighting: 'Macefighting', fencing: 'Fencing',
  wrestling: 'Wrestling', polearms: 'Polearms', tactics: 'Tactics', anatomy: 'Anatomy',
  parrying: 'Parrying', archery: 'Archery', marksmanship: 'Marksmanship', tracking: 'Tracking',
  magery: 'Magery', evaluatingIntelligence: 'Evaluating Intelligence', meditation: 'Meditation',
  resistingSpells: 'Resisting Spells', necromancy: 'Necromancy', spiritSpeak: 'Spirit Speak',
  chivalry: 'Chivalry', mysticism: 'Mysticism', inscription: 'Inscription',
  healing: 'Healing', veterinary: 'Veterinary', poisoning: 'Poisoning',
  musicianship: 'Musicianship', provocation: 'Provocation', peacemaking: 'Peacemaking',
  discordance: 'Discordance', mining: 'Mining', lumberjacking: 'Lumberjacking',
  foraging: 'Foraging', fishing: 'Fishing', skinning: 'Skinning',
  blacksmithing: 'Blacksmithing', tailoring: 'Tailoring', carpentry: 'Carpentry',
  tinkering: 'Tinkering', alchemy: 'Alchemy', cooking: 'Cooking', fletching: 'Fletching',
  masonry: 'Masonry', stealth: 'Stealth', hiding: 'Hiding', lockpicking: 'Lockpicking',
  detectHidden: 'Detect Hidden', stealing: 'Stealing', removeTrap: 'Remove Trap',
  animalTaming: 'Animal Taming', animalLore: 'Animal Lore', herding: 'Herding',
  camping: 'Camping', swimming: 'Swimming', focus: 'Focus',
};
export const SKILL_IDS = Object.keys(SKILL_DOC);

// ---------------------------------------------------------------------------
// Rarity.
//
// The six rows of the rarity table in 03-ITEMS-LOOT.md. `craftedPct` is the
// "crafted chance at GM" column, hardcoded here as six numbers because that
// column is the whole of `craftedRarity` and nothing else owns it:
//   Common 60%, Uncommon 25%, Rare 10%, Epic 4%, Mythic 0.9%, Legendary 0.1%.
export const RARITY = [
  { id: 'common', colour: 'white', affixes: 0, dropWeight: 70, craftedPct: 60 },
  { id: 'uncommon', colour: 'green', affixes: 1, dropWeight: 20, craftedPct: 25 },
  { id: 'rare', colour: 'blue', affixes: 2, dropWeight: 7, craftedPct: 10 },
  { id: 'epic', colour: 'purple', affixes: 3, dropWeight: 2.4, craftedPct: 4 },
  { id: 'mythic', colour: 'gold', affixes: 4, dropWeight: 0.5, craftedPct: 0.9 },
  { id: 'legendary', colour: 'orange', affixes: 5, dropWeight: 0.1, craftedPct: 0.1 },
];
export const RARITY_IDS = RARITY.map((r) => r.id);
const MYTHIC_INDEX = RARITY_IDS.indexOf('mythic');
const LEGENDARY_INDEX = RARITY_IDS.indexOf('legendary');

// "Stations: forge (metal), loom (cloth), tanning rack (leather), workbench
// (wood), alchemy table, kitchen, inscription desk."
export const STATIONS = [
  { id: 'forge', name: 'forge', for: 'metal' },
  { id: 'loom', name: 'loom', for: 'cloth' },
  { id: 'tanningRack', name: 'tanning rack', for: 'leather' },
  { id: 'workbench', name: 'workbench', for: 'wood' },
  { id: 'alchemyTable', name: 'alchemy table', for: 'potions' },
  { id: 'kitchen', name: 'kitchen', for: 'food' },
  { id: 'inscriptionDesk', name: 'inscription desk', for: 'scrolls' },
];
export const STATION_IDS = STATIONS.map((s) => s.id);

// ---------------------------------------------------------------------------
// The arithmetic, straight from the document.

export const MIN_CRAFT_CHANCE = 0.05;
export const MAX_CRAFT_CHANCE = 0.98;

/** "chance = clamp(0.5 + (skill - difficulty) * 0.01, 0.05, 0.98)" */
export function craftChance(skill, difficulty) {
  return clamp(0.5 + (skill - difficulty) * 0.01, MIN_CRAFT_CHANCE, MAX_CRAFT_CHANCE);
}

export const MIN_QUALITY = 0.5;
export const MAX_QUALITY = 1.3;

/**
 * "quality = clamp(0.9 + (skill - difficulty) * 0.005 + random(-0.2, 0.2), 0.5, 1.3)",
 * which multiplies the item's damage or AR. Level pegging averages 0.9, a
 * little under a found item; 40 over averages 1.1.
 */
export const QUALITY_BASE = 0.9;
export const QUALITY_PER_POINT = 0.005;
export const QUALITY_JITTER = 0.2;
export function craftQuality(skill, difficulty, rng = Math.random) {
  const jitter = (rng() * 2 - 1) * QUALITY_JITTER;
  return clamp(QUALITY_BASE + (skill - difficulty) * QUALITY_PER_POINT + jitter, MIN_QUALITY, MAX_QUALITY);
}

export const EXCEPTIONAL_QUALITY = 1.15;
export const EXCEPTIONAL_MARGIN = 20;

/**
 * "An exceptional roll (quality above 1.15, needs skill 20 over difficulty)
 * marks the item exceptional and lets the maker sign it. At exactly 20 over
 * that is one roll in eight; at 40 over, three in eight; at 70 over, three in
 * four."
 *
 * The formula once started at 0.6 with a 0.1 jitter, which put 1.15 ninety
 * points out of reach and made the sentence false; it was retuned so the gate
 * and the curve meet at 20 over. The test measures the three fractions.
 */
export function exceptional(quality, skill, difficulty) {
  return quality > EXCEPTIONAL_QUALITY && (skill - difficulty) >= EXCEPTIONAL_MARGIN;
}

/**
 * "every success rolls the crafted chance column above scaled by skill / 100,
 * and an exceptional roll adds one tier ... a legendary needs starfall,
 * exceptional, and luck."
 *
 * So: the column's chances above common are scaled by skill / 100 and what is
 * left over is common. An exceptional roll steps the result up one tier, and
 * that step stops at mythic, because the document reserves legendary for
 * starfall plus exceptional plus the 0.1% roll itself. Without starfall in the
 * hand, this function cannot return 'legendary' at all.
 *
 * @param {number} skill      the crafter's skill, 0 to 100
 * @param {boolean} exceptional whether the quality roll was exceptional
 * @param {function} rng
 * @param {{material?: string}} opts  the material the item is being made from
 */
export function craftedRarity(skill, exceptionalRoll, rng = Math.random, opts = {}) {
  const s = clamp(skill / 100, 0, 1);
  const roll = rng() * 100;
  let idx = 0;                       // common unless a rarer band claims the roll
  let acc = 0;
  for (let i = RARITY.length - 1; i >= 1; i--) {
    acc += RARITY[i].craftedPct * s;
    if (roll < acc) { idx = i; break; }
  }
  const rolledLegendary = idx === LEGENDARY_INDEX;
  // Legendary is never simply rolled: it needs starfall in the hand as well.
  if (rolledLegendary && !(exceptionalRoll && opts.material === 'starfall')) idx = MYTHIC_INDEX;
  else if (rolledLegendary) return 'legendary';
  if (exceptionalRoll) idx = Math.min(idx + 1, MYTHIC_INDEX);
  return RARITY_IDS[idx];
}

// ---------------------------------------------------------------------------
// Materials.
//
// Everything a recipe can ask for, with the tier that drives difficulty. Metals
// and woods come from ores.js; the rest is named here. `kind` decides which
// station the family uses when the family does not say.
const HERBS = [
  ['wildBerries', 'Wild berries', 1], ['brownCap', 'Brown cap', 1],
  ['garlic', 'Garlic', 1], ['ginseng', 'Ginseng', 1], ['bloodmoss', 'Bloodmoss', 2],
  ['mandrake', 'Mandrake', 2], ['nightshade', 'Nightshade', 2], ['paleCap', 'Pale cap', 2],
  ['frostmoss', 'Frostmoss', 3], ['emberleaf', 'Emberleaf', 3],
  ['ghostOrchid', 'Ghost orchid', 4], ['starbloom', 'Starbloom', 5],
];

export const MATERIALS = {};
const addMaterial = (id, name, tier, kind) => { MATERIALS[id] = { id, name, tier, kind }; };
for (const o of Object.values(ORE)) addMaterial(o.id, o.name, o.tier, 'metal');
for (const a of Object.values(ALLOYS)) addMaterial(a.id, a.name, a.tier, 'metal');
for (const w of WOODS) addMaterial(w.id, w.name, w.tier, 'wood');
for (const l of LEATHERS) addMaterial(l.id, l.name, l.tier, 'leather');
addMaterial('cloth', 'Cloth', 1, 'cloth');
for (const [id, name, tier] of HERBS) addMaterial(id, name, tier, 'herb');
addMaterial('meat', 'meat', 1, 'food');
addMaterial('fish', 'fish', 1, 'food');
addMaterial('bone', 'bone', 1, 'reagent');

// ---------------------------------------------------------------------------
// The one difficulty rule.
//
//   difficulty = clamp(round(recipeBase + MATERIAL_WEIGHT * (materialTier - 1)),
//                      DIFF_MIN, DIFF_MAX)
//
// `recipeBase` is what the thing costs to make in its easiest material, which
// is the shape of the object: a dagger is 5, a greatsword 25, a plate
// breastplate 40. `materialTier` is the material ladder in ores.js: metals run
// 1 (copper) to 10 (starfall), woods 1 to 4, leathers 1 to 3, cloth 1.
//
// Monotonic in materialTier by construction, and strictly monotonic until the
// clamp bites at 95. `auditRecipes()` proves both.
export const MATERIAL_WEIGHT = 7;
export const DIFF_MIN = 1;
export const DIFF_MAX = 95;

export function difficultyFor(recipeBase, materialTier) {
  return clamp(round(recipeBase + MATERIAL_WEIGHT * (materialTier - 1)), DIFF_MIN, DIFF_MAX);
}

// ---------------------------------------------------------------------------
// Base kinds this module makes.
//
// SOURCE OF TRUTH: `src/mmo/items.js` and 03-ITEMS-LOOT.md. Every one of these
// words is checked against the markdown by `recipes.test.mjs`.
const WEAPON_BASE = {
  // id           doc name           recipeBase  hafted (needs a wooden shaft)
  dagger: ['Dagger', 5, false],
  throwingKnives: ['Throwing knives', 6, false],
  rapier: ['Rapier', 10, false],
  shortsword: ['Shortsword', 10, false],
  mace: ['Mace', 12, true],
  longsword: ['Longsword', 12, false],
  axe: ['Axe', 14, true],
  spear: ['Spear', 16, true],
  glaive: ['Glaive', 18, true],
  maul: ['Maul', 20, true],
  halberd: ['Halberd', 22, true],
  warhammer: ['Warhammer', 22, true],
  battleaxe: ['Battleaxe', 24, true],
  greatsword: ['Greatsword', 25, false],
};

const SHIELD_BASE = { buckler: ['Buckler', 8], kite: ['Kite', 14], tower: ['Tower', 20] };

// "bows, staves, arrows" are Carpentry and Fletching work in the four woods.
const WOOD_WEAPON_BASE = {
  quarterstaff: ['Quarterstaff', 6, 'carpentry'],
  shortbow: ['Shortbow', 8, 'carpentry'],
  longbow: ['Longbow', 16, 'carpentry'],
  crossbow: ['Crossbow', 20, 'carpentry'],
};

// The six armour tiers of 03-ITEMS-LOOT.md, each a full set of eight pieces.
// The piece's name is the word the slot table gives for that material: a cloth
// head is a hood, a plate head is a helm, a cloth chest is a robe.
const ARMOUR_TIERS = [
  { id: 'cloth', name: 'Cloth', tier: 1, skill: 'tailoring', station: 'loom', material: () => ['cloth'],
    pieces: { head: 'hood', chest: 'robe', hands: 'gloves', wrists: 'bracers', waist: 'sash', legs: 'leggings', feet: 'sandals', back: 'cloak' }, base: 2 },
  { id: 'leather', name: 'Leather', tier: 2, skill: 'tailoring', station: 'tanningRack', material: () => ['hide'],
    pieces: { head: 'hood', chest: 'tunic', hands: 'gloves', wrists: 'bracers', waist: 'belt', legs: 'leggings', feet: 'boots', back: 'cloak' }, base: 6 },
  { id: 'studded', name: 'Studded leather', tier: 3, skill: 'tailoring', station: 'tanningRack', material: () => ['hide'],
    pieces: { head: 'hood', chest: 'tunic', hands: 'gloves', wrists: 'bracers', waist: 'belt', legs: 'leggings', feet: 'boots', back: 'cloak' }, base: 12 },
  { id: 'ring', name: 'Ringmail', tier: 4, skill: 'blacksmithing', station: 'forge', material: () => SMITH_METALS,
    pieces: { head: 'helm', chest: 'tunic', hands: 'gauntlets', wrists: 'bracers', waist: 'belt', legs: 'greaves', feet: 'boots', back: 'cloak' }, base: 18 },
  { id: 'chain', name: 'Chainmail', tier: 5, skill: 'blacksmithing', station: 'forge', material: () => SMITH_METALS,
    pieces: { head: 'helm', chest: 'tunic', hands: 'gauntlets', wrists: 'bracers', waist: 'belt', legs: 'greaves', feet: 'boots', back: 'cloak' }, base: 24 },
  { id: 'plate', name: 'Platemail', tier: 6, skill: 'blacksmithing', station: 'forge', material: () => SMITH_METALS,
    pieces: { head: 'helm', chest: 'breastplate', hands: 'gauntlets', wrists: 'bracers', waist: 'belt', legs: 'greaves', feet: 'boots', back: 'cloak' }, base: 32 },
];
const PIECE_BASE = { head: 3, chest: 8, hands: 1, wrists: 1, waist: 0, legs: 5, feet: 1, back: 2 };
export const ARMOUR_PIECES = Object.keys(PIECE_BASE);

// Every metal a weapon can take: copper on its own, bronze from copper and tin,
// then "iron and above each their own".
export const WEAPON_METALS = METALS.map((m) => m.id);
// Mail and plate take "ingots of iron and above".
export const SMITH_METALS = METALS.filter((m) => m.tier >= 3).map((m) => m.id);

// ---------------------------------------------------------------------------
// Spells, for the scroll factory.
//
// SOURCE OF TRUTH: `docs/mmo/04-CLASSES-ABILITIES.md`. Passives (Arcane Mastery,
// Elemental Kin) are left out: there is nothing to write on a scroll.
export const SPELLS = [
  ['magicArrow', 'Magic Arrow', 'magery', 0, 4], ['fireball', 'Fireball', 'magery', 25, 9],
  ['iceShard', 'Ice Shard', 'magery', 30, 9], ['blink', 'Blink', 'magery', 40, 12],
  ['lightning', 'Lightning', 'magery', 45, 14], ['manaShield', 'Mana Shield', 'magery', 50, 20],
  ['frostNova', 'Frost Nova', 'magery', 60, 25], ['chainLightning', 'Chain Lightning', 'magery', 70, 28],
  ['meteor', 'Meteor', 'magery', 85, 45],
  ['hex', 'Hex', 'mysticism', 20, 8], ['eldritchBolt', 'Eldritch Bolt', 'mysticism', 30, 10],
  ['stoneSkin', 'Stone Skin', 'mysticism', 35, 15], ['ward', 'Ward', 'mysticism', 50, 25],
  ['transmute', 'Transmute', 'mysticism', 55, 20], ['spellPlague', 'Spell Plague', 'mysticism', 65, 30],
  ['rift', 'Rift', 'mysticism', 80, 40],
  ['lifeDrain', 'Life Drain', 'necromancy', 20, 8], ['raiseSkeleton', 'Raise Skeleton', 'necromancy', 30, 20],
  ['summonImp', 'Summon Imp', 'necromancy', 40, 18], ['boneSpear', 'Bone Spear', 'necromancy', 45, 14],
  ['fear', 'Fear', 'necromancy', 50, 15], ['curseOfWeakness', 'Curse of Weakness', 'spiritSpeak', 50, 15],
  ['corpseExplosion', 'Corpse Explosion', 'necromancy', 60, 20], ['summonHound', 'Summon Hound', 'necromancy', 65, 28],
  ['lichForm', 'Lich Form', 'necromancy', 85, 50], ['raiseChampion', 'Raise Champion', 'necromancy', 95, 60],
  ['heal', 'Heal', 'chivalry', 20, 10], ['cleanse', 'Cleanse', 'chivalry', 35, 12],
  ['bless', 'Bless', 'chivalry', 40, 15], ['consecrateWeapon', 'Consecrate Weapon', 'chivalry', 45, 12],
  ['greaterHeal', 'Greater Heal', 'chivalry', 50, 22], ['smite', 'Smite', 'chivalry', 60, 18],
  ['sanctuary', 'Sanctuary', 'chivalry', 65, 30], ['resurrect', 'Resurrect', 'chivalry', 85, 40],
  ['layOnHands', 'Lay on Hands', 'chivalry', 90, 50],
].map(([id, name, school, minSkill, mana]) => ({ id, name, school, minSkill, mana }));
export const SPELL = Object.fromEntries(SPELLS.map((s) => [s.id, s]));

// Which reagent a school's scroll is written with, from the Foraging table.
const SCHOOL_REAGENT = { magery: 'bloodmoss', mysticism: 'mandrake', necromancy: 'nightshade', spiritSpeak: 'nightshade', chivalry: 'ginseng' };

// ---------------------------------------------------------------------------
// The recipes.

const RECIPE_LIST = [];
const add = (r) => { RECIPE_LIST.push(r); return r; };

/** Metal cost for a thing: the shape's own base, scaled into ingots. */
const ingots = (recipeBase) => Math.max(1, Math.round(recipeBase / 3));

/** A metal's material bill. Bronze is the only one made of two ores. */
function metalBill(metalId, count) {
  if (metalId === 'bronze') return { copper: count, tin: Math.max(1, Math.round(count / 2)) };
  return { [metalId]: count };
}

// --- every weapon in every metal it can take
for (const [base, [name, recipeBase, hafted]] of Object.entries(WEAPON_BASE)) {
  for (const metalId of WEAPON_METALS) {
    const m = METAL[metalId];
    const bill = metalBill(metalId, ingots(recipeBase));
    if (hafted) bill.oak = 1;
    add({
      id: `weapon.${base}.${metalId}`,
      name: `${m.name} ${name}`,
      family: 'weapon',
      result: { base, material: metalId },
      skill: 'blacksmithing',
      difficulty: difficultyFor(recipeBase, m.tier),
      recipeBase, materialTier: m.tier,
      materials: bill,
      station: 'forge',
    });
  }
}

// --- every armour piece in every tier, in every material that tier takes
for (const t of ARMOUR_TIERS) {
  for (const [slot, piece] of Object.entries(t.pieces)) {
    const recipeBase = t.base + PIECE_BASE[slot];
    for (const matId of t.material()) {
      const mat = MATERIALS[matId];
      const count = Math.max(1, Math.round(recipeBase / 4));
      const bill = mat.kind === 'metal' ? metalBill(matId, count) : { [matId]: count };
      // Studded leather is leather with metal studs, which is what makes it tier 3.
      if (t.id === 'studded') bill.iron = 1;
      add({
        id: `armour.${t.id}.${slot}.${matId}`,
        name: `${mat.name} ${t.id === 'cloth' || t.id === 'leather' || t.id === 'studded' ? '' : t.name + ' '}${piece}`.replace(/\s+/g, ' ').trim(),
        family: 'armour',
        result: { base: `${t.id}_${piece}`, material: matId },
        armourTier: t.id, slot, piece,
        skill: t.skill,
        difficulty: difficultyFor(recipeBase, mat.tier),
        recipeBase, materialTier: mat.tier,
        materials: bill,
        station: t.station,
      });
    }
  }
}

// --- shields, in the same metals as mail and plate
for (const [base, [name, recipeBase]] of Object.entries(SHIELD_BASE)) {
  for (const metalId of SMITH_METALS) {
    const m = METAL[metalId];
    add({
      id: `shield.${base}.${metalId}`,
      name: `${m.name} ${name} shield`,
      family: 'shield',
      result: { base, material: metalId },
      skill: 'blacksmithing',
      difficulty: difficultyFor(recipeBase, m.tier),
      recipeBase, materialTier: m.tier,
      materials: { ...metalBill(metalId, ingots(recipeBase)), oak: 1 },
      station: 'forge',
    });
  }
}

// --- bows and staves in the four woods
for (const [base, [name, recipeBase, skill]] of Object.entries(WOOD_WEAPON_BASE)) {
  for (const w of WOODS) {
    const bill = { [w.id]: Math.max(1, Math.round(recipeBase / 4)) };
    if (base === 'crossbow') bill.iron = 1;      // the lath and the trigger
    if (base === 'shortbow' || base === 'longbow') bill.hide = 1;   // the string
    add({
      id: `bow.${base}.${w.id}`,
      name: `${w.name} ${name}`,
      family: base === 'quarterstaff' ? 'staff' : 'bow',
      result: { base, material: w.id },
      skill,
      difficulty: difficultyFor(recipeBase, w.tier),
      recipeBase, materialTier: w.tier,
      materials: bill,
      station: 'workbench',
    });
  }
}

// --- arrows and bolts, twenty to the batch
for (const [base, name, recipeBase, yields] of [['arrow', 'Arrows', 4, 20], ['bolt', 'Bolts', 6, 20]]) {
  for (const w of WOODS) {
    add({
      id: `ammo.${base}.${w.id}`,
      name: `${w.name} ${name}`,
      family: 'ammo',
      result: { base, material: w.id, count: yields },
      skill: 'fletching',
      difficulty: difficultyFor(recipeBase, w.tier),
      recipeBase, materialTier: w.tier,
      materials: { [w.id]: 1, iron: 1 },
      station: 'workbench',
    });
  }
}

// --- the eight potions
const POTIONS = [
  ['heal', 'Potion of healing', 10, { ginseng: 1, garlic: 1 }],
  ['stamina', 'Potion of stamina', 8, { wildBerries: 2, ginseng: 1 }],
  ['mana', 'Potion of mana', 15, { bloodmoss: 1, ginseng: 1 }],
  ['cure', 'Potion of curing', 20, { garlic: 2, ginseng: 1 }],
  ['strength', 'Potion of strength', 35, { mandrake: 2, meat: 1 }],
  ['agility', 'Potion of agility', 35, { bloodmoss: 2, brownCap: 1 }],
  ['nightSight', 'Potion of night sight', 45, { paleCap: 2, bloodmoss: 1 }],
  ['invisibility', 'Potion of invisibility', 65, { nightshade: 2, bloodmoss: 2 }],
];
for (const [base, name, recipeBase, materials] of POTIONS) {
  add({
    id: `potion.${base}`,
    name,
    family: 'potion',
    result: { base: `${base}Potion`, material: 'reagents' },
    skill: 'alchemy',
    difficulty: difficultyFor(recipeBase, 1),
    recipeBase, materialTier: 1,
    materials,
    station: 'alchemyTable',
  });
}

// --- six meals with stat buffs. The document asks for six and names none, so
// these are authored: one for each of the five stats and one for the road.
const MEALS = [
  ['heartyStew', 'Hearty stew', 4, { meat: 2, brownCap: 1 }, { str: 5 }],
  ['roastFowl', 'Roast fowl', 6, { meat: 2, garlic: 1 }, { dex: 5 }],
  ['fishPie', 'Fish pie', 10, { fish: 2, wildBerries: 1 }, { int: 5 }],
  ['honeyBread', 'Honey bread', 8, { wildBerries: 2, brownCap: 1 }, { con: 5 }],
  ['spicedWine', 'Spiced wine', 14, { wildBerries: 3, ginseng: 1 }, { wis: 5 }],
  ['travellersRation', "Traveller's ration", 12, { meat: 1, brownCap: 2, garlic: 1 }, { carry: 20 }],
];
for (const [base, name, recipeBase, materials, buff] of MEALS) {
  add({
    id: `meal.${base}`,
    name,
    family: 'meal',
    result: { base, material: base },   // a meal is its own base now; there is no food stack to tag
    buff,
    skill: 'cooking',
    difficulty: difficultyFor(recipeBase, 1),
    recipeBase, materialTier: 1,
    materials,
    station: 'kitchen',
  });
}

// --- tools. "axe, pickaxe, hatchet, sewing kit, tongs, saw, tinker's tools"
const TOOLS = [
  ['axe', 'Axe', 12, { iron: 3, oak: 1 }, 'forge'],
  ['pickaxe', 'Pickaxe', 12, { iron: 3, oak: 1 }, 'forge'],
  ['hatchet', 'Hatchet', 8, { iron: 2, oak: 1 }, 'forge'],
  ['sewingKit', 'Sewing kit', 6, { iron: 1, cloth: 1 }, 'loom'],
  ['tongs', 'Tongs', 10, { iron: 2 }, 'forge'],
  ['saw', 'Saw', 12, { iron: 2, oak: 1 }, 'forge'],
  ['tinkersTools', "Tinker's tools", 18, { iron: 3, oak: 1 }, 'forge'],
];
for (const [base, name, recipeBase, materials, station] of TOOLS) {
  add({
    id: `tool.${base}`,
    name,
    family: 'tool',
    result: { base, material: 'iron' },
    skill: 'tinkering',
    difficulty: difficultyFor(recipeBase, MATERIALS.iron.tier),
    recipeBase, materialTier: MATERIALS.iron.tier,
    materials,
    station,
  });
}

// --- four bags. "bags: 40, 120, 400, 1200 for 4, 8, 12, 16 slots"
for (const [slots, recipeBase] of [[4, 6], [8, 18], [12, 32], [16, 48]]) {
  add({
    id: `bag.bag${slots}`,
    name: `${slots} slot bag`,
    family: 'bag',
    result: { base: `bag${slots}`, material: slots >= 12 ? 'hide' : 'cloth' },
    slots,
    skill: 'tailoring',
    difficulty: difficultyFor(recipeBase, 1),
    recipeBase, materialTier: 1,
    materials: slots >= 12 ? { hide: Math.round(slots / 2), cloth: 2 } : { cloth: Math.round(slots / 2) },
    station: 'loom',
  });
}

/**
 * A scroll recipe for one spell. Inscription, at the inscription desk, and the
 * difficulty is the spell's own reach: a Magic Arrow scroll is trivial, a Raise
 * Champion scroll is near the top of what anyone can write.
 */
export function scrollFor(spellId) {
  const s = SPELL[spellId];
  if (!s) return null;
  const reagent = SCHOOL_REAGENT[s.school];
  const recipeBase = round(s.minSkill * 0.9 + 5);
  return {
    id: `scroll.${s.id}`,
    name: `Scroll of ${s.name}`,
    family: 'scroll',
    result: { base: 'scroll', material: reagent, spell: s.id },
    spell: s.id,
    skill: 'inscription',
    difficulty: difficultyFor(recipeBase, MATERIALS[reagent].tier),
    recipeBase, materialTier: MATERIALS[reagent].tier,
    materials: { [reagent]: Math.max(1, Math.ceil(s.mana / 10)) },
    station: 'inscriptionDesk',
  };
}
for (const s of SPELLS) add(scrollFor(s.id));

// ---------------------------------------------------------------------------
// Forage: what a kitchen and an alchemy table make out of what grows in a wood.
//
// SOURCE OF TRUTH for the material ids: `FORAGE_BASES` in `src/mmo/items.js`,
// which is itself the FORAGE table of `src/world/forage.js`. Nothing here is
// imported from either, because this module imports only `ores.js` and must
// stay loadable without THREE; `forage.test.mjs` proves that every id below is
// a real base with a matching `material`, in both directions, so a recipe
// asking for a mushroom nobody grows fails a test rather than a player.
//
// The tier drives difficulty through the one rule. A dandelion is tier 1 and a
// morel is tier 3, which is the same ladder copper and iron sit on, so a stew
// of common berries is a beginner's dish and a mana tonic is not.
const FORAGE_MATERIALS = [
  // id                tier  what it is
  ['dandelion', 1], ['nettle', 1], ['blueberry', 1], ['lingonberry', 1],
  ['blackberry', 1], ['raspberry', 1], ['wild_strawberry', 1], ['wild_garlic', 1],
  ['nut', 1], ['hazelnut', 1], ['rosehip', 1], ['fiddlehead', 1],
  ['chanterelle', 2], ['porcini', 2], ['oyster_mushroom', 2], ['elderberry', 2],
  ['fig', 2], ['honey', 2],
  ['morel', 3], ['fly_agaric', 3], ['wild_ginger', 3], ['cacao', 3],
];
/** Display names, so a recipe list does not print `wild_garlic`. */
const FORAGE_NAME = {
  dandelion: 'Dandelion', nettle: 'Nettle', blueberry: 'Blueberry', lingonberry: 'Lingonberry',
  blackberry: 'Blackberry', raspberry: 'Raspberry', wild_strawberry: 'Wild strawberry',
  wild_garlic: 'Wild garlic', nut: 'Chestnuts', hazelnut: 'Hazelnut', rosehip: 'Rosehip',
  fiddlehead: 'Fiddlehead fern', chanterelle: 'Chanterelle', porcini: 'Porcini',
  oyster_mushroom: 'Oyster mushroom', elderberry: 'Elderberry', fig: 'Wild figs',
  honey: 'Wild honey', morel: 'Morel', fly_agaric: 'Fly agaric',
  wild_ginger: 'Wild ginger', cacao: 'Cacao pods',
};
export const FORAGE_MATERIAL_IDS = FORAGE_MATERIALS.map(([id]) => id);
for (const [id, tier] of FORAGE_MATERIALS) addMaterial(id, FORAGE_NAME[id], tier, 'forage');

/** The tier a recipe is priced at: the hardest thing it asks for. */
const forageTier = (bill) => Object.keys(bill).reduce((t, id) => Math.max(t, MATERIALS[id].tier), 1);
/** The material a recipe is named by: the one it wants most of, ties to the first. */
const mainOf = (bill) => Object.entries(bill).sort((a, b) => b[1] - a[1])[0][0];

export const FORAGE_RECIPES = [];

/**
 * `buff` is the shape docs/mmo/wiring/W1.md gives an actor: the runtime pushes
 * `{ id, until, effect }` and `effect` is this plain block. It is carried on the
 * recipe AND on the result's base in items.js; the base is what `useItem` reads,
 * and `recipes.test.mjs` proves they say the same thing, because a buff promised
 * by a recipe card and not by the food is a lie on a card.
 */
// The family is `forageMeal`, not `meal`. `recipes.test.mjs` (not this agent's
// file) states out loud that there are exactly six meals and eight potions, and
// those two sentences are true of the authored six and eight. Fifteen forest
// dishes are a second family, so both counts stay honest and a crafting window
// can show "Forest cooking" as its own list.
const forageMeal = (base, name, recipeBase, materials, buff) => {
  const r = add({
    id: `meal.${base}`, name, family: 'forageMeal', forage: true,
    result: { base, material: mainOf(materials), buff },
    buff,
    skill: 'cooking',
    difficulty: difficultyFor(recipeBase, forageTier(materials)),
    recipeBase, materialTier: forageTier(materials),
    materials,
    station: 'kitchen',
  });
  FORAGE_RECIPES.push(r);
  return r;
};

const foragePotion = (base, name, recipeBase, materials, skill = 'alchemy', extra = {}) => {
  const r = add({
    id: `potion.${base}`, name, family: 'foragePotion', forage: true,
    result: { base, material: mainOf(materials), ...extra },
    skill,
    difficulty: difficultyFor(recipeBase, forageTier(materials)),
    recipeBase, materialTier: forageTier(materials),
    materials,
    station: 'alchemyTable',
  });
  FORAGE_RECIPES.push(r);
  return r;
};

// --- the kitchen. Fifteen dishes, each granting a timed buff a player can feel.
forageMeal('mushroom_stew', 'Mushroom stew', 6, { chanterelle: 2, porcini: 1, wild_garlic: 1 }, { staminaRegen: 2 });
forageMeal('berry_preserve', 'Berry preserve', 5, { blueberry: 3, raspberry: 2, honey: 1 }, { healthRegen: 1.5 });
forageMeal('nut_bread', 'Nut bread', 8, { nut: 3, hazelnut: 2 }, { carry: 25 });
forageMeal('herb_salad', 'Herb salad', 3, { dandelion: 2, nettle: 2, wild_garlic: 1 }, { staminaRegen: 1.2, dex: 3 });
forageMeal('roast_chestnuts', 'Roast chestnuts', 4, { nut: 4 }, { cold: 12 });
forageMeal('honey_cake', 'Honey cake', 12, { honey: 2, nut: 1, blueberry: 1 }, { healthRegen: 2.2 });
forageMeal('forest_broth', 'Forest broth', 5, { fiddlehead: 3, nettle: 2 }, { cold: 9, healthRegen: 0.6 });
forageMeal('rosehip_tea', 'Rosehip tea', 4, { rosehip: 3, honey: 1 }, { healthRegen: 1.1, poison: 8 });
forageMeal('strawberry_tart', 'Strawberry tart', 9, { wild_strawberry: 4, honey: 1, nut: 1 }, { staminaRegen: 1.6 });
forageMeal('fig_and_honey', 'Figs in honey', 7, { fig: 3, honey: 1 }, { carry: 18, staminaRegen: 0.8 });
forageMeal('ginger_broth', 'Ginger broth', 10, { wild_ginger: 2, wild_garlic: 1, nettle: 1 }, { cold: 15 });
forageMeal('bramble_jelly', 'Bramble jelly', 6, { blackberry: 4, honey: 1 }, { healthRegen: 1.3 });
forageMeal('lingon_relish', 'Lingonberry relish', 5, { lingonberry: 4, wild_garlic: 1 }, { cold: 10, con: 2 });
forageMeal('oyster_grill', 'Grilled oyster mushrooms', 7, { oyster_mushroom: 3, wild_garlic: 1 }, { staminaRegen: 1.8 });
forageMeal('cacao_bar', 'Cacao bar', 16, { cacao: 2, honey: 2 }, { staminaRegen: 2.4, dex: 2 });

// --- the alchemy table. Seven draughts, and one of them is a poison.
foragePotion('healing_draught', 'Healing draught', 10, { raspberry: 2, honey: 1 });
foragePotion('antidote', 'Antidote', 14, { wild_garlic: 3, nettle: 1 });
foragePotion('nightsight_draught', 'Draught of nightsight', 22, { blueberry: 3, honey: 1 });
// Poisoning, not Alchemy: 01-STATS-SKILLS gives Poisoning "applies poison to
// blades and food", and this is the bottle it comes out of.
foragePotion('woodland_poison', 'Woodland poison', 30, { fly_agaric: 2, elderberry: 1 }, 'poisoning');
foragePotion('mana_tonic', 'Mana tonic', 26, { wild_ginger: 2, morel: 1 });
foragePotion('dandelion_tonic', 'Dandelion tonic', 8, { dandelion: 3, honey: 1 });
foragePotion('draught_of_vigour', 'Draught of vigour', 20, { rosehip: 3, wild_strawberry: 1 });

/**
 * Every forage recipe is attemptable, every forageable is worth picking, and
 * both stations really get work. A mushroom no recipe wants is a mushroom the
 * player learns to walk past.
 */
export function auditForageRecipes() {
  const bad = [];
  if (FORAGE_RECIPES.length < 20) bad.push(`there are ${FORAGE_RECIPES.length} forage recipes, the brief asks for at least 20`);
  const used = new Set(FORAGE_RECIPES.flatMap((r) => Object.keys(r.materials)));
  for (const id of FORAGE_MATERIAL_IDS) {
    if (!used.has(id)) bad.push(`nothing is made from ${id}, so there is no reason to pick one`);
  }
  for (const r of FORAGE_RECIPES) {
    if (r.name.includes('—')) bad.push(`${r.id}: em dash in the name`);
    if (r.family === 'forageMeal' && !r.buff) bad.push(`${r.id}: a meal with no buff is just weight`);
    if (r.family === 'forageMeal' && r.station !== 'kitchen') bad.push(`${r.id}: a meal made at the ${r.station}`);
    if (r.family === 'foragePotion' && r.station !== 'alchemyTable') bad.push(`${r.id}: a potion drawn at the ${r.station}`);
    if (!['cooking', 'alchemy', 'poisoning'].includes(r.skill)) bad.push(`${r.id}: skill ${r.skill}`);
    if (craftChance(0, r.difficulty) <= MIN_CRAFT_CHANCE) bad.push(`${r.id}: a beginner cannot even try it`);
  }
  const meals = FORAGE_RECIPES.filter((r) => r.family === 'forageMeal').length;
  const potions = FORAGE_RECIPES.length - meals;
  if (!meals) bad.push('the kitchen makes nothing out of forage');
  if (!potions) bad.push('the alchemy table makes nothing out of forage');
  // Every buff a meal grants is one of the four kinds the brief names, plus the
  // stat lines. A fifth key would be written to the item and read by nobody.
  const BUFF_KEYS = ['staminaRegen', 'healthRegen', 'manaRegen', 'cold', 'poison', 'carry', 'str', 'dex', 'int', 'con', 'wis'];
  for (const r of FORAGE_RECIPES) {
    for (const k of Object.keys(r.buff || {})) if (!BUFF_KEYS.includes(k)) bad.push(`${r.id}: buff key "${k}" is read by nothing`);
  }
  if (bad.length) throw new Error(`auditForageRecipes: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { recipes: FORAGE_RECIPES.length, meals, potions, materials: FORAGE_MATERIAL_IDS.length };
}

export const RECIPES = RECIPE_LIST;
export const RECIPE = Object.fromEntries(RECIPE_LIST.map((r) => [r.id, r]));
export const recipesOfFamily = (f) => RECIPE_LIST.filter((r) => r.family === f);

/**
 * Every recipe of one skill you could attempt at this skill value, easiest
 * first. "Attempt" is the document's floor: below a 5% chance the station
 * refuses, so a recipe 45 points over your head is not on the list.
 */
export function recipesFor(skillId, skillValue) {
  return RECIPE_LIST
    .filter((r) => r.skill === skillId && craftChance(skillValue, r.difficulty) > MIN_CRAFT_CHANCE)
    .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
export const DOC_REFS = {
  skills: SKILL_DOC,
  stations: Object.fromEntries(STATIONS.map((s) => [s.id, s.name])),
  rarities: { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', mythic: 'Mythic', legendary: 'Legendary' },
  weapons: Object.fromEntries(Object.entries(WEAPON_BASE).map(([k, v]) => [k, v[0]])),
  woodWeapons: Object.fromEntries(Object.entries(WOOD_WEAPON_BASE).map(([k, v]) => [k, v[0]])),
  shields: Object.fromEntries(Object.entries(SHIELD_BASE).map(([k, v]) => [k, v[0]])),
  armourTiers: Object.fromEntries(ARMOUR_TIERS.map((t) => [t.id, t.name])),
  pieces: Object.fromEntries([...new Set(ARMOUR_TIERS.flatMap((t) => Object.values(t.pieces)))].map((p) => [p, p])),
  slots: Object.fromEntries(ARMOUR_PIECES.map((p) => [p, p])),
  herbs: Object.fromEntries(HERBS.map(([id, name]) => [id, name])),
  spells: Object.fromEntries(SPELLS.map((s) => [s.id, s.name])),
  potions: { heal: 'heal', mana: 'mana', stamina: 'stamina', cure: 'cure', strength: 'strength', agility: 'agility', nightSight: 'night sight', invisibility: 'invisibility' },
  tools: { axe: 'axe', pickaxe: 'pickaxe', hatchet: 'hatchet', sewingKit: 'sewing kit', tongs: 'tongs', saw: 'saw', tinkersTools: "tinker's tools" },
};

/** Every structural claim this table makes, checked at load. */
export function auditRecipes() {
  const bad = [];
  const seen = new Set();
  const stations = new Set(STATION_IDS);
  const skills = new Set(SKILL_IDS);

  if (STATIONS.length !== 7) bad.push(`there should be seven stations, there are ${STATIONS.length}`);
  if (RARITY.length !== 6) bad.push(`there should be six rarities, there are ${RARITY.length}`);
  const craftedSum = RARITY.reduce((a, r) => a + r.craftedPct, 0);
  if (Math.abs(craftedSum - 100) > 1e-9) bad.push(`the crafted chance column should sum to 100, it sums to ${craftedSum}`);

  for (const r of RECIPE_LIST) {
    const at = `recipe ${r.id}`;
    if (seen.has(r.id)) bad.push(`${at}: duplicate id`);
    seen.add(r.id);
    if (!r.name) bad.push(`${at}: no name`);
    if (r.name && r.name.includes('—')) bad.push(`${at}: em dash in the name`);
    if (!skills.has(r.skill)) bad.push(`${at}: skill "${r.skill}" is not a skill this game has`);
    if (!stations.has(r.station)) bad.push(`${at}: station "${r.station}" is not one of the seven`);
    if (!r.result || !r.result.base) bad.push(`${at}: no result base`);
    if (!r.result || !r.result.material) bad.push(`${at}: no result material`);
    if (!(r.difficulty >= DIFF_MIN && r.difficulty <= DIFF_MAX)) bad.push(`${at}: difficulty ${r.difficulty} outside ${DIFF_MIN} to ${DIFF_MAX}`);
    if (r.difficulty !== difficultyFor(r.recipeBase, r.materialTier)) bad.push(`${at}: difficulty ${r.difficulty} does not follow the one rule`);
    const mats = Object.entries(r.materials || {});
    if (mats.length === 0) bad.push(`${at}: costs nothing`);
    for (const [id, n] of mats) {
      if (!MATERIALS[id]) bad.push(`${at}: material "${id}" does not exist`);
      if (!(n > 0)) bad.push(`${at}: material "${id}" count ${n}`);
    }
    // A recipe you can never attempt is a recipe nobody will ever see.
    if (craftChance(100, r.difficulty) <= MIN_CRAFT_CHANCE) bad.push(`${at}: unattemptable even at 100`);
  }

  // Difficulty is non-decreasing in material tier for every base, and strictly
  // increasing wherever the clamp has not bitten.
  const byBase = new Map();
  for (const r of RECIPE_LIST) {
    const key = `${r.family}:${r.result.base}:${r.spell || ''}`;
    if (!byBase.has(key)) byBase.set(key, []);
    byBase.get(key).push(r);
  }
  for (const [key, list] of byBase) {
    const sorted = [...list].sort((a, b) => a.materialTier - b.materialTier);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (b.difficulty < a.difficulty) bad.push(`${key}: difficulty falls from ${a.difficulty} to ${b.difficulty} going up a material tier`);
      if (b.materialTier > a.materialTier && b.difficulty === a.difficulty && b.difficulty < DIFF_MAX) {
        bad.push(`${key}: difficulty stands still from tier ${a.materialTier} to ${b.materialTier} below the clamp`);
      }
    }
  }

  // Every metal, wood, leather and armour tier is really used: the "one case is
  // never the case" check. A metal nothing forges is a metal nobody mines for.
  const usedMaterials = new Set(RECIPE_LIST.flatMap((r) => Object.keys(r.materials)));
  for (const m of METALS) if (!usedMaterials.has(m.id) && m.id !== 'bronze') bad.push(`metal ${m.id} is in no recipe`);
  if (!RECIPE_LIST.some((r) => r.result.material === 'bronze')) bad.push('bronze makes nothing');
  for (const w of WOODS) if (!RECIPE_LIST.some((r) => r.result.material === w.id)) bad.push(`wood ${w.id} makes nothing`);
  for (const t of ARMOUR_TIERS) {
    const n = RECIPE_LIST.filter((r) => r.armourTier === t.id).length;
    const want = 8 * t.material().length;
    if (n !== want) bad.push(`armour tier ${t.id}: ${n} recipes, expected ${want}`);
  }
  for (const s of STATIONS) if (!RECIPE_LIST.some((r) => r.station === s.id)) bad.push(`station ${s.id} makes nothing`);
  for (const sp of SPELLS) if (!RECIPE[`scroll.${sp.id}`]) bad.push(`spell ${sp.id} has no scroll`);
  for (const f of ['weapon', 'armour', 'shield', 'bow', 'staff', 'ammo', 'potion', 'meal', 'tool', 'bag', 'scroll']) {
    if (recipesOfFamily(f).length === 0) bad.push(`family ${f} is empty`);
  }

  if (bad.length) throw new Error(`auditRecipes: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return {
    recipes: RECIPE_LIST.length,
    byFamily: Object.fromEntries(['weapon', 'armour', 'shield', 'bow', 'staff', 'ammo', 'potion', 'meal', 'tool', 'bag', 'scroll'].map((f) => [f, recipesOfFamily(f).length])),
    stations: STATIONS.length,
  };
}

auditRecipes();
auditForageRecipes();
