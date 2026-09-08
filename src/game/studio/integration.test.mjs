import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {OPENINGS} from '../../mmo/openings.js';
import {BASES,makeItem} from '../../mmo/items.js';
import {GEMS} from '../../mmo/ores.js';
import {ABILITIES} from '../../mmo/abilities.js';
import {itemCatalog} from '../../vendor/living-studio/data/item-catalog.js';
import {creatureCatalog} from '../../vendor/living-studio/data/creature-catalog.js';
import {studioClasses} from '../../vendor/living-studio/data/studio-classes.js';
import {studioNpcs} from '../../vendor/living-studio/data/studio-npcs.js';
import {chibiMonsterLooks} from '../../vendor/living-studio/data/chibi-monsters.js';
import {chibiCreatureLooks} from '../../vendor/living-studio/data/chibi-creatures.js';
import {canonicalSlots,classProfiles} from '../../vendor/living-studio/models/class-profiles.js';
import {buildStudioCharacter,sourceAbility,studioClassForOpening,auditStudioOpeningClasses} from './body.js';
import {HIDDEN_BODY_OPACITY} from './batch-body.js';
import {buildStudioNpc,auditStudioNpcLooks,NPC_STUDIO_LOOK} from './npcs.js';
import {STUDIO_MONSTER_LOOK,auditStudioCreatureLooks} from './creatures.js';
import {buildMonsterModel} from '../monster_models.js';
import {studioItemId,attachStudioDrop} from './items.js';
import {studioEquipment,studioMaterial, studioArmourForOutfit} from './equipment.js';
import {enchantmentFor} from './enchantments.js';
import {planCharacter} from '../creation.js';
import {createInventory} from '../inventory.js';
import {playerActor,recompute} from '../actor.js';
import {createSpellVfx} from '../spell_vfx.js';
import {createStudioSpells} from './spells.js';
import {NPC_LIST} from '../../mmo/npcs.js';
import {STORY_ROLES} from '../../mmo/story.js';
import {MONSTER_LIST} from '../../mmo/monsters.js';
if(!globalThis.ProgressEvent)globalThis.ProgressEvent=class{};
const binary=readFileSync('public/studio/models/warrior-base-rigged.glb'),bank=JSON.parse(readFileSync('public/studio/animations/quaternius-retargeted.json'));
const loadMotionAssets=async()=>[binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),bank];
const finite=group=>{group.updateMatrixWorld(true);group.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite),o.name));};
const materials=root=>{const out=[];root.traverse(o=>{if(!o.isMesh&&!o.isSkinnedMesh)return;if(Array.isArray(o.material))out.push(...o.material);else if(o.material)out.push(o.material);});return out;};
const studioClassById=Object.fromEntries(studioClasses.map(c=>[c.id,c]));
auditStudioOpeningClasses(OPENINGS);
auditStudioNpcLooks([...NPC_LIST,...Object.values(STORY_ROLES)]);
auditStudioCreatureLooks(MONSTER_LIST);
let bodies=0,swaps=0,heldSwaps=0,drops=0,creatures=0,casts=0,npcs=0;
for(const opening of OPENINGS)for(const gender of ['male']){
 const plan=planCharacter({opening:opening.id,name:'Studio review',appearance:{gender}});assert.equal(plan.ok,true,opening.id+': '+plan.errors);
 const c=plan.character,body=buildStudioCharacter({...c.appearance,gender},{classId:opening.id});body.setEquipment(c.equipment);await body.ready;
 const studioId=studioClassForOpening(opening.id),profile=studioClassById[studioId];
 assert.equal(body.errors.length,0);assert.equal(body.actor.bodyType,gender);assert.equal(body.actor.group.userData.classId,studioId);
 assert.deepEqual(body.actor.group.userData.studioPalette,profile.colors,opening.id+' studio palette');
 const studioEq=studioEquipment(c.equipment);
 // The body keeps the class look whatever outfit is worn (2026-09-08): every slot is the studio class's own piece, never the outfit's tier.
 for(const slot of canonicalSlots)assert.equal(body.actor.equipment[slot],(profile.equipment&&profile.equipment[slot])||'none',opening.id+' '+slot);
 assert.equal(Object.keys(studioEq.armor).length,0,opening.id+': the outfit tier dresses nothing');
 body.update(.2,2);finite(body.group);body.dispose();assert.equal(body.group.children.length,1);bodies++;
}
{
 const plan=planCharacter({opening:'rogue',name:'Two knives',appearance:{gender:'male'}});assert.equal(plan.ok,true,plan.reason||'');
 const c=plan.character;assert.equal(c.equipment.mainHand?.base,'dagger');assert.equal(c.equipment.offHand?.base,'dagger');
 const body=buildStudioCharacter({...c.appearance,gender:'male'},{classId:'rogue'});body.setEquipment(c.equipment);await body.ready;
 const daggers=(body.actor.group.userData.loadout||[]).filter(p=>p.userData.itemId==='dagger');
 assert.equal(daggers.length,2,'rogue has two dagger props');
 assert.ok(daggers.some(p=>p.userData.slot==='weapon'&&p.userData.mountedHand==='R'),'main dagger in right hand');
 assert.ok(daggers.some(p=>p.userData.slot==='offhand'&&p.userData.mountedHand==='L'),'off hand dagger in left hand');
 const hiddenTouched=body.setHidden(true),hiddenMats=materials(body.actor.group);
 assert.ok(hiddenTouched>0,'hidden touched body materials');
 assert.ok(hiddenMats.every(m=>m.opacity===HIDDEN_BODY_OPACITY&&m.transparent===true&&m.depthWrite===true),'hidden opacity on body and loadout');
 body.setHidden(false);
 assert.ok(materials(body.actor.group).every(m=>m.opacity===1&&m.transparent===false&&m.depthWrite===true),'visible opacity restored');
 finite(body.group);body.dispose();bodies++;
}
for(const opening of OPENINGS){
 const studioId=studioClassForOpening(opening.id),profile=studioClassById[studioId],body=buildStudioCharacter({gender:'male'},{classId:opening.id});await body.ready;
 assert.deepEqual(body.actor.group.userData.studioPalette,profile.colors,opening.id+' default palette');
 assert.deepEqual(body.actor.equipment,profile.equipment,opening.id+' default outfit');
 body.setEquipment({outfit:makeItem({base:'leather_outfit',seed:31})});await body.ready;
 assert.deepEqual(body.actor.group.userData.studioPalette,profile.colors,opening.id+' leather palette held');
 assert.deepEqual(body.actor.equipment,profile.equipment,opening.id+' leather: the class look is kept (2026-09-08)');
 body.setEquipment({outfit:makeItem({base:'plate_outfit',seed:32})});await body.ready;
 assert.deepEqual(body.actor.group.userData.studioPalette,profile.colors,opening.id+' plate palette held');
 assert.deepEqual(body.actor.equipment,profile.equipment,opening.id+' plate: the class look is kept');
 body.dispose();swaps+=2;
}
for(const role of [...NPC_LIST,...Object.values(STORY_ROLES)]){
 const body=buildStudioNpc({role,personName:`${role.name} Test`});await body.ready;
 assert.equal(body.actor.group.userData.classId,NPC_STUDIO_LOOK[role.id],role.id+' studio look');
 assert.ok(body.actor.group.userData.characterCategory,role.id+' has category');
 finite(body.group);body.dispose();npcs++;
}
for(const gender of ['male']){
 const c=planCharacter({opening:'warrior',name:'Gear review',appearance:{gender}}).character;
 for(const s of Object.keys(c.stats))c.stats[s]=100;
 const body=buildStudioCharacter({gender},{classId:'warrior',sourceMotion:true,loadMotionAssets}),actor=playerActor(c);
 const inv=createInventory({character:c,actor,recompute,onChange:()=>body.setEquipment(c.equipment)});body.setEquipment(c.equipment);await body.ready;
 // One outfit per tier since 2026-09-08; studioArmourForOutfit still names its tier's pieces for the codex readout, but the body keeps the class look.
 const outfits=Object.values(BASES).filter(b=>b.slot==='outfit').map(b=>b.id);assert.equal(outfits.length,6,outfits.join(','));
 for(const id of outfits){
  const fit=studioArmourForOutfit({base:id});assert.ok(fit,id);const pieces=canonicalSlots.filter(s=>fit[s]!=='none');assert.ok(pieces.length>=6,id+' dresses '+pieces.length+' slots');
  const index=inv.emptySlot();assert.ok(index>=0);assert.ok(inv.add(makeItem({base:id,seed:13})).added);const eq=inv.equip(index,'outfit');assert.equal(eq.ok,true,eq.reason);await body.ready;
  const worn=body.actor.group.getObjectByName('Studio body and worn armour').userData.studioItems;
  // Since 2026-09-08 the outfit's tier dresses nothing: the class look stays on whatever is worn, and the batch still carries the class pieces.
  for(const s of canonicalSlots)assert.equal(body.actor.equipment[s],classProfiles.warrior.equipment[s],id+' '+s+' keeps the class look');
  assert.ok(worn.length>0,id+' worn geometry');void pieces;
  assert.ok(body.actor.group.userData.batchedSourceMeshes>0);finite(body.group);
  assert.equal(inv.unequip('outfit').ok,true);await body.ready;for(const s of pieces)assert.equal(body.actor.equipment[s],classProfiles.warrior.equipment[s],id+' off '+s);
  inv.remove(inv.pack.items.findIndex(i=>i?.base===id));swaps++;
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
for(const id of [...Object.keys(chibiMonsterLooks),...Object.keys(chibiCreatureLooks)]){
 const gameId=Object.entries(STUDIO_MONSTER_LOOK).find(([,look])=>look===id)?.[0];
 assert.ok(gameId,id+' has game id');
 const m=buildMonsterModel(gameId);assert.ok(m?.studioActor,gameId+' studio actor');
 assert.equal(m.studioActor.group.userData.sourceCreatureId,id,gameId+' source id');
 assert.equal(m.studioActor.group.userData.characterStyle,'chibi',gameId+' chibi body');
 m.dispose();
}
const representatives=[...Object.values(BASES).map(b=>({base:b.id})),...GEMS.map(g=>({base:'gem',material:g.id}))];
// the studio's armour pieces are dressed off the one outfit since 2026-09-08 and are not drops of their own; every other catalogue row still has a live item behind it
for(const row of itemCatalog.filter(r=>r.kind!=='armor')){const item=representatives.find(i=>studioItemId(i)===row.id);assert.ok(item,'No live item maps to '+row.id);const parent=new THREE.Group(),replacement=new THREE.Group();parent.add(replacement);const drop=attachStudioDrop(parent,item,replacement);assert.equal(await drop.ready,true,row.id);assert.equal(replacement.visible,false);finite(parent);drop.dispose();assert.equal(parent.children.length,1);drops++;}
const gear={mainHand:{base:'greatsword'},offHand:{base:'kite'}};assert.equal(studioEquipment(gear).off,'none');delete gear.mainHand;assert.equal(studioEquipment(gear).off,'kite');
assert.equal(studioMaterial({base:'heater',material:'iron'}).construction,'metal');
for(const [id,affix]of Object.entries({flame:'hitFireball',frost:'hitFrost',shock:'hitLightning',vampiric:'lifeLeech',keen:'critChance',force:'damage'}))assert.equal(enchantmentFor({}, {identified:true,affixes:[{id:affix,value:5}]}).id,id);
assert.equal(enchantmentFor({enchant:{until:10,hitsLeft:1,damageType:'poison'}},{base:'dagger'},9).id,'venom');assert.equal(enchantmentFor({enchant:{until:10,hitsLeft:1,damageType:'holy'}},{base:'dagger'},9).id,'holy');assert.equal(enchantmentFor({enchant:{until:10,hitsLeft:1,damageType:'holy'}},{base:'dagger'},10).id,'none');
const missingSource=ABILITIES.filter(a=>!sourceAbility(a.id)).map(a=>a.id);
assert.deepEqual(missingSource,['dualStrike','deepCut','throwingKnife','kidneyShot','finishingStrike','camp','recall']);
assert.equal(swaps,14);   // four class tier changes, plus the six outfits worn and taken off once each
console.log(JSON.stringify({bodies,swaps,heldSwaps,npcs,creatures,drops,casts,sourceAbilities:ABILITIES.length-missingSource.length}));
