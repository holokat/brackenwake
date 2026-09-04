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
} from './foraging.js';
import { createForageField, FORAGE_BY_ID, REGROW_MS } from '../world/forage.js';
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

const rec = (id, x = 0, z = 0) => ({ id, x, y: 0, z, yaw: 0, scale: 1, chunk: '0,0', harvestedUntil: 0 });

// ================================================================ the yield
console.log('foraging: how much a patch gives, by skill');
{
  const rows = [0, 20, 39, 40, 60, 79, 80, 100].map((s) => [s, yieldFor(s)]);
  console.log(`     ${rows.map(([s, n]) => `${s}:${n}`).join('  ')}`);
  check('a beginner gets one', yieldFor(0) === 1 && yieldFor(39) === 1);
  check('forty gets two', yieldFor(40) === 2 && yieldFor(79) === 2);
  check('eighty gets three', yieldFor(80) === 3 && yieldFor(100) === 3);
  check('and it never goes past three', Math.max(...rows.map((r) => r[1])) === 3);
  check('a broken skill value is still one', yieldFor(undefined) === 1 && yieldFor(NaN) === 1);
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
  check('one chanterelle at skill 0', r.ok && r.count === 1, r.text);
  check('the stack is the right base and count', h.packed[0].base === 'chanterelle' && h.packed[0].count === 1);
  check('and it said so', /chanterelle/i.test(r.text) && /pack/.test(r.text), r.text);
  check('with a pickup cue', h.cues.includes('pickup'), h.cues.join(','));

  const g = harness({ skill: 85 });
  const r2 = g.foraging.harvest(rec('blueberry'));
  check('three blueberries at skill 85', r2.ok && r2.count === 3, r2.text);
  check('and the line counts three, spelled right', /3 blueberries/i.test(r2.text), r2.text);
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
  h.foraging.harvest(rec('morel'));
  check('the skill taught is Foraging', h.taught.every((t) => t.skill === 'foraging'), FORAGE_SKILL);
  check('a dandelion is difficulty 3', h.taught[0].difficulty === FORAGE_BY_ID.dandelion.difficulty, `${h.taught[0].difficulty}`);
  check('a morel is 35', h.taught[1].difficulty === 35, `${h.taught[1].difficulty}`);
  check('and both are counted as successes', h.taught.every((t) => t.success === true));
}

console.log('\nforaging: the hover line names the thing and its tag');
{
  const h = harness();
  check('an edible in reach', h.foraging.hoverText(rec('chanterelle')) === 'Chanterelle, click to pick', h.foraging.hoverText(rec('chanterelle')));
  check('a toxic in reach says poison', /poison/.test(h.foraging.hoverText(rec('fly_agaric'))), h.foraging.hoverText(rec('fly_agaric')));
  check('a caution says cook it first', /cook it first/.test(h.foraging.hoverText(rec('nettle'))), h.foraging.hoverText(rec('nettle')));
  check('out of reach says so', /too far/.test(h.foraging.hoverText(rec('morel', 0, 40))), h.foraging.hoverText(rec('morel', 0, 40)));
  const picked = rec('morel'); picked.harvestedUntil = 1;
  check('and a picked one says picked over', /picked over/.test(h.foraging.hoverText(picked)));
  check('nothing under the cursor is an empty line', h.foraging.hoverText(null) === '');
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

  const target = ff.records().find((r) => r.id === 'chanterelle');
  const h = harness({ field: ff, at: { x: target.x, y: 0, z: target.z }, skill: 50 });
  const before = ff.count;
  const r = h.foraging.harvest(target, 0);
  check('the pick works through the real field', r.ok && r.count === 2, r.text);
  check('the record left the world', ff.count === before - 1, `${ff.count} of ${before}`);
  check('the mesh it was drawn in was rebuilt', ff.stats.harvested === 1);
  check('picking the same record again is refused', !h.foraging.harvest(target, 1).ok);
  check('and the pack holds two chanterelles', h.packed[0].base === 'chanterelle' && h.packed[0].count === 2);

  check('a minute later it is still gone', ff.regrow(60_000) === 0 && ff.count === before - 1);
  check('after the regrowth time it is back', ff.regrow(REGROW_MS) === 1 && ff.count === before, `${ff.count}`);
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
  check('chestnuts are already plural', amountText('nut', 2) === '2 chestnuts', amountText('nut', 2));
  check('cacao pods too', amountText('cacao', 2) === '2 cacao pods', amountText('cacao', 2));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
