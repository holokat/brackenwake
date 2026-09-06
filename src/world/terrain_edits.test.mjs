// The stroke list, driven both ways. Run: node src/world/terrain_edits.test.mjs
//
// Everything here is measured against the profile the game actually applies:
// the module is pure and takes its ground from a sampler, so this file hands it
// a hillside it knows the shape of and then asks what the ground became.

import {
  createTerrainEdits, deltaOf, maxGrade, dome, wallStart,
  STROKE_KINDS, GROUND_WORDS, CAVE_CUT, CAVE_CUT_AHEAD, SMOOTH_PULL,
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
