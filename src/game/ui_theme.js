// The look: one palette, one set of fonts, one sheet of ornament, injected
// once and shared by the HUD, the codex and every panel that lives inside it.
//
// Nothing here is a downloaded asset. The filigree, the corner scrolls, the
// arch behind the paper doll, the attribute icons and the item glyphs are all
// SVG written in code and handed to CSS as data URIs, so the whole look ships
// in this file and can be measured in node without a browser.
//
// Two rules this file keeps for the rest of the interface:
//
//   Rarity colour is items.js's, never a second copy. `theme.rarity` is built
//   from RARITY at load, so a seventh rarity gets a slot border for free.
//
//   Every base in items.js has a glyph. `auditGlyphs()` runs at import and
//   throws if a base ever falls through to nothing, which is the guard against
//   the class of bug where four biomes shipped a tool that did nothing.

import { RARITY, RARITY_ORDER, ARMOR_TIERS, BASES } from '../mmo/items.js';

// ------------------------------------------------------------------ tokens

export const theme = {
  // stone, from the deepest shadow to the lit face of the frame
  stone: '#0d0b09',
  stoneUp: '#17130f',
  stoneDeep: '#060504',
  stoneEdge: '#231c14',

  // parchment, for anything written down
  parchment: '#e8d9b5',
  parchmentDim: '#cbb894',
  parchmentFaint: '#9c8a69',

  // gold, the whole border language
  gold: '#c9a44a',
  goldDim: '#8f6f2a',
  goldBright: '#f2dc9c',

  // the dark red plate an active tab sits on
  plate: '#5b1d16',
  plateUp: '#7a2a20',

  // the three pools, the same hexes hud.js has always used
  health: '#e04b3a',
  mana: '#4a8ff0',
  stamina: '#e0bb3a',

  fonts: {
    display: "'Cinzel', 'Trajan Pro', Palatino, Georgia, serif",
    body: "'Cormorant Garamond', 'EB Garamond', Palatino, Georgia, serif",
    plain: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },

  /** items.js's rarity colours, by id. Never typed a second time. */
  rarity: Object.fromEntries(RARITY_ORDER.map((r) => [r, RARITY[r].colour])),
  /** Which rarities are lit from inside. Epic and above, per 03-ITEMS-LOOT.md's ladder. */
  glowing: RARITY_ORDER.slice(RARITY_ORDER.indexOf('epic')),
};

/**
 * The tint an item's art takes in a slot. Armour goes by its material band,
 * everything else by what it is made of. These are presentation values chosen
 * to read on dark stone; the 3D materials in gear_visuals.js are their own
 * numbers and neither file reads the other.
 */
export const MATERIAL_TINT = {
  cloth: '#a2917a', leather: '#9a6a3f', studded: '#7b5433',
  ring: '#9aa0a8', chain: '#9aa0a8', plate: '#c2c8d0',
  wood: '#8a6a42', bone: '#d8cdb4', steel: '#c2c8d0', gold: '#d8b451',
  herb: '#7fae63', glass: '#7fc4d8', hide: '#a9784a', stone: '#9a958c',
};

/** A seventh armour tier with no tint would draw a grey blob and say nothing. */
export function auditTints() {
  for (const t of ARMOR_TIERS) {
    if (!MATERIAL_TINT[t.id]) throw new Error(`ui_theme: the ${t.material} tier has no tint`);
  }
  return ARMOR_TIERS.length;
}

// ------------------------------------------------------------------- svg
// Everything below builds a string. `url()` encodes it. No file is fetched.

const enc = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}")`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

/**
 * The corner of a frame, drawn once and turned three times. A double rule, a
 * stud where the rules meet, and a curl inside it.
 */
function cornerArt(g, gd) {
  return `
    <path d="M3 30 L3 3 L30 3" fill="none" stroke="${g}" stroke-width="1.6"/>
    <path d="M9 30 L9 9 L30 9" fill="none" stroke="${gd}" stroke-width="1.1"/>
    <path d="M3 3 L9 9" stroke="${g}" stroke-width="1.2"/>
    <path d="M9 22 Q9 13 18 13" fill="none" stroke="${g}" stroke-width="1.1"/>
    <path d="M14 9 Q14 15 20 15" fill="none" stroke="${gd}" stroke-width="0.9"/>
    <circle cx="9" cy="9" r="2.1" fill="${g}"/>
    <circle cx="18" cy="13" r="1.3" fill="${gd}"/>`;
}

/** The nine slice a panel wears as its border. Slice 30, stretch. */
export function frameUrl(g = theme.gold, gd = theme.goldDim) {
  const turns = [0, 90, 180, 270].map((a) => `<g transform="rotate(${a} 60 60)">${cornerArt(g, gd)}</g>`).join('');
  const rules = `
    <path d="M30 3 H90 M30 9 H90 M30 117 H90 M30 111 H90" stroke="${g}" stroke-width="1.2" fill="none"/>
    <path d="M3 30 V90 M9 30 V90 M117 30 V90 M111 30 V90" stroke="${g}" stroke-width="1.2" fill="none"/>`;
  return enc(svg(120, 120, `${rules}${turns}`));
}

/** A lighter corner mark, for the panels inside a frame. */
export function cornerUrl(g = theme.goldDim) {
  return enc(svg(18, 18, `
    <path d="M1 17 L1 1 L17 1" fill="none" stroke="${g}" stroke-width="1.2"/>
    <circle cx="4.5" cy="4.5" r="1.6" fill="${g}"/>`));
}

/** A thin gold rule with a diamond at its middle, for under a header. */
export function ruleUrl(g = theme.gold) {
  return enc(svg(200, 9, `
    <path d="M0 4.5 H84 M116 4.5 H200" stroke="${g}" stroke-width="1" opacity=".75"/>
    <path d="M100 0.6 L104.4 4.5 L100 8.4 L95.6 4.5 Z" fill="${g}"/>
    <path d="M88 4.5 h4 M108 4.5 h4" stroke="${g}" stroke-width="1"/>`));
}

/**
 * The arch the character stands in: a tall pointed opening with a gold trim,
 * a keystone, and two columns. Drawn at 300 x 460 and stretched by CSS.
 */
export function archUrl(g = theme.gold, gd = theme.goldDim) {
  const opening = 'M28 452 L28 196 Q28 44 150 22 Q272 44 272 196 L272 452 Z';
  return enc(svg(300, 460, `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b3a4a"/>
        <stop offset="0.42" stop-color="#4a4738"/>
        <stop offset="1" stop-color="#171310"/>
      </linearGradient>
      <clipPath id="arch"><path d="${opening}"/></clipPath>
    </defs>
    <path d="${opening}" fill="url(#sky)"/>
    <g clip-path="url(#arch)" opacity=".55">
      <path d="M-10 372 L64 300 L128 356 L196 288 L262 348 L320 306 L320 470 L-10 470 Z" fill="#1d1c16"/>
      <path d="M-10 408 L52 366 L120 404 L188 358 L250 402 L320 366 L320 470 L-10 470 Z" fill="#12100c"/>
      <circle cx="196" cy="96" r="26" fill="#d8cfae" opacity=".5"/>
    </g>
    <path d="${opening}" fill="none" stroke="${g}" stroke-width="3"/>
    <path d="M40 452 L40 198 Q40 58 150 36 Q260 58 260 198 L260 452" fill="none" stroke="${gd}" stroke-width="1.4"/>
    <path d="M150 8 L162 24 L150 40 L138 24 Z" fill="${g}"/>
    <path d="M12 452 L12 200 Q12 40 150 8 Q288 40 288 200 L288 452" fill="none" stroke="${gd}" stroke-width="1.6"/>
    <path d="M6 452 h36 M258 452 h36" stroke="${g}" stroke-width="3"/>
    <circle cx="46" cy="206" r="3" fill="${g}"/>
    <circle cx="254" cy="206" r="3" fill="${g}"/>`));
}

/**
 * A faint parchment sheet, for the flavour box and the log: a dark ground with
 * a few fibres so it is not a flat rectangle.
 */
export function parchmentUrl() {
  return enc(svg(140, 90, `
    <rect width="140" height="90" fill="#1a1610"/>
    <g stroke="#2a2318" stroke-width="1" fill="none" opacity=".85">
      <path d="M0 14 H140 M0 41 H140 M0 68 H140"/>
      <path d="M18 0 V90 M74 0 V90 M119 0 V90"/>
    </g>`));
}

// ------------------------------------------------------------------- icons
// One line drawing each, on a 24 x 24 field, stroked in currentColor so a row
// can tint its own icon. These are the ATTRIBUTES and COMBAT STATS marks.

export const ICONS = {
  sword: '<path d="M6 18 L18 6 M15 4 L20 4 L20 9 M5 17 l2 2 M4 20 l3 -3" />',
  boot: '<path d="M8 4 v9 M8 13 h5 l5 4 v3 H6 v-6 z" />',
  book: '<path d="M4 5 h7 a2 2 0 0 1 2 2 v12 a2 2 0 0 0 -2 -2 H4 z M20 5 h-7 a2 2 0 0 0 -2 2 v12 a2 2 0 0 1 2 -2 h7 z" />',
  heart: '<path d="M12 20 C4 14 3 9 6 6.6 8.4 4.7 11 6 12 8 13 6 15.6 4.7 18 6.6 21 9 20 14 12 20 Z" />',
  eye: '<path d="M2 12 C6 6 18 6 22 12 C18 18 6 18 2 12 Z" /><circle cx="12" cy="12" r="3" />',
  shield: '<path d="M12 3 L20 6 v6 c0 5 -4 7 -8 9 -4 -2 -8 -4 -8 -9 V6 z" />',
  helm: '<path d="M5 12 a7 7 0 0 1 14 0 v6 h-4 l-1 -3 h-4 l-1 3 H5 z M12 5 v7" />',
  drop: '<path d="M12 3 C7 10 5 12 5 15 a7 7 0 0 0 14 0 c0 -3 -2 -5 -7 -12 Z" />',
  bolt: '<path d="M13 2 L5 13 h5 l-1 9 8 -12 h-5 z" />',
  flame: '<path d="M12 22 c-4 0 -6 -3 -6 -6 0 -4 4 -5 4 -9 3 2 3 4 3 5 1 -1 1 -3 1 -4 3 3 4 6 4 8 0 3 -2 6 -6 6 Z" />',
  snow: '<path d="M12 2 v20 M3 7 l18 10 M21 7 L3 17" />',
  flask: '<path d="M10 3 h4 M11 3 v6 L6 19 a2 2 0 0 0 2 3 h8 a2 2 0 0 0 2 -3 L13 9 V3" />',
  coin: '<circle cx="12" cy="12" r="8" /><path d="M9 9.5 h6 M9 14.5 h6 M12 8 v8" />',
  gem: '<path d="M7 4 h10 l4 5 -9 11 L3 9 Z M3 9 h18 M7 4 l3 5 M17 4 l-3 5 M10 9 l2 11 M14 9 l-2 11" />',
  scale: '<path d="M12 4 v16 M6 20 h12 M4 8 h16 M4 8 L1 14 h6 z M20 8 l3 6 h-6 z" />',
  crossed: '<path d="M5 5 L19 19 M19 5 L5 19" />',
};

/** One icon, as an inline svg string. `size` is px. */
export function icon(name, colour = 'currentColor', size = 15) {
  const body = ICONS[name] || ICONS.crossed;
  return `<svg class="bw-i" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
    stroke="${colour}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/** The five stats, the mark each wears, and the word the reference uses. */
export const STAT_ICONS = { str: 'sword', dex: 'boot', int: 'book', con: 'heart', wis: 'eye' };
export const STAT_WORDS = { str: 'Strength', dex: 'Dexterity', int: 'Intellect', con: 'Constitution', wis: 'Wisdom' };

// ------------------------------------------------------------ item glyphs
// A drawing per kind of thing, filled rather than stroked, so a 44 px slot
// reads at a glance. The tint comes from the item's material.

export const GLYPHS = {
  sword: '<path d="M20 3 l1 4 -9 9 -1.6 -1.6 z M9.6 15.8 L8 17.4 6.6 16 5 17.6 l1.4 1.4 -1.6 1.6 1.4 1.4 1.6 -1.6 1.4 1.4 1.6 -1.6 -1.4 -1.4 1.6 -1.6 z"/>',
  axe: '<path d="M6 20 L17 9 l3 3 -11 11 z M14 4 c4 0 7 3 7 6 -2 -1 -4 -1 -6 0 1 -2 0 -5 -1 -6 z"/>',
  bow: '<path d="M7 3 c7 2 11 8 11 18 -1 0 -2 0 -3 -1 0 -8 -3 -13 -8 -15 z M6 4 L20 20"/>',
  dagger: '<path d="M16 3 l2 2 -7 7 -2 -2 z M7 12 l5 5 -1.6 1.6 -5 -5 z M4 19 l3 3 M5 16 l3 3"/>',
  staff: '<path d="M11 21 L16 4 l2 .6 -5 17 z M17 2 a3 3 0 1 1 -.1 0 z"/>',
  spear: '<path d="M13 2 l3 5 -3 4 -3 -4 z M12 11 l1 11 -2 0 z"/>',
  mace: '<path d="M9 22 l7 -7 -2 -2 -7 7 z M17 3 a5 5 0 1 1 -.1 0 z M12 4 h10 M17 1 v10"/>',
  shield: '<path d="M12 2 L21 5 v7 c0 6 -5 8 -9 10 -4 -2 -9 -4 -9 -10 V5 z"/>',
  helm: '<path d="M4 13 a8 8 0 0 1 16 0 v7 h-5 l-1 -4 h-4 l-1 4 H4 z"/>',
  chest: '<path d="M8 3 l4 3 4 -3 5 2 -1 6 -2 -1 v11 H6 V10 l-2 1 -1 -6 z"/>',
  gloves: '<path d="M6 9 c0 -5 2 -6 3 -6 s2 1 2 3 v3 h1 V4 h2 v5 h1 V5 h2 v6 c0 6 -2 10 -5 10 s-6 -4 -6 -12 z"/>',
  boots: '<path d="M7 2 h5 v11 l7 5 v4 H5 V2 z"/>',
  legs: '<path d="M6 2 h12 l-1 20 h-4 l-1 -11 -1 11 H7 z"/>',
  bracer: '<path d="M6 6 h12 l-2 12 H8 z M5 4 h14 v2 H5 z"/>',
  belt: '<path d="M2 9 h20 v6 H2 z M9 8 h6 v8 H9 z" fill-rule="evenodd"/>',
  cloak: '<path d="M12 2 l7 4 3 16 -10 -3 -10 3 3 -16 z"/>',
  ring: '<path d="M12 7 a7 7 0 1 0 .1 0 z m0 3 a4 4 0 1 1 -.1 0 z M12 1 l3 5 h-6 z"/>',
  amulet: '<path d="M5 3 c3 7 5 8 7 8 s4 -1 7 -8 l2 1 c-3 8 -6 9 -6 9 h-6 s-3 -1 -6 -9 z M12 13 a4 4 0 1 1 -.1 0 z"/>',
  book: '<path d="M4 4 h7 v16 H4 z M13 4 h7 v16 h-7 z M11 3 h2 v18 h-2 z"/>',
  torch: '<path d="M11 10 h2 v12 h-2 z M12 1 c3 4 4 5 4 7 a4 4 0 0 1 -8 0 c0 -2 1 -3 4 -7 z"/>',
  skull: '<path d="M12 2 a8 8 0 0 1 8 8 v4 l-3 2 v3 H7 v-3 l-3 -2 v-4 a8 8 0 0 1 8 -8 z M9 10 a2 2 0 1 0 .1 0 z M15 10 a2 2 0 1 0 .1 0 z"/>',
  lute: '<path d="M9 12 a5 6 0 1 0 6 4 L20 5 l-2 -1 -5 11 a5 6 0 0 0 -4 -3 z"/>',
  pick: '<path d="M11 8 l2 2 -8 12 -2 -2 z M2 6 c6 -5 14 -5 20 0 -6 -2 -8 -1 -10 1 -2 -2 -5 -3 -10 -1 z"/>',
  tool: '<path d="M14 2 a6 6 0 0 0 -5 9 L2 18 l4 4 7 -7 a6 6 0 0 0 7 -9 l-4 4 -3 -3 z"/>',
  ingot: '<path d="M4 15 h16 l3 5 H1 z M7 9 h13 l2 5 H5 z"/>',
  ore: '<path d="M6 8 l6 -4 7 4 -2 9 -8 4 -5 -6 z M12 4 l0 8 5 5 M12 12 L6 8"/>',
  log: '<path d="M2 8 h14 a4 4 0 0 1 0 8 H2 a4 4 0 0 1 0 -8 z M6 12 a2 2 0 1 0 .1 0 z"/>',
  arrow: '<path d="M12 1 l3 6 h-6 z M11 7 h2 v14 h-2 z M8 21 l4 -3 4 3 -4 2 z"/>',
  flask: '<path d="M9 2 h6 v2 h-1 v5 l4 8 a3 3 0 0 1 -3 5 H9 a3 3 0 0 1 -3 -5 l4 -8 V4 H9 z"/>',
  food: '<path d="M4 12 a8 5 0 0 1 16 0 z M3 14 h18 v3 a3 3 0 0 1 -3 3 H6 a3 3 0 0 1 -3 -3 z"/>',
  herb: '<path d="M12 22 V10 M12 12 C6 12 4 8 4 4 c5 0 8 3 8 8 z M12 14 c6 0 8 -4 8 -8 -5 0 -8 3 -8 8 z"/>',
  gem: '<path d="M7 3 h10 l5 6 -10 12 L2 9 z"/>',
  hide: '<path d="M4 3 c4 1 5 4 8 4 s4 -3 8 -4 c1 5 -1 7 -2 9 1 3 1 6 -1 8 -3 2 -7 2 -10 0 -2 -2 -2 -5 -1 -8 -1 -2 -3 -4 -2 -9 z"/>',
  bandage: '<path d="M3 9 l6 -6 12 12 -6 6 z M9 9 l6 6"/>',
  stone: '<path d="M5 7 l6 -3 8 4 -1 9 -8 4 -6 -6 z"/>',
  parcel: '<path d="M3 7 l9 -4 9 4 -9 4 z M3 9 v8 l9 4 v-8 z M21 9 v8 l-9 4 v-8 z"/>',
};

/** What the piece of armour on this slot looks like. */
const PIECE_GLYPH = {
  head: 'helm', chest: 'chest', hands: 'gloves', feet: 'boots',
  legs: 'legs', wrists: 'bracer', waist: 'belt', back: 'cloak',
};

const MATERIAL_GLYPH = {
  ingot: 'ingot', ore: 'ore', log: 'log', arrow: 'arrow', bolt: 'arrow',
  potion: 'flask', food: 'food', reagent: 'herb', gem: 'gem', bandage: 'bandage',
  stone: 'stone', venison: 'food', game_meat: 'food', reagent_pouch: 'herb',
};

/**
 * The glyph for a base record. Pure, and total: every base in items.js lands
 * on a drawing, which `auditGlyphs()` proves at import.
 */
export function glyphNameFor(base) {
  if (!base) return 'parcel';
  const kinds = Array.isArray(base.kinds) ? base.kinds : [];
  const id = String(base.id || '');
  if (base.kind === 'weapon') {
    if (/axe/.test(id)) return 'axe';
    if (kinds.includes('ranged')) return id === 'throwing_knives' ? 'dagger' : 'bow';
    if (kinds.includes('polearm')) return 'spear';
    if (kinds.includes('staff')) return 'staff';
    if (kinds.includes('mace')) return 'mace';
    if (id === 'dagger' || id === 'spear') return id === 'spear' ? 'spear' : 'dagger';
    return 'sword';
  }
  if (base.kind === 'shield') return 'shield';
  if (base.kind === 'armour') return PIECE_GLYPH[base.piece] || 'chest';
  if (base.kind === 'jewellery') return id === 'amulet' ? 'amulet' : 'ring';
  if (base.kind === 'offhand') {
    if (kinds.includes('tome')) return 'book';
    if (kinds.includes('torch')) return 'torch';
    if (kinds.includes('skull')) return 'skull';
    return 'book';
  }
  if (base.kind === 'instrument') return 'lute';
  if (base.kind === 'food' || base.kind === 'meal') return 'food';
  if (base.kind === 'tool') return id === 'pickaxe' ? 'pick' : 'tool';
  if (base.kind === 'material') {
    if (MATERIAL_GLYPH[id]) return MATERIAL_GLYPH[id];
    if (kinds.includes('leather')) return 'hide';
    if (kinds.includes('forage')) return 'herb';
    if (kinds.includes('ore')) return 'ore';
    if (/ingot/.test(id)) return 'ingot';
    if (/ore/.test(id)) return 'ore';
    if (/log|wood|plank/.test(id)) return 'log';
    if (/hide|leather|pelt|scale/.test(id)) return 'hide';
    return 'parcel';
  }
  return 'parcel';
}

/** The colour that glyph is drawn in. Armour by band, the rest by what it is. */
export function tintFor(base) {
  if (!base) return theme.parchmentDim;
  if (base.kind === 'armour') return MATERIAL_TINT[base.material] || theme.parchmentDim;
  const id = String(base.id || '');
  const kinds = Array.isArray(base.kinds) ? base.kinds : [];
  if (base.kind === 'weapon' || base.kind === 'shield') {
    if (kinds.includes('staff') || /bow|staff/.test(id)) return MATERIAL_TINT.wood;
    if (kinds.includes('bone')) return MATERIAL_TINT.bone;
    return MATERIAL_TINT.steel;
  }
  if (base.kind === 'jewellery') return MATERIAL_TINT.gold;
  if (base.kind === 'food' || base.kind === 'meal') return '#c98a4a';
  if (kinds.includes('potion') || kinds.includes('alchemy')) return MATERIAL_TINT.glass;
  if (kinds.includes('leather') || /hide|pelt/.test(id)) return MATERIAL_TINT.hide;
  if (kinds.includes('forage') || id === 'reagent') return MATERIAL_TINT.herb;
  if (id === 'potion') return MATERIAL_TINT.glass;
  if (id === 'gem') return theme.goldBright;
  if (id === 'stone' || /ore/.test(id)) return MATERIAL_TINT.stone;
  if (/log|wood/.test(id)) return MATERIAL_TINT.wood;
  return theme.parchmentDim;
}

/** One item's art, as an inline svg string, at `size` px. */
export function itemGlyph(base, size = 30, colour = null) {
  const name = glyphNameFor(base);
  const fill = colour || tintFor(base);
  return `<svg class="bw-g" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill}"
    stroke="none">${GLYPHS[name] || GLYPHS.parcel}</svg>`;
}

/**
 * Every base has a drawing. Runs at import: a base added to items.js that
 * falls through to nothing fails here rather than showing an empty square.
 */
export function auditGlyphs() {
  const missing = [];
  let n = 0;
  for (const base of Object.values(BASES)) {
    n++;
    const name = glyphNameFor(base);
    if (!GLYPHS[name]) missing.push(`${base.id} wants a "${name}" glyph and there is none`);
    // `parcel` is the shrug. A material may shrug; a sword may not.
    if (name === 'parcel' && base.kind !== 'material') {
      missing.push(`${base.id} is a ${base.kind} and falls through to the plain parcel`);
    }
  }
  if (missing.length) throw new Error(`ui_theme: ${missing.length} bases have no art. ${missing[0]}`);
  for (const k of Object.keys(STAT_ICONS)) {
    if (!ICONS[STAT_ICONS[k]]) throw new Error(`ui_theme: ${k} wants a "${STAT_ICONS[k]}" icon and there is none`);
  }
  return n;
}

auditGlyphs();
auditTints();

// -------------------------------------------------------------------- css

const rarityRules = () => RARITY_ORDER.map((r) => {
  const c = theme.rarity[r];
  const glow = theme.glowing.includes(r)
    ? `box-shadow: inset 0 0 10px ${c}55, 0 0 6px ${c}44;`
    : '';
  return `.bw-slot[data-rarity="${r}"] { border-color: ${c}; ${glow} }
.bw-rarity-${r} { color: ${c}; }`;
}).join('\n');

const CSS = () => `
.bw-ui, .bw-ui * { box-sizing: border-box; }
.bw-ui {
  font-family: ${theme.fonts.body};
  color: ${theme.parchment};
  --bw-stone: ${theme.stone};
  --bw-stone-up: ${theme.stoneUp};
  --bw-parchment: ${theme.parchment};
  --bw-parchment-dim: ${theme.parchmentDim};
  --bw-gold: ${theme.gold};
  --bw-gold-dim: ${theme.goldDim};
  --bw-gold-bright: ${theme.goldBright};
  --bw-plate: ${theme.plate};
}

/* the frame: near black stone under gold filigree */
.bw-frame {
  position: relative;
  background:
    radial-gradient(120% 90% at 50% 0%, ${theme.stoneUp} 0%, ${theme.stone} 58%, ${theme.stoneDeep} 100%);
  border: 30px solid transparent;
  border-image: ${frameUrl()} 30 stretch;
  box-shadow: 0 24px 80px rgba(0,0,0,.72), inset 0 0 60px rgba(0,0,0,.55);
}

.bw-panel {
  position: relative;
  padding: 12px 14px;
  background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(0,0,0,.22));
  border: 1px solid ${theme.goldDim}66;
  background-image:
    ${cornerUrl()}, ${cornerUrl()}, ${cornerUrl()}, ${cornerUrl()},
    linear-gradient(180deg, rgba(255,255,255,.035), rgba(0,0,0,.22));
  background-repeat: no-repeat;
  background-position: left 2px top 2px, right 2px top 2px, left 2px bottom 2px, right 2px bottom 2px, 0 0;
  background-size: 18px 18px, 18px 18px, 18px 18px, 18px 18px, auto;
}

/* headers: small caps in Cinzel over a thin gold rule */
.bw-hdr {
  font-family: ${theme.fonts.display};
  font-size: 11.5px; font-weight: 600; letter-spacing: .22em;
  text-transform: uppercase; color: ${theme.gold};
  margin: 14px 0 8px; padding-bottom: 9px;
  background: ${ruleUrl()} bottom center / 100% 9px no-repeat;
}
.bw-hdr:first-child { margin-top: 0; }

.bw-title {
  font-family: ${theme.fonts.display};
  font-size: 25px; font-weight: 700; letter-spacing: .05em; color: ${theme.parchment};
  text-shadow: 0 2px 10px rgba(0,0,0,.8);
}
.bw-subtitle {
  font-family: ${theme.fonts.display};
  font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: ${theme.gold};
}
.bw-quote {
  font-style: italic; font-size: 14.5px; line-height: 1.5; color: ${theme.parchmentDim};
  margin: 8px 0 2px;
}
.bw-motto {
  font-family: ${theme.fonts.display};
  font-size: 10.5px; letter-spacing: .22em; text-transform: uppercase;
  color: ${theme.gold}; text-align: center;
  padding: 5px 10px; border: 1px solid ${theme.goldDim}88;
  background: linear-gradient(180deg, rgba(0,0,0,.5), rgba(0,0,0,.2));
}

/* a row of icon, name, value */
.bw-row {
  display: grid; grid-template-columns: 20px 1fr auto; gap: 9px; align-items: center;
  padding: 3px 0; border-bottom: 1px solid rgba(201,164,74,.14);
  font-size: 14.5px;
}
.bw-row:last-child { border-bottom: 0; }
.bw-row .bw-i { display: block; opacity: .85; }
.bw-row .bw-k { color: ${theme.parchmentDim}; }
.bw-row .bw-v {
  font-family: ${theme.fonts.display}; font-size: 13.5px; font-weight: 600;
  font-variant-numeric: tabular-nums; color: ${theme.parchment};
}
.bw-row.bw-over .bw-v { color: #ff8f7a; }

/* slots: a square, a rarity border, the art inside */
.bw-slot {
  position: relative; width: 46px; height: 46px; cursor: pointer;
  background: linear-gradient(160deg, rgba(255,255,255,.06), rgba(0,0,0,.42));
  border: 1px solid ${theme.goldDim}77;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.bw-slot::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.10), inset 0 -6px 12px rgba(0,0,0,.45);
}
.bw-slot:hover { border-color: ${theme.goldBright}; }
.bw-slot.bw-empty { cursor: default; }
.bw-slot .bw-tag {
  position: absolute; left: 0; right: 0; bottom: 0; text-align: center;
  font-family: ${theme.fonts.display}; font-size: 7.5px; letter-spacing: .09em;
  text-transform: uppercase; color: ${theme.goldDim}; background: rgba(0,0,0,.55);
  padding: 1px 0;
}
.bw-slot .bw-count {
  position: absolute; right: 2px; bottom: 1px;
  font-family: ${theme.fonts.display}; font-size: 11px; font-weight: 700;
  font-variant-numeric: tabular-nums; color: ${theme.parchment};
  text-shadow: 0 1px 3px #000;
}
.bw-slot .bw-q { font-family: ${theme.fonts.display}; font-size: 22px; font-weight: 700; }
${rarityRules()}

/* tabs across the top */
.bw-tabs { display: flex; gap: 2px; align-items: flex-end; }
.bw-tab {
  font-family: ${theme.fonts.display};
  font-size: 11px; letter-spacing: .17em; text-transform: uppercase;
  padding: 7px 15px 6px; cursor: pointer; color: ${theme.goldDim};
  background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(0,0,0,.35));
  border: 1px solid ${theme.goldDim}55; border-bottom: 0;
}
.bw-tab:hover { color: ${theme.goldBright}; }
.bw-tab.on {
  color: ${theme.parchment};
  background: linear-gradient(180deg, ${theme.plateUp}, ${theme.plate});
  border-color: ${theme.gold};
  box-shadow: 0 -2px 10px rgba(122,42,32,.6);
}

/* buttons */
.bw-btn {
  font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .14em;
  text-transform: uppercase; color: ${theme.parchment}; cursor: pointer;
  padding: 5px 12px; border: 1px solid ${theme.goldDim};
  background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.4));
}
.bw-btn:hover:not(:disabled) { border-color: ${theme.gold}; color: ${theme.goldBright}; }
.bw-btn:disabled { opacity: .45; cursor: default; }
.bw-btn.on { background: linear-gradient(180deg, ${theme.plateUp}, ${theme.plate}); border-color: ${theme.gold}; }

.bw-dim { color: ${theme.parchmentDim}; }
.bw-num { font-variant-numeric: tabular-nums; font-family: ${theme.fonts.display}; }
.bw-gold-text { color: ${theme.gold}; }

/* scrollbars */
.bw-ui ::-webkit-scrollbar { width: 9px; height: 9px; }
.bw-ui ::-webkit-scrollbar-track { background: rgba(0,0,0,.4); }
.bw-ui ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, ${theme.goldDim}, #4a3818); border: 1px solid #000; }
.bw-ui ::-webkit-scrollbar-thumb:hover { background: ${theme.gold}; }
`;

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&display=swap';

/**
 * Put the look in the document. Safe to call from anywhere, any number of
 * times, and a no op with no document at all so node can import this file.
 * Returns true when the sheet is in place.
 */
export function injectTheme(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || typeof d.createElement !== 'function' || !d.head) return false;
  if (!d.getElementById('bw-theme-fonts')) {
    const link = d.createElement('link');
    link.id = 'bw-theme-fonts';
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    d.head.appendChild(link);
  }
  if (!d.getElementById('bw-theme-css')) {
    const style = d.createElement('style');
    style.id = 'bw-theme-css';
    style.textContent = CSS();
    d.head.appendChild(style);
  }
  return true;
}

/** The sheet itself, for anything that wants to read it rather than inject it. */
export const themeCss = CSS;
export const FONT_URL = FONT_HREF;
