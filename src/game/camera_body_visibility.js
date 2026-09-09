/** Hide only the local rendered body when wall retraction puts the eye inside
 * its head. Lights and game state stay active; hysteresis prevents flicker. */
export function createCameraBodyVisibility(group){
 const masks=new Map();let hidden=false;
 function restore(){for(const [mesh,mask]of masks)mesh.layers.mask=mask;masks.clear();hidden=false;}
 return{
  update(distance){
   if(hidden&&distance>1.15){restore();return;}
   if(!hidden&&distance>=.8)return;
   hidden=true;
   group.traverse(o=>{if(o.isMesh&&!masks.has(o)){masks.set(o,o.layers.mask);o.layers.disable(0);}});
  },
  restore,
 };
}
