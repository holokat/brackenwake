import * as THREE from 'three';
import {finishActor,pulse,ease} from './shared.js';
import {rigMotions} from './motions.js';

export function createWisp(entry){
 const group=new THREE.Group(),core=new THREE.Group();core.name='Wisp core motion';group.add(core);
 const inner=new THREE.Mesh(new THREE.IcosahedronGeometry(.065,2),new THREE.MeshStandardMaterial({name:'Wisp luminous core',color:'#b8ecd1',emissive:'#72dcae',emissiveIntensity:2.5,roughness:.3,flatShading:true}));inner.name='Wisp luminous core';core.add(inner);
 const halos=[];
 for(let i=0;i<3;i++){
  const halo=new THREE.Mesh(new THREE.IcosahedronGeometry(.092+i*.045,2),new THREE.MeshBasicMaterial({name:'Wisp halo',color:i===0?'#85dbb4':'#62b997',transparent:true,opacity:.18/(i+1),depthWrite:false,blending:THREE.AdditiveBlending}));halo.name='Wisp halo '+i;core.add(halo);halos.push(halo);
 }
 const trail=[];
 for(let i=0;i<10;i++){
  const mote=new THREE.Mesh(new THREE.IcosahedronGeometry(.019*(1-i*.055),1),new THREE.MeshBasicMaterial({name:'Wisp trailing mote',color:'#80d3ac',transparent:true,opacity:.65*(1-i*.06),blending:THREE.AdditiveBlending,depthWrite:false}));mote.name='Wisp trail '+i;group.add(mote);trail.push(mote);
 }
 const clips=[];
 for(const[name,duration]of rigMotions.wisp){
  const times=[],positions=[],scales=[],trailPositions=trail.map(()=>[]),trailScales=trail.map(()=>[]);
  for(let i=0;i<=48;i++){
   const t=i/48,phase=t*Math.PI*2,a=pulse(t),flare=name==='cast'?1+.8*pulse(t,.2,.65):1,fade=name==='die'?1-ease(t):1;
   const fly=['takeOff','fly','land'].includes(name),height=name==='takeOff'?.35+.44*ease(t):name==='land'?.79-.44*ease(t):.74;
   const x=Math.sin(phase)*.075,y=height+Math.sin(phase*2)*.045,z=Math.cos(phase)*.05;
   times.push(t*duration);positions.push(x,y,z);const size=Math.max(.001,fade*flare*(name==='hurt'?1-.5*a:1));scales.push(size,size,size);
   for(let k=0;k<trail.length;k++){
    const q=phase-k*.30;trailPositions[k].push(Math.sin(q)*(.075+k*.005),y-.035-k*.025+Math.sin(q*1.3)*.013,Math.cos(q)*.05-k*.006);
    const ss=Math.max(.001,fade*(1+k*.015)*(name==='cast'?1+.4*a:1));trailScales[k].push(ss,ss,ss);
   }
  }
  const tracks=[new THREE.VectorKeyframeTrack(core.name+'.position',times,positions),new THREE.VectorKeyframeTrack(core.name+'.scale',times,scales)];
  for(let k=0;k<trail.length;k++){tracks.push(new THREE.VectorKeyframeTrack(trail[k].name+'.position',times,trailPositions[k]),new THREE.VectorKeyframeTrack(trail[k].name+'.scale',times,trailScales[k]));}
  clips.push(new THREE.AnimationClip(name,duration,tracks));
 }
 group.userData.features=['Luminous core','Layered halo','Ten trailing motes'];group.userData.skeletonFree=true;
 return finishActor(group,null,clips,entry);
}
