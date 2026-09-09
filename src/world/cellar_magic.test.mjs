import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createCellarMagic} from './cellar_magic.js';
test('magic fixtures share a stable light budget and only animate nearby rooms',()=>{
 const parent=new T.Group(),anchors=Array.from({length:20},(_,i)=>({kind:'arcane',x:i*100,y:3,z:0,color:0x3377ff}));
 const magic=createCellarMagic(parent,anchors),lights=[];magic.group.traverse(o=>{if(o.isLight)lights.push(o);});
 assert.equal(lights.length,3);magic.update(1,{x:0,z:0});
 assert.equal(lights.filter(l=>l.intensity>0).length,1);assert.equal(lights[0].position.x,0);
 const far=magic.group.children.find(o=>!o.isLight&&o.position.x===1000),geometry=far.children[0].geometry;
 const version=geometry.attributes.position.version;magic.update(2,{x:0,z:0});assert.equal(geometry.attributes.position.version,version);assert.equal(far.visible,false);
 magic.update(3,{x:1000,z:0});assert(far.visible);assert.equal(lights[0].position.x,1000);assert(geometry.attributes.position.version>version);
 magic.update(4,{x:10000,z:0});assert(lights.every(l=>l.intensity===0));assert(lights.every(l=>l.visible),'light count stays stable');
 magic.dispose();magic.dispose();assert.equal(parent.children.length,0);
});
