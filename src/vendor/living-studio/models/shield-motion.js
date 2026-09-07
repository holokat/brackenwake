import * as THREE from 'three';

const ready={position:[-.3,-1.42,-.30],rotation:[.04,-.12,-.50]};
const guard={position:[-.05,-1.62,-.20],rotation:[-.06,-.10,-.55]};
const high={position:[-.05,-1.50,.80],rotation:[-.30,-.08,-.45]};
const low={position:[-.05,-1.65,-1.04],rotation:[.16,-.08,-.55]};
const windup={position:[-.85,-1.13,-.24],rotation:[.02,-.16,-.35],advance:.72};
const impact={position:[.04,-2.0,-.10],rotation:[-.08,-.06,-.65],advance:.98};
const smooth=t=>{const x=THREE.MathUtils.clamp(t,0,1);return x*x*(3-2*x);};
function pose(value,kind){return {position:new THREE.Vector3(...value.position),rotation:new THREE.Quaternion().setFromEuler(new THREE.Euler(...value.rotation)),advance:value.advance??.83,kind};}
function blend(a,b,t,kind){const p=pose(a,kind),q=pose(b,kind),mix=smooth(t);p.position.lerp(q.position,mix);p.rotation.slerp(q.rotation,mix);p.advance=THREE.MathUtils.lerp(p.advance,q.advance,mix);return p;}
function sideGuard(p){p.position.x-=.30;p.rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-.10));return p;}

/** Shared body drive for a shield strike, applied after resetting the rig. */
export function applyShieldBashBody(rig,phase){
 const t=THREE.MathUtils.clamp(phase,0,1),a=t<.1||t>.85?0:Math.sin(Math.PI*(t-.1)/.75),j=rig.joints;
 j.chest.rotation.set(-.13*a,0,-.22*a);j.hips.position.y-=.28*a;j.hips.position.z-=.12*a;
 j.thighL.rotation.set(-.2*a,0,0);j.shinR.rotation.set(.25*a,0,0);j.upperArmR.rotation.set(-.35*a,0,-.35*a);
}

/** Chest-relative targets in the actor's heading frame. The shield faces local -Y. */
export function shieldMotion({move='reference',phase=0,actionPhase=phase,abilityId,source=false}={}){
 const t=THREE.MathUtils.clamp(actionPhase,0,1),id=abilityId||move;
 if(id==='shield-bash'){
  if(t<.23)return blend(ready,windup,t/.23,'bash');
  if(t<.48)return blend(windup,impact,(t-.23)/.25,'bash');
  if(t<.62)return blend(impact,guard,(t-.48)/.14,'bash');
  return blend(guard,ready,(t-.62)/.38,'bash');
 }
 if(['block','block-high','block-low','parry','shield-block'].includes(id)){
  const target=id==='block-high'?high:id==='block-low'?low:guard;
  return blend(ready,target,Math.min(t/.20,(1-t)/.18,1),id);
 }
 if(id==='combat-idle')return pose(guard,'guard');
 if(/walk|run|strafe|turn|jump|airborne|land|dodge|sidestep/.test(move)){
  const p=blend(ready,guard,.4,'carry');p.position.z+=Math.sin(phase*Math.PI*2)*.035;return p;
 }
 if(/attack|slash|heavy|thrust|strike|whirlwind|spin|lunge/.test(move)||['cleave','crushing-blow','reckless-swing','riposte'].includes(id)){
  const p=sideGuard(blend(ready,guard,Math.sin(t*Math.PI)**2,'guard'));
  if(move==='slash')p.advance=.95;
  // Open the shield during the authored sword crossover, then return smoothly
  // to guard. This follows clip time because the body drives the clearance.
  if(source&&move==='light-attack'&&phase<.3){
   const amount=Math.sin(Math.PI*THREE.MathUtils.clamp(phase/.3,0,1))**2;
   p.position.add(new THREE.Vector3(-.30,0,.35).multiplyScalar(amount));
   p.rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-.25*amount));
   p.advance=THREE.MathUtils.lerp(p.advance,.70,amount);p.kind='deflecting guard';
  }
  if(source&&move==='whirlwind')p.advance=Math.max(p.advance,.92);
  return p;
 }
 if(abilityId||/cast|fireball|healing|lightning|missile/.test(move))return sideGuard(pose(ready,'casting guard'));
 return pose(ready,'ready');
}
