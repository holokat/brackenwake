// Corpse rewards must use the same capacity-aware inventory door as every
// other pickup, while remaining on the body until accepted.

import { createCorpseLoot } from './corpse_loot.js';
import { createInventory, normalise } from './inventory.js';
import { makeItem } from '../mmo/items.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `   ${detail}` : ''}`); };

function harness({ slots = 2, at = { x: 0, z: 0 } } = {}) {
  const character = normalise({ stats: { str: 80, dex: 50, int: 50, con: 50, wis: 50 }, skills: {}, gold: 0, pack: { slots, items: [] }, equipment: {} });
  const inventory = createInventory({ character });
  const loot = createCorpseLoot({
    at: () => at,
    takeLoot(items, gold) {
      const accepted = [];
      for (const item of items) if (inventory.add(item, { quiet: true }).ok) accepted.push(item);
      character.gold += gold;
      return { items: accepted, gold };
    },
  });
  return { character, inventory, loot };
}

const sword = () => makeItem({ base: 'longsword', seed: 1 });
const shield = () => makeItem({ base: 'kite', seed: 2 });

console.log('corpse loot: capacity, ownership and reach');
{
  const h = harness({ slots: 1 });
  const first = sword(), second = shield();
  const corpse = { pos: { x: 1, z: 0 }, loot: { items: [first, second], gold: 11 } };
  const take = h.loot.takeAll(corpse);
  check('take all uses the real pack and accepts what one free slot can hold', take.ok && take.taken[0] === first && h.character.pack.items[0] === first);
  check('gold is accepted with the partial item claim', take.gold === 11 && h.character.gold === 11, String(h.character.gold));
  check('the refused item stays on the corpse', corpse.loot.items.length === 1 && corpse.loot.items[0] === second && corpse.loot.gold === 0);
  const again = h.loot.takeItem(corpse, first);
  check('a duplicate claim cannot take an item already removed', !again.ok && corpse.loot.items[0] === second);
  const full = h.loot.takeItem(corpse, second);
  check('a full pack leaves an individual reward on the corpse', !full.ok && corpse.loot.items[0] === second);
}
{
  const h = harness({ at: { x: 8, z: 0 } });
  const item = sword();
  const corpse = { pos: { x: 0, z: 0 }, loot: { items: [item], gold: 0 } };
  const result = h.loot.takeItem(corpse, item);
  check('distance is enforced by the claim controller', !result.ok && corpse.loot.items[0] === item, result.reason);
}
{
  const h = harness();
  const item = sword();
  const corpse = { pos: { x: 0, z: 0 }, loot: { items: [item], gold: 0, claiming: true } };
  const result = h.loot.takeItem(corpse, item);
  check('an in-flight claim is refused without removing the reward', !result.ok && corpse.loot.items[0] === item, result.reason);
}

// The claim controller treats stack counts and corpse lifetime as authority,
// rather than trusting a stale button or assuming an accepted stack was whole.
{
  const lines = [];
  const stack = makeItem({ base: 'arrow', count: 10, seed: 7 });
  const corpse = { pos: { x: 0, z: 0 }, active: true, loot: { items: [stack], gold: 0 } };
  const loot = createCorpseLoot({
    at: { x: 0, z: 0 }, hud: { log: (line) => lines.push(line) },
    takeLoot: () => ({ items: [{ ...stack, count: 4 }], gold: 0 }),
  });
  const result = loot.takeItem(corpse, stack);
  check('a partial stack claim removes only the accepted count', result.ok && result.taken[0].count === 4
    && corpse.loot.items[0].count === 6, JSON.stringify(corpse.loot.items[0]));
  check('a partial selected stack names the capacity limit', lines.some((line) => /rest stays/.test(line)), lines.join(' | '));
  const other = makeItem({ base: 'kite', seed: 8 });
  const single = { pos: { x: 0, z: 0 }, active: true, loot: { items: [other, stack], gold: 0 } };
  const onlyOne = createCorpseLoot({ at: { x: 0, z: 0 }, hud: { log: (line) => lines.push(line) }, takeLoot: () => ({ items: [other], gold: 0 }) });
  lines.length = 0; onlyOne.takeItem(single, other);
  check('taking one item does not call unrelated rewards a capacity refusal', !lines.some((line) => /rest stays/.test(line)), lines.join(' | '));
  corpse.active = false;
  check('an expired corpse reference cannot be claimed from a stale window', !loot.takeAll(corpse).ok && corpse.loot.items[0].count === 6);
}
console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
