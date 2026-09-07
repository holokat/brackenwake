// The editor's tile pictures. Run: node src/game/editor/thumbs.test.mjs
//
// Five things are worth proving here and none of them needs a GPU.
//
//   EVERY ROW RESOLVES. The trays are counted against `palette.js` and every
//   single row is driven through `bodyFor`. A row either builds a body or
//   answers null, and no row anywhere throws. Null is reported with a reason
//   rather than swallowed, because "the tile kept its glyph" and "the builder
//   fell over" look identical on screen.
//
//   THE FRAME FITS THE BOX. Pure arithmetic, so it is measured exactly: every
//   one of the eight corners lands inside the frame, one of them lands ON the
//   edge of it, and a one metre body and a twenty metre body come out the same
//   size in the tile. That is the claim the whole feature rests on.
//
//   THE CACHE SPARES THE WORK. A second ask for the same tile draws nothing.
//
//   THE VERSION THROWS THE STORE. A picture written by an older lens is gone
//   before it can be shown, and so is one written before the props manifest
//   changed under it.
//
//   THE QUEUE KEEPS TO ITS BUDGET. A tray of 159 rows draws two in a frame and
//   not a hundred and fifty nine, which is the difference between opening the
//   Objects tray and freezing the editor for a second.
//
// And it prints what a picture COSTS, per kind and for the whole palette,
// measured with the graphics call stubbed out. Everything above the stub is
// the real code: the body is really built and really measured.

import * as THREE from 'three';
import { paletteFor, TAB_IDS } from './palette.js';
import { MODE_IDS, toolsFor } from './modes.js';
import {
  THUMB, THUMB_VERSION, THUMB_TABS, CACHE_PREFIX, STAMP_KEY, BUDGET, MANIFEST_URL,
  canThumb, keyOf, bodyFor, metresOf, captionOf, frameBox, createThumbs,
  thumbs, disposeThumbs,
} from './thumbs.js';
import { FOOTPRINT } from '../../mmo/plans/footprints.js';
import { ROCK_KINDS } from '../../world/plan_models.js';

// A monster family with a Blender rig asks for its glb the moment it is built,
// and in node there is no server to answer. That is the real path, and it is
// the same path a slow connection takes in the browser, so the complaints are
// collected and counted at the end instead of burying the run in stack traces.
const loud = [];
const realError = console.error;
console.error = (...a) => loud.push(String(a[0]).split('\n')[0]);

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;
const ms = (fn) => { const a = process.hrtime.bigint(); const r = fn(); return [r, Number(process.hrtime.bigint() - a) / 1e6]; };

/** A store that behaves like localStorage, walkable keys and all. */
function memStore() {
  const m = new Map();
  return {
    m,
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/** The stand-in for the one call that needs a graphics context. */
const stubRender = (calls) => (body) => { calls.push(body); return { url: `data:image/png;base64,${calls.length}` }; };

/** Every row of every tray, as the panel would hand them over. */
function everyTile() {
  const out = [];
  for (const mode of MODE_IDS) for (const t of toolsFor(mode)) out.push(t);
  return out;
}

// ============================================================================
console.log('thumbs: which tiles get a picture at all');
{
  const tiles = everyTile();
  const yes = tiles.filter(canThumb), no = tiles.filter((t) => !canThumb(t));
  check('every tray tile is judged one way or the other', yes.length + no.length === tiles.length, `${yes.length} pictured, ${no.length} not, of ${tiles.length}`);
  check('the trays that hold bodies are the seven tabs', THUMB_TABS.every((t) => TAB_IDS.includes(t)) && THUMB_TABS.length === 7, THUMB_TABS.join(', '));
  check('terrain is never one of them', !THUMB_TABS.includes('terrain'));

  // both directions: a word says no, an entry says yes
  const word = { id: 'grass', tab: 'terrain', what: 'word', colour: '#5a7a33' };
  const brush = { id: 'raise', tab: 'terrain', what: 'brush' };
  const entry = { id: 'barrel', tab: 'structures', what: 'entry', real: true };
  check('a ground word keeps its swatch', canThumb(word) === false);
  check('a brush keeps its glyph', canThumb(brush) === false);
  check('a body gets a picture', canThumb(entry) === true);
  check('a row with no tab is refused', canThumb({ id: 'x' }) === false);
  check('a row with no id is refused', canThumb({ tab: 'rocks' }) === false);

  const glb = keyOf({ tab: 'structures', id: 'barrel', real: true });
  const standin = keyOf({ tab: 'structures', id: 'barrel', real: false });
  check('a stand-in and a model are filed apart', glb !== standin, `${glb} / ${standin}`);
}

/** What each body cost to build the FIRST time, filled in by the sweep below. */
const COLD = new Map();

// ============================================================================
console.log('thumbs: every palette row builds a body or says why not');
{
  // counted against palette.js, so a tab that grows is a tab that is covered
  const rows = [];
  for (const tab of THUMB_TABS) for (const r of paletteFor(tab)) rows.push({ ...r, tab, what: 'entry' });
  check('every tab with bodies in it was walked', THUMB_TABS.length === 7, `${rows.length} rows`);

  const nulls = [], threw = [], sizes = new Map();
  const cost = new Map();
  // Node has no server, so a monster family with a glb tries to fetch one and
  // fails. That is the real path and it is what the editor does on a slow
  // connection too, so it is counted rather than hidden, and the stack traces
  // are kept out of the way.
  for (const row of rows) {
    let body = null, t = 0;
    try { [body, t] = ms(() => bodyFor(row)); } catch (e) { threw.push(`${row.tab} ${row.id}: ${e.message}`); continue; }
    if (!body) { nulls.push(`${row.tab} ${row.id}`); continue; }
    const c = cost.get(row.tab) || { n: 0, ms: 0, worst: 0, worstId: '' };
    c.n++; c.ms += t; if (t > c.worst) { c.worst = t; c.worstId = row.id; }
    cost.set(row.tab, c);
    COLD.set(`${row.tab}:${row.id}`, t);
    const m = metresOf(body.group);
    if (!m) nulls.push(`${row.tab} ${row.id} (empty box)`);
    else sizes.set(`${row.tab}:${row.id}`, m);
    body.dispose();
  }
  check('nothing threw', threw.length === 0, threw.slice(0, 4).join('; '));
  check('all but a handful built a body', nulls.length <= 8, `${rows.length - nulls.length}/${rows.length} built; null: ${nulls.join(', ') || 'none'}`);

  let total = 0, count = 0;
  for (const tab of THUMB_TABS) {
    const c = cost.get(tab);
    if (!c) continue;
    total += c.ms; count += c.n;
    console.log(`       ${tab.padEnd(11)} ${String(c.n).padStart(4)} bodies  ${c.ms.toFixed(1).padStart(7)} ms  ${(c.ms / c.n).toFixed(2).padStart(6)} ms each   worst ${c.worstId} ${c.worst.toFixed(1)} ms`);
  }
  console.log(`       ${'all'.padEnd(11)} ${String(count).padStart(4)} bodies  ${total.toFixed(1).padStart(7)} ms  ${(total / count).toFixed(2).padStart(6)} ms each`);
  check('the whole palette builds in under four seconds', total < 4000, `${total.toFixed(0)} ms for ${count} bodies`);

  // the sizes are the game's own, so the caption cannot lie about them
  const barrel = sizes.get('structures:barrel');
  const f = FOOTPRINT.barrel;
  check('a barrel measures its footprint', barrel && near(Math.max(barrel.w, barrel.d), Math.max(f[0], f[1]), 0.25) && near(barrel.h, f[2], 0.25),
    barrel ? `${captionOf(barrel)} against ${f.join(' by ')} m` : 'no body');
  // `rockGeometry` scales a boulder by its HEIGHT, so that is the number the
  // kit's `size` really sets; a lumpy one is wider than it is tall.
  const rock = sizes.get('rocks:rock');
  check('a boulder stands as tall as the kit says', rock && near(rock.h, ROCK_KINDS.rock.size, 0.05),
    rock ? `${captionOf(rock)} against a kit size of ${ROCK_KINDS.rock.size} m` : 'no body');
  const person = sizes.get('people:blacksmith');
  check('a person stands 1.8 m', person && near(person.h, 1.8, 0.03), person ? captionOf(person) : 'no body');
  const marker = sizes.get('markers:structure');
  check('a marker post is over two metres', marker && marker.h > 2.2, marker ? captionOf(marker) : 'no body');
  const oak = sizes.get('trees:oak');
  check('an oak is a tree and not a shrub', oak && oak.h > 8, oak ? captionOf(oak) : 'no body');
  const wolf = sizes.get('monsters:wolf');
  check('a wolf is wolf sized', wolf && wolf.h > 0.4 && wolf.h < 2.5, wolf ? captionOf(wolf) : 'no body');

  check('the caption says both numbers', captionOf({ w: 1, d: 1, h: 1.4 }) === '1 by 1.4 m', captionOf({ w: 1, d: 1, h: 1.4 }));
  check('a big thing loses the decimal', captionOf({ w: 14, d: 9, h: 11.4 }) === '14 by 11 m', captionOf({ w: 14, d: 9, h: 11.4 }));
  check('a small thing keeps two', captionOf({ w: 0.4, d: 0.4, h: 0.35 }) === '0.4 by 0.35 m', captionOf({ w: 0.4, d: 0.4, h: 0.35 }));
  check('no body, no caption', captionOf(null) === '');
}

// ============================================================================
console.log('thumbs: the frame fits the box, at any size');
{
  // A barrel and a manor: the same lens, two very different bodies.
  const barrel = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1.4, 0.5));
  const manor = new THREE.Box3(new THREE.Vector3(-7, 0, -4.5), new THREE.Vector3(7, 11, 4.5));

  /** Every corner, in the lens's own frame: across, up and away. */
  function corners(box, f) {
    const off = new THREE.Vector3(...f.axes.off), right = new THREE.Vector3(...f.axes.right), up = new THREE.Vector3(...f.axes.up);
    const centre = box.getCenter(new THREE.Vector3());
    const out = [];
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(centre);
      const depth = f.dist - c.dot(off);
      out.push({ x: c.dot(right), y: c.dot(up), z: depth });
    }
    return out;
  }

  for (const [name, box] of [['barrel', barrel], ['manor', manor]]) {
    const f = frameBox(box);
    const cs = corners(box, f);
    let inside = 0, touch = 0, worst = 0;
    for (const c of cs) {
      const fx = Math.abs(c.x) / (c.z * f.tanX), fy = Math.abs(c.y) / (c.z * f.tanY);
      const k = Math.max(fx, fy);
      worst = Math.max(worst, k);
      if (k <= 1 + 1e-9) inside++;
      if (k >= 1 - 1e-9) touch++;
    }
    check(`the ${name} is wholly in frame`, inside === 8, `${inside}/8, the furthest at ${(worst * 100).toFixed(2)}% of the frame`);
    check(`the ${name} touches the edge, so nothing is wasted`, touch >= 1 && near(worst, 1, 1e-9), `${touch} corner(s) on the line`);
    check(`the ${name} is in front of the lens`, cs.every((c) => c.z > f.near * 0.999), `near ${f.near.toFixed(3)} m`);
  }

  const a = frameBox(barrel), b = frameBox(manor);
  // The same body ten times the size is framed from ten times as far, so it
  // comes out the same picture. That is what makes a barrel and a manor the
  // same size in the tray.
  const big = new THREE.Box3(barrel.min.clone().multiplyScalar(10), barrel.max.clone().multiplyScalar(10));
  const c = frameBox(big);
  check('ten times the body is framed from ten times as far, pixel for pixel the same picture',
    near(c.dist / a.dist, 10, 1e-9) && near(c.radius / a.radius, 10, 1e-9), `${a.dist.toFixed(3)} m becomes ${c.dist.toFixed(3)} m`);
  check('a manor stands further off than a barrel', b.dist > a.dist, `barrel at ${a.dist.toFixed(2)} m, manor at ${b.dist.toFixed(2)} m`);
  check('the eye is above the thing', a.pos.y > a.centre.y, `${a.pos.y.toFixed(2)} m against a middle at ${a.centre.y.toFixed(2)} m`);
  check('and off to one side', Math.abs(a.pos.x - a.centre.x) > 0.05, `${(a.pos.x - a.centre.x).toFixed(2)} m across`);
  check('the fill leaves air round it', THUMB.fill < 1 && THUMB.fill > 0.5, String(THUMB.fill));

  // a flat wide thing and a tall thin thing are both held, which is what a
  // drystone wall and a spruce are
  const wall = new THREE.Box3(new THREE.Vector3(-2, 0, -0.3), new THREE.Vector3(2, 0.9, 0.3));
  const spruce = new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 26, 3));
  for (const [name, box] of [['wall', wall], ['spruce', spruce]]) {
    const f = frameBox(box);
    const worst = Math.max(...corners(box, f).map((c) => Math.max(Math.abs(c.x) / (c.z * f.tanX), Math.abs(c.y) / (c.z * f.tanY))));
    check(`a ${name} shape fills the frame exactly once`, near(worst, 1, 1e-9), `${(worst * 100).toFixed(3)}%`);
  }
}

// ============================================================================
console.log('thumbs: the cache, and what throws it away');
{
  const store = memStore();
  const calls = [];
  const th = createThumbs({ storage: store, render: stubRender(calls), raf: null });
  const row = { id: 'barrel', tab: 'structures', what: 'entry', real: true };

  const first = th.info(row);
  check('nothing is drawn until the frame comes round', calls.length === 0, `${th.pending} waiting`);
  th.tick();
  const rec = await first;
  check('the first ask draws once', calls.length === 1 && !!rec.url, rec.url ? rec.url.slice(0, 24) : 'no url');
  check('and measures the body on the way past', !!rec.metres && rec.caption !== '', rec.caption);
  check('and the caption is there for the panel to read', th.caption(row) === rec.caption, th.caption(row));

  const again = await th.info(row);
  check('a second ask draws nothing', calls.length === 1 && again.url === rec.url, `${th.hits} hits, ${th.drawn} drawn`);

  // a fresh maker over the same store: the picture comes off the disk
  const calls2 = [];
  const th2 = createThumbs({ storage: store, render: stubRender(calls2), raf: null });
  const kept = await th2.info(row);
  check('a reload finds the picture already made', calls2.length === 0 && kept.url === rec.url, `${th2.hits} hits, ${th2.drawn} drawn`);
  check('and the size with it', kept.caption === rec.caption, kept.caption);

  // the version key
  const stale = memStore();
  stale.setItem(STAMP_KEY, 'v0|whatever');
  stale.setItem(CACHE_PREFIX + keyOf(row), JSON.stringify({ u: 'data:image/png;base64,OLD', m: [1, 1, 1] }));
  stale.setItem('someone.elses.key', 'left alone');
  const calls3 = [];
  const th3 = createThumbs({ storage: stale, render: stubRender(calls3), raf: null });
  check('an older version is thrown out of the store', stale.getItem(CACHE_PREFIX + keyOf(row)) === null, `stamp now ${th3.stamp}`);
  check('and nobody else\'s keys go with it', stale.getItem('someone.elses.key') === 'left alone');
  const redrawn = th3.info(row); th3.tick();
  const r3 = await redrawn;
  check('so the picture is made again', calls3.length === 1 && r3.url !== 'data:image/png;base64,OLD', r3.url);

  // and the same version is left alone, which is the other direction
  const good = memStore();
  good.setItem(STAMP_KEY, `${THUMB_VERSION}|barrel`);
  good.setItem(CACHE_PREFIX + keyOf(row), JSON.stringify({ u: 'data:image/png;base64,KEPT', m: [1, 1, 1.4] }));
  const calls4 = [];
  const th4 = createThumbs({ storage: good, render: stubRender(calls4), raf: null });
  const r4 = await th4.info(row);
  check('the same version keeps what it wrote', calls4.length === 0 && r4.url === 'data:image/png;base64,KEPT', r4.url);

  // the props manifest: a model added turns a stand-in into a building
  const fetched = [];
  const fakeFetch = async (url) => { fetched.push(url); return { json: async () => ({ ids: ['barrel', 'bench', 'cottage_b'] }) }; };
  const moved = await th4.checkManifest(fakeFetch);
  check('the manifest is asked for once, where it really lives', fetched.length === 1 && fetched[0] === MANIFEST_URL, fetched[0]);
  check('a manifest that has changed throws the store', !!moved && moved.dropped >= 1 && good.getItem(CACHE_PREFIX + keyOf(row)) === null, `${moved ? moved.dropped : 0} dropped, stamp ${th4.stamp}`);
  const same = await th4.checkManifest(fakeFetch);
  check('and the same manifest throws nothing', !!same && same.dropped === 0, `stamp ${th4.stamp}`);
  th.dispose(); th2.dispose(); th3.dispose(); th4.dispose();
}

// ============================================================================
console.log('thumbs: the lazy queue, on the tray that is worst');
{
  const objects = toolsFor('objects');
  check('the Objects tray is the big one', objects.length > 100, `${objects.length} tiles`);
  const calls = [];
  const th = createThumbs({ storage: memStore(), render: stubRender(calls), raf: null, budget: BUDGET });
  const promises = objects.map((t) => th.info(t));
  check('opening the tray draws nothing at all', calls.length === 0, `${th.pending} waiting, ${objects.length} asked`);

  th.tick();
  check('one frame draws the budget and no more', calls.length === BUDGET, `${calls.length} drawn in frame 1 of ${objects.length}`);
  th.tick();
  check('the next frame draws the next two', calls.length === BUDGET * 2, `${calls.length} drawn in two frames`);
  check('and they are drawn in the order the tiles are laid out', th.has(objects[0]) && th.has(objects[1]) && !th.has(objects[objects.length - 1]),
    `${objects[0].id}, ${objects[1].id} first; ${objects[objects.length - 1].id} still waiting`);

  let frames = 2;
  while (th.pending && frames < 5000) { th.tick(); frames++; }
  await Promise.all(promises);
  check('the whole tray lands, and every tile hears back', th.pending === 0 && calls.length <= objects.length, `${calls.length} pictures in ${frames} frames`);
  check('a frame budget of two takes about half the tray in frames', frames >= objects.length / BUDGET, `${frames} frames for ${objects.length} tiles`);

  // What the first open of Objects costs, in the cold numbers measured above:
  // the tray's own rows, each built for the first time, and the geometry caches
  // in plan_models empty.
  const coldOf = (t) => COLD.get(`${t.tab}:${t.id}`) ?? 0;
  const trayCold = objects.reduce((s2, t) => s2 + coldOf(t), 0);
  const firstFrame = objects.slice(0, BUDGET).reduce((s2, t) => s2 + coldOf(t), 0);
  const worst = objects.reduce((s2, t) => Math.max(s2, coldOf(t)), 0);
  console.log(`       the Objects tray cold: ${trayCold.toFixed(0)} ms of body building over ${Math.ceil(objects.length / BUDGET)} frames, ${(trayCold / objects.length).toFixed(2)} ms a tile, worst single body ${worst.toFixed(1)} ms`);
  console.log(`       the first frame of it: ${firstFrame.toFixed(2)} ms for ${BUDGET} bodies`);
  check('the first frame of the worst tray stays inside a frame at 60 fps', firstFrame < 16, `${firstFrame.toFixed(2)} ms`);
  check('and no single body in it costs a whole frame', worst < 16, `worst ${worst.toFixed(1)} ms`);

  // the warm path, which is what a second visit to the tray costs
  const warm = createThumbs({ storage: memStore(), render: stubRender([]), raf: null });
  const [, warmMs] = ms(() => { objects.forEach((t) => warm.info(t)); while (warm.pending) warm.tick(); });
  console.log(`       the same tray warm, with the geometry caches full: ${warmMs.toFixed(0)} ms in all`);
  th.dispose(); warm.dispose();
}

// ============================================================================
console.log('thumbs: a browser with no glass, and other bad days');
{
  const th = createThumbs({ storage: null, render: () => { throw new Error('no context'); }, raf: null });
  const row = { id: 'crate', tab: 'structures', what: 'entry', real: true };
  const p = th.info(row); th.tick();
  const rec = await p;
  check('a render that falls over is a tile with no picture, not a broken editor', rec && rec.url === null, JSON.stringify(rec));
  check('and it is not tried again every redraw', th.drawn === 1 && (await th.info(row)) === rec, `${th.drawn} drawn, ${th.hits} hits`);

  const none = await th.info({ id: 'raise', tab: 'terrain', what: 'brush' });
  check('a brush is never queued', none === null && th.pending === 0);

  const gone = createThumbs({ storage: memStore(), render: stubRender([]), raf: null });
  gone.dispose();
  check('a disposed maker answers null and keeps nothing', (await gone.info(row)) === null && gone.size === 0);

  // a store that refuses everything is not a crash either
  const cross = {
    get length() { return 0; }, key: () => null,
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const th2 = createThumbs({ storage: cross, render: stubRender([]), raf: null });
  const p2 = th2.info(row); th2.tick();
  check('a browser that blocks storage still draws its pictures', !!(await p2).url && th2.persists === false, `persists ${th2.persists}`);
  th.dispose(); th2.dispose();

  // the panel's own maker, which is made on the first tile that asks and then
  // kept for the page, so closing the editor and opening it again is free
  const one = thumbs();
  check('the panel shares one maker', thumbs() === one);
  disposeThumbs();
  check('and letting go of it takes the glass and the pictures with it', one.gone === true && thumbs() !== one);
  disposeThumbs();
}

// ============================================================================
console.log('thumbs: a body that is only standing in for one that has not landed');
{
  const store = memStore();
  const th = createThumbs({ storage: store, render: stubRender([]), raf: null });
  // caveBat wears a Blender rig, and until the file arrives buildMonsterModel
  // hands back the box that was only ever the measuring stick.
  const bat = { id: 'caveBat', tab: 'monsters', what: 'entry', real: true };
  const fox = { id: 'fox', tab: 'monsters', what: 'entry', real: true };
  const pb = th.info(bat), pf = th.info(fox);
  th.tick();
  const rb = await pb, rf = await pf;
  check('the stand-in is shown rather than an empty square', !!rb.url && rb.provisional === true, `${rb.caption}, provisional ${rb.provisional}`);
  check('but it is never written down', store.getItem(CACHE_PREFIX + keyOf(bat)) === null, `${th.provisional} provisional of ${th.drawn} drawn`);
  check('a body with no file to wait for is written down', rf.provisional !== true && store.getItem(CACHE_PREFIX + keyOf(fox)) !== null, `${rf.caption}`);
  th.dispose();
}

console.error = realError;
if (loud.length) console.log(`\n${loud.length} model file(s) could not be fetched, which is what node with no server looks like: ${[...new Set(loud)].join('; ').slice(0, 160)}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
