import {gem,role} from './common.js';
import {buildBow} from './bow.js';

export function buildRanged(h,id){
 if(['shortbow','longbow'].includes(id)){
  buildBow(h,id);
  return true;
 }
 if(id==='crossbow'){
  h.tube('Carved crossbow stock',[[0,.52,-.11],[0,.17,0],[0,-1.43,.05]],[[.17,.16],[.15,.12],[.11,.085]],'wood',{sides:6,variation:.018});
  h.cube('Shoulder stock',[0,.48,-.11],[.32,.26,.44],'wood',{bevel:.055});
  h.cube('Crossbow rail',[0,-.62,.17],[.115,1.7,.095],'steel_dark');
  for(const y of[-1.13,-.21])h.cube('Rail mounting saddle',[0,y,.117],[.18,.16,.10],'steel_dark',{bevel:.018});
  h.cube('Stock butt plate',[0,.61,-.11],[.33,.05,.45],'steel_dark',{bevel:.015});
  h.tube('Steel crossbow prod',[[-1.04,-1.05,.08],[-.68,-1.29,.08],[0,-1.38,.08],[.68,-1.29,.08],[1.04,-1.05,.08]],[.034,.065,.095,.065,.034],'steel',{sides:6,variation:.015});
  h.tube('Crossbow string',[[-1.04,-1.05,.08],[0,-.19,.15],[1.04,-1.05,.08]],.014,'bowstring',{sides:4,variation:0});
  h.tube('Crossbow trigger grip',[[0,0,.02],[0,.19,-.74]],.108,'leather_dark',{sides:6,variation:0});
  h.tube('Crossbow support grip',[[0,-.5,.015],[-.32,-.5,-.62]],[.13,.115],'wood',{sides:8,variation:.018});
  h.tube('Trigger guard',[[0,-.08,-.1],[0,-.2,-.59],[0,.14,-.59]],.024,'steel_dark',{sides:5,variation:0});
  gem(h,[0,.04,.2],{size:.088});
  h.tube('Front loading stirrup',[[-.16,-1.42,.05],[-.16,-1.7,.04],[.16,-1.7,.04],[.16,-1.42,.05]],.042,'steel_dark',{sides:6,variation:0});
  return true;
 }
 return false;
}

export {buildAmmunition} from './ammunition.js';
