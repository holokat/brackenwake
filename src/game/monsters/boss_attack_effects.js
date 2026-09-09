import * as THREE from 'three';
import {createCellarBossTelegraphs} from './cellar_boss_telegraphs.js';
import {createCellarAttackVfx} from './cellar_attack_vfx.js';

/** Presentation for ordinary boss attacks, including Oram. Damage stays in combat. */
export function createBossAttackEffects(parent) {
 const warnings=createCellarBossTelegraphs(parent), swings=[];
 let serial=0;
 const free=root=>{root.removeFromParent();root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});};
 return {
  warn(mon,at,spec,now){
   if(!mon.boss)return null;
   const mark={id:`boss:${++serial}`,attackId:spec.id==='stormcall'?'gravityShock':spec.id==='powdercharge'?'cinderMarks':'saintCrush',
    born:now,impactAt:now+spec.warn*1000,colour:spec.colour,shape:{kind:'circle',x:at.x,y:at.y||0,z:at.z,radius:spec.radius}};
   warnings.add(mark);return mark;
  },
  land(mark,now){if(mark)warnings.remove(mark,true,now);},
  cancel(mark){if(mark)warnings.remove(mark);},
  swing(mon,target,now,landAt){
   if(!mon.boss||!target?.pos)return;
   const p=mon.actor.pos, root=new THREE.Group();root.position.set(p.x,p.y+.2,p.z);parent.add(root);
   const mark={attackId:'royalCleave',colour:0xdbb887,shape:{kind:'cone',x:p.x,y:p.y,z:p.z,
    yaw:Math.atan2(target.pos.x-p.x,target.pos.z-p.z),radius:Math.max(1.5,Math.min(6,Math.hypot(target.pos.x-p.x,target.pos.z-p.z))),halfAngle:.8}};
   swings.push({mon,root,fx:createCellarAttackVfx(root,mark),born:now,landAt});
  },
  update(now){
   warnings.update(now);
   for(let i=swings.length-1;i>=0;i--){
    const s=swings[i],hit=now>=s.landAt;
    if(s.mon.actor.health<=0||now>s.landAt+450){free(s.root);swings.splice(i,1);continue;}
    s.fx.update(hit?(now-s.landAt)/450:(now-s.born)/Math.max(1,s.landAt-s.born),hit);
   }
  },
  clear(){warnings.clear();for(const s of swings)free(s.root);swings.length=0;},
 };
}
