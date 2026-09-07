import * as THREE from 'three';

const rest={p:[1.45,-.72,-.65],axis:[.18,0,1]};
const channel={p:[1.5,-.72,-.25],axis:[.10,-.15,.98]};
const forward={p:[1.6,-1,.30],axis:[.10,-.90,.42]};
const raised={p:[1.6,-.75,.90],axis:[.10,-.06,.993]};
const combat={p:[1.5,-.80,-.40],axis:[.12,-.66,.74]};
const raiseFamilies=new Set(['heal','shield','aura','nova','meteor','portal','mark']);
const raiseIds=new Set(['healing','heal','greater-heal','ward','meteor','mana-shield','stone-skin','sanctuary','bless','cleanse','resurrect']);

function mix(a,b,t){
 return {position:new THREE.Vector3(...a.p).lerp(new THREE.Vector3(...b.p),t),
  axis:new THREE.Vector3(...a.axis).normalize().lerp(new THREE.Vector3(...b.axis).normalize(),t).normalize()};
}

/** Staff handling follows the action while the other arm retains its spell pose. */
export function staffMotion({move='reference',phase=0,abilityId,abilityFamily}={}){
 const id=abilityId||move,t=THREE.MathUtils.clamp(phase,0,1);
 if(/walk|run|strafe|turn|jump|airborne|land|dodge/.test(move)){
  const pose=mix(rest,{p:[1.40,-.70,-.45],axis:[.12,-.5,.86]},1);
  pose.position.y+=Math.sin(t*Math.PI*2)*.06;return {...pose,kind:'carry'};
 }
 const high=raiseIds.has(id)||raiseFamilies.has(abilityFamily)||move==='healing';
 const cast=high||/cast|fireball|lightning|missiles/.test(move)||['projectile','lightning','drain'].includes(abilityFamily);
 if(cast){
  const peak=high?raised:forward;
  const keys=[[0,rest],[.22,channel],[.50,peak],[.68,peak],[1,rest]];
  let index=0;while(index<keys.length-2&&keys[index+1][0]<t)index++;
  const [a,start]=keys[index],[b,end]=keys[index+1];
  return {...mix(start,end,THREE.MathUtils.smoothstep(t,a,b)),kind:high?'raised':'forward'};
 }
 if(/combat|block|slash|heavy|thrust|attack|strike|spin|whirlwind/.test(move)){
  if(/combat-idle|block/.test(move))return {...mix(rest,combat,1),kind:'combat'};
  const amount=Math.sin(t*Math.PI)**2;
  return {...mix(combat,forward,amount),kind:'combat'};
 }
 return {...mix(rest,rest,0),kind:'rest'};
}
