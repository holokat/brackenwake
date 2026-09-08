// The roster: who you have, and the road back to any of them.
//
// This is the first screen a returning player sees, before the creation gate
// and before the game loop, over the world that has already been raised. It is
// the only place a character can be deleted, because it is the only place the
// player can see what they would be deleting.
//
// It owns no save logic. `state.js` holds the slots; this file draws them and
// hands one back. Like `creation.js` it takes itself off the screen BEFORE it
// calls back, so whatever runs next finds a clean HUD and a scene with nothing
// of ours left in it.
//
//   createRoster(hudRoot, { state, onPlay(slotId), onNew(), sc, storage, portraits })
//     -> { el, cards, destroy, select, play, remove, key, refresh }
//
// The keyboard is the same handler the window is given, exposed on the return
// so a test drives the real thing rather than a copy of it.
//
// It is a LIST, one full width row per character, because a grid of cards made
// four characters look like four products and a list looks like a company of
// people waiting. Each row opens with the class portrait the user supplied.

import { clearRosterAsk } from './state.js';
import { OPENINGS_BY_ID } from '../mmo/openings.js';
import {
  injectTheme, theme, ICONS, ROSTER_FRAME, ROSTER_PANEL_ART, classPortraitUrl,
  rosterBgUrl, rosterPanelsUrl, installRosterFrameBox,
} from './ui_theme.js';
import { binIcon } from './icon_art.js';

/**
 * The three marks a card wears. `icon()` falls back to a cross when it does
 * not know a name, which would put three identical crosses on every card and
 * say nothing, so the names are checked here at load instead.
 */
export const CARD_ICONS = { gold: 'coin', place: 'boot', played: 'book' };
export function auditRosterIcons() {
  for (const [what, name] of Object.entries(CARD_ICONS)) {
    if (!ICONS[name]) throw new Error(`roster: the ${what} mark asks for an icon called "${name}", which ui_theme does not have`);
  }
  return Object.keys(CARD_ICONS).length;
}
auditRosterIcons();

const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const hs = (tag, cls, svgText) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  n.innerHTML = svgText;
  return n;
};

const MINUTE = 60000, HOUR = 3600000, DAY = 86400000;

/**
 * How long ago, in words, and never a number that was not counted. Anything
 * older than a fortnight is given as a date, because "nineteen days ago" is
 * not how anyone remembers a character.
 */
export function agoWords(then, now = Date.now()) {
  if (!Number.isFinite(then) || then <= 0) return 'not yet played';
  const d = now - then;
  if (d < 0) return 'just now';
  if (d < 2 * MINUTE) return 'just now';
  if (d < HOUR) return `${Math.floor(d / MINUTE)} minutes ago`;
  if (d < 2 * HOUR) return 'an hour ago';
  if (d < DAY) return `${Math.floor(d / HOUR)} hours ago`;
  if (d < 2 * DAY) return 'yesterday';
  if (d < 14 * DAY) return `${Math.floor(d / DAY)} days ago`;
  try { return new Date(then).toLocaleDateString(); } catch { return `${Math.floor(d / DAY)} days ago`; }
}

/**
 * Everything one card says, worked out from the roster row alone. Pure, so the
 * wording can be measured without a document.
 */
export function cardOf(row, now = Date.now()) {
  const s = row?.summary || null;
  const name = (s?.name || row?.name || '').trim();
  const needsCreation = !!(row?.needsCreation || s?.needsCreation);
  if (!name || needsCreation) return null;
  const openingId = s?.opening || row?.opening || 'ranger';
  const opening = OPENINGS_BY_ID[openingId] || OPENINGS_BY_ID.ranger;
  const skills = Array.isArray(s?.skills) ? s.skills : [];
  return {
    id: row?.id,
    name,
    unnamed: false,
    needsCreation: false,
    // the live table's word first: a save made when the Mage was still called that
    // carries 'Mage' in its snapshot, and the roster says Wizard (2026-09-08)
    opening: opening?.name || s?.openingName || '',
    blurb: opening?.blurb || '',
    skills,
    skillsLine: skills.length ? '' : 'Nothing learned yet.',
    gold: Number.isFinite(s?.gold) ? s.gold : null,
    place: s?.place || null,
    placeLine: s?.place
      ? s.place
      : (s?.pos ? `open country, at ${s.pos.x}, ${s.pos.z}` : 'somewhere the last save did not record'),
    played: agoWords(row?.playedAt, now),
    known: !!s,
    portrait: classPortraitUrl(openingId),
  };
}

export function createRoster(root, deps = {}) {
  const { state, onPlay, onNew } = deps;
  const rows = () => (state && typeof state.roster === 'function' ? state.roster() : []);

  if (typeof document === 'undefined') {
    return { el: null, cards: [], rows: rows(), destroy() {}, select() {}, play() {}, remove() {}, key() {}, refresh() {} };
  }

  // The note the settings window left is taken down the moment the screen it
  // asked for is on the glass, so a second reload does not land here again.
  clearRosterAsk();

  injectTheme(document);
  if (!document.getElementById('bw-roster-css')) {
    const st = document.createElement('style');
    st.id = 'bw-roster-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const el = h('div');
  el.id = 'bw-roster';
  el.className = 'bw-ui';
  el.style.backgroundImage = `url("${rosterBgUrl()}")`;
  const left = h('section', 'bw-ro-left');
  const right = h('section', 'bw-ro-right');
  el.appendChild(left);
  el.appendChild(right);
  (root || document.body).appendChild(el);
  const unboxFrame = installRosterFrameBox(el);

  const list = h('div', 'bw-ro-cards');
  left.appendChild(list);

  const begin = h('button', 'bw-ro-begin', 'Begin a new character');
  begin.dataset.begin = '1';
  begin.addEventListener('click', (ev) => { ev?.stopPropagation?.(); doNew(); });
  left.appendChild(begin);

  const foot = h('div', 'bw-ro-foot');
  left.appendChild(foot);

  const hero = h('div', 'bw-ro-hero');
  const heroImg = h('img', 'bw-ro-hero-img');
  heroImg.alt = '';
  hero.appendChild(heroImg);
  const heroName = h('div', 'bw-ro-hero-name');
  const heroClass = h('div', 'bw-ro-hero-class');
  const heroPlay = h('button', 'bw-ro-hero-play', 'Play');
  heroPlay.dataset.heroPlay = '1';
  heroPlay.addEventListener('click', (ev) => {
    ev?.stopPropagation?.();
    const row = shownRows[sel] || null;
    doPlay(row?.id);
  });
  hero.appendChild(heroName);
  hero.appendChild(heroClass);
  hero.appendChild(heroPlay);
  right.appendChild(hero);

  /** The cards, in order, with the "new character" card last and always there. */
  let cards = [];
  let shownRows = [];
  let sel = 0;
  let armed = null;          // the slot a second click on Delete would remove
  let done = false;

  function say(text, kind) {
    foot.className = `bw-ro-foot${kind ? ` bw-ro-${kind}` : ''}`;
    foot.textContent = text || '';
  }

  function faceOf(row, c) {
    const port = h('div', 'bw-ro-port');
    const img = h('img', 'bw-ro-face');
    img.src = c.portrait;
    img.alt = c.opening;
    port.appendChild(img);
    return port;
  }

  function build() {
    list.textContent = '';
    cards = [];
    shownRows = [];
    const list_ = rows();
    const now = Date.now();
    for (const row of list_) {
      const c = cardOf(row, now);
      if (!c) continue;
      const card = h('div', 'bw-ro-card');
      card.dataset.slot = c.id;
      card.appendChild(faceOf(row, c));

      const who = h('div', 'bw-ro-who');
      const nm = h('div', 'bw-ro-name', c.name);
      who.appendChild(nm);
      who.appendChild(h('div', 'bw-ro-open', c.opening));
      card.appendChild(who);

      const acts = h('div', 'bw-ro-acts');
      const play = h('button', 'bw-ro-play', 'Play');
      play.dataset.play = c.id;
      play.addEventListener('click', (ev) => { ev?.stopPropagation?.(); doPlay(c.id); });
      acts.appendChild(play);
      const del = hs('button', `bw-ro-del${armed === c.id ? ' bw-ro-armed' : ''}`, binIcon('currentColor', 15));
      del.dataset.del = c.id;
      del.title = armed === c.id ? 'Press again to delete' : 'Delete';
      del.setAttribute?.('aria-label', armed === c.id ? 'Press again to delete' : 'Delete');
      del.addEventListener('click', (ev) => { ev?.stopPropagation?.(); doDelete(c.id); });
      acts.appendChild(del);
      card.appendChild(acts);

      card.addEventListener('click', () => { select(cards.indexOf(card)); });
      list.appendChild(card);
      cards.push(card);
      shownRows.push(row);
    }

    if (sel >= cards.length) sel = cards.length - 1;
    if (sel < 0) sel = 0;
    paint();
  }

  function paint() {
    for (let i = 0; i < cards.length; i++) cards[i].classList.toggle('on', i === sel);
    const row = shownRows[sel] || null;
    const c = row ? cardOf(row) : null;
    hero.classList.toggle('bw-ro-empty', !c);
    heroImg.src = c ? c.portrait : '';
    heroName.textContent = c ? c.name : '';
    heroClass.textContent = c ? c.opening : '';
    heroPlay.hidden = !c;
    heroPlay.disabled = !c;
    if (c) heroPlay.dataset.play = c.id; else delete heroPlay.dataset.play;
  }

  function select(i) {
    if (!cards.length) return;
    const n = Math.max(0, Math.min(cards.length - 1, i));
    if (n === sel) return;
    sel = n;
    // moving off a card that was asking takes the question back with it
    if (armed) { armed = null; build(); return; }
    paint();
  }

  function doPlay(id) {
    if (done || !id) return false;
    destroy();
    if (typeof onPlay === 'function') onPlay(id);
    return true;
  }

  function doNew() {
    if (done) return false;
    destroy();
    if (typeof onNew === 'function') onNew();
    return true;
  }

  /**
   * Twice, like the settings window: the first press asks and says what it is
   * asking, the second does it. The roster tells state it knows the slot may
   * be the open one, because no game is running behind this screen.
   */
  function doDelete(id) {
    if (done || !id) return false;
    if (armed !== id) {
      // The card being asked about is the card in hand, so an arrow key can
      // take the question back and Enter cannot play somebody else by mistake.
      const i = cards.findIndex((c) => c.dataset.slot === id);
      if (i >= 0) sel = i;
      armed = id;
      const who = cardOf(rows().find((r) => r.id === id) || {})?.name || 'That character';
      build();
      say(`${who} goes for good, with everything they carry. Press it again.`, 'bad');
      return false;
    }
    armed = null;
    const who = cardOf(rows().find((r) => r.id === id) || {})?.name || 'That character';
    const gone = state?.deleteSlot?.(id, { evenIfOpen: true }) === true;
    // The document is gone, so the picture of it has to go too. Slot ids are
    // handed back out by state.newSlot, and a kept portrait would put the dead
    // character's face on the next one to take the number.
    build();
    say(gone ? `${who} is gone.` : `${who} could not be removed, so nothing was.`, gone ? '' : 'bad');
    // The last one out leaves nothing to choose between, so the road goes
    // straight on to the making of somebody rather than to an empty page.
    if (gone && !rows().length) return doNew();
    return gone;
  }

  /** The one keydown handler, registered below and returned for a test. */
  function key(ev) {
    const k = ev?.key;
    if (!k || done) return false;
    if (k === 'ArrowRight' || k === 'ArrowDown') { select(sel + 1); return true; }
    if (k === 'ArrowLeft' || k === 'ArrowUp') { select(sel - 1); return true; }
    if (k === 'Enter') {
      const card = cards[sel];
      if (!card) return false;
      ev.preventDefault?.();
      return doPlay(card.dataset.slot);
    }
    // Escape does nothing on purpose: there is nothing behind this screen to
    // go back to, and a key that looks like it closes it would close nothing.
    return false;
  }
  const win = typeof window !== 'undefined' ? window : null;
  win?.addEventListener?.('keydown', key);

  function destroy() {
    if (done) return;
    done = true;
    win?.removeEventListener?.('keydown', key);
    unboxFrame();
    el.remove();
  }

  build();

  return {
    el, key, destroy, select,
    refresh: build,
    play: doPlay,
    remove: doDelete,
    newCharacter: doNew,
    get cards() { return cards; },
    get rows() { return shownRows; },
    get heroPlay() { return heroPlay; },
    get selected() { return sel; },
    get armed() { return armed; },
    get foot() { return foot.textContent; },
    get gone() { return done; },
  };
}

// ---------------------------------------------------------------------- css
// The codex's own language: dark parchment, thin gold rules, Cinzel for a name
// and Cormorant for everything said in a sentence.

const CSS = `
#bw-roster, #bw-roster * { box-sizing: border-box; }
#bw-roster {
  position: fixed; inset: 0; z-index: 92;
  background-size: cover; background-position: center; background-repeat: no-repeat;
  font-family: ${theme.fonts.body}; font-size: 15px; line-height: 1.4;
  color: ${theme.parchment};
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
#bw-roster::before {
  content: ""; position: absolute;
  left: var(--bw-scene-x); top: var(--bw-scene-y);
  width: var(--bw-scene-w); height: var(--bw-scene-h);
  background-image: url("${rosterPanelsUrl()}");
  background-size: 100% 100%; background-position: center; background-repeat: no-repeat;
  pointer-events: none;
}
#bw-roster[hidden] { display: none; }
#bw-roster .bw-ro-left, #bw-roster .bw-ro-right {
  position: absolute;
  color: ${theme.parchment};
}
#bw-roster .bw-ro-left {
  left: calc(var(--bw-scene-x) + ${ROSTER_FRAME.leftPanel.x1} * var(--bw-scene-w));
  top: calc(var(--bw-scene-y) + ${ROSTER_FRAME.leftPanel.y1} * var(--bw-scene-h));
  width: calc((${ROSTER_FRAME.leftPanel.x2} - ${ROSTER_FRAME.leftPanel.x1}) * var(--bw-scene-w));
  height: calc((${ROSTER_FRAME.leftPanel.y2} - ${ROSTER_FRAME.leftPanel.y1}) * var(--bw-scene-h));
  padding: clamp(8px, 1vw, 14px);
  display: flex; flex-direction: column; gap: 10px;
  overflow: hidden;
}
#bw-roster .bw-ro-right {
  left: calc(var(--bw-scene-x) + ${ROSTER_FRAME.rightPanel.x1} * var(--bw-scene-w));
  top: calc(var(--bw-scene-y) + ${ROSTER_FRAME.rightPanel.y1} * var(--bw-scene-h));
  width: calc((${ROSTER_FRAME.rightPanel.x2} - ${ROSTER_FRAME.rightPanel.x1}) * var(--bw-scene-w));
  height: calc((${ROSTER_FRAME.rightPanel.y2} - ${ROSTER_FRAME.rightPanel.y1}) * var(--bw-scene-h));
  display: flex; align-items: stretch; justify-content: center;
  overflow: hidden;
}
#bw-roster .bw-ro-cards {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
  display: flex; flex-direction: column; gap: 8px; padding-right: 4px;
}
#bw-roster .bw-ro-card {
  position: relative; min-height: 72px; padding: 4px 6px; cursor: pointer;
  display: grid; align-items: center; gap: 8px;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  background: rgba(9, 10, 12, .28);
  border: 1px solid rgba(201, 164, 74, .16);
  border-radius: 6px;
  transition-property: background-color, border-color, box-shadow, transform;
  transition-duration: .14s;
  transition-timing-function: ease;
}
#bw-roster .bw-ro-port {
  width: 64px; height: 64px; overflow: hidden; align-self: stretch;
  display: flex; align-items: flex-end; justify-content: center;
}
#bw-roster .bw-ro-port img, #bw-roster .bw-ro-port svg {
  display: block; width: 100%; height: 100%; object-fit: contain; object-position: bottom center;
  filter: drop-shadow(0 2px 2px rgba(0,0,0,.5));
}
#bw-roster .bw-ro-who { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
#bw-roster .bw-ro-card:hover { border-color: ${theme.goldDim}aa; background: rgba(74, 30, 22, .24); }
#bw-roster .bw-ro-card.on {
  border-color: ${theme.gold};
  background: linear-gradient(180deg, rgba(122,42,32,.58), rgba(91,29,22,.5));
  box-shadow: 0 5px 14px rgba(0,0,0,.22), inset 0 0 0 1px rgba(242,220,156,.16);
}
#bw-roster .bw-ro-name {
  font-family: ${theme.fonts.display}; font-size: clamp(16px, 1.18vw, 20px);
  font-weight: 600; letter-spacing: 0; color: ${theme.parchment}; line-height: 1.08;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-wrap: balance;
}
#bw-roster .bw-ro-card.on .bw-ro-name, #bw-roster .bw-ro-card:hover .bw-ro-name { color: ${theme.goldBright}; }
#bw-roster .bw-ro-name.bw-ro-faint { color: ${theme.parchmentFaint}; font-style: italic; }
#bw-roster .bw-ro-open {
  font-family: ${theme.fonts.display}; font-size: clamp(11px, .86vw, 13px);
  letter-spacing: 0; color: ${theme.gold};
}
#bw-roster .bw-ro-acts { display: flex; align-items: center; gap: 6px; }
#bw-roster .bw-ro-play, #bw-roster .bw-ro-begin, #bw-roster .bw-ro-hero-play {
  min-height: 40px; cursor: pointer;
  font-family: ${theme.fonts.display}; font-size: clamp(10px, .76vw, 12px); font-weight: 700;
  letter-spacing: 0; color: ${theme.goldBright};
  border: 1px solid ${theme.goldDim}aa; border-radius: 6px;
  background: linear-gradient(180deg, ${theme.plateUp}, ${theme.plate} 62%, #2c0d08);
  box-shadow: 0 2px 8px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.10);
  transition-property: filter, transform, border-color;
  transition-duration: .12s;
}
#bw-roster .bw-ro-play { min-width: 52px; padding: 0 10px; }
#bw-roster .bw-ro-play:hover, #bw-roster .bw-ro-begin:hover, #bw-roster .bw-ro-hero-play:hover:not(:disabled) { filter: brightness(1.08); border-color: ${theme.gold}; }
#bw-roster .bw-ro-play:active, #bw-roster .bw-ro-begin:active, #bw-roster .bw-ro-hero-play:active:not(:disabled), #bw-roster .bw-ro-del:active { transform: scale(.96); }
#bw-roster .bw-ro-hero-play {
  min-width: 156px; min-height: 60px; margin-top: 11px; padding: 0 24px;
  font-size: clamp(16px, 1.35vw, 20px); border-radius: 7px;
}
#bw-roster .bw-ro-hero-play[hidden] { display: none; }
#bw-roster .bw-ro-del {
  position: relative; width: 40px; height: 40px; flex: 0 0 40px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: ${theme.parchmentFaint};
  border: 1px solid transparent; border-radius: 6px;
  background: rgba(0,0,0,.16);
  transition-property: color, border-color, background-color, transform;
  transition-duration: .12s;
}
#bw-roster .bw-ro-del:hover { color: #ff8f7a; border-color: #7a2a20; background: rgba(122,42,32,.22); }
#bw-roster .bw-ro-del.bw-ro-armed {
  color: #ffd9cf; border-color: #a03a2a;
  background: linear-gradient(180deg, ${theme.plateUp}, ${theme.plate});
}
#bw-roster .bw-ro-begin {
  width: 100%; flex: 0 0 auto; padding: 0 12px;
  color: #181106; border-color: ${theme.goldBright};
  background: linear-gradient(180deg, ${theme.goldBright}, ${theme.gold} 52%, ${theme.goldDim});
}
#bw-roster .bw-ro-foot {
  min-height: 20px; flex: 0 0 auto; font-size: 13.5px; line-height: 1.2; color: ${theme.parchmentDim};
}
#bw-roster .bw-ro-foot.bw-ro-bad { color: #ff8f7a; }
#bw-roster .bw-ro-hero {
  width: 100%; height: 100%; padding: clamp(8px, 1vw, 14px);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; overflow: hidden;
}
#bw-roster .bw-ro-hero-img {
  flex: 0 1 auto; min-height: 0; max-height: ${ROSTER_PANEL_ART.maxPortraitFrac * 100}%; max-width: 100%; width: auto; height: auto;
  object-fit: contain; object-position: bottom center;
  filter: drop-shadow(0 14px 12px rgba(0,0,0,.5));
}
#bw-roster .bw-ro-hero-name {
  flex: 0 0 auto; margin-top: 4px;
  font-family: ${theme.fonts.display}; font-size: clamp(19px, 1.9vw, 31px);
  font-weight: 700; line-height: 1.03; letter-spacing: 0;
  color: ${theme.parchment}; text-shadow: 0 2px 8px rgba(0,0,0,.7);
  max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#bw-roster .bw-ro-hero-class {
  flex: 0 0 auto; margin-top: 3px;
  font-family: ${theme.fonts.display}; font-size: clamp(12px, 1vw, 16px);
  letter-spacing: 0; color: ${theme.gold};
}
#bw-roster .bw-ro-hero.bw-ro-empty .bw-ro-hero-img { display: none; }
#bw-roster ::-webkit-scrollbar { width: 8px; }
#bw-roster ::-webkit-scrollbar-track { background: rgba(0,0,0,.25); }
#bw-roster ::-webkit-scrollbar-thumb { background: rgba(201,164,74,.45); border: 1px solid rgba(0,0,0,.45); border-radius: 6px; }

@media (max-width: 940px) {
  #bw-roster .bw-ro-card { grid-template-columns: 56px minmax(0, 1fr); }
  #bw-roster .bw-ro-port { width: 56px; height: 56px; }
  #bw-roster .bw-ro-acts { grid-column: 1 / -1; justify-content: flex-end; }
}
`;

export default createRoster;
