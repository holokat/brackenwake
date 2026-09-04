// Pointing and clicking. Run: node src/game/interact.test.mjs
//
// `decide` is checked as a table: every branch is driven true AND false, so a
// rule that lets the right case through is also shown to block the wrong one.
// Then the real path is run end to end against real tree fields and a real
// chopTree, because a decision nobody acts on is worth nothing.
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, writable: true, configurable: true });
globalThis.requestAnimationFrame ||= () => 0;          // the fall animation is not under test
globalThis.window ||= { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

const THREE = await import('three');
const { createTreeField, clearTreeFields } = await import('../farm/tree_edit.js');
const { createInteract, decide, nounFor, REACH, SITE_REACH, SWING_MS } = await import('./interact.js');
const { createState } = await import('./state.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const at = (x, z) => ({ x, z });
const treePick = (field, index, x, z) => ({ kind: 'tree', tree: { field, index, point: { x, y: 0, z } } });
const fakeField = (name, kind, extra = {}) => ({ name, kind, trees: [{ x: 0, z: 0 }, { x: 0, z: 0, felledUntil: Date.now() + 60000 }], ...extra });

const oaks = fakeField('world:oak', 'tree');
const rocks = fakeField('world:rock', 'rock');
const seams = fakeField('world:ore', 'rock', { yield: 'ore' });

// ---- decide: nothing under the cursor -------------------------------------
check('nothing picked is no action', decide(null, 'axe', at(0, 0), 0, -Infinity).action === 'none');
check('a pick of an unknown kind is no action', decide({ kind: 'weather' }, 'axe', at(0, 0), 0, -Infinity).action === 'none');
check('a tree pick with no field is no action', decide({ kind: 'tree', tree: {} }, 'axe', at(0, 0), 0, -Infinity).action === 'none');

// ---- decide: the tool rule, both ways -------------------------------------
{
  const p = treePick(oaks, 0, 0, 0), q = treePick(rocks, 0, 0, 0), r = treePick(seams, 0, 0, 0);
  const d = (pick, tool) => decide(pick, tool, at(0, 0), 10_000, -Infinity);
  check('bare hands on a tree: no tool', d(p, 'hand').reason === 'no_tool', JSON.stringify(d(p, 'hand')));
  check('and it names the axe as what is missing', d(p, 'hand').need === 'axe');
  check('bare hands on a rock name the pickaxe', d(q, 'hand').need === 'pickaxe' && d(q, 'hand').reason === 'no_tool');
  check('a pickaxe on a tree is the wrong tool', d(p, 'pickaxe').reason === 'wrong_tool');
  check('a bow on a tree is the wrong tool', d(p, 'bow').reason === 'wrong_tool');
  check('an axe on a boulder is the wrong tool', d(q, 'axe').reason === 'wrong_tool');
  check('an axe on a tree chops', d(p, 'axe').action === 'chop', JSON.stringify(d(p, 'axe')));
  check('a pickaxe on a boulder mines', d(q, 'pickaxe').action === 'mine');
  check('a pickaxe on an ore seam mines', d(r, 'pickaxe').action === 'mine');
  check('and an axe on an ore seam does not', d(r, 'axe').action === 'blocked');
}

// ---- decide: reach, both ways ---------------------------------------------
{
  const inR = treePick(oaks, 0, REACH - 0.01, 0);
  const outR = treePick(oaks, 0, REACH + 0.01, 0);
  check(`a tree at ${REACH - 0.01} m is in reach`, decide(inR, 'axe', at(0, 0), 10_000, -Infinity).action === 'chop');
  check(`a tree at ${REACH + 0.01} m is too far`, decide(outR, 'axe', at(0, 0), 10_000, -Infinity).reason === 'too_far');
  // reach is horizontal: standing under a tall tree still reaches its crown
  const overhead = { kind: 'tree', tree: { field: oaks, index: 0, point: { x: 0, y: 40, z: 0 } } };
  check('height does not count against reach', decide(overhead, 'axe', at(0, 0), 10_000, -Infinity).action === 'chop');
  check('and reach is measured from the player, not the origin', decide(outR, 'axe', at(REACH, 0), 10_000, -Infinity).action === 'chop');
  check('missing a tool matters more than being far away', decide(outR, 'hand', at(0, 0), 10_000, -Infinity).reason === 'no_tool');
}

// ---- decide: the swing timer, both ways -----------------------------------
{
  const p = treePick(oaks, 0, 0, 0);
  check(`${SWING_MS - 1} ms after a swing is too soon`, decide(p, 'axe', at(0, 0), 10_000, 10_000 - (SWING_MS - 1)).reason === 'cooldown');
  check(`${SWING_MS} ms after a swing is a new swing`, decide(p, 'axe', at(0, 0), 10_000, 10_000 - SWING_MS).action === 'chop');
  check('the first ever swing is never on cooldown', decide(p, 'axe', at(0, 0), 0, -Infinity).action === 'chop');
}

// ---- decide: a stump that is growing back ---------------------------------
{
  const felled = treePick(oaks, 1, 0, 0);
  check('a felled tree is regrowing, not choppable', decide(felled, 'axe', at(0, 0), 10_000, -Infinity).reason === 'regrowing');
  check('a record that is gone is regrowing too', decide(treePick(oaks, 99, 0, 0), 'axe', at(0, 0), 10_000, -Infinity).reason === 'regrowing');
  check('the one still standing is not', decide(treePick(oaks, 0, 0, 0), 'axe', at(0, 0), 10_000, -Infinity).action === 'chop');
}

// ---- decide: sites, every kind --------------------------------------------
{
  const site = (kind, x = 0) => ({ kind: 'site', site: { kind, name: `the ${kind}`, x, z: 0, article: `a ${kind}` } });
  const d = (s) => decide(s, 'hand', at(0, 0), 0, -Infinity);
  check('a dungeon mouth at your feet is enterable', d(site('dungeon')).action === 'enter');
  check('a cave mouth at your feet is enterable', d(site('cave')).action === 'enter');
  check(`a mouth ${SITE_REACH + 1} m off is too far`, d(site('dungeon', SITE_REACH + 1)).reason === 'too_far');
  check(`and one at ${SITE_REACH} m is not`, d(site('dungeon', SITE_REACH)).action === 'enter');
  check('a town is named, not entered', d(site('town')).action === 'name' && d(site('town')).reason === 'market');
  check('a hamlet is named as a market too', d(site('hamlet')).reason === 'market');
  check('a ruin is just named', d(site('ruin')).action === 'name' && d(site('ruin')).reason === 'site');
  check('a shrine is just named', d(site('shrine')).reason === 'site');
  check('a camp is just named', d(site('camp')).reason === 'site');
  check('a town is named from any distance', decide(site('town', 900), 'hand', at(0, 0), 0, -Infinity).action === 'name');
  check('a site pick with no site is no action', decide({ kind: 'site' }, 'hand', at(0, 0), 0, -Infinity).action === 'none');
}

// ---- decide: dungeon exits ------------------------------------------------
{
  const d = (e) => decide({ kind: 'exit', exit: e }, 'hand', at(0, 0), 0, -Infinity);
  check('a down exit is an exit down', d('down').action === 'exit' && d('down').dir === 'down');
  check('an up exit is an exit up', d('up').dir === 'up');
  check('an exit carried on an object works too', d({ dir: 'up' }).dir === 'up');
  check('an exit that says nothing is no action', d('sideways').action === 'none');
  check('a bare exit pick is no action', decide({ kind: 'exit' }, 'hand', at(0, 0), 0, -Infinity).action === 'none');
}

// ---- what things are called -----------------------------------------------
check('world:oak is an oak', nounFor({ name: 'world:oak', kind: 'tree' }) === 'oak');
check('world:rock is a boulder', nounFor({ name: 'world:rock', kind: 'rock' }) === 'boulder');
check('world:ore is an ore seam', nounFor({ name: 'world:ore', kind: 'rock', yield: 'ore' }) === 'ore seam');
check('a dungeon ore field is an ore seam', nounFor({ name: 'dungeon:3,4:2:ore', kind: 'rock', yield: 'ore' }) === 'ore seam');
check('world:sakura is a cherry tree', nounFor({ name: 'world:sakura', kind: 'tree' }) === 'cherry tree');
check('an unnamed rock field still knows it is a boulder', nounFor({ kind: 'rock' }) === 'boulder');
check('an unnamed ore field still knows it is a seam', nounFor({ kind: 'rock', yield: 'ore' }) === 'ore seam');

// ===========================================================================
// The real path: real fields, real chopTree, real state.
// ===========================================================================
clearTreeFields();
const parent = new THREE.Group();
const geo = new THREE.BoxGeometry(1, 1, 1);
const mat = new THREE.MeshBasicMaterial();
const layer = { geo, mat, of: (t) => ({ x: t.x, y: t.gy + 1, z: t.z, s: t.s, ry: t.ry }) };
const makeField = (name, kind, opts = {}) => {
  const f = createTreeField({ name, kind, parent, layers: [layer], ...opts });
  f.hydrated = true;                       // no saved layout to merge in a test
  return f;
};
const oneHit = { hits: 1 };
const realOaks = makeField('world:oak', 'tree', oneHit);
const realRocks = makeField('world:rock', 'rock', oneHit);
const realSeams = makeField('world:ore', 'rock', { hits: 1, yield: 'ore' });
const sturdy = makeField('world:spruce', 'tree', { hits: 3 });
for (const f of [realOaks, realRocks, realSeams, sturdy]) {
  for (let i = 0; i < 6; i++) f.add({ x: i * 0.5, z: 0, gy: 0, s: 1, ry: 0, alt: 0 });
  f.rebuild();
}

const toasts = [], hints = [];
const hud = { toast: (t) => toasts.push(String(t)), setHint: (t) => hints.push(String(t)) };
const last = () => toasts[toasts.length - 1] || '';
let picked = null;
const calls = [];
const runtime = {
  pick: (ray) => { calls.push(['pick', !!ray]); return picked; },
  enterDungeon: (s) => { calls.push(['enter', s.name]); return { site: s, level: 1 }; },
  dungeonGo: (dir) => { calls.push(['go', dir]); return dir === 'down' ? { inside: true, level: 2 } : { inside: false, level: 0 }; },
  leaveDungeon: () => { calls.push(['leave']); return true; },
  inDungeon: false,
};
const state = createState({ storage: null });
const player = { pos: new THREE.Vector3(0, 0, 0) };
const sc = { camera: new THREE.PerspectiveCamera(55, 1, 0.1, 1800) };
sc.camera.position.set(0, 8, 10);
sc.camera.lookAt(0, 0, 0);
sc.camera.updateMatrixWorld(true);
const input = { pointer: { x: 0, y: 0 } };
const it = createInteract({ sc, runtime, player, state, hud, input });

check('REACH is 6 and is exported on the interactor', it.REACH === 6 && REACH === 6);

// the raycaster really is built from the camera and the cursor
picked = null;
it.update();
check('hover asks the runtime with a raycaster', calls.some(([a, b]) => a === 'pick' && b === true));
check('hovering nothing clears the hint', hints[hints.length - 1] === '');

// hover text
const hoverOf = (p) => { picked = p; hints.length = 0; it.update(); return hints[hints.length - 1] ?? '(unchanged)'; };
check('hovering an oak names it and the axe', hoverOf(treePick(realOaks, 0, 1, 0)) === 'oak, the axe');
check('hovering a boulder names the pickaxe', hoverOf(treePick(realRocks, 0, 1, 0)) === 'boulder, the pickaxe');
check('hovering an ore seam names the pickaxe', hoverOf(treePick(realSeams, 0, 1, 0)) === 'ore seam, the pickaxe');
check('an oak out of reach says so', hoverOf(treePick(realOaks, 0, 40, 0)) === 'oak, too far');
check('a dungeon mouth offers E', hoverOf({ kind: 'site', site: { kind: 'dungeon', name: 'the Ash Cut', x: 2, z: 0 } }) === 'the Ash Cut, E to enter');
check('a far mouth says how far', hoverOf({ kind: 'site', site: { kind: 'cave', name: "Fern's Delve", x: 60, z: 0 } }) === "Fern's Delve, too far, 60 m");
check('a town points at its market', hoverOf({ kind: 'site', site: { kind: 'town', name: 'Ashford', x: 3, z: 0 } }) === 'Ashford, B opens the market');
check('a ruin is just named', hoverOf({ kind: 'site', site: { kind: 'ruin', name: 'the Grey Tower', x: 3, z: 0 } }) === 'the Grey Tower');
check('a stair down invites a click', hoverOf({ kind: 'exit', exit: 'down' }) === 'a stair down, click it');
check('a way up invites a click', hoverOf({ kind: 'exit', exit: 'up' }) === 'the way up, click it');

// clicking with the wrong tool changes nothing
picked = treePick(realOaks, 0, 1, 0);
state.tool = 'hand';
let before = JSON.stringify(state.materials);
let d = it.click();
check('bare hands on a tree are refused', d.reason === 'no_tool');
check('and the toast sends you to the market', /need an axe.*market/.test(last()), last());
check('and nothing lands in the pack', JSON.stringify(state.materials) === before);
state.giveTool('pickaxe'); state.tool = 'pickaxe';
d = it.click();
check('a pickaxe on a tree is refused', d.reason === 'wrong_tool');
check('and the toast names the axe and the oak', /a pickaxe is no use on an oak, you want the axe/.test(last()), last());
check('and nothing lands in the pack', JSON.stringify(state.materials) === before);

// chopping for real
state.giveTool('axe'); state.tool = 'axe';
clock += 1000;
toasts.length = 0;
d = it.click();
check('an axe on an oak in reach chops', d.action === 'chop');
const gotWood = state.materials.wood;
check('the wood is really in the pack', gotWood >= 2 && gotWood <= 4, `${gotWood} wood`);
check('and the toast says how much', last().includes(`${gotWood} wood`), last());
check('and the felled oak is out of the standing list', !!realOaks.trees[0].felledUntil);

// the swing timer, measured rather than asserted
{
  clock += SWING_MS;                         // the swing above is paid for
  picked = treePick(realOaks, 1, 1, 0);
  const t0 = clock, w0 = state.materials.wood;
  let swings = 0;
  for (let i = 0; i < 12; i++) { clock += 0.25; if (it.click().action === 'chop') swings++; }
  check(`12 clicks in ${(clock - t0).toFixed(0)} ms produce 1 swing`, swings === 1, `${swings} swings`);
  check('so only one tree came down', realOaks.trees[1].felledUntil && !realOaks.trees[2].felledUntil);
  const during = state.materials.wood;
  clock += SWING_MS;
  picked = treePick(realOaks, 2, 1, 0);
  check('and after 450 ms the next click swings', it.click().action === 'chop');
  check('which credits more wood', state.materials.wood > during, `${w0} then ${during} then ${state.materials.wood}`);
}

// a tree that needs three blows says how many are left
{
  clock += SWING_MS;
  picked = treePick(sturdy, 0, 1, 0);
  const w = state.materials.wood;
  it.click();
  check('the first blow on a three-hit tree does not fell it', !sturdy.trees[0].felledUntil);
  check('and says how many blows are left', /2 more/.test(last()), last());
  check('and credits nothing yet', state.materials.wood === w);
  clock += SWING_MS; it.click();
  clock += SWING_MS; it.click();
  check('the third blow fells it', !!sturdy.trees[0].felledUntil);
  check('and credits wood', state.materials.wood > w, last());
}

// out of reach
{
  clock += SWING_MS;
  picked = treePick(realOaks, 3, 40, 0);
  const w = state.materials.wood;
  d = it.click();
  check('an oak 40 m off cannot be chopped', d.reason === 'too_far');
  check('and says so', /too far/.test(last()), last());
  check('and the tree still stands', !realOaks.trees[3].felledUntil && state.materials.wood === w);
}

// a stump
{
  clock += SWING_MS;
  picked = treePick(realOaks, 0, 1, 0);     // index 0 was felled above
  d = it.click();
  check('clicking a stump is refused', d.reason === 'regrowing');
  check('and says a sapling is coming back', last() === 'a sapling is coming back here');
}

// rock and ore go to the right materials
{
  clock += SWING_MS;
  state.tool = 'pickaxe';
  picked = treePick(realRocks, 0, 1, 0);
  it.click();
  check('a boulder gives stone', state.materials.stone >= 2, `${state.materials.stone} stone`);
  check('and says so', last().includes(`${state.materials.stone} stone`), last());
  clock += SWING_MS;
  picked = treePick(realSeams, 0, 1, 0);
  it.click();
  check('an ore seam gives ore, not stone', state.materials.ore >= 1, `${state.materials.ore} ore`);
  check('and says so', last().includes(`${state.materials.ore} ore`), last());
}

// a full pack is told about
{
  clock += SWING_MS;
  state.add('stone', 150);
  check('the pack is full of stone', state.materials.stone === 150);
  picked = treePick(realRocks, 1, 1, 0);
  state.tool = 'pickaxe';
  it.click();
  check('mining into a full pack still breaks the rock', !!realRocks.trees[1].felledUntil);
  check('the pack stays at the cap', state.materials.stone === 150);
  check('and the toast says it is full', /full/.test(last()), last());
}

// sites and exits act through the runtime
{
  calls.length = 0;
  picked = { kind: 'site', site: { kind: 'dungeon', name: 'the Ash Cut', x: 2, z: 0 } };
  d = it.click();
  check('clicking a mouth in reach enters it', d.action === 'enter' && calls.some(([a]) => a === 'enter'));
  check('and says where you went', /Ash Cut/.test(last()), last());
  calls.length = 0;
  picked = { kind: 'site', site: { kind: 'cave', name: "Fern's Delve", x: 80, z: 0 } };
  d = it.click();
  check('clicking a mouth out of reach does not enter it', d.reason === 'too_far' && !calls.some(([a]) => a === 'enter'));
  check('and says how far off it is', /80 m/.test(last()), last());
  picked = { kind: 'site', site: { kind: 'town', name: 'Ashford', x: 3, z: 0 } };
  it.click();
  check('clicking a town names it and remembers B', /Ashford/.test(last()) && /\bB\b/.test(last()), last());
  calls.length = 0;
  picked = { kind: 'exit', exit: 'down' };
  it.click();
  check('clicking a stair down goes down', calls.some(([a, b]) => a === 'go' && b === 'down'));
  check('and says which level', /level 2/.test(last()), last());
  picked = { kind: 'exit', exit: 'up' };
  it.click();
  check('taking the way up from level 1 climbs out', /open air/.test(last()), last());
  // E takes what is under the cursor and never moves you on its own
  calls.length = 0;
  picked = { kind: 'exit', exit: 'down' };
  check('E on a stair takes it', it.enter().action === 'exit' && calls.some(([a, b]) => a === 'go' && b === 'down'));
  picked = { kind: 'site', site: { kind: 'cave', name: "Fern's Delve", x: 1, z: 0 } };
  check('E at a mouth enters it', it.enter().action === 'enter');
  calls.length = 0;
  picked = null;
  runtime.inDungeon = true;
  check('E underground pointing at nothing does not climb a level', it.enter().action === 'none' && !calls.some(([a]) => a === 'go' || a === 'leave'));
  check('and says what E needs', /point at a stair/.test(last()), last());
  runtime.inDungeon = false;
  check('E above ground pointing at nothing says so', it.enter().action === 'none' && /nothing to go into/.test(last()), last());
  runtime.inDungeon = true;
  calls.length = 0;
  check('leave() goes out', it.leave() === true && calls.some(([a]) => a === 'leave'));
  runtime.inDungeon = false;
  check('leave() above ground says you are already out', it.leave() === false && /already out/.test(last()), last());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
