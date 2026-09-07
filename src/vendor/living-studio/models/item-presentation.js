import * as THREE from 'three';

// Armor exports retain body coordinates. In the library only, bring paired
// pieces together so small gloves and bracers can be inspected at useful size.
export function arrangeItemForInspection(root,item){
 if(item.kind!=='armor'||!['hands','wrists','feet'].includes(item.slot))return root;
 const sides=[[],[]],bounds=[new THREE.Box3(),new THREE.Box3()];
 root.traverse(mesh=>{if(!mesh.isMesh)return;mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,side=box.getCenter(new THREE.Vector3()).x<0?0:1;sides[side].push(mesh);bounds[side].union(box);});
 if(sides.some(side=>side.length===0))return root;
 for(let side=0;side<2;side++){
  const box=bounds[side],center=box.getCenter(new THREE.Vector3()),width=box.getSize(new THREE.Vector3()).x;
  const x=(side===0?-1:1)*(width*.5+.12)-center.x;
  for(const mesh of sides[side]){mesh.geometry.translate(x,-center.y,-box.min.z);mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();}
 }
 return root;
}
