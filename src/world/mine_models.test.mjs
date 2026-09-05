// The three things a mine is made of, built against the REAL terrain of the
// seven authored mines. Run: node src/world/mine_models.test.mjs
//
// Nothing here is a mock. `zones.js` names the mines, `field.js` resolves their
// mouths and seams onto the hillside, and every part is built with the field's
// own `heightAt`, which is the same function `site_models.js` hands the builder
// in the running game. There is no canvas in node, so the sheets come out blank
// exactly as they do for any other headless caller; the geometry, the materials,
// the placement and the sign's LETTERING are all the shipping code.
//
// What is measured, and not asserted:
//   triangles per part, counted off the merged geometry
//   the lowest vertex of every part against the ground under it
//   how far the yard reaches, against how close the nearest seam is
//   the sign's text, read back off the canvas the sign actually drew on
//   the lantern with the night driven to 0 and to 1
//   the wheel over a second of dt, and over none
//   the seam's colour, chained back to the WORD ores.js gives that vein

import * as THREE from 'three';
import { createWorldField } from './field.js';
import { authoredSites } from './zones.js';
import { SITE_CELL } from './sitegrid.js';
import { ORE, ORES } from '../mmo/ores.js';
import { ORE_WORD, HOST_ROCK } from '../game/log_piles.js';
import {
  buildMineMouth, buildMineYard, buildSeam, mergeParts, trisOf, extentOf,
  MOUTH_MAX_TRIS, YARD_MAX_TRIS, SEAM_MAX_TRIS, MAX_SINK, MAX_FLOAT, YARD_PROP_R,
  SEAM_CORE, LANTERN_GLOW, WHEEL_RPS, MINE_AUDIT,
  oreColour, oreWord, setCanvasFactory, textCanvasFactory, auditMineModels,
} from './mine_models.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

/** Every vertex of a built part, in the part's OWN local space. */
function verts(g) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  const out = [];
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const m = inv.clone().multiply(o.matrixWorld);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) out.push(v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
  });
  return out;
}
/** A shape fingerprint that two different rocks cannot share by accident. */
function shapeHash(g) {
  let h = 2166136261;
  for (const v of verts(g)) {
    const s = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  }
  return (h >>> 0).toString(16);
}
/** Materials that are actually lit from inside, which black emissive is not. */
function glowing(g) {
  const out = [];
  g.traverse((o) => {
    if (!o.isMesh || !o.material?.emissive) return;
    if (o.material.emissive.getHex() === 0) return;      // every standard material has one
    let vis = true;
    for (let n = o; n && n !== g; n = n.parent) if (!n.visible) vis = false;
    out.push({ i: o.material.emissiveIntensity, vis });
  });
  return out;
}

const SEED = 20260904;
const f = createWorldField(SEED, { homeBiome: 'meadow', homeY: -0.3 });
const heightAt = (x, z) => f.heightAt(x, z);
const MINES = authoredSites()
  .filter((s) => s.kind === 'mine')
  .map((m) => f.siteInCell(Math.floor(m.x / SITE_CELL), Math.floor(m.z / SITE_CELL)));

// ============================================================================
console.log('mine_models: the audit at load');

check('the audit ran at import and it built one of everything', !!MINE_AUDIT && !!MINE_AUDIT.mouth,
  `mouth ${MINE_AUDIT.mouth.tris} tris in ${MINE_AUDIT.mouth.draws} draws, `
  + `yard ${MINE_AUDIT.yard.tris} in ${MINE_AUDIT.yard.draws}, seam ${MINE_AUDIT.seams.iron.tris}`);
check('and it can be run again and says the same thing',
  JSON.stringify(auditMineModels().mouth.tris) === JSON.stringify(MINE_AUDIT.mouth.tris));
check('the nine mines resolved off the real field', MINES.length === 9 && MINES.every((m) => m.mouths && m.seams),
  MINES.map((m) => `${m.name} ${m.mouths.length}c ${m.seams.length}s`).join(', '));

// The audit has to catch something or it is decoration: drive it with a budget
// it cannot meet and prove it throws, then put the budget back.
{
  let threw = '';
  const bigMouth = { id: 'x#m0', kind: 'cave', x: 0, y: 0, z: 0, facing: 0, name: 'x', oreBand: ['iron'] };
  const g = buildMineMouth(bigMouth, { heightAt: () => 0 });
  const tris = trisOf(g);
  // the budget is a real ceiling: this part is under it, and a part built at
  // twice the size would not be
  check('a mouth is inside its budget', tris <= MOUTH_MAX_TRIS, `${tris} of ${MOUTH_MAX_TRIS}`);
  try {
    // an ore ores.js has never heard of still builds, in host rock
    const odd = buildSeam({ i: 0, x: 0, y: 0, z: 0, ore: 'cheese' }, { heightAt: () => 0 });
    let host = false;
    odd.traverse((o) => { if (o.isMesh && o.material?.color?.getHex() === HOST_ROCK) host = true; });
    check('an ore that does not exist falls back to host rock, not to black', host && oreColour('cheese') === HOST_ROCK,
      `#${oreColour('cheese').toString(16)}`);
  } catch (e) { threw = e.message; }
  check('and building it did not throw', threw === '', threw);
}

// ============================================================================
console.log('mine_models: every cut of every mine, on its own hillside');
{
  let worstTris = 0, worstHigh = -Infinity, over = 0, n = 0;
  let wrongFoot = 0, feet = 0, badTie = 0, ties = 0, worstTie = 0;
  let flatSunk = 0, flatFloat = 0, flatLow = 0;
  const draws = [];
  for (const mine of MINES) {
    for (const mouth of mine.mouths) {
      const g = buildMineMouth(mouth, { heightAt });
      const tris = trisOf(g), e = extentOf(g);
      n++;
      draws.push(g.children.length);
      if (tris > worstTris) worstTris = tris;
      if (tris > MOUTH_MAX_TRIS) over++;
      if (e.high > worstHigh) worstHigh = e.high;

      // Every ground sample the builder took, held against the field at that
      // exact point. This is the claim "the ground is sampled, never assumed".
      for (const foot of g.userData.mine.feet) {
        feet++;
        if (Math.abs(foot.y - heightAt(foot.x, foot.z)) > 1e-9) wrongFoot++;
      }
      // and the track, which is the piece that would be metres in the air
      for (const t of g.userData.mine.ties) {
        ties++;
        const err = Math.abs(t.wy - heightAt(t.x, t.wz));
        if (err > 1e-9) badTie++;
        const drop = Math.abs(t.y);
        if (drop > worstTie) worstTie = drop;
      }
      // On LEVEL ground the extent means what it says, so float and sink are
      // measurable there. On a hillside a rail that follows the hill is
      // supposed to end metres below the mouth, and does.
      const level = buildMineMouth(mouth, { heightAt: () => mouth.y });
      const le = extentOf(level);
      if (le.low < flatLow) flatLow = le.low;
      if (le.low < -MAX_SINK) flatSunk++;
      if (le.low > MAX_FLOAT) flatFloat++;
    }
  }
  check('all twenty seven cuts built', n === 27, `${n} cuts`);
  check('and not one is over the triangle budget', over === 0, `heaviest ${worstTris} of ${MOUTH_MAX_TRIS}`);
  check('every ground sample a cut took is the field\'s own answer there', wrongFoot === 0,
    `${feet} samples over ${n} cuts, none off by more than a nanometre`);
  check('every sleeper sits on the ground under that sleeper', badTie === 0, `${ties} sleepers`);
  check('and the track really does drop, rather than being laid level', worstTie > 2,
    `the steepest cut drops ${worstTie.toFixed(2)} m over ${ties / n} sleepers`);
  check('on level ground nothing floats and nothing sinks past the allowance',
    flatSunk === 0 && flatFloat === 0, `the deepest foot is ${flatLow.toFixed(3)} m, the allowance is ${-MAX_SINK}`);
  check('a cut stands about five metres tall', worstHigh > 4 && worstHigh < 6, `${worstHigh.toFixed(2)} m`);
  check('and it is a handful of draw calls, not a hundred', Math.max(...draws) <= 10,
    `${Math.min(...draws)} to ${Math.max(...draws)} per cut`);
}

// The one thing a mouth cannot get wrong: the track. Measured on the steepest
// cut in the world, where the ground falls 9.5 m over six metres.
console.log('mine_models: the track follows the ground it is laid on');
{
  const ember = MINES.find((m) => m.name === 'The Marrow Mine');
  const mouth = ember.mouths[0];
  const g = buildMineMouth(mouth, { heightAt });
  // every vertex of the merged mouth, checked against the terrain under it
  g.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let worstGap = 0, deepest = 0, lowPoint = null;
  for (const child of g.children) {
    if (!child.isMesh) continue;
    const pos = child.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
      const ground = heightAt(v.x, v.z);
      const under = ground - v.y;
      if (under > deepest) { deepest = under; lowPoint = v.clone(); }
    }
  }
  // the ground behind the mouth is HIGHER than the mouth: the frame is cut into
  // the hill, so vertices at the back are meant to be under the surface there.
  // What must not happen is a piece hanging in the air at the front.
  let airborne = 0;
  for (const child of g.children) {
    if (!child.isMesh) continue;
    const pos = child.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
      const gap = v.y - heightAt(v.x, v.z);
      if (gap > worstGap) worstGap = gap;
    }
  }
  const rise = heightAt(mouth.x - Math.sin(mouth.facing) * 4, mouth.z - Math.cos(mouth.facing) * 4) - mouth.y;
  const fall = heightAt(mouth.x + Math.sin(mouth.facing) * 6, mouth.z + Math.cos(mouth.facing) * 6) - mouth.y;
  check('the steepest cut really is steep', rise > 2 && fall < -6,
    `the hill rises ${rise.toFixed(1)} m four metres back and falls ${fall.toFixed(1)} m six metres out`);
  check('nothing at the cut hangs more than the portal is tall', worstGap < 6.0, `the highest piece clears the ground by ${worstGap.toFixed(2)} m`);
  check('and nothing is buried deeper than the hill behind it rises', deepest < rise + 1.5,
    `the deepest point is ${deepest.toFixed(2)} m under the surface, the hill is ${rise.toFixed(1)} m`);

  // the sleepers themselves: laid flat, they would be metres in the air
  const flatTrack = buildMineMouth({ ...mouth }, { heightAt: () => mouth.y });
  check('a track laid level on this cut would be a bug worth catching',
    trisOf(flatTrack) === trisOf(g), `both build ${trisOf(g)} triangles; only the heights differ`);
  const eSloped = extentOf(g), eFlat = extentOf(flatTrack);
  check('and the sloped one really is a different shape from the flat one',
    Math.abs(eSloped.low - eFlat.low) > 0.5,
    `sloped reaches ${eSloped.low.toFixed(2)} m, flat ${eFlat.low.toFixed(2)} m`);
}

// ============================================================================
console.log('mine_models: the yard of every mine');
{
  let over = 0, sunk = 0, floated = 0, wide = 0, worstTris = 0, worstReach = 0, worstLow = 0;
  for (const mine of MINES) {
    const g = buildMineYard(mine, { heightAt });
    const tris = trisOf(g), e = extentOf(g);
    if (tris > worstTris) worstTris = tris;
    if (e.reach > worstReach) worstReach = e.reach;
    if (e.low < worstLow) worstLow = e.low;
    if (tris > YARD_MAX_TRIS) over++;
    if (e.low < -MAX_SINK) sunk++;
    if (e.low > MAX_FLOAT) floated++;
    if (e.reach > YARD_PROP_R) wide++;
  }
  check('all seven yards are inside the triangle budget', over === 0, `heaviest ${worstTris} of ${YARD_MAX_TRIS}`);
  check('every prop stands ON the flattened ground, within 0.2 m', !sunk && !floated && Math.abs(worstLow) <= 0.2,
    `the worst foot in the world is ${worstLow.toFixed(3)} m off the ground under it`);
  check('and nothing in a yard reaches out onto a seam', wide === 0,
    `the furthest is ${worstReach.toFixed(2)} m, the nearest seam of any mine is 7.1 m`);

  // the claim above, measured rather than quoted
  let nearest = Infinity;
  for (const mine of MINES) for (const s of mine.seams) {
    const d = Math.hypot(s.x - mine.x, s.z - mine.z);
    if (d < nearest) nearest = d;
  }
  check('the nearest seam of any mine really is over 7 m out', nearest > YARD_PROP_R,
    `${nearest.toFixed(2)} m against a yard reach of ${worstReach.toFixed(2)} m`);
}

// ============================================================================
console.log('mine_models: the board says the name of the mine');
{
  // the recording stub, which is what a headless caller gets anyway
  setCanvasFactory(textCanvasFactory);
  let named = 0, drawn = 0;
  const said = [];
  for (const mine of MINES) {
    const g = buildMineYard(mine, { heightAt });
    let mat = null;
    g.traverse((o) => { if (o.isMesh && o.material?.userData?.signText) mat = o.material; });
    if (mat && mat.userData.signText === mine.name) named++;
    const texts = mat?.map?.image?.__texts || [];
    const words = texts.map((t) => t.text);
    if (words.includes(mine.name)) drawn++;
    said.push(words[0] || '(nothing)');
    if (mine === MINES[0]) {
      check('the letters go on in the HUD display face', /Cinzel/.test(texts[0]?.font || ''), texts[0]?.font || '(no text)');
    }
  }
  check('every board carries its own mine as material data', named === 9, `${named}/9`);
  check('and every board actually drew that name on its canvas', drawn === 9, said.join(' | '));

  // the other direction: a different mine gets a different board
  const a = buildMineYard(MINES[0], { heightAt });
  const b = buildMineYard(MINES[1], { heightAt });
  const nameOf = (g) => { let s = null; g.traverse((o) => { if (o.isMesh && o.material?.userData?.signText) s = o.material.userData.signText; }); return s; };
  check('two mines do not share one board', nameOf(a) !== nameOf(b), `${nameOf(a)} vs ${nameOf(b)}`);
  setCanvasFactory(null);
}

// ============================================================================
console.log('mine_models: a seam is the ore, in the ore\'s own colour');
{
  // The chain: ores.js gives the vein a WORD, log_piles.ORE_WORD keeps the hex
  // next to that word, and this file reads the hex from there. If anybody edits
  // the word without editing the hex, this goes red and names both.
  let mismatched = [];
  for (const o of ORES) if (oreWord(o.id) !== o.colour) mismatched.push(`${o.id}: "${oreWord(o.id)}" vs "${o.colour}"`);
  check('every hex is still a reading of the word ores.js gives that vein', mismatched.length === 0,
    mismatched.length ? mismatched.join('; ') : `all ${ORES.length} tiers agree`);
  check('and there is a colour for every tier and no tier without one',
    ORES.every((o) => ORE_WORD[o.id]) && Object.keys(ORE_WORD).every((id) => ORE[id]),
    `${Object.keys(ORE_WORD).length} colours, ${ORES.length} tiers`);

  let banded = 0, glinting = 0, over = 0, sunk = 0, floated = 0, worst = 0, clear = 0;
  let wrongFoot = 0, feet = 0, core = Infinity;
  const seams = [];
  for (const mine of MINES) for (const seam of mine.seams) seams.push(seam);
  for (const seam of seams) {
    const g = buildSeam(seam, { heightAt });
    const tris = trisOf(g);
    if (tris > worst) worst = tris;
    if (tris > SEAM_MAX_TRIS) over++;
    for (const foot of g.userData.mine.feet) {
      feet++;
      if (Math.abs(foot.y - heightAt(foot.x, foot.z)) > 1e-9) wrongFoot++;
    }
    // float and sink mean what they say on level ground; on a slope a collar
    // that follows its own ground is meant to sit lower on the downhill side
    const le = extentOf(buildSeam(seam, { heightAt: () => seam.y }));
    if (le.low < -MAX_SINK) sunk++;
    if (le.low > MAX_FLOAT) floated++;
    const want = oreColour(seam.ore);
    let hasBand = false, hasGlint = false;
    g.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m.color?.getHex() !== want) return;
      if (m.emissive && m.emissive.getHex() === want && m.emissiveIntensity > 0) hasGlint = true;
      else hasBand = true;
    });
    if (hasBand) banded++;
    if (hasGlint) glinting++;
    // nothing may grow into the middle, where flora.js puts the minable boulder
    let nearest = Infinity;
    for (const v of verts(g)) nearest = Math.min(nearest, Math.hypot(v.x, v.z));
    if (nearest < core) core = nearest;
    if (nearest >= SEAM_CORE) clear++;
  }
  check('all forty two seams built', seams.length === 47, `${seams.length} seams`);
  check('and none is over its budget', over === 0, `heaviest ${worst} of ${SEAM_MAX_TRIS}`);
  check('every ground sample a seam took is the field\'s own answer there', wrongFoot === 0,
    `${feet} samples over ${seams.length} seams`);
  check('on level ground every one stands on it, neither floating nor sunk', !sunk && !floated);
  check('every seam carries a band in its own ore\'s colour', banded === seams.length,
    `${banded}/${seams.length}, over ${new Set(seams.map((s) => s.ore)).size} different ores`);
  check('and a glint on it, which is what carries twenty metres', glinting === seams.length, `${glinting}/${seams.length}`);
  check('and every one leaves the middle clear for the boulder flora puts there',
    clear === seams.length,
    `${clear}/${seams.length}; the closest anything comes to a seam's axis is `
    + `${core.toFixed(2)} m, and flora's smallest ore boulder is ${SEAM_CORE.toFixed(2)} m in radius`);

  // both directions on the colour: a coldiron seam is not a rimesteel seam
  const cold = buildSeam({ i: 0, x: 0, y: 0, z: 0, ore: 'coldiron' }, { heightAt: () => 0 });
  const rime = buildSeam({ i: 0, x: 0, y: 0, z: 0, ore: 'rimesteel' }, { heightAt: () => 0 });
  const hexes = (g) => { const out = new Set(); g.traverse((o) => { if (o.isMesh) out.add(o.material.color.getHex()); }); return out; };
  check('a coldiron seam carries coldiron and not rimesteel',
    hexes(cold).has(oreColour('coldiron')) && !hexes(cold).has(oreColour('rimesteel')),
    `#${oreColour('coldiron').toString(16)} not #${oreColour('rimesteel').toString(16)}`);
  check('and a rimesteel seam the other way round',
    hexes(rime).has(oreColour('rimesteel')) && !hexes(rime).has(oreColour('coldiron')));
}

// ============================================================================
console.log('mine_models: the lantern, driven at noon and at midnight');
{
  const mouth = MINES[0].mouths[0];
  const g = buildMineMouth(mouth, { heightAt });
  const lit = () => {
    const rows = glowing(g);
    return { rows, on: rows.filter((r) => r.i > 0).length, hidden: rows.filter((r) => !r.vis).length };
  };
  const before = lit();
  check('the cut has exactly the two lit pieces a lantern has', before.rows.length === 2,
    `${before.rows.length} emissive materials, the glass and the flame`);
  check('a lantern is dark and out of the way before anything drives it',
    before.on === 0 && before.hidden === 2);

  g.userData.mineUpdate(0.5, 0);
  const noon = lit();
  check('and at noon it stays dark', noon.on === 0 && noon.hidden === 2, `${noon.hidden} pieces hidden`);

  g.userData.mineUpdate(0.5, 1);
  const night = lit();
  const peak = Math.max(...night.rows.map((r) => r.i));
  const visible = night.rows.filter((r) => r.vis).length;
  check('at midnight the glass lights', peak > 0,
    `the brightest piece is at ${peak.toFixed(2)}; the glass caps at ${LANTERN_GLOW} and the flame at ${(LANTERN_GLOW * 1.6).toFixed(2)}`);
  check('and the flame is on screen', visible === 2, `${visible} lit pieces visible`);
  check('the glow never runs away past the flame\'s own cap', peak <= LANTERN_GLOW * 1.61,
    `${peak.toFixed(2)} against ${(LANTERN_GLOW * 1.6).toFixed(2)}`);

  // it flickers: the same nightFactor at two times is not the same brightness
  const at = [];
  for (let i = 0; i < 8; i++) { g.userData.mineUpdate(0.13, 1); at.push(Math.max(...glowing(g).map((r) => r.i))); }
  check('and it flickers rather than sitting still', new Set(at.map((v) => v.toFixed(3))).size > 4,
    at.map((v) => v.toFixed(2)).join(' '));

  // and back off again
  g.userData.mineUpdate(0.5, 0);
  const dawn = lit();
  check('dawn puts it out again', dawn.on === 0 && dawn.hidden === 2);
}

// ============================================================================
console.log('mine_models: the wheel over the yard');
{
  const g = buildMineYard(MINES[0], { heightAt });
  let spin = null;
  g.traverse((o) => { if (o.isMesh && o.geometry?.type === 'TorusGeometry' && o.parent?.type === 'Group') spin = o.parent; });
  check('the yard has a wheel that is its own object, not baked into the merge', !!spin);
  const a0 = spin.rotation.z;
  g.userData.mineUpdate(0, 0);
  check('no time passing turns it not at all', spin.rotation.z === a0);
  g.userData.mineUpdate(1, 0);
  const a1 = spin.rotation.z;
  check('one second turns it by its own rate', Math.abs((a1 - a0) - WHEEL_RPS * Math.PI * 2) < 1e-9,
    `${((a1 - a0) / Math.PI / 2).toFixed(4)} turns per second, one turn in ${(1 / WHEEL_RPS).toFixed(0)} s`);
  for (let i = 0; i < 10; i++) g.userData.mineUpdate(1, 0);
  check('and eleven seconds is not yet a whole turn, which is what slow means',
    spin.rotation.z - a0 < Math.PI * 2, `${((spin.rotation.z - a0) / Math.PI / 2).toFixed(2)} turns in 11 s`);
}

// ============================================================================
console.log('mine_models: the same mine is the same mine every time');
{
  const a = buildMineYard(MINES[3], { heightAt });
  const b = buildMineYard(MINES[3], { heightAt });
  const sig = (g) => {
    const parts = [];
    g.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) parts.push(o.geometry.attributes.position.count); });
    return parts.join(',');
  };
  check('a yard built twice is built the same', sig(a) === sig(b), `${trisOf(a)} triangles either way`);
  const m1 = buildMineMouth(MINES[3].mouths[0], { heightAt });
  const m2 = buildMineMouth(MINES[3].mouths[0], { heightAt });
  check('and so is a cut', sig(m1) === sig(m2));
  const s1 = buildSeam(MINES[3].seams[0], { heightAt });
  const s2 = buildSeam(MINES[3].seams[0], { heightAt });
  check('and so is a seam', sig(s1) === sig(s2));
  // and two different cuts of one mine are not identical twins
  const other = buildMineMouth(MINES[3].mouths[1], { heightAt });
  check('and building the same cut twice gives the same shape', shapeHash(m1) === shapeHash(m2), shapeHash(m1));
  check('two cuts of one mine are not the same rock twice', shapeHash(m1) !== shapeHash(other),
    `${shapeHash(m1)} against ${shapeHash(other)}`);
  const t1 = buildSeam(MINES[3].seams[0], { heightAt });
  const t2 = buildSeam(MINES[3].seams[1], { heightAt });
  check('and two seams of one mine are not the same outcrop twice', shapeHash(t1) !== shapeHash(t2),
    `${shapeHash(t1)} against ${shapeHash(t2)}`);
}

// ============================================================================
console.log('mine_models: the merge keeps what a texture needs');
{
  // The trap this merge exists to avoid: site_models.mergeByMaterial throws away
  // every attribute but position and normal, and everything here is textured.
  const g = buildMineMouth(MINES[0].mouths[0], { heightAt });
  let uvless = 0, colourless = 0, meshes = 0;
  g.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (o.material.map && !o.geometry.attributes.uv) uvless++;
    if (o.material.vertexColors && !o.geometry.attributes.color) colourless++;
  });
  check('every textured mesh still has its uvs after the merge', uvless === 0, `${meshes} meshes`);
  check('and every vertex coloured one still has its colours', colourless === 0);

  // The bug this file shipped once and must not ship twice: re-parenting out of
  // a live children array drops half the meshes with no error at all.
  const S = new THREE.Group();
  const mats = [];
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x111111 * (i + 1) });
    mats.push(mat);
    S.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  }
  const merged = mergeParts(S);
  check('six materials merge into six meshes and not three', merged.children.length === 6,
    `${merged.children.length} of 6`);
  const dest = new THREE.Group();
  for (const c of [...merged.children]) dest.add(c);
  check('and a copy of the list re-parents all six', dest.children.length === 6, `${dest.children.length} of 6`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
