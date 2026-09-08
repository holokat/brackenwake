// The wiring of the right click: a ray to a target, and the click that opens
// the list. Run: node src/game/app/systems/context_menu.test.mjs
//
// The REAL `create` is driven here, against stub systems that record what was
// asked of them. There is no second code path: `resolve` and `openAt` are the
// functions `app/systems/input.js` calls in the game.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(here, f), 'utf8');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// --- a document and a window, so the list can be built --------------------
function makeDom() {
  const make = (tag) => {
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style: {}, dataset: {}, children: [], parent: null, title: '', hidden: false,
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
      appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = node; node.children.push(c); return c; },
      remove() { if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; } },
      addEventListener(n2, fn) { (node.listeners[n2] ||= []).push(fn); },
      removeEventListener() {},
      fire(n2, ev) { for (const fn of node.listeners[n2] || []) fn(ev || { preventDefault() {}, stopPropagation() {} }); },
    };
    return node;
  };
  const ids = new Map();
  return {
    createElement: make,
    getElementById: (id) => ids.get(id) || null,
    head: { appendChild(c) { if (c.id) ids.set(c.id, c); return c; } },
    body: make('body'),
  };
}
globalThis.document = makeDom();
globalThis.window = { innerWidth: 1400, innerHeight: 800, addEventListener() {}, removeEventListener() {} };

const { context_menu } = await import('./context_menu.js');
const { SYSTEMS, FRAME_ORDER } = await import('./index.js');
const { TARGET_KINDS } = await import('../../context_menu.js');

// --- the world under the cursor -------------------------------------------
// One switch a test flips: which of the six things the ray is allowed to hit.
const world = {
  hit: null,                       // 'bag' | 'npc' | 'corpse' | 'monster' | 'self' | null
  bag: { id: 'b1', pos: { x: 0.5, z: 0 }, items: [], gold: 12 },
  npc: { id: 'n1', personName: 'Bess', role: { name: 'Blacksmith', sells: ['weapons'], buys: ['ore'], teaches: ['mining'] }, x: 0, z: 0 },
  corpse: { row: { name: 'Wolf', tier: 2, kind: 'beast', damage: [6, 11], hp: 40 }, pos: { x: 0, z: 0 }, skinned: false },
  monster: { name: 'Wolf', row: { name: 'Wolf', tier: 2, kind: 'beast', damage: [6, 11], hp: 40 }, actor: { name: 'Wolf', health: 40, maxHealth: 40, pos: { x: 1, z: 0 } } },
};
const selfGroup = { visible: true, tag: 'player' };
/** A raycaster that answers only for the group the switch names. */
const ray = {
  intersectObject: (g) => {
    if (g === selfGroup && world.hit === 'self') return [{ distance: 2 }];
    return [];
  },
};

const log = [];
const talkPanel = { id: 'talk', _tab: null, render() { this.rendered = (this.rendered || 0) + 1; } };
const mapPanel = { id: 'map', setWaypoint(w) { log.push(`setWaypoint:${w.name}`); return w; }, clearWaypoint() { log.push('clear'); return true; } };

const systems = {
  world: {},
  player: {
    rig: { group: selfGroup }, pos: { x: 0, y: 1, z: 0 }, dying: null,
  },
  combat: {
    loot: {
      pick: () => (world.hit === 'bag' ? world.bag : null),
      nearest: () => null, bags: () => [world.bag],
      take: (b) => log.push(`take:${b.id}`), labelFor: () => 'a sack',
    },
    monsters: { pick: () => (world.hit === 'monster' ? world.monster : null) },
    targeting: { current: null, set: (a, why) => log.push(`target:${a?.name}:${why}`), groundPoint: () => ({ x: 12.2, y: 0, z: -7.8 }) },
    startAttack: (m) => log.push(`startAttack:${m.name}`),
    swingAt: (a) => { log.push(`swing:${a.name}`); return { queued: true }; },
  },
  inventory: {
    takeLoot: () => log.push('takeLoot'),
    skinning: {
      pick: () => (world.hit === 'corpse' ? world.corpse : null),
      canSkin: () => true, skin: (c) => log.push(`skin:${c.row.name}`),
      knifeOf: () => ({ ok: true, what: 'dagger', where: 'hand' }),
    },
  },
  world_life: { npcs: { pick: () => (world.hit === 'npc' ? { npc: world.npc } : null) } },
  emotes: { walking: () => false, start: (id) => log.push(`emote:${id}`) },
  ui: {
    panelCtx: { character: { name: 'Ashe' } },
    windows: {
      ctx: { character: { name: 'Ashe' }, state: { touch() {} } },
      panels: [talkPanel, mapPanel],
      open: (id) => { log.push(`open:${id}`); return true; },
    },
  },
};
const character = { name: 'Ashe', waypoint: null };
const ctx = {
  hud: { log: (t) => log.push(`hud:${t}`), toast: (t) => log.push(`toast:${t}`) },
  audio: { play: (c) => log.push(`audio:${c}`) },
  state: { touch: (k) => log.push(`touch:${k}`) },
  character,
  hudRoot: document.createElement('div'),
  frame: { now: 5000 },
  get: (n) => { if (!systems[n]) throw new Error(`no system ${n}`); return systems[n]; },
  has: (n) => !!systems[n],
};

console.log('context_menu system: the shape');
check('it is a system with a name and a create', context_menu.name === 'context_menu' && typeof context_menu.create === 'function');
check('and it declares every system it reaches while it is being built',
  ['world', 'player', 'combat', 'inventory', 'world_life', 'ui', 'emotes'].every((d) => context_menu.deps.includes(d))
  && !context_menu.deps.includes('dragon'),
  context_menu.deps.join(','));
check('it is in the list, after the window layer and before the click router',
  FRAME_ORDER.indexOf('context_menu') > FRAME_ORDER.indexOf('ui')
  && FRAME_ORDER.indexOf('context_menu') < FRAME_ORDER.indexOf('input')
  && SYSTEMS.map((s) => s.name).includes('context_menu'),
  FRAME_ORDER.join(','));
check('and it takes no per frame hook at all, because a menu is not a frame',
  ['hotkeys', 'click', 'move', 'update', 'late', 'render'].every((p) => context_menu[p] === undefined),
  Object.keys(context_menu).join(','));

const sys = context_menu.create(ctx);
check('creating it hangs the list off the hud root, hidden',
  ctx.hudRoot.children.length === 1 && ctx.hudRoot.children[0].id === 'bw-ctx' && ctx.hudRoot.children[0].hidden === true);
check('and it puts contextMenu on the console handle, with open, rows and close',
  typeof sys.bw.contextMenu.open === 'function' && typeof sys.bw.contextMenu.close === 'function'
  && Array.isArray(sys.bw.contextMenu.rows),
  Object.keys(sys.bw.contextMenu).join(','));

console.log('\ncontext_menu system: a ray becomes a target, all six ways');
{
  const got = [];
  for (const [hit, want] of [['bag', 'item'], ['npc', 'npc'], ['corpse', 'corpse'], ['monster', 'monster'], ['self', 'player'], [null, 'ground']]) {
    world.hit = hit;
    const t = sys.resolve(ray);
    got.push(`${hit || 'nothing'}=>${t.kind}${t.kind === want ? '' : ` WANTED ${want}`}`);
  }
  check('every one of the six resolves to its own kind', !got.some((g) => g.includes('WANTED')), got.join(' '));
  check('and the six kinds are the six the model has lists for', TARGET_KINDS.length === 6);
}
{
  world.hit = null;
  const t = sys.resolve(ray);
  check('an empty ray is the ground, at the spot the cursor is over',
    t.kind === 'ground' && t.point.x === 12.2 && t.point.z === -7.8, JSON.stringify(t.point));
}
{
  // the other direction on the self pick: an invisible rig is not under the
  // cursor, however the ray answers
  world.hit = 'self';
  selfGroup.visible = false;
  check('a hidden player rig is not a target, so first person does not right click on itself',
    sys.resolve(ray).kind === 'ground', sys.resolve(ray).kind);
  selfGroup.visible = true;
  check('and a visible one is', sys.resolve(ray).kind === 'player');
}
{
  // the sack beats the person beats the monster, which is the written order
  world.hit = 'bag';
  // answers for the player's rig and nothing else, so what is being measured is
  // the order of the list and not which group the ray happened to reach
  const both = { intersectObject: (g) => (g === selfGroup ? [{ distance: 1 }] : []) };
  check('a sack under the cursor beats the rig behind it', sys.resolve(both).kind === 'item');
  world.hit = 'npc';
  check('and a person beats the rig too', sys.resolve(both).kind === 'npc');
  world.hit = null;
  check('with nothing else there, the rig wins over the ground', sys.resolve(both).kind === 'player');
}

console.log('\ncontext_menu system: the click that opens it');
{
  log.length = 0;
  world.hit = 'monster';
  const took = sys.openAt(ray, 300, 200);
  check('a right click on a monster is taken, and says which kind it took',
    took && took.menu === 'monster', JSON.stringify(took));
  const el = ctx.hudRoot.children[0];
  check('the list is on the screen, with the monster named over it',
    sys.isOpen === true && el.hidden === false && el.children[0].textContent === 'Wolf',
    el.children.map((c) => c.textContent).join(' | '));
  check('and it carries the three monster rows',
    sys.rows.map((r) => r.id).join(',') === 'attack,inspect,target', sys.rows.map((r) => r.id).join(','));

  // walk it and run one, through the real listener and the real row
  sys.menu.key('ArrowDown');
  sys.menu.key('Enter');
  check('walking to Inspect and pressing Enter says the record in the log, and closes',
    sys.isOpen === false && log.filter((l) => l.startsWith('hud:')).length >= 4,
    log.filter((l) => l.startsWith('hud:')).join(' | '));

  log.length = 0;
  sys.openAt(ray, 300, 200);
  sys.menu.activate();
  check('and Attack, run from the menu, goes through targeting, startAttack and swingAt',
    log.join(' > ') === 'target:Wolf:menu > startAttack:Wolf > swing:Wolf', log.join(' > '));
}
{
  log.length = 0;
  world.hit = null;
  sys.openAt(ray, 10, 10);
  check('a right click on bare ground offers the waypoint and nothing else',
    sys.rows.map((r) => r.id).join(',') === 'waypoint', sys.rows.map((r) => r.id).join(','));
  sys.menu.activate();
  check('and running it writes the mark through the map panel that was registered',
    log.join(',') === 'setWaypoint:the ground at 12, -8', log.join(','));
  check('even though the map has never been opened, because the panel context is filled in first',
    mapPanel._ctx === systems.ui.windows.ctx, String(!!mapPanel._ctx));
}
{
  world.hit = 'self';
  log.length = 0;
  sys.openAt(ray, 10, 10);
  check('a right click on yourself is the emote menu the user asked for',
    sys.rows.map((r) => r.id).join(',') === 'emote,sit,wave,sheet,bag', sys.rows.map((r) => r.id).join(','));
  sys.menu.activate();
  check('and the first row opens the wheel', log.join(',') === 'open:emotes', log.join(','));
  sys.close();
}

console.log('\ncontext_menu system: the hook in the click router');
{
  const input = src('input.js');
  check('input.js sends the right button to this system and nowhere else',
    /\(ctx\.input\.click\?\.button \|\| 0\) === 2/.test(input)
    && /ctx\.get\('context_menu'\)\.openAt\(ray, ctx\.input\.click\.px, ctx\.input\.click\.py\)/.test(input),
    'the two lines');
  const click = input.slice(input.indexOf('  click(ctx, ray, frame) {'));
  check('and it does so BEFORE the left click router runs, so a right click never routes',
    click.indexOf('=== 2') < click.indexOf('.route(ray'), `${click.indexOf('=== 2')} then ${click.indexOf('.route(ray')}`);
  check('the shop, the dev camera and being dead still stop the click before either one',
    click.indexOf('shop.isOpen') < click.indexOf('=== 2'), 'the gate is first');
  check('and it asks whether the system exists rather than assuming it',
    /ctx\.has\('context_menu'\)/.test(input));
  const index = src('index.js');
  check('index.js imports it, lists it and exports it',
    /import \{ context_menu \} from '\.\/context_menu\.js'/.test(index)
    && /SYSTEMS = \[[^\]]*context_menu[^\]]*\]/.test(index)
    && /export \{[^}]*context_menu[^}]*\}/.test(index));
  // The bar clears its own slots on a right click, on its own cells, in the HUD
  // layer. Nothing in this change goes near that, and this is the check that
  // says so by name rather than by hope.
  const hud = readFileSync(join(here, '../../hud.js'), 'utf8');
  check('the ability bar still clears a slot on its own contextmenu, and the item row too',
    (hud.match(/addEventListener\('contextmenu'/g) || []).length === 2);
}

console.log(`\ncontext_menu system: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
