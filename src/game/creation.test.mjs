// Character creation. Run: node src/game/creation.test.mjs
//
// planCharacter is the whole of creation with the DOM taken off the front, and
// it is the same function the Begin button calls, so what passes here is what
// a player gets. The kit goes in through the real inventory, which is why the
// shortfalls below are counted rather than assumed.

import {
  planCharacter, kitFor, movesFrom, validateName, auditKits, shortfallLine,
  KIT_BASES, MISSING_BASES, STAND_INS, PREFERRED, FALLBACK, DEFAULT_SETTINGS, NAME_MAX,
} from './creation.js';
import {
  OPENINGS, OPENINGS_BY_ID, STAT_IDS, SKILL_IDS, ITEM_BASES,
  CUSTOM_STAT_POINTS, CUSTOM_SKILL_POINTS, BLANK_STAT_POINTS, APPEARANCE,
} from '../mmo/openings.js';
import { statTotal, derived, STAT_START_TOTAL } from '../mmo/stats.js';
import { total as skillTotal, SKILLS } from '../mmo/skills.js';
import { BASES, SLOTS, baseFor } from '../mmo/items.js';
import { BAR_SLOTS } from './win_abilities.js';

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
  check('the pack has twenty slots', c.pack.slots === 20 && c.pack.items.length === 20);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
