// Wild animals for the endless world: deer in the meadows and along the forest
// edge, rabbits and squirrels in the meadow and the sakura groves, foxes and
// wolves out in the boreal after dark, gulls turning over the beaches.
//
// The shape is flora's. chunks.js hands every built chunk to onChunk and every
// disposed chunk to offChunk; fauna only ever puts animals on the ground in the
// NEAR RING (3 chunks, so 7 x 7 = 49 chunks, 224 m each way), and never more
// than ALIVE_CAP of them at once. Which chunk holds a herd, a fox, a squirrel
// pair or a flock is a pure function of the seed and the chunk, so walking away
// and back finds the same animals in the same field.
//
//   const fauna = createFauna(scene, field, { sitesNear });
//   chunks.js  fauna.onChunk(cx, cz, verts) / fauna.offChunk(cx, cz)
//   farm.js    fauna.update(dt, nowMs, x, z, night) every frame
//   hunting    fauna.targets() -> the models the bow can shoot
//
// Huntability is the farm's own contract, not a new one. Every ground animal
// carries userData.roam (state, heading, speed, hp, quarry, variant, legs,
// head) and userData.hit (an invisible target column whose userData.deer points
// back at the model), which is exactly what farm.js `_resolveShot`,
// `_spookDeer`, `_woundDeer` and `_killDeer` reach for. This module then honours
// what they wrote: a 'flee' bolts, a 'dead' tips over, sinks and despawns.
//
// See FAUNA.WIRING.md for the farm.js lines, including the two table entries
// farm.js and main.js still need before a shot wolf reads as a wolf.

import * as THREE from 'three';
import { buildDeer } from '../farm/deer.js';
import { buildCritter } from '../farm/critter_models.js';
import { buildPredator } from '../farm/predator_models.js';
import { buildSeagull } from '../farm/beach_life.js';
import { CHUNK, BIOMES } from './field.js';
import { rand2 } from './noise.js';

export const NEAR_RING = 3;        // chunks each way that may hold animals
export const ALIVE_CAP = 24;       // never more than this many alive at once
export const HOME_KEEP = 130;      // the farm has its own deer; keep clear of it
export const SITE_PAD = 6;         // a site's flat radius plus this is off limits
export const RIVER_MAX = 0.15;     // river strength a hoof will not stand in
export const LEASH = 30;           // how far an animal drifts from where it spawned
export const SCAN_MS = 300;        // between spawn/despawn sweeps
export const HERD_SPREAD = 14;     // herd members scatter this far from the leader
const PLACE_TRIES = 8;             // candidate points per animal before giving up
const DEAD_SINK_MS = 2700;         // tip over, sink, gone

// One entry per species. `quarry` and `hp` are read by the farm's hunt code;
// `speed` is metres per second and `flee` multiplies it while bolting.
export const KINDS = {
  deer:     { model: 'deer',     quarry: 'deer',     hp: [2, 3], hitR: 0.95, speed: 1.6, flee: 6.0, spook: 20, scale: 1,    biomes: ['meadow', 'sakura', 'boreal'] },
  rabbit:   { model: 'bunny',    quarry: 'bunny',    hp: [1, 1], hitR: 0.55, speed: 4.2, flee: 1.8, spook: 12, scale: 1.5,  biomes: ['meadow', 'sakura'], restless: true },
  squirrel: { model: 'squirrel', quarry: 'squirrel', hp: [1, 1], hitR: 0.5,  speed: 4.6, flee: 1.7, spook: 12, scale: 1.5,  biomes: ['meadow', 'sakura', 'boreal'], restless: true },
  fox:      { model: 'fox',      quarry: 'fox',      hp: [1, 1], hitR: 0.7,  speed: 4.4, flee: 1.9, spook: 12, scale: 1.15, biomes: ['boreal'], predator: true },
  wolf:     { model: 'wolf',     quarry: 'wolf',     hp: [2, 2], hitR: 0.9,  speed: 6.0, flee: 1.6, spook: 12, scale: 1.0,  biomes: ['boreal'], predator: true },
  gull:     { model: 'seagull',  flying: true,                   scale: 1.5,  biomes: ['beach', 'ocean'] },
};

// Which chunks hold what. `p` is the chance this chunk rolls the group at all,
// `n` the size of it. `night` groups exist only while the night flag is set;
// `edge` groups need a neighbouring chunk of open country, which is what makes
// boreal deer a forest EDGE animal rather than a deep woods one.
export const SPAWN = {
  meadow: [
    { kind: 'deer',     p: 0.20, n: [3, 5] },
    { kind: 'rabbit',   p: 0.30, n: [2, 3] },
    { kind: 'squirrel', p: 0.10, n: [2, 2] },
  ],
  sakura: [
    { kind: 'deer',     p: 0.12, n: [2, 3] },
    { kind: 'rabbit',   p: 0.26, n: [2, 3] },
    { kind: 'squirrel', p: 0.34, n: [2, 2] },
  ],
  boreal: [
    { kind: 'deer',     p: 0.30, n: [2, 4], edge: 'open' },
    { kind: 'squirrel', p: 0.22, n: [2, 2] },
    { kind: 'fox',      p: 0.20, n: [1, 1], night: true },
    { kind: 'wolf',     p: 0.14, n: [2, 3], night: true },
  ],
  beach: [
    { kind: 'gull',     p: 0.45, n: [2, 4] },
  ],
  ocean: [
    { kind: 'gull',     p: 0.30, n: [2, 3], edge: 'coast' },
  ],
  desert: [],
  mountain: [],
  snow: [],
};

// Independent roll streams, so adding a wolf table never moves the deer.
const GROUP_SEED = { deer: 61, rabbit: 67, squirrel: 71, fox: 73, wolf: 79, gull: 83 };
const DEER_VARIANTS = ['buck', 'doe', 'fawn'];

/**
 * Every biome the field can return needs a row here, even an empty one, or a
 * new biome would quietly ship with no animals and nobody would notice.
 * Throws on the first gap. Called at module load.
 */
export function auditSpawnTable() {
  const missing = BIOMES.filter((b) => !SPAWN[b]);
  if (missing.length) throw new Error(`fauna: no spawn row for biome ${missing.join(', ')}`);
  const unknown = [];
  for (const [b, rows] of Object.entries(SPAWN)) {
    if (!BIOMES.includes(b)) unknown.push(b);
    for (const r of rows) {
      if (!KINDS[r.kind]) unknown.push(`${b}:${r.kind}`);
      else if (!KINDS[r.kind].biomes.includes(b)) unknown.push(`${b} spawns ${r.kind}, which does not live there`);
    }
  }
  if (unknown.length) throw new Error(`fauna: bad spawn table (${unknown.join('; ')})`);
  return true;
}
auditSpawnTable();

export const siteClear = (st) => (st.flatR != null ? st.flatR : 20) + SITE_PAD;

/**
 * Pure: may an animal stand at (x, z), given the field sample there?
 * Returns null when it may, otherwise the reason it may not. The same call
 * guards placement and every step an animal takes, so an animal can no more
 * walk into a river than it can spawn in one.
 */
export function blockedAt(x, z, s, ctx) {
  if (Math.hypot(x, z) < (ctx.homeKeep ?? HOME_KEEP)) return 'home';
  const sites = ctx.sites || [];
  for (const st of sites) if (Math.hypot(st.x - x, st.z - z) < siteClear(st)) return 'site';
  if (!ctx.flying && (s.water || s.river > RIVER_MAX)) return 'water';
  if (ctx.biomes && !ctx.biomes.includes(s.biome)) return 'biome';
  return null;
}

/** Pure: does a chunk next door hold one of these biomes? */
export function neighbourHas(field, cx, cz, biomes) {
  const c = CHUNK, h = CHUNK / 2;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (biomes.includes(field.biomeAt((cx + dx) * c + h, (cz + dz) * c + h))) return true;
  }
  return false;
}

// What each `edge` flag means. Deer want the line where the wood meets open
// country; gulls want the coast, not the middle of the sea.
export const EDGES = {
  open: ['meadow', 'sakura', 'beach'],
  coast: ['beach'],
};

/** Pure: is this boreal chunk on the edge of open country? */
export const isForestEdge = (field, cx, cz) => neighbourHas(field, cx, cz, EDGES.open);

/**
 * Pure: the animals this chunk holds, as plain records. No THREE, no scene, so
 * the whole spawn table is testable in node. Records carry their own random
 * numbers (r0, r1, r2) so heading, speed and gait phase are as deterministic as
 * the placement is.
 */
export function spawnsFor(field, cx, cz, opts = {}) {
  const seed = field.seed;
  const homeKeep = opts.homeKeep ?? HOME_KEEP;
  const sitesNear = opts.sitesNear || (() => []);
  const x0 = cx * CHUNK, z0 = cz * CHUNK, mid = CHUNK / 2;
  const centre = field.sampleAt(x0 + mid, z0 + mid);
  const table = SPAWN[centre.biome];
  if (!table || !table.length) return [];
  const sites = sitesNear(x0 + mid, z0 + mid, CHUNK + 120);
  const out = [];
  for (const g of table) {
    const gs = GROUP_SEED[g.kind];
    if (rand2(cx, cz, seed + gs) >= g.p) continue;
    if (g.edge && !neighbourHas(field, cx, cz, EDGES[g.edge])) continue;
    const spec = KINDS[g.kind];
    const span = g.n[1] - g.n[0] + 1;
    const n = g.n[0] + Math.floor(rand2(cx * 7 + 13, cz * 5 + 3, seed + gs + 1) * span);
    const ctx = { sites, homeKeep, flying: !!spec.flying, biomes: spec.biomes };
    let anchor = null;
    for (let i = 0; i < n; i++) {
      let placed = null;
      for (let t = 0; t < PLACE_TRIES; t++) {
        const ra = rand2(cx * 131 + i * 17 + t, cz * 97 + t * 5, seed + gs + 2);
        const rb = rand2(cx * 89 + t * 11, cz * 149 + i * 23 + t, seed + gs + 3);
        const x = anchor ? anchor.x + (ra - 0.5) * 2 * HERD_SPREAD : x0 + 4 + ra * (CHUNK - 8);
        const z = anchor ? anchor.z + (rb - 0.5) * 2 * HERD_SPREAD : z0 + 4 + rb * (CHUNK - 8);
        const s = field.sampleAt(x, z);
        if (blockedAt(x, z, s, ctx)) continue;
        placed = { x, z, h: s.h };
        break;
      }
      if (!placed) continue;
      if (!anchor) anchor = placed;
      out.push({
        kind: g.kind,
        x: placed.x, z: placed.z, y: placed.h,
        variant: g.kind === 'deer' ? DEER_VARIANTS[i % DEER_VARIANTS.length] : null,
        night: !!g.night,
        chunk: cx + ',' + cz,
        i,
        r0: rand2(cx * 5 + i, cz * 3 + 1, seed + gs + 4),
        r1: rand2(cx * 3 + 1, cz * 5 + i, seed + gs + 5),
        r2: rand2(cx * 11 + i * 3, cz * 13 + i, seed + gs + 6),
      });
    }
  }
  return out;
}

/** Pure: how many of each kind a chunk holds. Handy for tests and for stats. */
export function countsFor(field, cx, cz, opts) {
  const out = {};
  for (const r of spawnsFor(field, cx, cz, opts)) out[r.kind] = (out[r.kind] || 0) + 1;
  return out;
}

// ---------------------------------------------------------------- runtime ---

function buildModel(kind) {
  const m = KINDS[kind].model;
  if (kind === 'gull') return buildSeagull();
  if (kind === 'fox' || kind === 'wolf') return buildPredator(m);
  if (kind === 'deer') return null;             // variant decides, handled by caller
  return buildCritter(m);
}

export function createFauna(scene, field, opts = {}) {
  const group = new THREE.Group();
  group.name = 'world-fauna';
  scene.add(group);
  const sitesNear = opts.sitesNear || (() => []);
  const homeKeep = opts.homeKeep ?? HOME_KEEP;
  const cap = opts.cap ?? ALIVE_CAP;
  const ring = opts.ring ?? NEAR_RING;

  const built = new Set();          // chunk keys chunks.js has meshed
  const live = new Map();           // chunk key -> { cx, cz, recs, spawned:Map, gone:Set }
  const animals = [];               // every model on the ground or in the air
  const pool = new Map();           // "kind:variant" -> spare models
  const stats = {
    alive: 0, chunks: 0, spawned: 0, despawned: 0, capped: 0, blockedSteps: 0,
    night: false, byKind: {},
  };
  let lastScan = -1e9, lastChunk = null, lastNight = false;

  // ---- models: built once, pooled, never rebuilt for the same species ------
  const poolKey = (kind, variant) => kind + ':' + (variant || '');
  function takeModel(kind, variant) {
    const key = poolKey(kind, variant);
    const spares = pool.get(key);
    if (spares && spares.length) return spares.pop();
    const spec = KINDS[kind];
    const model = kind === 'deer' ? buildDeer(variant || 'doe') : buildModel(kind);
    const s = spec.scale || 1;
    if (s !== 1) model.scale.setScalar(s);
    if (!spec.flying) {
      // the farm's hit column: a fixed world-size cylinder despite model scale
      const r = spec.hitR / s;
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, Math.max(1.4, spec.hitR * 2.6) / s, 6),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.position.y = Math.max(0.7, spec.hitR * 1.3) / s;
      hit.userData.deer = model;
      model.add(hit);
      model.userData.hit = hit;
    }
    return model;
  }
  function giveBack(model, kind, variant) {
    model.visible = true;
    model.rotation.set(0, 0, 0);
    model.scale.setScalar(KINDS[kind].scale || 1);
    model.userData.roam = null;
    model.userData.fly = null;
    const key = poolKey(kind, variant);
    if (!pool.has(key)) pool.set(key, []);
    pool.get(key).push(model);
  }

  // ---- spawn / despawn ----------------------------------------------------
  function spawn(rec, entry) {
    const spec = KINDS[rec.kind];
    const model = takeModel(rec.kind, rec.variant);
    model.position.set(rec.x, rec.y, rec.z);
    const avoid = sitesNear(rec.x, rec.z, 240).map((st) => ({ x: st.x, z: st.z, flatR: st.flatR }));
    const wild = {
      kind: rec.kind, spec, chunk: rec.chunk, rec,
      home: { x: rec.x, z: rec.z },
      groundY: rec.y,
      ctx: { sites: avoid, homeKeep, flying: !!spec.flying, biomes: null },
    };
    model.userData.wild = wild;
    if (spec.flying) {
      const base = Math.max(rec.y, field.seaLevel);
      model.userData.fly = {
        wings: model.userData.wings || {},
        cx: rec.x, cz: rec.z,
        r: 16 + rec.r0 * 16,
        ang: rec.r1 * Math.PI * 2,
        w: (0.22 + rec.r2 * 0.16) * (rec.i % 2 ? -1 : 1),   // radians per second
        h: base + 16 + rec.i * 2.5,
        ph: rec.r0 * 10,
        bank: 0,
        flapSpeed: 150,
      };
    } else {
      const hp = spec.hp[0] + Math.floor(rec.r2 * (spec.hp[1] - spec.hp[0] + 1));
      const speed = spec.speed * (0.85 + rec.r1 * 0.3);
      // Shaped exactly like farm.js addQuarry's record, so the farm's hunt code
      // can spook, wound and kill one of these without knowing it is wild.
      model.userData.roam = {
        legs: model.userData.legs || [], head: model.userData.head,
        cz: rec.z, minR: 0, maxR: LEASH,
        heading: rec.r0 * Math.PI * 2,
        speed, homeSpeed: speed,
        state: 'walk', until: 3000 + rec.r1 * 4000, t0: 0,
        ph: rec.r2 * 10, turtle: false,
        quarry: spec.quarry, variant: rec.variant,
        hp, hpMax: hp, restless: !!spec.restless,
        mixer: null, actions: null, clip: null,
      };
    }
    group.add(model);
    animals.push(model);
    entry.spawned.set(rec.i + ':' + rec.kind, model);
    stats.alive++; stats.spawned++;
    stats.byKind[rec.kind] = (stats.byKind[rec.kind] || 0) + 1;
    return model;
  }

  function despawn(model, permanent) {
    const w = model.userData.wild;
    const i = animals.indexOf(model);
    if (i >= 0) animals.splice(i, 1);
    group.remove(model);
    const entry = live.get(w.chunk);
    if (entry) {
      entry.spawned.delete(w.rec.i + ':' + w.rec.kind);
      if (permanent) entry.gone.add(w.rec.i + ':' + w.rec.kind);
    }
    stats.alive--; stats.despawned++;
    stats.byKind[w.kind]--;
    giveBack(model, w.kind, w.rec.variant);
  }

  // Who gets to exist when the near ring wants more animals than the cap
  // allows. A wolf you can be eaten by beats a squirrel you cannot, and near
  // beats far, so the cap is spent on the animals a player would actually meet.
  const PRIORITY = { wolf: 0, fox: 0, deer: 1, gull: 2, rabbit: 3, squirrel: 3 };
  // and no one species takes the whole cap: four wolves is a night to remember,
  // twenty-four of them is a wolf simulator with no wood left around it
  const MAX_ALIVE = opts.maxAlive || { wolf: 4, fox: 3, deer: 8, gull: 8, rabbit: 8, squirrel: 8 };

  function addChunk(cx, cz) {
    const key = cx + ',' + cz;
    if (live.has(key)) return live.get(key);
    const entry = { key, cx, cz, recs: spawnsFor(field, cx, cz, { sitesNear, homeKeep }), spawned: new Map(), gone: new Set() };
    live.set(key, entry);
    stats.chunks++;
    return entry;
  }

  /**
   * One sweep: rank every animal the near ring wants, keep the best `cap` of
   * them, spawn what is missing and despawn what fell off the end. Ranking by
   * (priority, distance) rather than by chunk order is what lets a wolf appear
   * at nightfall in a wood already full of squirrels.
   */
  function rescan(px, pz, night) {
    const wanted = [];
    for (const entry of live.values()) {
      for (const rec of entry.recs) {
        const key = rec.i + ':' + rec.kind;
        if (rec.night && !night) continue;
        if (entry.gone.has(key)) continue;
        const dx = rec.x - px, dz = rec.z - pz;
        wanted.push({ entry, rec, key, d2: dx * dx + dz * dz, pr: PRIORITY[rec.kind] ?? 4 });
      }
    }
    wanted.sort((a, b) => a.pr - b.pr || a.d2 - b.d2
      || (a.entry.key < b.entry.key ? -1 : a.entry.key > b.entry.key ? 1 : a.rec.i - b.rec.i));
    const keep = [];
    const perKind = {};
    for (const w of wanted) {
      if (keep.length >= cap) break;
      const k = w.rec.kind;
      const used = perKind[k] || 0;
      if (used >= (MAX_ALIVE[k] ?? cap)) continue;
      perKind[k] = used + 1;
      keep.push(w);
    }
    stats.capped = wanted.length - keep.length;
    const keepIds = new Set(keep.map((w) => w.entry.key + '/' + w.key));
    for (const entry of live.values()) {
      for (const [key, model] of [...entry.spawned]) {
        if (!keepIds.has(entry.key + '/' + key)) despawn(model, false);
      }
    }
    for (const w of keep) if (!w.entry.spawned.has(w.key)) spawn(w.rec, w.entry);
  }
  function dropChunk(key) {
    const entry = live.get(key);
    if (!entry) return;
    for (const model of [...entry.spawned.values()]) despawn(model, false);
    live.delete(key);
    stats.chunks--;
  }

  // ---- one animal, one step ----------------------------------------------
  const TURN_AWAY = 2.2;   // radians a blocked animal turns before trying again

  function stepGround(model, dt, now, px, pz) {
    const rm = model.userData.roam;
    const w = model.userData.wild;
    const spec = w.spec;
    const p = model.position;
    rm.t0 += dt * 1000;

    // the venison haunch the farm spawns on a kill floats up and fades. It is
    // placed at y = 1 in farm coordinates, which is sea level out here, so ride
    // it on the animal's own ground instead of leaving it buried in a hill.
    if (rm.meatFx) {
      const mt = (now - rm.meatFx.start) / rm.meatFx.dur;
      if (mt >= 1) { scene.remove(rm.meatFx.mesh); rm.meatFx = null; }
      else {
        if (rm.meatFx.baseY == null) rm.meatFx.baseY = p.y + 1.0;
        rm.meatFx.mesh.position.set(p.x, rm.meatFx.baseY + mt * 2.2, p.z);
        rm.meatFx.mesh.rotation.y += dt * 2.4;
        const s = 1.6 * (1 - Math.max(0, mt - 0.7) / 0.3);
        rm.meatFx.mesh.scale.setScalar(Math.max(0.001, s));
      }
    }

    if (rm.state === 'dead') {
      const tp = Math.min(1, rm.t0 / 600);
      model.rotation.z = tp * (Math.PI / 2);
      for (const leg of rm.legs) if (leg) leg.rotation.x *= 0.85;
      if (rm.t0 > 2000) {
        const sink = Math.min(1, (rm.t0 - 2000) / 700);
        p.y = (w.groundY != null ? w.groundY : p.y) - sink * 2.2;
        model.scale.setScalar((spec.scale || 1) * (1 - sink * 0.6));
      }
      if (rm.t0 > DEAD_SINK_MS && !rm.meatFx) despawn(model, true);
      return;
    }
    if (rm.state === 'respawning') { despawn(model, true); return; }

    // the player is the thing to run from. Predators break at 12 m, deer at 20.
    const pd = Math.hypot(p.x - px, p.z - pz);
    if (rm.state !== 'flee' && rm.state !== 'rage' && pd < spec.spook) {
      rm.state = 'flee';
      rm.fleeUntil = now + 3500;
      rm.speed = spec.speed * spec.flee;
      rm.heading = Math.atan2(p.z - pz, p.x - px);
      rm.t0 = 0;
    }
    const fleeing = rm.state === 'flee';
    const raging = rm.state === 'rage';
    if (fleeing && now >= (rm.fleeUntil || 0)) {
      rm.state = 'walk'; rm.speed = rm.homeSpeed || rm.speed; rm.t0 = 0; rm.until = 2500 + Math.random() * 3000;
    }
    if (raging) {
      // farm.js `_enrageBear` can set this on any quarry. Out here there is no
      // farm to charge, so it charges the player, then breaks off and bolts.
      rm.heading = Math.atan2(pz - p.z, px - p.x);
      if (now >= (rm.rageUntil || 0)) { rm.state = 'flee'; rm.fleeUntil = now + 3000; rm.speed = spec.speed * spec.flee; rm.t0 = 0; }
    }

    if (rm.state === 'graze') {
      for (const leg of rm.legs) if (leg) leg.rotation.x *= 0.9;
      if (rm.head) rm.head.rotation.x = 0.5 + Math.sin(now / 500 + rm.ph) * 0.05;
      if (rm.t0 > rm.until) {
        rm.state = 'walk'; rm.t0 = 0; rm.until = 3000 + Math.random() * 5000;
        rm.heading = Math.random() * Math.PI * 2;
      }
      return;
    }

    // heading: a little jitter, plus a pull back toward where it spawned
    if (!fleeing && !raging) rm.heading += (Math.random() - 0.5) * 0.06;
    else if (fleeing) rm.heading += (Math.random() - 0.5) * 0.03;
    const hx = p.x - w.home.x, hz = p.z - w.home.z;
    const away = Math.hypot(hx, hz);
    const leash = fleeing ? LEASH * 1.6 : LEASH;
    if (away > leash) {
      const inward = Math.atan2(-hz, -hx);
      let df = inward - rm.heading;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      rm.heading += df * (fleeing ? 0.12 : 0.08);
    }

    // the step itself, refused if it would put a hoof in water, in a river,
    // inside a site's clearing or back inside the farm's ground
    const step = rm.speed * dt;
    const nx = p.x + Math.cos(rm.heading) * step;
    const nz = p.z + Math.sin(rm.heading) * step;
    const s = field.sampleAt(nx, nz);
    if (blockedAt(nx, nz, s, w.ctx)) {
      rm.heading += TURN_AWAY;
      stats.blockedSteps++;
    } else {
      p.x = nx; p.z = nz; p.y = s.h;
      w.groundY = s.h;
    }
    model.rotation.y = Math.atan2(-Math.sin(rm.heading), Math.cos(rm.heading));

    // gait: the farm's leg swing, faster when bolting
    const gait = (fleeing || raging) ? 70 : 150;
    const swing = Math.sin(now / gait + rm.ph) * ((fleeing || raging) ? 0.8 : 0.5);
    if (rm.legs[0]) rm.legs[0].rotation.x = swing;
    if (rm.legs[3]) rm.legs[3].rotation.x = swing;
    if (rm.legs[1]) rm.legs[1].rotation.x = -swing;
    if (rm.legs[2]) rm.legs[2].rotation.x = -swing;
    if (rm.head) rm.head.rotation.x = Math.sin(now / 600 + rm.ph) * 0.05;

    if (!fleeing && !raging && rm.t0 > rm.until) {
      if (rm.restless) {
        // a rabbit never rests. It darts somewhere else instead.
        rm.heading = Math.random() * Math.PI * 2;
        rm.t0 = 0; rm.until = 500 + Math.random() * 1100;
      } else {
        rm.state = 'graze'; rm.t0 = 0; rm.until = 2500 + Math.random() * 4000;
      }
    }
  }

  function stepFlying(model, dt, now) {
    const f = model.userData.fly;
    f.ang += f.w * dt;
    const x = f.cx + Math.cos(f.ang) * f.r;
    const z = f.cz + Math.sin(f.ang) * f.r;
    model.position.set(x, f.h + Math.sin(now / 1400 + f.ph) * 1.6, z);
    // the tangent of the circle is the way it is going; the model faces +x
    const dx = -Math.sin(f.ang) * Math.sign(f.w), dz = Math.cos(f.ang) * Math.sign(f.w);
    model.rotation.y = Math.atan2(-dz, dx);
    const wantBank = Math.max(-0.5, Math.min(0.5, -f.w * 1.6));
    f.bank += (wantBank - f.bank) * 0.08;
    model.rotation.z = f.bank;
    const flap = Math.sin(now / f.flapSpeed + f.ph);
    if (f.wings.left) f.wings.left.rotation.z = flap * 0.85;
    if (f.wings.right) f.wings.right.rotation.z = -flap * 0.85;
  }

  return {
    group, stats, live, animals,

    /** chunks.js: a chunk was meshed (or re-meshed at another resolution). */
    onChunk(cx, cz) { built.add(cx + ',' + cz); },

    /** chunks.js: a chunk was disposed. Its animals go with it. */
    offChunk(cx, cz) {
      const key = cx + ',' + cz;
      built.delete(key);
      dropChunk(key);
    },

    /**
     * Every frame. dt in seconds, nowMs in milliseconds, the player at
     * (centerX, centerZ), `night` true while the predators are out.
     */
    update(dt, nowMs, centerX, centerZ, night = false) {
      if (centerX === undefined || centerZ === undefined) return;
      const [pcx, pcz] = field.chunkOf(centerX, centerZ);
      const moved = !lastChunk || lastChunk[0] !== pcx || lastChunk[1] !== pcz;
      const flipped = night !== lastNight;
      if (moved || flipped || nowMs - lastScan >= SCAN_MS) {
        lastScan = nowMs; lastChunk = [pcx, pcz]; lastNight = night;
        stats.night = night;
        // anything outside the near ring leaves
        for (const [key, entry] of [...live]) {
          if (Math.abs(entry.cx - pcx) > ring || Math.abs(entry.cz - pcz) > ring) dropChunk(key);
        }
        // every built chunk in the near ring rolls its animals once, then the
        // cap decides which of them are actually standing there
        for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
          const cx = pcx + dx, cz = pcz + dz;
          if (built.has(cx + ',' + cz)) addChunk(cx, cz);
        }
        rescan(centerX, centerZ, night);
      }
      const step = Math.min(0.05, Math.max(0, dt));
      for (let i = animals.length - 1; i >= 0; i--) {
        const model = animals[i];
        if (model.userData.fly) stepFlying(model, step, nowMs);
        else stepGround(model, step, nowMs, centerX, centerZ);
      }
    },

    /**
     * The models the bow may shoot: alive, on the ground, carrying a hit column.
     * farm.js reads `.userData.hit` off each of these, exactly as it does for
     * its own deer.
     */
    targets() {
      const out = [];
      for (const m of animals) {
        const rm = m.userData.roam;
        if (!rm || !m.userData.hit || !m.visible) continue;
        if (rm.state === 'dead' || rm.state === 'respawning') continue;
        out.push(m);
      }
      return out;
    },

    /** Everything alive right now, flying included. Debug and tests. */
    all() { return animals.slice(); },

    dispose() {
      for (const key of [...live.keys()]) dropChunk(key);
      const kill = (m) => m.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => mm.dispose());
      });
      for (const spares of pool.values()) for (const m of spares) kill(m);
      for (const m of animals) { group.remove(m); kill(m); }
      animals.length = 0;
      pool.clear();
      built.clear();
      scene.remove(group);
    },
  };
}
