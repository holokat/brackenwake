// A small ray-marched fire volume with a soft silhouette and a moving interior.
//
// PORTED from the studio's src/vfx/spells/createFireVolume.ts. ONE ADDITION,
// `uTint`, multiplies the marched radiance so the same volume can be the core
// of a frost bolt or a shadow bolt; it is 1,1,1 by default and the studio's own
// fire is what comes out then. The 28 step
// march is the parameter to watch: it is per fragment on a 0.38 m billboard,
// which is cheap while the billboard is small and is why nothing here scales
// the mesh past the fireball head and the meteor.

import * as THREE from 'three';
import { enableSpellBloom } from './bloom.js';

export function createFireVolume() {
  const material = enableSpellBloom(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv=uv;
        vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);
        center.xy+=position.xy*length(modelMatrix[0].xyz);
        gl_Position=projectionMatrix*center;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uTint;
      varying vec2 vUv;
      float turbulence(vec3 p){
        float flow=uTime*3.;
        return sin(p.x*5.+flow+sin(p.y*7.-flow))*sin(p.z*6.-flow*.7)
          +.4*sin(p.x*13.-flow*1.3)*sin(p.y*11.+p.z*9.+flow);
      }
      void main(){
        vec2 screen=(vUv-.5)*2.;
        if(length(screen)>1.) discard;
        vec3 radiance=vec3(0.);
        float alpha=0.;
        for(int i=0;i<28;i++){
          vec3 p=vec3(screen,-1.+float(i)/13.5);
          float noise=turbulence(p);
          float density=clamp((.76-length(p)+noise*.14)*3.,0.,1.);
          float heat=clamp(density*.7+.25+noise*.18,0.,1.);
          vec3 color=mix(vec3(1.,.08,.008),vec3(1.,.57,.06),smoothstep(.1,.7,heat));
          color=mix(color,vec3(1.,.93,.55),smoothstep(.75,1.,heat));
          float absorption=density*.16;
          radiance+=(1.-alpha)*color*absorption;
          alpha+=(1.-alpha)*absorption;
        }
        if(alpha<.004) discard;
        gl_FragColor=vec4(radiance/max(alpha,.001)*1.4*uTint,alpha*uOpacity);
      }
    `,
  }));
  material.toneMapped = false;
  const geometry = new THREE.PlaneGeometry(0.38, 0.38);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return { mesh, material, geometry };
}
