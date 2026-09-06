// Nothing kites. Run: node src/game/monster_ai.test.mjs
//
// The complaint this file answers, in the user's words: "I'm very annoyed that
// the monsters kite me so much, they should not be running away unless low
// health." A goblin scout used to hold an eight to fourteen metre band and step
// backwards every time you closed, so it could be walked the length of a field
// and never fought.
//
// The rule now: a monster moves away from what it is fighting for exactly one
// reason, `combat_rules.fleeCheck`, which is its own family's `flees` rule. A
// boss's scripted retreat phase is the one exception and it goes through the
// same 'flee' state.
//
// So every check here is a MEASUREMENT of the gap frame by frame, both ways:
// a thrower at twelve, three and one metre never opens the gap and attacks at
// all three; a beast at a fifth of its health does open it; a skeleton at a
// twentieth does not.

import { stepMonster, makeMonsterActor, naturalWeapon } from './monsters.js';
import { rangedWeaponFor, attackModeOf, rangeOf, RANGED_FAR } from './monster_ai.js';
import { MONSTERS } from '../mmo/monsters.js';
import { fleeCheck, UNARMED } from '../mmo/combat_rules.js';
import { BODY_RADIUS } from './combat.js';

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const gap = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const player = (x, z = 0) => ({
  id: 'player', kind: 'player', pos: { x, y: 0, z }, yaw: 0, health: 500, maxHealth: 500,
  radius: BODY_RADIUS, run: 4.5, skills: {}, stats: {}, bonuses: {}, resists: {}, weapon: UNARMED,
});

/**
 * The two reaches the runtime hands the AI, computed exactly as
 * `src/game/monsters.js` computes them for a real body: the throw reaches its
 * range plus both bodies, the arm reaches the row's natural weapon plus both.
 * Written out here rather than assumed, because getting the second one wrong is
 * what made a thrower think it was already in melee at ten metres.
 */
function reaches(row, m, p) {
  const bodies = (Number.isFinite(m.radius) ? m.radius : BODY_RADIUS)
    + (Number.isFinite(p.radius) ? p.radius : BODY_RADIUS);
  const w = m.weapon || naturalWeapon(row);
  const throwReach = (Number.isFinite(w.range) ? w.range : w.reach) + bodies;
  return { reach: throwReach, meleeReach: naturalWeapon(row).reach + bodies, bodies };
}

/**
 * Drive one monster at one standing player for `seconds` and report what the
 * gap did and what it asked for. Nothing is asserted in here: it returns the
 * numbers and the checks read them.
 */
function drive(m, p, row, seconds, opts = {}) {
  const dt = 1 / 60;
  const frames = Math.round(seconds * 60);
  const r = reaches(row, m, p);
  const mode = opts.mode !== undefined ? opts.mode : attackModeOf(row);
  let opened = 0, biggest = 0, moved = 0, swings = 0, casts = 0, melee = 0, fled = 0;
  let last = gap(m, p), start = last, widest = last, closest = last;
  for (let f = 0; f < frames; f++) {
    const out = stepMonster(m, dt, {
      player: p, now: opts.now0 != null ? opts.now0 + f * dt * 1000 : f * dt * 1000,
      heightAt: () => 0, mode, range: rangeOf(row) || undefined,
      reach: r.reach, meleeReach: r.meleeReach, rng: () => 0.5,
    });
    if (out.wantSwing) swings++;
    if (out.wantCast) casts++;
    if (out.melee) melee++;
    if (out.state === 'flee') fled++;
    if (out.moved > 0) moved++;
    const g = gap(m, p);
    if (g > last + 1e-9) { opened++; biggest = Math.max(biggest, g - last); }
    widest = Math.max(widest, g);
    closest = Math.min(closest, g);
    last = g;
  }
  return { start, end: last, opened, biggest, moved, swings, casts, melee, fled, widest, closest, frames };
}

// ===========================================================================
// 1. A thrower, at three distances, with its health untouched
// ===========================================================================
console.log('monster_ai: a goblin scout never gives ground');
{
  const row = MONSTERS.goblinScout;
  ck('the goblin scout is the Greenwold row that throws',
    attackModeOf(row) === 'thrown' && rangeOf(row) === RANGED_FAR, `${attackModeOf(row)} to ${rangeOf(row)} m`);

  for (const at of [12, 3, 1]) {
    const m = makeMonsterActor('goblinScout', { pos: { x: 0, y: 0, z: 0 } });
    m.weapon = rangedWeaponFor(m, row);
    const p = player(at);
    const d = drive(m, p, row, 5);
    const healthy = !fleeCheck(m);
    ck(`at ${at} m it is above its flee threshold the whole time`, healthy,
      `${m.health} of ${m.maxHealth}`);
    ck(`at ${at} m the gap never grows on any of ${d.frames} frames`, d.opened === 0,
      `${d.start.toFixed(2)} m to ${d.end.toFixed(2)} m, widest ${d.widest.toFixed(2)} m, ${d.opened} frames wider`);
    ck(`and at ${at} m it attacks`, d.swings + d.casts > d.frames - 10,
      `${d.swings} swings, ${d.casts} casts of ${d.frames} frames`);
  }

  // and the difference the three distances make: knife, knife, hands
  const far = (() => { const m = makeMonsterActor('goblinScout', { pos: { x: 0, y: 0, z: 0 } }); m.weapon = rangedWeaponFor(m, row); return drive(m, player(12), row, 2); })();
  const mid = (() => { const m = makeMonsterActor('goblinScout', { pos: { x: 0, y: 0, z: 0 } }); m.weapon = rangedWeaponFor(m, row); return drive(m, player(3), row, 2); })();
  const near = (() => { const m = makeMonsterActor('goblinScout', { pos: { x: 0, y: 0, z: 0 } }); m.weapon = rangedWeaponFor(m, row); return drive(m, player(1), row, 2); })();
  ck('at 12 m and 3 m it is throwing, not swinging with its hands',
    far.melee === 0 && mid.melee === 0, `${far.melee} and ${mid.melee} melee frames`);
  ck('at 1 m it is inside its own arm and uses its hands instead',
    near.melee === near.frames, `${near.melee} of ${near.frames} frames`);
  ck('and it stood exactly still at all three', far.moved + mid.moved + near.moved === 0,
    `${far.moved + mid.moved + near.moved} moving frames`);
}

// It still walks IN. Standing its ground is not standing about.
{
  const row = MONSTERS.goblinScout;
  const m = makeMonsterActor('goblinScout', { pos: { x: 0, y: 0, z: 0 } });
  m.weapon = rangedWeaponFor(m, row);
  const p = player(11.5);                       // inside aggro 12, outside nothing
  const d = drive(m, p, row, 5);
  ck('inside its aggro and inside its range it does not need to move', d.moved === 0, `${d.moved} frames`);

  // outside its range, it closes: the aggro radius is 12 and the range 14, so
  // a target it can see is always a target it can hit. Drive it from a state
  // that is already on the player to prove the closing branch runs at all.
  const m2 = makeMonsterActor('goblinScout', { pos: { x: 0, y: 0, z: 0 } });
  m2.weapon = rangedWeaponFor(m2, row);
  const p2 = player(11);
  drive(m2, p2, row, 0.2);                      // it takes the target
  p2.pos.x = 30;                                // and now he is well outside the range
  const d2 = drive(m2, p2, row, 4, { now0: 4000 });
  ck('past its range it closes rather than standing there throwing at nothing',
    d2.end < d2.start - 1 && d2.opened === 0, `${d2.start.toFixed(1)} m to ${d2.end.toFixed(1)} m`);
}

// ===========================================================================
// 2. A caster and a breather, same rule
// ===========================================================================
console.log('monster_ai: a caster holds its ground too, and bites when you are on it');
{
  const row = MONSTERS.cultist;
  const m = makeMonsterActor('cultist', { pos: { x: 0, y: 0, z: 0 } });
  const p = player(10);
  const d = drive(m, p, row, 5);
  ck('a cultist at 10 m casts and does not retreat', d.casts > d.frames - 10 && d.opened === 0,
    `${d.casts} casts, ${d.opened} frames wider`);
  const m2 = makeMonsterActor('cultist', { pos: { x: 0, y: 0, z: 0 } });
  const d2 = drive(m2, player(1), row, 5);
  ck('and at 1 m it stops casting over its boots and swings',
    d2.casts === 0 && d2.swings > d2.frames - 10 && d2.opened === 0,
    `${d2.casts} casts, ${d2.swings} swings, ${d2.opened} frames wider`);
}
{
  // A breath reaches 6 m, not 14. It used to hold the same band as a knife
  // thrower and breathe at air from ten metres away.
  const row = MONSTERS.wyvern;
  ck('a wyvern breathes, and its reach is 6 m and not 14', rangeOf(row) === 6, `${rangeOf(row)} m`);
  const m = makeMonsterActor('wyvern', { pos: { x: 0, y: 0, z: 0 } });
  const p = player(10);
  const d = drive(m, p, row, 5, { mode: 'breath' });
  ck('at 10 m it closes to within its breath rather than breathing at nothing',
    d.end <= 6 + 1e-6 && d.opened === 0, `${d.start.toFixed(1)} m to ${d.end.toFixed(1)} m`);
  ck('and once it is inside 6 m it breathes', d.casts > 0, `${d.casts} cast frames`);
}

// ===========================================================================
// 3. The flee rules, unchanged, driven both ways
// ===========================================================================
console.log('monster_ai: what a monster IS allowed to run from');
{
  // 02-COMBAT: critters flee at any damage, vermin and beasts below a quarter,
  // undead and constructs never. None of that was touched, and none of it may
  // drift, so it is measured through the same stepMonster the game runs.
  const wolf = makeMonsterActor('wolf', { pos: { x: 0, y: 0, z: 0 } });
  wolf.health = Math.round(wolf.maxHealth * 0.20);
  ck('a wolf at 20% of its health wants to flee by the rule', fleeCheck(wolf) === true,
    `${wolf.health} of ${wolf.maxHealth}`);
  const p = player(4);
  const d = drive(wolf, p, MONSTERS.wolf, 3);
  ck('and it really does run: the gap grows every frame it can',
    d.opened > 100 && d.end > d.start + 5 && d.fled > 100,
    `${d.start.toFixed(1)} m to ${d.end.toFixed(1)} m, ${d.opened} frames wider, ${d.fled} flee frames`);

  const healthy = makeMonsterActor('wolf', { pos: { x: 0, y: 0, z: 0 } });
  ck('the same wolf at full health does not', fleeCheck(healthy) === false);
  const d2 = drive(healthy, player(4), MONSTERS.wolf, 3);
  ck('and it closes and bites instead', d2.opened === 0 && d2.swings > 0 && d2.fled === 0,
    `${d2.start.toFixed(1)} m to ${d2.end.toFixed(1)} m, ${d2.swings} swings`);

  const skel = makeMonsterActor('skeleton', { pos: { x: 0, y: 0, z: 0 } });
  skel.health = Math.max(1, Math.round(skel.maxHealth * 0.05));
  ck('a skeleton at 5% of its health is undead, so it never flees', fleeCheck(skel) === false,
    `${skel.health} of ${skel.maxHealth}`);
  const d3 = drive(skel, player(4), MONSTERS.skeleton, 3);
  ck('and it walks in and swings on one twentieth of its health',
    d3.opened === 0 && d3.fled === 0 && d3.swings > 0,
    `${d3.start.toFixed(1)} m to ${d3.end.toFixed(1)} m, ${d3.swings} swings, ${d3.fled} flee frames`);

  // and a thrower is not exempt from its own rule either
  const scout = makeMonsterActor('goblinScout', { pos: { x: 0, y: 0, z: 0 } });
  scout.weapon = rangedWeaponFor(scout, MONSTERS.goblinScout);
  scout.health = Math.max(1, Math.round(scout.maxHealth * 0.10));
  ck('a goblin scout at 10% health flees by the rule', fleeCheck(scout) === true,
    `${scout.health} of ${scout.maxHealth}`);
  const d4 = drive(scout, player(3), MONSTERS.goblinScout, 3);
  ck('and that is the one case where a thrower does open the gap',
    d4.opened > 100 && d4.end > d4.start + 3,
    `${d4.start.toFixed(1)} m to ${d4.end.toFixed(1)} m, ${d4.opened} frames wider`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
