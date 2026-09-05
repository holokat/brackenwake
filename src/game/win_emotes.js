// The emote wheel. Key X.
//
// Eight segments round a hub, each with a drawn figure and the word under it.
// It opens centred on the screen because it is a thing you aim at rather than
// a page you read, it closes the instant you pick, and Escape closes it like
// every other window.
//
// WHY X. `RESERVED_KEYS` in windows.js keeps W A S D Q E space shift control
// and Tab for the world. The panels already registered take B C K M N P V, F2
// and Escape, and the two bars take 1 to 0, minus, equals and F5 to F12. X is
// free, and win_emotes.test.mjs proves it by registering the real panels
// alongside this one and reading the key the manager actually gave it back.
//
// THE PICK SAYS NOTHING ITSELF. `ctx.emotes.start(id)` writes the line, so
// there is exactly one place in the game that says "you sit down on the grass"
// whether the emote came from the wheel, from a slash command or from the
// console.

import { theme } from './ui_theme.js';
import { EMOTES } from './emotes.js';

/** The key the wheel answers to. */
export const EMOTE_KEY = 'x';

/** The wheel's geometry, in pixels. The test measures against these. */
export const WHEEL = Object.freeze({ box: 292, radius: 104, cell: 76, glyph: 30 });

/**
 * A stick figure per emote. Stroked rather than filled, like ui_theme's ICONS,
 * so a segment reads at 30 px against dark stone.
 */
export const EMOTE_GLYPHS = Object.freeze({
  wave: '<circle cx="11" cy="4.8" r="2.6"/><path d="M11 7.4 V14 M11 14 L8 21 M11 14 L14 21 M11 9.6 L7.6 13.2 M11 9.6 L15.6 6.6 M15.6 6.6 L18.2 3.6"/>',
  sit: '<circle cx="8.4" cy="7.6" r="2.6"/><path d="M8.4 10.2 V16.6 M4 16.6 H21 M8.4 16.6 L14.6 12.4 M14.6 12.4 L19.4 16.6 M8.4 12.2 L13.4 14.8"/>',
  bow: '<circle cx="16.6" cy="8.4" r="2.6"/><path d="M14.4 9.8 L9.6 13.6 M9.6 13.6 L8.2 21 M9.6 13.6 L12.4 21 M14.8 11.2 L14 17.4"/>',
  cheer: '<circle cx="12" cy="5" r="2.6"/><path d="M12 7.6 V14.4 M12 14.4 L9 21 M12 14.4 L15 21 M12 9.8 L8.2 6 M8.2 6 L7 2.8 M12 9.8 L15.8 6 M15.8 6 L17 2.8"/>',
  point: '<circle cx="8.6" cy="5" r="2.6"/><path d="M8.6 7.6 V14.4 M8.6 14.4 L6 21 M8.6 14.4 L11.4 21 M8.6 10 L5.6 14 M8.6 10 H20.4 M18.4 8.4 L20.4 10 L18.4 11.6"/>',
  dance: '<circle cx="13.4" cy="4.8" r="2.6"/><path d="M13.4 7.4 L11 13.8 M11 13.8 L6.2 19.2 M11 13.8 L15.4 18 M15.4 18 L18.6 20.6 M12.4 9.8 L17.6 6.6 M17.6 6.6 L19.6 3.6 M12.4 9.8 L7.2 8.2"/>',
  laugh: '<circle cx="10.4" cy="7" r="3.4"/><path d="M8.2 9 a3.4 3.4 0 0 0 4.6 0 M16.6 3.4 l2.6 -1.4 M17.4 7.2 l3 .2 M16.6 11 l2.6 1.6"/>',
  lie: '<circle cx="5.2" cy="13.4" r="2.6"/><path d="M7.8 13.4 H15.6 M15.6 13.4 L20.4 11 M15.6 13.4 L20.4 15.8 M9.4 12.4 L12.4 9.4 M2.6 18.6 H21.4"/>',
});

/**
 * Where each segment sits, in pixels from the middle of the wheel. Clockwise
 * from the top, which is the order EMOTES is written in.
 */
export function wheelSegments(list = EMOTES, r = WHEEL.radius) {
  const n = list.length;
  return list.map((e, i) => {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return {
      id: e.id,
      name: e.name,
      glyph: e.glyph,
      index: i,
      angle,
      x: Math.round(Math.cos(angle) * r * 100) / 100,
      y: Math.round(Math.sin(angle) * r * 100) / 100,
    };
  });
}

/** One figure, as an inline svg string. */
export function emoteGlyph(name, size = WHEEL.glyph, colour = 'currentColor') {
  const body = EMOTE_GLYPHS[name] || EMOTE_GLYPHS.wave;
  return `<svg class="bw-i" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
    stroke="${colour}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/**
 * Take a segment. The emote system says the line; this only closes the wheel,
 * because a menu that stays up over the thing you just asked to look at is a
 * menu nobody wanted.
 */
export function pickEmote(id, ctx) {
  const r = ctx && ctx.emotes && typeof ctx.emotes.start === 'function' ? ctx.emotes.start(id) : null;
  if (ctx && ctx.windows && typeof ctx.windows.close === 'function') ctx.windows.close('emotes');
  return r;
}

const CSS = `
.bw-emotes { display: flex; justify-content: center; }
.bw-emotes .bw-wheel {
  position: relative; width: ${WHEEL.box}px; height: ${WHEEL.box}px; margin: 6px 0 2px;
}
.bw-emotes .bw-hub {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 96px; height: 96px; border-radius: 50%; pointer-events: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  border: 1px solid ${theme.goldDim}66;
  background: radial-gradient(circle, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 72%);
  font-family: ${theme.fonts.display}; font-size: 9px; letter-spacing: .2em;
  text-transform: uppercase; color: ${theme.goldDim}; text-align: center; line-height: 1.5;
}
.bw-emotes .bw-seg {
  position: absolute; width: ${WHEEL.cell}px; height: ${WHEEL.cell}px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  cursor: pointer; padding: 0; color: ${theme.parchmentDim};
  border: 1px solid ${theme.goldDim}77; border-radius: 50%;
  background: radial-gradient(circle at 50% 34%, rgba(255,255,255,.07), rgba(0,0,0,.55));
}
.bw-emotes .bw-seg:hover { color: ${theme.goldBright}; border-color: ${theme.gold}; }
.bw-emotes .bw-seg .bw-seg-name {
  font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase;
}
.bw-emotes .bw-seg .bw-i { display: block; }
`;

function css() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('bw-emotes-css')) return;
  const s = document.createElement('style');
  s.id = 'bw-emotes-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export const panel = {
  id: 'emotes',
  title: 'Emotes',
  key: EMOTE_KEY,

  build(root, ctx) {
    if (typeof document === 'undefined') return;
    css();
    root.className = 'bw-emotes';
    root.textContent = '';

    const wheel = document.createElement('div');
    wheel.className = 'bw-wheel';

    const hub = document.createElement('div');
    hub.className = 'bw-hub';
    const hubKey = document.createElement('div');
    hubKey.textContent = 'X';
    const hubWord = document.createElement('div');
    hubWord.textContent = 'pick one';
    hub.appendChild(hubKey);
    hub.appendChild(hubWord);
    wheel.appendChild(hub);

    const half = WHEEL.box / 2, cell = WHEEL.cell / 2;
    this._segs = [];
    for (const seg of wheelSegments()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bw-seg';
      b.dataset.emote = seg.id;
      b.title = seg.name;
      b.style.left = `${Math.round(half + seg.x - cell)}px`;
      b.style.top = `${Math.round(half + seg.y - cell)}px`;
      const art = document.createElement('span');
      art.innerHTML = emoteGlyph(seg.glyph);
      const word = document.createElement('span');
      word.className = 'bw-seg-name';
      word.textContent = seg.name;
      b.appendChild(art);
      b.appendChild(word);
      b.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        pickEmote(seg.id, ctx);
      });
      wheel.appendChild(b);
      this._segs.push(b);
    }
    root.appendChild(wheel);
    this._wheel = wheel;
  },

  /** A wheel belongs under the cursor's thumb, not cascaded into a corner. */
  open(ctx) {
    if (typeof document === 'undefined') return;
    const frame = ctx && ctx.windows && typeof ctx.windows.frameOf === 'function' ? ctx.windows.frameOf('emotes') : null;
    if (!frame || !frame.style) return;
    frame.style.left = '50%';
    frame.style.top = '50%';
    frame.style.transform = 'translate(-50%, -50%)';
  },
};

export default panel;
