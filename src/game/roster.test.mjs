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
const {
  ROSTER_FRAME, ROSTER_FRAME_FIT, ROSTER_PANEL_ART,
  containBox, rosterBgUrl, rosterPanelsUrl,
} = await import('./ui_theme.js');

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

/** The rows a roster is showing. The Begin plate is outside this list now. */
const slotCards = (r) => r.cards;
const beginPlate = (r) => button(r.el, 'begin');
/** Find a button inside a card by the data key it was stamped with. */
function button(card, key) {
  const out = [];
  (function walk(n) { if (n.dataset && n.dataset[key] !== undefined) out.push(n); for (const c of n.children) walk(c); })(card);
  return out[0] || null;
}
const textOf = (n) => n.textContent;
/** Every node inside a row that wears this class, in document order. */
function byClass(node, cls) {
  const out = [];
  (function walk(n) {
    if (n.classList && n.classList.contains(cls)) out.push(n);
    for (const c of n.children) walk(c);
  })(node);
  return out;
}
const one = (node, cls) => byClass(node, cls)[0] || null;
/** The name a row is showing, found by its class rather than by its position. */
const nameOf = (card) => textOf(one(card, 'bw-ro-name') || { textContent: '' });
const panelHeight = (box, panel = ROSTER_FRAME.rightPanel) => (panel.y2 - panel.y1) * box.h;
const px = (n) => `${Math.round(n * 10) / 10}px`;

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
    check(`${n} character${n > 1 ? 's' : ''} draw ${n} row${n > 1 ? 's' : ''}, with one Begin plate under the list`,
      slotCards(r).length === n && r.cards.length === n && !!beginPlate(r), `${r.cards.length} rows`);
    check('  every card carries the slot it stands for',
      slotCards(r).every((c) => !!c.dataset.slot), slotCards(r).map((c) => c.dataset.slot).join(','));
    r.destroy();
  }
}
{
  const store = memStore();
  const state = createState({ storage: store });
  const r = createRoster(document.createElement('div'), { state });
  check('an empty roster still offers the one road out of it', r.cards.length === 0 && !!beginPlate(r));
  r.destroy();
}
{
  const { state } = withCharacters(2);
  const hud = document.createElement('div');
  const r = createRoster(hud, { state });
  check('the screen is in the hud root', hud.children.includes(r.el) && r.el.id === 'bw-roster');
  check('the roster uses the painted valley as its cover background',
    r.el.style.backgroundImage === `url("${rosterBgUrl()}")`,
    r.el.style.backgroundImage);
  const css = document.getElementById('bw-roster-css').textContent;
  check('and the transparent joined panels are painted over it',
    css.includes(`background-image: url("${rosterPanelsUrl()}")`));
  check('the row columns are laid into measured frame interiors',
    css.includes(`${ROSTER_FRAME.leftPanel.x1} * var(--bw-scene-w)`)
    && css.includes(`${ROSTER_FRAME.rightPanel.x1} * var(--bw-scene-w)`));
  check('the frame fit is the C4 smaller contain box',
    ROSTER_FRAME_FIT.maxWidth === 1400 && ROSTER_FRAME_FIT.viewportW === 0.82 && ROSTER_FRAME_FIT.viewportH === 0.82,
    JSON.stringify(ROSTER_FRAME_FIT));
  {
    const a = containBox(1568, 721);
    const b = containBox(1280, 720);
    check('at 1568 by 721 the frame is height bound and centred at the C4 scale',
      px(a.w) === '1049.9px' && px(a.h) === '591.2px' && px(a.x) === '259.1px' && px(a.y) === '64.9px',
      `${px(a.w)} by ${px(a.h)} at ${px(a.x)}, ${px(a.y)}`);
    check('at 1280 by 720 the frame is height bound and centred at the C4 scale',
      px(b.w) === '1048.4px' && px(b.h) === '590.4px' && px(b.x) === '115.8px' && px(b.y) === '64.8px',
      `${px(b.w)} by ${px(b.h)} at ${px(b.x)}, ${px(b.y)}`);
    check('the right portrait is capped at fifty eight percent of the interior height',
      ROSTER_PANEL_ART.maxPortraitFrac === 0.58
      && css.includes(`max-height: ${ROSTER_PANEL_ART.maxPortraitFrac * 100}%`),
      `${Math.round(panelHeight(a) * ROSTER_PANEL_ART.maxPortraitFrac * 10) / 10}px of ${Math.round(panelHeight(a) * 10) / 10}px`);
  }
  const names = slotCards(r).map(nameOf);
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
  check('and says it is unfinished without extra row copy', textOf(slotCards(r)[0]).includes('unfinished'));
  r.destroy();
}

// ---- one row each, in the order state gives them ---------------------------
console.log('roster: rows, not a grid');
{
  const { state } = withCharacters(3);
  const r = createRoster(document.createElement('div'), { state });
  const wanted = state.roster().map((s) => s.id);
  const shown = slotCards(r).map((c) => c.dataset.slot);
  check('the rows are in the order the roster gave them',
    shown.join(',') === wanted.join(','), `${shown.join(',')} wanted ${wanted.join(',')}`);
  check('and the Begin plate is outside the rows',
    r.cards.length === 3 && !!beginPlate(r));
  const first = slotCards(r)[0];
  const cells = first.children.filter((n) => !n.classList.contains('bw-ro-band'));
  check('a row opens with a face and then says who it is',
    cells[0].classList.contains('bw-ro-port') && cells[1].classList.contains('bw-ro-who'),
    cells.map((n) => n.className).join(' | '));
  check('and runs face, name, buttons across the row',
    cells.map((n) => n.className.split(' ')[0]).join(',') === 'bw-ro-port,bw-ro-who,bw-ro-acts',
    cells.map((n) => n.className).join(' | '));
  check('and every row has exactly one Play and one delete',
    slotCards(r).every((c) => byClass(c, 'bw-ro-play').length === 1 && byClass(c, 'bw-ro-del').length === 1),
    slotCards(r).map((c) => `${byClass(c, 'bw-ro-play').length}/${byClass(c, 'bw-ro-del').length}`).join(' '));
  {
    const css = document.getElementById('bw-roster-css').textContent;
    check('C4 rows are pinned at about seventy two pixels',
      /#bw-roster \.bw-ro-card \{[^}]*min-height: 72px/.test(css), 'row rule missing');
    check('and the class thumb fills that row at sixty four pixels',
      /#bw-roster \.bw-ro-port \{[^}]*width: 64px; height: 64px/.test(css), 'thumb rule missing');
    check('while Play and delete keep their forty pixel plates',
      /#bw-roster \.bw-ro-play, #bw-roster \.bw-ro-begin \{[^}]*min-height: 40px/.test(css)
      && /#bw-roster \.bw-ro-del \{[^}]*width: 40px; height: 40px/.test(css),
      'button plate changed');
  }
  check('and the old skills and facts are no longer shown in the row',
    byClass(first, 'bw-ro-chip').length === 0 && byClass(first, 'bw-ro-facts').length === 0);
  r.destroy();
}

// ---- the class portraits ---------------------------------------------------
console.log('roster: the class portrait on each row');
{
  const { state } = withCharacters(2);
  const r = createRoster(document.createElement('div'), { state });

  const faces = slotCards(r).map((c) => one(c, 'bw-ro-face'));
  check('every made character uses a class portrait from public/ui/classes',
    faces.every((f) => f && /ui\/classes\/(warrior|ranger|rogue|wizard)\.webp$/.test(f.src)),
    faces.map((f) => f && f.src).join(' | '));
  check('and it is told which class it is a picture of', faces.every((f) => /Warrior|Ranger|Rogue|Wizard/.test(f.alt)),
    faces.map((f) => f.alt).join(' | '));
  r.destroy();
}
{
  const store = memStore();
  const state = createState({ storage: store });
  state.newSlot();
  const r = createRoster(document.createElement('div'), { state, storage: store });
  const port = one(slotCards(r)[0], 'bw-ro-port');
  check('a slot that was never finished shows a faint class portrait',
    !!one(slotCards(r)[0], 'bw-ro-face') && port.classList.contains('bw-ro-unfinished'),
    port.className);
  r.destroy();
}
{
  const { state, store } = withCharacters(2);
  const r = createRoster(document.createElement('div'), { state, storage: store });
  check('no WebGL is needed for the roster portraits', slotCards(r).length === 2 && !r.portraits);
  let played = null;
  button(slotCards(r)[0], 'play').fire('click');
  check('and Play still works', r.gone === true);
  played = null; void played;
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
  beginPlate(r).fire('click');
  check('the Begin plate calls onNew and nothing else', news === 1 && plays === 0);
  check('and it leaves first', !hud.children.includes(r.el));
  beginPlate(r).fire('click');
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
  check('the button changes its label', del().title === 'Press again to delete', del().title);
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
  check('the far end is the last row', r.selected === r.cards.length - 1 && r.cards[r.selected].dataset.slot === state.roster()[2].id);
  press('ArrowLeft');
  check('escape does nothing at all', press('Escape') === 0 && r.selected === 1 && r.gone === false);
  const wanted = r.cards[r.selected].dataset.slot;
  press('Enter');
  check('enter plays the row in hand', played.join(',') === wanted, `${played.join(',')} wanted ${wanted}`);
  check('and the screen is gone', r.gone === true);
  press('ArrowRight');
  check('a key after that reaches nothing, because the listener was taken off', keyListeners.length === 0, String(keyListeners.length));
}
{
  const { state } = withCharacters(1);
  let news = 0;
  const r = createRoster(document.createElement('div'), { state, onNew: () => news++ });
  beginPlate(r).fire('click');
  check('and calls onNew', news === 1);
  r.destroy();
}
{
  // A vertical list is walked with up and down, and the row that is lit is the
  // row Enter plays. Both are measured against the id on the row itself.
  const { state } = withCharacters(4);
  const played = [];
  const r = createRoster(document.createElement('div'), { state, onPlay: (id) => played.push(id) });
  const lit = () => r.cards.filter((c) => c.classList.contains('on'));
  press('ArrowDown'); press('ArrowDown');
  check('down walks the list', r.selected === 2, String(r.selected));
  check('and exactly one row is lit at a time',
    lit().length === 1 && lit()[0] === r.cards[2], `${lit().length} lit`);
  press('ArrowUp');
  check('up walks back', r.selected === 1 && lit()[0] === r.cards[1], String(r.selected));
  const wanted = r.cards[1].dataset.slot;
  check('  and it is the second character on the roster', wanted === state.roster()[1].id);
  press('Enter');
  check('enter plays the row that was lit', played.join(',') === wanted, `${played.join(',')} wanted ${wanted}`);
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
