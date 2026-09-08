import {CELL, ROCK, FLOOR, worldOf} from './dungeon_gen.js';
export const SHOULDER_ID = 'shoulder-working';
export const isShoulder = site => site?.space === 'island_mine_east' || site?.sub === 'island_mine_east' || site?.dungeon === SHOULDER_ID || site?.id === 's:island_mine_east';
export const SHOULDER_SPEC = {id:SHOULDER_ID,kind:'cave',levels:1,tier:2,arena:false};
// Coordinates are cells, two metres apiece. Cross passages make loops, not a linear tour.
export const MINE_ROOMS = [
 ['Lamp room',65,148,22,20,'entry'], ['The haulage cathedral',49,103,48,34,'hall'],
 ['West iron workings',8,111,28,25,'room'], ['Broken pump house',112,119,27,28,'room'],
 ['The hanging galleries',10,65,34,30,'hall'], ['The black junction',57,57,34,29,'hall'],
 ['The drowned engine',112,73,30,26,'room'], ['The widow vault',57,9,44,31,'boss'],
 ['The blind assay',9,15,30,28,'room'], ['The last refuge',116,19,28,30,'room'],
 ['Forgotten stope',24,157,18,18,'room'], ['The lost tally',118,160,21,18,'room'],
];
export const MINE_ROUTES = [[76,158,76,24,5],[22,123,126,123,4],[26,80,127,86,4],
 [23,30,129,34,3],[23,30,23,168,3],[128,34,128,168,3],[76,158,33,166,3],
 [76,158,128,167,3],[26,80,76,72,3],[76,72,128,34,3],[23,123,76,72,3]];
export function mineHeight(z) {
 // Three working elevations connected by long accessible inclines.
 if(z>100)return 0;if(z>60)return (100-z)*.1;if(z>-25)return 4;
 if(z>-65)return 4+(-25-z)*.1;return 8;
}
export function createShoulderWorking(seed,site) {
 const w=152,h=188;
 const L={id:site.id,siteId:SHOULDER_ID,name:'The Shoulder Working',seed,cx:site.cx||0,cz:site.cz||0,
 kind:'cave',authored:true,level:1,top:1,bottom:true,w,h,cellSize:CELL,corridorW:5,
 cells:Array(w*h).fill(ROCK),heights:Array(w*h).fill(0),rooms:MINE_ROOMS.map(([name,x,z,w,h,kind],i)=>({id:i,name,x,z,w,h,cx:x+(w>>1),cz:z+(h>>1),kind})),
 entrance:{gx:76,gz:162},stair:null,tags:{},ore:[],chests:[],authoredSpawns:[],torchCells:[],arena:null,tier:2,
 ceilingProfile:{corridor:13,room:27,hall:38,boss:46},
 palette:{floor:0x514b40,wallA:0x55515b,wallB:0x3d424b,ceiling:0x303641,bg:0x03060b,fog:0x07101a,fogNear:15,fogFar:110,ambient:0x617a94,ambientI:.3,fill:0x537288,fillI:.26}};
 const carve=(x,z)=>{if(x>0&&z>0&&x<w-1&&z<h-1){L.cells[z*w+x]=FLOOR;L.heights[z*w+x]=mineHeight(worldOf(L,x,z).z);}};
 for(const r of L.rooms)for(let z=r.z;z<r.z+r.h;z++)for(let x=r.x;x<r.x+r.w;x++) {
  const u=(x-r.cx)/(r.w*.53),v=(z-r.cz)/(r.h*.55);if(u*u+v*v<1.03)carve(x,z);
 }
 for(const [ax,az,bx,bz,width] of MINE_ROUTES){const n=Math.ceil(Math.hypot(bx-ax,bz-az));for(let t=0;t<=n;t++)for(let dz=-width;dz<=width;dz++)for(let dx=-width;dx<=width;dx++)if(dx*dx+dz*dz<=width*width)carve(Math.round(ax+(bx-ax)*t/n)+dx,Math.round(az+(bz-az)*t/n)+dz);}
 const spawn=(id,gx,gz,room)=>{L.authoredSpawns.push({id,gx,gz,room,group:'working-'+room,slot:L.authoredSpawns.length});};
 for(const i of [2,3,4,5,6,7,8,9,10,11]){const r=L.rooms[i];spawn('giantSpider',r.cx-3,r.cz+3,i);spawn('giantSpider',r.cx+4,r.cz-3,i);if(i>3)spawn(i===7?'wraith':'skeleton',r.cx,r.cz,i);}
 for(const i of [0,2,3,4,6,7,8,9,10,11]){const r=L.rooms[i],gx=r.cx,gz=r.cz-3,p=worldOf(L,gx,gz);L.chests.push({i:L.chests.length,gx,gz,...p,y:mineHeight(p.z),kind:i===0?'cache':'chest',locked:i===7||i===8,trapped:i===7||i===6,tier:i===7?3:2,key:SHOULDER_ID+':cache:'+i});L.tags[gz*w+gx]='chest';}
 for(const r of L.rooms){for(const d of [-1,1]){const gx=r.cx+d*4,gz=r.cz;L.torchCells.push([gx,gz]);}}
 // Non-wall braziers are built in halls; additional work lamps are furnished separately.
 L.tags[L.entrance.gz*w+L.entrance.gx]='entrance';return L;
}
