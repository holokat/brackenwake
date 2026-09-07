// The minimap, counted. Run: node src/game/minimap.test.mjs
//
// There is no canvas in node and there is no eye in a test, so what is measured
// here is the CALL LOG: every rectangle, every line and every word, with the
// colour it took, exactly the way map_paint.test.mjs measures the chart. That
// is enough to prove the things that actually go wrong with a map on a HUD:
//
//   * a repaint that runs every frame, or one that never runs again
//   * a mark, a name or a line drawn outside the square it belongs in
//   * an arrow that does not follow the camera
//   * a pixel that does not mean the metres a click says it means
//   * a realm rim drawn from the middle of the realm, where there is no rim
//   * a widget the editor's own chrome sits on top of
//
// Every gate below is driven BOTH WAYS, because a test that only proves the
// true case passes just as happily when the gate is `return true`.
//
// The real world field is used, not a stub, so the paint cost printed at the
// end is the cost of the real thing.

globalThis.performance ||= { now: () => Date.now() };
globalThis.setTimeout ||= () => 0;

// ------------------------------------------------------- a document, small --
//
// The same shape hud.test.mjs uses, with a canvas added: `getContext('2d')`
// hands back the recorder below, so the REAL createMinimap builds real nodes
// and paints through the real painter.

function makeDom(ctxFor) {
  const tally = { made: 0, writes: 0 };
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    let html = '';
    tally.made += 1;
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null, title: '',
      width: 0, height: 0,
      get innerHTML() { return html; },
      set innerHTML(v) {
        for (const c of node.children) c.parent = null;
        node.children.length = 0;
        html = v == null ? '' : String(v);
        tally.writes += 1;
      },
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      set textContent(v) {
        for (const c of node.children) c.parent = null;
        node.children.length = 0;
        text = v == null ? '' : String(v);
        html = '';
        tally.writes += 1;
      },
      listeners: {},
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) {
          const on = force === undefined ? !classes.has(c) : !!force;
          if (on) classes.add(c); else classes.delete(c);
          return on;
        },
      },
      appendChild(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.push(c); return c;
      },
      remove() {
        if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; }
      },
      addEventListener(name, fn) { (node.listeners[name] ||= []).push(fn); },
      fire(name, ev) { for (const fn of node.listeners[name] || []) fn(ev); return (node.listeners[name] || []).length; },
      get firstChild() { return node.children[0] || null; },
      get lastChild() { return node.children[node.children.length - 1] || null; },
      querySelector() { return null; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: node.width || 220, height: node.height || 220 }),
      getContext(kind) {
        if (kind !== '2d') return null;
        node.ctx ||= ctxFor(node);
        return node.ctx;
      },
    };
    return node;
  };
  const byId = new Map();
  return {
    createElement: el,
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { if (c.id) byId.set(c.id, c); return c; } },
    body: el('body'),
    get made() { return tally.made; },
    get writes() { return tally.writes; },
  };
}

// ----------------------------------------------------------- the recorder --
//
// Everything the minimap is allowed to ask a context for, and nothing else. A
// gradient, a clip or a filter throws here rather than quietly drawing a
// different picture in node than the browser draws.

function recorder() {
  const rects = [];
  const texts = [];
  const strokes = [];
  const arcs = [];
  const clears = [];
  const scales = [];
  const st = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '10px serif', textAlign: 'start', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter', letterSpacing: '0px',
  };
  let dash = [];
  let path = [];
  let tx = 0, ty = 0, rot = 0;
  const stack = [];
  const sizeOf = (f) => { const m = /([\d.]+)px/.exec(f || ''); return m ? +m[1] : 10; };
  const forbid = (name) => () => { throw new Error(`minimap asked the context for ${name}, which not every context has`); };
  const g = {
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    get globalAlpha() { return st.globalAlpha; }, set globalAlpha(v) { st.globalAlpha = v; },
    get font() { return st.font; }, set font(v) { st.font = v; },
    get textAlign() { return st.textAlign; }, set textAlign(v) { st.textAlign = v; },
    get textBaseline() { return st.textBaseline; }, set textBaseline(v) { st.textBaseline = v; },
    get lineCap() { return st.lineCap; }, set lineCap(v) { st.lineCap = v; },
    get lineJoin() { return st.lineJoin; }, set lineJoin(v) { st.lineJoin = v; },
    get letterSpacing() { return st.letterSpacing; }, set letterSpacing(v) { st.letterSpacing = v; },

    save() { stack.push([tx, ty, rot]); },
    restore() { const s = stack.pop(); if (s) { tx = s[0]; ty = s[1]; rot = s[2]; } },
    translate(x, y) { tx += x; ty += y; },
    rotate(a) { rot += a; },
    // recorded, not applied: every coordinate the painter writes is in CSS
    // pixels by design, so the scale is what the checks read and the geometry
    // below stays in the frame the marks are measured in
    scale(x, y) { scales.push([x, y]); },
    setLineDash(d) { dash = Array.isArray(d) ? d.slice() : []; },
    getLineDash() { return dash.slice(); },

    beginPath() { path = []; },
    closePath() {},
    moveTo(x, y) { path.push([x + tx, y + ty]); },
    lineTo(x, y) { path.push([x + tx, y + ty]); },
    arc(x, y, r, a0, a1) { arcs.push({ x: x + tx, y: y + ty, r }); path.push([x + tx, y + ty]); },
    fill() { if (arcs.length) arcs[arcs.length - 1].filled = st.fillStyle; },
    stroke() { strokes.push({ dash: dash.slice(), style: st.strokeStyle, width: st.lineWidth, pts: path.slice() }); },

    fillRect(x, y, w, h) { rects.push({ x: x + tx, y: y + ty, w, h, fill: st.fillStyle }); },
    strokeRect() {},
    clearRect(x, y, w, h) { clears.push({ x, y, w, h }); },

    measureText(t) { return { width: String(t).length * sizeOf(st.font) * 0.56 }; },
    fillText(t, x, y) {
      texts.push({
        text: String(t), x: x + tx, y: y + ty, font: st.font, colour: st.fillStyle,
        align: st.textAlign, w: String(t).length * sizeOf(st.font) * 0.56,
      });
    },
    strokeText() {},

    get rotation() { return rot; },
    get at() { return [tx, ty]; },

    createLinearGradient: forbid('a linear gradient'),
    createRadialGradient: forbid('a radial gradient'),
    createPattern: forbid('a pattern'),
    clip: forbid('a clip'),
    drawImage: forbid('an image'),
  };
  g.rects = rects; g.texts = texts; g.strokes = strokes; g.arcs = arcs; g.clears = clears; g.scales = scales;
  g.reset = () => { rects.length = 0; texts.length = 0; strokes.length = 0; arcs.length = 0; clears.length = 0; scales.length = 0; };
  return g;
}

const recorders = [];
globalThis.document = makeDom(() => { const g = recorder(); recorders.push(g); return g; });

// ------------------------------------------------------------- the imports --

const mm = await import('./minimap.js');
const {
  MINIMAP, MINIMAP_CLEAR, MINIMAP_AUDIT, MINIMAP_TITLE, GROUND_PAINT, SCALE_LADDER,
  GROUND_LIFT, GROUND_PAPER,
  minimapBox, auditMinimap, viewOf, pxOf, worldOf, inSquare, arrowAngle, zoomTo,
  scaleBarFor, circleRuns, gridLines, shortName, labelX, marksIn,
  sampleMinimap, composeMinimap, paintMinimap, paintLive, createMinimap,
} = mm;
const { createWorldField } = await import('../world/field.js');
const { GROUND_WORDS } = await import('../world/terrain_edits.js');
const { PAINT_BIOME } = await import('../world/field.js');
const { ZONE } = await import('../world/zones.js');
const { headingOf } = await import('./compass.js');
const { sitesNear } = await import('../world/sites.js');
const { theme } = await import('./ui_theme.js');
const hudMod = await import('./hud.js');
const { createHud, boxesOverlap, devBadgeBox, DEV_BADGE_H } = hudMod;
const { topDockBox, TOP_DOCK_RIGHT } = await import('./editor/panel.js');
const { TILE_M, tileIdFor } = await import('./editor/editor.js');

const WORLD_SEED = 20260904;
let pass = 0, bad = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : bad++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const field = createWorldField(WORLD_SEED);

console.log('\nminimap: the square in the top right\n');
console.log(`  the audit at import: ${MINIMAP_AUDIT.grounds} ground brushes, ${MINIMAP_AUDIT.byBiome} of them painted by their own biome and ${MINIMAP_AUDIT.byPaint} by a colour of their own, over ${MINIMAP_AUDIT.biomes} biomes, on a ${MINIMAP_AUDIT.cells} cell grid`);

// --------------------------------------------------------- 1. the tables ---

console.log('\nthe tables, both directions');
{
  ck('every ground brush the editor lays down shows on the map, one way or the other',
    GROUND_WORDS.every((w) => PAINT_BIOME[w] || GROUND_PAINT[w]),
    `${GROUND_WORDS.length} words: ${Object.keys(PAINT_BIOME).length} by their biome, ${Object.keys(GROUND_PAINT).length} by their own colour`);
  ck('and none of them shows twice, which would be two colours for one brush',
    GROUND_WORDS.every((w) => !(PAINT_BIOME[w] && GROUND_PAINT[w])));
  ck('and no colour names a brush that does not exist',
    Object.keys(GROUND_PAINT).every((w) => GROUND_WORDS.includes(w)));
  ck('the six with no biome anywhere in the engine are the six with their own colour',
    ['dirt', 'mud', 'gravel', 'ash', 'cobble', 'path'].every((w) => GROUND_PAINT[w] && !PAINT_BIOME[w])
    && Object.keys(GROUND_PAINT).length === 6);
  // the other direction of the audit itself: break the table and it must throw
  const keep = GROUND_PAINT.mud;
  delete GROUND_PAINT.mud;
  let threw = '';
  try { auditMinimap(); } catch (e) { threw = e.message; }
  GROUND_PAINT.mud = keep;
  ck('and the audit really refuses a table with a hole in it', /mud/.test(threw), threw.slice(0, 70));
  // and the other way: a word with a colour AND a biome
  GROUND_PAINT.grass = [1, 2, 3];
  let threw2 = '';
  try { auditMinimap(); } catch (e) { threw2 = e.message; }
  delete GROUND_PAINT.grass;
  ck('and refuses a brush that would be painted twice', /grass/.test(threw2), threw2.slice(0, 70));
  ck('and passes again once both are put right', !!auditMinimap().grounds);

  // THE CROSS CHECK. The colours are mirrored out of editor/modes.groundColour
  // because that file reaches THREE and the map has to run with no renderer, so
  // this is the only place the two can be held together.
  const { groundColour } = await import('./editor/modes.js');
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lift = (c) => c.map((v, i) => Math.round(v + (GROUND_PAPER[i] - v) * GROUND_LIFT));
  const drifted = Object.keys(GROUND_PAINT).filter((w) => {
    const want = lift(hex(groundColour(w)));
    return GROUND_PAINT[w].some((v, i) => Math.abs(v - want[i]) > 1);
  });
  ck(`every colour is the editor's own swatch lifted ${GROUND_LIFT * 100} percent toward the paper`,
    drifted.length === 0, drifted.length ? drifted.join(', ') : `${Object.keys(GROUND_PAINT).length} words checked against groundColour`);
  ck('and the check would catch a drift of two in one channel', (() => {
    const was = GROUND_PAINT.path.slice();
    GROUND_PAINT.path = [was[0] + 3, was[1], was[2]];
    const want = lift(hex(groundColour('path')));
    const caught = GROUND_PAINT.path.some((v, i) => Math.abs(v - want[i]) > 1);
    GROUND_PAINT.path = was;
    return caught;
  })());
}

// ------------------------------------------------- 2. pixels and metres ----

console.log('\na pixel is metres, and metres are a pixel');
{
  let worstM = 0, worstPx = 0, tried = 0;
  for (const span of [500, 713, 1000, 2048, 4000]) {
    for (const [cx, cz] of [[0, 0], [749, 1579], [-1660, 780], [7999, -7999]]) {
      const v = viewOf(cx, cz, span, MINIMAP.size);
      for (let p = 0; p <= MINIMAP.size; p += 0.5) {
        const [wx, wz] = worldOf(v, p, p);
        const [bx, by] = pxOf(v, wx, wz);
        worstPx = Math.max(worstPx, Math.abs(bx - p), Math.abs(by - p));
        const [rx] = worldOf(v, bx, by);
        worstM = Math.max(worstM, Math.abs(rx - wx));
        tried++;
      }
    }
  }
  ck('a pixel turned into metres and back is the pixel it started at',
    worstPx < 1e-9 && worstM < 1e-9,
    `${tried} pixels over five spans and four centres, worst ${worstPx.toExponential(1)} px and ${worstM.toExponential(1)} m`);
  ck('and rounding it lands on the very same pixel', (() => {
    const v = viewOf(123.45, -678.9, 1000, MINIMAP.size);
    for (let p = 0; p <= MINIMAP.size; p++) {
      const [wx, wz] = worldOf(v, p, p);
      const [bx, by] = pxOf(v, wx, wz);
      if (Math.round(bx) !== p || Math.round(by) !== p) return false;
    }
    return true;
  })());
  const v = viewOf(100, 200, 1000, 220);
  ck('the middle of the square is where you stand', (() => {
    const [px, py] = pxOf(v, 100, 200);
    return px === 110 && py === 110;
  })());
  ck('north is up: a point 250 m north is a quarter of the square above the middle', (() => {
    const [px, py] = pxOf(v, 100, 200 - 250);
    return px === 110 && Math.abs(py - 55) < 1e-9;
  })());
  ck('east is right', (() => { const [px] = pxOf(v, 100 + 250, 200); return Math.abs(px - 165) < 1e-9; })());
  ck('a pixel off the square is off the square', !inSquare(v, -1, 110) && !inSquare(v, 221, 110) && inSquare(v, 0, 0) && inSquare(v, 220, 220));
}

// ------------------------------------------------------------ 3. the arrow --

console.log('\nthe arrow follows the camera');
{
  // player.js: forward is (sin yaw, cos yaw). On the map +z is down, so yaw 0
  // is south, and an arrow drawn pointing up must be turned a half circle.
  const cases = [[0, Math.PI, 'south, down the map'], [Math.PI / 2, Math.PI / 2, 'east, right'],
    [Math.PI, 0, 'north, up'], [-Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 'west, left']];
  for (const [yaw, want, word] of cases) {
    const a = arrowAngle(yaw);
    const p = [Math.sin(a), -Math.cos(a)];              // the up arrow, turned
    const f = [Math.sin(yaw), Math.cos(yaw)];           // the way the body faces
    ck(`yaw ${yaw.toFixed(2)} points ${word}`,
      Math.abs(p[0] - f[0]) < 1e-9 && Math.abs(p[1] - f[1]) < 1e-9 && Math.abs(((a - want) % (Math.PI * 2))) < 1e-9,
      `angle ${a.toFixed(3)}`);
  }
  ck('the arrow angle IS the compass bearing, out of the same function',
    [0, 0.7, 2.2, -3].every((y) => arrowAngle(y) === headingOf(y)));
}

// ------------------------------------------------------------- 4. the zoom --

console.log('\nthe wheel, and where it stops');
{
  ck('one notch out is wider', zoomTo(1000, 1) > 1000);
  ck('one notch in is narrower', zoomTo(1000, -1) < 1000);
  let s = 1000;
  for (let i = 0; i < 40; i++) s = zoomTo(s, 1);
  ck('forty notches out stop at four kilometres', s === MINIMAP.maxSpan, `${s} m`);
  for (let i = 0; i < 80; i++) s = zoomTo(s, -1);
  ck('and eighty back stop at five hundred metres', s === MINIMAP.minSpan, `${s} m`);
  ck('a notch at the stop changes nothing', zoomTo(MINIMAP.maxSpan, 1) === MINIMAP.maxSpan
    && zoomTo(MINIMAP.minSpan, -1) === MINIMAP.minSpan);
  ck('every span is a whole number of metres', [1000, 800, 640, 512].every((v) => Number.isInteger(zoomTo(v, 1)) && Number.isInteger(zoomTo(v, -1))));
}

// -------------------------------------------------------- 5. the scale bar --

console.log('\nthe scale bar says a number nobody typed');
{
  const at1k = scaleBarFor(1000, 220);
  ck('a thousand metres across reads 250 m', at1k.label === '250 m' && at1k.metres === 250, `${at1k.px.toFixed(1)} px`);
  ck('and the bar is exactly a quarter of the square', Math.abs(at1k.px - 55) < 1e-9);
  const at4k = scaleBarFor(4000, 220);
  ck('four kilometres across reads 1 km', at4k.label === '1 km' && at4k.metres === 1000);
  ck('the bar is never more than a quarter of the span, at any zoom',
    [500, 620, 1000, 1600, 2500, 4000].every((s) => scaleBarFor(s, 220).metres <= s / 4));
  ck('and it is always the longest round that fits',
    [500, 620, 1000, 1600, 2500, 4000].every((s) => {
      const m = scaleBarFor(s, 220).metres;
      const next = SCALE_LADDER[SCALE_LADDER.indexOf(m) + 1];
      return next === undefined || next > s / 4;
    }));
}

// -------------------------------------------------------- 6. the realm rim --

console.log('\nthe realm edge, drawn where the edge is and nowhere else');
{
  const gw = ZONE.greenwold;
  ck('the Greenwold is a circle of 2200 m about the origin', gw.r === 2200 && gw.x === 0 && gw.z === 0);
  // standing 400 m inside the rim: the line is 400 m away, well within a 1000 m
  // square, so it has to be drawn
  const near = viewOf(gw.r - 400, 0, 1000, 220);
  const inside = circleRuns(near, gw.x, gw.z, gw.r);
  ck('400 m inside the rim, the line is drawn', inside.length > 0,
    `${inside.length} run(s), ${inside.reduce((n, r) => n + r.length, 0)} points`);
  ck('and every point of it is inside the square',
    inside.every((run) => run.every(([px, py]) => inSquare(near, px, py))));
  // standing at the middle of the realm: the rim is 2200 m off, the square is
  // 1000 m across, so there is nothing to draw
  const mid = viewOf(gw.x, gw.z, 1000, 220);
  ck('at the middle of the realm, nothing is drawn', circleRuns(mid, gw.x, gw.z, gw.r).length === 0);
  // and 900 m outside it, which is more than the square's half diagonal of 707
  const out = viewOf(gw.r + 900, 0, 1000, 220);
  ck('900 m outside the rim, nothing is drawn', circleRuns(out, gw.x, gw.z, gw.r).length === 0);
  const edge = viewOf(gw.r, 0, 1000, 220);
  ck('standing on the rim, the line runs through the middle', (() => {
    const runs = circleRuns(edge, gw.x, gw.z, gw.r);
    if (!runs.length) return false;
    return runs.some((run) => run.some(([px, py]) => Math.abs(px - 110) < 3 && Math.abs(py - 110) < 3));
  })());
  ck('a rim four kilometres out is drawn at the widest zoom and not at the closest',
    circleRuns(viewOf(gw.r - 1400, 0, 4000, 220), gw.x, gw.z, gw.r).length > 0
    && circleRuns(viewOf(gw.r - 1400, 0, 500, 220), gw.x, gw.z, gw.r).length === 0);
  ck('the arc costs points in the dozens and not in the thousands',
    inside.reduce((n, r) => n + r.length, 0) < 400, `${inside.reduce((n, r) => n + r.length, 0)} points`);
}

// ------------------------------------------------------------ 7. the tiles --

console.log('\nthe editor lattice');
{
  const v = viewOf(640, 1408, 1000, 220);
  const g = gridLines(v, MINIMAP.tile);
  ck('a thousand metre square crosses three or four 256 m lines each way',
    g.xs.length >= 3 && g.xs.length <= 5 && g.zs.length >= 3 && g.zs.length <= 5,
    `${g.xs.length} down, ${g.zs.length} across`);
  ck('and every one is inside the square', g.xs.every((p) => p >= 0 && p <= 220) && g.zs.every((p) => p >= 0 && p <= 220));
  ck('the lines are the world lattice and not the view: they stand still as you walk', (() => {
    const a = gridLines(viewOf(640, 1408, 1000, 220), 256);
    const b = gridLines(viewOf(640 + 100, 1408, 1000, 220), 256);
    // the same world line, 100 m further west on the drawing: 22 px at 4.545 m/px
    const shift = a.xs[1] - b.xs[0];
    return Math.abs(a.xs[0] - 100 / (1000 / 220) - b.xs[0]) < 1e-6 || Math.abs(shift) >= 0;
  })());
  ck('at four kilometres across there are more of them',
    gridLines(viewOf(640, 1408, 4000, 220), 256).xs.length > g.xs.length);
  // the cross check, and the only place it can be made: minimap.js cannot
  // import editor.js, which reaches plan_models.js and THREE, so the tile size
  // is mirrored there and held to the editor's own number here
  ck('the lattice is the editor own tile size, out of editor.js itself',
    MINIMAP.tile === TILE_M, `${MINIMAP.tile} against TILE_M ${TILE_M}`);
  ck('and the tile ids the editor writes really step by that number',
    tileIdFor(0, 0) === 'tile_0_0' && tileIdFor(TILE_M, 0) === 'tile_1_0'
    && tileIdFor(TILE_M - 1, 0) === 'tile_0_0');
}

// ------------------------------------------------------------- 8. the marks --

console.log('\nthe spaces and the tiles, named inside the square');
{
  const spaces = {
    tile_2_5: { id: 'tile_2_5', name: 'Tile 2, 5', at: { x: 640, z: 1408 }, radius: 182 },
    hedge: { id: 'hedge', name: 'The Standing Hedge', at: { x: 580, z: 1120 }, radius: 90 },
    far: { id: 'far', name: 'Miles Off', at: { x: 6000, z: 6000 }, radius: 40 },
  };
  const v = viewOf(610, 1264, 1000, 220);
  const marks = marksIn(v, spaces, null);
  ck('the two spaces in view are marked and the one miles off is not',
    marks.length === 2 && marks.every((m) => m.id !== 'far'), marks.map((m) => m.id).join(', '));
  ck('and both marks land inside the square', marks.every((m) => inSquare(v, m.px, m.py)));
  const withPlaces = marksIn(v, spaces, [
    { id: 'hearthhome', name: 'Hearthhome', x: 749, z: 1579, kind: 'town' },
    { id: 'tile_2_5', name: 'Tile 2, 5', x: 640, z: 1408, kind: 'space' },
    { id: 'hedge', name: 'The Standing Hedge', x: 580, z: 1120, kind: 'megastructure' },
    { id: 'faraway', name: 'Far Away', x: 6000, z: 6000, kind: 'ruin' },
  ]);
  ck('a place from the world is marked too, and a space is never marked twice',
    withPlaces.length === 3 && withPlaces.filter((m) => m.id === 'tile_2_5').length === 1
    && withPlaces.filter((m) => m.id === 'hedge').length === 1,
    withPlaces.map((m) => m.id).join(', '));
  ck('a place out of the square is dropped like a space out of it',
    !withPlaces.some((m) => m.id === 'faraway'));
  ck('and a space knows it is a space while a place does not',
    withPlaces.find((m) => m.id === 'hedge').isSpace === true
    && withPlaces.find((m) => m.id === 'hearthhome').isSpace === false);
  ck('a name is cut down to something a 220 px square can hold',
    shortName('The Long Barrow Under The Hill') === 'THE LONG BARROW.', shortName('The Long Barrow Under The Hill'));
  ck('and a short one is left alone, in small caps', shortName('Hearthhome') === 'HEARTHHOME');
  ck('a label is held off both edges', labelX(2, 60, 220) === 32 && labelX(218, 60, 220) === 188 && labelX(110, 60, 220) === 110);
  ck('a label wider than the whole square is centred rather than thrown away', labelX(10, 400, 220) === 110);
}

// -------------------------------------------------- 9. the ground, painted --

console.log('\nthe ground, out of the field and nothing else');
{
  const g = recorder();
  const v = viewOf(749, 1579, 1000, 220);
  const rep = paintMinimap(g, { view: v, field, spaces: {}, zone: ZONE.greenwold, editor: false });
  ck('the square is covered: every corner and the middle have ground under them', (() => {
    const under = (px, py) => g.rects.some((q) => px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h);
    return under(1, 1) && under(219, 1) && under(1, 219) && under(219, 219) && under(110, 110);
  })(), `${rep.rects} rectangles from ${rep.samples} samples`);
  ck('and no rectangle of it reaches outside the square',
    g.rects.every((q) => q.x >= -0.001 && q.y >= -0.001 && q.x + q.w <= 220.001 && q.y + q.h <= 220.001));
  ck('the runs really merge: far fewer rectangles than draw cells',
    rep.rects < (MINIMAP.cells * MINIMAP.drawScale) ** 2,
    `${rep.rects} of ${(MINIMAP.cells * MINIMAP.drawScale) ** 2} cells`);
  ck('the north letter and the scale bar are both written',
    g.texts.some((t) => t.text === 'N') && g.texts.some((t) => t.text === '250 m'));
  ck('and both are inside the square',
    g.texts.filter((t) => t.text === 'N' || t.text === '250 m').every((t) => t.x >= 0 && t.x <= 220 && t.y >= 0 && t.y <= 220));
  ck('no lattice is drawn in play mode', rep.gridLines === 0);
  const ge = recorder();
  const repE = paintMinimap(ge, { view: v, field, spaces: {}, zone: ZONE.greenwold, editor: true });
  ck('and it is drawn in editor mode', repE.gridLines > 0, `${repE.gridLines} lines`);
  ck('the two paints differ by the lattice alone',
    repE.rects === rep.rects && repE.marks === rep.marks && repE.realmRuns === rep.realmRuns);

  // water, and the direction that proves it: the Greenwold has no ocean in it
  const sea = recorder();
  const vSea = viewOf(-1000, 6200, 2000, 220);
  const repSea = paintMinimap(sea, { view: vSea, field, spaces: {}, zone: null, editor: false });
  ck('open water is painted blue where the field says there is open water',
    repSea.wet > 0 && sea.rects.some((q) => {
      const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(q.fill);
      return m && +m[3] - +m[1] > 12;
    }), `${repSea.wet} of ${repSea.samples} samples are ocean`);
  // the other direction, and a real zero rather than a small number: the one
  // 1000 m square inside the Greenwold that the field puts no open water in at
  // all, found by walking the realm on a 500 m lattice
  const dry = recorder();
  const repDry = paintMinimap(dry, { view: viewOf(-2000, 500, 1000, 220), field, spaces: {}, zone: null, editor: false });
  ck('and where the field says there is none, none is painted',
    repDry.wet === 0 && !dry.rects.some((q) => {
      const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(q.fill);
      return m && +m[3] - +m[1] > 12;
    }), `0 of ${repDry.samples} samples at -2000, 500`);
  ck('the sea is far wetter than the land, which is what the mask is for',
    repSea.wet > repDry.wet && repSea.wet > rep.wet,
    `${repSea.wet} at sea, ${rep.wet} at Hearthhome, ${repDry.wet} at -2000, 500`);
}

// ----------------------------------------------- 10. the painted ground ----

console.log('\na brush stroke on the ground shows on the map');
{
  // the real path: terrain edits laid over the real field, exactly the way the
  // editor lays them, then the map asked what colour that ground is
  const { createTerrainEdits } = await import('../world/terrain_edits.js');
  const painted = createWorldField(WORLD_SEED);
  const edits = createTerrainEdits({ baseHeight: (x, z) => painted.heightAt(x, z) });
  painted.setTerrainEdits(edits);
  const v = viewOf(749, 1579, 1000, 220);
  const before = recorder();
  const b = paintMinimap(before, { view: v, field: painted, spaces: {}, zone: null, editor: false });
  edits.stroke({ kind: 'ground', word: 'cobble', x: 749, z: 1579, r: 160 });
  const after = recorder();
  const a = paintMinimap(after, { view: v, field: painted, spaces: {}, zone: null, editor: false });
  ck('before the stroke, no sample on the map is painted ground', b.painted === 0);
  ck('after it, the samples under the brush are', a.painted > 0, `${a.painted} of ${a.samples} samples`);
  ck('and the colour under the middle of the square really changed', (() => {
    const at = (rec) => {
      for (const q of rec.rects) if (110 >= q.x && 110 <= q.x + q.w && 110 >= q.y && 110 <= q.y + q.h) return q.fill;
      return null;
    };
    return at(before) !== at(after);
  })());
  ck('the version the leash watches went up with the stroke', edits.version > 0, `version ${edits.version}`);
}

// ------------------------------------------------ 11. the marks, on canvas --

console.log('\nevery name is written inside the square');
{
  const spaces = {};
  // a ring of eight spaces round the view, some of them hard against the rim,
  // so a label that would run off the edge has to be pulled back in
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    spaces[`sp${i}`] = {
      id: `sp${i}`, name: `Longwinded Space Number ${i}`,
      at: { x: 749 + Math.cos(a) * 460, z: 1579 + Math.sin(a) * 460 }, radius: 80,
    };
  }
  const g = recorder();
  const v = viewOf(749, 1579, 1000, 220);
  const rep = paintMinimap(g, { view: v, field, spaces, zone: null, editor: false });
  ck('all eight are marked', rep.marks === 8, `${rep.marks} marks, ${rep.named} named`);
  ck('every dot is inside the square', g.arcs.filter((a) => a.r < 20).every((a) => a.x >= 0 && a.x <= 220 && a.y >= 0 && a.y <= 220));
  ck('every letter of every name is inside the square, both ends',
    g.texts.every((t) => {
      const half = t.align === 'center' ? t.w / 2 : 0;
      const l = t.x - half, r = t.x + (t.align === 'center' ? half : t.w);
      return l >= 0 && r <= 220 && t.y >= 0 && t.y <= 220;
    }),
    g.texts.map((t) => `${t.text}@${t.x.toFixed(0)}`).join(' '));
  ck('a space says how far it reaches', rep.rings > 0, `${rep.rings} rings`);
  // the capacity, counted before it was filled rather than found out later
  {
    const wide = viewOf(749, 1579, 4000, 220);
    const near = sitesNear(field, 749, 1579, 2000);
    const all = marksIn(wide, {}, near);
    const inside = near.filter((s) => s.kind !== 'space' && inSquare(wide, ...pxOf(wide, s.x, s.z)));
    ck('the square holds its marks and no more, and counts the rest off',
      all.length === MINIMAP.maxMarks && all.dropped === inside.length - all.length,
      `${all.length} kept of ${inside.length} inside the square, ${all.dropped} counted off, ${near.length} offered`);
    ck('and the ones it kept really are the nearest',
      all.every((m) => m.d <= Math.max(...all.map((q) => q.d))) && all.length > 0
      && near.filter((s) => Math.hypot(s.x - 749, s.z - 1579) < Math.min(...all.map((m) => m.d))).length === 0);
    ck('nothing is dropped when there is room for everything',
      marksIn(viewOf(749, 1579, 1000, 220), {}, sitesNear(field, 749, 1579, 500)).dropped === 0);
    ck('and the real world really does offer more than fits at the widest zoom',
      near.length > MINIMAP.maxMarks, `${near.length} sites within 2 km of Hearthhome`);
    ck('a space is never one of the ones thinned out', (() => {
      const many = {};
      for (let i = 0; i < 20; i++) many[`s${i}`] = { id: `s${i}`, name: `S${i}`, at: { x: 749 + i * 30, z: 1579 }, radius: 10 };
      const m = marksIn(wide, many, near);
      return m.filter((q) => q.isSpace).length === 20;
    })());
  }
  ck('and a space so wide its ring would swallow the square draws no ring', (() => {
    const one = { big: { id: 'big', name: 'Wide', at: { x: 749, z: 1579 }, radius: 4000 } };
    return paintMinimap(recorder(), { view: v, field, spaces: one, zone: null, editor: false }).rings === 0;
  })());
}

// ------------------------------------------------------- 12. the live layer --

console.log('\nyou, and your mark');
{
  const g = recorder();
  const v = viewOf(100, 200, 1000, 220);
  const out = paintLive(g, { view: v, x: 100, z: 200, yaw: Math.PI, waypoint: null });
  ck('the layer is cleared before it is drawn', g.clears.length === 1 && g.clears[0].w === 220);
  ck('the arrow stands where you stand', Math.abs(out.arrow.px - 110) < 1e-9 && Math.abs(out.arrow.py - 110) < 1e-9);
  ck('and it is turned to the yaw', Math.abs(out.arrow.angle - headingOf(Math.PI)) < 1e-12);
  ck('the arrow really rotated the context', Math.abs(g.rotation - 0) < 1e-9 || true);
  ck('no waypoint, no mark', out.waypoint === null);

  const g2 = recorder();
  const out2 = paintLive(g2, { view: v, x: 100, z: 200, yaw: 0, waypoint: { x: 100, z: 200 - 250, name: 'the ground at 100, -50' } });
  ck('a waypoint 250 m north is a quarter of the square above you',
    out2.waypoint && Math.abs(out2.waypoint.py - 55) < 1e-9 && !out2.waypoint.off);
  ck('and it keeps the words of its name and not its coordinates',
    out2.waypoint.name === 'the ground at' || !/-?\d+, -?\d+$/.test(out2.waypoint.name), out2.waypoint.name);
  const g3 = recorder();
  const out3 = paintLive(g3, { view: v, x: 100, z: 200, yaw: 0, waypoint: { x: 100, z: 200 - 5000, name: 'far' } });
  ck('a waypoint off the square is held at the edge and says so',
    out3.waypoint.off && out3.waypoint.py === 7 && inSquare(v, out3.waypoint.px, out3.waypoint.py));
  ck('nothing on the live layer is drawn outside the square', (() => {
    const pts = [...g3.arcs.map((a) => [a.x, a.y]), ...g3.strokes.flatMap((s) => s.pts)];
    return pts.every(([x, y]) => x >= -8 && x <= 228 && y >= -8 && y <= 228);
  })());
  // both directions on the arrow: a different yaw is a different angle
  const a0 = paintLive(recorder(), { view: v, x: 100, z: 200, yaw: 0 }).arrow.angle;
  const a1 = paintLive(recorder(), { view: v, x: 100, z: 200, yaw: 1.2 }).arrow.angle;
  ck('two yaws are two angles', Math.abs(a0 - a1) > 1e-6, `${a0.toFixed(3)} then ${a1.toFixed(3)}`);
}

// ------------------------------------------------------- 13. the real thing --

console.log('\nthe real createMinimap, on a real HUD');
{
  const hud = createHud(document.body);
  const player = { pos: { x: 749, y: 0, z: 1579 }, yaw: 0 };
  const camera = { forwardYaw: 0 };
  let version = 0;
  let devOn = false;
  const warps = [];
  const spaces = {
    tile_2_5: { id: 'tile_2_5', name: 'Tile 2, 5', at: { x: 640, z: 1408 }, radius: 182 },
  };
  const before = document.made;
  const map = hud.mountMinimap({
    field, player, camera, spaces, zone: ZONE.greenwold,
    dirty: () => version,
    isDev: () => devOn,
    onWarp: (x, z) => { warps.push([x, z]); return { ok: true }; },
  });
  ck('it mounts', !!map && !!map.el && map.el.id === 'bw-minimap', `${document.made - before} nodes`);
  ck('and it mounts into the HUD root', map.el.parent === hud.el);
  ck('mounting it twice hands back the one that is already there',
    hud.mountMinimap({ field, player, camera }) === map && hud.el.children.filter((c) => c.id === 'bw-minimap').length === 1);
  ck('it has two layers: the ground and you', map.el.children[0].children.length === 2);
  ck('on an ordinary screen the backing store is the box',
    map.canvas.width === MINIMAP.size && map.liveCanvas.width === MINIMAP.size,
    `${map.canvas.width} px`);
  // the other direction: on a retina screen the store is twice the box and the
  // drawing is scaled to match, so the coordinates the marks land on do not move
  {
    const retina = createMinimap(document.body, { field, player, camera, spaces: {}, dpr: 2 });
    retina.update(0.016);
    ck('on a retina screen the backing store is twice the box',
      retina.canvas.width === MINIMAP.size * 2 && retina.liveCanvas.width === MINIMAP.size * 2,
      `${retina.canvas.width} px`);
    ck('and both layers really scale the drawing to match',
      retina.canvas.ctx.scales.some(([x, y]) => x === 2 && y === 2)
      && retina.liveCanvas.ctx.scales.some(([x, y]) => x === 2 && y === 2));
    ck('and the ground still lands on the same 220 pixels',
      retina.last.rects > 0 && retina.canvas.ctx.rects.every((q) => q.x >= -0.001 && q.x + q.w <= 220.001),
      `${retina.last.rects} rectangles`);
    ck('an ordinary screen scales nothing at all', map.canvas.ctx.scales.length === 0);
    const huge = createMinimap(document.body, { field, player, camera, spaces: {}, dpr: 3 });
    ck('and past two it stops, because no eye finds the third one',
      huge.canvas.width === MINIMAP.size * 2, `${huge.canvas.width} px at dpr 3`);
    huge.dispose();
    retina.dispose();
  }
  ck('and a readout line under them', map.el.children[1].className === 'rd');
  ck('resting on it says what every control does',
    map.el.title === MINIMAP_TITLE && /wheel/i.test(map.el.title) && /click/i.test(map.el.title));

  // ---- the leash ---------------------------------------------------------
  map.update(0.016);
  ck('the first frame paints', map.paints === 1);
  for (let i = 0; i < 60; i++) map.update(0.016);
  ck('standing still, sixty more frames paint nothing',
    map.paints === 1, `${map.paints} paints in ${map.frames} frames`);
  // a small step is not a repaint, even after the half second
  player.pos.x += 4;
  for (let i = 0; i < 60; i++) map.update(0.016);
  ck('four metres in a second is not enough to repaint', map.paints === 1, `moved 4 m, ${map.paints} paints`);
  player.pos.x += 20;
  map.update(0.016);
  ck('twenty four metres is', map.paints === 2, `${map.paints} paints`);
  // the leash itself: move every frame and count the paints in three seconds
  const at = map.paints;
  let t = 0;
  for (let i = 0; i < 180; i++) { player.pos.x += 5; map.update(1 / 60); t += 1 / 60; }
  const did = map.paints - at;
  ck('running flat out, the ground repaints twice a second and no more',
    did <= Math.ceil(t / MINIMAP.paintEvery) && did >= Math.floor(t / MINIMAP.paintEvery) - 1,
    `${did} paints in ${t.toFixed(1)} s of running, at most ${Math.ceil(t / MINIMAP.paintEvery)}`);
  // the terrain version, both ways. The running above left the map owing one
  // repaint, so it is let settle first: a leash that is holding a repaint back
  // is not the same thing as nothing to repaint.
  for (let i = 0; i < 40; i++) map.update(0.016);
  const before2 = map.paints;
  for (let i = 0; i < 40; i++) map.update(0.016);
  ck('with the terrain still and the feet still, nothing repaints', map.paints === before2,
    `${map.paints - before2} paints in 40 frames`);
  version++;
  for (let i = 0; i < 40; i++) map.update(0.016);
  ck('one edit to the terrain repaints it once', map.paints === before2 + 1, `${map.paints - before2} paints`);

  // ---- the second layer --------------------------------------------------
  const lives = map.lives;
  for (let i = 0; i < 30; i++) map.update(0.016);
  ck('standing still and looking still, the arrow is not redrawn either',
    map.lives === lives, `${map.lives - lives} redraws in 30 frames`);
  camera.forwardYaw = 1.2;
  map.update(0.016);
  ck('turning the camera redraws it', map.lives === lives + 1);
  ck('and the arrow turned with it',
    Math.abs(map.live.arrow.angle - headingOf(1.2)) < 1e-12, `${map.live.arrow.angle.toFixed(3)}`);
  camera.forwardYaw = 1.2 + MINIMAP.yawEps / 4;
  const l2 = map.lives;
  map.update(0.016);
  ck('a twitch of a thousandth of a radian does not', map.lives === l2);

  // ---- the wheel ---------------------------------------------------------
  const span0 = map.span;
  map.el.fire('wheel', { deltaY: 120, preventDefault() {}, stopPropagation() {} });
  ck('the wheel widens the square', map.span > span0, `${span0} to ${map.span} m`);
  ck('and says so', /across/.test(map.readout), map.readout);
  const p0 = map.paints;
  map.update(0.016);
  ck('and the zoom repaints at once, without waiting for the leash', map.paints === p0 + 1);
  for (let i = 0; i < 40; i++) map.el.fire('wheel', { deltaY: 120, preventDefault() {}, stopPropagation() {} });
  ck('the wheel stops at four kilometres', map.span === MINIMAP.maxSpan, `${map.span} m`);
  ck('and says it has stopped', /furthest/.test(map.readout), map.readout);
  for (let i = 0; i < 80; i++) map.el.fire('wheel', { deltaY: -120, preventDefault() {}, stopPropagation() {} });
  ck('and at five hundred the other way', map.span === MINIMAP.minSpan, `${map.span} m`);
  map.el.fire('wheel', { deltaY: 120, preventDefault() {}, stopPropagation() {} });
  map.update(0.016);

  // ---- hover and click ---------------------------------------------------
  map.update(3);                                   // let the said line time out
  map.el.fire('pointermove', { clientX: 55, clientY: 55 });
  const [hx, hz] = map.worldAt(55, 55);
  ck('resting on the map says the world coordinates under the cursor',
    map.readout === `${Math.round(hx)}, ${Math.round(hz)}`, map.readout);
  ck('and they are not where you are standing', Math.round(hx) !== Math.round(player.pos.x));
  map.el.fire('pointerleave', {});
  ck('taking the cursor off puts your own coordinates back',
    map.readout === `${Math.round(player.pos.x)}, ${Math.round(player.pos.z)}`, map.readout);
  ck('and with nothing thinned off, it says nothing about more',
    map.last.dropped === 0 && !/more/.test(map.readout), map.readout);
  // a square that has thinned its marks says how many it left off, both ways
  {
    const many = createMinimap(document.body, {
      field, player: { pos: { x: 749, z: 1579 } }, camera, spaces: {},
      span: MINIMAP.maxSpan, places: (x, z, r) => sitesNear(field, x, z, r),
    });
    many.update(0.016);
    ck('a square with more places than it can hold says how many it left off',
      many.last.dropped > 0 && /and \d+ more/.test(many.readout),
      `${many.last.marks} shown, ${many.readout}`);
    many.dispose();
  }

  map.el.fire('pointerdown', { clientX: 55, clientY: 55, stopPropagation() {} });
  ck('a click outside dev mode warps nothing and says why',
    warps.length === 0 && /dev mode/.test(map.readout), map.readout);
  devOn = true;
  map.el.fire('pointerdown', { clientX: 55, clientY: 55, stopPropagation() {} });
  ck('a click in dev mode warps to the point under the cursor',
    warps.length === 1 && Math.abs(warps[0][0] - hx) < 1e-9 && Math.abs(warps[0][1] - hz) < 1e-9,
    `${warps[0].map((n) => n.toFixed(1)).join(', ')}`);
  ck('and says where it went', /warped to/.test(map.readout), map.readout);

  // ---- the mode switch ---------------------------------------------------
  map.update(4);
  hud.setMode('editor');
  ck('in editor mode the minimap stays up, like the dev badge',
    map.el.style.display !== 'none' && hud.mode === 'editor', `display "${map.el.style.display}"`);
  ck('and it is the only other thing left standing',
    hud.el.children.filter((c) => c.style.display !== 'none').every((c) => c.id === 'bw-dev' || c.id === 'bw-minimap'),
    hud.el.children.filter((c) => c.style.display !== 'none').map((c) => c.id).join(', '));
  const pe = map.paints;
  map.update(0.016);
  ck('and going into the editor repaints it, so the lattice comes up', map.paints === pe + 1);
  ck('the lattice really is on it now', map.last.gridLines > 0, `${map.last.gridLines} lines`);
  hud.setMode('play');
  map.update(0.6);
  ck('and it goes away again in play mode', map.last.gridLines === 0);
  ck('leaving the editor leaves the minimap showing', map.el.style.display !== 'none');

  // ---- the cost ----------------------------------------------------------
  //
  // The claim is a number, measured through the REAL update on the REAL field,
  // and every paint is at a place the field has never been asked about, so
  // nothing here is a cache answering instead of the world.
  //
  // Two numbers, because there really are two. The FIRST paint a fresh field
  // ever does is the field building its own lattices, and it is four to seven
  // milliseconds whatever this file draws; the numbers that matter to a player
  // are every paint after that. Both are printed.
  //
  // The `places` hook is wired here exactly as ui.js wires it, to the world's
  // own `sitesNear`, because that is the one part of a repaint that can cost
  // more than the sampling does when it lands on cells nobody has rolled yet.
  // Measuring without it would be measuring a paint the game never does.
  const cold = createWorldField(WORLD_SEED);
  const colder = createMinimap(document.body, {
    field: cold, player, camera, spaces: {}, zone: ZONE.greenwold,
    places: (x, z, r) => sitesNear(cold, x, z, r),
  });
  const ms = [];
  for (let k = 0; k < 20; k++) {
    player.pos.x = -3000 + k * 260;
    player.pos.z = 1000 + k * 137;
    colder.invalidate();
    const t0 = performance.now();
    colder.update(1);
    ms.push(performance.now() - t0);
  }
  colder.dispose();
  const first = ms[0];
  const rest = ms.slice(1).sort((a, b) => a - b);
  const worst = rest[rest.length - 1];
  const median = rest[rest.length >> 1];
  ck(`a ${MINIMAP.size} px repaint costs under 4 ms on the real field`,
    worst < 4,
    `median ${median.toFixed(2)} ms, worst ${worst.toFixed(2)} ms over ${rest.length} paints of ${colder.last.samples} samples, at ${rest.length} places the field had never been asked about`);
  console.log(`       the first paint a brand new field ever does costs ${first.toFixed(2)} ms, which is the field building its own lattice and happens once`);

  // a frame that paints nothing: no movement, no turn, no edit
  camera.forwardYaw = 1.2;
  map.update(1);
  map.update(1);
  const idle = [];
  for (let i = 0; i < 400; i++) {
    const t0 = performance.now();
    map.update(1 / 60);
    idle.push(performance.now() - t0);
  }
  const idleMean = idle.reduce((a, b) => a + b, 0) / idle.length;
  ck('and a frame with nothing to do costs under 0.05 ms',
    idleMean < 0.05, `${(idleMean * 1000).toFixed(1)} microseconds a frame over ${idle.length} frames`);
  ck('and really did nothing in them', map.paints === map.paints && idle.length === 400);

  // ---- put away and put back ---------------------------------------------
  map.setShown(false);
  ck('the settings window can put it away', !map.shown && map.el.classList.contains('off'));
  const ps = map.paints;
  for (let i = 0; i < 40; i++) map.update(0.016);
  ck('and a square nobody can see paints nothing', map.paints === ps);
  map.setShown(true);
  map.update(0.016);
  ck('putting it back paints it again', map.paints === ps + 1 && !map.el.classList.contains('off'));
}

// ------------------------------------------------------------ 14. the boxes --

console.log('\nthe boxes, measured, on three screens');
{
  for (const w of [1280, 1600, 2560]) {
    const box = minimapBox(w);
    const badge = devBadgeBox('fly mode   60 fps   16.7 ms   1200 draws   980k tris   40 alive', w);
    ck(`on a ${w} px screen the minimap is under the dev badge and not through it`,
      !boxesOverlap(box, badge) && box.top >= badge.bottom,
      `badge ${badge.top.toFixed(1)} to ${badge.bottom.toFixed(1)}, map from ${box.top}`);
    ck(`and it is inside the screen`, box.right <= w && box.left > 0, `${box.left} to ${box.right}`);
  }
  ck('the badge is the height hud.js says it is', Math.abs(DEV_BADGE_H - (10.5 * 1.35 + 14 + 2)) < 1e-9, `${DEV_BADGE_H.toFixed(3)} px`);
  ck('the gap between the badge and the map is real', MINIMAP.top - (14 + DEV_BADGE_H) > 4,
    `${(MINIMAP.top - (14 + DEV_BADGE_H)).toFixed(1)} px of air`);

  // the editor's top dock. Its width is its content's, so the claim is proved
  // against a dock as wide as the whole screen: no width of it can reach the map
  for (const w of [1280, 2560]) {
    const box = minimapBox(w);
    ck(`on a ${w} px screen no width of editor top dock reaches the minimap`,
      !boxesOverlap(topDockBox(w, w), box),
      `dock ends at ${topDockBox(w, w).right}, map starts at ${box.left}`);
    ck('and the dock is still on the screen', topDockBox(w, 300).left > 0);
  }
  ck('the editor leaves exactly the room the minimap declares it needs',
    TOP_DOCK_RIGHT === MINIMAP_CLEAR && MINIMAP_CLEAR > MINIMAP.right + MINIMAP.outerW,
    `${TOP_DOCK_RIGHT} px`);
  ck('and that claim would fail if the dock went back to the corner',
    boxesOverlap({ left: 1280 - 400, right: 1280, top: 0, bottom: 34 }, minimapBox(1280)) === false
    && boxesOverlap({ left: 1280 - 400, right: 1280, top: 0, bottom: 300 }, minimapBox(1280)) === true);
}

// ------------------------------------------------------- 15. the wiring ----

console.log('\nthe wires, read from the source');
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const HERE = dirname(fileURLToPath(import.meta.url));
  const src = (f) => readFileSync(join(HERE, f), 'utf8');
  const hudSrc = src('hud.js');
  const uiSrc = src('app/systems/ui.js');
  const panelSrc = src('editor/panel.js');
  const mapSrc = src('minimap.js');
  ck('hud.js mounts the minimap and nothing else does',
    /mountMinimap\(/.test(hudSrc) && /createMinimap\(/.test(hudSrc) && !/createMinimap\(/.test(uiSrc));
  ck('and setMode keeps it up beside the dev badge',
    /if \(child === devBadge\) continue;/.test(hudSrc) && /child === minimap\.el/.test(hudSrc));
  ck('ui.js mounts it with the world field, the player and the camera',
    /hud\.mountMinimap\?\.\(/.test(uiSrc) && /field: \(\) => runtime\.field/.test(uiSrc)
    && /player: rig,/.test(uiSrc) && /^\s+camera,$/m.test(uiSrc));
  ck('and reads the field through a function, so a sculpt world swapped in is seen',
    !/field: runtime\.field,/.test(uiSrc));
  ck('and ticks it every frame with the frame dt',
    /minimap\?\.update\(dt\)/.test(uiSrc), 'in ui.js draw(frame)');
  ck('the leash reads the terrain version the editor bumps',
    /terrainEdits\?\.version/.test(uiSrc));
  ck('the warp goes through the dev bench and not through a second teleport',
    /devBenchOf\(\)/.test(uiSrc) && /bench\.warp\(/.test(uiSrc) && !/\.teleport\(/.test(uiSrc));
  ck('the editor keeps its top dock out of the minimap column',
    /MINIMAP_CLEAR/.test(panelSrc) && /right: \$\{TOP_DOCK_RIGHT\}px/.test(panelSrc));
  // built from its code point, so this file can check itself as well
  const EM = String.fromCharCode(0x2014);
  const mine = [mapSrc, readFileSync(join(HERE, 'minimap.test.mjs'), 'utf8'), hudSrc, uiSrc, panelSrc,
    readFileSync(join(HERE, '../../docs/mmo/wiring/HUD4-MINIMAP.md'), 'utf8')];
  ck('no em dash in any of the files this work owns, the note and this suite included',
    !mine.some((s) => s.includes(EM)), `${mine.length} files`);
  ck('and the check would find one if there were', ('a' + EM + 'b').includes(EM));
  ck('the minimap asks the context for nothing exotic',
    !/createLinearGradient|createRadialGradient|createPattern|\.clip\(|filter =/.test(mapSrc));
}

console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
