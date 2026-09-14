import assert from 'node:assert/strict';
import {CLASS_TREES,CLASS_NODES} from './class_trees.js';
import {ABILITIES_BY_ID} from './abilities.js';
import {STARTER_ABILITIES} from './talents.js';
assert.deepEqual(CLASS_TREES.map(t=>t.id),['mage','warrior','rogue','ranger','paladin','priest']);
let live=0,planned=0;
for(const tree of CLASS_TREES){
 assert.equal(tree.branches.length,3);const abilities=new Set();
 for(const branch of tree.branches){const coords=new Set();assert.equal(branch.nodes.length,12);
  const nodes=new Map(branch.nodes.map(n=>[n.id,n]));
  function visit(n,seen=new Set()){assert.ok(!seen.has(n.id),'acyclic');const next=new Set(seen).add(n.id);for(const id of n.requires){assert.ok(nodes.has(id),'dependency in same spec');visit(nodes.get(id),next);}}
  for(const n of branch.nodes){assert.equal(CLASS_NODES[n.id],n);assert.ok(Number.isInteger(n.level)&&n.level>=1&&n.level<=99);assert.ok(n.column>=0&&n.column<=2);assert.ok(!coords.has(`${n.row}:${n.column}`));coords.add(`${n.row}:${n.column}`);visit(n);
   for(const id of n.requires){assert.ok(n.level>=nodes.get(id).level,`${n.id} level must follow prerequisite ${id}`);assert.ok(nodes.get(id).row<n.row || (nodes.get(id).row===n.row&&nodes.get(id).column!==n.column));}
   if(n.status==='live'){live++;assert.ok(ABILITIES_BY_ID[n.abilityId]);assert.ok(!abilities.has(n.abilityId));abilities.add(n.abilityId);assert.ok(n.requires.every(id=>nodes.get(id).status==='live'));}
   else{planned++;assert.equal(n.status,'planned');assert.equal(n.abilityId,undefined);assert.ok(n.description.startsWith('Planned'));}
  }
 }
 for(const id of STARTER_ABILITIES[tree.id])assert.ok(tree.branches.some(b=>b.nodes.some(n=>n.abilityId===id&&n.level===1)),`${tree.id} starter ${id}`);
}
assert.equal(live,83);assert.equal(planned,133);assert.equal(Object.keys(CLASS_NODES).length,216);
assert.equal(CLASS_NODES['mage.fire.meteor'].level,62);assert.equal(CLASS_NODES['mage.arcane.chainLightning'].level,42);
console.log('Class catalogue checks passed: 6 classes, 18 trees, 83 live placements, 133 planned nodes.');
