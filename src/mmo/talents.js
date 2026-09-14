// Class-owned talent allocation, save migration, and compatibility projection.
// Ability effects remain in abilities.js; this module owns only who learned a
// row, what it cost, and how an old save remains playable after the class tree
// grew distinct node identities.

import { CLASS_TREES, CLASS_NODES } from './class_trees.js';
import { V1_COMMON_ABILITIES, V1_VALID_IDS, sanitizeV1 } from './legacy_talents.js';

export const MAX_LEVEL = 99;
export const COMMON_ABILITIES = [...V1_COMMON_ABILITIES];
export const STARTER_ABILITIES = {
  warrior: ['powerStrike'], ranger: ['aimedShot'], rogue: ['dualStrike', 'hide'], mage: ['magicArrow'],
  paladin: ['powerStrike', 'heal'], priest: ['eldritchBolt', 'heal'],
};

const LIVE_NODES = Object.values(CLASS_NODES).filter((node) => node.status === 'live' && node.abilityId);
const LIVE_ABILITY_IDS = new Set(LIVE_NODES.map((node) => node.abilityId));
const VALID_ABILITY_IDS = new Set([...COMMON_ABILITIES, ...LIVE_ABILITY_IDS, ...V1_VALID_IDS]);

/** Camp remains one shared purchase, outside the six class catalogues. */
export const SHARED_NODES = {
  'shared.fieldcraft.camp': {
    id: 'shared.fieldcraft.camp', abilityId: 'camp', name: 'Campcraft', status: 'live',
    level: 2, row: 0, column: 1, requires: [], shared: true,
  },
};

const ALL_NODES = { ...CLASS_NODES, ...SHARED_NODES };
const NODES_BY_CLASS = Object.fromEntries(CLASS_TREES.map((tree) => [tree.id,
  tree.branches.flatMap((branch) => branch.nodes).filter((node) => node.status === 'live' && node.abilityId),
]));

// Legacy panels read branches as ability ids. New panels read CLASS_TREES and
// CLASS_NODES directly, but this keeps the old import surface honest while UI
// callers migrate one at a time.
export const TALENT_TREES = CLASS_TREES.map((tree) => ({
  id: tree.id,
  name: tree.name,
  branches: tree.branches.map((branch) => ({
    name: branch.name,
    ids: branch.nodes.filter((node) => node.status === 'live' && node.abilityId).map((node) => node.abilityId),
  })),
}));

/** Compatibility lookup for callers with an ability id but no class context. */
export const TALENT_NODES = Object.fromEntries([
  ...LIVE_NODES.map((node) => [node.abilityId, node]),
  ['camp', SHARED_NODES['shared.fieldcraft.camp']],
]);

const integer = (n, low, high) => Number.isFinite(n) ? Math.max(low, Math.min(high, Math.floor(n))) : low;
const rankValue = (value, max = 5) => integer(value, 0, max);
const nodeClass = (node) => node?.shared ? null : String(node?.id || '').split('.')[0];
const classOf = (character, opening = null) => opening || character?.opening || character?.advancement?.classId || 'warrior';

export function xpToNextLevel(level) {
  const n = integer(level, 1, MAX_LEVEL) - 1;
  return level >= MAX_LEVEL ? 0 : 100 + 35 * n + 8 * n * n;
}

export const LEVEL_XP = [0, 0];
for (let level = 2; level <= MAX_LEVEL; level++) LEVEL_XP[level] = LEVEL_XP[level - 1] + xpToNextLevel(level - 1);
export const MAX_XP = LEVEL_XP[MAX_LEVEL];

export function levelOf(character) {
  const xp = integer(character?.advancement?.xp, 0, MAX_XP);
  let low = 1, high = MAX_LEVEL;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (LEVEL_XP[mid] <= xp) low = mid;
    else high = mid - 1;
  }
  return low;
}

function liveNodeFor(classId, abilityId) {
  return (NODES_BY_CLASS[classId] || []).find((node) => node.abilityId === abilityId) || null;
}

/** Resolve a class node id, an ability id, or an ability record for this character. */
export function nodeFor(character, input) {
  const id = typeof input === 'string' ? input : input?.id;
  if (!id) return null;
  const explicit = ALL_NODES[id];
  const classId = classOf(character);
  if (explicit) return (explicit.shared || nodeClass(explicit) === classId) ? explicit : null;
  const abilityId = input?.abilityId || id;
  if (abilityId === 'camp') return SHARED_NODES['shared.fieldcraft.camp'];
  return liveNodeFor(classId, abilityId);
}

export function maxTalentRank(ability) {
  return ability && !ability.passive && ability.cooldown > 0 ? 5 : 1;
}

export function nodeMaxRank(node, abilities = {}) {
  if (Number.isInteger(node?.maxRank)) return node.maxRank;
  const ability = abilities[node?.abilityId];
  return ability ? maxTalentRank(ability) : 5;
}

/** The class-node allocation is authoritative. Ability ranks are a projection. */
export function nodeRank(character, nodeOrId) {
  const node = typeof nodeOrId === 'object' ? nodeOrId : nodeFor(character, nodeOrId);
  if (!node) return 0;
  return rankValue(character?.advancement?.allocations?.[node.id], nodeMaxRank(node));
}

export function talentRank(character, input) {
  const node = typeof input === 'object' && input?.id in ALL_NODES
    ? input
    : typeof input === 'string' && input in ALL_NODES ? ALL_NODES[input] : null;
  if (node) return nodeRank(character, node);
  const id = typeof input === 'string' ? input : input?.abilityId || input?.id;
  return rankValue(character?.advancement?.ranks?.[id]);
}

function starterNodeRanks(classId) {
  const ranks = {};
  for (const abilityId of STARTER_ABILITIES[classId] || []) {
    const node = liveNodeFor(classId, abilityId);
    if (node) ranks[node.id] = 1;
  }
  return ranks;
}

function projectedRanks(advancement) {
  const ranks = Object.fromEntries((advancement.granted || []).filter((id) => VALID_ABILITY_IDS.has(id)).map((id) => [id, 1]));
  for (const [id, value] of Object.entries(advancement.allocations || {})) {
    const node = ALL_NODES[id];
    if (!node || node.status !== 'live' || !node.abilityId) continue;
    ranks[node.abilityId] = Math.max(ranks[node.abilityId] || 0, rankValue(value, nodeMaxRank(node)));
  }
  for (const [abilityId, value] of Object.entries(advancement.legacy?.allocations || {})) {
    if (!V1_VALID_IDS.has(abilityId)) continue;
    ranks[abilityId] = Math.max(ranks[abilityId] || 0, rankValue(value));
  }
  return ranks;
}

function refreshProjection(advancement) {
  advancement.ranks = projectedRanks(advancement);
  return advancement;
}

export function newAdvancement(opening) {
  const classId = classOf(null, opening);
  const granted = [...new Set([...COMMON_ABILITIES, ...(STARTER_ABILITIES[classId] || [])])];
  return refreshProjection({
    v: 2,
    classId,
    xp: 0,
    granted,
    allocations: starterNodeRanks(classId),
    legacy: { allocations: {} },
  });
}

function baseRank(advancement, abilityId) {
  return advancement.granted?.includes(abilityId) ? 1 : 0;
}

function allocationSpend(advancement) {
  let modifierSpend = 0;
  const abilityRanks = {};
  for (const [id, value] of Object.entries(advancement.allocations || {})) {
    const node = ALL_NODES[id];
    if (!node || node.status !== 'live') continue;
    const rank = rankValue(value, nodeMaxRank(node));
    if (node.kind === 'modifier') {
      modifierSpend += rank * (node.pointCost || 1);
    } else if (node.abilityId) {
      abilityRanks[node.abilityId] = Math.max(abilityRanks[node.abilityId] || 0, rank);
    }
  }
  for (const [abilityId, value] of Object.entries(advancement.legacy?.allocations || {})) {
    if (!V1_VALID_IDS.has(abilityId)) continue;
    abilityRanks[abilityId] = Math.max(abilityRanks[abilityId] || 0, rankValue(value));
  }
  return modifierSpend + Object.entries(abilityRanks).reduce((spent, [abilityId, rank]) =>
    spent + Math.max(0, rank - baseRank(advancement, abilityId)), 0);
}

export function availablePoints(character) {
  const advancement = character?.advancement;
  if (!advancement) return 0;
  return Math.max(0, levelOf(character) - 1 - allocationSpend(advancement));
}

/** Per-spec accounting is useful to class-tree UI without changing the global point pool. */
export function treePoints(character, specId) {
  const allocations = character?.advancement?.allocations || {};
  const spent = Object.entries(allocations).reduce((total, [id, value]) => {
    const node = ALL_NODES[id];
    if (!node || !id.startsWith(`${classOf(character)}.${specId}.`)) return total;
    const rank = rankValue(value, nodeMaxRank(node));
    return total + (node.kind === 'modifier'
      ? rank * (node.pointCost || 1)
      : Math.max(0, rank - baseRank(character.advancement, node.abilityId)) * (node.pointCost || 1));
  }, 0);
  return { spent, available: availablePoints(character) };
}

function purchaseCheck(character, node, abilities = {}) {
  if (!character?.advancement) return { ok: false, reason: 'This ability is part of your starting kit.' };
  if (!node) return { ok: false, reason: 'This class cannot learn that ability.' };
  if (node.status !== 'live') return { ok: false, reason: 'This node is not available.' };
  if (!node.shared && nodeClass(node) !== classOf(character)) return { ok: false, reason: 'This class cannot learn that ability.' };
  const rank = nodeRank(character, node);
  const max = nodeMaxRank(node, abilities);
  if (rank >= max) return { ok: false, reason: 'Fully learned.' };
  const level = node.kind === 'modifier' ? (node.level || 1) : Math.max(node.level || 1, 1 + rank * 8);
  if (levelOf(character) < level) return { ok: false, reason: `Requires level ${level}.` };
  for (const requiredId of node.requires || []) {
    const required = ALL_NODES[requiredId];
    if (!required || nodeRank(character, required) < 1) {
      return { ok: false, reason: 'Learn the preceding ability first.', requires: required?.abilityId || requiredId };
    }
  }
  if (node.requiredTreePoints) {
    const specId = String(node.id).split('.')[1];
    const spent = treePoints(character, specId).spent;
    if (spent < node.requiredTreePoints) return { ok: false, reason: `Requires ${node.requiredTreePoints} points in ${specId}.` };
  }
  if (node.choiceGroup) {
    const chosen = Object.values(ALL_NODES).find((other) => other.choiceGroup === node.choiceGroup
      && other.id !== node.id && nodeRank(character, other) > 0);
    if (chosen) return { ok: false, reason: `Already chose ${chosen.name}.` };
  }
  if (!availablePoints(character)) return { ok: false, reason: 'Gain a level to earn a talent point.' };
  return { ok: true, rank: rank + 1, node };
}

function abilityMap(input, node, abilities) {
  const ability = input?.abilityId ? input : abilities[node?.abilityId] || input;
  return ability?.id ? { [ability.id]: ability, ...abilities } : abilities;
}

export function learnCheck(character, input, abilities = {}) {
  const node = nodeFor(character, input);
  return purchaseCheck(character, node, abilityMap(input, node, abilities));
}

export function learnTalent(character, input, abilities = {}) {
  const node = nodeFor(character, input);
  const check = purchaseCheck(character, node, abilityMap(input, node, abilities));
  if (!check.ok) return check;
  if (!character.advancement.allocations) character.advancement.allocations = {};
  character.advancement.allocations[node.id] = check.rank;
  refreshProjection(character.advancement);
  return { ...check, ability: node.abilityId, node: node.id, points: availablePoints(character) };
}

/** Refund paid class-tree choices without touching free grants or historical ranks. */
export function respecTalentTree(character) {
  const advancement = character?.advancement;
  if (!advancement) return { ok: false, reason: 'No talent record to reset.' };
  // The archive reserves old points but is deliberately never refunded: it
  // represents ranks whose original tree no longer exists.
  const before = allocationSpend({ ...advancement, legacy: { allocations: {} } });
  advancement.allocations = starterNodeRanks(advancement.classId || classOf(character));
  appendGrants(advancement, advancement.granted || []);
  refreshProjection(advancement);
  return { ok: true, refunded: before, points: availablePoints(character) };
}

export function talentGate(ability, character) {
  if (!character?.advancement) return null;
  return talentRank(character, ability.id) > 0
    ? { ok: true }
    : { ok: false, reason: `Learn ${ability.name} in Skill trees (P).` };
}

export function talentCooldown(ability, character) {
  return ability.cooldown * (1 - 0.03 * Math.max(0, talentRank(character, ability.id) - 1));
}

export function grantExperience(character, amount) {
  if (!character?.advancement || !Number.isFinite(amount) || amount <= 0) return { gained: 0, levels: 0 };
  const before = levelOf(character), old = character.advancement.xp;
  character.advancement.xp = Math.min(MAX_XP, old + Math.floor(amount));
  return { gained: character.advancement.xp - old, levels: levelOf(character) - before, level: levelOf(character) };
}

export function progressionView(character) {
  const level = levelOf(character);
  const xp = integer(character?.advancement?.xp, 0, MAX_XP) - LEVEL_XP[level];
  const needed = xpToNextLevel(level);
  return { level, xp, needed, points: availablePoints(character), fraction: needed ? xp / needed : 1 };
}

function legacyOptions() {
  return { maxRank: maxTalentRank, levelForXp: levelOf, maxXp: MAX_XP };
}

function appendGrants(advancement, granted) {
  advancement.granted = [...new Set([
    ...(advancement.granted || []),
    ...(Array.isArray(granted) ? granted.filter((id) => VALID_ABILITY_IDS.has(id)) : []),
  ])];
  // Older saves could hold a free learned ability without an advancement
  // document. When it belongs to this class, make that grant authoritative in
  // its current node even if today's level or prerequisite would block a new
  // purchase. Foreign grants deliberately remain archive-only projections.
  for (const abilityId of advancement.granted) {
    const node = liveNodeFor(advancement.classId, abilityId);
    if (node && rankValue(advancement.allocations?.[node.id]) < 1) {
      (advancement.allocations ||= {})[node.id] = 1;
    }
  }
}

function restoreNodeRanks(out, requested, abilities) {
  const wanted = Object.entries(requested || {})
    .map(([id, value]) => [ALL_NODES[id], rankValue(value)])
    .filter(([node]) => node && node.status === 'live' && (node.shared || nodeClass(node) === out.classId))
    .sort(([a], [b]) => a.id.localeCompare(b.id));
  // A save is an object, so its key order cannot decide whether a dependent
  // rank restores. Every successful pass buys at least one requested rank.
  const maximumPasses = wanted.reduce((sum, [, target]) => sum + target, 0) + 1;
  for (let pass = 0; pass < maximumPasses; pass++) {
    let changed = false;
    for (const [node, target] of wanted) {
      const character = { opening: out.classId, advancement: out };
      if (nodeRank(character, node) >= target) continue;
      const check = purchaseCheck(character, node, abilities);
      if (!check.ok) continue;
      out.allocations[node.id] = check.rank;
      refreshProjection(out);
      changed = true;
    }
    if (!changed) break;
  }
}

function legacyRanksFromV1(v1, out, abilities) {
  const current = { opening: out.classId, advancement: out };
  for (const [abilityId, value] of Object.entries(v1.ranks || {})) {
    const rank = rankValue(value);
    const base = baseRank(out, abilityId);
    if (rank <= base) continue;
    const node = liveNodeFor(out.classId, abilityId);
    let kept = false;
    if (node) {
      for (let next = nodeRank(current, node); next < rank; next++) {
        const check = purchaseCheck(current, node, abilities);
        if (!check.ok) break;
        out.allocations[node.id] = check.rank;
        refreshProjection(out);
      }
      kept = nodeRank(current, node) >= rank;
    }
    if (!kept) out.legacy.allocations[abilityId] = rank;
  }
}

function hydrateV1(raw, opening, legacyIds, abilities) {
  const canonical = sanitizeV1(raw, opening, abilities, legacyOptions());
  const out = newAdvancement(opening);
  out.xp = canonical.xp;
  appendGrants(out, canonical.granted);
  refreshProjection(out);
  legacyRanksFromV1(canonical, out, abilities);
  return refreshProjection(out);
}

function sanitizeLegacyArchive(raw, advancement, abilities) {
  const source = raw?.legacy?.allocations;
  if (!source || typeof source !== 'object') return {};
  // Historical chains may now span a current allocation and the legacy
  // archive. Rebuild the whole historical picture before deciding which old
  // archive ranks remain valid, or a saved Chain Lightning can lose its old
  // Lightning prerequisite on the second load.
  const historicalRanks = { ...(advancement.ranks || {}) };
  for (const [id, value] of Object.entries(source)) historicalRanks[id] = Math.max(rankValue(historicalRanks[id]), rankValue(value));
  const legacy = sanitizeV1({
    v: 1,
    xp: advancement.xp,
    granted: advancement.granted,
    ranks: historicalRanks,
  }, advancement.classId, abilities, legacyOptions());
  const ranks = {};
  for (const id of Object.keys(source)) {
    const value = legacy.ranks[id];
    const asked = rankValue(source[id]);
    const kept = rankValue(value);
    if (kept && (!legacy.granted.includes(id) || asked > 1)) ranks[id] = kept;
  }
  return ranks;
}

function hydrateV2(raw, opening, legacyIds, abilities) {
  const classId = opening || raw.classId || 'warrior';
  const seed = () => {
    const out = newAdvancement(classId);
    out.xp = integer(raw.xp, 0, MAX_XP);
    appendGrants(out, raw.granted || []);
    return refreshProjection(out);
  };
  // Validate current allocations first so historical archive validation can
  // see the current prerequisite ranks. Build the final document again with
  // the valid legacy spend already reserved: forged current plus legacy ranks
  // can never claim the same level's point twice.
  const provisional = seed();
  restoreNodeRanks(provisional, raw.allocations, abilities);
  const out = seed();
  out.legacy.allocations = sanitizeLegacyArchive(raw, provisional, abilities);
  refreshProjection(out);
  restoreNodeRanks(out, raw.allocations, abilities);
  return refreshProjection(out);
}

/**
 * Hydration never trusts saved points, class allocations, or rank projections.
 * v1 is rebuilt through its historical gates first, then migrated; v2 is
 * rebuilt from live class nodes and a separate read-only legacy archive.
 */
export function hydrateAdvancement(raw, opening, legacyIds = [], abilities = {}) {
  const classId = opening || raw?.classId || 'warrior';
  if (raw?.v === 2) return hydrateV2(raw, classId, legacyIds, abilities);
  if (raw?.v === 1) return hydrateV1(raw, classId, legacyIds, abilities);
  const fresh = newAdvancement(classId);
  appendGrants(fresh, legacyIds);
  return refreshProjection(fresh);
}
