import manifest from '../../assets/models/cellars/descent/manifest.json' with {type:'json'};
import {worldOf,gridOf,FLOOR,ROCK} from './dungeon_gen.js';
const specs=new Map(manifest.rooms.map(r=>[r.id,r]));
export function descentRoom(L,id){return L.descent?.find(r=>r.roomId===id);}
export function inDescentRoom(room,x,z,margin=0){return Math.abs(x-room.x)<room.spec.rx+margin&&Math.abs(z-room.z)<room.spec.rz+margin;}
export function inCellarDescent(L,x,z,margin=0){return L.descent?.some(r=>inDescentRoom(r,x,z,margin))??false;}
/** Match navigable ground to each exported room's flat fighting floor. */
export function descentGroundHeight(L,x,z,original){
 for(const r of L.descent||[]){
  const dx=Math.max(0,Math.abs(x-r.x)-r.spec.rx),dz=Math.max(0,Math.abs(z-r.z)-r.spec.rz),d=Math.hypot(dx,dz);
  if(d>=12)continue;const t=d/12,s=t*t*(3-2*t);return r.y*(1-s)+original*s;
 }
 return original;
}
export function configureCellarDescent(L,height){
 if(L.level>7)return;
 const ids=L.level===1?[2,3,5,6,7,8,9]:[0,1,2,3,5,6,7,8,9];
 L.descent=ids.map(id=>{const room=L.rooms[id],p=worldOf(L,room.cx,room.cz),key=id===9?`boss-${String(L.level).padStart(2,'0')}`:['regular-crypt','regular-store','regular-chapel'][id%3],spec=specs.get(key);
  if(!spec)throw Error('Missing Blender chamber '+key);
  return{roomId:id,spec,...p,y:id===9?0:height(p.z,p.x)};
 });
 const carve=(x,z)=>{const g=gridOf(L,x,z);if(g.gx>0&&g.gz>0&&g.gx<L.w-1&&g.gz<L.h-1)L.cells[g.gz*L.w+g.gx]=FLOOR;};
 const passage=(a,b)=>{const n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z));for(let i=0;i<=n;i++)for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++)if(dx*dx+dz*dz<=25)carve(a.x+(b.x-a.x)*i/n+dx,a.z+(b.z-a.z)*i/n+dz);};
 for(const r of L.descent){
  // Reserve a solid shell band in the navigation grid and reopen only physical portals.
  for(let x=-r.spec.rx-2;x<=r.spec.rx+2;x++)for(let z=-r.spec.rz-2;z<=r.spec.rz+2;z++){
   const g=gridOf(L,r.x+x,r.z+z);if(g.gx<1||g.gz<1||g.gx>=L.w-1||g.gz>=L.h-1)continue;
   const inside=Math.abs(x)<r.spec.rx-1&&Math.abs(z)<r.spec.rz-1&&Math.abs(x)+Math.abs(z)<r.spec.rx+r.spec.rz-6;
   L.cells[g.gz*L.w+g.gx]=inside?FLOOR:ROCK;
  }
  for(const d of r.spec.doors)passage(r,{x:r.x+d.x*1.35,z:r.z+d.z*1.35});
 }
 // Every existing loop is re-routed through matching open cardinal portals at both ends.
 const doorway=(id,target)=>{
  const room=L.rooms[id],p=worldOf(L,room.cx,room.cz),r=descentRoom(L,id);if(!r)return p;
  const dx=target.x-p.x,dz=target.z-p.z,axis=Math.abs(dx/r.spec.rx)>Math.abs(dz/r.spec.rz)?'x':'z';
  return {...p,[axis]:p[axis]+Math.sign(axis==='x'?dx:dz)*((axis==='x'?r.spec.rx:r.spec.rz)+8)};
 };
 for(const {from,to}of L.passages){
  const a=worldOf(L,L.rooms[from].cx,L.rooms[from].cz),b=worldOf(L,L.rooms[to].cx,L.rooms[to].cz),da=doorway(from,b),db=doorway(to,a);
  passage(a,da);passage(da,db);passage(db,b);
 }
 for(let gz=0;gz<L.h;gz++)for(let gx=0;gx<L.w;gx++)if(L.cells[gz*L.w+gx]===FLOOR){const p=worldOf(L,gx,gz);L.heights[gz*L.w+gx]=height(p.z,p.x);}
}
