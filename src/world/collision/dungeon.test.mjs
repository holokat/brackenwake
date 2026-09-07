import assert from 'node:assert/strict';
import {generateDungeon,walkable,worldOf,floorAt} from '../dungeon_gen.js';
import {dungeonPhysical} from './dungeon.js';
let openEdges=0,wallEdges=0;
for(const kind of ['dungeon','cave']){
 const layout=generateDungeon(45,{id:'collision test',kind,cx:2,cz:3},1),physical=dungeonPhysical(layout);
 for(let z=1;z<layout.h-1;z++)for(let x=1;x<layout.w-1;x++)if(walkable(layout,x,z)){
  const from={...worldOf(layout,x,z),y:floorAt(layout,x,z)};
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const to={...worldOf(layout,x+dx,z+dz),y:floorAt(layout,x,z)};
   if(walkable(layout,x+dx,z+dz)){assert.equal(physical.canMove(from,to),true);openEdges++;}
   else{assert.equal(physical.canMove(from,to),false);wallEdges++;}
  }
  assert.ok(physical.ceilingAt(from.x,from.z)>from.y+1.75);
 }
 assert.equal(dungeonPhysical(layout),physical,'level collision is cached');
}
assert.ok(openEdges>0&&wallEdges>0);console.log(JSON.stringify({openDungeonEdges:openEdges,solidDungeonEdges:wallEdges}));
