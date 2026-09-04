// Ore: a third building material, mined from the seamed rock at cave mouths.
// Run: node src/farm/ore.test.mjs
//
// Two claims are worth measuring here, because both have been shipped broken
// before in this codebase:
//   1. a rock field hands over the material it declares, and ONLY that one.
//   2. adding a key to the save does not cost an existing player anything.
//
// The real path is used throughout: chopTree drives breakRock (no direct call
// to a private helper), and the Game is saved and re-loaded through localStorage
// rather than by handing a snapshot straight to _absorb.

import * as THREE from 'three';

// browser globals the real path touches. requestAnimationFrame is only used to
// animate the shards; a no-op is enough to let the payout return.
globalThis.requestAnimationFrame = () => 0;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const { createTreeField, chopTree, clearTreeFields, ROCK_YIELDS } = await import('./tree_edit.js');
const { Game, MATERIALS, MATERIAL_BASE_CAP } = await import('./game.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---------------------------------------------------------------------------
// 1. breakRock pays out the field's declared yield
// ---------------------------------------------------------------------------

function rockField(extra, n) {
  clearTreeFields();
  const field = createTreeField({
    name: `test:${extra.yield || 'stone'}`, kind: 'rock', hits: 1,
    parent: new THREE.Object3D(),
    layers: [{
      geo: new THREE.BoxGeometry(1, 1, 1), mat: new THREE.MeshBasicMaterial(),
      of: (t) => ({ x: t.x, y: t.gy, z: t.z, s: 1 }),
    }],
    ...extra,
  });
  for (let i = 0; i < n; i++) field.add({ x: i, z: 0, gy: 0, s: 1, ry: 0 });
  field.rebuild();
  return field;
}

// each break is one swing (hits: 1), so every call returns a payout
function breakAll(field) {
  const out = [];
  for (let i = 0; i < field.trees.length; i++) out.push(chopTree(field, i));
  return out;
}

{
  const ore = breakAll(rockField({ yield: 'ore' }, 300));
  check('every ore swing fells the rock', ore.every((r) => r && r.felled === true));
  check('an ore field pays ore', ore.every((r) => Number.isFinite(r.ore)));
  check('an ore field pays NO stone', ore.every((r) => r.stone === undefined));
  const amounts = ore.map((r) => r.ore);
  const lo = Math.min(...amounts), hi = Math.max(...amounts);
  check('ore comes 1 to 2 at a time', lo === 1 && hi === 2, `saw ${lo}..${hi}`);
}

{
  const stone = breakAll(rockField({}, 300));
  check('a field with no declared yield pays stone', stone.every((r) => Number.isFinite(r.stone)));
  check('a default field pays NO ore', stone.every((r) => r.ore === undefined));
  const amounts = stone.map((r) => r.stone);
  const lo = Math.min(...amounts), hi = Math.max(...amounts);
  check('stone still comes 2 to 4 at a time', lo === 2 && hi === 4, `saw ${lo}..${hi}`);
}

{
  // a yield nobody can hold would be dropped on the floor by main.js
  const unspendable = Object.keys(ROCK_YIELDS).filter((g) => !MATERIALS.has(g));
  check('every rock yield is a real material', unspendable.length === 0, unspendable.join(', '));
}

{
  // the world's ore field must actually declare the yield, or mining the seam
  // silently pays stone. Read the source rather than importing flora.js, which
  // builds THREE geometry for the whole world.
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../world/flora.js', import.meta.url), 'utf8'));
  const line = src.split('\n').find((l) => l.includes("name: 'world:ore'")) || '';
  check("the world's ore field declares yield: 'ore'", /yield:\s*'ore'/.test(line), line.trim());
}

// ---------------------------------------------------------------------------
// 2. ore in the game state: its own pool, saved and loaded
// ---------------------------------------------------------------------------

const PK = 'testpk';
const KEY = `nostrux-game-${PK}`;

{
  store.clear();
  const g = new Game(PK);
  check('ore is a material, not produce', g.isMaterial('ore') === true);
  check('ore has its own cap', g.capFor('ore') === MATERIAL_BASE_CAP, `${g.capFor('ore')}`);
  g.addGood('carrot', 4);
  const lost = g.addGood('ore', 7);
  check('ore is credited in full when there is room', lost === 0 && g.inventory.ore === 7);
  check('ore does not eat the goods pool', g.inventoryTotal() === 4, `${g.inventoryTotal()}`);

  // overflow is REPORTED, not swallowed: main.js puts the number in the toast
  const over = g.addGood('ore', MATERIAL_BASE_CAP);
  check('a full ore pool reports what did not fit', over === 7, `${over} of ${MATERIAL_BASE_CAP} did not fit`);
  check('ore stops at the cap', g.inventory.ore === MATERIAL_BASE_CAP);
  check('a full ore pool has no room left', g.roomFor('ore') === 0);
}

{
  // round trip through localStorage, the way the game actually saves
  store.clear();
  const a = new Game(PK);
  a.addGood('ore', 12);
  a.addGood('stone', 5);
  a.addGood('wood', 3);
  a.coins = 321;
  a.save();
  const b = new Game(PK);
  check('ore survives a save and load', b.inventory.ore === 12, `${b.inventory.ore}`);
  check('wood and stone still survive too', b.inventory.stone === 5 && b.inventory.wood === 3);
  check('coins survive alongside it', b.coins === 321);
  check('ore is in the collection book once obtained', b.discovered.includes('ore'));
  check('the save version did not have to move', b.snapshot().v === 3, `v${b.snapshot().v}`);
}

{
  // an old save, written before ore existed. Nothing may be lost, and ore reads
  // as 0 without a zero entry being seeded into the inventory map.
  store.clear();
  const old = {
    v: 3, tier: 2, plots: [null, { type: 'carrot', growth: 3 }], placed: [],
    harvested: 9, coins: 77, inventory: { carrot: 4, wood: 20, stone: 11 },
    owned: ['axe', 'pickaxe'], discovered: ['carrot', 'wood', 'stone'],
    jobs: {}, orders: [], stats: { chopped: 5 }, savedAt: Date.now() - 1000,
  };
  store.set(KEY, JSON.stringify(old));
  const g = new Game(PK);
  check('an ore-less save still loads', g.coins === 77 && g.tier === 2);
  check('ore reads as 0', (g.inventory.ore || 0) === 0);
  check('no phantom ore entry is seeded', !('ore' in g.inventory));
  check('nothing else was lost', g.harvested === 9 && g.inventory.carrot === 4
    && g.inventory.wood === 20 && g.inventory.stone === 11
    && g.owned.join() === 'axe,pickaxe' && g.plots[1]?.type === 'carrot'
    && g.stats.chopped === 5);
  check('the old save can hold ore straight away', g.addGood('ore', 3) === 0 && g.inventory.ore === 3);
  g.save();
  check('and keeps it on the next load', new Game(PK).inventory.ore === 3);
}

console.log(`\n  ore: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
