import assert from 'node:assert/strict';
import * as T from 'three';
import {furnishCellarEntry} from './cellar_entry.js';
import {furnishCellarDescent} from './cellar_descent.js';
import {createCellarLoadingGeometry} from './cellar_loading_geometry.js';
import {rampHeight} from './collision/shapes.js';
import {createOldCellars} from './old_cellars.js';
function fixture(){return{group:new T.Group(),physicalBodies:[],parts:{walls:[]},exits:[]};}
function fakeAsset(){const scene=new T.Group(),material=new T.MeshStandardMaterial({color:0x777777}),geometry=new T.BoxGeometry(1,1,1);scene.add(new T.Mesh(geometry,material));return{scene,material,geometry};}
// A visible sloped proxy matches support height before its detailed mesh arrives.
const ramp={kind:'ramp',x:2,y:-3,z:4,w:5,d:20,h:7,direction:-1,thickness:.4,c:1,s:0};
const proxy=createCellarLoadingGeometry([ramp]);proxy.group.updateMatrixWorld(true);
for(const z of [-5,0,8,13]){
 const hits=new T.Raycaster(new T.Vector3(2,20,z),new T.Vector3(0,-1,0)).intersectObject(proxy.group,true);
 assert(hits.length);assert(Math.abs(hits[0].point.y-rampHeight(ramp,2,z))<1e-5);
}
proxy.dispose();proxy.dispose();
for(const level of [1,2]){
 const L=createOldCellars(22,{id:'oldcellars'},level);if(level===2)L.descent=L.descent.filter(r=>r.roomId===9);
 const furnish=(built,load)=>level===1?furnishCellarEntry(built,L,{load}):furnishCellarDescent(built,L,{load});
 // Failing loads preserve visible collision proxies and cannot fabricate success.
 let built=fixture(),art=furnish(built,async()=>null);
 assert(built.physicalBodies.length>0);assert(built.group.children.length>0);assert.equal(await art.ready,false);assert.equal(art.loaded,false);art.dispose();assert.equal(built.group.children.length,0);
 // Disposing during a pending load must not attach late geometry or dispose a
 // caller-owned template. This also covers a rapid floor change while streaming.
 let resolve;built=fixture();art=furnish(built,()=>new Promise(r=>resolve=r));const late=fakeAsset();let templateDisposals=0;late.material.addEventListener('dispose',()=>templateDisposals++);
 art.dispose();resolve(late);assert.equal(await art.ready,false);assert.equal(built.group.children.length,0);assert.equal(templateDisposals,0);late.material.dispose();late.geometry.dispose();
 // Loaded instances have their own materials; repeated cleanup is harmless.
 built=fixture();const asset=fakeAsset();art=furnish(built,async()=>asset);assert.equal(await art.ready,true);assert(art.loaded);
 let clone,cloneDisposals=0;built.group.traverse(o=>{if(o.isMesh&&o.geometry===asset.geometry)clone=o.material;});assert(clone&&clone!==asset.material);clone.addEventListener('dispose',()=>cloneDisposals++);
 art.dispose();art.dispose();assert.equal(cloneDisposals,1);assert.equal(built.group.children.length,0);asset.material.dispose();asset.geometry.dispose();
}
console.log('CELLAR_STREAMING_VERIFIED');
