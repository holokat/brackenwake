import assert from 'node:assert/strict';
import { CLASS_TREES, CLASS_NODES, auditClassCatalogue } from './class_trees.js';
import { ABILITIES_BY_ID } from './abilities.js';
import { STARTER_ABILITIES } from './talents.js';

assert.deepEqual(CLASS_TREES.map((tree) => tree.id), ['mage', 'warrior', 'rogue', 'ranger', 'paladin', 'priest']);
assert.deepEqual(auditClassCatalogue(), { nodes: 263, modifiers: 180 });
let abilities = 0, modifiers = 0, capstones = 0;
for (const tree of CLASS_TREES) {
  assert.equal(tree.branches.length, 3);
  for (const branch of tree.branches) {
    const nodes = new Map(branch.nodes.map((node) => [node.id, node]));
    const local = new Set(branch.nodes.map((node) => node.id.split('.').at(-1)));
    assert.equal(branch.nodes.filter((node) => node.kind === 'modifier').length, 10, `${tree.id}.${branch.id}`);
    assert.equal(branch.nodes.filter((node) => node.capstone).length, 1, `${tree.id}.${branch.id}`);
    for (const node of branch.nodes) {
      assert.equal(CLASS_NODES[node.id], node);
      assert.equal(node.status, 'live', `${node.id} is live`);
      assert.ok(Number.isInteger(node.level) && node.level >= 1 && node.level <= 99);
      assert.ok(node.requires.every((id) => nodes.has(id)), `${node.id} keeps dependencies inside its specialization`);
      for (const id of node.requires) assert.ok(node.level >= nodes.get(id).level, `${node.id} follows ${id}`);
      if (node.kind === 'ability') { abilities++; assert.ok(ABILITIES_BY_ID[node.abilityId], node.abilityId); }
      else {
        modifiers++;
        assert.equal(node.pointCost, 1); assert.equal(node.maxRank, node.capstone ? 1 : 3);
        assert.ok(node.effects.length, `${node.id} has an effect`);
        assert.match(node.description, node.capstone ? /^At rank 1: / : /^Per rank: /, `${node.id} describes its rank effect`);
        assert.ok(node.description.match(/[0-9]/), `${node.id} exposes an exact numeric effect`);
        assert.equal(node.iconAbilityId, node.effects.find((effect) => effect.abilityIds?.length)?.abilityIds[0] || null);
        for (const effect of node.effects) for (const abilityId of effect.abilityIds || []) {
          assert.ok(ABILITIES_BY_ID[abilityId], `${node.id} affects a shipped ability: ${abilityId}`);
        }
        if (node.capstone) { capstones++; assert.equal(node.level, 82); assert.equal(node.requiredTreePoints, 25); assert.equal(node.choiceGroup, `${tree.id}.capstone`); }
      }
    }
    assert.equal(local.size, branch.nodes.length, `${tree.id}.${branch.id} local ids are unique`);
  }
  for (const id of STARTER_ABILITIES[tree.id]) assert.ok(tree.branches.some((branch) => branch.nodes.some((node) => node.abilityId === id && node.level === 1)), `${tree.id} starter ${id}`);
}
assert.equal(abilities, 83); assert.equal(modifiers, 180); assert.equal(capstones, 18);
assert.equal(CLASS_NODES['mage.fire.meteor'].level, 62);
assert.equal(CLASS_NODES['warrior.arms.redLedger'].requiredTreePoints, 15);
console.log('Class catalogue checks passed: 6 classes, 18 specializations, 263 live nodes, 180 modifiers, 18 capstones.');
