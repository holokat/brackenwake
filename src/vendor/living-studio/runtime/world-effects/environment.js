import * as THREE from 'three';
import {driftingFoliage} from './foliage.js';
import {createParticles} from './particles.js';
import {glow,ring} from './shapes.js';

/** Layered environment emitters. Every position is a pure function of time. */
export function environmentEffect(root,entry){
 const {style,color,duration,radius}=entry,updates=[];
 if(['petals','seeds','snow'].includes(style)){updates.push(driftingFoliage(root,entry));return updates;}
 const configurations={petals:[4,44,3.2],seeds:[0,60,1.5],bubbles:[5,28,3],embers:[5,60,1.6],gust:[2,26,40],spores:[5,90,1.4],drips:[3,38,2.6],snow:[4,180,1.6],flame:[1,38,16],shafts:[0,120,1],cave:[4,100,1.2],foam:[0,45,5]};
 const [mode,count,size]=configurations[style]||[0,80,2];
 if(!['creek','foam','bubbles'].includes(style)){
  const layer=createParticles({count,color,mode,radius:style==='flame'?.6:radius,duration,size,seed:entry.id.length*89});root.add(layer.group);updates.push(layer.update);
  if(style==='drips')layer.group.scale.set(.6,1,.12);
  if(style==='cave')layer.group.scale.set(.6,1,.6);
  if(style==='embers')layer.group.scale.set(.4,1.2,.4);
 }
 if(['creek','foam','bubbles','drips'].includes(style)){
  for(let i=0;i<(style==='foam'?30:style==='creek'?18:8);i++){
   const ripple=ring(root,`Surface ${style} ${i+1}`,style==='foam'?.08:.18,color,{width:style==='foam'?.018:.006,opacity:.36});
   const x=Math.sin(i*13.37)*radius*.65,z=Math.cos(i*8.11)*radius*.6;
   updates.push(t=>{const p=(t/duration+i*.137)%1;ripple.position.set(x+(style==='foam'?Math.sin(t*.2+i)*.25:0),.018,z+(style==='foam'?Math.cos(t*.2+i)*.25:0));ripple.scale.setScalar(style==='foam'?.7+.3*Math.sin(t+i):.15+p*2.5);ripple.material.opacity=style==='foam'?.2+Math.sin(t+i)*.05:Math.sin(p*Math.PI)*.35;});
   if(style==='bubbles'){
    const bubble=new THREE.Mesh(new THREE.SphereGeometry(.065,12,8),new THREE.MeshPhysicalMaterial({color,transparent:true,opacity:.27,roughness:.12,metalness:.12}));bubble.name=`Marsh bubble ${i+1}`;root.add(bubble);updates.push(t=>{const p=(t/duration+i*.137)%1;bubble.position.set(x,.025+Math.sin(p*Math.PI)*.12,z);bubble.scale.setScalar(Math.sin(p*Math.PI)*(.5+i*.08));});
   }
  }
 }
 if(['shafts','cave'].includes(style)){
  for(let i=0;i<(style==='shafts'?4:1);i++){
   const geometry=new THREE.CylinderGeometry(.08,.35,3.3,20,1,true),ray=new THREE.Mesh(geometry,glow(color,.018));ray.name=`Light shaft ${i+1}`;ray.position.set((i-1.5)*.65,1.7,(i%2)*.4);ray.rotation.z=-.22;root.add(ray);updates.push(t=>{ray.material.opacity=.018+Math.sin(t*.3+i)*.005;});
  }
 }
 if(style==='flame'){
  const flameMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{time:{value:0}},vertexShader:`varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 uv0;uniform float time;void main(){float y=uv0.y;float x=abs(uv0.x-.5+sin(y*12.-time*5.)*.07*y);float w=(1.-y)*.38;float a=smoothstep(w,w*.4,x)*smoothstep(0.,.12,y)*(1.-y);vec3 c=mix(vec3(1.,.62,.22),vec3(.75,.13,.025),y);gl_FragColor=vec4(c,a*.6);}`});
  for(let i=0;i<3;i++){const flame=new THREE.Mesh(new THREE.PlaneGeometry(.9,1.2),flameMaterial);flame.name=`Brazier flame veil ${i+1}`;flame.position.y=.55;flame.rotation.y=i*Math.PI/3;root.add(flame);}
  updates.push(t=>{flameMaterial.uniforms.time.value=t;});
  const ember=createParticles({count:24,color:'#f4b26a',mode:5,radius:.5,duration:3,size:1.2,seed:391});root.add(ember.group);updates.push(ember.update);
 }
 return updates;
}
