import * as THREE from 'three';
/** Small farm bird for the authored coop. Metres, Y up, facing +X like the studio animals. */
export const CHICKEN_CLIPS=['idle','walk','peck'];
export function createChicken(){
 const group=new THREE.Group();group.name='Coop hen';
 const coat=new THREE.MeshStandardMaterial({color:0xcda670,roughness:.95,flatShading:true}),red=new THREE.MeshStandardMaterial({color:0xad3b2c,roughness:.8}),gold=new THREE.MeshStandardMaterial({color:0x9d782f,roughness:.85}),dark=new THREE.MeshStandardMaterial({color:0x27251c,roughness:.7});
 const body=new THREE.Group();body.position.y=.23;group.add(body);
 const piece=(parent,shape,material,x,y,z)=>{const m=new THREE.Mesh(shape,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 const ellipsoid=(parent,material,x,y,z,sx,sy,sz)=>{const m=piece(parent,new THREE.IcosahedronGeometry(1,1),material,x,y,z);m.scale.set(sx,sy,sz);return m;};
 ellipsoid(body,coat,0,0,0,.19,.14,.12);
 for(const side of [-1,1])ellipsoid(body,coat,-.025,0,side*.10,.14,.1,.035);
 const tail=ellipsoid(body,coat,-.18,.10,0,.105,.15,.055);tail.rotation.z=.4;
 const head=new THREE.Group();head.position.set(.13,.085,0);body.add(head);
 ellipsoid(head,coat,.04,.06,0,.074,.105,.065);
 ellipsoid(head,red,.035,.16,0,.055,.031,.015);
 ellipsoid(head,red,.092,.016,0,.02,.031,.018);
 const beak=piece(head,new THREE.ConeGeometry(.021,.065,4),gold,.115,.06,0);beak.rotation.z=-Math.PI/2;
 for(const s of [-1,1])ellipsoid(head,dark,.081,.09,s*.046,.011,.011,.007);
 const legs=[];
 for(const side of [-1,1]){const leg=new THREE.Group();leg.position.set(0,.13,side*.055);group.add(leg);legs.push(leg);piece(leg,new THREE.CylinderGeometry(.009,.012,.115,5),gold,0,-.055,0);piece(leg,new THREE.BoxGeometry(.08,.016,.045),gold,.025,-.122,0);}
 group.userData.updateChicken=(time,clip='idle')=>{
  const walk=clip==='walk',phase=time*9,peck=walk?0:Math.max(0,Math.sin(time*2.1))**8;
  body.position.y=.23+(walk?Math.abs(Math.sin(phase))*.013:Math.sin(time*2)*.003);head.rotation.z=-peck*1.35;body.rotation.z=-peck*.22;
  legs.forEach((leg,i)=>leg.rotation.z=walk?Math.sin(phase+i*Math.PI)*.48:0);
 };
 return group;
}
