import * as T from 'three';
/** Solid visible proxies preserve navigation while detailed room artwork streams. */
export function createCellarLoadingGeometry(colliders){
 const group=new T.Group(),material=new T.MeshStandardMaterial({color:0x565c62,roughness:.95}),geometry=new T.BoxGeometry(1,1,1);
 const boxes=colliders.filter(c=>c.kind==='box'),mesh=new T.InstancedMesh(geometry,material,boxes.length),dummy=new T.Object3D(),ramps=[];
 boxes.forEach((c,i)=>{dummy.position.set(c.x,c.y+c.h/2,c.z);dummy.rotation.set(0,Math.atan2(c.s||0,c.c??1),0);dummy.scale.set(c.w,c.h,c.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
 mesh.computeBoundingSphere();group.add(mesh);
 for(const c of colliders.filter(c=>c.kind==='ramp')){
  const w=c.w/2,d=c.d/2,a=c.direction<0?c.h:0,b=c.direction<0?0:c.h,t=c.thickness||0;
  const points=[-w,a,-d,w,a,-d,w,b,d,-w,b,d,-w,t?a-t:0,-d,w,t?a-t:0,-d,w,t?b-t:0,d,-w,t?b-t:0,d];
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));
  g.setIndex([0,3,2,0,2,1,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]);g.computeVertexNormals();
  const ramp=new T.Mesh(g,material);ramp.position.set(c.x,c.y,c.z);ramp.rotation.y=Math.atan2(c.s||0,c.c??1);group.add(ramp);ramps.push(g);
 }
 let disposed=false;
 return{group,dispose(){if(disposed)return;disposed=true;group.removeFromParent();mesh.dispose();geometry.dispose();for(const g of ramps)g.dispose();material.dispose();}};
}
