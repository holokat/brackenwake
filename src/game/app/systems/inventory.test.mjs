// The settler's kit, measured through the real system. Run:
//   node src/game/app/systems/inventory.test.mjs
//
// Nothing here asserts that a grant exists. Every count below was taken out of
// a pack that the real `inventory.create(ctx)` really filled, over the real
// `createInventory`, against a character the real `planCharacter` really made.
// The boot is run twice on the same character, because "once only" is a claim
// about the second boot and not about the first.

globalThis.performance ||= { now: () => 1000 };
globalThis.window ||= { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

import {
  inventory as inventorySystem, SETTLER_KIT, settlerKitFor,
  hadSettlerKit, hasMeleeWeapon, hasFocus, ownsBase,
} from './inventory.js';
import { planCharacter } from '../../creation.js';
import { OPENINGS } from '../../../mmo/openings.js';
import { BASES, baseFor, isFocus, makeItem } from '../../../mmo/items.js';
import { recompute } from '../../actor.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---------------------------------------------------------------------------
// The stub world the system is booted into. Everything the system actually
// touches is real; what is left is a recorder, so the log lines can be read
// back and the pack is the pack the game would have.

function boot(character) {
  const logs = [];
  const touched = [];
  const ctx = {
    character,
    state: { touch: (what) => touched.push(what) },
    hud: { log: (text, kind) => logs.push({ text, kind }) },
    audio: { play() {} },
    floaters: { add() {} },
    has: () => false,
    get(name) {
      if (name === 'player') {
        return {
          actor: recompute({}, character),
          progression: { lesson() {}, gain() {} },
          pos: { x: 0, y: 0, z: 0 },
          dress() {},
        };
      }
      if (name === 'combat') return { monsters: { list: () => [] }, loot: { drop() {} } };
      if (name === 'ui') return { windows: { open() {} } };
      return null;
    },
  };
  const made = inventorySystem.create(ctx);
  return { made, logs, touched, character };
}

const packBases = (c) => c.pack.items.filter(Boolean)
  .map((it) => `${it.base}${it.count > 1 ? ` x${it.count}` : ''}`).sort();
const countOf = (c, base) => c.pack.items.filter(Boolean)
  .filter((it) => it.base === base).reduce((s, it) => s + (it.count || 1), 0);

// ---------------------------------------------------------------------------
console.log('settler kit: the table itself');
{
  check('the kit is seven lines: five tools and the two that decide how you train',
    SETTLER_KIT.length === 7, SETTLER_KIT.map((e) => e.base).join(', '));
  check('every base in it is a real item base',
    SETTLER_KIT.every((e) => !!BASES[e.base]), SETTLER_KIT.map((e) => e.base).join(', '));
  check('the three ways to train are all in it: a melee weapon, a bow with arrows, and a wand',
    SETTLER_KIT.some((e) => e.base === 'dagger') && SETTLER_KIT.some((e) => e.base === 'shortbow')
    && SETTLER_KIT.some((e) => e.base === 'arrow' && e.count === 40)
    && SETTLER_KIT.some((e) => e.base === 'wand'));
  check('the wand is the only line held back by a focus, and the dagger the only one held back by a blade',
    SETTLER_KIT.filter((e) => e.unless === 'focus').map((e) => e.base).join() === 'wand'
    && SETTLER_KIT.filter((e) => e.unless === 'melee').map((e) => e.base).join() === 'dagger');

  // The two predicates, driven both ways over real records.
  const empty = { pack: { items: [] }, equipment: {} };
  const swordsman = { pack: { items: [makeItem({ base: 'longsword' })] }, equipment: {} };
  const wanded = { pack: { items: [] }, equipment: { mainHand: makeItem({ base: 'wand' }) } };
  const archer = { pack: { items: [makeItem({ base: 'shortbow' })] }, equipment: {} };
  const staffed = { pack: { items: [makeItem({ base: 'staff' })] }, equipment: {} };
  check('hasMeleeWeapon: a longsword yes, a bow no, a staff no, an empty pack no',
    hasMeleeWeapon(swordsman) === true && hasMeleeWeapon(archer) === false
    && hasMeleeWeapon(staffed) === false && hasMeleeWeapon(empty) === false);
  check('and an axe counts, because it is a weapon you swing',
    hasMeleeWeapon({ pack: { items: [makeItem({ base: 'axe' })] }, equipment: {} }) === true);
  check('hasFocus: a wand worn yes, a staff packed yes, a quarterstaff no, nothing no',
    hasFocus(wanded) === true && hasFocus(staffed) === true
    && hasFocus({ pack: { items: [makeItem({ base: 'quarterstaff' })] }, equipment: {} }) === false
    && hasFocus(empty) === false);
  check('ownsBase reads the pack and the paper doll both',
    ownsBase(swordsman, 'longsword') === true && ownsBase(wanded, 'wand') === true
    && ownsBase(empty, 'wand') === false);
}

// ---------------------------------------------------------------------------
console.log('settler kit: the pack after boot, counted');
{
  // Exactly what is in the pack, for the three openings the brief names.
  const WANT = {
    warrior: ['arrow x40', 'axe', 'bandage x6', 'pickaxe', 'shortbow', 'skinning_knife', 'wand'],
    mage: ['arrow x40', 'axe', 'dagger', 'pickaxe', 'potion x4', 'shortbow', 'skinning_knife'],
    blank: ['arrow x40', 'axe', 'pickaxe', 'shortbow', 'skinning_knife', 'wand'],
  };
  for (const [id, want] of Object.entries(WANT)) {
    const c = planCharacter({ opening: id, name: 'Ashe', seed: 7 }).character;
    const { logs } = boot(c);
    const got = packBases(c);
    check(`the ${id}'s pack after boot is exactly ${want.length} things`,
      got.join(', ') === want.join(', '), got.join(', '));
    check(`and the ${id} was told about it in one line`,
      logs.filter((l) => /settler's tools/.test(l.text)).length === 1,
      logs.map((l) => l.text).join(' | ') || 'nothing said');
  }

  // And the hands, which is the other half of "what is there".
  const warrior = planCharacter({ opening: 'warrior', name: 'Ashe', seed: 7 }).character;
  boot(warrior);
  check('the warrior still holds the longsword and the kite shield, and the wand waits in the pack',
    warrior.equipment.mainHand.base === 'longsword' && warrior.equipment.offHand.base === 'kite'
    && countOf(warrior, 'wand') === 1);
  const mage = planCharacter({ opening: 'mage', name: 'Ashe', seed: 7 }).character;
  boot(mage);
  check('the mage holds the staff, is given no second focus, and gets the dagger it had nothing to swing without',
    mage.equipment.mainHand.base === 'staff' && countOf(mage, 'wand') === 0
    && countOf(mage, 'dagger') === 1);
  const blank = planCharacter({ opening: 'blank', name: 'Ashe', seed: 7 }).character;
  boot(blank);
  check('Blank holds the dagger, keeps its own wand and is given no second one',
    blank.equipment.mainHand.base === 'dagger' && countOf(blank, 'wand') === 1
    && countOf(blank, 'dagger') === 0);
}

// ---------------------------------------------------------------------------
console.log('settler kit: once, and only once');
{
  const c = planCharacter({ opening: 'warrior', name: 'Ashe', seed: 7 }).character;
  const first = boot(c);
  const afterOne = packBases(c);
  check('the first boot grants the kit and says so',
    afterOne.length === 7 && first.logs.some((l) => /settler's tools/.test(l.text)), afterOne.join(', '));
  check('and hadSettlerKit went from false to true across it', hadSettlerKit(c) === true);

  const second = boot(c);
  const afterTwo = packBases(c);
  check('booting a second time grants nothing twice',
    afterTwo.join(', ') === afterOne.join(', '), `${afterTwo.length} things, unchanged`);
  check('and says nothing a second time',
    second.logs.filter((l) => /settler's tools/.test(l.text)).length === 0,
    second.logs.map((l) => l.text).join(' | ') || 'silent');
  const third = boot(c);
  check('nor a third time', packBases(c).join(', ') === afterOne.join(', ')
    && third.logs.filter((l) => /settler's tools/.test(l.text)).length === 0);
  check('settlerKitFor is empty once the kit has been had', settlerKitFor(c).length === 0);
}

// ---------------------------------------------------------------------------
console.log('settler kit: all eleven openings, and the three ways to train');
{
  const rows = [];
  let allThree = 0, doubledFocus = 0, doubledMelee = 0;
  for (const op of OPENINGS) {
    const c = planCharacter({ opening: op.id, name: 'Ashe', seed: 7 }).character;
    boot(c);
    const all = [...c.pack.items.filter(Boolean), ...Object.values(c.equipment).filter(Boolean)];
    const melee = all.filter((it) => {
      const b = baseFor(it);
      return b.kind === 'weapon' && b.hands > 0 && b.range == null && !isFocus(b);
    });
    const bows = all.filter((it) => baseFor(it).range != null);
    const arrows = all.filter((it) => it.base === 'arrow').reduce((s, it) => s + (it.count || 1), 0);
    const foci = all.filter((it) => isFocus(it));
    if (melee.length && bows.length && arrows > 0 && foci.length) allThree++;
    if (foci.length > 1) doubledFocus++;
    // The axe is a melee weapon AND the tool that fells trees, so everybody
    // ends with at least two things they can swing. What must not happen is a
    // spare DAGGER on top of a kit that already had a blade.
    const kitHadMelee = hasMeleeWeapon(planCharacter({ opening: op.id, name: 'Ashe', seed: 7 }).character);
    const daggers = all.filter((it) => it.base === 'dagger').length;
    const kitDaggers = planCharacter({ opening: op.id, name: 'Ashe', seed: 7 })
      .character.pack.items.filter((it) => it && it.base === 'dagger').length
      + Object.values(planCharacter({ opening: op.id, name: 'Ashe', seed: 7 }).character.equipment)
        .filter((it) => it && it.base === 'dagger').length;
    if (kitHadMelee && daggers > kitDaggers) doubledMelee++;
    rows.push(`${op.id} ${melee.length}m/${bows.length}b/${arrows}a/${foci.length}f`);
  }
  console.log(`  ${rows.join('  ')}`);
  check('every one of the eleven openings can train melee, bow and magic after boot',
    allThree === OPENINGS.length, `${allThree} of ${OPENINGS.length}`);
  check('and nobody is handed a second focus they did not need', doubledFocus === 0);
  check('nor a spare dagger on top of a kit that already had a blade', doubledMelee === 0,
    'only the three pure casters, whose whole kit is a staff, are given one');
  check('the artisan, whose own kit is an axe and a pickaxe, is not skipped any more',
    (() => {
      const c = planCharacter({ opening: 'artisan', name: 'Ashe', seed: 7 }).character;
      boot(c);
      return countOf(c, 'shortbow') === 1 && countOf(c, 'arrow') === 40
        && countOf(c, 'skinning_knife') === 1 && countOf(c, 'wand') === 1
        && countOf(c, 'axe') === 0 && countOf(c, 'pickaxe') === 1;
    })(),
    'it used to own an axe and a pickaxe already, so the old guard read it as already kitted');
}

// ---------------------------------------------------------------------------
console.log('settler kit: a pack with no room says so');
{
  const c = planCharacter({ opening: 'warrior', name: 'Ashe', seed: 7 }).character;
  // fill every free slot with stones, so nothing the kit hands over can land
  for (let i = 0; i < c.pack.items.length; i++) {
    if (!c.pack.items[i]) c.pack.items[i] = makeItem({ base: 'stone', count: 1 });
  }
  const { logs } = boot(c);
  const refused = logs.filter((l) => /would not fit/.test(l.text));
  check('a full pack is told what did not fit rather than losing it in silence',
    refused.length === 1, refused.map((l) => l.text).join(' | ') || 'nothing said');
  check('and the kit is not marked as given, so a settler who makes room still gets it',
    hadSettlerKit(c) === false && settlerKitFor(c).length > 0,
    `${settlerKitFor(c).length} still owed`);
}

console.log(`\nsettler kit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
