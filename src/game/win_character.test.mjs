// The character sheet's numbers and its doll. Run: node src/game/win_character.test.mjs
//
// The doll's cell count is checked against items.js rather than against a
// number typed here, so a fifteenth slot breaks this and not the screen.

import { auditDoll, DOLL, SLOT_LABELS, sheetOf, tipFor } from './win_character.js';
import { normalise, PACK_SLOTS } from './inventory.js';
import { SLOTS, makeItem } from '../mmo/items.js';
import { derived } from '../mmo/stats.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---- the doll counts its own cells -----------------------------------------
check('the doll has a cell for every slot', auditDoll() === SLOTS.length, `${auditDoll()} of ${SLOTS.length}`);
check('and fourteen is what that is', SLOTS.length === 14);
const cells = [...DOLL.left, ...DOLL.right, ...DOLL.hands];
check('no slot is drawn twice', new Set(cells).size === cells.length);
check('every cell has a word under it', cells.every((c) => !!SLOT_LABELS[c]));
check('the two rings read as rings, not as ring1 and ring2', SLOT_LABELS.ring1 === 'ring' && SLOT_LABELS.ring2 === 'ring');
check('the hands are the bottom row', DOLL.hands.join(',') === 'mainHand,offHand,ranged');

// ---- the sheet -------------------------------------------------------------
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
  check('health reads the derived maximum', s.pools[0].value === `${Math.floor(d.maxHealth)} / ${Math.floor(d.maxHealth)}`, s.pools[0].value);
  check('a warrior at CON 65 and STR 65 has 192 health', s.pools[0].value === '192 / 192', s.pools[0].value);
  check('carry is 40 + STR * 2', s.carry === 170, String(s.carry));
  check('an empty warrior weighs nothing and is not over', s.weight === 0 && s.over === false);
  check('with nothing on, armour is zero', s.ar === 0);
  check('and every resist is zero', s.resists.every((r) => r.value === 0));
  check('there are five resists', s.resists.length === 5, s.resists.map((r) => r.label).join(','));
  check('the purse is shown', s.gold === 25);
}
{
  // A part-drained character shows what is left over what it could be.
  const c = warrior();
  c.health = 40;
  const s = sheetOf(c, null);
  check('a hurt character shows the wound', s.pools[0].value === '40 / 192', s.pools[0].value);
}
{
  // When actor.js has run, its numbers win, so the sheet and the fight agree.
  const c = warrior();
  const s = sheetOf(c, { ar: 137, resists: { physical: 40, fire: 3, cold: 0, poison: 0, energy: 0 } });
  check('the actor s armour is preferred once there is one', s.ar === 137, String(s.ar));
  check('and so are its resists', s.resists[0].value === 40 && s.resists[1].value === 3);
}

// ---- tooltips ---------------------------------------------------------------
{
  check('an empty cell says nothing', tipFor(null) === null);
  const t = tipFor(makeItem({ base: 'plate_chest', seed: 5 }));
  check('a filled one gives lines and a colour', t.lines.length > 1 && t.colour === '#ffffff', t.colour);
  const rare = tipFor(makeItem({ base: 'plate_chest', rarity: 'rare', seed: 5 }));
  check('and an unidentified rare gives its colour and its base only', rare.lines.length === 2 && rare.colour === '#0070dd', rare.lines.map((l) => l.text).join(' | '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
