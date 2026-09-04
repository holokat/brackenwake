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
} from './abilities.js';
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
  check('and not Camp, which wants Camping 20', !ids(nobody).has('camp'));
  check('Camping 20 adds it', ids(unlockedFor({ camping: 20 }, {})).has('camp'));
  check('Camping 19 does not', !ids(unlockedFor({ camping: 19 }, {})).has('camp'));
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
  check('an ability you have not unlocked is refused for that reason first',
    !r.ok && r.reason.includes('weapon skill 30'), r.reason);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
