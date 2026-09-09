import {createCellarStairModel,hasCommandStair} from './cellar_stair_model.js';
import {cutCellarGeologyStaged} from './cellar_geometry_jobs.js';

/** An always-present landmark; room streaming never hides the way down. */
export function furnishCommandStair(built,L){
 if(!hasCommandStair(L))return null;
 const at=built.stairPos,model=createCellarStairModel(),target=built.exits.find(o=>o.userData.exit==='down');
 for(const child of built.group.children)if(child.userData.exit==='down'&&child!==target)child.visible=false;
 model.group.position.copy(at);built.group.add(model.group);
 // A click anywhere on the flight selects the same existing exit.
 if(target){target.scale.set(6.2/2.6,3.2/3,7/2.6);target.position.set(at.x,at.y+1.4,at.z-2.6);}
 const light=built.stairLight;
 if(light){light.color.set(0xffbf74);light.position.set(at.x,at.y+2.7,at.z-1.7);light.intensity=17;light.distance=17;}
 // Players use the threshold to change levels. Keep the sides and the open
 // flight solid, so they cannot walk across the pit at the old flat floor height.
 for(const b of [
  {x:0,z:-3.45,w:3.6,d:5.9,h:4,y:-3},
  {x:-2.25,z:-2.8,w:.95,d:6.9,h:1.5,y:0},
  {x:2.25,z:-2.8,w:.95,d:6.9,h:1.5,y:0},
  {x:0,z:-6.3,w:5,d:.6,h:1.2,y:0},
 ])built.physicalBodies.push({kind:'box',model:'Cellar stair surround',...b,x:at.x+b.x,y:at.y+b.y,z:at.z+b.z,c:1,s:0});
 const controller=new AbortController();
 const ready=cutCellarGeologyStaged(built,(x,z)=>Math.abs(x-at.x)<4.1&&z<at.z+1&&z>at.z-8.1,
  {signal:controller.signal,surfaces:[built.parts.floor]});
 return{group:model.group,ready,dispose(){controller.abort();model.dispose();}};
}
