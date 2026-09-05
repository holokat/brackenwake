// The Map panel, the cost of drawing it, and the column of words beside it.
// Run: node src/game/win_map.test.mjs
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
  foundPlaces, sideModel, bearingWord, wayText, dangerWords, legendColour, auditMapWords,
  BIOME_COLOUR, SITE_COLOUR, DANGER_TINT, GROUND_WORD, KIND_WORD, POINT_WORD, LEGEND,
  ROAD_COLOUR, WAYPOINT_COLOUR, PLAYER_COLOUR, HATCH_INK, HATCH_WASH,
  MAP_SPAN, MAP_SAMPLES, MAP_STRIDE, MAP_BUDGET_MS, REDRAW_S, PICK_PX, panel,
} = await import('./win_map.js');
const { createWorldField, BIOMES } = await import('../world/field.js');
const { SITE_CELL } = await import('../world/sitegrid.js');
const { ZONES, ZONE, WORLD_HALF, authoredSites, DANGER_WORD } = await import('../world/zones.js');
const { distanceText, POINTS } = await import('./compass.js');

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

/** Two sites the world really has, wherever they are, and three zones. */
const someSites = (() => {
  const found = [];
  for (let cz = -6; cz <= 6 && found.length < 3; cz++) {
    for (let cx = -6; cx <= 6 && found.length < 3; cx++) {
      const st = field.siteInCell(cx, cz);
      if (st) found.push(st);
    }
  }
  return found;
})();
/** A place with a roof, so the "nearest town" line can be measured and not skipped. */
const someTown = (() => {
  for (let cz = -16; cz <= 16; cz++) {
    for (let cx = -16; cx <= 16; cx++) {
      const st = field.siteInCell(cx, cz);
      if (st && st.kind === 'town') return st;
    }
  }
  return null;
})();
const WALKED = ['vale', 'ironshoulder', 'frostcrown'];

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
  check('there is a row for every region in the world', rowsOf(root, 'bw-map-region').length === ZONES.length, `${rowsOf(root, 'bw-map-region').length} rows of ${ZONES.length} zones`);
  check('three walked, eighteen not', m.walked === 3 && m.regions.filter((r) => !r.known).length === ZONES.length - 3, `${m.walked} walked`);
  check('the walked ones are drawn as rows you can click', rowsOf(root, 'bw-map-region').filter((r) => r.className.includes('pick')).length === 3);
  check('and the rest are dimmed', rowsOf(root, 'bw-map-region').filter((r) => r.className.includes('off')).length === ZONES.length - 3);
  check('two places found is two rows', rowsOf(root, 'bw-map-place').length === 2, `${rowsOf(root, 'bw-map-place').length} rows`);
  check('and the footer counts the same two', p.lastDraw.sites === 2 && p.lastDraw.sites === m.places.length, `footer ${p.lastDraw.sites}, list ${m.places.length}`);
  check('the key has one swatch per row', rowsOf(root, 'sw').length === LEGEND.length, `${rowsOf(root, 'sw').length} swatches of ${LEGEND.length}`);
  check('every region row is sorted by distance', m.regions.every((r, i) => i === 0 || m.regions[i - 1].dist <= r.dist));
  check('and so is every place', m.places.every((r, i) => i === 0 || m.places[i - 1].dist <= r.dist));
  check('the header names the region you are standing in', m.here.name === ZONE.vale.name && m.here.line === ZONE.vale.line, m.here.name);
  check('and says the ground under you in words', !!m.here.ground && Object.values(GROUND_WORD).includes(m.here.ground), m.here.ground);
  check('and the danger band in the game words, never a bare number', m.here.danger === DANGER_WORD[1] && !/\d/.test(m.here.danger), m.here.danger);
}

console.log('win_map: an unwalked region keeps its name, exactly as the map hatches it');
{
  const character = { discovered: [], zones: [...WALKED], waypoint: null };
  const { root, p } = makePanel(character);
  const shown = textOf(root);
  const hidden = ZONES.filter((z) => !WALKED.includes(z.id));
  const leaked = hidden.filter((z) => shown.includes(z.name));
  check('not one of the eighteen unwalked names is anywhere on the page', leaked.length === 0, leaked.map((z) => z.name).join(', ') || `${hidden.length} names checked`);
  const named = WALKED.filter((id) => shown.includes(ZONE[id].name));
  check('and all three walked ones are', named.length === 3, named.join(', '));
  check('an unwalked row says the word instead', shown.includes('unwalked'));
  check('the model carries no name and no id for one', p.lastSide.regions.filter((r) => !r.known).every((r) => r.name === null && r.id === null));
  check('and no unwalked row carries a zone id in the DOM', rowsOf(root, 'bw-map-region').filter((r) => r.className.includes('off')).every((r) => !r.dataset.zone));
  check('while a walked row does', rowsOf(root, 'bw-map-region').filter((r) => r.className.includes('pick')).every((r) => WALKED.includes(r.dataset.zone)));
  // the other direction: walk into the other eighteen and every name appears
  const all = makePanel({ discovered: [], zones: ZONES.map((z) => z.id), waypoint: null });
  const everything = textOf(all.root);
  check('walk into all of them and all twenty one are named', ZONES.every((z) => everything.includes(z.name)));
  check('and not one region row is dimmed any more', rowsOf(all.root, 'bw-map-region').every((r) => r.className.includes('pick') && !r.className.includes('off')));
  // the word is still in the key, where it explains the hatching, and nowhere else
  check('the word unwalked is left only in the key', walk(all.root).filter((n) => !n.children.length && n.textContent === 'unwalked').length === 1);
}

console.log('win_map: a row click and a map click write the same field');
{
  const character = { discovered: [someSites[0].id], zones: [...WALKED], waypoint: null };
  const { p, root, ctx, said, touched } = makePanel(character);
  // the map click first, so there is something to compare against
  const [px, py] = toPixel(someSites[0].x, someSites[0].z, 0, 0, 640);
  p.clickAt({ clientX: px, clientY: py });
  const byMap = character.waypoint;
  check('a map click writes character.waypoint', !!byMap && byMap.name === someSites[0].name, JSON.stringify(byMap));
  const mapTouches = touched.length;
  check('and touches the waypoint field', mapTouches === 1 && touched[0] === 'waypoint', touched.join(','));

  const row = rowsOf(root, 'bw-map-region').find((r) => r.dataset.zone === 'ironshoulder');
  check('the walked region has a row to click', !!row);
  row.fire('click');
  const byRow = character.waypoint;
  check('a row click writes THE SAME field', byRow !== byMap && ctx.character.waypoint === byRow && byRow.name === ZONE.ironshoulder.name, JSON.stringify(byRow));
  check('on the centre of that region', byRow.x === ZONE.ironshoulder.x && byRow.z === ZONE.ironshoulder.z);
  check('and it calls state.touch too', touched.length === mapTouches + 1 && touched[touched.length - 1] === 'waypoint', touched.join(','));
  check('and says so under the map', /Waypoint set on The Iron Shoulder/.test(p._say.textContent), p._say.textContent);
  check('and in a toast', said.length === 2 && said[1].includes(ZONE.ironshoulder.name), said[1]);
  check('nothing else on the character moved', Object.keys(character).join(',') === 'discovered,zones,waypoint');

  // a place row does it too
  const place = rowsOf(root, 'bw-map-place')[0];
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
  check('with no mark there is no clear button', !walk(root).some((n) => n.tagName === 'BUTTON'));
  check('and the sheet says so rather than leaving a gap', textOf(root).includes('not set'));
  p.setWaypoint({ x: ZONE.vale.x, z: ZONE.vale.z, name: ZONE.vale.name });
  const btn = walk(p._side).find((n) => n.tagName === 'BUTTON');
  check('setting one grows the button', !!btn && btn.textContent === 'clear waypoint', btn && btn.textContent);
  check('and the way to it is written in words', /north|south|east|west|right here/.test(textOf(p._side)));
  const n = touched.length;
  btn.fire('click');
  check('clicking it clears the mark', character.waypoint === null);
  check('and saves that', touched.length === n + 1 && touched[touched.length - 1] === 'waypoint');
  check('and says which mark went', /is cleared/.test(p._say.textContent) && p._say.textContent.includes(ZONE.vale.name), p._say.textContent);
  check('and tells the HUD', said[said.length - 1].includes('cleared'), said[said.length - 1]);
  check('the button is gone with it', !walk(p._side).some((x) => x.tagName === 'BUTTON'));
  const again = p.clearWaypoint();
  check('clearing nothing says so and changes nothing', again === null && /no mark/.test(p._say.textContent), p._say.textContent);
}

console.log('win_map: the empty states are sentences');
{
  const { p, root } = makePanel({ discovered: [], zones: [], waypoint: null });
  const m = p.lastSide;
  check('nothing found is no place rows', rowsOf(root, 'bw-map-place').length === 0 && m.places.length === 0);
  const none = rowsOf(root, 'bw-map-none');
  check('and one sentence instead of a blank', none.length === 1 && none[0].textContent.length > 40, none[0]?.textContent);
  check('with no town to point at, the row says so in words', m.town === null && textOf(root).includes('none found yet'));
  check('the regions list is still all twenty one', rowsOf(root, 'bw-map-region').length === ZONES.length);
  check('every one of them dimmed', rowsOf(root, 'bw-map-region').every((r) => r.className.includes('off')));
  check('and the header counts none walked', textOf(root).includes(`0 of ${ZONES.length} walked`));
  // and the other direction: find a town, and the header points at it
  check('the world has a town to find', !!someTown, someTown && someTown.name);
  const withTown = makePanel({ discovered: [someTown.id, someSites[0].id], zones: [], waypoint: null });
  const wt = withTown.p.lastSide;
  check('find one and the header names it', wt.town && wt.town.name === someTown.name && wt.town.kind === 'town', `${someTown.name}`);
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
  check('and the column is built anyway', rowsOf(root, 'bw-map-region').length === ZONES.length, `${rowsOf(root, 'bw-map-region').length} rows`);
  check('the ground under you is not invented', p.lastSide.here.ground === null && textOf(root).includes('not known yet'));
  check('and the region you stand in is still worked out from the world table', p.lastSide.here.name === ZONE.vale.name, p.lastSide.here.name);
}

console.log('win_map: the key says what the draw actually paints');
{
  const g = recorder();
  drawMap(g, { field, cx: 0, cz: 0, size: 640, zonesFound: ['vale'], discovered: [someSites[0].id], waypoint: { x: 1000, z: 1000, name: 'a mark' } });
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
  const zs = ['vale', 'ironshoulder', 'frostcrown'];
  sideModel({ field, cx: 0, cz: 0, discovered: ids, zonesFound: zs });
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) sideModel({ field, cx: i * 7, cz: -i * 7, discovered: ids, zonesFound: zs });
  const per = (performance.now() - t0) / 50;
  check('and the whole column costs a fraction of the picture beside it', per < 5,
    `${per.toFixed(3)} ms a call against the ${MAP_BUDGET_MS} ms the draw is allowed`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
