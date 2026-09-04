// The HUD. Plain CSS, injected once, no painted frames and no images.
//
// The farm's HUD was art first: a painted wooden frame with three tool cells
// cut into it, which is how five tools ended up stacked on top of each other
// and eating one another's clicks. This one counts its slots in code. TOOLS is
// the only list, the keys are its indices plus one, and if a fifth tool is
// added the row grows instead of overflowing.

export const TOOLS = [
  { id: 'hand',    label: 'hand',    key: '1', free: true },
  { id: 'axe',     label: 'axe',     key: '2' },
  { id: 'pickaxe', label: 'pickaxe', key: '3' },
  { id: 'bow',     label: 'bow',     key: '4' },
];

export const MATERIALS = ['wood', 'stone', 'ore'];

const CSS = `
#bw-hud, #bw-hud * { box-sizing: border-box; }
#bw-hud {
  position: fixed; inset: 0; pointer-events: none; z-index: 40;
  font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #f2ede2; text-shadow: 0 1px 2px rgba(0,0,0,.75);
  user-select: none; -webkit-user-select: none;
}
#bw-hud .panel {
  background: rgba(18,20,24,.56); border: 1px solid rgba(255,255,255,.14);
  border-radius: 8px; padding: 6px 10px; backdrop-filter: blur(3px);
}
#bw-purse { position: absolute; top: 12px; left: 12px; display: flex; gap: 8px; align-items: center; }
#bw-purse .stat { display: inline-flex; gap: 5px; align-items: baseline; }
#bw-purse .stat b { font-weight: 700; font-variant-numeric: tabular-nums; }
#bw-purse .stat span { opacity: .72; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
#bw-purse .stat.full b { color: #ffb37a; }
#bw-place {
  position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
  font-size: 14px; letter-spacing: .06em; opacity: .92; text-align: center; max-width: 60vw;
}
#bw-dev {
  position: absolute; top: 12px; right: 12px; display: none;
  font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #ffd479;
  border-color: rgba(255,212,121,.45);
}
#bw-dev.on { display: block; }
#bw-hint {
  position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%);
  font-size: 13px; opacity: 0; transition: opacity .12s ease; white-space: nowrap;
}
#bw-hint.on { opacity: 1; }
#bw-tools {
  position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%);
  display: flex; gap: 8px; pointer-events: auto;
}
#bw-tools .slot {
  width: 62px; padding: 5px 0 6px; text-align: center; cursor: pointer;
  background: rgba(18,20,24,.56); border: 1px solid rgba(255,255,255,.14); border-radius: 8px;
}
#bw-tools .slot .k { display: block; font-size: 10px; opacity: .6; }
#bw-tools .slot .n { display: block; font-size: 12px; letter-spacing: .02em; }
#bw-tools .slot.locked { opacity: .38; cursor: default; }
#bw-tools .slot.active { border-color: #ffd479; box-shadow: 0 0 0 1px #ffd479 inset; }
#bw-toasts {
  position: absolute; left: 12px; bottom: 18px; width: min(380px, 42vw);
  display: flex; flex-direction: column-reverse; gap: 6px;
}
#bw-toasts .t {
  padding: 7px 10px; border-radius: 8px; font-size: 13px; line-height: 1.35;
  background: rgba(18,20,24,.62); border: 1px solid rgba(255,255,255,.14);
  animation: bw-in .16s ease-out; transition: opacity .35s ease, transform .35s ease;
}
#bw-toasts .t.good { border-color: rgba(140,220,140,.5); }
#bw-toasts .t.bad  { border-color: rgba(232,140,120,.55); }
#bw-toasts .t.out { opacity: 0; transform: translateY(6px); }
@keyframes bw-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
`;

const TOAST_MS = 4200;
const TOAST_MAX = 5;

export function createHud(root) {
  if (!document.getElementById('bw-hud-css')) {
    const style = document.createElement('style');
    style.id = 'bw-hud-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const el = document.createElement('div');
  el.id = 'bw-hud';
  el.innerHTML = `
    <div id="bw-purse" class="panel"></div>
    <div id="bw-place" class="panel"></div>
    <div id="bw-dev" class="panel">fly mode</div>
    <div id="bw-hint"></div>
    <div id="bw-tools"></div>
    <div id="bw-toasts"></div>`;
  (root || document.body).appendChild(el);

  const purse = el.querySelector('#bw-purse');
  const place = el.querySelector('#bw-place');
  const devBadge = el.querySelector('#bw-dev');
  const hint = el.querySelector('#bw-hint');
  const toolRow = el.querySelector('#bw-tools');
  const toasts = el.querySelector('#bw-toasts');

  // one slot per tool, built once. The row is flex, so the count is whatever
  // TOOLS says and nothing lands on top of anything else.
  let onToolPick = null;
  const slots = TOOLS.map((t) => {
    const s = document.createElement('div');
    s.className = 'slot locked';
    s.dataset.tool = t.id;
    s.innerHTML = `<span class="k">${t.key}</span><span class="n">${t.label}</span>`;
    s.addEventListener('click', () => {
      if (s.classList.contains('locked')) return;
      if (onToolPick) onToolPick(t.id);
    });
    toolRow.appendChild(s);
    return s;
  });

  let coins = 0;
  let mats = { wood: 0, stone: 0, ore: 0 };
  let caps = { wood: 150, stone: 150, ore: 150 };

  function drawPurse() {
    const parts = [`<span class="stat"><b>${coins}</b><span>coins</span></span>`];
    for (const m of MATERIALS) {
      const have = mats[m] ?? 0, cap = caps[m] ?? 0;
      const full = cap > 0 && have >= cap;
      parts.push(`<span class="stat${full ? ' full' : ''}"><b>${have}/${cap}</b><span>${m}</span></span>`);
    }
    purse.innerHTML = parts.join('');
  }
  drawPurse();

  return {
    el,

    /** A line of feedback. kind: 'good' | 'bad' | undefined. */
    toast(html, kind) {
      const t = document.createElement('div');
      t.className = 't' + (kind ? ' ' + kind : '');
      t.innerHTML = html;
      toasts.appendChild(t);
      while (toasts.children.length > TOAST_MAX) toasts.firstChild.remove();
      setTimeout(() => {
        t.classList.add('out');
        setTimeout(() => t.remove(), 400);
      }, TOAST_MS);
      return t;
    },

    setMaterials(m, c) {
      if (m) mats = { ...mats, ...m };
      if (c) caps = { ...caps, ...c };
      drawPurse();
    },
    setCoins(c) { coins = c | 0; drawPurse(); },

    /** `owned` is a Set of tool ids, or anything with .has. 'hand' is free. */
    setTool(tool, owned) {
      for (let i = 0; i < TOOLS.length; i++) {
        const t = TOOLS[i];
        const has = t.free || (owned && owned.has && owned.has(t.id));
        slots[i].classList.toggle('locked', !has);
        slots[i].classList.toggle('active', t.id === tool);
      }
    },
    onTool(fn) { onToolPick = fn; },

    setPlace(text) { place.textContent = text || ''; place.style.display = text ? '' : 'none'; },
    setDev(on) { devBadge.classList.toggle('on', !!on); },
    setHint(text) { hint.textContent = text || ''; hint.classList.toggle('on', !!text); },

    dispose() { el.remove(); },
  };
}
