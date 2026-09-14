// The v1 talent map and its save sanitizer. Keep this frozen in its own
// module: v2 classes may change their nodes without reinterpreting a talent a
// player already earned under the old global trees.

export const V1_STARTER_ABILITIES = {
  warrior: ['powerStrike'], ranger: ['aimedShot'], rogue: ['dualStrike', 'hide'], mage: ['magicArrow'],
};

export const V1_TALENT_TREES = [
  { id: 'warrior', branches: [
    { ids: ['powerStrike', 'rend', 'whirlwind', 'berserk'] },
    { ids: ['shieldBash', 'disarm', 'riposte'] },
    { ids: ['lunge', 'sweep', 'crushingBlow', 'leapSlam', 'battleCry'] },
  ] },
  { id: 'ranger', branches: [
    { ids: ['aimedShot', 'doubleShot', 'piercingArrow', 'volley'] },
    { ids: ['snare', 'cripplingShot', 'disengage'] },
    { ids: ['huntersMark', 'beastCall', 'fleetFoot'] },
  ] },
  { id: 'mage', branches: [
    { ids: ['magicArrow', 'blink', 'lightning', 'chainLightning', 'arcaneMastery', 'rift'] },
    { ids: ['fireball', 'iceShard', 'frostNova', 'meteor', 'elementalKin'] },
    { ids: ['hex', 'eldritchBolt', 'manaShield', 'stoneSkin', 'ward', 'spellPlague', 'transmute'] },
  ] },
  { id: 'rogue', branches: [
    { ids: ['dualStrike', 'deepCut', 'kidneyShot', 'finishingStrike'] },
    { ids: ['hide', 'backstab', 'shadowstep', 'vanish'] },
    { ids: ['throwingKnife', 'poisonBlade', 'pickPocket', 'evasion', 'exposeWeakness'] },
  ] },
  { id: 'necromancer', branches: [
    { ids: ['boneSpear', 'raiseSkeleton', 'raiseChampion'] },
    { ids: ['lifeDrain', 'curseOfWeakness', 'corpseExplosion', 'lichForm'] },
    { ids: ['summonImp', 'fear', 'summonHound'] },
  ] },
  { id: 'healer', branches: [
    { ids: ['heal', 'greaterHeal', 'layOnHands'] },
    { ids: ['cleanse', 'bless', 'sanctuary'] },
    { ids: ['consecrateWeapon', 'smite', 'resurrect'] },
  ] },
  { id: 'bard', branches: [
    { ids: ['provoke', 'discord'] },
    { ids: ['peace', 'lullaby'] },
    { ids: ['marchingSong', 'warDrum'] },
  ] },
  { id: 'everyone', branches: [{ ids: ['camp'] }] },
];

const ROW_LEVELS = [2, 6, 14, 26, 42, 62, 82];
export const V1_TALENT_NODES = Object.fromEntries(V1_TALENT_TREES.flatMap((tree) => tree.branches.flatMap((branch) =>
  branch.ids.map((id, index) => [id, {
    id, tree: tree.id, level: ROW_LEVELS[index], requires: branch.ids[index - 1] || null,
  }]),
)));

export const V1_COMMON_ABILITIES = ['jump', 'sprint', 'bandage', 'meditate', 'recall'];
export const V1_VALID_IDS = new Set([...V1_COMMON_ABILITIES, ...Object.keys(V1_TALENT_NODES)]);

const rank = (record, id) => {
  const value = record?.ranks?.[id];
  return Number.isFinite(value) ? Math.max(0, Math.min(5, Math.floor(value))) : 0;
};

const spend = (record) => {
  const granted = new Set(record.granted || []);
  return Object.entries(record.ranks || {}).reduce((total, [id, value]) =>
    total + Math.max(0, rank(record, id) - (granted.has(id) ? 1 : 0)), 0);
};

/**
 * Rebuild a v1 document through the exact old gates before v2 turns it into
 * class allocations. Callers supply current ability records and the two small
 * arithmetic functions to keep this history module free of domain imports.
 */
export function sanitizeV1(raw, opening, abilities, { maxRank, levelForXp, maxXp }) {
  const granted = [...new Set([
    ...V1_COMMON_ABILITIES,
    ...(V1_STARTER_ABILITIES[opening] || []),
    ...(Array.isArray(raw?.granted) ? raw.granted.filter((id) => V1_VALID_IDS.has(id)) : []),
  ])];
  const out = {
    v: 1,
    xp: Number.isFinite(raw?.xp) ? Math.max(0, Math.min(maxXp, Math.floor(raw.xp))) : 0,
    granted,
    ranks: Object.fromEntries(granted.map((id) => [id, 1])),
  };
  const character = { advancement: out };
  for (let pass = 0; pass < 5; pass++) {
    for (const [id, node] of Object.entries(V1_TALENT_NODES)) {
      const ability = abilities[id];
      const desired = rank(raw, id);
      const current = rank(out, id);
      if (!ability || current >= desired || current >= maxRank(ability)) continue;
      const neededLevel = Math.max(node.level, 1 + current * 8);
      if (levelForXp(character) < neededLevel) continue;
      // The old gate only required a preceding row to establish rank one.
      // A previously granted ability was already rank one, so its later
      // training ranks remained valid even without that predecessor.
      if (current === 0 && node.requires && !out.ranks[node.requires]) continue;
      if (levelForXp(character) - 1 <= spend(out)) continue;
      out.ranks[id] = current + 1;
    }
  }
  return out;
}
