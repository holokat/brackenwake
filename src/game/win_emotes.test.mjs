// The emote wheel: where the eight segments sit, what a click on each one
// does, and that X was actually free. Run: node src/game/win_emotes.test.mjs
//
// The panel is BUILT against a small fake document and every segment is
// clicked with a real event through the real listener, because a wheel that was
// only checked by reading `wheelSegments` would prove that a list of angles
// exists, not that clicking the third one sits you down.
//
// The key is checked by registering the REAL panels of the game alongside this
// one in the real window manager and reading back the key it ended up with.
// windows.js hands a panel `null` rather than a key it may not have, so a
// collision with B, C, K, M, N, P, V, F2 or Escape would show up here as a null.

// --- a document, small enough to read ---------------------------------------
function makeDom() {
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '', hidden: false, type: '',
      listeners: {}, offsetWidth: 300, offsetHeight: 300,
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join(' ') : text; },
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; },
      },
      setAttribute(k, v) { node.dataset[k] = v; },
      removeAttribute() {},
      appendChild(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.push(c); return c;
      },
      append(...cs) { for (const c of cs) node.appendChild(c); },
      remove() { if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; } },
      addEventListener(name, fn) { (node.listeners[name] ||= []).push(fn); },
      removeEventListener() {},
      fire(name, ev) { for (const fn of node.listeners[name] || []) fn(ev || { preventDefault() {}, stopPropagation() {} }); },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
      querySelector() { return null; },
      get firstChild() { return node.children[0] || null; },
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
globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };

const {
  panel, wheelSegments, emoteGlyph, EMOTE_GLYPHS, EMOTE_KEY, WHEEL, pickEmote,
} = await import('./win_emotes.js');
const { EMOTES, EMOTE_IDS } = await import('./emotes.js');
const { createWindows, RESERVED_KEYS, ESCAPE_KEY } = await import('./windows.js');
const { panel: characterPanel } = await import('./win_character.js');
const { panel: bagPanel } = await import('./win_bag.js');
const { panel: skillsPanel } = await import('./win_skills.js');
const { panel: abilitiesPanel } = await import('./win_abilities.js');
const { panel: craftingPanel } = await import('./win_crafting.js');
const { panel: mapPanel } = await import('./win_map.js');
const { panel: settingsPanel } = await import('./win_settings.js');
const { panel: devPanel } = await import('./win_dev.js');
const { panel: dragonPanel } = await import('./win_dragon.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;

// ---------------------------------------------------------------- the wheel
console.log('win_emotes: eight segments on a circle');
{
  const segs = wheelSegments();
  check('there are eight of them', segs.length === 8, segs.map((s) => s.id).join(','));
  check('in the table\'s own order', segs.map((s) => s.id).join(',') === EMOTE_IDS.join(','));
  check('the first one is straight up', near(segs[0].x, 0, 1e-9) && near(segs[0].y, -WHEEL.radius, 1e-9),
    `(${segs[0].x}, ${segs[0].y})`);
  const r = segs.map((s) => Math.hypot(s.x, s.y));
  check(`all eight sit on the ${WHEEL.radius} px circle`, r.every((d) => near(d, WHEEL.radius, 0.02)),
    r.map((d) => d.toFixed(1)).join(' '));
  const gaps = segs.map((s, i) => {
    const p = segs[(i + 7) % 8];
    let d = s.angle - p.angle;
    return Math.round(((d + Math.PI * 4) % (Math.PI * 2)) * 1e6) / 1e6;
  });
  check('and they are evenly spaced, forty five degrees apart',
    gaps.every((g) => near(g, Math.PI / 4, 1e-6)), gaps.map((g) => (g * 180 / Math.PI).toFixed(1)).join(' '));
  check('it goes clockwise: the second segment is to the right of the first',
    segs[1].x > segs[0].x && segs[2].x > segs[1].x, `${segs[1].x.toFixed(1)}, ${segs[2].x.toFixed(1)}`);
  const spots = new Set(segs.map((s) => `${s.x.toFixed(2)},${s.y.toFixed(2)}`));
  check('no two segments land on the same spot', spots.size === 8);
  check('and every cell fits inside the box',
    segs.every((s) => Math.abs(s.x) + WHEEL.cell / 2 <= WHEEL.box / 2 + 0.01
      && Math.abs(s.y) + WHEEL.cell / 2 <= WHEEL.box / 2 + 0.01),
    `radius ${WHEEL.radius} + half a ${WHEEL.cell} px cell against a ${WHEEL.box} px box`);
}

console.log('win_emotes: a figure for each');
{
  const names = EMOTES.map((e) => e.glyph);
  check('every emote names a glyph this file draws',
    names.every((n) => typeof EMOTE_GLYPHS[n] === 'string' && EMOTE_GLYPHS[n].length > 20), names.join(','));
  check('and there are no glyphs left over with no emote',
    Object.keys(EMOTE_GLYPHS).every((n) => names.includes(n)), Object.keys(EMOTE_GLYPHS).join(','));
  const svg = emoteGlyph('wave', 30);
  check('a glyph comes out as an svg at the size asked for',
    svg.startsWith('<svg') && svg.includes('width="30"') && svg.includes('viewBox="0 0 24 24"'));
  check('and an unknown name draws something rather than nothing',
    emoteGlyph('nonsense').startsWith('<svg'));
  const drawn = new Set(Object.values(EMOTE_GLYPHS));
  check('no two emotes are drawn with the same figure', drawn.size === 8, `${drawn.size} distinct paths`);
}

// -------------------------------------------------------------- the clicks
console.log('win_emotes: clicking a segment starts that emote and shuts the wheel');
{
  const started = [];
  const closed = [];
  const ctx = {
    emotes: { start: (id) => { started.push(id); return { ok: true, line: `you ${id}` }; } },
    windows: { close: (id) => { closed.push(id); return true; }, frameOf: () => null },
  };
  const root = document.createElement('div');
  panel.build(root, ctx);
  const wheel = root.children[0];
  const buttons = wheel.children.filter((c) => c.tagName === 'BUTTON');
  check('the built wheel has eight buttons', buttons.length === 8, String(buttons.length));
  check('one per emote, in order', buttons.map((b) => b.dataset.emote).join(',') === EMOTE_IDS.join(','),
    buttons.map((b) => b.dataset.emote).join(','));
  check('each one shows the word as well as the figure',
    buttons.every((b, i) => b.textContent.includes(EMOTES[i].name)), buttons[0].textContent);
  check('and each one is placed, in pixels, inside the box',
    buttons.every((b) => /^-?\d+px$/.test(b.style.left) && /^-?\d+px$/.test(b.style.top)
      && parseInt(b.style.left, 10) >= 0 && parseInt(b.style.left, 10) + WHEEL.cell <= WHEEL.box),
    `${buttons[0].style.left} ${buttons[0].style.top}`);
  const hub = wheel.children.find((c) => c.className.includes('bw-hub'));
  check('and there is a hub in the middle that names the key', !!hub && hub.textContent.includes('X'), hub && hub.textContent);

  for (const b of buttons) b.fire('click');
  check('clicking all eight starts all eight, in order',
    started.join(',') === EMOTE_IDS.join(','), started.join(','));
  check('and every one of them shut the wheel behind it',
    closed.length === 8 && closed.every((id) => id === 'emotes'), closed.join(','));

  // the other direction: a wheel with nothing wired to it does not throw
  const bare = document.createElement('div');
  panel.build(bare, {});
  let boom = null;
  try { bare.children[0].children.filter((c) => c.tagName === 'BUTTON')[0].fire('click'); } catch (e) { boom = e.message; }
  check('a click with no emote system behind it is a no op rather than a crash', boom === null, boom || '');
  check('and pickEmote on rubbish is too', pickEmote('shrug', {}) === null);
}

// ----------------------------------------------------------------- the key
console.log('win_emotes: X was free, and still is');
{
  check('X is not a key the world drives', !RESERVED_KEYS.includes(EMOTE_KEY), RESERVED_KEYS.join(' '));
  const fresh = new Set();
  const input = { pressed: (k) => fresh.has(String(k).toLowerCase()) };
  const w = createWindows(null, input, { hud: { log() {}, toast() {} } });
  const all = [characterPanel, bagPanel, skillsPanel, abilitiesPanel, craftingPanel, mapPanel,
    settingsPanel, devPanel, dragonPanel, panel];
  for (const p of all) w.register(p);
  check('the whole game registers, and the wheel keeps the key it asked for',
    w.keyOf('emotes') === EMOTE_KEY, String(w.keyOf('emotes')));
  const keys = all.map((p) => w.keyOf(p.id)).filter(Boolean);
  check('no panel lost its key to another', keys.length === new Set(keys).size, keys.join(' '));
  check('and the keys are the ones the opening line promises',
    keys.sort().join(' ') === ['b', 'c', 'escape', 'f2', 'k', 'm', 'n', 'p', 'v', 'x'].join(' '), keys.join(' '));

  fresh.clear(); fresh.add('x');
  w.update(0);
  check('pressing X opens the wheel', w.isOpen('emotes') === true, w.openIds.join(','));
  fresh.clear(); fresh.add('x');
  w.update(0);
  check('and pressing it again shuts it', w.isOpen('emotes') === false, w.openIds.join(','));
  fresh.clear(); fresh.add('x');
  w.update(0);
  fresh.clear(); fresh.add(ESCAPE_KEY);
  w.update(0);
  check('Escape shuts it too', w.isOpen('emotes') === false, w.openIds.join(','));

  // it is a window like any other: opening the codex takes it off the screen
  fresh.clear(); fresh.add('x'); w.update(0);
  fresh.clear(); fresh.add('c'); w.update(0);
  check('and opening the character page closes it, one window at a time',
    w.isOpen('emotes') === false && w.isOpen('character') === true, w.openIds.join(','));
}

console.log('win_emotes: the wheel opens in the middle of the screen');
{
  const frame = document.createElement('div');
  panel.open({ windows: { frameOf: (id) => (id === 'emotes' ? frame : null) } });
  check('open() centres its own frame rather than taking the cascade',
    frame.style.left === '50%' && frame.style.top === '50%' && /translate\(-50%, -50%\)/.test(frame.style.transform),
    `${frame.style.left} ${frame.style.top} ${frame.style.transform}`);
  let boom = null;
  try { panel.open({}); panel.open(null); } catch (e) { boom = e.message; }
  check('and it does not mind being opened with no window layer at all', boom === null, boom || '');
}

console.log(`\nwin_emotes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
