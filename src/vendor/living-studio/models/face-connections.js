import {Vector3} from 'three';
import {fitFaceLayer,joinNoseToHead} from './face-surfaces.js';

function seatNostrils(group){
 const nose=group.getObjectByName('Nose bridge and tip').geometry.attributes.position;
 const weights=[[.50,.18,.32],[.73,.18,.09],[.50,.04,.46]];
 for(const side of [-1,1]){
  const mesh=group.getObjectByName('Nostril '+side),p=mesh.geometry.attributes.position;
  const offset=side<0?15:18,order=side<0?[0,1,2]:[1,0,2],support=order.map(i=>new Vector3().fromBufferAttribute(nose,offset+i));
  for(let i=0;i<p.count;i++){
   const point=new Vector3();weights[i%3].forEach((w,j)=>point.addScaledVector(support[j],w));
   p.setXYZ(i,point.x,point.y-.002,point.z);
  }
  p.needsUpdate=true;
 }
}

/** Fit final body-space surfaces before binding. No facial detail is positioned
 * as a floating plane or sphere; every layer has an embedded rear surface.
 */
export function fitFaceConnections(group){
 const head=group.getObjectByName('Head facial planes'),nose=group.getObjectByName('Nose bridge and tip');
 if(!head||!nose)return;
 joinNoseToHead(nose,head);seatNostrils(group);
 const fit=(name,support,options)=>fitFaceLayer(group.getObjectByName(name),support,options);
 for(const side of [-1,1]){
  fit('Nostril '+side,nose,{relief:.0015});
  fit('Cheek plane '+side,head,{relief:.001});
  fit('Brow '+side,head,{relief:.003});
  fit('Eye socket '+side,head,{relief:.002});
  fit('Eye white '+side,group.getObjectByName('Eye socket '+side),{relief:.002});
  fit('Iris '+side,group.getObjectByName('Eye white '+side),{relief:.0015,silhouette:true});
  fit('Pupil '+side,group.getObjectByName('Iris '+side),{relief:.0015,silhouette:true});
  fit('Upper eyelid '+side,head,{relief:.006});
  fit('Ear recess '+side,group.getObjectByName('Ear '+side),{relief:.0015});
 }
 for(const name of ['Mouth closed seam','Lower lip','Chin plane'])fit(name,head,{relief:name==='Chin plane'?.001:.002});
 group.userData.faceConnections=true;
}
