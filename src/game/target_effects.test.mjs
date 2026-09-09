import * as T from 'three';
import assert from 'node:assert/strict';
import { targetEffectLabels } from './target_effects.js';
import { speedOf } from './monsters.js';
import { nameplateOf } from './targeting.js';
const target = { name: 'Skeleton', health: 100, maxHealth: 100, run: 6,
  status: { slow: { until: 14000, untilS: 14, factor: .3 }, root: { until: 11500 } },
  dots: [{ type: 'fire', until: 13 }, { type: 'fire', until: 14 }], buffs: [] };
assert.deepEqual(targetEffectLabels(target, 10), ['Slowed 30% 4 s', 'Rooted 2 s', 'Burning 4 s']);
assert.equal(speedOf(target, 10000), 0);
assert.equal(speedOf(target, 12000), 6 * .7);
assert.equal(speedOf(target, 14000), 6);
assert.deepEqual(targetEffectLabels(target, 14), []);
assert.deepEqual(targetEffectLabels({ ...target, health: 0 }, 10), []);
assert(targetEffectLabels({ ...target, status: { slow: { until: 14000, factor: .5 } } }, 10).includes('Slowed 50% 4 s'));
assert.deepEqual(targetEffectLabels({ health: 1, status: { slow: { until: NaN } } }, 0), []);
const camera=new T.PerspectiveCamera(60,1,.1,100);camera.position.set(0,5,15);camera.lookAt(0,2,0);camera.updateMatrixWorld();
const plate=nameplateOf({...target,pos:{x:0,y:0,z:0}}, {skills:{}}, camera, 600, 600, 2, 10);
assert(plate.tags.includes('Slowed 30% 4 s'),'live nameplate includes control effect');
console.log('Target effects: expiry, clock units, duplicate burns, root, slow magnitude and death passed.');
