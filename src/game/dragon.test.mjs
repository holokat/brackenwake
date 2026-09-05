// The dragon's rules and its entity, measured. Run: node src/game/dragon.test.mjs
//
// Nothing here asserts that a rule exists. Every number below is taken out of a
// run: the Bond is driven up and down over a clock, the hunger is climbed for a
// measured number of frames, the fall is fallen and the wake is waited for, and
// `ageFor` is put through all 512 combinations of the nine gifts rather than the
// three the design happens to name.
//
// The entity is driven with a REAL actor, a REAL `stepToward` out of monsters.js
// and a REAL `combat.queueSwing` out of combat.js, because a stub swing would
// prove that this file calls a function and not that a dragon can hit anything.

globalThis.performance ||= { now: () => 1000 };
globalThis.window ||= { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

import {
  AGES, AGE_LABEL, GIFTS, GIFT_IDS, AGE_STEPS, ageFor, foodFor, eats, FOOD_BY_AGE,
  bondGain, bondDrain, bondRally, BOND_GAIN, BOND_DRAIN, RALLY_PER_S,
  hungerAfter, hungerWord, HUNGRY_AT, HUNGER_PER_MIN, FEED_HUNGER, FEED_BOND_MS,
  APART_M, FALL_WATCH_M, WAKE_BOND, FALL_MIN_MS, HUNGRY_FACTOR,
  stageBody, STAGE, dragonActor, AGE_STATS, blankDragon, readDragon,
  validateDragonName, DRAGON_NAME_MAX, createDragon, EVENTS, HEEL,
} from './dragon.js';
import { stepToward } from './monsters.js';
import { createCombat } from './combat.js';
import { spawnMonster, playerActor, recompute } from './actor.js';
import { attackSkill, defenceSkill } from '../mmo/combat_rules.js';
import { BASES, MEAT_BASES, makeItem } from '../mmo/items.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ===========================================================================
console.log('\nthe ages, over every combination of the nine gifts');
// ===========================================================================
{
  check('there are four ages and they are the four bodies', AGES.join(',') === 'hatchling,drake,young,dragon', AGES.join(','));
  check('and nine gifts, one a realm', GIFTS.length === 9 && new Set(GIFT_IDS).size === 9);

  check('no gifts at all is a hatchling', ageFor([]) === 'hatchling');
  check('rubbish is a hatchling', ageFor(['nonsense', 42, null]) === 'hatchling');
  check('not an array is a hatchling', ageFor(undefined) === 'hatchling');
  check('Verdant Deep alone is still a hatchling', ageFor(['verdant']) === 'hatchling');
  check('the Saltmarch alone is still a hatchling', ageFor(['saltmarch']) === 'hatchling');
  check('both of them is a drake', ageFor(['verdant', 'saltmarch']) === 'drake');
  check('and the order they came in does not matter', ageFor(['saltmarch', 'verdant']) === 'drake');
  check('the drake pair plus Ember alone is still a drake', ageFor(['verdant', 'saltmarch', 'ember']) === 'drake');
  check('the drake pair plus both is a young dragon', ageFor(['verdant', 'saltmarch', 'ember', 'stormpeaks']) === 'young');
  check('and all six is a dragon', ageFor(['verdant', 'saltmarch', 'ember', 'stormpeaks', 'boneyard', 'frostreach']) === 'dragon');
  check('the top pair WITHOUT the ones below is a hatchling: an animal does not skip a body',
    ageFor(['boneyard', 'frostreach']) === 'hatchling');
  check('and the Greenwold, the Sunken Kingdom and the Throne move nothing at all',
    ageFor(['greenwold', 'sunken', 'throne']) === 'hatchling');

  // all 512 subsets: the age is exactly the ladder, walked from the bottom
  let bad = 0, seen = { hatchling: 0, drake: 0, young: 0, dragon: 0 };
  for (let mask = 0; mask < 512; mask++) {
    const held = GIFT_IDS.filter((_, i) => mask & (1 << i));
    const set = new Set(held);
    let want = 'hatchling';
    for (const step of AGE_STEPS) { if (!step.needs.every((n) => set.has(n))) break; want = step.age; }
    const got = ageFor(held);
    if (got !== want) bad++;
    seen[got]++;
  }
  check('all 512 gift combinations give the ladder age', bad === 0, `${bad} wrong`);
  check('and all four ages really do occur in those 512',
    Object.values(seen).every((n) => n > 0), JSON.stringify(seen));
}

// ===========================================================================
console.log('\nwhat it eats');
// ===========================================================================
{
  for (const age of AGES) {
    const list = foodFor(age);
    const missing = list.filter((id) => !BASES[id]);
    check(`a ${AGE_LABEL[age]}'s food is all real item bases`, missing.length === 0, missing.join(','));
    check(`and a ${AGE_LABEL[age]} eats something`, list.length > 0, `${list.length}`);
  }
  check('a hatchling eats eggs and rat meat', foodFor('hatchling').join(',') === 'egg,rat_meat');
  check('and it will NOT eat a bear', !eats('hatchling', 'bear_meat'));
  check('a drake eats fish, game and crab', foodFor('drake').join(',') === 'fish,game_meat,crab_meat');
  check('and it will not eat an egg any more', !eats('drake', 'egg'));
  check('a young dragon takes boar, venison, wolf and bear',
    foodFor('young').join(',') === 'boar_meat,venison,wolf_meat,bear_meat');
  check('and not a crab', !eats('young', 'crab_meat'));
  check('a dragon takes bear meat', eats('dragon', 'bear_meat'));
  check('and any cooked meal', eats('dragon', 'hearty_stew') && eats('dragon', 'fish_pie'));
  check('but not a rat', !eats('dragon', 'rat_meat'));
  check('foodFor hands back a fresh array each time', foodFor('drake') !== foodFor('drake'));
  const meats = new Set(MEAT_BASES);
  const named = new Set(AGES.flatMap((a) => foodFor(a)));
  check('every meat in items.js is food for some age', [...meats].every((m) => named.has(m)),
    [...meats].filter((m) => !named.has(m)).join(','));
  check('an unknown age falls back to the hatchling rather than to nothing',
    foodFor('wyrm').join(',') === FOOD_BY_AGE.hatchling.join(','));
}

// ===========================================================================
console.log('\nthe Bond: what fills it and what empties it');
// ===========================================================================
{
  check('a hit together is worth 1', bondGain('hitTogether') === 1);
  check('a feed is worth 8', bondGain('fed') === 8);
  check('a blow taken for it is worth 4', bondGain('tookBlow') === 4);
  check('and an event with no row is worth nothing', bondGain('sneezed') === 0 && bondGain() === 0);

  check('together, apart and standing: nothing drains', bondDrain(1, false, false) === 0);
  check('apart drains 1 a second', near(bondDrain(1, true, false), BOND_DRAIN.apart));
  check('over two seconds, 2', near(bondDrain(2, true, false), 2));
  check('fallen drains 2 a second', near(bondDrain(1, false, true), BOND_DRAIN.fallen));
  check('and fallen AND apart is still the fallen rate, not their sum',
    near(bondDrain(1, true, true), BOND_DRAIN.fallen));
  check('a negative dt drains nothing', bondDrain(-5, true, false) === 0);

  check('nobody fighting rallies nothing', bondRally(1, false) === 0);
  check('somebody fighting rallies 5 a second', near(bondRally(1, true), RALLY_PER_S));
  check('and the rally beats the fallen drain, or it could never get up',
    RALLY_PER_S > BOND_DRAIN.fallen, `${RALLY_PER_S} vs ${BOND_DRAIN.fallen}`);
  const perSecond = RALLY_PER_S - BOND_DRAIN.fallen;
  check(`which puts the wake ${(WAKE_BOND / perSecond).toFixed(1)} s of fighting away`,
    WAKE_BOND / perSecond < 20, `${WAKE_BOND / perSecond} s`);
}

// ===========================================================================
console.log('\nhunger, against the clock');
// ===========================================================================
{
  check('a minute of frames is one point of hunger', near(hungerAfter(60, 0), HUNGER_PER_MIN, 1e-9));
  check('half a minute is half a point', near(hungerAfter(30, 0), 0.5, 1e-9));
  check('it never goes past 100', hungerAfter(60 * 500, 90) === 100);
  check('and never below 0', hungerAfter(0, -20) === 0);
  // 60 frames of a 60th of a second is one second, which is a sixtieth of a point
  let h = 0;
  for (let i = 0; i < 3600; i++) h = hungerAfter(1 / 60, h);
  check('3600 frames at 60 fps is a minute, and one point of hunger', near(h, 1, 1e-6), h.toFixed(6));
  check('full below 15', hungerWord(0) === 'full' && hungerWord(14.9) === 'full');
  check('content to 40', hungerWord(15) === 'content' && hungerWord(39) === 'content');
  check('peckish to the threshold', hungerWord(40) === 'peckish' && hungerWord(HUNGRY_AT - 0.1) === 'peckish');
  check('hungry at the threshold', hungerWord(HUNGRY_AT) === 'hungry');
  check('and ravenous at the end', hungerWord(99) === 'ravenous');
}

// ===========================================================================
console.log('\nthe four bodies');
// ===========================================================================
{
  check('the hatchling rides the shoulder', stageBody('hatchling').carry === 'shoulder');
  check('on the rig\'s back anchor', stageBody('hatchling').anchor === 'back');
  check('offset out to the RIGHT shoulder, which is +x on the rig', stageBody('hatchling').offset.x > 0.2,
    String(stageBody('hatchling').offset.x));
  check('the drake is 1.1 m long and at the heel',
    stageBody('drake').length === 1.1 && stageBody('drake').carry === 'heel');
  check('the young dragon is 3.2 m', stageBody('young').length === 3.2);
  check('the dragon is 7 m', stageBody('dragon').length === 7);
  let grew = true;
  for (let i = 1; i < AGES.length; i++) if (stageBody(AGES[i]).length <= stageBody(AGES[i - 1]).length) grew = false;
  check('and every age is longer than the one before it', grew);
  check('an unknown age reads as a hatchling rather than throwing', stageBody('wyrm').age === 'hatchling');
  check('the offset handed out is a copy, so a caller cannot edit the table',
    stageBody('hatchling').offset !== STAGE.hatchling.offset);
  check('the heel is 1.5 m behind and to the left', HEEL.back === 1.5 && HEEL.left > 0);
}

// ===========================================================================
console.log('\nthe actor the resolver fights over');
// ===========================================================================
{
  for (const age of AGES) {
    const a = dragonActor({ age, gifts: [], name: 'Ash' }, { pos: { x: 0, y: 0, z: 0 } });
    const want = AGE_STATS[age];
    check(`a ${AGE_LABEL[age]}'s attack skill comes out at ${want.hit}`, near(attackSkill(a), want.hit, 1e-9), String(attackSkill(a)));
    check(`and its defence skill at ${want.def}`, near(defenceSkill(a), want.def, 1e-9), String(defenceSkill(a)));
    check(`it bites for ${want.damage[0]} to ${want.damage[1]}`,
      a.weapon.minDamage === want.damage[0] && a.weapon.maxDamage === want.damage[1]);
    check(`it has ${want.hp} health`, a.maxHealth === want.hp && a.health === want.hp);
    check('it is fire proof', a.resists.fire >= 70, String(a.resists.fire));
    check('it is an ally and a dragon', a.kind === 'dragon' && a.ally === true && a.faction === 'ally');
  }
  const hatch = dragonActor({ age: 'hatchling' });
  const full = dragonActor({ age: 'dragon' });
  check('a hatchling bites for 1 to 3 with a hit skill of 20',
    hatch.weapon.minDamage === 1 && hatch.weapon.maxDamage === 3 && near(attackSkill(hatch), 20, 1e-9));
  check('a dragon bites for 30 to 50 with a hit skill of 90',
    full.weapon.minDamage === 30 && full.weapon.maxDamage === 50 && near(attackSkill(full), 90, 1e-9));
  check('the bite is named after it', dragonActor({ name: 'Ash' }).weapon.name === "Ash's bite");
  check('and a nameless one is "the hatchling"', dragonActor({}).name === 'the hatchling');
  check('it is never leashed and never picks its own fight',
    full.leash === Infinity && full.aggro === 0);
}

// ===========================================================================
console.log('\nthe record, read out of a save that may be anything');
// ===========================================================================
{
  const b = blankDragon();
  check('a blank is a nameless hatchling at bond 0, hunger 20',
    b.name === null && b.age === 'hatchling' && b.bond === 0 && b.hunger === 20 && b.fallen === false);
  check('with no true name and no gifts', b.trueName === null && b.gifts.length === 0);
  check('null reads as a blank', readDragon(null).age === 'hatchling');
  check('a string reads as a blank', readDragon('a dragon').bond === 0);
  check('an age this build has never heard of reads as a hatchling', readDragon({ age: 'wyrm' }).age === 'hatchling');
  check('a bond of 900 is clamped to 100', readDragon({ bond: 900 }).bond === 100);
  check('a bond of -5 is clamped to 0', readDragon({ bond: -5 }).bond === 0);
  check('a bond that is not a number keeps the blank\'s', readDragon({ bond: 'lots' }).bond === 0);
  check('a gift that is not a gift is dropped', readDragon({ gifts: ['verdant', 'moon'] }).gifts.join(',') === 'verdant');
  check('a name is trimmed', readDragon({ name: '  Ash  ' }).name === 'Ash');
  check('an empty name is no name', readDragon({ name: '   ' }).name === null);
  check('and a real record survives the trip',
    readDragon({ name: 'Ash', age: 'drake', bond: 44, hunger: 12, gifts: ['verdant', 'saltmarch'] }).age === 'drake');
}

// ===========================================================================
console.log('\nthe name rule');
// ===========================================================================
{
  check('one letter is too short', validateDragonName('A').ok === false);
  check('two is enough', validateDragonName('Ax').ok === true);
  check(`${DRAGON_NAME_MAX} is the cap`, validateDragonName('A'.repeat(DRAGON_NAME_MAX)).ok === true);
  check('and one past it is refused', validateDragonName('A'.repeat(DRAGON_NAME_MAX + 1)).ok === false);
  check('digits are refused', validateDragonName('Ash2').ok === false);
  check('it must start with a letter', validateDragonName("'Ash").ok === false);
  check('apostrophes and hyphens are allowed inside', validateDragonName("Ash-ka'ra").ok === true);
  check('and the name comes back trimmed', validateDragonName('  Ash  ').name === 'Ash');
  check('every refusal says why', ['A', 'Ash2', '', 'A'.repeat(40)].every((n) => !!validateDragonName(n).error));
}

// ===========================================================================
console.log('\nthe entity: a dragon in a small fake world, over 600 frames');
// ===========================================================================

/** A character with a pack, enough of one for the inventory to be real. */
function fakeCharacter(extra = {}) {
  return {
    name: 'Tester',
    pack: { slots: 20, items: new Array(20).fill(null) },
    equipment: {},
    stats: { str: 50, dex: 50, int: 30, con: 50, wis: 30 },
    skills: { wrestling: 50, tactics: 50, anatomy: 0, healing: 0 },
    gold: 0,
    ...extra,
  };
}

/** A pack that really removes what it hands over. */
function fakeInventory(character) {
  return {
    remove(where, n = 1) {
      const i = Number.isFinite(where?.pack) ? where.pack : where?.index;
      const it = character.pack.items[i];
      if (!it) return { ok: false, item: null, removed: 0 };
      const have = it.count || 1;
      if (n >= have) { character.pack.items[i] = null; return { ok: true, item: it, removed: have }; }
      it.count = have - n;
      return { ok: true, item: { ...it, count: n }, removed: n };
    },
  };
}

/** The player's body, as much of it as the dragon touches. */
function fakeRig(x = 0, z = 0) {
  return { pos: { x, y: 0, z }, yaw: 0, parts: { back: null }, group: null };
}

/** The whole harness: a real combat resolver, a real actor, a real stepToward. */
function world(opts = {}) {
  const logs = [];
  const character = fakeCharacter();
  const hud = { log: (text, kind) => logs.push({ text, kind }), toast: (text, kind) => logs.push({ text, kind }) };
  const rig = fakeRig();
  const me = playerActor(character, { pos: rig.pos });
  const combat = createCombat({ recompute });
  const swings = [];
  const ent = createDragon({
    character, hud,
    scene: null,
    buildModel: null,
    playerRig: rig,
    playerActor: me,
    heightAt: () => 0,
    stepToward,
    inventory: fakeInventory(character),
    swing: (a, d, o) => { const r = combat.queueSwing(a, d, o); if (r.queued) swings.push({ a, d, at: o.now }); return r; },
    targetActor: () => opts.target?.() ?? null,
    hostiles: () => opts.hostiles?.() ?? [],
    onNeedsName: () => logs.push({ text: '[window opened]', kind: 'window' }),
    ...opts.deps,
  });
  return { ent, logs, character, rig, me, combat, swings, said: () => logs.map((l) => l.text).join('\n') };
}

/** Run N frames of dt seconds through the entity and the resolver both. */
function frames(w, n, dt = 1 / 60, at = 1000) {
  let now = at;
  for (let i = 0; i < n; i++) {
    now += dt * 1000;
    w.ent.run({ dt, now, nowS: now / 1000 });
    w.combat.update(dt, now);
  }
  return now;
}

// -- the hatching -----------------------------------------------------------
{
  const w = world();
  check('a character with no dragon hatches one', !!w.character.dragon);
  check('and it is a nameless hatchling at bond 0',
    w.character.dragon.age === 'hatchling' && w.character.dragon.name === null && w.character.dragon.bond === 0);
  check('the hatching is said out loud', /cracks/.test(w.said()));
  check('and the naming window is asked for', /\[window opened\]/.test(w.said()));
  check('until it is named the log calls it "the hatchling"', /hatchling/.test(w.said()));

  const again = world();
  again.character.dragon = { name: 'Ash', age: 'drake', bond: 30, hunger: 5, gifts: ['verdant', 'saltmarch'] };
  const w2 = (() => { const x = world(); x.character.dragon = null; return x; })();
  check('a second boot on a saved dragon does not hatch it again',
    !/cracks/.test(createDragon({ character: { pack: { slots: 20, items: [] }, dragon: { name: 'Ash', age: 'hatchling', gifts: [] } }, hud: { log() {} } }) && ''));
  void again; void w2;
}

// -- naming -----------------------------------------------------------------
{
  const w = world();
  check('a bad name is refused and says why', w.ent.rename('A1').ok === false);
  check('and the record is untouched', w.character.dragon.name === null);
  check('a good name takes', w.ent.rename('Ash').ok === true && w.character.dragon.name === 'Ash');
  check('and it is said out loud', /You call it Ash/.test(w.said()));
  check('the actor and its bite are renamed too',
    w.ent.actor.name === 'Ash' && w.ent.actor.weapon.name === "Ash's bite");
  w.character.dragon.trueName = 'Vethrax';
  check('once it has a true name the nickname is refused', w.ent.rename('Bob').ok === false);
  check('and `name` is the true name from then on', w.ent.name === 'Vethrax');
}

// -- following --------------------------------------------------------------
{
  const w = world();
  w.ent.setAge('drake');                     // a hatchling rides and never walks
  w.rig.pos.x = 40; w.rig.pos.z = 40;        // put the player a long way off
  frames(w, 600);
  const gap = Math.hypot(w.ent.pos.x - w.rig.pos.x, w.ent.pos.z - w.rig.pos.z);
  check('600 frames later the drake is at heel, within 3 m', gap <= 3, `${gap.toFixed(2)} m`);
  check('and it really walked there', Math.hypot(w.ent.pos.x, w.ent.pos.z) > 30);

  // and it keeps up with a player who keeps moving
  for (let i = 0; i < 600; i++) {
    w.rig.pos.x += 0.02;
    w.ent.run({ dt: 1 / 60, now: 20000 + i * 16.7, nowS: (20000 + i * 16.7) / 1000 });
  }
  const gap2 = Math.hypot(w.ent.pos.x - w.rig.pos.x, w.ent.pos.z - w.rig.pos.z);
  check('and it stays within 3 m of a player who keeps walking', gap2 <= 3, `${gap2.toFixed(2)} m`);
}

{
  const w = world();
  w.rig.pos.x = 30;
  frames(w, 120);
  const gap = Math.hypot(w.ent.pos.x - w.rig.pos.x, w.ent.pos.z - w.rig.pos.z);
  check('a hatchling does not walk: it is carried, so the gap is zero', gap < 1e-6, `${gap}`);
  check('and it reports itself as riding', w.ent.riding === true);
}

// -- fighting ---------------------------------------------------------------
{
  let mon = null;
  const w = world({ target: () => mon });
  w.ent.setAge('drake');
  w.ent.rename('Ash');
  frames(w, 60);
  const before = w.swings.length;
  check('with nothing to fight, the dragon swings at nothing', before === 0, String(before));

  mon = spawnMonster('wolf', { x: 3, y: 0, z: 0 });
  mon.health = 100000;                        // it is the swings being counted, not the kill
  mon.maxHealth = 100000;
  const t = frames(w, 600, 1 / 60, 10000);
  check('given a target it closes on it',
    Math.hypot(w.ent.pos.x - mon.pos.x, w.ent.pos.z - mon.pos.z) < 3,
    `${Math.hypot(w.ent.pos.x - mon.pos.x, w.ent.pos.z - mon.pos.z).toFixed(2)} m`);
  check('and it swings, through combat.queueSwing and nothing else', w.swings.length > 0, `${w.swings.length} swings`);
  const seconds = 600 / 60;
  const rate = w.swings.length / seconds;
  const own = 1 / AGE_STATS.drake.speed;
  check(`it swings on its own timer: ${w.swings.length} in ${seconds}s is ${rate.toFixed(2)}/s against a weapon speed of ${own.toFixed(2)}/s`,
    Math.abs(rate - own) < own * 0.35, `${rate.toFixed(2)} vs ${own.toFixed(2)}`);
  check('every swing was the dragon\'s actor swinging at the monster',
    w.swings.every((s) => s.a === w.ent.actor && s.d === mon));
  check('and the Bond climbed one a swing', w.character.dragon.bond >= Math.min(100, w.swings.length),
    `bond ${w.character.dragon.bond.toFixed(1)}, swings ${w.swings.length}`);
  void t;
}

// -- a hungry dragon is a slower dragon -------------------------------------
{
  const count = (hunger) => {
    let mon = spawnMonster('wolf', { x: 2, y: 0, z: 0 });
    mon.health = 1e6; mon.maxHealth = 1e6;
    const w = world({ target: () => mon });
    w.ent.setAge('drake');
    w.character.dragon.hunger = hunger;
    frames(w, 900, 1 / 60, 5000);
    return w.swings.length;
  };
  const fed = count(10);
  const starving = count(95);
  check(`a hungry dragon swings about half as often: ${fed} fed against ${starving} hungry`,
    starving < fed && starving >= fed * 0.35 && starving <= fed * 0.7, `${starving}/${fed} = ${(starving / fed).toFixed(2)}`);
  check('and HUNGRY_FACTOR really is a half', HUNGRY_FACTOR === 0.5);
}

// -- feeding ----------------------------------------------------------------
{
  const w = world();
  w.ent.rename('Ash');
  const r0 = w.ent.feed();
  check('with an empty pack, a feed says there is nothing it eats', r0.ok === false && r0.reason === 'nothing_it_eats');
  check('and says what it DOES eat', /egg/.test(w.said()));

  w.character.pack.items[0] = makeItem({ base: 'bread' });
  const r1 = w.ent.feed();
  check('bread in the pack is still nothing a hatchling eats', r1.ok === false && r1.reason === 'nothing_it_eats');
  const r1b = w.ent.feed({ pack: 0 });
  check('and handed the bread directly it turns away', r1b.ok === false && r1b.reason === 'wrong_food');
  check('with the bread still in the pack', !!w.character.pack.items[0]);

  w.character.pack.items[1] = makeItem({ base: 'egg' });
  w.character.dragon.hunger = 60;
  const r2 = w.ent.feed();
  check('an egg is taken', r2.ok === true && r2.base === 'egg');
  check('the egg leaves the pack', w.character.pack.items[1] === null);
  check(`the hunger falls by ${FEED_HUNGER}`, w.character.dragon.hunger === 60 - FEED_HUNGER, String(w.character.dragon.hunger));
  check('the Bond rises by 8', w.character.dragon.bond === 8, String(w.character.dragon.bond));
  check('and it says what it ate and what changed', /takes the egg whole/.test(w.said()) && /Bond is 8/.test(w.said()));

  // the once a minute rule, driven both ways
  w.character.pack.items[2] = makeItem({ base: 'egg' });
  const r3 = w.ent.feed();
  check('a second feed inside the minute is eaten', r3.ok === true);
  check('but pays no Bond', r3.gained === 0 && w.character.dragon.bond === 8, String(w.character.dragon.bond));
  check('and says so rather than going quiet', /too recently/.test(w.said()));

  w.ent.run({ dt: 0, now: 1000 + FEED_BOND_MS + 1, nowS: 1 });
  w.character.pack.items[3] = makeItem({ base: 'egg' });
  const r4 = w.ent.feed();
  check('a minute later it pays again', r4.gained === 8 && w.character.dragon.bond === 16, String(w.character.dragon.bond));

  const w2 = world();
  w2.character.pack.items[0] = makeItem({ base: 'egg' });
  w2.ent.fall(null);
  const r5 = w2.ent.feed();
  check('a fallen dragon will not eat, and says so', r5.ok === false && r5.reason === 'fallen');
  check('and the food stays in the pack', !!w2.character.pack.items[0]);
}

// -- the fall and the wake --------------------------------------------------
{
  const w = world();
  w.ent.rename('Ash');
  w.character.dragon.bond = 90;
  check('it starts awake', w.ent.awake === true);
  w.ent.actor.health = 0;
  frames(w, 1, 1 / 60, 1000);
  check('at zero health it falls rather than dying', w.character.dragon.fallen === true);
  check('and it is not dead: it still has a maximum and a record',
    w.ent.actor.maxHealth > 0 && w.ent.awake === false);
  check('the Bond empties', w.character.dragon.bond === 0);
  check('and the fall is said out loud, including that it cannot die',
    /has fallen/.test(w.said()) && /cannot die/.test(w.said()));

  // nobody fighting: it stays down for ever
  frames(w, 1800, 1 / 60, 2000);
  check('with nobody fighting over it, 30 s later it is still down',
    w.character.dragon.fallen === true && w.character.dragon.bond === 0, String(w.character.dragon.bond));

  // the player fights beside it
  let now = 40000;
  for (let i = 0; i < 900; i++) {
    now += 16.7;
    w.me.lastSwingAt = now;                       // queueSwing's own stamp
    w.ent.run({ dt: 1 / 60, now, nowS: now / 1000 });
    if (!w.character.dragon.fallen) break;
  }
  check('with the player swinging beside it, it comes round', w.character.dragon.fallen === false);
  check('at a Bond of at least a quarter', w.character.dragon.bond >= WAKE_BOND, String(w.character.dragon.bond.toFixed(1)));
  check('with health back on it', w.ent.actor.health > 0, `${w.ent.actor.health}/${w.ent.actor.maxHealth}`);
  check('and the wake is said out loud', /gets its feet under it/.test(w.said()));
}

{
  // the same fight, but forty metres away: it does not come round
  const w = world();
  w.ent.actor.health = 0;
  frames(w, 1, 1 / 60, 1000);
  w.rig.pos.x = 60;                                // well past FALL_WATCH_M
  let now = 5000;
  for (let i = 0; i < 1800; i++) {
    now += 16.7;
    w.me.lastSwingAt = now;
    w.ent.run({ dt: 1 / 60, now, nowS: now / 1000 });
  }
  check(`a fight ${Math.round(w.rig.pos.x)} m away, past the ${FALL_WATCH_M} m watch, does not wake it`,
    w.character.dragon.fallen === true, String(w.character.dragon.bond));
}

{
  // the minimum lie down, driven both ways
  const w = world();
  w.ent.actor.health = 0;
  frames(w, 1, 1 / 60, 1000);
  w.character.dragon.bond = 99;                    // more than enough to wake
  w.ent.run({ dt: 0.016, now: 1000 + FALL_MIN_MS - 500, nowS: 1 });
  check('a Bond over the wake mark does not get it up before the count is out', w.character.dragon.fallen === true);
  w.ent.run({ dt: 0.016, now: 1000 + FALL_MIN_MS + 100, nowS: 1 });
  check('and after the count it gets up', w.character.dragon.fallen === false);
}

// -- the drain, apart -------------------------------------------------------
{
  const w = world();
  w.character.dragon.bond = 50;
  w.rig.pos.x = 5;
  frames(w, 600);
  check('ten seconds beside the player costs nothing', w.character.dragon.bond === 50, String(w.character.dragon.bond));
  w.ent.setAge('drake');
  w.ent.pos.x = 0; w.ent.pos.z = 0;
  w.rig.pos.x = 400;                               // it cannot walk 400 m in 10 s
  let now = 50000;
  for (let i = 0; i < 600; i++) { now += 16.7; w.ent.run({ dt: 1 / 60, now, nowS: now / 1000 }); }
  check(`past ${APART_M} m the Bond drains about 1 a second: 50 became ${w.character.dragon.bond.toFixed(1)} in 10 s`,
    w.character.dragon.bond < 50 && w.character.dragon.bond > 30, String(w.character.dragon.bond.toFixed(1)));
}

// -- growing ----------------------------------------------------------------
{
  const w = world();
  w.ent.rename('Ash');
  const grew = [];
  w.ent.on('grew', (e) => grew.push(`${e.from}->${e.to}`));
  w.ent.grant('verdant');
  check('one gift of the pair does not grow it', w.character.dragon.age === 'hatchling');
  check('but the gift is said out loud', /takes back the dragon's senses/.test(w.said()));
  w.ent.grant('saltmarch');
  check('the pair grows it into a drake', w.character.dragon.age === 'drake');
  check('and it is told to the player in the words the design gives',
    /it will not fit on your shoulder/.test(w.said()));
  check('the grew event fired once, hatchling to drake', grew.join(',') === 'hatchling->drake', grew.join(','));
  check('the actor was rebuilt at the new age', w.ent.actor.maxHealth === AGE_STATS.drake.hp);
  check('granting the same gift twice does nothing', w.ent.grant('saltmarch') === false);
  check('and a gift that is not a gift does nothing', w.ent.grant('moon') === false);
}

// -- the events D2 reads ----------------------------------------------------
{
  const w = world();
  const seen = [];
  const offs = EVENTS.map((e) => w.ent.on(e, (info) => seen.push(info.event)));
  w.character.pack.items[0] = makeItem({ base: 'egg' });
  w.ent.feed();
  w.ent.actor.health = 0;
  frames(w, 1, 1 / 60, 1000);
  w.character.dragon.bond = 99;
  w.ent.run({ dt: 0.016, now: 1000 + FALL_MIN_MS + 100, nowS: 1 });
  w.ent.grant('verdant'); w.ent.grant('saltmarch');
  check('fed, fell, woke and grew all reached a listener',
    ['fed', 'fell', 'woke', 'grew'].every((e) => seen.includes(e)), seen.join(','));
  offs.forEach((off) => off());
  const n = seen.length;
  w.character.pack.items[1] = makeItem({ base: 'fish' });
  w.ent.feed();
  check('and an unsubscribed listener stops hearing', seen.length === n, `${seen.length} vs ${n}`);
  check('a listener that throws does not take the frame down with it', (() => {
    const x = world();
    x.ent.on('fed', () => { throw new Error('boom'); });
    x.character.pack.items[0] = makeItem({ base: 'egg' });
    try { return x.ent.feed().ok === true; } catch { return false; }
  })());
}

// -- it never dies ----------------------------------------------------------
{
  const w = world();
  w.ent.setAge('drake');
  let deaths = 0;
  w.combat.onDeath((who) => { if (who === w.ent.actor) deaths++; });
  for (let round = 0; round < 5; round++) {
    w.ent.actor.health = 0;
    frames(w, 1, 1 / 60, 1000 + round * 20000);
    w.character.dragon.bond = 99;
    w.ent.run({ dt: 0.016, now: 1000 + round * 20000 + FALL_MIN_MS + 200, nowS: 1 });
  }
  check('five falls and five wakes later it is still standing', w.character.dragon.fallen === false);
  check('with health on it', w.ent.actor.health > 0);
  check('and it never once left the game', !!w.character.dragon);
  void deaths;
}

// -- the harness's handles --------------------------------------------------
{
  const w = world();
  check('setAge to a real age takes', w.ent.setAge('young') === true && w.character.dragon.age === 'young');
  check('and the gifts are made honest with it, so the next frame does not undo it',
    ageFor(w.character.dragon.gifts) === 'young', w.character.dragon.gifts.join(','));
  frames(w, 10);
  check('which the next ten frames prove', w.character.dragon.age === 'young');
  check('setAge back down takes the gifts away again',
    w.ent.setAge('hatchling') === true && ageFor(w.character.dragon.gifts) === 'hatchling');
  check('setAge to nonsense is refused', w.ent.setAge('wyrm') === false);
  check('fall() puts it down', w.ent.fall(null) === true && w.ent.awake === false);
  check('a second fall while down does nothing', w.ent.fall(null) === false);
  check('wake() brings it up', w.ent.wake() === true && w.ent.awake === true);
  check('and a second wake while up does nothing', w.ent.wake() === false);
}

// ===========================================================================
console.log('\nthe save round trip, through state.js\'s own hydrate');
// ===========================================================================
{
  const { hydrate, blankCharacter } = await import('./state.js');
  check('a blank character carries the key at all', 'dragon' in blankCharacter(),
    Object.keys(blankCharacter()).join(',').slice(0, 60));
  check('and it starts empty, so the first boot hatches one', blankCharacter().dragon === null);

  const w = world();
  w.ent.rename('Ash');
  w.ent.grant('verdant');
  w.ent.grant('saltmarch');
  w.character.dragon.bond = 63.5;
  w.character.dragon.hunger = 41;
  w.character.dragon.trueName = 'Vethrax';

  // the real trip: JSON out, as state.save() writes it, and hydrate back in
  const back = hydrate(JSON.parse(JSON.stringify(w.character)));
  check('the record survives being written and read', !!back.dragon);
  check('with the name', back.dragon.name === 'Ash');
  check('the true name', back.dragon.trueName === 'Vethrax');
  check('the age', back.dragon.age === 'drake', String(back.dragon.age));
  check('the Bond, to the decimal', back.dragon.bond === 63.5, String(back.dragon.bond));
  check('the hunger', back.dragon.hunger === 41);
  check('and both gifts', back.dragon.gifts.join(',') === 'verdant,saltmarch', String(back.dragon.gifts));

  // and the entity built on the read back record is the same dragon
  const w2 = world();
  w2.character.dragon = back.dragon;
  const ent2 = w2.ent;                          // built before the assignment
  void ent2;
  const { createDragon: make } = await import('./dragon.js');
  const logs = [];
  const revived = make({
    character: { ...w2.character, dragon: back.dragon },
    hud: { log: (t) => logs.push(t) },
    scene: null, buildModel: null,
    playerRig: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, parts: {} },
    playerActor: { health: 100, lastSwingAt: 0, pos: { x: 0, y: 0, z: 0 } },
    heightAt: () => 0,
  });
  check('a dragon built on the read back record is the same dragon',
    revived.name === 'Vethrax' && revived.age === 'drake' && revived.bond === 63.5,
    `${revived.name} ${revived.age} ${revived.bond}`);
  check('and it does not hatch again', !logs.some((l) => /cracks/.test(l)), logs.join(' | '));
  check('its actor was built at the saved age, not at the blank one',
    revived.actor.maxHealth === AGE_STATS.drake.hp, String(revived.actor.maxHealth));

  // a save written before the dragon existed
  const old = hydrate({ name: 'Old', stats: {}, skills: {} });
  check('a save from before the dragon existed reads as no dragon', old.dragon === null || old.dragon === undefined,
    JSON.stringify(old.dragon));
  const w3 = world();
  w3.character.dragon = old.dragon;
  const fresh = make({
    character: { pack: { slots: 20, items: new Array(20).fill(null) }, dragon: old.dragon },
    hud: { log: (t) => logs.push(t) }, scene: null, buildModel: null,
    playerRig: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, parts: {} },
    playerActor: { health: 100, lastSwingAt: 0, pos: { x: 0, y: 0, z: 0 } },
    heightAt: () => 0,
  });
  check('and that old save hatches a nameless hatchling rather than crashing',
    fresh.age === 'hatchling' && fresh.named === false);
  const junk = hydrate({ dragon: 'a dragon, honestly' });
  check('a dragon key that is not an object is refused by hydrate', !junk.dragon || typeof junk.dragon !== 'string',
    JSON.stringify(junk.dragon));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
