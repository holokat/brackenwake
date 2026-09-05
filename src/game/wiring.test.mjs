// The wiring itself. Run: node src/game/wiring.test.mjs
//
// audio.js and combat.js were finished and tested before anything called them,
// which is exactly the failure this file exists to catch: a module can be green
// on its own and reach no player at all. So almost everything below drives the
// REAL path. The interactor is the real createInteract, the animals are the real
// createFauna over the stub field combat.test.mjs uses, the trees are real tree
// fields chopped by the real chopTree, the pack is the real createState, and the
// sound is the real createAudio with a fake element in place of an <audio> tag,
// so a cue that fires is a URL that was really built and really played.
//
// The boot is now a list of systems (src/game/app/), and the last third of this
// file is about that list. The runner is driven for real with fake systems, so
// build order, cycle detection and the click chain are measured rather than
// read. The real systems themselves need a document, a renderer and a WebGL
// context, so what is left of them here is read from their source, and every
// one of those checks says so in its name.

let clock = 100000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, writable: true, configurable: true });
globalThis.requestAnimationFrame ||= () => 0;
globalThis.window ||= { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const THREE = await import('three');
const { CHUNK } = await import('../world/field.js');
const { createFauna, hpFor, NEAR_RING } = await import('../world/fauna.js');
const { createTreeField, clearTreeFields } = await import('../farm/tree_edit.js');
const { createInteract, aimDistTo, auditLootCarry, SWING_MS } = await import('./interact.js');
const { createState, CARRIED, GOOD_CAP } = await import('./state.js');
const { createShop, SELLABLE_GOODS, sellPrice } = await import('./shop.js');
const { createAudio, CUES } = await import('./audio.js');
const { WEAPONS, LOOT, lootFor } = await import('./combat.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(HERE, f), 'utf8');

// ---------------------------------------------------------------- the ear --

/** An element that does nothing but remember what was built and played. */
function fakeKit() {
  const built = [], played = [];
  const make = (url) => {
    const el = {
      url, volume: 1, playbackRate: 1, loop: false, currentTime: 0, readyState: 1, paused: true,
      play() { this.paused = false; played.push(this); return { catch() {} }; },
      pause() { this.paused = true; },
      addEventListener() {}, removeEventListener() {},
    };
    built.push(el);
    return el;
  };
  return { make, built, played, reset() { built.length = 0; played.length = 0; } };
}
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// ------------------------------------------------------------- the world ---

function stubField() {
  const sampleAt = () => ({ h: 3, biome: 'meadow', water: false, river: 0, land: 1, temp: 0.5, moist: 0.5, site: null });
  return {
    seed: 4242, seaLevel: -0.8, chunk: CHUNK,
    sampleAt, heightAt: () => 3, biomeAt: () => 'meadow',
    chunkOf: (x, z) => [Math.floor(x / CHUNK), Math.floor(z / CHUNK)],
  };
}
const CENTRE = 20 * CHUNK + 32;
const GROUND = 3;

/** Stand an animal on a spot, whole and calm. */
function place(m, x, z) {
  m.position.set(x, GROUND, z);
  m.userData.wild.home = { x, z };
  m.userData.wild.groundY = GROUND;
  const rm = m.userData.roam;
  if (rm) {
    rm.hp = hpFor(m.userData.wild.kind); rm.state = 'walk'; rm.t0 = 0; rm.until = 1e9;
    rm.fleeUntil = 0; rm.heading = 0;
  }
  return m;
}
const hpOf = (m) => (m.userData.roam ? m.userData.roam.hp : m.userData.fly.hp);

/**
 * Everything the game hands createInteract, real except for `runtime.pick`,
 * which is the raycast the world does against its own meshes. The pick is the
 * one seam: what it returns is a real tree record in a real field.
 */
function rig() {
  clearTreeFields();
  const scene = new THREE.Group();
  const fauna = createFauna(scene, stubField(), {});
  for (let cz = -NEAR_RING; cz <= NEAR_RING; cz++) {
    for (let cx = -NEAR_RING; cx <= NEAR_RING; cx++) fauna.onChunk(20 + cx, 20 + cz, 33);
  }
  fauna.update(0.016, clock, CENTRE, CENTRE, false);
  // everything out of the way, so a swing has exactly the candidates a check puts back
  for (const m of fauna.all()) m.position.set(CENTRE + 900, GROUND, CENTRE + 900);

  const parent = new THREE.Group();
  const layer = { geo: new THREE.BoxGeometry(1, 1, 1), mat: new THREE.MeshBasicMaterial(), of: (t) => ({ x: t.x, y: t.gy + 1, z: t.z, s: t.s, ry: t.ry }) };
  const field = (name, kind, opts = {}) => {
    const f = createTreeField({ name, kind, parent, layers: [layer], ...opts });
    f.hydrated = true;
    return f;
  };
  const oaks = field('world:oak', 'tree', { hits: 1 });
  const rocks = field('world:rock', 'rock', { hits: 1 });
  const seams = field('world:ore', 'rock', { hits: 1, yield: 'ore' });
  for (const f of [oaks, rocks, seams]) {
    for (let i = 0; i < 6; i++) f.add({ x: CENTRE + 2.5, z: CENTRE + i * 0.01, gy: GROUND, s: 1, ry: 0, alt: 0 });
    f.rebuild();
  }

  const toasts = [], hints = [];
  const hud = { toast: (t) => toasts.push(String(t)), setHint: (t) => hints.push(String(t)) };
  const state = createState({ storage: null });
  const player = { pos: new THREE.Vector3(CENTRE, GROUND, CENTRE) };
  const sc = { camera: new THREE.PerspectiveCamera(55, 1, 0.1, 1800) };
  const input = { pointer: { x: 0, y: 0 } };
  let picked = null;
  const runtime = { fauna, inDungeon: false, pick: () => picked };

  const kit = fakeKit();
  const scheduled = [];
  const audio = createAudio({
    makeElement: kit.make, storage: memStore(), listen: false,
    schedule: (fn, ms) => { scheduled.push([fn, ms]); return null; },
  });
  audio.unlock();
  audio.setListener(player.pos.x, player.pos.z);

  const it = createInteract({ sc, runtime, player, state, hud, input, audio });

  /** Look at a spot on the ground. The cursor is dead centre, so the camera aims. */
  const aimAt = (x, z) => {
    sc.camera.position.set(x, GROUND + 50, z);
    sc.camera.lookAt(x, GROUND, z);
    sc.camera.updateMatrixWorld(true);
  };
  const treePick = (f, index) => ({ kind: 'tree', tree: { field: f, index, point: { x: f.trees[index].x, y: GROUND, z: f.trees[index].z } } });

  return {
    fauna, state, hud, player, audio, kit, scheduled, it, aimAt, treePick, runtime,
    oaks, rocks, seams,
    setPick: (p) => { picked = p; },
    toasts, hints,
    last: () => toasts[toasts.length - 1] || '',
    urls: () => kit.built.map((e) => e.url),
    fired: (re) => kit.built.some((e) => re.test(e.url)),
    beast: (kind) => fauna.all().find((m) => m.userData.wild.kind === kind && m.userData.roam),
  };
}

// ===========================================================================
// The loot the pack can hold
// ===========================================================================
{
  check('interact audits combat loot against the pack at module load', auditLootCarry() === true);
  const goods = [...new Set(Object.values(LOOT).map((r) => r.good))];
  check('every good a kill drops is one the pack carries', goods.every((g) => CARRIED.includes(g)), goods.join(','));
  check('and the market has a row for every good the pack carries', CARRIED.every((g) => SELLABLE_GOODS.includes(g) && sellPrice(g) > 0));
  check('the animal cue exists in the table', !!CUES.beastHit, Object.keys(CUES).join(','));
}

// ===========================================================================
// A swing at an animal, all the way through
// ===========================================================================

// ---- the animal in front beats the tree behind ----------------------------
{
  const r = rig();
  const deer = place(r.beast('deer'), CENTRE + 1.5, CENTRE);
  check('a deer is standing 1.5 m off', !!deer && Math.abs(deer.position.x - CENTRE - 1.5) < 1e-6);
  r.setPick(r.treePick(r.oaks, 0));
  r.state.giveTool('axe'); r.state.tool = 'axe';

  // the cursor on the deer: the deer is nearer the cursor than the oak behind it
  r.aimAt(deer.position.x, deer.position.z);
  const hp0 = hpOf(deer);
  r.kit.reset();
  const d = r.it.click();
  check('the cursor on the deer swings at the deer, not the oak', d.action === 'kill' || d.action === 'hit', JSON.stringify(d.action));
  check('and the oak is still standing', !r.oaks.trees[0].felledUntil);
  check('and the deer took the axe', hpOf(deer) < hp0 || hpOf(deer) === 0, `${hp0} then ${hpOf(deer)}`);
  check('and a blow on something alive made a sound', r.fired(/arrow-hit-\d\.mp3/), r.urls().join(' '));
  check('and no chop sound came out of it', !r.fired(/axe-chop/), r.urls().join(' '));
}

// ---- the tree still wins when it is nearer the cursor ---------------------
{
  const r = rig();
  const deer = place(r.beast('deer'), CENTRE + 1.5, CENTRE);
  r.setPick(r.treePick(r.oaks, 0));
  r.state.giveTool('axe'); r.state.tool = 'axe';
  r.aimAt(r.oaks.trees[0].x, r.oaks.trees[0].z);
  const hp0 = hpOf(deer);
  r.kit.reset();
  const d = r.it.click();
  check('the cursor on the oak chops the oak, with a deer at your feet', d.action === 'chop', JSON.stringify(d.action));
  check('and the deer is untouched', hpOf(deer) === hp0, `${hp0} then ${hpOf(deer)}`);
  check('and the axe was heard', r.fired(/axe-chop-1\.mp3/), r.urls().join(' '));
  check('and no blow landed on anything alive', !r.fired(/arrow-hit/));
  check('the wood is really in the pack', r.state.materials.wood > 0, `${r.state.materials.wood} wood`);
  check('and the pickup was heard', r.fired(/pickup\.ogg/), r.urls().join(' '));
  const fell = r.scheduled.find(([, ms]) => ms === 1300);
  check('the tree falling is booked for 1300 ms, not played with the swing', !!fell, r.scheduled.map(([, ms]) => ms).join(','));
  r.kit.reset();
  fell[1] && fell[0]();
  check('and when it fires, the thud is a real file', r.fired(/place-object\.opus/), r.urls().join(' '));
}

// ---- aimDistTo, both ways -------------------------------------------------
{
  const r = rig();
  const pick = r.treePick(r.oaks, 0);
  const aim = { x: r.oaks.trees[0].x + 3, z: r.oaks.trees[0].z };
  check('a tree pick measures from the cursor to the tree', Math.abs(aimDistTo(pick, aim) - 3) < 1e-6, String(aimDistTo(pick, aim)));
  check('a site pick is infinitely far from the cursor', aimDistTo({ kind: 'site', site: {} }, aim) === Infinity);
  check('no pick at all is infinitely far too', aimDistTo(null, aim) === Infinity);
  check('and so is any pick when the cursor is on the sky', aimDistTo(pick, null) === Infinity);
}

// ---- the kill, the loot, and the line that has to match it ----------------
{
  const r = rig();
  const deer = place(r.beast('deer'), CENTRE + 1.5, CENTRE);
  r.state.giveTool('axe'); r.state.tool = 'axe';
  r.setPick(null);
  r.aimAt(deer.position.x, deer.position.z);
  const loot = lootFor('deer');
  check('an axe does 3 and a deer has 3, so one blow kills', WEAPONS.axe.damage >= hpFor('deer'));
  r.kit.reset();
  const d = r.it.click();
  check('the deer goes down', d.action === 'kill', String(d.action) + '/' + String(d.reason));
  check('and the toast says so', /the deer goes down/.test(r.last()), r.last());
  check('the venison is really in the pack', r.state.goods.venison === loot.n, `${r.state.goods.venison}`);
  check('and the toast says where it went', /2 venison in the pack/.test(r.last()), r.last());
  check('and the pack taking it was heard', r.fired(/pickup\.ogg/), r.urls().join(' '));
  check('and the blow was heard too', r.fired(/arrow-hit-\d\.mp3/), r.urls().join(' '));
  check('the body does not stand up again', !r.fauna.isLive(deer));
}

// ---- a blow that does not kill --------------------------------------------
{
  const r = rig();
  const deer = place(r.beast('deer'), CENTRE + 1.5, CENTRE);
  r.state.tool = 'hand';
  r.setPick(null);
  r.aimAt(deer.position.x, deer.position.z);
  const hp0 = hpOf(deer);
  const d = r.it.click();
  check('bare hands wound a deer rather than killing it', d.action === 'hit' && hpOf(deer) === hp0 - 1, `${hp0} then ${hpOf(deer)}`);
  // combat.js writes "your hands lands on the deer": WEAPONS.hand.noun is
  // plural and swingText's verb is not. It is combat.js's line and combat.js is
  // not this task's to edit, so this pins what it really says rather than what
  // COMBAT.WIRING.md's table says it says.
  check('and the toast names the hands and the deer', /your hands land/.test(r.last()) && /on the deer, and it runs/.test(r.last()), r.last());
  check('and nothing was credited for a wound', r.state.goods.venison === 0 && r.state.goods.game_meat === 0);
}

// ---- the cooldown is one arm, and it is silent ----------------------------
{
  const r = rig();
  const deer = place(r.beast('deer'), CENTRE + 1.5, CENTRE);
  r.state.tool = 'hand';
  r.setPick(null);
  r.aimAt(deer.position.x, deer.position.z);
  const t0 = clock;
  let landed = 0;
  r.toasts.length = 0;
  r.kit.reset();
  for (let i = 0; i < 12; i++) { clock += 0.25; if (r.it.click().action === 'hit') landed++; }
  check(`12 clicks in ${(clock - t0).toFixed(0)} ms land 1 blow`, landed === 1, `${landed} blows`);
  check('and only one of them spoke', r.toasts.length === 1, `${r.toasts.length} toasts`);
  check('and the eleven refusals made no sound', r.kit.built.filter((e) => /arrow-hit/.test(e.url)).length === 1, r.urls().join(' '));
  clock += WEAPONS.hand.cooldown;
  check(`and ${WEAPONS.hand.cooldown} ms later the next click lands`, r.it.click().action === 'hit');
}

// ---- one arm: chopping and swinging share the timer -----------------------
{
  const r = rig();
  const deer = place(r.beast('deer'), CENTRE + 1.5, CENTRE);
  r.state.giveTool('axe'); r.state.tool = 'axe';
  r.setPick(r.treePick(r.oaks, 1));
  r.aimAt(r.oaks.trees[1].x, r.oaks.trees[1].z);
  check('the oak is chopped', r.it.click().action === 'chop');
  clock += 1;
  r.aimAt(deer.position.x, deer.position.z);
  const hp0 = hpOf(deer);
  const d = r.it.click();
  check('and a swing at the deer 1 ms later is refused', d.action === 'blocked' && d.reason === 'cooldown', JSON.stringify(d.reason));
  check('so the deer is untouched', hpOf(deer) === hp0);
  clock += WEAPONS.axe.cooldown;
  check('after the axe cooldown it lands', r.it.click().action === 'kill');
}

// ---- a full bag says so, and does not sound like a reward -----------------
{
  const r = rig();
  const deer = place(r.beast('deer'), CENTRE + 1.5, CENTRE);
  r.state.giveTool('axe'); r.state.tool = 'axe';
  r.state.addGood('venison', GOOD_CAP);
  check('the bag is full of venison', r.state.goods.venison === GOOD_CAP);
  r.setPick(null);
  r.aimAt(deer.position.x, deer.position.z);
  r.kit.reset();
  const d = r.it.click();
  check('the deer still goes down', d.action === 'kill');
  check('the bag stays at the cap', r.state.goods.venison === GOOD_CAP);
  check('and the toast says it stayed on the ground', /pack is full/.test(r.last()) && /on the ground/.test(r.last()), r.last());
  check('and the refusal sounds like a refusal, not a pickup', r.fired(/denied\.ogg/) && !r.fired(/pickup\.ogg/), r.urls().join(' '));
}

// ---- underground, the animals are not there -------------------------------
{
  const r = rig();
  const deer = place(r.beast('deer'), CENTRE + 1.5, CENTRE);
  r.state.giveTool('axe'); r.state.tool = 'axe';
  r.runtime.inDungeon = true;
  r.setPick(null);
  r.aimAt(deer.position.x, deer.position.z);
  const hp0 = hpOf(deer);
  const d = r.it.click();
  check('a click underground does not club a deer through the roof', d.action !== 'kill' && d.action !== 'hit', JSON.stringify(d.action));
  check('and the deer is untouched', hpOf(deer) === hp0);
  r.it.update();
  check('and the hint does not name one either', !/click to swing/.test(r.hints[r.hints.length - 1] || ''), r.hints[r.hints.length - 1]);
  r.runtime.inDungeon = false;
  r.it.update();
  check('back above ground the hint names the deer', /deer, click to swing/.test(r.hints[r.hints.length - 1] || ''), r.hints[r.hints.length - 1]);
}

// ---- the hint and the click can never disagree ----------------------------
{
  const r = rig();
  const deer = place(r.beast('deer'), CENTRE + 1.5, CENTRE);
  r.state.giveTool('axe'); r.state.tool = 'axe';
  r.setPick(r.treePick(r.oaks, 0));
  r.aimAt(r.oaks.trees[0].x, r.oaks.trees[0].z);
  r.it.update();
  check('the cursor on the oak hints the oak', /oak, the axe/.test(r.hints[r.hints.length - 1] || ''), r.hints[r.hints.length - 1]);
  check('and the click chops it', r.it.click().action === 'chop');
  clock += WEAPONS.axe.cooldown + SWING_MS;
  r.aimAt(deer.position.x, deer.position.z);
  r.it.update();
  check('the cursor on the deer hints the deer', /deer, click to swing/.test(r.hints[r.hints.length - 1] || ''), r.hints[r.hints.length - 1]);
  check('and the click swings at it', r.it.click().action === 'kill');
}

// ===========================================================================
// The tool on rock and ore, and the refusals
// ===========================================================================
{
  const r = rig();
  r.state.giveTool('pickaxe'); r.state.tool = 'pickaxe';
  r.setPick(r.treePick(r.rocks, 0));
  r.aimAt(r.rocks.trees[0].x, r.rocks.trees[0].z);
  r.kit.reset();
  check('a pickaxe on a boulder mines', r.it.click().action === 'mine');
  check('and the pick was heard', r.fired(/pickaxe-\d\.mp3/), r.urls().join(' '));
  check('and the boulder breaking was heard', r.fired(/boulder-break-\d\.mp3/), r.urls().join(' '));
  check('and the stone is in the pack', r.state.materials.stone > 0, `${r.state.materials.stone}`);

  clock += SWING_MS;
  r.setPick(r.treePick(r.seams, 0));
  r.aimAt(r.seams.trees[0].x, r.seams.trees[0].z);
  r.kit.reset();
  check('a pickaxe on an ore seam mines', r.it.click().action === 'mine');
  check('and the ore is in the pack, not the stone', r.state.materials.ore > 0, `${r.state.materials.ore}`);
  // ore is the same four takes run faster, so the proof is the rate, not the file
  check('and the ore break is the brighter one', r.kit.built.some((e) => /boulder-break/.test(e.url) && e.playbackRate === CUES.oreBreak.rate), r.kit.built.map((e) => `${e.url}@${e.playbackRate}`).join(' '));

  clock += SWING_MS;
  r.setPick(r.treePick(r.oaks, 0));
  r.aimAt(r.oaks.trees[0].x, r.oaks.trees[0].z);
  r.kit.reset();
  const d = r.it.click();
  check('a pickaxe on an oak is refused', d.reason === 'wrong_tool');
  check('and the refusal is heard', r.fired(/denied\.ogg/), r.urls().join(' '));
  check('and no chop came out of it', !r.fired(/axe-chop/));

  clock += SWING_MS;
  r.state.tool = 'hand';
  r.kit.reset();
  check('bare hands on an oak are refused', r.it.click().reason === 'no_tool');
  check('and that refusal is heard too', r.fired(/denied\.ogg/));
}

// ---- silence where silence was chosen -------------------------------------
{
  const r = rig();
  r.state.giveTool('axe'); r.state.tool = 'axe';
  // a tree 40 m off: too far, and clicking at it is something a player repeats
  r.oaks.add({ x: CENTRE + 40, z: CENTRE, gy: GROUND, s: 1, ry: 0, alt: 0 });
  r.oaks.rebuild();
  const far = r.oaks.trees.length - 1;
  r.setPick(r.treePick(r.oaks, far));
  r.aimAt(r.oaks.trees[far].x, r.oaks.trees[far].z);
  r.kit.reset();
  check('an oak 40 m off is too far', r.it.click().reason === 'too_far');
  check('and says so without a beep', /too far/.test(r.last()) && r.kit.built.length === 0, r.urls().join(' '));

  clock += SWING_MS;
  r.setPick(r.treePick(r.oaks, 0));
  r.aimAt(r.oaks.trees[0].x, r.oaks.trees[0].z);
  r.it.click();
  clock += SWING_MS;
  r.kit.reset();
  const d = r.it.click();
  check('clicking the stump is refused', d.reason === 'regrowing');
  check('and that is silent too', r.kit.built.length === 0, r.urls().join(' '));
}

// ---- out of earshot, nothing is even built --------------------------------
{
  const r = rig();
  r.state.giveTool('axe'); r.state.tool = 'axe';
  r.audio.setListener(CENTRE + 900, CENTRE + 900);   // the ear is a long way off
  r.setPick(r.treePick(r.oaks, 0));
  r.aimAt(r.oaks.trees[0].x, r.oaks.trees[0].z);
  r.kit.reset();
  check('a chop 1272 m from the ear still chops', r.it.click().action === 'chop');
  check('and builds no element for the axe', !r.fired(/axe-chop/), r.urls().join(' '));
}

// ===========================================================================
// The market
// ===========================================================================
{
  const kit = fakeKit();
  const audio = createAudio({ makeElement: kit.make, storage: memStore(), listen: false });
  audio.unlock();
  const toasts = [];
  const state = createState({ storage: null });
  const shop = createShop({ state, hud: { toast: (t) => toasts.push(String(t)) }, audio, nearestSettlement: () => null });
  const town = { kind: 'town', name: 'Ashford', x: 0, z: 0 };
  shop.open(town);
  const fired = (re) => kit.built.some((e) => re.test(e.url));
  const urls = () => kit.built.map((e) => e.url).join(' ');

  kit.reset();
  check('buying the axe works', shop.buy('axe') === true);
  check('and the coins crossing the counter are heard', fired(/handle_coins\.mp3/), urls());
  kit.reset();
  check('buying it twice is refused', shop.buy('axe') === false);
  check('and the refusal is heard', fired(/denied\.ogg/), urls());
  kit.reset();
  check('buying what you cannot afford is refused', shop.buy('bow') === false, String(state.coins));
  check('and that refusal is heard too', fired(/denied\.ogg/), urls());

  state.add('wood', 10);
  kit.reset();
  check('selling wood works', shop.sell('wood', 10) === true);
  check('and being paid sounds different from paying', fired(/loot_coin\.mp3/) && !fired(/handle_coins/), urls());
  kit.reset();
  check('selling wood you do not have is refused', shop.sell('wood', 1) === false);
  check('and the refusal is heard', fired(/denied\.ogg/), urls());

  // the hunting bag, sold the same way
  const c0 = state.coins;
  state.addGood('venison', 3);
  kit.reset();
  check('the market buys venison', shop.sellGood('venison', 'all') === true);
  check('and pays the catalog price for it', state.coins === c0 + 3 * sellPrice('venison'), `${state.coins - c0} coins for 3`);
  check('and empties that pocket', state.goods.venison === 0);
  check('and says what changed hands', /you sell 3 venison for 18 coins/.test(toasts[toasts.length - 1]), toasts[toasts.length - 1]);
  check('and it sounds like being paid', fired(/loot_coin\.mp3/), urls());
  kit.reset();
  check('selling venison you do not have is refused', shop.sellGood('venison', 'all') === false);
  check('and says you have none', /no venison/.test(toasts[toasts.length - 1]), toasts[toasts.length - 1]);
  check('and a good the market does not take is refused', shop.sellGood('pelt', 1) === false);
  check('selling a good through the material door is still refused', shop.sell('venison', 1) === false);
}


// ===========================================================================
// The systems runner, driven for real with fake systems
// ===========================================================================
const { createSystems, PHASES } = await import('./app/system.js');
const { SYSTEMS, FRAME_ORDER } = await import('./app/systems/index.js');

/** A context with nothing in it but the register the runner needs. */
function fakeCtx() {
  const reg = new Map();
  return {
    log: [],
    register(name, system) {
      if (reg.has(name)) throw new Error(`the system name "${name}" is already taken`);
      reg.set(name, system); return system;
    },
    get(name) { if (!reg.has(name)) throw new Error(`no system named "${name}"`); return reg.get(name); },
    has: (name) => reg.has(name),
    names: () => [...reg.keys()],
  };
}
/** A system that writes its name into the context log whenever it is touched. */
const spy = (name, deps = [], hooks = {}) => ({
  name, deps,
  create(ctx) { ctx.log.push(`create:${name}`); return { name }; },
  ...Object.fromEntries(Object.entries(hooks).map(([k, v]) => [k, (ctx, ...rest) => { ctx.log.push(`${k}:${name}`); return v?.(ctx, ...rest); }])),
});

// ---- deps decide what is built first, the list decides what runs first -----
{
  const ctx = fakeCtx();
  // listed last, needed first: the runner has to build `ground` before `sky`
  const list = [spy('sky', ['ground'], { update: () => {} }), spy('roof', ['sky'], { update: () => {} }), spy('ground', [], { update: () => {} })];
  const sys = createSystems(ctx, list);
  check('createSystems builds in dependency order, not list order',
    sys.built.join(',') === 'ground,sky,roof', sys.built.join(','));
  check('and runs in list order, which is the frame order',
    sys.order.join(',') === 'sky,roof,ground', sys.order.join(','));
  check('every system was created exactly once',
    ctx.log.filter((l) => l.startsWith('create:')).join(',') === 'create:ground,create:sky,create:roof', ctx.log.join(','));
  ctx.log.length = 0;
  sys.update({ dt: 0.016 });
  check('and update walks the list in list order', ctx.log.join(',') === 'update:sky,update:roof,update:ground', ctx.log.join(','));
}

// ---- a system already standing is used, not built twice -------------------
// This is how main.js raises the world before the character creation screen
// and then builds the rest with the same list.
{
  const ctx = fakeCtx();
  const list = [spy('ground', []), spy('sky', ['ground'])];
  createSystems(ctx, [list[0]]);
  check('the first call built the ground', ctx.log.join(',') === 'create:ground', ctx.log.join(','));
  const sys = createSystems(ctx, list);
  check('and the second call left it alone', ctx.log.join(',') === 'create:ground,create:sky', ctx.log.join(','));
  check('while still running it in the frame', sys.order.join(',') === 'ground,sky', sys.order.join(','));
}

// ---- a cycle is named out loud, not left to blow the stack ----------------
{
  const ctx = fakeCtx();
  let err = null;
  try { createSystems(ctx, [spy('a', ['b']), spy('b', ['a'])]); } catch (e) { err = e; }
  check('a dependency cycle throws', !!err, String(err && err.message));
  check('and the message names the loop', /cycle/.test(err?.message || '') && /a -> b -> a/.test(err?.message || ''), err?.message);
  check('and nothing was built on the way in', ctx.log.length === 0, ctx.log.join(','));
}

// ---- a dep that is not in the list is named too ---------------------------
{
  let err = null;
  try { createSystems(fakeCtx(), [spy('a', ['nobody'])]); } catch (e) { err = e; }
  check('a missing dependency throws', !!err);
  check('and the message names both sides', /"a" needs "nobody"/.test(err?.message || ''), err?.message);
}

// ---- the click stops at the first system that says it handled it ----------
{
  const ctx = fakeCtx();
  const list = [
    spy('first', [], { click: () => false }),
    spy('second', [], { click: () => ({ took: 'it' }) }),
    spy('third', [], { click: () => ({ took: 'nothing' }) }),
  ];
  const sys = createSystems(ctx, list);
  ctx.log.length = 0;
  const handled = sys.click({ ray: true }, { now: 1 });
  check('the click walks the list until one answers', ctx.log.join(',') === 'click:first,click:second', ctx.log.join(','));
  check('the third never saw it', !ctx.log.includes('click:third'), ctx.log.join(','));
  check('and what the handler returned comes back', handled && handled.took === 'it', JSON.stringify(handled));
  ctx.log.length = 0;
  const none = createSystems(fakeCtx(), [spy('only', [], { click: () => null })]).click({}, {});
  check('a click nobody wanted comes back false', none === false, String(none));
}

// ---- ready, save and dispose ----------------------------------------------
{
  const ctx = fakeCtx();
  const sys = createSystems(ctx, [spy('a', [], { ready: () => {}, save: () => {} }), spy('b', [], { ready: () => {}, save: () => {} })]);
  ctx.log.length = 0;
  sys.ready(); sys.save();
  check('ready and save run in list order', ctx.log.join(',') === 'ready:a,ready:b,save:a,save:b', ctx.log.join(','));
  const bin = [];
  createSystems(fakeCtx(), [
    { name: 'a', create: () => ({}), dispose: () => bin.push('a') },
    { name: 'b', create: () => ({}), dispose: () => bin.push('b') },
  ]).dispose();
  check('dispose runs backwards, so nothing is torn down under something else', bin.join(',') === 'b,a', bin.join(','));
}

// ---- the contract is checked when the list is handed over -----------------
{
  const bad = (list, re, name) => {
    let err = null;
    try { createSystems(fakeCtx(), list); } catch (e) { err = e; }
    check(`the runner refuses ${name}`, !!err && re.test(err.message), err?.message);
  };
  bad([{ deps: [], create() {} }], /no name/, 'a system with no name');
  bad([{ name: 'a' }], /no create/, 'a system with no create');
  bad([{ name: 'a', create() {}, update: 3 }], /update that is not a function/, 'a hook that is not a function');
  bad([spy('a'), spy('a')], /two systems are called "a"/, 'two systems with one name');
}

// ===========================================================================
// The real list: every system in the frame order 07-RUNTIME-CONTRACT.md gives
// ===========================================================================
{
  const names = SYSTEMS.map((s) => s.name);
  check('the systems list is the frame order, in order',
    names.join(',') === FRAME_ORDER.join(','), names.join(','));
  check('and the frame order is the nine 07-RUNTIME-CONTRACT.md documents, with the dragon after the world and before the HUD, and the emotes straight after the body they pose',
    FRAME_ORDER.join(',') === 'world,player,emotes,combat,abilities,inventory,world_life,dragon,ui,dev,input', FRAME_ORDER.join(','));
  check('each one has a file of its own', SYSTEMS.every((s) => src(`app/systems/${s.name}.js`).includes(`name: '${s.name}'`)));

  // every dep resolves, and the whole list really does sort
  const have = new Set(names);
  const unresolved = SYSTEMS.flatMap((s) => (s.deps || []).filter((d) => !have.has(d)).map((d) => `${s.name}->${d}`));
  check('every dependency names a system in the list', unresolved.length === 0, unresolved.join(','));
  const ctx = fakeCtx();
  const stubs = SYSTEMS.map((s) => ({ name: s.name, deps: s.deps, create: (c) => { c.log.push(s.name); return {}; } }));
  const sys = createSystems(ctx, stubs);
  const at = (n) => sys.built.indexOf(n);
  const late = SYSTEMS.flatMap((s) => (s.deps || []).filter((d) => at(d) > at(s.name)).map((d) => `${s.name} before ${d}`));
  check('and every system is built after everything it needs', late.length === 0, late.join(','));
  check('the build order is the one R1.md documents',
    sys.built.join(',') === 'world,player,combat,inventory,abilities,ui,emotes,world_life,dragon,dev,input', sys.built.join(','));

  // A system may reach any other system from inside a function that runs after
  // the boot, because everything exists by then. What it may NOT do is reach
  // one while its own create is still running unless it declared it: the runner
  // has not built that one yet, and ctx.get would throw on the first boot.
  const early = [];
  for (const s of SYSTEMS) {
    const file = src(`app/systems/${s.name}.js`);
    const from = file.indexOf('create(ctx) {');
    const body = file.slice(from, file.indexOf('\n  },', from));
    const deps = new Set(s.deps || []);
    for (const line of body.split('\n')) {
      if (!/^ {4}\S/.test(line) || /^\s*\/\//.test(line)) continue;   // 4 spaces is create's own body, and a comment is not code
      for (const m of line.matchAll(/ctx\.get\('(\w+)'\)/g)) {
        if (!deps.has(m[1])) early.push(`${s.name} reaches ${m[1]} while building, without declaring it`);
      }
    }
  }
  check('no system reaches an unbuilt system while it is being built', early.length === 0, early.join('; '));

  const known = new Set([...PHASES, 'ready', 'save', 'dispose', 'name', 'deps', 'create']);
  const strays = SYSTEMS.flatMap((s) => Object.keys(s).filter((k) => !known.has(k)).map((k) => `${s.name}.${k}`));
  check('and no system carries a hook the runner would never call', strays.length === 0, strays.join(','));
}

// ===========================================================================
// The boot, by reading it. UNVERIFIED AT RUNTIME: main.js and the systems need
// a document and a WebGL context, so these are source checks and nothing more.
// ===========================================================================
const app = (f) => src(`app/${f}`);
const sysSrc = (f) => src(`app/systems/${f}`);
const ALL = ['main.js'].map(src).join('\n') + '\n'
  + ['context.js', 'system.js'].map(app).join('\n') + '\n'
  + SYSTEMS.map((s) => sysSrc(`${s.name}.js`)).join('\n') + '\n' + app('systems/index.js');

{
  const has = (text, re, name) => check(`source: ${name}`, re.test(text), re.source);

  // ---- the ear ------------------------------------------------------------
  has(app('context.js'), /import \{ createAudio \} from '\.\.\/audio\.js'/, 'context.js imports createAudio');
  has(app('context.js'), /const audio = createAudio\(\)/, 'context.js creates the audio');
  has(sysSrc('player.js'), /audio\.music\.setBiome\(runtime\.field\.sampleAt\(rig\.pos\.x, rig\.pos\.z\)\.biome\)/, 'player.js sets the biome from where you woke up');
  has(sysSrc('player.js'), /audio\.music\.start\(\)/, 'player.js starts the music');
  has(sysSrc('world_life.js'), /createInteract\(\{[^}]*\baudio\b[^}]*\}\)/, 'world_life.js hands the audio to interact');
  has(sysSrc('world_life.js'), /createShop\(\{\s*\n?\s*state, hud, audio,/, 'world_life.js hands the audio to the shop');
  has(sysSrc('world.js'), /audio\.play\('discover'\)/, 'world.js plays a cue on a discovery');
  has(sysSrc('world.js'), /audio\.play\('enterCave'\)/, 'world.js plays a cue on going under');
  has(src('main.js'), /audio\.setListener\(f\.centre\.x, f\.centre\.z\)/, 'main.js moves the ear every frame');
  // M and N used to be mute keys. M is the Map and Escape is Settings now, so the
  // mutes live in the settings window and ui.js applies them from the document.
  has(sysSrc('ui.js'), /audio\.musicOn !== s\.musicOn\) audio\.toggleMusic\(\)/, 'ui.js lets the saved musicOn setting drive the music');
  has(sysSrc('ui.js'), /audio\.sfxOn !== s\.sfxOn\) audio\.toggleSfx\(\)/, 'ui.js lets the saved sfxOn setting drive the sound');
  has(sysSrc('ui.js'), /settingsPanel, devPanel\]\) windows\.register\(p\)/, 'ui.js registers the settings window');
  has(sysSrc('dev.js'), /applySettings\(ctx\.character\.settings\)/, 'dev.js applies the saved settings the moment there is a dev to turn on');
  has(app('context.js'), /ctx\.bw = \{[^}]*\baudio\b/, 'context.js exposes the audio for the console');
  has(sysSrc('ui.js'), /Escape settings/, 'the opening line tells you where the sound settings are');

  const m = src('main.js');
  const ear = m.indexOf('audio.setListener(');
  const update = m.indexOf('systems.update(f)');
  check('source: the ear moves before any system can fire a cue', ear > 0 && update > ear, `setListener at ${ear}, systems.update at ${update}`);

  const u = sysSrc('ui.js');
  const place = u.slice(u.indexOf('function updatePlace'), u.indexOf('function updatePlace') + 1600);
  check('source: the music follows the ground in updatePlace', /audio\.music\.setBiome\(sample\.biome\)/.test(place));
  check('source: and it is inside the above-ground branch, so it is left alone underground', place.indexOf('audio.music.setBiome') > place.indexOf('} else {'));

  const w = sysSrc('world.js');
  const cave = w.slice(w.indexOf('onDungeonState'), w.indexOf('onDungeonState') + 1600);
  check('source: going deeper is going under, so the cue is on st.inside', /if \(st\.inside\) audio\.play\('enterCave'\)/.test(cave));
  check('source: and climbing out has no cue of its own', !/audio\.play\('[^']*'\);?\s*\n\s*hud\.toast\(`back above ground/.test(cave));

  // ---- the sky and the sea ------------------------------------------------
  has(w, /sc\.useAnalyticSky\(true\)/, 'world.js turns the analytic sky on');
  has(w, /createWater\(sc, runtime\.field, \{ sky \}\)/, 'and the water is built against that same sky');
  const pass = w.indexOf('water.beforeRender(');
  const render = w.indexOf('sc.render()');
  check('source: the refraction pass runs before the frame is drawn, not after',
    pass > 0 && render > pass, `beforeRender at ${pass}, render at ${render}`);
  check('source: and the sky is updated before the water that reflects it',
    w.indexOf('sky.update(') < w.indexOf('water.update('), `${w.indexOf('sky.update(')} then ${w.indexOf('water.update(')}`);
  check('source: the world is the only system that draws', 
    SYSTEMS.filter((s) => typeof s.render === 'function').map((s) => s.name).join(',') === 'world');

  // ---- the keys the HUD may not eat ---------------------------------------
  has(u, /hud\.onTool\?\.\(\(id\) => pickTool\(id\)\)/, 'the tool row is wired to the click');
  has(u, /The tool row is click only/, 'and says why it is click only');
  check('source: no tool is bound to a key anywhere in the boot',
    !/pressed\(['"][0-9=-]['"]\)/.test(ALL), 'a digit key would swing and swap in one press');
  has(u, /1 to = use the bar\./, 'the opening line gives the ability bar the number row');
  has(u, /P abilities/, 'and P for the abilities window');

  // ---- the frame, in the order the contract gives it -----------------------
  const at = (s) => m.indexOf(s);
  const seq = ['systems.hotkeys(f)', 'systems.click(', 'systems.move(f)', 'systems.update(f)', 'systems.late(f)', 'systems.render(f)', 'input.endFrame()'];
  let ordered = true, where = [];
  for (let i = 0; i < seq.length; i++) { where.push(`${seq[i]}@${at(seq[i])}`); if (at(seq[i]) < 0 || (i && at(seq[i]) < at(seq[i - 1]))) ordered = false; }
  check('source: main.js runs the phases in the documented order', ordered, where.join(' '));
  check('source: and the save tick is the last thing in the frame',
    at('lastSave = now') > at('input.endFrame()'), `${at('lastSave = now')} vs ${at('input.endFrame()')}`);
  check('source: the harness step is the same frame function, not a second path',
    /step: \(ms = 16\.7\) => frame\(last \+ ms, true\)/.test(m));
}

// ===========================================================================
// Which screen the boot puts up. DRIVEN, not read: bootStage is pure and
// exported, and the three states below are three real storages.
// ===========================================================================
{
  const { bootStage } = await import('./main.js');
  const slots = (n) => {
    const store = memStore();
    const st = createState({ storage: store });
    for (let i = 0; i < n; i++) {
      st.newSlot();
      st.character.name = `Somebody ${i + 1}`;
      st.character.needsCreation = false;
      st.save();
    }
    return { st, store };
  };

  {
    const store = memStore();
    const st = createState({ storage: store });
    st.load();
    check('a brand new install goes straight to the making of somebody',
      bootStage(st) === 'creation', bootStage(st));
    check('and the note cannot send it to a roster of nobody',
      bootStage(st, { roster: true }) === 'creation', bootStage(st, { roster: true }));
  }
  {
    const { st } = slots(1);
    check('one character made is a roster', bootStage(st) === 'roster', bootStage(st));
    const two = slots(3);
    check('three of them likewise', bootStage(two.st) === 'roster', bootStage(two.st));
  }
  {
    // A slot begun and abandoned: nothing to play, so the road goes on to the
    // making of them. The note from the settings window overrules that, because
    // the player pressed a button that says roster.
    const store = memStore();
    const st = createState({ storage: store });
    st.newSlot();
    check('a slot begun and never finished asks to be finished',
      bootStage(st) === 'creation', bootStage(st));
    check('and the note sends it to the roster instead',
      bootStage(st, { roster: true }) === 'roster', bootStage(st, { roster: true }));
  }
  {
    // The last case, and it is somebody real: a private window where nothing
    // can be written. There is a whole character in memory and no roster to
    // list them, so the game is what they get.
    const st = createState({ storage: null });
    const made = st.character;
    made.needsCreation = false;
    st.setCharacter(made);
    check('a character nothing can list still gets a game',
      st.roster().length === 0 && st.needsCreation === false && bootStage(st) === 'game', bootStage(st));
  }
  check('a state that is not one at all does not throw', bootStage(null) === 'game' && bootStage({}) === 'game');

  // The world is raised before anybody has been chosen, and the document in
  // hand is REPLACED afterwards: by openSlot when the roster hands a slot
  // over, and again by setCharacter when the creation screen finishes. A
  // reference taken during world's create would point at a document nobody is
  // playing. So world's create may not take one, and this is that rule.
  {
    const w = src('app/systems/world.js');
    const from = w.indexOf('create(ctx) {');
    const body = w.slice(from, w.indexOf('\n  },', from));
    const held = [];
    for (const line of body.split('\n')) {
      if (!/^ {4}\S/.test(line) || /^\s*\/\//.test(line)) continue;
      if (/ctx\.character/.test(line)) held.push(line.trim());
      if (/^\s*const \{[^}]*\bcharacter\b[^}]*\} = ctx/.test(line)) held.push(line.trim());
    }
    check('source: nothing in the world\'s create holds the character document, because it is replaced after',
      held.length === 0, held.join(' | '));
  }

  const m = src('main.js');
  check('source: the roster goes up before the creation gate',
    m.indexOf("if (stage === 'roster') return showRoster();") > 0
    && m.indexOf("if (stage === 'roster')") < m.indexOf("if (stage === 'creation')"),
    `${m.indexOf("if (stage === 'roster')")} then ${m.indexOf("if (stage === 'creation')")}`);
  check('source: and the note the settings window leaves is what main.js reads',
    /bootStage\(state, \{ roster: rosterAsked\(\) \}\)/.test(m));
  check('source: the roster hands a slot back and main.js opens it',
    /onPlay: \(id\) => \{[\s\S]{0,120}?state\.openSlot\(id\);/.test(m));
  check('source: a slot that was never finished goes back to the making of them',
    /if \(state\.needsCreation\) showCreation\(\); else startGame\(\);/.test(m));
  check('source: New makes a slot and then makes the character in it',
    /onNew: \(\) => \{ state\.newSlot\(\); showCreation\(\); \}/.test(m));
  const roster__bw = m.slice(m.indexOf('function showRoster'), m.indexOf('function showCreation'));
  check('source: the console gets the scene, the state and a word for where it is',
    /window\.__bw = \{[^}]*\bsc\b[^}]*\bstate\b[^}]*roster: true/.test(roster__bw));
  check('source: and the creation gate still says creating',
    /window\.__bw = \{[^}]*creating: true/.test(m.slice(m.indexOf('function showCreation'), m.indexOf('function startGame'))));
  check('source: the boot only runs itself where there is a document to run in',
    /if \(typeof document !== 'undefined' && typeof document\.getElementById === 'function'\) boot\(\);/.test(m));
  check('and this file proves that by importing main.js with no document at all',
    typeof globalThis.document === 'undefined');
}

// ---- everything the console had, it still has -----------------------------
// __bw is assembled from each system's own `bw` bag. These are the keys the old
// single file exposed; a rename that drops one is caught here by name.
{
  const bags = [];
  for (const re = /\bbw\s*[:=]\s*\{/g, s = ALL; ;) {
    const m = re.exec(s);
    if (!m) break;
    let i = re.lastIndex - 1, depth = 0;
    do { if (s[i] === '{') depth++; else if (s[i] === '}') depth--; i++; } while (depth > 0 && i < s.length);
    bags.push(s.slice(m.index, i));
  }
  // the last __bw literal in main.js is the real one; the first is the creation screen's
  const mm = src('main.js');
  const merged = bags.join('\n') + '\n' + mm.slice(mm.lastIndexOf('window.__bw = {'), mm.lastIndexOf('window.__bw = {') + 400);
  const KEYS = ['step', 'now', 'sc', 'runtime', 'player', 'camera', 'state', 'hud', 'dev', 'input', 'interact', 'shop',
    'audio', 'floaters', 'THREE', 'sky', 'water', 'actor', 'playerActor', 'character', 'progression', 'combat', 'loot',
    'monsters', 'inventory', 'windows', 'effects', 'targeting', 'abilities', 'npcs', 'stations', 'panels', 'spawnMonster',
    'recompute', 'tickPools', 'syncToCharacter', 'skinning', 'tradeNet', 'dress', 'forage', 'foraging', 'itemBar',
    'compass', 'refreshEnvironment', 'targetRing', 'attacking', 'stopAttack', 'fps', 'codexTab', 'devPanel', 'devBench',
    'wake', 'dying'];
  const gone = KEYS.filter((k) => !new RegExp(`(^|[^\\w.])(get\\s+)?${k}\\b\\s*[,:(}]`, 'm').test(merged));
  check(`source: all ${KEYS.length} keys the console had are still put on __bw`, gone.length === 0, gone.join(','));
  check('source: main.js merges those bags with their getters intact',
    /Object\.defineProperties\(window\.__bw, Object\.getOwnPropertyDescriptors\(bag\)\)/.test(src('main.js')));
}

// ---- interact.js and shop.js, the call sites themselves --------------------
// Everything these assert is also driven for real above; they are here so a
// deletion is caught by name rather than by a check that quietly stops proving
// anything.
{
  const i = src('interact.js');
  check('interact.js source: imports resolveSwing', /import \{[^}]*resolveSwing[^}]*\} from '\.\/combat\.js'/.test(i));
  check('interact.js source: the click asks combat before it acts', i.indexOf('beastWins(beast, pick, aim)) return swing(') < i.indexOf('return act(decide(pick,'));
  check('interact.js source: every cue is optional, so it runs headless', !/[^?]\baudio\.play\(/.test(i));
  const s = src('shop.js');
  check('shop.js source: the cues are inside buy and sell, not on the returned methods', /audio\?\.play\?\.\('buy'\)/.test(s) && /audio\?\.play\?\.\('sell'\)/.test(s));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
