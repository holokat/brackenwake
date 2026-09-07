import {constructionAccent} from './shapes.js';
import {buildRobeSkirt,buildDrapedBack} from './drape.js';
import {buildSleeve,buildApronUndershirt} from './sleeves.js';

export function buildChest(h){
 const p=h.profile,b=p.bulk,robe=p.id==='dark_robe',robed=p.tier==='cloth';
 if(p.id==='leather_apron'){buildApron(h);return;}
 const hem=robed?4.10:p.hem,material=robe?'violet_dark':p.material;
 const rows=[...(robed||hem===4.10?[]:[[0,.025,hem,1+b,.52+b]]),[0,.025,4.10,.82+b,.49+b],[0,0,4.68,.74+b,.42+b],[0,0,5.28,.88+b,.49+b],[0,0,5.93,1.035+b,.51+b],[0,0,6.18,1.045+b,.46+b],[0,.01,6.42,.56+b,.32+b]];
 const torso=h.shell(robe?'Dark robe torso':`${p.tier} tunic torso`,rows,material);
 if(robed)buildRobeSkirt(h,robe,torso);
 // The neck binding repeats the shell's last profile and overlaps its shoulder seam.
 h.with('chest',p.edgeRole,()=>{
  const collar=h.shell('Fitted tunic neckline',[[0,.008,6.365,.652+b,.351+b],[0,.01,6.42,.57+b,.332+b],[0,.01,6.47,.57+b,.332+b]],p.edge,{thickness:.060});h.attached(collar,torso);
 });
 if(!robed){
  const [x,y,z,rx,ry]=rows[0],next=rows[1],t=.09/(next[2]-z||1);
  h.with('torso',p.edgeRole,()=>h.attached(h.shell('Bound tunic hem',[[x,y,z+.008,rx+.013,ry+.013],[x,y,z+.085,rx+(next[3]-rx)*t+.013,ry+(next[4]-ry)*t+.013]],p.edge,{thickness:.055}),torso));
 }
 if(p.tier==='plate')h.with('torso','metal',()=>{
  h.mountedPanel('Faceted breastplate reinforcement',[[-.70,6.05],[0,6.18],[.70,6.05],[.64,5.35],[0,5.12],[-.64,5.35]],torso,p.material,{thickness:.052});
  h.mountedStrip('Breastplate folded center ridge',[[0,5.23],[0,5.55],[0,5.94],[0,6.10]],.07,torso,p.edge,{thickness:.077});
  h.mountedStrip('Articulated abdominal overlap',[[0,4.56],[0,4.76]],1.10,torso,p.edge,{thickness:.033});
  for(const x of[-.61,.61])h.rivet(`Cuirass shoulder fastening ${x}`,x,6.07,torso);
 });
 if(p.role==='leather')h.with('torso','leather',()=>{
  for(const s of[-1,1])h.mountedStrip(`Sewn tunic side facing ${s}`,[[s*.48,4.20],[s*.43,4.68],[s*.52,5.28],[s*.66,5.93],[s*.64,6.15]],.13,torso,'leather_light');
  h.mountedStrip('Reinforced tunic closure',[[0,4.22],[0,4.68],[0,5.28],[0,5.92]],.11,torso,'leather_dark');
 });
 if(robed)h.with('torso','trim',()=>{
  for(const s of[-1,1])h.mountedStrip(`Robe front facing ${s}`,[[s*.17,4.12],[s*.17,4.68],[s*.23,5.28],[s*.30,5.93],[s*.27,6.37]],.12,torso,robe?'violet':p.edge);
 });
 for(const side of[-1,1])buildSleeve(h,side,torso,{robe});
 constructionAccent(h,{support:torso,z:5.59,width:1.10,height:.55});
 if(robe)h.with('chest','cloth',()=>{
  const vertices=[],faces=[],steps=10;
  for(const[z,rx,ry]of[[6.35,.64,.365],[6.83,.62,.43]])for(let i=0;i<=steps;i++){
   const a=Math.PI/6+i*(Math.PI*5/3)/steps;vertices.push([rx*Math.sin(a),.01-ry*Math.cos(a),z]);
  }
  for(let i=0;i<steps;i++)faces.push([i,i+1,i+steps+2,i+steps+1]);
  h.attached(h.thicken('Standing robe collar',vertices,faces,([x,y,z])=>[x*.92,.01+(y-.01)*.90,z], 'violet_dark'),torso);
 });
}
function buildApron(h){
 const p=h.profile;
 buildApronUndershirt(h);
 const apron=h.rootPart(h.panel('Leather apron bib and skirt',[[-.41,-.38,6.25],[.41,-.38,6.25],[.66,-.57,5.66],[.69,-.54,4.59],[.96,-.60,2.71],[.80,-.64,2.48],[-.80,-.64,2.48],[-.96,-.60,2.71],[-.69,-.54,4.59],[-.66,-.57,5.66]],.10+p.bulk,p.material));
 h.with('torso','leather',()=>{
  h.attached(h.shell('Apron continuous neck loop',[[0,0,6.24,.35,.35],[0,.02,6.42,.44,.37]],'leather_light',{thickness:.055}),apron);
  for(const s of[-1,1]){
   h.mountedStrip(`Apron stitched border ${s}`,[[s*.72,2.58],[s*.81,2.78],[s*.59,4.59],[s*.56,5.63],[s*.33,6.16]],.07,apron,'leather_light');
  }
  h.attached(h.band('Apron waist tie',4.72,.84,.54,.14,'leather_light','hips','leather'),apron);
  const pocket=h.mountedPanel('Apron working pocket',[[-.38,4.57],[.38,4.57],[.34,4.06],[-.34,4.06]],apron,'leather_light',{thickness:.048});
  h.mountedStrip('Pocket turned lip',[[0,4.47],[0,4.56]],.69,pocket,'leather_dark',{thickness:.018});
 });
 constructionAccent(h,{support:apron,z:3.70,width:1.20,height:.5});
}
export function buildBack(h){
 const p=h.profile,{mantle,straps}=buildDrapedBack(h);
 if(p.tier==='plate')h.with('back','metal',()=>h.mountedStrip('Rolled plate spine guard',[[0,4.27],[0,4.65],[0,5.23],[0,5.83]],.17,mantle,p.edge,{side:1,thickness:.034}));
 constructionAccent(h,{support:mantle,z:5.16,width:1.10,height:.52,binding:'back',face:1});
 // The front clasp is carried by a complete neck strap, which joins both shoulder falls.
 h.with('chest','leather',()=>{
  const strap=h.attached(h.tube('Mantle neck fastening',[[-.38,-.25,6.36],[0,-.38,6.36],[.38,-.25,6.36]],.051,'leather_dark',{sides:6}),straps);
  h.with('chest','metal',()=>h.rivet('Mantle clasp',0,6.36,strap,{radius:.068,mat:'gold'}));
 });
}
