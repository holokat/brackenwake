import {role} from './common.js';
import {material} from '../geometry.js';
import * as THREE from 'three';

export const shieldSteel=material('steel').clone();
shieldSteel.name='Shield steel';shieldSteel.color.set('#92999e');

/** Solid curved panel. The rear stays flat so hardware seats on one real plane. */
export function shieldPanel(h,name,outline,front,back,mat){
 const n=outline.length,center=outline.reduce((s,p)=>[s[0]+p[0]/n,s[1]+p[1]/n],[0,0]);
 const verts=[...outline.map(([x,z])=>[x,front(x),z]),...outline.map(([x,z])=>[x,typeof back==='function'?back(x):back,z]),
  [center[0],front(center[0]),center[1]],[center[0],typeof back==='function'?back(center[0]):back,center[1]]];
 const faces=[];
 for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([2*n,j,i],[2*n+1,n+i,n+j],[i,j,n+j,n+i]);}
 const mesh=h.mesh(name,verts,faces,mat,{variation:mat===shieldSteel?.05:.035});
 if(mat===shieldSteel)role(mesh,'metal');return mesh;
}

/** Clip boards to the actual outline; narrow seams expose the solid backing. */
function clipX(polygon,x,greater){
 const out=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],inside=p=>greater?p[0]>=x:p[0]<=x;
  if(inside(a))out.push(a);
  if(inside(a)!==inside(b)){const t=(x-a[0])/(b[0]-a[0]);out.push([x,a[1]+(b[1]-a[1])*t]);}
 }
 return out;
}
export function shieldBoards(h,outline,width,front,{count=7,contact=false}={}){
 for(let i=0;i<count;i++){
  const left=-width+i*width*2/count+.003,right=-width+(i+1)*width*2/count-.003;
  const polygon=clipX(clipX(outline,left,true),right,false);if(polygon.length<3)continue;
  const mesh=shieldPanel(h,'Wood face board '+(i+1),polygon,x=>front(x)-.012,x=>front(x)+.026,'wood_light');
  mesh.userData.construction='wood';if(contact&&i===Math.floor(count/2))mesh.userData.shieldContact=true;
  const rear=shieldPanel(h,'Wood back board '+(i+1),polygon,()=>.052,.076,'wood_light');rear.userData.construction='wood';
 }
}

/** Fasten to the host's actual triangulated surface, including curved panels. */
export function shieldRivet(h,name,x,z,host,{radius=.025,construction}={}){
 h.root.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(x,-2,z),new THREE.Vector3(0,1,0),0,4);
 const hit=ray.intersectObject(host,false)[0];
 if(!hit)throw new Error('Shield rivet misses its host: '+name);
 const rivet=h.ico(name,[x,hit.point.y-radius*.4,z],[radius,radius,radius],'steel',{sub:1,variation:0});
 if(construction)rivet.userData.construction=construction;return rivet;
}

export function shieldRim(h,outline,front){
 const n=outline.length,inner=outline.map(([x,z])=>[x*.915,z*.915]);
 const verts=[...outline.map(([x,z])=>[x,front(x)-.025,z]),...inner.map(([x,z])=>[x,front(x)-.025,z]),
  ...outline.map(([x,z])=>[x,.088,z]),...inner.map(([x,z])=>[x,.088,z])];
 const faces=[];
 for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([i,j,n+j,n+i],[2*n+j,2*n+i,3*n+i,3*n+j],[j,i,2*n+i,2*n+j],[n+i,n+j,3*n+j,3*n+i]);}
 return role(h.mesh('Continuous folded metal rim',verts,faces,'steel_edge',{variation:.012}),'metal');
}

export function applyShieldConstruction(root,construction='wood'){
 if(!root.userData.shieldShape)return;
 if(!['wood','metal'].includes(construction))throw new RangeError('Unknown shield construction: '+construction);
 root.userData.construction=construction;
 root.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.construction)mesh.visible=mesh.userData.construction===construction;});
}
