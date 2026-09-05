// The character sheet's numbers, its titles and its doll.
// Run: node src/game/win_character.test.mjs
//
// The doll's cell count is checked against items.js rather than against a
// number typed here, so a fifteenth slot breaks this and not the screen. The
// combat numbers are checked against combat_rules itself, so the sheet cannot
// print a number the fight would not.

import {
  auditDoll, auditTitles, DOLL, SLOT_LABELS, TITLES, TITLE_AT, QUOTES, MOTTOES,
  DEFAULT_QUOTE, DEFAULT_MOTTO, sheetOf, tipFor, titleOf, noteOf, fighterFor,
} from './win_character.js';
import { normalise, PACK_SLOTS } from './inventory.js';
import { SLOTS, makeItem } from '../mmo/items.js';
import { derived } from '../mmo/stats.js';
import { SKILLS } from '../mmo/skills.js';
import { attackSkill, defenceSkill, CRIT_BASE_MULT } from '../mmo/combat_rules.js';
import { OPENINGS } from '../mmo/openings.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---- the doll counts its own cells -----------------------------------------
console.log('character: the doll');
check('the doll has a cell for every slot', auditDoll() === SLOTS.length, `${auditDoll()} of ${SLOTS.length}`);
check('and fourteen is what that is', SLOTS.length === 14);
const cells = [...DOLL.left, ...DOLL.right];
check('no slot is drawn twice', new Set(cells).size === cells.length);
check('every cell has a word under it', cells.every((c) => !!SLOT_LABELS[c]));
check('the two rings read as rings, not as ring1 and ring2', SLOT_LABELS.ring1 === 'ring' && SLOT_LABELS.ring2 === 'ring');
check('the arch is flanked seven and seven', DOLL.left.length === 7 && DOLL.right.length === 7,
  `${DOLL.left.length} and ${DOLL.right.length}`);
check('the head is at the top of the left flank', DOLL.left[0] === 'head');
check('the hands are held down the right flank',
  DOLL.right.slice(-3).join(',') === 'mainHand,offHand,ranged', DOLL.right.join(','));

// ---- titles ----------------------------------------------------------------
console.log('character: the title line');
check('every skill makes somebody', auditTitles() === SKILLS.length, `${SKILLS.length} skills`);
check('and there are fifty two of them', SKILLS.length === 52);
check('Swordsmanship makes a Swordsman', TITLES.swordsmanship === 'Swordsman');
{
  const low = { opening: 'warrior', skills: { swordsmanship: TITLE_AT - 1 } };
  const t = titleOf(low);
  check(`a skill under ${TITLE_AT} does not name you`, t.text === 'Warrior' && t.from === 'opening', JSON.stringify(t));
  const at = titleOf({ opening: 'warrior', skills: { swordsmanship: TITLE_AT } });
  check(`and at exactly ${TITLE_AT} it does`, at.text === 'Swordsman' && at.from === 'swordsmanship', JSON.stringify(at));
  const best = titleOf({ opening: 'warrior', skills: { swordsmanship: 40, archery: 62 } });
  check('the highest skill wins, not the first', best.text === 'Archer', JSON.stringify(best));
  const none = titleOf({ skills: {} });
  check('with no skill and no opening you are a Wanderer', none.text === 'Wanderer' && none.from === null);
  check('no level is ever printed', !/level/i.test(JSON.stringify(titleOf({ opening: 'mage', skills: { magery: 70 } }))));
}
console.log('character: quotes and mottoes');
check('every opening has a line of its own',
  OPENINGS.every((o) => typeof QUOTES[o.id] === 'string' && QUOTES[o.id].length > 10),
  OPENINGS.filter((o) => !QUOTES[o.id]).map((o) => o.id).join(',') || 'all present');
check('and a motto', OPENINGS.every((o) => typeof MOTTOES[o.id] === 'string'),
  OPENINGS.filter((o) => !MOTTOES[o.id]).map((o) => o.id).join(',') || 'all present');
check('no quote or motto uses an em dash',
  [...Object.values(QUOTES), ...Object.values(MOTTOES), DEFAULT_QUOTE, DEFAULT_MOTTO].every((s) => !s.includes('—')));
check('an opening nobody wrote for still gets words',
  sheetOf({ opening: 'goatherd' }, null).quote === DEFAULT_QUOTE);

// ---- the sheet -------------------------------------------------------------
console.log('character: the numbers');
const warrior = () => normalise({
  name: 'Ashe', opening: 'warrior', gold: 25,
  stats: { str: 65, dex: 50, int: 25, con: 65, wis: 45 },
  skills: { meditation: 0 },
  pack: { slots: PACK_SLOTS, items: [] }, equipment: {},
});
{
  const c = warrior();
  const s = sheetOf(c, null);
  const d = derived(c.stats, c.skills);
  check('five stats are printed', s.stats.length === 5 && s.stats[0].label === 'STR');
  check('and they are the document s', s.stats.map((x) => x.value).join(',') === '65,50,25,65,45');
  check('each stat carries the word the reference uses', s.stats[0].word === 'Strength' && s.stats[3].word === 'Constitution');
  check('and a mark to draw', s.stats.every((x) => typeof x.mark === 'string' && x.mark.length));
  check('health reads the derived maximum', s.pools[0].value === `${Math.floor(d.maxHealth)} / ${Math.floor(d.maxHealth)}`, s.pools[0].value);
  check('a warrior at CON 65 and STR 65 has 192 health', s.pools[0].value === '192 / 192', s.pools[0].value);
  check('carry is 40 + STR * 2', s.carry === 170, String(s.carry));
  check('an empty warrior weighs nothing and is not over', s.weight === 0 && s.over === false);
  check('with nothing on, armour is zero', s.ar === 0);
  check('and every resist is zero', s.resists.every((r) => r.value === 0));
  check('there are five resists', s.resists.length === 5, s.resists.map((r) => r.label).join(','));
  check('each resist has a mark', s.resists.every((r) => typeof r.mark === 'string' && r.mark.length));
  check('the purse is shown', s.gold === 25);
  check('the title is the opening, since no skill is high enough', s.title.text === 'Warrior');
}
{
  // A part-drained character shows what is left over what it could be.
  const c = warrior();
  c.health = 40;
  const s = sheetOf(c, null);
  check('a hurt character shows the wound', s.pools[0].value === '40 / 192', s.pools[0].value);
}

// ---- the combat rows are combat_rules', not a second copy -------------------
console.log('character: the combat rows read the rules');
{
  const c = warrior();
  c.skills = { swordsmanship: 60, tactics: 40, parrying: 30 };
  const s = sheetOf(c, null);
  const f = fighterFor(c, null);
  const attack = s.fight.find((r) => r.label === 'attack');
  const defence = s.fight.find((r) => r.label === 'defence');
  check('attack is combat_rules attackSkill, rounded',
    attack.value === Math.round(attackSkill(f)), `${attack.value} vs ${attackSkill(f)}`);
  check('defence is combat_rules defenceSkill, rounded',
    defence.value === Math.round(defenceSkill(f)), `${defence.value} vs ${defenceSkill(f)}`);
  check('a bare handed warrior with no Wrestling has no attack to speak of',
    attack.value === Math.round(0 + 40 * 0.25), String(attack.value));
  check('dodge is a percentage', /%$/.test(s.fight.find((r) => r.label === 'dodge').value));
  check('critical damage is the multiplier the resolver uses',
    s.fight.find((r) => r.label === 'critical damage').value === `${CRIT_BASE_MULT}x`);
  check('there is no hit chance row, because that takes two fighters',
    !s.fight.some((r) => /hit chance/.test(r.label)), s.fight.map((r) => r.label).join(', '));
}
{
  // A document with no stamina recorded is not an exhausted fighter.
  const c = warrior();
  c.skills = { swordsmanship: 60 };
  c.equipment.mainHand = makeItem({ base: 'longsword', seed: 4 });
  delete c.stamina;
  const f = fighterFor(c, null);
  check('the weapon in hand is the weapon the rules read', f.weapon && f.weapon.skill === 'swordsmanship');
  check('a document with no stamina is filled in from the derived pool',
    f.stamina === derived(c.stats, c.skills).maxStamina, String(f.stamina));
  check('so attack is not docked twenty points for exhaustion',
    Math.round(attackSkill(f)) === 60, String(Math.round(attackSkill(f))));
  const spent = fighterFor({ ...c, stamina: 0 }, null);
  check('and a fighter who really is spent loses those twenty',
    Math.round(attackSkill(spent)) === 40, String(Math.round(attackSkill(spent))));
}
{
  // When actor.js has run, its numbers win, so the sheet and the fight agree.
  const c = warrior();
  const actor = {
    ar: 137,
    resists: { physical: 40, fire: 3, cold: 0, poison: 0, energy: 0 },
    stats: c.stats, skills: { swordsmanship: 70 },
    bonuses: { hit: 12, critChance: 0.1, critDamage: 0.4 }, stamina: 90,
    weapon: { skill: 'swordsmanship', speed: 3 },
  };
  const s = sheetOf(c, actor);
  check('the actor s armour is preferred once there is one', s.ar === 137, String(s.ar));
  check('and so are its resists', s.resists[0].value === 40 && s.resists[1].value === 3);
  check('the actor is the fighter the combat rows read', fighterFor(c, actor) === actor);
  check('so a +12 hit affix shows up in attack',
    s.fight.find((r) => r.label === 'attack').value === Math.round(70 + 12), String(s.fight[0].value));
  check('a crit affix shows up in the crit chance',
    s.fight.find((r) => r.label === 'critical chance').value === '15%',
    s.fight.find((r) => r.label === 'critical chance').value);
  check('and in the crit damage', s.fight.find((r) => r.label === 'critical damage').value === '1.9x',
    s.fight.find((r) => r.label === 'critical damage').value);
}

// ---- the parchment note is written out of counted numbers -------------------
console.log('character: the note');
{
  const c = warrior();
  const s = sheetOf(c, null);
  const line = noteOf(s);
  check('it names the load it just counted', line.includes('0 of 170 stones'), line);
  check('and the gold', line.includes('25 gold'), line);
  check('and the room left, counted rather than guessed',
    line.includes(`${PACK_SLOTS} slots`) && s.packSlots === PACK_SLOTS, line);
  const one = sheetOf(normalise({ ...c, gold: 1 }), null);
  check('one coin is one coin, not "1 gold"', noteOf(one).includes('one gold coin'), noteOf(one));
}
{
  const c = warrior();
  c.pack.items[0] = makeItem({ base: 'plate_chest', seed: 3 });
  const s = sheetOf(c, null);
  check('a thing in the pack is counted',
    s.packUsed === 1 && noteOf(s).includes(`${PACK_SLOTS - 1} slots`), noteOf(s));
  check('and its weight is on your back', s.weight > 0, String(s.weight));
}

// ---- tooltips ---------------------------------------------------------------
console.log('character: tooltips');
{
  check('an empty cell says nothing', tipFor(null) === null);
  const t = tipFor(makeItem({ base: 'plate_chest', seed: 5 }));
  check('a filled one gives lines and a colour', t.lines.length > 1 && t.colour === '#ffffff', t.colour);
  const rare = tipFor(makeItem({ base: 'plate_chest', rarity: 'rare', seed: 5 }));
  check('and an unidentified rare gives its colour and its base only', rare.lines.length === 2 && rare.colour === '#0070dd', rare.lines.map((l) => l.text).join(' | '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
