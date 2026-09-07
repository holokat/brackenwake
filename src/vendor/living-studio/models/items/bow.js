import {gem,grip,role} from './common.js';

const add=(a,b,scale=1)=>a.map((v,i)=>v+b[i]*scale);
const subtract=(a,b)=>a.map((v,i)=>v-b[i]);
const unit=v=>v.map(n=>n/Math.hypot(...v));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);

/** All limb sections share boundary rings, including the wood-to-tip joins. */
function limbSection(h,name,rings,from,to,material){
 const vertices=rings.slice(from,to+1).flat(),faces=[],sides=rings[0].length;
 for(let row=0;row<to-from;row++)for(let side=0;side<sides;side++){
  const a=row*sides+side,b=row*sides+(side+1)%sides;
  faces.push([a,b,b+sides,a+sides]);
 }
 faces.push(Array.from({length:sides},(_,i)=>sides-1-i),Array.from({length:sides},(_,i)=>(to-from)*sides+i));
 return h.mesh(name,vertices,faces,material,{variation:material==='wood_light'?.018:0});
}

function nockLoop(h,center,across,radius,name){
 const vertices=[],faces=[],segments=12,sides=5,cordRadius=.010;
 const tangent=[-across[2],0,across[0]];
 for(let i=0;i<segments;i++){
  const angle=i*Math.PI*2/segments,radial=[across[0]*Math.cos(angle),Math.sin(angle),across[2]*Math.cos(angle)];
  for(let j=0;j<sides;j++){
   const tube=j*Math.PI*2/sides;
   vertices.push(add(add(center,radial,radius+cordRadius*Math.cos(tube)),tangent,cordRadius*Math.sin(tube)));
  }
 }
 for(let i=0;i<segments;i++)for(let j=0;j<sides;j++)faces.push([i*sides+j,((i+1)%segments)*sides+j,((i+1)%segments)*sides+(j+1)%sides,i*sides+(j+1)%sides]);
 role(h.mesh(name,vertices,faces,'bowstring',{variation:0}),'cord');
 return add(center,across,radius);
}

export function buildBow(h,id){
 const long=id==='longbow',length=long?3.1:2.35;
 // Native +X follows the shooting direction when equipped. The open/string
 // side is -X, toward the drawing hand. Tips continue toward that side.
 const profile=long
  ?[[.69,-1,.023],[.53,-.88,.048],[.29,-.65,.069],[.09,-.35,.09],[0,0,.105],[.09,.35,.09],[.29,.65,.069],[.53,.88,.048],[.69,1,.023]]
  :[[.61,-1,.024],[.40,-.79,.059],[.14,-.48,.082],[0,0,.105],[.14,.48,.082],[.40,.79,.059],[.61,1,.024]];
 const points=profile.map(([x,z])=>[-x,0,z*length]),radii=profile.map(([, ,radius])=>radius);
 const middle=(points.length-1)/2;
 points.splice(middle,1,[0,0,-.24],[0,0,0],[0,0,.24]);radii.splice(middle,1,.101,.105,.101);
 const frames=points.map((point,i)=>{
  const tangent=unit(subtract(points[Math.min(i+1,points.length-1)],points[Math.max(i-1,0)]));
  return [tangent[2],0,-tangent[0]];
 });
 const rings=points.map((point,i)=>Array.from({length:6},(_,side)=>{
  const angle=side*Math.PI/3;
  return add(add(point,[0,-1,0],Math.cos(angle)*radii[i]),frames[i],Math.sin(angle)*radii[i]);
 }));
 limbSection(h,long?'Longbow recurved limbs':'Shortbow curved limbs',rings,1,rings.length-2,'wood_light');
 limbSection(h,'Bow limb cap lower',rings,0,1,'steel_dark');
 limbSection(h,'Bow limb cap upper',rings,rings.length-2,rings.length-1,'steel_dark');
 const attachments=[];
 for(const end of[0,points.length-1]){
  const neighbor=end===0?1:end-1,tip=points[end],root=points[neighbor];
  const along=unit(subtract(tip,root)),inset=.065,t=1-inset/Math.hypot(...subtract(tip,root));
  const center=mix(root,tip,t),across=unit([-Math.abs(along[2]),0,-Math.sign(tip[2])*Math.abs(along[0])]);
  const radius=radii[neighbor]+(radii[end]-radii[neighbor])*t;
  attachments.push(nockLoop(h,center,across,radius+.002,'Bow string nock '+(end===0?'lower':'upper')));
 }
 const center=mix(attachments[0],attachments[1],.5);
 role(h.tube('Taut bow string',[attachments[0],center,attachments[1]],.010,'bowstring',{sides:5,variation:0}),'cord');
 h.root.userData.bowConstruction={attachments,center};
 grip(h,{bottom:-.40,top:.22,radius:.118});
 gem(h,[0,-.115,.155],{size:.082});
}
