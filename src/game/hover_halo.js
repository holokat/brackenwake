import * as THREE from 'three';
/** One restrained ring shared by the hovered target, conformed to the real ground. */
export function createHoverHalo(scene,heightAt){
 const geometry=new THREE.RingGeometry(.72,1,48),material=new THREE.MeshBasicMaterial({color:0xe7c88b,transparent:true,opacity:.22,depthTest:true,depthWrite:false,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 haloUv;').replace('vec4 diffuseColor = vec4( diffuse, opacity );','float ring=length(haloUv*2.0-1.0); float edge=smoothstep(.72,.84,ring)*(1.0-smoothstep(.86,1.0,ring)); vec4 diffuseColor = vec4(diffuse,opacity*edge);');shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 haloUv;').replace('#include <begin_vertex>','#include <begin_vertex>\nhaloUv=uv;');};
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Interaction hover halo';mesh.frustumCulled=false;mesh.visible=false;mesh.renderOrder=2;scene.add(mesh);
 const base=geometry.attributes.position.array.slice();let target=null;
 return{mesh,
  show(pos,radius=.75,observer){
   if(!pos||!Number.isFinite(pos.x)||!Number.isFinite(pos.z)||observer&&Math.hypot(pos.x-observer.x,pos.z-observer.z)>24){this.clear();return;}
   radius=Math.max(.38,Math.min(2.2,radius));target={x:pos.x,z:pos.z,radius};mesh.visible=true;
   const attr=geometry.attributes.position;
   for(let i=0;i<attr.count;i++){const x=pos.x+base[i*3]*radius,z=pos.z+base[i*3+1]*radius;attr.setXYZ(i,x,heightAt(x,z)+.055,z);}
   attr.needsUpdate=true;geometry.computeBoundingSphere();
  },
  clear(){target=null;mesh.visible=false;},get target(){return target;},
  dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();},
 };
}
