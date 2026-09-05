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

#bw-dev {
  position: absolute; top: 14px; right: 14px; display: none;
  font-family: ${theme.fonts.display}; font-size: 10.5px; letter-spacing: .14em;
  text-transform: uppercase; color: #ffd479; white-space: pre;
  border-color: rgba(255,212,121,.5);
}
#bw-dev.on { display: block; }
#bw-hint {
  position: absolute; left: 50%; bottom: 148px; transform: translateX(-50%);
  font-size: 15px; opacity: 0; transition: opacity .12s ease; white-space: nowrap;
  color: ${theme.parchment};
}
#bw-hint.on { opacity: 1; }
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
  const hint = add(el, mk('div', 'bw-hint'));
  const toolRow = add(el, mk('div', 'bw-tools'));
  // one rail, two bars: what you know, then what you carry
  const barRail = add(el, mk('div', 'bw-bars'));
  const barRow = add(barRail, mk('div', 'bw-bar'));
  const railMark = add(barRail, mk('div', null, 'rail off'));
  const itemRow = add(barRail, mk('div', 'bw-items'));

  const gainBox = add(el, mk('div', 'bw-gains'));

  const bottomLeft = add(el, mk('div', 'bw-bl'));
  const toasts = add(bottomLeft, mk('div', 'bw-toasts'));
  const logBox = add(bottomLeft, mk('div', 'bw-log'));

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
    return { el: c, glyph: g, count: n, worn: w, key, last: '' };
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
        c.last = ability.id;
        c.tip = null;
      }
      // G2: what is in your hands can refuse an ability, and the reason is the
      // sentence to show. It changes as you draw and sheathe, so the title is
      // rebuilt when it changes rather than once when the slot was filled.
      const tip = `${ability.name}. ${ability.description || ''}${e.unusableReason ? `\n${e.unusableReason}` : ''}`;
      if (c.tip !== tip) { c.el.title = tip; c.tip = tip; }
      const left = num(e.cooldownLeft);
      const frac = sweep(left, ability.cooldown);
      c.sweep.style.height = `${(frac * 100).toFixed(0)}%`;
      const label = left > 0 ? timerLabel(left) : '';
      if (c.cd.textContent !== label) c.cd.textContent = label;
      c.cd.className = 'cd' + (left > 0 ? ' on' : '');
      c.cost.className = 'c' + (e.affordable === false ? ' poor' : '');
      c.el.className = 'cell' + (e.casting ? ' casting' : '') + (e.unusable ? ' unusable' : '');
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
          c.worn.style.display = 'none'; c.el.title = '';
          c.last = '';
        }
        continue;
      }
      const stamp = `${e.base}|${e.count}|${e.worn ? 1 : 0}|${e.ghost ? 1 : 0}`;
      if (c.last === stamp) continue;
      c.last = stamp;
      c.el.className = 'icell' + (e.worn ? ' worn' : '') + (e.ghost ? ' ghost' : '');
      c.glyph.innerHTML = itemGlyph(baseFor(e.base), 26);
      c.count.textContent = e.count > 1 ? String(e.count) : '';
      c.worn.textContent = e.worn ? `on ${e.wornAt}` : '';
      c.worn.style.display = e.worn ? '' : 'none';
      c.el.title = e.ghost
        ? `${e.name}. You have none left.`
        : e.worn ? `${e.name}, worn on your ${e.wornAt}` : `${e.name}${e.count > 1 ? `, ${e.count} of them` : ''}`;
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
    /** A click on a bar cell, for the mouse. The keys go through input.js. */
    onBar(fn) { onBarPick = fn; },

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

    setHint(text) { hint.textContent = text || ''; hint.classList.toggle('on', !!text); },

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
