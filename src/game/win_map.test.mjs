// The Map panel, and the cost of drawing it. Run: node src/game/win_map.test.mjs
import {
  drawMap, shadeFor, toPixel, toWorld, cellsIn, pickAt, asHas, arrowTip,
  BIOME_COLOUR, SITE_COLOUR, DANGER_TINT,
  MAP_SPAN, MAP_SAMPLES, MAP_STRIDE, MAP_BUDGET_MS, REDRAW_S, PICK_PX, panel,
} from './win_map.js';
import { createWorldField, BIOMES } from '../world/field.js';
import { SITE_CELL } from '../world/sitegrid.js';
import { ZONES, ZONE, WORLD_HALF, authoredSites } from '../world/zones.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const field = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });

/**
 * A canvas context that records instead of painting. Every call the real draw
 * makes goes through it, so what is measured below is the real work: the field
 * samples, the road lookups, the zone discs and the site lookups, minus only
 * the pixels. `rotate` keeps its argument, because the player arrow's heading
 * is the one number in this file that used to be wrong.
 */
function recorder() {
  const calls = { fillRect: 0, stroke: 0, fillText: 0, arc: 0, moveTo: 0, lineTo: 0, save: 0, restore: 0, strokeRect: 0, clip: 0 };
  const texts = [];
  const rotates = [];
  const colours = new Set();
  const g = new Proxy({}, {
    get(_, k) {
      if (k === 'texts') return texts;
      if (k === 'calls') return calls;
      if (k === 'colours') return colours;
      if (k === 'rotates') return rotates;
      return (...a) => {
        calls[k] = (calls[k] || 0) + 1;
        if (k === 'fillText') texts.push(a[0]);
        if (k === 'rotate') rotates.push(a[0]);
      };
    },
    set(_, k, v) {
      if (k === 'fillStyle' || k === 'strokeStyle') colours.add(String(v));
      return true;
    },
  });
  return g;
}

console.log('win_map: the map is the whole world');
{
  check('the span is the world, not a window on it', MAP_SPAN === 2 * WORLD_HALF && MAP_SPAN === 16000, `${MAP_SPAN} m across, WORLD_HALF ${WORLD_HALF}`);
  check('the stride follows from the span and the count', MAP_STRIDE === MAP_SPAN / MAP_SAMPLES && MAP_STRIDE === 125, `${MAP_STRIDE} m a sample`);
  const res = drawMap(recorder(), { field, cx: 0, cz: 0, size: 640 });
  check('the sample count is what the stride says', res.samples === MAP_SAMPLES * MAP_SAMPLES, `${res.samples} samples`);
  // the four corners of the map are outside the world, so they are all sea
  const c = WORLD_HALF * 0.98;
  check('every corner of the map is open ocean, so the coast is inside it',
    [[c, c], [-c, c], [c, -c], [-c, -c]].every(([x, z]) => field.sampleAt(x, z).water));
}

console.log('win_map: the stride is a measured number, not a guess');
{
  field.sampleAt(0, 0);                       // warm the road and site caches once
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const g = recorder();
    runs.push(drawMap(g, { field, cx: 1200 - i * 900, cz: -700 + i * 900, size: 640 }));
  }
  const worst = Math.max(...runs.map((r) => r.ms));
  const best = Math.min(...runs.map((r) => r.ms));
  check('a 16 km map, zones and all, draws inside the budget', worst < MAP_BUDGET_MS,
    `${MAP_SAMPLES}x${MAP_SAMPLES} samples at ${MAP_STRIDE} m: ${runs.map((r) => r.ms.toFixed(1)).join(', ')} ms, worst ${worst.toFixed(1)} of a ${MAP_BUDGET_MS} ms budget`);
  // and the cost is linear in the sample count, so the budget is a real budget
  const half = drawMap(recorder(), { field, cx: 0, cz: 0, size: 640, samples: Math.round(MAP_SAMPLES / 2) });
  check('halving the stride quarters the samples', half.samples * 4 === MAP_SAMPLES * MAP_SAMPLES);
  check('and costs less time', half.ms < best + 1, `${half.ms.toFixed(1)} ms against ${best.toFixed(1)} ms`);
  const noZones = drawMap(recorder(), { field, cx: 0, cz: 0, size: 640, zones: false });
  check('the zones can be switched off, and they are not what costs the time', noZones.zones === 0 && noZones.ms < MAP_BUDGET_MS, `${noZones.ms.toFixed(1)} ms without them`);
}

console.log('win_map: what it draws');
{
  const g = recorder();
  const res = drawMap(g, { field, cx: 0, cz: 0, size: 640, yaw: 0.5, discovered: [], zonesFound: [] });
  check('one filled cell per sample, plus the background', g.calls.fillRect >= res.samples + 1, `${g.calls.fillRect} fills`);
  check('the player arrow is drawn', g.calls.moveTo >= 1 && g.calls.restore >= 2);
  check('no site is named when none is found', g.texts.length === 0, g.texts.join(', '));
  check('and the count of found places is nothing', res.sites === 0);
  check('every zone that fits on the map is drawn', res.zones === ZONES.length, `${res.zones} of ${ZONES.length}`);
  check('and none of them is named, because none has been walked into', res.named === 0);
}

console.log('win_map: a zone you have walked into is named, one you have not is hatched');
{
  const known = drawMap(recorder(), { field, cx: 0, cz: 0, size: 640, zonesFound: ['vale', 'ironshoulder'] });
  check('two found zones are two named zones', known.named === 2, `${known.named} named of ${known.zones}`);
  const g = recorder();
  drawMap(g, { field, cx: 0, cz: 0, size: 640, zonesFound: ['ironshoulder'] });
  check('the found one is written on the map', g.texts.includes(ZONE.ironshoulder.name), `"${ZONE.ironshoulder.name}"`);
  check('and the unfound one is not', !g.texts.includes(ZONE.frostcrown.name));
  // hatching is strokes inside a clip, so unknown country costs many more lines
  const hatched = recorder(); drawMap(hatched, { field, cx: 0, cz: 0, size: 640, zonesFound: [] });
  const clear = recorder(); drawMap(clear, { field, cx: 0, cz: 0, size: 640, zonesFound: ZONES.map((z) => z.id) });
  check('unknown country is hatched and known country is not', hatched.calls.moveTo > clear.calls.moveTo + 100,
    `${hatched.calls.moveTo} line starts hatched against ${clear.calls.moveTo} clear`);
  check('a Set of zone ids works as well as a list', drawMap(recorder(), { field, cx: 0, cz: 0, size: 640, zonesFound: new Set(['vale']) }).named === 1);
  check('every danger tier has a tint', [1, 2, 3, 4, 5].every((t) => Array.isArray(DANGER_TINT[t]) && DANGER_TINT[t].length === 3));
  check('and the heart is greener than the rim', DANGER_TINT[1][1] > DANGER_TINT[5][1] && DANGER_TINT[5][0] > DANGER_TINT[1][0]);
}

console.log('win_map: discovered sites, and only those');
{
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
  const asSet = drawMap(recorder(), { field, cx: middle.x, cz: middle.z, size: 640, discovered: new Set([middle.id]) });
  check('a Set of ids works', asSet.sites === 1);
  const asDiscovery = drawMap(recorder(), { field, cx: middle.x, cz: middle.z, size: 640, discovered: { has: (id) => id === middle.id } });
  check('and so does anything with a has()', asDiscovery.sites === 1);
  check('asHas takes all three, and nothing', asHas(['a'])('a') && asHas(new Set(['a']))('a') && asHas({ has: () => true })('a') && !asHas(null)('a'));

  // an authored mine is drawn, and drawn as a way into the ground
  const mine = authoredSites().find((s) => s.kind === 'mine');
  const mg = recorder();
  const mres = drawMap(mg, { field, cx: mine.x, cz: mine.z, size: 640, discovered: [mine.id] });
  check('an authored mine is on the map', mres.sites === 1 && mg.texts.includes(mine.name), `"${mine.name}"`);
  check('and it is drawn as a square, not a village dot', mg.calls.strokeRect >= 1, `${mg.calls.strokeRect} squares`);
  check('every site kind has a colour, the new one included', ['town', 'hamlet', 'ruin', 'shrine', 'dungeon', 'cave', 'camp', 'mine'].every((k) => !!SITE_COLOUR[k]));
}

console.log('win_map: the waypoint');
{
  const wp = { x: 1200, z: -800, name: 'the Millrun Adit' };
  const g = recorder();
  drawMap(g, { field, cx: 0, cz: 0, size: 640, waypoint: wp });
  const none = recorder();
  drawMap(none, { field, cx: 0, cz: 0, size: 640, waypoint: null });
  check('a waypoint adds a mark to the map', g.calls.arc > none.calls.arc, `${g.calls.arc} arcs against ${none.calls.arc}`);
  const bad = recorder();
  drawMap(bad, { field, cx: 0, cz: 0, size: 640, waypoint: { name: 'nowhere' } });
  check('and a waypoint with no coordinates draws nothing extra', bad.calls.arc === none.calls.arc, `${bad.calls.arc} against ${none.calls.arc}`);
}

console.log('win_map: clicking sets it');
{
  const site = (() => {
    for (let cz = -6; cz <= 6; cz++) for (let cx = -6; cx <= 6; cx++) {
      const s = field.siteInCell(cx, cz);
      if (s) return s;
    }
  })();
  const [px, py] = toPixel(site.x, site.z, 0, 0, 640);
  const hit = pickAt(px, py, { field, cx: 0, cz: 0, size: 640, discovered: [site.id], zonesFound: [] });
  check('clicking a discovered site picks it', hit && hit.kind === 'site' && hit.id === site.id && hit.x === site.x, `${hit && hit.name}`);
  check('clicking one you have not found picks nothing there',
    pickAt(px, py, { field, cx: 0, cz: 0, size: 640, discovered: [], zonesFound: [] }) === null);
  // the middle of the map is the player, and the player is in the heart
  const heart = pickAt(320, 320, { field, cx: 0, cz: 0, size: 640, discovered: [], zonesFound: ['vale'] });
  check('but the zone under the click, once walked, is picked instead',
    heart && heart.kind === 'zone' && heart.id === 'vale' && heart.x === 0 && heart.z === 0, JSON.stringify(heart));
  check('and a zone you have not walked into is not', pickAt(320, 320, { field, cx: 0, cz: 0, size: 640, zonesFound: [] }) === null);
  check('a site wins over the zone it stands in', hit.kind === 'site');
  check('the pick radius is what PICK_PX says', (() => {
    const near = pickAt(px + PICK_PX - 1, py, { field, cx: 0, cz: 0, size: 640, discovered: [site.id] });
    const far = pickAt(px + PICK_PX + 3, py, { field, cx: 0, cz: 0, size: 640, discovered: [site.id] });
    return near?.kind === 'site' && far?.kind !== 'site';
  })(), `${PICK_PX} px`);
  // out past the world there is no zone at all, so nothing is clickable
  const [ox, oy] = toPixel(7900, 7900, 0, 0, 640);
  check('the empty ocean picks nothing', pickAt(ox, oy, { field, cx: 0, cz: 0, size: 640, zonesFound: ZONES.map((z) => z.id) }) === null);
}

console.log('win_map: the palette');
{
  check('every biome the field can return has a colour', BIOMES.every((b) => !!BIOME_COLOUR[b]), BIOMES.join(', '));
  check('every colour is three bytes', Object.values(BIOME_COLOUR).every((c) => c.length === 3 && c.every((n) => n >= 0 && n <= 255)));
  const deep = shadeFor({ biome: 'ocean', h: -30 });
  const shallow = shadeFor({ biome: 'ocean', h: -0.5 });
  check('the ring ocean is darker than a shallow bay', deep[2] < shallow[2], `${deep.join(',')} against ${shallow.join(',')}`);
  const high = shadeFor({ biome: 'mountain', h: 110 });
  const low = shadeFor({ biome: 'mountain', h: 50 });
  check('high ground is brighter than low', high[0] > low[0], `${high.join(',')} against ${low.join(',')}`);
  check('nothing shades out of range', [0, 50, 200, -20, -1000, 1000].every((h) => shadeFor({ biome: 'meadow', h }).every((c) => c >= 0 && c <= 255)));
}

console.log('win_map: the arithmetic');
{
  const [cx, cy] = toPixel(0, 0, 0, 0, 640);
  check('you are in the middle', cx === 320 && cy === 320);
  const [ex] = toPixel(8000, 0, 0, 0, 640);
  check('8 km east is the right edge', ex === 640);
  const [, nz] = toPixel(0, -8000, 0, 0, 640);
  check('8 km north is the top edge', nz === 0);
  check('toWorld is the exact inverse of toPixel', (() => {
    for (const [x, z] of [[0, 0], [1234, -5678], [-7999, 100]]) {
      const [px, py] = toPixel(x, z, 300, -200, 640);
      const [wx, wz] = toWorld(px, py, 300, -200, 640);
      if (Math.abs(wx - x) > 1e-9 || Math.abs(wz - z) > 1e-9) return false;
    }
    return true;
  })());
  const cells = cellsIn(0, 0);
  const span = Math.ceil(MAP_SPAN / SITE_CELL) + 1;
  check('the cells cover the whole map and no more', cells.length <= (span + 1) * (span + 1), `${cells.length} cells of ${SITE_CELL} m`);
  check('every cell is inside the span', cells.every(([x, z]) => Math.abs(x * SITE_CELL) <= MAP_SPAN && Math.abs(z * SITE_CELL) <= MAP_SPAN));
}

console.log('win_map: the player arrow points where the player faces');
{
  // player.js: forward is (sin yaw, cos yaw). The map is +x right and +z DOWN,
  // so the arrow tip in canvas pixels has to be that vector times its length.
  // The old code rotated by -yaw, which pointed the arrow backwards at every
  // heading; nothing tested it, so it shipped.
  let worst = 0;
  const say = [];
  for (const [yaw, label] of [[0, 'south (+z)'], [Math.PI / 2, 'east (+x)'], [Math.PI, 'north (-z)'], [-Math.PI / 2, 'west (-x)'], [0.7, '0.7 rad']]) {
    const [tx, ty] = arrowTip(yaw, 8);
    const want = [8 * Math.sin(yaw), 8 * Math.cos(yaw)];
    worst = Math.max(worst, Math.hypot(tx - want[0], ty - want[1]));
    say.push(`${label} -> (${tx.toFixed(2)}, ${ty.toFixed(2)})`);
  }
  check('the arrow tip is the forward vector at every heading', worst < 1e-9, say.join('; '));
  const g = recorder();
  drawMap(g, { field, cx: 0, cz: 0, size: 640, yaw: 0.7 });
  check('and the real draw uses that rotation, not some other one',
    g.rotates.length === 1 && Math.abs(g.rotates[0] - (Math.PI - 0.7)) < 1e-12, `rotate(${g.rotates[0]?.toFixed(4)})`);
  const back = recorder();
  drawMap(back, { field, cx: 0, cz: 0, size: 640, yaw: 0.7 + Math.PI });
  check('turning round turns the arrow round', Math.abs(Math.abs(back.rotates[0] - g.rotates[0]) - Math.PI) < 1e-12);
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

console.log('win_map: the panel writes the waypoint and says so');
{
  const site = (() => {
    for (let cz = -6; cz <= 6; cz++) for (let cx = -6; cx <= 6; cx++) {
      const s = field.siteInCell(cx, cz);
      if (s) return s;
    }
  })();
  const character = { discovered: [site.id], zones: [], waypoint: null };
  const said = [];
  const stub = Object.create(panel);
  stub._canvas = {
    width: 640, height: 640,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 640 }),
    getContext: () => recorder(),
  };
  stub._say = { textContent: '' };
  stub._foot = null;
  stub._ctx = { runtime: { field }, player: { pos: { x: 0, z: 0 }, yaw: 0 }, character, hud: { toast: (t) => said.push(t) } };
  const [px, py] = toPixel(site.x, site.z, 0, 0, 640);
  const wp = stub.clickAt({ clientX: px, clientY: py });
  check('a click on a found place sets character.waypoint', !!wp && !!character.waypoint && character.waypoint.name === site.name, JSON.stringify(character.waypoint));
  check('and the panel says so', /Waypoint set on/.test(stub._say.textContent), stub._say.textContent);
  check('and the HUD is told too', said.length === 1 && said[0].includes(site.name), said[0]);
  const miss = stub.clickAt({ clientX: 5, clientY: 5 });
  check('a click on nothing sets nothing and says why',
    miss === null && character.waypoint.name === site.name && /Nothing there/.test(stub._say.textContent), stub._say.textContent);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
