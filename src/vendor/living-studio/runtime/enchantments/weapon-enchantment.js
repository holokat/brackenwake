import * as THREE from 'three';
import {enchantmentById} from '../../data/enchantments.js';
import {createSurfaceProfile} from './surface-profile.js';
import {createSurfaceAura} from './materials.js';
import {createEmitters} from './emitters.js';
import {createStructures} from './structures.js';
import {createMotionTrail} from './motion-trail.js';
import {createImpacts} from './impacts.js';

/** Separate, swappable effect ownership. The caller owns target and scene. */
export function createWeaponEnchantment({target,scene,id,level=2,seed=1}){
  if(!target?.isObject3D||!scene?.isObject3D)throw new TypeError('Enchantment needs target and scene Object3D instances');
  if(!enchantmentById.has(id))throw new RangeError(`Unknown enchantment: ${id}`);
  if(![1,2,3].includes(level))throw new RangeError('Enchantment level must be 1, 2 or 3');
  const profile=createSurfaceProfile(target,seed),root=new THREE.Group(),attached=new THREE.Group();
  root.name=`${id} enchantment`;root.userData={enchantment:id,level,enchantmentOwned:true};attached.name='Weapon-local enchantment layers';attached.matrixAutoUpdate=false;root.add(attached);
  const layers=[createSurfaceAura(profile,id,level),createEmitters(profile,id,level,seed),...createStructures(profile,id,level,seed)];
  layers.forEach(layer=>attached.add(layer.object));
  const light=new THREE.PointLight(enchantmentById.get(id).color,0,0,2);light.name='Enchantment reflected light';light.castShadow=false;light.userData.enchantmentOwned=true;attached.add(light);
  const trail=createMotionTrail(profile,id,level),impacts=createImpacts(id,level,profile.scale,seed);root.add(trail.object,impacts.object);scene.add(root);
  const inverse=new THREE.Matrix4(),worldScale=new THREE.Vector3(),worldPosition=new THREE.Vector3(),worldRotation=new THREE.Quaternion();let lastTime=null,disposed=false;
  function reset(){trail.reset();impacts.reset();lastTime=null;}
  function resetTrail(){trail.reset();}
  function update({time,delta=0}){
    if(disposed||!Number.isFinite(time))return;
    if(lastTime!==null&&(time<lastTime||time-lastTime>.2))reset();
    target.updateWorldMatrix(true,true);scene.updateWorldMatrix(true,false);inverse.copy(scene.matrixWorld).invert();attached.matrix.multiplyMatrices(inverse,target.matrixWorld);attached.matrixWorldNeedsUpdate=true;
    let visible=true;for(let node=target;node;node=node.parent)if(!node.visible){visible=false;break;}root.visible=visible;
    const surfaceChanged=profile.refresh();for(const layer of layers)layer.update(time,surfaceChanged);
    target.matrixWorld.decompose(worldPosition,worldRotation,worldScale);const physicalScale=profile.scale*Math.max(Math.abs(worldScale.x),Math.abs(worldScale.y),Math.abs(worldScale.z));
    light.position.copy(profile.center);light.position.y-=profile.scale*.08;light.distance=physicalScale*2.8;light.intensity=physicalScale*physicalScale*[0,.12,.32,.62][level]*(id==='keen'?.2:1)*(id==='flame'?.88+Math.sin(time*8.3)*.08+Math.sin(time*13.7)*.04:1);
    trail.update(time,target.matrixWorld,inverse);impacts.update(time,inverse);lastTime=time;
  }
  function tipWorld(out=new THREE.Vector3()){target.updateWorldMatrix(true,false);return out.copy(profile.tip).applyMatrix4(target.matrixWorld);}
  function triggerImpact(position,time=lastTime??0){if(disposed)return;target.updateWorldMatrix(true,false);target.matrixWorld.decompose(worldPosition,worldRotation,worldScale);return impacts.trigger(position,time,Math.max(Math.abs(worldScale.x),Math.abs(worldScale.y),Math.abs(worldScale.z)));}
  function dispose(){if(disposed)return;disposed=true;root.removeFromParent();const geometries=new Set(),materials=new Set();root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[])materials.add(material);});for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();root.clear();}
  reset();update({time:0,delta:0});
  return {root,profile,update,triggerImpact,reset,resetTrail,tipWorld,dispose};
}
