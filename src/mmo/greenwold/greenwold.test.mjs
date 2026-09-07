import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {SPACES} from '../spaces/index.js';
import {auditSpaces} from '../plans/plan_schema.js';
import {createWorldField,CHUNK} from '../../world/field.js';
import {createTerrainEdits,deltaOf,overlapsDisc} from '../../world/terrain_edits.js';
import {recordsFor} from '../../world/flora.js';
import {createForageField,REGROW_MS} from '../../world/forage.js';
import {spaceSiteRow,zoneChain} from '../../world/sites.js';
import {blankCharacter} from '../../game/state.js';
import {playerActor} from '../../game/actor.js';
import {createInventory} from '../../game/inventory.js';
import {createForaging} from '../../game/foraging.js';
import {createProgression} from '../../game/progression.js';
import {streetFor} from '../../game/npcs_runtime.js';
import {stationsForSite} from '../../game/win_crafting.js';
import {createStory} from '../../game/story_runtime.js';
import {createChests,openedKey} from '../../game/chests.js';
import {decide,SITE_REACH} from '../../game/interact.js';
import {plannedSpawnsForChunk,spawnsForChunk} from '../../game/monsters.js';
import {specFor} from '../dungeons.js';
import {scheduleAt,atHour,kingsroadRoute} from '../events.js';
import {makeItem} from '../items.js';
import {placeAt,spaceStoneRows} from './places.js';
import {authoredPick,inspectAuthored,READINGS} from './interactions.js';
import {ROUTES,routeDistance} from './routes.js';
import {authoredDeckAt,CROSSINGS} from '../../world/authored_traversal.js';
import {createChapelEncounter,CHAPEL_TRUCE_MS} from './chapel_encounter.js';
import {createLootDrops} from '../../game/loot_drops.js';
import {makeMonsterActor} from '../../game/monsters.js';
import {reviewGreenwold} from '../../../scripts/audit-greenwold.mjs';

const field=createWorldField(20260904),edits=createTerrainEdits();
edits.load(JSON.parse(readFileSync(new URL('../../../public/terrain/greenwold.json',import.meta.url))));field.setTerrainEdits(edits);
const site=id=>spaceSiteRow(SPACES[`greenwold_${id}`],field);
const cc=(x,z)=>[Math.floor(x/CHUNK),Math.floor(z/CHUNK)];
const messages=[],hud={log:s=>messages.push(s),toast:s=>messages.push(s)};
const character=blankCharacter(),pos={...placeAt(field,'hearthhome'),y:0};
const actor=playerActor(character,{pos}),inventory=createInventory({character,actor,hud});
const progression=createProgression({character,actor,hud});

// Positions pass through the actual site, street, workshop and story consumers.
assert.equal(streetFor(site('hearthhome'),field).filter(p=>['bram','wynn','pip','nan','cobb','alys'].includes(p.at)).length,6);
assert.equal(stationsForSite(site('hearthhome')).length,7);
assert.equal(stationsForSite(site('oldcellars')).length,0);
const story=createStory({character,runtime:{field,heightAt:(x,z)=>field.heightAt(x,z),inDungeon:false},pos:()=>pos,realmAt:()=> 'greenwold',hud});
assert.equal(story.viewNow().inHearthhome,true);pos.x+=300;assert.equal(story.viewNow().inHearthhome,false);
Object.assign(pos,placeAt(field,'oldcellars'));assert.equal(story.viewNow().atCellarMouth,true);pos.x+=100;assert.equal(story.viewNow().atCellarMouth,false);
assert.equal(zoneChain(site('millrun').x,site('millrun').z,field).at(-1).zone.id,'greenwold_millrun');
assert.equal(spaceStoneRows().filter(s=>s.place.startsWith('greenwold_hedge_')).length,9);
assert.equal(new Set(spaceStoneRows().map(s=>s.id)).size,spaceStoneRows().length);

for(const[key]of Object.entries(READINGS)){
 const s=site(key);assert.ok(s,`${key} sign space exists`);
 const p=SPACES[s.space].pieces.find(p=>p.model==='fingerpost');assert.ok(p,`${key} has a visible sign`);
 const pick=authoredPick(s,p.model,{x:s.x+p.x,z:s.z+p.z});
 assert.equal(decide(pick,character,pick.site,0,-Infinity).action,'inspect');
 assert.equal(decide(pick,character,{x:pick.site.x+SITE_REACH+1,z:pick.site.z},0,-Infinity).action,'blocked');
 assert.equal(inspectAuthored(pick.site,{character,hud,story,field}).ok,true);
 assert.ok(character.waypoint.name);
}
const chapel=site('sunkenchapel'),bell=authoredPick(chapel,'chapel_sunken',chapel);
assert.equal(story.viewNow().bellRung,false);inspectAuthored(bell.site,{character,hud,story,field});assert.equal(story.viewNow().bellRung,true);
const cellar=site('oldcellars'),mouth=authoredPick(cellar,'cellar_arch',cellar);
assert.equal(decide(mouth,character,mouth.site,0,-Infinity).action,'enter');assert.equal(specFor(mouth.site).boss,'oramBlackhand');
assert.equal(authoredPick(cellar,'crate',cellar),null);
assert.equal(decide(mouth,character,{x:cellar.x+200,z:cellar.z},0,-Infinity).action,'blocked');

// A placed supply sack opens the real inventory/reward path exactly once.
const rim=site('chalk_rim'),cache=authoredPick(rim,'loot_sack',{x:rim.x+8,z:rim.z-8}).chest;
const chests=createChests({character,inventory,actor,hud,rng:()=>0});
assert.equal(chests.open(cache,{at:{x:cache.x+100,z:cache.z}}).reason,'too_far');
const before=character.gold;const opened=chests.open(cache,{at:cache});
assert.equal(opened.ok,true);assert.ok(opened.took.length||character.gold>before);assert.ok(character.opened.includes(openedKey(cache)));
assert.equal(chests.open(cache,{at:cache}).reason,'already');

// Actual forage instances, inventory and progression, including absence and regrowth.
const ff=createForageField(new THREE.Scene(),{field,season:'Autumn',now:()=>0});
const hangar=site('beechhangar');ff.update(hangar.x,hangar.z,'Autumn',0);
const patch=ff.records().find(p=>p.id==='chanterelle');assert.ok(patch);
Object.assign(actor.pos,{x:patch.x+100,z:patch.z});
const gathering=createForaging({field:ff,character,actor,inventory,hud,progression:{lesson:(...args)=>progression.lesson(...args,()=>0)},rng:()=>0,now:()=>0});
assert.equal(gathering.harvest(patch,0).reason,'too_far');Object.assign(actor.pos,{x:patch.x,z:patch.z});
const count=ff.count,plants=ff.plants,skill=character.skills.foraging;
assert.equal(gathering.harvest(patch,0).ok,true);assert.equal(ff.count,count-1);assert.equal(ff.plants,plants-patch.count);
assert.ok(inventory.pack.items.some(i=>i?.base==='chanterelle'));assert.ok(character.skills.foraging>skill);
assert.equal(gathering.harvest(patch,1).reason,'picked');assert.equal(ff.regrow(REGROW_MS-1),0);assert.equal(ff.regrow(REGROW_MS),1);
const fullCharacter=blankCharacter(),full=createInventory({character:fullCharacter});
for(let i=0;i<100;i++)if(!full.add(makeItem({base:'longsword',seed:i})).ok)break;
const fullGather=createForaging({field:ff,character:fullCharacter,actor,inventory:full,hud});
assert.equal(fullGather.harvest(patch,REGROW_MS).reason,'pack_full');assert.equal(ff.count,count);
ff.update(hangar.x,hangar.z,'Winter',REGROW_MS);assert.equal(ff.count,0);ff.dispose();

// Authored resources stream through the same flora records the picker uses.
let trees=0,ores=0;
for(const s of Object.values(SPACES).filter(s=>s.id.startsWith('greenwold_'))){
 for(const p of s.trees.filter(p=>p.harvest)){
  const x=s.at.x+p.x,z=s.at.z+p.z,rows=recordsFor(field,...cc(x,z));
  assert.ok(rows[p.species]?.some(r=>Math.abs(r.x-x)<.001&&Math.abs(r.z-z)<.001));assert.ok(routeDistance(x,z)>=4-.02);trees++;
 }
 for(const p of s.rocks.filter(p=>p.kind==='ore'&&p.harvest)){
  const x=s.at.x+p.x,z=s.at.z+p.z,rows=recordsFor(field,...cc(x,z));
  assert.ok(rows.ore?.some(r=>r.x===x&&r.z===z&&r.tier===p.ore));ores++;
 }
}
assert.ok(trees>0&&ores>0);assert.deepEqual(recordsFor(field,...cc(3000,3000)),{});

const monsters=(night)=>{const out=[];for(let x=-18;x<-13;x++)for(let z=3;z<8;z++)out.push(...plannedSpawnsForChunk(field,x,z,[hangar],night));return out.map(p=>p.id);};
assert.ok(monsters(false).includes('badger'));assert.ok(!monsters(false).includes('oldGrist'));assert.ok(monsters(true).includes('oldGrist'));
assert.deepEqual(spawnsForChunk(field,0,0),[]);
const events=scheduleAt(atHour(0,12),{field});assert.ok(events.some(e=>e.id==='tithewagon'));assert.ok(events.every(e=>e.realm==='greenwold'));
assert.equal(scheduleAt(atHour(1,12),{field}).length,0);assert.ok(kingsroadRoute(field).pts.every(p=>routeDistance(p.x,p.z)<=0));

const bad=structuredClone(SPACES.greenwold_hearthhome);bad.stations[0].id='missing-forge';assert.throws(()=>auditSpaces({[bad.id]:bad}),/unknown id/);
const badForage=structuredClone(SPACES.greenwold_beechhangar);badForage.forage[0].count=9;assert.throws(()=>auditSpaces({[badForage.id]:badForage}),/visible plants/);
const ramp={kind:'plateau',x:0,z:0,x2:120,z2:0,r:10,height:20,height2:32,skirt:.6};
assert.equal(deltaOf(ramp,60,0,0),26);assert.equal(deltaOf(ramp,121,0,0),32.1);assert.equal(deltaOf(ramp,60,11,0),0);assert.ok(overlapsDisc(ramp,119,0,1));assert.equal(overlapsDisc(ramp,119,20,1),false);
const roundTrip=createTerrainEdits();roundTrip.stroke(ramp);const reload=createTerrainEdits();reload.load(roundTrip.serialize());assert.equal(reload.heightDelta(119,0,0),31.9);
assert.equal(authoredDeckAt({sculpt:null},0,0),null);assert.equal(authoredDeckAt(field,3000,3000),null);
assert.ok(CROSSINGS.length>0);
// The bell's minute and second ring both change actual combat factions and
// leave ordinary pickable loot. Returning to a spent offering cannot duplicate it.
const chapelLoot=createLootDrops(new THREE.Scene());
const chapelCharacter=blankCharacter();let released=0,despawned=0;
const cast={spawnAlly(id,x,z){const actor=makeMonsterActor(id,{pos:{x,z}});actor.faction='player';return {key:`${x}:${z}`,name:id,actor,friendly:true};},releaseAlly(m){m.friendly=false;m.actor.faction='hostile';released++;},despawn(){despawned++;}};
const encounter=createChapelEncounter({field,character:chapelCharacter,monsters:cast,loot:chapelLoot,hud,now:()=>100});
const first=encounter.ring();assert.equal(first.ok,true);assert.equal(first.bodies,3);assert.ok(first.bag);assert.equal(first.bag.age,30);
assert.equal(encounter.bodies[2].actor.name,'The Skeleton Sexton');encounter.update(99+CHAPEL_TRUCE_MS);assert.equal(released,0);
encounter.update(100+CHAPEL_TRUCE_MS);assert.equal(released,3);assert.equal(encounter.hostile,true);assert.equal(first.bag.age,90);
encounter.ring();assert.equal(encounter.bodies.length,3);encounter.dispose();assert.equal(despawned,3);
const again=createChapelEncounter({field,character:chapelCharacter,monsters:cast,loot:chapelLoot,hud});assert.equal(again.ring().reason,'spent');
const impatient=createChapelEncounter({field,character:blankCharacter(),monsters:cast,loot:chapelLoot,hud,now:()=>0});
impatient.ring();assert.equal(impatient.ring().reason,'second_ring');assert.equal(impatient.hostile,true);impatient.dispose();chapelLoot.dispose();
const routeReport=reviewGreenwold();
console.log(JSON.stringify({trees,ores,stations:7,routeWalks:routeReport.routes.length*2,frames:routeReport.frames,distance:routeReport.distance,waterSamples:routeReport.samples,feedback:messages.length}));
