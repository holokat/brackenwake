// The four authored spells, and the seven elements they can be dressed as.
//
// PORTED from the studio's src/vfx/createElementalSpellVfx.ts and
// src/vfx/abilities/createSignatureSpells.ts, joined into one thing because
// the game needs both halves at once: the studio's dispatcher over the four
// spells, and the signature layer's trick of stretching game time onto each
// spell's own authored timeline so a 2.5 second Meteor and a 0.6 second
// Fireball both play the effect at the speed it was animated at.
//
// THE ELEMENTS ARE THE GAME'S ADDITION, and are the answer to a real gap: the
// studio authored fire, blue lightning, violet missiles and a green blessing,
// and Brackenwake has seventy eight abilities across seven schools. Every one of
// the four takes a palette (see the setPalette seams in fireball.js,
// lightning.js and missiles.js), so an Ice Shard is the fireball chain in
// frost, a Smite is the strike in holy, and a Bone Spear is the volley in
// shadow. Nothing is duplicated to make that true.

import * as THREE from 'three';
import { createFireballVfx, FIREBALL_RELEASE, FIREBALL_END } from './fireball.js';
import { createLightningVfx, LIGHTNING_RELEASE, LIGHTNING_END } from './lightning.js';
import { createEnergyMissilesVfx, ENERGY_MISSILES_END } from './missiles.js';
import { createHealingVfx } from './healing.js';
import { SPELL_MOTIONS } from './motions.js';
import { elementPalette } from './visuals.js';

/** The four signatures, with the release and the end of each in its own seconds. */
export const SIGNATURES = {
  fireball: { release: FIREBALL_RELEASE, end: FIREBALL_END },
  lightning: { release: LIGHTNING_RELEASE, end: LIGHTNING_END },
  missiles: { release: SPELL_MOTIONS['energy-missiles'].release[0], end: ENERGY_MISSILES_END },
  healing: { release: SPELL_MOTIONS.healing.release[0], end: SPELL_MOTIONS.healing.duration },
};

export const SIGNATURE_IDS = Object.keys(SIGNATURES);

/**
 * Map game seconds onto one signature's own seconds.
 *
 * Before the game's release the two timelines are stretched onto each other so
 * the gather fills exactly the cast; after it, the effect runs at its authored
 * speed so the flight, the impact and the tail are never sped up or slowed
 * down. This is the studio's own rule from createSignatureSpells.
 */
export function signatureTime(id, time, release) {
  const source = SIGNATURES[id];
  if (!source) return time;
  const gate = release > 0.0001 ? release : 0.0001;
  return time < release ? (time / gate) * source.release : source.release + (time - release);
}

export function createElementalSpellVfx(context, options = {}) {
  const fireball = createFireballVfx(context);
  const lightning = createLightningVfx(context);
  const missiles = createEnergyMissilesVfx(context, { single: !!options.singleMissile });
  const healing = createHealingVfx(context);
  const effects = { fireball, lightning, missiles, healing };
  const candidate = new THREE.Vector3();
  let current = null;
  let element = null;

  function hideAll() {
    for (const key of SIGNATURE_IDS) effects[key].root.visible = false;
  }

  function resetAll() {
    fireball.reset();
    lightning.reset();
    missiles.reset();
    healing.reset();
    hideAll();
    current = null;
    element = null;
  }

  resetAll();

  return {
    effects,
    get current() { return current; },
    get element() { return element; },
    /**
     * Aim a signature before it is played. `launch` and `target` are in the
     * actor's local frame; healing ignores both because it plays on the body.
     */
    aim(id, launchLocal, targetLocal) {
      if (id === 'fireball') fireball.setAim(launchLocal, targetLocal);
      else if (id === 'lightning') lightning.setAim(targetLocal);
      else if (id === 'missiles') missiles.setAim(targetLocal);
      return this;
    },
    /** Dress a signature in an element. Null puts the studio's own colours back. */
    dress(id, elementName) {
      const palette = elementName ? elementPalette(elementName) : null;
      element = elementName || null;
      const effect = effects[id];
      if (!effect) return this;
      if (!palette) {
        if (effect.resetPalette) effect.resetPalette();
        else if (effect.setTint) effect.setTint('#83f0b2');
        return this;
      }
      if (effect.setPalette) effect.setPalette(palette);
      else if (effect.setTint) effect.setTint(palette.color);
      return this;
    },
    /** Start `id` over: the next `play` is the first frame of a new cast. */
    begin(id) {
      resetAll();
      current = SIGNATURES[id] ? id : null;
      if (current) effects[current].reset();
      return this;
    },
    /**
     * One frame. `time` and `release` are the GAME's seconds for this cast;
     * everything after this call is in the signature's own.
     */
    play(id, time, release) {
      hideAll();
      if (!SIGNATURES[id]) return false;
      if (current !== id) { resetAll(); current = id; }
      effects[id].update(signatureTime(id, time, release));
      return true;
    },
    /** How long the signature runs after the game's release, in game seconds. */
    tailFor(id) {
      const source = SIGNATURES[id];
      return source ? source.end - source.release : 0;
    },
    samplePresentation(worldPosition) {
      let strength = 0;
      for (const key of SIGNATURE_IDS) {
        const effect = effects[key];
        if (!effect.samplePresentation) continue;
        const value = effect.samplePresentation(candidate);
        if (value > strength) { strength = value; worldPosition.copy(candidate); }
      }
      return strength;
    },
    reset: resetAll,
    dispose() {
      for (const key of SIGNATURE_IDS) effects[key].dispose();
    },
  };
}
