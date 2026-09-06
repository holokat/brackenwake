#!/usr/bin/env node
// Every ability, pressed for real, and what actually moved.
//
//   node scripts/audit-abilities.mjs            the table
//   node scripts/audit-abilities.mjs --verbose  the table and every line said
//   node scripts/audit-abilities.mjs --only=fireball,heal
//
// WHY THIS EXISTS. "Most magery skills dont seem to work" is not a bug report a
// reader can act on, and "I tested it" is not a claim this project accepts. So
// this presses all 78 rows of `src/mmo/abilities.js` through the REAL runtime
// (`createAbilities`), with a REAL player actor and REAL monsters out of
// `src/game/actor.js`, the REAL resolver out of `src/game/combat.js`, the REAL
// progression out of `src/game/progression.js`, and the REAL hooks out of
// `src/game/ability_hooks.js`, the same module `app/systems/abilities.js`
// passes in, so this measures the game and not a kinder fixture.
//
// It then records, per ability:
//
//   said       the words the HUD was given
//   dmg        health taken off the target
//   pools      what moved on the player: health, mana, stamina
//   state      buffs, debuffs, control, dots, marks, zones, summons, corpses,
//              teaching, position, enchantments, hidden, forms
//   verdict    ok        it changed the world, and said so
//              cost only ONLY the cost moved: it took your mana or your
//                        stamina and nothing else happened. Listed, and only a
//                        failure when it also said nothing.
//              refused   it changed nothing at all and said exactly why
//              passive   never pressed; `applyPassives` carries it
//              SILENT    it changed nothing and said nothing (a failure)
//              UNWIRED   it said "not wired" (a failure)
//
// Exit 1 if any row is SILENT or UNWIRED or threw.
//
// WHAT THIS HARNESS IS NOT. `createMonsters` owns a THREE scene and a world
// field and cannot run in node, so the monster CONTAINER here is a stand-in
// over real `spawnMonster` actors: it answers `actors`, `nearestHostile`,
// `corpsesNear`, `spawnAt`, `despawn`, `swingAt`, `push` and `friendlies` the
// way `monsters.js` does. Everything inside those actors, and every rule that
// reads them, is the shipped code. Said out loud here rather than discovered.

import {
  ABILITIES, ABILITIES_BY_ID, weaponNeeds, weaponCheck, isSpell,
} from '../src/mmo/abilities.js';
import { createAbilities } from '../src/game/abilities_runtime.js';
import { createAbilityHooks } from '../src/game/ability_hooks.js';
import { playerActor, spawnMonster, recompute } from '../src/game/actor.js';
import { createCombat } from '../src/game/combat.js';
import { createProgression } from '../src/game/progression.js';
import { createInventory } from '../src/game/inventory.js';
import { makeItem } from '../src/mmo/items.js';
import { GRAVITY } from '../src/game/player.js';
import { SKILL_IDS } from '../src/mmo/abilities.js';

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose') || argv.includes('-v');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').slice(7)
  .split(',').map((s) => s.trim()).filter(Boolean);
// `--as=mage` audits as a character made by the real creation path with that
// opening's skills and stats (planCharacter), instead of the grandmaster with
// 100 in everything. That is the player's own question: "why can I not cast
// this", answered with their numbers. Rows the opening cannot reach are
// expected to refuse, and the table says which and why.
const AS = (argv.find((a) => a.startsWith('--as=')) || '').slice(5).trim() || null;
let AS_PLAN = null;
if (AS) {
  const { planCharacter } = await import('../src/game/creation.js');
  AS_PLAN = planCharacter({ opening: AS, name: 'The Audit', gender: 'male' });
  if (!AS_PLAN || AS_PLAN.ok === false) { console.error(`--as=${AS}: ${(AS_PLAN && AS_PLAN.errors || ['no such opening']).join('; ')}`); process.exit(2); }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const r1 = (v) => Math.round(num(v) * 10) / 10;

/** A seeded generator, so a run is a run and not a coin toss. */
function seeded(seed = 20260906) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------------------------------------------------------------------------
// What has to be in your hands for this row to get a fair press
// ---------------------------------------------------------------------------
//
// `weaponNeeds` is the rule and this is its answer as gear. Dressing every row
// the same would have measured the weapon check 78 times and the abilities
// never, which is the sort of harness that proves nothing while looking busy.

const WEAPON_FOR_SKILL = {
  swordsmanship: 'longsword',
  macefighting: 'mace',
  fencing: 'rapier',
  polearms: 'halberd',
  archery: 'shortbow',
  marksmanship: 'crossbow',
  magery: 'staff',
};

function equipmentFor(ability) {
  const needs = weaponNeeds(ability);
  const eq = {};
  if (needs.kind === 'focus') eq.mainHand = makeItem({ base: 'staff' });
  else if (needs.kind === 'shield') {
    eq.mainHand = makeItem({ base: 'longsword' });
    eq.offHand = makeItem({ base: 'kite' });
  } else if (needs.kind === 'instrument') eq.offHand = makeItem({ base: 'lute' });
  else if (needs.kind === 'ranged') {
    eq.ranged = makeItem({ base: WEAPON_FOR_SKILL[(needs.skills || [])[0]] || 'shortbow' });
  } else if (needs.kind === 'melee') {
    eq.mainHand = makeItem({ base: WEAPON_FOR_SKILL[(needs.skills || [])[0]] || 'longsword' });
  } else if (needs.kind === 'anyMelee') eq.mainHand = makeItem({ base: 'longsword' });
  else if (needs.kind === 'unarmed') { /* empty hands, on purpose */ }
  else if (ability.requiresShield) eq.offHand = makeItem({ base: 'kite' });
  return eq;
}

// ---------------------------------------------------------------------------
// The harness
// ---------------------------------------------------------------------------

function build(ability) {
  const lines = [];
  const hud = {
    log: (t, k) => { lines.push({ t: String(t), k }); return t; },
    toast: (t, k) => { lines.push({ t: String(t), k }); return t; },
  };
  const floaters = { spawned: [], spawn: (p, t, k) => floaters.spawned.push({ t, k }) };
  const audio = { played: [], play: (c) => audio.played.push(c) };

  const skills = {};
  for (const id of SKILL_IDS) skills[id] = 100;
  const planned = AS_PLAN && (AS_PLAN.character || AS_PLAN.doc || AS_PLAN);
  const asSkills = planned && planned.skills ? { ...planned.skills } : null;
  const asStats = planned && planned.stats ? { ...planned.stats } : null;
  const character = {
    name: 'The Audit',
    skills: asSkills || skills,
    skillLocks: {},
    stats: asStats || { str: 100, dex: 100, int: 100, con: 100, wis: 100 },
    statLocks: {},
    gold: 200,
    bar: new Array(12).fill(null),
    items: { bandage: 10, poisonVial: 5, wood: 10 },
    equipment: equipmentFor(ability),
    pack: { slots: 20, items: new Array(20).fill(null) },
    unlockedAbilities: [],
  };
  character.bar[0] = ability.id;

  const inventory = createInventory({ character, hud });
  inventory.add(makeItem({ base: 'arrow', count: 60 }));
  inventory.add(makeItem({ base: 'bolt', count: 60 }));
  inventory.add(makeItem({ base: 'bandage', count: 10 }));
  inventory.add(makeItem({ base: 'iron_ore', count: 12 }));
  inventory.add(makeItem({ base: 'oak_log', count: 4 }));

  const pos = { x: 0, y: 0, z: 0 };
  const actor = playerActor(character, { pos });
  recompute(actor);
  // Room for a heal, for Meditate and for Camp to have something to give back,
  // and still far more mana than the dearest row in the table (Raise Champion,
  // 60) so nothing is refused for want of it.
  actor.health = actor.maxHealth * 0.5;
  actor.mana = actor.maxMana * 0.7;
  actor.stamina = actor.maxStamina * 0.8;

  const taught = [];
  const realProgression = createProgression({ character, actor, floaters, hud, audio });
  // The lesson path, counted rather than inferred from a skill that is already
  // at the cap: a maxed audit character cannot gain, and "no gain" is not the
  // same claim as "no lesson was ever offered".
  const progression = {
    ...realProgression,
    lesson(skillId, difficulty, success, rng2) {
      taught.push({ skill: skillId, difficulty, success });
      return realProgression.lesson(skillId, difficulty, success, rng2);
    },
    statLesson: (...a) => realProgression.statLesson(...a),
  };
  const combat = createCombat({
    floaters, hud, audio, recompute,
    rng: seeded(11),
    progression: {
      lesson: (who, skill, difficulty, success) => (who === actor ? progression.lesson(skill, difficulty, success) : null),
      statLesson: (who, stat) => (who === actor ? progression.statLesson(stat) : null),
    },
  });

  // -- the monsters stand-in ------------------------------------------------
  const live = [];
  const corpses = [];
  let devN = 0;
  const alive = (a) => a && num(a.health) > 0 && !a.dead;
  const hostileActors = () => live.filter((m) => alive(m.actor) && m.actor.faction !== 'player').map((m) => m.actor);
  const monsters = {
    spawned: [], despawned: [], dropped: 0, pushed: [],
    actors: () => hostileActors(),
    friendlies: () => live.filter((m) => alive(m.actor) && m.actor.faction === 'player').map((m) => m.actor),
    all: () => live.slice(),
    forActor: (a) => live.find((m) => m.actor === a) || null,
    corpsesNear: (at, r = 3) => corpses
      .filter((c) => Math.hypot(c.pos.x - at.x, c.pos.z - at.z) <= r)
      .sort((a, b) => Math.hypot(a.pos.x - at.x, a.pos.z - at.z) - Math.hypot(b.pos.x - at.x, b.pos.z - at.z)),
    removeCorpse(c) { const i = corpses.indexOf(c); if (i >= 0) corpses.splice(i, 1); },
    nearestHostile(p, yaw, range = 20, halfAngle = Math.PI / 4) {
      let best = null, bd = range;
      const fx = Math.sin(num(yaw)), fz = Math.cos(num(yaw));
      for (const m of live) {
        const a = m.actor;
        if (!alive(a) || a.faction === 'player') continue;
        const dx = a.pos.x - num(p.x), dz = a.pos.z - num(p.z);
        const d = Math.hypot(dx, dz);
        if (d > bd || d < 1e-6) continue;
        if ((dx * fx + dz * fz) / d < Math.cos(halfAngle)) continue;
        bd = d; best = m;
      }
      return best;
    },
    spawnAt(id, x, z) {
      const a = spawnMonster(id, { x, y: 0, z });
      const key = `audit:${id}:${++devN}`;
      const mon = { key, id, name: a.name, actor: a, row: { id }, ephemeral: true, friendly: false };
      a.ai = a.ai || { home: { x, z }, state: 'idle', target: null };
      live.push(mon);
      monsters.spawned.push({ id, x, z });
      return mon;
    },
    despawn(key) {
      const i = live.findIndex((m) => m.key === key);
      if (i >= 0) { combat.forget(live[i].actor); monsters.despawned.push(key); live.splice(i, 1); }
    },
    push(m, x, z) { monsters.pushed.push({ m, x, z }); m.pos.x = x; m.pos.z = z; },
    dropAggro() { monsters.dropped++; },
    swingAt: (attacker, defender, o = {}) => combat.queueSwing(attacker, defender, o),
    spawnAlly(id, x, z) {
      const mon = monsters.spawnAt(id, x, z);
      if (mon) monsters.makeAlly(mon);
      return mon;
    },
    makeAlly(mon) {
      mon.friendly = true;
      mon.actor.faction = 'player';
      mon.actor.summoned = true;
      mon.actor.ai = mon.actor.ai || { home: { x: 0, z: 0 }, state: 'idle', target: null };
      mon.actor.ai.target = null;
    },
    releaseAlly(mon) {
      mon.friendly = false;
      mon.actor.faction = 'hostile';
      mon.actor.summoned = false;
    },
  };

  const effects = {
    calls: [],
    colourFor: () => 0xffffff,
    // the real effects.js calls onArrive when the spark lands; so does this
    bolt: (from, to, c, o) => { effects.calls.push('bolt'); o?.onArrive?.(); },
    burst: () => effects.calls.push('burst'),
    ring: () => effects.calls.push('ring'),
    column: () => effects.calls.push('column'),
    showGroundRing: () => effects.calls.push('groundRing'),
    hideGroundRing: () => {},
    cast: () => effects.calls.push('cast'),
    stopCast: () => effects.calls.push('stopCast'),
    swing: () => effects.calls.push('swing'),
    die: () => effects.calls.push('die'),
    handPos: () => ({ x: pos.x, y: pos.y + 1.3, z: pos.z }),
  };

  const rig = {
    speed: 0, yaw: 0, pos,
    state: { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, peakY: 0 },
    get airborne() { return rig.state.airborne; },
    teleport(x, z) { pos.x = x; pos.z = z; rig.state.x = x; rig.state.z = z; },
    /**
     * The jump, stepped. `player.js` owns the real one and this is the same
     * arithmetic with the same GRAVITY imported from it, because a leap that is
     * never allowed to land never runs the half of Leap Slam that hits
     * anything: `doMove` sets `deferToLanding` and `onLanded` fires the rest.
     * Without this the audit measured the take off and called it the ability.
     */
    step(d) {
      const st = rig.state;
      if (!st.airborne) return null;
      st.vy -= GRAVITY * d;
      pos.x += num(st.vx) * d;
      pos.z += num(st.vz) * d;
      st.y = num(st.y) + st.vy * d;
      st.x = pos.x; st.z = pos.z;
      if (st.y > num(st.peakY)) st.peakY = st.y;
      if (st.y <= 0) {
        const fell = Math.max(0, num(st.peakY) - 0);
        st.y = 0; st.vy = 0; st.vx = 0; st.vz = 0; st.airborne = false; st.peakY = 0;
        return { fallMetres: fell };
      }
      return null;
    },
  };

  let dying = false;
  const woke = [];
  const hooks = createAbilityHooks({
    character, actor, monsters, combat, inventory, hud, floaters, audio,
    player: rig,
    ownerTarget: () => null,
    inCombat: (a) => combat.inCombat(a),
    recompute: (who) => recompute(who || actor),
    isDying: () => dying,
    wake: () => { dying = false; woke.push(true); return true; },
    rng: seeded(5),
  });

  const abilities = createAbilities({
    character, actor,
    input: { pressed: () => false, down: () => false },
    combat, monsters, targeting: null,
    effects, floaters, hud, audio,
    player: rig, camera: null, progression,
    heightAt: () => 0,
    enabled: () => true,
    recompute: (who) => recompute(who || actor),
    rng: seeded(3),
    summon: hooks.summon,
    allies: hooks.allies,
    resurrect: hooks.resurrect,
    utility: hooks.utility,
  });

  return {
    ability, character, actor, inventory, combat, monsters, abilities, hooks,
    effects, floaters, hud, lines, progression, rig, live, corpses, taught,
    setDying: (v) => { dying = v; },
    woke,
  };
}

// ---------------------------------------------------------------------------
// One row, pressed
// ---------------------------------------------------------------------------

/** Everything about the world an ability could plausibly have moved. */
function snapshot(h) {
  const buffs = (a) => (Array.isArray(a.buffs) ? a.buffs.map((b) => `${b.kind}:${b.abilityId}`) : []);
  const status = (a) => Object.keys(a.status || {});
  return {
    playerHealth: r1(h.actor.health),
    playerMana: r1(h.actor.mana),
    playerStamina: r1(h.actor.stamina),
    playerPos: `${r1(h.rig.pos.x)},${r1(h.rig.pos.z)}`,
    playerBuffs: buffs(h.actor).join(','),
    playerStatus: status(h.actor).join(','),
    hidden: !!h.actor.hidden,
    airborne: !!h.rig.state.airborne,
    form: h.actor.form || '',
    enchant: h.actor.enchant ? h.actor.enchant.damageType : '',
    absorb: h.actor.absorb ? 1 : 0,
    leech: h.actor.leech ? 1 : 0,
    meditating: !!h.actor.meditating,
    camping: !!h.actor.camping,
    passives: Object.keys(h.actor.passives || {}).join(','),
    skills: JSON.stringify(h.character.skills),
    gold: num(h.character.gold),
    packSig: (h.character.pack.items || []).map((i) => (i ? `${i.base}x${i.count ?? 1}` : '-')).join('|'),
    items: JSON.stringify(h.character.items),
    monsters: h.live.map((m) => [
      m.key, r1(m.actor.health), status(m.actor).join('+'), buffs(m.actor).join('+'),
      (m.actor.dots || []).length, (m.actor.marks || []).length,
      r1(m.actor.pos.x), r1(m.actor.pos.z), m.actor.faction,
    ].join('#')).join(' ; '),
    corpses: h.corpses.length,
    zones: h.abilities.zones.length,
    summons: h.hooks.summons.length,
  };
}

function diff(before, after) {
  const out = [];
  for (const k of Object.keys(after)) {
    if (String(before[k]) !== String(after[k])) out.push(k);
  }
  return out;
}

const STEP = 1 / 30;

function run(ability) {
  const h = build(ability);

  // one hostile inside every reach in the table (the shortest is 2 m)
  // The NEAREST is a man, because that is the hardest case to satisfy: Fear
  // touches beasts and men and not the undead, Pick Pocket wants a humanoid,
  // and a field of nothing but skeletons would have measured two refusals and
  // neither ability. The undead, the beast and a second body stand behind him
  // for the area rows, the chains and Provoke's "two of them".
  const foe = h.monsters.spawnAt('bandit', 0, 1.2);
  foe.actor.name = 'Bandit';
  const second = h.monsters.spawnAt('zombie', 1.2, 2.2);
  second.actor.name = 'Zombie';
  // Fear touches beasts and men and not the undead, and Pick Pocket wants a
  // humanoid. A field of nothing but skeletons would have measured both
  // refusals and neither ability, which is the harness proving nothing while
  // looking busy.
  const beast = h.monsters.spawnAt('wolf', -0.9, 1.7);
  beast.actor.name = 'Wolf';
  const bones = h.monsters.spawnAt('skeleton', 0.9, 1.7);
  bones.actor.name = 'Skeleton';
  // a body on the ground, for Raise Skeleton and Corpse Explosion
  const dead = spawnMonster('bandit', { x: 0, y: 0, z: 2.0 });
  dead.health = 0; dead.dead = true;
  h.corpses.push({ key: 'audit:corpse', id: 'bandit', name: 'Bandit', actor: dead, pos: dead.pos });

  const before = snapshot(h);
  const startLines = h.lines.length;
  // EVERY CHANGE, NOT THE ONE STILL STANDING AT THE END. Evasion is four
  // seconds and Rift is four, and reading the world only after ten would have
  // called both of them "nothing happened" while they had come and gone
  // exactly as written. The diff is taken as it goes and unioned.
  const moved = new Set();

  let t = 0, ms = 0;
  const tick = (n) => {
    for (let i = 0; i < n; i++) {
      t += STEP; ms += STEP * 1000;
      const landed = h.rig.step(STEP);
      h.abilities.update(STEP, t);
      if (landed) h.abilities.onLanded(t, landed.fallMetres);
      h.hooks.update(STEP, ms, t);
      h.combat.update(STEP * 1000, ms);
      if (i % 3 === 0) for (const k of diff(before, snapshot(h))) moved.add(k);
    }
  };

  const r = h.abilities.use(0, t);
  let neededClick = false;
  if (h.abilities.pending) {
    neededClick = true;
    h.abilities.onTargetPicked(foe.actor, t);
  }
  // ten seconds: the longest cast is 4 s (Bandage) and the longest delay 3 s
  // (Meteor), and a summon has to get a swing away inside it
  tick(300);

  const after = snapshot(h);
  for (const k of diff(before, after)) moved.add(k);
  const changed = [...moved];
  const said = h.lines.slice(startLines).map((l) => l.t);
  const words = said.join(' | ');

  const unwired = /not wired|nothing is wired|would rise here|would stand/i.test(words);
  const passive = !!ability.passive;
  // What the ability COST is not what the ability DID. An ability whose only
  // trace is the mana it took is the whole of the complaint this audit exists
  // for, so the two are counted apart.
  const costKeys = new Set(['playerMana', 'playerStamina']);
  if (ability.cost && ability.cost.item) costKeys.add('items');
  const effectKeys = changed.filter((k) => !costKeys.has(k));
  // A passive never comes through `use`: applyPassives is its whole path, and
  // the refusal that names it as always on is the correct answer to a press.
  const passiveLive = passive && !!(h.actor.passives && h.actor.passives[ability.id]);

  let verdict;
  if (unwired) verdict = 'UNWIRED';
  else if (passive) verdict = passiveLive ? 'passive' : 'SILENT';
  else if (effectKeys.length) verdict = 'ok';
  else if (!said.length) verdict = 'SILENT';
  else if (changed.length) verdict = 'cost only';
  else verdict = 'refused';

  return {
    id: ability.id, name: ability.name, group: ability.group,
    spell: isSpell(ability),
    verdict, changed, effectKeys, said, neededClick, taught: h.taught.slice(),
    ok: r && r.ok !== false,
    hands: weaponCheck(ability, h.character.equipment, h.character.pack).ok,
    dmg: r1((before.monsters === after.monsters) ? 0 : monsterDamage(before, after)),
  };
}

/** Health taken off every monster between the two snapshots, summed. */
function monsterDamage(before, after) {
  const read = (s) => Object.fromEntries(s.monsters.split(' ; ').filter(Boolean)
    .map((row) => { const p = row.split('#'); return [p[0], Number(p[1])]; }));
  const b = read(before), a = read(after);
  let total = 0;
  for (const k of Object.keys(b)) total += Math.max(0, b[k] - (a[k] ?? 0));
  return total;
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

const rows = [];
const list = ONLY.length ? ONLY.map((id) => ABILITIES_BY_ID[id]).filter(Boolean) : ABILITIES;
for (const ability of list) {
  try {
    rows.push(run(ability));
  } catch (err) {
    rows.push({
      id: ability.id, name: ability.name, group: ability.group, spell: isSpell(ability),
      verdict: 'THREW', changed: [], effectKeys: [], taught: [],
      said: [String(err && err.message), String(err && err.stack || '').split('\n')[1] || ''],
      neededClick: false,
      ok: false, hands: true, dmg: 0,
    });
  }
}

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const VERDICT_MARK = {
  ok: 'ok', refused: 'refused', passive: 'passive', 'cost only': 'COST ONLY',
  SILENT: 'SILENT', UNWIRED: 'UNWIRED', THREW: 'THREW',
};

console.log('');
console.log('  ABILITY AUDIT: every row pressed through the real runtime');
console.log('  ' + '-'.repeat(112));
console.log(`  ${pad('id', 20)}${pad('group', 13)}${pad('verdict', 9)}${pad('dmg', 6)}${pad('what moved', 30)}what it said`);
console.log('  ' + '-'.repeat(112));

let lastGroup = null;
for (const r of rows) {
  if (r.group !== lastGroup) { console.log(''); lastGroup = r.group; }
  const moved = (r.effectKeys || []).join(' ');
  const first = (r.said[0] || '').replace(/\s+/g, ' ');
  console.log(`  ${pad(r.id, 20)}${pad(r.group, 13)}${pad(VERDICT_MARK[r.verdict], 9)}${pad(r.dmg || '', 6)}${pad(moved, 30)}${first.slice(0, 84)}`);
  if (VERBOSE) for (const s of r.said) console.log(`      . ${s}`);
}

const bad = rows.filter((r) => r.verdict === 'SILENT' || r.verdict === 'UNWIRED' || r.verdict === 'THREW');
const counts = rows.reduce((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] || 0) + 1 }), {});

console.log('');
console.log('  ' + '-'.repeat(112));
console.log(`  ${rows.length} abilities: ` + Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '));
const clicks = rows.filter((r) => r.neededClick);
if (clicks.length) console.log(`  ${clicks.length} held on the cursor and needed a click: ${clicks.map((r) => r.id).join(', ')}`);
const costOnly = rows.filter((r) => r.verdict === 'cost only');
if (costOnly.length) {
  console.log('');
  console.log('  Took a cost and changed nothing else, each with the words that say why:');
  for (const r of costOnly) console.log(`    ${pad(r.id, 20)}${r.said.join(' | ').slice(0, 88)}`);
}
const untaught = rows.filter((r) => !r.taught.length && !r.passive && r.verdict === 'ok'
  && ABILITIES_BY_ID[r.id] && (ABILITIES_BY_ID[r.id].skill || ABILITIES_BY_ID[r.id].skillAny));
if (untaught.length) console.log(`  ${untaught.length} landed without offering a lesson: ${untaught.map((r) => r.id).join(', ')}`);
if (bad.length) {
  console.log('');
  for (const r of bad) {
    console.log(`  ${r.verdict}  ${r.id}: ${r.said.join(' | ') || 'nothing was said at all'}`);
  }
  console.log('');
  console.log(`  ${bad.length} ability(s) changed nothing and gave no reason a player could act on.`);
  process.exit(1);
}
console.log('  Every ability changed state or refused with a reason.');
console.log('');
process.exit(0);
