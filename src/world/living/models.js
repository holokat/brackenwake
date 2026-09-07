import {createChicken} from './chicken.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createDressingModel,disposeLivingModel} from '../../vendor/living-studio/models/dressing/index.js';
import {LIVING_BY_MODEL,LIVING_FOOTPRINTS} from '../../mmo/living_catalog.js';

// Bake the studio's fixed dressing pose into one vertex-coloured draw. The
// source masters stay intact in vendor; game placements share this geometry.
export function bakeLivingGeometry(root){
 root.updateMatrixWorld(true);const parts=[];
 root.traverse(o=>{
  if(!o.isMesh)return;for(let p=o;p;p=p.parent)if(!p.visible)return;
  const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);
  const p=g.attributes.position,col=new Float32Array(p.count*3),prior=g.attributes.color;
  const materials=Array.isArray(o.material)?o.material:[o.material];
  for(let i=0;i<p.count;i++){
   const index=g.groups.find(group=>i>=group.start&&i<group.start+group.count)?.materialIndex??0;
   const c=materials[index]?.color??materials[0].color;
   col[i*3]=c.r*(prior?prior.getX(i):1);col[i*3+1]=c.g*(prior?prior.getY(i):1);col[i*3+2]=c.b*(prior?prior.getZ(i):1);
  }
  for(const key of Object.keys(g.attributes))if(!['position','normal'].includes(key))g.deleteAttribute(key);
  g.setAttribute('color',new THREE.BufferAttribute(col,3));g.clearGroups();parts.push(g);
 });
 const geometry=mergeGeometries(parts,false);for(const g of parts)g.dispose();
 if(!geometry)throw Error('Empty living-world model');geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
export function buildLivingProp(model){
 const row=LIVING_BY_MODEL[model];if(!row)throw Error(`Unknown living-world model: ${model}`);
 const source=row.id==='chicken'?createChicken():createDressingModel(row.id),geometry=bakeLivingGeometry(source);disposeLivingModel(source);
 const size=geometry.boundingBox.getSize(new THREE.Vector3()),foot=LIVING_FOOTPRINTS[model];
 // Surface assets keep their footprint and get only a thin visible bed.
 if(row.size[2]===0&&size.y>0)geometry.scale(1,foot[2]/size.y,1);
 geometry.userData.maxDistance=Math.max(...foot)>6?150:105;
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(geometry,material);mesh.name=model;mesh.castShadow=true;mesh.receiveShadow=true;
 mesh.userData.studioAsset=row.id;return mesh;
}
