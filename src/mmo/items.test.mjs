// The item tables, driven both ways. Run: node src/mmo/items.test.mjs
//
// Every check here is against docs/mmo/03-ITEMS-LOOT.md. Where the document
// states a number out loud (full plate is 108 AR and 72 stones) the test counts
// it rather than trusting the table, and every guard is proved to fail as well
// as to pass.
import {
  SLOTS, ARMOR_TIERS, ARMOR_PIECES, SHIELDS, WEAPONS, WEAPON_IDS, RARITY, RARITY_ORDER,
  COMBAT_SKILLS, skillNameOf, BASES, baseFor, makeItem, weightOf, canEquip, armourOf, equipSlotFor,
  slotsFor, stackable, twoHanded, setOf, auditItems, totalWeight,
} from './items.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };

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
  check('all six materials give all eight pieces', ARMOR_TIERS.every((t) => setOf(t.id).every(Boolean)), '48 bases');
}

// ------------------------------------------------------------------ weapons
{
  check('nineteen weapons', WEAPON_IDS.length === 19, WEAPON_IDS.join(' '));
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
  check('every weapon trains a combat skill', Object.values(WEAPONS).every((w) => COMBAT_SKILLS.includes(w.skill)));
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
  check('arrows, potions, food, ore and wood all stack',
    ['arrow', 'potion', 'food', 'ore', 'log'].every((b) => stackable({ base: b, rarity: 'common' })));
}

// -------------------------------------------------------------------- audit
{
  check('the tables audit clean', auditItems() === true);

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
