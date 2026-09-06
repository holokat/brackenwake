// The HUD: gilded frames on near black stone, Cinzel small caps on the
// numbers, and one style sheet shared with the codex through ui_theme.js.
//
// The farm's HUD was art first: a painted wooden frame with three tool cells
// cut into it, which is how five tools ended up stacked on top of each other
// and eating one another's clicks. This one counts its slots in code. TOOLS is
// the only list, the keys are its indices plus one, and if a fifth tool is
// added the row grows instead of overflowing. The ability bar below is built
// the same way from BAR_KEYS, and BAR_SLOTS is its length, never a number
// typed twice. The ornament is CSS on top of that; the counting is unchanged.
//
// WHAT IS HERE (W4 plus U1):
//   pools with numbers top left, red health, blue mana, yellow stamina
//   a portrait plate beside them, which takes the paper doll's canvas if one
//     is handed over and otherwise wears a drawn helm
//   buff and debuff icons with timers under them
//   the target frame under the place name, tier coloured
//   the twelve slot bar with cooldown sweeps, red unaffordable costs, keys
//   the eight slot item bar beside it, keys F5 to F12, with stack counts, a
//     ghost of a stack that has run out, and a gold ring on what you are
//     wearing (item_bar.js owns the rules; this file only draws them)
//   hud.gain(text, kind), the gains ticker bottom right, so a skill going up
//     never sits on top of the label of what you just picked up
//   hud.log(text, kind), bottom left on a faint parchment
//   hud.zone(name, sub), the place name across the upper third when you arrive
//   hud.setDev(on, stats), the dev badge with fps, frame time, draws, triangles
//     and monsters, every one of which main.js already measures
//   hud.update(dt, view)
//
// Everything that was here before is here still and behaves the same way:
// toast, setMaterials, setCoins, setTool, onTool, setPlace, setDev, setHint,
// onBar, log, lines, clearLog, el and dispose. interact.js and shop.js call
// four of those every frame, so this file grows around them rather than
// through them.
//
// The skeleton is built with createElement rather than one innerHTML string,
// so hud.test.mjs can run the real createHud against a small fake document.
// A HUD that could only be checked by eye is a HUD nobody checks.

import { injectTheme, theme, icon, itemGlyph } from './ui_theme.js';
import { abilityIcon } from './icon_art.js';
import { dropTarget } from './windows.js';
import { ITEM_SLOTS, ITEM_KEYS, keyCap as itemKeyCap } from './item_bar.js';
import { baseFor } from '../mmo/items.js';

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

/**
 * The thirteenth cell, and it is NOT one of BAR_KEYS.
 *
 * `14-KALDERA.md`: "A key on the bar (the big slot at the far right, where
 * nothing else may go)." So it is built outside the twelve, drawn to the right
 * of the rail, and `abilities_runtime.js` cannot put an ability in it: its
 * `BAR_SLOTS` is twelve and its `slotForKey` returns -1 for R.
 *
 * WHY R. Every key already spoken for was counted before this one was chosen:
 * `windows.RESERVED_KEYS` is w a s d q e space shift control tab; the window
 * keys are C, B, K, P, V, M, N, Escape and F2; the ability bar is 1 to 0, minus
 * and equals; the item bar is F5 to F12; the tool row shares 1 to 4 with the
 * ability bar; dev is F1 and backquote. R is free, and `hud.test.mjs` and
 * `wyrmsoul.test.mjs` both drive that list rather than take it on trust.
 */
export const WYRMSOUL_KEY = 'r';

/** How long the flash at the end of dragon time takes to fade, in seconds. */
export const FLASH_S = 0.45;

/**
 * The Bond arc, drawn once and re-strung when the number moves.
 *
 * A semicircle of radius 26 over a 62 x 34 box, swept left to right. Its length
 * is pi * r, and the fill is the same path with a dash the length of the arc
 * and an offset that walks it back, which is how an arc fills without a mask.
 */
export const BOND_ARC = { w: 62, h: 34, cx: 31, cy: 30, r: 26 };
export const BOND_ARC_LENGTH = Math.PI * BOND_ARC.r;

/** Pure. The dash offset for a fraction 0..1 of the arc. 0 empty, full at 1. */
export function bondDash(fraction, length = BOND_ARC_LENGTH) {
  const f = clamp(num(fraction), 0, 1);
  return length * (1 - f);
}

/** Pure. The arc's markup at this fraction. One string, so a fake DOM can read it. */
export function bondArcSvg(fraction) {
  const { w, h, cx, cy, r } = BOND_ARC;
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const off = bondDash(fraction).toFixed(2);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`
    + `<path class="edge" d="${d}"/><path class="track" d="${d}"/>`
    + `<path class="fill" d="${d}" stroke-dasharray="${BOND_ARC_LENGTH.toFixed(2)}" stroke-dashoffset="${off}"/>`
    + '</svg>';
}

/**
 * The Wyrmsoul mark: a dragon's eye in gold. A slit pupil inside a lidded
 * almond, drawn rather than painted, so the thirteenth cell is not a letter in
 * a box while it waits for art.
 */
export const WYRMSOUL_MARK = '<svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true">'
  + '<defs><radialGradient id="bw-wyrm-iris" cx="50%" cy="50%" r="50%">'
  + '<stop offset="0%" stop-color="#fff2c8"/><stop offset="55%" stop-color="#f0b93c"/>'
  + '<stop offset="100%" stop-color="#8a5a12"/></radialGradient></defs>'
  // the lidded almond
  + '<path d="M3 20 C11 7 29 7 37 20 C29 33 11 33 3 20 Z" fill="#120d06" stroke="#c9a44a" stroke-width="1.6"/>'
  // the iris
  + '<ellipse cx="20" cy="20" rx="9.5" ry="9.5" fill="url(#bw-wyrm-iris)"/>'
  // the slit
  + '<path d="M20 11 C22.6 15 22.6 25 20 29 C17.4 25 17.4 15 20 11 Z" fill="#140a03"/>'
  // the catchlight, so it reads as wet and alive
  + '<circle cx="16.6" cy="16.2" r="1.7" fill="#fff6dd" opacity=".9"/>'
  // the brow ridge
  + '<path d="M4 17 C12 8 28 8 36 17" fill="none" stroke="#8f6f2a" stroke-width="1.2" opacity=".9"/>'
  + '</svg>';

/**
 * C1: above this much armour burden a bar cell wears an amber corner, so a
 * plated mage sees it without hovering. The same number as
 * abilities_runtime.js's BURDEN_MARK, which is where the bands are decided;
 * it is repeated here rather than imported for the reason BAR_KEYS is (this
 * file draws and does not reach into the runtime), and hud.test.mjs fails if
 * the two ever differ.
 */
export const BURDEN_MARK = 0.25;

/** The amber the burden warning is written in, in the tooltip and on the cell. */
export const BURDEN_AMBER = '#f0a63c';

/** The three pools, in the order 06-ECONOMY-UI.md lists them. */
export const POOLS = [
  { id: 'health', label: 'health', colour: theme.health },
  { id: 'mana', label: 'mana', colour: theme.mana },
  { id: 'stamina', label: 'stamina', colour: theme.stamina },
];

export const LOG_LINES = 8;

/** The log's colours by kind. An unknown kind is a plain line, never an error. */
export const LOG_KINDS = {
  good: '#8ee07a', bad: '#ff8a72', ability: '#cbb6ff',
  gain: '#5dff6a', loot: '#ffd76a', target: '#9fd8ff',
};

/**
 * The zone banner's shape, in seconds: it fades in, holds, and fades out.
 * 06-ECONOMY-UI.md asks for a fade of 0.4 and a hold of 2; the 0.6 out is this
 * file's, and it is here as a number rather than in a CSS transition so that
 * the timing can be measured in node instead of watched.
 */
export const BANNER = { fadeIn: 0.4, hold: 2.0, fadeOut: 0.6 };
export const BANNER_TOTAL = BANNER.fadeIn + BANNER.hold + BANNER.fadeOut;

/**
 * The gains ticker, bottom right, in seconds. A line slides in from the right
 * over `fadeIn`, sits still for `hold`, and fades over `fadeOut`. The three add
 * up to GAIN_TOTAL, which is the three seconds the brief asks for, and they are
 * numbers here rather than a CSS animation so the timing can be measured in
 * node instead of watched.
 */
export const GAIN = { fadeIn: 0.25, hold: 2.15, fadeOut: 0.6, slidePx: 22 };
export const GAIN_TOTAL = GAIN.fadeIn + GAIN.hold + GAIN.fadeOut;
/** More than this on screen at once and the newest are pushed off the bottom. */
export const GAIN_LINES = 6;

/**
 * Pure. Where a gain line is at `t` seconds after it was raised:
 * `{ phase: 'in' | 'held' | 'out' | 'done', opacity, x }`. `x` is how many
 * pixels to the right of home it still sits, so the line arrives rather than
 * appearing.
 */
export function gainAt(t, shape = GAIN) {
  const s = num(t);
  if (s < 0) return { phase: 'in', opacity: 0, x: shape.slidePx };
  if (s < shape.fadeIn) {
    const k = s / shape.fadeIn;
    return { phase: 'in', opacity: k, x: shape.slidePx * (1 - k) };
  }
  const heldUntil = shape.fadeIn + shape.hold;
  if (s < heldUntil) return { phase: 'held', opacity: 1, x: 0 };
  const out = heldUntil + shape.fadeOut;
  if (s < out) return { phase: 'out', opacity: 1 - (s - heldUntil) / shape.fadeOut, x: 0 };
  return { phase: 'done', opacity: 0, x: 0 };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Pure. Where the banner is at `t` seconds after it was raised.
 * `{ phase: 'in' | 'held' | 'out' | 'done', opacity }`.
 */
export function bannerAt(t, shape = BANNER) {
  const s = num(t);
  if (s < 0) return { phase: 'in', opacity: 0 };
  if (s < shape.fadeIn) return { phase: 'in', opacity: s / shape.fadeIn };
  const heldUntil = shape.fadeIn + shape.hold;
  if (s < heldUntil) return { phase: 'held', opacity: 1 };
  const out = shape.fadeIn + shape.hold + shape.fadeOut;
  if (s < out) return { phase: 'out', opacity: 1 - (s - heldUntil) / shape.fadeOut };
  return { phase: 'done', opacity: 0 };
}

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

/** Pure. The dev badge's line, out of whatever numbers were handed over. */
export function devLine(stats) {
  const s = stats || {};
  const parts = ['fly mode'];
  if (Number.isFinite(s.fps)) parts.push(`${Math.round(s.fps)} fps`);
  // main.js sends frameMs alongside fps. A field written and read by nobody is
  // the oldest bug in this project, so it is printed.
  if (Number.isFinite(s.frameMs)) parts.push(`${s.frameMs} ms`);
  if (Number.isFinite(s.draws)) parts.push(`${s.draws} draws`);
  if (Number.isFinite(s.tris)) parts.push(`${Math.round(s.tris / 1000)}k tris`);
  if (Number.isFinite(s.monsters)) parts.push(`${s.monsters} alive`);
  return parts.join('   ');
}

const CSS = `
#bw-hud, #bw-hud * { box-sizing: border-box; }
#bw-hud {
  position: fixed; inset: 0; pointer-events: none; z-index: 40;
  font-family: ${theme.fonts.body}; font-size: 15px; line-height: 1.35;
  color: ${theme.parchment}; text-shadow: 0 1px 3px rgba(0,0,0,.85);
  user-select: none; -webkit-user-select: none;
}
#bw-hud .panel {
  position: relative;
  padding: 7px 12px;
  background: linear-gradient(180deg, rgba(23,19,15,.82), rgba(9,8,6,.86));
  border: 1px solid ${theme.goldDim}aa;
  box-shadow: 0 6px 24px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06);
}
#bw-hud .panel::before, #bw-hud .panel::after {
  content: ''; position: absolute; width: 9px; height: 9px; pointer-events: none;
  border: 1px solid ${theme.gold};
}
#bw-hud .panel::before { left: -1px; top: -1px; border-right: 0; border-bottom: 0; }
#bw-hud .panel::after { right: -1px; bottom: -1px; border-left: 0; border-top: 0; }

#bw-tl { position: absolute; top: 14px; left: 14px; display: flex; gap: 9px; align-items: flex-start; }
#bw-portrait {
  width: 62px; height: 62px; flex: 0 0 auto; overflow: hidden; padding: 0;
  display: flex; align-items: center; justify-content: center;
}
#bw-portrait canvas { width: 100%; height: 100%; display: block; }
#bw-tl-col { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }

#bw-purse { display: flex; gap: 12px; align-items: center; }
#bw-purse .stat { display: inline-flex; gap: 5px; align-items: baseline; }
#bw-purse .stat b {
  font-family: ${theme.fonts.display}; font-weight: 600; font-size: 14px;
  font-variant-numeric: tabular-nums; color: ${theme.parchment};
}
#bw-purse .stat span {
  font-family: ${theme.fonts.display}; opacity: .8; font-size: 9.5px;
  letter-spacing: .16em; text-transform: uppercase; color: ${theme.goldDim};
}
#bw-purse .stat.full b { color: #ffb37a; }

#bw-pools { display: none; flex-direction: column; gap: 4px; width: 236px; }
#bw-pools.on { display: flex; }
#bw-pools .pool {
  position: relative; height: 17px; overflow: hidden;
  background: rgba(0,0,0,.62); border: 1px solid ${theme.goldDim}aa;
  box-shadow: inset 0 0 10px rgba(0,0,0,.7);
}
#bw-pools .pool .fill {
  position: absolute; inset: 0 auto 0 0; width: 0%; transition: width .12s linear;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.28), inset 0 -6px 10px rgba(0,0,0,.35);
}
#bw-pools .pool .n {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: ${theme.fonts.display}; font-size: 11px; font-weight: 600;
  font-variant-numeric: tabular-nums; letter-spacing: .06em;
}

#bw-auras { display: flex; gap: 4px; flex-wrap: wrap; width: 236px; }
#bw-auras .aura {
  position: relative; width: 27px; height: 27px;
  background: rgba(18,20,24,.8); border: 1px solid rgba(140,200,140,.6);
  font-family: ${theme.fonts.display}; font-size: 9px; line-height: 1.05; padding: 2px; overflow: hidden;
}
#bw-auras .aura.debuff { border-color: rgba(232,120,110,.7); }
#bw-auras .aura .t {
  position: absolute; right: 1px; bottom: 0; font-size: 9px; font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* --- the Bond, beside the pools -------------------------------------------
   A long gold arc rather than a fourth bar, because the Bond is not a pool:
   it is not spent by walking about and it does not come back on its own. The
   arc is one SVG path with a dash offset for the fill, so the "long gold arc"
   of 14-KALDERA is a real arc and not a rectangle with a rounded end. */
#bw-bond { display: none; width: 236px; align-items: center; gap: 8px; }
#bw-bond.on { display: flex; }
#bw-bond .arc { width: 62px; height: 34px; flex: none; }
#bw-bond .arc .track { fill: none; stroke: rgba(0,0,0,.62); stroke-width: 7; stroke-linecap: round; }
#bw-bond .arc .edge { fill: none; stroke: ${theme.goldDim}; stroke-width: 8.5; stroke-linecap: round; opacity: .75; }
#bw-bond .arc .fill { fill: none; stroke: ${theme.gold}; stroke-width: 6; stroke-linecap: round;
  transition: stroke-dashoffset .16s linear; }
#bw-bond .txt { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
#bw-bond .nm {
  font-family: ${theme.fonts.display}; font-size: 12px; font-weight: 600; letter-spacing: .05em;
  color: ${theme.parchment}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#bw-bond .n {
  font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .16em;
  text-transform: uppercase; color: ${theme.goldDim}; font-variant-numeric: tabular-nums;
}
/* full: the arc glows and the name goes bright, which is the one thing that
   says the key at the end of the bar will now answer */
#bw-bond.full .arc .fill { stroke: ${theme.goldBright}; filter: drop-shadow(0 0 6px rgba(242,220,156,.85)); }
#bw-bond.full .nm { color: ${theme.goldBright}; }
#bw-bond.full .n { color: ${theme.goldBright}; }

/* --- the thirteenth cell, at the far right of the rail --------------------- */
#bw-wyrm {
  position: relative; width: 46px; height: 46px; flex: none; align-self: flex-end;
  background: rgba(10,8,6,.86); border: 1px solid ${theme.goldDim};
  cursor: pointer; opacity: .5; filter: grayscale(.7); pointer-events: auto;
}
#bw-wyrm.lit { opacity: 1; filter: none; border-color: ${theme.goldBright};
  box-shadow: 0 0 0 1px ${theme.goldBright} inset, 0 0 18px rgba(242,220,156,.55); }
#bw-wyrm.up { border-color: #ffb04a; box-shadow: 0 0 0 2px #ffb04a inset, 0 0 26px rgba(255,140,40,.8); }
#bw-wyrm .mark { position: absolute; inset: 3px; }
#bw-wyrm .k {
  position: absolute; top: 1px; left: 3px; font-family: ${theme.fonts.display};
  font-size: 9px; color: ${theme.gold}; text-shadow: 0 1px 2px #000;
}
#bw-wyrm .t {
  position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
  font-family: ${theme.fonts.display}; font-size: 16px; font-weight: 700; color: #ffe6b0;
  text-shadow: 0 0 8px #000; font-variant-numeric: tabular-nums;
}
#bw-wyrm.up .t { display: flex; }

/* --- the screen, while the world is slow ----------------------------------
   Amber at the edges and clear in the middle: a fixed div with one radial
   gradient, pointer-events off, under nothing and over everything else. */
#bw-wyrmshell {
  position: fixed; inset: 0; pointer-events: none; z-index: 40; opacity: 0;
  transition: opacity .18s linear;
  background: radial-gradient(ellipse at 50% 50%,
    rgba(255,150,40,0) 32%, rgba(255,130,30,.16) 62%, rgba(180,60,10,.5) 100%);
}
#bw-wyrmshell.on { opacity: 1; }
/* the flash at the end: one white sheet, faded out by hud.update */
#bw-wyrmflash {
  position: fixed; inset: 0; pointer-events: none; z-index: 41; opacity: 0;
  background: radial-gradient(ellipse at 50% 50%, rgba(255,238,200,.85) 0%, rgba(255,170,60,.35) 55%, rgba(255,170,60,0) 100%);
}

#bw-tc { position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 7px; max-width: 60vw; }
#bw-place {
  font-family: ${theme.fonts.display}; font-size: 13px; font-weight: 600;
  letter-spacing: .22em; text-transform: uppercase; color: ${theme.gold}; text-align: center;
}
#bw-target { display: none; width: 236px; }
#bw-target.on { display: block; }
#bw-target .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
#bw-target .nm { font-family: ${theme.fonts.display}; font-size: 13px; font-weight: 600; letter-spacing: .04em; }
#bw-target .tr { font-family: ${theme.fonts.display}; font-size: 9px; letter-spacing: .16em; text-transform: uppercase; opacity: .9; }
#bw-target .bar {
  position: relative; margin-top: 5px; height: 13px; overflow: hidden;
  background: rgba(0,0,0,.6); border: 1px solid ${theme.goldDim}aa;
}
#bw-target .bar .fill { position: absolute; inset: 0 auto 0 0; width: 100%; background: ${theme.health}; }
#bw-target .bar .n {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: ${theme.fonts.display}; font-size: 10px; font-weight: 600; font-variant-numeric: tabular-nums;
}

/* the zone banner: the place name across the upper third */
#bw-zone {
  position: absolute; left: 50%; top: 22%; transform: translateX(-50%);
  display: none; flex-direction: column; align-items: center; gap: 8px;
  text-align: center; opacity: 0; pointer-events: none; width: min(760px, 84vw);
}
#bw-zone.on { display: flex; }
#bw-zone .zn {
  font-family: ${theme.fonts.display}; font-size: 44px; font-weight: 700;
  letter-spacing: .1em; color: ${theme.parchment};
  text-shadow: 0 2px 26px rgba(0,0,0,.95), 0 0 40px rgba(201,164,74,.35);
}
#bw-zone .zr {
  width: 62%; height: 1px;
  background: linear-gradient(90deg, transparent, ${theme.gold}, transparent);
}
#bw-zone .zs {
  font-family: ${theme.fonts.display}; font-size: 13px; letter-spacing: .3em;
  text-transform: uppercase; color: ${theme.gold};
}

/* #bw-hud #bw-dev, not #bw-dev: the .panel rule above is more specific than an
   id alone and was winning position: relative, which put the badge in flow across
   the top of the HUD over the purse and the counters */
#bw-hud #bw-dev {
  position: absolute; top: 14px; right: 14px; display: none;
  font-family: ${theme.fonts.display}; font-size: 10.5px; letter-spacing: .14em;
  text-transform: uppercase; color: #ffd479; white-space: pre;
  border-color: rgba(255,212,121,.5);
  pointer-events: auto; cursor: pointer;
}
#bw-hud #bw-dev:hover { border-color: rgba(255,212,121,.9); }
#bw-hud #bw-dev.on { display: block; }
#bw-hint {
  position: absolute; left: 50%; bottom: 148px; transform: translateX(-50%);
  font-size: 15px; opacity: 0; transition: opacity .12s ease; white-space: nowrap;
  color: ${theme.parchment};
}
#bw-hint.on { opacity: 1; }

/* The nameplate over the thing you are looking at. One div, moved by
   transform every frame from the projection targeting.js does, so nothing
   here reflows. The colour is the con colour and comes in from the outside;
   the skull is drawn in this file and hidden unless the name is red or
   purple. Pointer events off: the plate must never eat a click meant for the
   body under it, which is the bug the farm's tool row shipped. */
#bw-plate {
  position: absolute; left: 0; top: 0; display: none; align-items: center; gap: 5px;
  pointer-events: none; z-index: 29; white-space: nowrap;
  transform: translate(-50%, -100%);
}
#bw-plate.on { display: flex; }
#bw-plate .sk { display: none; line-height: 0; }
#bw-plate.skull .sk { display: block; }
#bw-plate .nm {
  font-family: ${theme.fonts.display}; font-size: 13px; font-weight: 600; letter-spacing: .04em;
  text-shadow: 0 2px 0 #000, 0 0 4px #000, 0 0 10px #0009;
}
#bw-plate .wd {
  font-family: ${theme.fonts.display}; font-size: 8.5px; letter-spacing: .16em;
  text-transform: uppercase; opacity: .85;
  text-shadow: 0 1px 0 #000, 0 0 4px #000;
}
#bw-tools {
  position: absolute; left: 50%; bottom: 88px; transform: translateX(-50%);
  display: flex; gap: 8px; pointer-events: auto;
}
#bw-tools .slot {
  width: 66px; padding: 5px 0 6px; text-align: center; cursor: pointer;
  background: linear-gradient(180deg, rgba(23,19,15,.82), rgba(9,8,6,.86));
  border: 1px solid ${theme.goldDim}aa;
}
#bw-tools .slot .k { display: block; font-family: ${theme.fonts.display}; font-size: 9.5px; color: ${theme.goldDim}; }
#bw-tools .slot .n { display: block; font-family: ${theme.fonts.display}; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; }
#bw-tools .slot.locked { opacity: .34; cursor: default; }
#bw-tools .slot.active { border-color: ${theme.gold}; box-shadow: 0 0 0 1px ${theme.gold} inset, 0 0 14px rgba(201,164,74,.35); }

/* the two bars sit side by side on one centred rail: the twelve you know on
   the left, the eight you carry on the right, with a gold rule between them */
#bw-bars {
  position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%);
  display: flex; align-items: flex-end; gap: 12px; pointer-events: none;
}
#bw-bars .rail { width: 1px; align-self: stretch; margin-bottom: 2px;
  background: linear-gradient(180deg, transparent, ${theme.gold}, transparent); }
#bw-bars .rail.off { display: none; }
#bw-bar {
  display: flex; gap: 5px; pointer-events: auto;
}
#bw-bar .cell {
  position: relative; width: 48px; height: 48px; overflow: hidden; cursor: pointer;
  background: linear-gradient(160deg, rgba(40,33,24,.9), rgba(9,8,6,.92));
  border: 1px solid ${theme.goldDim}aa;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 4px 14px rgba(0,0,0,.5);
}
#bw-bar .cell.empty { opacity: .4; cursor: default; }
#bw-bar .cell.casting { border-color: #cbb6ff; box-shadow: 0 0 0 1px #cbb6ff inset, 0 0 16px rgba(203,182,255,.5); }
/* G2: the weapon rule. A cell you cannot fire because of what is in your hands
   is greyed rather than left looking ready. The reason is in the title. */
#bw-bar .cell.unusable { opacity: .5; filter: grayscale(1); }
/* C1: the armour rule. A spell your plate will fumble more often than not is
   still pressable, so it is not greyed; it wears an amber corner instead, and
   the tooltip says how much slower and how often it fizzles. */
#bw-bar .cell.burdened::after {
  content: ''; position: absolute; top: 0; right: 0; z-index: 2;
  border-top: 9px solid ${BURDEN_AMBER}; border-left: 9px solid transparent;
  filter: drop-shadow(0 0 2px rgba(0,0,0,.8));
}
#bw-bar .cell .art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: none; pointer-events: none; z-index: 0; }
#bw-bar .cell .k, #bw-bar .cell .n, #bw-bar .cell .c, #bw-bar .cell .sweep, #bw-bar .cell .cd { z-index: 1; }
#bw-bar .cell.has-art .art { display: block; }
#bw-bar .cell.has-art .n { display: none; }
#bw-abtip {
  position: fixed; z-index: 60; pointer-events: none; display: flex; gap: 12px; align-items: flex-start;
  width: max-content; max-width: min(340px, calc(100vw - 16px)); padding: 11px 13px 12px;
  background: linear-gradient(180deg, rgba(38,31,22,.97), rgba(12,10,7,.98));
  border: 1px solid ${theme.gold}; outline: 1px solid rgba(0,0,0,.6);
  box-shadow: 0 16px 48px rgba(0,0,0,.75), inset 0 0 28px rgba(0,0,0,.55);
  font-family: ${theme.fonts.body}; color: ${theme.parchment};
}
#bw-abtip[hidden] { display: none; }
#bw-abtip .art { width: 56px; height: 56px; flex: none; object-fit: cover; border: 1px solid ${theme.goldDim}; background: #000; }
#bw-abtip .art[hidden] { display: none; }
#bw-abtip .body { min-width: 0; }
#bw-abtip .head { display: flex; align-items: baseline; gap: 10px; justify-content: space-between; }
#bw-abtip .nm { font-family: ${theme.fonts.display}; font-size: 15px; font-weight: 600; letter-spacing: .04em; color: ${theme.goldBright}; }
#bw-abtip .key { font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; color: ${theme.goldDim}; white-space: nowrap; }
#bw-abtip .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 7px; }
#bw-abtip .chips:empty { display: none; }
#bw-abtip .chip { font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase;
  padding: 2px 6px; color: ${theme.parchmentDim}; background: rgba(0,0,0,.45); border: 1px solid ${theme.goldDim}55; }
#bw-abtip .desc { font-size: 15px; line-height: 1.35; color: ${theme.parchment}; }
#bw-abtip .burden { font-size: 14px; line-height: 1.3; color: ${BURDEN_AMBER}; margin-top: 6px; }
#bw-abtip .burden[hidden] { display: none; }
#bw-abtip .reason { font-size: 14px; font-style: italic; line-height: 1.3; color: #ff9a80; margin-top: 6px; }
#bw-abtip .reason[hidden] { display: none; }
#bw-bar .cell.has-art .k, #bw-bar .cell.has-art .c { text-shadow: 0 1px 2px #000, 0 0 3px #000; }
#bw-bar .cell .k { position: absolute; top: 1px; left: 3px; font-family: ${theme.fonts.display}; font-size: 9px; color: ${theme.gold}; }
#bw-bar .cell .n {
  position: absolute; left: 3px; right: 3px; top: 14px; font-size: 10px; line-height: 1.08;
  text-align: center; word-break: break-word; color: ${theme.parchment};
}
#bw-bar .cell .c {
  position: absolute; right: 3px; bottom: 1px; font-family: ${theme.fonts.display};
  font-size: 10px; font-weight: 600; font-variant-numeric: tabular-nums; color: #cfe3ff;
}
#bw-bar .cell .c.poor { color: #ff6a58; }
#bw-bar .cell .sweep { position: absolute; left: 0; right: 0; bottom: 0; height: 0%;
  background: rgba(6,8,12,.7); pointer-events: none; }
#bw-bar .cell .cd { position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
  font-family: ${theme.fonts.display}; font-size: 16px; font-weight: 700;
  font-variant-numeric: tabular-nums; color: #fff; }
#bw-bar .cell .cd.on { display: flex; }

#bw-items { display: flex; gap: 5px; pointer-events: auto; }
#bw-items .icell {
  position: relative; width: 44px; height: 44px; overflow: hidden; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, rgba(34,29,21,.9), rgba(9,8,6,.92));
  border: 1px solid ${theme.goldDim}aa;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 4px 14px rgba(0,0,0,.5);
}
#bw-items .icell.empty { opacity: .34; cursor: default; }
#bw-items .icell.ghost { opacity: .42; }
#bw-items .icell.ghost .g { filter: grayscale(1); }
#bw-items .icell.worn { border-color: ${theme.gold}; box-shadow: 0 0 0 1px ${theme.gold} inset, 0 0 12px rgba(201,164,74,.4); }
#bw-items .icell.bw-drop-hot { border-color: ${theme.goldBright}; box-shadow: 0 0 0 1px ${theme.goldBright} inset; }
#bw-items .icell .k {
  position: absolute; top: 1px; left: 3px; font-family: ${theme.fonts.display};
  font-size: 8px; letter-spacing: .06em; color: ${theme.gold};
}
#bw-items .icell .g { display: flex; align-items: center; justify-content: center; margin-top: 4px; }
#bw-items .icell .n {
  position: absolute; right: 2px; bottom: 0; font-family: ${theme.fonts.display};
  font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
  color: ${theme.parchment}; text-shadow: 0 1px 3px #000;
}
#bw-items .icell .w {
  position: absolute; left: 0; right: 0; bottom: 0; text-align: center;
  font-family: ${theme.fonts.display}; font-size: 7.5px; letter-spacing: .14em;
  text-transform: uppercase; color: ${theme.goldBright}; background: rgba(0,0,0,.6);
}

/* the gains ticker: skills and stats going up, bottom RIGHT, because the world
   writes what you just picked up bottom left and the two used to overlap */
#bw-gains {
  position: absolute; right: 14px; bottom: 96px;
  display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 3px;
  pointer-events: none; text-align: right;
}
#bw-gains .gl {
  font-family: ${theme.fonts.display}; font-size: calc(22px * var(--gs, 1)); font-weight: 700;
  letter-spacing: .04em; color: ${LOG_KINDS.gain};
  text-shadow: 0 1px 4px rgba(0,0,0,.95), 0 0 12px rgba(93,255,106,.35);
  white-space: nowrap;
}
#bw-gains .gl.stat { color: #ffd76a; text-shadow: 0 1px 4px rgba(0,0,0,.95), 0 0 12px rgba(255,215,106,.35); }

#bw-bl { position: absolute; left: 14px; bottom: 16px; width: min(400px, 42vw);
  display: flex; flex-direction: column; gap: 7px; }
#bw-toasts { display: flex; flex-direction: column-reverse; gap: 6px; }
#bw-toasts .t {
  padding: 8px 11px; font-size: 15px; line-height: 1.35;
  background: linear-gradient(180deg, rgba(23,19,15,.85), rgba(9,8,6,.88));
  border: 1px solid ${theme.goldDim}aa;
  animation: bw-in .16s ease-out; transition: opacity .35s ease, transform .35s ease;
}
#bw-toasts .t.good { border-color: rgba(140,220,140,.6); }
#bw-toasts .t.bad  { border-color: rgba(232,140,120,.65); }
#bw-toasts .t.out { opacity: 0; transform: translateY(6px); }
#bw-log {
  display: flex; flex-direction: column; gap: 1px; font-size: 14px; line-height: 1.35;
  padding: 7px 10px;
  background: linear-gradient(180deg, rgba(26,22,16,.55), rgba(10,8,6,.62));
  border-left: 2px solid ${theme.goldDim}88;
}
#bw-log .l { opacity: .95; }
@keyframes bw-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
`;

const TOAST_MS = 4200;
const TOAST_MAX = 5;

/**
 * The skull that goes before a red or a purple name. Drawn here rather than
 * taken from ui_theme's ICONS, which has no skull: a cranium, two sockets, a
 * nose and a jaw with three teeth, at 24 units so it sits in the same box as
 * every other mark in the interface.
 */
export const SKULL_MARK = `<svg class="bw-skull" viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
  <path d="M12 2 C6.9 2 3.4 5.4 3.4 10.1 c0 2.7 1.2 4.6 2.6 5.8 .6 .5 .9 1 .9 1.8 V19 c0 .7 .5 1.2 1.2 1.2 h1.3 V17.9 h1.4 v2.3 h2.4 v-2.3 h1.4 v2.3 h1.3 c.7 0 1.2 -.5 1.2 -1.2 v-1.3 c0 -.8 .3 -1.3 .9 -1.8 1.4 -1.2 2.6 -3.1 2.6 -5.8 C20.6 5.4 17.1 2 12 2 Z
    M8.4 8.6 a2.1 2.1 0 1 1 0 4.2 a2.1 2.1 0 0 1 0 -4.2 Z
    M15.6 8.6 a2.1 2.1 0 1 1 0 4.2 a2.1 2.1 0 0 1 0 -4.2 Z
    M12 12.6 l1.1 2.1 h-2.2 z" fill-rule="evenodd"/>
</svg>`;

export function createHud(root) {
  injectTheme(document);
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

  const el = mk('div', 'bw-hud', 'bw-ui');

  // top left: the portrait plate, then the purse, pools and auras beside it
  const topLeft = add(el, mk('div', 'bw-tl'));
  const portrait = add(topLeft, mk('div', 'bw-portrait', 'panel'));
  portrait.innerHTML = icon('helm', theme.goldDim, 34);
  const leftCol = add(topLeft, mk('div', 'bw-tl-col'));
  const purse = add(leftCol, mk('div', 'bw-purse', 'panel'));
  const poolBox = add(leftCol, mk('div', 'bw-pools'));
  // the Bond, beside the pools, with the dragon's name over it (14-KALDERA s3)
  const bondBox = add(leftCol, mk('div', 'bw-bond'));
  // the arc is one innerHTML string, re-strung only when the rounded number
  // moves, so nothing here allocates an SVG node sixty times a second
  const bondArc = add(bondBox, mk('div', null, 'arc'));
  const bondTxt = add(bondBox, mk('div', null, 'txt'));
  const bondName = add(bondTxt, mk('div', null, 'nm'));
  const bondNum = add(bondTxt, mk('div', null, 'n'));
  const auraBox = add(leftCol, mk('div', 'bw-auras'));

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
  devBadge.title = 'the dev bench: tour, warps, the lab';
  let onDevClick = null;
  devBadge.addEventListener('click', () => { if (onDevClick) onDevClick(); });
  const hint = add(el, mk('div', 'bw-hint'));
  // the nameplate over the current target, moved by targeting.js's projection
  const plate = add(el, mk('div', 'bw-plate'));
  const plateSkull = add(plate, mk('div', null, 'sk'));
  plateSkull.innerHTML = SKULL_MARK;
  const plateName = add(plate, mk('div', null, 'nm'));
  const plateWord = add(plate, mk('div', null, 'wd'));
  const toolRow = add(el, mk('div', 'bw-tools'));
  // one rail, two bars: what you know, then what you carry
  const barRail = add(el, mk('div', 'bw-bars'));
  const barRow = add(barRail, mk('div', 'bw-bar'));
  const railMark = add(barRail, mk('div', null, 'rail off'));
  const itemRow = add(barRail, mk('div', 'bw-items'));
  // the thirteenth cell: outside BAR_KEYS, at the far right, where nothing else
  // may go. Built once, always present, dim until the Bond is full.
  const wyrmCell = add(barRail, mk('div', 'bw-wyrm'));
  const wyrmMark = add(wyrmCell, mk('div', null, 'mark'));
  wyrmMark.innerHTML = WYRMSOUL_MARK;
  const wyrmKey = add(wyrmCell, mk('span', null, 'k'));
  wyrmKey.textContent = String(WYRMSOUL_KEY).toUpperCase();
  const wyrmTimer = add(wyrmCell, mk('div', null, 't'));
  // the tooltip record for the thirteenth cell. `hoverTip` and `showAbTip` are
  // function declarations and so are already hoisted here; `tipOwner` is only
  // read inside the handlers, which fire long after it exists.
  const wyrmRec = { el: wyrmCell, key: WYRMSOUL_KEY, wyrm: true, tip: '', last: '' };
  let onWyrmPick = null;
  wyrmCell.addEventListener('click', () => { if (onWyrmPick) onWyrmPick(); });

  const gainBox = add(el, mk('div', 'bw-gains'));

  const bottomLeft = add(el, mk('div', 'bw-bl'));
  const toasts = add(bottomLeft, mk('div', 'bw-toasts'));
  const logBox = add(bottomLeft, mk('div', 'bw-log'));

  // dragon time: the amber edges and the flash at the end. Fixed to the
  // viewport rather than to the HUD, because they are the screen and not a
  // widget on it.
  const wyrmShell = add(el, mk('div', 'bw-wyrmshell'));
  const wyrmFlash = add(el, mk('div', 'bw-wyrmflash'));

  // the zone banner, last so it sits over everything
  const zoneBox = add(el, mk('div', 'bw-zone'));
  const zoneName = add(zoneBox, mk('div', null, 'zn'));
  const zoneRule = add(zoneBox, mk('div', null, 'zr'));
  const zoneSub = add(zoneBox, mk('div', null, 'zs'));

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
  /** An <img>'s src, set or cleared, on a real element or the tests' fake one. */
  function setArt(img, src) {
    if (!img) return;
    if (src) img.src = src;
    else if (typeof img.removeAttribute === 'function') img.removeAttribute('src');
    else img.src = '';
  }

  // --- the bar tooltip ---------------------------------------------------------
  // One panel for both bars, anchored above the cell under the pointer rather
  // than riding the cursor, so it never covers the bar and never leaves the
  // screen. An ability gets its painting, name, key, cost, cooldown, cast and
  // reach, the sentence that explains it, and in red the reason it cannot fire.
  // An item gets its name and count. The browser's own title tooltip is not
  // used on these cells at all.
  const abTip = add(root, mk('div', 'bw-abtip'));
  abTip.hidden = true;
  const tipArt = add(abTip, mk('img', null, 'art')); tipArt.alt = ''; tipArt.draggable = false;
  const tipBody = add(abTip, mk('div', null, 'body'));
  const tipHead = add(tipBody, mk('div', null, 'head'));
  const tipName = add(tipHead, mk('div', null, 'nm'));
  const tipKey = add(tipHead, mk('div', null, 'key'));
  const tipChips = add(tipBody, mk('div', null, 'chips'));
  const tipDesc = add(tipBody, mk('div', null, 'desc'));
  // C1: what the armour on your back does to this spell, in amber, under the
  // description and above the red refusal. A spell only: barView leaves it
  // empty for everything else, and for a Chivalry row, which casts in plate.
  const tipBurden = add(tipBody, mk('div', null, 'burden'));
  const tipReason = add(tipBody, mk('div', null, 'reason'));
  let tipOwner = null;

  /** Pure. The chips a bar tooltip shows for an ability, in reading order. */
  function abilityChips(a) {
    const out = [];
    const cost = a.cost || {};
    if (cost.stamina) out.push(`${cost.stamina} stamina`);
    if (cost.mana) out.push(`${cost.mana} mana`);
    if (cost.item) out.push(`${cost.count ?? 1} ${String(cost.item).replace(/_/g, ' ')}`);
    if (a.cooldown) out.push(`${a.cooldown} s cooldown`);
    if (a.castTime) out.push(`${a.castTime} s cast${a.rooted ? ', rooted' : ''}`);
    if (Number.isFinite(a.range) && a.range > 0) out.push(`${a.range} m`);
    return out;
  }

  function showAbTip(c) {
    tipOwner = c;
    const a = c.ability;
    if (a) {
      const src = abilityIcon(a.id);
      setArt(tipArt, src); tipArt.hidden = !src;
      tipName.textContent = a.name;
      tipKey.textContent = c.key ? `key ${KEY_LABELS[c.key] || c.key}` : '';
      tipChips.textContent = '';
      for (const t of abilityChips(a)) add(tipChips, mk('span', null, 'chip')).textContent = t;
      tipDesc.textContent = a.description || '';
      tipBurden.textContent = c.burden || '';
      tipBurden.hidden = !c.burden;
      tipReason.textContent = c.reason || '';
      tipReason.hidden = !c.reason;
    } else if (c.wyrm) {
      // The thirteenth cell's card, in the same shape as an ability's: the
      // name, the key, the chips, what it is, which realms have given something
      // back, and in red the reason it will not answer right now.
      const w = c.wyrmTip || {};
      setArt(tipArt, null); tipArt.hidden = true;
      tipName.textContent = w.name || 'Wyrmsoul';
      tipKey.textContent = `key ${String(WYRMSOUL_KEY).toUpperCase()}`;
      tipChips.textContent = '';
      for (const t of (w.chips || [])) add(tipChips, mk('span', null, 'chip')).textContent = t;
      tipDesc.textContent = `${w.head || ''}${w.heldLine ? ` ${w.heldLine}` : ''}`;
      tipBurden.textContent = w.tired || '';
      tipBurden.hidden = !w.tired;
      tipReason.textContent = w.reason || '';
      tipReason.hidden = !w.reason;
    } else if (c.item) {
      setArt(tipArt, null); tipArt.hidden = true;
      tipName.textContent = c.item.name || '';
      tipKey.textContent = c.key || '';
      tipChips.textContent = '';
      tipDesc.textContent = c.tip || '';
      tipBurden.textContent = ''; tipBurden.hidden = true;
      tipReason.textContent = ''; tipReason.hidden = true;
    } else { hideAbTip(); return; }
    abTip.hidden = false;
    placeAbTip(c.el);
  }
  function hideAbTip() { tipOwner = null; abTip.hidden = true; }
  /** Above the cell, centred on it, kept inside the viewport with a hand's margin. */
  function placeAbTip(cell) {
    if (typeof cell.getBoundingClientRect !== 'function' || typeof window === 'undefined') return;
    const r = cell.getBoundingClientRect();
    const w = abTip.offsetWidth || 260, h = abTip.offsetHeight || 120;
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 720;
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(8, Math.min(vw - w - 8, x));
    let y = r.top - h - 10;
    if (y < 8) y = Math.min(vh - h - 8, r.bottom + 10);
    abTip.style.left = `${Math.round(x)}px`;
    abTip.style.top = `${Math.round(y)}px`;
  }
  function hoverTip(rec) {
    const el = rec.el;
    if (!el.addEventListener) return;
    el.addEventListener('pointerenter', () => { if (rec.ability || rec.item || rec.wyrm) showAbTip(rec); });
    el.addEventListener('pointerleave', () => { if (tipOwner === rec) hideAbTip(); });
  }

  const cells = BAR_KEYS.map((key, i) => {
    const c = mk('div', null, 'cell empty');
    c.dataset.slot = String(i);
    const k = add(c, mk('span', null, 'k')); k.textContent = KEY_LABELS[key] || key;
    const n = add(c, mk('span', null, 'n'));
    const cost = add(c, mk('span', null, 'c'));
    const sw = add(c, mk('div', null, 'sweep'));
    const cd = add(c, mk('div', null, 'cd'));
    // the painting goes in last so the cap, name, cost, sweep and timer keep
    // their places as children (the tests and the CSS count on the order); it
    // sits under them by z-index
    const art = add(c, mk('img', null, 'art'));
    art.alt = ''; art.draggable = false;
    c.addEventListener('click', () => {
      if (c.classList.contains('empty')) return;
      if (onBarPick) onBarPick(i);
    });
    barRow.appendChild(c);
    const rec = { el: c, art, name: n, cost, sweep: sw, cd, key, last: null, tip: null, ability: null, reason: '', burden: '' };
    hoverTip(rec);
    return rec;
  });

  hoverTip(wyrmRec);

  // one cell per item slot, built once from item_bar.js's own list, so the two
  // files can never disagree about how many there are.
  let onItemPick = null;
  let onItemDropped = null;
  const itemCells = ITEM_KEYS.map((key, i) => {
    const c = mk('div', null, 'icell empty');
    c.dataset.slot = String(i);
    const k = add(c, mk('span', null, 'k')); k.textContent = itemKeyCap(key);
    const g = add(c, mk('div', null, 'g'));
    const n = add(c, mk('span', null, 'n'));
    const w = add(c, mk('span', null, 'w'));
    w.style.display = 'none';
    c.addEventListener('click', () => { if (onItemPick) onItemPick(i, 'use'); });
    c.addEventListener('contextmenu', (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (onItemPick) onItemPick(i, 'clear');
    });
    // the pack grid and the paper doll both hand over `{ pack: i }` or
    // `{ slot: 'mainHand' }` under the same mime; item_bar.assign reads both
    dropTarget(c, (payload) => { if (onItemDropped) onItemDropped(i, payload); });
    itemRow.appendChild(c);
    const rec = { el: c, glyph: g, count: n, worn: w, key, last: '' };
    hoverTip(rec);
    return rec;
  });

  let coins = 0;
  let mats = { wood: 0, stone: 0, ore: 0 };
  let caps = { wood: 150, stone: 150, ore: 150 };

  function drawPurse() {
    const parts = [`<span class="stat"><b>${coins}</b><span>gold</span></span>`];
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
    tName.style.color = t.colour || theme.parchment;
    tTier.textContent = t.word || '';
    tTier.style.color = t.colour || theme.parchment;
    tFill.style.width = `${(clamp(num(t.fraction), 0, 1) * 100).toFixed(1)}%`;
    tNum.textContent = `${Math.round(num(t.health))} / ${Math.round(num(t.maxHealth))}`;
  }

  // --- the nameplate over the target -----------------------------------------
  //
  // targeting.js does the projecting, because the camera is its own and the
  // maths is measured in its suite; this file only paints what it is handed.
  // `p` is { name, colour, word, skull, x, y } in pixels from the top left of
  // the HUD, or null for "there is nothing to name".
  //
  // The text is re-strung only when the words change, so a plate that is only
  // moving costs one transform a frame and no DOM writes.
  let plateState = null;
  let plateStamp = '';

  function drawNameplate(p) {
    if (!p || !p.name) {
      plate.classList.remove('on');
      plateState = null; plateStamp = '';
      return null;
    }
    const colour = p.colour || theme.parchment;
    const stamp = `${p.name}|${colour}|${p.word || ''}|${p.skull ? 1 : 0}`;
    if (stamp !== plateStamp) {
      plateStamp = stamp;
      plateName.textContent = p.name;
      plateName.style.color = colour;
      plateWord.textContent = p.word || '';
      plateWord.style.color = colour;
      plateSkull.style.color = colour;
      plate.classList.toggle('skull', !!p.skull);
    }
    plate.style.transform = `translate(${Math.round(num(p.x))}px,${Math.round(num(p.y))}px) translate(-50%,-100%)`;
    plate.classList.add('on');
    plateState = { ...p, colour };
    return plateState;
  }

  // --- the Bond, and the thirteenth cell -------------------------------------
  //
  // Both are driven by the dragon system (`app/systems/dragon.js`), which runs
  // AFTER the fight and BEFORE this file's `update`, so what the Bond did this
  // frame is drawn this frame and not the next one.

  let bondState = { value: 0, name: null, callable: false, shown: false };
  let bondLast = '';

  function drawBond() {
    bondBox.classList.toggle('on', !!bondState.shown);
    if (!bondState.shown) return;
    const v = clamp(num(bondState.value), 0, 100);
    const full = v >= 100;
    const name = bondState.name || 'the hatchling';
    const stamp = `${Math.round(v)}|${name}|${full ? 1 : 0}`;
    if (stamp === bondLast) return;
    bondLast = stamp;
    bondArc.innerHTML = bondArcSvg(v / 100);
    bondName.textContent = name;
    bondNum.textContent = full ? `bond ${Math.round(v)} - wyrmsoul` : `bond ${Math.round(v)}`;
    bondBox.classList.toggle('full', full);
  }

  let wyrmState = { callable: false, active: false, left: 0, reason: '', tip: null };
  let wyrmLast = '';
  let flash = 0;

  function drawWyrm() {
    const stamp = `${wyrmState.callable ? 1 : 0}|${wyrmState.active ? 1 : 0}|${wyrmState.left > 0 ? wyrmState.left.toFixed(1) : ''}`;
    if (stamp !== wyrmLast) {
      wyrmLast = stamp;
      wyrmCell.className = 'bw-wyrm' + (wyrmState.callable ? ' lit' : '') + (wyrmState.active ? ' up' : '');
      wyrmTimer.textContent = wyrmState.active && wyrmState.left > 0 ? timerLabel(wyrmState.left) : '';
    }
    wyrmShell.classList.toggle('on', !!wyrmState.active);
  }

  /** Where the flash is, so the fade is a measured number and not a CSS guess. */
  function drawFlash() {
    wyrmFlash.style.opacity = flash > 0 ? flash.toFixed(3) : '0';
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
          setArt(c.art, null); c.hasArt = false; c.tip = null; c.ability = null;
          c.reason = ''; c.burden = '';
          c.name.textContent = ''; c.cost.textContent = '';
          if (tipOwner === c) hideAbTip();
          c.sweep.style.height = '0%'; c.cd.className = 'cd'; c.cd.textContent = '';
          c.last = null;
        }
        continue;
      }
      if (c.last !== ability.id) {
        // the painted icon fills the cell and the name becomes a caption; a
        // cell with no painting keeps the name in the middle as before
        const src = abilityIcon(ability.id);
        setArt(c.art, src);
        c.hasArt = !!src;
        c.name.textContent = ability.name;
        c.cost.textContent = costLabel(ability);
        c.last = ability.id;
        c.tip = null;
      }
      // G2: what is in your hands can refuse an ability, and the reason is the
      // sentence to show. It changes as you draw and sheathe, so the title is
      // rebuilt when it changes rather than once when the slot was filled.
      // C1: and what your armour does to it, which changes as you dress, so
      // the burden line is part of the key that decides a rebuild too.
      const burdenLine = e.burdenText || '';
      const tip = `${ability.name}. ${ability.description || ''}${burdenLine ? `\n${burdenLine}` : ''}${e.unusableReason ? `\n${e.unusableReason}` : ''}`;
      if (c.tip !== tip) {
        // no native title: the styled tooltip below carries the words, and a
        // second yellow box from the browser on top of it would be noise
        c.tip = tip; c.ability = ability; c.reason = e.unusableReason || ''; c.burden = burdenLine;
        if (tipOwner === c) showAbTip(c);
      }
      const left = num(e.cooldownLeft);
      const frac = sweep(left, ability.cooldown);
      c.sweep.style.height = `${(frac * 100).toFixed(0)}%`;
      const label = left > 0 ? timerLabel(left) : '';
      if (c.cd.textContent !== label) c.cd.textContent = label;
      c.cd.className = 'cd' + (left > 0 ? ' on' : '');
      c.cost.className = 'c' + (e.affordable === false ? ' poor' : '');
      c.el.className = 'cell' + (c.hasArt ? ' has-art' : '') + (e.casting ? ' casting' : '')
        + (e.unusable ? ' unusable' : '') + (num(e.burden) > BURDEN_MARK ? ' burdened' : '');
    }
  }

  // --- the item bar ----------------------------------------------------------
  // `view.items` is item_bar.js's `view()`: eight entries, always, each one
  // already asked the pack and the paper doll what it holds. Nothing here
  // reaches into the character document; this file only draws.
  function drawItems(list) {
    const want = Array.isArray(list) ? list : [];
    railMark.className = 'rail' + (want.some((e) => e && !e.empty) ? '' : ' off');
    for (let i = 0; i < itemCells.length; i++) {
      const c = itemCells[i];
      const e = want[i] || null;
      const cap = e && e.cap ? e.cap : itemKeyCap(ITEM_KEYS[i]);
      if (c.key !== cap) { c.el.children[0].textContent = cap; c.key = cap; }
      if (!e || e.empty) {
        if (c.last !== '') {
          c.el.className = 'icell empty';
          c.glyph.innerHTML = ''; c.count.textContent = '';
          c.worn.style.display = 'none'; c.tip = '';
          if (tipOwner === c) hideAbTip();
          c.last = '';
        }
        continue;
      }
      const stamp = `${e.base}|${e.count}|${e.worn ? 1 : 0}|${e.ghost ? 1 : 0}`;
      if (c.last === stamp) continue;
      c.last = stamp;
      c.el.className = 'icell' + (e.worn ? ' worn' : '') + (e.ghost ? ' ghost' : '');
      c.glyph.innerHTML = itemGlyph(baseFor(e.base), 26, null, { count: e.count });
      c.count.textContent = e.count > 1 ? String(e.count) : '';
      c.worn.textContent = e.worn ? `on ${e.wornAt}` : '';
      c.worn.style.display = e.worn ? '' : 'none';
      c.tip = e.ghost
        ? `${e.name}. You have none left.`
        : e.worn ? `${e.name}, worn on your ${e.wornAt}` : `${e.name}${e.count > 1 ? `, ${e.count} of them` : ''}`;
      c.item = e;
      if (tipOwner === c) showAbTip(c);
    }
  }

  // --- the gains ticker --------------------------------------------------------
  // Raised by hud.gain and run down by hud.update, the same way the zone banner
  // is, so the three seconds are seconds of game time and can be measured.
  const gains = [];

  function drawGains() {
    while (gainBox.children.length > gains.length) gainBox.lastChild.remove();
    for (let i = 0; i < gains.length; i++) {
      const g = gains[i];
      let row = gainBox.children[i];
      if (!row) { row = mk('div', null, 'gl'); gainBox.appendChild(row); }
      if (row.textContent !== g.text) row.textContent = g.text;
      row.className = 'gl' + (g.kind === 'stat' ? ' stat' : '');
      const at = gainAt(g.t);
      row.style.opacity = at.opacity.toFixed(3);
      row.style.transform = at.x ? `translateX(${at.x.toFixed(1)}px)` : 'none';
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
      row.style.color = LOG_KINDS[lines[i].kind] || theme.parchment;
    }
  }

  // --- the zone banner -------------------------------------------------------
  // Raised by hud.zone and run down by hud.update, so its timing is seconds of
  // game time and not a CSS transition nobody can measure.
  let banner = null;      // { t, name, sub }

  function drawBanner() {
    if (!banner) { zoneBox.classList.remove('on'); return; }
    const at = bannerAt(banner.t);
    if (at.phase === 'done') { banner = null; zoneBox.classList.remove('on'); zoneBox.style.opacity = '0'; return; }
    zoneBox.classList.add('on');
    zoneBox.style.opacity = at.opacity.toFixed(3);
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
    /** A click on the dev badge. The dev system hides and shows the bench with it. */
    onDev(fn) { onDevClick = fn; },
    /** A click on a bar cell, for the mouse. The keys go through input.js. */
    onBar(fn) { onBarPick = fn; },
    /** A click on the thirteenth cell. The key goes through the dragon system. */
    onWyrmsoul(fn) { onWyrmPick = fn; },
    /** The words the tooltip shows for bar slot i, or '' when the slot is empty. */
    tipFor(i) { const c = cells[i]; return c && c.tip ? c.tip : ''; },
    /** The same for item slot i. */
    itemTipFor(i) { const c = itemCells[i]; return c && c.tip ? c.tip : ''; },

    /**
     * A click on an item slot. `fn(slot, 'use')` for a left click and
     * `fn(slot, 'clear')` for a right one, which is exactly what
     * `item_bar.use` and `item_bar.clear` take.
     */
    onItem(fn) { onItemPick = fn; },

    /**
     * Something dragged out of the pack or off the paper doll and dropped on an
     * item slot. `fn(slot, payload)`, where payload is windows.js's own
     * `{ pack: i }` or `{ slot: 'mainHand' }`, which `item_bar.assign` reads.
     */
    onItemDrop(fn) { onItemDropped = fn; },

    /**
     * A skill or a stat went up. Bottom RIGHT, stacked, three seconds each.
     *
     * This exists because the gain floaters were spawned in the world at the
     * player's own feet, which is exactly where the label of the thing you
     * just picked up is drawn, so every lesson learned while looting sat on
     * top of the loot. main.js already routes 'gain' and 'stat' here.
     *
     * Returns the line it raised, which is what a caller can log.
     */
    gain(text, kind) {
      const t = String(text ?? '').trim();
      if (!t) return null;
      const line = { text: t, kind: kind === 'stat' ? 'stat' : 'gain', t: 0 };
      gains.push(line);
      while (gains.length > GAIN_LINES) gains.shift();
      drawGains();
      return line;
    },

    /** What the ticker is showing right now, newest last. For tests. */
    get gains() { return gains.map((g) => ({ text: g.text, kind: g.kind, t: g.t })); },
    clearGains() { gains.length = 0; drawGains(); },

    /**
     * The Bond arc, beside the pools, with the dragon's name over it.
     *
     * @param {number} value 0..100, the record's own Bond
     * @param {string} name  what the player called it, or null for "the hatchling"
     * @param {boolean} callable  is the key at the end of the bar going to answer
     * @returns what it will draw, so a caller can log it rather than guess
     */
    setBond(value, name, callable) {
      const v = clamp(num(value), 0, 100);
      bondState = { value: v, name: name || null, callable: !!callable, shown: true };
      drawBond();
      return { value: v, name: bondState.name || 'the hatchling', full: v >= 100, callable: !!callable };
    },
    /** Take the arc off the screen: no dragon, or a character without one. */
    clearBond() { bondState = { ...bondState, shown: false }; bondBox.classList.remove('on'); return false; },
    /** What the arc is showing. For the tests and the console. */
    get bond() { return { ...bondState }; },

    /**
     * The thirteenth cell and the screen shell.
     *
     * @param {object} st
     *   `callable`  the mark lights
     *   `active`    dragon time is up: the cell burns and the edges go amber
     *   `left`      seconds of dragon time remaining, drawn in the cell
     *   `reason`    why it cannot be called, for the tooltip, in red
     *   `tip`       `wyrmsoul.tooltipFor()`: name, head, chips, heldLine
     *   `flash`     0..1, the sheet at the end. Run down by `update`.
     */
    setWyrmsoul(st = {}) {
      wyrmState = {
        callable: !!st.callable,
        active: !!st.active,
        left: num(st.left),
        reason: st.reason || '',
        tip: st.tip || null,
      };
      if (Number.isFinite(st.flash)) { flash = clamp(st.flash, 0, 1); drawFlash(); }
      // the card's own words, kept on the record so the tooltip can be opened
      // at any moment and is never a frame behind what the cell is showing
      const card = { ...(st.tip || {}), reason: wyrmState.reason };
      wyrmRec.wyrmTip = card;
      wyrmRec.tip = [card.name || 'Wyrmsoul', card.head, card.heldLine, card.tired, card.reason]
        .filter(Boolean).join(' ');
      drawWyrm();
      if (tipOwner === wyrmRec) showAbTip(wyrmRec);
      return { ...wyrmState };
    },
    /** What the cell is showing. For the tests and the console. */
    get wyrmsoul() { return { ...wyrmState, flash }; },
    /** The white sheet at the end of it. `update` fades it out over FLASH_S. */
    wyrmFlash(k = 1) { flash = clamp(num(k), 0, 1); drawFlash(); return flash; },
    /** The words the Wyrmsoul tooltip is showing. '' when it has none. */
    get wyrmsoulTip() { return wyrmRec.tip || ''; },

    setPlace(text) { place.textContent = text || ''; place.style.display = text ? '' : 'none'; },

    /**
     * The dev badge. `setDev(true)` alone still says "fly mode"; hand it
     * `{ fps, draws, tris, monsters }` and it says those too, and leaves out
     * any of the four that was not measured rather than printing a zero.
     */
    setDev(on, stats) {
      devBadge.classList.toggle('on', !!on);
      if (on) devBadge.textContent = devLine(stats);
      return !!on;
    },

    /**
     * The line under the crosshair. `colour` is the con colour when the cursor
     * is on a monster ("Wolf, a fair fight" in yellow) and is left off by
     * everything else, which goes back to parchment.
     */
    setHint(text, colour) {
      hint.textContent = text || '';
      hint.style.color = colour || theme.parchment;
      hint.classList.toggle('on', !!text);
      return { text: text || '', colour: hint.style.color };
    },

    /**
     * The plate over the thing you are looking at. Handed a
     * { name, colour, word, skull, x, y } by targeting.js every frame, or null
     * to take it down. Returns what it drew, which is what the test reads.
     */
    setNameplate(p) { return drawNameplate(p); },
    /** What the plate is showing, or null. */
    get nameplate() { return plateState; },
    /** The words the hint is showing and the colour they are in. */
    get hint() { return { text: hint.textContent || '', colour: hint.style.color || '' }; },

    /**
     * The place you have just walked into, across the upper third: the name
     * large, a thin gold rule, and a word under it for what kind of place it
     * is. Raising it again restarts it, so walking out and back in reads.
     * Returns what it will say, which is what a caller can log.
     */
    zone(name, sub) {
      const n = String(name ?? '').trim();
      if (!n) { banner = null; zoneBox.classList.remove('on'); return null; }
      banner = { t: 0, name: n, sub: String(sub ?? '').trim() };
      zoneName.textContent = banner.name;
      zoneSub.textContent = banner.sub;
      zoneSub.style.display = banner.sub ? '' : 'none';
      zoneRule.style.display = '';
      drawBanner();
      return { name: banner.name, sub: banner.sub, seconds: BANNER_TOTAL };
    },

    /** Where the banner is right now, for anything that wants to know. */
    get zoneState() {
      if (!banner) return { phase: 'done', opacity: 0, name: null, sub: null, t: 0 };
      const at = bannerAt(banner.t);
      return { ...at, name: banner.name, sub: banner.sub, t: banner.t };
    },

    /**
     * Take the paper doll's canvas, or any node, into the portrait plate. With
     * nothing handed over the plate keeps the drawn helm.
     */
    /**
     * The bars' size. 'small' is the size they shipped at; 'medium' 1.25x;
     * 'large' 1.5x. The gains ticker scales with them. The user called the
     * shipped size small, so medium is the default in win_settings.
     */
    setScale(size) {
      const k = size === 'large' ? 1.5 : size === 'small' ? 1 : 1.25;
      barRail.style.transform = `translateX(-50%) scale(${k})`;
      barRail.style.transformOrigin = 'bottom center';
      const g = el.querySelector('#bw-gains');
      if (g) { g.style.setProperty('--gs', String(k)); g.style.bottom = `${Math.round(96 * k)}px`; }
      return k;
    },
    setPortrait(node) {
      if (!node) return false;
      portrait.textContent = '';
      portrait.appendChild(node);
      return true;
    },

    /**
     * The per frame draw. `view` is built by main.js:
     *   { actor, target, bar: [{ ability, cooldownLeft, affordable, casting,
     *       unusable, unusableReason }],
     *     items: item_bar.view(), buffs: [{ name, kind, remaining }] }
     * Every part is optional, and a missing part hides its widget rather than
     * drawing an empty one.
     */
    update(dt, view) {
      const v = view || {};
      const step = num(dt);
      drawPools(v.actor || null);
      drawAuras(v.buffs);
      drawTarget(v.target || null);
      drawBar(v.bar);
      drawItems(v.items);
      // the flash at the end of dragon time, run down on the PLAYER's clock so
      // it is over in FLASH_S of real time whatever the world is doing
      if (flash > 0) { flash = Math.max(0, flash - step / FLASH_S); drawFlash(); }
      if (banner) { banner.t += step; drawBanner(); }
      if (gains.length) {
        for (const g of gains) g.t += step;
        // Oldest first in the array, so the done ones are always at the front.
        while (gains.length && gainAt(gains[0].t).phase === 'done') gains.shift();
        drawGains();
      }
    },

    dispose() { el.remove(); },
  };
}
