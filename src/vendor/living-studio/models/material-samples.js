import * as THREE from 'three';
import {Geometry} from './geometry.js';
import {materialById} from '../data/materials.js';
import {applyItemMaterial} from './item-materials.js';

function cutGem(h, preset, material) {
  const count=8, vertices=[], faces=[];
  // Counterclockwise rings: the table faces outward, including from above.
  for(const [z,radius] of [[.78,.38],[.4,.78],[.25,.8],[-.48,.05]]) {
    for(let i=0;i<count;i++) {const angle=i*Math.PI*2/count;vertices.push([Math.cos(angle)*radius,Math.sin(angle)*radius,z]);}
  }
  faces.push(Array.from({length:count},(_,i)=>i));
  for(let row=0;row<3;row++) for(let i=0;i<count;i++) {
    const next=(i+1)%count;
    faces.push([row*count+i,(row+1)*count+i,(row+1)*count+next,row*count+next]);
  }
  faces.push(Array.from({length:count},(_,i)=>4*count-1-i));
  h.mesh('Faceted '+preset.name,vertices,faces,material,{variation:.012});
}

function ingot(h,preset,material) {
  const vertices=[],faces=[];
  for(const [z,x,y,bevel] of [[0,.93,.47,.09],[.065,1,.54,.10],[.43,.84,.4,.08],[.5,.76,.32,.07]]) {
    for(const [px,py] of [[-x+bevel,-y],[x-bevel,-y],[x,-y+bevel],[x,y-bevel],[x-bevel,y],[-x+bevel,y],[-x,y-bevel],[-x,-y+bevel]]) vertices.push([px,py,z]);
  }
  faces.push([7,6,5,4,3,2,1,0]);
  for(let row=0;row<3;row++) for(let i=0;i<8;i++) faces.push([row*8+i,row*8+(i+1)%8,(row+1)*8+(i+1)%8,(row+1)*8+i]);
  faces.push([24,25,26,27,28,29,30,31]);
  h.mesh(preset.name+' beveled ingot',vertices,faces,material,{variation:.01});
  if(['starfall','emberite'].includes(preset.id)) {
    const seamMaterial=new THREE.MeshStandardMaterial({color:preset.id==='starfall'?'#c5d7e0':'#a9573f',roughness:.45,metalness:.5});
    const seam=h.tube('Mineral seam',[[-.55,-.22,.5],[-.27,-.13,.5],[.03,.08,.5],[.48,.23,.5]],.009,seamMaterial,{sides:4,variation:0});
    seam.userData.materialRole='trim';
  }
}

function timber(h,material) {
  for(let i=0;i<3;i++) {
    const x=(i-1)*.40,z=.125+i*.028;
    const plank=h.cube('Cut timber '+(i+1),[x,0,z],[.40,2,.25],material,{bevel:.035});
    plank.userData.assembly='Timber sample boards';
    // Sparse, shallow grain follows the length and belongs to the same wood.
    for(const side of [-1,1]) {
      const line=h.tube('Timber grain '+i+' '+side,[[x+side*.085,-.87,z+.126],[x+side*.064,-.29,z+.126],[x+side*.077,.35,z+.126],[x+side*.06,.87,z+.126]],.0035,material,{sides:4,variation:0});
      line.geometry.attributes.color.array.fill(.82);
    }
  }
}

function hide(h,preset,material) {
  const thickness=preset.id==='thickHide'?.22:.09;
  const outline=[[-.72,-.85],[.7,-.8],[.86,.58],[.2,.93],[-.75,.65]],vertices=[];
  for(const z of [0,thickness]) for(const [x,y] of outline) vertices.push([x,y,z]);
  const faces=[[0,4,3,2,1],[5,6,7,8,9]];
  for(let i=0;i<5;i++) faces.push([i,(i+1)%5,(i+1)%5+5,i+5]);
  h.mesh('Cut hide with finished edge',vertices,faces,material,{variation:.015});
  if(preset.id==='scaledHide') {
    for(let row=0;row<4;row++) for(let column=0;column<3;column++) {
      const x=(column-1)*.38+(row%2)*.045,y=(row-1.5)*.37;
      const outline=[[-.175,-.16],[.175,-.16],[.17,.05],[0,.20],[-.17,.05]];
      const points=outline.map(([dx,dy])=>[x+dx,y+dy,thickness*.8]);
      points.push(...outline.map(([dx,dy])=>[x+dx,y+dy,thickness+(.04+(dy+.16)*.10)]));
      points.push([x,y,thickness+.088]);
      const sides=[[4,3,2,1,0]];
      for(let i=0;i<5;i++)sides.push([5+i,5+(i+1)%5,10]);
      for(let i=0;i<5;i++) sides.push([i,(i+1)%5,(i+1)%5+5,i+5]);
      h.mesh('Attached scale '+row+' '+column,points,sides,material,{variation:.024});
    }
  }
}

export function createMaterialSample(id) {
  const preset=materialById.get(id);
  if(!preset)throw new Error(`Unknown material sample: ${id}`);
  const root=new THREE.Group();root.name=preset.name;
  const h=new Geometry(root);
  const material=new THREE.MeshStandardMaterial({name:id,color:preset.color,flatShading:true,vertexColors:true,roughness:preset.roughness,metalness:preset.metalness});
  material.userData.itemOwned=true;
  if(preset.role==='gem')cutGem(h,preset,material);
  else if(preset.role==='metal')ingot(h,preset,material);
  else if(preset.role==='wood')timber(h,material);
  else hide(h,preset,material);
  root.traverse(object=>{if(object.isMesh){object.userData.materialRole??=preset.role;object.material.userData.itemOwned=true;}});
  applyItemMaterial(root,id);
  return root;
}
