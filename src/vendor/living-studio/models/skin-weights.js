/** Bind complete equipment parts and anatomical regions before considering vertex position. */
export function equipmentWeights(mesh,positions){
 const name=mesh.name.toLowerCase(),slot=mesh.userData.slot;
 mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox;
 const side=(bounds.min.x+bounds.max.x)<0?'L':'R';
 const binding=mesh.userData.armorBinding;
 if(binding){
  if(mesh.userData.fittedTorso)return fittedTorsoWeights(positions);
  // Semantic bindings keep cloth near the hands attached to its anatomical region.
  if(positions[binding])return [[binding,1]];
  if(binding==='arm')return armWeights(mesh.userData.armorSide||side,positions);
  if(binding==='leg')return legWeights(mesh.userData.armorSide||side,positions);
  if(binding==='skirt')return skirtWeights(mesh.userData.armorSide||side,positions,mesh.userData.skirtFollowSpan,mesh.userData.skirtFollowMax);
  if(binding==='torso'||binding==='back')return torsoWeights;
  throw new Error(`Unknown armor skin binding: ${binding}`);
 }
 if(/block hand|block thumb/.test(name))return null;
 if(slot==='headwear'||slot==='facialHair')return [['head',1]];
 if(slot==='gloves')return [['forearm'+side,1]];
 if(slot==='belt')return [['hips',1]];
 if(slot==='quiver'||slot==='cape')return [['chest',1]];
 if(slot==='boots')return [[(/sole|foot|sabaton/.test(name)?'foot':'shin')+side,1]];
 if(/pauldron/.test(name))return [['upperArm'+side,1]];
 if(/gorget|collar|bevor/.test(name))return [['chest',1]];
 if(/breastplate|back armor|suspension|chest .*plate/.test(name))return [['chest',1]];
 if(/cuirass abdominal lame/.test(name))return [['spine',1]];
 if(/trousers hips|trouser pelvis/.test(name))return [['hips',1]];
 if(/scabbard/.test(name))return [['hips',1]];
 if(/forearm|glove cuff|sleeve cuff binding/.test(name))return [['forearm'+side,1]];
 if(/sleeve leather hem|upper sleeve|short green sleeve|inner shoulder bridge/.test(name))return [['upperArm'+side,1]];
 if(/sleeve|^arm /.test(name))return armWeights(side,positions);
 if(/trouser|^leg |pant/.test(name))return (x,y,z)=>{
  if(z<.62)return [['foot'+side,1]];
  const t=Math.max(0,Math.min(1,(z-2.10)/.32));
  return t===0?[['shin'+side,1]]:t===1?[['thigh'+side,1]]:[['shin'+side,1-t],['thigh'+side,t]];
 };
 if(/hip skirt|side tabard|side tabard gold/.test(name))return [['hips',.7],['thigh'+side,.3]];
 if(/tabard.*hem|front tabard/.test(name))return [['hips',1]];
 if(slot==='armor'&&/torso|body|vest|tunic|coat|lapel|robe|facing|breast|baldric|clasp/.test(name))return (x,y,z)=>{
  // Torso cloth and long coat panels never inherit nearby arm or hand weights.
  if(z<4.45)return [['hips',1]];
  if(z<5.05){const t=(z-4.45)/.6;return [['hips',1-t],['spine',t]];}
  if(z<5.65){const t=(z-5.05)/.6;return [['spine',1-t],['chest',t]];}
  return [['chest',1]];
 };
 return null;
}

function torsoWeights(x,y,z){
 if(z<4.45)return [['hips',1]];
 if(z<5.05){const t=(z-4.45)/.6;return [['hips',1-t],['spine',t]];}
 if(z<5.65){const t=(z-5.05)/.6;return [['spine',1-t],['chest',t]];}
 return [['chest',1]];
}
function legWeights(side,positions){
 const knee=positions['shin'+side].z;
 return (x,y,z)=>{
  const t=Math.max(0,Math.min(1,(z-knee+.16)/.32));
  return t===0?[[`shin${side}`,1]]:t===1?[[`thigh${side}`,1]]:[[`shin${side}`,1-t],[`thigh${side}`,t]];
 };
}
function skirtWeights(side,positions,followSpan=2.1,followMax=.70){
 const hip=positions.hips.z;
 return (x,y,z)=>{
  // The split halves follow their thighs gradually while the waist remains on the hips.
  const thigh=Math.min(followMax,Math.max(0,(hip-z)/followSpan)*followMax);
  return thigh===0?[['hips',1]]:[['hips',1-thigh],[`thigh${side}`,thigh]];
 };
}

function armWeights(side,positions){
 const shoulder=positions['upperArm'+side],elbow=positions['forearm'+side],wrist=positions['hand'+side];
 const segment=(a,b)=>{const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;return {a,x,y,z,lengthSq:x*x+y*y+z*z};};
 const upper=segment(shoulder,elbow),lower=segment(elbow,wrist);
 const nearest=(x,y,z,s)=>{const t=Math.max(0,Math.min(1,((x-s.a.x)*s.x+(y-s.a.y)*s.y+(z-s.a.z)*s.z)/s.lengthSq));return {t,d:(x-s.a.x-s.x*t)**2+(y-s.a.y-s.y*t)**2+(z-s.a.z-s.z*t)**2};};
 return (x,y,z)=>{
  const a=nearest(x,y,z,upper),b=nearest(x,y,z,lower);
  // Cloth may hang below a raised wrist. Its distance along the arm determines
  // its joint, so hanging fabric is never mistaken for a hand or a thigh.
  const forearm=a.d<b.d?Math.max(0,(a.t-.83)/.17)*.5:.5+Math.min(1,b.t/.17)*.5;
  return forearm===0?[['upperArm'+side,1]]:forearm===1?[['forearm'+side,1]]:[['upperArm'+side,1-forearm],['forearm'+side,forearm]];
 };
}

/** Fit waist-connected cloth to the actor's own spine, regardless of body proportions. */
function fittedTorsoWeights(positions){
 const hips=positions.hips.z+.18,spine=positions.spine.z,chest=positions.chest.z;
 return (x,y,z)=>{
  if(z<=hips)return [['hips',1]];
  if(z<spine){const t=(z-hips)/(spine-hips);return [['hips',1-t],['spine',t]];}
  if(z<chest){const t=(z-spine)/(chest-spine);return [['spine',1-t],['chest',t]];}
  return [['chest',1]];
 };
}
