// icon_art: every path in the manifest is a real file, the lookups answer the
// way the bag and the bar rely on, and the bases that still have no painting
// are printed, so "what is missing" is a number and a list and not a guess.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ABILITY_ICONS, ITEM_ICONS, STACK_ICONS, GEM_ICONS, SKILL_ICONS, STACK_AT,
  abilityIcon, itemIcon, skillIcon, iconImg,
} from './icon_art.js';
import { ABILITIES } from '../mmo/abilities.js';
import { BASES } from '../mmo/items.js';
import { GEMS } from '../mmo/ores.js';
import { SKILLS } from '../mmo/skills.js';
import { itemGlyph } from './ui_theme.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, '..', '..', 'public');
const exists = (p) => fs.existsSync(path.join(pub, p));

console.log('icon_art: every path is a file');
{
  const all = [...Object.values(ABILITY_ICONS), ...Object.values(ITEM_ICONS), ...Object.values(STACK_ICONS), ...Object.values(GEM_ICONS), ...Object.values(SKILL_ICONS)];
  const gone = all.filter((p) => !exists(p));
  check('every manifest path is a file under public/', gone.length === 0, gone.slice(0, 3).join(', ') || `${all.length} files`);
  const big = all.filter((p) => exists(p) && fs.statSync(path.join(pub, p)).size > 40 * 1024);
  check('no icon is over 40 KB, since the bar loads twelve at once', big.length === 0, big.slice(0, 3).join(', ') || 'largest is under 40 KB');
}

console.log('icon_art: abilities');
{
  const ids = ABILITIES.map((a) => a.id);
  const unpainted = ids.filter((id) => !ABILITY_ICONS[id]);
  check('every ability in the book has a painting', unpainted.length === 0, unpainted.join(', ') || `${ids.length} of ${ids.length}`);
  const orphan = Object.keys(ABILITY_ICONS).filter((id) => !ids.includes(id));
  check('and no painting names an ability that does not exist', orphan.length === 0, orphan.join(', ') || 'none');
  check('abilityIcon answers a url for fireball', /icons\/abilities\/fireball\.webp$/.test(abilityIcon('fireball')));
  check('and null for a name nobody painted, so the drawn mark is used', abilityIcon('notAThing') === null);
}

console.log('icon_art: skills');
{
  const ids = SKILLS.map((s) => s.id);
  const unpainted = ids.filter((id) => !SKILL_ICONS[id]);
  check('every skill has a painting', unpainted.length === 0, unpainted.join(', ') || `${ids.length} of ${ids.length}`);
  const orphan = Object.keys(SKILL_ICONS).filter((id) => !ids.includes(id));
  check('and no painting names a skill that does not exist', orphan.length === 0, orphan.join(', ') || 'none');
  check('skillIcon answers a url for swordsmanship', /icons\/skills\/swordsmanship\.webp$/.test(skillIcon('swordsmanship')));
  check('and null for a name nobody painted', skillIcon('notASkill') === null);
}

console.log('icon_art: items');
{
  const ids = Object.keys(BASES);
  const orphan = Object.keys({ ...ITEM_ICONS, ...STACK_ICONS }).filter((id) => !BASES[id]);
  check('no item painting names a base that does not exist', orphan.length === 0, orphan.join(', ') || 'none');
  check('one copper ingot is the single ingot', /copper-ingot\.webp$/.test(itemIcon('copper_ingot', { count: 1 })));
  check(`${STACK_AT} copper ingots are the stack`, /copper-ingots\.webp$/.test(itemIcon('copper_ingot', { count: STACK_AT })));
  check('and one short of a stack is still the single', /copper-ingot\.webp$/.test(itemIcon('copper_ingot', { count: STACK_AT - 1 })));
  check('a base record works as well as an id', /oak-log\.webp$/.test(itemIcon(BASES.oak_log)));
  check('a gem with a material wears that gem', /ruby-gem\.webp$/.test(itemIcon('gem', { material: 'ruby' })));
  check('and every gem in ores.js has a picture', GEMS.every((g) => GEM_ICONS[g.id]), GEMS.filter((g) => !GEM_ICONS[g.id]).map((g) => g.id).join(', ') || `${GEMS.length} gems`);
  check('a base with no painting answers null', itemIcon('potion') === null);
  check('itemGlyph hands back an <img> for a painted base', /^<img[^>]*icons\/items\/longsword\.webp/.test(itemGlyph(BASES.longsword, 28)));
  check('and the drawn <svg> for one without', /^<svg/.test(itemGlyph(BASES.potion, 28)));
  check('iconImg is sized and has no alt text', /width="26" height="26" alt=""/.test(iconImg('x.webp', 26)));

  // the coverage report: what the library still owes the game
  const painted = ids.filter((id) => ITEM_ICONS[id]);
  const unpainted = ids.filter((id) => !ITEM_ICONS[id]);
  const byKind = {};
  for (const id of unpainted) { const k = BASES[id].kind; (byKind[k] ||= []).push(id); }
  console.log(`  ${painted.length} of ${ids.length} bases painted. Unpainted, by kind:`);
  for (const [k, list] of Object.entries(byKind)) console.log(`    ${k} (${list.length}): ${list.join(', ')}`);
  check('the coverage is at least the library delivered', painted.length >= 59, `${painted.length} painted`);
}

console.log(`\nicon_art: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
