// What a piece of gear would do to you, measured rather than asserted.
// Run: node src/game/compare.test.mjs
//
// No DOM. compare.js is pure, and every number below is checked against the
// module that owns it: the AR penalty against `recompute` run by hand, the
// before column against the character sheet the player is actually looking at,
// the slot a ring chooses against inventory.js's own `chooseSlot`.
//
// The two claims that matter most and are easiest to get wrong:
//   the preview does not touch the live document or the live actor
//   the "before" it shows is the number already on the screen

import {
  SHOWN, SHOWN_IDS, SHOWN_BY_ID, RESIST_ID, previewEquip, equippedFor, equippedCard,
  readNumbers, actorFor, cloneCharacter, previewActor, locate, slotFor,
  formatValue, deltaText, roundFor, auditShown,
} from './compare.js';
import { sheetOf } from './win_character.js';
import { normalise, PACK_SLOTS, createInventory } from './inventory.js';
import { playerActor, recompute } from './actor.js';
import { makeItem, SLOTS, armourOf } from '../mmo/items.js';
import { RESIST_TYPES } from './inventory.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

/** An identified item with the affixes written on it by hand. */
function gear(base, affixes = [], extra = {}) {
  const it = makeItem({ base, rarity: affixes.length ? 'rare' : 'common', seed: 7, ...extra });
  it.identified = true;
  it.affixes = affixes;
  return it;
}

function ashe(stats = { str: 68, dex: 50, int: 25, con: 65, wis: 45 }) {
  return normalise({
    name: 'Ashe', opening: 'warrior', gold: 25,
    stats: { ...stats },
    skills: { swordsmanship: 60, tactics: 40, parrying: 50, meditation: 0 },
    pack: { slots: PACK_SLOTS, items: [] }, equipment: {},
  });
}

// ---- the list itself --------------------------------------------------------
console.log('compare: the twenty one numbers');
check('the audit counts them rather than asserting them', auditShown() === SHOWN.length, `${SHOWN.length} numbers`);
check('and there are twenty one', SHOWN.length === 21, String(SHOWN.length));
check('the five stats are in it', ['str', 'dex', 'int', 'con', 'wis'].every((k) => SHOWN_IDS.includes(k)));
check('the three pools are in it', ['maxHealth', 'maxMana', 'maxStamina'].every((k) => SHOWN_IDS.includes(k)));
check('armour, attack, defence, dodge, parry and both crits are in it',
  ['armour', 'attack', 'defence', 'dodge', 'parry', 'critChance', 'critDamage'].every((k) => SHOWN_IDS.includes(k)));
check('all five resists are in it', RESIST_TYPES.every((t) => SHOWN_IDS.includes(RESIST_ID[t])),
  RESIST_TYPES.map((t) => RESIST_ID[t]).join(','));
check('and carry', SHOWN_IDS.includes('carry'));
check('no id appears twice', new Set(SHOWN_IDS).size === SHOWN_IDS.length);
check('a percentage rounds to a tenth of a point', roundFor('pct', 0.1234) === 12.3, String(roundFor('pct', 0.1234)));
check('a multiplier rounds to a hundredth', roundFor('mult', 1.9004) === 1.9, String(roundFor('mult', 1.9004)));
check('a whole number rounds to a whole number', roundFor('int', 12.6) === 13);
check('a stat is written plain', formatValue('str', 70) === '70');
check('a resist wears its sign', formatValue(RESIST_ID.fire, 12) === '12%');
check('a chance wears one too', formatValue('dodge', 10) === '10%');
check('a multiplier wears an x', formatValue('critDamage', 1.9) === '1.9x');
check('a gain reads as a gain', deltaText('str', 2) === '(+2)');
check('a loss reads as a loss', deltaText('parry', -18) === '(-18%)', deltaText('parry', -18));
check('and a fractional one keeps its fraction', deltaText('critDamage', 0.4) === '(+0.4x)');
check('no label uses an em dash', SHOWN.every((s) => !s.label.includes('—')));

// ---- a ring of two strength -------------------------------------------------
console.log('compare: a ring of +2 STR');
{
  const c = ashe();
  const ring = gear('ring', [{ id: 'str', value: 2 }]);
  c.pack.items[0] = ring;
  const p = previewEquip(c, null, ring);
  check('it goes on the first ring hand', p.slot === 'ring1', String(p.slot));
  check('STR reads 68 before', p.before.str === 68, String(p.before.str));
  check('and 70 after', p.after.str === 70, String(p.after.str));
  check('the delta is +2', p.deltas.str.delta === 2, String(p.deltas.str.delta));
  check('and it is better', p.deltas.str.better === true && p.deltas.str.changed === true);
  check('which is what a player would read', `${p.after.str} ${deltaText('str', p.deltas.str.delta)}` === '70 (+2)');
  check('carry follows STR at two stones a point', p.deltas.carry.delta === 4, String(p.deltas.carry.delta));
  check('and health at half a point', p.deltas.maxHealth.delta === 1, String(p.deltas.maxHealth.delta));
  check('nothing else moves', p.changed.sort().join(',') === 'carry,maxHealth,str', p.changed.join(','));
  check('everything that did not move is flagged unchanged',
    SHOWN_IDS.filter((id) => !p.changed.includes(id)).every((id) => p.deltas[id].changed === false && p.deltas[id].delta === 0));
}

// ---- the preview does not touch the world -----------------------------------
console.log('compare: the preview is a copy, byte for byte');
{
  const c = ashe();
  c.equipment.chest = gear('chain_chest');
  c.equipment.offHand = gear('kite');
  c.pack.items[0] = gear('plate_chest');
  c.pack.items[1] = gear('greatsword');
  c.pack.items[2] = gear('ring', [{ id: 'dex', value: 5 }]);
  const actor = playerActor(c);
  const charBefore = JSON.stringify(c);
  const actorBefore = JSON.stringify(actor);
  for (const item of [c.pack.items[0], c.pack.items[1], c.pack.items[2], c.equipment.offHand]) {
    previewEquip(c, actor, item);
  }
  check('four previews leave the document byte for byte where it was',
    JSON.stringify(c) === charBefore);
  check('and the actor byte for byte where it was', JSON.stringify(actor) === actorBefore);
  check('the pack still holds what it held',
    c.pack.items.filter(Boolean).length === 3, String(c.pack.items.filter(Boolean).length));
  check('and the shield is still on the arm', c.equipment.offHand && c.equipment.offHand.base === 'kite');
  // A clone that shared its equipment object would pass the byte test by
  // accident, so prove the clone is a different object.
  const clone = cloneCharacter(c);
  check('the clone is a different document', clone !== c && clone.equipment !== c.equipment && clone.pack.items !== c.pack.items);
  check('holding the same item records', clone.equipment.offHand === c.equipment.offHand);
}

// ---- the before column is the sheet the player is looking at ----------------
console.log('compare: before is what is already on the screen');
{
  const c = ashe();
  c.equipment.chest = gear('chain_chest');
  c.equipment.mainHand = gear('longsword');
  c.equipment.offHand = gear('kite');
  const actor = playerActor(c);
  const s = sheetOf(c, actor);
  const p = previewEquip(c, actor, gear('plate_chest'));
  const diffs = SHOWN_IDS.filter((id) => p.before[id] !== s.nums[id]);
  check('every one of the twenty one matches the sheet', diffs.length === 0, diffs.join(','));
  check('STR', p.before.str === s.stats[0].value && s.stats[0].value === 68, String(s.stats[0].value));
  check('armour', p.before.armour === s.ar, `${p.before.armour} vs ${s.ar}`);
  check('attack', formatValue('attack', p.before.attack) === String(s.fight.find((f) => f.label === 'attack').value));
  check('parry', formatValue('parry', p.before.parry) === s.fight.find((f) => f.label === 'parry').value,
    s.fight.find((f) => f.label === 'parry').value);
  check('carry', p.before.carry === s.carry, `${p.before.carry} vs ${s.carry}`);
  check('and the physical resist', p.before[RESIST_ID.physical] === s.resists[0].value);
  check('with no actor at all the sheet and the preview still agree',
    SHOWN_IDS.every((id) => previewEquip(c, null, gear('plate_chest')).before[id] === sheetOf(c, null).nums[id]));
}

// ---- a plate chest too heavy for the arms wearing it ------------------------
console.log('compare: a plate chest at 60 STR');
{
  const c = ashe({ str: 60, dex: 50, int: 25, con: 65, wis: 45 });
  const plate = gear('plate_chest');
  c.pack.items[0] = plate;
  const p = previewEquip(c, null, plate);
  // What recompute would give, worked out by hand rather than taken on faith.
  const worn = cloneCharacter(c);
  worn.equipment.chest = plate;
  worn.pack.items[0] = null;
  const byHand = recompute(playerActor(worn));
  check('the chest is where it goes', p.slot === 'chest');
  check('armour was nothing before', p.before.armour === 0);
  check('and after is exactly what recompute gives', p.after.armour === Math.round(byHand.ar),
    `${p.after.armour} vs ${byHand.ar}`);
  check('which is the piece halved, because 60 STR is short of 75',
    p.after.armour === Math.round(armourOf(plate, c.stats)) && p.after.armour === 12,
    `${p.after.armour}, armourOf says ${armourOf(plate, c.stats)}`);
  check('the delta is +12 and green', p.deltas.armour.delta === 12 && p.deltas.armour.better === true);
  check('the penalty is not swallowed: the reason is carried out',
    /wants 75 STR and you have 60/.test(p.reason), p.reason);
  check('and it still goes on, because armour above your STR is allowed', p.ok === true);
}
{
  // The same piece on arms that CAN lift it gives the whole 24.
  const c = ashe({ str: 80, dex: 50, int: 25, con: 65, wis: 45 });
  const plate = gear('plate_chest');
  c.pack.items[0] = plate;
  const p = previewEquip(c, null, plate);
  check('at 80 STR the same chest is worth twice as much', p.after.armour === 24, String(p.after.armour));
  check('and there is no penalty to report', p.reason === '', JSON.stringify(p.reason));
}

// ---- a two handed weapon takes the shield off -------------------------------
console.log('compare: a greatsword against a shield');
{
  const c = ashe({ str: 70, dex: 50, int: 25, con: 65, wis: 45 });
  c.equipment.mainHand = gear('longsword');
  c.equipment.offHand = gear('kite');
  const gs = gear('greatsword');
  c.pack.items[0] = gs;
  const p = previewEquip(c, null, gs);
  check('it goes in the main hand', p.slot === 'mainHand');
  check('parry was 18% with the kite on', p.before.parry === 18, String(p.before.parry));
  check('and is 0 without it', p.after.parry === 0);
  check('so the delta is negative and NOT better',
    p.deltas.parry.delta === -18 && p.deltas.parry.better === false && p.deltas.parry.changed === true);
  check('the sword and the shield both come off',
    p.displaced.map((i) => i.base).sort().join(',') === 'kite,longsword',
    p.displaced.map((i) => i.base).join(','));
}
{
  // A plain shield carries no AR in items.js, so the number that falls when it
  // comes off is parry. Put an +AR line on it and the ARMOUR row falls too,
  // which is the case the reference sheet shows in red.
  const c = ashe({ str: 70, dex: 50, int: 25, con: 65, wis: 45 });
  c.equipment.offHand = gear('kite', [{ id: 'ar', value: 5 }]);
  const gs = gear('greatsword');
  c.pack.items[0] = gs;
  const p = previewEquip(c, null, gs);
  check('a shield with +5 AR is worth 5 armour', p.before.armour === 5, String(p.before.armour));
  check('taking it off drops the armour to nothing', p.after.armour === 0);
  check('the delta is -5, which is drawn in red', p.deltas.armour.delta === -5 && p.deltas.armour.better === false);
  check('and the row would read "0 (-5)"',
    `${p.after.armour} ${deltaText('armour', p.deltas.armour.delta)}` === '0 (-5)');
}

// ---- a weapon nobody can lift ------------------------------------------------
console.log('compare: what will not go on at all');
{
  const c = ashe({ str: 20, dex: 50, int: 25, con: 65, wis: 45 });
  const hammer = gear('warhammer');
  c.pack.items[0] = hammer;
  const p = previewEquip(c, null, hammer);
  check('a warhammer at 20 STR is refused', p.ok === false);
  check('and says the number that stopped it', /wants 65 STR and you have 20/.test(p.reason), p.reason);
  check('nothing at all is previewed as changing', p.changed.length === 0, p.changed.join(','));
  check('and after is before', SHOWN_IDS.every((id) => p.after[id] === p.before[id]));
}
{
  const c = ashe();
  const ingot = gear('ingot');
  const p = previewEquip(c, null, ingot);
  check('an ingot is not something you equip', p.ok === false && /not something you equip/.test(p.reason), p.reason);
  const p2 = previewEquip(c, null, null);
  check('and nothing at all is refused rather than thrown at', p2.ok === false && p2.changed.length === 0);
}

// ---- something already on --------------------------------------------------
console.log('compare: hovering what you are already wearing');
{
  const c = ashe();
  c.equipment.ring1 = gear('ring', [{ id: 'str', value: 2 }]);
  const p = previewEquip(c, null, c.equipment.ring1);
  check('the ring is found where it is', locate(c, c.equipment.ring1).slot === 'ring1');
  check('putting on what is already on changes nothing', p.changed.length === 0, p.changed.join(','));
  check('and it is not a refusal', p.ok === true && p.worn === true);
  check('STR is already the 70 it would be', p.before.str === 70, String(p.before.str));
}

// ---- which slot, and what is in it ------------------------------------------
console.log('compare: equippedFor, across every kind of slot');
{
  const c = ashe();
  const cases = [
    ['head', 'plate_head'], ['neck', 'amulet'], ['chest', 'plate_chest'],
    ['back', 'plate_back'], ['hands', 'plate_hands'], ['wrists', 'plate_wrists'],
    ['waist', 'plate_waist'], ['legs', 'plate_legs'], ['feet', 'plate_feet'],
    ['ring1', 'ring'], ['mainHand', 'longsword'], ['offHand', 'kite'],
    // a longbow is a main hand weapon too (2026-09-08); the retired ranged slot has no kind of thing
  ];
  const seen = new Set();
  let allRight = true;
  const wrong = [];
  for (const [slot, base] of cases) {
    const found = equippedFor(c, gear(base));
    seen.add(found.slot);
    if (found.slot !== slot) { allRight = false; wrong.push(`${base} went to ${found.slot}, not ${slot}`); }
    if (found.items[0] !== null) { allRight = false; wrong.push(`${base} found something in an empty ${slot}`); }
  }
  check('every kind of thing finds its own empty slot', allRight, wrong.join('; ') || `${cases.length} kinds`);
  check('and between them they cover twelve of the fourteen: the second ring hand and the retired ranged slot are the two without a kind',
    seen.size === 12 && SLOTS.filter((s) => !seen.has(s)).join(',') === 'ring2,ranged',
    SLOTS.filter((s) => !seen.has(s)).join(','));
  check('a longbow finds the main hand, like every weapon', equippedFor(c, gear('longbow')).slot === 'mainHand');
  check('a material has no slot to find', equippedFor(c, gear('ingot')).slot === null);
}
{
  // The rings: the empty hand first, then the first hand when both are full.
  const c = ashe();
  const a = gear('ring', [{ id: 'str', value: 1 }]);
  const b = gear('ring', [{ id: 'dex', value: 1 }]);
  check('with both hands bare a ring takes the first', equippedFor(c, gear('ring')).slot === 'ring1');
  c.equipment.ring1 = a;
  const second = equippedFor(c, gear('ring'));
  check('with one ring on, the next goes on the EMPTY hand', second.slot === 'ring2', String(second.slot));
  check('and it says there is nothing there to lose', second.items[0] === null);
  c.equipment.ring2 = b;
  const third = equippedFor(c, gear('ring'));
  check('with both hands full it displaces the first', third.slot === 'ring1');
  check('and names what it would displace', third.items[0] === a);
  check('a hint wins when the slot is one this item could take',
    equippedFor(c, gear('ring'), 'ring2').slot === 'ring2');
  check('and a hint that is not one of its slots is ignored rather than obeyed',
    equippedFor(c, gear('ring'), 'head').slot === 'ring1');
  check('which is inventory.js own chooseSlot, not a second copy',
    slotFor(c, gear('ring')) === createInventory({ character: cloneCharacter(c) }).chooseSlot(gear('ring'), null));
}
{
  const c = ashe();
  c.equipment.mainHand = gear('longsword');
  c.equipment.offHand = gear('kite');
  const two = equippedFor(c, gear('greatsword'));
  check('a two handed weapon answers with BOTH hands', two.slots.join(',') === 'mainHand,offHand', two.slots.join(','));
  check('and names the sword and the shield it would take',
    two.items.map((i) => i.base).join(',') === 'longsword,kite', two.items.map((i) => i && i.base).join(','));
  check('and says it is two handed', two.twoHanded === true);
  c.equipment.offHand = null;
  const bare = equippedFor(c, gear('greatsword'));
  check('with a bare off hand there is only one slot to talk about', bare.slots.join(',') === 'mainHand');
  check('a one handed sword never mentions the off hand',
    equippedFor(c, gear('longsword')).slots.join(',') === 'mainHand');
}

// ---- the card the tooltip hangs beside the item -----------------------------
console.log('compare: the equipped card');
{
  const c = ashe();
  c.equipment.mainHand = gear('longsword');
  c.equipment.offHand = gear('kite');
  const card = equippedCard(c, gear('greatsword'));
  check('it is headed Equipped', card.head === 'Equipped');
  check('with a block per slot', card.blocks.length === 2);
  check('the first is the sword, named and coloured',
    card.blocks[0].name === 'Longsword' && card.blocks[0].colour === '#ffffff'
    && card.blocks[0].base.id === 'longsword', card.blocks[0].name);
  check('and it carries lines to print', card.blocks[0].lines.length > 1, String(card.blocks[0].lines.length));
  check('the second is the shield', card.blocks[1].name === 'Kite Shield' && card.blocks[1].slot === 'offHand');
  const empty = equippedCard(ashe(), gear('plate_head'));
  check('an empty slot says so in words rather than being left out',
    empty.blocks.length === 1 && empty.blocks[0].empty === true
    && empty.blocks[0].name === 'nothing worn there', empty.blocks[0].name);
  check('and offers no glyph to draw', empty.blocks[0].base === null);
  check('a material has no card at all', equippedCard(c, gear('ingot')) === null);
}

// ---- readNumbers falls back rather than printing nothing --------------------
console.log('compare: reading a fighter that is not a full actor');
{
  const c = ashe();
  const hand = {
    stats: c.stats, skills: c.skills, bonuses: { hit: 12, critChance: 0.1, critDamage: 0.4 },
    ar: 137, resists: { physical: 40, fire: 3, cold: 0, poison: 0, energy: 0 },
    stamina: 90, weapon: { skill: 'swordsmanship', speed: 3 },
  };
  const n = readNumbers(hand, c);
  check('the hand built fighter s armour is used', n.armour === 137);
  check('and its resists', n[RESIST_ID.physical] === 40 && n[RESIST_ID.fire] === 3);
  check('the pools it does not carry come from the stats',
    n.maxHealth === 194 && n.maxMana === 112, `${n.maxHealth}, ${n.maxMana}`);
  check('and so does carry', n.carry === 176, String(n.carry));
  check('every one of the twenty one is a real number',
    SHOWN_IDS.every((id) => typeof n[id] === 'number' && Number.isFinite(n[id])),
    SHOWN_IDS.filter((id) => !Number.isFinite(n[id])).join(','));
  check('actorFor hands back the live actor when there is one', actorFor(c, hand) === hand);
  check('and builds a real one when there is not', actorFor(c, null).kind === 'player');
}
{
  // previewActor must not write on the actor it was copied from.
  const c = ashe();
  const live = playerActor(c);
  const snapshot = JSON.stringify(live);
  const clone = cloneCharacter(c);
  clone.equipment.chest = gear('plate_chest');
  const previewed = previewActor(live, clone);
  check('the copy wears the new chest', previewed.ar > 0, String(previewed.ar));
  check('and the original is untouched', JSON.stringify(live) === snapshot && live.ar === 0);
  check('they are two different actors', previewed !== live && previewed.equipment !== live.equipment);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
