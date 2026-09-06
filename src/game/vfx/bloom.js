// Which materials the spell bloom is allowed to see, and how it sees them.
//
// PORTED from the studio at
// /Users/k/Documents/Codex/2026-09-04/using/outputs/warrior-combat-playground:
//   src/vfx/spells/spellBloom.ts        -> enableSpellBloom
//   src/scene/createSpellBloomSelection.ts -> createSpellBloomSelection
//
// The parameters and the structure are the studio's on purpose: an update from
// the studio should be a re-port of these files, not a rewrite of them.
//
// The point of the selection is that ONLY a spell glows. The lit character,
// the grass and the sky keep their colour write off for the emission pass, so
// the bright pass contains the spell and nothing else, and a white shirt in
// noon sun does not bloom.

/** Mark a material as an explicit contributor to the selective spell bloom. */
export function enableSpellBloom(material) {
  material.userData.spellBloom = true;
  return material;
}

/** True when this material asked for bloom and is still allowed to write colour. */
export const wantsSpellBloom = (material) => !!(material && material.userData && material.userData.spellBloom === true);

/**
 * Suppress ordinary colour while retaining depth, skinning and transparency.
 *
 * `render(draw)` returns false and never calls `draw` when nothing visible in
 * the scene asked for bloom, which is what makes the whole pass free on a
 * frame with no spell alive.
 */
export function createSpellBloomSelection(scene) {
  const saved = new Map();
  let hasEmission = false;
  function inspectMaterial(material) {
    if (!material.visible || saved.has(material)) return;
    saved.set(material, material.colorWrite);
    if (wantsSpellBloom(material) && material.colorWrite) hasEmission = true;
    else material.colorWrite = false;
  }
  function inspect(object) {
    const material = object.material;
    if (Array.isArray(material)) for (const item of material) inspectMaterial(item);
    else if (material) inspectMaterial(material);
  }
  return {
    render(draw) {
      hasEmission = false;
      try {
        scene.traverseVisible(inspect);
        if (hasEmission) draw();
        return hasEmission;
      } finally {
        for (const [material, colorWrite] of saved) material.colorWrite = colorWrite;
        saved.clear();
      }
    },
  };
}
