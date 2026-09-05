// A weapon's effects actually reaching the thing it hits.
// Run: node src/game/hit_effects.test.mjs
//
// Nothing here is a mock of the resolver. Every check drives the REAL
// `createCombat`, which drives the REAL `combat_rules.resolveMelee`, and the
// frozen rat at the bottom is driven through the REAL `stepMonster` and the
// REAL `makeMonsterActor` out of `monsters.js`. The only stand-ins are the
// floaters layer and the hud, which are spies, because the claim being measured
// is "it said so" and a spy is the only thing that can prove it.
//
// Every gate is driven BOTH ways: the sword with the affix and the sword
// without it, the hit and the miss, the frozen monster and the free one.

import {
  rollHitEffects, rollSpellEffects, applyHitEffects, HIT_EFFECTS, HIT_EFFECT_IDS,
  TYPE_COLOURS, EFFECT_COLOURS, cssColour, spellScale, freezeChance, stripOneBuff,
  auditHitEffects, lineFor, EVERFROST_SLOW, VAMPIRIC_DRAIN,
} from './hit_effects.js';
import { createCombat, PARRY_DEFENCE_POINTS, STUN_RESIST_CAP, SWING_LAND_S } from './combat.js';
import { TYPE_COLOURS as EFFECT_TYPE_COLOURS } from './effects.js';
import { BONUS_KEYS, UNCONSUMED_BONUSES } from './actor.js';
import { makeMonsterActor, stepMonster, speedOf, SLOW_DEFAULT } from './monsters.js';
import { hitChance, resistOf } from '../mmo/combat_rules.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// --------------------------------------------------------------- the harness

/** An rng that returns the numbers you give it, then 0.5 for ever. */
const rolls = (...list) => { let i = 0; return () => (i < list.length ? list[i++] : 0.5); };
/** A seeded rng, so ten thousand hits are the same ten thousand hits every run. */
function seeded(seed = 12345) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function actorOf(over = {}) {
  return {
    id: over.id || 'a', kind: over.kind || 'monster', name: over.name || 'thing',
    pos: { x: 0, y: 0, z: 0 }, yaw: 0,
    stats: { str: 0, dex: 0, int: 0, con: 0, wis: 0 },
    skills: { wrestling: 50, tactics: 0, anatomy: 0, parrying: 0, magery: 0 },
    bonuses: {}, ar: 0, resists: {},
    weapon: { skill: 'wrestling', minDamage: 10, maxDamage: 10, speed: 2, weight: 3, damageType: 'physical', reach: 1.5 },
    shield: null,
    health: 100, maxHealth: 100, mana: 50, maxMana: 50, stamina: 100, maxStamina: 100,
    buffs: [], status: {}, lastSwingAt: -Infinity, casting: null, faction: 'hostile',
    ai: null, anim: 'idle', powers: [], enchant: null,
    ...over,
  };
}
const floatersSpy = () => { const seen = []; return { seen, spawn: (p, text, kind, extra) => seen.push({ text, kind, color: extra?.color }) }; };
const hudSpy = () => { const said = []; return { said, log: (t) => said.push(t) }; };

/** One swing, start to finish, through the real runtime. */
function swing(attacker, defender, opts = {}) {
  const f = floatersSpy(), h = hudSpy();
  const c = createCombat({ rng: opts.rng || rolls(0, 0.5), floaters: f, hud: h, recompute: opts.recompute });
  const hits = [];
  c.onHit((info) => hits.push(info));
  c.queueSwing(attacker, defender, { now: 0, ...opts.swing });
  c.update(0, SWING_LAND_S * 1000);
  return { c, f, h, hits };
}

// ============================================================ the table itself
{
  check('the seven hit lines are the seven actor.js sums',
    HIT_EFFECT_IDS.join(',') === 'hitFireball,hitLightning,hitFrost,hitHarm,hitLifeDrain,hitFatigue,hitDispel',
    HIT_EFFECT_IDS.join(','));
  check('every one of them is a real bonus key', auditHitEffects(BONUS_KEYS).effects === 7);
  check('and the audit throws when a key has no row', (() => {
    try { auditHitEffects([...BONUS_KEYS, 'hitEarthquake']); return false; } catch { return true; }
  })());
  check('all seven were in W1s unconsumed list, and none of them is read anywhere else',
    HIT_EFFECT_IDS.every((k) => UNCONSUMED_BONUSES.includes(k)));

  // the audit that keeps this file free of THREE without letting it drift
  const drift = Object.keys(TYPE_COLOURS).filter((k) => TYPE_COLOURS[k] !== EFFECT_TYPE_COLOURS[k]);
  check('the six damage colours match effects.js exactly', drift.length === 0, drift.join(', ') || '6 of 6');
  check('cssColour is what floaters.js wants', cssColour(TYPE_COLOURS.cold) === '#6fd0ff', cssColour(TYPE_COLOURS.cold));
}

// ======================================================== nothing on a miss
{
  const sword = { hitFireball: 1, hitLightning: 1, hitFrost: 1, hitHarm: 1, hitLifeDrain: 1, hitFatigue: 1, hitDispel: 1 };
  const a = actorOf({ bonuses: sword });
  const d = actorOf({ id: 'd' });
  check('a miss fires nothing', rollHitEffects(a, d, { damage: 0 }, rolls(0)).length === 0);
  check('a dodge fires nothing', rollHitEffects(a, d, { damage: 0, dodged: true }, rolls(0)).length === 0);
  check('a parry fires nothing', rollHitEffects(a, d, { damage: 0, parried: true }, rolls(0)).length === 0);
  check('and one point of damage fires all seven', rollHitEffects(a, d, { damage: 1 }, rolls(0)).length === 7);

  // and through the real runtime: a swing that misses says nothing extra
  const miss = actorOf({ bonuses: sword, skills: { wrestling: 50, magery: 100 } });
  const victim = actorOf({ id: 'v' });
  const r = swing(miss, victim, { rng: rolls(0.99) });          // 0.99 -> a certain miss
  check('through the runtime, a missed swing leaves the target whole and unfrozen',
    victim.health === 100 && !victim.status.slow && !victim.status.root && r.hits.length === 0);
}

// ==================================================== a plain sword fires none
{
  const plain = actorOf({ bonuses: {} });
  const d = actorOf({ id: 'd' });
  // an rng that throws if it is ever asked: a line the sword does not carry
  // must not spend a draw, or a seeded sequence is not the sequence it looks
  let asked = 0;
  const counting = () => { asked++; return 0; };
  const got = rollHitEffects(plain, d, { damage: 20 }, counting);
  check('a sword with no hit lines fires nothing and rolls nothing', got.length === 0 && asked === 0, `${got.length} effects, ${asked} draws`);

  const f = floatersSpy(), h = hudSpy();
  const r = swing(plain, actorOf({ id: 'v' }));
  check('and through the runtime it says nothing beyond the blow', r.f.seen.length === 1 && r.hits.length === 0,
    r.f.seen.map((s) => s.text).join(', '));
}

// ================================================ 10,000 hits at 12% Hit Frost
{
  const a = actorOf({ bonuses: { hitFrost: 0.12 }, skills: { wrestling: 50, magery: 100 } });
  const d = actorOf({ id: 'd' });
  const rng = seeded(20260905);
  let fired = 0, frozen = 0, slowOnly = 0;
  for (let i = 0; i < 10000; i++) {
    const list = rollHitEffects(a, d, { damage: 20 }, rng);
    if (!list.length) continue;
    fired++;
    if (list[0].frozen) frozen++; else slowOnly++;
  }
  check('a 12% Hit Frost sword fires 1,200 times in 10,000 hits, give or take 100',
    Math.abs(fired - 1200) <= 100, `${fired} of 10,000`);
  check('and at 100 Magery every one of them freezes solid',
    frozen === fired && slowOnly === 0, `${frozen} frozen, ${slowOnly} only slowed`);

  // the other end of the ramp: no Magery at all is a slow and never a freeze
  const b = actorOf({ bonuses: { hitFrost: 0.12 }, skills: { wrestling: 50, magery: 0 } });
  const rng2 = seeded(20260905);
  let fired2 = 0, frozen2 = 0;
  for (let i = 0; i < 10000; i++) {
    const list = rollHitEffects(b, d, { damage: 20 }, rng2);
    if (list.length) { fired2++; if (list[0].frozen) frozen2++; }
  }
  check('at 0 Magery the same sword still fires as often and never freezes',
    Math.abs(fired2 - 1200) <= 100 && frozen2 === 0, `${fired2} fired, ${frozen2} frozen`);
  check('freezeChance walks 0 to 1 with Magery',
    freezeChance(b) === 0 && freezeChance(a) === 1 && freezeChance(actorOf({ skills: { magery: 50 } })) === 0.5);

  // and the chance really is the bonus, not a constant: 40% fires four times as often
  const c = actorOf({ bonuses: { hitFrost: 0.40 } });
  const rng3 = seeded(7);
  let fired3 = 0;
  for (let i = 0; i < 10000; i++) if (rollHitEffects(c, d, { damage: 20 }, rng3).length) fired3++;
  check('a 40% sword fires 4,000 times, give or take 150', Math.abs(fired3 - 4000) <= 150, `${fired3} of 10,000`);
}

// ============================================================== the magnitudes
{
  const d = actorOf({ id: 'd' });
  const at = (id, rng, over = {}) => rollHitEffects(actorOf({ bonuses: { [id]: 1 }, ...over }), d, { damage: 40 }, rng)[0];

  // fireball 10 to 20 fire, at 0 Magery, driven at both ends of the roll
  const lo = at('hitFireball', rolls(0, 0)), hi = at('hitFireball', rolls(0, 0.999));
  check('Hit Fireball is 10 to 20 fire', lo.damage === 10 && hi.damage === 20 && lo.damageType === 'fire',
    `${lo.damage} to ${hi.damage} ${lo.damageType}`);
  const lo2 = at('hitLightning', rolls(0, 0)), hi2 = at('hitLightning', rolls(0, 0.999));
  check('Hit Lightning is 12 to 24 energy', lo2.damage === 12 && hi2.damage === 24 && lo2.damageType === 'energy',
    `${lo2.damage} to ${hi2.damage} ${lo2.damageType}`);
  const lo3 = at('hitHarm', rolls(0, 0)), hi3 = at('hitHarm', rolls(0, 0.999));
  check('Hit Harm is 8 to 16 physical', lo3.damage === 8 && hi3.damage === 16 && lo3.damageType === 'physical',
    `${lo3.damage} to ${hi3.damage} ${lo3.damageType}`);
  const fat = at('hitFatigue', rolls(0, 0)), fat2 = at('hitFatigue', rolls(0, 0.999));
  check('Hit Fatigue takes 10 to 20 stamina', fat.stamina === 10 && fat2.stamina === 20, `${fat.stamina} to ${fat2.stamina}`);
  const dr = at('hitLifeDrain', rolls(0));
  check('Hit Life Drain heals 30% of the hit, rounded', dr.heal === 12, `${dr.heal} off a hit of 40`);
  const dr2 = rollHitEffects(actorOf({ bonuses: { hitLifeDrain: 1 } }), d, { damage: 15 }, rolls(0))[0];
  check('and 30% of 15 rounds to 5, not 4', dr2.heal === Math.round(15 * 0.3) && dr2.heal === 5, `${dr2.heal}`);

  // Magery scales the damage, and by the rate combat_rules already uses
  const hot = at('hitFireball', rolls(0, 0), { skills: { magery: 100 } });
  check('100 Magery scales a hit spell by 1.40', spellScale({ skills: { magery: 100 } }) === 1.4 && hot.damage === 14,
    `${hot.damage} against ${lo.damage}`);

  // the defender's resist takes its cut, and Harm's does not
  const fireproof = actorOf({ id: 'fp', resists: { fire: 50, physical: 50 } });
  const burned = rollHitEffects(actorOf({ bonuses: { hitFireball: 1 } }), fireproof, { damage: 40 }, rolls(0, 0.999))[0];
  check('a 50% fire resist halves a hit fireball', burned.damage === 10 && resistOf(fireproof, 'fire') === 0.5, `${burned.damage} of 20`);
  const harmed = rollHitEffects(actorOf({ bonuses: { hitHarm: 1 } }), fireproof, { damage: 40 }, rolls(0, 0.999))[0];
  check('and 50% physical takes nothing off Harm, which is the whole promise', harmed.damage === 16, `${harmed.damage} of 16`);

  // frost: 30% for 4 s, plus the freeze at 1.5 s
  const fr = at('hitFrost', rolls(0, 0.5, 0.99), { skills: { magery: 0 } });
  check('Hit Frost slows 30% for 4 s', fr.status[0].id === 'slow' && fr.status[0].factor === 0.30 && fr.status[0].seconds === 4,
    `${fr.status[0].factor} for ${fr.status[0].seconds} s`);
  check('and only slows when it does not freeze', fr.status.length === 1 && fr.word === 'chilled');
  const fz = at('hitFrost', rolls(0, 0.5, 0.0), { skills: { magery: 100 } });
  check('a freeze is root plus slow, the root for 1.5 s',
    fz.status.map((s) => s.id).join(',') === 'slow,root' && fz.status[1].seconds === 1.5 && fz.word === 'frozen',
    fz.status.map((s) => `${s.id} ${s.seconds}s`).join(', '));
}

// ================================================== every effect says something
{
  const all = { hitFireball: 1, hitLightning: 1, hitFrost: 1, hitHarm: 1, hitLifeDrain: 1, hitFatigue: 1, hitDispel: 1 };
  const a = actorOf({ id: 'p', kind: 'player', name: 'you', bonuses: all, health: 50, skills: { wrestling: 50, magery: 100 } });
  const b = actorOf({ id: 'rat', name: 'rat', health: 400, maxHealth: 400, buffs: [{ name: 'Bless', until: 999 }] });
  const r = swing(a, b, { rng: rolls(0, 0.5) });

  const kinds = (r.hits || []).map((h) => h.kind);
  check('all seven fire on one swing', r.hits.length === 7, kinds.join(', '));
  const lines = r.h.said;
  check('and every one of them wrote a line', lines.length >= 7, `${lines.length} lines`);
  check('no line uses an em dash', !lines.some((l) => l.includes('—')));
  check('the log names the frost', lines.some((l) => /Frost catches the rat and holds it there/.test(l)), lines.find((l) => /Frost/.test(l)));
  check('the log names which buff went', lines.some((l) => /unravels Bless on the rat/.test(l)), lines.find((l) => /unravel/.test(l)));
  check('and the drain says what came back', lines.some((l) => /The blade drinks/.test(l)), lines.find((l) => /drinks/.test(l)));

  const floats = r.f.seen;
  const frozen = floats.find((s) => s.text === 'frozen');
  check('a frost hit floats "frozen" in ice blue over the target',
    !!frozen && frozen.color === '#6fd0ff', frozen ? frozen.color : 'no floater');
  const fire = floats.find((s) => s.color === cssColour(TYPE_COLOURS.fire));
  check('a fireball floats its number in fire colour', !!fire && /^\d+$/.test(fire.text), fire ? `${fire.text} in ${fire.color}` : 'none');
  check('lightning floats in energy purple', floats.some((s) => s.color === cssColour(TYPE_COLOURS.energy)));
  check('the stamina taken is on screen', floats.some((s) => /^-\d+ stamina$/.test(s.text)), floats.find((s) => /stamina/.test(s.text))?.text);
  check('and so is the buff that went', floats.some((s) => s.text === 'Bless gone'));

  check('the fatigue really took stamina', b.stamina < 100, `${b.stamina} of 100`);
  check('the drain really healed the swinger', a.health > 50, `${a.health} of 100, from 50`);
  check('the rat is slowed and rooted', !!b.status.slow && !!b.status.root && b.status.slow.factor === 0.30);
  check('and it lost real health beyond the blow', b.health < 400 - 10, `${b.health} of 400`);
}

// ============================ applyHitEffects returns the words and the floaters
{
  // The pure half hands back descriptors as well as writing, so a caller that
  // wants the words without a floaters layer can have them.
  const a = actorOf({ kind: 'player', name: 'you', bonuses: { hitFireball: 1, hitFrost: 1 }, skills: { wrestling: 50, magery: 100 } });
  const b = actorOf({ id: 'b', name: 'rat', health: 400, maxHealth: 400 });
  const list = rollHitEffects(a, b, { damage: 30 }, rolls(0, 0.5, 0, 0.5, 0));
  const c = createCombat({ rng: rolls() });
  const applied = applyHitEffects(list, a, b, c, 0);
  check('applyHitEffects returns one line per effect', applied.lines.length === list.length && list.length === 2,
    applied.lines.join(' | '));
  check('and the floaters it asked for, with their colours',
    applied.floats.some((f) => f.colour === cssColour(TYPE_COLOURS.fire))
    && applied.floats.some((f) => f.text === 'frozen' && f.colour === cssColour(TYPE_COLOURS.cold)),
    applied.floats.map((f) => `${f.text} ${f.colour}`).join(', '));
  check('and it counts what it really took', applied.damage === 400 - b.health && applied.damage > 0, `${applied.damage}`);
  check('lineFor on its own is the same line', lineFor(list[0], a, b) === applied.lines[0], applied.lines[0]);
  check('every row in the table has a kind and a word',
    HIT_EFFECT_IDS.every((id) => HIT_EFFECTS[id].kind && HIT_EFFECTS[id].word));
  check('an empty list applies nothing and says nothing',
    applyHitEffects([], a, b, c, 0).lines.length === 0);
}

// ====================================================== Dispel, both its paths
{
  // 1. with a recompute in hand: the buff is gone from the array on the spot
  const seen = [];
  const a = actorOf({ bonuses: { hitDispel: 1 } });
  const b = actorOf({ id: 'b', name: 'rat', buffs: [{ name: 'Bless', until: 99 }, { name: 'Strength', until: 99 }] });
  const r = swing(a, b, { recompute: (who) => seen.push(who) });
  check('with a recompute, dispel takes exactly one buff off', b.buffs.length === 1, `${b.buffs.length} left`);
  check('and it takes the most recent one', b.buffs[0].name === 'Bless', b.buffs.map((x) => x.name).join(','));
  check('and it recomputed the actor it stripped', seen.length === 1 && seen[0] === b);

  // 2. without one: the buff is marked expired so its OWNER drops it and
  //    recomputes, rather than losing its bonuses into the array
  const a2 = actorOf({ bonuses: { hitDispel: 1 } });
  const b2 = actorOf({ id: 'b2', name: 'rat', buffs: [{ name: 'Bless', until: 99 }] });
  swing(a2, b2);
  check('with no recompute, the buff stays in the array', b2.buffs.length === 1);
  check('and is marked expired under a clock in seconds and one in milliseconds alike',
    b2.buffs[0].until === -Infinity);

  // 3. nothing to take
  const a3 = actorOf({ bonuses: { hitDispel: 1 } });
  const b3 = actorOf({ id: 'b3', name: 'rat', buffs: [] });
  const r3 = swing(a3, b3);
  check('a dispel with nothing to unravel says so rather than nothing',
    r3.f.seen.some((s) => s.text === 'nothing to unravel'));
  check('stripOneBuff on a bare actor is null', stripOneBuff(actorOf({ buffs: [] }), {}) === null);
}

// =========================================================== the named powers
{
  const a = actorOf({ kind: 'player', name: 'you', powers: ['vampiric'], health: 10 });
  const b = actorOf({ id: 'b', name: 'rat', health: 500, maxHealth: 500 });
  const before = a.health;
  const r = swing(a, b);
  const dealt = 500 - b.health;
  check('Vampiric heals a quarter of every blow', a.health - before === Math.round(dealt * VAMPIRIC_DRAIN),
    `${a.health - before} back off ${dealt}`);
  check('and says so, in the power\'s own name', r.h.said.some((l) => /The vampiric blade drinks/.test(l)), r.h.said[0]);

  const ev = actorOf({ powers: ['everfrost'] });
  const t = actorOf({ id: 't', name: 'rat', health: 500, maxHealth: 500 });
  swing(ev, t, { rng: rolls(0, 0.5, 0.99, 0.99) });   // hit, roll, no crit, then 0.99 -> no freeze
  check('Everfrost slows 40% on every hit', t.status.slow && t.status.slow.factor === EVERFROST_SLOW,
    `${t.status.slow?.factor}`);
  // a FRESH swinger: the weapon cooldown lives on the actor, not on the combat
  const ev2 = actorOf({ id: 'ev2', powers: ['everfrost'] });
  const t2 = actorOf({ id: 't2', name: 'rat', health: 500, maxHealth: 500 });
  swing(ev2, t2, { rng: rolls(0, 0.5, 0.99, 0.0) });   // hit, roll, no crit, then 0.0 -> inside the freeze chance
  check('and can freeze', !!t2.status.root, t2.status.root ? `${t2.status.root.seconds} s` : 'never froze');

  // 40 beats 30: the stronger slow wins and does not get loosened
  const both = actorOf({ powers: ['everfrost'], bonuses: { hitFrost: 1 }, skills: { wrestling: 50, magery: 0 } });
  const t3 = actorOf({ id: 't3', name: 'rat', health: 500, maxHealth: 500 });
  swing(both, t3, { rng: rolls(0, 0.5, 0.99, 0.5, 0.99, 0.99) });
  check('a 30% slow landing next to a 40% one leaves 40% standing', t3.status.slow.factor === 0.40, `${t3.status.slow.factor}`);

  check('Stormcaller and Sunder are deliberately not here',
    rollHitEffects(actorOf({ powers: ['stormcaller', 'sunder'] }), actorOf(), { damage: 10 }, rolls(0)).length === 0);
}

// ============================================== the enchantment on the weapon
{
  // Poison Blade: five hits of poison, and the fifth is the last one
  const a = actorOf({ kind: 'player', name: 'you', enchant: { damageType: 'poison', level: 3, hitsLeft: 5, until: Infinity } });
  const b = actorOf({ id: 'b', name: 'rat', health: 900, maxHealth: 900 });
  const f = floatersSpy(), h = hudSpy();
  const c = createCombat({ rng: rolls(), floaters: f, hud: h });
  let landed = 0;
  for (let i = 0; i < 8; i++) {
    const now = i * 3000;
    c.queueSwing(a, b, { now });
    c.update(0, now + SWING_LAND_S * 1000);
    if (a.enchant) landed++;
  }
  check('a five hit enchantment is gone after five landed blows', a.enchant === null);
  check('and something said so', h.said.some((l) => /last of it goes off the blade/.test(l)));
  check('the rat was poisoned by it', b.status.poison ? b.status.poison.level === 3 : false,
    b.status.poison ? `level ${b.status.poison.level}` : 'never poisoned');
  check('a poison floater in poison green', f.seen.some((s) => s.text === 'poisoned' && s.color === cssColour(TYPE_COLOURS.poison)));

  // Consecrate Weapon carries no level: it is a multiplier, not a proc, and
  // fires nothing here while still spending nothing it should not
  const holy = actorOf({ enchant: { damageType: 'holy', vs: 'undead', mult: 1.5, hitsLeft: Infinity, until: Infinity } });
  check('a holy enchantment with no level fires no proc',
    rollHitEffects(holy, actorOf(), { damage: 10 }, rolls(0)).length === 0);

  // and a spell does not spend a weapon enchantment, nor carry it
  const caster = actorOf({ kind: 'player', enchant: { damageType: 'poison', level: 3, hitsLeft: 5, until: Infinity } });
  const victim = actorOf({ id: 'v', name: 'rat', health: 900, maxHealth: 900 });
  const c2 = createCombat({ rng: rolls() });
  c2.queueSpell(caster, { base: [10, 10], damageType: 'fire' }, victim, { now: 0 });
  c2.update(0, 200);
  check('a spell does not spend a hit off the blade', caster.enchant.hitsLeft === 5, `${caster.enchant.hitsLeft} of 5`);
  check('and does not carry its poison', !victim.status.poison);
  check('rollSpellEffects wants an enchant that says onSpell, and no ability sets one',
    rollSpellEffects(caster, victim, { damage: 10 }, rolls(0)).length === 0
    && rollSpellEffects({ ...caster, enchant: { ...caster.enchant, onSpell: true } }, victim, { damage: 10 }, rolls(0)).length === 1);
}

// ============================================================= Damage Reflect
{
  const a = actorOf({ kind: 'player', name: 'you', health: 100 });
  const b = actorOf({ id: 'b', name: 'rat', health: 900, maxHealth: 900, bonuses: { damageReflect: 0.25 } });
  const r = swing(a, b);
  const dealt = 900 - b.health;
  check('a quarter of the blow comes back', 100 - a.health === Math.round(dealt * 0.25),
    `${100 - a.health} back off ${dealt}`);
  check('and it says so, naming both sides', r.h.said.some((l) => /The rat throws \d+ of it straight back at you/.test(l)),
    r.h.said.find((l) => /back at/.test(l)));
  check('and floats over the attacker', r.f.seen.some((s) => s.color === cssColour(EFFECT_COLOURS.dispel)));

  const a2 = actorOf({ kind: 'player', health: 100 });
  const b2 = actorOf({ id: 'b2', health: 900, maxHealth: 900 });
  swing(a2, b2);
  check('and a defender with no reflect sends nothing back', a2.health === 100);

  // reflect can kill: the write goes through hurt, so the death is real
  const weak = actorOf({ kind: 'player', name: 'you', health: 2 });
  const spiky = actorOf({ id: 's', name: 'rat', health: 900, maxHealth: 900, bonuses: { damageReflect: 1 } });
  let died = null;
  const f = floatersSpy(), c = createCombat({ rng: rolls(0, 0.5), floaters: f });
  c.onDeath((who) => { died = who; });
  c.queueSwing(weak, spiky, { now: 0 });
  c.update(0, 400);
  check('a full reflect off a big blow kills the swinger, through hurt', died === weak && weak.health === 0);
}

// =================================================================== Thorns
{
  const a = actorOf({ kind: 'player', name: 'you', health: 100 });
  const b = actorOf({ id: 'b', name: 'rat', health: 900, maxHealth: 900, bonuses: { thorns: 6 } });
  const r = swing(a, b);
  check('thorns take their flat number off the swinger', a.health === 94, `${a.health} of 100`);
  check('and say so', r.h.said.some((l) => /barbed/.test(l)), r.h.said.find((l) => /barbed/.test(l)));

  // an archer thirty metres off is not touching the breastplate
  const archer = actorOf({
    kind: 'player', name: 'you', health: 100,
    weapon: { skill: 'archery', minDamage: 10, maxDamage: 10, speed: 2, weight: 3, damageType: 'physical', ranged: true, range: 30, reach: 30 },
  });
  const b2 = actorOf({ id: 'b2', name: 'rat', health: 900, maxHealth: 900, bonuses: { thorns: 6, damageReflect: 0.25 } });
  b2.pos = { x: 0, y: 0, z: 20 };
  const r2 = swing(archer, b2);
  check('a ranged attacker takes no thorns', archer.health > 94, `${archer.health} of 100`);
  check('but the reflect still reaches him', archer.health < 100, `${archer.health} of 100`);
}

// ============================================================ Stamina Leech
{
  const a = actorOf({ kind: 'player', name: 'you', stamina: 20, maxStamina: 100, bonuses: { staminaLeech: 30 } });
  const b = actorOf({ id: 'b', name: 'rat', health: 900, maxHealth: 900 });
  const r = swing(a, b);
  const dealt = 900 - b.health;
  check('stamina leech is percent points of the damage dealt', a.stamina === 20 - 3 + Math.round(dealt * 0.3),
    `${a.stamina} from 20, less the 3 the swing cost, off a blow of ${dealt}`);
  check('and it says so', r.h.said.some((l) => /take \d+ stamina out of the rat/.test(l)), r.h.said.find((l) => /stamina/.test(l)));
  check('and floats a green number', r.f.seen.some((s) => /^\+\d+ stamina$/.test(s.text)));

  // a fighter already at his cap: the swing costs 3, the leech puts 3 back and
  // no more, and nothing claims a number the pool did not take
  const full = actorOf({ kind: 'player', name: 'you', stamina: 100, maxStamina: 100, bonuses: { staminaLeech: 100 } });
  const b2 = actorOf({ id: 'b2', name: 'rat', health: 900, maxHealth: 900 });
  const r2 = swing(full, b2);
  check('a leech never pushes stamina past the cap', full.stamina === 100, `${full.stamina} of 100`);
  check('and the line says the 3 it really got, not the 10 it rolled',
    r2.h.said.some((l) => /take 3 stamina out of the rat/.test(l)), r2.h.said.find((l) => /stamina/.test(l)));

  // and a defender with nothing left says so rather than nothing
  const drained = actorOf({ id: 'dr', name: 'rat', health: 900, maxHealth: 900, stamina: 0 });
  const fatiguer = actorOf({ kind: 'player', name: 'you', bonuses: { hitFatigue: 1 } });
  const r3 = swing(fatiguer, drained);
  check('Hit Fatigue on an empty defender says there was nothing to take',
    r3.h.said.some((l) => /no stamina left to take/.test(l)), r3.h.said.find((l) => /stamina/.test(l)));
}

// ================================================================ Stun Resist
{
  const plain = actorOf({ id: 'p' });
  const steady = actorOf({ id: 's', bonuses: { stunResist: 0.5 } });
  const c = createCombat({ rng: rolls() });
  const e1 = c.applyStatus(plain, 'stun', { seconds: 4 }, 1000);
  const e2 = c.applyStatus(steady, 'stun', { seconds: 4 }, 1000);
  check('a 4 s stun is 4 s with no Steadfast', e1.until - 1000 === 4000, `${(e1.until - 1000) / 1000} s`);
  check('and 2 s at 50% Stun Resist', e2.until - 1000 === 2000, `${(e2.until - 1000) / 1000} s`);

  const immune = actorOf({ id: 'i', bonuses: { stunResist: 4 } });
  const e3 = c.applyStatus(immune, 'stun', { seconds: 4 }, 1000);
  check('and four pieces of Steadfast still leave a tenth of it, never nothing',
    Math.abs((e3.until - 1000) - 4000 * (1 - STUN_RESIST_CAP)) < 1e-6 && STUN_RESIST_CAP === 0.9, `${Math.round(e3.until - 1000)} ms of 4000`);

  // and it is a STUN and not a root: a freeze is not shrugged off
  const frosty = actorOf({ id: 'f', bonuses: { stunResist: 0.5 } });
  const e4 = c.applyStatus(frosty, 'root', { seconds: 1.5 }, 1000);
  check('Stun Resist does not shorten a freeze, which is a root', e4.until - 1000 === 1500, `${e4.until - 1000} ms`);

  const said = hudSpy();
  const c2 = createCombat({ rng: rolls(), hud: said });
  c2.applyStatus(actorOf({ id: 'pl', kind: 'player', bonuses: { stunResist: 0.5 } }), 'stun', { seconds: 4 }, 0);
  check('and the player is told the stun was cut', said.said.some((l) => /2.0 s instead of 4.0/.test(l)), said.said[0]);
}

// ============================================================== Parry, folded
{
  // combat_rules.parryChance reads a shield and nothing else, so the affix is
  // folded into bonuses.defence. The measurement is on the hit chance itself.
  const attacker = actorOf({ id: 'a' });
  const bare = actorOf({ id: 'bare' });
  const guarded = actorOf({ id: 'g', bonuses: { parry: 0.10 } });
  const hc1 = hitChance(attacker, bare);
  const hc2 = hitChance(attacker, { ...guarded, bonuses: { defence: 0.10 * PARRY_DEFENCE_POINTS } });
  check('one point of parry is worth 100 points of defence', PARRY_DEFENCE_POINTS === 100, `${PARRY_DEFENCE_POINTS}`);
  check('a 10% Parry affix takes 5 points off the hit chance, a tenth of the even fight the resolver is built around',
    Math.abs((hc1 - hc2) - 0.05) < 1e-9, `${hc1} bare, ${hc2} guarded`);

  // and through the real resolver: the roll that lands on the bare defender
  // misses the guarded one
  const r1 = swing(actorOf({ id: 'a1' }), actorOf({ id: 'b1' }), { rng: rolls(0.60, 0.5) });
  check('a roll of 0.60 lands on a bare defender at 0.625', r1.f.seen.some((s) => /^\d+$/.test(s.text)),
    r1.f.seen.map((s) => s.text).join(','));
  const g2 = actorOf({ id: 'b2', bonuses: { parry: 0.10 } });
  const r2 = swing(actorOf({ id: 'a2' }), g2, { rng: rolls(0.60, 0.5) });
  check('and the same roll misses a defender wearing 10% Parry', g2.health === 100 && r2.f.seen.some((s) => s.text === 'miss'),
    r2.f.seen.map((s) => s.text).join(','));
  check('and the bonus never stuck to the real defender', !g2.bonuses.defence);
}

// ================================================ freezing a monster stops it
//
// The real rat, out of the real roster, driven through the real stepMonster
// with the real speedOf, for 60 frames at 60 Hz.
{
  const player = { pos: { x: 0, y: 0, z: 0 }, health: 100, kind: 'player' };
  const flat = () => 0;
  const ratAt = (z) => {
    const m = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z }, key: 'r' });
    m.ai.state = 'chase'; m.ai.target = player; m.ai.home = { x: 0, z };
    return m;
  };
  const run = (m, frames = 60) => {
    for (let f = 0; f < frames; f++) stepMonster(m, 1 / 60, { player, now: f * (1000 / 60), heightAt: flat, reach: 2.4 });
    return Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
  };

  const free = ratAt(20);
  const closedFree = 20 - run(free);
  check('a free rat closes on the player in 60 frames', closedFree > 0.5, `${closedFree.toFixed(2)} m in one second`);

  // frozen: the real applyStatus writes the root, the real speedOf reads it
  const c = createCombat({ rng: rolls() });
  const frozen = ratAt(20);
  c.applyStatus(frozen, 'root', { seconds: 4 }, 0);
  c.applyStatus(frozen, 'slow', { seconds: 4, factor: 0.30, level: 30 }, 0);
  check('speedOf says a rooted rat may not move at all', speedOf(frozen, 0) === 0, `${speedOf(frozen, 0)} m/s`);
  const startZ = frozen.pos.z;
  const closedFrozen = 20 - run(frozen);
  check('and 60 frames of stepping move it not one millimetre',
    closedFrozen === 0 && frozen.pos.z === startZ && frozen.pos.x === 0,
    `${closedFrozen.toFixed(6)} m closed`);

  // and it thaws: the same rat, once the root has run out, walks again
  for (let f = 0; f < 60; f++) stepMonster(frozen, 1 / 60, { player, now: 5000 + f * (1000 / 60), heightAt: flat, reach: 2.4 });
  check('and when the freeze runs out it walks again', 20 - Math.hypot(frozen.pos.x, frozen.pos.z) > 0.3,
    `${(20 - Math.hypot(frozen.pos.x, frozen.pos.z)).toFixed(2)} m`);

  // slowed: 70% of the distance, because a 30% slow is a 30% slow
  const slowed = ratAt(20);
  c.applyStatus(slowed, 'slow', { seconds: 10, factor: 0.30, level: 30 }, 0);
  check('a slowed rat runs at 70% of its speed', Math.abs(speedOf(slowed, 0) - slowed.run * 0.7) < 1e-9,
    `${speedOf(slowed, 0).toFixed(3)} against ${slowed.run}`);
  const control = ratAt(20);
  const closedSlow = 20 - run(slowed);
  const closedCtl = 20 - run(control);
  check('and it closes 70% of the ground the free one does',
    Math.abs(closedSlow / closedCtl - 0.7) < 0.01, `${closedSlow.toFixed(3)} against ${closedCtl.toFixed(3)}, ratio ${(closedSlow / closedCtl).toFixed(4)}`);

  // the factor is really carried: without one the runtime falls back to 30%
  const bare = ratAt(20);
  c.applyStatus(bare, 'slow', { seconds: 10 }, 0);
  check('a slow with no factor falls back to monsters.js SLOW_DEFAULT',
    Math.abs(speedOf(bare, 0) - bare.run * (1 - SLOW_DEFAULT)) < 1e-9);
  const hard = ratAt(20);
  c.applyStatus(hard, 'slow', { seconds: 10, factor: 0.60, level: 60 }, 0);
  check('and a 60% slow really is 60%, not the default',
    Math.abs(speedOf(hard, 0) - hard.run * 0.4) < 1e-9, `${speedOf(hard, 0).toFixed(3)} of ${hard.run}`);

  // a stun stops it too, and stunResist is the thing that shortens it
  const stunned = ratAt(20);
  c.applyStatus(stunned, 'stun', { seconds: 1 }, 0);
  check('a stunned rat does not move either', speedOf(stunned, 0) === 0);
}

// ============================================ end to end: a freezing longsword
{
  // The whole path, from a rolled affix on a real weapon to a rat that cannot
  // reach the player. This is the check that would have caught the bug.
  const player = actorOf({
    id: 'p', kind: 'player', name: 'you',
    bonuses: { hitFrost: 1 }, skills: { wrestling: 80, tactics: 0, anatomy: 0, parrying: 0, magery: 100 },
  });
  const rat = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 1.2 }, key: 'r2' });
  rat.ai.state = 'chase'; rat.ai.target = player; rat.health = 500; rat.maxHealth = 500;
  const f = floatersSpy(), h = hudSpy();
  const c = createCombat({ rng: rolls(0, 0.5), floaters: f, hud: h });
  const bursts = [];
  c.onHit((info) => bursts.push(info));
  c.queueSwing(player, rat, { now: 0 });
  c.update(0, SWING_LAND_S * 1000);

  check('the swing landed and the frost came with it', rat.health < 500 && !!rat.status.root && !!rat.status.slow);
  check('onHit handed main.js a colour to burst in', bursts.length === 1 && bursts[0].colour === TYPE_COLOURS.cold,
    bursts.map((b) => `${b.kind} ${cssColour(b.colour)}`).join(', '));
  check('the player saw the word', f.seen.some((s) => s.text === 'frozen'));
  check('and read the line', h.said.some((l) => /Frost catches the Giant Rat and holds it there/.test(l)), h.said[0]);

  // and now it cannot come at him
  const before = Math.hypot(rat.pos.x - player.pos.x, rat.pos.z - player.pos.z);
  for (let i = 0; i < 60; i++) {
    const now = SWING_LAND_S * 1000 + i * (1000 / 60);
    stepMonster(rat, 1 / 60, { player, now, heightAt: () => 0, reach: 2.4 });
  }
  const after = Math.hypot(rat.pos.x - player.pos.x, rat.pos.z - player.pos.z);
  check('a frozen rat holds exactly where it stood', Math.abs(after - before) < 1e-9, `${before.toFixed(4)} m then ${after.toFixed(4)} m`);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
