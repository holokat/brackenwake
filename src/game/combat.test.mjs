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

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
