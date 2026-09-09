import { ORIGIN, REPOSITORY, WORLD_SOURCE, STORY_SOURCE, DEVELOPMENT_NOTE, escapeHtml as e } from './content.mjs';
import { artPath, artTitle, sharedRealmArt, CONCEPT_NOTE } from './art.mjs';

export const realmHref = realm => `/lore/${realm.id}/`;
export const placeHref = (realm, place) => `/lore/${realm.id}/${place.id}/`;
export const kindLabel = kind => ({ hub: 'Settlement', town: 'Town', hamlet: 'Hamlet', landmark: 'Landmark', megastructure: 'Great landmark', dungeon: 'Dungeon', mine: 'Mine', cave: 'Cave', ruin: 'Ruin', shrine: 'Shrine', camp: 'Camp', wild: 'Wild country', sea: 'Sea', road: 'Road' })[kind] || kind;
export const biomeLabel = biome => ({ meadow: 'Meadows and rivers', sakura: 'Blossom and deep forest', fen: 'Marsh and islands', desert: 'Sand and glass', mountain: 'Highlands and storms', graveyard: 'Ash and ancient bones', snow: 'Snow and glacier', ocean: 'Sea and drowned cities', crater: 'Cinder and dragonfire' })[biome] || biome;

export function art(id, title, { eager = false, className = '' } = {}) {
  const regional = !!sharedRealmArt[id];
  return `<figure class="concept-art ${className}"><img src="${artPath(id)}" alt="Concept illustration of ${e(regional ? artTitle(id) : title)}${regional ? ', the surrounding realm' : ''}" width="1536" height="1024" ${eager ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"'} decoding="async"><figcaption title="${CONCEPT_NOTE}"><span aria-hidden="true">✧</span> ${regional ? 'Realm concept art' : 'Concept art'}</figcaption></figure>`;
}

export function cover({ id, title, eyebrow, intro, breadcrumb = '', after = '', className = '' }) {
  return `<header class="page-cover ${className}">${art(id, title, { eager: true })}<div class="cover-shade"></div><div class="cover-inner">${breadcrumb ? `<nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumb}</nav>` : ''}<p class="eyebrow">${e(eyebrow)}</p><h1>${e(title)}</h1><p class="cover-intro">${e(intro)}</p>${after}</div></header>`;
}

export function shell({ title, description, path, body, current, assets, image = 'atlas', index = false }) {
  const canonical = ORIGIN + path;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b1512"><title>${e(title)} | Brackenwake</title>
<meta name="description" content="${e(description)}"><link rel="canonical" href="${canonical}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Brackenwake">
<meta property="og:title" content="${e(title)} | Brackenwake"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ORIGIN}${artPath(image)}"><meta property="og:image:alt" content="Concept art of ${e(artTitle(image))}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/welcome-sigil.svg"><link rel="stylesheet" href="${assets.css}">
${index ? `<script type="module" src="${assets.js}"></script>` : ''}
${assets.motion ? `<script type="module" src="${assets.motion}"></script>` : ''}
</head><body>
<a class="skip-link" href="#content">Skip to content</a>
<header class="atlas-header"><a class="atlas-brand" href="/" aria-label="Brackenwake home"><img src="/welcome-sigil.svg" width="25" height="32" alt="">Brackenwake</a><nav aria-label="Brackenwake"><a href="/lore/"${current === 'atlas' ? ' aria-current="page"' : ''}>World atlas</a><a href="/lore/story/"${current === 'story' ? ' aria-current="page"' : ''}>The last dragon</a><a href="${REPOSITORY}">GitHub <span aria-hidden="true">↗</span></a><a class="play-link" href="/play">Enter the game <span aria-hidden="true">→</span></a></nav></header>
${body}
<footer class="atlas-footer"><a class="footer-brand" href="/">Brackenwake</a><div><p>${CONCEPT_NOTE}</p><p>${DEVELOPMENT_NOTE}</p><nav aria-label="Sources"><a href="${WORLD_SOURCE}">World source ↗</a><a href="${STORY_SOURCE}">Story source ↗</a><a href="/lore/">Back to the atlas ↑</a></nav></div></footer>
</body></html>`;
}

export function sidebar(lore, current, places = []) {
  return `<aside class="realm-sidebar"><details class="atlas-directory" open><summary>The realms <span aria-hidden="true">⌄</span></summary><nav aria-label="Realms">${lore.realms.map((realm, index) => `<a href="${realmHref(realm)}"${current === realm.id ? ' aria-current="page"' : ''}><span class="chapter-number">${String(index + 1).padStart(2, '0')}</span>${e(realm.name)}</a>`).join('')}</nav></details>${places.length ? `<details class="place-directory"><summary>Places in this realm <span aria-hidden="true">⌄</span></summary><nav aria-label="Places">${places.map(place => `<a href="/lore/${current}/${place.id}/">${e(place.name)}</a>`).join('')}</nav></details>` : ''}</aside>`;
}

export function nextChapter(realm, label = 'Another chapter of the world') {
  return `<a class="next-chapter" href="${realmHref(realm)}">${art(realm.id, realm.name)}<div><span class="section-label">${e(label)}</span><span>${e(realm.name)} <span aria-hidden="true">→</span></span></div></a>`;
}
