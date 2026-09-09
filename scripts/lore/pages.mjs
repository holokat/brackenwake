import { ORIGIN, REPOSITORY, WORLD_SOURCE, STORY_SOURCE, DEVELOPMENT_NOTE, escapeHtml as e, storyHtml } from './content.mjs';

const realmHref = realm => `/lore/${realm.id}/`;
const kindLabel = kind => ({ hub: 'Settlement', town: 'Town', hamlet: 'Hamlet', landmark: 'Landmark', megastructure: 'Great landmark', dungeon: 'Dungeon', mine: 'Mine', cave: 'Cave', ruin: 'Ruin', shrine: 'Shrine', camp: 'Camp', wild: 'Wild country', sea: 'Sea', road: 'Road' })[kind] || kind;
const biomeLabel = biome => ({ meadow: 'Meadows and rivers', sakura: 'Blossom and deep forest', fen: 'Marsh and islands', desert: 'Sand and glass', mountain: 'Highlands and storms', graveyard: 'Ash and ancient bones', snow: 'Snow and glacier', ocean: 'Sea and drowned cities', crater: 'Cinder and dragonfire' })[biome] || biome;

function shell({ title, description, path, body, lore, current, assets, index = false }) {
  const canonical = ORIGIN + path;
  const nav = `<a href="/lore/"${current === 'atlas' ? ' aria-current="page"' : ''}>World atlas</a><a href="/lore/story/"${current === 'story' ? ' aria-current="page"' : ''}>The last dragon</a><a href="${REPOSITORY}">GitHub <span aria-hidden="true">↗</span></a><a class="play-link" href="/play">Enter the game <span aria-hidden="true">→</span></a>`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#111e18"><title>${e(title)} | Brackenwake</title>
<meta name="description" content="${e(description)}"><link rel="canonical" href="${canonical}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Brackenwake">
<meta property="og:title" content="${e(title)} | Brackenwake"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ORIGIN}/ui/brackenwake-og-v1.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/welcome-sigil.svg"><link rel="stylesheet" href="${assets.css}">
${index ? `<script type="module" src="${assets.js}"></script>` : ''}
</head><body>
<a class="skip-link" href="#content">Skip to content</a>
<header class="atlas-header"><a class="atlas-brand" href="/" aria-label="Brackenwake home"><img src="/welcome-sigil.svg" width="25" height="32" alt="">Brackenwake</a><nav aria-label="Brackenwake">${nav}</nav></header>
${body}
<footer class="atlas-footer"><p>${DEVELOPMENT_NOTE}</p><div><a href="${WORLD_SOURCE}">World source</a><a href="${STORY_SOURCE}">Story source</a><a href="/">Brackenwake home</a></div></footer>
</body></html>`;
}

function sidebar(lore, current) {
  return `<aside class="realm-sidebar"><nav aria-label="Realms"><p class="section-label">The realms</p>${lore.realms.map(realm => `<a href="${realmHref(realm)}"${current === realm.id ? ' aria-current="page"' : ''}><span class="chapter-number">${String(realm.chapter).padStart(2, '0')}</span>${e(realm.name)}</a>`).join('')}</nav></aside>`;
}

export function atlasPage(lore, assets) {
  const cards = lore.realms.map(realm => `<a class="realm-card" href="${realmHref(realm)}">
<div class="card-heading"><span class="chapter-number">${String(realm.chapter).padStart(2, '0')}</span><span class="section-label">${e(biomeLabel(realm.biome))}</span></div>
<h3>${e(realm.name)}</h3><p>${e(realm.line)}</p><span class="card-link">${realm.places.length} places to discover <span aria-hidden="true">→</span></span></a>`).join('');
  const places = lore.places.map(place => `<li data-place data-search="${e([place.name, place.realmName, place.geography, place.contains, kindLabel(place.kind)].join(' '))}" hidden><a href="/lore/${place.realmId}/#${place.id}"><span class="section-label">${e(place.realmName)} · ${e(kindLabel(place.kind))}</span><h3>${e(place.name)}</h3><p>${e(place.geography)}</p><span class="card-link">Read about this place <span aria-hidden="true">→</span></span></a></li>`).join('');
  const body = `<main id="content">
<section class="atlas-hero"><div class="hero-inner"><p class="eyebrow">The world of Brackenwake</p><h1>Lore and lands</h1><p class="hero-intro">${lore.realms.length} realms around the Caldera Sea. ${lore.places.length} named places, and a dragon with a long road ahead.</p><a class="text-link" href="/lore/story/">Begin with the last dragon <span aria-hidden="true">→</span></a></div></section>
<div class="atlas-content"><p class="development-note">${DEVELOPMENT_NOTE}</p>
<section class="atlas-search" hidden><label for="lore-search">Find a place</label><input id="lore-search" type="search" placeholder="A name, a landscape, a familiar face…" autocomplete="off" aria-describedby="search-help"><p id="search-help">Search every realm and place in the atlas.</p><p id="search-status" role="status" aria-live="polite"></p></section>
<section id="search-results" hidden aria-label="Matching places"><ul class="place-results">${places}</ul><p id="search-empty" hidden>No places found. Try another name or landscape.</p></section>
<section id="realm-list" aria-labelledby="realms-title"><div class="section-heading"><h2 id="realms-title">Choose a realm</h2><span>${lore.realms.length} chapters of the world</span></div><div class="realm-grid">${cards}</div></section>
</div></main>`;
  return shell({ title: 'Lore and lands', description: `Explore Brackenwake’s ${lore.realms.length} realms and ${lore.places.length} named places, their people, and the story of the last dragon.`, path: '/lore/', body, lore, current: 'atlas', assets, index: true });
}

function placeArticle(place) {
  return `<article class="place" id="${place.id}"><div class="place-heading"><h3><a href="#${place.id}">${e(place.name)}</a></h3><span class="place-kind">${e(kindLabel(place.kind))}</span></div><p>${e(place.geography)}</p><p class="discoveries">${e(place.contains)}</p>
${place.levels || place.boss ? `<p class="place-notes">${place.levels ? `${place.levels} dungeon levels` : ''}${place.levels && place.boss ? ' · ' : ''}${place.boss ? `Boss: ${e(place.boss)}` : ''}</p>` : ''}
${place.mechanic ? `<details class="place-detail"><summary>A rule of this place</summary><p>${e(place.mechanic)}</p></details>` : ''}</article>`;
}

export function realmPage(realm, lore, assets) {
  const next = lore.realms[realm.chapter % lore.realms.length];
  const body = `<main id="content" class="reading-layout">${sidebar(lore, realm.id)}<div class="realm-content">
<header class="realm-intro"><a class="breadcrumb" href="/lore/">World atlas <span aria-hidden="true">/</span> Chapter ${String(realm.chapter).padStart(2, '0')}</a><p class="eyebrow">${e(biomeLabel(realm.biome))}</p><h1>${e(realm.name)}</h1><p class="realm-line">${e(realm.line)}</p><p class="development-note">${DEVELOPMENT_NOTE}</p><nav class="chapter-nav" aria-label="In this realm"><a href="#landscape">The landscape</a><a href="#places">${realm.places.length} places</a><a href="#story">Story and people</a></nav></header>
<section id="landscape" class="reading-section"><h2>The landscape</h2><p class="geography">${e(realm.geography)}</p><div class="landmark"><p class="section-label">On the horizon</p><p>${e(realm.mega)}</p></div></section>
<section id="places" class="reading-section"><div class="section-heading"><h2>Places in ${e(realm.name.replace(/^The /, 'the '))}</h2><span>${realm.places.length} places</span></div><div class="places">${realm.places.map(placeArticle).join('')}</div></section>
<section class="reading-section"><h2>Encounters and events</h2><ul class="encounters">${realm.encounters.map(encounter => `<li>${e(encounter)}</li>`).join('')}</ul></section>
<section id="story" class="reading-section"><h2>Story and people</h2><p class="story-intro">The story outline for ${e(realm.name.replace(/^The /, 'the '))}, including its characters, secrets and the dragon’s journey.</p><details class="story-book"><summary><span>Read the story outline</span><small>Contains story spoilers</small></summary><div class="prose">${realm.story.map(block => `<section><h3>${e(block.title)}</h3>${storyHtml(block.body)}</section>`).join('')}</div></details></section>
<a class="next-chapter" href="${realmHref(next)}"><span class="section-label">Continue through the world</span><span>${e(next.name)} <span aria-hidden="true">→</span></span></a>
</div></main>`;
  return shell({ title: realm.name, description: realm.line, path: realmHref(realm), body, lore, current: realm.id, assets });
}

export function storyPage(lore, assets) {
  const body = `<main id="content" class="reading-layout">${sidebar(lore, '')}<article class="realm-content story-page">
<header class="realm-intro"><a class="breadcrumb" href="/lore/">World atlas</a><p class="eyebrow">The Dragonsworn</p><h1>The last dragon</h1><p class="realm-line">The world, the Bond, and Wyrmsoul.</p><p class="development-note">${DEVELOPMENT_NOTE}</p></header>
<div class="prose opening-story">${storyHtml(lore.premise)}
<section><h2>The dragon beside you</h2>${storyHtml(lore.dragon)}</section>
<section><h2>The Bond</h2>${storyHtml('The Bond ' + lore.bond)}</section>
<section><h2>Wyrmsoul</h2>${storyHtml(lore.wyrmsoul)}</section></div>
<a class="next-chapter" href="/lore/greenwold/"><span class="section-label">The first chapter</span><span>The Greenwold <span aria-hidden="true">→</span></span></a>
</article></main>`;
  return shell({ title: 'The last dragon', description: 'The Dragonsworn, the last dragon, and the pact that binds them. Read the story behind Brackenwake.', path: '/lore/story/', body, lore, current: 'story', assets });
}
