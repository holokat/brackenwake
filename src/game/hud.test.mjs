// The HUD, counted. Run: node src/game/hud.test.mjs
//
// The farm shipped a HUD whose painted frame had three tool cells and whose
// TOOLS list had five entries. The two extra slots rendered with no position,
// stacked on the first, and the last one in the DOM ate every click, so tool
// switching was impossible for days. That bug was a mismatch between a list
// and a container, and this suite is the guard against it coming back: every
// row is flex and sized by its own list, the hotkeys are that list's indices,
// and the tools the HUD can show are exactly the tools state.js can own.
//
// The second half runs the REAL createHud against a small fake document, so
// what is measured is what a player would get rather than a description of it.
// The shim is deliberately dumb: innerHTML is an opaque string, because the
// skeleton is built with createElement and nothing queries into markup.

// --- a document, small enough to read ---------------------------------------
function makeDom() {
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '',
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      // Faithful to the real thing: setting textContent EMPTIES the node. Panels
      // clear and rebuild with it, and a fake that only stored the string would
      // let a tab strip grow four copies of itself and call it a pass.
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
  };
}
globalThis.document = makeDom();
globalThis.setTimeout ||= () => 0;

const hudMod = await import('./hud.js');
const {
  TOOLS, MATERIALS, BAR_KEYS, BAR_SLOTS, POOLS, LOG_LINES, KEY_LABELS,
  poolView, sweep, costLabel, timerLabel, logTrim, createHud,
  bannerAt, devLine, BANNER, BANNER_TOTAL,
  gainAt, GAIN, GAIN_TOTAL, GAIN_LINES,
} = hudMod;
const itemBarMod = await import('./item_bar.js');
// state.js runs its own audit at import and another agent is mid-flight on the
// items table it audits against. That is state.js's failure, reported by
// state.js's own suite, and it must not turn this one red. The two cross
// checks it feeds are skipped LOUDLY when it will not load, never silently.
let state = null, stateWhy = '';
try { state = await import('./state.js'); } catch (err) { stateWhy = err.message; }
const { ABILITIES_BY_ID } = await import('../mmo/abilities.js');
const runtime = await import('./abilities_runtime.js');

let bad = 0, pass = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : bad++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// --- the old contract, unchanged --------------------------------------------
console.log('hud: the tool row');
ck('there are four tool slots', TOOLS.length === 4, TOOLS.map((t) => t.id).join(' '));
ck('the keys are 1 to 4, in order', TOOLS.every((t, i) => t.key === String(i + 1)), TOOLS.map((t) => t.key).join(''));
ck('every key is distinct', new Set(TOOLS.map((t) => t.key)).size === TOOLS.length);
ck('every id is distinct', new Set(TOOLS.map((t) => t.id)).size === TOOLS.length);
ck('every slot has a label to read', TOOLS.every((t) => typeof t.label === 'string' && t.label.length > 0));
ck('hand is the only free slot', TOOLS.filter((t) => t.free).length === 1 && TOOLS[0].id === 'hand');
if (!state) {
  console.log(`  SKIP three cross checks against state.js: it will not import   ${stateWhy}`);
} else {
  const buyable = TOOLS.filter((t) => !t.free).map((t) => t.id).sort();
  ck('every tool state.js can own has a slot', JSON.stringify(buyable) === JSON.stringify([...state.TOOLS].sort()),
    `hud ${buyable.join(',')} vs state ${[...state.TOOLS].sort().join(',')}`);
  ck('and no slot names a tool state.js has never heard of', TOOLS.every((t) => t.free || state.TOOLS.includes(t.id)));
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
ck('the four keys the tool row shares with the bar are exactly 1 to 4',
  BAR_KEYS.filter((k) => TOOLS.some((t) => t.key === k)).join('') === '1234',
  'main.js decides which layer eats the press; both lists agree on which four are contended');

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
const toolRowEl = find(root, (n) => n.id === 'bw-tools');
const logEl = find(root, (n) => n.id === 'bw-log');
const targetEl = find(root, (n) => n.id === 'bw-target');
const poolsEl = find(root, (n) => n.id === 'bw-pools');
const auraEl = find(root, (n) => n.id === 'bw-auras');

ck('the bar has exactly twelve cells and not thirteen', barRow.children.length === 12, String(barRow.children.length));
ck('the tool row still has exactly four', toolRowEl.children.length === 4, String(toolRowEl.children.length));
ck('each cell wears its own key cap',
  barRow.children.map((c) => c.children[0].textContent).join(',')
  === BAR_KEYS.map((k) => KEY_LABELS[k] || k).join(','),
  barRow.children.map((c) => c.children[0].textContent).join(''));
ck('every cell starts empty', barRow.children.every((c) => c.classList.contains('empty')));

ck('every export the old contract names is still here',
  ['toast', 'setMaterials', 'setCoins', 'setTool', 'onTool', 'setPlace', 'setDev', 'setHint', 'el', 'dispose']
    .every((k) => hud[k] !== undefined));
hud.setCoins(41);
ck('the purse still draws coins', find(root, (n) => n.id === 'bw-purse').innerHTML.includes('>41<'));
hud.setTool('axe', new Set(['axe']));
ck('an owned tool unlocks and lights up',
  !toolRowEl.children[1].classList.contains('locked') && toolRowEl.children[1].classList.contains('active'));
ck('an unowned tool stays locked', toolRowEl.children[2].classList.contains('locked'));
let picked = null;
hud.onTool((id) => { picked = id; });
toolRowEl.children[1].fire('click');
ck('clicking an unlocked tool still calls back', picked === 'axe', String(picked));
picked = null;
toolRowEl.children[2].fire('click');
ck('and clicking a locked one does not', picked === null);
hud.setPlace('Fern’s Stone');
ck('setPlace still writes the place', find(root, (n) => n.id === 'bw-place').textContent === 'Fern’s Stone');
hud.setDev(true);
ck('setDev still lights the badge', find(root, (n) => n.id === 'bw-dev').classList.contains('on'));
hud.setHint('press E');
ck('setHint still shows the hint', find(root, (n) => n.id === 'bw-hint').classList.contains('on'));
hud.toast('you found something', 'good');
ck('toast still lands in the toast column',
  find(root, (n) => n.id === 'bw-toasts').children.length === 1);

// the log
for (let i = 1; i <= 12; i++) hud.log(`line ${i}`, i % 2 ? 'good' : 'bad');
ck('the log keeps the last eight and drops the rest',
  hud.lines.join(',') === 'line 5,line 6,line 7,line 8,line 9,line 10,line 11,line 12', hud.lines.join(','));
ck('the log has eight rows in the DOM, not twelve', logEl.children.length === 8, String(logEl.children.length));
ck('a log line is text, not markup', logEl.children[0].textContent === 'line 5' && logEl.children[0].innerHTML === '');
ck('an empty line is refused rather than drawn blank', hud.log('') === null && logEl.children.length === 8);

// update: pools, target, bar
const bar = BAR_KEYS.map(() => ({ ability: null, cooldownLeft: 0, affordable: true }));
bar[0] = { ability: ABILITIES_BY_ID.powerStrike, cooldownLeft: 3, affordable: true, casting: false };
bar[11] = { ability: ABILITIES_BY_ID.fireball, cooldownLeft: 0, affordable: false, casting: false };
hud.update(0.016, {
  actor: { health: 30, maxHealth: 120, mana: 20, maxMana: 40, stamina: 50, maxStamina: 50 },
  target: { name: 'Skeleton', health: 15, maxHealth: 30, fraction: 0.5, colour: '#ffd23f', word: 'your match' },
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
ck('the frame takes the tier colour it was handed',
  find(targetEl, (n) => n.className === 'nm').style.color === '#ffd23f');
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
  && auraEl.children[1].children[1].textContent === '2',
  `${auraEl.children.length} icons, last timer "${auraEl.children[1]?.children[1]?.textContent}"`);

// no target, no frame
hud.update(0.016, { actor: null, target: null, bar: null, buffs: [] });
ck('no target hides the frame again', !targetEl.classList.contains('on'));
ck('no actor hides the pools again', !poolsEl.classList.contains('on'));

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
  const plate = find(root, (n) => n.id === 'bw-portrait');
  ck('the portrait plate starts with a drawn helm in it', /<svg/.test(plate.innerHTML), plate.innerHTML.slice(0, 20));
  const canvas = document.createElement('canvas');
  ck('and takes the paper doll s canvas when there is one', hud.setPortrait(canvas) === true);
  ck('which is then the only thing in it', plate.children.length === 1 && plate.children[0] === canvas);
  ck('handing it nothing changes nothing', hud.setPortrait(null) === false && plate.children.length === 1);
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
    /<svg/.test(itemRow.children[0].children[1].innerHTML) && itemRow.children[0].children[2].textContent === '4',
    itemRow.children[0].children[2].textContent);
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

  inventory.remove({ pack: 0 }, 4);
  hud.update(0.016, { items: itemBar.view() });
  ck('a stack that runs out leaves a dimmed ghost, not an empty square',
    itemRow.children[0].classList.contains('ghost') && !itemRow.children[0].classList.contains('empty')
    && /<svg/.test(itemRow.children[0].children[1].innerHTML),
    itemRow.children[0].className);
  ck('and the ghost says so on hover', /You have none left/.test(itemRow.children[0].el === undefined ? itemRow.children[0].title : ''),
    itemRow.children[0].title);

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
  ck('and the reason is on it to read', /hands are empty/.test(barRow.children[0].title), barRow.children[0].title);
  greyBar[0] = { ability: ABILITIES_BY_ID.powerStrike, cooldownLeft: 0, affordable: true, casting: false };
  hud.update(0.016, { bar: greyBar });
  ck('drawing the sword takes the grey off again, and the reason with it',
    !barRow.children[0].classList.contains('unusable') && !/hands are empty/.test(barRow.children[0].title),
    barRow.children[0].title);
}

console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
