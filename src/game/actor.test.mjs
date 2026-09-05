// Actors, gear, pools and monsters. Run: node src/game/actor.test.mjs
//
// The rule this file is written to: measure, do not assert. Nothing here says
// "the bonus is applied"; it says what the number was before, what it is after,
// and prints both. Every gate is driven true AND false.
import {
  playerActor, spawnMonster, recompute, tickPools, syncToCharacter,
  meditationFactor, castBurdenOf, burdenSources, naturalWeaponFor, difficultyOfMonster,
  weaponFrom, shieldFrom,
  auditActor, AFFIX_EFFECT, BONUS_KEYS, MONSTER_STAMINA,
} from './actor.js';
import { blankCharacter, makeStack } from './state.js';
import { makeItem, ARMOR_PIECES } from '../mmo/items.js';
import { MONSTER_LIST, MONSTERS } from '../mmo/monsters.js';
import { AFFIXES } from '../mmo/affixes.js';
import { OPENINGS_BY_ID } from '../mmo/openings.js';
import {
  attackSkill, defenceSkill, swingSeconds, hitChance, UNARMED, aggroCheck, fleeCheck,
  resolveSpell,
} from '../mmo/combat_rules.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const gear = (base, affixes = []) => ({ ...makeItem({ base, rarity: affixes.length ? 'rare' : 'common', seed: 7 }), identified: true, affixes });

// ---- the table is complete ------------------------------------------------
{
  const r = auditActor();
  check('every affix in affixes.js has an effect row', r.affixes === AFFIXES.length, `${r.affixes} affixes, ${BONUS_KEYS.length} bonus keys`);
  check('and no effect row names an affix that is gone', Object.keys(AFFIX_EFFECT).length === AFFIXES.length, `${Object.keys(AFFIX_EFFECT).length} rows`);
}

// ---- the player out of a blank document -----------------------------------
{
  const c = blankCharacter();
  const a = playerActor(c);
  // 30 + CON 50 * 2 + STR 50 * 0.5
  check('a blank character has 155 health', a.maxHealth === 155, String(a.maxHealth));
  check('and 135 mana', a.maxMana === 135, String(a.maxMana));
  check('and 120 stamina', a.maxStamina === 120, String(a.maxStamina));
  check('and starts full', a.health === 155 && a.mana === 135 && a.stamina === 120);
  check('with bare fists, which are items.js Fists at 1 to 4', a.weapon.skill === UNARMED.skill && a.weapon.minDamage === 1 && a.weapon.maxDamage === 4, `${a.weapon.minDamage} to ${a.weapon.maxDamage}, and combat_rules.UNARMED is ${UNARMED.minDamage} to ${UNARMED.maxDamage}`);
  check('no shield', a.shield === null);
  check('the model is left for W2', a.model === null);
  check('the faction is player', a.faction === 'player' && a.ai === null);
  check('carry is 40 + STR * 2', a.carry === 140, String(a.carry));
}
{
  // The document's own warrior, so the numbers are the ones a player meets.
  const c = blankCharacter();
  c.stats = { ...OPENINGS_BY_ID.warrior.stats };
  const a = playerActor(c);
  check('a warrior (STR 65, CON 65) has 192.5 health', a.maxHealth === 192.5, String(a.maxHealth));
  check('a warrior (DEX 50, CON 65) has 127.5 stamina', a.maxStamina === 127.5, String(a.maxStamina));
}

// ---- the base stats are shared, not copied --------------------------------
{
  const c = blankCharacter();
  const a = playerActor(c);
  const before = a.maxHealth;
  c.stats.con += 10;                       // what progression.js does
  recompute(a);
  check('raising CON on the document raises the actor', a.maxHealth === before + 20, `${before} then ${a.maxHealth}`);
}

// ---- affixes land where they are supposed to, both ways --------------------
{
  const c = blankCharacter();
  const a = playerActor(c);
  const base = {
    str: a.stats.str, damagePct: a.bonuses.damagePct, hit: a.bonuses.hit,
    sword: a.skills.swordsmanship, health: a.maxHealth, ar: a.ar,
  };
  c.equipment.mainHand = gear('longsword', [
    { id: 'str', stat: 'str', value: 5, unit: 'flat' },
    { id: 'damage', stat: 'damage', value: 20, unit: 'percent' },
    { id: 'hitChance', stat: 'hitChance', value: 10, unit: 'percent' },
    { id: 'skill', stat: 'skill', skillId: 'swordsmanship', value: 8, unit: 'flat' },
    { id: 'health', stat: 'health', value: 30, unit: 'flat' },
  ]);
  recompute(a);
  check('+5 STR reaches the effective stats', a.stats.str === base.str + 5, `${base.str} then ${a.stats.str}`);
  check('Damage +20% reaches damagePct as 20 percent points', a.bonuses.damagePct === 20, String(a.bonuses.damagePct));
  check('Hit Chance +10% reaches hit as 20 skill points', a.bonuses.hit === 20, String(a.bonuses.hit));
  check('a +8 Swordsmanship line reaches that skill', a.skills.swordsmanship === base.sword + 8, `${base.sword} then ${a.skills.swordsmanship}`);
  // +5 STR is also +2.5 health through the formula, so the pool moves by 32.5.
  check('+30 Health and the STR it brought move the pool by 32.5', a.maxHealth === base.health + 32.5, `${base.health} then ${a.maxHealth}`);
  check('and the longsword is in the hand', a.weapon.skill === 'swordsmanship' && a.weapon.maxDamage === 16, `${a.weapon.name}`);

  c.equipment.mainHand = null;
  recompute(a);
  check('taking it off puts every one of them back', a.stats.str === base.str && a.bonuses.damagePct === 0 && a.bonuses.hit === 0 && a.skills.swordsmanship === base.sword && a.maxHealth === base.health, `${a.stats.str}/${a.bonuses.damagePct}/${a.maxHealth}`);
  check('and the hand is bare again', a.weapon.skill === UNARMED.skill);
}

// ---- an unidentified item gives no affix bonus, which is the doc's rule ----
{
  const c = blankCharacter();
  const a = playerActor(c);
  const ar0 = a.ar;
  c.stats.str = 75;                     // enough to wear it without the penalty
  c.equipment.chest = { ...makeItem({ base: 'plate_chest', rarity: 'rare', seed: 3 }), affixes: [] };
  recompute(a);
  check('an unidentified breastplate still gives its base armour', a.ar === ar0 + 24, `${ar0} then ${a.ar}`);
  check('and no affix bonus at all, because its affixes are not rolled yet', a.bonuses.damagePct === 0 && a.stats.str === 75, String(a.stats.str));
}

// ---- the AR path, including the STR penalty items.js applies --------------
{
  const c = blankCharacter();          // STR 50, under platemail's 75
  const a = playerActor(c);
  c.equipment.chest = gear('plate_chest');
  recompute(a);
  check('a breastplate you cannot lift gives half its 24 AR', a.ar === 12, String(a.ar));
  c.stats.str = 75;
  recompute(a);
  check('and all of it once STR reaches 75', a.ar === 24, String(a.ar));
}

// ---- the Meditation blocker ------------------------------------------------
{
  const full = (mat) => Object.fromEntries(ARMOR_PIECES.map((p) => [p.slot, gear(`${mat}_${p.id}`)]));
  check('naked casts freely', meditationFactor({}) === 1);
  check('full cloth casts freely', meditationFactor(full('cloth')) === 1);
  check('full plate blocks Meditation entirely', meditationFactor(full('plate')) === 0);
  const oneChest = { chest: gear('plate_chest') };
  check('one plate chest leaves 7 of 8 free', meditationFactor(oneChest) === 0.875, String(meditationFactor(oneChest)));
  const mage = { chest: gear('plate_chest', [{ id: 'mageArmour', stat: 'mageArmour', value: 1, unit: 'flag' }]) };
  check('Mage Armour on that chest makes it free again', meditationFactor(mage) === 1, String(meditationFactor(mage)));

  const c = blankCharacter();
  c.skills.meditation = 100;
  const a = playerActor(c);
  const open = a.manaRegen;                     // 0.3 + WIS 50 * 0.025 + 100 * 0.010
  c.equipment = { ...c.equipment, ...full('plate') };
  recompute(a);
  check('100 Meditation is worth 1.0 mana a second in the open', open === 2.55, String(open));
  check('and none of it in full plate', a.manaRegen === 1.55, String(a.manaRegen));
}

// ---- the casting burden, the same eight slots from the other end -----------
{
  const full = (mat) => Object.fromEntries(ARMOR_PIECES.map((p) => [p.slot, gear(`${mat}_${p.id}`)]));
  check('naked casts freely', castBurdenOf({}) === 0, String(castBurdenOf({})));
  check('and so does nothing at all', castBurdenOf(null) === 0);
  check('full cloth burdens a cast by nothing', castBurdenOf(full('cloth')) === 0, String(castBurdenOf(full('cloth'))));
  check('full leather burdens it by a tenth', castBurdenOf(full('leather')) === 0.1, String(castBurdenOf(full('leather'))));
  check('full studded by three tenths', castBurdenOf(full('studded')) === 0.3, String(castBurdenOf(full('studded'))));
  check('full ringmail by 0.55', castBurdenOf(full('ring')) === 0.55, String(castBurdenOf(full('ring'))));
  check('full chainmail by 0.75', castBurdenOf(full('chain')) === 0.75, String(castBurdenOf(full('chain'))));
  check('full plate by all of it', castBurdenOf(full('plate')) === 1, String(castBurdenOf(full('plate'))));

  const oneChest = { chest: gear('plate_chest') };
  check('a plate chest and nothing else is 1 of 8', castBurdenOf(oneChest) === 0.125, String(castBurdenOf(oneChest)));
  const mageArm = [{ id: 'mageArmour', stat: 'mageArmour', value: 1, unit: 'flag' }];
  const mage = Object.fromEntries(ARMOR_PIECES.map((p) => [p.slot, gear(`plate_${p.id}`, mageArm)]));
  check('full plate with Mage Armour on every piece burdens nothing', castBurdenOf(mage) === 0, String(castBurdenOf(mage)));
  check('and one Mage Armour breastplate alone is free too',
    castBurdenOf({ chest: gear('plate_chest', mageArm) }) === 0, String(castBurdenOf({ chest: gear('plate_chest', mageArm) })));

  // a mixed set: plate chest, chain legs, ring helm, the other five empty
  const mixed = { chest: gear('plate_chest'), legs: gear('chain_legs'), head: gear('ring_head') };
  check('a mixed set is the mean of what is worn over eight slots',
    castBurdenOf(mixed) === 0.2875, `${castBurdenOf(mixed)}, want (1 + 0.75 + 0.55) / 8`);
  check('and it names the materials heaviest first',
    burdenSources(mixed).join(', ') === 'platemail, chainmail, ringmail', burdenSources(mixed).join(', '));
  check('cloth is never named, because cloth is never to blame',
    burdenSources(full('cloth')).length === 0, burdenSources(full('cloth')).join(', '));
  check('a full plate suit is named once, not eight times',
    burdenSources(full('plate')).join(', ') === 'platemail', burdenSources(full('plate')).join(', '));
  check('and a Mage Armour piece is not blamed for a fizzle it did not cause',
    burdenSources({ chest: gear('plate_chest', mageArm), legs: gear('chain_legs') }).join(', ') === 'chainmail',
    burdenSources({ chest: gear('plate_chest', mageArm), legs: gear('chain_legs') }).join(', '));

  // and the field recompute writes, which is what the runtime actually reads
  const c = blankCharacter();
  c.stats.str = 100;
  const a = playerActor(c);
  check('a fresh actor carries no burden', a.castBurden === 0, String(a.castBurden));
  c.equipment = { ...c.equipment, ...full('plate') };
  recompute(a);
  check('recompute writes the burden onto the actor', a.castBurden === 1, String(a.castBurden));
  c.equipment = { ...c.equipment, ...full('cloth') };
  recompute(a);
  check('and takes it off again when the plate comes off', a.castBurden === 0, String(a.castBurden));
}

// ---- the weapon in the hand ------------------------------------------------
{
  const c = blankCharacter();
  const a = playerActor(c);
  c.equipment.ranged = gear('shortbow');
  recompute(a);
  check('a bow is used when the main hand is empty', a.weapon.skill === 'archery', a.weapon.name);
  c.equipment.mainHand = gear('mace');
  recompute(a);
  check('and not when it is not', a.weapon.skill === 'macefighting', a.weapon.name);
  c.equipment.offHand = gear('kite');
  recompute(a);
  check('a kite shield is a shield with a parry factor', a.shield && a.shield.parryFactor === 0.9, JSON.stringify(a.shield));
  check('a torch is not', shieldFrom(gear('torch')) === null);
  check('and neither is a longsword', shieldFrom(gear('longsword')) === null && weaponFrom(gear('kite')) === null);
}

// ---- buffs, and buffs that have run out ------------------------------------
{
  const c = blankCharacter();
  const a = playerActor(c);
  const str0 = a.stats.str;
  a.buffs = [{ id: 'strength', until: 5000, effect: { stats: { str: 20 } } }];
  a.now = 1000; recompute(a);
  check('a live buff is counted', a.stats.str === str0 + 20, String(a.stats.str));
  a.now = 6000; recompute(a);
  check('a buff that ran out is not', a.stats.str === str0, String(a.stats.str));
  a.buffs = [{ id: 'gift', until: 9e9, effect: { affixes: [{ id: 'dodge', value: 8, unit: 'percent' }] } }];
  a.now = 0; recompute(a);
  check('a buff can be written as affixes too', a.bonuses.dodge === 0.08, String(a.bonuses.dodge));
}

// ---- the pool invariant, in both directions --------------------------------
{
  const c = blankCharacter();
  const a = playerActor(c);
  a.health = 40;
  recompute(a);
  check('a recompute in the middle of a fight is not a heal', a.health === 40, String(a.health));
  c.equipment.chest = gear('cloth_chest', [{ id: 'health', stat: 'health', value: 40, unit: 'flat' }]);
  recompute(a);
  check('and gaining +40 max health does not fill the bar either', a.health === 40 && a.maxHealth === 195, `${a.health} of ${a.maxHealth}`);
  a.health = a.maxHealth;
  c.equipment.chest = null;
  recompute(a);
  check('taking the health off clamps a full bar down to the new max', a.health === 155 && a.maxHealth === 155, `${a.health} of ${a.maxHealth}`);
}

// ---- regeneration, measured ------------------------------------------------
{
  const c = blankCharacter();
  const a = playerActor(c);
  a.health = 100; a.mana = 0; a.stamina = 0;
  const inFight = tickPools(a, 1, true);
  a.health = 100;
  const outOfFight = tickPools(a, 1, false);
  check('health regen out of combat is exactly twice the rate in it', near(outOfFight.health, inFight.health * 2), `${inFight.health} in a fight, ${outOfFight.health} out of one`);
  check('CON 50 gives 1.4 health a second in a fight', near(inFight.health, 1.4), String(inFight.health));
  check('mana does not double out of combat', near(tickPools({ ...a, mana: 0, maxMana: 100, manaRegen: 2, health: 10, maxHealth: 10 }, 1, false).mana, 2), 'W1 reads 01: only health doubles');

  a.health = a.maxHealth;
  check('a full bar gains nothing', tickPools(a, 1, false).health === 0);
  a.health = 0;
  check('and the dead regenerate nothing at all', tickPools(a, 10, false).health === 0, String(a.health));
  const b = playerActor(blankCharacter());
  check('a tick of no time does nothing', tickPools(b, 0, false).health === 0);
}

// ---- writing back to the document ------------------------------------------
{
  const c = blankCharacter();
  const a = playerActor(c, { pos: { x: 3, y: 0, z: -9 } });
  a.health = 61.5;
  syncToCharacter(a);
  check('the health you were left on reaches the document', c.health === 61.5, String(c.health));
  check('and so does where you stood', c.pos.x === 3 && c.pos.z === -9, `${c.pos.x},${c.pos.z}`);
}

// ---- monsters: the numbers the document tuned survive the trip -------------
{
  let worstHit = 0, worstDef = 0, bad = [];
  for (const m of MONSTER_LIST) {
    const a = spawnMonster(m.id, { x: 0, y: 0, z: 0 }, () => 0.5);
    const dh = Math.abs(attackSkill(a) - m.hit);
    const dd = Math.abs(defenceSkill(a) - m.def);
    worstHit = Math.max(worstHit, dh); worstDef = Math.max(worstDef, dd);
    if (dh > 1e-9 || dd > 1e-9) bad.push(`${m.id} hit ${attackSkill(a)} want ${m.hit}, def ${defenceSkill(a)} want ${m.def}`);
    if (a.maxHealth !== m.hp) bad.push(`${m.id} has ${a.maxHealth} health, the row says ${m.hp}`);
    if (a.ar !== m.ar) bad.push(`${m.id} has AR ${a.ar}, the row says ${m.ar}`);
  }
  check(`all ${MONSTER_LIST.length} monsters keep their hit and def through the resolver`, bad.length === 0, `worst drift ${worstHit} hit, ${worstDef} def` + (bad.length ? `\n     ${bad.slice(0, 4).join('\n     ')}` : ''));
}
{
  const bk = spawnMonster('boneKnight', { x: 0, y: 0, z: 0 }, () => 0.5);
  check('a monster that parries keeps a guard to parry with', bk.shield && bk.shield.parryFactor === 0.9, JSON.stringify(bk.shield));
  check('and its defence still comes out at the row', defenceSkill(bk) === MONSTERS.boneKnight.def, String(defenceSkill(bk)));
  const wolf = spawnMonster('wolf', { x: 0, y: 0, z: 0 }, () => 0.5);
  check('one that does not, has none', wolf.shield === null);
}

// ---- monster stamina: the trap this would otherwise fall into --------------
{
  const wolf = spawnMonster('wolf', { x: 0, y: 0, z: 0 }, () => 0.5);
  check(`a monster carries ${MONSTER_STAMINA} stamina`, wolf.stamina === MONSTER_STAMINA);
  const rested = swingSeconds(wolf);
  const exhausted = swingSeconds({ ...wolf, stamina: 0 });
  check('a wolf swings every 2.2 s, not 4.4', near(rested, 2.2) && near(exhausted, 4.4), `${rested} s rested, ${exhausted} s at zero stamina`);
  const you = playerActor(blankCharacter());
  const withStam = hitChance(wolf, you);
  const without = hitChance({ ...wolf, stamina: 0 }, you);
  check('and is not ten points worse to hit for its whole life', withStam > without, `${(withStam * 100).toFixed(1)}% with stamina, ${(without * 100).toFixed(1)}% without`);
}

// ---- monster difficulty ----------------------------------------------------
{
  check('a wraith teaches at 70, which is the number 01 quotes', difficultyOfMonster(MONSTERS.wraith) === 70, String(difficultyOfMonster(MONSTERS.wraith)));
  check('a critter teaches at 5, which is its other quoted number', difficultyOfMonster(MONSTERS.rabbit) === 5, String(difficultyOfMonster(MONSTERS.rabbit)));
  check('the tier 1 giant rat teaches at 10, not 5', difficultyOfMonster(MONSTERS.giantRat) === 10, String(difficultyOfMonster(MONSTERS.giantRat)));
  check('and neither is the row def, which is 75 for the wraith', MONSTERS.wraith.def === 75);
}

// ---- monster resists, weaknesses, ai, faction -------------------------------
{
  const golem = spawnMonster('ironGolem', { x: 1, y: 0, z: 2 }, () => 0.5);
  check('immunePoison is poison 70, the cap the rules allow', golem.resists.poison === 70, JSON.stringify(golem.resists));
  check('and energyWeak is a weakness, because a resist cannot go below zero', golem.weakTo.includes('energy') && golem.resists.energy === 0, JSON.stringify(golem.weakTo));
  const wraith = spawnMonster('wraith', { x: 0, y: 0, z: 0 }, () => 0.5);
  check('incorporeal50 halves physical damage', wraith.resists.physical === 50, String(wraith.resists.physical));
  const troll = spawnMonster('mireTroll', { x: 0, y: 0, z: 0 }, () => 0.5);
  check('regen3 is three health a second and nothing else regenerates', troll.healthRegen === 3 && wraith.healthRegen === 0, `${troll.healthRegen} vs ${wraith.healthRegen}`);

  // M3, M2.md section 2: the third immunity. Written at the same RESIST_CAP the
  // other two are, because recompute clamps every resist to it and a hundred
  // would arrive as seventy while looking like it meant something more.
  const drake = spawnMonster('emberDrake', { x: 0, y: 0, z: 0 }, () => 0.5);
  check('fireImmune is fire 70, the same cap the other two immunities get',
    drake.resists.fire === 70 && drake.naturalResists.fire === 70, JSON.stringify(drake.resists));
  const carriers = MONSTER_LIST.filter((m) => (m.notes || []).includes('fireImmune'));
  check('and every row that carries the tag really has it, all four of them',
    carriers.length === 4 && carriers.every((m) => spawnMonster(m.id, { x: 0, y: 0, z: 0 }, () => 0.5).resists.fire === 70),
    carriers.map((m) => m.id).join(', '));
  check('and a row that does not carry it has no fire resist at all',
    spawnMonster('wolf', { x: 0, y: 0, z: 0 }, () => 0.5).resists.fire === 0);
  // and it really turns fire: the same spell against the drake and against a
  // row of the same tier that is not immune to it
  const spell = { base: [100, 100], damageType: 'fire', id: 'test', name: 'a test flame' };
  const caster = playerActor(blankCharacter());
  const burn = (id) => resolveSpell({ caster, target: spawnMonster(id, { x: 0, y: 0, z: 0 }, () => 0.5), spell, rng: () => 0.5, now: 0 }).damage;
  const onDrake = burn('emberDrake'), onSpider = burn('blossomSpider');
  check('a hundred points of fire is turned by seventy percent of it on the drake',
    onDrake < onSpider && Math.abs(onDrake / onSpider - 0.3) < 0.02,
    `${onSpider} on a blossom spider, ${onDrake} on an ember drake`);

  const wolf = spawnMonster('wolf', { x: 5, y: 0, z: 5 }, () => 0.5);
  check('a wolf is hostile', wolf.faction === 'hostile');
  check('its home is where it was put', wolf.ai.home.x === 5 && wolf.ai.home.z === 5);
  check('its aggro is 12 m and its leash 30 m', wolf.ai.aggro === 12 && wolf.ai.leash === 30, `${wolf.ai.aggro} / ${wolf.ai.leash}`);
  check('and it starts idle with no target', wolf.ai.state === 'idle' && wolf.ai.target === null);
  check('it comes at you from 11 m', aggroCheck(wolf, { x: 5, y: 0, z: 16 }) === true);
  check('and not from 13 m', aggroCheck(wolf, { x: 5, y: 0, z: 18 }) === false);

  const deer = spawnMonster('deer', { x: 0, y: 0, z: 0 }, () => 0.5);
  check('a deer is a critter and never aggros', deer.faction === 'critter' && aggroCheck(deer, { x: 0, y: 0, z: 0 }) === false);
  deer.health = deer.maxHealth - 1;
  check('but flees the moment it is hurt', fleeCheck(deer) === true);
  const skel = spawnMonster('skeleton', { x: 0, y: 0, z: 0 }, () => 0.5);
  skel.health = 1;
  check('and the undead never flee at all', fleeCheck(skel) === false, `${skel.health} of ${skel.maxHealth}`);
}

// ---- natural weapons --------------------------------------------------------
{
  check('a wolf bites with Wrestling', naturalWeaponFor(MONSTERS.wolf).skill === 'wrestling');
  check('a goblin scout throws knives with Marksmanship', naturalWeaponFor(MONSTERS.goblinScout).skill === 'marksmanship');
  check('and its attack is ranged, at 12 m', naturalWeaponFor(MONSTERS.goblinScout).ranged === true && naturalWeaponFor(MONSTERS.goblinScout).range === 12);
  check('a skeleton warrior swings a sword', naturalWeaponFor(MONSTERS.skeletonWarrior).skill === 'swordsmanship');
  check('a cultist casts', naturalWeaponFor(MONSTERS.cultist).skill === 'magery');
  const w = naturalWeaponFor(MONSTERS.wolf);
  check('the damage range is the row, unchanged', w.minDamage === 6 && w.maxDamage === 11, `${w.minDamage} to ${w.maxDamage}`);
  check('and the weapon weighs nothing, so a swing costs no stamina', w.weight === 0);
}

// ---- spawning what is not there --------------------------------------------
{
  let threw = null;
  try { spawnMonster('grue', { x: 0, y: 0, z: 0 }, () => 0.5); } catch (e) { threw = e; }
  check('spawning a monster that does not exist fails loudly', !!threw, threw ? threw.message : 'it did not throw');
  const a = spawnMonster('wolf', { x: 0, y: 0, z: 0 }, () => 0.5);
  const b = spawnMonster('wolf', { x: 0, y: 0, z: 0 }, () => 0.5);
  check('two wolves are two actors', a.id !== b.id, `${a.id} and ${b.id}`);
  check('and each carries the model slot W2 fills', a.model === null && 'model' in a);
}

// ---- a stack from state.js is not a weapon ----------------------------------
{
  check('a stack of logs is not a weapon', weaponFrom(makeStack('log', 5)) === null);
  check('and an axe is', weaponFrom(makeStack('axe', 1)).skill === 'swordsmanship');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
