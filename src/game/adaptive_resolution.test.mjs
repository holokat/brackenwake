import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptiveResolution} from './adaptive_resolution.js';
const feed = (r, ms, count) => {for(let i=0;i<count;i++)r.sample(ms);return r.ratio;};
test('sustained slow frames reduce pixel work without crossing the quality floor',()=>{
 const r=createAdaptiveResolution();assert.equal(feed(r,34,31),1.5);
 assert(feed(r,34,31)<1.5);assert.equal(feed(r,34,1000),.85);
});
test('isolated stalls, pauses and fast foreground frames do not degrade quality',()=>{
 const r=createAdaptiveResolution();for(let i=0;i<20;i++){feed(r,16.67,60);r.sample(95);r.sample(2000);}
 assert.equal(r.ratio,1.5);
});
test('recovery is gradual, respects the selected ceiling and can be disabled for measurement',()=>{
 const r=createAdaptiveResolution({ceiling:1});feed(r,34,200);assert.equal(r.ratio,.85);
 feed(r,16.67,600);assert.equal(r.ratio,.85);feed(r,16.67,180);assert.equal(r.ratio,.9);
 feed(r,16.67,2400);assert.equal(r.ratio,1);
 r.enabled=false;assert.equal(feed(r,34,300),1);
 r.setCeiling(.7);r.enabled=true;assert.equal(feed(r,34,300),.7);
});
