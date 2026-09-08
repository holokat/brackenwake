import {createChibiHumanPose} from './chibi-human-poses.js';
import {ease,pulse} from './shared.js';

/** Creature motion on distinct rest anatomy, with shared equipment handling. */
export function createChibiMonsterPose(rig,id,look){
 const human=createChibiHumanPose(rig,look,null),j=rig.joints;
 const rot=(name,x=0,y=0,z=0)=>j[name].rotation.set(x,y,z);
 return (name,t,duration)=>{
  human(name,t,duration);
  const cycle=Math.sin(t*Math.PI*2),sway=Math.cos(t*Math.PI*2)-1,impact=pulse(t);
  if(id.startsWith('goblin')&&['idle','walk','run'].includes(name)){
   const moving=name!=='idle',stride=moving?(name==='run'?.51:.30):0;
   // Their bowed, short legs scuttle under a forward-set skull and long arms.
   j.hips.position.z=rig.rest.hips.p.z-.08+(moving?.025*Math.cos(t*Math.PI*4):.007*cycle);
   rot('thighL',-.12+cycle*stride,0,-.09);rot('thighR',-.12-cycle*stride,0,.09);
   rot('shinL',.19+Math.max(0,-cycle)*stride*.9);rot('shinR',.19+Math.max(0,cycle)*stride*.9);
   rot('chest',-.07,0,moving?.035*cycle:.012*cycle);rot('head',.035,0,.018*cycle);
  }
  if(['zombie','drowned'].includes(id)){
   if(['idle','walk','run','charge','hover'].includes(name)){
    rig.reset();const moving=['walk','run','charge'].includes(name),stride=moving?.24:.015;
    rot('chest',-.035,0,.025*cycle);rot('head',.035,0,-.065);
    rot('upperArmL',-.14+cycle*stride*.35,0,.07);rot('upperArmR',-.22-cycle*stride*.35,0,-.09);
    rot('forearmL',-.07);rot('forearmR',-.10);
    if(moving){rot('thighL',cycle*stride);rot('thighR',-cycle*stride*.86);rot('shinL',Math.max(0,-cycle)*stride);rot('shinR',Math.max(0,cycle)*stride*.8);}
   }
   if(['swing','cast','reach'].includes(name)){
    rot('chest',-.06-.14*impact,0,.10*impact);rot('upperArmL',-.65-.52*impact,0,.16);rot('upperArmR',-.80-.60*impact,0,-.16);
    rot('forearmL',-.15-.15*impact);rot('forearmR',-.20-.15*impact);
   }
  }
  if(id==='scarecrow'){
   if(['idle','hover','wake'].includes(name)){
    rig.reset();const waking=name==='wake'?1-ease(t):1;
    rot('upperArmL',-.04,0,-.76*waking);rot('upperArmR',-.03,0,.76*waking);
    rot('forearmL',-.09);rot('forearmR',-.07);rot('head',.10+.18*waking,0,.07+.012*cycle);rot('chest',.022*cycle);
   }
   if(['run','walk'].includes(name)){rot('upperArmL',-.20,0,-.48);rot('upperArmR',-.16,0,.48);rot('head',.10,0,.06);}
  }
  if(id==='wraith'){
   // The continuous robe has no leg skin; hover and reach replace walking steps.
   rig.reset();j.hips.position.z+=.26+cycle*.075;
   rot('chest',.018*cycle,0,.025*cycle);rot('head',.07,0,.022*cycle);
   rot('upperArmL',-.27,0,-.20-.025*cycle);rot('upperArmR',-.27,0,.20+.025*cycle);
   rot('forearmL',-.18);rot('forearmR',-.18);
   if(['reach','cast','swing','thrust','shout','throw'].includes(name)){
    rot('chest',-.16*impact);rot('upperArmL',-.3-1.03*impact,0,-.15);rot('upperArmR',-.3-1.03*impact,0,.15);
    rot('forearmL',-.18-.16*impact);rot('forearmR',-.18-.16*impact);
   }else if(['block','shieldRaise','hurt'].includes(name)){
    rot('upperArmL',-.3-.60*impact,0,.12*impact);rot('upperArmR',-.3-.60*impact,0,-.12*impact);rot('chest',.12*impact);
   }else if(name==='die'){
    const fade=ease(t);j.hips.scale.setScalar(1-.78*fade);j.hips.position.z-=1.08*fade;
    rot('chest',.23*fade,0,.55*fade);rot('head',.32*fade);rot('upperArmL',-.4*fade,0,-.7*fade);rot('upperArmR',-.4*fade,0,.7*fade);
   }else if(name==='wake'){j.hips.position.z+=.22*ease(t);rot('head',.35*(1-ease(t)));}
   else if(name==='wait'||name==='whistle'){rot('head',.12+.045*cycle);j.hips.position.z+=sway*.035;}
  }
  if(id==='skeleton'&&name==='die'){
   rig.reset();const collapse=ease(t);j.hips.position.z-=1.64*collapse;
   rot('hips',.45*collapse,0,.10*collapse);rot('chest',.58*collapse);rot('head',.46*collapse);
   rot('upperArmL',.36*collapse,0,-.68*collapse);rot('upperArmR',.30*collapse,0,.63*collapse);
   rot('thighL',-.6*collapse,0,-.16*collapse);rot('thighR',-.44*collapse,0,.18*collapse);rot('shinL',1.16*collapse);rot('shinR',.92*collapse);
  }
 }
}
