import * as THREE from 'three';
const ready={p:[0,-1.3,-.62],d:[.65,-.38,.68]};
const heavy=[
 [0,ready],[.25,{p:[-.15,-1.25,2.2],d:[.90,.42,.08]}],
 [.42,{p:[.15,-.85,1.9],d:[.80,-.30,.50]}],
 [.60,{p:[.35,-1.45,-.55],d:[.65,-.12,-.75]}],
 [.79,{p:[.25,-1.45,-.72],d:[.65,-.15,-.74]}],[1,ready],
];
const sweep=[
 [0,ready],[.24,{p:[.15,-1.45,-.45],d:[.94,.18,.28]}],
 [.53,{p:[0,-1.45,-.60],d:[-.55,-.35,.76]}],
 [.78,{p:[0,-1.3,-.55],d:[-.20,-.35,.92]}],[1,ready],
];
const thrust=[
 [0,ready],
 [.28,{p:[-.3,-1.3,-.40],d:[.80,-.60,.10]}],
 [.56,{p:[.30,-1.75,-.30],d:[.80,-.60,.10]}],
 [.76,{p:[.15,-1.60,-.40],d:[.80,-.60,.10]}],[1,ready],
];
function frame(direction){
 const z=new THREE.Vector3(...direction).normalize(),x=new THREE.Vector3(1,0,0);x.addScaledVector(z,-x.dot(z));
 if(x.lengthSq()<.015)x.set(0,1,0).addScaledVector(z,-z.y);x.normalize();
 const y=new THREE.Vector3().crossVectors(z,x).normalize();
 return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
/** Shared timing for the native editor and retargeted source motions. */
export function twoHandedMotion(family,move='reference',phase=0){
 const stab=/thrust|lunge|stab|pierc/.test(move)||(family==='pole'&&/light-attack|slash/.test(move));
 const strike=/heavy|two-handed|crushing|strike/.test(move),slash=/slash|light-attack|spin|whirlwind/.test(move);
 const keys=stab?thrust:strike?heavy:slash?sweep:null;
 if(!keys)return {position:new THREE.Vector3(...ready.p),rotation:frame(ready.d)};
 const t=THREE.MathUtils.clamp(phase,0,1);let i=0;while(i<keys.length-2&&keys[i+1][0]<t)i++;
 const [a,start]=keys[i],[b,end]=keys[i+1],u=THREE.MathUtils.smoothstep(t,a,b);
 return {position:new THREE.Vector3(...start.p).lerp(new THREE.Vector3(...end.p),u),rotation:frame(start.d).slerp(frame(end.d),u)};
}
