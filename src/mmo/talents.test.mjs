import assert from 'node:assert/strict';
import { ABILITIES_BY_ID } from './abilities.js';
import { CLASS_TREES, CLASS_NODES } from './class_trees.js';
import {
  COMMON_ABILITIES, STARTER_ABILITIES, MAX_XP, LEVEL_XP,
  newAdvancement, hydrateAdvancement, grantExperience, levelOf,
  availablePoints, learnCheck, learnTalent, talentRank, talentCooldown,
  nodeFor, nodeRank, treePoints,
} from './talents.js';

const character = (opening) => ({ opening, advancement: newAdvancement(opening) });
const ability = (node) => ABILITIES_BY_ID[node.abilityId];
const atMax = (opening) => {
  const c = character(opening);
  grantExperience(c, MAX_XP);
  return c;
};

// Every selectable opening gets exactly its shared controls plus the promised
// class basics. The allocation and compatibility projection agree at rank one.
for (const opening of CLASS_TREES.map((tree) => tree.id)) {
  const c = character(opening);
  const starters = STARTER_ABILITIES[opening];
  assert.deepEqual(c.advancement.granted, [...COMMON_ABILITIES, ...starters], `${opening} starter grants`);
  for (const id of starters) {
    const node = nodeFor(c, id);
    assert.ok(node, `${opening} owns starter ${id}`);
    assert.equal(nodeRank(c, node), 1, `${opening} allocates starter ${id}`);
    assert.equal(talentRank(c, id), 1, `${opening} projects starter ${id}`);
  }
  assert.equal(levelOf(c), 1);
  assert.equal(availablePoints(c), 0);
}

{
  const paladin = character('paladin');
  const priest = character('priest');
  assert.deepEqual(STARTER_ABILITIES.paladin, ['powerStrike', 'heal']);
  assert.deepEqual(STARTER_ABILITIES.priest, ['eldritchBolt', 'heal']);
  assert.equal(talentRank(paladin, 'heal'), 1);
  assert.equal(talentRank(priest, 'eldritchBolt'), 1);
}

// A node belongs to its class. Camp is the explicit exception, represented by
// one shared node rather than a copied node in every class tree.
{
  const mage = atMax('mage');
  const warriorNode = CLASS_NODES['warrior.arms.powerStrike'];
  assert.equal(nodeFor(mage, warriorNode.id), null);
  assert.equal(learnCheck(mage, warriorNode.id, ABILITIES_BY_ID).ok, false);
  const camp = nodeFor(mage, 'camp');
  assert.equal(camp.id, 'shared.fieldcraft.camp');
  assert.equal(learnCheck(mage, camp.id, ABILITIES_BY_ID).ok, true);
  assert.equal(learnTalent(mage, camp.id, ABILITIES_BY_ID).ok, true);
  assert.equal(nodeRank(mage, camp), 1);
}

// Planned rows are visible data, never a mutation path, even with enough XP.
for (const tree of CLASS_TREES) {
  const c = atMax(tree.id);
  const planned = tree.branches.flatMap((branch) => branch.nodes).find((node) => node.status === 'planned');
  assert.ok(planned, `${tree.id} has planned work`);
  const before = JSON.stringify(c.advancement);
  const check = learnTalent(c, planned.id, ABILITIES_BY_ID);
  assert.equal(check.ok, false, `${planned.id} cannot be purchased`);
  assert.match(check.reason, /planned/i);
  assert.equal(JSON.stringify(c.advancement), before, `${planned.id} does not mutate the save`);
}

// Cooldown abilities retain the shipped five ranks and three-percent steps.
{
  const c = character('mage');
  grantExperience(c, LEVEL_XP[2]);
  const fireball = CLASS_NODES['mage.fire.fireball'];
  assert.equal(learnTalent(c, fireball.id, ABILITIES_BY_ID).rank, 1);
  grantExperience(c, LEVEL_XP[9] - c.advancement.xp);
  assert.equal(learnTalent(c, fireball.id, ABILITIES_BY_ID).rank, 2);
  assert.equal(talentCooldown(ABILITIES_BY_ID.fireball, c), ABILITIES_BY_ID.fireball.cooldown * 0.97);
  assert.equal(treePoints(c, 'fire').spent, 2);
}

// At level 99 every live branch has a real route from its starters. Planned
// rows never become prerequisites, so this loop cannot pass by buying future
// work or by crossing into another class.
for (const tree of CLASS_TREES) {
  const c = atMax(tree.id);
  const live = tree.branches.flatMap((branch) => branch.nodes).filter((node) => node.status === 'live');
  for (let pass = 0; pass < live.length; pass++) {
    let changed = false;
    for (const node of live) {
      if (nodeRank(c, node)) continue;
      if (learnTalent(c, node.id, ABILITIES_BY_ID).ok) changed = true;
    }
    if (!changed) break;
  }
  const blocked = live.filter((node) => !nodeRank(c, node)).map((node) => node.id);
  assert.deepEqual(blocked, [], `${tree.id} live paths are reachable`);
}

// v1 is rebuilt through the old global rules before migration. A former Mage
// rank that still maps to a current Mage node becomes an allocation; a valid
// off-class Warrior rank remains in the read-only legacy archive and retains
// its runtime rank and paid point.
{
  const raw = {
    v: 1,
    xp: MAX_XP,
    granted: ['magicArrow'],
    ranks: { magicArrow: 1, fireball: 2, powerStrike: 1 },
  };
  const out = hydrateAdvancement(raw, 'mage', [], ABILITIES_BY_ID);
  assert.equal(nodeRank({ opening: 'mage', advancement: out }, 'mage.fire.fireball'), 2);
  assert.equal(out.legacy.allocations.powerStrike, 1);
  assert.equal(talentRank({ advancement: out }, 'powerStrike'), 1);
  assert.equal(availablePoints({ opening: 'mage', advancement: out }), 95);
  assert.deepEqual(hydrateAdvancement(out, 'mage', [], ABILITIES_BY_ID), out, 'v2 migration is idempotent');
}

// A valid v1 chain can be partly current and partly archived after the new
// class tree moves a later row. Its historical prerequisites survive the next
// v2 load, and archived spend reserves points before current allocations load.
{
  const raw = {
    v: 1,
    xp: LEVEL_XP[26],
    granted: ['magicArrow'],
    ranks: { magicArrow: 1, blink: 1, lightning: 1, chainLightning: 1 },
  };
  const migrated = hydrateAdvancement(raw, 'mage', [], ABILITIES_BY_ID);
  assert.equal(talentRank({ advancement: migrated }, 'chainLightning'), 1);
  assert.deepEqual(hydrateAdvancement(migrated, 'mage', [], ABILITIES_BY_ID), migrated,
    'an archived historical chain survives v2 rehydration');

  const overspent = hydrateAdvancement({
    v: 2,
    classId: 'mage',
    xp: MAX_XP,
    allocations: { 'mage.fire.fireball': 5 },
    legacy: { allocations: { powerStrike: 5 } },
  }, undefined, [], ABILITIES_BY_ID);
  const spend = 98 - availablePoints({ opening: 'mage', advancement: overspent });
  assert.ok(spend <= 98, `combined allocations spend ${spend} of 98`);
}

// Forged saves cannot buy past their old or new level, dependency, and status
// gates. `classId` remains enough to hydrate fixtures without an opening field.
{
  const old = hydrateAdvancement({ v: 1, xp: 0, granted: [], ranks: { meteor: 5 } }, 'mage', [], ABILITIES_BY_ID);
  assert.equal(talentRank({ advancement: old }, 'meteor'), 0, 'v1 XP zero meteor is rejected');
  const v2 = hydrateAdvancement({
    v: 2, classId: 'mage', xp: 0,
    allocations: {
      'mage.fire.fireball': 5,
      'mage.arcane.rift': 1,
      'mage.fire.kindling': 1,
    },
    ranks: { fireball: 5, rift: 1 },
  }, undefined, [], ABILITIES_BY_ID);
  assert.equal(v2.classId, 'mage');
  assert.equal(talentRank({ advancement: v2 }, 'fireball'), 0);
  assert.equal(talentRank({ advancement: v2 }, 'rift'), 0);
  assert.equal(v2.allocations['mage.fire.kindling'], undefined);
}

console.log('Talent v2 acceptance checks passed.');
