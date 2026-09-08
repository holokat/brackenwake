// The pack: what a cell shows, what a filter keeps, and what a double click
// does. Run: node src/game/win_bag.test.mjs
//
// The second half builds the REAL panel against a small fake document and
// fires REAL dblclick events at the cells, through the real createInventory.
// A double click that was only checked by reading actionFor would prove that a
// decision exists, not that clicking twice puts a sword on.

// --- a document, small enough to read ---------------------------------------
function makeDom() {
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '', hidden: false, draggable: false,
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      // Faithful to the real thing: setting textContent EMPTIES the node. Panels
      // clear and rebuild with it, and a fake that only stored the string would
      // let a tab strip grow four copies of itself and call it a pass.
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      listeners: {},
      offsetWidth: 100, offsetHeight: 100,
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) {
          const on = force === undefined ? !classes.has(c) : !!force;
          if (on) classes.add(c); else classes.delete(c);
          return on;
        },
      },
      setAttribute(k, v) { node.dataset[k] = v; },
      removeAttribute() {},
      contains: () => false,
      appendChild(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.push(c); return c;
      },
      remove() {
        if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; }
      },
      addEventListener(name, fn) { (node.listeners[name] ||= []).push(fn); },
      removeEventListener() {},
      fire(name, ev) { for (const fn of node.listeners[name] || []) fn(ev || { preventDefault() {}, stopPropagation() {} }); },
      get firstChild() { return node.children[0] || null; },
      get lastChild() { return node.children[node.children.length - 1] || null; },
      querySelector() { return null; },
    };
    return node;
  };
  const byId = new Map();
  return {
    createElement: el,
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { if (c.id) byId.set(c.id, c); return c; } },
    body: el('body'),
  };
}
globalThis.document = makeDom();
globalThis.window = {
  innerWidth: 1280, innerHeight: 720,
  addEventListener() {}, removeEventListener() {},
};

const {
  cellOf, ROLL_MS, actionFor, categoryOf, inCategory, CATEGORIES,
  USABLE, USE_IDS, USE_KINDS, usable, auditUsable, panel, buildBag,
} = await import('./win_bag.js');
const { makeItem } = await import('../mmo/items.js');
const { identify } = await import('../mmo/affixes.js');
const { createInventory, normalise, PACK_SLOTS } = await import('./inventory.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---- what a cell shows ------------------------------------------------------
console.log('bag: the cell');
{
  const v = cellOf(null);
  check('an empty slot is empty', v.empty === true && v.text === '' && v.colour === null);
}
{
  const v = cellOf(makeItem({ base: 'longsword', seed: 1 }));
  check('a common sword shows its name', v.text === 'Longsword' && v.empty === false);
  check('in white', v.colour === '#ffffff');
  check('and carries its rarity for the border', v.rarity === 'common');
  check('with no count, because a sword is one sword', v.count === 0);
  check('and no mystery', v.mystery === false);
  check('and the base, so the glyph can be drawn from it', v.base && v.base.id === 'longsword');
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
  check('and reads as its base alone, the colour is on the cell and not in the words', before.text === 'Longsword', before.text);
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

// ---- the filters ------------------------------------------------------------
console.log('bag: the filters');
check('five filters, all first', CATEGORIES.length === 5 && CATEGORIES[0].id === 'all',
  CATEGORIES.map((c) => c.id).join(','));
check('and every one has a mark to draw', CATEGORIES.every((c) => typeof c.mark === 'string' && c.mark.length));
check('a sword is a weapon', categoryOf(makeItem({ base: 'longsword', seed: 1 })) === 'weapons');
check('so is a shield, since it is held in a fight', categoryOf(makeItem({ base: 'kite', seed: 1 })) === 'weapons');
check('a breastplate is armour', categoryOf(makeItem({ base: 'plate_outfit', seed: 1 })) === 'armour');
check('and so is a ring', categoryOf(makeItem({ base: 'ring', seed: 1 })) === 'armour');
check('a potion is a consumable', categoryOf(makeItem({ base: 'potion', seed: 1 })) === 'consumables');
check('an ingot is a material', categoryOf(makeItem({ base: 'iron_ingot', seed: 1 })) === 'materials');
check('a pickaxe fits none of the four and is not lost', categoryOf(makeItem({ base: 'pickaxe', seed: 1 })) === 'other');
check('all shows everything, including the odd one out',
  ['longsword', 'potion', 'iron_ingot', 'pickaxe'].every((b) => inCategory(makeItem({ base: b, seed: 1 }), 'all')));
check('and a filter shows only its own',
  inCategory(makeItem({ base: 'potion', seed: 1 }), 'consumables')
  && !inCategory(makeItem({ base: 'iron_ingot', seed: 1 }), 'consumables'));

// ---- what a double click decides -------------------------------------------
console.log('bag: what a double click decides');
check('a sword is put on', actionFor(makeItem({ base: 'longsword', seed: 1 })).kind === 'equip');
check('to the main hand', actionFor(makeItem({ base: 'longsword', seed: 1 })).slot === 'mainHand');
check('a potion is drunk', actionFor(makeItem({ base: 'potion', seed: 1 })).kind === 'use');
check('bread is eaten', actionFor(makeItem({ base: 'bread', seed: 1 })).kind === 'use');
check('and so is a cooked meal', actionFor(makeItem({ base: 'honey_bread', seed: 1 })).kind === 'use');
check('and venison off a deer', actionFor(makeItem({ base: 'venison', seed: 1 })).kind === 'use');
{
  const ingot = actionFor(makeItem({ base: 'iron_ingot', seed: 1 }));
  check('an ingot is neither', ingot.kind === 'none');
  check('and it says why, in words', /material/.test(ingot.reason), ingot.reason);
  const pick = actionFor(makeItem({ base: 'pickaxe', seed: 1 }));
  check('a tool is neither, and says so differently', pick.kind === 'none' && /hands/.test(pick.reason), pick.reason);
  check('nothing at all is refused rather than thrown at', actionFor(null).kind === 'none');
}
check('what can be eaten is read off items.js, not typed here',
  USE_KINDS.join(',') === 'food,meal' && USE_IDS.join(',') === 'potion,bandage');
check('and there are a good many things to eat or drink', USABLE > 20, `${USABLE} bases`);
check('the audit counts them rather than asserting them', auditUsable() === USABLE);
check('an ingot is not one of them', usable({ id: 'iron_ingot', kind: 'material' }) === false);

// ---- what is left of the old page ------------------------------------------
console.log('bag: the page that is not a page');
check('the pack still answers to its id and its key', panel.id === 'bag' && panel.key === 'b');
check('and it is still called Inventory', panel.title === 'Inventory');
check('but it has no build of its own, because nothing would ever call it',
  typeof panel.build !== 'function', typeof panel.build);
check('the grid is built by buildBag, which is what the character page calls',
  typeof buildBag === 'function');

// ---- the real grid, the real inventory, real dblclick events ----------------
// buildBag IS the path the game runs: win_character calls exactly this, with
// the same options. Nothing here is a harness standing in for the real thing.
console.log('bag: two clicks on a real cell');

function rig(opts = {}) {
  const character = normalise({
    name: 'Ashe', gold: 10,
    stats: { str: 60, dex: 50, int: 30, con: 55, wis: 40 },
    skills: {},
    pack: { slots: PACK_SLOTS, items: [] }, equipment: {},
  });
  character.pack.items[0] = makeItem({ base: 'longsword', seed: 11 });
  character.pack.items[1] = makeItem({ base: 'potion', seed: 12, count: 3 });
  character.pack.items[2] = makeItem({ base: 'iron_ingot', seed: 13, count: 5 });

  const said = [];
  const hud = { log: (t, kind) => { said.push({ text: String(t), kind }); return t; } };
  const inventory = createInventory({ character, hud });
  const used = [];
  const ctx = {
    character, inventory, hud,
    useItem: opts.noUseHook ? undefined : (item, where) => used.push({ item, where }),
  };
  const el = document.createElement('div');
  const hovered = [];
  const compared = [];
  const changes = [];
  const api = buildBag(el, ctx, {
    compareFor: (item) => { compared.push(item); return opts.card || null; },
    onHover: (item, i) => hovered.push({ item, i }),
    onLeave: () => hovered.push(null),
    onChange: () => changes.push(1),
  });
  // the root is filters, grid, purse, foot
  const grid = api.grid;
  return { character, inventory, said, used, grid, el, api, hovered, compared, changes };
}

{
  const r = rig();
  check('the grid has a cell for every slot in the pack',
    r.grid.children.length === PACK_SLOTS, `${r.grid.children.length} of ${PACK_SLOTS}`);
  check('the first cell wears the sword s rarity', r.grid.children[0].dataset.rarity === 'common',
    String(r.grid.children[0].dataset.rarity));
  check('an empty cell is marked empty', r.grid.children[9].classList.contains('bw-empty'));

  r.grid.children[0].fire('dblclick');
  check('two clicks on a sword put it in your hand',
    r.character.equipment.mainHand && r.character.equipment.mainHand.base === 'longsword',
    String(r.character.equipment.mainHand?.base));
  check('and the pack slot it came from is empty', r.character.pack.items[0] === null);
  check('and it was said out loud', r.said.some((l) => /you put on/.test(l.text)), r.said.map((l) => l.text).join(' | '));
}
{
  const r = rig();
  r.grid.children[1].fire('dblclick');
  check('two clicks on a potion hand it to the game to use',
    r.used.length === 1 && r.used[0].item.base === 'potion', JSON.stringify(r.used.map((u) => u.item.base)));
  check('and say which slot it came out of', r.used[0].where.pack === 1, JSON.stringify(r.used[0].where));
  check('the potion is still in the pack, because using it is not this file s job',
    r.character.pack.items[1] && r.character.pack.items[1].base === 'potion');
}
{
  const r = rig({ noUseHook: true });
  r.grid.children[1].fire('dblclick');
  check('with nobody to drink it, the pack says so rather than looking broken',
    r.said.some((l) => /nothing has been written yet that uses/.test(l.text)),
    r.said.map((l) => l.text).join(' | '));
  check('and says it as a refusal', r.said.some((l) => l.kind === 'bad'));
}
{
  const r = rig();
  const before = JSON.stringify(r.character.equipment);
  r.grid.children[2].fire('dblclick');
  check('two clicks on an ingot change nothing', JSON.stringify(r.character.equipment) === before);
  check('and it is still in the pack', r.character.pack.items[2].base === 'iron_ingot');
  check('but it is not silent about it', r.said.some((l) => /material/.test(l.text)),
    r.said.map((l) => l.text).join(' | '));
  check('and nothing was handed to useItem', r.used.length === 0);
}
{
  const r = rig();
  r.grid.children[7].fire('dblclick');
  check('two clicks on an empty slot do nothing and say nothing',
    r.said.length === 0 && r.used.length === 0, r.said.map((l) => l.text).join(' | '));
}

// ---- the hooks the character page hangs off the grid ------------------------
console.log('bag: what the grid tells the sheet beside it');
{
  const r = rig();
  r.grid.children[0].fire('pointerenter', { clientX: 10, clientY: 10 });
  check('taking up an item tells whoever is listening which one',
    r.hovered.length === 1 && r.hovered[0].item.base === 'longsword' && r.hovered[0].i === 0,
    JSON.stringify(r.hovered.map((h) => (h ? h.item.base : null))));
  check('and the tooltip asked for the equipped card for that same item',
    r.compared.length >= 1 && r.compared[0].base === 'longsword',
    r.compared.map((c) => c.base).join(','));
  r.grid.children[0].fire('pointerleave');
  check('putting it down says so', r.hovered.length === 2 && r.hovered[1] === null);
}
{
  const r = rig();
  r.grid.children[3].fire('pointerenter', { clientX: 10, clientY: 10 });
  check('an empty slot hovers nothing and asks for no card',
    r.hovered.length === 1 && r.hovered[0].item === null && r.compared.length === 0,
    JSON.stringify(r.hovered));
}
{
  const r = rig();
  r.grid.children[0].fire('dblclick');
  check('equipping tells the sheet to redraw', r.changes.length === 1, String(r.changes.length));
  check('and lets go of the hover first, so the preview does not outlive the item',
    r.hovered[r.hovered.length - 1] === null, JSON.stringify(r.hovered));
}

// ---- a drag that inventory.js thinks is unremarkable is still spoken for ----
console.log('bag: dragging inside the pack');
{
  const r = rig();
  r.api.dropInto({ pack: 0 }, 6);
  check('the sword moves', r.character.pack.items[6] && r.character.pack.items[6].base === 'longsword'
    && r.character.pack.items[0] === null, String(r.character.pack.items[6]?.base));
  check('and the move is said out loud, though inventory.move said nothing',
    r.said.some((l) => /goes into slot 7 of the pack/.test(l.text)), r.said.map((l) => l.text).join(' | '));
  check('and the sheet beside it is told', r.changes.length === 1);
}
{
  const r = rig();
  const before = r.said.length;
  r.api.dropInto({ pack: 0 }, 0);
  check('a drop back onto the same slot says nothing and does nothing',
    r.said.length === before && r.character.pack.items[0].base === 'longsword');
}
{
  const r = rig();
  r.api.dropInto({ pack: 0 }, 39);
  check('the carry limit under the grid is its own element, so the sheet can light it',
    r.api.carryNum && r.api.carryNum.textContent === '160', String(r.api.carryNum?.textContent));
  check('with the weight in front of it and the word after',
    /of $/.test(r.api.carryNum.parent.children[0].textContent)
    && r.api.carryNum.parent.children[2].textContent === ' stones',
    r.api.carryNum.parent.textContent);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
