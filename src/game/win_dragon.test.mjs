// The Dragon window, built and driven. Run: node src/game/win_dragon.test.mjs
//
// The panel is built into a fake document of the same shape creation.test.mjs
// uses, and then USED: the name is typed and committed, the Feed button is
// pressed, a pack slot is dropped onto the feed slot, the Bond bar is read back
// as a width, and the nine gift rows are counted and read. Nothing here checks
// that a function exists; every check reads a node the panel really wrote.
//
// The dragon behind it is the real `createDragon` over a real pack, so a feed
// through this window really takes the food out of the pack.

// ---------------------------------------------------------------- a document

function makeDom() {
  const make = (tag) => {
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style: {}, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '', hidden: false, type: '', value: '', placeholder: '',
      disabled: false, draggable: false, maxLength: 0, spellcheck: true, focused: false,
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      listeners: {},
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; },
      },
      setAttribute() {}, removeAttribute() {},
      appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = node; node.children.push(c); return c; },
      append(...cs) { for (const c of cs) node.appendChild(c); },
      remove() { if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; } },
      addEventListener(n2, fn) { (node.listeners[n2] ||= []).push(fn); },
      removeEventListener() {},
      focus() { node.focused = true; },
      select() {},
      fire(n2, ev) { for (const fn of node.listeners[n2] || []) fn(ev || { preventDefault() {}, stopPropagation() {} }); },
    };
    return node;
  };
  const byId = new Map();
  return {
    createElement: make,
    createTextNode: (t) => { const n = make('#text'); n.textContent = t; return n; },
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { if (c.id) byId.set(c.id, c); return c; } },
    body: make('body'),
    activeElement: null,
  };
}
globalThis.document = makeDom();
globalThis.window = { innerWidth: 1600, innerHeight: 900, addEventListener() {}, removeEventListener() {} };
globalThis.performance ||= { now: () => 1000 };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

const { panel, bondLine, hungerLine, foodLine } = await import('./win_dragon.js');
const { createDragon, WAKE_BOND, HUNGRY_AT, GIFTS, FEED_HUNGER } = await import('./dragon.js');
const { makeItem } = await import('../mmo/items.js');
const { RESERVED_KEYS, CODEX_IDS } = await import('./windows.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

/** Every node under `n`, depth first. */
const walk = (n, out = []) => { out.push(n); for (const c of n.children) walk(c, out); return out; };
const withClass = (n, cls) => walk(n).filter((x) => x.classList && x.classList.contains(cls));
const text = (n) => (n ? n.textContent : '');

// ===========================================================================
console.log('\nthe panel contract');
// ===========================================================================
{
  check('it has an id, a title and a key', panel.id === 'dragon' && panel.title === 'Dragon' && panel.key === 'n');
  check('N is not a key the world drives', !RESERVED_KEYS.includes('n'));
  check('and the dragon is not a codex tab, so it does not fight for the codex frame',
    !CODEX_IDS.includes('dragon'));
  check('it builds, opens, ticks and renders', ['build', 'open', 'tick', 'render'].every((f) => typeof panel[f] === 'function'));
}

// ===========================================================================
console.log('\nthe lines, without a document at all');
// ===========================================================================
{
  check('the Bond line says the number and what it is for', /0 of 100/.test(bondLine(0, false)) && /Wyrmsoul/.test(bondLine(0, false)));
  check('a full Bond says Wyrmsoul will answer', /will answer/.test(bondLine(100, false)));
  check('and a fallen one says what it is waiting for', new RegExp(`at ${WAKE_BOND} it gets up`).test(bondLine(3, true)));
  check('the Bond is rounded, not printed to fourteen places', /^44 of 100/.test(bondLine(44.3891, false)), bondLine(44.3891, false));

  check('hunger reads as a word', hungerLine(5) === 'full' && hungerLine(30) === 'content');
  check('and past the threshold it says what that costs',
    /half speed/.test(hungerLine(HUNGRY_AT + 1)), hungerLine(HUNGRY_AT + 1));
  check('but not below it', !/half speed/.test(hungerLine(HUNGRY_AT - 1)));

  check('the food line names the items by their real names',
    foodLine(['egg', 'rat_meat']) === 'egg and rat meat', foodLine(['egg', 'rat_meat']));
  check('three foods read as a list', /,/.test(foodLine(['fish', 'game_meat', 'crab_meat'])), foodLine(['fish', 'game_meat', 'crab_meat']));
  check('one food is just that food', foodLine(['egg']) === 'egg');
  check('and none at all is said rather than left blank', foodLine([]) === 'nothing at all');
}

// ===========================================================================
console.log('\nthe page, built into a document');
// ===========================================================================

function stage(recordExtra = null) {
  const logs = [];
  const character = {
    name: 'Tester',
    pack: { slots: 20, items: new Array(20).fill(null) },
    equipment: {}, stats: {}, skills: {}, gold: 0,
  };
  if (recordExtra) character.dragon = recordExtra;
  const inventory = {
    remove(where) {
      const i = Number.isFinite(where?.pack) ? where.pack : where?.index;
      const it = character.pack.items[i];
      if (!it) return { ok: false, item: null, removed: 0 };
      character.pack.items[i] = null;
      return { ok: true, item: it, removed: 1 };
    },
  };
  const dragon = createDragon({
    character,
    hud: { log: (t, k) => logs.push({ t, k }) },
    scene: null, buildModel: null,
    playerRig: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, parts: {} },
    playerActor: { health: 100, lastSwingAt: 0, pos: { x: 0, y: 0, z: 0 } },
    heightAt: () => 0,
    inventory,
    onNeedsName: () => logs.push({ t: '[window]', k: 'window' }),
  });
  const root = document.createElement('div');
  const ctx = { dragon, character, inventory, hud: { log: (t, k) => logs.push({ t, k }) } };
  panel.build(root, ctx);
  return { root, ctx, dragon, character, logs };
}

{
  const s = stage();
  check('the page is built', s.root.children.length > 0, String(s.root.children.length));
  check('and it carries the sheet class', s.root.classList.contains('bw-dragon'));
  const inputs = walk(s.root).filter((n) => n.tagName === 'INPUT');
  check('there is one name field', inputs.length === 1);
  check('capped at 14 letters', inputs[0].maxLength === 14, String(inputs[0].maxLength));
  check('empty, because the hatchling has no name', inputs[0].value === '');
  check('and the age line says it has none',
    /has no name yet/.test(text(withClass(s.root, 'bw-dage')[0])), text(withClass(s.root, 'bw-dage')[0]));

  check('there are nine gift rows and no more',
    withClass(s.root, 'bw-gift').length === 9, String(withClass(s.root, 'bw-gift').length));
  check('none of them is lit on a fresh hatchling',
    withClass(s.root, 'bw-gift').every((r) => !r.classList.contains('on')));
  const giftText = withClass(s.root, 'bw-gift').map(text).join(' | ');
  check('and every realm of 14-KALDERA is named in them',
    GIFTS.every((g) => giftText.includes(g.realm)), giftText.slice(0, 90));
  check('an unheld gift says so rather than naming what it would have given',
    !giftText.includes('true fire') && giftText.includes('not taken back'));

  check('the Bond bar starts empty', withClass(s.root, 'bw-bond-fill')[0].style.width === 'calc(0% - 2px)',
    withClass(s.root, 'bw-bond-fill')[0].style.width);
  check('and the number under it says what the bar is for',
    /Wyrmsoul answers at 100/.test(text(withClass(s.root, 'bw-bond-num')[0])));
  check('the food line names what a hatchling eats',
    /egg and rat meat/.test(text(walk(s.root).find((n) => /At this age it eats/.test(n.textContent && n.children.length === 0 ? n.textContent : '')) || { textContent: '' })
      || /egg and rat meat/.test(s.root.textContent)));
}

// -- naming through the window ----------------------------------------------
{
  const s = stage();
  const input = walk(s.root).find((n) => n.tagName === 'INPUT');
  const nameBtn = walk(s.root).filter((n) => n.tagName === 'BUTTON')[0];
  input.value = 'Ash2';
  nameBtn.fire('click');
  check('a name with a digit in it is refused', s.character.dragon.name === null);
  check('and the window says why', /letters/.test(text(withClass(s.root, 'bw-derr')[0])), text(withClass(s.root, 'bw-derr')[0]));
  input.value = 'Ash';
  nameBtn.fire('click');
  check('a good name lands on the record', s.character.dragon.name === 'Ash');
  check('the error clears', text(withClass(s.root, 'bw-derr')[0]) === '');
  check('and the page redraws with the name in it', /Ash/.test(s.root.textContent));
  check('the button now offers to rename', nameBtn.textContent === 'Rename');

  s.character.dragon.trueName = 'Vethrax';
  panel.render();
  check('once it has a true name the field is read only', input.disabled === true);
  check('the button says so', nameBtn.textContent === 'True name');
  check('and the page uses the true name', /Vethrax/.test(s.root.textContent));
  check('and says the dragon knows it now', /true name now/.test(s.root.textContent));
}

// -- feeding through the window ---------------------------------------------
{
  const s = stage();
  s.dragon.rename('Ash');
  s.character.dragon.hunger = 60;
  const feedBtn = walk(s.root).filter((n) => n.tagName === 'BUTTON').find((b) => b.textContent === 'Feed');
  check('there is a Feed button', !!feedBtn);

  feedBtn.fire('click');
  check('with nothing to eat it says so in the window, not only in the log',
    /nothing in your pack/.test(s.root.textContent), s.root.textContent.slice(-120));

  s.character.pack.items[3] = makeItem({ base: 'egg' });
  feedBtn.fire('click');
  check('with an egg in the pack, Feed feeds it', s.character.pack.items[3] === null);
  check('the hunger really fell', s.character.dragon.hunger === 60 - FEED_HUNGER, String(s.character.dragon.hunger));
  check('the Bond really rose', s.character.dragon.bond === 8, String(s.character.dragon.bond));
  check('and the window says what it ate and what it was worth',
    /it ate the egg/.test(s.root.textContent) && /Bond \+8/.test(s.root.textContent), s.root.textContent.slice(-140));
  check('the bar moved with it', withClass(s.root, 'bw-bond-fill')[0].style.width === 'calc(8% - 2px)',
    withClass(s.root, 'bw-bond-fill')[0].style.width);
}

// -- dropping food onto the slot --------------------------------------------
{
  const s = stage();
  s.dragon.rename('Ash');
  s.character.pack.items[5] = makeItem({ base: 'egg' });
  const slot = withClass(s.root, 'bw-feed-slot')[0];
  check('the feed slot is there and says what to do with it', /drop food here/i.test(text(slot)));
  slot.fire('drop', {
    preventDefault() {},
    dataTransfer: { getData: () => JSON.stringify({ pack: 5 }) },
  });
  check('a pack slot dropped on it is eaten', s.character.pack.items[5] === null);
  check('and the window says so', /it ate the egg/.test(s.root.textContent));

  s.character.pack.items[6] = makeItem({ base: 'bread' });
  slot.fire('drop', {
    preventDefault() {},
    dataTransfer: { getData: () => JSON.stringify({ pack: 6 }) },
  });
  check('bread dropped on a hatchling is refused', !!s.character.pack.items[6]);
  check('and the window says why rather than going quiet',
    /will not eat that at this age/.test(s.root.textContent), s.root.textContent.slice(-120));
}

// -- what the page shows as the dragon changes ------------------------------
{
  const s = stage();
  s.dragon.rename('Ash');
  s.dragon.grant('verdant');
  panel.render();
  check('a granted gift lights its row',
    withClass(s.root, 'bw-gift').filter((r) => r.classList.contains('on')).length === 1,
    String(withClass(s.root, 'bw-gift').filter((r) => r.classList.contains('on')).length));
  check('and names what it gave', /the dragon's senses/.test(s.root.textContent));

  s.dragon.grant('saltmarch');
  panel.render();
  check('the pair grows it, and the page says drake', /drake/.test(s.root.textContent));
  check('and the food line changes with the age', /fish/.test(s.root.textContent));
  check('two rows lit now', withClass(s.root, 'bw-gift').filter((r) => r.classList.contains('on')).length === 2);

  s.dragon.fall(null);
  panel.render();
  check('a fallen dragon says it is down', /is down/.test(s.root.textContent));
  check('and that it cannot die', /cannot die/.test(s.root.textContent));
  check('and the Bond line says what it is waiting for',
    new RegExp(`at ${WAKE_BOND} it gets up`).test(text(withClass(s.root, 'bw-bond-num')[0])));
}

// -- the tick redraws, but not every frame ----------------------------------
{
  const s = stage();
  let drawn = 0;
  const real = panel.render.bind(panel);
  panel.render = function () { drawn++; return real(); };
  for (let i = 0; i < 60; i++) panel.tick(1 / 60, s.ctx);
  panel.render = real;
  check('a second of frames redraws about five times, not sixty', drawn >= 3 && drawn <= 8, String(drawn));
}

// -- and it survives having no dragon at all --------------------------------
{
  const root = document.createElement('div');
  panel.build(root, { });
  check('a panel with no dragon behind it says so rather than throwing',
    /no dragon yet/.test(root.textContent), root.textContent.slice(0, 60));
}

// -- the naming window opens itself at hatching -----------------------------
{
  const s = stage();
  check('a fresh hatchling asks for the window', s.logs.some((l) => l.t === '[window]'));
  const s2 = stage({ name: 'Ash', age: 'hatchling', bond: 5, hunger: 10, gifts: [] });
  check('and a named dragon out of a save does not', !s2.logs.some((l) => l.t === '[window]'));
  const s3 = stage({ name: null, age: 'hatchling', bond: 0, hunger: 20, gifts: [] });
  check('but a saved dragon that was never named is still asked about',
    s3.logs.some((l) => /no name/.test(l.t)), s3.logs.map((l) => l.t).join(' | '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
