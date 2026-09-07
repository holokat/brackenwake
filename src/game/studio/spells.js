import * as THREE from 'three';
import {createAbilityVfx,abilityTiming} from '../../vendor/living-studio/vendor/source-library.js';
import {sourceAbility} from './body.js';
// These effects already have game-specific impact, chain and summon placement
// adapters. Preserve those real targets instead of the studio practice targets.
const TARGETED=new Set(['fireball','magic-arrow','ice-shard','lightning','chain-lightning','energy-missiles','meteor','heal','greater-heal','life-drain','volley','double-shot','piercing-arrow','crippling-shot','hunters-mark','snare','beast-call','blink','shadowstep','disengage','raise-skeleton','summon-imp','summon-hound','raise-champion']);
export function createStudioSpells(legacy,rig){
 let source=null,textures=null,active=null,releaseCaptured=false;const weaponBounds=new THREE.Box3(),inverse=new THREE.Matrix4();
 const build=()=>{
  if(!legacy.textures)return false;
  if(textures===legacy.textures&&source)return true;
  source?.dispose();textures=legacy.textures;
  source=createAbilityVfx(rig.group,{
   hand(out){rig.parts.handR.getWorldPosition(out);return rig.group.worldToLocal(out);},
   strikeTip(out){const props=rig.studio?.actor?.group.userData.loadout||[],weapon=props.find(p=>p.userData.slot==='weapon');if(weapon){weapon.updateWorldMatrix(true,true);weaponBounds.setFromObject(weapon).getCenter(out);}else rig.parts.handR.getWorldPosition(out);return rig.group.worldToLocal(out);},
   target(_ability,out){if(active?.target){const p=active.target.pos||active.target;out.set(p.x,p.y??rig.pos.y,p.z);if(!active.ground&&!['nova','trap','portal'].includes(active.definition.visual.family))out.y+=1;out.applyMatrix4(inverse);}},
  },textures);return true;
 };
 const api=Object.create(legacy);
 api.start=(id,opts={})=>{
  const plan=legacy.start(id,opts),definition=sourceAbility(id);rig.studio?.beginAbility(id);active=null;
  if(!plan||!definition)return plan;
  const sourceReady=build();const timing=abilityTiming(definition);inverse.copy(rig.group.matrixWorld).invert();
  active={id,plan,definition,timing,recovery:Math.min(.35,timing.recovery),t:0,target:opts.ground||opts.target,ground:!!opts.ground,source:sourceReady&&!TARGETED.has(definition.id)&&!['slash','impact'].includes(definition.visual.family)};
  releaseCaptured=false;if(active.source)source.begin(definition);else source?.reset();return plan;
 };
 api.retarget=opts=>{if(active){active.target=opts.ground||opts.target||active.target;active.ground=!!opts.ground;}return legacy.retarget(opts);};
 api.interrupt=reason=>{active=null;source?.reset();rig.studio?.endAbility();return legacy.interrupt(reason);};
 api.update=dt=>{
  legacy.update(dt);if(!active)return;
  active.t+=Math.max(0,Math.min(.1,dt));const a=active,release=Math.max(.001,a.plan.release);
  const time=a.t<release?a.t/release*a.timing.release:a.t-release+a.timing.release;
  const phase=a.t<release?(a.t/release)*a.timing.marker:Math.min(1,a.timing.marker+(a.t-release)/Math.max(.1,a.recovery)*(1-a.timing.marker));
  if(a.t<release+a.recovery)rig.studio?.sampleAbility(a.id,phase);
  if(!releaseCaptured&&a.t>=release){source?.captureRelease();releaseCaptured=true;}
  if(a.source){source.sample(time);legacy.root.visible=false;
   // Studio-only practice actors have no place in the live game.
   const root=rig.group.getObjectByName('EquipmentIndependentAbilityVfx');root?.traverse(o=>{if(/^TrainingTarget/.test(o.name))o.visible=false;});
  }
  if(a.t>=Math.max(a.plan.duration,release+a.timing.duration-a.timing.release)){active=null;source?.reset();rig.studio?.endAbility();}
 };
 api.dispose=()=>{source?.dispose();legacy.dispose();};
 Object.defineProperty(api,'studioState',{get:()=>({sourceReady:!!source,active:active?.id||null,usesSource:!!active?.source})});
 return api;
}
