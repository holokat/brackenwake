import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REALMS, PLACES } from '../mmo/realms.js';
import { readLore, storyHtml, escapeHtml, ORIGIN } from '../../scripts/lore/content.mjs';
import { atlasPage, realmPage, storyPage } from '../../scripts/lore/pages.mjs';
import { placePage } from '../../scripts/lore/place-page.mjs';
import { PLACE_NOTES } from '../../scripts/lore/place-notes.mjs';
import { artSpecs, publishedArt, sharedRealmArt, artTitle, artPath, CONCEPT_NOTE } from '../../scripts/lore/art.mjs';
import { matchingPlaces, normaliseSearch, mountSearch } from './search.js';

const lore = readLore();
const assets = { css: '/lore/assets/atlas.css', js: '/lore/assets/search.js', motion: '/lore/assets/motion.js' };
const pages = new Map([
  ['/lore/', atlasPage(lore, assets)],
  ['/lore/story/', storyPage(lore, assets)],
  ...lore.realms.map(realm => [`/lore/${realm.id}/`, realmPage(realm, lore, assets)]),
  ...lore.realms.flatMap(realm => realm.places.map(place => [`/lore/${realm.id}/${place.id}/`, placePage(place, realm, lore, assets)])),
]);

test('the atlas covers every authored realm and place, with current canonical story chapters', () => {
  assert.equal(lore.realms.length, REALMS.length);
  assert.equal(lore.places.length, PLACES.length);
  assert.equal(new Set(lore.places.map(place => place.id)).size, PLACES.length);
  for (const realm of REALMS) {
    assert.match(realm.id, /^[a-z0-9_]+$/);
    const html = pages.get(`/lore/${realm.id}/`);
    assert(html.includes(escapeHtml(realm.geography)));
    for (const place of realm.places) {
      assert.match(place.id, /^[a-z0-9_]+$/);
      assert.equal(html.split(`id="${place.id}"`).length, 2, place.name);
      assert(html.includes(escapeHtml(place.geography)), place.name);
      assert(html.includes(escapeHtml(place.contains)), place.name);
      if (place.mechanic) assert(html.includes(escapeHtml(place.mechanic)), place.name);
    }
  }
  assert(pages.get('/lore/greenwold/').includes('8 dungeon levels'));
  assert(pages.get('/lore/ashenthrone/').includes('The hearts given'));
  assert(pages.get('/lore/story/').includes('The last egg is the one that hatched on your arm this morning.'));
});

test('published pages omit superseded books, naming drafts and implementation instructions', () => {
  for (const html of pages.values()) {
    assert(!/kal-DEH-ra|If Brackenwake does not land|The user's brief|## 7\. The build order|id="md-story"/.test(html));
    assert(!html.includes('src/game/main.js'));
    assert(!html.includes('cdnjs.cloudflare.com'));
    assert(html.includes('Some places, characters and events are still in development.'));
    assert(!html.includes('\u2014'));
  }
});

test('all public lore navigation and place anchors resolve within the generated pages', () => {
  const allowed = new Set(['/', '/play', assets.css, assets.js, '/welcome-sigil.svg']);
  for (const [path, html] of pages) {
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length, new Set(ids).size, path + ' has unique section anchors');
    assert(html.includes(`<link rel="canonical" href="${ORIGIN}${path}">`));
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      const target = new URL(href, ORIGIN + path);
      if (target.origin !== ORIGIN || allowed.has(target.pathname)) continue;
      assert(pages.has(target.pathname), `${path} links to ${href}`);
      if (target.hash) assert(pages.get(target.pathname).includes(`id="${target.hash.slice(1)}"`), href);
    }
  }
});

test('the small story renderer escapes source text, preserves lists, and refuses unsupported formatting', () => {
  const html = storyHtml('**A name.** <script>alert(1)</script>\n\n- **First.** A story\n  continued.\n- *Second.* Another.');
  assert(!html.includes('<script>'));
  assert(html.includes('&lt;script&gt;'));
  assert(html.includes('<strong>A name.</strong>'));
  assert(html.includes('<li><strong>First.</strong> A story continued.</li>'));
  assert.throws(() => storyHtml('| new | table |'), /explicit renderer/);
});

test('each authored place has its own illustrated page and individual concept notes', () => {
  assert.deepEqual(Object.keys(PLACE_NOTES).sort(), lore.places.map(place => place.id).sort());
  assert.equal(new Set(Object.values(PLACE_NOTES)).size, lore.places.length);
  const artworks = new Set(artSpecs.map(spec => spec.id));
  assert.equal(artworks.size, artSpecs.length);
  for (const realm of lore.realms) for (const place of realm.places) {
    const path = `/lore/${realm.id}/${place.id}/`, html = pages.get(path);
    assert(html, path);
    assert(artworks.has(place.id), place.name);
    assert(PLACE_NOTES[place.id].split(/\s+/).length >= 30, place.name + ' needs real narrative development');
    assert(html.includes(escapeHtml(PLACE_NOTES[place.id])), place.name);
    assert(html.includes(escapeHtml(place.geography)), place.name);
    assert(html.includes(escapeHtml(place.contains)), place.name);
    assert(html.includes('Concept notes for the illustrated atlas.'), place.name);
    assert(html.includes(`content="${ORIGIN}${artPath(place.id)}"`), place.name + ' has its selected social cover');
  }
});

test('every illustration is visibly labeled, has descriptive alt text, and all reading works without JavaScript', () => {
  for (const [path, html] of pages) {
    const figures = [...html.matchAll(/<figure class="concept-art[\s\S]*?<\/figure>/g)].map(match => match[0]);
    assert(figures.length > 0, path);
    assert(html.includes(CONCEPT_NOTE), path);
    for (const figure of figures) {
      assert(figure.includes('<figcaption'), path);
      assert(/(?:Concept art|Realm concept art)<\/figcaption>/.test(figure), path);
      assert(figure.includes('alt="Concept illustration of '), path);
      assert(figure.includes('width="1536" height="1024"'), path);
    }
    assert.equal((html.match(/fetchpriority="high"/g) || []).length, 1, path);
    assert(!html.includes(' hidden><main'), path);
    assert(html.includes('<main id="content">'), path);
  }
});

test('search handles accents, mixed case, multiword queries and no matches', () => {
  const places = lore.places.map(place => ({ id: place.id, search: normaliseSearch([place.name, place.realmName, place.geography, place.contains].join(' ')) }));
  assert.deepEqual(matchingPlaces(places, 'ÓRAM cellars').map(place => place.id), ['oldcellars']);
  assert(matchingPlaces(places, 'frost').length > 0);
  assert.equal(matchingPlaces(places, 'zzzznotaplace').length, 0);
  assert.equal(matchingPlaces(places, '  ').length, 0);
});

test('the real search controller restores the realm list on clear and announces empty results', () => {
  const input = Object.assign(new EventTarget(), { value: '' });
  const elements = new Map([
    ['#lore-search', input], ['#realm-list', { hidden: false }], ['#search-results', { hidden: true }],
    ['#search-status', { textContent: '' }], ['#search-empty', { hidden: true }], ['.atlas-search', { hidden: true }],
  ]);
  const nodes = [{ hidden: true, dataset: { search: 'The Old Cellars Oram Greenwold' } }, { hidden: true, dataset: { search: 'The Ice Vault Frostreach' } }];
  mountSearch({ querySelector: selector => elements.get(selector), querySelectorAll: () => nodes });
  assert.equal(elements.get('.atlas-search').hidden, false);
  input.value = 'cellars'; input.dispatchEvent(new Event('input'));
  assert.equal(nodes[0].hidden, false); assert.equal(nodes[1].hidden, true);
  assert.equal(elements.get('#realm-list').hidden, true);
  assert.equal(elements.get('#search-status').textContent, '1 place found');
  input.value = 'unknown'; input.dispatchEvent(new Event('input'));
  assert.equal(elements.get('#search-empty').hidden, false);
  input.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  assert.equal(input.value, '');
  assert.equal(elements.get('#realm-list').hidden, false);
  assert.equal(elements.get('#search-results').hidden, true);
  assert.equal(elements.get('#search-status').textContent, '');
});

test('marketing and GitHub link directly to the public atlas', () => {
  const welcome = readFileSync(new URL('../../welcome/index.html', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert(welcome.includes('href="/lore/">Lore and lands'));
  assert(readme.includes('[Lore and lands](https://brackenwake.com/lore/)'));
  assert(readme.includes('[Play Brackenwake](https://brackenwake.com/play)'));
});


test('shared regional illustrations are explicitly described as realm art', () => {
  assert.equal(publishedArt.length, 92);
  for (const realm of lore.realms) for (const place of realm.places) {
    if (!sharedRealmArt[place.id]) continue;
    assert.equal(sharedRealmArt[place.id], realm.id);
    const html = pages.get(`/lore/${realm.id}/${place.id}/`);
    assert(html.includes('Realm concept art</figcaption>'));
    assert(html.includes(`Concept illustration of ${escapeHtml(artTitle(place.id))}, the surrounding realm`));
  }
});
