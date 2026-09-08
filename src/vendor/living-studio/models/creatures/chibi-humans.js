import * as THREE from 'three';
import {createChibiCharacterSync} from '../chibi/character.js';
import {classProfile} from '../class-profiles.js';
import {chibiCreatureLooks} from '../../data/chibi-creatures.js';
import {defaultCharacterColors,skinToneById,hairColorById} from '../../data/character-colors.js';
import {bakeClips,finishActor} from './shared.js';
import {rigMotions} from './motions.js';
import {addChibiCreatureWeapons,mergeChibiCreatureSkin} from './chibi-skin.js';
import {createChibiHumanPose,creatureBowDraw} from './chibi-human-poses.js';

export function createChibiHuman(entry,options={}){
 for(const field of ['head','hair','body'])if(options[field]!==undefined)throw new Error(`Creature ${field} uses the fixed neutral appearance`);
 const customization={...defaultCharacterColors};
 for(const [field,values] of [['skinTone',skinToneById],['hairColor',hairColorById]]){
  if(options[field]!==undefined&&!values.has(options[field]))throw new Error(`Unknown creature ${field}: ${options[field]}`);
  if(options[field]!==undefined)customization[field]=options[field];
 }
 if(options.clothColor!==undefined&&!/^#[\da-f]{6}$/i.test(options.clothColor))throw new Error('Invalid creature outfit color');
 const look={...chibiCreatureLooks[entry.id]};look.trim=classProfile(look.outfit).colors.trim;
 const character=createChibiCharacterSync(look.outfit,{bodyType:'neutral',customization});
 const {group:native,rig}=character;native.name='Neutral chibi human rig';native.userData.rig=entry.rig;rig.upAxis='z';
 if(options.clothColor)native.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.colorChannel==='cloth')mesh.material.color.set(options.clothColor);});
 const weapons=addChibiCreatureWeapons(rig,look),{skin,features}=mergeChibiCreatureSkin(rig);
 const clips=bakeClips(rig,rigMotions[entry.rig],createChibiHumanPose(rig,look,weapons.bow));
 const sockets=weapons.grips.map(marker=>({...marker.userData.gripSocket}));
 for(const marker of weapons.grips)marker.removeFromParent();delete native.userData.loadout;
 if(weapons.bow)for(const clip of clips){
  const times=Array.from(clip.tracks[0].times),values=times.map(time=>clip.name==='cast'?creatureBowDraw(time/clip.duration):0);
  clip.tracks.push(new THREE.NumberKeyframeTrack(`${skin.name}.morphTargetInfluences`,times,values));
 }
 const height=new THREE.Box3().setFromObject(native,true).getSize(new THREE.Vector3()).z;
 const group=new THREE.Group();group.add(native);native.rotation.x=-Math.PI/2;native.scale.setScalar(1.8/height);
 group.userData={features,creatureSockets:sockets,bowHand:weapons.bow?'L':null,drawHand:weapons.bow?'R':null,characterStyle:'chibi',characterCategory:'creature',bodyType:'neutral',humanReplacement:true,sourceCreatureId:entry.id,sharedOutfit:look.outfit,sourceRig:entry.rig,playerRigCompatible:true,
  boneSignature:rig.bones.map(b=>[b.name,b.parent?.isBone?b.parent.name:null,...rig.rest[b.name].p.toArray()])};
 return finishActor(group,rig,clips,entry,{variants:{...customization,clothColor:options.clothColor||classProfile(look.outfit).colors.cloth}});
}
