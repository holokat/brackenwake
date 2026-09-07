// Selection is shared by the renderer and the audit. It never changes the day
// factor used by combat, story gates or nocturnal spawns.
export const LIVING_LIMITS=Object.freeze({effects:6,animals:6,lights:4,effectDistance:80,animalDistance:65,lightDistance:45});
export function habitatGate(gate,day,weather={}){
 if(gate==='night')return day<.3;
 if(gate==='day')return day>.4;
 if(gate==='fair')return day>.5&&(weather.rain||0)<.15&&(weather.snow||0)<.1;
 return true;
}
export function livingRows(spaces){
 const rows={effects:[],animals:[],lights:[]};
 for(const h of Object.values(spaces))for(const type of Object.keys(rows))for(const [i,r]of(h[type]||[]).entries())rows[type].push({...r,key:`${h.id}:${type}:${i}`,x:h.at.x+r.x,z:h.at.z+r.z,habitat:h.id});
 return rows;
}
export function selectLiving(rows,type,eye,day,weather,hidden=false){
 if(hidden)return[];
 const range=LIVING_LIMITS[type==='effects'?'effectDistance':type==='animals'?'animalDistance':'lightDistance'];
 return rows.filter(r=>habitatGate(r.gate||(type==='lights'?'night':'always'),day,weather)&&Math.hypot(r.x-eye.x,r.z-eye.z)<range)
  .sort((a,b)=>Math.hypot(a.x-eye.x,a.z-eye.z)-Math.hypot(b.x-eye.x,b.z-eye.z)).slice(0,LIVING_LIMITS[type]);
}
// Overlapping ellipses follow the wooded routes rather than the circular POI
// label. A soft edge prevents lighting steps as the player enters a canopy.
const CANOPIES=[[-1095,30,88,345],[-996,158,75,235],[-1030,338,120,105],[-149,-297,60,125],[-324,-2,130,47]];
export function canopyAt(x,z){
 let cover=0;for(const[cx,cz,rx,rz]of CANOPIES){const d=Math.hypot((x-cx)/rx,(z-cz)/rz),t=Math.max(0,Math.min(1,(1-d)/.3));cover=Math.max(cover,t*t*(3-2*t));}return cover;
}
