// The bridge: an ability, a body, a target, and the clip's own events, turned
// into a spell you can see.
//
// WHAT THIS FILE IS FOR. src/game/vfx/ is the studio's effects, ported. They
// know how to draw a fireball; they do not know what a fireball is, when the
// hand opens, who it is aimed at, or that a cast can be interrupted. This file
// is the only place that knows all four, and it is the only thing the runtime
// and the dev bench talk to.
//
// THE CLOCK. Every number here is SECONDS, on the same monotonic clock
// abilities_runtime.js uses, because a spell that lands at the end of a 2.5
// second cast has to be released at the end of a 2.5 second cast and not at
// the end of a 1.35 second animation. The clip's `events` say WHICH moment is
// the release; the ability's `castTime` says WHEN that moment is.
//
//   gather   the hands start to fill              (event `cast-gather`)
//   release  the bolt leaves, or the blow lands   (event `cast-release`)
//   impact   the bolt arrives and burns           (owned by the effect itself)
//
// An instant spell has no cast to gather through, and its rules effect has
// already resolved by the time we are called. It still gets INSTANT_RELEASE
// seconds of gather so the bolt is seen to leave a hand rather than appearing
// in mid air; that lead is a fifth of a second and is the only place in this
// file where the picture and the rules are deliberately out of step.
//
// ONE CAST AT A TIME, and that is the game's rule and not a shortcut: the
// runtime refuses a second cast while one is running. A new cast therefore
// resets the previous effect, which also means NOTHING IN HERE ALLOCATES PER
// CAST. Every geometry, material and texture is built once by `createSpellVfx`
// and reused, which is what makes the leak test in spell_vfx.test.mjs a flat
// line over two hundred casts rather than a slope.
//
// The melee accents are the exception and are pooled separately, because a
// whirlwind throws two pulses inside one swing and a swing can overlap the
// tail of the last one.

import * as THREE from 'three';
import { ABILITIES_BY_ID } from '../mmo/abilities.js';
import { createSpellEffectContext } from './vfx/util.js';
import { createElementalSpellVfx, SIGNATURES } from './vfx/elemental.js';
import { createAbilityShapes } from './vfx/shapes.js';
import { createAbilityMotes } from './vfx/motes.js';
import { createAbilityAtmosphere } from './vfx/atmosphere.js';
import { createActionAccents } from './vfx/accents.js';
import { createMeteorEffect } from './vfx/meteor.js';
import { createChainLightning, CHAIN_LINKS } from './vfx/chain.js';
import { createRangerEffects } from './vfx/arrows.js';
import { createGroundSummon } from './vfx/summon_portal.js';
import { createSwordSweepTrail, createCombatAccents } from './vfx/sweep.js';
import { spellTextures } from './vfx/textures.js';
import {
  visualFor, kebabAbilityId, canonAbilityId,
  elementForDamage, elementForSchool, elementPalette,
} from './vfx/visuals.js';

/** The event names the clip bank carries. models.js's `moveInfo` hands them over. */
export const MOVE_EVENTS = [
  'cast-gather', 'cast-release', 'swing-trail', 'swing-impact',
  'whirlwind-start', 'whirlwind-pulse', 'hit-react', 'jump-launch', 'jump-land', 'dodge-start',
];

/** The socket bones the effects reach for, by the names the rig carries. */
export const SOCKET_NAMES = [
  'Socket_HandVFX_Left', 'Socket_HandVFX_Right', 'Socket_HeadVFX', 'Socket_RootVFX',
  'Socket_FootVFX_Left', 'Socket_FootVFX_Right', 'Socket_Weapon_Left', 'Socket_Weapon_Right',
];

/**
 * How long an instant spell is seen to gather before its bolt leaves.
 *
 * INVENTED, and small on purpose. No document names a number. A fifth of a
 * second is one twelfth of the shortest cast in the tables and about the
 * shortest lead a hand can be seen to fill in; anything less and the bolt is
 * simply in the air, anything more and an instant stops feeling instant.
 */
export const INSTANT_RELEASE = 0.18;

/**
 * The events a move carries when the bank has not loaded yet.
 *
 * These are the human-male bank's own numbers, copied. They exist so this file
 * works in node and in the seconds before the glb lands, and
 * spell_vfx.test.mjs checks them against the real bank so a re-bake that moved
 * a release cannot leave a silently wrong fallback behind.
 */
export const FALLBACK_EVENTS = {
  cast: [{ type: 'cast-gather', time: 0.24 }, { type: 'cast-release', time: 0.78 }],
  fireball: [{ type: 'cast-gather', time: 0.24 }, { type: 'cast-release', time: 0.78 }],
  lightning: [{ type: 'cast-gather', time: 0.22 }, { type: 'cast-release', time: 0.74 }],
  'energy-missiles': [
    { type: 'cast-gather', time: 0.18 }, { type: 'cast-release', time: 0.43 },
    { type: 'cast-release', time: 0.60 }, { type: 'cast-release', time: 0.77 },
  ],
  healing: [{ type: 'cast-gather', time: 0.28 }, { type: 'cast-release', time: 1.08 }],
  'light-attack': [{ type: 'swing-trail', time: 0.1567 }, { type: 'swing-impact', time: 0.2507 }],
  'heavy-attack': [{ type: 'swing-trail', time: 0.235 }, { type: 'swing-impact', time: 0.3133 }],
  'two-handed-strike': [{ type: 'swing-trail', time: 0.64 }, { type: 'swing-impact', time: 0.82 }],
  whirlwind: [
    { type: 'whirlwind-start', time: 0.1 },
    { type: 'whirlwind-pulse', time: 0.28 }, { type: 'whirlwind-pulse', time: 0.48 },
  ],
  'jump-launch': [{ type: 'jump-launch', time: 0.36 }],
  'running-leap': [{ type: 'jump-launch', time: 0.4 }, { type: 'jump-land', time: 1.09 }],
  dodge: [{ type: 'dodge-start', time: 0.08 }],
  jump: [{ type: 'jump-launch', time: 0.36 }, { type: 'jump-land', time: 0.9317 }],
  hit: [{ type: 'hit-react', time: 0.05 }],
  die: [{ type: 'hit-react', time: 0.07 }],
  idle: [],
  'combat-idle': [],
  run: [],
  walk: [],
};

/**
 * Which move an ability plays when the bank cannot be asked. Same table the
 * bank carries, reduced to the first move, which is the one that owns the
 * events. Anything not named here casts.
 */
export const FALLBACK_MOVES = {
  'power-strike': 'heavy-attack',
  sweep: 'heavy-attack',
  'crushing-blow': 'two-handed-strike',
  'shield-bash': 'light-attack',
  rend: 'light-attack',
  disarm: 'light-attack',
  riposte: 'light-attack',
  'pick-pocket': 'light-attack',
  backstab: 'light-attack',
  'dual-strike': 'light-attack',
  'deep-cut': 'light-attack',
  'throwing-knife': 'light-attack',
  'kidney-shot': 'light-attack',
  'finishing-strike': 'heavy-attack',
  whirlwind: 'whirlwind',
  'leap-slam': 'running-leap',
  jump: 'jump-launch',
  shadowstep: 'dodge',
  fireball: 'fireball',
  lightning: 'lightning',
  'chain-lightning': 'lightning',
  'magic-arrow': 'energy-missiles',
  heal: 'healing',
  'greater-heal': 'healing',
  'lay-on-hands': 'healing',
  resurrect: 'healing',
  cleanse: 'healing',
  bless: 'healing',
  bandage: 'healing',
  'mana-shield': 'healing',
  'stone-skin': 'healing',
  'lich-form': 'healing',
  'battle-cry': 'combat-idle',
  berserk: 'combat-idle',
  'consecrate-weapon': 'combat-idle',
  'poison-blade': 'combat-idle',
  evasion: 'combat-idle',
  'war-drum': 'combat-idle',
  'marching-song': 'walk',
  'fleet-foot': 'run',
  sprint: 'run',
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The damage type an ability's effect deals, or null. Same rule as effects.js. */
export function damageTypeOf(effect) {
  if (!effect) return null;
  if (effect.kind === 'spellDamage' && effect.type) return effect.type;
  if (effect.kind === 'dot' && effect.type) return effect.type;
  if (effect.kind === 'plague' && effect.type) return effect.type;
  if (effect.kind === 'weaponEnchant' && effect.damageType) return effect.damageType;
  if (effect.kind === 'aoe' && effect.spellDamage && effect.spellDamage.type) return effect.spellDamage.type;
  if (effect.kind === 'combo' && Array.isArray(effect.parts)) {
    for (const part of effect.parts) { const t = damageTypeOf(part); if (t) return t; }
  }
  if (effect.applies) return damageTypeOf(effect.applies);
  return null;
}

/** Every effect kind an ability contains, its combo parts flattened in. */
export function effectKindsOf(effect, out = []) {
  if (!effect) return out;
  if (effect.kind) out.push(effect.kind);
  if (Array.isArray(effect.parts)) for (const part of effect.parts) effectKindsOf(part, out);
  if (effect.applies) effectKindsOf(effect.applies, out);
  return out;
}

/**
 * The element an ability reads as: its damage type first, because that is what
 * the player is being told, then its school. Null for a physical ability,
 * which keeps the family's own colour from visuals.js.
 */
export function elementFor(ability) {
  if (!ability) return null;
  // the Mysticism tree kept its arcane look when its rows joined the Wizard's
  // group (2026-09-08); the skill says so where the group no longer can
  return elementForDamage(damageTypeOf(ability.effect)) || (ability.skill === 'mysticism' ? 'arcane' : null) || elementForSchool(ability.group) || null;
}

/** Pull one move's events into the shape the plan wants. */
export function readEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const at = (type) => {
    const found = list.filter((e) => e && e.type === type).map((e) => num(e.time)).sort((a, b) => a - b);
    return found;
  };
  const gathers = at('cast-gather');
  const releases = at('cast-release');
  const pulses = at('whirlwind-pulse');
  const trails = at('swing-trail');
  const impacts = at('swing-impact');
  const launches = at('jump-launch');
  const lands = at('jump-land');
  const starts = at('whirlwind-start');
  const dodges = at('dodge-start');
  return {
    gather: gathers.length ? gathers[0] : null,
    release: releases.length ? releases[0] : null,
    releases,
    trail: trails.length ? trails[0] : null,
    impact: impacts.length ? impacts[0] : null,
    whirlStart: starts.length ? starts[0] : null,
    pulses,
    launch: launches.length ? launches[0] : null,
    land: lands.length ? lands[0] : null,
    dodge: dodges.length ? dodges[0] : null,
    count: list.length,
  };
}

/**
 * Which of the four authored spells, if any, an ability asks for.
 *
 * THE FAMILY DECIDES, not the element, because the family IS the studio's art
 * direction and the element is only the palette it is dressed in. Reading it
 * the other way round put a sky strike on Magic Arrow, whose damage type is
 * energy: a bolt out of the hand became a bolt out of the clouds.
 *
 *   lightning family    the strike. Lightning, Chain Lightning, Smite.
 *   projectile family   the fireball chain, unless the studio marked the row
 *                       `wisps` or the school is shadow, which is the volley.
 *   heal family         the blessing, always, element or none: a Bandage is
 *                       still a heal and still owes the player a sigil.
 *   shield and aura     the blessing ONLY for a caster. A Berserk is a warrior
 *                       shouting, and a green healing sigil on it would be a
 *                       lie about what just happened.
 */
export function signatureFor(family, element, pose, style) {
  if (pose === 'bow') return null;
  if (family === 'lightning') return 'lightning';
  if (family === 'projectile') {
    if (style === 'wisps' || element === 'shadow' || element === 'arcane') return 'missiles';
    return 'fireball';
  }
  if (family === 'heal') return 'healing';
  if ((family === 'shield' || family === 'aura') && element) return 'healing';
  return null;
}

/** The specialised effect an ability wants beside its family, if any. */
export function specialFor(id, family, pose) {
  if (id === 'chain-lightning') return 'chain';
  if (family === 'meteor') return 'meteor';
  if (family === 'volley' || pose === 'bow') return 'arrows';
  if (family === 'portal') return 'summon';
  return null;
}

/**
 * How long an effect runs on after its release, in seconds.
 *
 * The studio's own tail table (abilityTiming.ts): a summon lingers, a meteor
 * falls and burns, the sustained families hold, and everything else is over in
 * under two seconds.
 */
export function tailFor(family, signature) {
  if (family === 'portal') return 5.8;
  if (family === 'meteor') return 3.5;
  if (signature && SIGNATURES[signature]) {
    return Math.max(SIGNATURES[signature].end - SIGNATURES[signature].release, 1.7);
  }
  if (['aura', 'shield', 'heal', 'song', 'mark', 'trap', 'stealth', 'drain'].includes(family)) return 2.5;
  return 1.7;
}

/**
 * Everything about how one ability looks, with no THREE and no scene, so it
 * can be checked in node. `opts.events` is the move's own event list;
 * `opts.castTime` is the cast the runtime actually charged, armour included.
 */
export function planFor(abilityId, opts = {}) {
  const id = kebabAbilityId(abilityId) || canonAbilityId(abilityId);
  const visual = visualFor(abilityId);
  if (!visual) return null;
  const ability = opts.ability || ABILITIES_BY_ID[abilityId] || null;
  const move = opts.move || FALLBACK_MOVES[id] || 'cast';
  const events = readEvents(opts.events || FALLBACK_EVENTS[move] || FALLBACK_EVENTS.cast);
  const kinds = effectKindsOf(ability && ability.effect);
  const element = opts.element === undefined ? elementFor(ability) : opts.element;
  const signature = signatureFor(visual.family, element, visual.pose, visual.style);
  const special = specialFor(id, visual.family, visual.pose);
  const castTime = num(opts.castTime !== undefined ? opts.castTime : (ability && ability.castTime));
  const melee = events.impact !== null && events.gather === null;
  const whirl = events.pulses.length > 0;

  // Which event the ability's real effect lands on. A caster releases, a melee
  // ability lands on the blow, a whirlwind on its first pulse, a leap on the
  // launch that carries it.
  const fireOn = whirl ? 'whirlwind-pulse'
    : melee ? 'swing-impact'
      : events.release !== null ? 'cast-release'
        : events.launch !== null ? 'jump-launch'
          : 'cast-release';

  // WHEN that event is, in this cast's own seconds. A cast puts it at the end
  // of the cast; everything else keeps the clip's own timing, because a swing
  // is the clip and there is no cast bar to stretch it against.
  const clipRelease = fireOn === 'swing-impact' ? events.impact
    : fireOn === 'whirlwind-pulse' ? events.pulses[0]
      : fireOn === 'jump-launch' ? events.launch
        : events.release;
  // A cast puts the release at the end of the cast bar. An INSTANT cast has
  // already resolved by the time we are called, so it takes the short lead
  // rather than the clip's own release: Lightning is instant in the tables and
  // a bolt that waited three quarters of a second for the clip would be
  // showing the player a cast that never happened. A swing, a pulse and a leap
  // keep the clip's timing, because for those the clip IS the ability.
  const release = castTime > 0 ? castTime
    : fireOn === 'cast-release' ? INSTANT_RELEASE
      : clipRelease !== null && clipRelease !== undefined ? clipRelease
        : INSTANT_RELEASE;
  const gatherAt = events.gather !== null && events.release
    ? release * (events.gather / Math.max(events.release, 1e-6))
    : release * 0.3;
  // The later beats of a multi-release move keep their spacing relative to the
  // first, scaled with the cast, so a three beat volley still reads as three.
  const releases = events.releases.length > 1 && events.release
    ? events.releases.map((t) => release * (t / Math.max(events.release, 1e-6)))
    : [release];
  const pulses = whirl ? events.pulses.slice() : [];
  const tail = tailFor(visual.family, signature);

  return {
    id,
    abilityId,
    name: ability ? ability.name : id,
    school: ability ? ability.group : null,
    visual,
    element,
    palette: element ? elementPalette(element) : null,
    signature,
    special,
    move,
    events,
    kinds,
    fireOn,
    castTime,
    instant: castTime <= 0,
    gather: gatherAt,
    release,
    releases,
    pulses,
    trail: events.trail,
    impact: events.impact,
    tail,
    duration: release + tail,
    // What the effect draws with. Handy for the bench and for the docs table.
    layers: [
      signature ? `signature:${signature}` : null,
      special ? `special:${special}` : null,
      'family:' + visual.family,
    ].filter(Boolean),
  };
}

/** Every ability that resolves to a plan, and every one that does not. */
export function auditSpellVisuals(abilities) {
  const list = abilities || Object.values(ABILITIES_BY_ID);
  const missing = [];
  const rows = [];
  for (const ability of list) {
    const plan = planFor(ability.id, { ability });
    if (!plan) { missing.push(ability.id); continue; }
    rows.push(plan);
  }
  return { rows, missing };
}

// ---------------------------------------------------------------------------
// The live thing
// ---------------------------------------------------------------------------

const ZERO = new THREE.Vector3();

/**
 * `createSpellVfx({ body, scene, moveInfo, abilityMoves, textures, resolveImpact })`
 *
 *   body          the caster's group. The effects are parented to it and every
 *                 coordinate they use is in its frame.
 *   scene         where the world-space accents (the blade trail, the rings)
 *                 live, so they do not turn with the body.
 *   moveInfo(m)   the bank's { duration, events } for one move, or null.
 *   abilityMoves  (id) => the moves an ability plays, [] when unknown.
 *   textures      the fire and smoke atlases, or null.
 *   resolveImpact optional ray test, so a bolt burns the ground it hits.
 */
export function createSpellVfx(deps = {}) {
  const body = deps.body || new THREE.Group();
  const scene = deps.scene || null;
  // Whatever the loader already has, unless the caller named a set. A second
  // caster built after the atlases landed gets them without asking.
  let textures = deps.textures === undefined ? spellTextures() : (deps.textures || null);
  const moveInfo = typeof deps.moveInfo === 'function' ? deps.moveInfo : () => null;
  const abilityMoves = typeof deps.abilityMoves === 'function' ? deps.abilityMoves : () => [];

  // --- the sockets, resolved lazily and re-resolved after a model swap ------
  const sockets = new Map();
  let socketsBoundTo = null;
  function bindSockets() {
    sockets.clear();
    body.traverse((o) => { if (SOCKET_NAMES.includes(o.name)) sockets.set(o.name, o); });
    socketsBoundTo = body.children.length ? body.children[0] : null;
    return sockets.size;
  }
  let emptyChecks = 0;
  function refreshSockets() {
    // A body whose glb landed, or was swapped for the other gender, has a new
    // skeleton under the same group. Re-bind when the first child changed or
    // when a cached bone has been detached from the tree.
    const head = body.children.length ? body.children[0] : null;
    if (head !== socketsBoundTo) { emptyChecks = 0; return bindSockets(); }
    if (!sockets.size) {
      // A Blender body has no sockets at all and never will, and this is
      // called every frame. Traversing a whole character sixty times a second
      // to be told the same thing is the sort of cost that never shows up in a
      // profile as one line, so the retry is twice a second instead.
      emptyChecks += 1;
      if (emptyChecks % 30 !== 1) return 0;
      return bindSockets();
    }
    const any = sockets.values().next().value;
    if (any && !any.parent) return bindSockets();
    return sockets.size;
  }
  bindSockets();

  const context = createSpellEffectContext(body, sockets, { textures, resolveImpact: deps.resolveImpact, anchors: deps.anchors || null });

  // --- the effects, built once, and rebuilt once if the atlases land --------
  //
  // Every geometry and material below is made HERE and nowhere else. Casting
  // allocates nothing; see the leak test in spell_vfx.test.mjs. The one time
  // this runs twice is when the fire and smoke atlases finish loading a moment
  // after boot: the flipbook layers are built against a texture and cannot be
  // handed one afterwards, so the whole set is disposed and remade, once,
  // inside the first second, rather than every effect carrying a branch for a
  // texture it might get later.
  const root = new THREE.Group();
  root.name = 'bw-spell-vfx';
  root.frustumCulled = false;
  body.add(root);
  let genericRoot = null;
  let elemental = null;
  let shapes = null;
  let motes = null;
  let atmosphere = null;
  let accents = null;
  let meteor = null;
  let chain = null;
  let arrows = null;
  let summon = null;
  let builds = 0;

  function buildEffects() {
    genericRoot = new THREE.Group();
    genericRoot.name = 'bw-spell-generic';
    root.add(genericRoot);
    elemental = createElementalSpellVfx(context);
    shapes = createAbilityShapes(genericRoot);
    motes = createAbilityMotes(genericRoot);
    atmosphere = createAbilityAtmosphere(genericRoot, textures);
    accents = createActionAccents(genericRoot);
    meteor = createMeteorEffect(root, textures);
    chain = createChainLightning(root);
    arrows = createRangerEffects(root);
    summon = createGroundSummon(root, textures);
    builds += 1;
  }

  function tearDownEffects() {
    if (!genericRoot) return;
    elemental.dispose();
    shapes.dispose();
    motes.dispose();
    atmosphere.dispose();
    accents.dispose();
    meteor.dispose();
    chain.dispose();
    arrows.dispose();
    summon.dispose();
    if (genericRoot.parent) genericRoot.parent.remove(genericRoot);
    genericRoot = null;
  }

  buildEffects();

  // The world-space half: a blade trail and the pooled rings and bursts.
  const worldParent = scene && scene.add ? scene : body;
  const bladeBase = new THREE.Vector3();
  const bladeTip = new THREE.Vector3();
  const bladeQuat = new THREE.Quaternion();
  const bladeAxis = new THREE.Vector3(0, 1, 0);
  let bladeLength = 0.78;
  function sampleBlade(base, tip) {
    if (!refreshSockets()) return false;
    const socket = sockets.get('Socket_Weapon_Right') || sockets.get('Socket_HandVFX_Right');
    if (!socket) return false;
    socket.updateWorldMatrix(true, false);
    socket.getWorldPosition(base);
    socket.getWorldQuaternion(bladeQuat);
    tip.copy(bladeAxis).applyQuaternion(bladeQuat).multiplyScalar(bladeLength).add(base);
    return true;
  }
  const blade = createSwordSweepTrail(worldParent, sampleBlade);
  const combat = createCombatAccents(worldParent);

  // --- the cast in flight ---------------------------------------------------
  const origin = new THREE.Vector3(0, 1.28, 0.34);
  const targetLocal = new THREE.Vector3(0, 1.05, 3);
  const groundLocal = new THREE.Vector3(0, 0.035, 3);
  const scratch = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();
  const presentation = new THREE.Vector3();
  const chainPoints = Array.from({ length: CHAIN_LINKS }, () => new THREE.Vector3());
  let live = null;      // { plan, t, seed, fired, gathered }
  let lastPresentation = 0;
  let casts = 0;

  function hideAll() {
    elemental.reset();
    shapes.hide();
    motes.clear();
    atmosphere.hide();
    accents.hide();
    meteor.hide();
    chain.hide();
    arrows.hide();
    summon.hide();
    genericRoot.visible = false;
    root.visible = false;
  }
  hideAll();

  /** A world point into the caster's frame, guarding a body with no matrix yet. */
  function toLocal(point, out) {
    if (!point) return null;
    body.updateWorldMatrix(true, false);
    out.set(num(point.x), num(point.y === undefined ? 0 : point.y), num(point.z));
    return body.worldToLocal(out);
  }

  /** The moves an ability plays here, first one wins; the bank's if it has one. */
  function moveFor(plan, abilityId) {
    const moves = abilityMoves(abilityId) || [];
    for (const move of moves) {
      const info = moveInfo(move);
      if (info && Array.isArray(info.events) && info.events.length) return { move, events: info.events };
    }
    const fallbackMove = FALLBACK_MOVES[plan] || 'cast';
    const info = moveInfo(fallbackMove);
    return {
      move: fallbackMove,
      events: info && Array.isArray(info.events) && info.events.length ? info.events : FALLBACK_EVENTS[fallbackMove] || FALLBACK_EVENTS.cast,
    };
  }

  return {
    root,
    context,
    blade,
    combat,
    get sockets() { return sockets; },
    get live() { return live; },
    get casts() { return casts; },
    /** True while anything in here is drawing. The composer reads this. */
    get active() { return !!live || combat.liveRings > 0 || combat.liveBursts > 0 || blade.running; },
    /** How strong and where the heat shimmer should be, or null. */
    presentation() {
      if (!live) return null;
      const strength = elemental.samplePresentation(presentation);
      if (strength <= 0.0001) return null;
      lastPresentation = strength;
      return { position: presentation, strength, radius: 0.14 };
    },
    get lastPresentation() { return lastPresentation; },
    /** Where the blade trail thinks the blade ends, in metres. */
    setBlade(length, axis) {
      if (Number.isFinite(length) && length > 0) bladeLength = length;
      if (axis) bladeAxis.copy(axis).normalize();
      return this;
    },
    rebindSockets: bindSockets,
    get builds() { return builds; },
    get textures() { return textures; },
    /**
     * Hand over the fire and smoke atlases once they have loaded. The effects
     * are remade against them, once. Calling this with the set already in use
     * does nothing, so a second caller cannot cost a second rebuild.
     */
    setTextures(next) {
      if (!next || next === textures) return false;
      textures = next;
      context.textures = next;
      hideAll();
      live = null;
      tearDownEffects();
      buildEffects();
      hideAll();
      return true;
    },

    /**
     * Start an ability's visual.
     *
     * `opts.castTime` is the cast the runtime charged; `opts.target` is the
     * actor or point it was aimed at; `opts.ground` the ground point a ground
     * ability chose; `opts.links` the actors a chain resolved onto. All world
     * coordinates, converted here and only here.
     */
    start(abilityId, opts = {}) {
      const ability = opts.ability || ABILITIES_BY_ID[abilityId] || null;
      const kebab = kebabAbilityId(abilityId) || canonAbilityId(abilityId);
      const chosen = moveFor(kebab, abilityId);
      const plan = planFor(abilityId, {
        ability,
        castTime: opts.castTime,
        move: chosen.move,
        events: chosen.events,
      });
      if (!plan) return null;
      refreshSockets();
      hideAll();
      root.visible = true;
      casts += 1;

      // Where it comes from and where it goes, in the caster's own frame.
      context.socketPosition('Socket_HandVFX_Right', origin);
      if (!Number.isFinite(origin.x)) origin.set(0, 1.28, 0.34);
      const aimed = toLocal(opts.target && opts.target.pos ? opts.target.pos : opts.target, scratch);
      if (aimed) targetLocal.copy(aimed);
      else targetLocal.set(0, 1.05, 3);
      if (!opts.target) targetLocal.set(0, 1.05, 3);
      const ground = toLocal(opts.ground, scratch);
      if (ground) groundLocal.copy(ground);
      else groundLocal.set(targetLocal.x, 0.035, targetLocal.z);
      // A self, ally or ground ability aims at the ground it stands on.
      const selfCast = ability && (ability.target === 'self' || ability.target === 'ally');
      if (selfCast) { targetLocal.set(0, 1.05, 0.2); groundLocal.set(0, 0.035, 0); }

      if (plan.signature) {
        elemental.begin(plan.signature);
        elemental.dress(plan.signature, plan.element);
        elemental.aim(plan.signature,
          origin,
          plan.signature === 'lightning' ? groundLocal : targetLocal);
      }
      if (plan.special === 'chain') {
        const links = Array.isArray(opts.links) ? opts.links : [];
        const resolved = [];
        for (let i = 0; i < Math.min(CHAIN_LINKS, links.length); i += 1) {
          const point = toLocal(links[i] && links[i].pos ? links[i].pos : links[i], scratch);
          if (!point) break;
          chainPoints[i].copy(point);
          chainPoints[i].y += 1.0;
          resolved.push(chainPoints[i]);
        }
        if (!resolved.length) {
          // No chain was reported. Draw the one bolt we do know about rather
          // than nothing, and say so in the plan the bench prints.
          chainPoints[0].copy(targetLocal);
          resolved.push(chainPoints[0]);
        }
        chain.setLinks(resolved);
        if (plan.palette) chain.setPalette(plan.palette);
      }
      live = { plan, t: 0, seed: seedOf(plan.id), fired: false, gathered: false, pulsed: 0, trailed: false };
      return plan;
    },

    /**
     * Where the spell actually went, told after it landed.
     *
     * abilities_runtime.js calls this from `fire()`, which is the first moment
     * a chain knows its own hops and a ground spell knows where its circle
     * settled. Everything downstream reads these vectors every frame, so a
     * correction here moves the bolt that is still in the air.
     */
    retarget(opts = {}) {
      if (!live) return null;
      const aimed = toLocal(opts.target && opts.target.pos ? opts.target.pos : opts.target, scratch);
      if (aimed) targetLocal.copy(aimed);
      const ground = toLocal(opts.ground, scratch);
      if (ground) groundLocal.copy(ground);
      if (live.plan.special === 'chain' && Array.isArray(opts.links) && opts.links.length) {
        const resolved = [];
        for (let i = 0; i < Math.min(CHAIN_LINKS, opts.links.length); i += 1) {
          const point = toLocal(opts.links[i] && opts.links[i].pos ? opts.links[i].pos : opts.links[i], scratch);
          if (!point) break;
          chainPoints[i].copy(point);
          chainPoints[i].y += 1.0;
          resolved.push(chainPoints[i]);
        }
        if (resolved.length) chain.setLinks(resolved);
      }
      if (live.plan.signature) {
        elemental.aim(live.plan.signature, origin, live.plan.signature === 'lightning' ? groundLocal : targetLocal);
      }
      return live.plan.id;
    },

    /**
     * A cast that never landed. The puff is the whole point: a spell that took
     * your mana and vanished with no sound and no picture is indistinguishable
     * from a broken key.
     */
    interrupt(reason) {
      const had = live;
      if (had) {
        refreshSockets();
        context.socketPosition('Socket_HandVFX_Right', scratch);
        body.updateWorldMatrix(true, false);
        worldPoint.copy(scratch);
        body.localToWorld(worldPoint);
        combat.puff(worldPoint, had.plan.palette ? had.plan.palette.color : '#c8c0ae');
      }
      hideAll();
      live = null;
      blade.stop();
      return had ? { ability: had.plan.id, reason: reason || 'interrupted', at: worldPoint.clone() } : null;
    },

    /** The same puff on its own, for a fizzle that never started a visual. */
    fizzle(colour) {
      refreshSockets();
      context.socketPosition('Socket_HandVFX_Right', scratch);
      body.updateWorldMatrix(true, false);
      worldPoint.copy(scratch);
      body.localToWorld(worldPoint);
      combat.puff(worldPoint, colour || '#c8c0ae');
      return worldPoint;
    },

    /** A swing's blade trail, from swing-trail to swing-impact. */
    swing(colour, seconds) {
      blade.setColour(colour || '#e9ddb6');
      blade.begin(Number.isFinite(seconds) && seconds > 0 ? seconds : 0.16);
      return this;
    },

    /** One whirlwind pulse: a ring at the feet and a spray off the blade. */
    pulse(colour) {
      body.updateWorldMatrix(true, false);
      body.getWorldPosition(worldPoint);
      combat.ring(scratch.copy(worldPoint).setY(worldPoint.y + 0.05), { radius: 1.05, duration: 0.26, colour: colour || '#e2cb9b' });
      if (sampleBlade(bladeBase, bladeTip)) combat.burst(bladeTip, 18, 1.25, 0.22, colour || '#e2cb9b');
      return this;
    },

    update(dt) {
      const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
      blade.update(step);
      combat.update(step);
      if (!live) { root.visible = combat.liveRings > 0 || combat.liveBursts > 0; return; }
      live.t += step;
      const { plan } = live;
      const time = live.t;
      refreshSockets();
      root.visible = true;

      // The hands fill, once, and it is said out loud in the plan the bench prints.
      if (!live.gathered && time >= plan.gather) live.gathered = true;
      if (!live.fired && time >= plan.release) {
        live.fired = true;
        if (plan.fireOn === 'whirlwind-pulse') this.pulse(plan.visual.color);
      }
      // The later pulses of a whirlwind.
      while (live.pulsed < plan.pulses.length && time >= plan.pulses[live.pulsed]) {
        if (live.pulsed > 0 || plan.fireOn !== 'whirlwind-pulse') this.pulse(plan.visual.color);
        live.pulsed += 1;
      }
      // The blade trail runs between swing-trail and swing-impact.
      if (!live.trailed && plan.trail !== null && time >= plan.trail) {
        live.trailed = true;
        this.swing(plan.visual.color, Math.max(0.08, (plan.impact || plan.trail + 0.16) - plan.trail));
      }

      // Where the caster is aiming, refreshed while the hands still hold it.
      if (time < plan.release) context.socketPosition('Socket_HandVFX_Right', origin);

      if (plan.signature) elemental.play(plan.signature, time, plan.release);
      if (plan.special === 'meteor') meteor.sample(true, time, plan.release, groundLocal);
      else if (plan.special === 'chain') chain.sample(true, time, plan.release, origin);
      else if (plan.special === 'arrows') arrows.sample(plan.id, plan.visual, true, time, plan.release, origin, targetLocal);
      else if (plan.special === 'summon') {
        summon.sample(true, time, plan.release, groundLocal, plan.visual.color, plan.visual.scale > 1.2 ? 1 : 0.68, plan.id !== 'summon-imp');
      }

      // The family layer draws under all of it, and is what guarantees that an
      // ability with no signature and no special still shows the player
      // something. It is switched off where a signature already owns the look.
      // The family layer draws under all of it. A signature that owns the whole
      // look switches it off; a METEOR keeps it until the release, because a two
      // and a half second cast that shows nothing at all until the rock appears
      // is a cast bar with no spell behind it. A bow keeps it off throughout:
      // an archer drawing is the visual, and a glowing ball in the draw hand
      // would be claiming magic where there is none.
      const owned = plan.signature === 'fireball' || plan.signature === 'lightning' || plan.signature === 'missiles';
      const specialOwns = plan.special === 'meteor' ? time >= plan.release : plan.special === 'arrows';
      genericRoot.visible = !owned && !specialOwns;
      if (genericRoot.visible) {
        const aim = ['portal', 'mark', 'trap', 'meteor', 'volley', 'nova', 'impact'].includes(plan.visual.family)
          ? groundLocal : targetLocal;
        shapes.update(plan.visual, plan.id, time, plan.release, origin, aim);
        motes.update(plan.visual, time, plan.release, origin, aim, live.seed);
        atmosphere.sample(plan.visual, time, plan.release, origin, aim);
      } else {
        shapes.hide();
        motes.clear();
        atmosphere.hide();
      }
      accents.sample(plan.id, plan.visual, time, plan.release, origin, plan.visual.family === 'mark' ? targetLocal : groundLocal);

      if (time >= plan.duration) {
        hideAll();
        live = null;
      }
    },

    clear() { hideAll(); live = null; blade.stop(); combat.clear(); },

    dispose() {
      hideAll();
      tearDownEffects();
      blade.dispose();
      combat.dispose();
      if (root.parent) root.parent.remove(root);
      sockets.clear();
      live = null;
    },
  };
}

/** A stable seed per ability, so one spell's cloud looks like itself twice. */
function seedOf(id) {
  let seed = 1;
  const text = String(id || '');
  for (let i = 0; i < text.length; i += 1) seed += text.charCodeAt(i);
  return seed;
}
