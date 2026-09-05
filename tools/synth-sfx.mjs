#!/usr/bin/env node
// Sounds the folder does not have, made rather than borrowed.
//
//   node tools/synth-sfx.mjs              writes public/audio/sfx/synth/
//   node tools/synth-sfx.mjs --list       prints the recipes and their lengths
//   node tools/synth-sfx.mjs <dir>        writes somewhere else
//
// WHY THIS EXISTS
//
// public/audio/sfx has an axe, a pickaxe, a bow, coins and some weather. It has
// no spell, no cast, no hit by material, no level-up and no boss horn, and the
// rule in this project is that a cue never borrows a wrong recording: a sound
// that is not the thing it claims to be is worse than silence, because silence
// is at least honest. audio.js keeps a STAND_INS list for the three places we
// broke that rule and every one of them is a debt.
//
// So the missing sounds are synthesised here, from oscillators, noise,
// envelopes, filters and a small Schroeder reverb. No samples, no library, no
// network: `node tools/synth-sfx.mjs` and a Mac with no audio tools installed
// produces the same bytes as a Linux box with all of them.
//
// WHAT EVERY FILE IS
//
//   44100 Hz, 16 bit, mono, PCM WAV, under 2 seconds
//   peak normalised to -3 dBFS, so the game's own gains do the mixing
//   DC blocked at 20 Hz, so no file pushes a speaker cone off centre
//   deterministic: every random number comes from mulberry32 seeded with
//   BASE_SEED and the sound's own name, so two runs are byte-identical and a
//   regenerated file is a git no-op
//
// Each recipe carries its `recipe` line: what it is made of, in words, so the
// next person does not have to work it out by ear.
//
// WHAT IS NOT HERE, ON PURPOSE
//
//   bow release. bow-shot-1..3.mp3 are real recordings of a real bow and the
//   `bowShot` cue already uses them. Synthesising a worse one would be work
//   spent making the game sound cheaper.
//   footsteps. docs/sfx-wishlist.txt rules them out under WHAT NOT TO MAKE.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ------------------------------------------------------------------ format --

export const SR = 44100;
export const BITS = 16;
export const CHANNELS = 1;
/** Every file is normalised to this peak. -3 dBFS leaves headroom for two overlapping. */
export const TARGET_DBFS = -3;
export const PEAK = Math.pow(10, TARGET_DBFS / 20);   // 0.7079457843841379
/** Nothing may be longer than this. A cue that outlives its animation layers on itself. */
export const MAX_SECONDS = 2;
/** Change this and every file changes. Do not change it. */
export const BASE_SEED = 0x42524b57;                  // "BRKW"

const TAU = Math.PI * 2;
const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = resolve(HERE, '..', 'public', 'audio', 'sfx', 'synth');

// ------------------------------------------------------------- the toolkit --

/** A small fast PRNG. Same seed, same stream, on every machine. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the name, so each sound gets its own stream out of one seed. */
export function hashName(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const buf = (n) => new Float64Array(n);
const nsec = (s) => Math.max(1, Math.round(s * SR));
const asFn = (v) => (typeof v === 'function' ? v : () => v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** dst += src * gain, optionally shaped by an envelope of the same length. */
function add(dst, src, gain = 1, envArr = null) {
  const n = Math.min(dst.length, src.length);
  for (let i = 0; i < n; i++) dst[i] += src[i] * gain * (envArr ? envArr[i] : 1);
  return dst;
}

/** dst *= env, in place. */
function shape(dst, envArr) {
  for (let i = 0; i < dst.length; i++) dst[i] *= envArr[i];
  return dst;
}

/** dst[start..] += src * gain. Anything past the end is dropped. */
function at(dst, src, startSample, gain = 1) {
  const s = Math.max(0, Math.round(startSample));
  for (let i = 0; i + s < dst.length && i < src.length; i++) dst[i + s] += src[i] * gain;
  return dst;
}

/**
 * An oscillator. `freq` and `amp` may be numbers or functions of t in seconds,
 * so a sweep is written as a sweep rather than assembled from segments.
 *
 * `saw` and `square` are the naive shapes and alias above a few kHz. Every use
 * of them here is a low drone that is lowpassed straight afterwards, where the
 * folded partials read as grit and are wanted.
 */
export function tone(n, freq, amp = 1, kind = 'sine', phase = 0) {
  const f = asFn(freq), a = asFn(amp);
  const out = buf(n);
  let ph = phase;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * f(t)) / SR;
    let v;
    if (kind === 'sine') v = Math.sin(ph);
    else if (kind === 'tri') { const u = ((ph / TAU) % 1 + 1) % 1; v = 4 * Math.abs(u - 0.5) - 1; }
    else if (kind === 'saw') { const u = ((ph / TAU) % 1 + 1) % 1; v = 2 * u - 1; }
    else v = Math.sin(ph) >= 0 ? 1 : -1;
    out[i] = v * a(t);
  }
  return out;
}

/** White noise from the sound's own stream. */
export function noise(n, rng) {
  const o = buf(n);
  for (let i = 0; i < n; i++) o[i] = rng() * 2 - 1;
  return o;
}

/** Linear attack then exponential decay with time constant `tau` seconds. */
export function envAD(n, attackS, tau) {
  const o = buf(n);
  const na = Math.max(1, Math.round(attackS * SR));
  for (let i = 0; i < n; i++) {
    if (i < na) o[i] = i / na;
    else o[i] = Math.exp(-((i - na) / SR) / tau);
  }
  return o;
}

/** A swell: up to 1 at `peakAt` of the length, down to 0 at the end. */
export function envBell(n, peakAt = 0.3, curve = 1) {
  const o = buf(n);
  const p = clamp(peakAt, 0.01, 0.99);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1 || 1);
    const k = u < p ? u / p : 1 - (u - p) / (1 - p);
    o[i] = Math.pow(clamp(k, 0, 1), curve);
  }
  return o;
}

/** Attack, hold at 1, then release. For anything held: a horn, a drone. */
export function envAHR(n, attackS, releaseS) {
  const o = buf(n);
  const na = Math.max(1, Math.round(attackS * SR));
  const nr = Math.max(1, Math.round(releaseS * SR));
  for (let i = 0; i < n; i++) {
    const rise = i < na ? i / na : 1;
    const left = n - 1 - i;
    const fall = left < nr ? left / nr : 1;
    o[i] = rise * fall;
  }
  return o;
}

/**
 * RBJ biquad, `lp` | `hp` | `bp`. `f0` and `q` may be functions of t, and the
 * coefficients are recomputed every sample when they are, which is how a
 * whoosh gets its moving formant without being cut into segments.
 */
export function biquad(x, type, f0, q = 0.707) {
  const F = asFn(f0), Q = asFn(q);
  const n = x.length, y = buf(n);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const w0 = (TAU * clamp(F(t), 10, SR * 0.45)) / SR;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * Math.max(0.05, Q(t)));
    const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; }
    const v = (b0 / a0) * x[i] + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/**
 * A Schroeder reverb: four parallel combs into two series allpasses. Small on
 * purpose. The wishlist says the game has no reverb bus and a wet sample sticks
 * out the moment two overlap, so this is a room, not a cathedral.
 */
export function reverb(x, { wet = 0.2, rt = 0.6 } = {}) {
  const combs = [1557, 1617, 1491, 1422];
  const aps = [225, 556];
  const n = x.length;
  let sum = buf(n);
  for (const d of combs) {
    const g = Math.pow(0.001, d / (rt * SR));
    const line = new Float64Array(d);
    let p = 0;
    for (let i = 0; i < n; i++) {
      const out = line[p];
      line[p] = x[i] + out * g;
      p = (p + 1) % d;
      sum[i] += out / combs.length;
    }
  }
  for (const d of aps) {
    const g = 0.5;
    const line = new Float64Array(d);
    let p = 0;
    const out = buf(n);
    for (let i = 0; i < n; i++) {
      const bufd = line[p];
      const v = -g * sum[i] + bufd;
      line[p] = sum[i] + g * v;
      p = (p + 1) % d;
      out[i] = v;
    }
    sum = out;
  }
  const y = buf(n);
  for (let i = 0; i < n; i++) y[i] = x[i] * (1 - wet) + sum[i] * wet;
  return y;
}

/** One-pole DC blocker. Without it a thud with an asymmetric envelope carries an offset. */
export function dcBlock(x, fc = 20) {
  const R = 1 - (TAU * fc) / SR;
  const y = buf(x.length);
  let px = 0, py = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i] - px + R * py;
    px = x[i]; py = v; y[i] = v;
  }
  return y;
}

/** A couple of milliseconds at each end, so nothing starts or ends on a step. */
export function fade(x, inS = 0.003, outS = 0.008) {
  const ni = Math.max(1, Math.round(inS * SR));
  const no = Math.max(1, Math.round(outS * SR));
  for (let i = 0; i < Math.min(ni, x.length); i++) x[i] *= i / ni;
  for (let i = 0; i < Math.min(no, x.length); i++) x[x.length - 1 - i] *= i / no;
  return x;
}

/** Scale so the loudest sample sits at `target`. Silence is left alone. */
export function normalise(x, target = PEAK) {
  let peak = 0;
  for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > peak) peak = v; }
  if (!(peak > 0)) return x;
  const k = target / peak;
  for (let i = 0; i < x.length; i++) x[i] *= k;
  return x;
}

/** The last three steps every one-shot takes. A loop skips the fade and the blocker. */
function finish(x, { loop = false } = {}) {
  let y = x;
  if (!loop) { y = dcBlock(y); fade(y); }
  return normalise(y);
}

// -------------------------------------------------------------- the recipes --

/**
 * Every sound, in the order they are written. `seconds` is the file length,
 * `recipe` is what it is made of in words, and `render(n, rng)` returns the
 * samples before normalising.
 */
export const RECIPES = [
  {
    name: 'cast_start',
    seconds: 0.6,
    loop: false,
    recipe: 'A rising shimmer. Three sines at 1, 1.5 and 2.01 of a fundamental '
      + 'sweeping 220 to 880 Hz, the top one detuned so the pair beats, under a '
      + 'swell that peaks three quarters of the way in. Bandpassed noise sweeps '
      + '1.2 to 5.4 kHz over the top for air. A small room behind it.',
    render(n, rng) {
      const f = (t) => 220 * Math.pow(4, t / 0.6);
      const swell = envBell(n, 0.78, 1.5);
      const out = buf(n);
      add(out, tone(n, f, 1, 'sine'), 1.0);
      add(out, tone(n, (t) => f(t) * 1.5, 1, 'sine'), 0.55);
      add(out, tone(n, (t) => f(t) * 2.01, 1, 'sine'), 0.32);
      shape(out, swell);
      const air = biquad(noise(n, rng), 'bp', (t) => 1200 + 4200 * (t / 0.6), 2.5);
      add(out, air, 0.5, swell);
      return reverb(out, { wet: 0.18, rt: 0.5 });
    },
  },
  {
    name: 'cast_loop',
    seconds: 1,
    loop: true,
    recipe: 'A soft hum that loops. Every partial is an integer number of hertz, '
      + 'so exactly one second is exactly one period and the last sample meets '
      + 'the first: 110 Hz with its first three harmonics, breathing at 2 and 3 Hz, '
      + 'plus 24 quiet partials scattered between 800 and 3000 Hz for the shimmer. '
      + 'No fade at either end and no DC blocker, because both would break the seam.',
    render(n, rng) {
      const out = buf(n);
      const breathe = (t) => 0.86 + 0.09 * Math.sin(TAU * 2 * t) + 0.05 * Math.sin(TAU * 3 * t + 1.1);
      for (const [f, a] of [[110, 1], [220, 0.5], [330, 0.26], [440, 0.13]]) {
        add(out, tone(n, f, breathe, 'sine', rng() * TAU), a);
      }
      for (let i = 0; i < 24; i++) {
        const f = 800 + Math.round(rng() * 2200);          // integer Hz, so still periodic
        add(out, tone(n, f, 1, 'sine', rng() * TAU), 0.022);
      }
      return out;
    },
  },
  {
    name: 'spell_fire',
    seconds: 0.9,
    recipe: 'A whoosh with a crackle. Bandpassed noise whose centre runs 300 to '
      + '1800 and back to 500 Hz under a swell is the rush of air; on top of it '
      + 'sparse impulses, thinning exponentially, are rung through a narrow '
      + 'bandpass at 2.6 kHz for the crackle. A 70 Hz body underneath gives it weight.',
    render(n, rng) {
      const out = buf(n);
      const centre = (t) => (t < 0.35 ? 300 + (1800 - 300) * (t / 0.35) : 1800 - 1300 * ((t - 0.35) / 0.55));
      const rush = biquad(noise(n, rng), 'bp', centre, 1.1);
      add(out, rush, 1.0, envBell(n, 0.32, 1.2));
      const spark = buf(n);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        if (rng() < 0.035 * Math.exp(-t / 0.3)) spark[i] = (rng() * 2 - 1);
      }
      add(out, biquad(spark, 'bp', 2600, 6), 0.85);
      add(out, tone(n, (t) => 90 - 30 * t, 1, 'sine'), 0.5, envAD(n, 0.004, 0.14));
      return out;
    },
  },
  {
    name: 'spell_cold',
    seconds: 0.9,
    recipe: 'A glassy chime with a shiver. Four sine partials at 1046, 1568, 2093 '
      + 'and 3136 Hz with decays getting shorter as they get higher, which is what '
      + 'makes glass sound like glass; the top two are tremoloed at 19 Hz for the '
      + 'shiver. Highpassed noise above 6 kHz, gated by the same tremolo, is the frost.',
    render(n, rng) {
      const out = buf(n);
      const shiver = (t) => 0.72 + 0.28 * Math.sin(TAU * 19 * t);
      const parts = [[1046.5, 1, 0.40, false], [1568, 0.62, 0.30, false], [2093, 0.45, 0.22, true], [3136, 0.26, 0.15, true]];
      for (const [f, a, tau, trem] of parts) {
        add(out, tone(n, f, trem ? shiver : 1, 'sine'), a, envAD(n, 0.002, tau));
      }
      const frost = biquad(noise(n, rng), 'hp', 6000, 0.9);
      const frostEnv = envAD(n, 0.005, 0.18);
      for (let i = 0; i < n; i++) frostEnv[i] *= shiver(i / SR);
      add(out, frost, 0.28, frostEnv);
      return reverb(out, { wet: 0.16, rt: 0.55 });
    },
  },
  {
    name: 'spell_energy',
    seconds: 0.6,
    recipe: 'A crack of static. Four milliseconds of highpassed noise at full '
      + 'level is the crack; after it, noise gated by a fast random switch and '
      + 'highpassed at 1.2 kHz is the static, thinning out over a quarter second. '
      + 'A 3 kHz ring and a 90 Hz thump sit at either end of the spectrum.',
    render(n, rng) {
      const out = buf(n);
      const crack = noise(n, rng);
      add(out, biquad(crack, 'hp', 2500, 0.7), 0.55, envAD(n, 0.0005, 0.006));
      const gated = buf(n);
      let hold = 0, level = 0;
      for (let i = 0; i < n; i++) {
        if (hold <= 0) { hold = 40 + Math.floor(rng() * 340); level = rng() < 0.45 ? rng() : 0; }
        hold--;
        gated[i] = (rng() * 2 - 1) * level;
      }
      add(out, biquad(gated, 'hp', 1200, 0.8), 1.0, envAD(n, 0.002, 0.13));
      add(out, tone(n, 3000, 1, 'sine'), 0.25, envAD(n, 0.001, 0.09));
      add(out, tone(n, (t) => 90 - 25 * t, 1, 'sine'), 0.45, envAD(n, 0.002, 0.07));
      return out;
    },
  },
  {
    name: 'spell_poison',
    seconds: 1,
    recipe: 'A wet hiss. Noise lowpassed at 1.3 kHz, its level moved around by a '
      + 'slow smoothed noise so it gurgles instead of sitting flat, opening over '
      + '80 ms and falling away over half a second. Five short sine chirps falling '
      + '420 to 140 Hz are the bubbles coming up through it.',
    render(n, rng) {
      const out = buf(n);
      const hiss = biquad(noise(n, rng), 'lp', 1300, 0.9);
      const gurgle = buf(n);
      let v = 0.5;
      for (let i = 0; i < n; i++) { v += (rng() - 0.5) * 0.02; v = clamp(v, 0.25, 1); gurgle[i] = v; }
      const body = envAD(n, 0.08, 0.42);
      for (let i = 0; i < n; i++) out[i] += hiss[i] * gurgle[i] * body[i];
      for (let b = 0; b < 5; b++) {
        const len = nsec(0.13);
        const start = nsec(0.10 + b * 0.15 + rng() * 0.05);
        const bub = tone(len, (t) => 420 * Math.pow(0.34, t / 0.13), 1, 'sine');
        at(out, shape(bub, envAD(len, 0.004, 0.05)), start, 0.30 + rng() * 0.15);
      }
      return out;
    },
  },
  {
    name: 'spell_holy',
    seconds: 1.4,
    recipe: 'A warm chord. C4, E4, G4 and C5 struck together, each with its first '
      + 'two harmonics falling off, an 90 ms attack so nothing stabs, and a 0.6 s '
      + 'decay. More room than anything else here, because this is the one sound '
      + 'that is allowed to sound like a church.',
    render(n, rng) {
      const out = buf(n);
      const env = envAD(n, 0.09, 0.6);
      for (const f of [261.63, 329.63, 392.00, 523.25]) {
        add(out, tone(n, f, 1, 'sine', rng() * TAU), 0.6, env);
        add(out, tone(n, f * 2, 1, 'sine', rng() * TAU), 0.18, env);
        add(out, tone(n, f * 3, 1, 'sine', rng() * TAU), 0.07, env);
      }
      return reverb(out, { wet: 0.3, rt: 0.9 });
    },
  },
  {
    name: 'spell_dark',
    seconds: 1.4,
    recipe: 'A low drone with a rasp. Naive saws at 55 and 82.5 Hz, a fifth apart, '
      + 'lowpassed at 380 Hz so the aliasing that is left reads as grit. Over them, '
      + 'noise chopped by a 37 Hz square gate and bandpassed at 900 Hz is the rasp. '
      + 'Slow in, slow out: it arrives rather than starts.',
    render(n, rng) {
      const out = buf(n);
      const hold = envAHR(n, 0.14, 0.45);
      const drone = buf(n);
      add(drone, tone(n, 55, 1, 'saw'), 1.0);
      add(drone, tone(n, 82.5, 1, 'saw'), 0.55);
      add(out, biquad(drone, 'lp', 380, 1.1), 1.0, hold);
      const gate = buf(n);
      for (let i = 0; i < n; i++) gate[i] = (rng() * 2 - 1) * (Math.sin(TAU * 37 * (i / SR)) > 0 ? 1 : 0.15);
      add(out, biquad(gate, 'bp', 900, 2), 0.30, hold);
      return reverb(out, { wet: 0.2, rt: 0.8 });
    },
  },
  {
    name: 'spell_physical',
    seconds: 0.5,
    recipe: 'A thud. One sine falling 160 to 48 Hz inside the first tenth of a '
      + 'second with a 90 ms decay, which is a kick drum and is also what a '
      + 'physical spell hitting a body sounds like. Twelve milliseconds of '
      + 'lowpassed noise on the front is the contact.',
    render(n, rng) {
      const out = buf(n);
      const f = (t) => 48 + 112 * Math.exp(-t / 0.035);
      add(out, tone(n, f, 1, 'sine'), 1.0, envAD(n, 0.001, 0.09));
      add(out, biquad(noise(n, rng), 'lp', 1800, 0.8), 0.5, envAD(n, 0.0005, 0.012));
      return out;
    },
  },
  {
    name: 'heal',
    seconds: 1.2,
    recipe: 'A bright rising triad. C5, E5, G5 struck 110 ms apart, each a sine '
      + 'with a third of a second harmonic and a touch of the third, decaying over '
      + '0.45 s. Light room. It goes up because everything that means "better" goes up.',
    render(n, rng) {
      const out = buf(n);
      const len = nsec(0.9);
      const env = envAD(len, 0.006, 0.45);
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((f, i) => {
        const v = buf(len);
        add(v, tone(len, f, 1, 'sine', rng() * TAU), 1.0);
        add(v, tone(len, f * 2, 1, 'sine', rng() * TAU), 0.3);
        add(v, tone(len, f * 3, 1, 'sine', rng() * TAU), 0.1);
        at(out, shape(v, env), nsec(i * 0.11), 0.7);
      });
      return reverb(out, { wet: 0.22, rt: 0.7 });
    },
  },
  {
    name: 'buff',
    seconds: 0.7,
    recipe: 'A short major chord. C4, E4, G4 together as triangles, lowpassed at '
      + '2.5 kHz so it is warm rather than bright, in over 10 ms and gone in 0.3. '
      + 'Short on purpose: a buff lands often and a long chime would wear out.',
    render(n, rng) {
      const out = buf(n);
      for (const f of [261.63, 329.63, 392.00]) add(out, tone(n, f, 1, 'tri', rng() * TAU), 0.6);
      const y = biquad(out, 'lp', 2500, 0.8);
      return shape(y, envAD(n, 0.01, 0.28));
    },
  },
  {
    name: 'debuff',
    seconds: 0.85,
    recipe: 'A minor chord falling. G4, then E flat 4, then C4, 100 ms apart, as '
      + 'saws lowpassed at 1.4 kHz so they are dull where buff is warm. Same length '
      + 'family as buff, opposite direction, minor third: the pair reads as a pair.',
    render(n, rng) {
      const out = buf(n);
      const len = nsec(0.6);
      const env = envAD(len, 0.008, 0.3);
      [392.00, 311.13, 261.63].forEach((f, i) => {
        const v = biquad(tone(len, f, 1, 'saw', rng() * TAU), 'lp', 1400, 0.9);
        at(out, shape(v, env), nsec(i * 0.10), 0.65);
      });
      return out;
    },
  },
  {
    name: 'impact_flesh',
    seconds: 0.35,
    recipe: 'A hit into a body. Noise lowpassed at 900 Hz with a 50 ms decay is '
      + 'the slap, an 85 Hz sine with a 100 ms decay is the mass behind it, and a '
      + 'little 300 Hz body fills the gap. Dull, close, no crack anywhere in it.',
    render(n, rng) {
      const out = buf(n);
      add(out, biquad(noise(n, rng), 'lp', 900, 0.9), 0.9, envAD(n, 0.001, 0.05));
      add(out, tone(n, (t) => 85 - 20 * t, 1, 'sine'), 0.8, envAD(n, 0.002, 0.10));
      add(out, tone(n, 300, 1, 'sine'), 0.25, envAD(n, 0.002, 0.04));
      return out;
    },
  },
  {
    name: 'impact_metal',
    seconds: 0.7,
    recipe: 'A hit on plate. Six milliseconds of highpassed noise is the strike; '
      + 'the ring is four INHARMONIC partials at 1, 2.76, 5.40 and 8.93 times '
      + '620 Hz, which is a struck bar rather than a struck string, each decaying '
      + 'faster than the one below. A 120 Hz thump says the plate has a body.',
    render(n, rng) {
      const out = buf(n);
      add(out, biquad(noise(n, rng), 'hp', 3000, 0.7), 0.9, envAD(n, 0.0005, 0.006));
      const ratios = [[1, 1, 0.35], [2.76, 0.55, 0.24], [5.40, 0.3, 0.16], [8.93, 0.16, 0.10]];
      for (const [r, a, tau] of ratios) {
        add(out, tone(n, 620 * r, 1, 'sine', rng() * TAU), a * 0.55, envAD(n, 0.001, tau));
      }
      add(out, tone(n, (t) => 120 - 30 * t, 1, 'sine'), 0.45, envAD(n, 0.002, 0.07));
      return out;
    },
  },
  {
    name: 'impact_bone',
    seconds: 0.3,
    recipe: 'A dry crack. Four milliseconds of noise excites two very narrow '
      + 'bandpasses at 1.1 kHz (Q 18) and 2.7 kHz (Q 22), which is a hollow rigid '
      + 'thing being struck; a quiet 130 Hz knock with a 50 ms decay is the rest of '
      + 'the skeleton. Nothing wet in it anywhere, which is the whole difference from '
      + 'flesh, and it measures as one: spectral centroid 946 Hz against flesh at 745.',
    render(n, rng) {
      const out = buf(n);
      const hit = shape(noise(n, rng), envAD(n, 0.0003, 0.004));
      add(out, biquad(hit, 'bp', 1100, 18), 4.0, envAD(n, 0.001, 0.06));
      add(out, biquad(hit, 'bp', 2700, 22), 3.0, envAD(n, 0.001, 0.045));
      add(out, biquad(hit, 'hp', 4000, 0.7), 0.30, envAD(n, 0.0005, 0.008));
      add(out, tone(n, 130, 1, 'sine'), 0.12, envAD(n, 0.001, 0.05));
      return out;
    },
  },
  {
    name: 'swing_light',
    seconds: 0.3,
    recipe: 'A one-handed blade through air. Bandpassed noise, Q 1.8, its centre '
      + 'running 700 to 2600 and back to 1000 Hz, under a bell that peaks a little '
      + 'past halfway. Short and high: this is a sword, not a maul.',
    render(n, rng) {
      const centre = (t) => (t < 0.16 ? 700 + (2600 - 700) * (t / 0.16) : 2600 - 1600 * ((t - 0.16) / 0.14));
      const y = biquad(noise(n, rng), 'bp', centre, 1.8);
      return shape(y, envBell(n, 0.55, 1.4));
    },
  },
  {
    name: 'swing_heavy',
    seconds: 0.45,
    recipe: 'A two-handed weapon through air. The same shape as swing_light an '
      + 'octave and a half down, 260 to 950 to 380 Hz at Q 1.4 and half again as '
      + 'long, with a lowpassed rumble under it. A greatsword displaces more air '
      + 'and takes longer to come round.',
    render(n, rng) {
      const centre = (t) => (t < 0.26 ? 260 + (950 - 260) * (t / 0.26) : 950 - 570 * ((t - 0.26) / 0.19));
      const swell = envBell(n, 0.58, 1.3);
      const out = buf(n);
      add(out, biquad(noise(n, rng), 'bp', centre, 1.4), 1.0, swell);
      add(out, biquad(noise(n, rng), 'lp', 220, 0.9), 0.55, swell);
      return out;
    },
  },
  {
    name: 'crit',
    seconds: 0.8,
    recipe: 'A hit with a ring on it. The metal impact, then a struck bell at '
      + '1760 Hz with its fifth at 2640 ringing for 0.45 s over the top. The ring '
      + 'is the part the player is being told about, so it is the part that lasts.',
    render(n, rng) {
      const out = buf(n);
      add(out, biquad(noise(n, rng), 'hp', 3000, 0.7), 0.8, envAD(n, 0.0005, 0.006));
      add(out, tone(n, 620, 1, 'sine', rng() * TAU), 0.4, envAD(n, 0.001, 0.18));
      add(out, tone(n, (t) => 130 - 30 * t, 1, 'sine'), 0.5, envAD(n, 0.002, 0.08));
      add(out, tone(n, 1760, 1, 'sine', rng() * TAU), 0.5, envAD(n, 0.003, 0.45));
      add(out, tone(n, 2640, 1, 'sine', rng() * TAU), 0.22, envAD(n, 0.003, 0.30));
      return reverb(out, { wet: 0.15, rt: 0.6 });
    },
  },
  {
    name: 'skill_up',
    seconds: 0.45,
    recipe: 'Two notes going up. E5 then B5, 120 ms apart, sine with a quarter of '
      + 'a second harmonic, 0.22 s decay each. Small: this fires every round ten '
      + 'of every skill and must never become the thing you hear.',
    render(n, rng) {
      const out = buf(n);
      const len = nsec(0.3);
      const env = envAD(len, 0.004, 0.22);
      [659.25, 987.77].forEach((f, i) => {
        const v = buf(len);
        add(v, tone(len, f, 1, 'sine', rng() * TAU), 1.0);
        add(v, tone(len, f * 2, 1, 'sine', rng() * TAU), 0.25);
        at(out, shape(v, env), nsec(i * 0.12), 0.8);
      });
      return out;
    },
  },
  {
    name: 'stat_up',
    seconds: 0.6,
    recipe: 'Three notes going up. C5, E5, G5, 90 ms apart, the same voice as '
      + 'skill_up so the two are obviously relatives, one note longer because a '
      + 'stat is rarer than a skill point and is allowed to take up more room.',
    render(n, rng) {
      const out = buf(n);
      const len = nsec(0.36);
      const env = envAD(len, 0.004, 0.25);
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const v = buf(len);
        add(v, tone(len, f, 1, 'sine', rng() * TAU), 1.0);
        add(v, tone(len, f * 2, 1, 'sine', rng() * TAU), 0.25);
        at(out, shape(v, env), nsec(i * 0.09), 0.8);
      });
      return out;
    },
  },
  {
    name: 'grandmaster',
    seconds: 1.8,
    recipe: 'A fanfare. C5, E5, G5 100 ms apart as brass (saw lowpassed at 3 kHz), '
      + 'then C6 with the G5 held under it from 0.36 s, ringing for 0.9 s in a '
      + 'real room. This plays when a skill reaches 100 and should be the loudest '
      + 'thing in the game that is not a boss.',
    render(n, rng) {
      const out = buf(n);
      const voice = (f, seconds, tau) => {
        const len = nsec(seconds);
        const v = biquad(tone(len, f, 1, 'saw', rng() * TAU), 'lp', 3000, 0.9);
        return shape(v, envAD(len, 0.02, tau));
      };
      [523.25, 659.25, 783.99].forEach((f, i) => at(out, voice(f, 0.6, 0.3), nsec(i * 0.10), 0.42));
      at(out, voice(1046.5, 1.4, 0.9), nsec(0.36), 0.5);
      at(out, voice(783.99, 1.4, 0.9), nsec(0.36), 0.28);
      at(out, voice(261.63, 1.4, 0.9), nsec(0.36), 0.3);
      return reverb(out, { wet: 0.28, rt: 1.0 });
    },
  },
  {
    name: 'level_boss_phase',
    seconds: 1.8,
    recipe: 'A deep horn. C2 at 65.4 Hz with eight harmonics falling off as 1/n^1.1, '
      + 'which is roughly a horn spectrum, lowpassed at 900 Hz, held for a second '
      + 'and let go over 0.5. It bends up a whole tone at the end, the way a player '
      + 'in trouble is meant to feel about it. Big room.',
    render(n, rng) {
      const out = buf(n);
      const bend = (t) => 65.41 * (1 + 0.06 * clamp((t - 1.0) / 0.7, 0, 1));
      const hold = envAHR(n, 0.18, 0.5);
      for (let h = 1; h <= 8; h++) {
        add(out, tone(n, (t) => bend(t) * h, 1, 'sine', rng() * TAU), Math.pow(h, -1.1) * 0.6, hold);
      }
      const y = biquad(out, 'lp', 900, 0.9);
      return reverb(y, { wet: 0.26, rt: 1.1 });
    },
  },
  {
    name: 'leap_land',
    seconds: 0.8,
    recipe: 'A body arriving. A sine falling 90 to 45 Hz with a 130 ms decay is '
      + 'the weight; fourteen short lowpassed noise grains scattered over the next '
      + 'third of a second, quieter as they go, are the grit thrown up; a bandpass '
      + 'at 1.5 kHz is the gear rattling once and settling.',
    render(n, rng) {
      const out = buf(n);
      add(out, tone(n, (t) => 45 + 45 * Math.exp(-t / 0.05), 1, 'sine'), 1.0, envAD(n, 0.001, 0.13));
      const grit = buf(n);
      for (let g = 0; g < 14; g++) {
        const len = nsec(0.03);
        const v = shape(noise(len, rng), envAD(len, 0.0005, 0.008));
        at(grit, v, nsec(0.02 + rng() * 0.33), 0.9 - g * 0.05);
      }
      add(out, biquad(grit, 'lp', 2200, 0.9), 0.55);
      add(out, biquad(noise(n, rng), 'bp', 1500, 4), 0.18, envAD(n, 0.004, 0.09));
      return out;
    },
  },
  {
    name: 'aoe_ring',
    seconds: 0.9,
    recipe: 'A ring going out. Bandpassed noise whose centre falls 1800 to 300 Hz, '
      + 'which is a thing getting further away rather than nearer, with a sine '
      + 'sweeping 120 to 60 Hz under it and a soft 440 Hz tone marking where it '
      + 'started. Down, not up: this is the one shape that says outward.',
    render(n, rng) {
      const out = buf(n);
      const swell = envBell(n, 0.22, 1.1);
      add(out, biquad(noise(n, rng), 'bp', (t) => 1800 - 1500 * clamp(t / 0.7, 0, 1), 1.6), 1.0, swell);
      add(out, tone(n, (t) => 120 - 60 * clamp(t / 0.7, 0, 1), 1, 'sine'), 0.5, envAD(n, 0.005, 0.22));
      add(out, tone(n, 440, 1, 'sine', rng() * TAU), 0.22, envAD(n, 0.004, 0.30));
      return out;
    },
  },
  {
    name: 'aoe_column',
    seconds: 1.4,
    recipe: 'A column standing where something is going to land. A drone rising '
      + '80 to 160 Hz with its fifth above it, opening over 0.2 s and holding, '
      + 'with a bandpassed noise bed climbing 400 to 3000 Hz over the top. It '
      + 'rises for as long as the telegraph lasts, which is the warning.',
    render(n, rng) {
      const out = buf(n);
      const hold = envAHR(n, 0.2, 0.3);
      const f = (t) => 80 * Math.pow(2, clamp(t / 1.2, 0, 1));
      add(out, tone(n, f, 1, 'saw'), 0.5, hold);
      add(out, tone(n, (t) => f(t) * 1.5, 1, 'sine'), 0.3, hold);
      const y = biquad(out, 'lp', 1200, 1.0);
      const air = biquad(noise(n, rng), 'bp', (t) => 400 + 2600 * clamp(t / 1.2, 0, 1), 2.2);
      add(y, air, 0.35, hold);
      return reverb(y, { wet: 0.2, rt: 0.8 });
    },
  },

  // ------------------------------------------------------------- Wyrmsoul --
  //
  // 14-KALDERA.md section 3: "sound drops to a low roar and a heartbeat" on the
  // call, and "a flash, the trails snap back, the sound returns" at the end.
  // Two files, and only two, because MAX_SECONDS is 2 and audio.js has no
  // looping cue: the roar and the first beats of the heart are one sound, and
  // the amber at the edges of the screen carries the rest of the six seconds.
  // docs/mmo/wiring/D2.md says so out loud rather than implying a bed of sound
  // that is not there.
  {
    name: 'wyrmsoul_call',
    seconds: 1.9,
    recipe: 'A dragon under the floor, and a heart. The roar is a saw at 41 Hz '
      + 'with its first five harmonics, bent DOWN a fifth over the whole file (the '
      + 'sound of everything slowing), lowpassed at 700 Hz, with a slow 5 Hz growl '
      + 'on its amplitude. Under it, three heartbeats at 0.10, 0.72 and 1.34 s, '
      + 'each a lub-dub pair of 55 to 28 Hz sines 140 ms apart. A long dark room '
      + 'behind all of it.',
    render(n, rng) {
      const out = buf(n);
      // the roar, bending down: 41 Hz to about 27 Hz over the file
      const f = (t) => 41 * Math.pow(2, -0.6 * clamp(t / 1.9, 0, 1));
      const hold = envAHR(n, 0.06, 0.7);
      const growl = (t) => 0.78 + 0.22 * Math.sin(TAU * 5 * t);
      for (const [h, a] of [[1, 1.0], [2, 0.5], [3, 0.3], [4, 0.16], [5, 0.09]]) {
        add(out, tone(n, (t) => f(t) * h, growl, h === 1 ? 'saw' : 'sine', rng() * TAU), a * 0.5, hold);
      }
      let y = biquad(out, 'lp', 700, 1.1);
      // the heart: a lub and a dub, three times
      const beat = buf(n);
      const thump = (startS, gain) => {
        const len = nsec(0.22);
        const v = shape(tone(len, (t) => 28 + 27 * Math.exp(-t / 0.035), 1, 'sine'), envAD(len, 0.002, 0.055));
        at(beat, v, nsec(startS), gain);
      };
      for (const t0 of [0.10, 0.72, 1.34]) { thump(t0, 1.0); thump(t0 + 0.14, 0.62); }
      add(y, biquad(beat, 'lp', 220, 0.8), 0.9);
      // air moving the wrong way, quietly, for the sense of the world slowing
      const air = biquad(noise(n, rng), 'bp', (t) => 900 - 600 * clamp(t / 1.9, 0, 1), 2.0);
      add(y, air, 0.12, hold);
      return reverb(y, { wet: 0.3, rt: 1.4 });
    },
  },
  {
    name: 'wyrmsoul_end',
    seconds: 1.0,
    recipe: 'Time letting go. A 12 ms click of full band noise is the snap; a '
      + 'bright sine sweeping 320 up to 2.6 kHz in 90 ms and gone is the flash; '
      + 'then everything the world owed arrives as a bandpassed noise swell that '
      + 'rises over 180 ms and falls away over half a second, with a 55 Hz sine '
      + 'under it for the weight of it landing. A short bright room.',
    render(n, rng) {
      const out = buf(n);
      // the snap
      const snapLen = nsec(0.012);
      at(out, shape(noise(snapLen, rng), envAD(snapLen, 0.0002, 0.004)), 0, 1.0);
      // the flash
      const flash = shape(
        tone(n, (t) => 320 * Math.pow(8, clamp(t / 0.09, 0, 1)), 1, 'sine'),
        envAD(n, 0.001, 0.045),
      );
      add(out, flash, 0.55);
      // the world arriving all at once
      const swell = envBell(n, 0.22, 1.6);
      add(out, biquad(noise(n, rng), 'bp', (t) => 600 + 3400 * clamp(t / 0.5, 0, 1), 1.6), 0.42, swell);
      add(out, tone(n, (t) => 55 + 20 * Math.exp(-t / 0.08), 1, 'sine'), 0.7, envAD(n, 0.004, 0.16));
      return reverb(out, { wet: 0.16, rt: 0.45 });
    },
  },
];

export const RECIPE_BY_NAME = Object.fromEntries(RECIPES.map((r) => [r.name, r]));
/** The filenames this script writes, in order. audio.js SYNTH_FILES must match. */
export const FILENAMES = RECIPES.map((r) => `${r.name}.wav`);

// -------------------------------------------------------------- the rendering --

/** Render one recipe to normalised float samples. Deterministic. */
export function render(name) {
  const r = RECIPE_BY_NAME[name];
  if (!r) throw new Error(`synth-sfx: no recipe named ${name}`);
  const n = nsec(r.seconds);
  const rng = mulberry32((BASE_SEED ^ hashName(r.name)) >>> 0);
  const raw = r.render(n, rng);
  if (raw.length !== n) throw new Error(`${name}: rendered ${raw.length} samples, wanted ${n}`);
  return finish(raw, { loop: !!r.loop });
}

/** 44 byte canonical header, then little-endian signed 16 bit samples. */
export function toWav(samples) {
  const n = samples.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);                       // PCM
  b.writeUInt16LE(CHANNELS, 22);
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE((SR * CHANNELS * BITS) / 8, 28);
  b.writeUInt16LE((CHANNELS * BITS) / 8, 32);
  b.writeUInt16LE(BITS, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = Math.round(samples[i] * 32767);
    if (v > 32767) v = 32767;
    if (v < -32768) v = -32768;
    b.writeInt16LE(v, 44 + i * 2);
  }
  return b;
}

/**
 * Read a WAV back. Used by the test, which measures the file that shipped
 * rather than the array that was in memory a moment ago.
 * @returns {{ sampleRate, channels, bits, samples, seconds, peak, peakDb, dc }}
 */
export function readWav(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  const channels = b.readUInt16LE(22);
  const sampleRate = b.readUInt32LE(24);
  const bits = b.readUInt16LE(34);
  const dataLen = b.readUInt32LE(40);
  if (bits !== 16) throw new Error(`expected 16 bit, got ${bits}`);
  const n = Math.floor(dataLen / 2);
  const samples = new Float64Array(n);
  let peak = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const v = b.readInt16LE(44 + i * 2) / 32768;
    samples[i] = v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v;
  }
  return {
    sampleRate, channels, bits, samples,
    seconds: n / (sampleRate * channels),
    peak,
    peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    dc: n ? sum / n : 0,
  };
}

/** Render every recipe to bytes. `{ name -> Buffer }`, in RECIPES order. */
export function renderAll() {
  const out = {};
  for (const r of RECIPES) out[`${r.name}.wav`] = toWav(render(r.name));
  return out;
}

/** Write every file. Returns one measured row per file. */
export function writeAll(dir = DEFAULT_OUT) {
  mkdirSync(dir, { recursive: true });
  const rows = [];
  for (const r of RECIPES) {
    const bytes = toWav(render(r.name));
    const path = join(dir, `${r.name}.wav`);
    writeFileSync(path, bytes);
    const m = readWav(bytes);
    rows.push({
      name: r.name, path, bytes: bytes.length,
      seconds: m.seconds, peakDb: m.peakDb, dc: m.dc, loop: !!r.loop,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------- cli --

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    for (const r of RECIPES) console.log(`${r.name.padEnd(18)} ${r.seconds.toFixed(2)} s  ${r.recipe}`);
  } else {
    const dir = args.find((a) => !a.startsWith('-')) || DEFAULT_OUT;
    const rows = writeAll(dir);
    let total = 0;
    for (const r of rows) {
      total += r.bytes;
      console.log(
        `${r.name.padEnd(18)} ${r.seconds.toFixed(3)} s  peak ${r.peakDb.toFixed(2)} dBFS  `
        + `dc ${(r.dc * 100).toFixed(4)} %  ${String(r.bytes).padStart(7)} bytes${r.loop ? '  (loop)' : ''}`,
      );
    }
    console.log(`\n${rows.length} files, ${(total / 1024 / 1024).toFixed(2)} MB, into ${dir}`);
  }
}
