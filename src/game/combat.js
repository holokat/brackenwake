// Swinging at something alive.
//
// `src/game/interact.js` owns the axe against a tree. This file owns the axe
// against a deer, and it is deliberately the same shape: one pure decision
// function, every refusal carrying a reason a toast can read, and no THREE, no
// DOM and no raycaster anywhere in it. What it needs from the world it takes
// through `fauna.hitTest`, and the only change it ever makes is the one call to
// `fauna.damage`, which is the single owner of an animal's hp and of the flee
// that follows a blow.
//
// Two rules decide the target, in this order:
//
//   1. it has to be within the weapon's reach OF THE PLAYER, because your arm
//      is the length it is wherever you are pointing;
//   2. of those, the one nearest the CURSOR wins, because with two rabbits at
//      your feet the one you are looking at is the one you meant.
//
// A swing that connects starts the cooldown; a swing at empty air does not, the
// same way a blocked chop in interact.js does not. Whiffing is free, on purpose:
// the alternative is a player locked out of hitting anything for half a second
// because they clicked the sky.

import { KINDS } from '../world/fauna.js';
import { GOODS } from '../farm/catalog.js';

/**
 * What each tool does to something alive.
 *
 * `damage` is in hit points, against the species table in fauna.js (rabbit,
 * squirrel and gull 1, fox 2, deer 3, wolf 4), so the whole table reads as:
 *
 *   |          | rabbit | fox | deer | wolf |
 *   | hands    |   1    |  2  |  3   |  4   |   swings to a kill
 *   | pickaxe  |   1    |  1  |  2   |  2   |
 *   | axe      |   1    |  1  |  1   |  2   |
 *
 * `reach` is horizontal metres from the player, `cooldown` is milliseconds
 * between swings that land. The axe hits hardest and slowest, hands are quick
 * and nearly useless, the pickaxe sits between them and is a worse weapon than
 * the axe on purpose: it is a wedge on a stick.
 *
 * The bow is defined and NOT FIRED YET. Nothing in this file launches an arrow;
 * `resolveSwing` refuses a bow unless the caller passes `allowRanged`, which is
 * the flag whoever wires the arrow flips. Its numbers are the arrow's, not a
 * bowstave used as a club.
 */
export const WEAPONS = {
  hand:    { damage: 1, reach: 2.5, cooldown: 400, ranged: false, noun: 'your hands' },
  axe:     { damage: 3, reach: 3.2, cooldown: 650, ranged: false, noun: 'the axe' },
  pickaxe: { damage: 2, reach: 2.9, cooldown: 600, ranged: false, noun: 'the pickaxe' },
  bow:     { damage: 3, reach: 45,  cooldown: 900, ranged: true,  noun: 'the bow' },
};

/** An unknown or missing tool is a pair of hands. */
export const weaponFor = (tool) => WEAPONS[tool] || WEAPONS.hand;

/**
 * What a kill leaves. Only goods that exist in the catalog today: `venison`
 * (sells 6) off a deer, `game_meat` (sells 4) off everything else, which is
 * exactly what the farm's own rabbits and squirrels already yield. There is no
 * pelt, hide or feather in `GOODS`, so nothing here promises one.
 */
export const LOOT = {
  deer:     { good: 'venison',   n: 2 },
  wolf:     { good: 'game_meat', n: 2 },
  fox:      { good: 'game_meat', n: 1 },
  rabbit:   { good: 'game_meat', n: 1 },
  squirrel: { good: 'game_meat', n: 1 },
  gull:     { good: 'game_meat', n: 1 },
};

/**
 * What a kill gives, priced from the catalog.
 * @returns null for a species with no row, otherwise
 *   { good, n, name, sell, coins } where `coins` is what the market pays for it.
 */
export function lootFor(species) {
  const row = LOOT[species];
  if (!row) return null;
  const g = GOODS[row.good];
  if (!g) return null;
  return { good: row.good, n: row.n, name: g.name, sell: g.sell, coins: g.sell * row.n };
}

/**
 * Every species fauna.js can spawn has loot, and every loot names a good the
 * catalog actually sells. Called at module load, so a seventh animal added to
 * KINDS cannot ship dropping nothing, and a rename in the catalog cannot leave
 * a kill crediting a good that is no longer there.
 */
export function auditLootTable() {
  const bad = [];
  for (const kind of Object.keys(KINDS)) {
    const row = LOOT[kind];
    if (!row) { bad.push(`${kind} drops nothing`); continue; }
    if (!GOODS[row.good]) bad.push(`${kind} drops "${row.good}", which is not a catalog good`);
    if (!(row.n > 0)) bad.push(`${kind} drops ${row.n} of ${row.good}`);
  }
  for (const kind of Object.keys(LOOT)) if (!KINDS[kind]) bad.push(`loot for "${kind}", which is not a species`);
  if (bad.length) throw new Error(`combat: bad loot table (${bad.join('; ')})`);
  return true;
}
auditLootTable();

const dist2 = (a, b) => {
  const dx = (a.x ?? 0) - (b.x ?? 0), dz = (a.z ?? 0) - (b.z ?? 0);
  return dx * dx + dz * dz;
};
const isPoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
const isFlying = (m) => !!(m && m.userData && m.userData.fly);

/**
 * What this swing WOULD hit, changing nothing. `interact.js` asks this first so
 * it can compare the animal against the tree behind it before either is struck,
 * and `resolveSwing` then uses the same function, so the thing you were told you
 * were about to hit is the thing that gets hit.
 *
 * @returns {{ animal, dist, aimDist, reason, nearest }} with `animal` null on a
 *   refusal ('out_of_reach', 'too_high', 'ranged', 'no_fauna', 'no_position').
 */
export function pickTarget({ fauna, tool, playerPos, aimPos, allowRanged = false } = {}) {
  const w = weaponFor(tool);
  const none = (reason, nearest = null) => ({ animal: null, dist: Infinity, aimDist: Infinity, reason, nearest });
  if (!fauna || typeof fauna.hitTest !== 'function') return none('no_fauna');
  if (!isPoint(playerPos)) return none('no_position');
  if (w.ranged && !allowRanged) return none('ranged');

  const inReach = fauna.hitTest(playerPos.x, playerPos.z, w.reach);
  if (!inReach.length) {
    // how far off the nearest living thing is, so a miss can say so rather than
    // leaving the player guessing whether the swing even happened
    const near = fauna.hitTest(playerPos.x, playerPos.z, w.reach * 6)[0] || null;
    return none('out_of_reach', near ? Math.hypot(near.position.x - playerPos.x, near.position.z - playerPos.z) : null);
  }
  // a swing cannot reach a bird on the wing. An arrow can, when it exists.
  const swingable = w.ranged ? inReach : inReach.filter((m) => !isFlying(m));
  if (!swingable.length) return none('too_high', 0);

  // hitTest is sorted by distance from the player already, and Array.sort is
  // stable, so sorting by distance from the cursor breaks its own ties on
  // "nearer to you", which is the right answer when the cursor cannot decide.
  const aim = isPoint(aimPos) ? aimPos : playerPos;
  const animal = swingable.slice().sort((a, b) => dist2(a.position, aim) - dist2(b.position, aim))[0];
  return {
    animal,
    dist: Math.hypot(animal.position.x - playerPos.x, animal.position.z - playerPos.z),
    aimDist: Math.sqrt(dist2(animal.position, aim)),
    reason: 'target', nearest: null,
  };
}

/**
 * Swing whatever is in hand at whatever is in front of you.
 *
 * @param fauna        the object from createFauna (hitTest and damage)
 * @param tool         'hand' | 'axe' | 'pickaxe' | 'bow'
 * @param playerPos    { x, z } where you are standing
 * @param aimPos       { x, z } where the cursor points, or null for straight ahead
 * @param now          ms
 * @param lastSwingAt  ms of the last swing that LANDED
 * @param allowRanged  let the bow resolve at its own reach (not wired yet)
 *
 * @returns {{ hit, animal, damage, killed, reason, ... }}
 *   reasons: 'killed' | 'wounded' on a hit; 'cooldown', 'out_of_reach',
 *   'too_high', 'ranged', 'no_fauna', 'no_position', 'gone' on a refusal.
 *   A refusal never touches an animal and never starts the cooldown.
 */
export function resolveSwing({ fauna, tool, playerPos, aimPos, now, lastSwingAt, allowRanged = false } = {}) {
  const w = weaponFor(tool);
  const name = WEAPONS[tool] ? tool : 'hand';
  const t = Number.isFinite(now) ? now : 0;
  const miss = (reason, extra = {}) => ({
    hit: false, animal: null, damage: 0, killed: false, reason,
    tool: name, weapon: w, loot: null, ...extra,
  });

  if (!fauna || typeof fauna.hitTest !== 'function' || typeof fauna.damage !== 'function') return miss('no_fauna');
  if (!isPoint(playerPos)) return miss('no_position');
  if (Number.isFinite(lastSwingAt) && t - lastSwingAt < w.cooldown) {
    return miss('cooldown', { wait: Math.max(0, w.cooldown - (t - lastSwingAt)) });
  }
  if (w.ranged && !allowRanged) return miss('ranged');

  const target = pickTarget({ fauna, tool, playerPos, aimPos, allowRanged });
  if (!target.animal) return miss(target.reason, { nearest: target.nearest });
  const { animal } = target;

  const res = fauna.damage(animal, w.damage, playerPos.x, playerPos.z, t);
  if (!res) return miss('gone');

  return {
    hit: true,
    animal,
    damage: res.damage,
    killed: res.killed,
    reason: res.killed ? 'killed' : 'wounded',
    kind: res.kind,
    hp: res.hp,
    hpMax: res.hpMax,
    tool: name,
    weapon: w,
    dist: target.dist,
    aimDist: target.aimDist,
    loot: res.killed ? lootFor(res.kind) : null,
  };
}

/** "2 venison". Say it only after the pack (or the purse) has really taken it. */
export function lootText(loot) {
  if (!loot) return '';
  return `${loot.n} ${loot.name.toLowerCase()}`;
}

/** "a deer", "an ox". Same rule interact.js uses for a boulder. */
export const anA = (noun) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;

/** What to call a species on screen. */
export const NAMES = { deer: 'deer', rabbit: 'rabbit', squirrel: 'squirrel', fox: 'fox', wolf: 'wolf', gull: 'gull' };
export const nameFor = (kind) => NAMES[kind] || 'animal';

/**
 * The line a swing earns. Every branch says something, including the ones that
 * changed nothing, because a silent swing and a broken button look the same.
 * `interact.js` passes this straight to `hud.toast`.
 */
export function swingText(res) {
  if (!res) return '';
  const noun = nameFor(res.kind);
  switch (res.reason) {
    case 'killed':
      // the deed only. What the kill LEAVES is `lootText`, and it belongs to
      // whoever actually put it in the pack: a line promising two venison over a
      // pack that gained nothing is the silent-effect bug wearing a hat.
      return `the ${noun} goes down`;
    case 'wounded':
      return `${res.weapon.noun} lands on the ${noun}, and it runs`;
    case 'out_of_reach':
      return res.nearest != null
        ? `you swing at nothing, the nearest of them is ${Math.round(res.nearest)} m off`
        : 'you swing at nothing';
    case 'too_high':
      return 'the gulls are well out of reach up there';
    case 'ranged':
      return 'a bow is for shooting, not for clubbing, take out a hand or an axe';
    case 'cooldown':
    case 'no_fauna':
    case 'no_position':
    case 'gone':
    default:
      return '';
  }
}
