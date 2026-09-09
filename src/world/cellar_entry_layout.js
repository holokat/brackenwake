import plan from '../../assets/models/cellars/entry/layout.json' with {type:'json'};
import {worldOf, gridOf, FLOOR} from './dungeon_gen.js';

export const CELLAR_ENTRY_PLAN = plan;
export function hasCellarEntry(L) { return L.level === 1 && L.siteId === 'oldcellars'; }
export function entryGroundHeight(z, original) {
    if (z >= 147) return 0;
    if (z >= 125) return -3 * (147-z)/22;
    if (z >= 64) return -3;
    if (z >= 48) { const t=(64-z)/16; return -3*(1-t)+original*t; }
    return original;
}
export function inEntryRegion(L, x, z, margin=0) {
    if (!hasCellarEntry(L)) return false;
    x-=plan.origin.x; z-=plan.origin.z;
    if(Math.abs(x)<plan.corridor.w/2+margin && z< -20+margin && z> -42-margin)return true;
    return plan.rooms.some(r=>Math.abs(x-r.x)<r.rx+margin && Math.abs(z-r.z)<r.rz+margin);
}
/** Carve the model's exact interior and connect its four open portals to the cave. */
export function configureCellarEntry(L, height) {
    if(!hasCellarEntry(L))return;
    const carve=(x,z)=>{const g=gridOf(L,x,z);if(g.gx>0&&g.gz>0&&g.gx<L.w-1&&g.gz<L.h-1)L.cells[g.gz*L.w+g.gx]=FLOOR;};
    for(const r of plan.rooms){
        // The physical octagonal shell excludes its chamfered corners.
        for(let x=-r.rx;x<=r.rx;x+=1)for(let z=-r.rz;z<=r.rz;z+=1)
            if(Math.abs(x)+Math.abs(z)<=r.rx+r.rz-5)carve(plan.origin.x+r.x+x,plan.origin.z+r.z+z);
    }
    const passage=(a,b,width=5)=>{
        const n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z));
        for(let i=0;i<=n;i++){const t=i/n;for(let dx=-width;dx<=width;dx++)for(let dz=-width;dz<=width;dz++)
            if(dx*dx+dz*dz<=width*width)carve(a.x+(b.x-a.x)*t+dx,a.z+(b.z-a.z)*t+dz);}
    };
    passage({x:1,z:147},{x:1,z:125});
    for(const [door,room] of [[{x:-40,z:97},2],[{x:42,z:97},3],[{x:1,z:63},4]]){
        passage({x:1,z:97},door,6);
        passage(door,worldOf(L,L.rooms[room].cx,L.rooms[room].cz),6);
    }
    L.entrance=gridOf(L,plan.origin.x+plan.return.x,plan.origin.z+plan.return.z);
    for(let z=0;z<L.h;z++)for(let x=0;x<L.w;x++)if(L.cells[z*L.w+x]===FLOOR){const p=worldOf(L,x,z);L.heights[z*L.w+x]=height(p.z,p.x);}
}
