import {blade,gem,grip,loop,plate} from './common.js';

const swords={
 dagger:{length:1.02,width:.13,guard:.43,grip:.25},
 shortsword:{length:1.7,width:.2,guard:.61,grip:.29},
 longsword:{length:2.48,width:.155,guard:.84,grip:.31},
 greatsword:{length:3.1,width:.235,guard:1.05,grip:.5},
 rapier:{length:2.67,width:.069,guard:.55,grip:.29},
};

export function buildBlade(h,id){
 const p=swords[id];
 if(!p)return false;
 const base=p.grip+.13;
 grip(h,{bottom:-p.grip,top:p.grip,radius:id==='greatsword'?.103:.087});
 h.loft('Solid blade bolster',[[0,0,p.grip-.03,.105,.09],[0,0,base+.07,.13,.095]],'steel_dark',{n:8,variation:0});
 blade(h,{base,length:p.length,width:p.width,thickness:id==='rapier'?.034:.063});
 if(id==='rapier'){
  h.loft('Swept cup guard',[[0,0,base-.14,.12,.1],[0,0,base-.055,.3,.21],[0,0,base,.29,.2]],'steel',{n:10,variation:.018});
  h.tube('Swept knuckle guard',[[.22,0,base-.05],[.31,0,.13],[.27,0,-.25],[.07,0,-.36]],[.035,.033,.029,.023],'gold',{sides:6,variation:0});
  loop(h,'Quillon ring',[0,0,base+.045],.21,.11,.021,'steel_dark',{segments:10});
 }else if(id==='shortsword'){
  plate(h,'Winged crossguard',[[-p.guard/2,base-.08],[-p.guard/2-.08,base+.07],[-.11,base+.08],[0,base+.12],[.11,base+.08],[p.guard/2+.08,base+.07],[p.guard/2,base-.08]],.14,'gold');
 }else{
  h.tube('Swept crossguard',[[-p.guard/2,0,base-.02],[-p.guard*.27,0,base+.045],[0,0,base+.04],[p.guard*.27,0,base+.045],[p.guard/2,0,base-.02]],id==='greatsword'?.08:.059,'steel',{sides:6,variation:0});
 }
 if(id==='greatsword'){
  plate(h,'Parrying lugs',[[-.25,base+.3],[-.41,base+.47],[-.2,base+.44],[.2,base+.44],[.41,base+.47],[.25,base+.3]],.11,'steel');
  h.loft('Extended ricasso',[[0,0,base+.09,.25,.076],[0,0,base+.44,.25,.076]],'steel_dark',{n:4,phase:Math.PI/4,variation:0});
 }
 h.ico(id==='dagger'?'Faceted dagger pommel':'Counterweight pommel',[0,0,-p.grip-.11],[id==='greatsword'?.19:.14,.105,id==='shortsword'?.19:.145],'steel',{sub:1,variation:0});
 gem(h,[0,-.1,-p.grip-.1],{size:id==='greatsword'?.103:.074});
 return true;
}

export function buildThrowingKnives(h){
 // One balanced knife represents the stack without mounting several overlapping blades.
 plate(h,'Balanced throwing knife',[[-.065,-.36],[-.1,.12],[-.19,.26],[0,1.2],[.19,.26],[.1,.12],[.065,-.36]],.064,'steel_edge');
 h.cube('Knife leather grip',[0,0,-.075],[.135,.09,.39],'leather_dark');
 loop(h,'Counterweight ring',[0,0,-.43],.095,.10,.028,'steel_dark',{segments:8});
 gem(h,[0,-.052,.19],{size:.057});
}
