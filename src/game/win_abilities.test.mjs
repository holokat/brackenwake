// The bar and what goes on it. Run: node src/game/win_abilities.test.mjs

import { setBarSlot, barOf, abilityLines, BAR_SLOTS, BAR_KEYS } from './win_abilities.js';
import { ABILITIES, ABILITIES_BY_ID, unlockedFor } from '../mmo/abilities.js';
import { SKILLS } from '../mmo/skills.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---- the bar has as many keys as it has slots --------------------------------
check('the bar has twelve slots', BAR_SLOTS === 12);
check('and twelve keys, one each', BAR_KEYS.length === BAR_SLOTS && new Set(BAR_KEYS).size === BAR_SLOTS, BAR_KEYS.join(''));
check('which are 1 to 0 and minus and equals', BAR_KEYS.join('') === '1234567890-=');

// ---- the document s bar is repaired, not trusted -------------------------------
{
  const c = {};
  const bar = barOf(c);
  check('a document with no bar gets twelve empty slots', bar.length === 12 && bar.every((x) => x === null));
  const short = { bar: ['powerStrike'] };
  barOf(short);
  check('a short bar is filled out', short.bar.length === 12 && short.bar[0] === 'powerStrike' && short.bar[11] === null);
}

// ---- putting one on ------------------------------------------------------------
{
  const c = {};
  const r = setBarSlot(c, 0, 'powerStrike');
  check('an ability goes on the bar', r.ok === true && c.bar[0] === 'powerStrike');
  check('and the words name the slot and the key', /slot 1/.test(r.reason) && /key 1/.test(r.reason), r.reason);
  const moved = setBarSlot(c, 4, 'powerStrike');
  check('putting the same one elsewhere moves it', moved.ok && c.bar[4] === 'powerStrike' && c.bar[0] === null);
  check('and says it left the old slot', /leaves slot 1/.test(moved.reason), moved.reason);
  setBarSlot(c, 4, 'whirlwind');
  check('a second ability displaces the first', c.bar[4] === 'whirlwind');
  check('and only one thing is on the bar', c.bar.filter(Boolean).length === 1, c.bar.join(','));
}

// ---- taking one off --------------------------------------------------------------
{
  const c = { bar: ['powerStrike'] };
  barOf(c);
  const r = setBarSlot(c, 0, null);
  check('null clears a slot', r.ok === true && c.bar[0] === null);
  check('and says what came off', /Power Strike/.test(r.reason), r.reason);
  const again = setBarSlot(c, 0, null);
  check('clearing an empty slot is refused, not silent', again.ok === false && /already empty/.test(again.reason), again.reason);
}

// ---- the refusals ------------------------------------------------------------------
{
  const c = {};
  const passive = ABILITIES.find((a) => a.passive);
  const r = setBarSlot(c, 0, passive.id);
  check('a passive is refused', r.ok === false, r.reason);
  check('and told it is already working', /passive/.test(r.reason), r.reason);
  check('and the slot stays empty', c.bar[0] === null);
  const nope = setBarSlot(c, 0, 'dragonpunch');
  check('an ability nobody wrote is refused', nope.ok === false && /no ability called/.test(nope.reason), nope.reason);
  const off = setBarSlot(c, 12, 'powerStrike');
  check('slot thirteen is refused', off.ok === false && /12 slots/.test(off.reason), off.reason);
  const under = setBarSlot(c, -1, 'powerStrike');
  check('and so is slot minus one', under.ok === false);
  check('nothing landed on the bar', c.bar.every((x) => x === null));
}

// ---- what a player can actually put there --------------------------------------------
{
  const none = unlockedFor({}, {});
  check('a character with no skills has some abilities anyway', none.length > 0, String(none.length));
  check('and they are the ones that gate on nothing', none.every((a) => a.skill === null || a.minSkill === 0), none.map((a) => a.name).join(','));
  const all = Object.fromEntries(SKILLS.map((s) => [s.id, 100]));
  const master = unlockedFor(all, { str: 100, dex: 100, int: 100, con: 100, wis: 100 });
  check('a grandmaster of everything has all seventy eight', master.length === ABILITIES.length, `${master.length} of ${ABILITIES.length}`);
  const bar = master.filter((a) => !a.passive);
  check('and more of them than the bar can hold, which is the point of choosing', bar.length > BAR_SLOTS, `${bar.length} for ${BAR_SLOTS} slots`);
}

// ---- the tooltip ------------------------------------------------------------------
{
  const lines = abilityLines(ABILITIES_BY_ID.powerStrike, { skills: {}, stats: {} });
  check('the tooltip names it first', lines[0] === 'Power Strike');
  check('and gives its cost', lines.some((l) => /15 stamina/.test(l)), lines.join(' | '));
  check('and its cooldown', lines.some((l) => /6 s cooldown/.test(l)), lines.join(' | '));
  check('and the sentence from the table', lines[lines.length - 1] === ABILITIES_BY_ID.powerStrike.description);
  const spell = ABILITIES.find((a) => a.cost && 'mana' in a.cost);
  const cheap = abilityLines(spell, { lowerManaCost: 0.5 });
  const full = abilityLines(spell, {});
  check('a mana cost is the one this character pays', cheap.find((l) => /mana/.test(l)) !== full.find((l) => /mana/.test(l)), `${full.find((l) => /mana/.test(l))} vs ${cheap.find((l) => /mana/.test(l))}`);
  check('nothing at all gives no lines', abilityLines(null).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
