// The bar, measured. Run: node src/game/abilities_runtime.test.mjs
//
// Nothing here is asserted from the shape of the code. Every claim is a number
// the runtime produced with fake combat, fake monsters and a seeded rng, and
// every gate is driven both ways: Power Strike refused at 5.9 s AND allowed at
// 6.0, three monsters inside Whirlwind's radius AND one 10 cm outside it, a
// rooted cast broken by moving AND a moving cast that survives it.

import {
  createAbilities, auditEffectHandlers, EFFECT_HANDLERS, BAR_KEYS, BAR_SLOTS,
  slotForKey, leapArc, MOVING_SPEED, saySeconds, PENDING_SECONDS,
  CAST_BURDEN_FIZZLE, BURDEN_MARK, burdenBand, burdenText, burdenedCastTime,
  stealthHoldChance, STEALTH_STEP_S,
  fizzleChance, andList,
} from './abilities_runtime.js';
import { castBurdenOf } from './actor.js';
import { createTargeting } from './targeting.js';
import {
  ABILITIES, ABILITIES_BY_ID, EFFECT_KINDS, canUse, unlockedFor, weaponNeeds, weaponCheck,
  burdensInArmour, ABILITY_FOR_ITEM, itemsHeld, COST_ITEM_BASES,
} from '../mmo/abilities.js';
import { OPENINGS } from '../mmo/openings.js';
import { planCharacter } from './creation.js';
import { settlerKitFor } from './app/systems/inventory.js';
import { makeItem, ARMOR_PIECES } from '../mmo/items.js';
import { RECIPES } from '../mmo/recipes.js';
import { createProgression } from './progression.js';
import { resolveMelee, JUMP_ATTACK_MULT } from '../mmo/combat_rules.js';
import { GRAVITY, JUMP_V0 } from './player.js';

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// a seeded generator, so a run is a run and not a coin toss
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// --- the fakes ----------------------------------------------------------------
const mob = (name, x, z, extra = {}) => ({
  id: name, name, kind: 'humanoid', tier: 2, faction: 'hostile',
  pos: { x, y: 0, z }, yaw: 0, health: 100, maxHealth: 100, buffs: [], status: {}, ...extra,
});

function harness(opts = {}) {
  const hudLines = [];
  const hud = { log: (t, k) => { hudLines.push({ t, k }); return t; }, toast: (t, k) => hudLines.push({ t, k }) };
  const combat = {
    swings: [], spells: [],
    queueSwing(a, d, o) { combat.swings.push({ attacker: a, defender: d, opts: o || {} }); },
    queueSpell(c, s, t, o) { combat.spells.push({ caster: c, spell: s, target: t, opts: o || {} }); },
  };
  const list = opts.monsters || [];
  const monsters = {
    targets: () => list,
    nearestHostile: null,        // let the pure cone answer, so one path is tested
    pushed: [],
    push(m, x, z) { monsters.pushed.push({ m, x, z }); m.pos.x = x; m.pos.z = z; },
    dropAggro() { monsters.dropped = (monsters.dropped || 0) + 1; },
  };
  const effects = {
    calls: [],
    colourFor: () => 0xffffff,
    bolt: (from, to, c, o) => { effects.calls.push('bolt'); o?.onArrive?.(); },
    burst: () => effects.calls.push('burst'),
    ring: () => effects.calls.push('ring'),
    column: () => effects.calls.push('column'),
    showGroundRing: () => effects.calls.push('groundRing'),
    hideGroundRing: () => {},
    cast: () => effects.calls.push('cast'),
    stopCast: () => effects.calls.push('stopCast'),
    swing: () => effects.calls.push('swing'),
    handPos: () => ({ x: 0, y: 1.3, z: 0 }),
  };
  const floaters = { spawned: [], spawn: (p, t, k) => floaters.spawned.push({ t, k }) };
  const audio = { played: [], play: (c) => audio.played.push(c) };
  const player = {
    speed: 0, yaw: 0, airborne: false,
    pos: { x: 0, y: 0, z: 0 },
    state: { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, peakY: 0 },
    parts: {},
    teleport(x, z) { player.pos.x = x; player.pos.z = z; player.state.x = x; player.state.z = z; },
  };
  const skills = {};
  for (const k of ['swordsmanship', 'macefighting', 'fencing', 'polearms', 'wrestling', 'tactics', 'parrying',
    'anatomy', 'archery', 'marksmanship', 'tracking', 'magery', 'evaluatingIntelligence', 'meditation',
    'resistingSpells', 'necromancy', 'spiritSpeak', 'chivalry', 'mysticism', 'inscription', 'healing',
    'veterinary', 'poisoning', 'musicianship', 'provocation', 'peacemaking', 'discordance', 'alchemy',
    'stealth', 'hiding', 'lockpicking', 'stealing', 'animalLore', 'tinkering', 'camping', 'focus']) skills[k] = 100;
  const character = {
    skills, stats: { str: 100, dex: 100, int: 100, con: 100, wis: 100 },
    bar: opts.bar || [], items: { bandage: 10, poisonVial: 5, wood: 10, ...(opts.items || {}) },
  };
  const actor = {
    id: 'player', name: 'You', faction: 'player',
    pos: player.pos, health: 200, maxHealth: 200, mana: 200, maxMana: 200,
    stamina: 200, maxStamina: 200, buffs: [], status: {}, shield: { parryFactor: 1 },
    weapon: { skill: 'swordsmanship' },
  };
  // C1: a paper doll, when the test is about what the armour does. Setting it
  // turns the weapon check on for this harness, so anything cast here holds a
  // wand; `actor.castBurden` is written the way actor.js's recompute writes it.
  if (opts.equipment) {
    character.equipment = opts.equipment;
    character.pack = opts.pack || [];
    if (opts.burdenFromActor !== false) actor.castBurden = castBurdenOf(opts.equipment);
  }
  const summoned = [];
  const abilities = createAbilities({
    character, actor, combat, monsters, effects, floaters, hud, audio, player,
    rng: seeded(opts.seed ?? 7),
    summon: (id, at, meta) => { summoned.push({ id, at, meta }); return { id }; },
    allies: () => [actor, ...(opts.allies || [])],
    heightAt: () => 0,
    resurrect: () => true,
    ...(opts.extra || {}),
  });
  return { abilities, hud, hudLines, combat, monsters, effects, floaters, audio, player, character, actor, summoned, list };
}
const said = (h) => h.hudLines.map((l) => l.t).join(' | ');

// --- the table cannot drift ----------------------------------------------------
console.log('abilities_runtime: the effect table');
ck('every effect kind abilities.js declares has a handler',
  EFFECT_KINDS.every((k) => typeof EFFECT_HANDLERS[k] === 'function'),
  EFFECT_KINDS.filter((k) => !EFFECT_HANDLERS[k]).join(',') || 'none missing');
ck('and no handler answers a kind that does not exist',
  Object.keys(EFFECT_HANDLERS).every((k) => EFFECT_KINDS.includes(k)),
  Object.keys(EFFECT_HANDLERS).filter((k) => !EFFECT_KINDS.includes(k)).join(',') || 'none spare');
ck(`all ${EFFECT_KINDS.length} kinds, counted`, Object.keys(EFFECT_HANDLERS).length === EFFECT_KINDS.length,
  `${Object.keys(EFFECT_HANDLERS).length} handlers for ${EFFECT_KINDS.length} kinds`);
ck('the audit throws when a kind loses its handler', (() => {
  try { auditEffectHandlers([...EFFECT_KINDS, 'newSortOfThing'], EFFECT_HANDLERS); return false; }
  catch (e) { return /newSortOfThing/.test(e.message); }
})());
ck('and when a handler answers nothing', (() => {
  try { auditEffectHandlers(EFFECT_KINDS, { ...EFFECT_HANDLERS, ghost: () => {} }); return false; }
  catch (e) { return /ghost/.test(e.message); }
})());

// --- the keys ------------------------------------------------------------------
console.log('abilities_runtime: key to slot');
ck('twelve slots and twelve keys', BAR_SLOTS === 12 && BAR_KEYS.length === 12);
ck('key 1 is slot 0', slotForKey('1') === 0);
ck('key 0 is slot 9, not slot 0', slotForKey('0') === 9);
ck('minus is slot 10', slotForKey('-') === 10);
ck('equals is slot 11', slotForKey('=') === 11);
ck('a key that is not on the bar is no slot at all', slotForKey('q') === -1 && slotForKey('escape') === -1);
{
  // and the real path: a fake input that reports a press drives use()
  const h = harness({ bar: Array(12).fill(null), monsters: [mob('Skeleton', 0, 1.5)] });
  h.character.bar[0] = 'powerStrike';
  h.character.bar[11] = 'lightning';
  const pressed = new Set(['=']);
  const abilities = createAbilities({
    ...{ character: h.character, actor: h.actor, combat: h.combat, monsters: h.monsters, effects: h.effects,
      floaters: h.floaters, hud: h.hud, audio: h.audio, player: h.player },
    input: { pressed: (k) => pressed.has(k) },
    rng: seeded(3), heightAt: () => 0,
  });
  abilities.update(0.016, 0);
  ck('pressing equals casts what is in slot 12, not slot 1',
    h.combat.spells.length === 1 && h.combat.spells[0].spell.id === 'lightning',
    h.combat.spells.map((s) => s.spell.id).join(',') || 'nothing queued');
  pressed.clear(); pressed.add('1');
  abilities.update(0.016, 1);
  ck('and pressing 1 swings what is in slot 1',
    h.combat.swings.length === 1 && h.combat.swings[0].opts.abilityId === 'powerStrike',
    h.combat.swings.map((s) => s.opts.abilityId).join(','));
}

// --- Power Strike, on the clock -------------------------------------------------
console.log('abilities_runtime: cooldowns, to the tenth of a second');
{
  const skeleton = mob('Skeleton', 0, 1.5);
  const h = harness({ bar: ['powerStrike'], monsters: [skeleton] });
  const first = h.abilities.use(0, 0);
  ck('Power Strike goes off at 0 s', first.ok === true, said(h));
  ck('and it queued one swing at 160%',
    h.combat.swings.length === 1 && h.combat.swings[0].opts.multiplier === 1.6,
    `${h.combat.swings.length} swing(s) at ${h.combat.swings[0]?.opts.multiplier}`);
  ck('and the stamina came off the pool the moment it started',
    h.actor.stamina === 185, `${h.actor.stamina} of 200 after a 15 stamina ability`);
  ck('the cooldown reads 6 s straight after', near(h.abilities.cooldownLeft('powerStrike', 0), 6),
    `${h.abilities.cooldownLeft('powerStrike', 0)} s`);

  const at59 = h.abilities.use(0, 5.9);
  ck('at 5.9 s it is refused', at59.ok === false, at59.reason);
  ck('and the refusal says how long is left, in words',
    /cooldown for 0\.1 s/.test(at59.reason), at59.reason);
  ck('and it queued no second swing', h.combat.swings.length === 1, `${h.combat.swings.length} swings`);
  ck('and nothing more was spent', h.actor.stamina === 185, String(h.actor.stamina));
  ck('and the player was told, out loud', /cooldown/.test(said(h)));
  ck('and a refusal makes the denied sound', h.audio.played.includes('denied'), h.audio.played.join(','));

  const at60 = h.abilities.use(0, 6.0);
  ck('at 6.0 s it goes off again', at60.ok === true, at60.reason || 'used');
  ck('and now there are two swings', h.combat.swings.length === 2, `${h.combat.swings.length} swings`);
  ck('and 30 stamina is gone in total', h.actor.stamina === 170, String(h.actor.stamina));
  ck('the sweep reads 0 exactly when it comes back',
    h.abilities.cooldownLeft('powerStrike', 12) === 0 && near(h.abilities.cooldownLeft('powerStrike', 9), 3),
    `at 9 s: ${h.abilities.cooldownLeft('powerStrike', 9)} left`);
}

// --- the other refusals ----------------------------------------------------------
console.log('abilities_runtime: every refusal says why');
{
  const h = harness({ bar: ['powerStrike', 'fireball', 'whirlwind', null], monsters: [mob('Skeleton', 0, 1.5)] });
  h.actor.stamina = 4;
  const r = h.abilities.use(0, 0);
  ck('too little stamina is refused with the numbers',
    r.ok === false && /costs 15 stamina and you have 4/.test(r.reason), r.reason);
  h.actor.stamina = 200; h.actor.mana = 2;
  const m = h.abilities.use(1, 0);
  ck('too little mana likewise', m.ok === false && /costs 9 mana and you have 2/.test(m.reason), m.reason);
  h.actor.mana = 200;
  h.player.speed = 6;
  const w = h.abilities.use(2, 0);
  ck('a rooted ability while moving is refused, and says to stand still',
    w.ok === false && /roots you; stand still/.test(w.reason), w.reason);
  h.player.speed = 0;
  const e = h.abilities.use(3, 0);
  ck('an empty slot says it is empty and names the key',
    e.ok === false && /Slot 4 is empty/.test(said(h)), said(h).split('|').pop().trim());
  const bad = h.abilities.use(99, 0);
  ck('a slot that does not exist is refused rather than crashing', bad.ok === false, bad.reason);
}
{
  // Nobody within reach and nobody chosen is not a refusal any more: it is a
  // question, and the spell waits on the cursor for the answer. The refusal
  // with a distance in it is the CHOSEN target out of reach, below.
  const h = harness({ bar: ['lightning'], monsters: [mob('Skeleton', 0, 40)] });
  const r = h.abilities.use(0, 0);
  ck('a spell with nobody in reach asks who it is for rather than refusing',
    r.ok === false && r.pending === true && /choose a target/i.test(r.reason), r.reason);
  ck('and no mana was taken for a spell that never left the hand', h.actor.mana === 200, String(h.actor.mana));
}
{
  const h = harness({ bar: ['shieldBash'], monsters: [mob('Skeleton', 0, 1.5)] });
  h.actor.shield = null;
  const r = h.abilities.use(0, 0);
  ck('Shield Bash without a shield says so', r.ok === false && /needs a shield/.test(r.reason), r.reason);
}
{
  const h = harness({ bar: ['riposte'] });
  const r = h.abilities.use(0, 0);
  ck('a passive is refused with "always on" rather than fired',
    r.ok === false && /always on/.test(r.reason), r.reason);
}
{
  const low = harness({ bar: ['meteor'] });
  low.character.skills.magery = 40;
  const r = low.abilities.use(0, 0);
  ck('an ability you have not earned says what it needs',
    r.ok === false && /needs Magery 85/.test(r.reason), r.reason);
}

// --- the spell held on the cursor -------------------------------------------------
//
// "If a target is selected the spell casts at it, unless it is an area of
// effect spell. If the target is not selected I should have some sort of
// cursor to indicate who to select as my target for my precast spell."
//
// Every one of those clauses is driven here, and each is driven the other way
// as well: a spell that waits AND four kinds that never do, a click that casts
// AND a click that cannot, a cancel by key AND a cancel by clock.
console.log('\nabilities_runtime: a spell with nobody to hit waits on the cursor');

/** A fake keyboard, so Escape can be pressed for exactly one frame. */
function keyboard() {
  let key = null;
  return { press(k) { key = k; }, release() { key = null; }, pressed: (k) => k === key, down: () => false };
}

// WHAT CHANGED HERE, and why every block below moved its skeleton.
//
// A spell now falls back to the nearest hostile ANYWHERE inside its own reach
// before it holds on the cursor, because a wolf chewing your left elbow is not
// in the cone in front of you and is certainly what the Fireball was for.
// Holding a spell is therefore what happens when there is nothing in reach AT
// ALL, so these blocks put the only skeleton forty metres off, outside
// Fireball's twenty, and click one that is close when a click is the point.
// The fallback itself is driven both ways at the end of this section.
{
  const behind = mob('Skeleton', 0, -3);
  const h = harness({ bar: ['fireball'], monsters: [mob('Distant Skeleton', 0, 40)] });
  const mana0 = h.actor.mana;
  const r = h.abilities.use(0, 0);
  ck('with nobody in front, Fireball waits instead of refusing',
    r.pending === true && !!h.abilities.pending, r.reason);
  ck('and the held spell says which one it is and which key held it',
    h.abilities.pending.ability.id === 'fireball' && h.abilities.pending.slot === 0 && h.abilities.pending.startedAt === 0,
    JSON.stringify({ id: h.abilities.pending.ability.id, slot: h.abilities.pending.slot, at: h.abilities.pending.startedAt }));
  ck('it asks the player who it is for, by name', /Choose a target for Fireball/.test(said(h)), said(h).split('|').pop().trim());
  ck('NOT ONE POINT OF MANA WAS PAID to hold it', h.actor.mana === mana0, `${h.actor.mana} of ${mana0}`);
  ck('and no cooldown was started either', h.abilities.cooldownLeft('fireball', 0) === 0);
  ck('the cursor becomes a crosshair', h.abilities.cursor === 'crosshair', `"${h.abilities.cursor}"`);

  // the click that answers the question
  const out = h.abilities.onTargetPicked(behind, 0.5);
  ck('a click on the skeleton casts it at once', out.ok === true, out.reason || 'cast');
  ck('and NOW the mana is paid, once', h.actor.mana === mana0 - 9, `${h.actor.mana} of ${mana0}`);
  ck('the cooldown started at the moment of the click, not of the press',
    h.abilities.cooldownLeft('fireball', 0.5) === 3, `${h.abilities.cooldownLeft('fireball', 0.5)} s left`);
  ck('the spell is no longer waiting', h.abilities.pending === null);
  ck('and the cursor goes back to whatever the world says', h.abilities.cursor === '', `"${h.abilities.cursor}"`);
  ck('the player turned to face what he threw it at',
    Math.abs(h.player.state.yaw - Math.PI) < 1e-9, `yaw ${h.player.state.yaw.toFixed(4)} for a target at due south`);
  h.abilities.update(0.6, 1.1);
  ck('and the spell really lands on the one that was clicked',
    h.combat.spells.length > 0 && h.combat.spells.every((s) => s.target === behind), `${h.combat.spells.length} spells`);
}
{
  const kb = keyboard();
  const h = harness({ bar: ['fireball'], monsters: [mob('Skeleton', 0, 40)], extra: { input: kb } });
  const mana0 = h.actor.mana;
  h.abilities.use(0, 0);
  h.abilities.update(0.1, 0.1);
  ck('a quiet frame with no key pressed does not put it down', !!h.abilities.pending);
  kb.press('escape');
  h.abilities.update(0.1, 0.1);
  ck('Escape puts the spell down', h.abilities.pending === null);
  ck('and says so rather than going quiet', /no longer waiting for a target/.test(said(h)), said(h).split('|').pop().trim());
  ck('and there is nothing to refund, because nothing was paid',
    h.actor.mana === mana0 && h.actor.stamina === 200, `${h.actor.mana} mana, ${h.actor.stamina} stamina`);
  kb.release();
}
{
  const h = harness({ bar: ['fireball'], monsters: [mob('Skeleton', 0, 40)] });
  h.abilities.use(0, 0);
  h.abilities.update(0.1, PENDING_SECONDS - 0.001);
  ck(`at ${PENDING_SECONDS - 0.001} s it is still waiting`, !!h.abilities.pending, 'held');
  h.abilities.update(0.1, PENDING_SECONDS);
  ck(`and at exactly ${PENDING_SECONDS} s it lapses`, h.abilities.pending === null);
  ck('saying how long it waited', /6 seconds/.test(said(h)), said(h).split('|').pop().trim());
}
{
  const h = harness({ bar: ['fireball', 'lightning'], monsters: [mob('Skeleton', 0, 40)] });
  h.abilities.use(0, 0);
  h.abilities.use(1, 0.2);
  ck('reaching for another ability puts the first one down, by name',
    /Fireball is no longer waiting for a target: you reached for Lightning instead/.test(said(h)),
    said(h).split('|').filter((s) => /no longer waiting/.test(s))[0] || 'nothing said');
  ck('and the second one is the one now waiting', h.abilities.pending?.ability.id === 'lightning',
    h.abilities.pending?.ability.id || 'none');
}
{
  const h = harness({ bar: ['fireball'], monsters: [mob('Skeleton', 0, 40)] });
  h.abilities.use(0, 0);
  const r = h.abilities.use(0, 0.2);
  ck('pressing the same key again puts it down rather than picking it back up',
    r.cancelled === true && h.abilities.pending === null && /you pressed it again/.test(said(h)),
    said(h).split('|').pop().trim());
  ck('and that costs nothing either', h.actor.mana === 200, `${h.actor.mana}`);
}
{
  const h = harness({ bar: ['fireball'], monsters: [mob('Skeleton', 0, 40)] });
  h.abilities.use(0, 0);
  const r = h.abilities.onTargetPicked(null, 0.3);
  ck('a click on bare ground puts it down and says so',
    r.ok === false && h.abilities.pending === null && /clicked bare ground/.test(said(h)), r.reason);
}
{
  const h = harness({ bar: ['fireball'], monsters: [mob('Skeleton', 0, 40)] });
  const mana0 = h.actor.mana;
  h.abilities.use(0, 0);
  const far = mob('Far Skeleton', 0, 40);
  const r = h.abilities.onTargetPicked(far, 0.3);
  ck('clicking one 40 m off, with a 20 m spell, says the distance and the reach',
    r.ok === false && r.outOfRange === true && /40\.0 m away and the reach is 20 m/.test(said(h)),
    said(h).split('|').pop().trim());
  ck('and it costs nothing', h.actor.mana === mana0, `${h.actor.mana}`);
}
{
  const dead = mob('Bones', 0, -3, { health: 0 });
  const h = harness({ bar: ['fireball'], monsters: [dead] });
  h.abilities.use(0, 0);
  const r = h.abilities.onTargetPicked(dead, 0.3);
  ck('clicking a corpse is not a target for Fireball, and it says which corpse',
    r.ok === false && /Bones is not something Fireball can be aimed at/.test(said(h)), said(h).split('|').pop().trim());
}

// --- the fallback: anything in reach beats a crosshair ------------------------
console.log('\nabilities_runtime: a hostile in reach is who you meant, cone or no cone');
{
  // Directly BEHIND, three metres: out of the 120 degree cone, well inside
  // Fireball's twenty. This is the press that used to park a crosshair on the
  // screen and then let go of it six seconds later having done nothing.
  const behind = mob('Skeleton', 0, -3);
  const h = harness({ bar: ['fireball'], monsters: [behind] });
  const r = h.abilities.use(0, 0);
  ck('a hostile behind you is cast at rather than held on the cursor',
    r.ok === true && h.abilities.pending === null, r.reason || 'cast');
  ck('and the choice is said out loud, by name',
    /Fireball goes to the Skeleton: it is what is in reach/.test(said(h)),
    said(h).split('|').filter((x) => /goes to the/.test(x))[0] || 'nothing said');
  h.abilities.update(0.7, 0.7);
  ck('and it lands on that one', h.combat.spells.length === 1 && h.combat.spells[0].target === behind,
    `${h.combat.spells.length} spell(s)`);
}
{
  // The other way: one metre PAST the reach, so the fallback must not take it.
  const outside = mob('Skeleton', 0, -21);
  const h = harness({ bar: ['fireball'], monsters: [outside] });
  const r = h.abilities.use(0, 0);
  ck('a hostile 21 m off, with a 20 m spell, is NOT taken and the spell waits',
    r.pending === true && h.abilities.pending?.ability.id === 'fireball', r.reason);
  ck('and nothing was paid to find that out', h.actor.mana === 200, String(h.actor.mana));
}
{
  // A ground ability lands on what you are fighting, not eight metres ahead.
  const near = mob('Skeleton', 0, 2);
  const h = harness({ bar: ['volley'], monsters: [near], equipment: { ranged: { base: 'shortbow' } }, pack: [{ base: 'arrow', count: 20 }] });
  h.abilities.use(0, 0);
  h.abilities.update(1.6, 1.6);
  ck('Volley with nobody chosen falls on the nearest, not on empty grass',
    h.combat.swings.length > 0 && h.combat.swings.every((x) => x.defender === near),
    `${h.combat.swings.length} swing(s): ${said(h).split('|').pop().trim()}`);
}
{
  // A ground ability aimed at a body follows the body. Pressed with the cursor
  // on a bandit 8 m off, Volley used to rain where the bandit HAD been; at 6 m
  // a second it was five metres past the ring by the time the arrows fell, and
  // the player read "Volley finds nothing inside 5 m" (2026-09-08).
  const runner = mob('Bandit', 0, 8);
  const h = harness({ bar: ['volley'], monsters: [runner], equipment: { ranged: { base: 'shortbow' } }, pack: [{ base: 'arrow', count: 20 }] });
  const r = h.abilities.use(0, 0);
  ck('Volley at a bandit in reach starts its cast', r.ok === true && r.casting === true, r.reason || 'cast');
  // he charges: 0.4 s in he is at 5.6 m, at the release 3.2 m, and at the fall 1 m
  h.abilities.update(0.4, 0.4); runner.pos.z = 5.6;
  h.abilities.update(0.4, 0.8); runner.pos.z = 3.2;
  h.abilities.update(0.4, 1.2); runner.pos.z = 1.0;
  h.abilities.update(0.6, 1.8);
  ck('the rain comes down on the bandit where he is now, not where he was',
    h.combat.swings.length > 0 && h.combat.swings.every((x) => x.defender === runner),
    `${h.combat.swings.length} swing(s): ${said(h).split('|').pop().trim()}`);
  ck('and the line says so', /caught within/.test(said(h)) && !/finds nothing/.test(said(h)), said(h).split('|').pop().trim());
}
{
  // and a Meteor follows through its fall
  const runner = mob('Bandit', 0, 6);
  const h = harness({ bar: ['meteor'], monsters: [runner] });
  h.abilities.use(0, 0);
  h.abilities.update(1.6, 1.6); runner.pos.z = 1.5; runner.pos.x = 4;   // moved 5 m during the cast
  h.abilities.update(1.6, 3.2);                                         // the 1.5 s fall
  ck('Meteor lands on the bandit who walked out of the ring', /caught within/.test(said(h)) && !/caught nobody|finds nothing/.test(said(h)), said(h).split('|').filter((x) => /Meteor lands/.test(x)).pop() || said(h).split('|').pop().trim());
}

console.log('abilities_runtime: and the four kinds that never wait');
{
  // a chosen target in reach casts at once, exactly as before
  const near = mob('Skeleton', 0, 4);
  const h = harness({ bar: ['fireball'], monsters: [near] });
  const r = h.abilities.use(0, 0);
  ck('a target already in front casts straight away and holds nothing',
    r.ok === true && h.abilities.pending === null, r.reason || 'cast');
  ck('and the cursor is not a crosshair', h.abilities.cursor === '', `"${h.abilities.cursor}"`);
}
{
  // the chosen target, out of reach: a distance to walk, not a question
  const far = mob('Skeleton', 0, 40);
  const targeting = createTargeting(null, null, { targets: () => [far] }, {
    self: null, pos: () => ({ x: 0, y: 0, z: 0 }), yaw: () => 0,
  });
  targeting.set(far);
  const h = harness({ bar: ['fireball'], monsters: [far], extra: { targeting } });
  const r = h.abilities.use(0, 0);
  ck('a CHOSEN target 40 m off refuses with the distance and does not wait',
    r.ok === false && r.outOfRange === true && h.abilities.pending === null && /40\.0 m away and the reach is 20 m/.test(r.reason),
    r.reason);
  ck('and it tells the player to walk closer', /Walk closer/.test(said(h)), said(h).split('|').pop().trim());
  ck('and takes no mana for it', h.actor.mana === 200, `${h.actor.mana}`);
}
{
  const h = harness({ bar: ['meteor'] });                       // target ground, effect aoe
  const r = h.abilities.use(0, 0);
  ck('an area spell with nobody in sight never waits: it lands where the cursor is',
    r.ok === true && h.abilities.pending === null, r.reason || 'cast');
  ck('and it draws the ground ring instead of a crosshair',
    h.effects.calls.includes('groundRing') && h.abilities.cursor === '', h.effects.calls.join(','));
}
{
  const h = harness({ bar: ['whirlwind'] });                    // target self, effect aoe
  const r = h.abilities.use(0, 0);
  ck('an area swing around you never waits either', r.casting === true && h.abilities.pending === null);
}
{
  const h = harness({ bar: ['battleCry'] });                    // target self, a buff
  const r = h.abilities.use(0, 0);
  ck('a self buff never waits', r.ok === true && h.abilities.pending === null, r.reason || 'used');
}
{
  const h = harness({ bar: ['heal'] });                         // target ally
  const r = h.abilities.use(0, 0);
  ck('an ally spell with nobody chosen heals you rather than waiting',
    r.ok === true && h.abilities.pending === null, r.reason || 'used');
}
{
  const h = harness({ bar: ['powerStrike'] });                  // enemy, but arms a swing
  const r = h.abilities.use(0, 0);
  ck('an armed swing wants nobody in particular and never waits',
    r.ok === true && h.abilities.pending === null, r.reason || 'used');
}
{
  // counted, not guessed: which of the 78 can be held on the cursor
  const waits = ABILITIES.filter((a) => a.target === 'enemy' && !a.effect?.nextSwing);
  const byTarget = {};
  for (const a of ABILITIES) byTarget[a.target] = (byTarget[a.target] || 0) + 1;
  console.log(`     ${waits.length} of ${ABILITIES.length} can wait on the cursor; targets ${JSON.stringify(byTarget)}`);
  let held = 0;
  for (const a of ABILITIES) {
    if (a.passive) continue;
    const h = harness({ bar: [a.id] });                          // an empty world: nobody anywhere
    h.abilities.use(0, 0);
    if (h.abilities.pending) held++;
  }
  ck('pressed in an empty world, exactly the enemy spells that are not armed swings wait',
    held === waits.length, `${held} waited, ${waits.length} expected`);
}
{
  // The facing, driven at four points of the compass. Three of the four are
  // outside the 120 degree cone in front, so they arrive by the held cursor,
  // which is the path a player takes when he turns round to hit something.
  const rows = [[0, 6, 0], [6, 0, Math.PI / 2], [0, -6, Math.PI], [-6, 0, -Math.PI / 2]];
  const wrong = [];
  const byPath = [];
  for (const [x, z, want] of rows) {
    const m = mob('Skeleton', x, z);
    const h = harness({ bar: ['magicArrow'], monsters: [m] });
    const r = h.abilities.use(0, 0);
    byPath.push(r.pending ? 'held' : 'at once');
    if (r.pending) h.abilities.onTargetPicked(m, 0.2);
    const got = h.player.state.yaw;
    if (Math.abs(Math.atan2(Math.sin(got - want), Math.cos(got - want))) > 1e-9) {
      wrong.push(`(${x},${z}) got ${got.toFixed(3)} want ${want.toFixed(3)}`);
    }
  }
  ck('a cast turns the player onto the target, at all four compass points',
    wrong.length === 0, wrong.join(' / ') || `north, east, south, west (${byPath.join(', ')})`);
}
{
  const h = harness({ bar: ['battleCry'] });
  h.player.state.yaw = 1.234;
  h.abilities.use(0, 0);
  ck('and a spell on yourself does not spin you round', h.player.state.yaw === 1.234, String(h.player.state.yaw));
}
{
  const h = harness({ bar: ['fireball'] });
  ck('onTargetPicked with nothing held is null, so main.js may call it every click',
    h.abilities.onTargetPicked(mob('Skeleton', 0, 2), 0) === null);
}

// --- Whirlwind, and the radius it really uses --------------------------------------
console.log('abilities_runtime: Whirlwind hits 3 m and not 3.1');
{
  const inside = [mob('a', 2.9, 0), mob('b', 0, 2.99), mob('c', 2, 2)];
  const outside = mob('d', 3.1, 0);
  const h = harness({ bar: ['whirlwind'], monsters: [...inside, outside] });
  ck('c is inside on the diagonal', Math.hypot(2, 2) < 3, `${Math.hypot(2, 2).toFixed(3)} m`);
  const r = h.abilities.use(0, 0);
  ck('it starts a 0.4 s cast rather than firing at once', r.casting === true && h.combat.swings.length === 0);
  h.abilities.update(0.4, 0.4);
  ck('three inside 3 m are hit', h.combat.swings.length === 3, `${h.combat.swings.length} hit`);
  const hitNames = h.combat.swings.map((s) => s.defender.name).sort().join(',');
  ck('and they are exactly a, b and c', hitNames === 'a,b,c', hitNames);
  ck('the one at 3.1 m is not', !h.combat.swings.some((s) => s.defender === outside));
  ck('each is hit at 80%', h.combat.swings.every((s) => s.opts.multiplier === 0.8),
    h.combat.swings.map((s) => s.opts.multiplier).join(','));
  ck('and the player is told the count', /3 caught within 3 m/.test(said(h)), said(h).split('|').pop().trim());
}
{
  // and the other direction: nothing in reach is a line, not silence
  const h = harness({ bar: ['whirlwind'], monsters: [mob('far', 20, 0)] });
  h.abilities.use(0, 0);
  h.abilities.update(0.4, 0.4);
  ck('a Whirlwind that catches nobody says so out loud',
    /finds nothing inside 3 m/.test(said(h)), said(h).split('|').pop().trim());
  ck('and it still cost the stamina, which is why it has to say so',
    h.actor.stamina === 170, String(h.actor.stamina));
}
{
  // Sweep is an arc, not a circle: the one behind you is spared
  const h = harness({ bar: ['sweep'], monsters: [mob('front', 0, 2), mob('back', 0, -2)] });
  h.abilities.use(0, 0);
  ck('Sweep’s 120 degree arc takes the one in front', h.combat.swings.length === 1
    && h.combat.swings[0].defender.name === 'front', h.combat.swings.map((s) => s.defender.name).join(','));
  ck('and leaves the one behind you standing', !h.combat.swings.some((s) => s.defender.name === 'back'));
  ck('and the knockback landed on what the arc hit, not on nothing',
    h.monsters.pushed.length === 1 && h.monsters.pushed[0].m.name === 'front',
    `${h.monsters.pushed.length} pushed`);
}

// --- casting and interruption --------------------------------------------------------
console.log('abilities_runtime: a rooted cast breaks when you move');
{
  const h = harness({ bar: ['whirlwind'], monsters: [mob('a', 1, 0)] });
  h.abilities.use(0, 0);
  ck('it is casting', !!h.abilities.casting);
  h.player.speed = 0.1;
  h.abilities.update(0.1, 0.1);
  ck('standing at exactly 0.1 m/s is not moving, and the cast holds',
    !!h.abilities.casting, `speed ${h.player.speed}, MOVING_SPEED ${MOVING_SPEED}`);
  h.player.speed = 0.11;
  h.abilities.update(0.1, 0.2);
  ck('a hair over 0.1 m/s breaks it', h.abilities.casting === null, said(h).split('|').pop().trim());
  h.abilities.update(0.2, 0.4);
  ck('and it never fired', h.combat.swings.length === 0, `${h.combat.swings.length} swings`);
  ck('the player is told it broke, and what came back',
    /moving ends Whirlwind/.test(said(h)) && /came back/.test(said(h)), said(h).split('|').slice(-1)[0].trim());
  ck('half the stamina was refunded, so a break stings without robbing you',
    h.actor.stamina === 185, `${h.actor.stamina} of 200 after paying 30 and getting 15 back`);
  ck('and the cooldown still ran, so it is not free to try again',
    h.abilities.cooldownLeft('whirlwind', 0.4) > 0, `${h.abilities.cooldownLeft('whirlwind', 0.4).toFixed(1)} s`);
}
{
  const h = harness({ bar: ['fireball'], monsters: [mob('a', 0, 8)] });
  ck('Fireball is a moving cast, by the pure table', ABILITIES_BY_ID.fireball.rooted === false);
  h.abilities.use(0, 0);
  h.player.speed = 9;                      // sprinting
  h.abilities.update(0.3, 0.3);
  ck('running does NOT break a moving cast', !!h.abilities.casting, 'still casting at 0.3 s at 9 m/s');
  h.abilities.update(0.3, 0.6);
  ck('and it lands on time', h.combat.spells.length === 1 && h.abilities.casting === null,
    `${h.combat.spells.length} spell(s) queued`);
  ck('the spell carries the table’s own numbers to the resolver',
    h.combat.spells[0].spell.base[0] === 18 && h.combat.spells[0].spell.base[1] === 26
    && h.combat.spells[0].spell.damageType === 'fire',
    JSON.stringify(h.combat.spells[0].spell.base) + ' ' + h.combat.spells[0].spell.damageType);
}

console.log('abilities_runtime: damage interrupts, over and under a tenth');
{
  const h = harness({ bar: ['whirlwind'], monsters: [mob('a', 1, 0)] });
  h.abilities.use(0, 0);
  const small = h.abilities.onDamaged(20, 0.1);          // 10% of 200 exactly
  ck('exactly a tenth of your health does not break it',
    small.interrupted === false && !!h.abilities.casting, small.reason);
  const big = h.abilities.onDamaged(21, 0.2);            // 10.5%
  ck('over a tenth is a roll, and the chance is the one Focus buys you',
    big.chance > 0 && near(big.chance, 1 - 100 / 125),
    `${big.chance.toFixed(3)} at Focus 100, which is the floor abilities.js sets`);
  ck('on this seed Focus held it, and the player was told that in words',
    big.interrupted === false && !!h.abilities.casting && /Focus held Whirlwind/.test(said(h)),
    said(h).split('|').pop().trim());
}
// SK2. Focus is the only rule that reads the Focus skill, and until now the
// skill had no lesson anywhere in the game: no ability, recipe, vein or swing
// named it, so Aldric's drill to 40 was the whole of it.
{
  const holder = { lesson: null };
  const h = harness({
    bar: ['whirlwind'], monsters: [mob('a', 1, 0)], seed: 4,
    extra: { progression: { lesson: (...a) => holder.lesson?.(...a) } },
  });
  // Zeroed but for what Whirlwind's own gate wants, so the 700 total cap is not
  // what refuses the lesson. Focus itself starts at nothing.
  for (const k of Object.keys(h.character.skills)) h.character.skills[k] = 0;
  h.character.skills.swordsmanship = 50;
  h.character.skills.tactics = 40;
  h.character.skillLocks = {};
  const prog = createProgression({ character: h.character, actor: h.actor });
  const taught = [];
  holder.lesson = (...a) => { taught.push({ skill: a[0], success: a[2] }); return prog.lesson(...a); };

  // 30 s apart, which clears Whirlwind's 12 s cooldown, so every iteration is a
  // real cast with a real blow against it and not a refusal counted as a hold.
  const blows = (n, from) => {
    let held = 0, broken = 0;
    for (let i = 0; i < n; i++) {
      h.actor.stamina = 200;
      const t0 = from + i * 30;
      h.abilities.use(0, t0);
      if (!h.abilities.casting) continue;
      const r = h.abilities.onDamaged(21, t0 + 0.2);      // over a tenth: a roll
      if (r.interrupted) broken++; else held++;
      h.abilities.update(1, t0 + 5);                      // let the cast finish
    }
    return { held, broken };
  };

  const atZero = blows(40, 0);
  const focus0 = taught.filter((x) => x.skill === 'focus');
  ck('at Focus 0 the chance is 1, so every blow breaks the cast, and every one teaches',
    atZero.broken === 40 && atZero.held === 0 && focus0.length === 40 && focus0.every((x) => x.success === false),
    `${focus0.length} lessons, ${atZero.held} held, ${atZero.broken} broken`);
  ck('and Focus is off zero, which it could never be before',
    h.character.skills.focus > 0, `Focus 0 to ${h.character.skills.focus} over 40 blows`);

  h.character.skills.focus = 100;
  const atHundred = blows(20, 5000);
  const focus100 = taught.filter((x) => x.skill === 'focus').slice(focus0.length);
  ck('at Focus 100 most are held, and a hold teaches as a success: both directions',
    atHundred.held > 10 && focus100.length === 20 && focus100.some((x) => x.success === true),
    `${atHundred.held} held, ${atHundred.broken} broken of 20`);
  ck('a blow too small to roll teaches nothing, which is the other direction',
    (() => {
      h.actor.stamina = 200;
      h.abilities.use(0, 999);
      const before = taught.filter((x) => x.skill === 'focus').length;
      h.abilities.onDamaged(1, 999.1);                    // under a tenth: no roll
      return taught.filter((x) => x.skill === 'focus').length === before;
    })(), 'no lesson for a blow that was never a threat');
}
{
  // the other direction: no Focus at all, and the same blow still breaks it
  const h = harness({ bar: ['whirlwind'], monsters: [mob('a', 1, 0)], seed: 11 });
  h.character.skills.focus = 0;
  h.abilities.use(0, 0);
  const r = h.abilities.onDamaged(100, 0.1);
  ck('with no Focus, a big blow is a certain break',
    r.interrupted === true && r.chance === 1, `chance ${r.chance}`);
}
{
  const h = harness({ bar: ['bandage'] });
  h.actor.health = 100;
  h.abilities.use(0, 0);
  ck('a bandage’s four seconds ARE its cast bar, not a second timer after it',
    !!h.abilities.channelling && h.abilities.channelling === h.abilities.casting
    && h.abilities.casting.endsAt === 4, `ends at ${h.abilities.casting?.endsAt}`);
  const r = h.abilities.onDamaged(1, 1);
  ck('and one point of damage ends it, with no ten percent threshold and no Focus roll',
    r.interrupted === true && r.chance === 1 && h.abilities.casting === null,
    `${r.reason}, and 1 damage is 0.5% of 200 health`);
  ck('and it healed nothing, since it never finished', h.actor.health === 100, String(h.actor.health));
  ck('and the bandage is spent, not handed back, and the player is told so',
    h.character.items.bandage === 9 && /the bandage is spent/.test(said(h)),
    `${h.character.items.bandage} left of 10`);
}
{
  const h = harness({ bar: ['bandage'] });
  h.actor.health = 100;
  h.abilities.use(0, 0);
  h.abilities.update(0.1, 3.9);
  ck('at 3.9 s it is still binding', !!h.abilities.casting && h.actor.health === 100);
  h.abilities.update(0.1, 4.0);
  ck('at 4.0 s a bandage heals Healing * 0.4 + Anatomy * 0.2',
    h.actor.health === 100 + 60, `${h.actor.health - 100} at Healing 100 and Anatomy 100`);
  ck('and it took a bandage out of the pack', h.character.items.bandage === 9, String(h.character.items.bandage));
  ck('and the player saw the number', h.floaters.spawned.some((f) => f.k === 'heal'), JSON.stringify(h.floaters.spawned));
}

// --- the bandage, down both roads --------------------------------------------
//
// The complaint was "bandages say they are not implemented". They said it
// because the bag's Use and the item bar's key both went to `foraging.useItem`,
// which reads an item's own `use` block, and the bandage base has none. The
// ability bar's Bandage did the real thing all along. Both roads now end in
// `doBandage`, and this is that claim measured: the same heal, the same cast,
// the same lesson and the same one bandage gone.
console.log('\nabilities_runtime: a bandage, from the ability bar and from the pack');
{
  const bar = harness({ bar: ['bandage'] });
  bar.actor.health = 100;
  bar.abilities.use(0, 0);
  bar.abilities.update(0.1, 4.0);
  const byBar = bar.actor.health - 100;

  // The item bar and the bag both call `abilities.useById(id)` through
  // ABILITY_FOR_ITEM. Same runtime, same entry point, no second heal formula.
  const item = harness({ bar: [] });
  item.actor.health = 100;
  item.abilities.useById(ABILITY_FOR_ITEM.bandage, 0);
  item.abilities.update(0.1, 4.0);
  const byItem = item.actor.health - 100;

  ck('using a bandage out of the pack heals exactly what the ability bar heals',
    byBar === byItem && byBar === 60, `${byBar} by the bar, ${byItem} by the item`);
  ck('and takes exactly one bandage, by either road',
    bar.character.items.bandage === 9 && item.character.items.bandage === 9,
    `${bar.character.items.bandage} / ${item.character.items.bandage}`);
  ck('and it is a four second cast either way, not an instant out of the bag',
    /casting for 4 seconds/.test(said(item)), said(item).split('|')[0].trim());
  ck('the item route is a table and not a special case in the UI',
    ABILITY_FOR_ITEM.bandage === 'bandage' && !!ABILITIES_BY_ID[ABILITY_FOR_ITEM.bandage]);
}
{
  // HEALING MUST BE A SKILL THAT MOVES. It was "just showing 1" because the
  // ability that teaches it could not be used at all.
  const taught = [];
  const h = harness({
    bar: ['bandage'],
    extra: { progression: { lesson: (skill, difficulty, success) => taught.push({ skill, difficulty, success }) } },
  });
  h.actor.health = 100;
  h.abilities.use(0, 0);
  h.abilities.update(0.1, 4.0);
  ck('a bandage that finishes is a lesson in Healing, at the row\'s own difficulty',
    taught.length === 1 && taught[0].skill === 'healing' && taught[0].success === true,
    JSON.stringify(taught));
}
{
  // THE COST COMES OUT OF THE REAL PACK, not out of a count map no save has.
  const h = harness({
    bar: ['bandage'],
    equipment: {},
    pack: [{ base: 'bandage', count: 3 }],
  });
  h.character.items = {};                       // the game's shape: no count map at all
  h.actor.health = 100;
  const r = h.abilities.use(0, 0);
  ck('with three bandages in the PACK and no count map, the ability is allowed',
    r.ok === true, r.reason || 'used');
  h.abilities.update(0.1, 4.0);
  ck('and one of the three really left the pack',
    h.character.pack[0].count === 2, `${h.character.pack[0].count} left of 3`);
  const empty = harness({ bar: ['bandage'], equipment: {}, pack: [] });
  empty.character.items = {};
  const no = empty.abilities.use(0, 0);
  ck('with none anywhere it refuses, and counts what you have',
    no.ok === false && /needs 1 bandage in your pack and you have 0/.test(no.reason), no.reason);
}

// --- the jump attack --------------------------------------------------------------
console.log('abilities_runtime: the jump attack, and its 25%');
{
  const h = harness({ bar: ['powerStrike'], monsters: [mob('a', 0, 1.5)] });
  h.abilities.use(0, 0);
  ck('on the ground the swing is not a jump attack', h.combat.swings[0].opts.jumpAttack === false);
  ck('and the runtime agrees', h.abilities.jumpAttack === false);
  h.player.airborne = true;
  h.abilities.use(0, 6);
  ck('in the air it is', h.combat.swings[1].opts.jumpAttack === true);
  ck('and the runtime agrees', h.abilities.jumpAttack === true);
}
{
  // the 25% itself, measured through the pure resolver both ways on one seed
  const attacker = {
    stats: { str: 60, dex: 60 }, skills: { swordsmanship: 60, tactics: 60, anatomy: 60 },
    weapon: { skill: 'swordsmanship', minDamage: 10, maxDamage: 10, speed: 3, damageType: 'physical' },
  };
  const defender = { stats: { dex: 0 }, skills: {}, health: 1000, ar: 0, resists: {} };
  attacker.weapon.minDamage = 1000; attacker.weapon.maxDamage = 1000;   // big, so rounding is noise
  const rolls = () => { const seq = [0, 0.99, 0.99, 0.5, 0.99]; let i = 0; return () => seq[i++ % seq.length]; };
  const plain = resolveMelee({ attacker, defender, rng: rolls() });
  const jumped = resolveMelee({ attacker, defender, rng: rolls(), jumpAttack: true });
  ck('JUMP_ATTACK_MULT is the documented 1.25', JUMP_ATTACK_MULT === 1.25);
  ck('and the same swing from the air really does land a quarter harder',
    near(jumped.damage / plain.damage, 1.25, 0.001),
    `${plain.damage} on the ground, ${jumped.damage} in the air, ${(jumped.damage / plain.damage).toFixed(3)}x`);
}
{
  const h = harness({ bar: ['leapSlam'], monsters: [mob('a', 0, 7)] });
  const arc = leapArc(8);
  ck('a leap uses the player’s own jump physics with a longer arc',
    near(arc.v0, JUMP_V0 * 1.6) && near(arc.air, 2 * JUMP_V0 * 1.6 / GRAVITY),
    `${arc.v0.toFixed(2)} m/s launch, ${arc.air.toFixed(2)} s in the air, ${arc.height.toFixed(2)} m up`);
  ck('and it goes higher than a standing jump’s 1.2 m', arc.height > 1.2, `${arc.height.toFixed(2)} m`);
  h.abilities.use(0, 0);
  ck('Leap Slam puts the player in the air rather than teleporting him',
    h.player.state.airborne === true && h.player.state.vy > JUMP_V0,
    `airborne ${h.player.state.airborne}, vy ${h.player.state.vy.toFixed(2)}`);
  ck('and it has NOT slammed yet, because he is still in the air',
    h.combat.swings.length === 0, `${h.combat.swings.length} swings mid flight`);
  h.player.pos.x = 0; h.player.pos.z = 6.5;      // where he came down
  h.abilities.onLanded(1.1, 0);
  ck('the slam happens where he lands, and catches what is standing there',
    h.combat.swings.length === 1 && h.combat.swings[0].defender.name === 'a',
    `${h.combat.swings.length} caught`);
  ck('at 120%', h.combat.swings[0].opts.multiplier === 1.2, String(h.combat.swings[0].opts.multiplier));
  ck('and the knockback went with it', h.monsters.pushed.length === 1, `${h.monsters.pushed.length}`);
  ck('a second landing does nothing, so the slam cannot fire twice',
    h.abilities.onLanded(2, 0) === null && h.combat.swings.length === 1);
}

// --- buffs, debuffs, and the recompute that has to follow -----------------------------
console.log('abilities_runtime: buffs expire and the pools follow');
{
  let recomputes = 0;
  const h = harness({ bar: ['berserk'], extra: { recompute: () => { recomputes++; } } });
  h.abilities.use(0, 0);
  ck('Berserk goes on the actor where combat can read it',
    h.actor.buffs.length === 1 && h.actor.buffs[0].mods.damage === 0.4,
    JSON.stringify(h.actor.buffs.map((b) => b.name)));
  ck('and it recomputed when it landed', recomputes >= 1, String(recomputes));
  ck('the player was told what it does and for how long',
    /\+40% damage/.test(said(h)) && /15 seconds/.test(said(h)), said(h).split('|').pop().trim());
  h.abilities.update(1, 14.9);
  ck('at 14.9 s it is still on', h.actor.buffs.length === 1);
  const before = recomputes;
  h.abilities.update(1, 15.0);
  ck('at 15.0 s it is gone', h.actor.buffs.length === 0);
  ck('and the expiry recomputed too, so the pools do not keep the bonus',
    recomputes > before, `${before} -> ${recomputes}`);
  ck('and it said so', /Berserk runs out/.test(said(h)));
}
{
  const target = mob('a', 0, 3);
  const h = harness({ bar: ['hex'], monsters: [target] });
  h.abilities.use(0, 0);
  ck('a debuff goes on the target, not on you',
    target.buffs.length === 1 && target.buffs[0].kind === 'debuff' && h.actor.buffs.length === 0,
    JSON.stringify(target.buffs.map((b) => `${b.name} ${b.kind}`)));
  h.abilities.update(1, 12.1);
  ck('and it runs out on the target too', target.buffs.length === 0);
}
{
  const target = mob('a', 0, 1.5);
  const h = harness({ bar: ['crushingBlow'], monsters: [target] });
  h.abilities.use(0, 0);
  // combat.js and monsters.js read status.until on the millisecond frame clock;
  // this module's seconds ride along as untilS
  ck('a stun is data on the target that combat and monsters can read, in their milliseconds',
    target.status.stun && near(target.status.stun.until, 3000) && near(target.status.stun.untilS, 3), JSON.stringify(target.status.stun));
  ck('and the armour break went on as a debuff at the same time',
    target.buffs.some((b) => b.mods?.armourRatingFlat === -10), JSON.stringify(target.buffs.map((b) => b.mods)));
  ck('one press, three things, and all three were said',
    /90%/.test(said(h)) && /stun/.test(said(h)) && /armourRatingFlat/.test(said(h)),
    said(h).split('|').pop().trim());
  // The word is English. `${effect}ed` read "1 stuned for 3 seconds" in the
  // in-game sweep of 2026-09-08, and "silenceed", "pacifyed", "provokeed".
  ck('and the stun is said as "stunned"',
    /1 stunned for 3 seconds/.test(said(h)) && !/stuned/.test(said(h)), said(h).split('|').pop().trim());
}
{
  const a = mob('a', 0, 4), b = mob('b', 1, 4);
  const h = harness({ bar: ['peace', 'provoke', 'eldritchBolt'], monsters: [a, b], equipment: { mainHand: { base: 'lute' } }, pack: [] });
  h.abilities.use(0, 0); h.abilities.update(1.1, 1.1);
  ck('Peace says "pacified"', /pacified for/.test(said(h)) && !/pacifyed/.test(said(h)), said(h).split('|').pop().trim());
  h.abilities.use(1, 5); h.abilities.update(1.1, 6.1);
  ck('Provoke says "provoked"', /provoked for/.test(said(h)) && !/provokeed/.test(said(h)), said(h).split('|').pop().trim());
}

// --- damage over time actually ticks ---------------------------------------------------
console.log('abilities_runtime: a dot is damage, not a line');
{
  // Fireball: 18 to 26 on the bolt, then "2 a second for 4 seconds". The bolt
  // is combat's job (queued, not landed, in this harness); the burn is ours,
  // and until the in-game sweep of 2026-09-08 nothing ticked it.
  const target = mob('Skeleton', 0, 5);
  const h = harness({ bar: ['fireball'], monsters: [target] });
  h.abilities.use(0, 0);
  h.abilities.update(0.7, 0.7);                       // the cast releases at 0.6
  ck('the burn is written on the target', Array.isArray(target.dots) && target.dots.length === 1, JSON.stringify(target.dots));
  ck('and nothing has ticked before its first second', target.health === 100, String(target.health));
  h.abilities.update(1.0, 1.7);
  ck('one second in, one tick of two', target.health === 98, String(target.health));
  h.abilities.update(1.0, 2.7); h.abilities.update(1.0, 3.7); h.abilities.update(1.0, 4.7);
  ck('four seconds in, four ticks and the burn is gone', target.health === 92 && target.dots.length === 0, `hp ${target.health}, ${target.dots.length} dots`);
  h.abilities.update(1.0, 9);
  ck('and it does not keep burning after', target.health === 92, String(target.health));
  ck('each tick was a floater the player could see', h.floaters.spawned.filter((f) => f.t === '2').length === 4, JSON.stringify(h.floaters.spawned.map((f) => f.t)));
}
{
  // a tick that kills ends the dot rather than hitting a corpse
  const target = mob('Skeleton', 0, 5, { health: 3, maxHealth: 3 });
  const h = harness({ bar: ['fireball'], monsters: [target] });
  h.abilities.use(0, 0);
  h.abilities.update(0.7, 0.7);
  h.abilities.update(1.0, 1.7); h.abilities.update(1.0, 2.7);
  ck('a dot kills and stops', target.health === 0 && target.dots.length === 0, `hp ${target.health}, ${target.dots.length} dots`);
}

// --- MP1: a hand on another player's shoulder -------------------------------------------
console.log('abilities_runtime: a heal or a blessing on a fellow player reaches the wire');
{
  const mate = { id: 'tour', name: 'tour', faction: 'player', remote: true, health: 50, maxHealth: 100, pos: { x: 2, y: 0, z: 0 }, buffs: [], status: {}, stats: {}, skills: {} };
  const targeting = createTargeting(null, null, { targets: () => [] }, { self: null, pos: () => ({ x: 0, y: 0, z: 0 }), yaw: () => 0 });
  targeting.set(mate);
  const sent = [];
  const h = harness({ bar: ['heal', 'bless'], allies: [mate], extra: { targeting, onAllyEffect: (who, payload) => sent.push({ who, payload }) } });
  h.abilities.use(0, 0);
  h.abilities.update(0.6, 0.6);
  ck('Heal on a chosen friend heals the mirror and sends the amount to their client',
    mate.health > 50 && sent.length === 1 && sent[0].who === mate && sent[0].payload.kind === 'heal' && sent[0].payload.amount === mate.health - 50 && sent[0].payload.ability === 'heal',
    JSON.stringify(sent.map((x) => x.payload)));
  h.abilities.use(1, 5);
  h.abilities.update(0.6, 5.6);
  const bless = sent.find((x) => x.payload.kind === 'buff');
  ck('Bless on a chosen friend goes to the friend, not to the caster',
    !!bless && bless.who === mate && bless.payload.name === 'Bless' && bless.payload.duration === 30 && !h.actor.buffs.some((b) => b.abilityId === 'bless'),
    JSON.stringify({ sent: sent.map((x) => x.payload.kind), selfBuffs: h.actor.buffs.map((b) => b.abilityId) }));
  // and the other side: what arrives is applied to the real actor and named
  h.actor.health = 150;
  const r = h.abilities.takeRemoteEffect('rangertest', { kind: 'heal', ability: 'heal', amount: 30 }, 6);
  ck('a heal off the wire lands on this actor and says who did it', r.got === 30 && h.actor.health === 180, JSON.stringify(r));
  ck('and the line names the healer', /rangertest heals you with Heal/.test(said(h)), said(h).split('|').pop().trim());
  const b2 = h.abilities.takeRemoteEffect('rangertest', { kind: 'buff', ability: 'bless', name: 'Bless', duration: 30, effect: ABILITIES_BY_ID.bless.effect }, 7);
  ck('a blessing off the wire is a buff on this actor for its duration',
    b2 && b2.kind === 'buff' && h.actor.buffs.some((b) => b.abilityId === 'bless' && b.until === 37), JSON.stringify(h.actor.buffs.map((b) => [b.abilityId, b.until])));
}

// --- summons, zones, marks, enchants ---------------------------------------------------
console.log('abilities_runtime: the rest of the kinds do something you can point at');
{
  const h = harness({ bar: ['summonImp'] });
  h.abilities.use(0, 0);
  h.abilities.update(1.2, 1.2);
  ck('a summon reaches the spawn hook with a duration',
    h.summoned.length === 1 && h.summoned[0].id === 'imp' && h.summoned[0].meta.duration > 60,
    JSON.stringify(h.summoned.map((s) => `${s.id} ${s.meta.duration}s`)));
}
{
  const h = harness({ bar: ['snare'], monsters: [mob('a', 0, 12)] });
  h.abilities.use(0, 0);
  h.abilities.update(0.8, 0.8);
  ck('a trap is a zone waiting on the ground', h.abilities.zones.length === 1, JSON.stringify(h.abilities.zones.map((z) => z.zoneKind)));
  h.list[0].pos.x = h.abilities.zones[0].x; h.list[0].pos.z = h.abilities.zones[0].z;
  h.abilities.update(0.1, 0.9);
  ck('and it fires on the first thing to step into it, then is gone',
    h.list[0].status.root && h.abilities.zones.length === 0,
    `root until ${h.list[0].status.root?.until}, ${h.abilities.zones.length} zones left`);
  ck('and the player is told something walked into it', /walked into your trap/.test(said(h)));
}
{
  const target = mob('a', 0, 5);
  const h = harness({ bar: ['huntersMark'], monsters: [target] });
  h.abilities.use(0, 0);
  ck('a mark is data on the target with a multiplier and an owner',
    target.marks?.length === 1 && target.marks[0].damageTakenMult === 1.15 && target.marks[0].from === 'player',
    JSON.stringify(target.marks));
  h.abilities.use(0, 20);
  ck('and using it again replaces rather than stacks', target.marks.length === 1, String(target.marks.length));
}
{
  const h = harness({ bar: ['consecrateWeapon'] });
  h.abilities.use(0, 0);
  ck('a weapon enchant is data on the actor with an end time',
    h.actor.enchant?.damageType === 'holy' && h.actor.enchant.until === 20, JSON.stringify(h.actor.enchant));
  h.abilities.update(1, 20.1);
  ck('and it wears off, out loud', h.actor.enchant === null && /wears off/.test(said(h)));
}
{
  const h = harness({ bar: ['manaShield'] });
  h.abilities.use(0, 0);
  ck('Mana Shield is an absorb combat can read', h.actor.absorb?.ratio === 2 && h.actor.absorb.source === 'mana',
    JSON.stringify(h.actor.absorb));
}
{
  const h = harness({ bar: ['blink'] });
  h.player.yaw = 0;
  h.abilities.use(0, 0);
  ck('Blink moves the player 12 m the way he faces',
    near(h.player.pos.z, 12, 1e-6) && near(h.player.pos.x, 0, 1e-6),
    `(${h.player.pos.x.toFixed(2)}, ${h.player.pos.z.toFixed(2)})`);
}
{
  const h = harness({ bar: ['meteor'], monsters: [mob('a', 0, 6)] });
  h.abilities.use(0, 0);
  h.abilities.update(2.5, 2.5);
  ck('Meteor does not land the moment it is cast', h.combat.spells.length === 0 && h.abilities.delayed.length === 1,
    `${h.abilities.delayed.length} falling`);
  ck('and it telegraphs, so you can get out from under it', h.effects.calls.includes('column'));
  h.abilities.update(1.5, 4.0);
  ck('and 1.5 s later it lands on what is standing there',
    h.combat.spells.length === 1 && h.abilities.delayed.length === 0, `${h.combat.spells.length} hit`);
}
{
  const h = harness({ bar: ['hide'] });
  h.abilities.use(0, 0);
  h.abilities.update(1, 1);
  ck('Hide is data on the actor that monsters can read', !!h.actor.hidden, JSON.stringify(h.actor.hidden));
  h.character.skills.stealth = 0;
  h.player.speed = 5;
  // At Stealth 0 a step holds 5 times in 100, so one step is a coin toss with
  // a heavy coin. Ten of them is not: the odds of holding all ten are one in
  // 10^13, and the loop is what makes this deterministic rather than lucky.
  for (let i = 0; i < 10 && h.actor.hidden; i++) h.abilities.update(0.1, 1.1 + i * 2);
  ck('and moving without Stealth gives you away, out loud',
    h.actor.hidden === null && /gave you away/.test(said(h)), said(h).split('|').pop().trim());
}
{
  const h = harness({ bar: ['provoke'], monsters: [mob('a', 0, 3)] });
  h.abilities.use(0, 0);
  h.abilities.update(1, 1);
  ck('Provoke on one monster refuses and counts them for you',
    /needs 2 of them and there is 1/.test(said(h)), said(h).split('|').pop().trim());
}
{
  const h = harness({ bar: ['provoke'], monsters: [mob('a', 0, 3), mob('b', 1, 3)] });
  h.abilities.use(0, 0);
  h.abilities.update(1, 1);
  ck('and with two of them it sets them on each other',
    h.list[0].provokedAt === h.list[1] && h.list[1].provokedAt === h.list[0],
    `${h.list[0].provokedAt?.name} and ${h.list[1].provokedAt?.name}`);
}
{
  const h = harness({ bar: ['chainLightning'], monsters: [mob('a', 0, 5), mob('b', 1, 5), mob('c', 2, 5), mob('d', 3, 5)] });
  h.abilities.use(0, 0);
  h.abilities.update(1.2, 1.2);
  ck('Chain Lightning hits the first and jumps to three more',
    h.combat.spells.length === 4, `${h.combat.spells.length} bolts`);
  ck('and each jump is weaker than the last',
    h.combat.spells[1].spell.base[1] > h.combat.spells[2].spell.base[1]
    && h.combat.spells[2].spell.base[1] > h.combat.spells[3].spell.base[1],
    h.combat.spells.map((s) => s.spell.base[1].toFixed(1)).join(' > '));
}
{
  const h = harness({ bar: ['heal'] });
  h.actor.health = 100;
  h.abilities.use(0, 0);
  h.abilities.update(0.8, 0.8);
  ck('Heal restores 20 + Chivalry * 0.3', h.actor.health === 150, `${h.actor.health - 100} at Chivalry 100`);
  h.actor.health = h.actor.maxHealth;
  h.abilities.use(0, 4);
  h.abilities.update(0.8, 4.8);
  ck('and healing at full health says so rather than going quiet',
    /Already whole/.test(said(h)), said(h).split('|').pop().trim());
}

// --- every ability, every kind, driven for real -------------------------------------
console.log('abilities_runtime: all 78 abilities pressed, nothing silent, nothing thrown');
{
  const kindsSeen = new Set();
  const walk = (e) => { if (!e) return; kindsSeen.add(e.kind); if (e.kind === 'combo') e.parts.forEach(walk); if (e.applies) walk(e.applies); };
  const errors = [];
  const silent = [];
  let used = 0, refused = 0;
  for (const ability of ABILITIES) {
    const h = harness({
      bar: [ability.id],
      monsters: [mob('near', 0, 1.2), mob('mid', 0, 4), mob('far', 2, 6), mob('corpse', 0, 2, { health: 0 })],
      allies: [{ id: 'friend', name: 'Friend', faction: 'player', pos: { x: 1, y: 0, z: 1 }, buffs: [], health: 10, maxHealth: 20 }],
    });
    try {
      const r = h.abilities.use(0, 0);
      if (r.ok) {
        used++;
        walk(ability.effect);
        // run it to completion: a cast, a channel, and any delayed part
        for (let t = 0.1; t <= 8; t += 0.1) h.abilities.update(0.1, t);
        if (h.player.state.airborne) h.abilities.onLanded(9, 0);
      } else {
        refused++;
      }
      if (!h.hudLines.length) silent.push(ability.id);
    } catch (err) {
      errors.push(`${ability.id}: ${err.message}`);
    }
  }
  ck(`no ability threw (${used} used, ${refused} refused)`, errors.length === 0, errors.slice(0, 4).join(' / '));
  ck('and not one of the 78 was silent about what it did or did not do',
    silent.length === 0, silent.join(','));
  ck('only the passives were refused, since a passive is never pressed',
    refused === ABILITIES.filter((a) => a.passive).length, `${refused} refused, ${ABILITIES.filter((a) => a.passive).length} passives`);
  const wanted = EFFECT_KINDS.filter((k) => k !== 'passiveMod');
  ck('and every effect kind but passiveMod was really exercised',
    wanted.every((k) => kindsSeen.has(k)), wanted.filter((k) => !kindsSeen.has(k)).join(',') || 'all of them');
}
{
  const h = harness({});
  ck('passiveMod is exercised on create, so a passive is data and not a dead row',
    h.actor.passives && Object.keys(h.actor.passives).length >= 3,
    Object.keys(h.actor.passives || {}).join(','));
  ck('Riposte’s counter multiplier is on the actor where combat can find it',
    h.actor.passives.riposte?.parryCounterMult === 0.5, JSON.stringify(h.actor.passives.riposte));
  const weak = harness({});
  weak.character.skills.parrying = 10;
  weak.abilities.applyPassives();
  ck('and it is taken off again when the skill is not there',
    !weak.actor.passives.riposte, JSON.stringify(weak.actor.passives.riposte));
}

// --- the views the HUD reads ---------------------------------------------------------
console.log('abilities_runtime: the views main.js hands the HUD');
{
  const h = harness({ bar: ['powerStrike', null, 'fireball'], monsters: [mob('a', 0, 1.5)] });
  const v = h.abilities.barView(0);
  ck('the bar view is always twelve entries, however short the bar is', v.length === 12, String(v.length));
  ck('an empty slot is an entry with no ability, not a hole', v[1].ability === null && v[1].key === '2');
  ck('slot 1 knows its ability and its key', v[0].ability.id === 'powerStrike' && v[0].key === '1');
  ck('slot 12 knows it is the equals key', v[11].key === '=');
  h.abilities.use(0, 0);
  ck('after a press the view reports the cooldown', near(h.abilities.barView(2)[0].cooldownLeft, 4),
    `${h.abilities.barView(2)[0].cooldownLeft} s left at t = 2`);
  h.actor.mana = 1;
  ck('and an unaffordable spell reports itself unaffordable',
    h.abilities.barView(2)[2].affordable === false, `mana ${h.actor.mana} for a 9 mana spell`);
  h.actor.mana = 200;
  ck('and affordable again when the mana is there', h.abilities.barView(2)[2].affordable === true);
}
{
  const h = harness({ bar: ['berserk'] });
  h.abilities.use(0, 0);
  const b = h.abilities.buffsView(3);
  ck('the buff view counts down', b.length === 1 && near(b[0].remaining, 12), `${b[0].remaining} s left at t = 3`);
  ck('and names the buff so the icon has a label', b[0].name === 'Berserk' && b[0].kind === 'buff');
}

console.log('abilities_runtime: odds and ends');
ck('seconds are said the way a person says them',
  saySeconds(1) === '1 second' && saySeconds(15) === '15 seconds' && saySeconds(0.4) === '0.4 seconds',
  `${saySeconds(1)} / ${saySeconds(15)} / ${saySeconds(0.4)}`);
{
  const h = harness({ bar: ['powerStrike'], monsters: [] });
  const r = h.abilities.use(0, 0);
  ck('Power Strike with nothing in reach arms the next swing instead of being wasted',
    r.ok === true && !!h.abilities.armed, said(h).split('|').pop().trim());
  ck('and W2 can take it off the peg', h.abilities.takeNextSwing(1)?.multiplier === 1.6);
  ck('and only once', h.abilities.takeNextSwing(1) === null);
}
{
  const h = harness({ bar: ['powerStrike'], monsters: [] });
  h.abilities.use(0, 0);
  h.abilities.update(0.1, 11);
  ck('an armed swing nobody used lapses, out loud',
    h.abilities.armed === null && /went unused/.test(said(h)), said(h).split('|').pop().trim());
}

// --- no weapon, no ability ---------------------------------------------------------
console.log('abilities_runtime: what has to be in your hands');
const gear = (o = {}) => ({ mainHand: null, offHand: null, ranged: null, ...o });
const item = (base, count) => (count == null ? { base } : { base, count });

{
  const h = harness({ bar: ['rend'], monsters: [mob('Skeleton', 0, 1.5)] });
  h.character.equipment = gear({ mainHand: item('mace') });
  const before = h.actor.stamina;
  const r = h.abilities.use(0, 0);
  ck('Rend with a mace in hand is refused, and the reason names the ability and the weapon',
    r.ok === false && /Rend wants a sword or an axe in your hand/.test(r.reason), r.reason);
  ck('the refusal paid no stamina', h.actor.stamina === before, `${h.actor.stamina} of ${before}`);
  ck('and no swing was queued and no cooldown started',
    h.combat.swings.length === 0 && h.abilities.cooldownLeft('rend', 0) === 0,
    `${h.combat.swings.length} swings`);
  ck('and the player was told, on the log, with the denied cue',
    /Rend wants a sword or an axe/.test(said(h)) && h.audio.played.includes('denied'),
    h.audio.played.join(','));

  h.character.equipment = gear({ mainHand: item('longsword') });
  const ok = h.abilities.use(0, 0);
  ck('the same press with a longsword goes through and costs its 20 stamina',
    ok.ok === true && h.actor.stamina === before - 20, `${h.actor.stamina} of ${before}`);
}
{
  const h = harness({ bar: ['doubleShot'], monsters: [mob('Skeleton', 0, 20)] });
  h.character.equipment = gear({ ranged: item('shortbow') });
  h.character.pack = { slots: 20, items: [] };
  const before = h.actor.stamina;
  const dry = h.abilities.use(0, 0);
  ck('Double Shot with a bow and no arrows is refused',
    dry.ok === false && /wants a bow in your hand and arrows in the pack/.test(dry.reason), dry.reason);
  ck('and it cost nothing', h.actor.stamina === before && h.combat.swings.length === 0);
  h.character.pack.items.push(item('arrow', 20));
  const wet = h.abilities.use(0, 0);
  ck('twenty arrows in the pack let it fly, twice',
    wet.ok === true && h.combat.swings.length === 2, `${h.combat.swings.length} shots`);
}
{
  const h = harness({ bar: ['rend', 'fireball', 'doubleShot'] });
  h.character.equipment = gear({ mainHand: item('mace') });
  const v = h.abilities.barView(0);
  ck('barView marks the slot the player cannot use, with the reason on it',
    v[0].unusable === true && /sword or an axe/.test(v[0].unusableReason), v[0].unusableReason);
  // W7: a spell wants a wand or a staff, so a mace in the hand greys it too.
  ck('and marks the spell, which wants a focus the mace is not',
    v[1].unusable === true && /wand or a staff/.test(v[1].unusableReason) && v[1].needs === 'focus',
    v[1].unusableReason);
  ck('and marks the shot, which has no bow behind it',
    v[2].unusable === true && /bow in your hand/.test(v[2].unusableReason), v[2].unusableReason);
  h.character.equipment = gear({ mainHand: item('longsword') });
  const after = h.abilities.barView(0);
  ck('swapping to a longsword clears the mark on the same frame',
    after[0].unusable === false && after[0].needs === 'melee');
  ck('an empty slot is never marked unusable', h.abilities.barView(0)[5].unusable === false);
}
{
  const h = harness({ bar: ['rend'] });
  const v = h.abilities.barView(0);
  ck('a character with no equipment field at all is never marked',
    v[0].unusable === false, 'the old fixtures see no change');
}

// --- an armed swing belongs to the weapon it was armed with ------------------------
{
  const h = harness({ bar: ['powerStrike'], monsters: [] });
  h.actor.weapon = { id: 'longsword', skill: 'swordsmanship' };
  h.abilities.use(0, 0);
  ck('Power Strike with nothing in reach arms on the weapon in hand',
    h.abilities.armed?.weaponId === 'longsword', String(h.abilities.armed?.weaponId));
  ck('and the same weapon takes it off the peg', h.abilities.takeNextSwing(1)?.multiplier === 1.6);

  h.abilities.use(0, 6);
  h.actor.weapon = { id: 'mace', skill: 'macefighting' };
  ck('but a weapon swap drops it rather than spending it on the wrong swing',
    h.abilities.takeNextSwing(7) === null && /set up for another weapon/.test(said(h)),
    said(h).split('|').pop().trim());
  ck('and the peg is empty afterwards', h.abilities.armed === null);
}
{
  const h = harness({ bar: ['powerStrike'], monsters: [] });
  h.actor.weapon = { id: 'longsword', skill: 'swordsmanship' };
  h.abilities.use(0, 0);
  h.actor.weapon = { id: 'battleaxe', skill: 'swordsmanship' };
  h.abilities.update(0.1, 1);
  ck('the update tick lapses it too, so the player hears it at once and not at the swing',
    h.abilities.armed === null && /set up for another weapon/.test(said(h)),
    said(h).split('|').pop().trim());
}
{
  const h = harness({ bar: ['powerStrike'], monsters: [] });
  h.actor.weapon = { id: 'longsword', skill: 'swordsmanship' };
  h.abilities.use(0, 0);
  h.abilities.update(0.1, 1);
  ck('and it does NOT lapse while the weapon stays put',
    h.abilities.armed !== null && h.abilities.takeNextSwing(1)?.multiplier === 1.6);
}

// --- a passive that needs a shield ------------------------------------------------
{
  const h = harness({ bar: [] });
  h.character.equipment = gear({ mainHand: item('longsword'), offHand: item('kite') });
  const withShield = h.abilities.applyPassives();
  ck('Riposte is on while the shield is on the arm', !!withShield.riposte, Object.keys(withShield).join(', '));
  h.character.equipment = gear({ mainHand: item('longsword') });
  const without = h.abilities.applyPassives();
  ck('and off the moment there is no shield to parry with', !without.riposte, Object.keys(without).join(', '));
}

// --- every opening, against the kit it is handed ----------------------------------
{
  // `focus` is in this list on purpose: W7 made every spell want a wand or a
  // staff, so a casting opening whose kit hands it the wrong stick fails here.
  const weaponKinds = ['melee', 'anyMelee', 'unarmed', 'ranged', 'focus', 'shield', 'instrument'];
  /**
   * Answerable out of what this character is carrying: allowed as they stand,
   * or allowed once one carried item is moved into a hand, or once the hand is
   * emptied. That last is what a shot wants, and moving a thing from the pack
   * into the hand is one click in the bag window.
   *
   * The bar is "carried", not "worn", on purpose. Magic Arrow unlocks at Magery
   * 0, which means EVERY opening unlocks it, and after W7 it wants a wand: a
   * warrior cannot be expected to walk out of creation holding one. The
   * settler's kit puts a wand in his pack in his first minute
   * (app/systems/inventory.js, measured in its own test), and one swap arms it.
   */
  const answerable = (ability, c) => {
    if (weaponCheck(ability, c.equipment, c.pack).ok) return true;
    if (weaponCheck(ability, { ...c.equipment, mainHand: null }, c.pack).ok) return true;
    for (const it of c.pack.items.filter(Boolean)) {
      for (const eq of [
        { ...c.equipment, mainHand: it },
        { ...c.equipment, offHand: it },
        { ...c.equipment, mainHand: null, ranged: it },
      ]) if (weaponCheck(ability, eq, c.pack).ok) return true;
    }
    return false;
  };

  const rows = [];
  for (const op of OPENINGS) {
    const plan = planCharacter({ opening: op.id, name: 'Testing', seed: 3 });
    if (!plan.ok) { rows.push({ id: op.id, error: plan.reason }); continue; }
    const c = plan.character;
    // the pack a player really has: the creation kit plus the settler's kit,
    // which is granted at boot before anything can be clicked
    for (const { base, count } of settlerKitFor(c)) {
      const i = c.pack.items.indexOf(null);
      if (i >= 0) c.pack.items[i] = makeItem({ base, count });
    }
    // A FIRST RUNG HELD OPEN IS NOT A PROMISE THE KIT MADE. Thirteen rows now
    // carry `openAt: 0` so their school can be started at all (skill_paths.js),
    // and four of them are the bard's, which want a lute. No opening but the
    // bard's is handed one, and that is right: the lute is the bard's tool and
    // a warrior gets it by making one at a workbench. What the guard below is
    // for is an ability a character's OWN SKILLS earned and his own kit cannot
    // answer, so a row nobody earned is not one of them. The next check proves
    // those four still say what they want rather than failing in silence.
    const wanted = unlockedFor(c.skills, c.stats)
      .filter((x) => !x.passive && weaponKinds.includes(weaponNeeds(x).kind))
      .filter((x) => x.openAt >= x.minSkill || c.skills[x.skill] >= x.minSkill);
    const refused = wanted.filter((x) => !weaponCheck(x, c.equipment, c.pack).ok);
    const stranded = wanted.filter((x) => !answerable(x, c));
    rows.push({ id: op.id, wanted: wanted.length, refused: refused.map((x) => x.id), stranded: stranded.map((x) => x.id) });
  }
  for (const r of rows) {
    console.log(`  ${r.id.padEnd(12)} ${String(r.wanted).padStart(2)} unlocked, refused as worn: ${r.refused.join(', ') || 'none'}`);
  }
  const offenders = rows.filter((r) => r.stranded.length);
  // The ranger once started with a dagger in the main hand and the bow on the
  // back, so every archery ability was refused. creation.js now leaves the
  // melee weapon in the pack when the kit draws a bow, and no opening starts
  // carrying nothing that would answer for what it unlocked.
  ck('no opening starts unable to use an ability its own kit unlocked',
    offenders.length === 0,
    offenders.map((r) => `${r.id}: ${r.stranded.join(', ')}`).join(' | ') || 'none');
  // And the four held open that a warrior's kit cannot answer say so in words,
  // naming the thing to go and get. A silent refusal would be the bug this
  // whole block exists to catch.
  {
    const warrior = planCharacter({ opening: 'warrior', name: 'Testing', seed: 3 }).character;
    const bard = ['provoke', 'peace', 'discord', 'marchingSong'].map((id) => ABILITIES_BY_ID[id]);
    const said = bard.map((x) => weaponCheck(x, warrior.equipment, warrior.pack));
    ck('the bard rows a warrior may hold refuse in words, and name the lute',
      said.every((r) => !r.ok && /lute/.test(r.reason)), said[0].reason);
    ck('and a lute can be made, so the circle is not closed',
      RECIPES.some((r) => r.result.base === 'lute' && r.skill === 'carpentry'),
      RECIPES.filter((r) => r.result.base === 'lute').map((r) => r.name).join(', ') || 'no lute recipe');
  }
  // And every caster starts with the focus already in the hand, not one swap
  // away: a mage whose first click is refused has been handed a broken game.
  const casters = ['mage', 'sorcerer', 'necromancer', 'healer'];
  const armed = casters.filter((id) => {
    const c = planCharacter({ opening: id, name: 'Testing', seed: 3 }).character;
    return weaponCheck(ABILITIES_BY_ID.magicArrow, c.equipment, c.pack).ok;
  });
  ck('and all four casting openings start with the focus already in the hand',
    armed.length === casters.length, armed.join(', ') || 'none');
  // bows are main hand weapons (2026-09-08): the ranger is born with the bow IN
  // HAND and the dagger in the pack, and swapping them is one move
  ck('the ranger is born with the bow in hand and the dagger in the pack',
    (() => {
      const c = planCharacter({ opening: 'ranger', name: 'Testing', seed: 3 }).character;
      const r = weaponCheck(ABILITIES_BY_ID.aimedShot, c.equipment, c.pack);
      const daggerPacked = c.pack.items.some((it) => it && it.base === 'dagger');
      return r.ok && c.equipment.mainHand?.base === 'shortbow' && !c.equipment.ranged && daggerPacked;
    })(),
    'aimed shot allowed with the shortbow in the main hand and the dagger packed');
  ck('and a dagger drawn over it is named as the thing in the way',
    (() => {
      const c = planCharacter({ opening: 'ranger', name: 'Testing', seed: 3 }).character;
      c.equipment.mainHand = c.pack.items.find((it) => it && it.base === 'dagger');
      const r = weaponCheck(ABILITIES_BY_ID.aimedShot, c.equipment, c.pack);
      return r.ok === false && /holding a Dagger/.test(r.reason);
    })(), 'the dagger is what you are holding');
  ck('the bard plays on the lute the kit equips',
    (() => {
      const c = planCharacter({ opening: 'bard', name: 'Testing', seed: 3 }).character;
      return weaponCheck(ABILITIES_BY_ID.provoke, c.equipment, c.pack).ok === true;
    })(), 'rapier in hand, lute in the off hand');
}

// --- C1: the armour rule, measured ---------------------------------------------
//
// Nothing below is asserted from the shape of the code. Every fizzle number is
// a count of 200 real casts through useById and update with a seeded rng, and
// every gate is driven both ways: plate fizzles and cloth does not, Fireball
// fizzles and Bless never does, a fizzle pays half and a landing pays all.
console.log('abilities_runtime: armour and the spell going out');

/** A full suit of `mat` with a wand in the hand. `null` is a wand and nothing else. */
function worn(mat) {
  const eq = { mainHand: makeItem({ base: 'wand', seed: 1 }) };
  if (mat) for (const p of ARMOR_PIECES) eq[p.slot] = makeItem({ base: `${mat}_${p.id}`, seed: 2 });
  return eq;
}

/**
 * `n` real casts of `id` in a full suit of `mat`. Returns what was counted:
 * how many fizzled, how much mana the first landing and the first fizzle each
 * cost, and the cast bar's own length.
 */
function castRun(mat, opts = {}) {
  const { id = 'fireball', n = 200, seed = 1, rng = null } = opts;
  const h = harness({
    monsters: [mob('Skeleton', 0, 3)],
    equipment: worn(mat),
    seed,
    ...(rng ? { extra: { rng } } : {}),
  });
  h.actor.maxMana = 500;
  let fizzles = 0, landed = 0, t = 0;
  let spentOnFizzle = null, spentOnLanding = null, barLength = null;
  for (let i = 0; i < n; i++) {
    h.actor.mana = 500;
    h.list[0].health = 100; h.list[0].buffs.length = 0;
    const before = h.hudLines.length;
    const r = h.abilities.useById(id, t);
    if (r.record && barLength === null) barLength = r.record.castTime;
    h.abilities.update(0.016, t + 3);
    const lines = h.hudLines.slice(before).map((l) => l.t);
    const spent = 500 - h.actor.mana;
    if (lines.some((l) => /fizzles/.test(l))) { fizzles++; if (spentOnFizzle === null) spentOnFizzle = spent; }
    else { landed++; if (spentOnLanding === null) spentOnLanding = spent; }
    t += 10;
  }
  return { fizzles, landed, spentOnFizzle, spentOnLanding, barLength, h };
}

{
  // The table, tier by tier: 200 casts of Fireball in a full suit of each.
  const want = [
    ['no armour at all', null, 0], ['cloth', 'cloth', 0], ['leather', 'leather', 12],
    ['studded leather', 'studded', 36], ['ringmail', 'ring', 66], ['chainmail', 'chain', 90],
    ['platemail', 'plate', 120],
  ];
  for (const [name, mat, expect] of want) {
    const r = castRun(mat);
    ck(`200 Fireballs in ${name} fizzle ${expect} times, give or take 8`,
      Math.abs(r.fizzles - expect) <= 8,
      `${r.fizzles} fizzled, ${r.landed} landed, wanted ${expect} (burden ${castBurdenOf(worn(mat))})`);
  }
}

{
  // The cast bar, both ends.
  const cloth = castRun('cloth', { n: 1 });
  const plate = castRun('plate', { n: 1 });
  const fire = ABILITIES_BY_ID.fireball;
  ck('Fireball in cloth uses the live cast time', cloth.barLength === fire.castTime, `${cloth.barLength} s`);
  ck('and in full plate it takes twice as long', plate.barLength === fire.castTime * 2, `${plate.barLength} s`);
  ck('the sentence names the armour that is slowing it',
    /casting for 0.7 seconds, slowed by your platemail/.test(said(plate.h)), said(plate.h).split(' | ')[0]);
  ck('and says nothing about armour in cloth',
    !/slowed by/.test(said(cloth.h)), said(cloth.h).split(' | ')[0]);
  const leather = castRun('leather', { n: 1 });
  ck('leather is a tenth longer, not a tenth of a second longer',
    near(leather.barLength, fire.castTime * 1.1), `${leather.barLength} s`);
}

{
  // Chivalry, which is the exception the user asked for by name.
  const r = castRun('plate', { id: 'bless', n: 200 });
  const bless = ABILITIES_BY_ID.bless;
  ck('200 Blessings in full plate fizzle not once', r.fizzles === 0, `${r.fizzles} fizzled, ${r.landed} landed`);
  ck('and Bless casts for its own 0.5 s in plate, unslowed',
    r.barLength === bless.castTime, `${r.barLength} s against ${bless.castTime} s`);
  ck('and nothing in the log blames the armour',
    !/gets in the way|slowed by/.test(said(r.h)), 'the paladin casts in plate');
}

{
  // What a fizzle costs, forced both ways with an rng that cannot argue.
  const always = castRun('plate', { n: 1, rng: () => 0 });
  const never = castRun('plate', { n: 1, rng: () => 0.999 });
  ck('a fizzle spends half a Fireball\'s 9 mana and gives 5 back',
    always.fizzles === 1 && always.spentOnFizzle === 4, `${always.spentOnFizzle} mana spent`);
  ck('and a landed cast spends all nine of them',
    never.landed === 1 && never.spentOnLanding === 9, `${never.spentOnLanding} mana spent`);
  ck('the fizzle says which armour did it, in the log',
    /Fireball fizzles: your platemail gets in the way/.test(said(always.h)), said(always.h));
  ck('and floats a grey word over your own head as well',
    always.h.floaters.spawned.some((f) => /fizzle: platemail/.test(f.t) && f.k === 'miss'),
    always.h.floaters.spawned.map((f) => `${f.t} (${f.k})`).join(', ') || 'nothing floated');
  ck('and plays the denied cue', always.h.audio.played.includes('denied'), always.h.audio.played.join(', '));
  ck('a landing says none of that', !/fizzles/.test(said(never.h)), said(never.h));
}

{
  // A mixed suit, and the instant spell a plated mage would otherwise abuse.
  const eq = worn(null);
  eq.chest = makeItem({ base: 'plate_chest', seed: 2 });
  eq.legs = makeItem({ base: 'chain_legs', seed: 2 });
  const h = harness({ monsters: [mob('Skeleton', 0, 3)], equipment: eq });
  ck('a plate chest and chain legs burden a cast by (1 + 0.75) / 8',
    h.actor.castBurden === 0.2188, String(h.actor.castBurden));
  const view = h.abilities.barView(0);
  h.character.bar[0] = 'lightning';
  h.character.bar[1] = 'bless';
  h.character.bar[2] = 'powerStrike';
  const v = h.abilities.barView(0);
  ck('the bar tells the player before he presses anything',
    v[0].burden === 0.2188 && /gets in the way a little/.test(v[0].burdenText), v[0].burdenText);
  ck('a Chivalry row on the same bar shows nothing at all',
    v[1].burden === 0 && v[1].burdenText === '', `"${v[1].burdenText}"`);
  ck('and neither does a warrior ability', v[2].burden === 0 && v[2].burdenText === '');
  ck('an empty bar of twelve is still twelve entries', view.length === 12);

  // Lightning has no cast bar at all, and is burdened anyway: this is the
  // whole point of including the instants. Forced, so it is not a coin toss.
  const zap = castRun('plate', { id: 'lightning', n: 1, rng: () => 0 });
  ck('an instant Lightning in plate still fizzles, which is why instants are in',
    zap.fizzles === 1 && zap.barLength === 0, `${zap.fizzles} fizzled, bar ${zap.barLength} s`);
  const zapOk = castRun('plate', { id: 'lightning', n: 1, rng: () => 0.999 });
  ck('and lands when the roll is kind, with no cast bar either way',
    zapOk.landed === 1 && zapOk.barLength === 0, `${zapOk.landed} landed`);
}

{
  // The pure half, driven both ways.
  ck('the fizzle is six tenths of the burden', CAST_BURDEN_FIZZLE === 0.6
    && fizzleChance(1) === 0.6 && fizzleChance(0.1) === 0.06 && fizzleChance(0) === 0);
  ck('and it is clamped, so a broken number cannot make every cast fail',
    fizzleChance(5) === 0.6 && fizzleChance(-2) === 0);
  ck('a cast in plate takes twice as long, and in cloth exactly as long',
    burdenedCastTime(0.6, 1) === 1.2 && burdenedCastTime(0.6, 0) === 0.6 && burdenedCastTime(0, 1) === 0);
  ck('the four bands are none, a little, often and mostly',
    burdenBand(0) === 'none' && burdenBand(0.1) === 'a little' && burdenBand(BURDEN_MARK) === 'a little'
    && burdenBand(0.3) === 'often' && burdenBand(0.55) === 'often' && burdenBand(0.75) === 'mostly'
    && burdenBand(1) === 'mostly',
    [0, 0.1, 0.25, 0.3, 0.55, 0.75, 1].map((b) => `${b}: ${burdenBand(b)}`).join(', '));
  ck('the band and the amber corner agree on where the line is',
    [0.1, 0.25, 0.3, 1].every((b) => (burdenBand(b) === 'a little') === (b <= BURDEN_MARK)));
  ck('cloth gets no line to read at all', burdenText(0) === '');
  ck('and plate gets the two numbers it is promising',
    burdenText(1) === 'This armour mostly stops a spell: a cast takes twice as long, and 60 in 100 fizzle.',
    burdenText(1));
  ck('leather says a little, and says how little',
    burdenText(0.1) === 'This armour gets in the way a little: a cast takes 1.1 times as long, and 6 in 100 fizzle.',
    burdenText(0.1));
  ck('the materials are listed the way a sentence lists them',
    andList([]) === '' && andList(['platemail']) === 'platemail'
    && andList(['chainmail', 'ringmail']) === 'chainmail and ringmail'
    && andList(['a', 'b', 'c']) === 'a, b and c');
}

{
  // Every opening, measured, because a rule that quietly cripples the kit a
  // player is handed in the first minute is a bad rule however sound it reads.
  const rows = OPENINGS.map((o) => {
    const c = planCharacter({ opening: o.id, name: 'Testing', seed: 3 }).character;
    return { id: o.id, burden: castBurdenOf(c.equipment) };
  });
  const casters = rows.filter((r) => ['mage', 'sorcerer', 'necromancer', 'healer'].includes(r.id));
  ck('the four casting openings start in cloth and cast free',
    casters.every((r) => r.burden === 0), casters.map((r) => `${r.id} ${r.burden}`).join(', '));
  ck('and no opening starts above the amber mark, so nobody is handed a broken kit',
    rows.every((r) => r.burden <= BURDEN_MARK), rows.map((r) => `${r.id} ${r.burden}`).join(', '));
  const paladin = rows.find((r) => r.id === 'paladin');
  ck('the paladin starts in ringmail, and it costs his Chivalry nothing',
    paladin.burden === 0.1375 && burdensInArmour(ABILITIES_BY_ID.bless) === false,
    `burden ${paladin.burden}, Bless exempt`);
}

{
  // The fallback: a character with a paper doll and no recompute behind it.
  // Without it, a fixture would cast out of full plate as if it were naked.
  const h = harness({ monsters: [mob('Skeleton', 0, 3)], equipment: worn('plate'), burdenFromActor: false });
  ck('an actor with no castBurden field falls back to the paper doll',
    h.actor.castBurden === undefined && h.abilities.barView(0) && (() => {
      h.character.bar[0] = 'fireball';
      return h.abilities.barView(0)[0].burden === 1;
    })(), 'burden read from character.equipment');
  // and a character with no equipment at all is not burdened by anything
  const bare = harness({ monsters: [mob('Skeleton', 0, 3)] });
  bare.character.bar[0] = 'fireball';
  ck('and a fixture with no paper doll at all casts free, as it always did',
    bare.abilities.barView(0)[0].burden === 0 && bare.abilities.barView(0)[0].burdenText === '');
}

// --- practising a school you have not started -----------------------------------------
// SK2. Thirteen first rungs now open at 0 so their school can be started at
// all. This is the measurement that the gift is not free: Hex pressed two
// hundred times by a Mysticism 0 mage, through the real runtime, counting what
// fizzled, what landed, and what the skill did.
{
  // The progression is the real one; it needs the harness's own character, and
  // the harness needs the progression, so it is handed a holder and filled in.
  const holder = { lesson: null };
  const h = harness({
    bar: ['hex'], monsters: [mob('Skeleton', 0, 3)], seed: 5,
    extra: { progression: { lesson: (...a) => holder.lesson?.(...a) } },
  });
  // The harness hands out 100 in everything, which is 3600 points against
  // skills.js's 700 total cap, so every lesson would be refused for the cap and
  // not for the practice. A beginner has nothing, so this one does too.
  for (const k of Object.keys(h.character.skills)) h.character.skills[k] = 0;
  h.character.skillLocks = {};
  h.character.unlockedAbilities = ['hex'];
  const prog = createProgression({ character: h.character, actor: h.actor });
  const taught = [];
  holder.lesson = (...a) => { taught.push(a[0]); return prog.lesson(...a); };

  const outcome = [];
  let t = 0;
  for (let i = 0; i < 200; i++) {
    h.actor.mana = 200;
    t += 10;                                     // past Hex's 6 s cooldown
    const before = h.hudLines.length;
    h.abilities.use(0, t);
    const said = h.hudLines.slice(before).map((l) => l.t).join(' ');
    outcome.push(/fizzles: your hand is not practised/.test(said) ? 'fizzle' : 'land');
  }
  const fizzlesIn = (from, to) => outcome.slice(from, to).filter((x) => x === 'fizzle').length;
  const fizzles = fizzlesIn(0, 200);
  ck('the first twenty presses at Mysticism 0 almost all fizzle',
    fizzlesIn(0, 20) >= 15, `${fizzlesIn(0, 20)} of the first 20 fizzled`);
  ck('and the last twenty, by then past the mark, almost none do',
    fizzlesIn(180, 200) <= 3, `${fizzlesIn(180, 200)} of the last 20 fizzled`);
  ck('every one of the 200 taught Mysticism, fizzle or not',
    taught.length === 200 && taught.every((x) => x === 'mysticism'),
    `${taught.length} lessons, ${new Set(taught).size} skill(s)`);
  ck('and the skill is off zero at the end of it, which is the whole point',
    h.character.skills.mysticism > 20,
    `Mysticism 0 to ${h.character.skills.mysticism} over 200 presses, ${fizzles} of them fizzled`);
  ck('and every fizzle says what it did',
    h.hudLines.some((l) => /You feel a little of how it should go/.test(l.t)),
    h.hudLines.find((l) => /fizzles: your hand/.test(l.t))?.t || 'nothing said');
  ck('the same press at its own mark never fizzles for want of practice',
    (() => {
      const m = harness({ bar: ['hex'], monsters: [mob('Skeleton', 0, 3)], seed: 5 });
      m.character.skills.mysticism = 20;
      let f = 0, tt = 0;
      for (let i = 0; i < 50; i++) {
        m.actor.mana = 200; tt += 10;
        const b = m.hudLines.length;
        m.abilities.use(0, tt);
        if (m.hudLines.slice(b).some((l) => /not practised/.test(l.t))) f++;
      }
      return f === 0;
    })(), 'no fizzles at the mark');
}

// --- walking while hidden, which is the whole of Stealth --------------------------------
// It used to be `!num(skills.stealth)`: seen at once at 0, never seen at 0.3,
// and no lesson either way, so the first tenth of a point could only be bought.
{
  const holder = { lesson: null };
  const h = harness({
    bar: ['hide'], monsters: [], seed: 9,
    extra: { progression: { lesson: (...a) => holder.lesson?.(...a) } },
  });
  for (const k of Object.keys(h.character.skills)) h.character.skills[k] = 0;
  h.character.skillLocks = {};
  const prog = createProgression({ character: h.character, actor: h.actor });
  const taught = [];
  holder.lesson = (...a) => { taught.push(a[0]); return prog.lesson(...a); };

  let seen = 0, held = 0, t = 0;
  for (let i = 0; i < 60; i++) {
    h.actor.hidden = { requiresStill: true };
    h.player.speed = 0;
    t += 1;
    h.abilities.update(0.1, t);                 // standing still: no roll at all
    h.player.speed = 5;
    t += 2;                                     // past STEALTH_STEP_S
    h.abilities.update(0.1, t);
    if (h.actor.hidden) held++; else seen++;
  }
  ck('one roll per step taken, and none at all for standing still',
    taught.length === 60, `${taught.length} rolls across 60 still updates and 60 moving ones`);
  ck('a step at Stealth 0 nearly always gives you away, and says so',
    seen > 45 && h.hudLines.some((l) => /Moving gave you away/.test(l.t)), `${seen} seen, ${held} held`);
  ck('and every step taught Stealth, which is how the skill starts at all',
    taught.every((x) => x === 'stealth') && h.character.skills.stealth > 0,
    `${taught.length} lessons, Stealth ${h.character.skills.stealth}`);
  ck('the hold chance is the skill, floor to ceiling, driven both ends',
    stealthHoldChance(0) === 0.05 && stealthHoldChance(100) === 0.95 && stealthHoldChance(-5) === 0.05,
    `${stealthHoldChance(0)} at 0, ${stealthHoldChance(50).toFixed(2)} at 50, ${stealthHoldChance(100)} at 100`);
}

// --- the bar cell knows the gate ------------------------------------------------------
{
  const h = harness({ bar: ['meteor', 'hex'], monsters: [mob('Skeleton', 0, 3)] });
  h.character.skills.magery = 0;
  h.character.skills.mysticism = 0;
  const view = h.abilities.barView(0);
  ck('a cell holding a row you do not meet is greyed and says the card s own line',
    view[0].unusable === true && /Needs Magery 85, you are at 0/.test(view[0].unusableReason),
    view[0].unusableReason);
  ck('and a cell you may press but have not earned is not greyed, and says how often it lands',
    view[1].unusable === false && view[1].practising === true && /5 in 100 land/.test(view[1].unusableReason),
    view[1].unusableReason);
  h.character.skills.magery = 100;
  h.character.skills.mysticism = 100;
  const met = h.abilities.barView(0);
  ck('and once both are yours the cell says nothing at all, which is the other direction',
    met[0].unusable === false && met[0].unusableReason === '' && met[1].unusableReason === '',
    `"${met[0].unusableReason}" / "${met[1].unusableReason}"`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
