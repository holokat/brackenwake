// The window manager's rules. Run: node src/game/windows.test.mjs
//
// No fake DOM. createWindows runs headless by design, and the rules under test
// (the one-open rule, its Bag and Character exception, Escape's order, which
// keys are read and which are left to the world) are the same code the browser
// runs. Only the shell is skipped, and the shell has no rules in it.

import { createWindows, sharesScreen, PAIRS, ESCAPE_KEY } from './windows.js';

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
    build(el) { trace.push(`build:${id}`); },
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

// ---- the pairing rule is data, not a special case --------------------------
check('bag and character share the screen', sharesScreen('bag', 'character') && sharesScreen('character', 'bag'));
check('and nothing else does', !sharesScreen('bag', 'skills') && !sharesScreen('character', 'map'));
check('a window shares the screen with itself', sharesScreen('bag', 'bag'));
check('there is exactly one pair', PAIRS.length === 1 && PAIRS[0].length === 2, JSON.stringify(PAIRS));

// ---- register ---------------------------------------------------------------
{
  const { w } = rig([]);
  check('a panel registers', w.register(panelOf('bag', 'b')) === true);
  check('a second panel with the same id is refused', w.register(panelOf('bag', 'x')) === false);
  check('and the first is still the one that is there', w.panels.length === 1);
  check('a panel with no id is refused', w.register({ title: 'nameless' }) === false);
  w.register(panelOf('skills', 'b'));
  check('a second claim on the b key does not steal it', w.panels.find((p) => p.id === 'skills').key === null);
  check('and b still belongs to the bag', w.panels.find((p) => p.id === 'bag').key === 'b');
}

// ---- open, close, toggle ----------------------------------------------------
{
  const { w } = rig([panelOf('bag', 'b'), panelOf('character', 'c'), panelOf('skills', 'k')]);
  check('nothing is open to start', w.anyOpen === false && w.top === null);
  check('opening the bag opens it', w.open('bag') === true && w.isOpen('bag'));
  check('and it is now the top', w.top === 'bag');
  check('anyOpen says so', w.anyOpen === true);
  // build() fills a DOM element and there is no DOM here, so the manager does
  // not call it. open, close and tick are rules and are called either way.
  check('nothing is built without a document', trace.filter((t) => t === 'build:bag').length === 0, trace.join(','));
  check('and told it opened', trace.includes('open:bag'));
  check('opening it again is not a second open', w.open('bag') === true && trace.filter((t) => t === 'open:bag').length === 1);
  check('closing closes', w.close('bag') === true && !w.isOpen('bag') && w.anyOpen === false);
  check('and told it closed', trace.includes('close:bag'));
  check('closing what is closed does nothing', w.close('bag') === false);
  check('toggle opens', w.toggle('bag') === true && w.isOpen('bag'));
  check('toggle closes', w.toggle('bag') === false && !w.isOpen('bag'));
  check('opening a panel nobody registered is refused', w.open('dragons') === false);
  check('and it is not open', w.isOpen('dragons') === false);
  w.open('bag');
  check('and still nothing is built on reopening', trace.filter((t) => t === 'build:bag').length === 0);
}

// ---- one at a time, except the pair -----------------------------------------
{
  const { w } = rig([panelOf('bag', 'b'), panelOf('character', 'c'), panelOf('skills', 'k'), panelOf('map', 'm')]);
  w.open('bag');
  w.open('character');
  check('bag and character are both up', w.isOpen('bag') && w.isOpen('character'), w.openIds.join(','));
  check('and character is the top', w.top === 'character');
  w.open('skills');
  check('opening skills closes both', w.isOpen('skills') && !w.isOpen('bag') && !w.isOpen('character'), w.openIds.join(','));
  w.open('map');
  check('and opening the map closes skills', w.isOpen('map') && !w.isOpen('skills'), w.openIds.join(','));
  check('only one is open', w.openIds.length === 1);
  w.open('character');
  w.open('bag');
  check('the pair works in either order', w.isOpen('bag') && w.isOpen('character') && !w.isOpen('map'));
  check('and two is the most that share', w.openIds.length === 2);
}

// ---- Escape closes the top, one at a time -----------------------------------
{
  const { w } = rig([panelOf('bag', 'b'), panelOf('character', 'c'), panelOf('settings', ESCAPE_KEY)]);
  w.open('character');
  w.open('bag');
  check('the bag was opened last, so it is the top', w.top === 'bag');
  const a = w.escape();
  check('Escape closes the top one', a.closed === 'bag' && !w.isOpen('bag'));
  check('and leaves the other alone', w.isOpen('character'), w.openIds.join(','));
  const b = w.escape();
  check('a second Escape closes that one', b.closed === 'character' && w.anyOpen === false);
  const c = w.escape();
  check('with nothing open Escape opens the panel that claimed the key', c.opened === 'settings' && w.isOpen('settings'));
  const d = w.escape();
  check('and Escape then closes it again', d.closed === 'settings' && w.anyOpen === false);
}
{
  // With no Escape panel registered, Escape on an empty screen does nothing.
  const { w } = rig([panelOf('bag', 'b')]);
  const r = w.escape();
  check('Escape with nothing open and nothing claiming it is a no op', r.closed === null && r.opened === null && w.anyOpen === false);
}

// ---- the hotkeys ------------------------------------------------------------
{
  const { w, input } = rig([panelOf('bag', 'b'), panelOf('character', 'c'), panelOf('skills', 'k'), panelOf('settings', ESCAPE_KEY)]);
  input.press('b');
  w.update(0.016);
  check('b opens the bag', w.isOpen('bag'));
  input.press('b');
  w.update(0.016);
  check('and b closes it again', !w.isOpen('bag'));
  input.press('B');
  w.update(0.016);
  check('a capital B is the same key', w.isOpen('bag'));
  input.press('c');
  w.update(0.016);
  check('c opens the character sheet beside it', w.isOpen('bag') && w.isOpen('character'));
  input.press('k');
  w.update(0.016);
  check('k closes both and opens skills', w.isOpen('skills') && !w.isOpen('bag') && !w.isOpen('character'));
  input.press(ESCAPE_KEY);
  w.update(0.016);
  check('Escape in update closes the top', !w.isOpen('skills') && w.anyOpen === false);
  input.press(ESCAPE_KEY);
  w.update(0.016);
  check('and the next Escape opens settings, not everything else', w.isOpen('settings') && w.openIds.length === 1);
  input.press('w', 'a', 's', 'd', ' ');
  const before = w.openIds.join(',');
  w.update(0.016);
  check('WASD and space move no windows', w.openIds.join(',') === before, w.openIds.join(','));
  input.press(ESCAPE_KEY, 'b');
  w.update(0.016);
  check('Escape wins the frame it shares with a hotkey', w.anyOpen === false && !w.isOpen('bag'));
}

// ---- what the world keeps ---------------------------------------------------
{
  const { w } = rig([panelOf('bag', 'b'), panelOf('crafting', 'v', { keys: ['1', '2'] })]);
  w.open('bag');
  check('an open bag claims no ability key', w.consumes('1') === false && w.consumes('2') === false);
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
  check('and the other windows still work', w.open('bag') === true || w.isOpen('bag') === false);
}

// ---- closeAll ---------------------------------------------------------------
{
  const { w } = rig([panelOf('bag', 'b'), panelOf('character', 'c')]);
  w.open('bag'); w.open('character');
  check('closeAll closes both and counts them', w.closeAll() === 2 && w.anyOpen === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
