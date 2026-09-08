import * as THREE from 'three';
import {facePreset} from '../../data/face-presets.js';
import {chibiMaterialRole} from './wardrobe.js';
import {resolveHairstyle} from '../../data/hairstyles.js';

function tag(mesh){mesh.userData.armorBinding='head';return mesh;}
function outline(w,d,c=.23){return [[-w+c,-d],[w-c,-d],[w,-d+c],[w,d-c],[w-c,d],[-w+c,d],[-w,d-c],[-w,-d+c]];}
function volume(h,name,rings,mat){
 const vertices=rings.flatMap(([z,w,d])=>outline(w,d).map(([x,y])=>[x,y,z]));
 const faces=[];
 for(let r=0;r<rings.length-1;r++)for(let i=0;i<8;i++)faces.push([r*8+i,r*8+(i+1)%8,(r+1)*8+(i+1)%8,(r+1)*8+i]);
 faces.push([7,6,5,4,3,2,1,0],Array.from({length:8},(_,i)=>(rings.length-1)*8+i));
 return tag(h.mesh(name,vertices,faces,mat,{variation:0}));
}
function lock(h,name,root,tip,width,depth=.15){
 const[x,y,z]=root;
 return tag(h.mesh(name,[[x-width/2,y,z],[x+width/2,y,z],[tip[0],tip[1],tip[2]],[x,y-depth,z-.06],[x,y+depth,z-.03]],[[0,3,2],[3,1,2],[1,4,2],[4,0,2],[0,4,1,3]],'hair',{variation:.025}));
}
export function buildChibiHead(h,{bodyType,customization,headwear}){
 const preset=facePreset(bodyType,customization.facePreset),shape=preset.shape;
 const cover=headwear==='none'?'none':chibiMaterialRole(headwear)==='metal'?'helmet':headwear==='cloth_head'?'hat':'hood';
 h.part='head';
 const jaw=1+(shape.jaw||0)*.3,cheek=1+(shape.cheeks||0)*.22;
 const crown=cover==='helmet'||cover==='hood'?[[6.47,1.12,.83],[6.75,1.04,.61],[7.04,.86,.51],[7.28,.60,.40]]:
  cover==='hat'?[[6.63,1.10,.80],[6.93,.94,.70],[7.10,.69,.49]]:[[6.63,1.12,.83],[7.04,.96,.74],[7.28,.64,.51]];
 volume(h,'Chibi continuous face',[[5.25,.76*jaw,.59],[5.47,1.00*jaw,.75],[5.83,1.12*cheek,.83],...crown],'skin');
 for(const s of[-1,1])tag(h.ico(`Chibi ear ${s}`,[s*1.06,.02,5.94],[.21,.24,.35],'skin',{sub:1,variation:0}));
 const eyeHeight=.44*(1+(shape.eyes||0)*.35),spacing=.46+(shape.eyeSpacing||0)*.8;
 for(const s of[-1,1]){
  const x=s*spacing,z=6.17+(shape.brow||0)*1.5,w=.19,c=.035,hh=eyeHeight/2;
  // A shallow embedded eight-sided patch shares the head's flat front plane.
  const points=[[-w/2+c,-hh],[w/2-c,-hh],[w/2,-hh+c],[w/2,hh-c],[w/2-c,hh],[-w/2+c,hh],[-w/2,hh-c],[-w/2,-hh+c]];
  const verts=points.map(([a,b])=>[x+a,-.836,z+b]);
  const eye=tag(h.mesh(`Chibi inset eye ${s}`,verts,[[0,1,2,3,4,5,6,7]],'#201d21',{variation:0}));
  eye.userData.materialRole='face';eye.userData.materialKey='eye';eye.userData.feature='eye';
 }
 if(cover!=='helmet')buildHair(h,{bodyType,style:resolveHairstyle(bodyType,customization.hairStyle),cover});
 return {facePreset:preset.id,hairStyle:resolveHairstyle(bodyType,customization.hairStyle)};
}
function buildHair(h,{bodyType,style,cover}){
 const covered=cover!=='none';
 h.part='hair';
 const rearLong=bodyType==='female'&&['default','bob','long_braid'].includes(style);
 const short=['close_crop','pixie'].includes(style),curly=['curly_crop','rounded_curls'].includes(style);
 const rim=outline(1.20,.92,.26),verts=[];
 const capRings=cover==='hat'?[[0,1],[6.65,1],[6.96,.83],[7.09,.55]]:[[0,1],[6.67,1],[7.15,.91],[7.40,.50]];
 for(let r=0;r<capRings.length;r++)for(let i=0;i<8;i++){
  const [x,y]=rim[i],front=y<-.6;
  const z=r===0?(front?6.56:rearLong?5.32:cover==='hat'?5.48+(i%2)*.08:5.72):capRings[r][0];
  const scale=capRings[r][1];
  verts.push([x*scale,y*scale,z]);
 }
 const faces=[];
 for(let r=0;r<capRings.length-1;r++)for(let i=0;i<8;i++)faces.push([r*8+i,r*8+(i+1)%8,(r+1)*8+(i+1)%8,(r+1)*8+i]);
 const top=(capRings.length-1)*8;
 if(cover==='none'){
  const apex=verts.length;verts.push([-.12,.06,7.57]);
  for(let i=0;i<8;i++)faces.push([top+i,top+(i+1)%8,apex]);
 }else faces.push(Array.from({length:8},(_,i)=>top+i));
 if(cover!=='hood')tag(h.mesh('Chibi hair cap',verts,faces,'hair',{variation:.015}));
 if(style==='default'){
  buildSweptFringe(h,cover);
  if(cover!=='hood')for(const s of[-1,1])lock(h,`Chibi side lock ${s}`,[s*1.07,-.30,6.48],[s*1.14,-.40,5.78],.32,.12);
 }else if(!short){
  const sweeps=style==='side_part'?[[-.66,-.89,6.99,.72,-.84,6.34],[.05,-.9,7.03,.40,-.91,6.39],[.72,-.77,6.92,.91,-.78,6.19]]:[[-.70,-.80,6.94,-.99,-.81,6.22],[-.25,-.90,7.02,-.53,-.91,6.35],[.36,-.91,6.98,.10,-.91,6.45],[.80,-.72,6.91,.89,-.76,6.19]];
  for(const [i,a]of sweeps.entries()){
   if(cover==='hood'){a[0]*=.79;a[2]=Math.min(a[2],6.88);a[3]*=.86;}
   lock(h,`Chibi fringe lock ${i}`,a.slice(0,3),a.slice(3),cover==='hood'?.45:.65,.055);
  }
  if(cover!=='hood')for(const s of[-1,1])lock(h,`Chibi side lock ${s}`,[s*1.07,-.30,6.38],[s*1.15,-.40,5.60],.36,.14);
 }
 if(!covered&&curly)for(let i=0;i<9;i++){
  const a=i/9*Math.PI*2;
  tag(h.ico(`Chibi curl clump ${i}`,[Math.cos(a)*.82,Math.sin(a)*.61,7.14],[.45,.38,.43],'hair',{sub:1,variation:.02}));
 }
 if(['top_knot','high_bun'].includes(style)&&!covered){
  tag(h.ico('Chibi gathered bun',[0,.22,7.53],[.49,.47,.45],'hair',{sub:1,variation:.02}));
 }
 if(!covered&&(['long_braid','tied_locs'].includes(style)||(bodyType==='female'&&style==='default'))){
  for(let i=0;i<5;i++)tag(h.ico(`Chibi tied braid ${i}`,[Math.sin(i*1.5)*.08,.84+i*.035,6.00-i*.25],[.25-i*.027,.25-i*.02,.31],'hair',{sub:1,variation:.015}));
 }
}

/** One connected sweep with a raised hairline; no loose teeth across the eyes. */
function buildSweptFringe(h,cover){
 const crest=cover==='hood'?[[-1.00,6.52],[-.51,6.92],[.34,7.20],[.93,6.81],[1.02,6.53]]:
  cover==='hat'?[[-1.07,6.78],[-.79,6.95],[.79,6.95],[1.07,6.78]]:
  [[-1.10,6.84],[-.82,7.12],[.85,7.12],[1.10,6.82]];
 const tips=[[.95,6.43],[.70,6.61],[.50,6.64],[.23,6.48],[.31,6.74],[-.13,6.64],[-.37,6.47],[-.31,6.72],[-.73,6.56],[-.96,6.41]];
 const shape=[...crest,...tips],n=shape.length;
 const front=shape.map(([x,z])=>[x,-.94,z]);
 const back=shape.map(([x,z])=>[x,-.42,z]);
 const triangles=THREE.ShapeUtils.triangulateShape(shape.map(([x,z])=>new THREE.Vector2(x,z)),[]);
 const faces=triangles.flatMap(face=>[face,face.slice().reverse().map(i=>i+n)]);
 for(let i=0;i<n;i++)faces.push([i,(i+1)%n,(i+1)%n+n,i+n]);
 tag(h.mesh('Chibi raised swept fringe',[...front,...back],faces,'hair',{variation:.01}));
}
