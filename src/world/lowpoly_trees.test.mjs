// The low poly forest, measured. Run: node src/world/lowpoly_trees.test.mjs
//
// Every species is built at every band, its triangles counted, its height read
// off the vertices, its arrays swept for NaN. The gates go both ways: a seed
// changes the tree AND the same seed repeats it; autumn changes the colours AND
// leaves the wood alone; foliage 0 bares an oak AND foliage 1 dresses it;
// arbor hands out a low poly prototype in one style AND a grown one in the
// other. The stand budget is the one flora.test.mjs holds the grown forest to.

import * as THREE from 'three';
import { setCanvasFactory, stubCanvasFactory } from './arbor_textures.js';
import * as A from './arbor.js';
import { buildLowPolyPrototype, lowPolyMaterials } from './lowpoly_trees.js';

setCanvasFactory(stubCanvasFactory);

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const num = (v, w = 6) => String(v).padStart(w);

const arraysOf = (geo) => Object.values(geo.attributes).map((a) => a.array).concat(geo.index ? [geo.index.array] : []);
function anyNaN(geo) {
  for (const arr of arraysOf(geo)) for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return true;
  return false;
}
function extent(geo, axis) {
  const a = geo.attributes.position?.array;
  if (!a || !a.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (let i = axis; i < a.length; i += 3) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
  return [lo, hi];
}
const trisOf = (g) => (g ? g.index.count / 3 : 0);

// The budget per band. Near is what stands round the player; far is where the
// count lives, so it is held hard.
const BUDGET = [1400, 420, 90];

// ---------------------------------------------------------------------------
// The trunk faces outward. Its side quads were wound inward once, so a front
// side material culled the near half of every trunk (the user, 2026-09-08:
// "open geometry like its missing half of the trunk"). A triangle low on the
// trunk and close to the axis is a trunk triangle; its normal must point away
// from the axis.
console.log('lowpoly: the trunk faces outward');
{
  for (const id of A.SPECIES_IDS) {
    const p = buildLowPolyPrototype(id, 4242, { maturity: 1 });
    const pos = p.bark.attributes.position.array, nrm = p.bark.attributes.normal.array;
    let trunk = 0, outward = 0;
    for (let i = 0; i + 8 < pos.length; i += 9) {
      const cx = (pos[i] + pos[i + 3] + pos[i + 6]) / 3, cy = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3, cz = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3;
      const r = Math.hypot(cx, cz);
      if (cy < 0.05 || cy > p.height * 0.3 || r > p.radius * 1.6 || r < 1e-4) continue;
      const ny = nrm[i + 1];
      if (Math.abs(ny) > 0.7) continue;   // a cap or a lean, not a side
      trunk++;
      if ((nrm[i] * cx + nrm[i + 2] * cz) / r > 0) outward++;
    }
    check(`${id}: the trunk's side faces point away from the axis`, trunk > 0 && outward === trunk, `${outward} of ${trunk}`);
  }
}

// ---------------------------------------------------------------------------
console.log('lowpoly: every species at every band');
{
  let worst = 0;
  for (const id of A.SPECIES_IDS) {
    const sp = A.SPECIES[id];
    const p = buildLowPolyPrototype(id, 4242, { maturity: 1 });
    const nan = p.bands.some((b) => anyNaN(b.bark) || (b.leaf && anyNaN(b.leaf)));
    const tris = p.bands.map((b) => trisOf(b.bark) + trisOf(b.leaf));
    const yb = extent(p.bark, 1);
    console.log(`       ${id.padEnd(7)} ${tris.map((t) => num(t, 5)).join(' /')} tris   top ${p.height.toFixed(1).padStart(5)} m  crown r ${p.crownRadius.toFixed(1)} m  trunk r ${p.radius.toFixed(2)}`);
    check(`${id}: no NaN in any band`, !nan);
    check(`${id}: the near band is under ${BUDGET[0]}, mid under ${BUDGET[1]}, far under ${BUDGET[2]}`,
      tris[0] <= BUDGET[0] && tris[1] <= BUDGET[1] && tris[2] <= BUDGET[2], tris.join(' / '));
    check(`${id}: the bands get cheaper with distance`, tris[0] > tris[1] && tris[1] > tris[2], tris.join(' / '));
    check(`${id}: the trunk stands on the ground`, yb && yb[0] > -0.4 && yb[0] < 0.1, `foot at ${yb && yb[0].toFixed(2)}`);
    check(`${id}: the top is the height the species table says, at maturity 1`,
      p.height >= sp.h[0] * 0.75 && p.height <= sp.h[1] * 1.6, `${p.height.toFixed(1)} m against [${sp.h}]`);
    check(`${id}: bark and leaf are the near band`, p.bark === p.bands[0].bark && (p.leaf === p.bands[0].leaf || !p.hasLeaves));
    check(`${id}: every band names its triangles`, p.bandTris.length === 3 && p.bandTris[0] === p.triangles);
    check(`${id}: the crown reaches out`, p.crownRadius > p.radius * 2, `${p.crownRadius.toFixed(1)} m`);
    if (tris[0] > worst) worst = tris[0];
  }
  check('dead is the one bare silhouette', buildLowPolyPrototype('dead', 1).hasLeaves === false
    && A.SPECIES_IDS.filter((id) => id !== 'dead').every((id) => buildLowPolyPrototype(id, 1).hasLeaves));
  check('a bare tree has no leaf band to draw', buildLowPolyPrototype('dead', 1).bands.every((b) => b.leaf === null));
  console.log(`       the dearest near band is ${worst} triangles`);
}

// ---------------------------------------------------------------------------
console.log('\nlowpoly: seeds, options');
{
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const pos = (p) => [...p.bark.attributes.position.array];
  check('the same seed grows the same tree', same(pos(buildLowPolyPrototype('oak', 7)), pos(buildLowPolyPrototype('oak', 7))));
  check('and a different seed grows a different one', !same(pos(buildLowPolyPrototype('oak', 7)), pos(buildLowPolyPrototype('oak', 8))));
  const young = buildLowPolyPrototype('oak', 4242, { maturity: 0 }), old = buildLowPolyPrototype('oak', 4242, { maturity: 1 });
  check('a sapling is shorter than an old tree', young.height < old.height * 0.7, `${young.height.toFixed(1)} vs ${old.height.toFixed(1)} m`);
  const tall = buildLowPolyPrototype('birch', 3, { heightScale: 1.5 }), base = buildLowPolyPrototype('birch', 3, {});
  check('heightScale scales the height', Math.abs(tall.height / base.height - 1.5) < 0.15, `${(tall.height / base.height).toFixed(2)}x`);
  const c0 = [...buildLowPolyPrototype('sakura', 3, { autumn: 0 }).leaf.attributes.color.array];
  const c1 = [...buildLowPolyPrototype('sakura', 3, { autumn: 1 }).leaf.attributes.color.array];
  check('autumn changes the canopy colours', !same(c0, c1));
  check('and leaves the wood where it was', same(pos(buildLowPolyPrototype('sakura', 3, { autumn: 0 })), pos(buildLowPolyPrototype('sakura', 3, { autumn: 1 }))));
  const bare = buildLowPolyPrototype('oak', 5, { foliage: 0 }), full = buildLowPolyPrototype('oak', 5, { foliage: 1 });
  check('foliage 0 bares an oak', bare.hasLeaves === false && bare.bands.every((b) => b.leaf === null));
  check('and foliage 1 dresses it', full.hasLeaves === true && trisOf(full.leaf) > 100);
  const gr = buildLowPolyPrototype('willow', 11, {}).leaf.attributes.position.array;
  let lowest = Infinity; for (let i = 1; i < gr.length; i += 3) if (gr[i] < lowest) lowest = gr[i];
  check('a willow\'s whips stop above the turf', lowest >= A.LEAF_GROUND_CLEARANCE, `lowest leaf at ${lowest.toFixed(2)} m`);
}

// ---------------------------------------------------------------------------
console.log('\nlowpoly: materials');
{
  const a = buildLowPolyPrototype('oak', 1), b = buildLowPolyPrototype('oak', 2), c = buildLowPolyPrototype('pine', 1);
  check('two oaks share one bark and one leaf material', a.barkMat === b.barkMat && a.leafMat === b.leafMat);
  check('and a pine has its own', c.leafMat !== a.leafMat);
  check('the leaf material is coloured per vertex and hooked to the wind', a.leafMat.vertexColors === true && typeof a.leafMat.onBeforeCompile === 'function');
  check('a palm frond is drawn from both sides', lowPolyMaterials('palm').leafMat.side === THREE.DoubleSide && a.leafMat.side === THREE.FrontSide);
  check('the shadow pass has a depth material', a.depthMat && a.depthMat.isMeshDepthMaterial === true);
  check('every face carries a colour', a.leaf.attributes.color.count === a.leaf.attributes.position.count);
}

// ---------------------------------------------------------------------------
console.log('\nlowpoly: through arbor');
{
  check('low poly is the style at boot', A.getTreeStyle() === 'lowpoly');
  const p = A.prototypeFor('oak', 99, { maturity: 1 });
  check('prototypeFor hands out a low poly tree', p.style === 'lowpoly' && Array.isArray(p.bands));
  check('bandsFor returns the bands it built', A.bandsFor(p) === p.bands);
  const stand = A.forestPrototypes('boreal', 42017, {});
  check('a forest type builds eight low poly prototypes', stand.length === 8 && stand.every((q) => q.style === 'lowpoly'));
  check('setTreeStyle refuses a style it has not got', (() => { try { A.setTreeStyle('cubist'); return false; } catch { return true; } })());
  A.setTreeStyle('grown');
  const g = A.prototypeFor('oak', 99, { maturity: 1 });
  check('and in the grown style the same call grows a tree', g.style === undefined && !g.bands && g.barkOrder.length > 0 && g !== p);
  const gb = A.bandsFor(g);
  check('bandsFor derives a grown tree\'s bands', gb.length === 3 && gb[0].bark === g.bark && gb[2].leaf && gb !== g.bands);
  A.setTreeStyle('lowpoly');
  check('switching back is a fresh cache, not the old tree', A.prototypeFor('oak', 99, { maturity: 1 }) !== p);
}

// ---------------------------------------------------------------------------
console.log('\nlowpoly: a chunk');
{
  const protos = A.forestPrototypes('boreal', 42017, {});
  const spots = A.placeTrees('boreal', 12, 12, 64, 42017);
  const near = spots.reduce((a, s) => a + protos[s.protoIndex].bandTris[0], 0);
  const far = spots.reduce((a, s) => a + protos[s.protoIndex].bandTris[2], 0);
  console.log(`       the boreal chunk at (12, 12), the one arbor.test measures: ${spots.length} trees, ${near.toLocaleString()} triangles near, ${far.toLocaleString()} far`);
  check('drawn near it is under 120,000 triangles', near < 120000, near.toLocaleString());
  check('and under 8,000 far', far < 8000, far.toLocaleString());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
