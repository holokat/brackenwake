import * as THREE from 'three';
export function glow(color,opacity=.65){return new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});}
export function ring(root,name,radius,color,{width=.025,y=.025,start=0,arc=Math.PI*2,vertical=false,opacity=.7}={}){
 const mesh=new THREE.Mesh(new THREE.RingGeometry(Math.max(.001,radius-width),radius,96,1,start,arc),glow(color,opacity));mesh.name=name;
 if(!vertical)mesh.rotation.x=-Math.PI/2;mesh.position.y=y;root.add(mesh);return mesh;
}
export function spike(root,name,position,color,scale=[.06,.35,.06]){
 const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(1,0),glow(color,.9));mesh.name=name;mesh.position.set(...position);mesh.scale.set(...scale);root.add(mesh);return mesh;
}
export function disposeEffect(root){
 for(const actor of root.__effectActors||[])actor.dispose();delete root.__effectActors;
 const gs=new Set(),ms=new Set(),textures=new Set(),skeletons=new Set();
 root.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])ms.add(m);});
 for(const m of ms)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
 for(const s of skeletons)s.dispose();for(const g of gs)g.dispose();for(const t of textures)t.dispose();for(const m of ms)m.dispose();root.removeFromParent();
}
