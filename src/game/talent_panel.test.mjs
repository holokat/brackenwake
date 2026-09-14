import assert from 'node:assert/strict';
import { makeDom } from './editor/test_dom.mjs';
import { buildTalentPanel } from './talent_panel.js';
import { planCharacter } from './creation.js';
import { CLASS_TREES } from '../mmo/class_trees.js';
import { LEVEL_XP, grantExperience, nodeRank, talentRank } from '../mmo/talents.js';

const dom = makeDom();
globalThis.document = dom;
const c = planCharacter({ opening: 'mage', name: 'Tester' }).character;
const el = dom.createElement('div');
const events = [];
let resetCalls = 0;
let resetResult = { ok: false, reason: 'Talent trees can only be reset outside combat.' };
const ctx = {
  character: c,
  abilities: {
    applyPassives: () => events.push('passives'),
    respecTalents: () => { resetCalls++; return resetResult; },
  },
  state: { touch: (key) => events.push(key) },
  recompute: () => events.push('recompute'),
  hud: { unlock: (ability) => events.push(ability.id), log: (text) => events.push(text) },
  audio: { play: (cue) => events.push(cue) },
};
let picked = null;
const panel = buildTalentPanel(el, ctx, {
  artSvg: (ability) => ability.id,
  setBarSlot: () => ({ ok: true, reason: 'placed' }),
  pick: (id, place) => { picked = { id, place }; },
});
const all = (node) => [node, ...node.children.flatMap(all)];
const byClass = (name) => all(el).filter((node) => node.classList.contains(name));
const button = (text) => all(el).find((node) => node.tagName === 'BUTTON' && node.textContent === text);
const card = (id) => byClass('talent-node').find((node) => node.dataset.nodeId === id);
const nodeCount = (classId) => CLASS_TREES.find((tree) => tree.id === classId).branches.reduce((count, branch) => count + branch.nodes.length, 0);
const clickCard = (id) => all(card(id)).find((node) => node.classList.contains('talent-icon')).fire('click');

assert.equal(byClass('talent-branch').length, 3);
assert.equal(byClass('talent-node').length, nodeCount('mage'), 'the panel renders every live Mage node');
assert.ok(CLASS_TREES.flatMap((tree) => tree.branches).flatMap((branch) => branch.nodes).every((node) => node.status === 'live'));
assert.ok(!el.textContent.includes('Planned'));
assert.equal(button('Hide planned talents'), undefined, 'the old roadmap filter is gone');
assert.ok(el.textContent.includes('Level 1'));
assert.ok(el.textContent.includes('0 talent points available'));

const fireball = 'mage.fire.fireball';
clickCard(fireball);
let learn = byClass('talent-detail-learn')[0];
assert.equal(learn.disabled, true);
learn.fire('click');
assert.equal(talentRank(c, 'fireball'), 0, 'the handler enforces available points');
panel.refresh();
assert.equal(byClass('talent-detail-learn')[0], learn, 'an unchanged refresh preserves focused controls');
grantExperience(c, LEVEL_XP[2]);
panel.refresh();
learn = byClass('talent-detail-learn')[0];
assert.equal(learn.disabled, false);
learn.fire('click');
assert.equal(talentRank(c, 'fireball'), 1);
assert.ok(events.includes('advancement') && events.includes('passives') && events.includes('recompute') && events.includes('fireball'));
button('Place on action bar').fire('click');
assert.equal(picked.id, 'fireball');
picked.place(0);
assert.ok(events.includes('bar'));

const copperThread = 'mage.arcane.copperThread';
clickCard(copperThread);
assert.ok(byClass('talent-details')[0].textContent.includes('Rank 0 / 3'));
assert.ok(byClass('talent-details')[0].textContent.includes('Rank 1'));
assert.match(byClass('talent-details')[0].textContent, /\+3% damage/);
grantExperience(c, LEVEL_XP[4] - c.advancement.xp);
panel.refresh();
learn = byClass('talent-detail-learn')[0];
learn.fire('click');
learn = byClass('talent-detail-learn')[0];
learn.fire('click');
assert.equal(nodeRank(c, copperThread), 2, 'a modifier purchases and stores independent ranks');
assert.equal(talentRank(c, 'magicArrow'), 1, 'a modifier never becomes an ability rank');
assert.ok(byClass('talent-details')[0].textContent.includes('Current effect'));
assert.match(byClass('talent-details')[0].textContent, /\+6% damage/);
assert.match(byClass('talent-details')[0].textContent, /Rank 3.*\+9% damage/s);

button('Reset talents').fire('click');
assert.equal(resetCalls, 1, 'the panel delegates reset authority to the runtime guard');
assert.ok(byClass('talent-status')[0].textContent.includes('outside combat'));
resetResult = { ok: true, refunded: 2, points: 2 };
button('Reset talents').fire('click');
assert.equal(resetCalls, 2, 'a permitted runtime reset is also delegated');
assert.ok(events.includes('bar'));
assert.ok(byClass('talent-status')[0].textContent.includes('2 points available'));

const saved = JSON.stringify(c.advancement);
button('Rogue').fire('click');
assert.equal(byClass('talent-branch').length, 3);
assert.equal(byClass('talent-node').length, nodeCount('rogue'), 'other class catalogue count is data-derived');
const foreignModifier = 'rogue.combat.flyingEdge';
clickCard(foreignModifier);
learn = byClass('talent-detail-learn')[0];
assert.equal(learn.disabled, true);
learn.fire('click');
assert.equal(JSON.stringify(c.advancement), saved, 'browsing another class cannot spend on its modifiers');
assert.ok(byClass('talent-connections').some((node) => node.innerHTML.includes('<path')),'prerequisite paths render');

console.log('Talent panel interaction checks passed.');
