import * as THREE from 'three';
import {gem,role} from './common.js';

/** A closed cranial shell with real eye/nasal openings and inset socket walls. */
export function skull(h,{center=[0,0,0],scale=1,prefix='Skull',decoration=true}={}){
 const start=h.root.children.length,bone='#c6b99a';
 const outline=[[-.19,.10],[-.255,.22],[-.325,.405],[-.295,.55],[-.265,.665],[-.14,.775],[0,.8],[.14,.775],[.265,.665],[.295,.55],[.325,.405],[.255,.22],[.19,.10]];
 const eyes=[[-.265,.405],[-.235,.51],[-.115,.535],[-.065,.435],[-.105,.335],[-.215,.33]];
 const holes=[eyes,[...eyes].reverse().map(([x,z])=>[-x,z]),[[-.055,.205],[.055,.205],[0,.335]]];
 const frontY=z=>z>.55?-.31+(z-.55)*.58:-.31;
 const faceOutline=[...outline.slice(0,4),...outline.slice(9)],all=[...faceOutline,...holes.flat()],front=all.map(([x,z])=>[x,frontY(z),z]);
 const triangles=THREE.ShapeUtils.triangulateShape(faceOutline.map(p=>new THREE.Vector2(...p)),holes.map(r=>r.map(p=>new THREE.Vector2(...p))));
 role(h.mesh(prefix+' facial bone around openings',front,triangles,bone,{variation:.013}),'bone');
 const brow=outline.slice(3,10),browTriangles=THREE.ShapeUtils.triangulateShape(brow.map(p=>new THREE.Vector2(...p)),[]);
 role(h.mesh(prefix+' sloped frontal bone',brow.map(([x,z])=>[x,frontY(z),z]),browTriangles,bone,{variation:.006}),'bone');
 const n=outline.length,back=outline.map(([x,z])=>[x*1.08,.04,.43+(z-.43)*.91]),cap=outline.map(([x,z])=>[x*.65,.235,.44+(z-.43)*.68]);
 const v=[...outline.map(([x,z])=>[x,frontY(z),z]),...back,...cap,[0,.3,.44]],faces=[];
 for(let i=0;i<n;i++){
  const j=(i+1)%n;faces.push([i,j,n+j,n+i],[n+i,n+j,n*2+j,n*2+i],[n*2+i,n*2+j,n*3]);
 }
 role(h.mesh(prefix+' cranial vault',v,faces,bone,{variation:.015}),'bone');
 for(let index=0;index<holes.length;index++){
  const boundary=holes[index],cx=boundary.reduce((s,p)=>s+p[0],0)/boundary.length,cz=boundary.reduce((s,p)=>s+p[1],0)/boundary.length;
  const outer=boundary.map(([x,z])=>[x,frontY(z),z]),inner=boundary.map(([x,z])=>[cx+(x-cx)*.7,-.16,cz+(z-cz)*.7]);
  const count=boundary.length,walls=Array.from({length:count},(_,i)=>[i,(i+1)%count,(i+1)%count+count,i+count]);
  role(h.mesh(prefix+(index<2?' recessed eye wall '+index:' recessed nasal wall'),[...outer,...inner],walls,'#80755e',{variation:.02}),'bone');
  role(h.mesh(prefix+(index<2?' deep eye socket '+index:' nasal cavity'),inner,[Array.from({length:count},(_,i)=>i)],'black',{variation:0}),'recess');
 }
 // The mandibular arms meet the cheekbones; both tooth rows grow from bone.
 role(h.tube(prefix+' connected lower jaw',[[-.25,-.10,.26],[-.23,-.23,.03],[-.14,-.32,-.015],[.14,-.32,-.015],[.23,-.23,.03],[.25,-.10,.26]],[[.06,.07],[.055,.055],[.055,.055],[.055,.055],[.055,.055],[.06,.07]],'#aa9c7d',{sides:6,variation:.014}),'bone');
 role(h.tube(prefix+' upper dental arch',[[-.21,-.29,.15],[-.12,-.335,.115],[.12,-.335,.115],[.21,-.29,.15]],.055,bone,{sides:6,variation:.01}),'bone');
 for(let i=0;i<6;i++){
  const x=(i-2.5)*.052,y=-.341+Math.abs(x)*.18;
  role(h.cube(prefix+' upper tooth '+(i+1),[x,y,.074],[.047,.052,.079],bone,{bevel:.006}),'bone');
  role(h.cube(prefix+' lower tooth '+(i+1),[x,y,.004],[.046,.05,.054],'#b9ac8c',{bevel:.006}),'bone');
 }
 if(decoration)gem(h,[0,frontY(.637)-.002,.637],{size:.067,name:prefix+' forehead gemstone'});
 for(const mesh of h.root.children.slice(start)){
  mesh.geometry.scale(scale,scale,scale);mesh.geometry.translate(...center);
 }
}
