import * as THREE from 'three';

export const colors={green:new THREE.Color('#8df48d'),gold:new THREE.Color('#ffd36a'),blue:new THREE.Color('#80c6ff'),white:new THREE.Color('#cceeff'),violet:new THREE.Color('#794daf'),stone:new THREE.Color('#a7acae')};
export const noiseGLSL=`
float hash31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise3(p)*.57+noise3(p*2.07)*.28+noise3(p*4.13)*.15;}
`;
export const planeVertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const billboardVertex=`varying vec2 vUv;void main(){vUv=uv;vec4 centerView=modelViewMatrix*vec4(0.,0.,0.,1.);centerView.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));gl_Position=projectionMatrix*centerView;}`;
export function seeded(seed=1){let value=seed;return()=>{value+=0x6d2b79f5;let t=value;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function createResources(){
  const geometries=new Set(),materials=new Set(),cache=new Map();
  const ownGeometry=geometry=>(geometries.add(geometry),geometry);
  const geometry=(key,create)=>{if(!cache.has(key))cache.set(key,ownGeometry(create()));return cache.get(key);};
  const ownMaterial=material=>{material.userData={...material.userData,spellBloom:true,healerOwned:true};materials.add(material);return material;};
  function shader(color,fragmentShader,{vertexShader=planeVertex,uniforms={},blending=THREE.AdditiveBlending,...extra}={}){
    return ownMaterial(new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{uTime:{value:0},uOpacity:{value:0},uColor:{value:color.clone()},...uniforms},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending,toneMapped:false,...extra}));
  }
  return {geometry,ownGeometry,ownMaterial,shader,geometries,materials,dispose(){for(const g of geometries)g.dispose();for(const m of materials)m.dispose();geometries.clear();materials.clear();cache.clear();}};
}
export function meshPart(object,material,update=()=>{}){object.frustumCulled=false;return {root:object,material,sample(time,opacity){object.visible=opacity>.0001;material.uniforms.uTime.value=time;material.uniforms.uOpacity.value=Math.max(0,opacity);update(time,opacity);}};}
