// What you carry, and whether it survives a reload. Run: node src/game/state.test.mjs
//
// The cap is the point of this file. A pack that quietly eats what will not fit
// is the bug this game has shipped before, so every add is checked for BOTH
// halves of its answer: what went in and what did not.
import { createState, CAP, SAVE_KEY, SAVE_VERSION, START_COINS } from './state.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

function memStore() {
  const m = new Map();
  return { m, writes: 0, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem(k, v) { this.writes++; m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
}

// ---- the start of a game --------------------------------------------------
{
  const s = createState({ storage: null });
  check('starts with 120 coins', s.coins === START_COINS, String(s.coins));
  check('starts with no tools and an empty hand', s.tools.size === 0 && s.tool === 'hand');
  check('starts with nothing in the pack', s.materials.wood === 0 && s.materials.stone === 0 && s.materials.ore === 0);
  check('the cap is 150 for each of the three', s.caps.wood === CAP && s.caps.stone === CAP && s.caps.ore === CAP);
}

// ---- the cap, from both sides ---------------------------------------------
{
  const s = createState({ storage: null });
  const a = s.add('wood', 200);
  check('200 wood into an empty pack keeps 150', a.added === 150, JSON.stringify(a));
  check('and reports the other 50 as dropped', a.dropped === 50, JSON.stringify(a));
  check('the pack holds exactly the cap', s.materials.wood === 150, String(s.materials.wood));
  const b = s.add('wood', 10);
  check('a full pack takes nothing and drops all 10', b.added === 0 && b.dropped === 10, JSON.stringify(b));

  const t = createState({ storage: null });
  t.add('stone', 149);
  const c = t.add('stone', 5);
  check('the last space takes 1 of 5 and drops 4', c.added === 1 && c.dropped === 4, JSON.stringify(c));
  check('under the cap nothing is dropped', t.add('ore', 3).dropped === 0);
  check('adding 0 is 0 added and 0 dropped', JSON.stringify(t.add('ore', 0)) === '{"added":0,"dropped":0}');
  check('a negative amount cannot drain the pack', t.add('ore', -5).added === 0 && t.materials.ore === 3);
  check('a fractional amount floors instead of leaking decimals', t.add('ore', 2.7).added === 2 && t.materials.ore === 5);
  const u = t.add('gold', 4);
  check('a material this game does not carry is refused, not silently kept', u.added === 0 && u.dropped === 4, JSON.stringify(u));
}

// ---- taking back out ------------------------------------------------------
{
  const s = createState({ storage: null });
  s.add('wood', 12);
  check('take 5 of 12 leaves 7', s.take('wood', 5).taken === 5 && s.materials.wood === 7);
  check('take 99 of 7 takes 7 and cannot go negative', s.take('wood', 99).taken === 7 && s.materials.wood === 0);
  check('take from an empty pack takes nothing', s.take('wood', 1).taken === 0);
}

// ---- coins ----------------------------------------------------------------
{
  const s = createState({ storage: null });
  check('cannot spend more than you have', s.spend(121) === false && s.coins === 120);
  check('can spend exactly what you have', s.spend(120) === true && s.coins === 0);
  check('cannot spend at zero', s.spend(1) === false && s.coins === 0);
  check('earning adds', s.earn(35) === 35 && s.coins === 35);
  check('spending part leaves the rest', s.spend(30) === true && s.coins === 5);
}

// ---- tools ----------------------------------------------------------------
{
  const s = createState({ storage: null });
  check('a tool you do not own cannot be held', (s.tool = 'axe', s.tool === 'hand'));
  check('giving the axe works once', s.giveTool('axe') === true && s.tools.has('axe'));
  check('and not twice', s.giveTool('axe') === false && s.tools.size === 1);
  check('the first tool goes into the hand by itself', s.tool === 'axe');
  check('a tool that is not in the game is refused', s.giveTool('sword') === false && s.tools.size === 1);
  s.giveTool('bow');
  check('a later tool does not snatch the hand', s.tool === 'axe');
  check('but can be taken out', (s.tool = 'bow', s.tool === 'bow'));
  check('and the hand is always available', (s.tool = 'hand', s.tool === 'hand'));
}

// ---- onChange -------------------------------------------------------------
{
  const s = createState({ storage: null });
  let n = 0;
  const off = s.onChange(() => n++);
  s.add('wood', 5); check('add notifies', n === 1, String(n));
  s.take('wood', 1); check('take notifies', n === 2, String(n));
  s.earn(5); check('earn notifies', n === 3, String(n));
  s.spend(5); check('spend notifies', n === 4, String(n));
  s.coins = 200; check('assigning coins notifies', n === 5, String(n));
  s.giveTool('axe'); check('a tool notifies twice, once for the pack and once for the hand', n === 7, String(n));
  s.tool = 'hand'; check('changing tool notifies', n === 8, String(n));
  const before = n;
  s.add('wood', 0); check('an add of nothing says nothing', n === before);
  s.spend(9999); check('a refused spend says nothing', n === before);
  s.coins = 200; check('setting coins to what they already are says nothing', n === before);
  s.setPos(12, -4);
  check('walking does not redraw the HUD', n === before, `pos now ${s.pos.x},${s.pos.z}`);
  off();
  s.earn(1); check('unsubscribing works', n === before);
}

// ---- save and load --------------------------------------------------------
{
  const store = memStore();
  const a = createState({ storage: store });
  a.add('wood', 40); a.add('stone', 7); a.add('ore', 2);
  a.spend(60); a.giveTool('axe'); a.giveTool('pickaxe'); a.tool = 'pickaxe';
  a.setPos(123.5, -88.25);
  check('save writes', a.save() === true && store.m.has(SAVE_KEY));
  const raw = JSON.parse(store.m.get(SAVE_KEY));
  check('the save is versioned', raw.v === SAVE_VERSION, JSON.stringify(raw.v));
  check('the save shape is the contract shape', JSON.stringify(Object.keys(raw).sort()) === '["coins","materials","pos","tool","tools","v"]', Object.keys(raw).join(','));

  const b = createState({ storage: store });
  check('load finds it', b.load() === true);
  check('coins come back', b.coins === 60, String(b.coins));
  check('materials come back', b.materials.wood === 40 && b.materials.stone === 7 && b.materials.ore === 2);
  check('tools come back', b.tools.has('axe') && b.tools.has('pickaxe') && b.tools.size === 2);
  check('the held tool comes back', b.tool === 'pickaxe');
  check('the place you stood comes back', b.pos.x === 123.5 && b.pos.z === -88.25);
  let notified = 0; const c = createState({ storage: store }); c.onChange(() => notified++); c.load();
  check('loading redraws the HUD once', notified === 1, String(notified));
}

// ---- a load that has to tolerate something --------------------------------
{
  const s = createState({ storage: memStore() });
  check('no save at all is not an error, and leaves a new game', s.load() === false && s.coins === 120 && s.tools.size === 0);
}
{
  const store = memStore(); store.setItem(SAVE_KEY, '{not json');
  const s = createState({ storage: store });
  check('a corrupt save does not throw and leaves a new game', s.load() === false && s.coins === 120);
}
{
  // the shape before `v` existed: materials at the top level, tools as a map
  const store = memStore();
  store.setItem(SAVE_KEY, JSON.stringify({ coins: 41, wood: 9, stone: 3, tools: { axe: true, bow: false }, tool: 'axe', x: 5, z: 6 }));
  const s = createState({ storage: store });
  check('an older save loads', s.load() === true);
  check('its coins are kept', s.coins === 41, String(s.coins));
  check('its materials are kept', s.materials.wood === 9 && s.materials.stone === 3 && s.materials.ore === 0);
  check('its tool map is read', s.tools.has('axe') && !s.tools.has('bow') && s.tools.size === 1);
  check('its held tool is kept', s.tool === 'axe');
  check('its position is read from the old top-level keys', s.pos.x === 5 && s.pos.z === 6);
}
{
  // a save from a later version: keys we do not know are ignored, not fatal
  const store = memStore();
  store.setItem(SAVE_KEY, JSON.stringify({ v: 4, coins: 12, materials: { wood: 5, iron: 99 }, tools: ['axe', 'crossbow'], tool: 'crossbow', pos: { x: 1, z: 2 }, quests: [{ id: 'x' }] }));
  const s = createState({ storage: store });
  check('a newer save still loads', s.load() === true);
  check('what it shares is kept', s.coins === 12 && s.materials.wood === 5 && s.tools.has('axe'));
  check('a material this version does not have is ignored', s.materials.ore === 0 && !('iron' in s.materials));
  check('a tool this version does not have is ignored', s.tools.size === 1);
  check('and a hand holding it falls back to the hand', s.tool === 'hand');
}
{
  const store = memStore();
  store.setItem(SAVE_KEY, JSON.stringify({ v: 1, coins: -5, materials: { wood: 900, stone: -3, ore: 'lots' }, tools: ['axe'], tool: 'pickaxe', pos: { x: 'here', z: 2 } }));
  const s = createState({ storage: store });
  s.load();
  check('a save over the cap is clamped to the cap', s.materials.wood === CAP, String(s.materials.wood));
  check('a negative material is clamped to zero', s.materials.stone === 0);
  check('a material that is not a number is left alone', s.materials.ore === 0);
  check('negative coins are clamped to zero', s.coins === 0);
  check('holding a tool you do not own falls back to the hand', s.tool === 'hand');
  check('half a position is no position', s.pos.x === 0 && s.pos.z === 0);
}
{
  const s = createState({ storage: null });
  check('with no storage, save reports that it did not', s.save() === false);
  check('and load reports that it found nothing', s.load() === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
