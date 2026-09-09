import { escapeHtml as e } from './content.mjs';
import { art, cover, shell, realmHref, placeHref, kindLabel } from './layout.mjs';
import { PLACE_NOTES } from './place-notes.mjs';

export function placePage(place, realm, lore, assets) {
  const index = realm.places.findIndex(item => item.id === place.id);
  const related = [1, 2, 3].map(offset => realm.places[(index + offset) % realm.places.length]);
  const body = `<main id="content">${cover({ id: place.id, title: place.name, eyebrow: `${kindLabel(place.kind)} · ${realm.name}`, intro: place.geography, breadcrumb: `<a href="/lore/">World atlas</a><span aria-hidden="true">/</span><a href="${realmHref(realm)}">${e(realm.name)}</a>` })}
<article class="destination-layout"><div class="destination-body"><div><p class="eyebrow">A closer look</p><h2>At the threshold</h2><div class="prose"><p>${e(PLACE_NOTES[place.id])}</p></div><p class="development-note destination-note">Concept notes for the illustrated atlas. The setting and its details may change as the world develops.</p><section class="destination-lore prose"><h2>People and discoveries</h2><p>${e(place.contains)}</p>${place.levels || place.boss ? `<p class="place-notes">${place.levels ? `${place.levels} planned dungeon levels. ` : ''}${place.boss ? `Named encounter: ${e(place.boss)}.` : ''}</p>` : ''}${place.mechanic ? `<h3>A planned rule of this place</h3><p>${e(place.mechanic)}</p>` : ''}</section></div>
<aside class="destination-meta">${art(realm.id, realm.name)}<p class="section-label">Part of the world</p><h2>${e(realm.name)}</h2><p>${e(realm.line)}</p><a class="text-link" href="${realmHref(realm)}#${place.id}">Back to this realm <span aria-hidden="true">→</span></a></aside></div>
<section class="reading-section"><div class="section-heading"><div><p class="eyebrow">Keep wandering</p><h2>Elsewhere in this realm</h2></div><a class="text-link" href="${realmHref(realm)}#places">All ${realm.places.length} places <span aria-hidden="true">→</span></a></div><div class="related-places">${related.map(other => `<a class="related-place" href="${placeHref(realm, other)}">${art(other.id, other.name)}<h3>${e(other.name)} <span aria-hidden="true">↗</span></h3><p>${e(kindLabel(other.kind))}</p></a>`).join('')}</div></section></article></main>`;
  return shell({ title: place.name, description: `${place.geography} Illustrated concept lore from ${realm.name}.`, path: placeHref(realm, place), body, current: realm.id, assets, image: place.id });
}
