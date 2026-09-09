import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Shared masonry, lanterns and inlays, baked into three static draw batches. */
export function stairMeshBuilder({stone=0x9c927b,glow=0xffb75d}={}){
 const batches=[[],[],[]],materials=[
  new T.MeshStandardMaterial({name:'Cellar stair stone',color:stone,roughness:.92,vertexColors:true}),
  new T.MeshStandardMaterial({name:'Cellar stair bronze',color:0x9b743c,metalness:.45,roughness:.58}),
  new T.MeshStandardMaterial({name:'Cellar stair lantern glow',color:0xffd9a0,emissive:glow,emissiveIntensity:1.6,roughness:.7}),
 ];
 function add(geometry,material=0,tint=1){
  let g=geometry;
  if(g.index){g=g.toNonIndexed();geometry.dispose();}
  if(!g.attributes.normal)g.computeVertexNormals();
  if(!g.attributes.uv)g.setAttribute('uv',new T.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  if(material===0){const colors=new Float32Array(g.attributes.position.count*3);colors.fill(tint);g.setAttribute('color',new T.BufferAttribute(colors,3));}
  batches[material].push(g);
 }
 function box(x,y,z,w,h,d,material=0,tint=1){const g=new T.BoxGeometry(w,h,d);g.translate(x,y,z);add(g,material,tint);}
 function lantern(x,y,z){
  box(x,y+.08,z,.5,.15,.5,1);box(x,y+.46,z,.3,.65,.3,2);
  for(const dx of [-.23,.23])for(const dz of [-.23,.23])box(x+dx,y+.47,z+dz,.065,.76,.065,1);
  box(x,y+.88,z,.64,.14,.64,1);
 }
 function arch({z=-6.2,spring=-.72,inner=1.7,outer=2.27,bottom=-2.3,dark=.018}={}){
  const tunnel=new T.Shape();tunnel.moveTo(-outer+.02,bottom);tunnel.lineTo(outer-.02,bottom);tunnel.lineTo(outer-.02,spring);tunnel.absarc(0,spring,outer-.02,0,Math.PI,false);tunnel.closePath();
  const shadow=new T.ShapeGeometry(tunnel,12);shadow.translate(0,0,z+.23);add(shadow,0,dark);
  const jambWidth=outer-inner;
  for(const side of [-1,1])box(side*(inner+jambWidth/2),(bottom+spring)/2,z,jambWidth,spring-bottom,.65,0,.74);
  for(let i=0;i<11;i++){
   const a=i*Math.PI/11+.012,b=(i+1)*Math.PI/11-.012,vertices=[];
   for(const depth of [z+.34,z-.33])for(const [r,t] of [[inner,a],[outer,a],[outer,b],[inner,b]])vertices.push(r*Math.cos(t),spring+r*Math.sin(t),depth);
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
   g.setIndex([0,1,2,0,2,3,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]);add(g,0,i%2?.82:.96);
  }
 }
 function arrow(z=1.25){
  const shape=new T.Shape([[-.16,.1],[.16,.1],[.16,-.3],[.46,-.3],[0,-.78],[-.46,-.3],[-.16,-.3]].map(([x,z])=>new T.Vector2(x,-z)));
  const g=new T.ShapeGeometry(shape);g.rotateX(-Math.PI/2);g.translate(0,.023,z);add(g,1);
 }
 function finish(name){
  const group=new T.Group();group.name=name;
  for(let i=0;i<batches.length;i++){
   const geometry=mergeGeometries(batches[i]);for(const g of batches[i])g.dispose();
   const mesh=new T.Mesh(geometry,materials[i]);mesh.castShadow=i!==2;mesh.receiveShadow=true;group.add(mesh);
  }
  let disposed=false;
  return{group,dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const mesh of group.children){mesh.geometry.dispose();mesh.material.dispose();}}};
 }
 return{add,box,arch,arrow,lantern,finish};
}
