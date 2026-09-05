// The item tables, driven both ways. Run: node src/mmo/items.test.mjs
//
// Every check here is against docs/mmo/03-ITEMS-LOOT.md. Where the document
// states a number out loud (full plate is 108 AR and 72 stones) the test counts
// it rather than trusting the table, and every guard is proved to fail as well
// as to pass.
import {
  SLOTS, ARMOR_TIERS, ARMOR_PIECES, SHIELDS, WEAPONS, WEAPON_IDS, RARITY, RARITY_ORDER,
  COMBAT_SKILLS, CASTING_SKILLS, WEAPON_TRAINS, isFocus, FOCUS_BASES,
  skillNameOf, BASES, baseFor, makeItem, weightOf, canEquip, armourOf, equipSlotFor,
  slotsFor, stackable, twoHanded, setOf, auditItems, totalWeight,
  takesRarity, RARITY_KINDS, NO_RARITY_KINDS, FOOD_BASES, MEAT_BASES, MEAL_BASES, auditFoodBases,
  LOG_BASES, ORE_BASES, INGOT_BASES, LOG_OF, ORE_OF, INGOT_OF, BASE_ALIASES,
  baseForQuiet, aliasesUsed, auditMaterialBases, LOG_WEIGHT,
} from './items.js';
import { RECIPES } from './recipes.js';
import { ORES, METALS, WOODS } from './ores.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };


// ----------------------------------------------------- G9: typed materials
//
// The user: "Wood and logs and ingots should be different types ... Ore would
// be iron, copper, whatever we authored already. Ingot should say what kind of
// ingot it is. Log should say Oak Log or Sakura Log or Palm Log."
//
// This block runs FIRST in the file on purpose: the alias warning fires once
// per id for the life of the process, and the older checks below still say
// `ingot` and `log`, which would spend it before it could be measured.
{
  check('there is no base called log, ore or ingot',
    !BASES.log && !BASES.ore && !BASES.ingot);
  check('and nothing in the game is NAMED Log, Ore or Ingot',
    !Object.values(BASES).some((b) => /^(log|ore|ingot|wood)$/i.test(b.name)));

  // the three the user named, by name
  check('a log says which tree it came off',
    BASES.oak_log.name === 'Oak Log' && BASES.sakura_log.name === 'Sakura Log' && BASES.palm_log.name === 'Palm Log',
    [BASES.oak_log.name, BASES.sakura_log.name, BASES.palm_log.name].join(', '));
  check('deadwood and cactus wood are called what they are, not "Dead Log"',
    BASES.deadwood.name === 'Deadwood' && BASES.cactus_wood.name === 'Cactus Wood');
  check('an ingot says which metal', BASES.iron_ingot.name === 'Iron Ingot' && BASES.starfall_ingot.name === 'Starfall Ingot');
  check('an ore says which vein', BASES.copper_ore.name === 'Copper Ore' && BASES.voidrock_ore.name === 'Voidrock Ore');

  const report = auditMaterialBases();
  check(`${report.logs} woods, ${report.ores} veins and ${report.ingots} metals`,
    report.logs === LOG_BASES.length && report.ores === 10 && report.ingots === METALS.length,
    JSON.stringify(report));
  check('every ore tier ores.js authored has a stack, and no more than that',
    ORE_BASES.length === ORES.length && ORES.every((o) => BASES[ORE_OF[o.id]]),
    ORE_BASES.join(', '));
  check('every metal a smith can work has an ingot, tin excepted, which forges nothing',
    METALS.every((m) => !!BASES[INGOT_OF[m.id]]) && !INGOT_OF.tin && !!ORE_OF.tin,
    INGOT_BASES.join(', '));
  check('every ores.js wood has a log', WOODS.every((w) => !!BASES[LOG_OF[w.id]]));
  check('a log weighs two stones, an ore and an ingot one',
    BASES.oak_log.weight === LOG_WEIGHT && LOG_WEIGHT === 2
    && BASES.copper_ore.weight === 1 && BASES.iron_ingot.weight === 1);

  // the join a recipe uses, and the one thing that makes it work
  check('a log carries the word a recipe asks for',
    BASES.oak_log.material === 'oak' && BASES.sakura_log.material === 'sakura' && BASES.deadwood.material === 'dead');
  check('an ingot and its ore carry the same word, so a smith may pay in either',
    BASES.iron_ingot.material === 'iron' && BASES.iron_ore.material === 'iron');
  check('and no two stacks in one family answer to one word',
    new Set(LOG_BASES.map((id) => BASES[id].material)).size === LOG_BASES.length
    && new Set(ORE_BASES.map((id) => BASES[id].material)).size === ORE_BASES.length
    && new Set(INGOT_BASES.map((id) => BASES[id].material)).size === INGOT_BASES.length);

  // eleven of the fourteen woods really stand in the world; three do not, and
  // say so rather than looking like something you could go and chop
  const grown = LOG_BASES.filter((id) => BASES[id].grown);
  check('eleven woods are grown by the forest and three are not',
    grown.length === 11 && LOG_BASES.length - grown.length === 3,
    LOG_BASES.filter((id) => !BASES[id].grown).join(', '));
}

// --------------------------------------------- G9: every recipe can be paid
//
// The reason the split happened at all. `recipes.js` has asked for `oak`,
// `iron` and `starfall` by name since it was written, and the one grey `ingot`
// base carried no `material` tag, so every metal recipe in the game was
// unpayable and nothing had ever counted it.
{
  const spendable = new Map();       // material word -> the stacks that answer to it
  for (const b of Object.values(BASES)) {
    if (!b.material || !b.stack) continue;
    if (b.kind !== 'material' && b.kind !== 'food' && b.kind !== 'meal') continue;
    if (!spendable.has(b.material)) spendable.set(b.material, []);
    spendable.get(b.material).push(b.id);
  }
  const asked = new Set();
  for (const r of RECIPES) for (const k of Object.keys(r.materials || {})) asked.add(k);

  const metals = new Set([...ORES.map((o) => o.id), ...METALS.map((m) => m.id)]);
  const woods = new Set(WOODS.map((w) => w.id));
  const wantedMetals = [...asked].filter((m) => metals.has(m));
  const wantedWoods = [...asked].filter((m) => woods.has(m));
  const unpaidMetals = wantedMetals.filter((m) => !spendable.has(m));
  const unpaidWoods = wantedWoods.filter((m) => !spendable.has(m));

  check(`${RECIPES.length} recipes ask for ${asked.size} different materials`, asked.size > 0);
  check(`every metal ${wantedMetals.length} recipes name is a stack the pack can hold`,
    unpaidMetals.length === 0, unpaidMetals.join(', ') || wantedMetals.sort().join(', '));
  check(`every wood they name is too`, unpaidWoods.length === 0,
    unpaidWoods.join(', ') || wantedWoods.sort().join(', '));

  // driven the other way: a word nothing carries really does come back empty,
  // so the check above is measuring something
  check('a material nothing carries resolves to nothing', !spendable.has('mithril'));

  // and the honest record of what is still unpayable, which is not wood or metal
  const stillMissing = [...asked].filter((m) => !spendable.has(m)).sort();
  check('what is left unpayable is alchemy herbs and cloth, and nothing else',
    stillMissing.every((m) => !metals.has(m) && !woods.has(m)), stillMissing.join(', '));
}

// ------------------------------------------------------------- G9: the aliases
//
// `log`, `ore` and `ingot` are dead ids that a v1 save, an old sack on the
// ground and a dev bench all still say. They resolve, they warn once, and the
// warning names the caller.
{
  const warned = [];
  const real = console.warn;
  console.warn = (...a) => warned.push(a.join(' '));

  check('the three aliases are the three ids that were removed',
    JSON.stringify(BASE_ALIASES) === JSON.stringify({ log: 'oak_log', ore: 'copper_ore', ingot: 'iron_ingot' }),
    JSON.stringify(BASE_ALIASES));
  check('nothing has spent a warning before this point', aliasesUsed().length === 0, aliasesUsed().join(', '));

  const b = baseFor('log');
  check('baseFor("log") resolves to an oak log', b?.id === 'oak_log');
  check('and it warned exactly once', warned.length === 1, warned[0] || '');
  check('and the warning names the caller, not this module',
    /items\.test\.mjs:\d+:\d+/.test(warned[0] || ''), warned[0] || '');
  check('and it says what the id became', /oak_log/.test(warned[0] || ''));

  baseFor('log'); baseFor('log'); baseFor('log');
  check('the second, third and fourth time it says nothing', warned.length === 1, `${warned.length} warning(s)`);

  check('ore and ingot resolve too', baseFor('ore')?.id === 'copper_ore' && baseFor('ingot')?.id === 'iron_ingot');
  check('and each of them warned once, so three ids are three warnings', warned.length === 3);
  check('the audit lists all three', Object.keys(auditItems.materials.aliases).length === 3,
    JSON.stringify(auditItems.materials.aliases));
  check('and aliasesUsed says which have been asked for', aliasesUsed().sort().join(',') === 'ingot,log,ore',
    aliasesUsed().join(','));

  // both directions: the quiet resolver does the same lookup and never warns
  const before = warned.length;
  check('baseForQuiet reaches the same base', baseForQuiet('ingot')?.id === 'iron_ingot');
  check('and adds no warning at all', warned.length === before);
  check('a real base is not an alias and warns for nobody',
    baseFor('oak_log')?.id === 'oak_log' && warned.length === before);
  check('and a base that has never existed still resolves to nothing',
    baseFor('mithril_ingot') === null && baseForQuiet('mithril_ingot') === null && warned.length === before);

  // the whole point: an old save and an old caller keep working
  const old = makeItem({ base: 'log', count: 7 });
  check('an old save holding a stack of "log" becomes seven oak logs',
    old.base === 'oak_log' && old.count === 7 && weightOf(old) === 14, `${weightOf(old)} stones`);
  check('and it stacks, because it is a real stack now', stackable(old) === true);

  console.warn = real;
}

// -------------------------------------------------------------------- slots
{
  check('there are fourteen slots', SLOTS.length === 14, SLOTS.join(' '));
  check('no slot is named twice', new Set(SLOTS).size === 14);
  for (const s of ['head', 'neck', 'chest', 'back', 'hands', 'wrists', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'mainHand', 'offHand', 'ranged']) {
    if (!SLOTS.includes(s)) check(`slot ${s} exists`, false);
  }
  check('every documented slot is present', SLOTS.length === 14);
}

// ------------------------------------------------------------- armour tiers
{
  check('six armour tiers', ARMOR_TIERS.length === 6, ARMOR_TIERS.map((t) => t.material).join(', '));
  const doc = [
    [1, 'Cloth', 1, 1, 0, 1], [2, 'Leather', 3, 2, 15, 1], [3, 'Studded leather', 5, 3, 25, 0.75],
    [4, 'Ringmail', 7, 5, 40, 0.4], [5, 'Chainmail', 9, 6, 55, 0.2], [6, 'Platemail', 12, 9, 75, 0],
  ];
  let same = 0;
  ARMOR_TIERS.forEach((t, i) => {
    const [tier, material, ar, weight, strReq, med] = doc[i];
    if (t.tier === tier && t.material === material && t.ar === ar && t.weight === weight && t.strReq === strReq && t.meditation === med) same++;
  });
  check('every tier matches the document row for row', same === 6, `${same} of 6`);
  check('every tier carries a typed resist', ARMOR_TIERS.every((t) => Object.keys(t.resist).length > 0));

  check('eight pieces in a set', ARMOR_PIECES.length === 8, ARMOR_PIECES.map((p) => p.id).join(' '));
  const dbl = ARMOR_PIECES.filter((p) => p.arMul === 2);
  check('only the chest doubles its AR', dbl.length === 1 && dbl[0].id === 'chest');

  // The two totals the document prints.
  const plate = setOf('plate');
  check('full plate is AR 108', plate.reduce((s, b) => s + b.ar, 0) === 108, String(plate.reduce((s, b) => s + b.ar, 0)));
  check('full plate is 72 stones', totalWeight(plate) === 72, String(totalWeight(plate)));
  const cloth = setOf('cloth');
  check('full cloth is AR 9', cloth.reduce((s, b) => s + b.ar, 0) === 9);
  check('full cloth is 8 stones', totalWeight(cloth) === 8, String(totalWeight(cloth)));
  check('the plate chest alone is AR 24', baseFor('plate_chest').ar === 24);
  check('plate blocks Meditation entirely', baseFor('plate_chest').meditation === 0);
  check('cloth casts freely', baseFor('cloth_chest').meditation === 1);

  // C1: the casting burden, the same eight rows read from the other end.
  const burdens = [0, 0.1, 0.3, 0.55, 0.75, 1];
  check('every tier carries the documented cast burden',
    ARMOR_TIERS.every((t, i) => t.castBurden === burdens[i]),
    ARMOR_TIERS.map((t) => `${t.id} ${t.castBurden}`).join(', '));
  check('cloth does not burden a cast at all', baseFor('cloth_chest').castBurden === 0);
  check('leather burdens it a tenth', baseFor('leather_legs').castBurden === 0.1);
  check('platemail burdens it entirely', baseFor('plate_chest').castBurden === 1);
  check('the burden rises with every tier and Meditation falls with it',
    ARMOR_TIERS.every((t, i) => i === 0 || (t.castBurden > ARMOR_TIERS[i - 1].castBurden && t.meditation <= ARMOR_TIERS[i - 1].meditation)));
  check('all 48 pieces carry the burden of their tier, not just the chest',
    ARMOR_TIERS.every((t) => setOf(t.id).every((b) => b.castBurden === t.castBurden)), '48 bases');
  check('all six materials give all eight pieces', ARMOR_TIERS.every((t) => setOf(t.id).every(Boolean)), '48 bases');
}

// ------------------------------------------------------------------ weapons
{
  check('twenty one weapons', WEAPON_IDS.length === 21, WEAPON_IDS.join(' '));
  const doc = {
    dagger: ['Fencing', 1, 3, 8, 2.0, 1, 0], rapier: ['Fencing', 1, 6, 12, 2.4, 2, 15],
    spear: ['Fencing', 2, 10, 20, 3.2, 6, 35], shortsword: ['Swordsmanship', 1, 6, 12, 2.5, 3, 15],
    longsword: ['Swordsmanship', 1, 9, 16, 3.0, 4, 30], greatsword: ['Swordsmanship', 2, 16, 28, 3.8, 9, 60],
    axe: ['Swordsmanship', 1, 8, 15, 3.1, 5, 30], battleaxe: ['Swordsmanship', 2, 15, 27, 3.9, 10, 60],
    mace: ['Macefighting', 1, 8, 14, 3.0, 5, 30], warhammer: ['Macefighting', 2, 14, 26, 4.0, 12, 65],
    maul: ['Macefighting', 2, 12, 24, 3.6, 9, 55], halberd: ['Polearms', 2, 14, 25, 3.9, 11, 60],
    glaive: ['Polearms', 2, 12, 22, 3.5, 9, 50], quarterstaff: ['Macefighting', 2, 6, 12, 2.6, 3, 10],
    shortbow: ['Archery', 2, 7, 13, 2.8, 3, 15], longbow: ['Archery', 2, 11, 19, 3.4, 5, 35],
    crossbow: ['Marksmanship', 2, 14, 24, 4.2, 7, 30], throwing_knives: ['Marksmanship', 1, 5, 9, 1.8, 1, 0],
    fists: ['Wrestling', 0, 1, 4, 2.2, 0, 0],
  };
  let same = 0;
  for (const [id, row] of Object.entries(doc)) {
    const w = WEAPONS[id];
    if (w && skillNameOf(w.skill) === row[0] && w.hands === row[1] && w.minDamage === row[2] && w.maxDamage === row[3]
      && w.speed === row[4] && w.weight === row[5] && w.strReq === row[6]) same++;
  }
  check('every weapon matches the document row for row', same === 19, `${same} of 19`);
  check('every weapon trains a combat skill, or one of the named casting exceptions',
    Object.values(WEAPONS).every((w) => WEAPON_TRAINS.includes(w.skill)),
    `${CASTING_SKILLS.join(', ')} excepted`);
  check('and the exceptions are real skills that are not already combat skills',
    CASTING_SKILLS.length === 1 && CASTING_SKILLS[0] === 'magery'
    && skillNameOf('magery') === 'Magery' && !COMBAT_SKILLS.includes('magery'));

  // The two foci. Both are held, both are worse in a fight than the stick they
  // look like, and both are the only thing a spell will go through.
  check('the wand is one handed and the staff is two',
    WEAPONS.wand.hands === 1 && WEAPONS.staff.hands === 2);
  check('both train Magery and hit for energy',
    WEAPONS.wand.skill === 'magery' && WEAPONS.staff.skill === 'magery'
    && WEAPONS.wand.damageType === 'energy' && WEAPONS.staff.damageType === 'energy');
  check('the staff taps harder than the wand and softer than the quarterstaff',
    WEAPONS.wand.maxDamage < WEAPONS.staff.maxDamage
    && WEAPONS.staff.maxDamage < WEAPONS.quarterstaff.maxDamage,
    `wand ${WEAPONS.wand.minDamage}-${WEAPONS.wand.maxDamage}, staff ${WEAPONS.staff.minDamage}-${WEAPONS.staff.maxDamage}, quarterstaff ${WEAPONS.quarterstaff.minDamage}-${WEAPONS.quarterstaff.maxDamage}`);
  check('"casts" is a flag with one meaning and no other row carries it',
    Object.values(WEAPONS).filter((w) => w.casts).map((w) => w.id).join(',') === 'wand,staff',
    'the quarterstaff used to claim it and nothing read the claim');
  check('isFocus is driven both ways',
    isFocus('wand') === true && isFocus('staff') === true && isFocus('bone_staff') === true
    && isFocus('quarterstaff') === false && isFocus('longsword') === false
    && isFocus('cloth_chest') === false && isFocus(null) === false);
  check('FOCUS_BASES is exactly the bases tagged focus',
    FOCUS_BASES.join(',') === Object.values(BASES).filter((b) => b.kinds.includes('focus')).map((b) => b.id).join(','),
    FOCUS_BASES.join(', '));
  check('every focus goes to the main hand and none of them shoots',
    FOCUS_BASES.every((id) => BASES[id].slot === 'mainHand' && BASES[id].range == null));
  check('a focus can still roll the magic affixes, because it carries the staff tag',
    FOCUS_BASES.every((id) => BASES[id].kinds.includes('staff')), FOCUS_BASES.join(', '));
  check('the bone staff is a staff in every number and a focus too',
    BASES.bone_staff.skill === 'magery' && BASES.bone_staff.hands === 2
    && BASES.bone_staff.minDamage === WEAPONS.staff.minDamage
    && BASES.bone_staff.maxDamage === WEAPONS.staff.maxDamage
    && isFocus('bone_staff') === true);
  check('the spear and the polearms have their reach', WEAPONS.spear.reach === 3 && WEAPONS.halberd.reach === 3.5 && WEAPONS.glaive.reach === 3.5);
  check('the ranged weapons have their range', WEAPONS.shortbow.range === 25 && WEAPONS.longbow.range === 35 && WEAPONS.crossbow.range === 30 && WEAPONS.throwing_knives.range === 12);
  check('the notes survived', WEAPONS.mace.stun === 0.08 && WEAPONS.warhammer.stun === 0.15 && WEAPONS.maul.armourPiercing === 0.2 && WEAPONS.greatsword.cleave === 2 && WEAPONS.halberd.cleave === 3);
}

// ------------------------------------------------------------------ shields
{
  check('three shields', Object.keys(SHIELDS).length === 3);
  check('buckler, kite and tower match the document',
    SHIELDS.buckler.parryFactor === 0.6 && SHIELDS.buckler.weight === 3 && SHIELDS.buckler.strReq === 0
    && SHIELDS.kite.parryFactor === 0.9 && SHIELDS.kite.weight === 6 && SHIELDS.kite.strReq === 30
    && SHIELDS.tower.parryFactor === 1.2 && SHIELDS.tower.weight === 10 && SHIELDS.tower.strReq === 55);
}

// ------------------------------------------------------------------- rarity
{
  check('six rarities', RARITY_ORDER.length === 6, RARITY_ORDER.join(' '));
  const doc = { common: [0, 70, 0.60], uncommon: [1, 20, 0.25], rare: [2, 7, 0.10], epic: [3, 2.4, 0.04], mythic: [4, 0.5, 0.009], legendary: [5, 0.1, 0.001] };
  let same = 0;
  for (const [id, [affixes, weight, crafted]] of Object.entries(doc)) {
    const r = RARITY[id];
    if (r.affixes === affixes && r.weight === weight && Math.abs(r.crafted - crafted) < 1e-9) same++;
  }
  check('every rarity matches affixes, weight and crafted chance', same === 6, `${same} of 6`);
  check('every rarity has a hex colour', RARITY_ORDER.every((id) => /^#[0-9a-f]{6}$/i.test(RARITY[id].colour)),
    RARITY_ORDER.map((id) => RARITY[id].colour).join(' '));
  check('only legendary carries a named power', RARITY_ORDER.filter((id) => RARITY[id].namedPower).length === 1);
}

// -------------------------------------------------------------- making them
{
  const white = makeItem({ base: 'longsword', seed: 1 });
  check('a common item arrives identified', white.identified === true);
  let unidentified = 0;
  for (const r of ['uncommon', 'rare', 'epic', 'mythic', 'legendary']) {
    if (makeItem({ base: 'longsword', rarity: r, seed: 1 }).identified === false) unidentified++;
  }
  check('every rarity above common arrives unidentified', unidentified === 5, `${unidentified} of 5`);
  const it = makeItem({ base: 'plate_chest', rarity: 'epic', seed: 99, quality: 1.2, maker: 'Tam' });
  const shape = ['id', 'base', 'rarity', 'seed', 'identified', 'affixes', 'quality', 'durability', 'maker'];
  check('the record has exactly the documented shape', shape.every((k) => k in it) && Object.keys(it).length === shape.length, Object.keys(it).join(','));
  check('the same seed and base build the same id',
    makeItem({ base: 'longsword', rarity: 'rare', seed: 5 }).id === makeItem({ base: 'longsword', rarity: 'rare', seed: 5 }).id);
  check('a different seed builds a different id',
    makeItem({ base: 'longsword', rarity: 'rare', seed: 5 }).id !== makeItem({ base: 'longsword', rarity: 'rare', seed: 6 }).id);
  check('an unknown base is refused', threw(() => makeItem({ base: 'moonsword' })));
  check('an unknown rarity is refused', threw(() => makeItem({ base: 'longsword', rarity: 'ultra' })));
  check('baseFor answers null for a thing that is not there', baseFor('moonsword') === null);
}

// ------------------------------------------------------------------- weight
{
  check('a longsword is 4 stones', weightOf({ base: 'longsword' }) === 4);
  check('a stack of 40 arrows is 4 stones', weightOf({ base: 'arrow', count: 40 }) === 4);
  check('a stack of one arrow is 0.1 stones', Math.abs(weightOf({ base: 'arrow', count: 1 }) - 0.1) < 1e-9);
  check('a warhammer does not multiply by a count it does not have', weightOf({ base: 'warhammer', count: 9 }) === 12);
}

// -------------------------------------------------------------- can you wear it
{
  // Armour above your STR is worn anyway, at half AR and a slower swing.
  const at60 = canEquip('plate_chest', { STR: 60 });
  check('plate at 60 STR is allowed', at60.ok === true);
  check('plate at 60 STR halves the AR', at60.penalty.arMul === 0.5, `arMul ${at60.penalty.arMul}`);
  check('plate at 60 STR slows the swing 15%', Math.abs(at60.penalty.swingMul - 1.15) < 1e-9, `swingMul ${at60.penalty.swingMul}`);
  check('and it says so', /75 STR/.test(at60.reason) && /half/.test(at60.reason), at60.reason);

  const at75 = canEquip('plate_chest', { STR: 75 });
  check('plate at 75 STR does not halve the AR', at75.penalty.arMul === 1, `arMul ${at75.penalty.arMul}`);
  check('plate at 75 STR does not slow the swing', at75.penalty.swingMul === 1);
  check('and it says nothing', at75.reason === '');

  const at65 = canEquip('plate_chest', { STR: 65 });
  check('ten STR short is ten percent slower', Math.abs(at65.penalty.swingMul - 1.10) < 1e-9, `swingMul ${at65.penalty.swingMul}`);
  const at55 = canEquip('plate_chest', { STR: 55 });
  check('twenty STR short is twenty percent slower', Math.abs(at55.penalty.swingMul - 1.20) < 1e-9, `swingMul ${at55.penalty.swingMul}`);

  check('AR through the penalty is 12 at 60 STR', armourOf(makeItem({ base: 'plate_chest' }), { STR: 60 }) === 12);
  check('AR through the penalty is 24 at 75 STR', armourOf(makeItem({ base: 'plate_chest' }), { STR: 75 }) === 24);
  check('cloth needs nothing', canEquip('cloth_chest', { STR: 0 }).ok === true && canEquip('cloth_chest', { STR: 0 }).penalty.arMul === 1);

  // A weapon or a shield you cannot lift is refused outright.
  check('a warhammer at 60 STR is refused', canEquip('warhammer', { STR: 60 }).ok === false);
  check('a warhammer at 65 STR is held', canEquip('warhammer', { STR: 65 }).ok === true);
  check('the refusal says the number', /65 STR/.test(canEquip('warhammer', { STR: 60 }).reason), canEquip('warhammer', { STR: 60 }).reason);
  check('a tower shield at 54 STR is refused', canEquip('tower', { STR: 54 }).ok === false);
  check('a tower shield at 55 STR is held', canEquip('tower', { STR: 55 }).ok === true);
  check('a dagger is held by anyone', canEquip('dagger', { STR: 0 }).ok === true);
  check('an ingot is not equipment', canEquip('ingot', { STR: 100 }).ok === false);
  check('fists are not equipment', canEquip('fists', { STR: 100 }).ok === false);
  check('a thing that does not exist is refused', canEquip('moonsword', { STR: 100 }).ok === false);
  check('lowercase str is understood too', canEquip('plate_chest', { str: 75 }).penalty.arMul === 1);
}

// -------------------------------------------------------------------- slots
{
  check('a longsword goes to the main hand', equipSlotFor('longsword') === 'mainHand');
  check('a greatsword goes to the main hand and is two handed', equipSlotFor('greatsword') === 'mainHand' && twoHanded('greatsword') === true);
  check('a longsword is not two handed', twoHanded('longsword') === false);
  check('a bow goes to the ranged slot', equipSlotFor('shortbow') === 'ranged' && equipSlotFor('longbow') === 'ranged');
  check('a crossbow and thrown knives go to the ranged slot', equipSlotFor('crossbow') === 'ranged' && equipSlotFor('throwing_knives') === 'ranged');
  check('a shield goes to the off hand', equipSlotFor('buckler') === 'offHand');
  check('a tome and a torch go to the off hand', equipSlotFor('tome') === 'offHand' && equipSlotFor('torch') === 'offHand');
  check('an amulet goes to the neck', equipSlotFor('amulet') === 'neck');
  check('a ring goes to the first ring slot and fits either', equipSlotFor('ring') === 'ring1' && slotsFor('ring').join(' ') === 'ring1 ring2');
  check('a cloak goes to the back', equipSlotFor('plate_back') === 'back');
  check('greaves go on the legs', equipSlotFor('plate_legs') === 'legs');
  check('fists and materials have no slot', equipSlotFor('fists') === null && equipSlotFor('ingot') === null);
  check('every base points at a real slot or none', Object.values(BASES).every((b) => b.slot === null || SLOTS.includes(b.slot)));
}

// ---------------------------------------------------------------- stacking
{
  check('a common ingot stacks', stackable({ base: 'ingot', rarity: 'common', affixes: [] }) === true);
  check('an uncommon ingot does not', stackable({ base: 'ingot', rarity: 'uncommon', affixes: [] }) === false);
  check('an ingot with an affix does not', stackable({ base: 'ingot', rarity: 'common', affixes: [{ id: 'str' }] }) === false);
  check('a longsword never stacks', stackable({ base: 'longsword', rarity: 'common', affixes: [] }) === false);
  check('arrows, potions, bread, ore and wood all stack',
    ['arrow', 'potion', 'bread', 'ore', 'log'].every((b) => stackable({ base: b, rarity: 'common' })));
}

// ------------------------------------------------------------ takes rarity
//
// The user's sentence: "rarity should not apply to food, rarity only applies to
// items and has a chance of adding an effect to items." Driven true AND false
// across every base there is, not on a sample.
{
  const kinds = [...new Set(Object.values(BASES).map((b) => b.kind))].sort();
  check('every kind in the game is on one side of the rarity line or the other',
    kinds.every((k) => RARITY_KINDS.includes(k) || NO_RARITY_KINDS.includes(k)), kinds.join(', '));
  check('and no kind is on both sides', !kinds.some((k) => RARITY_KINDS.includes(k) && NO_RARITY_KINDS.includes(k)));

  const yes = Object.values(BASES).filter((b) => takesRarity(b));
  const no = Object.values(BASES).filter((b) => !takesRarity(b));
  check(`${yes.length} bases take rarity and every one of them is gear`,
    yes.length > 0 && yes.every((b) => RARITY_KINDS.includes(b.kind)),
    [...new Set(yes.map((b) => b.kind))].join(', '));
  check(`${no.length} bases do not, and not one of them is gear`,
    no.length > 0 && no.every((b) => NO_RARITY_KINDS.includes(b.kind)),
    [...new Set(no.map((b) => b.kind))].join(', '));

  check('a longsword, a plate chest, a buckler, a ring, a torch and a lute take rarity',
    ['longsword', 'plate_chest', 'buckler', 'ring', 'torch', 'lute'].every(takesRarity));
  check('a carrot, a loaf, venison, an ingot, an arrow, a pickaxe and a healing draught do not',
    !['carrot', 'bread', 'venison', 'ingot', 'arrow', 'pickaxe', 'healing_draught'].some(takesRarity));
  check('and a thing that is not a base at all does not', takesRarity('moonsword') === false && takesRarity(null) === false);
  check('takesRarity reads an item record as happily as a base id',
    takesRarity(makeItem({ base: 'longsword' })) === true && takesRarity(makeItem({ base: 'carrot' })) === false);

  // makeItem coerces rather than throwing, whatever it is asked for.
  let coerced = 0;
  for (const r of ['uncommon', 'rare', 'epic', 'mythic', 'legendary']) {
    const it = makeItem({ base: 'carrot', rarity: r, seed: 3, affixes: [{ id: 'str', value: 7 }] });
    if (it.rarity === 'common' && it.identified === true && it.affixes.length === 0) coerced++;
  }
  check('a carrot asked for at every rarity above common comes out common, identified and bare', coerced === 5, `${coerced} of 5`);
  check('and a longsword asked for the same way keeps what it was given',
    makeItem({ base: 'longsword', rarity: 'rare', seed: 3 }).rarity === 'rare');
}

// -------------------------------------------------------------------- food
//
// "There should be no Food item, it should be a specific food, carrot, apple,
// whatever, but not food."
{
  check('the audit passes', !!auditFoodBases(), JSON.stringify(auditFoodBases()));
  check('there is no base called food', !BASES.food && baseFor('food') === null);
  check('and nothing in the game is named Food',
    !Object.values(BASES).some((b) => /^food$/i.test(b.name)));
  check(`there are ${FOOD_BASES.length} specific foods`, FOOD_BASES.length >= 15, FOOD_BASES.join(' '));
  check('the ones the request named are all there',
    ['apple', 'carrot', 'turnip', 'onion', 'cabbage', 'bread', 'cheese', 'egg', 'fish', 'venison', 'game_meat'].every((id) => !!BASES[id]));
  check('every food is kind food, stacks, and weighs 0.3 to 0.5',
    FOOD_BASES.every((id) => BASES[id].kind === 'food' && BASES[id].stack && BASES[id].weight >= 0.3 && BASES[id].weight <= 0.5),
    FOOD_BASES.map((id) => BASES[id].weight).join(' '));
  check('every food really does something when it is eaten',
    FOOD_BASES.every((id) => Array.isArray(BASES[id].use?.heal) && BASES[id].use.seconds > 0),
    FOOD_BASES.map((id) => `${id} ${BASES[id].use.heal.join('-')}/${BASES[id].use.seconds}s`).slice(0, 4).join(', '));
  check(`all ${MEAT_BASES.length} meats carry material "meat", so a kitchen recipe asking for meat can be paid in any of them`,
    MEAT_BASES.every((id) => BASES[id].material === 'meat'), MEAT_BASES.join(' '));
  check('venison and game_meat kept their ids, so state.js GOOD_BASE and the hunting bag still work',
    !!BASES.venison && !!BASES.game_meat && BASES.venison.stack && BASES.game_meat.stack);
  check(`the ${MEAL_BASES.length} cooked meals each grant a real buff`,
    MEAL_BASES.every((id) => BASES[id].use?.buff?.effect && BASES[id].use.buff.seconds > 0), MEAL_BASES.join(' '));
  check('and no food takes rarity', ![...FOOD_BASES, ...MEAL_BASES].some(takesRarity));

  // The guard fails as well as it passes.
  const carrot = BASES.carrot;
  const wt = carrot.weight;
  carrot.weight = 3;
  check('a carrot that weighs three stones throws', threw(auditFoodBases));
  carrot.weight = wt;
  const use = carrot.use;
  delete carrot.use;
  check('a carrot nothing happens when you eat throws', threw(auditFoodBases));
  carrot.use = use;
  check('and it is whole again', !!auditFoodBases());
}

// -------------------------------------------------------------------- audit
{
  check('the tables audit clean', auditItems() === true);

  // A planted rare carrot: the thing no table can catch on its own.
  const rareCarrot = { ...makeItem({ base: 'carrot', seed: 1 }), rarity: 'rare', identified: false };
  check('a rare carrot in a pack throws', threw(() => auditItems([rareCarrot])));
  const affixedApple = { ...makeItem({ base: 'apple', seed: 1 }), affixes: [{ id: 'str', value: 7 }] };
  check('an apple carrying an affix throws', threw(() => auditItems([affixedApple])));
  check('and an honest carrot passes', auditItems([makeItem({ base: 'carrot', seed: 1 })]) === true);
  check('a rare longsword in the same list passes, because rarity is what a longsword is for',
    auditItems([makeItem({ base: 'longsword', rarity: 'rare', seed: 1 })]) === true);

  // And a base that grew a rarity field, which is the version of this that
  // would ship without anybody making an item at all.
  BASES.carrot.rarity = 'epic';
  check('a base that carries a rarity throws', threw(auditItems));
  delete BASES.carrot.rarity;
  BASES.carrot.affixes = [];
  check('a base that carries an affix list throws', threw(auditItems));
  delete BASES.carrot.affixes;
  check('and the tables are clean again', auditItems() === true);

  // A weapon whose skill is not a combat skill.
  const skill = WEAPONS.longsword.skill;
  WEAPONS.longsword.skill = 'cooking';
  check('a weapon trained by Cooking throws', threw(auditItems));
  WEAPONS.longsword.skill = skill;
  check('and passes again once it is a combat skill', auditItems() === true);

  // A tier missing a column.
  const med = ARMOR_TIERS[5].meditation;
  delete ARMOR_TIERS[5].meditation;
  check('an armour tier with no Meditation column throws', threw(auditItems));
  ARMOR_TIERS[5].meditation = med;
  check('and passes again once the column is back', auditItems() === true);

  const cb = ARMOR_TIERS[5].castBurden;
  delete ARMOR_TIERS[5].castBurden;
  check('an armour tier with no cast burden column throws', threw(auditItems));
  ARMOR_TIERS[5].castBurden = 2;
  check('a burden above one throws', threw(auditItems));
  ARMOR_TIERS[5].castBurden = 0;
  check('plate that burdens a cast less than chainmail throws', threw(auditItems));
  ARMOR_TIERS[5].castBurden = cb;
  check('and passes again once the burden is back', auditItems() === true);
  const cloth = ARMOR_TIERS[0].castBurden;
  ARMOR_TIERS[0].castBurden = 0.05;
  check('cloth that burdens a cast at all throws', threw(auditItems));
  ARMOR_TIERS[0].castBurden = cloth;
  check('and passes again once cloth is free', auditItems() === true);

  const resist = ARMOR_TIERS[2].resist;
  ARMOR_TIERS[2].resist = {};
  check('an armour tier with no typed resist throws', threw(auditItems));
  ARMOR_TIERS[2].resist = resist;

  const wt = ARMOR_TIERS[5].weight;
  ARMOR_TIERS[5].weight = 8;
  check('a plate set that no longer weighs 72 throws', threw(auditItems));
  ARMOR_TIERS[5].weight = wt;

  const removed = WEAPONS.fists;
  delete WEAPONS.fists;
  check('eighteen weapons throws', threw(auditItems));
  WEAPONS.fists = removed;

  const spd = WEAPONS.mace.speed;
  WEAPONS.mace.speed = 0;
  check('a weapon that swings in no time throws', threw(auditItems));
  WEAPONS.mace.speed = spd;

  const col = RARITY.epic.colour;
  RARITY.epic.colour = 'purple';
  check('a rarity whose colour is a word throws', threw(auditItems));
  RARITY.epic.colour = col;

  check('everything is whole again', auditItems() === true);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
