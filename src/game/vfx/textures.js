// The two flipbook atlases the spell effects sample: fire and smoke.
//
// PORTED from the studio's src/vfx/spells/loadSpellTextures.ts. The files come
// from the same bake (scripts/bake-spell-fire-atlas.py over there) and are
// copied into public/vfx/ beside the game's other assets, so the URLs are the
// ones the studio's own loader used and an update is a file copy.
//
// A MISSING ATLAS IS NOT A CRASH. Every effect that samples one already takes
// `textures` as optional and falls back to the untextured soft disc in
// particles.js, so a failed fetch costs the flipbook and nothing else. The
// promise resolves to null instead of rejecting, and says so once in the
// console rather than once a frame.

import * as THREE from 'three';

export const SPELL_ATLAS = {
  fire: '/studio/vfx/spell-fire-explosion-atlas.png',
  smoke: '/studio/vfx/spell-smoke-atlas.png',
  /** The bake's grid. particles.js validates frames against columns * rows. */
  grid: { columns: 6, rows: 6, frames: 36 },
};

let loader = null;
let pending = null;
let loaded = null;
let warned = false;

function textureLoader() {
  if (!loader) loader = new THREE.TextureLoader();
  return loader;
}

function shape(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * The atlases, once per session. Resolves to `{ fire, smoke, grid, dispose }`
 * or to null when either file could not be fetched.
 */
export function loadSpellTextures() {
  if (loaded) return Promise.resolve(loaded);
  if (pending) return pending;
  const load = (url) => new Promise((resolve, reject) => textureLoader().load(url, resolve, undefined, reject));
  pending = Promise.allSettled([load(SPELL_ATLAS.fire), load(SPELL_ATLAS.smoke)]).then((results) => {
    pending = null;
    const [fireResult, smokeResult] = results;
    if (fireResult.status !== 'fulfilled' || smokeResult.status !== 'fulfilled') {
      for (const result of results) if (result.status === 'fulfilled') result.value.dispose();
      if (!warned) {
        warned = true;
        console.warn('spell vfx: the fire and smoke atlases did not load; flipbook particles fall back to soft discs.');
      }
      return null;
    }
    const fire = shape(fireResult.value);
    const smoke = shape(smokeResult.value);
    loaded = {
      fire,
      smoke,
      grid: SPELL_ATLAS.grid,
      dispose() {
        fire.dispose();
        smoke.dispose();
        if (loaded && loaded.fire === fire) loaded = null;
      },
    };
    return loaded;
  });
  return pending;
}

/** What loadSpellTextures has already produced, or null. No fetch. */
export const spellTextures = () => loaded;

/** For a test: hand the module a pair of textures without touching the network. */
export function setSpellTextures(value) {
  loaded = value || null;
  return loaded;
}
