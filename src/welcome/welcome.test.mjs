import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CHARACTERS, mountCharacters, nextTabIndex } from './characters.js';
import { scrollProgress } from './motion.js';
import { OPENINGS_BY_ID, SKILL_NAMES } from '../mmo/openings.js';

// Marketing must describe actual available openings, with actual starting
// skills. In particular, animal lore must never become a promise of taming.
for (const [id, character] of Object.entries(CHARACTERS)) {
  const opening = OPENINGS_BY_ID[id === 'wizard' ? 'mage' : id];
  assert.equal(character.name, opening.name);
  assert.equal(character.description, opening.blurb);
  assert.equal(character.traits, character.skills.map((skill) => SKILL_NAMES[skill]).join(' · '));
  for (const skill of character.skills) assert.ok(opening.skills[skill] > 0, `${id} does not start with ${skill}`);
  assert.ok(existsSync(new URL(`../../public/ui/classes/${id}.webp`, import.meta.url)));
}
const html = readFileSync(new URL('../../welcome/index.html', import.meta.url), 'utf8');
assert.ok(html.includes(CHARACTERS.ranger.description));
assert.ok(html.includes(CHARACTERS.ranger.traits));

assert.equal(nextTabIndex(0, 'ArrowLeft', 4), 3);
assert.equal(nextTabIndex(3, 'ArrowRight', 4), 0);
assert.equal(nextTabIndex(2, 'Home', 4), 0);
assert.equal(nextTabIndex(1, 'End', 4), 3);
assert.equal(nextTabIndex(2, 'Tab', 4), 2);
assert.equal(scrollProgress(-100, 0, 200), 0);
assert.equal(scrollProgress(100, 0, 200), .5);
assert.equal(scrollProgress(500, 0, 200), 1);
assert.ok(Number.isFinite(scrollProgress(0, 0, 0)));

// Exercise the mounted controller: clicks and keyboard navigation must update
// its visible art, copy, accessible label, roving tab stop and focus together.
function element(dataset = {}) {
  return {
    dataset, attrs: {}, handlers: {}, textContent: '', tabIndex: -1, focused: false,
    classList: { selected: false, toggle(name, value) { this.selected = value; } },
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(type, callback) { this.handlers[type] = callback; },
    focus() { this.focused = true; },
  };
}
const ids = ['ranger', 'warrior', 'wizard', 'rogue'];
const tabs = ids.map((id) => Object.assign(element({ character: id }), { id: `tab-${id}` }));
const portraits = ids.map((id) => element({ portrait: id }));
const nodes = Object.fromEntries(['[role="tabpanel"]', '#character-name', '#character-description', '#character-traits', '.character-echo'].map((key) => [key, element()]));
const section = {
  dataset: {},
  querySelectorAll(selector) { return selector === '[role="tab"]' ? tabs : portraits; },
  querySelector(selector) { return nodes[selector]; },
};
mountCharacters(section, new AbortController().signal);
for (let index = 0; index < tabs.length; index++) {
  tabs[index].handlers.click();
  assert.equal(section.dataset.character, ids[index]);
  assert.equal(nodes['#character-name'].textContent, CHARACTERS[ids[index]].name);
  assert.equal(nodes['#character-description'].textContent, CHARACTERS[ids[index]].description);
  assert.equal(nodes['[role="tabpanel"]'].attrs['aria-labelledby'], tabs[index].id);
  assert.equal(tabs.filter((tab) => tab.tabIndex === 0).length, 1);
  assert.equal(portraits.filter((portrait) => portrait.classList.selected).length, 1);
  assert.equal(portraits[index].classList.selected, true);
}
let prevented = false;
tabs[3].handlers.keydown({ key: 'ArrowRight', preventDefault() { prevented = true; } });
assert.ok(prevented);
assert.ok(tabs[0].focused);
assert.equal(section.dataset.character, 'ranger');
console.log('Welcome: four source-backed character previews, keyboard navigation, asset paths and bounded parallax passed.');
