// The boxes underground, driven through the real pack and the real skill path.
// Run: node src/game/chests.test.mjs
//
// Nothing here is faked that decides anything. The pack is `createInventory`,
// the lesson is `createProgression` over `rollGain`, the loot is `rollDrop`,
// and the only stand-ins are the hud, the audio and the sack layer, which
// record what they were told rather than deciding it.
//
// Every gate is driven BOTH ways: the lock picked and the lock refused, the
// trap drawn and the trap sprung, the pick surviving and the pick snapping, the
// pack with room and the pack full, the box unopened and the box already
// emptied.

import {
  createChests, successChance, difficultyOf, openedKey, tableFor, auditChestTables,
  CHEST_REACH, DIFFICULTY_PER_TIER, TRAP_DAMAGE_PER_TIER, PICK_BREAK_IN, GOLD_MULTIPLIER,
  CHEST_ITEMS, PICK_BASE,
} from './chests.js';
import { createInventory, normalise, PACK_SLOTS } from './inventory.js';
import { createProgression } from './progression.js';
import { makeItem, baseFor } from '../mmo/items.js';
import { TIERS } from '../mmo/monsters.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

/** A die that always shows the same face. Every gate here is driven by one. */
const fixed = (v) => () => v;

/** A box, as cavern_gen.js writes it. */
const boxOf = (o = {}) => ({
  i: 0, gx: 10, gz: 10, x: 0, z: 0, y: 0, room: 1,
  kind: 'chest', locked: true, trapped: false, tier: 3,
  key: 'icevault_deep:1:0', ...o,
});

function rig(opts = {}) {
  const said = [];
  const cues = [];
  const bags = [];
  const character = normalise({
    name: 'Test', stats: { str: 60, dex: 60, int: 40, con: 50, wis: 40 },
    skills: { lockpicking: opts.lockpicking ?? 0, removeTrap: opts.removeTrap ?? 0 },
    gold: 0, pack: { slots: PACK_SLOTS, items: [] }, equipment: {},
  });
  const actor = { pos: { x: 0, y: 0, z: 0 }, health: 200, maxHealth: 200 };
  const hud = { toast: (t) => said.push(String(t)) };
  const audio = { play: (c) => cues.push(c) };
  const touched = [];
  const state = { touch: (w) => touched.push(w) };
  const inventory = createInventory({
    character, actor, recompute: () => {}, onChange: () => {}, hud: { toast: () => {} }, audio: { play: () => {} },
  });
  // the real progression, with a note taken of every lesson it was asked for,
  // so a test can prove a roll TAUGHT even when the gain roll came up short
  const real = createProgression({ character, actor, hud: { toast: () => {} }, audio: { play: () => {} }, state });
  const lessons = [];
  const progression = { ...real, lesson: (id, d, ok, r) => { lessons.push({ id, d, ok }); return real.lesson(id, d, ok, r); } };
  const hurt = [];
  const combat = {
    hurt(a, n) {
      const before = a.health;
      a.health = Math.max(0, before - n);
      hurt.push(before - a.health);
      return before - a.health;
    },
  };
  const loot = { drop: (pos, what) => { bags.push({ pos, what }); return { id: bags.length, ...what }; } };
  const chests = createChests({
    character, inventory, progression, combat, actor, hud, audio, state, loot,
    rng: opts.rng || fixed(0.5),
  });
  return { chests, character, inventory, actor, said, cues, bags, hurt, touched, state, progression, lessons,
    last: () => said[said.length - 1] || '' };
}

const givePicks = (r, n) => r.inventory.add(makeItem({ base: PICK_BASE, count: n, rarity: 'common' }), { quiet: true });
const picks = (r) => r.chests.picksInPack().count;

// ---------------------------------------------------------------------------
// 1. the numbers
// ---------------------------------------------------------------------------
check('the tables audit at load', auditChestTables() === true);
check('a lock is twenty a tier', difficultyOf({ tier: 1 }) === 20 && difficultyOf({ tier: 5 }) === 100,
  `${difficultyOf({ tier: 5 })} at tier 5`);
check('the difficulty ladder is the constant it says it is', DIFFICULTY_PER_TIER === 20);
check('at the difficulty itself it is a coin toss', Math.abs(successChance(60, 60) - 0.5) < 1e-9);
check('twenty five points over it is all but certain', successChance(85, 60) >= 0.94, successChance(85, 60).toFixed(2));
check('twenty five points under it is all but hopeless', successChance(35, 60) <= 0.06, successChance(35, 60).toFixed(2));
check('and it never reaches nought or one', successChance(0, 1000) > 0 && successChance(1000, 0) < 1);
check('a tier 3 chest table is real items', tableFor(3, 'chest').every((b) => !!baseFor(b)),
  tableFor(3, 'chest').length + ' bases');
check('a box carries the key the opened list uses', openedKey(boxOf()) === 'icevault_deep:1:0');

// ---------------------------------------------------------------------------
// 2. the lock, both ways
// ---------------------------------------------------------------------------
{
  // picked: skill well over the difficulty, and a die that agrees
  const r = rig({ lockpicking: 100, rng: fixed(0.5) });
  givePicks(r, 3);
  const chest = boxOf();
  const res = r.chests.open(chest, { at: { x: 0, z: 0 } });
  check('a lock the character can pick opens', res.ok === true && res.lock.picked === true,
    res.lock ? `chance ${res.lock.chance.toFixed(2)}` : res.reason);
  check('and it says the lock turned', r.said.some((t) => /lock turns/i.test(t)), r.said.join(' | '));
  check('and it says what was in it', r.said.some((t) => /chest holds/i.test(t)), r.last());
  check('the pack really took something', res.took.length > 0, `${res.took.length} items`);
  check('the gold really went on the character', r.character.gold === res.gold && res.gold > 0, `${r.character.gold}`);
  const band = TIERS[3].gold;
  check(`and it is the tier band times ${GOLD_MULTIPLIER}`,
    res.gold >= band[0] * GOLD_MULTIPLIER && res.gold <= band[1] * GOLD_MULTIPLIER,
    `${res.gold} against ${band[0] * GOLD_MULTIPLIER}..${band[1] * GOLD_MULTIPLIER}`);
  check('a chest holds two to four things', res.took.length + res.left.length >= CHEST_ITEMS[0]
    && res.took.length + res.left.length <= CHEST_ITEMS[1], `${res.took.length + res.left.length}`);
  check('no pick was lost picking a lock that opened', picks(r) === 3, `${picks(r)}`);
  check('and Lockpicking was taught by the success, at the lock\'s own difficulty',
    r.lessons.some((l) => l.id === 'lockpicking' && l.ok === true && l.d === 60), JSON.stringify(r.lessons));
}
{
  // refused: skill far under, and a die that agrees
  const r = rig({ lockpicking: 0, rng: fixed(0.9) });
  givePicks(r, 3);
  const chest = boxOf({ tier: 5 });
  const res = r.chests.open(chest, { at: { x: 0, z: 0 } });
  check('a lock the character cannot pick stays shut', res.ok === false && res.reason === 'locked');
  check('and it says the pick slipped', r.said.some((t) => /slips/i.test(t)), r.last());
  check('nothing was paid out', res.took.length === 0 && res.gold === 0 && r.character.gold === 0);
  check('the box is still locked and can be tried again', chest.locked === true);
  check('the opened list is still empty', r.chests.opened().length === 0);
  check('and this failure did not snap the pick', res.lock.broke === false && picks(r) === 3);
  // the same failure with a die under the break chance
  const r2 = rig({ lockpicking: 0, rng: fixed(0.10) });
  givePicks(r2, 3);
  const res2 = r2.chests.open(boxOf({ tier: 5 }), { at: { x: 0, z: 0 } });
  check(`one failure in ${PICK_BREAK_IN} snaps the pick`, res2.ok === false && res2.lock.broke === true);
  check('and the pack really has one fewer', picks(r2) === 2, `${picks(r2)}`);
  check('and it says so, and says how many are left',
    r2.said.some((t) => /snaps off/i.test(t) && /2 left/.test(t)), r2.last());
  // down to none, and the words change
  const r3 = rig({ lockpicking: 0, rng: fixed(0.10) });
  givePicks(r3, 1);
  r3.chests.open(boxOf({ tier: 5 }), { at: { x: 0, z: 0 } });
  check('the last pick says it was the last one',
    picks(r3) === 0 && r3.said.some((t) => /last one/i.test(t)), r3.last());
}
{
  // no pick at all
  const r = rig({ lockpicking: 100, rng: fixed(0.5) });
  const chest = boxOf();
  const res = r.chests.open(chest, { at: { x: 0, z: 0 } });
  check('a locked box with no pick in the pack refuses', res.ok === false && res.reason === 'no_pick');
  check('and says what it wants', r.said.some((t) => /wants a pick/i.test(t)), r.last());
  check('and nothing was rolled or paid', res.took.length === 0 && r.character.gold === 0);
  check('and Lockpicking was not taught for a roll that never happened', r.lessons.length === 0);
}
{
  // a cache is not locked at all, and needs no pick
  const r = rig({ rng: fixed(0.5) });
  const res = r.chests.open(boxOf({ kind: 'cache', locked: false, key: 'icefall:1:2' }), { at: { x: 0, z: 0 } });
  check('a cache opens with no pick and no lock', res.ok === true && res.lock === null);
  check('and holds one thing', res.took.length + res.left.length === 1, `${res.took.length + res.left.length}`);
  check('and says it was a cache', r.said.some((t) => /cache holds/i.test(t)), r.last());
}

// ---------------------------------------------------------------------------
// 3. the trap, both ways
// ---------------------------------------------------------------------------
{
  const r = rig({ removeTrap: 100, lockpicking: 100, rng: fixed(0.5) });
  givePicks(r, 2);
  const chest = boxOf({ trapped: true, tier: 4 });
  const res = r.chests.open(chest, { at: { x: 0, z: 0 } });
  check('a trap the character can draw is drawn', res.trap.disarmed === true && res.trap.damage === 0);
  check('and it says so', r.said.some((t) => /needle on a spring/i.test(t)), r.said[0]);
  check('the character took nothing', r.actor.health === 200, `${r.actor.health}`);
  check('and the box still opened', res.ok === true);
  check('and the trap is spent either way', chest.trapped === false);
}
{
  const r = rig({ removeTrap: 0, lockpicking: 100, rng: fixed(0.9) });
  givePicks(r, 2);
  const chest = boxOf({ trapped: true, tier: 4, locked: false });
  const res = r.chests.open(chest, { at: { x: 0, z: 0 } });
  const want = TRAP_DAMAGE_PER_TIER * 4;
  check('a trap the character misses goes off', res.trap.disarmed === false && res.trap.damage === want,
    `${res.trap.damage} of a wanted ${want}`);
  check('and it went through combat.hurt, so the health really moved',
    r.actor.health === 200 - want, `${r.actor.health}`);
  check('and it says how much it cost', r.said.some((t) => new RegExp(`${want} off you`).test(t)), r.said[0]);
  check('the box opens anyway, because a trap is not a wall', res.ok === true);
  check('and Remove Trap was taught by the failure too, at the failure\'s half chance',
    r.lessons.some((l) => l.id === 'removeTrap' && l.ok === false && l.d === 80),
    JSON.stringify(r.lessons));
}

// ---------------------------------------------------------------------------
// 4. a full pack
// ---------------------------------------------------------------------------
{
  const r = rig({ lockpicking: 100, rng: fixed(0.5) });
  givePicks(r, 1);                                       // slot 0, the last space
  // fill every other slot with something that does not stack
  for (let i = 1; i < PACK_SLOTS; i++) r.inventory.add(makeItem({ base: 'longsword', seed: i * 31 }), { quiet: true });
  check('the pack really is full', r.inventory.emptySlot() < 0, `slot ${r.inventory.emptySlot()}`);
  const res = r.chests.open(boxOf({ key: 'firstfire:2:1' }), { at: { x: 0, z: 0 } });
  check('the box still opens', res.ok === true);
  check('and nothing at all went into the pack', res.took.length === 0 && res.left.length > 0,
    `${res.took.length} in, ${res.left.length} left`);
  check('what would not fit is on the floor as a sack', r.bags.length === 1
    && r.bags[0].what.items.length === res.left.length, `${r.bags.length} sacks`);
  check('and it SAYS the pack was full and where the rest went',
    r.said.some((t) => /pack is full/i.test(t) && /sack at your feet/i.test(t)), r.last());
  check('the gold went in even so, because coins are not carried in a slot', r.character.gold === res.gold && res.gold > 0);
}

// ---------------------------------------------------------------------------
// 5. a box pays once, ever
// ---------------------------------------------------------------------------
{
  const r = rig({ lockpicking: 100, rng: fixed(0.5) });
  givePicks(r, 2);
  const chest = boxOf({ key: 'eyrieroost:3:4' });
  const first = r.chests.open(chest, { at: { x: 0, z: 0 } });
  const goldAfter = r.character.gold;
  const itemsAfter = r.inventory.pack.items.filter(Boolean).length;
  check('the first opening pays', first.ok === true && goldAfter > 0);
  check('and the key is on the character', r.chests.opened().includes('eyrieroost:3:4'),
    r.chests.opened().join(', '));
  check('and the save was told', r.touched.includes('opened'), r.touched.join(', '));

  // the same box, a second time, with the lock and the trap already off it
  const second = r.chests.open(chest, { at: { x: 0, z: 0 } });
  check('the second opening refuses', second.ok === false && second.reason === 'already');
  check('and says the box is already yours', r.said.some((t) => /stands open already/i.test(t)), r.last());
  check('no second payout: the gold did not move', r.character.gold === goldAfter, `${r.character.gold}`);
  check('and the pack did not either', r.inventory.pack.items.filter(Boolean).length === itemsAfter);

  // a fresh character has emptied nothing, so the same box pays again for them
  const r2 = rig({ lockpicking: 100, rng: fixed(0.5) });
  givePicks(r2, 2);
  const other = r2.chests.open(boxOf({ key: 'eyrieroost:3:4' }), { at: { x: 0, z: 0 } });
  check('and it is per character, not per world', other.ok === true && r2.character.gold > 0);
}

// ---------------------------------------------------------------------------
// 6. reach
// ---------------------------------------------------------------------------
{
  const r = rig({ lockpicking: 100, rng: fixed(0.5) });
  givePicks(r, 2);
  const far = boxOf({ x: 40, z: 0, key: 'spiderwells:1:0' });
  const res = r.chests.open(far, { at: { x: 0, z: 0 } });
  check(`a box past ${CHEST_REACH} m is refused`, res.ok === false && res.reason === 'too_far');
  check('and it says how far off it is', /40 m off/.test(r.last()), r.last());
  check('and the lock was not touched', far.locked === true);
  const near = boxOf({ x: 2, z: 0, key: 'spiderwells:1:1' });
  check(`and a box inside ${CHEST_REACH} m opens`, r.chests.open(near, { at: { x: 0, z: 0 } }).ok === true);
}

// ---------------------------------------------------------------------------
// 7. the skill really climbs, over a hundred boxes
// ---------------------------------------------------------------------------
{
  // A beginner at a tier 1 lock: difficulty 20, so the chance at skill 0 is
  // 0.5 + (0 - 20) * 0.018 = 0.14, and a die showing 0.10 beats it every time.
  const r = rig({ lockpicking: 0, removeTrap: 0, rng: fixed(0.10) });
  givePicks(r, 200);
  let opened = 0;
  for (let i = 0; i < 120; i++) {
    const res = r.chests.open(boxOf({ tier: 1, trapped: true, key: `oldcellars:1:${i}` }), { at: { x: 0, z: 0 } });
    if (res.ok) opened++;
  }
  check('a hundred and twenty boxes teach Lockpicking something',
    r.character.skills.lockpicking > 0, `${r.character.skills.lockpicking}`);
  check('and Remove Trap too', r.character.skills.removeTrap > 0, `${r.character.skills.removeTrap}`);
  check('and the boxes that opened are the ones on the list',
    r.chests.opened().length === opened, `${opened} opened, ${r.chests.opened().length} remembered`);
  check('and a die at 0.10 against a tier 1 lock opens every one of them',
    opened === 120, `${opened}/120`);
  check('and the skill really climbed the band, not one step and then nothing',
    r.character.skills.lockpicking >= 10, `Lockpicking ${r.character.skills.lockpicking}`);
}

// ---------------------------------------------------------------------------
// 8. a real box, off a real level
// ---------------------------------------------------------------------------
//
// Everything above uses a box written by hand in the shape the generator
// promises. This one comes out of the generator itself, which is the join that
// would otherwise be taken on trust.
{
  const { generateCavern } = await import('../world/cavern_gen.js');
  const { DUNGEONS } = await import('../mmo/dungeons.js');
  const spec = DUNGEONS.skulllodge_throat;
  const L = generateCavern(20260904, {
    id: `z:${spec.id}`, sub: spec.id, kind: spec.place, name: spec.name, cx: 9, cz: -4,
  }, 1, spec);
  const chest = L.chests.find((c) => c.kind === 'chest');
  const cache = L.chests.find((c) => c.kind === 'cache');
  check('the generator really made a locked chest and an unlocked cache',
    !!chest && chest.locked === true && !!cache && cache.locked === false,
    `${L.chests.length} boxes on ${spec.name} level 1`);
  const r = rig({ lockpicking: 100, removeTrap: 100, rng: fixed(0.5) });
  givePicks(r, 4);
  const res = r.chests.open(chest, { at: { x: chest.x, z: chest.z } });
  check('and chests.js opens the one the generator made', res.ok === true,
    `${res.reason} on ${chest.key}`);
  check('at the tier the realm gave it', chest.tier === spec.tier, `tier ${chest.tier}`);
  check('and remembers it by the key the layout wrote',
    r.chests.opened().includes(chest.key), chest.key);
  const second = r.chests.open(chest, { at: { x: chest.x, z: chest.z } });
  check('and the same box on the same level never pays twice', second.ok === false);
  // the whole level, opened, is the whole level remembered
  for (const c of L.chests) r.chests.open(c, { at: { x: c.x, z: c.z } });
  check('every box on the level can be opened and every one is on the list',
    r.chests.opened().length === L.chests.length,
    `${r.chests.opened().length} of ${L.chests.length}`);
  check('and the character is richer for it', r.character.gold > 0, `${r.character.gold} coins`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
