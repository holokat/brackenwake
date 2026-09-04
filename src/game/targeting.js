// Who you mean when you press a key.
//
// Two questions, answered in this order and nowhere else:
//
//   1. is the cursor on something? that is what you meant.
//   2. if not, what is the nearest hostile thing in front of you, inside the
//      ability's range? that is what you probably meant.
//
// The first half of this file is pure: `pickTarget`, the cone test, the tier
// colour and the target frame data all run in node with plain `{x, z}` objects
// and no THREE. The second half, `createTargeting`, is the only part that owns
// a raycaster, because a cursor hit needs one.
//
// UNITS. Distances are metres, measured on the horizontal plane only: a bat
// three metres over your head is three metres away, not five, because the
// whole game's reach numbers are written for a person standing on ground.
// `halfAngle` is RADIANS from the facing, so the cone you can see is twice it.
// `yaw` is the game's yaw: forward is `(sin yaw, cos yaw)`, which is what
// `stepPlayer` writes and what `group.rotation.y` reads.

import * as THREE from 'three';
import { TIERS } from '../mmo/monsters.js';
import { WEAPON_SKILLS } from '../mmo/abilities.js';

/** 120 degrees of cone, the widest arc any ability in the tables uses (Sweep). */
export const DEFAULT_HALF_ANGLE = Math.PI / 3;

/** The lowest skill each monster tier is written against, from mmo/monsters TIERS. */
export const TIER_BANDS = Object.keys(TIERS)
  .map(Number).sort((a, b) => a - b).map((t) => TIERS[t].band[0]);

/**
 * The skills a monster measures you by. A grandmaster tailor is a beginner to
 * a wolf, so crafting is not in this list: only the things that swing, shoot
 * or cast.
 */
export const COMBAT_SKILLS = [
  ...WEAPON_SKILLS, 'wrestling', 'archery', 'marksmanship',
  'magery', 'mysticism', 'necromancy', 'chivalry',
];

/**
 * INVENTED, and said so here rather than left implicit. 06-ECONOMY-UI.md asks
 * for "level tier as a colour: grey, green, yellow, orange, red for far below
 * you to far above" and names no offsets, because a player has no tier: only
 * monsters carry one (0 to 5, plus 6 for bosses). Five words over a signed
 * difference gives exactly one reading, and this is it:
 *
 *   two tiers or more below you   grey
 *   one tier below                green
 *   your own tier                 yellow
 *   one tier above                orange
 *   two tiers or more above       red
 *
 * The colours are floaters.js's palette, so a grey "dodge" and a grey target
 * frame are the same grey.
 */
export const TIER_STEPS = [
  { offset: -2, key: 'trivial', colour: '#9aa0a6', word: 'far below you' },
  { offset: -1, key: 'easy', colour: '#7ee07a', word: 'below you' },
  { offset: 0, key: 'even', colour: '#ffd23f', word: 'your match' },
  { offset: 1, key: 'hard', colour: '#ff9a3c', word: 'above you' },
  { offset: 2, key: 'deadly', colour: '#ff5a4d', word: 'far above you' },
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The tier a skill value sits in, by the bands mmo/monsters.js publishes. */
export function tierForSkill(value) {
  const v = num(value);
  let t = 0;
  for (let i = 0; i < TIER_BANDS.length; i++) if (v >= TIER_BANDS[i]) t = i;
  return t;
}

/**
 * The player's tier: the best of the skills that fight, capped at 5. Tier 6 is
 * the boss band and shares its numbers with tier 5, so a grandmaster who was
 * allowed to land there would read every champion as his own colour.
 */
export const MAX_PLAYER_TIER = 5;
export function playerTier(character = {}) {
  const skills = character.skills || {};
  let best = 0;
  for (const id of COMBAT_SKILLS) best = Math.max(best, num(skills[id]));
  return Math.min(MAX_PLAYER_TIER, tierForSkill(best));
}

/** The step, colour and words for a monster of `tier` seen by a player of `mine`. */
export function tierColour(tier, mine = 0) {
  const d = clamp(Math.round(num(tier) - num(mine)), -2, 2);
  return TIER_STEPS[d + 2];
}

// --- the cone ----------------------------------------------------------------

/** Horizontal distance between two things with `.x` and `.z`. */
export function flatDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(num(b.x) - num(a.x), num(b.z) - num(a.z));
}

/**
 * Radians between the facing and the line to `p`, always 0 to PI. A thing at
 * your feet is straight ahead, because there is no direction to it.
 */
export function angleTo(pos, yaw, p) {
  const dx = num(p.x) - num(pos.x), dz = num(p.z) - num(pos.z);
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return 0;
  const fx = Math.sin(num(yaw)), fz = Math.cos(num(yaw));
  return Math.acos(clamp((fx * dx + fz * dz) / d, -1, 1));
}

/** Alive, hostile, and not you. */
export function isTargetable(a, self = null) {
  if (!a || a === self) return false;
  if (a.dead === true) return false;
  if (typeof a.health === 'number' && a.health <= 0) return false;
  if (a.faction && a.faction !== 'hostile') return false;
  return true;
}

/** Everything targetable inside the cone, nearest first. */
export function inCone(candidates, pos, yaw, range, halfAngle = DEFAULT_HALF_ANGLE, self = null) {
  const out = [];
  for (const c of candidates || []) {
    if (!isTargetable(c, self)) continue;
    const p = c.pos || c;
    const d = flatDistance(pos, p);
    if (!(d <= range)) continue;
    if (halfAngle < Math.PI && angleTo(pos, yaw, p) > halfAngle) continue;
    out.push({ actor: c, dist: d });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out;
}

/**
 * Pure. The one decision, and every refusal carries the words for it.
 *
 * `cursorHit`    the actor under the cursor this frame, or null
 * `candidates`   everything the world knows about, unfiltered
 * `nearestHostile` optional: the runtime's own search, used instead of the
 *                cone walk when it is given, so main.js and this file cannot
 *                disagree about who is nearest
 *
 * Returns `{ target, how, dist, reason }`. `how` is 'cursor', 'front' or
 * 'none'.
 */
export function pickTarget({
  cursorHit = null, candidates = [], pos = { x: 0, z: 0 }, yaw = 0,
  range = 20, halfAngle = DEFAULT_HALF_ANGLE, self = null, nearestHostile = null,
} = {}) {
  if (cursorHit && isTargetable(cursorHit, self)) {
    const d = flatDistance(pos, cursorHit.pos || cursorHit);
    if (d <= range) return { target: cursorHit, how: 'cursor', dist: d, reason: 'under the cursor' };
    return {
      target: null, how: 'none', dist: d,
      reason: `${cursorHit.name || 'it'} is ${d.toFixed(1)} m away and the reach is ${range} m`,
    };
  }

  if (typeof nearestHostile === 'function') {
    const found = nearestHostile(pos, yaw, range, halfAngle);
    if (found && isTargetable(found, self)) {
      return { target: found, how: 'front', dist: flatDistance(pos, found.pos || found), reason: 'nearest in front' };
    }
    return { target: null, how: 'none', dist: Infinity, reason: `nothing hostile within ${range} m in front of you` };
  }

  const list = inCone(candidates, pos, yaw, range, halfAngle, self);
  if (list.length) return { target: list[0].actor, how: 'front', dist: list[0].dist, reason: 'nearest in front' };
  return { target: null, how: 'none', dist: Infinity, reason: `nothing hostile within ${range} m in front of you` };
}

/**
 * What the HUD's target frame draws. Pure, so the frame can be checked in node.
 * Returns null for no target, which is how the HUD knows to hide it.
 */
export function targetFrame(target, character = {}) {
  if (!target) return null;
  const max = Math.max(1, num(target.maxHealth) || num(target.health) || 1);
  const health = clamp(num(target.health), 0, max);
  const tier = num(target.tier);
  const step = tierColour(tier, playerTier(character));
  return {
    name: target.name || 'something',
    health, maxHealth: max,
    fraction: health / max,
    tier,
    colour: step.colour,
    step: step.key,
    word: step.word,
    dead: health <= 0,
  };
}

// --- the raycasting half ------------------------------------------------------

/**
 * `createTargeting(sc, input, monsters)`. Raycasts the cursor every frame and
 * keeps `current`.
 *
 * `monsters` is W2's runtime: `targets()`, `pick(raycaster)` and
 * `nearestHostile(pos, yaw, range, halfAngle)`. Any of the three may be
 * missing and this degrades rather than throws: with no `pick` there is no
 * cursor target and the cone still answers.
 *
 * `opts.self` is the player actor, so he cannot target himself; `opts.hud`
 * gets a line every time the target changes, because a silent target change is
 * indistinguishable from a broken click.
 */
export function createTargeting(sc, input, monsters, opts = {}) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundHit = new THREE.Vector3();

  const self = opts.self || null;
  const hud = opts.hud || null;
  let current = null;
  let hover = null;
  let cycle = 0;
  let lastGround = { x: 0, y: 0, z: 0 };
  const listeners = [];

  const say = (text, kind) => { hud?.log ? hud.log(text, kind) : hud?.toast?.(text, kind); };

  function set(actor, how = 'set') {
    const was = current;
    current = isTargetable(actor, self) ? actor : null;
    if (current === was) return current;
    if (current) say(`Target: ${current.name || 'something'}.`, 'target');
    else if (was) say('Target cleared.', 'target');
    for (const fn of listeners) fn(current, how);
    return current;
  }

  function castCursor() {
    if (!monsters?.pick || !sc?.camera) return null;
    ndc.set(input?.pointer?.x ?? 0, input?.pointer?.y ?? 0);
    raycaster.setFromCamera(ndc, sc.camera);
    return monsters.pick(raycaster) || null;
  }

  /** Where the cursor meets the ground the player stands on. Null off the world. */
  function groundPoint(feetY = 0) {
    if (!sc?.camera) return null;
    ndc.set(input?.pointer?.x ?? 0, input?.pointer?.y ?? 0);
    raycaster.setFromCamera(ndc, sc.camera);
    groundPlane.constant = -feetY;
    const p = raycaster.ray.intersectPlane(groundPlane, groundHit);
    if (!p) return null;
    lastGround = { x: p.x, y: p.y, z: p.z };
    return lastGround;
  }

  function list() {
    const all = typeof monsters?.targets === 'function' ? monsters.targets() : [];
    return (all || []).filter((a) => isTargetable(a, self));
  }

  /**
   * The one door every ability goes through. Cursor first, then the cone.
   * Returns the same `{ target, how, dist, reason }` `pickTarget` does.
   */
  function acquire({ range = 20, halfAngle = DEFAULT_HALF_ANGLE, pos, yaw, preferCurrent = true } = {}) {
    const at = pos || opts.pos?.() || self?.pos || { x: 0, z: 0 };
    const face = yaw != null ? yaw : (opts.yaw?.() ?? self?.yaw ?? 0);
    if (preferCurrent && isTargetable(current, self) && flatDistance(at, current.pos || current) <= range) {
      return { target: current, how: 'current', dist: flatDistance(at, current.pos || current), reason: 'your target' };
    }
    return pickTarget({
      cursorHit: hover, candidates: list(), pos: at, yaw: face, range, halfAngle, self,
      nearestHostile: typeof monsters?.nearestHostile === 'function' ? monsters.nearestHostile : null,
    });
  }

  function update(dt) {
    hover = castCursor();
    // a target that died or walked out of the world stops being one, quietly
    if (current && !isTargetable(current, self)) set(null, 'gone');

    // click to target. A click on a monster takes it; a click on bare ground
    // lets it go, so there is always a way to stop looking at something.
    const click = input?.click;
    if (click && (click.button || 0) === 0) {
      if (hover) set(hover, 'click');
      else if (current && opts.clearOnMiss !== false) set(null, 'click');
    }
    if (input?.pressed?.('tab')) {
      const all = list().sort((a, b) => flatDistance(a.pos || a, opts.pos?.() || self?.pos || { x: 0, z: 0 })
        - flatDistance(b.pos || b, opts.pos?.() || self?.pos || { x: 0, z: 0 }));
      if (!all.length) say('Nothing to target.', 'bad');
      else {
        const at = current ? all.indexOf(current) : -1;
        cycle = (at + 1) % all.length;
        set(all[cycle], 'tab');
      }
    }
  }

  return {
    update, set, acquire, groundPoint, castCursor,
    clear: () => set(null, 'clear'),
    onChange(fn) { listeners.push(fn); },
    frame: (character) => targetFrame(current, character),
    get current() { return current; },
    get hover() { return hover; },
    get lastGround() { return lastGround; },
    dispose() { listeners.length = 0; current = null; hover = null; },
  };
}
