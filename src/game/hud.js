// The HUD. Plain CSS, injected once, no painted frames and no images.
//
// The farm's HUD was art first: a painted wooden frame with three tool cells
// cut into it, which is how five tools ended up stacked on top of each other
// and eating one another's clicks. This one counts its slots in code. TOOLS is
// the only list, the keys are its indices plus one, and if a fifth tool is
// added the row grows instead of overflowing. The ability bar below is built
// the same way from BAR_KEYS, and BAR_SLOTS is its length, never a number
// typed twice.
//
// WHAT GREW (W4, per docs/mmo/07-RUNTIME-CONTRACT.md and 06-ECONOMY-UI.md):
//   pools with numbers top left, red health, blue mana, yellow stamina
//   buff and debuff icons with timers under them
//   the target frame under the place name, tier coloured
//   the twelve slot bar with cooldown sweeps, red unaffordable costs, keys
//   hud.log(text, kind), bottom left, the last LOG_LINES lines
//   hud.update(dt, view)
//
// Everything that was here before is here still and behaves the same way:
// toast, setMaterials, setCoins, setTool, onTool, setPlace, setDev, setHint
// and el. interact.js and shop.js call four of those every frame, so this file
// grows around them rather than through them. The tool row and the hint moved
// up the screen to make room for the ability bar; nothing reads their
// position, and two rows of slots on top of each other is the exact bug the
// comment above is about.
//
// The skeleton is built with createElement rather than one innerHTML string,
// so hud.test.mjs can run the real createHud against a small fake document.
// A HUD that could only be checked by eye is a HUD nobody checks.

export const TOOLS = [
  { id: 'hand',    label: 'hand',    key: '1', free: true },
  { id: 'axe',     label: 'axe',     key: '2' },
  { id: 'pickaxe', label: 'pickaxe', key: '3' },
  { id: 'bow',     label: 'bow',     key: '4' },
];

export const MATERIALS = ['wood', 'stone', 'ore'];

/** Twelve slots, keys 1 to 0 then minus and equals. Same list as the runtime's. */
export const BAR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
export const BAR_SLOTS = BAR_KEYS.length;

/** What a key cap says when the key itself is not the clearest glyph. */
export const KEY_LABELS = { '=': '+' };

/** The three pools, in the order 06-ECONOMY-UI.md lists them. */
export const POOLS = [
  { id: 'health', label: 'health', colour: '#e04b3a' },
  { id: 'mana', label: 'mana', colour: '#4a8ff0' },
  { id: 'stamina', label: 'stamina', colour: '#e0bb3a' },
];

export const LOG_LINES = 8;

/** The log's colours by kind. An unknown kind is a plain line, never an error. */
export const LOG_KINDS = {
  good: '#8ee07a', bad: '#ff8a72', ability: '#cbb6ff',
  gain: '#5dff6a', loot: '#ffd76a', target: '#9fd8ff',
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Pure. The three bars, from an actor. A pool with no maximum is not drawn at
 * all rather than drawn empty, because a character with no stamina recorded
 * yet is a boot order question and an empty yellow trough is a bug report.
 */
export function poolView(actor = {}) {
  const out = [];
  for (const p of POOLS) {
    const max = num(actor[`max${p.id[0].toUpperCase()}${p.id.slice(1)}`]);
    if (max <= 0) continue;
    const value = clamp(num(actor[p.id]), 0, max);
    out.push({ id: p.id, label: p.label, colour: p.colour, value, max, pct: value / max });
  }
  return out;
}

/**
 * Pure. How much of a cooldown sweep is still dark, 1 just after the press and
 * 0 when it is ready. A zero cooldown ability never sweeps.
 */
export function sweep(cooldownLeft, cooldown) {
  const cd = num(cooldown);
  if (cd <= 0) return 0;
  return clamp(num(cooldownLeft) / cd, 0, 1);
}

/** Pure. What the corner of a bar slot says its cost is. */
export function costLabel(ability) {
  if (!ability || !ability.cost) return '';
  if (typeof ability.cost.stamina === 'number') return ability.cost.stamina ? String(ability.cost.stamina) : '';
  if (typeof ability.cost.mana === 'number') return ability.cost.mana ? String(ability.cost.mana) : '';
  if (ability.cost.item) return String(ability.cost.count ?? 1);
  return '';
}

/** Pure. A countdown as an icon corner reads it: 12, 9, 0.4. */
export function timerLabel(seconds) {
  const s = num(seconds);
  if (!Number.isFinite(seconds)) return '';
  if (s >= 60) return `${Math.round(s / 60)}m`;
  if (s >= 1) return String(Math.round(s));
  return s > 0 ? s.toFixed(1) : '';
}

/** Pure. The last `max` lines, oldest first. */
export function logTrim(lines, max = LOG_LINES) {
  return lines.slice(Math.max(0, lines.length - max));
}

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
#bw-tl { position: absolute; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
#bw-purse { display: flex; gap: 8px; align-items: center; }
#bw-purse .stat { display: inline-flex; gap: 5px; align-items: baseline; }
#bw-purse .stat b { font-weight: 700; font-variant-numeric: tabular-nums; }
#bw-purse .stat span { opacity: .72; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
#bw-purse .stat.full b { color: #ffb37a; }

#bw-pools { display: none; flex-direction: column; gap: 4px; width: 224px; }
#bw-pools.on { display: flex; }
#bw-pools .pool { position: relative; height: 16px; border-radius: 4px; overflow: hidden;
  background: rgba(0,0,0,.46); border: 1px solid rgba(255,255,255,.16); }
#bw-pools .pool .fill { position: absolute; inset: 0 auto 0 0; width: 0%; transition: width .12s linear; }
#bw-pools .pool .n { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: .02em; }

#bw-auras { display: flex; gap: 4px; flex-wrap: wrap; width: 224px; }
#bw-auras .aura { position: relative; width: 26px; height: 26px; border-radius: 5px;
  background: rgba(18,20,24,.7); border: 1px solid rgba(140,200,140,.55);
  font-size: 9px; line-height: 1.05; padding: 2px; overflow: hidden; }
#bw-auras .aura.debuff { border-color: rgba(232,120,110,.65); }
#bw-auras .aura .t { position: absolute; right: 1px; bottom: 0; font-size: 9px; font-weight: 700;
  font-variant-numeric: tabular-nums; }

#bw-tc { position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: 60vw; }
#bw-place { font-size: 14px; letter-spacing: .06em; opacity: .92; text-align: center; }
#bw-target { display: none; width: 220px; }
#bw-target.on { display: block; }
#bw-target .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
#bw-target .nm { font-size: 13px; font-weight: 600; }
#bw-target .tr { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; opacity: .85; }
#bw-target .bar { position: relative; margin-top: 4px; height: 12px; border-radius: 3px; overflow: hidden;
  background: rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.16); }
#bw-target .bar .fill { position: absolute; inset: 0 auto 0 0; width: 100%; background: #e04b3a; }
#bw-target .bar .n { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }

#bw-dev {
  position: absolute; top: 12px; right: 12px; display: none;
  font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #ffd479;
  border-color: rgba(255,212,121,.45);
}
#bw-dev.on { display: block; }
#bw-hint {
  position: absolute; left: 50%; bottom: 148px; transform: translateX(-50%);
  font-size: 13px; opacity: 0; transition: opacity .12s ease; white-space: nowrap;
}
#bw-hint.on { opacity: 1; }
#bw-tools {
  position: absolute; left: 50%; bottom: 88px; transform: translateX(-50%);
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

#bw-bar {
  position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%);
  display: flex; gap: 5px; pointer-events: auto;
}
#bw-bar .cell {
  position: relative; width: 46px; height: 46px; border-radius: 7px; overflow: hidden;
  background: rgba(18,20,24,.6); border: 1px solid rgba(255,255,255,.14); cursor: pointer;
}
#bw-bar .cell.empty { opacity: .42; cursor: default; }
#bw-bar .cell.casting { border-color: #cbb6ff; box-shadow: 0 0 0 1px #cbb6ff inset; }
#bw-bar .cell .k { position: absolute; top: 1px; left: 3px; font-size: 9px; opacity: .62; }
#bw-bar .cell .n { position: absolute; left: 3px; right: 3px; top: 13px; font-size: 9px; line-height: 1.06;
  text-align: center; word-break: break-word; }
#bw-bar .cell .c { position: absolute; right: 3px; bottom: 1px; font-size: 10px; font-weight: 700;
  font-variant-numeric: tabular-nums; color: #cfe3ff; }
#bw-bar .cell .c.poor { color: #ff6a58; }
#bw-bar .cell .sweep { position: absolute; left: 0; right: 0; bottom: 0; height: 0%;
  background: rgba(6,8,12,.66); pointer-events: none; }
#bw-bar .cell .cd { position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; color: #fff; }
#bw-bar .cell .cd.on { display: flex; }

#bw-bl { position: absolute; left: 12px; bottom: 16px; width: min(380px, 42vw);
  display: flex; flex-direction: column; gap: 6px; }
#bw-toasts { display: flex; flex-direction: column-reverse; gap: 6px; }
#bw-toasts .t {
  padding: 7px 10px; border-radius: 8px; font-size: 13px; line-height: 1.35;
  background: rgba(18,20,24,.62); border: 1px solid rgba(255,255,255,.14);
  animation: bw-in .16s ease-out; transition: opacity .35s ease, transform .35s ease;
}
#bw-toasts .t.good { border-color: rgba(140,220,140,.5); }
#bw-toasts .t.bad  { border-color: rgba(232,140,120,.55); }
#bw-toasts .t.out { opacity: 0; transform: translateY(6px); }
#bw-log { display: flex; flex-direction: column; gap: 1px; font-size: 12px; line-height: 1.35; }
#bw-log .l { opacity: .92; }
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

  const mk = (tag, id, cls) => {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    return e;
  };
  const add = (parent, child) => { parent.appendChild(child); return child; };

  const el = mk('div', 'bw-hud');

  // top left: purse, pools, auras
  const topLeft = add(el, mk('div', 'bw-tl'));
  const purse = add(topLeft, mk('div', 'bw-purse', 'panel'));
  const poolBox = add(topLeft, mk('div', 'bw-pools'));
  const auraBox = add(topLeft, mk('div', 'bw-auras'));

  // top centre: place, then the target frame under it
  const topCentre = add(el, mk('div', 'bw-tc'));
  const place = add(topCentre, mk('div', 'bw-place', 'panel'));
  const targetBox = add(topCentre, mk('div', 'bw-target', 'panel'));
  const tRow = add(targetBox, mk('div', null, 'row'));
  const tName = add(tRow, mk('div', null, 'nm'));
  const tTier = add(tRow, mk('div', null, 'tr'));
  const tBar = add(targetBox, mk('div', null, 'bar'));
  const tFill = add(tBar, mk('div', null, 'fill'));
  const tNum = add(tBar, mk('div', null, 'n'));

  const devBadge = add(el, mk('div', 'bw-dev', 'panel'));
  devBadge.textContent = 'fly mode';
  const hint = add(el, mk('div', 'bw-hint'));
  const toolRow = add(el, mk('div', 'bw-tools'));
  const barRow = add(el, mk('div', 'bw-bar'));

  const bottomLeft = add(el, mk('div', 'bw-bl'));
  const toasts = add(bottomLeft, mk('div', 'bw-toasts'));
  const logBox = add(bottomLeft, mk('div', 'bw-log'));

  (root || document.body).appendChild(el);

  // one slot per tool, built once. The row is flex, so the count is whatever
  // TOOLS says and nothing lands on top of anything else.
  let onToolPick = null;
  const slots = TOOLS.map((t) => {
    const s = mk('div', null, 'slot locked');
    s.dataset.tool = t.id;
    const k = add(s, mk('span', null, 'k')); k.textContent = t.key;
    const n = add(s, mk('span', null, 'n')); n.textContent = t.label;
    s.addEventListener('click', () => {
      if (s.classList.contains('locked')) return;
      if (onToolPick) onToolPick(t.id);
    });
    toolRow.appendChild(s);
    return s;
  });

  // one cell per bar key, built once, for the same reason.
  let onBarPick = null;
  const cells = BAR_KEYS.map((key, i) => {
    const c = mk('div', null, 'cell empty');
    c.dataset.slot = String(i);
    const k = add(c, mk('span', null, 'k')); k.textContent = KEY_LABELS[key] || key;
    const n = add(c, mk('span', null, 'n'));
    const cost = add(c, mk('span', null, 'c'));
    const sw = add(c, mk('div', null, 'sweep'));
    const cd = add(c, mk('div', null, 'cd'));
    c.addEventListener('click', () => {
      if (c.classList.contains('empty')) return;
      if (onBarPick) onBarPick(i);
    });
    barRow.appendChild(c);
    return { el: c, name: n, cost, sweep: sw, cd, key, last: null };
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

  // --- pools -----------------------------------------------------------------
  const poolRows = new Map();
  function poolRow(id, colour) {
    let row = poolRows.get(id);
    if (row) return row;
    const box = add(poolBox, mk('div', null, 'pool'));
    const fill = add(box, mk('div', null, 'fill'));
    fill.style.background = colour;
    const n = add(box, mk('div', null, 'n'));
    row = { box, fill, n, last: '' };
    poolRows.set(id, row);
    return row;
  }

  function drawPools(actor) {
    const view = poolView(actor || {});
    poolBox.classList.toggle('on', view.length > 0);
    for (const p of view) {
      const row = poolRow(p.id, p.colour);
      row.box.style.display = '';
      const pct = `${(p.pct * 100).toFixed(1)}%`;
      if (row.fill.style.width !== pct) row.fill.style.width = pct;
      const text = `${Math.round(p.value)} / ${Math.round(p.max)}`;
      if (row.last !== text) { row.n.textContent = text; row.last = text; }
    }
    for (const [id, row] of poolRows) {
      if (!view.some((p) => p.id === id)) row.box.style.display = 'none';
    }
  }

  // --- buffs and debuffs -----------------------------------------------------
  const auras = [];
  function drawAuras(list) {
    const want = Array.isArray(list) ? list : [];
    while (auras.length < want.length) {
      const a = add(auraBox, mk('div', null, 'aura'));
      const nm = add(a, mk('span', null, 'nm'));
      const t = add(a, mk('span', null, 't'));
      auras.push({ el: a, nm, t, last: '' });
    }
    for (let i = 0; i < auras.length; i++) {
      const slot = auras[i];
      const b = want[i];
      if (!b) { slot.el.style.display = 'none'; continue; }
      slot.el.style.display = '';
      slot.el.className = 'aura' + (b.kind === 'debuff' ? ' debuff' : '');
      const short = String(b.name || '').split(' ').map((w) => w.slice(0, 1)).join('').slice(0, 3).toUpperCase();
      if (slot.last !== short) { slot.nm.textContent = short; slot.last = short; }
      slot.el.title = `${b.name}${Number.isFinite(b.remaining) ? `, ${Math.ceil(b.remaining)} s left` : ''}`;
      slot.t.textContent = timerLabel(b.remaining);
    }
  }

  // --- target frame ----------------------------------------------------------
  function drawTarget(t) {
    if (!t) { targetBox.classList.remove('on'); return; }
    targetBox.classList.add('on');
    tName.textContent = t.name || 'something';
    tName.style.color = t.colour || '#f2ede2';
    tTier.textContent = t.word || '';
    tTier.style.color = t.colour || '#f2ede2';
    tFill.style.width = `${(clamp(num(t.fraction), 0, 1) * 100).toFixed(1)}%`;
    tNum.textContent = `${Math.round(num(t.health))} / ${Math.round(num(t.maxHealth))}`;
  }

  // --- the ability bar -------------------------------------------------------
  function drawBar(bar) {
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const e = (bar && bar[i]) || null;
      const ability = e?.ability || null;
      if (!ability) {
        if (c.last !== null) {
          c.el.className = 'cell empty';
          c.name.textContent = ''; c.cost.textContent = '';
          c.sweep.style.height = '0%'; c.cd.className = 'cd'; c.cd.textContent = '';
          c.last = null;
        }
        continue;
      }
      if (c.last !== ability.id) {
        c.name.textContent = ability.name;
        c.cost.textContent = costLabel(ability);
        c.el.title = `${ability.name}. ${ability.description || ''}`;
        c.last = ability.id;
      }
      const left = num(e.cooldownLeft);
      const frac = sweep(left, ability.cooldown);
      c.sweep.style.height = `${(frac * 100).toFixed(0)}%`;
      const label = left > 0 ? timerLabel(left) : '';
      if (c.cd.textContent !== label) c.cd.textContent = label;
      c.cd.className = 'cd' + (left > 0 ? ' on' : '');
      c.cost.className = 'c' + (e.affordable === false ? ' poor' : '');
      c.el.className = 'cell' + (e.casting ? ' casting' : '');
    }
  }

  // --- the log ---------------------------------------------------------------
  const lines = [];
  function drawLog() {
    while (logBox.children.length > lines.length) logBox.lastChild.remove();
    for (let i = 0; i < lines.length; i++) {
      let row = logBox.children[i];
      if (!row) { row = mk('div', null, 'l'); logBox.appendChild(row); }
      if (row.textContent !== lines[i].text) row.textContent = lines[i].text;
      row.style.color = LOG_KINDS[lines[i].kind] || '#f2ede2';
    }
  }

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

    /**
     * The system log, bottom left, the last LOG_LINES lines. Plain text, not
     * html: this is where combat and the abilities runtime talk, and neither
     * should be able to put markup on the screen by naming a monster.
     */
    log(text, kind) {
      const line = { text: String(text ?? ''), kind: kind || null };
      if (!line.text) return null;
      lines.push(line);
      while (lines.length > LOG_LINES) lines.shift();
      drawLog();
      return line;
    },
    get lines() { return lines.map((l) => l.text); },
    clearLog() { lines.length = 0; drawLog(); },

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
    /** A click on a bar cell, for the mouse. The keys go through input.js. */
    onBar(fn) { onBarPick = fn; },

    setPlace(text) { place.textContent = text || ''; place.style.display = text ? '' : 'none'; },
    setDev(on) { devBadge.classList.toggle('on', !!on); },
    setHint(text) { hint.textContent = text || ''; hint.classList.toggle('on', !!text); },

    /**
     * The per frame draw. `view` is built by main.js:
     *   { actor, target, bar: [{ ability, cooldownLeft, affordable, casting }],
     *     buffs: [{ name, kind, remaining }] }
     * Every part is optional, and a missing part hides its widget rather than
     * drawing an empty one.
     */
    update(dt, view) {
      const v = view || {};
      drawPools(v.actor || null);
      drawAuras(v.buffs);
      drawTarget(v.target || null);
      drawBar(v.bar);
    },

    dispose() { el.remove(); },
  };
}
