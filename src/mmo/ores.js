// Ore, gems, wood and leather: the ten tiers of `docs/mmo/03-ITEMS-LOOT.md`,
// what each one lends to the gear made from it, and the arithmetic of a swing
// of the pick. Pure data and pure functions: no THREE, no DOM, no imports.

// ---------------------------------------------------------------------------
// The ten ore tiers, exactly as the document tables them: what Mining you need
// to work the vein at all, what Mining you need to work it well, the colour it
// reads as, and what it lends to everything forged from it.
//
// "lends" is structured so a smith can read it, not prose: keys are the same
// names the affix tables in 03-ITEMS-LOOT.md use.
//   ar               flat armour rating per piece
//   damagePct        all damage, percent
//   allPct           every number on the item, percent
//   armourPiercePct  percent of the target's AR ignored
//   damageVsPct      { undead, fae, summon } percent against a kind
//   damageTypePct    { fire, cold } percent added as that damage type
//   resist           { fire, cold, poison } flat typed resist
//   extraAffixRolls  how many more affixes the roller draws
//   harvestYield     the Harvest Yield affix, which the document does not number
//   light / heavy    the document's own words for the weight it carries
export const ORES = [
  { id: 'copper', name: 'Copper', tier: 1, workAt: 0, workWell: 20, colour: 'warm brown',
    lends: {}, note: 'nothing, learns you the trade' },
  { id: 'tin', name: 'Tin', tier: 2, workAt: 10, workWell: 30, colour: 'grey white',
    lends: {}, alloy: 'bronze', note: 'with copper makes Bronze' },
  { id: 'iron', name: 'Iron', tier: 3, workAt: 20, workWell: 45, colour: 'dark grey',
    lends: { ar: 2, damagePct: 5 }, note: 'the standard' },
  { id: 'silver', name: 'Silver', tier: 4, workAt: 35, workWell: 55, colour: 'bright',
    lends: { damageVsPct: { undead: 10 }, holy: true } },
  { id: 'coldiron', name: 'Coldiron', tier: 5, workAt: 45, workWell: 65, colour: 'blue black',
    lends: { damageVsPct: { fae: 12, summon: 12 }, resist: { cold: 5 } } },
  { id: 'emberite', name: 'Emberite', tier: 6, workAt: 55, workWell: 75, colour: 'red veined',
    lends: { damageTypePct: { fire: 10 }, resist: { fire: 8 } } },
  { id: 'rimesteel', name: 'Rimesteel', tier: 7, workAt: 65, workWell: 82, colour: 'pale blue',
    lends: { damageTypePct: { cold: 10 }, resist: { cold: 8 }, slows: true } },
  { id: 'verdite', name: 'Verdite', tier: 8, workAt: 72, workWell: 88, colour: 'green gold',
    lends: { resist: { poison: 10 }, harvestYield: true, light: true } },
  { id: 'voidrock', name: 'Voidrock', tier: 9, workAt: 82, workWell: 94, colour: 'matte black, no shine',
    lends: { damagePct: 15, armourPiercePct: 10, heavy: true } },
  { id: 'starfall', name: 'Starfall', tier: 10, workAt: 92, workWell: 100, colour: 'grey with a white flash',
    lends: { allPct: 20, extraAffixRolls: 1 }, note: 'found only where meteorites lie' },
];

export const ORE = Object.fromEntries(ORES.map((o) => [o.id, o]));

// Bronze is not a vein. "with copper makes Bronze: +1 AR", so it is an alloy the
// forge makes from two tier 1 and 2 ores, and it sits at material tier 2.
export const ALLOYS = {
  bronze: { id: 'bronze', name: 'Bronze', tier: 2, from: ['copper', 'tin'], lends: { ar: 1 } },
};

/** Every metal a smith can work with, veins and alloys together, in tier order. */
export const METALS = [...ORES, ...Object.values(ALLOYS)]
  .filter((m) => m.id !== 'tin')          // tin alone forges nothing; it becomes bronze
  .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));

export const METAL = Object.fromEntries(METALS.map((m) => [m.id, m]));

// ---------------------------------------------------------------------------
// Gems. "from rare veins, some monsters ... Set into rings and amulets by
// Tinkering for a fixed affix." Seven of them, one affix each, and the affix
// id is the one 03-ITEMS-LOOT.md names in its affix tables.
export const GEMS = [
  { id: 'amber', name: 'Amber', colour: 'honey', affix: 'healthRegen' },
  { id: 'jade', name: 'Jade', colour: 'green', affix: 'poisonResist' },
  { id: 'garnet', name: 'Garnet', colour: 'deep red', affix: 'damage' },
  { id: 'sapphire', name: 'Sapphire', colour: 'blue', affix: 'mana' },
  { id: 'ruby', name: 'Ruby', colour: 'fire red', affix: 'fireResist' },
  { id: 'diamond', name: 'Diamond', colour: 'white', affix: 'ar' },
  { id: 'starstone', name: 'Starstone', colour: 'grey with a white flash', affix: 'luck' },
];
export const GEM = Object.fromEntries(GEMS.map((g) => [g.id, g]));
export const GEM_SLOTS = ['ring1', 'ring2', 'neck'];   // "Set into rings and amulets"
export const GEM_SKILL = 'tinkering';

// ---------------------------------------------------------------------------
// "Wood mirrors it in four tiers: oak (0), ash (30), heartwood (60),
// ironbark (85), for bows, staves and hafts." `where` comes from the tree list
// in 05-WORLD-CONTENT.md.
export const WOODS = [
  { id: 'oak', name: 'Oak', tier: 1, workAt: 0, where: 'meadow' },
  { id: 'ash', name: 'Ash', tier: 2, workAt: 30, where: 'fen edges' },
  { id: 'heartwood', name: 'Heartwood', tier: 3, workAt: 60, where: 'deep old forest' },
  { id: 'ironbark', name: 'Ironbark', tier: 4, workAt: 85, where: 'mountain shoulders' },
];
export const WOOD = Object.fromEntries(WOODS.map((w) => [w.id, w]));
export const WOOD_SKILL = 'lumberjacking';
export const WOOD_USES = ['bow', 'staff', 'haft'];

// ---------------------------------------------------------------------------
// "Leather: hide (any beast), thick hide (bear, dire wolf), scaled hide
// (wyvern, drake), by Skinning skill." The document gives no Skinning numbers,
// so none are invented here: the ordering is the tier and the source is `from`.
export const LEATHERS = [
  { id: 'hide', name: 'Hide', tier: 1, from: ['any beast'] },
  { id: 'thickHide', name: 'Thick hide', tier: 2, from: ['bear', 'dire wolf'] },
  { id: 'scaledHide', name: 'Scaled hide', tier: 3, from: ['wyvern', 'drake'] },
];
export const LEATHER = Object.fromEntries(LEATHERS.map((l) => [l.id, l]));
export const LEATHER_SKILL = 'skinning';

// ---------------------------------------------------------------------------
// "A vein has 3 to 8 breaks in it and regrows in 10 minutes."
export const VEIN_BREAKS = [3, 8];
export const VEIN_REGROW_S = 600;

// ---------------------------------------------------------------------------
// Rules

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const oreOf = (tier) => (typeof tier === 'string' ? ORE[tier] : ORES.find((o) => o.tier === tier));

/** True when the vein gives anything at all. "A vein above your skill says so and gives nothing." */
export function canWork(mining, tier) {
  const o = oreOf(tier);
  if (!o) return false;
  return mining >= o.workAt;
}

/**
 * Ingots' worth of ore from one break, as a range.
 *
 * The document gives the formula and two worked answers, and they do not agree
 * about whether the formula is a point or a top:
 *   "Yield per break: 1 + floor((Mining - tier.workAt) / 15) ingots' worth of
 *    ore, so a grandmaster gets 4 to 7 per copper vein and 1 to 2 per starfall."
 * The formula at Mining 100 gives exactly 7 for copper and exactly 1 for
 * starfall. Both quoted ranges end where the formula lands, so the formula is
 * read here as the TOP of the range. The floor is half of it rounded up, with a
 * minimum spread of one, which is the only simple rule that reproduces both
 * quoted answers: copper 7 -> [4, 7], starfall 1 -> [1, 2].
 */
export function oreYieldRange(mining, tier) {
  const o = oreOf(tier);
  if (!o || mining < o.workAt) return [0, 0];
  const top = 1 + Math.floor((mining - o.workAt) / 15);
  const lo = Math.max(1, Math.ceil(top / 2));
  return [lo, Math.max(lo + 1, top)];
}

/** One break's yield, rolled uniformly over `oreYieldRange`. */
export function oreYield(mining, tier, rng = Math.random) {
  const [lo, hi] = oreYieldRange(mining, tier);
  if (hi === 0) return 0;
  return lo + Math.floor(clamp(rng(), 0, 0.999999) * (hi - lo + 1));
}

/**
 * "Rare vein chance `Mining * 0.1%`: a vein that pays double and rolls a gem."
 * Returned as a probability, so Mining 100 is 0.1.
 */
export function rareVeinChance(mining) {
  return clamp(mining * 0.001, 0, 1);
}

export const RARE_VEIN_PAYS = 2;   // "pays double"

/** Breaks left in a fresh vein, 3 to 8. */
export function veinBreaks(rng = Math.random) {
  const [lo, hi] = VEIN_BREAKS;
  return lo + Math.floor(clamp(rng(), 0, 0.999999) * (hi - lo + 1));
}

/**
 * Which ores a vein at this place and depth can be.
 *
 * "Veins are placed by biome and depth: copper, tin and iron everywhere, silver
 * and coldiron in mountain caves, emberite in desert caves, rimesteel in snow,
 * verdite in sakura and deep forest, voidrock only in dungeon levels two and
 * three, starfall at named craters."
 *
 * `place` is a biome from `src/world/field.js` (ocean, beach, meadow, boreal,
 * desert, sakura, mountain, snow) or a site kind (dungeon, cave, crater).
 * `depth` is 0 at the surface and 1, 2, 3 underground, which is what makes a
 * mountain cave different from a mountainside.
 */
export function veinsFor(place, depth = 0) {
  const p = place === 'coast' ? 'beach' : place === 'oldforest' ? 'oldForest' : place;
  const underground = depth >= 1 || p === 'cave' || p === 'dungeon';
  const out = ['copper', 'tin', 'iron'];                                  // everywhere
  if (underground && (p === 'mountain' || p === 'cave')) out.push('silver', 'coldiron');
  if (underground && p === 'desert') out.push('emberite');
  if (p === 'snow') out.push('rimesteel');
  // "verdite in sakura and deep forest": boreal is this world's deep forest, and
  // 'oldForest' is accepted for the day a site kind by that name exists.
  if (p === 'sakura' || p === 'oldForest' || p === 'boreal') out.push('verdite');
  if (p === 'dungeon' && depth >= 2) out.push('voidrock');
  if (p === 'crater') out.push('starfall');
  return out;
}

// ---------------------------------------------------------------------------
export const DOC_REFS = {
  // Everything this module names that another document owns. `ores.test.mjs`
  // reads the markdown and proves each phrase is really there.
  ores: Object.fromEntries(ORES.map((o) => [o.id, o.name])),
  alloys: { bronze: 'Bronze' },
  gems: Object.fromEntries(GEMS.map((g) => [g.id, g.name])),
  woods: Object.fromEntries(WOODS.map((w) => [w.id, w.name])),
  leathers: { hide: 'hide', thickHide: 'thick hide', scaledHide: 'scaled hide' },
  // affix ids the gems set, as 03-ITEMS-LOOT.md writes them
  affixes: {
    healthRegen: 'Health Regen', poisonResist: 'Poison Resist', damage: 'Damage +',
    mana: '+Mana', fireResist: 'Fire Resist', ar: '+AR', luck: 'Luck',
  },
  skills: { tinkering: 'Tinkering', lumberjacking: 'Lumberjacking', skinning: 'Skinning', mining: 'Mining' },
};

/** Every structural claim these tables make, checked at load. */
export function auditOres() {
  const bad = [];

  if (ORES.length !== 10) bad.push(`there should be ten ore tiers, there are ${ORES.length}`);
  const seen = new Set();
  let lastTier = 0, lastAt = -1, lastWell = -1;
  for (const o of ORES) {
    if (seen.has(o.id)) bad.push(`ore ${o.id}: duplicate id`);
    seen.add(o.id);
    if (o.tier !== lastTier + 1) bad.push(`ore ${o.id}: tier ${o.tier} does not follow ${lastTier}`);
    lastTier = o.tier;
    if (o.workAt < lastAt) bad.push(`ore ${o.id}: workAt ${o.workAt} falls below the tier under it`);
    if (o.workWell < lastWell) bad.push(`ore ${o.id}: workWell ${o.workWell} falls below the tier under it`);
    if (!(o.workAt < o.workWell)) bad.push(`ore ${o.id}: workAt ${o.workAt} is not under workWell ${o.workWell}`);
    lastAt = o.workAt; lastWell = o.workWell;
    if (!o.colour) bad.push(`ore ${o.id}: no colour`);
    if (!o.lends || typeof o.lends !== 'object') bad.push(`ore ${o.id}: lends is not structured`);
    if (o.workAt < 0 || o.workWell > 100) bad.push(`ore ${o.id}: skill numbers off the 0 to 100 scale`);
  }
  // Copper and tin are the two that lend nothing on their own; every other tier
  // has to lend something or the ladder is decoration.
  for (const o of ORES) {
    const lends = Object.keys(o.lends).length > 0;
    if (['copper', 'tin'].includes(o.id) && lends) bad.push(`ore ${o.id}: the document says it lends nothing`);
    if (!['copper', 'tin'].includes(o.id) && !lends) bad.push(`ore ${o.id}: lends nothing`);
  }
  if (ALLOYS.bronze.tier !== 2) bad.push('bronze should sit at material tier 2');
  for (const src of ALLOYS.bronze.from) if (!ORE[src]) bad.push(`bronze is made from "${src}", which is not an ore`);

  if (GEMS.length !== 7) bad.push(`there should be seven gems, there are ${GEMS.length}`);
  const gs = new Set();
  for (const g of GEMS) {
    if (gs.has(g.id)) bad.push(`gem ${g.id}: duplicate id`);
    gs.add(g.id);
    if (typeof g.affix !== 'string' || !g.affix) bad.push(`gem ${g.id}: no fixed affix`);
  }
  if (new Set(GEMS.map((g) => g.affix)).size !== GEMS.length) bad.push('two gems set the same affix');

  if (WOODS.length !== 4) bad.push(`there should be four woods, there are ${WOODS.length}`);
  let lastW = -1;
  for (const w of WOODS) {
    if (w.workAt <= lastW) bad.push(`wood ${w.id}: workAt ${w.workAt} does not rise`);
    lastW = w.workAt;
  }
  if (LEATHERS.length !== 3) bad.push(`there should be three leathers, there are ${LEATHERS.length}`);

  if (VEIN_BREAKS[0] !== 3 || VEIN_BREAKS[1] !== 8) bad.push(`VEIN_BREAKS should be [3, 8]`);
  if (VEIN_REGROW_S !== 600) bad.push('VEIN_REGROW_S should be 600');

  // Every ore has to be reachable somewhere, or the tier is written and never mined.
  const places = ['ocean', 'beach', 'meadow', 'boreal', 'desert', 'sakura', 'mountain', 'snow', 'cave', 'dungeon', 'crater', 'oldForest'];
  const reachable = new Set();
  for (const p of places) for (let d = 0; d <= 3; d++) for (const id of veinsFor(p, d)) reachable.add(id);
  for (const o of ORES) if (!reachable.has(o.id)) bad.push(`ore ${o.id} is placed nowhere`);

  if (bad.length) throw new Error(`auditOres: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { ores: ORES.length, metals: METALS.length, gems: GEMS.length, woods: WOODS.length, leathers: LEATHERS.length };
}

auditOres();
