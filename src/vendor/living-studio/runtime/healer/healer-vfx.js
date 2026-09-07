import * as THREE from 'three';
import {abilityTiming} from '../../vendor/source-library.js';
import {createResources,colors} from './resources.js';
import {heal,greaterHeal,bless,sanctuary,layOnHands} from './healing-effects.js';
import {consecrateWeapon,smite,resurrect,cleanse,stoneSkin} from './signature-effects.js';

export const HEALER_EFFECT_IDS=Object.freeze(['heal','greater-heal','bless','consecrate-weapon','smite','sanctuary','resurrect','lay-on-hands','cleanse','stone-skin']);
const supported=new Set(HEALER_EFFECT_IDS);
const effectColor=id=>id==='heal'?colors.green:id==='resurrect'?colors.blue:id==='cleanse'?colors.white:colors.gold;

/** Source-Y-up VFX. Socket coordinates are in parent/sourceActor space. */
export function createHealerVfx(parent,{actor,hand,weaponBase,weaponTip}){
  const nativeActor=actor?.group??actor;
  if(!parent?.isObject3D||!nativeActor?.isObject3D)throw new TypeError('Healer VFX needs native actor and source parent Object3D instances');
  if(![hand,weaponBase,weaponTip].every(callback=>typeof callback==='function'))throw new TypeError('Healer VFX needs hand and weapon socket callbacks');
  const resources=createResources(),root=new THREE.Group();root.name='Healer ability effects';root.visible=false;root.userData.healerOwned=true;parent.add(root);
  const anchors={hand:new THREE.Vector3(),weaponBase:new THREE.Vector3(),weaponTip:new THREE.Vector3(),releaseHand:new THREE.Vector3()};
  let effects;
  try{effects=new Map([['heal',heal(resources)],['greater-heal',greaterHeal(resources)],['bless',bless(resources)],['consecrate-weapon',consecrateWeapon(resources)],['smite',smite(resources)],['sanctuary',sanctuary(resources)],['resurrect',resurrect(resources,nativeActor,parent)],['lay-on-hands',layOnHands(resources)],['cleanse',cleanse(resources)],['stone-skin',stoneSkin(resources)]]);}catch(error){root.removeFromParent();resources.dispose();throw error;}
  for(const [id,effect]of effects){effect.root.userData.healerEffectId=id;effect.root.visible=false;root.add(effect.root);}
  const light=new THREE.PointLight(colors.gold,0,2.8,2);light.name='Restrained healing reflection';light.castShadow=false;root.add(light);
  let current=null,timing=null,disposed=false;
  const state={time:0,age:0,charge:0,released:0,envelope:0,anchors},bodyLightPosition=new THREE.Vector3(0,1.1,0);
  let capacity=0,vertices=0,drawables=0;root.traverse(object=>{if(object.isMesh||object.isPoints||object.isLine)drawables++;if(object.isInstancedMesh)capacity+=object.count;else if(object.geometry?.isInstancedBufferGeometry)capacity+=object.geometry.instanceCount;});for(const geometry of resources.geometries)vertices+=geometry.attributes.position?.count??0;
  root.userData={...root.userData,activeEffectId:null,healerEffects:{ids:[...HEALER_EFFECT_IDS]},anchors,stats:{geometries:resources.geometries.size,materials:resources.materials.size,instancedCapacity:capacity,vertices,drawables}};
  function read(callback,out){callback(out);if(![out.x,out.y,out.z].every(Number.isFinite))throw new TypeError('Healer socket coordinates must be finite');}
  function readAnchors(){read(hand,anchors.hand);read(weaponBase,anchors.weaponBase);read(weaponTip,anchors.weaponTip);}
  function reset(){if(disposed)return;current=null;timing=null;root.visible=false;root.userData.activeEffectId=null;for(const effect of effects.values())effect.root.visible=false;for(const anchor of Object.values(anchors))anchor.set(0,0,0);light.intensity=0;}
  function begin(ability){if(disposed)return false;reset();if(!supported.has(ability?.id))return false;timing=abilityTiming(ability);current=ability;readAnchors();anchors.releaseHand.copy(anchors.hand);effects.get(ability.id).capture?.();root.userData.activeEffectId=ability.id;return true;}
  function captureRelease(){if(disposed||!current)return;readAnchors();anchors.releaseHand.copy(anchors.hand);effects.get(current.id).capture?.();}
  function sample(seconds){if(disposed)return;if(!Number.isFinite(seconds))throw new TypeError('Healer sample time must be finite');if(!current)return;const time=Math.max(0,seconds);root.visible=time>0&&time<timing.duration;const effect=effects.get(current.id);effect.root.visible=root.visible;if(!root.visible){light.intensity=0;return;}readAnchors();state.time=time;state.age=time-timing.release;state.charge=THREE.MathUtils.clamp(time/timing.release,0,1);state.released=THREE.MathUtils.smoothstep(time,timing.release-.025,timing.release+.23);state.envelope=THREE.MathUtils.smoothstep(time,0,Math.max(.12,timing.release*.52))*(1-THREE.MathUtils.smoothstep(time,timing.duration-.72,timing.duration));effect.sample(state);light.color.copy(effectColor(current.id));light.position.copy(current.id==='lay-on-hands'||current.id==='consecrate-weapon'?anchors.hand:bodyLightPosition);light.intensity=state.envelope*(.045+state.released*.12);light.distance=2.8;}
  function dispose(){if(disposed)return;reset();disposed=true;root.removeFromParent();resources.dispose();root.clear();}
  reset();return {root,begin,sample,captureRelease,reset,dispose};
}
