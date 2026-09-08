import {attachFaceMark} from './face-marks.js';
import {createStudioEmotes} from './emotes.js';
import * as THREE from 'three';
import {createCharacter,disposeCharacter} from '../../vendor/living-studio/models/character.js';
import {classProfiles} from '../../vendor/living-studio/models/class-profiles.js';
import {mountLoadout,createHandheldItem} from '../../vendor/living-studio/models/weapons.js';
import {applyMaterialSelection} from '../../vendor/living-studio/models/item-materials.js';
import {Animator} from '../../vendor/living-studio/runtime/animation.js';
import {createSourceMotion} from '../../vendor/living-studio/runtime/source-motion.js';
import {posePreviewEquipment,previewEquipmentMode} from '../../vendor/living-studio/runtime/preview-equipment.js';
import {MOVE_BY_ID,ABILITY_BY_ID} from '../../vendor/living-studio/vendor/source-library.js';
import {studioEquipment,studioMaterial,equipmentSignature} from './equipment.js';
import {batchBody} from './batch-body.js';
import {APPEARANCE_FALLBACK,BUILD_GIRTH,SKIN_COLOURS,HAIR_COLOURS} from '../player.js';
const PARTS={hips:'hips',torso:'chest',head:'head',armL:'upperArmL',armR:'upperArmR',handL:'handL',handR:'handR',legL:'thighL',legR:'thighR',shinL:'shinL',shinR:'shinR',footL:'footL',footR:'footR',bootL:'footL',bootR:'footR',back:'chest'};
const SKINS={pale:'porcelain',fair:'warm-beige',sand:'golden-beige',olive:'olive-beige',tan:'warm-tan',copper:'warm-brown',umber:'deep-brown',ebony:'deep-ebony'};
const HAIR={cropped:'close_crop',short:'side_part',tousled:'curly_crop',swept:'default',topknot:'top_knot',braid:'long_braid',bob:'bob',ponytail:'default',wild:'rounded_curls',long:'long_braid','twin braids':'long_braid',shaved:'close_crop'};
export const OPENING_STUDIO_CLASS={warrior:'warrior',ranger:'ranger',rogue:'rogue',mage:'wizard'};
export function studioClassForOpening(id){
 return OPENING_STUDIO_CLASS[id]||id;
}
export function auditStudioOpeningClasses(openings){
 const bad=[];
 for(const opening of openings){
  const kind=studioClassForOpening(opening.id);
  if(!Object.hasOwn(classProfiles,kind))bad.push(`${opening.id} maps to missing studio class ${kind}`);
 }
 for(const [id,kind] of Object.entries(OPENING_STUDIO_CLASS))if(!openings.some(opening=>opening.id===id))bad.push(`${id} maps to ${kind} and is not an opening`);
 if(bad.length)throw new Error(`studio body: ${bad.join('; ')}`);
 return Object.keys(OPENING_STUDIO_CLASS).length;
}
let assets;
export function loadStudioMotionAssets(){return assets??=Promise.all(['models/warrior-base-rigged.glb','animations/quaternius-retargeted.json'].map(async(p,i)=>{const r=await fetch('/studio/'+p);if(!r.ok)throw new Error(`Studio motion: ${r.status} ${p}`);return i?r.json():r.arrayBuffer();})).catch(e=>{assets=null;throw e;});}
export const sourceAbility=id=>ABILITY_BY_ID.get(String(id).replace(/[A-Z]/g,c=>'-'+c.toLowerCase()));

/** Stable game body. Source actors may be replaced; position and socket objects never are. */
export function buildStudioCharacter(appearance={},options={}){
 const group=new THREE.Group();group.name='Kaldera studio character';const parts={},sockets=new THREE.Group();sockets.name='Interaction sockets';group.add(sockets);
 for(const key of Object.keys(PARTS)){parts[key]=new THREE.Object3D();parts[key].name='studio:'+key;sockets.add(parts[key]);}
 let look={...APPEARANCE_FALLBACK,...appearance},equipment={},equipOpts={},revision=0,closed=false,actor=null,motion=null,animator=null,ready=Promise.resolve(),lastSignature='',state={t:0,phase:0,anim:'idle',speed:0},currentAbility=null;
 const temp=new THREE.Vector3(),quat=new THREE.Quaternion(),nativeRotation=new THREE.Quaternion(),nativeScale=new THREE.Vector3(),emote=createStudioEmotes();
 const sync=()=>{if(!actor)return;actor.group.updateWorldMatrix(true,true);group.updateWorldMatrix(true,false);for(const[key,bone]of Object.entries(PARTS)){actor.rig.joints[bone].getWorldPosition(temp);parts[key].position.copy(group.worldToLocal(temp));actor.rig.joints[bone].getWorldQuaternion(quat);group.getWorldQuaternion(parts[key].quaternion).invert().multiply(quat);}sockets.updateMatrixWorld(true);};
 const cleanup=(a,m)=>{m?.dispose();if(a)disposeCharacter(a);};
 // The studio's idle carries a one hand weapon straight down the flank with the
 // blade out sideways. The user wants the elbow out and the blade forward,
 // turned in a little (2026-09-08). Added after the sampled pose on the
 // locomotion moves only, so a swing keeps the studio's own arm.
 let gripOne=false;
 // Radians added to the studio's own arm on a one hand hold: the elbow out, the
 // forearm forward, the palm turned toward the body and the blade up and out a
 // little (the user, 2026-09-08). Reachable as globalThis.__bwGrip so the
 // angles can be tuned live against the codex doll; the numbers here are the
 // ones that were kept.
 const GRIP_ONE=globalThis.__bwGrip||(globalThis.__bwGrip={armX:-.25,armY:0,armZ:-.4,foreX:-1.1,foreZ:0,handX:-1.5,handY:-.6,handZ:-.3});
 const GRIP_MOVES=new Set(['idle','walk','run','combat-idle']),TWO_HANDED=new Set(['greatsword','battleaxe','warhammer','maul','quarterstaff','staff','halberd','glaive','spear','shortbow','longbow','crossbow','bow']);
 // The clip does not rewrite every bone every frame, so an offset added on top
 // of a bone would pile up frame after frame (measured: forearmR.rotation.x at
 // -4.46 after a few seconds). The base pose is kept and put back before the
 // next sample, so the offset is always applied once, to the clip's own pose.
 const GRIP_JOINTS=['upperArmR','forearmR','handR'],gripBase=new Map();
 const restoreGrip=()=>{if(!actor||!gripBase.size)return;for(const [n,q] of gripBase){const j=actor.rig.joints[n];if(j)j.quaternion.copy(q);}gripBase.clear();};
 const holdWeapon=(move)=>{
  if(!actor||!GRIP_MOVES.has(move))return;
  if(gripOne){const j=actor.rig.joints,g=GRIP_ONE;if(j.upperArmR&&j.forearmR&&j.handR){for(const n of GRIP_JOINTS)gripBase.set(n,j[n].quaternion.clone());j.upperArmR.rotation.x+=g.armX;j.upperArmR.rotation.y+=g.armY;j.upperArmR.rotation.z+=g.armZ;j.forearmR.rotation.x+=g.foreX;j.forearmR.rotation.z+=g.foreZ;j.handR.rotation.x+=g.handX;j.handR.rotation.y+=g.handY;j.handR.rotation.z+=g.handZ;}}
  if(heldStaff)for(const prop of actor.group.userData.loadout||[])if(prop.userData.twoHandedGrip)uprightStaff(prop);
 };
 // The studio carries a staff along the forearm, tilted, and the user wants it
 // stood straight up at rest and on the move (2026-09-08). The shaft is the
 // prop's longest local extent, measured once; the tip is the end further from
 // the grip, which is the prop's origin. The hand stays where the studio's
 // solver put it; only the staff turns.
 let heldStaff=false;
 const WORLD_UP=new THREE.Vector3(0,1,0),shaftQ=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),shaftV=new THREE.Vector3();
 function shaftOf(prop){
  if(prop.userData.shaft)return prop.userData.shaft;
  const box=new THREE.Box3(),m=new THREE.Matrix4();
  prop.traverse(o=>{if(!o.isMesh||!o.geometry)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();m.identity();let n=o;while(n&&n!==prop){m.premultiply(n.matrix);n=n.parent;}box.union(o.geometry.boundingBox.clone().applyMatrix4(m));});
  const size=box.getSize(new THREE.Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';
  const sign=Math.abs(box.max[axis])>=Math.abs(box.min[axis])?1:-1;
  const shaft=new THREE.Vector3();shaft[axis]=sign;
  prop.userData.shaft=shaft;return shaft;
 }
 function uprightStaff(prop){
  if(!prop.parent)return;
  shaftQ.setFromUnitVectors(shaftOf(prop),WORLD_UP);
  prop.parent.getWorldQuaternion(parentQ).invert();
  prop.quaternion.copy(parentQ).multiply(shaftQ);
  prop.updateWorldMatrix(false,true);
 }
 async function rebuild(){
  const version=++revision,snapshot={...look,gender:'male'},eq=structuredClone(equipment),fit=studioEquipment(eq,equipOpts),kind=Object.hasOwn(classProfiles,studioClassForOpening(options.classId))?studioClassForOpening(options.classId):'ranger';
  gripOne=fit.weapon!=='none'&&!TWO_HANDED.has(fit.weapon);heldStaff=/staff/.test(fit.weapon);   // the studio's ids are 'staff' and 'quarterstaff'
  ready=Promise.resolve().then(async()=>{
   if(closed||version!==revision)return;
   const bodyType=snapshot.gender==='female'?'female':'male';
   const next=await createCharacter(kind,{bodyType,equipment:fit.armor,equipmentMaterials:Object.fromEntries(Object.entries(eq).map(([slot,item])=>[slot,studioMaterial(item)])),customization:{hairStyle:HAIR[snapshot.hairStyle]||snapshot.hairStyle,skinTone:SKINS[snapshot.skin]||snapshot.skin,hairColor:snapshot.hairColour==='wheat'?'blond':snapshot.hairColour}});
   let source=null;
   try{
    if(closed||version!==revision){cleanup(next);return;}
    next.group.traverse(o=>{if(o.isMesh&&o.userData.wikiSlot&&eq[o.userData.wikiSlot])applyMaterialSelection(o,studioMaterial(eq[o.userData.wikiSlot]));});
    const loadout=mountLoadout(next.rig,fit.weapon,fit.off);next.previewEquipment=previewEquipmentMode(fit.weapon);
    for(const prop of loadout)applyMaterialSelection(prop,studioMaterial(prop.userData.slot==='weapon'?fit.main:fit.offItem));
    for(const[slot,item]of Object.entries(eq)){
     if(!item||!['neck','ring1','ring2','rings','ranged'].includes(slot))continue;
     if(slot==='ranged'&&item===fit.main)continue;
     const id=slot==='neck'?'amulet':slot==='ranged'?item.base:'ring';
     let prop;try{prop=createHandheldItem(id);}catch{continue;}
     prop.userData.equipmentSlot=slot;applyMaterialSelection(prop,studioMaterial(item));
     if(slot==='ranged'){next.rig.joints.chest.add(prop);prop.position.set(0,.65,-.4);prop.rotation.y=.65;}
     else if(slot==='neck'){next.rig.joints.chest.add(prop);prop.scale.setScalar(.52);prop.position.set(0,-.53,.16);}
     else{next.rig.joints[slot==='ring2'?'handR':'handL'].add(prop);prop.scale.setScalar(.2);prop.rotation.x=Math.PI/2;prop.position.set(-.095,-.235,-.29);}
    }
    // Preserve every saved skin and hair colour, including colours outside the studio's preset list.
    next.group.traverse(o=>{if(!o.isMesh)return;const role=o.userData.materialRole;if(role==='cloth'&&options.tunicColor)o.material.color.setHex(options.tunicColor);if(role==='skin'&&SKIN_COLOURS[snapshot.skin])o.material.color.setHex(SKIN_COLOURS[snapshot.skin]);if(o.userData.part==='hair'&&HAIR_COLOURS[snapshot.hairColour])o.material.color.setHex(HAIR_COLOURS[snapshot.hairColour]);if(snapshot.hairStyle==='shaved'&&o.userData.part==='hair')o.visible=false;});
    // Under a hood the studio keeps a scaled fringe, and in the game those
    // locks poke through the brim at the hairline (the user, 2026-09-08,
    // "messed up near hair line"). The hood covers the brow; no fringe.
    let hooded=false;next.group.traverse(o=>{if(o.isMesh&&/angular hood/.test(o.name))hooded=true;});
    if(hooded)next.group.traverse(o=>{if(o.isMesh&&/^Chibi fringe lock/.test(o.name))o.visible=false;});
    if(options.sourceMotion){const [binary,bank]=await(options.loadMotionAssets?.()||loadStudioMotionAssets());source=await createSourceMotion(next,{loadBinary:async()=>binary,loadJSON:async()=>bank});}
   if(closed||version!==revision){cleanup(next,source);return;}
    next.group.userData.gameClassId=options.classId||kind;
    next.group.userData.studioPalette={...classProfiles[kind].colors};
    attachFaceMark(next,snapshot.mark);
    batchBody(next);
    const unit=(snapshot.height||1.8)/7.9;next.group.rotation.x=-Math.PI/2;next.group.scale.set(-unit*(BUILD_GIRTH[snapshot.build]||1),unit*(BUILD_GIRTH[snapshot.build]||1),unit);
    cleanup(actor,motion);actor=next;motion=source;animator=new Animator(next.rig);group.add(next.group);api.pose(state);
   }catch(error){cleanup(next,source);throw error;}
  });
  ready.catch(error=>{api.errors.push(error.message);console.error('Studio character:',error);});return ready;
 }
 function sample(move,phase,ability){
  restoreGrip();
  if(!actor)return;const p=Math.max(0,Math.min(1,phase));
  if(motion&&MOVE_BY_ID.has(move)){
   // Retargeting and source grip IK operate in the studio's native Z-up frame.
   // Sample before the game conversion, including its reflection and world yaw.
   const parent=actor.group.parent,rotation=nativeRotation.copy(actor.group.quaternion),scale=nativeScale.copy(actor.group.scale);
   actor.group.removeFromParent();actor.group.quaternion.identity();actor.group.scale.setScalar(1);
   try{motion.sample(move,p,ability);posePreviewEquipment(actor,motion);}
   finally{actor.group.quaternion.copy(rotation);actor.group.scale.copy(scale);parent?.add(actor.group);}
  }
  else{const map={'light-attack':'slash','heavy-attack':'heavy','two-handed-strike':'heavy','jump-air':'jump','airborne':'jump','healing':'cast','fireball':'cast','lightning':'cast','combat-idle':'idle','die':'hit'};animator.motion=map[move]||move;animator.duration=1;animator.time=p;animator.apply();}
  holdWeapon(move);
  sync();
 }
 const api={group,parts,get state(){return state;},errors:[],studio:null,
  get ready(){return ready;},get actor(){return actor;},get sourceMotion(){return motion;},get loaded(){return!!actor;},get appearance(){return look;},get equipment(){return equipment;},
  setAppearance(a){const next={...look,...a};if(JSON.stringify(next)!==JSON.stringify(look)){look=next;void rebuild();}return api;},
  setEquipment(eq,opts={}){const sig=equipmentSignature(eq,opts);if(sig===lastSignature)return[];lastSignature=sig;equipment=eq||{};equipOpts=opts;void rebuild();return Object.keys(eq||{});},
  /** The class the studio dresses for: its cloth, leather and trim colours. The creation stage changes it with every opening picked (2026-09-08). */
  setClass(id){const kind=Object.hasOwn(classProfiles,studioClassForOpening(id))?id:'blank';if(options.classId===kind)return false;options.classId=kind;void rebuild();return true;},
  get classId(){const kind=studioClassForOpening(options.classId);return Object.hasOwn(classProfiles,kind)?kind:'blank';},
  pose(s){state=s;const move=s.airborne?'airborne':s.anim==='run'?'run':s.anim==='walk'?'walk':'idle';sample(move,move==='idle'?(s.t%5.6)/5.6:((s.phase||0)/(Math.PI*2))%1);},
  poseAction(name,phase,seconds=.45){
   const fit=studioEquipment(equipment,equipOpts);
   // A swing with a bow in hand is a shot: the studio's archer pose (the aimed
   // shot's own, `visual.pose: 'bow'`) draws the string over the action phase
   // and lets it go, where the sword slash used to play and the arrow left a
   // still hand. The auto attack only ever asks for 'swing', so this is the
   // one place the bow learns to be drawn.
   if(name==='swing'&&['shortbow','longbow','crossbow'].includes(fit.weapon)){
    const shot=sourceAbility('aimedShot');
    if(shot){sample(shot.visual?.motion||'idle',Math.max(0,Math.min(1,phase)),shot);return;}
   }
   const move=name==='swing'&&['greatsword','battleaxe','warhammer','quarterstaff','halberd','spear'].includes(fit.weapon)?'two-handed-strike':({swing:'light-attack',cast:'cast',flinch:'hit',death:'die'})[name]||name;
   let p=phase;if(name==='swing'){const m=MOVE_BY_ID.get(move),event=m?.events.find(e=>e.type==='swing-impact'),contact=event?event.at/m.duration:.5,release=Math.min(.95,.3/seconds);p=phase<release?phase/release*contact:contact+(phase-release)/(1-release)*(1-contact);}
   sample(move,p,currentAbility);
  },
  poseEmote(pose){if(actor){emote(actor,pose);sync();}},
  beginAbility(id){currentAbility=sourceAbility(id);},endAbility(){currentAbility=null;},
  sampleAbility(id,phase){const a=sourceAbility(id);if(a)sample(a.visual?.motion||'cast',phase,a);},
  update(dt,speed=0){state={...state,t:state.t+dt,phase:state.phase+speed*dt/1.4*Math.PI*2,anim:speed>.1?'walk':'idle'};api.pose(state);},
  dispose(){closed=true;revision++;cleanup(actor,motion);group.removeFromParent();actor=null;},
 };
 api.studio=api;void rebuild();return api;
}
