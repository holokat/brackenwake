// Measured from the reviewed mill's named axle socket after its export fit.
// Coordinates are in the metre-scale source model, before placement scale.
export const MILL_SOCKET = Object.freeze([4.9463908623,2.7964105746,-.1855512836]);
export function attachmentFor(piece,plan) {
 if(piece.model!=='mill_wheel'||piece.on!=='mill')return null;
 const parent=plan.pieces.find(p=>p.model==='mill');if(!parent)return null;
 const k=parent.scale??1,yaw=(parent.yaw||0)*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw);
 return {parent,x:parent.x+(MILL_SOCKET[0]*c+MILL_SOCKET[2]*s)*k,z:parent.z+(MILL_SOCKET[2]*c-MILL_SOCKET[0]*s)*k,y:MILL_SOCKET[1]*k,yaw:parent.yaw||0};
}
