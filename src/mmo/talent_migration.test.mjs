import assert from 'node:assert/strict';
import {ABILITIES_BY_ID} from './abilities.js';
import {CLASS_TREES} from './class_trees.js';
import {sanitizeV1} from './legacy_talents.js';
import {hydrateAdvancement,MAX_XP,LEVEL_XP,levelOf,maxTalentRank,availablePoints,newAdvancement,grantExperience,learnTalent} from './talents.js';
const rules={maxRank:maxTalentRank,levelForXp:levelOf,maxXp:MAX_XP};
let seed=1451;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const spend=p=>Object.entries(p.ranks).reduce((sum,[id,n])=>sum+Math.max(0,n-(p.granted.includes(id)?1:0)),0);
for(const opening of ['mage','warrior','rogue','ranger'])for(const level of [2,6,14,26,42,62,82,99])for(let i=0;i<12;i++){
 const raw={v:1,xp:LEVEL_XP[level],ranks:Object.fromEntries(Object.keys(ABILITIES_BY_ID).map(id=>[id,Math.floor(random()*6)]))};
 const old=sanitizeV1(raw,opening,ABILITIES_BY_ID,rules);
 const migrated=hydrateAdvancement(old,opening,[],ABILITIES_BY_ID);
 const label=`${opening} level ${level} sample ${i}`;
 assert.deepEqual(migrated.ranks,old.ranks,`${label}: preserve effective ranks`);
 assert.equal(availablePoints({opening,advancement:migrated}),level-1-spend(old),`${label}: preserve point accounting`);
 const twice=hydrateAdvancement(migrated,opening,[],ABILITIES_BY_ID);
 assert.deepEqual(twice,migrated,`${label}: second hydration is stable`);
}
// Pre-tree free grants could be trained without their original predecessor.
const granted={v:1,xp:LEVEL_XP[40],granted:['meteor'],ranks:{meteor:5}};
const migrated=hydrateAdvancement(granted,'mage',[],ABILITIES_BY_ID);
assert.equal(migrated.ranks.meteor,5,'a trained grandfathered grant retains its ranks');
assert.equal(availablePoints({advancement:migrated}),35,'four paid training ranks remain four points');
assert.deepEqual(hydrateAdvancement(migrated,'mage',[],ABILITIES_BY_ID),migrated);
// Pre-advancement saves stored free learned abilities separately. A matching
// class node owns the grant at rank one even below its current level gate;
// another class retains it only in the read-only compatibility projection.
const freeFireball=hydrateAdvancement(null,'mage',['fireball'],ABILITIES_BY_ID);
assert.equal(freeFireball.allocations['mage.fire.fireball'],1,'a free Mage Fireball maps to its class node');
assert.equal(freeFireball.ranks.fireball,1,'the mapped free grant remains castable');
assert.deepEqual(hydrateAdvancement(freeFireball,'mage',[],ABILITIES_BY_ID),freeFireball,'a free class grant remains stable after v2 hydration');
const sharedHeal=hydrateAdvancement(null,'paladin',['heal'],ABILITIES_BY_ID);
assert.equal(sharedHeal.allocations['paladin.holy.heal'],1,'shared Heal maps to Paladin’s own node');
const foreignHeal=hydrateAdvancement(null,'mage',['heal'],ABILITIES_BY_ID);
assert.equal(foreignHeal.allocations['mage.fire.heal'],undefined,'foreign Heal does not gain a Mage node');
assert.equal(foreignHeal.ranks.heal,1,'foreign Heal remains a usable archived grant');
// Valid v2 allocations must not depend on JSON object key order. Build each
// class through its public purchase API, then restore reverse-ordered keys.
for(const tree of CLASS_TREES){
 const character={opening:tree.id,advancement:newAdvancement(tree.id)};
 grantExperience(character,MAX_XP);
 const live=tree.branches.flatMap(branch=>branch.nodes).filter(node=>node.status==='live');
 for(let pass=0;pass<live.length;pass++)for(const node of live)learnTalent(character,node.id,ABILITIES_BY_ID);
 const allocations=Object.fromEntries(Object.entries(character.advancement.allocations).reverse());
 const restored=hydrateAdvancement({...character.advancement,allocations},tree.id,[],ABILITIES_BY_ID);
 assert.deepEqual(restored.ranks,character.advancement.ranks,`${tree.id}: reverse allocation keys preserve ranks`);
 assert.equal(availablePoints({opening:tree.id,advancement:restored}),availablePoints(character),`${tree.id}: reverse allocation keys preserve points`);
}
// This deliberately trains a five-rank deep dependency. In reverse key order
// the old six passes stopped at Rift rank four; completion must follow actual
// progress rather than the order JSON happened to retain.
const deep={opening:'mage',advancement:newAdvancement('mage')};
grantExperience(deep,MAX_XP);
for(const id of ['mage.arcane.lightning','mage.arcane.blink','mage.arcane.hex','mage.arcane.chainLightning'])assert.equal(learnTalent(deep,id,ABILITIES_BY_ID).ok,true,id);
for(let rank=1;rank<=5;rank++)assert.equal(learnTalent(deep,'mage.arcane.rift',ABILITIES_BY_ID).rank,rank);
const deepReversed=hydrateAdvancement({...deep.advancement,allocations:Object.fromEntries(Object.entries(deep.advancement.allocations).reverse())},'mage',[],ABILITIES_BY_ID);
assert.equal(deepReversed.ranks.rift,5,'reverse keys restore all five ranks of a deep dependency');
assert.equal(availablePoints({opening:'mage',advancement:deepReversed}),availablePoints(deep),'deep reverse restore preserves points');
// An archived historical rank and current allocation for the same ability
// project one effective rank and consume its points once.
const overlap=hydrateAdvancement({v:2,classId:'mage',xp:MAX_XP,allocations:{'mage.fire.fireball':2},legacy:{allocations:{fireball:5}}},undefined,[],ABILITIES_BY_ID);
assert.equal(overlap.ranks.fireball,5,'overlapping current and legacy ranks project the higher rank');
assert.equal(availablePoints({opening:'mage',advancement:overlap}),93,'overlapping ranks do not spend points twice');
console.log('Migration property checks passed: 384 historical builds, trained legacy grant, reordered v2 allocations and overlap accounting.');
