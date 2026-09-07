import {facePreset} from '../data/face-presets.js';

const smooth=(a,b,value)=>{const t=Math.max(0,Math.min(1,(value-a)/(b-a)));return t*t*(3-2*t);};
const band=(value,a,b,c,d)=>smooth(a,b,value)*(1-smooth(c,d,value));

/** One continuous field moves the face shell and every facial inset together.
 * Scalp, ears, back of skull and neck seam remain fixed for existing gear/hair.
 * Apply exactly once, before body morphology and skeleton binding.
 */
export function applyFacePreset(group,{bodyType='male',preset='default'}={}){
 const choice=facePreset(bodyType,preset),s=choice.shape;
 group.userData.customization={...group.userData.customization,facePreset:choice.id};
 if(choice.id==='default')return choice.id;
 group.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.part!=='head'||/^Ear /.test(mesh.name)||/^Ear recess /.test(mesh.name))return;
  const position=mesh.geometry.attributes.position;
  for(let i=0;i<position.count;i++){
   const x=position.getX(i),y=position.getY(i),z=position.getZ(i),ax=Math.abs(x);
   const temple=1-smooth(.28,.37,ax)*smooth(7.35,7.48,z);
   const envelope=band(z,6.975,7.04,7.60,7.63)*(1-smooth(-.08,.015,y))*temple;
   if(!envelope)continue;
   const jaw=band(z,6.99,7.08,7.19,7.36),cheek=band(z,7.17,7.32,7.43,7.54);
   const chin=band(z,6.98,7.04,7.09,7.17)*(1-smooth(.12,.30,ax));
   const nose=band(z,7.27,7.30,7.53,7.63)*(1-smooth(.085,.15,ax));
   const eye=band(z,7.45,7.495,7.567,7.595)*smooth(.065,.12,ax);
   const mouth=band(z,7.105,7.14,7.21,7.27)*(1-smooth(.145,.23,ax));
   const brow=band(z,7.56,7.585,7.61,7.63)*smooth(.05,.11,ax);
   const projection=Math.max(0,-y-.35);
   const dx=x*((s.jaw||0)*jaw+(s.cheeks||0)*cheek+(s.chin||0)*chin+(s.noseWidth||0)*nose+(s.mouth||0)*mouth+(s.eyeSpacing||0)*eye);
   const dy=-(s.noseDepth||0)*projection*nose;
   const dz=(s.chinHeight||0)*band(z,6.98,7.04,7.18,7.38)
    +(s.noseLift||0)*nose*smooth(0,.10,projection)
    +(s.eyes||0)*(z-7.532)*eye+(s.brow||0)*brow
    +(s.lips||0)*(z-7.196)*mouth;
   position.setXYZ(i,x+dx*envelope,y+dy*envelope,z+dz*envelope);
  }
  position.needsUpdate=true;mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
 });
 return choice.id;
}
