/** Shared authored space. Every mesh and joint passes through the same map. */
export const chibiJoints={
 hips:[0,0,2.8],spine:[0,0,3.6],chest:[0,0,4.35],neck:[0,0,5.02],head:[0,0,5.72],
 upperArmL:[-.97,0,4.65],upperArmR:[.97,0,4.65],
 forearmL:[-1.35,-.015,3.8],forearmR:[1.35,-.015,3.8],
 handL:[-1.5,-.16,2.92],handR:[1.5,-.16,2.92],
 thighL:[-.46,.04,2.65],thighR:[.46,.04,2.65],
 shinL:[-.60,-.06,1.35],shinR:[.60,-.06,1.35],
 footL:[-.65,0,.38],footR:[.65,0,.38],
};
export function chibiPoint(x,y,z,bodyType='male'){
 const head=Math.max(0,Math.min(1,(z-4.8)/.55));
 const width=(bodyType==='female'?.94:1)*(1+head*.10);
 return [x*width,y*(1+head*.05),z<=5.2?z*.82:5.2*.82+(z-5.2)*1.15];
}
export function fitChibiGeometry(group,bodyType){
 group.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const pos=mesh.geometry.attributes.position;
  for(let i=0;i<pos.count;i++)pos.setXYZ(i,...chibiPoint(pos.getX(i),pos.getY(i),pos.getZ(i),bodyType));
  pos.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
 });
}
