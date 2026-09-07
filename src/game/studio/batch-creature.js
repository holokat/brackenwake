import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Studio skins already share a skeleton but draw once per pigment. Bake only
// diffuse pigment into vertex colours. Metal, eyes, emissive and transparent
// surfaces keep separate materials, including every original shader setting.
export function batchCreature(actor){
  let before=0,after=0;
  actor.group.traverse(mesh=>{
    const source=mesh.geometry,mats=mesh.material;
    if(!mesh.isSkinnedMesh||!Array.isArray(mats)||mats.length<2||source.index)return;
    if(mats.some(m=>m.type!=='MeshStandardMaterial'||m.map||m.alphaMap))return;
    const bins=new Map(),copies=[];
    for(const group of source.groups){
      const material=mats[group.materialIndex],json=material.toJSON();
      for(const key of ['metadata','uuid','name','color','vertexColors','userData'])delete json[key];
      const signature=JSON.stringify(json);
      if(!bins.has(signature)){const m=material.clone();m.color.set(0xffffff);m.vertexColors=true;bins.set(signature,{material:m,parts:[]});}
      const g=new THREE.BufferGeometry(),start=group.start,end=start+group.count;
      const slice=a=>{const b=new THREE.BufferAttribute(a.array.slice(start*a.itemSize,end*a.itemSize),a.itemSize,a.normalized);b.name=a.name;return b;};
      for(const[name,a]of Object.entries(source.attributes))g.setAttribute(name,slice(a));
      for(const[name,attrs]of Object.entries(source.morphAttributes))g.morphAttributes[name]=attrs.map(slice);
      g.morphTargetsRelative=source.morphTargetsRelative;
      const prior=g.attributes.color,colors=new Float32Array(group.count*3),c=material.color;
      for(let i=0;i<group.count;i++){
        colors[i*3]=c.r*(material.vertexColors&&prior?prior.getX(i):1);
        colors[i*3+1]=c.g*(material.vertexColors&&prior?prior.getY(i):1);
        colors[i*3+2]=c.b*(material.vertexColors&&prior?prior.getZ(i):1);
      }
      g.setAttribute('color',new THREE.BufferAttribute(colors,3));bins.get(signature).parts.push(g);copies.push(g);
    }
    const buckets=[...bins.values()],merged=buckets.map(b=>mergeGeometries(b.parts,false)),geometry=mergeGeometries(merged,true);
    for(const g of [...copies,...merged])g.dispose();
    if(!geometry)throw Error('Creature skin batching lost its attributes');
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    before+=source.groups.length;after+=geometry.groups.length;
    mesh.geometry=geometry;mesh.material=buckets.map(b=>b.material);source.dispose();
    // These materials belong to this source actor, not to the shared palette.
    for(const m of mats)m.dispose();
  });
  actor.group.userData.skinBatches={before,after};return {before,after};
}
