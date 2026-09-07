import * as THREE from 'three';
import {effectMaterial,uniformsFor,noiseGLSL,radianceGLSL} from './materials.js';
import {randomSource} from './surface-profile.js';

/** Fixed-size GPU billboard field. Seeds encode life, size and trajectory. */
export function createEmitters(profile,id,level,seed) {
  const count=id==='keen'?18:id==='frost'?20+level*10:id==='shock'?12+level*6:level===1?56:level===2?96:144;
  const base=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();
  geometry.index=base.index.clone();for(const key of ['position','uv'])geometry.setAttribute(key,base.attributes[key].clone());base.dispose();
  const origins=new Float32Array(count*3),normals=new Float32Array(count*3),seeds=new Float32Array(count*4),random=randomSource(seed);
  for(let i=0;i<count;i++){const point=profile.points[Math.floor(i/count*profile.points.length)];point.position.toArray(origins,i*3);point.normal.toArray(normals,i*3);seeds.set([random(),random(),random(),random()],i*4);}
  geometry.setAttribute('aOrigin',new THREE.InstancedBufferAttribute(origins,3));geometry.setAttribute('aNormal',new THREE.InstancedBufferAttribute(normals,3));geometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds,4));geometry.instanceCount=count;
  const uniforms=uniformsFor(id,level,profile.scale);
  const material=effectMaterial(id,{uniforms,blending:['flame','venom','vampiric'].includes(id)?THREE.NormalBlending:THREE.AdditiveBlending,vertexShader:`
    attribute vec3 aOrigin,aNormal;attribute vec4 aSeed;uniform float uTime,uScale,uStrength,uFamily;varying vec2 vUv;varying float vLife,vSeed,vKind;${noiseGLSL}
    void main(){vUv=uv;float speed=.45+aSeed.z*.6;float life=fract(uTime*speed+aSeed.x);vLife=life;vSeed=aSeed.y;vKind=aSeed.w;
    vec4 world=modelMatrix*vec4(aOrigin+aNormal*.01,1.);vec3 normal=normalize(mat3(modelMatrix)*aNormal);float worldScale=length(modelMatrix[0].xyz)*uScale;float size=(.06+aSeed.z*.12)*worldScale;vec2 stretch=vec2(1.);
    if(uFamily<.5){world.xyz+=normal*life*.13*worldScale;world.z+=life*(.28+aSeed.y*.57)*worldScale;world.x+=sin(life*8.+aSeed.y*32.)*.10*worldScale*life;size*=1.65*(1.-life*.55);stretch=vec2(.92,2.7);if(aSeed.w>.72){size*=.095;stretch=vec2(.8,1.8);}}
    else if(uFamily<1.5){world.xyz+=normal*life*.19*worldScale;world.z-=life*.18*worldScale;world.x+=sin(aSeed.y*33.+life*4.)*.08*worldScale;size*=2.65;}
    else if(uFamily<2.5){world.xyz+=normal*.045*worldScale;size*=.32+.4*pow(sin(uTime*18.+aSeed.y*52.),8.);}
    else if(uFamily<3.5){world.xyz+=normal*life*.12*worldScale;world.z-=life*life*.85*worldScale;size*=.35;stretch=vec2(.7,1.6+life*2.);}
    else if(uFamily<4.5){float a=uTime*1.4+aSeed.y*6.283;world.xyz+=vec3(cos(a),sin(a),sin(a*.7))*(1.-life)*.32*worldScale;size*=.68;stretch=vec2(.55,2.8);}
    else if(uFamily<5.5){world.xyz+=normal*.016*worldScale;size*=2.5;vLife=fract(uTime*.38+aSeed.x);}
    else if(uFamily<6.5){world.xyz+=normal*life*.26*worldScale;world.z+=sin(life*3.1416)*.18*worldScale;size*=.2;stretch=vec2(1.,2.);}
    else{world.z+=life*.72*worldScale;world.xyz+=normal*.025*worldScale;size*=aSeed.w>.8?2.:.22;stretch=vec2(1.,1.8);}
    vec4 mv=viewMatrix*world;mv.xy+=position.xy*size*stretch*(.75+uStrength*.25);gl_Position=projectionMatrix*mv;}
  `,fragmentShader:`
    uniform float uTime,uFamily,uStrength;uniform vec3 uColor,uCore;varying vec2 vUv;varying float vLife,vSeed,vKind;${noiseGLSL}${radianceGLSL}
    void main(){vec2 p=vUv*2.-1.;float a=0.;float heat=.4;float fade=sin(vLife*3.14159265);
    if(uFamily<.5){float n=fbm(vec3(vUv*vec2(4.5,5.5)-vec2(0.,uTime*2.1),vSeed*11.));float taper=pow(1.-vUv.y,.72);float bend=sin(vUv.y*6.-uTime*4.2+vSeed*24.)*.31*vUv.y+(n-.5)*.32;float distance=abs(p.x+bend)/max(.05,taper*.73);float body=1.-smoothstep(.16,.95,distance);float erosion=smoothstep(.23,.6,n+(1.-vUv.y)*.18);a=body*erosion*smoothstep(0.,.13,vUv.y)*(1.-smoothstep(.69,1.,vUv.y));heat=body*pow(1.-vUv.y,2.)*.7;if(vKind>.72){a=pow(max(0.,1.-dot(p,p)),3.);heat=.82;}}
    else if(uFamily<1.5){float n=fbm(vec3(p*3.,uTime*.32+vSeed*19.));a=pow(max(0.,1.-dot(p,p)),3.)*n*.10;heat=.18;}
    else if(uFamily<2.5){a=pow(max(0.,1.-abs(p.x)),18.)*pow(max(0.,1.-abs(p.y)),2.)+pow(max(0.,1.-abs(p.y)),18.)*pow(max(0.,1.-abs(p.x)),2.);heat=.9;}
    else if(uFamily<3.5){p.x*=1.2+.5*p.y;a=(1.-smoothstep(.7,1.,dot(p,p)));heat=pow(max(0.,1.-length(p-vec2(-.24,.24))*2.),3.);}
    else if(uFamily<4.5){p.x+=sin(p.y*3.+uTime*3.+vSeed*25.)*.3;a=pow(max(0.,1.-abs(p.x)*2.),4.)*pow(max(0.,1.-p.y*p.y),2.);heat=.12;}
    else if(uFamily<5.5){float cross=pow(max(0.,1.-abs(p.x)),28.)*pow(max(0.,1.-abs(p.y)),1.5)+pow(max(0.,1.-abs(p.y)),28.)*pow(max(0.,1.-abs(p.x)),1.5);a=cross*pow(max(0.,sin(vLife*3.14159265)),18.);heat=1.;fade=1.;}
    else if(uFamily<6.5){a=pow(max(0.,1.-dot(p,p)),4.);heat=.8;}
    else{a=pow(max(0.,1.-abs(p.x)),18.)*pow(max(0.,1.-abs(p.y)),2.)+pow(max(0.,1.-abs(p.y)),18.)*pow(max(0.,1.-abs(p.x)),2.);heat=.85;}
    float edgeMask=(1.-smoothstep(.72,1.,abs(p.x)))*(1.-smoothstep(.78,1.,abs(p.y)));a*=edgeMask;if(a<.002)discard;gl_FragColor=vec4(elementRadiance(uFamily,uColor,uCore,heat),min(.88,a*fade*uStrength));}
  `});
  const object=new THREE.Mesh(geometry,material);object.frustumCulled=false;object.name=id==='flame'?'Noise-sculpted flame tongues and embers':`${id} surface emitters`;object.renderOrder=5;
  return {object,update(time,surfaceChanged=false){uniforms.uTime.value=time;if(surfaceChanged){for(let i=0;i<count;i++){const point=profile.points[Math.floor(i/count*profile.points.length)];point.position.toArray(origins,i*3);point.normal.toArray(normals,i*3);}geometry.attributes.aOrigin.needsUpdate=true;geometry.attributes.aNormal.needsUpdate=true;}}};
}
