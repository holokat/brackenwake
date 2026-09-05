// The bounded world and the twenty one places in it, driven both ways.
// Run: node src/world/zones.test.mjs
import {
  ZONES, ZONE, ZONE_COUNT, zoneAt, zoneBias, authoredSites, auditZones,
  WORLD_HALF, OCEAN_FLOOR, COAST_INNER, COAST_MIN, COAST_WOBBLE, HEART_SAFE,
  BIOME_OVERRIDE_W, oceanBeyond, insideWorld, clampToWorld, coastRadiusAt,
  wildDanger, WILD_ORE, zoneSub, DANGER_WORD,
} from './zones.js';
import { createWorldField, SEA_LEVEL } from './field.js';
import { authoredInCell, SITE_CELL, mineParts } from './sitegrid.js';
import { createDiscovery, ZONE_ENTER_W } from './sites.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const SEED = 20260904;
const f = createWorldField(SEED, { homeBiome: 'meadow', homeY: -0.3 });

// ---------------------------------------------------------------- the table --
console.log('zones: the table');
{
  const r = auditZones();
  check('the table audits clean at import', r.zones === ZONE_COUNT && r.zones === 21, `${r.zones} zones, ${r.sites} authored sites, ${r.mines} mines`);
  check('every zone id is in the ZONE index', ZONES.every((z) => ZONE[z.id] === z));
  check('the heart carries no bias at all', !ZONE.vale.biome && !ZONE.vale.climate);
  const biased = ZONES.filter((z) => z.biome || z.climate);
  check('most of the world is authored, not just tinted', biased.length >= 12, `${biased.length} of ${ZONES.length} carry a bias`);
  let worst = Infinity, worstId = null;
  for (const z of biased) {
    const gap = Math.hypot(z.x, z.z) - z.r - z.edge;
    if (gap < worst) { worst = gap; worstId = z.id; }
  }
  check('no biased zone reaches into the heart', worst >= HEART_SAFE, `nearest is ${worstId} at ${worst.toFixed(0)} m against HEART_SAFE ${HEART_SAFE}`);
  // and the other direction: a zone moved in WOULD be caught
  const spy = { id: 'spy', name: 'Spy', x: 1200, z: 0, r: 400, edge: 200, biome: 'snow', climate: null, danger: [1, 1], ore: ['copper'], sites: [], line: 'x' };
  ZONES.push(spy);
  let threw = false;
  try { auditZones(); } catch (e) { threw = /HEART_SAFE/.test(e.message); }
  ZONES.pop();
  check('and a zone that did reach in would throw', threw);
  auditZones();
  // the banner's subtitle is three or four words, because hud.zone puts it in
  // small caps at .3em: a zone's `line` is a sentence and goes in a toast
  check('every zone has a short word for the banner', ZONES.every((z) => {
    const sub = zoneSub(z);
    return sub && sub.length <= 24 && sub.split(' ').length <= 4;
  }), ZONES.map((z) => zoneSub(z)).filter((v, i, a) => a.indexOf(v) === i).join(' / '));
  check('and every tier has one', [1, 2, 3, 4, 5].every((t) => !!DANGER_WORD[t]) && zoneSub(null) === '');
  check('the heart is the quiet one and the rim is not', zoneSub(ZONE.vale) !== zoneSub(ZONE.theteeth), `${zoneSub(ZONE.vale)} / ${zoneSub(ZONE.theteeth)}`);
}

// --------------------------------------------------------------- the edge --
console.log('zones: the world ends in water');
{
  const dirs = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    dirs.push([Math.cos(a), Math.sin(a), `${(i * 45)} deg`]);
  }
  let wet = 0, deep = 0;
  const say = [];
  for (const [cx, cz, label] of dirs) {
    const s = f.sampleAt(cx * 8200, cz * 8200);
    if (s.water) wet++;
    if (s.h <= OCEAN_FLOOR + 0.001) deep++;
    say.push(`${label} h=${s.h.toFixed(1)} ${s.biome}`);
  }
  check('at 8.2 km the world is water in all eight directions', wet === 8, say.join(', '));
  check('and it is the full ocean floor, not a shelf', deep === 8, `${deep}/8 at ${OCEAN_FLOOR} m`);

  // and the other direction: the inland world is NOT drowned by the falloff
  let inlandLand = 0, inlandN = 0;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    for (const r of [1000, 3000, 5000]) {
      inlandN++;
      if (!f.sampleAt(Math.cos(a) * r, Math.sin(a) * r).water) inlandLand++;
    }
  }
  check('and inland is still mostly dry', inlandLand / inlandN > 0.5, `${inlandLand}/${inlandN} dry at 1, 3 and 5 km`);

  // A coast, not a cliff: on most bearings there is sand between the last
  // meadow and the ring ocean. The coast wobbles, and where the field's own
  // ocean already reaches in the last dry ground is well short of the rim, so
  // the sweep is the whole outer half of the world and not a fixed band.
  let beaches = 0;
  const dryEdge = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    let sand = false, last = 0;
    for (let r = 4000; r <= 8200; r += 25) {
      const s = f.sampleAt(Math.cos(a) * r, Math.sin(a) * r);
      if (s.biome === 'beach') sand = true;
      if (!s.water) last = r;
    }
    if (sand) beaches++;
    dryEdge.push(last);
  }
  dryEdge.sort((a, b) => a - b);
  check('the continent ends in a beach on most bearings', beaches >= 48, `${beaches}/64 bearings carry sand in the outer half`);
  check('and the last dry ground is short of the rim on every bearing', dryEdge[63] < WORLD_HALF, `last dry radius: ${dryEdge[0]} m at the shortest, ${dryEdge[32]} m median, ${dryEdge[63]} m at the longest, against WORLD_HALF ${WORLD_HALF}`);
}

console.log('zones: oceanBeyond');
{
  let nonZero = 0;
  for (let i = 0; i < 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    for (const r of [0, 1000, 4000, 6000, COAST_MIN - 1]) {
      if (oceanBeyond(Math.cos(a) * r, Math.sin(a) * r) !== 0) nonZero++;
    }
  }
  check('it is exactly zero everywhere inside COAST_MIN', nonZero === 0, `${COAST_MIN} m, 3600 probes`);
  let notOne = 0;
  for (let i = 0; i < 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    for (const r of [WORLD_HALF, WORLD_HALF + 200, WORLD_HALF + 5000]) {
      if (oceanBeyond(Math.cos(a) * r, Math.sin(a) * r) !== 1) notOne++;
    }
  }
  check('and exactly one at and past WORLD_HALF', notOne === 0, `${WORLD_HALF} m, 2160 probes`);
  check('the innermost possible coast is outside COAST_MIN', COAST_INNER * (1 - COAST_WOBBLE) > COAST_MIN, `${(COAST_INNER * (1 - COAST_WOBBLE)).toFixed(0)} against ${COAST_MIN}`);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const r = coastRadiusAt(Math.cos(a), Math.sin(a));
    lo = Math.min(lo, r); hi = Math.max(hi, r);
  }
  check('the coast wanders rather than ruling a circle', hi - lo > 400, `${lo.toFixed(0)} to ${hi.toFixed(0)} m, a ${(hi - lo).toFixed(0)} m swing`);
  check('insideWorld agrees with WORLD_HALF', insideWorld(0, 0) && insideWorld(7999, 0) && !insideWorld(8001, 0) && !insideWorld(6000, 6000));
  const inside = clampToWorld(1000, -2000);
  check('clampToWorld leaves an inland point alone', !inside.moved && inside.x === 1000 && inside.z === -2000);
  const out = clampToWorld(20000, 0);
  check('and pulls an outside point back to the rim', out.moved && Math.abs(out.x - (WORLD_HALF - 60)) < 1e-9 && out.z === 0, `${out.x.toFixed(1)}, ${out.z.toFixed(1)}`);
}

// -------------------------------------------------------------- the lookup --
console.log('zones: zoneAt and zoneBias');
{
  for (const z of ZONES) {
    const hit = zoneAt(z.x, z.z);
    if (hit.zone.id !== z.id) { check(`the centre of ${z.id} is in ${z.id}`, false, `it is in ${hit.zone.id}`); break; }
  }
  check('every zone owns its own centre', ZONES.every((z) => zoneAt(z.x, z.z).zone.id === z.id));
  check('and the weight there is 1', ZONES.every((z) => zoneAt(z.x, z.z).weight === 1));
  // just past the reach there is nothing, and the weight ramps between
  const z0 = ZONE.ironshoulder;
  check('outside the reach the zone is gone', zoneAt(z0.x + z0.r + z0.edge + 1, z0.z)?.zone?.id !== 'ironshoulder');
  const mid = zoneAt(z0.x + z0.r + z0.edge / 2, z0.z);
  check('and half way through the edge the weight is about a half', mid.zone.id === 'ironshoulder' && mid.weight > 0.35 && mid.weight < 0.65, `${mid.weight.toFixed(3)}`);
  check('nowhere at all is null, not an empty zone', zoneAt(7000, 3000) === null || !!zoneAt(7000, 3000).zone);

  // the depth rule: a small zone laid over a big one takes its own middle
  const heartReach = ZONE.vale.r + ZONE.vale.edge;
  const mr = ZONE.millrun;
  const overlap = zoneAt(mr.x, mr.z + mr.r * 0.9);
  check('a small zone inside a big one keeps its own middle', overlap.zone.id === 'millrun', `got ${overlap.zone.id}`);
  check('and the big one keeps its own', zoneAt(0, 200).zone.id === 'vale', `heart reaches ${heartReach} m`);

  const WILD_AT = [-2200, 0];          // measured: no zone reaches it
  const wild = zoneBias(WILD_AT[0], WILD_AT[1]);
  check('unclaimed ground is still given a band', wild.id === null && Array.isArray(wild.danger) && wild.ore === WILD_ORE, `at ${WILD_AT.join(', ')}: danger ${wild.danger.join(' to ')}`);
  check('the wild band rises with distance', wildDanger(0, 0)[1] < wildDanger(0, 7000)[1], `${wildDanger(0, 0).join('-')} at home, ${wildDanger(0, 7000).join('-')} at the rim`);
  check('the heart hands back the safest band', zoneBias(0, 0).danger[1] === 1 && zoneBias(0, 0).id === 'vale');
  check('the rim hands back the worst', zoneBias(ZONE.theteeth.x, ZONE.theteeth.z).danger[0] === 5);
  // A biome override only speaks above BIOME_OVERRIDE_W. Driven both ways for
  // every zone that has one: at the centre it speaks, and on a fringe point
  // where the zone is still the winner but under the weight, it does not.
  {
    const said = [];
    let spoke = 0, quiet = 0;
    for (const z of ZONES.filter((q) => q.biome)) {
      if (zoneBias(z.x, z.z).biome === z.biome) spoke++;
      let fringe = null;
      for (let i = 0; i < 720 && !fringe; i++) {
        const a = (i / 720) * Math.PI * 2;
        for (let d = z.r; d <= z.r + z.edge; d += 10) {
          const x = z.x + Math.cos(a) * d, zz = z.z + Math.sin(a) * d;
          const h = zoneAt(x, zz);
          if (h && h.zone.id === z.id && h.weight > 0 && h.weight < BIOME_OVERRIDE_W) { fringe = [x, zz, h.weight]; break; }
        }
      }
      if (fringe && zoneBias(fringe[0], fringe[1]).biome === null) quiet++;
      said.push(`${z.id} w=${fringe ? fringe[2].toFixed(3) : 'none'}`);
    }
    const n = ZONES.filter((q) => q.biome).length;
    check('every biome override speaks at its own centre', spoke === n, `${spoke}/${n}`);
    check('and stays quiet on the fringe, under BIOME_OVERRIDE_W', quiet === n, said.join(', '));
  }
}

// --------------------------------------------------------- the ground says --
console.log('zones: what the field does with them');
{
  const snow = f.sampleAt(ZONE.frostcrown.x, ZONE.frostcrown.z);
  check('The Frostcrown really is snow', snow.biome === 'snow', `${snow.biome} at h ${snow.h.toFixed(1)}`);
  const rock = f.sampleAt(ZONE.ironshoulder.x, ZONE.ironshoulder.z);
  check('The Iron Shoulder really is mountain', rock.biome === 'mountain', `${rock.biome} at h ${rock.h.toFixed(1)}`);
  const dry = f.sampleAt(ZONE.sallowwastes.x, ZONE.sallowwastes.z);
  check('The Sallow Wastes really is desert', dry.biome === 'desert', `${dry.biome}`);
  const sample = f.sampleAt(ZONE.longdark.x, ZONE.longdark.z);
  check('a climate nudge alone moves the biome without an override', !ZONE.longdark.biome && ['boreal', 'snow', 'mountain'].includes(sample.biome), `The Long Dark is ${sample.biome}`);

  // The override does not pave over the sea or a river. Only the ground the
  // override branch can actually reach counts here: the snow line and the rock
  // line answer BEFORE it, so a river gorge at 60 m is called mountain by the
  // relief and not by any zone.
  // Only the three mountain overrides are counted for the river half: below the
  // rock line and out of the water, 'mountain' can ONLY have come from the
  // override, whereas 'desert' and 'snow' can be the climate's doing, and the
  // climate is allowed to say what the country round a river is.
  let wetOverride = 0, riverOverride = 0, wet = 0, rivers = 0;
  const ROCK_LINE = 46;
  for (const z of ZONES.filter((q) => q.biome === 'mountain')) {
    for (let i = 0; i < 4000; i++) {
      const a = (i / 400) * Math.PI * 2, d = ((i * 37) % 101) / 101 * z.r;
      const x = z.x + Math.cos(a) * d, zz = z.z + Math.sin(a) * d;
      const s = f.sampleAt(x, zz);
      if (s.water && s.river < 0.4) { wet++; if (s.biome === z.biome) wetOverride++; }
      if (s.river > 0.3 && !s.water && s.h < ROCK_LINE) { rivers++; if (s.biome === z.biome) riverOverride++; }
    }
  }
  check('no override paints over open water', wet > 0 && wetOverride === 0, `${wet} sea samples inside the three mountain zones, ${wetOverride} overridden`);
  check('and none paints over a river below the rock line', rivers > 0 && riverOverride === 0, `${rivers} river samples, ${riverOverride} overridden`);

  check('every sample carries its zone and its danger band', (() => {
    const a = f.sampleAt(0, 0), b = f.sampleAt(ZONE.theteeth.x, ZONE.theteeth.z), c = f.sampleAt(-2200, 0);
    return a.zone === 'vale' && b.zone === 'theteeth' && c.zone === null && Array.isArray(c.danger) && c.danger.length === 2;
  })(), `unclaimed ground reports zone ${f.sampleAt(-2200, 0).zone} danger ${f.sampleAt(-2200, 0).danger.join(' to ')}`);
}

// ------------------------------------------------------------- reachability --
console.log('zones: every zone can be walked to from the origin');
const REACH = (() => {
  // a coarse flood fill over 100 m cells, at sea level plus half a metre, eight
  // ways. Four way connectivity is not the right proxy at this stride: a river
  // is carved to -1.8 and 20 m wide, so at 100 m samples it reads as a broken
  // diagonal chain of holes that four way cannot step over, and a player wades
  // across it without noticing. Eight way is the coarse stand-in for "you can
  // get there"; `field.test.mjs` measures the rivers themselves.
  const STEP = 100, N = 2 * WORLD_HALF / STEP;
  const idx = (i, j) => j * (N + 1) + i;
  const H = new Float64Array((N + 1) ** 2);        // NOT Float32: SEA_LEVEL + 0.5
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    H[idx(i, j)] = f.heightAt(-WORLD_HALF + i * STEP, -WORLD_HALF + j * STEP);
  }
  const dry = (i, j) => H[idx(i, j)] >= SEA_LEVEL + 0.5;
  const seen = new Uint8Array((N + 1) ** 2);
  const st = [[N / 2, N / 2]];
  seen[idx(N / 2, N / 2)] = 1;
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let n = 0;
  while (st.length) {
    const [i, j] = st.pop(); n++;
    for (const [di, dj] of D) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a > N || b > N || seen[idx(a, b)] || !dry(a, b)) continue;
      seen[idx(a, b)] = 1; st.push([a, b]);
    }
  }
  let land = 0;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) if (dry(i, j)) land++;
  const at = (x, z) => {
    const i = Math.round((x + WORLD_HALF) / STEP), j = Math.round((z + WORLD_HALF) / STEP);
    return i >= 0 && j >= 0 && i <= N && j <= N && !!seen[idx(i, j)];
  };
  return { at, n, land, dry: (x, z) => f.heightAt(x, z) >= SEA_LEVEL + 0.5 };
})();
{
  check('the fill reached most of the world\'s land', REACH.n / REACH.land > 0.85, `${REACH.n} of ${REACH.land} 100 m land cells, ${(100 * REACH.n / REACH.land).toFixed(1)}%`);
  const unreachable = ZONES.filter((z) => !REACH.at(z.x, z.z));
  check('every zone centre is reachable on foot from the origin', unreachable.length === 0, unreachable.map((z) => z.id).join(', ') || `all ${ZONES.length}`);
  const badSites = authoredSites().filter((s) => !REACH.at(s.x, s.z));
  check('and so is every authored site', badSites.length === 0, badSites.map((s) => s.name).join(', ') || `all ${authoredSites().length}`);
  // and the other direction: a point in the ring ocean is NOT reachable
  check('the ring ocean is not reachable, so the fill means something', !REACH.at(7900, 0) && !REACH.at(0, 7900));
}

// ------------------------------------------------------- authored placement --
console.log('zones: the thirty places written down by hand');
{
  const sites = authoredSites();
  check('there are thirty of them', sites.length === 30, `${sites.length}`);
  const wet = sites.filter((s) => f.raw(s.x, s.z).h < 0.2);
  check('none of them stands in water', wet.length === 0, wet.map((s) => `${s.name} at h ${f.raw(s.x, s.z).h.toFixed(1)}`).join('; ') || 'all thirty dry');
  const inRiver = sites.filter((s) => f.raw(s.x, s.z).river > 0.15);
  check('and none in a river', inRiver.length === 0, inRiver.map((s) => s.name).join('; ') || 'all thirty clear');
  const outside = sites.filter((s) => Math.hypot(s.x - ZONE[s.zone].x, s.z - ZONE[s.zone].z) > ZONE[s.zone].r);
  check('every one stands inside the zone that wrote it down', outside.length === 0, outside.map((s) => s.name).join('; ') || 'all thirty inside');

  // one cell each, and inside the cell margin, exactly like a rolled site
  const cells = new Set();
  let clash = 0, offMargin = 0;
  for (const s of sites) {
    const cx = Math.floor(s.x / SITE_CELL), cz = Math.floor(s.z / SITE_CELL);
    const key = cx + ',' + cz;
    if (cells.has(key)) clash++;
    cells.add(key);
    const fx = s.x / SITE_CELL - cx, fz = s.z / SITE_CELL - cz;
    if (fx < 0.2 || fx > 0.8 || fz < 0.2 || fz > 0.8) offMargin++;
    if (s.flatR > 0.2 * SITE_CELL) offMargin++;
  }
  check('no two share a cell', clash === 0);
  check('every one keeps inside its cell margin, like a rolled site', offMargin === 0);

  // none of them is anywhere near the heart the saves stand in
  const nearHome = sites.filter((s) => Math.hypot(s.x, s.z) < HEART_SAFE);
  check('none of them is inside the heart', nearHome.length === 0, nearHome.map((s) => s.name).join('; ') || `nearest is ${Math.min(...sites.map((s) => Math.hypot(s.x, s.z))).toFixed(0)} m out`);

  // the field really places them, and the procedural roll for that cell is gone
  let placed = 0;
  for (const s of sites) {
    const cx = Math.floor(s.x / SITE_CELL), cz = Math.floor(s.z / SITE_CELL);
    const got = f.siteInCell(cx, cz);
    if (got && got.id === s.id && got.x === s.x && got.z === s.z) placed++;
  }
  check('the field places all thirty exactly where the table says', placed === 30, `${placed}/30`);
  check('and authoredInCell finds them by cell', sites.every((s) => {
    const a = authoredInCell(Math.floor(s.x / SITE_CELL), Math.floor(s.z / SITE_CELL));
    return a && a.id === s.id;
  }));
  check('a cell with no authored site rolls as it always did', authoredInCell(11, 7) === null && !!f.siteInCell(11, 7) === !!f.siteInCell(11, 7));
}

// -------------------------------------------------------------------- mines --
console.log('zones: an outdoor mine');
{
  const mines = authoredSites().filter((s) => s.kind === 'mine');
  check('there are seven mines', mines.length === 7, mines.map((m) => m.name).join(', '));
  let mouthsTotal = 0, seamsTotal = 0, wrongOre = 0, wrongKind = 0, dupCell = 0, dupId = 0;
  const ids = new Set(), gridCells = new Set();
  for (const m of mines) {
    const site = f.siteInCell(Math.floor(m.x / SITE_CELL), Math.floor(m.z / SITE_CELL));
    check(`${m.name} carries its band`, JSON.stringify(site.oreBand) === JSON.stringify(m.oreBand), site.oreBand.join(', '));
    mouthsTotal += site.mouths.length;
    seamsTotal += site.seams.length;
    for (const mo of site.mouths) {
      if (mo.kind !== 'cave') wrongKind++;
      if (ids.has(mo.id)) dupId++;
      ids.add(mo.id);
      const gk = mo.cx + ',' + mo.cz;
      if (gridCells.has(gk)) dupCell++;
      gridCells.add(gk);
      if (JSON.stringify(mo.oreBand) !== JSON.stringify(m.oreBand)) wrongOre++;
    }
    for (const s of site.seams) if (!m.oreBand.includes(s.ore)) wrongOre++;
  }
  check('every mine has two to four cuts', mines.every((m) => {
    const s = f.siteInCell(Math.floor(m.x / SITE_CELL), Math.floor(m.z / SITE_CELL));
    return s.mouths.length >= 2 && s.mouths.length <= 4;
  }), `${mouthsTotal} cuts over ${mines.length} mines`);
  check('every mine has four to seven surface seams', mines.every((m) => {
    const s = f.siteInCell(Math.floor(m.x / SITE_CELL), Math.floor(m.z / SITE_CELL));
    return s.seams.length >= 4 && s.seams.length <= 7;
  }), `${seamsTotal} seams`);
  check('every seam and every cut carries the zone\'s ore band and nothing else', wrongOre === 0);
  check('a cut is a cave, which is what the generator makes ore in', wrongKind === 0);
  check('no two cuts share an id', dupId === 0, `${ids.size} cuts`);
  check('and no two share a generator cell, so two cuts are not one level twice', dupCell === 0, `${gridCells.size} cells`);

  // the rarest ore in the game is on the surface of exactly one mine
  const starfall = mines.filter((m) => m.oreBand.includes('starfall'));
  check('starfall is on the surface at exactly one mine', starfall.length === 1, starfall.map((m) => `${m.name} in ${m.zone}`).join(''));

  // the geometry: cuts uphill of the yard, seams on the yard
  const deep = f.siteInCell(Math.floor(ZONE.ironshoulder.sites[0].x / SITE_CELL), Math.floor(ZONE.ironshoulder.sites[0].z / SITE_CELL));
  const raw0 = f.raw(deep.x, deep.z).h;
  let uphill = 0;
  for (const mo of deep.mouths) if (f.raw(mo.x, mo.z).h > raw0) uphill++;
  check('the cuts are up the hill from the yard', uphill === deep.mouths.length, `${uphill}/${deep.mouths.length} at ${deep.name}`);
  const flat = deep.seams.every((s) => Math.abs(s.y - deep.y) < 1.2);
  check('and the seams lie on the levelled yard', flat, deep.seams.map((s) => (s.y - deep.y).toFixed(2)).join(', '));

  // every cut on every mine stands on dry ground and above its own yard
  let wetCut = 0, rises = [];
  for (const m of mines) {
    const s = f.siteInCell(Math.floor(m.x / SITE_CELL), Math.floor(m.z / SITE_CELL));
    const yard = f.raw(s.x, s.z).h;
    for (const mo of s.mouths) {
      const sm = f.sampleAt(mo.x, mo.z);
      if (sm.water || sm.h < 0.2) wetCut++;
      rises.push(f.raw(mo.x, mo.z).h - yard);
    }
  }
  rises.sort((a, b) => a - b);
  check('not one of the twenty one cuts is in water', wetCut === 0, `${rises.length} cuts`);
  check('and every one stands above its own yard', rises[0] > 0, `the shallowest rises ${rises[0].toFixed(1)} m, the median ${rises[rises.length >> 1].toFixed(1)} m, the steepest ${rises[rises.length - 1].toFixed(1)} m`);

  // deterministic
  const a = JSON.stringify(mineParts(deep, SEED)), b = JSON.stringify(mineParts(deep, SEED));
  check('a mine lays out the same way every time', a === b);
}

console.log('zones: ore outside a mine zone stays low');
{
  // every procedural cave the world allows, and what band it was handed
  let caves = 0, rich = 0, lowOnly = 0;
  const R = Math.ceil(WORLD_HALF / SITE_CELL);
  for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
    const s = f.siteInCell(cx, cz);
    if (!s || s.kind !== 'cave' || s.authored) continue;
    caves++;
    const zn = zoneBias(s.x, s.z).id;
    const low = s.oreBand.every((o) => ['copper', 'tin', 'iron'].includes(o));
    if (low) lowOnly++; else rich++;
    if (!zn && !low) check('a cave outside every zone got a rich band', false, `${s.name} got ${s.oreBand.join(', ')}`);
  }
  // Caves are rare, and now that the world is bounded the number is countable
  // rather than notional: the roll wants a hillside between 16 and 48 m and
  // most of this world is not one. Six rolled caves inside 8 km, plus four
  // written down by hand, plus seven mines carrying twenty one cuts between
  // them: that is what the seven deep ore tiers hang off, and it is the reason
  // mines were worth authoring at all.
  check('there are procedural caves to check', caves >= 5, `${caves} rolled caves inside the world`);
  check('most of them carry only the three low ores', lowOnly / caves >= 0.5, `${lowOnly} low, ${rich} inside a richer zone`);
  check('and a cave inside a rich zone does carry it', rich > 0, `${rich} caves stand inside a zone with a deeper band`);
}

// ---------------------------------------------------------------- discovery --
console.log('zones: entering a zone fires once');
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const d = createDiscovery(f, { storeKey: 'test-sites', zoneKey: 'test-zones' });
  const z = ZONE.ironshoulder;
  check('nothing is found before you walk anywhere', d.zoneCount === 0);
  // the gate, driven false: the far fringe of the zone is not "in" it
  const fringe = zoneAt(z.x + z.r + z.edge * 0.9, z.z);
  check('the fringe of a zone is under the enter weight', fringe.weight < ZONE_ENTER_W, `${fringe.weight.toFixed(3)} against ${ZONE_ENTER_W}`);
  check('and standing there finds nothing', d.checkZone(z.x + z.r + z.edge * 0.9, z.z, 1000) === null);
  // driven true
  const got = d.checkZone(z.x, z.z, 2000);
  check('walking into the middle finds the zone', got && got.id === 'ironshoulder', got ? got.name : 'nothing');
  check('and it is remembered', d.hasZone('ironshoulder') && d.zoneCount === 1);
  check('standing in it again finds nothing', d.checkZone(z.x, z.z, 3000) === null);
  check('a different zone still fires', (() => {
    const t = d.checkZone(ZONE.frostcrown.x, ZONE.frostcrown.z, 4000);
    return t && t.id === 'frostcrown';
  })());
  check('the throttle holds the next look off', d.checkZone(ZONE.theteeth.x, ZONE.theteeth.z, 4100) === null);
  check('and lets it through once the throttle is up', (() => {
    const t = d.checkZone(ZONE.theteeth.x, ZONE.theteeth.z, 4600);
    return t && t.id === 'theteeth';
  })());
  check('and an hour in the same zone still finds nothing', d.checkZone(z.x + 10, z.z + 10, 3600000) === null);
  check('the list survives a reload', (() => {
    const e = createDiscovery(f, { storeKey: 'test-sites', zoneKey: 'test-zones' });
    return e.zoneCount === 3 && e.hasZone('ironshoulder') && e.checkZone(z.x, z.z, 9000) === null;
  })(), `saved ${store.get('test-zones')}`);
  const WILD_ZONE = [-2200, 0];
  check('zoneNow names where you are standing', d.zoneNow(z.x, z.z)?.id === 'ironshoulder' && d.zoneNow(WILD_ZONE[0], WILD_ZONE[1]) === null);
  delete globalThis.localStorage;
}

// --------------------------------------------------------------------- cost --
console.log('zones: what the lookup costs');
{
  const N = 200000;
  const t0 = performance.now();
  let sink = 0;
  for (let i = 0; i < N; i++) sink += zoneAt((i * 71) % 16000 - 8000, (i * 137) % 16000 - 8000) ? 1 : 0;
  const per = (performance.now() - t0) / N * 1000;
  check('zoneAt costs under a microsecond', per < 1, `${per.toFixed(3)} us over ${N} lookups, ${sink} of them inside a zone`);
}

// adopt: a character's own record becomes the truth and the browser keys are left alone (S1 follow-up)
{
  const f = createWorldField(7);
  const writes = [];
  // node has no localStorage; a counting stand-in is all createDiscovery needs
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { writes.push(k); mem.set(k, v); }, removeItem: (k) => mem.delete(k) };
  const store = globalThis.localStorage;
  const orig = store.setItem;
  const d = createDiscovery(f, { storeKey: 'test-sites-adopt', zoneKey: 'test-zones-adopt' });
  d.adopt(['siteA', 'siteB'], ['vale']);
  check('adopt makes the character\'s finds the finds', d.has('siteA') && d.has('siteB') && d.count === 2);
  check('and its walked zones the walked zones', d.hasZone('vale') && !d.hasZone('millrun'));
  const before = writes.length;
  // walking into a zone after adopt: the set grows, the browser key does not
  const z = ZONES.find((zn) => zn.id === 'millrun');
  const hit = d.checkZone(z.x, z.z, 1e6);
  check('a new zone is still found once', hit && hit.id === 'millrun' && d.hasZone('millrun'));
  check('and nothing was written to the browser-wide key', writes.length === before, `${writes.length - before} writes`);
  check('persistence is off after adopt, and on before it', d.persists === false && createDiscovery(f, { storeKey: 'x1', zoneKey: 'x2' }).persists === true);
  store.setItem = orig;
  delete globalThis.localStorage;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
