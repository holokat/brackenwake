// The character sheet's numbers, its titles and its doll.
// Run: node src/game/win_character.test.mjs
//
// The doll's cell count is checked against items.js rather than against a
// number typed here, so a fifteenth slot breaks this and not the screen. The
// combat numbers are checked against combat_rules itself, so the sheet cannot
// print a number the fight would not.

import {
  auditDoll, auditTitles, DOLL, SLOT_LABELS, TITLES, TITLE_AT, QUOTES, MOTTOES,
  DEFAULT_QUOTE, DEFAULT_MOTTO, sheetOf, tipFor, titleOf, noteOf, fighterFor,
} from './win_character.js';
import { normalise, PACK_SLOTS } from './inventory.js';
import { SLOTS, makeItem } from '../mmo/items.js';
import { derived } from '../mmo/stats.js';
import { SKILLS } from '../mmo/skills.js';
import { attackSkill, defenceSkill, CRIT_BASE_MULT } from '../mmo/combat_rules.js';
import { OPENINGS } from '../mmo/openings.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---- the doll counts its own cells -----------------------------------------
console.log('character: the doll');
check('the doll has a cell for every live slot', auditDoll() === SLOTS.length, `${auditDoll()} of ${SLOTS.length}`);
check('and six is what that is', SLOTS.length === 6);
const cells = [...DOLL.left, ...DOLL.right];
check('no slot is drawn twice', new Set(cells).size === cells.length);
check('every cell has a word under it', cells.every((c) => !!SLOT_LABELS[c]));
check('the two rings read as rings, not as ring1 and ring2', SLOT_LABELS.ring1 === 'ring' && SLOT_LABELS.ring2 === 'ring');
check('the arch is flanked three and three', DOLL.left.length === 3 && DOLL.right.length === 3,
  `${DOLL.left.length} and ${DOLL.right.length}`);
check('the weapon is at the top of the left flank', DOLL.left[0] === 'mainHand');
check('the shield is painted under the weapon on the left flank', DOLL.left[1] === 'offHand', DOLL.left.join(','));
check('the amulet, outfit and second ring are down the right flank',
  DOLL.right.join(',') === 'neck,outfit,ring2', DOLL.right.join(','));

// ---- titles ----------------------------------------------------------------
console.log('character: the title line');
check('every skill makes somebody', auditTitles() === SKILLS.length, `${SKILLS.length} skills`);
check('and there are fifty two of them', SKILLS.length === 52);
check('Swordsmanship makes a Swordsman', TITLES.swordsmanship === 'Swordsman');
{
  const low = { opening: 'warrior', skills: { swordsmanship: TITLE_AT - 1 } };
  const t = titleOf(low);
  check(`a skill under ${TITLE_AT} does not name you`, t.text === 'Warrior' && t.from === 'opening', JSON.stringify(t));
  const at = titleOf({ opening: 'warrior', skills: { swordsmanship: TITLE_AT } });
  check(`and at exactly ${TITLE_AT} it does`, at.text === 'Swordsman' && at.from === 'swordsmanship', JSON.stringify(at));
  const best = titleOf({ opening: 'warrior', skills: { swordsmanship: 40, archery: 62 } });
  check('the highest skill wins, not the first', best.text === 'Archer', JSON.stringify(best));
  const none = titleOf({ skills: {} });
  check('with no skill and no opening you are a Wanderer', none.text === 'Wanderer' && none.from === null);
  check('no level is ever printed', !/level/i.test(JSON.stringify(titleOf({ opening: 'mage', skills: { magery: 70 } }))));
}
console.log('character: quotes and mottoes');
check('every opening has a line of its own',
  OPENINGS.every((o) => typeof QUOTES[o.id] === 'string' && QUOTES[o.id].length > 10),
  OPENINGS.filter((o) => !QUOTES[o.id]).map((o) => o.id).join(',') || 'all present');
check('and a motto', OPENINGS.every((o) => typeof MOTTOES[o.id] === 'string'),
  OPENINGS.filter((o) => !MOTTOES[o.id]).map((o) => o.id).join(',') || 'all present');
check('no quote or motto uses an em dash',
  [...Object.values(QUOTES), ...Object.values(MOTTOES), DEFAULT_QUOTE, DEFAULT_MOTTO].every((s) => !s.includes('—')));
check('an opening nobody wrote for still gets words',
  sheetOf({ opening: 'goatherd' }, null).quote === DEFAULT_QUOTE);

// ---- the sheet -------------------------------------------------------------
console.log('character: the numbers');
const warrior = () => normalise({
  name: 'Ashe', opening: 'warrior', gold: 25,
  stats: { str: 65, dex: 50, int: 25, con: 65, wis: 45 },
  skills: { meditation: 0 },
  pack: { slots: PACK_SLOTS, items: [] }, equipment: {},
});
{
  const c = warrior();
  const s = sheetOf(c, null);
  const d = derived(c.stats, c.skills);
  check('five stats are printed', s.stats.length === 5 && s.stats[0].label === 'STR');
  check('and they are the document s', s.stats.map((x) => x.value).join(',') === '65,50,25,65,45');
  check('each stat carries the word the reference uses', s.stats[0].word === 'Strength' && s.stats[3].word === 'Constitution');
  check('and a mark to draw', s.stats.every((x) => typeof x.mark === 'string' && x.mark.length));
  check('health reads the derived maximum', s.pools[0].value === `${Math.floor(d.maxHealth)} / ${Math.floor(d.maxHealth)}`, s.pools[0].value);
  check('a warrior at CON 65 and STR 65 has 192 health', s.pools[0].value === '192 / 192', s.pools[0].value);
  check('carry is 40 + STR * 2', s.carry === 170, String(s.carry));
  check('an empty warrior weighs nothing and is not over', s.weight === 0 && s.over === false);
  check('with nothing on, armour is zero', s.ar === 0);
  check('and every resist is zero', s.resists.every((r) => r.value === 0));
  check('there are five resists', s.resists.length === 5, s.resists.map((r) => r.label).join(','));
  check('each resist has a mark', s.resists.every((r) => typeof r.mark === 'string' && r.mark.length));
  check('the purse is shown', s.gold === 25);
  check('the title is the opening, since no skill is high enough', s.title.text === 'Warrior');
}
{
  // A part-drained character shows what is left over what it could be.
  const c = warrior();
  c.health = 40;
  const s = sheetOf(c, null);
  check('a hurt character shows the wound', s.pools[0].value === '40 / 192', s.pools[0].value);
}

// ---- the combat rows are combat_rules', not a second copy -------------------
console.log('character: the combat rows read the rules');
{
  const c = warrior();
  c.skills = { swordsmanship: 60, tactics: 40, parrying: 30 };
  const s = sheetOf(c, null);
  const f = fighterFor(c, null);
  const attack = s.fight.find((r) => r.label === 'attack');
  const defence = s.fight.find((r) => r.label === 'defence');
  check('attack is combat_rules attackSkill, rounded',
    attack.value === Math.round(attackSkill(f)), `${attack.value} vs ${attackSkill(f)}`);
  check('defence is combat_rules defenceSkill, rounded',
    defence.value === Math.round(defenceSkill(f)), `${defence.value} vs ${defenceSkill(f)}`);
  check('a bare handed warrior with no Wrestling has no attack to speak of',
    attack.value === Math.round(0 + 40 * 0.25), String(attack.value));
  check('dodge is a percentage', /%$/.test(s.fight.find((r) => r.label === 'dodge').value));
  check('critical damage is the multiplier the resolver uses',
    s.fight.find((r) => r.label === 'critical damage').value === `${CRIT_BASE_MULT}x`);
  check('there is no hit chance row, because that takes two fighters',
    !s.fight.some((r) => /hit chance/.test(r.label)), s.fight.map((r) => r.label).join(', '));
}
{
  // A document with no stamina recorded is not an exhausted fighter.
  const c = warrior();
  c.skills = { swordsmanship: 60 };
  c.equipment.mainHand = makeItem({ base: 'longsword', seed: 4 });
  delete c.stamina;
  const f = fighterFor(c, null);
  check('the weapon in hand is the weapon the rules read', f.weapon && f.weapon.skill === 'swordsmanship');
  check('a document with no stamina is filled in from the derived pool',
    f.stamina === derived(c.stats, c.skills).maxStamina, String(f.stamina));
  check('so attack is not docked twenty points for exhaustion',
    Math.round(attackSkill(f)) === 60, String(Math.round(attackSkill(f))));
  const spent = fighterFor({ ...c, stamina: 0 }, null);
  check('and a fighter who really is spent loses those twenty',
    Math.round(attackSkill(spent)) === 40, String(Math.round(attackSkill(spent))));
}
{
  // When actor.js has run, its numbers win, so the sheet and the fight agree.
  const c = warrior();
  const actor = {
    ar: 137,
    resists: { physical: 40, fire: 3, cold: 0, poison: 0, energy: 0 },
    stats: c.stats, skills: { swordsmanship: 70 },
    bonuses: { hit: 12, critChance: 0.1, critDamage: 0.4 }, stamina: 90,
    weapon: { skill: 'swordsmanship', speed: 3 },
  };
  const s = sheetOf(c, actor);
  check('the actor s armour is preferred once there is one', s.ar === 137, String(s.ar));
  check('and so are its resists', s.resists[0].value === 40 && s.resists[1].value === 3);
  check('the actor is the fighter the combat rows read', fighterFor(c, actor) === actor);
  check('so a +12 hit affix shows up in attack',
    s.fight.find((r) => r.label === 'attack').value === Math.round(70 + 12), String(s.fight[0].value));
  check('a crit affix shows up in the crit chance',
    s.fight.find((r) => r.label === 'critical chance').value === '15%',
    s.fight.find((r) => r.label === 'critical chance').value);
  check('and in the crit damage', s.fight.find((r) => r.label === 'critical damage').value === '1.9x',
    s.fight.find((r) => r.label === 'critical damage').value);
}

// ---- the parchment note is written out of counted numbers -------------------
console.log('character: the note');
{
  const c = warrior();
  const s = sheetOf(c, null);
  const line = noteOf(s);
  check('it names the load it just counted', line.includes('0 of 170 stones'), line);
  check('and the gold', line.includes('25 gold'), line);
  check('and the room left, counted rather than guessed',
    line.includes(`${PACK_SLOTS} slots`) && s.packSlots === PACK_SLOTS, line);
  const one = sheetOf(normalise({ ...c, gold: 1 }), null);
  check('one coin is one coin, not "1 gold"', noteOf(one).includes('one gold coin'), noteOf(one));
}
{
  const c = warrior();
  c.pack.items[0] = makeItem({ base: 'plate_outfit', seed: 3 });
  const s = sheetOf(c, null);
  check('a thing in the pack is counted',
    s.packUsed === 1 && noteOf(s).includes(`${PACK_SLOTS - 1} slots`), noteOf(s));
  check('and its weight is on your back', s.weight > 0, String(s.weight));
}

// ---- tooltips ---------------------------------------------------------------
console.log('character: tooltips');
{
  check('an empty cell says nothing', tipFor(null) === null);
  const t = tipFor(makeItem({ base: 'plate_outfit', seed: 5 }));
  check('a filled one gives lines and a colour', t.lines.length > 1 && t.colour === '#ffffff', t.colour);
  const rare = tipFor(makeItem({ base: 'plate_outfit', rarity: 'rare', seed: 5 }));
  check('and an unidentified rare gives its colour and its base only', rare.lines.length === 2 && rare.colour === '#0070dd', rare.lines.map((l) => l.text).join(' | '));
}

// ---- the page itself, built, hovered and clicked ---------------------------
// Everything above is arithmetic. This last section builds the REAL panel
// against a small fake document, fires REAL pointer events at REAL cells, and
// reads the spans that come out, because "hovering turns the number green" is
// a claim about DOM code and nothing above runs a line of it.
console.log('character: the page, hovered');

function makeDom() {
  const make = (tag) => {
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style: {}, dataset: {}, children: [], parent: null,
      innerHTML: '', title: '', hidden: false, draggable: false, type: '',
      isConnected: true,
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      listeners: {}, offsetWidth: 100, offsetHeight: 100, offsetLeft: 0, offsetTop: 0,
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; },
      },
      setAttribute() {}, removeAttribute() {},
      contains: () => false, closest: () => null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = node; node.children.push(c); return c; },
      remove() { if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; } },
      addEventListener(n2, fn) { (node.listeners[n2] ||= []).push(fn); },
      removeEventListener() {},
      fire(n2, ev) { for (const fn of node.listeners[n2] || []) fn(ev || { preventDefault() {}, stopPropagation() {} }); },
      get firstChild() { return node.children[0] || null; },
      get lastChild() { return node.children[node.children.length - 1] || null; },
      querySelector: () => null,
    };
    return node;
  };
  const byId = new Map();
  return {
    createElement: make,
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { if (c.id) byId.set(c.id, c); return c; } },
    body: make('body'),
  };
}
globalThis.document = makeDom();
globalThis.window = { innerWidth: 1600, innerHeight: 900, addEventListener() {}, removeEventListener() {} };

const { createInventory } = await import('./inventory.js');
const { panel } = await import('./win_character.js');
const { deltaText } = await import('./compare.js');

/** Every node under `n`, depth first. */
function walk(n, out = []) {
  out.push(n);
  for (const c of n.children) walk(c, out);
  return out;
}
/** The span that prints one of the twenty one, and the one that follows it. */
function numOf(root, id) {
  const el = walk(root).find((n) => n.dataset && n.dataset.num === id);
  if (!el) return null;
  const after = el.parent.children[el.parent.children.indexOf(el) + 2];
  return { num: el, delta: after };
}
const tipEl = () => [...globalThis.document.body.children].reverse().find((n) => n.id === 'bw-tip') || null;

function ring(str) {
  const it = makeItem({ base: 'ring', rarity: 'rare', seed: 3 });
  it.identified = true;
  it.affixes = [{ id: 'str', value: str }];
  return it;
}

function page(opts = {}) {
  const character = normalise({
    name: 'Ashe', opening: 'warrior', gold: 25,
    stats: { str: 68, dex: 50, int: 25, con: 65, wis: 45 },
    skills: { swordsmanship: 60, tactics: 40, parrying: 50 },
    pack: { slots: 12, items: [] }, equipment: {},
  });
  character.pack.items[0] = ring(2);
  character.pack.items[1] = makeItem({ base: 'greatsword', seed: 5 });
  character.pack.items[2] = makeItem({ base: 'longsword', seed: 6 });
  if (opts.shield) character.equipment.offHand = makeItem({ base: 'kite', seed: 8 });
  const said = [];
  const hud = { log: (t, kind) => { said.push({ text: String(t), kind }); return t; } };
  const inventory = createInventory({ character, hud });
  const ctx = { character, inventory, hud };
  const el = document.createElement('div');
  const p = { ...panel };
  p.build(el, ctx);
  return { p, el, character, inventory, said, grid: p._bag.grid, root: el.children[0] };
}

{
  const r = page();
  const str = numOf(r.root, 'str');
  check('the sheet prints STR as its own span', !!str && str.num.textContent === '68',
    str ? str.num.textContent : 'no span');
  check('and it is plain to start', str.num.className === 'bw-vnum' && str.delta.textContent === '',
    `${str.num.className} "${str.delta.textContent}"`);

  r.grid.children[0].fire('pointerenter', { clientX: 40, clientY: 40 });
  check('hovering a +2 STR ring shows STR at its NEW value', str.num.textContent === '70', str.num.textContent);
  check('in green', str.num.className.includes('bw-up'), str.num.className);
  check('with the difference after it', str.delta.textContent === ` ${deltaText('str', 2)}`
    && str.delta.textContent.trim() === '(+2)', `"${str.delta.textContent}"`);
  check('and the difference is green too', str.delta.className.includes('bw-up'), str.delta.className);
  const health = numOf(r.root, 'maxHealth');
  check('health follows STR and lights up with it',
    health.num.textContent === '195' && health.num.className.includes('bw-up'),
    `${health.num.textContent} ${health.num.className}`);
  check('and it still shows what is left in front of the maximum',
    /^\d+ \/ $/.test(health.num.parent.children[0].textContent), health.num.parent.textContent);
  const dex = numOf(r.root, 'dex');
  check('a number the ring does not touch stays plain',
    dex.num.textContent === '50' && dex.num.className === 'bw-vnum', `${dex.num.textContent} ${dex.num.className}`);
  const carry = numOf(r.root, 'carry');
  check('the carry limit under the pack lights up with the same hover',
    carry.num.textContent === '180' && carry.num.className.includes('bw-up'),
    `${carry.num.textContent} ${carry.num.className}`);

  r.grid.children[0].fire('pointerleave');
  check('taking the cursor away puts the plain number back', str.num.textContent === '68');
  check('and takes the colour off', str.num.className === 'bw-vnum', str.num.className);
  check('and clears the difference', str.delta.textContent === '' && str.delta.className === 'bw-vd');
  check('health goes back too', health.num.textContent === '194', health.num.textContent);
}
{
  // Down is red. A greatsword takes the shield off, and parry goes with it.
  const r = page({ shield: true });
  const parry = numOf(r.root, 'parry');
  check('with a kite on, parry is 18%', parry.num.textContent === '18%', parry.num.textContent);
  r.grid.children[1].fire('pointerenter', { clientX: 40, clientY: 40 });
  check('hovering a greatsword shows parry at nothing', parry.num.textContent === '0%', parry.num.textContent);
  check('in red', parry.num.className.includes('bw-down') && !parry.num.className.includes('bw-up'), parry.num.className);
  check('and says how much is lost', parry.delta.textContent.trim() === '(-18%)', parry.delta.textContent);
  check('and that too is red', parry.delta.className.includes('bw-down'));
  r.grid.children[1].fire('pointerleave');
  check('and it comes back when the cursor leaves', parry.num.textContent === '18%' && parry.num.className === 'bw-vnum');
}
{
  // The second card, beside the tooltip.
  const r = page({ shield: true });
  r.grid.children[1].fire('pointerenter', { clientX: 40, clientY: 40 });
  const tip = tipEl();
  check('the tooltip is up', !!tip && tip.hidden === false);
  const cmp = tip.children.find((c) => c.className.includes('bw-tip-cmp'));
  check('with a second card beside it', !!cmp, tip.children.map((c) => c.className).join(' | '));
  check('headed EQUIPPED', cmp.children[0].textContent === 'Equipped', cmp.children[0].textContent);
  check('naming the shield the greatsword would take off',
    cmp.textContent.includes('Kite Shield'), cmp.textContent.slice(0, 120));
  check('and saying which hand it is in', cmp.textContent.includes('in your off hand'), cmp.textContent.slice(0, 160));
}
{
  const r = page();
  r.grid.children[2].fire('pointerenter', { clientX: 40, clientY: 40 });
  const cmp = tipEl().children.find((c) => c.className.includes('bw-tip-cmp'));
  check('an empty slot says so rather than being left out',
    cmp.textContent.includes('nothing worn there'), cmp.textContent.slice(0, 120));
}
{
  // Equipping makes the previewed numbers the plain ones.
  const r = page();
  const str = numOf(r.root, 'str');
  r.grid.children[0].fire('pointerenter', { clientX: 40, clientY: 40 });
  check('the ring previews STR at 70', str.num.textContent === '70' && str.num.className.includes('bw-up'));
  r.grid.children[0].fire('dblclick');
  check('putting it on leaves STR at 70', str.num.textContent === '70', str.num.textContent);
  check('and makes it plain, because it is the truth now', str.num.className === 'bw-vnum', str.num.className);
  check('with no difference hanging off it', str.delta.textContent === '');
  check('the ring is on the first hand', r.character.equipment.ring1 && r.character.equipment.ring1.base === 'ring');
  check('and it was said out loud', r.said.some((l) => /you put on/.test(l.text)), r.said.map((l) => l.text).join(' | '));
}
{
  // The doll: hovering a worn thing, and taking it off.
  const r = page({ shield: true });
  const cell = walk(r.root).find((n) => n.dataset && n.dataset.slot === 'offHand');
  check('there is a cell for the off hand', !!cell);
  const parry = numOf(r.root, 'parry');
  cell.fire('pointerenter', { clientX: 40, clientY: 40 });
  check('hovering what is already on changes no number',
    parry.num.textContent === '18%' && parry.num.className === 'bw-vnum', parry.num.className);
  const cmp = tipEl().children.find((c) => c.className.includes('bw-tip-cmp'));
  check('and the card names the shield in the hand it is in',
    cmp.textContent.includes('Kite Shield') && cmp.textContent.includes('in your off hand'), cmp.textContent.slice(0, 140));
  cell.fire('pointerleave');
  cell.fire('click');
  check('clicking it takes it off', r.character.equipment.offHand === null);
  check('and the parry that came with it goes', parry.num.textContent === '0%', parry.num.textContent);
  check('and it was said out loud', r.said.some((l) => /you take off/.test(l.text)), r.said.map((l) => l.text).join(' | '));
}
{
  // Drag: a pack slot onto a doll cell, and a doll cell back to the pack.
  const r = page();
  const main = walk(r.root).find((n) => n.dataset && n.dataset.slot === 'mainHand');
  const drop = (where) => ({ preventDefault() {}, dataTransfer: { getData: () => JSON.stringify(where) } });
  main.fire('drop', drop({ pack: 2 }));
  check('dragging the longsword onto the main hand puts it there',
    r.character.equipment.mainHand && r.character.equipment.mainHand.base === 'longsword',
    String(r.character.equipment.mainHand?.base));
  check('and the pack slot it left is empty', r.character.pack.items[2] === null);
  check('and it was said out loud', r.said.some((l) => /you put on longsword/.test(l.text)),
    r.said.map((l) => l.text).join(' | '));
  const before = r.said.length;
  r.grid.children[5].fire('drop', drop({ slot: 'mainHand' }));
  check('dragging it back to the pack takes it off',
    r.character.equipment.mainHand === null && r.character.pack.items[5]
    && r.character.pack.items[5].base === 'longsword', String(r.character.pack.items[5]?.base));
  check('and that was said too', r.said.slice(before).some((l) => /you take off longsword/.test(l.text)),
    r.said.slice(before).map((l) => l.text).join(' | '));
}
{
  // The refusal is on the card, before you click, not only after.
  const weak = normalise({
    name: 'Reed', stats: { str: 20, dex: 50, int: 25, con: 50, wis: 40 },
    skills: {}, pack: { slots: 6, items: [] }, equipment: {},
  });
  weak.pack.items[0] = makeItem({ base: 'warhammer', seed: 2 });
  const said = [];
  const inventory = createInventory({ character: weak, hud: { log: (t, k) => said.push({ text: String(t), kind: k }) } });
  const el = document.createElement('div');
  const p = { ...panel };
  p.build(el, { character: weak, inventory, hud: { log: (t, k) => said.push({ text: String(t), kind: k }) } });
  p._bag.grid.children[0].fire('pointerenter', { clientX: 40, clientY: 40 });
  const cmp = tipEl().children.find((c) => c.className.includes('bw-tip-cmp'));
  check('a warhammer at 20 STR warns on the card before you click it',
    cmp.textContent.includes('wants 65 STR and you have 20'), cmp.textContent.slice(-90));
  const str = numOf(el.children[0], 'str');
  check('and nothing is previewed as changing', str.num.className === 'bw-vnum', str.num.className);
  p._bag.grid.children[0].fire('dblclick');
  check('and double clicking refuses it with the same reason',
    said.some((l) => /wants 65 STR and you have 20/.test(l.text) && l.kind === 'bad'),
    said.map((l) => l.text).join(' | '));
  check('and it stays in the pack', weak.pack.items[0] && weak.pack.items[0].base === 'warhammer');
}
{
  // B lights the pack; C does not; and the light goes out on its own.
  const r = page();
  r.p.open({}, { focus: 'bag' });
  check('B lights the pack', r.p._bag.root.classList.contains('bw-focus'));
  r.p.tick(1.0);
  check('and it is still lit a second later', r.p._bag.root.classList.contains('bw-focus'));
  r.p.tick(1.0);
  check('and dark after that', !r.p._bag.root.classList.contains('bw-focus'));
  r.p.open({}, undefined);
  check('C leaves it unlit', !r.p._bag.root.classList.contains('bw-focus'));
}
{
  // The quarter second redraw must not wipe a hover that is still on.
  const r = page();
  const str = numOf(r.root, 'str');
  r.grid.children[0].fire('pointerenter', { clientX: 40, clientY: 40 });
  r.p.tick(0.3);
  check('a redraw under a live hover leaves the preview standing',
    str.num.textContent === '70' && str.num.className.includes('bw-up'),
    `${str.num.textContent} ${str.num.className}`);
  r.p.tick(0.3);
  check('and again', str.num.textContent === '70' && str.num.className.includes('bw-up'));
}

delete globalThis.document;
delete globalThis.window;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
