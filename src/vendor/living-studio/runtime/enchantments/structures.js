import * as THREE from 'three';
import {effectMaterial,uniformsFor,radianceGLSL} from './materials.js';
import {randomSource} from './surface-profile.js';

function solidMaterial(id,level,scale) {
  const uniforms=uniformsFor(id,level,scale);
  return effectMaterial(id,{uniforms,blending:['force','frost','vampiric'].includes(id)?THREE.NormalBlending:THREE.AdditiveBlending,vertexShader:`varying vec3 vNormal;void main(){vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,fragmentShader:`uniform vec3 uColor,uCore;uniform float uStrength,uFamily;varying vec3 vNormal;${radianceGLSL}void main(){float light=.35+.65*abs(dot(normalize(vNormal),normalize(vec3(.3,.5,1.))));if(uFamily>5.5&&uFamily<6.5){gl_FragColor=vec4(vec3(.075,.049,.029)+uColor*light*.25,1.);}else gl_FragColor=vec4(elementRadiance(uFamily,uColor,uCore,light*.6),uFamily<1.5?.82:.74);}`});
}

function crystals(profile,id,level,seed) {
  const count=(id==='frost'?10:9)*level,random=randomSource(seed),geometry=new THREE.OctahedronGeometry(1,0),material=solidMaterial(id,level,profile.scale),object=new THREE.InstancedMesh(geometry,material,count);
  const dummy=new THREE.Object3D(),axis=new THREE.Vector3(0,1,0),normal=new THREE.Vector3();
  const entries=Array.from({length:count},(_,i)=>({point:profile.points[Math.floor(i/count*160)],phase:random()*6.28,size:id==='frost'?.018+random()*.027:.022+random()*.037}));
  object.frustumCulled=false;object.name=id==='frost'?'Faceted ice growth':'Orbiting pressure fragments';
  return {object,update(time){for(let i=0;i<count;i++){const {point,phase,size}=entries[i];normal.copy(point.normal);dummy.position.copy(point.position).addScaledVector(normal,(id==='frost'?.025:.07+Math.sin(time*1.6+phase)*.03)*profile.scale);dummy.quaternion.setFromUnitVectors(axis,normal);dummy.rotateY(phase+(id==='force'?time:0));const growth=id==='frost'?.88+.12*Math.sin(time*.9+phase):.65;dummy.scale.set(size, size*(id==='frost'?3.1:1.3),size*.7).multiplyScalar(profile.scale*growth*(.8+level*.17));dummy.updateMatrix();object.setMatrixAt(i,dummy.matrix);}object.instanceMatrix.needsUpdate=true;}};
}

function filaments(profile,id,level,seed) {
  const branches=id==='shock'?4+level*2:3+level,steps=id==='shock'?8:30,count=branches*steps,random=randomSource(seed);
  const geometry=new THREE.CylinderGeometry(1,1,1,4,1,true),uniforms=uniformsFor(id,level,profile.scale);
  const material=solidMaterial(id,level,profile.scale);material.uniforms=uniforms;
  const object=new THREE.InstancedMesh(geometry,material,count);object.frustumCulled=false;object.name=id==='shock'?'Branching electric filaments':'Returning crimson siphons';
  const dummy=new THREE.Object3D(),axis=new THREE.Vector3(0,1,0),a=new THREE.Vector3(),b=new THREE.Vector3(),direction=new THREE.Vector3(),unit=new THREE.Vector3(),tangent=new THREE.Vector3(),bitangent=new THREE.Vector3();
  const entries=[];for(let i=0;i<branches;i++){const parent=id==='shock'&&i%2?entries[i-1]:null;entries.push({parent,point:parent?parent.point:profile.points[Math.floor(i/branches*160)],phase:random()*40,length:.25+random()*.45,angle:random()*6.28});}
  const sample=(entry,t,time,out)=>{
    const {point,phase,length,parent}=entry;const radius=profile.scale*(id==='shock'?.075:.22)*Math.sin(t*Math.PI);
    if(parent)sample(parent,.5,time,out);else out.copy(point.position);
    tangent.set(0,0,1);if(Math.abs(point.normal.z)>.85)tangent.set(1,0,0);tangent.cross(point.normal).normalize();bitangent.crossVectors(point.normal,tangent).normalize();
    if(id==='shock'){
      const tick=Math.floor(time*11),jitter=Math.sin((t*steps+phase)*127.1+tick*311.7);
      out.addScaledVector(point.normal,t*profile.scale*length*(parent?.48:1)).addScaledVector(tangent,radius*jitter+(parent?t*profile.scale*.22:0)).addScaledVector(bitangent,radius*Math.sin((t*steps+phase)*71.7+tick*43.2));
    }else{
      const theta=t*7.8-time*2.1+phase,fade=Math.sin(t*Math.PI);
      out.addScaledVector(point.normal,fade*profile.scale*.22).addScaledVector(tangent,Math.cos(theta)*radius).addScaledVector(bitangent,Math.sin(theta)*radius);out.z+=(t-.5)*profile.scale*.62*fade;
    }
    return out;
  };
  return {object,update(time){for(let i=0;i<branches;i++){const entry=entries[i];for(let j=0;j<steps;j++){sample(entry,j/steps,time,a);sample(entry,(j+1)/steps,time,b);direction.subVectors(b,a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(axis,unit.copy(direction).normalize());const thickness=profile.scale*(id==='shock'?.0075:.008)*(1-j/steps*.68)*(entry.parent?.6:1)*(level===1?.8:1);dummy.scale.set(thickness,direction.length(),thickness);dummy.updateMatrix();object.setMatrixAt(i*steps+j,dummy.matrix);}}object.instanceMatrix.needsUpdate=true;}};
}

function rings(profile,id,level) {
  const root=new THREE.Group();root.name=id==='holy'?'Solar halo and rays':'Traveling pressure rings';
  const uniforms=uniformsFor(id,level,profile.scale);
  const material=new THREE.MeshBasicMaterial({color:uniforms.uCore.value.clone().multiplyScalar(1.8),transparent:true,opacity:.72,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});material.userData={spellBloom:true,enchantmentOwned:true};
  const radius=profile.scale*(id==='holy'?.3:.24),ringGeometry=new THREE.TorusGeometry(radius,profile.scale*.006,5,72);
  const objects=[];
  for(let i=0;i<(id==='holy'?2:3);i++){const mesh=new THREE.Mesh(ringGeometry,material);mesh.rotation.x=Math.PI/2;root.add(mesh);objects.push(mesh);}
  root.position.copy(id==='holy'?profile.tip:profile.center);if(id==='holy')root.position.z+=profile.scale*.12;
  if(id==='holy'){
    const rayGeometry=new THREE.ConeGeometry(profile.scale*.015,profile.scale*.15,3);const rays=new THREE.InstancedMesh(rayGeometry,material,12),dummy=new THREE.Object3D(),axis=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2;direction.set(Math.sin(a),0,Math.cos(a));dummy.position.copy(direction).multiplyScalar(radius*1.32);dummy.quaternion.setFromUnitVectors(axis,direction);dummy.scale.setScalar(i%3===0?1.4:.65);dummy.updateMatrix();rays.setMatrixAt(i,dummy.matrix);}root.add(rays);
  }
  return {object:root,update(time){root.position.copy(id==='holy'?profile.tip:profile.center);if(id==='holy')root.position.z+=profile.scale*.12;objects.forEach((mesh,i)=>{if(id==='holy'){mesh.rotation.z=time*(i?-.12:.16);mesh.scale.setScalar(i===0?1:.82);mesh.position.y=i*.015;}else{const t=(time*.65+i/3)%1;mesh.scale.setScalar(.45+t*1.7);mesh.position.z=(t-.5)*profile.scale*.9;mesh.rotation.y=.24*Math.sin(time+i);}});material.opacity=(id==='holy'?.45+Math.sin(time*1.3)*.08:.22)*(.5+level*.3);}};
}

export function createStructures(profile,id,level,seed) {
  const parts=[];
  if(['frost','force'].includes(id))parts.push(crystals(profile,id,level,seed));
  if(['shock','vampiric'].includes(id))parts.push(filaments(profile,id,level,seed));
  if(['force','holy'].includes(id))parts.push(rings(profile,id,level));
  return parts;
}
