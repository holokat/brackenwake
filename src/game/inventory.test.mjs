// The pack and the paper doll. Run: node src/game/inventory.test.mjs
//
// Headless on purpose, and not because a DOM was inconvenient: every refusal,
// every displacement and every word said is decided here, and the windows are
// only a view of it. Each check below drives the gate in both directions where
// there is a gate to drive.

import {
  createInventory, normalise, parseWhere, weightOfCharacter, carryOfCharacter,
  armourOfCharacter, resistsOfCharacter, itemTipLines, PACK_SLOTS,
  sortOrder, sortRank, sortName,
} from './inventory.js';
import { makeItem, baseFor, SLOTS, canEquip } from '../mmo/items.js';
import { rollAffixes, identify } from '../mmo/affixes.js';
import { derived } from '../mmo/stats.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const blank = (stats = { str: 60, dex: 50, int: 50, con: 50, wis: 50 }) => normalise({
  name: 'Test', stats, skills: {}, gold: 0,
  pack: { slots: PACK_SLOTS, items: [] }, equipment: {},
});

function rig(stats, opts = {}) {
  const said = [];
  const cues = [];
  const character = blank(stats);
  let recomputes = 0;
  let changes = 0;
  const inv = createInventory({
    character,
    actor: { pos: { x: 0, y: 0, z: 0 } },
    recompute: () => { recomputes++; },
    onChange: () => { changes++; },
    hud: { toast: (t) => said.push(String(t)) },
    audio: { play: (c) => cues.push(c) },
    ...opts,
  });
  return {
    inv, character, said, cues,
    last: () => said[said.length - 1] || '',
    get recomputes() { return recomputes; },
    get changes() { return changes; },
  };
}

const item = (base, o = {}) => makeItem({ base, seed: 1234, ...o });

// ---- addresses ------------------------------------------------------------
check('a number is a pack slot', parseWhere(3)?.index === 3);
check('a slot name is a slot', parseWhere('head')?.slot === 'head');
check('{ pack: 2 } is a pack slot', parseWhere({ pack: 2 })?.index === 2);
check('a word that is not a slot is nowhere', parseWhere('pocket') === null);
check('nonsense is nowhere', parseWhere({ elbow: 1 }) === null);

// ---- the pack fills, and says so ------------------------------------------
{
  const { inv, character, said, last } = rig();
  let added = 0;
  for (let i = 0; i < PACK_SLOTS; i++) {
    const r = inv.add(item('longsword'));
    if (r.ok) added++;
  }
  check(`twenty longswords fill twenty slots`, added === PACK_SLOTS, `${added}`);
  check('and the pack has no room left', inv.emptySlot() === -1);
  const before = said.length;
  const r = inv.add(item('longsword'));
  check('the twenty first is refused', r.ok === false && r.added === 0 && r.dropped === 1, JSON.stringify({ added: r.added, dropped: r.dropped }));
  check('and it is not silent', said.length === before + 1 && /pack is full/.test(last()), last());
  check('and it names the thing that stayed', /longsword/.test(last()), last());
  check('nothing was eaten: still twenty items', character.pack.items.filter(Boolean).length === PACK_SLOTS);
}

// ---- stacks stack ---------------------------------------------------------
{
  const { inv, character } = rig();
  inv.add(item('arrow', { count: 40 }));
  const r = inv.add(item('arrow', { count: 20 }));
  check('two lots of arrows are one stack', character.pack.items.filter(Boolean).length === 1);
  check('and the count is the sum', character.pack.items[0].count === 60, String(character.pack.items[0].count));
  check('and the report says all sixty went in', r.added === 20 && r.dropped === 0);
  inv.add(item('ingot', { count: 5 }));
  check('a different material takes its own slot', character.pack.items.filter(Boolean).length === 2);
  const sword = item('longsword');
  inv.add(sword);
  inv.add(item('longsword'));
  check('two swords are two slots, because swords do not stack', character.pack.items.filter(Boolean).length === 4);
}

// ---- equipping, and the STR penalty ---------------------------------------
{
  const { inv, character, said, last } = rig({ str: 60, dex: 50, int: 50, con: 50, wis: 50 });
  const plate = item('plate_chest');
  const verdict = canEquip(plate, character.stats);
  check('the rules allow plate under its STR', verdict.ok === true);
  inv.add(plate);
  const r = inv.equip(0);
  check('and it goes on', r.ok === true && character.equipment.chest === plate);
  check('the penalty comes back with it', r.penalty.arMul === 0.5 && Math.abs(r.penalty.swingMul - 1.15) < 1e-9, JSON.stringify(r.penalty));
  check('and the player is told the number', /wants 75 STR and you have 60/.test(said.join(' | ')), last());
  check('and told what it costs', /guards half as well/.test(said.join(' | ')) && /15% slower/.test(said.join(' | ')), last());
  const bare = armourOfCharacter(character);
  check('a halved breastplate is AR 12, not 24', bare === 12, String(bare));
}
{
  const { inv, character, last } = rig({ str: 80, dex: 50, int: 50, con: 50, wis: 50 });
  inv.add(item('plate_chest'));
  const r = inv.equip(0);
  check('at 80 STR the same plate reports no penalty', r.ok && !r.warning, r.warning || '');
  check('and gives its whole 24 AR', armourOfCharacter(character) === 24, String(armourOfCharacter(character)));
}
{
  const { inv, last } = rig({ str: 20, dex: 50, int: 50, con: 50, wis: 50 });
  inv.add(item('warhammer'));
  const r = inv.equip(0);
  check('a warhammer over your STR is refused outright', r.ok === false);
  check('and says the two numbers', /wants 65 STR and you have 20/.test(r.reason), r.reason);
}

// ---- two hands unseat the shield ------------------------------------------
{
  const { inv, character, said } = rig({ str: 80, dex: 50, int: 50, con: 50, wis: 50 });
  inv.add(item('kite'));
  inv.equip(0);
  check('the shield is in the off hand', character.equipment.offHand?.base === 'kite');
  inv.add(item('greatsword'));
  const i = character.pack.items.findIndex((x) => x && x.base === 'greatsword');
  const r = inv.equip(i);
  check('the greatsword goes in the main hand', r.ok && character.equipment.mainHand?.base === 'greatsword');
  check('the off hand is empty', character.equipment.offHand === null);
  check('and the shield is in the pack', character.pack.items.some((x) => x && x.base === 'kite'));
  check('and it was said out loud', /both hands are on it/.test(said.join(' | ')), said.join(' | '));
}
{
  // The same swing with a full pack. The sword's own slot frees up as it is
  // drawn, so one homeless shield still has somewhere to go: this succeeds,
  // and the accounting is the point.
  const { inv, character } = rig({ str: 80, dex: 50, int: 50, con: 50, wis: 50 });
  inv.add(item('kite'));
  inv.equip(0);
  const sword = item('greatsword');
  inv.add(sword);
  const swordAt = character.pack.items.indexOf(sword);
  for (let i = 0; i < PACK_SLOTS; i++) if (!character.pack.items[i]) character.pack.items[i] = item('ingot', { count: 1, seed: i });
  check('the pack is full', inv.emptySlot() === -1);
  const r = inv.equip(swordAt);
  check('the two hander still draws, because its own slot frees as it leaves', r.ok === true, r.reason || '');
  check('and the shield takes exactly that slot', character.pack.items[swordAt]?.base === 'kite');
}
{
  // Two things have to come off and only one slot frees. This is the refusal.
  const { inv, character } = rig({ str: 80, dex: 50, int: 50, con: 50, wis: 50 });
  inv.add(item('kite'));
  inv.equip(0);
  inv.add(item('longsword'));
  inv.equip(character.pack.items.findIndex((x) => x));
  check('a sword and a shield are held', character.equipment.mainHand?.base === 'longsword' && character.equipment.offHand?.base === 'kite');
  const sword = item('greatsword');
  inv.add(sword);
  const swordAt = character.pack.items.indexOf(sword);
  for (let i = 0; i < PACK_SLOTS; i++) if (!character.pack.items[i]) character.pack.items[i] = item('ingot', { count: 1, seed: i });
  check('and the pack is full', inv.emptySlot() === -1);
  const r = inv.equip(swordAt);
  check('the two hander is refused when both hands have nowhere to go', r.ok === false, r.reason);
  check('and it says which shield and why', /both hands/.test(r.reason) && /kite/i.test(r.reason), r.reason);
  check('the shield is still on', character.equipment.offHand?.base === 'kite');
  check('the sword is still in hand', character.equipment.mainHand?.base === 'longsword');
  check('and the greatsword is still in the pack', character.pack.items[swordAt] === sword);
}

// ---- rings pick the empty hand --------------------------------------------
{
  const { inv, character } = rig();
  inv.add(item('ring', { seed: 1 }));
  inv.add(item('ring', { seed: 2 }));
  inv.equip(0);
  check('the first ring takes ring1', character.equipment.ring1?.seed === 1);
  inv.equip(character.pack.items.findIndex((x) => x && x.seed === 2));
  check('the second takes ring2, not ring1', character.equipment.ring2?.seed === 2 && character.equipment.ring1?.seed === 1);
  const r = inv.move('ring1', 'ring2');
  check('and the two can trade hands', r.ok && character.equipment.ring1.seed === 2 && character.equipment.ring2.seed === 1);
}

// ---- taking it off --------------------------------------------------------
{
  const { inv, character, last } = rig();
  inv.add(item('cloth_head'));
  inv.equip(0);
  check('the hood is on', character.equipment.head?.base === 'cloth_head');
  const r = inv.unequip('head');
  check('and comes off into the pack', r.ok && character.equipment.head === null && character.pack.items[r.index]?.base === 'cloth_head');
  check('and says so', /take off/.test(last()), last());
}
{
  const { inv, character, last } = rig();
  inv.add(item('cloth_head'));
  inv.equip(0);
  for (let i = 0; i < PACK_SLOTS; i++) character.pack.items[i] = item('ingot', { count: 1, seed: i });
  const r = inv.unequip('head');
  check('with a full pack it stays on', r.ok === false && character.equipment.head !== null);
  check('and says why', /pack is full/.test(r.reason), r.reason);
}

// ---- move ------------------------------------------------------------------
{
  const { inv, character } = rig();
  inv.add(item('longsword'));
  inv.move(0, 5);
  check('a sword moves to an empty slot', character.pack.items[0] === null && character.pack.items[5]?.base === 'longsword');
  inv.add(item('dagger'));
  const at = character.pack.items.findIndex((x) => x && x.base === 'dagger');
  inv.move(at, 5);
  check('and two full slots swap', character.pack.items[5]?.base === 'dagger' && character.pack.items[at]?.base === 'longsword');
  inv.add(item('arrow', { count: 10 }));
  const a1 = character.pack.items.findIndex((x) => x && x.base === 'arrow');
  character.pack.items[9] = makeItem({ base: 'arrow', seed: 9, count: 5 });
  const r = inv.move(a1, 9);
  check('two stacks of arrows merge', r.ok && character.pack.items[9].count === 15 && character.pack.items[a1] === null, String(character.pack.items[9].count));
  const bad = inv.move('head', 'mainHand');
  check('a hood does not go to the main hand', bad.ok === false, bad.reason);
}

// ---- identify is real and always was --------------------------------------
{
  const { inv, character, last } = rig({ str: 50, dex: 50, int: 90, con: 50, wis: 50 });
  const sword = makeItem({ base: 'longsword', rarity: 'rare', seed: 4242 });
  inv.add(sword);
  check('a rare arrives unidentified', character.pack.items[0].identified === false);
  const want = rollAffixes(sword).map((a) => `${a.id}:${a.value}`).join(',');
  const r = inv.identify(0);
  check('identify says yes', r.ok === true);
  check('it is identified in place', character.pack.items[0].identified === true);
  const got = character.pack.items[0].affixes.map((a) => `${a.id}:${a.value}`).join(',');
  check('and the affixes are the ones the seed always held', got === want, got);
  check('and the player was told them', new RegExp(character.pack.items[0].affixes[0].label, 'i').test(last()), last());
  const again = inv.identify(0);
  check('identifying it twice refuses and says so', again.ok === false && /already know/.test(again.reason), again.reason);
}
{
  // INT decides how much is legible, both ends of the rule.
  const dim = rig({ str: 50, dex: 50, int: 10, con: 50, wis: 50 });
  const bright = rig({ str: 50, dex: 50, int: 95, con: 50, wis: 50 });
  const seed = 777;
  dim.inv.add(makeItem({ base: 'plate_chest', rarity: 'epic', seed }));
  bright.inv.add(makeItem({ base: 'plate_chest', rarity: 'epic', seed }));
  const a = dim.inv.identify(0);
  const b = bright.inv.identify(0);
  check('at 10 INT some numbers are a range', a.vague > 0, `${a.vague} vague`);
  check('at 95 INT none are', b.vague === 0, `${b.vague} vague`);
  check('and both rolled the same sword', JSON.stringify(a.item.affixes.map((x) => x.value)) === JSON.stringify(b.item.affixes.map((x) => x.value)));
}

// ---- weight and the limit --------------------------------------------------
{
  const { inv, character } = rig({ str: 60, dex: 50, int: 50, con: 50, wis: 50 });
  check('an empty pack weighs nothing', inv.weight() === 0);
  check('carry is 40 + STR * 2', inv.carry() === derived(character.stats, {}).carry && inv.carry() === 160, String(inv.carry()));
  check('and nothing is overweight yet', inv.overweight() === false);
  for (let i = 0; i < 18; i++) inv.add(makeItem({ base: 'plate_chest', seed: i }));
  check('eighteen breastplates weigh 162', inv.weight() === 162, String(inv.weight()));
  check('and that is over the limit', inv.overweight() === true);
  check('and the crossing was announced', inv.lastSaid.includes('over your limit'), inv.lastSaid);
}
{
  // The Carry affix raises the limit, so the sheet has to read it off the gear.
  const { inv, character } = rig({ str: 60, dex: 50, int: 50, con: 50, wis: 50 });
  const belt = makeItem({ base: 'leather_waist', rarity: 'rare', seed: 3 });
  belt.affixes = [{ id: 'carry', stat: 'carry', group: 'utility', label: 'Carry', unit: 'stones', value: 30, range: [10, 60], tier: 'rare' }];
  belt.identified = true;
  inv.add(belt);
  inv.equip(0);
  check('a belt of Burden raises the limit', inv.carry() === 190, String(inv.carry()));
}

// ---- AR and resists add up --------------------------------------------------
{
  const { inv, character } = rig({ str: 100, dex: 50, int: 50, con: 50, wis: 50 });
  for (const piece of ['head', 'chest', 'hands', 'wrists', 'waist', 'legs', 'feet', 'back']) {
    inv.add(makeItem({ base: `plate_${piece}`, seed: 5 }));
  }
  for (let i = 0; i < 8; i++) inv.equip(character.pack.items.findIndex((x) => x));
  check('a full plate set is AR 108, the number the document states', armourOfCharacter(character) === 108, String(armourOfCharacter(character)));
  const res = resistsOfCharacter(character);
  check('and physical resist is eight pieces of 3', res.physical === 24, JSON.stringify(res));
  check('and fire resist eight of 2', res.fire === 16, JSON.stringify(res));
  check('the pack is empty and it is all worn', character.pack.items.filter(Boolean).length === 0);
  check('and the whole set weighs 72 stones', weightOfCharacter(character) === 72, String(weightOfCharacter(character)));
}

// ---- recompute and onChange fire on every change ---------------------------
{
  const r = rig();
  const ops = [];
  const before = () => ({ rc: r.recomputes, ch: r.changes });
  const step = (name, fn) => {
    const b = before();
    fn();
    ops.push({ name, recomputed: r.recomputes > b.rc, changed: r.changes > b.ch });
  };
  step('add', () => r.inv.add(item('longsword')));
  step('equip', () => r.inv.equip(0));
  step('unequip', () => r.inv.unequip('mainHand'));
  step('move', () => r.inv.move(r.character.pack.items.findIndex((x) => x), 11));
  step('drop', () => r.inv.drop(11));
  const silent = ops.filter((o) => !o.recomputed || !o.changed);
  check('every change recomputes and notifies', silent.length === 0, silent.map((s) => s.name).join(', '));
}

// ---- nothing changes in silence --------------------------------------------
{
  const r = rig();
  const lines = [];
  const step = (name, fn) => { const n = r.said.length; fn(); lines.push({ name, spoke: r.said.length > n }); };
  step('add', () => r.inv.add(item('longsword')));
  step('equip', () => r.inv.equip(0));
  step('unequip', () => r.inv.unequip('mainHand'));
  step('drop', () => r.inv.drop(r.character.pack.items.findIndex((x) => x)));
  step('refused sell', () => r.inv.sell(0));
  step('refused equip of nothing', () => r.inv.equip(19));
  const mute = lines.filter((l) => !l.spoke);
  check('every operation says something', mute.length === 0, mute.map((m) => m.name).join(', '));
}

// ---- selling needs a buyer --------------------------------------------------
{
  const { inv, character, last } = rig();
  inv.add(item('longsword'));
  const r = inv.sell(0);
  check('with no vendor hooked up it refuses', r.ok === false && /nobody/.test(r.reason), r.reason);
  check('and the sword is still there', character.pack.items[0] !== null);
}
{
  const said = [];
  const character = blank();
  const inv = createInventory({
    character,
    hud: { toast: (t) => said.push(String(t)) },
    onSell: () => ({ price: 27 }),
  });
  inv.add(makeItem({ base: 'longsword', seed: 1 }));
  const r = inv.sell(0);
  check('a vendor that names a price is paid out', r.ok === true && r.price === 27);
  check('and the gold lands in the document', character.gold === 27, String(character.gold));
  check('and the sword is gone', character.pack.items[0] === null);
  check('and the player was told the price and the purse', /27 gold/.test(said.join(' | ')) && /have 27/.test(said.join(' | ')), said.join(' | '));
}

// ---- the tooltip ------------------------------------------------------------
{
  const it = identify(makeItem({ base: 'longsword', rarity: 'epic', seed: 99 }), 95);
  const lines = itemTipLines(it);
  check('the tooltip names the item first', lines[0].text === it.name, lines[0].text);
  check('and the name takes the rarity colour', lines[0].colour === '#a335ee', String(lines[0].colour));
  const affixLines = lines.filter((l) => l.colour === '#a335ee').length - 1;
  check('and every affix is coloured too', affixLines === it.affixes.length, `${affixLines} of ${it.affixes.length}`);
  const un = itemTipLines(makeItem({ base: 'longsword', rarity: 'mythic', seed: 3 }));
  check('an unidentified item gives up its colour and nothing else', un.length === 2 && /gold longsword/.test(un[0].text), un.map((l) => l.text).join(' | '));
}

// ---- the document is repaired, not trusted -----------------------------------
{
  const c = normalise({ pack: { slots: 20, items: [null, undefined] }, equipment: { head: undefined } });
  check('a short pack is filled out to its slot count', c.pack.items.length === 20);
  check('and no hole reads as undefined', c.pack.items.every((x) => x === null));
  check('and every one of the fourteen slots exists', SLOTS.every((s) => s in c.equipment));
  check('and gold is a number', c.gold === 0);
}

// ---- the quick sort (U4) -----------------------------------------------------
// The whole point of the button is that nothing goes missing while it tidies,
// so every block below counts the pack in and counts it out.

const tally = (list) => {
  const out = {};
  for (const it of list) if (it) out[`${it.base}|${it.material || ''}`] = (out[`${it.base}|${it.material || ''}`] || 0) + (it.count || 1);
  return out;
};
const same = (a, b) => {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.join(',') === kb.join(',') && ka.every((k) => a[k] === b[k]);
};
const stamp = (list) => list.filter(Boolean).map((it) => `${it.base}${it.material ? ':' + it.material : ''}x${it.count || 1}`).join(' ');
const lump = (base, count, material, label) => {
  const it = makeItem({ base, count, seed: base.length * 7 + count });
  if (material) { it.material = material; it.label = label; }
  return it;
};

console.log('inventory: the quick sort');
{
  // the scattered pack the brief describes, byte for byte
  const c = blank();
  const p = c.pack.items;
  p[0] = lump('ingot', 3, 'iron', 'Iron ingot');
  p[2] = lump('longsword', 1);
  p[5] = lump('ingot', 2, 'iron', 'Iron ingot');
  p[7] = lump('potion', 4);
  p[9] = lump('cloth_head', 1);
  p[11] = lump('pickaxe', 1);
  p[13] = lump('apple', 2);
  p[17] = lump('buckler', 1);
  const before = tally(p);
  const inv = createInventory({ character: c });
  const r = inv.sort();

  check('the sort reports itself', r.ok === true, JSON.stringify({ merged: r.merged, moved: r.moved, free: r.free }));
  check('the two iron ingot stacks become one', r.merged === 1 && p.filter((x) => x && x.base === 'ingot').length === 1,
    `${r.merged} merged, ${p.filter((x) => x && x.base === 'ingot').length} ingot stack(s)`);
  check('and the one stack holds all five', p.find((x) => x && x.base === 'ingot').count === 5,
    String(p.find((x) => x && x.base === 'ingot').count));
  check('the order comes out byte for byte',
    stamp(p) === 'longswordx1 bucklerx1 cloth_headx1 potionx4 applex2 ingot:ironx5 pickaxex1', stamp(p));
  check('nothing is lost: the same bases and the same counts', same(before, tally(p)), `${JSON.stringify(before)} -> ${JSON.stringify(tally(p))}`);
  check('everything is compacted to the front, holes all at the back',
    p.slice(0, 7).every(Boolean) && p.slice(7).every((x) => !x), stamp(p));
  check('and the line says the numbers rather than the verb',
    /1 stack folds into another/.test(r.text) && /slots are open at the back/.test(r.text), r.text);

  const again = inv.sort();
  check('sorting a sorted pack moves nothing and says so',
    again.merged === 0 && again.moved === 0 && /already in order/.test(again.text), again.text);
}
{
  // the guard the sentence has to earn: two DIFFERENT materials must not merge
  const c = blank();
  const p = c.pack.items;
  p[0] = lump('ingot', 3, 'iron', 'Iron ingot');
  p[1] = lump('ingot', 2, 'copper', 'Copper ingot');
  const before = tally(p);
  const r = createInventory({ character: c }).sort();
  check('an iron stack and a copper stack stay two stacks',
    r.merged === 0 && p.filter((x) => x && x.base === 'ingot').length === 2, stamp(p));
  check('and neither one changed material', same(before, tally(p)), stamp(p));
  check('copper comes before iron, by the name a player reads', p[0].material === 'copper', stamp(p));
}
{
  // a magic dagger is not a stack, whatever items.js says about daggers
  const c = blank();
  const p = c.pack.items;
  p[0] = makeItem({ base: 'potion', count: 2 });
  p[1] = makeItem({ base: 'potion', count: 3 });
  p[2] = makeItem({ base: 'dagger', rarity: 'rare', seed: 4 });
  p[3] = makeItem({ base: 'dagger', rarity: 'rare', seed: 9 });
  const r = createInventory({ character: c }).sort();
  check('two plain potions merge', r.merged === 1 && p.find((x) => x.base === 'potion').count === 5, stamp(p));
  check('two rare daggers do not', p.filter((x) => x && x.base === 'dagger').length === 2, stamp(p));
}
{
  // the pure half, on its own, and it must not touch what it is handed
  const a = makeItem({ base: 'arrow', count: 20 });
  const b = makeItem({ base: 'arrow', count: 40 });
  const list = [null, a, null, b];
  const res = sortOrder(list);
  check('sortOrder is pure: the array it was handed is unchanged',
    list[1] === a && a.count === 20 && list[3] === b && b.count === 40, `${a.count} and ${b.count}`);
  check('and the merged stack is a new record with the sum',
    res.items.length === 1 && res.items[0].count === 60 && res.items[0] !== a, JSON.stringify(res.items[0].count));
  check('it counts the merge and the move', res.merged === 1 && res.moved === 1, `${res.merged} merged, ${res.moved} moved`);
  check('an empty pack sorts to nothing and says nothing moved',
    sortOrder([]).items.length === 0 && sortOrder([null, null]).merged === 0);
}
{
  // the shelf order itself, named rather than inferred from one example
  const rank = (id) => sortRank({ base: id });
  check('weapons first, then shields, then armour',
    rank('longsword') < rank('buckler') && rank('buckler') < rank('cloth_head'), `${rank('longsword')} ${rank('buckler')} ${rank('cloth_head')}`);
  check('armour runs down the body in the paper doll s own slot order',
    rank('cloth_head') < rank('cloth_chest') && rank('cloth_chest') < rank('cloth_feet'),
    `${rank('cloth_head')} ${rank('cloth_chest')} ${rank('cloth_feet')}`);
  check('then jewellery, then what you drink, what you eat, what you build with, and tools last',
    rank('ring') < rank('potion') && rank('potion') < rank('apple') && rank('apple') < rank('ingot') && rank('ingot') < rank('pickaxe'),
    [rank('ring'), rank('potion'), rank('apple'), rank('ingot'), rank('pickaxe')].join(' '));
  check('a base this build has never heard of still gets a shelf and is carried through',
    sortRank({ base: 'moon_cheese' }) === 99 && sortOrder([{ base: 'moon_cheese' }]).items.length === 1);
  check('the sort name prefers the crafted label over the base word',
    sortName({ base: 'ingot', label: 'Iron ingot' }) === 'Iron ingot' && sortName({ base: 'ingot' }) === 'Ingot');
}
{
  // a full pack, because a sort that needed one spare slot would be a trap
  const c = normalise({ stats: { str: 60 }, skills: {}, pack: { slots: 6, items: [] }, equipment: {} });
  const p = c.pack.items;
  for (let i = 0; i < 6; i++) p[i] = makeItem({ base: 'ingot', count: 1, seed: i });
  const before = tally(p);
  const r = createInventory({ character: c }).sort();
  check('six single ingots in six slots become one stack of six',
    r.merged === 5 && p[0].count === 6 && p.slice(1).every((x) => !x), stamp(p));
  check('and not one ingot went missing', same(before, tally(p)), `${JSON.stringify(before)} -> ${JSON.stringify(tally(p))}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
