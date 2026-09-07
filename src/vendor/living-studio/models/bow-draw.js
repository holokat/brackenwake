import * as THREE from 'three';
const restMeshes=new WeakMap(),drawStates=new WeakMap();
const point=new THREE.Vector3();
/** Deform from rest on every seek: continuous joins, fixed string length. */
export function poseBowDraw(item,amount=0,{distance,loaded=0}={}){
 const construction=item.userData.bowConstruction;if(!construction)return;
 let meshes=restMeshes.get(item);
 if(!meshes){meshes=[];item.traverse(mesh=>{if(mesh.isMesh&&(/limb|recurved|curved|string nock|Taut bow string/.test(mesh.name)))meshes.push({mesh,rest:mesh.geometry.attributes.position.array.slice()});});restMeshes.set(item,meshes);}
 amount=THREE.MathUtils.clamp(amount,0,1);
 const [a,b]=construction.attachments,h=(b[2]-a[2])/2;
 const draw=amount*(distance??(item.userData.itemId==='longbow'?2.0:2.08)),bend=.5*draw,lateral=.20*loaded;
 const signature=[draw,lateral];
 if(drawStates.get(item)?.every((value,i)=>value===signature[i]))return;
 drawStates.set(item,signature);
 const span=Math.sqrt(Math.max(.01,h*h-(draw-bend)**2-lateral*lateral)),dz=span-h;
 function deform(x,y,z){const f=Math.max(0,(Math.abs(z)-.24)/(h-.24))**2;return point.set(x-bend*f,y,z+Math.sign(z)*dz*f);}
 for(const {mesh,rest}of meshes){
  const attribute=mesh.geometry.attributes.position;
  for(let i=0;i<attribute.count;i++){
   const x=rest[i*3],y=rest[i*3+1],z=rest[i*3+2];
   if(mesh.name==='Taut bow string'){
    // The generated tube has rings at both nocks and the drawing contact.
    const t=Math.min(1,Math.abs(z)/h),centerOffset=-draw*(1-t)-bend*t;
    point.set(x+centerOffset,y+lateral*(1-t),z*span/h);
   }else deform(x,y,z);
   attribute.setXYZ(i,point.x,point.y,point.z);
  }
  attribute.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();mesh.geometry.computeBoundingBox();
 }
 const right=[construction.center[0]-draw,lateral,0];
 item.userData.twoHandedGrip.right=right;
 const endpoints=construction.attachments.map(([x,y,z])=>deform(x,y,z).toArray());
 const center=new THREE.Vector3(...right),length=endpoints.reduce((sum,p)=>sum+center.distanceTo(new THREE.Vector3(...p)),0);
 item.userData.bowDraw={amount,restLength:2*h,stringLength:length,endpoints,center:right};
}
