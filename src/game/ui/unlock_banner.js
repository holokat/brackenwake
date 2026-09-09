import {abilityIcon} from '../icon_art.js';

/** One banner and one queue for abilities, achievements and their reveal cues. */
export function createUnlockBanner(root, {shape, total, queueMax, phaseAt}) {
  const make = (tag, parent, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  };
  const box = make('div', root); box.id = 'bw-unlock';
  box.setAttribute?.('role', 'status');
  box.setAttribute?.('aria-live', 'polite');
  box.setAttribute?.('aria-atomic', 'true');
  const lead = make('div', box, 'ul'); lead.textContent = "You've unlocked";
  const frame = make('div', box, 'uf'); frame.setAttribute?.('aria-hidden', 'true');
  const image = make('img', frame); image.alt = ''; image.draggable = false;
  const glyph = make('span', frame, 'glyph');
  const name = make('div', box, 'un');
  const hint = make('div', box, 'uk');
  const waiting = [];
  let showing = null;

  function paint(entry) {
    lead.textContent = entry.label;
    name.textContent = entry.name;
    hint.textContent = entry.key;
    hint.style.display = entry.key ? '' : 'none';
    const sprite = entry.art && typeof entry.art === 'object' ? entry.art : null;
    frame.style.backgroundImage = sprite ? `url('${sprite.src}')` : '';
    frame.style.backgroundSize = sprite?.size || '';
    frame.style.backgroundPosition = sprite?.position || '';
    if (entry.art && !sprite) image.src = entry.art;
    else if (image.removeAttribute) image.removeAttribute('src');
    else image.src = '';
    image.style.display = entry.art && !sprite ? '' : 'none';
    glyph.style.display = entry.art ? 'none' : '';
    glyph.textContent = entry.art ? '' : entry.name.slice(0, 1).toUpperCase();
    // Reveal is the cue boundary, including entries that waited behind another.
    try { entry.onShow?.(); } catch { /* Optional audio cannot interrupt the HUD. */ }
  }
  function draw() {
    if (showing && phaseAt(showing.t, shape).phase === 'done') {
      showing = waiting.shift() || null;
      if (showing) { showing.t = 0; paint(showing); }
    }
    if (!showing) { box.classList.remove('on'); box.style.opacity = '0'; return; }
    box.classList.add('on');
    box.style.opacity = phaseAt(showing.t, shape).opacity.toFixed(3);
  }
  return {
    enqueue(entry = {}) {
      const name = String(entry?.name ?? '').trim();
      if (!name) return null;
      const next = {id: entry.id || null, name, key: String(entry.key ?? '').trim(),
        label: entry.label || "You've unlocked", art: entry.art ?? abilityIcon(entry.id),
        onShow: entry.onShow, t: 0};
      if (showing) {
        waiting.push(next);
        while (waiting.length > queueMax) waiting.shift();
      } else { showing = next; paint(next); draw(); }
      return {name, key: next.key, seconds: total, queued: waiting.length};
    },
    update(dt) { if (showing) { showing.t += dt; draw(); } },
    get state() {
      if (!showing) return {phase: 'done', opacity: 0, name: null, key: null, art: null, t: 0, queued: waiting.length};
      const {id, name, key, art, label, t} = showing;
      return {...phaseAt(t, shape), id, name, key, art, label, t, queued: waiting.length};
    },
  };
}
