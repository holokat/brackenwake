import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from '../editor/test_dom.mjs';
import { createContextMinimap } from '../context_minimap.js';
import { paintDungeonMap, MAP_COLOURS } from './paint.js';
import { createExploration } from './exploration.js';
import { createOldCellars } from '../../world/old_cellars.js';
import { worldOf } from '../../world/dungeon_gen.js';
import { createWorldField } from '../../world/field.js';
import { viewOf } from '../minimap.js';

function context() {
  const rectangles = [], texts = [], gradients = [];
  const ctx = { rectangles, texts, gradients, fillStyle: '',
    fillRect(...args) { rectangles.push({ colour: this.fillStyle, args }); },
    fillText(text) { texts.push(text); },
    measureText(text) { return { width: text.length * 6 }; },
    createRadialGradient(...args) {
      const gradient = { args, stops: [], addColorStop(...stop) { this.stops.push(stop); } };
      gradients.push(gradient); return gradient;
    },
  };
  for (const key of ['save', 'restore', 'scale', 'beginPath', 'rect', 'clip', 'arc', 'fill', 'stroke',
    'moveTo', 'lineTo', 'closePath', 'clearRect', 'translate', 'rotate', 'setLineDash', 'strokeRect', 'strokeText', 'drawImage']) ctx[key] = () => {};
  return ctx;
}
function dom() {
  const doc = makeDom(), create = doc.createElement;
  doc.createElement = tag => {
    const el = create(tag);
    if (tag === 'canvas') { const ctx = context(); el.getContext = () => ctx; }
    Object.defineProperty(el, 'parentNode', { get: () => el.parent });
    el.removeChild = c => c.remove();
    el.querySelector = selector => el.children.find(c => c.classList.contains(selector.slice(1))) || null;
    return el;
  };
  return doc;
}

test('unseen geometry and stairs are never painted; found stairs remain mapped', () => {
  const L = createOldCellars(1, { id: 'oldcellars' }), map = createExploration(L);
  const ctx = context(), whole = viewOf(0, 0, 440);
  let report = paintDungeonMap(ctx, map, whole);
  assert.equal(report.floorCells, 0); assert.deepEqual(report.stairs, []);
  assert.equal(ctx.gradients.length, 0);
  assert.equal(ctx.rectangles.filter(r => r.colour === MAP_COLOURS.visible).length, 0);
  let p = worldOf(L, L.entrance.gx, L.entrance.gz); map.reveal(p.x, p.z);
  report = paintDungeonMap(ctx, map, whole);
  assert.ok(report.floorCells > 0); assert.deepEqual(report.stairs, ['up']);
  assert.ok(ctx.gradients.length > 0, 'only discovered edges fade into the unknown');
  p = worldOf(L, L.stair.gx, L.stair.gz); map.reveal(p.x, p.z);
  report = paintDungeonMap(ctx, map, whole);
  assert.deepEqual(report.stairs, ['up', 'down']);
  assert.ok(ctx.rectangles.some(r => r.colour === MAP_COLOURS.remembered));
});

test('the HUD factory switches maps, blocks outdoor input and preserves outdoor zoom', () => {
  const doc = dom(), root = doc.createElement('div'), player = { pos: { x: 0, z: 0 }, yaw: 0 };
  let L = null, character = {}, warps = 0, outdoorReads = 0;
  const field = createWorldField(1);
  const map = createContextMinimap(root, { doc, player, camera: { forwardYaw: 0 },
    field: () => { outdoorReads++; return field; }, spaces: {}, zone: null,
    character: () => character, dungeon: () => L, isDev: true, onWarp() { warps++; },
  });
  map.update(1); const outdoorSpan = map.span, baseReads = outdoorReads;
  const originalEl = map.el;
  L = createOldCellars(1, { id: 'oldcellars' }); player.pos = worldOf(L, L.entrance.gx, L.entrance.gz);
  map.update(.2);
  assert.equal(map.inDungeon, true); assert.equal(map.el, originalEl);
  assert.match(map.el.title, /^Dungeon map/);
  assert.equal(map.span, 96); assert.ok(map.last.floorCells > 0);
  assert.equal(outdoorReads, baseReads);
  assert.ok(map.live.arrow); assert.equal(map.live.waypoint, null);
  const overlay = map.el.children.find(c => c.classList.contains('dungeon-map'));
  let stops = 0;
  const event = { deltaY: -100, preventDefault() {}, stopPropagation() { stops++; } };
  overlay.fire('pointerdown', event); overlay.fire('wheel', event);
  map.update(.2);
  assert.equal(stops, 2); assert.equal(warps, 0); assert.ok(map.span < 96);
  const seen = map.exploration.seen.slice(), key = map.exploration.key;
  const paints = map.paints;
  for (let i = 0; i < 600; i++) map.update(1 / 60);
  assert.equal(map.paints, paints, 'idle map must not repaint terrain');
  map.setShown(false);
  player.pos = worldOf(L, L.stair.gx, L.stair.gz); map.update(.2);
  assert.equal(map.paints, paints); assert.ok(map.exploration.seen.reduce((a, b) => a + b) > seen.reduce((a, b) => a + b));
  map.setShown(true); map.update(.2); assert.ok(map.paints > paints);
  L = createOldCellars(1, { id: 'oldcellars' }, 2); player.pos = worldOf(L, L.entrance.gx, L.entrance.gz); map.update(.2);
  assert.notEqual(map.exploration.key, key);
  assert.equal(map.exploration.seen[L.stair.gz * L.w + L.stair.gx], 0);
  L = createOldCellars(1, { id: 'oldcellars' }); map.update(.2);
  assert.equal(map.exploration.seen[L.stair.gz * L.w + L.stair.gx], 1);
  character = {}; map.update(.2);
  assert.equal(map.exploration.seen[L.stair.gz * L.w + L.stair.gx], 0);
  L = null; player.pos = { x: 100, z: 100 }; map.update(.2);
  assert.equal(map.inDungeon, false); assert.equal(map.span, outdoorSpan);
  assert.match(map.el.title, /500 m/);
  assert.ok(outdoorReads > baseReads); assert.equal(overlay.hidden, true);
  map.dispose(); assert.equal(root.children.length, 0);
});
