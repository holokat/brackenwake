import * as THREE from 'three';
import {seeded,noiseGLSL,meshPart} from './resources.js';

/** Fully analytic instanced motes, with no spawning history or per-frame randomness. */
export function motes(resources,color,{count=96,radius=.8,height=2.6,mode=0,seed=12,size=.023}={}){
  const plane=resources.geometry('mote-plane',()=>new THREE.PlaneGeometry(1,1)),geometry=resources.ownGeometry(new THREE.InstancedBufferGeometry());geometry.index=plane.index.clone();geometry.setAttribute('position',plane.attributes.position.clone());geometry.setAttribute('uv',plane.attributes.uv.clone());
  const random=seeded(seed),seeds=new Float32Array(count*4);for(let i=0;i<count;i++)seeds.set([random(),random(),random(),random()],i*4);geometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds,4));geometry.instanceCount=count;
  const material=resources.shader(color,`uniform vec3 uColor;uniform float uOpacity,uMode,uTime;varying vec2 vUv;varying float vFade,vSeed;${noiseGLSL}
    void main(){vec2 p=vUv*2.-1.;float star=pow(max(0.,1.-abs(p.x)),18.)*pow(max(0.,1.-abs(p.y)),2.)+pow(max(0.,1.-abs(p.y)),18.)*pow(max(0.,1.-abs(p.x)),2.);float dotShape=pow(max(0.,1.-dot(p,p)),3.);float alpha=mix(dotShape,star,step(.68,vSeed));alpha+=exp(-dot(p,p)*5.)*.055*(1.-smoothstep(.65,1.,length(p)));if(uMode>1.5&&uMode<2.5){float n=fbm(vec3(vUv*5.-vec2(0.,uTime*1.6),vSeed*29.));float bend=sin(p.y*3.-uTime*3.+vSeed*9.)*.22;alpha=pow(max(0.,1.-abs(p.x+bend)*1.5),2.)*(1.-smoothstep(.65,1.,abs(p.y)))*smoothstep(.2,.55,n);}gl_FragColor=vec4(uColor*(vSeed>.82?2.35:1.65),min(.92,alpha*vFade*uOpacity));}`,
    {blending:mode===2?THREE.NormalBlending:THREE.AdditiveBlending,uniforms:{uRadius:{value:radius},uHeight:{value:height},uMode:{value:mode},uSize:{value:size},uAge:{value:0}},vertexShader:`attribute vec4 aSeed;uniform float uTime,uRadius,uHeight,uMode,uSize,uAge;varying vec2 vUv;varying float vFade,vSeed;
      void main(){vUv=uv;vSeed=aSeed.w;float life=fract(aSeed.x+uTime*(.14+aSeed.y*.16));float angle=aSeed.y*6.28318+uTime*(.22+aSeed.z*.22),r=uRadius*(.3+aSeed.z*.7);vec3 origin=vec3(cos(angle)*r,life*uHeight,sin(angle)*r);float size=uSize*(1.1+aSeed.w*1.3);vec2 stretch=vec2(1.);vFade=sin(life*3.14159)*(.72+.28*sin(uTime*2.+aSeed.z*29.));
      if(uMode>.5&&uMode<1.5){origin.y=aSeed.x*uHeight;origin.x*=1.+life*.5;origin.z*=1.+life*.5;vFade=pow(sin(life*3.14159),2.);}
      else if(uMode>1.5&&uMode<2.5){origin=vec3(cos(angle)*uRadius*aSeed.z,aSeed.x*uHeight,sin(angle)*uRadius*aSeed.z);origin.x+=sin(life*5.+aSeed.y*21.)*.035;origin.y+=life*.09;size*=2.6;stretch=vec2(.85,3.1);vFade=sin(life*3.14159);}
      else if(uMode>2.5&&uMode<3.5){origin=vec3(cos(angle)*r,sin(angle*.7)*r,sin(angle)*r);origin*=.25+life*.9;vFade=sin(life*3.14159);}
      else if(uMode>3.5){float age=max(0.,uAge),speed=.6+aSeed.z*1.7;origin=vec3(cos(angle)*speed*age,age*(1.4+aSeed.w*1.8)-age*age*2.1,sin(angle)*speed*age);origin.y=max(.02,origin.y);vFade=(1.-smoothstep(.5,1.4,age))*smoothstep(0.,.035,age);stretch=vec2(.6,3.2);}
      vec4 centerView=modelViewMatrix*vec4(origin,1.);centerView.xy+=position.xy*stretch*size*length(modelMatrix[0].xyz);gl_Position=projectionMatrix*centerView;}`});
  const root=new THREE.Mesh(geometry,material);root.name=mode===2?'Blade-bound firelight tongues':'Ascending healing sparks';return meshPart(root,material);
}
