import {stairMeshBuilder} from './stair_mesh_builder.js';

export const CELLAR_STAIR = Object.freeze({width:3.6,depth:6,steps:8,drop:.28,holeWidth:6.1});
export function hasCellarDownStair(L){return L.siteId==='oldcellars'&&L.level>=1&&L.level<8&&!!L.stair;}
export function hasCommandStair(L){return hasCellarDownStair(L)&&L.level===1;}
/** The threshold remains at the existing exit; the flight runs north. */
export function createCellarStairModel(){
 const {box,arch,arrow,lantern,finish}=stairMeshBuilder();
 for(const side of [-1,1]){
  box(side*2.5,-.05,-3,1.4,.24,6.5,0,.77);
  for(let i=0;i<6;i++){
   box(side*2.04,.3,-.5-i,.45,.6,.96,0,i%2?.72:.8);
   box(side*2.04,.64,-.5-i,.59,.12,.97,0,1);
  }
  box(side*2.04,-1.08,-3,.48,2.2,6,0,.53);
  box(side*2.25,.67,.03,.85,1.34,.9,0,.88);
  box(side*2.25,1.4,.03,1.02,.16,1.04);lantern(side*2.25,1.47,.03);
 }
 box(0,-.1,.19,4,.28,.38);box(0,.052,.18,3.4,.025,.07,1);
 for(let i=0;i<CELLAR_STAIR.steps;i++){
  const z=-.375-i*.75,y=-i*CELLAR_STAIR.drop;
  box(0,y-.15,z,3.6,.3,.75,0,1-i*.065);box(0,y+.015,z-.32,3.45,.03,.075,1);
 }
 box(0,-2.35,-3.3,3.6,.18,6.6,0,.38);arch();arrow();
 return finish('Cellar stairs down');
}

/** Ascending treads and a taller arch distinguish the return route at a glance. */
export function createCellarUpStairModel(){
 const {box,arch,arrow,lantern,finish}=stairMeshBuilder({stone:0xa09a89,glow:0xffd598});
 box(0,-.03,-2.8,5.1,.2,6.1,0,.7);
 for(let i=0;i<7;i++){
  const z=-.43-i*.78,top=.28*(i+1);
  box(0,top/2,z,3.6,top,.78,0,.84+i*.018);
  box(0,top+.015,z+.32,3.45,.03,.075,1);
  for(const side of [-1,1]){
   // Individual courses and broad coping stones give the flight a solid base.
   for(let course=0;course<Math.ceil((top+.5)/.48);course++){
    const h=Math.min(.46,top+.5-course*.48);if(h>0)box(side*2.04,course*.48+h/2,z,.52,h,.74,0,.71+(i+course)%3*.04);
   }
   box(side*2.04,top+.57,z,.7,.14,.8,0,.98);
  }
 }
 for(const side of [-1,1]){
  box(side*2.25,.63,.05,.9,1.26,.92,0,.83);box(side*2.25,1.34,.05,1.08,.16,1.08);lantern(side*2.25,1.42,.05);
  box(side*2.18,1.15,-5.5,.86,2.3,1,0,.76);
 }
 box(0,1.91,-5.84,3.6,.18,1.05);arch({z:-5.9,spring:3.1,bottom:1.96});
 // Recessed stone behind the arch implies a continuing passage; its lower
 // courses darken without relying on a new texture or transparent effect.
 arrow();return finish('Cellar stairs up');
}
