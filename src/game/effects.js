// What a spell looks like, and what a body does when it swings, casts, is hit,
// or falls over.
//
// Two halves, deliberately:
//
//   the pure half   colours, particle physics, and the POSES. A pose is a
//                   function of one number, `t` in 0..1, returning the angles
//                   a rig should be at. No THREE, no scene, no time of its
//                   own. Node tests drive them directly, and the running game
//                   drives the same functions, so the test path is the real
//                   path.
//   createEffects   the pools: one InstancedMesh of particles, a handful of
//                   ground rings and columns, and the clip player that reads
//                   the poses above and writes them onto a rig's `parts`.
//
// ORDERING, and this is the part that breaks if it is got wrong. `player.js`
// calls `poseCharacter(parts, s)` inside `player.update`, which OVERWRITES
// every rotation on the rig each frame. So `effects.update(dt)` has to run
// AFTER `player.update(dt, ...)`, or the swing is written and then thrown
// away and the arm never moves. See docs/mmo/wiring/W4.md.
//
// Nothing here changes player.js. The clips read `parts` and add to what the
// gait already put there, which is why a swing while running still runs.

import * as THREE from 'three';
import { ABILITIES_BY_ID } from '../mmo/abilities.js';

// --- colours -----------------------------------------------------------------

/**
 * A colour per damage type, from 02-COMBAT.md's five: physical, fire, cold,
 * poison, energy. `holy` is here because Consecrate Weapon deals it and
 * abilities.js records it as a damage type even though it is not a resist.
 */
export const TYPE_COLOURS = {
  physical: 0xe8e2d4,
  fire: 0xff7a2a,
  cold: 0x6fd0ff,
  poison: 0x86e05a,
  energy: 0xb98cff,
  holy: 0xffe9a8,
};

/** Where an ability's colour comes from when its damage type does not say. */
export const GROUP_COLOURS = {
  warrior: 0xe8e2d4,
  ranger: 0xd8c58a,
  mage: 0x7fb3ff,
  sorcerer: 0xc07aff,
  necromancer: 0x7a5ea8,
  healer: 0x8ef0a0,
  rogue: 0x8b8f99,
  bard: 0xffc46b,
  everyone: 0xe8e2d4,
};

function firstDamageType(effect) {
  if (!effect) return null;
  if (effect.kind === 'spellDamage' && effect.type) return effect.type;
  if (effect.kind === 'dot' && effect.type) return effect.type;
  if (effect.kind === 'plague' && effect.type) return effect.type;
  if (effect.kind === 'weaponEnchant' && effect.damageType) return effect.damageType;
  if (effect.kind === 'aoe' && effect.spellDamage?.type) return effect.spellDamage.type;
  if (effect.kind === 'combo') {
    for (const p of effect.parts) { const t = firstDamageType(p); if (t) return t; }
  }
  if (effect.applies) return firstDamageType(effect.applies);
  return null;
}

/**
 * The colour a spell paints with. Its damage type first, since that is the
 * thing the player is being told; the ability's group when it deals none, so a
 * Bless is still gold and a Curse of Weakness still purple.
 */
export function colourFor(abilityId) {
  const ability = ABILITIES_BY_ID[abilityId];
  if (!ability) return TYPE_COLOURS.physical;
  const type = firstDamageType(ability.effect);
  if (type && TYPE_COLOURS[type] != null) return TYPE_COLOURS[type];
  return GROUP_COLOURS[ability.group] ?? TYPE_COLOURS.physical;
}

// --- the poses ---------------------------------------------------------------
//
// Each returns radians to ADD to whatever the gait already wrote, and each is
// zero at t = 0 and t = 1 so a clip starting and a clip ending leave the rig
// exactly where the walk put it. That is the whole reason they are additive:
// a swing that snapped the arm to an absolute angle would freeze the stride.

export const SWING_S = 0.45;      // one swing, wind up and follow through
export const CAST_MIN_S = 0.35;   // the shortest a cast pose is held
export const FLINCH_S = 0.30;
export const DEATH_S = 0.90;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * The swing. A third of it is the wind up, going back and up; the rest is the
 * blow coming through, and the body turns into it: the hips lead, the torso
 * follows, the head stays on the target.
 */
export function swingPose(t) {
  const u = clamp01(t);
  const wind = 0.35;
  let arm, turn;
  if (u < wind) {
    const k = u / wind;                       // 0..1 back and up
    arm = -2.0 * k;
    turn = 0.45 * k;
  } else {
    const k = (u - wind) / (1 - wind);        // 0..1 through and back to rest
    const swept = Math.sin(Math.PI * k);      // out and home, zero at both ends
    arm = -2.0 * (1 - k) + 1.5 * swept;
    turn = 0.45 * (1 - k) - 0.75 * swept;
  }
  return {
    armR: arm,
    armL: -arm * 0.25,
    torsoY: turn,
    hipsY: turn * 0.4,
    headY: -turn * 0.5,
    torsoX: Math.sin(Math.PI * u) * 0.18,
  };
}

/**
 * The cast: the hand goes up and stays up while the bar fills, then comes
 * down. `glow` is 0..1 and is what the light at the hand is scaled by, so a
 * long cast brightens as it completes.
 */
export function castPose(t) {
  const u = clamp01(t);
  const rise = Math.min(1, u / 0.25);
  const fall = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
  const held = rise * fall;
  return {
    armR: -2.5 * held,
    armL: -0.35 * held,
    torsoX: -0.10 * held,
    headX: -0.15 * held,
    glow: Math.max(0, held * (0.55 + 0.45 * u)),
  };
}

/** The flinch: a short recoil away from the blow, over in a third of a second. */
export function flinchPose(t) {
  const u = clamp01(t);
  const k = Math.sin(Math.PI * u) * (1 - u * 0.4);
  return {
    torsoX: -0.45 * k,
    headX: -0.35 * k,
    armL: -0.5 * k,
    armR: -0.5 * k,
    hipsY: 0.12 * k,
  };
}

/**
 * The death: the knees give first, then the whole thing goes over backwards
 * and stays there. This one is NOT zero at t = 1 on purpose, because a body
 * that stood back up would be a bug you could see from across the valley.
 */
export function deathPose(t) {
  const u = clamp01(t);
  const fold = Math.min(1, u / 0.35);
  const fall = u < 0.35 ? 0 : (u - 0.35) / 0.65;
  const e = fall * fall * (3 - 2 * fall);       // smoothstep, so it lands rather than snaps
  return {
    hipsDrop: 0.55 * fold + 0.30 * e,
    tip: (Math.PI / 2) * 0.92 * e,
    legL: -0.9 * fold, legR: -0.7 * fold,
    armL: 0.6 * e, armR: 0.9 * e,
    headX: 0.5 * e,
    done: u >= 1,
  };
}

// --- particle physics ---------------------------------------------------------

export const PARTICLE_GRAVITY = 6;    // m/s^2; sparks are light, they do not fall like people
export const MAX_PARTICLES = 900;

/** One particle, one step. Mutates and returns it. Pure. */
export function stepParticle(p, dt, gravity = PARTICLE_GRAVITY) {
  p.age += dt;
  p.vy -= gravity * p.drag * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  const k = Math.exp(-p.friction * dt);
  p.vx *= k; p.vy *= k; p.vz *= k;
  p.dead = p.age >= p.life;
  return p;
}

/** How big and how bright a particle is at its age. 1 to 0 over its life. */
export function particleFade(p) {
  const u = clamp01(p.age / p.life);
  return 1 - u * u;
}

/**
 * Where a bolt is between caster and target. Not linear: it leaves fast and
 * arrives faster, and it arcs, so it reads as thrown rather than slid.
 */
export function boltAt(from, to, u) {
  const t = clamp01(u);
  const e = t * t * (2 - t) + t * 0.0;           // ease out, still monotonic
  const arc = Math.sin(Math.PI * t) * 0.9;
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e + arc,
    z: from.z + (to.z - from.z) * e,
  };
}

// --- the runtime --------------------------------------------------------------

const PARTICLE_GEO = () => new THREE.BoxGeometry(0.09, 0.09, 0.09);
const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3(1, 1, 1);
const tmpC = new THREE.Color();

/**
 * `createEffects(sc)` where `sc` is the object from `createScene`. Everything
 * it makes lives under one group, so `dispose()` is one removal.
 */
export function createEffects(sc, opts = {}) {
  const scene = sc?.scene || sc;
  const root = new THREE.Group();
  root.name = 'bw-effects';
  root.frustumCulled = false;
  if (scene?.add) scene.add(root);

  // --- particles: one instanced mesh, a plain pool, no allocation per spark
  const cap = Math.max(32, opts.maxParticles || MAX_PARTICLES);
  const mesh = new THREE.InstancedMesh(
    PARTICLE_GEO(),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
    cap,
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  root.add(mesh);
  const pool = [];

  function emit(x, y, z, colour, n, spread, speed, life, size = 1, drag = 1, friction = 1.6) {
    for (let i = 0; i < n; i++) {
      if (pool.length >= cap) break;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.4 + Math.random() * 0.6);
      pool.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        z: z + (Math.random() - 0.5) * spread,
        vx: Math.sin(ph) * Math.cos(th) * s,
        vy: Math.cos(ph) * s + speed * 0.3,
        vz: Math.sin(ph) * Math.sin(th) * s,
        age: 0, life: life * (0.7 + Math.random() * 0.6),
        size: size * (0.6 + Math.random() * 0.8),
        colour, drag, friction, dead: false,
      });
    }
  }

  // --- rings and columns: a small fixed set, reused
  const shapes = [];
  function shape(geo, colour, opacity) {
    for (const s of shapes) {
      if (!s.live && s.geoKey === geo.key) {
        s.live = true; s.age = 0;
        s.mesh.material.color.setHex(colour);
        s.mesh.visible = true;
        return s;
      }
    }
    const m = new THREE.Mesh(geo.make(), new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    m.frustumCulled = false;
    root.add(m);
    const s = { mesh: m, geoKey: geo.key, live: true, age: 0, life: 1, baseOpacity: opacity, spin: 0, grow: 0 };
    shapes.push(s);
    return s;
  }
  const RING = { key: 'ring', make: () => new THREE.RingGeometry(0.86, 1, 40) };
  const COLUMN = { key: 'column', make: () => new THREE.CylinderGeometry(1, 1, 1, 24, 1, true) };

  /** A ring flat on the ground. `persistent` rings live until moved or hidden. */
  function ring(pos, radius, colour, life = 0.9, opacity = 0.55) {
    const s = shape(RING, colour, opacity);
    s.mesh.rotation.x = -Math.PI / 2;
    s.mesh.position.set(pos.x, (pos.y ?? 0) + 0.06, pos.z);
    s.mesh.scale.set(radius, radius, 1);
    s.life = life; s.age = 0; s.baseOpacity = opacity; s.spin = 0.6; s.grow = 0;
    return s;
  }

  /** Meteor. A column of light standing where it will land. */
  function column(pos, radius, colour, life = 1.5, height = 14, opacity = 0.4) {
    const s = shape(COLUMN, colour, opacity);
    s.mesh.rotation.set(0, 0, 0);
    s.mesh.position.set(pos.x, (pos.y ?? 0) + height / 2, pos.z);
    s.mesh.scale.set(radius, height, radius);
    s.life = life; s.age = 0; s.baseOpacity = opacity; s.spin = 1.4; s.grow = 0;
    emit(pos.x, (pos.y ?? 0) + 0.2, pos.z, colour, 40, radius, 3, life * 0.8, 1.2, 0.2);
    return s;
  }

  /** The ground ring an ability with a ground target shows under the cursor. */
  let cursorRing = null;
  function showGroundRing(pos, radius, colour) {
    if (!cursorRing) {
      cursorRing = new THREE.Mesh(RING.make(), new THREE.MeshBasicMaterial({
        color: colour, transparent: true, opacity: 0.45, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      }));
      cursorRing.rotation.x = -Math.PI / 2;
      cursorRing.frustumCulled = false;
      root.add(cursorRing);
    }
    cursorRing.visible = true;
    cursorRing.material.color.setHex(colour);
    cursorRing.position.set(pos.x, (pos.y ?? 0) + 0.06, pos.z);
    cursorRing.scale.set(radius, radius, 1);
    return cursorRing;
  }
  function hideGroundRing() { if (cursorRing) cursorRing.visible = false; }

  // --- bolts: a spark that travels and bursts where it lands
  const bolts = [];
  function burst(pos, colour, strength = 1) {
    emit(pos.x, pos.y ?? 1.2, pos.z, colour, Math.round(24 * strength), 0.25, 5 * strength, 0.5, 1, 1, 2.4);
    return true;
  }
  function bolt(from, to, colour, opts2 = {}) {
    const speed = opts2.speed || 34;
    const d = Math.hypot(to.x - from.x, to.z - from.z, (to.y ?? 0) - (from.y ?? 0));
    const b = {
      from: { x: from.x, y: (from.y ?? 0), z: from.z },
      to: { x: to.x, y: (to.y ?? 1.1), z: to.z },
      age: 0, life: Math.max(0.06, d / speed), colour,
      onArrive: opts2.onArrive || null, strength: opts2.strength || 1, trail: opts2.trail !== false,
    };
    bolts.push(b);
    return b;
  }

  // --- rig clips
  const clips = [];
  /**
   * Play a clip on a rig. `rig` is anything with `parts` shaped like
   * player.js's: hips, torso, head, armL, armR, legL, legR. A second clip of
   * the same name on the same rig replaces the first, so spamming a key does
   * not stack four swings on one arm.
   */
  function play(rig, name, seconds, extra = {}) {
    if (!rig?.parts) return null;
    for (let i = clips.length - 1; i >= 0; i--) {
      if (clips[i].rig === rig && clips[i].name === name) { endClip(clips[i]); clips.splice(i, 1); }
    }
    const c = { rig, name, age: 0, life: Math.max(0.01, seconds), ...extra, base: null };
    clips.push(c);
    return c;
  }
  const swing = (rig, opts2 = {}) => play(rig, 'swing', opts2.seconds || SWING_S, opts2);
  const flinch = (rig) => play(rig, 'flinch', FLINCH_S);
  const die = (rig) => play(rig, 'death', DEATH_S, { hold: true });
  function cast(rig, seconds, colour) {
    const c = play(rig, 'cast', Math.max(CAST_MIN_S, seconds || CAST_MIN_S), { colour });
    if (c) c.light = handLight(colour);
    return c;
  }
  function stopCast(rig) {
    for (let i = clips.length - 1; i >= 0; i--) {
      if (clips[i].rig === rig && clips[i].name === 'cast') { endClip(clips[i]); clips.splice(i, 1); }
    }
  }

  // the glow in the caster's hand, one light reused
  let light = null;
  function handLight(colour) {
    if (!light) {
      light = new THREE.PointLight(colour, 0, 6, 2);
      root.add(light);
    }
    light.color.setHex(colour);
    light.visible = true;
    return light;
  }

  const endedThisFrame = new Set();
  function endClip(c) {
    if (c.name === 'cast' && light) { light.intensity = 0; light.visible = false; }
    if (c.rig?.parts) endedThisFrame.add(c.rig);
  }

  const HAND = new THREE.Vector3(0, -0.62, 0);
  /** Where the right hand is in the world. Used to start a bolt from it. */
  function handPos(rig, out = new THREE.Vector3()) {
    const arm = rig?.parts?.armR;
    if (!arm) return out.set(rig?.pos?.x || 0, (rig?.pos?.y || 0) + 1.3, rig?.pos?.z || 0);
    arm.updateWorldMatrix(true, false);
    return out.copy(HAND).applyMatrix4(arm.matrixWorld);
  }

  /**
   * The channels effects owns, zeroed before the clips write them.
   *
   * `poseCharacter` sets armR.rotation.x, torso.rotation.x, head.rotation.x,
   * the legs and hips.position.y ABSOLUTELY every frame, so adding to those is
   * safe: next frame starts from the gait again. It never touches
   * hips.rotation, torso.rotation.y or head.rotation.y, so adding to THOSE
   * accumulated without limit and a body that had swung once kept turning
   * until it was facing backwards. Measured, and then fixed here, which is why
   * this function exists at all.
   */
  function resetOwned(parts) {
    parts.hips.rotation.x = 0;
    parts.hips.rotation.y = 0;
    parts.torso.rotation.y = 0;
    parts.head.rotation.y = 0;
  }

  function applyClip(c) {
    const p = c.rig.parts;
    const u = c.age / c.life;
    if (c.name === 'swing') {
      const a = swingPose(u);
      p.armR.rotation.x += a.armR;
      p.armL.rotation.x += a.armL;
      p.torso.rotation.y += a.torsoY;
      p.torso.rotation.x += a.torsoX;
      p.hips.rotation.y += a.hipsY;
      p.head.rotation.y += a.headY;
    } else if (c.name === 'cast') {
      const a = castPose(u);
      p.armR.rotation.x += a.armR;
      p.armL.rotation.x += a.armL;
      p.torso.rotation.x += a.torsoX;
      p.head.rotation.x += a.headX;
      if (light) {
        handPos(c.rig, tmpV);
        light.position.copy(tmpV);
        light.intensity = 6 * a.glow;
        light.visible = a.glow > 0.02;
        if (Math.random() < 0.5) emit(tmpV.x, tmpV.y, tmpV.z, c.colour ?? 0xffffff, 1, 0.12, 0.5, 0.35, 0.7, 0.1, 3);
      }
    } else if (c.name === 'flinch') {
      const a = flinchPose(u);
      p.torso.rotation.x += a.torsoX;
      p.head.rotation.x += a.headX;
      p.armL.rotation.x += a.armL;
      p.armR.rotation.x += a.armR;
      p.hips.rotation.y += a.hipsY;
    } else if (c.name === 'death') {
      const a = deathPose(u);
      p.hips.position.y -= a.hipsDrop;
      p.hips.rotation.x += a.tip;
      p.legL.rotation.x += a.legL;
      p.legR.rotation.x += a.legR;
      p.armL.rotation.x += a.armL;
      p.armR.rotation.x += a.armR;
      p.head.rotation.x += a.headX;
    }
  }

  function update(dt) {
    const d = Math.min(0.1, Math.max(0, dt || 0));

    // Clips: the gait wrote the rig this frame, these add to it. Every rig with
    // a live clip has its effects-owned channels zeroed first, exactly once,
    // however many clips it is carrying.
    for (let i = clips.length - 1; i >= 0; i--) {
      const c = clips[i];
      c.age += d;
      if (c.age >= c.life && !c.hold) { endClip(c); clips.splice(i, 1); }
      else if (c.age > c.life) c.age = c.life;   // a held clip stops at its last frame
    }
    const posed = new Set();
    for (const c of clips) {
      if (!posed.has(c.rig)) { resetOwned(c.rig.parts); posed.add(c.rig); }
      applyClip(c);
    }
    // A rig whose last clip ended this frame gets one final zeroing, or the
    // turn the swing put into its shoulders would stay there for good.
    for (const rig2 of endedThisFrame) if (!posed.has(rig2)) resetOwned(rig2.parts);
    endedThisFrame.clear();

    // bolts
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.age += d;
      const u = b.age / b.life;
      const at = boltAt(b.from, b.to, u);
      if (b.trail) emit(at.x, at.y, at.z, b.colour, 2, 0.1, 0.6, 0.28, 0.9, 0.1, 3);
      if (u >= 1) {
        burst(b.to, b.colour, b.strength);
        if (b.onArrive) b.onArrive();
        bolts.splice(i, 1);
      }
    }

    // shapes
    for (const s of shapes) {
      if (!s.live) continue;
      s.age += d;
      if (s.age >= s.life) { s.live = false; s.mesh.visible = false; continue; }
      const k = 1 - s.age / s.life;
      s.mesh.material.opacity = s.baseOpacity * k;
      s.mesh.rotation.z += s.spin * d;
    }

    // particles
    let n = 0;
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      stepParticle(p, d);
      if (p.dead) { pool.splice(i, 1); continue; }
    }
    for (const p of pool) {
      if (n >= cap) break;
      const f = particleFade(p);
      tmpV.set(p.x, p.y, p.z);
      tmpS.setScalar(p.size * f);
      tmpM.compose(tmpV, tmpQ, tmpS);
      mesh.setMatrixAt(n, tmpM);
      tmpC.setHex(p.colour);
      mesh.setColorAt(n, tmpC);
      n++;
    }
    mesh.count = n;
    if (n) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  return {
    root, update,
    // spells
    colourFor, bolt, burst, ring, column, showGroundRing, hideGroundRing, emit,
    // bodies
    swing, cast, stopCast, flinch, die, handPos, play,
    get particleCount() { return pool.length; },
    get clipCount() { return clips.length; },
    get boltCount() { return bolts.length; },
    clear() {
      for (const c of clips) if (c.rig?.parts) resetOwned(c.rig.parts);
      pool.length = 0; bolts.length = 0; clips.length = 0; endedThisFrame.clear();
      for (const s of shapes) { s.live = false; s.mesh.visible = false; }
      hideGroundRing();
      if (light) { light.intensity = 0; light.visible = false; }
      mesh.count = 0;
    },
    dispose() {
      this.clear();
      if (root.parent) root.parent.remove(root);
    },
  };
}
