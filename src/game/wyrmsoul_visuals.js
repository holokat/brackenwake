// What Wyrmsoul looks like: the wings, the eyes, the trails, and the pass that
// lets you see through walls.
//
// `14-KALDERA.md` section 3, "What the player sees": "the player's rig shows
// the wings (an additive fire shell on the back anchor) and gold eyes ... every
// moving thing gets a faint gold trail".
//
// This file attaches to `player.js`'s rig ANCHORS and never edits the rig or
// its poses: `parts.back` and `parts.head` are two Object3Ds the pose already
// moves, so a wing on the back and an eye on the head follow the body for free
// and nothing here has to know what a pose is. The rig's own file is somebody
// else's this week and does not need a line changed for any of this.
//
// THE TRIANGLE BUDGET: under 2,000 for the whole effect, and it is measured
// rather than promised. `auditWyrmsoulVisuals()` at the bottom builds one of
// everything and counts the geometry, and the test prints the number.
//
//   two wings   4 x 4 segments each, 32 triangles a wing        64
//   two eyes    an 8 x 6 sphere each, 80 triangles an eye      160
//   the trails  one instanced quad per monster, capped         160
//                                                             ----
//                                                              384
//
// The gold seeing through walls costs NO triangles at all: the monsters' own
// materials are swapped for one shared material with `depthTest` off and put
// back at the end. A second copy of every body would have been the obvious way
// and would have cost more than the whole budget on its own.

import * as THREE from 'three';

/** The gold of the pact. The HUD's arc and the eyes are the same colour. */
export const GOLD = 0xffc94a;
/** The fire the wings are made of, hot at the root and orange at the tip. */
export const FLAME_HOT = [255, 246, 214];
export const FLAME_MID = [255, 170, 48];
export const FLAME_TIP = [214, 60, 12];

/** The most trails drawn at once. `monsters.ALIVE_CAP` is 40; this matches it. */
export const TRAIL_CAP = 40;
/** Below this speed a thing is not moving and gets no trail. */
export const TRAIL_MIN_SPEED = 0.4;
/** How long a trail is, in seconds of the thing's own travel. */
export const TRAIL_SECONDS = 0.5;

const TEX_SIZE = 64;

// --------------------------------------------------------------- the flame --

/**
 * The wing's flame, made in code: a vertical gradient from white hot through
 * orange to a dark tip, cut by three bands of value noise so it reads as fire
 * rather than as a gradient, and faded to nothing at every edge so the plane
 * has no visible border.
 *
 * Deterministic: the noise comes from one integer hash of the cell, so the
 * texture is the same bytes in node and in the browser, and a test can read it.
 */
export function flameTexture(size = TEX_SIZE) {
  const data = new Uint8Array(size * size * 4);
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  // one octave of value noise, bilinear between lattice points
  const value = (x, y, cells) => {
    const fx = x * cells, fy = y * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const s = (t) => t * t * (3 - 2 * t);
    const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
    const u = s(tx), v = s(ty);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  const mix = (p, q, t) => [
    Math.round(p[0] + (q[0] - p[0]) * t),
    Math.round(p[1] + (q[1] - p[1]) * t),
    Math.round(p[2] + (q[2] - p[2]) * t),
  ];
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);              // 0 at the root, 1 at the tip
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const n = value(u, v, 5) * 0.6 + value(u, v, 13) * 0.3 + value(u, v, 27) * 0.1;
      const heat = Math.max(0, 1 - v) * (0.6 + 0.7 * n);
      const rgb = heat > 0.55 ? mix(FLAME_MID, FLAME_HOT, Math.min(1, (heat - 0.55) / 0.45))
        : mix(FLAME_TIP, FLAME_MID, Math.min(1, heat / 0.55));
      // soft at every edge so the quad has no border, and thinner at the tip
      const edge = Math.min(1, Math.sin(Math.PI * u) * 1.6) * Math.min(1, Math.sin(Math.PI * v) * 1.9);
      const alpha = Math.max(0, Math.min(1, edge * (0.35 + 0.85 * n) * (1 - v * 0.55)));
      const i = (y * size + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2];
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- the parts --

/** One wing: a plane on the back anchor, additive, swept back and up. */
function buildWing(side, tex) {
  const geo = new THREE.PlaneGeometry(1.5, 1.15, 4, 4);
  geo.translate(side * 0.75, 0.32, 0);          // the root at the shoulder blade
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    opacity: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `wyrmsoul-wing-${side < 0 ? 'L' : 'R'}`;
  mesh.rotation.y = side * 0.55;                // swept back, not flat to the spine
  mesh.rotation.z = side * -0.12;
  mesh.frustumCulled = false;
  return mesh;
}

/** One eye: a small emissive sphere sitting where player.js puts the eyes. */
function buildEye(side) {
  const geo = new THREE.SphereGeometry(0.017, 8, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: GOLD, emissive: GOLD, emissiveIntensity: 3, roughness: 0.35, metalness: 0,
    transparent: true, opacity: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `wyrmsoul-eye-${side < 0 ? 'L' : 'R'}`;
  // player.js: "the eyes sit at y = 0.166 in the head's frame", x +-0.040, z 0.083
  mesh.position.set(side * 0.040, 0.166, 0.088);
  return mesh;
}

/** The trails: one instanced quad, stretched along each thing's own heading. */
function buildTrails(cap) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0, -0.5);                    // the quad hangs BEHIND its origin
  const mat = new THREE.MeshBasicMaterial({
    color: GOLD, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.name = 'wyrmsoul-trails';
  mesh.count = 0;
  mesh.frustumCulled = false;
  if (mesh.instanceMatrix) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

/**
 * The material every monster wears while the dragon's senses are up: flat gold,
 * additive, and with `depthTest` OFF, which is the whole of "you see through
 * leaves, walls and dark". One material for every body: it carries no per body
 * state, so sharing it costs one draw setup instead of forty.
 */
export function sensesMaterial() {
  return new THREE.MeshBasicMaterial({
    color: GOLD, transparent: true, opacity: 0.55,
    depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// -------------------------------------------------------------- the effect --

/**
 * Build the whole of Wyrmsoul's picture, detached.
 *
 * @param {object} sc     scene.js, for `sc.scene`. Optional: without one the
 *                        trails are built and simply never added to anything.
 * @param {object} rig    createPlayer's api: `rig.parts.back`, `rig.parts.head`
 * @returns the effect, with `attach()`, `detach()`, `update()` and `dispose()`
 */
export function createWyrmsoulVisuals(sc, rig, opts = {}) {
  const scene = sc?.scene || null;
  const cap = Math.max(1, opts.trailCap ?? TRAIL_CAP);
  const tex = flameTexture(opts.textureSize ?? TEX_SIZE);

  const wingL = buildWing(-1, tex);
  const wingR = buildWing(1, tex);
  const eyeL = buildEye(-1);
  const eyeR = buildEye(1);
  const trails = buildTrails(cap);
  const senses = sensesMaterial();

  const back = rig?.parts?.back || null;
  const head = rig?.parts?.head || null;

  let on = false;
  let t = 0;
  let fade = 0;                    // 0 to 1, so the wings open rather than pop
  let sensesOn = false;
  // every mesh whose material was taken away, and what it was wearing
  const swapped = [];
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const lastPos = new Map();       // actor -> { x, z }

  function addTo(parent, child) { if (parent && typeof parent.add === 'function') parent.add(child); }
  function removeFrom(child) { if (child.parent && typeof child.parent.remove === 'function') child.parent.remove(child); }

  /**
   * Put the wings on the back and the eyes on the head, and the trail buffer
   * in the scene. Safe to call twice; the second call changes nothing.
   */
  function attach({ senses: wantSenses = false } = {}) {
    if (!on) { t = 0; fade = 0; }
    on = true;
    sensesOn = !!wantSenses;
    addTo(back, wingL); addTo(back, wingR);
    addTo(head, eyeL); addTo(head, eyeR);
    if (scene) addTo(scene, trails);
    return true;
  }

  /** Take it all off, put every borrowed material back, and forget the trails. */
  function detach() {
    on = false;
    fade = 0;
    restoreMaterials();
    removeFrom(wingL); removeFrom(wingR);
    removeFrom(eyeL); removeFrom(eyeR);
    removeFrom(trails);
    trails.count = 0;
    lastPos.clear();
    return true;
  }

  /**
   * Take every monster's material and hand it the gold one. The originals are
   * kept per MESH, not per monster, because a monster's body shares materials
   * between its own parts and a set keyed by monster would put the wrong one
   * back on a swapped limb.
   */
  function takeMaterials(models) {
    for (const model of models || []) {
      const root = model?.group || model;
      if (!root || typeof root.traverse !== 'function') continue;
      root.traverse((o) => {
        if (!o.isMesh || o.userData.wyrmsoulMat) return;
        o.userData.wyrmsoulMat = o.material;
        o.material = senses;
        swapped.push(o);
      });
    }
  }

  function restoreMaterials() {
    for (const o of swapped) {
      if (o.userData.wyrmsoulMat) { o.material = o.userData.wyrmsoulMat; o.userData.wyrmsoulMat = null; }
    }
    swapped.length = 0;
  }

  /**
   * One frame. `dt` is the PLAYER's clock: the wings beat at full speed while
   * the world hangs, which is the whole point of them.
   *
   * @param {number} dt      seconds, the player's clock
   * @param {boolean} up     is dragon time running
   * @param {object[]} movers  `{ pos, speed? }` for everything to trail
   * @param {object[]} models  monster models, for the senses pass
   */
  function update(dt, up, movers = [], models = null) {
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    t += step;
    const want = up ? 1 : 0;
    // 0.12 s to open and to fold: fast enough to feel instant, slow enough that
    // the wings are not a single frame of a white rectangle
    fade += (want - fade) * (1 - Math.exp(-step / 0.12));
    if (!up && fade < 0.01) fade = 0;

    const beat = 0.55 + 0.45 * Math.sin(t * 6.2);
    for (const [w, side] of [[wingL, -1], [wingR, 1]]) {
      w.material.opacity = fade * (0.55 + 0.35 * beat);
      w.visible = fade > 0.01;
      w.rotation.y = side * (0.55 - 0.28 * beat * fade);
      w.rotation.x = -0.18 * beat * fade;
      const s = 0.65 + 0.35 * fade;
      w.scale.set(s, s, s);
    }
    for (const e of [eyeL, eyeR]) {
      e.material.opacity = fade;
      e.material.emissiveIntensity = 1.5 + 2.5 * fade;
      e.visible = fade > 0.01;
    }

    if (sensesOn && models && !swapped.length && up) takeMaterials(models);
    if ((!up || !sensesOn) && swapped.length) restoreMaterials();

    drawTrails(up ? fade : 0, movers);
  }

  /**
   * A stretched quad behind everything that moved since the last frame. The
   * length is the thing's own speed times TRAIL_SECONDS, so a wolf mid leap
   * draws a long streak and a rat shuffling draws nothing.
   */
  function drawTrails(strength, movers) {
    if (!trails.instanceMatrix) return 0;
    let n = 0;
    if (strength > 0.01) {
      for (const m of movers || []) {
        if (n >= cap) break;
        const p = m?.pos || m;
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
        const was = lastPos.get(m);
        lastPos.set(m, { x: p.x, z: p.z });
        if (!was) continue;
        const dx = p.x - was.x, dz = p.z - was.z;
        const moved = Math.hypot(dx, dz);
        const speed = Number.isFinite(m.speed) ? m.speed : moved * 60;
        if (speed < TRAIL_MIN_SPEED || moved < 1e-5) continue;
        const len = Math.max(0.4, Math.min(6, speed * TRAIL_SECONDS));
        const yaw = Math.atan2(dx, dz);
        tmpQ.setFromEuler(new THREE.Euler(0, yaw, 0));
        tmpV.set(p.x, (Number.isFinite(p.y) ? p.y : 0) + 0.6, p.z);
        tmpS.set(0.5, 0.9, len);
        tmpM.compose(tmpV, tmpQ, tmpS);
        trails.setMatrixAt(n, tmpM);
        n++;
      }
    }
    trails.count = n;
    trails.material.opacity = 0.28 * strength;
    trails.instanceMatrix.needsUpdate = true;
    return n;
  }

  function dispose() {
    detach();
    for (const m of [wingL, wingR, eyeL, eyeR, trails]) {
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    }
    senses.dispose?.();
    tex.dispose?.();
  }

  return {
    wingL, wingR, eyeL, eyeR, trails, texture: tex, senses,
    attach, detach, update, dispose,
    get on() { return on; },
    get fade() { return fade; },
    get trailCount() { return trails.count; },
    get swappedCount() { return swapped.length; },
    /** The senses pass, on its own, so the system can turn it on mid effect. */
    setSenses(v) { sensesOn = !!v; if (!sensesOn) restoreMaterials(); return sensesOn; },
  };
}

// ---------------------------------------------------------------- the audit --

/** Triangles in one geometry, whether it is indexed or not. */
export function triangleCount(geo) {
  if (!geo) return 0;
  if (geo.index) return geo.index.count / 3;
  const pos = geo.attributes?.position;
  return pos ? pos.count / 3 : 0;
}

/**
 * Build one of everything and count it. Called by the test rather than at
 * import, because it allocates geometry and this module is imported by the
 * game. Returns the parts and the total.
 */
export function auditWyrmsoulVisuals(cap = TRAIL_CAP) {
  const tex = flameTexture();
  const wing = buildWing(-1, tex);
  const eye = buildEye(-1);
  const trails = buildTrails(cap);
  const parts = {
    wings: triangleCount(wing.geometry) * 2,
    eyes: triangleCount(eye.geometry) * 2,
    trails: triangleCount(trails.geometry) * cap,
  };
  const total = parts.wings + parts.eyes + parts.trails;
  for (const m of [wing, eye, trails]) { m.geometry.dispose(); m.material.dispose(); }
  tex.dispose?.();
  return { ...parts, total, budget: 2000, ok: total < 2000 };
}
