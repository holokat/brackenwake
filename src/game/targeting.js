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
import { conOf, conLabel, playerTier, tierForSkill, CON_SKILLS, MAX_PLAYER_TIER } from './con.js';
import { setAnger } from './floaters.js';
import { setCon as setRingCon } from './target_ring.js';

/** 120 degrees of cone, the widest arc any ability in the tables uses (Sweep). */
export const DEFAULT_HALF_ANGLE = Math.PI / 3;

// The con rule itself lives in con.js and is not copied here. These four are
// re-exported so a caller that already has targeting.js does not need a second
// import to ask how dangerous the thing in front of it is.
export { conOf, conLabel, playerTier, tierForSkill, CON_SKILLS, MAX_PLAYER_TIER };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

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
  // Sanctuary: "five metres where nothing can be attacked". `actor.powers`
  // carries the word, put there by actor.js's recompute out of the buff's own
  // `mods.untargetable`, so the cursor and every ability that goes through
  // pickTarget refuse it with one line rather than eleven.
  if (Array.isArray(a.powers) && a.powers.includes('untargetable')) return false;
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
    // `outOfRange` is named so a caller can tell "too far" from "nothing
    // there". They want different words and different behaviour: one is a
    // distance to walk, the other is a question about who you meant.
    return {
      target: null, how: 'none', dist: d, outOfRange: true, blocked: cursorHit,
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
 *
 * The colour, the word and the skull are con.js's, so the frame, the world
 * nameplate, the hover line and the ring cannot disagree about one monster.
 */
export function targetFrame(target, character = {}) {
  if (!target) return null;
  const max = Math.max(1, num(target.maxHealth) || num(target.health) || 1);
  const health = clamp(num(target.health), 0, max);
  const c = conOf(target, character);
  return {
    name: target.name || 'something',
    health, maxHealth: max,
    fraction: health / max,
    tier: c.tier,
    colour: c.colour,
    level: c.level,
    word: c.word,
    skull: c.skull,
    dead: health <= 0,
  };
}

// --- the nameplate over the target -------------------------------------------
//
// How high over the target's feet the plate hangs. A boss already wears
// monsters.js's own canvas sprite at `model.height + PLATE_LIFT` (1.1 m) with
// a sprite 0.7 m tall, so the top of that sprite is model.height + 1.45; the
// boss lift here is 1.9 so the two labels do not sit on each other. Everything
// else has nothing over its head and takes the smaller lift.
export const PLATE_LIFT = 0.55;
export const BOSS_PLATE_LIFT = 1.9;
/** Used when the monster runtime cannot say how tall the body is. */
export const DEFAULT_BODY_HEIGHT = 2;

const projected = new THREE.Vector3();

/**
 * Where a world point lands on a `width` by `height` screen, in pixels from
 * the top left. `visible` is false behind the camera, which is the case a
 * plate that only checked x and y would draw upside down behind the player.
 * Exported so the nameplate's path can be walked in node with a real camera.
 */
export function screenOf(camera, point, width, height) {
  if (!camera || !point || !(width > 0) || !(height > 0)) return { x: 0, y: 0, visible: false };
  projected.set(num(point.x), num(point.y), num(point.z)).project(camera);
  return {
    x: (projected.x + 1) / 2 * width,
    y: (1 - projected.y) / 2 * height,
    visible: projected.z <= 1 && Number.isFinite(projected.x) && Number.isFinite(projected.y),
  };
}

/**
 * Everything the HUD needs to draw the plate over one target: the name, the
 * con colour, the word, whether a skull goes before the name, and where on
 * the screen it sits. Null when there is nothing to draw, which is how the
 * HUD knows to hide it.
 *
 * `bodyHeight` is the model's own height when the monster runtime knows it.
 */
/**
 * The marks on a target that are still running at `now` (seconds on the
 * abilities' clock), as the words the plate prints: "Hunter's Mark 57 s".
 */
export function marksOn(target, now) {
  const list = target && Array.isArray(target.marks) ? target.marks : [];
  const t = num(now);
  return list.filter((m) => m && (!Number.isFinite(t) || !Number.isFinite(m.until) || m.until > t))
    .map((m) => ({ id: m.abilityId, name: m.name || m.abilityId || 'marked', left: Number.isFinite(m.until) && Number.isFinite(t) ? Math.max(0, Math.ceil(m.until - t)) : null }));
}
export function nameplateOf(target, character, camera, width, height, bodyHeight, now = NaN) {
  if (!target) return null;
  if (num(target.health) <= 0 || target.dead === true) return null;
  const c = conOf(target, character);
  const p = target.pos || target;
  const top = num(bodyHeight) > 0 ? num(bodyHeight) : DEFAULT_BODY_HEIGHT;
  const lift = c.level === 'boss' ? BOSS_PLATE_LIFT : PLATE_LIFT;
  const at = screenOf(camera, { x: num(p.x), y: num(p.y) + top + lift, z: num(p.z) }, width, height);
  if (!at.visible) return null;
  return {
    name: target.name || 'something',
    colour: c.colour, word: c.word, level: c.level, skull: c.skull,
    x: at.x, y: at.y,
    // what you have done to it that is still running: a mark is a debuff the
    // plate should show, or the player cannot tell it landed
    tags: marksOn(target, now).map((m) => (m.left != null ? `${m.name} ${m.left} s` : m.name)),
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
  let plate = null;
  const listeners = [];

  /**
   * The size of the canvas the world is drawn on, in CSS pixels, because that
   * is the box the HUD's own layer covers. `opts.viewport` overrides it, which
   * is how the node test drives the plate with no renderer.
   */
  function viewport() {
    if (typeof opts.viewport === 'function') return opts.viewport() || { width: 0, height: 0 };
    const cv = sc?.renderer?.domElement;
    if (!cv) return { width: 0, height: 0 };
    return { width: cv.clientWidth || cv.width || 0, height: cv.clientHeight || cv.height || 0 };
  }

  /** How tall the target's body is, from W2's model, when W2 is there to ask. */
  function bodyHeight(actor) {
    const mon = typeof monsters?.forActor === 'function' ? monsters.forActor(actor) : null;
    return num(mon?.model?.height) || DEFAULT_BODY_HEIGHT;
  }

  const say = (text, kind) => { hud?.log ? hud.log(text, kind) : hud?.toast?.(text, kind); };

  /** MP1: another player, a summon or the dragon may be chosen, for a heal or a blessing. */
  function isFriendly(a) {
    return !!a && a !== self && (a.faction === 'player' || a.faction === 'ally') && num(a.health) > 0 && a.dead !== true;
  }

  function set(actor, how = 'set') {
    const was = current;
    current = isTargetable(actor, self) || isFriendly(actor) ? actor : null;
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
    // W2's pick returns the monster record; the frame and the resolver want its actor
    const hit = monsters.pick(raycaster);
    return hit ? (hit.actor || hit) : null;
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
    const all = typeof monsters?.actors === 'function' ? monsters.actors()
      : typeof monsters?.targets === 'function' ? monsters.targets() : [];
    return (all || []).filter((a) => isTargetable(a, self));
  }

  /**
   * The one door every ability goes through. Cursor first, then the cone.
   * Returns the same `{ target, how, dist, reason }` `pickTarget` does.
   */
  function acquire({ range = 20, halfAngle = DEFAULT_HALF_ANGLE, pos, yaw, preferCurrent = true } = {}) {
    const at = pos || opts.pos?.() || self?.pos || { x: 0, z: 0 };
    const face = yaw != null ? yaw : (opts.yaw?.() ?? self?.yaw ?? 0);
    if (preferCurrent && isTargetable(current, self)) {
      const d = flatDistance(at, current.pos || current);
      if (d <= range) return { target: current, how: 'current', dist: d, reason: 'your target' };
      // A target you chose and cannot reach is a distance to walk, not a
      // reason to quietly hit something else. Say the number and stop here.
      return {
        target: null, how: 'none', dist: d, outOfRange: true, blocked: current,
        reason: `${current.name || 'your target'} is ${d.toFixed(1)} m away and the reach is ${range} m`,
      };
    }
    return pickTarget({
      cursorHit: hover, candidates: list(), pos: at, yaw: face, range, halfAngle, self,
      nearestHostile: typeof monsters?.nearestHostile === 'function'
        ? (p, y, r, h) => { const f = monsters.nearestHostile(p, y, r, h); return f ? (f.actor || f) : null; } : null,
    });
  }

  function update(dt) {
    hover = castCursor();
    // a target that died or walked out of the world stops being one, quietly
    // a friend stays chosen for as long as they stand (MP1); a hostile that stopped being one is let go
    if (current && !isTargetable(current, self) && !isFriendly(current)) set(null, 'gone');

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

  /**
   * The frame the HUD draws, and the two surfaces that hang off it. Called
   * once a frame by app/systems/ui.js, which is why the plate and the anger
   * are updated here rather than in `update`: the character is only known at
   * draw time, and the con rule is a question about the character.
   *
   *   the world nameplate  hud.setNameplate, projected through the camera
   *   the floaters' anger  a red or purple target deepens the numbers you take
   *   the ring's tint      gold for a fair fight, pulled toward the con colour
   *                        either side of it
   *
   * All three are cleared when there is no target, so none can be left over.
   */
  function frame(character, now = NaN) {
    const f = targetFrame(current, character);
    const { width, height } = viewport();
    plate = current ? nameplateOf(current, character, sc?.camera, width, height, bodyHeight(current), now) : null;
    hud?.setNameplate?.(plate);
    setAnger(f ? f.level : null);
    setRingCon(f ? f.level : null);
    return f;
  }

  return {
    update, set, acquire, groundPoint, castCursor, frame,
    clear: () => set(null, 'clear'),
    onChange(fn) { listeners.push(fn); },
    get current() { return current; },
    get hover() { return hover; },
    get nameplate() { return plate; },
    get lastGround() { return lastGround; },
    dispose() {
      listeners.length = 0; current = null; hover = null; plate = null;
      hud?.setNameplate?.(null); setAnger(null); setRingCon(null);
    },
  };
}
