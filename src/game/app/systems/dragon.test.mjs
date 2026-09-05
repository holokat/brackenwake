// The dragon system, booted and run. Run:
//   node src/game/app/systems/dragon.test.mjs
//
// The system is created against a stub context and then driven for 600 frames.
// Everything inside it is the real thing: the real `createDragon`, the real
// `buildDragon` with all its geometry, the real `combat.queueSwing` behind a
// `monsters.swingAt` that counts what goes through it, and the real
// `stepMonster` out of monsters.js to prove that a wolf can pick the dragon up
// as a target the moment monsters.js is allowed to offer it one.
//
// What is stubbed is the world around it: a flat ground, a window manager that
// records what was registered, a HUD that records what was said.

globalThis.performance ||= { now: () => 1000 };
globalThis.window ||= { innerWidth: 1600, innerHeight: 900, addEventListener() {}, removeEventListener() {} };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

import * as THREE from 'three';
import { dragon as dragonSystem } from './dragon.js';
import { SYSTEMS, FRAME_ORDER } from './index.js';
import { createCombat } from '../../combat.js';
import { playerActor, spawnMonster, recompute } from '../../actor.js';
import { stepMonster } from '../../monsters.js';
import { AGE_STATS, FALL_MIN_MS, APART_M, WAKE_BOND, stageBody } from '../../dragon.js';
import { createWorldClock } from '../context.js';
import { makeItem } from '../../../mmo/items.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ===========================================================================
console.log('\nthe system is in the list, in the right place');
// ===========================================================================
{
  const names = SYSTEMS.map((s) => s.name);
  check('the dragon is a system', names.includes('dragon'));
  check('the list and the frame order agree', names.join(',') === FRAME_ORDER.join(','));
  check('it runs AFTER the fight, so the target it closes on is this frame\'s',
    FRAME_ORDER.indexOf('dragon') > FRAME_ORDER.indexOf('combat'));
  check('and BEFORE the HUD, so what it changed is drawn this frame',
    FRAME_ORDER.indexOf('dragon') < FRAME_ORDER.indexOf('ui'));
  check('it declares everything it reaches for while building',
    ['world', 'player', 'combat', 'inventory', 'ui'].every((d) => dragonSystem.deps.includes(d)),
    dragonSystem.deps.join(','));
  check('it has an update, and the two hooks Wyrmsoul needs and nothing else',
    typeof dragonSystem.update === 'function' && typeof dragonSystem.hotkeys === 'function'
    && typeof dragonSystem.move === 'function' && !dragonSystem.render && !dragonSystem.late);
}

// ===========================================================================
// The stub world.
// ===========================================================================

function boot(opts = {}) {
  const logs = [];
  const registered = [];
  const opened = [];
  const swings = [];
  const character = {
    name: 'Tester',
    pack: { slots: 20, items: new Array(20).fill(null) },
    equipment: {},
    stats: { str: 50, dex: 50, int: 30, con: 50, wis: 30 },
    skills: { wrestling: 50, tactics: 50 },
    gold: 0,
    ...(opts.character || {}),
  };
  const scene = new THREE.Scene();
  const rig = {
    pos: { x: 0, y: 0, z: 0 }, yaw: 0, group: new THREE.Group(),
    parts: { back: new THREE.Object3D(), head: new THREE.Object3D() },
  };
  rig.group.add(rig.parts.back);
  rig.group.add(rig.parts.head);
  const me = playerActor(character, { pos: rig.pos });
  const combatRules = createCombat({ recompute });

  let attacking = null;
  const live = [];
  const monsters = {
    actors: () => live.filter((a) => a.health > 0),
    all: () => live.map((a) => ({ actor: a, model: null })),
    swingAt(attacker, defender, o) {
      const r = combatRules.queueSwing(attacker, defender, o);
      swings.push({ attacker, defender, queued: !!r.queued, reason: r.reason });
      return r;
    },
  };

  const panelCtx = { hud: null };
  const registry = new Map();
  const clock = createWorldClock(1000);
  // what the HUD was told, so the arc and the thirteenth cell are read back
  // rather than described
  const hudSaid = { bond: null, wyrm: null, flash: 0 };
  const keysDown = new Set(), keysFresh = new Set();
  const ctx = {
    sc: { scene },
    hud: {
      log: (t, k) => logs.push({ t, k }), toast: (t, k) => logs.push({ t, k }),
      setBond: (v, n, c) => { hudSaid.bond = { value: v, name: n, callable: c }; return hudSaid.bond; },
      setWyrmsoul: (st) => { hudSaid.wyrm = st; return st; },
      wyrmFlash: (k) => { hudSaid.flash = k; return k; },
      onWyrmsoul: () => {},
    },
    audio: { play: () => null },
    camera: { yaw: 0, pitch: 0, flySpeed: 60 },
    input: {
      down: (k) => keysDown.has(k),
      pressed: (k) => keysFresh.has(k),
      swallow: (k) => keysFresh.delete(k),
    },
    clock,
    character,
    frame: {
      dt: 0, now: 1000, nowS: 1, day: 1, night: false, centre: null,
      worldDt: 0, worldNow: 1000, worldNowS: 1, timeScale: 1,
    },
    get(name) {
      if (registry.has(name)) return registry.get(name);
      if (name === 'world') return { runtime: { heightAt: () => 0 }, underwater: false, dayFactor: () => 1 };
      if (name === 'abilities') return { effects: { bolt: () => {}, burst: () => {} } };
      if (name === 'player') return { rig, actor: me };
      if (name === 'combat') {
        return {
          monsters, combat: combatRules, targeting: { current: null },
          get attacking() { return attacking; },
        };
      }
      if (name === 'inventory') {
        return {
          inventory: {
            remove(where) {
              const i = Number.isFinite(where?.pack) ? where.pack : where?.index;
              const it = character.pack.items[i];
              if (!it) return { ok: false, item: null, removed: 0 };
              character.pack.items[i] = null;
              return { ok: true, item: it, removed: 1 };
            },
          },
        };
      }
      if (name === 'ui') {
        return {
          panelCtx,
          windows: {
            register: (p) => { registered.push(p.id); return true; },
            open: (id) => { opened.push(id); return true; },
          },
        };
      }
      throw new Error(`the stub context has no "${name}"`);
    },
    has: (n) => registry.has(n),
    register(n, v) { registry.set(n, v); return v; },
  };

  const made = dragonSystem.create(ctx);
  registry.set('dragon', made);

  return {
    ctx, made, logs, registered, opened, swings, character, rig, me, scene,
    combat: combatRules, monsters, live, clock, hudSaid,
    press: (k) => keysFresh.add(k),
    hold: (k) => keysDown.add(k),
    release: (k) => keysDown.delete(k),
    setAttacking(mon) { attacking = mon; },
    said: () => logs.map((l) => l.t).join('\n'),
    /** N frames through the system's own update hook and the resolver. */
    frames(n, dt = 1 / 60, from = null) {
      let now = from == null ? ctx.frame.now : from;
      for (let i = 0; i < n; i++) {
        now += dt * 1000;
        ctx.frame.dt = dt; ctx.frame.now = now; ctx.frame.nowS = now / 1000;
        clock.sync(ctx.frame);
        dragonSystem.hotkeys(ctx, ctx.frame);
        dragonSystem.move(ctx, ctx.frame);
        dragonSystem.update(ctx, ctx.frame);
        combatRules.update(ctx.frame.worldDt, ctx.frame.worldNow);
        keysFresh.clear();
      }
      return now;
    },
  };
}

// ===========================================================================
console.log('\nthe boot');
// ===========================================================================
{
  const w = boot();
  check('the window is registered', w.registered.includes('dragon'), w.registered.join(','));
  check('a nameless hatchling opens it', w.opened.includes('dragon'), w.opened.join(','));
  check('and the panel context can reach the dragon', w.ctx.get('ui').panelCtx.dragon === w.made.entity);
  check('the record is on the character, where the save will find it', !!w.character.dragon);
  check('a body was built', !!w.made.entity.model && w.made.entity.model.group.name === 'dragon:hatchling');
  check('and a hatchling was put on the rig rather than on the ground',
    w.made.entity.model.group.parent === w.rig.parts.back
    && w.scene.getObjectByName('dragon:hatchling') == null);
  check('the console handle is there with everything the harness needs',
    ['entity', 'record', 'feed', 'setAge', 'fall', 'on'].every((k) => k in w.made.bw.dragon),
    Object.keys(w.made.bw.dragon).join(','));
  check('and the harness reads the live record, not a copy',
    (() => { w.character.dragon.bond = 42; return w.made.bw.dragon.bond === 42; })());
}

// ===========================================================================
console.log('\n600 frames of following');
// ===========================================================================
{
  const w = boot();
  w.made.entity.setAge('drake');
  w.rig.pos.x = 45; w.rig.pos.z = -30;
  w.frames(600);
  const gap = Math.hypot(w.made.entity.pos.x - w.rig.pos.x, w.made.entity.pos.z - w.rig.pos.z);
  check('after 600 frames the drake is within 3 m of the player', gap <= 3, `${gap.toFixed(2)} m`);
  check('and the model went with it',
    Math.abs(w.made.entity.model.group.position.x - w.made.entity.pos.x) < 1e-6,
    `${w.made.entity.model.group.position.x} vs ${w.made.entity.pos.x}`);
  check('the actor and the model are at the same place, always',
    w.made.actor.pos === w.made.entity.pos);
}
{
  const w = boot();
  w.frames(120);
  check('a hatchling is parented to the rig\'s back anchor and carried',
    w.made.entity.model.group.parent === w.rig.parts.back);
  const off = stageBody('hatchling').offset;
  check('at the right shoulder', Math.abs(w.made.entity.model.group.position.x - off.x) < 1e-9,
    String(w.made.entity.model.group.position.x));
  check('and it reports itself riding', w.made.entity.riding === true);

  w.made.entity.setAge('drake');
  w.frames(10);
  check('a drake comes off the shoulder and stands in the scene',
    w.made.entity.model.group.parent === w.scene);
}

// ===========================================================================
console.log('\nit fights what the player fights');
// ===========================================================================
{
  const w = boot();
  w.made.entity.setAge('drake');
  w.frames(60);
  check('with nothing to fight, no swing goes out', w.swings.length === 0, String(w.swings.length));

  const wolf = spawnMonster('wolf', { x: 4, y: 0, z: 0 });
  wolf.health = 1e6; wolf.maxHealth = 1e6;
  w.live.push(wolf);
  w.setAttacking({ actor: wolf, name: 'wolf' });
  w.frames(600, 1 / 60, 20000);
  const queued = w.swings.filter((s) => s.queued);
  check('given a fight, the dragon swings', queued.length > 0, `${queued.length} of ${w.swings.length} attempts`);
  check('every one of them was the dragon\'s own actor',
    queued.every((s) => s.attacker === w.made.actor && s.defender === wolf));
  check('and every one went through monsters.swingAt, which is combat.queueSwing',
    w.swings.length > 0);
  const rate = queued.length / 10;
  const own = 1 / AGE_STATS.drake.speed;
  check(`it swings on its own timer: ${queued.length} in 10 s is ${rate.toFixed(2)}/s against ${own.toFixed(2)}/s`,
    Math.abs(rate - own) < own * 0.4, `${rate.toFixed(2)} vs ${own.toFixed(2)}`);
  check('the Bond climbed as they fought', w.character.dragon.bond > 0, String(w.character.dragon.bond.toFixed(1)));
  check('and the wolf really took damage, so the swings landed',
    wolf.health < 1e6, `${1e6 - wolf.health} off it`);

  w.setAttacking(null);
  const before = w.swings.length;
  w.frames(120, 1 / 60, 90000);
  check('when the fight is called off, the swinging stops', w.swings.length === before, `${w.swings.length - before} more`);
}

// ===========================================================================
console.log('\nit cannot die');
// ===========================================================================
{
  const w = boot();
  w.made.entity.setAge('drake');
  let deaths = 0;
  w.combat.onDeath((who) => { if (who === w.made.actor) deaths++; });

  // hit it with something enormous, through the real resolver
  const bear = spawnMonster('wolf', { x: 0.5, y: 0, z: 0 });
  bear.weapon.minDamage = 5000; bear.weapon.maxDamage = 5000;
  bear.naturalWeapon.minDamage = 5000; bear.naturalWeapon.maxDamage = 5000;
  w.live.push(bear);
  w.made.actor.pos.x = 0.5;
  // Swing until one lands. A single roll can miss, and a test that depends on
  // one roll is a test that fails once a fortnight for no reason.
  let tries = 0;
  for (let t = 0; t < 40 && !w.character.dragon.fallen; t++) {
    tries++;
    w.combat.queueSwing(bear, w.made.actor, { now: 1000 + t * 100, immediate: true });
    w.combat.update(1 / 60, 1400 + t * 100);
    w.frames(1, 1 / 60, 1400 + t * 100);
  }
  check(`the resolver emptied it, after ${tries} swing(s)`, deaths === 1, String(deaths));
  check('and it fell rather than dying', w.character.dragon.fallen === true);
  check('the fall was said out loud', /has fallen/.test(w.said()));
  check('it is still in the world: a body, an actor and a record',
    !!w.made.entity.model && !!w.made.actor && !!w.character.dragon);
  check('and it still has a maximum health to come back to', w.made.actor.maxHealth === AGE_STATS.drake.hp);

  // fight over it until it wakes
  let now = 20000;
  for (let i = 0; i < 1200 && w.character.dragon.fallen; i++) {
    now += 16.7;
    w.me.lastSwingAt = now;
    w.ctx.frame.dt = 1 / 60; w.ctx.frame.now = now; w.ctx.frame.nowS = now / 1000;
    dragonSystem.update(w.ctx, w.ctx.frame);
  }
  check('fighting over it brings it round', w.character.dragon.fallen === false);
  check('at a quarter Bond or better', w.character.dragon.bond >= WAKE_BOND, w.character.dragon.bond.toFixed(1));
  check('with health on it again', w.made.actor.health > 0, `${w.made.actor.health}/${w.made.actor.maxHealth}`);
  check('and combat no longer holds it dead, so it can fall a second time',
    w.made.actor.dead === false);

  // and it really can: the same blow again
  for (let t = 0; t < 40 && !w.character.dragon.fallen; t++) {
    w.combat.queueSwing(bear, w.made.actor, { now: now + t * 100, immediate: true });
    w.combat.update(1 / 60, now + 400 + t * 100);
    w.frames(1, 1 / 60, now + 400 + t * 100);
  }
  check('a second enormous blow puts it down again rather than doing nothing',
    deaths === 2 && w.character.dragon.fallen === true, `${deaths} deaths`);
}

// ===========================================================================
console.log('\nhunger, over the frames it takes');
// ===========================================================================
{
  const w = boot();
  w.character.dragon.hunger = 0;
  w.frames(3600);                      // sixty seconds at sixty frames a second
  check('a minute of frames is one point of hunger',
    Math.abs(w.character.dragon.hunger - 1) < 0.02, w.character.dragon.hunger.toFixed(4));

  // 0.1 of a point is six seconds of frames at one point a minute
  w.character.dragon.hunger = 69.9;
  w.frames(400);
  check('crossing the threshold is said once',
    (w.said().match(/slowing down/g) || []).length === 1,
    `hunger ${w.character.dragon.hunger.toFixed(3)}, said ${(w.said().match(/slowing down/g) || []).length} times`);
  w.frames(1200);
  check('and not again on every one of the next 1200 frames',
    (w.said().match(/slowing down/g) || []).length === 1);

  w.character.pack.items[0] = makeItem({ base: 'egg' });
  w.made.entity.feed();
  check('feeding brings it back under', w.character.dragon.hunger < 70, w.character.dragon.hunger.toFixed(2));
  w.character.dragon.hunger = 69.9;
  w.frames(400);
  check('and crossing again says it again', (w.said().match(/slowing down/g) || []).length === 2,
    String((w.said().match(/slowing down/g) || []).length));
}

// ===========================================================================
console.log('\nthe Bond drains when you leave it behind');
// ===========================================================================
{
  const w = boot();
  w.made.entity.setAge('drake');
  w.character.dragon.bond = 60;
  w.frames(300);
  check('standing together, nothing drains', w.character.dragon.bond === 60, String(w.character.dragon.bond));
  // put the player far enough that the drake cannot close it in ten seconds
  w.rig.pos.x = 900;
  w.frames(600, 1 / 60, 60000);
  const lost = 60 - w.character.dragon.bond;
  check(`past ${APART_M} m it drains about 1 a second: ${lost.toFixed(1)} points over 10 s`,
    lost > 5 && lost < 15, lost.toFixed(2));
}

// ===========================================================================
console.log('\na monster can take the dragon as a target');
// ===========================================================================
//
// monsters.js only ever offers `stepMonster` the player. The dragon's actor is
// nevertheless a legal target for the real AI, which is what this drives: the
// wolf is handed the dragon in the same slot the player would be in, and it
// aggros, walks and asks to swing exactly as it does at a person. See
// docs/mmo/wiring/D1.md for the two lines monsters.js's owner has to add.
{
  const w = boot();
  w.made.entity.setAge('drake');
  w.made.entity.pos.x = 0; w.made.entity.pos.z = 0;
  const wolf = spawnMonster('wolf', { x: 6, y: 0, z: 0 });
  let wanted = 0, res = null;
  for (let i = 0; i < 400; i++) {
    res = stepMonster(wolf, 1 / 60, {
      player: w.made.actor, now: 1000 + i * 16.7, heightAt: () => 0, reach: 1.6,
    });
    if (res.wantSwing) wanted++;
  }
  check('the wolf takes the dragon as its target', wolf.ai.target === w.made.actor);
  check('walks to it', Math.hypot(wolf.pos.x, wolf.pos.z) < 3, Math.hypot(wolf.pos.x, wolf.pos.z).toFixed(2));
  check('and asks to swing at it', wanted > 0, `${wanted} times`);
  const r = w.combat.queueSwing(wolf, w.made.actor, { now: 100000 });
  check('and a real swing at the dragon is accepted by the resolver', r.queued === true, r.reason || '');
  // A single roll can miss. Swing until one lands, or a green suite fails once
  // a session for no reason at all.
  let landed = 0;
  for (let t = 0; t < 30 && w.made.actor.health >= AGE_STATS.drake.hp; t++) {
    w.combat.queueSwing(wolf, w.made.actor, { now: 100400 + t * 100, immediate: true });
    w.combat.update(1 / 60, 100800 + t * 100);
    landed = t + 1;
  }
  check(`and takes health off it, after ${landed} swing(s)`, w.made.actor.health < AGE_STATS.drake.hp,
    `${w.made.actor.health}/${AGE_STATS.drake.hp}`);
}

// ===========================================================================
console.log('\nthe hooks D2 will read');
// ===========================================================================
{
  const w = boot();
  const seen = [];
  w.made.bw.dragon.on('fed', (i) => seen.push(i.event));
  w.made.bw.dragon.on('grew', (i) => seen.push(`${i.event}:${i.from}->${i.to}`));
  w.character.pack.items[0] = makeItem({ base: 'egg' });
  w.made.bw.dragon.feed('egg');
  check('the harness can feed it by base id', seen.includes('fed'), seen.join(','));
  w.made.bw.dragon.grant('verdant');
  w.made.bw.dragon.grant('saltmarch');
  check('and a granted pair reaches the grew hook', seen.some((s) => /grew:hatchling->drake/.test(s)), seen.join(','));
  check('the entity exposes pos, age and awake, which is what D2 reads',
    typeof w.made.entity.pos === 'object' && typeof w.made.entity.age === 'string'
    && typeof w.made.entity.awake === 'boolean');
  check('setAge is there for testing the bodies', w.made.bw.dragon.setAge('dragon') === true);
  check('and it really rebuilt the body at the new size',
    w.made.entity.model.group.name === 'dragon:dragon', w.made.entity.model.group.name);
  check('the old body left the scene rather than being left standing in it',
    w.scene.getObjectByName('dragon:drake') == null && w.scene.getObjectByName('dragon:hatchling') == null);
  check('fall() is there for the harness', w.made.bw.dragon.fall() === true && w.made.entity.awake === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
