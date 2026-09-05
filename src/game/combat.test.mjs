// Hitting things that are alive. Run: node src/game/combat.test.mjs
//
// THE FIRST HALF OF THIS SUITE IS GONE, and the reason is F1.
//
// It drove the farmstead's hunting path: `createFauna` built deer out of THREE
// and walked them, and `resolveSwing` in the top half of combat.js swung an axe
// at them through `fauna.hitTest` and `fauna.damage`. The animals of the world
// are tier 0 monster rows now, they are killed by the resolver the rest of this
// file tests, and `runtime.fauna` no longer has a `hitTest`, so `pickTarget`
// refuses with 'no_fauna' and every one of those checks was testing code no
// click can reach. Placement is tested in `src/world/fauna.test.mjs`; a rabbit
// being targetable, killable and skinnable is tested there and in
// `monsters.test.mjs`. docs/mmo/wiring/F1.md section 9 names the dead code that
// should follow these checks out of the tree.
//
// What is left below is the MMO resolver, unchanged.

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ===========================================================================
// The MMO runtime half: createCombat.
//
// Fake actors, on purpose. `actor.js` is agent W1's and is being written at the
// same time as this file, so everything below drives the plain object
// 07-RUNTIME-CONTRACT describes and nothing else. The resolver underneath is
// the real `combat_rules.js`, and the rng is a fixed list, so every number
// printed here is one this code actually produced and not one it was told to.

import {
  createCombat, SWING_LAND_S, IN_COMBAT_MS, BODY_RADIUS, reachBetween, actorDistance, REACH_RISE, spellShape,
} from './combat.js';
import { swingSeconds, poisonTick, fallDamage, hitChance, JUMP_ATTACK_MULT } from '../mmo/combat_rules.js';

/** An rng that returns the numbers you give it, then 0.5 for ever. */
const rolls = (...list) => { let i = 0; return () => (i < list.length ? list[i++] : 0.5); };

function actorOf(over = {}) {
  return {
    id: over.id || 'a', kind: over.kind || 'monster', name: over.name || 'thing',
    pos: { x: 0, y: 0, z: 0 }, yaw: 0,
    stats: { str: 0, dex: 0, int: 0, con: 0, wis: 0 },
    skills: { wrestling: 50, tactics: 0, anatomy: 0, parrying: 0 },
    bonuses: {}, ar: 0, resists: {},
    weapon: { skill: 'wrestling', minDamage: 10, maxDamage: 10, speed: 2, weight: 3, damageType: 'physical', reach: 1.5 },
    shield: null,
    health: 100, maxHealth: 100, mana: 50, maxMana: 50, stamina: 100, maxStamina: 100,
    buffs: [], status: {}, lastSwingAt: -Infinity, casting: null, faction: 'hostile',
    ai: null, anim: 'idle',
    ...over,
  };
}

/** A floaters stand-in that records every number it was asked to show. */
const floatersSpy = () => { const seen = []; return { seen, spawn: (p, text, kind) => seen.push({ text, kind, x: p.x, z: p.z }) }; };
/** A progression stand-in that records every lesson it was handed. */
const progressionSpy = () => {
  const seen = [];
  return { seen, lesson: (who, skill, d, ok) => seen.push({ who, skill, d, ok }), statLesson: (who, stat, d, ok) => seen.push({ who, stat, d, ok }) };
};

// ------------------------------------------------- the clock and the cooldown
{
  const a = actorOf({ id: 'att' }), b = actorOf({ id: 'def' });
  const c = createCombat({ rng: rolls(0) });
  const secs = swingSeconds(a);
  check('a 2.0 s weapon at 0 DEX swings every 2.0 s', secs === 2, `${secs}`);

  const first = c.queueSwing(a, b, { now: 0 });
  check('the first swing is queued', first.queued === true);
  const early = c.queueSwing(a, b, { now: 1999 });
  check('a swing 1 ms early is refused', early.queued === false && early.reason === 'cooldown', `wait ${Math.round(early.wait)} ms`);
  const late = c.queueSwing(a, b, { now: 2000 });
  check('the same swing at 2000 ms is taken', late.queued === true);

  // and the blow lands SWING_LAND_S after the swing starts, not with it
  const d = actorOf({ id: 'd2' });
  const c2 = createCombat({ rng: rolls(0, 0.5) });     // 0 -> a certain hit
  c2.queueSwing(a, d, { now: 10000 });
  c2.update(0, 10000 + SWING_LAND_S * 1000 - 1);
  check('a swing still in the air has taken no health', d.health === 100 && c2.pendingCount === 1);
  c2.update(0, 10000 + SWING_LAND_S * 1000);
  check('and it lands exactly SWING_LAND_S later', d.health < 100 && c2.pendingCount === 0, `health ${d.health}`);
}

// --------------------------------------------------------- twenty real swings
{
  // Twenty swings at 2 s each over 40 s, driven frame by frame at 60 Hz, and
  // counted. This is the rate the player will actually feel.
  const a = actorOf({ id: 'att' }), b = actorOf({ id: 'def', health: 1e6, maxHealth: 1e6 });
  const c = createCombat({ rng: rolls() });
  let landed = 0;
  c.onDeath(() => {});
  let health = b.health;
  for (let f = 0; f < 60 * 40; f++) {
    const now = f * (1000 / 60);
    c.queueSwing(a, b, { now });
    c.update(1 / 60, now);
    if (b.health !== health) { landed++; health = b.health; }
  }
  check('holding the button for 40 s at a 2 s weapon lands 20 blows', landed === 20, `${landed}`);
}

// ----------------------------------------------------------- who sees the red
{
  const f = floatersSpy();
  const monster = actorOf({ id: 'm', kind: 'monster' });
  const player = actorOf({ id: 'p', kind: 'player' });
  const c = createCombat({ floaters: f, rng: rolls(0, 0.5) });
  c.queueSwing(monster, player, { now: 0 });
  c.update(0, 400);
  const n = f.seen[f.seen.length - 1];
  check('a blow on the player is red, not white', n.kind === 'taken', `${n.kind} ${n.text}`);

  const f2 = floatersSpy();
  const c2 = createCombat({ floaters: f2, rng: rolls(0, 0.5) });
  c2.queueSwing(player, monster, { now: 0 });
  c2.update(0, 400);
  check('the same blow the other way is white', f2.seen[f2.seen.length - 1].kind === 'damage');

  // a miss says the word, over the thing that was missed
  const f3 = floatersSpy();
  const c3 = createCombat({ floaters: f3, rng: rolls(0.99) });
  const m2 = actorOf({ id: 'm2' });
  // 5000, not 0: this player swung at 0 in the check above and the cooldown is
  // on the ACTOR, not on the combat object, so it follows him between them
  c3.queueSwing(player, m2, { now: 5000 });
  c3.update(0, 5400);
  check('a miss says "miss" and takes nothing', f3.seen.some((s) => s.text === 'miss') && m2.health === 100);
}

// ------------------------------------------------------------- who learns
{
  const p = progressionSpy();
  const player = actorOf({ id: 'p', kind: 'player' });
  const monster = actorOf({ id: 'm', kind: 'monster' });
  const c = createCombat({ progression: p, rng: rolls(0, 0.5) });
  c.queueSwing(player, monster, { now: 0 });
  c.update(0, 400);
  check('the player is taught by his own swing', p.seen.length > 0 && p.seen.every((l) => l.who === player), `${p.seen.length} lessons`);
  check('and the lesson names the weapon skill', p.seen.some((l) => l.skill === 'wrestling'));

  const p2 = progressionSpy();
  const c2 = createCombat({ progression: p2, rng: rolls(0, 0.5) });
  const m1 = actorOf({ id: 'm1' }), m2 = actorOf({ id: 'm2' });
  c2.queueSwing(m1, m2, { now: 0 });
  c2.update(0, 400);
  check('two monsters fighting teach nobody anything', p2.seen.length === 0, `${p2.seen.length} lessons`);

  // a monster swinging at the player still teaches the PLAYER, as the defender
  const p3 = progressionSpy();
  const c3 = createCombat({ progression: p3, rng: rolls(0, 0.5) });
  const pl = actorOf({ id: 'p3', kind: 'player' });
  c3.queueSwing(actorOf({ id: 'm3' }), pl, { now: 0 });
  c3.update(0, 400);
  check("being hit teaches the player's CON", p3.seen.some((l) => l.stat === 'con' && l.who === pl));
}

// --------------------------------------------------------------- reach
{
  const a = actorOf(), b = actorOf();
  const r = reachBetween(a, b);
  check('reach is the weapon plus both bodies', Math.abs(r - (1.5 + BODY_RADIUS * 2)) < 1e-9, `${r} m`);
  b.pos.x = r + 0.01;
  const c = createCombat({ rng: rolls() });
  const no = c.queueSwing(a, b, { now: 0 });
  check('a hair past reach is refused', no.queued === false && no.reason === 'out_of_reach', `${no.dist.toFixed(2)} m vs ${no.reach.toFixed(2)}`);
  b.pos.x = r - 0.01;
  check('a hair inside it is taken', c.queueSwing(a, b, { now: 0 }).queued === true);
  // flat first, and height only past REACH_RISE: on a mountainside the AI (which
  // walks to reach measured flat) and this (measured through the air) disagreed
  // by a metre and a wolf and a player stood two metres apart hitting nothing
  check('distance is flat distance until the rise passes a shoulder',
    Math.abs(actorDistance({ pos: { x: 0, y: 1.0, z: 4 } }, { pos: { x: 0, y: 0, z: 0 } }) - 4) < 1e-9);
  check('and a target well above your head counts the rise beyond it',
    Math.abs(actorDistance({ pos: { x: 0, y: 3 + REACH_RISE, z: 4 } }, { pos: { x: 0, y: 0, z: 0 } }) - 5) < 1e-9);
  check('a wolf a metre downslope at two metres flat is within a sword and a body',
    actorDistance({ pos: { x: 2, y: -1, z: 0 } }, { pos: { x: 0, y: 0, z: 0 } }) <= reachBetween({ equipment: {} }, {}) + 1e-9,
    `${actorDistance({ pos: { x: 2, y: -1, z: 0 } }, { pos: { x: 0, y: 0, z: 0 } }).toFixed(2)} vs reach ${reachBetween({ equipment: {} }, {}).toFixed(2)}`);
}

// ------------------------------------------------------------------- leech
{
  const a = actorOf({ health: 50, bonuses: { lifeLeech: 50, manaLeech: 20 }, mana: 0 });
  const b = actorOf();
  const c = createCombat({ rng: rolls(0, 0.5) });
  c.queueSwing(a, b, { now: 0 });
  c.update(0, 400);
  const dealt = 100 - b.health;
  check('life leech returns half of what it dealt', a.health === 50 + Math.round(dealt * 0.5), `dealt ${dealt}, healed to ${a.health}`);
  check('mana leech returns a fifth', a.mana === Math.round(dealt * 0.2), `${a.mana} mana`);

  // and it cannot heal past full
  const full = actorOf({ health: 100, bonuses: { lifeLeech: 100 } });
  const c2 = createCombat({ rng: rolls(0, 0.5) });
  c2.queueSwing(full, actorOf(), { now: 0 });
  c2.update(0, 400);
  check('leech never heals past full', full.health === 100);
}

// ------------------------------------------------------------------ poison
{
  const c = createCombat({ rng: rolls() });
  const v = actorOf({ health: 100 });
  const tick = poisonTick(2);
  check('poison 2 is 4 a second for 12 s', tick.perSecond === 4 && tick.seconds === 12);
  c.applyStatus(v, 'poison', { level: 2 }, 0);
  // eleven seconds of it
  for (let s = 1; s <= 11; s++) c.update(1, s * 1000);
  check('eleven ticks have taken 44', v.health === 100 - 44, `${100 - v.health} taken`);
  c.update(1, 12000);
  check('the twelfth tick takes the last of it', v.health === 100 - 48, `${100 - v.health} taken`);
  c.update(1, 13000);
  check('and then it stops', v.health === 100 - 48 && !v.status.poison);

  // a bleed with an explicit rate, which is how Rend writes it
  const b = actorOf({ health: 100 });
  const c2 = createCombat({ rng: rolls() });
  c2.applyStatus(b, 'bleed', { perSecond: 3, seconds: 8 }, 0);
  for (let s = 1; s <= 8; s++) c2.update(1, s * 1000);
  check('Rend bleeds 3 a second for 8 s, which is 24', b.health === 76, `${100 - b.health}`);
  c2.update(1, 9000);
  check('and the bleed is gone after its eight seconds', !b.status.bleed);
}

// -------------------------------------------------------------------- falls
{
  const c = createCombat({ rng: rolls() });
  const p = actorOf({ kind: 'player', health: 170, maxHealth: 170 });
  check('a 4 m drop is free', c.applyFall(p, 4, 0) === 0 && p.health === 170);
  check('a 10 m drop costs 36', c.applyFall(p, 10, 0) === 36 && p.health === 134, `${p.health} left`);
  // 02-COMBAT says "32 m kills a fresh warrior of 170 health outright". Its own
  // formula says (32 - 4) * 6 = 168, which leaves that warrior standing on 2.
  // The formula is the rule and the sentence is a rounding of it, so this is
  // measured rather than believed, and 33 m is the drop that actually does it.
  const fresh = actorOf({ kind: 'player', health: 170, maxHealth: 170 });
  const c2 = createCombat({ rng: rolls() });
  const took = c2.applyFall(fresh, 32, 0);
  check('a 32 m drop takes 168 and leaves him on 2', took === 168 && took === fallDamage(32) && fresh.health === 2, `${took} damage, ${fresh.health} left`);
  const fresh2 = actorOf({ kind: 'player', health: 170, maxHealth: 170 });
  let died = null;
  const c3 = createCombat({ rng: rolls() });
  c3.onDeath((a) => { died = a; });
  const took2 = c3.applyFall(fresh2, 33, 0);
  check('33 m kills him outright', fallDamage(33) === 174 && fresh2.health === 0 && died === fresh2, `the fall was worth ${fallDamage(33)}, he only had ${took2}`);
  check('and the body is told to fall over', fresh2.anim === 'die');
}

// -------------------------------------------------------------------- death
{
  let calls = 0, last = null;
  const c = createCombat({ rng: rolls(0, 0.5) });
  c.onDeath((a, k) => { calls++; last = { a, k }; });
  const killer = actorOf({ id: 'killer' });
  const dying = actorOf({ id: 'dying', health: 1 });
  c.queueSwing(killer, dying, { now: 0 });
  c.update(0, 400);
  check('a killing blow fires onDeath once', calls === 1 && last.a === dying && last.k === killer);
  check('the dead thing is at zero and told to fall', dying.health === 0 && dying.anim === 'die');
  c.queueSwing(killer, dying, { now: 5000 });
  check('nothing may swing at a corpse', c.queueSwing(killer, dying, { now: 9000 }).reason === 'dead');
  c.update(0, 9400);
  check('and onDeath does not fire twice', calls === 1);
}

// --------------------------------------------------------------- in combat
{
  const c = createCombat({ rng: rolls() });
  const a = actorOf(), b = actorOf();
  check('nobody starts in combat', c.inCombat(a, 0) === false);
  c.queueSwing(a, b, { now: 1000 });
  check('a swing puts you in combat', c.inCombat(a, 1000) === true);
  check('and you are still in it a second later', c.inCombat(a, 2000) === true);
  check('and out of it after six', c.inCombat(a, 1000 + IN_COMBAT_MS) === false);
}

// ------------------------------------------------------------------- spells
{
  const f = floatersSpy();
  const c = createCombat({ floaters: f, rng: rolls(0.5, 0.99) });
  const caster = actorOf({ kind: 'player', stats: { int: 50 } });
  const target = actorOf({ health: 200, maxHealth: 200 });
  const q = c.queueSpell(caster, { base: [18, 26], damageType: 'fire' }, target, { now: 0 });
  check('a spell is queued', q.queued === true);
  c.update(0, 200);
  check('and it lands', target.health < 200, `${200 - target.health} damage`);

  // the ability record shape, damage buried in a combo
  const fireball = { id: 'fireball', effect: { kind: 'combo', parts: [{ kind: 'spellDamage', min: 18, max: 26, type: 'fire' }, { kind: 'dot', perSecond: 2 }] } };
  const shaped = spellShape(fireball);
  check('an ability record is unwrapped to its damage', shaped.base[0] === 18 && shaped.base[1] === 26 && shaped.damageType === 'fire');
  check('an ability that does no damage is not a spell to resolve', spellShape({ effect: { kind: 'buff' } }) === null);
  check('a spell at a corpse is refused', c.queueSpell(caster, { base: [1, 1] }, actorOf({ health: 0 }), { now: 0 }).reason === 'dead');
}

// ---------------------------------------------- the arithmetic is not ours
{
  // A grandmaster against a rat, and a rat against a grandmaster, so the hit
  // chances this runtime hands out are the document's own.
  const gm = actorOf({ skills: { wrestling: 100, tactics: 100, parrying: 100 }, stats: { dex: 100, str: 100 } });
  const rat = actorOf({ skills: { wrestling: 15, parrying: 10 }, stats: { dex: 0 } });
  const up = hitChance(gm, rat), down = hitChance(rat, gm);
  check('a grandmaster hits a rat at the 0.95 cap', up === 0.95, `${up}`);
  check('and the rat hits back at the 0.10 floor', down === 0.10, `${down}`);
}

// The old hunting path was checked here and is not any more: it is unreachable.
// See the note at the head of this file and docs/mmo/wiring/F1.md section 9.

// ------------------------------------ what an ability asks a swing to do
//
// `abilities_runtime.js` (W4) sends five things with a swing: multiplier,
// hitBonus, ignoreARFraction, jumpAttack and immediate. Each of them is driven
// here BOTH ways, because an option that is passed and read by nothing is the
// exact bug this project keeps finding: the effect exists, the path does not.
{
  const base = () => actorOf({ id: 'p', kind: 'player' });
  const dummy = () => actorOf({ id: 'd', health: 1e6, maxHealth: 1e6, ar: 0 });

  // multiplier: the same roll and the same crit, times 1.6
  const hit = (opts, ar = 0) => {
    const a = base(), b = dummy();
    b.ar = ar;
    const c = createCombat({ rng: rolls(0, 0.5, 0.5, 0.99) });     // hit, no dodge/parry path, mid roll, no crit
    c.queueSwing(a, b, { now: 0, ...opts });
    c.update(0, 400);
    return 1e6 - b.health;
  };
  const plain = hit({});
  const powered = hit({ multiplier: 1.6 });
  check('an ability multiplier really multiplies the damage',
    Math.abs(powered / plain - 1.6) < 0.06, `${plain} plain, ${powered} at 1.6x`);
  const air = hit({ jumpAttack: true });
  check('and a jump attack is a quarter more', Math.abs(air / plain - JUMP_ATTACK_MULT) < 0.06, `${plain} on the ground, ${air} in the air`);
  const both = hit({ multiplier: 1.6, jumpAttack: true });
  check('and the two multiply together rather than one winning',
    Math.abs(both / plain - 1.6 * JUMP_ATTACK_MULT) < 0.06, `${both} against ${plain}`);

  // ignoreARFraction: AR 120 halves, and half of it ignored halves less
  const armoured = hit({}, 120);
  const pierced = hit({ ignoreARFraction: 1 }, 120);
  check('AR 120 halves a blow', Math.abs(armoured / plain - 0.5) < 0.02, `${armoured} against ${plain}`);
  check('and ignoring all of it puts the blow back to full',
    pierced === plain, `${pierced} against ${plain}`);

  // hitBonus: skill points onto the attack roll, proved on the roll it flips
  const a1 = base(), b1 = dummy();
  const c1 = createCombat({ rng: rolls(0.64) });      // hitChance is 0.625 without help
  c1.queueSwing(a1, b1, { now: 0 });
  c1.update(0, 400);
  check('a roll of 0.64 misses at a hit chance of 0.625', b1.health === 1e6);
  const a2 = base(), b2 = dummy();
  const c2 = createCombat({ rng: rolls(0.64, 0.5, 0.5, 0.99) });
  c2.queueSwing(a2, b2, { now: 0, hitBonus: 10 });    // +10 skill = +5 points of chance
  c2.update(0, 400);
  check('and the same roll lands with ten points of hitBonus', b2.health < 1e6, `${1e6 - b2.health} damage`);
  check('and the bonus did not stick to the swinger', !a2.bonuses.hit);

  // immediate: three shots in one frame, and the ordinary swing timer untouched
  const a3 = base(), b3 = dummy();
  const c3 = createCombat({ rng: rolls() });
  let queued = 0;
  for (let i = 0; i < 3; i++) if (c3.queueSwing(a3, b3, { now: 0, immediate: true }).queued) queued++;
  check('three immediate shots all go', queued === 3, `${queued} of 3`);
  check('and none of them started the weapon cooldown', a3.lastSwingAt === -Infinity);
  const a4 = base(), b4 = dummy();
  const c4 = createCombat({ rng: rolls() });
  let ordinary = 0;
  for (let i = 0; i < 3; i++) if (c4.queueSwing(a4, b4, { now: 0 }).queued) ordinary++;
  check('and without it three clicks in one frame are one swing', ordinary === 1, `${ordinary} of 3`);
}

// ------------------------------------------------- a swing whose owner left
{
  const c = createCombat({ rng: rolls(0, 0.5) });
  const gone = actorOf({ id: 'gone' }), player = actorOf({ id: 'p', kind: 'player' });
  c.queueSwing(gone, player, { now: 0 });
  check('the swing is in the air', c.pendingCount === 1);
  check('forgetting the swinger takes it out of the air', c.forget(gone) === 1 && c.pendingCount === 0);
  c.update(0, 400);
  check('and nothing lands from a body that is no longer there', player.health === 100);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
