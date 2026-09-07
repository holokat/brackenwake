import * as THREE from 'three';

/** Analytic point sprites. No texture fetch, frame history, allocation or particle churn. */
export function createParticles({count=96,color='#ffffff',mode=0,radius=2,duration=4,size=34,seed=1}){
 const positions=new Float32Array(count*3),seeds=new Float32Array(count*4);
 let s=seed;const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 for(let i=0;i<count;i++){seeds.set([rand(),rand(),rand(),rand()],i*4);positions.set([(rand()-.5)*radius,rand()*radius,(rand()-.5)*radius],i*3);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('seed',new THREE.BufferAttribute(seeds,4));
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:[1,2,3,4,7].includes(mode)?THREE.NormalBlending:THREE.AdditiveBlending,
 uniforms:{time:{value:0},tint:{value:new THREE.Color(color)},radius:{value:radius},duration:{value:duration},pointSize:{value:size},mode:{value:mode},intensity:{value:1}},
 vertexShader:`attribute vec4 seed;uniform float time,radius,duration,pointSize;uniform int mode;varying float alpha;varying float shade;
 void main(){float p=fract(time/duration+seed.x),a=seed.y*6.2831853;float r=radius*sqrt(seed.z);vec3 v=vec3(cos(a)*r,0.,sin(a)*r);alpha=sin(p*3.14159265);shade=.7+seed.w*.3;
 if(mode==0){v.y=.2+seed.w*radius*.6+sin(time*.7+a)*.16;v.x+=sin(time*.31+a)*.28;v.z+=cos(time*.4+a)*.3;alpha=.25+.75*pow(.5+.5*sin(time*2.+a*3.),3.);}
 if(mode==1){v=vec3((seed.y-.5)*.2+p*p*radius*.35,p*radius*1.5,(seed.z-.5)*(.2+p*radius));alpha*=.28;}
 if(mode==2){v=vec3((seed.y-.5)*radius*2.+sin(time*.15+a)*.6,.08+seed.w*.35,(seed.z-.5)*radius*1.5);alpha=.24;}
 if(mode==3){v.y=(1.-p)*radius*1.4;v.x+=p*radius*.5;alpha=.3;}
 if(mode==4){v.y=(1.-p)*radius;v.x+=sin(time+seed.w*10.)*.45;alpha*=.9;}
 if(mode==5){float b=a+time*1.6;v=vec3(cos(b)*r*(1.-p),p*radius*1.7,sin(b)*r*(1.-p));}
 if(mode==6){float t=mod(time,duration)/duration;v=vec3(cos(a)*r*t*1.8,seed.w*radius*sin(t*3.14159)*.8,sin(a)*r*t*1.8);alpha=pow(1.-t,1.4);}
 if(mode==7){v.y=.12+sin(p*3.14159)*.28;alpha*=.2;}
 if(mode==8){v=vec3(cos(a)*r*p,p*radius*(1.5-p*1.7)+.1,sin(a)*r*p);alpha*=.75;}
 vec4 mv=modelViewMatrix*vec4(v,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(pointSize*(.4+seed.w*.6)*(18./max(-mv.z,1.)),1.,160.);}`,
 fragmentShader:`uniform vec3 tint;uniform float intensity;uniform int mode;varying float alpha,shade;void main(){vec2 p=gl_PointCoord*2.-1.;float d=dot(p,p);float mask=pow(max(0.,1.-d),2.);if(mode==3){mask=max(0.,1.-abs(p.x)*7.)*max(0.,1.-abs(p.y));}if(mode==4){mask=step(abs(p.x)*.7+abs(p.y),.7);}if(mask<.01)discard;gl_FragColor=vec4(tint*shade,mask*alpha*intensity);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
 const points=new THREE.Points(geometry,material);points.name='Analytic particles';points.frustumCulled=false;
 points.userData={particleCount:count,seed,mode};return {group:points,update:t=>{material.uniforms.time.value=t;},setIntensity:v=>{material.uniforms.intensity.value=v;}};
}
