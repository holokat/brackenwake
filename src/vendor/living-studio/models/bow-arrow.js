import * as THREE from 'three';
import {itemBuilder,finishItem} from './items/common.js';
import {buildAmmunition} from './items/ammunition.js';

const arrows=new WeakMap();
/** A private nocked arrow shares no resources with the library or spell projectiles. */
export function poseBowArrow(item,{visible=false,load=0,length=3.12}={}){
 let arrow=arrows.get(item)||item.children.find(child=>child.userData.archeryArrow);
 if(!arrow){
  const {root,h}=itemBuilder('nocked-arrow','ammunition');buildAmmunition(h,'arrow');arrow=finishItem(root);
  arrow.name='Archery nocked arrow';arrow.traverse(object=>{object.userData.archeryArrow=true;});
  arrow.rotation.y=Math.PI/2;item.add(arrow);arrows.set(item,arrow);
 }
 arrows.set(item,arrow);
 const nock=new THREE.Vector3(...item.userData.bowDraw.center);
 const scale=length/2.52;
 arrow.scale.set(.62,.62,scale);
 // The opening between the forked nock ends is native arrow Z=-1.15.
 arrow.position.copy(nock).add(new THREE.Vector3(1.15*scale,0,0));arrow.visible=visible;
 item.userData.bowArrow={nock:nock.toArray(),tip:[nock.x+length,nock.y,0],direction:[1,0,0],visible,load};
 return arrow;
}
