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
} from './abilities_runtime.js';
import { createTargeting } from './targeting.js';
import {
  ABILITIES, ABILITIES_BY_ID, EFFECT_KINDS, canUse, unlockedFor, weaponNeeds, weaponCheck,
} from '../mmo/abilities.js';
import { OPENINGS } from '../mmo/openings.js';
import { planCharacter } from './creation.js';
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

{
  // The skeleton is BEHIND him, so the cone in front finds nobody: this is the
  // real "nothing selected and nothing under the cursor" case.
  const behind = mob('Skeleton', 0, -3);
  const h = harness({ bar: ['fireball'], monsters: [behind] });
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
  const h = harness({ bar: ['fireball'], monsters: [mob('Skeleton', 0, -3)], extra: { input: kb } });
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
  const h = harness({ bar: ['fireball'], monsters: [mob('Skeleton', 0, -3)] });
  h.abilities.use(0, 0);
  h.abilities.update(0.1, PENDING_SECONDS - 0.001);
  ck(`at ${PENDING_SECONDS - 0.001} s it is still waiting`, !!h.abilities.pending, 'held');
  h.abilities.update(0.1, PENDING_SECONDS);
  ck(`and at exactly ${PENDING_SECONDS} s it lapses`, h.abilities.pending === null);
  ck('saying how long it waited', /6 seconds/.test(said(h)), said(h).split('|').pop().trim());
}
{
  const h = harness({ bar: ['fireball', 'lightning'], monsters: [mob('Skeleton', 0, -3)] });
  h.abilities.use(0, 0);
  h.abilities.use(1, 0.2);
  ck('reaching for another ability puts the first one down, by name',
    /Fireball is no longer waiting for a target: you reached for Lightning instead/.test(said(h)),
    said(h).split('|').filter((s) => /no longer waiting/.test(s))[0] || 'nothing said');
  ck('and the second one is the one now waiting', h.abilities.pending?.ability.id === 'lightning',
    h.abilities.pending?.ability.id || 'none');
}
{
  const h = harness({ bar: ['fireball'], monsters: [mob('Skeleton', 0, -3)] });
  h.abilities.use(0, 0);
  const r = h.abilities.use(0, 0.2);
  ck('pressing the same key again puts it down rather than picking it back up',
    r.cancelled === true && h.abilities.pending === null && /you pressed it again/.test(said(h)),
    said(h).split('|').pop().trim());
  ck('and that costs nothing either', h.actor.mana === 200, `${h.actor.mana}`);
}
{
  const h = harness({ bar: ['fireball'], monsters: [mob('Skeleton', 0, -3)] });
  h.abilities.use(0, 0);
  const r = h.abilities.onTargetPicked(null, 0.3);
  ck('a click on bare ground puts it down and says so',
    r.ok === false && h.abilities.pending === null && /clicked bare ground/.test(said(h)), r.reason);
}
{
  const h = harness({ bar: ['fireball'], monsters: [mob('Skeleton', 0, -3)] });
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
  h.abilities.update(0.1, 1.1);
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
    dry.ok === false && /wants a bow drawn and arrows in the pack/.test(dry.reason), dry.reason);
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
  ck('and leaves the spell alone, which needs nothing in hand',
    v[1].unusable === false && v[1].unusableReason === '' && v[1].needs === 'none');
  ck('and marks the shot, which has no bow behind it',
    v[2].unusable === true && /bow drawn/.test(v[2].unusableReason), v[2].unusableReason);
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
  const weaponKinds = ['melee', 'anyMelee', 'unarmed', 'ranged', 'shield', 'instrument'];
  const rows = [];
  for (const op of OPENINGS) {
    const plan = planCharacter({ opening: op.id, name: 'Testing', seed: 3 });
    if (!plan.ok) { rows.push({ id: op.id, error: plan.reason }); continue; }
    const c = plan.character;
    const wanted = unlockedFor(c.skills, c.stats)
      .filter((x) => !x.passive && weaponKinds.includes(weaponNeeds(x).kind));
    const refused = wanted.filter((x) => !weaponCheck(x, c.equipment, c.pack).ok);
    rows.push({ id: op.id, wanted: wanted.length, refused: refused.map((x) => x.id) });
  }
  for (const r of rows) {
    console.log(`  ${r.id.padEnd(12)} ${String(r.wanted).padStart(2)} weapon abilities unlocked, refused: ${r.refused.join(', ') || 'none'}`);
  }
  const offenders = rows.filter((r) => r.refused.length);
  // The ranger once started with a dagger in the main hand and the bow on the
  // back, so every archery ability was refused. creation.js now leaves the
  // melee weapon in the pack when the kit draws a bow, and no opening starts
  // unable to use what it unlocked.
  ck('no opening starts unable to use an ability its own kit unlocked',
    offenders.length === 0,
    offenders.map((r) => `${r.id}: ${r.refused.join(', ')}`).join(' | ') || 'none');
  ck('the ranger draws the bow and keeps the dagger in the pack',
    (() => {
      const c = planCharacter({ opening: 'ranger', name: 'Testing', seed: 3 }).character;
      const r = weaponCheck(ABILITIES_BY_ID.aimedShot, c.equipment, c.pack);
      const daggerPacked = c.pack.items.some((it) => it && it.base === 'dagger');
      return r.ok && !c.equipment.mainHand && !!c.equipment.ranged && daggerPacked;
    })(),
    'aimed shot allowed with an empty main hand, the bow drawn and the dagger packed');
  ck('and with the dagger off, the shortbow and its sixty arrows answer',
    (() => {
      const c = planCharacter({ opening: 'ranger', name: 'Testing', seed: 3 }).character;
      c.equipment.mainHand = null;
      return weaponCheck(ABILITIES_BY_ID.aimedShot, c.equipment, c.pack).ok === true;
    })(), '60 arrows in the pack');
  ck('the bard plays on the lute the kit equips',
    (() => {
      const c = planCharacter({ opening: 'bard', name: 'Testing', seed: 3 }).character;
      return weaponCheck(ABILITIES_BY_ID.provoke, c.equipment, c.pack).ok === true;
    })(), 'rapier in hand, lute in the off hand');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
