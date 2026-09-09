// Regenerates only this meadow's owned space and paint strokes.
import fs from 'node:fs';
import {createTerrainEdits} from '../../../src/world/terrain_edits.js';
import {createWorldField} from '../../../src/world/field.js';
const root=new URL('../../../',import.meta.url),file=p=>new URL(p,root);
const town={x:40,z:300},at={x:30,z:396};
const main=[[8,330],[0,342],[-5,353],[-5,361],[8,365],[28,374],[42,387],[32,403],[39,418],[44,432],[40,447]];
const loop=[[8,365],[-15,370],[-34,381],[-35,397],[-18,414],[4,421],[25,414],[32,403]];
const mill=[[28,374],[47,374],[61,383],[76,385],[77,381]];
const shore=[[39,418],[23,424],[10,432]];
const paths=[main,loop,mill,shore];
const distance=(x,z,paths)=>Math.min(...paths.flatMap(points=>points.slice(1).map((b,i)=>{const a=points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);} )));
const t=JSON.parse(fs.readFileSync(file('public/terrain/island.json')));
t.strokes=t.strokes.filter(s=>s.source!=='haven_meadow');
// Replace the two disconnected straight cobble strips, preserving stroke IDs.
for(const s of t.strokes)if([829,830].includes(s.id)&&s.kind==='ground'&&s.x===40)s.word='grass';
let id=Math.max(...t.strokes.map(s=>s.id||0))+1;
const paint=(a,b,r,word='sand',hardness=.6)=>t.strokes.push({kind:'ground',word,x:a[0],z:a[1],x2:b[0],z2:b[1],r,hardness,opacity:1,amount:1,id:id++,source:'haven_meadow'});
// Catmull-Rom turns the route into a continuous painted curve, with soft edges.
function smooth(points){const out=[];for(let i=0;i<points.length-1;i++){
 const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
 for(let j=0;j<5;j++){const t=j/5;out.push([0,1].map(k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t)));}
}out.push(points.at(-1));return out;}
const curves=paths.map(smooth);
curves.forEach((p,j)=>p.slice(1).forEach((b,i)=>paint(p[i],b,j===0?3.8:2.7)));
for(const[x,z,r]of[[77,378,5.2],[-25,386,6],[10,434,5.3]])paint([x,z],[x,z],r,'sand',.65);
fs.writeFileSync(file('public/terrain/island.json'),JSON.stringify(t,null,2)+'\n');
const f=createWorldField(20260908,{homeBiome:'meadow',homeY:-.3});const e=createTerrainEdits({baseHeight:(x,z)=>f.heightAt(x,z)});e.load(t);f.setTerrainEdits(e);
const space={id:'island_kite_meadow',name:'The kite meadow',note:'Canvas sails turn above the flowers. The sandy trail winds from Haven to the fishing shelter and the quay.',at,radius:126,pieces:[],runs:[],areas:[],people:[],spawns:[],trees:[],rocks:[],markers:[]};
const piece=(model,x,z,yaw=0,scale=1)=>space.pieces.push({model,x:+(x-at.x).toFixed(2),z:+(z-at.z).toFixed(2),yaw,scale});
piece('meadow_windmill',77,378,5);piece('meadow_arbor',-25,386,-20);piece('meadow_cart',-26,378,35);
piece('meadow_fishing_awning',10,434,-10);piece('meadow_skiff',1,437,-30);
for(const p of space.pieces)if(['meadow_windmill','meadow_arbor','meadow_fishing_awning'].includes(p.model))p.clearForage=true;
piece('meadow_kite',96,407,25,1);piece('meadow_kite',84,421,-20,.8);
for(const[x,z,yaw]of[[67,369,-25],[71,367,0],[75,367,10],[79,368,25],[84,369,40],[88,372,55],[90,376,75],[90,380,92],[-36,375,-25],[-40,380,45],[-42,385,75],[-41,389,100]])piece('meadow_wall',x,z,yaw,.9);
for(const[x,z,k,yaw]of[[96,381,1.3,0],[54,390,.85,20],[-42,404,1.1,130],[-7,427,.8,50],[105,423,.95,10],[67,433,.7,35],[7,356,.65,80]])piece('meadow_chalk',x,z,yaw,k);
const treePoints=[[-8,361,.8],[-48,380,1],[-50,400,.85],[-29,415,.78],[-14,430,.7],[4,403,.85],[49,407,.65],[68,370,.72],[96,368,1.05],[107,379,.77],[112,399,.75],[-51,359,.7],[107,348,1],[-60,421,.75]];
for(const[x,z,scale]of treePoints)space.trees.push({species:'oak',x:x-at.x,z:z-at.z,yaw:(x*7+z*3)%360,scale});
let seed=341;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const fixtures=space.pieces.filter(p=>!p.model.includes('wall'));
let patches=0;
for(let z=350;z<444;z+=7.6)for(let x=-62;x<116;x+=8.1){
 const wx=x+(rand()-.5)*3,wz=z+(rand()-.5)*3;
 if(Math.hypot(wx-town.x,wz-town.z)<77||f.heightAt(wx,wz)<1.55||distance(wx,wz,curves)<7.1)continue;
 if(fixtures.some(p=>Math.hypot(wx-(p.x+at.x),wz-(p.z+at.z))<(p.model==='meadow_windmill'?7:5.5)))continue;
 if(treePoints.some(([x,z])=>Math.hypot(wx-x,wz-z)<3.2))continue;
 if(rand()<.12)continue;
 const drift=Math.sin(wx*.045+wz*.06)+Math.cos(wz*.085-wx*.023);
 const model=drift>.65?'meadow_lavender':drift<-.2?'meadow_buttercups':'meadow_daisies';
 piece(model,wx,wz,Math.round(rand()*360),.85+rand()*.35);patches++;
}
for(let x=-60;x<120;x+=11){const z=449-((x+40)/160)*16;if(distance(x,z,curves)>6)piece('meadow_grasses',x,z,Math.round(rand()*360),1+rand()*.3);}
fs.writeFileSync(file('src/mmo/spaces/island_kite_meadow.json'),JSON.stringify(space,null,2)+'\n');
fs.mkdirSync(file('scripts/art/haven-meadow/work'),{recursive:true});
const samples=[];for(let z=316;z<=468;z+=2)for(let x=-74;x<=136;x+=2)samples.push([x,z,f.heightAt(x,z),f.sampleAt(x,z).ground]);
fs.writeFileSync(file('scripts/art/haven-meadow/work/terrain.json'),JSON.stringify({samples}));
fs.writeFileSync(file('assets/models/haven-meadow/routes.json'),JSON.stringify({at,paths:curves},null,2)+'\n');
console.log({pieces:space.pieces.length,flowerPatches:patches,trees:space.trees.length,paintStrokes:t.strokes.filter(s=>s.source==='haven_meadow').length});
