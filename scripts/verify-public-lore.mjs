// Read-only deployed-site checks. No game boot, storage, character or chat.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readLore, ORIGIN, escapeHtml } from './lore/content.mjs';

const base = new URL(process.argv[2] || ORIGIN), lore = readLore();
const paths = ['/lore/', '/lore/story/', ...lore.realms.map(realm => `/lore/${realm.id}/`)];
const pages = new Map(), assetPaths = new Set();
const get = path => fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) });
for (const path of paths) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type'), /text\/html/, path);
  const html = await response.text(); pages.set(path, html);
  assert(html.includes(`<link rel="canonical" href="${ORIGIN}${path}">`), path);
  assert(!html.includes('src/game/main.js'), path + ' must not boot the game');
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/lore\/assets\/[^" ]+)"/g)) assetPaths.add(asset);
}
for (const realm of lore.realms) {
  const html = pages.get(`/lore/${realm.id}/`);
  for (const place of realm.places) {
    assert(html.includes(`id="${place.id}"`), place.id);
    assert(html.includes(escapeHtml(place.geography)), place.id);
  }
}
for (const path of assetPaths) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type'), path.endsWith('.css') ? /css/ : /javascript/, path);
}
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
console.log(JSON.stringify({ origin: base.origin, pages: pages.size, realms: lore.realms.length, places: lore.places.length, assets: [...assetPaths], marketingLink: true, sitemap: true, unknownLorePage: 404, gameHtmlSha256 }, null, 2));
