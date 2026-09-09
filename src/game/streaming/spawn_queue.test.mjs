import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpawnQueue} from './spawn_queue.js';
function setup(){const jobs=[],live=new Set(),dead=new Set();const queue=createSpawnQueue({work:{run:(fn,o)=>new Promise(resolve=>jobs.push(()=>{if(!o.signal.aborted)fn();resolve();}))},spawn:r=>live.add(r.key),has:k=>live.has(k),canSpawn:r=>!dead.has(r.key)});return{queue,jobs,live,dead};}
const rec=(key,d)=>({rec:{key},d2:d*d});
test('near enemies arrive immediately while distant bodies are bounded by the shared work queue',()=>{
 const {queue,jobs,live}=setup();queue.reconcile([rec('near',10),rec('far',100),rec('farther',200)]);
 assert.deepEqual([...live],['near']);assert.equal(queue.pending,2);jobs.shift()();assert.deepEqual([...live],['near','far']);
});
test('approaching a queued creature promotes it immediately without creating duplicates',()=>{
 const {queue,jobs,live}=setup();queue.reconcile([rec('far',100)]);queue.reconcile([rec('far',10)]);
 assert(live.has('far'));assert.equal(queue.pending,0);jobs.shift()();assert.equal(live.size,1);
});
test('floor changes, changed rosters and deaths invalidate pending work',()=>{
 const {queue,jobs,live,dead}=setup();queue.reconcile([rec('old',100),rec('dead',100)]);
 queue.reconcile([rec('dead',100)]);dead.add('dead');for(const job of jobs.splice(0))job();assert.equal(live.size,0);
 queue.reconcile([rec('new',100)]);queue.clear();for(const job of jobs)job();assert.equal(live.size,0);assert.equal(queue.pending,0);
});
