import assert from 'node:assert/strict';
import * as T from 'three';
import { RAID_ATTACKS } from '../mmo/cellar_raid_rules.js';
import { createRaidImpacts } from './cellar_raid_effects.js';
import { createRaidView } from './cellar_raid_view.js';
const scene = new T.Scene(), fx = createRaidImpacts(scene);
for (const [i, spec] of RAID_ATTACKS.entries()) {
    const attack = { ...spec, event: 'test:' + i, landAt: 10000, marks: Array.from({ length: 8 }, (_, n) => [n * 3, n * 2]) };
    fx.prepare(attack, 9000);
    assert.equal(fx.fallingCount, spec.shape === 'marks' ? 8 : 0);
    fx.trigger(attack, 9999);
    assert.equal(fx.activeBursts, 0, 'Never fire before the server deadline');
    fx.trigger(attack, 10000);
    const n = spec.shape === 'marks' ? 8 : 1;
    assert.equal(fx.activeBursts, n);
    fx.trigger(attack, 10020);
    assert.equal(fx.activeBursts, n, 'Ignore repeated impact packets');
    fx.update(10400);
    scene.traverse(o => { if (o.isInstancedMesh) {
        const m = new T.Matrix4();
        for (let j = 0; j < o.count; j++) {
            o.getMatrixAt(j, m);
            assert(m.elements.every(Number.isFinite));
        }
    } });
    const disposal = [];
    scene.traverse(o => { if (o.isLineSegments) {
        o.geometry.addEventListener('dispose', () => disposal.push('cracks'));
    } });
    fx.update(13101);
    assert.equal(fx.activeBursts, 0);
    assert.equal(disposal.length, n, 'Each transient burst releases its geometry');
}
fx.prepare({ ...RAID_ATTACKS[3], landAt: 20000, marks: [[0, 0]] }, 19000);
assert.equal(fx.fallingCount, 1);
fx.reset();
assert.equal(fx.fallingCount, 0);
fx.dispose();
assert.equal(scene.children.length, 0);
// Exercise view-driven cancellation and exit, using actual Three.js effect objects.
function element() { return { style: {}, children: [], setAttribute() { }, append(...c) { this.children.push(...c); }, remove() { this.removed = true; } }; }
globalThis.document = { createElement: element };
const root = element(), view = createRaidView(scene, root, () => { });
const attack = { ...RAID_ATTACKS[3], event: 'view:1', landAt: 2000, marks: [[0, 0]] };
view.update({ status: 'fighting', hp: 100, attack }, { visible: true, connected: true, now: 1000 });
assert(scene.children.some(g => g.children.some(o => o.isInstancedMesh && o.count === 1)));
view.update({ status: 'shielded', attack }, { visible: true, connected: true, now: 1500 });
assert(scene.children.every(g => !g.children.some(o => o.isInstancedMesh && o.count > 0)), 'Shielding cancels falling tombs');
view.update({ status: 'fighting', attack: { ...attack, event: 'view:2', landAt: 3000 } }, { visible: true, connected: true, now: 2100 });
view.update({ status: 'defeated' }, { visible: true, connected: true, now: 2900 });
assert(scene.children.every(g => !g.children.some(o => o.isInstancedMesh && o.count > 0)));
view.update({ status: 'fighting', attack }, { visible: false, now: 4000 });
view.dispose();
assert.equal(scene.children.length, 0);
assert(root.children.every(c => c.removed));
delete globalThis.document;
console.log('Raid effects passed: four timed shapes, replay control, finite particles, transient disposal, shield cancellation, defeat and dungeon exit.');
