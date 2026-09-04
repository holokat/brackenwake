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
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      textContent: '', innerHTML: '', title: '',
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
} = hudMod;
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

console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
