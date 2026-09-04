// Numbers that fly off things. Damage, heals, misses, gold, and the two that
// matter most to this game: skill and stat gains, which are the largest and the
// greenest thing on screen when they happen, because the gain is the game.
//
//   const floaters = createFloaters(sc, hudRoot);
//   floaters.spawn(worldPos, '+0.3 Mining', 'gain');
//   floaters.update(dt);          // every frame, after the camera moved
//
// Each floater is a DOM element positioned by projecting its world anchor
// through the camera every frame, so it stays over the thing it belongs to as
// the camera orbits. It rises RISE metres over LIFE seconds and fades in the
// last third. At most MAX_PER_ANCHOR live over one anchor; the oldest goes
// early. Styles are the table in docs/mmo/02-COMBAT.md.

export const LIFE = 1.2;           // seconds
export const RISE = 1.6;           // metres
export const MAX_PER_ANCHOR = 6;
export const MAX_LIVE = 60;        // hard cap on elements in the DOM

export const KINDS = {
  damage: { color: '#f4f1ea', size: 1.0 },
  crit:   { color: '#ffd23f', size: 1.5, shake: true },
  taken:  { color: '#ff5a4d', size: 1.2 },
  heal:   { color: '#7ee07a', size: 1.0 },
  miss:   { color: '#9aa0a6', size: 0.8 },
  fall:   { color: '#ff9a3c', size: 1.2 },
  gain:   { color: '#5dff6a', size: 1.3, glow: true },
  stat:   { color: '#5dff6a', size: 1.6, glow: true },
  gold:   { color: '#ffd76a', size: 1.0 },
  loot:   { color: '#f4f1ea', size: 1.2 },     // colour overridden by rarity
};

const CSS = `
.bw-float{position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;
  font:700 18px/1 "Segoe UI",system-ui,sans-serif;letter-spacing:.01em;
  text-shadow:0 1px 0 #000,0 0 3px #000,0 0 8px #0009;will-change:transform,opacity;
  transform:translate(-50%,-100%)}
.bw-float.glow{text-shadow:0 1px 0 #000,0 0 4px #000,0 0 14px currentColor}
@keyframes bw-shake{0%,100%{margin-left:0}25%{margin-left:-3px}75%{margin-left:3px}}
.bw-float.shake{animation:bw-shake .18s ease-in-out 2}
`;

/** Pure: where a floater is in its life. Exported for the node test. */
export function lifeState(age) {
  const t = Math.max(0, Math.min(1, age / LIFE));
  const rise = RISE * (1 - Math.pow(1 - t, 2));      // fast at first, settling
  const alpha = t < 2 / 3 ? 1 : 1 - (t - 2 / 3) / (1 / 3);
  return { t, rise, alpha, dead: age >= LIFE };
}

/** Pure: which floater to drop when an anchor is over its limit. */
export function pickEviction(list) {
  let oldest = null;
  for (const f of list) if (!oldest || f.age > oldest.age) oldest = f;
  return oldest;
}

export function createFloaters(sc, root, opts = {}) {
  const doc = root.ownerDocument;
  if (!doc.getElementById('bw-float-css')) {
    const style = doc.createElement('style'); style.id = 'bw-float-css'; style.textContent = CSS; doc.head.appendChild(style);
  }
  const layer = doc.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:30';
  root.appendChild(layer);

  const live = [];
  const scale = () => opts.textScale?.() ?? 1;
  const Vector3 = sc.camera.position.constructor;
  const v = new Vector3();

  function spawn(worldPos, text, kind = 'damage', extra = {}) {
    const k = KINDS[kind] || KINDS.damage;
    // keep the anchor's crowd small: the oldest over this spot goes early
    const key = extra.anchorKey || `${Math.round(worldPos.x)},${Math.round(worldPos.z)}`;
    const crowd = live.filter((f) => f.key === key);
    if (crowd.length >= MAX_PER_ANCHOR) kill(pickEviction(crowd));
    if (live.length >= MAX_LIVE) kill(pickEviction(live));

    const el = doc.createElement('div');
    el.className = 'bw-float' + (k.glow ? ' glow' : '') + (k.shake ? ' shake' : '');
    el.textContent = text;
    el.style.color = extra.color || k.color;
    el.style.fontSize = `${Math.round(18 * k.size * scale())}px`;
    layer.appendChild(el);
    const f = {
      el, key, age: 0,
      x: worldPos.x, y: worldPos.y + (extra.height ?? 1.9), z: worldPos.z,
      jitter: (Math.random() - 0.5) * 0.5,   // so two numbers do not stack exactly
    };
    live.push(f);
    return f;
  }

  function kill(f) {
    const i = live.indexOf(f);
    if (i >= 0) live.splice(i, 1);
    f.el.remove();
  }

  function update(dt) {
    if (!live.length) return;
    const w = layer.clientWidth || 1, h = layer.clientHeight || 1;
    for (let i = live.length - 1; i >= 0; i--) {
      const f = live[i];
      f.age += dt;
      const s = lifeState(f.age);
      if (s.dead) { kill(f); continue; }
      v.set(f.x + f.jitter, f.y + s.rise, f.z).project(sc.camera);
      if (v.z > 1) { f.el.style.opacity = '0'; continue; }     // behind the camera
      const px = (v.x + 1) / 2 * w, py = (1 - v.y) / 2 * h;
      f.el.style.transform = `translate(${px.toFixed(0)}px,${py.toFixed(0)}px) translate(-50%,-100%)`;
      f.el.style.opacity = s.alpha.toFixed(3);
    }
  }

  return {
    spawn, update,
    get count() { return live.length; },
    clear() { for (const f of [...live]) kill(f); },
    dispose() { this.clear(); layer.remove(); },
  };
}
