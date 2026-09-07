// The Map panel, the cost of drawing it, and the column of words beside it.
// Run: node src/game/win_map.test.mjs
//
// MAP2 added a zoom, a pan, the hand cut ground and the release gate's veil, so
// the middle third of this file is about a VIEW: that a pixel means the same
// world point at 1 km as it does at 16, that zooming on the cursor holds the
// point under the cursor, that the ground is repainted when the terrain moves
// and NOT when it has not, and that a hill raised with the editor's own brush
// comes out brighter on the map than the flat beside it. Every gate is driven
// both ways.
//
// The second half builds the REAL panel against a small fake document and
// fires REAL click events at the rows, through the real `setWaypoint`. A row
// that was only checked by reading the model would prove that a list exists,
// not that clicking a line of it moves the compass.

// --- a document, small enough to read ---------------------------------------
function makeDom() {
  const make = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '', hidden: false,
      listeners: {},
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join(' ') : text; },
      // faithful to the real thing: setting textContent EMPTIES the node, which
      // is how render() clears the column before it rebuilds it
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; },
      },
      setAttribute(k, v) { node.dataset[k] = v; },
      removeAttribute() {},
      appendChild(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.push(c); return c;
      },
      append(...cs) { for (const c of cs) node.appendChild(c); },
      addEventListener(name, fn) { (node.listeners[name] ||= []).push(fn); },
      removeEventListener() {},
      fire(name, ev) { for (const fn of node.listeners[name] || []) fn(ev || { preventDefault() {}, stopPropagation() {} }); },
    };
    if (String(tag).toLowerCase() === 'canvas') {
      node.width = 640; node.height = 640;
      node.getContext = () => recorder();
      node.getBoundingClientRect = () => ({ left: 0, top: 0, width: node.width, height: node.height });
    }
    return node;
  };
  const byId = new Map();
  return {
    createElement: make,
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { if (c.id) byId.set(c.id, c); return c; } },
    body: make('body'),
  };
}
globalThis.document = makeDom();

const {
  drawMap, shadeFor, toPixel, toWorld, cellsIn, pickAt, asHas, arrowTip,
  foundPlaces, knownOf, homeKnown, sideModel, bearingWord, wayText, dangerWords, legendColour, auditMapWords,
  eventMarks, marksOf, EVENT_COLOUR, BOSS_COLOUR,
  BIOME_COLOUR, SITE_COLOUR, DANGER_TINT, GROUND_WORD, KIND_WORD, POINT_WORD, LEGEND,
  ROAD_COLOUR, WAYPOINT_COLOUR, PLAYER_COLOUR, HATCH_INK, HATCH_WASH, SPACE_INK, OPEN_LINE,
  MAP_SPAN, MAP_SAMPLES, MAP_STRIDE, MAP_BUDGET_MS, REDRAW_S, PICK_PX, panel,
  MAP_MIN_SPAN, MAP_MAX_SPAN, HOME_SPAN, ZOOM_RATE, DRAG_PX, SPACE_SPAN, REPAINT_S,
  FADE_ALPHA, VEIL_COLOUR, MAP_SAMPLES_NEAR, MAP_SAMPLES_FAR, NEAR_BUDGET_MS,
  clampSpan, clampView, homeView, zoomView, zoomCentre, panView, samplesFor,
  spanText, scaleBarFor, realmOf, zoneOpen, openDiscs, auditOpenDiscs, onOpenGround,
  pickGuideAt, layerFor, LAYERS, LAYER_WORD, GUIDE_PICK_PX,
} = await import('./win_map.js');
const { createWorldField, BIOMES } = await import('../world/field.js');
const { createTerrainEdits } = await import('../world/terrain_edits.js');
const { SITE_CELL } = await import('../world/sitegrid.js');
const { ZONES, ZONE, WORLD_HALF, authoredSites, DANGER_WORD } = await import('../world/zones.js');
const { OPEN_REALMS, openAt } = await import('../mmo/release.js');
const { spacesIn, auditSpaceTiles, SPACE_TILE_M, makeCache, terrainKey } = await import('./map_paint.js');
const { distanceText, POINTS } = await import('./compass.js');
const {
  GUIDE_ZONES, GUIDE_BY_ID, GUIDE_ART, GUIDE_AUDIT, GUIDE_RIVER,
  imageToWorld, worldToImage, guideZoneAt, guideArt, loadGuideArt, resetGuideArt,
} = await import('../mmo/greenwold_guide.js');
const { FOOTPRINT } = await import('../mmo/plans/footprints.js');
const {
  GUIDE_INK, GUIDE_INK_HOT, GUIDE_ROAD_INK, GUIDE_RIVER_INK, GUIDE_TERRAIN_ALPHA,
} = await import('./map_paint.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const field = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });

/**
 * Every site standing on open ground, in cell order.
 *
 * The map draws no place in a realm the release gate has shut, so a test that
 * picked the first site it found anywhere in the world would be driving the
 * one case the map deliberately refuses. Walked out of the field itself, out
 * to the far side of the open discs, so nothing here is a typed number.
 */
const openSites = (() => {
  const out = [];
  const reach = Math.max(...openDiscs().map((d) => Math.hypot(d.x, d.z) + d.r), 2600);
  const c = Math.ceil(reach / SITE_CELL);
  for (let cz = -c; cz <= c; cz++) {
    for (let cx = -c; cx <= c; cx++) {
      const st = field.siteInCell(cx, cz);
      if (st && onOpenGround(st.x, st.z)) out.push(st);
    }
  }
  return out;
})();
/** The view the panel opens on for a player standing at the origin. */
const OPEN_VIEW = { cx: 0, cz: 0, span: HOME_SPAN };

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

/**
 * The same recording, but keeping the GEOMETRY of every fill and every word.
 *
 * The proxy above counts calls, which is enough for "was the arrow drawn"; it
 * is not enough for "is the hill brighter than the flat beside it", which is a
 * question about one pixel. This one keeps every fillRect with the colour it
 * took and every fillText with the point it landed on, so a test can read the
 * composed ground back at a world point and compare two of them.
 */
function painter() {
  const rects = [];
  const texts = [];
  const strokes = [];
  const st = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px', textAlign: 'start', globalAlpha: 1 };
  let path = [];
  let dash = [];
  const g = {
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    get font() { return st.font; }, set font(v) { st.font = v; },
    get textAlign() { return st.textAlign; }, set textAlign(v) { st.textAlign = v; },
    set textBaseline(v) {}, set lineCap(v) {}, set lineJoin(v) {}, set letterSpacing(v) {},
    get globalAlpha() { return st.globalAlpha; }, set globalAlpha(v) { st.globalAlpha = v; alphas.push(v); },
    // MAP3: the hand painted sheet. Kept with the rectangle it was laid into,
    // because "is the arrow on the painted village" is a question about where
    // the picture landed and not about whether it was drawn at all.
    drawImage(img, x, y, w, h) { images.push({ img, x, y, w, h }); },
    save() {}, restore() {}, translate(x, y) { moves.push([x, y]); }, rotate(a) { turns.push(a); }, scale() {}, clip() {},
    setLineDash(d) { dash = Array.isArray(d) ? d.slice() : []; }, getLineDash() { return dash.slice(); },
    beginPath() { path = []; }, closePath() {},
    moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); },
    quadraticCurveTo(a, b, x, y) { path.push([x, y]); },
    bezierCurveTo(a, b, c, d, x, y) { path.push([x, y]); },
    rect(x, y, w, h) { path.push([x, y], [x + w, y + h]); rectsPath.push({ x, y, w, h }); },
    arc(x, y, r) { path.push([x, y]); arcs.push({ x, y, r, style: st.strokeStyle }); },
    ellipse(x, y) { path.push([x, y]); },
    fill(rule) { fills.push({ rule: rule || 'nonzero', style: st.fillStyle }); },
    stroke() { strokes.push({ style: st.strokeStyle, width: st.lineWidth, dash: dash.slice(), pts: path.slice() }); },
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, fill: st.fillStyle }); },
    strokeRect() {},
    clearRect() {},
    measureText(t) { return { width: String(t).length * 6 }; },
    fillText(t, x, y) { texts.push({ text: String(t), x, y, colour: st.fillStyle }); },
    strokeText(t, x, y) { texts.push({ text: String(t), x, y, colour: null }); },
  };
  const fills = [], arcs = [], rectsPath = [], moves = [], turns = [], images = [], alphas = [];
  g.rects = rects; g.texts = texts; g.strokes = strokes; g.fills = fills; g.arcs = arcs;
  g.rectsPath = rectsPath; g.moves = moves; g.turns = turns; g.images = images; g.alphas = alphas;
  g.words = () => texts.map((t) => t.text);
  /** The composed ground under a pixel: the FIRST rect over it, which is the
   *  compose's own cell, because the compose runs before anything else. */
  g.groundAt = (px, py) => {
    for (const q of rects) if (px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h) return q.fill;
    return null;
  };
  return g;
}
const rgbOf = (css) => {
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(String(css || ''));
  return m ? [+m[1], +m[2], +m[3]] : null;
};
/** How light a composed colour is, so two pieces of ground can be compared. */
const lightOf = (css) => { const c = rgbOf(css); return c ? c[0] + c[1] + c[2] : null; };

console.log('win_map: the map is the whole world');
{
  check('the span is the world, not a window on it', MAP_SPAN === 2 * WORLD_HALF && MAP_SPAN === 16000, `${MAP_SPAN} m across, WORLD_HALF ${WORLD_HALF}`);
  check('the stride follows from the span and the count', MAP_STRIDE === MAP_SPAN / MAP_SAMPLES && MAP_SAMPLES === MAP_SAMPLES_FAR,
    `${MAP_STRIDE.toFixed(0)} m a sample at the whole world`);
  const res = drawMap(recorder(), { field, cx: 0, cz: 0, size: 640 });
  check('the sample count is what the stride says', res.samples === MAP_SAMPLES * MAP_SAMPLES, `${res.samples} samples`);
  // the four corners of the map are outside the world, so they are all sea
  const c = WORLD_HALF * 0.98;
  check('every corner of the map is open ocean, so the coast is inside it',
    [[c, c], [-c, c], [c, -c], [-c, -c]].every(([x, z]) => field.sampleAt(x, z).water));
}

console.log('win_map: the stride is a measured number, not a guess');
{
  // WARM, not cold. The first draw in a node process pays for the JIT and for
  // the field's own site cache as well as for the map, and it is worth about
  // a hundred milliseconds of the number below; quoting that as the cost of a
  // redraw would be quoting the cost of starting node. The panel redraws every
  // two seconds while it is open, so a warm draw is the one a player pays for.
  field.sampleAt(0, 0);                       // warm the road and site caches once
  const centres = [[1200, -700], [300, 200], [-600, 1100]];
  for (const [cx, cz] of centres) drawMap(recorder(), { field, cx, cz, size: 640 });
  const runs = [];
  for (const [cx, cz] of centres) runs.push(drawMap(recorder(), { field, cx, cz, size: 640 }));
  const worst = Math.max(...runs.map((r) => r.ms));
  const best = Math.min(...runs.map((r) => r.ms));
  check('a 16 km map, zones and all, draws inside the budget', worst < MAP_BUDGET_MS,
    `${MAP_SAMPLES}x${MAP_SAMPLES} samples at ${MAP_STRIDE.toFixed(0)} m: ${runs.map((r) => r.ms.toFixed(1)).join(', ')} ms, worst ${worst.toFixed(1)} of a ${MAP_BUDGET_MS} ms budget`);
  // and the cost is linear in the sample count, so the budget is a real budget.
  // Both halves are measured at the SAME centre and both warm, or what is
  // compared is a cold site cache against a warm one and not two sample counts.
  const at = { field, cx: centres[0][0], cz: centres[0][1], size: 640 };
  drawMap(recorder(), { ...at, samples: Math.round(MAP_SAMPLES / 2) });
  const half = drawMap(recorder(), { ...at, samples: Math.round(MAP_SAMPLES / 2) });
  const full = drawMap(recorder(), at);
  check('halving the stride quarters the samples', half.samples * 4 === MAP_SAMPLES * MAP_SAMPLES);
  // and costs less of the thing the sample count actually buys. NOT the whole
  // draw: measured at 16 km, the roads, the river tracing and the hundred and
  // four zone discs are most of it and none of them is a function of the
  // sample count, so a check on the total was measuring the machine's mood.
  check('and reads less of the field for it', half.msField < full.msField,
    `${half.msField.toFixed(0)} ms of field work against ${full.msField.toFixed(0)}, of ${half.ms.toFixed(0)} and ${full.ms.toFixed(0)} ms of draw`);
  const noZones = drawMap(recorder(), { ...at, zones: false });
  check('the zones can be switched off, and they are not what costs the time', noZones.zones === 0 && noZones.ms < MAP_BUDGET_MS, `${noZones.ms.toFixed(1)} ms without them, ${full.ms.toFixed(0)} ms with`);
}

console.log('win_map: what it draws');
{
  const g = recorder();
  const res = drawMap(g, { field, cx: 0, cz: 0, size: 640, yaw: 0.5, discovered: [], zonesFound: [] });
  // the ground is painted by map_paint.js now (M4): parchment, coast, forest and
  // relief are fills and strokes, not one cell per sample, so the check is that
  // the paper was laid down at all and the field was read once per sample
  check('the painted ground lays down paper and marks', g.calls.fillRect >= 1 && res.samples > 0, `${g.calls.fillRect} fills, ${res.samples} samples`);
  check('the player arrow is drawn', g.calls.moveTo >= 1 && g.calls.restore >= 2);
  // the scale bar writes its own label, and MAP3 writes the guide's twelve
  // names, which are not discovery: the painted guide is a plan for building
  // and says the same thing whether or not a character has walked anywhere. So
  // what is checked is that no PLACE and no REGION is named, which is the rule
  // that matters, and separately that the guide names really are there.
  const guideNames = new Set(GUIDE_ZONES.map((z) => z.name.toUpperCase()));
  const named = g.texts.filter((t) => t !== res.scale.label && !guideNames.has(t));
  check('no site and no region is named when none is found', named.length === 0, named.join(', '));
  check('and the guide names ARE written, because a guide is not a discovery',
    g.texts.filter((t) => guideNames.has(t)).length === res.guide.named && res.guide.named > 0,
    `${res.guide.named} of ${GUIDE_ZONES.length} named at ${MAP_SPAN} m across`);
  check('and the count of found places is nothing', res.sites === 0);
  check('every zone that fits on the map is drawn', res.zones === ZONES.length, `${res.zones} of ${ZONES.length}`);
  check('and none of them is named, because none has been walked into', res.named === 0);
  check('the scale bar is drawn and says its own distance', !!res.scale && res.scale.px > 0 && /km|m$/.test(res.scale.label), `${res.scale.label} over ${res.scale.px.toFixed(0)} px`);
}

console.log('win_map: a zone you have walked into is named, one you have not is hatched');
{
  // The zones named on this map are the OPEN ones, so the pair driven here is
  // the Greenwold and one of its own subzones, read off the table rather than
  // typed, and the pair that must stay silent is a closed realm.
  const subs = ZONES.filter((z) => z.parent === 'greenwold');
  check('the open realm has subzones to name', subs.length >= 2, `${subs.length} inside ${ZONE.greenwold.name}`);
  const known = drawMap(recorder(), { field, cx: 0, cz: 0, size: 640, zonesFound: ['greenwold', subs[0].id] });
  check('two found open zones are two named zones', known.named === 2, `${known.named} named of ${known.zones}`);
  const g = recorder();
  drawMap(g, { field, cx: 0, cz: 0, size: 640, zonesFound: [subs[0].id] });
  check('the found one is written on the map', g.texts.includes(subs[0].name), `"${subs[0].name}"`);
  check('and the unfound one is not', !g.texts.includes(ZONE.greenwold.name));
  // hatching is strokes inside a clip, so unknown country costs many more lines
  const opens = ZONES.filter(zoneOpen).map((z) => z.id);
  const hatched = recorder(); drawMap(hatched, { field, cx: 0, cz: 0, size: 640, zonesFound: [] });
  const clear = recorder(); drawMap(clear, { field, cx: 0, cz: 0, size: 640, zonesFound: opens });
  check('unknown open country is hatched and known country is not', hatched.calls.moveTo > clear.calls.moveTo + 100,
    `${hatched.calls.moveTo} line starts hatched against ${clear.calls.moveTo} clear`);
  check('a Set of zone ids works as well as a list', drawMap(recorder(), { field, cx: 0, cz: 0, size: 640, zonesFound: new Set(['greenwold']) }).named === 1);
  check('every danger tier has a tint', [1, 2, 3, 4, 5].every((t) => Array.isArray(DANGER_TINT[t]) && DANGER_TINT[t].length === 3));
  check('and the heart is greener than the rim', DANGER_TINT[1][1] > DANGER_TINT[5][1] && DANGER_TINT[5][0] > DANGER_TINT[1][0]);
}

console.log('win_map: discovered sites, and only those');
{
  const found = openSites.slice(0, 4);
  check('the open realm has sites to find', found.length >= 3, `${found.length} inside the open ground`);
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
  const mine = authoredSites().find((s) => s.kind === 'mine' && openAt(s.x, s.z));
  check('the open realm has a way into the ground in it', !!mine, mine && mine.name);
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

console.log('win_map: clicking sets it, at every zoom');
{
  const site = openSites[0];
  const [px, py] = toPixel(site.x, site.z, 0, 0, 640);
  const hit = pickAt(px, py, { field, cx: 0, cz: 0, size: 640, discovered: [site.id], zonesFound: [] });
  check('clicking a discovered site picks it', hit && hit.kind === 'site' && hit.id === site.id && hit.x === site.x, `${hit && hit.name}`);
  check('clicking one you have not found picks nothing there',
    pickAt(px, py, { field, cx: 0, cz: 0, size: 640, discovered: [], zonesFound: [] }) === null);
  // the middle of the map is the player, and the player is in the heart
  const heart = pickAt(320, 320, { field, cx: 0, cz: 0, size: 640, discovered: [], zonesFound: ['greenwold'] });
  check('but the zone under the click, once walked, is picked instead',
    heart && heart.kind === 'zone' && heart.id === 'greenwold' && heart.x === 0 && heart.z === 0, JSON.stringify(heart));
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

  // THE ZOOM. The pixel a place stands at moves with the view, so the click
  // has to be read through the same view the picture was drawn with. Every
  // span below is driven from a DIFFERENT centre as well, so a bug that
  // ignored the pan would not be hidden by a centre that happens to be zero.
  const near = openSites.find((s) => Math.hypot(s.x - site.x, s.z - site.z) > 600) || openSites[1];
  const rows = [];
  let hitAll = 0, missAll = 0;
  for (const span of [MAP_MIN_SPAN, 2000, HOME_SPAN, MAP_MAX_SPAN]) {
    const view = clampView({ cx: site.x + 120, cz: site.z - 90, span });
    const [zx, zy] = toPixel(site.x, site.z, view.cx, view.cz, 640, view.span);
    const got = pickAt(zx, zy, { field, cx: view.cx, cz: view.cz, span: view.span, size: 640, discovered: [site.id, near.id] });
    if (got && got.kind === 'site' && got.id === site.id) hitAll++;
    // a pixel a long way off the place is not the place, at any zoom
    const off = pickAt(zx + PICK_PX + 6, zy + PICK_PX + 6, { field, cx: view.cx, cz: view.cz, span: view.span, size: 640, discovered: [site.id, near.id] });
    if (!off || off.kind !== 'site') missAll++;
    rows.push(`${span} m: (${zx.toFixed(1)}, ${zy.toFixed(1)}) -> ${got ? got.name : 'nothing'}`);
  }
  check('a click lands on the place it points at, at four spans and four centres', hitAll === 4, rows.join('; '));
  check('and a click beside it lands on no place at any of them', missAll === 4);

  // and a realm the gate has shut is not clickable even when it is walked
  const shut = ZONES.find((z) => !zoneOpen(z) && !z.parent);
  const shutView = { cx: shut.x, cz: shut.z, span: HOME_SPAN };
  const [sx, sy] = toPixel(shut.x, shut.z, shutView.cx, shutView.cz, 640, shutView.span);
  check('the world has a realm behind the gate to try', !!shut, shut && shut.name);
  check('a closed realm cannot be clicked, walked or not',
    pickAt(sx, sy, { field, cx: shutView.cx, cz: shutView.cz, span: shutView.span, size: 640, zonesFound: ZONES.map((z) => z.id) }) === null);
  check('and with the rule switched off it can, so the gate is what is refusing it',
    pickAt(sx, sy, { field, cx: shutView.cx, cz: shutView.cz, span: shutView.span, size: 640, zonesFound: ZONES.map((z) => z.id), openOnly: false })?.kind === 'zone');
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
  const site = openSites[0];
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
  // the panel opens on the Greenwold at HOME_SPAN, so the pixel a place stands
  // at is read through THAT view and not through the whole world
  const view = stub.viewNow();
  check('the panel opens on the view homeView describes', view.span === HOME_SPAN && view.cx === 0 && view.cz === 0, JSON.stringify(view));
  const [px, py] = toPixel(site.x, site.z, view.cx, view.cz, 640, view.span);
  const wp = stub.clickAt({ clientX: px, clientY: py });
  check('a click on a found place sets character.waypoint', !!wp && !!character.waypoint && character.waypoint.name === site.name, JSON.stringify(character.waypoint));
  check('and the panel says so', /Waypoint set on/.test(stub._say.textContent), stub._say.textContent);
  check('and the HUD is told too', said.length === 1 && said[0].includes(site.name), said[0]);
  const miss = stub.clickAt({ clientX: 5, clientY: 5 });
  check('a click on nothing sets nothing and says why',
    miss === null && character.waypoint.name === site.name && /Nothing there/.test(stub._say.textContent), stub._say.textContent);
}

// ---------------------------------------------------------------------------
// The column beside the map.

/** Every node under `root`, so a test can count what a player would count. */
function walk(node, out = []) {
  out.push(node);
  for (const c of node.children || []) walk(c, out);
  return out;
}
const rowsOf = (root, cls) => walk(root).filter((n) => n.className.split(' ').includes(cls));
const textOf = (root) => walk(root).map((n) => (n.children.length ? '' : n.textContent)).join(' | ');

/** Three sites the world really has on OPEN ground, and three open zones. */
const someSites = openSites.filter((s) => !s.authored).slice(0, 3);
/** A place with a roof, so the "nearest town" line can be measured and not skipped. */
const someTown = openSites.find((s) => s.kind === 'town') || null;
/**
 * Three regions to walk into, taken off the open realms rather than typed: the
 * realm itself and two of its subzones. The map has no row for a closed one, so
 * a test that walked into the Boneyard would be checking a row that is gone.
 */
const WALKED = ['greenwold', ...ZONES.filter((z) => z.parent === 'greenwold').slice(0, 2).map((z) => z.id)];
/** Every zone the map has a row for at all. */
const OPEN_ZONES = ZONES.filter(zoneOpen);

function makePanel(character, extra = {}) {
  const said = [];
  const touched = [];
  const root = document.createElement('div');
  const p = Object.create(panel);
  const ctx = {
    runtime: { field },
    player: { pos: { x: 0, z: 0 }, yaw: 0 },
    character,
    state: { touch: (k) => touched.push(k) },
    hud: { toast: (t) => said.push(t) },
    ...extra,
  };
  p.build(root, ctx);
  p.redraw();
  return { p, root, ctx, said, touched };
}

console.log('win_map: the column beside the map');
{
  const character = {
    discovered: [someSites[0].id, someSites[1].id],
    zones: [...WALKED],
    waypoint: null,
  };
  const { p, root } = makePanel(character);
  const m = p.lastSide;
  check('the panel is two columns now, not a picture and a footer', rowsOf(root, 'bw-map-cols').length === 1 && rowsOf(root, 'bw-map-side').length === 1);
  check('there is a row for every region of an OPEN realm and none for the rest',
    rowsOf(root, 'bw-map-region').length === OPEN_ZONES.length && OPEN_ZONES.length < ZONES.length,
    `${rowsOf(root, 'bw-map-region').length} rows of ${OPEN_ZONES.length} open, out of ${ZONES.length} in the world`);
  check('three walked, the rest of the open ones not', m.walked === 3 && m.regions.filter((r) => !r.known).length === OPEN_ZONES.length - 3, `${m.walked} walked`);
  check('the walked ones are drawn as rows you can click', rowsOf(root, 'bw-map-region').filter((r) => r.className.includes('pick')).length === 3);
  check('and the rest are dimmed', rowsOf(root, 'bw-map-region').filter((r) => r.className.includes('off')).length === OPEN_ZONES.length - 3);
  // two found, plus the home realm's authored places, which are on the map
  // from the first morning (knownOf): counted, never assumed
  const expectRows = new Set([someSites[0].id, someSites[1].id, ...homeKnown()]).size;
  check('two places found, plus the home places, is that many rows', rowsOf(root, 'bw-map-place').length === expectRows, `${rowsOf(root, 'bw-map-place').length} rows, expected ${expectRows}`);
  check('and the footer counts the same', p.lastDraw.sites === expectRows && p.lastDraw.sites === m.places.length, `footer ${p.lastDraw.sites}, list ${m.places.length}`);
  check('the key has one swatch per row', rowsOf(root, 'sw').length === LEGEND.length, `${rowsOf(root, 'sw').length} swatches of ${LEGEND.length}`);
  check('every region row is sorted by distance', m.regions.every((r, i) => i === 0 || m.regions[i - 1].dist <= r.dist));
  check('and so is every place', m.places.every((r, i) => i === 0 || m.places[i - 1].dist <= r.dist));
  check('the header names the region you are standing in', m.here.name === ZONE.greenwold.name && m.here.line === ZONE.greenwold.line, m.here.name);
  check('and says the ground under you in words', !!m.here.ground && Object.values(GROUND_WORD).includes(m.here.ground), m.here.ground);
  // The Greenwold is a two tier realm (1 to 2), so its header says both ends.
  // Read off the zone rather than typed, so widening a band again changes the
  // expectation with it.
  check('and the danger band in the game words, never a bare number',
    m.here.danger === dangerWords(ZONE.greenwold.danger) && m.here.danger.includes(DANGER_WORD[1]) && !/\d/.test(m.here.danger),
    m.here.danger);
}

console.log('win_map: an unwalked region keeps its name, exactly as the map hatches it');
{
  const character = { discovered: [], zones: [...WALKED], waypoint: null };
  const { root, p } = makePanel(character);
  const shown = textOf(root);
  // a home place's name is on the page from the first morning (its row in
  // the places list), so the names checked are the unwalked regions that are
  // not also a home place
  // a space the editor has made is named on the page too, and a tile is named
  // after its own coordinates, so only ZONE names are checked here
  const hidden = OPEN_ZONES.filter((z) => !WALKED.includes(z.id) && !homeKnown().has(`z:${z.id}`));
  const leaked = hidden.filter((z) => shown.includes(z.name));
  check('not one of the unwalked names is anywhere on the page', leaked.length === 0, leaked.map((z) => z.name).join(', ') || `${hidden.length} names checked`);
  // A REGION ROW, not the whole page: a place can share a name with a region in
  // a realm that is shut (there is a shrine called the Sunken Shrine standing on
  // open ground and a subzone of the same name in the Verdant Deep), and it is
  // the ROW that the gate is supposed to have taken away.
  const closed = ZONES.filter((z) => !zoneOpen(z));
  const regionText = rowsOf(root, 'bw-map-region').map((r) => r.textContent).join(' | ');
  const shut = closed.filter((z) => regionText.includes(z.name));
  check('and no realm behind the release gate has a row at all', shut.length === 0, shut.map((z) => z.name).join(', ') || `${closed.length} closed regions checked`);
  const named = WALKED.filter((id) => shown.includes(ZONE[id].name));
  check('and all three walked ones are', named.length === 3, named.join(', '));
  check('an unwalked row says the word instead', shown.includes('unwalked'));
  check('the model carries no name and no id for one', p.lastSide.regions.filter((r) => !r.known).every((r) => r.name === null && r.id === null));
  check('and no unwalked row carries a zone id in the DOM', rowsOf(root, 'bw-map-region').filter((r) => r.className.includes('off')).every((r) => !r.dataset.zone));
  check('while a walked row does', rowsOf(root, 'bw-map-region').filter((r) => r.className.includes('pick')).every((r) => WALKED.includes(r.dataset.zone)));
  // the other direction: walk into every open one and every one of them is named
  const all = makePanel({ discovered: [], zones: ZONES.map((z) => z.id), waypoint: null });
  const everything = textOf(all.root);
  check('walk into all of them and every open region is named', OPEN_ZONES.every((z) => everything.includes(z.name)),
    `${OPEN_ZONES.length} regions`);
  const allRegionText = rowsOf(all.root, 'bw-map-region').map((r) => r.textContent).join(' | ');
  check('and the closed ones still have no row, walked or not',
    ZONES.filter((z) => !zoneOpen(z)).every((z) => !allRegionText.includes(z.name)));
  check('and not one region row is dimmed any more', rowsOf(all.root, 'bw-map-region').every((r) => r.className.includes('pick') && !r.className.includes('off')));
  // the word is still in the key, where it explains the hatching, and nowhere else
  check('the word unwalked is left only in the key', walk(all.root).filter((n) => !n.children.length && n.textContent === 'unwalked').length === 1);
}

console.log('win_map: a row click and a map click write the same field');
{
  const character = { discovered: [someSites[0].id], zones: [...WALKED], waypoint: null };
  const { p, root, ctx, said, touched } = makePanel(character);
  // the map click first, so there is something to compare against, read through
  // the panel's own view exactly as clickAt reads it
  const v0 = p.viewNow();
  const [px, py] = toPixel(someSites[0].x, someSites[0].z, v0.cx, v0.cz, 640, v0.span);
  p.clickAt({ clientX: px, clientY: py });
  const byMap = character.waypoint;
  check('a map click writes character.waypoint', !!byMap && byMap.name === someSites[0].name, JSON.stringify(byMap));
  const mapTouches = touched.length;
  check('and touches the waypoint field', mapTouches === 1 && touched[0] === 'waypoint', touched.join(','));

  const other = ZONE[WALKED[1]];
  const row = rowsOf(root, 'bw-map-region').find((r) => r.dataset.zone === other.id);
  check('the walked region has a row to click', !!row, other.name);
  row.fire('click');
  const byRow = character.waypoint;
  check('a row click writes THE SAME field', byRow !== byMap && ctx.character.waypoint === byRow && byRow.name === other.name, JSON.stringify(byRow));
  check('on the centre of that region', byRow.x === other.x && byRow.z === other.z);
  check('and it calls state.touch too', touched.length === mapTouches + 1 && touched[touched.length - 1] === 'waypoint', touched.join(','));
  check('and says so under the map', p._say.textContent.startsWith(`Waypoint set on ${other.name}`), p._say.textContent);
  check('and in a toast', said.length === 2 && said[1].includes(other.name), said[1]);
  check('nothing else on the character moved', Object.keys(character).join(',') === 'discovered,zones,waypoint');

  // a place row does it too
  const place = rowsOf(root, 'bw-map-place').find((r) => r.dataset.site === someSites[0].id);
  check('a found place has a row', !!place && place.dataset.site === someSites[0].id);
  place.fire('click');
  check('and clicking it sets the mark on that place', character.waypoint.name === someSites[0].name && character.waypoint.x === someSites[0].x, character.waypoint.name);
  check('with a third touch', touched.length === mapTouches + 2);

  // an unwalked row is not a click at all
  const off = rowsOf(root, 'bw-map-region').find((r) => r.className.includes('off'));
  const before = character.waypoint;
  off.fire('click');
  check('an unwalked row does nothing when clicked', character.waypoint === before && touched.length === mapTouches + 2);
}

console.log('win_map: the mark comes off again');
{
  const character = { discovered: [], zones: [...WALKED], waypoint: null };
  const { p, root, said, touched } = makePanel(character);
  // the side column, not the whole panel: the zoom controls under the picture
  // are buttons too, and they are always there
  check('with no mark there is no clear button', !walk(p._side).some((n) => n.tagName === 'BUTTON'));
  check('and the sheet says so rather than leaving a gap', textOf(root).includes('not set'));
  p.setWaypoint({ x: ZONE.greenwold.x, z: ZONE.greenwold.z, name: ZONE.greenwold.name });
  const btn = walk(p._side).find((n) => n.tagName === 'BUTTON');
  check('setting one grows the button', !!btn && btn.textContent === 'clear waypoint', btn && btn.textContent);
  check('and the way to it is written in words', /north|south|east|west|right here/.test(textOf(p._side)));
  const n = touched.length;
  btn.fire('click');
  check('clicking it clears the mark', character.waypoint === null);
  check('and saves that', touched.length === n + 1 && touched[touched.length - 1] === 'waypoint');
  check('and says which mark went', /is cleared/.test(p._say.textContent) && p._say.textContent.includes(ZONE.greenwold.name), p._say.textContent);
  check('and tells the HUD', said[said.length - 1].includes('cleared'), said[said.length - 1]);
  check('the button is gone with it', !walk(p._side).some((x) => x.tagName === 'BUTTON'));
  const again = p.clearWaypoint();
  check('clearing nothing says so and changes nothing', again === null && /no mark/.test(p._say.textContent), p._say.textContent);
}

console.log('win_map: the empty states are sentences');
{
  const { p, root } = makePanel({ discovered: [], zones: [], waypoint: null });
  const m = p.lastSide;
  // nothing walked to: the home realm's places are still there, and Hearthhome
  // is the town the header points at, because a character was born in it
  check('nothing found still lists the home places', rowsOf(root, 'bw-map-place').length === homeKnown().size && m.places.length === homeKnown().size,
    `${m.places.length} rows, ${homeKnown().size} home places`);
  check('and the nearest town on the first morning is Hearthhome', m.town && m.town.id === 'z:hearthhome', m.town && m.town.name);
  // the true empty state, below the home rule: the pure model with nothing at all
  const bare = sideModel({ field, cx: 0, cz: 0, discovered: [], zonesFound: [] });
  check('and with nothing known at all the model has no places and no town', bare.places.length === 0 && bare.town === null);
  check('the regions list is still every open one', rowsOf(root, 'bw-map-region').length === OPEN_ZONES.length);
  check('every one of them dimmed', rowsOf(root, 'bw-map-region').every((r) => r.className.includes('off')));
  check('and the header counts none walked', textOf(root).includes(`0 of ${OPEN_ZONES.length} walked`));
  // and the other direction: find a town, and the header points at it
  check('the world has a town to find', !!someTown, someTown && someTown.name);
  const withTown = makePanel({ discovered: [someTown.id, someSites[0].id], zones: [], waypoint: null });
  const wt = withTown.p.lastSide;
  check('find one and it is on the list', wt.places.some((r) => r.id === someTown.id), `${someTown.name}`);
  check('and the header names a town', wt.town && wt.town.kind === 'town', wt.town && wt.town.name);
  check('and points at it in words', /^(north|south|east|west|north east|north west|south east|south west), /.test(wt.town.way) || wt.town.way === 'right here', wt.town.way);
  check('and it is the nearest town, not the first one found', wt.places.filter((r) => r.kind === 'town').every((r) => r.dist >= wt.town.dist));
}

console.log('win_map: with no world loaded the column is still a page');
{
  const root = document.createElement('div');
  const p = Object.create(panel);
  const ctx = { character: { discovered: [], zones: [], waypoint: null } };
  p.build(root, ctx);
  check('the draw bows out with no field', p.open(ctx) === undefined && p.lastDraw === null);
  check('and the column is built anyway', rowsOf(root, 'bw-map-region').length === OPEN_ZONES.length, `${rowsOf(root, 'bw-map-region').length} rows`);
  check('the ground under you is not invented', p.lastSide.here.ground === null && textOf(root).includes('not known yet'));
  check('and the region you stand in is still worked out from the world table', p.lastSide.here.name === ZONE.greenwold.name, p.lastSide.here.name);
}

console.log('win_map: the key says what the draw actually paints');
{
  const g = recorder();
  drawMap(g, { field, cx: 0, cz: 0, size: 640, zonesFound: ['greenwold'], discovered: [someSites[0].id], waypoint: { x: 1000, z: 1000, name: 'a mark' } });
  const used = g.colours;
  for (const [what, colour] of [['the road', ROAD_COLOUR], ['the waypoint', WAYPOINT_COLOUR], ['you', PLAYER_COLOUR], ['the hatching', HATCH_INK], ['the wash under it', HATCH_WASH]]) {
    check(`${what} is drawn in the colour the key shows`, used.has(colour), colour);
  }
  const keyed = new Set(LEGEND.filter((r) => r.swatch === 'biome').map((r) => r.id));
  check('one swatch for every ground colour the draw uses', keyed.size === Object.keys(BIOME_COLOUR).length && Object.keys(BIOME_COLOUR).every((b) => keyed.has(b)), [...keyed].join(', '));
  check('and none for a colour it does not', LEGEND.filter((r) => r.swatch === 'biome').every((r) => !!BIOME_COLOUR[r.id]));
  check('every swatch has a colour to draw', LEGEND.every((r) => /^(#|rgb)/.test(legendColour(r))), LEGEND.map((r) => legendColour(r)).join(' '));
  check('and a label, none of them a bare id', LEGEND.every((r) => r.label && r.label.length > 1));
  check('the sea is bluer than the meadow, so the key is not a lie', BIOME_COLOUR.ocean[2] > BIOME_COLOUR.meadow[2]);
}

console.log('win_map: the words, and the audit that keeps them');
{
  const counted = auditMapWords();
  check('every biome the field returns has a word, a colour and a swatch', counted.biomes === BIOMES.length, `${counted.biomes} biomes, ${counted.kinds} kinds of place, ${counted.key} key rows`);
  // the other direction: take one away and the audit has to shout
  const keep = GROUND_WORD.snow;
  delete GROUND_WORD.snow;
  let threw = '';
  try { auditMapWords(); } catch (e) { threw = e.message; }
  GROUND_WORD.snow = keep;
  check('and a biome with no word fails the audit', /snow/.test(threw), threw.split('\n')[1] || threw);
  check('putting it back makes it green again', !!auditMapWords());
  const kb = KIND_WORD.mine;
  delete KIND_WORD.mine;
  let threw2 = '';
  try { auditMapWords(); } catch (e) { threw2 = e.message; }
  KIND_WORD.mine = kb;
  check('so does a kind of place with no word', /mine/.test(threw2), threw2.split('\n')[1] || threw2);

  check('north is up the map, because -z is north', bearingWord(0, -100) === 'north', bearingWord(0, -100));
  check('and +z is south', bearingWord(0, 100) === 'south');
  check('and +x is east', bearingWord(100, 0) === 'east');
  check('and the corners are two words', bearingWord(100, -100) === 'north east' && bearingWord(-100, 100) === 'south west');
  check('every point of the compass has a word', POINTS.every(([lb]) => !!POINT_WORD[lb]), POINTS.map(([lb]) => POINT_WORD[lb]).join(', '));
  check('the distance is compass.js own words, not a second copy', wayText(0, -2400).endsWith(distanceText(2400)) && wayText(0, -2400) === `north, ${distanceText(2400)}`, wayText(0, -2400));
  check('and something under your feet is not given a bearing', wayText(3, 4) === 'right here');
  check('a one tier band is the word the banner uses', dangerWords([1, 1]) === DANGER_WORD[1], dangerWords([1, 1]));
  check('a two tier band says both ends and no number', dangerWords([4, 5]).includes(DANGER_WORD[4]) && dangerWords([4, 5]).includes(DANGER_WORD[5]) && !/\d/.test(dangerWords([4, 5])), dangerWords([4, 5]));
  check('every zone in the world can say its danger in words', ZONES.every((z) => dangerWords(z.danger).length > 3));
}

console.log('win_map: the home realm\'s authored places are on the map from the first morning');
{
  const known = knownOf([]);
  check('a character who has found nothing still knows the Old Cellars and the Chalk Pits', known.has('z:oldcellars') && known.has('z:greenwoldpits'));
  check('and Hearthhome and the Standing Hedge', known.has('z:hearthhome') && known.has('z:waystones'));
  check('but not a rolled place it has not walked to', !known.has('0,-2') && knownOf(['0,-2']).has('0,-2'));
  check('and nothing in a realm the gate keeps shut', !known.has('z:canopycourt') && !known.has('z:coldseat'));
  const hh = { x: 749, z: 1579 };
  const fresh = foundPlaces({ field, cx: hh.x, cz: hh.z, discovered: known });
  check('so the map round Hearthhome lists them on the first morning', fresh.some((s) => s.id === 'z:oldcellars') && fresh.some((s) => s.id === 'z:greenwoldpits'),
    fresh.map((s) => s.name).join(', '));
  check('and every one of them is authored', fresh.every((s) => s.authored));
}

console.log('win_map: foundPlaces is the one list');
{
  const two = foundPlaces({ field, cx: 0, cz: 0, discovered: [someSites[0].id, someSites[1].id] });
  check('it finds what the character has found', two.length === 2, two.map((t) => t.name).join(', '));
  const drawn = drawMap(recorder(), { field, cx: 0, cz: 0, size: 640, discovered: [someSites[0].id, someSites[1].id] });
  check('and the draw counts exactly those', drawn.sites === two.length, `${drawn.sites} drawn, ${two.length} listed`);
  check('nothing found is an empty list, not a throw', foundPlaces({ field, cx: 0, cz: 0, discovered: [] }).length === 0);
  check('and no field at all is an empty list too', foundPlaces({ field: null, cx: 0, cz: 0, discovered: ['x'] }).length === 0);
  const model = sideModel({ field, cx: 0, cz: 0, discovered: [someSites[0].id], zonesFound: [] });
  check('the model reads the same list', model.places.length === 1 && model.places[0].name === someSites[0].name);
  check('every place row carries a word for its kind', model.places.every((r) => !!r.kindWord && Object.values(KIND_WORD).includes(r.kindWord)), model.places.map((r) => r.kindWord).join(', '));
  check('and a bearing and a distance', model.places.every((r) => /,/.test(r.way) || r.way === 'right here'), model.places[0].way);
  // the column is rebuilt with the picture, so what it costs is worth knowing
  const ids = [someSites[0].id, someSites[1].id, someTown.id];
  const zs = ['greenwold', 'boneyard', 'frostreach'];
  sideModel({ field, cx: 0, cz: 0, discovered: ids, zonesFound: zs });
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) sideModel({ field, cx: i * 7, cz: -i * 7, discovered: ids, zonesFound: zs });
  const per = (performance.now() - t0) / 50;
  check('and the whole column costs a fraction of the picture beside it', per < 5,
    `${per.toFixed(3)} ms a call against the ${MAP_BUDGET_MS} ms the draw is allowed`);
}


console.log('win_map: what is happening now, and who is walking about');
{
  // the marks come out of the events layer (`src/game/events_runtime.js`
  // `marks()`), which is a live schedule, so this hands the map exactly the
  // shape that call returns and nothing invented for the test
  // ON OPEN GROUND. The map draws nothing in a realm the release gate has shut,
  // so an event in the Boneyard would be testing the case the map refuses; the
  // three below stand inside the open discs and the refusal is driven on its own
  // a few lines further down.
  const live = [
    { kind: 'event', id: 'bonewind', name: 'The Bone Wind', x: -1400, z: 900, r: 100 },
    { kind: 'event', id: 'blossomfall', name: 'The Blossom Fall', x: 1144, z: 1283, r: 2000 },
    { kind: 'boss', id: 'rimemouth', name: 'Rimemouth', x: -1186, z: -1171, r: 0 },
  ];
  check('every one of them is on open ground, which is why the map draws them',
    live.every((m) => onOpenGround(m.x, m.z)));
  const clean = eventMarks(live);
  check('every mark with a place on the map is kept', clean.length === 3, `${clean.length} of ${live.length}`);
  check('and one without a place is dropped rather than drawn at the origin',
    eventMarks([{ kind: 'event', name: 'nowhere' }, { kind: 'boss', name: 'nor there', x: 4, z: null }]).length === 0);
  check('nothing at all is an empty list, not a throw', eventMarks(null).length === 0 && eventMarks(undefined).length === 0);
  check('a panel context with no events layer says nothing is happening',
    marksOf({}).length === 0 && marksOf(null).length === 0);
  check('and one with a layer reads it',
    marksOf({ events: { marks: () => live } }).length === 3);
  check('a layer that throws does not take the map down with it',
    marksOf({ events: { marks() { throw new Error('no'); } } }).length === 0);

  const g = recorder();
  const res = drawMap(g, { field, cx: -1400, cz: 900, size: 640, events: live });
  check('the draw counts the marks it drew', res.marks === 3, `${res.marks} marks`);
  check('an event is drawn in the colour the key shows for it', g.colours.has(EVENT_COLOUR), EVENT_COLOUR);
  check('and a wandering boss in its own', g.colours.has(BOSS_COLOUR), BOSS_COLOUR);
  check('every one of them is named on the map',
    live.every((m) => g.texts.includes(m.name)), live.map((m) => m.name).join(', '));

  const bare = drawMap(recorder(), { field, cx: 0, cz: 0, size: 640 });
  check('a map with nothing happening draws no marks and still draws', bare.marks === 0 && bare.samples > 0);

  // the column beside the map lists them, nearest first, in the page's own words
  const m = sideModel({ field, cx: -1400, cz: 900, discovered: [], zonesFound: [], events: live });
  check('the column lists what is happening, nearest first', m.events.length === 3
    && m.events[0].name === 'The Bone Wind', m.events.map((e) => e.name).join(' | '));
  check('and says you are in the one you are standing in', m.events[0].inside === true && m.events[0].sub === 'you are in it', m.events[0].sub);
  check('while one you are only near says it is happening and not that you are in it',
    m.events[1].inside === false || m.events[1].sub !== 'you are in it', `${m.events[1].name}: ${m.events[1].sub}`);
  check('a boss says it is on its round', m.events.find((e) => e.kind === 'boss').sub === 'on its round');
  check('every row has a bearing and a distance in the page\'s own words',
    m.events.every((e) => e.way && (/,/.test(e.way) || e.way === 'right here')), m.events[0].way);
  check('nothing happening is an empty list and no header', sideModel({ field, cx: 0, cz: 0 }).events.length === 0);

  // and the cost, because this list is rebuilt with the picture
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) sideModel({ field, cx: -1400 + i, cz: 900, events: live });
  const per = (performance.now() - t0) / 200;
  check('and it costs almost nothing to work out', per < 5, `${per.toFixed(3)} ms a call`);
}


// ---------------------------------------------------------------------------
// MAP2: the view.

console.log('win_map: the view opens on the Greenwold and clamps at both ends');
{
  const home = homeView();
  check('the map opens on the Greenwold, not on the origin by accident',
    home.cx === ZONE.greenwold.x && home.cz === ZONE.greenwold.z && home.span === HOME_SPAN,
    `${home.cx}, ${home.cz} at ${spanText(home.span)}`);
  check('and HOME_SPAN is inside the two ends of the zoom', HOME_SPAN >= MAP_MIN_SPAN && HOME_SPAN <= MAP_MAX_SPAN);
  check('the whole world is the far end of the zoom', MAP_MAX_SPAN === MAP_SPAN && MAP_SPAN === 2 * WORLD_HALF);

  check('a span under the near end is held at it', clampSpan(1) === MAP_MIN_SPAN && clampSpan(-500) === MAP_MIN_SPAN, `${clampSpan(1)} m`);
  check('and one over the far end is held at that', clampSpan(1e9) === MAP_MAX_SPAN, `${clampSpan(1e9)} m`);
  check('and one between them is left alone', clampSpan(3210) === 3210);
  check('nonsense falls back on the span the map opens with', clampSpan(NaN) === HOME_SPAN && clampSpan(undefined) === HOME_SPAN);

  // zooming in from the near end, and out from the far end, goes nowhere
  const near = clampView({ cx: 0, cz: 0, span: MAP_MIN_SPAN });
  check('zooming in at the near end changes nothing', zoomCentre(near, 1 / ZOOM_RATE, 640).span === MAP_MIN_SPAN);
  check('and zooming out from it does', zoomCentre(near, ZOOM_RATE, 640).span > MAP_MIN_SPAN,
    `${zoomCentre(near, ZOOM_RATE, 640).span} m`);
  const far = clampView({ cx: 0, cz: 0, span: MAP_MAX_SPAN });
  check('zooming out at the far end changes nothing', zoomCentre(far, ZOOM_RATE, 640).span === MAP_MAX_SPAN);
  check('and zooming in from it does', zoomCentre(far, 1 / ZOOM_RATE, 640).span < MAP_MAX_SPAN);
  // and the whole ladder is reachable, in both directions, in a countable number of steps
  let v = clampView({ cx: 0, cz: 0, span: MAP_MAX_SPAN });
  let steps = 0;
  while (v.span > MAP_MIN_SPAN && steps < 100) { v = zoomCentre(v, 1 / ZOOM_RATE, 640); steps++; }
  check('the near end is reachable from the far one', v.span === MAP_MIN_SPAN && steps < 20, `${steps} notches of the wheel`);
  let back = 0;
  while (v.span < MAP_MAX_SPAN && back < 100) { v = zoomCentre(v, ZOOM_RATE, 640); back++; }
  check('and the far end from the near one', v.span === MAP_MAX_SPAN && back === steps, `${back} notches back`);

  // the centre never leaves the world
  const wild = clampView({ cx: 99999, cz: -99999, span: HOME_SPAN });
  check('the centre cannot be dragged out of the world', wild.cx === WORLD_HALF && wild.cz === -WORLD_HALF, `${wild.cx}, ${wild.cz}`);
}

console.log('win_map: a pixel means the same world point at every zoom');
{
  const spans = [MAP_MIN_SPAN, HOME_SPAN, MAP_MAX_SPAN];
  let worst = 0;
  const say = [];
  for (const span of spans) {
    const view = { cx: 640, cz: -1408, span };
    for (const [x, z] of [[640, -1408], [1234, -5678], [-7999, 100], [0, 0]]) {
      const [px, py] = toPixel(x, z, view.cx, view.cz, 640, view.span);
      const [wx, wz] = toWorld(px, py, view.cx, view.cz, 640, view.span);
      worst = Math.max(worst, Math.hypot(wx - x, wz - z));
    }
    // and the other way round: a pixel to a world point and back to that pixel
    for (const [px, py] of [[0, 0], [320, 320], [639, 1], [17, 604]]) {
      const [wx, wz] = toWorld(px, py, view.cx, view.cz, 640, view.span);
      const [bx, by] = toPixel(wx, wz, view.cx, view.cz, 640, view.span);
      worst = Math.max(worst, Math.hypot(bx - px, by - py));
    }
    const [mx, my] = toPixel(view.cx, view.cz, view.cx, view.cz, 640, view.span);
    say.push(`${span} m: the centre is (${mx}, ${my})`);
  }
  check('world to pixel to world is exact at three zooms, and pixel to world to pixel too',
    worst < 1e-9, `${say.join('; ')}, worst error ${worst.toExponential(1)}`);
  // the scale really is the scale: half the span is half the canvas
  const [ex] = toPixel(640 + 500, -1408, 640, -1408, 640, 1000);
  check('at a kilometre across, 500 m east is the right hand edge', Math.abs(ex - 640) < 1e-9, `${ex} px`);
  const [fx] = toPixel(640 + 500, -1408, 640, -1408, 640, 16000);
  check('and at the whole world it is 20 px from the middle', Math.abs(fx - 340) < 1e-9, `${fx} px`);
}

console.log('win_map: the wheel zooms on the cursor, and the drag moves the centre');
{
  // in the middle of the world, where the clamp cannot bite, the point under
  // the cursor does not move by so much as a millimetre
  const view = { cx: 0, cz: 0, span: HOME_SPAN };
  let worst = 0;
  const rows = [];
  for (const [px, py] of [[0, 0], [160, 96], [320, 320], [601, 88]]) {
    const [wx, wz] = toWorld(px, py, view.cx, view.cz, 640, view.span);
    for (const f of [1 / ZOOM_RATE, ZOOM_RATE, 1 / (ZOOM_RATE ** 3)]) {
      const next = zoomView(view, f, px, py, 640);
      const [ax, az] = toWorld(px, py, next.cx, next.cz, 640, next.span);
      worst = Math.max(worst, Math.hypot(ax - wx, az - wz));
    }
    rows.push(`(${px}, ${py})`);
  }
  check('the world point under the cursor stays under the cursor', worst < 1e-8,
    `${rows.join(', ')}, worst drift ${worst.toExponential(1)} m`);
  check('and zooming in really does show less of the world',
    zoomView(view, 1 / ZOOM_RATE, 100, 100, 640).span < view.span
    && zoomView(view, ZOOM_RATE, 100, 100, 640).span > view.span);

  // at the rim the clamp bites, and the view still stays inside the world
  const rim = { cx: WORLD_HALF, cz: WORLD_HALF, span: MAP_MIN_SPAN };
  const out = zoomView(rim, ZOOM_RATE ** 4, 0, 0, 640);
  check('zooming at the very corner of the world keeps the centre inside it',
    Math.abs(out.cx) <= WORLD_HALF && Math.abs(out.cz) <= WORLD_HALF && out.span > rim.span,
    `${out.cx}, ${out.cz} at ${out.span} m`);

  // the pan: dragging right moves the map right, which is the centre going west
  const p1 = panView(view, 64, 0, 640);
  check('dragging right moves the centre west by the pixels dragged',
    Math.abs(p1.cx - (view.cx - 64 / 640 * view.span)) < 1e-9 && p1.cz === view.cz,
    `${p1.cx} m, expected ${view.cx - 64 / 640 * view.span}`);
  const p2 = panView(view, 0, -32, 640);
  check('and dragging up moves it south', p2.cz > view.cz && p2.cx === view.cx, `${p2.cz} m`);
  check('a drag of nothing moves nothing', panView(view, 0, 0, 640).cx === view.cx && panView(view, 0, 0, 640).cz === view.cz);
  check('and the same drag moves half as far at half the span',
    Math.abs((view.cx - panView(view, 64, 0, 640).cx) / (view.cx - panView({ ...view, span: view.span / 2 }, 64, 0, 640).cx) - 2) < 1e-9);
  check('a pan cannot leave the world either',
    Math.abs(panView({ cx: WORLD_HALF, cz: 0, span: HOME_SPAN }, -4000, 0, 640).cx) <= WORLD_HALF);
  check('and it never changes the span', panView(view, 300, -300, 640).span === view.span);
}

console.log('win_map: what the zoom buys, in samples and in words');
{
  check('the closest zoom is sampled finer than the whole world',
    samplesFor(MAP_MIN_SPAN) === MAP_SAMPLES_NEAR && samplesFor(MAP_MAX_SPAN) === MAP_SAMPLES_FAR,
    `${samplesFor(MAP_MIN_SPAN)} a side close in, ${samplesFor(MAP_MAX_SPAN)} at the whole world`);
  const near = MAP_MIN_SPAN / samplesFor(MAP_MIN_SPAN);
  const far = MAP_MAX_SPAN / samplesFor(MAP_MAX_SPAN);
  check('and the ground is read very much more finely close in', far / near > 15,
    `${near.toFixed(1)} m a sample at ${spanText(MAP_MIN_SPAN)}, ${far.toFixed(0)} m at ${spanText(MAP_MAX_SPAN)}: ${(far / near).toFixed(0)} times`);
  check('the count never leaves the two ends, whatever it is asked',
    [1, 999, 1000, 4000, 16000, 1e9, NaN].every((v) => {
      const n = samplesFor(v);
      return n >= Math.min(MAP_SAMPLES_NEAR, MAP_SAMPLES_FAR) && n <= Math.max(MAP_SAMPLES_NEAR, MAP_SAMPLES_FAR);
    }));
  check('and it never goes up as the map is pulled out',
    [1000, 2000, 4000, 8000, 16000].every((v, i, a) => i === 0 || samplesFor(a[i - 1]) >= samplesFor(v)),
    [1000, 2000, 4000, 8000, 16000].map((v) => `${v}:${samplesFor(v)}`).join(' '));

  check('the span is said in kilometres a person can read',
    spanText(1000) === '1.0 km across' && spanText(5000) === '5.0 km across' && spanText(16000) === '16 km across',
    `${spanText(1000)} | ${spanText(5000)} | ${spanText(16000)}`);
  check('and it never says a bare number', !/^\d+$/.test(spanText(HOME_SPAN)));

  // the scale bar: a round distance, never longer than the map it sits on
  for (const span of [MAP_MIN_SPAN, 2000, HOME_SPAN, MAP_MAX_SPAN]) {
    const bar = scaleBarFor(span, 640);
    const ok = bar.px > 0 && bar.px <= 640 / 3 + 1e-9 && bar.metres / span * 640 === bar.px;
    check(`the scale bar at ${spanText(span)} is a round ${bar.label} over ${bar.px.toFixed(0)} px`, ok,
      `${bar.metres} m of ${span} m`);
  }
  check('the bar grows with the span', scaleBarFor(16000, 640).metres > scaleBarFor(1000, 640).metres);
  check('and every label it can wear is a distance and not a number',
    [1000, 1500, 2500, 5000, 9000, 16000].every((v) => /^[\d.]+ (m|km)$/.test(scaleBarFor(v, 640).label)),
    [1000, 5000, 16000].map((v) => scaleBarFor(v, 640).label).join(', '));
}


// ---------------------------------------------------------------------------
// MAP2: the ground the user cut with their own hands.

console.log('win_map: the terrain the user sculpts is the terrain on the map');
{
  // A SCULPT WORLD, exactly as ED3-SCULPT.md describes one: the generator put
  // away, the ground flat at base.height, and everything on it laid there by a
  // stroke. That is the world the user is building the Greenwold in, so it is
  // the world this is measured in.
  const sf = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });
  const edits = createTerrainEdits({ baseHeight: (x, z) => sf.heightAt(x, z) });
  edits.setBase({ mode: 'sculpt', height: 6, ground: 'grass' });
  sf.setTerrainEdits(edits);
  check('the field is a sculpt world with a flat base', !!sf.sculpt && sf.sculpt.height === 6, JSON.stringify(sf.sculpt));

  const HILL = { x: 1200, z: -900, r: 220, amount: 90 };
  check('the hill is going up on open ground, where the map draws it', onOpenGround(HILL.x, HILL.z));
  const flatBefore = sf.heightAt(HILL.x, HILL.z);
  const walked = ZONES.map((z) => z.id);
  const view = { cx: HILL.x, cz: HILL.z, span: 2000 };
  const opts = () => ({
    field: sf, cx: view.cx, cz: view.cz, span: view.span, size: 640,
    zonesFound: walked, discovered: [], spaces: false,
  });

  // ---- the cache follows the strokes, and only the strokes ----------------
  const cache = makeCache();
  const v0 = edits.version;
  const first = drawMap(painter(), { ...opts(), paintCache: cache });
  const again = drawMap(painter(), { ...opts(), paintCache: cache });
  check('the first paint reads the field and the second does not',
    first.cached === false && again.cached === true && again.msField < 1,
    `cold ${first.msField.toFixed(0)} ms of field work, warm ${again.msField.toFixed(2)} ms`);

  const flatPainter = painter();
  drawMap(flatPainter, { ...opts(), paintCache: cache });
  const flatColour = flatPainter.groundAt(320, 320);

  edits.stroke({ kind: 'raise', x: HILL.x, z: HILL.z, r: HILL.r, amount: HILL.amount });
  check('a stroke moves the version the map watches', edits.version > v0, `${v0} then ${edits.version}`);
  const raised = sf.heightAt(HILL.x, HILL.z);
  check('and it really moved the ground under the map', raised > flatBefore + HILL.amount * 0.5,
    `${flatBefore.toFixed(1)} m became ${raised.toFixed(1)} m`);

  const hot = painter();
  const third = drawMap(hot, { ...opts(), paintCache: cache });
  check('so the very next paint reads the field again instead of the cache',
    third.cached === false, `cached ${third.cached}`);
  const fourth = drawMap(painter(), { ...opts(), paintCache: cache });
  check('and the one after that is cached again, because nothing moved',
    fourth.cached === true, `cached ${fourth.cached}`);

  // ---- and it is VISIBLE, which is the whole point ------------------------
  //
  // The middle of the map is the middle of the hill; 300 m east of it is flat
  // ground, at the same distance from the middle as the vignette is at the
  // middle, so what is compared is the ground and not the paper's own shading.
  const centre = hot.groundAt(320, 320);
  const beside = hot.groundAt(320 + (300 / view.span) * 640, 320);
  check('the raised ground is painted brighter than the flat beside it',
    lightOf(centre) > lightOf(beside) + 8,
    `the hill top ${centre} (${lightOf(centre)}) against the flat ${beside} (${lightOf(beside)})`);
  check('and brighter than the same ground was before the stroke',
    lightOf(centre) > lightOf(flatColour) + 8,
    `${flatColour} became ${centre}`);
  check('while the flat 300 m off is painted as it was', Math.abs(lightOf(beside) - lightOf(flatColour)) <= 6,
    `${flatColour} against ${beside}`);

  // the north west sun: the far flank of a hill is darker than the near one
  const off = (110 / view.span) * 640;
  const nw = hot.groundAt(320 - off, 320 - off);
  const se = hot.groundAt(320 + off, 320 + off);
  check('the sun stands north west, so the north west flank is lit and the south east one is not',
    lightOf(nw) > lightOf(se), `north west ${nw} (${lightOf(nw)}), south east ${se} (${lightOf(se)})`);

  // ---- and the cost of following the hand ---------------------------------
  const closeUp = { field: sf, cx: HILL.x, cz: HILL.z, span: MAP_MIN_SPAN, size: 640, zonesFound: walked, discovered: [] };
  for (let i = 0; i < 3; i++) drawMap(painter(), closeUp);   // warm the JIT
  const runs = [];
  for (let i = 0; i < 9; i++) runs.push(drawMap(painter(), { ...closeUp, cx: HILL.x + i * 11 }).ms);
  // THE MEDIAN OF NINE, and every one of them printed. A single garbage
  // collection lands on one run in ten and doubles it, and that is the cost of
  // node's heap and not the cost of painting a map; a gate on the worst of nine
  // would be a gate on whether the collector happened to run. The spread is
  // said out loud so a real regression is still visible in the line.
  const sorted = runs.slice().sort((a, b) => a - b);
  const mid = sorted[4];
  check(`a repaint at ${spanText(MAP_MIN_SPAN)} costs less than the ${NEAR_BUDGET_MS} ms budget`,
    mid < NEAR_BUDGET_MS,
    `median ${mid.toFixed(1)} ms of ${runs.map((v) => v.toFixed(0)).join(', ')}, at ${(MAP_MIN_SPAN / samplesFor(MAP_MIN_SPAN)).toFixed(1)} m a sample`);
  check('and not one of them is anywhere near twice it', sorted[8] < NEAR_BUDGET_MS * 2,
    `worst ${sorted[8].toFixed(1)} ms`);
  // and the whole world, which is the other end of the same budget
  const wide = drawMap(painter(), { field: sf, cx: 0, cz: 0, span: MAP_MAX_SPAN, size: 640, zonesFound: walked });
  check('and the whole world is still inside the older budget', wide.ms < MAP_BUDGET_MS,
    `${wide.ms.toFixed(0)} ms of ${MAP_BUDGET_MS}`);

  // ---- painted ground, not just moved ground -----------------------------
  const snowAt = { x: HILL.x - 600, z: HILL.z + 500 };
  edits.stroke({ kind: 'ground', x: snowAt.x, z: snowAt.z, r: 160, ground: 'snow' });
  check('a paint stroke tells the field the ground is snow now',
    sf.sampleAt(snowAt.x, snowAt.z).biome === 'snow', sf.sampleAt(snowAt.x, snowAt.z).biome);
  const snowy = painter();
  drawMap(snowy, { ...opts(), paintCache: cache });
  const [spx, spy] = toPixel(snowAt.x, snowAt.z, view.cx, view.cz, 640, view.span);
  const grass = snowy.groundAt(320 + (300 / view.span) * 640, 320);
  check('and the map paints the snow field paler than the grass beside it',
    lightOf(snowy.groundAt(spx, spy)) > lightOf(grass),
    `snow ${snowy.groundAt(spx, spy)}, grass ${grass}`);
}

console.log('win_map: the realms the release gate has not opened');
{
  const walked = ZONES.map((z) => z.id);
  const g = painter();
  const res = drawMap(g, { field, cx: 0, cz: 0, span: MAP_MAX_SPAN, size: 640, zonesFound: walked, discovered: [] });
  const closed = ZONES.filter((z) => !zoneOpen(z));
  const open = ZONES.filter(zoneOpen);
  check('the world has both kinds of region to draw', closed.length > 0 && open.length > 0,
    `${open.length} open, ${closed.length} shut`);
  check('every closed region on the map is drawn faded', res.faded === closed.length,
    `${res.faded} faded of ${closed.length}`);
  check('and the veil is one fill over everything outside the open discs',
    g.fills.some((f) => f.rule === 'evenodd' && f.style === VEIL_COLOUR) && res.veiled === openDiscs().length,
    `${res.veiled} disc(s) cut out of it`);
  check('the veil leaves 15 percent of what is under it', Math.abs(FADE_ALPHA - 0.15) < 1e-9
    && VEIL_COLOUR.includes(String(1 - FADE_ALPHA)), VEIL_COLOUR);
  const words = g.words();
  check('not one closed region is named, though every one of them has been walked',
    closed.every((z) => !words.includes(z.name)),
    closed.filter((z) => words.includes(z.name)).map((z) => z.name).join(', ') || `${closed.length} checked`);
  check('and every open one is', open.every((z) => words.includes(z.name)) && res.named === open.length,
    `${res.named} named of ${open.length} open`);
  check('the line round the open country is drawn in the colour the key shows',
    g.strokes.some((st) => st.style === OPEN_LINE), OPEN_LINE);

  // the other way: switch the rule off and the whole world comes back
  const all = painter();
  const bare = drawMap(all, { field, cx: 0, cz: 0, span: MAP_MAX_SPAN, size: 640, zonesFound: walked, openOnly: false });
  check('with the gate rule off, every region in the world is named and none is faded',
    bare.faded === 0 && bare.named === ZONES.length && closed.every((z) => all.words().includes(z.name)),
    `${bare.named} named of ${ZONES.length}`);
  check('and no veil is laid down at all', bare.veiled === 0 && !all.fills.some((f) => f.rule === 'evenodd'));

  // no places outside the open ground, either
  const outside = authoredSites().filter((s) => !onOpenGround(s.x, s.z));
  check('the world has authored places behind the gate', outside.length > 0, `${outside.length} of ${authoredSites().length}`);
  const shown = foundPlaces({ field, cx: 0, cz: 0, span: MAP_MAX_SPAN, discovered: outside.map((s) => s.id) });
  check('and not one of them is on the map, even having been found', shown.length === 0, `${shown.length} drawn`);
  check('while with the rule off they all are',
    foundPlaces({ field, cx: 0, cz: 0, span: MAP_MAX_SPAN, discovered: outside.map((s) => s.id), openOnly: false }).length === outside.length);

  // the line the map draws is the line release.js keeps, measured on the ground
  check('and the line the map draws is the one the gate enforces', (() => {
    try { return !!auditOpenDiscs(); } catch { return false; }
  })(), `${openDiscs().length} open disc(s), ${OPEN_REALMS.join(', ')}`);
}

console.log('win_map: the spaces the editor has laid out');
{
  const audit = auditSpaceTiles();
  check('every automatic tile on disk stands where its own name says it stands',
    audit.bad.length === 0, audit.bad.join('; ') || `${audit.tiles} tiles of ${SPACE_TILE_M} m, ${audit.named} named spaces`);

  // the rectangle test, driven both ways against a space that is put there for
  // it, so this holds whether or not anybody has saved one yet
  const made = {
    inside: { id: 'tile_0_0', name: 'Tile 0, 0', at: { x: 128, z: 128 }, radius: 182 },
    far: { id: 'tile_20_20', name: 'Tile 20, 20', at: { x: 5248, z: 5248 }, radius: 182 },
    named: { id: 'the_long_meadow', name: 'The Long Meadow', at: { x: 300, z: -200 }, radius: 90 },
  };
  const near = spacesIn({ x: 0, z: 0, w: 2000, h: 2000 }, made);
  check('a space inside the view comes back and one 5 km away does not',
    near.length === 2 && near.every((sp) => sp.id !== 'tile_20_20'), near.map((sp) => sp.id).join(', '));
  check('a tile is a square of the editor own tile size', near.find((sp) => sp.tile).w === Math.round(182 * Math.SQRT2),
    `${near.find((sp) => sp.tile).w} m, tiles are ${SPACE_TILE_M} m`);
  check('and a named space is a circle of its own radius',
    near.find((sp) => !sp.tile).r === 90 && near.find((sp) => !sp.tile).w === 180);
  check('nothing at all in the view is an empty list, not a throw',
    spacesIn({ x: 6000, z: 6000, w: 500, h: 500 }, made).length === 0);

  // and the zoom rule, through the real draw over the real spaces on disk
  const here = spacesIn({ x: 640, z: 1408, w: SPACE_SPAN, h: SPACE_SPAN });
  if (here.length) {
    const gClose = painter();
    const close = drawMap(gClose, { field, cx: here[0].x, cz: here[0].z, span: SPACE_SPAN, size: 640, zonesFound: ['greenwold'] });
    check(`at ${spanText(SPACE_SPAN)} the spaces are outlined and named`,
      close.spaces >= 1 && gClose.words().includes(here[0].name),
      `${close.spaces} outlined, "${here[0].name}" written`);
    const gWide = painter();
    const wide = drawMap(gWide, { field, cx: here[0].x, cz: here[0].z, span: SPACE_SPAN * 4, size: 640, zonesFound: ['greenwold'] });
    check(`and at ${spanText(SPACE_SPAN * 4)} not one of them is drawn or named`,
      wide.spaces === 0 && !gWide.words().includes(here[0].name), `${wide.spaces} outlined`);
    check('the outline is dashed, in the colour the key shows',
      gClose.strokes.some((st) => st.style === SPACE_INK && st.dash.length > 0), SPACE_INK);
    // and the column beside the map lists exactly what the picture outlined
    const m = sideModel({ field, cx: here[0].x, cz: here[0].z, view: { cx: here[0].x, cz: here[0].z, span: SPACE_SPAN }, zonesFound: ['greenwold'] });
    check('and the column lists the same ones the picture drew', m.spaces.length === close.spaces,
      `${m.spaces.length} rows, ${close.spaces} outlines`);
    check('while at the wider zoom it lists none',
      sideModel({ field, cx: here[0].x, cz: here[0].z, view: { cx: here[0].x, cz: here[0].z, span: SPACE_SPAN * 4 } }).spaces.length === 0);
  } else {
    check('nothing has been laid out yet, so the draw has nothing to outline',
      drawMap(painter(), { field, cx: 0, cz: 0, span: SPACE_SPAN, size: 640 }).spaces === 0,
      'no space files on disk; the rectangle rule above is what is measured');
  }
}

console.log('win_map: the arrow is where you are, not where the map is looking');
{
  const you = { x: 400, z: -300 };
  const g = painter();
  const res = drawMap(g, { field, cx: you.x, cz: you.z, span: HOME_SPAN, size: 640, player: you, yaw: 0 });
  const at = g.moves[g.moves.length - 1];
  check('with the map over the player, the arrow is drawn in the middle',
    Math.abs(at[0] - 320) < 1e-9 && Math.abs(at[1] - 320) < 1e-9, `(${at[0]}, ${at[1]})`);

  // now pan the map a long way off and the arrow goes with the ground
  const panned = panView({ cx: you.x, cz: you.z, span: HOME_SPAN }, 128, -64, 640);
  const g2 = painter();
  drawMap(g2, { field, cx: panned.cx, cz: panned.cz, span: panned.span, size: 640, player: you, yaw: 0 });
  const at2 = g2.moves[g2.moves.length - 1];
  const want = toPixel(you.x, you.z, panned.cx, panned.cz, 640, panned.span);
  check('and with the map dragged away it is drawn at the player own pixel',
    Math.abs(at2[0] - want[0]) < 1e-9 && Math.abs(at2[1] - want[1]) < 1e-9,
    `(${at2[0].toFixed(1)}, ${at2[1].toFixed(1)}), 128 px of drag moved it ${(at2[0] - at[0]).toFixed(0)} px`);
  check('which is 128 px right and 64 px down from the middle, because that is the drag',
    Math.abs(at2[0] - 448) < 1e-9 && Math.abs(at2[1] - 256) < 1e-9);
  check('and the draw says whose place it drew', res.player.x === you.x && res.player.z === you.z);
  // a caller that hands over no player at all still gets an arrow, in the middle
  const g3 = painter();
  drawMap(g3, { field, cx: 0, cz: 0, span: HOME_SPAN, size: 640 });
  const at3 = g3.moves[g3.moves.length - 1];
  check('a draw with no player named puts the arrow at the middle of the view',
    Math.abs(at3[0] - 320) < 1e-9 && Math.abs(at3[1] - 320) < 1e-9);
}


// ---------------------------------------------------------------------------
// MAP2: the controls, driven as a player drives them.

console.log('win_map: the panel zooms, pans and comes back to you');
{
  const character = { discovered: [], zones: [...WALKED], waypoint: null };
  const { p, root } = makePanel(character);
  const canvas = p._canvas;
  check('the map opens over the player at HOME_SPAN',
    p._view.span === HOME_SPAN && p._view.cx === 0 && p._view.cz === 0, JSON.stringify(p._view));

  // the wheel, on the cursor
  const before = { ...p._view };
  const [wx, wz] = toWorld(500, 120, before.cx, before.cz, canvas.width, before.span);
  canvas.fire('wheel', { deltaY: -100, clientX: 500, clientY: 120, preventDefault() {} });
  check('one notch up zooms in', p._view.span < before.span, `${before.span} m became ${p._view.span} m`);
  const [ax, az] = toWorld(500, 120, p._view.cx, p._view.cz, canvas.width, p._view.span);
  check('and the ground under the cursor did not move', Math.hypot(ax - wx, az - wz) < 1e-6,
    `${wx.toFixed(2)},${wz.toFixed(2)} then ${ax.toFixed(2)},${az.toFixed(2)}`);
  check('and the panel says how much of the world it is showing now',
    p._say.textContent.startsWith(spanText(p._view.span)), p._say.textContent);
  canvas.fire('wheel', { deltaY: 100, clientX: 500, clientY: 120, preventDefault() {} });
  check('and one notch down zooms back out', Math.abs(p._view.span - before.span) < 1e-9, `${p._view.span} m`);
  // a wheel event with nothing in it does nothing at all
  const held = p._view.span;
  canvas.fire('wheel', { deltaY: 0, clientX: 10, clientY: 10, preventDefault() {} });
  check('a wheel event with no movement in it changes nothing', p._view.span === held);

  // the drag
  const start = { ...p._view };
  canvas.fire('pointerdown', { clientX: 300, clientY: 300 });
  canvas.fire('pointermove', { clientX: 302, clientY: 301 });
  check('a press that has barely moved has not panned anything',
    p._view.cx === start.cx && p._view.cz === start.cz, `moved ${p._drag.moved.toFixed(1)} px of ${DRAG_PX}`);
  canvas.fire('pointermove', { clientX: 364, clientY: 268 });
  check('past the threshold it pans, and the ground follows the pointer',
    Math.abs(p._view.cx - (start.cx - 64 / 640 * start.span)) < 1e-9
    && Math.abs(p._view.cz - (start.cz + 32 / 640 * start.span)) < 1e-9,
    `${p._view.cx}, ${p._view.cz}`);
  check('and the span is untouched by a pan', p._view.span === start.span);
  canvas.fire('pointerup', { clientX: 364, clientY: 268 });
  check('and letting go says the map moved and how to get back',
    /moved/.test(p._say.textContent) && /you/.test(p._say.textContent), p._say.textContent);
  // the click the browser sends after a drag is not a click on a place
  const wpBefore = character.waypoint;
  canvas.fire('click', { clientX: 364, clientY: 268 });
  check('and the click a drag ends with sets no waypoint', character.waypoint === wpBefore);
  // but the next click does
  const there = p.clickAt({ clientX: 320, clientY: 320 });
  check('while the click after that is a real click again', !!there && character.waypoint === there,
    JSON.stringify(character.waypoint));

  // the "you" button
  p._ctx.player.pos = { x: 900, z: -400 };
  const buttons = walk(p._tools).filter((n) => n.tagName === 'BUTTON');
  check('there is a control for every thing the map can be told to do',
    buttons.length === 6
    && buttons.slice(0, 5).map((b) => b.textContent).join('|') === 'you|-|+|the Greenwold|the whole world'
    && /^ground: /.test(buttons[5].textContent),
    buttons.map((b) => b.textContent).join(', '));
  check('and every one of them says on hover what it will do',
    buttons.every((b) => typeof b.title === 'string' && b.title.length > 25),
    buttons.map((b) => `${b.textContent}: ${b.title.length} chars`).join('; '));
  const span = p._view.span;
  buttons[0].fire('click');
  check('"you" puts the map back over the player and leaves the zoom alone',
    p._view.cx === 900 && p._view.cz === -400 && p._view.span === span, JSON.stringify(p._view));
  check('and says so', /over you again/.test(p._say.textContent), p._say.textContent);

  // plus and minus
  buttons[2].fire('click');
  check('the plus button zooms in one notch', Math.abs(p._view.span - span / ZOOM_RATE) < 1e-9, `${p._view.span} m`);
  buttons[1].fire('click');
  check('and the minus button undoes it exactly', Math.abs(p._view.span - span) < 1e-9, `${p._view.span} m`);
  check('neither of them moves the centre', p._view.cx === 900 && p._view.cz === -400);

  // home, and the whole world
  buttons[3].fire('click');
  check('the Greenwold button goes back to where the map opens',
    p._view.cx === ZONE.greenwold.x && p._view.cz === ZONE.greenwold.z && p._view.span === HOME_SPAN,
    JSON.stringify(p._view));
  check('and names the place it went', p._say.textContent.includes(ZONE.greenwold.name), p._say.textContent);
  buttons[4].fire('click');
  check('and the whole world button shows the whole world', p._view.span === MAP_MAX_SPAN);

  // the ends of the zoom say so rather than doing nothing in silence
  buttons[4].fire('click');
  p.zoomBy(ZOOM_RATE);
  check('zooming out past the world says it is as far as the map goes',
    /as far out as the map goes/i.test(p._say.textContent), p._say.textContent);
  p.setView({ ...p._view, span: MAP_MIN_SPAN });
  p.zoomBy(1 / ZOOM_RATE);
  check('and zooming in past the near end says that too',
    /as close as the map goes/i.test(p._say.textContent), p._say.textContent);

  // the footer and the label under the map both say the span, and the same one
  p.goHome();
  check('the label beside the controls says the span', p._zoomNow.textContent === spanText(HOME_SPAN), p._zoomNow.textContent);
  check('and so does the footer, in the same words',
    p._foot.textContent.includes(spanText(HOME_SPAN)), p._foot.textContent);
  check('which is the same span the scale bar was drawn for', p.lastDraw.scale.metres === scaleBarFor(HOME_SPAN, 640).metres);
  check('and the footer says how finely the ground was read',
    p._foot.textContent.includes(`${Math.round(p.lastDraw.stride)} m a sample`), p._foot.textContent);
  check('every control on the page says something on hover',
    !!p._canvas.title && !!p._zoomNow.title && walk(p._side).filter((n) => n.className.includes('bw-map-region')).every((n) => !!n.title),
    `the picture: "${p._canvas.title.slice(0, 40)}..."`);
}

console.log('win_map: plus, minus and 0 off the keyboard the world reads');
{
  const character = { discovered: [], zones: [...WALKED], waypoint: null };
  const keys = new Set();
  const swallowed = [];
  const input = {
    pressed: (k) => keys.has(k),
    swallow: (k) => { swallowed.push(k); keys.delete(k); },
  };
  const { p } = makePanel(character, { input });
  check('the panel claims the zoom keys, so the world does not act on them too',
    ['+', '=', '-', '_', '0'].every((k) => panel.keys.includes(k)), panel.keys.join(' '));
  const span = p._view.span;
  keys.add('+');
  p.tick(0.01, p._ctx);
  check('plus zooms in', p._view.span < span, `${span} became ${p._view.span}`);
  check('and the press is taken out of the frame', swallowed.includes('+'), swallowed.join(','));
  keys.add('-');
  p.tick(0.01, p._ctx);
  check('minus zooms back out', Math.abs(p._view.span - span) < 1e-9, `${p._view.span}`);
  p.setView({ cx: 4000, cz: 4000, span: MAP_MIN_SPAN });
  keys.add('0');
  p.tick(0.01, p._ctx);
  check('and 0 goes back to the Greenwold',
    p._view.cx === ZONE.greenwold.x && p._view.span === HOME_SPAN, JSON.stringify(p._view));
  // and the other direction: a frame with no key pressed moves nothing
  const held = { ...p._view };
  p.tick(0.01, p._ctx);
  check('a frame with nothing pressed changes nothing',
    p._view.cx === held.cx && p._view.span === held.span);
}

console.log('win_map: the map follows the brush, and no faster');
{
  // the two clocks: the slow one that keeps the arrow honest, and the fast one
  // that only runs when the terrain version has moved.
  let version = 4;
  let drawn = 0;
  const stub = Object.create(panel);
  stub._ctx = { runtime: { field: { get terrainEdits() { return { version }; } } } };
  stub.redraw = () => { drawn++; stub._terrain = version; return null; };
  stub._since = 0;
  stub._terrain = version;
  stub.tick(0.4, stub._ctx);
  check('nothing has moved, so nothing is repainted', drawn === 0);
  version = 5;
  stub.tick(0.05, stub._ctx);
  check('a stroke half a second ago is not repainted yet', drawn === 0, `${stub._since.toFixed(2)} s of ${REPAINT_S}`);
  stub.tick(0.1, stub._ctx);
  check('and once REPAINT_S has passed it is', drawn === 1, `after ${REPAINT_S} s`);
  stub.tick(0.5, stub._ctx);
  check('and it does not paint again for a version it has already drawn', drawn === 1);
  version = 6; version = 7;
  stub._since = REPAINT_S;
  stub.tick(0, stub._ctx);
  check('two strokes in one window cost one repaint, not two', drawn === 2);
  // the slow clock is still there under it
  stub._since = 0;
  stub.tick(REDRAW_S - 0.01, stub._ctx);
  check('the slow clock has not come round yet', drawn === 2);
  stub.tick(0.02, stub._ctx);
  check('and then it does', drawn === 3, `every ${REDRAW_S} s`);
  // a world with no strokes at all is the slow clock and nothing else
  const plain = Object.create(panel);
  let plainDrawn = 0;
  plain._ctx = { runtime: { field: {} } };
  plain.redraw = () => { plainDrawn++; return null; };
  plain._since = 0;
  plain.tick(1.0, plain._ctx);
  check('a world with no terrain list is never repainted early', plainDrawn === 0);
  plain.tick(1.1, plain._ctx);
  check('and still keeps the slow clock', plainDrawn === 1);
  check('and the map reads that version off the FIELD, so any caller of the painter gets it',
    terrainKey({ terrainEdits: { version: 3 } }) !== terrainKey({ terrainEdits: { version: 4 } })
    && terrainKey({}) === terrainKey({}),
    `${terrainKey({ terrainEdits: { version: 3 } })} against ${terrainKey({ terrainEdits: { version: 4 } })}`);
}

// ------------------------------------------------------ MAP3: the guide ----
//
// The painting is the ground and the twelve boundaries are drawn over it. What
// can go wrong with that, and is checked below:
//
//   * the picture landing somewhere other than where the world says it is, so
//     the arrow stands beside the painted village instead of on it. THIS IS THE
//     ONE THAT MATTERS: it is the whole claim of the feature and it cannot be
//     seen by eye on a picture of a countryside.
//   * an outline drawn twice, or none, or the ring drawn as a disc
//   * a hover that highlights one space and lists another's models
//   * a missing picture throwing instead of saying so
//   * the layer button lying about which of the three is on the screen
//
// The painting is never really loaded here: node has no `Image`, so the module
// settles on 'missing', which is the state the user is in until they drop the
// file in. Every check that needs it laid down hands a fake one straight to
// `drawMap`, through the SAME `opts.guideArt` the panel uses.

const READY_ART = { state: 'ready', img: { width: 1676, height: 942 }, w: 1676, h: 942, why: null };

console.log('\nwin_map MAP3: the painting is the ground');
{
  const g = painter();
  const view = { cx: 0, cz: 0, span: HOME_SPAN };
  const res = drawMap(g, { field, ...view, size: 640, discovered: [], zonesFound: [], guideArt: READY_ART });
  check('the picture is laid down, once', g.images.length === 1 && res.guide.drawn === 1,
    `${g.images.length} images, layer "${res.guide.layer}"`);
  const im = g.images[0];

  // THE CLAIM, MEASURED. Where the arrow lands comes out of `toPixel`. Where
  // the painted village lands comes out of `worldToImage` and the rectangle the
  // picture was really drawn into. If those two agree at the village's own
  // world point then the arrow stands on the painted village, and the same
  // arithmetic holds for every other spot on the sheet.
  const village = GUIDE_ZONES.find((z) => z.id === 'hearthhome');
  const onSheet = (x, z) => {
    const [u, v] = worldToImage(x, z);
    return [im.x + u * im.w, im.y + v * im.h];
  };
  let worst = 0, worstAt = '';
  for (const zn of GUIDE_ZONES) {
    const [ax, ay] = toPixel(zn.x, zn.z, view.cx, view.cz, 640, view.span);
    const [bx, by] = onSheet(zn.x, zn.z);
    const e = Math.max(Math.abs(ax - bx), Math.abs(ay - by));
    if (e > worst) { worst = e; worstAt = zn.name; }
  }
  check('the painted place and the world place are the same pixel, at all twelve spaces',
    worst < 1e-9, `worst ${worst.toExponential(1)} px, at ${worstAt}`);

  // and the arrow itself, drawn through the real draw at the village's own
  // world point: the painter keeps every translate, and the arrow is the last
  // one, because it is the last thing drawn before the scale bar
  const g2 = painter();
  drawMap(g2, {
    field, ...view, size: 640, discovered: [], zonesFound: [], guideArt: READY_ART,
    player: { x: village.x, z: village.z }, yaw: 0,
  });
  const arrow = g2.moves[g2.moves.length - 1];
  const [vx, vy] = onSheet(village.x, village.z);
  check('so the player arrow stands ON the painted village when the player is in the village',
    Math.hypot(arrow[0] - vx, arrow[1] - vy) < 1e-9,
    `the arrow at ${arrow[0].toFixed(3)}, ${arrow[1].toFixed(3)} and the painted village at ${vx.toFixed(3)}, ${vy.toFixed(3)}`);

  // the mapping the OTHER way: the pixel the village was painted at, picked
  check('and picking that same pixel picks the village back out',
    pickGuideAt(vx, vy, { ...view, size: 640 })?.id === 'hearthhome');
  check('and a pixel out in the empty north east picks nothing',
    pickGuideAt(600, 40, { ...view, size: 640 }) === null);

  // the picture follows the zoom, because it is drawn through the view
  const g3 = painter();
  drawMap(g3, { field, cx: 0, cz: 0, span: MAP_MIN_SPAN, size: 640, discovered: [], zonesFound: [], guideArt: READY_ART });
  check('and at the closest zoom it is drawn five times bigger, not pinned to the frame',
    g3.images[0].w > im.w * 4.9 && g3.images[0].w < im.w * 5.1,
    `${im.w.toFixed(0)} px wide at ${HOME_SPAN} m, ${g3.images[0].w.toFixed(0)} px at ${MAP_MIN_SPAN} m`);
}

console.log('\nwin_map MAP3: the twelve boundaries');
{
  const g = painter();
  const view = { cx: 0, cz: 0, span: HOME_SPAN };
  const res = drawMap(g, { field, ...view, size: 640, discovered: [], zonesFound: [], guideArt: READY_ART });
  check('every one of the twelve is outlined, and every one exactly once',
    res.guide.zones === GUIDE_ZONES.length, `${res.guide.zones} of ${GUIDE_ZONES.length}`);

  // one arc per space at its own pixel, and TWO at the ring, because the ring
  // is an annulus and is drawn as its own boundary and not as a disc
  const guideArcs = g.arcs.filter((a) => a.style === GUIDE_INK || a.style === GUIDE_INK_HOT);
  const atOf = (zn) => toPixel(zn.x, zn.z, view.cx, view.cz, 640, view.span);
  let ones = 0;
  for (const zn of GUIDE_ZONES) {
    const [px, py] = atOf(zn);
    const mine = guideArcs.filter((a) => Math.hypot(a.x - px, a.y - py) < 0.01);
    if (zn.annulus ? mine.length === 2 : mine.length === 1) ones++;
  }
  check('one circle each, and TWO at the Standing Hedge, so the ring reads as a ring',
    ones === GUIDE_ZONES.length && res.guide.rings === 1,
    `${guideArcs.length} guide circles for ${GUIDE_ZONES.length} spaces, ${res.guide.rings} of them a ring`);
  const ring = GUIDE_ZONES.find((z) => z.annulus);
  const [rx, ry] = atOf(ring);
  const radii = guideArcs.filter((a) => Math.hypot(a.x - rx, a.y - ry) < 0.01).map((a) => a.r).sort((a, b) => a - b);
  check('and the two circles of the ring are its radius and its radius less the band',
    Math.abs(radii[1] - (ring.r / (view.span / 640))) < 0.01
    && Math.abs(radii[0] - ((ring.r - ring.band) / (view.span / 640))) < 0.01,
    `${radii.map((r) => r.toFixed(1)).join(' and ')} px, for ${ring.r} m and ${ring.r - ring.band} m`);

  const names = new Set(GUIDE_ZONES.map((z) => z.name.toUpperCase()));
  // the fill only: every name is drawn as a halo STROKE and then a fill, so
  // counting both would count each name twice
  const written = g.texts.filter((t) => names.has(t.text) && t.colour !== null);
  check('every space wide enough to hold its own name has it written at its middle, in small capitals',
    written.length === res.guide.named && res.guide.named === GUIDE_ZONES.length,
    `${res.guide.named} names at ${HOME_SPAN} m across`);
  check('and each name is at its own space and nowhere else',
    GUIDE_ZONES.every((zn) => {
      const [px, py] = atOf(zn);
      const t = written.find((w) => w.text === zn.name.toUpperCase());
      return t && Math.abs(t.x - px) < 0.01 && Math.abs(t.y - py) < 0.01;
    }));

  // the roads and the river, drawn under the outlines
  const ways = g.strokes.filter((st) => st.style === GUIDE_ROAD_INK || st.style === GUIDE_RIVER_INK);
  check('the two traced roads and the river are drawn, faint, as lines',
    res.guide.ways === 3 && ways.length === 3
    && ways.filter((w) => w.style === GUIDE_RIVER_INK).length === 1,
    `${ways.map((w) => w.pts.length).join('+')} points`);
  check('and the river really runs through the pixels the guide says it does',
    (() => {
      const river = ways.find((w) => w.style === GUIDE_RIVER_INK);
      return river.pts.every((pt, i) => {
        const [px, py] = toPixel(GUIDE_RIVER.pts[i].x, GUIDE_RIVER.pts[i].z, view.cx, view.cz, 640, view.span);
        return Math.abs(pt[0] - px) < 1e-9 && Math.abs(pt[1] - py) < 1e-9;
      });
    })());

  // the guide is drawn with no painting at all, because the BOUNDARIES are the
  // point and the picture is only the backing for them
  const g4 = painter();
  const r4 = drawMap(g4, { field, ...view, size: 640, discovered: [], zonesFound: [] });
  check('and all of it is drawn over the plain terrain too, when there is no painting',
    r4.guide.zones === GUIDE_ZONES.length && r4.guide.named === GUIDE_ZONES.length
    && r4.guide.ways === 3 && r4.guide.drawn === 0 && g4.images.length === 0,
    `layer "${r4.guide.layer}", art "${r4.guide.art}"`);

  // the hover, on the picture: one space in gold bright, and only one
  const g5 = painter();
  const r5 = drawMap(g5, { field, ...view, size: 640, discovered: [], zonesFound: [], guideHover: 'chalkpits' });
  const hot = g5.arcs.filter((a) => a.style === GUIDE_INK_HOT);
  const [cx5, cy5] = toPixel(GUIDE_BY_ID.chalkpits.x, GUIDE_BY_ID.chalkpits.z, view.cx, view.cz, 640, view.span);
  check('resting on a space picks that one out of the twelve and leaves the rest alone',
    hot.length === 1 && Math.hypot(hot[0].x - cx5, hot[0].y - cy5) < 0.01
    && r5.guide.zones === GUIDE_ZONES.length,
    `${hot.length} highlighted of ${r5.guide.zones}`);

  // and at the whole world the smallest of them are dropped rather than drawn
  // as a smudge with a name under it
  const g6 = painter();
  const r6 = drawMap(g6, { field, cx: 0, cz: 0, span: MAP_MAX_SPAN, size: 640, discovered: [], zonesFound: [] });
  check('at the whole world the names come off the smallest spaces, and the ring keeps its',
    r6.guide.named < r6.guide.zones && r6.guide.named > 0,
    `${r6.guide.zones} outlined and ${r6.guide.named} named at ${spanText(MAP_MAX_SPAN)}`);
}

console.log('\nwin_map MAP3: the three grounds');
{
  const view = { cx: 0, cz: 0, span: HOME_SPAN };
  const run = (layers, art) => {
    const g = painter();
    const res = drawMap(g, { field, ...view, size: 640, discovered: [], zonesFound: [], layers, guideArt: art });
    return { g, res };
  };
  const both = run('both', READY_ART);
  check('"both" lays the picture down and then the terrain over it, at 35 percent',
    both.res.guide.layer === 'both' && both.g.images.length === 1
    && both.g.alphas.includes(GUIDE_TERRAIN_ALPHA) && both.res.samples > 0,
    `alphas ${[...new Set(both.g.alphas)].join(', ')}, ${both.res.samples} field samples`);

  const only = run('painting', READY_ART);
  check('"painting" is the sheet alone, and the field is not read at all',
    only.res.guide.layer === 'painting' && only.g.images.length === 1 && only.res.samples === 0,
    `${only.res.samples} field samples against ${both.res.samples}`);

  const terr = run('terrain', READY_ART);
  check('"terrain" is the map as it was, with no picture and no half tone',
    terr.res.guide.layer === 'terrain' && terr.g.images.length === 0
    && terr.res.samples === both.res.samples && !terr.g.alphas.includes(GUIDE_TERRAIN_ALPHA));

  // and all three come to the terrain when the picture is not there, whatever
  // the button was last pressed for
  for (const want of ['painting', 'both', 'terrain']) {
    check(`asking for "${want}" with no painting gives the terrain and does not throw`,
      run(want, { state: 'missing' }).res.guide.layer === 'terrain');
  }
  check('layerFor is the one place that decides, and it is driven both ways',
    layerFor('painting', 'ready') === 'painting' && layerFor('painting', 'missing') === 'terrain'
    && layerFor('nonsense', 'ready') === 'both');
}

console.log('\nwin_map MAP3: the column says what goes where');
{
  const m = sideModel({ field, cx: 0, cz: 0, view: { cx: 0, cz: 0, span: HOME_SPAN }, discovered: [], zonesFound: [] });
  check('the column lists all twelve spaces, nearest first',
    m.guide.zones.length === 12 && m.guide.zones.every((g, i, a) => i === 0 || a[i - 1].dist <= g.dist),
    m.guide.zones.slice(0, 3).map((g) => `${g.name} ${Math.round(g.dist)} m`).join(', '));
  check('and every row carries a way to walk it and a boundary to look for',
    m.guide.zones.every((g) => g.way && g.bearing && g.r > 0));
  check('with nothing under the cursor there is no hover, and that is not an error',
    m.guide.hover === null);

  const hov = sideModel({ field, cx: 0, cz: 0, view: { cx: 0, cz: 0, span: HOME_SPAN }, discovered: [], zonesFound: [], guideHover: 'millrun' });
  const mill = GUIDE_BY_ID.millrun;
  check('resting on a space gives the column that space, with its line and its models',
    hov.guide.hover && hov.guide.hover.id === 'millrun'
    && hov.guide.hover.line === mill.line
    && hov.guide.hover.models.join() === mill.models.join()
    && hov.guide.hover.models.includes('mill_wheel'),
    `${hov.guide.hover.models.length} models: ${hov.guide.hover.models.slice(0, 4).join(', ')}...`);
  check('and what the doc names and nobody has modelled is on the same card, kept apart',
    hov.guide.hover.wanted.length === 1, hov.guide.hover.wanted.join(', '));
  check('exactly one row is marked as the hovered one',
    hov.guide.zones.filter((g) => g.hover).length === 1);
  check('and the model list is the FOOTPRINT table, so a hover never promises a prop that does not exist',
    m.guide.zones.every((g) => g.models.every((id) => !!FOOTPRINT[id])),
    `${m.guide.zones.reduce((n, g) => n + g.models.length, 0)} model ids`);
  check('the column says what the picture is doing and where the file goes',
    m.guide.art.state !== 'ready' && m.guide.art.file === 'public/maps/greenwold.png'
    && m.guide.art.missing.includes('public/maps/greenwold.png'),
    m.guide.art.missing);
}

console.log('\nwin_map MAP3: the panel, driven for real');
{
  const character = { discovered: [], zones: [], waypoint: null };
  const ctx = {
    runtime: { field },
    character,
    player: { pos: { x: 0, z: 0 }, yaw: 0 },
    state: { touch() {} },
    hud: { toast() {} },
  };
  const p = Object.create(panel);
  const root = document.createElement('div');
  p.build(root, ctx);
  p.open(ctx);
  const rows = walk(p._side).filter((n) => n.className.includes('bw-map-row') && n.className.includes('guide'));
  check('the column really builds a row for every space', rows.length === 12, `${rows.length} rows`);
  check('and every one of them says on hover what it is for and how much goes in it',
    rows.every((r) => typeof r.title === 'string' && r.title.length > 25 && /model/.test(r.title)),
    rows[0].title);

  // a missing painting is SAID, in the footer, with the path to fix it, and
  // nothing about the draw throws on the way there
  check('with no painting the footer says so and names the file',
    p._foot.textContent.includes('public/maps/greenwold.png'), p._foot.textContent);
  check('and the map still drew, with all twelve outlines over the terrain',
    p.lastDraw && p.lastDraw.guide.zones === 12 && p.lastDraw.guide.drawn === 0,
    `layer "${p.lastDraw.guide.layer}"`);

  // the button. It says which of the three it is on and what it will do next.
  const buttons = walk(p._tools).filter((n) => n.tagName === 'BUTTON');
  const ground = buttons[buttons.length - 1];
  check('the ground button names the layer it is on', /^ground: /.test(ground.textContent), ground.textContent);
  check('and says on hover what that layer is and what pressing it will do',
    /Press to show /.test(ground.title) && ground.title.length > 60, ground.title);
  const before = ground.textContent;
  ground.fire('click');
  check('pressing it moves the want on and the map stays on the terrain, because that is all there is',
    p._layers === 'terrain' && p.lastDraw.guide.layer === 'terrain' && ground.textContent === before,
    `${p._layers}: "${p._say.textContent}"`);
  ground.fire('click');
  check('and pressing it round to the painting, with no painting, says where the file goes rather than changing nothing in silence',
    p._layers === 'painting' && p.lastDraw.guide.layer === 'terrain'
    && p._say.textContent.includes('public/maps/greenwold.png'),
    p._say.textContent);
  ground.fire('click');
  check('and round again to both, which is where it started',
    p._layers === 'both', p._layers);

  // the hover: one repaint per CHANGE of space and not one per pointer move
  let drew = 0;
  const realRedraw = p.redraw.bind(p);
  p.redraw = () => { drew++; return realRedraw(); };
  const [hx, hy] = toPixel(GUIDE_BY_ID.hearthhome.x, GUIDE_BY_ID.hearthhome.z, p._view.cx, p._view.cz, 640, p._view.span);
  p.hoverAt({ clientX: hx, clientY: hy });
  check('resting on the painted village names it in the map\'s own line',
    p._guideHover === 'hearthhome' && /Hearthhome/.test(p._say.textContent), p._say.textContent);
  check('and the column now lists what goes in it',
    p.lastSide.guide.hover && p.lastSide.guide.hover.id === 'hearthhome'
    && p.lastSide.guide.hover.models.includes('well_pavilion'));
  const after = drew;
  for (let i = 0; i < 20; i++) p.hoverAt({ clientX: hx + (i % 3), clientY: hy + (i % 2) });
  check('twenty more moves inside the same space cost NOT ONE repaint',
    drew === after, `${drew - after} repaints for 20 pointer moves`);
  p.hoverAt({ clientX: 5, clientY: 5 });
  check('and moving off it costs exactly one, and clears the hover',
    drew === after + 1 && p._guideHover === null, `${drew - after} repaints`);

  // a row of the column is a hover too, for a space that is off the picture
  const cold = rows.find((r) => r.dataset.guide === 'coldwake');
  cold.fire('mouseenter');
  check('resting on a ROW does the same as resting on the map', p._guideHover === 'coldwake');
  cold.fire('click');
  check('and clicking one sets the waypoint on it, and says so',
    character.waypoint && character.waypoint.name === 'Coldwake'
    && /Coldwake/.test(p._say.textContent), p._say.textContent);
  check('at the world point the guide says, and not at the old generated one',
    Math.abs(character.waypoint.x - GUIDE_BY_ID.coldwake.x) < 1e-9
    && Math.abs(character.waypoint.z - GUIDE_BY_ID.coldwake.z) < 1e-9,
    `${Math.round(character.waypoint.x)}, ${Math.round(character.waypoint.z)}`);
}

console.log('\nwin_map MAP3: the key names every new mark');
{
  check('the outlines, the traced ways and the river all have a row in the key',
    ['guide', 'guideway', 'guideriver'].every((id) => LEGEND.some((r) => r.id === id)),
    LEGEND.filter((r) => /^guide/.test(r.id)).map((r) => r.label).join('; '));
  check('and the audit that keeps the key honest still passes', !!auditMapWords());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
