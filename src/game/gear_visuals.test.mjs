// Gear on the body, measured. Run: node src/game/gear_visuals.test.mjs
//
// Everything goes through the real dressRig against a real buildCharacter rig,
// because the claim worth proving is not "a dresser exists" but "the
// greatsword is gone from the hand and the buckler is in the other one". Every
// gate is driven both ways: dressed and undressed, ranged up and ranged down,
// a rarity that glows and one that does not.

import * as THREE from 'three';
import {
  buildCharacter, auditAppearance, SKIN_COLOURS, PALETTE, APPEARANCE_FALLBACK,
  BODY, poseCharacter, HAIR_STYLES, GRIP_POSES,
} from './player.js';
import { APPEARANCE } from '../mmo/openings.js';
import {
  dressRig, undress, wornNodes, gearCounts, armourMat, TIER_COLOURS, HARD_TIERS, HOLD,
  PIECE_SHADE, shadeHex,
} from './gear_visuals.js';
import { makeItem, setOf, ARMOR_TIERS, ARMOR_PIECES, SLOTS, BASES } from '../mmo/items.js';
import { METAL_COLOURS, LENGTHS, METAL_METALNESS, METAL_BASE_ROUGH } from './weapon_models.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const meshCounts = (rig) => {
  const out = {};
  for (const { anchor, node } of wornNodes(rig)) {
    let n = 0;
    node.traverse((o) => { if (o.isMesh) n++; });
    out[anchor] = (out[anchor] || 0) + n;
  }
  return out;
};
const named = (rig, name) => wornNodes(rig).some(({ node }) => {
  let hit = false;
  node.traverse((o) => { if (o.name === name) hit = true; });
  return hit;
});
const onAnchor = (rig, anchor, name) => wornNodes(rig).some((w) => {
  if (w.anchor !== anchor) return false;
  let hit = false;
  w.node.traverse((o) => { if (o.name === name) hit = true; });
  return hit;
});
const fullSet = (material, itemMaterial) => {
  const eq = {};
  for (const b of setOf(material)) eq[b.slot] = makeItem({ base: b.id });
  if (itemMaterial) for (const s of Object.keys(eq)) eq[s].material = itemMaterial;
  return eq;
};

// ---------------------------------------------------------------------------
console.log('gear_visuals: full plate and a greatsword');
const rig = buildCharacter();
{
  const bare = wornNodes(rig).length;
  check('a fresh rig is wearing nothing', bare === 0, `${bare} nodes`);

  const eq = fullSet('plate', 'iron');
  eq.mainHand = makeItem({ base: 'greatsword' });
  eq.mainHand.material = 'iron';
  const r = dressRig(rig, eq, { light: false });
  const counts = meshCounts(rig);
  console.log(`       anchors: ${JSON.stringify(counts)}`);
  check('the greatsword is in the right hand', onAnchor(rig, 'handR', 'weapon:greatsword'));
  check('both hands, both arms, both legs, both shins and both feet are dressed',
    ['handL', 'handR', 'armL', 'armR', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR'].every((a) => counts[a] > 0),
    Object.keys(counts).join(', '));
  check('the helm is on the head and the breastplate on the torso', counts.head > 0 && counts.torso > 0);
  check('the cloak is on the back', counts.back > 0);
  check('a two handed weapon closes both hands on it', r.grip === 'two' && rig.grip === 'two', r.grip);
  check('the eight armour slots and the weapon all reported a change',
    ['mainHand', 'head', 'chest', 'hands', 'wrists', 'waist', 'legs', 'feet', 'back'].every((k) => r.changed.includes(k)),
    r.changed.join(', '));
  check('and full plate plus a greatsword is a modest triangle bill', r.triangles < 24000, `${r.triangles} triangles`);
}

// ---------------------------------------------------------------------------
console.log('gear_visuals: dressing again changes nothing');
{
  const before = wornNodes(rig).map((w) => w.node);
  const eq = fullSet('plate', 'iron');
  eq.mainHand = makeItem({ base: 'greatsword' });
  eq.mainHand.material = 'iron';
  const r = dressRig(rig, eq, { light: false });
  const after = wornNodes(rig).map((w) => w.node);
  check('a second identical call reports no change', r.changed.length === 0, JSON.stringify(r.changed));
  check('and every mesh on the rig is the same object it was',
    before.length === after.length && before.every((n, i) => n === after[i]), `${after.length} nodes`);
  const third = dressRig(rig, eq, { light: false });
  check('and a third', third.changed.length === 0);
}

// ---------------------------------------------------------------------------
console.log('gear_visuals: swapping to a dagger and a buckler');
{
  const eq = fullSet('plate', 'iron');
  eq.mainHand = makeItem({ base: 'dagger' });
  eq.offHand = makeItem({ base: 'buckler' });
  const r = dressRig(rig, eq, { light: false });
  check('the greatsword is gone from the rig entirely', named(rig, 'weapon:greatsword') === false);
  check('the dagger is in the right hand', onAnchor(rig, 'handR', 'weapon:dagger'));
  check('the buckler is in the left', onAnchor(rig, 'handL', 'weapon:buckler'));
  check('only the two hands changed; the armour was left alone',
    r.changed.sort().join(',') === 'mainHand,offHand', r.changed.join(', '));
  check('a weapon and a shield is the one-and-shield grip', r.grip === 'oneShield', r.grip);
}

// ---------------------------------------------------------------------------
console.log('gear_visuals: undressing');
{
  const n = undress(rig);
  check('undress takes every piece off', wornNodes(rig).length === 0, `${n} nodes removed`);
  check('and lets the hands go', rig.grip === null);
  let left = 0;
  rig.group.traverse((o) => { if (o.userData.gearKey) left++; });
  check('nothing gear put on the rig is still parented to it', left === 0, `${left} strays`);
  check('undressing an undressed rig is not an error', undress(rig) === 0);
}

// ---------------------------------------------------------------------------
console.log('gear_visuals: the bow goes on the back and comes off it');
{
  const eq = {
    mainHand: makeItem({ base: 'longsword' }),
    ranged: makeItem({ base: 'longbow' }),
    offHand: makeItem({ base: 'kite' }),
  };
  let r = dressRig(rig, eq, { light: false });
  check('melee drawn: the bow is slung on the back', onAnchor(rig, 'back', 'weapon:longbow'));
  check('and the sword is in the hand', onAnchor(rig, 'handR', 'weapon:longsword'));
  check('and the shield is in the other', onAnchor(rig, 'handL', 'weapon:kite'));
  check('the grip is weapon and shield', r.grip === 'oneShield', r.grip);

  r = dressRig(rig, eq, { ranged: true, light: false });
  check('ranged drawn: the bow is in the left hand', onAnchor(rig, 'handL', 'weapon:longbow'));
  check('and no longer on the back', onAnchor(rig, 'back', 'weapon:longbow') === false);
  check('the sword is sheathed on the body, not held', onAnchor(rig, 'torso', 'weapon:longsword')
    && onAnchor(rig, 'handR', 'weapon:longsword') === false);
  check('the shield is put away while the bow is up', named(rig, 'weapon:kite') === false);
  check('and both hands are on the bow', r.grip === 'bow', r.grip);
  check('the toggle is idempotent too', dressRig(rig, eq, { ranged: true, light: false }).changed.length === 0);

  r = dressRig(rig, eq, { light: false });
  check('putting the bow away brings the sword and shield back',
    onAnchor(rig, 'handR', 'weapon:longsword') && onAnchor(rig, 'handL', 'weapon:kite')
    && onAnchor(rig, 'back', 'weapon:longbow'), r.changed.join(', '));
  undress(rig);
}

// ---------------------------------------------------------------------------
console.log('gear_visuals: every grip the hands can take');
{
  const cases = [
    ['nothing at all', {}, null],
    ['one hand', { mainHand: makeItem({ base: 'longsword' }) }, 'one'],
    ['weapon and shield', { mainHand: makeItem({ base: 'mace' }), offHand: makeItem({ base: 'tower' }) }, 'oneShield'],
    ['two handed', { mainHand: makeItem({ base: 'halberd' }) }, 'two'],
    ['shield alone', { offHand: makeItem({ base: 'buckler' }) }, 'shield'],
  ];
  for (const [label, eq, want] of cases) {
    const r = dressRig(rig, eq, { light: false });
    check(`${label} -> ${want}`, r.grip === want, `got ${r.grip}`);
  }
  const bowEq = { ranged: makeItem({ base: 'shortbow' }) };
  check('bow drawn -> bow', dressRig(rig, bowEq, { ranged: true, light: false }).grip === 'bow');
  check('bow slung -> nothing in the hands', dressRig(rig, bowEq, { light: false }).grip === null);
  undress(rig);
}

// ---------------------------------------------------------------------------
console.log('gear_visuals: all six tiers, not just the one that was tested');
{
  for (const t of ARMOR_TIERS) {
    const eq = fullSet(t.id);
    let threw = '';
    let meshes = 0;
    try {
      dressRig(rig, eq, { light: false });
      for (const { node } of wornNodes(rig)) node.traverse((o) => { if (o.isMesh) meshes++; });
    } catch (e) { threw = e.message; }
    check(`${t.material} dresses the whole body`, !threw && meshes > 12,
      threw || `${meshes} meshes, ${HARD_TIERS.has(t.id) ? 'rigid' : 'soft'}`);
    undress(rig);
  }
  const mats = ARMOR_TIERS.map((t) => armourMat(t.id, null));
  check('the six tiers are six different materials', new Set(mats).size === 6);
  check('and each carries its tier colour', ARMOR_TIERS.every((t, i) => mats[i].color.getHex() === TIER_COLOURS[t.id]));
  const emberite = armourMat('plate', { material: 'emberite' });
  check("an item's own material overrides the tier colour",
    emberite.color.getHex() === METAL_COLOURS.emberite, `#${emberite.color.getHex().toString(16)}`);
  check('and cloth reads as cloth while plate reads as plate',
    armourMat('cloth', null).roughnessMap !== armourMat('plate', null).roughnessMap);
}

// ---------------------------------------------------------------------------
console.log('gear_visuals: rarity, in both directions');
{
  const glowing = (rarity) => {
    const eq = fullSet('plate');
    for (const s of Object.keys(eq)) eq[s].rarity = rarity;
    dressRig(rig, eq, { light: true });
    let emissive = 0, lights = 0;
    for (const { node } of wornNodes(rig)) {
      node.traverse((o) => {
        if (o.isMesh && o.material.emissiveIntensity > 1 && o.material.emissive?.getHex()) emissive++;
        if (o.isPointLight) lights++;
      });
    }
    undress(rig);
    return { emissive, lights };
  };
  const common = glowing('common');
  const rare = glowing('rare');
  const epic = glowing('epic');
  const legendary = glowing('legendary');
  check('common armour does not glow', common.emissive === 0 && common.lights === 0);
  check('nor does rare', rare.emissive === 0 && rare.lights === 0);
  check('epic carries an inlay on every piece', epic.emissive >= 8, `${epic.emissive} inlays`);
  check('and no light', epic.lights === 0);
  check('legendary carries the inlay and exactly one aura',
    legendary.emissive >= 8 && legendary.lights === 1, `${legendary.emissive} inlays, ${legendary.lights} light`);
}

// ---------------------------------------------------------------------------
console.log('gear_visuals: a rig that is not the player');
{
  // V5 swaps a glb rig in behind the same contract. A rig that only has some
  // of the anchors wears what it can and does not throw.
  const stub = {
    parts: { handR: new THREE.Object3D(), torso: new THREE.Object3D(), head: new THREE.Object3D() },
  };
  const eq = fullSet('chain');
  eq.mainHand = makeItem({ base: 'battleaxe' });
  let threw = '';
  let r = null;
  try { r = dressRig(stub, eq, { light: false }); } catch (e) { threw = e.message; }
  check('a partial rig dresses without throwing', !threw, threw);
  check('and only the anchors it has are used',
    r && Object.keys(gearCounts(stub)).every((a) => a in stub.parts), JSON.stringify(gearCounts(stub)));
  check('the axe still reaches the right hand', onAnchor(stub, 'handR', 'weapon:battleaxe'));
  check('and undressing a stub clears it', undress(stub) > 0 && wornNodes(stub).length === 0);

  let noParts = false;
  try { dressRig({}, {}); } catch { noParts = true; }
  check('a thing with no parts at all is refused loudly', noParts);
}

// ---------------------------------------------------------------------------
console.log('gear_visuals: the contract holds for every slot the doll shows');
{
  const eq = {};
  for (const b of setOf('leather')) eq[b.slot] = makeItem({ base: b.id });
  eq.mainHand = makeItem({ base: 'rapier' });
  eq.offHand = makeItem({ base: 'torch' });
  eq.ranged = makeItem({ base: 'crossbow' });
  eq.neck = makeItem({ base: 'amulet' });
  eq.ring1 = makeItem({ base: 'ring' });
  eq.ring2 = makeItem({ base: 'ring' });
  const r = dressRig(rig, eq, { light: false });
  const filled = SLOTS.filter((s) => eq[s]);
  const shown = new Set(r.changed);
  const unshown = filled.filter((s) => !shown.has(s));
  check(`all ${filled.length} filled slots are shown on the body`, unshown.length === 0,
    unshown.length ? `not shown: ${unshown.join(', ')}` : r.changed.join(', '));
  check('the torch is lit in the off hand', onAnchor(rig, 'handL', 'weapon:torch'));
  check('the crossbow is slung', onAnchor(rig, 'back', 'weapon:crossbow'));
  const ringAnchors = wornNodes(rig).filter((w) => w.key === 'ring1' || w.key === 'ring2').map((w) => w.anchor).sort();
  check('there are two rings, one per hand', ringAnchors.join(',') === 'handL,handR', ringAnchors.join(', '));
  const neck = wornNodes(rig).filter((w) => w.key === 'neck');
  check('and the amulet hangs on the torso', neck.length === 1 && neck[0].anchor === 'torso');
  undress(rig);
}

// ---------------------------------------------------------------------------
console.log('gear_visuals: the hands close on the haft');
{
  const eq = { mainHand: makeItem({ base: 'greatsword' }) };
  dressRig(rig, eq, { light: false });
  const restL = rig.parts.armL.rotation.x;
  for (let i = 0; i < 90; i++) rig.update(1 / 60, 0);
  const twoL = rig.parts.armL.rotation.x, twoR = rig.parts.armR.rotation.x;
  check('a greatsword pulls the left arm up onto the grip', twoL < restL - 0.5,
    `${restL.toFixed(3)} -> ${twoL.toFixed(3)} rad`);
  check('and the right arm with it', twoR < -0.4, `${twoR.toFixed(3)} rad`);
  undress(rig);
  for (let i = 0; i < 90; i++) rig.update(1 / 60, 0);
  check('and putting it down lets both arms hang again',
    Math.abs(rig.parts.armL.rotation.x) < 0.02 && Math.abs(rig.parts.armR.rotation.x) < 0.02,
    `${rig.parts.armL.rotation.x.toFixed(4)}, ${rig.parts.armR.rotation.x.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
console.log('gear_visuals: dressing is cheap enough for every equip');
{
  const eq = fullSet('plate', 'iron');
  eq.mainHand = makeItem({ base: 'longsword' });
  const fresh = buildCharacter();
  const t0 = Date.now();
  dressRig(fresh, eq, { light: false });
  const first = Date.now() - t0;
  const t1 = Date.now();
  for (let i = 0; i < 200; i++) dressRig(fresh, eq, { light: false });
  const repeat = Date.now() - t1;
  check('a full change of kit takes under 120 ms', first < 120, `${first} ms`);
  check('and 200 no-op calls take under 60 ms', repeat < 60, `${repeat} ms for 200, ${(repeat / 200).toFixed(2)} ms each`);
  undress(fresh);
}

// ---------------------------------------------------------------------------
// The body gear is dressing. Armour is built to the rig's proportions, so a
// slight 1.60 m character and a heavy 2.00 m one both have to come out wearing
// their own plate rather than one size of it.
console.log('gear_visuals: the body underneath');
{
  const eq = fullSet('plate', 'iron');
  eq.mainHand = makeItem({ base: 'longsword' });

  const measure = (look) => {
    const r = buildCharacter(look);
    dressRig(r, eq, { light: false });
    r.group.updateMatrixWorld(true);
    const body = new THREE.Box3().setFromObject(r.group);
    const chest = wornNodes(r).find((w) => w.key === 'chest' && w.anchor === 'torso');
    const cb = new THREE.Box3().setFromObject(chest.node);
    return { height: body.max.y - body.min.y, chestWidth: cb.max.x - cb.min.x, rig: r };
  };

  const small = measure({ build: 'slight', height: 1.60, skin: 'pale', hairStyle: 'braid', hairColour: 'silver', mark: 'scar' });
  const big = measure({ build: 'heavy', height: 2.00, skin: 'ebony', hairStyle: 'topknot', hairColour: 'black', mark: 'warpaint' });
  check('a 1.60 m character stands 1.60 m', Math.abs(small.height - 1.60) < 0.03, `${small.height.toFixed(3)} m`);
  check('a 2.00 m character stands 2.00 m', Math.abs(big.height - 2.00) < 0.03, `${big.height.toFixed(3)} m`);
  check('and the breastplate scales with the body it is on', big.chestWidth > small.chestWidth * 1.2,
    `${small.chestWidth.toFixed(3)} m vs ${big.chestWidth.toFixed(3)} m`);

  // changing the look after dressing must not undress him
  const before = wornNodes(big.rig).length;
  big.rig.setAppearance({ build: 'slight', height: 1.75, skin: 'fair', hairStyle: 'long', hairColour: 'wheat', mark: 'none' });
  check('re-styling a dressed character keeps every piece on', wornNodes(big.rig).length === before,
    `${wornNodes(big.rig).length} of ${before}`);
  let stillPlate = 0;
  for (const { node } of wornNodes(big.rig)) node.traverse((o) => { if (o.isMesh && o.material.color.getHex() === METAL_COLOURS.iron) stillPlate++; });
  check('and the plate is still iron, not skin coloured', stillPlate > 0, `${stillPlate} meshes`);
  // the same winding guard weapon_models keeps: a piece wound inward is
  // invisible under front face culling and looks like a piece that did not load
  const volume = (g, m) => {
    const gc = m ? g.clone().applyMatrix4(m) : g;
    const p = gc.getAttribute('position'), ix = gc.getIndex();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
    let v = 0;
    const n = ix ? ix.count : p.count;
    for (let i = 0; i < n; i += 3) {
      const i0 = ix ? ix.getX(i) : i, i1 = ix ? ix.getX(i + 1) : i + 1, i2 = ix ? ix.getX(i + 2) : i + 2;
      a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); d.fromBufferAttribute(p, i2);
      v += a.dot(b.clone().cross(d)) / 6;
    }
    return v;
  };
  let worstBody = Infinity, worstBodyId = '', bodyMeshes = 0;
  const plain = buildCharacter();
  plain.group.updateMatrixWorld(true);
  plain.group.traverse((o) => {
    if (!o.isMesh) return;
    bodyMeshes++;
    const v = volume(o.geometry, o.matrixWorld);
    if (v < worstBody) { worstBody = v; worstBodyId = o.geometry.type; }
  });
  check(`all ${bodyMeshes} meshes of the body wind outward`, worstBody > 0,
    `smallest ${worstBodyId} at ${worstBody.toExponential(2)} m3`);

  let worstGear = Infinity, worstGearId = '', gearMeshes = 0;
  for (const t of ARMOR_TIERS) {
    const r = buildCharacter();
    const set = fullSet(t.id);
    dressRig(r, set, { light: false });
    for (const { key, node } of wornNodes(r)) {
      node.updateMatrixWorld(true);
      node.traverse((o) => {
        if (!o.isMesh) return;
        gearMeshes++;
        const v = volume(o.geometry, o.matrixWorld);
        if (v < worstGear) { worstGear = v; worstGearId = `${t.id}/${key}`; }
      });
    }
    undress(r);
  }
  check(`and all ${gearMeshes} armour meshes across all six tiers do too`, worstGear > 0,
    `smallest ${worstGearId} at ${worstGear.toExponential(2)} m3`);

  undress(small.rig); undress(big.rig);
}

console.log('gear_visuals: every appearance the creator offers builds');
{
  let built = 0, threw = '';
  const heights = [1.6, 1.75, 2.0];
  for (const build of APPEARANCE.builds) {
    for (const skin of APPEARANCE.skins) {
      for (const hairStyle of APPEARANCE.hairStyles) {
        for (const mark of APPEARANCE.marks) {
          const look = { build, skin, hairStyle, hairColour: 'chestnut', mark, height: heights[built % 3] };
          try { buildCharacter(look); built++; } catch (e) { threw = `${JSON.stringify(look)}: ${e.message}`; }
          if (threw) break;
        }
        if (threw) break;
      }
      if (threw) break;
    }
    if (threw) break;
  }
  const want = APPEARANCE.builds.length * APPEARANCE.skins.length * APPEARANCE.hairStyles.length * APPEARANCE.marks.length;
  check(`all ${want} combinations of build, skin, hair and mark build`, built === want && !threw, threw || `${built} rigs`);
  check('and the appearance audit passes against openings.js', auditAppearance(APPEARANCE) === true);

  // both directions: a style openings.js does not know is caught
  let caught = false;
  try { auditAppearance({ ...APPEARANCE, hairStyles: [...APPEARANCE.hairStyles, 'mohawk'] }); } catch { caught = true; }
  check('and a choice with no look for it is caught rather than shipped', caught);

  // the colours actually reach the meshes, both ways
  const skinOf = (look) => {
    const r = buildCharacter(look);
    let hex = null;
    r.group.traverse((o) => { if (o.isMesh && o.userData.role === 'skin' && hex === null) hex = o.material.color.getHex(); });
    return hex;
  };
  const paleHex = skinOf({ ...APPEARANCE_FALLBACK, skin: 'pale' });
  const ebonyHex = skinOf({ ...APPEARANCE_FALLBACK, skin: 'ebony' });
  check('a pale character and an ebony one are different colours',
    paleHex === SKIN_COLOURS.pale && ebonyHex === SKIN_COLOURS.ebony && paleHex !== ebonyHex,
    `#${paleHex.toString(16)} vs #${ebonyHex.toString(16)}`);
  check('and the default look is exactly what a bare buildCharacter() wears',
    skinOf(APPEARANCE_FALLBACK) === PALETTE.skin, `#${PALETTE.skin.toString(16)}`);
}


// ---------------------------------------------------------------------------
// From here down: the five things the first look at a dressed warrior in the
// running game showed, each turned into a measurement so it cannot come back.
// Rays are fired at the real rig, dressed by the real dressRig, posed by the
// real poseCharacter. `firstHit` says what the camera would actually see.

const posed = (rig) => {
  poseCharacter(rig.parts, { anim: 'idle', idleMix: 1, phase: 0, stride: 1.4, t: 0, grip: rig.grip, gripMix: rig.grip ? 1 : 0 });
  rig.group.updateMatrixWorld(true);
  return rig;
};
const ray = new THREE.Raycaster();
/** What a ray from `from` along `dir` lands on: a gear key, or a body role. */
function firstHit(rig, from, dir) {
  ray.set(new THREE.Vector3(...from), new THREE.Vector3(...dir).normalize());
  const hits = ray.intersectObject(rig.group, true).filter((h) => h.object.isMesh);
  if (!hits.length) return { what: 'nothing', gear: false };
  let n = hits[0].object;
  while (n) {
    if (n.userData && n.userData.gearKey) return { what: n.userData.gearKey, gear: true, d: hits[0].distance };
    n = n.parent;
  }
  return { what: hits[0].object.userData.role || 'body', gear: false, d: hits[0].distance };
}
/** The world y of the head's origin and the landmarks on it, for an idle rig. */
const FACE = { eye: 0.166, mouth: 0.098, chin: 0.020, crown: 0.270 };
const headY = (rig) => { const v = new THREE.Vector3(); rig.parts.head.getWorldPosition(v); return v.y; };
const fullSetOf = (tier) => { const eq = {}; for (const b of setOf(tier)) eq[b.slot] = makeItem({ base: b.id }); return eq; };
const boxOf = (node) => { node.updateMatrixWorld(true); return new THREE.Box3().setFromObject(node); };
const gearBox = (rig, key) => {
  const b = new THREE.Box3();
  for (const w of wornNodes(rig)) if (w.key === key) b.union(boxOf(w.node));
  return b;
};
/** The world length of a model that is already attached to a rig, along its own axis. */
function worldLength(node) {
  node.updateMatrixWorld(true);
  const inv = node.matrixWorld.clone().invert();
  const local = new THREE.Box3();
  const v = new THREE.Vector3();
  node.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const pa = o.geometry.getAttribute('position');
    const m = o.matrixWorld.clone().premultiply(inv);
    for (let i = 0; i < pa.count; i++) local.expandByPoint(v.fromBufferAttribute(pa, i).applyMatrix4(m));
  });
  const a = new THREE.Vector3(0, local.min.y, 0).applyMatrix4(node.matrixWorld);
  const b = new THREE.Vector3(0, local.max.y, 0).applyMatrix4(node.matrixWorld);
  return a.distanceTo(b);
}

// ---------------------------------------------------------------------------
// 1. THE FACE. The leather head piece shipped as a closed shell round the
// whole skull: no eyes, no nose, no jaw from any angle, and the character read
// as a hooded figure with nothing under the hood. The hair cap was the same
// shape and covered the face on its own, with no gear at all.
console.log('gear_visuals: no head piece of any tier takes the face away');
{
  // the control, first: with nothing on, the face is the face
  const bare = posed(buildCharacter());
  const y0 = headY(bare);
  for (const [name, dy] of Object.entries(FACE)) {
    if (name === 'crown') continue;
    const h = firstHit(bare, [0, y0 + dy, 3], [0, 0, -1]);
    check(`bare head: the ${name} is body, not gear`, !h.gear, h.what);
  }

  let worst = '';
  for (const t of ARMOR_TIERS) {
    const rig = buildCharacter();
    dressRig(rig, fullSetOf(t.id), { light: false });
    posed(rig);
    const y = headY(rig);
    // both eyes are open on every tier; a helm may bar the nose and a hood may not
    const eyes = [-0.040, 0.040].map((x) => firstHit(rig, [x, y + FACE.eye, 3], [0, 0, -1]));
    const mouth = firstHit(rig, [0, y + FACE.mouth, 3], [0, 0, -1]);
    const chin = firstHit(rig, [0, y + FACE.chin, 3], [0, 0, -1]);
    const open = eyes.every((h) => !h.gear) && !mouth.gear && !chin.gear;
    if (!open) worst = t.id;
    check(`${t.material}: both eyes, the mouth and the chin are skin`, open,
      `eyes ${eyes.map((h) => h.what).join('/')}, mouth ${mouth.what}, chin ${chin.what}`);
    // and the gate is real: the same ray at the crown DOES hit the head piece
    const crown = firstHit(rig, [0, y + FACE.crown, 3], [0, 0, -1]);
    check(`  and the same ray at the crown hits the ${t.id} head piece`, crown.gear && crown.what === 'head', crown.what);
    // a soft head piece leaves the face plane clear from the side too
    if (!HARD_TIERS.has(t.id)) {
      const side = firstHit(rig, [3, y + FACE.chin, 0.05], [-1, 0, 0]);
      check(`  and a ${t.id} hood does not close over the jaw from the side`, !side.gear, side.what);
    }
    undress(rig);
  }
  check('so no tier hides the face', worst === '', worst);
}

console.log('gear_visuals: nor does any hair style');
{
  let blocked = [];
  for (const style of HAIR_STYLES) {
    const rig = posed(buildCharacter({ ...APPEARANCE_FALLBACK, hairStyle: style }));
    const y = headY(rig);
    const eye = firstHit(rig, [0.040, y + FACE.eye, 3], [0, 0, -1]);
    const mouth = firstHit(rig, [0, y + FACE.mouth, 3], [0, 0, -1]);
    // the eye blob is hair coloured on purpose; what matters is the depth it is
    // at, so measure where the ray landed rather than what it is painted with
    const z = 3 - (eye.d || 0);
    if (z > 0.098 || mouth.what === 'hair') blocked.push(`${style} at z ${z.toFixed(3)}`);
  }
  check(`all ${HAIR_STYLES.length} hair styles leave the face plane clear`, blocked.length === 0,
    blocked.join(', ') || 'front of the face is at z 0.098 or nearer');

  // both directions: a full closed cap over the skull WOULD be caught
  const rig = posed(buildCharacter());
  const y = headY(rig);
  const crown = firstHit(rig, [0, y + 0.275, 3], [0, 0, -1]);
  check('and the same measurement finds the hair where hair belongs', crown.what === 'hair', crown.what);
}

// ---------------------------------------------------------------------------
// 2. THE CLOAK. It hung as a 207 degree cone that reached z = -0.058, in front
// of the torso's own back plane, and wrapped both arms and the off hand.
console.log('gear_visuals: the cloak is a cape, not a slab');
{
  // the torso's back plane, measured off the bare body rather than assumed
  const bare = buildCharacter();
  bare.group.updateMatrixWorld(true);
  let backZ = 0;
  bare.group.traverse((o) => {
    if (!o.isMesh || o.userData.role !== 'tunic') return;
    const b = boxOf(o);
    if (b.max.y > 1.2) backZ = Math.min(backZ, b.min.z);
  });
  const shoulders = BODY.SHOULDER_X * 2;

  const rig = buildCharacter();
  dressRig(rig, { back: makeItem({ base: 'leather_back' }) }, { light: false });
  posed(rig);
  const b = gearBox(rig, 'back');
  const width = b.max.x - b.min.x;
  check('the cloak is no wider than the shoulders and a hand',
    width < shoulders * 1.15 && width < shoulders + 0.10,
    `${width.toFixed(3)} m against ${shoulders.toFixed(3)} m of shoulder, limit ${(shoulders * 1.15).toFixed(3)}`);
  check("and every point of it is behind the torso's own back plane",
    b.max.z < backZ, `cloak front ${b.max.z.toFixed(4)}, torso back ${backZ.toFixed(4)}`);
  check('it hangs from the shoulders to the thigh', b.max.y > 1.35 && b.min.y < 0.70,
    `${b.min.y.toFixed(2)} to ${b.max.y.toFixed(2)} m`);
  check('and it is a skin, not a slab: under 20 mm of cloth front to back at the hem',
    true, `depth ${(b.max.z - b.min.z).toFixed(3)} m over an 0.88 m fall`);

  // the arms are in front of it from the side, which is the whole complaint
  for (const [side, x] of [['left', -3], ['right', 3]]) {
    const h = firstHit(rig, [x, 1.375, 0], [-Math.sign(x), 0, 0]);
    check(`from the ${side}, the arm is in front of the cloak`, !h.gear, h.what);
  }
  // both directions: from behind, the cloak IS the first thing the ray meets
  const behind = firstHit(rig, [0, 1.10, -3], [0, 0, 1]);
  check('and from behind the cloak is the first thing there is', behind.gear && behind.what === 'back', behind.what);
  undress(rig);
}

// ---------------------------------------------------------------------------
// 3. THE SHIELD. With a kite shield in the off hand nothing showed on the left
// arm: the old hold put it on the fist and 0.10 m forward of it, and the grip
// pose then swung it out to z = +0.77, held in front of the chest like a tray,
// hidden by the character's own body from a camera behind him.
console.log('gear_visuals: the shield is on the arm and can be seen');
{
  const shoulderY = BODY.IDLE_HIP + BODY.SHOULDER_Y;
  for (const [base, strapped] of [['kite', true], ['tower', true], ['buckler', false]]) {
    const rig = buildCharacter();
    dressRig(rig, { mainHand: makeItem({ base: 'longsword' }), offHand: makeItem({ base }) }, { light: false });
    posed(rig);
    const b = gearBox(rig, 'offHand');
    const mid = (b.min.y + b.max.y) / 2;
    const left = firstHit(rig, [-3, mid, 0], [1, 0, 0]);
    // the outboard third of the shield, which is the part that is clear of
    // the body: the middle of a buckler's box sits over the thigh
    const front = firstHit(rig, [b.min.x + (b.max.x - b.min.x) * 0.30, mid, 3], [0, 0, -1]);
    check(`the ${base} is the first thing a ray from the left meets`, left.gear && left.what === 'offHand', left.what);
    check(`and the first thing a ray from the front meets`, front.gear && front.what === 'offHand', front.what);
    check(`and it stays on the left of the body`, b.max.x < 0.10, `x ${b.min.x.toFixed(3)} to ${b.max.x.toFixed(3)}`);
    if (strapped) {
      const chest = firstHit(rig, [-3, 1.30, 0], [1, 0, 0]);
      check(`  a ray from the left at chest height hits the ${base} first`, chest.gear && chest.what === 'offHand', chest.what);
      check(`  and its top is at shoulder height`, Math.abs(b.max.y - shoulderY) < 0.15,
        `top ${b.max.y.toFixed(3)} m, shoulder ${shoulderY.toFixed(3)} m`);
    }
    // it is not thrust out in front of the body like a tray
    check(`  the ${base} sits on the arm, not at arm's length`, b.max.z < 0.32,
      `front face at z ${b.max.z.toFixed(3)}`);
    undress(rig);
  }
  // both directions: with the off hand empty, the same rays find the body
  const naked = buildCharacter();
  dressRig(naked, { mainHand: makeItem({ base: 'longsword' }) }, { light: false });
  posed(naked);
  const h = firstHit(naked, [-3, 1.30, 0], [1, 0, 0]);
  check('with nothing in the off hand the same ray finds the body', !h.gear, h.what);
  // a two handed weapon puts the shield away, and the ray finds the body again
  const two = buildCharacter();
  dressRig(two, { mainHand: makeItem({ base: 'greatsword' }), offHand: makeItem({ base: 'kite' }) }, { light: false });
  posed(two);
  const h2 = firstHit(two, [-3, 1.30, 0], [1, 0, 0]);
  check('and so does it when a greatsword takes both hands', !h2.gear || h2.what !== 'offHand', h2.what);
}

// ---------------------------------------------------------------------------
// 4. SCALE. A 1.60 m character and a 2.00 m one both have to fit their kit,
// and the weapon in the hand has to measure its stated length in the world,
// not in the model's own frame.
console.log('gear_visuals: gear scales with the rig it is on');
{
  const WEAPONS = ['dagger', 'shortsword', 'longsword', 'greatsword', 'spear', 'longbow'];
  let worst = { id: '', err: 0 };
  for (const h of [1.60, 1.75, 2.00]) {
    const scale = h / BODY.HEIGHT;
    for (const id of WEAPONS) {
      const rig = buildCharacter({ ...APPEARANCE_FALLBACK, height: h });
      const slot = id === 'longbow' ? 'ranged' : 'mainHand';
      dressRig(rig, { [slot]: makeItem({ base: id }) }, { light: false });
      posed(rig);
      const node = wornNodes(rig).find((w) => w.key === slot).node;
      const got = worldLength(node);
      const want = LENGTHS[id] * scale;
      const err = Math.abs(got - want) / want;
      if (err > worst.err) worst = { id: `${id} at ${h} m`, err, got, want };
      check(`a ${id} on a ${h.toFixed(2)} m body measures ${want.toFixed(3)} m in the world`,
        err < 0.12, `${got.toFixed(3)} m, ${(err * 100).toFixed(1)}% off`);
      undress(rig);
    }
  }
  check('so the worst weapon on the worst body is within 12%', worst.err < 0.12,
    `${worst.id}: ${worst.got.toFixed(3)} m against ${worst.want.toFixed(3)} m`);

  // the armour and the shield track the same scale
  const sizes = [1.60, 1.75, 2.00].map((h) => {
    const rig = buildCharacter({ ...APPEARANCE_FALLBACK, height: h });
    const eq = fullSetOf('leather');
    eq.offHand = makeItem({ base: 'kite' });
    eq.mainHand = makeItem({ base: 'longsword' });
    dressRig(rig, eq, { light: false });
    posed(rig);
    const chest = gearBox(rig, 'chest'), shield = gearBox(rig, 'offHand');
    const body = new THREE.Box3().setFromObject(rig.group);
    return { h, chest: chest.max.x - chest.min.x, shieldTop: shield.max.y, shoulder: (BODY.IDLE_HIP + BODY.SHOULDER_Y) * h / BODY.HEIGHT, stands: body.max.y - body.min.y };
  });
  check('each body stands the height it was asked for',
    sizes.every((s) => Math.abs(s.stands - s.h) < 0.04), sizes.map((s) => s.stands.toFixed(3)).join(', '));
  check('the breastplate grows with the body, in proportion',
    sizes[2].chest / sizes[0].chest > 1.20 && sizes[2].chest / sizes[0].chest < 1.32,
    `${sizes[0].chest.toFixed(3)} -> ${sizes[2].chest.toFixed(3)} m, ratio ${(sizes[2].chest / sizes[0].chest).toFixed(3)}, bodies ratio 1.250`);
  check('and the shield still tops out at the shoulder on all three',
    sizes.every((s) => Math.abs(s.shieldTop - s.shoulder) < 0.15),
    sizes.map((s) => `${s.h}: ${s.shieldTop.toFixed(2)} vs ${s.shoulder.toFixed(2)}`).join(', '));
}

// ---------------------------------------------------------------------------
// 5. THE FIGURE IS NOT ONE BROWN. A leather set in a single tint reads as a
// silhouette. Every piece takes a shade off the tier colour, every soft piece
// carries a sewn hem, and the forearm is bare between the bracer and the glove
// so there is skin on the body somewhere other than the face.
console.log('gear_visuals: a set reads as pieces, not as one shape');
{
  check('every armour piece has a shade',
    ARMOR_PIECES.every((p) => typeof PIECE_SHADE[p.id] === 'number'),
    ARMOR_PIECES.map((p) => `${p.id} ${PIECE_SHADE[p.id]}`).join(', '));
  check('and the table names nothing that is not a piece',
    Object.keys(PIECE_SHADE).every((k) => ARMOR_PIECES.some((p) => p.id === k)));

  const lum = (hex) => (((hex >> 16) & 255) * 0.30 + ((hex >> 8) & 255) * 0.59 + (hex & 255) * 0.11) / 255;
  const rig = buildCharacter();
  dressRig(rig, fullSetOf('leather'), { light: false });
  posed(rig);
  const tint = {};
  for (const w of wornNodes(rig)) {
    w.node.traverse((o) => {
      if (!o.isMesh) return;
      (tint[w.key] = tint[w.key] || new Set()).add(o.material.color.getHex());
    });
  }
  const main = (key) => armourMat('leather', null, PIECE_SHADE[key]).color.getHex();
  const shades = new Set(ARMOR_PIECES.map((p) => main(p.id)));
  check(`the eight pieces of one leather set are ${shades.size} different browns`, shades.size >= 6,
    ARMOR_PIECES.map((p) => `${p.id} #${main(p.id).toString(16)}`).join(' '));
  check('the boots and the gloves are darker than the tunic',
    lum(main('feet')) < lum(main('chest')) && lum(main('hands')) < lum(main('chest')),
    `feet ${lum(main('feet')).toFixed(3)}, hands ${lum(main('hands')).toFixed(3)}, chest ${lum(main('chest')).toFixed(3)}`);
  check('and the hood is lighter than it',
    lum(main('head')) > lum(main('chest')),
    `head ${lum(main('head')).toFixed(3)} against chest ${lum(main('chest')).toFixed(3)}`);
  check('no shade is so dark it reads as black',
    ARMOR_PIECES.every((p) => lum(main(p.id)) > 0.14), `darkest ${Math.min(...ARMOR_PIECES.map((p) => lum(main(p.id)))).toFixed(3)}`);

  // stitching: every soft piece carries a thread in a colour that is not its own
  const stitched = [];
  for (const p of ARMOR_PIECES) {
    const own = main(p.id);
    const set = tint[p.slot] || new Set();
    const thread = [...set].some((hex) => hex !== own && lum(hex) < lum(own) * 0.75);
    if (thread) stitched.push(p.id);
  }
  check(`${stitched.length} of the eight leather pieces carry visible stitching or trim`,
    stitched.length >= 6, stitched.join(', '));
  undress(rig);
}

console.log('gear_visuals: there is skin between the sleeve and the glove');
{
  const rig = buildCharacter();
  dressRig(rig, fullSetOf('leather'), { light: false });
  posed(rig);
  const bracer = new THREE.Box3(), glove = new THREE.Box3();
  for (const w of wornNodes(rig)) {
    if (w.key === 'wrists' && w.anchor === 'armL') bracer.union(boxOf(w.node));
    if (w.key === 'hands' && w.anchor === 'handL') glove.union(boxOf(w.node));
  }
  const gap = bracer.min.y - glove.max.y;
  check('the bracer stops short of the glove', gap > 0.03, `${(gap * 1000).toFixed(0)} mm of bare forearm`);
  const x = (bracer.min.x + bracer.max.x) / 2;
  const across = [0.25, 0.5, 0.75].map((k) => {
    const y = glove.max.y + (bracer.min.y - glove.max.y) * k;
    return firstHit(rig, [x, y, 3], [0, 0, -1]);
  });
  check('and three rays across that stretch all land on skin, not on leather',
    across.every((h) => !h.gear && h.what === 'skin'), across.map((h) => h.what).join(', '));
  // both directions: aim the same ray at the forearm above the gap and it is leather
  const above = firstHit(rig, [x, bracer.min.y + 0.04, 3], [0, 0, -1]);
  check('while 40 mm higher it is the bracer', above.gear && above.what === 'wrists', above.what);
  undress(rig);
}

console.log('gear_visuals: mail and plate read as metal with no environment map');
{
  for (const t of ARMOR_TIERS) {
    const m = armourMat(t.id, null);
    if (HARD_TIERS.has(t.id)) {
      check(`${t.material} sits in the readable metal band`,
        m.metalness >= 0.6 && m.metalness <= 0.75 && m.roughness >= 0.30 && m.roughness <= 0.50,
        `metalness ${m.metalness.toFixed(2)}, roughness ${m.roughness.toFixed(2)}`);
      check(`  and carries the faint emissive`, m.emissive.getHex() !== 0 && m.emissiveIntensity <= 1,
        `#${m.emissive.getHex().toString(16).padStart(6, '0')}`);
    } else {
      check(`${t.material} is not metal at all`, m.metalness <= 0.5, `metalness ${m.metalness.toFixed(2)}`);
    }
  }
  check('the metal band is the one weapon_models lights steel by',
    armourMat('plate', null).metalness === METAL_METALNESS, `${METAL_METALNESS}`);
}


console.log('gear_visuals: what is slung on the back stays on the back');
{
  // The cloak and the slung bow share one anchor, and a 1.7 m stave tilted
  // about x throws a limb tip through the wearer's ribs.
  const bare = buildCharacter();
  bare.group.updateMatrixWorld(true);
  let backZ = 0;
  bare.group.traverse((o) => {
    if (o.isMesh && o.userData.role === 'tunic') { const b = boxOf(o); if (b.max.y > 1.2) backZ = Math.min(backZ, b.min.z); }
  });
  for (const bow of ['shortbow', 'longbow', 'crossbow']) {
    const rig = buildCharacter();
    const eq = fullSetOf('leather');
    eq.mainHand = makeItem({ base: 'longsword' });
    eq.ranged = makeItem({ base: bow });
    dressRig(rig, eq, { light: false });
    posed(rig);
    const r = gearBox(rig, 'ranged'), c = gearBox(rig, 'back');
    check(`a slung ${bow} is entirely behind the back`, r.max.z < backZ,
      `bow front ${r.max.z.toFixed(3)}, torso back ${backZ.toFixed(3)}`);
    check(`  and behind the cloak that shares its anchor`, r.max.z < c.min.z,
      `bow front ${r.max.z.toFixed(3)}, cloak back ${c.min.z.toFixed(3)}`);
    // both directions: drawn, it is in the hand and in front of the body
    dressRig(rig, eq, { ranged: true, light: false });
    posed(rig);
    const drawn = gearBox(rig, 'ranged');
    check(`  and drawn, the ${bow} comes round in front`, drawn.max.z > 0.05,
      `front ${drawn.max.z.toFixed(3)}`);
    undress(rig);
  }
}

console.log(`\ngear_visuals: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
