import assert from 'node:assert/strict';
import * as THREE from 'three';
globalThis.window ||= {addEventListener(){},removeEventListener(){}};
globalThis.localStorage ||= {getItem(){return null},setItem(){},removeItem(){}};
globalThis.requestAnimationFrame ||= ()=>0;
const {surfaceClaim,miningPreview,strikeSurface,hydrateMining,MINE_ORES}=await import('../game/surface_mining.js');
const {ORE_ELEMENTALS,elementalAwakening}=await import('../mmo/ore_elementals.js');
const {MONSTERS}=await import('../mmo/monsters.js');
const {buildOreElemental}=await import('../game/ore_elemental_model.js');
const {createShoulderWorking,mineHeight}=await import('./shoulder_working.js');
const {worldOf,walkable}=await import('./dungeon_gen.js');
const {createDungeonScene,setDungeonCanvasFactory,stubCanvasFactory}=await import('./dungeon.js');
const {furnishShoulder}=await import('./shoulder_scene.js');
const {createCollisionIndex}=await import('./collision/shapes.js');
const {createInteract}=await import('../game/interact.js');
const {createCombat}=await import('../game/combat.js');
const {createMonsters}=await import('../game/monsters.js');
const character=()=>({skills:{mining:0},equipment:{},pack:{items:[{base:'pickaxe',durability:100}]},itemBar:[{base:'pickaxe'}],itemBarSlot:0});
const claim=surfaceClaim({x:0,y:0,z:0},{x:0,y:1,z:0});
const position={x:0,y:0,z:0};let c=character();
assert.equal(miningPreview(c,claim).ore,'iron');
assert.equal(strikeSurface(c,claim,{now:0,position}).ok,true);
assert.equal(c.pack.items[0].durability,99);
assert.equal(strikeSurface(c,claim,{now:1,last:0,position}).reason,'cooldown');
c.itemBarSlot=-1;assert.equal(strikeSurface(c,claim,{now:1000,position}).ok,false);
c=character();c.pack.items=[];assert.equal(strikeSurface(c,claim,{now:1000,position}).ok,false);
c=character();c.pack.items[0].durability=0;assert.equal(strikeSurface(c,claim,{now:1000,position}).ok,false);
c=character();assert.equal(strikeSurface(c,claim,{now:1000,position:{x:20,y:0,z:0}}).ok,false);
c=character();let yielded=0;for(let i=0;i<80;i++){const r=strikeSurface(c,claim,{now:i*900,position});if(r.yielded)yielded++;}
assert.equal(yielded,claim.capacity);assert.equal(miningPreview(c,claim).remaining,0);
c.mining=hydrateMining(JSON.parse(JSON.stringify(c.mining)));assert.equal(miningPreview(c,claim).remaining,0);
for(const [ore,skill] of MINE_ORES){const possible=new Set();c=character();c.skills.mining=skill;for(let i=0;i<100;i++)possible.add(miningPreview(c,{...claim,hash:i*32}).ore);assert(possible.has(ore));if(skill){c.skills.mining=skill-1;for(let i=0;i<100;i++)assert.notEqual(miningPreview(c,{...claim,hash:i*32}).ore,ore);}}
assert(elementalAwakening({...claim,hash:22},{taken:2}));assert(!elementalAwakening({...claim,hash:23},{taken:2}));assert(!elementalAwakening({...claim,hash:22},{taken:2,awakened:true}));
const L=createShoulderWorking(1,{id:'s:island_mine_east'}),seen=new Set(),queue=[L.entrance.gz*L.w+L.entrance.gx];
while(queue.length){const n=queue.pop();if(seen.has(n)||L.cells[n]!==1)continue;seen.add(n);const x=n%L.w,z=Math.floor(n/L.w);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(walkable(L,x+dx,z+dz))queue.push((z+dz)*L.w+x+dx);}
assert.equal(seen.size,L.cells.filter(x=>x===1).length);for(const r of [...L.rooms.map(r=>({gx:r.cx,gz:r.cz})),...L.chests,...L.authoredSpawns])assert(seen.has(r.gz*L.w+r.gx));
setDungeonCanvasFactory(stubCanvasFactory);const built=furnishShoulder(createDungeonScene(THREE,L),L);built.group.updateMatrixWorld(true);
const p=worldOf(L,L.rooms[1].cx,L.rooms[1].cz),y=mineHeight(p.z);
for(const dy of [-1,1]){const hit=built.mine.pick(new THREE.Raycaster(new THREE.Vector3(p.x,y+2,p.z),new THREE.Vector3(0,dy,0)));assert(hit);assert.equal(hit.kind,'mineSurface');if(dy===1)assert(hit.distance>25);}
const index=createCollisionIndex(built.physicalBodies);const stairs=built.physicalBodies.filter(b=>b.model==='mine stair');assert.equal(stairs.length,9);
for(const b of stairs){let pos={x:b.x,y:b.y,z:b.z-b.direction*b.d/2};for(let i=0;i<280;i++){const z=pos.z+b.direction*.05;const to={x:pos.x,z,y:Math.max(b.y,index.supportAt(pos.x,z,pos.y+.08))};assert(index.canMove(pos,to),`Ramp blocked at ${i}, height ${pos.y}`);pos=to;}assert(pos.y>=b.y+2.95);}
assert.equal(built.mineStats.carts,10);assert.equal(built.mineStats.scaffoldDecks,9);built.update(.016,p);built.dispose();
// Real click path creates real item objects, and retains ore if both delivery paths fail.
let clock=1000;Object.defineProperty(globalThis,'performance',{value:{now:()=>clock},configurable:true});
const camera=new THREE.PerspectiveCamera();camera.position.set(0,3,3);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const drops=[];c=character();const state={character:c,save(){},addMaterial(){return {added:0}}};
const runtime={inDungeon:true,pick:()=>({kind:'mineSurface',claim}),dungeonScene:{mine:{impact(){},spawnPoint(){return null}}}};
const it=createInteract({sc:{camera},runtime,player:{pos:position},state,input:{pointer:{x:0,y:0}},loot:{drop(pos,bag){drops.push(bag);return bag}}});
for(let i=0;i<5;i++){it.click();clock+=900;}assert.equal(drops[0].items[0].base,'iron_ore');assert.equal(drops[0].items[0].count,1);
c=character();state.character=c;const blocked=createInteract({sc:{camera},runtime,player:{pos:position},state,input:{pointer:{x:0,y:0}},loot:{drop(){return null}}});
for(let i=0;i<5;i++){blocked.click();clock+=900;}assert.equal(c.mining.shoulder[claim.key].taken,0);
// Real spawn and combat death path, including a null ordinary loot roll.
const combat=createCombat(),bags=[];const field={seed:1,heightAt:()=>0,chunkOf:()=>[0,0],sampleAt:()=>({h:0,biome:'meadow',water:false}),biomeAt:()=> 'meadow'};
const monsters=createMonsters(new THREE.Group(),{field,heightAt:()=>0,sitesNear:()=>[],inDungeon:false},{combat,groupChance:0,loot:{rollFor:()=>null,drop(pos,bag){bags.push(bag);return bag}}});
for(const e of ORE_ELEMENTALS){assert(MONSTERS[e.id]);assert(e.reward>8);const model=buildOreElemental(e.id);model.update(.1);model.setAnim('swing');model.update(.1);model.setAnim('die');for(let i=0;i<30;i++)model.update(.1);assert(model.dieDone);model.dispose();const spawned=monsters.spawnEncounter(e.id,0,0);assert(spawned);const mon=monsters.all().find(m=>m.id===e.id);combat.kill(mon.actor,{id:'player',kind:'player',bonuses:{}});const item=bags.at(-1).items.find(i=>i.base===e.ore+'_ore');assert.equal(item.count,e.reward);}
monsters.dispose();console.log('Shoulder: finite mining, skill gates, persistence, connected geometry, roof rays, nine traversable stair flights, real clicks, ten combat ore rewards passed.');
