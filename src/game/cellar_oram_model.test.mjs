import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { buildMonsterModel } from './monster_models.js';
import { buildStudioCreature } from './studio/creatures.js';
import { loadModel, urlFor } from './models.js';
globalThis.ProgressEvent ||= class {
    constructor(type, values) { this.type = type; Object.assign(this, values); }
};
const originalFetch = globalThis.fetch, assetUrl = urlFor('cellar-oram');
assert(assetUrl.endsWith('/assets/models/cellars/oram/oram.glb'));
globalThis.fetch = async (req) => { const url = typeof req === 'string' ? req : req.url; assert.equal(url, assetUrl); return new Response(await readFile(new URL(assetUrl)), { headers: { 'content-type': 'model/gltf-binary' } }); };
await loadModel('cellar-oram');
const baseline = buildStudioCreature('oramBlackhand'), oram = buildMonsterModel('oramBlackhand');
await oram.ready;
assert(oram.loaded);
assert.equal(oram.height, baseline.height);
assert.equal(oram.radius, baseline.radius);
assert(oram.parts.hit);
assert.equal(oram.clickRadius, baseline.clickRadius);
assert.equal(oram.clickHeight, baseline.clickHeight);
let skinned = 0;
oram.group.traverse(o => { if (o.isSkinnedMesh) {
    skinned++;
    assert(o.geometry.attributes.color, 'Preserves authored face colors');
} });
assert.equal(skinned, 14);
for (const clip of ['walk', 'swing', 'hurt', 'cast', 'die']) {
    oram.setAnim(clip);
    oram.update(.2, 2);
    assert.equal(oram.anim, clip);
}
for (let i = 0; i < 100; i++)
    oram.update(.02, 0);
assert(oram.dieDone);
oram.dispose();
oram.dispose();
baseline.dispose();
globalThis.fetch = originalFetch;
console.log('Oram runtime passed: actual registered GLB, fourteen colored meshes, preserved combat envelope, locomotion, attack, death and disposal.');
