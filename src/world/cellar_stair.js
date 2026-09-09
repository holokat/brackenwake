import {createCellarStairModel,createCellarUpStairModel,hasCellarDownStair,hasCommandStair} from './cellar_stair_model.js';
import {cutCellarGeologyStaged} from './cellar_geometry_jobs.js';

function hideOriginal(built,dir){for(const child of built.group.children)if(child.userData.exit===dir&&!built.exits.includes(child))child.visible=false;}
function installDown(built){
 const at=built.stairPos,model=createCellarStairModel(),target=built.exits.find(o=>o.userData.exit==='down');
 hideOriginal(built,'down');model.group.position.copy(at);built.group.add(model.group);
 if(target){target.scale.set(6.2/2.6,3.2/3,8/2.6);target.position.set(at.x,at.y+1.4,at.z-2.6);}
 const light=built.stairLight;
 if(light){light.color.set(0xffbf74);light.position.set(at.x,at.y+2.7,at.z-1.7);light.intensity=17;light.distance=17;}
 for(const b of [
  {x:0,z:-3.45,w:3.6,d:5.9,h:4,y:-3},
  {x:-2.25,z:-2.8,w:.95,d:6.9,h:1.5,y:0},{x:2.25,z:-2.8,w:.95,d:6.9,h:1.5,y:0},
  {x:0,z:-6.3,w:5,d:.6,h:1.2,y:0},
 ])built.physicalBodies.push({kind:'box',model:'Cellar stair surround',...b,x:at.x+b.x,y:at.y+b.y,z:at.z+b.z,c:1,s:0});
 const controller=new AbortController();
 const ready=cutCellarGeologyStaged(built,(x,z)=>Math.abs(x-at.x)<4.1&&z<at.z+1&&z>at.z-8.1,
  {signal:controller.signal,surfaces:[built.parts.floor]});
 return{group:model.group,ready,dispose(){controller.abort();model.dispose();}};
}
function installUp(built,L){
 const at=built.entrancePos,model=createCellarUpStairModel(),target=built.exits.find(o=>o.userData.exit==='up');
 hideOriginal(built,'up');model.group.position.copy(at);model.group.position.z+=.5;model.group.rotation.y=Math.PI;
 // Entry artwork hides this fallback when the already-authored surface stair loads.
 model.group.userData.exit='up';model.group.userData.stairVisual=true;built.group.add(model.group);
 if(target){target.scale.set(6.2/2.6,8/3,8/2.6);target.position.set(at.x,at.y+1.4,at.z+3.1);}
 const light=built.entranceLight;
 if(light){light.color.set(0xffdb9b);light.position.set(at.x,at.y+3.2,at.z+2);light.intensity=20;light.distance=17;}
 // Keep the landing and route north clear. The flight heads back toward the
 // previous floor, south of the spawn, with a physical ramp under its treads.
 if(L.level!==1){
  built.physicalBodies.push({kind:'ramp',model:'Cellar returning stair',x:at.x,z:at.z+3.25,y:at.y,w:3.6,d:5.5,h:1.96,direction:1,c:1,s:0});
  for(const side of [-1,1])built.physicalBodies.push({kind:'box',model:'Cellar returning balustrade',x:at.x+side*2.2,z:at.z+3.3,y:at.y,w:.9,d:6.6,h:2.65,c:1,s:0});
  built.physicalBodies.push({kind:'box',model:'Cellar return portal',x:at.x,z:at.z+6.45,y:at.y,w:4.6,d:.5,h:5.4,c:1,s:0});
 }
 return model;
}
/** Compatibility for first-room tests and existing tooling. */
export function furnishCommandStair(built,L){return hasCommandStair(L)?installDown(built):null;}
export function furnishCellarStairs(built,L){
 if(L.siteId!=='oldcellars')return null;
 const up=installUp(built,L),down=hasCellarDownStair(L)?installDown(built):null;
 return{up,down,dispose(){up.dispose();down?.dispose();}};
}
