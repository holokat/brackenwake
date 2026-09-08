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

// Sizes are multiples of the base 22 px. Damage pops in large and settles;
// a crit pops larger and shakes; gains glow. The user asked for numbers that
// are "larger and more fun", so a hit is never smaller than the body text.
export const KINDS = {
  damage: { color: '#fff3d6', size: 1.5, pop: true, drift: true },
  // a crit is the number the fight is about: four times the body text, gold, and it shakes (asked for 2026-09-08)
  crit:   { color: '#ffd23f', size: 4.2, shake: true, pop: true, drift: true },
  taken:  { color: '#ff5a4d', size: 1.7, pop: true, drift: true },
  heal:   { color: '#7ee07a', size: 1.4, pop: true },
  miss:   { color: '#c0c4c8', size: 1.0 },
  fall:   { color: '#ff9a3c', size: 1.6, pop: true },
  gain:   { color: '#5dff6a', size: 1.6, glow: true },
  stat:   { color: '#5dff6a', size: 2.0, glow: true, pop: true },
  gold:   { color: '#ffd76a', size: 1.3, pop: true },
  loot:   { color: '#f4f1ea', size: 1.4 },     // colour overridden by rarity
};
export const BASE_PX = 22;
const STONE_STROKE = '#111013';

// --- the colour of a number you take -----------------------------------------
//
// C2 (docs/mmo/wiring/C2.md). A blow from something that outclasses you should
// not look like a blow from a rat. `taken` is the red over YOUR head, and when
// the thing you are fighting reads red or purple on the con ladder it deepens
// to ANGRY_TAKEN: the same hue, darker and more saturated, so it reads as
// worse without becoming a new colour the player has to learn.
//
// The level is pushed in by targeting.js every frame from the current target
// (`setAnger`), because combat.js hands the floater the DEFENDER and never the
// attacker, so this file cannot ask who swung. That is written down rather
// than implied: a third party hitting you while you look at something harmless
// paints the ordinary red. Your target is the honest guess and the only one
// available without reaching into a file this agent does not own.
export const ANGRY_TAKEN = '#ff2a17';
export const ANGRY_LEVELS = new Set(['deadly', 'boss']);

let anger = null;

/** The con level of what the player is looking at, or null. Returns what it set. */
export function setAnger(level) {
  anger = typeof level === 'string' && level ? level : null;
  return anger;
}
/** What `setAnger` last took. */
export function angerLevel() { return anger; }

/** Pure: the colour a kind paints in, given a con level. Exported for the test. */
export function colourFor(kind, level = anger) {
  const k = KINDS[kind] || KINDS.damage;
  if (kind === 'taken' && ANGRY_LEVELS.has(level)) return ANGRY_TAKEN;
  return k.color;
}

const CSS = `
.bw-float{position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;
  font:700 22px/1 "Cinzel","Trajan Pro",Georgia,serif;letter-spacing:.02em;
  -webkit-text-stroke:1px ${STONE_STROKE};paint-order:stroke fill;
  text-shadow:0 2px 0 #000,0 0 4px #000,0 0 10px #0009;will-change:transform,opacity;
  transform:translate(-50%,-100%)}
.bw-float .in{display:inline-block}
.bw-float.pop .in{animation:bw-pop .28s cubic-bezier(.2,1.6,.4,1) 1}
@keyframes bw-pop{0%{transform:scale(2.1) rotate(-6deg)}60%{transform:scale(.92) rotate(2deg)}100%{transform:scale(1) rotate(0)}}
.bw-float.glow{text-shadow:0 2px 0 #000,0 0 4px #000,0 0 16px currentColor}
@keyframes bw-shake{0%,100%{margin-left:0}25%{margin-left:-4px}75%{margin-left:4px}}
.bw-float.shake .in{animation:bw-pop .28s cubic-bezier(.2,1.6,.4,1) 1,bw-shake .18s ease-in-out 3}
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
    el.className = 'bw-float' + (k.glow ? ' glow' : '') + (k.shake ? ' shake' : '') + (k.pop ? ' pop' : '');
    const inner = doc.createElement('span'); inner.className = 'in'; inner.textContent = text; el.appendChild(inner);
    el.style.color = extra.color || colourFor(kind, extra.con ?? anger);
    el.style.fontSize = `${Math.round(BASE_PX * k.size * scale())}px`;
    layer.appendChild(el);
    const f = {
      el, key, age: 0,
      x: worldPos.x, y: worldPos.y + (extra.height ?? 1.9), z: worldPos.z,
      jitter: (Math.random() - 0.5) * 0.5,   // so two numbers do not stack exactly
      drift: k.drift ? (Math.random() - 0.5) * 1.2 : 0,   // damage arcs a little sideways as it rises
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
      v.set(f.x + f.jitter + f.drift * s.t, f.y + s.rise, f.z).project(sc.camera);
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
