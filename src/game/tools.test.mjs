// The tool rule, driven both ways. Run: node src/game/tools.test.mjs
//
// There is no tool row any more, so there is no way to hold the wrong thing.
// The only questions left are "is it carried" and "which of the places it can
// be carried in wins", and every kind of work has to answer them the same way:
// the class of bug this file exists to stop is the axe and the pickaxe drifting
// apart, which is what happened the last time four biomes shipped a tool that
// did nothing.
//
// Every kind is driven four times over: carried in the pack, selected on the
// item bar, worn on the doll, and nowhere at all.

import {
  toolFor, swingWordFor, carriedAt, selectedBaseOf, auditTools,
  GATHER, GATHER_KINDS, nameOf,
} from './tools.js';
import { normalise, PACK_SLOTS } from './inventory.js';
import { makeItem } from '../mmo/items.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const blank = () => normalise({
  name: 'Test', stats: { str: 60, dex: 50, int: 50, con: 50, wis: 50 }, skills: {}, gold: 0,
  pack: { slots: PACK_SLOTS, items: [] }, equipment: {},
});

/** A character carrying exactly what is asked for and nothing else. */
function who({ pack = [], worn = {}, bar = [], selected = null } = {}) {
  const c = blank();
  pack.forEach((base, i) => { c.pack.items[i] = makeItem({ base, count: 1 }); });
  for (const [slot, base] of Object.entries(worn)) c.equipment[slot] = makeItem({ base, count: 1 });
  c.itemBar = new Array(8).fill(null);
  bar.forEach((base, i) => { c.itemBar[i] = base ? { base, name: base } : null; });
  c.itemBarSlot = selected;
  return c;
}

// ---- the table itself -------------------------------------------------------
console.log('tools: the table');
{
  const r = auditTools();
  check('every base every kind asks for is a real base', !!r, `${r.kinds} kinds, ${r.bases} bases`);
  check('the four the game gathers with are all there',
    ['chop', 'mine', 'skin', 'forage'].every((k) => GATHER[k]), GATHER_KINDS.join(' '));
  check('a kind that can refuse names at least one tool',
    GATHER_KINDS.every((k) => GATHER[k].bare || GATHER[k].need.length > 0));
  check('a kind that cannot refuse says so with bare',
    GATHER.forage.bare === true && GATHER.swing.bare === true && GATHER.chop.bare === false);
  check('an unknown kind is refused rather than answered',
    toolFor('juggle', who()).ok === false && /juggle/.test(toolFor('juggle', who()).reason),
    toolFor('juggle', who()).reason);
  check('and a character that is not there at all does not throw',
    toolFor('chop', null).ok === false && toolFor('forage', undefined).ok === true);
}

// ---- chop -------------------------------------------------------------------
console.log('tools: chopping');
{
  const none = toolFor('chop', who(), { noun: 'tree' });
  check('no axe anywhere refuses', none.ok === false && none.id === null);
  check('and names the axe in the words the user asked for',
    none.reason === 'A tree wants an axe, and there is none in your pack.', none.reason);
  check('and the noun is the caller\'s, not a guess',
    toolFor('chop', who(), { noun: 'oak' }).reason === 'An oak wants an axe, and there is none in your pack.',
    toolFor('chop', who(), { noun: 'oak' }).reason);

  const packed = toolFor('chop', who({ pack: ['axe'] }));
  check('an axe in the pack chops', packed.ok === true && packed.id === 'axe' && packed.where === 'pack', packed.where);

  const held = toolFor('chop', who({ worn: { mainHand: 'axe' } }));
  check('an axe in the main hand chops', held.ok === true && held.where === 'mainHand', held.where);

  const onBar = toolFor('chop', who({ pack: ['axe'], bar: ['axe'], selected: 0 }));
  check('an axe selected on the item bar chops, and says so', onBar.ok === true && onBar.where === 'bar', onBar.where);

  const wrong = toolFor('chop', who({ pack: ['pickaxe'], bar: ['pickaxe'], selected: 0 }));
  check('a pickaxe selected on the bar does not chop a tree', wrong.ok === false, wrong.where || '');
  check('and the refusal still asks for the axe', /wants an axe/.test(wrong.reason), wrong.reason);

  const both = toolFor('chop', who({ pack: ['pickaxe', 'axe'], bar: ['pickaxe', 'axe'], selected: 1 }));
  check('with both carried, the selected axe is the one used', both.id === 'axe' && both.where === 'bar');

  check('dev mode carries an axe it never bought',
    toolFor('chop', who(), { dev: true }).ok === true && toolFor('chop', who(), { dev: true }).where === 'dev');
  check('and dev mode off does not', toolFor('chop', who(), { dev: false }).ok === false);
}

// ---- mine -------------------------------------------------------------------
console.log('tools: mining');
{
  const none = toolFor('mine', who(), { noun: 'boulder' });
  check('no pickaxe refuses, and names the boulder',
    none.ok === false && none.reason === 'A boulder wants a pickaxe, and there is none in your pack.', none.reason);
  check('an ore seam gets its own noun',
    toolFor('mine', who(), { noun: 'ore seam' }).reason === 'An ore seam wants a pickaxe, and there is none in your pack.');
  check('a pickaxe in the pack mines', toolFor('mine', who({ pack: ['pickaxe'] })).where === 'pack');
  check('a pickaxe selected on the bar mines',
    toolFor('mine', who({ pack: ['pickaxe'], bar: ['pickaxe'], selected: 0 })).where === 'bar');
  check('an axe, held or selected, does not mine',
    toolFor('mine', who({ worn: { mainHand: 'axe' }, bar: ['axe'], selected: 0 })).ok === false);
  // the pickaxe has no doll slot in items.js, so "equipped" for it is the pack;
  // driven anyway, because a base gaining a slot must not change the answer
  const worn = toolFor('mine', who({ worn: { offHand: 'pickaxe' } }));
  check('and a pickaxe in a hand, if ever it gets one, still mines', worn.ok === true && worn.where === 'offHand');
  check('dev mode mines with nothing', toolFor('mine', who(), { dev: true }).ok === true);
}

// ---- skin -------------------------------------------------------------------
console.log('tools: skinning');
{
  const none = toolFor('skin', who(), { noun: 'wolf' });
  check('no knife refuses in the words skinning.js already said',
    none.ok === false && none.reason === 'You need a dagger in hand or a skinning knife in your pack to skin the wolf.',
    none.reason);
  check('a skinning knife in the pack skins', toolFor('skin', who({ pack: ['skinning_knife'] })).id === 'skinning_knife');
  check('a dagger in the main hand skins', toolFor('skin', who({ worn: { mainHand: 'dagger' } })).id === 'dagger');
  check('a knife selected on the bar skins',
    toolFor('skin', who({ pack: ['skinning_knife'], bar: ['skinning_knife'], selected: 0 })).where === 'bar');
  // place beats preference: what is in your hand is nearer than what is in your
  // pack, which is the order knifeOf has always read the two in
  const both = toolFor('skin', who({ pack: ['skinning_knife'], worn: { mainHand: 'dagger' } }));
  check('a dagger in the hand beats a knife in the pack', both.id === 'dagger' && both.where === 'mainHand', `${both.id}/${both.where}`);
  const packed = toolFor('skin', who({ pack: ['dagger', 'skinning_knife'] }));
  check('but in the pack, the knife named first wins', packed.id === 'skinning_knife' && packed.where === 'pack', `${packed.id}/${packed.where}`);
  check('and a selected dagger beats a knife in the pack',
    toolFor('skin', who({ pack: ['dagger', 'skinning_knife'], bar: ['dagger'], selected: 0 })).id === 'dagger');
  check('an axe is not a knife', toolFor('skin', who({ worn: { mainHand: 'axe' } })).ok === false);
}

// ---- forage -----------------------------------------------------------------
console.log('tools: foraging');
{
  const bare = toolFor('forage', who());
  check('empty hands pick a plant', bare.ok === true && bare.id === null && bare.where === 'hands');
  check('and there is nothing to refuse with', bare.reason === '');
  check('a knife in the pack changes nothing', toolFor('forage', who({ pack: ['skinning_knife'] })).where === 'hands');
  check('and a knife selected on the bar changes nothing either',
    toolFor('forage', who({ pack: ['skinning_knife'], bar: ['skinning_knife'], selected: 0 })).where === 'hands');
  check('foraging can never refuse, whatever is carried',
    [who(), who({ pack: ['axe'] }), who({ worn: { mainHand: 'dagger' } })].every((c) => toolFor('forage', c).ok));
}

// ---- the swing --------------------------------------------------------------
console.log('tools: the hunting swing');
{
  check('bare hands are a swing', swingWordFor(who()) === 'hand');
  check('an axe is a better one', swingWordFor(who({ worn: { mainHand: 'axe' } })) === 'axe');
  check('a pickaxe is the other one', swingWordFor(who({ pack: ['pickaxe'] })) === 'pickaxe');
  check('with both, the axe wins', swingWordFor(who({ pack: ['pickaxe'], worn: { mainHand: 'axe' } })) === 'axe');
  check('and a selected pickaxe beats an axe in the pack',
    swingWordFor(who({ pack: ['axe', 'pickaxe'], bar: ['pickaxe'], selected: 0 })) === 'pickaxe');
  check('the word is one combat.js knows', ['hand', 'axe', 'pickaxe'].includes(swingWordFor(who())));
}

// ---- the selection ----------------------------------------------------------
console.log('tools: what selected means');
{
  check('nothing selected is null', selectedBaseOf(who({ bar: ['axe'] })) === null);
  check('a selection points at a base', selectedBaseOf(who({ bar: ['axe'], selected: 0 })) === 'axe');
  check('a selection at an empty slot is not a selection',
    selectedBaseOf(who({ bar: ['axe'], selected: 3 })) === null);
  check('a selection off the end of the bar is not a selection',
    selectedBaseOf(who({ bar: ['axe'], selected: 99 })) === null);
  check('and neither is a selection that is not a whole number',
    selectedBaseOf(who({ bar: ['axe'], selected: 1.5 })) === null && selectedBaseOf(who({ bar: ['axe'], selected: -1 })) === null);

  check('carriedAt says where a thing is', carriedAt(who({ pack: ['axe'] }), 'axe') === 'pack');
  check('and prefers the selected slot', carriedAt(who({ pack: ['axe'], bar: ['axe'], selected: 0 }), 'axe') === 'bar');
  check('and the doll over the pack', carriedAt(who({ worn: { mainHand: 'axe' } }), 'axe') === 'mainHand');
  check('and null for what is not carried at all', carriedAt(who(), 'axe') === null);
  check('nameOf is the base\'s own word', nameOf('pickaxe') === 'pickaxe' && nameOf('skinning_knife') === 'skinning knife');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
