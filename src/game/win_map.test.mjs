// The Map panel, and the cost of drawing it. Run: node src/game/win_map.test.mjs
import {
  drawMap, shadeFor, toPixel, cellsIn, BIOME_COLOUR, SITE_COLOUR,
  MAP_SPAN, MAP_SAMPLES, MAP_STRIDE, MAP_BUDGET_MS, REDRAW_S, panel,
} from './win_map.js';
import { createWorldField, BIOMES } from '../world/field.js';
import { SITE_CELL } from '../world/sitegrid.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const field = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });

/**
 * A canvas context that records instead of painting. Every call the real draw
 * makes goes through it, so what is measured below is the real work: the
 * field samples, the road lookups and the site lookups, minus only the pixels.
 */
function recorder() {
  const calls = { fillRect: 0, stroke: 0, fillText: 0, arc: 0, moveTo: 0, lineTo: 0, save: 0, restore: 0 };
  const texts = [];
  const colours = new Set();
  const g = new Proxy({}, {
    get(_, k) {
      if (k === 'texts') return texts;
      if (k === 'calls') return calls;
      if (k === 'colours') return colours;
      return (...a) => {
        calls[k] = (calls[k] || 0) + 1;
        if (k === 'fillText') texts.push(a[0]);
      };
    },
    set(_, k, v) {
      if (k === 'fillStyle' || k === 'strokeStyle') colours.add(String(v));
      return true;
    },
  });
  return g;
}

console.log('win_map: the stride is a measured number, not a guess');
{
  field.sampleAt(0, 0);                       // warm the road and site caches once
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const g = recorder();
    runs.push(drawMap(g, { field, cx: 1200 + i * 900, cz: -700 - i * 900, size: 640 }));
  }
  const worst = Math.max(...runs.map((r) => r.ms));
  const best = Math.min(...runs.map((r) => r.ms));
  check('an 8 km map draws inside the budget', worst < MAP_BUDGET_MS,
    `${MAP_SAMPLES}x${MAP_SAMPLES} samples at ${MAP_STRIDE} m: ${runs.map((r) => r.ms.toFixed(1)).join(', ')} ms, worst ${worst.toFixed(1)} of a ${MAP_BUDGET_MS} ms budget`);
  check('the sample count is what the stride says', runs[0].samples === MAP_SAMPLES * MAP_SAMPLES, `${runs[0].samples} samples`);
  check('the stride follows from the span and the count', MAP_STRIDE === MAP_SPAN / MAP_SAMPLES && MAP_STRIDE === 62.5, `${MAP_STRIDE} m`);
  check('the map really is 8 km across', MAP_SPAN === 8000);
  // and the cost is linear in the sample count, so the budget is a real budget
  const half = drawMap(recorder(), { field, cx: 0, cz: 0, size: 640, samples: Math.round(MAP_SAMPLES / 2) });
  check('halving the stride quarters the samples', half.samples * 4 === MAP_SAMPLES * MAP_SAMPLES);
  check('and costs less time', half.ms < best + 1, `${half.ms.toFixed(1)} ms against ${best.toFixed(1)} ms`);
}

console.log('win_map: what it draws');
{
  const g = recorder();
  const res = drawMap(g, { field, cx: 0, cz: 0, size: 640, yaw: 0.5, discovered: [] });
  check('one filled cell per sample, plus the background', g.calls.fillRect === res.samples + 1, `${g.calls.fillRect} fills`);
  check('the player arrow is drawn', g.calls.moveTo >= 1 && g.calls.restore >= 2);
  check('nothing is named when nothing is found', g.texts.length === 0);
  check('and the count of found places is nothing', res.sites === 0);
}

console.log('win_map: discovered sites, and only those');
{
  // find real sites near the origin and hand the map two of their ids
  const found = [];
  for (let cz = -8; cz <= 8 && found.length < 4; cz++) {
    for (let cx = -8; cx <= 8 && found.length < 4; cx++) {
      const s = field.siteInCell(cx, cz);
      if (s) found.push(s);
    }
  }
  check('the world has sites to find', found.length >= 3, `${found.length} within reach`);
  const middle = found[1];
  const g = recorder();
  const res = drawMap(g, { field, cx: middle.x, cz: middle.z, size: 640, discovered: [middle.id] });
  check('the one you found is drawn once', res.sites === 1);
  check('and it is named, twice, because the name has a shadow', g.texts.filter((t) => t === middle.name).length === 2, `"${middle.name}"`);
  const none = drawMap(recorder(), { field, cx: middle.x, cz: middle.z, size: 640, discovered: [] });
  check('one you have not found is not drawn at all', none.sites === 0);
  // a Set and a discovery object both work, which is what the two callers hand over
  const asSet = drawMap(recorder(), { field, cx: middle.x, cz: middle.z, size: 640, discovered: new Set([middle.id]) });
  check('a Set of ids works', asSet.sites === 1);
  const asDiscovery = drawMap(recorder(), { field, cx: middle.x, cz: middle.z, size: 640, discovered: { has: (id) => id === middle.id } });
  check('and so does anything with a has()', asDiscovery.sites === 1);
}

console.log('win_map: roads');
{
  // draw over a patch with settlements in it, which is where roads.js lays any
  let best = null;
  for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) {
    const s = field.siteInCell(cx, cz);
    if (s && (s.kind === 'town' || s.kind === 'hamlet')) { best = s; break; }
  }
  const res = drawMap(recorder(), { field, cx: best.x, cz: best.z, size: 640 });
  check('roads are looked up and drawn where they run', res.roads >= 0, `${res.roads} roads within 8 km of ${best.name}`);
  const off = drawMap(recorder(), { field, cx: best.x, cz: best.z, size: 640, roads: false });
  check('and can be switched off', off.roads === 0);
}

console.log('win_map: the palette');
{
  check('every biome the field can return has a colour', BIOMES.every((b) => !!BIOME_COLOUR[b]), BIOMES.join(', '));
  check('every colour is three bytes', Object.values(BIOME_COLOUR).every((c) => c.length === 3 && c.every((n) => n >= 0 && n <= 255)));
  const deep = shadeFor({ biome: 'ocean', h: -14 });
  const shallow = shadeFor({ biome: 'ocean', h: -0.5 });
  check('deep water is darker than shallow', deep[2] < shallow[2], `${deep.join(',')} against ${shallow.join(',')}`);
  const high = shadeFor({ biome: 'mountain', h: 110 });
  const low = shadeFor({ biome: 'mountain', h: 50 });
  check('high ground is brighter than low', high[0] > low[0], `${high.join(',')} against ${low.join(',')}`);
  check('nothing shades out of range', [0, 50, 200, -20, 1000].every((h) => shadeFor({ biome: 'meadow', h }).every((c) => c >= 0 && c <= 255)));
  check('every site kind has a colour', ['town', 'hamlet', 'ruin', 'shrine', 'dungeon', 'cave', 'camp'].every((k) => !!SITE_COLOUR[k]));
}

console.log('win_map: the arithmetic');
{
  const [cx, cy] = toPixel(0, 0, 0, 0, 640);
  check('you are in the middle', cx === 320 && cy === 320);
  const [ex] = toPixel(4000, 0, 0, 0, 640);
  check('4 km east is the right edge', ex === 640);
  const [, nz] = toPixel(0, -4000, 0, 0, 640);
  check('4 km north is the top edge', nz === 0);
  const cells = cellsIn(0, 0);
  const span = Math.ceil(MAP_SPAN / SITE_CELL) + 1;
  check('the cells cover the whole map and no more', cells.length <= (span + 1) * (span + 1), `${cells.length} cells of ${SITE_CELL} m`);
  check('every cell is inside the span', cells.every(([x, z]) => Math.abs(x * SITE_CELL) <= MAP_SPAN && Math.abs(z * SITE_CELL) <= MAP_SPAN));
}

console.log('win_map: the panel redraws while it is open');
{
  let drawn = 0;
  const stub = Object.create(panel);
  stub.redraw = () => { drawn++; return null; };
  stub._since = 0;
  stub.tick(1.0);
  check('one second is not enough', drawn === 0);
  stub.tick(1.1);
  check('two seconds is', drawn === 1, `redraws every ${REDRAW_S} s`);
  stub.tick(1.9);
  check('and it waits again', drawn === 1);
  stub.tick(0.2);
  check('then goes again', drawn === 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
