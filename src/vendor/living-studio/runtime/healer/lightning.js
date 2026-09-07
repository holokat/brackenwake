import * as THREE from 'three';
import {seeded} from './resources.js';

/** Forked rods have real volume and reconnect deterministically on every strike. */
export function heavenlyBolt(resources,color){
  const branches=7,steps=14,geometry=resources.geometry('lightning-segment',()=>new THREE.CylinderGeometry(1,1,1,5,1,true));
  const material=resources.shader(color,`uniform vec3 uColor;uniform float uOpacity;varying vec2 vUv;void main(){gl_FragColor=vec4(mix(uColor,vec3(1.),.12)*2.6,uOpacity);}`,{vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`});
  const root=new THREE.InstancedMesh(geometry,material,branches*steps);root.name='Forked heavenly smite bolt';root.frustumCulled=false;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),delta=new THREE.Vector3(),unit=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),dummy=new THREE.Object3D(),random=seeded(414),seeds=Array.from({length:branches},()=>random()*50);
  function trunk(t,time,out){const tick=Math.floor(time*12),step=t*steps,index=Math.floor(step),f=step-index,edge=Math.sin(t*Math.PI);const x1=Math.sin((index+seeds[0])*71.7+tick*31.9),x2=Math.sin((index+1+seeds[0])*71.7+tick*31.9),z1=Math.sin((index+seeds[0])*53.4+tick*72.2),z2=Math.sin((index+1+seeds[0])*53.4+tick*72.2);return out.set((x1+(x2-x1)*f)*.065*edge,t*3.12,(z1+(z2-z1)*f)*.052*edge);}
  function position(branch,t,time,out){if(branch===0)return trunk(t,time,out);const seed=seeds[branch],start=.15+(branch-1)*.13;trunk(start,time,out);const cell=t*4,index=Math.floor(cell),f=cell-index,tick=Math.floor(time*12),a=Math.sin(index*43.2+seed+tick*4.7),b=Math.sin((index+1)*43.2+seed+tick*4.7),bend=(a+(b-a)*f)*Math.sin(t*Math.PI)*.044;const spread=.2+(branch%3)*.1;out.x+=Math.cos(seed)*t*spread+bend;out.z+=Math.sin(seed)*t*spread+bend*.63;out.y+=t*(.38+(branch%2)*.13);return out;}
  return {root,material,sample(time,opacity){root.visible=opacity>.0001;material.uniforms.uOpacity.value=opacity;material.uniforms.uTime.value=time;for(let branch=0;branch<branches;branch++)for(let j=0;j<steps;j++){position(branch,j/steps,time,a);position(branch,(j+1)/steps,time,b);delta.subVectors(b,a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(up,unit.copy(delta).normalize());const r=(branch===0?.025:.0075)*(1-j/steps*.45);dummy.scale.set(r,delta.length(),r);dummy.updateMatrix();root.setMatrixAt(branch*steps+j,dummy.matrix);}root.instanceMatrix.needsUpdate=true;}};
}
