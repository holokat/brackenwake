// Flora placement, driven both ways. Run: node src/world/flora.test.mjs
// recordsFor is pure (no THREE), so the placement rules are testable in node.
import { createWorldField, BIOMES } from './field.js';
import { recordsFor, DENSITY } from './flora.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const f = createWorldField(20260904, { homeY: -0.3 });
const count = (r) => Object.values(r).reduce((a, l) => a + l.length, 0);

// find a chunk dominated by each biome, so the rules can be checked per biome
const byBiome = {};
for (let cz = -60; cz <= 60 && Object.keys(byBiome).length < BIOMES.length; cz++) for (let cx = -60; cx <= 60; cx++) {
  const b = f.biomeAt((cx + 0.5) * 64, (cz + 0.5) * 64);
  if (!byBiome[b] && f.biomeAt(cx * 64 + 8, cz * 64 + 8) === b && f.biomeAt(cx * 64 + 56, cz * 64 + 56) === b) byBiome[b] = [cx, cz];
}
console.log('  chunks found per biome:', Object.keys(byBiome).join(', '));

// determinism
{ const [cx, cz] = byBiome.meadow; const a = JSON.stringify(recordsFor(f, cx, cz)), b = JSON.stringify(recordsFor(f, cx, cz));
  check('same chunk, same records', a === b); }

// every record grows something its own cell's biome allows; forests are forests
{
  let bad = 0, total = 0; const perBiome = {};
  for (let cz = -30; cz < 30; cz += 3) for (let cx = -30; cx < 30; cx += 3) {
    const r = recordsFor(f, cx, cz);
    for (const [k, list] of Object.entries(r)) for (const rec of list) {
      total++; const b = f.biomeAt(rec.x, rec.z); perBiome[b] = perBiome[b] || {}; perBiome[b][k] = (perBiome[b][k] || 0) + 1;
      if (!DENSITY[b] || DENSITY[b][k] == null) bad++;
    }
  }
  check('every record is a kind its own cell allows', bad === 0, `${bad} of ${total} out of place`);
  const m = perBiome.mountain || {}; check('mountain cells are mostly rock', (m.rock || 0) >= (m.spruce || 0), JSON.stringify(m));
  check('boreal cells are a forest', (perBiome.boreal?.spruce || 0) > 200, JSON.stringify(perBiome.boreal));
  check('desert cells grow cacti', (perBiome.desert?.cactus || 0) > 20, JSON.stringify(perBiome.desert));
  check('beach cells grow palms', (perBiome.beach?.palm || 0) > 3, JSON.stringify(perBiome.beach));
  check('ocean cells grow nothing', !perBiome.ocean, JSON.stringify(perBiome.ocean));
}
for (const [b, [cx, cz]] of Object.entries(byBiome)) {
  const r = recordsFor(f, cx, cz);
  if (b === 'boreal') check('a boreal chunk holds 25+ spruce', (r.spruce || []).length >= 25, `${(r.spruce || []).length}`);
  if (b === 'meadow') check('a meadow chunk is open woodland (4 to 16 oaks)', (r.oak || []).length >= 4 && (r.oak || []).length <= 16, `${(r.oak || []).length}`);
}

// nothing stands in water, in a river, on a cliff, or inside a site clearing
{
  let wet = 0, steep = 0, total = 0, inSite = 0;
  const fakeSite = { x: 4000, z: 4000, flatR: 28, kind: 'hamlet' };
  for (let cz = 0; cz < 40; cz++) for (let cx = 0; cx < 40; cx++) {
    const r = recordsFor(f, cx + 50, cz + 50, { sitesNear: () => [fakeSite] });
    for (const list of Object.values(r)) for (const t of list) {
      total++;
      const s = f.sampleAt(t.x, t.z);
      if (s.water || s.river > 0.15) wet++;
      const slope = Math.max(Math.abs(f.heightAt(t.x + 1, t.z) - f.heightAt(t.x - 1, t.z)), Math.abs(f.heightAt(t.x, t.z + 1) - f.heightAt(t.x, t.z - 1)));
      if (slope > 2.0) steep++;
      if (Math.hypot(t.x - fakeSite.x, t.z - fakeSite.z) < 34) inSite++;
    }
  }
  check('records placed over 1600 chunks', total > 2000, `${total}`);
  check('none in water or river', wet === 0, `${wet}`);
  check('none on slopes over 2.0 per 2 m (rocks may sit on steeper ground than trees)', steep === 0, `${steep}`);
  check('none inside a site clearing', inSite === 0, `${inSite}`);
  // and the negative: without the site, that spot does get trees
  let there = 0;
  for (let cz = 61; cz <= 63; cz++) for (let cx = 61; cx <= 63; cx++) for (const l of Object.values(recordsFor(f, cx, cz))) for (const t of l) if (Math.hypot(t.x - 4000, t.z - 4000) < 34) there++;
  check('the clearing is the site\'s doing (trees there without it)', there > 0 || f.sampleAt(4000, 4000).water, `${there} trees, water=${f.sampleAt(4000, 4000).water}`);
}
// the farm keeps its clearing
{ let home = 0; for (let cz = -2; cz <= 1; cz++) for (let cx = -2; cx <= 1; cx++) for (const l of Object.values(recordsFor(f, cx, cz))) for (const t of l) if (Math.hypot(t.x, t.z) < 125) home++;
  check('nothing grows within 125 m of the farm', home === 0, `${home}`); }
// cost
{ const t0 = performance.now(); for (let i = 0; i < 50; i++) recordsFor(f, 10 + i, 7); const ms = (performance.now() - t0) / 50;
  check('a chunk places in under 3 ms', ms < 3, `${ms.toFixed(2)} ms`); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
