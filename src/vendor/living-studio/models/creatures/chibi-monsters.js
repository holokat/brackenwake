import * as THREE from 'three';
import {bindCharacter} from '../rig.js';
import {monsterAnatomies} from './monster-anatomy.js';
import {Sculpt,skinSculpt,bakeClips,finishActor} from './shared.js';
import {addChibiCreatureWeapons,mergeChibiCreatureSkin} from './chibi-skin.js';
import {chibiMonsterLooks} from '../../data/chibi-monsters.js';
import {rigMotions} from './motions.js';
import {buildChibiUndead} from './chibi-undead.js';
import {buildChibiSpectral} from './chibi-spectral.js';
import {buildChibiGoblin} from './chibi-goblins.js';
import {createChibiMonsterPose} from './chibi-monster-poses.js';

/** Purpose-built creature bodies with a common animation naming contract. */
export function createChibiMonster(entry,options={}){
 const look=chibiMonsterLooks[entry.id];
 if(!look)throw new Error(`Unknown chibi monster: ${entry.id}`);
 for(const key of ['head','hair','body'])if(options[key]!==undefined)throw new Error(`Creature ${key} uses the fixed neutral appearance`);
 if(options.clothColor!==undefined&&!/^#[\da-f]{6}$/i.test(options.clothColor))throw new Error('Invalid creature outfit color');
 const variants={clothColor:options.clothColor||look.cloth};
 if(entry.id==='skeleton')variants.armor=options.armor||'bare';
 const native=new THREE.Group();native.name='Chibi creature rig';native.userData.rig=entry.rig;
 const anatomy=monsterAnatomies[entry.id];
 const rig=bindCharacter(native,'chibi','neutral',{jointPositions:anatomy.joints});
 rig.style='chibi';rig.upAxis='z';
 const sculpt=new Sculpt(native),build=look.family==='goblin'?buildChibiGoblin:['spectral','bone'].includes(look.family)?buildChibiSpectral:buildChibiUndead;
 build(sculpt,entry.id,variants);
 const shapeBounds=new THREE.Box3().setFromObject(native,true),bodyHeight=shapeBounds.getSize(new THREE.Vector3()).z;
 skinSculpt(sculpt,rig);
 let sockets=[],grips=[];
 if(!['none','claws'].includes(look.weapon)){
  const attachments=addChibiCreatureWeapons(rig,{...look,trim:'#9c9278'});grips=attachments.grips;
  sockets=grips.map(marker=>({...marker.userData.gripSocket}));
 }
 const {features}=mergeChibiCreatureSkin(rig);
 const clips=bakeClips(rig,rigMotions[entry.rig],createChibiMonsterPose(rig,entry.id,look));
 for(const marker of grips)marker.removeFromParent();delete native.userData.loadout;
 const group=new THREE.Group();group.add(native);native.rotation.x=-Math.PI/2;native.scale.setScalar(look.height/bodyHeight);
 group.userData={features,creatureSockets:sockets,characterStyle:'chibi',characterCategory:'creature',bodyType:'neutral',sourceCreatureId:entry.id,sourceRig:entry.rig,
  sharedOutfit:entry.id,completeOutfit:true,bodyArchetype:entry.id,customCreatureBody:true,playerRigCompatible:false,monsterFamily:look.family,
  boneSignature:rig.bones.map(b=>[b.name,b.parent?.isBone?b.parent.name:null,...rig.rest[b.name].p.toArray()])};
 return finishActor(group,rig,clips,entry,{variants});
}
