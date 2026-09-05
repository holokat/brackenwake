// Things that are on fire, and stay on fire while you look at them.
//
// A3 put eleven kinds of structure in the open country and four of them are
// only themselves when something is burning: the bandit camp's fire with men
// round it, the braziers on a temple's steps and on a watchtower's head, and
// the two places a burned farm has not finished going out. This is that fire,
// and it is the only fire in the world outside a spell.
//
// WHAT A FIRE IS MADE OF, and why each piece is the piece it is:
//
//   the flame     two camera facing quads, `THREE.Sprite`, sharing one four
//                 frame sheet built as a `DataTexture`. Sprites, because a
//                 flame that shows you its edge is a decal and not a fire, and
//                 a sprite is the only billboard three gives you without a
//                 shader. A DataTexture, because a canvas is not a thing node
//                 has and every one of these has to build in a test.
//   the coals     one low mesh of lumps with an emissive material, which is the
//                 half of a fire that lights the ground under itself and the
//                 half `setNight` drives.
//   the embers    ONE `THREE.Points` for every fire in the structure together,
//                 so a temple with four braziers pays for one, not four.
//   the light     ONE `THREE.PointLight` for the whole structure, standing at
//                 the biggest fire of it. A point light is the most expensive
//                 thing a marker can own and four of them round a temple would
//                 cost more than the temple.
//
// THE MERGE WOULD EAT IT. `site_models.mergeByMaterial` bakes every mesh of a
// marker into one geometry per colour, in world space, and a flame baked flat
// into a temple is a painted flame. So `buildSiteMarker` merges the STRUCTURE
// and then hangs the fires on the merged group, exactly as `mine_models` hangs
// a lantern on a merged cut. Nothing here may be built before the merge.
//
// EVERY NUMBER IS IN METRES AND SECONDS. `update(dt)` takes real seconds and
// `setNight(k)` takes 0 in full day and 1 at midnight, which is what
// `createSiteMarkers.animate(dt, nightFactor)` is already handed.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';
import { FIRE_COLOURS, flameFlicker, flameFrameAt } from '../game/effects.js';

// ---------------------------------------------------------------- constants --

/** Frames in the flame sheet. Four is enough to stop it reading as a loop. */
export const FLAME_FRAMES = 4;
/** How fast the sheet runs. A fire is quick; slower than this reads as a lamp. */
export const FLAME_FPS = 11;
/** One frame of the sheet, in pixels. */
export const FLAME_PX = 32;
/** How long a spark lives, in seconds. */
export const EMBER_LIFE = 2.1;
/** How fast a spark climbs, metres a second, before the flicker on top of it. */
export const EMBER_RISE = 1.15;
/** A fire is never wholly out by day, and never at full strength either. */
export const DAY_GLOW = 0.42;
/**
 * Seconds between one puff of smoke off a fire and the next, when
 * `createFires` has been handed the game's `effects`.
 *
 * The embers here are a fixed Points cloud that belongs to the structure and
 * lives as long as it does. Smoke has to DRIFT away from the fire and out of
 * the marker's own space, so it belongs in the shared particle pool in
 * `effects.js` instead, where it is capped with everything else and cannot
 * cost a structure anything when nobody is looking at it. With no effects
 * handed in there is no smoke and everything else is exactly the same.
 */
export const SMOKE_EVERY = 0.55;

/**
 * The four fires this file knows how to be.
 *
 *   flame   height of the flame in metres, which is also the sprite's height
 *   embers  how many sparks this fire keeps in the air
 *   coals   whether it has a bed of coals under it (a brazier and a campfire
 *           do; a burning roof timber does not, it has the roof)
 *   reach   how far its light carries, metres
 *   warm    how bright its light is; the biggest `warm` in a structure is the
 *           one fire that gets the structure's single PointLight
 */
export const FIRE_KINDS = {
  campfire: { flame: 1.15, embers: 7, coals: true, reach: 13, warm: 1.5 },
  brazier: { flame: 0.85, embers: 5, coals: true, reach: 11, warm: 1.2 },
  wreck: { flame: 1.7, embers: 10, coals: false, reach: 16, warm: 1.8 },
  torch: { flame: 0.45, embers: 3, coals: false, reach: 7, warm: 0.7 },
};
export const FIRE_KIND_IDS = Object.keys(FIRE_KINDS);

// ------------------------------------------------------------------ the sheet --

let sheet = null;

/**
 * The flame sheet: FLAME_FRAMES teardrops side by side in one RGBA texture.
 *
 * Row 0 of a DataTexture is t = 0, which is the BOTTOM of the sprite, so `v`
 * below counts up from the fire. The shape is a width profile that narrows to
 * the tip with a wobble whose phase is the frame number, so the four frames are
 * the same flame at four moments and not four different flames.
 */
export function flameSheet() {
  if (sheet) return sheet;
  const W = FLAME_PX * FLAME_FRAMES, H = FLAME_PX;
  const data = new Uint8Array(W * H * 4);
  const core = new THREE.Color(FIRE_COLOURS.core);
  const mid = new THREE.Color(FIRE_COLOURS.mid);
  const outer = new THREE.Color(FIRE_COLOURS.outer);
  const c = new THREE.Color();
  for (let f = 0; f < FLAME_FRAMES; f++) {
    const ph = (f / FLAME_FRAMES) * Math.PI * 2;
    for (let py = 0; py < H; py++) {
      const v = (py + 0.5) / H;                                  // 0 at the coals, 1 at the tip
      const w = Math.pow(1 - v, 0.55) * (0.86 + 0.22 * Math.sin(v * 6.2 + ph));
      for (let px = 0; px < FLAME_PX; px++) {
        const u = ((px + 0.5) / FLAME_PX) * 2 - 1;                // -1 to 1 across
        const lean = 0.16 * v * Math.sin(v * 3.1 + ph);           // the flame leans as it rises
        const d = w > 1e-4 ? Math.abs(u - lean) / w : 9;
        let a = 1 - d;
        a = a > 0 ? Math.pow(a, 1.35) * (1 - v * 0.18) : 0;
        // the middle of the base is white hot, the edge and the tip are not
        const t = Math.min(1, d * 0.75 + v * 0.7);
        c.copy(core).lerp(mid, Math.min(1, t * 1.6)).lerp(outer, Math.max(0, t * 1.6 - 1));
        const i = ((py * W) + f * FLAME_PX + px) * 4;
        data[i] = Math.round(c.r * 255);
        data[i + 1] = Math.round(c.g * 255);
        data[i + 2] = Math.round(c.b * 255);
        data[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
      }
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  sheet = tex;
  return sheet;
}

/** Drop the cached sheet. For a test that wants a second one, and for teardown. */
export function clearFlameSheet() { sheet?.dispose?.(); sheet = null; }

// --------------------------------------------------------------------- coals --

const COAL_LUMPS = 7;

/** A bed of coals, `r` metres across, as one geometry in the fire's own frame. */
function coalGeometry(r, rng) {
  const geos = [];
  for (let i = 0; i < COAL_LUMPS; i++) {
    const a = (i / COAL_LUMPS) * Math.PI * 2 + rng() * 0.5;
    const d = r * (0.15 + rng() * 0.5);
    const s = r * (0.16 + rng() * 0.14);
    const g = new THREE.IcosahedronGeometry(s, 0);
    g.rotateX(rng() * 3); g.rotateY(rng() * 3);
    g.translate(Math.cos(a) * d, s * 0.55, Math.sin(a) * d);
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}

// ---------------------------------------------------------------- the fires --

/**
 * Every fire of one structure, as one group with one light.
 *
 * @param spots  [{ x, y, z, kind, scale }] in WORLD metres, `kind` a key of
 *               FIRE_KINDS, `scale` optional and 1 by default
 * @param opts   { seed, castLight, effects }  `castLight: false` builds no
 *               PointLight at all, for a structure whose fire is only
 *               decoration; `effects` is `createEffects`'s return, and with it
 *               each fire also puffs smoke into the shared particle pool
 * @returns { group, fires, update, setNight, dispose, frame, night, lightCount,
 *            drawCount }
 */
export function createFires(spots, opts = {}) {
  const group = new THREE.Group();
  group.name = 'fires';
  const rng = mulberry32((opts.seed | 0) || 1);
  const list = (spots || []).filter((s) => s && FIRE_KINDS[s.kind]);

  const state = { t: rng() * 40, frame: 0, night: 0, puff: 0, puffs: 0 };
  const effects = opts.effects && typeof opts.effects.fire === 'function' ? opts.effects : null;
  if (!list.length) {
    return {
      group, fires: [], update() {}, setNight() {}, dispose() {},
      get frame() { return 0; }, get night() { return 0; },
      get lightCount() { return 0; }, get drawCount() { return 0; }, get puffs() { return 0; },
    };
  }

  // --- the flame sheet, one material per band, shared by every fire ---------
  // Sprites cannot be batched, so each one is a draw call whatever material it
  // wears; sharing the material is for the frame, which every flame in a
  // structure shows at the same moment because they are all the same fire.
  const tex = flameSheet();
  const bandMat = (opacity, depth) => {
    const m = new THREE.SpriteMaterial({
      map: tex.clone(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity,
      color: 0xffffff, fog: true,
    });
    m.map.repeat.set(1 / FLAME_FRAMES, 1);
    m.map.needsUpdate = true;
    m.userData = { depth };
    return m;
  };
  const outerMat = bandMat(0.85, 0);
  const coreMat = bandMat(0.95, 1);

  // --- the coals, all of them in one mesh ----------------------------------
  const coalMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a12, emissive: FIRE_COLOURS.outer, emissiveIntensity: DAY_GLOW,
    roughness: 1, flatShading: true,
  });
  const coalGeos = [];

  const fires = [];
  for (const spot of list) {
    const spec = FIRE_KINDS[spot.kind];
    const scale = spot.scale != null ? spot.scale : 1;
    const h = spec.flame * scale;
    const f = {
      kind: spot.kind, spec, scale,
      x: spot.x, y: spot.y, z: spot.z,
      h, phase: rng() * 6.28, sprites: [],
    };
    for (const [mat, w, up] of [[outerMat, 0.72, 0.5], [coreMat, 0.42, 0.42]]) {
      const sp = new THREE.Sprite(mat);
      sp.scale.set(h * w, h, 1);
      sp.position.set(spot.x, spot.y + h * up, spot.z);
      sp.frustumCulled = true;
      group.add(sp);
      f.sprites.push({ sprite: sp, w, up });
    }
    if (spec.coals) {
      const g = coalGeometry(0.45 * scale, rng);
      g.translate(spot.x, spot.y, spot.z);
      coalGeos.push(g);
    }
    fires.push(f);
  }

  // the sheet starts where the clock starts, not at frame zero: a structure
  // built at dusk should not show every fire on the same frame as one built now
  state.frame = flameFrameAt(state.t, FLAME_FRAMES, FLAME_FPS);
  outerMat.map.offset.x = state.frame / FLAME_FRAMES;
  coreMat.map.offset.x = state.frame / FLAME_FRAMES;

  let coals = null;
  if (coalGeos.length) {
    const merged = mergeGeometries(coalGeos, false);
    for (const g of coalGeos) g.dispose();
    if (merged) {
      coals = new THREE.Mesh(merged, coalMat);
      coals.castShadow = false; coals.receiveShadow = true;
      group.add(coals);
    }
  }

  // --- the embers, all of them in one Points --------------------------------
  const emberCount = fires.reduce((n, f) => n + Math.round(f.spec.embers * f.scale), 0);
  const pos = new Float32Array(emberCount * 3);
  const embers = [];
  for (let i = 0, k = 0; i < fires.length; i++) {
    const f = fires[i];
    const n = Math.round(f.spec.embers * f.scale);
    for (let j = 0; j < n; j++, k++) {
      embers.push({ f, i: k, age: rng() * EMBER_LIFE, ox: 0, oz: 0, rise: 0 });
    }
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const emberMat = new THREE.PointsMaterial({
    color: FIRE_COLOURS.ember, size: 0.16, sizeAttenuation: true,
    transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const emberPts = new THREE.Points(emberGeo, emberMat);
  emberPts.frustumCulled = false;
  group.add(emberPts);

  // --- one light, at the biggest fire ---------------------------------------
  let light = null;
  let lit = fires[0];
  for (const f of fires) if (f.spec.warm * f.scale > lit.spec.warm * lit.scale) lit = f;
  if (opts.castLight !== false) {
    light = new THREE.PointLight(FIRE_COLOURS.mid, 0, lit.spec.reach * lit.scale, 2);
    light.position.set(lit.x, lit.y + lit.h * 0.6, lit.z);
    group.add(light);
  }

  /** Reseat every ember at its fire, at the height its age says. */
  function stepEmbers(dt) {
    for (const e of embers) {
      e.age += dt;
      if (e.age >= EMBER_LIFE) {
        e.age -= EMBER_LIFE * Math.ceil(e.age / EMBER_LIFE);
        if (e.age < 0) e.age += EMBER_LIFE;
        e.ox = (rng() - 0.5) * 0.5 * e.f.scale;
        e.oz = (rng() - 0.5) * 0.5 * e.f.scale;
      }
      const u = e.age / EMBER_LIFE;
      const f = e.f;
      const i = e.i * 3;
      pos[i] = f.x + e.ox * (0.4 + u * 1.6);
      pos[i + 1] = f.y + f.h * 0.4 + u * EMBER_RISE * EMBER_LIFE * f.scale;
      pos[i + 2] = f.z + e.oz * (0.4 + u * 1.6);
    }
    emberGeo.attributes.position.needsUpdate = true;
  }
  stepEmbers(0);

  /**
   * One step of every fire in the structure. `dt` is real seconds; anything
   * bigger than a fifth of a second is clamped, so a tab that was in the
   * background does not fire two hundred frames of embers into the sky at once.
   */
  function update(dt) {
    const d = Math.min(0.2, Math.max(0, dt || 0));
    state.t += d;
    const frame = flameFrameAt(state.t, FLAME_FRAMES, FLAME_FPS);
    if (frame !== state.frame) {
      state.frame = frame;
      outerMat.map.offset.x = frame / FLAME_FRAMES;
      coreMat.map.offset.x = frame / FLAME_FRAMES;
    }
    for (const f of fires) {
      const k = flameFlicker(state.t * 1.6 + f.phase);
      for (const s of f.sprites) {
        s.sprite.scale.set(f.h * s.w * (0.88 + 0.24 * k), f.h * (0.82 + 0.3 * k), 1);
        s.sprite.position.y = f.y + f.h * s.up * (0.9 + 0.2 * k);
      }
    }
    if (light) {
      const k = flameFlicker(state.t * 1.6 + lit.phase);
      light.intensity = lit.spec.warm * lit.scale * (DAY_GLOW + (1 - DAY_GLOW) * state.night) * k;
    }
    if (coals) coalMat.emissiveIntensity = (DAY_GLOW + (1 - DAY_GLOW) * state.night)
      * flameFlicker(state.t * 2.1) * 1.35;
    stepEmbers(d);
    // smoke, if anybody handed us the particle pool to put it in
    if (effects) {
      state.puff += d;
      while (state.puff >= SMOKE_EVERY) {
        state.puff -= SMOKE_EVERY;
        const f = fires[state.puffs % fires.length];
        effects.fire({ x: f.x, y: f.y + f.h * 0.5, z: f.z }, f.h * 0.8);
        state.puffs++;
      }
    }
  }

  /**
   * How dark it is outside, 0 in full day and 1 at midnight.
   *
   * A fire burns by day too: a bandit camp with a cold fire is a camp nobody is
   * in. So the night does not switch it on, it opens it up, from DAY_GLOW to
   * full, on the coals and on the one light.
   */
  function setNight(k) {
    state.night = Math.max(0, Math.min(1, k || 0));
    const g = DAY_GLOW + (1 - DAY_GLOW) * state.night;
    coalMat.emissiveIntensity = g * 1.35;
    if (light) light.intensity = lit.spec.warm * lit.scale * g;
    emberMat.opacity = 0.55 + 0.45 * state.night;
  }
  setNight(0);

  return {
    group, fires,
    update, setNight,
    get frame() { return state.frame; },
    get night() { return state.night; },
    /** PointLights this structure owns. One, or none. Never more. */
    get lightCount() { return light ? 1 : 0; },
    /** Draw calls the fires cost: the sprites, the coals and the one Points. */
    get drawCount() { return fires.reduce((n, f) => n + f.sprites.length, 0) + (coals ? 1 : 0) + 1; },
    /** How many puffs of smoke have gone into the shared pool. Zero with no effects. */
    get puffs() { return state.puffs; },
    /** For a test that wants to read the coals' emissive without a raycast. */
    get coalMaterial() { return coalMat; },
    get light() { return light; },
    dispose() {
      emberGeo.dispose(); emberMat.dispose();
      coals?.geometry.dispose(); coalMat.dispose();
      outerMat.map.dispose(); outerMat.dispose();
      coreMat.map.dispose(); coreMat.dispose();
      group.parent?.remove(group);
    },
  };
}


// ------------------------------------------------------------------- glows --
//
// A lit window is not a fire and does not belong in FIRE_KINDS: there is no
// flame, no ember and no light of its own. What it shares with a fire is that
// it comes up at dusk and goes out at dawn, so it is driven by the same
// `setNight` and hung on the marker in the same place, after the merge.
//
// Every pane of one colour is baked into ONE mesh, because they never move
// relative to each other and a tower with three windows should not cost three
// draw calls.

/** How bright a pane is in full day, before the night opens it up. */
export const GLOW_DAY = 0.06;

/**
 * @param specs [{ x, y, z, ry, w, h, colour }] in world metres. `ry` turns the
 *              pane so its face points out of the wall it is set into.
 */
export function createGlows(specs, opts = {}) {
  const group = new THREE.Group();
  group.name = 'glows';
  const list = (specs || []).filter(Boolean);
  const state = { t: (opts.seed || 0) % 7, night: 0 };
  const panes = [];
  if (!list.length) {
    return {
      group, panes, update() {}, setNight() {}, dispose() {},
      get drawCount() { return 0; }, get night() { return 0; },
    };
  }
  const byColour = new Map();
  for (const s of list) {
    const hex = s.colour ?? 0xffcf78;
    const g = new THREE.PlaneGeometry(s.w ?? 0.8, s.h ?? 1.2);
    g.rotateY(s.ry || 0);
    g.translate(s.x, s.y, s.z);
    let b = byColour.get(hex);
    if (!b) { b = []; byColour.set(hex, b); }
    b.push(g);
  }
  for (const [hex, geos] of byColour) {
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!geo) continue;
    const mat = new THREE.MeshBasicMaterial({
      color: hex, transparent: true, opacity: GLOW_DAY,
      depthWrite: false, side: THREE.FrontSide, fog: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false; mesh.receiveShadow = false;
    group.add(mesh);
    panes.push(mesh);
  }

  function level() { return GLOW_DAY + (1 - GLOW_DAY) * state.night; }
  function setNight(k) {
    state.night = Math.max(0, Math.min(1, k || 0));
    for (const m of panes) m.material.opacity = level();
  }
  function update(dt) {
    state.t += Math.min(0.2, Math.max(0, dt || 0));
    // a candle behind glass, not a bulb: a slow small wander, never a strobe
    const f = 0.93 + 0.07 * Math.sin(state.t * 2.7 + 0.6) * Math.sin(state.t * 0.9);
    const v = level() * f;
    for (const m of panes) m.material.opacity = v;
  }
  setNight(0);

  return {
    group, panes, update, setNight,
    get night() { return state.night; },
    get drawCount() { return panes.length; },
    dispose() {
      for (const m of panes) { m.geometry.dispose(); m.material.dispose(); }
      group.parent?.remove(group);
    },
  };
}
