import assert from 'node:assert/strict';
import {createSystems} from './system.js';
const values=new Map(),calls=[];
const ctx={has:id=>values.has(id),register:(id,value)=>values.set(id,value),get:id=>values.get(id)};
const root={name:'root',create:()=>({value:7}),dispose:received=>{assert.equal(received,ctx);assert.equal(received.get('root').value,7);calls.push('root');}};
const effect={name:'effect',deps:['root'],create:()=>({dispose:()=>calls.push('resource')}),dispose:received=>{received.get('effect').dispose();calls.push('effect');}};
createSystems(ctx,[root,effect]).dispose();
assert.deepEqual(calls,['resource','effect','root']);
console.log('System disposal passes context and releases dependent resources first.');
