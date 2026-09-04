// Keyboard, mouse and wheel, gathered per frame and handed to whoever asks.
//
// The quick click and the drag are exclusive. A press that stays inside 6 px
// and lets go within 400 ms is a click and emits no drag deltas at all; the
// camera never twitches when you click a tree. Anything longer or wider
// becomes a drag from the moment it crosses the threshold, and the movement
// already made since the press is handed over in one piece so the gesture
// keeps its whole angle.
//
// click.x and click.y are NDC, the same space as pointer, ready for a
// raycaster. click.px and click.py are CSS pixels within the element.

export const DRAG_PX = 6;       // a press that wanders further than this is a drag
export const CLICK_MS = 400;    // a press held longer than this is a drag
const FIELDS = { INPUT: 1, TEXTAREA: 1, SELECT: 1 };

function typingIn(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  return !!FIELDS[el.tagName];
}

export function createInput(domElement) {
  const el = domElement;
  const win = typeof window !== 'undefined' ? window : null;

  const keys = new Set();
  const fresh = new Set();          // keys that went down since the last endFrame
  const drag = { dx: 0, dy: 0, active: false, button: 0 };
  const pointer = { x: 0, y: 0 };
  const api = {
    keys, drag, pointer,
    wheel: 0,
    click: null,
    down: (k) => keys.has(String(k).toLowerCase()),
    pressed: (k) => fresh.has(String(k).toLowerCase()),
    endFrame() {
      drag.dx = 0; drag.dy = 0;
      api.wheel = 0;
      api.click = null;
      fresh.clear();
    },
    dispose,
  };

  // --- keys ---
  const onKeyDown = (e) => {
    if (typingIn(e.target) || (e.target && e.target.ownerDocument && typingIn(e.target.ownerDocument.activeElement))) return;
    const k = String(e.key || '').toLowerCase();
    if (!k) return;
    if (!keys.has(k)) fresh.add(k);
    keys.add(k);
  };
  // a key up is always honoured, wherever it lands, or keys stick down forever
  const onKeyUp = (e) => { const k = String(e.key || '').toLowerCase(); if (k) keys.delete(k); };
  const onBlur = () => { keys.clear(); fresh.clear(); drag.active = false; press = null; dragging = false; };

  // --- pointer ---
  let press = null, dragging = false;
  const ndc = (e) => {
    if (!el || !el.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
  };

  const onPointerDown = (e) => {
    ndc(e);
    press = { x: e.clientX, y: e.clientY, t: (e.timeStamp != null ? e.timeStamp : Date.now()), button: e.button || 0 };
    dragging = false;
    drag.button = press.button;
    if (el && el.setPointerCapture && e.pointerId != null) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* not captured, window still hears the up */ } }
  };

  const onPointerMove = (e) => {
    ndc(e);
    if (!press) return;
    const now = (e.timeStamp != null ? e.timeStamp : Date.now());
    if (!dragging) {
      const far = Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_PX;
      const slow = now - press.t > CLICK_MS;
      if (!far && !slow) return;                 // still a candidate click, swallow the movement
      dragging = true;
      drag.active = true;
      drag.dx += e.clientX - press.x;            // the gesture keeps every pixel of its angle
      drag.dy += e.clientY - press.y;
    } else {
      drag.dx += e.clientX - press.last.x;
      drag.dy += e.clientY - press.last.y;
    }
    press.last = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e) => {
    if (!press) return;
    const now = (e.timeStamp != null ? e.timeStamp : Date.now());
    const far = Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_PX;
    const slow = now - press.t > CLICK_MS;
    if (!dragging && !far && !slow) {
      ndc(e);
      const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0 };
      api.click = { x: pointer.x, y: pointer.y, px: e.clientX - r.left, py: e.clientY - r.top, button: press.button };
    }
    press = null; dragging = false; drag.active = false;
    if (el && el.releasePointerCapture && e.pointerId != null) { try { el.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ } }
  };

  const onWheel = (e) => { if (e.cancelable !== false && e.preventDefault) e.preventDefault(); api.wheel += e.deltaY || 0; };
  const onContext = (e) => { if (e.preventDefault) e.preventDefault(); };

  if (win) {
    win.addEventListener('keydown', onKeyDown);
    win.addEventListener('keyup', onKeyUp);
    win.addEventListener('blur', onBlur);
    win.addEventListener('pointerup', onPointerUp);      // a release outside the canvas still ends the drag
    win.addEventListener('pointercancel', onPointerUp);
  }
  if (el && el.addEventListener) {
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContext);
  }

  function dispose() {
    if (win) {
      win.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('keyup', onKeyUp);
      win.removeEventListener('blur', onBlur);
      win.removeEventListener('pointerup', onPointerUp);
      win.removeEventListener('pointercancel', onPointerUp);
    }
    if (el && el.removeEventListener) {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContext);
    }
    keys.clear(); fresh.clear();
  }

  return api;
}
