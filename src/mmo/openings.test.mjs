// The eleven openings, customisation and appearance, driven both ways.
// Run: node src/mmo/openings.test.mjs
//
// Every number printed here was measured in this file. Where a rule is
// asserted, the case that breaks it is also driven, so passing means
// something. The document itself is parsed and compared, so drift in either
// direction fails.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  OPENINGS, OPENINGS_BY_ID, OPENING_COUNT, STAT_IDS, STAT_LABELS, SKILL_IDS, SKILL_NAMES,
  STARTING_STAT_TOTAL, STARTING_SKILL_TOTAL, MAX_STAT_AT_START, MIN_STAT,
  BLANK_MAX_SKILL, BLANK_STAT_POINTS, CUSTOM_STAT_POINTS, CUSTOM_SKILL_POINTS,
  applyCustomisation, APPEARANCE, APPEARANCE_DEFAULT, validateAppearance,
  auditOpenings, ITEM_BASES, INVENTED_ITEM_BASES, STARTING_COINS, BLANK_COINS,
} from './openings.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, '..', '..', 'docs', 'mmo');
const classesDoc = readFileSync(join(docs, '04-CLASSES-ABILITIES.md'), 'utf8');
const skillsDoc = readFileSync(join(docs, '01-STATS-SKILLS.md'), 'utf8');
const itemsDoc = readFileSync(join(docs, '03-ITEMS-LOOT.md'), 'utf8');

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
console.log('\nThe document, parsed');
// ---------------------------------------------------------------------------

// The openings table sits between "## The openings" and "**Customising:**".
const openingsBlock = classesDoc
  .split('## The openings')[1]
  .split('**Customising:**')[0];
const docRows = openingsBlock
  .split('\n')
  .filter((l) => l.trim().startsWith('|'))
  .map((l) => l.trim().slice(1, -1).split('|').map((c) => c.trim()))
  .filter((c) => c[0] && c[0] !== 'opening' && !c[0].startsWith('---'));

check('the document lists eleven openings', docRows.length === 11, `${docRows.length} rows`);
check('the module holds the same eleven', OPENINGS.length === OPENING_COUNT && OPENING_COUNT === 11,
  `${OPENINGS.length} openings`);

// Doc skill names -> ids, so the comparison runs on the document's own words.
const nameToId = {};
for (const [id, name] of Object.entries(SKILL_NAMES)) nameToId[name] = id;

let statMismatch = 0, skillMismatch = 0, nameMismatch = 0;
const docTotals = [];
for (const cells of docRows) {
  const [name, STR, DEX, INT, CON, WIS, skillCell] = cells;
  const op = OPENINGS.find((o) => o.name === name);
  if (!op) { nameMismatch++; console.log(`       no opening named ${name}`); continue; }
  const docStats = { str: +STR, dex: +DEX, int: +INT, con: +CON, wis: +WIS };
  for (const id of STAT_IDS) if (op.stats[id] !== docStats[id]) statMismatch++;
  docTotals.push(sum(docStats));

  if (name === 'Blank') continue; // "200 points to place", not a skill list
  const parsed = {};
  for (const piece of skillCell.split(',')) {
    const m = piece.trim().match(/^(.+?)\s+(\d+)$/);
    if (!m) { skillMismatch++; continue; }
    const id = nameToId[m[1]];
    if (!id) { skillMismatch++; console.log(`       unknown skill name ${m[1]}`); continue; }
    parsed[id] = +m[2];
  }
  for (const [id, v] of Object.entries(parsed)) if (op.skills[id] !== v) skillMismatch++;
  const listed = Object.keys(op.startingSkills).length;
  if (listed !== Object.keys(parsed).length) skillMismatch++;
}
check('every opening name in the document has a row here', nameMismatch === 0);
check('every stat matches the document cell for cell', statMismatch === 0, `${docRows.length * 5} cells`);
check('every starting skill matches the document', skillMismatch === 0);
check('the document itself sums every opening to 250',
  docTotals.every((t) => t === STARTING_STAT_TOTAL), docTotals.join(' '));

// The nine skill tables in 01-STATS-SKILLS.md, compared both ways with the
// local mirror. Neither list may hold a name the other does not.
const everySkillBlock = skillsDoc.split('### Every skill')[1].split('### Skill locks')[0];
const skillDocNames = everySkillBlock
  .split('\n')
  .filter((l) => l.trim().startsWith('|'))
  .map((l) => l.trim().slice(1, -1).split('|')[0].trim())
  .filter((n) => n && n !== 'skill' && !n.startsWith('---'));
const mirrorNames = SKILL_IDS.map((id) => SKILL_NAMES[id]);
const missingSkills = mirrorNames.filter((n) => !skillDocNames.includes(n));
const extraSkills = skillDocNames.filter((n) => !mirrorNames.includes(n));
check('every skill id here appears in 01-STATS-SKILLS.md', missingSkills.length === 0,
  missingSkills.length ? missingSkills.join(', ') : `${SKILL_IDS.length} skills`);
check('and every skill row in the document appears here', extraSkills.length === 0,
  extraSkills.length ? extraSkills.join(', ') : `${skillDocNames.length} rows`);
const claimed = skillsDoc.match(/Nine groups, (\d+) skills/);
check('the count the document claims matches the rows it lists and the mirror',
  !!claimed && +claimed[1] === skillDocNames.length && skillDocNames.length === SKILL_IDS.length,
  `prose says ${claimed ? claimed[1] : 'nothing'}, ${skillDocNames.length} rows, ${SKILL_IDS.length} mirrored`);

// Item bases: the doc-sourced ones must really be in 03-ITEMS-LOOT.md.
const lowerItems = itemsDoc.toLowerCase();
const badBases = Object.values(ITEM_BASES)
  .filter((b) => b.docName && !lowerItems.includes(b.docName.toLowerCase()))
  .map((b) => `${b.id} (${b.docName})`);
check('every doc-sourced item base is named in 03-ITEMS-LOOT.md', badBases.length === 0,
  badBases.length ? badBases.join(', ') : `${Object.keys(ITEM_BASES).length} bases`);
check('and the invented ones are declared, not hidden', INVENTED_ITEM_BASES.length === 10,
  INVENTED_ITEM_BASES.join(', '));

// ---------------------------------------------------------------------------
console.log('\nEvery opening, both bounds');
// ---------------------------------------------------------------------------

let statSumBad = 0, statCapBad = 0, skillSumBad = 0;
const lines = [];
for (const o of OPENINGS) {
  const s = sum(o.stats);
  const k = sum(o.skills) + o.freeSkillPoints;
  if (s !== STARTING_STAT_TOTAL) statSumBad++;
  if (k !== STARTING_SKILL_TOTAL) skillSumBad++;
  for (const id of STAT_IDS) if (o.stats[id] > MAX_STAT_AT_START) statCapBad++;
  lines.push(`${o.name} ${s}/${k}`);
}
check('every opening spreads exactly 250 stat points', statSumBad === 0, lines.join('  '));
check('no opening puts a stat above 100', statCapBad === 0,
  `highest is ${Math.max(...OPENINGS.flatMap((o) => STAT_IDS.map((i) => o.stats[i])))}`);
check('every opening accounts for exactly 200 skill points', skillSumBad === 0);
check('Blank places none of them and holds all 200 free',
  sum(OPENINGS_BY_ID.blank.skills) === 0 && OPENINGS_BY_ID.blank.freeSkillPoints === 200,
  `${sum(OPENINGS_BY_ID.blank.skills)} placed, ${OPENINGS_BY_ID.blank.freeSkillPoints} free`);
check('the ten kitted openings place all 200 and hold none free',
  OPENINGS.filter((o) => o.id !== 'blank').every((o) => sum(o.skills) === 200 && o.freeSkillPoints === 0));
check('Blank alone caps a skill at 50',
  OPENINGS_BY_ID.blank.maxSkillAtStart === BLANK_MAX_SKILL
  && OPENINGS.filter((o) => o.id !== 'blank').every((o) => o.maxSkillAtStart === 100));
check('Blank carries the 100 coins the document gives it',
  OPENINGS_BY_ID.blank.coins === BLANK_COINS && BLANK_COINS === 100);
check('and the rest carry the invented "few coins"',
  OPENINGS.filter((o) => o.id !== 'blank').every((o) => o.coins === STARTING_COINS),
  `${STARTING_COINS} each`);
check('every kit has items and every base is known',
  OPENINGS.every((o) => o.kit.length > 0 && o.kit.every((e) => e.base in ITEM_BASES)),
  OPENINGS.map((o) => `${o.name} ${o.kit.length}`).join('  '));

// The audit is a gate, so drive it the wrong way too.
check('auditOpenings passes the real table', auditOpenings() === true);
{
  const broken = OPENINGS.map((o) => ({ ...o, stats: { ...o.stats } }));
  broken[0].stats.str += 1;
  let threw = '';
  try { auditOpenings(broken); } catch (e) { threw = e.message; }
  check('and fails a table whose stats no longer sum to 250', threw.includes('sum to 251'), threw);
}
{
  const broken = OPENINGS.map((o) => ({ ...o, stats: { ...o.stats } }));
  broken[0].stats.str = 105; broken[0].stats.con -= 40;
  let threw = '';
  try { auditOpenings(broken); } catch (e) { threw = e.message; }
  check('and fails a stat above the cap of 100', threw.includes('above 100'), threw);
}
check('the real table still audits after the copies were broken', auditOpenings() === true);

// ---------------------------------------------------------------------------
console.log('\nCustomisation, accepted and refused');
// ---------------------------------------------------------------------------

const warrior = OPENINGS_BY_ID.warrior;

{
  // 30 points is the whole budget: legal.
  const r = applyCustomisation('warrior', [{ from: 'str', to: 'dex', amount: 30 }], []);
  const ok = !r.error && r.stats.str === 35 && r.stats.dex === 80 && sum(r.stats) === 250;
  check(`a 30 point stat move is accepted (${CUSTOM_STAT_POINTS} is the budget)`, ok,
    r.error || `STR ${warrior.stats.STR} to ${r.stats.STR}, DEX ${warrior.stats.DEX} to ${r.stats.DEX}, total ${sum(r.stats)}`);
  check('and it spends the budget exactly', !r.error && r.remaining.stat === 0, r.error || `${r.spent.stat} spent, ${r.remaining.stat} left`);
}
{
  const r = applyCustomisation('warrior', [{ from: 'str', to: 'dex', amount: 31 }], []);
  check('a 31 point stat move is refused', !!r.error && r.error.includes('31 of 30'), r.error);
}
{
  const r = applyCustomisation('warrior', [
    { from: 'str', to: 'dex', amount: 20 }, { from: 'con', to: 'dex', amount: 11 },
  ], []);
  check('and so is 20 plus 11 across two moves', !!r.error && r.error.includes('31 of 30'), r.error);
}
{
  // Rogue DEX is 75; +30 would be 105.
  const r = applyCustomisation('rogue', [{ from: 'int', to: 'dex', amount: 30 }], []);
  check('a move that would put DEX above 100 is refused', !!r.error && r.error.includes('above the cap'), r.error);
  const near = applyCustomisation('rogue', [{ from: 'int', to: 'dex', amount: 25 }], []);
  check('and the same move one point inside the cap is accepted',
    !near.error && near.stats.dex === 100, near.error || `DEX ${near.stats.dex}`);
}
{
  // Warrior INT is 25, floor is 10, so 15 out is legal and 16 is not.
  const okMove = applyCustomisation('warrior', [{ from: 'int', to: 'str', amount: 15 }], []);
  const badMove = applyCustomisation('warrior', [{ from: 'int', to: 'str', amount: 16 }], []);
  check(`the stat floor of ${MIN_STAT} lets 15 out of INT 25 and refuses 16`,
    !okMove.error && !!badMove.error && badMove.error.includes('below the floor'),
    badMove.error);
}
{
  // A move that would change the total: drawing from the pool on a non-Blank.
  const r = applyCustomisation('warrior', [], [{ from: 'pool', to: 'tactics', amount: 5 }]);
  check('a move that would change the total is refused',
    !!r.error && r.error.includes('change the total'), r.error);
  const before = sum(warrior.skills);
  const legal = applyCustomisation('warrior', [], [{ from: 'anatomy', to: 'tactics', amount: 20 }]);
  check('while the same points moved between two skills keep the total at 200',
    !legal.error && sum(legal.skills) === before && before === 200,
    legal.error || `${before} before, ${sum(legal.skills)} after`);
}
{
  const r = applyCustomisation('warrior', [{ to: 'dex', amount: 5 }], []);
  check('a move with no from is refused', !!r.error && r.error.includes('needs a from'), r.error);
  const same = applyCustomisation('warrior', [{ from: 'str', to: 'str', amount: 5 }], []);
  check('and a move onto itself is refused', !!same.error && same.error.includes('itself'), same.error);
  const frac = applyCustomisation('warrior', [{ from: 'str', to: 'dex', amount: 2.5 }], []);
  check('and half a point is refused', !!frac.error && frac.error.includes('whole'), frac.error);
  const neg = applyCustomisation('warrior', [{ from: 'str', to: 'dex', amount: -5 }], []);
  check('and a negative move is refused', !!neg.error && neg.error.includes('above zero'), neg.error);
}
{
  const r = applyCustomisation('warrior', [{ from: 'luk', to: 'dex', amount: 5 }], []);
  check('an unknown stat is refused', !!r.error && r.error.includes('no such stat'), r.error);
  const s = applyCustomisation('warrior', [], [{ from: 'tactics', to: 'jousting', amount: 5 }]);
  check('and an unknown skill is refused', !!s.error && s.error.includes('no such skill'), s.error);
}
{
  const r = applyCustomisation('nobody', [], []);
  check('an unknown opening is refused', !!r.error && r.error.includes('unknown opening'), r.error);
}

// Blank
{
  const r = applyCustomisation('blank', [], [{ from: 'pool', to: 'magery', amount: 50 }]);
  check('Blank may put 50 into a skill from the pool',
    !r.error && r.skills.magery === 50, r.error || `Magery ${r?.skills?.magery}`);
  const over = applyCustomisation('blank', [], [{ from: 'pool', to: 'magery', amount: 51 }]);
  check('Blank refuses a skill above 50', !!over.error && over.error.includes('above the cap of 50'), over.error);
}
{
  const moves = [];
  for (const id of ['magery', 'evaluatingIntelligence', 'meditation', 'healing'])
    moves.push({ from: 'pool', to: id, amount: 50 });
  const r = applyCustomisation('blank', [], moves);
  check('Blank may place all 200 of its free points',
    !r.error && sum(r.skills) === 200 && r.remaining.skill === 0,
    r.error || `${sum(r.skills)} placed, ${r.remaining.skill} left`);
  const over = applyCustomisation('blank', [], [...moves, { from: 'pool', to: 'tactics', amount: 1 }]);
  check('and refuses the two hundred and first', !!over.error && over.error.includes('201 of 200'), over.error);
}
{
  const r = applyCustomisation('blank', [{ from: 'str', to: 'int', amount: 40 }], []);
  check(`Blank may move more than ${CUSTOM_STAT_POINTS} stat points (budget ${BLANK_STAT_POINTS})`,
    !r.error && r.stats.int === 90 && r.stats.str === 10, r.error || `STR ${r.stats.str}, INT ${r.stats.int}`);
  const overFloor = applyCustomisation('blank', [{ from: 'str', to: 'int', amount: 41 }], []);
  check('and is still stopped by the floor at 41', !!overFloor.error && overFloor.error.includes('below the floor'),
    overFloor.error);
  const warriorSame = applyCustomisation('warrior', [{ from: 'str', to: 'int', amount: 40 }], []);
  check('while a Warrior cannot move 40 at all', !!warriorSame.error && warriorSame.error.includes('40 of 30'),
    warriorSame.error);
}
check(`the skill budget for a kitted opening is ${CUSTOM_SKILL_POINTS}`,
  applyCustomisation('warrior', [], [{ from: 'anatomy', to: 'tactics', amount: 30 }]).error === undefined
  && !!applyCustomisation('warrior', [], [{ from: 'anatomy', to: 'tactics', amount: 31 }]).error);

// ---------------------------------------------------------------------------
console.log('\nAppearance');
// ---------------------------------------------------------------------------

check('three builds', APPEARANCE.builds.length === 3, APPEARANCE.builds.join(', '));
check('eight skins', APPEARANCE.skins.length === 8, APPEARANCE.skins.join(', '));
check('twelve hair styles', APPEARANCE.hairStyles.length === 12, `${APPEARANCE.hairStyles.length}`);
check('ten hair colours', APPEARANCE.hairColours.length === 10, `${APPEARANCE.hairColours.length}`);
check('face marks exist and include none', APPEARANCE.marks.includes('none'), `${APPEARANCE.marks.length} marks`);
check('height runs 1.6 to 2.0', APPEARANCE.height.min === 1.6 && APPEARANCE.height.max === 2.0);
check('no list repeats a value',
  [APPEARANCE.builds, APPEARANCE.skins, APPEARANCE.hairStyles, APPEARANCE.hairColours, APPEARANCE.marks]
    .every((l) => new Set(l).size === l.length));

check('the default appearance validates', validateAppearance(APPEARANCE_DEFAULT).ok === true);
check('every single choice validates against the default',
  [['build', 'builds'], ['skin', 'skins'], ['hairStyle', 'hairStyles'], ['hairColour', 'hairColours'], ['mark', 'marks']]
    .every(([f, list]) => APPEARANCE[list].every((v) => validateAppearance({ ...APPEARANCE_DEFAULT, [f]: v }).ok)),
  `${APPEARANCE.builds.length + APPEARANCE.skins.length + APPEARANCE.hairStyles.length + APPEARANCE.hairColours.length + APPEARANCE.marks.length} choices`);
{
  const bad = validateAppearance({ ...APPEARANCE_DEFAULT, hairStyle: 'mohawk' });
  check('an unlisted hair style is refused', bad.ok === false && bad.error.includes('12 choices'), bad.error);
}
{
  const low = validateAppearance({ ...APPEARANCE_DEFAULT, height: 1.59 });
  const high = validateAppearance({ ...APPEARANCE_DEFAULT, height: 2.01 });
  const edgeLow = validateAppearance({ ...APPEARANCE_DEFAULT, height: 1.6 });
  const edgeHigh = validateAppearance({ ...APPEARANCE_DEFAULT, height: 2.0 });
  check('1.59 m and 2.01 m are refused, 1.6 and 2.0 are not',
    !low.ok && !high.ok && edgeLow.ok && edgeHigh.ok, `${low.error} / ${high.error}`);
  const nan = validateAppearance({ ...APPEARANCE_DEFAULT, height: 'tall' });
  check('and a height that is not a number is refused', !nan.ok && nan.error.includes('number'), nan.error);
}
check('an empty appearance is refused', validateAppearance(null).ok === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
