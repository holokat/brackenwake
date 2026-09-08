export function disposeCharacter(actor){
 const materials=new Set();
 actor.group.traverse(mesh=>{
  mesh.geometry?.dispose();if(!mesh.isMesh)return;
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   if(material.userData.ownedByCharacter||material.userData.itemOwned||material.userData.ownedByItem||material.userData.originalColor)materials.add(material);
  }
 });
 for(const material of materials)material.dispose();
 actor.rig?.skeleton.dispose();actor.group.removeFromParent();
}
