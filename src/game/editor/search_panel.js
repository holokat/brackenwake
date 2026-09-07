import { buildSearchIndex, searchIndex, SEARCH_SCOPES, SEARCH_LIMIT } from './search.js';
import { theme } from '../ui_theme.js';

const element = (tag, cls, text) => {
  const node = document.createElement(tag);
  node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

function styles() {
  if (document.getElementById('bw-editor-search-css')) return;
  const style = element('style', '');
  style.id = 'bw-editor-search-css';
  style.textContent = `
  #bw-editor .global-search { position:relative; padding:12px 10px; border-bottom:1px solid ${theme.goldDim}66; }
  #bw-editor .global-search label { display:block; margin-bottom:7px; font-size:12px; color:${theme.parchment}; }
  #bw-editor .global-search .search-line { display:flex; gap:4px; align-items:center; }
  #bw-editor .global-search input { width:100%; min-height:40px; box-sizing:border-box; padding:8px; font-size:12px; }
  #bw-editor .global-search button { font:inherit; text-transform:none; letter-spacing:normal; color:${theme.parchmentDim}; cursor:pointer; border:0; background:transparent; min-height:40px; }
  #bw-editor .global-search button:focus-visible, #bw-editor .global-search input:focus-visible { outline:2px solid ${theme.gold}; outline-offset:2px; }
  #bw-editor .global-search .search-clear { min-width:40px; }
  #bw-editor .search-popup { position:absolute; top:100%; left:0; width:min(490px, calc(100vw - 96px)); z-index:5; padding:12px; box-sizing:border-box; background:#191610; border-radius:6px; box-shadow:0 8px 32px #0009,0 0 0 1px ${theme.goldDim}88; }
  #bw-editor .search-scopes { display:flex; gap:6px; padding-bottom:12px; }
  #bw-editor .search-scopes button { padding:0 12px; border-radius:4px; }
  #bw-editor .search-scopes button[aria-pressed=true] { color:${theme.goldBright}; background:#c9a44a24; }
  #bw-editor .search-results { max-height:min(440px,calc(100dvh - 280px)); overflow:auto; overscroll-behavior:contain; }
  #bw-editor .search-result { padding:9px 10px; margin:2px 0; border-radius:4px; cursor:pointer; min-height:40px; box-sizing:border-box; }
  #bw-editor .search-result[aria-selected=true] { background:#c9a44a24; box-shadow:inset 2px 0 ${theme.gold}; }
  #bw-editor .search-result .search-name { font-size:13px; color:${theme.parchment}; overflow-wrap:anywhere; }
  #bw-editor .search-result .search-detail { margin-top:4px; font-size:11px; line-height:1.4; color:${theme.parchmentFaint}; overflow-wrap:anywhere; }
  #bw-editor .search-status { padding:12px 2px 0; font-size:11px; line-height:1.5; color:${theme.parchmentFaint}; font-variant-numeric:tabular-nums; }
  #bw-editor .search-more { width:100%; margin-top:8px; }
  `;
  document.head.appendChild(style);
}

/** The index is built on focus, never on a game frame. Result DOM is bounded. */
export function createGlobalSearch({ parent, editor, options, choose, swallow }) {
  styles();
  const root = element('div', 'global-search');
  const label = element('label', '', 'Search everything');
  label.htmlFor = 'bw-builder-search';
  root.appendChild(label);
  const line = element('div', 'search-line');
  const input = element('input', '');
  input.type = 'text'; input.id = 'bw-builder-search'; input.placeholder = 'Find in world or library'; input.autocomplete = 'off';
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', 'bw-builder-results');
  input.title = 'Search all tools, library assets, placed objects and places. ⌘K or Ctrl+K.';
  line.appendChild(input);
  const clear = element('button', 'search-clear', '×'); clear.type = 'button'; clear.setAttribute('aria-label', 'Clear global search');
  line.appendChild(clear); root.appendChild(line);
  const popup = element('div', 'search-popup'); popup.style.display = 'none';
  const scopes = element('div', 'search-scopes'); scopes.setAttribute('aria-label', 'Search in'); popup.appendChild(scopes);
  const list = element('div', 'search-results'); list.id = 'bw-builder-results'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Search results'); popup.appendChild(list);
  const status = element('div', 'search-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); popup.appendChild(status);
  const more = element('button', 'search-more', 'Show more'); more.type = 'button'; popup.appendChild(more);
  root.appendChild(popup); parent.appendChild(root);
  let index = null, scope = 'all', visible = false, enabled = false, active = 0, limit = SEARCH_LIMIT, results = [], nodes = [];
  const scopeButtons = [];
  const rebuild = () => { index = buildSearchIndex(editor.searchSpaces(), options()); };
  function highlight() {
    nodes.forEach((node, i) => node.setAttribute('aria-selected', String(i === active)));
    if (nodes[active]) input.setAttribute('aria-activedescendant', nodes[active].id);
    else input.removeAttribute('aria-activedescendant');
  }
  function close() { visible = false; popup.style.display = 'none'; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  function draw() {
    if (!enabled) return;
    if (!index) rebuild();
    const found = searchIndex(index, input.value, scope, limit); results = found.rows; active = 0; nodes = [];
    list.textContent = '';
    results.forEach((row, i) => {
      const node = element('div', 'search-result'); node.id = `bw-builder-result-${i}`; node.setAttribute('role', 'option');
      node.appendChild(element('div', 'search-name', row.label));
      node.appendChild(element('div', 'search-detail', row.detail));
      node.addEventListener('pointerenter', () => { active = i; highlight(); });
      node.addEventListener('mousedown', e => e.preventDefault());
      node.addEventListener('click', () => activate(i));
      list.appendChild(node); nodes.push(node);
    });
    for (const [id, button] of scopeButtons) button.setAttribute('aria-pressed', String(id === scope));
    status.textContent = found.total ? `${Math.min(limit, found.total)} of ${found.total} results. ↑ ↓ to browse, Enter to select, Escape to close.` : 'No matches. Try a name, model, species or place.';
    more.style.display = found.total > limit ? '' : 'none';
    popup.style.display = ''; visible = true; input.setAttribute('aria-expanded', 'true'); highlight();
  }
  function activate(i) {
    const row = results[i]; if (!row) return;
    if (choose(row) === false) { rebuild(); draw(); return; }
    close(); input.blur?.();
  }
  for (const [id, name] of SEARCH_SCOPES) {
    const button = element('button', '', name); button.type = 'button';
    button.addEventListener('click', () => { scope = id; limit = SEARCH_LIMIT; draw(); input.focus?.(); });
    scopes.appendChild(button); scopeButtons.push([id, button]);
  }
  input.addEventListener('focus', () => { if (enabled) { rebuild(); limit = SEARCH_LIMIT; draw(); } });
  input.addEventListener('input', () => { limit = SEARCH_LIMIT; draw(); });
  clear.addEventListener('click', () => { input.value = ''; limit = SEARCH_LIMIT; draw(); input.focus?.(); });
  more.addEventListener('click', () => { limit += SEARCH_LIMIT; draw(); });
  function onKey(e) {
    if (!enabled) return false;
    const key = e.key?.toLowerCase(), editing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && key === 'k' || key === '/' && !editing) {
      e.preventDefault?.(); e.stopImmediatePropagation?.(); swallow?.(key); input.focus?.(); input.select?.();
      if (!visible) { rebuild(); draw(); } return true;
    }
    if (!visible) return false;
    if (key === 'escape') { close(); input.blur?.(); }
    else if (e.target === input && ['arrowdown', 'arrowup', 'enter'].includes(key)) {
      if (key === 'enter') activate(active);
      else if (results.length) { active = (active + (key === 'arrowdown' ? 1 : -1) + results.length) % results.length; highlight(); nodes[active]?.scrollIntoView?.({ block: 'nearest' }); }
    } else return false;
    e.preventDefault?.(); e.stopImmediatePropagation?.(); swallow?.(key); return true;
  }
  const outside = e => { if (visible && !root.contains?.(e.target)) close(); };
  window.addEventListener('pointerdown', outside, true);
  return { input, root, onKey, close,
    setLive(on) { enabled = on; index = null; if (!on) { close(); input.blur?.(); } },
    dispose() { window.removeEventListener('pointerdown', outside, true); root.remove(); },
  };
}
