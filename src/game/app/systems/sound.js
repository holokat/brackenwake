import { bedFor, LIBRARY_DIR } from '../../audio.js';
import { phaseAt } from '../../dayclock.js';
import { SPACES } from '../../../mmo/spaces/index.js';
import { ROUTES } from '../../../mmo/greenwold/routes.js';

const SOURCE_URL = {
  forge: `${LIBRARY_DIR}src-forge.mp3`,
  tavern: `${LIBRARY_DIR}src-tavern-inside.mp3`,
  mill: `${LIBRARY_DIR}src-mill-wheel.mp3`,
};

const dist = (a, b, c, d) => Math.hypot((a ?? 0) - (c ?? 0), (b ?? 0) - (d ?? 0));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function pointSegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  if (!(l2 > 0)) return dist(px, pz, ax, az);
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / l2);
  return dist(px, pz, ax + dx * t, az + dz * t);
}

export function nearRoad(x, z, reach = 5, routes = ROUTES) {
  for (const r of routes || []) {
    const pts = r.points || [];
    for (let i = 1; i < pts.length; i++) {
      if (pointSegDist(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= reach + (r.width || 3) / 2) return true;
    }
  }
  return false;
}

export function treeCoverAt(runtime, x, z) {
  try {
    const flora = runtime?.flora;
    const trees = typeof flora?.treesFor === 'function'
      ? flora.treesFor(Math.floor(x / (runtime.field?.chunk || 64)), Math.floor(z / (runtime.field?.chunk || 64)))
      : [];
    return (trees || []).filter((t) => !t.felledUntil && dist(x, z, t.x, t.z) <= 12).length >= 3;
  } catch { return false; }
}

export function siteFlags(sites = []) {
  const flags = { nearMine: false, nearBanditCamp: false, nearLegionCamp: false };
  for (const s of sites || []) {
    if (s.kind === 'mine' || s.kind === 'cave' || /chalkpits|greenwoldpits/.test(s.sub || s.id || '')) flags.nearMine = true;
    if (s.kind === 'bandit_camp' || /highwaymanshollow/.test(s.sub || s.id || '')) flags.nearBanditCamp = true;
    if (s.kind === 'legion_camp' || /kingsroad_camp|legion/.test(s.sub || s.id || '')) flags.nearLegionCamp = true;
  }
  return flags;
}

export function waterFlags(sample = {}) {
  if (sample.river > 0) return { nearRiver: true, nearWaterMeadow: false };
  if (sample.water) return { nearRiver: false, nearWaterMeadow: true };
  return { nearRiver: false, nearWaterMeadow: false };
}

export function nearestWaterFlags(field, x, z, sample = {}) {
  const scan = [
    [0, 0], [12, 0], [-12, 0], [0, 12], [0, -12],
    [18, 18], [18, -18], [-18, 18], [-18, -18],
    [25, 0], [-25, 0], [0, 25], [0, -25],
  ];
  let nearStillWater = false, nearRiver = false;
  for (const [dx, dz] of scan) {
    const s = dx || dz ? field?.sampleAt?.(x + dx, z + dz) || {} : sample;
    if ((s.river ?? 0) > 0.05) nearRiver = true;
    if (s.water) nearStillWater = true;
  }
  return { nearStillWater, nearRiver, nearWaterMeadow: nearStillWater && !nearRiver };
}

export function soundContext(ctx, frame, pos) {
  const world = ctx.get('world');
  const runtime = world.runtime;
  const now = frame.worldNow ?? frame.now;
  const sample = runtime.field?.sampleAt?.(pos.x, pos.z) || {};
  const settlement = world.nearestSettlement?.();
  const inSettlement = !!(settlement && dist(pos.x, pos.z, settlement.x, settlement.z) <= (settlement.flatR || 0) + 20);
  const sites = typeof runtime.sitesNear === 'function' ? runtime.sitesNear(pos.x, pos.z, 35) : [];
  const phase = phaseAt(now + (ctx.sc?.clockOffset || 0));
  const hour = phase * 24;
  const weatherHidden = !!runtime.inDungeon || !!world.underwater;
  const rain = weatherHidden ? 0 : world.weather?.state?.rain ?? 0;
  const snow = weatherHidden ? 0 : world.weather?.state?.snow ?? 0;
  const cover = treeCoverAt(runtime, pos.x, pos.z);
  const water = nearestWaterFlags(runtime.field, pos.x, pos.z, sample);
  const pointNear = (rows, r) => rows.some((p) => dist(pos.x, pos.z, p.x, p.z) <= r);
  const monsters = ctx.has('combat') ? ctx.get('combat').monsters : null;
  const nearFauna = [];
  try {
    for (const m of monsters?.all?.() || []) {
      const id = m.id || m.kind || m.rec?.id;
      const mp = m.pos || m.position || m.group?.position;
      if (['boar', 'badger', 'goose'].includes(id) && mp && dist(pos.x, pos.z, mp.x, mp.z) <= 24) nearFauna.push(id);
    }
  } catch {}
  return {
    x: pos.x, z: pos.z, now, hour,
    night: ctx.isNight(now),
    dawn: hour >= 5 && hour <= 7,
    dusk: hour >= 17.75 && hour <= 18.25,
    midnight: hour <= 0.25 || hour >= 23.75,
    settlement: inSettlement ? settlement : null,
    inDungeon: !!runtime.inDungeon,
    underwater: !!world.underwater,
    raining: rain > 0.18,
    rainValue: rain,
    snowing: snow > 0.18,
    snowValue: snow,
    treeCover: cover,
    highChalk: sample.biome === 'mountain' || (sample.h ?? 0) >= (runtime.field?.seaLevel ?? 0) + 60,
    nearRoad: nearRoad(pos.x, pos.z),
    chapelNear: pointNear(AUTHORED_CHAPELS, 80),
    sunkenChapelNear: pointNear(AUTHORED_SUNKEN_CHAPELS, 80),
    mereNear: pointNear(AUTHORED_SUNKEN_CHAPELS, 30),
    gateNear: pointNear(AUTHORED_GATES, 1.5),
    nearFauna: [...new Set(nearFauna)],
    inField: sample.ground === 'field' || sample.ground === 'wheat' || sample.land === 'field',
    wading: !!sample.water && !world.underwater,
    biome: sample.biome || 'meadow',
    ...water,
    ...siteFlags(sites),
  };
}

export function piecePoints(modelRe, spaces = SPACES) {
  const out = [];
  for (const s of Object.values(spaces || {})) {
    for (const p of s.pieces || []) {
      if (!modelRe.test(p.model || '')) continue;
      out.push({ id: `${s.id}:${p.model}:${out.length}`, x: s.at.x + (p.x || 0), z: s.at.z + (p.z || 0), model: p.model, space: s.id });
    }
  }
  return out;
}

const AUTHORED_INNS = piecePoints(/^inn$/);
const AUTHORED_MILLS = piecePoints(/^mill_wheel$/);
const AUTHORED_CHAPELS = piecePoints(/^chapel$/);
const AUTHORED_SUNKEN_CHAPELS = piecePoints(/^chapel_sunken$/);
const AUTHORED_GATES = piecePoints(/gate/i);

export function sourcePositions(ctx, pos) {
  const life = ctx.has('world_life') ? ctx.get('world_life') : null;
  const workshop = life?.stations?.nearest?.(pos, 700, 'workshop') || life?.stations?.nearest?.(pos, 700, 'forge');
  const out = [];
  if (workshop) out.push({ id: 'forge', url: SOURCE_URL.forge, x: workshop.x, z: workshop.z, how: 'live station row' });
  const nearest = (rows) => rows.sort((a, b) => dist(pos.x, pos.z, a.x, a.z) - dist(pos.x, pos.z, b.x, b.z))[0];
  const inn = nearest([...AUTHORED_INNS]);
  const mill = nearest([...AUTHORED_MILLS]);
  if (inn) out.push({ id: 'tavern', url: SOURCE_URL.tavern, x: inn.x, z: inn.z, how: 'space piece offset from space origin' });
  if (mill) out.push({ id: 'mill', url: SOURCE_URL.mill, x: mill.x, z: mill.z, how: 'space piece offset from space origin' });
  return out;
}

/**
 * True when the player's last step was refused and what refused it was a
 * hedge: the rig records where the step wanted to go (player.js), and the
 * collision index says what stands there. Pure enough to drive with fakes.
 */
export function hedgeBlocked(ctx, player, pos) {
  const st = player?.rig?.state;
  if (!st || !st.blocked || !st.blockedAt) return false;
  const phys = ctx.get?.('world')?.runtime?.physical;
  if (!phys || typeof phys.at !== 'function') return false;
  const body = phys.at(st.blockedAt.x, (pos.y ?? st.y ?? 0) + 0.5, st.blockedAt.z);
  return !!(body && /hedge/i.test(String(body.model || body.kindId || '')));
}

export function createShotScheduler(audio, opts = {}) {
  const random = opts.random || Math.random;
  const next = {};
  let lastRain = 0, bellDay = null, mistDay = null, stride = 0, last = null, wasGateNear = false, lastHedge = -Infinity;
  const rnd = (a, b) => a + random() * (b - a);
  const due = (name, now, a, b) => {
    if (!(name in next)) { next[name] = now + rnd(a, b); return false; }
    if (next[name] <= now) { next[name] = now + rnd(a, b); return true; }
    return false;
  };
  const fire = (name, ctx, o = {}) => audio?.playLibrary?.(name, { at: { x: ctx.x, z: ctx.z }, ...o });
  return {
    step(ctx) {
      const now = ctx.now || 0;
      if (last) {
        const d = dist(ctx.x, ctx.z, last.x, last.z);
        stride += d;
        if (stride >= 1.35) {
          stride = 0;
          if (ctx.inField) fire('wheatWalk', ctx);
          if (ctx.wading) fire('splashWade', ctx);
        }
      }
      last = { x: ctx.x, z: ctx.z };
      if (ctx.gateNear && !wasGateNear) fire('gateSwing', ctx);
      // pushing through a hedge: the player's step was refused by a hedge
      // collider while he kept walking into it; at most one push a second
      if (ctx.hedgeBlocked && now - lastHedge >= 900) { lastHedge = now; fire('hedgePush', ctx); }
      wasGateNear = !!ctx.gateNear;
      const outdoors = !ctx.inDungeon && !ctx.underwater;
      if (outdoors && due('windGust', now, 25_000, 70_000)) fire('windGust', ctx);
      if (ctx.night && (ctx.biome === 'meadow' || ctx.treeCover)) {
        if (due('owl', now, 35_000, 95_000)) fire('owl', ctx);
        if (due('fox', now, 55_000, 130_000)) fire('fox', ctx);
      }
      if (!ctx.night && (ctx.biome === 'meadow' || ctx.treeCover)) {
        if (ctx.treeCover && due('woodpecker', now, 45_000, 140_000)) fire('woodpecker', ctx);
        if (due('crowFlock', now, 70_000, 180_000)) fire('crowFlock', ctx);
      }
      if (outdoors && !ctx.snowing && lastRain <= 0.18 && ctx.rainValue > 0.18) fire('distantThunder', ctx);
      lastRain = ctx.rainValue;
      if (ctx.settlement && ctx.nearRoad && !ctx.night && due('cartPass', now, 150_000, 260_000)) fire('cartPass', ctx);
      // a heron lifts off the water by day: the plan's water meadow flavour, given a trigger (2026-09-08)
      if ((ctx.nearRiver || ctx.nearWaterMeadow) && !ctx.night && due('heron', now, 60_000, 150_000)) fire('heron', ctx);
      const day = Math.floor(now / 1_500_000);
      if (ctx.dusk && ctx.chapelNear && bellDay !== day) { bellDay = day; fire('churchBell', ctx); }
      if (ctx.midnight && ctx.sunkenChapelNear && bellDay !== `sunken:${day}`) { bellDay = `sunken:${day}`; fire('churchBell', ctx, { rate: 0.8, gain: 0.5 }); }
      if (ctx.midnight && ctx.mereNear && mistDay !== day) { mistDay = day; fire('mistRise', ctx); }
      for (const fauna of ctx.nearFauna || []) {
        if (fauna === 'boar' && due('boar', now, 50_000, 130_000)) fire('boar', ctx);
        if (fauna === 'badger' && due('badger', now, 50_000, 130_000)) fire('badger', ctx);
        if (fauna === 'goose' && due('goose', now, 50_000, 130_000)) fire('goose', ctx);
      }
    },
    trigger(name, at, o = {}) { return audio?.playLibrary?.(name, { at, ...o }); },
    next,
  };
}

export const sound = {
  name: 'sound',
  deps: ['world', 'player', 'ui'],

  create(ctx) {
    const scheduler = createShotScheduler(ctx.audio);
    let context = null, sampleAt = -Infinity;
    const stats = ctx.audio.stats;
    return {
      scheduler,
      get context() { return context; },
      update(frame) {
        const player = ctx.get('player');
        const pos = player.pos || player.actor?.pos || frame.centre;
        if (!pos) return;
        const now = frame.worldNow ?? frame.now;
        for (const s of sourcePositions(ctx, pos)) ctx.audio.source?.update?.(s.id, s.url, s);
        if (now - sampleAt < 1000 && context) return;
        sampleAt = now;
        context = soundContext(ctx, frame, pos);
        context.hedgeBlocked = hedgeBlocked(ctx, player, pos);
        ctx.audio.music.setContext({ settlement: !!context.settlement, night: context.night });
        ctx.audio.music.setAmbience(bedFor(context));
        scheduler.step(context);
      },
      bw: { sound: { get context() { return context; }, scheduler }, audio: ctx.audio, get audioStats() { return stats; } },
    };
  },

  update(ctx, frame) { ctx.get('sound').update(frame); },
};
