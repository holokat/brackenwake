import {plate,role} from './common.js';

export function buildAmmunition(h,id){
 const bolt=id==='bolt',bottom=bolt?-.68:-1.07,top=bolt?.56:1.06;
 h.tube(bolt?'Bolt shaft':'Arrow shaft',[[0,0,bottom],[0,0,top]],bolt?.035:.024,'wood_light',{sides:6,variation:0});
 if(bolt){
  const ring=(z,r)=>[[r,0,z],[0,r,z],[-r,0,z],[0,-r,z]],v=[...ring(top-.13,.033),...ring(top,.068),[0,0,top+.31]];
  h.mesh('Bodkin bolt head',v,[[3,2,1,0],...[0,1,2,3].flatMap(i=>[[i,(i+1)%4,(i+1)%4+4,i+4],[i+4,(i+1)%4+4,8]])],'steel_edge',{variation:0});
 }else{
  const outline=[[-.033,top-.13],[-.14,top],[0,top+.31],[.14,top],[.033,top-.13]],v=[...outline.map(([x,z])=>[x,0,z]),[0,-.036,top+.025],[0,.036,top+.025]];
  h.mesh('Broad arrow head',v,outline.flatMap((_,i)=>[[5,i,(i+1)%5],[6,(i+1)%5,i]]),'steel_edge',{variation:0});
  role(h.loft('Bone nock collar',[[0,0,bottom-.05,.032,.032],[0,0,bottom+.012,.032,.032]],'#c7ba98',{n:6,variation:0}),'bone');
  for(const x of[-.022,.022])role(h.cube('Forked arrow nock',[x,0,bottom-.08],[.018,.05,.066],'#c7ba98'),'bone');
 }
 h.loft('Arrowhead socket',[[0,0,top-.16,bolt?.047:.036,bolt?.047:.036],[0,0,top+.01,bolt?.043:.032,bolt?.043:.032]],'steel_dark',{n:6,variation:0});
 for(const z of[bottom+.055,bottom+.46])role(h.loft('Fletching binding',[[0,0,z-.014,.034,.034],[0,0,z+.014,.034,.034]],'bowstring',{n:6,variation:0}),'cord');
 role(h.loft('Tail binding',[[0,0,bottom,.033,.033],[0,0,bottom+.046,.033,.033]],'bowstring',{n:6,variation:0}),'cord');
 for(let i=0;i<3;i++){
  const fletch=role(plate(h,'Fletching '+(i+1),[[.011,bottom+.05],[.15,bottom+.11],[.11,bottom+.4],[.011,bottom+.49]],.014,bolt?'cloth_dark':'red'),'feather');
  fletch.rotation.z=i*Math.PI*2/3;
 }
}
