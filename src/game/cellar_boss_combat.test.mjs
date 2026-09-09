import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CELLAR_BOSSES } from '../mmo/cellar_bosses.js';
import { createCellarBossState, stepCellarBoss, resetCellarBoss, cellarShapeContains, insideCellarArena } from './cellar_boss_combat.js';
import { createCellarBossTelegraphs } from './monsters/cellar_boss_telegraphs.js';
import { createMonsters } from './monsters.js';
import { createCombat } from './combat.js';
import { spawnMonster } from './actor.js';
import { createLootDrops } from './loot_drops.js';

const home = { x: 5, y: 0, z: -153 };
const playerAt = (x = 5, z = -143) => {
  const player = spawnMonster('ironGolem', { x, y: 0, z });
  player.kind = 'player'; player.faction = 'player'; player.resists = {};
  player.skills = {}; player.health = player.maxHealth = 100000;
  return player;
};
const actorFor = def => ({ health: def.hp, maxHealth: def.hp, pos: { ...home }, ai: { home: { ...home } }, status: {} });
const probes = shape => {
  const candidates = [];
  for (let x = home.x - 28; x <= home.x + 28; x += .7) {
    for (let z = home.z - 27; z <= home.z + 15; z += .7) candidates.push({x,y:0,z});
  }
  candidates.push({x:shape.x,y:0,z:shape.z});
  candidates.sort((a,b)=>Math.hypot(a.x-home.x,a.z-home.z)-Math.hypot(b.x-home.x,b.z-home.z));
  let safe, danger;
  for (const p of candidates) {
    const near = [-.2,.2].flatMap(dx=>[-.2,.2].map(dz=>cellarShapeContains(shape,{x:p.x+dx,y:0,z:p.z+dz})));
    if (near.every(Boolean) && cellarShapeContains(shape,p)) danger ||= p;
    if (near.every(v=>!v) && !cellarShapeContains(shape,p)) safe ||= p;
    if (safe && danger) break;
  }
  assert(danger && safe, `${shape.kind} has measurable danger and a reachable safe region`);
  return { danger, safe };
};
const hasRenderedFloor = (group, p) => {
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(p.x, 10, p.z), new THREE.Vector3(0, -1, 0), 0, 20);
  return ray.intersectObject(group.children[0], false).length > 0;
};

let distinctAttacks = 0, visualShapes = 0;
for (const def of CELLAR_BOSSES) {
  const attackIds = new Set();
  const phaseCounts = [];
  for (const phase of [0, 1, 2]) {
    const actor = actorFor(def), target = playerAt();
    actor.health *= [1, .5, .2][phase];
    const state = createCellarBossState(def.id), emitted = new Map(), struck = new Set();
    let phases = 0;
    for (let now = 0; now <= 90000; now += 100) {
      target.pos.x = home.x + Math.sin(now / 1100) * 8;
      for (const e of stepCellarBoss(state, { now, actor, target })) {
        if (e.type === 'phase') phases++;
        if (e.type === 'telegraph') {
          assert(!emitted.has(e.mark.id)); emitted.set(e.mark.id, e.mark);
          assert(e.mark.impactAt - now >= def.attacks.find(a => a.id === e.mark.attackId).warnMs, 'every tracked mark gets a complete warning');
          const { safe, danger } = probes(e.mark.shape);
          assert(!cellarShapeContains(e.mark.shape, safe)); assert(cellarShapeContains(e.mark.shape, danger));
          if (phase === 0 && !attackIds.has(e.mark.attackId)) {
            const parent = new THREE.Group(), visual = createCellarBossTelegraphs(parent);
            visual.add(e.mark); visual.add(e.mark); assert.equal(parent.children.length, 1);
            const geo = parent.children[0];
            assert(hasRenderedFloor(geo, danger), `${def.id} ${e.mark.attackId}: visual danger matches damage`);
            assert(!hasRenderedFloor(geo, safe), `${def.id} ${e.mark.attackId}: visual gap is safe`);
            if (e.mark.attackId === 'fallingTombs') {
              const tomb = geo.getObjectByName('falling tomb');
              assert(tomb); const raised = tomb.position.y;
              visual.update(e.mark.impactAt - 50);
              assert(tomb.position.y < raised - 8, 'the warned tomb visibly falls onto its marked rectangle');
            }
            let disposed = 0;
            geo.traverse(o => { o.geometry?.addEventListener('dispose', () => disposed++); });
            visual.clear(); assert(disposed > 0, 'clearing a warning releases GPU geometry'); assert.equal(parent.children.length, 0); visualShapes++;
          }
          attackIds.add(e.mark.attackId);
        }
        if (e.type === 'impact') {
          assert(emitted.has(e.mark.id)); assert(now >= emitted.get(e.mark.id).impactAt);
          assert(!struck.has(e.mark.id), 'an impact cannot repeat'); struck.add(e.mark.id);
        }
      }
      assert.equal(stepCellarBoss(state, { now, actor, target }).filter(e => e.type === 'impact').length, 0, 'same clock cannot replay damage');
    }
    assert.equal(phases, phase, 'phase events happen once, including skipped thresholds');
    assert.equal(state.phase, phase); assert(struck.size > 8, 'fight repeats continuously');
    phaseCounts.push(emitted.size);
    assert.deepEqual(stepCellarBoss(state, { now: 0, actor, target }), [], 'backwards clocks do nothing');
    resetCellarBoss(state, 90100);
    assert.equal(state.pending.length, 0); assert.equal(state.phase, 0); assert.equal(state.active, false);
    assert(!stepCellarBoss(state, { now: 92000, actor, target }).some(e => e.type === 'impact'));
  }
  assert.equal(attackIds.size, 3); distinctAttacks += attackIds.size;
  assert(phaseCounts[2] > phaseCounts[0], `${def.id}: final phase adds meaningful pressure`);
}
assert.equal(distinctAttacks, 18); assert.equal(visualShapes, 18);
assert.equal(cellarShapeContains({ kind: 'unknown' }, home), false);
assert.equal(cellarShapeContains({ kind: 'circle', ...home, radius: 9 }, { ...home, x: NaN }), false);
assert(insideCellarArena({ x: 5, y: 0, z: -165 }, home), 'descending stair remains inside arena');
assert(!insideCellarArena({ x: 5, y: 0, z: -120 }, home), 'entry corridor escapes the fight');
assert(!cellarShapeContains({ kind: 'circle', ...home, radius: 20 }, { ...home, y: 5 }), 'other floor heights cannot be hit');
{
  const def = CELLAR_BOSSES.find(b => b.depth === 5), actor = actorFor(def), target = playerAt();
  const state = createCellarBossState(def.id);
  stepCellarBoss(state, { now: 0, actor, target }); state.rotation = 2;
  const ritual = stepCellarBoss(state, { now: 1100, actor, target }).find(e => e.type === 'telegraph').mark;
  assert(cellarShapeContains(ritual.shape, { x: home.x + 28, y: 0, z: home.z - 27 }), 'arena corners cannot avoid the safe-circle ritual');
  assert(!cellarShapeContains(ritual.shape, ritual.shape.safe), 'ritual sanctuary is safe');
}
{
  const def = CELLAR_BOSSES.find(b => b.depth === 7), actor = actorFor(def), target = playerAt(home.x + 28, home.z - 27);
  actor.health *= .9; // Damage can pull the boss while the attacker is at the arena edge.
  const state = createCellarBossState(def.id);
  stepCellarBoss(state, { now: 0, actor, target }); state.rotation = 2;
  const mark = stepCellarBoss(state, { now: 1100, actor, target }).find(e => e.type === 'telegraph').mark;
  assert(cellarShapeContains(mark.shape, target.pos), 'tracking reaches the arena edge');
  assert.equal(stepCellarBoss(state, { now: 12000, actor, target }).filter(e => e.type === 'impact').length, 0, 'a suspended tab cannot release stale damage in a burst');
}


// Through the production spawn, AI, telegraph, combat, death, drop and save paths.
let damageEvents = 0;
for (const def of CELLAR_BOSSES) {
  const scene = new THREE.Scene(), combat = createCombat({ rng: () => .5 });
  const loot = createLootDrops(scene), deadUntil = [], lines = [], casts = [];
  const queue = combat.queueSpell;
  combat.queueSpell = (caster, spell, target, opts) => {
    casts.push({ caster, spell, target, now: opts.now });
    return queue(caster, spell, target, opts);
  };
  const layout = { siteId: 'oldcellars', level: def.depth, gridW: 100, gridH: 200,
    rooms: [{ x: 0, z: 0, w: 10, h: 10 }], authoredSpawns: [
      { id: def.id, slot: 'boss', group: 'boss', room: 9, gx: 52, gz: 23 },
      { id: def.id, slot: 'duplicate', group: 'boss', room: 9, gx: 52, gz: 23 },
    ] };
  const runtime = { inDungeon: true, dungeonSite: { id: 'oldcellars' }, dungeonLevel: def.depth,
    dungeonLayout: () => layout, heightAt: () => 0, clampWalkable: (x, z) => [x, z] };
  const player = playerAt(), ally = playerAt(-10, -155);
  const monsters = createMonsters(scene, runtime, { combat, loot, deadUntil, clock: () => 100000,
    actorFactory: (id, opts) => spawnMonster(id, opts.pos), allies: () => [player, ally],
    rng: () => .5, hud: { log: line => lines.push(line) } });
  let now = 0;
  const tick = () => { monsters.update(.1, now, player); combat.update(.1, now); now += 100; };
  tick();
  let boss = monsters.all().find(m => m.id === def.id);
  assert(boss, `${def.id} spawns through the actual authored dungeon roster`);
  assert.equal(monsters.all().filter(m => m.id === def.id).length, 1, 'duplicate authored boss suppressed');
  assert.deepEqual(boss.actor.ai.home, home);
  const before = player.health, actualIds = new Set();
  for (; now <= 70000;) {
    const warning = monsters.warnings().filter(w => w.id).sort((a, b) => a.left - b.left)[0];
    if (warning) Object.assign(player.pos, probes(warning.shape).danger);
    tick();
  }
  for (const cast of casts.filter(c => c.caster === boss.actor)) actualIds.add(cast.spell.id);
  assert.deepEqual(actualIds, new Set(def.attacks.map(a => a.id)), `${def.id}: every authored move resolves through production combat`);
  assert(player.health < before, 'queued impacts cause real health loss'); damageEvents += casts.length;
  assert(lines.some(line => line.includes(def.attacks[0].cue)), 'warning instruction reaches HUD');
  assert(!casts.some((c, i) => casts.slice(0, i).some(old => old.caster === c.caster && old.target === c.target && old.now === c.now && old.spell.id === c.spell.id)), 'duplicate player in ally list does not double-hit a mark');

  if (def.summon) {
    Object.assign(player.pos, playerAt().pos);
    for (let i = 0; i < 200 && !monsters.all().some(m => m.rec.cellarSummoner === boss.key); i++) tick();
    const brood = monsters.all().find(m => m.rec.cellarSummoner === boss.key);
    assert(brood, 'Morva summons real crawlers');
    combat.hurt(brood.actor, brood.actor.maxHealth * 2, { now, killer: player });
    assert.equal(loot.count, 0, 'brood cannot be farmed for loot');
    assert.equal(deadUntil.length, 0, 'brood creates no persistent slot');
  }

  Object.assign(player.pos, playerAt().pos);
  boss.actor.health = boss.actor.maxHealth * .5; tick();
  assert.equal(boss.phase, 1);
  boss.actor.health = boss.actor.maxHealth * .2; tick();
  assert.equal(boss.phase, 2);
  assert(def.phases.every(p => lines.filter(line => line === p.line).length === 1), 'both phase cues arrive once in production');

  // Acquire a live wind-up, then leave while it is still visible.
  while (!monsters.warnings().length) tick();
  player.pos.z = home.z + 60; ally.health = 0;
  boss.actor.health = boss.actor.maxHealth * .2;
  const castBeforeReset = casts.length;
  for (let i = 0; i < 26; i++) tick();
  assert.equal(monsters.warnings().length, 0); assert.equal(boss.phase, 0);
  assert.equal(boss.actor.health, boss.actor.maxHealth, 'leash reset restores health');
  assert.equal(boss.actor.ai.target, null); assert.equal(casts.length, castBeforeReset, 'escape cancels pending damage');
  assert(!monsters.all().some(m => m.rec.cellarSummoner), 'leash removes brood');
  assert.equal(loot.count, 0); assert.equal(deadUntil.length, 0, 'reset writes no death or loot');

  Object.assign(player.pos, playerAt().pos);
  tick();
  while (!monsters.warnings().length) tick();
  player.health = 0; tick();
  assert.equal(monsters.warnings().length, 0, 'player death resets the fight');
  assert.equal(boss.actor.health, boss.actor.maxHealth);
  player.health = player.maxHealth; tick();
  while (!monsters.warnings().length) tick();
  runtime.inDungeon = false; tick();
  assert.equal(monsters.warnings().length, 0, 'leaving the floor cancels active hazards');
  assert.equal(deadUntil.length, 0, 'leaving an unfinished fight writes no death');
  runtime.inDungeon = true; tick();
  boss = monsters.all().find(m => m.id === def.id);
  assert(boss);
  while (!monsters.warnings().length) tick();
  combat.hurt(boss.actor, boss.actor.maxHealth * 2, { now, killer: player });
  player.status = {}; // Existing landed poison is independent of a cancelled future attack.
  const afterDeath = player.health;
  assert.equal(monsters.warnings().length, 0, 'death removes every telegraph');
  assert.equal(deadUntil.length, 1); assert.equal(deadUntil[0].id, def.id);
  assert.equal(loot.count, 1, 'normal death drops one real loot bag');
  assert(loot.bags()[0].items.length > 0);
  combat.hurt(boss.actor, 1, { now, killer: player });
  assert.equal(loot.count, 1, 'duplicate lethal callbacks cannot duplicate loot');
  for (let i = 0; i < 40; i++) tick();
  assert.equal(player.health, afterDeath, 'no delayed attack after death');
  assert.equal(monsters.all().filter(m => m.id === def.id).length, 0, 'cleared authored slot stays empty');
  // A repeated authored duplicate must share unique-row death suppression too.
  assert.equal(deadUntil.length, 1);
  runtime.inDungeon = false; tick(); runtime.inDungeon = true; tick();
  assert.equal(monsters.count, 0, 'changing floors preserves the boss dead slot');
  monsters.dispose(); loot.dispose?.();
}
assert(damageEvents > 18);
console.log(`CELLAR_BOSS_COMBAT_VERIFIED: ${distinctAttacks} attacks, ${visualShapes} geometry checks, ${damageEvents} production damage jobs`);
