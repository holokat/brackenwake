// The stroke list, driven both ways. Run: node src/world/terrain_edits.test.mjs
//
// Everything here is measured against the profile the game actually applies:
// the module is pure and takes its ground from a sampler, so this file hands it
// a hillside it knows the shape of and then asks what the ground became.

import { readFileSync } from 'node:fs';
import {
  createTerrainEdits, deltaOf, maxGrade, dome, wallStart, kinds, KIND_PARAMS,
  terraceOf, lineDist, reachOf, noiseFor, noiseTablesHeld,
  // ED5
  ERASE_KIND, HARD_KINDS, OPACITY_KINDS, SOFT_RIM, MIX_DOMINANT,
  PAINT_HARDNESS, PAINT_OPACITY, SCULPT_HARDNESS, ERASE_HARDNESS,
  hardnessOf, opacityOf, coreFrac, coreRadius, hardT, edgeFall, eraseMaskOf,
  eraseHalfR, paintWeightOf, dominantOf, stackDelta, stackGround, overlapsDisc,
  auditFeather,
  STROKE_KINDS, GROUND_WORDS, BASE_GROUNDS, MODES, DEFAULT_BASE, GRID, NEEDS_YAW,
  CAVE_CUT, CAVE_CUT_AHEAD, SMOOTH_PULL, ERODE_PULL, LAKE_FLOOR,
  MOUNTAIN_MAX_R, MOUNTAIN_MAX_AMOUNT, MOUNTAIN_RIDGE, MOUNTAIN_WAVE, MOUNTAIN_OCTAVES,
  TERRACE_STEP, PLATEAU_SKIRT, MIN_R,
  WATER_KINDS, SURFACE_KINDS, isWaterKind, LAKE_DEPTH, POND_DEPTH, POND_R,
  RIVER_WIDTH, RIVER_DEPTH, RIVER_CHAIN, SEA_R, SEA_SURFACE, WATER_LEVEL,
  levelOf, levelEndOf, depthOf, riverHalf, riverAt, riverLevelAt, waterOf,
} from './terrain_edits.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '   ' + detail : ''}`); };

// A hillside with a wrinkle in it, so flatten and smooth have something to bite
// on and the numbers below are not measured against a plane.
const base = (x, z) => 0.15 * x + 0.05 * z + 2.2 * Math.sin(x * 0.7) * Math.cos(z * 0.55);
const flat = () => 0;

// The ground as the world would see it: the base, plus whatever the strokes did.
const ground = (edits, hf) => (x, z) => { const h = hf(x, z); return h + edits.heightDelta(x, z, h); };

/**
 * A list wired the way the runtime wires it: the sampler a `flatten` asks is
 * the ground WITH the earlier strokes in it, because `world_runtime.js` hands
 * `field.heightAt` and the field has already applied the list. Anything else
 * would be a test path that is not the real path.
 */
function wired(hf) {
  let e = null;
  e = createTerrainEdits({ baseHeight: (x, z) => { const h = hf(x, z); return h + (e ? e.heightDelta(x, z, h) : 0); } });
  return e;
}

// ---------------------------------------------------------------------------
// 1. raise: amount at the centre, nothing at the rim, and nothing outside it
// ---------------------------------------------------------------------------
{
  const e = createTerrainEdits({ baseHeight: flat });
  e.stroke({ kind: 'raise', x: 100, z: -50, r: 12, amount: 2 });
  const g = ground(e, flat);
  check('raise puts its whole amount at the centre', Math.abs(g(100, -50) - 2) < 1e-9, `${g(100, -50).toFixed(6)} m`);
  let rim = 0, out = 0;
  for (let a = 0; a < 64; a++) {
    const th = a / 64 * Math.PI * 2;
    rim = Math.max(rim, Math.abs(g(100 + Math.cos(th) * 12, -50 + Math.sin(th) * 12)));
    out = Math.max(out, Math.abs(g(100 + Math.cos(th) * 14, -50 + Math.sin(th) * 14)));
  }
  // 1e-30 and not 0: at t exactly 1 the dome is (1 - 1)^2 and the 1 comes out of
  // a square root, so the rim carries the same float residue field.js snaps for.
  check('and nothing at r worth a millimetre, and exactly nothing past it', rim < 1e-12 && out === 0, `rim ${rim.toExponential(1)} m, 2 m out ${out} m`);
  check('halfway out it is the dome and not a cone',
    Math.abs(g(106, -50) - 2 * dome(0.5)) < 1e-9, `${g(106, -50).toFixed(4)} m against ${(2 * dome(0.5)).toFixed(4)}`);
  // no crack anywhere: the biggest step between samples 1 cm apart, across the rim
  let step = 0;
  for (let d = 0; d < 16; d += 0.01) {
    step = Math.max(step, Math.abs(g(100 + d, -50) - g(100 + d - 0.01, -50)));
  }
  check('the surface is continuous over the rim (no crack for a chunk seam)', step < 0.02, `worst 1 cm step ${step.toFixed(5)} m`);
  const grade = step / 0.01;
  check('and its steepest metre is the one maxGrade claims',
    Math.abs(grade - maxGrade({ kind: 'raise', r: 12, amount: 2 })) < 0.02,
    `measured ${grade.toFixed(4)}, claimed ${maxGrade({ kind: 'raise', r: 12, amount: 2 }).toFixed(4)} m per m`);
  // lower is the same shape, downward
  const e2 = createTerrainEdits({ baseHeight: flat });
  e2.stroke({ kind: 'lower', x: 0, z: 0, r: 10, amount: 3 });
  check('lower is the same dome, down', Math.abs(ground(e2, flat)(0, 0) + 3) < 1e-9, `${ground(e2, flat)(0, 0).toFixed(4)} m`);
}

// ---------------------------------------------------------------------------
// 2. flatten: the ground inside r/2 is the height the centre had
// ---------------------------------------------------------------------------
{
  const e = createTerrainEdits({ baseHeight: base });
  const s = e.stroke({ kind: 'flatten', x: 40, z: 12, r: 16 });
  const g = ground(e, base);
  const want = base(40, 12);
  check('a flatten remembers the height it is flattening to', Math.abs(s.h0 - want) < 1e-9, `h0 ${s.h0.toFixed(3)} m`);
  let worst = 0, at = '';
  for (let dz = -8; dz <= 8; dz += 0.5) for (let dx = -8; dx <= 8; dx += 0.5) {
    if (dx * dx + dz * dz > 64) continue;
    const d = Math.abs(g(40 + dx, 12 + dz) - want);
    if (d > worst) { worst = d; at = `${dx}, ${dz}`; }
  }
  check('everything within r/2 is level with the centre, inside 5 cm', worst < 0.05,
    `worst ${(worst * 100).toFixed(3)} cm at ${at}`);
  const rough = Math.abs(base(46, 18) - want);
  check('and the hillside it was cut into really was not level', rough > 0.5, `${rough.toFixed(2)} m out at 6, 6 before the stroke`);
  check('the world outside r is untouched', g(40 + 16.5, 12) === base(40 + 16.5, 12));
  // and it flattens what the strokes before it left, not the raw hillside
  const e2 = wired(base);
  e2.stroke({ kind: 'raise', x: 40, z: 12, r: 16, amount: 5 });
  const s2 = e2.stroke({ kind: 'flatten', x: 40, z: 12, r: 16 });
  check('a flatten laid over a raise flattens the raised ground',
    Math.abs(s2.h0 - (base(40, 12) + 5)) < 1e-9, `h0 ${s2.h0.toFixed(3)} against ${(base(40, 12) + 5).toFixed(3)}`);
  check('and the ground it leaves is that same height',
    Math.abs(ground(e2, base)(43, 14) - s2.h0) < 0.05, `${ground(e2, base)(43, 14).toFixed(3)} m`);
}

// ---------------------------------------------------------------------------
// 3. pit: a flat floor `amount` down, a wall over 45 degrees, a lip with no step
// ---------------------------------------------------------------------------
{
  const e = createTerrainEdits({ baseHeight: flat });
  e.stroke({ kind: 'pit', x: -200, z: 300, r: 9, amount: 3 });
  const g = ground(e, flat);
  check('the floor is the whole depth down', Math.abs(g(-200, 300) + 3) < 1e-9, `${g(-200, 300).toFixed(4)} m`);
  const rim = g(-200 + 9, 300);
  check('the rim is the ground it was cut into', rim === 0, `${rim} m`);
  check('and the floor is `amount` below the rim', Math.abs((rim - g(-200, 300)) - 3) < 1e-9,
    `${(rim - g(-200, 300)).toFixed(4)} m of drop`);
  let steep = 0, floorSpan = 0, stepWorst = 0;
  for (let d = 0; d <= 10; d += 0.01) {
    const a = g(-200 + d, 300), b = g(-200 + d - 0.01, 300);
    if (d > 0) { const s = Math.abs(a - b) / 0.01; if (s > steep) steep = s; stepWorst = Math.max(stepWorst, Math.abs(a - b)); }
    if (Math.abs(a + 3) < 1e-9) floorSpan = d;
  }
  check('the wall is steeper than 45 degrees', steep > 1, `steepest ${steep.toFixed(2)} m per m`);
  check('and the floor really is flat out to PIT_FLOOR of the radius', floorSpan > 9 * wallStart(3, 9) - 0.02,
    `flat out to ${floorSpan.toFixed(2)} m of ${(9 * wallStart(3, 9)).toFixed(2)}`);
  check('the lip meets the hillside with no step in it', stepWorst < 0.02, `worst 1 cm step ${stepWorst.toFixed(4)} m`);
  check('and maxGrade tells the truth about that wall',
    Math.abs(steep - maxGrade({ kind: 'pit', r: 9, amount: 3 })) < 0.03,
    `measured ${steep.toFixed(3)}, claimed ${maxGrade({ kind: 'pit', r: 9, amount: 3 }).toFixed(3)}`);
  // a pit too deep for its radius widens its own wall rather than cutting a hole
  const deep = { kind: 'pit', r: 3, amount: 9 };
  check('a pit deeper than its radius widens its wall to stay meshable',
    maxGrade(deep) <= 6.001 && wallStart(9, 3) < 0.5,
    `wall starts at ${wallStart(9, 3).toFixed(3)} of r, steepest ${maxGrade(deep).toFixed(2)} m per m`);
}

// ---------------------------------------------------------------------------
// 4. cliff: a step of `amount` across the line, one side only
// ---------------------------------------------------------------------------
{
  const e = createTerrainEdits({ baseHeight: flat });
  // yaw 0 points at +z, which is the side that goes up
  e.stroke({ kind: 'cliff', x: 0, z: 0, r: 20, amount: 4, yaw: 0 });
  const g = ground(e, flat);
  const hi = g(0, 5), lo = g(0, -5);
  check('the side the yaw points at is up by the whole amount', Math.abs(hi - 4) < 1e-6, `${hi.toFixed(4)} m`);
  check('and the other side is not touched at all', lo === 0, `${lo} m`);
  check('the step across the line is `amount`', Math.abs((hi - lo) - 4) < 1e-6, `${(hi - lo).toFixed(4)} m`);
  check('the line itself is halfway up', Math.abs(g(0, 0) - 2) < 1e-6, `${g(0, 0).toFixed(4)} m`);
  let steep = 0;
  for (let d = -8; d <= 8; d += 0.01) steep = Math.max(steep, Math.abs(g(0, d) - g(0, d - 0.01)) / 0.01);
  check('the step is steep but bounded, and maxGrade knows the number',
    Math.abs(steep - maxGrade({ kind: 'cliff', r: 20, amount: 4 })) < 0.05,
    `measured ${steep.toFixed(3)}, claimed ${maxGrade({ kind: 'cliff', r: 20, amount: 4 }).toFixed(3)} m per m`);
  // turned a quarter turn it steps across the other axis
  const e2 = createTerrainEdits({ baseHeight: flat });
  e2.stroke({ kind: 'cliff', x: 0, z: 0, r: 20, amount: 4, yaw: Math.PI / 2 });
  const g2 = ground(e2, flat);
  check('yaw turns the step: at a quarter turn +x is the high side',
    Math.abs(g2(5, 0) - 4) < 1e-6 && g2(-5, 0) === 0, `+x ${g2(5, 0).toFixed(3)} m, -x ${g2(-5, 0)} m`);
  check('and a cliff reaches no further than its own radius', g(0, 21) === 0 && g(0, -21) === 0);
}

// ---------------------------------------------------------------------------
// 5. smooth: the variance of a rough patch goes down
// ---------------------------------------------------------------------------
{
  const rough = (x, z) => 3 * Math.sin(x * 0.9) + 2.4 * Math.cos(z * 1.3) + 1.1 * Math.sin((x + z) * 0.45);
  const varOf = (hf, x0, z0, r) => {
    const v = [];
    for (let dz = -r; dz <= r; dz += 0.6) for (let dx = -r; dx <= r; dx += 0.6) {
      if (dx * dx + dz * dz > r * r) continue;
      v.push(hf(x0 + dx, z0 + dz));
    }
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length;
  };
  const e = createTerrainEdits({ baseHeight: rough });
  const s = e.stroke({ kind: 'smooth', x: 0, z: 0, r: 14 });
  const g = ground(e, rough);
  const before = varOf(rough, 0, 0, 7), after = varOf(g, 0, 0, 7);
  check('a smooth stroke takes the variance out of a rough patch', after < before * 0.5,
    `${before.toFixed(3)} m^2 to ${after.toFixed(3)} m^2`);
  check('it pulls toward the average of a ring, not toward the centre point',
    Math.abs(s.h0 - rough(0, 0)) > 1e-6, `ring ${s.h0.toFixed(3)} m, centre ${rough(0, 0).toFixed(3)} m`);
  check('and the default pull is partial, so a smooth is not a flatten',
    after > 0, `${after.toFixed(4)} m^2 of relief left, pull ${SMOOTH_PULL}`);
  check('the ground outside it is untouched', g(0, 15) === rough(0, 15));
  const varOut = varOf(g, 0, 30, 7);
  check('and a patch well away from it is exactly as rough as it was',
    Math.abs(varOut - varOf(rough, 0, 30, 7)) < 1e-9, `${varOut.toFixed(3)} m^2`);
}

// ---------------------------------------------------------------------------
// 6. cave: the cut stands in front of the mouth, on the mouth's bearing
// ---------------------------------------------------------------------------
{
  const e = createTerrainEdits({ baseHeight: flat });
  e.stroke({ kind: 'cave', x: 0, z: 0, r: 10, amount: 2, yaw: 0 });
  const g = ground(e, flat);
  const ahead = g(0, 10 * CAVE_CUT_AHEAD), behind = g(0, -10 * (1 + CAVE_CUT_AHEAD) - 1);
  check('the cut is the full depth in front of the mouth', Math.abs(ahead + CAVE_CUT) < 1e-9, `${ahead.toFixed(3)} m`);
  check('the hillside behind the mouth is not dug out', behind === 0, `${behind} m`);
  check('and the mouth itself stands on the floor of the cut',
    Math.abs(g(0, 0) + CAVE_CUT) < 1e-9, `${g(0, 0).toFixed(3)} m`);
  check('a cave stroke is offered as a cave', e.caves().length === 1 && e.caves()[0].kind === 'cave');
  // `skipKind` is how field.js asks which way the hill falls without its own cut
  check('skipKind takes the cut back out of the answer',
    e.heightDelta(0, 3, 0, 'cave') === 0 && e.heightDelta(0, 3, 0) < 0);
}

// ---------------------------------------------------------------------------
// 7. ground: the word, inside r, last stroke wins
// ---------------------------------------------------------------------------
{
  const e = createTerrainEdits({ baseHeight: flat });
  e.stroke({ kind: 'ground', x: 500, z: 500, r: 10, word: 'dirt' });
  check('the word is painted inside r', e.groundOverride(500, 505) === 'dirt');
  check('and nothing is painted outside it', e.groundOverride(500, 511) === null);
  check('a ground stroke moves no ground at all', e.heightDelta(500, 500, 7) === 0);
  e.stroke({ kind: 'ground', x: 505, z: 500, r: 6, word: 'rock' });
  check('the last stroke over a point wins', e.groundOverride(504, 500) === 'rock');
  check('and the older paint is still there where the newer one did not reach',
    e.groundOverride(494, 500) === 'dirt');
  let threw = null;
  try { e.stroke({ kind: 'ground', x: 0, z: 0, r: 4, word: 'lava' }); } catch (err) { threw = err.message; }
  check('a word nobody knows is refused, by name', !!threw && threw.includes('lava'), threw || 'it was accepted');
  check('every word the module offers is one the caller can use',
    GROUND_WORDS.every((w) => { try { e.stroke({ kind: 'ground', x: 0, z: 0, r: 4, word: w }); return true; } catch { return false; } }),
    GROUND_WORDS.join(' '));
}

// ---------------------------------------------------------------------------
// 8. undo and redo, both ways, and the ground follows them
// ---------------------------------------------------------------------------
{
  const e = createTerrainEdits({ baseHeight: flat });
  const g = ground(e, flat);
  e.stroke({ kind: 'raise', x: 0, z: 0, r: 10, amount: 2 });
  e.stroke({ kind: 'raise', x: 0, z: 0, r: 10, amount: 3 });
  check('two strokes stack', Math.abs(g(0, 0) - 5) < 1e-9, `${g(0, 0)} m`);
  const u = e.undo();
  check('undo hands back the stroke it took', u && u.amount === 3, u ? `amount ${u.amount}` : 'nothing');
  check('and the ground is what it was before it', Math.abs(g(0, 0) - 2) < 1e-9, `${g(0, 0)} m`);
  e.undo();
  check('undo to the bottom leaves the world alone', g(0, 0) === 0 && e.count === 0);
  check('undo past the bottom says so instead of throwing', e.undo() === null);
  e.redo(); e.redo();
  check('redo puts both back, in order', Math.abs(g(0, 0) - 5) < 1e-9 && e.count === 2, `${g(0, 0)} m`);
  check('redo past the top says so', e.redo() === null);
  e.undo();
  e.stroke({ kind: 'raise', x: 0, z: 0, r: 10, amount: 1 });
  check('a new stroke after an undo throws the future away',
    e.undoneCount === 0 && Math.abs(g(0, 0) - 3) < 1e-9, `${g(0, 0)} m, ${e.undoneCount} waiting`);
}

// ---------------------------------------------------------------------------
// 9. the file: serialize, load, and the same ground on the other side
// ---------------------------------------------------------------------------
{
  const e = createTerrainEdits({ baseHeight: base });
  e.stroke({ kind: 'raise', x: 12, z: -30, r: 14, amount: 2.5 });
  e.stroke({ kind: 'flatten', x: 12, z: -30, r: 9 });
  e.stroke({ kind: 'pit', x: 40, z: 40, r: 7, amount: 2 });
  e.stroke({ kind: 'cliff', x: -60, z: 10, r: 18, amount: 3, yaw: 1.2 });
  e.stroke({ kind: 'cave', x: 200, z: -200, r: 10, amount: 2, yaw: 0.4 });
  e.stroke({ kind: 'ground', x: 12, z: -30, r: 6, word: 'dirt' });
  const json = JSON.parse(JSON.stringify(e.serialize()));
  // the second field has NO sampler at all: a loaded file must stand on its own
  const back = createTerrainEdits();
  const n = back.load(json);
  check('every stroke came back', n === 6 && back.count === 6, `${n} strokes`);
  let worst = 0, at = '';
  for (let x = -120; x <= 260; x += 3.7) for (let z = -260; z <= 120; z += 3.3) {
    const h = base(x, z);
    const d = Math.abs(e.heightDelta(x, z, h) - back.heightDelta(x, z, h));
    if (d > worst) { worst = d; at = `${x.toFixed(0)}, ${z.toFixed(0)}`; }
  }
  check('and the ground on the other side of the file is the same ground', worst === 0,
    `worst difference ${worst} m${worst ? ' at ' + at : ''} over 11,000 points`);
  check('the paint came back too', back.groundOverride(12, -30) === 'dirt');
  check('the cave came back as a cave', back.caves().length === 1);
  const b = back.bounds();
  check('bounds covers every stroke', b.x0 <= -78 && b.x1 >= 213 && b.z0 <= -213 && b.z1 >= 47,
    `${b.x0.toFixed(0)}, ${b.z0.toFixed(0)} to ${b.x1.toFixed(0)}, ${b.z1.toFixed(0)}`);
  check('an empty list has no bounds rather than an infinite one', createTerrainEdits().bounds() === null);
  check('a file with a stroke nobody understands loads the rest of it',
    createTerrainEdits().load({ v: 1, strokes: [{ kind: 'wobble', x: 0, z: 0 }, json.strokes[0]] }) === 1);
}

// ---------------------------------------------------------------------------
// 10. the grid: two thousand strokes, ten thousand samples
// ---------------------------------------------------------------------------
{
  const e = createTerrainEdits({ baseHeight: flat });
  const kinds = ['raise', 'lower', 'pit', 'cliff'];
  for (let i = 0; i < 2000; i++) {
    e.stroke({
      kind: kinds[i % kinds.length],
      x: ((i * 137) % 2000) - 1000, z: ((i * 311) % 2000) - 1000,
      r: 6 + (i % 11), amount: 1 + (i % 4), yaw: (i % 17) * 0.37,
    });
  }
  const pts = [];
  for (let i = 0; i < 10000; i++) pts.push([((i * 73) % 2000) - 1000, ((i * 179) % 2000) - 1000]);
  e.heightDelta(0, 0, 0);                       // build the index outside the clock
  const t0 = performance.now();
  let acc = 0;
  for (const [x, z] of pts) acc += e.heightDelta(x, z, 0);
  const ms = performance.now() - t0;
  check('2,000 strokes, 10,000 samples, under 30 ms', ms < 30,
    `${ms.toFixed(2)} ms, ${(ms * 1000 / 10000).toFixed(2)} us a sample, sum ${acc.toFixed(1)} m`);
  // and the grid is not lying about what it holds: a slow, honest answer agrees
  const slow = (x, z) => { let cur = 0; for (const s of e.strokes) cur += deltaOf(s, x, z, cur); return cur; };
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const [x, z] = pts[i * 7 % pts.length];
    worst = Math.max(worst, Math.abs(e.heightDelta(x, z, 0) - slow(x, z)));
  }
  check('and the indexed answer is the answer a walk of every stroke gives', worst === 0,
    `worst difference ${worst} m over 400 points`);
  const t1 = performance.now();
  e.undo(); e.heightDelta(0, 0, 0);
  check('an undo with 2,000 strokes down rebuilds the index in under 30 ms',
    performance.now() - t1 < 30, `${(performance.now() - t1).toFixed(2)} ms`);
}

// ---------------------------------------------------------------------------
// 11. nothing set, nothing changed
// ---------------------------------------------------------------------------
{
  const e = createTerrainEdits({ baseHeight: base });
  let any = false;
  for (let i = 0; i < 500; i++) {
    const x = (i * 733.7) % 9000 - 4500, z = (i * 311.3) % 9000 - 4500;
    if (e.heightDelta(x, z, base(x, z)) !== 0 || e.groundOverride(x, z) !== null) any = true;
  }
  check('an empty list moves no ground and paints no word, over 500 points', !any);
  check('every kind the module names is a kind it can lay down',
    STROKE_KINDS.every((k) => {
      const t = createTerrainEdits({ baseHeight: base });
      try { t.stroke({ kind: k, x: 0, z: 0, r: 8, amount: 1, word: 'dirt' }); return t.count === 1; } catch { return false; }
    }), STROKE_KINDS.join(' '));
  let threw = null;
  try { createTerrainEdits().stroke({ kind: 'flatten', x: 0, z: 0, r: 8 }); } catch (err) { threw = err.message; }
  check('a flatten with no sampler and no h0 refuses rather than doing nothing quietly',
    !!threw && threw.includes('baseHeight'), threw || 'it was accepted');
}

// ---------------------------------------------------------------------------
// 12. ED3: the eight new kinds, each driven both ways
// ---------------------------------------------------------------------------
//
// "Both ways" means the same thing here it means everywhere else in this file:
// the case the kind is FOR is measured, and so is the case it must refuse. A
// ridge is measured along its line AND off the end of it; an erode is measured
// where it lowers AND where it would have raised; a mountain is measured with
// its ridges on AND with them off, where it has to be exactly a raise.

// 12a. mountain
{
  const e = createTerrainEdits({ baseHeight: flat });
  const m = e.stroke({ kind: 'mountain', x: 0, z: 0, r: 240, amount: 120, roughness: 0.6 });
  const g = ground(e, flat);
  check('a mountain carries its own seed, so the file grows the same one anywhere',
    Number.isFinite(m.seed), `seed ${m.seed}`);
  let peak = -Infinity, rim = 0, out = 0;
  for (let a = 0; a < 720; a++) {
    const th = a / 720 * Math.PI * 2;
    for (let d = 0; d < 240; d += 4) peak = Math.max(peak, g(Math.cos(th) * d, Math.sin(th) * d));
    rim = Math.max(rim, Math.abs(g(Math.cos(th) * 240, Math.sin(th) * 240)));
    out = Math.max(out, Math.abs(g(Math.cos(th) * 260, Math.sin(th) * 260)));
  }
  check('its summit is at or under the height asked for, never over it',
    peak <= 120 + 1e-9 && peak > 120 * 0.8, `${peak.toFixed(2)} m of the 120 asked for`);
  check('and it comes to nothing at its own rim and outside it',
    rim < 1e-9 && out === 0, `rim ${rim.toExponential(1)} m, 20 m out ${out} m`);
  // the ridges are real: a bare dome is a function of the distance alone, so
  // two points the same distance out would be the same height
  const ring = [];
  for (let a = 0; a < 64; a++) { const th = a / 64 * Math.PI * 2; ring.push(g(Math.cos(th) * 100, Math.sin(th) * 100)); }
  const spread = Math.max(...ring) - Math.min(...ring);
  check('the ridges are real: a ring 100 m out is not all one height',
    spread > 10, `${spread.toFixed(2)} m between the highest and the lowest of 64 points on the ring`);
  // and with the roughness off it is EXACTLY a raise, to the last bit
  const bare = createTerrainEdits({ baseHeight: flat });
  bare.stroke({ kind: 'mountain', x: 0, z: 0, r: 100, amount: 50, roughness: 0 });
  const plain = createTerrainEdits({ baseHeight: flat });
  plain.stroke({ kind: 'raise', x: 0, z: 0, r: 100, amount: 50 });
  let diff = 0;
  for (let i = 0; i < 400; i++) {
    const x = (i % 20) * 10 - 100, z = Math.floor(i / 20) * 10 - 100;
    diff = Math.max(diff, Math.abs(bare.heightDelta(x, z, 0) - plain.heightDelta(x, z, 0)));
  }
  check('roughness 0 is a raise, bit for bit, over 400 points', diff === 0, `worst difference ${diff} m`);
  // the same seed twice is the same mountain; a different seed is a different one
  const twin = createTerrainEdits({ baseHeight: flat });
  twin.stroke({ ...m, id: null });
  let same = 0, other = 0;
  const odd = createTerrainEdits({ baseHeight: flat });
  odd.stroke({ ...m, id: null, seed: m.seed + 1 });
  for (let i = 0; i < 200; i++) {
    const x = (i % 20) * 20 - 200, z = Math.floor(i / 20) * 20 - 100;
    same = Math.max(same, Math.abs(twin.heightDelta(x, z, 0) - e.heightDelta(x, z, 0)));
    other = Math.max(other, Math.abs(odd.heightDelta(x, z, 0) - e.heightDelta(x, z, 0)));
  }
  check('the same seed is the same mountain, and another seed is another mountain',
    same === 0 && other > 1, `same seed ${same} m apart, other seed ${other.toFixed(1)} m apart`);
  // maxGrade is a BOUND, so it has to be at least what the ground does
  let steep = 0, prev = g(-260, 0);
  for (let d = -260; d <= 260; d += 0.25) { const h = g(d, 0); steep = Math.max(steep, Math.abs(h - prev) / 0.25); prev = h; }
  check('and maxGrade is an upper bound on what the ground actually does',
    maxGrade(m) >= steep, `measured ${steep.toFixed(3)}, claimed ${maxGrade(m).toFixed(3)} m per m`);
  // the clamps: asked for a mountain the size of a realm, given one of 600 m
  const huge = e.stroke({ kind: 'mountain', x: 5000, z: 5000, r: 4000, amount: 9000, roughness: 3 });
  check('a mountain bigger than the module allows is clamped, and says the clamped number',
    huge.r === MOUNTAIN_MAX_R && huge.amount === MOUNTAIN_MAX_AMOUNT && huge.roughness === 1,
    `asked 4000 m by 9000 m, got ${huge.r} by ${huge.amount}, roughness ${huge.roughness}`);
}

// 12b. ridge and valley: the line, and the ground off the end of it
{
  const e = createTerrainEdits({ baseHeight: flat });
  const r = e.stroke({ kind: 'ridge', x: 0, z: 0, r: 40, amount: 60, length: 300, yaw: 0 });   // yaw 0 is +z
  const g = ground(e, flat);
  let along = Infinity;
  for (let d = 0; d <= 300; d += 2) along = Math.min(along, g(0, d));
  check('a ridge stands its full height everywhere along its own line',
    Math.abs(along - 60) < 1e-9, `lowest point of 151 along the line ${along.toFixed(6)} m`);
  check('and it is a capsule: nothing at its side rim, nothing past its far cap',
    Math.abs(g(40, 150)) < 1e-9 && g(0, 341) === 0 && g(0, -41) === 0,
    `side ${g(40, 150).toExponential(1)} m, 41 m past the end ${g(0, 341)} m, 41 m behind the start ${g(0, -41)} m`);
  check('half way out from the line it is the same dome a raise draws',
    Math.abs(g(20, 150) - 60 * dome(0.5)) < 1e-9, `${g(20, 150).toFixed(4)} against ${(60 * dome(0.5)).toFixed(4)}`);
  check('lineDist measures to the segment and not to the point',
    Math.abs(lineDist(r, 0, 150)) < 1e-9 && Math.abs(lineDist(r, 0, 400) - 100) < 1e-9,
    `on the line 0 m, 100 m past the end ${lineDist(r, 0, 400).toFixed(1)} m`);
  check('and the index is told how far a capsule reaches, or half of it would be missed',
    reachOf(r) === 340, `${reachOf(r)} m against r 40 plus length 300`);
  // No crack anywhere across the side rim. The threshold is the grade the
  // module CLAIMS for this stroke and not a flat number: a ridge 60 m high in a
  // 40 m radius is genuinely 2.3 m per metre on its flank, so a fixed 2 cm
  // would be measuring the ridge's steepness rather than its continuity.
  let step = 0;
  for (let d = 0; d < 50; d += 0.01) step = Math.max(step, Math.abs(g(d, 150) - g(d - 0.01, 150)));
  check('the side of a ridge is continuous over its rim, at the grade it claims',
    step <= maxGrade(r) * 0.01 + 1e-9,
    `worst 1 cm step ${step.toFixed(5)} m, which is ${(step / 0.01).toFixed(3)} m per metre against the claimed ${maxGrade(r).toFixed(3)}`);
  const v = createTerrainEdits({ baseHeight: flat });
  v.stroke({ kind: 'valley', x: 0, z: 0, r: 40, amount: 20, length: 300, yaw: Math.PI / 2 });   // +x
  check('a valley is the same line, downward, and on the bearing it was given',
    Math.abs(v.heightDelta(150, 0, 0) + 20) < 1e-9 && v.heightDelta(0, 150, 0) === 0,
    `${v.heightDelta(150, 0, 0).toFixed(4)} m along +x, ${v.heightDelta(0, 150, 0)} m along +z`);
}

// 12c. plateau: an absolute height, a steeper skirt than a flatten
{
  const e = wired(base);
  const p = e.stroke({ kind: 'plateau', x: 0, z: 0, r: 40, height: 20 });
  const g = ground(e, base);
  let worst = 0;
  for (let a = 0; a < 64; a++) {
    const th = a / 64 * Math.PI * 2;
    for (let d = 0; d <= 40 * PLATEAU_SKIRT; d += 2) worst = Math.max(worst, Math.abs(g(Math.cos(th) * d, Math.sin(th) * d) - 20));
  }
  check('a plateau puts its whole top at the height it was told, not at the height it found',
    worst < 1e-9, `worst point inside the skirt ${(worst * 100).toFixed(3)} cm off 20 m, on ground that ran ${base(0, 0).toFixed(2)} to ${base(30, 0).toFixed(2)} m`);
  check('and it lets the ground go entirely at its own rim',
    Math.abs(g(40, 0) - base(40, 0)) < 1e-9 && Math.abs(g(46, 0) - base(46, 0)) < 1e-9,
    `at r ${(g(40, 0) - base(40, 0)).toExponential(1)} m off the hillside`);
  check('its skirt is steeper than a flatten: the top holds out to 0.75 of r where a flatten holds to 0.5',
    PLATEAU_SKIRT === 0.75, `${PLATEAU_SKIRT} of the radius`);
  // with no height given it captures one, and the capture is IN the stroke
  const cap = wired(base);
  const c = cap.stroke({ kind: 'plateau', x: 12, z: -7, r: 20 });
  check('a plateau with no height given captures the ground it stands on, and carries it',
    Math.abs(c.h0 - base(12, -7)) < 1e-9 && c.height == null, `h0 ${c.h0.toFixed(4)} m`);
  check('and maxGrade will not guess at a kind whose steepness belongs to the ground',
    maxGrade(p) === null, String(maxGrade(p)));
}

// 12d. terrace: a stair, and not a tear
{
  // With `sharp` 0.5 the lower half of every step is flat tread and the upper
  // half is the riser, so ground at 8, 9 and 10 all stand on the 8 m tread and
  // the climb to 12 happens between 10 and 12.
  check('terraceOf holds a tread flat over `1 - sharp` of the step and climbs over the rest',
    terraceOf(8.0, 4, 0.5) === 8 && terraceOf(9.0, 4, 0.5) === 8 && terraceOf(10.0, 4, 0.5) === 8
    && Math.abs(terraceOf(11.0, 4, 0.5) - 10) < 1e-9 && Math.abs(terraceOf(11.999, 4, 0.5) - 12) < 0.001,
    `8.0, 9.0 and 10.0 all to 8, 11.0 to ${terraceOf(11.0, 4, 0.5)}, 11.999 to ${terraceOf(11.999, 4, 0.5).toFixed(4)}`);
  // it is continuous in the ground, which is what stops it being a tear
  let jump = 0;
  for (let h = -20; h < 20; h += 0.001) jump = Math.max(jump, Math.abs(terraceOf(h, 4, 0.5) - terraceOf(h - 0.001, 4, 0.5)));
  check('and it is continuous in the ground: a stair with no vertical riser in it',
    jump < 0.01, `worst step for a 1 mm change in the ground ${(jump * 1000).toFixed(3)} mm`);
  // driven the other way: a sharper riser is steeper, and it is bounded
  let sharpJump = 0;
  for (let h = -20; h < 20; h += 0.001) sharpJump = Math.max(sharpJump, Math.abs(terraceOf(h, 4, 0.1) - terraceOf(h - 0.001, 4, 0.1)));
  check('a sharper riser is steeper and still bounded', sharpJump > jump && sharpJump < 0.06,
    `sharp 0.5 ${(jump * 1000).toFixed(2)} mm, sharp 0.1 ${(sharpJump * 1000).toFixed(2)} mm per mm of ground`);
  const e = wired(base);
  e.stroke({ kind: 'terrace', x: 0, z: 0, r: 30, step: 3 });
  const g = ground(e, base);
  let offTread = 0, n = 0;
  for (let a = 0; a < 32; a++) {
    const th = a / 32 * Math.PI * 2;
    for (let d = 0; d <= 15; d += 1) {
      const h = g(Math.cos(th) * d, Math.sin(th) * d);
      offTread = Math.max(offTread, Math.abs(h / 3 - Math.round(h / 3)) * 3); n++;
    }
  }
  check('inside a terrace the ground stands on treads a step apart',
    offTread < 3 * 0.5, `worst of ${n} points is ${offTread.toFixed(3)} m off the nearest 3 m tread`);
  check('and outside it the hillside is the hillside',
    Math.abs(g(31, 0) - base(31, 0)) < 1e-9, `${(g(31, 0) - base(31, 0)).toExponential(1)} m`);
}

// 12e. noise: roughening, and the emptiness it leaves at its rim
{
  const e = createTerrainEdits({ baseHeight: flat });
  const s = e.stroke({ kind: 'noise', x: 0, z: 0, r: 60, amount: 3, wave: 20 });
  const g = ground(e, flat);
  let lo = Infinity, hi = -Infinity, sum = 0, n = 0;
  for (let i = 0; i < 2000; i++) {
    const th = (i * 0.61) % (Math.PI * 2), d = (i * 0.37) % 40;
    const h = g(Math.cos(th) * d, Math.sin(th) * d);
    lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h * h; n++;
  }
  check('a noise stroke roughens the ground both ways, up and down',
    lo < -0.5 && hi > 0.5 && hi <= 3 + 1e-9 && lo >= -3 - 1e-9,
    `${lo.toFixed(3)} m to ${hi.toFixed(3)} m of the 3 m asked for, rms ${Math.sqrt(sum / n).toFixed(3)} m`);
  check('and it leaves the rim alone, so it cannot crack a chunk seam',
    Math.abs(g(60, 0)) < 1e-9 && g(64, 0) === 0, `${g(60, 0).toExponential(1)} m at r`);
  check('its seed is in the stroke too', Number.isFinite(s.seed), `seed ${s.seed}`);
  // the noise tables are kept per seed, and the cache is bounded rather than
  // growing for ever: a terrain vertex may not shuffle a 256 entry table
  const held = noiseTablesHeld();
  for (let i = 0; i < 40; i++) e.stroke({ kind: 'noise', x: i * 200, z: 0, r: 20, amount: 1, seed: 90000 + i });
  for (let i = 0; i < 40; i++) e.heightDelta(i * 200, 0, 0);
  const grew = noiseTablesHeld();
  for (let i = 0; i < 40; i++) e.heightDelta(i * 200, 0, 0);
  check('one noise table per seed, kept, and no more built on the second pass',
    grew >= held + 40 && noiseTablesHeld() === grew && grew < 600,
    `${held} tables before, ${grew} after 40 new seeds, ${noiseTablesHeld()} after sampling them again`);
}

// 12f. erode: a smooth that may only take away
{
  const e = wired(base);
  e.stroke({ kind: 'erode', x: 0, z: 0, r: 30, amount: 0.6 });
  let up = 0, down = 0, n = 0;
  for (let a = 0; a < 64; a++) {
    const th = a / 64 * Math.PI * 2;
    for (let d = 0; d <= 30; d += 1) {
      const x = Math.cos(th) * d, z = Math.sin(th) * d;
      const dlt = e.heightDelta(x, z, base(x, z)); n++;
      if (dlt > up) up = dlt;
      if (dlt < down) down = dlt;
    }
  }
  check('an erode lowers ground that stands proud of the ring average', down < -0.5, `most it took away ${down.toFixed(3)} m`);
  check('and over ' + n + ' points it never once raised any', up === 0, `most it added ${up} m`);
  // the same brush as a smooth, on the same ground, DOES raise: so the refusal
  // is the erode's own and not a property of this hillside
  const sm = wired(base);
  sm.stroke({ kind: 'smooth', x: 0, z: 0, r: 30, amount: 0.6 });
  let smUp = 0;
  for (let a = 0; a < 64; a++) {
    const th = a / 64 * Math.PI * 2;
    for (let d = 0; d <= 30; d += 1) {
      const x = Math.cos(th) * d, z = Math.sin(th) * d;
      smUp = Math.max(smUp, sm.heightDelta(x, z, base(x, z)));
    }
  }
  check('driven the other way: a smooth over the same ground raises part of it',
    smUp > 0.5, `the smooth added up to ${smUp.toFixed(3)} m where the erode added none`);
  check('and an erode takes its ring average once and carries it, like a smooth',
    e.strokes[0].h0 != null, `h0 ${e.strokes[0].h0.toFixed(4)} m`);
}

// ---------------------------------------------------------------------------
// 12g. ED4: the five brushes that place water, and the ground that does not
// ---------------------------------------------------------------------------
//
// The rule the whole of ED4 turns on: a height NEVER makes water, and a water
// stroke ALWAYS does. Every check below is driven both ways, because half of a
// rule proved is a rule that is going to break on the half nobody looked at.

// 12g-i. a lake on the flat: a surface where you asked, a bed under it, a bank
{
  const e = wired(() => 6);
  const l = e.stroke({ kind: 'lake', x: 0, z: 0, r: 24, level: 6 });
  const g = ground(e, () => 6);
  const wet = (x, z) => e.waterAt(x, z, g(x, z));
  check('a lake carries its surface and its bed as two numbers, not one floor',
    l.level === 6 && l.depth === LAKE_DEPTH && l.floor === undefined,
    `level ${l.level} m, depth ${l.depth} m, and no floor property at all`);
  check('and on flat ground at 6 m it digs its own bed 4 m under the surface',
    Math.abs(g(0, 0) - 2) < 1e-9, `${g(0, 0).toFixed(4)} m at the centre, 4.0000 m under the 6 m surface`);
  check('there is water at the centre, and the sample carries the level',
    wet(0, 0).water === true && wet(0, 0).level === 6, JSON.stringify(wet(0, 0)));
  // Where the water stops IS where the bank rises through the surface, which is
  // what makes a lake a lake and not a disc of blue laid over a hillside.
  let lastWet = 0, firstDry = null;
  for (let d = 0; d <= 24; d += 0.25) {
    if (wet(d, 0).water) lastWet = d; else if (firstDry === null && d > 0) firstDry = d;
  }
  check('and the water reaches out to the bank and stops where the bank rises through it',
    lastWet > 24 * wallStart(LAKE_DEPTH, 24) && lastWet < 24 && !wet(24, 0).water,
    `wet out to ${lastWet.toFixed(2)} m of 24, dry from ${firstDry === null ? 'nowhere' : firstDry.toFixed(2)} m, the rim at 24 m is ${g(24, 0).toFixed(2)} m`);
  check('the rim meets the world outside it with no step in it',
    Math.abs(g(24, 0) - 6) < 1e-9, `${(g(24, 0) - 6).toExponential(1)} m at the rim`);
  check('and maxGrade knows how steep the bank is, because the depth is in the stroke',
    maxGrade(l) > 0 && Number.isFinite(maxGrade(l)), `${maxGrade(l).toFixed(3)} m per m`);
}

// 12g-ii. the bed is an ABSOLUTE height, not a relative cut, on a hillside
{
  const e = wired(base);
  e.stroke({ kind: 'lake', x: 0, z: 0, r: 24, level: base(0, 0), depth: 8 });
  const g = ground(e, base);
  const want = base(0, 0) - 8;
  let flatFloor = 0, rawSpread = 0;
  for (let a = 0; a < 32; a++) {
    const th = a / 32 * Math.PI * 2;
    for (let d = 0; d <= 24 * 0.6; d += 1) {
      const x = Math.cos(th) * d, z = Math.sin(th) * d;
      flatFloor = Math.max(flatFloor, Math.abs(g(x, z) - want));
      rawSpread = Math.max(rawSpread, Math.abs(base(x, z) - base(0, 0)));
    }
  }
  check('a lake bed is level across a hillside that was not',
    flatFloor < 0.01, `worst ${(flatFloor * 100).toFixed(2)} cm off the bed, on ground that ran ${rawSpread.toFixed(2)} m up and down under it`);
  const rel = wired(base);
  rel.stroke({ kind: 'pit', x: 0, z: 0, r: 24, amount: 8 });
  const gp = ground(rel, base);
  let pitSpread = 0;
  for (let a = 0; a < 32; a++) {
    const th = a / 32 * Math.PI * 2;
    for (let d = 0; d <= 24 * 0.6; d += 1) pitSpread = Math.max(pitSpread, Math.abs(gp(Math.cos(th) * d, Math.sin(th) * d) - gp(0, 0)));
  }
  check('driven the other way: a pit on the same ground leaves a floor that is not level, which is why lake is its own kind',
    pitSpread > 1, `the pit's floor ran ${pitSpread.toFixed(2)} m where the lake's ran ${flatFloor.toFixed(2)} m`);
}

// 12g-iii. it only ever DIGS: a lake laid over a gorge leaves the gorge
{
  const e = wired(() => 6);
  e.stroke({ kind: 'pit', x: 0, z: 0, r: 40, amount: 30 });
  const before = ground(e, () => 6)(0, 0);
  e.stroke({ kind: 'lake', x: 0, z: 0, r: 40, level: 6, depth: 4 });
  const after = ground(e, () => 6)(0, 0);
  check('a lake over ground already deeper than its own bed adds nothing back',
    Math.abs(after - before) < 1e-9, `the gorge floor was ${before.toFixed(3)} m and is ${after.toFixed(3)} m`);
  check('and it is still water, because water is decided against the surface and not the bed',
    e.waterAt(0, 0, after).water === true && e.waterAt(0, 0, after).level === 6, JSON.stringify(e.waterAt(0, 0, after)));
}

// 12g-iv. a pond is the same brush with a smaller default
{
  const e = wired(() => 6);
  const p = e.stroke({ kind: 'pond', x: 0, z: 0, r: POND_R });
  check('a pond takes its own shallower bed and the ground it was clicked on as its surface',
    p.r === POND_R && p.depth === POND_DEPTH && p.level === 6,
    `r ${p.r} m, depth ${p.depth} m, level ${p.level} m`);
  const g = ground(e, () => 6);
  check('and it is wet in the middle and dry at its rim',
    e.waterAt(0, 0, g(0, 0)).water && !e.waterAt(POND_R, 0, g(POND_R, 0)).water,
    `centre ${g(0, 0).toFixed(2)} m, rim ${g(POND_R, 0).toFixed(2)} m`);
}

// 12g-v. a river: a level that falls from head to mouth, and a bed under it
{
  const e = wired(() => 6);
  const r = e.stroke({ kind: 'river', x: 0, z: 0, x2: 0, z2: 200, width: 12, level: 6, levelEnd: 2 });
  const g = ground(e, () => 6);
  const wet = (x, z) => e.waterAt(x, z, g(x, z));
  check('a river carries two levels and a width', r.level === 6 && r.levelEnd === 2 && r.width === 12,
    `${r.level} m at the head, ${r.levelEnd} m at the mouth, ${r.width} m across`);
  const head = wet(0, 0), mouth = wet(0, 200), mid = wet(0, 100);
  check('its water is 6 m at the head, 4 m halfway and 2 m at the mouth',
    head.level === 6 && Math.abs(mid.level - 4) < 1e-9 && mouth.level === 2,
    `${head.level}, ${mid.level}, ${mouth.level}`);
  check('and its bed follows the surface down, 2 m under it the whole way',
    [0, 50, 100, 150, 200].every((z) => Math.abs(g(0, z) - (6 + (2 - 6) * z / 200 - 2)) < 1e-9),
    [0, 50, 100, 150, 200].map((z) => `${z} m: ${g(0, z).toFixed(2)}`).join(', '));
  check('it is wet on the line and dry past its own bank',
    wet(0, 100).water && !wet(20, 100).water,
    `on the line ${g(0, 100).toFixed(2)} m, 20 m off it ${g(20, 100).toFixed(2)} m`);
  check('and nothing at all past the far end of it',
    e.heightDelta(0, 240, 6) === 0 && !wet(0, 240).water, `${e.heightDelta(0, 240, 6)} m at 40 m past the mouth`);

  // 12g-vi. a chain: the next stroke takes the level the last one left
  const r2 = e.stroke({ kind: 'river', x: 2, z: 201, x2: 0, z2: 400, levelEnd: -4 });
  check('a river whose head lands in another river\'s mouth chains, taking its level',
    r2.level === 2 && r2.chained === r.id, `level ${r2.level} m, chained to stroke ${r2.chained}`);
  check('and its head is snapped onto the joint, so the two ribbons meet',
    r2.x === r.x2 && r2.z === r.z2, `${r2.x}, ${r2.z} against the mouth at ${r.x2}, ${r.z2}`);
  const far = wired(() => 6);
  far.stroke({ kind: 'river', x: 0, z: 0, x2: 0, z2: 200, level: 6, levelEnd: 2 });
  const lone = far.stroke({ kind: 'river', x: 0, z: 260, x2: 0, z2: 400 });
  check('driven the other way: a river that starts well past the mouth does not chain',
    lone.chained === undefined && lone.level === 6 && lone.z === 260,
    `level ${lone.level} m, taken off the ground, and no chain`);
}

// 12g-vii. a sea: a surface and NO bed, over whatever coast was sculpted
{
  const e = wired(() => 6);
  const s = e.stroke({ kind: 'sea', x: 0, z: 0, r: 400, level: 3 });
  const g = ground(e, () => 6);
  let moved = 0;
  for (let i = 0; i < 400; i++) {
    const th = i / 400 * Math.PI * 2, d = (i % 20) / 20 * 399;
    moved = Math.max(moved, Math.abs(g(Math.cos(th) * d, Math.sin(th) * d) - 6));
  }
  check('a sea moves no ground at all', moved === 0 && maxGrade(s) === 0, `worst ${moved} m over 400 points`);
  check('and on ground that stands above it there is no water, which the words have to say',
    !e.waterAt(0, 0, 6).water, `ground 6 m, surface ${s.level} m`);
  // the coast, sculpted first, then flooded: the order somebody really works in
  const c = wired(() => 6);
  c.stroke({ kind: 'pit', x: 0, z: 0, r: 400, amount: 12 });
  c.stroke({ kind: 'sea', x: 0, z: 0, r: 400, level: 3 });
  const gc = ground(c, () => 6);
  let wetN = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const th = i / 400 * Math.PI * 2, d = (i % 20) / 20 * 399;
    const x = Math.cos(th) * d, z = Math.sin(th) * d;
    n++;
    if (c.waterAt(x, z, gc(x, z)).water) wetN++;
  }
  check('and over a coast somebody sank first, it floods the 400 m disc',
    wetN > n * 0.6 && c.waterAt(0, 0, gc(0, 0)).level === 3,
    `${wetN} of ${n} points inside 400 m are wet, at a surface of 3 m`);
}

// 12g-viii. a drain: water gone, ground untouched, and order decides
{
  const e = wired(() => 6);
  e.stroke({ kind: 'lake', x: 0, z: 0, r: 40, level: 6, depth: 4 });
  const g = () => ground(e, () => 6);
  check('there is water before the drain', e.waterAt(0, 0, g()(0, 0)).water === true);
  const before = g()(0, 0);
  const d = e.stroke({ kind: 'drain', x: 0, z: 0, r: 20 });
  check('a drain takes the water away and moves no ground',
    e.waterAt(0, 0, g()(0, 0)).water === false && g()(0, 0) === before && maxGrade(d) === 0,
    `ground still ${g()(0, 0).toFixed(3)} m`);
  check('and only inside its own radius: the lake outside it is still wet',
    e.waterAt(30, 0, g()(30, 0)).water === true, `30 m out, ground ${g()(30, 0).toFixed(2)} m`);
  e.stroke({ kind: 'pond', x: 0, z: 0, r: 10, level: 6, depth: 1 });
  check('a body drawn over a drain is water again, because the walk is in stroke order',
    e.waterAt(0, 0, g()(0, 0)).water === true, JSON.stringify(e.waterAt(0, 0, g()(0, 0))));
  check('and the bodies the renderer is handed carry the drains that came after them, and not the ones before',
    (() => {
      const b = e.waterBodies();
      return b.length === 2 && b[0].kind === 'lake' && b[0].drains.length === 1 && b[1].kind === 'pond' && b[1].drains.length === 0;
    })(), e.waterBodies().map((b) => `${b.kind} with ${b.drains.length}`).join(', '));
}

// 12g-ix. no other brush makes water, and `wet` is a property and not a walk
{
  const e = wired(() => 6);
  check('a list with nothing in it is not wet', e.wet === false);
  for (const kind of ['lower', 'pit', 'valley']) {
    const d = wired(() => 6);
    d.stroke({ kind, x: 0, z: 0, r: 40, amount: 20, length: 200, yaw: 0 });
    const gd = ground(d, () => 6);
    let deepest = 99, anyWet = 0;
    for (let z = -60; z <= 260; z += 4) for (let x = -60; x <= 60; x += 4) {
      const h = gd(x, z);
      deepest = Math.min(deepest, h);
      if (d.waterAt(x, z, h).water) anyWet++;
    }
    check(`a ${kind} 20 m deep is dry at every sample, however far under 0 m it goes`,
      anyWet === 0 && deepest < -10, `deepest ${deepest.toFixed(2)} m, ${anyWet} wet samples, and wet is ${d.wet}`);
  }
  e.stroke({ kind: 'lake', x: 0, z: 0, r: 10, level: 6 });
  check('and one lake makes the whole list wet, which is the one boolean the field reads',
    e.wet === true, `wet ${e.wet}`);
  e.undo();
  check('an undo takes it back off', e.wet === false, `wet ${e.wet}`);
  e.redo();
  check('and a redo puts it back on', e.wet === true, `wet ${e.wet}`);
}

// 12g-x. a lake written before ED4 still loads, as the water it used to be
{
  const e = createTerrainEdits({ baseHeight: flat });
  const n = e.load({ v: 1, mode: 'sculpt', strokes: [{ kind: 'lake', x: 0, z: 0, r: 24, floor: LAKE_FLOOR, id: 1 }] });
  const s = e.strokes[0];
  check('an old lake\'s absolute floor is read as a surface at the old sea level with the same bed',
    n === 1 && s.level === 0 && s.depth === -LAKE_FLOOR && s.floor === undefined,
    `floor ${LAKE_FLOOR} m became level ${s.level} m, depth ${s.depth} m`);
  const g = ground(e, flat);
  check('and it puts the bed back exactly where the old one was',
    Math.abs(g(0, 0) - LAKE_FLOOR) < 1e-9, `${g(0, 0).toFixed(4)} m against ${LAKE_FLOOR} m`);
}

// ---------------------------------------------------------------------------
// 13. ED3: the brush list the editor builds its palette out of
// ---------------------------------------------------------------------------
{
  const list = kinds();
  check('kinds() names every kind the module has, and nothing else',
    list.length === STROKE_KINDS.length && list.every((k, i) => k.kind === STROKE_KINDS[i]),
    `${list.length} brushes: ${list.map((k) => k.kind).join(' ')}`);
  const bad = [];
  for (const row of list) {
    if (!row.label) bad.push(`${row.kind} has no label`);
    if (!Array.isArray(row.params) || !row.params.length) bad.push(`${row.kind} has no params`);
    for (const p of row.params || []) {
      if (!p.name) bad.push(`${row.kind} has a param with no name`);
      if (!Number.isFinite(p.min) || !Number.isFinite(p.max) || !Number.isFinite(p.step)) bad.push(`${row.kind}.${p.name} has no min, max or step`);
      if (!Number.isFinite(p.default)) bad.push(`${row.kind}.${p.name} has no default`);
      else if (p.default < p.min || p.default > p.max) bad.push(`${row.kind}.${p.name} defaults to ${p.default}, outside ${p.min} to ${p.max}`);
      if (p.min >= p.max) bad.push(`${row.kind}.${p.name} has min ${p.min} at or over max ${p.max}`);
    }
  }
  check('every brush has a label, sliders with a min, a max, a step and a default, and every default is inside its own range',
    bad.length === 0, bad.length ? bad.join('; ') : `${list.reduce((n, r) => n + r.params.length, 0)} sliders over ${list.length} brushes`);
  check('only the paint brush carries a word list, and it is every word the module takes',
    list.filter((k) => k.words).length === 1 && list.find((k) => k.kind === 'ground').words.join(' ') === GROUND_WORDS.join(' '),
    list.find((k) => k.kind === 'ground').words.join(' '));
  // EVERY SLIDER MUST DO SOMETHING. A param name that is not a property the
  // module reads is a slider that moves and changes nothing, which is exactly
  // the class of bug this table exists to prevent, and it cannot be caught by
  // reading the table: it has to be driven.
  //
  // Four of the twenty one brushes cannot be judged on the height they move and
  // all four are named here rather than skipped quietly:
  //
  //   ground   moves no height at all. It is judged on the MIX it leaves, which
  //            is what the material blends by, so `hardness` and `opacity` are
  //            driven on the weights and not only on the word: a rim that goes
  //            from 0.7 of a word to 0.6 of it is a slider doing its job, and
  //            the word at the centre never moved.
  //   cave     `amount` is the size of the cavern under the mouth and not the
  //            shape of the mouth, so it changes the stroke and not the ground.
  //            What it changes it into is measured in world_runtime.test.mjs,
  //            where small, medium and large come out at 1, 2 and 3 levels.
  //   drain    takes water away and moves nothing, so it is driven with water
  //            under it: a sea 700 m across, and the drain cut into it.
  //   erase    takes ground away and lays none, so it is driven with ground
  //            under it: a 60 m mountain, and the eraser cut into that.
  const dead = [];
  // `x2` and `z2` for the same reason `length` is here: a river given neither
  // is a river with both ends in one place, and every knob that only shows up
  // ALONG a line would read as decoration on a line with no length.
  const probe = (row, p, val) => {
    const e = createTerrainEdits({ baseHeight: base });
    return e.stroke({ kind: row.kind, x: 0, z: 0, r: 30, amount: 4, length: 100, word: 'dirt', x2: 0, z2: 120, [p.name]: val });
  };
  /** The strip's own points, so the drain branch walks the same ground the rest does. */
  const stripPoints = (wide, span) => {
    const out = [];
    for (let i = 0; i < 31 * 31; i++) {
      out.push([((i % 31) / 30 * 2 - 1) * Math.min(wide, 90), (Math.floor(i / 31) / 30 * 2 - 1) * span]);
    }
    return out;
  };
  for (const row of list) {
    for (const p of row.params) {
      const mid = (p.min + p.max) / 2;
      const other = p.default === mid ? p.max : mid;
      const A = probe(row, p, p.default), B = probe(row, p, other);
      if (row.kind === 'ground') {
        // The paint brush: it is judged on the weights it leaves, walked over
        // the whole of the wider of the two discs, so a knob that only shows up
        // on the rim is still a knob that showed up.
        const laid = (s) => { const e = createTerrainEdits({ baseHeight: base }); e.stroke({ ...s, id: null }); return e; };
        const one = laid(A), two = laid(B);
        const at = (e, x, z) => { const m = e.groundMixAt(x, z); return m ? (m.dirt || 0) : 0; };
        if (one.groundOverride(0, 0) !== 'dirt') { dead.push(`${row.kind}.${p.name}`); continue; }
        let moved = false;
        const span = Math.max(A.r, B.r) + 6;
        for (let i = 0; i < 31 * 31 && !moved; i++) {
          const x = ((i % 31) / 30 * 2 - 1) * span, z = (Math.floor(i / 31) / 30 * 2 - 1) * span;
          if (Math.abs(at(one, x, z) - at(two, x, z)) > 1e-9) moved = true;
        }
        if (!moved) dead.push(`${row.kind}.${p.name}`);
        continue;
      }
      if (row.kind === 'erase') {
        // The eraser: nothing to erase, nothing to measure. A mountain goes
        // under it, and the knob is judged on how much of that mountain is
        // left, which is the whole of what an eraser does.
        const over = (s) => {
          const e = createTerrainEdits({ baseHeight: base });
          e.stroke({ kind: 'mountain', x: 0, z: 0, r: 200, amount: 60, roughness: 0, seed: 7 });
          e.stroke({ ...s, id: null });
          return e;
        };
        const one = over(A), two = over(B);
        let rubbed = false;
        for (const [x, z] of stripPoints(Math.max(reachOf(A), reachOf(B), 60), Math.max(reachOf(A), reachOf(B)) + 20)) {
          const h = base(x, z);
          if (Math.abs(one.heightDelta(x, z, h) - two.heightDelta(x, z, h)) > 1e-9) { rubbed = true; break; }
        }
        if (!rubbed) dead.push(`${row.kind}.${p.name}`);
        continue;
      }
      if (row.kind === 'cave' && p.name === 'amount') {
        if (A.amount === B.amount) dead.push(`${row.kind}.${p.name}`);
        continue;
      }
      if (row.kind === 'drain') {
        const sunk = (s) => {
          const e = createTerrainEdits({ baseHeight: base });
          e.stroke({ kind: 'sea', x: 0, z: 0, r: 700, level: 200 });
          e.stroke({ ...s, id: null });
          return e;
        };
        const one = sunk(A), two = sunk(B);
        let drained = false;
        for (const [x, z] of stripPoints(Math.max(reachOf(A), reachOf(B), 60), Math.max(reachOf(A), reachOf(B)) + 20)) {
          const h = base(x, z);
          if (one.waterAt(x, z, h).water !== two.waterAt(x, z, h).water) { drained = true; break; }
        }
        if (!drained) dead.push(`${row.kind}.${p.name}`);
        continue;
      }
      // The probe is a STRIP ALONG THE STROKE'S OWN BEARING, 31 by 31 with the
      // centre line exactly on it, reaching past the furthest either setting
      // can. A square grid over the bounding box misses a capsule: a ridge with
      // no yaw is a 60 m wide strip up the z axis, and a 30 column grid over
      // 4 km never puts a sample inside it, so `length` read as a dead slider
      // when it was not.
      //
      // ED4: a water brush is judged on the HEIGHT OR THE WATER, either one. A
      // sea and a drain move no ground on purpose, so a height only probe would
      // have called every knob on both of them decoration; a lake's `level`
      // moves both, and this catches it in whichever it moved.
      const span = Math.max(reachOf(A), reachOf(B)) + 20;
      const wide = Math.max(reachOf(A), reachOf(B), 60);
      const one = createTerrainEdits({ baseHeight: base }); one.stroke({ ...A, id: null });
      const two = createTerrainEdits({ baseHeight: base }); two.stroke({ ...B, id: null });
      const water = isWaterKind(row.kind);
      let moved = false;
      for (let i = 0; i < 31 * 31 && !moved; i++) {
        const x = ((i % 31) / 30 * 2 - 1) * Math.min(wide, 90), z = (Math.floor(i / 31) / 30 * 2 - 1) * span;
        const h = base(x, z);
        if (Math.abs(one.heightDelta(x, z, h) - two.heightDelta(x, z, h)) > 1e-9) moved = true;
        if (!moved && water) {
          const a = one.waterAt(x, z, h + one.heightDelta(x, z, h));
          const b = two.waterAt(x, z, h + two.heightDelta(x, z, h));
          if (a.water !== b.water || a.level !== b.level) moved = true;
        }
      }
      if (!moved) dead.push(`${row.kind}.${p.name}`);
    }
  }
  check('and moving any one of them moves the ground, so no slider on the palette is decoration',
    dead.length === 0, dead.length ? `dead: ${dead.join(', ')}` : 'every one of the 40 sliders changes what the stroke does');
  // NEEDS_YAW is read off the table, so a kind with a yaw slider is a kind the
  // contract fills a bearing in for. Driven against `deltaOf` itself: a stroke
  // whose ground moves when only its yaw moves is a stroke that needs one.
  {
    const turns = STROKE_KINDS.filter((k) => {
      const a = createTerrainEdits({ baseHeight: base }), b = createTerrainEdits({ baseHeight: base });
      const at = { kind: k, x: 0, z: 0, r: 30, amount: 4, length: 120, word: 'dirt' };
      a.stroke({ ...at, yaw: 0 }); b.stroke({ ...at, yaw: Math.PI / 2 });
      for (let i = 0; i < 31 * 31; i++) {
        const x = ((i % 31) / 30 * 2 - 1) * 160, z = (Math.floor(i / 31) / 30 * 2 - 1) * 160;
        const h = base(x, z);
        if (Math.abs(a.heightDelta(x, z, h) - b.heightDelta(x, z, h)) > 1e-9) return true;
      }
      return false;
    });
    check('NEEDS_YAW is exactly the kinds whose ground moves when only the bearing moves',
      turns.sort().join(' ') === [...NEEDS_YAW].sort().join(' '),
      `the table says ${[...NEEDS_YAW].sort().join(' ')}, the ground says ${turns.sort().join(' ')}`);
  }
  check('a fresh copy every call, because the caller is a UI and a UI writes to what it is handed',
    kinds() !== list && kinds()[0].params !== list[0].params && KIND_PARAMS.raise.params[0].default === 12);
}

// ---------------------------------------------------------------------------
// 14. ED3: the header, and a world made of one word
// ---------------------------------------------------------------------------
{
  const e = createTerrainEdits({ baseHeight: flat });
  check('a list with no header told otherwise is the world the seed makes',
    e.mode === 'generate' && e.sculpt === null, `mode ${e.mode}`);
  const said = e.setBase({ mode: 'sculpt', height: 12, snowLine: 90 });
  check('setBase says what it changed, in words, and only what changed',
    said.changed.length === 3 && said.changed.some((w) => w.includes('12')) && said.changed.some((w) => w.includes('90')),
    said.changed.join('; '));
  check('and the header is then what it says it is',
    e.mode === 'sculpt' && e.sculpt.height === 12 && e.sculpt.snowLine === 90 && e.sculpt.ground === 'grass',
    JSON.stringify(e.base()));
  const again = e.setBase({ height: 12 });
  check('asking for what is already set changes nothing and says so',
    again.changed.length === 0, `changed: ${JSON.stringify(again.changed)}`);
  let threw = null;
  try { e.setBase({ ground: 'cobble' }); } catch (err) { threw = err.message; }
  check('a world cannot be made of a word that carries no biome, and the refusal names the words that work',
    !!threw && BASE_GROUNDS.every((w) => threw.includes(w)), threw || 'it was accepted');
  check('though the paint brush takes that word happily, which is the point of the two lists',
    GROUND_WORDS.includes('cobble') && !BASE_GROUNDS.includes('cobble'),
    `${GROUND_WORDS.length} words to paint with, ${BASE_GROUNDS.length} to build a world out of`);
  threw = null;
  try { e.setBase({ mode: 'wobble' }); } catch (err) { threw = err.message; }
  check('and a mode nobody knows is refused by name', !!threw && MODES.every((m) => threw.includes(m)), threw || 'it was accepted');
  check('base() hands out a copy, so a caller cannot edit the world by editing the answer',
    (() => { const b = e.base(); b.height = 999; return e.sculpt.height === 12; })(), `still ${e.sculpt.height} m`);
  // the header survives the file
  e.stroke({ kind: 'raise', x: 4, z: 4, r: 10, amount: 2 });
  const file = JSON.parse(JSON.stringify(e.serialize()));
  const back = createTerrainEdits({ baseHeight: flat });
  const n = back.load(file);
  check('the header goes out on the file and comes back off it',
    n === 1 && back.mode === 'sculpt' && back.sculpt.height === 12 && back.sculpt.snowLine === 90,
    `${n} stroke, ${JSON.stringify(back.base())}`);
  check('and a file with no header at all loads as the world the seed makes',
    (() => { const g = createTerrainEdits({ baseHeight: flat }); g.setBase({ mode: 'sculpt' }); g.load({ v: 1, strokes: [] }); return g.mode === 'generate' && g.sculpt === null; })(),
    'loading a headerless file puts the mode back to generate');
  check('a file with a header the module cannot use falls back rather than loading nonsense',
    (() => { const g = createTerrainEdits({ baseHeight: flat });
      g.load({ v: 1, mode: 'sculpt', base: { height: 'high', ground: 'lava', snowLine: null }, strokes: [] });
      return g.sculpt.height === DEFAULT_BASE.height && g.sculpt.ground === DEFAULT_BASE.ground && g.sculpt.snowLine === DEFAULT_BASE.snowLine; })(),
    `back to ${JSON.stringify(DEFAULT_BASE)}`);
  check('baseVersion moves when the header moves and stands still when it does not',
    (() => { const g = createTerrainEdits({ baseHeight: flat });
      const v0 = g.baseVersion; g.setBase({ height: 40 }); const v1 = g.baseVersion;
      g.setBase({ height: 40 }); const v2 = g.baseVersion;
      g.stroke({ kind: 'raise', x: 0, z: 0, r: 5, amount: 1 }); const v3 = g.baseVersion;
      return v1 > v0 && v2 === v1 && v3 === v1; })(),
    'a stroke does not move it; only the header does');
  // and nothing private leaked into the file
  const keys = new Set();
  for (const row of file.strokes) for (const k of Object.keys(row)) keys.add(k);
  check('and the file holds stroke properties only, no private bookkeeping',
    ![...keys].some((k) => k.startsWith('__')), [...keys].join(' '));
}

// ---------------------------------------------------------------------------
// 15. ED3: reset, which is one step and not a thousand
// ---------------------------------------------------------------------------
{
  const e = wired(base);
  for (let i = 0; i < 40; i++) e.stroke({ kind: i % 7 === 0 ? 'cave' : 'raise', x: i * 12, z: i * 5, r: 9, amount: 2, yaw: 0 });
  const before = [];
  for (let i = 0; i < 60; i++) { const x = i * 8 - 40, z = i * 3; before.push(e.heightDelta(x, z, base(x, z))); }
  const did = e.reset();
  check('reset says how many it dropped, counted off the list it emptied',
    did.dropped === 40 && did.caves === 6 && e.count === 0, `${did.dropped} strokes, ${did.caves} of them caves`);
  let any = false;
  for (let i = 0; i < 60; i++) { const x = i * 8 - 40, z = i * 3; if (e.heightDelta(x, z, base(x, z)) !== 0) any = true; }
  check('and the ground is the ground again', !any);
  const u = e.undo();
  check('ONE undo puts all forty back, and says how many',
    u && u.kind === 'reset' && u.restored === 40 && e.count === 40, u ? `${u.restored} restored, ${e.count} on the ground` : 'undo gave nothing');
  let worst = 0;
  for (let i = 0; i < 60; i++) { const x = i * 8 - 40, z = i * 3; worst = Math.max(worst, Math.abs(e.heightDelta(x, z, base(x, z)) - before[i])); }
  check('and the ground is bit for bit what it was before the reset', worst === 0, `worst difference ${worst} m over 60 points`);
  const r = e.redo();
  check('and redo drops them again, as one step', r && r.kind === 'reset' && r.dropped === 40 && e.count === 0,
    r ? `${r.dropped} dropped, ${e.count} left` : 'redo gave nothing');
  e.undo();
  check('an ordinary undo after that is still an ordinary undo of one stroke',
    (() => { const s = e.undo(); return s && s.kind === 'raise' && e.count === 39; })(), `${e.count} on the ground`);
  check('reset on an empty list drops nothing and says nothing happened',
    (() => { const g = createTerrainEdits({ baseHeight: flat }); return g.reset().dropped === 0; })());
}

// ---------------------------------------------------------------------------
// 16. ED3: the index cell, which used to be a hash, and the bug that was in it
// ---------------------------------------------------------------------------
//
// `cellKey` was `ix * 73856093 ^ iz * 19349663`, and the comment beside it said
// a collision was safe because a lookup can only ever see MORE strokes than it
// should. That is true of the LOOKUP and false of the INSERT: `put` walks every
// cell a stroke covers, so two of one stroke's own cells landing on the same
// key put that stroke in the same list twice, and a stroke applied twice raises
// twice. Under 128 m of reach it never came up. A 600 m mountain covers 1,444
// cells of the 32 m grid and it came up at once.
{
  const e = createTerrainEdits({ baseHeight: flat });
  e.stroke({ kind: 'mountain', x: 0, z: 0, r: 600, amount: 300, roughness: 0.6 });
  const oldKey = (ix, iz) => ix * 73856093 ^ iz * 19349663;
  const seen = new Map();
  let clashes = 0;
  const reach = 600, i0 = Math.floor(-reach / GRID), i1 = Math.floor(reach / GRID);
  for (let j = i0; j <= i1; j++) for (let i = i0; i <= i1; i++) {
    const k = oldKey(i, j);
    if (seen.has(k)) clashes++; else seen.set(k, [i, j]);
  }
  check('the old hash put one 600 m mountain into its own cells more than once',
    clashes > 0, `${clashes} of the ${(i1 - i0 + 1) ** 2} cells it covers collided with another of its own`);
  // and the index the module has now gives the answer a walk of every stroke gives
  const SOME = ['raise', 'lower', 'flatten', 'pit', 'cliff', 'plateau', 'terrace', 'noise', 'ridge', 'valley'];
  const big = wired(base);
  for (let i = 0; i < 50; i++) {
    const a = i / 50 * Math.PI * 2;
    big.stroke({ kind: 'mountain', x: Math.cos(a) * 700, z: Math.sin(a) * 700, r: 600, amount: 300, roughness: 0.6 });
  }
  for (let i = 0; i < 300; i++) {
    big.stroke({ kind: SOME[i % SOME.length], x: (i * 733.7) % 2000 - 1000, z: (i * 311.3) % 2000 - 1000, r: 4 + i % 20, amount: 1 + i % 5, length: 60, yaw: i * 0.1 });
  }
  const walk = (x, z, h) => { let cur = h; for (const s of big.strokes) cur += deltaOf(s, x, z, cur); return cur - h; };
  let worst = 0, at = null;
  for (let i = 0; i < 1200; i++) {
    const x = (i * 97.3) % 2000 - 1000, z = (i * 61.7) % 2000 - 1000;
    const d = Math.abs(big.heightDelta(x, z, base(x, z)) - walk(x, z, base(x, z)));
    if (d > worst) { worst = d; at = [x, z]; }
  }
  check('and the indexed answer is now the answer a walk of all 350 strokes gives, mountains and all',
    worst === 0, `worst difference ${worst} m over 1,200 points${at && worst ? ' at ' + at : ''}`);
}

// ---------------------------------------------------------------------------
// 17. ED3: what a world of mountains costs
// ---------------------------------------------------------------------------
{
  const e = createTerrainEdits({ baseHeight: flat });
  const SMALL = ['raise', 'lower', 'flatten', 'smooth', 'pit', 'cliff', 'ground', 'plateau', 'terrace', 'noise', 'erode', 'ridge', 'valley', 'lake'];
  let n = 0;
  for (let i = 0; i < 50; i++) {
    const a = i / 50 * Math.PI * 2;
    e.stroke({ kind: 'mountain', x: Math.cos(a) * 700 + (i * 37) % 400, z: Math.sin(a) * 700 + (i * 53) % 400, r: 600, amount: 300, roughness: 0.6 });
    n++;
  }
  for (; n < 2000; n++) {
    const k = SMALL[n % SMALL.length];
    e.stroke({ kind: k, x: (n * 733.7) % 2000 - 1000, z: (n * 311.3) % 2000 - 1000, r: 4 + n % 20,
      amount: k === 'smooth' || k === 'erode' ? 0.5 : 1 + n % 5, word: 'dirt', length: 60, yaw: n * 0.1 });
  }
  const pts = [];
  for (let i = 0; i < 10000; i++) pts.push([(i * 97.3) % 2000 - 1000, (i * 61.7) % 2000 - 1000]);
  for (const [x, z] of pts) e.heightDelta(x, z, 6);
  let best = Infinity;
  for (let r = 0; r < 5; r++) {
    const t = performance.now();
    let acc = 0;
    for (const [x, z] of pts) acc += e.heightDelta(x, z, 6);
    best = Math.min(best, performance.now() - t);
  }
  const us = best * 1000 / pts.length;
  // how many strokes a sample really walks, so the number above has a shape
  let cover = 0;
  for (const [x, z] of pts.slice(0, 500)) {
    for (const s of e.strokes) { const rr = reachOf(s); if ((x - s.x) ** 2 + (z - s.z) ** 2 < rr * rr) cover++; }
  }
  check('2,000 strokes, 50 of them 600 m mountains, cost under 3 us a sample',
    us < 3, `${us.toFixed(3)} us a sample, ${(cover / 500).toFixed(1)} strokes covering an average point`);
  const t0 = performance.now();
  e.undo(); e.heightDelta(0, 0, 6);
  check('and the index of a world that big is rebuilt in under 30 ms',
    performance.now() - t0 < 30, `${(performance.now() - t0).toFixed(2)} ms`);
}

// ---------------------------------------------------------------------------
// 18. ED4: what a world of water costs
// ---------------------------------------------------------------------------
//
// `waterAt` is asked on every vertex of every chunk, right beside `heightDelta`,
// so it has to be as cheap as one. It walks the SAME cell list, so the shape of
// the number is the same shape: what it costs is what the strokes covering a
// point cost, and nothing else.
{
  const e = createTerrainEdits({ baseHeight: flat });
  const KINDS = ['lake', 'pond', 'river', 'sea', 'drain'];
  for (let i = 0; i < 200; i++) {
    const k = KINDS[i % KINDS.length];
    const x = (i * 233.7) % 2000 - 1000, z = (i * 149.3) % 2000 - 1000;
    e.stroke({
      kind: k, x, z, r: k === 'sea' ? 200 : 20 + (i % 30),
      width: 10 + (i % 10), x2: x + 120, z2: z + 60,
      level: -2 + (i % 9), levelEnd: -6 + (i % 5), depth: 2 + (i % 4),
    });
  }
  check('two hundred bodies of water, and the list knows it is wet without walking',
    e.wet === true && e.count === 200 && e.waterBodies().length === 160,
    `${e.count} strokes, ${e.waterBodies().length} of them surfaces to draw`);
  const pts = [];
  for (let i = 0; i < 10000; i++) pts.push([(i * 97.3) % 2000 - 1000, (i * 61.7) % 2000 - 1000]);
  for (const [x, z] of pts) e.waterAt(x, z, 0);
  let best = Infinity;
  for (let r = 0; r < 5; r++) {
    const t = performance.now();
    let acc = 0;
    for (const [x, z] of pts) acc += e.waterAt(x, z, 0).water ? 1 : 0;
    best = Math.min(best, performance.now() - t);
  }
  const us = best * 1000 / pts.length;
  let cover = 0, wetPts = 0;
  for (const [x, z] of pts.slice(0, 500)) {
    if (e.waterAt(x, z, 0).water) wetPts++;
    for (const s of e.strokes) { const rr = reachOf(s); if ((x - s.x) ** 2 + (z - s.z) ** 2 < rr * rr) cover++; }
  }
  check('200 water bodies cost under 4 us a sample',
    us < 4, `${us.toFixed(3)} us a sample, ${(cover / 500).toFixed(1)} bodies covering an average point, ${wetPts} of 500 points wet`);
  // and the cost of a world with NO water in it is one property read
  const drySoil = createTerrainEdits({ baseHeight: flat });
  for (let i = 0; i < 200; i++) drySoil.stroke({ kind: 'raise', x: (i * 233.7) % 2000 - 1000, z: (i * 149.3) % 2000 - 1000, r: 24, amount: 3 });
  check('driven the other way: a world with no water in it is not wet, and never asks',
    drySoil.wet === false && drySoil.waterBodies().length === 0 && drySoil.waterAt(0, 0, 0).water === false,
    `${drySoil.count} strokes, none of them water`);
}


// ---------------------------------------------------------------------------
// 18. ED5: the eraser
//
// Everything here is driven through the list's own surface, which is the
// surface field.js reads, and both ways: what an erase takes AND what it leaves
// standing, inside the ring and outside it, before it and after it.
// ---------------------------------------------------------------------------
console.log('\nED5: the eraser');
{
  // ---- height ------------------------------------------------------------
  {
    const e = createTerrainEdits({ baseHeight: flat });
    e.stroke({ kind: 'raise', x: 0, z: 0, r: 30, amount: 10 });
    const before = { c: e.heightDelta(0, 0, 0), out: e.heightDelta(26, 0, 0) };
    e.stroke({ kind: ERASE_KIND, x: 0, z: 0, r: 12, hardness: 1, opacity: 1 });
    check('an erase takes the height under it back to the flat',
      before.c === 10 && Math.abs(e.heightDelta(0, 0, 0)) < 1e-12,
      `${before.c} m before, ${e.heightDelta(0, 0, 0).toExponential(1)} m after`);
    check('and leaves the same stroke untouched outside its own ring',
      e.heightDelta(26, 0, 0) === before.out, `${e.heightDelta(26, 0, 0).toFixed(4)} m, still`);
    // and a stroke laid on top of it applies, exactly as one laid over a drain does
    e.stroke({ kind: 'raise', x: 0, z: 0, r: 8, amount: 3 });
    check('a stroke laid AFTER an erase applies in full: order is the picture',
      Math.abs(e.heightDelta(0, 0, 0) - 3) < 1e-9, `${e.heightDelta(0, 0, 0).toFixed(4)} m`);
    // ...and one laid before it does not come back
    check('and the one under it is still gone: an erase is not a toggle',
      Math.abs(e.heightDelta(9, 0, 0)) < 0.2, `${e.heightDelta(9, 0, 0).toFixed(4)} m at 9 m out`);
  }
  // an erase with nothing under it moves nothing, and says so by moving nothing
  {
    const e = createTerrainEdits({ baseHeight: base });
    e.stroke({ kind: ERASE_KIND, x: 50, z: 50, r: 20 });
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      const x = 50 + (i % 20) * 2 - 20, z = 50 + Math.floor(i / 20) * 2 - 20;
      worst = Math.max(worst, Math.abs(e.heightDelta(x, z, base(x, z))));
    }
    check('an erase over ground nobody has touched moves nothing at all', worst === 0, `${worst} m over 400 points`);
  }
  // ---- paint -------------------------------------------------------------
  {
    const e = createTerrainEdits({ baseHeight: flat });
    e.stroke({ kind: 'ground', x: 0, z: 0, r: 30, word: 'rock' });
    check('the paint is there to begin with', e.groundOverride(0, 0) === 'rock' && e.groundOverride(20, 0) === 'rock');
    e.stroke({ kind: ERASE_KIND, x: 0, z: 0, r: 12, hardness: 1, opacity: 1 });
    check('an erase takes the paint with the ground',
      e.groundOverride(0, 0) === null && e.groundMixAt(0, 0) === null, `${e.groundOverride(0, 0)}`);
    check('and not one metre outside its own ring',
      e.groundOverride(20, 0) === 'rock', `${e.groundOverride(20, 0)}`);
    e.stroke({ kind: 'ground', x: 0, z: 0, r: 6, word: 'sand' });
    check('and paint laid over an erase paints', e.groundOverride(0, 0) === 'sand', `${e.groundOverride(0, 0)}`);
  }
  // ---- water -------------------------------------------------------------
  {
    const e = createTerrainEdits({ baseHeight: flat });
    e.stroke({ kind: 'lake', x: 0, z: 0, r: 40, level: 4, depth: 3 });
    const wet = (x) => e.waterAt(x, 0, flat(x, 0) + e.heightDelta(x, 0, flat(x, 0))).water;
    check('the lake is wet to begin with', wet(0) && wet(30));
    e.stroke({ kind: ERASE_KIND, x: 0, z: 0, r: 15, hardness: 1, opacity: 1 });
    check('an erase takes the water inside its ring and leaves the rest of the lake',
      wet(0) === false && wet(30) === true, `${wet(0)} at the middle, ${wet(30)} at 30 m`);
    check('and the bed it cut is filled back in with it',
      Math.abs(e.heightDelta(0, 0, 0)) < 1e-12, `${e.heightDelta(0, 0, 0).toExponential(1)} m`);
    const body = e.waterBodies();
    check('the surface the renderer draws has the same hole cut in it',
      body.length === 1 && body[0].drains.length === 1
      && Math.abs(body[0].drains[0].r - eraseHalfR({ kind: ERASE_KIND, x: 0, z: 0, r: 15, hardness: 1, opacity: 1 })) < 1e-9,
      `${body.length} bodies, ${body[0].drains.length} holes of ${body[0].drains[0].r.toFixed(2)} m`);
    // a lake laid AFTER the erase is water again
    e.stroke({ kind: 'lake', x: 0, z: 0, r: 8, level: 4, depth: 2 });
    check('and a lake laid after it is wet again', wet(0) === true);
  }
  // an erase over the generator's own ocean puts the ocean back, not dry ground
  {
    const e = createTerrainEdits({ baseHeight: flat });
    e.stroke({ kind: 'drain', x: 0, z: 0, r: 40 });
    check('a drain takes the world\'s own water away', e.waterAt(0, 0, -3, true).water === false);
    e.stroke({ kind: ERASE_KIND, x: 0, z: 0, r: 20, hardness: 1, opacity: 1 });
    check('and an erase over that drain puts the world\'s own water back, because that is the blank canvas',
      e.waterAt(0, 0, -3, true).water === true && e.waterAt(0, 0, -3, false).water === false,
      'the ocean where there was one, dry ground where there was not');
  }
  // ---- the mouth of a cave goes with the hillside it was cut into ---------
  {
    const e = createTerrainEdits({ baseHeight: flat });
    e.stroke({ kind: 'cave', x: 0, z: 0, r: 8, amount: 2, yaw: 0 });
    e.stroke({ kind: 'cave', x: 200, z: 0, r: 8, amount: 2, yaw: 0 });
    check('two mouths to start with', e.caves().length === 2);
    e.stroke({ kind: ERASE_KIND, x: 0, z: 0, r: 20, hardness: 1, opacity: 1 });
    check('an erase over a cave mouth takes the mouth with the hillside',
      e.caves().length === 1 && e.caves()[0].x === 200, `${e.caves().length} left`);
  }
  // ---- the soft edge -----------------------------------------------------
  {
    const e = createTerrainEdits({ baseHeight: flat });
    e.stroke({ kind: 'raise', x: 0, z: 0, r: 40, amount: 10 });
    const full = (x) => 10 * dome(Math.abs(x) / 40);
    e.stroke({ kind: ERASE_KIND, x: 0, z: 0, r: 20, hardness: 0, opacity: 1 });
    const at = (x) => e.heightDelta(x, 0, 0);
    check('at hardness 0 an eraser takes everything at its centre',
      Math.abs(at(0)) < 1e-12, `${at(0).toExponential(1)} m`);
    check('and less and less of it the further out you go, and nothing at its rim',
      at(5) < at(10) && at(10) < at(15) && Math.abs(at(20) - full(20)) < 1e-9,
      `${at(5).toFixed(2)}, ${at(10).toFixed(2)}, ${at(15).toFixed(2)} m against ${full(20).toFixed(2)} at the rim`);
    // and the same eraser at hardness 1 takes the lot, out to two metres of rim
    const h = createTerrainEdits({ baseHeight: flat });
    h.stroke({ kind: 'raise', x: 0, z: 0, r: 40, amount: 10 });
    h.stroke({ kind: ERASE_KIND, x: 0, z: 0, r: 20, hardness: 1, opacity: 1 });
    const hard = (x) => h.heightDelta(x, 0, 0);
    check('at hardness 1 it takes the whole ring but the last two metres of rim',
      Math.abs(hard(0)) < 1e-12 && Math.abs(hard(17.9)) < 1e-12 && hard(19.5) > 0 && Math.abs(hard(20) - full(20)) < 1e-9,
      `nothing left at 17.9 m, ${hard(19.5).toFixed(3)} m at 19.5, ${full(20).toFixed(3)} at the rim`);
    check('and the rim it keeps is SOFT_RIM metres, off the constant and not off a guess',
      Math.abs(coreRadius({ kind: ERASE_KIND, r: 20, hardness: 1 }) - (20 - SOFT_RIM)) < 1e-9,
      `${coreRadius({ kind: ERASE_KIND, r: 20, hardness: 1 })} m of core in a 20 m ring`);
  }
  // opacity: half an eraser leaves half the ground
  {
    const e = createTerrainEdits({ baseHeight: flat });
    e.stroke({ kind: 'raise', x: 0, z: 0, r: 40, amount: 10 });
    e.stroke({ kind: ERASE_KIND, x: 0, z: 0, r: 20, hardness: 1, opacity: 0.5 });
    check('an eraser at half opacity leaves half the ground it found',
      Math.abs(e.heightDelta(0, 0, 0) - 5) < 1e-9, `${e.heightDelta(0, 0, 0).toFixed(4)} m of the 10`);
    e.stroke({ kind: ERASE_KIND, x: 0, z: 0, r: 20, hardness: 1, opacity: 0.5 });
    check('and a second pass leaves half of that', Math.abs(e.heightDelta(0, 0, 0) - 2.5) < 1e-9,
      `${e.heightDelta(0, 0, 0).toFixed(4)} m`);
  }
  // ---- how many strokes it reaches, counted ------------------------------
  {
    const e = createTerrainEdits({ baseHeight: flat });
    e.stroke({ kind: 'raise', x: 0, z: 0, r: 20, amount: 4 });
    e.stroke({ kind: 'ground', x: 10, z: 0, r: 8, word: 'dirt' });
    e.stroke({ kind: 'raise', x: 900, z: 900, r: 20, amount: 4 });
    // a ridge whose HEAD is far away but whose body runs past the point
    e.stroke({ kind: 'ridge', x: -300, z: 0, r: 20, amount: 10, length: 320, yaw: Math.PI / 2 });
    const s = e.stroke({ kind: ERASE_KIND, x: 0, z: 0, r: 10 });
    check('an erase counts the strokes it really reaches, and not the ones it does not',
      e.maskedBefore(s) === 3, `${e.maskedBefore(s)} of the 4 laid before it`);
    check('and the count is the stroke\'s own shape and not its bounding radius',
      overlapsDisc({ kind: 'ridge', x: -300, z: 0, r: 20, length: 320, yaw: Math.PI / 2 }, 0, 0, 10) === true
      && overlapsDisc({ kind: 'ridge', x: -300, z: 0, r: 20, length: 320, yaw: Math.PI / 2 }, 0, 300, 10) === false,
      'a range is a capsule, and the ground beside it is not in it');
    const after = e.stroke({ kind: 'raise', x: 0, z: 0, r: 5, amount: 1 });
    check('and a stroke laid after an erase is not one of the strokes it masks',
      e.maskedBefore(s) === 3 && after.kind === 'raise');
  }
}

// ---------------------------------------------------------------------------
// 19. ED5: feathering, and the promise that nothing already saved moved
// ---------------------------------------------------------------------------
console.log('\nED5: hardness, opacity, and the old files');
{
  // ---- what absence means -------------------------------------------------
  check('a stroke with no hardness in it reads as the behaviour its kind already had',
    hardnessOf({ kind: 'ground' }) === 1 && hardnessOf({ kind: 'raise' }) === SCULPT_HARDNESS
    && hardnessOf({ kind: ERASE_KIND }) === ERASE_HARDNESS && opacityOf({ kind: 'ground' }) === 1,
    `paint ${hardnessOf({ kind: 'ground' })}, sculpt ${hardnessOf({ kind: 'raise' })}, erase ${hardnessOf({ kind: ERASE_KIND })}`);
  check('and the knobs a kind does not take are dropped off the stroke rather than kept and ignored',
    (() => {
      const e = createTerrainEdits({ baseHeight: flat });
      const lake = e.stroke({ kind: 'lake', x: 0, z: 0, r: 20, level: 2, depth: 2, hardness: 0.5, opacity: 0.5 });
      const raise = e.stroke({ kind: 'raise', x: 0, z: 0, r: 20, amount: 2, hardness: 0.5, opacity: 0.5 });
      return lake.hardness === undefined && lake.opacity === undefined
        && raise.hardness === 0.5 && raise.opacity === undefined;
    })(), 'water takes neither, a sculpt brush takes hardness and not opacity');
  check('every kind that reads a knob offers a slider for it, and no kind offers one nothing reads',
    (() => { const a = auditFeather(); return a.hard === HARD_KINDS.length && a.opacity === OPACITY_KINDS.length; })(),
    `${HARD_KINDS.length} brushes with a soft edge, ${OPACITY_KINDS.length} with an opacity`);

  // ---- the sculpt profile at both ends ------------------------------------
  {
    const dome0 = createTerrainEdits({ baseHeight: flat });
    dome0.stroke({ kind: 'raise', x: 0, z: 0, r: 40, amount: 10, hardness: 0 });
    const plain = createTerrainEdits({ baseHeight: flat });
    plain.stroke({ kind: 'raise', x: 0, z: 0, r: 40, amount: 10 });
    let worst = 0;
    for (let d = 0; d <= 44; d += 0.25) worst = Math.max(worst, Math.abs(dome0.heightDelta(d, 0, 0) - plain.heightDelta(d, 0, 0)));
    check('a raise at hardness 0 is the dome it always was, to the bit', worst === 0,
      `worst difference ${worst} m over 177 points`);
    check('and hardT at hardness 0 is the identity, which is why', hardT({ kind: 'raise', r: 40 }, 0.37) === 0.37);

    const flatTop = createTerrainEdits({ baseHeight: flat });
    flatTop.stroke({ kind: 'raise', x: 0, z: 0, r: 40, amount: 10, hardness: 1 });
    const at = (d) => flatTop.heightDelta(d, 0, 0);
    check('and at hardness 1 it is a flat topped mound: full height across the whole ring',
      Math.abs(at(0) - 10) < 1e-9 && Math.abs(at(20) - 10) < 1e-9 && Math.abs(at(37.9) - 10) < 1e-9,
      `${at(0).toFixed(3)}, ${at(20).toFixed(3)}, ${at(37.9).toFixed(3)} m`);
    check('with SOFT_RIM metres of rim under it, so no chunk can crack on its edge',
      at(39) > 0 && at(39) < 10 && at(40) === 0 && at(41) === 0,
      `${at(39).toFixed(3)} m at 39, ${at(40)} at the rim`);
    // and the rim really is smooth: the biggest one centimetre step anywhere
    let step = 0;
    for (let d = 36; d <= 41; d += 0.01) step = Math.max(step, Math.abs(at(d) - at(d - 0.01)));
    check('and the steepest metre of that rim is the one maxGrade claims',
      step / 0.01 <= maxGrade({ kind: 'raise', r: 40, amount: 10, hardness: 1 }) + 1e-6,
      `measured ${(step / 0.01).toFixed(2)}, claimed ${maxGrade({ kind: 'raise', r: 40, amount: 10, hardness: 1 }).toFixed(2)} m per m`);
    check('and hardness is what made it steeper than the plain dome',
      maxGrade({ kind: 'raise', r: 40, amount: 10, hardness: 1 }) > maxGrade({ kind: 'raise', r: 40, amount: 10 }) * 5,
      `${maxGrade({ kind: 'raise', r: 40, amount: 10 }).toFixed(3)} soft against ${maxGrade({ kind: 'raise', r: 40, amount: 10, hardness: 1 }).toFixed(3)} hard`);
  }

  // ---- paint: the mix, and the numbers it was asked for --------------------
  {
    const e = createTerrainEdits({ baseHeight: flat });
    e.stroke({ kind: 'ground', x: 0, z: 0, r: 20, word: 'grass', hardness: 1, opacity: 1 });
    e.stroke({ kind: 'ground', x: 0, z: 0, r: 20, word: 'snow', hardness: 1, opacity: 0.3 });
    const mix = e.groundMixAt(0, 0);
    check('snow at 0.3 over grass is 0.3 snow and 0.7 grass',
      Math.abs(mix.snow - 0.3) < 1e-9 && Math.abs(mix.grass - 0.7) < 1e-9,
      `snow ${mix.snow.toFixed(3)}, grass ${mix.grass.toFixed(3)}`);
    check('and the word the rest of the game reads is the one over half of it',
      e.groundOverride(0, 0) === 'grass' && MIX_DOMINANT === 0.5, `${e.groundOverride(0, 0)}`);

    const t = createTerrainEdits({ baseHeight: flat });
    const climb = [];
    for (let i = 0; i < 3; i++) {
      t.stroke({ kind: 'ground', x: 0, z: 0, r: 20, word: 'snow', hardness: 1, opacity: 0.3 });
      climb.push(t.groundMixAt(0, 0).snow);
    }
    check('three passes at 0.3 climb 0.3, 0.51, 0.657 and never reach 1',
      Math.abs(climb[0] - 0.3) < 1e-9 && Math.abs(climb[1] - 0.51) < 1e-9 && Math.abs(climb[2] - 0.657) < 1e-9,
      climb.map((v) => v.toFixed(3)).join(', '));
    check('and the third pass is the one that makes it the word the ground answers',
      t.groundOverride(0, 0) === 'snow', `${climb[2].toFixed(3)} of snow`);
    check('a mix never adds up to more than the whole of the ground',
      (() => {
        const m = createTerrainEdits({ baseHeight: flat });
        for (let i = 0; i < 40; i++) m.stroke({ kind: 'ground', x: 0, z: 0, r: 20, word: GROUND_WORDS[i % GROUND_WORDS.length], hardness: 1, opacity: 0.7 });
        const w = m.groundMixAt(0, 0);
        const total = Object.values(w).reduce((a, b) => a + b, 0);
        return total <= 1 + 1e-9 && Object.values(w).every((v) => v >= 0 && v <= 1);
      })(), 'forty passes of ten words, and the total is still one ground');
  }

  // paint's own falloff, driven at both ends
  {
    const hardDisc = createTerrainEdits({ baseHeight: flat });
    hardDisc.stroke({ kind: 'ground', x: 0, z: 0, r: 20, word: 'dirt', hardness: 1, opacity: 1 });
    check('paint at hardness 1 is the hard disc it has always been: the word to the last centimetre',
      hardDisc.groundMixAt(19.99, 0).dirt === 1 && hardDisc.groundMixAt(20.01, 0) === null,
      'full at 19.99 m, nothing at 20.01');
    const soft = createTerrainEdits({ baseHeight: flat });
    soft.stroke({ kind: 'ground', x: 0, z: 0, r: 20, word: 'dirt', hardness: PAINT_HARDNESS, opacity: PAINT_OPACITY });
    const w = (d) => { const m = soft.groundMixAt(d, 0); return m ? m.dirt : 0; };
    check('and at the editor\'s own defaults it is full across the core and falls away to nothing',
      Math.abs(w(0) - PAINT_OPACITY) < 1e-9 && Math.abs(w(6.9) - PAINT_OPACITY) < 1e-9
      && w(12) < w(6.9) && w(18) < w(12) && w(20.01) === 0,
      `${w(0).toFixed(3)} at the middle, ${w(12).toFixed(3)} at 12 m, ${w(18).toFixed(3)} at 18, nothing at 20`);
    check('and the core the ring ghost draws is where the falloff really starts',
      Math.abs(coreRadius({ kind: 'ground', r: 20, hardness: PAINT_HARDNESS }) - 7) < 1e-9
      && Math.abs(w(coreRadius({ kind: 'ground', r: 20, hardness: PAINT_HARDNESS })) - PAINT_OPACITY) < 1e-9,
      `${coreRadius({ kind: 'ground', r: 20, hardness: PAINT_HARDNESS })} m of core in a 20 m brush`);
  }

  // ---- the promise: a file with no ED5 knob in it lays the same ground -----
  {
    // Absence has to BE the old behaviour, and this is the invariant that says
    // so without a copy of the old module to compare against: for every kind,
    // a stroke with no knob and a stroke with the knob set to what absence
    // means have to lay identical ground. If a default is ever changed under
    // this, this fails.
    const bad = [];
    for (const kind of STROKE_KINDS) {
      if (kind === ERASE_KIND) continue;              // new in ED5: no old file has one
      const same = (a, b) => {
        const one = createTerrainEdits({ baseHeight: base }); one.stroke(a);
        const two = createTerrainEdits({ baseHeight: base }); two.stroke(b);
        for (let i = 0; i < 41 * 41; i++) {
          const x = ((i % 41) / 40 * 2 - 1) * 90, z = (Math.floor(i / 41) / 40 * 2 - 1) * 200;
          const h = base(x, z);
          if (one.heightDelta(x, z, h) !== two.heightDelta(x, z, h)) return false;
          if (one.groundOverride(x, z) !== two.groundOverride(x, z)) return false;
        }
        return true;
      };
      const at = { kind, x: 0, z: 0, r: 30, amount: 4, length: 120, word: 'dirt', x2: 0, z2: 120, yaw: 0.4, level: 3, depth: 2 };
      const meant = kind === 'ground' ? { hardness: 1, opacity: 1 } : HARD_KINDS.includes(kind) ? { hardness: 0 } : {};
      if (!same(at, { ...at, ...meant })) bad.push(kind);
    }
    check('for every kind, a stroke with no ED5 knob lays exactly the ground the knob\'s own meaning lays',
      bad.length === 0, bad.length ? `these moved: ${bad.join(', ')}` : `${STROKE_KINDS.length - 1} kinds over 1,681 points each`);
  }

  // and the user's own sculpt, read off the disk, loads and is asked for both
  {
    const file = JSON.parse(readFileSync(new URL('../../public/terrain/greenwold.json', import.meta.url), 'utf8'));
    const e = createTerrainEdits({ baseHeight: base });
    const n = e.load(file);
    let moved = 0, painted = 0;
    for (let i = 0; i < 5000; i++) {
      const u = (i * 2654435761 % 100000) / 100000, v = (i * 40503 % 100000) / 100000;
      const x = (u * 2 - 1) * 600, z = (v * 2 - 1) * 600;
      if (e.heightDelta(x, z, base(x, z)) !== 0) moved++;
      if (e.groundOverride(x, z) !== null) painted++;
    }
    check('the world file on disk loads, and every stroke in it comes back',
      n === (file.strokes || []).length && e.count === n, `${n} strokes`);
    // The claim is only ever what the file actually holds. It holds no strokes
    // today, so what is proved here is that a strokeless file moves nothing at
    // all, over 5,000 points; the day it holds strokes, the same 5,000 points
    // have to find some of them, and this fails if they find none.
    check(n ? 'and 5,000 points of it stand on ground the strokes moved'
      : 'and it holds no strokes yet, so not one of 5,000 points is moved or painted',
      n ? (moved > 0 || painted > 0) : (moved === 0 && painted === 0),
      `${moved} of 5,000 points moved, ${painted} painted`);
  }
}

console.log('\nGW2: a paint stroke dragged along a line');
{
  const e = createTerrainEdits({ baseHeight: () => 0 });
  e.stroke({ kind: 'ground', word: 'cobble', x: 0, z: 0, x2: 200, z2: 0, r: 4 });
  const words = (x, z) => e.groundOverride(x, z);
  check('the middle of the line is painted, and so are both ends', words(100, 0) === 'cobble' && words(0, 0) === 'cobble' && words(200, 0) === 'cobble',
    `${words(0, 0)}, ${words(100, 0)}, ${words(200, 0)}`);
  check('a metre off the line at its middle is painted', words(100, 1) === 'cobble');
  check('six metres off the line is not', words(100, 6) === null && words(100, -6) === null);
  check('and nor is six metres past its far end', words(206, 0) === null);
  check('a ground stroke with only half a far end is a disc', (() => {
    const f = createTerrainEdits({ baseHeight: () => 0 });
    const s = f.stroke({ kind: 'ground', word: 'dirt', x: 0, z: 0, x2: 50, r: 4 });
    const row = f.serialize().strokes.find((q) => q.kind === 'ground');
    return !('x2' in row) && !('z2' in row) && (f.groundOverride(25, 0) === null);
  })());
  check('the file round trip keeps the far end', (() => {
    const f = createTerrainEdits({ baseHeight: () => 0 });
    f.load(e.serialize());
    return f.groundOverride(150, 0) === 'cobble' && f.groundOverride(150, 7) === null;
  })());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
