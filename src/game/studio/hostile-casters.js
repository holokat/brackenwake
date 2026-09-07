import * as THREE from 'three';
import {buildStudioCharacter} from './body.js';
const CASTERS={cultist:{height:1.82,weapon:'wand'},cultistAdept:{height:1.95,weapon:'quarterstaff'}};
export function buildStudioCaster(id){
  const row=CASTERS[id];if(!row)return null;
  const body=buildStudioCharacter({gender:'male',skin:'pale',hairStyle:'shaved',height:row.height},{classId:'necromancer',tunicColor:0x373347});
  body.setEquipment(Object.fromEntries(['head','chest','back','hands','wrists','waist','legs','feet'].map(slot=>[slot,{base:'cloth_'+slot}]).concat([['mainHand',{base:row.weapon}]])));
  const group=new THREE.Group();group.name='monster:'+id;group.add(body.group);
  const hit=new THREE.Mesh(new THREE.CylinderGeometry(.45,.45,row.height,8),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=row.height/2;group.add(hit);
  let anim='idle',age=0,phase=0;
  return{group,parts:{...body.parts,hit},radius:.4,height:row.height,silhouette:row.height,clickRadius:.45,clickHeight:row.height,shape:'studio:'+id,monster:id,studioActor:body,
    setAnim(next){if(anim!=='die'&&anim!==next){anim=next;age=0;}},get anim(){return anim;},get dieDone(){return anim==='die'&&age>=1.1;},
    update(dt,speed=0){
      age+=dt;phase+=speed*dt/1.4*Math.PI*2;
      if(anim==='die'){body.pose({t:age,phase:0,anim:'idle',speed:0});body.group.rotation.x=-Math.min(1,age/1.1)*Math.PI/2;return;}
      if(anim==='hurt'||anim==='swing'){const duration=anim==='hurt'?.35:.65;body.poseAction(anim==='hurt'?'flinch':'swing',Math.min(age/duration,1),duration);if(age>duration){anim='idle';age=0;}}
      else if(anim==='cast')body.poseAction('cast',(age%1.1)/1.1,1.1);
      else body.pose({t:age,phase,anim:speed>.15?'walk':'idle',speed});
    },dispose(){body.dispose();hit.geometry.dispose();hit.material.dispose();group.removeFromParent();},
  };
}
