import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { buildSearchIndex, searchIndex, locateResult, modeForResult, focusSearchPoint, SEARCH_LIMIT } from './search.js';
import { SPACES, emptySpace } from '../../mmo/spaces/index.js';
import { createEditor } from './editor.js';
import { MODES, toolsFor } from './modes.js';

const t = performance.now();
const ed = createEditor();
const index = buildSearchIndex(ed.searchSpaces());
const buildMs = performance.now() - t;
for (const mode of MODES) for (const tool of toolsFor(mode.id)) {
  assert(index.some(r => r.scope === 'library' && r.tool.tab === tool.tab && r.tool.id === tool.id));
}
assert.equal(index.filter(r => r.scope === 'places').length, Object.keys(SPACES).length);
assert(searchIndex(index, 'Hearthhome', 'places').rows.some(r => r.spaceId === 'greenwold_hearthhome'));
assert(searchIndex(index, 'Nan Ockley', 'placed').rows.some(r => r.entry.name === 'nan'));
assert(searchIndex(index, 'oak', 'library').rows.some(r => r.tool.tab === 'trees'));
assert(searchIndex(index, 'oak', 'placed').rows.every(r => r.scope === 'placed'));
assert.equal(searchIndex(index, 'xyznonexistent927').total, 0);
assert.equal(searchIndex(index, '').rows.length, SEARCH_LIMIT);
assert(searchIndex(index, '', 'all', SEARCH_LIMIT * 2).rows.length > SEARCH_LIMIT);

const draft = emptySpace('search_test', 'Search yard', 100, 200, 30);
draft.pieces.push({ model: 'cottage_a', x: 3, z: 4 }, { model: 'barrel', x: 8, z: 9 });
ed.open(draft); ed.setSpace({ name: 'The renamed yard' });
let rows = buildSearchIndex(ed.searchSpaces());
assert.equal(searchIndex(rows, 'renamed yard', 'places').total, 1);
const row = rows.find(r => r.spaceId === draft.id && r.entry?.model === 'barrel');
ed.select({ list: 'pieces', index: 0 }); ed.del();
let hit = locateResult(row, ed.searchSpaces());
assert.equal(hit.selection.index, 0, 'deleting an earlier row resolves the remaining object');
assert.deepEqual(hit.point, { x: 108, z: 209 });
ed.open(hit.space); ed.select(hit.selection); ed.moveTo(112, 214);
hit = locateResult(row, ed.searchSpaces());
assert.deepEqual(hit.point, { x: 112, z: 214 }, 'the live draft owns its latest position');
ed.del(); assert.equal(locateResult(row, ed.searchSpaces()), null, 'a deleted result cannot select its neighbour');
assert.equal(modeForResult({ list: 'people' }), 'people');
const camera = new THREE.PerspectiveCamera();
const ctx = { sc: { camera }, camera: {}, dev: { on: true }, runtime: { heightAt: () => 12 } };
assert(focusSearchPoint(ctx, { x: 100, z: 200 }, 30));
const direction = camera.getWorldDirection(new THREE.Vector3());
assert(direction.z < 0 && direction.y < 0 && ctx.camera.pitch > 0);
ctx.dev.on = false;
const before = camera.position.clone();
assert.equal(focusSearchPoint(ctx, { x: 0, z: 0 }), false);
assert(camera.position.equals(before), 'search never moves the gameplay camera');
const times = [];
for (let i = 0; i < 100; i++) { const start = performance.now(); searchIndex(index, ['oak', 'hearthhome', 'forge', 'wolf'][i % 4]); times.push(performance.now() - start); }
times.sort((a, b) => a - b);
console.log(JSON.stringify({ rows: index.length, places: Object.keys(SPACES).length, buildMs, queryMedianMs: times[50], queryP95Ms: times[95], checks: 'catalog, scopes, limits, no match, unsaved edits, stale selection, real editor selection and camera' }, null, 2));
