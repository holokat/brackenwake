// Import reviewed studio exports without editing the studio source project.
// Usage: node scripts/import-studio-structures.mjs [studio output directory]
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {budgetFor,validatePropBuffer,writeManifest} from '../tools/validate-props.mjs';
import {FOOTPRINT} from '../src/mmo/plans/footprints.js';
import {packStructure} from './structures/pack-glb.mjs';
const source=process.argv[2]||'/Users/k/code/animation-studio/outputs/structures';
const catalog=JSON.parse(readFileSync(source+'/review/catalog.json'));
const accepted=JSON.parse(readFileSync(source+'/review/visual-acceptance.json'));
const approved=new Set(accepted.records.filter(r=>r.accepted&&r.views.includes('top')).map(r=>r.id));
const hash=b=>createHash('sha256').update(b).digest('hex');
const output='public/models/props',records=[];mkdirSync(output,{recursive:true});
for(const row of catalog.records){
 assert(approved.has(row.id)&&row.roundtrip,`Unreviewed model: ${row.id}`);
 const original=readFileSync(`${source}/glb/${row.id}.glb`);assert.equal(hash(original),row.glbHash,`Export changed since review: ${row.id}`);
 const budget=budgetFor(FOOTPRINT[row.id][2],row.id).triangles;
 const packed=await packStructure(original,budget);
 const checks=validatePropBuffer(packed.buffer,row.id);
 const failures=checks.checks.filter(c=>!c.ok&&c.name!=='triangles inside the budget');assert.equal(failures.length,0,`${row.id}: ${JSON.stringify(failures)}`);
 const dest=`${output}/${row.id}.glb`;
 if(!existsSync(dest)||hash(readFileSync(dest))!==hash(packed.buffer))writeFileSync(dest,packed.buffer);
 records.push({id:row.id,sourceSha256:row.glbHash,sha256:hash(packed.buffer),bytes:packed.buffer.length,...packed.stats,originalBudget:budget,nearOverBudget:packed.stats.triangles>budget});
}
const ids=writeManifest(output),revision=hash(Buffer.from(records.map(r=>r.sha256).join('')));
writeFileSync(output+'/manifest.json',JSON.stringify({ids,revision},null,2)+'\n');
mkdirSync('docs/mmo/greenwold',{recursive:true});
writeFileSync('docs/mmo/greenwold/structure-import.json',JSON.stringify({source,studioCompletedAt:catalog.completedAt,revision,records},null,2)+'\n');
console.log(JSON.stringify({imported:records.length,bytes:records.reduce((n,r)=>n+r.bytes,0),nearTriangles:records.reduce((n,r)=>n+r.triangles,0),midTriangles:records.reduce((n,r)=>n+r.midTriangles,0),farTriangles:records.reduce((n,r)=>n+r.farTriangles,0),nearOverBudget:records.filter(r=>r.nearOverBudget).length}));
