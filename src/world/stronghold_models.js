import * as THREE from 'three';
import {bakeLivingGeometry} from './living/models.js';

// Fixed architectural models, shared by the zone and the builder. The tower's
// silhouette, windows and buttresses are authored here, without random detail.
export function buildStrongholdProp(id){
  const root=new THREE.Group(),materials=new Map();
  const colors={stone:0x454b59,trim:0x687084,dark:0x242a3b,roof:0x302640,iron:0x191e2a,rune:0xa796ce};
  const mat=key=>{if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color:colors[key]}));return materials.get(key);};
  function put(g,x,y,z,key,yaw=0){const mesh=new THREE.Mesh(g,mat(key));mesh.position.set(x,y,z);mesh.rotation.y=yaw;root.add(mesh);return mesh;}
  const box=(x,y,z,w,h,d,key,yaw=0)=>put(new THREE.BoxGeometry(w,h,d),x,y,z,key,yaw);
  const ring=(y,top,bottom,height,key,n=8)=>put(new THREE.CylinderGeometry(top,bottom,height,n),0,y,0,key,Math.PI/8);
  if(id==='occult_tower'){
    ring(.65,6.3,6.5,1.3,'dark');ring(1.45,5.75,6.3,.5,'trim');
    ring(9.2,4.65,5.65,15,'stone');ring(4.6,5.5,5.55,.4,'trim');ring(10,5.12,5.18,.3,'dark');
    ring(16.9,5.55,4.65,1,'trim');ring(18,5.55,5.55,1.2,'dark');
    // Four buttresses leave the doorway and the approach open.
    for(const[x,z,a]of [[-4.1,-4.1,-Math.PI/4],[4.1,-4.1,Math.PI/4],[-4.1,4.1,Math.PI/4],[4.1,4.1,-Math.PI/4]]){
      box(x,4,z,1.15,8,2.2,'dark',a);box(x,8.15,z,1.3,.3,2.3,'trim',a);
    }
    for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
      for(const y of [7,12.8]){
        const r=y<10?5.18:4.83,x=Math.sin(a)*r,z=Math.cos(a)*r;
        box(x,y,z,1.35,2.6,.35,'dark',a);
        box(x+Math.sin(a)*.19,y,z+Math.cos(a)*.19,.58,1.9,.08,'rune',a);
        box(x,y+1.42,z,1.6,.3,.6,'trim',a);
      }
      box(Math.sin(a)*5.05,19.1,Math.cos(a)*5.05,1.9,1.1,1.1,'stone',a);
    }
    ring(22.4,.15,4.9,7.2,'roof');ring(18.8,5.05,5.05,.25,'iron');
    ring(26.5,0,.32,1,'iron',6);
    box(0,2.35,5.4,2.65,3.4,.65,'dark');box(0,2.2,5.76,1.8,2.8,.12,'iron');
    box(0,.5,6,3.2,1,1,'trim');
  }else if(id==='ritual_altar'){
    box(0,.2,0,5,.4,4,'dark');box(0,.55,0,3.8,.3,2.8,'trim');
    box(0,1.15,0,2.6,.9,1.7,'stone');box(0,1.7,0,3.5,.3,2.5,'dark');
    for(const[x,z]of[[-1.4,-.85],[1.4,-.85],[-1.4,.85],[1.4,.85]]){
      box(x,2,z,.22,.65,.22,'iron');box(x,2.37,z,.2,.06,.2,'rune');
    }
    box(0,1.87,0,1.2,.04,.08,'rune');box(0,1.87,0,.08,.04,1.2,'rune');
  }else throw Error('Unknown stronghold model: '+id);
  const geometry=bakeLivingGeometry(root);
  root.traverse(o=>o.geometry?.dispose());for(const m of materials.values())m.dispose();
  geometry.userData.maxDistance=id==='occult_tower'?210:110;
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,flatShading:true}));
  mesh.name=id;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
