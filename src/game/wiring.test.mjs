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
// Only main.js is checked by reading its source, and every one of those checks
// says so in its name. main.js is a boot function that needs a document, a
// renderer and a WebGL context; there is no honest way to run it in node, and a
// grep that says `audio.setListener` is on the frame is worth more than nothing
// at all. It is worth less than the checks above it, which is why it is a
// handful of lines and not the file.

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
// main.js, by reading it. UNVERIFIED AT RUNTIME: main.js needs a document and a
// WebGL context, so these are source checks and nothing more.
// ===========================================================================
{
  const m = src('main.js');
  const has = (re, name) => check(`main.js source: ${name}`, re.test(m), re.source);
  has(/import \{ createAudio \} from '\.\/audio\.js'/, 'imports createAudio');
  has(/const audio = createAudio\(\)/, 'creates the audio');
  has(/audio\.music\.setBiome\(runtime\.field\.sampleAt\(player\.pos\.x, player\.pos\.z\)\.biome\)/, 'sets the biome from where you woke up');
  has(/audio\.music\.start\(\)/, 'starts the music');
  has(/createInteract\(\{[^}]*\baudio\b[^}]*\}\)/, 'hands the audio to interact');
  has(/createShop\(\{\s*\n?\s*state, hud, audio,/, 'hands the audio to the shop');
  has(/audio\.play\('discover'\)/, 'plays a cue on a discovery');
  has(/audio\.play\('enterCave'\)/, 'plays a cue on going under');
  has(/audio\.setListener\(centre\.x, centre\.z\)/, 'moves the ear every frame');
  // M and N used to be mute keys. M is the Map and Escape is Settings now, so the
  // mutes live in the settings window and main.js applies them from the document.
  has(/audio\.musicOn !== s\.musicOn\) audio\.toggleMusic\(\)/, 'the saved musicOn setting drives the music');
  has(/audio\.sfxOn !== s\.sfxOn\) audio\.toggleSfx\(\)/, 'the saved sfxOn setting drives the sound');
  has(/settingsPanel, devPanel\]\) windows\.register\(p\)/, 'the settings window is registered');
  has(/applySettings\(character\.settings\)/, 'and the saved settings are applied at boot');
  has(/window\.__bw = \{[^}]*\baudio\b/, 'exposes the audio for the console');
  has(/Escape settings/, 'the opening line tells you where the sound settings are');

  const ear = m.indexOf('audio.setListener(');
  const update = m.indexOf('runtime.update(dt, now');
  check('main.js source: the ear moves before anything can fire a cue', ear > 0 && update > ear, `setListener at ${ear}, runtime.update at ${update}`);

  const place = m.slice(m.indexOf('function updatePlace'), m.indexOf('function updatePlace') + 1600);
  check('main.js source: the music follows the ground in updatePlace', /audio\.music\.setBiome\(sample\.biome\)/.test(place));
  check('main.js source: and it is inside the above-ground branch, so it is left alone underground', place.indexOf('audio.music.setBiome') > place.indexOf('} else {'));

  const cave = m.slice(m.indexOf('onDungeonState'), m.indexOf('onDungeonState') + 1400);
  check('main.js source: going deeper is going under, so the cue is on st.inside', /if \(st\.inside\) audio\.play\('enterCave'\)/.test(cave));
  check('main.js source: and climbing out has no cue of its own', !/audio\.play\('[^']*'\);?\s*\n\s*hud\.toast\(`back above ground/.test(cave));
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
