// Gear on the body: what you are wearing, on the rig, every frame you wear it.
//
// `dressRig(rig, equipment, opts)` is the whole surface. It is idempotent by
// construction: every visual slot keeps a signature of what is currently on
// the rig, and a call that would put the same thing in the same place does
// nothing at all. Call it at boot, call it on every `inventory.onChange`, call
// it in a loop; the only work done is the work the equipment changed.
//
// WHERE THINGS GO
//
//   mainHand   handR, unless the ranged set is drawn, in which case the melee
//              weapon rides the left hip
//   offHand    handL: shield, tome, torch, skull, lute
//   ranged     back when a melee weapon is drawn, handL when opts.ranged
//   head       head            chest   torso, and pauldrons on both arms
//   hands      handL, handR    wrists  armL, armR
//   waist      torso           legs    legL, legR, shinL, shinR
//   feet       footL, footR    back    back
//   neck       torso           rings   handL, handR
//
// A two handed weapon does not just hang off one fist: the rig's `grip` is set
// so player.js poses both arms onto the haft. That is why `dressRig` writes
// `rig.grip` and why it is part of dressing rather than of animation.
//
// WHAT A PIECE IS MADE OF
//
// The tier decides the fabric: cloth is woven, leather is matte hide, studded
// is hide with rivets punched through it, ring and chain are their own ring
// patterns, plate is brushed steel. Each is a generated texture out of
// weapon_models.js with albedo, roughness and normal maps, tinted by the
// item's `material` through the ores.js colour tables, so an emberite
// breastplate is red veined and a voidrock one does not shine.
//
// Rarity shows as an emissive inlay on epic and above, and legendary carries a
// soft light. Below epic, nothing glows, because a common leather belt that
// glows is a lie about what it is.

import * as THREE from 'three';
import { baseFor, ARMOR_TIERS, ARMOR_PIECES, SLOTS, RARITY, RARITY_ORDER, twoHanded } from '../mmo/items.js';
import {
  buildWeaponModel, hasWeaponModel, disposeModel, countTriangles,
  pbr, loft, roundRect, colourOfMaterial,
} from './weapon_models.js';
import { BODY } from './player.js';

const EPIC = RARITY_ORDER.indexOf('epic');
const LEGENDARY = RARITY_ORDER.indexOf('legendary');
const tierOf = (r) => Math.max(0, RARITY_ORDER.indexOf(r));

// ---------------------------------------------------------------------------
// Materials

/** What a piece reads as when the item carries no material of its own. */
export const TIER_COLOURS = {
  cloth: 0x8d7f6a, leather: 0x7a5232, studded: 0x5a3e28,
  ring: 0x8a8f95, chain: 0x8b9095, plate: 0xa8adb4,
};
const TIER_FAMILY = {
  cloth: 'cloth', leather: 'leather', studded: 'studded',
  ring: 'ring', chain: 'chain', plate: 'plate',
};
const TIER_PBR = {
  cloth: { rough: 1, metal: 0, sheen: 0.45, repeat: 4 },
  leather: { rough: 1, metal: 0, repeat: 3 },
  studded: { rough: 1, metal: 0.5, repeat: 3 },
  ring: { rough: 1, metal: 1, repeat: 4 },
  chain: { rough: 1, metal: 1, repeat: 5 },
  plate: { rough: 1, metal: 1, repeat: 2 },
};
/** Ring mail upward is rigid: it holds a shell shape instead of draping. */
export const HARD_TIERS = new Set(['ring', 'chain', 'plate']);

/** The material for one armour piece, cached through weapon_models' pbr cache. */
export function armourMat(tierId, item) {
  const tier = TIER_FAMILY[tierId] ? tierId : 'leather';
  const colour = colourOfMaterial(item?.material) ?? TIER_COLOURS[tier];
  return pbr(TIER_FAMILY[tier], colour, TIER_PBR[tier]);
}
const strapMat = () => pbr('wrap', 0x4a3524, { rough: 1, metal: 0, repeat: 3 });
const trimMat = (tierId) => pbr('metal', tierId === 'cloth' ? 0xc0a24a : 0x8f9298, { rough: 0.6, metal: 1, repeat: 2 });
function glowMat(colour) {
  return pbr('metal', colour, { rough: 0.5, metal: 0, emissive: colour, emissiveIntensity: 2.4, repeat: 1 });
}

// ---------------------------------------------------------------------------
// Geometry, all of it sized from the body plan so a piece fits the rig it is
// put on rather than the rig it was authored against.

function put(geo, mat) {
  const o = new THREE.Mesh(geo, mat);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/** A shell around a limb: rings of [y, halfWidth, depthRatio, dz]. */
function shell(rings, mat, opts = {}) {
  const profile = opts.profile || roundRect(opts.deep == null ? 1 : opts.deep, 0.42, 3);
  const list = rings.map(([y, sx, dr, dz], i) => ({
    y, sx, sz: sx * (dr == null ? 1 : dr), dz: dz || 0,
    v: (i / Math.max(1, rings.length - 1)) * (opts.vScale || 1),
  }));
  return put(loft(profile, list, { capTop: opts.capTop, capBottom: opts.capBottom }), mat);
}

/** A band: a short shell, for a belt, a gorget, a bracer cuff or a glow inlay. */
function band(y, halfWidth, height, deep, mat) {
  return shell([[y - height / 2, halfWidth, deep], [y, halfWidth * 1.03, deep], [y + height / 2, halfWidth, deep]], mat, { deep });
}

function blob(r, mat, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, 14, 10);
  g.scale(1, sy, sz);
  return put(g, mat);
}

// ---------------------------------------------------------------------------
// The eight armour pieces. Each returns a list of { anchor, node }, so a piece
// that lives on two limbs is one entry in the wardrobe and two meshes on the
// rig. `c` carries the material, the tier, the body plan and the glow helper.

const PIECES = {
  head(c) {
    const B = c.body;
    const out = [];
    const g = new THREE.Group();
    if (c.hard) {
      // a skull cap with a brow band, a nasal bar and cheek plates
      g.add(shell([
        [0.055, B.SKULL_R * 1.02, 1.02], [0.135, B.SKULL_R * 1.10, 1.03],
        [0.200, B.SKULL_R * 1.08, 1.01], [0.256, B.SKULL_R * 0.88, 0.98],
        [B.HAIR_TOP + 0.012, B.SKULL_R * 0.34, 0.94],
      ], c.mat, { deep: 0.99, vScale: 1.4 }));
      g.add(band(0.176, B.SKULL_R * 1.13, 0.034, 1.02, c.trim));
      const nasal = shell([[0.196, 0.014, 3.0, 0.088], [0.140, 0.015, 3.2, 0.098], [0.100, 0.013, 2.8, 0.096]], c.mat, { deep: 1 });
      g.add(nasal);
      for (const s of [-1, 1]) {
        const cheek = shell([[0.166, 0.020, 1.0], [0.120, 0.026, 1.1], [0.070, 0.022, 1.0]], c.mat, { deep: 1 });
        cheek.position.set(s * 0.086, 0, 0.028);
        cheek.rotation.z = -s * 0.10;
        g.add(cheek);
      }
      if (c.tier === 'plate') {
        const crest = new THREE.BoxGeometry(0.014, 0.030, 0.150);
        crest.translate(0, B.HAIR_TOP - 0.006, -0.010);
        g.add(put(crest, c.trim));
      }
    } else {
      // a hood: the cap, and a cowl that falls to the shoulders behind
      g.add(shell([
        [0.030, B.SKULL_R * 1.06, 1.04], [0.140, B.SKULL_R * 1.14, 1.05],
        [0.230, B.SKULL_R * 1.06, 1.02], [B.HAIR_TOP + 0.016, B.SKULL_R * 0.42, 0.96],
      ], c.mat, { deep: 1.0, vScale: 1.4 }));
      const cowl = shell([
        [0.060, B.SKULL_R * 1.14, 1.06, -0.010], [-0.030, B.SKULL_R * 1.24, 1.10, -0.030],
        [-0.120, B.SKULL_R * 1.30, 1.14, -0.048],
      ], c.mat, { deep: 1.0, capBottom: false, capTop: false });
      g.add(cowl);
    }
    c.glow(g, 0.176, B.SKULL_R * 1.16, 1.02);
    out.push({ anchor: 'head', node: g });
    return out;
  },

  chest(c) {
    const B = c.body;
    const out = [];
    const g = new THREE.Group();
    const w = B.TORSO_HALF;
    if (c.hard) {
      // a cuirass: front and back one shell, standing off the body
      g.add(shell([
        [0.130, w * 0.76, 0.86], [0.230, w * 0.84, 0.80], [0.340, w * 0.96, 0.74],
        [0.430, w * 1.03, 0.70], [0.500, w * 0.98, 0.70], [0.540, w * 0.70, 0.76],
      ], c.mat, { deep: 0.70, vScale: 1.6, capTop: false, capBottom: false }));
      // the gorget, and a fauld skirting the belly
      g.add(band(0.545, w * 0.72, 0.036, 0.78, c.trim));
      g.add(shell([[0.126, w * 0.80, 0.84], [0.060, w * 0.86, 0.84], [0.010, w * 0.84, 0.84]], c.mat, { deep: 0.84, capTop: false, capBottom: false }));
    } else {
      // a robe or a jerkin: a looser layer, with a short skirt that clears the knees
      g.add(shell([
        [0.545, w * 0.68, 0.76], [0.470, w * 1.02, 0.70], [0.340, w * 0.98, 0.74],
        [0.200, w * 0.82, 0.80], [0.090, w * 0.86, 0.82], [-0.120, w * 1.06, 0.86],
      ], c.mat, { deep: 0.78, vScale: 1.8, capTop: false, capBottom: false }));
      // the front seam
      const seam = new THREE.BoxGeometry(0.022, 0.520, 0.014);
      seam.translate(0, 0.290, w * 0.60);
      g.add(put(seam, c.trim));
    }
    c.glow(g, 0.470, w * 1.06, 0.72);
    out.push({ anchor: 'torso', node: g });

    // pauldrons ride the arms, not the chest, or they tear off at the first swing
    for (const anchor of ['armL', 'armR']) {
      const p = new THREE.Group();
      const side = anchor === 'armL' ? -1 : 1;
      if (c.hard) {
        p.add(shell([
          [0.038, 0.058, 0.94], [-0.010, 0.090, 0.94], [-0.056, 0.098, 0.94], [-0.098, 0.082, 0.94],
        ], c.mat, { deep: 0.94, capTop: false, capBottom: false }));
        p.add(band(-0.076, 0.100, 0.020, 0.94, c.trim));
      } else {
        p.add(shell([[0.020, 0.070, 0.96], [-0.030, 0.090, 0.96], [-0.070, 0.082, 0.96]], c.mat, { deep: 0.96, capTop: false, capBottom: false }));
      }
      p.rotation.z = side * 0.12;
      c.glow(p, -0.078, 0.102, 0.94);
      out.push({ anchor, node: p });
    }
    return out;
  },

  hands(c) {
    const out = [];
    for (const anchor of ['handL', 'handR']) {
      const side = anchor === 'handL' ? -1 : 1;
      const g = new THREE.Group();
      // the hand anchor sits at the wrist, so the glove is built around zero
      g.add(shell([
        [0.062, 0.040, 0.80], [0.020, 0.044, 0.68], [-0.024, 0.046, 0.62], [-0.052, 0.034, 0.62],
      ], c.mat, { deep: 0.66, vScale: 1.2 }));
      if (c.hard) {
        // gauntlet cuff and knuckle plates
        g.add(band(0.076, 0.050, 0.030, 0.86, c.trim));
        for (let i = 0; i < 3; i++) {
          const k = new THREE.BoxGeometry(0.030, 0.010, 0.016);
          k.translate(0, -0.006 - i * 0.016, 0.030);
          g.add(put(k, c.trim));
        }
      }
      const thumb = shell([[0.020, 0.014, 1], [-0.012, 0.012, 1]], c.mat, { deep: 1 });
      thumb.position.set(side * 0.032, 0, 0.014);
      thumb.rotation.z = side * 0.55;
      g.add(thumb);
      c.glow(g, 0.070, 0.052, 0.84);
      out.push({ anchor, node: g });
    }
    return out;
  },

  wrists(c) {
    const B = c.body;
    const out = [];
    for (const anchor of ['armL', 'armR']) {
      const g = new THREE.Group();
      g.add(shell([
        [-0.400, B.FOREARM_R * 1.16, 0.94], [-0.470, B.FOREARM_R * 1.10, 0.94], [-0.540, B.FOREARM_R * 1.02, 0.94],
      ], c.mat, { deep: 0.94, vScale: 1.2, capTop: false, capBottom: false }));
      for (const y of [-0.415, -0.525]) {
        const lace = new THREE.TorusGeometry(B.FOREARM_R * 1.16, 0.004, 5, 12);
        lace.rotateX(Math.PI / 2);
        lace.translate(0, y, 0);
        g.add(put(lace, c.strap));
      }
      c.glow(g, -0.470, B.FOREARM_R * 1.20, 0.94);
      out.push({ anchor, node: g });
    }
    return out;
  },

  waist(c) {
    const B = c.body;
    const w = B.TORSO_HALF;
    const g = new THREE.Group();
    g.add(shell([[0.030, w * 0.80, 0.84], [0.070, w * 0.86, 0.84], [0.112, w * 0.80, 0.84]], c.mat, { deep: 0.84, capTop: false, capBottom: false }));
    const buckle = new THREE.BoxGeometry(0.062, 0.052, 0.018);
    buckle.translate(0, 0.072, w * 0.72);
    g.add(put(buckle, c.trim));
    if (c.hard) {
      // tassets, the two plates that hang off a war belt
      for (const s of [-1, 1]) {
        const t = new THREE.BoxGeometry(0.090, 0.130, 0.016);
        t.translate(s * 0.070, -0.030, w * 0.60);
        const m = put(t, c.mat);
        m.rotation.x = -0.12;
        g.add(m);
      }
    } else {
      // a sash: the loose end hanging at the left hip
      const tail = shell([[0.060, 0.026, 1.4], [-0.060, 0.030, 1.6], [-0.180, 0.022, 1.5]], c.mat, { deep: 1 });
      tail.position.set(-w * 0.72, 0, 0.030);
      g.add(tail);
    }
    c.glow(g, 0.070, w * 0.90, 0.84);
    return [{ anchor: 'torso', node: g }];
  },

  legs(c) {
    const B = c.body;
    const out = [];
    for (const anchor of ['legL', 'legR']) {
      const g = new THREE.Group();
      g.add(shell([
        [-0.020, B.THIGH_R * 1.10, 0.94], [-0.150, B.THIGH_R * 1.06, 0.94],
        [-0.300, B.THIGH_R * 0.98, 0.94], [-B.THIGH + 0.010, B.THIGH_R * 0.88, 0.96],
      ], c.mat, { deep: 0.94, vScale: 1.6, capTop: false, capBottom: false }));
      c.glow(g, -0.040, B.THIGH_R * 1.14, 0.94);
      out.push({ anchor, node: g });
    }
    for (const anchor of ['shinL', 'shinR']) {
      const g = new THREE.Group();
      if (c.hard) {
        // a greave: the front of the shin only, so the knee still bends
        g.add(shell([
          [0.010, B.SHIN_R * 1.06, 1.02, 0.010], [-0.090, B.SHIN_R * 1.02, 1.04, 0.014],
          [-0.240, B.SHIN_R * 0.90, 1.04, 0.012], [-B.SHIN + 0.020, B.SHIN_R * 0.78, 1.02, 0.008],
        ], c.mat, { deep: 0.62, vScale: 1.6, capTop: false, capBottom: false }));
        const knee = blob(B.SHIN_R * 1.15, c.trim, 0.8, 0.9);
        knee.position.set(0, 0.010, 0.020);
        g.add(knee);
      } else {
        g.add(shell([
          [0.010, B.SHIN_R * 1.08, 0.96], [-0.120, B.SHIN_R * 1.02, 0.96], [-B.SHIN + 0.020, B.SHIN_R * 0.84, 0.98],
        ], c.mat, { deep: 0.96, vScale: 1.4, capTop: false, capBottom: false }));
      }
      c.glow(g, -0.060, B.SHIN_R * 1.14, 0.96);
      out.push({ anchor, node: g });
    }
    return out;
  },

  feet(c) {
    const B = c.body;
    const out = [];
    for (const anchor of ['footL', 'footR']) {
      const g = new THREE.Group();
      // the foot anchor is the ankle; the sole of the rig is 0.12 below it
      g.add(shell([
        [0.040, 0.066, 0.98], [-0.010, 0.070, 1.14, 0.008], [-0.062, 0.078, 1.55, 0.032],
        [-0.104, 0.079, 1.86, 0.044], [-B.ANKLE_Y - 0.004, 0.066, 1.80, 0.044],
      ], c.mat, { deep: 1.2, vScale: 1.6 }));
      if (c.hard) {
        const toe = new THREE.BoxGeometry(0.090, 0.026, 0.060);
        toe.translate(0, -0.100, 0.135);
        g.add(put(toe, c.trim));
      } else {
        const cuff = new THREE.TorusGeometry(0.070, 0.008, 6, 14);
        cuff.rotateX(Math.PI / 2);
        cuff.translate(0, 0.036, 0.004);
        g.add(put(cuff, c.strap));
      }
      c.glow(g, 0.030, 0.074, 1.0);
      out.push({ anchor, node: g });
    }
    return out;
  },

  back(c) {
    const g = new THREE.Group();
    // a cloak: the back three quarters of a cone, with folds, hung from the
    // shoulder blades. Only the back half, so it never covers the chest.
    const seg = 16, arc = Math.PI * 1.15;
    const profile = [];
    for (let i = 0; i <= seg; i++) {
      const a = -arc / 2 + (i / seg) * arc;
      const fold = 1 + Math.sin(i * 2.1) * 0.045;
      profile.push([Math.sin(a) * fold, -Math.cos(a) * fold]);
    }
    for (let i = seg; i >= 0; i--) {
      const a = -arc / 2 + (i / seg) * arc;
      const fold = (1 + Math.sin(i * 2.1) * 0.045) * 0.94;
      profile.push([Math.sin(a) * fold, -Math.cos(a) * fold]);
    }
    const rings = [
      { y: 0.055, sx: 0.150, sz: 0.115 },
      { y: -0.060, sx: 0.205, sz: 0.150 },
      { y: -0.300, sx: 0.255, sz: 0.180 },
      { y: -0.560, sx: 0.290, sz: 0.200 },
      { y: -0.800, sx: 0.310, sz: 0.215 },
    ].map((r, i) => ({ ...r, v: i * 0.5 }));
    g.add(put(loft(profile, rings, { capTop: false, capBottom: false }), c.mat));
    // the clasp across the collarbones
    const clasp = new THREE.BoxGeometry(0.190, 0.030, 0.024);
    clasp.translate(0, 0.070, 0.020);
    g.add(put(clasp, c.trim));
    c.glow(g, -0.760, 0.316, 0.70);
    return [{ anchor: 'back', node: g }];
  },
};

/** A neck chain and a pendant. Not an armour piece; still worn, still shown. */
function amuletNode(c) {
  const B = c.body;
  const g = new THREE.Group();
  const chain = new THREE.TorusGeometry(0.075, 0.005, 6, 20);
  chain.rotateX(Math.PI / 2 - 0.35);
  chain.translate(0, 0.505, 0.012);
  g.add(put(chain, c.trim));
  const stone = blob(0.020, c.glowStone || c.trim, 1.2, 0.6);
  stone.position.set(0, 0.435, B.TORSO_DEEP * 0.92);
  g.add(stone);
  return [{ anchor: 'torso', node: g }];
}

function ringNode(c, anchor) {
  const g = new THREE.Group();
  const r = new THREE.TorusGeometry(0.017, 0.004, 6, 12);
  r.rotateX(Math.PI / 2);
  r.translate(0, -0.030, 0.006);
  g.add(put(r, c.trim));
  const stone = blob(0.008, c.glowStone || c.trim, 1, 1);
  stone.position.set(0, -0.030, 0.020);
  g.add(stone);
  return [{ anchor, node: g }];
}

// ---------------------------------------------------------------------------
// How a held thing sits in the fist. The model arrives with its grip at the
// origin and its business end along +y; these are the offsets that turn "in
// the hand" into "held the way a person holds it". Tuned against screenshots;
// they are the one table to edit when a sword looks wrong in the hand.

export const HOLD = {
  weapon: { pos: [0, -0.02, 0.03], rot: [-0.25, 0, 0] },
  twoHander: { pos: [0, -0.02, 0.05], rot: [-0.35, 0, 0] },
  bowDrawn: { pos: [0, 0, 0.04], rot: [0, 0, Math.PI / 2] },
  shield: { pos: [0, -0.06, 0.10], rot: [0.15, 0, 0] },
  offhand: { pos: [0, -0.02, 0.04], rot: [-0.20, 0, 0] },
  /** the bow slung across the shoulder blades */
  slung: { pos: [0, -0.06, -0.06], rot: [0.25, 0, 0.62] },
  /** a melee weapon sheathed at the left hip while the bow is up */
  sheathed: { pos: [-0.17, 0.06, -0.03], rot: [0.10, 0, 0.95] },
};

function applyHold(node, hold) {
  node.position.set(hold.pos[0], hold.pos[1], hold.pos[2]);
  node.rotation.set(hold.rot[0], hold.rot[1], hold.rot[2]);
  return node;
}

// ---------------------------------------------------------------------------
// The wardrobe: what is currently on each rig, and the signature that says
// whether it still is.

const WORN = new WeakMap();

function wardrobe(rig) {
  let w = WORN.get(rig);
  if (!w) { w = new Map(); WORN.set(rig, w); }
  return w;
}

function strip(rig, key) {
  const w = wardrobe(rig);
  const entry = w.get(key);
  if (!entry) return 0;
  let n = 0;
  for (const node of entry.nodes) { disposeModel(node); n++; }
  w.delete(key);
  return n;
}

/** Every mesh gear has put on the rig. Used by the test, and by anyone counting. */
export function wornNodes(rig) {
  const out = [];
  for (const [key, entry] of wardrobe(rig)) {
    for (const node of entry.nodes) out.push({ key, anchor: node.userData.gearAnchor, node });
  }
  return out;
}

/** How many gear meshes hang off each anchor right now. */
export function gearCounts(rig) {
  const counts = {};
  for (const { anchor } of wornNodes(rig)) counts[anchor] = (counts[anchor] || 0) + 1;
  return counts;
}

// ---------------------------------------------------------------------------

const PIECE_SLOT = Object.fromEntries(ARMOR_PIECES.map((p) => [p.slot, p.id]));
const TIER_IDS = new Set(ARMOR_TIERS.map((t) => t.id));

function contextFor(item, base, body) {
  const tier = TIER_IDS.has(base?.material) ? base.material : 'leather';
  const rarity = tierOf(item?.rarity);
  const colour = new THREE.Color(RARITY[item?.rarity]?.colour || '#ffffff').getHex();
  const mat = armourMat(tier, item);
  return {
    body, tier, hard: HARD_TIERS.has(tier), mat,
    trim: trimMat(tier),
    strap: strapMat(),
    glowStone: rarity >= EPIC ? glowMat(colour) : null,
    rarity, colour,
    glow(group, y, halfWidth, deep) {
      if (rarity < EPIC) return;
      const b = band(y, halfWidth * 1.02, 0.012, deep, glowMat(colour));
      b.castShadow = false;
      group.add(b);
    },
  };
}

/** The visual key a slot's contents are filed under. */
function signature(slot, item, anchorKey) {
  if (!item) return null;
  const b = baseFor(item);
  if (!b) return null;
  return `${slot}:${b.id}:${item.rarity || 'common'}:${item.material || '-'}:${anchorKey}`;
}

function heldFor(item, opts) {
  const b = baseFor(item);
  if (!b || !hasWeaponModel(b.id)) return null;
  return buildWeaponModel(item, { light: opts.light !== false });
}

/**
 * Put what is equipped on the rig and take off what is not.
 *
 * @param {object} rig        anything with `parts` shaped like player.js's
 * @param {object} equipment  character.equipment, or an inventory with one
 * @param {object} opts
 *   ranged  true when the ranged set is the drawn one: the bow comes to the
 *           hands and the melee weapon goes to the hip
 *   light   false to leave off the point lights legendaries and torches carry
 *   body    body-plan overrides, for a rig that is not the player's size
 * @returns {{ changed: string[], grip: string|null, nodes: number, triangles: number }}
 */
export function dressRig(rig, equipment, opts = {}) {
  const parts = rig?.parts;
  if (!parts) throw new Error('dressRig: the rig has no parts');
  const eq = (equipment && equipment.equipment) || equipment || {};
  const body = { ...BODY, ...(rig.body || {}), ...(opts.body || {}) };
  const w = wardrobe(rig);
  const changed = [];

  const mainItem = eq.mainHand || null;
  const rangedItem = eq.ranged || null;
  const offItem = eq.offHand || null;
  const rangedUp = !!opts.ranged && !!rangedItem;
  const two = twoHanded(mainItem);

  // where each held thing goes this frame
  const mainAnchor = rangedUp ? 'torso' : 'handR';
  const rangedAnchor = rangedUp ? 'handL' : 'back';
  const offAnchor = 'handL';
  const showOff = !!offItem && !rangedUp && !two;

  /** Attach one slot's nodes if its signature changed; otherwise leave them be. */
  const fit = (key, sig, make) => {
    const have = w.get(key);
    if (have && have.sig === sig) return;
    if (have) strip(rig, key);
    if (!sig) { if (have) changed.push(key); return; }
    const nodes = [];
    for (const { anchor, node } of make()) {
      const at = parts[anchor];
      if (!at) continue;                       // a rig without that anchor simply wears less
      node.userData.gearKey = key;
      node.userData.gearAnchor = anchor;
      at.add(node);
      nodes.push(node);
    }
    w.set(key, { sig, nodes });
    changed.push(key);
  };

  // ---- held: the main hand, the off hand and the ranged weapon
  fit('mainHand', signature('mainHand', mainItem, mainAnchor), () => {
    const node = heldFor(mainItem, opts);
    if (!node) return [];
    applyHold(node, rangedUp ? HOLD.sheathed : (two ? HOLD.twoHander : HOLD.weapon));
    return [{ anchor: mainAnchor, node }];
  });

  fit('offHand', showOff ? signature('offHand', offItem, offAnchor) : null, () => {
    const node = heldFor(offItem, opts);
    if (!node) return [];
    const b = baseFor(offItem);
    applyHold(node, b?.kind === 'shield' ? HOLD.shield : HOLD.offhand);
    return [{ anchor: offAnchor, node }];
  });

  fit('ranged', signature('ranged', rangedItem, rangedAnchor), () => {
    const node = heldFor(rangedItem, opts);
    if (!node) return [];
    applyHold(node, rangedUp ? HOLD.bowDrawn : HOLD.slung);
    return [{ anchor: rangedAnchor, node }];
  });

  // ---- worn: the eight armour pieces, plus the neck and the two rings
  for (const slot of SLOTS) {
    const piece = PIECE_SLOT[slot];
    if (!piece) continue;
    const item = eq[slot] || null;
    const base = baseFor(item);
    const sig = base && base.kind === 'armour' ? signature(slot, item, piece) : null;
    fit(slot, sig, () => PIECES[piece](contextFor(item, base, body)));
  }

  fit('neck', signature('neck', eq.neck, 'torso'), () => amuletNode(contextFor(eq.neck, baseFor(eq.neck), body)));
  fit('ring1', signature('ring1', eq.ring1, 'handR'), () => ringNode(contextFor(eq.ring1, baseFor(eq.ring1), body), 'handR'));
  fit('ring2', signature('ring2', eq.ring2, 'handL'), () => ringNode(contextFor(eq.ring2, baseFor(eq.ring2), body), 'handL'));

  // ---- one soft light for a legendary on the body, not one per piece
  const legendary = SLOTS.some((s) => tierOf(eq[s]?.rarity) >= LEGENDARY);
  fit('aura', legendary && opts.light !== false ? 'aura:legendary' : null, () => {
    const l = new THREE.PointLight(new THREE.Color(RARITY.legendary.colour).getHex(), 1.1, 3.2, 2);
    l.position.set(0, 0.35, 0);
    l.name = 'legendaryAura';
    return [{ anchor: 'torso', node: l }];
  });

  // ---- and the hands close on what they are holding
  const grip = rangedUp ? 'bow'
    : two ? 'two'
      : (mainItem && showOff) ? 'oneShield'
        : mainItem ? 'one'
          : showOff ? 'shield'
            : null;
  rig.grip = grip;

  const nodes = wornNodes(rig);
  return {
    changed, grip, nodes: nodes.length,
    triangles: nodes.reduce((s, n) => s + countTriangles(n.node), 0),
  };
}

/** Take everything gear put on the rig back off it. Leaves the body alone. */
export function undress(rig) {
  if (!rig) return 0;
  let n = 0;
  for (const key of [...wardrobe(rig).keys()]) n += strip(rig, key);
  rig.grip = null;
  return n;
}
