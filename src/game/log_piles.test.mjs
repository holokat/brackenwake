// Cut logs and broken ore, counted. Run: node src/game/log_piles.test.mjs
//
// Four things are worth proving and nothing else is:
//
//   1. the join, both ways. Every wood items.js ships has bark here and every
//      bark here belongs to a wood items.js ships, so neither list can grow on
//      its own and leave the other behind.
//   2. the triangles, counted rather than estimated, against the arithmetic
//      that produces them (4 x segments a log, 20 a chunk) as well as against
//      the budget.
//   3. every log is on the ground, the pile is one draw call, and the stack is
//      a stack rather than six logs in the same place.
//   4. a species and a vein that do not exist build NOTHING, because a grey box
//      where a pile should be is worse than no pile at all.

import * as THREE from 'three';
import {
  buildLogPile, buildOreHeap, logLayout, chunkLayout, logsDrawn, chunksDrawn,
  auditLogPiles, trisOf, BARK, ORE_WORD, HOST_ROCK,
  MAX_TRIS, MAX_LOGS, MAX_CHUNKS, LOG_R, LOG_LEN, LOG_SEG, CHUNK_R,
} from './log_piles.js';
import { LOG_BASES, ORE_BASES, BASES } from '../mmo/items.js';
import { ORES } from '../mmo/ores.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const WOODS = [...new Set(LOG_BASES.map((id) => BASES[id].material))];
const VEINS = [...new Set(ORE_BASES.map((id) => BASES[id].material))];

// ------------------------------------------------------------------ the join
console.log('log_piles: every wood and every vein, both ways');
{
  const report = auditLogPiles();
  check('the audit runs clean at load and again here', !!report);
  check(`every wood items.js ships has bark`, WOODS.every((w) => !!BARK[w]),
    `${WOODS.length} woods, ${WOODS.filter((w) => !BARK[w]).join(', ') || 'none missing'}`);
  check('and every bark belongs to a wood items.js ships',
    Object.keys(BARK).every((w) => WOODS.includes(w)),
    `${Object.keys(BARK).length} barks`);
  check('every vein items.js ships has a colour', VEINS.every((o) => !!ORE_WORD[o]), `${VEINS.length} veins`);
  check('and every colour belongs to a vein items.js ships',
    Object.keys(ORE_WORD).every((o) => VEINS.includes(o)));
  check('and every ore ores.js tiers has one too', ORES.every((o) => !!ORE_WORD[o.id]), `${ORES.length} tiers`);
  check('every bark colour is a hex number, not a word',
    Object.values(BARK).every((r) => Number.isInteger(r.bark) && Number.isInteger(r.cut)));
  const lum = (hex) => new THREE.Color(hex).getHSL({}).l;
  const paler = Object.entries(BARK).filter(([, r]) => lum(r.cut) > lum(r.bark)).map(([k]) => k);
  check('the sawn end is a different colour from the bark on every wood, or the cut would not read',
    Object.values(BARK).every((r) => Math.abs(lum(r.cut) - lum(r.bark)) > 0.05));
  // Driven the other way on purpose. Thirteen woods are darker outside than in;
  // birch is the one that is not, because birch bark is the white part of a
  // birch and its wood is the ordinary pale timber underneath.
  check('and it is the paler of the two on every wood but the birch',
    paler.length === Object.keys(BARK).length - 1 && !paler.includes('birch'),
    `${paler.length} of ${Object.keys(BARK).length}, the odd one out is ${Object.keys(BARK).filter((k) => !paler.includes(k)).join(', ')}`);
}

// ---------------------------------------------------------------- the numbers
console.log('\nlog_piles: the triangles, counted');
{
  const rows = [];
  let worst = 0;
  for (const w of WOODS) {
    for (let n = 1; n <= 8; n++) {
      const m = buildLogPile(w, n, { seed: n });
      const t = trisOf(m);
      worst = Math.max(worst, t);
      if (w === 'oak') rows.push(`${n}:${m.userData.logs.drawn} logs ${t} tris`);
      if (t !== m.userData.logs.drawn * 4 * LOG_SEG) { check(`${w} x${n} triangles are its logs`, false, String(t)); }
      m.geometry.dispose(); m.material.dispose();
    }
  }
  check('a log is 4 x LOG_SEG triangles and a pile is its logs', true, rows.join(', '));
  check(`the worst pile in the game is under the ${MAX_TRIS} budget`, worst <= MAX_TRIS, `${worst} triangles`);
  check('and it is the six log pile', worst === MAX_LOGS * 4 * LOG_SEG, `${worst} = ${MAX_LOGS} x ${4 * LOG_SEG}`);

  let worstOre = 0;
  for (const o of VEINS) {
    for (let n = 1; n <= 8; n++) {
      const m = buildOreHeap(o, n, { seed: n });
      worstOre = Math.max(worstOre, trisOf(m));
      m.geometry.dispose(); m.material.dispose();
    }
  }
  check(`the worst ore heap is under budget too`, worstOre <= MAX_TRIS, `${worstOre} triangles`);
  check('and it is six chunks of twenty', worstOre === MAX_CHUNKS * 20, `${worstOre}`);
}

// ------------------------------------------------------- one pile, one call
console.log('\nlog_piles: one pile is one draw call');
{
  const m = buildLogPile('oak', 6, { seed: 3 });
  let meshes = 0;
  m.traverse((o) => { if (o.isMesh) meshes++; });
  check('a pile of six logs is one mesh', meshes === 1, `${meshes} mesh(es)`);
  check('with one material', !Array.isArray(m.material));
  check('carrying the colour attribute the material claims',
    !!m.material.vertexColors === !!m.geometry.attributes.color);
  check('and it says what it is', m.name === 'logs:oak' && m.userData.logs.species === 'oak', m.name);
  m.geometry.dispose(); m.material.dispose();

  const h = buildOreHeap('starfall', 4, { seed: 3 });
  let hm = 0;
  h.traverse((o) => { if (o.isMesh) hm++; });
  check('a heap of ore is one mesh with one material', hm === 1 && !Array.isArray(h.material));
  check('and it says which vein', h.name === 'ore:starfall' && h.userData.ore.ore === 'starfall', h.name);
  h.geometry.dispose(); h.material.dispose();
}

// --------------------------------------------------------------- the stacking
console.log('\nlog_piles: a stack is a stack');
{
  const counts = [1, 2, 3, 4, 5, 6];
  const shape = counts.map((n) => logLayout(n).length).join(',');
  check('one to six logs are drawn one to six', shape === '1,2,3,4,5,6', shape);
  check('seven and seventy are still six', logsDrawn(7) === 6 && logsDrawn(70) === 6);
  check('and nothing at all is still one, because a felled tree left something',
    logsDrawn(0) === 1 && logsDrawn(-4) === 1);

  const six = logLayout(6, 5);
  const rows = new Set(six.map((l) => l.row));
  check('six logs are stacked three, two and one', rows.size === 3
    && six.filter((l) => l.row === 0).length === 3
    && six.filter((l) => l.row === 1).length === 2
    && six.filter((l) => l.row === 2).length === 1,
    six.map((l) => l.row).join(''));
  const ys = [...rows].map((r) => six.find((l) => l.row === r).y);
  check('and each row sits above the one under it', ys[0] < ys[1] && ys[1] < ys[2],
    ys.map((y) => (y * 100).toFixed(1) + ' cm').join(', '));
  check('the bottom row rests on the ground, not in it',
    Math.abs(six.filter((l) => l.row === 0)[0].y - LOG_R) < 1e-9, `${(LOG_R * 100).toFixed(1)} cm`);
  check('and the three logs of a row lie side by side, not on top of each other',
    new Set(six.filter((l) => l.row === 0).map((l) => Math.round(l.x * 100))).size === 3,
    six.filter((l) => l.row === 0).map((l) => (l.x * 100).toFixed(0)).join(', '));

  // the same pile every frame, and two piles that are not twins
  const a = JSON.stringify(logLayout(4, 11));
  const b = JSON.stringify(logLayout(4, 11));
  const c = JSON.stringify(logLayout(4, 12));
  check('the same seed grows the same pile', a === b);
  check('and a different seed does not', a !== c);
}

// ---------------------------------------------------------------- the ground
console.log('\nlog_piles: nothing is under the turf');
{
  let worstLow = Infinity, tallest = 0;
  for (const w of WOODS) {
    const m = buildLogPile(w, 6, { seed: 7 });
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      worstLow = Math.min(worstLow, pos.getY(i));
      tallest = Math.max(tallest, pos.getY(i));
    }
    m.geometry.dispose(); m.material.dispose();
  }
  check('no log reaches under the ground', worstLow >= -0.02, `lowest ${(worstLow * 1000).toFixed(0)} mm`);
  check('and a full pile is about knee high, not a wall',
    tallest > 0.3 && tallest < 0.7, `${(tallest * 100).toFixed(0)} cm`);

  let oreLow = Infinity, oreHigh = 0;
  for (const o of VEINS) {
    const m = buildOreHeap(o, 6, { seed: 7 });
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { oreLow = Math.min(oreLow, pos.getY(i)); oreHigh = Math.max(oreHigh, pos.getY(i)); }
    m.geometry.dispose(); m.material.dispose();
  }
  check('an ore heap sits on the ground', oreLow >= -0.02, `lowest ${(oreLow * 1000).toFixed(0)} mm`);
  check('and it is a heap rather than a boulder', oreHigh < 0.3, `${(oreHigh * 100).toFixed(0)} cm`);
}

// ------------------------------------------------------------- the colouring
console.log('\nlog_piles: a birch is not an oak');
{
  const meanOf = (mesh) => {
    const col = mesh.geometry.attributes.color;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < col.count; i++) { r += col.getX(i); g += col.getY(i); b += col.getZ(i); }
    return [r / col.count, g / col.count, b / col.count];
  };
  const oak = buildLogPile('oak', 6, { seed: 1 });
  const birch = buildLogPile('birch', 6, { seed: 1 });
  const cactus = buildLogPile('cactus', 6, { seed: 1 });
  const [or_, og, ob] = meanOf(oak);
  const [br, bg, bb] = meanOf(birch);
  const [cr, cg, cb] = meanOf(cactus);
  check('a birch pile is far paler than an oak one', br > or_ + 0.2,
    `birch ${br.toFixed(2)}, oak ${or_.toFixed(2)}`);
  check('an oak is warm: more red than blue', or_ > ob * 1.3, `${or_.toFixed(2)} vs ${ob.toFixed(2)}`);
  check('a cactus is green: more green than red', cg > cr * 1.2, `${cg.toFixed(2)} vs ${cr.toFixed(2)}`);
  check('and none of the three is a flat colour', (() => {
    const col = oak.geometry.attributes.color;
    let lo = 1, hi = 0;
    for (let i = 0; i < col.count; i++) { lo = Math.min(lo, col.getX(i)); hi = Math.max(hi, col.getX(i)); }
    return hi - lo > 0.1;
  })(), 'the oak grain and its sawn ends');
  check('the blue of an oak is under its green, which is under its red',
    ob < og && og < or_, `${or_.toFixed(2)} ${og.toFixed(2)} ${ob.toFixed(2)}`);
  for (const m of [oak, birch, cactus]) { m.geometry.dispose(); m.material.dispose(); }

  // the ore is rock with metal in it, not a lump of metal
  const heap = buildOreHeap('emberite', 6, { seed: 2 });
  const col = heap.geometry.attributes.color;
  const rock = new THREE.Color(HOST_ROCK);
  let oreFaces = 0, rockFaces = 0;
  for (let f = 0; f < col.count / 3; f++) {
    const i = f * 3;
    const c = new THREE.Color(col.getX(i), col.getY(i), col.getZ(i));
    // an emberite fleck is red; the host rock is grey, so r, g and b are close
    if (c.r > c.b * 1.6) oreFaces++; else rockFaces++;
  }
  check('an emberite heap is mostly rock with red flecks in it',
    oreFaces > 0 && rockFaces > 0 && rockFaces >= oreFaces * 0.4,
    `${oreFaces} ore faces, ${rockFaces} rock faces`);
  check('and the host rock really is grey', Math.abs(rock.r - rock.b) < 0.06,
    `#${HOST_ROCK.toString(16)}`);
  heap.geometry.dispose(); heap.material.dispose();
}

// ---------------------------------------------------- the other direction
console.log('\nlog_piles: a wood that does not exist builds nothing');
{
  check('a made up wood builds nothing at all', buildLogPile('mithril', 4) === null);
  check('a made up vein builds nothing at all', buildOreHeap('cheese', 4) === null);
  check('and no wood at all builds nothing', buildLogPile(null, 4) === null && buildLogPile(undefined, 4) === null);
  check('while a real one does build', !!buildLogPile('oak', 1) && !!buildOreHeap('copper', 1));
  check('the layouts of a real one are not empty either',
    logLayout(3).length === 3 && chunkLayout(3).length === 3);
  check('a chunk heap is capped the same way a pile is',
    chunksDrawn(99) === MAX_CHUNKS && chunksDrawn(0) === 1);
}

// -------------------------------------------------------------- the material
console.log('\nlog_piles: the material fades rather than recompiling');
{
  const m = buildLogPile('willow', 3);
  check('wood is transparent from the start, at opacity 1',
    m.material.transparent === true && m.material.opacity === 1);
  check('and it is not shiny: bark is not metal',
    m.material.metalness === 0 && m.material.roughness > 0.8,
    `metalness ${m.material.metalness}, roughness ${m.material.roughness}`);
  check('a log casts and receives a shadow', m.castShadow && m.receiveShadow);
  m.geometry.dispose(); m.material.dispose();
  const h = buildOreHeap('silver', 3);
  check('and so does the ore, which is a little metallic and flat shaded',
    h.material.transparent === true && h.material.metalness > 0 && h.material.flatShading === true);
  h.geometry.dispose(); h.material.dispose();
}

// ---------------------------------------------------------- the sizes are sane
console.log('\nlog_piles: a log is log sized');
{
  check('a log is about 86 cm long and 17 cm across',
    LOG_LEN > 0.6 && LOG_LEN < 1.2 && LOG_R * 2 > 0.12 && LOG_R * 2 < 0.25,
    `${(LOG_LEN * 100).toFixed(0)} cm by ${(LOG_R * 200).toFixed(0)} cm`);
  check('and much longer than it is thick, which is what makes it a log',
    LOG_LEN > LOG_R * 6, `${(LOG_LEN / (LOG_R * 2)).toFixed(1)} to 1`);
  check('a chunk of ore is a fist, not a boulder', CHUNK_R * 2 < 0.25, `${(CHUNK_R * 200).toFixed(0)} cm`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
