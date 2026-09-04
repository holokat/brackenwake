// Settings: every knob 06-ECONOMY-UI.md asks for, and nothing that does not do
// something.
//
// Each control writes `character.settings` and then calls the one hook main.js
// implements, `ctx.applySettings(settings)`. Nothing here reaches into the
// renderer, the world stream or the input layer: this file decides what the
// player wants and main.js is the only place that knows how to give it to them.
// Audio is the exception, because `audio.js` already owns its own persistence
// and its own mute state, so volumes go straight to it as well as into the
// document, and the document wins on load.
//
// SETTINGS is the whole list, with the meaning of every key. `applySettings`
// in main.js has to read all of them; `docs/mmo/wiring/W5.md` repeats the table
// so Fable can wire it without reading this file.

/** The twelve bar slots, whose keys can be rebound. */
export const BAR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

/**
 * Every setting: its default, its shape, and what main.js has to do about it.
 * `apply` is prose for the wiring note, not code.
 */
export const SETTINGS = [
  { key: 'music', label: 'Music volume', kind: 'range', min: 0, max: 1, step: 0.05, def: 0.5,
    apply: 'audio.setMusicVolume(v)' },
  { key: 'sfx', label: 'Sound volume', kind: 'range', min: 0, max: 1, step: 0.05, def: 0.7,
    apply: 'audio.setSfxVolume(v)' },
  { key: 'musicOn', label: 'Music', kind: 'toggle', def: true,
    apply: 'audio.toggleMusic() until audio.musicOn matches' },
  { key: 'sfxOn', label: 'Sound', kind: 'toggle', def: true,
    apply: 'audio.toggleSfx() until it matches' },
  { key: 'shadows', label: 'Shadows', kind: 'toggle', def: true,
    apply: 'renderer.shadowMap.enabled = v, and sun.castShadow = v' },
  { key: 'ring', label: 'Draw distance', kind: 'choice', options: [6, 9, 12], def: 9,
    apply: 'world stream ring radius in chunks, and sc.setFog to just inside it' },
  { key: 'pixelRatio', label: 'Pixel ratio', kind: 'choice', options: [1, 'device'], def: 'device',
    apply: 'renderer.setPixelRatio(v === "device" ? devicePixelRatio : 1)' },
  { key: 'grass', label: 'Grass density', kind: 'range', min: 0, max: 1, step: 0.1, def: 1,
    apply: 'flora density multiplier; 0 means no grass at all' },
  { key: 'textScale', label: 'Floating text size', kind: 'range', min: 0.6, max: 2, step: 0.1, def: 1,
    apply: 'floaters textScale(): the multiplier on every number that flies off a thing' },
  { key: 'invertDrag', label: 'Invert drag', kind: 'toggle', def: false,
    apply: 'camera drag dy sign' },
  { key: 'sensitivity', label: 'Mouse sensitivity', kind: 'range', min: 0.25, max: 3, step: 0.05, def: 1,
    apply: 'camera drag multiplier on dx and dy' },
  { key: 'bar', label: 'Ability bar keys', kind: 'keys', def: BAR_KEYS,
    apply: 'abilities_runtime reads settings.bar[i] for slot i instead of the default key' },
  { key: 'dev', label: 'Dev mode', kind: 'toggle', def: false,
    apply: 'dev.toggle() until dev.on matches' },
];

export const SETTING = Object.fromEntries(SETTINGS.map((s) => [s.key, s]));

/** A fresh settings record. */
export function defaultSettings() {
  const out = {};
  for (const s of SETTINGS) out[s.key] = Array.isArray(s.def) ? [...s.def] : s.def;
  return out;
}

/**
 * A value forced into its own shape. A saved setting from an older build, or a
 * hand-edited save, can hold anything; this is what stops it reaching the
 * renderer.
 */
export function coerce(key, v) {
  const s = SETTING[key];
  if (!s) return undefined;
  if (s.kind === 'toggle') return !!v;
  if (s.kind === 'range') {
    const n = Number(v);
    if (!Number.isFinite(n)) return s.def;
    return Math.min(s.max, Math.max(s.min, Math.round(n / s.step) * s.step));
  }
  if (s.kind === 'choice') return s.options.includes(v) ? v : s.def;
  if (s.kind === 'keys') {
    const list = Array.isArray(v) ? v : [];
    return BAR_KEYS.map((d, i) => (typeof list[i] === 'string' && list[i].length ? list[i].toLowerCase() : d));
  }
  return s.def;
}

/** Fill in what a saved record is missing and throw out what it should not have. */
export function normalise(saved) {
  const out = defaultSettings();
  for (const s of SETTINGS) {
    if (saved && Object.prototype.hasOwnProperty.call(saved, s.key)) out[s.key] = coerce(s.key, saved[s.key]);
  }
  return out;
}

/** A key bound twice would swallow a slot, so a rebind says which one it took. */
export function rebind(settings, slot, key) {
  const k = String(key || '').toLowerCase();
  if (!k) return { ok: false, why: 'That is not a key.' };
  if (slot < 0 || slot >= BAR_KEYS.length) return { ok: false, why: `There are only ${BAR_KEYS.length} slots.` };
  const bar = coerce('bar', settings.bar);
  const clash = bar.findIndex((b, i) => b === k && i !== slot);
  const was = bar[slot];
  bar[slot] = k;
  if (clash >= 0) bar[clash] = was;
  settings.bar = bar;
  return {
    ok: true, bar,
    why: clash >= 0
      ? `Slot ${slot + 1} is "${k}" now, and slot ${clash + 1} took "${was}" so nothing is bound twice.`
      : `Slot ${slot + 1} is "${k}" now.`,
  };
}

const say = (ctx, text, kind) => { ctx?.hud?.toast?.(text, kind); ctx?.hud?.log?.(text, kind); return text; };

/**
 * Write one setting and hand the whole record to main.js. Every call says what
 * changed, because a slider that moves and does nothing visible is the same as
 * a broken slider.
 */
export function set(ctx, key, value) {
  const s = SETTING[key];
  if (!s) return { ok: false, text: say(ctx, `There is no setting called ${key}.`, 'bad') };
  const c = ctx?.character;
  if (c && !c.settings) c.settings = defaultSettings();
  const settings = c ? c.settings : defaultSettings();
  const v = coerce(key, value);
  const before = settings[key];
  settings[key] = v;

  // audio owns its own volumes and its own mutes, so it hears about them twice
  if (key === 'music') ctx?.audio?.setMusicVolume?.(v);
  if (key === 'sfx') ctx?.audio?.setSfxVolume?.(v);
  if (key === 'musicOn' && ctx?.audio?.toggleMusic && ctx.audio.musicOn !== v) ctx.audio.toggleMusic();
  if (key === 'sfxOn' && ctx?.audio?.toggleSfx && ctx.audio.sfxOn !== v) ctx.audio.toggleSfx();

  ctx?.applySettings?.(settings);
  const word = s.kind === 'toggle' ? (v ? 'on' : 'off') : String(v);
  return { ok: true, value: v, before, settings, text: say(ctx, `${s.label}: ${word}.`) };
}

/** Every claim this table makes, checked at load. */
export function auditSettings() {
  const bad = [];
  const seen = new Set();
  for (const s of SETTINGS) {
    if (seen.has(s.key)) bad.push(`two settings share the key ${s.key}`);
    seen.add(s.key);
    if (!s.label) bad.push(`${s.key}: no label`);
    if (!s.apply) bad.push(`${s.key}: nothing is said about what applying it does, so nothing would`);
    if (s.label.includes('—') || s.apply.includes('—')) bad.push(`${s.key}: em dash`);
    if (s.kind === 'range' && !(s.min < s.max && s.step > 0)) bad.push(`${s.key}: a range from ${s.min} to ${s.max} by ${s.step}`);
    if (s.kind === 'choice' && !s.options.includes(s.def)) bad.push(`${s.key}: the default is not one of the choices`);
    if (coerce(s.key, s.def) === undefined) bad.push(`${s.key}: its own default does not survive coercion`);
  }
  // The five 06 asks for by name.
  for (const k of ['music', 'sfx', 'shadows', 'ring', 'pixelRatio', 'grass', 'textScale', 'invertDrag', 'sensitivity', 'bar', 'dev']) {
    if (!SETTING[k]) bad.push(`06 asks for ${k} and there is no such setting`);
  }
  if (BAR_KEYS.length !== 12) bad.push(`the bar has ${BAR_KEYS.length} slots, and 06 says twelve`);
  if (new Set(BAR_KEYS).size !== BAR_KEYS.length) bad.push('two bar slots share a default key');
  if (bad.length) throw new Error(`auditSettings: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { settings: SETTINGS.length, barSlots: BAR_KEYS.length };
}

auditSettings();

// ---------------------------------------------------------------------------
// The panel.

const CSS = `
.bw-win-settings .bw-s{display:flex;align-items:center;gap:10px;padding:6px 2px;border-top:1px solid #2a332a}
.bw-win-settings .bw-s .n{flex:1 1 auto}
.bw-win-settings .bw-s .n small{display:block;color:#8b9686;font-size:11.5px}
.bw-win-settings .bw-s .v{color:#cbd8c2;font-variant-numeric:tabular-nums;min-width:56px;text-align:right}
.bw-win-settings input[type=range]{width:150px}
.bw-win-settings button{font:inherit;font-size:12px;padding:4px 9px;border-radius:6px;
  border:1px solid #4f6349;background:#2c3a2b;color:#e8f0e2;cursor:pointer}
.bw-win-settings button.on{background:#3a5030;border-color:#7c9c6c}
.bw-win-settings button.danger{border-color:#7a3b32;background:#3a2320;color:#f0d5cf}
.bw-win-settings h3{margin:14px 0 4px;font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#8fa387}
.bw-win-settings .bw-bar{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0}
.bw-win-settings .bw-bar button{min-width:38px}
.bw-win-settings .bw-bar button.wait{border-color:#e3c26a;color:#ffe9b0}
`;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const GROUPS = [
  ['Sound', ['musicOn', 'music', 'sfxOn', 'sfx']],
  ['Graphics', ['shadows', 'ring', 'pixelRatio', 'grass', 'textScale']],
  ['Controls', ['invertDrag', 'sensitivity', 'bar']],
  ['The rest', ['dev']],
];

export const panel = {
  id: 'settings',
  title: 'Settings',
  key: 'escape',
  // The one panel that has to take the bar keys off the world: pressing 3 while
  // you are rebinding slot 3, or reading the graphics list, should not throw a
  // Fireball. windows.js asks `consumes(key)` and only a panel that declares a
  // key gets it.
  keys: [...BAR_KEYS],

  build(root, ctx) {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('bw-settings-css')) {
      const st = document.createElement('style');
      st.id = 'bw-settings-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    root.classList.add('bw-win-settings');
    root.textContent = '';
    this._root = root;
    this._ctx = ctx;
    this._waiting = -1;
    this._body = el('div');
    root.appendChild(this._body);
    this._onKey = (e) => {
      if (this._waiting < 0) return;
      e.preventDefault();
      e.stopPropagation();
      const s = this.settings();
      const res = rebind(s, this._waiting, e.key);
      this._waiting = -1;
      say(this._ctx, res.why, res.ok ? undefined : 'bad');
      if (res.ok) this._ctx?.applySettings?.(s);
      this.render();
    };
  },

  settings() {
    const c = this._ctx?.character;
    if (c && !c.settings) c.settings = defaultSettings();
    else if (c) c.settings = normalise(c.settings);
    return c ? c.settings : defaultSettings();
  },

  open(ctx) {
    this._ctx = ctx || this._ctx;
    this._waiting = -1;
    if (typeof window !== 'undefined') window.addEventListener('keydown', this._onKey, true);
    this.render();
  },

  close() {
    this._waiting = -1;
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this._onKey, true);
  },

  render() {
    if (!this._root || typeof document === 'undefined') return;
    const s = this.settings();
    const ctx = this._ctx;
    this._body.textContent = '';
    const write = (key, v) => { set(ctx, key, v); this.render(); };

    for (const [title, keys] of GROUPS) {
      this._body.appendChild(el('h3', null, title));
      for (const key of keys) {
        const def = SETTING[key];
        const row = el('div', 'bw-s');
        const n = el('span', 'n', def.label);
        n.appendChild(el('small', null, def.apply));
        row.appendChild(n);

        if (def.kind === 'toggle') {
          const b = el('button', s[key] ? 'on' : null, s[key] ? 'on' : 'off');
          b.addEventListener('click', () => write(key, !s[key]));
          row.append(el('span', 'v', ''), b);
        } else if (def.kind === 'range') {
          const inp = el('input');
          inp.type = 'range'; inp.min = String(def.min); inp.max = String(def.max);
          inp.step = String(def.step); inp.value = String(s[key]);
          inp.addEventListener('change', () => write(key, Number(inp.value)));
          row.append(el('span', 'v', Number(s[key]).toFixed(2)), inp);
        } else if (def.kind === 'choice') {
          row.appendChild(el('span', 'v', String(s[key])));
          for (const opt of def.options) {
            const b = el('button', s[key] === opt ? 'on' : null, String(opt));
            b.addEventListener('click', () => write(key, opt));
            row.appendChild(b);
          }
        } else if (def.kind === 'keys') {
          row.appendChild(el('span', 'v', ''));
          const bar = el('div', 'bw-bar');
          coerce('bar', s.bar).forEach((k, i) => {
            const b = el('button', this._waiting === i ? 'wait' : null, this._waiting === i ? 'press' : k);
            b.addEventListener('click', () => { this._waiting = i; this.render(); });
            bar.appendChild(b);
          });
          row.appendChild(bar);
        }
        this._body.appendChild(row);
      }
    }

    this._body.appendChild(el('h3', null, 'Start again'));
    const row = el('div', 'bw-s');
    const n = el('span', 'n', 'New character');
    n.appendChild(el('small', null, 'this one is gone, with everything they carried'));
    row.appendChild(n);
    row.appendChild(el('span', 'v', ''));
    const b = el('button', 'danger', this._armed ? 'yes, wipe them' : 'new character');
    b.addEventListener('click', () => {
      if (!this._armed) {
        this._armed = true;
        say(ctx, 'Press it again to make a new character. This one and everything they carry goes.', 'bad');
        this.render();
        return;
      }
      this._armed = false;
      if (typeof ctx?.newCharacter === 'function') {
        say(ctx, 'Starting again.');
        ctx.newCharacter();
      } else {
        say(ctx, 'Nothing is wired to start a new character yet, so nothing was wiped.', 'bad');
      }
      this.render();
    });
    row.appendChild(b);
    this._body.appendChild(row);
  },
};

export default panel;
