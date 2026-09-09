// Read-only deployed-site checks. No game boot, storage, character or chat.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readLore, ORIGIN, escapeHtml } from './lore/content.mjs';
import { publishedArt, artPath, CONCEPT_NOTE } from './lore/art.mjs';
import { PLACE_NOTES } from './lore/place-notes.mjs';

const base = new URL(process.argv[2] || ORIGIN), lore = readLore();
const paths = ['/lore/', '/lore/story/', ...lore.realms.map(realm => `/lore/${realm.id}/`), ...lore.realms.flatMap(realm => realm.places.map(place => `/lore/${realm.id}/${place.id}/`))];
const pages = new Map(), assetPaths = new Set();
const get = path => fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) });
async function batches(items, run) {
  for (let i = 0; i < items.length; i += 6) await Promise.all(items.slice(i, i + 6).map(run));
}
await batches(paths, async path => {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type'), /text\/html/, path);
  const html = await response.text(); pages.set(path, html);
  assert(html.includes(`<link rel="canonical" href="${ORIGIN}${path}">`), path);
  assert(!html.includes('src/game/main.js'), path + ' must not boot the game');
  assert(html.includes(CONCEPT_NOTE), path + ' must label concept artwork');
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/lore\/(?:assets|art)\/[^" ]+)"/g)) assetPaths.add(asset);
});
for (const realm of lore.realms) {
  const html = pages.get(`/lore/${realm.id}/`);
  for (const place of realm.places) {
    assert(html.includes(`id="${place.id}"`), place.id);
    assert(html.includes(escapeHtml(place.geography)), place.id);
    const detail = pages.get(`/lore/${realm.id}/${place.id}/`);
    assert(detail.includes(escapeHtml(PLACE_NOTES[place.id])), place.id + ' has its concept notes');
    assert(detail.includes(escapeHtml(place.contains)), place.id + ' retains authored discoveries');
  }
}
for (const spec of publishedArt) assert(assetPaths.has(artPath(spec.id)), spec.id + ' is displayed');
await batches([...assetPaths], async path => {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type'), path.endsWith('.webp') ? /image\/webp/ : path.endsWith('.css') ? /css/ : /javascript/, path);
  if (path.endsWith('.webp')) {
    const remote = Buffer.from(await response.arrayBuffer());
    const local = readFileSync(new URL('../public' + path, import.meta.url));
    assert.equal(createHash('sha256').update(remote).digest('hex'), createHash('sha256').update(local).digest('hex'), path + ' serves current artwork');
  }
});
const home = await get('/');
assert.equal(home.status, 200);
assert((await home.text()).includes('href="/lore/">Lore and lands'));
const sitemap = await (await get('/sitemap.xml')).text();
for (const path of paths) assert(sitemap.includes(`<loc>${ORIGIN}${path}</loc>`));
assert((await (await get('/robots.txt')).text()).includes(`${ORIGIN}/sitemap.xml`));
assert.equal((await get('/lore/not-a-realm/')).status, 404);
const play = await get('/play');
assert.equal(play.status, 200);
const gameHtmlSha256 = createHash('sha256').update(await play.text()).digest('hex');
console.log(JSON.stringify({ origin: base.origin, pages: pages.size, realms: lore.realms.length, places: lore.places.length, artworks: publishedArt.length, assets: assetPaths.size, marketingLink: true, sitemap: true, unknownLorePage: 404, gameHtmlSha256 }, null, 2));
