// The emotes system, booted and run frame by frame. Run:
//   node src/game/app/systems/emotes.test.mjs
//
// The rig is the REAL createPlayer, walked by the REAL controller, and the
// frame is driven in the real order: the player system's `rig.update` first,
// then this system's `update`, exactly as main.js's loop does it. So "an idle
// player wears the pose and a moving one does not" is measured off the hips of
// an actual body rather than read off a flag.
//
// The resolver is the real createCombat too, so "the wolf ends your dance" is
// produced by a wolf actually landing a blow through combat.onHit, not by
// calling the ending by hand.
//
// What is stubbed is the world around it: a flat ground, a window manager that
// records what was registered, a keyboard, and a HUD that remembers what was
// said.

globalThis.performance ||= { now: () => 1000 };
globalThis.window ||= { innerWidth: 1600, innerHeight: 900, addEventListener() {}, removeEventListener() {} };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

import * as THREE from 'three';
import { emotes as emotesSystem, STILL_SPEED, MOVE_KEYS, HIT_REACH } from './emotes.js';
import { SYSTEMS, FRAME_ORDER } from './index.js';
import { createPlayer, SIT_HIP, LIE_HIP, BODY } from '../../player.js';
import { createCombat } from '../../combat.js';
import { playerActor, spawnMonster, recompute } from '../../actor.js';
import { EMOTES, EMOTE_IDS } from '../../emotes.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;
const flat = () => 0;
const DT = 1 / 60;

// ===========================================================================
console.log('\nthe system is in the list, in the right place');
// ===========================================================================
{
  const names = SYSTEMS.map((s) => s.name);
  check('emotes is a system', names.includes('emotes'));
  check('the list and the frame order agree', names.join(',') === FRAME_ORDER.join(','));
  check('it runs straight after the player, whose pose it writes over',
    FRAME_ORDER.indexOf('emotes') === FRAME_ORDER.indexOf('player') + 1, FRAME_ORDER.join(','));
  check('and before the abilities, so effects.update lays a swing on top of the pose',
    FRAME_ORDER.indexOf('emotes') < FRAME_ORDER.indexOf('abilities'));
  check('it declares everything it reaches while building',
    ['player', 'combat', 'ui'].every((d) => emotesSystem.deps.includes(d)), emotesSystem.deps.join(','));
  check('and carries one frame hook and no others',
    typeof emotesSystem.update === 'function' && !emotesSystem.render && !emotesSystem.late && !emotesSystem.move);
}

// ===========================================================================
// The stub world.
// ===========================================================================
function boot(opts = {}) {
  const logs = [];
  const registered = [];
  const keys = new Set();
  const scene = new THREE.Scene();
  const rig = createPlayer(scene);
  const character = {
    name: 'Tester',
    pack: { slots: 20, items: new Array(20).fill(null) },
    equipment: {},
    stats: { str: 50, dex: 50, int: 30, con: 50, wis: 30 },
    skills: { wrestling: 50, tactics: 50 },
    gold: 0,
    ...(opts.character || {}),
  };
  const actor = playerActor(character, { pos: rig.pos });
  actor.maxHealth = 100000; actor.health = 100000;
  const combatRules = createCombat({ recompute });
  let dying = null;
  const live = [];
  const panelCtx = {};
  const registry = new Map();
  let spells = null;

  const ctx = {
    hud: { log: (t, k) => logs.push({ t, k }), toast: (t, k) => logs.push({ t, k }) },
    input: { down: (k) => keys.has(String(k).toLowerCase()) },
    character,
    frame: { dt: DT, now: 10000, nowS: 10, day: 1, night: false, centre: null },
    get(name) {
      if (registry.has(name)) return registry.get(name);
      if (name === 'player') return { rig, actor, get dying() { return dying; } };
      if (name === 'combat') return { combat: combatRules, monsters: { actors: () => live.filter((a) => a.health > 0) } };
      if (name === 'ui') {
        return { panelCtx, windows: { register: (p) => { registered.push(p.id); return true; } } };
      }
      throw new Error(`the stub context has no "${name}"`);
    },
    has: (n) => registry.has(n) || (n === 'abilities' && !!spells),
    register(n, v) { registry.set(n, v); return v; },
  };
  // the abilities system, only when a test asks for one
  const setSpells = (s) => { spells = s; if (s) registry.set('abilities', { abilities: s }); else registry.delete('abilities'); };

  const made = emotesSystem.create(ctx);
  registry.set('emotes', made);

  return {
    ctx, made, logs, registered, rig, actor, character, scene, keys, setSpells, live,
    combat: combatRules,
    setDying(v) { dying = v; },
    said: () => logs.map((l) => l.t).join('\n'),
    lastSaid: () => (logs.length ? logs[logs.length - 1].t : ''),
    /** N frames in main.js's order: the player walks, then the emotes pose. */
    frames(n, move = { x: 0, z: 0 }) {
      for (let i = 0; i < n; i++) {
        ctx.frame.now += DT * 1000;
        ctx.frame.dt = DT;
        ctx.frame.nowS = ctx.frame.now / 1000;
        rig.update(DT, { ...move, yaw: 0 }, flat);
        emotesSystem.update(ctx, ctx.frame);
      }
      return ctx.frame.now;
    },
  };
}

// ===========================================================================
console.log('\nthe boot');
// ===========================================================================
{
  const w = boot();
  check('the wheel is registered with the window layer', w.registered.includes('emotes'), w.registered.join(','));
  check('and the panel context can reach the emotes', w.ctx.get('ui').panelCtx.emotes === w.made);
  check('the console handle has what the harness needs',
    ['start', 'stop', 'current', 'list'].every((k) => k in w.made.bw.emotes),
    Object.keys(w.made.bw.emotes).join(','));
  check('with nothing running', w.made.current === null && w.made.bw.emotes.current === null);
  check('and all eight on the list', w.made.bw.emotes.list.join(',') === EMOTE_IDS.join(','), w.made.bw.emotes.list.join(','));
  check('the boot said nothing on its own', w.logs.length === 0, w.said());
}

// ===========================================================================
console.log('\nevery emote says its line when it starts');
// ===========================================================================
{
  for (const e of EMOTES) {
    const w = boot();
    w.frames(4);
    w.made.start(e.id);
    check(`${e.id}: "${w.lastSaid()}"`, w.lastSaid() === e.line && w.made.current === e.id, w.made.current || 'nothing started');
  }
  const w = boot();
  w.made.start('shrug');
  check('an emote nobody wrote is refused, out loud', /no emote called "shrug"/.test(w.lastSaid()) && w.made.current === null, w.lastSaid());
}

// ===========================================================================
console.log('\nan idle player wears the pose, and a moving one does not');
// ===========================================================================
{
  const w = boot();
  w.frames(30);
  const standingHip = w.rig.parts.hips.position.y;
  w.made.start('sit');
  w.frames(60);                                  // a second of sitting still
  const sitHip = w.rig.parts.hips.position.y;
  check('standing, the hips ride at the idle height', near(standingHip, 0.875, 0.005), `${standingHip.toFixed(4)} m`);
  check(`sitting, they are on the ground at SIT_HIP`, near(sitHip, SIT_HIP, 0.01),
    `${sitHip.toFixed(4)} m against ${SIT_HIP}`);
  check('and that is more than half a metre lower', standingHip - sitHip > 0.45,
    `${((standingHip - sitHip) * 100).toFixed(1)} cm down`);
  check('the emote is still running', w.made.current === 'sit');

  // now walk: the emote goes, and the hips come straight back up
  w.frames(1, { x: 0, z: 1 });
  check('one frame of walking ends it, and says so', w.made.current === null && w.lastSaid() === 'you get up', w.lastSaid());
  w.frames(20, { x: 0, z: 1 });
  check('and the walking body is the walking body again, not a sitting one',
    w.rig.parts.hips.position.y > 0.8, `${w.rig.parts.hips.position.y.toFixed(4)} m`);
  check('with the gait back in charge of the anim', w.rig.state.anim === 'walk', w.rig.state.anim);
}
{
  // the other direction: a movement key held with a wall in front still counts
  const w = boot();
  w.frames(20);
  w.made.start('dance');
  w.frames(10);
  check('a dance starts while standing still', w.made.current === 'dance');
  w.keys.add('w');
  w.frames(1);
  check('and a movement key alone ends it, before the body has any speed at all',
    w.made.current === null && w.rig.state.speed === 0 && w.lastSaid() === 'you stop dancing',
    `speed ${w.rig.state.speed}, "${w.lastSaid()}"`);
  w.keys.delete('w');
  check(`all five movement keys are watched`, MOVE_KEYS.join(',') === 'w,a,s,d, ', MOVE_KEYS.join(','));
  for (const k of MOVE_KEYS) {
    const q = boot();
    q.frames(10);
    q.made.start('sit');
    q.frames(5);
    q.keys.add(k);
    q.frames(1);
    check(`  "${k === ' ' ? 'space' : k}" ends it`, q.made.current === null, q.lastSaid());
  }
}
{
  // starting one on the move is refused rather than silently doing nothing
  const w = boot();
  w.frames(40, { x: 0, z: 1 });
  w.made.start('sit');
  check('you cannot sit down at a run, and it says why',
    w.made.current === null && /on the move/.test(w.lastSaid()), w.lastSaid());
  check('and the body is over the still speed when it refused',
    w.rig.state.speed > STILL_SPEED, `${w.rig.state.speed.toFixed(2)} m/s against ${STILL_SPEED}`);
}

// ===========================================================================
console.log('\nlying down, and getting the body back afterwards');
// ===========================================================================
{
  const w = boot();
  w.frames(20);
  w.made.start('lie');
  w.frames(90);
  const parts = w.rig.parts;
  check('the hips are down at LIE_HIP', near(parts.hips.position.y, LIE_HIP, 0.01),
    `${parts.hips.position.y.toFixed(4)} m against ${LIE_HIP}`);
  check('and the pelvis is tipped a right angle onto its back',
    near(parts.hips.rotation.x, -Math.PI / 2, 0.01), `${parts.hips.rotation.x.toFixed(4)} rad`);
  w.rig.group.updateMatrixWorld(true);
  const head = new THREE.Vector3();
  parts.head.getWorldPosition(head);
  check('the head is resting on the ground rather than standing up', head.y < 0.35, `${head.y.toFixed(3)} m up`);
  check('and it is behind the hips, which is what lying on your back looks like',
    head.z < -0.4, `head z ${head.z.toFixed(3)}`);
  const box = new THREE.Box3().setFromObject(w.rig.group);
  check('nothing has gone through the ground', box.min.y > -0.05, `lowest point ${box.min.y.toFixed(4)} m`);

  w.keys.add('s');
  w.frames(1);
  check('getting up says the words', w.lastSaid() === 'you get up', w.lastSaid());
  check('and the pelvis is put back the moment it is over: nothing accumulates',
    parts.hips.rotation.x === 0 && parts.hips.rotation.z === 0 && parts.hips.position.z === 0,
    `x ${parts.hips.rotation.x}, z ${parts.hips.rotation.z}`);
  w.keys.delete('s');
  w.frames(40);
  check('and after forty more frames he is standing up straight',
    near(parts.hips.position.y, 0.875, 0.01) && parts.hips.rotation.x === 0,
    `${parts.hips.position.y.toFixed(4)} m`);
}

// ===========================================================================
console.log('\na timed emote lets go of the body on its own');
// ===========================================================================
{
  const w = boot();
  w.frames(20);
  const before = w.logs.length;
  w.made.start('bow');
  let frames = 0;
  while (w.made.current && frames < 300) { w.frames(1); frames++; }
  check(`a bow is over after ${frames} frames, which is ${(frames * DT).toFixed(2)} s`,
    near(frames * DT, 1.5, DT * 2), `wanted 1.5 s`);
  check('and the only thing it said was that it started',
    w.logs.length === before + 1 && w.logs[before].t === 'you bow', w.said().slice(-60));
  w.frames(10);
  check('the body is back on its feet with nothing left over',
    near(w.rig.parts.hips.position.y, 0.875, 0.01) && w.rig.parts.torso.rotation.y === 0,
    `${w.rig.parts.hips.position.y.toFixed(4)} m`);
}

// ===========================================================================
console.log('\na swing ends a dance');
// ===========================================================================
{
  const w = boot();
  w.frames(20);
  w.made.start('dance');
  w.frames(30);
  check('the dance is running', w.made.current === 'dance');
  // combat.queueSwing writes lastSwingAt, and that is the mark this reads
  w.actor.lastSwingAt = w.ctx.frame.now;
  w.frames(1);
  check('taking a swing ends it', w.made.current === null);
  check('in these words: "you swing, and that is the end of your dance"',
    w.lastSaid() === 'you swing, and that is the end of your dance', w.lastSaid());
  // and it does not fire again on the next emote just because the mark is old
  w.made.start('sit');
  w.frames(30);
  check('the stale mark does not end the next one', w.made.current === 'sit', w.lastSaid());
}

// ===========================================================================
console.log('\na wolf ends your dance');
// ===========================================================================
{
  const w = boot();
  w.frames(20);
  w.made.start('dance');
  w.frames(10);
  const wolf = spawnMonster('wolf', { x: 0.5, y: 0, z: 0 });
  wolf.weapon.minDamage = 40; wolf.weapon.maxDamage = 40;
  wolf.naturalWeapon.minDamage = 40; wolf.naturalWeapon.maxDamage = 40;
  w.live.push(wolf);
  // a single roll can miss, so swing until one lands rather than once and hope
  let tries = 0;
  for (let i = 0; i < 40 && w.made.current; i++) {
    tries++;
    w.combat.queueSwing(wolf, w.actor, { now: w.ctx.frame.now, immediate: true });
    w.combat.update(DT, w.ctx.frame.now + 400);
    w.frames(1);
  }
  check(`a real blow through the resolver ended it, after ${tries} swing(s)`, w.made.current === null);
  check('and it named what did it: "the wolf ends your dance"',
    /the wolf ends your dance/.test(w.said()), w.lastSaid());
}

{
  // the other direction: with two of them on you, naming one would be a guess
  const w = boot();
  w.frames(20);
  w.made.start('dance');
  w.frames(10);
  for (const at of [0.5, -0.5]) {
    const m = spawnMonster('wolf', { x: at, y: 0, z: 0 });
    m.weapon.minDamage = 40; m.weapon.maxDamage = 40;
    m.naturalWeapon.minDamage = 40; m.naturalWeapon.maxDamage = 40;
    w.live.push(m);
  }
  for (let i = 0; i < 40 && w.made.current; i++) {
    w.combat.queueSwing(w.live[0], w.actor, { now: w.ctx.frame.now, immediate: true });
    w.combat.update(DT, w.ctx.frame.now + 400);
    w.frames(1);
  }
  check('with two wolves on you it says "something" rather than picking one',
    /something ends your dance/.test(w.said()), w.lastSaid());
}
{
  // and a monster too far off is not the one that hit you either
  const w = boot();
  w.frames(20);
  w.made.start('sit');
  w.frames(5);
  const far = spawnMonster('wolf', { x: 40, y: 0, z: 0 });
  w.live.push(far);
  check('a wolf 40 m away is outside HIT_REACH', HIT_REACH < 40);
  w.actor.health -= 10;
  w.frames(1);
  check('so the blow that landed is credited to "something"',
    /something ends your sit/.test(w.lastSaid()), w.lastSaid());
  // and one wolf standing on you IS named
  const q = boot();
  q.frames(20);
  q.made.start('sit');
  q.frames(5);
  q.live.push(spawnMonster('wolf', { x: 1, y: 0, z: 0 }));
  q.actor.health -= 10;
  q.frames(1);
  check('while one standing over you is named', /the wolf ends your sit/.test(q.lastSaid()), q.lastSaid());
}

// ===========================================================================
console.log('\ncasting and dying take it off you too');
// ===========================================================================
{
  const w = boot();
  w.frames(20);
  w.made.start('lie');
  w.frames(10);
  w.setSpells({ casting: { name: 'Firebolt' }, pending: null });
  w.frames(1);
  check('a cast ends it', w.made.current === null);
  check('and says so in the emote\'s own noun', w.lastSaid() === 'you break off your rest to cast', w.lastSaid());
  w.setSpells({ casting: null, pending: { ability: { id: 'firebolt' } } });
  w.made.start('sit');
  w.frames(1);
  check('a spell held on the cursor ends one too', w.made.current === null, w.lastSaid());
  w.setSpells(null);

  const q = boot();
  q.frames(20);
  q.made.start('sit');
  q.frames(10);
  q.setDying({ left: 5 });
  q.frames(1);
  check('going down ends it, in words of its own',
    q.made.current === null && q.lastSaid() === 'you go down, and your sit with you', q.lastSaid());
  q.made.start('sit');
  check('and you cannot start one while you are down', q.made.current === null && /not while you are down/.test(q.lastSaid()), q.lastSaid());
}

// ===========================================================================
console.log('\nall eight put a different body on the ground');
// ===========================================================================
{
  const seen = new Map();
  for (const e of EMOTES) {
    const w = boot();
    w.frames(20);
    w.made.start(e.id);
    w.frames(45);
    w.rig.group.updateMatrixWorld(true);
    const head = new THREE.Vector3(), hand = new THREE.Vector3();
    w.rig.parts.head.getWorldPosition(head);
    w.rig.parts.handR.getWorldPosition(hand);
    const box = new THREE.Box3().setFromObject(w.rig.group);
    seen.set(e.id, { head, hand, low: box.min.y, high: box.max.y });
    check(`${e.id}: head at ${head.y.toFixed(2)} m, right hand at ${hand.y.toFixed(2)} m, body ${box.min.y.toFixed(3)} to ${box.max.y.toFixed(3)}`,
      box.min.y > -0.05, `lowest point ${box.min.y.toFixed(4)} m`);
  }
  const keys = [...seen.keys()];
  const same = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = seen.get(keys[i]), b = seen.get(keys[j]);
      if (a.head.distanceTo(b.head) < 0.05 && a.hand.distanceTo(b.hand) < 0.05) same.push(`${keys[i]} and ${keys[j]}`);
    }
  }
  check('no two of the eight are the same pose', same.length === 0, same.join('; '));
  check('a wave puts the right hand above the head',
    seen.get('wave').hand.y > seen.get('wave').head.y, `${seen.get('wave').hand.y.toFixed(2)} against ${seen.get('wave').head.y.toFixed(2)}`);
  check('a cheer puts both arms up higher than a standing body is tall',
    seen.get('cheer').high > 1.85, `${seen.get('cheer').high.toFixed(3)} m`);
  check('a bow puts the head out in front of the feet',
    seen.get('bow').head.z > 0.25, `head z ${seen.get('bow').head.z.toFixed(3)}`);
  check('a point puts the right hand out in front',
    seen.get('point').hand.z > 0.5, `hand z ${seen.get('point').hand.z.toFixed(3)}`);
  check('a laugh puts the head back behind the shoulders',
    seen.get('laugh').head.z < -0.08, `head z ${seen.get('laugh').head.z.toFixed(3)}`);
  check('sitting and lying are the two that put the head under a metre',
    [...seen.entries()].filter(([, v]) => v.head.y < 1).map(([k]) => k).sort().join(',') === 'lie,sit',
    [...seen.entries()].map(([k, v]) => `${k} ${v.head.y.toFixed(2)}`).join(' '));
}

// ===========================================================================
console.log('\nthe harness handle drives the real path');
// ===========================================================================
{
  const w = boot();
  w.frames(10);
  w.made.bw.emotes.start('cheer');
  check('window.__bw.emotes.start starts one, and says the line',
    w.made.current === 'cheer' && w.lastSaid() === 'you throw your arms up and cheer', w.lastSaid());
  w.frames(20);
  check('and the pose is on the body, not just in the state',
    w.rig.parts.armR.rotation.z > 2, `armR z ${w.rig.parts.armR.rotation.z.toFixed(3)} rad`);
  w.made.bw.emotes.stop();
  check('stop() takes it off and says why', w.made.current === null && w.lastSaid() === 'you stop cheering', w.lastSaid());
  check('and stopping nothing says nothing', (() => { const n = w.logs.length; w.made.bw.emotes.stop(); return w.logs.length === n; })());
  check('the harness parses a slash command the chat does not have yet',
    w.made.bw.emotes.commandFor('/sit') === 'sit');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
