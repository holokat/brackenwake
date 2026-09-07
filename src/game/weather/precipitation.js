// Two bounded GPU batches around the eye. Static seeds, no per-drop objects,
// no transparent sheets over the screen and no full-scene raycasts.
import * as THREE from 'three';
import { roofHeightAt } from '../../world/weather_shelter.js';
import { authoredDeckAt } from '../../world/authored_traversal.js';

export const RAIN_COUNT=960, FLAKE_COUNT=640, WEATHER_RADIUS=24;
export const COVER_SIZE=32, COVER_SPAN=64;
const VERT=/*glsl*/`
uniform float uTime,uKind,uAmount,uFall,uSize,uLight;
uniform vec3 uEye;
uniform vec2 uWind,uCoverOrigin;
uniform sampler2D uCover;
attribute float end,edge;
varying float vAlpha,vAbove,vEdge;
void main(){
  vec3 seed=position;
  vec2 drift=uWind*uTime;
  if(uKind>0.5)drift+=vec2(sin(uTime*.7+seed.z*9.0),cos(uTime*.4+seed.x*8.0))*.8;
  vec2 xz=mod(seed.xz*48.0+drift-uEye.xz,48.0)-24.0+uEye.xz;
  float y=mod(seed.y*28.0-uTime*uFall-uEye.y,28.0)-9.0+uEye.y;
  vec3 world=vec3(xz.x,y,xz.y);
  if(uKind<0.5)world+=vec3(uWind.x*.045,-.85,uWind.y*.045)*end;
  vec2 uv=(world.xz-uCoverOrigin)/64.0;
  float floorY=texture2D(uCover,clamp(uv,vec2(.001),vec2(.999))).r;
  vAbove=world.y-floorY-.10;
  float radialFade=1.0-smoothstep(17.0,24.0,length(world.xz-uEye.xz));
  float nearEye=smoothstep(.6,2.0,distance(world,uEye));
  vAlpha=radialFade*nearEye*uAmount*uLight;
  vec4 mv=viewMatrix*vec4(world,1.0);
  if(uKind<.5)mv.x+=edge*max(.018,-mv.z*.0009);
  vEdge=edge;
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(uSize*110.0/max(1.0,-mv.z),2.0,9.0);
}`;
const FRAG=/*glsl*/`
uniform vec3 uColour;
uniform float uKind;
varying float vAlpha,vAbove,vEdge;
void main(){
 if(vAbove<0.0||vAlpha<.002)discard;
 float shape=1.0-smoothstep(.35,1.0,abs(vEdge));
 if(uKind>.5){float r=length(gl_PointCoord-.5);shape=1.0-smoothstep(.2,.5,r);}
 gl_FragColor=vec4(uColour,vAlpha*shape);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

function geometry(count,lines) {
 const n=count*(lines?4:1),p=new Float32Array(n*3),ends=new Float32Array(n),sides=new Float32Array(n),indices=[];
 // A fixed low-discrepancy distribution, repeated only inside the local volume.
 for(let i=0;i<count;i++)for(let e=0;e<(lines?4:1);e++) {
   const j=i*(lines?4:1)+e;
   p[j*3]=(i*.754877666+.13)%1;p[j*3+1]=(i*.569840296+.37)%1;p[j*3+2]=(i*.438579021+.73)%1;ends[j]=e===1||e===2?1:0;sides[j]=lines?(e<2?-1:1):0;
   if(lines&&e===0)indices.push(j,j+1,j+2,j,j+2,j+3);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('end',new THREE.BufferAttribute(ends,1));g.setAttribute('edge',new THREE.BufferAttribute(sides,1));if(lines)g.setIndex(indices);return g;
}

export function createPrecipitation(scene,field) {
 const pixels=new Float32Array(COVER_SIZE*COVER_SIZE);
 const cover=new THREE.DataTexture(pixels,COVER_SIZE,COVER_SIZE,THREE.RedFormat,THREE.FloatType);
 cover.minFilter=cover.magFilter=THREE.NearestFilter;cover.generateMipmaps=false;
 const common={uTime:{value:0},uEye:{value:new THREE.Vector3()},uWind:{value:new THREE.Vector2()},uCoverOrigin:{value:new THREE.Vector2()},uCover:{value:cover},uLight:{value:1}};
 const make=(kind,count)=>{
  const uniforms={...common,uKind:{value:kind},uAmount:{value:0},uFall:{value:kind?2:25},uSize:{value:1},uColour:{value:new THREE.Color(kind?0xe0edfa:0xaabfce)}};
  const m=new THREE.ShaderMaterial({vertexShader:VERT,fragmentShader:FRAG,uniforms,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide});
  const g=geometry(count,!kind),o=kind?new THREE.Points(g,m):new THREE.Mesh(g,m);
  o.name=kind?'weather-flakes':'weather-rain';o.frustumCulled=false;o.renderOrder=8;o.visible=false;scene.add(o);return o;
 };
 const rain=make(0,RAIN_COUNT),flakes=make(1,FLAKE_COUNT),roofs=[];
 const snowColour=new THREE.Color(0xe0edfa),dustColour=new THREE.Color(0xa69b87);
 let cx=Infinity,cz=Infinity,version=null,scanAt=-Infinity,time=0;
 const previousRoofs=[];
 const stats={batches:0,coverBuilds:0,coverSamples:0,roofCount:0,lastCoverMs:0,maxCoverMs:0};
 function rebuildCover(eye,now) {
   let roofChanged=false;
   if(now-scanAt>.5 || now<scanAt) {
     scanAt=now;roofs.length=0;
     scene.traverseVisible(o=>{for(const r of o.userData.weatherRoofs||[])if(Math.hypot(r.x-eye.x,r.z-eye.z)<70)roofs.push(r);});
     roofChanged=roofs.length!==previousRoofs.length||roofs.some((r,i)=>r!==previousRoofs[i]);
     previousRoofs.length=0;for(const r of roofs)previousRoofs.push(r);
   }
   const v=field.terrainEdits?.version;
   if(!roofChanged && Math.abs(eye.x-cx)<7 && Math.abs(eye.z-cz)<7 && version===v)return;
   cx=eye.x;cz=eye.z;version=v;
   const begin=performance.now();
   const ox=cx-COVER_SPAN/2,oz=cz-COVER_SPAN/2;
   common.uCoverOrigin.value.set(ox,oz);
   for(let j=0;j<COVER_SIZE;j++)for(let i=0;i<COVER_SIZE;i++) {
     const x=ox+(i+.5)*COVER_SPAN/COVER_SIZE,z=oz+(j+.5)*COVER_SPAN/COVER_SIZE,p=field.sampleAt(x,z);
     pixels[j*COVER_SIZE+i]=Math.max(p.h,p.water?p.waterLevel:-Infinity,authoredDeckAt(field,x,z)??-Infinity,roofHeightAt(roofs,x,z));
   }
   cover.needsUpdate=true;stats.coverBuilds++;stats.coverSamples+=pixels.length;stats.roofCount=roofs.length;
   stats.lastCoverMs=performance.now()-begin;stats.maxCoverMs=Math.max(stats.maxCoverMs,stats.lastCoverMs);
 }
 return {rain,flakes,cover,stats,
  update(dt,eye,w,day,hidden=false){
   time+=Math.max(0,dt);
   rain.visible=!hidden && w.rain>.015;
   flakes.visible=!hidden && Math.max(w.snow,w.dust)>.015;
   stats.batches=Number(rain.visible)+Number(flakes.visible);
   if(!stats.batches)return;
   rebuildCover(eye,time);
   common.uTime.value=time;common.uEye.value.copy(eye);common.uWind.value.set(w.windX*5,w.windZ*5);common.uLight.value=.50+day*.40;
   rain.material.uniforms.uAmount.value=w.rain*.48;
   const f=flakes.material.uniforms;f.uAmount.value=Math.max(w.snow,w.dust)*.80;f.uFall.value=w.snow>w.dust?1.8:.5;
   f.uSize.value=w.snow>w.dust?.85:.42;f.uColour.value.copy(w.snow>w.dust?snowColour:dustColour);
  },
  dispose(){for(const o of[rain,flakes]){o.removeFromParent();o.geometry.dispose();o.material.dispose();}cover.dispose();},
 };
}
