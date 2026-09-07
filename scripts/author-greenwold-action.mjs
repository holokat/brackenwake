import {readFileSync,writeFileSync} from 'node:fs';
import {SPACES} from '../src/mmo/spaces/index.js';
import {createWorldField} from '../src/world/field.js';
import {createTerrainEdits} from '../src/world/terrain_edits.js';
import {gradeStrongholds,buildStrongholds} from './greenwold/strongholds.mjs';
import {auditSpaces} from '../src/mmo/plans/plan_schema.js';
import {writeSpaceIndex} from '../tools/editor_save.mjs';
const path='public/terrain/greenwold.json',terrain=JSON.parse(readFileSync(path)),field=createWorldField(20260904),edits=createTerrainEdits();
terrain.strokes=terrain.strokes.filter(s=>s.author!=='greenwold-action');edits.load(terrain);field.setTerrainEdits(edits);
gradeStrongholds(field,s=>edits.stroke({...s,author:'greenwold-action'}));
const spaces=structuredClone(SPACES);buildStrongholds(spaces,field);auditSpaces(spaces);
const result={...terrain,...edits.serialize()};
writeFileSync(path,JSON.stringify(result,null,2)+'\n');
let changed=0;for(const[id,s]of Object.entries(spaces))if(JSON.stringify(s)!==JSON.stringify(SPACES[id])){writeFileSync('src/mmo/spaces/'+id+'.json',JSON.stringify(s,null,2)+'\n');changed++;}
writeSpaceIndex(process.cwd());console.log(JSON.stringify({spacesChanged:changed,strokes:result.strokes.filter(s=>s.author==='greenwold-action').length}));
