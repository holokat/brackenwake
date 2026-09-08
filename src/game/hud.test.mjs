// The HUD, counted. Run: node src/game/hud.test.mjs
//
// The farm shipped a HUD whose painted frame had three tool cells and whose
// TOOLS list had five entries. The two extra slots rendered with no position,
// stacked on the first, and the last one in the DOM ate every click, so tool
// switching was impossible for days. That bug was a mismatch between a list
// and a container, and this suite is the guard against it coming back: every
// row is flex and sized by its own list, and the hotkeys are that list's
// indices.
//
// The tool row itself is gone (T3). Nothing is taken in hand by clicking a
// cell, so the section that used to count its four slots now proves there is
// no row at all, that hud.js does not export a list of tools, and that keys 1
// to 4 belong to the ability bar and to nothing else.
//
// The second half runs the REAL createHud against a small fake document, so
// what is measured is what a player would get rather than a description of it.
// The shim is deliberately dumb: innerHTML is an opaque string, because the
// skeleton is built with createElement and nothing queries into markup.

// --- a document, small enough to read ---------------------------------------
//
// It counts. `document.made` is how many nodes have been created and
// `document.writes` is how many strings have been written into them, so "the
// effects row does not rebuild when nothing changed" is a measurement of two
// numbers before and after a frame rather than a claim about the code.
function makeDom() {
  const tally = { made: 0, writes: 0 };
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    let html = '';
    tally.made += 1;
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      title: '',
      get innerHTML() { return html; },
      // the real thing empties the node before it parses the markup
      set innerHTML(v) {
        for (const c of node.children) c.parent = null;
        node.children.length = 0;
        html = v == null ? '' : String(v);
        tally.writes += 1;
      },
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      // Faithful to the real thing: setting textContent EMPTIES the node. Panels
      // clear and rebuild with it, and a fake that only stored the string would
      // let a tab strip grow four copies of itself and call it a pass.
      set textContent(v) {
        for (const c of node.children) c.parent = null;
        node.children.length = 0;
        text = v == null ? '' : String(v);
        html = '';
        tally.writes += 1;
      },
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
      appendChild(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.push(c); return c;
      },
      remove() {
        if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; }
      },
      addEventListener(name, fn) { (node.listeners[name] ||= []).push(fn); },
      fire(name, ev) { for (const fn of node.listeners[name] || []) fn(ev); },
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
    get made() { return tally.made; },
    get writes() { return tally.writes; },
  };
}
globalThis.document = makeDom();
globalThis.setTimeout ||= () => 0;

const hudMod = await import('./hud.js');
const {
  MATERIALS, BAR_KEYS, BAR_SLOTS, POOLS, LOG_LINES, KEY_LABELS,
  poolView, sweep, costLabel, timerLabel, logTrim, createHud, UNLOCK_TOTAL,
  bannerAt, devLine, BANNER, BANNER_TOTAL,
  gainAt, GAIN, GAIN_TOTAL, GAIN_LINES, BURDEN_MARK, SKULL_MARK,
  RESOURCES, RESOURCE_ART, COIN_MARK, LOG_MARK, effectsView, initialsOf,
  STATUS_EFFECTS, EFFECT_COUNTDOWN_AT, statusRemaining,
  TOP_CENTRE, PLACE_H, COMPASS_SLOT_TOP, placeBox, boxesOverlap,
  LOG_POS_KEY, PURSE_POS_KEY, POOLS_POS_KEY, MINIMAP_POS_KEY, DRAG_THRESHOLD,
} = hudMod;
const { targetFrame } = await import('./targeting.js');
const { theme } = await import('./ui_theme.js');
const itemBarMod = await import('./item_bar.js');
// state.js runs its own audit at import and another agent is mid-flight on the
// items table it audits against. That is state.js's failure, reported by
// state.js's own suite, and it must not turn this one red. The two cross
// checks it feeds are skipped LOUDLY when it will not load, never silently.
let state = null, stateWhy = '';
try { state = await import('./state.js'); } catch (err) { stateWhy = err.message; }
const { ABILITIES_BY_ID } = await import('../mmo/abilities.js');
const runtime = await import('./abilities_runtime.js');
// hud.js's own source, for the checks that a thing was really taken out rather
// than merely stopped being called
const { readFileSync: readSrc } = await import('node:fs');
const { fileURLToPath: toPath } = await import('node:url');
const hudSrc = readSrc(toPath(new URL('./hud.js', import.meta.url)), 'utf8');
const minimapSrc = readSrc(toPath(new URL('./minimap.js', import.meta.url)), 'utf8');
const windowsSrc = readSrc(toPath(new URL('./windows.js', import.meta.url)), 'utf8');

let bad = 0, pass = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : bad++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const store = new Map();
const writes = [];
globalThis.localStorage = {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => { store.set(k, String(v)); writes.push({ k, v: String(v) }); },
  removeItem: (k) => { store.delete(k); },
};
globalThis.window = { innerWidth: 1280, innerHeight: 720 };
const styleOf = (n) => `left ${n.style.left || ''}, top ${n.style.top || ''}, right ${n.style.right || ''}, bottom ${n.style.bottom || ''}`;
const drag = (handle, x, y, dx, dy) => {
  handle.fire('pointerdown', { button: 0, pointerId: 1, clientX: x, clientY: y, stopPropagation() {} });
  handle.fire('pointermove', { pointerId: 1, clientX: x + dx / 3, clientY: y + dy / 3, preventDefault() {}, stopPropagation() {} });
  handle.fire('pointermove', { pointerId: 1, clientX: x + dx * 2 / 3, clientY: y + dy * 2 / 3, preventDefault() {}, stopPropagation() {} });
  handle.fire('pointermove', { pointerId: 1, clientX: x + dx, clientY: y + dy, preventDefault() {}, stopPropagation() {} });
  handle.fire('pointerup', { pointerId: 1, clientX: x + dx, clientY: y + dy, preventDefault() {}, stopPropagation() {} });
};
const press = (handle, x, y, dx, dy) => {
  handle.fire('pointerdown', { button: 0, pointerId: 1, clientX: x, clientY: y, stopPropagation() {} });
  handle.fire('pointermove', { pointerId: 1, clientX: x + dx, clientY: y + dy, preventDefault() {}, stopPropagation() {} });
  handle.fire('pointerup', { pointerId: 1, clientX: x + dx, clientY: y + dy, preventDefault() {}, stopPropagation() {} });
};

// --- the row that is gone (T3) ----------------------------------------------
console.log('hud: there is no tool row');
ck('hud.js exports no list of tools at all', hudMod.TOOLS === undefined, String(hudMod.TOOLS));
ck('and no way to draw one or to be told a cell was clicked',
  hudMod.createHud !== undefined && !('setTool' in hudMod) && !('onTool' in hudMod));
ck('the source has no tool row left in it: no id, no class, no handler',
  !/bw-tools/.test(hudSrc) && !/onToolPick/.test(hudSrc) && !/setTool\(/.test(hudSrc),
  [/bw-tools/, /onToolPick/, /setTool\(/].filter((re) => re.test(hudSrc)).join(' '));
if (!state) {
  console.log(`  SKIP the cross check against state.js: it will not import   ${stateWhy}`);
} else {
  ck('the purse shows every material state.js carries',
    JSON.stringify([...MATERIALS].sort()) === JSON.stringify([...state.MATERIALS].sort()),
    `hud ${MATERIALS.join(',')} vs state ${state.MATERIALS.join(',')}`);
}

// --- the bar's list ----------------------------------------------------------
console.log('hud: the ability bar list');
ck('twelve slots', BAR_SLOTS === 12 && BAR_KEYS.length === 12, BAR_KEYS.join(''));
ck('the keys are 1 to 0 then minus and equals',
  BAR_KEYS.join(',') === '1,2,3,4,5,6,7,8,9,0,-,=', BAR_KEYS.join(','));
ck('every key is distinct', new Set(BAR_KEYS).size === 12);
ck('the hud and the runtime read the same twelve keys',
  BAR_KEYS.join(',') === runtime.BAR_KEYS.join(','),
  `hud ${BAR_KEYS.join('')} vs runtime ${runtime.BAR_KEYS.join('')}`);
ck('and the same line for the amber corner, so the mark and the wording agree',
  BURDEN_MARK === runtime.BURDEN_MARK, `hud ${BURDEN_MARK} vs runtime ${runtime.BURDEN_MARK}`);
// 1 to 4 used to be contended: the tool row wanted them and so did the bar.
// The row is gone, so they are the bar's outright, and nothing else in the game
// is allowed to claim them.
ck('1 to 4 are the ability bar s own, and are the first four of its twelve',
  ['1', '2', '3', '4'].every((k, i) => BAR_KEYS[i] === k), BAR_KEYS.slice(0, 4).join(''));
ck('and no other bar on the HUD wants them',
  itemBarMod.ITEM_KEYS.every((k) => !BAR_KEYS.includes(k)),
  `item bar ${itemBarMod.ITEM_KEYS.join(',')}`);

// --- the pure views ----------------------------------------------------------
console.log('hud: pools');
ck('three pools, red then blue then yellow',
  POOLS.map((p) => p.id).join(',') === 'health,mana,stamina'
  && POOLS[0].colour.toLowerCase() === '#e04b3a' && POOLS[1].colour.toLowerCase() === '#4a8ff0'
  && POOLS[2].colour.toLowerCase() === '#e0bb3a',
  POOLS.map((p) => `${p.id} ${p.colour}`).join(', '));
{
  const v = poolView({ health: 60, maxHealth: 120, mana: 10, maxMana: 40, stamina: 0, maxStamina: 50 });
  ck('half health reads 0.5', v[0].pct === 0.5, `${v[0].value}/${v[0].max} = ${v[0].pct}`);
  ck('an empty pool is still drawn', v[2].pct === 0 && v[2].max === 50);
  ck('over-full health is clamped, not drawn past the end',
    poolView({ health: 999, maxHealth: 100 })[0].pct === 1);
  ck('a pool with no maximum is not drawn at all', poolView({ health: 5 }).length === 0);
}

console.log('hud: cooldown sweeps');
ck('a fresh 6 s cooldown is fully swept', sweep(6, 6) === 1);
ck('halfway is half', sweep(3, 6) === 0.5);
ck('ready is nothing', sweep(0, 6) === 0);
ck('an ability with no cooldown never sweeps', sweep(5, 0) === 0);
ck('a sweep never goes past full', sweep(99, 6) === 1);

console.log('hud: costs and timers');
ck('a stamina ability shows its stamina', costLabel(ABILITIES_BY_ID.powerStrike) === '15', costLabel(ABILITIES_BY_ID.powerStrike));
ck('a mana spell shows its mana', costLabel(ABILITIES_BY_ID.fireball) === '9', costLabel(ABILITIES_BY_ID.fireball));
ck('a free ability shows nothing', costLabel(ABILITIES_BY_ID.riposte) === '', `"${costLabel(ABILITIES_BY_ID.riposte)}"`);
ck('an item cost shows the count', costLabel(ABILITIES_BY_ID.bandage) === '1', costLabel(ABILITIES_BY_ID.bandage));
ck('long timers go to minutes', timerLabel(120) === '2m', timerLabel(120));
ck('whole seconds have no point', timerLabel(5.4) === '5' && timerLabel(11.6) === '12', `${timerLabel(5.4)} ${timerLabel(11.6)}`);
ck('under a second keeps a tenth', timerLabel(0.4) === '0.4');
ck('nothing left prints nothing', timerLabel(0) === '' && timerLabel(Infinity) === '');

console.log('hud: the log holds eight');
ck('eight lines is the limit', LOG_LINES === 8);
ck('trimming keeps the newest', logTrim([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 8).join(',') === '3,4,5,6,7,8,9,10');
ck('a short log is untouched', logTrim([1, 2], 8).join(',') === '1,2');

// --- the real HUD, in the fake document --------------------------------------
console.log('hud: the real createHud');
const hud = createHud(document.body);
const find = (node, pred) => {
  if (pred(node)) return node;
  for (const c of node.children) { const f = find(c, pred); if (f) return f; }
  return null;
};
const root = hud.el;
const barRow = find(root, (n) => n.id === 'bw-bar');
const logEl = find(root, (n) => n.id === 'bw-log');
const targetEl = find(root, (n) => n.id === 'bw-target');
const poolsEl = find(root, (n) => n.id === 'bw-pools');
const auraEl = find(root, (n) => n.id === 'bw-auras');

ck('the bar has exactly twelve cells and not thirteen', barRow.children.length === 12, String(barRow.children.length));
ck('and the built HUD has no tool row node in it at all',
  find(root, (n) => n.id === 'bw-tools') === null);
ck('the portrait plate is gone from the DOM',
  find(root, (n) => n.id === 'bw-portrait') === null);
ck('and the source no longer builds or writes that plate',
  !/id = 'bw-portrait'|mk\('div', 'bw-portrait'|appendChild\(node\)/.test(hudSrc));
ck('each cell wears its own key cap',
  barRow.children.map((c) => c.children[0].textContent).join(',')
  === BAR_KEYS.map((k) => KEY_LABELS[k] || k).join(','),
  barRow.children.map((c) => c.children[0].textContent).join(''));
ck('every cell starts empty', barRow.children.every((c) => c.classList.contains('empty')));

ck('every export the old contract names is still here',
  ['toast', 'setMaterials', 'setCoins', 'setPlace', 'setDev', 'setHint', 'el', 'dispose']
    .every((k) => hud[k] !== undefined));
ck('and the two that drew the tool row are gone, not left as no ops',
  hud.setTool === undefined && hud.onTool === undefined);
hud.setCoins(41);
ck('the purse still draws coins',
  find(root, (n) => n.id === 'bw-purse').children[0].children[1].textContent === '41',
  find(root, (n) => n.id === 'bw-purse').children[0].textContent);
hud.setPlace('Fern’s Stone');
ck('setPlace still writes the place', find(root, (n) => n.id === 'bw-place').textContent === 'Fern’s Stone');
hud.setDev(true);
ck('setDev still lights the badge', find(root, (n) => n.id === 'bw-dev').classList.contains('on'));
hud.setHint('press E');
ck('setHint still shows the hint', find(root, (n) => n.id === 'bw-hint').classList.contains('on'));
hud.toast('you found something', 'good');
ck('toast still lands in the toast column',
  find(root, (n) => n.id === 'bw-toasts').children.length === 1);
ck('the purse and place panels no longer get HUD pseudo corner brackets',
  !/#bw-hud \.panel::before/.test(hudSrc) && !/#bw-hud \.panel::after/.test(hudSrc));
ck('the minimap frame no longer draws corner images or pseudo brackets',
  !/cornerUrl/.test(minimapSrc) && !/#bw-hud #bw-minimap::before/.test(minimapSrc));
ck('the standalone window frame no longer uses the global ornate border image',
  /#bw-windows \.bw-win-plain \.bw-frame[\s\S]*border-image: none/.test(windowsSrc));

// the log
for (let i = 1; i <= 12; i++) hud.log(`line ${i}`, i % 2 ? 'good' : 'bad');
ck('the log keeps the last eight and drops the rest',
  hud.lines.join(',') === 'line 5,line 6,line 7,line 8,line 9,line 10,line 11,line 12', hud.lines.join(','));
ck('the log has eight rows in the DOM, not twelve', logEl.children.length === 8, String(logEl.children.length));
ck('a log line is text, not markup', logEl.children[0].textContent === 'line 5' && logEl.children[0].innerHTML === '');
ck('an empty line is refused rather than drawn blank', hud.log('') === null && logEl.children.length === 8);

// draggable HUD panels --------------------------------------------------------
console.log('hud: draggable HUD panels');
{
  const bottomLeft = find(root, (n) => n.id === 'bw-bl');
  const purseEl = find(root, (n) => n.id === 'bw-purse');
  bottomLeft.offsetWidth = 360; bottomLeft.offsetHeight = 180;
  purseEl.offsetWidth = 220; purseEl.offsetHeight = 34;
  poolsEl.offsetWidth = 236; poolsEl.offsetHeight = 60;
  const cases = [
    { name: 'log', handle: logEl, box: bottomLeft, key: LOG_POS_KEY, x: 60, y: 620, dx: 72, dy: -33 },
    { name: 'resource bar', handle: purseEl, box: purseEl, key: PURSE_POS_KEY, x: 30, y: 25, dx: 88, dy: 31 },
    { name: 'stats', handle: poolsEl, box: poolsEl, key: POOLS_POS_KEY, x: 40, y: 70, dx: 102, dy: 44 },
  ];
  for (const c of cases) {
    const beforeStyle = styleOf(c.box);
    const beforeWrites = writes.length;
    press(c.handle, c.x, c.y, DRAG_THRESHOLD - 1, 0);
    ck(`${c.name} small press stays put`,
      styleOf(c.box) === beforeStyle && writes.length === beforeWrites && !store.has(c.key),
      `${beforeStyle} -> ${styleOf(c.box)}, writes ${writes.length - beforeWrites}`);
    drag(c.handle, c.x, c.y, c.dx, c.dy);
    const afterStyle = styleOf(c.box);
    const saved = store.get(c.key) || '';
    ck(`${c.name} drag writes style and ${c.key}`,
      afterStyle !== beforeStyle && !!saved,
      `${beforeStyle} -> ${afterStyle}; ${c.key} ${saved}`);
    console.log(`       ${c.name}: ${beforeStyle} -> ${afterStyle}; ${c.key} ${saved}`);
  }

  let warped = 0;
  const map = hud.mountMinimap({
    field: null, player: { pos: { x: 0, z: 0 } }, camera: {},
    isDev: () => true, onWarp: () => { warped++; return { ok: true }; },
  });
  map.el.offsetWidth = 232; map.el.offsetHeight = 245;
  const beforeStyle = styleOf(map.el);
  const beforeWrites = writes.length;
  const map2 = hud.mountMinimap();
  ck('mounting the minimap twice still returns the same square', map2 === map);
  press(map.el, 300, 70, DRAG_THRESHOLD - 1, 0);
  ck('minimap small press on the frame stays put',
    styleOf(map.el) === beforeStyle && writes.length === beforeWrites && !store.has(MINIMAP_POS_KEY),
    `${beforeStyle} -> ${styleOf(map.el)}, writes ${writes.length - beforeWrites}`);
  drag(map.el, 300, 70, -70, 42);
  const afterStyle = styleOf(map.el);
  const saved = store.get(MINIMAP_POS_KEY) || '';
  ck('minimap frame drag writes style and bw_minimap_pos',
    afterStyle !== beforeStyle && !!saved,
    `${beforeStyle} -> ${afterStyle}; ${MINIMAP_POS_KEY} ${saved}`);
  ck('the minimap box reports the moved element',
    hud.minimapBox.left === JSON.parse(saved).x && hud.minimapBox.top === JSON.parse(saved).y,
    JSON.stringify(hud.minimapBox));
  map.el.fire('pointerdown', { target: map.el, clientX: 300, clientY: 70, stopPropagation() {} });
  ck('a frame press is not a map warp click', warped === 0, String(warped));
  map.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 220, height: 220 });
  const canvasStyle = styleOf(map.el);
  map.el.fire('pointerdown', { target: map.canvas, clientX: 55, clientY: 55, stopPropagation() {} });
  map.el.fire('pointermove', { target: map.canvas, clientX: 95, clientY: 95, preventDefault() {}, stopPropagation() {} });
  map.el.fire('pointerup', { target: map.canvas, clientX: 95, clientY: 95, preventDefault() {}, stopPropagation() {} });
  ck('a map press still goes to the map instead of the frame drag',
    warped === 1 && styleOf(map.el) === canvasStyle,
    `warps ${warped}, ${canvasStyle} -> ${styleOf(map.el)}`);
  console.log(`       minimap: ${beforeStyle} -> ${afterStyle}; ${MINIMAP_POS_KEY} ${saved}`);

  const hudReload = createHud(document.body);
  const reloadPurse = find(hudReload.el, (n) => n.id === 'bw-purse');
  const reloadPools = find(hudReload.el, (n) => n.id === 'bw-pools');
  const reloadLog = find(hudReload.el, (n) => n.id === 'bw-bl');
  const reloadMap = hudReload.mountMinimap({ field: null, player: { pos: { x: 0, z: 0 } }, camera: {} });
  ck('saved purse, stats, log and minimap positions are read on a fresh HUD',
    reloadPurse.style.left === purseEl.style.left
    && reloadPools.style.left === poolsEl.style.left
    && reloadLog.style.left === bottomLeft.style.left
    && reloadMap.el.style.right === map.el.style.right,
    `${styleOf(reloadPurse)} | ${styleOf(reloadPools)} | ${styleOf(reloadLog)} | ${styleOf(reloadMap.el)}`);
  hudReload.dispose();
}

// update: pools, target, bar
const bar = BAR_KEYS.map(() => ({ ability: null, cooldownLeft: 0, affordable: true }));
bar[0] = { ability: ABILITIES_BY_ID.powerStrike, cooldownLeft: 3, affordable: true, casting: false };
bar[11] = { ability: ABILITIES_BY_ID.fireball, cooldownLeft: 0, affordable: false, casting: false };
hud.update(0.016, {
  actor: { health: 30, maxHealth: 120, mana: 20, maxMana: 40, stamina: 50, maxStamina: 50 },
  target: { name: 'Skeleton', health: 15, maxHealth: 30, fraction: 0.5, colour: '#ffd23f', word: 'a fair fight', level: 'even', skull: false },
  bar,
  buffs: [{ name: 'Battle Cry', kind: 'buff', remaining: 11.4 }, { name: 'Hex', kind: 'debuff', remaining: 2 }],
});
ck('the pool box turns on when there are pools', poolsEl.classList.contains('on'));
ck('health draws a quarter full', poolsEl.children[0].children[0].style.width === '25.0%', poolsEl.children[0].children[0].style.width);
ck('and says the numbers', poolsEl.children[0].children[1].textContent === '30 / 120', poolsEl.children[0].children[1].textContent);
ck('mana is the second bar and is half', poolsEl.children[1].children[1].textContent === '20 / 40');
ck('the target frame turns on', targetEl.classList.contains('on'));
ck('it names the target and its health',
  find(targetEl, (n) => n.className === 'nm').textContent === 'Skeleton'
  && find(targetEl, (n) => n.className === 'n').textContent === '15 / 30');
ck('the frame takes the con colour it was handed',
  find(targetEl, (n) => n.className === 'nm').style.color === '#ffd23f');
ck('and prints the con word beside the health, in the same colour',
  find(targetEl, (n) => n.className === 'tr').textContent === 'a fair fight'
  && find(targetEl, (n) => n.className === 'tr').style.color === '#ffd23f',
  `"${find(targetEl, (n) => n.className === 'tr').textContent}" in ${find(targetEl, (n) => n.className === 'tr').style.color}`);
ck('slot 1 shows Power Strike, half swept',
  barRow.children[0].children[1].textContent === 'Power Strike'
  && barRow.children[0].children[3].style.height === '50%',
  `${barRow.children[0].children[1].textContent} @ ${barRow.children[0].children[3].style.height}`);
ck('slot 1 shows the seconds left over the sweep',
  barRow.children[0].children[4].textContent === '3' && barRow.children[0].children[4].classList.contains('on'));
ck('slot 12 shows Fireball with its cost in red',
  barRow.children[11].children[1].textContent === 'Fireball'
  && barRow.children[11].children[2].classList.contains('poor'), barRow.children[11].children[2].className);
ck('slot 1 cost is not red, because it is affordable', !barRow.children[0].children[2].classList.contains('poor'));
ck('a filled slot stops being empty', !barRow.children[0].classList.contains('empty'));
ck('an untouched slot is still empty', barRow.children[5].classList.contains('empty'));
ck('two aura icons, one buff one debuff, with timers',
  auraEl.children.length === 2 && auraEl.children[1].classList.contains('debuff')
  && auraEl.children[1].children[2].textContent === '2',
  `${auraEl.children.length} icons, last timer "${auraEl.children[1]?.children[2]?.textContent}"`);

// no target, no frame
hud.update(0.016, { actor: null, target: null, bar: null, buffs: [] });
ck('no target hides the frame again', !targetEl.classList.contains('on'));
ck('no actor hides the pools again', !poolsEl.classList.contains('on'));

// --- the con: the frame, the plate over the target, and the hint -------------
//
// The rule is con.js's and is counted there. What is counted HERE is what a
// player would see: three real monsters put through targetFrame with a real
// character, and the pixels the HUD writes for each.
console.log('hud: the con colour on every surface that names a monster');
{
  const plateEl = find(root, (n) => n.id === 'bw-plate');
  const hintEl = find(root, (n) => n.id === 'bw-hint');
  const nm = find(targetEl, (n) => n.className === 'nm');
  const tr = find(targetEl, (n) => n.className === 'tr');
  const wolf = { name: 'Wolf', tier: 2, health: 40, maxHealth: 40 };
  const three = [
    ['a fresh character', { skills: {} }, '#ff5a4d', 'it will kill you', true],
    // swordsmanship 50 is band 3, which reads as tier 2: a fresh opening, and
    // the wolf it is meant to meet in the Greenwold
    ['a middling one', { skills: { swordsmanship: 50 } }, '#ffd23f', 'a fair fight', false],
    ['a grandmaster', { skills: { swordsmanship: 100 } }, '#9aa0a6', 'no threat', false],
  ];
  for (const [who, character, colour, word, skull] of three) {
    const f = targetFrame(wolf, character);
    hud.update(0.016, { actor: null, target: f, bar: null, buffs: [] });
    ck(`the frame draws the wolf for ${who}: ${colour} and "${word}"`,
      nm.textContent === 'Wolf' && nm.style.color === colour && tr.textContent === word && tr.style.color === colour,
      `${nm.textContent} ${nm.style.color} "${tr.textContent}"`);
    const p = hud.setNameplate({ name: f.name, colour: f.colour, word: f.word, skull: f.skull, x: 640, y: 300 });
    ck(`the plate over its head matches, skull ${skull ? 'on' : 'off'}`,
      plateEl.classList.contains('on') && p.colour === colour
      && find(plateEl, (n) => n.className === 'nm').style.color === colour
      && plateEl.classList.contains('skull') === skull,
      `${p.colour} skull=${plateEl.classList.contains('skull')}`);
    const h = hud.setHint(`${f.name}, ${f.word}`, f.colour);
    ck(`and the hover hint reads "${wolf.name}, ${word}" in the same colour`,
      hintEl.textContent === `Wolf, ${word}` && hintEl.style.color === colour && hintEl.classList.contains('on'),
      `"${h.text}" in ${h.colour}`);
  }
  // the boss, which is purple whoever is looking
  const king = { name: 'the Ashen King', tier: 6, boss: true, health: 3200, maxHealth: 3200 };
  const kf = targetFrame(king, { skills: { swordsmanship: 100 } });
  hud.update(0.016, { actor: null, target: kf, bar: null, buffs: [] });
  hud.setNameplate({ name: kf.name, colour: kf.colour, word: kf.word, skull: kf.skull, x: 100, y: 100 });
  ck('a boss is purple in the frame and on the plate, with a skull, even to a grandmaster',
    nm.style.color === '#c07bf0' && tr.textContent === 'a boss'
    && plateEl.classList.contains('skull') && hud.nameplate.colour === '#c07bf0',
    `${nm.style.color} "${tr.textContent}"`);

  // the plate moves, and goes away
  hud.setNameplate({ name: 'Wolf', colour: '#ffd23f', word: 'a fair fight', skull: false, x: 12, y: 34 });
  ck('the plate is placed by transform, in whole pixels',
    plateEl.style.transform === 'translate(12px,34px) translate(-50%,-100%)', plateEl.style.transform);
  hud.setNameplate({ name: 'Wolf', colour: '#ffd23f', word: 'a fair fight', skull: false, x: 900.6, y: 12.2 });
  ck('and it follows without re-writing the words',
    plateEl.style.transform === 'translate(901px,12px) translate(-50%,-100%)', plateEl.style.transform);
  ck('null takes it down', hud.setNameplate(null) === null && !plateEl.classList.contains('on') && hud.nameplate === null);
  ck('a plate with no name is refused rather than drawn blank', hud.setNameplate({ colour: '#fff' }) === null);
  ck('the skull is drawn art, not a letter', plateEl.children[0].innerHTML === SKULL_MARK && SKULL_MARK.includes('<svg'));
  hud.setHint('press E');
  ck('a hint with no colour goes back to parchment', hintEl.style.color === theme.parchment, hintEl.style.color);
  hud.setHint('');
  ck('and an empty hint turns it off', !hintEl.classList.contains('on'));
}

// --- the zone banner, in seconds -------------------------------------------
console.log('hud: the zone banner');
ck('it fades in over 0.4 s, holds 2 s, and fades out over 0.6 s',
  BANNER.fadeIn === 0.4 && BANNER.hold === 2 && BANNER.fadeOut === 0.6,
  JSON.stringify(BANNER));
ck('so the whole thing is 3 s', BANNER_TOTAL === 3, String(BANNER_TOTAL));
ck('at 0 it is just starting', bannerAt(0).phase === 'in' && bannerAt(0).opacity === 0);
ck('at 0.2 s it is half faded in',
  bannerAt(0.2).phase === 'in' && Math.abs(bannerAt(0.2).opacity - 0.5) < 1e-9,
  `${bannerAt(0.2).phase} ${bannerAt(0.2).opacity}`);
ck('at 1 s it is held, full',
  bannerAt(1).phase === 'held' && bannerAt(1).opacity === 1, `${bannerAt(1).phase} ${bannerAt(1).opacity}`);
ck('at 2.4 s it is still up, and starting to go',
  bannerAt(2.39).phase === 'held' && bannerAt(2.41).phase === 'out');
ck('at 2.6 s it is two thirds of the way out',
  bannerAt(2.6).phase === 'out' && Math.abs(bannerAt(2.6).opacity - 2 / 3) < 1e-9,
  `${bannerAt(2.6).phase} ${bannerAt(2.6).opacity.toFixed(4)}`);
ck('at 3 s it is gone', bannerAt(3).phase === 'done' && bannerAt(3).opacity === 0);
ck('and it stays gone', bannerAt(90).phase === 'done');

const zoneEl = find(root, (n) => n.id === 'bw-zone');
{
  const said = hud.zone('Fern\u2019s Stone', 'meadow');
  ck('raising the banner says what it will show',
    said.name === 'Fern\u2019s Stone' && said.sub === 'meadow' && said.seconds === 3, JSON.stringify(said));
  ck('the banner turns on', zoneEl.classList.contains('on'));
  ck('with the place large and the kind under it',
    zoneEl.children[0].textContent === 'Fern\u2019s Stone' && zoneEl.children[2].textContent === 'meadow',
    `"${zoneEl.children[0].textContent}" over "${zoneEl.children[2].textContent}"`);
  ck('and a rule between them', zoneEl.children[1].className === 'zr');
  ck('it starts invisible', zoneEl.style.opacity === '0.000', zoneEl.style.opacity);
  hud.update(0.2, {});
  ck('at 0.2 s it is half there', zoneEl.style.opacity === '0.500', zoneEl.style.opacity);
  ck('and hud.zoneState agrees', hud.zoneState.phase === 'in' && Math.abs(hud.zoneState.t - 0.2) < 1e-9,
    `${hud.zoneState.phase} at ${hud.zoneState.t}`);
  hud.update(0.8, {});
  ck('at 1 s it is full', zoneEl.style.opacity === '1.000' && hud.zoneState.phase === 'held', zoneEl.style.opacity);
  hud.update(1.6, {});
  ck('at 2.6 s it is fading out', hud.zoneState.phase === 'out' && zoneEl.style.opacity === '0.667',
    `${hud.zoneState.phase} at ${zoneEl.style.opacity}`);
  ck('and it is still on screen while it fades', zoneEl.classList.contains('on'));
  hud.update(0.5, {});
  ck('at 3.1 s it is gone', !zoneEl.classList.contains('on') && hud.zoneState.phase === 'done');
  ck('and it stops counting once it is gone', hud.zoneState.t === 0);
}
{
  hud.zone('Barrow of the Grey Hand', 'dungeon, level 2');
  hud.update(2.0, {});
  ck('walking in again restarts it', hud.zoneState.phase === 'held');
  hud.zone('Barrow of the Grey Hand', 'dungeon, level 2');
  ck('from the beginning', hud.zoneState.t === 0 && hud.zoneState.opacity === 0);
  ck('a place with no name raises nothing', hud.zone('') === null && !zoneEl.classList.contains('on'));
  hud.zone('The Long Fen');
  ck('and a place with no kind still shows its name',
    zoneEl.children[0].textContent === 'The Long Fen' && zoneEl.children[2].style.display === 'none');
  hud.update(4, {});
}

// --- the unlock banner ------------------------------------------------------
console.log('hud: the unlock banner');
{
  const unlockEl = find(root, (n) => n.id === 'bw-unlock');
  ck('the banner exists in the skeleton, built once', !!unlockEl && !unlockEl.classList.contains('on'));
  ck('and it already carries the words that never change',
    unlockEl.children[0].textContent === "You've unlocked", unlockEl.children[0].textContent);

  const said = hud.unlock({ id: 'fireball', name: 'Fireball', key: 'Press 3' });
  ck('raising one says what it will show and for how long',
    said.name === 'Fireball' && said.key === 'Press 3'
    && Math.abs(said.seconds - UNLOCK_TOTAL) < 1e-9 && said.queued === 0, JSON.stringify(said));
  ck('it turns on at once', unlockEl.classList.contains('on'));
  ck('the ability name is under the frame', unlockEl.children[2].textContent === 'Fireball',
    unlockEl.children[2].textContent);
  ck('the key line is under that', unlockEl.children[3].textContent === 'Press 3', unlockEl.children[3].textContent);
  const art = unlockEl.children[1].children[0];
  ck('and the ability\'s own painting is in the frame, by id',
    typeof art.src === 'string' && /fireball/.test(art.src), art.src || 'no src');
  ck('it starts invisible and fades in on the frame clock', unlockEl.style.opacity === '0.000', unlockEl.style.opacity);
  hud.update(0.2, {});
  ck('at 0.2 s it is half there', unlockEl.style.opacity === '0.500', unlockEl.style.opacity);
  ck('and hud.unlockState agrees', hud.unlockState.phase === 'in' && hud.unlockState.name === 'Fireball',
    `${hud.unlockState.phase} ${hud.unlockState.name}`);

  // TWO AT ONCE QUEUE, they do not stack on each other
  const second = hud.unlock({ id: 'lightning', name: 'Lightning', key: 'Press 4' });
  ck('a second raised while the first is up is QUEUED, not drawn over it',
    second.queued === 1 && hud.unlockState.name === 'Fireball' && hud.unlockState.queued === 1,
    `showing ${hud.unlockState.name}, ${hud.unlockState.queued} behind`);
  // it is already 0.2 s in, so this stops 0.3 s short of the end
  hud.update(UNLOCK_TOTAL - 0.5, {});
  ck('the first is still the one on screen just before its time is up',
    hud.unlockState.name === 'Fireball' && hud.unlockState.phase === 'out',
    `${hud.unlockState.name} ${hud.unlockState.phase} at ${hud.unlockState.t.toFixed(2)}`);
  hud.update(0.4, {});
  ck('and the moment it ends the second takes the frame, from the beginning',
    hud.unlockState.name === 'Lightning' && hud.unlockState.t === 0 && hud.unlockState.queued === 0,
    `${hud.unlockState.name} at ${hud.unlockState.t}`);
  ck('with its own name and key drawn',
    unlockEl.children[2].textContent === 'Lightning' && unlockEl.children[3].textContent === 'Press 4',
    `${unlockEl.children[2].textContent} / ${unlockEl.children[3].textContent}`);
  hud.update(UNLOCK_TOTAL + 0.1, {});
  ck('and when the queue is empty the banner goes off',
    !unlockEl.classList.contains('on') && hud.unlockState.phase === 'done' && hud.unlockState.queued === 0);

  ck('one with no name raises nothing at all', hud.unlock({ name: '' }) === null && !unlockEl.classList.contains('on'));
  ck('and neither does nothing at all', hud.unlock(null) === null);

  // a row with no painting still shows something in the frame
  hud.unlock({ id: 'notARealAbility', name: 'Whatever', key: '' });
  ck('an ability with no art gets its initial rather than an empty box',
    unlockEl.children[1].children[1].textContent === 'W'
    && unlockEl.children[1].children[1].style.display === '',
    `"${unlockEl.children[1].children[1].textContent}"`);
  ck('and no key line is drawn when there is nothing to say',
    unlockEl.children[3].style.display === 'none', unlockEl.children[3].style.display);
  hud.update(UNLOCK_TOTAL + 1, {});
}

// --- the dev badge ----------------------------------------------------------
console.log('hud: the dev badge');
ck('with no numbers it just says fly mode', devLine() === 'fly mode', devLine());
ck('an unmeasured number is left out rather than printed as a zero',
  devLine({ fps: 59 }) === 'fly mode   59 fps', devLine({ fps: 59 }));
{
  const line = devLine({ fps: 58.6, frameMs: 17.1, draws: 212, tris: 1249000, monsters: 7 });
  ck('and every one it was given is there',
    /59 fps/.test(line) && /17.1 ms/.test(line) && /212 draws/.test(line)
    && /1249k tris/.test(line) && /7 alive/.test(line), line);
  ck('which is exactly the five main.js measures',
    line.split('   ').length === 6, line);
}
{
  const badge = find(root, (n) => n.id === 'bw-dev');
  hud.setDev(true, { fps: 60, draws: 100, tris: 500000, monsters: 3 });
  ck('the badge lights and carries the numbers',
    badge.classList.contains('on') && /60 fps/.test(badge.textContent) && /3 alive/.test(badge.textContent),
    badge.textContent);
  hud.setDev(true);
  ck('and setDev(true) on its own still works, as dev.js calls it',
    badge.classList.contains('on') && badge.textContent === 'fly mode', badge.textContent);
  hud.setDev(false);
  ck('setDev(false) puts it out', !badge.classList.contains('on'));
}

// --- the portrait plate ------------------------------------------------------
{
  const canvas = document.createElement('canvas');
  ck('setPortrait remains a no op for old callers',
    hud.setPortrait(canvas) === false && find(root, (n) => n.id === 'bw-portrait') === null);
}


// --- the item bar (U4) --------------------------------------------------------
// Same rule as the tool row and the ability bar: the container is built from
// one list and can never hold a cell that list does not name.
console.log('hud: the item bar');
{
  const itemRow = find(root, (n) => n.id === 'bw-items');
  ck('the item bar has exactly eight cells, one per item_bar.js slot',
    itemRow.children.length === itemBarMod.ITEM_SLOTS && itemRow.children.length === 8,
    String(itemRow.children.length));
  ck('and it sits on the same rail as the ability bar, to its right',
    itemRow.parent.id === 'bw-bars' && barRow.parent.id === 'bw-bars'
    && itemRow.parent.children.indexOf(itemRow) > itemRow.parent.children.indexOf(barRow),
    itemRow.parent.children.map((c) => c.id || c.className).join(' | '));
  ck('every cell wears its own key cap, F5 to F12',
    itemRow.children.map((c) => c.children[0].textContent).join(',') === 'F5,F6,F7,F8,F9,F10,F11,F12',
    itemRow.children.map((c) => c.children[0].textContent).join(','));
  ck('every cell starts empty', itemRow.children.every((c) => c.classList.contains('empty')));

  // the real view shape out of the real item bar, so what is drawn is what a
  // player would get rather than a hand written imitation of it
  const { createItemBar } = itemBarMod;
  const invMod = await import('./inventory.js');
  const items = await import('../mmo/items.js');
  const character = invMod.normalise({ stats: { str: 70 }, skills: {}, pack: { slots: 40, items: [] }, equipment: {} });
  const inventory = invMod.createInventory({ character });
  inventory.add(items.makeItem({ base: 'potion', count: 4 }));
  inventory.add(items.makeItem({ base: 'longsword' }));
  const itemBar = createItemBar({ character, inventory, guardKeys: false });
  itemBar.assign(0, { pack: 0 });
  itemBar.assign(1, { pack: 1 });

  hud.update(0.016, { items: itemBar.view() });
  ck('a stack draws its art and its count',
    /<svg|<img/.test(itemRow.children[0].children[1].innerHTML) && itemRow.children[0].children[2].textContent === '4',
    `${itemRow.children[0].children[1].innerHTML.slice(0, 40)} x${itemRow.children[0].children[2].textContent}`);
  ck('and stops being empty', !itemRow.children[0].classList.contains('empty'));
  ck('a single thing shows no count at all', itemRow.children[1].children[2].textContent === '',
    `"${itemRow.children[1].children[2].textContent}"`);
  ck('the rail between the two bars appears once there is something on the right',
    !find(root, (n) => n.className === 'rail off'), find(root, (n) => n.className.indexOf('rail') === 0)?.className);

  inventory.equip(1);
  hud.update(0.016, { items: itemBar.view() });
  ck('an equipped thing lights the cell and says where it went',
    itemRow.children[1].classList.contains('worn') && /on mainHand/.test(itemRow.children[1].children[3].textContent),
    itemRow.children[1].children[3].textContent);

  // the chosen tool (T3): the one cell that says which tool the work goes
  // through, drawn from the real bar rather than a hand written view
  inventory.add(items.makeItem({ base: 'pickaxe' }));
  itemBar.assign(4, 'pickaxe');
  itemBar.use(4);
  hud.update(0.016, { items: itemBar.view() });
  ck('the chosen tool lights its own cell, and only that one',
    itemRow.children[4].classList.contains('chosen')
    && itemRow.children.filter((c) => c.classList.contains('chosen')).length === 1,
    itemRow.children.map((c) => c.className).join(' | '));
  ck('and says on hover what being chosen means', /the tool you chose/.test(hud.itemTipFor(4)), hud.itemTipFor(4));
  itemBar.deselect();
  hud.update(0.016, { items: itemBar.view() });
  ck('putting the choice down puts the light out',
    !itemRow.children[4].classList.contains('chosen'), itemRow.children[4].className);

  inventory.remove({ pack: 0 }, 4);
  hud.update(0.016, { items: itemBar.view() });
  ck('a stack that runs out leaves a dimmed ghost, not an empty square',
    itemRow.children[0].classList.contains('ghost') && !itemRow.children[0].classList.contains('empty')
    && /<svg|<img/.test(itemRow.children[0].children[1].innerHTML),
    `${itemRow.children[0].className}, art ${itemRow.children[0].children[1].innerHTML.slice(0, 30)}`);
  ck('and the ghost says so on hover', /You have none left/.test(hud.itemTipFor(0)), hud.itemTipFor(0));

  let clicked = null;
  hud.onItem((slot, how) => { clicked = { slot, how }; });
  itemRow.children[3].fire('click');
  ck('a left click asks for a use', clicked && clicked.slot === 3 && clicked.how === 'use', JSON.stringify(clicked));
  itemRow.children[3].fire('contextmenu', { preventDefault() {} });
  ck('and a right click asks for a clear', clicked.how === 'clear', JSON.stringify(clicked));
  let dropped = null;
  hud.onItemDrop((slot, payload) => { dropped = { slot, payload }; });
  itemRow.children[5].fire('drop', {
    preventDefault() {},
    dataTransfer: { getData: () => JSON.stringify({ pack: 7 }) },
  });
  ck('a pack drag dropped on a cell arrives with the address windows.js sent',
    dropped && dropped.slot === 5 && dropped.payload.pack === 7, JSON.stringify(dropped));

  // the ability bar takes cards from the Abilities page the same way (2026-09-08)
  let abDrop = null, cleared = null, picked = null;
  hud.onAbilityDrop((slot, payload) => { abDrop = { slot, payload }; });
  hud.onBarClear((slot) => { cleared = slot; });
  hud.onBar((slot, empty) => { picked = { slot, empty }; });
  barRow.children[4].fire('drop', {
    preventDefault() {},
    dataTransfer: { getData: () => JSON.stringify({ ability: 'powerStrike' }) },
  });
  ck('an ability card dropped on a bar cell arrives with its id',
    abDrop && abDrop.slot === 4 && abDrop.payload.ability === 'powerStrike', JSON.stringify(abDrop));
  barRow.children[4].fire('contextmenu', { preventDefault() {} });
  ck('a right click on a bar cell asks for a clear', cleared === 4, String(cleared));
  barRow.children[4].fire('click');
  ck('a click on a bar cell reaches the handler and says whether the cell was empty',
    picked && picked.slot === 4 && typeof picked.empty === 'boolean', JSON.stringify(picked));
  // a filled cell is a drag source carrying its own slot; an empty one hands over nothing
  const dragCell = (cell) => {
    let payload = null, prevented = false;
    cell.fire('dragstart', { dataTransfer: { setData: (mime, s) => { payload = s; }, effectAllowed: '' }, preventDefault: () => { prevented = true; } });
    return { payload, prevented };
  };
  hud.update(0.016, { bar: [{ ability: { id: 'powerStrike', name: 'Power Strike', cost: { stamina: 15 } }, ready: true }] });
  const filled = dragCell(barRow.children[0]), empty = dragCell(barRow.children[11]);
  ck('a filled bar cell hands over its slot for a swap', filled.payload === JSON.stringify({ barSlot: 0 }), String(filled.payload));
  ck('and an empty one hands over nothing', empty.payload === null && empty.prevented === true, `${empty.payload} / ${empty.prevented}`);

  hud.update(0.016, { items: null });
  ck('and no item bar in the view empties the row rather than freezing it',
    itemRow.children.every((c) => c.classList.contains('empty')));
}

// --- the gains ticker (U4) ----------------------------------------------------
// The gain floaters used to spawn in the world at the player's own feet, which
// is exactly where the label of the thing you just picked up is drawn.
console.log('hud: the gains ticker');
ck('a gain line lives three seconds', GAIN_TOTAL === 3,
  `${GAIN.fadeIn} in + ${GAIN.hold} held + ${GAIN.fadeOut} out = ${GAIN_TOTAL}`);
ck('at 0 it is off to the right and invisible',
  gainAt(0).opacity === 0 && gainAt(0).x === GAIN.slidePx, JSON.stringify(gainAt(0)));
ck('at 0.125 s it is halfway in, and halfway home',
  gainAt(0.125).phase === 'in' && Math.abs(gainAt(0.125).opacity - 0.5) < 1e-9
  && Math.abs(gainAt(0.125).x - GAIN.slidePx / 2) < 1e-9, JSON.stringify(gainAt(0.125)));
ck('at 1 s it is held, full, and still', gainAt(1).phase === 'held' && gainAt(1).opacity === 1 && gainAt(1).x === 0);
ck('at 2.4 s it is still held and at 2.5 s it is going',
  gainAt(2.39).phase === 'held' && gainAt(2.41).phase === 'out',
  `${gainAt(2.39).phase} then ${gainAt(2.41).phase}`);
ck('at 2.7 s it is half faded',
  gainAt(2.7).phase === 'out' && Math.abs(gainAt(2.7).opacity - 0.5) < 1e-6, gainAt(2.7).opacity.toFixed(4));
ck('at 3 s it is done, and stays done', gainAt(3).phase === 'done' && gainAt(90).phase === 'done');
{
  const gainEl = find(root, (n) => n.id === 'bw-gains');
  ck('the ticker is its own box, bottom right, not in the bottom left column',
    !!gainEl && gainEl.parent === root && find(root, (n) => n.id === 'bw-bl').children.every((c) => c !== gainEl));
  hud.clearGains();
  const line = hud.gain('Swordsmanship 33.4', 'gain');
  ck('a gain raises one line', !!line && gainEl.children.length === 1 && gainEl.children[0].textContent === 'Swordsmanship 33.4',
    gainEl.children[0].textContent);
  ck('and it starts off to the right, invisible',
    gainEl.children[0].style.opacity === '0.000' && gainEl.children[0].style.transform === `translateX(${GAIN.slidePx.toFixed(1)}px)`,
    `${gainEl.children[0].style.opacity} at ${gainEl.children[0].style.transform}`);
  hud.gain('STR 66', 'stat');
  ck('a stat gain is a second line in its own colour',
    gainEl.children.length === 2 && gainEl.children[1].classList.contains('stat'), gainEl.children[1].className);
  hud.update(0.125, {});
  ck('at 0.125 s the first line is half in and has slid halfway home',
    gainEl.children[0].style.opacity === '0.500'
    && gainEl.children[0].style.transform === `translateX(${(GAIN.slidePx / 2).toFixed(1)}px)`,
    `${gainEl.children[0].style.opacity} at ${gainEl.children[0].style.transform}`);
  hud.update(0.875, {});
  ck('at 1 s it is full and home',
    gainEl.children[0].style.opacity === '1.000' && gainEl.children[0].style.transform === 'none',
    gainEl.children[0].style.transform);
  hud.update(1.7, {});
  ck('at 2.7 s it is half faded', gainEl.children[0].style.opacity === '0.500', gainEl.children[0].style.opacity);
  hud.update(0.35, {});
  ck('at 3.05 s both lines are gone, because both were raised on the same frame',
    gainEl.children.length === 0 && hud.gains.length === 0,
    `${gainEl.children.length} left`);
  // and now the same thing with a gap between them, which is the real case
  hud.gain('Tactics 41');
  hud.update(1.5, {});
  hud.gain('Anatomy 12');
  hud.update(1.6, {});
  ck('a line raised 1.5 s later outlives the first',
    hud.gains.length === 1 && hud.gains[0].text === 'Anatomy 12',
    hud.gains.map((g) => `${g.text} at ${g.t.toFixed(2)}`).join(', '));
  hud.update(1.5, {});
  ck('and then it goes too', hud.gains.length === 0 && gainEl.children.length === 0);
  ck('an empty gain is refused rather than drawn blank',
    hud.gain('') === null && hud.gain('   ') === null && gainEl.children.length === 0);
  for (let i = 0; i < GAIN_LINES + 4; i++) hud.gain(`gain ${i}`);
  ck('the ticker holds six at once and drops the oldest',
    hud.gains.length === GAIN_LINES && hud.gains[0].text === `gain 4`,
    `${hud.gains.length} lines, first "${hud.gains[0].text}"`);
  hud.clearGains();
  ck('and it can be emptied', hud.gains.length === 0 && gainEl.children.length === 0);
  ck('a frame with no gains at all does not touch the box', hud.update(1, {}) === undefined && gainEl.children.length === 0);
}

// --- G2: an ability you cannot fire because of what is in your hands ------------
{
  const greyBar = BAR_KEYS.map(() => ({ ability: null, cooldownLeft: 0, affordable: true }));
  greyBar[0] = {
    ability: ABILITIES_BY_ID.powerStrike, cooldownLeft: 0, affordable: true, casting: false,
    unusable: true, unusableReason: 'Power Strike wants a weapon in your hand, and your hands are empty.',
  };
  hud.update(0.016, { bar: greyBar });
  ck('the cell greys out', barRow.children[0].classList.contains('unusable'), barRow.children[0].className);
  ck('and the reason is in its tooltip to read', /hands are empty/.test(hud.tipFor(0)), hud.tipFor(0));
  ck('and not in a browser title, which would stack a second box on the styled one', !barRow.children[0].title, barRow.children[0].title);
  greyBar[0] = { ability: ABILITIES_BY_ID.powerStrike, cooldownLeft: 0, affordable: true, casting: false };
  hud.update(0.016, { bar: greyBar });
  ck('drawing the sword takes the grey off again, and the reason with it',
    !barRow.children[0].classList.contains('unusable') && !/hands are empty/.test(hud.tipFor(0)),
    hud.tipFor(0));
}

// --- C1: what the armour does to a spell, on the bar and in the tooltip --------
{
  const plate = runtime.burdenText(1);          // full platemail
  const leather = runtime.burdenText(0.1);      // full leather
  const bar = () => BAR_KEYS.map(() => ({ ability: null, cooldownLeft: 0, affordable: true }));

  const b = bar();
  b[0] = {
    ability: ABILITIES_BY_ID.fireball, cooldownLeft: 0, affordable: true, casting: false,
    burden: 1, burdenText: plate,
  };
  b[1] = {
    ability: ABILITIES_BY_ID.bless, cooldownLeft: 0, affordable: true, casting: false,
    burden: 0, burdenText: '',
  };
  hud.update(0.016, { bar: b });
  ck('Fireball in full plate says so in its tooltip',
    /mostly stops a spell/.test(hud.tipFor(0)) && /60 in 100 fizzle/.test(hud.tipFor(0)), hud.tipFor(0));
  ck('and the cell wears the amber corner',
    barRow.children[0].classList.contains('burdened'), barRow.children[0].className);
  ck('Bless in the same plate says nothing, because a paladin casts in it',
    !/fizzle/.test(hud.tipFor(1)) && !barRow.children[1].classList.contains('burdened'),
    `${hud.tipFor(1)} | ${barRow.children[1].className}`);
  ck('the description is still there under the name',
    /It lands hot and keeps burning/.test(hud.tipFor(0)), hud.tipFor(0));

  // The same slot, in cloth: the line goes, and so does the corner.
  b[0] = { ability: ABILITIES_BY_ID.fireball, cooldownLeft: 0, affordable: true, casting: false, burden: 0, burdenText: '' };
  hud.update(0.016, { bar: b });
  ck('taking the plate off takes the line off with it',
    !/fizzle/.test(hud.tipFor(0)), hud.tipFor(0));
  ck('and the amber corner too', !barRow.children[0].classList.contains('burdened'), barRow.children[0].className);

  // Leather is under the mark: a line to read, no corner to see.
  b[0] = { ability: ABILITIES_BY_ID.fireball, cooldownLeft: 0, affordable: true, casting: false, burden: 0.1, burdenText: leather };
  hud.update(0.016, { bar: b });
  ck('leather is worth a line but not a corner',
    /a little/.test(hud.tipFor(0)) && !barRow.children[0].classList.contains('burdened'),
    `${hud.tipFor(0)} | ${barRow.children[0].className}`);

  // and the panel itself, which is what a player actually reads
  b[0] = { ability: ABILITIES_BY_ID.fireball, cooldownLeft: 0, affordable: true, casting: false, burden: 1, burdenText: plate };
  hud.update(0.016, { bar: b });
  barRow.children[0].fire('pointerenter');
  const panel = find(document.body, (n) => n.id === 'bw-abtip');
  const body = panel.children.find((c) => c.className === 'body');
  const burdenEl = body.children.find((c) => c.className === 'burden');
  ck('the hovered panel shows the burden as its own line, under the description',
    !!burdenEl && burdenEl.hidden === false && /mostly stops a spell/.test(burdenEl.textContent),
    burdenEl ? burdenEl.textContent : 'no burden line in the panel');
  ck('and it sits between the description and the red refusal',
    body.children.map((c) => c.className).join(',') === 'head,chips,desc,burden,reason',
    body.children.map((c) => c.className).join(','));
  barRow.children[0].fire('pointerleave');
}

// --- the purse: four pictures and four numbers, and not one word ------------
//
// The counters read "562 GOLD  0/150 WOOD  0/150 STONE  0/150 ORE", which is
// four words of uppercase Cinzel taking more room than the numbers. What is
// counted here is that the word has left the flow and gone onto the title,
// that every cell really carries a picture, and that the fallback chain the
// user's art will land in front of actually runs.
console.log('hud: the purse is pictures');
{
  const purseEl = find(root, (n) => n.id === 'bw-purse');
  ck('four cells: the coins and the three materials state.js carries',
    purseEl.children.length === 4 && RESOURCES.join(',') === `gold,${MATERIALS.join(',')}`,
    RESOURCES.join(','));
  for (let i = 0; i < RESOURCES.length; i++) {
    const id = RESOURCES[i];
    const cell = purseEl.children[i];
    const ic = cell.children[0];
    const img = ic.children[0];
    ck(`${id} draws a picture, an img or an svg`,
      (img && img.tagName === 'IMG') || /<svg/.test(ic.innerHTML),
      img ? `${img.tagName} ${img.src}` : ic.innerHTML.slice(0, 30));
    ck(`${id} tries the user's own art first`,
      !img || String(img.src).endsWith(`icons/hud/${id}.webp`), img && img.src);
    ck(`${id} keeps its word on the title, not in the row`,
      cell.title === RESOURCE_ART[id].label && !/[a-z]/i.test(cell.textContent),
      `title "${cell.title}" flow "${cell.textContent}"`);
  }
  // the fallback: gold has one candidate, so one failure lands on the drawing
  const goldIc = purseEl.children[0].children[0];
  goldIc.children[0].fire('error');
  ck('gold with no art file falls back to the drawn coin',
    goldIc.children.length === 0 && goldIc.innerHTML === COIN_MARK,
    goldIc.innerHTML.slice(0, 40));
  // wood has two, so the first failure steps to the game's own oak log
  const woodIc = purseEl.children[1].children[0];
  woodIc.children[0].fire('error');
  ck('wood with no hud art steps to the oak log rather than giving up',
    String(woodIc.children[0].src).endsWith('icons/items/oak-log.webp'), woodIc.children[0].src);
  woodIc.children[0].fire('error');
  ck('and only then to the drawn log',
    woodIc.children.length === 0 && woodIc.innerHTML === LOG_MARK, woodIc.innerHTML.slice(0, 40));

  // the numbers, and the silence when they do not move
  hud.setCoins(562);
  hud.setMaterials({ wood: 12, stone: 0, ore: 150 }, { wood: 150, stone: 150, ore: 150 });
  ck('the numbers are beside the pictures',
    purseEl.children[0].children[1].textContent === '562'
    && purseEl.children[1].children[1].textContent === '12/150',
    purseEl.children.map((c) => c.children[1].textContent).join(' '));
  ck('a full material still goes amber', purseEl.children[3].classList.contains('full')
    && !purseEl.children[1].classList.contains('full'));
  const before = document.writes;
  hud.setCoins(562);
  hud.setMaterials({ wood: 12, stone: 0, ore: 150 }, { wood: 150, stone: 150, ore: 150 });
  ck('drawing the same purse again writes nothing at all',
    document.writes === before, `${document.writes - before} writes`);
  hud.setCoins(563);
  ck('and one coin moving writes exactly one string',
    document.writes === before + 1, `${document.writes - before} writes`);
}

// --- the effects row ---------------------------------------------------------
//
// Five different places can put something on the player and none of them knew
// about the others: actor.buffs through the runtime's buffsView, actor.status
// through combat.js, the four states written straight onto the actor, and the
// bandage, which is a cast and is therefore in none of them. Each source is
// driven here, and each is driven OFF again, because a square that appears and
// will not leave is worse than no square.
console.log('hud: the effects row');
{
  const auras = () => auraEl.children.filter((c) => c.style.display !== 'none');
  const S = { nowS: 100, nowMs: 100000 };
  const stone = ABILITIES_BY_ID.stoneSkin;
  const curse = ABILITIES_BY_ID.curseOfWeakness;

  hud.update(0.016, { ...S, buffs: [{ id: 'stoneSkin:100', abilityId: 'stoneSkin', name: 'Stone Skin', kind: 'buff', remaining: 12 }] });
  let cells = auras();
  ck('a buff on the player is one square, and the row turns on',
    cells.length === 1 && auraEl.classList.contains('on'), `${cells.length} squares`);
  ck('it wears the ability own painting',
    /icons\/abilities\/stoneSkin\.webp/.test(cells[0].children[0].innerHTML),
    cells[0].children[0].innerHTML.slice(0, 60));
  ck('a buff has the gold edge, which is the absence of the red one',
    !cells[0].classList.contains('debuff'), cells[0].className);
  ck('over ten seconds left it prints no number, the bar says enough',
    cells[0].children[2].textContent === '' && EFFECT_COUNTDOWN_AT === 10);
  ck('the bar is full on the frame it lands', cells[0].children[3].style.width === '100.0%',
    cells[0].children[3].style.width);
  ck('the name and the ability own line are on the hover',
    cells[0].el === undefined && cells[0].title === `Stone Skin. ${stone.description}`, cells[0].title);

  // the same square, later: the bar drains and the seconds appear
  hud.update(0.016, { ...S, nowS: 106, buffs: [{ id: 'stoneSkin:100', abilityId: 'stoneSkin', name: 'Stone Skin', kind: 'buff', remaining: 6 }] });
  cells = auras();
  ck('six of twelve seconds left drains the bar to half',
    cells[0].children[3].style.width === '50.0%', cells[0].children[3].style.width);
  ck('and under ten seconds the number appears',
    cells[0].children[2].textContent === '6', `"${cells[0].children[2].textContent}"`);

  // and the frame it ends, it is gone
  hud.update(0.016, { ...S, buffs: [{ id: 'stoneSkin:100', abilityId: 'stoneSkin', name: 'Stone Skin', kind: 'buff', remaining: 0 }] });
  ck('the frame it expires the square is gone and the row is off',
    auras().length === 0 && !auraEl.classList.contains('on'), `${auras().length} squares`);

  // a debuff is red
  hud.update(0.016, { ...S, buffs: [{ id: 'c:1', abilityId: 'curseOfWeakness', name: 'Curse of Weakness', kind: 'debuff', remaining: 15 }] });
  cells = auras();
  ck('a debuff wears the red edge',
    cells.length === 1 && cells[0].classList.contains('debuff'), cells[0].className);
  ck('and says what it does on hover',
    cells[0].title === `Curse of Weakness. ${curse.description}`, cells[0].title);

  // a passive is not an effect and never gets a square
  hud.update(0.016, {
    ...S,
    actor: { passives: { arcaneMastery: { spellPower: 0.1 }, riposte: {} } },
    buffs: [{ id: 'a:1', abilityId: 'arcaneMastery', name: 'Arcane Mastery', kind: 'buff', remaining: Infinity }],
  });
  ck('a passive gets no square, even handed to the row as a buff',
    auras().length === 0, `${auras().length} squares`);

  // Sprint: a held buff with no end. It shows, with no number and a full bar.
  hud.update(0.016, { ...S, buffs: [{ id: 's:1', abilityId: 'sprint', name: 'Sprint', kind: 'buff', remaining: Infinity }] });
  cells = auras();
  ck('Sprint, held with no duration, still gets its square',
    cells.length === 1 && cells[0].classList.contains('held'), cells[0].className);
  ck('a held effect counts nothing down',
    cells[0].children[2].textContent === '' && cells[0].children[3].style.width === '100%',
    `"${cells[0].children[2].textContent}" ${cells[0].children[3].style.width}`);

  // Meditate and Hide are not buffs at all: they are states on the actor
  hud.update(0.016, { ...S, actor: { meditating: { since: 90 }, hidden: { abilityId: 'hide' } }, buffs: [] });
  ck('sitting to meditate and going to ground are two squares',
    auras().length === 2, auras().map((c) => c.title.split('.')[0]).join(', '));
  ck('and they are the right two, with the right art',
    /meditate\.webp/.test(auras()[0].children[0].innerHTML) && /hide\.webp/.test(auras()[1].children[0].innerHTML),
    auras().map((c) => c.title.split('.')[0]).join(', '));
  hud.update(0.016, { ...S, actor: {}, buffs: [] });
  ck('standing up and being seen takes both squares away', auras().length === 0);

  // The bandage: a cast, and nowhere else in the game. The record the runtime
  // keeps is FLAT: `abilityId` and `name`, and no `ability` object, which the
  // first draft of effectsView read. The shape here is the shape a real cast
  // has, and the section below drives the real runtime to prove it.
  hud.update(0.016, {
    ...S, actor: {}, buffs: [],
    binding: { abilityId: 'bandage', name: 'Bandage', startedAt: 99, endsAt: 103, castTime: 4, rooted: true },
  });
  cells = auras();
  ck('a bandage being bound is a square while the cast runs',
    cells.length === 1 && /bandage\.webp/.test(cells[0].children[0].innerHTML), `${cells.length} squares`);
  ck('and three of its four seconds left is three quarters of a bar and a 3',
    cells[0].children[3].style.width === '75.0%' && cells[0].children[2].textContent === '3',
    `${cells[0].children[3].style.width} "${cells[0].children[2].textContent}"`);
  hud.update(0.016, { ...S, actor: {}, buffs: [], binding: null });
  ck('letting go of the bandage takes the square with it', auras().length === 0);

  // poison, on the OTHER clock: combat.js writes `until` in milliseconds
  hud.update(0.016, { ...S, actor: { status: { poison: { level: 2, until: 108000, seconds: 12 } } }, buffs: [] });
  cells = auras();
  ck('poison is a square, from actor.status and the frame milliseconds',
    cells.length === 1 && cells[0].classList.contains('debuff'), `${cells.length} squares`);
  ck('eight of its twelve seconds are left, which is two thirds of the bar',
    cells[0].children[3].style.width === '66.7%', cells[0].children[3].style.width);
  ck('it says what poison does, in words',
    cells[0].title === `Poisoned. ${STATUS_EFFECTS.poison.line}`, cells[0].title);
  ck('and the seconds clock is not used for it',
    statusRemaining({ until: 108000 }, 100000) === 8, String(statusRemaining({ until: 108000 }, 100000)));
  hud.update(0.016, { ...S, actor: { status: { poison: { level: 2, until: 100000, seconds: 12 } } }, buffs: [] });
  ck('a poison that has run out is off the row the same frame', auras().length === 0);

  // everything at once, and then the same frame twice
  const busy = {
    ...S,
    actor: { meditating: { since: 90 }, status: { bleed: { until: 104000, seconds: 6 } } },
    buffs: [{ id: 's:1', abilityId: 'sprint', name: 'Sprint', kind: 'buff', remaining: Infinity }],
  };
  hud.update(0.016, busy);
  ck('three at once is three squares, and the set is stable', auras().length === 3,
    auras().map((c) => c.title.split('.')[0]).join(', '));
  const made = document.made, writes = document.writes;
  hud.update(0.016, busy);
  ck('the same three effects again make no new node',
    document.made === made, `${document.made - made} nodes`);
  ck('and write nothing, because not one number moved',
    document.writes === writes, `${document.writes - writes} writes`);
  hud.update(0.016, { ...busy, actor: { ...busy.actor, status: { bleed: { until: 103000, seconds: 6 } } } });
  ck('a second off the bleed writes exactly one string, the seconds',
    document.writes === writes + 1, `${document.writes - writes} writes`);
  hud.update(0.016, { ...S, actor: {}, buffs: [] });
  ck('and clearing everything hides the squares rather than destroying them',
    auras().length === 0 && auraEl.children.length >= 3, `${auraEl.children.length} kept`);
}

// --- the same row, driven by the REAL abilities runtime ----------------------
//
// Everything above hands the row records this file wrote. That is exactly how
// the first draft came to read `cast.ability.id` off a record that has no
// `ability` on it at all: the test agreed with the code and both were wrong.
// So a real runtime casts real abilities here and the row draws what it says.
console.log('hud: the effects row, from the real runtime');
{
  const auras = () => auraEl.children.filter((c) => c.style.display !== 'none');
  const skills = {};
  for (const k of ['magery', 'meditation', 'healing', 'anatomy', 'hiding', 'stealth', 'focus', 'tactics',
    'swordsmanship', 'resistingSpells', 'evaluatingIntelligence', 'inscription', 'mysticism']) skills[k] = 100;
  const player = {
    speed: 0, yaw: 0, airborne: false, pos: { x: 0, y: 0, z: 0 },
    state: { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, peakY: 0 },
    parts: {}, teleport() {},
  };
  const actor = {
    id: 'player', name: 'You', faction: 'player', pos: player.pos,
    health: 200, maxHealth: 200, mana: 200, maxMana: 200, stamina: 200, maxStamina: 200,
    buffs: [], status: {}, weapon: { skill: 'swordsmanship' },
  };
  const character = { skills, stats: { str: 100, dex: 100, int: 100, con: 100, wis: 100 }, bar: [], items: { bandage: 10 } };
  const ab = runtime.createAbilities({
    character, actor, player,
    hud: { log() {}, toast() {}, gain() {} },
    combat: { queueSpell() {}, queueSwing() {} },
    monsters: {}, effects: { colourFor: () => 0, cast() {}, stopCast() {} },
    floaters: { spawn() {} }, audio: { play() {} }, rng: () => 0.5, heightAt: () => 0,
  });
  const frame = (t) => hud.update(0.016, {
    actor, nowS: t, nowMs: t * 1000,
    buffs: ab.buffsView(t), binding: ab.channelling,
  });

  ab.useById('stoneSkin', 0);
  ab.update(0.6, 0.6);
  frame(0.6);
  ck('a real Stone Skin, cast and landed, is a square with its own art',
    auras().length === 1 && /stoneSkin\.webp/.test(auras()[0].children[0].innerHTML),
    `${auras().length} squares`);
  ck('and the runtime measures its twelve seconds, not this file',
    Math.abs(ab.buffsView(0.6)[0].remaining - 12) < 1e-9, String(ab.buffsView(0.6)[0].remaining));
  ab.update(0.1, 13);
  frame(13);
  ck('when the runtime drops it, the square goes with it', auras().length === 0);

  ab.useById('sprint', 13);
  frame(13);
  ck('a real Sprint is held, with no number counting down',
    auras().length === 1 && auras()[0].classList.contains('held')
    && auras()[0].children[2].textContent === '',
    `${auras().length} squares, "${auras()[0]?.children[2]?.textContent}"`);
  ck('and the runtime really does hand back an endless remaining',
    ab.buffsView(13)[0].remaining === Infinity, String(ab.buffsView(13)[0].remaining));

  ab.useById('bandage', 20);
  frame(21);
  const binding = auras().find((c) => /bandage\.webp/.test(c.children[0].innerHTML));
  ck('a real bandage being bound is a square while its cast runs',
    !!binding && ab.channelling && ab.channelling.abilityId === 'bandage',
    ab.channelling ? `channelling ${ab.channelling.abilityId}` : 'nothing channelling');
  ck('with three of its four seconds left on the bar',
    !!binding && binding.children[3].style.width === '75.0%' && binding.children[2].textContent === '3',
    binding ? `${binding.children[3].style.width} "${binding.children[2].textContent}"` : 'no square');
  ck('THE CAST RECORD IS FLAT: abilityId and name, and no ability object',
    ab.channelling.ability === undefined && typeof ab.channelling.abilityId === 'string',
    Object.keys(ab.channelling).slice(0, 5).join(','));
}

// --- effectsView, on its own -------------------------------------------------
console.log('hud: effectsView gathers all five sources and no sixth');
{
  ck('nothing running is an empty list', effectsView({}).length === 0);
  ck('an expired buff never reaches the row',
    effectsView({ buffs: [{ id: 'x', abilityId: 'stoneSkin', name: 'Stone Skin', kind: 'buff', remaining: 0 }] }).length === 0);
  ck('a passive is refused by id, whatever it is called',
    effectsView({ buffs: [{ id: 'x', abilityId: 'riposte', name: 'Riposte', kind: 'buff', remaining: 10 }] }).length === 0);
  const one = effectsView({ nowS: 10, actor: { absorb: { abilityId: 'manaShield', until: 22 } } });
  ck('Mana Shield, which is an absorb and not a buff, is on the row',
    one.length === 1 && one[0].abilityId === 'manaShield' && one[0].remaining === 12,
    JSON.stringify(one.map((e) => [e.abilityId, e.remaining])));
  ck('it takes its duration from the ability own line', one[0].duration === 15, String(one[0].duration));
  const two = effectsView({ nowS: 10, actor: { enchant: { abilityId: 'consecrateWeapon', until: Infinity } } });
  ck('a weapon enchant with no end is held rather than dropped',
    two.length === 1 && two[0].remaining === Infinity);
  ck('initials stand in when there is no picture and no mark',
    initialsOf('Battle Cry') === 'BC' && initialsOf('') === '');
  // the same effect from two sources is one square, not two
  const dup = effectsView({
    nowS: 10,
    actor: { hidden: { abilityId: 'hide' } },
    buffs: [{ id: 'state:hidden', abilityId: 'hide', name: 'Hide', kind: 'buff', remaining: 5 }],
  });
  ck('one thing running is one square however many places keep it',
    dup.filter((e) => e.abilityId === 'hide').length <= 2 && dup.length === 2,
    dup.map((e) => e.key).join(' '));
}

// --- every status combat.js can apply has words on the row -------------------
//
// "If the fix is add it to the other four, add the check that fails loudly
// when a fifth appears." STATUS_EFFECTS is that list, and this is that check:
// the two files that write actor.status are read, and a status with no entry
// here is a failure rather than a square with an id in it.
console.log('hud: every status has words');
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name.endsWith('.js')) files.push(join(dir, e.name));
    }
  };
  walk(here);
  const src = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  const ids = new Set();
  for (const m of src.matchAll(/(?:applyStatus|statusOn)\??\.?\([^,]+,\s*'([a-zA-Z]+)'/g)) ids.add(m[1]);
  ck(`the game applies ${ids.size} named statuses, across ${files.length} files`, ids.size === 4, [...ids].sort().join(' '));
  const missing = [...ids].filter((id) => !STATUS_EFFECTS[id]);
  ck('and every one of them has a name and a line on the row', missing.length === 0, missing.join(','));
  ck('every entry has a mark, a colour and words',
    Object.values(STATUS_EFFECTS).every((s) => s.name && s.mark && s.colour && s.line));
}

// --- the top centre column stacks, it does not overlap -----------------------
//
// The compass strip used to be dropped at a fixed 38px from the top of the
// HUD, which is inside the place plate's own box, so its coordinates ran
// through MARLFIELD. The plate, the strip and the target frame are one column
// now. This measures the boxes, including the coordinate readout at the far
// right of the strip, against a place name far longer than any the game has.
console.log('hud: the top centre column');
{
  const { coordBox, COMPASS_STRIP_W, COMPASS_H, COMPASS_SIDE_W } = await import('./compass.js');
  ck('the plate is 33.55px tall: one 13px line in a 7px panel',
    Math.abs(PLACE_H - 33.55) < 1e-9, String(PLACE_H));
  ck('the strip starts below it, with the column gap between',
    COMPASS_SLOT_TOP === TOP_CENTRE.top + PLACE_H + TOP_CENTRE.gap
    && COMPASS_SLOT_TOP > TOP_CENTRE.top + PLACE_H, String(COMPASS_SLOT_TOP));
  for (const [w, name] of [[1280, 'MARLFIELD'], [1920, 'THE GREAT NORTHERN WOODLANDS OF MARLFIELD'], [900, 'high ground']]) {
    const plate = placeBox(name, w);
    const coords = coordBox(w, COMPASS_SLOT_TOP);
    ck(`"${name}" at ${w} wide does not touch the coordinates`,
      !boxesOverlap(plate, coords),
      `plate ${plate.left.toFixed(0)}..${plate.right.toFixed(0)} x ${plate.top}..${plate.bottom.toFixed(1)}, `
      + `coords ${coords.left.toFixed(0)}..${coords.right.toFixed(0)} x ${coords.top.toFixed(1)}..${coords.bottom.toFixed(1)}`);
  }
  // and the horizontal alone would clear it for a name the game really uses
  const plate = placeBox('MARLFIELD', 1280);
  const coords = coordBox(1280, COMPASS_SLOT_TOP);
  ck('MARLFIELD does not even reach the coordinate column sideways',
    plate.right < coords.left, `${plate.right.toFixed(0)} vs ${coords.left.toFixed(0)}`);
  ck('the readout is the far right cell of the strip',
    coords.right === 1280 / 2 + COMPASS_STRIP_W / 2 && coords.width === COMPASS_SIDE_W
    && coords.height === COMPASS_H);
  ck('the box arithmetic itself is checked both ways',
    boxesOverlap({ left: 0, right: 10, top: 0, bottom: 10 }, { left: 9, right: 20, top: 9, bottom: 20 })
    && !boxesOverlap({ left: 0, right: 10, top: 0, bottom: 10 }, { left: 10, right: 20, top: 0, bottom: 10 }));
  // and the HUD really does build the slot the compass is meant to mount into
  ck('the HUD builds a compass slot in the column, between the plate and the frame',
    !!hud.compassSlot && hud.compassSlot.id === 'bw-compass-slot'
    && hud.compassSlot.parent.id === 'bw-tc'
    && hud.compassSlot.parent.children.map((c) => c.id).join(',') === 'bw-place,bw-compass-slot,bw-target',
    hud.compassSlot?.parent?.children.map((c) => c.id).join(','));
}

// --- the two things the HUD can be (ED4) -------------------------------------
//
// The world editor takes the whole screen, so entering it puts the gameplay HUD
// away and leaving it puts the HUD back. "Back" has to mean back: this snapshots
// the display of every child of the HUD root, switches both ways, and compares
// the snapshots. A restore that is nearly right is the kind of bug a player
// finds three sessions later with a missing health bar.
console.log('hud: editor mode puts the HUD away and gives it back');
{
  const shot = () => [...root.children].map((c) => `${c.id}:${c.style.display || ''}`).join('|');
  const before = shot();
  // one widget hidden for its own reasons, so the restore is not just "show
  // all". It has to be a CHILD of the root, which is the level setMode works at.
  const target = find(root, (n) => n.id === 'bw-hint');
  target.style.display = 'none';
  const withHidden = shot();
  ck('the HUD starts in play mode', hud.mode === 'play');
  const put = hud.setMode('editor');
  const kept = new Set(['bw-dev', 'bw-minimap']);
  ck('entering the editor puts every child of the HUD root away but the dev badge and minimap',
    [...root.children].every((c) => kept.has(c.id) || c.style.display === 'none')
    && find(root, (n) => n.id === 'bw-dev').style.display !== 'none'
    && find(root, (n) => n.id === 'bw-minimap').style.display !== 'none'
    && hud.mode === 'editor',
    `${put.hidden} put away of ${root.children.length}`);
  ck('and it says how many it put away, which is every child but those two',
    put.hidden === root.children.length - kept.size, `${put.hidden} of ${root.children.length - kept.size}`);
  ck('asking for editor mode twice changes nothing more',
    hud.setMode('editor').hidden === put.hidden);
  hud.setMode('play');
  ck('leaving puts the tree back exactly as it was, hidden widgets included',
    shot() === withHidden && hud.mode === 'play', `${shot()}\n   want ${withHidden}`);
  target.style.display = '';
  ck('and that snapshot really would have caught a difference',
    shot() === before && before !== withHidden);
  ck('a second leave is harmless', hud.setMode('play').mode === 'play' && shot() === before);
}

console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
