import * as THREE from 'three';
import {MARKS} from '../player.js';
/** Project saved face markings onto the actual studio face, before its game-axis conversion. */
export function attachFaceMark(actor,id){
 const mark=MARKS[id];if(!mark)return;
 const surfaces=[];actor.group.updateMatrixWorld(true);actor.rig.skeleton.update();
 actor.group.traverse(m=>{if(m.isMesh&&m.visible&&m.userData.part==='head'&&m.userData.materialRole==='skin')surfaces.push(m);});
 if(!surfaces.length)actor.group.traverse(m=>{if(m.isMesh&&m.name==='Head facial planes')surfaces.push(m);});
 const ray=new THREE.Raycaster(),point=new THREE.Vector3(),direction=new THREE.Vector3(0,1,0),vertices=[],indices=[],head=actor.rig.joints.head;
 function patch(cx,cz,w,h,tilt=0){
  const cols=8,rows=3,start=vertices.length/3;
  for(let v=0;v<=rows;v++)for(let u=0;u<=cols;u++){
   const dx=(u/cols-.5)*w,dz=(v/rows-.5)*h,x=cx+dx*Math.cos(tilt)-dz*Math.sin(tilt),z=cz+dz*Math.cos(tilt)+dx*Math.sin(tilt);
   ray.set(point.set(x,-3,z),direction);const hit=ray.intersectObjects(surfaces,false)[0];
   point.set(x,(hit?.point.y??-.34)-.008,z);head.worldToLocal(point);vertices.push(...point);
  }
  for(let v=0;v<rows;v++)for(let u=0;u<cols;u++){const a=start+v*(cols+1)+u,b=a+1,c=a+cols+1,d=c+1;indices.push(a,b,d,a,d,c);}
 }
 const scale=4,cx=-(mark.x||0)*scale,cz=7.18+(mark.y-.12)*scale;
 if(mark.kind==='dots')for(let i=0;i<9;i++)patch((i%3-1)*mark.w*2,cz+(Math.floor(i/3)-1)*mark.h*1.3,.022,.018);
 else patch(cx,cz,mark.w*scale,mark.h*scale,-(mark.tilt||0));
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const material=new THREE.MeshBasicMaterial({color:mark.colour,side:THREE.DoubleSide,transparent:true,opacity:.78,depthWrite:false});material.userData.ownedByCharacter=true;
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Saved face mark: '+id;mesh.userData.faceMark=id;head.add(mesh);
}
