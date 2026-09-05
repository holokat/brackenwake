// The ring under whatever you are looking at. Gold when it is only a target,
// red and breathing when you are attacking it, gone when there is nothing.
// A silent target is indistinguishable from no target, which is what the
// user reported: "impossible to tell if I am attacking anything".

import * as THREE from 'three';
import { CON_BY_LEVEL } from './con.js';

export const TARGET_COLOUR = 0xd9b04a;
export const ATTACK_COLOUR = 0xe0463a;

// --- the con tint -------------------------------------------------------------
//
// C2 (docs/mmo/wiring/C2.md). Gold is the ring, and gold stays: a fair fight
// is gold exactly, and red and breathing while you are swinging is untouched,
// because those two already mean something the player has learnt. What is new
// is everything either side of a fair fight, where the gold is pulled part way
// toward the con colour so the ring under a grey rat and the ring under a
// purple champion are not the same ring.
//
// RING_TINT is how far it is pulled: 0 would be the old gold everywhere and 1
// would throw the gold away. 0.55 keeps enough gold that the ring still reads
// as the ring.
//
// The boss is the exception and takes BOSS_TINT. Gold and purple mixed evenly
// go pink long before they go purple (0.55 gives 0xcb93a5, a mauve nobody
// would call purple), and the one ring that must be unmistakable is the one
// under the thing that is about to end the session.
export const RING_TINT = 0.55;
export const BOSS_TINT = 0.8;

/** The live con level of the player's target. targeting.js pushes it in. */
let level = null;

/** Set by targeting.js every frame. Returns what it set. */
export function setCon(l) {
  level = typeof l === 'string' && l ? l : null;
  return level;
}
/** What `setCon` last took. */
export function conLevel() { return level; }

const chan = (n, i) => (n >> (8 * i)) & 0xff;
const hexNum = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return Number.isFinite(n) ? n : TARGET_COLOUR;
};

/** Pure: two colour numbers mixed, `k` of the way from `a` to `b`. */
export function mix(a, b, k) {
  const f = k < 0 ? 0 : k > 1 ? 1 : k;
  let out = 0;
  for (let i = 2; i >= 0; i--) {
    const v = Math.round(chan(a, i) + (chan(b, i) - chan(a, i)) * f);
    out |= (v < 0 ? 0 : v > 255 ? 255 : v) << (8 * i);
  }
  return out >>> 0;
};

/**
 * Pure: the ring's colour for a con level. Gold for a fair fight, for a level
 * nothing has set, and for anything the ladder does not know; gold pulled
 * RING_TINT of the way toward the con colour for everything else.
 */
export function tintFor(l = level) {
  if (!l || l === 'even') return TARGET_COLOUR;
  const step = CON_BY_LEVEL[l];
  if (!step) return TARGET_COLOUR;
  return mix(TARGET_COLOUR, hexNum(step.colour), l === 'boss' ? BOSS_TINT : RING_TINT);
}

/**
 * Pure: the ring's scale, opacity and colour for this frame. Exported for the
 * test. `con` overrides the level targeting.js pushed in, which is how the
 * suite drives every level without a running game.
 */
export function ringState(target, attacking, t, con = level) {
  if (!target) return { visible: false };
  const r = (Number.isFinite(target.radius) ? target.radius : 0.45) + 0.25;
  const breath = attacking ? 1 + 0.08 * Math.sin(t * 6) : 1;
  return {
    visible: true,
    scale: r * breath,
    opacity: attacking ? 0.75 + 0.2 * Math.sin(t * 6) : 0.55,
    // A fight is red and breathing whatever the con says: what you are doing
    // beats what it is.
    colour: attacking ? ATTACK_COLOUR : tintFor(con),
  };
}

export function createTargetRing(sc) {
  const geo = new THREE.RingGeometry(0.86, 1.0, 48);
  const mat = new THREE.MeshBasicMaterial({ color: TARGET_COLOUR, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  mesh.name = 'target-ring';
  mesh.renderOrder = 5;
  sc.scene.add(mesh);
  let t = 0;
  return {
    mesh,
    update(dt, target, attacking, groundY) {
      t += dt;
      const s = ringState(target, attacking, t);
      mesh.visible = s.visible;
      if (!s.visible) return s;
      const p = target.pos || target;
      mesh.position.set(p.x, (Number.isFinite(groundY) ? groundY : p.y) + 0.05, p.z);
      mesh.scale.setScalar(s.scale);
      mat.opacity = s.opacity;
      mat.color.setHex(s.colour);
      return s;
    },
    dispose() { sc.scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
