// Character creation. Run: node src/game/creation.test.mjs
//
// planCharacter is the whole of creation with the DOM taken off the front, and
// it is the same function the Begin button calls, so what passes here is what
// a player gets. The kit goes in through the real inventory, which is why the
// shortfalls below are counted rather than assumed.

import {
  planCharacter, kitFor, movesFrom, validateName, auditKits, shortfallLine,
  KIT_BASES, MISSING_BASES, STAND_INS, PREFERRED, FALLBACK, DEFAULT_SETTINGS, NAME_MAX,
  OPENING_GROUP, EMBLEMS, emblemSvg, openingColour, auditEmblems, leadSkillLine,
  statPct, STAT_FLOOR, STAT_CEIL, KIT_ICONS_SHOWN,
} from './creation.js';
import { GROUP_COLOUR } from './win_abilities.js';
import { STAT_IDS as STAT_ORDER, STAT_LABELS, SKILL_NAMES } from '../mmo/openings.js';
import {
  OPENINGS, OPENINGS_BY_ID, STAT_IDS, SKILL_IDS, ITEM_BASES,
  CUSTOM_STAT_POINTS, CUSTOM_SKILL_POINTS, BLANK_STAT_POINTS, APPEARANCE,
} from '../mmo/openings.js';
import { statTotal, derived, STAT_START_TOTAL } from '../mmo/stats.js';
import { total as skillTotal, SKILLS } from '../mmo/skills.js';
import { BASES, SLOTS, baseFor } from '../mmo/items.js';
import { BAR_SLOTS } from './win_abilities.js';
// The pack grew from 20 to 40 (see src/game/state.js and docs/mmo/wiring/U2.md),
// so this asks inventory.js what the number is rather than carrying a copy.
import { PACK_SLOTS } from './inventory.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---- the kit mapping is complete, and honest about what it cannot make ------
check('every kit base the openings name has a decision', (() => {
  try { auditKits(); return true; } catch (e) { return String(e); }
})() === true);
check('and there are no mappings for things nothing names', Object.keys(KIT_BASES).every((k) => k in ITEM_BASES), Object.keys(KIT_BASES).filter((k) => !(k in ITEM_BASES)).join(','));
check('every mapping points at a real item base', Object.values(KIT_BASES).filter(Boolean).every((v) => !!BASES[v]));
// The counts are read off items.js rather than typed here, so the pure layer
// growing a Pickaxe row shrinks the shortfall instead of breaking this file.
check('nothing is listed missing that the tables can actually make',
  MISSING_BASES.every((id) => !PREFERRED[id] || !BASES[PREFERRED[id]]),
  MISSING_BASES.filter((id) => PREFERRED[id] && BASES[PREFERRED[id]]).join(','));
check('and nothing stands in for a thing that now exists',
  Object.keys(STAND_INS).every((id) => !PREFERRED[id] || !BASES[PREFERRED[id]]),
  Object.keys(STAND_INS).join(','));
check('every kit base either resolves or is counted as missing',
  Object.keys(KIT_BASES).every((id) => KIT_BASES[id] ? !!BASES[KIT_BASES[id]] : MISSING_BASES.includes(id)));
console.log(`       (items.js makes ${Object.values(KIT_BASES).filter(Boolean).length} of ${Object.keys(KIT_BASES).length} kit bases; ${Object.keys(STAND_INS).length} stand ins, ${MISSING_BASES.length} missing)`);

// ---- every opening makes a character ----------------------------------------
{
  const bad = [];
  for (const op of OPENINGS) {
    const p = planCharacter({ opening: op.id, name: 'Ashe' });
    if (!p.ok) bad.push(`${op.id}: ${p.errors.join('; ')}`);
  }
  check('all eleven openings plan', bad.length === 0 && OPENINGS.length === 11, bad.join(' | '));
}
{
  // Counted, not assumed: what each opening actually walks out with.
  const rows = OPENINGS.map((op) => {
    const p = planCharacter({ opening: op.id, name: 'Ashe' });
    const worn = SLOTS.filter((s) => p.character.equipment[s]).length;
    const packed = p.character.pack.items.filter(Boolean).length;
    return { id: op.id, worn, packed, missing: p.missing.length };
  });
  check('nobody starts empty handed', rows.every((r) => r.worn + r.packed > 0), rows.map((r) => `${r.id}:${r.worn}+${r.packed}`).join(' '));
  check('everyone has something in hand', OPENINGS.every((op) => {
    const p = planCharacter({ opening: op.id, name: 'Ashe' });
    return !!(p.character.equipment.mainHand || p.character.equipment.ranged);
  }));
  const withMissing = rows.filter((r) => r.missing > 0).map((r) => r.id);
  const expected = OPENINGS.filter((op) => op.kit.some((e) => !KIT_BASES[e.base])).map((op) => op.id);
  check('the openings that come up short are exactly the ones whose kit names something unmade',
    withMissing.join(',') === expected.join(','), `${withMissing.join(',') || 'none'} vs ${expected.join(',') || 'none'}`);
  const shortfalls = OPENINGS.map((op) => shortfallLine(planCharacter({ opening: op.id, name: 'Ashe' })));
  check('and every opening that comes up short says so in words',
    expected.every((id) => {
      const p = planCharacter({ opening: id, name: 'Ashe' });
      return /not in your pack/.test(shortfallLine(p));
    }), expected.join(','));
  check('while an opening that lacks nothing claims no shortfall',
    OPENINGS.filter((op) => !expected.includes(op.id)).every((op) => {
      const line = shortfallLine(planCharacter({ opening: op.id, name: 'Ashe' }));
      return !/not in the item tables/.test(line);
    }));
}
{
  // Whatever the tables hold today, an artisan's kit is either in his hands or
  // named out loud. Nothing may simply not arrive.
  const p = planCharacter({ opening: 'artisan', name: 'Ashe' });
  const carried = p.character.pack.items.concat(Object.values(p.character.equipment)).filter(Boolean).map((i) => i.base);
  const artisan = OPENINGS_BY_ID.artisan;
  const unaccounted = artisan.kit.filter((e) => {
    const to = KIT_BASES[e.base];
    if (!to) return !new RegExp(e.base.replace(/([A-Z])/g, ' $1').toLowerCase()).test(shortfallLine(p));
    return !carried.includes(to);
  });
  check('every line of the artisan kit is either carried or named as missing', unaccounted.length === 0, unaccounted.map((e) => e.base).join(','));
}
{
  const p = planCharacter({ opening: 'paladin', name: 'Ashe' });
  check('the paladin keeps his shield', p.character.equipment.offHand?.base === 'buckler', String(p.character.equipment.offHand?.base));
  check('and the book he cannot also hold is in the pack, and said so', /stayed in the pack/.test(shortfallLine(p)), shortfallLine(p));
  check('with the book itself in the pack', p.character.pack.items.some((i) => i && /book|tome/.test(i.base)), p.character.pack.items.filter(Boolean).map((i) => i.base).join(','));
}

// ---- the document is whole ---------------------------------------------------
{
  const p = planCharacter({ opening: 'mage', name: "Rowan O'Dell" });
  const c = p.character;
  const want = ['v', 'name', 'appearance', 'opening', 'stats', 'statLocks', 'skills', 'skillLocks',
    'pos', 'health', 'mana', 'stamina', 'gold', 'pack', 'equipment', 'bar', 'discovered', 'deadUntil', 'settings'];
  const absent = want.filter((k) => !(k in c));
  check('every field 07-RUNTIME-CONTRACT.md names is written', absent.length === 0, absent.join(', '));
  check('it is version 2', c.v === 2);
  check('the name is kept as typed', c.name === "Rowan O'Dell", c.name);
  check('all five stats are there and total 250', statTotal(c.stats) === STAT_START_TOTAL && STAT_IDS.every((k) => k in c.stats), String(statTotal(c.stats)));
  check('all fifty two skills are written, not only the five that started', Object.keys(c.skills).length === SKILLS.length, String(Object.keys(c.skills).length));
  check('and they total 200', skillTotal(c.skills) === 200, String(skillTotal(c.skills)));
  check(`the pack has ${PACK_SLOTS} slots`, c.pack.slots === PACK_SLOTS && c.pack.items.length === PACK_SLOTS, `${c.pack.slots} slots, ${c.pack.items.length} entries`);
  check('the doll has all fourteen', SLOTS.every((s) => s in c.equipment));
  check('the bar has twelve empty slots', c.bar.length === BAR_SLOTS && c.bar.every((x) => x === null));
  check('the pools start full', c.health === Math.floor(derived(c.stats, c.skills).maxHealth), `${c.health}`);
  // 10 + WIS 65 * 2 + INT 70 * 0.5 = 175. The stats document's worked example
  // is a different spread (WIS 60, INT 65), so the number to check is the
  // formula's, not the prose's.
  check('a mage starts with 175 mana, which is the formula on his own spread', c.mana === 175, String(c.mana));
  check('the gold is the opening s', c.gold === OPENINGS_BY_ID.mage.coins);
  check('and every setting key exists', Object.keys(DEFAULT_SETTINGS).every((k) => k in c.settings));
}

// ---- names, both directions ---------------------------------------------------
check('a name is accepted', validateName('Ashe').ok === true);
check('with a space', validateName('Ashe of the Fen').ok === true);
check('with an apostrophe', validateName("O'Dell").ok === true);
check('one letter is refused', validateName('A').ok === false && /at least 2/.test(validateName('A').error));
check('nothing is refused', validateName('').ok === false);
check('spaces alone are refused', validateName('   ').ok === false);
check(`over ${NAME_MAX} letters is refused`, validateName('a'.repeat(NAME_MAX + 1)).ok === false);
check(`exactly ${NAME_MAX} is fine`, validateName('A' + 'a'.repeat(NAME_MAX - 1)).ok === true);
check('digits are refused', validateName('Ashe2').ok === false);
check('and it says what is allowed', /apostrophes/.test(validateName('Ashe2').error), validateName('Ashe2').error);
check('a name that starts with a space is trimmed, not refused', validateName('  Ashe  ').name === 'Ashe');
check('a nameless character cannot begin', planCharacter({ opening: 'warrior', name: '' }).ok === false);

// ---- moving the points --------------------------------------------------------
{
  const base = { str: 65, dex: 50, int: 25, con: 65, wis: 45 };
  const m = movesFrom(base, { ...base, str: 55, dex: 60 }, STAT_IDS, false);
  check('ten points off STR onto DEX is one move', m.moves.length === 1 && m.moves[0].amount === 10, JSON.stringify(m.moves));
  check('and it names both ends', m.moves[0].from === 'str' && m.moves[0].to === 'dex');
  const bad = movesFrom(base, { ...base, dex: 60 }, STAT_IDS, false);
  check('raising with nothing lowered is refused', bad.moves === null, JSON.stringify(bad));
  check('and it says how much has to come from somewhere', /10 more points/.test(bad.error), bad.error);
  const pooled = movesFrom({}, { mining: 30 }, ['mining'], true);
  check('with a pool the same raise is drawn from it', pooled.moves[0].from === 'pool' && pooled.moves[0].amount === 30);
}
{
  const warrior = OPENINGS_BY_ID.warrior;
  const ok = planCharacter({
    opening: 'warrior', name: 'Ashe',
    stats: { ...warrior.stats, str: warrior.stats.str - CUSTOM_STAT_POINTS, dex: warrior.stats.dex + CUSTOM_STAT_POINTS },
  });
  check(`moving exactly ${CUSTOM_STAT_POINTS} stat points is allowed`, ok.ok === true, (ok.errors || []).join('; '));
  check('and the stats land where they were put', ok.character.stats.dex === warrior.stats.dex + 30 && ok.character.stats.str === 35);
  check('and the total is still 250', statTotal(ok.character.stats) === 250);
  const over = planCharacter({
    opening: 'warrior', name: 'Ashe',
    stats: { ...warrior.stats, str: warrior.stats.str - 31, dex: warrior.stats.dex + 31 },
  });
  check('thirty one is refused', over.ok === false, (over.errors || []).join('; '));
  check('and the refusal counts them', /31 of 30/.test(over.errors.join(' ')), over.errors.join('; '));
}
{
  const warrior = OPENINGS_BY_ID.warrior;
  const floor = planCharacter({
    opening: 'warrior', name: 'Ashe',
    stats: { ...warrior.stats, int: 5, con: warrior.stats.con + 20 },
  });
  check('a stat under the floor of 10 is refused', floor.ok === false, (floor.errors || []).join('; '));
  check('and it names the floor', /below the floor of 10/.test(floor.errors.join(' ')), floor.errors.join('; '));
  // A ranger has DEX 70 and thirty points to move, which is exactly the cap.
  const ranger = OPENINGS_BY_ID.ranger;
  const ceiling = planCharacter({
    opening: 'ranger', name: 'Ashe',
    stats: { ...ranger.stats, dex: 100, str: ranger.stats.str - 30 },
  });
  check('a stat taken to the cap of 100 is allowed', ceiling.ok === true, (ceiling.errors || []).join('; '));
  const past = planCharacter({
    opening: 'ranger', name: 'Ashe',
    stats: { ...ranger.stats, dex: 101, str: ranger.stats.str - 31 },
  });
  check('and one point past it is refused', past.ok === false, (past.errors || []).join('; '));
}
{
  const warrior = OPENINGS_BY_ID.warrior;
  const moved = planCharacter({
    opening: 'warrior', name: 'Ashe',
    skills: { ...warrior.skills, swordsmanship: 20, mining: 30 },
  });
  check(`moving ${CUSTOM_SKILL_POINTS} skill points from a skill to another is allowed`, moved.ok === true, (moved.errors || []).join('; '));
  check('and the total is still 200', skillTotal(moved.character.skills) === 200, String(skillTotal(moved.character.skills)));
  const raised = planCharacter({ opening: 'warrior', name: 'Ashe', skills: { ...warrior.skills, mining: 30 } });
  check('a warrior cannot conjure skill points out of nothing', raised.ok === false, (raised.errors || []).join('; '));
  const tooMany = planCharacter({
    opening: 'warrior', name: 'Ashe',
    skills: { ...warrior.skills, swordsmanship: 10, mining: 40 },
  });
  check('forty is over the thirty point budget', tooMany.ok === false, (tooMany.errors || []).join('; '));
  check('and the refusal counts them', /40 of 30/.test(tooMany.errors.join(' ')), tooMany.errors.join('; '));
}

// ---- Blank: the raw budgets ---------------------------------------------------
{
  const blank = OPENINGS_BY_ID.blank;
  check('Blank has 200 stat points to shift, being 250 less the five floors', BLANK_STAT_POINTS === 200);
  check('and 200 skill points to place', blank.freeSkillPoints === 200);
  const p = planCharacter({
    opening: 'blank', name: 'Nobody',
    skills: { magery: 50, meditation: 50, swordsmanship: 50, mining: 50 },
  });
  check('four skills at fifty spends the whole pool', p.ok === true, (p.errors || []).join('; '));
  check('and the sheet totals 200', skillTotal(p.character.skills) === 200, String(skillTotal(p.character.skills)));
  const over = planCharacter({ opening: 'blank', name: 'Nobody', skills: { magery: 50, meditation: 50, swordsmanship: 50, mining: 50, hiding: 10 } });
  check('a two hundred and tenth point is refused', over.ok === false, (over.errors || []).join('; '));
  const tooHigh = planCharacter({ opening: 'blank', name: 'Nobody', skills: { magery: 60 } });
  check('and no skill above fifty at the start', tooHigh.ok === false, (tooHigh.errors || []).join('; '));
  check('and it says the cap', /above the cap of 50/.test(tooHigh.errors.join(' ')), tooHigh.errors.join('; '));
  const spread = planCharacter({ opening: 'blank', name: 'Nobody', stats: { str: 10, dex: 10, int: 10, con: 10, wis: 210 } });
  check('a stat over 100 is refused even for Blank', spread.ok === false, (spread.errors || []).join('; '));
  const legal = planCharacter({ opening: 'blank', name: 'Nobody', stats: { str: 100, dex: 10, int: 10, con: 100, wis: 30 } });
  check('but the whole 200 may be shifted inside the caps', legal.ok === true, (legal.errors || []).join('; '));
}

// ---- appearance ----------------------------------------------------------------
{
  const p = planCharacter({ opening: 'warrior', name: 'Ashe', appearance: { build: 'heavy', skin: 'umber', hairStyle: 'braid', hairColour: 'silver', mark: 'scar', height: 1.94 } });
  check('an appearance is kept whole', p.ok && p.character.appearance.build === 'heavy' && p.character.appearance.height === 1.94, JSON.stringify(p.character?.appearance));
  const bad = planCharacter({ opening: 'warrior', name: 'Ashe', appearance: { build: 'gigantic' } });
  check('a build nobody offers is refused', bad.ok === false, (bad.errors || []).join('; '));
  const tall = planCharacter({ opening: 'warrior', name: 'Ashe', appearance: { height: 2.4 } });
  check('and a height outside 1.6 to 2.0 is refused', tall.ok === false, (tall.errors || []).join('; '));
  check('and it says the range', /1.6 to 2/.test(tall.errors.join(' ')), tall.errors.join('; '));
  const dflt = planCharacter({ opening: 'warrior', name: 'Ashe' });
  check('with nothing chosen the default face is written', dflt.character.appearance.build === 'average' && dflt.character.appearance.height === APPEARANCE.height.default);
}

// ---- the same name rolls the same kit ------------------------------------------
{
  const a = planCharacter({ opening: 'warrior', name: 'Ashe' });
  const b = planCharacter({ opening: 'warrior', name: 'Ashe' });
  const ids = (p) => p.character.pack.items.concat(Object.values(p.character.equipment)).filter(Boolean).map((i) => i.id).join(',');
  check('two characters of the same name get the same kit ids', ids(a) === ids(b));
  const c = planCharacter({ opening: 'warrior', name: 'Bracken' });
  check('and a different name gets different ones', ids(a) !== ids(c));
}

// ---- an opening nobody offers ---------------------------------------------------
{
  const p = planCharacter({ opening: 'druid', name: 'Ashe' });
  check('an opening that does not exist is refused', p.ok === false && /not one of the openings/.test(p.errors[0]), p.errors[0]);
  const none = planCharacter({ name: 'Ashe' });
  check('and so is no opening at all', none.ok === false && /pick an opening/.test(none.errors[0]), none.errors[0]);
}

// ---- the kit is made of real items ------------------------------------------------
{
  const bad = [];
  for (const op of OPENINGS) {
    for (const { item } of kitFor(op).items) {
      if (!baseFor(item)) bad.push(`${op.id}: ${item.base}`);
      if (item.rarity !== 'common') bad.push(`${op.id}: ${item.base} is ${item.rarity}`);
      if (!item.identified) bad.push(`${op.id}: ${item.base} arrives unidentified`);
    }
  }
  check('every kit item is a real, common, known item', bad.length === 0, bad.join(' | '));
}

// ---- the emblems, the colours and the bars ---------------------------------
// Everything above is arithmetic. Everything below is the screen, because the
// first screen a player sees is the one this file was least able to prove
// anything about, and "it has a portrait" is a claim about DOM code.

console.log('creation: the emblems');
check('every opening is drawn', auditEmblems() === OPENINGS.length, `${OPENINGS.length} openings`);
check('and nothing is drawn that is not an opening',
  Object.keys(EMBLEMS).every((id) => !!OPENINGS_BY_ID[id]),
  Object.keys(EMBLEMS).filter((id) => !OPENINGS_BY_ID[id]).join(','));
check('every opening sits in an ability group that has a colour',
  OPENINGS.every((o) => !!GROUP_COLOUR[OPENING_GROUP[o.id]]),
  OPENINGS.filter((o) => !GROUP_COLOUR[OPENING_GROUP[o.id]]).map((o) => o.id).join(','));
check('the warrior wears the warrior colour', openingColour('warrior') === GROUP_COLOUR.warrior, openingColour('warrior'));
check('the mage wears the mage colour', openingColour('mage') === GROUP_COLOUR.mage, openingColour('mage'));
check('the paladin wears the colour of the group his chivalry is filed under',
  openingColour('paladin') === GROUP_COLOUR.healer, openingColour('paladin'));
check('and the artisan and Blank take the parchment neutral, being no archetype',
  openingColour('artisan') === GROUP_COLOUR.everyone && openingColour('blank') === GROUP_COLOUR.everyone,
  `${openingColour('artisan')} ${openingColour('blank')}`);
check('the eleven openings wear nine colours, the paladin sharing the healer s and the artisan sharing Blank s',
  new Set(OPENINGS.map((o) => openingColour(o.id))).size === 9,
  [...new Set(OPENINGS.map((o) => openingColour(o.id)))].join(' '));

// A path a browser will not paint is a blank square, and a blank square is
// exactly the failure this whole file exists to catch. So the path data is
// parsed here rather than eyeballed.
const CMD_ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
function pathFault(d) {
  const toks = String(d).match(/[a-zA-Z]|-?\d*\.?\d+/g) || [];
  if (!toks.length) return 'no tokens';
  let i = 0, cmd = null, drawn = 0;
  const nums = (n, why) => {
    for (let k = 0; k < n; k++) {
      if (i + k >= toks.length || /[a-zA-Z]/.test(toks[i + k])) return `${why} wants ${n} numbers`;
    }
    i += n;
    return null;
  };
  if (!/^[Mm]$/.test(toks[0])) return 'does not start with a move';
  while (i < toks.length) {
    const t = toks[i];
    if (/[a-zA-Z]/.test(t)) {
      const up = t.toUpperCase();
      if (!(up in CMD_ARGS)) return `unknown command "${t}"`;
      cmd = up; i++;
      const bad = nums(CMD_ARGS[up], t);
      if (bad) return bad;
      drawn++;
    } else {
      if (!cmd) return 'numbers before any command';
      const bad = nums(CMD_ARGS[cmd === 'M' ? 'L' : cmd], `a repeated ${cmd}`);
      if (bad) return bad;
      drawn++;
    }
  }
  return drawn > 0 ? null : 'draws nothing';
}
// The validator is proved on data known good and known bad before it is
// trusted with the emblems, because a checker that passes everything is worse
// than no checker.
check('the path checker passes a real path', pathFault('M2 4.6 L6.8 2.8 Z') === null, String(pathFault('M2 4.6 L6.8 2.8 Z')));
check('and refuses one with a number missing', pathFault('M2 4.6 L6.8 Z') !== null, String(pathFault('M2 4.6 L6.8 Z')));
check('and refuses a command nothing draws', pathFault('M2 4 X6 8') !== null, String(pathFault('M2 4 X6 8')));
check('and refuses an empty one', pathFault('') !== null);
{
  const bad = [];
  let paths = 0;
  for (const op of OPENINGS) {
    const frag = EMBLEMS[op.id];
    const opens = (frag.match(/<g\b/g) || []).length;
    const closes = (frag.match(/<\/g>/g) || []).length;
    if (opens !== closes) bad.push(`${op.id}: ${opens} groups opened, ${closes} closed`);
    const ds = [...frag.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
    if (!ds.length) bad.push(`${op.id}: no path data at all`);
    for (const d of ds) {
      paths++;
      const fault = pathFault(d);
      if (fault) bad.push(`${op.id}: ${fault} in "${d.slice(0, 40)}"`);
    }
  }
  check('every emblem is made of path data a browser can follow', bad.length === 0, bad.join(' | '));
  console.log(`       (${paths} paths across ${OPENINGS.length} emblems)`);
}
check('every emblem is one svg on the 24 by 24 field, in the class colour',
  OPENINGS.every((o) => {
    const s = emblemSvg(o.id, 26);
    return /^<svg /.test(s) && /viewBox="0 0 24 24"/.test(s) && s.includes(openingColour(o.id))
      && (s.match(/<svg/g) || []).length === 1 && /<\/svg>$/.test(s.trim());
  }),
  OPENINGS.filter((o) => !emblemSvg(o.id, 26).includes(openingColour(o.id))).map((o) => o.id).join(','));
check('an opening nobody offers draws nothing rather than a broken tag', emblemSvg('druid') === '');

check('the line under a name is the opening s strongest starting skill',
  leadSkillLine(OPENINGS_BY_ID.warrior) === 'Swordsmanship 50'
  && leadSkillLine(OPENINGS_BY_ID.artisan) === 'Mining 45',
  `${leadSkillLine(OPENINGS_BY_ID.warrior)} / ${leadSkillLine(OPENINGS_BY_ID.artisan)}`);
check('and Blank, whose skills are all zero, is told by its pool instead',
  leadSkillLine(OPENINGS_BY_ID.blank) === `${OPENINGS_BY_ID.blank.freeSkillPoints} skill points to place`,
  leadSkillLine(OPENINGS_BY_ID.blank));
check('no card repeats its own name on the line under it',
  OPENINGS.every((o) => leadSkillLine(o).toLowerCase() !== o.name.toLowerCase()),
  OPENINGS.filter((o) => leadSkillLine(o).toLowerCase() === o.name.toLowerCase()).map((o) => o.id).join(','));

console.log('creation: the stat bars');
check(`the floor of ${STAT_FLOOR} is an empty bar`, statPct(STAT_FLOOR) === 0, String(statPct(STAT_FLOOR)));
check(`the cap of ${STAT_CEIL} is a full one`, statPct(STAT_CEIL) === 100, String(statPct(STAT_CEIL)));
check('and the middle is half', statPct((STAT_FLOOR + STAT_CEIL) / 2) === 50, String(statPct(55)));
check('a stat under the floor cannot draw a negative bar', statPct(0) === 0 && statPct(-40) === 0);
check('and one over the cap cannot overflow it', statPct(400) === 100);

// ---- the screen itself ------------------------------------------------------
console.log('creation: the screen');

function makeDom() {
  const make = (tag) => {
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style: {}, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '', hidden: false, type: '', value: '', placeholder: '',
      disabled: false, scrollTop: 0,
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      listeners: {},
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; },
      },
      setAttribute() {}, removeAttribute() {},
      appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = node; node.children.push(c); return c; },
      remove() { if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; } },
      addEventListener(n2, fn) { (node.listeners[n2] ||= []).push(fn); },
      removeEventListener() {},
      fire(n2, ev) { for (const fn of node.listeners[n2] || []) fn(ev || { preventDefault() {}, stopPropagation() {} }); },
    };
    return node;
  };
  const byId = new Map();
  const headAppends = [];
  return {
    createElement: make,
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { headAppends.push(c); if (c.id) byId.set(c.id, c); return c; } },
    body: make('body'),
    headAppends,
  };
}
globalThis.document = makeDom();
globalThis.window = { innerWidth: 1600, innerHeight: 900, addEventListener() {}, removeEventListener() {} };

const { createCreation } = await import('./creation.js');

/** Every node under `n`, depth first. */
function walk(n, out = []) {
  out.push(n);
  for (const c of n.children) walk(c, out);
  return out;
}
const withClass = (n, cls) => walk(n).filter((x) => x.classList.contains(cls));
const kids = (n, cls) => n.children.filter((x) => x.classList.contains(cls));

function screen() {
  const root = document.createElement('div');
  const cr = createCreation(root, {});
  const all = walk(cr.el);
  return { cr, root, all, cards: withClass(cr.el, 'bw-cr-card') };
}

const s1 = screen();
check('the screen is built', !!s1.cr.el && s1.cr.el.id === 'bw-creation', String(s1.cr.el && s1.cr.el.id));
check('and it wears the shared look, so the fonts and the tokens reach it',
  s1.cr.el.classList.contains('bw-ui'), s1.cr.el.className);
check('the sheet is one panel beside the rig', withClass(s1.cr.el, 'bw-cr-panel').length === 1);

// --- the css, once
check('the sheet of css is in the head', !!document.getElementById('bw-creation-css'));
check('and the shared theme went in with it',
  !!document.getElementById('bw-theme-css') && !!document.getElementById('bw-theme-fonts'));
{
  const before = document.headAppends.filter((n) => n.id === 'bw-creation-css').length;
  screen();
  screen();
  const after = document.headAppends.filter((n) => n.id === 'bw-creation-css').length;
  check('and three screens put it there exactly once', before === 1 && after === 1, `${before} then ${after}`);
  const themes = document.headAppends.filter((n) => n.id === 'bw-theme-css').length;
  check('as with the theme', themes === 1, String(themes));
}

// --- the headers, in the order the eye reads them
{
  const want = ['choose your opening', 'the kit', 'stats', 'what that comes to', 'skills', 'appearance', 'name'];
  const got = withClass(s1.cr.el, 'bw-hdr').map((n) => n.textContent.toLowerCase());
  check('the seven section headers are the codex s, in order', got.join('|') === want.join('|'), got.join(' | '));
}

// --- the cards
check('there is a card for every opening, in the openings order',
  s1.cards.length === OPENINGS.length
  && s1.cards.map((c) => c.dataset.opening).join(',') === OPENINGS.map((o) => o.id).join(','),
  s1.cards.map((c) => c.dataset.opening).join(','));
{
  const bad = [];
  for (const card of s1.cards) {
    const op = OPENINGS_BY_ID[card.dataset.opening];
    const colour = openingColour(op.id);

    // the emblem
    const em = withClass(card, 'bw-cr-emblem');
    if (em.length !== 1) bad.push(`${op.id}: ${em.length} emblems`);
    else if (!/<svg /.test(em[0].innerHTML)) bad.push(`${op.id}: the emblem is not a drawing`);
    else if (!em[0].innerHTML.includes(colour)) bad.push(`${op.id}: the emblem is not in the class colour`);
    else if (em[0].dataset.emblem !== op.id) bad.push(`${op.id}: the emblem is not marked with its opening`);

    // the name, in its own element, and the colour band
    const nm = withClass(card, 'bw-cr-name');
    if (nm.length !== 1 || nm[0].textContent !== op.name) bad.push(`${op.id}: the name reads "${nm[0] && nm[0].textContent}"`);
    const band = withClass(card, 'bw-cr-band');
    if (band.length !== 1 || band[0].style.background !== colour) bad.push(`${op.id}: the band is "${band[0] && band[0].style.background}" and not ${colour}`);

    // the blurb
    const bl = withClass(card, 'bw-cr-blurb');
    if (bl.length !== 1 || bl[0].textContent !== op.blurb) bad.push(`${op.id}: the blurb is not the opening s`);

    // the line under the name: the opening's own best skill, worked out here
    // from openings.js rather than read back off the function that wrote it
    const sub = withClass(card, 'bw-cr-group');
    const best = Object.entries(op.skills || {}).reduce((a, b) => (b[1] > a[1] ? b : a), [null, 0]);
    const want = best[1] > 0 ? `${SKILL_NAMES[best[0]]} ${best[1]}` : `${op.freeSkillPoints} skill points to place`;
    if (sub.length !== 1 || sub[0].textContent !== want) bad.push(`${op.id}: the second line reads "${sub[0] && sub[0].textContent}" and not "${want}"`);
    if (sub.length === 1 && sub[0].style.color !== colour) bad.push(`${op.id}: the second line is not in the class colour`);
  }
  check('every card carries an emblem in its class colour, the name, the band, the blurb and its best skill', bad.length === 0, bad.join(' | '));
}
{
  // The bars are measured against openings.js, and the percentage is worked
  // out here from the stat rather than read back off the function that drew
  // it, so a bar that stops filling would fail rather than agree with itself.
  const bad = [];
  for (const card of s1.cards) {
    const op = OPENINGS_BY_ID[card.dataset.opening];
    const bars = withClass(card, 'bw-cr-bar');
    if (bars.length !== 5) { bad.push(`${op.id}: ${bars.length} bars`); continue; }
    if (bars.map((b) => b.dataset.stat).join(',') !== STAT_ORDER.join(',')) {
      bad.push(`${op.id}: the bars run ${bars.map((b) => b.dataset.stat).join(',')}`);
      continue;
    }
    for (const bar of bars) {
      const v = op.stats[bar.dataset.stat];
      const want = `${Math.round(((v - 10) / 90) * 100)}%`;
      const fill = withClass(bar, 'bw-cr-bf')[0];
      if (!fill) { bad.push(`${op.id}/${bar.dataset.stat}: no fill`); continue; }
      if (fill.style.width !== want) bad.push(`${op.id}/${bar.dataset.stat}: ${fill.style.width} for a stat of ${v}, wanted ${want}`);
      if (fill.style.background !== openingColour(op.id)) bad.push(`${op.id}/${bar.dataset.stat}: the fill is not the class colour`);
      const key = withClass(bar, 'bw-cr-bk')[0];
      if (!key || key.textContent !== STAT_LABELS[bar.dataset.stat]) bad.push(`${op.id}/${bar.dataset.stat}: the label reads "${key && key.textContent}"`);
      const num = withClass(bar, 'bw-cr-bv')[0];
      if (!num || num.textContent !== String(v)) bad.push(`${op.id}/${bar.dataset.stat}: the number reads "${num && num.textContent}"`);
    }
  }
  check('every card shows five stat bars whose widths are the opening s own numbers', bad.length === 0, bad.join(' | '));
  // And the other direction: two openings with different stats do not draw the
  // same bar. A width that never moved would pass the check above only if the
  // arithmetic above were also wrong, and this catches that.
  const w = (id, stat) => {
    const card = s1.cards.find((c) => c.dataset.opening === id);
    return withClass(card, 'bw-cr-bar').find((b) => b.dataset.stat === stat).children[1].children[0].style.width;
  };
  check('a warrior s STR bar is longer than a mage s', parseInt(w('warrior', 'str'), 10) > parseInt(w('mage', 'str'), 10),
    `${w('warrior', 'str')} vs ${w('mage', 'str')}`);
  check('and a mage s INT bar is longer than a warrior s', parseInt(w('mage', 'int'), 10) > parseInt(w('warrior', 'int'), 10),
    `${w('mage', 'int')} vs ${w('warrior', 'int')}`);
}
{
  // The icon row is counted against what kitFor actually makes, capped, with
  // the remainder said out loud rather than dropped: the jam-and-bread rule.
  const bad = [];
  const rows = [];
  for (const card of s1.cards) {
    const op = OPENINGS_BY_ID[card.dataset.opening];
    const made = kitFor(op, 1).items.length;
    const row = withClass(card, 'bw-cr-kitrow')[0];
    if (!row) { bad.push(`${op.id}: no kit row`); continue; }
    const icons = kids(row, 'bw-cr-kit-i');
    const want = Math.min(KIT_ICONS_SHOWN, made);
    if (icons.length !== want) bad.push(`${op.id}: ${icons.length} icons for a kit of ${made}, wanted ${want}`);
    if (Number(row.dataset.kit) !== made) bad.push(`${op.id}: the row claims ${row.dataset.kit} of a kit of ${made}`);
    if (icons.some((i) => !/<svg |<img /.test(i.innerHTML))) bad.push(`${op.id}: an icon draws nothing`);
    const more = kids(row, 'bw-cr-kit-more');
    if (made > KIT_ICONS_SHOWN) {
      if (more.length !== 1 || more[0].textContent !== `+${made - KIT_ICONS_SHOWN} more`) {
        bad.push(`${op.id}: ${made} items and the tail reads "${more[0] && more[0].textContent}"`);
      }
    } else if (more.length) bad.push(`${op.id}: ${made} items and it still counts a remainder`);
    rows.push(`${op.id}:${icons.length}/${made}`);
  }
  check('every card shows its kit, capped at eight, and counts the rest', bad.length === 0, bad.join(' | '));
  console.log(`       (${rows.join(' ')})`);
  const over = OPENINGS.filter((o) => kitFor(o, 1).items.length > KIT_ICONS_SHOWN).length;
  check('and the cap is doing work rather than never being reached', over > 0, `${over} of ${OPENINGS.length} openings overflow eight`);
}

// --- one card is lit, and only one
{
  const lit = () => s1.cards.filter((c) => c.classList.contains('on')).map((c) => c.dataset.opening);
  check('the opening you are on is the only card lit', lit().join(',') === 'warrior', lit().join(','));
  s1.cr.pick('necromancer');
  check('and choosing another moves the light, rather than adding one', lit().join(',') === 'necromancer', lit().join(','));
  const card = s1.cards.find((c) => c.dataset.opening === 'bard');
  card.fire('click');
  check('a click on a card picks it', s1.cr.state.opening === 'bard' && lit().join(',') === 'bard', `${s1.cr.state.opening} / ${lit().join(',')}`);
  check('and the stats came with it', JSON.stringify(s1.cr.state.stats) === JSON.stringify(OPENINGS_BY_ID.bard.stats), JSON.stringify(s1.cr.state.stats));
  s1.cr.pick('warrior');
}

// --- the kit spelled out under the cards
{
  const list = withClass(s1.cr.el, 'bw-cr-kit')[0];
  const lines = kids(list, 'bw-cr-kitline');
  const made = kitFor(OPENINGS_BY_ID.warrior, 1);
  check('the kit section has a row for every item the kit makes',
    lines.length === made.items.length + made.missing.length,
    `${lines.length} rows for ${made.items.length} items and ${made.missing.length} missing`);
  check('and every row carries an icon and a name',
    lines.every((l) => l.children.length === 2 && /<svg |<img /.test(l.children[0].innerHTML) && l.children[1].textContent.length > 1),
    lines.map((l) => l.children[1] && l.children[1].textContent).join(' | '));
  check('nothing is greyed today, because nothing in the warrior s kit is unmade',
    lines.filter((l) => l.classList.contains('gone')).length === made.missing.length,
    `${lines.filter((l) => l.classList.contains('gone')).length} greyed`);
  console.log(`       (${lines.map((l) => l.children[1].textContent).join(', ')})`);
}

// --- what that comes to
{
  const table = withClass(s1.cr.el, 'bw-cr-derived')[0];
  const rows = kids(table, 'bw-cr-drow');
  check('the derived numbers are six rows of label and value', rows.length === 6, String(rows.length));
  check('each with a gold label and a number after it',
    rows.every((r) => r.children.length === 3
      && /<svg /.test(r.children[0].innerHTML)
      && r.children[1].classList.contains('bw-cr-dk')
      && r.children[2].classList.contains('bw-cr-dv')
      && r.children[2].textContent.length > 0),
    rows.map((r) => `${r.children[1].textContent}=${r.children[2].textContent}`).join(' '));
  const d = derived(OPENINGS_BY_ID.warrior.stats, OPENINGS_BY_ID.warrior.skills);
  check('and the health it prints is the health the formula gives',
    rows[0].children[2].textContent === String(Math.floor(d.maxHealth)),
    `${rows[0].children[2].textContent} vs ${Math.floor(d.maxHealth)}`);
}

// --- Begin, and the red line under it
{
  const go = withClass(s1.cr.el, 'bw-cr-go')[0];
  const errLine = withClass(s1.cr.el, 'bw-cr-err')[0];
  check('the Begin button is there and says so', !!go && go.textContent === 'Begin');
  check('with nothing typed it is disabled', go.disabled === true);
  check('and the refusal is written out', /at least 2 letters/.test(errLine.textContent), errLine.textContent);
  const panel = withClass(s1.cr.el, 'bw-cr-panel')[0];
  check('the error line sits under the button, not over it',
    panel.children.indexOf(errLine) === panel.children.indexOf(go) + 1,
    `button at ${panel.children.indexOf(go)}, error at ${panel.children.indexOf(errLine)}`);

  const input = walk(s1.cr.el).find((n) => n.tagName === 'INPUT' && n.type === 'text');
  input.value = 'Ashe';
  input.fire('input');
  check('a name typed in enables it', go.disabled === false && s1.cr.state.name === 'Ashe', `${go.disabled} / ${s1.cr.state.name}`);
  check('and the red line goes quiet', errLine.textContent === '', errLine.textContent);
  input.value = 'Ashe9';
  input.fire('input');
  check('and a name with a digit turns it off again and says why',
    go.disabled === true && /apostrophes/.test(errLine.textContent), errLine.textContent);
  input.value = 'Ashe';
  input.fire('input');

  let handed = null;
  const root2 = document.createElement('div');
  const cr2 = createCreation(root2, { onDone: (c) => { handed = c; } });
  const in2 = walk(cr2.el).find((n) => n.tagName === 'INPUT' && n.type === 'text');
  in2.value = 'Rowan';
  in2.fire('input');
  cr2.pick('ranger');
  withClass(cr2.el, 'bw-cr-go')[0].fire('click');
  check('Begin hands over a character built by the same planCharacter the tests above use',
    !!handed && handed.name === 'Rowan' && handed.opening === 'ranger'
    && handed.pack.items.filter(Boolean).length + Object.values(handed.equipment).filter(Boolean).length > 0,
    handed ? `${handed.name} the ${handed.opening}` : 'nothing');
  check('and the screen takes itself off the page', root2.children.length === 0, String(root2.children.length));
}

// --- the sliders and the steppers are still the rules ------------------------
{
  const rows = withClass(s1.cr.el, 'bw-row');
  const ranges = walk(s1.cr.el).filter((n) => n.tagName === 'INPUT' && n.type === 'range');
  check('there are five stat sliders and one for height', ranges.length === 6, String(ranges.length));
  check('every stat slider runs the floor to the cap',
    ranges.slice(0, 5).every((r) => r.min === '10' && r.max === '100'), ranges.slice(0, 5).map((r) => `${r.min}-${r.max}`).join(' '));
  const steps = withClass(s1.cr.el, 'bw-step');
  check('and every one of the fifty two skills has its four steppers',
    steps.length === SKILLS.length && steps.every((s) => s.children.length === 4),
    `${steps.length} rows of steppers`);
  const selects = walk(s1.cr.el).filter((n) => n.tagName === 'SELECT');
  check('the face is five selects', selects.length === 5, String(selects.length));
  check('the rows still hold a name and a value', rows.length > 5 && rows.every((r) => r.children.length === 3));
}
{
  // The stepper still refuses what the rules refuse, and says so in the red
  // line. Both directions, on the real buttons.
  const cr = createCreation(document.createElement('div'), {});
  const step = withClass(cr.el, 'bw-step')[0];
  const errLine = withClass(cr.el, 'bw-cr-err')[0];
  const before = { ...cr.state.skills };
  step.children[3].fire('click');   // +5 with nothing lowered
  check('a warrior cannot step a skill up out of nothing',
    JSON.stringify(cr.state.skills) === JSON.stringify(before) && errLine.textContent.length > 0,
    errLine.textContent);
  step.children[0].fire('click');   // -5, which is allowed
  const moved = Object.keys(cr.state.skills).filter((k) => (cr.state.skills[k] || 0) !== (before[k] || 0));
  check('and stepping one down is allowed', moved.length === 1, moved.join(','));
  step.children[3].fire('click');   // +5 back, now that a donor exists
  check('after which the same step up is taken',
    JSON.stringify(cr.state.skills) === JSON.stringify(before), JSON.stringify(moved));
  cr.destroy();
}

delete globalThis.document;
delete globalThis.window;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
