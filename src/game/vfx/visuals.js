// Which visual every ability wears, and which element its school reads as.
//
// PORTED from the studio's src/abilities/abilityVisuals.ts. The rows are the
// studio's direction, unchanged: family, colour, accent, scale, count, style
// and pose. The ids are the bank's kebab ids; `visualFor` canonicalises so
// abilities.js's camelCase `powerStrike` and the bank's `power-strike` are one
// ability, exactly as models.js's abilityMoves already does.
//
// TWO ADDITIONS, both because the game has more abilities than the studio did:
//
//   `camp` has no row over there at all, because the studio had no camping.
//   It is written below in the same shape as every other row.
//
//   ELEMENTS is the school's default palette, for anything that arrives here
//   without a row of its own. Seven of them, which is the seven the damage and
//   resist tables in src/mmo already speak: fire, frost, lightning, arcane,
//   holy, shadow, nature.

const v = (family, color, scale = 1, count = 1, style = 'runes', pose = null, accent = '#f7f3df') => ({
  family, color, accent, scale, count, style, pose,
});

export const ABILITY_VISUALS = {
  'power-strike': v('slash', '#ffc66b', 1.25, 1, 'embers'),
  'shield-bash': v('impact', '#e7c783', 0.8, 1, 'shards', 'thrust'),
  rend: v('slash', '#e95251', 0.9, 3, 'arc'),
  'crushing-blow': v('impact', '#edaa60', 1.35, 8, 'shards'),
  lunge: v('impact', '#f4e8ba', 0.6, 1, 'shards', 'thrust'),
  sweep: v('slash', '#dfba79', 1.5, 1, 'arc'),
  whirlwind: v('slash', '#e2cb9b', 1.65, 4, 'arc'),
  disarm: v('slash', '#f3f0d4', 0.55, 2, 'shards'),
  'leap-slam': v('impact', '#ffb859', 1.9, 16, 'shards'),
  'battle-cry': v('song', '#ffce80', 1.6, 3, 'runes', 'shout'),
  riposte: v('slash', '#fff0b4', 0.75, 1, 'arc'),
  berserk: v('aura', '#e34832', 1.25, 6, 'embers', 'shout'),
  'aimed-shot': v('projectile', '#dcebb7', 0.65, 1, 'feathers', 'bow'),
  snare: v('trap', '#a6bb8d', 0.8, 1, 'runes', 'kneel'),
  'crippling-shot': v('projectile', '#bccd79', 0.7, 1, 'feathers', 'bow'),
  disengage: v('stealth', '#a4d0ae', 0.9, 4, 'feathers'),
  'hunters-mark': v('mark', '#ff283c', 0.8, 4, 'runes'),
  'double-shot': v('projectile', '#c4e299', 0.7, 2, 'feathers', 'bow'),
  'fleet-foot': v('aura', '#b2debc', 0.6, 2, 'feathers'),
  'beast-call': v('song', '#b8d08a', 1.1, 3, 'feathers', 'shout'),
  'piercing-arrow': v('projectile', '#ffe8a4', 0.85, 1, 'feathers', 'bow'),
  volley: v('volley', '#dfc88b', 1.5, 18, 'feathers', 'bow'),
  'magic-arrow': v('projectile', '#b09bff', 0.65, 1, 'wisps', null, '#e8d7ff'),
  fireball: v('projectile', '#ff762a', 1.2, 1, 'embers', null, '#ffe09b'),
  'ice-shard': v('projectile', '#65d7ff', 1, 1, 'shards', null, '#e2fbff'),
  blink: v('stealth', '#8d9fff', 1.2, 5, 'runes'),
  lightning: v('lightning', '#a5c5ff', 1.25, 1, 'arc'),
  'mana-shield': v('shield', '#8ea0ff', 1.1, 6, 'runes'),
  'frost-nova': v('nova', '#87e7ff', 1.65, 24, 'shards'),
  'chain-lightning': v('lightning', '#b7d0ff', 1.2, 4, 'arc'),
  'arcane-mastery': v('aura', '#c0a5ff', 0.75, 3, 'runes'),
  meteor: v('meteor', '#ff7031', 1.8, 1, 'embers', 'shout'),
  hex: v('mark', '#c488e8', 0.85, 3, 'runes'),
  'eldritch-bolt': v('projectile', '#8be2c2', 0.85, 1, 'wisps', null, '#d0ffb0'),
  'stone-skin': v('shield', '#ad9c85', 1.05, 14, 'shards'),
  ward: v('shield', '#83cbbb', 1.8, 8, 'runes'),
  transmute: v('portal', '#ffd78b', 0.8, 6, 'shards', 'kneel'),
  'spell-plague': v('mark', '#bddb58', 1.2, 7, 'wisps'),
  rift: v('portal', '#a774f0', 1.7, 9, 'wisps', null, '#eda6ff'),
  'elemental-kin': v('aura', '#72d6ba', 0.85, 4, 'shards'),
  'life-drain': v('drain', '#c45177', 1.05, 3, 'wisps'),
  'raise-skeleton': v('portal', '#b2d67c', 1.1, 8, 'shards'),
  'summon-imp': v('portal', '#f37b54', 0.8, 5, 'embers'),
  'bone-spear': v('projectile', '#e5d6ac', 1.2, 1, 'shards'),
  fear: v('nova', '#9780c2', 1.75, 6, 'wisps', 'shout'),
  'curse-of-weakness': v('mark', '#a383b7', 1.05, 5, 'wisps'),
  'corpse-explosion': v('impact', '#b6cd63', 1.65, 18, 'shards'),
  'summon-hound': v('portal', '#7e70bd', 1.35, 4, 'wisps'),
  'lich-form': v('aura', '#8ce8ae', 1.6, 10, 'wisps', 'shout'),
  'raise-champion': v('portal', '#c9e4ad', 1.8, 12, 'shards'),
  heal: v('heal', '#83f0b2', 0.9, 3, 'wisps'),
  cleanse: v('nova', '#e7fff0', 1.1, 7, 'feathers'),
  bless: v('aura', '#f4dd95', 1, 5, 'runes'),
  'consecrate-weapon': v('aura', '#ffd779', 0.8, 4, 'embers'),
  'greater-heal': v('heal', '#abffd7', 1.4, 7, 'wisps'),
  smite: v('lightning', '#fff0bc', 1.6, 1, 'runes'),
  sanctuary: v('shield', '#f9e7b6', 2.1, 12, 'feathers'),
  resurrect: v('heal', '#fff5c9', 1.8, 9, 'feathers', 'kneel'),
  'lay-on-hands': v('heal', '#ffeab3', 1.6, 12, 'runes'),
  hide: v('stealth', '#718496', 0.8, 3, 'wisps', 'kneel'),
  'poison-blade': v('aura', '#abc855', 0.7, 5, 'wisps'),
  'pick-pocket': v('mark', '#dfc886', 0.35, 3, 'embers', 'thrust'),
  backstab: v('slash', '#c65b72', 0.85, 2, 'arc', 'thrust'),
  shadowstep: v('stealth', '#9276bf', 1.3, 6, 'wisps'),
  evasion: v('aura', '#a0b5ce', 1, 5, 'feathers'),
  'expose-weakness': v('mark', '#efc879', 0.85, 4, 'runes', 'thrust'),
  vanish: v('stealth', '#a18cbd', 1.5, 8, 'wisps'),
  provoke: v('song', '#ef956e', 1.2, 2, 'runes', 'music'),
  peace: v('song', '#c1dfc1', 1.35, 3, 'feathers', 'music'),
  discord: v('song', '#d398d4', 1.25, 5, 'arc', 'music'),
  'marching-song': v('song', '#86cec3', 1.25, 4, 'runes', 'music'),
  'war-drum': v('song', '#df9c60', 1.4, 6, 'runes', 'music'),
  lullaby: v('song', '#aaaee5', 1.4, 7, 'wisps', 'music'),
  jump: v('impact', '#c6ba9c', 0.35, 4, 'shards'),
  sprint: v('aura', '#d4cfb3', 0.55, 2, 'feathers'),
  bandage: v('heal', '#e3e0c4', 0.45, 2, 'feathers', 'kneel'),
  meditate: v('aura', '#98bddd', 0.8, 4, 'wisps', 'kneel'),
  // Recall (2026-09-08): three seconds of runes gathering underfoot, then home
  recall: v('stealth', '#b9c6ff', 1.6, 8, 'runes'),
  // Kaldera's own: a fire you sit beside, laid at your feet.
  camp: v('aura', '#ff9a4a', 1.1, 6, 'embers', 'kneel', '#ffd9a0'),
};

/**
 * The seven elements, as a colour, an accent and which of the four authored
 * signature effects reads as that element.
 */
export const ELEMENTS = {
  fire: { color: '#ff762a', accent: '#ffe09b', tint: '#ffffff', signature: 'fireball' },
  frost: { color: '#65d7ff', accent: '#e2fbff', tint: '#4fbcff', signature: 'fireball' },
  lightning: { color: '#a5c5ff', accent: '#e8f4ff', tint: '#89b4ff', signature: 'lightning' },
  arcane: { color: '#b09bff', accent: '#e8d7ff', tint: '#a98cff', signature: 'missiles' },
  holy: { color: '#ffe9a8', accent: '#fff6d8', tint: '#ffdf94', signature: 'healing' },
  shadow: { color: '#a383b7', accent: '#d6bfe4', tint: '#8f6fae', signature: 'missiles' },
  nature: { color: '#86e05a', accent: '#d6f8b6', tint: '#7fdc63', signature: 'healing' },
};

export const ELEMENT_IDS = Object.keys(ELEMENTS);

/** Ability ids are camelCase in abilities.js and kebab in the bank and above. */
export const canonAbilityId = (id) => String(id == null ? '' : id).replace(/[^a-z0-9]+/gi, '').toLowerCase();

const BY_CANON = new Map(Object.entries(ABILITY_VISUALS).map(([key, value]) => [canonAbilityId(key), { id: key, visual: value }]));

/** The bank's kebab id for an ability, whichever spelling came in. */
export function kebabAbilityId(id) {
  const row = BY_CANON.get(canonAbilityId(id));
  return row ? row.id : null;
}

/** One ability's visual row, or null when nothing here claims it. */
export function visualFor(id) {
  const row = BY_CANON.get(canonAbilityId(id));
  return row ? row.visual : null;
}

/**
 * Which element a school reads as when an ability has no row of its own.
 * Warrior, Ranger, Rogue and Bard are not casters; their default is the
 * physical accent rather than an element, and `elementForSchool` says so by
 * answering null so a caller can fall back to the family's own colour.
 */
export const SCHOOL_ELEMENT = {
  mage: 'frost',
  sorcerer: 'arcane',
  necromancer: 'shadow',
  healer: 'holy',
  warrior: null,
  ranger: null,
  rogue: null,
  bard: null,
  everyone: null,
};

export const elementForSchool = (school) => SCHOOL_ELEMENT[String(school || '').toLowerCase()] ?? null;

/**
 * The element of one damage type, which is the better answer when the ability
 * carries one: a Healer's Smite is holy, a Mage's Fireball is fire, and the
 * school alone would have called them both something else.
 */
export const DAMAGE_ELEMENT = {
  fire: 'fire',
  cold: 'frost',
  energy: 'lightning',
  holy: 'holy',
  poison: 'nature',
  physical: null,
};

export const elementForDamage = (type) => DAMAGE_ELEMENT[String(type || '').toLowerCase()] ?? null;

/** The palette for an element name, falling back to arcane. */
export const elementPalette = (name) => ELEMENTS[name] || ELEMENTS.arcane;
