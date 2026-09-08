// The right click menu: the model, driven for all seven kinds and both ways
// through every conditional row, and the list itself, walked with the keys.
//
// Run: node src/game/context_menu.test.mjs
//
// Nothing here asserts that a row "would work". Every row's `run` is called and
// what it called is recorded, so a label that says Attack and a function that
// targets is a failure and not a coincidence.

import {
  menuFor, monsterLines, createContextMenu, auditContextMenu,
  TARGET_KINDS, MENU_SIZE, MENU_MARGIN,
} from './context_menu.js';
import { BAG_REACH } from './loot_drops.js';
import { TALK_REACH, plateText } from './npcs_runtime.js';
import { SKIN_REACH } from './skinning.js';
import { NPCS } from '../mmo/npcs.js';
import { MONSTERS } from '../mmo/monsters.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const ids = (rows) => rows.map((r) => r.id).join(',');
const byId = (rows, id) => rows.find((r) => r.id === id);
const labels = (rows) => rows.map((r) => r.label).join(' | ');

// ---------------------------------------------------------------------------
// A game to drive it with. Every handle records what was called on it, so a
// row that says it did a thing is measured against the call it made.
// ---------------------------------------------------------------------------
function fakeGame(over = {}) {
  const log = [];
  const g = {
    log,
    now: () => 100000,
    hud: { log: (t, k) => log.push(`hud.log:${t}`), toast: (t) => log.push(`hud.toast:${t}`) },
    audio: { play: (c) => log.push(`audio:${c}`) },
    state: { touch: (k) => log.push(`touch:${k}`) },
    character: { name: 'Ashe', waypoint: null },
    player: { pos: { x: 0, y: 0, z: 0 }, dying: null },
    emotes: { walking: () => false, start: (id) => { log.push(`emote:${id}`); return { id }; } },
    combat: {
      startAttack: (m) => log.push(`startAttack:${m?.name}`),
      swingAt: (a, now) => { log.push(`swingAt:${a?.name}@${now}`); return { queued: true }; },
      targeting: { current: null, set: (a, why) => log.push(`target:${a?.name}:${why}`) },
    },
    loot: {
      take: (bag, hand) => { log.push(`take:${bag?.id}`); return { taken: bag?.items || [], hand: typeof hand }; },
      nearest: () => null,
      bags: () => [],
      labelFor: (b) => `a sack (${b?.id})`,
    },
    takeLoot: () => log.push('takeLoot'),
    skinning: {
      canSkin: () => true,
      skin: (c, now) => { log.push(`skin:${c?.row?.name}@${now}`); return { ok: true }; },
      knifeOf: () => ({ ok: true, what: 'dagger', where: 'hand' }),
    },
    windows: {
      opened: [],
      panels: [],
      open(id, extra) { this.opened.push(`${id}${extra?.npc ? `:${extra.npc.personName}` : ''}`); log.push(`open:${id}`); return true; },
    },
    map: {
      setWaypoint: (w) => { log.push(`setWaypoint:${w.name}`); return w; },
      clearWaypoint: () => { log.push('clearWaypoint'); return true; },
    },
  };
  return { ...g, ...over };
}

const wolfRow = MONSTERS.wolf;
const wolfMon = (over = {}) => ({
  name: 'Wolf', key: 'w1', row: wolfRow,
  actor: { name: 'Wolf', health: wolfRow.hp, maxHealth: wolfRow.hp, pos: { x: 1, z: 1 } },
  ...over,
});

console.log('context menu: the six kinds');
check('the audit counts the kinds and the lists it has for them', auditContextMenu() === TARGET_KINDS.length, `${TARGET_KINDS.length} kinds`);
check('the six are named in a fixed order',
  TARGET_KINDS.join(',') === 'player,monster,npc,corpse,ground,item', TARGET_KINDS.join(','));
{
  const empty = menuFor({ kind: 'weather' }, fakeGame());
  check('a kind nothing knows about is an empty list, not a throw', Array.isArray(empty) && empty.length === 0, String(empty.length));
  check('and so is no target at all', menuFor(null, fakeGame()).length === 0);
  const bare = menuFor({ kind: 'player' });
  check('menuFor with no game at all still builds the rows rather than throwing',
    bare.length === 5, ids(bare));
}

// ---------------------------------------------------------------------------
console.log('\ncontext menu: the player, which is what the right click was asked for');
{
  const g = fakeGame();
  const rows = menuFor({ kind: 'player' }, g);
  check('five rows, in order: the wheel, sit, wave, the sheet and the pack',
    ids(rows) === 'emote,sit,wave,sheet,bag', ids(rows));
  check('and every one of them can run', rows.every((r) => !r.disabled), rows.filter((r) => r.disabled).map((r) => r.id).join(','));
  byId(rows, 'emote').run();
  check('Emotes opens the wheel the X key opens', g.log.at(-1) === 'open:emotes', g.log.at(-1));
  byId(rows, 'sit').run();
  check('Sit down goes through emotes.start, which is where the line is written', g.log.at(-1) === 'emote:sit', g.log.at(-1));
  byId(rows, 'wave').run();
  check('and so does Wave', g.log.at(-1) === 'emote:wave', g.log.at(-1));
  byId(rows, 'sheet').run();
  check('Character sheet opens the sheet', g.log.at(-1) === 'open:character', g.log.at(-1));
  byId(rows, 'bag').run();
  check('Inventory opens the pack through the alias the codex answers to', g.log.at(-1) === 'open:bag', g.log.at(-1));
}
{
  // the other direction: both gates emotes.js checks, driven true
  const moving = menuFor({ kind: 'player' }, fakeGame({ emotes: { walking: () => true, start: () => 'ran' } }));
  check('walking dims Sit and Wave, and says why',
    byId(moving, 'sit').disabled && byId(moving, 'wave').disabled
    && byId(moving, 'sit').why === 'not on the move, stand still first',
    byId(moving, 'sit').why);
  check('and leaves the wheel, the sheet and the pack alone, because none of them is an emote',
    !byId(moving, 'emote').disabled && !byId(moving, 'sheet').disabled && !byId(moving, 'bag').disabled);
  const g2 = fakeGame({ emotes: { walking: () => true, start: () => { throw new Error('a dimmed row ran the real function'); } } });
  const out = byId(menuFor({ kind: 'player' }, g2), 'sit').run();
  check('a dimmed row does not call the real function, it answers with the reason',
    out && out.ok === false && out.why.includes('on the move'), JSON.stringify(out));

  const down = menuFor({ kind: 'player' }, fakeGame({ player: { pos: { x: 0, z: 0 }, dying: { left: 3 } } }));
  check('and dying dims them with a different reason',
    byId(down, 'sit').why === 'not while you are down', byId(down, 'sit').why);
}

// ---------------------------------------------------------------------------
console.log('\ncontext menu: a monster');
{
  const g = fakeGame();
  const mon = wolfMon();
  const rows = menuFor({ kind: 'monster', actor: mon }, g);
  check('three rows: attack, inspect, target', ids(rows) === 'attack,inspect,target', ids(rows));
  check('and each names the monster it is about', labels(rows).includes('Wolf'), labels(rows));
  byId(rows, 'attack').run();
  check('Attack targets, starts the fight and swings, in that order, through combat.js own calls',
    g.log.join(' > ') === 'target:Wolf:menu > startAttack:Wolf > swingAt:Wolf@100000', g.log.join(' > '));

  const lines = monsterLines(mon);
  check('Inspect carries the record as its tooltip rather than opening a window',
    byId(rows, 'inspect').hint === lines.join(' . ') && lines.length >= 5, `${lines.length} lines: ${lines.join(' . ')}`);
  check('and the lines are the row in mmo/monsters.js, not numbers typed here',
    lines[0] === `Wolf, tier ${wolfRow.tier}` && lines.includes(`hits for ${wolfRow.damage[0]} to ${wolfRow.damage[1]}`)
    && lines.includes(`${wolfRow.hp} of ${wolfRow.hp} health`),
    lines.join(' . '));
  const g2 = fakeGame();
  const out = byId(menuFor({ kind: 'monster', actor: mon }, g2), 'inspect').run();
  check('and running it says every line in the log', out.lines.length === lines.length
    && g2.log.length === lines.length && g2.log[0] === `hud.log:${lines[0]}`, g2.log.join(' | '));

  const g3 = fakeGame();
  byId(menuFor({ kind: 'monster', actor: mon }, g3), 'target').run();
  check('Target only targets and starts nothing', g3.log.join(' > ') === 'target:Wolf:menu', g3.log.join(' > '));
}
{
  const dead = wolfMon({ actor: { name: 'Wolf', health: 0, maxHealth: 40, pos: { x: 1, z: 1 } } });
  const rows = menuFor({ kind: 'monster', actor: dead }, fakeGame());
  check('a dead monster dims Attack and Target, and says which',
    byId(rows, 'attack').disabled && byId(rows, 'target').disabled
    && byId(rows, 'attack').why === 'the Wolf is already down', byId(rows, 'attack').why);
  check('and leaves Inspect alone, because a record is readable after death',
    !byId(rows, 'inspect').disabled);

  const mon = wolfMon();
  const g = fakeGame();
  g.combat.targeting.current = mon.actor;
  const on = menuFor({ kind: 'monster', actor: mon }, g);
  check('a monster you are already looking at dims Target only and leaves Attack live',
    on.find((r) => r.id === 'target').disabled && !on.find((r) => r.id === 'attack').disabled
    && on.find((r) => r.id === 'target').why === 'you are already looking at the Wolf',
    on.find((r) => r.id === 'target').why);
}

// ---------------------------------------------------------------------------
console.log('\ncontext menu: a person');
{
  const near = { id: 'n1', personName: 'Bess', role: NPCS.blacksmith, x: 1, z: 1 };
  const g = fakeGame();
  const rows = menuFor({ kind: 'npc', npc: near }, g);
  check('a blacksmith sells and teaches, so all three rows are there',
    ids(rows) === 'talk,trade,train', ids(rows));
  byId(rows, 'talk').run();
  check('Talk opens the same panel a left click on them opens, with the npc in it',
    g.windows.opened.at(-1) === 'talk:Bess', g.windows.opened.at(-1));
  check('Trade and Train open the same panel, because there is only one',
    byId(rows, 'trade').run().ok && byId(rows, 'train').run().ok
    && g.windows.opened.filter((o) => o.startsWith('talk')).length === 3,
    g.windows.opened.join(','));
  check('and with no panel object to reach, they fall back to the Talk tab and say so',
    byId(rows, 'trade').run().tab === 'talk');
}
{
  // the tab really is set when the registered panel is reachable, which is the
  // one seam this file has into a window it does not own
  const g = fakeGame();
  const panel = { id: 'talk', _tab: null, rendered: 0, render() { this.rendered++; } };
  g.windows.panels = [panel];
  g.windows.open = (id, extra) => { if (id === 'talk') panel._tab = 'talk'; return true; };
  const rows = menuFor({ kind: 'npc', npc: { id: 'n1', personName: 'Bess', role: NPCS.blacksmith, x: 0, z: 0 } }, g);
  const r = byId(rows, 'train').run();
  check('Train lands on the train tab of the panel that was just opened',
    r.tab === 'train' && panel._tab === 'train' && panel.rendered === 1, JSON.stringify(r));
}
{
  const provisioner = { id: 'n2', personName: 'Tam', role: NPCS.provisioner, x: 0, z: 0 };
  const rows = menuFor({ kind: 'npc', npc: provisioner }, fakeGame());
  check('a provisioner teaches nothing, so there is no Train row at all',
    ids(rows) === 'talk,trade' && NPCS.provisioner.teaches.length === 0, ids(rows));
  const master = { id: 'n3', personName: 'Rook', role: NPCS.weaponsmaster, x: 0, z: 0 };
  const mrows = menuFor({ kind: 'npc', npc: master }, fakeGame());
  check('and a weaponsmaster sells and buys nothing, so there is no Trade row',
    ids(mrows) === 'talk,train'
    && NPCS.weaponsmaster.sells.length === 0 && NPCS.weaponsmaster.buys.length === 0, ids(mrows));
}
{
  const far = { id: 'n4', personName: 'Bess', role: NPCS.blacksmith, x: TALK_REACH + 8, z: 0 };
  const rows = menuFor({ kind: 'npc', npc: far }, fakeGame());
  check(`past ${TALK_REACH} m every row is dimmed and the distance is counted, not guessed`,
    rows.every((r) => r.disabled) && byId(rows, 'talk').why === `${plateText(far)} is 12 m off. Walk up to them.`,
    byId(rows, 'talk').why);
  const justIn = { id: 'n5', personName: 'Bess', role: NPCS.blacksmith, x: TALK_REACH - 0.01, z: 0 };
  check('and one step closer they are all live again',
    menuFor({ kind: 'npc', npc: justIn }, fakeGame()).every((r) => !r.disabled));
}

// ---------------------------------------------------------------------------
console.log('\ncontext menu: a body');
{
  const corpse = { row: MONSTERS.wolf, pos: { x: 1, z: 0 }, skinned: false };
  const bag = { id: 'b1', pos: { x: 1, z: 0 }, items: [], gold: 5 };
  const g = fakeGame();
  g.loot.nearest = () => bag;
  const rows = menuFor({ kind: 'corpse', corpse }, g);
  check('two rows: skin and loot', ids(rows) === 'skin,loot', ids(rows));
  check('and both are live with a knife in hand and a sack at your feet', rows.every((r) => !r.disabled),
    rows.map((r) => `${r.id}:${r.why}`).join(' | '));
  byId(rows, 'skin').run();
  check('Skin goes through skinning.skin, on the frame clock', g.log.at(-1) === 'skin:Wolf@100000', g.log.at(-1));
  byId(rows, 'loot').run();
  check('and Loot goes through loot.take with the pack s own hand', g.log.at(-1) === 'take:b1', g.log.at(-1));
}
{
  const corpse = { row: MONSTERS.wolf, pos: { x: 0, z: 0 }, skinned: false };
  const noKnife = menuFor({ kind: 'corpse', corpse }, fakeGame({
    skinning: { canSkin: () => false, skin: () => { throw new Error('skinned with no knife'); }, knifeOf: () => ({ ok: false }) },
  }));
  check('no knife dims Skin and names both the things that would count as one',
    byId(noKnife, 'skin').disabled && byId(noKnife, 'skin').why.includes('dagger')
    && byId(noKnife, 'skin').why.includes('skinning knife'), byId(noKnife, 'skin').why);
  const done = menuFor({ kind: 'corpse', corpse: { ...corpse, skinned: true } }, fakeGame({
    skinning: { canSkin: () => false, skin: () => {}, knifeOf: () => ({ ok: true, what: 'dagger', where: 'hand' }) },
  }));
  check('an already skinned body says that instead', byId(done, 'skin').why === 'the wolf is already skinned', byId(done, 'skin').why);
  const golem = menuFor({ kind: 'corpse', corpse: { row: MONSTERS.ironGolem, pos: { x: 0, z: 0 } } }, fakeGame({
    skinning: { canSkin: () => false, skin: () => {}, knifeOf: () => ({ ok: true, what: 'dagger', where: 'hand' }) },
  }));
  check('and something with no hide says there is nothing on it', golem.find((r) => r.id === 'skin').why.includes('nothing to skin'),
    golem.find((r) => r.id === 'skin').why);
  const away = menuFor({ kind: 'corpse', corpse: { ...corpse, pos: { x: SKIN_REACH + 5, z: 0 } } }, fakeGame());
  check(`a body past ${SKIN_REACH} m dims Skin with the distance`, away.find((r) => r.id === 'skin').why === 'the wolf is 8 m off, walk up to it',
    away.find((r) => r.id === 'skin').why);
  check('and with nothing dropped there, Loot is dimmed and says so',
    byId(noKnife, 'loot').disabled && byId(noKnife, 'loot').why === 'the wolf left nothing lying here', byId(noKnife, 'loot').why);
}

// ---------------------------------------------------------------------------
console.log('\ncontext menu: the ground');
{
  const g = fakeGame();
  const rows = menuFor({ kind: 'ground', point: { x: 120.4, z: -45.7 } }, g);
  check('with no mark set there is one row, and it is not Walk here',
    ids(rows) === 'waypoint' && !rows.some((r) => /walk/i.test(r.label)), ids(rows));
  rows[0].run();
  check('and it writes the mark through the map panel own setWaypoint, named by where it is',
    g.log.at(-1) === 'setWaypoint:the ground at 120, -46', g.log.at(-1));

  const g2 = fakeGame();
  g2.character.waypoint = { x: 3, z: 4, name: 'Hollow Ash' };
  const rows2 = menuFor({ kind: 'ground', point: { x: 0, z: 0 } }, g2);
  check('with a mark already set the second row appears, and names the mark it would clear',
    ids(rows2) === 'waypoint,clearWaypoint' && rows2[1].label === 'Clear the mark on Hollow Ash', labels(rows2));
  rows2[1].run();
  check('and clearing goes through the panel own clearWaypoint', g2.log.at(-1) === 'clearWaypoint', g2.log.at(-1));

  const noMap = menuFor({ kind: 'ground', point: { x: 0, z: 0 } }, fakeGame({ map: null }));
  check('with no map panel the row is dimmed rather than throwing',
    noMap[0].disabled && noMap[0].why === 'there is no map to mark', noMap[0].why);
}

// ---------------------------------------------------------------------------
console.log('\ncontext menu: a sack');
{
  const one = { id: 'b1', pos: { x: 0.5, z: 0 }, items: [], gold: 9 };
  const two = { id: 'b2', pos: { x: 1.5, z: 0 }, items: [], gold: 4 };
  const g = fakeGame();
  g.loot.bags = () => [one, two];
  const rows = menuFor({ kind: 'item', bag: one }, g);
  check('two rows: take and take all', ids(rows) === 'take,takeAll', ids(rows));
  check('and Take all counts the sacks in reach rather than claiming a number',
    byId(rows, 'takeAll').hint === `2 sacks within ${BAG_REACH} m`, byId(rows, 'takeAll').hint);
  byId(rows, 'take').run();
  check('Take opens the one under the cursor', g.log.at(-1) === 'take:b1', g.log.at(-1));
  const g2 = fakeGame();
  g2.loot.bags = () => [one, two];
  const all = byId(menuFor({ kind: 'item', bag: one }, g2), 'takeAll').run();
  check('and Take all opens every one in reach, this one first, each through the same take',
    all.bags === 2 && g2.log.join(' > ') === 'take:b1 > take:b2', g2.log.join(' > '));
}
{
  const lone = { id: 'b1', pos: { x: 0.5, z: 0 }, items: [], gold: 9 };
  const g = fakeGame();
  g.loot.bags = () => [lone];
  const rows = menuFor({ kind: 'item', bag: lone }, g);
  check('one sack in reach dims Take all and says why',
    byId(rows, 'takeAll').disabled && byId(rows, 'takeAll').why === 'this is the only sack in reach',
    byId(rows, 'takeAll').why);
  const far = { id: 'b9', pos: { x: BAG_REACH + 4, z: 0 }, items: [], gold: 1 };
  const g2 = fakeGame();
  g2.loot.bags = () => [far];
  const rows2 = menuFor({ kind: 'item', bag: far }, g2);
  check(`a sack past ${BAG_REACH} m dims both rows with the distance`,
    rows2.every((r) => r.disabled) && byId(rows2, 'take').why === 'it is 7 m off, walk over to it',
    byId(rows2, 'take').why);
}

// ---------------------------------------------------------------------------
console.log('\ncontext menu: removed dragon target');
{
  const rows = menuFor({ kind: 'dragon' }, fakeGame());
  check('a dragon target has no menu rows after the companion removal', rows.length === 0, ids(rows));
}

// ===========================================================================
// The list itself
// ===========================================================================
console.log('\ncontext menu: the list at the cursor');

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
  const byIdMap = new Map();
  return {
    createElement: make,
    getElementById: (id) => byIdMap.get(id) || null,
    head: { appendChild(c) { if (c.id) byIdMap.set(c.id, c); return c; } },
    body: make('body'),
  };
}
function makeWin() {
  const on = [];
  return {
    innerWidth: 1280, innerHeight: 720,
    addEventListener: (name, fn, capture) => on.push({ name, fn, capture }),
    removeEventListener: (name, fn, capture) => {
      const i = on.findIndex((e) => e.name === name && e.fn === fn && e.capture === capture);
      if (i >= 0) on.splice(i, 1);
    },
    on,
    fire(name, ev) { for (const e of on.filter((x) => x.name === name)) e.fn(ev); },
  };
}

{
  const doc = makeDom();
  const win = makeWin();
  const root = doc.createElement('div');
  const ran = [];
  const menu = createContextMenu(root, { document: doc, win, onRun: (r) => ran.push(r.id) });

  check('it puts its own sheet of css in the head once', !!doc.getElementById('bw-ctx-css'));
  check('and hangs one hidden node off the root it was given',
    root.children.length === 1 && root.children[0].id === 'bw-ctx' && root.children[0].hidden === true);
  check('the keys are taken in the capture phase, before input.js own window listener',
    win.on.some((e) => e.name === 'keydown' && e.capture === true)
    && win.on.some((e) => e.name === 'pointerdown' && e.capture === true),
    win.on.map((e) => `${e.name}:${e.capture}`).join(','));

  const g = fakeGame();
  const rows = menuFor({ kind: 'player' }, fakeGame({ emotes: { walking: () => true, start: () => 'no' } }));
  // rows 1 and 2 (sit, wave) are dimmed by the walk, which is what makes this
  // list worth walking with the keys: the highlight has to step over them.
  menu.openAt(rows, 400, 300, 'Ashe');
  const el = root.children[0];
  check('opening draws a header and one button a row', menu.open === true
    && el.children.length === rows.length + 1
    && el.children[0].className === 'bw-ctx-head' && el.children[0].textContent === 'Ashe',
    `${el.children.length} children`);
  check('and the dimmed rows are drawn dimmed rather than left out',
    el.children.slice(1).map((b) => (b.className.includes('off') ? 'off' : 'on')).join(',') === 'on,off,off,on,on',
    el.children.slice(1).map((b) => b.className).join(' | '));
  check('a dimmed row wears its reason as its tooltip, and a live one wears its hint',
    el.children[2].title === 'not on the move, stand still first'
    && el.children[1].title === 'the wheel of eight, the same one X opens',
    `${el.children[2].title} / ${el.children[1].title}`);
  check('the highlight starts on the first row that can actually run', menu.index === 0, String(menu.index));

  menu.key('ArrowDown');
  check('and one step down skips the two dimmed rows straight to the sheet', menu.index === 3, String(menu.index));
  menu.key('ArrowDown');
  check('the next step is the pack', menu.index === 4, String(menu.index));
  menu.key('ArrowDown');
  check('and the one after that wraps back to the top', menu.index === 0, String(menu.index));
  menu.key('ArrowUp');
  check('up from the top wraps to the bottom', menu.index === 4, String(menu.index));
  check('and the highlight is painted on exactly one row',
    el.children.slice(1).filter((b) => b.className.includes('on')).length === 1,
    el.children.slice(1).map((b) => b.className).join(' | '));

  menu.key('Enter');
  check('Enter runs the highlighted row and takes the menu off the screen',
    ran.join(',') === 'bag' && menu.open === false && el.hidden === true && el.children.length === 0,
    `${ran.join(',')} / open ${menu.open}`);
}
{
  // Escape, an outside click, and a click on a row: all three through the
  // listeners the constructor really registered on the window.
  const doc = makeDom();
  const win = makeWin();
  const root = doc.createElement('div');
  const ran = [];
  const menu = createContextMenu(root, { document: doc, win, onRun: (r) => ran.push(r.id) });
  const el = root.children[0];
  const g = fakeGame();

  menu.openAt(menuFor({ kind: 'player' }, g), 10, 10, 'Ashe');
  let stopped = 0, prevented = 0;
  win.fire('keydown', { key: 'Escape', preventDefault: () => prevented++, stopPropagation: () => stopped++ });
  check('Escape on the real window listener closes it', menu.open === false, String(menu.open));
  check('and stops the key going any further, so it does not also close the window behind it',
    stopped === 1 && prevented === 1, `${stopped} stopped, ${prevented} prevented`);

  menu.openAt(menuFor({ kind: 'player' }, g), 10, 10, 'Ashe');
  let stopped2 = 0, prevented2 = 0;
  win.fire('pointerdown', { target: doc.body, preventDefault: () => prevented2++, stopPropagation: () => stopped2++ });
  check('a press anywhere else closes it', menu.open === false);
  check('and that press is eaten, so it is not also a click on whatever was behind the menu',
    stopped2 === 1 && prevented2 === 1, `${stopped2} stopped, ${prevented2} prevented`);

  menu.openAt(menuFor({ kind: 'player' }, g), 10, 10, 'Ashe');
  win.fire('pointerdown', { target: el.children[1], preventDefault() {}, stopPropagation() {} });
  check('but a press on the menu itself leaves it up', menu.open === true);
  win.fire('blur', {});
  check('and the window losing focus takes it down, because the keys are going elsewhere now', menu.open === false);
  menu.openAt(menuFor({ kind: 'player' }, g), 10, 10, 'Ashe');
  el.children[4].fire('click', { stopPropagation() {} });
  check('and clicking a row runs it and closes',
    ran.join(',') === 'sheet' && g.log.at(-1) === 'open:character' && menu.open === false,
    `${ran.join(',')} / ${g.log.at(-1)}`);

  menu.openAt(menuFor({ kind: 'player' }, fakeGame({ emotes: { walking: () => true, start: () => { throw new Error('ran a dimmed row'); } } })), 10, 10, '');
  const dim = root.children[0].children[2];
  dim.fire('click', { stopPropagation() {} });
  check('a click on a dimmed row runs nothing and leaves the menu up',
    menu.open === true && ran.join(',') === 'sheet', `${ran.join(',')} / open ${menu.open}`);
  menu.close();

  // and it is kept on the screen
  menu.openAt(menuFor({ kind: 'player' }, g), 1270, 715, 'Ashe');
  const h = MENU_SIZE.pad + 6 * MENU_SIZE.rowH;
  check('a menu opened in the corner is pulled back inside the window',
    root.children[0].style.left === `${1280 - MENU_SIZE.w - MENU_MARGIN}px`
    && root.children[0].style.top === `${720 - h - MENU_MARGIN}px`,
    `${root.children[0].style.left} , ${root.children[0].style.top}`);
  menu.openAt(menuFor({ kind: 'player' }, g), -40, -40, 'Ashe');
  check('and one opened off the top left is pushed in the other way',
    root.children[0].style.left === `${MENU_MARGIN}px` && root.children[0].style.top === `${MENU_MARGIN}px`,
    `${root.children[0].style.left} , ${root.children[0].style.top}`);

  check('an empty list opens nothing at all', menu.openAt([], 100, 100, 'x') === null && menu.open === false);
  menu.dispose();
  check('and disposing takes the node off the page and every listener off the window',
    root.children.length === 0 && win.on.length === 0, `${root.children.length} nodes, ${win.on.map((e) => e.name).join(',')} left`);
}
{
  const nothing = createContextMenu(null, { document: null, win: null });
  check('with no document at all it is still an object with the same shape',
    nothing.el === null && nothing.open === false && nothing.openAt([], 0, 0) === null && nothing.rows.length === 0);
}

console.log(`\ncontext menu: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
