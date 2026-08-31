// FarmAudio — background music + synthesized chiptune-ish animal voices.
// No audio assets exist for the animals, so every call synthesizes a short
// cartoon-cute approximation with the Web Audio API. Everything is defensive:
// audio is a garnish, so no exception here may ever break the game loop.

const MUTE_KEY = 'nostrux-muted';
const MUSIC_VOL = 0.35;
const AMBIENCE_VOL = 0.15;
const FADE_MS = 1000;
const XFADE_MS = 2600;
// rotation slot lengths — short tracks loop until their slot ends
const SLOT_MS = { theme: 160_000, calm: 175_000, lively: 175_000 };
// a track longer than its slot is allowed to finish rather than being cut
// mid-phrase — capped so one long piece can't hold the slot forever
const MAX_SLOT_MS = 300_000;
const ACTIVITY_WINDOW_MS = 50_000; // sfx within this window = "the player is busy"

const musicKit = (dir) => ({
  theme: `${dir}/theme.mp3`,
  calm: `${dir}/calm.mp3`,
  lively: `${dir}/lively.mp3`,
  ambience: `${dir}/ambience.mp3`,
});
const PLAYLISTS = {
  meadow: musicKit('/audio/music/meadow'),
  oceanside: musicKit('/audio/music/oceanside'),
  desert: musicKit('/audio/music/desert'),
  boreal: { ...musicKit('/audio/music/boreal'), lively: null }, // no lively track yet
  // Sakura Valley has TWO theme songs and no calm/lively tracks. A slot may hold
  // an array; the rotation then walks it instead of replaying one file, so the
  // valley alternates between its two themes rather than looping one forever.
  // The ambience bed is the meadow's — just quiet outdoor atmosphere underneath.
  sakura: {
    theme: ['/audio/music/sakura/theme.mp3', '/audio/music/sakura/theme2.mp3'],
    calm: null,
    lively: null,
    ambience: '/audio/music/meadow/ambience.mp3',
  },
};
// biomes without their own kit borrow the meadow's
PLAYLISTS.autumn = PLAYLISTS.meadow;

export class FarmAudio {
  constructor() {
    // browsers block audio until a user gesture — create nothing yet
    // music and sfx mute independently (legacy single flag migrates to both)
    this._musicMuted = false;
    this._sfxMuted = false;
    try {
      const legacy = window.localStorage.getItem(MUTE_KEY) === '1';
      this._musicMuted = window.localStorage.getItem('nostrux-mute-music') === '1' || legacy;
      this._sfxMuted = window.localStorage.getItem('nostrux-mute-sfx') === '1' || legacy;
    } catch (e) { /* storage may be unavailable */ }
    this._unlocked = false;
    this._ctx = null;
    this._master = null;
    this._noiseBuf = null;
    this._music = null;
    this._ambience = null;
    this._playlist = null;
    this._trackKind = null;
    this._slotEnd = 0;
    this._sinceTheme = 0;
    this._lastActivity = 0;
    this._rotTimer = null;
  }

  // idempotent; call on the first user gesture
  unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this._ctx = new AC();
        if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
        this._master = this._ctx.createGain();
        this._master.gain.value = 1;
        this._master.connect(this._ctx.destination);
      }
    } catch (e) {
      this._ctx = null;
      this._master = null;
    }
    if (this._playlist) {
      this._playTrack('theme');
      this._startAmbience();
    }
  }

  get musicMuted() { return this._musicMuted; }
  get sfxMuted() { return this._sfxMuted; }
  get muted() { return this._musicMuted && this._sfxMuted; }

  // one button, three states: all on -> music off (sfx stays) -> all off -> all on
  cycleMute() {
    if (!this._musicMuted && !this._sfxMuted) this._setMutes(true, false);
    else if (this._musicMuted && !this._sfxMuted) this._setMutes(true, true);
    else this._setMutes(false, false);
    return { musicMuted: this._musicMuted, sfxMuted: this._sfxMuted };
  }

  _setMutes(musicMuted, sfxMuted) {
    this._musicMuted = !!musicMuted;
    this._sfxMuted = !!sfxMuted;
    try {
      window.localStorage.setItem('nostrux-mute-music', this._musicMuted ? '1' : '0');
      window.localStorage.setItem('nostrux-mute-sfx', this._sfxMuted ? '1' : '0');
      window.localStorage.removeItem(MUTE_KEY);
    } catch (e) {}
    for (const a of [this._music, this._ambience]) {
      try {
        if (!a) continue;
        if (this._musicMuted) a.pause();
        else if (this._unlocked) a.play().catch(() => {});
      } catch (e) {}
    }
  }

  // one-shot sound effects from /audio/sfx/<name> (Kenney CC0 via soundcn)
  // `ambient` marks a sound the WORLD made, not the player — a wolf howling at
  // the moon must not count as activity, or the music rotation reads an empty
  // farm as a busy one and swings to the lively track.
  playSfx(name, volume = 0.4, ambient = false) {
    if (!ambient) this._lastActivity = Date.now(); // sfx double as the "player is busy" signal
    if (this._sfxMuted || !this._unlocked) return;
    try {
      const SFX_EXT = {
        handle_coins: 'mp3', loot_coin: 'mp3',
        'plant-seeds': 'opus', 'water-plants': 'opus', 'harvest-crops': 'opus',
        'place-object': 'opus', 'build-complete': 'opus',
        'construction': 'opus', 'construction-hammer-under-way': 'opus',
        'Done1': 'opus', 'Done2': 'opus',
        'wolf-howl-1': 'mp3', 'wolf-howl-2': 'mp3', 'wolf-howl-3': 'mp3', 'wolf-howl-4': 'mp3',
        'chicken-distress-1': 'mp3', 'chicken-distress-2': 'mp3',
      };
      this._sfxCache = this._sfxCache || new Map();
      let base = this._sfxCache.get(name);
      if (!base) {
        base = new Audio(`/audio/sfx/${name}.${SFX_EXT[name] || 'ogg'}`);
        base.preload = 'auto';
        this._sfxCache.set(name, base);
      }
      const a = base.cloneNode();
      a.volume = volume;
      a.play().catch(() => {});
    } catch (e) { /* sfx are garnish */ }
  }

  // Some one-shots ship as several takes (four wolf howls, two chicken panics).
  // Walk them in a shuffled cycle rather than picking at random: random repeats
  // itself often enough to sound like a bug, and a fixed order sounds like a
  // loop. Reshuffling each pass, never starting on the previous take, gives
  // variety without either tell.
  playSfxVariant(base, count, volume = 0.4, ambient = false) {
    if (count <= 1) return this.playSfx(`${base}-1`, volume, ambient);
    this._variantQueue = this._variantQueue || {};
    let q = this._variantQueue[base];
    if (!q || !q.length) {
      q = Array.from({ length: count }, (_, i) => i + 1);
      for (let i = q.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q[i], q[j]] = [q[j], q[i]];
      }
      // never repeat across the shuffle boundary
      if (q[0] === this._lastVariant?.[base] && q.length > 1) [q[0], q[1]] = [q[1], q[0]];
      this._variantQueue[base] = q;
    }
    const n = q.shift();
    this._lastVariant = this._lastVariant || {};
    this._lastVariant[base] = n;
    this.playSfx(`${base}-${n}`, volume, ambient);
  }

  // ---------- adaptive biome playlists ----------
  // Each biome kit: theme song + calm + lively music, and an ambience bed that
  // loops quietly underneath. The theme song opens; slots then rotate calm or
  // lively by recent player activity, returning to the theme every third slot.

  setMusicTheme(themeId) {
    const pl = PLAYLISTS[themeId] || PLAYLISTS.meadow;
    if (pl === this._playlist) return;
    this._playlist = pl;
    this._sinceTheme = 0;
    this._slotCursor = {};
    if (this._unlocked) {
      this._playTrack('theme');
      this._startAmbience();
    }
    this._ensureRotation();
  }

  // farmhouse leveled up — bring the theme song back for the moment
  celebrate() {
    if (!this._playlist || !this._unlocked) return;
    this._sinceTheme = 0;
    this._playTrack('theme');
  }

  _resolveKind(kind) {
    if (this._playlist?.[kind]) return kind;
    return this._playlist?.calm ? 'calm' : 'theme';
  }

  // A slot holds either one url or a list of them. With a list we advance a
  // per-slot cursor so repeat visits play the NEXT track, which is what makes
  // two themes feel like a rotation instead of a coin flip that can repeat.
  _urlFor(kind) {
    const slot = this._playlist?.[kind];
    if (!Array.isArray(slot)) return slot || null;
    const live = slot.filter(Boolean);
    if (!live.length) return null;
    this._slotCursor = this._slotCursor || {};
    const i = this._slotCursor[kind] || 0;
    this._slotCursor[kind] = (i + 1) % live.length;
    return live[i];
  }

  _playTrack(kind) {
    kind = this._resolveKind(kind);
    const url = this._urlFor(kind);
    this._slotEnd = Date.now() + (SLOT_MS[kind] || 170_000);
    if (!url) return;
    // only skip the swap when the SAME track is already playing — comparing the
    // URL (not just the kind) so a theme switch, which keeps kind='theme' but
    // changes the file, actually crossfades to the new biome's music.
    if (this._trackKind === kind && this._music && !this._music.paused
        && this._music.dataset && this._music.dataset.src === url) return;
    this._trackKind = kind;
    this._music = this._swapLoop(this._music, url, MUSIC_VOL);
    // once we know how long it is, let it play out if it runs past the slot
    const a = this._music, started = Date.now();
    if (a) a.addEventListener('loadedmetadata', () => {
      if (this._music !== a || !Number.isFinite(a.duration)) return;
      const natural = started + Math.min(a.duration * 1000, MAX_SLOT_MS);
      if (natural > this._slotEnd) this._slotEnd = natural;
    }, { once: true });
  }

  _startAmbience() {
    const url = this._playlist?.ambience;
    if (!url) return;
    if (this._ambience?.dataset?.src === url) return;
    this._ambience = this._swapLoop(this._ambience, url, AMBIENCE_VOL);
  }

  // crossfade one looping <audio> into another; returns the incoming element
  _swapLoop(old, url, vol) {
    try {
      if (old) this._fadeTo(old, 0, XFADE_MS, () => { try { old.pause(); } catch (e) {} });
      const a = new Audio(url);
      a.loop = true;
      a.dataset.src = url;
      if (this._musicMuted) {
        a.volume = vol; // ready the moment the user unmutes
      } else {
        a.volume = 0;
        a.play().catch(() => {});
        this._fadeTo(a, vol, XFADE_MS);
      }
      return a;
    } catch (e) {
      return old;
    }
  }

  _ensureRotation() {
    if (this._rotTimer) return;
    this._rotTimer = setInterval(() => {
      try { this._rotate(); } catch (e) {}
    }, 9000);
  }

  _rotate() {
    if (!this._playlist || !this._unlocked || this._musicMuted) return;
    if (Date.now() < this._slotEnd) return;
    const busy = Date.now() - this._lastActivity < ACTIVITY_WINDOW_MS;
    let next;
    if (this._trackKind === 'theme') {
      next = busy ? 'lively' : 'calm';
    } else if (this._sinceTheme >= 2) {
      next = 'theme'; // after two other slots the theme song returns
    } else {
      next = this._trackKind === 'calm' ? 'lively' : 'calm'; // alternate moods between theme visits
    }
    this._sinceTheme = next === 'theme' ? 0 : this._sinceTheme + 1;
    this._playTrack(next);
  }

  _fadeTo(audio, target, ms, done) {
    try {
      const from = audio.volume;
      const t0 = Date.now();
      const timer = setInterval(() => {
        try {
          const t = Math.min(1, (Date.now() - t0) / ms);
          audio.volume = from + (target - from) * t;
          if (t >= 1) {
            clearInterval(timer);
            if (done) done();
          }
        } catch (e) {
          clearInterval(timer);
        }
      }, 50);
    } catch (e) {
      if (done) done();
    }
  }

  // synthesized hammer knock for construction sites (no asset yet)
  playHammer() {
    if (!this._ready()) return;
    try {
      const t0 = this._ctx.currentTime;
      for (const dt of [0, 0.14 + Math.random() * 0.05]) {
        const g = this._env(t0 + dt, 0.08, 0.35);
        const o = this._ctx.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(170 + Math.random() * 70, t0 + dt);
        o.frequency.exponentialRampToValueAtTime(70, t0 + dt + 0.07);
        o.connect(g);
        o.start(t0 + dt);
        o.stop(t0 + dt + 0.09);
      }
    } catch (e) {}
  }

  // ---------- synth plumbing ----------

  _ready() {
    return !this._sfxMuted && this._unlocked && this._ctx && this._master;
  }

  // gain node with a quick attack and exponential decay, wired to the master
  _env(t0, dur, peak) {
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(this._master);
    return g;
  }

  // oscillator started at t0, stopped and self-disconnecting after dur
  _osc(type, freq, t0, dur, dest) {
    const o = this._ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.connect(dest);
    o.onended = () => { try { o.disconnect(); } catch (e) {} };
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }

  // slow sine wired into a target AudioParam (vibrato)
  _lfo(rate, depth, param, t0, dur) {
    const o = this._ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(rate, t0);
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(depth, t0);
    o.connect(g);
    g.connect(param);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (e) {} };
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  _noiseSrc(t0, dur, dest) {
    if (!this._noiseBuf) {
      const len = Math.floor(this._ctx.sampleRate * 0.5);
      this._noiseBuf = this._ctx.createBuffer(1, len, this._ctx.sampleRate);
      const data = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = this._ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    src.connect(dest);
    src.onended = () => { try { src.disconnect(); } catch (e) {} };
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    return src;
  }

  _filter(type, freq, q, dest) {
    const f = this._ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  // ---------- animal voices ----------

  playAnimal(type) {
    if (!this._ready()) return;
    try {
      const t = this._ctx.currentTime + 0.02;
      switch (type) {
        case 'cow': this._moo(t); break;
        case 'sheep': this._baa(t, 220, 6.5); break;
        case 'goat': this._baa(t, 255, 8); break;
        case 'pig': this._oink(t); break;
        case 'horse': this._neigh(t); break;
        case 'dog': this._bark(t); break;
        case 'cat': this._meow(t); break;
        case 'rooster': this._crow(t); break;
        case 'chicken': this._cluck(t); break;
        case 'duck': this._quack(t); break;
        case 'bunny': this._squeak(t); break;
        default: this._cluck(t);
      }
    } catch (e) { /* audio must never break the game */ }
  }

  // low sawtooth glide down through a lowpass — a round cartoon 'moo'
  _moo(t) {
    const g = this._env(t, 0.8, 0.15);
    const f = this._filter('lowpass', 420, 1, g);
    const o = this._osc('sawtooth', 112, t, 0.8, f);
    o.frequency.linearRampToValueAtTime(78, t + 0.75);
    this._lfo(5, 4, o.frequency, t, 0.8);
  }

  // mid square with LFO vibrato — the wobble IS the 'baa'
  _baa(t, freq, rate) {
    const g = this._env(t, 0.6, 0.11);
    const f = this._filter('lowpass', 1400, 1, g);
    const o = this._osc('square', freq, t, 0.6, f);
    this._lfo(rate, freq * 0.09, o.frequency, t, 0.6);
    o.frequency.linearRampToValueAtTime(freq * 0.88, t + 0.55);
  }

  // two very short low honks with fast pitch drops
  _oink(t) {
    for (const dt of [0, 0.17]) {
      const g = this._env(t + dt, 0.13, 0.15);
      const f = this._filter('lowpass', 560, 2, g);
      const o = this._osc('sawtooth', 185, t + dt, 0.13, f);
      o.frequency.exponentialRampToValueAtTime(85, t + dt + 0.11);
    }
  }

  // descending whinny with a fast flutter
  _neigh(t) {
    const g = this._env(t, 0.9, 0.12);
    const f = this._filter('lowpass', 1600, 1.5, g);
    const o = this._osc('sawtooth', 600, t, 0.9, f);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.85);
    this._lfo(13, 45, o.frequency, t, 0.9);
  }

  // one or two bursts of bandpassed noise plus a square blip
  _bark(t) {
    const bursts = Math.random() < 0.5 ? [0] : [0, 0.18];
    for (const dt of bursts) {
      const ng = this._env(t + dt, 0.13, 0.11);
      const nf = this._filter('bandpass', 900, 4, ng);
      this._noiseSrc(t + dt, 0.13, nf);
      const bg = this._env(t + dt, 0.13, 0.1);
      const o = this._osc('square', 300, t + dt, 0.13, bg);
      o.frequency.exponentialRampToValueAtTime(150, t + dt + 0.12);
    }
  }

  // triangle glide shaped like 'mee-ow': up high, dip, back up, settle
  _meow(t) {
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.06);
    g.gain.linearRampToValueAtTime(0.06, t + 0.3);
    g.gain.linearRampToValueAtTime(0.11, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    g.connect(this._master);
    const o = this._osc('triangle', 500, t, 0.7, g);
    o.frequency.linearRampToValueAtTime(350, t + 0.3);
    o.frequency.linearRampToValueAtTime(450, t + 0.5);
    o.frequency.linearRampToValueAtTime(380, t + 0.68);
  }

  // 4-note triangle arpeggio, third note held longest — cock-a-DOO-dle-doo
  _crow(t) {
    const notes = [[500, 0.16], [700, 0.16], [900, 0.42], [600, 0.28]];
    let at = t;
    for (const [freq, dur] of notes) {
      const g = this._env(at, dur, 0.11);
      const o = this._osc('triangle', freq, at, dur, g);
      o.frequency.linearRampToValueAtTime(freq * 0.93, at + dur * 0.9);
      at += dur + 0.02;
    }
  }

  // 2-3 short triangle blips with tiny pitch drops
  _cluck(t) {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const at = t + i * 0.14;
      const g = this._env(at, 0.08, 0.1);
      const o = this._osc('triangle', 420 - i * 25, at, 0.08, g);
      o.frequency.exponentialRampToValueAtTime(300, at + 0.07);
    }
  }

  // two short sawtooth bursts through a nasal bandpass
  _quack(t) {
    for (const dt of [0, 0.2]) {
      const g = this._env(t + dt, 0.14, 0.13);
      const f = this._filter('bandpass', 1100, 2.5, g);
      const o = this._osc('sawtooth', 300, t + dt, 0.14, f);
      o.frequency.linearRampToValueAtTime(240, t + dt + 0.12);
    }
  }

  // very quiet, very quick double squeak
  _squeak(t) {
    for (const dt of [0, 0.12]) {
      const g = this._env(t + dt, 0.09, 0.05);
      const o = this._osc('sine', 900, t + dt, 0.09, g);
      o.frequency.linearRampToValueAtTime(1250, t + dt + 0.05);
      o.frequency.linearRampToValueAtTime(950, t + dt + 0.09);
    }
  }

  // ---------- UI sounds ----------

  // pleasant two-note bell for unlocks: fundamental + soft harmonic
  playChime() {
    if (!this._ready()) return;
    try {
      const t = this._ctx.currentTime + 0.02;
      const notes = [[880, 0], [1174.66, 0.16]];
      for (const [freq, dt] of notes) {
        const g = this._env(t + dt, 0.55, 0.1);
        this._osc('sine', freq, t + dt, 0.55, g);
        const h = this._env(t + dt, 0.35, 0.035);
        this._osc('sine', freq * 2, t + dt, 0.35, h);
      }
    } catch (e) {}
  }

  // soft pluck for planting / placing
  playPop() {
    if (!this._ready()) return;
    try {
      const t = this._ctx.currentTime + 0.02;
      const g = this._env(t, 0.14, 0.12);
      const o = this._osc('triangle', 420, t, 0.14, g);
      o.frequency.exponentialRampToValueAtTime(150, t + 0.12);
    } catch (e) {}
  }
}
