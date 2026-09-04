// What a bag cell shows. Run: node src/game/win_bag.test.mjs

import { cellOf, ROLL_MS } from './win_bag.js';
import { makeItem } from '../mmo/items.js';
import { identify } from '../mmo/affixes.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

{
  const v = cellOf(null);
  check('an empty slot is empty', v.empty === true && v.text === '' && v.colour === null);
}
{
  const v = cellOf(makeItem({ base: 'longsword', seed: 1 }));
  check('a common sword shows its name', v.text === 'Longsword' && v.empty === false);
  check('in white', v.colour === '#ffffff');
  check('with no count, because a sword is one sword', v.count === 0);
  check('and no mystery', v.mystery === false);
}
{
  const v = cellOf(makeItem({ base: 'arrow', seed: 1, count: 60 }));
  check('a stack shows its count', v.count === 60, String(v.count));
  const one = cellOf(makeItem({ base: 'arrow', seed: 1, count: 1 }));
  check('and a stack of one shows the count all the same, for the grid to hide', one.count === 1);
}
{
  const item = makeItem({ base: 'longsword', rarity: 'epic', seed: 9 });
  const before = cellOf(item);
  check('an unidentified epic is a mystery', before.mystery === true);
  check('and reads as its colour and its base', before.text === 'purple longsword', before.text);
  check('in purple', before.colour === '#a335ee');
  const after = cellOf(identify(item, 95));
  check('once identified it takes its rolled name', after.mystery === false && after.text === 'Longsword', after.text);
  check('and keeps its colour', after.colour === '#a335ee');
}
{
  const common = cellOf(makeItem({ base: 'longsword', rarity: 'common', seed: 2 }));
  check('a common item is never a mystery, since it has nothing to hide', common.mystery === false);
}
check('the roll is short enough not to be a wait', ROLL_MS > 0 && ROLL_MS <= 800, `${ROLL_MS} ms`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
