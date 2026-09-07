import assert from 'node:assert/strict';
import {itemCatalog} from '../../src/vendor/living-studio/data/item-catalog.js';
import {creatureCatalog} from '../../src/vendor/living-studio/data/creature-catalog.js';
import {forageCatalog} from '../../src/vendor/living-studio/data/forage-catalog.js';
import {dressingCatalog} from '../../src/vendor/living-studio/data/dressing-catalog.js';
import {effectCatalog} from '../../src/vendor/living-studio/data/effect-catalog.js';
import {enchantments} from '../../src/vendor/living-studio/data/enchantments.js';
import {MOVE_BY_ID} from '../../src/vendor/living-studio/vendor/source-library.js';
import {BASES} from '../../src/mmo/items.js';
import {GEMS} from '../../src/mmo/ores.js';
import {MONSTERS} from '../../src/mmo/monsters.js';
import {ABILITIES} from '../../src/mmo/abilities.js';
import {OPENINGS} from '../../src/mmo/openings.js';
import {RECIPES} from '../../src/mmo/recipes.js';
import {SPACES} from '../../src/mmo/spaces/index.js';
import {LIVING_BY_MODEL} from '../../src/mmo/living_catalog.js';
import {FORAGE_BY_ID} from '../../src/world/forage.js';
import {sourceAbility} from '../../src/game/studio/body.js';
import {studioItemId} from '../../src/game/studio/items.js';
import {unmakeableReason} from '../../src/game/win_crafting.js';
const reps=[...Object.keys(BASES).map(base=>({base})),...GEMS.map(g=>({base:'gem',material:g.id}))];
const placements=id=>Object.values(SPACES).flatMap(s=>[...(s.effects||[]),...(s.animals||[]),...(s.pieces||[])]).filter(p=>p.id===id||p.model==='lw_'+id).length;
const report={
 classes:OPENINGS.map(o=>({id:o.id,bodies:['male','female'],consumer:'creation, roster, player studio body'})),
 items:itemCatalog.map(i=>{const gameItem=reps.find(r=>studioItemId(r)===i.id);assert.ok(gameItem,i.id);return{id:i.id,kind:i.kind,gameItem,consumer:i.id==='fists'?'unarmed character pose; not an equippable item':['armor','weapon','shield','offhand','jewellery'].includes(i.kind)?'visible equipment and single-item ground drop':'ground drop; existing gathering, crafting, ammunition or material rules'};}),
 creatures:creatureCatalog.map(c=>{assert.ok(MONSTERS[c.id],c.id);return{id:c.id,consumer:'monster body, native locomotion and combat lifecycle'};}),
 abilities:ABILITIES.map(a=>({id:a.id,castSeconds:a.castTime,source:sourceAbility(a.id)?.id||null,consumer:a.id==='camp'?'existing camp effects; no source counterpart':'existing ability mechanics, source motion and adapted effects'})),
 forage:forageCatalog.map(f=>{assert.ok(FORAGE_BY_ID[f.id],f.id);return{id:f.id,consumer:'nearest eight source patches; shared live harvest records'};}),
 dressing:dressingCatalog.filter(d=>d.type!=='vfx'&&d.size).map(d=>{assert.ok(LIVING_BY_MODEL['lw_'+d.id],d.id);return{id:d.id,placements:placements(d.id),consumer:d.type==='animal'?'ambient habitat runtime and builder library':'builder library and authored saved props'};}),
 worldEffects:effectCatalog.map(e=>({id:e.id,placements:placements(e.id),consumer:placements(e.id)?'authored habitat with time and weather gates':'available in habitat effect catalog; intentionally unplaced in Greenwold'})),
 enchantments:enchantments.map(e=>({id:e.id,consumer:'held weapon visual for the corresponding existing affix or active weapon enchantment'})),
 motions:[...MOVE_BY_ID.keys()].map(id=>({id,consumer:'source motion bank; poseAction and source ability sampler; locomotion transitions remain available to callers'})),
 recipes:{total:RECIPES.length,makeable:RECIPES.filter(r=>!unmakeableReason(r)).length,unimplemented:RECIPES.filter(unmakeableReason).map(r=>({id:r.id,reason:unmakeableReason(r)}))},
};
console.log(JSON.stringify(report,null,2));
