import * as THREE from 'three';
import {effectMaterial,uniformsFor,noiseGLSL,radianceGLSL} from './materials.js';

/** A bounded world-space ribbon stores real weapon motion, never a canned arc. */
export function createMotionTrail(profile,id,level) {
  const capacity=36,positions=new Float32Array(capacity*2*3),uvs=new Float32Array(capacity*2*2),coverage=new Float32Array(capacity*2),indices=[];
  for(let i=0;i<capacity;i++){uvs.set([i/(capacity-1),0,i/(capacity-1),1],i*4);if(i<capacity-1){const p=i*2;indices.push(p,p+1,p+2,p+1,p+3,p+2);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setAttribute('aHistory',new THREE.BufferAttribute(coverage,1).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);geometry.setDrawRange(0,0);
  const uniforms=uniformsFor(id,level,profile.scale);
  const material=effectMaterial(id,{uniforms,vertexShader:`attribute float aHistory;varying float vHistory;varying vec2 vUv;void main(){vUv=uv;vHistory=aHistory;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uTime,uFamily,uStrength;uniform vec3 uColor,uCore;varying float vHistory;varying vec2 vUv;${noiseGLSL}${radianceGLSL}
    void main(){float edge=pow(max(0.,sin(vUv.y*3.14159)),1.6),age=pow(1.-vUv.x,1.8),n=fbm(vec3(vUv*vec2(18.,7.),uTime*2.));float tail=1.-smoothstep(.38,1.,vHistory);float head=smoothstep(0.,.055,vHistory);float a=edge*age*tail*head*.3;
    if(uFamily<.5)a*=smoothstep(.22,.66,n)*1.7;
    else if(uFamily<1.5)a*=.3+n*.7;
    else if(uFamily<2.5)a*=pow(max(0.,sin(vUv.y*50.+n*15.)),10.)*1.8;
    else if(uFamily<3.5)a*=smoothstep(.37,.6,n);
    else if(uFamily<4.5)a*=pow(max(0.,sin(vUv.y*26.+n*8.)),6.)*1.2;
    else if(uFamily<5.5)a*=pow(vUv.y,12.)*2.;
    else if(uFamily<6.5)a*=pow(max(0.,sin(vUv.y*35.)),8.);
    else a*=.45+pow(max(0.,sin(vUv.y*28.)),8.);
    gl_FragColor=vec4(elementRadiance(uFamily,uColor,uCore,pow(vUv.y,6.)*.4),a*uStrength);}`});
  const object=new THREE.Mesh(geometry,material);object.frustumCulled=false;object.name='World-space weapon motion trail';object.renderOrder=4;
  const near=profile.points.reduce((best,entry)=>entry.position.lengthSq()<best.lengthSq()?entry.position:best,profile.tip);
  // Broad heads leave a fan across their cutting face, long blades leave their blade span.
  const inner=near.distanceTo(profile.tip)<profile.scale*.15?profile.center:near;
  const history=Array.from({length:capacity},()=>({outer:new THREE.Vector3(),inner:new THREE.Vector3(),time:0}));
  const tip=new THREE.Vector3(),base=new THREE.Vector3(),local=new THREE.Vector3();let count=0,lastSample=-Infinity;
  function reset(){count=0;lastSample=-Infinity;positions.fill(0);geometry.setDrawRange(0,0);geometry.attributes.position.needsUpdate=true;object.visible=false;}
  return {object,reset,update(time,matrix,sceneInverse){uniforms.uTime.value=time;tip.copy(profile.tip).applyMatrix4(matrix);base.copy(inner).applyMatrix4(matrix);
    while(count>0&&time-history[count-1].time>.34)count--;
    if(time-lastSample>=1/120&&(count===0||tip.distanceToSquared(history[0].outer)>1e-7||base.distanceToSquared(history[0].inner)>1e-7)){
      for(let i=Math.min(count,capacity-1);i>0;i--){history[i].outer.copy(history[i-1].outer);history[i].inner.copy(history[i-1].inner);history[i].time=history[i-1].time;}
      history[0].outer.copy(tip);history[0].inner.copy(base);history[0].time=time;count=Math.min(capacity,count+1);lastSample=time;
    }
    for(let i=0;i<count;i++){local.copy(history[i].inner).applyMatrix4(sceneInverse).toArray(positions,i*6);local.copy(history[i].outer).applyMatrix4(sceneInverse).toArray(positions,i*6+3);const age=Math.min(1,(time-history[i].time)/.34);uvs[i*4]=uvs[i*4+2]=age;coverage[i*2]=coverage[i*2+1]=count>1?i/(count-1):0;}
    geometry.setDrawRange(0,Math.max(0,count-1)*6);geometry.attributes.position.needsUpdate=true;geometry.attributes.uv.needsUpdate=true;geometry.attributes.aHistory.needsUpdate=true;object.visible=count>1;
  }};
}
