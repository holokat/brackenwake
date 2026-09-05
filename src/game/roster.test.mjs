// The roster screen. Run: node src/game/roster.test.mjs
//
// This drives the REAL panel against a fake document, the way win_bag.test.mjs
// does, and against the REAL createState over a Map. Nothing here touches
// localStorage: every store is in memory and dies with the process.
//
// What is measured rather than read: N cards for N slots, that Play hands back
// the id of the card it was on, that Delete takes two presses and removes the
// document as well as the row, that New is New, and that the arrow keys and
// Enter go through the same keydown handler the window is given.

// --- a document, small enough to read ---------------------------------------
function makeDom() {
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '', hidden: false,
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      // Faithful to the real thing: setting textContent EMPTIES the node, which
      // is how the roster rebuilds its list without growing four copies of it.
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      listeners: {},
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
      appendChild(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.push(c); return c;
      },
      remove() {
        if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; }
      },
      addEventListener(name, fn) { (node.listeners[name] ||= []).push(fn); },
      removeEventListener() {},
      fire(name, ev) { for (const fn of [...(node.listeners[name] || [])]) fn(ev || { preventDefault() {}, stopPropagation() {} }); },
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
// A window with a real listener list, so a key press goes through the handler
// the roster actually registered rather than through a copy of it.
const keyListeners = [];
globalThis.window = {
  innerWidth: 1280, innerHeight: 720,
  addEventListener(name, fn) { if (name === 'keydown') keyListeners.push(fn); },
  removeEventListener(name, fn) {
    if (name !== 'keydown') return;
    const i = keyListeners.indexOf(fn);
    if (i >= 0) keyListeners.splice(i, 1);
  },
};
const press = (key) => {
  let prevented = 0;
  for (const fn of [...keyListeners]) fn({ key, preventDefault() { prevented++; }, stopPropagation() {} });
  return prevented;
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const { createRoster, cardOf, agoWords, auditRosterIcons, UNNAMED } = await import('./roster.js');
const { createState, slotKeyFor, ROSTER_KEY, ROSTER_FLAG, askForRoster, rosterAsked } = await import('./state.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

function memStore() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** A storage with `n` made characters in it, each with a name and a skill. */
function withCharacters(n) {
  const store = memStore();
  const s = createState({ storage: store });
  const NAMES = ['Mab', 'Corr', 'Edrey', 'Wren'];
  for (let i = 0; i < n; i++) {
    s.newSlot();
    s.character.name = NAMES[i % NAMES.length];
    s.character.needsCreation = false;
    s.character.skills.mining = 10 + i;
    s.character.skills.archery = 40 + i;
    s.character.gold = 100 * (i + 1);
    s.setPos(0, 0);
    s.save();
  }
  return { store, state: s };
}

/** The cards a roster is showing, the character ones and the new one apart. */
const slotCards = (r) => r.cards.filter((c) => !c.dataset.new);
const newCard = (r) => r.cards.find((c) => c.dataset.new);
/** Find a button inside a card by the data key it was stamped with. */
function button(card, key) {
  const out = [];
  (function walk(n) { if (n.dataset && n.dataset[key] !== undefined) out.push(n); for (const c of n.children) walk(c); })(card);
  return out[0] || null;
}
const textOf = (n) => n.textContent;

// ---- the table the cards are painted from -----------------------------------
console.log('roster: what a card says');
check('every mark on a card is an icon ui_theme actually has', auditRosterIcons() === 3);
{
  const now = 1_700_000_000_000;
  const c = cardOf({
    id: '1', name: 'Mab', opening: 'ranger', playedAt: now - 3 * 3600000, needsCreation: false,
    summary: { name: 'Mab', opening: 'ranger', openingName: 'Ranger', gold: 250, place: 'Saltmere', pos: { x: 3000, z: -2000 }, skills: [{ id: 'archery', name: 'Archery', value: 61.25 }] },
  }, now);
  check('the name is the name', c.name === 'Mab' && c.unnamed === false);
  check("the opening's own word is used", c.opening === 'Ranger');
  check('the purse is a number', c.gold === 250);
  check('the place is the place', c.placeLine === 'Saltmere');
  check('and how long ago is counted, not guessed', c.played === '3 hours ago', c.played);
}
{
  const c = cardOf({ id: '2', name: '', opening: 'blank', needsCreation: true, playedAt: 0, summary: null });
  check('a character with no name is called something rather than nothing', c.name === UNNAMED && c.unnamed === true);
  check('one that was never finished says so', c.needsCreation === true);
  check('one with no summary at all still draws', c.gold === null && c.skills.length === 0 && c.known === false);
  check('and says the purse was never counted rather than showing a zero', c.gold === null);
  check('a row that was never played says so', c.played === 'not yet played', c.played);
}
{
  const c = cardOf({ id: '3', summary: { name: 'Fen', skills: [], gold: 0, place: null, pos: { x: 812, z: -44 } }, playedAt: 1 });
  check('open ground is given as the ground it is', c.placeLine === 'open country, at 812, -44', c.placeLine);
  check('and a character who has learned nothing is told so in words', c.skillsLine === 'Nothing learned yet.');
}
{
  const now = 1_700_000_000_000;
  const words = [0, 30_000, 5 * 60000, 90 * 60000, 5 * 3600000, 30 * 3600000, 3 * 86400000]
    .map((d) => agoWords(now - d, now));
  check('the ladder of words runs from just now to days ago',
    words.join(' | ') === 'just now | just now | 5 minutes ago | an hour ago | 5 hours ago | yesterday | 3 days ago', words.join(' | '));
  check('and nothing at all is not a time', agoWords(undefined) === 'not yet played' && agoWords(0) === 'not yet played');
}

// ---- N cards for N slots ----------------------------------------------------
console.log('roster: the cards on the screen');
{
  for (const n of [1, 2, 3]) {
    const { state } = withCharacters(n);
    const hud = document.createElement('div');
    const r = createRoster(hud, { state });
    check(`${n} character${n > 1 ? 's' : ''} draw ${n} card${n > 1 ? 's' : ''}, and the new one`,
      slotCards(r).length === n && r.cards.length === n + 1, `${r.cards.length} cards`);
    check('  every card carries the slot it stands for',
      slotCards(r).every((c) => !!c.dataset.slot), slotCards(r).map((c) => c.dataset.slot).join(','));
    r.destroy();
  }
}
{
  const store = memStore();
  const state = createState({ storage: store });
  const r = createRoster(document.createElement('div'), { state });
  check('an empty roster still offers the one road out of it', r.cards.length === 1 && !!newCard(r));
  r.destroy();
}
{
  const { state } = withCharacters(2);
  const hud = document.createElement('div');
  const r = createRoster(hud, { state });
  check('the screen is in the hud root', hud.children.includes(r.el) && r.el.id === 'bw-roster');
  const names = slotCards(r).map((c) => textOf(c.children[1].children[0]));
  check('the newest played is first', names[0] === 'Corr' && names[1] === 'Mab', names.join(','));
  const first = slotCards(r)[0];
  check('a card shows the three facts and the two buttons',
    !!button(first, 'play') && !!button(first, 'del'), '');
  check('a made character is not asked to be made again',
    !textOf(first).includes('begun and never finished'));
  r.destroy();
  check('and it takes itself off the screen', !hud.children.includes(r.el));
}
{
  // A slot begun and abandoned: the row exists, the document asks to be made.
  const store = memStore();
  const state = createState({ storage: store });
  state.newSlot();
  const r = createRoster(document.createElement('div'), { state });
  check('a slot that was begun and never finished is on the roster', slotCards(r).length === 1);
  check('and says what Play would do with it', textOf(slotCards(r)[0]).includes('begun and never finished'));
  r.destroy();
}

// ---- Play ------------------------------------------------------------------
console.log('roster: Play');
{
  const { state } = withCharacters(3);
  const ids = state.roster().map((s) => s.id);
  for (let i = 0; i < ids.length; i++) {
    const played = [];
    const hud = document.createElement('div');
    const r = createRoster(hud, { state, onPlay: (id) => played.push(id) });
    button(slotCards(r)[i], 'play').fire('click');
    check(`clicking Play on card ${i + 1} hands back that card's slot`,
      played.join(',') === ids[i], `${played.join(',')} wanted ${ids[i]}`);
    check('  and the screen was gone before the callback ran',
      !hud.children.includes(r.el) && r.gone === true);
  }
}
{
  // The order the roster is drawn in is the order state gives it, so the id on
  // the button is the id state would open. Prove the pair rather than assume.
  const { state } = withCharacters(2);
  let got = null;
  const r = createRoster(document.createElement('div'), { state, onPlay: (id) => { got = id; } });
  const wanted = slotCards(r)[1].dataset.slot;
  button(slotCards(r)[1], 'play').fire('click');
  check('the id on the card is the id that is played', got === wanted, `${got} wanted ${wanted}`);
  check('and it is a slot state can open', state.openSlot(got) === true);
}

// ---- New -------------------------------------------------------------------
console.log('roster: New');
{
  const { state } = withCharacters(2);
  let news = 0, plays = 0;
  const hud = document.createElement('div');
  const r = createRoster(hud, { state, onNew: () => news++, onPlay: () => plays++ });
  button(newCard(r), 'begin').fire('click');
  check('the new card calls onNew and nothing else', news === 1 && plays === 0);
  check('and it leaves first', !hud.children.includes(r.el));
  button(newCard(r), 'begin').fire('click');
  check('a second click on a screen that is gone does nothing', news === 1);
}

// ---- Delete ----------------------------------------------------------------
console.log('roster: Delete asks twice');
{
  const { state, store } = withCharacters(2);
  const doomed = state.roster()[0].id;
  const r = createRoster(document.createElement('div'), { state });
  const del = () => button(slotCards(r).find((c) => c.dataset.slot === doomed), 'del');

  del().fire('click');
  check('the first press removes nobody', state.roster().length === 2 && store.m.has(slotKeyFor(doomed)));
  check('it arms that one card', r.armed === doomed, String(r.armed));
  check('the button changes its word', textOf(del()) === 'yes, delete them', textOf(del()));
  check('and the screen says what would go', /goes for good/.test(r.foot), r.foot);

  del().fire('click');
  check('the second press removes them', state.roster().length === 1, String(state.roster().length));
  check('the document goes with the row', !store.m.has(slotKeyFor(doomed)));
  check('the card goes off the screen', slotCards(r).length === 1 && !slotCards(r).some((c) => c.dataset.slot === doomed));
  check('nothing is armed afterwards', r.armed === null);
  check('and it is said out loud', /is gone/.test(r.foot), r.foot);
  r.destroy();
}
{
  const { state } = withCharacters(2);
  const r = createRoster(document.createElement('div'), { state });
  const ids = slotCards(r).map((c) => c.dataset.slot);
  button(slotCards(r)[0], 'del').fire('click');
  check('one card is armed', r.armed === ids[0]);
  button(slotCards(r)[1], 'del').fire('click');
  check('arming another disarms the first', r.armed === ids[1], String(r.armed));
  check('and nobody has gone', state.roster().length === 2);
  r.select(0);
  check('moving off a card takes the question with it', r.armed === null);
  check('and still nobody has gone', state.roster().length === 2);
  r.destroy();
}
{
  // The slot the boot opened is the one a player is most likely to delete, and
  // no game is running behind this screen, so the roster is allowed to.
  const { state, store } = withCharacters(1);
  state.load();
  const open = state.slot;
  check('the boot has a slot open', open === '1');
  check('and state refuses to delete it from under a running game', state.deleteSlot(open) === false);
  let news = 0;
  const r = createRoster(document.createElement('div'), { state, onNew: () => news++ });
  button(slotCards(r)[0], 'del').fire('click');
  button(slotCards(r)[0], 'del').fire('click');
  check('the roster may, because it says it knows', state.roster().length === 0 && !store.m.has(slotKeyFor(open)));
  check('and with nobody left it goes straight on to making somebody', news === 1);
  check('the screen left before it did', r.gone === true);
}

// ---- the keyboard -----------------------------------------------------------
console.log('roster: the keyboard');
{
  const { state } = withCharacters(3);
  const played = [];
  const r = createRoster(document.createElement('div'), { state, onPlay: (id) => played.push(id) });
  check('the first card is the one in hand', r.selected === 0 && r.cards[0].classList.contains('on'));
  press('ArrowRight');
  check('right moves one along', r.selected === 1 && r.cards[1].classList.contains('on'));
  check('and lets the last one go', !r.cards[0].classList.contains('on'));
  press('ArrowDown');
  check('down does the same', r.selected === 2);
  press('ArrowLeft');
  check('left comes back', r.selected === 1);
  press('ArrowUp'); press('ArrowUp'); press('ArrowUp');
  check('and it stops at the first rather than wrapping', r.selected === 0, String(r.selected));
  for (let i = 0; i < 9; i++) press('ArrowRight');
  check('the far end is the new card', r.selected === r.cards.length - 1 && !!r.cards[r.selected].dataset.new);
  press('ArrowLeft');
  check('escape does nothing at all', press('Escape') === 0 && r.selected === 2 && r.gone === false);
  const wanted = r.cards[2].dataset.slot;
  press('Enter');
  check('enter plays the card in hand', played.join(',') === wanted, `${played.join(',')} wanted ${wanted}`);
  check('and the screen is gone', r.gone === true);
  press('ArrowRight');
  check('a key after that reaches nothing, because the listener was taken off', keyListeners.length === 0, String(keyListeners.length));
}
{
  const { state } = withCharacters(1);
  let news = 0;
  const r = createRoster(document.createElement('div'), { state, onNew: () => news++ });
  press('ArrowRight');
  check('enter on the new card begins a new character', !!r.cards[r.selected].dataset.new);
  press('Enter');
  check('and calls onNew', news === 1);
  r.destroy();
}

// ---- the note the settings window leaves ------------------------------------
console.log('roster: the note is taken down');
{
  const session = memStore();
  globalThis.sessionStorage = session;
  askForRoster(session);
  check('the note is up', rosterAsked(session) === true && session.m.get(ROSTER_FLAG) === '1');
  const { state } = withCharacters(1);
  const r = createRoster(document.createElement('div'), { state });
  check('showing the roster takes it down', rosterAsked(session) === false, String(session.m.get(ROSTER_FLAG)));
  r.destroy();
  delete globalThis.sessionStorage;
}

// ---- nothing here ever touched a real save ----------------------------------
{
  check('no test in this file wrote to localStorage', typeof globalThis.localStorage === 'undefined');
  check('and the roster key is the one state owns', ROSTER_KEY === 'brackenwake-roster');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
