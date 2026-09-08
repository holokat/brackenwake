/** Fit catalog weapons to the compact cast without changing standalone library items. */
export function fitChibiEquipment(rig,item,slot){
 if(rig.style!=='chibi')return;
 const id=item.userData.itemId,kind=rig.group.userData.classId;
 if(['shortbow','longbow'].includes(id))item.scale.setScalar(.76);
 if(['longsword','shortsword','rapier'].includes(id))item.scale.set(1.22,1.15,.90);
 if(slot==='offhand'&&item.userData.shieldShape)item.scale.setScalar(1.22);
 if(id==='staff'&&kind==='wizard'){
  recolor(item,m=>m.userData.materialRole==='gem','#619cfa',{metalness:.05,roughness:.28,emissive:'#164a9d',emissiveIntensity:.30});
  recolor(item,m=>m.name==='Open staff crown','#765137',{metalness:0,roughness:.85});
 }
 if(id==='heater'&&kind==='warrior'){
  item.traverse(mesh=>{
   if(mesh.isMesh&&mesh.userData.construction)mesh.visible=mesh.userData.construction==='metal';
  });
  item.userData.construction='metal';
  recolor(item,m=>m.name==='Faceted metal shield field','#873e42',{metalness:.12,roughness:.72});
 }
}
function recolor(item,predicate,color,finish){
 const materials=new Map();
 item.traverse(mesh=>{
  if(!mesh.isMesh||!predicate(mesh))return;
  if(!materials.has(mesh.material)){
   const material=mesh.material.clone();material.color.set(color);
   for(const[key,value]of Object.entries(finish)){
    if(key==='emissive')material.emissive.set(value);else material[key]=value;
   }
   material.userData={...material.userData,originalColor:material.color.clone(),itemOwned:true,loadoutOwned:true};
   materials.set(mesh.material,material);
  }
  mesh.material=materials.get(mesh.material);
 });
 // The removed shared source remains in use elsewhere or is disposed here.
 const used=new Set();item.traverse(m=>{if(m.isMesh)used.add(m.material);});
 for(const source of materials.keys())if(!used.has(source))source.dispose();
}
