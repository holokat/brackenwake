// The four authored spell motions, in seconds.
//
// PORTED from the studio's src/animation/spellMotion.ts. These are the SAME
// numbers the clip bank in public/animations/human-male.json carries as its
// `cast-gather` and `cast-release` events, and spell_vfx.test.mjs proves it
// rather than trusting it: the effects below are written against these
// constants, and a bank re-bake that moved a release without moving these
// would fire a fireball out of a hand that had not opened yet.

export const ELEMENTAL_SPELL_IDS = ['fireball', 'lightning', 'energy-missiles', 'healing'];

export const SPELL_MOTIONS = {
  fireball: { duration: 1.35, gather: 0.24, release: [0.78], recover: 1.04 },
  lightning: { duration: 1.65, gather: 0.22, release: [0.74], recover: 1.18 },
  'energy-missiles': { duration: 1.1, gather: 0.18, release: [0.43, 0.60, 0.77], recover: 0.9 },
  healing: { duration: 1.8, gather: 0.28, release: [1.08], recover: 1.42 },
};

export const isElementalSpell = (move) => ELEMENTAL_SPELL_IDS.includes(move);
