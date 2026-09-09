// Roof envelopes travel with the actual rendered plan, including editor rebuilds.
import { STANDIN } from '../mmo/plans/footprints.js';
const ROOFED = new Set(['house','towered','stable','mill','granary','openShed','tent','well','gateTower','stall','bridge']);
export function roofEnvelope(model,x,z,y,w,d,h,yaw) {
  if(model==='meadow_arbor'||model==='meadow_fishing_awning')
    return {x,z,y:y+h-.3,w:w-.4,d:d-.5,c:Math.cos(yaw),s:Math.sin(yaw)};
  if(model==='meadow_windmill')
    return {x,z,y:y+h*.72,w:4.1*w/10,d:4.1*d/5.5,c:Math.cos(yaw),s:Math.sin(yaw)};
  if(!ROOFED.has(STANDIN[model]?.body))return null;
  // Ruined chapel has an open nave. It must keep receiving rain.
  if(model==='chapel_sunken')return null;
  return {x,z,y:y+h,w,d,c:Math.cos(yaw),s:Math.sin(yaw)};
}
export function roofHeightAt(roofs,x,z,padding=1) {
  let y=-Infinity;
  for(const r of roofs) {
    const dx=x-r.x,dz=z-r.z;
    if(Math.abs(dx*r.c-dz*r.s)<=r.w/2+padding && Math.abs(dx*r.s+dz*r.c)<=r.d/2+padding)y=Math.max(y,r.y);
  }
  return y;
}
