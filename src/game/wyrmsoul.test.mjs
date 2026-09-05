// Wyrmsoul, measured. Run:  node src/game/wyrmsoul.test.mjs
//
// Nothing in here is asserted from having written it. The world clock is driven
// with real monster movement out of `monsters.js`; the breath goes through the
// real `combat.queueSpell` and the health really comes off; the HUD is the real
// `createHud` against the same small fake document `hud.test.mjs` uses; the
// visuals are real three.js geometry and the triangles are counted off it.
//
// What is stubbed is the world AROUND the system: a flat ground, a window
// manager that records, an audio that counts cues. The dragon system itself,
// the resolver, the clock and the rules are the ones the game runs.

globalThis.performance ||= { now: () => 1000 };
globalThis.window ||= { innerWidth: 1600, innerHeight: 900, addEventListener() {}, removeEventListener() {} };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

// --- a document, small enough to read ---------------------------------------
// The same shim `hud.test.mjs` uses, and for the same reason: what is measured
// below is the real `createHud` building real nodes, not a description of it.
function makeDom() {
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '',
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      listeners: {},
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) {
          const on = force === undefined ? !classes.has(c) : !!force;
          if (on) classes.add(c); else classes.delete(c);
          return on;
        },
      },
      appendChild(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.push(c); return c;
      },
      remove() {
        if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; }
      },
      addEventListener(name, fn) { (node.listeners[name] ||= []).push(fn); },
      fire(name, ev) { for (const fn of node.listeners[name] || []) fn(ev); },
      get firstChild() { return node.children[0] || null; },
      get lastChild() { return node.children[node.children.length - 1] || null; },
      querySelector() { return null; },
    };
    return node;
  };
  const byId = new Map();
  const doc = {
    createElement: el,
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { if (c.id) byId.set(c.id, c); return c; } },
    body: el('body'),
  };
  // every node the HUD gives an id to is findable, which is how the arc, the
  // thirteenth cell and the amber shell are read back below
  const wrapped = doc.createElement;
  doc.createElement = (tag) => {
    const n = wrapped(tag);
    let id = '';
    Object.defineProperty(n, 'id', {
      get: () => id,
      set: (v) => { id = v; if (v) byId.set(v, n); },
    });
    return n;
  };
  return doc;
}
globalThis.document = makeDom();
globalThis.setTimeout ||= () => 0;

import * as THREE from 'three';
import * as W from './wyrmsoul.js';
import { auditWyrmsoulVisuals, createWyrmsoulVisuals, flameTexture, GOLD } from './wyrmsoul_visuals.js';
import { createWorldClock } from './app/context.js';
import { dragon as dragonSystem } from './app/systems/dragon.js';
import { FRAME_ORDER, SYSTEMS } from './app/systems/index.js';
import { createCombat, SWING_LAND_S } from './combat.js';
import { playerActor, spawnMonster, recompute } from './actor.js';
import { stepToward, stepMonster } from './monsters.js';
import { APART_M, GIFT_IDS, AGE_STATS } from './dragon.js';
import { BAR_KEYS, WYRMSOUL_KEY, FLASH_S, bondDash, bondArcSvg, BOND_ARC_LENGTH } from './hud.js';
import { RESERVED_KEYS } from './windows.js';
import { ITEM_KEYS } from './item_bar.js';
import { CUES, SYNTH_FILES } from './audio.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ===========================================================================
console.log('\nthe gifts and the powers, and the audit that keeps them lined up');
// ===========================================================================
{
  check('the audit passes as the tree stands', W.auditWyrmsoul() === true);
  check('every one of the nine gift ids switches something on',
    GIFT_IDS.every((id) => !!W.GIFT_POWER[id]), GIFT_IDS.length + ' ids');
  check('and nothing hangs off a tenth', Object.keys(W.GIFT_POWER).length === 9);
  check('a blank record holds only the base',
    Object.entries(W.giftsHeld(null)).filter(([, v]) => v).map(([k]) => k).join(',') === 'base');
  const all = W.giftsHeld({ gifts: [...GIFT_IDS] });
  check('a record with all nine holds all nine powers',
    W.POWERS.every((p) => all[p]), W.POWERS.join(','));
  check('a record that is a string does not throw and holds nothing',
    W.giftsHeld('not a dragon').frost === false);
  check('a gift id this build has never heard of is ignored',
    W.giftsHeld({ gifts: ['moon'] }).frost === false);
  check('every power has a line to say for the tooltip',
    W.POWERS.every((p) => typeof W.POWER_LINE[p] === 'string' && W.POWER_LINE[p].length > 10));
  // the audit both ways: break it and watch it fail
  let threw = false;
  try { W.auditWyrmsoul.call(null); } catch { threw = true; }
  check('the audit runs standalone (it is called at import, so a bad row cannot ship)', !threw);
}

// ===========================================================================
console.log('\nthe duration: six, and ten with Frostreach');
// ===========================================================================
{
  check(`base is ${W.BASE_MS / 1000} s`, W.durationMs(null) === 6000, String(W.durationMs(null)));
  check('and every gift but Frostreach leaves it at six',
    GIFT_IDS.filter((id) => id !== 'frostreach').every((id) => W.durationMs({ gifts: [id] }) === 6000));
  check(`Frostreach makes it ${W.FROST_MS / 1000} s`,
    W.durationMs({ gifts: ['frostreach'] }) === 10000, String(W.durationMs({ gifts: ['frostreach'] })));
  const a = W.call(W.blankWyrmsoul(null), 1000, null);
  const b = W.call(W.blankWyrmsoul(null), 1000, { gifts: ['frostreach'] });
  check('the call carries it: until is 6000 ms out', a.until - a.calledAt === 6000, String(a.until - a.calledAt));
  check('and 10000 with the gift', b.until - b.calledAt === 10000, String(b.until - b.calledAt));
  check('the end pulse is half a second past that, both times',
    a.endsAt - a.until === W.END_MS && b.endsAt - b.until === W.END_MS);
  check(`and the dragon is tired for ${W.TIRED_MS / 1000} s after the pulse`,
    a.tiredUntil - a.endsAt === W.TIRED_MS, String(a.tiredUntil - a.endsAt));
}

// ===========================================================================
console.log('\ncanCall, driven true and false on every clause');
// ===========================================================================
{
  const full = { bond: 100, gifts: [], age: 'hatchling', hunger: 20, fallen: false, name: 'Ash', trueName: null, fedAt: 0 };
  const near = { awake: true, pos: { x: 0, y: 0, z: 0 } };
  const me = playerActor({ stats: { str: 50, dex: 50, int: 30, con: 50, wis: 30 }, skills: {} }, { pos: { x: 0, y: 0, z: 0 } });
  const opts = () => ({ now: 1000, state: null, playerPos: { x: 0, z: 0 }, underwater: false });

  check('bond 100, awake, near, alive, dry: it answers', W.canCall(full, near, me, opts()).ok);

  const low = W.canCall({ ...full, bond: 99 }, near, me, opts());
  check('bond 99 refuses, and says the number', !low.ok && low.reason === 'bond' && low.say.includes('99'), low.say);

  const down = W.canCall(full, { ...near, awake: false }, me, opts());
  check('a fallen dragon refuses', !down.ok && down.reason === 'fallen', down.say);

  const at40 = W.canCall(full, { ...near, pos: { x: APART_M - 0.5, y: 0, z: 0 } }, me, opts());
  check(`at ${APART_M - 0.5} m it still answers`, at40.ok);
  const past = W.canCall(full, { ...near, pos: { x: APART_M + 0.5, y: 0, z: 0 } }, me, opts());
  check(`at ${APART_M + 0.5} m it is too far, and says so`,
    !past.ok && past.reason === 'far' && /too far/.test(past.say), past.say);

  const dead = W.canCall(full, near, { ...me, health: 0 }, opts());
  check('dead refuses', !dead.ok && dead.reason === 'dead', dead.say);

  const stun = W.canCall(full, near, { ...me, status: { stun: { until: 5000 } } }, opts());
  check('stunned refuses', !stun.ok && stun.reason === 'stunned', stun.say);
  const unstun = W.canCall(full, near, { ...me, status: { stun: { until: 500 } } }, { ...opts(), now: 1000 });
  check('and a stun that has run out does not', unstun.ok);

  const wet = W.canCall(full, near, me, { ...opts(), underwater: true });
  check('underwater refuses without the Sunken Kingdom', !wet.ok && wet.reason === 'underwater', wet.say);
  const deep = W.canCall({ ...full, gifts: ['sunken'] }, near, me, { ...opts(), underwater: true });
  check('and answers with it: that gift is the only thing that lifts the guard', deep.ok);

  const running = W.canCall(full, near, me, { ...opts(), state: W.call(W.blankWyrmsoul(full), 1000, full) });
  check('it cannot be called on top of itself', !running.ok && running.reason === 'active', running.say);
  check('no dragon at all refuses without throwing', !W.canCall(full, null, me, opts()).ok);
}

// ===========================================================================
console.log('\nthe state machine: running, ending, idle');
// ===========================================================================
{
  let st = W.call(W.blankWyrmsoul(null), 0, null);
  check('the call is running', W.isRunning(st) && W.timeScaleFor(st) === W.TIME_SCALE);
  let t = W.tick(st, 5999); st = t.state;
  check('at 5999 ms it is still running, with 0.001 s left', t.running && t.left > 0, t.left.toFixed(4));
  t = W.tick(st, 6000); st = t.state;
  check('at 6000 ms it ends exactly once', t.justEnded && t.ending && !t.running);
  const again = W.tick(st, 6001);
  check('and never a second time', !again.justEnded && again.ending);
  check('the time scale is back to 1 the moment it stops running', W.timeScaleFor(st) === 1);
  t = W.tick(st, 6500); st = t.state;
  check('at 6500 ms the pulse is over and it is idle', st.phase === 'idle' && !W.isActive(st));
  check('and the dragon is tired for another 30 s', W.isTired(st, 36000) && !W.isTired(st, 36600));
}

// ===========================================================================
console.log('\nthe world clock');
// ===========================================================================
{
  const clock = createWorldClock(0);
  const f = { dt: 1 / 60, now: 0 };
  clock.sync({ ...f, now: 0 });
  check('at rest the two clocks are one number', clock.now === 0 && clock.scale === 1);

  // ordinary time: the world clock IS the player clock, hitch or no hitch
  const c2 = createWorldClock(0);
  let now = 0;
  const fr = { dt: 0, now: 0 };
  for (let i = 0; i < 60; i++) { now += 16.7; fr.dt = 0.0167; fr.now = now; c2.sync(fr); }
  check('60 ordinary frames leave no debt at all', c2.debt === 0, `${c2.debt.toFixed(3)} ms`);
  // the hitch: main.js clamps dt to 50 ms and does not clamp now
  now += 60000; fr.dt = 0.05; fr.now = now; c2.sync(fr);
  check('a minute-long hitch leaves no debt either, because at full speed the world clock IS the player clock',
    c2.debt === 0, `${c2.debt.toFixed(3)} ms`);
  check('and it never runs ahead', c2.now === now);

  // dragon time
  const c3 = createWorldClock(0);
  const g = { dt: 0, now: 0 };
  let t3 = 0;
  c3.sync({ ...g, now: 0, dt: 0 });
  c3.setScale(W.TIME_SCALE);
  for (let i = 0; i < 360; i++) { t3 += 1000 / 60; g.dt = 1 / 60; g.now = t3; c3.sync(g); }
  check('over 6 real seconds at one fifth the world gets 1.2 s',
    Math.abs(c3.now - 1200) < 20, `${c3.now.toFixed(1)} ms of ${t3.toFixed(1)}`);
  check('the frame carries the ratio as timeScale', Math.abs(g.timeScale - 0.2) < 1e-9, g.timeScale.toFixed(4));
  check('and the debt is what the world is owed', Math.abs(c3.debt - (t3 - 1200)) < 20, `${c3.debt.toFixed(0)} ms`);

  // the pulse
  const owed = c3.catchUp(W.END_MS, t3);
  check(`the pulse is handed ${Math.round(owed)} ms to pay back`, owed > 4700 && owed < 4900, owed.toFixed(0));
  const before = c3.now;
  for (let i = 0; i < 30; i++) { t3 += 1000 / 60; g.dt = 1 / 60; g.now = t3; c3.sync(g); }
  check('half a second later the two clocks are one number again',
    Math.abs(c3.now - t3) < 1, `${(t3 - c3.now).toFixed(3)} ms apart`);
  check('and the world moved forward the whole debt in that half second',
    Math.abs((c3.now - before) - (owed + 500)) < 20, `${(c3.now - before).toFixed(0)} ms`);
  check('it never went backwards on the way', c3.now > before);
  check('sync is idempotent on frame.now', (() => {
    const w0 = c3.now; c3.sync(g); c3.sync(g); return c3.now === w0;
  })());
}

// ===========================================================================
console.log('\nthe headline: what dragon time does to a monster four metres off');
// ===========================================================================
{
  // The claim: "a monster 4 m away closes 1 m in the time the player closes 5 m."
  // Both are moved by the SAME function, `monsters.stepToward`, at the SAME
  // speed. The only difference is which clock each is handed.
  const clock = createWorldClock(0);
  const frame = { dt: 0, now: 0 };
  clock.sync({ ...frame, now: 0, dt: 0 });
  clock.setScale(W.TIME_SCALE);

  const SPEED = 5;                          // m/s for both
  const player = { x: 0, y: 0, z: 0 };
  const monster = { x: 0, y: 0, z: 4 };     // four metres off
  const goalP = { x: 0, y: 0, z: 100 };     // the player walks away up +z
  const flat = () => 0;

  let t = 0;
  const startGap = Math.hypot(monster.x - player.x, monster.z - player.z);
  const startPlayer = player.z;
  for (let i = 0; i < 60; i++) {            // exactly one real second
    t += 1000 / 60;
    frame.dt = 1 / 60; frame.now = t;
    clock.sync(frame);
    // the monster chases the player's STARTING spot, on the world clock
    Object.assign(monster, stepToward(monster, { x: 0, y: 0, z: 0 }, SPEED, frame.worldDt, flat));
    // the player walks, on his own clock
    Object.assign(player, stepToward(player, goalP, SPEED, frame.dt, flat));
  }
  const playerWent = player.z - startPlayer;
  const monsterWent = startGap - Math.hypot(monster.x, monster.z);
  check(`in one second of dragon time the player closes ${playerWent.toFixed(2)} m`,
    Math.abs(playerWent - 5) < 0.1, `${playerWent.toFixed(3)} m`);
  check(`and the monster, four metres off, closes ${monsterWent.toFixed(2)} m`,
    Math.abs(monsterWent - 1) < 0.05, `${monsterWent.toFixed(3)} m`);
  check('which is one fifth, to two decimal places',
    Math.abs(playerWent / monsterWent - 5) < 0.05, (playerWent / monsterWent).toFixed(3));

  // and the same run in ordinary time, so the gate is driven both ways
  const c2 = createWorldClock(0);
  const f2 = { dt: 0, now: 0 };
  c2.sync({ ...f2, now: 0, dt: 0 });
  const m2 = { x: 0, y: 0, z: 4 };
  let t2 = 0;
  for (let i = 0; i < 60; i++) {
    t2 += 1000 / 60; f2.dt = 1 / 60; f2.now = t2; c2.sync(f2);
    Object.assign(m2, stepToward(m2, { x: 0, y: 0, z: 0 }, SPEED, f2.worldDt, flat));
  }
  const ordinary = 4 - Math.hypot(m2.x, m2.z);
  check(`in ordinary time the same monster closes ${ordinary.toFixed(2)} m in the same second`,
    Math.abs(ordinary - 4) < 0.05, `${ordinary.toFixed(3)} m`);
}

// ===========================================================================
console.log('\nthe real monster AI, on the world clock');
// ===========================================================================
{
  // stepMonster is the AI every monster in the game walks with. It is driven
  // here with the world clock and nothing else changes.
  const run = (scale) => {
    const clock = createWorldClock(0);
    const frame = { dt: 0, now: 0 };
    clock.sync({ ...frame, now: 0, dt: 0 });
    clock.setScale(scale);
    const me = playerActor({ stats: { str: 50, dex: 50, int: 30, con: 50, wis: 30 }, skills: {} }, { pos: { x: 0, y: 0, z: 0 } });
    const wolf = spawnMonster('wolf', { x: 0, y: 0, z: 12 });
    wolf.ai = { state: 'idle', home: { x: 0, y: 0, z: 12 }, target: null };
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += 1000 / 60;
      frame.dt = 1 / 60; frame.now = t; clock.sync(frame);
      stepMonster(wolf, frame.worldDt, {
        now: frame.worldNow, player: me, heightAt: () => 0,
        reach: 1.5, canSwing: () => false,
      });
    }
    return 12 - Math.hypot(wolf.pos.x, wolf.pos.z);
  };
  const fast = run(1);
  const slow = run(W.TIME_SCALE);
  check(`the real AI closes ${fast.toFixed(2)} m in two ordinary seconds`, fast > 5, fast.toFixed(2));
  check(`and ${slow.toFixed(2)} m in two seconds of dragon time`, slow > 0.5 && slow < fast / 3, slow.toFixed(2));
  // NOT exactly five: `stepMonster` is a state machine with an alert delay and
  // a wander it has to leave, and those cost frames rather than seconds, so the
  // slow run spends the same frames in them and comes out ahead of a flat fifth.
  // The number is reported rather than rounded to the one that would look tidy.
  check(`which is ${(fast / slow).toFixed(2)} times as far, in the band a fifth of the speed puts it`,
    fast / slow > 2.5 && fast / slow < 7, (fast / slow).toFixed(3));
}

// ===========================================================================
console.log('\nthe cone, the tail and the roar');
// ===========================================================================
{
  const at = (x, z, tier = 1, health = 100) => ({ pos: { x, y: 0, z }, health, maxHealth: 100, tier, ai: {} });
  const from = { x: 0, y: 0, z: 0 };
  check('straight ahead at 10 m is in a 15 m cone', W.inCone(from, 0, { x: 0, z: 10 }));
  check('and at 16 m is not', !W.inCone(from, 0, { x: 0, z: 16 }));
  check('directly behind is not', !W.inCone(from, 0, { x: 0, z: -5 }));
  check('29 degrees off the nose is in a 60 degree cone',
    W.inCone(from, 0, { x: Math.sin(29 * Math.PI / 180) * 5, z: Math.cos(29 * Math.PI / 180) * 5 }));
  check('and 31 degrees off is not',
    !W.inCone(from, 0, { x: Math.sin(31 * Math.PI / 180) * 5, z: Math.cos(31 * Math.PI / 180) * 5 }));
  check('the cone turns with the yaw', W.inCone(from, Math.PI / 2, { x: 5, z: 0 }));

  const list = [at(0, 3), at(0, 9), at(0, 20), at(0, -3), at(6, 1)];
  const found = W.coneTargets(list, from, 0);
  check('three in front, two out', found.length === 2, `${found.length} of ${list.length}`);
  check('and they come back nearest first', found[0].pos.z === 3 && found[1].pos.z === 9);
  check('a corpse in the cone is not a target', W.coneTargets([at(0, 3, 1, 0)], from, 0).length === 0);

  const swept = W.tailSweep([at(0, 2), at(0, 3.9), at(0, 4.1), at(0, 0)], from);
  check(`the tail catches what is inside ${W.TAIL_M} m and nothing outside it`,
    swept.length === 3, `${swept.length} caught`);
  check(`and throws each of them ${W.TAIL_KNOCK_M} m further out`,
    Math.abs(swept[0].z - (2 + W.TAIL_KNOCK_M)) < 1e-9, swept[0].z.toFixed(2));
  check('something standing exactly on you is thrown somewhere rather than dividing by zero',
    Number.isFinite(swept[2].x) && Number.isFinite(swept[2].z));

  const skilled = playerActor({ stats: { str: 50, dex: 50, int: 30, con: 50, wis: 30 }, skills: { wrestling: 35, tactics: 0 } }, { pos: from });
  check('a player at 35 attack skill is tier 2', W.playerTier(skilled) === 2, String(W.playerTier(skilled)));
  const green = playerActor({ stats: { str: 20, dex: 20, int: 20, con: 20, wis: 20 }, skills: {} }, { pos: from });
  check('and a beginner is tier 1', W.playerTier(green) === 1, String(W.playerTier(green)));

  const roar = W.roarOutcome([at(0, 2, 1), at(0, 3, 2), at(0, 4, 3), at(0, 5, 1, 0)], 2);
  check('the roar of a tier 2 routs the tier 1', roar.flee.length === 1 && roar.flee[0].tier === 1);
  check('and stuns the tier 2 and the tier 3', roar.stun.length === 2, roar.stun.map((a) => a.tier).join(','));
  check('a corpse is neither', roar.flee.length + roar.stun.length === 3);
  check(`and the stun is ${W.ROAR_STUN_S} s`, roar.seconds === 1.5, String(roar.seconds));
  const roar1 = W.roarOutcome([at(0, 2, 1), at(0, 3, 2)], 1);
  check('the roar of a tier 1 routs nothing, because nothing is under tier 1',
    roar1.flee.length === 0 && roar1.stun.length === 2);
  check('and range bounds it', W.roarOutcome([at(0, 90, 1)], 5, from, 30).flee.length === 0);
}

// ===========================================================================
console.log('\nthe wings: the dev fly rule, bounded');
// ===========================================================================
{
  const p = { x: 0, y: 0, z: 0 };
  const up = W.flyStep(p, 0, 0, { f: 0, r: 0, u: 1 }, 20, 1, 0);
  check('Space climbs at the fly speed', Math.abs(up.y - 20) < 1e-9, up.y.toFixed(2));
  const ceiling = W.flyStep({ x: 0, y: 29, z: 0 }, 0, 0, { f: 0, r: 0, u: 1 }, 20, 1, 0);
  check(`and stops at the ground plus ${W.FLY_CEILING_M} m`, ceiling.y === 30, ceiling.y.toFixed(2));
  const floor = W.flyStep({ x: 0, y: 1, z: 0 }, 0, 0, { f: 0, r: 0, u: -1 }, 20, 1, 0);
  check('and never below the ground', floor.y === 0, floor.y.toFixed(2));
  const hill = W.flyStep({ x: 0, y: 50, z: 0 }, 0, 0, { f: 0, r: 0, u: 1 }, 20, 1, 12);
  check('the ceiling follows the ground under you: 12 m of hill puts it at 42',
    hill.y === 42, hill.y.toFixed(2));
  const fwd = W.flyStep(p, 0, 0, { f: 1, r: 0, u: 0 }, 10, 1, 0);
  check('W flies where you are looking', Math.abs(fwd.z - 10) < 1e-6 && Math.abs(fwd.x) < 1e-6, `${fwd.x.toFixed(2)}, ${fwd.z.toFixed(2)}`);
  const diag = W.flyStep(p, 0, 0, { f: 1, r: 1, u: 0 }, 10, 1, 0);
  check('and two directions at once is not faster than one',
    Math.abs(Math.hypot(diag.x, diag.z) - 10) < 1e-6, Math.hypot(diag.x, diag.z).toFixed(3));
}

// ===========================================================================
console.log('\nthe breath, by the dragon\'s age');
// ===========================================================================
{
  for (const age of ['hatchling', 'drake', 'young', 'dragon']) {
    const [lo, hi] = W.breathDamage(age);
    const bite = AGE_STATS[age].damage;
    check(`the ${age}'s breath is ${lo} to ${hi}, its bite doubled`,
      lo === bite[0] * 2 && hi === bite[1] * 2, `bite ${bite[0]}-${bite[1]}`);
  }
  const base = W.breathFor(W.call(W.blankWyrmsoul(null), 0, { gifts: [], age: 'drake' }));
  check('with no Frostreach there is one breath, and it is fire',
    base.length === 1 && base[0].damageType === 'fire' && base[0].slot === 0);
  const frost = W.breathFor(W.call(W.blankWyrmsoul(null), 0, { gifts: ['frostreach'], age: 'drake' }));
  check('with it there are two, and the second is cold on the second slot',
    frost.length === 2 && frost[1].damageType === 'cold' && frost[1].slot === 1);
  check('both slots are real bar keys', BAR_KEYS[0] === '1' && BAR_KEYS[1] === '2');
  const st = W.call(W.blankWyrmsoul(null), 1000, null);
  check('a breath may go out at once', W.canBreathe(st, 1000));
  const after = { ...st, breathAt: 1000 };
  check('and not again for a second', !W.canBreathe(after, 1500) && W.canBreathe(after, 2000));
  check('and never at all when it is not running', !W.canBreathe(W.blankWyrmsoul(null), 9e9));
}

// ===========================================================================
console.log('\nthe words');
// ===========================================================================
{
  check('the call says the design\'s own sentence', W.CALL_LINE === 'Wyrmsoul. The world slows.');
  check('nothing here uses an em dash',
    ![W.CALL_LINE, W.endLine({ swings: 2, breaths: 1 }), ...Object.values(W.POWER_LINE)]
      .some((t) => /[—–]/.test(t)));
  check('the end line counts what it was given',
    W.endLine({ swings: 5, breaths: 3, routed: 2, stunned: 1 })
    === 'Time catches up: 5 blows and 3 breaths land, 2 of them run, one is left standing and stunned.',
    W.endLine({ swings: 5, breaths: 3, routed: 2, stunned: 1 }));
  check('one of a thing is said as one',
    W.endLine({ swings: 1 }) === 'Time catches up: one blow lands.', W.endLine({ swings: 1 }));
  check('and nothing is said as nothing rather than as a zero',
    W.endLine({}) === 'Time catches up: nothing of yours was in the air.', W.endLine({}));
  const tip = W.tooltipFor({ record: { gifts: ['frostreach', 'boneyard'], bond: 40 } });
  check('the tooltip names the ability', tip.name === 'Wyrmsoul');
  check('and says the duration it really has', tip.head.includes('10 seconds'), tip.head.slice(0, 40));
  check('and lists the realms that gave something back', tip.held.length === 2, tip.heldLine);
  const bare = W.tooltipFor({ record: null });
  check('and says so plainly when none have', bare.held.length === 0 && /No realm/.test(bare.heldLine), bare.heldLine);
  const refused = W.tooltipFor({ record: { bond: 12 }, refusal: { ok: false, say: 'The Bond is at 12. Wyrmsoul answers at 100.' } });
  check('a refusal is carried into the card', refused.reason.includes('12'), refused.reason);
  check('a gift gained says what Wyrmsoul can do now',
    W.giftGainedLine('stormpeaks').includes('Space flies'), W.giftGainedLine('stormpeaks'));
  check('and a gift id that is not one says nothing rather than something wrong',
    W.giftGainedLine('moon') === null);
}

// ===========================================================================
console.log('\nthe last gift, which is not wired, and says so');
// ===========================================================================
{
  const me = { maxHealth: 200, health: 1 };
  const out = W.deathSwap(me, {});
  check('outside a boss fight it swaps nothing', !out.swapped && out.reason === 'no boss fight');
  check('and says why, rather than failing silently', /Ashen Throne/.test(out.say), out.say);
  const inFight = W.deathSwap(me, {}, { boss: true });
  check('inside one it hands back both writes',
    inFight.swapped && inFight.dragonFalls && inFight.playerHealth === 50, String(inFight.playerHealth));
  check('and it is once only', !W.deathSwap(me, {}, { boss: true, used: true }).swapped);
}

// ===========================================================================
console.log('\nthe key at the far right, and that it is free');
// ===========================================================================
{
  check(`the key is ${WYRMSOUL_KEY.toUpperCase()}`, WYRMSOUL_KEY === 'r');
  check('it is not a key the world drives', !RESERVED_KEYS.includes(WYRMSOUL_KEY), RESERVED_KEYS.join(','));
  check('it is not one of the twelve bar keys', !BAR_KEYS.includes(WYRMSOUL_KEY), BAR_KEYS.join(''));
  check('nor one of the eight item keys', !ITEM_KEYS.includes(WYRMSOUL_KEY), ITEM_KEYS.join(','));
  // every window's key, read off the real panels rather than from memory
  const panels = await Promise.all([
    './win_bag.js', './win_abilities.js', './win_crafting.js', './win_character.js',
    './win_dragon.js', './win_map.js', './win_skills.js', './win_settings.js', './win_dev.js',
    './win_talk.js', './win_trade.js',
  ].map((m) => import(m)));
  const keys = panels.map((m) => m.panel?.key).filter(Boolean);
  check(`and it is none of the ${keys.length} window keys`, !keys.includes(WYRMSOUL_KEY), keys.join(','));
  check('nor a tool key, nor the dev keys', !['1', '2', '3', '4', 'f1', '`'].includes(WYRMSOUL_KEY));
  check('the thirteenth slot is outside the twelve, so no ability can be dropped in it',
    BAR_KEYS.length === 12);
}

// ===========================================================================
console.log('\nthe two cues');
// ===========================================================================
{
  check('the call cue exists and names a real synthesised file',
    !!CUES.wyrmsoul_call && SYNTH_FILES.includes(CUES.wyrmsoul_call.file), CUES.wyrmsoul_call?.file);
  check('so does the end cue',
    !!CUES.wyrmsoul_end && SYNTH_FILES.includes(CUES.wyrmsoul_end.file), CUES.wyrmsoul_end?.file);
  check('neither is a stand-in for a recording that does not exist',
    !CUES.wyrmsoul_call.stand && !CUES.wyrmsoul_end.stand);
}

// ===========================================================================
console.log('\nthe visuals, counted off the geometry');
// ===========================================================================
{
  const a = auditWyrmsoulVisuals();
  check(`the whole effect is ${a.total} triangles, under the 2,000 budget`, a.ok,
    `wings ${a.wings}, eyes ${a.eyes}, trails ${a.trails}`);

  const tex = flameTexture(32);
  const d = tex.image.data;
  check('the flame texture is 32 x 32 RGBA', d.length === 32 * 32 * 4, String(d.length));
  let opaque = 0, clear = 0, hues = new Set();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 200) opaque++;
    if (d[i + 3] < 10) clear++;
    hues.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
  }
  check('it has real variation rather than one flat colour', hues.size > 12, `${hues.size} colour bands`);
  check('it is opaque somewhere and clear somewhere', opaque > 0 && clear > 0, `${opaque} opaque, ${clear} clear`);
  const again = flameTexture(32);
  check('and it is the same bytes every time it is made',
    Buffer.compare(Buffer.from(d), Buffer.from(again.image.data)) === 0);

  // attach and detach against a real rig-shaped object
  const scene = new THREE.Scene();
  const back = new THREE.Object3D(), head = new THREE.Object3D();
  const rig = { parts: { back, head } };
  const v = createWyrmsoulVisuals({ scene }, rig);
  check('nothing is on the body before it is attached', back.children.length === 0 && head.children.length === 0);
  v.attach({ senses: true });
  check('two wings go on the back anchor', back.children.length === 2, String(back.children.length));
  check('two eyes go on the head anchor', head.children.length === 2, String(head.children.length));
  check('and the trails go in the scene', scene.children.includes(v.trails));

  // the wings open rather than pop
  v.update(1 / 60, true, []);
  const early = v.fade;
  for (let i = 0; i < 30; i++) v.update(1 / 60, true, []);
  check(`the wings open over about a tenth of a second: ${early.toFixed(3)} to ${v.fade.toFixed(3)}`,
    early < 0.3 && v.fade > 0.95, `${early.toFixed(3)} -> ${v.fade.toFixed(3)}`);
  check('and the eyes are lit with them', v.eyeL.material.opacity > 0.9, v.eyeL.material.opacity.toFixed(3));
  check('the eyes are the gold of the pact', v.eyeL.material.color.getHex() === GOLD);

  // the senses pass: a monster's material is taken and put back
  const body = new THREE.Group();
  const mine = new THREE.MeshStandardMaterial();
  body.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mine));
  body.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mine));
  v.update(1 / 60, true, [], [{ group: body }]);
  check('the senses pass takes both of a monster\'s materials', v.swappedCount === 2, String(v.swappedCount));
  check('and hands it one that ignores depth, which is the whole of seeing through a wall',
    body.children[0].material.depthTest === false);
  v.update(1 / 60, false, [], null);
  check('and gives every one of them back when it is over',
    body.children.every((m) => m.material === mine) && v.swappedCount === 0);

  // the trails: only things that moved
  const movers = [{ pos: { x: 0, y: 0, z: 0 } }, { pos: { x: 10, y: 0, z: 0 } }];
  v.update(1 / 60, true, movers);              // first frame: nothing to compare to
  check('a trail needs two frames of position before it can be drawn', v.trailCount === 0);
  movers[0].pos.z += 5 / 60;                   // 5 m/s
  v.update(1 / 60, true, movers);
  check('the thing that moved gets one, the thing that stood still gets none',
    v.trailCount === 1, String(v.trailCount));
  v.detach();
  check('detach takes it all off the body again',
    back.children.length === 0 && head.children.length === 0 && !scene.children.includes(v.trails));
  v.dispose();
}

// ===========================================================================
console.log('\nthe HUD: the arc, the cell and the card');
// ===========================================================================
{
  const { createHud } = await import('./hud.js');
  const hud = createHud(document.body);

  check('the arc is off the screen until something sets it', hud.bond.shown === false);
  const b = hud.setBond(40, 'Ash', false);
  check('setBond reads the record\'s own number back', b.value === 40 && b.name === 'Ash', JSON.stringify(b));
  check('and it is not full at 40', !b.full);
  const arc = document.getElementById('bw-bond');
  check('the arc is on the screen now', arc.classList.contains('on'));
  check('the name is over it', arc.textContent.includes('Ash'), arc.textContent);
  check('and the number in it', arc.textContent.includes('40'), arc.textContent);
  const full = hud.setBond(100, 'Ash', true);
  check('at 100 it is full', full.full && arc.classList.contains('full'));
  const nameless = hud.setBond(0, null, false);
  check('a dragon with no name is "the hatchling"', nameless.name === 'the hatchling', arc.textContent);
  check('the dash offset is the arc emptied', Math.abs(bondDash(0) - BOND_ARC_LENGTH) < 1e-9);
  check('and filled', bondDash(1) === 0);
  check('half way is half the arc', Math.abs(bondDash(0.5) - BOND_ARC_LENGTH / 2) < 1e-9);
  check('the markup carries the offset a browser will draw', bondArcSvg(0.5).includes(bondDash(0.5).toFixed(2)));
  check('and clamps a record that says 900', bondDash(9) === 0 && bondDash(-3) === BOND_ARC_LENGTH);
  hud.clearBond();
  check('clearBond takes it off again', !arc.classList.contains('on'));

  const cell = document.getElementById('bw-wyrm');
  check('the thirteenth cell exists', !!cell);
  check('it is at the far right of the rail', cell.parent.id === 'bw-bars'
    && cell.parent.children[cell.parent.children.length - 1] === cell, cell.parent.children.length + ' on the rail');
  check(`its key cap says ${WYRMSOUL_KEY.toUpperCase()}`, cell.textContent.includes('R'), cell.textContent);
  check('and it is dim before anything lights it', !cell.classList.contains('lit'));

  hud.setWyrmsoul({
    callable: true, active: false, left: 0, reason: '',
    tip: W.tooltipFor({ record: { gifts: ['boneyard'], bond: 100 } }),
  });
  check('callable lights it', cell.classList.contains('lit'));
  check('and the card says what Wyrmsoul is', hud.wyrmsoulTip.includes('one creature'), hud.wyrmsoulTip.slice(0, 60));
  check('and which realms have given something back', hud.wyrmsoulTip.includes('the Boneyard'), hud.wyrmsoulTip);

  hud.setWyrmsoul({
    callable: false, active: false, left: 0, reason: 'The Bond is at 12. Wyrmsoul answers at 100.',
    tip: W.tooltipFor({ record: { bond: 12 } }),
  });
  check('not callable dims it again', !cell.classList.contains('lit'));
  check('and the card says why it will not answer', hud.wyrmsoulTip.includes('answers at 100'), hud.wyrmsoulTip);

  const shell = document.getElementById('bw-wyrmshell');
  check('the amber shell is off', !shell.classList.contains('on'));
  hud.setWyrmsoul({ callable: false, active: true, left: 5.4, reason: '' });
  check('dragon time turns it on', shell.classList.contains('on'));
  check('the cell burns while it is up', cell.classList.contains('up'));
  check('and counts the seconds left in it', cell.textContent.includes('5'), cell.textContent);
  hud.setWyrmsoul({ callable: false, active: false, left: 0, reason: '' });
  check('and the shell goes off with it', !shell.classList.contains('on'));

  const flashEl = document.getElementById('bw-wyrmflash');
  hud.wyrmFlash(1);
  check('the flash at the end starts white', Number(flashEl.style.opacity) === 1, flashEl.style.opacity);
  let steps = 0;
  while (hud.wyrmsoul.flash > 0 && steps < 200) { hud.update(1 / 60, {}); steps++; }
  check(`and is gone ${(steps / 60).toFixed(2)} s later, on the player's clock`,
    Math.abs(steps / 60 - FLASH_S) < 0.05, `${steps} frames`);

  hud.dispose();
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
