import * as THREE from 'three';
import {Geometry} from '../geometry.js';
import {mountedSurface,panelFootprint,stripFootprints} from './mounting.js';

/** Native Z-up construction; every applied part names the surface that carries it. */
export class ArmorShapes extends Geometry{
 constructor(root,profile){super(root);this.profile=profile;this.binding='torso';this.role=profile.role;this.side=undefined;}
 mesh(name,verts,faces,mat,options={}){
  const valid=[];
  for(const face of faces)for(let j=1;j<face.length-1;j++){
   const ids=[face[0],face[j],face[j+1]],a=new THREE.Vector3(...verts[ids[0]]),b=new THREE.Vector3(...verts[ids[1]]),c=new THREE.Vector3(...verts[ids[2]]);
   if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-12)valid.push(ids);
  }
  const mesh=super.mesh(name,verts,valid,mat,{...options,variation:0});
  mesh.userData={...mesh.userData,itemId:this.profile.id,wikiSlot:this.profile.item.slot,
   slot:this.profile.item.slot,materialRole:this.role,armorBinding:this.binding,armorSide:this.side};
  return mesh;
 }
 with(binding,role,fn,side){
  const previous=[this.binding,this.role,this.side];this.binding=binding;this.role=role;this.side=side;
  try{return fn();}finally{[this.binding,this.role,this.side]=previous;}
 }
 rootPart(mesh){mesh.userData.armorConstruction='shell';return mesh;}
 attached(mesh,...supports){
  mesh.userData.armorConstruction='attached';mesh.userData.armorSupports=supports.flat().map(s=>s.name);return mesh;
 }
 /** Open garments have a real inner wall and annular returns, not infinitely thin edges. */
 shell(name,rings,mat,{n=this.profile.sides,phase=0,thickness=.045,closedStart=false,closedEnd=false}={}){
  const vertices=[],faces=[];
  for(const inner of [false,true])for(let row=0;row<rings.length;row++)for(let i=0;i<n;i++){
   const[x,y,z,rx,ry]=rings[row],angle=phase+i*Math.PI*2/n;
   const endOffset=inner&&((row===0&&closedStart)||(row===rings.length-1&&closedEnd))?Math.sign(rings[row===0?1:row-1][2]-z)*thickness:0;
   vertices.push([x+(rx-(inner?thickness:0))*Math.sin(angle),y-(ry-(inner?thickness:0))*Math.cos(angle),z+endOffset]);
  }
  const count=n*rings.length;
  for(let row=0;row<rings.length-1;row++)for(let i=0;i<n;i++){
   const a=row*n+i,b=row*n+(i+1)%n,c=b+n,d=a+n;
   faces.push([a,b,c,d],[a+count,d+count,c+count,b+count]);
  }
  for(let i=0;i<n;i++){
   const j=(i+1)%n,last=(rings.length-1)*n;if(!closedStart)faces.push([i,j,j+count,i+count]);if(!closedEnd)faces.push([last+i,last+i+count,last+j+count,last+j]);
  }
  if(closedStart)faces.push(Array.from({length:n},(_,i)=>n-1-i),Array.from({length:n},(_,i)=>i+count));
  if(closedEnd){const last=(rings.length-1)*n;faces.push(Array.from({length:n},(_,i)=>last+i),Array.from({length:n},(_,i)=>last+count+n-1-i));}
  return this.rootPart(this.mesh(name,vertices,faces,mat));
 }
 band(name,z,rx,ry,height,mat,binding='torso',role=this.profile.role){
  return this.with(binding,role,()=>this.shell(name,[[0,.025,z-height/2,rx,ry],[0,.025,z+height/2,rx,ry]],mat,{thickness:.055}));
 }
 panel(name,outline,depth,mat){
  const verts=[...outline,...outline.map(([x,y,z])=>[x,y+depth,z])],n=outline.length;
  const faces=[Array.from({length:n},(_,i)=>n-1-i),Array.from({length:n},(_,i)=>i+n)];
  for(let i=0;i<n;i++)faces.push([i,(i+1)%n,(i+1)%n+n,i+n]);
  return this.mesh(name,verts,faces,mat);
 }
 /** Raycasts the actual polygon surface. Analytical ellipses miss the flat facets. */
 surface(support,x,z,side=-1){
  const ray=new THREE.Ray(new THREE.Vector3(x,side*30,z),new THREE.Vector3(0,-side,0));
  const p=support.geometry.attributes.position,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3();
  let closest=Infinity,point;
  for(let i=0;i<p.count;i+=3){
   a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
   if(ray.intersectTriangle(a,b,c,false,hit)){const distance=ray.origin.distanceToSquared(hit);if(distance<closest){closest=distance;point=hit.clone();}}
  }
  if(!point)throw new Error(`${this.profile.id}: ${support.name} has no mounting surface at ${x}, ${z}`);
  return point.toArray();
 }
 mountedPanel(name,outline,support,mat,options={}){
  return mountedSurface(this,name,panelFootprint(outline),support,mat,{thickness:.038,...options});
 }
 mountedStrip(name,path,width,support,mat,options={}){
  return mountedSurface(this,name,stripFootprints(path,width),support,mat,options);
 }
 thicken(name,vertices,faces,depth,mat){
  const count=vertices.length,all=[...vertices,...vertices.map(p=>typeof depth==='function'?depth(p):[p[0],p[1]+depth,p[2]])],edges=new Map();
  const closed=[...faces,...faces.map(face=>[...face].reverse().map(i=>i+count))];
  for(const face of faces)for(let i=0;i<face.length;i++){
   const a=face[i],b=face[(i+1)%face.length],key=[a,b].sort((a,b)=>a-b).join(':');
   if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);
  }
  for(const[a,b]of edges.values())closed.push([a,b,b+count,a+count]);
  return this.mesh(name,all,closed,mat);
 }
 rivet(name,x,z,support,{side=-1,radius=.047,mat='steel_edge'}={}){
  const p=this.surface(support,x,z,side),base=[p[0],p[1]-side*.012,p[2]],end=[p[0],p[1]+side*.048,p[2]];
  return this.attached(this.tube(name,[base,end],[radius,radius*.76],mat,{sides:6}),support);
 }
 mail(name,support,{cx=0,z=5.6,width=.7,height=.48,side=-1,radius}={}){
  const chain=this.profile.tier==='chain',r=radius??(chain?.035:.049),spacing=r*1.9,vertices=[],faces=[];
  const columns=Math.max(2,Math.floor(width/spacing)),rows=Math.max(2,Math.floor(height/spacing));
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
   const cz=z+(row-(rows-1)/2)*spacing,x=(typeof cx==='function'?cx(cz):cx)+(col-(columns-1)/2+(row%2?.19:-.19))*spacing,start=vertices.length,ring=[];
   let mounted=true;
   for(let k=0;k<6;k++)for(let j=0;j<3;j++){
    const a=k*Math.PI/3,b=j*Math.PI*2/3,rr=r+Math.cos(b)*.009;
    try{const point=this.surface(support,x+Math.cos(a)*rr,cz+Math.sin(a)*rr,side);point[1]+=side*(.001+Math.sin(b)*.012);ring.push(point);}catch{mounted=false;}
   }
   if(!mounted)continue;vertices.push(...ring);
   for(let k=0;k<6;k++)for(let j=0;j<3;j++)faces.push([start+k*3+j,start+((k+1)%6)*3+j,start+((k+1)%6)*3+(j+1)%3,start+k*3+(j+1)%3]);
  }
  const mesh=this.attached(this.mesh(name,vertices,faces,this.profile.material),support);mesh.userData.armorSurfaceWrap={side,radius:r};return mesh;
 }
}

export function constructionAccent(h,{support,x=0,z=5.62,width=.64,height=.28,binding='torso',side,face=-1}={}){
 const p=h.profile;if(!support)throw new Error(`${p.id}: construction detail needs a mounting shell`);
 return h.with(binding,p.role,()=>{
  if(p.tier==='studded')h.with(binding,'metal',()=>{
   for(const s of[-1,1])h.rivet(`Set rivet ${support.name} ${s}`,x+s*width*.34,z,support,{side:face});
  },side);
  if(['ring','chain'].includes(p.tier)){
   const sign=x<0?-1:1,slot=p.item.slot;
   const coverage={
    head:{cx:0,z:7.926,width:.63,height:.10,radius:p.tier==='chain'?.021:.029},
    chest:{cx:0,z:5.24,width:1.04,height:1.65,radius:p.tier==='chain'?.039:.058},
    hands:{cx:x,z:3.76,width:.25,height:.27,radius:p.tier==='chain'?.020:.027},
    wrists:{cx:x,z:4.42,width:.32,height:.42,radius:p.tier==='chain'?.023:.031},
    waist:{cx:0,z:4.40,width:1.34,height:.21,radius:p.tier==='chain'?.022:.031},
    legs:{cx:cz=>sign*(.94-.125*cz),z:2.12,width:.31,height:2.67,radius:p.tier==='chain'?.025:.036},
    feet:{cx:x,z:.83,width:.38,height:.29,radius:p.tier==='chain'?.022:.031},
    back:{cx:0,z:5.08,width:1.35,height:1.68,radius:p.tier==='chain'?.04:.057},
   }[slot];
   h.mail(`${p.tier} woven coverage on ${support.name}`,support,{...coverage,side:face});
   if(slot==='head')h.mail(`${p.tier} coif nape coverage`,support,{cx:0,z:7.42,width:.70,height:.84,side:1,radius:p.tier==='chain'?.028:.039});
  }
  if(p.role==='leather'&&p.hideGrade==='scaledHide'){
   for(let k=0;k<2;k++)h.mountedPanel(`Lapped hide reinforcement ${support.name} ${k}`,[[x-width*.43,z+height*.46-k*height*.36],[x+width*.43,z+height*.46-k*height*.36],[x+width*.35,z-height*.06-k*height*.36],[x,z-height*.23-k*height*.36],[x-width*.35,z-height*.06-k*height*.36]],support,p.material,{side:face,thickness:.065-k*.024});
  }
  if(p.role==='leather'&&p.hideGrade==='thickHide')h.mountedStrip(`Heavy hide binding ${support.name}`,[[x,z-height*.3],[x,z+height*.3]],width*.7,support,'leather_light',{side:face,thickness:.055});
 },side);
}
