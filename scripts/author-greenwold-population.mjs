import {readFileSync,writeFileSync} from 'node:fs';
import {SPACES} from '../src/mmo/spaces/index.js';
import {authorPopulation,populationIds} from './greenwold/population.mjs';
import {createWorldField} from '../src/world/field.js';
import {createTerrainEdits} from '../src/world/terrain_edits.js';
import {FORAGE} from '../src/world/forage.js';
import {greenwoldCollision} from './studio/audit-collision.mjs';
import {auditSpaces} from '../src/mmo/plans/plan_schema.js';
import {writeSpaceIndex} from '../tools/editor_save.mjs';

const spaces=structuredClone(SPACES),field=createWorldField(20260904),edits=createTerrainEdits();
edits.load(JSON.parse(readFileSync('public/terrain/greenwold.json')));field.setTerrainEdits(edits);
for(const id of populationIds)delete spaces[id];
const physical=greenwoldCollision((x,z)=>field.heightAt(x,z),spaces);
const report=authorPopulation(spaces,field,{physical,forageCatalog:Object.fromEntries(FORAGE.map(r=>[r.id,r]))});
auditSpaces(spaces);
const collision=greenwoldCollision((x,z)=>field.heightAt(x,z),spaces),bad=[];
for(const id of populationIds)for(const p of spaces[id]?.spawns||[]){
  const s=spaces[id],x=s.at.x+p.x,z=s.at.z+p.z,body=collision.at(x,field.heightAt(x,z),z,.65,2);
  if(body)bad.push({id,slot:p.slot,solid:body.model});
}
report.collisions=bad;writeFileSync('/tmp/kaldera-population-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(bad.length)throw Error('New defenders overlap solid objects');
if(process.argv.includes('--write')){
  for(const id of populationIds)if(spaces[id])writeFileSync('src/mmo/spaces/'+id+'.json',JSON.stringify(spaces[id],null,2)+'\n');
  writeSpaceIndex(process.cwd());
}
