import assert from 'node:assert/strict';
import { CELLAR_BOSSES, CELLAR_BOSS_BY_DEPTH, getCellarBoss } from './cellar_bosses.js';
import { MONSTERS, MONSTER_LIST, auditMonsters, HABITAT, HABITAT_BY_PLACE, BOSS_BY_LAIR } from './monsters.js';
import { bossPlanFor, plateText, dungeonSpawns, normalizeDungeonLayout } from '../game/monster_ai.js';
import { tableFor, rollFor } from '../game/loot_drops.js';
const expected = [
  ['morvaOssuaryMother', 'Morva, the ossuary mother', 4.8],
  ['sextonBellkeeper', 'Sexton, the last bellkeeper', 6],
  ['abbotCinder', 'Abbot Cinder', 7.5],
  ['ilexChainArchivist', 'Ilex, the chain archivist', 9],
  ['vossInvertedSaint', 'Voss, the inverted saint', 11],
  ['asterFirstKing', 'Aster, the first king', 14],
];
assert.equal(CELLAR_BOSSES.length, expected.length);
assert.equal(getCellarBoss('oramBlackhand'), null);
assert.equal(BOSS_BY_LAIR.oldcellars.id, 'oramBlackhand', 'legacy cellar lair still selects Oram');
const names = new Set(), patterns = new Set();
for (const [i, [id, name, height]] of expected.entries()) {
  const b = getCellarBoss(id), row = MONSTERS[id];
  assert.equal(b.depth, i + 2); assert.equal(b.name, name); assert.equal(b.height, height);
  assert.equal(CELLAR_BOSS_BY_DEPTH[i + 2], b);
  assert(row.boss && row.authored && row.cellarBoss);
  assert.equal(row.cellarDepth, b.depth); assert.equal(row.where, `oldcellars:${b.depth}`);
  assert.equal(row.name, name); assert.deepEqual(row.group, [1, 1]);
  assert.equal(b.attacks.length, 3); assert.equal(b.phases.length, 2);
  assert(bossPlanFor(row).every((p, j) => p.line === b.phases[j].line));
  assert.notEqual(plateText(row, row.hp * .2, row.hp).phase, 'watching you');
  assert.equal(tableFor(row).length > 0, true);
  for (let seed = 1; seed <= 8; seed++) {
    const drop = rollFor(row, { seed });
    assert(drop.items.length > 0); assert(drop.gold >= row.gold[0]);
    assert(drop.items.some(item => ['epic', 'legendary', 'mythic', 'unique'].includes(item.rarity)), `${id}: boss rarity floor`);
  }
  for (const attack of b.attacks) {
    assert(!names.has(attack.id)); names.add(attack.id);
    assert(!patterns.has(attack.pattern)); patterns.add(attack.pattern);
    assert(attack.warnMs >= 1100 && attack.warnMs <= 3000);
    assert(attack.damageScale > 0 && attack.damageScale < 1.5);
    assert(attack.cue.length > 20 && !attack.cue.includes('—'));
  }
  assert(!Object.values({ ...HABITAT, ...HABITAT_BY_PLACE }).some(h => [...h.day, ...h.night].includes(id)), 'unique depth bosses never enter ordinary spawn rolls');
  const layout = normalizeDungeonLayout({ siteId: 'oldcellars', level: b.depth, gridW: 100, gridH: 100,
    rooms: [{ x: 0, z: 0, w: 1, h: 1 }], authoredSpawns: [{ id, slot: 'boss', group: 'boss', room: 9, gx: 52, gz: 10 }] });
  const spawns = dungeonSpawns(layout);
  assert.equal(spawns.length, 1); assert(spawns[0].boss);
  assert.equal(spawns[0].key, `oldcellars:${b.depth}:authored:boss`);
}
assert.equal(names.size, 18); assert.equal(patterns.size, 18);
const row = MONSTERS.morvaOssuaryMother;
for (const [key, bad] of [['where', 'nowhere'], ['cellarDepth', 8], ['cellarBoss', false]]) {
  const original = row[key]; row[key] = bad;
  assert.throws(auditMonsters, /lives nowhere/); row[key] = original;
}
MONSTER_LIST.push({ ...row, id: 'unregisteredCellarBoss', where: 'oldcellars:2' });
assert.throws(auditMonsters, /lives nowhere/); MONSTER_LIST.pop();
assert.doesNotThrow(auditMonsters);
console.log('CELLAR_DEPTH_BOSSES_VERIFIED');
