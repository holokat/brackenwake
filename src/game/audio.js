// Sound. One cue table, one gesture unlock, two gains, and a music rotation
// borrowed from the farm.
//
// Three rules this file exists to keep:
//
//   1. A cue names a file that is really on disk. `SFX_FILES` below is the
//      literal listing of `public/audio/sfx`, and `auditAudio()` runs at module
//      load, so a typo throws on boot instead of going quiet in one biome and
//      being found six weeks later.
//   2. A sound the player caused is heard from where it happened. `play(cue,
//      { at })` attenuates by distance from the listener and refuses to build
//      an element at all past `MAX_DIST`.
//   3. The same swing does not sound identical twice running. Every family
//      walks a reshuffled cycle of its takes and never repeats across the
//      shuffle boundary.
//
// What this is NOT: there is no stereo panning and no reverb. An
// HTMLAudioElement has one volume and nothing else; panning would mean a
// WebAudio graph and a decoded buffer per file, which is a bigger change than
// bringing the sound back. Distance is honest, direction is not modelled.
//
// Nothing in here may throw during play. Audio is a garnish; a missing file, a
// blocked autoplay, a browser that will not seek, all end as a quiet no-op.

// ---------------------------------------------------------------- constants --

export const SFX_DIR = '/audio/sfx/';
export const LIBRARY_DIR = '/audio/library/';
/** The synthesised half of the folder. `tools/synth-sfx.mjs` writes it. */
export const SYNTH_SUBDIR = 'synth/';

/** localStorage blob: `{ music, sfx, musicVol, sfxVol }`. */
export const STORE_KEY = 'brackenwake-audio';

export const SFX_VOLUME = 0.7;        // one-shots sit on top
export const MUSIC_VOLUME = 0.3;      // music sits under everything
export const AMBIENCE_VOLUME = 0.35;  // the bed under the music (0.15 until 2026-09-08, when the user could not hear it at all)

/**
 * Distance model, in metres.
 *
 * Full volume out to `REF_DIST`, which is `interact.REACH`: anything you can
 * actually swing at is at your feet as far as the ear is concerned. From there
 * it falls off as (1 - t)^2 and reaches exactly zero at `MAX_DIST`, chosen at
 * 42 m because the fog closes at 536 m and a chop from half a kilometre away
 * carrying at any volume at all would be a bug, not atmosphere. Past MAX_DIST
 * nothing is built and nothing is played.
 */
export const MAX_DIST = 42;
export const REF_DIST = 6;

/** Music slot lengths, from the farm. A short track loops until its slot ends. */
export const SLOT_MS = { theme: 160_000, calm: 175_000, lively: 175_000 };
/** A track longer than its slot finishes rather than being cut mid-phrase. */
export const MAX_SLOT_MS = 300_000;
/** An sfx inside this window means the player is busy, so the music leans lively. */
export const ACTIVITY_WINDOW_MS = 50_000;
/** Crossfade between tracks. */
export const XFADE_MS = 2600;
/** Crossfade between ambience beds. */
export const AMBIENCE_XFADE_MS = 2000;
/** Point source distance model, in metres. */
export const SOURCE_REF_DIST = 4;
export const SOURCE_MAX_DIST = 22;
/** Music rests between tracks instead of looping without a breath. */
export const MUSIC_GAP_MS = [20_000, 40_000];

// ------------------------------------------------------------- what exists --

/**
 * `ls public/audio/sfx` on 2026-09-04, all 61 of them. Written out rather than
 * globbed because the module has to be able to check itself in node, where
 * there is no bundler and no directory to read. If a file is added, add the row.
 */
export const SFX_FILES = [
  'Done1.opus', 'Done2.opus', 'arrow-hit-1.mp3', 'arrow-hit-2.mp3',
  'arrow-miss-1.mp3', 'arrow-miss-2.mp3', 'arrow-miss-3.mp3',
  'axe-chop-1.mp3', 'boulder-break-1.mp3', 'boulder-break-2.mp3',
  'boulder-break-3.mp3', 'boulder-break-4.mp3', 'bow-draw-1.mp3',
  'bow-draw-2.mp3', 'bow-shot-1.mp3', 'bow-shot-2.mp3', 'bow-shot-3.mp3',
  'build-complete.opus', 'chicken-distress-1.mp3', 'chicken-distress-2.mp3',
  'click.ogg', 'coins.ogg', 'construction-hammer-under-way.opus',
  'construction.opus', 'denied.ogg', 'fish-bite-1.mp3', 'fish-bite-2.mp3',
  'fishing-cast-1.mp3', 'fishing-cast-2.mp3', 'fishing-cast-3.mp3',
  'fishing-cast-4.mp3', 'flip.ogg', 'flutter.ogg', 'handle_coins.mp3',
  'harvest-crops.opus', 'harvest.ogg', 'loot_coin.mp3', 'pickaxe-1.mp3',
  'pickaxe-2.mp3', 'pickaxe-3.mp3', 'pickaxe-4.mp3', 'pickup.ogg',
  'place-object.opus', 'place.ogg', 'plant-seeds.opus', 'plant.ogg',
  'reeling-1.mp3', 'reeling-2.mp3', 'thunder-1.mp3', 'thunder-2.mp3',
  'thunder-3.mp3', 'thunder-4.mp3', 'thunder-5.mp3', 'unlock.ogg',
  'upgrade.ogg', 'water-plants.opus', 'water.ogg', 'wolf-howl-1.mp3',
  'wolf-howl-2.mp3', 'wolf-howl-3.mp3', 'wolf-howl-4.mp3',
];

/**
 * `ls public/audio/sfx/synth`, all 25 of them, written by
 * `node tools/synth-sfx.mjs`. These are not recordings: they are made from
 * oscillators, noise and filters by a script that is deterministic from a seed,
 * because the folder had no spell, no cast, no hit-by-material, no level-up and
 * no boss horn, and the rule here is that a cue never borrows a wrong sound.
 *
 * Every one is 44.1 kHz, 16 bit, mono, under 2 s, peak normalised to -3 dBFS.
 * The recipe for each is written out in the tool beside the code that makes it.
 * `audio.test.mjs` reads the tool's own FILENAMES and fails if this list drifts
 * from what the script writes, so regenerating cannot quietly break a cue.
 */
export const SYNTH_FILES = [
  'synth/aoe_column.wav', 'synth/aoe_ring.wav', 'synth/buff.wav',
  'synth/cast_loop.wav', 'synth/cast_start.wav', 'synth/crit.wav',
  'synth/debuff.wav', 'synth/grandmaster.wav', 'synth/heal.wav',
  'synth/impact_bone.wav', 'synth/impact_flesh.wav', 'synth/impact_metal.wav',
  'synth/leap_land.wav', 'synth/level_boss_phase.wav', 'synth/skill_up.wav',
  'synth/spell_cold.wav', 'synth/spell_dark.wav', 'synth/spell_energy.wav',
  'synth/spell_fire.wav', 'synth/spell_holy.wav', 'synth/spell_physical.wav',
  'synth/spell_poison.wav', 'synth/stat_up.wav', 'synth/swing_heavy.wav',
  'synth/swing_light.wav',
];

/** Everything a cue may name: the recordings and the synthesised set together. */
export const ALL_SFX_FILES = [...SFX_FILES, ...SYNTH_FILES];

/** `ls public/audio/library` on 2026-09-08, all 68 Greenwold library files. */
export const LIBRARY_FILES = [
  'Hearthhome-night-soundtrack.mp3',
  'Hearthhome_Midday-music-track.mp3',
  'The-Standing-Hedge.mp3',
  'amb-bandit-camp.mp3',
  'amb-chalk-hill.mp3',
  'amb-legion-camp.mp3',
  'amb-meadow-day.mp3',
  'amb-meadow-night.mp3',
  'amb-mere-dawn.mp3',
  'amb-mine-inside.mp3',
  'amb-mine-yard.mp3',
  'amb-rain-field.mp3',
  'amb-rain-under-trees.mp3',
  'amb-river-bank.mp3',
  'amb-village-day.mp3',
  'amb-village-night.mp3',
  'amb-water-meadow.mp3',
  'amb-wood-day.mp3',
  'amb-wood-night.mp3',
  'os-badger-huff.mp3',
  'os-badger-huff2.mp3',
  'os-boar-snort.mp3',
  'os-boar-snort2.mp3',
  'os-boar-snort3.mp3',
  'os-cart-pass.mp3',
  'os-cart-pass2.mp3',
  'os-church-bell.mp3',
  'os-crow-flock-lift.mp3',
  'os-crow-flock-lift2.mp3',
  'os-crow-flock-lift3.mp3',
  'os-distant-thunder.mp3',
  'os-distant-thunder2.mp3',
  'os-distant-thunder3.mp3',
  'os-distant-thunder4.mp3',
  'os-door-cottage.mp3',
  'os-door-cottage2.mp3',
  'os-fox-bark.mp3',
  'os-fox-bark2.mp3',
  'os-gate-swing.mp3',
  'os-gate-swing2.mp3',
  'os-gate-swing3.mp3',
  'os-goose-alarm.mp3',
  'os-goose-alarm2.mp3',
  'os-hedge-push.mp3',
  'os-hedge-push2.mp3',
  'os-hedge-push3.mp3',
  'os-heron-croak.mp3',
  'os-heron-croak2.mp3',
  'os-heron-croak3.mp3',
  'os-mist-rise.mp3',
  'os-mist-rise2.mp3',
  'os-mist-rise3.mp3',
  'os-owl-call.mp3',
  'os-owl-call2.mp3',
  'os-owl-call3.mp3',
  'os-owl-call4.mp3',
  'os-splash-wade.mp3',
  'os-splash-wade2.mp3',
  'os-wheat-walk.mp3',
  'os-wheat-walk2.mp3',
  'os-wheat-walk3.mp3',
  'os-wind-gust.mp3',
  'os-wind-gust2.mp3',
  'os-wind-gust3.mp3',
  'os-woodpecker.mp3',
  'src-forge.mp3',
  'src-mill-wheel.mp3',
  'src-tavern-inside.mp3',
];

/**
 * Files that exist and are worthless, with the measurement that says so. A cue
 * pointing at one of these fails the audit: "the file is there" is not the same
 * claim as "the player hears something".
 */
export const DEAD_FILES = {
  'click.ogg': '0.010 s long, peak amplitude 0.000, silence in a wrapper',
};

// --------------------------------------------------------------- the cues ---

/**
 * Every cue the game can fire, and the file behind it.
 *
 * A row is one of three shapes:
 *   { file }                       one file
 *   { family, takes, ext }         `<family>-1..n.<ext>`, walked in a cycle
 *   { file, slices: [[at, dur]] }  one file cut into takes by seek and stop
 *
 * `gain` multiplies the sfx volume, `rate` sets playbackRate. `stand` marks a
 * stand-in: the file is not the sound the cue asks for, it is the nearest thing
 * in the folder, and it says so here so nobody has to rediscover it by ear.
 */
export const CUES = {
  // The only axe recording is a single 4.03 s take holding three strikes at
  // roughly 0.15 s, 1.20 s and 2.35 s (measured off the waveform envelope).
  // Played whole it would run 4 s past a 450 ms swing and layer on itself, so
  // each strike is treated as a take: seek to just before it, stop after it.
  // That is where the "several takes" for chop come from; there is one file.
  chop: {
    file: 'axe-chop-1.mp3',
    slices: [[0.08, 0.55], [1.12, 0.60], [2.26, 0.70]],
    gain: 0.95,
  },
  // STAND-IN. Nothing in the folder is a tree going over; the wishlist asks for
  // one (docs/sfx-wishlist.txt item 2) and it was never made. place-object is a
  // heavy wooden object dropped on soil: right material, right shape, too
  // small, so it is pitched down to 0.7 for weight. Replace it the day a real
  // fall lands.
  chopDown: {
    file: 'place-object.opus', rate: 0.7, gain: 1,
    stand: 'no tree-fall recording exists; this is a wooden thump pitched down',
  },
  // Was a stand-in (a dropped wooden object, pitched down) until synth/leap_land
  // was made for it. A sine falling 90 to 45 Hz for the weight, fourteen grains
  // of lowpassed noise for the grit, one bandpass rattle for the gear. main.js
  // fires it on a fall over 4 m and abilities_runtime on a dash or a leap.
  land: { file: 'synth/leap_land.wav', gain: 0.9 },
  mine: { family: 'pickaxe', takes: 4, ext: 'mp3', gain: 0.85 },
  rockBreak: { family: 'boulder-break', takes: 4, ext: 'mp3', gain: 1 },
  // Ore is the same rock breaking, smaller and brighter. Same four takes, run
  // faster, which is both a different sound and no new asset.
  oreBreak: { family: 'boulder-break', takes: 4, ext: 'mp3', rate: 1.18, gain: 0.9 },
  pickup: { file: 'pickup.ogg', gain: 0.85 },
  denied: { file: 'denied.ogg', gain: 0.7 },
  // Two different coin sounds so paying and being paid are not the same event.
  // coins.ogg is not used: it peaks at 0.039, four times quieter than these,
  // and an element's volume cannot go above 1 to make up the difference.
  buy: { file: 'handle_coins.mp3', gain: 1 },
  sell: { file: 'loot_coin.mp3', gain: 1 },
  // STAND-IN. There is no "going underground". unlock.ogg is short, loud and
  // low (centroid 624 Hz), and at 0.7 it drops to about 440 Hz, which reads as
  // a way opening rather than a menu chime. It is still a UI sound.
  enterCave: {
    file: 'unlock.ogg', rate: 0.7, gain: 0.9,
    stand: 'no descent recording exists; this is the unlock chime pitched down',
  },
  discover: { file: 'upgrade.ogg', gain: 0.8 },
  // An arrow striking an animal. Two takes.
  beastHit: { family: 'arrow-hit', takes: 2, ext: 'mp3', gain: 0.9 },
  // The rest of the bow, free: the files exist and the bow is on sale for 120
  // coins in every market, so the day it shoots it will not be silent.
  beastMiss: { family: 'arrow-miss', takes: 3, ext: 'mp3', gain: 0.8 },
  bowDraw: { family: 'bow-draw', takes: 2, ext: 'mp3', gain: 0.8 },
  bowShot: { family: 'bow-shot', takes: 3, ext: 'mp3', gain: 0.9 },
  // fauna.js already puts wolves in the world at night.
  wolfHowl: { family: 'wolf-howl', takes: 4, ext: 'mp3', gain: 0.7 },

  // ------------------------------------------------------------ the synth set
  //
  // Everything below is a file `tools/synth-sfx.mjs` made, and every one of
  // these cues is named for the file behind it, so `CUES.spell_fire` is
  // `synth/spell_fire.wav` and there is nothing to look up. The recordings
  // above keep their camelCase names; nothing renames, because a cue name is a
  // string in eight other files.
  //
  // The gains are not decoration. Each of these peaks at exactly -3 dBFS, so
  // loudness between them is loudness over the whole file, and a whoosh that
  // fires every 450 ms has to sit well under a boss horn that fires twice a
  // fight. Measured RMS is in the comment where it explains a gain.

  // The cast. `cast_start` is the hand going up, `cast_loop` holds under the
  // bar until the spell lands or the cast breaks; effects.js sets loop = true
  // on it and pauses it in stopCast.
  cast_start: { file: 'synth/cast_start.wav', gain: 0.7 },
  cast_loop: { file: 'synth/cast_loop.wav', gain: 0.4 },

  // One per damage type in 02-COMBAT.md, plus holy, which abilities.js records
  // as a damage type. effects.js picks between them from the spell's colour.
  spell_fire: { file: 'synth/spell_fire.wav', gain: 0.9 },
  spell_cold: { file: 'synth/spell_cold.wav', gain: 0.85 },
  // rms 0.053, the quietest of the set, because a crack of static is four
  // milliseconds of peak and half a second of nothing much. Hence gain 1.
  spell_energy: { file: 'synth/spell_energy.wav', gain: 1 },
  spell_poison: { file: 'synth/spell_poison.wav', gain: 0.85 },
  spell_holy: { file: 'synth/spell_holy.wav', gain: 0.85 },
  spell_dark: { file: 'synth/spell_dark.wav', gain: 0.85 },
  spell_physical: { file: 'synth/spell_physical.wav', gain: 0.9 },

  // The three ground shapes. A ring goes outward, a column stands and waits.
  aoe_ring: { file: 'synth/aoe_ring.wav', gain: 0.8 },
  aoe_column: { file: 'synth/aoe_column.wav', gain: 0.75 },

  // What a spell does to somebody who is not being damaged.
  heal: { file: 'synth/heal.wav', gain: 0.8 },
  buff: { file: 'synth/buff.wav', gain: 0.7 },
  debuff: { file: 'synth/debuff.wav', gain: 0.7 },

  // A hit, by what it hit. effects.flinch picks from the struck actor: bone for
  // skeletons and their relatives, metal for constructs and anyone in mail or
  // plate, flesh for everything else.
  impact_flesh: { file: 'synth/impact_flesh.wav', gain: 0.9 },
  impact_metal: { file: 'synth/impact_metal.wav', gain: 0.85 },
  // rms 0.068: a crack is peaky by nature. Louder gain, same loudness.
  impact_bone: { file: 'synth/impact_bone.wav', gain: 1 },

  // A weapon through air, by how many hands are on it. These fire on every
  // swing of every fight, so they are the quietest rows in the table.
  swing_light: { file: 'synth/swing_light.wav', gain: 0.5 },
  swing_heavy: { file: 'synth/swing_heavy.wav', gain: 0.55 },
  crit: { file: 'synth/crit.wav', gain: 0.95 },

  // Getting better. progression.js fires the first two on a round ten and the
  // third at 100, which most characters will hear a handful of times ever.
  skill_up: { file: 'synth/skill_up.wav', gain: 0.7 },
  stat_up: { file: 'synth/stat_up.wav', gain: 0.75 },
  grandmaster: { file: 'synth/grandmaster.wav', gain: 0.9 },

  // A boss changing phase. Nothing fires this yet: G3 owns bosses and the hook
  // is theirs to call. The row is here so that the day it is wanted it is a
  // one-line change and not a week of waiting for a sound.
  level_boss_phase: { file: 'synth/level_boss_phase.wav', gain: 1 },
};

/**
 * Cues that were asked for and are deliberately absent, with the reason. An
 * empty row in the table would look like an oversight; this is the record that
 * it is not.
 */
export const NO_FILE_FOR = {
  hurt: 'answered, and left out on purpose. There is no one `hurt` sound '
      + 'because what a blow sounds like is a fact about what was hit: '
      + 'effects.flinch picks impact_flesh, impact_bone or impact_metal from '
      + 'the struck actor, so a single row here would be the lie it used to be.',
  step: 'there are no footsteps at all. docs/sfx-wishlist.txt rules them out '
      + 'on purpose under WHAT NOT TO MAKE.',
};

export const LIBRARY_POOLS = {
  owl: ['os-owl-call.mp3', 'os-owl-call2.mp3', 'os-owl-call3.mp3', 'os-owl-call4.mp3'],
  fox: ['os-fox-bark.mp3', 'os-fox-bark2.mp3'],
  woodpecker: ['os-woodpecker.mp3'],
  crowFlock: ['os-crow-flock-lift.mp3', 'os-crow-flock-lift2.mp3', 'os-crow-flock-lift3.mp3'],
  windGust: ['os-wind-gust.mp3', 'os-wind-gust2.mp3', 'os-wind-gust3.mp3'],
  distantThunder: ['os-distant-thunder.mp3', 'os-distant-thunder2.mp3', 'os-distant-thunder3.mp3', 'os-distant-thunder4.mp3'],
  cartPass: ['os-cart-pass.mp3', 'os-cart-pass2.mp3'],
  churchBell: ['os-church-bell.mp3'],
  gateSwing: ['os-gate-swing.mp3', 'os-gate-swing2.mp3', 'os-gate-swing3.mp3'],
  doorCottage: ['os-door-cottage.mp3', 'os-door-cottage2.mp3'],
  boar: ['os-boar-snort.mp3', 'os-boar-snort2.mp3', 'os-boar-snort3.mp3'],
  badger: ['os-badger-huff.mp3', 'os-badger-huff2.mp3'],
  goose: ['os-goose-alarm.mp3', 'os-goose-alarm2.mp3'],
  hedgePush: ['os-hedge-push.mp3', 'os-hedge-push2.mp3', 'os-hedge-push3.mp3'],
  wheatWalk: ['os-wheat-walk.mp3', 'os-wheat-walk2.mp3', 'os-wheat-walk3.mp3'],
  splashWade: ['os-splash-wade.mp3', 'os-splash-wade2.mp3'],
  mistRise: ['os-mist-rise.mp3', 'os-mist-rise2.mp3', 'os-mist-rise3.mp3'],
  heron: ['os-heron-croak.mp3', 'os-heron-croak2.mp3', 'os-heron-croak3.mp3'],
};

export function auditLibrary(pools = LIBRARY_POOLS, files = LIBRARY_FILES) {
  const have = new Set(files);
  const bad = [];
  for (const [name, list] of Object.entries(pools || {})) {
    if (!Array.isArray(list) || !list.length) { bad.push(`${name}: no files`); continue; }
    for (const f of list) if (!have.has(f)) bad.push(`${name}: ${f} is not in public/audio/library`);
  }
  for (const f of Object.values(MUSIC_KITS).flat()) if (!have.has(f.replace(LIBRARY_DIR, ''))) bad.push(`music: ${f} is not in public/audio/library`);
  for (const url of [
    bed('amb-rain-under-trees'), bed('amb-rain-field'), bed('amb-village-night'), bed('amb-village-day'),
    bed('amb-mine-inside'), bed('amb-mine-yard'), bed('amb-bandit-camp'), bed('amb-legion-camp'),
    bed('amb-wood-night'), bed('amb-wood-day'), bed('amb-mere-dawn'), bed('amb-river-bank'),
    bed('amb-water-meadow'), bed('amb-chalk-hill'), bed('amb-meadow-night'), bed('amb-meadow-day'),
  ]) if (!have.has(url.replace(LIBRARY_DIR, ''))) bad.push(`ambience: ${url} is not in public/audio/library`);
  for (const f of ['src-forge.mp3', 'src-mill-wheel.mp3', 'src-tavern-inside.mp3']) if (!have.has(f)) bad.push(`source: ${f} is not in public/audio/library`);
  if (bad.length) throw new Error(`audio library points at files that will not play:\n  ${bad.join('\n  ')}`);
  return true;
}

/** The cues running on a stand-in, derived so the list cannot drift. */
export const STAND_INS = Object.fromEntries(
  Object.entries(CUES).filter(([, c]) => c.stand).map(([k, c]) => [k, c.stand]),
);

// ------------------------------------------------------------ the resolver --

/** How many takes a cue has. One file is one take. */
export function takesOf(cue) {
  if (!cue) return 0;
  if (cue.takes) return cue.takes;
  if (cue.slices) return cue.slices.length;
  return 1;
}

/** The bare filename behind take `i` of a cue. */
export function fileFor(cue, i = 0) {
  if (!cue) return null;
  if (cue.family) return `${cue.family}-${i + 1}.${cue.ext || 'mp3'}`;
  return cue.file || null;
}

/** The URL vite will serve for take `i` of a cue. */
export function urlFor(cue, i = 0) {
  const f = fileFor(cue, i);
  return f ? SFX_DIR + f : null;
}

/**
 * Fail loudly if any cue names a file that is not on disk, or one that is on
 * disk and silent. Called at module load below, so a bad row cannot ship.
 *
 * @param {object} cues  defaults to CUES; a test passes its own table
 * @param {string[]} files defaults to SFX_FILES
 * @returns {true} on success
 * @throws {Error} listing every offending cue, not just the first
 */
export function auditAudio(cues = CUES, files = ALL_SFX_FILES) {
  const have = new Set(files);
  const bad = [];
  for (const [name, cue] of Object.entries(cues || {})) {
    const n = takesOf(cue);
    if (!n) { bad.push(`${name}: no file and no family`); continue; }
    for (let i = 0; i < n; i++) {
      const f = fileFor(cue, i);
      if (!f) bad.push(`${name} take ${i + 1}: names nothing`);
      else if (!have.has(f)) bad.push(`${name} take ${i + 1}: ${f} is not in public/audio/sfx`);
      else if (DEAD_FILES[f]) bad.push(`${name} take ${i + 1}: ${f} is silent (${DEAD_FILES[f]})`);
    }
    if (cue.slices) {
      for (const s of cue.slices) {
        if (!Array.isArray(s) || !(s[0] >= 0) || !(s[1] > 0)) bad.push(`${name}: a slice is not [at, dur]`);
      }
    }
  }
  if (bad.length) throw new Error(`audio cues point at files that will not play:\n  ${bad.join('\n  ')}`);
  return true;
}

// This is the whole point of the audit. Do not move it into createAudio: a cue
// nobody fires must still fail the build.
auditAudio();

// ------------------------------------------------------------ the distance --

/**
 * How loud a sound made `d` metres away is, as a multiplier.
 * 1 at the listener and out to `ref`, then (1 - t)^2 down to exactly 0 at
 * `max`, and 0 for everything past it. Never rises with distance.
 */
export function attenuation(d, max = MAX_DIST, ref = REF_DIST) {
  if (!(d > 0)) return 1;             // 0, NaN and negatives are "at the listener"
  if (d >= max) return 0;
  if (d <= ref) return 1;
  const t = (d - ref) / (max - ref);  // 0 at ref, 1 at max
  return (1 - t) * (1 - t);
}

// ------------------------------------------------------------ the rotation --

/**
 * Walks 1..n in a reshuffled cycle: every take is used once per pass, the order
 * changes each pass, and the first of a new pass is never the last of the old
 * one. Random alone repeats often enough to sound like a bug; a fixed order
 * sounds like a loop.
 *
 * @returns {{ next: () => number }} 0-based index of the next take
 */
export function createRotation(n, random = Math.random) {
  const count = Math.max(1, Math.floor(n) || 1);
  let queue = [];
  let last = -1;
  return {
    next() {
      if (count === 1) { last = 0; return 0; }
      if (!queue.length) {
        queue = Array.from({ length: count }, (_, i) => i);
        for (let i = queue.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [queue[i], queue[j]] = [queue[j], queue[i]];
        }
        if (queue[0] === last && queue.length > 1) [queue[0], queue[1]] = [queue[1], queue[0]];
      }
      last = queue.shift();
      return last;
    },
    get last() { return last; },
  };
}

// --------------------------------------------------------------- the music --

export const MUSIC_KITS = {
  settlementDay: [`${LIBRARY_DIR}Hearthhome_Midday-music-track.mp3`],
  settlementNight: [`${LIBRARY_DIR}Hearthhome-night-soundtrack.mp3`],
  openCountry: [`${LIBRARY_DIR}The-Standing-Hedge.mp3`],
  // The making of a character has its own theme (the user, 2026-09-08). It
  // plays once BEGIN is pressed, which is the gesture that unlocks audio.
  creation: [`${LIBRARY_DIR}Hearthhome_Midday-music-track.mp3`],
};

export function musicFor(context = {}) {
  if (context.screen === 'creation') return 'creation';
  if (context.settlement) return context.night ? 'settlementNight' : 'settlementDay';
  return 'openCountry';
}

/** Kept as a compatibility shim for older call sites while the sound system owns music context. */
export function kitFor() {
  return MUSIC_KITS.openCountry;
}

const bed = (name) => `${LIBRARY_DIR}${name}.mp3`;

export function bedFor(context = {}) {
  if (context.inDungeon) return bed('amb-mine-inside');
  if (context.raining) return context.treeCover ? bed('amb-rain-under-trees') : bed('amb-rain-field');
  if (context.settlement) return context.night ? bed('amb-village-night') : bed('amb-village-day');
  if (context.nearMine) return bed('amb-mine-yard');
  if (context.nearBanditCamp) return bed('amb-bandit-camp');
  if (context.nearLegionCamp) return bed('amb-legion-camp');
  if (context.treeCover) return context.night ? bed('amb-wood-night') : bed('amb-wood-day');
  if (context.nearStillWater && context.dawn) return bed('amb-mere-dawn');
  if (context.nearRiver) return bed('amb-river-bank');
  if (context.nearWaterMeadow) return bed('amb-water-meadow');
  if (context.highChalk) return bed('amb-chalk-hill');
  return context.night ? bed('amb-meadow-night') : bed('amb-meadow-day');
}

auditLibrary();

// ---------------------------------------------------------------- the rest --

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function defaultStorage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function defaultElement(url) {
  // eslint-disable-next-line no-undef
  const a = new Audio(url);
  a.preload = 'auto';
  return a;
}

/**
 * @param {object} [opts]
 * @param {(url: string) => object} [opts.makeElement] element factory. The
 *   default is `new Audio(url)`. node has no DOM, so every test hands in a fake
 *   that records what was built, what its volume was and whether it played.
 * @param {Storage|null} [opts.storage] where the mute settings live
 * @param {() => number} [opts.now] the clock, for the music rotation
 * @param {(fn: Function, ms: number) => any} [opts.schedule] one-shot timer,
 *   used to stop a sliced take. Default setTimeout.
 * @param {number} [opts.fadeMs] crossfade length; 0 swaps instantly
 * @param {boolean} [opts.listen] attach the gesture listeners (default true
 *   when there is a window)
 */
export function createAudio(opts = {}) {
  const make = opts.makeElement || defaultElement;
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now || (() => Date.now());
  const schedule = opts.schedule || ((fn, ms) => {
    if (typeof setTimeout !== 'function') return null;
    const t = setTimeout(fn, ms);
    t?.unref?.();            // a node test must not be held open by a stop timer
    return t;
  });
  const fadeMs = opts.fadeMs === undefined ? XFADE_MS : opts.fadeMs;
  const random = opts.random || Math.random;

  // ---- settings ----------------------------------------------------------
  let musicOn = true, sfxOn = true;
  let musicVol = MUSIC_VOLUME, sfxVol = SFX_VOLUME;
  try {
    const raw = storage?.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.music === 'boolean') musicOn = s.music;
      if (typeof s.sfx === 'boolean') sfxOn = s.sfx;
      if (Number.isFinite(s.musicVol)) musicVol = clamp01(s.musicVol);
      if (Number.isFinite(s.sfxVol)) sfxVol = clamp01(s.sfxVol);
    }
  } catch { /* a corrupt blob is a default blob */ }

  function persist() {
    try {
      storage?.setItem(STORE_KEY, JSON.stringify({ music: musicOn, sfx: sfxOn, musicVol, sfxVol }));
      return true;
    } catch { return false; }
  }

  // ---- state -------------------------------------------------------------
  let unlocked = false;
  let listener = null;             // { x, z }, null until setListener is called
  let warnedNoListener = false;
  let lastActivity = -Infinity;    // the "player is busy" signal for the music
  const rotations = new Map();     // family or cue name -> rotation
  const live = new Set();          // elements still playing, so dispose can stop them
  const fades = new Set();

  // ---- helpers -----------------------------------------------------------
  function rotationFor(name, count) {
    let r = rotations.get(name);
    if (!r) { r = createRotation(count, random); rotations.set(name, r); }
    return r;
  }

  function build(url) {
    try {
      const el = make(url);
      if (!el) return null;
      live.add(el);
      el.addEventListener?.('ended', () => live.delete(el), { once: true });
      el.addEventListener?.('error', () => live.delete(el), { once: true });
      return el;
    } catch { return null; }
  }

  function start(el) {
    try { const p = el.play?.(); p?.catch?.(() => {}); } catch { /* garnish */ }
  }

  function fadeTo(el, target, ms) {
    if (!el) return;
    if (!(ms > 0) || typeof setInterval !== 'function') { try { el.volume = clamp01(target); } catch {} return; }
    const from = el.volume ?? 0;
    const t0 = now();
    const timer = setInterval(() => {
      try {
        const t = Math.min(1, (now() - t0) / ms);
        el.volume = clamp01(from + (target - from) * t);
        if (t >= 1) { clearInterval(timer); fades.delete(timer); }
      } catch { clearInterval(timer); fades.delete(timer); }
    }, 50);
    timer?.unref?.();
    fades.add(timer);
  }

  // ---- one-shots ---------------------------------------------------------

  /**
   * Fire a cue.
   *
   * @param {string} name a key of CUES
   * @param {object} [o]
   * @param {number} [o.gain] extra multiplier on top of the cue's own gain
   * @param {number} [o.rate] overrides the cue's playbackRate
   * @param {{x:number,z:number}} [o.at] where in the world it happened. With a
   *   listener set, the volume falls off with distance and past MAX_DIST
   *   nothing is built at all. With no listener set it plays unattenuated and
   *   says so once on the console, because a world that has gone silent is
   *   harder to notice than a world that is too loud.
   * @param {number} [o.delay] ms to wait before firing. A felled tree takes
   *   1500 ms to go over (`DUR` in farm/tree_edit.js), so the thud has to wait
   *   for the ground or it lands a second and a half early. Distance is
   *   measured when the sound fires, not when it was asked for.
   * @returns {object|null} the element, or null when nothing was played. A
   *   delayed call always returns null: there is no element yet.
   */
  function play(name, o = {}) {
    const cue = CUES[name];
    if (!cue) return null;
    if (!unlocked) return null;
    if (o.delay > 0) {
      const rest = { ...o, delay: 0 };
      schedule(() => { try { play(name, rest); } catch { /* garnish */ } }, o.delay);
      return null;
    }

    // Distance first: a sound out of earshot should not even build an element.
    let att = 1;
    if (o.at) {
      if (listener) {
        att = attenuation(Math.hypot((o.at.x ?? 0) - listener.x, (o.at.z ?? 0) - listener.z));
        if (att <= 0) { lastActivity = now(); return null; }
      } else if (!warnedNoListener) {
        warnedNoListener = true;
        // eslint-disable-next-line no-console
        console?.warn?.('audio: setListener(x, z) has never been called, so positioned sounds are not attenuated');
      }
    }

    // The activity signal is what steers the music rotation, and it is set for
    // a cue the player caused whether or not it is audible or muted.
    lastActivity = now();
    if (!sfxOn) return null;

    const i = takesOf(cue) > 1 ? rotationFor(cue.family || name, takesOf(cue)).next() : 0;
    const url = urlFor(cue, i);
    if (!url) return null;
    const el = build(url);
    if (!el) return null;

    try { el.volume = clamp01(sfxVol * (cue.gain ?? 1) * (o.gain ?? 1) * att); } catch {}
    const rate = o.rate ?? cue.rate;
    if (rate) { try { el.playbackRate = rate; } catch {} }

    const slice = cue.slices?.[i];
    if (slice) {
      const [at, dur] = slice;
      const seek = () => { try { el.currentTime = at; } catch {} };
      // A cached file is ready the moment it is built and can be seeked before
      // it plays; a cold one has to wait for its metadata, and the first
      // fraction of a second plays from the top before the seek lands.
      if ((el.readyState ?? 0) >= 1) seek();
      else el.addEventListener?.('loadedmetadata', seek, { once: true });
      schedule(() => { try { el.pause(); } catch {} live.delete(el); }, Math.round((dur / (rate || 1)) * 1000));
    }
    start(el);
    return el;
  }

  // ---- music, ambience and library one-shots -----------------------------
  let want = false;                // music.start() was called
  let trackEl = null, ambienceEl = null;
  let musicKey = null, trackUrl = null, ambienceUrl = null;
  let musicContext = { settlement: false, night: false };
  let rotTimer = null, gapTimer = null;
  const stats = { shots: {}, recent: [] };
  const sourceLoops = new Map();

  function rememberShot(name, url, t = now()) {
    stats.shots[name] = (stats.shots[name] || 0) + 1;
    stats.recent.push({ name, url, at: t });
    if (stats.recent.length > 80) stats.recent.shift();
  }

  function swapLoop(old, url, vol, loop = true) {
    if (old) {
      fadeTo(old, 0, fadeMs);
      schedule(() => { try { old.pause(); } catch {} live.delete(old); }, fadeMs || 0);
    }
    const el = build(url);
    if (!el) return null;
    try { el.loop = loop; } catch {}
    if (!musicOn) { try { el.volume = clamp01(vol); } catch {} return el; }
    try { el.volume = fadeMs > 0 ? 0 : clamp01(vol); } catch {}
    start(el);
    if (fadeMs > 0) fadeTo(el, vol, fadeMs);
    return el;
  }

  function scheduleMusicGap() {
    if (!want || !unlocked || !musicOn) return;
    const gap = MUSIC_GAP_MS[0] + random() * (MUSIC_GAP_MS[1] - MUSIC_GAP_MS[0]);
    if (gapTimer) { try { clearTimeout(gapTimer); } catch {} }
    gapTimer = schedule(() => { gapTimer = null; try { playTrack(musicKey); } catch {} }, Math.round(gap));
  }

  function playTrack(key = musicFor(musicContext)) {
    const kit = MUSIC_KITS[key] || MUSIC_KITS.openCountry;
    const url = kit[0] || null;
    if (!url) return null;
    if (key === musicKey && url === trackUrl && trackEl && !trackEl.paused) return trackEl;
    musicKey = key;
    trackUrl = url;
    trackEl = swapLoop(trackEl, url, musicVol, false);
    trackEl?.addEventListener?.('ended', scheduleMusicGap);
    return trackEl;
  }

  function setAmbience(url, ms = AMBIENCE_XFADE_MS) {
    if (!url) return null;
    if (ambienceEl && ambienceUrl === url) return ambienceEl;
    const localFade = ms;
    const old = ambienceEl;
    if (old) {
      fadeTo(old, 0, localFade);
      schedule(() => { try { old.pause(); } catch {} live.delete(old); }, localFade || 0);
    }
    ambienceUrl = url;
    ambienceEl = build(url);
    if (!ambienceEl) return null;
    try { ambienceEl.loop = true; ambienceEl.url = url; ambienceEl.volume = musicOn && unlocked ? 0 : AMBIENCE_VOLUME; } catch {}
    if (musicOn && unlocked && want) {
      start(ambienceEl);
      fadeTo(ambienceEl, AMBIENCE_VOLUME, localFade);
    }
    return ambienceEl;
  }

  function tick(t = now()) {
    void t;
    if (!want || !unlocked || !musicOn) return null;
    const key = musicFor(musicContext);
    if (key !== musicKey) return playTrack(key);
    return null;
  }

  function ensureRotation() {
    if (rotTimer || typeof setInterval !== 'function') return;
    rotTimer = setInterval(() => { try { tick(); } catch {} }, 1000);
    rotTimer?.unref?.();
  }

  const music = {
    /** Ask for music. Before the gesture unlock this only records the wish. */
    start() {
      want = true;
      if (!unlocked) return false;
      playTrack(musicFor(musicContext));
      if (ambienceUrl) setAmbience(ambienceUrl, 0);
      ensureRotation();
      return true;
    },
    stop() {
      want = false;
      for (const el of [trackEl, ambienceEl]) { try { el?.pause(); } catch {} }
      if (gapTimer) { try { clearTimeout(gapTimer); } catch {} gapTimer = null; }
      if (rotTimer) { clearInterval(rotTimer); rotTimer = null; }
      return true;
    },
    /**
     * Point the music at a biome. A biome that shares a kit with the one you
     * left changes nothing, so walking meadow to meadow does not restart the
     * track and crossing beach to ocean does not either.
     * @returns {boolean} whether the kit actually changed
     */
    setBiome(id) {
      void id;
      return this.setContext({ settlement: false });
    },
    setContext(next = {}) {
      const prev = musicFor(musicContext);
      musicContext = { ...musicContext, ...next };
      const key = musicFor(musicContext);
      if (key === prev) return false;
      if (want && unlocked) { playTrack(key); ensureRotation(); }
      return true;
    },
    setAmbience(url) {
      return setAmbience(url);
    },
    tick,
    get kit() { return MUSIC_KITS[musicFor(musicContext)]; },
    get track() { return trackUrl; },
    get kind() { return musicKey; },
    get playing() { return want && unlocked && musicOn && !!trackEl; },
    get el() { return trackEl; },
    get ambience() { return ambienceEl; },
    get ambienceUrl() { return ambienceUrl; },
    get context() { return musicContext; },
  };

  function playLibrary(name, o = {}) {
    const pool = LIBRARY_POOLS[name];
    if (!pool || !unlocked) return null;
    if (o.delay > 0) {
      const rest = { ...o, delay: 0 };
      schedule(() => { try { playLibrary(name, rest); } catch {} }, o.delay);
      return null;
    }
    let att = 1;
    if (o.at && listener) {
      att = attenuation(Math.hypot((o.at.x ?? 0) - listener.x, (o.at.z ?? 0) - listener.z));
      if (att <= 0) return null;
    }
    if (!sfxOn) return null;
    const i = pool.length > 1 ? rotationFor(`library:${name}`, pool.length).next() : 0;
    const url = LIBRARY_DIR + pool[i];
    const el = build(url);
    if (!el) return null;
    try { el.volume = clamp01(sfxVol * (o.gain ?? 1) * att); } catch {}
    if (o.rate) { try { el.playbackRate = o.rate; } catch {} }
    rememberShot(name, url);
    start(el);
    return el;
  }

  function sourceLoop(id, url) {
    if (!sourceLoops.has(id)) sourceLoops.set(id, { id, url, el: null, volume: 0, inRange: false });
    return sourceLoops.get(id);
  }

  function updateSource(id, url, pos) {
    const src = sourceLoop(id, url);
    const d = pos && listener ? Math.hypot((pos.x ?? 0) - listener.x, (pos.z ?? 0) - listener.z) : Infinity;
    const att = attenuation(d, SOURCE_MAX_DIST, SOURCE_REF_DIST);
    src.volume = clamp01(AMBIENCE_VOLUME * att);
    src.inRange = att > 0;
    if (!src.inRange || !musicOn || !unlocked || !want) {
      try { src.el?.pause?.(); } catch {}
      return src;
    }
    if (!src.el) {
      src.el = build(url);
      if (src.el) { try { src.el.loop = true; } catch {} }
    }
    if (src.el) {
      try { src.el.volume = src.volume; } catch {}
      if (src.el.paused) start(src.el);
    }
    return src;
  }

  // ---- the gesture -------------------------------------------------------
  function unlock() {
    if (unlocked) return false;
    unlocked = true;
    if (want) { playTrack(musicFor(musicContext)); if (ambienceUrl) setAmbience(ambienceUrl, 0); ensureRotation(); }
    return true;
  }

  let detach = null;
  const wantsListeners = opts.listen === undefined
    ? (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
    : opts.listen;
  if (wantsListeners && typeof window !== 'undefined') {
    const go = () => { unlock(); detach?.(); };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    for (const e of events) window.addEventListener(e, go, { once: true, passive: true });
    detach = () => { for (const e of events) window.removeEventListener(e, go); detach = null; };
  }

  // ---- mutes -------------------------------------------------------------
  function applyMusicMute() {
    for (const el of [trackEl, ambienceEl]) {
      if (!el) continue;
      try {
        if (!musicOn) el.pause();
        else if (unlocked && want) start(el);
      } catch {}
    }
  }

  return {
    play,
    /** Where the ear is. Call it every frame with the player's position. */
    setListener(x, z) { listener = { x, z }; return listener; },
    get listener() { return listener; },
    music,
    unlock,
    get unlocked() { return unlocked; },

    /** @returns {boolean} the new state: true means music is ON */
    toggleMusic() {
      musicOn = !musicOn;
      persist();
      if (musicOn && want && unlocked && !trackEl) { playTrack(musicFor(musicContext)); if (ambienceUrl) setAmbience(ambienceUrl, 0); }
      else applyMusicMute();
      return musicOn;
    },
    /** @returns {boolean} the new state: true means sfx are ON */
    toggleSfx() { sfxOn = !sfxOn; persist(); return sfxOn; },
    get musicOn() { return musicOn; },
    get sfxOn() { return sfxOn; },
    setMusicVolume(v) { musicVol = clamp01(v); persist(); try { if (trackEl && musicOn) trackEl.volume = musicVol; } catch {} return musicVol; },
    setSfxVolume(v) { sfxVol = clamp01(v); persist(); return sfxVol; },
    get musicVolume() { return musicVol; },
    get sfxVolume() { return sfxVol; },
    playLibrary,
    source: { update: updateSource, loops: sourceLoops },
    stats,

    /** For the HUD and the report: which cues are running on a stand-in. */
    standIns: STAND_INS,
    noFileFor: NO_FILE_FOR,
    audit: () => auditAudio() && auditLibrary(),

    dispose() {
      detach?.();
      music.stop();
      for (const t of fades) clearInterval(t);
      fades.clear();
      for (const el of live) { try { el.pause?.(); } catch {} }
      live.clear();
    },
  };
}
