// The skill sheet: all fifty two, in the document's nine groups, each with its
// bar, its number to one decimal, its lock, and what it has bought you. Key K.
//
// The lock is the interesting control. At the 700 total a gain has to be paid
// for out of something marked down, so the three states are not decoration:
// up rises, locked stays, down pays. Setting one goes through skills.setLock,
// which refuses a bad value and says why, and the refusal is shown rather than
// swallowed.
//
// The abilities column is read out of abilities.js every draw. "Unlocks next"
// is the cheapest ability this skill still gates, and the sentence under it is
// meetsRequirements' own reason, so the window cannot promise an unlock the
// rules would not give.

import { SKILLS, SKILL_GROUPS, SKILL_CAP, TOTAL_CAP, LOCKS, lockOf, setLock, total } from '../mmo/skills.js';
import { ABILITIES, meetsRequirements } from '../mmo/abilities.js';
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
 * What the abilities column says for one skill: what is already yours, and the
 * next thing this skill is holding back, in the rules layer's own words.
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
  return {
    unlocked: unlocked.map((r) => r.ability),
    next: next ? next.ability : null,
    nextAt: next ? next.at : null,
    nextReason: next ? meetsRequirements(next.ability, skills, stats).reason : null,
  };
}

const CSS = `
.bw-skills { width: 100%; }
.bw-skills-head {
  display: flex; justify-content: space-between; align-items: baseline; gap: 14px; margin-bottom: 10px;
  color: ${theme.parchmentDim}; font-style: italic;
}
.bw-skills-head b {
  font-family: ${theme.fonts.display}; font-variant-numeric: tabular-nums;
  font-style: normal; color: ${theme.parchment};
}
.bw-skills-head b.full { color: ${theme.goldBright}; }
.bw-skill {
  display: grid; grid-template-columns: 20px 190px 1fr 54px; gap: 10px; align-items: center;
  padding: 2px 0; border-top: 1px solid rgba(201,164,74,.14);
}
.bw-skill .bw-lock { cursor: pointer; text-align: center; font-size: 11px; color: ${theme.goldDim}; user-select: none; }
.bw-skill .bw-lock.locked { color: ${theme.parchment}; }
.bw-skill .bw-lock.down { color: #ff8f7a; }
.bw-skill .bw-bar {
  height: 8px; background: rgba(0,0,0,.55); border: 1px solid ${theme.goldDim}66; overflow: hidden;
}
.bw-skill .bw-bar span {
  display: block; height: 100%;
  background: linear-gradient(180deg, #9ec97f, #5d8a48);
}
.bw-skill .bw-val {
  text-align: right; font-variant-numeric: tabular-nums;
  font-family: ${theme.fonts.display}; font-size: 13px;
}
.bw-skill.gm .bw-bar span { background: linear-gradient(180deg, ${theme.goldBright}, ${theme.goldDim}); }
.bw-skill.gm .bw-val { color: ${theme.goldBright}; }
.bw-skill-note { grid-column: 2 / 5; color: ${theme.parchmentDim}; font-size: 13px; padding: 0 0 5px; }
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

export const panel = {
  id: 'skills',
  title: 'Skills',
  key: 'k',

  build(el, ctx) {
    css();
    const character = () => (ctx.character && ctx.character.skills ? ctx.character : ctx.inventory?.character) || { skills: {}, skillLocks: {} };
    const say = (t, kind) => (ctx.hud?.log ? ctx.hud.log(t, kind) : ctx.hud?.toast?.(t, kind));

    const root = h('div', 'bw-skills');
    const head = h('div', 'bw-skills-head');
    const totalEl = h('span');
    head.appendChild(h('span', 'bw-dim', 'the arrow sets whether a skill rises, holds, or pays for others'));
    head.appendChild(totalEl);
    root.appendChild(head);
    el.appendChild(root);

    const rows = new Map();
    for (const group of SKILL_GROUPS) {
      root.appendChild(h('h3', null, group));
      for (const skill of SKILLS.filter((s) => s.group === group)) {
        const row = h('div', 'bw-skill');
        const lock = h('div', 'bw-lock');
        const name = h('div', null, skill.name);
        const bar = h('div', 'bw-bar');
        const fill = h('span');
        bar.appendChild(fill);
        const val = h('div', 'bw-val');
        row.appendChild(lock); row.appendChild(name); row.appendChild(bar); row.appendChild(val);
        root.appendChild(row);
        const note = h('div', 'bw-skill-note');
        const noteRow = h('div', 'bw-skill');
        noteRow.appendChild(h('span'));
        noteRow.appendChild(note);
        root.appendChild(noteRow);

        lock.addEventListener('click', () => {
          const c = character();
          const st = lockState(c);
          const want = nextLock(lockOf(st, skill.id));
          const res = setLock(st, skill.id, want);
          if (!res.ok) { say(res.reason, 'bad'); return; }
          say(`${skill.name} is ${LOCK_WORDS[res.lock]}`);
          ctx.onSkillLock?.(skill.id, res.lock);
          draw();
        });

        rows.set(skill.id, { row, lock, fill, val, note });
      }
    }

    function draw() {
      const c = character();
      const st = lockState(c);
      const stats = c.stats || {};
      const t = total(st);
      totalEl.innerHTML = '';
      const b = h('b', t >= TOTAL_CAP ? 'full' : null, `${t.toFixed(1)} of ${TOTAL_CAP.toFixed(1)}`);
      totalEl.appendChild(b);

      for (const skill of SKILLS) {
        const r = rows.get(skill.id);
        const v = typeof st.skills[skill.id] === 'number' ? st.skills[skill.id] : 0;
        const lock = lockOf(st, skill.id);
        r.val.textContent = v.toFixed(1);
        r.fill.style.width = `${Math.max(0, Math.min(100, (v / SKILL_CAP) * 100))}%`;
        r.row.classList.toggle('gm', v >= SKILL_CAP);
        r.lock.textContent = LOCK_GLYPH[lock];
        r.lock.className = `bw-lock ${lock}`;
        r.lock.title = `${skill.name} ${LOCK_WORDS[lock]}`;

        const s = standingFor(skill.id, st.skills, stats);
        const parts = [];
        if (s.unlocked.length) parts.push(`unlocked: ${s.unlocked.map((a) => a.name).join(', ')}`);
        if (s.next) parts.push(`next: ${s.next.name} at ${s.nextAt}${s.nextReason ? ` (${s.nextReason})` : ''}`);
        if (!parts.length) parts.push(skill.description);
        r.note.textContent = parts.join('. ');
      }
    }

    draw();
    this._draw = draw;
  },

  open() { if (this._draw) this._draw(); },

  tick(dt) {
    this._since = (this._since || 0) + (dt || 0);
    if (this._since < 0.5) return;
    this._since = 0;
    if (this._draw) this._draw();
  },
};

export const LOCK_LIST = LOCKS;
export default panel;
