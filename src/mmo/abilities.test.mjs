// Every ability and spell, driven both ways.
// Run: node src/mmo/abilities.test.mjs
//
// Every number printed here was measured in this file. Where a gate lets a
// case through, the case one point outside it is driven too. The ability
// tables in docs/mmo/04-CLASSES-ABILITIES.md are parsed and compared name for
// name, so drift in either direction fails.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ABILITIES, ABILITIES_BY_ID, ABILITY_COUNT, ABILITY_DOC_ROWS, GROUPS,
  KNOWN_SKILLS, SKILL_IDS, STAT_IDS, EFFECT_KINDS, COST_KINDS, TARGETS,
  WEAPON_SKILLS, MOVING_CASTS, MAX_MOVING_CAST,
  unlockedFor, meetsRequirements, canUse, startCast, interruptRule,
  interruptChance, lessonFor, spellDamage, manaCostFor, costKind,
  auditAbilities,
  WEAPON_BASES, SHIELD_BASES, INSTRUMENT_BASES, AMMO_BASES, WEAPON_WORDS,
  FOCUS_BASES, isSpell, isFocusItem, isChivalry, burdensInArmour,
  NEEDS_KINDS, weaponNeeds, weaponCheck, countInPack,
  COST_ITEM_BASES, costItemIds, itemsHeld, payingBase, ABILITY_FOR_ITEM,
  practiceChance, isPractice, practiceText, requirementSentence, requirementClauses,
} from './abilities.js';
import { BASES as ITEM_BASES, BASES, isFocus as itemIsFocus, FOCUS_BASES as ITEM_FOCUS_BASES } from './items.js';
import { SKILL_NAMES as OPENING_SKILL_NAMES, OPENINGS_BY_ID } from './openings.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, '..', '..', 'docs', 'mmo');
const classesDoc = readFileSync(join(docs, '04-CLASSES-ABILITIES.md'), 'utf8');
const skillsDoc = readFileSync(join(docs, '01-STATS-SKILLS.md'), 'utf8');

/** A fresh copy of the table, so a planted fault cannot break the module. */
const copy = () => ABILITIES.map((x) => ({
  ...x, cost: { ...x.cost }, effect: JSON.parse(JSON.stringify(x.effect)),
}));

// ---------------------------------------------------------------------------
console.log('\nThe document, counted and compared');
// ---------------------------------------------------------------------------

// Every "| ... |" row under a "### " heading after "## Abilities".
const abilitiesPart = classesDoc.split('## Abilities')[1].split('## Balance intent')[0];
const docNames = [];
const docByGroup = {};
let group = null;
for (const line of abilitiesPart.split('\n')) {
  const heading = line.match(/^### (.+)$/);
  if (heading) { group = heading[1].split(' (')[0].trim(); docByGroup[group] = []; continue; }
  if (!line.trim().startsWith('|') || !group) continue;
  const first = line.trim().slice(1).split('|')[0].trim();
  if (!first || first === 'ability' || first === 'spell' || first.startsWith('---')) continue;
  docNames.push(first);
  docByGroup[group].push(first);
}

check(`the document holds ${ABILITY_DOC_ROWS} ability rows`, docNames.length === ABILITY_DOC_ROWS,
  `${docNames.length} rows across ${Object.keys(docByGroup).length} tables`);
const distinct = new Set(docNames);
check(`and ${ABILITY_COUNT} distinct abilities, Bandage being written twice`,
  distinct.size === ABILITY_COUNT && docNames.filter((n) => n === 'Bandage').length === 2,
  `${distinct.size} distinct, Bandage appears ${docNames.filter((n) => n === 'Bandage').length} times`);
check('the table here holds exactly that many', ABILITIES.length === ABILITY_COUNT,
  `${ABILITIES.length} abilities`);

const ourNames = new Set(ABILITIES.map((x) => x.name));
const missing = [...distinct].filter((n) => !ourNames.has(n));
const extra = [...ourNames].filter((n) => !distinct.has(n));
check('every ability in the document is here', missing.length === 0, missing.join(', ') || 'none missing');
check('and nothing here is absent from the document', extra.length === 0, extra.join(', ') || 'none extra');

const perGroup = Object.entries(docByGroup)
  .map(([g, list]) => `${g} ${list.length}`).join(', ');
check('every table in the document has at least one row',
  Object.values(docByGroup).every((l) => l.length > 0), perGroup);

// Skill ids referenced here exist in 01-STATS-SKILLS.md.
const everySkillBlock = skillsDoc.split('### Every skill')[1].split('### Skill locks')[0];
const skillDocNames = everySkillBlock.split('\n')
  .filter((l) => l.trim().startsWith('|'))
  .map((l) => l.trim().slice(1, -1).split('|')[0].trim())
  .filter((n) => n && n !== 'skill' && !n.startsWith('---'));
const referenced = new Set();
for (const ability of ABILITIES) {
  if (ability.skill) referenced.add(ability.skill);
  if (ability.skillAny) for (const s of ability.skillAny) referenced.add(s);
  if (ability.anyOf) for (const b of ability.anyOf) for (const c of b.all) referenced.add(c.skill);
  if (ability.extraReq) {
    for (const k of Object.keys(ability.extraReq)) if (!STAT_IDS.includes(k)) referenced.add(k);
  }
}
const notInDoc = [...referenced].filter((id) => !skillDocNames.includes(KNOWN_SKILLS[id]));
check('every skill an ability gates on appears in 01-STATS-SKILLS.md', notInDoc.length === 0,
  notInDoc.join(', ') || `${referenced.size} of ${skillDocNames.length} skills used`);
check('the local skill mirror matches the one in openings.js',
  SKILL_IDS.length === Object.keys(OPENING_SKILL_NAMES).length
  && SKILL_IDS.every((id) => OPENING_SKILL_NAMES[id] === KNOWN_SKILLS[id]),
  `${SKILL_IDS.length} ids`);
check('and every one of those ids is in the document too',
  SKILL_IDS.every((id) => skillDocNames.includes(KNOWN_SKILLS[id])), `${SKILL_IDS.length} ids`);

check('six spells carry a short cast bar and travel: the table\'s moving column is the rule',
  MOVING_CASTS.length === 6
  && MOVING_CASTS.every((id) => ABILITIES_BY_ID[id].castTime > 0 && ABILITIES_BY_ID[id].castTime <= 0.8
    && ABILITIES_BY_ID[id].moving === true && ABILITIES_BY_ID[id].rooted === false),
  MOVING_CASTS.join(', '));
check('and every cast over a second roots, with none of the six among them',
  ABILITIES.filter((x) => x.castTime > MAX_MOVING_CAST).every((x) => x.rooted && !x.moving)
  && ABILITIES.filter((x) => x.castTime > MAX_MOVING_CAST).length > 0,
  `${ABILITIES.filter((x) => x.castTime > MAX_MOVING_CAST).map((x) => x.id).join(', ')}`);

// ---------------------------------------------------------------------------
console.log('\nThe audit, passed and failed');
// ---------------------------------------------------------------------------

check('auditAbilities passes the real table', auditAbilities() === true);

{
  const planted = copy();
  planted.push({ ...planted[0] }); // a second powerStrike
  let threw = '';
  try { auditAbilities(planted); } catch (e) { threw = e.message; }
  check('and fails on a planted duplicate id', threw.includes('duplicate ability id powerStrike'), threw);
}
{
  const planted = copy();
  const meteor = planted.find((x) => x.id === 'meteor');
  meteor.moving = true; // a 2.5 s cast marked moving
  let threw = '';
  try { auditAbilities(planted); } catch (e) { threw = e.message; }
  check('and fails on a long cast marked moving',
    threw.includes('meteor') && threw.includes('a long cast roots you'), threw);
}
{
  const planted = copy();
  planted.find((x) => x.id === 'rend').cost = { stamina: 20, mana: 5 };
  let threw = '';
  try { auditAbilities(planted); } catch (e) { threw = e.message; }
  check('and fails on two cost kinds at once', threw.includes('2 cost kinds'), threw);
}
{
  const planted = copy();
  planted.find((x) => x.id === 'rend').cost = { coins: 20 };
  let threw = '';
  try { auditAbilities(planted); } catch (e) { threw = e.message; }
  check('and fails on a cost that is none of the three kinds', threw.includes('0 cost kinds'), threw);
}
{
  const planted = copy();
  planted.find((x) => x.id === 'lunge').skill = 'jousting';
  let threw = '';
  try { auditAbilities(planted); } catch (e) { threw = e.message; }
  check('and fails on a skill that is not in the local list', threw.includes('unknown skill jousting'), threw);
}
{
  const planted = copy();
  planted.find((x) => x.id === 'lightning').effect = { kind: 'lightningBolt' };
  let threw = '';
  try { auditAbilities(planted); } catch (e) { threw = e.message; }
  check('and fails on an effect kind it does not define', threw.includes('unknown effect kind lightningBolt'), threw);
}
{
  const planted = copy().filter((x) => x.id !== 'jump');
  let threw = '';
  try { auditAbilities(planted); } catch (e) { threw = e.message; }
  check('and fails when the count no longer matches the document',
    threw.includes('77 abilities'), threw);
}
check('the real table still audits after every broken copy', auditAbilities() === true);

{
  // Both directions on the effect kinds: the real table uses all of them, and
  // a table that leaves one declared but unused is refused.
  const planted = copy().filter((x) => x.id !== 'resurrect');
  let threw = '';
  try { auditAbilities(planted); } catch (e) { threw = e.message; }
  check(`all ${EFFECT_KINDS.length} declared effect kinds are used, and a kind left unused throws`,
    auditAbilities() === true && threw.includes('resurrect is declared and never used'), threw);
}
check('every cost is one of the three kinds',
  ABILITIES.every((x) => COST_KINDS.includes(costKind(x))),
  COST_KINDS.map((k) => `${k} ${ABILITIES.filter((x) => costKind(x) === k).length}`).join(', '));
check('every target is one of the five',
  ABILITIES.every((x) => TARGETS.includes(x.target)),
  TARGETS.map((t) => `${t} ${ABILITIES.filter((x) => x.target === t).length}`).join(', '));
check('every group in the document has abilities here',
  GROUPS.every((g) => ABILITIES.some((x) => x.group === g)),
  GROUPS.map((g) => `${g} ${ABILITIES.filter((x) => x.group === g).length}`).join(', '));

// ---------------------------------------------------------------------------
console.log('\nunlockedFor, above and below every gate');
// ---------------------------------------------------------------------------

const ids = (list) => new Set(list.map((x) => x.id));

{
  // A character who has only just picked up a sword.
  const green = { swordsmanship: 30 };
  const has = ids(unlockedFor(green, {}));
  check('Swordsmanship 30 alone gives Power Strike', has.has('powerStrike'));
  check('and not Whirlwind, which also wants Tactics 40', !has.has('whirlwind'));
  const below = ids(unlockedFor({ swordsmanship: 29 }, {}));
  check('and Swordsmanship 29 gives neither', !below.has('powerStrike') && !below.has('whirlwind'));
}
{
  const at = ids(unlockedFor({ swordsmanship: 50, tactics: 40 }, {}));
  check('Swordsmanship 50 with Tactics 40 gives Whirlwind', at.has('whirlwind'));
  const under = ids(unlockedFor({ swordsmanship: 50, tactics: 39 }, {}));
  check('and Tactics 39 does not', !under.has('whirlwind'));
  const lowSword = ids(unlockedFor({ swordsmanship: 49, tactics: 40 }, {}));
  check('and Swordsmanship 49 does not either', !lowSword.has('whirlwind'));
  const mace = ids(unlockedFor({ macefighting: 50, tactics: 40 }, {}));
  check('any weapon skill counts: Macefighting 50 and Tactics 40 gives it too', mace.has('whirlwind'),
    `weapon skills: ${WEAPON_SKILLS.join(', ')}`);
}
{
  // The Warrior opening as written. Tactics is 50, so it does get Whirlwind.
  const w = OPENINGS_BY_ID.warrior;
  const has = ids(unlockedFor(w.skills, w.stats));
  check('the Warrior opening as written does get Whirlwind, since its Tactics is 50',
    has.has('whirlwind') && w.skills.tactics === 50,
    `Swordsmanship ${w.skills.swordsmanship}, Tactics ${w.skills.tactics}`);
  check('and gets Power Strike, Rend and Shield Bash',
    has.has('powerStrike') && has.has('rend') && has.has('shieldBash'));
  check('and not Battle Cry, which wants Tactics 60', !has.has('battleCry'));
  check('and not Leap Slam, which wants a weapon skill 60', !has.has('leapSlam'));
  check('and never a mage spell above Magic Arrow',
    !has.has('fireball') && has.has('magicArrow'),
    'Magic Arrow is Magery 0, so everyone has it');
}
{
  // Extra requirements that are stats, not skills.
  const skilled = { swordsmanship: 60 };
  check('Leap Slam needs STR 50: 49 refuses',
    !meetsRequirements(ABILITIES_BY_ID.leapSlam, skilled, { str: 49 }).ok,
    meetsRequirements(ABILITIES_BY_ID.leapSlam, skilled, { str: 49 }).reason);
  check('and 50 allows', meetsRequirements(ABILITIES_BY_ID.leapSlam, skilled, { str: 50 }).ok);
  check('Berserk needs Tactics 80 and CON 60: CON 59 refuses',
    !meetsRequirements(ABILITIES_BY_ID.berserk, { tactics: 80 }, { con: 59 }).ok);
  check('and CON 60 allows', meetsRequirements(ABILITIES_BY_ID.berserk, { tactics: 80 }, { con: 60 }).ok);
}
{
  // The two rows with an "or" in them.
  const snare = ABILITIES_BY_ID.snare;
  check('Snare comes from Tinkering 30', meetsRequirements(snare, { tinkering: 30 }).ok);
  check('or from Tracking 60', meetsRequirements(snare, { tracking: 60 }).ok);
  check('and not from Tracking 59 with no Tinkering', !meetsRequirements(snare, { tracking: 59 }).ok);
  check('and not from Tinkering 29', !meetsRequirements(snare, { tinkering: 29 }).ok);

  const res = ABILITIES_BY_ID.resurrect;
  check('Resurrect comes from Healing 80 and Anatomy 80',
    meetsRequirements(res, { healing: 80, anatomy: 80 }).ok);
  check('and not from Healing 80 with Anatomy 79',
    !meetsRequirements(res, { healing: 80, anatomy: 79 }).ok);
  check('or from Chivalry 85 on its own', meetsRequirements(res, { chivalry: 85 }).ok);
  check('and not Chivalry 84', !meetsRequirements(res, { chivalry: 84 }).ok);
}
{
  const nobody = unlockedFor({}, {});
  check('a character with nothing at all still gets Jump, Sprint, Bandage, Meditate and Magic Arrow',
    ['jump', 'sprint', 'bandage', 'meditate', 'magicArrow', 'hide'].every((id) => ids(nobody).has(id)),
    `${nobody.length} abilities: ${nobody.map((x) => x.name).join(', ')}`);
  // Camp is one of the thirteen first rungs held open at 0 so its school can
  // be started at all (see skill_paths.js). It is HELD, not GIVEN: below
  // Camping 20 it mostly fumbles, and this is the pair of numbers that says so.
  check('and Camp too, because Camping has no other door', ids(nobody).has('camp'));
  check('but at Camping 0 it lands 5 times in 100',
    practiceChance(ABILITIES_BY_ID.camp, {}) === 0.05, String(practiceChance(ABILITIES_BY_ID.camp, {})));
  check('and at Camping 20, its own mark, it always lands',
    practiceChance(ABILITIES_BY_ID.camp, { camping: 20 }) === 1);
  check('a row that was never held open never rolls: Meteor at Magery 85 or nothing',
    practiceChance(ABILITIES_BY_ID.meteor, {}) === 1 && !ids(nobody).has('meteor'));
}
{
  const all = {};
  for (const id of SKILL_IDS) all[id] = 100;
  const stats = { str: 100, dex: 100, int: 100, con: 100, wis: 100 };
  check('a grandmaster of everything unlocks all 78',
    unlockedFor(all, stats).length === ABILITY_COUNT, `${unlockedFor(all, stats).length} of ${ABILITY_COUNT}`);
}

// ---------------------------------------------------------------------------
console.log('\ncanUse, refused and allowed');
// ---------------------------------------------------------------------------

const warriorish = () => ({
  skills: { swordsmanship: 60, tactics: 50, parrying: 40, magery: 70, focus: 0 },
  stats: { str: 60, dex: 50, int: 50, con: 60, wis: 50 },
  stamina: 100, mana: 100, health: 100, maxHealth: 200,
  items: { bandage: 3 }, cooldowns: {}, moving: false, hasShield: true,
});

{
  const c = warriorish();
  const ps = ABILITIES_BY_ID.powerStrike;
  const first = canUse(ps, c, 0);
  check('Power Strike is usable at time 0', first.ok === true, first.reason || '');

  // Six second cooldown, so it comes back at 6.
  const rec = startCast(ps, c, 0);
  check('startCast returns a cooldownUntil of 6 s', rec.cooldownUntil === 6, `${rec.cooldownUntil}`);
  c.cooldowns.powerStrike = rec.cooldownUntil;

  const at0 = canUse(ps, c, 0);
  const at5_9 = canUse(ps, c, 5.9);
  const at6 = canUse(ps, c, 6);
  check('and it is refused at 0 and at 5.9 s, then allowed at 6 s',
    !at0.ok && !at5_9.ok && at6.ok, `${at5_9.reason} / ${at6.ok ? 'allowed at 6' : at6.reason}`);
}
{
  const c = warriorish();
  c.stamina = 14; // Power Strike costs 15
  const poor = canUse(ABILITIES_BY_ID.powerStrike, c, 0);
  c.stamina = 15;
  const rich = canUse(ABILITIES_BY_ID.powerStrike, c, 0);
  check('15 stamina is refused at 14 and allowed at 15', !poor.ok && rich.ok, poor.reason);
}
{
  const c = warriorish();
  c.mana = 8; // Fireball costs 9
  const poor = canUse(ABILITIES_BY_ID.fireball, c, 0);
  c.mana = 9;
  const rich = canUse(ABILITIES_BY_ID.fireball, c, 0);
  check('9 mana is refused at 8 and allowed at 9', !poor.ok && rich.ok, poor.reason);
  c.mana = 8; c.lowerManaCost = 0.2;
  const cheaper = canUse(ABILITIES_BY_ID.fireball, c, 0);
  check('and lowerManaCost 20% brings it to 7.2, which 8 mana pays',
    cheaper.ok && near(manaCostFor(ABILITIES_BY_ID.fireball, c), 7.2),
    `${manaCostFor(ABILITIES_BY_ID.fireball, c)} mana`);
}
{
  const c = warriorish();
  c.items = { bandage: 0 };
  const none = canUse(ABILITIES_BY_ID.bandage, c, 0);
  c.items = { bandage: 1 };
  const one = canUse(ABILITIES_BY_ID.bandage, c, 0);
  check('Bandage is refused with none in the pack and allowed with one', !none.ok && one.ok, none.reason);
}
{
  const c = warriorish();
  c.moving = true;
  const rooted = canUse(ABILITIES_BY_ID.chainLightning, c, 0);   // 1.2 s cast, no
  const free = canUse(ABILITIES_BY_ID.lightning, c, 0);          // 0 s cast, moving
  const small = canUse(ABILITIES_BY_ID.fireball, c, 0);          // 0.6 s cast, yes
  check('a rooted spell is refused while moving and a moving one is allowed',
    !rooted.ok && free.ok, `${rooted.reason}; Lightning ${free.ok ? 'allowed' : free.reason}`);
  check('and a small spell with a cast bar is cast on the run', small.ok, small.reason);
  c.moving = false;
  check('and the rooted one is allowed once you stop', canUse(ABILITIES_BY_ID.chainLightning, c, 0).ok);
  c.moving = true;
  check('Meditate has no cast bar and is still refused while moving',
    !canUse(ABILITIES_BY_ID.meditate, c, 0).ok, canUse(ABILITIES_BY_ID.meditate, c, 0).reason);
}
{
  const c = warriorish();
  c.hasShield = false;
  const bare = canUse(ABILITIES_BY_ID.shieldBash, c, 0);
  c.hasShield = true;
  const armed = canUse(ABILITIES_BY_ID.shieldBash, c, 0);
  check('Shield Bash is refused with no shield and allowed with one', !bare.ok && armed.ok, bare.reason);
}
{
  const c = warriorish();
  c.skills.parrying = 70;
  const p = canUse(ABILITIES_BY_ID.riposte, c, 0);
  check('a passive is never "used"', !p.ok && p.reason.includes('always on'), p.reason);
}
{
  const c = warriorish();
  c.skills.swordsmanship = 20;
  const r = canUse(ABILITIES_BY_ID.powerStrike, c, 0);
  check('an ability you have not unlocked is refused for that reason first, in the same words the card shows',
    !r.ok && r.reason === 'Power Strike needs Swordsmanship 30, you are at 20', r.reason);
}
{
  // Lich Form pays in health, not mana.
  const c = warriorish();
  c.skills.necromancy = 50; c.mana = 0; c.health = 100; c.form = 'lich';
  const asLich = canUse(ABILITIES_BY_ID.lifeDrain, c, 0);
  c.form = undefined;
  const asSelf = canUse(ABILITIES_BY_ID.lifeDrain, c, 0);
  check('in lich form a spell is paid in health, so zero mana still casts',
    asLich.ok && !asSelf.ok, asSelf.reason);
}
{
  const c = warriorish();
  const rec = startCast(ABILITIES_BY_ID.fireball, c, 12);
  check('startCast records the window and the cost',
    rec.startedAt === 12 && near(rec.endsAt, 12.6) && rec.rooted === false
    && rec.cost.kind === 'mana' && rec.cost.amount === 9,
    `${rec.startedAt} to ${rec.endsAt}, ${rec.cost.amount} ${rec.cost.kind}`);
  c.mana = 0;
  const refused = startCast(ABILITIES_BY_ID.fireball, c, 12);
  check('and refuses rather than returning a record when canUse says no',
    !!refused.error && !refused.abilityId, refused.error);
}

// ---------------------------------------------------------------------------
console.log('\nInterrupts');
// ---------------------------------------------------------------------------

{
  const c = warriorish();
  c.maxHealth = 200;
  const rec = startCast(ABILITIES_BY_ID.chainLightning, c, 0); // 1.2 s cast
  check('the cast record under test is a rooted one', rec.rooted === true && !rec.error,
    rec.error || `Chain Lightning casts for ${rec.castTime} s`);
  const over = interruptRule(rec, { type: 'damage', amount: 21, roll: 0 });  // 10.5%
  const under = interruptRule(rec, { type: 'damage', amount: 19, roll: 0 }); // 9.5%
  const exactly = interruptRule(rec, { type: 'damage', amount: 20, roll: 0 }); // 10.0%
  check('damage over 10% of max health interrupts, 9.5% does not',
    over.interrupted && !under.interrupted,
    `21 of 200 ${over.interrupted ? 'broke' : 'held'}, 19 of 200 ${under.interrupted ? 'broke' : 'held'}`);
  check('and exactly 10% does not, the rule says "over"', !exactly.interrupted, exactly.reason);
}
{
  const c = warriorish();
  const rec = startCast(ABILITIES_BY_ID.chainLightning, c, 0);
  const moved = interruptRule(rec, { type: 'move' });
  check('moving ends a rooted cast outright', moved.interrupted && moved.chance === 1, moved.reason);

  const instant = startCast(ABILITIES_BY_ID.lightning, c, 0); // castTime 0
  const movedFree = interruptRule(instant, { type: 'move' });
  const hitFree = interruptRule(instant, { type: 'damage', amount: 999, roll: 0 });
  check('and an instant spell cannot be interrupted by either',
    !movedFree.interrupted && !hitFree.interrupted, movedFree.reason);
}
{
  // Focus lowers the chance, and monotonically over the whole range.
  const points = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const chances = points.map((f) => interruptChance(f));
  let monotone = true;
  for (let i = 1; i < chances.length; i++) if (!(chances[i] < chances[i - 1])) monotone = false;
  check('interruptChance falls with every ten points of Focus', monotone,
    points.map((f, i) => `${f}:${chances[i].toFixed(2)}`).join(' '));
  check('and is 1.00 at Focus 0 and 0.20 at Focus 100',
    near(chances[0], 1) && near(chances[10], 0.2));

  // Seeded, so the counts are reproducible: a small LCG, same stream each time.
  const run = (focus) => {
    let s = 20260904;
    const c = warriorish();
    c.skills = { ...c.skills, focus };
    const rec = startCast(ABILITIES_BY_ID.chainLightning, c, 0);
    let broken = 0;
    for (let i = 0; i < 2000; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const roll = s / 0x7fffffff;
      if (interruptRule(rec, { type: 'damage', amount: 40, roll }).interrupted) broken++;
    }
    return broken;
  };
  const counts = [0, 25, 50, 75, 100].map(run);
  let falling = true;
  for (let i = 1; i < counts.length; i++) if (!(counts[i] < counts[i - 1])) falling = false;
  check('and over 2000 seeded rolls the interrupts fall with Focus', falling,
    [0, 25, 50, 75, 100].map((f, i) => `Focus ${f}: ${counts[i]}`).join(', '));
  check('the same seed gives the same counts twice', run(50) === counts[2], `${run(50)} both times`);
}
{
  const c = warriorish();
  const rec = startCast(ABILITIES_BY_ID.chainLightning, c, 0);
  const noRoll = interruptRule(rec, { type: 'damage', amount: 100 });
  check('with no roll supplied only a certain interrupt fires',
    noRoll.interrupted === false && noRoll.chance === 1,
    `Focus 0 gives chance ${noRoll.chance}, and 1 < 1 is false`);
  const rolled = interruptRule(rec, { type: 'damage', amount: 100, roll: 0.99 });
  check('and a roll of 0.99 against a chance of 1 does fire', rolled.interrupted, rolled.reason);
}

// ---------------------------------------------------------------------------
console.log('\nLessons and spell damage');
// ---------------------------------------------------------------------------

{
  const l = lessonFor(ABILITIES_BY_ID.powerStrike);
  check('a lesson is the ability minSkill plus 20', l.difficulty === 50 && l.skill === 'swordsmanship',
    `Power Strike: ${l.skill} at ${l.difficulty}`);
  check('and carries the other weapon skills, since the lesson follows the swing',
    l.skillAny && l.skillAny.length === 4, l.skillAny.join(', '));
  const bad = ABILITIES.filter((x) => lessonFor(x).difficulty !== x.minSkill + 20);
  check('every ability agrees', bad.length === 0, `${ABILITIES.length} checked`);
  const meteorLesson = lessonFor(ABILITIES_BY_ID.meteor);
  check('Meteor at Magery 85 is a lesson at 105, which no skill reaches',
    meteorLesson.difficulty === 105, 'the gain curve caps the chance, not the difficulty');
}
{
  // base * (1 + INT * 0.008 + EvalInt * 0.006 + spellDamage%)
  const caster = { stats: { int: 70 }, skills: { evaluatingIntelligence: 45 } };
  const mult = 1 + 70 * 0.008 + 45 * 0.006;
  const d = spellDamage(ABILITIES_BY_ID.fireball, caster);
  check('Fireball at INT 70 and EvalInt 45 multiplies by 1.83',
    near(d.mult, mult) && near(d.mult, 1.83), `${d.mult}`);
  check('and 18 to 26 becomes 32.94 to 47.58, to 1e-9',
    near(d.min, 18 * mult) && near(d.max, 26 * mult)
    && near(d.min, 32.94) && near(d.max, 47.58),
    `${d.min} to ${d.max}`);
  check('and the type comes through', d.type === 'fire', d.type);

  const withAffix = spellDamage(ABILITIES_BY_ID.fireball, { ...caster, spellDamage: 0.3 });
  check('a 30% spell damage affix adds exactly 0.3 to the multiplier',
    near(withAffix.mult, mult + 0.3), `${withAffix.mult}`);
  const bare = spellDamage(ABILITIES_BY_ID.fireball, {});
  check('and a caster with no INT and no Evaluating Intelligence multiplies by 1',
    near(bare.mult, 1) && near(bare.min, 18), `${bare.min} to ${bare.max}`);
}
{
  check('spell damage is found inside a combo', spellDamage(ABILITIES_BY_ID.iceShard, {}) !== null);
  check('and inside an aoe', spellDamage(ABILITIES_BY_ID.meteor, {}) !== null,
    `Meteor ${spellDamage(ABILITIES_BY_ID.meteor, {}).min} to ${spellDamage(ABILITIES_BY_ID.meteor, {}).max}`);
  check('and is null for an ability that deals none',
    spellDamage(ABILITIES_BY_ID.blink, {}) === null && spellDamage(ABILITIES_BY_ID.bless, {}) === null);
}

// ---------------------------------------------------------------------------
console.log('\nWhat has to be in your hands');
// ---------------------------------------------------------------------------

// The mirror against the real item tables, both directions. abilities.js may
// not import items.js (it is the pure, importless layer), so this is the guard
// that stops the two drifting.
{
  const realWeapons = Object.values(ITEM_BASES).filter((b) => b.kind === 'weapon');
  const missingHere = realWeapons.filter((b) => !WEAPON_BASES[b.id]).map((b) => b.id);
  check('every weapon base in items.js is in the mirror', missingHere.length === 0,
    missingHere.join(', ') || `${realWeapons.length} weapons`);
  const notThere = Object.keys(WEAPON_BASES).filter((id) => !ITEM_BASES[id]).map((id) => id);
  check('and every id in the mirror is a real base', notThere.length === 0,
    notThere.join(', ') || `${Object.keys(WEAPON_BASES).length} ids`);
  const wrong = realWeapons.filter((b) => {
    const m = WEAPON_BASES[b.id];
    return !m || m.skill !== b.skill || m.hands !== b.hands || m.ranged !== (b.range != null) || m.name !== b.name;
  }).map((b) => b.id);
  check('and every row agrees on name, skill, hands and whether it shoots',
    wrong.length === 0, wrong.join(', ') || `${realWeapons.length} rows compared`);

  const realShields = Object.values(ITEM_BASES).filter((b) => b.kind === 'shield').map((b) => b.id);
  check('the three shields match items.js',
    realShields.length === SHIELD_BASES.length && realShields.every((id) => SHIELD_BASES.includes(id)),
    SHIELD_BASES.join(', '));
  const realInstruments = Object.values(ITEM_BASES).filter((b) => b.kinds.includes('instrument')).map((b) => b.id);
  check('and the instruments do too',
    realInstruments.length === INSTRUMENT_BASES.length && realInstruments.every((id) => INSTRUMENT_BASES.includes(id)),
    INSTRUMENT_BASES.join(', '));
  check('and both ammunition bases are real stacking items',
    AMMO_BASES.every((id) => ITEM_BASES[id] && ITEM_BASES[id].stack), AMMO_BASES.join(', '));

  // The foci, both ways against items.js. A base tagged `focus` there and not
  // listed here would be a wand no spell would go through; an id listed here
  // and not tagged there would be a sword every spell went through.
  const missingFoci = ITEM_FOCUS_BASES.filter((id) => !FOCUS_BASES.includes(id));
  const extraFoci = FOCUS_BASES.filter((id) => !ITEM_FOCUS_BASES.includes(id));
  check('every focus base in items.js is in the mirror', missingFoci.length === 0,
    missingFoci.join(', ') || ITEM_FOCUS_BASES.join(', '));
  check('and the mirror invents none', extraFoci.length === 0, extraFoci.join(', ') || `${FOCUS_BASES.length} ids`);
  check('a focus is held in the main hand and comes in one hand and in two',
    FOCUS_BASES.every((id) => ITEM_BASES[id].slot === 'mainHand')
    && FOCUS_BASES.some((id) => ITEM_BASES[id].hands === 1)
    && FOCUS_BASES.some((id) => ITEM_BASES[id].hands === 2),
    FOCUS_BASES.map((id) => `${id} ${ITEM_BASES[id].hands}h`).join(', '));
  check('the quarterstaff is a Macefighting stick and not a focus',
    itemIsFocus('quarterstaff') === false && !FOCUS_BASES.includes('quarterstaff')
    && WEAPON_BASES.quarterstaff.skill === 'macefighting');
  check('and isFocusItem reads an item record, a base record and a bare id',
    isFocusItem({ base: 'wand' }) === true && isFocusItem(ITEM_BASES.staff) === true
    && isFocusItem('bone_staff') === true && isFocusItem('longsword') === false
    && isFocusItem(null) === false);

  // A refusal must name the thing it wants. Every weapon is named by its own
  // skill's phrase, so adding a weapon nobody mentions fails here.
  const unnamed = Object.entries(WEAPON_BASES).filter(([, w]) => {
    const words = WEAPON_WORDS[w.skill] || '';
    return !w.name.toLowerCase().split(' ').some((part) => words.includes(part.replace(/^(short|long|great|battle|war|quarter|bone)/, '')));
  }).map(([id]) => id);
  check('every weapon is named by the words its skill refuses in', unnamed.length === 0,
    unnamed.join(', ') || Object.values(WEAPON_WORDS).join(' / '));
}

// The table of kinds, counted.
{
  const by = {};
  for (const ability of ABILITIES) {
    const kind = weaponNeeds(ability).kind;
    (by[kind] = by[kind] || []).push(ability.id);
  }
  let total = 0;
  console.log('  kind        n  abilities');
  for (const kind of NEEDS_KINDS) {
    const list = by[kind] || [];
    total += list.length;
    const shown = list.length > 8 ? `${list.slice(0, 8).join(' ')} and ${list.length - 8} more` : list.join(' ');
    console.log(`  ${kind.padEnd(11)}${String(list.length).padStart(2)}  ${shown}`);
  }
  check(`the eight kinds account for all ${ABILITY_COUNT} abilities`, total === ABILITY_COUNT, `${total} counted`);
  check('and every kind is used by at least one of them',
    NEEDS_KINDS.every((k) => (by[k] || []).length > 0),
    NEEDS_KINDS.map((k) => `${k} ${(by[k] || []).length}`).join(', '));
  check('a passive that needs a shield says so', weaponNeeds(ABILITIES_BY_ID.riposte).kind === 'shield');
  check('and Disengage, which fires nothing, needs nothing',
    weaponNeeds(ABILITIES_BY_ID.disengage).kind === 'none', 'it is a leap and a run, not a shot');
}

// countInPack takes all three shapes it is handed.
{
  check('a pack of item records counts a stack',
    countInPack({ slots: 20, items: [null, { base: 'arrow', count: 60 }] }, 'arrow') === 60);
  check('a bare array counts too, and an unstacked item counts one',
    countInPack([{ base: 'arrow', count: 12 }, { base: 'arrow' }], 'arrow') === 13);
  check('and a plain count map counts', countInPack({ arrow: 5 }, 'arrow') === 5);
  check('and nothing at all is none',
    countInPack(null, 'arrow') === 0 && countInPack({ slots: 20, items: [] }, 'arrow') === 0);
}

// Every kind, driven both ways, through weaponCheck itself.
const doll = (o = {}) => ({ mainHand: null, offHand: null, ranged: null, ...o });
const it = (base, count) => (count == null ? { base } : { base, count });
const arrows = { slots: 20, items: [it('arrow', 60)] };
const bolts = { slots: 20, items: [it('bolt', 40)] };
const emptyPack = { slots: 20, items: [] };

{
  const ps = ABILITIES_BY_ID.powerStrike;   // anyMelee: the row unlocks on any weapon skill
  const sword = weaponCheck(ps, doll({ mainHand: it('longsword') }), emptyPack);
  const mace = weaponCheck(ps, doll({ mainHand: it('mace') }), emptyPack);
  const bare = weaponCheck(ps, doll(), emptyPack);
  const bow = weaponCheck(ps, doll({ ranged: it('shortbow') }), arrows);
  check('a longsword in hand allows Power Strike', sword.ok === true, sword.reason || 'allowed');
  check('and so does a mace, because the row unlocks on any weapon skill 30',
    mace.ok === true, 'anyMelee, not swordsmanship: see G2.md');
  check('empty hands refuse it, in words', bare.ok === false && /wants a weapon in your hand/.test(bare.reason), bare.reason);
  check('and a bow on your back is not a weapon in your hand',
    bow.ok === false && /hands are empty/.test(bow.reason), bow.reason);
}
{
  const rend = ABILITIES_BY_ID.rend;        // melee, Swordsmanship only
  const sword = weaponCheck(rend, doll({ mainHand: it('longsword') }));
  const axe = weaponCheck(rend, doll({ mainHand: it('battleaxe') }));
  const mace = weaponCheck(rend, doll({ mainHand: it('mace') }));
  const fists = weaponCheck(rend, doll({ mainHand: it('fists') }));
  check('a longsword allows Rend, and so does a battleaxe, which trains the same skill',
    sword.ok && axe.ok, 'swordsmanship');
  check('a mace refuses it with the sword reason',
    mace.ok === false && /Rend wants a sword or an axe in your hand/.test(mace.reason), mace.reason);
  check('and fists refuse it, since fists are empty hands',
    fists.ok === false && /hands are empty/.test(fists.reason), fists.reason);
  const lunge = weaponCheck(ABILITIES_BY_ID.lunge, doll({ mainHand: it('longsword') }));
  check('and Lunge, which is Fencing, refuses the longsword the other way round',
    lunge.ok === false && /a dagger, a rapier or a spear/.test(lunge.reason), lunge.reason);
}
{
  const disarm = ABILITIES_BY_ID.disarm;    // unarmed
  const bare = weaponCheck(disarm, doll());
  const fists = weaponCheck(disarm, doll({ mainHand: it('fists') }));
  const armed = weaponCheck(disarm, doll({ mainHand: it('longsword') }));
  const shielded = weaponCheck(disarm, doll({ offHand: it('kite') }));
  check('Wrestling wants empty hands, and empty hands allow Disarm', bare.ok === true, bare.reason || 'allowed');
  check('and so do fists, which are what empty hands swing with', fists.ok === true, fists.reason || 'allowed');
  check('a longsword refuses it', armed.ok === false && /wants empty hands/.test(armed.reason), armed.reason);
  check('and a shield is not a weapon, so it does not stop a wrestler', shielded.ok === true, shielded.reason || 'allowed');
}
{
  const ds = ABILITIES_BY_ID.doubleShot;    // ranged, archery, arrows
  const good = weaponCheck(ds, doll({ ranged: it('shortbow') }), arrows);
  const noAmmo = weaponCheck(ds, doll({ ranged: it('longbow') }), emptyPack);
  const noBow = weaponCheck(ds, doll(), arrows);
  const wrongBow = weaponCheck(ds, doll({ ranged: it('crossbow') }), arrows);
  const blocked = weaponCheck(ds, doll({ mainHand: it('longsword'), ranged: it('shortbow') }), arrows);
  check('a bow allows Double Shot only with arrows', good.ok === true, good.reason || 'allowed');
  check('the same bow with an empty pack refuses it',
    noAmmo.ok === false && /wants a bow drawn and arrows in the pack/.test(noAmmo.reason), noAmmo.reason);
  check('arrows with no bow refuse it too',
    noBow.ok === false && /ranged slot is empty/.test(noBow.reason), noBow.reason);
  check('and a crossbow is the wrong thing to draw for an archery ability',
    wrongBow.ok === false && /wrong thing to shoot with/.test(wrongBow.reason), wrongBow.reason);
  check('a sword in the main hand keeps the bow on your back, so the shot is refused',
    blocked.ok === false && /is in your hand instead/.test(blocked.reason), blocked.reason);
}
{
  const cs = ABILITIES_BY_ID.cripplingShot; // ranged, marksmanship, bolts
  const good = weaponCheck(cs, doll({ ranged: it('crossbow') }), bolts);
  const noBolts = weaponCheck(cs, doll({ ranged: it('crossbow') }), arrows);
  const knives = weaponCheck(cs, doll({ ranged: it('throwing_knives') }), emptyPack);
  check('a crossbow with bolts allows Crippling Shot', good.ok === true, good.reason || 'allowed');
  check('and a quiver of arrows is no use to it',
    noBolts.ok === false && /bolts in the pack/.test(noBolts.reason), noBolts.reason);
  check('throwing knives are their own ammunition and need no pack at all',
    knives.ok === true, knives.reason || 'allowed');
}
{
  const sb = ABILITIES_BY_ID.shieldBash;    // shield
  const buckler = weaponCheck(sb, doll({ mainHand: it('longsword'), offHand: it('buckler') }));
  const none = weaponCheck(sb, doll({ mainHand: it('longsword') }));
  const torch = weaponCheck(sb, doll({ offHand: it('torch') }));
  check('the buckler allows Shield Bash', buckler.ok === true, buckler.reason || 'allowed');
  check('and its absence refuses it',
    none.ok === false && /wants a shield on your arm/.test(none.reason), none.reason);
  check('a torch in that hand is not a shield', torch.ok === false, torch.reason);
  check('every shield in the tables answers for it',
    SHIELD_BASES.every((id) => weaponCheck(sb, doll({ offHand: it(id) })).ok), SHIELD_BASES.join(', '));
}
{
  const provoke = ABILITIES_BY_ID.provoke;  // instrument
  const lute = weaponCheck(provoke, doll({ mainHand: it('rapier'), offHand: it('lute') }));
  const none = weaponCheck(provoke, doll({ mainHand: it('rapier'), offHand: it('buckler') }));
  check('the bard\'s lute allows Provoke, rapier and all', lute.ok === true, lute.reason || 'allowed');
  check('and a shield where the lute was refuses it',
    none.ok === false && /wants a lute in your hands/.test(none.reason), none.reason);
  check('all six bard abilities want the same lute',
    ABILITIES.filter((x) => x.group === 'bard').every((x) => weaponNeeds(x).kind === 'instrument'),
    `${ABILITIES.filter((x) => x.group === 'bard').length} of them`);
}
{
  // The casting rule, driven true and false on six spells and four things that
  // are not spells. The user's line was "spells cannot be cast while a sword is
  // equipped for example", so the sword is the case that must refuse.
  const SIX = ['fireball', 'magicArrow', 'lifeDrain', 'hex', 'heal', 'raiseSkeleton'];
  const NOT_SPELLS = ['powerStrike', 'bandage', 'meditate', 'jump', 'aimedShot', 'provoke'];

  const withWand = SIX.map((id) => weaponCheck(ABILITIES_BY_ID[id], doll({ mainHand: it('wand') }), emptyPack));
  const withStaff = SIX.map((id) => weaponCheck(ABILITIES_BY_ID[id], doll({ mainHand: it('staff') }), emptyPack));
  const withBone = SIX.map((id) => weaponCheck(ABILITIES_BY_ID[id], doll({ mainHand: it('bone_staff') }), emptyPack));
  const withSword = SIX.map((id) => weaponCheck(ABILITIES_BY_ID[id], doll({ mainHand: it('longsword') }), emptyPack));
  const bareHanded = SIX.map((id) => weaponCheck(ABILITIES_BY_ID[id], doll(), emptyPack));
  const withStick = SIX.map((id) => weaponCheck(ABILITIES_BY_ID[id], doll({ mainHand: it('quarterstaff') }), emptyPack));

  check(`all ${SIX.length} spells cast with a wand`, withWand.every((r) => r.ok),
    withWand.find((r) => !r.ok)?.reason || SIX.join(', '));
  check('and with a staff', withStaff.every((r) => r.ok), withStaff.find((r) => !r.ok)?.reason || 'all six');
  check('and with the necromancer\'s bone staff', withBone.every((r) => r.ok),
    withBone.find((r) => !r.ok)?.reason || 'all six');
  check('not one of them casts with a longsword in the hand', withSword.every((r) => !r.ok),
    withSword[0].reason);
  check('nor bare handed', bareHanded.every((r) => !r.ok), bareHanded[0].reason);
  check('nor on a quarterstaff, which is a Macefighting stick', withStick.every((r) => !r.ok),
    withStick[0].reason);
  check('the refusal names the ability, what it wants and what is in the hand',
    /^Fireball wants a wand or a staff in your hand, and you are holding a Longsword\.$/.test(withSword[0].reason),
    withSword[0].reason);
  check('and says the hand is empty when it is',
    /and your hands are empty\.$/.test(bareHanded[0].reason), bareHanded[0].reason);

  // The other direction: four abilities that are not spells care nothing for a
  // focus, and the two that want a weapon refuse the wand instead.
  const nonSpellKinds = NOT_SPELLS.map((id) => weaponNeeds(ABILITIES_BY_ID[id]).kind);
  check(`none of the ${NOT_SPELLS.length} non spells asks for a focus`,
    nonSpellKinds.every((k) => k !== 'focus'), NOT_SPELLS.map((id, i) => `${id} ${nonSpellKinds[i]}`).join(', '));
  const everyone = ['bandage', 'meditate', 'jump', 'sprint', 'camp'];
  check('Bandage, Meditate, Jump, Sprint and Camp still need nothing at all',
    everyone.every((id) => weaponCheck(ABILITIES_BY_ID[id], doll({ mainHand: it('wand') }), { bandage: 3, wood: 1 }).ok
      && weaponCheck(ABILITIES_BY_ID[id], doll({ mainHand: it('longsword') }), { bandage: 3, wood: 1 }).ok
      && weaponCheck(ABILITIES_BY_ID[id], doll(), { bandage: 3, wood: 1 }).ok),
    everyone.join(', '));
  const psSword = weaponCheck(ABILITIES_BY_ID.powerStrike, doll({ mainHand: it('longsword') }), emptyPack);
  const psWand = weaponCheck(ABILITIES_BY_ID.powerStrike, doll({ mainHand: it('wand') }), emptyPack);
  check('Power Strike still lands with a longsword', psSword.ok === true, psSword.reason || 'allowed');
  check('and is refused with a wand, which is not a weapon you swing',
    psWand.ok === false && /is not one you swing/.test(psWand.reason), psWand.reason);
  const shotWand = weaponCheck(ABILITIES_BY_ID.aimedShot, doll({ mainHand: it('wand'), ranged: it('shortbow') }), { arrow: 20 });
  check('and a wand in the hand still blocks a bow shot', shotWand.ok === false, shotWand.reason);

  // Which rows are spells, counted from the table rather than asserted.
  const casters = ABILITIES.filter((x) => ['mage', 'sorcerer', 'necromancer', 'healer'].includes(x.group));
  const spells = ABILITIES.filter((x) => isSpell(x));
  const wrongGroup = spells.filter((x) => !casters.includes(x)).map((x) => x.id);
  check('every ability that costs mana sits in one of the four casting groups',
    wrongGroup.length === 0, wrongGroup.join(', ') || `${spells.length} spells`);
  const notFocus = spells.filter((x) => weaponNeeds(x).kind !== 'focus').map((x) => x.id);
  check('and every one of them wants a focus, but for the one that enchants a blade',
    notFocus.length === 1 && notFocus[0] === 'consecrateWeapon',
    `${spells.length} spells, ${notFocus.join(', ') || 'none'} excepted`);
  const freeCasters = casters.filter((x) => !isSpell(x)).map((x) => x.id);
  check('the two mana free passives in those groups are not spells and need nothing',
    freeCasters.length === 2 && freeCasters.every((id) => weaponNeeds(ABILITIES_BY_ID[id]).kind === 'none'),
    freeCasters.join(', '));
  check('isSpell is driven both ways',
    isSpell(ABILITIES_BY_ID.fireball) === true && isSpell(ABILITIES_BY_ID.arcaneMastery) === false
    && isSpell(ABILITIES_BY_ID.bandage) === false && isSpell(ABILITIES_BY_ID.powerStrike) === false
    && isSpell(null) === false);

  // C1: which spells the armour gets in the way of, counted the same way.
  const holy = spells.filter(isChivalry).map((x) => x.id);
  const burdened = spells.filter(burdensInArmour).map((x) => x.id);
  check('nine Chivalry rows are exempt from the armour rule, by name',
    holy.join(', ') === 'heal, cleanse, greaterHeal, bless, sanctuary, consecrateWeapon, smite, resurrect, layOnHands',
    holy.join(', '));
  check('and the other 26 spells are burdened by it',
    burdened.length === 26 && burdened.length + holy.length === spells.length,
    `${burdened.length} burdened, ${holy.length} holy, ${spells.length} spells`);
  check('no row is both, and no row is neither',
    spells.every((x) => isChivalry(x) !== burdensInArmour(x)));
  check('isChivalry is driven both ways',
    isChivalry(ABILITIES_BY_ID.bless) === true && isChivalry(ABILITIES_BY_ID.fireball) === false
    && isChivalry(ABILITIES_BY_ID.powerStrike) === false && isChivalry(null) === false);
  check('Resurrect is exempt through its Chivalry 85 route, which is the only anyOf in the table',
    isChivalry(ABILITIES_BY_ID.resurrect) === true && ABILITIES_BY_ID.resurrect.skill === 'healing',
    JSON.stringify(ABILITIES_BY_ID.resurrect.anyOf));
  check('burdensInArmour is driven both ways',
    burdensInArmour(ABILITIES_BY_ID.fireball) === true && burdensInArmour(ABILITIES_BY_ID.lightning) === true
    && burdensInArmour(ABILITIES_BY_ID.bless) === false && burdensInArmour(ABILITIES_BY_ID.powerStrike) === false
    && burdensInArmour(ABILITIES_BY_ID.arcaneMastery) === false && burdensInArmour(ABILITIES_BY_ID.bandage) === false
    && burdensInArmour(null) === false);
  const instants = burdened.filter((id) => ABILITIES_BY_ID[id].castTime === 0);
  check('the ten instant spells are burdened too, or a plated mage would just cast those',
    instants.length === 10 && instants.includes('lightning') && instants.includes('magicArrow'),
    instants.join(', '));
  check('and the audit refuses a Chivalry row that has wandered into the burdened list', (() => {
    const rogue = { ...ABILITIES_BY_ID.bless, skill: 'magery' };
    try { auditAbilities(ABILITIES.map((x) => (x.id === 'bless' ? rogue : x))); return false; }
    catch (e) { return /Chivalry exemption/.test(e.message); }
  })());

  const cw = weaponCheck(ABILITIES_BY_ID.consecrateWeapon, doll(), emptyPack);
  const cwMace = weaponCheck(ABILITIES_BY_ID.consecrateWeapon, doll({ mainHand: it('mace') }), emptyPack);
  const cwWand = weaponCheck(ABILITIES_BY_ID.consecrateWeapon, doll({ mainHand: it('wand') }), emptyPack);
  check('Consecrate Weapon, which puts holy on your hits, refuses empty hands',
    cw.ok === false && /wants a weapon in your hand/.test(cw.reason), cw.reason);
  check('takes the mace it is meant to bless', cwMace.ok === true, cwMace.reason || 'allowed');
  check('and refuses a wand, which has no edge to bless',
    cwWand.ok === false && /is not one you swing/.test(cwWand.reason), cwWand.reason);
}

// Through canUse, which is what the runtime calls.
{
  const full = () => ({
    skills: { swordsmanship: 60, macefighting: 60, fencing: 60, polearms: 60, wrestling: 60, tactics: 50, parrying: 40, archery: 60, marksmanship: 60, magery: 70, focus: 0 },
    stats: { str: 60, dex: 60, int: 50, con: 60, wis: 50 },
    stamina: 100, mana: 100, health: 100, maxHealth: 200,
    items: { bandage: 3 }, cooldowns: {}, moving: false, hasShield: true,
  });
  const noField = full();
  check('a character with no equipment field is not weapon checked at all, and the old fixtures still pass',
    canUse(ABILITIES_BY_ID.powerStrike, noField, 0).ok === true
    && canUse(ABILITIES_BY_ID.rend, noField, 0).ok === true
    && canUse(ABILITIES_BY_ID.doubleShot, noField, 0).ok === true,
    'equipment === undefined skips the check');

  const empty = { ...full(), equipment: doll(), pack: emptyPack };
  const armed = { ...full(), equipment: doll({ mainHand: it('longsword') }), pack: emptyPack };
  const bare = canUse(ABILITIES_BY_ID.rend, empty, 0);
  check('but a character who has one is refused Rend with empty hands',
    bare.ok === false && /wants a sword or an axe/.test(bare.reason), bare.reason);
  check('and allowed it with a longsword', canUse(ABILITIES_BY_ID.rend, armed, 0).ok === true);
  check('the hands are checked before the cooldown, so the sharper reason wins',
    (() => { const c = { ...empty, cooldowns: { rend: 99 } }; return /sword/.test(canUse(ABILITIES_BY_ID.rend, c, 0).reason); })(),
    canUse(ABILITIES_BY_ID.rend, { ...empty, cooldowns: { rend: 99 } }, 0).reason);
  check('and startCast refuses through the same reason, so nothing is ever paid for',
    startCast(ABILITIES_BY_ID.rend, empty, 0).error === bare.reason, startCast(ABILITIES_BY_ID.rend, empty, 0).error);
  const archer = { ...full(), equipment: doll({ ranged: it('shortbow') }), pack: { slots: 20, items: [it('arrow', 1)] } };
  const spent = { ...full(), equipment: doll({ ranged: it('shortbow') }), pack: { slots: 20, items: [it('arrow', 0)] } };
  check('one arrow is enough for Double Shot and none is not',
    canUse(ABILITIES_BY_ID.doubleShot, archer, 0).ok === true
    && canUse(ABILITIES_BY_ID.doubleShot, spent, 0).ok === false,
    canUse(ABILITIES_BY_ID.doubleShot, spent, 0).reason);
  check('a pack given as a count map works the same way',
    canUse(ABILITIES_BY_ID.doubleShot, { ...archer, pack: { arrow: 3 } }, 0).ok === true);
}

// The audit, both ways.
{
  check('auditAbilities passes the real table with its needs', auditAbilities() === true);
  const planted = copy();
  planted[0] = { ...planted[0], needs: { kind: 'trebuchet' } };
  let threw = '';
  try { auditAbilities(planted); } catch (e) { threw = e.message; }
  check('and fails on a needs kind that is not one of the seven',
    threw.includes('trebuchet'), threw);

  const noAmmo = copy();
  noAmmo[12] = { ...noAmmo[12], needs: { kind: 'ranged', skills: ['archery'] } };
  threw = '';
  try { auditAbilities(noAmmo); } catch (e) { threw = e.message; }
  check('and on a shot with no ammunition named', threw.includes('no ammunition'), threw);

  const noSkill = copy();
  noSkill[4] = { ...noSkill[4], needs: { kind: 'melee', skills: ['cooking'] } };
  threw = '';
  try { auditAbilities(noSkill); } catch (e) { threw = e.message; }
  check('and on a melee ability whose skill no weapon trains', threw.includes('cooking'), threw);
}

// --- what pays an item cost, and what an item's use IS ------------------------
//
// Three rows cost an item and two of them named something no item table has:
// Camp wants "wood" and there are fourteen logs, Poison Blade wants "poison"
// and there is `woodland_poison`. Both directions, so a cost id that pays for
// nothing cannot ship again and neither can a base list nothing costs.
console.log('\nabilities: what pays an item cost');
{
  const ids = costItemIds();
  check(`the table has ${ids.length} item costs: ${ids.sort().join(', ')}`, ids.length === 3);
  check('and every one of them has a row saying what pays it',
    ids.every((id) => Array.isArray(COST_ITEM_BASES[id])), ids.filter((id) => !COST_ITEM_BASES[id]).join(','));
  check('and no row pays for a cost nothing charges',
    Object.keys(COST_ITEM_BASES).every((id) => ids.includes(id)),
    Object.keys(COST_ITEM_BASES).filter((id) => !ids.includes(id)).join(',') || 'none spare');
  const bad = [];
  for (const [id, bases] of Object.entries(COST_ITEM_BASES)) {
    for (const b of bases) if (!BASES[b]) bad.push(`${id} -> ${b}`);
  }
  check('and every base named is a real row in items.js', bad.length === 0, bad.join(', '));
  check('wood is fourteen logs and not a base called "wood"',
    COST_ITEM_BASES.wood.length === 14 && !BASES.wood, String(COST_ITEM_BASES.wood.length));
  check('and the poison is the one foraging really brews',
    COST_ITEM_BASES.poisonVial.join(',') === 'woodland_poison' && !!BASES.woodland_poison);

  // the count, both shapes, both ways
  const doc = { pack: { slots: 4, items: [{ base: 'oak_log', count: 3 }, null, { base: 'pine_log', count: 2 }, null] } };
  check('a cost is counted across every base that would pay it', itemsHeld(doc, 'wood') === 5, String(itemsHeld(doc, 'wood')));
  check('and something else in the pack does not pay it',
    itemsHeld({ pack: { items: [{ base: 'longsword' }] } }, 'wood') === 0);
  check('an older fixture that writes the cost id straight into a count map still counts',
    itemsHeld({ items: { wood: 7 } }, 'wood') === 7, String(itemsHeld({ items: { wood: 7 } }, 'wood')));
  check('the paying base is the one actually carried', payingBase(doc, 'wood') === 'oak_log', payingBase(doc, 'wood'));
  check('and null when nothing pays', payingBase({ pack: { items: [] } }, 'wood') === null);

  // canUse, both ways, against the shape a real save has
  const healer = {
    skills: { healing: 50, anatomy: 50 }, stats: {}, stamina: 50, mana: 50, health: 50, maxHealth: 50,
    equipment: {}, cooldowns: {},
  };
  const withOne = { ...healer, pack: { slots: 2, items: [{ base: 'bandage', count: 1 }, null] } };
  const withNone = { ...healer, pack: { slots: 2, items: [null, null] } };
  check('Bandage is allowed with one bandage in the PACK and no count map at all',
    canUse(ABILITIES_BY_ID.bandage, withOne, 0).ok === true, canUse(ABILITIES_BY_ID.bandage, withOne, 0).reason);
  check('and refused with none, counting what you have',
    canUse(ABILITIES_BY_ID.bandage, withNone, 0).reason === 'Bandage needs 1 bandage and you have 0',
    canUse(ABILITIES_BY_ID.bandage, withNone, 0).reason);
}
{
  console.log('\nabilities: an item whose use is an ability');
  const bad = [];
  for (const [base, id] of Object.entries(ABILITY_FOR_ITEM)) {
    if (!BASES[base]) bad.push(`${base} is not an item`);
    if (!ABILITIES_BY_ID[id]) bad.push(`${id} is not an ability`);
  }
  check('every route is from a real item to a real ability', bad.length === 0, bad.join(', '));
  check('and the bandage is the one that needed it',
    ABILITY_FOR_ITEM.bandage === 'bandage' && !BASES.bandage.use,
    `use block: ${JSON.stringify(BASES.bandage.use || null)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
