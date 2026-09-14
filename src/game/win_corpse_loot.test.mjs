import assert from 'node:assert/strict';
import { makeDom } from './editor/test_dom.mjs';
import { makeItem } from '../mmo/items.js';
import { panel } from './win_corpse_loot.js';

const dom = makeDom();
globalThis.document = dom;
const el = dom.createElement('div');
const rapier = makeItem({ base: 'rapier' });
const rubyStack = { base: 'gem', material: 'ruby', count: 12, rarity: 'common' };
const corpse = { active: true, name: 'Bandit', loot: { items: [rapier, rubyStack], gold: 0 } };
const taken = [];
const ctx = {
  corpseLoot: {
    contentsOf: (body) => body?.loot || { items: [], gold: 0 },
    canTake: () => ({ ok: true }),
    isActive: (body) => !!body?.active,
    takeItem: (_body, item) => { taken.push(item); return { ok: true, emptied: false }; },
    takeAll: () => ({ ok: false }), takeGold: () => ({ ok: false }),
  },
  windows: { close() {} },
};
const all = (node) => [node, ...node.children.flatMap(all)];

panel.build(el, ctx);
panel.open(ctx, { corpse });
const glyphs = all(el).filter((node) => node.classList.contains('bw-corpse-loot-glyph'));
assert.equal(glyphs.length, 2);
assert.match(glyphs[0].innerHTML, /<img[^>]*icons\/items\/rapier\.webp/, 'a corpse rapier uses its painted item asset');
assert.match(glyphs[1].innerHTML, /<img[^>]*icons\/items\/ruby-gem\.webp/, 'a stack material reaches itemGlyph');
assert.deepEqual(rubyStack, { base: 'gem', material: 'ruby', count: 12, rarity: 'common' }, 'rendering preserves stack material and count');
const takeButtons = all(el).filter((node) => node.tagName === 'BUTTON' && node.textContent === 'Take');
takeButtons[1].fire('click');
assert.equal(taken[0], rubyStack, 'the take handler keeps the original stack record and material');

console.log('Corpse loot panel glyph checks passed.');
