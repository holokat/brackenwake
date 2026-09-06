// The roster: who you have, and the road back to any of them.
//
// This is the first screen a returning player sees, before the creation gate
// and before the game loop, over the world that has already been raised. It is
// the only place a character can be deleted, because it is the only place the
// player can see what they would be deleting: the name, the three things they
// were best at, the purse, and the ground they were standing on.
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
// people waiting. Each row opens with the person's own face, rendered by
// roster_preview.js from the body and the gear their save holds, so the row is
// recognised before it is read.

import { clearRosterAsk } from './state.js';
import { OPENINGS_BY_ID } from '../mmo/openings.js';
import {
  injectTheme, theme, icon, ICONS, ruleUrl, cornerUrl, parchmentUrl,
} from './ui_theme.js';
import { createPortraits, silhouetteSvg, PORTRAIT } from './roster_preview.js';

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

/** What a card calls a character who never got as far as a name. */
export const UNNAMED = 'Nobody yet';

/**
 * Everything one card says, worked out from the roster row alone. Pure, so the
 * wording can be measured without a document.
 */
export function cardOf(row, now = Date.now()) {
  const s = row?.summary || null;
  const name = (s?.name || row?.name || '').trim();
  const openingId = s?.opening || row?.opening || 'blank';
  const opening = OPENINGS_BY_ID[openingId];
  const skills = Array.isArray(s?.skills) ? s.skills : [];
  return {
    id: row?.id,
    name: name || UNNAMED,
    unnamed: !name,
    needsCreation: !!(row?.needsCreation ?? s?.needsCreation),
    opening: s?.openingName || opening?.name || '',
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
  };
}

export function createRoster(root, deps = {}) {
  const { state, onPlay, onNew, sc } = deps;
  const rows = () => (state && typeof state.roster === 'function' ? state.roster() : []);

  if (typeof document === 'undefined') {
    return { el: null, cards: [], rows: rows(), destroy() {}, select() {}, play() {}, remove() {}, key() {}, refresh() {} };
  }

  // One portrait maker for the life of the screen: one WebGL context, one
  // cache, and both of them gone in destroy(). A caller may hand its own in,
  // which is how a node test drives the cache without a GPU.
  const portraits = deps.portraits || createPortraits({ storage: deps.storage });

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
  const panel = h('div', 'bw-ro-panel');
  el.appendChild(panel);
  (root || document.body).appendChild(el);

  const top = h('div', 'bw-ro-top');
  top.appendChild(h('h1', null, 'Who takes the road today'));
  const lede = h('div', 'bw-ro-lede');
  top.appendChild(lede);
  panel.appendChild(top);
  panel.appendChild(h('div', 'bw-hdr', 'Your characters'));

  const list = h('div', 'bw-ro-cards');
  panel.appendChild(list);

  const foot = h('div', 'bw-ro-foot');
  panel.appendChild(foot);

  /** The cards, in order, with the "new character" card last and always there. */
  let cards = [];
  let sel = 0;
  let armed = null;          // the slot a second click on Delete would remove
  let done = false;

  function say(text, kind) {
    foot.className = `bw-ro-foot${kind ? ` bw-ro-${kind}` : ''}`;
    foot.textContent = text || '';
  }

  /**
   * The picture at the head of a row. A character with a saved appearance gets
   * their own body, rendered once and kept; anybody else, and any browser that
   * will not give us a canvas, gets the drawn silhouette. Never an <img> with
   * nothing behind it, which is the one outcome that reads as broken.
   */
  function faceOf(row, c) {
    const port = h('div', 'bw-ro-port');
    let url = null;
    try { url = portraits.of(row); } catch (e) { console.warn('[roster] no portrait for this one', e); }
    if (url) {
      const img = h('img', 'bw-ro-face');
      img.src = url;
      img.width = PORTRAIT.w;
      img.height = PORTRAIT.h;
      img.alt = c?.unnamed ? 'a character with no name yet' : `${c?.name || 'a character'}, ${c?.opening || 'no opening'}`;
      port.appendChild(img);
      return port;
    }
    port.classList.add('bw-ro-nobody');
    port.innerHTML = silhouetteSvg();
    return port;
  }

  function build() {
    list.textContent = '';
    cards = [];
    const list_ = rows();
    const now = Date.now();
    lede.textContent = list_.length === 1
      ? 'One character stands ready. Take them up, or begin another.'
      : `${list_.length} characters stand ready. Take one up, or begin another.`;
    if (!list_.length) lede.textContent = 'Nobody yet. The first road is the one below.';

    for (const row of list_) {
      const c = cardOf(row, now);
      const card = h('div', 'bw-ro-card');
      card.dataset.slot = c.id;
      card.appendChild(h('div', 'bw-ro-band'));
      card.appendChild(faceOf(row, c));

      const who = h('div', 'bw-ro-who');
      const head = h('div', 'bw-ro-head');
      const nm = h('div', 'bw-ro-name', c.name);
      if (c.unnamed) nm.className = 'bw-ro-name bw-ro-faint';
      head.appendChild(nm);
      head.appendChild(h('div', 'bw-ro-open', c.needsCreation ? 'not yet made' : c.opening));
      who.appendChild(head);

      if (c.needsCreation) {
        who.appendChild(h('div', 'bw-ro-note', 'This one was begun and never finished. Play takes you back to the making of them.'));
      }
      card.appendChild(who);

      const sk = h('div', 'bw-ro-skills');
      if (c.skills.length) {
        for (const s of c.skills) {
          const chip = h('span', 'bw-ro-chip');
          chip.appendChild(h('span', 'bw-ro-sk', s.name));
          chip.appendChild(h('span', 'bw-ro-sv', String(s.value)));
          sk.appendChild(chip);
        }
      } else {
        sk.appendChild(h('div', 'bw-ro-note', c.skillsLine));
      }
      card.appendChild(sk);

      const facts = h('div', 'bw-ro-facts');
      const fact = (name, value) => {
        const r = h('div', 'bw-ro-frow');
        r.appendChild(hs('span', 'bw-ro-fi', icon(name, theme.gold, 13)));
        r.appendChild(h('span', 'bw-ro-fv', value));
        facts.appendChild(r);
      };
      fact(CARD_ICONS.gold, c.gold == null ? 'a purse nobody counted' : `${c.gold} gold`);
      fact(CARD_ICONS.place, c.placeLine);
      fact(CARD_ICONS.played, c.played);
      card.appendChild(facts);

      const acts = h('div', 'bw-ro-acts');
      const play = h('button', 'bw-btn bw-ro-play', 'Play');
      play.dataset.play = c.id;
      play.addEventListener('click', (ev) => { ev?.stopPropagation?.(); doPlay(c.id); });
      acts.appendChild(play);
      const del = h('button', `bw-btn bw-ro-del${armed === c.id ? ' bw-ro-armed' : ''}`,
        armed === c.id ? 'yes, delete them' : 'delete');
      del.dataset.del = c.id;
      del.addEventListener('click', (ev) => { ev?.stopPropagation?.(); doDelete(c.id); });
      acts.appendChild(del);
      card.appendChild(acts);

      card.addEventListener('click', () => { select(cards.indexOf(card)); });
      list.appendChild(card);
      cards.push(card);
    }

    const fresh = h('div', 'bw-ro-card bw-ro-new');
    fresh.dataset.slot = '';
    fresh.dataset.new = '1';
    fresh.appendChild(h('div', 'bw-ro-band'));
    // The same empty frame the unmade slots wear, so the last row of the list
    // lines up with the ones above it instead of starting further left.
    const freshPort = h('div', 'bw-ro-port bw-ro-nobody');
    freshPort.innerHTML = silhouetteSvg();
    fresh.appendChild(freshPort);
    const freshWho = h('div', 'bw-ro-who');
    freshWho.appendChild(h('div', 'bw-ro-name', 'New character'));
    freshWho.appendChild(h('div', 'bw-ro-note', 'Eleven openings, thirty points of stat and two hundred of skill, and a name of your own.'));
    fresh.appendChild(freshWho);
    const acts = h('div', 'bw-ro-acts');
    const begin = h('button', 'bw-btn bw-ro-begin', 'Begin');
    begin.dataset.begin = '1';
    begin.addEventListener('click', (ev) => { ev?.stopPropagation?.(); doNew(); });
    acts.appendChild(begin);
    fresh.appendChild(acts);
    fresh.addEventListener('click', () => { select(cards.indexOf(fresh)); });
    list.appendChild(fresh);
    cards.push(fresh);

    if (sel >= cards.length) sel = cards.length - 1;
    if (sel < 0) sel = 0;
    paint();
  }

  function paint() {
    for (let i = 0; i < cards.length; i++) cards[i].classList.toggle('on', i === sel);
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
      const who = cardOf(rows().find((r) => r.id === id) || {}).name;
      build();
      say(`${who} goes for good, with everything they carry. Press it again.`, 'bad');
      return false;
    }
    armed = null;
    const who = cardOf(rows().find((r) => r.id === id) || {}).name;
    const gone = state?.deleteSlot?.(id, { evenIfOpen: true }) === true;
    // The document is gone, so the picture of it has to go too. Slot ids are
    // handed back out by state.newSlot, and a kept portrait would put the dead
    // character's face on the next one to take the number.
    if (gone) portraits.forget(id);
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
      if (card.dataset.new) return doNew();
      return doPlay(card.dataset.slot);
    }
    // Escape does nothing on purpose: there is nothing behind this screen to
    // go back to, and a key that looks like it closes it would close nothing.
    return false;
  }
  const win = typeof window !== 'undefined' ? window : null;
  win?.addEventListener?.('keydown', key);

  // --- the world behind it, turning slowly ---------------------------------
  // The game loop is not running yet, so this screen draws the scene itself,
  // exactly as creation.js does. No world state is touched: the camera moves
  // and nothing else.
  let raf = 0, stopped = false;
  if (sc) {
    try {
      sc.setDay?.(0.55);
      sc.setFog?.(70, 260);
      let a = 0;
      const spin = () => {
        if (stopped) return;
        a += 0.0012;
        const r = 26;
        sc.camera.position.set(Math.sin(a) * r, 11, Math.cos(a) * r);
        sc.camera.lookAt(0, 3, 0);
        try { sc.render(); } catch { /* a lost context is not worth a crash here */ }
        raf = requestAnimationFrame(spin);
      };
      raf = requestAnimationFrame(spin);
    } catch (e) {
      console.warn('[roster] no turning world', e);
    }
  }

  function destroy() {
    if (done) return;
    done = true;
    stopped = true;
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    win?.removeEventListener?.('keydown', key);
    // The portraits' own WebGL context goes with the screen. A context left
    // behind on every visit to the roster is how a browser reaches its limit
    // and starts refusing the game one.
    if (!deps.portraits) portraits.dispose();
    el.remove();
  }

  build();

  return {
    el, key, destroy, select, portraits,
    refresh: build,
    play: doPlay,
    remove: doDelete,
    newCharacter: doNew,
    get cards() { return cards; },
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
  position: fixed; inset: 0; z-index: 92; display: flex; align-items: stretch;
  justify-content: center;
  background: radial-gradient(120% 90% at 50% 0%, rgba(6,5,4,.72), rgba(6,5,4,.95) 70%);
  font-family: ${theme.fonts.body}; font-size: 15px; line-height: 1.4;
  color: ${theme.parchment};
}
#bw-roster[hidden] { display: none; }

#bw-roster .bw-ro-panel {
  position: relative; width: min(1080px, 92vw); margin: 0 auto;
  padding: 26px 30px 30px; overflow-y: auto; overflow-x: hidden;
  display: flex; flex-direction: column;
  background-image:
    ${cornerUrl(theme.gold)}, ${cornerUrl(theme.gold)},
    ${parchmentUrl()},
    linear-gradient(180deg, rgba(0,0,0,.5), rgba(0,0,0,.2));
  background-repeat: no-repeat, no-repeat, repeat, no-repeat;
  background-position: left 8px top 8px, right 8px top 8px, 0 0, 0 0;
  background-size: 18px 18px, 18px 18px, 140px 90px, auto;
  border-left: 1px solid ${theme.goldDim}88; border-right: 1px solid ${theme.goldDim}88;
  box-shadow: 0 0 60px rgba(0,0,0,.7);
}

#bw-roster h1 {
  margin: 0; font-family: ${theme.fonts.display}; font-size: 27px; font-weight: 700;
  letter-spacing: .05em; color: ${theme.parchment}; text-shadow: 0 2px 12px rgba(0,0,0,.85);
}
#bw-roster .bw-ro-lede {
  margin: 6px 0 2px; font-style: italic; font-size: 16px; line-height: 1.45;
  color: ${theme.parchmentDim}; border-left: 2px solid ${theme.goldDim}88; padding-left: 11px;
}
#bw-roster .bw-hdr {
  font-family: ${theme.fonts.display}; font-size: 11.5px; font-weight: 600;
  letter-spacing: .22em; text-transform: uppercase; color: ${theme.gold};
  margin: 20px 0 9px; padding-bottom: 9px;
  background: ${ruleUrl()} bottom center / 100% 9px no-repeat;
}

#bw-roster .bw-ro-cards {
  display: flex; flex-direction: column; gap: 9px;
}
/* One row: the face, who they are, what they are best at, where they were,
   and the two buttons. The five columns are fixed in this one place so every
   row lines up down the page rather than each sizing itself. */
#bw-roster .bw-ro-card {
  position: relative; padding: 10px 12px 10px 16px; cursor: pointer;
  display: grid; align-items: center; gap: 16px;
  grid-template-columns: 92px minmax(150px, 1.1fr) minmax(132px, .9fr) minmax(180px, 1.1fr) auto;
  background: linear-gradient(100deg, rgba(30,25,18,.9), rgba(10,9,7,.93));
  border: 1px solid ${theme.goldDim}55;
  transition: border-color .12s ease, background-color .12s ease;
}

/* the portrait: a 160 x 220 render shown at 92 px wide, so the picture is
   drawn at better than screen resolution and stays sharp on a dense display */
#bw-roster .bw-ro-port {
  position: relative; width: 92px; height: 126px; overflow: hidden;
  background: linear-gradient(180deg, rgba(36,31,24,.9), rgba(8,7,6,.95));
  border: 1px solid ${theme.goldDim}55;
  display: flex; align-items: flex-end; justify-content: center;
}
#bw-roster .bw-ro-port img, #bw-roster .bw-ro-port svg {
  display: block; width: 100%; height: 100%; object-fit: contain;
}
#bw-roster .bw-ro-port.bw-ro-nobody { opacity: .72; }
#bw-roster .bw-ro-card.on .bw-ro-port { border-color: ${theme.gold}; }
#bw-roster .bw-ro-who { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
#bw-roster .bw-ro-card .bw-ro-band {
  position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: ${theme.goldDim};
}
#bw-roster .bw-ro-card:hover { border-color: ${theme.gold}; }
/* the row in hand, lit in the one gold ui_theme owns */
#bw-roster .bw-ro-card.on {
  border-color: ${theme.gold};
  box-shadow: inset 4px 0 0 ${theme.gold}, 0 0 18px rgba(201,164,74,.14);
  background: linear-gradient(100deg, rgba(64,50,26,.92), rgba(18,14,9,.94));
}
#bw-roster .bw-ro-card.on .bw-ro-band { width: 0; }

#bw-roster .bw-ro-head { display: flex; flex-direction: column; gap: 2px; }
#bw-roster .bw-ro-name {
  font-family: ${theme.fonts.display}; font-size: 19px; font-weight: 600;
  letter-spacing: .03em; color: ${theme.parchment}; line-height: 1.1;
}
#bw-roster .bw-ro-card.on .bw-ro-name, #bw-roster .bw-ro-card:hover .bw-ro-name { color: ${theme.goldBright}; }
#bw-roster .bw-ro-name.bw-ro-faint { color: ${theme.parchmentFaint}; font-style: italic; }
#bw-roster .bw-ro-open {
  font-family: ${theme.fonts.display}; font-size: 9px; letter-spacing: .18em;
  text-transform: uppercase; color: ${theme.gold};
}
#bw-roster .bw-ro-note { font-size: 14px; line-height: 1.32; color: ${theme.parchmentDim}; }

/* the three best things they can do, as chips rather than a table, because a
   table of three rows next to a portrait reads as a receipt */
#bw-roster .bw-ro-skills { display: flex; flex-wrap: wrap; gap: 4px; align-content: center; }
#bw-roster .bw-ro-chip {
  display: inline-flex; align-items: baseline; gap: 6px; padding: 2px 7px;
  border: 1px solid ${theme.goldDim}55; background: rgba(0,0,0,.32);
}
#bw-roster .bw-ro-sk {
  font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .13em;
  text-transform: uppercase; color: ${theme.parchmentDim};
}
#bw-roster .bw-ro-sv {
  font-family: ${theme.fonts.display}; font-size: 12.5px; font-weight: 600;
  font-variant-numeric: tabular-nums; color: ${theme.goldBright};
}
#bw-roster .bw-ro-card.on .bw-ro-chip { border-color: ${theme.goldDim}aa; }

#bw-roster .bw-ro-facts { display: grid; gap: 3px; }
#bw-roster .bw-ro-frow { display: grid; grid-template-columns: 18px 1fr; gap: 8px; align-items: center; }
#bw-roster .bw-ro-fi { display: block; opacity: .85; }
#bw-roster .bw-ro-fv { font-size: 14px; color: ${theme.parchmentDim}; }

#bw-roster .bw-ro-acts { display: flex; flex-direction: column; gap: 6px; align-items: stretch; min-width: 108px; }
#bw-roster .bw-ro-play { padding: 7px 16px; }
#bw-roster .bw-ro-del { color: ${theme.parchmentFaint}; border-color: ${theme.goldDim}66; }
#bw-roster .bw-ro-del:hover { color: #ff8f7a; border-color: #7a2a20; }
#bw-roster .bw-ro-del.bw-ro-armed {
  color: #ffd9cf; border-color: #a03a2a;
  background: linear-gradient(180deg, ${theme.plateUp}, ${theme.plate});
}

#bw-roster .bw-ro-new {
  border-style: dashed;
  grid-template-columns: 92px 1fr auto;
  background: linear-gradient(100deg, rgba(20,17,12,.8), rgba(8,7,6,.9));
}
#bw-roster .bw-ro-new.on { background: linear-gradient(100deg, rgba(58,45,24,.86), rgba(14,11,8,.92)); }
#bw-roster .bw-ro-new .bw-ro-band { background: ${theme.gold}; }
#bw-roster .bw-ro-new .bw-ro-port { border-style: dashed; }

/* Narrow: the facts fall under the name and the row keeps its face. Nothing
   is dropped, because a roster that hides where a character was standing has
   stopped being the screen that tells you who you have. */
@media (max-width: 900px) {
  #bw-roster .bw-ro-card,
  #bw-roster .bw-ro-new { grid-template-columns: 74px 1fr auto; gap: 6px 12px; }
  #bw-roster .bw-ro-port { width: 74px; height: 101px; }
  /* the new character row has one line of content, so nothing spans in it */
  #bw-roster .bw-ro-card:not(.bw-ro-new) .bw-ro-port { grid-row: 1 / 4; }
  #bw-roster .bw-ro-who { grid-column: 2; grid-row: 1; }
  #bw-roster .bw-ro-skills { grid-column: 2; grid-row: 2; }
  #bw-roster .bw-ro-facts { grid-column: 2; grid-row: 3; }
  #bw-roster .bw-ro-acts { grid-column: 3; justify-content: center; }
  #bw-roster .bw-ro-card:not(.bw-ro-new) .bw-ro-acts { grid-row: 1 / 4; }
}

#bw-roster .bw-ro-foot {
  min-height: 20px; margin-top: 14px; font-size: 14.5px; color: ${theme.parchmentDim};
}
#bw-roster .bw-ro-foot.bw-ro-bad { color: #ff8f7a; }
`;

export default createRoster;
