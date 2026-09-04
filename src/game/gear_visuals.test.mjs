// Gear on the body, measured. Run: node src/game/gear_visuals.test.mjs
//
// Everything goes through the real dressRig against a real buildCharacter rig,
// because the claim worth proving is not "a dresser exists" but "the
// greatsword is gone from the hand and the buckler is in the other one". Every
// gate is driven both ways: dressed and undressed, ranged up and ranged down,
// a rarity that glows and one that does not.

import * as THREE from 'three';
import { buildCharacter, auditAppearance, SKIN_COLOURS, PALETTE, APPEARANCE_FALLBACK } from './player.js';
import { APPEARANCE } from '../mmo/openings.js';
import {
  dressRig, undress, wornNodes, gearCounts, armourMat, TIER_COLOURS, HARD_TIERS, HOLD,
} from './gear_visuals.js';
import { makeItem, setOf, ARMOR_TIERS, ARMOR_PIECES, SLOTS, BASES } from '../mmo/items.js';
import { METAL_COLOURS } from './weapon_models.js';

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

console.log(`\ngear_visuals: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
