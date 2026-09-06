// The skill sheet: all fifty two, in the document's nine groups, each as a card
// with its painting, its bar, its number to one decimal, its lock, and the
// abilities it is holding back. Key K, panel id `skills`, still a codex tab.
//
// WHAT CHANGED IN SK1
//
// It was a table: a 20 px lock, a 190 px name, a thin green bar, a number, and
// a grey sentence under it, fifty two times. Next to the ability book, which is
// a grid of 112 px paintings, it read like a spreadsheet that had wandered into
// an illuminated manuscript. It is a book now, built the same way: a filter row,
// a count line, the nine groups as headers, and under each one a grid of cards.
//
// The bar is the thing this page has that the book does not, so it is drawn
// properly rather than shrunk: a dark trough, a gold fill with a brighter cap
// at its end, a faint tick every ten, and the six gain bands drawn as segments
// under it with the one you are standing in lit. That last mark is the whole
// point of a skill bar in this game. The step is 0.3 a success under 30 and
// 0.01 over 95, and a player who cannot see where that changes cannot see why
// the last five points take a week.
//
// The line beside the bar says the same thing in words, and it says it about
// THIS skill and THIS lock: a locked skill reads "31.4, locked and will not
// rise", not "gains 0.2 a success", because rollGain refuses a locked skill and
// a bar that promised a gain would be a bar that lies.
//
// The lock is the interesting control. At the 700 total a gain has to be paid
// for out of something marked down, so the three states are not decoration:
// up rises, locked stays, down pays. Setting one goes through skills.setLock,
// which refuses a bad value and says why, and the refusal is shown rather than
// swallowed.
//
// "Unlocks next" used to be a grey sentence and is now a row of the abilities
// this skill gates, at 24 px, painted, each with a tooltip: what is yours is
// bright, the next one is lit, the rest are dim. It is read out of abilities.js
// every draw, and the sentence under it is meetsRequirements' own reason
// whenever that reason says something the short line does not, so the card
// cannot promise an unlock the rules would not give.
//
// The art is the painted library (icon_art.js `skillIcon`), with a drawn mark
// per group as the fallback, and `auditSkillArt()` runs at import so a fifty
// third skill in a tenth group dies here instead of shipping an empty square.

import {
  SKILLS, SKILL_GROUPS, SKILL_CAP, TOTAL_CAP, LOCKS, BANDS,
  lockOf, setLock, total, gainStep,
} from '../mmo/skills.js';
import { ABILITIES, meetsRequirements, requirementClauses } from '../mmo/abilities.js';
import { skillIcon, abilityIcon, iconImg } from './icon_art.js';
import { attachTip, hideTip } from './windows.js';
import { theme } from './ui_theme.js';

/** up, then locked, then down, then round again. */
export const LOCK_CYCLE = ['up', 'locked', 'down'];
export const LOCK_GLYPH = { up: '▲', locked: '●', down: '▼' };
export const LOCK_WORDS = {
  up: 'rises with use',
  locked: 'locked, and will not move',
  down: 'marked to fall, and pays for other gains at the cap',
};

/** The skill state shape skills.js reads: the document keeps the two apart. */
export function lockState(character) {
  if (!character.skills || typeof character.skills !== 'object') character.skills = {};
  if (!character.skillLocks || typeof character.skillLocks !== 'object') character.skillLocks = {};
  return { skills: character.skills, locks: character.skillLocks };
}

/** The next lock in the cycle. */
export const nextLock = (lock) => LOCK_CYCLE[(LOCK_CYCLE.indexOf(lock) + 1) % LOCK_CYCLE.length];

/**
 * How high this skill has to be for that ability, or null when the ability
 * does not gate on it at all. A weapon ability that names four skills counts
 * for each of them; an `anyOf` ability counts at the cheapest branch that
 * mentions this skill.
 */
export function thresholdFor(ability, skillId) {
  if (ability.anyOf) {
    let best = null;
    for (const branch of ability.anyOf) {
      for (const c of branch.all) {
        if (c.skill === skillId && (best == null || c.min < best)) best = c.min;
      }
    }
    return best;
  }
  if (ability.skillAny && ability.skillAny.includes(skillId)) return ability.minSkill;
  if (ability.skill === skillId) return ability.minSkill;
  if (ability.extraReq && skillId in ability.extraReq) return ability.extraReq[skillId];
  return null;
}

/** Every ability this skill has a hand in, cheapest first. */
export function abilitiesOf(skillId, list = ABILITIES) {
  return list
    .map((a) => ({ ability: a, at: thresholdFor(a, skillId) }))
    .filter((x) => x.at != null)
    .sort((a, b) => a.at - b.at || (a.ability.name < b.ability.name ? -1 : 1));
}

/**
 * What the unlock row says for one skill: what is already yours, and the next
 * thing this skill is holding back, in the rules layer's own words.
 */
export function standingFor(skillId, skills, stats, list = ABILITIES) {
  const rows = abilitiesOf(skillId, list);
  const unlocked = [];
  const locked = [];
  for (const r of rows) {
    if (meetsRequirements(r.ability, skills, stats).ok) unlocked.push(r);
    else locked.push(r);
  }
  const next = locked[0] || null;
  // WHAT THE NEXT ROW WANTS THAT THIS CARD IS NOT ABOUT. The short line under
  // a skill card is "Whirlwind at 50", this skill's own threshold, and the
  // rules' reason goes under it only when the row wants something else as
  // well. Comparing the two SENTENCES used to be how that was decided, and it
  // broke the moment the reason started carrying "you are at 30": the two
  // strings stopped matching and every card printed both halves of the same
  // fact. So it is decided on the clauses now, which is what it always meant.
  const otherNeeds = next
    ? requirementClauses(next.ability, skills, stats).filter((p) => !p.met && p.id !== skillId)
    : [];
  return {
    unlocked: unlocked.map((r) => r.ability),
    next: next ? next.ability : null,
    nextAt: next ? next.at : null,
    nextReason: next ? meetsRequirements(next.ability, skills, stats).reason : null,
    /** The clauses of the next row that this card's own skill does not cover. */
    otherNeeds,
  };
}

// ---------------------------------------------------------------------------
// The groups: a colour and a mark each
// ---------------------------------------------------------------------------
// Presentation values, chosen to read on dark stone next to the gold. No other
// file reads them, and `auditSkillArt()` below refuses a tenth group that
// arrives without both.

export const GROUP_COLOUR = {
  'Combat, melee': '#e08a5a',
  'Combat, ranged': '#8fc46a',
  'Magic': '#6fa8f0',
  'Healing and support': '#f2dc9c',
  'Gathering': '#b98a5a',
  'Crafting': '#b0b8c4',
  'Roguery': '#9a8fc0',
  'Beasts': '#7fc79a',
  'Body': '#cbb894',
};

/**
 * The drawing a card wears when the painted library has nothing for that skill.
 * One mark per group, on the same 24 x 24 field ui_theme.js and the ability
 * book use. Every skill has a painting today; these exist so the fifty third
 * one shows a blade rather than a hole.
 */
export const SKILL_MARK = {
  'Combat, melee': '<path d="M19 2 l3 1 -1 3 -8 8 -3 -3 z M10 12 l2 2 -6 6 -3 1 1 -3 z M3 19 l2 2"/>',
  'Combat, ranged': '<path d="M21 3 v6 h-2 V6.4 l-8.6 8.6 2 2 -1.4 1.4 -2 -2 -2.6 2.6 1.6 1.6 -1.4 1.4 -5.6 -5.6 1.4 -1.4 1.6 1.6 2.6 -2.6 -2 -2 1.4 -1.4 2 2 L17.6 5 H15 V3 z"/>',
  'Magic': '<path d="M12 1 l2.4 6.2 6.2 -2.6 -2.6 6.4 6.4 2 -6.4 2 2.6 6.4 -6.2 -2.6 L12 23 l-2.4 -6.2 -6.2 2.6 2.6 -6.4 L0 15 l6.4 -2 -2.6 -6.4 6.2 2.6 z"/>',
  'Healing and support': '<path d="M9 1 h6 v8 h8 v6 h-8 v8 H9 v-8 H1 V9 h8 z"/>',
  'Gathering': '<path d="M2 6 C8 1 16 1 22 6 c-6 -1 -8 1 -9 3 l-2 0 c-1 -2 -3 -4 -9 -3 z M11 10 h2 l1 13 h-4 z"/>',
  'Crafting': '<path d="M13 1 l9 4 -2 4 -3.4 -1.6 -1.2 2.4 -3 -1.4 1.2 -2.4 L10 4.6 z M9.6 8.4 l4.8 2.2 -8 15 -5 -2.2 z"/>',
  'Roguery': '<path d="M1 12 C5 5 19 5 23 12 19 19 5 19 1 12 z M12 8 a4 4 0 1 0 .1 0 z"/>',
  'Beasts': '<path d="M6 9 a2.4 3 0 1 1 .1 0 z M18 9 a2.4 3 0 1 1 .1 0 z M2.4 15 a2.2 2.6 0 1 1 .1 0 z M21.6 15 a2.2 2.6 0 1 1 .1 0 z M12 12 c4 0 6.4 3.4 6.4 6 0 2.4 -2.4 4 -6.4 4 s-6.4 -1.6 -6.4 -4 c0 -2.6 2.4 -6 6.4 -6 z"/>',
  'Body': '<path d="M12 1 a3 3 0 1 1 .1 0 z M9 8 h6 l3 7 -2.4 1 -1.6 -3 v10 h-2.4 v-6 h-1.2 v6 H8 V13 l-1.6 3 L4 15 z"/>',
};

/** One card's art, as an html string, at `size` px. */
export function skillArt(skill, size = 112) {
  const src = skillIcon(skill && skill.id);
  if (src) return iconImg(src, size, 'bw-s-art');
  const colour = GROUP_COLOUR[skill && skill.group] || theme.parchmentDim;
  const mark = SKILL_MARK[skill && skill.group] || SKILL_MARK.Body;
  return `<svg class="bw-s-art" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${colour}" stroke="none">${mark}</svg>`;
}

/** A gated ability's picture at chip size, painted if it has one. */
export function abilityChipArt(ability, size = 24) {
  const src = abilityIcon(ability && ability.id);
  if (src) return iconImg(src, size, 'bw-u-art');
  return `<svg class="bw-u-art" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${theme.gold}" stroke="none"><path d="M12 1 l7 11 -7 11 -7 -11 z"/></svg>`;
}

// ---------------------------------------------------------------------------
// The filter row and the count line
// ---------------------------------------------------------------------------

/** All, then the nine groups, in the document's order. */
export const FILTERS = [{ id: 'all', label: 'All' }, ...SKILL_GROUPS.map((g) => ({ id: g, label: g }))];

/** Pure. Does this filter show this skill? */
export function inFilter(skill, filter) {
  if (filter === 'all') return true;
  return skill.group === filter;
}

/** Pure. The sheet as it is drawn: the nine groups, each with the cards in it. */
export function sheetFor(filter = 'all') {
  const out = [];
  for (const group of SKILL_GROUPS) {
    const rows = SKILLS.filter((s) => s.group === group && inFilter(s, filter));
    if (rows.length) out.push({ group, label: group, rows });
  }
  return out;
}

/** Pure. "52 skills, 700 points, 412.6 placed", and what is shown when filtered. */
export function countText(placed, shown = null, count = SKILLS.length, cap = TOTAL_CAP) {
  const t = typeof placed === 'number' && Number.isFinite(placed) ? placed : 0;
  const parts = [`${count} skills`, `${cap} points`, `${t.toFixed(1)} placed`];
  if (shown != null && shown !== count) parts.push(`${shown} shown`);
  return parts.join(', ');
}

/**
 * Every group has a colour and a mark, every mark is a real drawing, every
 * skill lands on either a painting or a mark, and the filter row has a chip
 * for each group. Runs at import: a tenth group, or a fifty third skill nobody
 * painted, fails here rather than drawing an empty tile.
 */
export function auditSkillArt() {
  const bad = [];
  for (const g of SKILL_GROUPS) {
    if (!GROUP_COLOUR[g]) bad.push(`the group "${g}" has no colour`);
    if (!SKILL_MARK[g]) bad.push(`the group "${g}" has no mark`);
  }
  for (const g of Object.keys(GROUP_COLOUR)) {
    if (!SKILL_GROUPS.includes(g)) bad.push(`"${g}" has a colour and is not one of the nine groups`);
  }
  for (const g of Object.keys(SKILL_MARK)) {
    if (!SKILL_GROUPS.includes(g)) bad.push(`"${g}" has a mark and is not one of the nine groups`);
    else if (!/^<path /.test(SKILL_MARK[g])) bad.push(`the mark for "${g}" is not a drawing`);
  }
  let painted = 0;
  for (const s of SKILLS) {
    if (skillIcon(s.id)) painted++;
    else if (!SKILL_MARK[s.group]) bad.push(`${s.name} has neither a painting nor a mark`);
  }
  for (const f of FILTERS) {
    if (f.id !== 'all' && !SKILL_GROUPS.includes(f.id)) bad.push(`the filter "${f.id}" is not a group`);
  }
  if (FILTERS.length !== SKILL_GROUPS.length + 1) {
    bad.push(`${FILTERS.length} filter chips for ${SKILL_GROUPS.length} groups and All`);
  }
  if (bad.length) throw new Error(`win_skills: ${bad.length} things have no art. ${bad[0]}`);
  return { skills: SKILLS.length, painted, groups: SKILL_GROUPS.length };
}

// ---------------------------------------------------------------------------
// The bar
// ---------------------------------------------------------------------------

/** 0.3 reads "0.3", 0.05 reads "0.05". No trailing zeroes. */
const trim = (v) => String(Math.round(v * 1000) / 1000);

/** The ticks drawn across the trough: one every ten, the two ends excluded. */
export const TICKS = [10, 20, 30, 40, 50, 60, 70, 80, 90];

/**
 * Which of the six gain bands a value stands in. 100 is nobody's band, so a
 * grandmaster is shown standing in the last one, which is where the last point
 * came from.
 */
export function bandIndexAt(value) {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  if (v >= SKILL_CAP) return BANDS.length - 1;
  if (v < 0) return 0;
  for (let i = 0; i < BANDS.length; i++) if (v >= BANDS[i].min && v < BANDS[i].max) return i;
  return BANDS.length - 1;
}

/** The words beside the bar. The lock is part of the truth, so it is read. */
export function stepText(value, lock = 'up') {
  const v = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(SKILL_CAP, value)) : 0;
  const n = v.toFixed(1);
  if (v >= SKILL_CAP) return `${n}, grandmaster`;
  if (lock === 'locked') return `${n}, locked and will not rise`;
  if (lock === 'down') return `${n}, marked to fall and will not rise`;
  return `${n}, gains ${trim(gainStep(v))} a success`;
}

/**
 * Pure. Everything the bar is drawn from: how far along, which band, what a
 * success is worth there, and the line beside it.
 */
export function barView(value, lock = 'up') {
  const v = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(SKILL_CAP, value)) : 0;
  const bandIndex = bandIndexAt(v);
  return {
    value: v,
    // rounded, or 31.4 of 100 writes a width of 31.400000000000002%
    pct: Math.round((v / SKILL_CAP) * 1e6) / 1e4,
    bandIndex,
    band: BANDS[bandIndex],
    step: gainStep(v),
    text: stepText(v, lock),
  };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const CSS = `
.bw-skills { width: 100%; font-family: ${theme.fonts.body}; }
.bw-skills .bw-hint { color: ${theme.parchmentDim}; font-style: italic; font-size: 15px; margin-bottom: 10px; }

.bw-skills .bw-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
.bw-skills .bw-f {
  font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .12em;
  text-transform: uppercase; padding: 5px 11px; cursor: pointer;
  color: ${theme.parchmentDim}; background: rgba(9,8,6,.7);
  border: 1px solid ${theme.goldDim}66;
}
.bw-skills .bw-f:hover { color: ${theme.goldBright}; border-color: ${theme.gold}; }
.bw-skills .bw-f:focus-visible { outline: 1px solid ${theme.goldBright}; outline-offset: 2px; }
.bw-skills .bw-f.on { color: ${theme.goldBright}; border-color: ${theme.gold}; background: ${theme.plate}; }

.bw-skills .bw-count {
  display: flex; flex-wrap: wrap; gap: 6px;
  font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .12em;
  text-transform: uppercase; color: ${theme.parchmentFaint}; margin: 0 0 12px;
  font-variant-numeric: tabular-nums;
}
.bw-skills .bw-count.full { color: ${theme.goldBright}; }

.bw-skills h3 {
  font-family: ${theme.fonts.display}; font-size: 15px; font-weight: 600;
  letter-spacing: .2em; text-transform: uppercase; color: ${theme.gold};
  margin: 20px 0 9px; padding-bottom: 5px; border-bottom: 1px solid ${theme.goldDim}55;
}
.bw-skills h3:first-child { margin-top: 0; }

/* Two cards a row at 1280 and at 1920 alike: the codex is min(1320px, 96vw),
   so the widest this grid ever gets is about 1250 px and 520 px cards never
   make a third column. A skill card is wider than an ability card because it
   carries a bar and a row of unlock chips as well as a sentence. */
.bw-skills .bw-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(520px, 1fr)); gap: 10px; }

.bw-skills .bw-card {
  position: relative; display: grid; grid-template-columns: 112px 1fr; gap: 14px;
  padding: 11px 13px; align-items: start;
  background: linear-gradient(150deg, rgba(30,25,18,.86), rgba(10,9,7,.9));
  border: 1px solid ${theme.goldDim}55;
}
.bw-skills .bw-card:hover { border-color: ${theme.gold}; }
.bw-skills .bw-card.gm { border-color: ${theme.gold}; box-shadow: inset 3px 0 0 ${theme.gold}; }
.bw-skills .bw-card.held { opacity: .84; }

.bw-skills .bw-tile {
  position: relative; width: 112px; height: 112px; display: flex; overflow: hidden;
  align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 40%, rgba(255,255,255,.07), rgba(0,0,0,.45));
  border: 1px solid ${theme.goldDim}77;
}
.bw-skills .bw-tile img.bw-s-art { width: 100%; height: 100%; object-fit: cover; display: block; }
.bw-skills .bw-tile svg.bw-s-art { width: 64px; height: 64px; }
.bw-skills .bw-card.held .bw-tile { filter: saturate(.35); }

.bw-skills .bw-head { display: flex; align-items: baseline; gap: 9px; }
.bw-skills .bw-name {
  flex: 1; min-width: 0; font-family: ${theme.fonts.display}; font-size: 17px;
  font-weight: 600; letter-spacing: .02em; color: ${theme.parchment};
}
.bw-skills .bw-card:hover .bw-name, .bw-skills .bw-card.gm .bw-name { color: ${theme.goldBright}; }
.bw-skills .bw-val {
  font-family: ${theme.fonts.display}; font-size: 23px; line-height: 1;
  font-variant-numeric: tabular-nums; color: ${theme.parchment};
}
.bw-skills .bw-card.gm .bw-val { color: ${theme.goldBright}; }
.bw-skills .bw-card.held .bw-val { color: ${theme.parchmentFaint}; }

.bw-skills .bw-lock {
  align-self: center; font-family: ${theme.fonts.display}; font-size: 12px; line-height: 1;
  padding: 4px 7px; cursor: pointer; user-select: none; -webkit-user-select: none;
  color: ${theme.gold}; background: rgba(0,0,0,.45); border: 1px solid ${theme.goldDim}66;
}
.bw-skills .bw-lock:hover { color: ${theme.goldBright}; border-color: ${theme.gold}; }
.bw-skills .bw-lock:focus-visible { outline: 1px solid ${theme.goldBright}; outline-offset: 2px; }
.bw-skills .bw-lock.locked { color: ${theme.parchment}; }
.bw-skills .bw-lock.down { color: #ff8f7a; border-color: #ff8f7a55; }

.bw-skills .bw-meter { display: flex; align-items: flex-start; gap: 10px; margin: 8px 0 7px; }
.bw-skills .bw-gauge { flex: 1; min-width: 0; }
.bw-skills .bw-track {
  position: relative; height: 10px;
  background: linear-gradient(180deg, #0a0806, #17110b);
  border: 1px solid ${theme.goldDim}66;
  box-shadow: inset 0 1px 2px rgba(0,0,0,.8);
}
.bw-skills .bw-fill {
  position: absolute; left: 0; top: 0; bottom: 0; width: 0;
  background: linear-gradient(180deg, ${theme.goldBright}, ${theme.gold} 52%, ${theme.goldDim});
}
.bw-skills .bw-cap {
  position: absolute; right: -1px; top: -1px; bottom: -1px; width: 2px;
  background: ${theme.goldBright}; box-shadow: 0 0 6px ${theme.goldBright};
}
.bw-skills .bw-tick { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(232,217,181,.18); }
.bw-skills .bw-bands { position: relative; height: 3px; margin-top: 3px; }
.bw-skills .bw-band { position: absolute; top: 0; height: 3px; background: ${theme.goldDim}55; }
.bw-skills .bw-band.on { background: ${theme.gold}; box-shadow: 0 0 5px rgba(201,164,74,.65); }
.bw-skills .bw-step {
  font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .06em;
  color: ${theme.parchmentFaint}; white-space: nowrap; font-variant-numeric: tabular-nums;
}
.bw-skills .bw-card.gm .bw-step { color: ${theme.gold}; }
.bw-skills .bw-card.held .bw-fill { filter: saturate(.18) brightness(.72); }
.bw-skills .bw-card.held .bw-cap { background: ${theme.parchmentFaint}; box-shadow: none; }
.bw-skills .bw-card.held .bw-band.on { background: ${theme.parchmentFaint}; box-shadow: none; }
.bw-skills .bw-card.falling .bw-fill { background: linear-gradient(180deg, #ffb9a6, #c25c46); filter: none; }
.bw-skills .bw-card.falling .bw-cap { background: #ff8f7a; box-shadow: none; }

.bw-skills .bw-desc { font-size: 15.5px; line-height: 1.34; color: ${theme.parchmentDim}; }
.bw-skills .bw-opens {
  font-family: ${theme.fonts.display}; font-size: 10px; letter-spacing: .14em;
  text-transform: uppercase; color: ${theme.parchmentFaint}; margin: 8px 0 4px;
}
.bw-skills .bw-unlocks { display: flex; flex-wrap: wrap; gap: 5px; }
.bw-skills .bw-u {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  overflow: hidden; background: rgba(0,0,0,.45); border: 1px solid ${theme.goldDim}44;
  filter: grayscale(1) brightness(.62); opacity: .82;
}
.bw-skills .bw-u img.bw-u-art, .bw-skills .bw-u svg.bw-u-art { width: 24px; height: 24px; object-fit: cover; display: block; }
.bw-skills .bw-u.have { filter: none; opacity: 1; border-color: ${theme.goldDim}88; }
.bw-skills .bw-u.on {
  filter: none; opacity: 1; border-color: ${theme.gold};
  box-shadow: 0 0 7px rgba(201,164,74,.55);
}
.bw-skills .bw-next {
  font-family: ${theme.fonts.display}; font-size: 11.5px; letter-spacing: .06em;
  color: #e0b064; margin-top: 6px;
}
.bw-skills .bw-why { font-size: 13.5px; font-style: italic; color: ${theme.parchmentFaint}; margin-top: 2px; }
`;

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function css() {
  if (typeof document === 'undefined' || document.getElementById('bw-skills-css')) return;
  const s = document.createElement('style');
  s.id = 'bw-skills-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

auditSkillArt();

export const panel = {
  id: 'skills',
  title: 'Skills',
  key: 'k',

  build(el, ctx) {
    css();
    const character = () => (ctx.character && ctx.character.skills ? ctx.character : ctx.inventory?.character) || { skills: {}, skillLocks: {} };
    const say = (t, kind) => (ctx.hud?.log ? ctx.hud.log(t, kind) : ctx.hud?.toast?.(t, kind));
    let filter = 'all';

    const root = h('div', 'bw-skills');
    el.appendChild(root);

    root.appendChild(h('div', 'bw-hint',
      'Every skill in the world, and where you stand in it. The glyph beside a number sets whether that skill rises with use, holds where it is, or falls to pay for another once the seven hundred points are spent. The lit segment under a bar is the band you are in, and the band is what one success is worth.'));

    const filterRow = h('div', 'bw-filters');
    root.appendChild(filterRow);
    const countLine = h('div', 'bw-count');
    root.appendChild(countLine);
    const listEl = h('div');
    root.appendChild(listEl);

    // --- the filter row ----------------------------------------------------
    const filterEls = new Map();
    for (const f of FILTERS) {
      // `bw-btn` is the exemption windows.js writes into its own button rule:
      // #bw-windows button:not(.bw-btn) is Cormorant 14 in parchment, which
      // would put this row in a different voice from the ability book's chips.
      const b = h('button', 'bw-f bw-btn', f.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (filter === f.id) return;
        filter = f.id;
        build();
        draw();
      });
      filterRow.appendChild(b);
      filterEls.set(f.id, b);
    }

    // --- the cards ---------------------------------------------------------
    // Built once per filter change and then only redrawn, because the numbers
    // tick twice a second and rebuilding fifty two cards, their ticks, their
    // bands and their unlock chips at 2 Hz is a page that fights the collector.
    let cards = [];

    function build() {
      listEl.textContent = '';
      cards = [];
      for (const section of sheetFor(filter)) {
        listEl.appendChild(h('h3', null, section.label));
        const grid = h('div', 'bw-cards');
        listEl.appendChild(grid);
        for (const skill of section.rows) {
          const card = h('div', 'bw-card');
          card.dataset.skill = skill.id;

          const tile = h('div', 'bw-tile');
          tile.innerHTML = skillArt(skill, 112);
          const colour = GROUP_COLOUR[skill.group];
          if (colour) tile.style.background = `radial-gradient(circle at 50% 38%, ${colour}26, rgba(0,0,0,.5))`;
          card.appendChild(tile);

          const body = h('div');
          const head = h('div', 'bw-head');
          const name = h('div', 'bw-name', skill.name);
          const val = h('div', 'bw-val');
          const lock = h('button', 'bw-lock bw-btn');
          lock.type = 'button';
          head.appendChild(name);
          head.appendChild(val);
          head.appendChild(lock);
          body.appendChild(head);

          const meter = h('div', 'bw-meter');
          const gauge = h('div', 'bw-gauge');
          const track = h('div', 'bw-track');
          const fill = h('span', 'bw-fill');
          fill.appendChild(h('i', 'bw-cap'));
          track.appendChild(fill);
          for (const t of TICKS) {
            const tick = h('i', 'bw-tick');
            tick.style.left = `${t}%`;
            track.appendChild(tick);
          }
          const bands = h('div', 'bw-bands');
          const bandEls = [];
          BANDS.forEach((b, i) => {
            const seg = h('i', 'bw-band');
            seg.dataset.band = String(i);
            seg.style.left = `${b.min}%`;
            seg.style.width = `${b.max - b.min}%`;
            seg.title = `${b.min} to ${b.max}: ${trim(b.step)} a success, about ${b.uses} of them`;
            bands.appendChild(seg);
            bandEls.push(seg);
          });
          gauge.appendChild(track);
          gauge.appendChild(bands);
          const step = h('div', 'bw-step');
          meter.appendChild(gauge);
          meter.appendChild(step);
          body.appendChild(meter);

          body.appendChild(h('div', 'bw-desc', skill.description));

          // The abilities a skill gates never change, so the chips are built
          // once and only their state is redrawn.
          const gated = abilitiesOf(skill.id);
          const opens = h('div', 'bw-opens', 'unlocks');
          const unlocks = h('div', 'bw-unlocks');
          const chips = [];
          for (const row of gated) {
            const chip = h('div', 'bw-u');
            chip.innerHTML = abilityChipArt(row.ability, 24);
            unlocks.appendChild(chip);
            const rec = { el: chip, ability: row.ability, at: row.at, met: false, next: false, reason: null };
            chips.push(rec);
            attachTip(chip, () => ({
              lines: [
                row.ability.name,
                rec.met ? 'yours' : `${skill.name} ${row.at}`,
                rec.met ? row.ability.description : (rec.reason || row.ability.description),
              ],
            }));
          }
          if (gated.length) { body.appendChild(opens); body.appendChild(unlocks); }
          const next = h('div', 'bw-next');
          const why = h('div', 'bw-why');
          body.appendChild(next);
          body.appendChild(why);
          card.appendChild(body);
          grid.appendChild(card);

          lock.addEventListener('click', (e) => {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            const c = character();
            const st = lockState(c);
            const want = nextLock(lockOf(st, skill.id));
            const res = setLock(st, skill.id, want);
            if (!res.ok) { say(res.reason, 'bad'); return; }
            say(`${skill.name} is ${LOCK_WORDS[res.lock]}`);
            ctx.onSkillLock?.(skill.id, res.lock);
            draw();
          });
          attachTip(lock, () => {
            const l = lockOf(lockState(character()), skill.id);
            return { lines: [skill.name, LOCK_WORDS[l], 'click for up, locked, down'] };
          });

          cards.push({ skill, el: card, val, lock, fill, bandEls, step, chips, next, why, opens });
        }
      }
    }

    function draw() {
      const c = character();
      const st = lockState(c);
      const stats = c.stats || {};
      const t = total(st);

      for (const f of FILTERS) filterEls.get(f.id).classList.toggle('on', filter === f.id);
      countLine.textContent = countText(t, cards.length);
      countLine.classList.toggle('full', t >= TOTAL_CAP);

      for (const rec of cards) {
        const skill = rec.skill;
        const raw = st.skills[skill.id];
        const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
        const lock = lockOf(st, skill.id);
        const view = barView(v, lock);

        rec.val.textContent = view.value.toFixed(1);
        rec.fill.style.width = `${view.pct}%`;
        rec.step.textContent = view.text;
        rec.bandEls.forEach((seg, i) => seg.classList.toggle('on', i === view.bandIndex));

        rec.el.classList.toggle('gm', view.value >= SKILL_CAP);
        rec.el.classList.toggle('held', lock !== 'up');
        rec.el.classList.toggle('falling', lock === 'down');

        rec.lock.textContent = LOCK_GLYPH[lock];
        rec.lock.className = `bw-lock bw-btn ${lock}`;
        rec.lock.title = `${skill.name} ${LOCK_WORDS[lock]}`;

        const s = standingFor(skill.id, st.skills, stats);
        const open = new Set(s.unlocked.map((a) => a.id));
        for (const chip of rec.chips) {
          chip.met = open.has(chip.ability.id);
          chip.next = !!s.next && s.next.id === chip.ability.id;
          chip.reason = chip.next ? s.nextReason : null;
          chip.el.classList.toggle('have', chip.met);
          chip.el.classList.toggle('on', chip.next);
          chip.el.title = chip.met
            ? `${chip.ability.name}, yours`
            : `${chip.ability.name} at ${skill.name} ${chip.at}`;
        }

        // The short line is this skill's own threshold. The rules layer's own
        // reason goes under it whenever it says something that line does not,
        // so a card cannot promise an unlock the rules would refuse.
        const short = s.next
          ? `${s.next.name} at ${s.nextAt}`
          : (rec.chips.length ? 'everything it opens is yours' : '');
        const why = s.next && s.otherNeeds.length ? s.nextReason : '';
        if (rec.next.textContent !== short) rec.next.textContent = short;
        if (rec.why.textContent !== why) rec.why.textContent = why;
        rec.next.style.display = short ? '' : 'none';
        rec.why.style.display = why ? '' : 'none';
        rec.opens.textContent = s.next ? 'unlocks next' : 'unlocks';
      }
    }

    build();
    draw();
    this._draw = draw;
    this._rebuild = () => { build(); draw(); };
  },

  open() { if (this._rebuild) this._rebuild(); },
  close() { hideTip(); },

  tick(dt) {
    this._since = (this._since || 0) + (dt || 0);
    if (this._since < 0.5) return;
    this._since = 0;
    if (this._draw) this._draw();
  },
};

export const LOCK_LIST = LOCKS;
export default panel;
