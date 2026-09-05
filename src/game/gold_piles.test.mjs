// Coins on the ground, counted. Run: node src/game/gold_piles.test.mjs
//
// Three things are worth proving here and nothing else is:
//
//   1. the boundaries, both ways. 30 is a small pile and 31 is a medium one,
//      150 is a medium one and 151 is a heap, and no gold at all is no pile.
//   2. the triangles, counted rather than estimated. A cylinder of n radial
//      segments is 4n triangles, and the audit fails if a pile ever costs more
//      than MAX_TRIS.
//   3. every coin is on the ground and the pile is one draw call, because a
//      pile half sunk in the turf and a pile of fifty meshes are both bugs
//      nobody would think to look for.

import * as THREE from 'three';
import {
  buildGoldPile, buildCoinScatter, tierFor, coinsFor, coinLayout, auditGoldPiles,
  trisPerCoin, GOLD_TIERS, TIER, MAX_TRIS, GOLD_COLOUR, COIN_R, COIN_H,
} from './gold_piles.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const trisOf = (mesh) => (mesh.geometry.index
  ? mesh.geometry.index.count / 3
  : mesh.geometry.attributes.position.count / 3);

// ------------------------------------------------------------ the boundaries
{
  const edges = [
    [-5, null], [0, null], [0.4, null],
    [1, 'small'], [15, 'small'], [30, 'small'],
    [31, 'medium'], [90, 'medium'], [150, 'medium'],
    [151, 'large'], [999, 'large'], [1e6, 'large'],
  ];
  const wrong = edges.filter(([n, want]) => tierFor(n) !== want);
  check('every boundary lands on the right side, both ways', wrong.length === 0,
    wrong.map(([n, want]) => `${n} gave ${tierFor(n)} and wanted ${want}`).join('; '));
  check('the rounding is at the boundary, not near it',
    tierFor(30.4) === 'small' && tierFor(30.6) === 'medium'
    && tierFor(150.4) === 'medium' && tierFor(150.6) === 'large',
    `${tierFor(30.4)}, ${tierFor(30.6)}, ${tierFor(150.4)}, ${tierFor(150.6)}`);
  check('nonsense is not a pile', tierFor(NaN) === null && tierFor(undefined) === null && tierFor('x') === null);
  check('and no gold builds nothing rather than an empty mesh',
    buildGoldPile(0) === null && buildGoldPile(-3) === null);
  check('the three bands leave no gap and no overlap',
    GOLD_TIERS.every((t, i) => i === 0 || t.min === GOLD_TIERS[i - 1].max + 1),
    GOLD_TIERS.map((t) => `${t.min}..${t.max}`).join(' '));
}

// --------------------------------------------------------------- coin counts
{
  check('a small pile is six to twelve coins, as the brief says',
    coinsFor(1) === 6 && coinsFor(30) === 12
    && [1, 5, 12, 19, 26, 30].every((n) => coinsFor(n) >= 6 && coinsFor(n) <= 12),
    `${[1, 8, 15, 22, 30].map(coinsFor).join(', ')} coins at 1, 8, 15, 22, 30 gold`);
  check('and it grows with the purse rather than jumping', coinsFor(1) < coinsFor(30));
  check('a medium pile is forty coins', coinsFor(31) === 40 && coinsFor(150) === 40);
  check('a heap is more than a mound', coinsFor(151) > coinsFor(150), `${coinsFor(151)} against ${coinsFor(150)}`);
  check('no gold is no coins', coinsFor(0) === 0);
}

// ------------------------------------------------------------ the audit ----
{
  const report = auditGoldPiles();
  console.log('  ' + Object.entries(report)
    .map(([k, v]) => `${k}: ${v.coins} coins, ${v.tris} triangles, ${(v.radius * 2).toFixed(2)} m across`)
    .join('; '));
  check('all three tiers build at load', Object.keys(report).length === 3);
  check('and every one is under the triangle budget',
    Object.values(report).every((v) => v.tris < MAX_TRIS),
    Object.values(report).map((v) => v.tris).join(', ') + ` of ${MAX_TRIS}`);
}

// -------------------------------------------------------------- the meshes --
{
  for (const t of GOLD_TIERS) {
    const amount = t.max === Infinity ? 900 : t.max;
    const mesh = buildGoldPile(amount, { seed: 5 });
    const tris = trisOf(mesh);
    const coins = mesh.userData.gold.coins;
    check(`a ${t.id} pile is one mesh, not ${coins} of them`,
      mesh.isMesh && mesh.children.length === 0);
    check(`and its ${tris} triangles are exactly ${coins} coins of ${trisPerCoin(t.seg)}`,
      tris === coins * trisPerCoin(t.seg), `${tris}`);
    check(`a ${t.id} pile is under the ${MAX_TRIS} triangle budget`, tris < MAX_TRIS, `${tris}`);
    // the class, not the case: a material claiming vertex colours over a
    // geometry with none renders black, silently. grass.js has the same audit
    // from the other side.
    check(`the ${t.id} pile's vertex colours are real`,
      !!mesh.material.vertexColors === !!mesh.geometry.attributes.color
      && mesh.geometry.attributes.color.count === mesh.geometry.attributes.position.count);
    check(`the ${t.id} pile is gold, not a yellow plastic`,
      mesh.material.metalness === 0.85 && mesh.material.roughness === 0.3
      && mesh.material.envMapIntensity > 0,
      `metalness ${mesh.material.metalness}, roughness ${mesh.material.roughness}, env ${mesh.material.envMapIntensity}`);
    check(`and it casts and receives shadow`, mesh.castShadow && mesh.receiveShadow);
    // every coin on or above the ground
    const pos = mesh.geometry.attributes.position;
    let lowest = Infinity, highest = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      lowest = Math.min(lowest, pos.getY(i)); highest = Math.max(highest, pos.getY(i));
    }
    check(`not one coin of the ${t.id} pile is under the ground`, lowest > -0.02,
      `lowest vertex ${lowest.toFixed(4)} m`);
    check(`and the ${t.id} pile stands ${(highest * 100).toFixed(0)} cm proud of it`,
      highest > COIN_H * 0.4, `${highest.toFixed(3)} m`);
    mesh.geometry.dispose(); mesh.material.dispose();
  }
}

// the three read as three different things, which is the whole point of tiers
{
  const small = buildGoldPile(20, { seed: 1 });
  const medium = buildGoldPile(90, { seed: 1 });
  const large = buildGoldPile(400, { seed: 1 });
  const top = (m) => { const p = m.geometry.attributes.position; let h = -Infinity; for (let i = 0; i < p.count; i++) h = Math.max(h, p.getY(i)); return h; };
  const wide = (m) => { const p = m.geometry.attributes.position; let r = 0; for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i))); return r; };
  console.log(`  small ${(top(small) * 100).toFixed(1)} cm high and ${(wide(small) * 200).toFixed(0)} cm across, `
    + `medium ${(top(medium) * 100).toFixed(1)} cm and ${(wide(medium) * 200).toFixed(0)} cm, `
    + `large ${(top(large) * 100).toFixed(1)} cm and ${(wide(large) * 200).toFixed(0)} cm`);
  check('a scatter is flat, a mound is heaped, and a heap is taller still',
    top(small) < top(medium) && top(medium) < top(large),
    `${top(small).toFixed(3)}, ${top(medium).toFixed(3)}, ${top(large).toFixed(3)}`);
  check('and the heap is the widest of the three, because coins spilled off it',
    wide(large) > wide(medium) && wide(large) > wide(small),
    `${wide(large).toFixed(3)} m against ${wide(medium).toFixed(3)}`);
  for (const m of [small, medium, large]) { m.geometry.dispose(); m.material.dispose(); }
}

// ------------------------------------------------------------- the layout ---
{
  const large = coinLayout(400, 3);
  const spilled = large.filter((c) => c.spilled);
  check('a heap spills a few coins and no more', spilled.length === TIER.large.spill,
    `${spilled.length} of ${large.length}`);
  check('every spilled coin lies outside the heap',
    spilled.every((c) => Math.hypot(c.x, c.z) > TIER.large.r),
    `nearest ${Math.min(...spilled.map((c) => Math.hypot(c.x, c.z))).toFixed(3)} m of ${TIER.large.r}`);
  check('and lies flat on the ground, because a coin that rolled off is on the floor',
    spilled.every((c) => c.y < COIN_H && Math.abs(c.tiltX) < 0.1 && Math.abs(c.tiltZ) < 0.1));
  const medium = coinLayout(90, 3);
  check('a mound is nothing but mound', medium.every((c) => !c.spilled));
  check('nothing in any layout is below the ground',
    [...large, ...medium, ...coinLayout(9, 3)].every((c) => c.y >= COIN_H * 0.5 - 1e-9));
  // the paraboloid: coins in the middle sit higher than coins at the rim
  const mid = medium.filter((c) => Math.hypot(c.x, c.z) < TIER.medium.r * 0.4);
  const rim = medium.filter((c) => Math.hypot(c.x, c.z) > TIER.medium.r * 0.8);
  const avg = (a) => a.reduce((p, c) => p + c.y, 0) / Math.max(1, a.length);
  check('a mound is higher in the middle than at its rim', avg(mid) > avg(rim) * 1.4,
    `${(avg(mid) * 100).toFixed(1)} cm against ${(avg(rim) * 100).toFixed(1)} cm, ${mid.length} and ${rim.length} coins`);
  check('and no coin is further out than its tier says',
    medium.every((c) => Math.hypot(c.x, c.z) <= TIER.medium.r * 1.05));
}

// determinism, both ways: the same purse is the same pile, a different one is not
{
  const a = coinLayout(46, 11);
  const b = coinLayout(46, 11);
  const c = coinLayout(46, 12);
  const d = coinLayout(47, 11);
  const key = (l) => l.map((k) => `${k.x.toFixed(5)},${k.y.toFixed(5)},${k.z.toFixed(5)}`).join('|');
  check('the same amount and seed grow the same pile every time', key(a) === key(b));
  check('a different seed grows a different pile', key(a) !== key(c));
  check('and so does a different amount', key(a) !== key(d));
  check('two piles of the same size in one fight are not twins',
    key(coinLayout(46, 1)) !== key(coinLayout(46, 2)));
}

// the scatter beside a sack is never a heap, whatever the purse
{
  for (const gold of [3, 40, 400, 90000]) {
    const m = buildCoinScatter(gold, { seed: 2 });
    check(`a coin scatter beside a sack of ${gold} gold is still a scatter`,
      m && m.name === 'gold:small' && trisOf(m) <= 12 * trisPerCoin(TIER.small.seg),
      m ? `${m.name}, ${trisOf(m)} triangles` : 'nothing');
    m.geometry.dispose(); m.material.dispose();
  }
}

// the colour is gold, and the shading is per coin rather than one flat blob
{
  const m = buildGoldPile(400, { seed: 4 });
  const col = m.geometry.attributes.color;
  const base = new THREE.Color(GOLD_COLOUR);
  let lo = Infinity, hi = -Infinity, offHue = 0;
  const c = new THREE.Color();
  for (let i = 0; i < col.count; i++) {
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    const k = c.r / Math.max(1e-6, base.r);
    lo = Math.min(lo, k); hi = Math.max(hi, k);
    // every coin is the same gold, only lighter or darker
    if (Math.abs(c.g / Math.max(1e-6, c.r) - base.g / base.r) > 1e-3) offHue++;
  }
  check('the coins are shaded apart, so a heap reads as coins and not as a blob',
    hi - lo > 0.15, `${lo.toFixed(2)} to ${hi.toFixed(2)} of the base`);
  check('and every one of them is the same gold underneath', offHue === 0, `${offHue} off hue`);
  check('the base colour is a warm gold, not a lemon',
    base.r > base.g && base.g > base.b && base.b < 0.5,
    `#${GOLD_COLOUR.toString(16)}`);
  check('a coin is a coin sized disc, not a checker', COIN_R > COIN_H * 2,
    `${(COIN_R * 200).toFixed(0)} cm across, ${(COIN_H * 1000).toFixed(0)} mm thick`);
  m.geometry.dispose(); m.material.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
