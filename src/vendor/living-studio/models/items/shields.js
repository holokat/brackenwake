import {loop,role} from './common.js';
import {shieldBoards,shieldPanel,shieldRim,shieldRivet,shieldSteel,applyShieldConstruction} from './shield-surfaces.js';
import {buildShieldFittings} from './shield-fittings.js';

const profiles={
 buckler:{shape:'round',width:.62,outline:Array.from({length:20},(_,i)=>{const a=i*Math.PI/10;return[Math.cos(a)*.62,Math.sin(a)*.62];})},
 kite:{shape:'kite',width:.68,outline:[[0,.88],[.64,.46],[.60,.02],[.42,-.54],[0,-1.1],[-.42,-.54],[-.60,.02],[-.64,.46]]},
 heater:{shape:'heater',width:.67,outline:[[-.65,.68],[-.31,.63],[0,.62],[.31,.63],[.65,.68],[.62,.02],[.48,-.38],[0,-.83],[-.48,-.38],[-.62,.02]]},
 tower:{shape:'tower',width:.77,outline:[[-.73,1.01],[-.38,1.07],[.38,1.07],[.73,1.01],[.73,-1.01],[.38,-1.07],[-.38,-1.07],[-.73,-1.01]]},
};

function boss(h,shape,front){
 if(shape==='tower')return;
 if(shape==='round'){
  loop(h,'Boss mounting flange',[0,front(0)-.012,0],.245,.245,.027,'steel_dark',{segments:16});
  const mesh=role(h.ico('Round domed boss',[0,front(0)-.05,0],[.238,.125,.238],shieldSteel,{sub:2,variation:0}),'metal');
  mesh.userData.shieldContact=true;
 }else{
  const y=front(0)-.006;
  const mesh=h.mesh('Faceted diamond boss',[[0,y,.31],[.145,y,0],[0,y,-.31],[-.145,y,0],[0,y-.15,.035],[0,y+.025,0]],
   [[0,1,4],[1,2,4],[2,3,4],[3,0,4],[1,0,5],[2,1,5],[3,2,5],[0,3,5]],'steel_edge',{variation:.018});
  mesh.userData.shieldContact=true;
 }
}

export function buildShield(h,id){
 const profile=profiles[id];if(!profile)throw new RangeError('Unknown shield shape: '+id);
 const {outline,width,shape}=profile;h.root.userData.shieldShape=shape;
 const front=x=>.022-.032*Math.max(0,1-(x/width)**2);
 const field=outline.map(([x,z])=>[x*.96,z*.96]);
 const wood=shieldPanel(h,'Solid wooden shield backing',field,x=>front(x)+.015,.067,'wood');wood.userData.construction='wood';
 shieldBoards(h,field,width,front,{contact:shape==='tower'});
 const metal=shieldPanel(h,'Faceted metal shield field',field,front,.075,shieldSteel);metal.userData.construction='metal';
 if(shape==='tower')metal.userData.shieldContact=true;
 const rim=shieldRim(h,outline,front);boss(h,shape,front);
 const rivets=shape==='round'?outline.filter((_,i)=>i%2===0):outline;
 for(const [i,[x,z]] of rivets.entries())shieldRivet(h,'Rim fastening rivet '+(i+1),x*.957,z*.957,rim);
 if(shape==='tower')for(const z of[-.48,.48]){
  const band=shieldPanel(h,'Wood shield cross brace',[[-.71,z-.065],[.71,z-.065],[.71,z+.065],[-.71,z+.065]],x=>front(x)-.043,x=>front(x)-.006,'steel_edge');band.userData.construction='wood';
  for(const x of[-.60,0,.60])shieldRivet(h,'Cross brace rivet',x,z,band,{radius:.030,construction:'wood'});
  for(const x of[-.60,0,.60])shieldRivet(h,'Metal field rivet',x,z,metal,{radius:.024,construction:'metal'});
 }
 const offset=buildShieldFittings(h,id);
 h.root.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.translate(...offset);});
 applyShieldConstruction(h.root);
}
