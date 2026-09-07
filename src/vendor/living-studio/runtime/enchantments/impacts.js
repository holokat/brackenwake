import * as THREE from 'three';
import {effectMaterial,uniformsFor,noiseGLSL,radianceGLSL} from './materials.js';
import {randomSource} from './surface-profile.js';

const durations={flame:1.25,frost:1.55,shock:.68,venom:1.5,vampiric:1.4,keen:.72,force:1.25,holy:1.7};

function burstGeometry(id,count,seed){
  const base=id==='frost'?new THREE.OctahedronGeometry(1,0):id==='force'?new THREE.IcosahedronGeometry(1,0):id==='venom'?new THREE.SphereGeometry(1,6,4):new THREE.PlaneGeometry(1,1);
  const geometry=new THREE.InstancedBufferGeometry();if(base.index)geometry.setIndex(base.index.clone());for(const key of ['position','normal','uv'])if(base.attributes[key])geometry.setAttribute(key,base.attributes[key].clone());base.dispose();
  const random=randomSource(seed),data=new Float32Array(count*4);for(let i=0;i<count;i++)data.set([random(),random(),random(),random()],i*4);
  geometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(data,4));geometry.instanceCount=count;return geometry;
}

function burstMaterial(id,level,scale){
  const uniforms={...uniformsFor(id,level,scale),uAge:{value:0},uDuration:{value:durations[id]}};
  return effectMaterial(id,{uniforms,blending:['force','frost','venom','vampiric'].includes(id)?THREE.NormalBlending:THREE.AdditiveBlending,vertexShader:`
    attribute vec4 aSeed;uniform float uAge,uDuration,uFamily,uStrength;varying vec2 vUv;varying float vFade,vFace;${noiseGLSL}
    void main(){float life=clamp(uAge/uDuration,0.,1.),a=aSeed.x*6.283185,r=(.25+aSeed.y*.9),speed=1.5+aSeed.z*1.5;float t=uAge;vec3 direction=normalize(vec3(cos(a),sin(a),.2+aSeed.w*1.6));vec3 center=direction*r*t*speed;float size=(.018+aSeed.z*.035)*(1.-life*.5);vec3 p=position;vUv=uv;vFade=pow(1.-life,1.5);vFace=.5+.5*abs(normal.z);
    if(uFamily<.5){center.z+=t*.55;size*=1.1;}
    else if(uFamily<1.5){center.z-=t*t*.8;size*=1.4;p.z*=3.6;vec3 right=normalize(cross(direction,vec3(0.,0.,1.))),up=cross(right,direction);p=right*p.x+up*p.y+direction*p.z;}
    else if(uFamily<2.5){center=direction*r*(.3+life*.9);size*=7.;vFade*=.55+.45*step(.4,fract(uAge*34.+aSeed.y));}
    else if(uFamily<3.5){center.z-=t*t*2.2;size*=1.15;p.z*=1.5;}
    else if(uFamily<4.5){float turn=a+t*3.;center=vec3(cos(turn),sin(turn),sin(turn*.6))*(1.-life)*r*1.4;center.z+=life*.22;size*=3.;p.x*=.4;p.y*=2.2;}
    else if(uFamily<5.5){center=direction*life*r*1.7;size*=5.;}
    else if(uFamily<6.5){center.z-=t*t*2.;size*=2.4;}
    else{center=vec3(cos(a)*r*.85,sin(a)*r*.85,life*(1.+aSeed.z*2.));size*=3.;}
    vec4 mv=modelViewMatrix*vec4(center,1.);if((uFamily>0.5&&uFamily<1.5)||(uFamily>2.5&&uFamily<3.5)||(uFamily>5.5&&uFamily<6.5)){float angle=a+t*(aSeed.y-.5)*5.;p.xy=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.xy;mv+=modelViewMatrix*vec4(p*size,0.);}else{float scale=length(modelMatrix[0].xyz);mv.xy+=p.xy*size*scale;}gl_Position=projectionMatrix*mv;}
  `,fragmentShader:`uniform float uFamily;uniform vec3 uColor,uCore;varying vec2 vUv;varying float vFade,vFace;${radianceGLSL}
    void main(){vec2 p=vUv*2.-1.;float a=1.;if((uFamily<.5)||(uFamily>1.5&&uFamily<2.5)||(uFamily>3.5&&uFamily<5.5)||uFamily>6.5){a=pow(max(0.,1.-abs(p.x)),20.)*pow(max(0.,1.-abs(p.y)),2.)+pow(max(0.,1.-abs(p.y)),20.)*pow(max(0.,1.-abs(p.x)),2.);}if(uFamily>3.5&&uFamily<4.5)a=pow(max(0.,1.-abs(p.x)),3.)*pow(max(0.,1.-p.y*p.y),2.);if(uFamily>5.5&&uFamily<6.5)gl_FragColor=vec4(vec3(.07,.047,.029)+uColor*vFace*.26,vFade);else gl_FragColor=vec4(elementRadiance(uFamily,uColor,uCore,vFace*.5),a*vFade);}
  `});
}

function impactDisk(id,level,scale){
  const uniforms={...uniformsFor(id,level,scale),uAge:{value:0},uDuration:{value:durations[id]}};
  return effectMaterial(id,{uniforms,vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
    uniform float uAge,uDuration,uFamily,uStrength;uniform vec3 uColor,uCore;varying vec2 vUv;${noiseGLSL}${radianceGLSL}
    void main(){vec2 p=vUv*2.-1.;float r=length(p),angle=atan(p.y,p.x),t=clamp(uAge/uDuration,0.,1.);float radius=.07+sqrt(t)*.84;float ring=exp(-pow((r-radius)*65.,2.)),inner=exp(-r*r/(.015+t*.07));float fade=pow(1.-t,1.5),n=fbm(vec3(p*9.,uAge*4.));float a=0.;
    if(uFamily<.5)a=ring*(.3+n)*.8+inner*1.5+smoothstep(.65,.8,n)*(1.-smoothstep(0.,radius,r))*.25;
    else if(uFamily<1.5){float cracks=pow(max(0.,sin(angle*9.+n*2.)),32.);a=ring*.65+cracks*(1.-smoothstep(0.,radius,r))*.8+inner*.7;}
    else if(uFamily<2.5){float bolts=pow(max(0.,sin(angle*13.+n*6.)),32.);a=bolts*(1.-smoothstep(.05,.96,r))*1.3+inner*2.;}
    else if(uFamily<3.5){float edge=radius*(.82+n*.3);a=(1.-smoothstep(edge-.045,edge,r))*(.12+smoothstep(.57,.63,n)*.32)+exp(-pow((r-edge)*45.,2.))*.5;}
    else if(uFamily<4.5){float spiral=pow(max(0.,sin(angle*4.+r*23.-uAge*7.)),14.);a=spiral*(1.-smoothstep(0.,.85,r))*.8+inner;}
    else if(uFamily<5.5){a=pow(max(0.,1.-abs(p.x)),80.)*pow(1.-abs(p.y),1.2)+pow(max(0.,1.-abs(p.y)),80.)*pow(1.-abs(p.x),1.2)+inner;}
    else if(uFamily<6.5){a=ring+exp(-pow((r-radius*.72)*85.,2.))*.4+pow(max(0.,sin(angle*11.+n)),40.)*(1.-smoothstep(0.,radius,r))*.4;}
    else{a=ring*.8+exp(-pow((r-radius*.8)*75.,2.))*.6+pow(max(0.,sin(angle*12.)),35.)*(1.-smoothstep(radius-.14,radius+.1,r))*.75+inner;}
    if(r>.99)discard;gl_FragColor=vec4(elementRadiance(uFamily,uColor,uCore,inner*.35),a*fade*uStrength*.82);}
  `});
}

/** Four reusable analytic bursts cap simultaneous impacts and GPU allocations. */
export function createImpacts(id,level,scale,seed){
  const object=new THREE.Group();object.name='Pooled enchantment impacts';
  const density=['frost','venom'].includes(id)?.65:1;
  const geometry=burstGeometry(id,Math.round((level===1?36:level===2?64:96)*density),seed),diskGeometry=new THREE.PlaneGeometry(3.5,3.5);
  const slots=Array.from({length:4},()=>{
    const group=new THREE.Group();group.matrixAutoUpdate=false;group.visible=false;const particles=burstMaterial(id,level,scale),disk=impactDisk(id,level,scale);
    const cloud=new THREE.Mesh(geometry,particles);cloud.frustumCulled=false;group.add(cloud);
    const plane=new THREE.Mesh(diskGeometry,disk);plane.position.z=.008;group.add(plane);
    if(['shock','keen','holy'].includes(id)){const cross=new THREE.Mesh(diskGeometry,disk);cross.rotation.x=Math.PI/2;group.add(cross);}
    if(id==='holy'){
      const material=effectMaterial(id,{uniforms:disk.uniforms,vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uAge,uDuration;uniform vec3 uCore;varying vec2 vUv;void main(){float t=uAge/uDuration;float edge=pow(max(0.,1.-abs(vUv.x*2.-1.)),3.);float bands=.5+.5*pow(sin(vUv.x*70.),10.);gl_FragColor=vec4(uCore*2.,edge*bands*pow(1.-vUv.y,1.5)*sin(t*3.14159)*.55);}`});
      const pillar=new THREE.Mesh(new THREE.PlaneGeometry(.7,3.2),material);pillar.rotation.x=Math.PI/2;pillar.position.z=1.6;group.add(pillar);
      const second=pillar.clone();second.rotation.y=Math.PI/2;group.add(second);
    }
    object.add(group);return {group,particles,disk,position:new THREE.Vector3(),start:-Infinity,scale:1};
  });
  let cursor=0;const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),size=new THREE.Vector3();
  return {object,trigger(position,time,worldScale=1){if(!Number.isFinite(time)||![position.x,position.y,position.z].every(Number.isFinite))return;const slot=slots[cursor++%slots.length];slot.start=time;slot.position.copy(position);slot.scale=scale*worldScale*(.72+level*.16);return {position:position.clone(),strength:(id==='force'?1:.6)*level/3,radius:slot.scale*1.8};},reset(){for(const slot of slots){slot.start=-Infinity;slot.group.visible=false;}cursor=0;},update(time,sceneInverse){for(const slot of slots){const age=time-slot.start;slot.group.visible=age>=0&&age<durations[id];if(!slot.group.visible)continue;slot.particles.uniforms.uAge.value=age;slot.disk.uniforms.uAge.value=age;size.setScalar(slot.scale);matrix.compose(slot.position,rotation,size);slot.group.matrix.multiplyMatrices(sceneInverse,matrix);slot.group.matrixWorldNeedsUpdate=true;}}};
}
