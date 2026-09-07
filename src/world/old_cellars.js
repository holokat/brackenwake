// The mill's occupied cellars: broad fighting rooms, two flanking loops, and
// a defended command hall. Every room, patrol and furnishing has a fixed place.
import {CELL,ROCK,FLOOR,worldOf} from './dungeon_gen.js';
export const CELLAR_ROOMS=[
 ['entry',40,88,16,16,'entry'], ['stores',13,68,20,16,'room'],
 ['guardroom',38,64,20,18,'hall'], ['cistern',67,65,18,19,'room'],
 ['crypt',12,32,20,22,'room'], ['crosshall',39,34,19,20,'hall'],
 ['barracks',67,32,19,20,'room'], ['command',35,5,28,20,'boss'],
 ['vault',10,9,16,14,'room'],
];
// Centre lines and widths in grid cells. The centre route is 12 m wide;
// flanking routes are 8 m wide, wide enough to fight while passing a companion.
export const CELLAR_PASSAGES=[
 [48,96,48,15,6], [23,76,76,76,4], [23,76,23,43,4],
 [23,43,76,43,4], [76,76,76,43,4], [18,43,18,16,4],
];
export function createOldCellars(seed,site){
 const w=96,h=112;
 const L={kind:'dungeon',authored:true,level:1,top:1,bottom:true,w,h,cellSize:CELL,corridorW:6,
  id:site.id,siteId:'oldcellars',name:site.name,seed,cx:site.cx||0,cz:site.cz||0,
  cells:Array(w*h).fill(ROCK),rooms:CELLAR_ROOMS.map(([id,x,z,w,h,kind])=>({id,x,z,w,h,cx:x+(w>>1),cz:z+(h>>1),kind})),
  entrance:{gx:48,gz:98},stair:null,tags:{},ore:[],chests:[],arena:7,bossLair:'oldcellars',tier:2,
  ceilingProfile:{corridor:10,room:12,hall:14,boss:18},
  palette:{floor:0x766b5c,wallA:0x826c5a,wallB:0x695b52,ceiling:0x3e434a,
   bg:0x090f17,fog:0x101923,fogNear:14,fogFar:85,ambient:0x879fb3,ambientI:.34,fill:0x739bb7,fillI:.3},
  authoredSpawns:[],torchCells:[],furnishings:[],
 };
 const carve=(x,z)=>{if(x>0&&z>0&&x<w-1&&z<h-1)L.cells[z*w+x]=FLOOR;};
 for(const r of L.rooms)for(let z=r.z;z<r.z+r.h;z++)for(let x=r.x;x<r.x+r.w;x++)carve(x,z);
 for(const [x1,z1,x2,z2,width] of CELLAR_PASSAGES){
  const n=Math.max(Math.abs(x2-x1),Math.abs(z2-z1));
  for(let i=0;i<=n;i++)for(let a=-width/2;a<width/2;a++)carve(x1+Math.sign(x2-x1)*i+(x1===x2?a:0),z1+Math.sign(z2-z1)*i+(z1===z2?a:0));
 }
 L.tags[L.entrance.gz*w+L.entrance.gx]='entrance';
 // Squads share a rally group; chambers keep their own fights.
 const squad=(room,group,units)=>units.forEach(([id,gx,gz])=>L.authoredSpawns.push({id,gx,gz,room,group,slot:L.authoredSpawns.length}));
 squad(2,'gate',[['bandit',44,78],['bandit',51,78],['banditArcher',42,70],['banditArcher',53,70],['bandit',46,72],['bandit',49,72]]);
 squad(1,'stores',[['giantRat',17,79],['giantRat',20,80],['giantRat',17,74],['bandit',26,79],['bandit',29,74],['banditArcher',28,70]]);
 squad(3,'cistern',[['giantSpider',70,80],['giantSpider',80,80],['giantRat',71,68],['giantRat',80,68],['giantRat',81,75]]);
 squad(4,'crypt',[['goblinScout',16,49],['goblinWarrior',21,50],['goblinWarrior',27,49],['goblinScout',16,36],['goblinWarrior',23,36],['giantSpider',28,36],['giantSpider',28,43]]);
 squad(5,'crosshall',[['bandit',43,50],['bandit',52,50],['bandit',44,44],['bandit',52,44],['banditArcher',42,37],['banditArcher',54,37]]);
 squad(6,'barracks',[['bandit',70,47],['bandit',75,47],['bandit',81,47],['bandit',71,40],['banditArcher',77,35],['banditArcher',82,35]]);
 squad(8,'vault',[['goblinWarrior',13,18],['goblinWarrior',22,18],['goblinScout',13,12],['goblinScout',22,12]]);
 squad(7,'hall-door',[['bandit',39,22],['bandit',45,22],['bandit',52,22],['bandit',59,22],['banditArcher',39,16],['banditArcher',59,16]]);
 squad(7,'oram',[['oramBlackhand',49,11],['bandit',45,11],['bandit',53,11],['banditArcher',40,8],['banditArcher',58,8]]);
 for(const [gx,gz,kind] of [[49,7,'chest'],[18,11,'chest'],[30,81,'cache'],[82,50,'cache'],[13,51,'cache']]){
  const i=L.chests.length;L.tags[gz*w+gx]='chest';L.chests.push({i,gx,gz,...worldOf(L,gx,gz),y:0,kind,locked:kind==='chest',trapped:false,tier:2,key:`oldcellars:1:authored:${i}`});
 }
 // Sconces follow walls and corridor mouths. No random braziers in the lanes.
 for(const r of L.rooms)for(const dx of [2,r.w-3])for(const dz of [0,r.h-1])L.torchCells.push([r.x+dx,r.z+dz]);
 for(const gz of [28,58,85])L.torchCells.push([45,gz],[50,gz]);
 const add=(kind,gx,gz,w,d,h,yaw=0)=>L.furnishings.push({kind,gx,gz,w,d,h,yaw,...worldOf(L,gx,gz)});
 // Cargo against store walls, bunks against the barracks walls, stone tombs
 // inside the crypt, and a ringed cistern leaving a generous aisle on each side.
 for(const gz of [71,76,81])add('cargo',14,gz,2.4,3.2,2.4);
 for(const gz of [34,40,47]){add('bunk',68,gz,2.2,4.2,2.7);add('bunk',84,gz,2.2,4.2,2.7);}
 for(const gz of [38,46])for(const gx of [14,30])add('tomb',gx,gz,2.2,4.2,1.5);
 add('cistern',76,74,10,12,1.3);
 add('table',49,8,6,2.8,1.5);
 for(const gx of [36,61])for(const gz of [10,18])add('column',gx,gz,1.5,1.5,18);
 return L;
}
