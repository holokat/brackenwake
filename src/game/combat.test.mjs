// Hitting things that are alive. Run: node src/game/combat.test.mjs
//
// Nothing here is a mock of the world. Every check drives the REAL createFauna
// over a stub field (the same one fauna.test.mjs uses), spawns real animals with
// real models and real roam records, and then swings at them through the real
// resolveSwing. The only thing standing in for the game is the field, because a
// test that wants a wolf at 2 m needs to know where the flat ground is.
//
// Every rule is driven both ways: the tool that reaches and the tool that does
// not, the cooldown that blocks and the same cooldown once it has elapsed, the
// cursor that picks the far animal and the cursor that picks the near one.

import * as THREE from 'three';
import { CHUNK } from '../world/field.js';
import { createFauna, KINDS, hpFor, NEAR_RING } from '../world/fauna.js';
import { GOODS } from '../farm/catalog.js';
import {
  WEAPONS, weaponFor, LOOT, lootFor, auditLootTable, resolveSwing, pickTarget, swingText, lootText, nameFor,
} from './combat.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ------------------------------------------------------------------ world --

function stubField(o = {}) {
  const biome = o.biome || (() => 'meadow');
  const sampleAt = (x, z) => ({
    h: 3, biome: biome(x, z), water: false, river: 0, land: 1, temp: 0.5, moist: 0.5, site: null,
  });
  return {
    seed: o.seed ?? 4242, seaLevel: -0.8, chunk: CHUNK,
    sampleAt, heightAt: () => 3, biomeAt: (x, z) => sampleAt(x, z).biome,
    chunkOf: (x, z) => [Math.floor(x / CHUNK), Math.floor(z / CHUNK)],
  };
}

const CENTRE = 20 * CHUNK + 32;

/** A live world with animals standing in it, exactly as the game builds one. */
function world(biome = 'meadow', night = false) {
  const scene = new THREE.Group();
  const fauna = createFauna(scene, stubField({ biome: () => biome }), {});
  for (let cz = -NEAR_RING; cz <= NEAR_RING; cz++) {
    for (let cx = -NEAR_RING; cx <= NEAR_RING; cx++) fauna.onChunk(20 + cx, 20 + cz, 33);
  }
  fauna.update(0.016, 1000, CENTRE, CENTRE, night);
  return { scene, fauna };
}

const of = (fauna, kind) => fauna.all().find((m) => m.userData.wild.kind === kind);

/** Stand an animal on a spot, whole and calm, so a swing at it starts from a known state. */
function place(m, x, z, y = 3) {
  m.position.set(x, y, z);
  m.userData.wild.home = { x, z };
  m.userData.wild.groundY = y;
  const rm = m.userData.roam;
  if (rm) {
    rm.hp = hpFor(m.userData.wild.kind); rm.state = 'walk'; rm.t0 = 0; rm.until = 1e9;
    rm.fleeUntil = 0; rm.speed = rm.homeSpeed || rm.speed; rm.heading = 0;
  }
  return m;
}
/** Everything else out of the way, so a swing has exactly one candidate. */
function clearField(fauna, keep) {
  for (const m of fauna.all()) if (m !== keep) m.position.set(CENTRE + 900, 3, CENTRE + 900);
}
const hpOf = (m) => (m.userData.roam ? m.userData.roam.hp : m.userData.fly.hp);

// ------------------------------------------------------------ the weapons --
{
  const names = Object.keys(WEAPONS);
  check('the table names hand, axe, pickaxe and bow', names.join(',') === 'hand,axe,pickaxe,bow', names.join(','));
  check('every weapon has damage, reach and a cooldown',
    names.every((k) => WEAPONS[k].damage > 0 && WEAPONS[k].reach > 0 && WEAPONS[k].cooldown > 0));
  const melee = names.filter((k) => !WEAPONS[k].ranged);
  check('the melee weapons reach 2.5 to 3.5 m', melee.every((k) => WEAPONS[k].reach >= 2.5 && WEAPONS[k].reach <= 3.5),
    melee.map((k) => `${k} ${WEAPONS[k].reach}`).join(', '));
  check('hands are the weakest and the quickest',
    WEAPONS.hand.damage < WEAPONS.pickaxe.damage && WEAPONS.hand.cooldown < WEAPONS.pickaxe.cooldown);
  check('the axe is the best in a swing and the slowest of the three',
    WEAPONS.axe.damage > WEAPONS.pickaxe.damage && WEAPONS.axe.cooldown > WEAPONS.pickaxe.cooldown);
  check('only the bow is ranged', names.filter((k) => WEAPONS[k].ranged).join(',') === 'bow');
  check('an unknown tool swings as a pair of hands', weaponFor('trombone') === WEAPONS.hand && weaponFor(undefined) === WEAPONS.hand);
}

// ---------------------------------------------------------------- the loot --
{
  const bad = [];
  for (const kind of Object.keys(KINDS)) {
    const l = lootFor(kind);
    if (!l || !GOODS[l.good] || !(l.n > 0) || l.coins !== GOODS[l.good].sell * l.n) bad.push(kind);
  }
  check('every species drops a real catalog good', bad.length === 0, bad.join(', ') || Object.keys(KINDS).join(', '));
  check('a deer gives venison, everything else gives wild game',
    lootFor('deer').good === 'venison' && ['wolf', 'fox', 'rabbit', 'squirrel', 'gull'].every((k) => lootFor(k).good === 'game_meat'));
  check('a wolf is worth more than a rabbit', lootFor('wolf').coins > lootFor('rabbit').coins,
    `${lootFor('wolf').coins} vs ${lootFor('rabbit').coins} coins`);
  check('a species that does not exist drops nothing', lootFor('dragon') === null && lootFor(undefined) === null);
  // and the audit the other way: pull a row and it has to shout
  const row = LOOT.fox; delete LOOT.fox;
  let threw = 0;
  try { auditLootTable(); } catch { threw++; }
  LOOT.fox = row;
  LOOT.fox = { good: 'moon_cheese', n: 1 };
  try { auditLootTable(); } catch { threw++; }
  LOOT.fox = row;
  check('a missing species and a made up good both throw', threw === 2, `${threw} of 2`);
  check('the loot table is whole again', auditLootTable() === true);
}

// ------------------------------------------------- every tool does its damage
{
  const { fauna } = world('boreal', true);
  const wolf = of(fauna, 'wolf');
  check('there is a wolf to swing at', !!wolf);
  check('a wolf has 4 hp, a deer 3, a fox 2, a rabbit, a squirrel and a gull 1',
    hpFor('wolf') === 4 && hpFor('deer') === 3 && hpFor('fox') === 2
    && hpFor('rabbit') === 1 && hpFor('squirrel') === 1 && hpFor('gull') === 1);
  const P = { x: CENTRE + 60, z: CENTRE };
  for (const tool of ['hand', 'pickaxe', 'axe']) {
    place(wolf, P.x + 2, P.z);
    clearField(fauna, wolf);
    const before = hpOf(wolf);
    const r = resolveSwing({ fauna, tool, playerPos: P, aimPos: null, now: 10000, lastSwingAt: -Infinity });
    check(`${tool}: the swing lands for ${WEAPONS[tool].damage}`,
      r.hit && r.damage === WEAPONS[tool].damage && before - hpOf(wolf) === WEAPONS[tool].damage,
      `${before} -> ${hpOf(wolf)} hp, reason ${r.reason}`);
    check(`${tool}: and it names what it hit`, r.kind === 'wolf' && swingText(r).includes('wolf'), swingText(r));
  }
  // a wolf takes four bare-handed blows and not three
  place(wolf, P.x + 2, P.z);
  let last = -Infinity, killedAt = 0;
  for (let i = 1; i <= 4; i++) {
    const now = 20000 + i * 500;
    const r = resolveSwing({ fauna, tool: 'hand', playerPos: P, aimPos: null, now, lastSwingAt: last });
    if (r.hit) last = now;
    if (i < 4) check(`bare handed blow ${i} of 4 leaves the wolf up`, r.hit && !r.killed && hpOf(wolf) === 4 - i, `${hpOf(wolf)} hp left`);
    else { killedAt = i; check('the fourth bare-handed blow kills it', r.hit && r.killed && r.reason === 'killed', `${hpOf(wolf)} hp`); }
  }
  check('a wolf survives three bare hands and dies on the fourth', killedAt === 4);
  fauna.dispose();
}

// ------------------------------------------------- one hit point dies to anything
{
  for (const tool of ['hand', 'pickaxe', 'axe', 'bow']) {
    const { fauna } = world('meadow');
    const small = of(fauna, 'rabbit') || of(fauna, 'squirrel');
    const P = { x: CENTRE + 60, z: CENTRE };
    place(small, P.x + 1.5, P.z);
    clearField(fauna, small);
    const r = resolveSwing({ fauna, tool, playerPos: P, aimPos: null, now: 9000, lastSwingAt: -Infinity, allowRanged: true });
    check(`a ${small.userData.wild.kind} at 1 hp dies to ${tool}`, r.hit && r.killed, `${r.reason}`);
    check(`and the kill hands over ${lootFor(small.userData.wild.kind).name}`,
      !!r.loot && !!GOODS[r.loot.good] && lootText(r.loot) === `${r.loot.n} ${r.loot.name.toLowerCase()}`,
      `${swingText(r)} (${lootText(r.loot)})`);
    check('and the line itself promises no pack it did not fill',
      swingText(r) === `the ${small.userData.wild.kind} goes down`, swingText(r));
    fauna.dispose();
  }
}

// ------------------------------------------------------- reach, both directions
{
  const { fauna } = world('meadow');
  const deer = of(fauna, 'deer');
  check('there is a deer to swing at', !!deer);
  const P = { x: CENTRE + 60, z: CENTRE };
  clearField(fauna, deer);
  // just outside the axe's reach
  place(deer, P.x + WEAPONS.axe.reach + 0.4, P.z);
  const miss = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: null, now: 5000, lastSwingAt: -Infinity });
  check('a swing past the axe\'s reach misses', !miss.hit && miss.reason === 'out_of_reach', miss.reason);
  check('and it says how far off the nearest one is', /\d+ m off/.test(swingText(miss)), swingText(miss));
  check('a miss takes nothing off it', hpOf(deer) === hpFor('deer'), `${hpOf(deer)} hp`);
  // and the other way: a step closer and the same swing lands
  place(deer, P.x + WEAPONS.axe.reach - 0.4, P.z);
  const hit = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: null, now: 5000, lastSwingAt: -Infinity });
  check('inside the reach the same swing lands', hit.hit && hit.reason === 'killed', hit.reason);
  // the hand reaches less far than the axe, on the same animal on the same spot
  const deer2 = of(fauna, 'deer') === deer ? fauna.all().find((m) => m.userData.wild.kind === 'deer' && m !== deer) : of(fauna, 'deer');
  if (deer2) {
    place(deer2, P.x + 3.0, P.z);
    clearField(fauna, deer2);
    const byHand = resolveSwing({ fauna, tool: 'hand', playerPos: P, aimPos: null, now: 6000, lastSwingAt: -Infinity });
    const byAxe = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: null, now: 6000, lastSwingAt: -Infinity });
    check('at 3.0 m the hand cannot reach and the axe can',
      !byHand.hit && byHand.reason === 'out_of_reach' && byAxe.hit, `${byHand.reason} / ${byAxe.reason}`);
  } else check('a second deer to test the two reaches on', false, 'none in this chunk');
  fauna.dispose();
}

// ------------------------------------------------- the cooldown, both directions
{
  const { fauna } = world('boreal', true);
  const wolf = of(fauna, 'wolf');
  const P = { x: CENTRE + 60, z: CENTRE };
  place(wolf, P.x + 2, P.z);
  clearField(fauna, wolf);
  const cd = WEAPONS.axe.cooldown;
  const first = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: null, now: 1000, lastSwingAt: -Infinity });
  check('the first swing lands', first.hit, first.reason);
  const hpAfterFirst = hpOf(wolf);
  const early = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: null, now: 1000 + cd - 1, lastSwingAt: 1000 });
  check('a second swing one ms early is refused', !early.hit && early.reason === 'cooldown', early.reason);
  check('and the refusal takes no hp', hpOf(wolf) === hpAfterFirst, `${hpOf(wolf)}`);
  check('and it says nothing, because the last swing already spoke', swingText(early) === '', swingText(early));
  check('it reports the wait', early.wait === 1, `${early.wait} ms`);
  const late = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: null, now: 1000 + cd, lastSwingAt: 1000 });
  check('one ms later the swing lands', late.hit, late.reason);
  check('and the hp went down again', hpOf(wolf) < hpAfterFirst || late.killed, `${hpAfterFirst} -> ${hpOf(wolf)}`);
  // the hand's cooldown is its own, not the axe's
  const quick = resolveSwing({ fauna, tool: 'hand', playerPos: P, aimPos: null, now: 1000 + WEAPONS.hand.cooldown, lastSwingAt: 1000 });
  check('the hand is ready while the axe would not be',
    WEAPONS.hand.cooldown < cd && (quick.hit || quick.reason !== 'cooldown'), quick.reason);
  fauna.dispose();
}

// -------------------------------------------------- the cursor picks the target
{
  const { fauna } = world('meadow');
  const all = fauna.all().filter((m) => m.userData.roam);
  const A = all[0], B = all[1];
  check('two animals to choose between', !!A && !!B);
  const P = { x: CENTRE + 60, z: CENTRE };
  for (const m of fauna.all()) if (m !== A && m !== B) m.position.set(CENTRE + 900, 3, CENTRE + 900);
  const near = () => place(A, P.x + 1.0, P.z);
  const far = () => place(B, P.x + 2.6, P.z);
  const dP = (m) => Math.hypot(m.position.x - P.x, m.position.z - P.z);

  near(); far();
  check('one of them really is nearer to the player', dP(A) < dP(B), `${dP(A).toFixed(1)} vs ${dP(B).toFixed(1)} m`);
  const outward = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: { x: P.x + 9, z: P.z }, now: 100, lastSwingAt: -Infinity });
  check('the cursor out past both picks the FAR one, not the near one', outward.animal === B, outward.animal === A ? 'took the near one' : 'ok');

  near(); far();
  const inward = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: { x: P.x + 0.6, z: P.z }, now: 100, lastSwingAt: -Infinity });
  check('and the cursor at your feet picks the NEAR one', inward.animal === A, inward.animal === B ? 'took the far one' : 'ok');

  // sideways, so the answer cannot be "further along the same line" by accident
  place(A, P.x + 1.0, P.z + 2.0);
  place(B, P.x + 1.0, P.z - 2.0);
  const north = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: { x: P.x + 1, z: P.z + 8 }, now: 100, lastSwingAt: -Infinity });
  place(A, P.x + 1.0, P.z + 2.0); place(B, P.x + 1.0, P.z - 2.0);
  const south = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: { x: P.x + 1, z: P.z - 8 }, now: 100, lastSwingAt: -Infinity });
  check('with two at the same distance the cursor decides, both ways',
    north.animal === A && south.animal === B, `${north.animal === A} / ${south.animal === B}`);

  // no cursor at all: the nearest to the player
  near(); far();
  const blind = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: null, now: 100, lastSwingAt: -Infinity });
  check('with no cursor it takes the nearest to you', blind.animal === A);
  fauna.dispose();
}

// ------------------------------------------------------ the blow sends it away
{
  const { fauna } = world('meadow');
  const deer = of(fauna, 'deer');
  const AWAY = { x: CENTRE + 60, z: CENTRE };      // well clear of the player, so nothing spooks it
  const dot = (m, fromX, fromZ) => {
    const h = m.userData.roam.heading;
    return Math.cos(h) * (m.position.x - fromX) + Math.sin(h) * (m.position.z - fromZ);
  };
  // hit from the east: it must be heading west, which is a positive dot with
  // (animal - blow). Then hit from the west and the same test has to hold.
  for (const [dx, dz, label] of [[5, 0, 'from the east'], [-5, 0, 'from the west'], [0, 5, 'from the south'], [0, -5, 'from the north']]) {
    place(deer, AWAY.x, AWAY.z);
    deer.userData.roam.hp = 99;                    // survives, so it flees rather than dies
    const res = fauna.damage(deer, 1, AWAY.x + dx, AWAY.z + dz, 30000);
    check(`hit ${label}, it heads away from the blow`, res && dot(deer, AWAY.x + dx, AWAY.z + dz) > 0,
      `dot ${dot(deer, AWAY.x + dx, AWAY.z + dz).toFixed(2)}`);
    check(`hit ${label}, it is fleeing and faster than it was`,
      deer.userData.roam.state === 'flee' && deer.userData.roam.speed > deer.userData.roam.homeSpeed,
      `${deer.userData.roam.state} at ${deer.userData.roam.speed.toFixed(1)} m/s`);
  }
  // and the words are not the deed: run the wander code and watch it actually go
  place(deer, AWAY.x, AWAY.z);
  deer.userData.roam.hp = 99;
  fauna.damage(deer, 1, AWAY.x + 5, AWAY.z, 40000);
  const x0 = deer.position.x;
  for (let i = 0; i < 40; i++) fauna.update(0.033, 40000 + i * 33, CENTRE, CENTRE, false);
  const westward = x0 - deer.position.x;
  check('struck from the east it really does run west', westward > 3, `${westward.toFixed(1)} m in 1.3 s`);
  place(deer, AWAY.x, AWAY.z);
  deer.userData.roam.hp = 99;
  fauna.damage(deer, 1, AWAY.x - 5, AWAY.z, 60000);
  const x1 = deer.position.x;
  for (let i = 0; i < 40; i++) fauna.update(0.033, 60000 + i * 33, CENTRE, CENTRE, false);
  check('struck from the west it really does run east', deer.position.x - x1 > 3, `${(deer.position.x - x1).toFixed(1)} m`);
  // resolveSwing itself moves nothing: the wander code owns that
  place(deer, AWAY.x, AWAY.z);
  deer.userData.roam.hp = 99;
  const before = deer.position.clone();
  resolveSwing({ fauna, tool: 'axe', playerPos: { x: AWAY.x - 2, z: AWAY.z }, aimPos: null, now: 70000, lastSwingAt: -Infinity });
  check('a swing writes the heading and moves nothing itself', deer.position.equals(before));
  fauna.dispose();
}

// ---------------------------------------------------------------- the dead --
{
  const { fauna } = world('meadow');
  const small = of(fauna, 'rabbit') || of(fauna, 'squirrel');
  const P = { x: CENTRE + 60, z: CENTRE };
  place(small, P.x + 1.5, P.z);
  clearField(fauna, small);
  check('it is a target before the blow', fauna.targets().includes(small)
    && fauna.hitTest(P.x, P.z, 3).includes(small));
  const goneBefore = fauna.stats.despawned;
  const kill = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: null, now: 80000, lastSwingAt: -Infinity });
  check('the swing kills it', kill.hit && kill.killed);
  check('a dead animal is not in hitTest', !fauna.hitTest(P.x, P.z, 3).includes(small), `${fauna.hitTest(P.x, P.z, 3).length} still there`);
  check('a dead animal is not in targets()', !fauna.targets().includes(small));
  check('but it is still on the field while it falls', fauna.all().includes(small));
  const rec = small.userData.wild.rec;
  for (let i = 0; i < 200; i++) fauna.update(0.033, 80000 + i * 33, CENTRE, CENTRE, false);
  // the MODEL comes back from the pool as some other animal, which is the point
  // of the pool. What must not come back is this animal: its record.
  check('it tips over and then the body goes', fauna.stats.despawned > goneBefore,
    `${goneBefore} -> ${fauna.stats.despawned} despawned`);
  check('and it does not stand up again while you are here',
    !fauna.all().some((m) => m.userData.wild.rec === rec));
  check('nothing left standing is dead',
    fauna.all().every((m) => !m.userData.roam || m.userData.roam.state !== 'dead'));
  check('a second swing at a corpse hits nothing', resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: null, now: 200000, lastSwingAt: -Infinity }).hit === false);
  check('damage on something that is not an animal returns null', fauna.damage(null, 1, 0, 0, 0) === null
    && fauna.damage(new THREE.Group(), 1, 0, 0, 0) === null);
  fauna.dispose();
}

// ------------------------------------------------------ the bow, and the gulls
{
  const { fauna } = world('beach');
  const gull = fauna.all()[0];
  check('there are gulls', !!gull && !!gull.userData.fly, `${fauna.all().length}`);
  const P = { x: gull.position.x, z: gull.position.z };
  for (const m of fauna.all()) if (m !== gull) m.position.set(P.x + 900, 20, P.z + 900);
  check('a gull overhead is within a swing\'s horizontal reach', fauna.hitTest(P.x, P.z, 3).includes(gull),
    `y ${gull.position.y.toFixed(1)}`);
  const swung = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: null, now: 1000, lastSwingAt: -Infinity });
  check('but an axe cannot reach it', !swung.hit && swung.reason === 'too_high', swung.reason);
  check('and it says so', swingText(swung).includes('out of reach'), swingText(swung));
  const bowSwing = resolveSwing({ fauna, tool: 'bow', playerPos: P, aimPos: null, now: 1000, lastSwingAt: -Infinity });
  check('a bow is not swung at all, because nothing fires it yet', !bowSwing.hit && bowSwing.reason === 'ranged', bowSwing.reason);
  check('and it says why', swingText(bowSwing).includes('bow'), swingText(bowSwing));
  // the other way: the day the arrow exists, one flag and the same call works
  const shot = resolveSwing({ fauna, tool: 'bow', playerPos: P, aimPos: null, now: 1000, lastSwingAt: -Infinity, allowRanged: true });
  check('with allowRanged the bow drops it', shot.hit && shot.killed && shot.kind === 'gull', shot.reason);
  check('a shot gull is out of hitTest at once', !fauna.hitTest(P.x, P.z, 4).includes(gull));
  const gy0 = gull.position.y;
  for (let i = 0; i < 20; i++) fauna.update(0.033, 1100 + i * 33, P.x, P.z, false);
  check('and it falls', gull.position.y < gy0 - 1, `${gy0.toFixed(1)} -> ${gull.position.y.toFixed(1)}`);
  const rec = gull.userData.wild.rec;
  const goneBefore = fauna.stats.despawned;
  for (let i = 0; i < 200; i++) fauna.update(0.033, 2000 + i * 33, P.x, P.z, false);
  check('then the body goes and does not come back', fauna.stats.despawned > goneBefore
    && !fauna.all().some((m) => m.userData.wild.rec === rec),
    `${goneBefore} -> ${fauna.stats.despawned} despawned`);
  fauna.dispose();
}

// ----------------------------------------------- looking before you swing --
// interact.js asks pickTarget first, to weigh the animal against the tree behind
// it. Asking must cost the animal nothing, and the answer must be the one the
// swing then takes.
{
  const { fauna } = world('meadow');
  const deer = of(fauna, 'deer');
  const P = { x: CENTRE + 60, z: CENTRE };
  place(deer, P.x + 2, P.z);
  clearField(fauna, deer);
  const hp0 = hpOf(deer);
  const look = pickTarget({ fauna, tool: 'axe', playerPos: P, aimPos: null });
  check('pickTarget names the animal it would hit', look.animal === deer && look.reason === 'target');
  check('and looking costs it nothing', hpOf(deer) === hp0 && deer.userData.roam.state === 'walk',
    `${hpOf(deer)} hp, ${deer.userData.roam.state}`);
  check('it reports both distances', Math.abs(look.dist - 2) < 1e-6 && Math.abs(look.aimDist - 2) < 1e-6,
    `${look.dist.toFixed(2)} m from you, ${look.aimDist.toFixed(2)} m from the cursor`);
  const swing = resolveSwing({ fauna, tool: 'axe', playerPos: P, aimPos: null, now: 1000, lastSwingAt: -Infinity });
  check('and the swing takes exactly what the look promised', swing.animal === look.animal
    && Math.abs(swing.aimDist - look.aimDist) < 1e-6);
  // and the refusals line up too, both ways
  place(deer, P.x + 10, P.z);
  const far = pickTarget({ fauna, tool: 'axe', playerPos: P, aimPos: null });
  check('out of reach, pickTarget says so and names no animal', !far.animal && far.reason === 'out_of_reach');
  check('and it says how far off it is', Math.abs(far.nearest - 10) < 0.001, `${far.nearest} m`);
  // and past even that wider look, there is nothing to report a distance for
  place(deer, P.x + 60, P.z);
  const gone = pickTarget({ fauna, tool: 'axe', playerPos: P, aimPos: null });
  check('with nothing alive anywhere near, the miss reports no distance at all',
    !gone.animal && gone.nearest === null, `${gone.nearest}`);
  place(deer, P.x + 10, P.z);
  check('a bow looks at nothing until something fires it',
    pickTarget({ fauna, tool: 'bow', playerPos: P, aimPos: null }).reason === 'ranged');
  check('and with allowRanged it sees the same deer at 10 m',
    pickTarget({ fauna, tool: 'bow', playerPos: P, aimPos: null, allowRanged: true }).animal === deer);
  check('no world, no target', pickTarget({}).reason === 'no_fauna' && pickTarget().animal === null);
  fauna.dispose();
}

// ------------------------------------------------------------ bad arguments --
{
  const { fauna } = world('meadow');
  check('no fauna at all is a refusal, not a throw',
    resolveSwing({ tool: 'axe', playerPos: { x: 0, z: 0 }, now: 0, lastSwingAt: -Infinity }).reason === 'no_fauna');
  check('no player position is a refusal',
    resolveSwing({ fauna, tool: 'axe', playerPos: null, now: 0, lastSwingAt: -Infinity }).reason === 'no_position');
  check('an empty call is a refusal', resolveSwing().hit === false);
  check('a refusal is always shaped like a result',
    ['hit', 'animal', 'damage', 'killed', 'reason'].every((k) => k in resolveSwing()));
  check('nothing is named an animal that is not one', nameFor('deer') === 'deer' && nameFor('kraken') === 'animal');
  fauna.dispose();
}

// ===========================================================================
// The MMO runtime half: createCombat.
//
// Fake actors, on purpose. `actor.js` is agent W1's and is being written at the
// same time as this file, so everything below drives the plain object
// 07-RUNTIME-CONTRACT describes and nothing else. The resolver underneath is
// the real `combat_rules.js`, and the rng is a fixed list, so every number
// printed here is one this code actually produced and not one it was told to.

import {
  createCombat, SWING_LAND_S, IN_COMBAT_MS, BODY_RADIUS, reachBetween, actorDistance, REACH_RISE, spellShape,
} from './combat.js';
import { swingSeconds, poisonTick, fallDamage, hitChance, JUMP_ATTACK_MULT } from '../mmo/combat_rules.js';

/** An rng that returns the numbers you give it, then 0.5 for ever. */
const rolls = (...list) => { let i = 0; return () => (i < list.length ? list[i++] : 0.5); };

function actorOf(over = {}) {
  return {
    id: over.id || 'a', kind: over.kind || 'monster', name: over.name || 'thing',
    pos: { x: 0, y: 0, z: 0 }, yaw: 0,
    stats: { str: 0, dex: 0, int: 0, con: 0, wis: 0 },
    skills: { wrestling: 50, tactics: 0, anatomy: 0, parrying: 0 },
    bonuses: {}, ar: 0, resists: {},
    weapon: { skill: 'wrestling', minDamage: 10, maxDamage: 10, speed: 2, weight: 3, damageType: 'physical', reach: 1.5 },
    shield: null,
    health: 100, maxHealth: 100, mana: 50, maxMana: 50, stamina: 100, maxStamina: 100,
    buffs: [], status: {}, lastSwingAt: -Infinity, casting: null, faction: 'hostile',
    ai: null, anim: 'idle',
    ...over,
  };
}

/** A floaters stand-in that records every number it was asked to show. */
const floatersSpy = () => { const seen = []; return { seen, spawn: (p, text, kind) => seen.push({ text, kind, x: p.x, z: p.z }) }; };
/** A progression stand-in that records every lesson it was handed. */
const progressionSpy = () => {
  const seen = [];
  return { seen, lesson: (who, skill, d, ok) => seen.push({ who, skill, d, ok }), statLesson: (who, stat, d, ok) => seen.push({ who, stat, d, ok }) };
};

// ------------------------------------------------- the clock and the cooldown
{
  const a = actorOf({ id: 'att' }), b = actorOf({ id: 'def' });
  const c = createCombat({ rng: rolls(0) });
  const secs = swingSeconds(a);
  check('a 2.0 s weapon at 0 DEX swings every 2.0 s', secs === 2, `${secs}`);

  const first = c.queueSwing(a, b, { now: 0 });
  check('the first swing is queued', first.queued === true);
  const early = c.queueSwing(a, b, { now: 1999 });
  check('a swing 1 ms early is refused', early.queued === false && early.reason === 'cooldown', `wait ${Math.round(early.wait)} ms`);
  const late = c.queueSwing(a, b, { now: 2000 });
  check('the same swing at 2000 ms is taken', late.queued === true);

  // and the blow lands SWING_LAND_S after the swing starts, not with it
  const d = actorOf({ id: 'd2' });
  const c2 = createCombat({ rng: rolls(0, 0.5) });     // 0 -> a certain hit
  c2.queueSwing(a, d, { now: 10000 });
  c2.update(0, 10000 + SWING_LAND_S * 1000 - 1);
  check('a swing still in the air has taken no health', d.health === 100 && c2.pendingCount === 1);
  c2.update(0, 10000 + SWING_LAND_S * 1000);
  check('and it lands exactly SWING_LAND_S later', d.health < 100 && c2.pendingCount === 0, `health ${d.health}`);
}

// --------------------------------------------------------- twenty real swings
{
  // Twenty swings at 2 s each over 40 s, driven frame by frame at 60 Hz, and
  // counted. This is the rate the player will actually feel.
  const a = actorOf({ id: 'att' }), b = actorOf({ id: 'def', health: 1e6, maxHealth: 1e6 });
  const c = createCombat({ rng: rolls() });
  let landed = 0;
  c.onDeath(() => {});
  let health = b.health;
  for (let f = 0; f < 60 * 40; f++) {
    const now = f * (1000 / 60);
    c.queueSwing(a, b, { now });
    c.update(1 / 60, now);
    if (b.health !== health) { landed++; health = b.health; }
  }
  check('holding the button for 40 s at a 2 s weapon lands 20 blows', landed === 20, `${landed}`);
}

// ----------------------------------------------------------- who sees the red
{
  const f = floatersSpy();
  const monster = actorOf({ id: 'm', kind: 'monster' });
  const player = actorOf({ id: 'p', kind: 'player' });
  const c = createCombat({ floaters: f, rng: rolls(0, 0.5) });
  c.queueSwing(monster, player, { now: 0 });
  c.update(0, 400);
  const n = f.seen[f.seen.length - 1];
  check('a blow on the player is red, not white', n.kind === 'taken', `${n.kind} ${n.text}`);

  const f2 = floatersSpy();
  const c2 = createCombat({ floaters: f2, rng: rolls(0, 0.5) });
  c2.queueSwing(player, monster, { now: 0 });
  c2.update(0, 400);
  check('the same blow the other way is white', f2.seen[f2.seen.length - 1].kind === 'damage');

  // a miss says the word, over the thing that was missed
  const f3 = floatersSpy();
  const c3 = createCombat({ floaters: f3, rng: rolls(0.99) });
  const m2 = actorOf({ id: 'm2' });
  // 5000, not 0: this player swung at 0 in the check above and the cooldown is
  // on the ACTOR, not on the combat object, so it follows him between them
  c3.queueSwing(player, m2, { now: 5000 });
  c3.update(0, 5400);
  check('a miss says "miss" and takes nothing', f3.seen.some((s) => s.text === 'miss') && m2.health === 100);
}

// ------------------------------------------------------------- who learns
{
  const p = progressionSpy();
  const player = actorOf({ id: 'p', kind: 'player' });
  const monster = actorOf({ id: 'm', kind: 'monster' });
  const c = createCombat({ progression: p, rng: rolls(0, 0.5) });
  c.queueSwing(player, monster, { now: 0 });
  c.update(0, 400);
  check('the player is taught by his own swing', p.seen.length > 0 && p.seen.every((l) => l.who === player), `${p.seen.length} lessons`);
  check('and the lesson names the weapon skill', p.seen.some((l) => l.skill === 'wrestling'));

  const p2 = progressionSpy();
  const c2 = createCombat({ progression: p2, rng: rolls(0, 0.5) });
  const m1 = actorOf({ id: 'm1' }), m2 = actorOf({ id: 'm2' });
  c2.queueSwing(m1, m2, { now: 0 });
  c2.update(0, 400);
  check('two monsters fighting teach nobody anything', p2.seen.length === 0, `${p2.seen.length} lessons`);

  // a monster swinging at the player still teaches the PLAYER, as the defender
  const p3 = progressionSpy();
  const c3 = createCombat({ progression: p3, rng: rolls(0, 0.5) });
  const pl = actorOf({ id: 'p3', kind: 'player' });
  c3.queueSwing(actorOf({ id: 'm3' }), pl, { now: 0 });
  c3.update(0, 400);
  check("being hit teaches the player's CON", p3.seen.some((l) => l.stat === 'con' && l.who === pl));
}

// --------------------------------------------------------------- reach
{
  const a = actorOf(), b = actorOf();
  const r = reachBetween(a, b);
  check('reach is the weapon plus both bodies', Math.abs(r - (1.5 + BODY_RADIUS * 2)) < 1e-9, `${r} m`);
  b.pos.x = r + 0.01;
  const c = createCombat({ rng: rolls() });
  const no = c.queueSwing(a, b, { now: 0 });
  check('a hair past reach is refused', no.queued === false && no.reason === 'out_of_reach', `${no.dist.toFixed(2)} m vs ${no.reach.toFixed(2)}`);
  b.pos.x = r - 0.01;
  check('a hair inside it is taken', c.queueSwing(a, b, { now: 0 }).queued === true);
  // flat first, and height only past REACH_RISE: on a mountainside the AI (which
  // walks to reach measured flat) and this (measured through the air) disagreed
  // by a metre and a wolf and a player stood two metres apart hitting nothing
  check('distance is flat distance until the rise passes a shoulder',
    Math.abs(actorDistance({ pos: { x: 0, y: 1.0, z: 4 } }, { pos: { x: 0, y: 0, z: 0 } }) - 4) < 1e-9);
  check('and a target well above your head counts the rise beyond it',
    Math.abs(actorDistance({ pos: { x: 0, y: 3 + REACH_RISE, z: 4 } }, { pos: { x: 0, y: 0, z: 0 } }) - 5) < 1e-9);
  check('a wolf a metre downslope at two metres flat is within a sword and a body',
    actorDistance({ pos: { x: 2, y: -1, z: 0 } }, { pos: { x: 0, y: 0, z: 0 } }) <= reachBetween({ equipment: {} }, {}) + 1e-9,
    `${actorDistance({ pos: { x: 2, y: -1, z: 0 } }, { pos: { x: 0, y: 0, z: 0 } }).toFixed(2)} vs reach ${reachBetween({ equipment: {} }, {}).toFixed(2)}`);
}

// ------------------------------------------------------------------- leech
{
  const a = actorOf({ health: 50, bonuses: { lifeLeech: 50, manaLeech: 20 }, mana: 0 });
  const b = actorOf();
  const c = createCombat({ rng: rolls(0, 0.5) });
  c.queueSwing(a, b, { now: 0 });
  c.update(0, 400);
  const dealt = 100 - b.health;
  check('life leech returns half of what it dealt', a.health === 50 + Math.round(dealt * 0.5), `dealt ${dealt}, healed to ${a.health}`);
  check('mana leech returns a fifth', a.mana === Math.round(dealt * 0.2), `${a.mana} mana`);

  // and it cannot heal past full
  const full = actorOf({ health: 100, bonuses: { lifeLeech: 100 } });
  const c2 = createCombat({ rng: rolls(0, 0.5) });
  c2.queueSwing(full, actorOf(), { now: 0 });
  c2.update(0, 400);
  check('leech never heals past full', full.health === 100);
}

// ------------------------------------------------------------------ poison
{
  const c = createCombat({ rng: rolls() });
  const v = actorOf({ health: 100 });
  const tick = poisonTick(2);
  check('poison 2 is 4 a second for 12 s', tick.perSecond === 4 && tick.seconds === 12);
  c.applyStatus(v, 'poison', { level: 2 }, 0);
  // eleven seconds of it
  for (let s = 1; s <= 11; s++) c.update(1, s * 1000);
  check('eleven ticks have taken 44', v.health === 100 - 44, `${100 - v.health} taken`);
  c.update(1, 12000);
  check('the twelfth tick takes the last of it', v.health === 100 - 48, `${100 - v.health} taken`);
  c.update(1, 13000);
  check('and then it stops', v.health === 100 - 48 && !v.status.poison);

  // a bleed with an explicit rate, which is how Rend writes it
  const b = actorOf({ health: 100 });
  const c2 = createCombat({ rng: rolls() });
  c2.applyStatus(b, 'bleed', { perSecond: 3, seconds: 8 }, 0);
  for (let s = 1; s <= 8; s++) c2.update(1, s * 1000);
  check('Rend bleeds 3 a second for 8 s, which is 24', b.health === 76, `${100 - b.health}`);
  c2.update(1, 9000);
  check('and the bleed is gone after its eight seconds', !b.status.bleed);
}

// -------------------------------------------------------------------- falls
{
  const c = createCombat({ rng: rolls() });
  const p = actorOf({ kind: 'player', health: 170, maxHealth: 170 });
  check('a 4 m drop is free', c.applyFall(p, 4, 0) === 0 && p.health === 170);
  check('a 10 m drop costs 36', c.applyFall(p, 10, 0) === 36 && p.health === 134, `${p.health} left`);
  // 02-COMBAT says "32 m kills a fresh warrior of 170 health outright". Its own
  // formula says (32 - 4) * 6 = 168, which leaves that warrior standing on 2.
  // The formula is the rule and the sentence is a rounding of it, so this is
  // measured rather than believed, and 33 m is the drop that actually does it.
  const fresh = actorOf({ kind: 'player', health: 170, maxHealth: 170 });
  const c2 = createCombat({ rng: rolls() });
  const took = c2.applyFall(fresh, 32, 0);
  check('a 32 m drop takes 168 and leaves him on 2', took === 168 && took === fallDamage(32) && fresh.health === 2, `${took} damage, ${fresh.health} left`);
  const fresh2 = actorOf({ kind: 'player', health: 170, maxHealth: 170 });
  let died = null;
  const c3 = createCombat({ rng: rolls() });
  c3.onDeath((a) => { died = a; });
  const took2 = c3.applyFall(fresh2, 33, 0);
  check('33 m kills him outright', fallDamage(33) === 174 && fresh2.health === 0 && died === fresh2, `the fall was worth ${fallDamage(33)}, he only had ${took2}`);
  check('and the body is told to fall over', fresh2.anim === 'die');
}

// -------------------------------------------------------------------- death
{
  let calls = 0, last = null;
  const c = createCombat({ rng: rolls(0, 0.5) });
  c.onDeath((a, k) => { calls++; last = { a, k }; });
  const killer = actorOf({ id: 'killer' });
  const dying = actorOf({ id: 'dying', health: 1 });
  c.queueSwing(killer, dying, { now: 0 });
  c.update(0, 400);
  check('a killing blow fires onDeath once', calls === 1 && last.a === dying && last.k === killer);
  check('the dead thing is at zero and told to fall', dying.health === 0 && dying.anim === 'die');
  c.queueSwing(killer, dying, { now: 5000 });
  check('nothing may swing at a corpse', c.queueSwing(killer, dying, { now: 9000 }).reason === 'dead');
  c.update(0, 9400);
  check('and onDeath does not fire twice', calls === 1);
}

// --------------------------------------------------------------- in combat
{
  const c = createCombat({ rng: rolls() });
  const a = actorOf(), b = actorOf();
  check('nobody starts in combat', c.inCombat(a, 0) === false);
  c.queueSwing(a, b, { now: 1000 });
  check('a swing puts you in combat', c.inCombat(a, 1000) === true);
  check('and you are still in it a second later', c.inCombat(a, 2000) === true);
  check('and out of it after six', c.inCombat(a, 1000 + IN_COMBAT_MS) === false);
}

// ------------------------------------------------------------------- spells
{
  const f = floatersSpy();
  const c = createCombat({ floaters: f, rng: rolls(0.5, 0.99) });
  const caster = actorOf({ kind: 'player', stats: { int: 50 } });
  const target = actorOf({ health: 200, maxHealth: 200 });
  const q = c.queueSpell(caster, { base: [18, 26], damageType: 'fire' }, target, { now: 0 });
  check('a spell is queued', q.queued === true);
  c.update(0, 200);
  check('and it lands', target.health < 200, `${200 - target.health} damage`);

  // the ability record shape, damage buried in a combo
  const fireball = { id: 'fireball', effect: { kind: 'combo', parts: [{ kind: 'spellDamage', min: 18, max: 26, type: 'fire' }, { kind: 'dot', perSecond: 2 }] } };
  const shaped = spellShape(fireball);
  check('an ability record is unwrapped to its damage', shaped.base[0] === 18 && shaped.base[1] === 26 && shaped.damageType === 'fire');
  check('an ability that does no damage is not a spell to resolve', spellShape({ effect: { kind: 'buff' } }) === null);
  check('a spell at a corpse is refused', c.queueSpell(caster, { base: [1, 1] }, actorOf({ health: 0 }), { now: 0 }).reason === 'dead');
}

// ---------------------------------------------- the arithmetic is not ours
{
  // A grandmaster against a rat, and a rat against a grandmaster, so the hit
  // chances this runtime hands out are the document's own.
  const gm = actorOf({ skills: { wrestling: 100, tactics: 100, parrying: 100 }, stats: { dex: 100, str: 100 } });
  const rat = actorOf({ skills: { wrestling: 15, parrying: 10 }, stats: { dex: 0 } });
  const up = hitChance(gm, rat), down = hitChance(rat, gm);
  check('a grandmaster hits a rat at the 0.95 cap', up === 0.95, `${up}`);
  check('and the rat hits back at the 0.10 floor', down === 0.10, `${down}`);
}

// ---------------------------------------------- the old hunting path is intact
{
  const { fauna } = world('meadow');
  const deer = of(fauna, 'deer');
  place(deer, 100, 100);
  const res = resolveSwing({ fauna, tool: 'axe', playerPos: { x: 101, z: 100 }, aimPos: { x: 100, z: 100 }, now: 0, lastSwingAt: -Infinity });
  check('an axe still kills a deer through the old path', res.hit === true && res.killed === true, res.reason);
  check('and it still says so', swingText(res) === 'the deer goes down');
  fauna.dispose();
}

// ------------------------------------ what an ability asks a swing to do
//
// `abilities_runtime.js` (W4) sends five things with a swing: multiplier,
// hitBonus, ignoreARFraction, jumpAttack and immediate. Each of them is driven
// here BOTH ways, because an option that is passed and read by nothing is the
// exact bug this project keeps finding: the effect exists, the path does not.
{
  const base = () => actorOf({ id: 'p', kind: 'player' });
  const dummy = () => actorOf({ id: 'd', health: 1e6, maxHealth: 1e6, ar: 0 });

  // multiplier: the same roll and the same crit, times 1.6
  const hit = (opts, ar = 0) => {
    const a = base(), b = dummy();
    b.ar = ar;
    const c = createCombat({ rng: rolls(0, 0.5, 0.5, 0.99) });     // hit, no dodge/parry path, mid roll, no crit
    c.queueSwing(a, b, { now: 0, ...opts });
    c.update(0, 400);
    return 1e6 - b.health;
  };
  const plain = hit({});
  const powered = hit({ multiplier: 1.6 });
  check('an ability multiplier really multiplies the damage',
    Math.abs(powered / plain - 1.6) < 0.06, `${plain} plain, ${powered} at 1.6x`);
  const air = hit({ jumpAttack: true });
  check('and a jump attack is a quarter more', Math.abs(air / plain - JUMP_ATTACK_MULT) < 0.06, `${plain} on the ground, ${air} in the air`);
  const both = hit({ multiplier: 1.6, jumpAttack: true });
  check('and the two multiply together rather than one winning',
    Math.abs(both / plain - 1.6 * JUMP_ATTACK_MULT) < 0.06, `${both} against ${plain}`);

  // ignoreARFraction: AR 120 halves, and half of it ignored halves less
  const armoured = hit({}, 120);
  const pierced = hit({ ignoreARFraction: 1 }, 120);
  check('AR 120 halves a blow', Math.abs(armoured / plain - 0.5) < 0.02, `${armoured} against ${plain}`);
  check('and ignoring all of it puts the blow back to full',
    pierced === plain, `${pierced} against ${plain}`);

  // hitBonus: skill points onto the attack roll, proved on the roll it flips
  const a1 = base(), b1 = dummy();
  const c1 = createCombat({ rng: rolls(0.64) });      // hitChance is 0.625 without help
  c1.queueSwing(a1, b1, { now: 0 });
  c1.update(0, 400);
  check('a roll of 0.64 misses at a hit chance of 0.625', b1.health === 1e6);
  const a2 = base(), b2 = dummy();
  const c2 = createCombat({ rng: rolls(0.64, 0.5, 0.5, 0.99) });
  c2.queueSwing(a2, b2, { now: 0, hitBonus: 10 });    // +10 skill = +5 points of chance
  c2.update(0, 400);
  check('and the same roll lands with ten points of hitBonus', b2.health < 1e6, `${1e6 - b2.health} damage`);
  check('and the bonus did not stick to the swinger', !a2.bonuses.hit);

  // immediate: three shots in one frame, and the ordinary swing timer untouched
  const a3 = base(), b3 = dummy();
  const c3 = createCombat({ rng: rolls() });
  let queued = 0;
  for (let i = 0; i < 3; i++) if (c3.queueSwing(a3, b3, { now: 0, immediate: true }).queued) queued++;
  check('three immediate shots all go', queued === 3, `${queued} of 3`);
  check('and none of them started the weapon cooldown', a3.lastSwingAt === -Infinity);
  const a4 = base(), b4 = dummy();
  const c4 = createCombat({ rng: rolls() });
  let ordinary = 0;
  for (let i = 0; i < 3; i++) if (c4.queueSwing(a4, b4, { now: 0 }).queued) ordinary++;
  check('and without it three clicks in one frame are one swing', ordinary === 1, `${ordinary} of 3`);
}

// ------------------------------------------------- a swing whose owner left
{
  const c = createCombat({ rng: rolls(0, 0.5) });
  const gone = actorOf({ id: 'gone' }), player = actorOf({ id: 'p', kind: 'player' });
  c.queueSwing(gone, player, { now: 0 });
  check('the swing is in the air', c.pendingCount === 1);
  check('forgetting the swinger takes it out of the air', c.forget(gone) === 1 && c.pendingCount === 0);
  c.update(0, 400);
  check('and nothing lands from a body that is no longer there', player.health === 100);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
