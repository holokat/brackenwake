import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {OPENINGS} from '../../mmo/openings.js';
import {BASES,makeItem} from '../../mmo/items.js';
import {GEMS} from '../../mmo/ores.js';
import {ABILITIES} from '../../mmo/abilities.js';
import {itemCatalog} from '../../vendor/living-studio/data/item-catalog.js';
import {creatureCatalog} from '../../vendor/living-studio/data/creature-catalog.js';
import {canonicalSlots} from '../../vendor/living-studio/models/class-profiles.js';
import {buildStudioCharacter,sourceAbility} from './body.js';
import {buildMonsterModel} from '../monster_models.js';
import {studioItemId,attachStudioDrop} from './items.js';
import {studioEquipment,studioMaterial} from './equipment.js';
import {enchantmentFor} from './enchantments.js';
import {planCharacter} from '../creation.js';
import {createInventory} from '../inventory.js';
import {playerActor,recompute} from '../actor.js';
import {createSpellVfx} from '../spell_vfx.js';
import {createStudioSpells} from './spells.js';
if(!globalThis.ProgressEvent)globalThis.ProgressEvent=class{};
const binary=readFileSync('public/studio/models/warrior-base-rigged.glb'),bank=JSON.parse(readFileSync('public/studio/animations/quaternius-retargeted.json'));
const loadMotionAssets=async()=>[binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),bank];
const finite=group=>{group.updateMatrixWorld(true);group.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite),o.name));};
let bodies=0,swaps=0,heldSwaps=0,drops=0,creatures=0,casts=0;
for(const opening of OPENINGS)for(const gender of ['male','female']){
 const plan=planCharacter({opening:opening.id,name:'Studio review',appearance:{gender}});assert.equal(plan.ok,true,opening.id+': '+plan.errors);
 const c=plan.character,body=buildStudioCharacter({...c.appearance,gender},{classId:opening.id});body.setEquipment(c.equipment);await body.ready;
 assert.equal(body.errors.length,0);assert.equal(body.actor.bodyType,gender);assert.equal(body.actor.group.userData.classId,opening.id);
 for(const slot of canonicalSlots)assert.equal(body.actor.equipment[slot],c.equipment[slot]?.base||'none',opening.id+' '+slot);
 body.update(.2,2);finite(body.group);body.dispose();assert.equal(body.group.children.length,1);bodies++;
}
for(const gender of ['male','female']){
 const c=planCharacter({opening:'warrior',name:'Gear review',appearance:{gender}}).character;
 for(const s of Object.keys(c.stats))c.stats[s]=100;
 const body=buildStudioCharacter({gender},{classId:'warrior',sourceMotion:true,loadMotionAssets}),actor=playerActor(c);
 const inv=createInventory({character:c,actor,recompute,onChange:()=>body.setEquipment(c.equipment)});body.setEquipment(c.equipment);await body.ready;
 for(const item of itemCatalog.filter(i=>i.kind==='armor')){
  const base=BASES[item.id];assert.ok(base,item.id);const slot=canonicalSlots.find(s=>base.slot===s)||(base.slots||[]).find(s=>canonicalSlots.includes(s));assert.ok(slot,item.id);
  const index=inv.emptySlot();assert.ok(index>=0);assert.ok(inv.add(makeItem({base:item.id,seed:13})).added);const eq=inv.equip(index,slot);assert.equal(eq.ok,true,eq.reason);await body.ready;
  assert.equal(body.actor.equipment[slot],item.id);assert.ok(body.actor.group.getObjectByName('Studio body and worn armour').userData.studioItems.includes(item.id),item.id+' visible geometry');assert.ok(body.actor.group.userData.batchedSourceMeshes>0);finite(body.group);
  assert.equal(inv.unequip(slot).ok,true);await body.ready;assert.equal(body.actor.equipment[slot],'none');assert.equal(body.actor.group.getObjectByName('Studio body and worn armour').userData.studioItems.includes(item.id),false);
  inv.remove(inv.pack.items.findIndex(i=>i?.base===item.id));swaps++;
 }
 // Equip through the actual inventory, including bows, focuses and shields.
 for(const item of itemCatalog.filter(i=>['weapon','shield','offhand'].includes(i.kind))){
  for(const slot of ['mainHand','offHand','ranged'])if(c.equipment[slot]){inv.unequip(slot);}
  if(item.id==='fists'){assert.equal(body.actor.group.userData.loadout.some(p=>p.name==='fists'),false);continue;}
  const base=BASES[item.id],slot=base.slot==='ranged'?'ranged':base.kind==='shield'||base.slot==='offHand'?'offHand':'mainHand';
  const index=inv.emptySlot();assert.ok(index>=0);assert.ok(inv.add(makeItem({base:item.id,seed:17})).added);
  const result=inv.equip(index,slot);assert.equal(result.ok,true,item.id+': '+result.reason);await body.ready;
  assert.ok(body.actor.group.userData.loadout.some(p=>p.userData.itemId===item.id),item.id+' held source model');finite(body.group);
  assert.equal(inv.unequip(slot).ok,true);await body.ready;assert.equal(body.actor.group.userData.loadout.some(p=>p.userData.itemId===item.id),false);
  inv.remove(inv.pack.items.findIndex(i=>i?.base===item.id));heldSwaps++;
 }
 body.group.position.set(20,5,30);body.group.rotation.y=1.2;
 for(const move of ['idle','walk','run','swing','cast','flinch','death'])for(const phase of [.05,.35,.67,.95]){body.poseAction(move,phase);finite(body.group);}
 const legacy=createSpellVfx({scene:new THREE.Scene(),body:body.group}),vfx=createStudioSpells(legacy,{group:body.group,parts:body.parts,pos:body.group.position,studio:body});
 for(const textures of [null,{fire:null,smoke:null}]){if(textures)vfx.setTextures(textures);for(const a of ABILITIES){vfx.start(a.id,{castTime:a.castTime,target:{x:23,y:5,z:32}});for(let i=0;i<70;i++)vfx.update(.1);finite(body.group);vfx.interrupt();casts++;}}
 vfx.dispose();body.dispose();
}
for(const row of creatureCatalog){
 const a=buildMonsterModel(row.id),b=buildMonsterModel(row.id);assert.ok(a?.studioActor,row.id);assert.ok(a.parts.hit);assert.ok(a.clickRadius>=.34&&a.clickHeight>=.95);
 for(const name of ['idle','walk','run','swing','hurt','cast']){a.setAnim(name);for(let i=0;i<15;i++)a.update(1/60,2);finite(a.group);}
 a.setAnim('die');assert.equal(a.dieDone,false);for(let i=0;i<68;i++)a.update(1/60,0);assert.equal(a.dieDone,true);a.setAnim('walk');assert.equal(a.anim,'die');a.dispose();
 b.setAnim('run');b.update(.1,2);finite(b.group);b.dispose();creatures++;
}
const representatives=[...Object.values(BASES).map(b=>({base:b.id})),...GEMS.map(g=>({base:'gem',material:g.id}))];
for(const row of itemCatalog){const item=representatives.find(i=>studioItemId(i)===row.id);assert.ok(item,'No live item maps to '+row.id);const parent=new THREE.Group(),replacement=new THREE.Group();parent.add(replacement);const drop=attachStudioDrop(parent,item,replacement);assert.equal(await drop.ready,true,row.id);assert.equal(replacement.visible,false);finite(parent);drop.dispose();assert.equal(parent.children.length,1);drops++;}
const gear={mainHand:{base:'greatsword'},offHand:{base:'kite'}};assert.equal(studioEquipment(gear).off,'none');delete gear.mainHand;assert.equal(studioEquipment(gear).off,'kite');
assert.equal(studioMaterial({base:'heater',material:'iron'}).construction,'metal');
for(const [id,affix]of Object.entries({flame:'hitFireball',frost:'hitFrost',shock:'hitLightning',vampiric:'lifeLeech',keen:'critChance',force:'damage'}))assert.equal(enchantmentFor({}, {identified:true,affixes:[{id:affix,value:5}]}).id,id);
assert.equal(enchantmentFor({enchant:{until:10,hitsLeft:1,damageType:'poison'}},{base:'dagger'},9).id,'venom');assert.equal(enchantmentFor({enchant:{until:10,hitsLeft:1,damageType:'holy'}},{base:'dagger'},9).id,'holy');assert.equal(enchantmentFor({enchant:{until:10,hitsLeft:1,damageType:'holy'}},{base:'dagger'},10).id,'none');
assert.deepEqual(ABILITIES.filter(a=>!sourceAbility(a.id)).map(a=>a.id),['camp']);
assert.equal(swaps,itemCatalog.filter(i=>i.kind==='armor').length*2);
console.log(JSON.stringify({bodies,swaps,heldSwaps,creatures,drops,casts,sourceAbilities:ABILITIES.length-1}));
