import * as THREE from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';

/** Metres, Y up, front +Z. All primitives are closed volumes with outward faces.
 * Public API: kit(root) -> {box, beam, cylinder, cone, sphere, rock, torus,
 *   mesh, extrude, group, mat, feature}. Every geometry helper adds to root.
 * box(name, [x,y,z], [w,h,d], materialKey, bevel=0.025)
 * beam(name, from, to, width, depth, materialKey) aligns box Y between endpoints.
 * cylinder(name, position, radiusTop, radiusBottom, height, mat, sides=12)
 * cone(name, position, radius, height, mat, sides=8)
 * sphere/rock(name, position, [rx,ry,rz], mat, detail=1)
 * torus(name, position, radius, tube, mat, rotation=[0,0,0], segments=16), axis Z
 * mesh(name, BufferGeometry, mat), extrude(name, THREE.Shape, depth, mat)
 * group(name, position=[0,0,0]) -> child Group. Use kit(child) to build locally.
 * mat(key) -> owned MeshStandardMaterial. Named palette keys below or hex colors.
 * feature(...strings) records source features for human audit, not verification.
 */
export const colors = Object.freeze({
 stone:'#8a8b7d',stoneLight:'#b1ad97',stoneDark:'#626d67',flint:'#5c6967',mortar:'#77796b',
 slate:'#41596a',slateLight:'#647c86',slateDark:'#2d404c',thatch:'#ae853e',straw:'#cfac61',
 wood:'#705039',woodLight:'#96704b',woodDark:'#49372b',endgrain:'#b28a5a',plaster:'#d1c5a4',whitewash:'#dfd5b9',
 iron:'#333e43',steel:'#748488',brass:'#ad8643',copper:'#698878',rust:'#8e5838',
 cloth:'#a39470',red:'#8c443b',blue:'#526e81',green:'#687a4a',black:'#2f3237',rope:'#b69a66',
 leaf:'#61733c',leafLight:'#82944f',leafDark:'#394d2f',moss:'#6c754b',earth:'#6b543b',chalk:'#cbc6a9',
 flower:'#d1b079',flowerPink:'#b86869',flowerBlue:'#727c9c',bread:'#b98747',vegetable:'#809253',
 bone:'#c8b999',coal:'#292a29',ember:'#eb7734',flame:'#ffb75d',glass:'#dba95e',water:'#536d69',
});
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export function random(seed){let h=hash(String(seed));return()=>{h=(Math.imul(1664525,h)+1013904223)>>>0;return h/4294967296;};}
function bevelBox(w,h,d,b){
 b=Math.min(b,w*.18,h*.18,d*.18);
 if(b<=0)return new THREE.BoxGeometry(w,h,d);
 const p=[];
 for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
  p.push(new THREE.Vector3(x*w/2,y*(h/2-b),z*(d/2-b)),new THREE.Vector3(x*(w/2-b),y*h/2,z*(d/2-b)),new THREE.Vector3(x*(w/2-b),y*(h/2-b),z*d/2));
 }
 return new ConvexGeometry(p);
}
export function kit(root){
 const materials=root.userData._materials || new Map();
 // Keep nonserializable resources outside userData so GLB metadata stays compact.
 const owned=root.__structureMaterials ||= materials;
 function mat(key){
  if(key?.isMaterial)return key;
  if(!owned.has(key)){
   const metal=['iron','steel','brass','copper','rust'].includes(key),lit=['ember','flame','glass'].includes(key);
   const m=new THREE.MeshStandardMaterial({name:`Structure ${key}`,color:colors[key]||key,roughness:metal?.56:.9,metalness:metal?.65:0,flatShading:true,vertexColors:true,side:THREE.FrontSide,emissive:lit?(colors[key]||key):0,emissiveIntensity:lit?.8:0});
   m.userData.structureOwned=true;owned.set(key,m);
  }
  return owned.get(key);
 }
 function mesh(name,geometry,key){
  let g=geometry.index?geometry.toNonIndexed():geometry;
  if(g!==geometry)geometry.dispose();
  g.computeVertexNormals();const pos=g.attributes.position,n=g.attributes.normal,c=[];const rng=random(name);
  for(let i=0;i<pos.count;i+=3){const f=.94+rng()*.10+Math.max(-.035,Math.min(.035,n.getY(i)*.035));for(let j=0;j<3;j++)c.push(f,f,f);}
  g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
  const o=new THREE.Mesh(g,mat(key));o.name=name;o.castShadow=true;o.receiveShadow=true;o.userData.surface=typeof key==='string'?key:key.name;root.add(o);return o;
 }
 function box(name,p,s,key,b=.025){const o=mesh(name,bevelBox(...s,b),key);o.position.set(...p);return o;}
 function beam(name,a,b,w,d,key){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);const o=box(name,av.clone().add(bv).multiplyScalar(.5).toArray(),[w,delta.length()+Math.min(w,d)*.08,d],key,Math.min(w,d)*.10);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return o;}
 function cylinder(name,p,rt,rb,h,key,n=12){const o=mesh(name,new THREE.CylinderGeometry(rt,rb,h,n,1,false),key);o.position.set(...p);return o;}
 function sphere(name,p,s,key,detail=1){const o=mesh(name,new THREE.IcosahedronGeometry(1,detail),key);o.position.set(...p);o.scale.set(...s);return o;}
 function rock(name,p,s,key,detail=0){const g=new THREE.IcosahedronGeometry(1,detail),a=g.attributes.position;for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i);const f=.9+.12*Math.sin(x*7.31+y*5.42+z*9.17+hash(name)%31);a.setXYZ(i,x*f,y*f,z*f);}const o=mesh(name,g,key);o.position.set(...p);o.scale.set(...s);return o;}
 function torus(name,p,r,t,key,rot=[0,0,0],n=16){const o=mesh(name,new THREE.TorusGeometry(r,t,6,n),key);o.position.set(...p);o.rotation.set(...rot);return o;}
 function extrude(name,shape,depth,key){return mesh(name,new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:10,steps:1}),key);}
 function group(name,p=[0,0,0]){const o=new THREE.Group();o.name=name;o.position.set(...p);root.add(o);return o;}
 return {root,mat,mesh,box,beam,cylinder,cone:(name,p,r,h,key,n=8)=>cylinder(name,p,0,r,h,key,n),sphere,rock,torus,extrude,group,feature(...features){root.userData.features=[...new Set([...(root.userData.features||[]),...features])];}};
}
export function disposeStructure(root){const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])ms.add(m);if(o.__structureMaterials)for(const m of o.__structureMaterials.values())ms.add(m);});for(const g of gs)g.dispose();for(const m of ms){const textures=new Set([m.map,m.roughnessMap,m.metalnessMap,m.emissiveMap,m.normalMap,m.aoMap].filter(Boolean));for(const t of textures)t.dispose();m.dispose();}root.removeFromParent();}
