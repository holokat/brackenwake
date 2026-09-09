import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readLore } from './content.mjs';
import { publishedArt, artPath } from './art.mjs';
import { PLACE_NOTES } from './place-notes.mjs';
import { webpDimensions } from './art-metadata.mjs';
import { atlasPage, realmPage, storyPage } from './pages.mjs';
import { placePage } from './place-page.mjs';

const lore = readLore();
const assets = { css: '/lore/assets/atlas.css', js: '/lore/assets/search.js' };
const pages = [atlasPage(lore, assets), storyPage(lore, assets), ...lore.realms.map(realm => realmPage(realm, lore, assets)), ...lore.realms.flatMap(realm => realm.places.map(place => placePage(place, realm, lore, assets)))];
const hashes = new Set();
let bytes = 0;
for (const spec of publishedArt) {
  const url = new URL(`../../public${artPath(spec.id)}`, import.meta.url);
  const data = readFileSync(url);
  assert.equal(data.toString('ascii', 0, 4), 'RIFF', spec.id);
  assert.equal(data.toString('ascii', 8, 12), 'WEBP', spec.id);
  assert(data.length > 10000, spec.id + ' must be real generated art');
  assert.deepEqual(webpDimensions(data), { width: 1536, height: 1024 }, spec.id + ' matches its declared image dimensions');
  const hash = createHash('sha256').update(data).digest('hex');
  assert(!hashes.has(hash), spec.id + ' must have distinct artwork');
  hashes.add(hash); bytes += statSync(url).size;
  assert(pages.some(html => html.includes(`src="${artPath(spec.id)}"`)), spec.id + ' must be displayed');
}
assert.deepEqual(Object.keys(PLACE_NOTES).sort(), lore.places.map(place => place.id).sort());
assert.equal(pages.length, 2 + lore.realms.length + lore.places.length);
const css = readFileSync(new URL('../../src/lore/atlas.css', import.meta.url), 'utf8');
assert(css.split('\n').length <= 1000);
assert(!/text-transform:\s*uppercase|transition:\s*all/.test(css));
assert(css.includes('prefers-reduced-motion'));
console.log(JSON.stringify({ pages: pages.length, places: lore.places.length, artworks: hashes.size, artMegabytes: +(bytes / 1048576).toFixed(2) }));
console.log('Illustrated lore verification passed');
