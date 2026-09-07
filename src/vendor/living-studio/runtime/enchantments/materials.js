import * as THREE from 'three';
import {enchantmentById} from '../../data/enchantments.js';

export const families = ['flame','frost','shock','venom','vampiric','keen','force','holy'];
export const noiseGLSL = `
float hash31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise3(p)*.57+noise3(p*2.07)*.28+noise3(p*4.13)*.15;}
`;
// Saturated emission keeps the element readable under selective HDR bloom.
// White cores belong to very small accents, never an entire particle field.
export const radianceGLSL = `
vec3 elementRadiance(float family,vec3 color,vec3 core,float heat){
  heat=clamp(heat,0.,1.);
  if(family<.5)return mix(vec3(1.75,.04,.001),vec3(3.5,.55,.012),heat)+vec3(.18,.17,.01)*pow(heat,18.);
  if(family<1.5)return mix(vec3(.025,.25,.75),vec3(.20,.66,1.15),heat);
  if(family<2.5)return mix(vec3(.08,.32,4.),vec3(.2,.9,7.),heat);
  if(family<3.5)return mix(vec3(.055,.40,.006),vec3(.32,.88,.018),heat);
  if(family<4.5)return mix(vec3(2.4,.003,.012),vec3(5.5,.026,.05),heat);
  if(family<5.5)return mix(color,core,.72+heat*.28)*1.15;
  if(family<6.5)return mix(color,core,heat*.35)*1.1;
  return mix(color,core,heat*.75)*1.25;
}
`;
export function effectMaterial(id, parameters = {}) {
  const material = new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,...parameters});
  material.name = `Enchantment ${id}`;
  material.userData.spellBloom = true;
  material.userData.enchantmentOwned = true;
  return material;
}
export function uniformsFor(id, level, scale) {
  const spec = enchantmentById.get(id);
  return {uTime:{value:0},uColor:{value:new THREE.Color(spec.color)},uCore:{value:new THREE.Color(spec.core)},uStrength:{value:[0,.58,1,1.48][level]},uScale:{value:scale},uFamily:{value:families.indexOf(id)}};
}
export function createSurfaceAura(profile,id,level) {
  const uniforms=uniformsFor(id,level,profile.scale);
  const material=effectMaterial(id,{uniforms,vertexShader:`
    varying vec3 vPosition,vNormal,vView; uniform float uScale;
    void main(){vPosition=position; vec3 p=position+normal*(.006+.004*uScale);vec4 mv=modelViewMatrix*vec4(p,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}
  `,fragmentShader:`
    uniform float uTime,uStrength,uScale,uFamily;uniform vec3 uColor,uCore;varying vec3 vPosition,vNormal,vView;${noiseGLSL}${radianceGLSL}
    void main(){vec3 p=vPosition/max(.3,uScale);float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.);float n=fbm(p*7.-vec3(0,0,uTime*1.8));float pulse=.5+.5*sin(p.z*13.-uTime*5.);float alpha=.1;
    if(uFamily<.5) alpha=.15+smoothstep(.42,.78,n)*.6+rim*.3;
    else if(uFamily<1.5) alpha=.12+pow(abs(sin(p.x*26.+p.z*19.+n*3.)),22.)*.36+rim*.38;
    else if(uFamily<2.5) alpha=.05+pow(max(0.,sin(p.z*31.+n*19.-uTime*13.)),28.)*.8+rim*.16;
    else if(uFamily<3.5) alpha=.12+smoothstep(.54,.69,fbm(p*12.+vec3(0,0,uTime*.65)))*.48+rim*.23;
    else if(uFamily<4.5) alpha=.09+pow(pulse,9.)*.32+rim*.45;
    else if(uFamily<5.5) alpha=.018+pow(rim,2.)*.65+pow(pulse,30.)*.18;
    else if(uFamily<6.5) alpha=.06+pow(pulse,14.)*.33+rim*.3;
    else alpha=.13+rim*.42+pow(pulse,7.)*.22;
    gl_FragColor=vec4(elementRadiance(uFamily,uColor,uCore,rim*.4),alpha*uStrength*.48);}
  `});
  const mesh=new THREE.Mesh(profile.geometry,material);mesh.name='Working-surface radiance';mesh.renderOrder=3;mesh.frustumCulled=false;
  return {object:mesh,update(time){uniforms.uTime.value=time;}};
}
