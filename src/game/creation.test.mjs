// Character creation. Run: node src/game/creation.test.mjs
//
// planCharacter is the whole of creation with the DOM taken off the front, and
// it is the same function the Begin button calls, so what passes here is what
// a player gets. The kit goes in through the real inventory, which is why the
// shortfalls below are counted rather than assumed.

import {
  planCharacter, kitFor, movesFrom, validateName, auditKits, shortfallLine,
  KIT_BASES, MISSING_BASES, STAND_INS, PREFERRED, FALLBACK, DEFAULT_SETTINGS, NAME_MAX,
  OPENING_GROUP, EMBLEMS, emblemSvg, openingColour, auditEmblems,
  statPct, STAT_FLOOR, STAT_CEIL, KIT_ICONS_SHOWN,
  GAME_TITLE, QUOTES, CLASS_NOTE, statWords, artId, artUrl, auditClassText, YAW_STEP,
} from './creation.js';
import { GROUP_COLOUR } from './win_abilities.js';
import { STAT_IDS as STAT_ORDER, STAT_LABELS, STAT_NAMES, SKILL_NAMES } from '../mmo/openings.js';
import {
  OPENINGS, OPENINGS_BY_ID, STAT_IDS, SKILL_IDS, ITEM_BASES,
  CUSTOM_STAT_POINTS, CUSTOM_SKILL_POINTS, BLANK_STAT_POINTS, APPEARANCE, APPEARANCE_DEFAULT,
} from '../mmo/openings.js';
import { statTotal, derived, STAT_START_TOTAL } from '../mmo/stats.js';
import { total as skillTotal, SKILLS, SKILL_GROUPS } from '../mmo/skills.js';
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

// REWRITTEN, and the reason is the layout. The cards are small now (an emblem,
// a name, one line of blurb clipped to two) and the line that used to sit under
// a card's name is gone, so `leadSkillLine` went with it rather than staying on
// as a writer nothing reads. What a class is best at is said for the chosen
// class only, in the right hand panel, by the three stat words below. The three
// checks that measured the old line are replaced by the fourteen below, which
// measure the words that took its place.
console.log('creation: what a class says of itself');
check('every opening is written as well as drawn', auditClassText() === OPENINGS.length, `${OPENINGS.length} openings`);
check('all eleven carry a quote', OPENINGS.every((o) => typeof QUOTES[o.id] === 'string' && QUOTES[o.id].length > 12),
  OPENINGS.filter((o) => !(QUOTES[o.id] || '').length).map((o) => o.id).join(','));
check('and no two of them are the same line',
  new Set(OPENINGS.map((o) => QUOTES[o.id])).size === OPENINGS.length,
  String(new Set(OPENINGS.map((o) => QUOTES[o.id])).size));
check('and every one is short enough for the line it sits on',
  OPENINGS.every((o) => QUOTES[o.id].length <= 72),
  OPENINGS.map((o) => `${o.id}:${QUOTES[o.id].length}`).join(' '));
check('and none of the eleven is written with a dash the house style forbids',
  OPENINGS.every((o) => !/[\u2014\u2013]/.test(QUOTES[o.id] + CLASS_NOTE[o.id])),
  OPENINGS.filter((o) => /[\u2014\u2013]/.test(QUOTES[o.id] + CLASS_NOTE[o.id])).map((o) => o.id).join(','));
check('nothing is quoted that is not an opening',
  Object.keys(QUOTES).every((id) => !!OPENINGS_BY_ID[id]),
  Object.keys(QUOTES).filter((id) => !OPENINGS_BY_ID[id]).join(','));
check('all eleven carry the sentence that says what the class is for',
  OPENINGS.every((o) => typeof CLASS_NOTE[o.id] === 'string' && CLASS_NOTE[o.id].length > 20),
  OPENINGS.filter((o) => !(CLASS_NOTE[o.id] || '').length).map((o) => o.id).join(','));
check('and that sentence is not the blurb said twice',
  OPENINGS.every((o) => CLASS_NOTE[o.id] !== o.blurb));
{
  // The three words are worked out here from openings.js rather than read back
  // off the function that wrote them, so a spread that changed and words that
  // did not would fail rather than agree with itself.
  const bad = [];
  for (const op of OPENINGS) {
    const want = Object.entries(op.stats)
      .sort((a, b) => (b[1] - a[1]) || (STAT_ORDER.indexOf(a[0]) - STAT_ORDER.indexOf(b[0])))
      .slice(0, 3)
      .map(([id]) => STAT_NAMES[id].toUpperCase());
    const got = statWords(op);
    if (got.join('|') !== want.join('|')) bad.push(`${op.id}: ${got.join(' ')} and not ${want.join(' ')}`);
  }
  check('the three words under a class name are its three highest stats, in order', bad.length === 0, bad.join(' | '));
}
check('they are the full words and not the table s three letters',
  statWords('warrior')[0] === 'STRENGTH', statWords('warrior').join(' '));
check('a warrior leads on strength and a mage on intellect',
  statWords('warrior')[0] === 'STRENGTH' && statWords('mage')[0] === 'INTELLECT',
  `${statWords('warrior')[0]} / ${statWords('mage')[0]}`);
check('and a class whose five stats are all fifty still names three of them',
  statWords('blank').length === 3, statWords('blank').join(' '));
check('an opening nobody offers has no words at all', statWords('druid').length === 0);
check('the title on the plaque comes from one constant', GAME_TITLE === 'Kaldera', GAME_TITLE);
check('the art slot wears an id of its own per class, and the eleven are distinct',
  new Set(OPENINGS.map((o) => artId(o.id))).size === OPENINGS.length
  && artId('warrior') === 'bw-cr-art-warrior',
  artId('warrior'));
check('and every placeholder is a data uri drawn in that class s colour',
  OPENINGS.every((o) => /^url\("data:image\/svg\+xml,/.test(artUrl(o.id))
    && artUrl(o.id).includes(encodeURIComponent(openingColour(o.id)))),
  OPENINGS.filter((o) => !artUrl(o.id).includes(encodeURIComponent(openingColour(o.id)))).map((o) => o.id).join(','));
check('an arrow turns a hero thirty degrees', YAW_STEP === 30, String(YAW_STEP));

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
      disabled: false, scrollTop: 0, focused: null,
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
      // A browser scrolls an ancestor to bring a focused field into view unless
      // it is told not to, which is exactly the bug CR1 found. The fake does
      // the same, so the check below is a check and not a formality.
      focus(opts) {
        node.focused = { preventScroll: !!(opts && opts.preventScroll) };
        if (!node.focused.preventScroll) {
          for (let p = node.parent; p; p = p.parent) p.scrollTop = 9999;
        }
      },
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
const one = (n, cls) => withClass(n, cls)[0];
const ranges = (n) => walk(n).filter((x) => x.tagName === 'INPUT' && x.type === 'range');
const textInput = (n) => walk(n).find((x) => x.tagName === 'INPUT' && x.type === 'text');

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

// --- REWRITTEN. The sheet used to be one column beside the rig. It is the
// whole window now, in three columns with the rig standing in the middle of
// them, so what "one panel" means had to be measured again.
{
  const panel = one(s1.cr.el, 'bw-cr-panel');
  check('the panel is the whole window and there is one of it', withClass(s1.cr.el, 'bw-cr-panel').length === 1);
  const want = ['bw-cr-plaque', 'bw-cr-left', 'bw-cr-stage', 'bw-cr-right', 'bw-cr-foot'];
  const got = panel.children.map((c) => want.find((w) => c.classList.contains(w)) || c.className);
  check('and it holds the plaque, the three columns and the footer, in that order',
    got.join(',') === want.join(','), got.join(','));
  check('the plaque carries the title and the question under it',
    walk(one(s1.cr.el, 'bw-cr-plaque')).some((n) => n.tagName === 'H1' && n.textContent === GAME_TITLE)
    && /Who walks out of the trees/.test(one(s1.cr.el, 'bw-cr-ask').textContent),
    one(s1.cr.el, 'bw-cr-plaque').textContent);
  check('the eleven cards are in the left column and nowhere else',
    withClass(one(s1.cr.el, 'bw-cr-left'), 'bw-cr-card').length === OPENINGS.length
    && withClass(one(s1.cr.el, 'bw-cr-right'), 'bw-cr-card').length === 0,
    String(withClass(one(s1.cr.el, 'bw-cr-left'), 'bw-cr-card').length));
  check('the class name, the art, the quote, the bars, the gear, the name and the button are in the right column',
    ['bw-cr-cname', 'bw-cr-art', 'bw-cr-quote', 'bw-cr-about', 'bw-cr-bars', 'bw-cr-kitrow', 'bw-cr-derived', 'bw-cr-go']
      .every((c) => withClass(one(s1.cr.el, 'bw-cr-right'), c).length === 1)
    && !!textInput(one(s1.cr.el, 'bw-cr-right')),
    ['bw-cr-cname', 'bw-cr-art', 'bw-cr-quote', 'bw-cr-about', 'bw-cr-bars', 'bw-cr-kitrow', 'bw-cr-derived', 'bw-cr-go']
      .filter((c) => withClass(one(s1.cr.el, 'bw-cr-right'), c).length !== 1).join(','));
  const stage = one(s1.cr.el, 'bw-cr-stage');
  check('the middle column paints nothing over the rig but the arrows and the two pills',
    stage.children.length === 3
    && stage.children[0].classList.contains('bw-cr-void')
    && stage.children[1].classList.contains('bw-cr-turn')
    && stage.children[2].classList.contains('bw-cr-look'),
    stage.children.map((c) => c.className).join(' | '));
  check('and the footer says a line at each end',
    one(s1.cr.el, 'bw-cr-foot').children.length === 2
    && one(s1.cr.el, 'bw-cr-foot').children.every((c) => c.textContent.length > 10),
    one(s1.cr.el, 'bw-cr-foot').children.map((c) => c.textContent).join(' / '));
}

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
{
  // The layout is CSS, and node cannot lay anything out, so what CAN be
  // measured here is that the rules the layout depends on are in the sheet
  // that goes to the browser. The three columns at their three widths, the
  // stacking under 1100, and the one line that fixed CR1's squeezed list.
  const css = document.getElementById('bw-creation-css').textContent;
  check('the sheet declares three columns at 300 and 400',
    /grid-template-columns:\s*300px minmax\(0, 1fr\) 400px/.test(css));
  check('and narrows them to 260 and 360 rather than dropping one, which is what makes 1280 fit',
    /max-width:\s*1400px/.test(css) && /grid-template-columns:\s*260px minmax\(0, 1fr\) 360px/.test(css));
  check('and stacks them under 1100 with the preview on the top row',
    /max-width:\s*1099px/.test(css) && /\.bw-cr-stage \{ grid-column: 1; grid-row: 2;/.test(css));
  check('the middle column is left transparent, so the scene shows through it',
    /#bw-creation \.bw-cr-stage \{[^}]*pointer-events: none/.test(css) && !/\.bw-cr-stage \{[^}]*background:/.test(css));
  check('and the columns still refuse to squeeze a child with a max-height, which is the CR1 bug',
    /#bw-creation \.bw-cr-left > \*, #bw-creation \.bw-cr-scroll > \* \{ flex: 0 0 auto; \}/.test(css));
  check('while the reading half of the right column is the one that scrolls, so the button never leaves the glass',
    /\.bw-cr-scroll \{\s*flex: 1 1 auto; min-height: 0; overflow-y: auto/.test(css)
    && /\.bw-cr-act \{\s*flex: 0 0 auto;/.test(css));
}

// --- REWRITTEN. Seven headers became five: THE KIT is now the icon row under
// STARTING GEAR, and APPEARANCE is the two pills under the preview, which name
// themselves and want no header over them.
{
  const want = ['choose your opening', 'base stats', 'what that comes to', 'starting gear', 'name'];
  const got = withClass(s1.cr.el, 'bw-hdr').map((n) => n.textContent.toLowerCase());
  check('the five section headers are the codex s, in order', got.join('|') === want.join('|'), got.join(' | '));
}

// --- the cards
check('there is a card for every opening, in the openings order',
  s1.cards.length === OPENINGS.length
  && s1.cards.map((c) => c.dataset.opening).join(',') === OPENINGS.map((o) => o.id).join(','),
  s1.cards.map((c) => c.dataset.opening).join(','));
{
  // REWRITTEN: a card carried an emblem, a name, a band, a blurb, a lead skill
  // line, five stat bars and eight kit icons. It carries the first four now,
  // and the rest moved to the right hand panel where they are about the one
  // class you have chosen. Those four are still measured exactly as before.
  const bad = [];
  for (const card of s1.cards) {
    const op = OPENINGS_BY_ID[card.dataset.opening];
    const colour = openingColour(op.id);

    const em = withClass(card, 'bw-cr-emblem');
    if (em.length !== 1) bad.push(`${op.id}: ${em.length} emblems`);
    else if (!/<svg /.test(em[0].innerHTML)) bad.push(`${op.id}: the emblem is not a drawing`);
    else if (!em[0].innerHTML.includes(colour)) bad.push(`${op.id}: the emblem is not in the class colour`);
    else if (em[0].dataset.emblem !== op.id) bad.push(`${op.id}: the emblem is not marked with its opening`);

    const nm = withClass(card, 'bw-cr-name');
    if (nm.length !== 1 || nm[0].textContent !== op.name) bad.push(`${op.id}: the name reads "${nm[0] && nm[0].textContent}"`);
    const band = withClass(card, 'bw-cr-band');
    if (band.length !== 1 || band[0].style.background !== colour) bad.push(`${op.id}: the band is "${band[0] && band[0].style.background}" and not ${colour}`);

    const bl = withClass(card, 'bw-cr-blurb');
    if (bl.length !== 1 || bl[0].textContent !== op.blurb) bad.push(`${op.id}: the blurb is not the opening s`);
  }
  check('every card carries an emblem in its class colour, the name, the band and the blurb', bad.length === 0, bad.join(' | '));
  check('and nothing else, so eleven of them fit a 300 pixel column',
    s1.cards.every((c) => c.children.length === 4),
    s1.cards.map((c) => c.children.length).join(','));
}

// --- REWRITTEN. The stat bars were five on every card, drawn from the
// opening's own numbers and never touched again. They are five in the right
// hand panel now, they belong to the chosen class, and each one is also the
// slider that moves it. The arithmetic is measured the same way: recomputed
// here from openings.js rather than read back off the code that drew it.
{
  const bad = [];
  const s = screen();
  for (const op of OPENINGS) {
    s.cr.pick(op.id);
    const bars = withClass(s.cr.el, 'bw-cr-bar');
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
      const slider = walk(bar).find((n) => n.tagName === 'INPUT' && n.type === 'range');
      if (!slider) bad.push(`${op.id}/${bar.dataset.stat}: the bar is not also a slider`);
      else if (Number(slider.value) !== v) bad.push(`${op.id}/${bar.dataset.stat}: the slider sits at ${slider.value} and the bar at ${v}`);
    }
  }
  check('the five bars are the chosen opening s own numbers, and each is its own slider', bad.length === 0, bad.join(' | '));
  const w = (id, stat) => {
    s.cr.pick(id);
    return withClass(s.cr.el, 'bw-cr-bar').find((b) => b.dataset.stat === stat).children[1].children[0].style.width;
  };
  check('a warrior s STR bar is longer than a mage s', parseInt(w('warrior', 'str'), 10) > parseInt(w('mage', 'str'), 10),
    `${w('warrior', 'str')} vs ${w('mage', 'str')}`);
  check('and a mage s INT bar is longer than a warrior s', parseInt(w('mage', 'int'), 10) > parseInt(w('warrior', 'int'), 10),
    `${w('mage', 'int')} vs ${w('warrior', 'int')}`);
  s.cr.destroy();
}

// --- REWRITTEN. The kit's icons were a row on every one of the eleven cards.
// They are one row, STARTING GEAR, in the right hand panel, for the class in
// hand. The cap and the tail are counted exactly as they were.
{
  const bad = [];
  const rows = [];
  const s = screen();
  for (const op of OPENINGS) {
    s.cr.pick(op.id);
    const made = kitFor(op, 1).items.length;
    const row = one(s.cr.el, 'bw-cr-kitrow');
    if (!row) { bad.push(`${op.id}: no gear row`); continue; }
    const icons = kids(row, 'bw-cr-kit-i');
    const want = Math.min(KIT_ICONS_SHOWN, made);
    if (icons.length !== want) bad.push(`${op.id}: ${icons.length} icons for a kit of ${made}, wanted ${want}`);
    if (Number(row.dataset.kit) !== made) bad.push(`${op.id}: the row claims ${row.dataset.kit} of a kit of ${made}`);
    if (icons.some((i) => !/<svg |<img /.test(i.innerHTML))) bad.push(`${op.id}: an icon draws nothing`);
    if (icons.some((i) => !i.title)) bad.push(`${op.id}: an icon says nothing when you hover it`);
    const more = kids(row, 'bw-cr-kit-more');
    if (made > KIT_ICONS_SHOWN) {
      if (more.length !== 1 || more[0].textContent !== `+${made - KIT_ICONS_SHOWN} more`) {
        bad.push(`${op.id}: ${made} items and the tail reads "${more[0] && more[0].textContent}"`);
      }
    } else if (more.length) bad.push(`${op.id}: ${made} items and it still counts a remainder`);
    // and the greyed cell for anything the tables cannot make, which is the
    // jam and bread rule: nothing may simply not arrive
    const gone = kids(row, 'bw-cr-kit-gone');
    if (gone.length !== kitFor(op, 1).missing.length) bad.push(`${op.id}: ${gone.length} greyed for ${kitFor(op, 1).missing.length} unmade`);
    rows.push(`${op.id}:${icons.length}/${made}`);
  }
  check('the gear row shows the chosen kit, capped at eight, and counts the rest', bad.length === 0, bad.join(' | '));
  console.log(`       (${rows.join(' ')})`);
  const over = OPENINGS.filter((o) => kitFor(o, 1).items.length > KIT_ICONS_SHOWN).length;
  check('and the cap is doing work rather than never being reached', over > 0, `${over} of ${OPENINGS.length} openings overflow eight`);
  const unmade = OPENINGS.filter((o) => kitFor(o, 1).missing.length).length;
  check('nothing is greyed today, because every kit base the eleven name now resolves', unmade === 0, `${unmade} openings come up short`);
  s.cr.destroy();
}

// --- the right hand panel follows the class in hand
{
  const bad = [];
  const s = screen();
  for (const op of OPENINGS) {
    s.cr.pick(op.id);
    const nm = one(s.cr.el, 'bw-cr-cname');
    if (nm.textContent !== op.name) bad.push(`${op.id}: the panel is headed "${nm.textContent}"`);
    const wd = one(s.cr.el, 'bw-cr-words');
    if (wd.textContent !== statWords(op).join(' · ')) bad.push(`${op.id}: the words read "${wd.textContent}"`);
    const art = one(s.cr.el, 'bw-cr-art');
    if (art.id !== artId(op.id)) bad.push(`${op.id}: the art slot is "${art.id}"`);
    if (art.dataset.art !== op.id) bad.push(`${op.id}: the art slot is not marked with its class`);
    if (art.style.backgroundImage !== artUrl(op.id)) bad.push(`${op.id}: the art slot holds no placeholder`);
    const q = one(s.cr.el, 'bw-cr-quote');
    if (q.textContent !== QUOTES[op.id]) bad.push(`${op.id}: the quote reads "${q.textContent}"`);
    const ab = one(s.cr.el, 'bw-cr-about');
    if (ab.textContent !== `${op.blurb} ${CLASS_NOTE[op.id]}`) bad.push(`${op.id}: the blurb is missing its sentence`);
  }
  check('the panel says the class name, the three words, the art, the quote and the blurb of whichever card is lit',
    bad.length === 0, bad.join(' | '));
  s.cr.destroy();
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
  check('and so did the right hand panel', one(s1.cr.el, 'bw-cr-cname').textContent === 'Bard', one(s1.cr.el, 'bw-cr-cname').textContent);
  s1.cr.pick('warrior');
}

// --- what that comes to
{
  const table = one(s1.cr.el, 'bw-cr-derived');
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

// --- the two arrows, and the yaw they turn
{
  const s = screen();
  const arrows = withClass(s.cr.el, 'bw-cr-arrow');
  check('there are two arrows under the preview, one each way',
    arrows.length === 2 && arrows.map((a) => a.dataset.turn).join(',') === '-1,1',
    arrows.map((a) => a.dataset.turn).join(','));
  check('and each is a drawing rather than a character somebody typed',
    arrows.every((a) => /<svg /.test(a.innerHTML) && /<path /.test(a.innerHTML)));
  check('the rig starts facing the camera', s.cr.yaw === 0, String(s.cr.yaw));
  arrows[0].fire('click');
  check(`one click of the left arrow turns it ${YAW_STEP} degrees`, s.cr.yaw === -YAW_STEP, String(s.cr.yaw));
  arrows[0].fire('click');
  check('and a second click is sixty and not three hundred', s.cr.yaw === -2 * YAW_STEP, String(s.cr.yaw));
  arrows[1].fire('click');
  arrows[1].fire('click');
  check('and the other arrow brings it back the same way', s.cr.yaw === 0, String(s.cr.yaw));
  // The other direction: nothing else moves the rig, so a player who has aimed
  // it keeps their aim through a choice and through the points.
  arrows[1].fire('click');
  s.cr.pick('mage');
  const slider = ranges(s.cr.el)[0];
  slider.value = '40';
  slider.fire('input');
  check('and nothing but an arrow turns it', s.cr.yaw === YAW_STEP, String(s.cr.yaw));
  s.cr.destroy();
}

// --- the two pills under the preview
//
// REWRITTEN (CR3). The face was six pills: build, skin, hair, hair colour,
// marks and height, each a labelled select. It is two buttons now, MALE and
// FEMALE, because the models that would make the other five mean anything are
// not drawn yet and a control over a body that cannot change is a lie. The
// other five fields are still in the document, at their defaults, and that is
// checked here too: what left the screen did not leave the save.
{
  const s = screen();
  const named = textInput(s.cr.el);
  named.value = 'Ashe';
  named.fire('input');
  const pills = withClass(s.cr.el, 'bw-cr-pill');
  const selects = walk(s.cr.el).filter((n) => n.tagName === 'SELECT');
  check('the face is two pills under the preview, male and female',
    pills.length === 2
    && pills.every((p) => p.tagName === 'BUTTON' && p.dataset.look === 'gender')
    && pills.map((p) => p.dataset.gender).join(',') === 'male,female'
    && pills.map((p) => p.textContent).join(',') === 'MALE,FEMALE',
    pills.map((p) => `${p.tagName}:${p.dataset.gender}:${p.textContent}`).join(' | '));
  check('and the six selects the old face wore are gone from the document',
    selects.length === 0, `${selects.length} selects left`);
  check('male is lit on open, because that is the default',
    pills[0].classList.contains('on') && !pills[1].classList.contains('on'),
    pills.map((p) => `${p.dataset.gender}=${p.classList.contains('on')}`).join(' '));
  pills[1].fire('click');
  check('clicking female lights female and puts male out',
    pills[1].classList.contains('on') && !pills[0].classList.contains('on'),
    pills.map((p) => `${p.dataset.gender}=${p.classList.contains('on')}`).join(' '));
  check('and the character that is planned carries the gender',
    s.cr.state.appearance.gender === 'female' && s.cr.plan().character.appearance.gender === 'female',
    String(s.cr.plan().character?.appearance?.gender));
  pills[0].fire('click');
  check('and clicking back is male again, on the screen and in the plan',
    pills[0].classList.contains('on') && s.cr.plan().character.appearance.gender === 'male',
    String(s.cr.plan().character?.appearance?.gender));
  const look = s.cr.plan().character.appearance;
  check('the five fields the screen no longer offers are still written, at their defaults',
    look.build === APPEARANCE_DEFAULT.build && look.skin === APPEARANCE_DEFAULT.skin
    && look.hairStyle === APPEARANCE_DEFAULT.hairStyle && look.hairColour === APPEARANCE_DEFAULT.hairColour
    && look.mark === APPEARANCE_DEFAULT.mark && look.height === APPEARANCE_DEFAULT.height,
    JSON.stringify(look));
  // A change of class rebuilds the middle column. The pill that was lit has to
  // still be lit afterwards, or the choice is quietly thrown away.
  pills[1].fire('click');
  const mageCard = withClass(s.cr.el, 'bw-cr-card').find((c) => c.dataset.opening === 'mage');
  mageCard.fire('click');
  const after = withClass(s.cr.el, 'bw-cr-pill');
  check('and a change of class keeps the gender, and keeps it lit',
    s.cr.state.appearance.gender === 'female'
    && after.length === 2 && after[1].classList.contains('on') && !after[0].classList.contains('on'),
    `${s.cr.state.appearance.gender}, ${after.map((p) => p.classList.contains('on')).join(',')}`);
  s.cr.destroy();
}

// --- the stat sliders, and the budget they answer to
{
  const s = screen();
  const nameIn = textInput(s.cr.el);
  nameIn.value = 'Ashe';
  nameIn.fire('input');
  const go = one(s.cr.el, 'bw-cr-go');
  const errLine = one(s.cr.el, 'bw-cr-err');
  const slider = (stat) => walk(withClass(s.cr.el, 'bw-cr-bar').find((b) => b.dataset.stat === stat))
    .find((n) => n.tagName === 'INPUT' && n.type === 'range');
  const drag = (stat, to) => { const r = slider(stat); r.value = String(to); r.fire('input'); };

  check('five stat sliders and no more, the bar being the slider', ranges(s.cr.el).length === 5, String(ranges(s.cr.el).length));
  check('every one runs the floor to the cap',
    ranges(s.cr.el).every((r) => r.min === String(STAT_FLOOR) && r.max === String(STAT_CEIL)),
    ranges(s.cr.el).map((r) => `${r.min}-${r.max}`).join(' '));

  // A stat dragged down with the points put nowhere. planCharacter answers ok
  // and quietly hands back the ORIGINAL number, which is what this screen used
  // to do while showing the new one. Measured on the shipped code before it
  // was fixed; the fix is in the screen, and the rules were not touched.
  drag('str', 55);
  check('a stat dragged down alone moves the bar', s.cr.state.stats.str === 55, String(s.cr.state.stats.str));
  check('and the ten points that came off are named as lying loose',
    /10 stat points you took off are lying loose/.test(errLine.textContent), errLine.textContent);
  check('and you cannot leave with them, because the character would not have them',
    go.disabled === true && planCharacter(s.cr.state).character.stats.str === 65,
    `${go.disabled} / ${planCharacter(s.cr.state).character.stats.str}`);
  drag('dex', 60);
  check('putting them on another stat spends them', s.cr.state.stats.dex === 60 && errLine.textContent === '', errLine.textContent);
  check('and the character that is planned now has the numbers on the screen',
    planCharacter(s.cr.state).character.stats.str === 55 && planCharacter(s.cr.state).character.stats.dex === 60,
    JSON.stringify(planCharacter(s.cr.state).character.stats));
  check('and the button is live', go.disabled === false);
  check('the budget line counts what is left', /20 of 30 stat points left to move/.test(one(s.cr.el, 'bw-cr-budget').textContent),
    one(s.cr.el, 'bw-cr-budget').textContent);

  // exactly thirty, then one more
  drag('str', 35);
  drag('dex', 80);
  check('thirty points moved is allowed', go.disabled === false && one(s.cr.el, 'bw-cr-budget').textContent.startsWith('0 of 30'),
    one(s.cr.el, 'bw-cr-budget').textContent);
  drag('str', 34);
  drag('dex', 81);
  check('and the thirty first is refused, counted, and the button goes dead',
    go.disabled === true && /31 of 30/.test(errLine.textContent), errLine.textContent);
  drag('str', 35);
  drag('dex', 80);
  check('and stepping back inside the budget makes it live again', go.disabled === false, errLine.textContent);
  s.cr.destroy();
}

// --- the skills, behind their disclosure
{
  const s = screen();
  const disc = one(s.cr.el, 'bw-cr-disc');
  const wrap = one(s.cr.el, 'bw-cr-skillwrap');
  check('the skills sit behind a disclosure that says what it opens', disc.textContent === 'Adjust skills', disc.textContent);
  check('and it is shut when the screen opens, so the panel is not a wall of fifty two rows',
    wrap.hidden === true && s.cr.skillsOpen === false);
  check('the fifty two rows are built all the same, so opening it is not a wait',
    withClass(s.cr.el, 'bw-row').length === SKILLS.length, String(withClass(s.cr.el, 'bw-row').length));
  disc.fire('click');
  check('a click opens it', wrap.hidden === false && s.cr.skillsOpen === true);
  check('and all fifty two are inside it, in their nine groups, each with its four steppers',
    withClass(wrap, 'bw-row').length === SKILLS.length
    && withClass(wrap, 'bw-cr-grp').length === SKILL_GROUPS.length
    && withClass(wrap, 'bw-step').every((x) => x.children.length === 4),
    `${withClass(wrap, 'bw-row').length} rows in ${withClass(wrap, 'bw-cr-grp').length} groups`);
  check('and the budget line for them is inside it too, where the points are moved',
    withClass(wrap, 'bw-cr-budget').length === 1 && /skill points left to move/.test(withClass(wrap, 'bw-cr-budget')[0].textContent),
    withClass(wrap, 'bw-cr-budget')[0].textContent);
  check('the rows are a name, the steppers and a value',
    withClass(wrap, 'bw-row').every((r) => r.children.length === 3));
  disc.fire('click');
  check('and a second click shuts it again', wrap.hidden === true && s.cr.skillsOpen === false);
  // and the choice survives a change of class, because the list is refilled
  // rather than rebuilt
  disc.fire('click');
  s.cr.pick('mage');
  check('a class chosen while it is open leaves it open, with the new class s numbers',
    s.cr.skillsOpen === true && withClass(wrap, 'bw-row').length === SKILLS.length,
    String(withClass(wrap, 'bw-row').length));
  s.cr.destroy();
}

// --- Create character, and the red line under it
{
  const go = one(s1.cr.el, 'bw-cr-go');
  const errLine = one(s1.cr.el, 'bw-cr-err');
  // REWRITTEN: the button read Begin and stood at the foot of one long sheet.
  // It reads CREATE CHARACTER now (the sheet sets it in small caps) and stands
  // at the foot of the right hand column, with the same red line under it.
  check('the button is there and says what it does', !!go && go.textContent === 'Create character', go.textContent);
  check('with nothing typed it is disabled', go.disabled === true);
  check('and the refusal is written out', /at least 2 letters/.test(errLine.textContent), errLine.textContent);
  // REWRITTEN only in where it looks: the name, the button and the red line
  // are pinned in their own block at the foot of the right column now, so the
  // order is measured inside that block rather than in the column.
  const act = one(s1.cr.el, 'bw-cr-act');
  check('the error line sits under the button, not over it',
    act.children.indexOf(errLine) === act.children.indexOf(go) + 1,
    `button at ${act.children.indexOf(go)}, error at ${act.children.indexOf(errLine)}`);
  check('and the name field sits over the button, with its header over that',
    act.children.map((c) => c.className || c.tagName).join(',') === 'bw-hdr,INPUT,bw-cr-go,bw-cr-err,bw-cr-short',
    act.children.map((c) => c.className || c.tagName).join(','));

  const input = textInput(s1.cr.el);
  input.value = 'Ashe';
  input.fire('input');
  check('a name typed in enables it', go.disabled === false && s1.cr.state.name === 'Ashe', `${go.disabled} / ${s1.cr.state.name}`);
  check('and the red line goes quiet', errLine.textContent === '', errLine.textContent);
  check('and the shortfall line says what a warrior s kit could not do',
    one(s1.cr.el, 'bw-cr-short').textContent === shortfallLine(planCharacter(s1.cr.state)),
    one(s1.cr.el, 'bw-cr-short').textContent || '(nothing, which is right today)');
  input.value = 'Ashe9';
  input.fire('input');
  check('and a name with a digit turns it off again and says why',
    go.disabled === true && /apostrophes/.test(errLine.textContent), errLine.textContent);
  input.value = 'Ashe';
  input.fire('input');

  let handed = null;
  const root2 = document.createElement('div');
  const cr2 = createCreation(root2, { onDone: (c) => { handed = c; } });
  const in2 = textInput(cr2.el);
  in2.value = 'Rowan';
  in2.fire('input');
  cr2.pick('ranger');
  one(cr2.el, 'bw-cr-go').fire('click');
  check('Create character hands over a character built by the same planCharacter the tests above use',
    !!handed && handed.name === 'Rowan' && handed.opening === 'ranger'
    && handed.pack.items.filter(Boolean).length + Object.values(handed.equipment).filter(Boolean).length > 0,
    handed ? `${handed.name} the ${handed.opening}` : 'nothing');
  check('and the screen takes itself off the page', root2.children.length === 0, String(root2.children.length));
}

// --- the shared camera is handed back
{
  // The screen frames the rig by offsetting the lens rather than by moving the
  // camera, and the camera belongs to the game. A view offset left behind would
  // frame the whole world off centre for the rest of the session, so the screen
  // is driven with a camera that records what was done to it.
  const done = [];
  const cam = {
    fov: 55, aspect: 1.7, position: { set() {} }, lookAt() {},
    updateProjectionMatrix() { done.push('project'); },
    setViewOffset() { done.push('offset'); },
    clearViewOffset() { done.push('clear'); },
  };
  const sc = { camera: cam, scene: { add() {}, remove() {} }, render() {}, resize() { done.push('resize'); } };
  const cr = createCreation(document.createElement('div'), { sc });
  cr.destroy();
  check('the lens is put back the way it was found when the screen goes',
    done.includes('clear') && done.indexOf('resize') === done.indexOf('clear') + 1,
    done.join(','));
}

// --- the caret, and the scroll that used to jump with it
{
  const s = screen();
  const input = textInput(s.cr.el);
  check('the name field takes the caret without dragging the column down to it',
    input.focused && input.focused.preventScroll === true, JSON.stringify(input.focused));
  check('and both columns are at the top when the screen opens',
    one(s.cr.el, 'bw-cr-left').scrollTop === 0 && one(s.cr.el, 'bw-cr-right').scrollTop === 0,
    `${one(s.cr.el, 'bw-cr-left').scrollTop} / ${one(s.cr.el, 'bw-cr-right').scrollTop}`);
  s.cr.destroy();
}

// --- the steppers are still the rules ------------------------------------------
{
  // The stepper still refuses what the rules refuse, and says so in the red
  // line. Both directions, on the real buttons.
  const cr = createCreation(document.createElement('div'), {});
  const step = withClass(cr.el, 'bw-step')[0];
  const errLine = one(cr.el, 'bw-cr-err');
  const before = { ...cr.state.skills };
  step.children[3].fire('click');   // +5 with nothing lowered
  check('a warrior cannot step a skill up out of nothing',
    JSON.stringify(cr.state.skills) === JSON.stringify(before) && errLine.textContent.length > 0,
    errLine.textContent);
  step.children[0].fire('click');   // -5, which is allowed
  const moved = Object.keys(cr.state.skills).filter((k) => (cr.state.skills[k] || 0) !== (before[k] || 0));
  check('and stepping one down is allowed', moved.length === 1, moved.join(','));
  check('though the five points it freed are named as lying loose until they are placed',
    /5 skill points you took off are lying loose/.test(errLine.textContent), errLine.textContent);
  step.children[3].fire('click');   // +5 back, now that a donor exists
  check('after which the same step up is taken',
    JSON.stringify(cr.state.skills) === JSON.stringify(before), JSON.stringify(moved));
  check('and the loose line goes quiet with them', !/lying loose/.test(errLine.textContent), errLine.textContent);
  cr.destroy();
}

delete globalThis.document;
delete globalThis.window;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
