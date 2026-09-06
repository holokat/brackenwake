// Export every craftable for the artist: one CSV of all recipes, and one
// art list of the distinct things that need a picture, with a prompt each.
//
//   node scripts/export-craftables.mjs
//
// Writes docs/concepts/craftables/CRAFTABLES.csv and
// docs/concepts/craftables/ART-LIST.md, and prints the counts. Rerun it
// whenever recipes.js or icon_art.js changes; the list is generated, never
// typed, so a new metal or a new recipe family cannot be quietly left out.
//
// WHAT NEEDS A PICTURE. A recipe is a base in a material (Copper Dagger, Iron
// Dagger); the picture is per BASE, and the material is a recolour of the
// same icon, which is how the game already draws them (icon_art.itemIcon
// takes a material). So the art list is 118 bases, not 486 recipes, and each
// row says which materials it comes in. A scroll is one base and 35 spells:
// one scroll icon and the spell's own ability icon on it.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../src/mmo/recipes.js';
import { BASES } from '../src/mmo/items.js';
import { ITEM_ICONS, ABILITY_ICONS } from '../src/game/icon_art.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs', 'concepts', 'craftables');
mkdirSync(OUT, { recursive: true });

const recipes = R.RECIPES || Object.values(R).find((v) => Array.isArray(v) && v.length > 100);

/** The style every icon shares, so a hundred images read as one game. */
export const STYLE = 'Hand-painted fantasy RPG inventory icon in the manner of classic World of Warcraft item art: one object, centred, three-quarter view, painterly light from the upper left, saturated but earthy colour, crisp silhouette, on a plain dark neutral background, no text, no border, no hands, square, 512 by 512.';

/** What each family's object is, in words the artist needs. */
const FAMILY_WORDS = {
  weapon: 'a weapon',
  armour: 'a piece of armour laid flat as if on a table',
  shield: 'a shield seen face on',
  staff: 'a staff',
  bow: 'a bow, unstrung tension visible',
  ammo: 'a bundle of ammunition tied with cord',
  potion: 'a stoppered glass potion bottle',
  meal: 'a cooked meal on a wooden board or in a bowl',
  forageMeal: 'a cooked meal on a wooden board or in a bowl',
  foragePotion: 'a stoppered glass potion bottle',
  tool: 'a hand tool',
  bag: 'a bag or pack',
  scroll: 'a rolled parchment scroll with a wax seal',
};

/** Words for the materials a base comes in, so the recolour set is named. */
const MATERIAL_WORDS = {
  copper: 'warm copper', bronze: 'dull bronze', iron: 'grey iron', silver: 'bright silver',
  coldiron: 'blue black cold iron', emberite: 'ember red metal with a faint glow', rimesteel: 'pale frosted steel',
  verdite: 'green veined metal', voidrock: 'black stone metal with violet in it', starfall: 'white gold star metal',
  oak: 'oak', ash: 'pale ash wood', heartwood: 'red heartwood', ironbark: 'dark ironbark',
  cloth: 'undyed wool cloth', hide: 'tanned leather', reagents: 'glass and cork',
};

const by = new Map();
for (const r of recipes) {
  const base = r.result.base;
  const mat = r.result.material || '';
  let row = by.get(base);
  if (!row) {
    row = { base, family: r.family, skill: r.skill, station: r.station, materials: new Set(), spells: new Set(), names: new Set(), count: 0 };
    by.set(base, row);
  }
  row.materials.add(mat);
  if (r.spell) row.spells.add(r.spell);
  row.names.add(r.name);
  row.count++;
}

/** A human name for a base: the item table's, else the recipe name without its material. */
function nameOf(row) {
  if (BASES[row.base]?.name) return BASES[row.base].name;
  const first = [...row.names][0] || row.base;
  const mats = [...row.materials].map((m) => m.charAt(0).toUpperCase() + m.slice(1));
  let n = first;
  for (const m of mats) n = n.replace(new RegExp(`^${m}\\s+`, 'i'), '');
  return n;
}

/** The object words alone: what this thing is and what it is made of. */
function subjectFor(row) {
  const name = nameOf(row);
  const what = FAMILY_WORDS[row.family] || 'an object';
  const mats = [...row.materials].filter(Boolean);
  const first = mats[0];
  const matWords = mats.length > 1
    ? ` Shown in ${MATERIAL_WORDS[first] || first}; the same icon is recoloured for ${mats.slice(1).map((m) => MATERIAL_WORDS[m] || m).join(', ')}.`
    : first && MATERIAL_WORDS[first] ? ` Made of ${MATERIAL_WORDS[first]}.` : '';
  return `${name}: ${what}.${matWords}`;
}
/** One self-contained line for an image tool: the style, then the subject. */
function promptFor(row) { return `${STYLE} ${subjectFor(row)}`; }

// ---- the CSV, every recipe
const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const csvRows = [['id', 'name', 'family', 'base', 'material', 'spell', 'skill', 'difficulty', 'station', 'materials', 'existing icon'].map(esc).join(',')];
for (const r of recipes) {
  const mats = Object.entries(r.materials || {}).map(([k, v]) => `${k} x${v}`).join('; ');
  const icon = ITEM_ICONS[r.result.base] || (r.spell ? ABILITY_ICONS[r.spell] : '') || '';
  csvRows.push([r.id, r.name, r.family, r.result.base, r.result.material || '', r.spell || '', r.skill, r.difficulty, r.station, mats, icon].map(esc).join(','));
}
writeFileSync(join(OUT, 'CRAFTABLES.csv'), csvRows.join('\n') + '\n');

// ---- the art list, one row per base, grouped by family
const families = [...new Set([...by.values()].map((r) => r.family))];
const md = [];
md.push('# Craftables: the art list');
md.push('');
md.push(`Generated ${new Date().toISOString().slice(0, 10)} by scripts/export-craftables.mjs from src/mmo/recipes.js. ${recipes.length} recipes, ${by.size} distinct things to draw. Every recipe is in CRAFTABLES.csv beside this file.`);
md.push('');
md.push('One picture per base. A base that comes in ten metals is ONE icon recoloured ten times; the game already tints by material. A scroll is one icon with the spell\'s ability icon on the seal, so the 35 scrolls are one drawing.');
md.push('');
md.push('## The style, once');
md.push('');
md.push(STYLE);
md.push('');
md.push('PROMPTS.txt beside this file has one self-contained prompt per base, the style sentence followed by the subject, one per line, tab separated from the base id. Deliver as 512 by 512 webp, named `<base>.webp`, into public/icons/items/. Where a row says an icon exists, that is the current one, and a new one replaces it under the same name.');
md.push('');
let missing = 0, have = 0;
for (const fam of families) {
  const rows = [...by.values()].filter((r) => r.family === fam);
  md.push(`## ${fam} (${rows.length} to draw, ${rows.reduce((s, r) => s + r.count, 0)} recipes)`);
  md.push('');
  md.push('| base | name | comes in | recipes | icon today | subject |');
  md.push('|---|---|---|---|---|---|');
  for (const r of rows) {
    const icon = ITEM_ICONS[r.base] || '';
    if (icon) have++; else missing++;
    const comesIn = r.spells.size ? `${r.spells.size} spells` : [...r.materials].filter(Boolean).join(', ') || 'one';
    md.push(`| \`${r.base}\` | ${nameOf(r)} | ${comesIn} | ${r.count} | ${icon ? icon.replace('icons/items/', '') : 'none'} | ${subjectFor(r)} |`);
  }
  md.push('');
}
md.push(`## Count`);
md.push('');
md.push(`${by.size} bases: ${have} have an icon today, ${missing} have none.`);
md.push('');
writeFileSync(join(OUT, 'ART-LIST.md'), md.join('\n'));

// ---- the prompts, one self-contained line per base, for pasting into an image tool
const lines = [];
for (const fam of families) for (const r of [...by.values()].filter((x) => x.family === fam)) lines.push(`${r.base}\t${promptFor(r)}`);
writeFileSync(join(OUT, 'PROMPTS.txt'), lines.join('\n') + '\n');
console.log(`${recipes.length} recipes, ${by.size} bases, ${have} with an icon, ${missing} without. Written to ${OUT}`);
