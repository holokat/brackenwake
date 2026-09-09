import test from 'node:test';
import assert from 'node:assert/strict';
import {distribution, summariseFrames} from './stats.js';
test('frame percentiles retain isolated stalls and exclude invalid values', () => {
  const result=distribution([...Array(99).fill(16),200,NaN,Infinity]);
  assert.equal(result.count,100);assert.equal(result.p95,16);assert.equal(result.max,200);assert.equal(result.mean,17.84);
});
test('segments count long frames and retain the responsible system costs', () => {
  const result=summariseFrames([{t:0,dt:16,cpu:4,calls:20,triangles:100,systems:{'world.render':3}},
    {t:16,dt:120,cpu:110,calls:40,triangles:100,systems:{'world.update':100,'world.render':8}}]);
  assert.equal(result.over100ms,1);assert.equal(result.over50ms,1);assert.equal(result.spikes[0].systems['world.update'],100);
  assert.equal(result.systems['world.update'].mean,50);assert.equal(result.drawCalls.mean,30);
});
test('an empty segment is missing data, not zero latency',()=>{assert.equal(distribution([]).mean,null);});
