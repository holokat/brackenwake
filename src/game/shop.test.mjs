// The market. Run: node src/game/shop.test.mjs
//
// Headless on purpose: every price, refusal and payout is decided in code that
// runs without a document, and this file drives that same code. The panel is
// only a view of it.
import { createShop, compassWord, sellPrice, FOR_SALE, MARKET_RANGE } from './shop.js';
import { createState } from './state.js';
import { GOODS } from '../farm/catalog.js';
const { toolFor } = await import('./tools.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

function memStore() { const m = new Map(); return { m, writes: 0, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem(k, v) { this.writes++; m.set(k, String(v)); }, removeItem: (k) => m.delete(k) }; }
const town = (name, x, z) => ({ id: `${x},${z}`, kind: 'town', name, x, z });
const hamlet = (name, x, z) => ({ id: `${x},${z}`, kind: 'hamlet', name, x, z });

function rig({ nearest = null, pos = [0, 0] } = {}) {
  const toasts = [];
  const store = memStore();
  const state = createState({ storage: store });
  state.setPos(pos[0], pos[1]);
  const shop = createShop({ state, hud: { toast: (t) => toasts.push(String(t)) }, nearestSettlement: () => nearest });
  return { state, shop, toasts, store, last: () => toasts[toasts.length - 1] || '' };
}

// ---- the prices are the catalog's, not a second copy ----------------------
check('wood sells at the catalog price', sellPrice('wood') === GOODS.wood.sell, String(sellPrice('wood')));
check('stone sells at the catalog price', sellPrice('stone') === GOODS.stone.sell, String(sellPrice('stone')));
check('ore sells at the catalog price', sellPrice('ore') === GOODS.ore.sell, String(sellPrice('ore')));
check('the tools cost 60, 80 and 120', FOR_SALE.map((t) => t.price).join(',') === '60,80,120');

// ---- the compass, all eight ways ------------------------------------------
check('north is -z', compassWord(0, -10) === 'north');
check('south is +z', compassWord(0, 10) === 'south');
check('east is +x', compassWord(10, 0) === 'east');
check('west is -x', compassWord(-10, 0) === 'west');
check('northeast', compassWord(10, -10) === 'northeast');
check('southeast', compassWord(10, 10) === 'southeast');
check('southwest', compassWord(-10, 10) === 'southwest');
check('northwest', compassWord(-10, -10) === 'northwest');

// ---- where it will and will not open --------------------------------------
{
  const { shop, toasts, last } = rig({ nearest: town('Ashford', 300, -300) });
  check('it does not open where there is no market', shop.open(null) === false);
  check('and it names the nearest one', /Ashford/.test(last()), last());
  check('and says how far', /424 m/.test(last()), last());
  check('and which way', /northeast/.test(last()), last());
  check('it is closed', shop.isOpen === false);
  check('the refusal said something', toasts.length === 1);
}
{
  const { shop, last } = rig({ nearest: null });
  check('with no market anywhere it says so plainly', shop.open(null) === false);
  check('and does not name a town it cannot see', !/nearest market is/.test(last()), last());
}
{
  const { shop, last } = rig({ nearest: town('Ashford', 300, 0) });
  check(`a market ${MARKET_RANGE + 1} m off does not open`, shop.open(town('Ashford', MARKET_RANGE + 1, 0)) === false);
  check('and it points at that same market', /Ashford/.test(last()) && /41 m/.test(last()), last());
  check(`a market at ${MARKET_RANGE} m opens`, shop.open(town('Ashford', MARKET_RANGE, 0)) === true && shop.isOpen);
  check('and it says which market', /Ashford/.test(last()), last());
  check('and remembers where you are trading', shop.where.name === 'Ashford');
  check('a hamlet is a market too', (shop.close(), shop.open(hamlet('Crookmere', 5, 5))) === true);
  check('a ruin is not', (shop.close(), shop.open({ kind: 'ruin', name: 'the Grey Tower', x: 1, z: 1 })) === false);
  check('closing closes', shop.close() === false && shop.isOpen === false);
}
{
  const { shop, last } = rig({ nearest: town('Ashford', 20, 0) });
  check('open() with no argument asks its finder and opens when close enough', shop.open() === true, last());
  check('toggle closes what is open', shop.toggle() === false && !shop.isOpen);
  check('and opens what is closed', shop.toggle(town('Ashford', 20, 0)) === true && shop.isOpen);
}

// ---- buying ---------------------------------------------------------------
{
  const { state, shop, store, last } = rig();
  shop.open(town('Ashford', 0, 0));
  const writes0 = store.writes;
  check('you start with 120 coins', state.coins === 120);
  check('the axe is bought', shop.buy('axe') === true);
  check('60 coins are gone', state.coins === 60, String(state.coins));
  check('the axe is carried', state.tools.has('axe'));
  // T3: there is no hand to put it in and no cell to click. It goes on the doll
  // and the next tree uses it, and the line has to say that or a player goes
  // looking for the tool row that is not there any more.
  check('it goes on the paper doll rather than into a tool row',
    state.character.equipment.mainHand?.base === 'axe' && state.tool === 'hand',
    JSON.stringify(state.character.equipment.mainHand?.base));
  check('and the buy said so', /axe/.test(last()) && /60/.test(last()), last());
  check('and said it works from where it went, with nothing to pick up first',
    /works from there/.test(last()) && /to your hand/.test(last()), last());
  check('and the axe really does chop, straight out of the purchase',
    toolFor('chop', state.character).ok === true, toolFor('chop', state.character).reason);
  check('and the game saved', store.writes > writes0);

  check('the same axe cannot be bought twice', shop.buy('axe') === false);
  check('and the coins are untouched', state.coins === 60);
  check('and it says you already have one', /already/.test(last()), last());

  check('the pickaxe is 80 and you have 60, so no', shop.buy('pickaxe') === false);
  check('and it says how short you are', /80/.test(last()) && /60/.test(last()), last());
  check('and no coins moved and no tool arrived', state.coins === 60 && !state.tools.has('pickaxe'));
  check('a tool that is not for sale is refused', shop.buy('sword') === false);

  state.earn(60);
  check('with 120 again the pickaxe is bought', shop.buy('pickaxe') === true && state.coins === 40);
  check('and it goes in the pack, and mines from there', state.tool === 'hand'
    && toolFor('mine', state.character).where === 'pack', toolFor('mine', state.character).where);
  check('while the axe still chops, so buying one did not put the other down',
    toolFor('chop', state.character).ok === true);
  state.earn(200);
  check('the bow is 120', shop.buy('bow') === true && state.coins === 120, String(state.coins));
  check('all three are carried', state.tools.size === 3);
}

// ---- selling --------------------------------------------------------------
{
  const { state, shop, store, last } = rig();
  shop.open(town('Ashford', 0, 0));
  state.add('wood', 25); state.add('stone', 4); state.add('ore', 3);
  const coins0 = state.coins;
  const writes0 = store.writes;
  check('selling 10 wood pays 10 x 3', shop.sell('wood', 10) === true && state.coins === coins0 + 10 * GOODS.wood.sell, `${state.coins - coins0} coins`);
  check('and takes exactly 10 out of the pack', state.materials.wood === 15, String(state.materials.wood));
  check('and says what changed hands', /10 wood/.test(last()) && /30 coins/.test(last()), last());
  check('and saved', store.writes > writes0);

  const c1 = state.coins;
  check('selling all wood pays for all 15', shop.sell('wood', 'all') === true && state.coins === c1 + 15 * GOODS.wood.sell);
  check('and empties that material', state.materials.wood === 0);
  check('selling wood you do not have is refused', shop.sell('wood', 10) === false);
  check('and says you have none', /no wood/.test(last()), last());
  check('and pays nothing', state.coins === c1 + 15 * GOODS.wood.sell);

  const c2 = state.coins;
  check('selling 10 stone when you hold 4 sells the 4', shop.sell('stone', 10) === true && state.materials.stone === 0);
  check('and pays for 4', state.coins === c2 + 4 * GOODS.stone.sell, `${state.coins - c2} coins`);
  check('and says it was all you had', /all you had/.test(last()), last());

  const c3 = state.coins;
  check('ore pays 9 each', shop.sell('ore', 'all') === true && state.coins === c3 + 3 * GOODS.ore.sell, `${state.coins - c3} coins`);
  check('selling something the market does not take is refused', shop.sell('bread', 5) === false);
  check('selling a negative amount is refused', shop.sell('wood', -5) === false);
}

// ---- a market you can reach on a road, from a hamlet ----------------------
{
  const { state, shop, last } = rig({ nearest: hamlet('Crookmere', 0, -600), pos: [0, 0] });
  check('a hamlet 600 m north is named and pointed at', shop.open(null) === false && /Crookmere/.test(last()) && /600 m north/.test(last()), last());
  state.setPos(0, -595);
  check('walking to within 5 m opens it', shop.open(hamlet('Crookmere', 0, -600)) === true);
}

// ---- the panel itself ------------------------------------------------------
// No browser here, so the DOM is a stub with just enough of one: what this
// proves is that the panel is built, that a button's label carries the reason
// it is dead, and that clicking a live one moves real coins.
{
  const ids = {};
  const mk = (tag) => {
    const e = {
      tag, children: [], listeners: {}, className: '', style: {}, hidden: false, disabled: false, _text: '',
      get id() { return e._id || ''; },
      set id(v) { e._id = v; ids[v] = e; },
      get textContent() { return e._text + e.children.map((c) => c.textContent).join(''); },
      set textContent(v) { e.children.length = 0; e._text = String(v); },
      appendChild(c) { e.children.push(c); return c; },
      addEventListener(k, fn) { (e.listeners[k] ||= []).push(fn); },
      removeEventListener() {},
      click() { for (const fn of e.listeners.click || []) fn({ target: e }); },
    };
    return e;
  };
  const body = mk('body');
  globalThis.document = { createElement: mk, getElementById: (id) => ids[id] || null, head: mk('head'), body };
  globalThis.window ||= { addEventListener() {}, removeEventListener() {} };

  const walk = (n, out = []) => { out.push(n); for (const c of n.children) walk(c, out); return out; };
  const buttons = (shop) => walk(shop.el).filter((n) => n.tag === 'button');
  const labelled = (shop, re) => buttons(shop).find((b) => re.test(b.textContent));

  const { state, shop, store } = rig();
  check('the panel is not built before it is opened', shop.el === null);
  shop.open(town('Ashford', 0, 0));
  check('opening builds the panel', !!shop.el && shop.el.className === 'bw-shop');
  check('and shows it', shop.el.hidden === false);
  check('and injects one stylesheet', !!document.getElementById('bw-shop-css') && document.getElementById('bw-shop-css').textContent.includes('.bw-shop'));
  check('the panel is in the document body', body.children.includes(shop.el));
  check('it names the town it belongs to', walk(shop.el).some((n) => n.tag === 'h2' && n.textContent === 'Ashford market'));
  check('it shows your coins', walk(shop.el).some((n) => n.className === 'bw-shop-coins' && n.textContent === '120 coins'));

  check('there are three tools and a close button', buttons(shop).filter((b) => /buy|short|have one/.test(b.textContent)).length === 3);
  check('at 120 coins all three are affordable', buttons(shop).filter((b) => /^buy for/.test(b.textContent) && !b.disabled).length === 3);
  const axeBtn = labelled(shop, /buy for 60/);
  check('the axe button offers its price', !!axeBtn && axeBtn.disabled === false);
  const writes0 = store.writes;
  axeBtn.click();
  check('clicking it spends the coins', state.coins === 60);
  check('and hands over the axe', state.tools.has('axe'));
  check('and saves', store.writes > writes0);
  check('and the panel redraws to say you have one', !!labelled(shop, /you have one/) && labelled(shop, /you have one/).disabled === true);
  check('and the two you cannot afford say how short you are', !!labelled(shop, /20 coins short/) && !!labelled(shop, /60 coins short/));
  check('and those buttons are dead', labelled(shop, /20 coins short/).disabled === true);
  check('and the coin line redrew', walk(shop.el).some((n) => n.className === 'bw-shop-coins' && n.textContent === '60 coins'));

  check('with an empty pack every sell button is dead', buttons(shop).filter((b) => /^sell/.test(b.textContent)).every((b) => b.disabled));
  state.add('wood', 12);
  check('adding wood wakes the wood buttons', labelled(shop, /^sell 10$/).disabled === false);
  check('and sell all prices the lot', !!labelled(shop, /sell all \(36\)/), buttons(shop).map((b) => b.textContent).join(' | '));
  check('stone stays dead while you carry none', buttons(shop).filter((b) => /^sell/.test(b.textContent) && b.disabled).length >= 3);
  const c0 = state.coins;
  labelled(shop, /sell all \(36\)/).click();
  check('selling all the wood pays 36', state.coins === c0 + 36, `${state.coins - c0}`);
  check('and empties the pack', state.materials.wood === 0);
  check('and the button goes dead again', labelled(shop, /^sell all$/).disabled === true);

  labelled(shop, /^Close$/).click();
  check('the close button closes the panel', shop.isOpen === false && shop.el.hidden === true);
  shop.open(town('Ashford', 0, 0));
  check('reopening reuses the same panel and the same stylesheet', shop.el.hidden === false && Object.keys(ids).filter((k) => k === 'bw-shop-css').length === 1);
  shop.el.click();
  check('clicking the dark ground behind it closes it', shop.isOpen === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
