import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createDungeonApproach, dungeonArrivalAsset} from './dungeon_approach.js';
import {createAssetCache} from './asset_cache.js';
import {createRoomArtwork} from './room_artwork.js';
import {disposeGltf, canPrefetch} from './gltf_assets.js';
import {CELLAR_ASSETS} from '../../world/cellar_asset_catalog.js';
import {spaceSiteRow} from '../../world/sites.js';
import {installTextureStubs} from '../../../tools/test-glb-env.mjs';
import space from '../../mmo/spaces/island_cellars.json' with {type: 'json'};

const site = spaceSiteRow(space), url = CELLAR_ASSETS.entry;
const point = (distance, z = 0) => ({x: site.x - distance, z: site.z + z});
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
const immediate = {run: fn => Promise.resolve().then(fn)};
function harness(options = {}, cacheOptions = {}) {
  const fetched = [], decoded = [], aborted = [];
  const pool = createAssetCache({work: immediate,
    fetchBytes: async (key, signal, priority) => {fetched.push({url: key, priority});
      signal.addEventListener('abort', () => aborted.push(key)); return new ArrayBuffer(8);},
    decode: async (_, key) => {decoded.push(key); return {key};}, ...cacheOptions});
  let queries = 0;
  const approach = createDungeonApproach({pool, sitesNear: () => {queries++; return [site];},
    canSpeculate: () => true, canDecode: () => true, ...options});
  return {approach, pool, fetched, decoded, aborted, get queries() {return queries;}};
}
function walk(h, start, end) {
  h.approach.update(.2, point(start));
  for (let d = start - 1; d >= end; d--) h.approach.update(.2, point(d));
}

test('authored island entrance resolves to exactly its first arrival asset', () => {
  assert.equal(dungeonArrivalAsset(site), url);
  assert.equal(dungeonArrivalAsset({...site, dungeon: null, sub: 'unknown'}), null);
  assert.equal(dungeonArrivalAsset({...site, kind: 'town'}), null);
  assert.equal(dungeonArrivalAsset(site, 9), null);
});

test('walking toward the door prefetches outside, but standing, passing and moving away do not', async () => {
  const h = harness();
  h.approach.update(.2, point(110));
  h.approach.update(1, point(110));
  h.approach.update(.2, point(111));
  h.approach.update(.2, point(111, 1));
  await turn(); assert.equal(h.fetched.length, 0);
  walk(h, 111, 105); await turn();
  assert.deepEqual(h.fetched.map(r => r.url), [url]);
  assert.deepEqual(h.decoded, [], 'far approach only downloads raw bytes');
  const queries = h.queries;
  for (let i = 0; i < 5; i++) h.approach.update(.016, point(105));
  assert.equal(h.queries, queries, 'site queries are throttled below five per second');
  h.approach.dispose(); h.pool.clearUnused();
});

test('close approach defers decoding on slow frames and explicit entry promotes the same download', async () => {
  let budget = false;
  const h = harness({canDecode: () => budget});
  walk(h, 50, 35); await turn();
  assert.equal(h.fetched.length, 1); assert.equal(h.decoded.length, 0);
  budget = true; h.approach.update(.2, point(34)); await turn();
  assert.equal(h.approach.stats.phase, 'ready');
  const lease = h.approach.claim(site); assert(await lease.promise);
  assert.equal(h.fetched.length, 1); assert.equal(h.decoded.length, 1);
  assert.equal(h.approach.stats.lastHandoff.phase, 'ready');
  assert.equal(h.pool.stats.pinned, 1);
  lease.release(); h.approach.dispose(); assert.equal(h.pool.stats.pinned, 0); h.pool.clearUnused();
});

test('teleports do not project a route, but arriving right at the door still prepares it', async () => {
  const h = harness(); h.approach.update(.2, point(1000)); h.approach.update(.016, point(60));
  await turn(); assert.equal(h.fetched.length, 0);
  h.approach.update(.016, point(10)); await turn();
  assert.equal(h.fetched.length, 1); assert.equal(h.decoded.length, 1);
  h.approach.dispose(); h.pool.clearUnused();
});

test('an unfinished surface prefetch survives entry without restarting, and the visible room owns it', async () => {
  let finish;
  const h = harness({}, {fetchBytes: (_, signal) => new Promise((resolve, reject) => {
    finish = () => resolve(new ArrayBuffer(8));
    signal.addEventListener('abort', () => reject(Error('aborted')));
  })});
  walk(h, 100, 95); await turn();
  const transition = h.approach.claim(site);
  let attached = false;
  const art = createRoomArtwork({id: 'entry', url, pool: h.pool, work: immediate,
    prepare: async () => ({dispose() {}}), attach: () => {attached = true;}, onError: assert.fail});
  finish(); assert.equal(await art.ready, true); await transition.promise; transition.release();
  assert(attached); assert.equal(h.pool.stats.downloads, 1); assert.equal(h.pool.stats.decodes, 1);
  assert.equal(h.pool.stats.pinned, 1); art.dispose(); assert.equal(h.pool.stats.pinned, 0);
  h.approach.dispose(); h.pool.clearUnused();
});

test('walking away cancels only this entrance and keeps other requested assets alive', async () => {
  const aborted = [];
  const h = harness({}, {fetchBytes: (key, signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {aborted.push(key); reject(Error('cancelled'));});
  })});
  walk(h, 100, 95); const visible = h.pool.acquire('visible'); await turn();
  h.approach.update(3.2, point(100)); await turn();
  assert.deepEqual(aborted, [url]); assert.equal(h.pool.stats.pinned, 1);
  assert.equal(h.approach.stats.phase, 'idle');
  visible.release(); h.approach.dispose(); await turn();
});

test('data saving or hidden tabs cancel speculation, while clicking entry still loads', async () => {
  let allowed = true;
  const h = harness({canSpeculate: () => allowed}); walk(h, 45, 35); await turn();
  assert.equal(h.pool.stats.pinned, 1); allowed = false; h.approach.update(.016, point(34));
  assert.equal(h.pool.stats.pinned, 0); assert.equal(h.approach.stats.phase, 'idle');
  const lease = h.approach.claim(site); assert(await lease.promise); lease.release();
  assert.equal(h.pool.stats.downloads, 1); h.approach.dispose(); h.pool.clearUnused();
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'document', {configurable: true, value: {visibilityState: 'hidden'}});
    assert.equal(canPrefetch(), false);
    globalThis.document.visibilityState = 'visible';
    for (const connection of [{saveData: true}, {effectiveType: '2g'}, {effectiveType: 'slow-2g'}]) {
      Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {connection}});
      assert.equal(canPrefetch(), false);
    }
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {connection: {effectiveType: '4g'}}});
    assert.equal(canPrefetch(), true);
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor); else delete globalThis.document;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator;
  }
});

test('background decode leases reserve a download slot for visible models', async () => {
  const calls = [], finishes = new Map();
  const pool = createAssetCache({work: immediate,
    fetchBytes: key => {calls.push(key); return new Promise(resolve => finishes.set(key, () => resolve(new ArrayBuffer(8))));},
    decode: async () => ({})});
  const visible = pool.acquire('visible'), warm = pool.acquire(url, {priority: 0}); await turn();
  assert.deepEqual(calls, ['visible']);
  const urgent = pool.acquire('urgent'); await turn(); assert.deepEqual(calls, ['visible', 'urgent']);
  finishes.get('visible')(); finishes.get('urgent')(); await Promise.all([visible.promise, urgent.promise]); await turn();
  assert.deepEqual(calls, ['visible', 'urgent', url]); finishes.get(url)(); await warm.promise;
  visible.release(); urgent.release(); warm.release(); pool.clearUnused();
});

test('policy changes suspend without another game frame, and cold entry bypasses speculation limits', async () => {
  let allowed = true;
  const visibilityTarget = new EventTarget(), connection = new EventTarget();
  const h = harness({canSpeculate: () => allowed, visibilityTarget, connection}, {allowPrefetch: () => allowed});
  h.approach.update(.2, point(10)); await turn(); assert.equal(h.pool.stats.pinned, 1);
  allowed = false; visibilityTarget.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.pool.stats.pinned, 0); assert.equal(h.approach.stats.phase, 'idle');
  h.pool.clearUnused(); h.approach.update(.2, point(10)); await turn();
  assert.equal(h.pool.stats.entries, 0);
  const arrival = h.approach.claim(site); assert(await arrival.promise);
  assert.equal(h.pool.stats.downloads, 2, 'explicit entry starts a new download even with data saving enabled');
  arrival.release(); h.approach.dispose();
  allowed = true; h.approach.update(.2, point(10)); connection.dispatchEvent(new Event('change'));
  assert.equal(h.pool.stats.pinned, 0); h.pool.clearUnused();
});

test('failed speculative decode backs off, retries and never prevents real entry', async () => {
  let attempts = 0;
  const h = harness({}, {decode: async () => {if (++attempts === 1) throw Error('temporary'); return {};}});
  h.approach.update(.2, point(10)); await turn(); assert.equal(h.approach.stats.phase, 'failed');
  for (let i = 0; i < 20; i++) h.approach.update(.2, point(10));
  await turn(); assert.equal(attempts, 1);
  h.approach.update(7, point(10)); await turn(); assert.equal(attempts, 2);
  const lease = h.approach.claim(site); assert(await lease.promise); lease.release();
  h.approach.dispose(); h.pool.clearUnused();
});

test('real Old Cellars GLB is decoded before entry and reused with no second fetch or parse', async t => {
  installTextureStubs(); // Node verifies GLTF parsing and reuse; browser image decoding is not measured here.
  const bytes = await readFile(new URL(url));
  let parses = 0;
  const h = harness({}, {fetchBytes: async key => {
    assert.equal(key, url); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }, decode: async buffer => {parses++; return new GLTFLoader().parseAsync(buffer, '');}, dispose: disposeGltf});
  h.approach.update(.2, point(10));
  const pinned = h.pool.acquire(url, {priority: 0}); const prepared = await pinned.promise; await turn();
  assert.equal(h.approach.stats.phase, 'ready');
  const arrival = h.approach.claim(site);
  assert.equal(await arrival.promise, prepared);
  assert.equal(h.pool.stats.downloads, 1); assert.equal(parses, 1);
  let meshes = 0; prepared.scene.traverse(o => {if (o.isMesh) meshes++;}); assert(meshes > 0);
  t.diagnostic(`Actual arrival GLB: ${bytes.byteLength} bytes, ${meshes} meshes, one fetch and one parse across entry`);
  arrival.release(); pinned.release(); h.approach.dispose(); h.pool.clearUnused();
});
