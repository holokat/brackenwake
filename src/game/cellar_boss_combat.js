import { getCellarBoss } from '../mmo/cellar_bosses.js';

const point = p => ({ x: p.x, y: p.y || 0, z: p.z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const offset = (p, yaw, along, across = 0) => ({
  x: p.x + Math.sin(yaw) * along + Math.cos(yaw) * across,
  y: p.y || 0, z: p.z + Math.cos(yaw) * along - Math.sin(yaw) * across,
});
export const CELLAR_ARENA = Object.freeze({ halfWidth: 29, halfDepth: 22, centreOffsetZ: -6, leashMs: 2000 });
export function insideCellarArena(pos, home) {
  return Math.abs(pos.x - home.x) <= CELLAR_ARENA.halfWidth
    && Math.abs(pos.z - home.z - CELLAR_ARENA.centreOffsetZ) <= CELLAR_ARENA.halfDepth
    && Math.abs((pos.y || 0) - (home.y || 0)) < 4;
}

/** Shared by rendering and damage. Boundaries belong to the danger region. */
export function cellarShapeContains(shape, pos) {
  if (!shape || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
  if (Math.abs((pos.y || 0) - (shape.y || 0)) > 4) return false;
  const dx = pos.x - shape.x, dz = pos.z - shape.z;
  const r = Math.hypot(dx, dz);
  switch (shape.kind) {
    case 'circle': return r <= shape.radius;
    case 'ring': return r >= shape.inner && r <= shape.radius;
    case 'cone': return r <= shape.radius && (r < 1e-8
      || (dx * Math.sin(shape.yaw) + dz * Math.cos(shape.yaw)) / r >= Math.cos(shape.halfAngle) - 1e-9);
    case 'lane': {
      const along = dx * Math.sin(shape.yaw) + dz * Math.cos(shape.yaw);
      const across = dx * Math.cos(shape.yaw) - dz * Math.sin(shape.yaw);
      return Math.abs(along) <= shape.length / 2 && Math.abs(across) <= shape.width / 2;
    }
    case 'sanctuary': return Math.abs(dx) <= shape.halfWidth && Math.abs(dz - shape.offsetZ) <= shape.halfDepth
      && distance(pos, shape.safe) >= shape.safe.radius;
    default: return false;
  }
}

export function createCellarBossState(id) {
  if (!getCellarBoss(id)) return null;
  return { id, run: 0, serial: 0, phase: 0, active: false, pending: [], attack: null,
    rotation: 0, nextAt: 0, outsideSince: null, lastNow: -Infinity };
}

/** Cancel every owned hazard. Runs remain monotonic to prevent event ID reuse. */
export function resetCellarBoss(state, now = 0) {
  const events = state.pending.map(mark => ({ type: 'cancel', mark }));
  state.pending = []; state.attack = null; state.active = false; state.phase = 0;
  state.rotation = 0; state.nextAt = now + 1100; state.outsideSince = null;
  state.run++; state.lastNow = now;
  events.push({ type: 'reset' });
  return events;
}

function placeTarget(target, home, margin = 0) {
  return {
    x: Math.max(home.x - CELLAR_ARENA.halfWidth + margin, Math.min(home.x + CELLAR_ARENA.halfWidth - margin, target.x)),
    y: home.y || 0,
    z: Math.max(home.z - 6 - CELLAR_ARENA.halfDepth + margin, Math.min(home.z - 6 + CELLAR_ARENA.halfDepth - margin, target.z)),
  };
}

/** An attack is a schedule of actual regions, including their staggered impacts. */
function beginAttack(state, def, now, origin, target, home) {
  const spec = def.attacks[state.rotation % def.attacks.length];
  const phase = state.phase, yaw = yawTo(origin, target);
  const cast = { spec, yaw, started: now, end: now, tracking: null, number: state.rotation++ };
  const marks = [];
  const add = (shape, delay = 0, extra = {}) => {
    const mark = { id: `${state.id}:${state.run}:${++state.serial}`, attackId: spec.id,
      name: spec.name, animation: spec.animation, colour: def.colour, born: now, impactAt: now + spec.warnMs + delay,
      damageScale: spec.damageScale * (1 + phase * .08), damageType: spec.damageType,
      shape, ...extra };
    marks.push(mark); cast.end = Math.max(cast.end, mark.impactAt); return mark;
  };
  const circle = (p, radius, delay = 0, extra) => add({ kind: 'circle', ...point(p), radius }, delay, extra);
  const ring = (inner, radius, delay) => add({ kind: 'ring', ...point(origin), inner, radius }, delay);
  const lane = (p, angle, length, width, delay = 0) => add({ kind: 'lane', ...point(p), yaw: angle, length, width }, delay);
  const cone = (angle, radius, halfAngle, delay = 0) => add({ kind: 'cone', ...point(origin), yaw: angle, radius, halfAngle }, delay);
  const tracking = (count, every, radius) => {
    cast.tracking = { left: count, nextAt: now, every, radius, index: 0 };
    cast.end = now + (count - 1) * every + spec.warnMs;
  };

  switch (spec.pattern) {
    case 'tidal':
      ring(8, 20, 0); ring(0, 8, 1200);
      if (phase >= 1) ring(8, 20, 2600);
      break;
    case 'jets':
      for (let i = -1; i <= 1; i++) lane(offset(origin, yaw + i * .35, 11), yaw + i * .35, 22, 2.4 + phase * .3, Math.abs(i) * 350);
      break;
    case 'brood':
      for (let i = 0; i < def.summon.count + (phase === 2 ? 1 : 0); i++) {
        const p = offset(origin, yaw, 7, (i - (phase === 2 ? 1 : .5)) * 9);
        circle(p, 3, i * 300, { summon: def.summon.id });
      }
      break;
    case 'bells':
      ring(0, 9, 0); ring(9, 23, 1400);
      if (phase >= 1) ring(0, 9, 2800);
      break;
    case 'hammer':
      lane(offset(origin, yaw, 11), yaw, 22, 5 + phase, 0);
      if (phase === 2) circle(offset(origin, yaw, 17), 5, 1000);
      break;
    case 'silence': tracking(1 + phase, 650, 3.5); break;
    case 'sweep':
      cone(yaw - .6, 18, .65, 0); cone(yaw + .6, 18, .65, 1050);
      if (phase >= 1) cone(yaw + 1.8, 18, .6, 2100);
      break;
    case 'cinders': tracking(2 + phase, 650, 3.2); break;
    case 'pulse': circle(origin, 11 + phase * 1.5); break;
    case 'chains':
      lane(home, .4, 48, 3.3, 0); lane(home, .4 + Math.PI / 2, 48, 3.3, 800);
      if (phase >= 1) lane(offset(home, .4, 0, 9), .4, 44, 3.3, 1700);
      break;
    case 'books': tracking(2 + phase, 800, 3.6); break;
    case 'sanctuary': {
      const side = ((Math.floor(cast.number / 3) + phase) % 2) ? -1 : 1;
      const safe = { ...point(home), x: home.x + side * 9, z: home.z - 3, radius: 5 };
      add({ kind: 'sanctuary', ...point(home), halfWidth: CELLAR_ARENA.halfWidth,
        halfDepth: CELLAR_ARENA.halfDepth, offsetZ: CELLAR_ARENA.centreOffsetZ, safe });
      break;
    }
    case 'tombs':
      for (let i = 0; i < 3 + phase; i++) {
        const p = i === 0 ? placeTarget(target, home) : placeTarget(offset(target, yaw, (i % 2 ? 1 : -1) * 7, (i - 2) * 6), home);
        lane(p, yaw + (i % 2) * Math.PI / 2, 7, 5, i * 450);
      }
      break;
    case 'gravity':
      ring(0, 6, 0); ring(6, 13, 1150); ring(13, 23, 2300);
      if (phase === 2) circle(origin, 7, 3500);
      break;
    case 'crush': lane(offset(origin, yaw, 10), yaw, 20, 9 + phase); break;
    case 'cleave':
      cone(yaw, 22, Math.PI * .43, 0);
      if (phase >= 1) cone(yaw + Math.PI, 22, Math.PI * .36, 1500);
      break;
    case 'cross':
      lane(home, 0, 44, 4.2, 0); lane(home, Math.PI / 2, 54, 4.2, 0);
      if (phase === 2) { lane(home, Math.PI / 4, 44, 3, 1600); lane(home, -Math.PI / 4, 44, 3, 1600); }
      break;
    case 'collapse': tracking(4 + phase, 720, 4.1); break;
    default: throw new Error(`Unknown cellar boss pattern: ${spec.pattern}`);
  }
  return { cast, marks };
}

/** Pure encounter clock; the runtime routes impacts through combat.queueSpell. */
export function stepCellarBoss(state, { now, actor, target, home = actor.ai.home }) {
  if (!state || !Number.isFinite(now) || now < state.lastNow) return [];
  const def = getCellarBoss(state.id), events = [];
  state.lastNow = now;
  const valid = target && target.health > 0 && target.pos && target !== actor;
  if (actor.health <= 0 || !valid) return state.active || state.pending.length ? resetCellarBoss(state, now) : [];
  const inArena = insideCellarArena(target.pos, home);
  if (!inArena) {
    if (state.active) {
      state.outsideSince ??= now;
      if (now - state.outsideSince >= CELLAR_ARENA.leashMs) return resetCellarBoss(state, now);
    }
    return events;
  }
  state.outsideSince = null;
  if (!state.active) {
    if (distance(actor.pos, target.pos) > 25 && actor.health >= actor.maxHealth) return events;
    state.active = true; state.nextAt = now + 1100;
    events.push({ type: 'engage' });
  }
  const ratio = actor.health / actor.maxHealth;
  const phase = ratio < .33 ? 2 : ratio < .66 ? 1 : 0;
  while (state.phase < phase) events.push({ type: 'phase', phase: ++state.phase, ...def.phases[state.phase - 1] });

  // Leaving the arena pauses impact, but re-entry cannot replay expired damage.
  // Skip cancelled stale marks rather than striking without a visible warning.
  for (let i = state.pending.length - 1; i >= 0; i--) {
    const mark = state.pending[i];
    if (now < mark.impactAt) continue;
    state.pending.splice(i, 1);
    events.push({ type: now - mark.impactAt > 750 ? 'cancel' : 'impact', mark });
  }
  if (!state.attack && now >= state.nextAt && !(actor.status?.stun?.until > now)) {
    const { cast, marks } = beginAttack(state, def, now, actor.pos, target.pos, home);
    state.attack = cast; state.pending.push(...marks);
    events.push({ type: 'attack', spec: cast.spec, yaw: cast.yaw });
    for (const mark of marks) events.push({ type: 'telegraph', mark });
  }
  const track = state.attack?.tracking;
  if (track?.left > 0 && now >= track.nextAt) {
    const spec = state.attack.spec;
    const mark = { id: `${state.id}:${state.run}:${++state.serial}`, attackId: spec.id, name: spec.name,
      animation: spec.animation, colour: def.colour, born: now, impactAt: now + spec.warnMs,
      damageScale: spec.damageScale * (1 + state.phase * .08), damageType: spec.damageType,
      shape: { kind: 'circle', ...placeTarget(target.pos, home), radius: track.radius } };
    state.pending.push(mark); events.push({ type: 'telegraph', mark });
    track.left--; track.index++; track.nextAt = now + track.every;
    state.attack.end = Math.max(state.attack.end, mark.impactAt);
  }
  if (state.attack && !state.pending.length && !state.attack.tracking?.left && now >= state.attack.end) {
    state.attack = null; state.nextAt = now + (1700 - state.phase * 250);
    events.push({ type: 'recover' });
  }
  return events;
}
