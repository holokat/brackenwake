// The painted map, driven through a recording context.
// Run: node src/game/map_paint.test.mjs
//
// There is no canvas in node and there is no eye in a test, so what is measured
// here is the CALL LOG: every fill, every stroke, every word, with the colour
// and the dash pattern that was set when it happened. That is enough to prove
// the things that actually go wrong with a map:
//
//   * a realm that is drawn but never named, or named when nobody has walked it
//   * a place that is drawn before it has been found
//   * sea painted over land, which is the bug the whole water mask exists for
//   * roads drawn as a solid line, or not drawn at all
//   * hachures on flat ground, or none on a cliff
//   * a river drawn where the field says there is no river
//   * two runs of the same map that are not the same map
//
// Every gate below is driven BOTH WAYS. A test that only proves the true case
// passes just as happily when the gate is `return true`.

globalThis.performance ||= { now: () => Date.now() };

const { createWorldField } = await import('../world/field.js');
const { SITE_CELL } = await import('../world/sitegrid.js');
const { roadsForCell } = await import('../world/roads.js');
const { REALM_ZONES, authoredSites, ZONE } = await import('../world/zones.js');
const paint = await import('./map_paint.js');
const guide = await import('../mmo/greenwold_guide.js');

const {
  paintMap, paintGround, paintMarks, viewFor, toPx, labelFor, makeCache,
  placesIn, riverLines, roadLines, cellsOf, peaksIn, sampleGround,
  RIDGE_SLOPE, RIVER_MIN, MAP_PAINT_AUDIT, auditMapPaint,
} = paint;

const WORLD_SEED = 20260904;
let bad = 0, pass = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : bad++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---------------------------------------------------------- the recorder --
//
// Everything the painter is allowed to ask for, and nothing else. If the
// painter ever reaches for a gradient, a clip or a filter, this throws instead
// of quietly drawing a different picture in node than it draws in the browser.

function recorder() {
  const log = [];
  const rects = [];        // every fillRect, in order, with the colour it took
  const texts = [];        // every fillText and strokeText
  const strokes = [];      // every stroke, with its dash and the path it drew
  const images = [];       // every drawImage, with the rectangle it landed in
  const st = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '10px serif', textAlign: 'start', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter', letterSpacing: '0px',
  };
  let dash = [];
  let path = [];
  const r = (v) => Math.round(v * 100) / 100;
  const sizeOf = (f) => { const m = /([\d.]+)px/.exec(f || ''); return m ? +m[1] : 10; };
  const say = (...a) => log.push(a.join(' '));
  const forbid = (name) => () => { throw new Error(`map_paint asked the context for ${name}, which not every context has`); };

  const g = {
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; say('fillStyle', v); },
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; say('strokeStyle', v); },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; say('lineWidth', r(v)); },
    get globalAlpha() { return st.globalAlpha; }, set globalAlpha(v) { st.globalAlpha = v; say('alpha', r(v)); },
    get font() { return st.font; }, set font(v) { st.font = v; say('font', v); },
    get textAlign() { return st.textAlign; }, set textAlign(v) { st.textAlign = v; say('align', v); },
    get textBaseline() { return st.textBaseline; }, set textBaseline(v) { st.textBaseline = v; say('base', v); },
    get lineCap() { return st.lineCap; }, set lineCap(v) { st.lineCap = v; say('cap', v); },
    get lineJoin() { return st.lineJoin; }, set lineJoin(v) { st.lineJoin = v; say('join', v); },
    get letterSpacing() { return st.letterSpacing; }, set letterSpacing(v) { st.letterSpacing = v; say('track', v); },

    save() { say('save'); }, restore() { say('restore'); },
    translate(x, y) { say('translate', r(x), r(y)); },
    rotate(a) { say('rotate', r(a)); },
    scale(x, y) { say('scale', r(x), r(y)); },
    setLineDash(d) { dash = Array.isArray(d) ? d.slice() : []; say('dash', dash.map(r).join(',')); },
    getLineDash() { return dash.slice(); },

    beginPath() { path = []; say('begin'); },
    closePath() { say('close'); },
    moveTo(x, y) { path.push([x, y]); say('M', r(x), r(y)); },
    lineTo(x, y) { path.push([x, y]); say('L', r(x), r(y)); },
    quadraticCurveTo(a, b, x, y) { path.push([x, y]); say('Q', r(a), r(b), r(x), r(y)); },
    bezierCurveTo(a, b, c, d, x, y) { path.push([x, y]); say('C', r(a), r(b), r(c), r(d), r(x), r(y)); },
    rect(x, y, w, h) { path.push([x, y], [x + w, y + h]); say('rect', r(x), r(y), r(w), r(h)); },
    arc(x, y, rr, a0, a1) { path.push([x, y]); say('arc', r(x), r(y), r(rr), r(a0), r(a1)); },
    ellipse(x, y, rx, ry, ro, a0, a1) { path.push([x, y]); say('ell', r(x), r(y), r(rx), r(ry), r(ro), r(a0), r(a1)); },
    fill() { say('fill', st.fillStyle, r(st.globalAlpha)); },
    stroke() { strokes.push({ dash: dash.slice(), style: st.strokeStyle, width: st.lineWidth, pts: path.slice() }); say('stroke', st.strokeStyle, r(st.lineWidth), dash.map(r).join(',')); },

    fillRect(x, y, w, h) { rects.push({ x, y, w, h, fill: st.fillStyle }); say('fillRect', r(x), r(y), r(w), r(h), st.fillStyle); },
    strokeRect(x, y, w, h) { say('strokeRect', r(x), r(y), r(w), r(h)); },
    clearRect() { say('clearRect'); },

    measureText(t) { return { width: String(t).length * sizeOf(st.font) * 0.56 }; },
    fillText(t, x, y) { texts.push({ op: 'fill', text: String(t), x, y, font: st.font, colour: st.fillStyle }); say('fillText', String(t), r(x), r(y), st.fillStyle); },
    strokeText(t, x, y) { texts.push({ op: 'stroke', text: String(t), x, y, font: st.font }); say('strokeText', String(t), r(x), r(y)); },

    createLinearGradient: forbid('a linear gradient'),
    createRadialGradient: forbid('a radial gradient'),
    createPattern: forbid('a pattern'),
    clip: forbid('a clip'),
    // MAP3: the hand painted sheet, kept with the rectangle it landed in. It is
    // the ONE image this file draws, and everything else here still refuses.
    drawImage(img, x, y, w, h) { images.push({ img, x, y, w, h }); say('drawImage', r(x), r(y), r(w), r(h)); },
  };
  g.log = log; g.rects = rects; g.texts = texts; g.strokes = strokes; g.images = images;
  g.drawOps = () => log.filter((l) => /^(fill |stroke |fillRect|fillText|strokeText)/.test(l)).length;
  /** The colour of the ground under a pixel: the first composed cell over it. */
  g.groundAt = (px, py) => {
    for (const q of rects) {
      if (px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h) return q.fill;
    }
    return null;
  };
  return g;
}

const rgbOf = (css) => {
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(String(css || ''));
  return m ? [+m[1], +m[2], +m[3]] : null;
};
/** A composed colour that is more blue than red is water; a warm one is not. */
const readsAsWater = (css) => { const c = rgbOf(css); return c ? c[2] - c[0] > 12 : false; };

const field = createWorldField(WORLD_SEED);
const AUTHORED = authoredSites();
const ALL_PLACES = new Set(AUTHORED.map((s) => s.id));

console.log('\nmap_paint: the painted map\n');
console.log(`  the audit at import: ${MAP_PAINT_AUDIT.biomes} biomes, ${MAP_PAINT_AUDIT.realms} realms, ${MAP_PAINT_AUDIT.kinds} kinds of place, every one with a glyph, a colour, a size and a place in the draw order`);

// ------------------------------------------------------ 1. the realm names --

console.log('\nthe nine realms, named and not named');
{
  const t0 = performance.now();
  const gKnown = recorder();
  const known = paintMap(gKnown, { field, px: 1024, py: 1024, known: { zones: true, places: ALL_PLACES }, rolled: false });
  const msKnown = performance.now() - t0;

  const gDark = recorder();
  const dark = paintMap(gDark, { field, px: 1024, py: 1024, known: { zones: [], places: [] }, rolled: false });

  let onceAll = true, missing = [];
  for (const zn of REALM_ZONES) {
    const want = labelFor(zn.name);
    const n = gKnown.texts.filter((t) => t.op === 'fill' && t.text === want).length;
    if (n !== 1) { onceAll = false; missing.push(`${zn.id}:${n}`); }
  }
  ck('every realm is named exactly once when all nine are walked', onceAll, missing.length ? missing.join(' ') : `9 of 9`);

  let anyDark = 0;
  for (const zn of REALM_ZONES) {
    anyDark += gDark.texts.filter((t) => t.text === labelFor(zn.name)).length;
  }
  ck('no realm is named when none of them has been walked', anyDark === 0, `${anyDark} names on an unwalked world`);
  ck('an unwalked world is still hatched, so the paper is not simply blank',
    dark.blankStrokes > 200 && known.blankStrokes === 0,
    `unwalked ${dark.blankStrokes} hatch strokes, walked ${known.blankStrokes}`);

  // and no place is named either, because none has been found
  const placeNames = new Set(AUTHORED.map((s) => labelFor(s.name)));
  const leaked = gDark.texts.filter((t) => placeNames.has(t.text)).length;
  ck('no place is named on an undiscovered world', leaked === 0, `${leaked} leaked`);
  console.log(`       the walked world at 1024 px: ${msKnown.toFixed(0)} ms, ${known.samples} samples, ${known.rects} ground rects, ${known.places} places, ${known.realms} realm names`);
}

// ------------------------------------------------------------ 2. one place --

console.log('\none place, found and not found');
{
  const site = AUTHORED.find((s) => s.sub === 'hearthhome');
  const view = viewFor({ px: 900, py: 900, x: site.x, z: site.z, w: 3000, h: 3000 });
  const opts = { field, view, rolled: false, regions: false };

  const gFound = recorder();
  const found = paintMarks(gFound, { ...opts, known: { zones: true, places: [site.id] } });
  const gLost = recorder();
  const lost = paintMarks(gLost, { ...opts, known: { zones: true, places: [] } });

  const want = labelFor(site.name);
  const named = gFound.texts.filter((t) => t.op === 'fill' && t.text === want).length;
  ck('a found place is named once', named === 1, `"${want}" x${named}`);
  ck('a found place is drawn', found.places === 1 && gFound.drawOps() > 8, `${gFound.drawOps()} draw calls`);
  ck('an unfound place draws nothing at all', lost.places === 0 && gLost.drawOps() === 0, `${gLost.drawOps()} draw calls`);
  ck('an unfound place is not named', gLost.texts.length === 0, `${gLost.texts.length} words`);

  // the glyph is where the place is, not at the origin
  const [px, py] = toPx(view, site.x, site.z);
  let near = 0;
  for (const l of gFound.log) {
    const m = /^[ML] ([\d.-]+) ([\d.-]+)/.exec(l);
    if (m && Math.hypot(+m[1] - px, +m[2] - py) < 40) near++;
  }
  ck("the glyph is drawn at the place's own pixel", near > 4, `${near} path points within 40 px of (${px.toFixed(0)}, ${py.toFixed(0)})`);
}

// ------------------------------------------------------------- 3. the sea --

console.log('\nthe sea, where the field says water and nowhere else');
{
  const view = viewFor({ px: 1024, py: 1024 });
  const g = recorder();
  paintGround(g, { field, view, known: { zones: true, places: ALL_PLACES } });

  // ten probes: five points the field calls open water, five it calls land, all
  // of them clear of the shore by two sample strides so the blurred edge is not
  // what is being measured
  const stride = 16000 / 192;
  const wet = [], dry = [];
  const clear = (x, z, want) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const s = field.sampleAt(x + dx * stride * 2, z + dz * stride * 2);
      if ((s.biome === 'ocean') !== want) return false;
    }
    return true;
  };
  for (let j = 0; j < 60 && (wet.length < 5 || dry.length < 5); j++) {
    for (let i = 0; i < 60 && (wet.length < 5 || dry.length < 5); i++) {
      const x = -7000 + i * 237, z = -7000 + j * 237;
      const s = field.sampleAt(x, z);
      if (s.biome === 'ocean' && wet.length < 5 && clear(x, z, true)) wet.push([x, z]);
      // snow is white blue on paper and honestly ambiguous under this probe, so
      // the land points are taken off ground that is plainly not the sea
      else if (s.biome !== 'ocean' && s.biome !== 'snow' && dry.length < 5 && clear(x, z, false)) dry.push([x, z]);
    }
  }
  let wetOk = 0, dryOk = 0;
  const shown = [];
  for (const [x, z] of wet) {
    const [px, py] = toPx(view, x, z);
    const c = g.groundAt(px, py);
    if (readsAsWater(c)) wetOk++; else shown.push(`water at ${x},${z} painted ${c}`);
  }
  for (const [x, z] of dry) {
    const [px, py] = toPx(view, x, z);
    const c = g.groundAt(px, py);
    if (!readsAsWater(c)) dryOk++; else shown.push(`land at ${x},${z} painted ${c}`);
  }
  ck('all five open water probes are painted as water', wetOk === 5, `${wetOk}/5`);
  ck('none of the five land probes is painted as water', dryOk === 5, `${dryOk}/5${shown.length ? '  ' + shown.join('; ') : ''}`);
}

// ----------------------------------------------------------- 4. the roads --

console.log('\nthe roads, dashed, one line per road roads.js holds');
{
  // a view around a cell that really owns roads, found by walking the world the
  // way the map does rather than by picking a number
  let hit = null;
  const c0 = Math.floor(-8000 / SITE_CELL), c1 = Math.floor(8000 / SITE_CELL);
  for (let cz = c0; cz <= c1 && !hit; cz++) {
    for (let cx = c0; cx <= c1 && !hit; cx++) {
      if (roadsForCell(field, cx, cz).length) hit = [cx, cz];
    }
  }
  const view = viewFor({ px: 800, py: 800, x: (hit[0] + 0.5) * SITE_CELL, z: (hit[1] + 0.5) * SITE_CELL, w: 2600, h: 2600 });
  const g = recorder();
  const stats = paintGround(g, { field, view, known: { zones: true, places: [] } });

  // what roads.js says is in this view, counted here and not taken on trust
  const owned = new Set();
  for (const [cx, cz] of cellsOf(view)) for (const rd of roadsForCell(field, cx, cz)) owned.add(rd.id);
  const drawn = roadLines(field, view);
  ck('every road roads.js owns in the view is drawn', drawn.length === owned.size && stats.roads === owned.size,
    `${stats.roads} drawn, ${owned.size} owned by the cells`);

  const dashed = g.strokes.filter((s) => s.dash.length && s.style === paint.ROAD_INK);
  ck('every road is drawn as a dashed line', dashed.length === owned.size, `${dashed.length} dashed strokes for ${owned.size} roads`);
  ck('a dashed road has more than one point in it', dashed.every((s) => s.pts.length >= 2), `shortest ${Math.min(...dashed.map((s) => s.pts.length))} points`);

  // and the other way: with roads off, no dashed tan stroke is made at all
  const gOff = recorder();
  paintGround(gOff, { field, view, known: { zones: true, places: [] }, roads: false });
  const off = gOff.strokes.filter((s) => s.dash.length && s.style === paint.ROAD_INK).length;
  ck('with the roads turned off, none is drawn', off === 0, `${off} strokes`);
}

// ---------------------------------------------------- 5. the ridge hachure --

console.log('\nthe hachures, on the slope and not on the flat');
{
  // the steepest ground in the world, found by walking it
  let steep = null, best = 0;
  for (let j = 0; j < 120; j++) {
    for (let i = 0; i < 120; i++) {
      const x = -6500 + i * 108, z = -6500 + j * 108;
      const h = field.heightAt(x, z);
      const s = Math.hypot((field.heightAt(x + 30, z) - h) / 30, (field.heightAt(x, z + 30) - h) / 30);
      if (s > best) { best = s; steep = [x, z]; }
    }
  }
  const gSteep = recorder();
  const onSlope = paintGround(gSteep, {
    field, x: steep[0], z: steep[1], w: 900, h: 900, px: 600, py: 600,
    samples: 48, known: { zones: true, places: [] },
  });
  // the farm's own disc: flat by construction, out to HOME_RADIUS
  const gFlat = recorder();
  const onFlat = paintGround(gFlat, {
    field, x: 0, z: 0, w: 160, h: 160, px: 600, py: 600,
    samples: 48, known: { zones: true, places: [] },
  });
  ck('a slope steeper than the threshold is hachured', onSlope.hachures > 20,
    `${onSlope.hachures} of ${onSlope.hachureSites} lattice points, at ${steep[0]},${steep[1]} where the ground falls ${best.toFixed(2)} m per metre (threshold ${RIDGE_SLOPE})`);
  ck('flat ground is not hachured at all', onFlat.hachures === 0,
    `${onFlat.hachures} of ${onFlat.hachureSites} lattice points on the flat home disc`);
  ck('and no mountain is drawn on the flat either', onFlat.peaks === 0, `${onFlat.peaks} peaks`);
}

// ---------------------------------------------------------- 6. the rivers --

console.log('\nthe rivers, proved against the field at every point of them');
{
  const view = viewFor({ px: 1400, py: 1400 });
  // BOTH paths: the plain tracer, and the one paintGround actually uses, which
  // throws contour points out cheaply against the ground grid before paying for
  // a field sample. If the cheap refusal ever starts refusing real rivers, the
  // two counts part company here.
  const grid = sampleGround(field, view, { samples: 192, known: { zones: true } });
  const rv = riverLines(field, view, { known: { zones: true } });
  const rvFast = riverLines(field, view, { known: { zones: true }, grid });
  let onRiver = 0, off = 0;
  for (const line of rv.lines) {
    for (const [px, py] of line) {
      const wx = view.x0 + (px / view.px) * view.w;
      const wz = view.z0 + (py / view.py) * view.h;
      const s = field.sampleAt(wx, wz);
      if (s.river >= RIVER_MIN && s.biome !== 'ocean') onRiver++; else off++;
    }
  }
  ck('every point of every drawn river is a river in the field', off === 0, `${onRiver} points on a river, ${off} not`);

  let offFast = 0, onFast = 0;
  for (const line of rvFast.lines) {
    for (const [px, py] of line) {
      const s = field.sampleAt(view.x0 + (px / view.px) * view.w, view.z0 + (py / view.py) * view.h);
      if (s.river >= RIVER_MIN && s.biome !== 'ocean') onFast++; else offFast++;
    }
  }
  ck('and the same is true down the fast path the paint uses', offFast === 0 && onFast > 0,
    `${onFast} points, ${offFast} not, after refusing ${rvFast.skipped} contour points against the ground grid`);

  // and how much of the field's own river network the tracer found. This is the
  // completeness half, and it is a MEASUREMENT, not a pass mark pulled out of
  // the air: the number is printed and the gate is only that most of it is found
  // measured on the FAST path, because that is the one the paint uses
  const pxOf = (x, z) => toPx(view, x, z);
  const pts = [];
  for (const line of rvFast.lines) for (const p of line) pts.push(p);
  let cells = 0, near = 0;
  for (let j = 0; j < 150; j++) {
    for (let i = 0; i < 150; i++) {
      const x = -7200 + i * 96, z = -7200 + j * 96;
      const s = field.sampleAt(x, z);
      if (s.river < 0.6 || s.biome === 'ocean') continue;
      cells++;
      const [px, py] = pxOf(x, z);
      for (const p of pts) if (Math.hypot(p[0] - px, p[1] - py) < 14) { near++; break; }
    }
  }
  const share = cells ? near / cells : 0;
  ck('most of the field\'s own river network is on the map', share > 0.7,
    `${near} of ${cells} strong river cells are within 160 m of a drawn line (${(share * 100).toFixed(0)}%)`);
  ck('the fast path loses no more of it than the slow one', rvFast.lines.length >= rv.lines.length * 0.92,
    `${rvFast.lines.length} rivers fast against ${rv.lines.length} slow`);

  // both directions: a realm nobody has walked keeps its rivers to itself
  const dark = riverLines(field, view, { known: { zones: [] } });
  const wild = dark.lines.length;
  ck('an unwalked world draws only the rivers of unclaimed country', wild < rv.lines.length,
    `${wild} lines unwalked against ${rv.lines.length} walked`);
}

// ------------------------------------------------- 7. the same map, twice --

console.log('\nthe same options, the same map');
{
  const opts = () => ({ field: createWorldField(WORLD_SEED), px: 700, py: 700, known: { zones: true, places: ALL_PLACES }, rolled: true });
  const a = recorder(); paintMap(a, opts());
  const b = recorder(); paintMap(b, opts());
  let first = -1;
  for (let i = 0; i < Math.max(a.log.length, b.log.length); i++) {
    if (a.log[i] !== b.log[i]) { first = i; break; }
  }
  ck('two runs make the same calls in the same order', first === -1 && a.log.length === b.log.length,
    first === -1 ? `${a.log.length} calls, identical` : `first difference at call ${first}: "${a.log[first]}" against "${b.log[first]}"`);
}

// ------------------------------------------------------------ 8. the cache --

console.log('\nthe cache: finding a hut must not re-sample the world');
{
  const cache = makeCache();
  const view = viewFor({ px: 1024, py: 1024 });
  const known = { zones: true, places: new Set() };
  const g1 = recorder();
  const cold = paintMap(g1, { field, view, known, cache, rolled: false });
  known.places.add(AUTHORED[0].id);
  const g2 = recorder();
  const warm = paintMap(g2, { field, view, known, cache, rolled: false });
  ck('the second paint reuses the sampled ground', warm.cached === true && cold.cached === false, `cold ${cold.cached}, warm ${warm.cached}`);
  ck('the second paint does no field work at all', warm.msField < 1, `${warm.msField.toFixed(2)} ms of field work against ${cold.msField.toFixed(0)} ms cold`);
  ck('and the new place is now on it', warm.places === 1 && cold.places === 0, `${cold.places} then ${warm.places}`);
  console.log(`       cold ${cold.ms.toFixed(0)} ms (${cold.msField.toFixed(0)} ms of it the field), warm ${warm.ms.toFixed(0)} ms, of which the marks are ${warm.msMarks.toFixed(1)} ms`);
}

// ------------------------------------------ 9. a realm nobody has walked in --

console.log('\none realm walked, the eight beside it blank');
{
  const view = viewFor({ px: 900, py: 900 });
  const g = recorder();
  const one = paintGround(g, { field, view, known: { zones: ['greenwold'], places: [] } });
  ck('only the walked realm is named', one.realms === 1, `${one.realms} names`);
  ck('the eight unwalked are hatched', one.blankStrokes > 500, `${one.blankStrokes} hatch strokes`);

  // the ground of an unwalked realm is paper, not country: probe the middle of
  // one of them and check the colour is warm paper and not its own biome
  const ash = ZONE.ashenthrone;
  const [px, py] = toPx(view, ash.x, ash.z);
  const c = rgbOf(g.groundAt(px, py));
  ck('and the ground of an unwalked realm is blank paper', !!c && c[0] > c[2] && c[0] > 120,
    `the Ashen Throne is painted rgb(${c ? c.join(',') : '?'})`);
}

// ------------------------------------------------------------ 10. the size --

console.log('\nthe cost of the whole world at two thousand pixels');
{
  // TWICE, on a fresh field each time and with no cache, because the first
  // paint in a node process is paying for the JIT as well as for the map and
  // saying only that number would flatter nobody. Neither is a real canvas:
  // node has none here, so what these measure is the painter's own arithmetic
  // plus the cost of recording every call it makes.
  const run = () => {
    const g = recorder();
    const t0 = performance.now();
    const s = paintMap(g, { field: createWorldField(WORLD_SEED), px: 2048, py: 2048, samples: 208, known: { zones: true, places: ALL_PLACES }, rolled: false });
    return { g, s, ms: performance.now() - t0 };
  };
  const cold = run();
  const warm = run();
  const { g, s } = warm;
  const ms = warm.ms;
  console.log(`       cold ${cold.ms.toFixed(0)} ms, warm ${warm.ms.toFixed(0)} ms`);
  console.log(`       ${ms.toFixed(0)} ms in all: ${s.msField.toFixed(0)} ms sampling ${s.samples} points of the field, `
    + `${(s.msGround - s.msField).toFixed(0)} ms drawing the ground, ${s.msMarks.toFixed(1)} ms the marks`);
  console.log(`       ${s.rects} ground rectangles, ${s.hachures} hachures, ${s.peaks} mountains, ${s.canopy} canopy clumps, `
    + `${s.texture} ground marks, ${s.rivers} rivers, ${s.roads} roads, ${s.waves} waves, ${s.places} places, ${s.labelled} of them named`);
  console.log(`       ${g.log.length} context calls in all`);
  ck('the whole world is painted in under 900 ms through a recording context', ms < 900 && cold.ms < 900,
    `cold ${cold.ms.toFixed(0)} ms, warm ${ms.toFixed(0)} ms`);
  ck('every realm is named on it', s.realms === 9, `${s.realms} of 9`);
  ck('every authored place in the world is drawn', s.places === AUTHORED.length, `${s.places} of ${AUTHORED.length}`);
}

// --------------------------------------------------------- 11. the audit --

console.log('\nthe audit at import, driven the other way');
{
  ck('auditMapPaint passes on the file as it stands', (() => { try { auditMapPaint(); return true; } catch { return false; } })());
  const saved = paint.GLYPH.town;
  delete paint.GLYPH.town;
  let threw = false;
  try { auditMapPaint(); } catch { threw = true; }
  paint.GLYPH.town = saved;
  ck('and fails the moment a kind of place loses its glyph', threw);
  ck('and passes again once it is put back', (() => { try { auditMapPaint(); return true; } catch { return false; } })());
}


// ------------------------------------------- 12. the relief and the sun ----
//
// MAP2. A sculpted world is one biome, one climate and one flat sheet, and the
// whole of what the user has made in it is HEIGHT. So the compose reads the
// heights twice: how high the ground stands, and which way it leans under a
// north west sun. Measured on a cone with no noise in it at all, so the numbers
// below are the shading and nothing else.

console.log('\nthe relief: a hill is lighter at the top and dark on its far side');
{
  const H = 200, R = 400;
  /** A cone 200 m high and 400 m across, on a sheet 4 m above the sea. */
  const cone = {
    seed: 7,
    sampleAt(x, z) {
      const d = Math.hypot(x, z);
      return {
        h: 4 + (d < R ? H * (1 - d / R) : 0),
        biome: 'meadow', water: false, river: 0, road: 0, land: 1,
        temp: 0.5, moist: 0.5, realm: null, zone: null,
      };
    },
  };
  const view = viewFor({ px: 600, py: 600, x: 0, z: 0, w: 1200, h: 1200 });
  const g = recorder();
  const res = paintGround(g, { field: cone, view, samples: 120, known: { zones: true, places: [] }, rivers: false, roads: false });
  const lum = (css) => { const c = rgbOf(css); return c ? c[0] + c[1] + c[2] : null; };
  const at = (x, z) => { const [px, py] = toPx(view, x, z); return g.groundAt(px, py); };

  const top = at(0, 0);
  const flat = at(520, 0);
  ck('the top of the hill is painted lighter than the flat around it',
    lum(top) > lum(flat) + 20, `top ${top} (${lum(top)}), flat ${flat} (${lum(flat)})`);
  // and the other direction: dig the same shape down and it does not lighten
  const pit = { seed: 7, sampleAt: (x, z) => ({ ...cone.sampleAt(x, z), h: 4 - (cone.sampleAt(x, z).h - 4) * 0.02 }) };
  const gp = recorder();
  paintGround(gp, { field: pit, view, samples: 120, known: { zones: true, places: [] }, rivers: false, roads: false });
  const [cx0, cy0] = toPx(view, 0, 0);
  ck('and ground that was never raised is not lightened', lum(gp.groundAt(cx0, cy0)) < lum(top),
    `${gp.groundAt(cx0, cy0)} against ${top}`);

  // the sun: two points on the same contour, one facing the light and one away
  const nw = at(-200 * Math.SQRT1_2, -200 * Math.SQRT1_2);
  const se = at(200 * Math.SQRT1_2, 200 * Math.SQRT1_2);
  ck('the north west flank is lit and the south east one is in shadow',
    lum(nw) > lum(se) + 40, `north west ${nw} (${lum(nw)}), south east ${se} (${lum(se)})`);
  ck('and both of them are at the same height, so it is the SUN doing it',
    Math.abs(cone.sampleAt(-141, -141).h - cone.sampleAt(141, 141).h) < 1e-9,
    `${cone.sampleAt(-141, -141).h.toFixed(1)} m either side`);
  ck('the light comes from where SUN_DIR says it does',
    paint.SUN_DIR[0] < 0 && paint.SUN_DIR[1] < 0
    && Math.abs(Math.hypot(paint.SUN_DIR[0], paint.SUN_DIR[1]) - 1) < 1e-9,
    `(${paint.SUN_DIR.map((v) => v.toFixed(3)).join(', ')})`);
  ck('and the shading is on the grid the compose reads', res.samples > 0 && !!paint.HILLSHADE && !!paint.RELIEF_LIGHT,
    `hillshade ${paint.HILLSHADE}, relief ${paint.RELIEF_LIGHT}`);

  // flat ground takes no sun at all, which is the third direction
  const flatField = { seed: 7, sampleAt: () => ({ h: 4, biome: 'meadow', water: false, river: 0, road: 0, land: 1, temp: 0.5, moist: 0.5, realm: null, zone: null }) };
  const gf = recorder();
  paintGround(gf, { field: flatField, view, samples: 120, known: { zones: true, places: [] }, rivers: false, roads: false });
  const a = gf.groundAt(...toPx(view, -141, -141));
  const b = gf.groundAt(...toPx(view, 141, 141));
  ck('and on ground with no slope in it the two sides are painted the same', a === b, `${a} against ${b}`);
}

// ------------------------------------------- 13. the terrain in the key ----

console.log('\nthe cache key carries the hand cut ground');
{
  ck('a field with no strokes has one key', paint.terrainKey({}) === paint.terrainKey({}), paint.terrainKey({}));
  ck('and a stroke moves it',
    paint.terrainKey({ terrainEdits: { version: 1 } }) !== paint.terrainKey({ terrainEdits: { version: 2 } }),
    `${paint.terrainKey({ terrainEdits: { version: 1 } })} then ${paint.terrainKey({ terrainEdits: { version: 2 } })}`);
  ck('and so does a change of base height, which moves no stroke at all',
    paint.terrainKey({ terrainEdits: { version: 9 }, sculpt: { height: 6, ground: 'grass', snowLine: 180, beachLine: 1 } })
    !== paint.terrainKey({ terrainEdits: { version: 9 }, sculpt: { height: 40, ground: 'grass', snowLine: 180, beachLine: 1 } }));

  // and the whole way through: the same view, the same options, a moved version
  const moving = { version: 1 };
  const hill = { r: 300, h: 0 };
  const walking = {
    seed: 11,
    get terrainEdits() { return moving; },
    sampleAt(x, z) {
      const d = Math.hypot(x, z);
      return {
        h: 4 + (d < hill.r ? hill.h * (1 - d / hill.r) : 0),
        biome: 'meadow', water: false, river: 0, road: 0, land: 1,
        temp: 0.5, moist: 0.5, realm: null, zone: null,
      };
    },
  };
  const view = viewFor({ px: 400, py: 400, x: 0, z: 0, w: 1000, h: 1000 });
  const cache = makeCache();
  const opts = () => ({ field: walking, view, samples: 80, known: { zones: true, places: [] }, rivers: false, roads: false, cache });
  const cold = paintGround(recorder(), opts());
  const warm = paintGround(recorder(), opts());
  ck('the same ground twice is painted from the cache', cold.cached === false && warm.cached === true);
  hill.h = 180; moving.version = 2;
  const g = recorder();
  const hot = paintGround(g, opts());
  ck('and a stroke sends it back to the field', hot.cached === false);
  const lum = (css) => { const c = rgbOf(css); return c ? c[0] + c[1] + c[2] : null; };
  ck('so the hill that was raised is on the map', lum(g.groundAt(200, 200)) > lum(g.groundAt(380, 200)),
    `middle ${g.groundAt(200, 200)}, edge ${g.groundAt(380, 200)}`);
  ck('and the paint after it is cached again', paintGround(recorder(), opts()).cached === true);
}

// --------------------------------------------- 14. the editor's spaces ----

console.log('\nthe spaces the editor lays out');
{
  const audit = paint.auditSpaceTiles();
  ck('every automatic tile on disk agrees with the tile size this file draws',
    audit.bad.length === 0, audit.bad.join('; ') || `${audit.tiles} tiles, ${audit.named} named spaces`);
  ck('the tile reach is the half diagonal of the tile, so its corners are inside it',
    paint.SPACE_TILE_R === Math.ceil((paint.SPACE_TILE_M / 2) * Math.SQRT2), `${paint.SPACE_TILE_M} m square, ${paint.SPACE_TILE_R} m reach`);
  // driven the other way: a tile that does NOT agree is named, not swallowed
  const wrong = paint.auditSpaceTiles({ tile_1_1: { id: 'tile_1_1', name: 'wrong', at: { x: 0, z: 0 }, radius: 182 } });
  ck('and a tile standing somewhere its own name does not say is named by the audit',
    wrong.bad.length === 1 && /tile_1_1/.test(wrong.bad[0]), wrong.bad[0]);

  const made = {
    tile: { id: 'tile_2_5', name: 'Tile 2, 5', at: { x: 640, z: 1408 }, radius: paint.SPACE_TILE_R },
    named: { id: 'the_long_meadow', name: 'The Long Meadow', at: { x: 700, z: 1500 }, radius: 90 },
    far: { id: 'tile_30_30', name: 'far away', at: { x: 7808, z: 7808 }, radius: paint.SPACE_TILE_R },
  };
  const near = paint.spacesIn({ x: 640, z: 1408, w: 1000, h: 1000 }, made);
  ck('the spaces inside a rectangle come back and the ones outside it do not',
    near.length === 2 && !near.some((s) => s.id === 'tile_30_30'), near.map((s) => s.id).join(', '));
  ck('a tile knows it is a tile and carries its own square',
    near.find((s) => s.tile).tx === 2 && near.find((s) => s.tile).tz === 5, JSON.stringify(near.find((s) => s.tile)));
  ck('a named space is not a tile and is a circle', near.find((s) => !s.tile).r === 90);
  ck('and the biggest is drawn first, so the smallest name lands on top',
    near[0].r >= near[near.length - 1].r, near.map((s) => s.r).join(' >= '));
  ck('a space with no place at all is dropped rather than drawn at the origin',
    paint.spaceShape({ id: 'x', name: 'x' }) === null && paint.spaceShape(null) === null);
}


// ------------------------------------------------------ MAP3: the guide ----
//
// The three painters the zone map and the minimap share. They are here and not
// in either of those files because there must be exactly ONE piece of code that
// decides what a guide boundary looks like, and this is it.
//
// Every one of them takes an `at(x, z)` rather than a view, so the checks below
// hand over a plain linear mapping and read the pixels straight back out.

console.log('\nMAP3: the guide painters');
{
  const {
    paintGuideArt, paintGuideZones, paintGuideWays,
    GUIDE_INK, GUIDE_INK_HOT, GUIDE_ROAD_INK, GUIDE_RIVER_INK,
    GUIDE_MIN_PX, GUIDE_NAME_PX, GUIDE_DASH, GUIDE_RING_DASH,
  } = paint;
  const { GUIDE_ZONES, GUIDE_BY_ID, GUIDE_ROADS, GUIDE_RIVER, artRect, worldToImage } = guide;

  // 800 px over 6 km, centred on the realm: 7.5 m to the pixel
  const MPP = 7.5, SIZE = 800;
  const at = (x, z) => [x / MPP + SIZE / 2, z / MPP + SIZE / 2];
  const ART = { state: 'ready', img: { width: 1676, height: 942 }, w: 1676, h: 942 };

  // ---- the picture --------------------------------------------------------
  {
    const g = recorder();
    const res = paintGuideArt(g, { art: ART, at, w: SIZE, h: SIZE });
    ck('the sheet is drawn once, into the rectangle its own frame says',
      res.drawn === 1 && g.images.length === 1, `${g.images.length} images`);
    const r = artRect();
    const [ax, ay] = at(r.x0, r.z0);
    ck('and that rectangle is the whole sheet, corner to corner',
      Math.abs(g.images[0].x - ax) < 1e-9 && Math.abs(g.images[0].y - ay) < 1e-9
      && Math.abs(g.images[0].w - r.w / MPP) < 1e-9 && Math.abs(g.images[0].h - r.h / MPP) < 1e-9,
      `${g.images[0].w.toFixed(1)} by ${g.images[0].h.toFixed(1)} px for ${r.w.toFixed(0)} by ${r.h.toFixed(0)} m`);
    ck('a place on the sheet lands on the same pixel as the place in the world',
      GUIDE_ZONES.every((zn) => {
        const [u, v] = worldToImage(zn.x, zn.z);
        const [px, py] = at(zn.x, zn.z);
        return Math.abs(g.images[0].x + u * g.images[0].w - px) < 1e-9
          && Math.abs(g.images[0].y + v * g.images[0].h - py) < 1e-9;
      }), `${GUIDE_ZONES.length} spaces`);

    // and every way it can refuse, each of which says why rather than throwing
    ck('a picture that has not loaded is not drawn, and says which state it is in',
      paintGuideArt(recorder(), { art: { state: 'missing' }, at }).why === 'missing');
    ck('a context that cannot draw an image is not asked to',
      paintGuideArt({}, { art: ART, at }).why === 'this context cannot draw an image');
    ck('no mapping at all is refused rather than drawn at the origin',
      paintGuideArt(recorder(), { art: ART }).why === 'no mapping was handed over');
    const far = (x, z) => [x / MPP + 90000, z / MPP];
    ck('and a picture that falls off this map is not drawn',
      paintGuideArt(recorder(), { art: ART, at: far, w: SIZE, h: SIZE }).why === 'the picture is off this map');
  }

  // ---- the boundaries -----------------------------------------------------
  {
    const g = recorder();
    const res = paintGuideZones(g, { at, mpp: MPP, w: SIZE, h: SIZE });
    ck('all twelve are outlined and all twelve are named at this scale',
      res.drawn === 12 && res.named === 12 && res.off === 0 && res.small === 0, JSON.stringify(res));
    ck('the Standing Hedge alone is drawn twice, as a ring',
      res.rings === 1 && g.log.filter((l) => /^arc /.test(l)).length === 13,
      `${g.log.filter((l) => /^arc /.test(l)).length} arcs for 12 spaces`);
    ck('a space is dashed and a ring is dotted, so the two never read alike',
      g.strokes.some((st) => st.style === GUIDE_INK && st.dash.join() === GUIDE_DASH.join())
      && g.strokes.some((st) => st.style === GUIDE_INK && st.dash.join() === GUIDE_RING_DASH.join()));
    ck('every name is written at the middle of its own space',
      GUIDE_ZONES.every((zn) => {
        const [px, py] = at(zn.x, zn.z);
        const t = g.texts.find((q) => q.op === 'fill' && q.text === zn.name.toUpperCase());
        return t && Math.abs(t.x - px) < 1e-9 && Math.abs(t.y - py) < 1e-9;
      }));

    // the two thresholds, driven on BOTH sides of the line: a space smaller
    // than GUIDE_MIN_PX is dropped, one between the two is drawn and not named
    const tiny = [{ id: 't', name: 'Tiny', x: 0, z: 0, r: (GUIDE_MIN_PX - 0.5) * MPP, annulus: false, band: 0, models: [], wanted: [] }];
    ck('a boundary too small to read is not drawn at all',
      paintGuideZones(recorder(), { at, mpp: MPP, w: SIZE, h: SIZE, zones: tiny }).drawn === 0);
    const mid = [{ ...tiny[0], r: ((GUIDE_MIN_PX + GUIDE_NAME_PX) / 2) * MPP }];
    const midRes = paintGuideZones(recorder(), { at, mpp: MPP, w: SIZE, h: SIZE, zones: mid });
    ck('and one too small to hold its own name is drawn without it',
      midRes.drawn === 1 && midRes.named === 0, JSON.stringify(midRes));
    const big = [{ ...tiny[0], r: (GUIDE_NAME_PX + 1) * MPP }];
    ck('and one just big enough gets its name, so the threshold is a threshold',
      paintGuideZones(recorder(), { at, mpp: MPP, w: SIZE, h: SIZE, zones: big }).named === 1);

    // the hover
    const hot = recorder();
    paintGuideZones(hot, { at, mpp: MPP, w: SIZE, h: SIZE, hover: 'chalkpits' });
    ck('exactly one space is picked out when one is hovered, and none when none is',
      hot.strokes.filter((st) => st.style === GUIDE_INK_HOT).length === 1
      && g.strokes.filter((st) => st.style === GUIDE_INK_HOT).length === 0,
      `${hot.strokes.filter((st) => st.style === GUIDE_INK_HOT).length} of ${hot.strokes.length} strokes`);
    ck('and its name is written in the same bright gold, so the picture and the word agree',
      hot.texts.some((t) => t.op === 'fill' && t.text === 'THE CHALK PITS' && t.colour === GUIDE_INK_HOT));

    // `centresOnly`, which is the minimap's rule. The view is over the Long
    // Meadow, where the Standing Hedge's circle crosses the square and its
    // middle is 156 px off the right hand edge: the loose rule draws it, the
    // minimap's rule does not, because a name pinned to the rim is a lie.
    const near = (x, z) => [(x - GUIDE_BY_ID.longmeadow.x) / MPP + 110, (z - GUIDE_BY_ID.longmeadow.z) / MPP + 110];
    const loose = paintGuideZones(recorder(), { at: near, mpp: MPP, w: 220, h: 220 });
    const strict = paintGuideZones(recorder(), { at: near, mpp: MPP, w: 220, h: 220, centresOnly: true });
    ck('centresOnly drops a space whose middle is off the square, and the loose rule keeps it',
      strict.drawn < loose.drawn && strict.drawn > 0,
      `${loose.drawn} where the circle touches, ${strict.drawn} where the middle is on`);

    // and the name clamp, which is the other minimap rule
    const clamped = recorder();
    paintGuideZones(clamped, {
      at: near, mpp: MPP, w: 220, h: 220, centresOnly: true, nameSize: 8.5,
      clampX: (px, w) => Math.max(2 + w / 2, Math.min(220 - 2 - w / 2, px)),
    });
    ck('and with a clamp handed over, no letter of a name leaves the square',
      clamped.texts.filter((t) => t.op === 'fill').every((t) => {
        const w = String(t.text).length * 8.5 * 0.56;
        return t.x - w / 2 >= 0 && t.x + w / 2 <= 220;
      }), clamped.texts.filter((t) => t.op === 'fill').map((t) => t.text).join(', '));
  }

  // ---- the traced ways ----------------------------------------------------
  {
    const g = recorder();
    const res = paintGuideWays(g, { at });
    ck('the two roads and the river are three lines, and no more',
      res.roads === 2 && res.river === 1 && g.strokes.length === 3, JSON.stringify(res));
    ck('and the river is drawn in its own ink, not the roads\'',
      g.strokes.filter((st) => st.style === GUIDE_RIVER_INK).length === 1
      && g.strokes.filter((st) => st.style === GUIDE_ROAD_INK).length === 2);
    ck('every point of every one of them is its own world point through the mapping',
      [...GUIDE_ROADS, GUIDE_RIVER].every((way) => {
        const st = g.strokes.find((q) => q.pts.length === way.pts.length
          && Math.abs(q.pts[0][0] - at(way.pts[0].x, way.pts[0].z)[0]) < 1e-9);
        return st && st.pts.every((pt, i) => {
          const [px, py] = at(way.pts[i].x, way.pts[i].z);
          return Math.abs(pt[0] - px) < 1e-9 && Math.abs(pt[1] - py) < 1e-9;
        });
      }), `${res.points} points`);
    ck('and none of them is dashed, because a traced line is not a road',
      g.strokes.every((st) => st.dash.length === 0));
  }
}

console.log(`\n${pass} ok, ${bad} failed\n`);
process.exit(bad ? 1 : 0);
