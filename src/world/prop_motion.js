import * as THREE from 'three';
import {isMeadowFoliage} from '../mmo/haven_meadow_assets.js';

/** Keep authored moving nodes separate; ordinary GLBs still use instancing. */
export function bindPropMotion(root){
 const nodes=[];
 root.traverse(o=>{
  const motion=o.userData.bwMotion||(o.name==='mill_wheel_pivot'?{kind:'spin',axis:'x',speed:.55}:null);
  if(!motion||!['x','y','z'].includes(motion.axis)||!Number.isFinite(motion.speed))return;
  nodes.push({o,motion,base:o.rotation[motion.axis]});
 });
 if(!nodes.length)return null;
 let time=0;
 return dt=>{time+=Number.isFinite(dt)?Math.max(0,dt):0;for(const{o,motion:m,base}of nodes)o.rotation[m.axis]=base+(m.kind==='sway'?Math.sin(time*m.speed)*(m.amplitude||.05):time*m.speed);};
}

/** A flower patch follows its local hillside instead of disappearing beneath it. */
export function settleMeadowFoliage(model,group,x,z,yaw,heightAt){
 if(!isMeadowFoliage(model))return;
 const dx=(heightAt(x+1,z)-heightAt(x-1,z))/2,dz=(heightAt(x,z+1)-heightAt(x,z-1))/2;
 const slope=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-dx,1,-dz).normalize());
 group.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw).premultiply(slope);
 group.position.y=heightAt(x,z)-.02;
}
