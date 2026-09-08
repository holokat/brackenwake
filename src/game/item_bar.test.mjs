// The item bar, counted. Run: node src/game/item_bar.test.mjs
//
// The one thing this bar has to get right is that a slot survives the pack
// moving under it. Every other bar in every other game remembers an index, and
// an index is stale the moment you loot a rabbit. So the middle section here
// picks a potion up, drops the stack somewhere else, and presses the key again.
//
// Headless: item_bar.js has no DOM in it, and hud.js draws what `view()` says.

import {
  createItemBar, itemBarOf, keyOf, keysOf, rebind, planFor, labelOf,
  ITEM_KEYS, ITEM_SLOTS, BROWSER_KEYS, keyCap, auditItemBar,
} from './item_bar.js';
import { createInventory, normalise, PACK_SLOTS } from './inventory.js';
import { makeItem, baseFor, SLOTS } from '../mmo/items.js';
import { RESERVED_KEYS } from './windows.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const blank = () => normalise({
  name: 'Test', stats: { str: 70, dex: 50, int: 50, con: 50, wis: 50 }, skills: {}, gold: 0,
  pack: { slots: PACK_SLOTS, items: [] }, equipment: {},
});

/**
 * The rig. `keys` is the set of keys "down this frame", which is exactly what
 * input.js's `pressed` reads, and `used` records every call the bar makes into
 * the real `ctx.useItem`.
 */
function rig(opts = {}) {
  const character = blank();
  const said = [];
  // one voice: the pack and the bar both talk into the same log, which is how
  // main.js wires them, so a check on "the last thing said" is a real check
  const hud = { log: (t, k) => said.push(`${k || ''}:${t}`) };
  const inventory = createInventory({ character, hud });
  const down = new Set();
  const swallowed = [];
  const used = [];
  const bar = createItemBar({
    character, inventory, hud,
    input: { pressed: (k) => down.has(k), swallow: (k) => { swallowed.push(k); down.delete(k); } },
    useItem: opts.noUseItem ? undefined : (item, where) => {
      used.push({ base: item.base, where });
      // the real foraging.useItem spends one out of the pack; so does this
      inventory.remove(where, 1);
      return { ok: true, text: `${baseFor(item).name}: drunk` };
    },
    enabled: opts.enabled,
    guardKeys: false,
    ...opts.extra,
  });
  return { character, inventory, bar, said, down, used, swallowed };
}

// ---- the list, and the container it goes in ------------------------------------
console.log('item bar: eight slots, eight keys');
check('the audit runs at import and counts the slots', auditItemBar() === ITEM_SLOTS, String(ITEM_SLOTS));
check('eight slots', ITEM_SLOTS === 8 && ITEM_KEYS.length === 8, ITEM_KEYS.join(','));
check('the keys are F5 to F12, in order', ITEM_KEYS.join(',') === 'f5,f6,f7,f8,f9,f10,f11,f12', ITEM_KEYS.join(','));
check('every key is distinct', new Set(ITEM_KEYS).size === ITEM_SLOTS);
check('none of them is a key the world drives', ITEM_KEYS.every((k) => !RESERVED_KEYS.includes(k)));
check('and F1 and F2 are left to fly mode and the dev bench',
  !ITEM_KEYS.includes('f1') && !ITEM_KEYS.includes('f2'));
check('none of them is one of the ability bar s twelve',
  ITEM_KEYS.every((k) => !'1234567890-='.includes(k) || k.length > 1));
check('the three the browser also wants are named rather than hidden',
  Object.keys(BROWSER_KEYS).join(',') === 'f5,f11,f12', Object.keys(BROWSER_KEYS).join(','));
check('the cap on the HUD is the key in capitals', keyCap('f11') === 'F11');

// ---- the document is repaired, not trusted ---------------------------------------
{
  const c = {};
  const bar = itemBarOf(c);
  check('a document with no item bar gets eight empty slots', bar.length === 8 && bar.every((x) => x === null));
  const junk = { itemBar: [{ base: 'potion', name: 'Potion' }, 'nonsense', { name: 'no base' }] };
  itemBarOf(junk);
  check('a short bar is filled out and the rubbish in it is thrown away',
    junk.itemBar.length === 8 && junk.itemBar[0].base === 'potion' && junk.itemBar[1] === null && junk.itemBar[2] === null,
    JSON.stringify(junk.itemBar.slice(0, 3)));
}

// ---- what a slot would do ---------------------------------------------------------
console.log('item bar: what a press would do');
check('a potion is drunk', planFor(makeItem({ base: 'potion', count: 1 })).kind === 'use');
check('a bandage is applied', planFor(makeItem({ base: 'bandage', count: 1 })).kind === 'use');
check('an apple is eaten', planFor(makeItem({ base: 'apple', count: 1 })).kind === 'use');
check('a sword is held', planFor(makeItem({ base: 'longsword' })).kind === 'equip');
check('a shield is held', planFor(makeItem({ base: 'buckler' })).kind === 'equip');
check('a helm is worn', planFor(makeItem({ base: 'cloth_outfit' })).kind === 'equip');
check('a pickaxe is a tool, which is its own answer', planFor(makeItem({ base: 'pickaxe' })).kind === 'tool');
check('an ingot is none of the three, and says why',
  planFor(makeItem({ base: 'iron_ingot', count: 1 })).kind === 'none'
  && /goes into something/.test(planFor(makeItem({ base: 'iron_ingot', count: 1 })).reason),
  planFor(makeItem({ base: 'iron_ingot', count: 1 })).reason);
check('and a base nobody wrote is refused rather than guessed',
  planFor({ base: 'moon_cheese' }).kind === 'none');

// ---- a potion in slot one, and F5 ---------------------------------------------------
console.log('item bar: a potion answers to F5');
{
  const { inventory, bar, down, used, said, swallowed } = rig();
  inventory.add(makeItem({ base: 'potion', count: 3 }));
  const r = bar.assign(0, { pack: 0 });
  check('the pack drag payload lands on the slot', r.ok === true && bar.bar[0].base === 'potion', JSON.stringify(bar.bar[0]));
  check('and it is said out loud, with the key in it', /Potion answers to F5/.test(r.reason), r.reason);

  const v = bar.view();
  check('the view is always eight long', v.length === 8);
  check('slot one holds three potions', v[0].base === 'potion' && v[0].count === 3 && v[0].have === true, JSON.stringify(v[0]));
  check('and every other slot is empty', v.slice(1).every((e) => e.empty));

  down.add('f5');
  const fired = bar.update(0.016);
  check('F5 fires slot one', fired && fired.slot === 0 && fired.kind === 'use', JSON.stringify(fired && fired.kind));
  check('and it goes through ctx.useItem with a pack address, not an item on its own',
    used.length === 1 && used[0].base === 'potion' && used[0].where.pack === 0, JSON.stringify(used[0]));
  check('one potion is spent, two are left', bar.view()[0].count === 2, String(bar.view()[0].count));

  check('and the press is swallowed, so nothing later in the frame acts on it too',
    swallowed.join(',') === 'f5', swallowed.join(','));
  down.clear();
  check('and a frame with no key down fires nothing', bar.update(0.016) === null && used.length === 1);
  down.add('f6');
  check('a key on an empty slot says so rather than saying nothing',
    bar.update(0.016).kind === 'empty' && /F6 has nothing on it/.test(said[said.length - 1]), said[said.length - 1]);
}

// ---- the whole point: a stack that moves ---------------------------------------------
console.log('item bar: the pack moves and the slot still fires');
{
  const { character, inventory, bar, down, used } = rig();
  inventory.add(makeItem({ base: 'potion', count: 5 }));
  bar.assign(0, { pack: 0 });
  check('the potions start in pack slot 0', character.pack.items[0].base === 'potion');

  // move them the way a player does: drag the stack to a far slot
  inventory.move({ pack: 0 }, { pack: 17 });
  check('now they are in slot 17 and slot 0 is empty',
    character.pack.items[17]?.base === 'potion' && !character.pack.items[0]);
  check('and the bar slot still remembers the potion, not the index',
    bar.bar[0].base === 'potion' && bar.view()[0].count === 5, JSON.stringify(bar.view()[0]));

  down.add('f5');
  const fired = bar.update(0.016);
  check('F5 still fires, and at the new address',
    fired.kind === 'use' && used[0].where.pack === 17, JSON.stringify(used[0].where));

  // and the class of the bug driven the other way: something else in slot 0
  inventory.add(makeItem({ base: 'iron_ingot', count: 2 }));
  check('an ingot has fallen into pack slot 0', character.pack.items[0].base === 'iron_ingot');
  down.add('f5');
  const again = bar.update(0.016);
  check('and F5 still drinks a potion rather than whatever fell into slot 0',
    again.kind === 'use' && used[used.length - 1].base === 'potion', used[used.length - 1].base);
}

// ---- a stack that runs out leaves a ghost -----------------------------------------------
console.log('item bar: an empty stack leaves a ghost');
{
  const { inventory, bar, down, said } = rig();
  inventory.add(makeItem({ base: 'potion', count: 2 }));
  bar.assign(0, { pack: 0 });
  down.add('f5'); bar.update(0.016);
  down.add('f5'); bar.update(0.016);
  const v = bar.view()[0];
  check('the potions are gone', v.count === 0 && v.have === false, JSON.stringify(v));
  check('but the slot is not empty: it is a ghost of what was there',
    v.empty === false && v.ghost === true && v.name === 'Potion', JSON.stringify(v));
  down.add('f5');
  const r = bar.update(0.016);
  check('and pressing it says you have none left rather than nothing at all',
    r.kind === 'gone' && /you have no potion left/.test(said[said.length - 1]), said[said.length - 1]);
  inventory.add(makeItem({ base: 'potion', count: 1 }));
  check('finding another one lights the slot back up without touching the bar',
    bar.view()[0].ghost === false && bar.view()[0].count === 1, JSON.stringify(bar.view()[0]));
}

// ---- a sword equips, and the slot reads worn ---------------------------------------------
console.log('item bar: a sword equips and the slot reads worn');
{
  const { character, inventory, bar, down, said } = rig();
  inventory.add(makeItem({ base: 'longsword' }));
  bar.assign(1, { pack: 0 });
  check('the sword is on slot two', bar.bar[1].base === 'longsword');
  check('and the view knows it would be held, not drunk', bar.view()[1].kind === 'equip', bar.view()[1].kind);

  down.add('f6');
  const r = bar.update(0.016);
  check('F6 equips it through inventory.equip',
    r.kind === 'equip' && r.ok === true && character.equipment.mainHand?.base === 'longsword', JSON.stringify(r.kind));
  check('and inventory says it in its own words', /you put on longsword/.test(said[said.length - 1]), said[said.length - 1]);

  const v = bar.view()[1];
  check('the slot now reads worn, and says where',
    v.worn === true && v.wornAt === 'mainHand' && v.ghost === false, JSON.stringify(v));
  down.add('f6');
  const again = bar.update(0.016);
  check('pressing it again says it is already there rather than doing it twice',
    again.kind === 'worn' && /already on your mainHand/.test(said[said.length - 1]), said[said.length - 1]);
  inventory.unequip('mainHand');
  check('taking it off puts the slot back to ready',
    bar.view()[1].worn === false && bar.view()[1].have === true, JSON.stringify(bar.view()[1]));
}

// ---- the doll is a drag source too --------------------------------------------------------
{
  const { character, inventory, bar } = rig();
  inventory.add(makeItem({ base: 'buckler' }));
  inventory.equip(0);
  check('the buckler is on the arm', character.equipment.offHand?.base === 'buckler');
  const r = bar.assign(2, { slot: 'offHand' });
  check('a doll address assigns just as a pack address does',
    r.ok === true && bar.bar[2].base === 'buckler', JSON.stringify(bar.bar[2]));
  check('and the slot reads worn straight away', bar.view()[2].worn === true, JSON.stringify(bar.view()[2]));
}

// ---- the refusals -------------------------------------------------------------------------
console.log('item bar: the refusals');
{
  const { inventory, bar, said } = rig();
  inventory.add(makeItem({ base: 'iron_ingot', count: 4 }));
  const r = bar.assign(0, { pack: 0 });
  check('a lump of iron will not go on a key, and says why',
    r.ok === false && /does not answer to a key/.test(r.reason), r.reason);
  check('and the slot stays empty', bar.bar[0] === null);
  check('a slot number nobody has is refused', bar.assign(9, { pack: 0 }).ok === false);
  check('and so is an empty pack address',
    bar.assign(0, { pack: 30 }).ok === false && /nothing there/.test(said[said.length - 1]), said[said.length - 1]);
  check('clearing an empty slot is refused rather than silent',
    bar.clear(3).ok === false && /already empty/.test(said[said.length - 1]), said[said.length - 1]);
}
{
  // one base, one slot: two keys on the same potions is two counts of one truth
  const { inventory, bar } = rig();
  inventory.add(makeItem({ base: 'potion', count: 2 }));
  bar.assign(0, { pack: 0 });
  const r = bar.assign(4, { pack: 0 });
  check('putting the same base on a second key moves it rather than copying it',
    bar.bar[0] === null && bar.bar[4].base === 'potion', JSON.stringify(bar.bar.map((x) => x && x.base)));
  check('and it says it left the old key', /leaves F5/.test(r.reason), r.reason);
  const cleared = bar.clear(4);
  check('and clearing it says what came off', cleared.ok && /Potion comes off F9/.test(cleared.reason), cleared.reason);
}
{
  // no useItem hook: the bar says which code is missing rather than eating the press
  const { inventory, bar, down, said } = rig({ noUseItem: true });
  inventory.add(makeItem({ base: 'potion', count: 1 }));
  bar.assign(0, { pack: 0 });
  down.add('f5');
  const r = bar.update(0.016);
  check('with no useItem wired the press says which line main.js is missing',
    r.kind === 'unwired' && /createItemBar/.test(said[said.length - 1]), said[said.length - 1]);
  check('and the potion is still in the pack, unspent', bar.view()[0].count === 1);
}
{
  // A TOOL IS CHOSEN, NOT TAKEN IN HAND (T3). There is no tool row and no
  // setTool hook any more: the press marks the slot, and `toolFor` in tools.js
  // prefers it over everything else that is carried.
  const r = rig();
  r.inventory.add(makeItem({ base: 'pickaxe' }));
  r.bar.assign(0, { pack: 0 });
  r.down.add('f5');
  const first = r.bar.update(0.016);
  check('pressing a tool slot chooses it, with no hook wired to anything',
    first.kind === 'tool' && first.ok === true && r.bar.selected === 0, `${first.kind}/${r.bar.selected}`);
  check('and says what the choice does', /chosen/i.test(r.said[r.said.length - 1]) && /mining/i.test(r.said[r.said.length - 1]),
    r.said[r.said.length - 1]);
  check('the document remembers it, so the save and toolFor can read it', r.character.itemBarSlot === 0);
  check('and the view lights that cell and no other',
    r.bar.view().filter((e) => e.selected).map((e) => e.slot).join(',') === '0');

  r.down.add('f5');
  const again = r.bar.update(0.016);
  check('pressing it again keeps it chosen and says so rather than going quiet',
    again.ok === true && r.bar.selected === 0 && /already/i.test(r.said[r.said.length - 1]), r.said[r.said.length - 1]);

  // the other direction: a tool nothing reads is not a thing to choose
  const pick = rig();
  pick.inventory.add(makeItem({ base: 'lockpick', count: 3 }));
  pick.bar.assign(0, { pack: 0 });
  pick.down.add('f5');
  const lp = pick.bar.update(0.016);
  check('a lockpick is not chosen, because the lock takes one out of the pack itself',
    lp.ok === false && lp.kind === 'unchosen' && pick.bar.selected === null, lp.kind);
  check('and it says so instead of lighting a cell that decides nothing',
    /not something you choose/.test(pick.said[pick.said.length - 1]), pick.said[pick.said.length - 1]);

  // taking the chosen tool off the bar puts the choice down, out loud
  const off = rig();
  off.inventory.add(makeItem({ base: 'pickaxe' }));
  off.bar.assign(2, { pack: 0 });
  off.bar.use(2);
  check('a tool is chosen from a mouse click as well as from a key', off.bar.selected === 2);
  off.bar.clear(2);
  check('clearing the slot puts the choice down', off.bar.selected === null);
  check('and says what that means for the next tree',
    /no longer the tool you chose/.test(off.said[off.said.length - 1]), off.said[off.said.length - 1]);

  // putting the choice down on its own says so too: a tool that quietly stopped
  // being the chosen one would change the next click and look like nothing
  const put = rig();
  put.inventory.add(makeItem({ base: 'pickaxe' }));
  put.bar.assign(0, { pack: 0 });
  put.bar.use(0);
  const dr = put.bar.deselect();
  check('putting the choice down on its own says what it means',
    dr.ok === true && put.bar.selected === null && /What you carry decides again/.test(put.said[put.said.length - 1]),
    put.said[put.said.length - 1]);
  check('and putting down a choice nobody made says nothing and changes nothing',
    put.bar.deselect().ok === false && put.bar.selected === null);

  // and dragging it to another key keeps it chosen, since it is the same tool
  const drag = rig();
  drag.inventory.add(makeItem({ base: 'pickaxe' }));
  drag.bar.assign(1, { pack: 0 });
  drag.bar.use(1);
  drag.bar.assign(4, { pack: 0 });
  check('a chosen tool dragged to another key is still chosen', drag.bar.selected === 4, String(drag.bar.selected));
  check('and the line says so', /still the tool you chose/.test(drag.said[drag.said.length - 1]), drag.said[drag.said.length - 1]);

  // burying it under something that is not a tool is a real change, and said
  const bury = rig();
  bury.inventory.add(makeItem({ base: 'pickaxe' }));
  bury.inventory.add(makeItem({ base: 'potion', count: 2 }));
  bury.bar.assign(3, { pack: 0 });
  bury.bar.use(3);
  bury.bar.assign(3, { pack: 1 });
  check('a potion dropped on the chosen slot puts the choice down', bury.bar.selected === null);
  check('and says the pack decides again',
    /no longer chosen/.test(bury.said[bury.said.length - 1]), bury.said[bury.said.length - 1]);
}
{
  // the keyboard is not the bar's while a window has it
  let open = true;
  const { inventory, bar, down, used, swallowed } = rig({ enabled: () => !open });
  inventory.add(makeItem({ base: 'potion', count: 2 }));
  bar.assign(0, { pack: 0 });
  down.add('f5');
  check('with a window open the key does nothing at all', bar.update(0.016) === null && used.length === 0);
  check('and the press is not even swallowed, so the window still gets it', swallowed.length === 0);
  open = false;
  check('and the moment it closes the same press fires', bar.update(0.016).kind === 'use' && used.length === 1);
}

// ---- rebinding ------------------------------------------------------------------------------
console.log('item bar: the keys rebind');
{
  const { character, inventory, bar, down, used } = rig();
  inventory.add(makeItem({ base: 'potion', count: 3 }));
  bar.assign(0, { pack: 0 });
  check('slot one answers to F5 by default', keyOf(character, 0) === 'f5');
  const r = bar.rebind(0, 'F3');
  check('it can be bound to F3', r.ok === true && keyOf(character, 0) === 'f3', r.reason);
  check('and the document carries the whole row, not one key',
    Array.isArray(character.settings.itemBar) && character.settings.itemBar.length === 8
    && character.settings.itemBar.join(',') === 'f3,f6,f7,f8,f9,f10,f11,f12',
    String(character.settings.itemBar));
  check('the view wears the new cap', bar.view()[0].cap === 'F3', bar.view()[0].cap);

  down.add('f5');
  check('F5 no longer fires it', bar.update(0.016) === null && used.length === 0);
  down.clear();
  down.add('f3');
  check('and F3 does', bar.update(0.016).kind === 'use' && used.length === 1);

  check('a key the world drives is refused, and named',
    bar.rebind(1, 'w').ok === false && /drives the world/.test(bar.lastSaid), bar.lastSaid);
  check('an ability bar key is refused', bar.rebind(1, '3').ok === false && /ability bar/.test(bar.lastSaid), bar.lastSaid);
  check('fly mode and the dev bench are refused',
    bar.rebind(1, 'f1').ok === false && bar.rebind(1, 'f2').ok === false, bar.lastSaid);
  check('and a key another slot already holds is refused, and says which slot',
    bar.rebind(1, 'f7').ok === false && /already slot 3/.test(bar.lastSaid), bar.lastSaid);
  check('none of the refusals moved anything', keysOf(character).join(',') === 'f3,f6,f7,f8,f9,f10,f11,f12',
    keysOf(character).join(','));
  check('rebinding a slot nobody has is refused', rebind(character, 8, 'f4').ok === false);
}

// ---- the browser's own keys -------------------------------------------------------------------
console.log('item bar: F5 does not reload the page');
{
  // a fake window, because input.js never calls preventDefault and F5 would
  // otherwise take the whole world with it
  const listeners = [];
  const win = {
    addEventListener: (name, fn, capture) => listeners.push({ name, fn, capture }),
    removeEventListener: (name, fn) => {
      const i = listeners.findIndex((l) => l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  const character = blank();
  const bar = createItemBar({ character, inventory: createInventory({ character }), win });
  check('the guard is installed on keydown, in the capture phase',
    listeners.length === 1 && listeners[0].name === 'keydown' && listeners[0].capture === true,
    JSON.stringify(listeners.map((l) => l.name)));
  const press = (key, mods = {}) => {
    let prevented = false;
    listeners[0].fn({ key, preventDefault: () => { prevented = true; }, ...mods });
    return prevented;
  };
  check('F5 is swallowed, so the page does not reload', press('F5') === true);
  check('F11 is swallowed, so the game does not go full screen', press('F11') === true);
  check('a key the bar is not bound to is left entirely alone', press('F3') === false && press('a') === false);
  check('and so is a key with a modifier on it, which is a browser shortcut',
    press('F5', { ctrlKey: true }) === false);
  rebind(character, 0, 'f3');
  check('a rebind takes effect on the guard at once, both ways',
    press('F3') === true && press('F5') === false, 'f3 now guarded, f5 released');
  bar.dispose();
  check('and dispose takes the listener back off the window', listeners.length === 0);
}

// ---- the view is total ---------------------------------------------------------------------
{
  const { inventory, bar } = rig();
  inventory.add(makeItem({ base: 'potion', count: 1 }));
  bar.assign(0, { pack: 0 });
  const v = bar.view();
  const fields = ['slot', 'key', 'cap', 'base', 'name', 'count', 'have', 'worn', 'wornAt', 'ghost', 'empty', 'kind'];
  check('every entry carries every field the HUD draws, filled or empty',
    v.every((e) => fields.every((f) => f in e)), fields.join(','));
  check('and the empty ones carry them too, so a cell never reads undefined',
    fields.every((f) => f in v[7]), JSON.stringify(v[7]));
  check('labelOf prefers a crafted label over the base word',
    labelOf({ base: 'iron_ingot', label: 'Iron ingot' }) === 'Iron ingot' && labelOf('iron_ingot') === 'Iron Ingot');
  check('the doll it searches is items.js s six, not a second list',
    SLOTS.length === 6, String(SLOTS.length));
}

// ---- the prose -------------------------------------------------------------------------------
// CLAUDE.md: no em dashes. sky.test.mjs guards two files this way; these are U4's.
for (const f of ['src/game/item_bar.js', 'src/game/win_abilities.js', 'src/game/hud.js',
  'src/game/inventory.js', 'docs/mmo/wiring/U4.md']) {
  check(`${f} has no em dashes`, !readFileSync(f, 'utf8').includes('\u2014'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
