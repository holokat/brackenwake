// MP1: the chat box. A small parchment panel on the HUD that shows what the
// room says and takes a line to say back. Draggable by its header, and it
// remembers where it was put. Enter with nothing else focused puts the cursor
// in it; Escape gives the keys back to the game. input.js already ignores
// keys typed into a text box, so the bar's 1 to 0 do not fire while you talk.
//
// The pure parts (`pushLine`, `clampPos`, `lineText`) are measured in
// chat_box.test.mjs; the DOM half is thin and reads them.
import { theme, cornerUrl } from './ui_theme.js';

export const MAX_LINES = 80;
export const MAX_SAY = 240;
export const POS_KEY = 'bw_chat_pos';
/** From the left and from the bottom; null x means the right hand side, clear of the log and the bar. */
export const DEFAULT_POS = { x: null, y: 150 };

/** A line onto the list, oldest dropped past MAX_LINES. Returns the list. */
export function pushLine(lines, line, max = MAX_LINES) {
  lines.push(line);
  while (lines.length > max) lines.shift();
  return lines;
}

/** What a line reads as: "tour: hello", or "you: hello" for your own. */
export function lineText(line, myName) {
  const who = line.name === myName ? 'you' : (line.name || 'someone');
  return `${who}: ${line.text}`;
}

/** Keep a dragged box inside the viewport; `x` is from the left, `y` from the bottom. */
export function clampPos(pos, box, view) {
  const x = Math.max(0, Math.min(Math.max(0, view.w - box.w), pos.x));
  const y = Math.max(0, Math.min(Math.max(0, view.h - box.h), pos.y));
  return { x, y };
}

const CSS = `
#bw-chat { position: absolute; width: 340px; z-index: 30; pointer-events: auto;
  font-family: ${theme.fonts.body}; font-size: 13px; color: ${theme.parchment};
  background:
    ${cornerUrl()}, ${cornerUrl()}, ${cornerUrl()}, ${cornerUrl()},
    linear-gradient(180deg, rgba(255,255,255,.035), rgba(0,0,0,.18)), ${theme.stone};
  background-repeat: no-repeat;
  background-position: left 2px top 2px, right 2px top 2px, left 2px bottom 2px, right 2px bottom 2px, 0 0, 0 0;
  background-size: 18px 18px, 18px 18px, 18px 18px, 18px 18px, auto, auto;
  border: 1px solid ${theme.goldDim}88; border-radius: 7px;
  box-shadow: 0 8px 26px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05), inset 0 -12px 20px rgba(0,0,0,.22); }
#bw-chat .hd { cursor: move; user-select: none; padding: 4px 8px; display: flex; justify-content: space-between; align-items: center;
  font-family: ${theme.fonts.display}; font-size: 10px; letter-spacing: .14em; font-variant-caps: small-caps; color: ${theme.gold};
  border-bottom: 1px solid ${theme.goldDim}55; }
#bw-chat .hd button { background: none; border: 0; color: ${theme.goldDim}; cursor: pointer; font: inherit; padding: 0 2px; }
#bw-chat .ls { height: 120px; overflow-y: auto; padding: 4px 8px; display: flex; flex-direction: column; gap: 2px; }
#bw-chat .ls .l { line-height: 1.3; overflow-wrap: anywhere; }
#bw-chat .ls .l .n { color: ${theme.goldBright}; }
#bw-chat .ls .l.me .n { color: #7ad0ff; }
#bw-chat .ls .l.sys { color: ${theme.parchmentDim}; font-style: italic; }
#bw-chat input { width: 100%; box-sizing: border-box; font: inherit; color: ${theme.parchment}; padding: 5px 8px;
  background: ${theme.slot.face}; border: 0; border-top: 1px solid ${theme.goldDim}55; outline: none; }
#bw-chat input::placeholder { color: ${theme.parchmentFaint}; }
#bw-chat.folded .ls, #bw-chat.folded input { display: none; }
`;

/**
 * `createChatBox(root, { name, onSend, storage })`. `onSend(text)` returns true
 * when the line went out; false is said back as a system line.
 */
export function createChatBox(root, { name = 'you', onSend = null, storage = null } = {}) {
  const lines = [];
  if (!root || typeof document === 'undefined') {
    return { lines, add: (line) => pushLine(lines, line), system: (text) => pushLine(lines, { name: '', text, sys: true }), focus() {}, dispose() {}, el: null, get pos() { return { ...DEFAULT_POS }; } };
  }
  if (!document.getElementById('bw-chat-css')) {
    const st = document.createElement('style'); st.id = 'bw-chat-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.id = 'bw-chat';
  const hd = document.createElement('div'); hd.className = 'hd';
  const title = document.createElement('span'); title.textContent = 'The road';
  const fold = document.createElement('button'); fold.type = 'button'; fold.textContent = '–'; fold.title = 'fold the chat away';
  hd.appendChild(title); hd.appendChild(fold);
  const ls = document.createElement('div'); ls.className = 'ls';
  const input = document.createElement('input'); input.type = 'text'; input.maxLength = MAX_SAY; input.placeholder = 'say something, Enter sends';
  el.appendChild(hd); el.appendChild(ls); el.appendChild(input);
  root.appendChild(el);

  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  let pos = { ...DEFAULT_POS };
  try { const raw = store && store.getItem(POS_KEY); if (raw) { const p = JSON.parse(raw); if (Number.isFinite(p.x) && Number.isFinite(p.y)) pos = p; } } catch { /* a fresh box */ }
  window.addEventListener('resize', () => place());
  // the HUD root is absolute and reports no size of its own; the window is the viewport
  const view = () => ({ w: window.innerWidth || root.clientWidth || 1280, h: window.innerHeight || root.clientHeight || 720 });
  function place() {
    const v = view();
    if (!Number.isFinite(pos.x)) pos = { x: Math.max(0, v.w - (el.offsetWidth || 340) - 14), y: pos.y };
    pos = clampPos(pos, { w: el.offsetWidth || 340, h: el.offsetHeight || 170 }, v);
    el.style.left = `${pos.x}px`; el.style.bottom = `${pos.y}px`;
  }
  place();

  // drag by the header
  let drag = null;
  hd.addEventListener('pointerdown', (e) => {
    if (e.target === fold) return;
    drag = { x: e.clientX, y: e.clientY, at: { ...pos } };
    hd.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  hd.addEventListener('pointermove', (e) => {
    if (!drag) return;
    pos = { x: drag.at.x + (e.clientX - drag.x), y: drag.at.y - (e.clientY - drag.y) };
    place();
  });
  const endDrag = () => { if (!drag) return; drag = null; try { store && store.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* nothing to keep it in */ } };
  hd.addEventListener('pointerup', endDrag);
  hd.addEventListener('pointercancel', endDrag);
  fold.addEventListener('click', () => { el.classList.toggle('folded'); fold.textContent = el.classList.contains('folded') ? '+' : '–'; });

  function render(line) {
    const d = document.createElement('div');
    d.className = `l${line.sys ? ' sys' : ''}${line.name === name ? ' me' : ''}`;
    if (line.sys) d.textContent = line.text;
    else {
      const n = document.createElement('span'); n.className = 'n'; n.textContent = `${line.name === name ? 'you' : (line.name || 'someone')}: `;
      d.appendChild(n); d.appendChild(document.createTextNode(line.text));
    }
    ls.appendChild(d);
    while (ls.children.length > MAX_LINES) ls.removeChild(ls.firstChild);
    ls.scrollTop = ls.scrollHeight;
  }
  function add(line) { pushLine(lines, line); render(line); return line; }
  function system(text) { return add({ name: '', text, sys: true }); }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.blur(); e.stopPropagation(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault(); e.stopPropagation();
    const text = input.value.trim().slice(0, MAX_SAY);
    input.value = '';
    if (!text) { input.blur(); return; }
    const ok = typeof onSend === 'function' ? onSend(text) : false;
    if (!ok) system('Nobody can hear you: the road is not connected.');
  });
  // Enter with nothing else focused opens the line
  const onKey = (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
    if (el.classList.contains('folded')) return;
    input.focus(); e.preventDefault();
  };
  window.addEventListener('keydown', onKey);

  return {
    el, lines, add, system,
    focus() { input.focus(); },
    get pos() { return { ...pos }; },
    dispose() { window.removeEventListener('keydown', onKey); if (el.parentNode) el.parentNode.removeChild(el); },
  };
}
