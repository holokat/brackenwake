// The thing under the cursor before you click, and the ring that says how much
// ground it will take.
//
// Every ghost is the REAL body wherever there is one: a structure is
// `plan_models.pieceBody`, which is the glb when the user has modelled it and
// the stand-in when they have not, and a rock is the same geometry
// `buildPlan` instances. A tree and a person are stood in for by a post at the
// right height, because growing an arbor prototype for every mouse move would
// cost between two and thirteen milliseconds a frame; the ring under it is the
// crown, measured off the species' own numbers.
//
// The ghost is transparent, casts no shadow and is on no raycast layer of its
// own: it is a hint, not a thing in the world.

import * as THREE from 'three';
import { FOOTPRINT, pieceBody, rockGeometry, ROCK_KINDS, MARKER_COLOUR, MARKER_POST_H } from '../../world/plan_models.js';
import { SPECIES } from '../../world/arbor.js';
import { MONSTERS } from '../../mmo/monsters.js';

/** How far over the ground the footprint ring floats, in metres. */
export const RING_LIFT = 0.08;
/** The colour a ghost is drawn in: the gold the rest of the interface uses. */
export const GHOST_COLOUR = 0xc9a44a;

const ghostMat = (colour = GHOST_COLOUR) => new THREE.MeshBasicMaterial({
  color: colour, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide,
});

/** A flat ring on the ground, w by d metres, turned to the ghost's own yaw. */
function footprintRing(w, d, colour = GHOST_COLOUR) {
  const g = new THREE.Group();
  const r = Math.max(0.3, Math.hypot(w, d) / 2);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.94, r, 40), ghostMat(colour));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = RING_LIFT;
  g.add(ring);
  // the box the footprint really is, so a 14 by 9 inn does not read as a disc
  const box = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ghostMat(colour));
  box.rotation.x = -Math.PI / 2;
  box.position.y = RING_LIFT * 0.5;
  box.material.opacity = 0.16;
  g.add(box);
  return g;
}

/** A translucent post of a given height and width. What stands in for a body. */
function post(h, r, colour) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), ghostMat(colour));
  m.position.y = h / 2;
  g.add(m);
  return g;
}

/**
 * The ghost for one palette pick, standing on y = 0 facing +z.
 *
 * Answers { group, w, d, h, words } or null. `words` is what the panel prints
 * beside the cursor, so the size is on screen before the click and not after.
 */
export function ghostFor(tab, id, opts = {}) {
  const scale = opts.scale ?? 1;
  if (tab === 'structures') {
    const f = FOOTPRINT[id];
    if (!f) return null;
    const body = pieceBody(id, scale);
    const g = new THREE.Group();
    if (body) {
      const b = body.group;
      b.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false; o.receiveShadow = false;
        o.material = ghostMat(GHOST_COLOUR);
      });
      g.add(b);
    }
    const [w, d, h] = [f[0] * scale, f[1] * scale, f[2] * scale];
    g.add(footprintRing(w, d));
    return { group: g, w, d, h, words: `${id}, ${w.toFixed(1)} by ${d.toFixed(1)} by ${h.toFixed(1)} m, ${body && body.source === 'glb' ? 'modelled' : 'a stand-in'}` };
  }
  if (tab === 'trees') {
    const sp = SPECIES[id];
    if (!sp) return null;
    const h = ((sp.h[0] + sp.h[1]) / 2) * scale;
    const crown = h * 0.55;
    const g = post(h, Math.max(0.12, h * sp.trunk), 0x4a7a3a);
    g.add(footprintRing(crown, crown, 0x4a7a3a));
    return { group: g, w: crown, d: crown, h, words: `${id}, about ${h.toFixed(1)} m, crown about ${crown.toFixed(1)} m across` };
  }
  if (tab === 'rocks') {
    const spec = ROCK_KINDS[id];
    if (!spec) return null;
    const g = new THREE.Group();
    const geo = rockGeometry(id, opts.realm || 'greenwold');
    if (geo) {
      const m = new THREE.Mesh(geo, ghostMat(0x8d887e));
      m.scale.setScalar(scale);
      g.add(m);
    }
    const s = spec.size * scale;
    g.add(footprintRing(s, s, 0x8d887e));
    return { group: g, w: s, d: s, h: s, words: `${id}, about ${s.toFixed(1)} m` };
  }
  if (tab === 'monsters' || tab === 'creatures') {
    const row = MONSTERS[id];
    const h = row && row.boss ? 3.4 : 1.9;
    const g = post(h, 0.45, 0xc4523a);
    g.add(footprintRing(1.6, 1.6, 0xc4523a));
    return { group: g, w: 1.6, d: 1.6, h, words: row ? `${row.name}, tier ${row.tier}, ${row.hp} health` : id };
  }
  if (tab === 'people') {
    const g = post(1.8, 0.35, 0x6f9a4a);
    g.add(footprintRing(1.2, 1.2, 0x6f9a4a));
    return { group: g, w: 1.2, d: 1.2, h: 1.8, words: `${id}, standing where you click` };
  }
  if (tab === 'markers') {
    const colour = MARKER_COLOUR[opts.kind] || MARKER_COLOUR.other;
    const g = post(MARKER_POST_H, 0.09, colour);
    g.add(footprintRing(1.1, 0.4, colour));
    return { group: g, w: 1.1, d: 0.4, h: MARKER_POST_H, words: `a marker: ${opts.label || id}` };
  }
  if (tab === 'terrain') {
    const r = opts.r || 8;
    const g = new THREE.Group();
    g.add(footprintRing(r * 2, r * 2, 0x4a8ff0));
    return { group: g, w: r * 2, d: r * 2, h: 0, words: `the ${id} brush, ${r} m across` };
  }
  return null;
}

/** A ring that says where the space's own edge is. Built once per space. */
export function radiusRing(radius, colour = GHOST_COLOUR) {
  const pts = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.6, depthTest: false }));
  line.renderOrder = 998;
  return line;
}

/** A box drawn round whatever is selected, so a click can be seen to have landed. */
export function selectionBox(colour = 0xf2dc9c) {
  const box = new THREE.Box3Helper(new THREE.Box3(), colour);
  box.material.depthTest = false;
  box.renderOrder = 998;
  return box;
}

/** Free a ghost's own materials. The geometry is the game's and stays. */
export function disposeGhost(g) {
  if (!g) return;
  g.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.material.dispose(); });
}
