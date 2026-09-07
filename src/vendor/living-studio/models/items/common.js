import * as THREE from 'three';
import {Geometry} from '../geometry.js';

const roles={steel:'metal',steel_edge:'metal',steel_dark:'metal',gold:'trim',wood:'wood',wood_light:'wood',leather:'leather',leather_dark:'leather',leather_light:'leather',crystal:'gem',crystal_light:'gem',bowstring:'cord',red:'cloth',blue:'cloth',violet:'cloth',cloth_dark:'cloth',skin:'skin'};

/** A model owns its buffers and materials; the shared palette never gets edited. */
export function itemBuilder(id,kind='weapon'){
 const root=new THREE.Group();root.name=id;root.userData={itemId:id,wikiId:id,kind,slot:kind==='shield'?'offhand':'weapon',nativeUp:'Z',grip:[0,0,0]};
 const h=new Geometry(root);h.part=kind==='shield'?'offhand':'weapon';
 return {root,h};
}

export function finishItem(root){
 const copies=new Map();
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const source=mesh.material;
  const materialRole=mesh.userData.materialRole||roles[mesh.userData.materialKey]||'trim';
  if(!copies.has(source))copies.set(source,new Map());
  const roleCopies=copies.get(source);
  if(!roleCopies.has(materialRole)){
   const copy=source.clone();
   copy.userData={...source.userData,originalColor:source.color.clone(),itemOwned:true,loadoutOwned:true};
   roleCopies.set(materialRole,copy);
  }
  mesh.material=roleCopies.get(materialRole);
  mesh.userData.slot=root.userData.slot;
  mesh.userData.materialRole=materialRole;
 });
 return root;
}

export function role(mesh,value){mesh.userData.materialRole=value;return mesh;}

/** Extrude an X/Z silhouette with correctly triangulated concave faces. */
export function plate(h,name,outline,depth,mat,{y=0,materialRole,holes=[]}={}){
 const points=[...outline,...holes.flat()],n=points.length,v=[...points.map(([x,z])=>[x,y-depth/2,z]),...points.map(([x,z])=>[x,y+depth/2,z])];
 const triangles=THREE.ShapeUtils.triangulateShape(outline.map(([x,z])=>new THREE.Vector2(x,z)),holes.map(ring=>ring.map(([x,z])=>new THREE.Vector2(x,z))));
 const faces=triangles.flatMap(t=>[t,[...t].reverse().map(i=>i+n)]);
 let offset=0;
 for(const ring of[outline,...holes]){
  for(let i=0;i<ring.length;i++){const a=offset+i,b=offset+(i+1)%ring.length;faces.push([a,b,b+n,a+n]);}
  offset+=ring.length;
 }
 const mesh=h.mesh(name,v,faces,mat,{variation:.018});
 if(materialRole)role(mesh,materialRole);
 return mesh;
}

export function grip(h,{bottom=-.3,top=.3,radius=.095,mat='leather_dark'}={}){
 const shafts=h.root.children.filter(mesh=>mesh.isMesh&&['wood','bone'].includes(mesh.userData.materialRole||roles[mesh.userData.materialKey]));
 h.root.updateMatrixWorld(true);
 for(const z of[bottom,(bottom+top)/2,top])for(let i=0;i<8;i++){
  const a=i*Math.PI/4,direction=new THREE.Vector3(Math.sin(a),-Math.cos(a),0);
  const ray=new THREE.Raycaster(direction.clone().multiplyScalar(2).setZ(z),direction.clone().negate(),0,2);
  const hit=ray.intersectObjects(shafts,false)[0];
  if(hit)radius=Math.max(radius,Math.hypot(hit.point.x,hit.point.y)/.9+.012);
 }
 h.loft('Leather hand grip',[[0,0,bottom,radius*.9,radius*.9],[0,0,top,radius,radius]],mat,{n:8,variation:.018});
 // A shallow spiral is seated into the core, with only its raised seam exposed.
 const turns=Math.max(3,Math.round((top-bottom)/.105)),points=Array.from({length:turns*8+1},(_,i)=>{
  const t=i/(turns*8),a=t*turns*Math.PI*2,r=radius*(.9+t*.1);
  return[Math.sin(a)*r,-Math.cos(a)*r,bottom+.025+t*(top-bottom-.05)];
 });
 role(h.tube('Grip winding seam',points,.009,mat,{sides:4,variation:0}),'leather');
 for(const z of[bottom,top])h.loft('Grip ferrule',[[0,0,z-.025,radius*1.16,radius*1.16],[0,0,z+.025,radius*1.16,radius*1.16]],'steel_dark',{n:8,variation:0});
}

/** A cutting bevel joins the core at full depth and narrows to a real edge. */
export function cuttingBevel(h,name,inner,outer,{thickness=.15,edge=.012,mat='steel_edge'}={}){
 const n=inner.length,points=[...inner,...outer],v=[...points.map(([x,z],i)=>[x,-(i<n?thickness:edge)/2,z]),...points.map(([x,z],i)=>[x,(i<n?thickness:edge)/2,z])],f=[];
 for(let i=0;i<n-1;i++){
  f.push([i,n+i,n+i+1,i+1],[2*n+i+1,3*n+i+1,3*n+i,2*n+i]);
  f.push([i,i+1,2*n+i+1,2*n+i],[n+i,3*n+i,3*n+i+1,n+i+1]);
 }
 f.push([0,2*n,3*n,n],[n-1,2*n-1,4*n-1,3*n-1]);
 return h.mesh(name,v,f,mat,{variation:.008});
}

export function shaft(h,bottom,top,{radius=.09,mat='wood',name='Wooden shaft',taper=mat.startsWith('wood')?.88:1}={}){
 return h.tube(name,[[0,0,bottom],[0,0,top]],[radius,radius*taper],mat,{sides:8,variation:.018});
}

export function gem(h,center,{size=.13,mat='crystal',name='Inset gemstone',alignToSurface=true}={}){
 const[x,requestedY,z]=center;
 // Seat against actual polygons, including sloped forehead and pommel facets.
 h.root.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(x,requestedY-.12,z),new THREE.Vector3(0,1,0),0,.27);
 const hosts=h.root.children.filter(mesh=>mesh.isMesh&&!['gem','recess','feather','cord','flame'].includes(mesh.userData.materialRole||roles[mesh.userData.materialKey]));
 const surface=ray.intersectObjects(hosts,false)[0];
 const y=surface?surface.point.y-.002:requestedY;
 const start=h.root.children.length;
 // The caller supplies a mounting surface. The bezel embeds behind that plane;
 // the stone pavilion sits inside it instead of hovering in front of an ico.
 const ring=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return[x+Math.sin(a)*size*1.12,z+Math.cos(a)*size*1.12];});
 role(plate(h,name+' socket',ring,size*.58,'gold',{y:y+size*.12}),'trim');
 const vertices=[[x,y-size*.43,z],...ring.map(([px,pz])=>[x+(px-x)*.83,y-size*.08,z+(pz-z)*.83]),[x,y+size*.2,z]];
 const faces=Array.from({length:8},(_,i)=>[[0,i+1,(i+1)%8+1],[9,(i+1)%8+1,i+1]]).flat();
 const stone=role(h.mesh(name,vertices,faces,mat,{variation:0}),'gem');
 if(surface?.face&&alignToSurface){
  const normal=surface.face.normal.clone().transformDirection(surface.object.matrixWorld);
  if(normal.y>0)normal.negate();
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0),normal);
  for(const mesh of h.root.children.slice(start)){mesh.geometry.translate(-x,-y,-z);mesh.geometry.applyQuaternion(rotation);mesh.geometry.translate(x,y,z);}
 }
 return stone;
}

export function blade(h,{base=.4,length=2.1,width=.16,thickness=.062,x=0,name='Ridged blade',mat='steel_edge'}={}){
 const end=base+length,shoulder=base+length*.83;
 const v=[[x-width,0,base],[x,-thickness,base],[x+width,0,base],[x,thickness,base],[x-width*.76,0,shoulder],[x,-thickness*.7,shoulder],[x+width*.76,0,shoulder],[x,thickness*.7,shoulder],[x,0,end]];
 return h.mesh(name,v,[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,8],[5,6,8],[6,7,8],[7,4,8],[3,2,1,0]],mat,{variation:.018});
}

export function loop(h,name,center,rx,rz,radius,mat,{segments=12}={}){
 const[x,y,z]=center;
 const sides=6,v=[],faces=[];
 for(let i=0;i<segments;i++){
  const a=i*Math.PI*2/segments,normal=new THREE.Vector3(Math.cos(a)/rx,0,Math.sin(a)/rz).normalize();
  for(let k=0;k<sides;k++){const b=k*Math.PI*2/sides;v.push([x+Math.cos(a)*rx+normal.x*Math.cos(b)*radius,y+Math.sin(b)*radius,z+Math.sin(a)*rz+normal.z*Math.cos(b)*radius]);}
 }
 for(let i=0;i<segments;i++)for(let k=0;k<sides;k++)faces.push([i*sides+k,i*sides+(k+1)%sides,((i+1)%segments)*sides+(k+1)%sides,((i+1)%segments)*sides+k]);
 return h.mesh(name,v,faces,mat,{variation:0});
}

export function disposeItem(root){
 const geometries=new Set(),materials=new Set();
 root.traverse(mesh=>{if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.isMesh)for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(mat.userData.itemOwned||mat.userData.loadoutOwned)materials.add(mat);});
 for(const g of geometries)g.dispose();for(const mat of materials)mat.dispose();
 root.removeFromParent();
}
