// Wyrmsoul, wired and driven. Run:
//   node src/game/app/systems/wyrmsoul.test.mjs
//
// The rules, the clock, the HUD widgets and the visuals are measured on their
// own in `src/game/wyrmsoul.test.mjs`. This suite boots the REAL dragon system
// against a stub world and drives it a frame at a time through its own three
// hooks, in the order the runner calls them, with the real world clock, the
// real combat resolver and real monster actors.
//
// What is stubbed is the world around it: a flat ground, a window manager that
// records what was registered, a HUD that records what it was told, an audio
// that counts cues, and an input whose keys a test presses. There is no second
// code path: `hotkeys`, `move` and `update` are the ones `app/system.js` calls.

globalThis.performance ||= { now: () => 1000 };
globalThis.window ||= { innerWidth: 1600, innerHeight: 900, addEventListener() {}, removeEventListener() {} };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

import * as THREE from 'three';
import * as W from '../../wyrmsoul.js';
import { dragon as dragonSystem } from './dragon.js';
import { createWorldClock } from '../context.js';
import { createCombat } from '../../combat.js';
import { playerActor, spawnMonster, recompute } from '../../actor.js';
import { WYRMSOUL_KEY } from '../../hud.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ===========================================================================
// The stub world, and the frame that drives it.
// ===========================================================================

function boot(opts = {}) {
  const logs = [];
  const cues = [];
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
  // `rng` is the combat resolver's dice. Leave it out and the real
  // Math.random rolls, as in the game; pass one to a block that is measuring
  // WHEN a blow lands rather than whether it lands.
  const combatRules = createCombat({ recompute, ...(opts.rng ? { rng: opts.rng } : {}) });

  const live = [];
  const monsters = {
    actors: () => live.filter((a) => a.health > 0),
    all: () => live.map((a) => ({ actor: a, model: null })),
    swingAt: (a, d, o) => combatRules.queueSwing(a, d, o),
  };

  const clock = createWorldClock(1000);
  const hudSaid = { bond: null, wyrm: null, flash: 0 };
  const keysDown = new Set(), keysFresh = new Set();
  const registry = new Map();
  const panelCtx = {};
  const ctx = {
    sc: { scene },
    hud: {
      log: (t, k) => logs.push({ t, k }), toast: (t, k) => logs.push({ t, k }),
      setBond: (v, n, c) => { hudSaid.bond = { value: v, name: n, callable: c }; return hudSaid.bond; },
      setWyrmsoul: (st) => { hudSaid.wyrm = st; return st; },
      wyrmFlash: (k) => { hudSaid.flash = k; return k; },
      onWyrmsoul: (fn) => { hudSaid.onClick = fn; },
    },
    audio: { play: (n) => { cues.push(n); return null; } },
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
      if (name === 'world') return { runtime: { heightAt: () => 0 }, underwater: !!opts.underwater, dayFactor: () => 1 };
      if (name === 'player') return { rig, actor: me };
      if (name === 'abilities') return { effects: { bolt: () => {}, burst: () => {} } };
      if (name === 'combat') {
        return { monsters, combat: combatRules, targeting: { current: null }, attacking: null };
      }
      if (name === 'inventory') return { inventory: { remove: () => ({ ok: false, item: null, removed: 0 }) } };
      if (name === 'ui') {
        return { panelCtx, windows: { register: () => true, open: () => true } };
      }
      throw new Error(`the stub context has no "${name}"`);
    },
    has: (n) => registry.has(n) || ['world', 'player', 'combat', 'inventory', 'ui', 'abilities'].includes(n),
    register(n, v) { registry.set(n, v); return v; },
  };

  const made = dragonSystem.create(ctx);
  registry.set('dragon', made);

  let now = ctx.frame.now;
  return {
    ctx, made, logs, cues, character, rig, me, scene, live, clock, hudSaid, monsters,
    combat: combatRules,
    get record() { return made.entity.record; },
    now: () => now,
    press: (k) => keysFresh.add(k),
    hold: (k) => keysDown.add(k),
    release: (k) => keysDown.delete(k),
    said: () => logs.map((l) => l.t).join('\n'),
    lastLine: () => (logs.length ? logs[logs.length - 1].t : ''),
    /**
     * N frames through the system's own hooks, in the runner's order, with the
     * world clock synced exactly where app/system.js syncs it.
     */
    frames(n, dt = 1 / 60) {
      for (let i = 0; i < n; i++) {
        now += dt * 1000;
        ctx.frame.dt = dt; ctx.frame.now = now; ctx.frame.nowS = now / 1000;
        clock.sync(ctx.frame);
        dragonSystem.hotkeys(ctx, ctx.frame);
        dragonSystem.move(ctx, ctx.frame);
        // the fight, on the world clock, exactly as systems/combat.js runs it
        combatRules.update(ctx.frame.worldDt, ctx.frame.worldNow);
        dragonSystem.update(ctx, ctx.frame);
        keysFresh.clear();
      }
      return now;
    },
  };
}

// ===========================================================================
console.log('\nthe system, booted and driven for 600 frames');
// ===========================================================================
// ---- the call, refused and accepted --------------------------------------
{
  const w = boot();
  w.press(WYRMSOUL_KEY);
  w.frames(1);
  check('with the Bond at 0 the key is refused, and says the number',
    w.said().includes('The Bond is at 0'), w.lastLine());
  check('and nothing was slowed', w.clock.scale === 1, String(w.clock.scale));

  w.record.bond = 100;
  w.frames(1);
  check('at 100 the HUD arc goes full and the cell lights',
    w.hudSaid.bond.value === 100 && w.hudSaid.wyrm.callable, JSON.stringify(w.hudSaid.bond));
  w.press(WYRMSOUL_KEY);
  w.frames(1);
  check('the call says the design\'s own line', w.said().includes('Wyrmsoul. The world slows.'), w.lastLine());
  check('the world clock is at one fifth', w.clock.scale === W.TIME_SCALE, String(w.clock.scale));
  check('the Bond is spent', w.record.bond === 0, String(w.record.bond));
  const v = w.made.wyrmsoul.visuals;
  check('the wings are on the back anchor and the eyes on the head',
    v.on && w.rig.parts.back.children.includes(v.wingL) && w.rig.parts.back.children.includes(v.wingR)
    && w.rig.parts.head.children.includes(v.eyeL) && w.rig.parts.head.children.includes(v.eyeR),
    `${w.rig.parts.back.children.length} on the back, ${w.rig.parts.head.children.length} on the head`);
  check('and the call cue went out', w.cues.includes('wyrmsoul_call'), w.cues.join(','));
  check('a second press while it is up is refused',
    (() => { const n = w.logs.length; w.press(WYRMSOUL_KEY); w.frames(1); return w.said().slice(-400).includes('already up'); })(),
    w.lastLine());
}

// ---- the keys are taken before the ability bar can see them ---------------
{
  const w = boot();
  w.record.bond = 100;
  w.press(WYRMSOUL_KEY);
  check('R is fresh before the frame', w.ctx.input.pressed(WYRMSOUL_KEY));
  w.ctx.frame.dt = 1 / 60; w.ctx.frame.now += 16.7; w.ctx.clock.sync(w.ctx.frame);
  dragonSystem.hotkeys(w.ctx, w.ctx.frame);
  check('and swallowed by the time anything after hotkeys could read it',
    !w.ctx.input.pressed(WYRMSOUL_KEY));
  check('the call really went out', W.isRunning(w.made.wyrmsoul.state));
  w.press('1');
  dragonSystem.hotkeys(w.ctx, w.ctx.frame);
  check('the bar\'s first slot is taken by the breath while it is up, so the ability in slot 1 never fires',
    !w.ctx.input.pressed('1'));
  w.press('2');
  dragonSystem.hotkeys(w.ctx, w.ctx.frame);
  check('and slot 2 is left alone without Frostreach\'s second breath',
    w.ctx.input.pressed('2'));
  // with the gift, the second slot is taken too
  const f = boot();
  f.made.wyrmsoul.grant('frostreach');
  f.record.bond = 100;
  f.press(WYRMSOUL_KEY);
  f.frames(1);
  f.press('2');
  f.ctx.frame.dt = 1 / 60; f.ctx.frame.now += 16.7; f.ctx.clock.sync(f.ctx.frame);
  dragonSystem.hotkeys(f.ctx, f.ctx.frame);
  check('with Frostreach it is', !f.ctx.input.pressed('2'));
  const g = boot();
  g.press('1');
  g.ctx.frame.dt = 1 / 60; g.ctx.frame.now += 16.7; g.ctx.clock.sync(g.ctx.frame);
  dragonSystem.hotkeys(g.ctx, g.ctx.frame);
  check('and outside Wyrmsoul the bar keys are nobody\'s business but the bar\'s',
    g.ctx.input.pressed('1'));
}

// ---- five breaths, and all five land at the end, in order -----------------
{
  const w = boot();
  w.record.bond = 100;
  const marks = [];
  // five monsters standing in a line in front of the player, one per breath,
  // so which breath landed is readable off which body lost health
  for (let i = 0; i < 5; i++) {
    const m = spawnMonster('wolf', { x: 0, y: 0, z: 3 + i * 2 });
    m.health = 1e6; m.maxHealth = 1e6;
    w.live.push(m);
    marks.push(m);
  }
  const before = marks.map((m) => m.health);
  w.press(WYRMSOUL_KEY);
  w.frames(1);
  const t0 = w.now();

  // 600 frames, ten seconds: a breath a second for the first five, and the
  // six second effect plus its half second pulse fall well inside that
  // The key is held down for the first four and a half seconds. The breath's
  // own one-a-second gate is what makes that five breaths and not two hundred
  // and seventy, so this measures the rate limit as well as the landing.
  const landedAt = new Map();
  for (let i = 0; i < 600; i++) {
    const elapsed = w.now() - t0;
    if (elapsed < 4500) w.press('1');
    const healthBefore = marks.map((m) => m.health);
    w.frames(1);
    marks.forEach((m, k) => {
      if (m.health < healthBefore[k] && !landedAt.has(k)) landedAt.set(k, i);
    });
  }
  check('the key held for 4.5 s throws exactly five breaths, one a second',
    w.made.wyrmsoul.counts.breaths === 5, String(w.made.wyrmsoul.counts.breaths));
  check('none of them took health off while the world was hanging',
    [...landedAt.values()].every((f) => f > 60 * 6 - 5),
    [...landedAt.entries()].map(([k, f]) => `${k}@${f}`).join(' '));
  check('and every one of the five monsters lost health by the end',
    marks.every((m, k) => m.health < before[k]),
    marks.map((m, k) => `${(before[k] - m.health).toFixed(0)}`).join(','));
  check('nothing was left held', w.made.wyrmsoul.counts.held === 0,
    String(w.made.wyrmsoul.counts.held));
  check('the resolver accepted all 25 of them (five breaths over five bodies)',
    w.made.wyrmsoul.counts.landed === 25 && w.made.wyrmsoul.counts.missed === 0,
    `${w.made.wyrmsoul.counts.landed} landed, ${w.made.wyrmsoul.counts.missed} found nothing`);
  check('combat has nothing of the player\'s left in the air',
    w.combat.pendingCount === 0, String(w.combat.pendingCount));
  // in order: the first monster hit is the one the first breath hit
  const order = [...landedAt.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
  check('and they landed in the order they were thrown', order.join(',') === '0,1,2,3,4', order.join(','));
  check('the end said the count, and it is the counted one',
    w.said().includes('Time catches up: 25 breaths land'),
    w.said().split('\n').filter((l) => l.startsWith('Time catches up')).join(''));
  check('the two clocks are one number again', Math.abs(w.clock.now - w.now()) < 1,
    `${(w.now() - w.clock.now).toFixed(2)} ms apart`);
  check('the end cue went out', w.cues.includes('wyrmsoul_end'), w.cues.join(','));
  check('and the effect is off the body', !w.made.wyrmsoul.visuals.on);
}

// ---- the player's ORDINARY swings, and exactly when they land -------------
//
// The breath is held and released in the pulse. An ordinary swing is not: it
// goes through `combat.queueSwing` on the player's clock, exactly as
// `systems/combat.js` sends it, and lands when the WORLD clock reaches
// `now + SWING_LAND_S`. This block measures where that line falls, rather than
// claiming "everything lands at the end" and leaving the boundary to be found.
{
  // What is being timed here is when a blow LANDS, not whether the dice were
  // kind: a miss takes no health off and would leave a body's slot empty. So
  // the dice are pinned. A roll of 0.01 is under every hit chance, and the
  // same roll would also be under any dodge chance, so the dummies carry no
  // dex (a wolf has none anyway; this is so a wolf that grows some later does
  // not bring the dice back) and no shield to parry with. Six swings, six
  // landings, and the timing checks below keep their meaning.
  const w = boot({ rng: () => 0.01 });
  w.record.bond = 100;
  const dummies = [];
  for (let i = 0; i < 6; i++) {
    const m = spawnMonster('wolf', { x: i * 0.01, y: 0, z: 2 });
    m.health = 1e6; m.maxHealth = 1e6;
    m.stats.dex = 0; m.shield = null;
    w.live.push(m);
    dummies.push(m);
  }
  w.press(WYRMSOUL_KEY);
  w.frames(1);
  const t0 = w.now();
  const landedAt = [];
  let next = 0, thrown = 0;
  for (let i = 0; i < 480; i++) {
    const elapsed = w.now() - t0;
    if (next < 6 && elapsed >= next * 1000) {
      // `immediate` is how an ability's extra shots go through, so this is a
      // real call shape.
      w.monsters.swingAt(w.me, dummies[next], { now: w.ctx.frame.now, immediate: true });
      thrown++;
      next++;
    }
    const before = dummies.map((m) => m.health);
    w.frames(1);
    dummies.forEach((m, k) => {
      if (m.health < before[k] && landedAt[k] === undefined) landedAt[k] = (w.now() - t0) / 1000;
    });
  }
  check(`${thrown} swings went out, one a second for six seconds`, thrown === 6, String(thrown));
  check('and every one of the six bodies lost health',
    landedAt.filter((v) => v !== undefined).length === 6,
    landedAt.map((v) => (v === undefined ? '-' : v.toFixed(2))).join(', '));
  check(`the swing thrown at 0.0 s lands at ${landedAt[0].toFixed(2)} s: inside dragon time, five times slower than the 0.3 s it takes in ordinary time`,
    landedAt[0] > 1.2 && landedAt[0] < 1.8, `${landedAt[0].toFixed(2)} s`);
  const late = landedAt.slice(2);
  check(`and the four thrown from 2.0 s on all land in the half second pulse, at ${late.map((v) => v.toFixed(2)).join(', ')} s`,
    late.every((v) => v >= 6 && v <= 6.6), late.map((v) => v.toFixed(2)).join(', '));
  const inside = landedAt.filter((v) => v < 6).length;
  check(`so ${inside} of the six land inside dragon time and ${6 - inside} at the end: the boundary is measured, not claimed`,
    inside >= 1 && inside <= 2, landedAt.map((v) => v.toFixed(2)).join(', '));
  check('an `immediate` swing pays no Bond and is counted in no total, exactly as D1 says of an ability\'s extra shots',
    w.made.wyrmsoul.counts.swings === 0, String(w.made.wyrmsoul.counts.swings));
  check('nothing of the player\'s is left in the air when the pulse is over',
    w.combat.pendingCount === 0, String(w.combat.pendingCount));
}

// ---- the swing counter, off the one stamp a swing leaves -----------------
{
  const w = boot();
  w.record.bond = 100;
  const dummy = spawnMonster('wolf', { x: 0, y: 0, z: 2 });
  dummy.health = 1e6; dummy.maxHealth = 1e6;
  w.live.push(dummy);
  w.press(WYRMSOUL_KEY);
  w.frames(1);
  // an ordinary swing carries the weapon's own cooldown, so one every three
  // seconds is one every time and the count is not a race with a timer
  // Asked every frame, and paid for only when the weapon's own cooldown says
  // yes: which is exactly how the auto attack asks. What is measured is that
  // the counter agrees with the resolver, whatever number that turns out to be.
  let n = 0;
  for (let i = 0; i < 360; i++) {
    const r = w.monsters.swingAt(w.me, dummy, { now: w.ctx.frame.now });
    if (r.queued) n++;
    w.frames(1);
  }
  check(`${n} ordinary swings got through the weapon's cooldown in six seconds of dragon time`,
    n >= 2, String(n));
  check('and the counter read every one of them off lastSwingAt, which is the only stamp a swing leaves',
    w.made.wyrmsoul.counts.swings === n, `${w.made.wyrmsoul.counts.swings} counted, ${n} thrown`);
  check('the player\'s own rhythm ran at FULL speed: six seconds at the weapon\'s own rate, not a fifth of it',
    n >= 2, `${n} in 6 s, one every ${(6 / n).toFixed(2)} s`);
  w.frames(90);
  check('and the end line said that number',
    w.said().includes(`${n} blows`), w.said().split('\n').filter((l) => l.startsWith('Time catches up')).join(''));
}

// ---- the duration on the clock: six, then ten -----------------------------
{
  const measure = (gifts) => {
    const w = boot();
    for (const g of gifts) w.made.wyrmsoul.grant(g);
    w.record.bond = 100;
    w.press(WYRMSOUL_KEY);
    w.frames(1);
    const t0 = w.now();
    let ranFor = 0;
    for (let i = 0; i < 900; i++) {
      w.frames(1);
      if (w.made.wyrmsoul.state.phase === 'running') ranFor = w.now() - t0;
    }
    return ranFor;
  };
  const six = measure([]);
  check(`the base runs for ${(six / 1000).toFixed(2)} s`, Math.abs(six - 6000) < 40, `${six.toFixed(0)} ms`);
  const ten = measure(['verdant', 'saltmarch', 'ember', 'stormpeaks', 'boneyard', 'frostreach']);
  check(`with Frostreach it runs for ${(ten / 1000).toFixed(2)} s`, Math.abs(ten - 10000) < 40, `${ten.toFixed(0)} ms`);
}

// ---- the tail, the roar, and the tired window ----------------------------
{
  const w = boot();
  w.made.wyrmsoul.grant('saltmarch');
  w.made.wyrmsoul.grant('verdant');
  w.record.bond = 100;
  const close = spawnMonster('giantRat', { x: 0, y: 0, z: 2 });
  close.health = 1e6; close.maxHealth = 1e6;
  w.live.push(close);
  const wasAt = close.pos.z;
  w.press(WYRMSOUL_KEY);
  w.frames(1);
  check(`the tail throws what is inside ${W.TAIL_M} m`, close.pos.z > wasAt + 3.5,
    `${wasAt.toFixed(1)} m to ${close.pos.z.toFixed(1)} m`);
  check('and says how many it caught', w.said().includes('The tail sweeps'), w.lastLine());
}
{
  // attackSkill is weaponSkill + tactics * 0.25, and unarmed the weapon skill is
  // Wrestling, so 30 and 0 puts the player exactly in tier 2's band of 30 to 45
  const w = boot({ character: { skills: { wrestling: 30, tactics: 0 } } });
  for (const g of ['verdant', 'saltmarch', 'ember', 'stormpeaks', 'boneyard']) w.made.wyrmsoul.grant(g);
  recompute(w.me);
  check('the player is tier 2', W.playerTier(w.me) === 2, String(W.playerTier(w.me)));
  w.record.bond = 100;
  const rat = spawnMonster('giantRat', { x: 0, y: 0, z: 8 });      // tier 1
  const skel = spawnMonster('skeletonWarrior', { x: 0, y: 0, z: 9 });   // tier 2
  for (const m of [rat, skel]) { m.health = 1e6; m.maxHealth = 1e6; w.live.push(m); }
  w.press(WYRMSOUL_KEY);
  w.frames(1);
  // run to the frame the roar goes out on and stop there: a stun is 1.5 s, and
  // a check taken seven seconds later would read a stun that has correctly
  // expired as a stun that never happened
  let frames = 0;
  while (!w.said().includes('The roar goes out') && frames < 600) { w.frames(1); frames++; }
  check(`the roar went out at the player's own tier`, w.said().includes('The roar goes out at tier 2'),
    w.said().split('\n').filter((l) => l.includes('roar')).join(''));
  check('the tier 1 was routed', rat.ai?.state === 'flee', rat.ai?.state);
  check(`the tier ${skel.tier} was stunned instead`, !!skel.status?.stun, JSON.stringify(skel.status?.stun || null));
  check(`and the stun the resolver wrote is ${W.ROAR_STUN_S} s`,
    skel.status?.stun?.seconds === W.ROAR_STUN_S, String(skel.status?.stun?.seconds));
  check(`and it went out on frame ${frames} of the call, which is six seconds in`,
    Math.abs(frames - 360) < 3, String(frames));
  w.frames(120);
  check('the dragon is spent, and it is said', w.said().includes('It fights, but the Bond does not climb'),
    w.said().split('\n').filter((l) => l.includes('spent')).join(''));
}

// ---- the Bond does not climb while it is tired ---------------------------
{
  const w = boot();
  w.record.bond = 100;
  w.press(WYRMSOUL_KEY);
  w.frames(420);        // the six seconds and the pulse are out
  const bondAfter = w.record.bond;
  w.made.entity.feed?.('egg');
  w.frames(2);
  check('a feed inside the tired window is worth no Bond', w.record.bond === bondAfter,
    `${bondAfter.toFixed(1)} -> ${w.record.bond.toFixed(1)}`);
  check('and it is said once rather than every time',
    w.said().split('still spent').length - 1 <= 1);
}

// ---- a gift gained says what Wyrmsoul can do now -------------------------
{
  const w = boot();
  w.frames(2);
  const before = w.logs.length;
  w.made.wyrmsoul.grant('stormpeaks');
  w.frames(2);
  const said = w.logs.slice(before).map((l) => l.t).join('\n');
  check('the grant says what it means for Wyrmsoul, not only which realm gave it',
    said.includes('Space flies'), said.replace(/\n/g, ' | '));
  const after = w.logs.length;
  w.frames(60);
  check('and says it once, not every frame', w.logs.length === after, `${w.logs.length - after} more lines`);
  // the path a realm's dungeon really takes: entity.grant, not the harness
  const b2 = w.logs.length;
  w.made.entity.grant('frostreach');
  w.frames(2);
  check('a gift granted straight through the entity is caught too',
    w.logs.slice(b2).map((l) => l.t).join('').includes('frost'),
    w.logs.slice(b2).map((l) => l.t).join(' | '));
}

// ---- the Ember Wastes: the fire stays in the ground ----------------------
{
  const w = boot();
  for (const g of ['verdant', 'saltmarch', 'ember']) w.made.wyrmsoul.grant(g);
  w.record.bond = 100;
  const standing = spawnMonster('wolf', { x: 0, y: 0, z: 6 });
  standing.health = 1e6; standing.maxHealth = 1e6;
  w.live.push(standing);
  w.press(WYRMSOUL_KEY);
  w.frames(1);
  w.press('1');
  w.frames(1);
  check('the breath leaves a patch of ground burning', w.made.wyrmsoul.counts.fires === 1,
    String(w.made.wyrmsoul.counts.fires));
  check('and it says how big it is and what it costs',
    w.said().includes('The ground takes the fire'),
    w.said().split('\n').filter((l) => l.includes('ground takes')).join(''));
  const zone = w.made.wyrmsoul.fires[0];
  check(`the patch is ${zone.r} m across the middle of the cone`, zone.r === W.FIRE_GROUND_R, String(zone.r));

  // A second body inside the PATCH but outside the CONE, so what it loses is
  // the ground and never the breath. 45 degrees off the nose is outside a 60
  // degree cone; 6.05 m from the patch's centre is inside a 7.5 m patch.
  const burner = spawnMonster('wolf', { x: 6, y: 0, z: 6 });
  burner.health = 1e6; burner.maxHealth = 1e6;
  w.live.push(burner);
  check('it is in the patch and out of the cone',
    Math.hypot(6 - zone.x, 6 - zone.z) < zone.r && !W.inCone(w.rig.pos, 0, { x: 6, z: 6 }),
    `${Math.hypot(6 - zone.x, 6 - zone.z).toFixed(2)} m from the middle`);

  const before = burner.health;
  // six seconds of dragon time is 1.2 s on the WORLD clock, so the patch burns
  // about once in the whole of it
  w.frames(355);
  const duringDragonTime = before - burner.health;
  check(`the fire hangs with the world: ${duringDragonTime} off over six seconds of dragon time`,
    duringDragonTime > 0 && duringDragonTime <= zone.per * 2,
    `${duringDragonTime} at ${zone.per} a second, which is ${duringDragonTime / zone.per} ticks in 1.2 s of world clock`);
  const atEnd = burner.health;
  w.frames(120);       // the pulse pays the clock back, and the fire burns it down
  const after = atEnd - burner.health;
  check(`and it keeps burning as time catches up: ${after} more off`,
    after >= zone.per * 3, `${after} at ${zone.per} a second`);
  w.frames(600);
  check(`the patch is out after ${W.FIRE_GROUND_S} s of world clock`,
    w.made.wyrmsoul.counts.fires === 0, String(w.made.wyrmsoul.counts.fires));
  check('a monster outside the patch is never touched', (() => {
    const far = spawnMonster('wolf', { x: 200, y: 0, z: 200 });
    far.health = 1000; far.maxHealth = 1000;
    w.live.push(far);
    w.frames(60);
    return far.health === 1000;
  })());
}

// ---- the wings ------------------------------------------------------------
{
  const w = boot();
  for (const g of ['verdant', 'saltmarch', 'ember', 'stormpeaks']) w.made.wyrmsoul.grant(g);
  w.record.bond = 100;
  w.press(WYRMSOUL_KEY);
  w.frames(1);
  check('the call says Space flies', w.said().includes('Space flies'), w.lastLine());
  w.hold(' ');
  w.frames(30);
  check('holding Space lifts the body off the ground', w.rig.pos.y > 1, `${w.rig.pos.y.toFixed(2)} m`);
  w.frames(300);
  check(`and it never goes past ${W.FLY_CEILING_M} m`, w.rig.pos.y <= W.FLY_CEILING_M + 1e-6,
    `${w.rig.pos.y.toFixed(2)} m`);
  w.release(' ');
  w.frames(120);
  check('when it ends you land where you are', w.said().includes('land where you are'),
    w.said().split('\n').filter((l) => l.includes('land')).join(''));
  check('and the flying stops', !w.made.wyrmsoul.flying);
}

// ---- without the gift, Space does nothing --------------------------------
{
  const w = boot();
  w.record.bond = 100;
  w.press(WYRMSOUL_KEY);
  w.hold(' ');
  w.frames(60);
  check('without the Stormpeaks the wings are cosmetic and Space does not fly',
    w.rig.pos.y === 0 && !w.made.wyrmsoul.flying, `${w.rig.pos.y.toFixed(2)} m`);
}

// ---- dying inside it ------------------------------------------------------
{
  const w = boot();
  w.record.bond = 100;
  w.press(WYRMSOUL_KEY);
  w.frames(30);
  check('it is up', W.isRunning(w.made.wyrmsoul.state));
  w.combat.kill(w.me, null);
  w.frames(2);
  check('dying inside it ends it', !W.isActive(w.made.wyrmsoul.state));
  check('the Bond empties', w.record.bond === 0, String(w.record.bond));
  check('the dragon falls with you', w.record.fallen === true);
  check('the clock is put back', w.clock.scale === 1, String(w.clock.scale));
  check('and it is said', w.said().includes('You go down inside Wyrmsoul'), w.lastLine());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
