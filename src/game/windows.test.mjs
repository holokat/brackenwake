// The window manager's rules. Run: node src/game/windows.test.mjs
//
// No fake DOM. createWindows runs headless by design, and the rules under test
// (the codex and its one tab at a time, which keys open what, the keys the
// world keeps, Escape's order) are the same code the browser runs. Only the
// shell is skipped, and the shell has no rules in it.

import {
  createWindows, sharesScreen, PAIRS, ESCAPE_KEY,
  CODEX_ID, CODEX_TABS, CODEX_IDS, isCodexTab, RESERVED_KEYS, keyCap,
} from './windows.js';
import { panel as characterPanel } from './win_character.js';
import { panel as bagPanel } from './win_bag.js';
import { panel as skillsPanel } from './win_skills.js';
import { panel as abilitiesPanel } from './win_abilities.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

/** A stand in for input.js: whatever is in the set went down this frame. */
function fakeInput() {
  const fresh = new Set();
  return {
    press(...keys) { fresh.clear(); for (const k of keys) fresh.add(String(k).toLowerCase()); },
    none() { fresh.clear(); },
    pressed: (k) => fresh.has(String(k).toLowerCase()),
  };
}

const trace = [];
function panelOf(id, key, extra = {}) {
  return {
    id, key,
    title: id,
    build() { trace.push(`build:${id}`); },
    open() { trace.push(`open:${id}`); },
    close() { trace.push(`close:${id}`); },
    tick() { trace.push(`tick:${id}`); },
    ...extra,
  };
}

function rig(panels) {
  trace.length = 0;
  const input = fakeInput();
  const w = createWindows(null, input, { hud: { toast() {} } });
  for (const p of panels) w.register(p);
  return { w, input };
}

/** The real six, with the real keys the panels carry. */
const realSix = () => rig([
  panelOf('character', characterPanel.key),
  panelOf('bag', bagPanel.key),
  panelOf('skills', skillsPanel.key),
  panelOf('abilities', abilitiesPanel.key),
  panelOf('crafting', 'v'),
  panelOf('map', 'm'),
  panelOf('settings', ESCAPE_KEY),
  panelOf('talk', null),
]);

// ---- the codex is data, not a special case ---------------------------------
console.log('windows: the codex');
check('there are six tabs', CODEX_TABS.length === 6, CODEX_IDS.join(','));
check('and they are the six a player lives in',
  CODEX_IDS.join(',') === 'character,bag,skills,abilities,crafting,map', CODEX_IDS.join(','));
check('every tab has a label to read', CODEX_TABS.every((t) => typeof t.label === 'string' && t.label.length));
check('the inventory tab is called Inventory, not Bag',
  CODEX_TABS.find((t) => t.id === 'bag').label === 'Inventory');
check('no tab carries its own key, so the label and the hotkey cannot drift',
  CODEX_TABS.every((t) => t.key === undefined));
check('isCodexTab knows its own', isCodexTab('bag') && isCodexTab('map') && !isCodexTab('settings') && !isCodexTab('talk'));
check('the tabs share one frame', sharesScreen('bag', 'character') && sharesScreen('map', 'skills'));
check('and nothing else shares with them', !sharesScreen('bag', 'settings') && !sharesScreen('talk', 'character'));
check('a window shares the screen with itself', sharesScreen('settings', 'settings'));
check('PAIRS is that one group', PAIRS.length === 1 && PAIRS[0].length === 6, JSON.stringify(PAIRS));

// ---- the keys the panels actually carry ------------------------------------
console.log('windows: the panels\' own keys');
check('the character sheet is C', characterPanel.key === 'c', String(characterPanel.key));
check('the pack is B', bagPanel.key === 'b', String(bagPanel.key));
check('the skills are K', skillsPanel.key === 'k', String(skillsPanel.key));
check('the abilities are P and never A again', abilitiesPanel.key === 'p', String(abilitiesPanel.key));
check('no panel of the four asks for a reserved key',
  ![characterPanel, bagPanel, skillsPanel, abilitiesPanel].some((p) => RESERVED_KEYS.includes(p.key)));

// ---- the keys the world keeps ----------------------------------------------
console.log('windows: reserved keys');
check('WASD are reserved', ['w', 'a', 's', 'd'].every((k) => RESERVED_KEYS.includes(k)));
check('so are space, shift, E and Q', [' ', 'shift', 'e', 'q'].every((k) => RESERVED_KEYS.includes(k)));
check('and C, B, K, P, V and M are not',
  ['c', 'b', 'k', 'p', 'v', 'm'].every((k) => !RESERVED_KEYS.includes(k)));
{
  const { w, input } = rig([panelOf('greedy', 'a'), panelOf('bag', 'b')]);
  check('a panel that asks for A is registered anyway', w.panels.some((p) => p.id === 'greedy'));
  check('but with no key at all', w.keyOf('greedy') === null, String(w.keyOf('greedy')));
  input.press('a');
  w.update(0.016);
  check('so A opens nothing', w.anyOpen === false, w.openIds.join(','));
  input.press('b');
  w.update(0.016);
  check('and the key that was not reserved still works', w.isOpen('bag'));
}

// ---- register ---------------------------------------------------------------
console.log('windows: register');
{
  const { w } = rig([]);
  check('a panel registers', w.register(panelOf('bag', 'b')) === true);
  check('a second panel with the same id is refused', w.register(panelOf('bag', 'x')) === false);
  check('and the first is still the one that is there', w.panels.length === 1);
  check('a panel with no id is refused', w.register({ title: 'nameless' }) === false);
  w.register(panelOf('skills', 'b'));
  check('a second claim on the b key does not steal it', w.keyOf('skills') === null);
  check('and b still belongs to the bag', w.keyOf('bag') === 'b');
}

// ---- open, close, toggle ----------------------------------------------------
console.log('windows: open and close');
{
  const { w } = realSix();
  check('nothing is open to start', w.anyOpen === false && w.top === null && w.tab === null);
  check('opening the bag opens it', w.open('bag') === true && w.isOpen('bag'));
  check('and the codex counts as open', w.isOpen(CODEX_ID) === true);
  check('and the bag is the tab that is up', w.tab === 'bag');
  // build() fills a DOM element and there is no DOM here, so the manager does
  // not call it. open, close and tick are rules and are called either way.
  check('nothing is built without a document', trace.filter((t) => t === 'build:bag').length === 0, trace.join(','));
  check('and told it opened', trace.includes('open:bag'));
  check('opening it again is not a second open', w.open('bag') === true && trace.filter((t) => t === 'open:bag').length === 1);
  check('closing closes', w.close('bag') === true && !w.isOpen('bag') && w.anyOpen === false);
  check('and the codex is shut with it', w.isOpen(CODEX_ID) === false && w.tab === null);
  check('and told it closed', trace.includes('close:bag'));
  check('closing what is closed does nothing', w.close('bag') === false);
  check('toggle opens', w.toggle('bag') === true && w.isOpen('bag'));
  check('toggle closes', w.toggle('bag') === false && !w.isOpen('bag'));
  check('opening a panel nobody registered is refused', w.open('dragons') === false);
  check('and it is not open', w.isOpen('dragons') === false);
}

// ---- one tab at a time ------------------------------------------------------
console.log('windows: one tab at a time');
{
  const { w } = realSix();
  w.open('character');
  w.open('bag');
  check('opening the pack leaves the sheet', w.isOpen('bag') && !w.isOpen('character'), w.openIds.join(','));
  check('and exactly one thing is open', w.openIds.length === 1);
  check('the closed tab was told', trace.includes('close:character'));
  w.open('map');
  check('and the map takes its turn', w.tab === 'map' && w.openIds.length === 1);
  w.open('talk');
  check('a standalone window closes the codex', w.isOpen('talk') && w.tab === null, w.openIds.join(','));
  w.open('skills');
  check('and the codex closes the standalone window back', w.tab === 'skills' && !w.isOpen('talk'));
  check('still exactly one', w.openIds.length === 1, w.openIds.join(','));
}

// ---- the hotkeys ------------------------------------------------------------
console.log('windows: hotkeys');
{
  const { w, input } = realSix();
  input.press('c');
  w.update(0.016);
  check('C opens the codex on the character page', w.tab === 'character' && w.isOpen(CODEX_ID));
  input.press('b');
  w.update(0.016);
  check('B turns to the inventory page', w.tab === 'bag' && !w.isOpen('character'));
  input.press('p');
  w.update(0.016);
  check('P turns to the abilities page', w.tab === 'abilities', String(w.tab));
  input.press('a');
  w.update(0.016);
  check('A does nothing at all', w.tab === 'abilities', String(w.tab));
  input.press('k');
  w.update(0.016);
  check('K turns to the skills page', w.tab === 'skills');
  input.press('v');
  w.update(0.016);
  check('V turns to crafting', w.tab === 'crafting');
  input.press('m');
  w.update(0.016);
  check('M turns to the map', w.tab === 'map');
  input.press('m');
  w.update(0.016);
  check('and M again shuts the codex', w.anyOpen === false);
  input.press('C');
  w.update(0.016);
  check('a capital C is the same key', w.tab === 'character');
  input.press('w', 'a', 's', 'd', ' ');
  const before = w.openIds.join(',');
  w.update(0.016);
  check('WASD and space move no windows', w.openIds.join(',') === before, w.openIds.join(','));
}

// ---- Escape -----------------------------------------------------------------
console.log('windows: Escape');
{
  const { w, input } = realSix();
  w.open('character');
  const a = w.escape();
  check('Escape closes the codex', a.closed === 'character' && w.anyOpen === false);
  const b = w.escape();
  check('with nothing open Escape opens the panel that claimed the key', b.opened === 'settings' && w.isOpen('settings'));
  const c = w.escape();
  check('and Escape then closes it again', c.closed === 'settings' && w.anyOpen === false);
  w.open('bag');
  w.open('talk');
  const d = w.escape();
  check('Escape closes the top, which is the newest', d.closed === 'talk');
  check('and nothing else was left open behind it', w.anyOpen === false, w.openIds.join(','));
  input.press(ESCAPE_KEY, 'b');
  w.update(0.016);
  check('Escape wins the frame it shares with a hotkey', w.isOpen('settings') && !w.isOpen('bag'));
}
{
  const { w } = rig([panelOf('bag', 'b')]);
  const r = w.escape();
  check('Escape with nothing open and nothing claiming it is a no op', r.closed === null && r.opened === null && w.anyOpen === false);
}

// ---- open('codex') ----------------------------------------------------------
console.log('windows: opening the codex by name');
{
  const { w } = realSix();
  check('open("codex") lands on the first tab', w.open(CODEX_ID) === true && w.tab === 'character');
  w.open('skills');
  w.close('skills');
  check('and after that it lands where you left it', w.open(CODEX_ID) === true && w.tab === 'skills');
  check('close("codex") shuts whatever page is up', w.close(CODEX_ID) === true && w.anyOpen === false);
  check('and closing it twice is a no op', w.close(CODEX_ID) === false);
}

// ---- what the world keeps ---------------------------------------------------
console.log('windows: consumes');
{
  const { w } = rig([panelOf('bag', 'b'), panelOf('crafting', 'v', { keys: ['1', '2'] })]);
  w.open('bag');
  check('an open pack claims no ability key', w.consumes('1') === false && w.consumes('2') === false);
  check('and never claims a movement key', w.consumes('w') === false && w.consumes('d') === false);
  w.open('crafting');
  check('a panel that declares 1 and 2 claims them', w.consumes('1') === true && w.consumes('2') === true);
  check('but not the ones it did not declare', w.consumes('3') === false);
  check('and still not WASD', w.consumes('a') === false && w.consumes('s') === false);
  w.close('crafting');
  check('closing it hands the keys back', w.consumes('1') === false);
  check('an empty key claims nothing', w.consumes('') === false && w.consumes(null) === false);
}

// ---- ticks go to the open ones only -----------------------------------------
console.log('windows: ticks');
{
  const { w } = rig([panelOf('bag', 'b'), panelOf('skills', 'k')]);
  w.open('bag');
  trace.length = 0;
  w.update(0.016);
  check('an open panel ticks', trace.includes('tick:bag'));
  check('a closed one does not', !trace.includes('tick:skills'), trace.join(','));
  w.close('bag');
  trace.length = 0;
  w.update(0.016);
  check('and nothing ticks when nothing is open', trace.length === 0, trace.join(','));
}

// ---- a panel that throws does not take the frame with it --------------------
{
  const { w } = rig([
    panelOf('bad', 'x', { build() { throw new Error('no'); }, tick() { throw new Error('no'); } }),
    panelOf('bag', 'b'),
  ]);
  let threw = false;
  try { w.open('bad'); w.update(0.016); } catch { threw = true; }
  check('a panel that throws in build and tick is survived', threw === false);
  check('and it is still considered open', w.isOpen('bad'));
}

// ---- key caps ---------------------------------------------------------------
check('a key cap reads as a capital', keyCap('c') === 'C' && keyCap('p') === 'P');
check('escape reads as esc', keyCap(ESCAPE_KEY) === 'esc');
check('no key, no cap', keyCap(null) === '');

// ---- closeAll ---------------------------------------------------------------
{
  const { w } = rig([panelOf('bag', 'b'), panelOf('talk', null)]);
  w.open('bag');
  check('closeAll closes what is up and counts it', w.closeAll() === 1 && w.anyOpen === false);
}

// ---- the codex with a document under it ------------------------------------
// The rules above run headless on purpose. This last section gives the manager
// a small fake document and builds the REAL four panels inside the REAL codex,
// because "the tab strip is built from CODEX_TABS" is a claim about DOM code
// and the sections above never run a line of it.
console.log('windows: the codex, built');
{
  const makeNode = (tag) => {
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style: {}, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '', hidden: false, draggable: false, type: '',
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      // Faithful to the real thing: setting textContent EMPTIES the node. Panels
      // clear and rebuild with it, and a fake that only stored the string would
      // let a tab strip grow four copies of itself and call it a pass.
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      listeners: {}, offsetWidth: 100, offsetHeight: 100, offsetLeft: 0, offsetTop: 0,
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; },
      },
      setAttribute() {}, removeAttribute() {},
      contains: () => false, closest: () => null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = node; node.children.push(c); return c; },
      remove() { if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; } },
      addEventListener(n2, fn) { (node.listeners[n2] ||= []).push(fn); },
      removeEventListener() {},
      fire(n2, ev) { for (const fn of node.listeners[n2] || []) fn(ev || { preventDefault() {}, stopPropagation() {} }); },
      get firstChild() { return node.children[0] || null; },
      get lastChild() { return node.children[node.children.length - 1] || null; },
      querySelector: () => null,
    };
    return node;
  };
  const byId = new Map();
  globalThis.document = {
    createElement: makeNode,
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { if (c.id) byId.set(c.id, c); return c; } },
    body: makeNode('body'),
  };
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };

  const character = {
    name: 'Ashe', opening: 'warrior', gold: 12,
    stats: { str: 60, dex: 50, int: 30, con: 55, wis: 40 },
    skills: {}, skillLocks: {}, bar: [],
    pack: { slots: 8, items: [] }, equipment: {},
  };
  const said = [];
  const ctx = { character, hud: { log: (t) => said.push(String(t)) } };
  const input = fakeInput();
  const w = createWindows(null, input, ctx);
  let threw = null;
  try {
    for (const p of [characterPanel, bagPanel, skillsPanel, abilitiesPanel]) w.register(p);
    w.open('character');
  } catch (e) { threw = e; }
  check('the four real panels register and the character page builds', threw === null, threw ? threw.stack.split('\n')[0] : '');

  const codexEl = w.codexEl;
  check('there is a codex element', !!codexEl);
  const frame = codexEl.children[0];
  check('it wears the gilded frame', frame.classList.contains('bw-frame'), frame.className);
  const tabs = frame.children[0].children[0];
  check('the strip holds one tab per registered page', tabs.children.length === 4,
    tabs.children.map((t) => t.textContent).join(','));
  check('in the order CODEX_TABS gives',
    tabs.children.map((t) => t.dataset.tab).join(',') === 'character,bag,skills,abilities',
    tabs.children.map((t) => t.dataset.tab).join(','));
  check('the Inventory tab reads Inventory', tabs.children[1].textContent === 'Inventory');
  check('the page that is up is the one on the red plate',
    tabs.children[0].classList.contains('on') && !tabs.children[1].classList.contains('on'));
  check('and the codex is showing', codexEl.hidden === false);

  const bodies = frame.children[1];
  check('only the pages that have been opened are built', bodies.children.length === 1);
  check('and the built one is not hidden', bodies.children[0].hidden === false);
  check('bodyOf hands back that page', w.bodyOf('character') === bodies.children[0]);

  let clickThrew = null;
  try { tabs.children[1].fire('click'); } catch (e) { clickThrew = e; }
  check('clicking the Inventory tab turns the page', clickThrew === null && w.tab === 'bag',
    clickThrew ? clickThrew.stack.split('\n')[0] : String(w.tab));
  check('the pack page is now built and shown', bodies.children.length === 2 && bodies.children[1].hidden === false);
  check('and the sheet is hidden, not thrown away', bodies.children[0].hidden === true);
  check('the plate moved with it',
    tabs.children[1].classList.contains('on') && !tabs.children[0].classList.contains('on'));

  let skillsThrew = null;
  try { w.open('skills'); w.open('abilities'); } catch (e) { skillsThrew = e; }
  check('the skills and abilities pages build too', skillsThrew === null, skillsThrew ? skillsThrew.stack.split('\n')[0] : '');
  check('four pages built, one shown', bodies.children.length === 4
    && bodies.children.filter((b) => !b.hidden).length === 1, String(bodies.children.filter((b) => !b.hidden).length));

  const closeBtn = frame.children[0].children[1];
  closeBtn.fire('click', { stopPropagation() {} });
  check('the close button shuts the codex', w.anyOpen === false && codexEl.hidden === true);
  check('and nothing is left showing', bodies.children.every((b) => b.hidden === true));

  let tickThrew = null;
  try { w.open('character'); w.update(0.3); w.update(0.3); } catch (e) { tickThrew = e; }
  check('and a page ticks its live numbers without throwing', tickThrew === null,
    tickThrew ? tickThrew.stack.split('\n')[0] : '');

  check('refresh rebuilds a page and says it worked', w.refresh('character') === true);
  check('and there is still exactly one page element for it', bodies.children.length === 4);
  check('refreshing a page nobody registered is refused', w.refresh('dragons') === false);

  delete globalThis.document;
  delete globalThis.window;
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
