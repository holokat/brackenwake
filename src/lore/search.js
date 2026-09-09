/** Progressive enhancement: every realm and place is readable without scripts. */
export const normaliseSearch = value => String(value).normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

export function matchingPlaces(places, query) {
  const terms = normaliseSearch(query).split(' ').filter(Boolean);
  return terms.length ? places.filter(place => terms.every(term => place.search.includes(term))) : [];
}

export function mountSearch(doc = document) {
  const input = doc.querySelector('#lore-search');
  if (!input) return;
  const places = [...doc.querySelectorAll('[data-place]')].map(node => ({ node, search: normaliseSearch(node.dataset.search) }));
  const regionList = doc.querySelector('#realm-list'), results = doc.querySelector('#search-results');
  const status = doc.querySelector('#search-status'), empty = doc.querySelector('#search-empty');
  function update() {
    const query = input.value.trim(), matches = new Set(matchingPlaces(places, query));
    for (const place of places) place.node.hidden = !matches.has(place);
    regionList.hidden = !!query; results.hidden = !query;
    empty.hidden = !query || matches.size > 0;
    status.textContent = query ? `${matches.size} ${matches.size === 1 ? 'place' : 'places'} found` : '';
  }
  doc.querySelector('.atlas-search').hidden = false;
  input.addEventListener('input', update);
  input.addEventListener('keydown', event => { if (event.key === 'Escape') { input.value = ''; update(); } });
  update();
  return update;
}

if (typeof document !== 'undefined') mountSearch();
