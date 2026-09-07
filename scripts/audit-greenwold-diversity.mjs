import{readFileSync,writeFileSync}from'node:fs';
import{createWorldField}from'../src/world/field.js';
import{createTerrainEdits}from'../src/world/terrain_edits.js';
import{ROUTES,sampleRoute}from'../src/mmo/greenwold/routes.js';
import{SPACES}from'../src/mmo/spaces/index.js';
import{HABITATS}from'../src/mmo/greenwold/habitats.js';
import{JOURNEY_LANDFORMS,JOURNEY_GROVES}from'./greenwold/journeys.mjs';
export function loadField(path){const f=createWorldField(20260904),e=createTerrainEdits();e.load(JSON.parse(readFileSync(path)));f.setTerrainEdits(e);return f;}
const after=loadField('public/terrain/greenwold.json'),before=loadField(process.argv[2]||'/tmp/kaldera-diversity-start/terrain.json');
const quantile=(a,q)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*q)];
function relief(f,p){const hs=[];for(const r of[0,35,70])for(let i=0;i<8;i++)hs.push(f.heightAt(p.x+Math.sin(i*Math.PI/4)*r,p.z+Math.cos(i*Math.PI/4)*r));return Math.max(...hs)-Math.min(...hs);}
const routes=ROUTES.map(r=>{const points=sampleRoute(r,35),old=points.map(p=>relief(before,p)),next=points.map(p=>relief(after,p));return {id:r.id,name:r.name,samples:points.length,before:+quantile(old,.5).toFixed(2),after:+quantile(next,.5).toFixed(2),upperRelief:+quantile(next,.9).toFixed(2)};});
export function terrainScreen(f,eye,target){const n=Math.ceil(Math.hypot(eye.x-target.x,eye.z-target.z)/2);let obstruction=-Infinity;for(let i=2;i<n-1;i++){let t=i/n;obstruction=Math.max(obstruction,f.heightAt(eye.x+(target.x-eye.x)*t,eye.z+(target.z-eye.z)*t)-(eye.y+(target.y-eye.y)*t));}return obstruction;}
const reveals=[];
for(const[id,rid]of[['highwaymanshollow','hollow-road'],['kingsroad_camp','kingsroad'],['beechhangar','mill-wood'],['coldwake','coldwake-river']]){
 const s=SPACES['greenwold_'+id],points=sampleRoute(ROUTES.find(r=>r.id===rid),10),target={...s.at,y:after.heightAt(s.at.x,s.at.z)+4};
 const samples=points.filter(p=>{let d=Math.hypot(p.x-s.at.x,p.z-s.at.z);return d>25&&d<280;}).map(p=>({x:+p.x.toFixed(2),z:+p.z.toFixed(2),distance:+Math.hypot(p.x-s.at.x,p.z-s.at.z).toFixed(1),obstruction:+terrainScreen(after,{...p,y:after.heightAt(p.x,p.z)+1.65},target).toFixed(2)}));
 reveals.push({id,route:rid,hidden:samples.filter(s=>s.obstruction>1).sort((a,b)=>a.distance-b.distance)[0]||null,visible:samples.filter(s=>s.obstruction<-.2).sort((a,b)=>a.distance-b.distance)[0]||null,samples:samples.length});
}
const report={landformsAdded:JOURNEY_LANDFORMS.length,grovesAdded:JOURNEY_GROVES.length,habitats:HABITATS.length,pieces:HABITATS.reduce((n,h)=>n+h.pieces.length,0),effects:HABITATS.reduce((n,h)=>n+(h.effects?.length||0),0),animals:HABITATS.reduce((n,h)=>n+(h.animals?.length||0),0),forage:HABITATS.reduce((n,h)=>n+(h.forage?.length||0),0),spawns:HABITATS.reduce((n,h)=>n+(h.spawns?.length||0),0),routes,reveals};
writeFileSync('docs/mmo/greenwold/diversity-measurements.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
