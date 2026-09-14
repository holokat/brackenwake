// Every profession skill, its gain curve and its cap. Combat capability is
// derived from class and level in combat_proficiency.js. Pure and DOM-free.
//
// The historical 52-entry catalogue is retained for saves and combat formula
// inputs. Only the profession allowlist below can gain practice. Professions
// advance independently; no shared budget or donor skill limits their gains.

import { isProfessionSkill } from './skill_policy.js';

export const SKILL_CAP = 100;    // per profession skill
export const TOTAL_CAP = 1500;   // profession-sheet maximum, never a donor cap
export const LOCKS = ['up', 'locked', 'down'];
export const DEFAULT_LOCK = 'up';

export const SKILL_GROUPS = [
  'Combat, melee',
  'Combat, ranged',
  'Magic',
  'Healing and support',
  'Gathering',
  'Crafting',
  'Roguery',
  'Beasts',
  'Body',
];

const S = (id, name, group, description) => ({ id, name, group, description });

export const SKILLS = [
  // Combat, melee
  S('swordsmanship', 'Swordsmanship', 'Combat, melee', 'hit chance and damage with blades'),
  S('macefighting', 'Macefighting', 'Combat, melee', 'hit chance and damage with maces, mauls, hammers; chance to stun'),
  S('fencing', 'Fencing', 'Combat, melee', 'hit chance and damage with daggers, rapiers, spears; faster swings'),
  S('wrestling', 'Wrestling', 'Combat, melee', 'unarmed hit chance and damage; disarm chance'),
  S('polearms', 'Polearms', 'Combat, melee', 'hit chance and damage with halberds and glaives; reach and cleave'),
  S('tactics', 'Tactics', 'Combat, melee', 'flat damage multiplier for every melee weapon'),
  S('anatomy', 'Anatomy', 'Combat, melee', 'damage bonus and the ceiling on Healing'),
  S('parrying', 'Parrying', 'Combat, melee', 'chance to block with a shield or a second weapon'),
  // Combat, ranged
  S('archery', 'Archery', 'Combat, ranged', 'hit chance and damage with bows'),
  S('marksmanship', 'Marksmanship', 'Combat, ranged', 'crossbows and thrown; slower, harder hitting'),
  S('tracking', 'Tracking', 'Combat, ranged', 'reveals what is nearby and how far; range from skill'),
  // Magic
  S('magery', 'Magery', 'Magic', 'the classic circles: fire, cold, lightning, blink, shield'),
  S('evaluatingIntelligence', 'Evaluating Intelligence', 'Magic', "spell damage bonus, the mage's Tactics"),
  S('meditation', 'Meditation', 'Magic', 'mana regeneration; blocked by heavy armour'),
  S('resistingSpells', 'Resisting Spells', 'Magic', 'reduces incoming magic damage and effect duration'),
  S('necromancy', 'Necromancy', 'Magic', 'raising, summoning, draining, fear'),
  S('spiritSpeak', 'Spirit Speak', 'Magic', 'strengthens necromancy, lets you hear the dead'),
  S('chivalry', 'Chivalry', 'Magic', "the paladin's small holy magic, works in plate"),
  S('mysticism', 'Mysticism', 'Magic', 'wards, curses, the odd and the elemental'),
  S('inscription', 'Inscription', 'Magic', 'writes scrolls, raises spell damage a little'),
  // Healing and support
  S('healing', 'Healing', 'Healing and support', 'bandages, cures, resurrection at high skill'),
  S('veterinary', 'Veterinary', 'Healing and support', 'the same, for animals and summons'),
  S('poisoning', 'Poisoning', 'Healing and support', 'applies poison to blades and food'),
  S('musicianship', 'Musicianship', 'Healing and support', 'the gate to the bard skills below'),
  S('provocation', 'Provocation', 'Healing and support', 'sets two monsters on each other'),
  S('peacemaking', 'Peacemaking', 'Healing and support', 'calms a fight, drops aggro'),
  S('discordance', 'Discordance', 'Healing and support', "weakens a monster's stats while it hears you"),
  // Gathering
  S('mining', 'Mining', 'Gathering', 'which ore you can extract, yield, and the chance of a rare vein'),
  S('lumberjacking', 'Lumberjacking', 'Gathering', 'which wood you can fell, yield, damage bonus with axes'),
  S('foraging', 'Foraging', 'Gathering', 'herbs, mushrooms, berries, reagents'),
  S('fishing', 'Fishing', 'Gathering', 'fish, and what comes up with them'),
  S('skinning', 'Skinning', 'Gathering', 'hides and scales from what you kill'),
  // Crafting
  S('blacksmithing', 'Blacksmithing', 'Crafting', 'weapons and metal armour; quality and rarity chance'),
  S('tailoring', 'Tailoring', 'Crafting', 'cloth and leather armour, bags'),
  S('carpentry', 'Carpentry', 'Crafting', 'bows, staves, furniture, house parts'),
  S('tinkering', 'Tinkering', 'Crafting', 'tools, traps, keys, clockwork'),
  S('alchemy', 'Alchemy', 'Crafting', 'potions from what Foraging brings'),
  S('cooking', 'Cooking', 'Crafting', 'food that buffs; the cheapest useful skill'),
  S('fletching', 'Fletching', 'Crafting', 'arrows and bolts'),
  S('masonry', 'Masonry', 'Crafting', 'stone, and the good foundations'),
  // Roguery
  S('stealth', 'Stealth', 'Roguery', 'moving unseen'),
  S('hiding', 'Hiding', 'Roguery', 'becoming unseen while still'),
  S('lockpicking', 'Lockpicking', 'Roguery', 'chests and doors'),
  S('detectHidden', 'Detect Hidden', 'Roguery', 'seeing what hides, including traps'),
  S('stealing', 'Stealing', 'Roguery', 'from monsters and, later, players'),
  S('removeTrap', 'Remove Trap', 'Roguery', 'chests that would otherwise take a hand off'),
  // Beasts
  S('animalTaming', 'Animal Taming', 'Beasts', 'wins you a pet; difficulty scales hard with the beast'),
  S('animalLore', 'Animal Lore', 'Beasts', 'how good the pet gets and what it can learn'),
  S('herding', 'Herding', 'Beasts', 'moves animals without fighting them'),
  // Body
  S('camping', 'Camping', 'Body', 'logging out safely, resting bonus, campfires'),
  S('swimming', 'Swimming', 'Body', 'speed and stamina in water'),
  S('focus', 'Focus', 'Body', 'stamina regeneration and resistance to interruption'),
];

// Counted from the document's own table on 2026-09-04. Its prose says 44.
export const SKILL_COUNT = 52;

export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

/** The gain curve, exactly the document's table. `uses` is its own last column. */
export const BANDS = [
  { min: 0, max: 30, step: 0.3, uses: 100 },
  { min: 30, max: 50, step: 0.2, uses: 100 },
  { min: 50, max: 70, step: 0.1, uses: 200 },
  { min: 70, max: 85, step: 0.05, uses: 300 },
  { min: 85, max: 95, step: 0.03, uses: 333 },
  { min: 95, max: 100, step: 0.01, uses: 500 },
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
// Skill values are hundredths: 0.3, 0.05, 0.03 and 0.01 all land on two
// decimals, so rounding each write there keeps 84.99999999999999 out of the
// save and out of the band test.
const r2 = (v) => Math.round(v * 100) / 100;

/** The band step at a value. 0 at the cap: a grandmaster has nowhere to go. */
export function gainStep(skill) {
  const v = typeof skill === 'number' && Number.isFinite(skill) ? skill : 0;
  if (v >= SKILL_CAP) return 0;
  if (v < 0) return BANDS[0].step;
  for (const b of BANDS) if (v >= b.min && v < b.max) return b.step;
  return 0;
}

/** gainChance(skill, difficulty) = clamp(0.55 - (skill - difficulty) * 0.006, 0.02, 0.90) */
export function gainChance(skill, difficulty) {
  const s = typeof skill === 'number' && Number.isFinite(skill) ? skill : 0;
  const d = typeof difficulty === 'number' && Number.isFinite(difficulty) ? difficulty : 0;
  return clamp(0.55 - (s - d) * 0.006, 0.02, 0.90);
}

/** Profession practice added up, to the hundredth. Combat practice is derived. */
export function total(state) {
  const map = state && state.skills ? state.skills : state;
  let t = 0;
  if (map && typeof map === 'object') {
    for (const id of Object.keys(map)) {
      if (!isProfessionSkill(id)) continue;
      const v = map[id];
      if (typeof v === 'number' && Number.isFinite(v)) t += v;
    }
  }
  return r2(t);
}

export function lockOf(state, id) {
  const l = state && state.locks ? state.locks[id] : undefined;
  return LOCKS.includes(l) ? l : DEFAULT_LOCK;
}

/**
 * Set a skill to up, locked or down. Returns `{ ok, lock, reason }` and leaves
 * the state untouched when it refuses, so a bad value cannot half apply.
 */
export function setLock(state, skillId, lock) {
  if (!state || typeof state !== 'object') return { ok: false, lock: null, reason: 'there is no character to set a lock on' };
  if (!SKILL_BY_ID.has(skillId)) return { ok: false, lock: lockOf(state, skillId), reason: `"${skillId}" is not a skill` };
  if (!LOCKS.includes(lock)) {
    return {
      ok: false, lock: lockOf(state, skillId),
      reason: `"${lock}" is not a lock; a skill is ${LOCKS.join(', ')}`,
    };
  }
  if (!state.locks || typeof state.locks !== 'object') state.locks = {};
  state.locks[skillId] = lock;
  return { ok: true, lock, reason: null };
}

const milestoneFor = (name, from, to) => {
  // The round tens, and 100 which is the grandmastery.
  const crossed = Math.floor(r2(to) / 10) * 10;
  if (crossed < 10 || from >= crossed) return null;
  const at = Math.min(crossed, SKILL_CAP);
  return {
    at,
    grandmaster: at >= SKILL_CAP,
    text: at >= SKILL_CAP ? `Grandmaster ${name}` : `${name} ${at}`,
  };
};

/**
 * One lesson. `state` is `{ skills: { id: value }, locks: { id: lock } }`.
 * `success` says whether the profession action succeeded: failure teaches at half the
 * chance. Mutates `state` on a gain and returns
 *
 *   { gained, from, to, tookFrom, refused, reason, milestone, chance, step }
 *
 * `refused` marks a gain the rules would not allow (a non-profession, a locked
 * skill, or a profession at 100) and always carries a `reason`. An unlucky roll
 * is not a refusal: it comes back gained false, refused false, reason null.
 */
export function rollGain(state, skillId, difficulty, success = true, rng = Math.random) {
  const no = (reason, from = 0) => ({
    gained: false, from, to: from, tookFrom: null, refused: true, reason, milestone: null, chance: 0, step: 0,
  });
  if (!state || typeof state !== 'object') return no('there is no character to teach');
  if (!state.skills || typeof state.skills !== 'object') state.skills = {};
  const def = SKILL_BY_ID.get(skillId);
  if (!def) return no(`"${skillId}" is not a skill`);
  if (!isProfessionSkill(skillId)) return no(`${def.name} is governed by class level and cannot improve through practice`);

  const raw = state.skills[skillId];
  const from = typeof raw === 'number' && Number.isFinite(raw) ? r2(raw) : 0;

  const lock = lockOf(state, skillId);
  if (lock !== 'up') {
    return no(lock === 'locked'
      ? `${def.name} is locked and will not rise`
      : `${def.name} is marked to fall and will not rise`, from);
  }
  if (from >= SKILL_CAP) return no(`${def.name} is already ${SKILL_CAP.toFixed(1)} and cannot rise`, from);

  const step = gainStep(from);
  const chance = Math.min(1, gainChance(from, difficulty) * (success ? 1 : 0.5) * (1 + Math.max(0, Number.isFinite(state.gainChanceBonus) ? state.gainChanceBonus : 0)));
  if (rng() >= chance) {
    return { gained: false, from, to: from, tookFrom: null, refused: false, reason: null, milestone: null, chance, step };
  }

  const to = Math.min(SKILL_CAP, r2(from + step));
  state.skills[skillId] = to;
  return {
    gained: true, from, to, tookFrom: null, refused: false, reason: null,
    milestone: milestoneFor(def.name, from, to), chance, step,
  };
}

/**
 * The table has to be a table: no repeated ids, no empty group, no group that
 * is not one of the nine, and the count the document was written against.
 * Throws, and is called at load, so a bad edit dies at import instead of
 * shipping a skill nothing can train.
 */
export function auditSkills() {
  const seenId = new Set();
  const seenName = new Set();
  for (const s of SKILLS) {
    if (!s.id || !s.name || !s.group || !s.description) throw new Error(`skills: incomplete entry ${JSON.stringify(s)}`);
    if (seenId.has(s.id)) throw new Error(`skills: the id "${s.id}" appears twice`);
    if (seenName.has(s.name)) throw new Error(`skills: the name "${s.name}" appears twice`);
    if (!SKILL_GROUPS.includes(s.group)) throw new Error(`skills: "${s.name}" is in "${s.group}", which is not one of the nine groups`);
    seenId.add(s.id);
    seenName.add(s.name);
  }
  for (const g of SKILL_GROUPS) {
    if (!SKILLS.some((s) => s.group === g)) throw new Error(`skills: the group "${g}" is empty`);
  }
  // Groups must stay contiguous and in the document's order, or the character
  // sheet would print a group twice.
  const order = [];
  for (const s of SKILLS) if (order[order.length - 1] !== s.group) order.push(s.group);
  if (order.join('|') !== SKILL_GROUPS.join('|')) {
    throw new Error(`skills: groups are out of order or split: ${order.join(', ')}`);
  }
  if (SKILLS.length !== SKILL_COUNT) {
    throw new Error(`skills: the table holds ${SKILLS.length} skills, and SKILL_COUNT says ${SKILL_COUNT}`);
  }
  return { count: SKILLS.length, groups: SKILL_GROUPS.length };
}

auditSkills();
