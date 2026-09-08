// The four openings, customisation and appearance, driven both ways.
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
  auditOpenings, ITEM_BASES, itemBaseFor, kitItems, auditKitBases, INVENTED_ITEM_BASES, STARTING_COINS, BLANK_COINS,
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

check('the document lists four openings', docRows.length === 4, `${docRows.length} rows`);
check('the module holds the same four', OPENINGS.length === OPENING_COUNT && OPENING_COUNT === 4,
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
// Nine since W7 added the wand: 03-ITEMS-LOOT.md has no wand row, and this
// list is where a base the item document does not define is counted out loud
// rather than pretending to be sourced.
check('and the invented ones are declared, not hidden', INVENTED_ITEM_BASES.length === 9,
  INVENTED_ITEM_BASES.join(', '));
check('the wand is among them and the staff is not, because 03 names a staff',
  INVENTED_ITEM_BASES.includes('wand') && !INVENTED_ITEM_BASES.includes('staff'));
check('every casting opening carries a focus in its kit',
  ['mage'].every((id) => kitItems(OPENINGS_BY_ID[id])
    .some((e) => ['wand', 'staff', 'bone_staff'].includes(e.base))),
  ['mage']
    .map((id) => `${id}: ${kitItems(OPENINGS_BY_ID[id]).map((e) => e.base).find((b) => ['wand', 'staff', 'bone_staff'].includes(b))}`)
    .join(', '));
check('and no kit still hands a caster a quarterstaff to cast with',
  OPENINGS.every((o) => !kitItems(o).some((e) => e.base === 'quarterstaff')));

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
check('every kitted opening places all 200 and holds none free',
  OPENINGS.every((o) => sum(o.skills) === 200 && o.freeSkillPoints === 0));
check('every opening caps a starting skill at 100',
  OPENINGS.every((o) => o.maxSkillAtStart === 100));
check('every opening carries the invented "few coins"',
  OPENINGS.every((o) => o.coins === STARTING_COINS),
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

check(`the skill budget for a kitted opening is ${CUSTOM_SKILL_POINTS}`,
  applyCustomisation('warrior', [], [{ from: 'anatomy', to: 'tactics', amount: 30 }]).error === undefined
  && !!applyCustomisation('warrior', [], [{ from: 'anatomy', to: 'tactics', amount: 31 }]).error);

// ---------------------------------------------------------------------------
console.log('\nAppearance');
// ---------------------------------------------------------------------------

check('one gender is offered, so creation shows one body',
  APPEARANCE.genders.length === 1 && APPEARANCE.genders.join(',') === 'male',
  APPEARANCE.genders.join(', '));
check('and the default is male', APPEARANCE_DEFAULT.gender === 'male', String(APPEARANCE_DEFAULT.gender));
check('the one offered gender validates',
  APPEARANCE.genders.every((g) => validateAppearance({ ...APPEARANCE_DEFAULT, gender: g }).ok),
  APPEARANCE.genders.join(', '));
{
  const bad = validateAppearance({ ...APPEARANCE_DEFAULT, gender: 'female' });
  check('and a gender outside that one is refused, by name and by count',
    bad.ok === false && bad.error.includes('gender') && bad.error.includes('1 choices'), bad.error);
}
{
  const { gender, ...noGender } = APPEARANCE_DEFAULT;
  const r = validateAppearance(noGender);
  check('an appearance with no gender at all is refused rather than guessed',
    r.ok === false && r.error.startsWith('gender'), r.error);
  const filled = validateAppearance({ ...APPEARANCE_DEFAULT, ...noGender });
  check('and the same record read the way state.js reads a save, over the default, comes back male',
    filled.ok === true && filled.appearance.gender === 'male', JSON.stringify(filled.appearance));
}
check('the five the screen dropped are still in the table, whole',
  APPEARANCE.builds.length === 3 && APPEARANCE.skins.length === 8 && APPEARANCE.hairStyles.length === 12
  && APPEARANCE.hairColours.length === 10 && APPEARANCE.marks.length > 1 && APPEARANCE.height.default === 1.75);
check('three builds', APPEARANCE.builds.length === 3, APPEARANCE.builds.join(', '));
check('eight skins', APPEARANCE.skins.length === 8, APPEARANCE.skins.join(', '));
check('twelve hair styles', APPEARANCE.hairStyles.length === 12, `${APPEARANCE.hairStyles.length}`);
check('ten hair colours', APPEARANCE.hairColours.length === 10, `${APPEARANCE.hairColours.length}`);
check('face marks exist and include none', APPEARANCE.marks.includes('none'), `${APPEARANCE.marks.length} marks`);
check('height runs 1.6 to 2.0', APPEARANCE.height.min === 1.6 && APPEARANCE.height.max === 2.0);
check('no list repeats a value',
  [APPEARANCE.genders, APPEARANCE.builds, APPEARANCE.skins, APPEARANCE.hairStyles, APPEARANCE.hairColours, APPEARANCE.marks]
    .every((l) => new Set(l).size === l.length));

check('the default appearance validates', validateAppearance(APPEARANCE_DEFAULT).ok === true);
check('every single choice validates against the default',
  [['gender', 'genders'], ['build', 'builds'], ['skin', 'skins'], ['hairStyle', 'hairStyles'], ['hairColour', 'hairColours'], ['mark', 'marks']]
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

// ---- kit ids resolve to items.js bases --------------------------------------
{
  const { BASES } = await import('./items.js');
  const all = OPENINGS.flatMap((o) => kitItems(o));
  const unresolved = all.filter((e) => !BASES[e.base]).map((e) => e.kitId);
  check('every kit entry of every opening resolves to a real items.js base', unresolved.length === 0 && auditKitBases() === true,
    unresolved.length ? unresolved.join(', ') : `${all.length} entries across ${OPENINGS.length} openings`);
  check('outfit kit ids map to the six armour bases',
    itemBaseFor('leatherOutfit') === 'leather_outfit' && itemBaseFor('ringmailOutfit') === 'ring_outfit' && itemBaseFor('clothOutfit') === 'cloth_outfit' && itemBaseFor('kiteShield') === 'kite');
  check('ids items.js already knows pass through unchanged', itemBaseFor('longsword') === 'longsword' && itemBaseFor('bandage') === 'bandage');
  const warrior = kitItems(OPENINGS_BY_ID.warrior);
  check('the warrior kit is a longsword, a kite shield, one leather outfit and six bandages',
    warrior.length === 4 && warrior[0].base === 'longsword' && warrior[1].base === 'kite' && warrior.filter((e) => e.base === 'leather_outfit').length === 1 && warrior.at(-1).count === 6,
    warrior.map((e) => e.base).join(', '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
