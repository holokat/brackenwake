import test from 'node:test';
import assert from 'node:assert/strict';
import { createExploration, dungeonMapKey, hydrateDungeonMaps, unexploredEdges } from './exploration.js';
import { generateDungeon, worldOf, walkable } from '../../world/dungeon_gen.js';
import { generateCavern } from '../../world/cavern_gen.js';
import { createOldCellars } from '../../world/old_cellars.js';
import { createShoulderWorking } from '../../world/shoulder_working.js';
import { DUNGEONS } from '../../mmo/dungeons.js';
import { hydrate, blankCharacter, createState } from '../state.js';

function room(w = 35, h = 35) {
  const L = { id: 'test-room', seed: 1, level: 1, w, h, cells: Array(w * h).fill(1), entrance: { gx: 2, gz: 2 } };
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++)
    if (x === 0 || z === 0 || x === w - 1 || z === h - 1) L.cells[z * w + x] = 0;
  return L;
}
const visit = (map, gx, gz) => { const p = worldOf(map.layout, gx, gz); return map.reveal(p.x, p.z); };
const at = (map, gx, gz) => map.seen[gz * map.layout.w + gx];

test('a new chart is blank; nearby walls are drawn but block rooms behind them', () => {
  const L = room();
  for (let z = 1; z < 34; z++) L.cells[z * L.w + 15] = 0;
  const map = createExploration(L);
  assert.equal(map.seen.reduce((a, b) => a + b), 0);
  assert.ok(visit(map, 12, 17) > 0);
  assert.equal(at(map, 15, 17), 1);
  assert.equal(at(map, 16, 17), 0);
  assert.equal(at(map, 25, 17), 0);
  assert.equal(at(map, 12, 28), 0);
  const revision = map.revision;
  assert.equal(visit(map, 12, 17), 0);
  assert.equal(map.revision, revision);
});

test('sight cannot leak diagonally between touching walls', () => {
  const L = room(9, 9); L.cells[3 * 9 + 4] = 0; L.cells[4 * 9 + 3] = 0;
  const map = createExploration(L); visit(map, 3, 3);
  assert.equal(at(map, 4, 4), 0);
  assert.equal(at(map, 5, 5), 0);
  assert.equal(at(map, 4, 3), 1);
});

test('walking reveals progressively; a teleport does not chart the ground crossed', () => {
  const map = createExploration(room(80, 25));
  visit(map, 5, 12); const first = map.seen.slice();
  visit(map, 10, 12);
  assert.ok(map.seen.reduce((a, b) => a + b) > first.reduce((a, b) => a + b));
  visit(map, 70, 12);
  assert.equal(at(map, 40, 12), 0);
  assert.equal(at(map, 5, 12), 1);
  assert.equal(map.visible[12 * 80 + 5], 0);
  assert.equal(map.reveal(NaN, 0), 0);
  assert.equal(visit(map, 0, 0), 0);
  assert.equal(map.visible.reduce((a, b) => a + b), 0);
});

test('gold frontier edges lead only from remembered floor into unseen floor', () => {
  const map = createExploration(room()); visit(map, 12, 17);
  assert.deepEqual(unexploredEdges(map, 21, 17), [[0, -1], [1, 0], [0, 1]]);
  assert.deepEqual(unexploredEdges(map, 12, 17), []);
  assert.deepEqual(unexploredEdges(map, 30, 17), []);
  const wall = createExploration(room()); visit(wall, 2, 2);
  assert.ok(unexploredEdges(wall, 1, 2).every(([dx]) => dx !== -1));
});

test('the real character hydration path preserves maps and isolates characters, levels and layouts', () => {
  const L = room(), character = blankCharacter(), map = createExploration(L, character);
  visit(map, 8, 8);
  const loaded = hydrate(JSON.parse(JSON.stringify(character)));
  assert.deepEqual(createExploration({ ...L, cells: [...L.cells] }, loaded).seen, map.seen);
  assert.equal(createExploration(L, blankCharacter()).seen.some(Boolean), false);
  for (const patch of [{ level: 2 }, { id: 'another' }, { seed: 2 }, { cx: 42 }]) {
    const next = createExploration({ ...L, ...patch }, loaded);
    assert.notEqual(next.key, map.key);
    assert.equal(next.seen.some(Boolean), false);
  }
  const rebuilt = { ...L, cells: [...L.cells] }; rebuilt.cells[1] = 1;
  assert.notEqual(dungeonMapKey(rebuilt), map.key);
  assert.equal(createExploration(rebuilt, loaded).seen.some(Boolean), false);
});

test('malformed, oversized and obsolete chart data does not break character loading', () => {
  for (const raw of [null, [], 1, { 'd1:bad': { w: -1, h: 2, seen: 'f' } },
    { 'd1:bad': { w: 2, h: 2, seen: 'z' } }, { 'd1:bad': { w: 999999, h: 999999, seen: 'f' } },
    { 'd1:bad': { w: 2, h: 2, seen: 'ffff' } }]) assert.deepEqual(hydrateDungeonMaps(raw), {});
  const raw = Object.fromEntries(Array.from({ length: 150 }, (_, i) => ['d1:' + i, { w: 2, h: 2, seen: 'f' }]));
  assert.equal(Object.keys(hydrateDungeonMaps(raw)).length, 128);
  assert.ok(hydrate({ dungeonMaps: raw }).dungeonMaps['d1:149']);
});

test('saving and reopening a real character slot retains exploration', () => {
  const memory = new Map(), storage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: key => memory.delete(key),
  };
  const state = createState({ storage });
  state.setCharacter({ ...blankCharacter(), name: 'Chart test', opening: 'mage' });
  const L = room(), map = createExploration(L, state.character);
  visit(map, 8, 8);
  assert.equal(state.save(), true);
  const reopened = createState({ storage });
  assert.equal(reopened.openSlot(state.slot), true);
  assert.deepEqual(createExploration(L, reopened.character).seen, map.seen);
});

test('all authored depths and every generated dungeon family chart their actual entrance', () => {
  const layouts = [createShoulderWorking(1, { id: 'shoulder-working' })];
  for (let level = 1; level <= 8; level++) layouts.push(createOldCellars(1, { id: 'oldcellars' }, level));
  for (const spec of Object.values(DUNGEONS)) {
    const site = { id: spec.id, sub: spec.id, kind: spec.place, name: spec.name, cx: 3, cz: 7 };
    for (let depth = 1; depth <= spec.levels; depth++)
      layouts.push(spec.kind === 'cavern' ? generateCavern(1, site, depth, spec) : generateDungeon(1, site, depth, spec));
  }
  for (const L of layouts) {
    const map = createExploration(L), e = L.entrance;
    assert.ok(walkable(L, e.gx, e.gz), L.name);
    visit(map, e.gx, e.gz);
    assert.equal(at(map, e.gx, e.gz), 1, L.name);
    assert.ok(map.seen.some(v => !v), L.name);
    assert.ok(map.visible.reduce((a, b) => a + b) <= 253, L.name);
  }
  console.log(`Verified entrance discovery and bounded sight on ${layouts.length} dungeon layouts.`);
});
