// The weapon models, measured. Run: node src/game/weapon_models.test.mjs
//
// Nothing here asserts that a builder exists. Every check builds the real
// model through the real entry point and measures the geometry that comes
// out: how long it is, how many triangles it costs, where the grip sits,
// which way the blade points, what colour the steel is, and whether the
// rarity glow is there when it should be AND absent when it should not.

import * as THREE from 'three';
import {
  buildWeaponModel, auditWeaponModels, hasWeaponModel, modelledBases, countTriangles,
  LENGTHS, METAL_COLOURS, WOOD_COLOURS, LEATHER_COLOURS, colourOfMaterial, isMetal,
  textureSet, FAMILIES, MODELLED_KINDS, disposeModel, loft, lathe, circle, roundRect,
} from './weapon_models.js';
import { BASES, RARITY_ORDER, makeItem } from '../mmo/items.js';
import { ORES, ALLOYS, WOODS, LEATHERS } from '../mmo/ores.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const bbox = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };

const TRI_BUDGET = 6000;
const TOLERANCE = 0.10;

// ---------------------------------------------------------------------------
console.log('weapon_models: the audit');
{
  const r = auditWeaponModels();
  check('the audit builds every base it is answerable for', r.built > 0 && r.bases >= r.built,
    `${r.built} built of ${r.bases} bases, ${r.triangles} triangles all told`);
  const kinds = Object.values(BASES).filter((b) => MODELLED_KINDS.includes(b.kind));
  check('every weapon, shield, offhand, instrument and tool base is covered',
    modelledBases().length === kinds.length, `${kinds.length} bases across ${MODELLED_KINDS.join(', ')}`);
  // both directions: a base with a recipe answers yes, fists answers no
  check('fists has no model, because empty hands are not an object', hasWeaponModel('fists') === false);
  check('and a longsword does', hasWeaponModel('longsword') === true);
  check('buildWeaponModel returns null for fists rather than a stub', buildWeaponModel('fists') === null);
  let threw = false;
  try { buildWeaponModel('not_a_thing'); } catch { threw = true; }
  check('an unknown base throws instead of building nothing quietly', threw);
  check('the worst model is well inside the budget', r.worst.tris < TRI_BUDGET,
    `${r.worst.id} at ${r.worst.tris} of ${TRI_BUDGET}`);
}

// ---------------------------------------------------------------------------
console.log('weapon_models: every model, measured');
{
  const ids = modelledBases().filter((id) => hasWeaponModel(id));
  let worstErr = 0, worstId = '', worstTris = 0, worstTriId = '';
  let lengthsOk = 0, trisOk = 0, gripOk = 0, upOk = 0;
  for (const id of ids) {
    const g = buildWeaponModel(id, { light: false });
    const bb = bbox(g);
    const len = bb.max.y - bb.min.y;
    const want = LENGTHS[id];
    const err = Math.abs(len - want) / want;
    if (err > worstErr) { worstErr = err; worstId = id; }
    if (err <= TOLERANCE) lengthsOk++;
    const tris = countTriangles(g);
    if (tris > worstTris) { worstTris = tris; worstTriId = id; }
    if (tris <= TRI_BUDGET) trisOk++;
    // the grip is at the origin: y = 0 falls inside the model, not off an end
    if (bb.min.y <= 0.001 && bb.max.y >= -0.001) gripOk++;
    // the business end runs along +y
    if (bb.max.y > 0) upOk++;
    disposeModel(g);
  }
  check(`all ${ids.length} models are within 10% of their stated length`, lengthsOk === ids.length,
    `worst ${worstId} at ${(worstErr * 100).toFixed(1)}%`);
  check('every model is under the triangle budget', trisOk === ids.length,
    `worst ${worstTriId} at ${worstTris} of ${TRI_BUDGET}`);
  check('the grip is at the origin on every model', gripOk === ids.length, `${gripOk}/${ids.length}`);
  check('and the business end runs along +y', upOk === ids.length, `${upOk}/${ids.length}`);
}

// ---------------------------------------------------------------------------
console.log('weapon_models: a sword is shaped like a sword');
{
  const g = buildWeaponModel('longsword', { light: false });
  const bb = bbox(g);
  check('a longsword is about a metre', Math.abs(bb.max.y - bb.min.y - 1.0) < 0.10, `${(bb.max.y - bb.min.y).toFixed(3)} m`);
  check('the pommel hangs below the hand', bb.min.y < -0.05, `${bb.min.y.toFixed(3)} m`);
  check('and seven eighths of it is above the hand', bb.max.y > (bb.max.y - bb.min.y) * 0.8, `${bb.max.y.toFixed(3)} m of blade`);
  check('the guard is the widest part', bb.max.x - bb.min.x > 0.15 && bb.max.x - bb.min.x < 0.26,
    `${(bb.max.x - bb.min.x).toFixed(3)} m across`);
  check('and the blade is thin', bb.max.z - bb.min.z < 0.08, `${(bb.max.z - bb.min.z).toFixed(3)} m thick`);

  const dagger = bbox(buildWeaponModel('dagger', { light: false }));
  const great = bbox(buildWeaponModel('greatsword', { light: false }));
  const hal = bbox(buildWeaponModel('halberd', { light: false }));
  const lens = [dagger, bb, great, hal].map((b) => b.max.y - b.min.y);
  check('dagger, longsword, greatsword, halberd get longer in that order',
    lens[0] < lens[1] && lens[1] < lens[2] && lens[2] < lens[3],
    lens.map((l) => l.toFixed(2)).join(' < '));
}

// ---------------------------------------------------------------------------
console.log('weapon_models: metal comes from ores.js');
{
  for (const o of [...ORES, ...Object.values(ALLOYS)]) {
    if (METAL_COLOURS[o.id] == null) check(`ore ${o.id} has a colour`, false);
  }
  check('every ore and alloy has a hex', [...ORES, ...Object.values(ALLOYS)].every((o) => METAL_COLOURS[o.id] != null),
    `${Object.keys(METAL_COLOURS).length} metals`);
  check('every wood has a hex', WOODS.every((w) => WOOD_COLOURS[w.id] != null));
  check('every leather has a hex', LEATHERS.every((l) => LEATHER_COLOURS[l.id] != null));
  check('colourOfMaterial reads all three tables', colourOfMaterial('coldiron') === METAL_COLOURS.coldiron
    && colourOfMaterial('ironbark') === WOOD_COLOURS.ironbark && colourOfMaterial('scaledHide') === LEATHER_COLOURS.scaledHide);
  check('and says nothing about a material it does not know', colourOfMaterial('cheese') === null);
  check('isMetal separates steel from timber', isMetal('silver') === true && isMetal('oak') === false);

  // the model actually wears the colour: a coldiron sword is not a silver one
  const colours = (id, material) => {
    const g = buildWeaponModel({ base: id, rarity: 'common', material }, { light: false });
    const set = new Set();
    g.traverse((o) => { if (o.isMesh && o.material.color) set.add(o.material.color.getHex()); });
    disposeModel(g);
    return set;
  };
  const cold = colours('longsword', 'coldiron');
  const silver = colours('longsword', 'silver');
  check('a coldiron blade carries the coldiron hex', cold.has(METAL_COLOURS.coldiron), `#${METAL_COLOURS.coldiron.toString(16)}`);
  check('a silver blade carries the silver hex and not the coldiron one',
    silver.has(METAL_COLOURS.silver) && !silver.has(METAL_COLOURS.coldiron));
  const oak = colours('quarterstaff', 'oak');
  const ironbark = colours('quarterstaff', 'ironbark');
  check('a staff takes its wood too', oak.has(WOOD_COLOURS.oak) && ironbark.has(WOOD_COLOURS.ironbark));
  const plain = colours('longsword', null);
  check('a weapon with no material named falls back to iron rather than to nothing',
    plain.has(METAL_COLOURS.iron), `#${METAL_COLOURS.iron.toString(16)}`);
}

// ---------------------------------------------------------------------------
console.log('weapon_models: rarity, in both directions');
{
  const glowing = (rarity) => {
    const g = buildWeaponModel({ base: 'longsword', rarity, material: 'iron' });
    let emissive = 0, lights = 0;
    g.traverse((o) => {
      if (o.isMesh && o.material.emissive && o.material.emissiveIntensity > 1
        && o.material.emissive.getHex() !== 0) emissive++;
      if (o.isPointLight) lights++;
    });
    const out = { emissive, lights };
    disposeModel(g);
    return out;
  };
  const rows = RARITY_ORDER.map((r) => [r, glowing(r)]);
  for (const [r, o] of rows) console.log(`       ${r.padEnd(10)} ${o.emissive} rune meshes, ${o.lights} lights`);
  check('common, uncommon and rare carry no glow at all',
    rows.slice(0, 3).every(([, o]) => o.emissive === 0 && o.lights === 0));
  check('epic and above carry a rune line',
    rows.slice(3).every(([, o]) => o.emissive > 0), rows.slice(3).map(([r, o]) => `${r} ${o.emissive}`).join(', '));
  check('only legendary carries a light',
    rows.filter(([, o]) => o.lights > 0).map(([r]) => r).join(',') === 'legendary');
  const noLight = buildWeaponModel({ base: 'longsword', rarity: 'legendary' }, { light: false });
  let lights = 0;
  noLight.traverse((o) => { if (o.isPointLight) lights++; });
  check('and opts.light false turns it off', lights === 0);
  // the rune is in the rarity colour, not a generic gold
  const epic = buildWeaponModel({ base: 'longsword', rarity: 'epic' }, { light: false });
  const want = new THREE.Color(RARITY_ORDER.includes('epic') ? '#a335ee' : '#ffffff').getHex();
  let matched = false;
  epic.traverse((o) => { if (o.isMesh && o.material.emissive?.getHex() === want) matched = true; });
  check('the rune is the epic purple', matched, `#${want.toString(16)}`);
}

// ---------------------------------------------------------------------------
// A face wound the wrong way is invisible under front face culling, and a
// solid model hides it while a thin one does not. This caught every end cap
// and every downward written lathe in the kit, so it stays as a guard.
console.log('weapon_models: nothing is built inside out');
{
  // The exact test, not an approximate one: for a closed surface the signed
  // volume is positive when the faces wind outward and negative when they do
  // not, whatever shape the thing is. This found three real classes of bug in
  // one pass: every loft end cap, every lathe written from the crown down, and
  // every axe bit mirrored with a negative scale.
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
  check('a lofted cylinder encloses a positive volume',
    volume(loft(circle(14), [{ y: 0, sx: 0.1 }, { y: 0.5, sx: 0.1 }])) > 0);
  check('and a disc, where the caps are most of the faces',
    volume(loft(circle(14), [{ y: 0, sx: 0.2 }, { y: 0.02, sx: 0.2 }])) > 0);
  check('and a rounded rectangle section',
    volume(loft(roundRect(0.5, 0.3, 3), [{ y: 0, sx: 0.1 }, { y: 0.3, sx: 0.12 }])) > 0);
  check('a lathe written upward', volume(lathe([[0.001, 0], [0.06, 0.04], [0.001, 0.09]], 14)) > 0);
  check('and one written downward, which is turned the right way up for the caller',
    volume(lathe([[0.001, 0.09], [0.06, 0.04], [0.001, 0]], 14)) > 0);

  let worst = Infinity, worstId = '', meshes = 0;
  for (const id of modelledBases()) {
    if (!hasWeaponModel(id)) continue;
    const g = buildWeaponModel(id, { light: false });
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const v = volume(o.geometry, o.matrixWorld);
      if (v < worst) { worst = v; worstId = `${id}/${o.geometry.type}`; }
    });
    disposeModel(g);
  }
  check(`all ${meshes} meshes across the whole kit wind outward`, worst > 0,
    `smallest volume ${worstId} at ${worst.toExponential(2)} m3`);
}

// ---------------------------------------------------------------------------
console.log('weapon_models: the materials are textured, not filled');
{
  const g = buildWeaponModel({ base: 'battleaxe', material: 'emberite' }, { light: false });
  let meshes = 0, textured = 0, missing = [];
  g.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const m = o.material;
    if (m.map && m.normalMap && m.roughnessMap) textured++;
    else if (o.name !== 'flame') missing.push(o.name || m.type);
  });
  check('every mesh on a battleaxe carries albedo, roughness and normal maps',
    textured === meshes, `${textured}/${meshes}${missing.length ? ' missing: ' + missing.join(', ') : ''}`);

  // and the textures are noise, not a flat fill
  const t = textureSet('metal');
  const d = t.map.image.data;
  let lo = 255, hi = 0, sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); sum += d[i]; n++; }
  const mean = sum / n;
  let varsum = 0;
  for (let i = 0; i < d.length; i += 4) varsum += (d[i] - mean) ** 2;
  const sd = Math.sqrt(varsum / n);
  check('the brushed metal albedo actually varies', hi - lo > 30 && sd > 5,
    `${lo}..${hi}, mean ${mean.toFixed(1)}, sd ${sd.toFixed(1)}`);
  const nd = t.normalMap.image.data;
  let flatN = 0, total = 0;
  for (let i = 0; i < nd.length; i += 4) { total++; if (nd[i] === 128 && nd[i + 1] === 128) flatN++; }
  check('and the normal map is not a flat sheet', flatN / total < 0.5, `${(flatN / total * 100).toFixed(1)}% flat texels`);

  check('the same family is generated once and shared', textureSet('metal') === t);
  check('a repeat makes its own texture with the same image',
    textureSet('metal', 3).map !== t.map && textureSet('metal', 3).map.image === t.map.image);
  check('every family named by the kit generates', Object.keys(FAMILIES).every((k) => {
    try { return !!textureSet(k).map; } catch { return false; }
  }), Object.keys(FAMILIES).join(', '));
}

// ---------------------------------------------------------------------------
console.log('weapon_models: an item record drives it, not just an id');
{
  const item = makeItem({ base: 'mace', rarity: 'mythic', seed: 7 });
  item.material = 'verdite';
  const g = buildWeaponModel(item, { light: false });
  check('the record carries through to userData', g.userData.weapon.base === 'mace'
    && g.userData.weapon.rarity === 'mythic' && g.userData.weapon.material === 'verdite',
    JSON.stringify(g.userData.weapon));
  let verdite = false;
  g.traverse((o) => { if (o.isMesh && o.material.color?.getHex() === METAL_COLOURS.verdite) verdite = true; });
  check('and the mace really is verdite', verdite);
  const over = buildWeaponModel(item, { material: 'voidrock', light: false });
  let voidrock = false;
  over.traverse((o) => { if (o.isMesh && o.material.color?.getHex() === METAL_COLOURS.voidrock) voidrock = true; });
  check('an explicit opts.material overrides the record', voidrock);
}

// ---------------------------------------------------------------------------
console.log('weapon_models: shields and oddments');
{
  const kite = bbox(buildWeaponModel('kite', { light: false }));
  const tower = bbox(buildWeaponModel('tower', { light: false }));
  const buckler = bbox(buildWeaponModel('buckler', { light: false }));
  check('a kite shield is about 0.9 m tall', Math.abs((kite.max.y - kite.min.y) - 0.9) / 0.9 < TOLERANCE,
    `${(kite.max.y - kite.min.y).toFixed(3)} m`);
  check('buckler, kite, tower get bigger in that order',
    (buckler.max.y - buckler.min.y) < (kite.max.y - kite.min.y)
    && (kite.max.y - kite.min.y) < (tower.max.y - tower.min.y));
  check('a shield is a face, not a pole: wider than it is thick',
    (kite.max.x - kite.min.x) > (kite.max.z - kite.min.z) * 1.5,
    `${(kite.max.x - kite.min.x).toFixed(2)} across, ${(kite.max.z - kite.min.z).toFixed(2)} deep`);

  const torch = buildWeaponModel('torch');
  let flame = 0, torchLight = 0;
  torch.traverse((o) => { if (o.name === 'flame') flame++; if (o.isPointLight) torchLight++; });
  check('a torch burns: a flame and a light', flame === 1 && torchLight === 1);

  const bow = bbox(buildWeaponModel('longbow', { light: false }));
  check('a longbow is 1.7 m and the grip is in the middle',
    Math.abs((bow.max.y - bow.min.y) - 1.7) / 1.7 < TOLERANCE && Math.abs(bow.max.y + bow.min.y) < 0.05,
    `${bow.min.y.toFixed(2)} to ${bow.max.y.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
console.log('weapon_models: building is cheap enough to do on an equip');
{
  const t0 = Date.now();
  const built = [];
  for (let i = 0; i < 30; i++) built.push(buildWeaponModel('longsword', { light: false }));
  const ms = Date.now() - t0;
  for (const g of built) disposeModel(g);
  check('30 longswords build in under 250 ms', ms < 250, `${ms} ms, ${(ms / 30).toFixed(1)} ms each`);
}

console.log(`\nweapon_models: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
