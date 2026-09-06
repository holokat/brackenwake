// Picking and eating. Run: node src/game/foraging.test.mjs
//
// Every gate is driven both ways: 2.4 m and 2.6 m, an empty pack and a full
// one, a fresh patch and a picked one, a chanterelle and a fly agaric, a cure
// with poison in you and a cure without. The heal, the poison and the buff are
// measured off the actor after the call, not off the fact that a function with
// the right name was invoked.

import * as THREE from 'three';
import {
  createForaging, effectFromBuff, yieldFor, HARVEST_REACH, FORAGE_SKILL, amountText, TAG_LINE,
  YIELD_FLOOR, patchText, numberWord,
} from './foraging.js';
import { createForageField, FORAGE_BY_ID, FORAGE, REGROW_MS, placeForage, clusterCapFor,
  TREE_CLUSTER_MAX, GROUND_CLUSTER_MAX } from '../world/forage.js';
import { BASES, makeItem, FORAGE_BASES, FORAGE_PRODUCT_BASES } from '../mmo/items.js';
import { FORAGE_RECIPES } from '../mmo/recipes.js';
import { playerActor, recompute } from './actor.js';
import { poisonTick } from '../mmo/combat_rules.js';
import { blankCharacter } from './state.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ------------------------------------------------------------------- fakes
function harness(o = {}) {
  const said = [];
  const cues = [];
  const taught = [];
  const character = blankCharacter();
  character.skills[FORAGE_SKILL] = o.skill ?? 0;
  const actor = playerActor(character, { pos: o.at || { x: 0, y: 0, z: 0 } });
  actor.health = o.health != null ? o.health : actor.maxHealth;
  actor.mana = o.mana != null ? o.mana : actor.maxMana;
  actor.stamina = o.stamina != null ? o.stamina : actor.maxStamina;

  const slots = o.slots ?? 20;
  const packed = [];
  const inventory = {
    add(item) {
      if (packed.length >= slots) return { added: 0, dropped: item.count ?? 1, ok: false };
      packed.push(item);
      return { added: item.count ?? 1, dropped: 0, ok: true, index: packed.length - 1 };
    },
    remove(where, n) {
      const i = where && where.pack;
      const it = packed[i];
      if (!it) return { ok: false, removed: 0 };
      it.count = (it.count ?? 1) - n;
      if (it.count <= 0) packed[i] = null;
      return { ok: true, removed: n };
    },
  };
  if (o.fillPack) for (let i = 0; i < slots; i++) packed.push(makeItem({ base: 'longsword', seed: i }));

  const progression = { lesson: (s, d, ok) => { taught.push({ skill: s, difficulty: d, success: ok }); return { gained: false }; } };
  const applied = [];
  const combat = o.combat === false ? null : {
    applyStatus(a, id, spec, now) {
      const tick = poisonTick(spec.level);
      a.status = a.status || {};
      a.status[id] = { level: spec.level, perSecond: tick.perSecond, until: now + tick.seconds * 1000, nextTick: now + 1000 };
      applied.push({ id, level: spec.level, now });
      return a.status[id];
    },
    clearStatus(a, id) { if (a.status?.[id]) { delete a.status[id]; applied.push({ id, cleared: true }); return true; } return false; },
  };

  const rolls = o.rolls ? [...o.rolls] : null;
  const rng = () => (rolls && rolls.length ? rolls.shift() : (o.roll ?? 0.5));

  const foraging = createForaging({
    field: o.field || null, inventory, progression, character, actor, combat, recompute, rng,
    now: () => o.now ?? 1000,
    hud: { log: (t, k) => said.push([t, k]) },
    audio: { play: (c) => cues.push(c) },
  });
  return { foraging, actor, character, said, cues, taught, packed, applied, inventory };
}

/** One pickable of one plant, standing at (x, z). A trunk dweller's shape. */
const rec = (id, x = 0, z = 0) => ({
  id, x, y: 0, z, count: 1, onTrunk: false, chunk: '0,0', harvestedUntil: 0,
  members: [{ x, y: 0, z, yaw: 0, scale: 1 }],
});

/**
 * A BUNCH: one pickable of `n` plants. The plants sit on the cluster centre
 * here, because the scatter is `forage.js`'s business and it is measured there;
 * what this file measures is what a bunch is worth and what it says. The one
 * test that needs a real spread builds its own.
 */
const patch = (id, n, x = 0, z = 0) => ({
  id, x, y: 0, z, count: n, onTrunk: false, chunk: '0,0', harvestedUntil: 0,
  members: Array.from({ length: n }, () => ({ x, y: 0, z, yaw: 0, scale: 1 })),
});

// ================================================================ the yield
console.log('foraging: how much of a bunch you get, by skill');
{
  const skills = [0, 20, 40, 60, 80, 100];
  console.log(`     plants  ${skills.map((s) => `sk${String(s).padStart(3)}`).join(' ')}`);
  for (const n of [1, 2, 3, 5, 7, 9, 12, 16]) {
    console.log(`     ${String(n).padStart(6)}  ${skills.map((s) => String(yieldFor(s, n)).padStart(5)).join(' ')}`);
  }
  const sizes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16];
  check('a MASTER gets the whole patch, every size of it',
    sizes.every((n) => yieldFor(100, n) === n), sizes.map((n) => `${n}:${yieldFor(100, n)}`).join(' '));
  check(`a BEGINNER gets at least ${Math.round(YIELD_FLOOR * 100)}% of it, every size of it`,
    sizes.every((n) => yieldFor(0, n) >= n * YIELD_FLOOR),
    sizes.map((n) => `${n}:${yieldFor(0, n)}(${Math.round(yieldFor(0, n) / n * 100)}%)`).join(' '));
  check('and never more than there were plants',
    sizes.every((n) => [0, 25, 50, 75, 100].every((s) => yieldFor(s, n) <= n)));
  check('and never fewer than one', sizes.every((n) => [0, 50, 100].every((s) => yieldFor(s, n) >= 1)));
  check('the ladder only ever goes up with skill',
    sizes.every((n) => { let last = 0; for (let s = 0; s <= 100; s += 5) { const v = yieldFor(s, n); if (v < last) return false; last = v; } return true; }));
  check('a single plant is one at every skill, so a hive is a hive',
    [0, 50, 100].every((s) => yieldFor(s, 1) === 1));
  check('a skill above the cap does not overflow the patch', yieldFor(400, 7) === 7, `${yieldFor(400, 7)}`);
  check('a broken skill value falls to the floor, not to nothing',
    yieldFor(undefined, 7) === yieldFor(0, 7) && yieldFor(NaN, 5) === yieldFor(0, 5), `${yieldFor(NaN, 5)}`);
  check('and no plant count at all is one', yieldFor(50) === 1 && yieldFor(50, NaN) === 1);
  // The caps in forage.js are only worth what the yield hands over, so the two
  // sizes that cap actually produces are driven here rather than reasoned about.
  // A bunch at a tree holds two, so ceil(2 * 0.6) = 2, and a beginner gets both.
  check(`a bunch of ${TREE_CLUSTER_MAX} gives ${TREE_CLUSTER_MAX} at skill 0, so "two of each max" really is two`,
    yieldFor(0, 2) === 2, `${yieldFor(0, 2)}`);
  check('a lone plant gives one at skill 0, and a lone plant is what a hive is',
    yieldFor(0, 1) === 1, `${yieldFor(0, 1)}`);
  check(`the biggest patch on open ground, ${GROUND_CLUSTER_MAX} plants, gives 2 at skill 0 and 3 at the cap`,
    yieldFor(0, 3) === 2 && yieldFor(100, 3) === 3, `${yieldFor(0, 3)} then ${yieldFor(100, 3)}`);
}

// ============================================ what the change did to the numbers
//
// The user's report: "when I see a bunch of dandelions I should be picking up
// the entire bunch, not a single dandelion object ... otherwise people gain
// skills much too fast". These are the two numbers that report is about, before
// and after, measured rather than argued.
console.log('\nforaging: lessons and items per meadow chunk, before and after');
{
  // Measured on the shipped table at the commit before this one: a 64 m meadow
  // chunk grew this many PLANTS, and every plant was its own pickable, its own
  // stack and its own Foraging lesson.
  const WAS = { Spring: 267, Summer: 282, Autumn: 139 };
  const T = [];
  for (let i = 0; i < 30; i++) T.push({ x: (i * 7) % 64, z: (i * 13) % 64, radius: 0.4 });
  console.log('     season   lessons was   lessons now   items/pick was   items/pick now (sk 0 / sk 100)');
  let wasAll = 0, nowAll = 0;
  for (const s of ['Spring', 'Summer', 'Autumn']) {
    const recs = placeForage({ biome: 'meadow', moist: 0.3 }, 0, 0, T, s, 1, { heightAt: () => 0 });
    const plants = recs.reduce((n, r) => n + r.count, 0);
    const lo = recs.reduce((n, r) => n + yieldFor(0, r.count), 0) / recs.length;
    const hi = recs.reduce((n, r) => n + yieldFor(100, r.count), 0) / recs.length;
    wasAll += WAS[s]; nowAll += recs.length;
    console.log(`     ${s.padEnd(8)} ${String(WAS[s]).padStart(11)} ${String(recs.length).padStart(13)} `
      + `${'1 to 3'.padStart(16)}   ${lo.toFixed(1)} / ${hi.toFixed(1)}   (${plants} plants in ${recs.length} patches)`);
  }
  console.log(`     over the three growing seasons a meadow chunk gave ${wasAll} Foraging lessons and now gives ${nowAll}, `
    + `which is ${(wasAll / nowAll).toFixed(1)} times fewer`);
  check('a meadow chunk teaches at least four times fewer lessons than it did',
    wasAll / nowAll >= 4, `${wasAll} to ${nowAll}, ${(wasAll / nowAll).toFixed(1)}x`);
  check('and a single pick is worth more than one item now',
    (() => {
      const recs = placeForage({ biome: 'meadow', moist: 0.3 }, 0, 0, T, 'Summer', 1, { heightAt: () => 0 });
      return recs.reduce((n, r) => n + yieldFor(0, r.count), 0) / recs.length > 1.5;
    })());
}

// =============================================================== harvesting
console.log('\nforaging: reach, both sides of it');
{
  const near = harness({ at: { x: 0, y: 0, z: 0 } });
  const a = near.foraging.harvest(rec('chanterelle', 0, HARVEST_REACH - 0.1));
  check('2.4 m picks', a.ok && a.count === 1, a.text);
  const far = harness({ at: { x: 0, y: 0, z: 0 } });
  const b = far.foraging.harvest(rec('chanterelle', 0, HARVEST_REACH + 0.1));
  check('2.6 m does not', !b.ok && b.reason === 'too_far', b.text);
  check('and it says how far off it is', /m off/.test(b.text), b.text);
  check('nothing was picked up', far.packed.length === 0);
}

console.log('\nforaging: what a pick puts in the pack, and what it says');
{
  const h = harness({ skill: 0 });
  const r = h.foraging.harvest(rec('chanterelle'));
  check('a lone chanterelle is one chanterelle', r.ok && r.count === 1, r.text);
  check('the stack is the right base and count', h.packed[0].base === 'chanterelle' && h.packed[0].count === 1);
  check('and it said so', /chanterelle/i.test(r.text) && /pack/.test(r.text), r.text);
  check('with a pickup cue', h.cues.includes('pickup'), h.cues.join(','));

  // THE BUNCH. One click, one stack, one line. Three is the biggest a patch on
  // open ground grows to, so three is what is driven here.
  const g = harness({ skill: 100 });
  const r2 = g.foraging.harvest(patch('dandelion', GROUND_CLUSTER_MAX));
  check('a master picking a patch of three dandelions gets all three', r2.ok && r2.count === 3, r2.text);
  check('and it is ONE stack in the pack, not three',
    g.packed.length === 1 && g.packed[0].base === 'dandelion' && g.packed[0].count === 3,
    `${g.packed.length} stacks`);
  check('and ONE line, which names the patch and counts it',
    r2.text === 'You pick the whole patch: 3 dandelions.' && g.said.length === 1, `${g.said.length} lines: ${r2.text}`);

  const b2 = harness({ skill: 0 });
  const r3 = b2.foraging.harvest(patch('dandelion', GROUND_CLUSTER_MAX));
  check('a beginner on the same patch gets two of the three', r3.ok && r3.count === 2, r3.text);
  check('which is over the sixty per cent floor', r3.count / 3 >= YIELD_FLOOR, `${Math.round(r3.count / 3 * 100)}%`);
  check('and the line counts what really went in, not what stood there',
    r3.text === 'You pick the whole patch: 2 dandelions.', r3.text);
  check('the record carries the plant count back to the caller', r3.plants === 3, `${r3.plants}`);
  const t2 = harness({ skill: 0 });
  const r5 = t2.foraging.harvest(patch('chanterelle', TREE_CLUSTER_MAX));
  check('and a beginner at a tree gets BOTH chanterelles, which is the cap being honest',
    r5.ok && r5.count === 2 && r5.text === 'You pick the whole patch: 2 chanterelles.', r5.text);

  const one = harness({ skill: 100 });
  const r4 = one.foraging.harvest(rec('honey'));
  check('a hive is one pickable and keeps the old line', r4.ok && r4.count === 1
    && r4.text === 'A wild honey in the pack.', r4.text);
}

console.log('\nforaging: ONE lesson per patch, however many plants are in it');
{
  const h = harness({ skill: 0 });
  h.foraging.harvest(patch('dandelion', GROUND_CLUSTER_MAX));
  check('picking three dandelions in one bunch teaches exactly once', h.taught.length === 1, `${h.taught.length} lessons`);
  check('at the dandelion\'s own difficulty', h.taught[0].difficulty === FORAGE_BY_ID.dandelion.difficulty, `${h.taught[0].difficulty}`);
  check('and stats counts one, not three', h.foraging.stats.taught === 1, `${h.foraging.stats.taught}`);
  check('and the beginner\'s two of the three went in as ONE stack',
    h.packed.length === 1 && h.packed[0].count === yieldFor(0, GROUND_CLUSTER_MAX), `${h.packed.length} stacks of ${h.packed[0]?.count}`);
  // the other direction: three separate pickables really do teach three times
  const g = harness({ skill: 0 });
  for (let i = 0; i < 3; i++) g.foraging.harvest(rec('dandelion', i * 0.1, 0));
  check('whereas three SEPARATE pickables teach three times, which is what this fixed',
    g.taught.length === 3, `${g.taught.length} lessons for the same three plants`);
}

console.log('\nforaging: a toxic pickup says what it is, and a caution says why');
{
  const h = harness();
  const r = h.foraging.harvest(rec('fly_agaric'));
  check('a fly agaric goes in the pack', r.ok && r.id === 'fly_agaric');
  check('AND the line warns it is poison', /poison/i.test(r.text) && /raw/i.test(r.text), r.text);
  check('the warning is the tag line, not a one-off string', r.text.includes(TAG_LINE.toxic));

  const n = harness();
  const r2 = n.foraging.harvest(rec('nettle'));
  check('a nettle warns you to cook it', /cook/i.test(r2.text), r2.text);

  const e = harness();
  const r3 = e.foraging.harvest(rec('chanterelle'));
  check('and an edible says nothing extra', !/poison|cook/i.test(r3.text), r3.text);
}

console.log('\nforaging: a full pack refuses, and leaves the patch standing');
{
  const h = harness({ fillPack: true });
  const r = h.foraging.harvest(rec('porcini'));
  check('the pick is refused', !r.ok && r.reason === 'pack_full', r.text);
  check('and it says the porcini stays where it is', /stays where it is/.test(r.text), r.text);
  check('with a refusal cue, not a reward one', h.cues.includes('denied') && !h.cues.includes('pickup'), h.cues.join(','));
  check('no lesson was taught for a pick that did not happen', h.taught.length === 0);
}

console.log('\nforaging: a picked patch is picked, and says how long');
{
  const h = harness();
  const p = rec('rosehip');
  p.harvestedUntil = 1000 + REGROW_MS;
  const r = h.foraging.harvest(p, 1000);
  check('a picked record refuses', !r.ok && r.reason === 'picked', r.text);
  check('and says roughly eighteen minutes', /18 minutes/.test(r.text), r.text);
  check('nothing at all refuses too', !h.foraging.harvest(null).ok);
  check('and an id nothing grows refuses by name', /nonesuch/.test(h.foraging.harvest(rec('nonesuch')).text));
}

console.log('\nforaging: every pick is a Foraging lesson at the thing\'s own difficulty');
{
  const h = harness();
  h.foraging.harvest(rec('dandelion'));
  h.foraging.harvest(rec('morel', 0.5, 0));
  check('the skill taught is Foraging', h.taught.every((t) => t.skill === 'foraging'), FORAGE_SKILL);
  check('a dandelion is difficulty 3', h.taught[0].difficulty === FORAGE_BY_ID.dandelion.difficulty, `${h.taught[0].difficulty}`);
  check('a morel is 35', h.taught[1].difficulty === 35, `${h.taught[1].difficulty}`);
  check('and both are counted as successes', h.taught.every((t) => t.success === true));
}

console.log('\nforaging: the hover line names the bunch, and says how big it is');
{
  const h = harness();
  const hov = (r) => h.foraging.hoverText(r);
  check('a lone thing keeps its own name', hov(rec('chanterelle')) === 'Chanterelle, click to pick', hov(rec('chanterelle')));
  // The sizes driven here are the sizes the world can really grow: three on
  // open ground, two at a tree, one for a hive. A hover line for a patch of
  // eleven would be a line no player will ever be shown.
  check('A PATCH is named as a patch, and counted in words',
    hov(patch('dandelion', 3)) === 'A patch of dandelions, three of them, click to pick', hov(patch('dandelion', 3)));
  check('a toxic patch still says poison',
    hov(patch('fly_agaric', 2)) === 'A patch of fly agarics, two of them, poison, click to pick', hov(patch('fly_agaric', 2)));
  check('a caution patch still says cook it first',
    hov(patch('nettle', 3)) === 'A patch of nettles, three of them, cook it first, click to pick', hov(patch('nettle', 3)));
  check('a mass noun does not get an -s it cannot carry',
    hov(patch('wild_garlic', 2)) === 'A patch of wild garlic, two of them, click to pick', hov(patch('wild_garlic', 2)));
  check('a bunch of two is still a patch', /A patch of morels, two of them/.test(hov(patch('morel', 2))), hov(patch('morel', 2)));
  check('and a bunch of one is not', hov(patch('morel', 1)) === 'Morel, click to pick', hov(patch('morel', 1)));
  check('out of reach says so, and still names the patch',
    hov(patch('dandelion', 3, 0, 40)) === 'A patch of dandelions, three of them, too far', hov(patch('dandelion', 3, 0, 40)));
  const picked = patch('dandelion', 3); picked.harvestedUntil = 1;
  check('and a picked one says picked over', hov(picked) === 'A patch of dandelions, three of them, picked over', hov(picked));
  check('nothing under the cursor is an empty line', h.foraging.hoverText(null) === '');
  check('past twenty the digits read better than the words', numberWord(21) === '21' && numberWord(20) === 'twenty');
  // Every forageable, named at every size it can really grow to, with nothing
  // that reads wrong. The size comes from the kind's own cap, so a twenty third
  // forageable is driven at its own sizes and not at a number written here.
  const bad = [];
  let lines = 0;
  for (const f of FORAGE) {
    for (let n = 2; n <= clusterCapFor(f.place); n++) {
      const t = patchText(f.id, n);
      lines++;
      if (!/^A patch of [a-z]/.test(t)) bad.push(`${f.id}: ${t}`);
      if (/ss$|ys$/.test(t)) bad.push(`${f.id}: ${t}`);
      if (!new RegExp(`, ${numberWord(n)} of them$`).test(t)) bad.push(`${f.id}: ${t} does not count itself`);
    }
    if (patchText(f.id, 1) !== f.name) bad.push(`${f.id}: a lone one is called "${patchText(f.id, 1)}"`);
  }
  check(`all ${FORAGE.length} of them read as a patch at every size they grow to, ${lines} lines`,
    bad.length === 0, bad.join(' | '));
  console.log(`     ${FORAGE.slice(0, 4).map((f) => patchText(f.id, clusterCapFor(f.place))).join(' | ')}`);
  console.log(`     ${FORAGE.slice(14, 18).map((f) => patchText(f.id, clusterCapFor(f.place))).join(' | ')}`);
}

console.log('\nforaging: the reach is to the nearest plant in the bunch, not to its middle');
{
  // a patch whose centre is 3.2 m off, with one plant 2.2 m off. Standing on
  // the near edge of a patch is standing on the patch.
  const spread = {
    id: 'wild_garlic', x: 0, y: 0, z: 3.2, count: 3, onTrunk: false, chunk: '0,0', harvestedUntil: 0,
    members: [{ x: 0, y: 0, z: 2.2, yaw: 0, scale: 1 }, { x: 0, y: 0, z: 3.2, yaw: 0, scale: 1 }, { x: 0, y: 0, z: 4.2, yaw: 0, scale: 1 }],
  };
  const h = harness({ at: { x: 0, y: 0, z: 0 } });
  const r = h.foraging.harvest(spread);
  check('the centre is 3.2 m off, past the reach', 3.2 > HARVEST_REACH);
  check('and the pick lands anyway, because a plant is 2.2 m off', r.ok && Math.abs(r.dist - 2.2) < 1e-9, `${r.dist?.toFixed(2)} m`);
  // the other direction: every plant out of reach refuses, and names the patch
  const away = {
    id: 'wild_garlic', x: 0, y: 0, z: 6, count: 3, onTrunk: false, chunk: '0,0', harvestedUntil: 0,
    members: [{ x: 0, y: 0, z: 5.4, yaw: 0, scale: 1 }, { x: 0, y: 0, z: 6, yaw: 0, scale: 1 }, { x: 0, y: 0, z: 6.6, yaw: 0, scale: 1 }],
  };
  const g = harness({ at: { x: 0, y: 0, z: 0 } });
  const r2 = g.foraging.harvest(away);
  check('a patch with nothing in reach refuses', !r2.ok && r2.reason === 'too_far', r2.text);
  check('and the refusal calls it a patch, not a plant', /patch of wild garlic/.test(r2.text), r2.text);
  check('nothing went in the pack', g.packed.length === 0);
}

// ================================================================== eating
console.log('\nforaging: a chanterelle heals and a fly agaric poisons');
{
  const h = harness({ health: 40, roll: 0.5 });
  const before = h.actor.health;
  const r = h.foraging.useItem(makeItem({ base: 'chanterelle', count: 2 }), { pack: 0 });
  check('eating one is allowed', r.ok, r.text);
  check('it heals 3 to 8', r.healed >= 3 && r.healed <= 8, `${r.healed}`);
  check('over ten seconds, so it is a regeneration buff, not a jump', h.actor.health === before, `${h.actor.health}`);
  const buff = h.actor.buffs.find((b) => b.id === 'forage:heal');
  check('and the buff is really on the actor', !!buff, JSON.stringify(buff?.effect));
  check('the rate is the heal spread over the ten seconds', Math.abs(buff.effect.regen.healthRegen - r.healed / 10) < 1e-9, `${buff.effect.regen.healthRegen}/s`);
  check('recompute folded it into the actor', h.actor.healthRegen > 0, `${h.actor.healthRegen}/s`);
  check('and the line says it out loud', /health over 10 seconds/.test(r.text), r.text);

  const p = harness({ roll: 0.5 });
  const r2 = p.foraging.useItem(makeItem({ base: 'fly_agaric' }), { pack: 0 }, { now: 5000 });
  check('eating a fly agaric works', r2.ok, r2.text);
  check('and poisons you at level 1', p.actor.status.poison?.level === 1, JSON.stringify(p.actor.status.poison));
  check('through combat.applyStatus, which is what ticks it', r2.poisonVia === 'combat' && p.applied[0].id === 'poison');
  const tick = poisonTick(1);
  check('the poison is the real rule, six seconds at two a second',
    p.actor.status.poison.perSecond === tick.perSecond && p.actor.status.poison.until === 5000 + tick.seconds * 1000,
    `${tick.perSecond}/s for ${tick.seconds}s`);
  check('and it is said as bad news', /poison/i.test(r2.text) && p.said.at(-1)[1] === 'bad', r2.text);

  // and without a combat runtime, the entry is still made AND counted as unwired
  const q = harness({ combat: false });
  const r3 = q.foraging.useItem(makeItem({ base: 'fly_agaric' }), { pack: 0 }, { now: 0 });
  check('with no combat runtime the entry is still written', !!q.actor.status.poison && r3.poisonVia === 'none');
  check('and the missing wire is counted, not hidden', q.foraging.stats.unticked === 1, `${q.foraging.stats.unticked}`);
}

console.log('\nforaging: a caution is not food, and says why');
{
  const h = harness();
  const r = h.foraging.useItem(makeItem({ base: 'nettle', count: 3 }), { pack: 0 });
  check('eating a raw nettle does nothing', !r.ok && r.reason === 'nothing', r.text);
  check('and it explains itself', /cook/i.test(r.text), r.text);
  check('nothing was spent and no buff was pushed', r.spent === undefined && h.actor.buffs.length === 0);
}

console.log('\nforaging: a meal grants the buff its recipe card promises');
{
  const h = harness();
  const r = h.foraging.useItem(makeItem({ base: 'mushroom_stew' }), { pack: 0 }, { now: 2000 });
  check('the stew is eaten', r.ok, r.text);
  const buff = h.actor.buffs.find((b) => b.id === 'forage:mushroom_stew');
  check('the buff is on the actor', !!buff, JSON.stringify(buff));
  check('for five minutes', buff.until === 2000 + 300_000, `${buff.until - 2000} ms`);
  check('it is named, so the HUD can draw it', buff.name === 'Mushroom stew' && buff.kind === 'buff');
  check('stamina regeneration really went up', h.actor.staminaRegen > 0, `${h.actor.staminaRegen}/s`);
  check('and the line names it once and says how long', /^Mushroom stew: good for 5 minutes\./.test(r.text), r.text);

  // a second helping refreshes rather than stacks
  h.foraging.useItem(makeItem({ base: 'mushroom_stew' }), { pack: 0 }, { now: 9000 });
  check('a second stew refreshes rather than stacks', h.actor.buffs.filter((b) => b.id === 'forage:mushroom_stew').length === 1);

  const c = harness();
  c.foraging.useItem(makeItem({ base: 'roast_chestnuts' }), { pack: 0 }, { now: 0 });
  check('roast chestnuts really raise cold resistance', c.actor.resists.cold >= 12, `${c.actor.resists.cold}`);
  const n = harness();
  const carryBefore = n.actor.carry;
  n.foraging.useItem(makeItem({ base: 'nut_bread' }), { pack: 0 }, { now: 0 });
  check('nut bread really raises what you can carry', n.actor.carry === carryBefore + 25, `${carryBefore} to ${n.actor.carry}`);
}

console.log('\nforaging: every meal recipe and its food agree about the buff');
{
  const bad = [];
  const meals = FORAGE_RECIPES.filter((r) => r.family === 'forageMeal');
  for (const r of meals) {
    const want = effectFromBuff(r.buff);
    const got = BASES[r.result.base]?.use?.buff?.effect;
    if (JSON.stringify(want) !== JSON.stringify(got)) bad.push(`${r.id}: card ${JSON.stringify(want)} food ${JSON.stringify(got)}`);
  }
  check(`all ${meals.length} meal cards match the food they make`, bad.length === 0, bad.slice(0, 2).join(' | '));
  let threw = '';
  try { effectFromBuff({ swagger: 4 }); } catch (e) { threw = e.message; }
  check('and a buff key nothing reads throws rather than shipping', /nothing reads/.test(threw), threw);
  check('a regen key lands under regen', JSON.stringify(effectFromBuff({ staminaRegen: 2 })) === '{"regen":{"staminaRegen":2}}');
  check('a resist lands under resists', JSON.stringify(effectFromBuff({ cold: 12 })) === '{"resists":{"cold":12}}');
  check('carry lands under bonuses', JSON.stringify(effectFromBuff({ carry: 25 })) === '{"bonuses":{"carry":25}}');
  check('a stat lands under stats', JSON.stringify(effectFromBuff({ dex: 3 })) === '{"stats":{"dex":3}}');
}

console.log('\nforaging: the potions do the four things they say');
{
  const h = harness({ health: 40, roll: 0 });
  const r = h.foraging.useItem(makeItem({ base: 'healing_draught' }), { pack: 0 });
  check('a healing draught heals on the spot', h.actor.health === 65, `40 to ${h.actor.health}`);
  check('and says how much came back', /health back/.test(r.text), r.text);

  const p = harness({ roll: 0 });
  p.foraging.useItem(makeItem({ base: 'fly_agaric' }), { pack: 0 }, { now: 0 });
  check('you are poisoned', !!p.actor.status.poison);
  const cure = p.foraging.useItem(makeItem({ base: 'antidote' }), { pack: 1 }, { now: 100 });
  check('the antidote cures it', cure.ok && !p.actor.status.poison, cure.text);
  check('through combat.clearStatus', p.applied.some((a) => a.cleared));
  const wasted = p.foraging.useItem(makeItem({ base: 'antidote' }), { pack: 1 }, { now: 200 });
  check('and a second antidote with nothing to cure is refused, not wasted',
    !wasted.ok && wasted.reason === 'nothing_to_cure', wasted.text);

  const m = harness({ mana: 10, roll: 0 });
  m.foraging.useItem(makeItem({ base: 'mana_tonic' }), { pack: 0 });
  check('a mana tonic restores mana', m.actor.mana === 40, `10 to ${m.actor.mana}`);
  const s = harness({ stamina: 5, roll: 1 });
  s.foraging.useItem(makeItem({ base: 'dandelion_tonic' }), { pack: 0 });
  check('a dandelion tonic restores stamina, capped at the pool', s.actor.stamina === Math.min(55, s.actor.maxStamina), `5 to ${s.actor.stamina} of ${s.actor.maxStamina}`);

  const v = harness();
  const strBefore = v.actor.stats.str;
  v.foraging.useItem(makeItem({ base: 'draught_of_vigour' }), { pack: 0 }, { now: 0 });
  check('a draught of vigour really adds five STR', v.actor.stats.str === strBefore + 5, `${strBefore} to ${v.actor.stats.str}`);

  const w = harness({ roll: 0 });
  const poison = w.foraging.useItem(makeItem({ base: 'woodland_poison' }), { pack: 0 }, { now: 0 });
  check('woodland poison poisons whoever opens it, at level 2', w.actor.status.poison?.level === 2, poison.text);
}

console.log('\nforaging: using a stack spends exactly one of it');
{
  const h = harness();
  h.inventory.add(makeItem({ base: 'chanterelle', count: 4 }));
  const r = h.foraging.useItem(h.packed[0], { pack: 0 });
  check('one is spent', r.spent === 1, `${r.spent}`);
  check('and three are left', h.packed[0].count === 3, `${h.packed[0]?.count}`);
  const bare = harness();
  const r2 = bare.foraging.useItem(makeItem({ base: 'chanterelle' }));
  check('with no address nothing is spent, and it still works', r2.ok && r2.spent === 0);
  const nothing = harness();
  const r3 = nothing.foraging.useItem(makeItem({ base: 'longsword' }), { pack: 0 });
  check('a longsword is not food, and says so', !r3.ok && r3.reason === 'no_use', r3.text);
}

console.log('\nforaging: the second argument may be an actor instead of an address');
{
  const h = harness({ health: 30, roll: 0 });
  const other = playerActor(blankCharacter(), { pos: { x: 0, y: 0, z: 0 } });
  other.health = 10;
  const r = h.foraging.useItem(makeItem({ base: 'healing_draught' }), other);
  check('the potion lands on the actor that was passed', other.health === 35, `10 to ${other.health}`);
  check('and not on the one the runtime holds', h.actor.health === 30, `${h.actor.health}`);
  check('nothing was spent, because no address was given', r.spent === 0);
}

// ============================================== the whole path, through a field
console.log('\nforaging: the whole path, from a real field to a stack and back again');
{
  const scene = new THREE.Scene();
  const world = { seed: 4, sampleAt: () => ({ biome: 'meadow', moist: 0.3 }), heightAt: () => 0 };
  const trees = [];
  for (let i = 0; i < 20; i++) trees.push({ x: (i * 7) % 64, z: (i * 13) % 64, radius: 0.4 });
  const ff = createForageField(scene, { field: world, season: 'Autumn', treesFor: () => trees });
  ff.update(0, 0, 'Autumn', 0);

  // A chanterelle bunch holds at most TREE_CLUSTER_MAX now, so the target is
  // the biggest one the field really grew rather than a size written here.
  const target = ff.records().filter((r) => r.id === 'chanterelle')
    .sort((a, b) => b.count - a.count)[0];
  const want = yieldFor(100, target.count);
  const h = harness({ field: ff, at: { x: target.x, y: 0, z: target.z }, skill: 100 });
  const before = ff.count;
  const plantsBefore = ff.plants;
  console.log(`     the patch under test is ${target.count} chanterelles`);
  const r = h.foraging.harvest(target, 0);
  check('the pick works through the real field', r.ok && r.count === want, r.text);
  check('a master takes every plant that stood there', r.count === target.count, `${r.count} of ${target.count}`);
  check('the whole patch left the world as ONE pickable', ff.count === before - 1, `${ff.count} of ${before}`);
  check(`and took all ${target.count} of its plants out of the drawing`,
    ff.plants === plantsBefore - target.count, `${ff.plants} of ${plantsBefore}`);
  check('the field counted one harvest, not one per plant', ff.stats.harvested === 1, `${ff.stats.harvested}`);
  check('one Foraging lesson for the whole patch', h.taught.length === 1, `${h.taught.length}`);
  check('picking the same record again is refused', !h.foraging.harvest(target, 1).ok);
  check('and the pack holds one stack of them', h.packed.length === 1
    && h.packed[0].base === 'chanterelle' && h.packed[0].count === target.count, `${h.packed.length} stacks`);
  // and the ray really cannot find it any more, on any of its plants
  check('and no ray onto any plant of it finds it', target.members.every((m) => {
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(m.x, m.y + 6, m.z), new THREE.Vector3(0, -1, 0));
    const hit = ff.pick(ray);
    return !hit || hit.rec !== target;
  }));

  check('a minute later it is still gone', ff.regrow(60_000) === 0 && ff.count === before - 1);
  check('after the regrowth time it is back', ff.regrow(REGROW_MS) === 1 && ff.count === before, `${ff.count}`);
  check('with every one of its plants', ff.plants === plantsBefore, `${ff.plants} of ${plantsBefore}`);
  // a plant can be occluded from above by a taller neighbour of another kind,
  // so the claim is that the patch is findable again, not that all five are
  check('and a ray finds the patch again', target.members.some((m) => {
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(m.x, m.y + 6, m.z), new THREE.Vector3(0, -1, 0));
    return ff.pick(ray)?.rec === target;
  }));
  const again = harness({ field: ff, at: { x: target.x, y: 0, z: target.z }, skill: 50 });
  check('and it can be picked again', again.foraging.harvest(target, REGROW_MS + 1).ok);
  ff.dispose();
}

console.log('\nforaging: every forage and product base can really be used');
{
  const bad = [];
  for (const id of [...FORAGE_BASES, ...FORAGE_PRODUCT_BASES]) {
    const h = harness({ health: 20, mana: 10, stamina: 10, roll: 0.5 });
    // A cure needs something to cure, or it honestly refuses.
    if (BASES[id].use?.cure) h.actor.status = { poison: { level: 1, perSecond: 2, until: 1e9, nextTick: 0 } };
    const r = h.foraging.useItem(makeItem({ base: id }), null, { now: 0 });
    const cautionOk = !r.ok && r.reason === 'nothing' && BASES[id].tag === 'caution';
    if (!r.ok && !cautionOk) bad.push(`${id}: ${r.reason} (${r.text})`);
    if (r.ok && !r.text) bad.push(`${id}: changed something and said nothing`);
  }
  check(`all ${FORAGE_BASES.length + FORAGE_PRODUCT_BASES.length} of them do something and say so`, bad.length === 0, bad.slice(0, 3).join(' | '));
}

console.log('\nforaging: the plural is right');
{
  check('one chanterelle', amountText('chanterelle', 1) === 'a chanterelle', amountText('chanterelle', 1));
  check('three chanterelles', amountText('chanterelle', 3) === '3 chanterelles', amountText('chanterelle', 3));
  check('and three blueberries, not blueberrys', amountText('blueberry', 3) === '3 blueberries', amountText('blueberry', 3));
  check('honey is a mass noun', amountText('honey', 3) === '3 wild honey', amountText('honey', 3));
  check('and wild garlic is one too', amountText('wild_garlic', 4) === '4 wild garlic', amountText('wild_garlic', 4));
  check('chestnuts are already plural', amountText('nut', 2) === '2 chestnuts', amountText('nut', 2));
  check('cacao pods too', amountText('cacao', 2) === '2 cacao pods', amountText('cacao', 2));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
