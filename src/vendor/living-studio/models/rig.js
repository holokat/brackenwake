import * as THREE from 'three';
import {femalePoint} from './morphology.js';
import {equipmentWeights} from './skin-weights.js';
const v=(a)=>new THREE.Vector3(...a);
export function bindCharacter(group,kind,bodyType='male',{jointPositions=null,pointTransform=null}={}){
 const bones=[],joints={},positions={},gripPoints={};
 function joint(name,point,parent){
  if(jointPositions?.[name])point=[...jointPositions[name]];
  const map=p=>pointTransform?pointTransform(...p):bodyType==='female'?femalePoint(...p):p;
  if(/^hand[LR]$/.test(name)){
   const side=name.at(-1),center=[point[0]+(side==='R'?.005:-.005),point[1]-.08,point[2]-.25];
   gripPoints[side]=v(map(center)).sub(v(map(point)));
  }
  point=map(point);const b=new THREE.Bone();b.name=name;b.position.copy(v(point));if(parent)b.position.sub(positions[parent]);(parent?joints[parent]:group).add(b);bones.push(b);joints[name]=b;positions[name]=v(point);return b;
 }
 joint('hips',[0,0,3.95]);joint('spine',[0,0,4.8],'hips');joint('chest',[0,0,5.8],'spine');joint('neck',[0,.03,6.55],'chest');joint('head',[0,.03,7.02],'neck');
 for(const[s,label]of[[-1,'L'],[1,'R']]){
  const base=kind==='base',mage=['mage','wizard'].includes(kind)&&s===-1;
  joint('upperArm'+label,[s*(base?1.1:1.03),0,base?6.3:6.13],'chest');
  joint('forearm'+label,mage?[-1.56,0,4.9]:[s*(base?1.64:1.45),-.015,5.05],'upperArm'+label);
  joint('hand'+label,mage?[-2.56,-.35,4.93]:[s*(base?2.03:1.61),base?-.07:-.22,base?4.14:4.03],'forearm'+label);
  joint('thigh'+label,[s*.48,.04,3.9],'hips');joint('shin'+label,[s*.67,-.06,2.23],'thigh'+label);joint('foot'+label,[s*.87,0,.48],'shin'+label);
 }
 group.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);skeleton.calculateInverses();
 const meshes=[];group.traverse(o=>{if(o.isMesh)meshes.push(o);});
 const index=name=>bones.indexOf(joints[name]);
 function weights(x,y,z,name,part){
  const s=x<0?'L':'R',abs=Math.abs(x),N=name.toLowerCase();
  if(/block hand|block thumb/.test(N))return [['hand'+(name.endsWith('-1')?'L':'R'),1]];
  if(/belt|buckle|pouch|satchel|waist fastening/.test(N))return [['hips',1]];
  if(/staff|jewel|crystal/.test(N))return [['handL',1]];
  if(/bow|string/.test(N))return [['handR',1]];
  if(/sword|sheath/.test(N))return [['hips',1]];
  if(/quiver|arrow/.test(N))return [['chest',1]];
  if(/pauldron|shoulder.*crown|shoulder.*plate/.test(N))return [['upperArm'+s,1]];
  if(part==='head'||part==='hair'||z>7.0)return [['head',1]];
  if(/finger|thumb|palm|gripping/.test(N))return [['hand'+(N.includes('grip')||N.includes('wrapped')?'L':s),1]];
  if(/bracer|gauntlet|wrist|vambrace/.test(N))return [['forearm'+s,1]];
  if(/trouser.*leg|pant.*leg/.test(N)){if(z<2.13)return [['shin'+s,1]];if(z<2.43)return [['shin'+s,.5],['thigh'+s,.5]];return [['thigh'+s,1]];}
  if(/boot|ankle|knee|shin/.test(N))return [[(z<.6?'foot':'shin')+s,1]];
  if((abs>.90&&z>3.3&&z<6.7)&&!(/skirt|robe.*panel|tabard|belt|pouch|mantle|hood/.test(N))){
   const sh=positions['upperArm'+s],el=positions['forearm'+s],ha=positions['hand'+s],p=v([x,y,z]);
   const d1=p.distanceTo(el),d2=p.distanceTo(ha);if(d2<.24||z<ha.z-.14)return [['hand'+s,1]];
   if(d1<.25){const t=THREE.MathUtils.clamp((z-el.z+.25)/.5,0,1);return [['upperArm'+s,t],['forearm'+s,1-t]];}
   return [[p.distanceTo(sh)<p.distanceTo(ha)?'upperArm'+s:'forearm'+s,1]];
  }
  if(z<4.08){if(/robe|skirt|tabard/.test(N))return [['hips',.7],['thigh'+s,.3]];if(z<.62)return [['foot'+s,1]];if(z<2.13)return [['shin'+s,1]];if(z<2.43)return [['shin'+s,.5],['thigh'+s,.5]];return [['thigh'+s,1]];}
  if(z>6.5)return [['neck',1]];if(z>5.65)return [['chest',1]];if(z>4.65)return [['spine',.65],['chest',.35]];return [['hips',1]];
 }
 for(const o of meshes){const pos=o.geometry.attributes.position,indices=[],ww=[],fixed=equipmentWeights(o,positions);for(let i=0;i<pos.count;i++){const w=typeof fixed==='function'?fixed(pos.getX(i),pos.getY(i),pos.getZ(i)):fixed||weights(pos.getX(i),pos.getY(i),pos.getZ(i),o.name,o.userData.part);for(let k=0;k<4;k++){indices.push(k<w.length?index(w[k][0]):0);ww.push(k<w.length?w[k][1]:0);}}
  o.geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));o.geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(ww,4));
  const sk=new THREE.SkinnedMesh(o.geometry,o.material);sk.name=o.name;sk.visible=o.visible;sk.userData={...o.userData};sk.castShadow=true;sk.receiveShadow=true;sk.frustumCulled=false;group.remove(o);group.add(sk);sk.bind(skeleton);
 }
 const rest={};for(const b of bones)rest[b.name]={p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()};
 return {group,joints,bones,skeleton,positions,gripPoints,bodyType,rest,reset(){for(const b of bones){b.position.copy(rest[b.name].p);b.quaternion.copy(rest[b.name].q);b.scale.copy(rest[b.name].s);}}};
}
