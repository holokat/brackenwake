import {Geometry} from './geometry.js';
import {resolveHairstyle} from '../data/hairstyles.js';

const TAU=Math.PI*2;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Coordinates match the original head before the female body morph, with Z up
// and the face looking toward negative Y. Each cap is a closed volume. Its lower
// edge follows the forehead, clears the ears, and covers the rear of the skull.
function cap(h,name,{
 front=7.76,temple=7.55,nape=7.25,width=.405,depth=.386,
 top=8.025,fullness=1,scallop=0,bob=false,parted=false,
}={}){
 const n=16,vertices=[],faces=[];
 // The upper skull narrows and moves rearward. Sampling that contour avoids a
 // straight cylindrical side wall while keeping its high rear edge enclosed.
 const profile=bob?[
  [7.00,.47,.035,.405],[7.44,.545,.025,.43],[7.70,.475,.015,.402],
  [7.88,.35,.060,.34],[top-.055,.24,.11,.255],[top-.012,.09,.13,.12],
 ]:[
  [7.00,.345,.01,.365],[7.40,.410,.005,.375],[7.63,.408,.005,.38],
  [7.77,.383,.022,.362],[7.88,.335,.065,.319],
  [top-.055,.235,.11,.245],[top-.012,.09,.13,.12],
 ];
 function contour(z){
  let k=0;while(k<profile.length-2&&z>profile[k+1][0])k++;
  const a=profile[k],b=profile[k+1],t=clamp((z-a[0])/(b[0]-a[0]),0,1);
  return [1,2,3].map(index=>a[index]+(b[index]-a[index])*t);
 }
 for(let row=0;row<5;row++)for(let i=0;i<n;i++){
  const angle=i*TAU/n,frontness=Math.cos(angle),s=Math.sin(angle);
  let z=frontness>=0?temple+(front-temple)*frontness**2:nape+(temple-nape)*(1+frontness);
  if(bob){
   // Jaw-length sides meet the fringe in front of the ears, leaving the face open.
   const fringe=clamp((frontness-.42)/.43,0,1);
   z=7.03+.035*Math.abs(s)+.73*fringe;
  }
  if(row===1)z=Math.max(bob?7.44:7.63,z+.035);
  if(row===2)z=Math.max(7.77,z+.055);
  if(row===3)z=7.88;
  if(row===4)z=top-.035;
  const [radius,centerY,yRadius]=contour(z);
  const radial=(1+scallop*Math.cos(angle*8))*(row>0?fullness:1);
  let x=radius*(bob?1:width/.405)*s*radial;
  const y=centerY-yRadius*(bob?1:depth/.386)*frontness*radial;
  if(parted){
   const crownWeight=clamp((z-7.90)/.18,0,1);
   x-=.045*crownWeight;
   z+=.022*Math.max(0,-s)*crownWeight-.03*Math.exp(-(((x-.09)/.055)**2))*crownWeight;
  }
  vertices.push([x,y,z]);
 }
 const crown=vertices.push([parted?-.08:0,.13,top])-1;
 const inner=vertices.push([0,.025,7.53])-1;
 for(let row=0;row<4;row++)for(let i=0;i<n;i++){
  const a=row*n+i,b=row*n+(i+1)%n,c=(row+1)*n+(i+1)%n,d=(row+1)*n+i;
  faces.push([a,b,c],[a,c,d]);
 }
 for(let i=0;i<n;i++){
  faces.push([4*n+i,4*n+(i+1)%n,crown]);
  faces.push([(i+1)%n,i,inner]);
 }
 return h.mesh(name,vertices,faces,'hair',{variation:.018});
}

// A handful of broad planar locks creates a readable silhouette without strands.
function lock(h,name,outline,crest,inside){
 const vertices=[...outline,crest,inside],faces=[],length=outline.length;
 for(let i=0;i<length;i++){
  faces.push([i,(i+1)%length,length]);
  faces.push([(i+1)%length,i,length+1]);
 }
 return h.mesh(name,vertices,faces,'hair',{variation:.018});
}

function tie(h,name,rings){
 return h.loft(name,rings,'leather_dark',{n:10,variation:.012});
}

function closeCrop(h){
 cap(h,'Close crop scalp',{front:7.75,temple:7.52,nape:7.26,top:7.995});
}

function sidePart(h){
 cap(h,'Side part scalp',{top:8.08,parted:true});
 lock(h,'Side part broad sweep',[
  [-.365,-.12,7.78],[-.265,-.275,7.88],[-.10,-.235,7.965],
  [.09,-.245,7.93],[.07,-.32,7.79],[-.26,-.285,7.76],
 ],[-.135,-.23,7.945],[-.10,-.075,7.80]);
}

function curlyCrop(h){
 cap(h,'Curly crop scalp',{front:7.74,top:8.055,fullness:1.055});
 for(let i=0;i<8;i++){
  const angle=i*TAU/8;
  h.ico(`Curly crop crown ${i+1}`,[.29*Math.sin(angle),.055-.255*Math.cos(angle),7.89+.075*Math.cos(angle)],
   [.178,.175,.20],'hair',{sub:2,variation:.025});
 }
 h.ico('Curly crop top',[0,.025,8.075],[.245,.24,.145],'hair',{sub:2,variation:.025});
}

function topKnot(h){
 cap(h,'Top knot close sides',{front:7.78,temple:7.54,top:8.015});
 h.loft('Top knot gathered crown',[[0,.075,7.94,.255,.25],[0,.08,8.055,.165,.17],[0,.085,8.13,.15,.16]],'hair',{n:10,variation:.02});
 tie(h,'Top knot leather tie',[[0,.085,8.035,.163,.17],[0,.085,8.08,.165,.172]]);
 h.ico('Top knot folded bun',[0,.105,8.19],[.18,.21,.18],'hair',{sub:2,variation:.018});
}

function tiedLocs(h){
 cap(h,'Tied locs scalp',{front:7.78,temple:7.53,top:8.015});
 for(let i=0;i<5;i++){
  const x=(i-2)*.132,edge=Math.abs(i-2);
  h.tube(`Tied locs swept section ${i+1}`,[
   [x,-.26+edge*.035,7.84-edge*.02],
   [x*.90,.02,8.025-edge*.045],
   [x*.80,.27,7.98-edge*.03],
   [x*.44,.405,7.80],
  ],[.07,.079,.078,.065],'hair',{sides:7,variation:.018});
 }
 for(let i=0;i<4;i++){
  const x=(i-1.5)*.09;
  h.tube(`Tied locs tail ${i+1}`,[
   [x,.405,7.83],[x*1.2,.515,7.57],
   [x*1.4,.535+(i%2)*.045,7.29],
   [x*1.45+.015,.47+(i%2)*.09,7.02+(i%2)*.075],
  ],[.072,.075,.07,.054],'hair',{sides:7,variation:.018});
 }
 tie(h,'Tied locs leather tie',[[0,.432,7.735,.185,.105],[0,.448,7.67,.18,.108]]);
}

function pixie(h){
 cap(h,'Pixie scalp',{front:7.77,temple:7.56,nape:7.32,top:8.025});
 lock(h,'Pixie side fringe',[
  [-.375,-.155,7.75],[-.245,-.285,7.90],[.13,-.26,7.955],
  [.30,-.17,7.86],[-.22,-.33,7.69],[-.385,-.1,7.54],
 ],[-.10,-.215,7.995],[-.055,-.08,7.85]);
 lock(h,'Pixie temple taper',[
  [.34,-.17,7.81],[.405,-.075,7.69],[.395,-.095,7.43],[.335,-.165,7.57],
 ],[.408,-.115,7.67],[.36,-.09,7.64]);
}

function bob(h){
 cap(h,'Bob rounded curtain',{bob:true,top:8.045});
 lock(h,'Bob side fringe',[
  [-.39,-.15,7.75],[-.30,-.24,7.87],[-.10,-.235,7.94],
  [.19,-.245,7.88],[.32,-.185,7.76],[-.10,-.335,7.735],[-.35,-.27,7.49],
 ],[-.135,-.25,7.90],[-.10,-.17,7.84]);
}

function longBraid(h){
 cap(h,'Long braid swept scalp',{front:7.79,temple:7.56,nape:7.30,top:8.055});
 lock(h,'Long braid side sweep',[
  [-.37,-.13,7.78],[-.24,-.265,7.89],[.12,-.25,7.955],
  [.30,-.17,7.88],[.13,-.325,7.78],[-.25,-.285,7.75],
 ],[-.015,-.23,7.975],[-.035,-.1,7.86]);
 h.loft('Long braid gathered nape',[[0,.32,7.72,.27,.20],[0,.43,7.48,.18,.16],[0,.485,7.34,.135,.13]],'hair',{n:10,variation:.018});
 // Five broad crossing sections read as a plait at the normal studio zoom.
 for(let i=0;i<5;i++){
  const z=7.43-i*.225,r=.127-i*.012,side=i%2?-1:1;
  h.tube(`Long braid plait ${i+1}`,[[side*r*.62,.48,z],[-side*r*.65,.545,z-.125],[side*r*.25,.50,z-.27]],
   [r,r*.92,r*.8],'hair',{sides:7,variation:.02});
 }
 tie(h,'Long braid leather tie',[[.01,.515,6.31,.085,.089],[.01,.515,6.245,.084,.088]]);
 h.loft('Long braid tapered end',[[.01,.515,6.27,.086,.085],[.025,.52,6.14,.081,.079],[.04,.50,6.02,.032,.035]],'hair',{n:7,variation:.02});
}

function roundedCurls(h){
 cap(h,'Rounded curls volume',{front:7.78,temple:7.49,nape:7.38,width:.475,depth:.43,top:8.26,scallop:.018});
 for(let i=0;i<9;i++){
  const angle=i*TAU/9;
  h.ico(`Rounded curls outer lobe ${i+1}`,[.412*Math.sin(angle),.045-.338*Math.cos(angle),7.76+.22*Math.cos(angle)],
   [.222,.221,.29],'hair',{sub:2,variation:.018});
 }
 for(let i=0;i<3;i++){
  const angle=i*TAU/3+.4;
  h.ico(`Rounded curls crown ${i+1}`,[.19*Math.sin(angle),.045-.15*Math.cos(angle),8.195],
   [.245,.245,.215],'hair',{sub:2,variation:.018});
 }
 h.ico('Rounded curls upper back',[0,.33,8.035],[.31,.205,.27],'hair',{sub:2,variation:.018});
}

function highBun(h){
 cap(h,'High bun swept scalp',{front:7.79,temple:7.55,nape:7.29,top:8.065});
 h.loft('High bun gathered crown',[[0,.085,7.94,.29,.27],[0,.10,8.085,.175,.18],[0,.105,8.18,.17,.18]],'hair',{n:10,variation:.018});
 tie(h,'High bun leather tie',[[0,.105,8.085,.183,.19],[0,.105,8.14,.185,.192]]);
 h.ico('High bun coiled volume',[0,.115,8.305],[.277,.264,.255],'hair',{sub:2,variation:.018});
}

const builders={
 male:{close_crop:closeCrop,side_part:sidePart,curly_crop:curlyCrop,top_knot:topKnot,tied_locs:tiedLocs},
 female:{pixie,bob,long_braid:longBraid,rounded_curls:roundedCurls,high_bun:highBun},
};

function removeHair(group){
 const removed=[],materials=new Set(),retained=new Set();
 group.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const values=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  if(mesh.userData.part==='hair'){removed.push(mesh);for(const value of values)materials.add(value);}
  else for(const value of values)retained.add(value);
 });
 for(const mesh of removed){mesh.removeFromParent();mesh.geometry.dispose();}
 for(const value of materials){
  const owned=value.userData;
  if(!retained.has(value)&&(owned.ownedByCharacter||owned.itemOwned||owned.ownedByItem||owned.originalColor))value.dispose();
 }
}

/** Apply once to freshly built body geometry, before fitBodyType and bindCharacter. */
export function applyHairstyle(group,{bodyType='male',style='default',headwear='none'}={}){
 const type=bodyType==='female'?'female':'male',resolved=resolveHairstyle(type,style);
 if(resolved!=='default'){
  removeHair(group);
  const h=new Geometry(group);h.part='hair';builders[type][resolved](h);
 }
 group.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.part!=='hair')return;
  mesh.userData.armorBinding='head';mesh.userData.hairstyle=resolved;
  mesh.visible=headwear==='none';
 });
 return resolved;
}
