import {CELLAR_BOSS_BY_DEPTH} from '../mmo/cellar_bosses.js';
import {configureCellarDescent} from './cellar_descent_layout.js';
import {CELL,ROCK,FLOOR,worldOf} from './dungeon_gen.js';
import {CELLAR_DEPTHS,RAID} from '../mmo/cellar_raid_rules.js';
import {configureCellarLandmark,clearCellarPlacement,cellarGroundHeight} from './cellar_landmark_layout.js';
import {configureCellarEntry,entryGroundHeight} from './cellar_entry_layout.js';
export const CELLAR_THEMES=[
 {name:'The occupied cellars',room:'Broken wine vault',color:0xd29a62,ore:0x514f48,foes:['bandit','banditArcher','skeleton'],ceiling:18},
 {name:'The drowned ossuary',room:'The sunken reliquary',color:0x67c5c9,ore:0x354957,foes:['skeleton','ossuaryCrawler','wraith'],ceiling:23},
 {name:'The tomb of bells',room:'The bellkeeper’s tomb',color:0xa799e8,ore:0x494452,foes:['hushWraith','boneKnight','wraith'],ceiling:28},
 {name:'The ember catacombs',room:'The funeral furnace',color:0xff9956,ore:0x514039,foes:['emberRevenant','hushWraith','lich'],ceiling:33},
 {name:'The chained library',room:'The lich’s archive',color:0x80cfb1,ore:0x354a47,foes:['chainedLich','emberRevenant','lich'],ceiling:39},
 {name:'The inverted crypt',room:'The hanging sarcophagi',color:0x94b3ed,ore:0x3b414f,foes:['vaultBehemoth','chainedLich','hushWraith'],ceiling:46},
 {name:'The titan graves',room:'The grave of the first king',color:0xc8a7ed,ore:0x413749,foes:['sepulcherWarden','vaultBehemoth','chainedLich'],ceiling:55},
 {name:'The buried cathedral',room:'The heart beneath the world',color:0xf0be74,ore:0x34353d,foes:['sepulcherWarden','vaultBehemoth'],ceiling:82},
];
export function cellarHeight(level,z){
 // Landings at both exits are flat; the interior descends, climbs and drops
 // again along continuous slopes, shared by geometry and character physics.
 if(level===8)return 0;
 const t=Math.max(0,Math.min(1,(165-z)/315));
 const original=t<.08||t>.94?0:Math.sin((t-.08)/.86*Math.PI*4)*(3+level*.6);
 return level===1?entryGroundHeight(z,original):original;
}
export function createOldCellars(seed,site,depth=1){
 const level=Math.max(1,Math.min(CELLAR_DEPTHS,Math.floor(depth))),theme=CELLAR_THEMES[level-1];
 const w=level===8?192:144,h=level===8?216:196;
 const room=(id,name,cx,cz,rw,rh,kind='room')=>({id,name,cx,cz,x:cx-Math.floor(rw/2),z:cz-Math.floor(rh/2),w:rw,h:rh,kind});
 const rooms=level===8?[
  room(0,'The last vigil',96,195,28,22,'entry'),room(1,'The threshold of ten',96,162,36,30,'hall'),
  room(2,theme.room,96,92,82,82,'boss'),room(3,'Western reliquary',31,95,30,34),room(4,'Eastern reliquary',161,95,30,34),room(5,'The silent apse',96,26,38,28),
 ]:[room(0,'The returning stair',72,181,24,22,'entry'),
  room(1,'The broken nave',68+(level%3)*4,146,38,30,'hall'),room(2,'Forgotten burial chambers',26,147,30,34),
  room(3,'The side crypt',119,151,28,26),room(4,theme.room,70,101,48,38,'hall'),
  room(5,'The abandoned crossing',27,97,32,30),room(6,'The sealed memorials',117,104,32,38),
  room(7,'The watcher’s chamber',42,54,34,30),room(8,'The tomb of names',109,51,36,34),
  room(9,'The descending vault',74,18,35,26,'boss')];
 const L={id:site.id,siteId:'oldcellars',name:theme.name,seed,cx:site.cx||0,cz:site.cz||0,kind:'cave',authored:true,level,top:CELLAR_DEPTHS,bottom:level===CELLAR_DEPTHS,w,h,cellSize:CELL,corridorW:5,
 cells:Array(w*h).fill(ROCK),heights:Array(w*h).fill(0),rooms,entrance:{gx:rooms[0].cx,gz:rooms[0].cz},stair:level===8?null:{gx:74,gz:15},arena:null,tags:{},ore:[],chests:[],authoredSpawns:[],torchCells:[],tier:Math.min(5,1+Math.ceil(level/2)),theme,
 ceilingProfile:{corridor:12+level*2,room:theme.ceiling,hall:theme.ceiling+5,boss:theme.ceiling},
 palette:{floor:theme.ore,wallA:theme.ore,wallB:0x55545b,ceiling:0x343945,bg:0x060910,fog:0x0d1620,fogNear:level===8?60:25,fogFar:level===8?230:140,ambient:0x8197b2,ambientI:.24,fill:theme.color,fillI:.16}};
 const carve=(x,z)=>{if(x>0&&z>0&&x<w-1&&z<h-1){const i=z*w+x;L.cells[i]=FLOOR;L.heights[i]=cellarHeight(level,worldOf(L,x,z).z);}};
 for(const r of rooms)for(let z=r.z;z<r.z+r.h;z++)for(let x=r.x;x<r.x+r.w;x++){
  const u=(x-r.cx)/(r.w*.5),v=(z-r.cz)/(r.h*.5),a=Math.atan2(v,u);
  const edge=1+.08*Math.sin(a*(3+level%3)+r.id)+.05*Math.cos(a*7+level);
  if(u*u+v*v<edge)carve(x,z);
 }
 const links=level===8?[[0,1],[1,2],[2,3],[2,4],[3,5],[4,5]]:[[0,1],[1,2],[1,3],[1,4],[2,5],[3,6],[5,4],[4,6],[5,7],[6,8],[7,9],[8,9],[7,8]];
 L.passages=links.map(([from,to])=>({from,to}));
 for(const [from,to] of links){const a=rooms[from],b=rooms[to],n=Math.ceil(Math.hypot(b.cx-a.cx,b.cz-a.cz));
  for(let i=0;i<=n;i++){const t=i/n,bend=Math.sin(t*Math.PI)*(level%2?4:-4),gx=Math.round(a.cx+(b.cx-a.cx)*t+bend),gz=Math.round(a.cz+(b.cz-a.cz)*t);
   for(let dz=-4;dz<=4;dz++)for(let dx=-4;dx<=4;dx++)if(dx*dx+dz*dz<18)carve(gx+dx,gz+dz);
  }
 }
 configureCellarLandmark(L,z=>cellarHeight(level,z));
 configureCellarEntry(L,(z,x)=>cellarGroundHeight(L,x,z,z=>cellarHeight(level,z)));
 configureCellarDescent(L,(z,x)=>cellarGroundHeight(L,x,z,z=>cellarHeight(level,z)));
 L.tags[L.entrance.gz*w+L.entrance.gx]='entrance';if(L.stair)L.tags[L.stair.gz*w+L.stair.gx]='stair';
 for(const r of rooms.slice(1)){
  if((level===8&&r.id===2)||(level>=2&&level<=7&&r.id===9))continue;
  for(let i=0;i<(level===8?2:3+(r.id%2));i++){
   const id=theme.foes[(i+r.id)%theme.foes.length],{gx,gz}=clearCellarPlacement(L,r.cx+(i%2?4:-4),r.cz+(i<2?3:-4));
   L.authoredSpawns.push({id,gx,gz,room:r.id,group:`crypt:${r.id}`,slot:L.authoredSpawns.length,power:1+(level-1)*.16,size:1+(level-1)*.055});
  }
  if(r.id%2===0){const {gx,gz}=clearCellarPlacement(L,r.cx,r.cz-5);L.chests.push({i:L.chests.length,gx,gz,...worldOf(L,gx,gz),y:0,kind:'chest',locked:true,trapped:level>2,tier:L.tier,key:`oldcellars:${level}:tomb:${r.id}`});L.tags[gz*w+gx]='chest';}
 }
 if(level===1)L.authoredSpawns.push({id:'oramBlackhand',gx:74,gz:23,room:9,group:'oram',slot:99});
 const depthBoss=CELLAR_BOSS_BY_DEPTH[level];
 if(depthBoss)L.authoredSpawns.push({id:depthBoss.id,gx:74,gz:21,room:9,group:'cellar-boss:'+level,slot:99});
 for(const r of rooms)for(const dx of [-6,6])L.torchCells.push([r.cx+dx,r.cz+6]);
 if(level===8)L.raid={...RAID};return L;
}
// Existing callers can still inspect the first level's authored topology.
export const CELLAR_ROOMS=createOldCellars(1,{id:'oldcellars'}).rooms;
export const CELLAR_PASSAGES=createOldCellars(1,{id:"oldcellars"}).passages;
