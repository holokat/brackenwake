import{readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';
import{SPACES}from'../src/mmo/spaces/index.js';
import{enlargeBuildings,settlementClearances}from'./greenwold/scale.mjs';
import{auditSpaces}from'../src/mmo/plans/plan_schema.js';
import{buildingsOnRoutes}from'./greenwold/clearance.mjs';
import{ROUTES}from'../src/mmo/greenwold/routes.js';
const spaces=structuredClone(SPACES),changed=enlargeBuildings(spaces);
settlementClearances(spaces);auditSpaces(spaces);
const conflicts=buildingsOnRoutes(spaces,ROUTES);if(conflicts.length)throw Error(JSON.stringify(conflicts));
mkdirSync('/tmp/kaldera-scale-before',{recursive:true});
for(const [id,s]of Object.entries(spaces))if(JSON.stringify(s)!==JSON.stringify(SPACES[id])){
 const path=`src/mmo/spaces/${id}.json`;
 const backup=`/tmp/kaldera-scale-before/${id}.json`;
 if(!existsSync(backup))writeFileSync(backup,readFileSync(path));
 writeFileSync(path,JSON.stringify(s,null,2)+'\n');
}
console.log(JSON.stringify({enlarged:changed,routeConflicts:conflicts},null,2));
