// The four hooks, measured. Run: node src/game/ability_hooks.test.mjs
//
// Nothing here is asserted from the shape of the code. A summon is a real
// `spawnMonster` actor in a real monsters stand-in, its swings go through the
// real `combat.queueSwing`, its ore comes out of the real `inventory`, and
// every gate is driven BOTH ways: a summon that finds an enemy and one that
// finds none, a purse picked and a purse missed, a stack transmuted and a stack
// at the top of the ladder that cannot be, a meditation that fills and one that
// a blow breaks.

import {
  createAbilityHooks, auditSummonCreatures, summonCreaturesInTable,
  SUMMON_CREATURES, MAX_SUMMONS, SUMMON_SEEK, stealChance, nextOre,
  CAMP_RESTED_REGEN, CAMP_RESTED_S, MEDITATE_MULT, WILD_FAMILIES,
} from './ability_hooks.js';
import { playerActor, spawnMonster, recompute } from './actor.js';
import { createCombat } from './combat.js';
import { createInventory } from './inventory.js';
import { ABILITIES, ABILITIES_BY_ID } from '../mmo/abilities.js';
import { MONSTERS } from '../mmo/monsters.js';
import { makeItem, baseFor } from '../mmo/items.js';
import { SKILL_IDS } from '../mmo/abilities.js';

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// --- the harness --------------------------------------------------------------

function harness(opts = {}) {
  const lines = [];
  const hud = { log: (t, k) => lines.push({ t: String(t), k }), toast: (t, k) => lines.push({ t: String(t), k }) };
  const floaters = { spawned: [], spawn: (p, t, k) => floaters.spawned.push({ t, k }) };
  const audio = { played: [], play: (c) => audio.played.push(c) };

  const skills = {};
  for (const id of SKILL_IDS) skills[id] = opts.skill ?? 100;
  const character = {
    name: 'Test', skills, skillLocks: {},
    stats: { str: 80, dex: 80, int: 80, con: 80, wis: 80 }, statLocks: {},
    gold: 0, bar: new Array(12).fill(null), equipment: {},
    pack: { slots: 20, items: new Array(20).fill(null) },
  };
  const inventory = createInventory({ character, hud });
  for (const it of opts.pack || []) inventory.add(makeItem(it));

  const pos = { x: 0, y: 0, z: 0 };
  const actor = playerActor(character, { pos });
  recompute(actor);
  const combat = createCombat({ floaters, hud, audio, recompute, rng: seeded(9) });

  const live = [];
  let n = 0;
  const alive = (a) => a && num(a.health) > 0 && !a.dead;
  const monsters = {
    all: () => live.slice(),
    actors: () => live.filter((m) => alive(m.actor) && !m.friendly).map((m) => m.actor),
    friendlies: () => live.filter((m) => alive(m.actor) && m.friendly).map((m) => m.actor),
    spawnAt(id, x, z) {
      const a = spawnMonster(id, { x, y: 0, z }, seeded(n + 3));
      const mon = { key: `t:${id}:${++n}`, id, name: a.name, actor: a, friendly: false, ephemeral: true };
      a.ai = { home: { x, z }, state: 'idle', target: null };
      live.push(mon);
      return mon;
    },
    spawnAlly(id, x, z) { const m = monsters.spawnAt(id, x, z); if (m) monsters.makeAlly(m); return m; },
    makeAlly(m) { m.friendly = true; m.actor.faction = 'player'; m.actor.summoned = true; m.actor.ai.target = null; return m; },
    releaseAlly(m) { m.friendly = false; m.actor.faction = 'hostile'; m.actor.summoned = false; return m; },
    despawn(key) { const i = live.findIndex((m) => m.key === key); if (i >= 0) { combat.forget(live[i].actor); live.splice(i, 1); } },
    nearestHostile(p, yaw, range, half) {
      let best = null, bd = range;
      for (const m of live) {
        if (!alive(m.actor) || m.friendly) continue;
        const d = Math.hypot(m.actor.pos.x - p.x, m.actor.pos.z - p.z);
        if (d < bd) { bd = d; best = m; }
      }
      return best;
    },
    swings: [],
    swingAt(a, d, o) { const r = combat.queueSwing(a, d, o); monsters.swings.push({ a, d, o, r }); return r; },
  };

  const rig = { speed: 0, yaw: 0, pos, state: { x: 0, y: 0, z: 0, yaw: 0, airborne: false } };
  let dying = !!opts.dying;
  const woke = [];
  const hooks = createAbilityHooks({
    character, actor, monsters, combat, inventory, hud, floaters, audio, player: rig,
    ownerTarget: () => opts.ownerTarget?.() ?? null,
    inCombat: () => !!opts.inCombat,
    recompute: (who) => recompute(who || actor),
    isDying: () => dying,
    wake: () => { dying = false; woke.push(true); return true; },
    rng: typeof opts.rng === 'function' ? opts.rng : seeded(opts.seed ?? 4),
  });

  return {
    hooks, character, actor, inventory, combat, monsters, live, rig, lines, hud, floaters, audio, woke,
    setDying: (v) => { dying = v; },
    said: () => lines.map((l) => l.t).join(' | '),
    /** dt seconds of the world, on one clock, exactly as the game drives it. */
    run(seconds, dt = 1 / 30, from = 0) {
      let t = from, ms = from * 1000;
      for (let i = 0; i * dt < seconds; i++) {
        t += dt; ms += dt * 1000;
        hooks.update(dt, ms, t);
        combat.update(dt * 1000, ms);
      }
      return { t, ms };
    },
  };
}

// --- the summon table cannot drift --------------------------------------------
console.log('ability_hooks: the summon table');
{
  const inTable = summonCreaturesInTable();
  ck(`the ability table names ${inTable.length} creatures and every one has a row`,
    inTable.every((c) => !!SUMMON_CREATURES[c]), inTable.filter((c) => !SUMMON_CREATURES[c]).join(',') || inTable.join(', '));
  ck('and every row that names a monster names one the roster really has',
    Object.values(SUMMON_CREATURES).every((r) => r.wild || !!MONSTERS[r.monster]),
    Object.entries(SUMMON_CREATURES).filter(([, r]) => !r.wild && !MONSTERS[r.monster]).map(([k]) => k).join(',') || 'all real');
  ck('the two the roster never had are mapped, not dropped',
    SUMMON_CREATURES.imp.monster === 'cinderImp' && SUMMON_CREATURES.shadowHound.monster === 'boneHound',
    `${SUMMON_CREATURES.imp.monster} / ${SUMMON_CREATURES.shadowHound.monster}`);
  ck('the audit throws when the table loses a creature', (() => {
    try { auditSummonCreatures(ABILITIES, { skeletonWarrior: { monster: 'skeletonWarrior' } }); return false; }
    catch (e) { return /imp|shadowHound/.test(e.message); }
  })());
  ck('and when a row points at a monster the roster does not have', (() => {
    try {
      auditSummonCreatures([], { ghoulKing: { monster: 'notAMonster' } });
      return false;
    } catch (e) { return /notAMonster/.test(e.message); }
  })());
}

// --- a summon stands, fights, and goes ----------------------------------------
console.log('\nability_hooks: a summon stands up, fights, and goes when its time is up');
{
  // The wolf stands within the skeleton's arm, because WALKING IS NOT THIS
  // FILE'S. `monsters.update` walks a body through `stepMonster` and needs a
  // THREE scene and a world field, so what is measured here is everything the
  // hook itself owns: who it picks, that the swing goes through the real
  // resolver, that health really comes off, when it goes and what it says.
  const h = harness();
  const foe = h.monsters.spawnAt('wolf', 1.6, 1.6);
  const mon = h.hooks.summon('skeletonWarrior', { x: 1, y: 0, z: 1 }, { duration: 60, abilityId: 'raiseSkeleton' });
  ck('the summon is a real monster out of the real spawner', !!mon && mon.actor.monsterId === 'skeletonWarrior', mon?.id);
  ck('it is on your side, by faction as well as by flag',
    mon.friendly === true && mon.actor.faction === 'player', `${mon.friendly} / ${mon.actor.faction}`);
  ck('and it says so, by name and for how long',
    /Skeleton Warrior stands up beside you for 60 seconds/.test(h.said()), h.said());
  ck('it is not in the hostile list a Whirlwind would cut',
    !h.monsters.actors().includes(mon.actor) && h.monsters.friendlies().includes(mon.actor));

  h.run(0.5);
  ck('with a wolf four metres off it picks the wolf and nothing else',
    mon.actor.ai.target === foe.actor, mon.actor.ai.target?.name || 'nobody');
  ck('and it says whose side it is taking, out loud',
    /Skeleton Warrior goes for the Wolf/.test(h.said()), h.said().split('|').pop().trim());
  ck('every swing it asked for was at the wolf and never at anything else',
    h.monsters.swings.length > 0 && h.monsters.swings.every((s) => s.a === mon.actor && s.d === foe.actor),
    `${h.monsters.swings.length} asked`);
  ck('and it NEVER pointed itself at the player', mon.actor.ai.target !== h.actor);

  // `spawnMonster` seeds `lastSwingAt` at a random negative time so a field of
  // skeletons does not swing in lockstep, so the first accepted swing is up to
  // one swing timer away. Six seconds is two of the Skeleton Warrior's.
  const before = num(foe.actor.health);
  h.run(6, 1 / 30, 0.5);
  ck('the resolver accepted at least one of them: a summon pays a swing timer like anything else',
    h.monsters.swings.some((s) => s.r.queued === true),
    `${h.monsters.swings.filter((s) => s.r.queued).length} of ${h.monsters.swings.length} accepted`);
  ck('and the wolf really lost health to it', num(foe.actor.health) < before,
    `${before} to ${num(foe.actor.health)}`);
}
{
  // the other way: nothing to fight
  const h = harness();
  const mon = h.hooks.summon('boneKnight', { x: 6, y: 0, z: 6 }, { duration: 60 });
  h.run(0.5);
  ck('with nothing hostile in the world a summon has no target at all', mon.actor.ai.target === null);
  ck('and it heels to the caster rather than standing where it was raised',
    Math.hypot(mon.actor.ai.home.x - h.rig.pos.x, mon.actor.ai.home.z - h.rig.pos.z) <= 3.001,
    `home ${mon.actor.ai.home.x.toFixed(1)},${mon.actor.ai.home.z.toFixed(1)}`);
}
{
  // and one just outside its own seeking range is not found
  const h = harness();
  const far = h.monsters.spawnAt('wolf', 0, SUMMON_SEEK + 4);
  const mon = h.hooks.summon('boneKnight', { x: 0, y: 0, z: 0 }, { duration: 60 });
  h.run(0.5);
  ck(`a hostile ${SUMMON_SEEK + 4} m off, with a ${SUMMON_SEEK} m eye, is not picked up`,
    mon.actor.ai.target === null, mon.actor.ai.target?.name || 'nobody');
  far.actor.pos.z = 5;
  h.run(0.2);
  ck('and the moment it walks inside that eye, it is', mon.actor.ai.target === far.actor);
}
{
  const h = harness();
  h.hooks.summon('skeletonWarrior', { x: 1, y: 0, z: 1 }, { duration: 4 });
  h.run(3);
  ck('at 3 s of a 4 s summon it is still standing', h.hooks.summons.length === 1);
  h.run(2, 1 / 30, 3);
  ck('and at 5 s it is gone', h.hooks.summons.length === 0 && h.live.length === 0,
    `${h.hooks.summons.length} held, ${h.live.length} alive`);
  ck('and it said so rather than vanishing',
    /goes back where it came from: its time is up/.test(h.said()), h.said().split('|').pop().trim());
}
{
  const h = harness();
  for (let i = 0; i < MAX_SUMMONS; i++) h.hooks.summon('skeletonWarrior', { x: i, y: 0, z: 1 }, { duration: 60 });
  ck(`${MAX_SUMMONS} stand at once`, h.hooks.summons.length === MAX_SUMMONS, String(h.hooks.summons.length));
  h.hooks.summon('boneKnight', { x: 4, y: 0, z: 1 }, { duration: 60 });
  ck('a fourth puts the oldest down rather than growing an army',
    h.hooks.summons.length === MAX_SUMMONS && h.hooks.summons[MAX_SUMMONS - 1].name === 'Bone Knight',
    h.hooks.summons.map((s) => s.name).join(', '));
  ck('and says which one went and why',
    /could not hold them all/.test(h.said()), h.said().split('|').filter((x) => /hold them all/.test(x))[0] || 'nothing');
}
{
  const h = harness();
  const mon = h.hooks.summon('skeletonWarrior', { x: 1, y: 0, z: 1 }, { duration: 60 });
  mon.actor.health = 0;
  h.run(0.2);
  ck('a summon that is killed is let go, out loud',
    h.hooks.summons.length === 0 && /Skeleton Warrior falls/.test(h.said()), h.said().split('|').pop().trim());
}
{
  // Raise Champion's "as strong as you are"
  const h = harness();
  const plain = spawnMonster('boneKnight', { x: 0, y: 0, z: 0 });
  h.actor.maxHealth = plain.maxHealth * 2;
  const mon = h.hooks.summon('boneKnight', { x: 1, y: 0, z: 1 }, { duration: 120, scalesWithCaster: true });
  ck('a champion raised by a tougher caster is tougher than the roster row',
    mon.actor.maxHealth > plain.maxHealth && mon.actor.health === mon.actor.maxHealth,
    `${mon.actor.maxHealth} against the row's ${plain.maxHealth}`);
}

// --- Beast Call ----------------------------------------------------------------
console.log('\nability_hooks: Beast Call takes what is already standing');
{
  const h = harness();
  const wolf = h.monsters.spawnAt('wolf', 0, 6);
  const man = h.monsters.spawnAt('bandit', 0, 3);
  const got = h.hooks.summon('nearestWildBeast', null, { duration: 30, range: 30 });
  ck('it takes the nearest WILD thing and not the nearer man',
    got === wolf && wolf.friendly === true && man.friendly === false, got?.name);
  ck('nothing was spawned: the world had it already', h.live.length === 2, String(h.live.length));
  ck('and it says so', /Wolf comes to the call and takes your side for 30 seconds/.test(h.said()), h.said());
  h.run(31);
  ck('at the end of the half minute it is wild again, not despawned',
    wolf.friendly === false && wolf.actor.faction === 'hostile' && h.live.length === 2,
    `${wolf.friendly} / ${h.live.length} alive`);
  ck('and that is said in its own words', /loses interest and goes back to being wild/.test(h.said()));
}
{
  const h = harness();
  h.monsters.spawnAt('skeleton', 0, 3);
  const got = h.hooks.summon('nearestWildBeast', null, { duration: 30, range: 30 });
  ck('with nothing wild in reach the call is refused, with the distance in it',
    got === null && /nothing wild within 30 m/.test(h.said()), h.said());
  ck('and the two families it will take are written down', WILD_FAMILIES.join(',') === 'beast,critter');
}

// --- allies --------------------------------------------------------------------
console.log('\nability_hooks: who counts as an ally');
{
  const h = harness();
  ck('with nothing summoned, an ally list is you alone',
    h.hooks.allies().length === 1 && h.hooks.allies()[0] === h.actor);
  const mon = h.hooks.summon('skeletonWarrior', { x: 1, y: 0, z: 1 }, { duration: 60 });
  ck('and a summon joins it', h.hooks.allies().length === 2 && h.hooks.allies().includes(mon.actor));
  mon.actor.health = 0;
  ck('a dead one does not', h.hooks.allies().length === 1);
}

// --- resurrect -----------------------------------------------------------------
console.log('\nability_hooks: raising the fallen');
{
  const h = harness({ dying: true });
  const words = h.hooks.resurrect(h.actor, h.actor);
  ck('cast on yourself while the death count runs, it wakes you through the player system',
    h.woke.length === 1 && /pulled back before the count runs out/.test(words), words);
}
{
  const h = harness({ dying: false });
  const words = h.hooks.resurrect(h.actor, h.actor);
  ck('cast on yourself alive, it refuses and says why',
    h.woke.length === 0 && /on your feet already/.test(words), words);
}
{
  const h = harness();
  const mon = h.hooks.summon('skeletonWarrior', { x: 1, y: 0, z: 1 }, { duration: 60 });
  mon.actor.health = 0; mon.actor.dead = true;
  const words = h.hooks.resurrect(mon.actor, h.actor);
  ck('a fallen ally gets up at half health, and the number is in the words',
    mon.actor.health === Math.round(mon.actor.maxHealth * 0.5) && !mon.actor.dead
    && words.includes(String(mon.actor.health)), words);
}
{
  const h = harness();
  const foe = h.monsters.spawnAt('wolf', 0, 3);
  ck('and something that never went down is refused by name',
    /never went down/.test(h.hooks.resurrect(foe.actor, h.actor)), h.hooks.resurrect(foe.actor, h.actor));
  ck('and nobody at all is refused too', /nobody here to raise/i.test(h.hooks.resurrect(null)));
}

// --- meditate ------------------------------------------------------------------
console.log('\nability_hooks: sitting still for mana');
{
  const h = harness();
  h.actor.mana = 10;
  const words = h.hooks.utility.meditate({ manaRegenMult: MEDITATE_MULT }, { now: 0 });
  ck('it says the multiplier it is about to keep',
    /3 times as fast/.test(words) && !!h.actor.meditating, words);
  const start = h.actor.mana;
  h.run(4);
  const gained = h.actor.mana - start;
  const plain = num(h.actor.manaRegen) * 4 * (MEDITATE_MULT - 1);
  ck('four seconds of sitting adds the EXTRA two thirds and not a fourth helping',
    Math.abs(gained - plain) < 1e-6, `${gained.toFixed(4)} against ${plain.toFixed(4)}`);
  h.actor.health -= 5;
  h.run(0.2);
  ck('a blow breaks it, and says how much came back before it did',
    h.actor.meditating === null && /breaks your meditation/.test(h.said()), h.said().split('|').pop().trim());
}
{
  const h = harness();
  h.actor.mana = h.actor.maxMana;
  const words = h.hooks.utility.meditate({}, { now: 0 });
  ck('sitting down with full mana is refused rather than done in silence',
    !h.actor.meditating && /already full/.test(words), words);
}
{
  const h = harness();
  h.actor.mana = h.actor.maxMana - 0.2;
  h.hooks.utility.meditate({}, { now: 0 });
  h.run(20);
  ck('and when it fills, it says so and you get up',
    h.actor.meditating === null && h.actor.mana === h.actor.maxMana && /Your mana is full/.test(h.said()),
    h.said().split('|').pop().trim());
}

// --- camp ----------------------------------------------------------------------
console.log('\nability_hooks: the fire');
{
  const h = harness();
  h.actor.health = 10; h.actor.stamina = 5;
  const words = h.hooks.utility.camp({}, { now: 0 });
  ck('the fire catches and says what it is for', /fire catches/.test(words) && !!h.actor.camping, words);
  h.run(2);
  ck('health and stamina both came back', h.actor.health > 10 && h.actor.stamina > 5,
    `${h.actor.health.toFixed(1)} health, ${h.actor.stamina.toFixed(1)} stamina`);
  const rested = (h.actor.buffs || []).find((b) => b.abilityId === 'camp');
  ck('the Rested buff is really on the actor, with a duration', !!rested && rested.until > 0, rested?.name);
  ck('and it is a shape recompute already reads, so it is not decoration',
    !!rested && !!rested.effect.regen && h.actor.manaRegen > 0,
    JSON.stringify(rested?.effect?.regen || null));
  ck('the regeneration on the actor really moved',
    h.actor.manaRegen >= CAMP_RESTED_REGEN.manaRegen, String(h.actor.manaRegen));
  ck(`and the words name the ${Math.round(CAMP_RESTED_S / 60)} minutes it lasts`,
    new RegExp(`${Math.round(CAMP_RESTED_S / 60)} minutes`).test(h.said()),
    h.said().split('|').filter((x) => /Rested/.test(x))[0] || 'nothing');
  h.rig.speed = 5;
  h.run(0.2);
  ck('standing up puts it out, out loud',
    h.actor.camping === null && /leave the fire/.test(h.said()), h.said().split('|').pop().trim());
}
{
  const h = harness({ inCombat: true });
  const words = h.hooks.utility.camp({}, { now: 0 });
  ck('a fire is not built in a fight, and it says so', !h.actor.camping && /in a fight/.test(words), words);
}

// --- transmute -----------------------------------------------------------------
console.log('\nability_hooks: one stack of ore becomes the next');
{
  const h = harness({ pack: [{ base: 'iron_ore', count: 12 }] });
  const words = h.hooks.utility.transmute({ loss: 0.3 }, {});
  const items = h.character.pack.items.filter(Boolean);
  ck('twelve iron become eight silver, and the loss is named',
    items.length === 1 && items[0].base === 'silver_ore' && items[0].count === 8
    && /12 Iron Ore becomes 8 Silver Ore/.test(words) && /4 was lost/.test(words), words);
  ck('the ladder is read off ores.js and not guessed', nextOre('iron').id === 'silver' && nextOre('starfall') === null);
}
{
  const h = harness({ pack: [{ base: 'starfall_ore', count: 10 }] });
  const words = h.hooks.utility.transmute({ loss: 0.3 }, {});
  ck('the top of the ladder is refused by name, and the stack is untouched',
    /last rung/.test(words) && h.character.pack.items[0].count === 10, words);
}
{
  const h = harness({ pack: [{ base: 'longsword' }] });
  ck('with no ore at all it says that, rather than eating the sword',
    /no ore in your pack/.test(h.hooks.utility.transmute({}, {})) && !!h.character.pack.items[0]);
}
{
  const h = harness({ pack: [{ base: 'iron_ore', count: 1 }] });
  const words = h.hooks.utility.transmute({ loss: 0.3 }, {});
  ck('one lump, which three tenths would leave nothing of, is refused and kept',
    /too small a stack/.test(words) && h.character.pack.items[0].base === 'iron_ore'
    && h.character.pack.items[0].count === 1,
    `${words} / ${h.character.pack.items[0]?.base} x${h.character.pack.items[0]?.count}`);
}

// --- pick pocket ---------------------------------------------------------------
console.log('\nability_hooks: a hand in a pocket');
{
  ck('the chance rises with Stealing and is capped at both ends',
    stealChance(100, 40) === 0.95 && stealChance(0, 40) === 0.1 && stealChance(0, 200) === 0.05,
    `${stealChance(100, 40)} / ${stealChance(0, 40)} / ${stealChance(0, 200)}`);
  ck('and it is strictly better to be better at it', stealChance(60, 40) > stealChance(50, 40));
}
{
  const h = harness({ rng: () => 0 });                 // every roll succeeds
  const man = h.monsters.spawnAt('bandit', 0, 1.2);
  const words = h.hooks.utility.steal({ from: 'humanoid' }, { target: man.actor, now: 0 });
  ck('a successful pick takes real gold onto the character, and counts it out',
    h.character.gold > 0 && new RegExp(`${h.character.gold}`).test(words), `${h.character.gold} gold: ${words}`);
  const again = h.hooks.utility.steal({ from: 'humanoid' }, { target: man.actor, now: 0 });
  ck('and the same pocket cannot be picked twice', /already had everything/.test(again), again);
}
{
  const h = harness({ rng: () => 0.999 });             // every roll fails
  const man = h.monsters.spawnAt('bandit', 0, 1.2);
  const words = h.hooks.utility.steal({ from: 'humanoid' }, { target: man.actor, now: 0 });
  ck('a failed pick takes nothing, turns it on you, and quotes the odds',
    h.character.gold === 0 && man.actor.ai.target === h.actor && /in 100 of getting away with it/.test(words), words);
}
{
  const h = harness({ rng: () => 0 });
  const bones = h.monsters.spawnAt('skeleton', 0, 1.2);
  const words = h.hooks.utility.steal({ from: 'humanoid' }, { target: bones.actor, now: 0 });
  ck('something with no pockets is refused by what it is',
    /an undead/.test(words) && h.character.gold === 0, words);
  ck('and nobody at all is refused too', /nobody in reach/.test(h.hooks.utility.steal({}, {})));
}

// --- Beast Call answers with an animal by Animal Lore (2026-09-08) ------------
{
  const { summonMonsterFor, SUMMON_CREATURES } = await import('./ability_hooks.js');
  const row = SUMMON_CREATURES.calledBeast;
  ck('Beast Call is a real summon now, a wolf at the floor', row && !row.wild && row.monster === 'wolf');
  ck('at Animal Lore 0 a wolf comes', summonMonsterFor(row, { animalLore: 0 }) === 'wolf');
  ck('at 69 still a wolf', summonMonsterFor(row, { animalLore: 69 }) === 'wolf');
  ck('at 70 a boar', summonMonsterFor(row, { animalLore: 70 }) === 'boar');
  ck('at 90 a dire wolf', summonMonsterFor(row, { animalLore: 90 }) === 'direWolf');
  ck('a row without a ladder is its own monster', summonMonsterFor({ monster: 'skeleton' }, { animalLore: 100 }) === 'skeleton');
  ck('and the ranger opening at Animal Lore 35 calls a wolf, which is what the description promises first', summonMonsterFor(row, { animalLore: 35 }) === 'wolf');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
