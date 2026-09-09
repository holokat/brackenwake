import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCharacter, hydrate, createState } from '../state.js';
import { playerActor, spawnMonster, recompute } from '../actor.js';
import { createInventory, carryOfCharacter } from '../inventory.js';
import { createCombat } from '../combat.js';
import { createForaging } from '../foraging.js';
import { createTrade } from '../win_trade.js';
import { applyRaidReward } from '../cellar_rewards.js';
import { craft, refundBaseFor, forecast } from '../win_crafting.js';
import { makeItem } from '../../mmo/items.js';
import { RECIPE } from '../../mmo/recipes.js';
import { rollGain, gainChance } from '../../mmo/skills.js';
import { achievementEvent } from './events.js';
import { ACHIEVEMENTS, METRIC_CAPS } from './catalog.js';
import { ISLAND_LANDMARKS } from './locations.js';
import { createAchievementTracker } from './tracker.js';
import { achievements as achievementSystem } from '../app/systems/achievements.js';
import { achievementState, hydrateAchievements, observeMetric, distinctMetric, unlockAchievements,
  achievementPerks, selectAchievementTitle, selectedAchievementTitle, personallyCrafted } from './progress.js';

function setup() {
  const character = blankCharacter(); character.name = 'Achievement test';
  character.pack.items = new Array(40).fill(null); character.pack.slots = 40;
  const actor = playerActor(character, {pos: {x:0,y:0,z:0}});
  const combat = createCombat({rng: () => 0});
  let enabled = true;
  const notices = [], changes = [];
  const tracker = createAchievementTracker({character, actor, combat, recompute,
    enabled: () => enabled, notify: rows => notices.push(...rows), state: {touch: what => changes.push(what)}, landmarks: ISLAND_LANDMARKS});
  const inventory = createInventory({character, actor, recompute});
  return {character, actor, combat, tracker, inventory, notices, changes, setEnabled(v) {enabled=v;}, doc: character.achievements};
}
test('40 unique definitions have reachable caps, actual island landmarks and six permanent perks', () => {
  assert.equal(ACHIEVEMENTS.length, 40);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, 40);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.number)).size, 40);
  assert.equal(ACHIEVEMENTS.filter(a => a.reward).length, 6);
  assert.equal(METRIC_CAPS.skillMax, 100);
  assert.equal(METRIC_CAPS.landmarks, ISLAND_LANDMARKS.length);
  for (const a of ACHIEVEMENTS) assert(!/150|resin slime|mirehart|yarrow|repair|house|fishing/i.test(a.description), a.name);
});
test('the live app system observes real state notifications, opens its tab and cleans up listeners', () => {
  const state=createState({storage:null}), character=state.character, actor=playerActor(character);
  const opened=[], notices=[];
  const systems={world:{runtime:{field:{sculpt:{world:'island'}}}},player:{actor},combat:{combat:createCombat()},ui:{windows:{open:id=>opened.push(id)},panelCtx:{}}};
  const ctx={state,character,get:id=>systems[id],hud:{log:text=>notices.push(text),toast(){}}};
  const instance=achievementSystem.create(ctx);
  assert.equal(systems.ui.panelCtx.achievements,instance.tracker);
  character.skills.mining=100;state.touch('skills');
  assert(character.achievements.earned['a-practiced-hand']);
  instance.bw.openAchievements();assert.deepEqual(opened,['achievements']);
  achievementSystem.dispose();
  assert.equal(achievementEvent(character,'camp'),false);
});
test('old saves migrate empty, starter inventory is not gathered or crafted progress', () => {
  const h = setup();
  h.inventory.add(makeItem({base:'oak_log',count:100}));
  h.inventory.add(makeItem({base:'axe'}));
  h.tracker.observeCharacter();
  assert.equal(h.doc.metrics.wood, 0);
  assert.equal(h.doc.metrics.craftedAxe, 0);
  assert.deepEqual(hydrate({}).achievements.earned, {});
  assert.equal(selectAchievementTitle(h.character, 'holding-haven'), false);
  assert.equal(selectedAchievementTitle(h.character), null);
});
test('distinct activity stays bounded, unavailable title IDs are rejected and rewards never stack', () => {
  const h = setup();
  for (let i=0;i<1000;i++) distinctMetric(h.doc, 'chests', `chest:${i}`);
  assert.equal(h.doc.distinct.chests.length, 10);
  unlockAchievements(h.doc, 1);
  const capacity = carryOfCharacter(h.character);
  assert.equal(achievementPerks(h.character).capacity, 10);
  for (let i=0;i<5;i++) { assert(selectAchievementTitle(h.character,'putting-something-aside')); assert(selectAchievementTitle(h.character,null)); recompute(h.actor); }
  assert.equal(carryOfCharacter(h.character), capacity);
  assert.equal(h.actor.carry, capacity);
  const raw = {metrics:{kills:NaN,wood:Infinity},earned:{'holding-haven':1,'unknown':1},title:'holding-haven'};
  assert.equal(hydrateAchievements(raw).metrics.kills, 0);
  assert.deepEqual(hydrateAchievements(raw).earned, {});
});
test('crafting consumes real materials, stamps ownership and credits only a delivered craft', () => {
  const h = setup();
  const recipe = RECIPE['tool.axe']; assert(recipe);
  h.character.skills[recipe.skill] = 100;
  for (const [id,count] of Object.entries(recipe.materials)) {
    const item = makeItem({base:refundBaseFor(id),count:count*2}); item.material=id; h.inventory.add(item);
  }
  const ctx = {character:h.character,inventory:h.inventory,stationAccess:()=>true,rng:()=>0};
  const made = craft(recipe.id,ctx);
  assert.equal(made.ok,true,JSON.stringify(made));
  assert(personallyCrafted(h.character,made.item));
  assert.equal(h.doc.metrics.craftedAxe,1);
  assert.equal(h.doc.metrics.equipmentCrafts,1);
  assert.equal(h.doc.metrics.recipes,1);
  const second = craft(recipe.id,{...ctx,inventory:{...h.inventory,add:()=>({added:0,ok:false})}});
  assert.equal(second.ok,false);
  assert.equal(h.doc.metrics.equipmentCrafts,1);
  assert.equal(h.doc.metrics.recipes,1);
  const loaded = hydrate(h.character);
  assert(personallyCrafted(loaded,loaded.pack.items.find(i=>i?.base==='axe')));
});
test('real forage refuses full packs and exhausted patches without awarding anything', () => {
  const h = setup();
  const rec = {id:'dandelion',x:0,z:0,count:1,members:[{x:0,z:0}],harvestedUntil:0};
  const foraging = createForaging({character:h.character,actor:h.actor,inventory:h.inventory,field:{remove(r){r.harvestedUntil=10000;}}});
  assert.equal(foraging.harvest(rec,1).ok,true);
  assert.equal(h.doc.metrics.herbs,1);
  assert.equal(foraging.harvest(rec,2).ok,false);
  assert.equal(h.doc.metrics.herbs,1);
  h.character.pack.items.fill(makeItem({base:'axe'}));
  assert.equal(foraging.harvest({...rec,id:'raspberry',harvestedUntil:0},3).ok,false);
  assert.equal(h.doc.metrics.forageKinds,1);
});
test('real melee kills award once, count weapon provenance, and ignore critters and developer actions', () => {
  const h = setup();
  h.character.equipment.mainHand = makeItem({base:'longsword'});
  achievementEvent(h.character,'craftPrepared',{item:h.character.equipment.mainHand});
  h.character.skills.swordsmanship=100; h.character.skills.tactics=100; recompute(h.actor);
  function kill(id) {
    const target = spawnMonster(id,{x:0,y:0,z:1},()=>.5);
    for(let i=0;i<50&&!target.dead;i++) { h.combat.queueSwing(h.actor,target,{now:i*10000,immediate:true}); h.combat.update(1,i*10000+1000); }
    assert(target.dead,id); return target;
  }
  const rat = kill('giantRat');
  assert.equal(h.doc.metrics.kills,1); assert.equal(h.doc.metrics.ratKills,1); assert.equal(h.doc.metrics.craftedKills,1);
  h.tracker.killed(rat,h.actor); assert.equal(h.doc.metrics.kills,1);
  kill('rabbit'); assert.equal(h.doc.metrics.kills,1);
  h.setEnabled(false); kill('giantRat'); assert.equal(h.doc.metrics.kills,1);
});
test('real spell damage contributes to kills but does not count as a melee or crafted weapon kill', () => {
  const h = setup();
  h.character.skills.magery=100; h.character.skills.evaluatingIntelligence=100; recompute(h.actor);
  const target=spawnMonster('giantRat',{x:0,y:0,z:1},()=>.5);
  assert(h.combat.queueSpell(h.actor,{base:[1000,1000],damageType:'energy'},target,{now:0}).queued);
  assert.equal(h.doc.metrics.kills,0,'a queued spell is not yet a kill');
  h.combat.update(1,1000);
  assert(target.dead);
  assert.equal(h.doc.metrics.kills,1);
  assert.equal(h.doc.metrics.meleeKills,0); assert.equal(h.doc.metrics.craftedKills,0);
});
test('a confirmed raid reward awards one kill across partial claims and retries', () => {
  const h=setup();
  const state={character:h.character,coins:0,addMaterial:()=>({added:0}),save:()=>true};
  const reward={run:1,base:'starfall_ore',count:36,gold:2500};
  applyRaidReward(state,{...reward,count:999},'test');assert.equal(h.doc.metrics.kills,0);
  applyRaidReward(state,reward,'test');assert.equal(h.doc.metrics.kills,1);
  applyRaidReward(state,reward,'test');assert.equal(h.doc.metrics.kills,1);
  state.addMaterial=()=>({added:36});applyRaidReward(state,reward,'test');assert.equal(h.doc.metrics.kills,1);
});
test('a finishing blow on an already hurt enemy does not award a clean kill', () => {
  const h=setup(), target=spawnMonster('giantRat',{x:0,y:0,z:1},()=>.5);
  target.health=1;
  h.combat.hurt(target,1000,{killer:h.actor,kind:'spell'});
  assert.equal(h.doc.metrics.cleanKill,0);
  assert.equal(h.doc.metrics.kills,0, 'less than ten percent participation');
});
test('crafted tool progress requires that character\'s tool, and developer work is excluded', () => {
  const h=setup(), axe=makeItem({base:'axe'}), pick=makeItem({base:'pickaxe'});
  h.tracker.record({type:'gather',kind:'wood',count:25,tool:axe});
  assert.equal(h.doc.metrics.wood,25);assert.equal(h.doc.metrics.ownAxeWood,0);
  h.tracker.record({type:'craftPrepared',item:axe});h.tracker.record({type:'craftPrepared',item:pick});
  h.tracker.record({type:'gather',kind:'wood',count:25,tool:axe});
  h.tracker.record({type:'gather',kind:'mining',count:25,tool:pick});
  assert(h.doc.earned['tools-of-your-own']);
  const other=setup();other.tracker.record({type:'gather',kind:'wood',count:25,tool:axe});
  assert.equal(other.doc.metrics.ownAxeWood,0);
  h.setEnabled(false);h.tracker.record({type:'gather',kind:'wood',count:100,tool:axe});
  assert.equal(h.doc.metrics.wood,50);
});
test('exploration is per character and floor, outdoor distance excludes jumps and dungeon coordinates', () => {
  const h=setup(), p=ISLAND_LANDMARKS[0];
  h.tracker.position({...p,night:false}); h.tracker.position({...p,x:p.x+1,night:true});
  assert.equal(h.doc.metrics.landmarks,1); assert.equal(h.doc.metrics.nightLandmarks,1); assert.equal(h.doc.metrics.outdoorTiles,1);
  h.tracker.position({x:10000,z:10000}); assert.equal(h.doc.metrics.outdoorTiles,1);
  for(let i=0;i<4;i++)h.tracker.position({x:0,z:0,dungeon:{siteId:'cellars',level:2}});
  h.tracker.position({x:0,z:0,dungeon:{siteId:'mine',level:2}});
  assert.equal(h.doc.metrics.dungeonFloors,2); assert.equal(h.doc.metrics.outdoorTiles,1);
  const other=setup(); assert.equal(other.doc.metrics.landmarks,0);
});
test('successful player trade counts once; cancellation, empty trade and a stub partner do not', () => {
  const h=setup();h.character.gold=10;
  function partner(remote){const other=blankCharacter();return {remote,...other};}
  const trade=createTrade({me:h.character,them:partner(true)});
  trade.setGold('me',1); trade.setAccept('me',true); const result=trade.setAccept('them',true);
  assert.equal(result.committed,true); assert.equal(h.doc.metrics.trade,1);
  trade.setAccept('them',true); assert.equal(h.doc.metrics.trade,1);
  const other=setup();
  const empty=createTrade({me:other.character,them:partner(true)});empty.setAccept('me',true);empty.setAccept('them',true);
  assert.equal(other.doc.metrics.trade,0);
});
test('all six perks survive character save/open and title changes, using actual stat and quality formulas', () => {
  const h=setup();
  for(const [metric,value] of Object.entries(METRIC_CAPS))observeMetric(h.doc,metric,value);
  unlockAchievements(h.doc,1234);
  assert.equal(Object.keys(h.doc.earned).length,40);
  assert.deepEqual(achievementPerks(h.character),{capacity:20,quality:.03,constitution:1,wisdom:10});
  const plain=playerActor({...h.character,achievements:null});recompute(h.actor);
  assert.equal(h.actor.maxHealth,plain.maxHealth+2);
  assert.equal(h.actor.stats.wis,plain.stats.wis+10);
  assert.equal(h.actor.carry,plain.carry+20);
  assert(selectAchievementTitle(h.character,'a-place-in-haven'));
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const state=createState({storage});state.setCharacter(h.character);assert(state.save());
  const loaded=createState({storage});assert(loaded.openSlot(state.slot));
  assert.equal(selectedAchievementTitle(loaded.character),'Of Haven');
  assert.deepEqual(loaded.character.achievements,h.character.achievements);
  const recipe=RECIPE['tool.axe'];
  const expected=forecast(recipe,{character:{skills:{[recipe.skill]:0}}}).expected;
  assert.equal(forecast(recipe,{character:{skills:{[recipe.skill]:0},achievements:h.doc}}).expected,expected+.03);
  assert.equal(forecast(recipe,{character:{skills:{[recipe.skill]:100},achievements:h.doc}}).best,1.3);
  const chance=gainChance(50,50), roll=()=>chance*1.05;
  assert.equal(rollGain({skills:{mining:50}},'mining',50,true,roll).gained,false);
  assert.equal(rollGain({skills:{mining:50},gainChanceBonus:.1},'mining',50,true,roll).gained,true);
  assert.equal(rollGain({skills:{mining:100},gainChanceBonus:.1},'mining',50,true,()=>0).gained,false);
});
