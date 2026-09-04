// The market. Three tools to buy, once each, three materials to sell, and
// whatever a hunt left in the bag.
//
// It only opens where a market exists, which means standing in a town or a
// hamlet. Refusing to open is itself a state the player has to be told about,
// so a refusal names the nearest market and points at it rather than doing
// nothing and looking broken.
//
// The panel is plain CSS in a single injected <style>. Nothing here needs a
// document to work: every price, every rule and every refusal is decided in
// code that runs headless, and the DOM is built only if there is one.

import { GOODS } from '../farm/catalog.js';
import { CARRIED } from './state.js';

export const MARKET_RANGE = 40;      // metres from the centre of a town or hamlet
export const SELL_LOTS = [10, 'all'];

// Bought once each. The axe first, because without it nothing else earns.
export const FOR_SALE = [
  { id: 'axe', name: 'Axe', price: 60, line: 'for trees' },
  { id: 'pickaxe', name: 'Pickaxe', price: 80, line: 'for stone and ore' },
  { id: 'bow', name: 'Bow', price: 120, line: 'for game' },
];

export const SELLABLE = ['wood', 'stone', 'ore'];
/**
 * What a hunt leaves, sold the same way and at the same catalog price. This is
 * `CARRIED` from state.js rather than a second list: a good the pack cannot
 * hold has no business having a row here.
 */
export const SELLABLE_GOODS = CARRIED;

/** The catalog's price, not a second copy of it. */
export const sellPrice = (m) => (GOODS[m]?.sell ?? 0);

/** North is -z, east is +x, the same way the world is laid out. */
export function compassWord(dx, dz) {
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(deg / 45) % 8];
}

const isSettlement = (s) => !!s && (s.kind === 'town' || s.kind === 'hamlet');

const CSS = `
.bw-shop{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:60;
  background:rgba(8,12,10,.55);font:14px/1.5 ui-sans-serif,system-ui,sans-serif;color:#eae3d6}
.bw-shop[hidden]{display:none}
.bw-shop-panel{width:min(560px,92vw);max-height:82vh;overflow:auto;background:#1b211c;border:1px solid #3d4a3c;
  border-radius:10px;padding:18px 20px;box-shadow:0 18px 60px rgba(0,0,0,.5)}
.bw-shop-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:2px}
.bw-shop-head h2{margin:0;font-size:18px;font-weight:600;letter-spacing:.01em}
.bw-shop-coins{color:#e3c26a;font-variant-numeric:tabular-nums}
.bw-shop-sub{margin:0 0 14px;color:#95a08f;font-size:12.5px}
.bw-shop h3{margin:16px 0 8px;font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#8fa387}
.bw-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid #2a332a}
.bw-row .bw-name{flex:1 1 auto}
.bw-row .bw-name small{display:block;color:#8b9686;font-size:11.5px}
.bw-row .bw-have{color:#b9c3b1;font-variant-numeric:tabular-nums;min-width:52px;text-align:right}
.bw-shop button{font:inherit;font-size:13px;padding:5px 11px;border-radius:6px;border:1px solid #4f6349;
  background:#2c3a2b;color:#e8f0e2;cursor:pointer;white-space:nowrap}
.bw-shop button:hover:not(:disabled){background:#38492f}
.bw-shop button:disabled{opacity:.5;cursor:default;border-color:#37402f;color:#9aa394}
.bw-shop-close{margin-top:16px;width:100%}
`;

/**
 * @param {{ state, hud, audio?, nearestSettlement?: () => object|null, root?: HTMLElement }} deps
 *   `nearestSettlement` is asked only when the shop will not open, so it can
 *   say which market it means. Without it, a refusal says so plainly instead of
 *   naming a town it has not been told about.
 */
export function createShop({ state, hud, audio, nearestSettlement, root } = {}) {
  const say = (t, kind) => hud?.toast?.(t, kind);
  const findNearest = () => { try { return nearestSettlement?.() || null; } catch { return null; } };
  const distTo = (s) => Math.hypot(s.x - state.pos.x, s.z - state.pos.z);

  let open_ = false;
  let here = null;      // the settlement whose market is on screen
  let el = null, coinsEl = null, buyEl = null, sellEl = null, titleEl = null;

  /** Small helper so nothing in this file has to build HTML out of a string. */
  const h = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function mount() {
    if (el || typeof document === 'undefined') return el;
    if (!document.getElementById('bw-shop-css')) {
      const st = document.createElement('style');
      st.id = 'bw-shop-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    el = h('div', 'bw-shop');
    el.hidden = true;
    const panel = h('div', 'bw-shop-panel');
    const head = h('div', 'bw-shop-head');
    titleEl = h('h2');
    coinsEl = h('span', 'bw-shop-coins');
    head.appendChild(titleEl); head.appendChild(coinsEl);
    panel.appendChild(head);
    panel.appendChild(h('p', 'bw-shop-sub', 'Tools are bought once. Materials go at the going rate.'));
    panel.appendChild(h('h3', null, 'For sale'));
    buyEl = h('div', 'bw-buy');
    panel.appendChild(buyEl);
    panel.appendChild(h('h3', null, 'They will buy'));
    sellEl = h('div', 'bw-sell');
    panel.appendChild(sellEl);
    const closeBtn = h('button', 'bw-shop-close', 'Close');
    closeBtn.addEventListener('click', () => close());
    panel.appendChild(closeBtn);
    el.appendChild(panel);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });   // the dark ground closes it
    (root || document.body).appendChild(el);
    return el;
  }

  /**
   * The panel is only a view of the state: it is rebuilt from `state` every
   * time anything changes, so a button can never claim you can afford
   * something you cannot.
   */
  function render() {
    if (!el || !open_) return;
    titleEl.textContent = here ? `${here.name} market` : 'market';
    coinsEl.textContent = `${state.coins} coins`;

    buyEl.textContent = '';
    for (const t of FOR_SALE) {
      const row = h('div', 'bw-row');
      const name = h('span', 'bw-name', t.name);
      name.appendChild(h('small', null, t.line));
      row.appendChild(name);
      row.appendChild(h('span', 'bw-have', `${t.price}`));
      const owned = state.tools.has(t.id);
      const short = state.dev ? 0 : t.price - state.coins;
      // the reason lives in the button, so a dead button is never a mystery
      const b = h('button', null, owned ? 'you have one' : short > 0 ? `${short} coins short` : state.dev ? 'take it (dev)' : `buy for ${t.price}`);
      b.disabled = owned || short > 0;
      b.addEventListener('click', () => buy(t.id));
      row.appendChild(b);
      buyEl.appendChild(row);
    }

    sellEl.textContent = '';
    // one row builder for both halves of the bag, so a haunch of venison is
    // sold by exactly the rules a log is
    const sellRow = (id, have, onSell) => {
      const row = h('div', 'bw-row');
      const name = h('span', 'bw-name', GOODS[id]?.name || id);
      name.appendChild(h('small', null, `${sellPrice(id)} coins each`));
      row.appendChild(name);
      row.appendChild(h('span', 'bw-have', `${have}`));
      for (const lot of SELL_LOTS) {
        const n = lot === 'all' ? have : Math.min(lot, have);
        const b = h('button', null, lot === 'all' ? `sell all${have ? ` (${have * sellPrice(id)})` : ''}` : `sell ${lot}`);
        b.disabled = n <= 0;
        b.addEventListener('click', () => onSell(lot));
        row.appendChild(b);
      }
      sellEl.appendChild(row);
    };
    for (const m of SELLABLE) sellRow(m, state.materials[m], (lot) => sell(m, lot));
    for (const g of SELLABLE_GOODS) sellRow(g, state.goods?.[g] ?? 0, (lot) => sellGood(g, lot));
  }

  function buy(id) {
    const t = FOR_SALE.find((x) => x.id === id);
    if (!t) return false;
    if (state.tools.has(id)) { say(`you already carry ${t.name === 'Axe' ? 'an axe' : 'a ' + t.name.toLowerCase()}`); audio?.play?.('denied'); return false; }
    if (!state.dev && state.coins < t.price) { say(`the ${t.name.toLowerCase()} is ${t.price} coins and you have ${state.coins}`); audio?.play?.('denied'); return false; }
    if (!state.dev) state.spend(t.price);
    const first = state.tool === 'hand';
    state.giveTool(id);
    say(state.dev ? `the ${t.name.toLowerCase()} is yours, free, because dev mode is on`
      : `you buy the ${t.name.toLowerCase()} for ${t.price} coins${first ? ', and it goes straight into your hand' : ''}`);
    // paying and being paid are deliberately different sounds: a market where
    // they are the same tells the player nothing
    audio?.play?.('buy');
    state.save();
    render();
    return true;
  }

  function sell(material, lot = 'all') {
    if (!SELLABLE.includes(material)) return false;
    const have = state.materials[material];
    const want = lot === 'all' ? have : Math.max(0, Math.floor(lot));
    const n = Math.min(want, have);
    const noun = (GOODS[material]?.name || material).toLowerCase();
    if (n <= 0) { say(`you have no ${noun} to sell`); audio?.play?.('denied'); return false; }
    const { taken } = state.take(material, n);
    const paid = state.earn(taken * sellPrice(material));
    say(`you sell ${taken} ${noun} for ${paid} coins${taken < want ? ', which was all you had' : ''}`);
    audio?.play?.('sell');
    state.save();
    render();
    return true;
  }

  /**
   * The hunting bag, sold the same way. Kept as its own function rather than
   * folded into `sell` because the two read different pockets: `sell` refuses
   * anything that is not one of the three materials, and that refusal is worth
   * keeping exactly as strict as it is.
   */
  function sellGood(id, lot = 'all') {
    if (!SELLABLE_GOODS.includes(id)) return false;
    const have = state.goods?.[id] ?? 0;
    const want = lot === 'all' ? have : Math.max(0, Math.floor(lot));
    const n = Math.min(want, have);
    const noun = (GOODS[id]?.name || id).toLowerCase();
    if (n <= 0) { say(`you have no ${noun} to sell`); audio?.play?.('denied'); return false; }
    const { taken } = state.takeGood(id, n);
    const paid = state.earn(taken * sellPrice(id));
    say(`you sell ${taken} ${noun} for ${paid} coins${taken < want ? ', which was all you had' : ''}`);
    audio?.play?.('sell');
    state.save();
    render();
    return true;
  }

  const onKey = (e) => { if (e.key === 'Escape') close(); };

  /**
   * @param nearSite the town or hamlet you are standing in, or null when you
   *   are not standing in one. Called with nothing, the shop asks its finder.
   * @returns {boolean} whether the market opened
   */
  function open(nearSite) {
    const candidate = nearSite === undefined ? findNearest() : nearSite;
    // dev mode carries the market in its pocket
    if (state.dev) {
      here = isSettlement(candidate) ? candidate : { name: 'the dev market' };
      open_ = true; mount();
      if (el) { el.hidden = false; render(); }
      say(`${here.name}, open anywhere and charging nothing while dev mode is on`);
      if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);
      return true;
    }
    if (isSettlement(candidate) && distTo(candidate) <= MARKET_RANGE) {
      here = candidate;
      open_ = true;
      mount();
      if (el) { el.hidden = false; render(); }
      say(`${here.name} market`);
      if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);
      return true;
    }
    // it did not open, so say where one is rather than swallowing the press
    const target = isSettlement(candidate) ? candidate : findNearest();
    if (isSettlement(target)) {
      const d = distTo(target);
      say(`the nearest market is ${target.name}, ${Math.round(d)} m ${compassWord(target.x - state.pos.x, target.z - state.pos.z)}`);
    } else {
      say('no market out here, follow a road until you find one');
    }
    return false;
  }

  function close() {
    if (!open_) return false;
    open_ = false;
    here = null;
    if (el) el.hidden = true;
    if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
    return true;
  }

  function toggle(nearSite) { return open_ ? (close(), false) : open(nearSite); }

  // the panel is a view of the state, so anything that changes the state redraws it
  state?.onChange?.(() => render());

  return {
    open, close, toggle, buy, sell, sellGood, render,
    get isOpen() { return open_; },
    get where() { return here; },
    get el() { return el; },
  };
}
