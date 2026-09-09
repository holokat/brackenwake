import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// The threshold remains at the existing exit. The flight runs north, away from
// the boss and the returning player's landing. Dimensions are in metres.
export const CELLAR_STAIR = Object.freeze({width:3.6, depth:6, steps:8, drop:.28, holeWidth:6.1});
export function hasCommandStair(L){return L.siteId==='oldcellars'&&L.level===1&&!!L.stair;}
export function createCellarStairModel(){
 const group=new T.Group();group.name='Cellar stairs down';
 const batches=[[],[],[]],materials=[
  new T.MeshStandardMaterial({name:'Cellar stair stone',color:0x9c927b,roughness:.92,vertexColors:true}),
  new T.MeshStandardMaterial({name:'Cellar stair bronze',color:0x9b743c,metalness:.45,roughness:.58}),
  new T.MeshStandardMaterial({name:'Cellar stair lantern glow',color:0xffcb80,emissive:0xffb75d,emissiveIntensity:1.6,roughness:.7}),
 ];
 const box=(x,y,z,w,h,d,material=0,tint=1)=>{
  const g=new T.BoxGeometry(w,h,d).toNonIndexed();g.translate(x,y,z);
  if(material===0){const colors=new Float32Array(g.attributes.position.count*3);colors.fill(tint);g.setAttribute('color',new T.BufferAttribute(colors,3));}
  batches[material].push(g);
 };
 // Broad flush shoulders cover the cut tile edges. The central opening stays clear.
 for(const side of [-1,1]){
  box(side*2.5,-.05,-3,1.4,.24,6.5,0,.77);
  for(let i=0;i<6;i++){
   box(side*2.04,.3,-.5-i,.45,.6,.96,0,i%2?.72:.8);
   box(side*2.04,.64,-.5-i,.59,.12,.97,0,1);
  }
  box(side*2.04,-1.08,-3,.48,2.2,6,0,.53);
  box(side*2.25,.67,.03,.85,1.34,.9,0,.88);
  box(side*2.25,1.4,.03,1.02,.16,1.04);
  box(side*2.25,1.55,.03,.5,.15,.5,1);
  box(side*2.25,1.93,.03,.3,.65,.3,2);
  for(const x of [-.23,.23])for(const z of [-.23,.23])box(side*2.25+x,1.94,.03+z,.065,.76,.065,1);
  box(side*2.25,2.35,.03,.64,.14,.64,1);
 }
 box(0,-.1,.19,4,.28,.38);
 box(0,.052,.18,3.4,.025,.07,1);
 // Exposed treads darken as they descend. Brass nosings catch the existing exit light.
 for(let i=0;i<CELLAR_STAIR.steps;i++){
  const z=-.375-i*.75,y=-i*CELLAR_STAIR.drop;
  box(0,y-.15,z,3.6,.3,.75,0,1-i*.065);
  box(0,y+.015,z-.32,3.45,.03,.075,1);
 }
 box(0,-2.35,-3.3,3.6,.18,6.6,0,.38);
 // A dark arch at the foot makes this a passage, rather than a walled-off pit.
 const tunnel=new T.Shape();tunnel.moveTo(-2.25,-2.3);tunnel.lineTo(2.25,-2.3);tunnel.lineTo(2.25,-.72);tunnel.absarc(0,-.72,2.25,0,Math.PI,false);tunnel.closePath();
 const shadow=new T.ShapeGeometry(tunnel,12).toNonIndexed();shadow.translate(0,0,-5.97);
 const shade=new Float32Array(shadow.attributes.position.count*3);shade.fill(.018);shadow.setAttribute('color',new T.BufferAttribute(shade,3));batches[0].push(shadow);
 for(const side of [-1,1])box(side*1.98,-1.49,-6.2,.56,1.55,.65,0,.74);
 for(let i=0;i<11;i++){
  const a=i*Math.PI/11+.012,b=(i+1)*Math.PI/11-.012,vertices=[];
  for(const z of [-5.86,-6.53])for(const [r,t] of [[1.7,a],[2.27,a],[2.27,b],[1.7,b]])vertices.push(r*Math.cos(t),-.72+r*Math.sin(t),z);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  g.setIndex([0,1,2,0,2,3,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]);g.computeVertexNormals();
  const flat=g.toNonIndexed();g.dispose();flat.setAttribute('uv',new T.BufferAttribute(new Float32Array(flat.attributes.position.count*2),2));
  const colors=new Float32Array(flat.attributes.position.count*3);colors.fill(i%2?.82:.96);flat.setAttribute('color',new T.BufferAttribute(colors,3));batches[0].push(flat);
 }
 // A small brass arrow is inlaid into the approach, pointing into the flight.
 const shape=new T.Shape([[-.16,.1],[.16,.1],[.16,-.3],[.46,-.3],[0,-.78],[-.46,-.3],[-.16,-.3]].map(([x,z])=>new T.Vector2(x,-z)));
 const arrow=new T.ShapeGeometry(shape).toNonIndexed();arrow.rotateX(-Math.PI/2);arrow.translate(0,.023,1.25);batches[1].push(arrow);
 for(let i=0;i<batches.length;i++){
  const geometry=mergeGeometries(batches[i]);for(const g of batches[i])g.dispose();
  const mesh=new T.Mesh(geometry,materials[i]);mesh.castShadow=i!==2;mesh.receiveShadow=true;group.add(mesh);
 }
 let disposed=false;
 return{group,dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const m of group.children){m.geometry.dispose();m.material.dispose();}}};
}
