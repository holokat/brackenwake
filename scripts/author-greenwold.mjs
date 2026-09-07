// Apply the authored landscape to the existing sculpt. No placement randomness.
// Reruns replace only this pass's tagged strokes and compositions. User tile
// spaces are never touched. The legacy scatter script refuses this version.
import { readFileSync, writeFileSync } from 'node:fs';
import { SPACES } from '../src/mmo/spaces/index.js';
import { createTerrainEdits } from '../src/world/terrain_edits.js';
import { createWorldField } from '../src/world/field.js';
import { ROUTES, sampleRoute, routeDistance, nearestOnSegment } from '../src/mmo/greenwold/routes.js';
import { LANDFORMS, ARRANGEMENTS, GROVES } from './greenwold/landscape.mjs';
import { CAST, FORAGE, STATIONS, NOTES } from './greenwold/content.mjs';
import { SIGNS, DETAILS, OUTLOOKS, BOULDERS } from './greenwold/details.mjs';
import { auditSpaces } from '../src/mmo/plans/plan_schema.js';
import { writeSpaceIndex } from '../tools/editor_save.mjs';
const AUTHOR='greenwold-craft';
const path='public/terrain/greenwold.json';
const writeChanged=(path,text)=>{try{if(readFileSync(path,'utf8')===text)return;}catch{}writeFileSync(path,text);};
const terrain=JSON.parse(readFileSync(path));
terrain.strokes=terrain.strokes.filter(s=>s.author!==AUTHOR);
const f=createWorldField(20260904,{homeBiome:'meadow',homeY:-.3});
const edits=createTerrainEdits({baseHeight:(x,z)=>f.heightAt(x,z)});
edits.load(terrain);f.setTerrainEdits(edits);
const add=s=>edits.stroke({...s,author:AUTHOR});
for(const [label,kind,x,z,r,amount,length=0,yaw=0]of LANDFORMS) add({kind,x,z,r,amount,length,yaw,roughness:.18,seed:1,label});
// The pit is cut into the high side, with two working benches and a spoil yard.
for(const [x,z,r,height]of[[-581,-932,56,30],[-578,-995,36,45],[-590,-1042,42,58]])add({kind:'plateau',x,z,r,height,skirt:.78});
for(const [x,z,r]of[[-580,-947,57],[-610,-1015,52],[-694,-1008,43]])add({kind:'ground',x,z,r,word:'sand',hardness:.35});
// The nave survives on a low island. Graves near the edge remain in the mere.
add({kind:'plateau',x:-55.32,z:-960.87,r:28,height:18,skirt:.65,label:'chapel-island'});
add({kind:'plateau',x:-1030,z:337,r:46,height:23,skirt:.5,label:'beech-clearing'});
// Fit a grade to the complete route graph before writing any road. Shared
// vertices share one height, including where a return path meets the main lane.
const nodes=new Map(),routeNodes=new Map(),edges=[];
for(const r of ROUTES){
 const ns=sampleRoute(r,6).map(p=>{
   const key=p.x.toFixed(3)+','+p.z.toFixed(3);
   if(!nodes.has(key)){const sample=f.sampleAt(p.x,p.z);nodes.set(key,{...p,h:sample.water?Math.max(sample.h,sample.waterLevel+.6):sample.h,water:sample.water,links:[]});}
   return nodes.get(key);
 });
 routeNodes.set(r.id,ns);
 for(let i=1;i<ns.length;i++){const a=ns[i-1],b=ns[i],d=Math.hypot(a.x-b.x,a.z-b.z);edges.push({a,b,d});a.links.push(b);b.links.push(a);}
}
for(let pass=0;pass<4;pass++){
 const next=new Map();for(const n of nodes.values())next.set(n,n.h*.5+n.links.reduce((sum,p)=>sum+p.h,0)/n.links.length*.5);
 for(const[n,h]of next)n.h=h;
}
// Nearby approaches must agree too, even if their samples do not share an
// exact vertex. Cut a gentle grade into the slope instead of lifting a stair.
const buckets=new Map();
for(const n of nodes.values()){
 const bx=Math.floor(n.x/16),bz=Math.floor(n.z/16);
 for(let x=bx-1;x<=bx+1;x++)for(let z=bz-1;z<=bz+1;z++)for(const p of buckets.get(`${x},${z}`)||[]){
   const d=Math.hypot(n.x-p.x,n.z-p.z);if(d<16&&d>.01)edges.push({a:n,b:p,d});
 }
 const key=`${bx},${bz}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(n);
}
for(let pass=0;pass<1000;pass++){
 let change=0;
 for(const{a,b,d}of edges){
   const ah=a.h,bh=b.h;a.h=Math.min(a.h,bh+d*.12);b.h=Math.min(b.h,ah+d*.12);
   change=Math.max(change,ah-a.h,bh-b.h);
 }
 if(change<.00001)break;
}
for(const route of ROUTES){
 const ns=routeNodes.get(route.id);
 for(let i=1;i<ns.length;i++){
  const a=ns[i-1],b=ns[i];
  if(!a.water&&!b.water)add({kind:'plateau',x:a.x,z:a.z,x2:b.x,z2:b.z,r:route.width/2+22,height:a.h,height2:b.h,skirt:.35,label:route.id});
 }
 for(let i=1;i<route.points.length;i++){
  const[x,z]=route.points[i-1],[x2,z2]=route.points[i];
  add({kind:'ground',x,z,x2,z2,r:route.width/2+1.2,word:route.word||'path',hardness:.58,label:route.id});
 }
}
// Grading the approaches must not dam the river. Recut its saved channel
// through the finished banks, then build the spans over that channel.
for(const s of terrain.strokes)if(s.kind==='river'){const copy={...s};delete copy.id;add(copy);}
const spaces=structuredClone(SPACES);
for(const s of Object.values(spaces)){
  if(!s.id.startsWith('greenwold_'))continue;
  const key=s.id.slice(10);
  if(!NOTES[key])s.spawns=[];
  // Retain core plan trees and cultivated rows. Replace the old scattered woods.
  s.trees=[];
  s.forage=(FORAGE[key]||[]).map(([id,x,z,count])=>({id,x,z,count}));
  s.pieces=s.pieces.filter(p=>p.tag!==AUTHOR);
  s.rocks=s.rocks.filter(r=>/wheat|barley|furrow|reed/.test(r.kind));
  s.stations=(STATIONS[key]||[]).map(([id,x,z])=>({id,x,z,yaw:0}));
  if(NOTES[key])s.note=NOTES[key];
  if(CAST[key])for(const p of s.people||[])p.name=CAST[key][p.role]||p.name;
  if(s.id==='greenwold_hearthhome'){s.kind='town';s.safeRadius=76;}
  if(s.id==='greenwold_coldwake'){s.kind='hamlet';s.safeRadius=48;}
  // The named bodies replace their editor markers.
  s.markers=(s.markers||[]).filter(m=>!Object.values(CAST[key]||{}).some(id=>m.label?.toLowerCase().includes(id)));
}
// A second, visibly framed entrance connects the green with the north roads.
const home=spaces.greenwold_hearthhome;
home.runs=home.runs.filter(r=>{const x=(r.from.x+r.to.x)/2,z=(r.from.z+r.to.z)/2;return !(z < -29 && x>4 && x<25);});
for(const [x,z]of[[11,-42],[24,-37]])home.pieces.push({model:'lamp_post_iron',x,z,yaw:0,tag:AUTHOR});
// Trees protecting a lookout or a sett stay in the core composition. The old
// procedurally filled ring of beeches is replaced by the surrounding groves.
spaces.greenwold_beechhangar.areas=[];
spaces.greenwold_beechhangar.pieces=spaces.greenwold_beechhangar.pieces.filter((p,i)=>!/^beech_[abc]$/.test(p.model)||i<4);
// Existing bridge placeholders sat on the bed. The traversable spans below
// replace their bodies and give the renderer and feet the same surface.
for(const s of Object.values(spaces))if(s.id.startsWith('greenwold_'))s.pieces=s.pieces.filter(p=>!['stone_bridge_10m','footbridge','stepping_stones'].includes(p.model));
const round=n=>Math.round(n*100)/100;
// Each authored grove has its own streaming space. Its clear side faces the
// route; any trunk intruding onto a route is rejected and reported.
let cleared=0;
for(const [id,species,x,z,shape,deg]of GROVES){
 const sid=`greenwold_grove_${id.replaceAll('-','_')}`;
 const a=deg*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
 const s={id:sid,name:({beech:'Beech stand',oak:'Oak stand',willow:'Willow bank',birch:'Birch stand'})[species],note:`The ${id.replaceAll('-',' ')} trees frame the nearby route.`,at:{x,z},radius:100,pieces:[],runs:[],areas:[],people:[],spawns:[],trees:[],rocks:[],markers:[]};
 for(const [i,[tx,tz,scale]] of ARRANGEMENTS[shape].entries()){
   const wx=x+tx*c+tz*sn,wz=z+tz*c-tx*sn;
   if(routeDistance(wx,wz)<4 || f.sampleAt(wx,wz).water){cleared++;continue;}
   s.trees.push({species,x:round(wx-x),z:round(wz-z),scale,yaw:(deg+i*47)%360,harvest:true});
 }
 spaces[sid]=s;
}
spaces.greenwold_sunkenchapel.pieces=spaces.greenwold_sunkenchapel.pieces.filter(p=>p.model!=='lily_pad_patch');
for(const[x,z]of[[-24,23],[27,20]])spaces.greenwold_sunkenchapel.pieces.push({model:'lily_pad_patch',x,z,yaw:0,tag:AUTHOR});
// Signs are placed beside the approaches, with a clear place to stop.
for(const [key,[x,z]]of Object.entries(SIGNS)){
 const s=spaces[`greenwold_${key}`];s.pieces=s.pieces.filter(p=>p.model!=='fingerpost');
 s.pieces.push({model:'fingerpost',x,z,yaw:0,tag:AUTHOR});
}
for(const [key,ps]of Object.entries(DETAILS))for(const[model,x,z,yaw]of ps)spaces[`greenwold_${key}`].pieces.push({model,x,z,yaw,tag:AUTHOR});
for(const [key,rs]of Object.entries(BOULDERS))for(const[x,z,scale,yaw]of rs)spaces[`greenwold_${key}`].rocks.push({kind:'rock',x,z,scale,yaw,harvest:true});
for(const row of OUTLOOKS){
 const id=`greenwold_${row.id}`;
 spaces[id]={...row,id,pieces:row.pieces.map(([model,x,z,yaw])=>({model,x,z,yaw,tag:AUTHOR})),
  rocks:row.rocks.map(([x,z,scale,yaw])=>({kind:'rock',x,z,scale,yaw,harvest:true})),runs:[],areas:[],trees:[],people:[],spawns:[],markers:[],forage:[],stations:[]};
}
// The terrain water is the single lake surface; an old plan-local water disc
// would rise with the island and flood the nave for a second time.
spaces.greenwold_sunkenchapel.areas=spaces.greenwold_sunkenchapel.areas.filter(a=>a.kind!=='water');
spaces.greenwold_sunkenchapel.arrival={x:0,z:9,yaw:180};
// The workyard opens to the south. The mine mouths sit in its north bank;
// terrain supplies the chalk wall, so a stand-in wall does not block the yard.
const quarry=spaces.greenwold_chalkpits;
quarry.runs=quarry.runs.filter(r=>r.model!=='chalk_face_4m');
for(const p of quarry.pieces){if(p.model==='headframe')p.z=-24;if(p.model==='mine_mouth')p.z=-22;}
for(const r of quarry.runs)if(r.model==='rail_2m'){r.from={x:-12,z:-17};r.to={x:-12,z:-5};}
// Ore belongs to the worksite, with space to swing and carry it back to Cobb.
spaces.greenwold_chalkpits.rocks.push(...[[-22,-8,'copper'],[-21,-16,'copper'],[25,-12,'tin'],[27,-20,'tin']].map(([x,z,ore])=>({kind:'ore',x,z,ore,scale:.8,yaw:0,harvest:true})));
spaces.greenwold_chalkpits.arrival={x:0,z:22,yaw:180};
// Coldwake gives the southern loop an owned return point.
spaces.greenwold_coldwake.pieces.push({model:'waystone_village',x:12,z:-8,yaw:250,tag:AUTHOR});
// The first fight is one badger by the bank. Larger groups are off the path.
spaces.greenwold_beechhangar.spawns=[{id:'badger',x:-20,z:-6},{id:'boar',x:60,z:26},{id:'wildDog',x:77,z:-20},{id:'wildDog',x:90,z:-12},{id:'oldGrist',x:30,z:-10,night:true},{id:'wolf',x:63,z:55,night:true},{id:'giantSpider',x:-60,z:46,night:true}];
spaces.greenwold_highwaymanshollow.spawns=[{id:'banditArcher',x:-10,z:-8},{id:'highwayman',x:5,z:-9},{id:'bandit',x:-4,z:4},{id:'bandit',x:6,z:0},{id:'goblinScout',x:16,z:-19,night:true}];
// Capture crossings from the explicitly drawn lines. Each surface is a small
// polyline whose two ends are anchored to dry ground, above the water between.
const bridges=[];
for(const route of ROUTES){
 const pts=sampleRoute(route,2),samples=pts.map(p=>f.sampleAt(p.x,p.z));
 for(let i=0;i<pts.length;i++){
   if(!samples[i].water)continue;
   const first=i;while(i+1<pts.length&&samples[i+1].water)i++;
   const covered=pts.slice(first,i+1).every(p=>bridges.some(b=>b.points.slice(1).some((q,k)=>nearestOnSegment(p.x,p.z,[b.points[k][0],b.points[k][2]],[q[0],q[2]]).d<=b.width/2)));
   if(covered)continue;
   const start=Math.max(0,first-20),end=Math.min(pts.length-1,i+20);
   const a=pts[start],b=pts[end];
   if(bridges.some(br=>Math.hypot(br.points[0][0]-a.x,br.points[0][2]-a.z)<8&&Math.hypot(br.points.at(-1)[0]-b.x,br.points.at(-1)[2]-b.z)<8))continue;
   const bank=6;
   const level=Math.max(...samples.slice(Math.max(0,first-bank),Math.min(samples.length,i+bank+1)).map(s=>Math.max(s.h,s.water?s.waterLevel+.55:-Infinity)));
   const heights=samples.slice(start,end+1).map((sample,k)=>Math.max(sample.h,sample.water?sample.waterLevel+.55:-Infinity,k>=4&&k<=end-start-4&&k+start>=first-bank&&k+start<=i+bank?level:-Infinity));
   // A continuous deck above the entire wet run, with graded approaches.
   // Preserve the water height at route endpoints as well as in the middle.
   for(let pass=0;pass<heights.length;pass++)for(let k=1;k<heights.length;k++){
     const d=Math.hypot(pts[start+k].x-pts[start+k-1].x,pts[start+k].z-pts[start+k-1].z);
     heights[k]=Math.max(heights[k],heights[k-1]-d*.35);
     heights[k-1]=Math.max(heights[k-1],heights[k]-d*.35);
   }
   const points=heights.map((y,k)=>[pts[start+k].x,y,pts[start+k].z]);
   bridges.push({id:`${route.id}-${bridges.length}`,name:route.name,width:route.width,points});
 }
}
// Runtime and editor both consume the saved stroke list.
const result=edits.serialize();result.authoring=AUTHOR;result.version=terrain.version||1;
auditSpaces(spaces);
writeChanged(path,JSON.stringify(result,null,2)+'\n');
for(const s of Object.values(spaces))if(s.id.startsWith('greenwold_'))writeChanged(`src/mmo/spaces/${s.id}.json`,JSON.stringify(s,null,2)+'\n');
writeSpaceIndex(process.cwd());
writeChanged('src/mmo/greenwold/traversal.json',JSON.stringify({author:AUTHOR,bridges},null,2)+'\n');
console.log(JSON.stringify({routes:ROUTES.length,groves:GROVES.length,trees:Object.values(spaces).reduce((n,s)=>n+s.trees.length,0),trunksKeptOffRoutes:cleared,bridges:bridges.length,strokes:result.strokes.length}));
