// Sound, in node, with no DOM. Run: node src/game/audio.test.mjs
//
// Audio is the easiest thing in a game to believe in without evidence: the code
// exists, the file exists, and nobody hears a thing. So every claim here is
// made against a fake element that records what was built, at what volume, and
// whether it was ever asked to play.
//
// Importing this file also runs `auditAudio()` at module load, which is the
// point of the audit: a cue naming a file that is not in public/audio/sfx
// cannot get past `npm test`.
import {
  createAudio, auditAudio, attenuation, createRotation,
  CUES, SFX_FILES, DEAD_FILES, NO_FILE_FOR, STAND_INS,
  takesOf, fileFor, urlFor, kitFor, MUSIC_KITS,
  MAX_DIST, REF_DIST, SFX_VOLUME, MUSIC_VOLUME, STORE_KEY, SLOT_MS,
} from './audio.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

/** An element that does nothing but remember what was done to it. */
function fakeKit(readyState = 1) {
  const built = [], played = [];
  const make = (url) => {
    const el = {
      url, volume: 1, playbackRate: 1, loop: false, currentTime: 0,
      readyState, paused: true, plays: 0, pauses: 0, listeners: {},
      play() { this.plays++; this.paused = false; played.push(this); return { catch() {} }; },
      pause() { this.pauses++; this.paused = true; },
      addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
      removeEventListener() {},
      fire(t) { for (const fn of (this.listeners[t] || []).slice()) fn(); },
    };
    built.push(el);
    return el;
  };
  return { make, built, played, reset() { built.length = 0; played.length = 0; } };
}

function memStore() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// ---- the audit ------------------------------------------------------------
{
  check('the real cue table passes its own audit', auditAudio() === true);

  let rows = 0, takes = 0;
  const have = new Set(SFX_FILES);
  let allThere = true, allAlive = true;
  for (const [name, cue] of Object.entries(CUES)) {
    rows++;
    for (let i = 0; i < takesOf(cue); i++) {
      takes++;
      const f = fileFor(cue, i);
      if (!have.has(f)) { allThere = false; console.log(`      ${name} take ${i + 1} -> ${f} MISSING`); }
      if (DEAD_FILES[f]) { allAlive = false; console.log(`      ${name} take ${i + 1} -> ${f} SILENT`); }
    }
  }
  check(`every take of every cue is a file on disk`, allThere, `${rows} cues, ${takes} takes`);
  check('no cue points at a file measured silent', allAlive);
  check('the audit list is the 61 files in public/audio/sfx', SFX_FILES.length === 61, String(SFX_FILES.length));
  check('urlFor puts a take under /audio/sfx/', urlFor(CUES.mine, 2) === '/audio/sfx/pickaxe-3.mp3', urlFor(CUES.mine, 2));

  // and it has to fail, both ways
  check('a cue naming a file that is not there throws',
    /nope\.ogg is not in/.test(threw(() => auditAudio({ bad: { file: 'nope.ogg' } })) || ''),
    String(threw(() => auditAudio({ bad: { file: 'nope.ogg' } }))));
  check('a good one-file cue passes', auditAudio({ ok: { file: 'pickup.ogg' } }) === true);
  check('a family asking for more takes than exist throws',
    /pickaxe-5\.mp3 is not in/.test(threw(() => auditAudio({ bad: { family: 'pickaxe', takes: 5, ext: 'mp3' } })) || ''));
  check('a family that exactly exists passes', auditAudio({ ok: { family: 'pickaxe', takes: 4, ext: 'mp3' } }) === true);
  check('the right family with the wrong extension throws',
    /pickaxe-1\.ogg is not in/.test(threw(() => auditAudio({ bad: { family: 'pickaxe', takes: 1, ext: 'ogg' } })) || ''));
  check('a cue naming nothing at all throws',
    /names nothing|no file/.test(threw(() => auditAudio({ bad: {} })) || ''));
  check('a cue pointing at the silent file throws',
    /click\.ogg is silent/.test(threw(() => auditAudio({ bad: { file: 'click.ogg' } })) || ''));
  check('a malformed slice throws',
    /slice/.test(threw(() => auditAudio({ bad: { file: 'pickup.ogg', slices: [[0]] } })) || ''));
  const many = threw(() => auditAudio({ a: { file: 'no1.ogg' }, b: { file: 'no2.ogg' } })) || '';
  check('the audit reports every offender, not just the first',
    /no1\.ogg/.test(many) && /no2\.ogg/.test(many));

  check('the cues asked for with no file are recorded, not forgotten',
    !!NO_FILE_FOR.hurt && !!NO_FILE_FOR.step && !('hurt' in CUES) && !('step' in CUES));
  check('the three stand-ins say what they are standing in for',
    Object.keys(STAND_INS).join(',') === 'chopDown,land,enterCave', Object.keys(STAND_INS).join(','));
}

// ---- take rotation --------------------------------------------------------
{
  const r = createRotation(4, () => 0);
  const seen = [];
  for (let i = 0; i < 40; i++) seen.push(r.next());
  const counts = [0, 0, 0, 0];
  for (const v of seen) counts[v]++;
  check('40 draws from 4 takes use each one 10 times', counts.join(',') === '10,10,10,10', counts.join(','));
  let repeat = -1;
  for (let i = 1; i < seen.length; i++) if (seen[i] === seen[i - 1]) { repeat = i; break; }
  check('no take ever follows itself', repeat < 0, repeat < 0 ? seen.slice(0, 12).join('') : `at ${repeat}`);

  // the boundary case the shuffle exists for: a new pass that would open on the
  // take the old pass closed with
  const scripted = [0.6, 0];       // pass 1 leaves [0,1]; pass 2 would deal [1,0]
  let k = 0;
  const r2 = createRotation(2, () => scripted[Math.min(k++, scripted.length - 1)]);
  const s2 = [r2.next(), r2.next(), r2.next()];
  check('a fresh shuffle never opens on the take that just played',
    s2.join(',') === '0,1,0', s2.join(','));

  const r1 = createRotation(1, () => 0.5);
  check('a family with one take always returns it', r1.next() === 0 && r1.next() === 0);
}

// ---- the distance model ---------------------------------------------------
{
  check('a sound at the listener is full volume', attenuation(0) === 1);
  check('and so is one inside the reach', attenuation(REF_DIST) === 1 && attenuation(REF_DIST - 0.01) === 1);
  check('a sound exactly at the max is silent', attenuation(MAX_DIST) === 0);
  check('and past it stays silent', attenuation(MAX_DIST + 500) === 0);
  const mid = attenuation((REF_DIST + MAX_DIST) / 2);
  check('halfway out it is quieter but audible', mid > 0 && mid < 1, mid.toFixed(3));

  let monotonic = true, prev = 1, strict = true;
  for (let d = 0; d <= MAX_DIST + 5; d += 0.25) {
    const v = attenuation(d);
    if (v > prev + 1e-12) monotonic = false;
    if (d > REF_DIST && d < MAX_DIST && v >= prev) strict = false;
    prev = v;
  }
  check('volume never rises with distance, over 190 samples', monotonic);
  check('and strictly falls between the reach and the max', strict);
  check('a nonsense distance is treated as at the listener', attenuation(NaN) === 1 && attenuation(-4) === 1);
}

// ---- nothing before the gesture, everything after -------------------------
{
  const k = fakeKit();
  const a = createAudio({ makeElement: k.make, storage: null, listen: false, fadeMs: 0 });
  check('a fresh instance is locked', a.unlocked === false);
  check('a cue before the gesture plays nothing', a.play('chop') === null);
  check('and builds nothing either', k.built.length === 0, String(k.built.length));
  check('music before the gesture starts nothing', a.music.start() === false && k.built.length === 0);
  check('and it is not playing', a.music.playing === false);

  check('the gesture unlocks once', a.unlock() === true && a.unlocked === true);
  check('unlocking twice is not a second unlock', a.unlock() === false);
  check('the music that was asked for is now running', a.music.playing === true && k.played.length > 0);

  k.reset();
  const missed = [];
  for (const name of Object.keys(CUES)) {
    const el = a.play(name);
    if (!el || el.plays !== 1) missed.push(name);
  }
  check(`all ${Object.keys(CUES).length} cues play after the gesture`, missed.length === 0, missed.join(',') || 'none');
  check('and each one built exactly one element', k.built.length === Object.keys(CUES).length, String(k.built.length));
  check('a cue that is not in the table plays nothing', a.play('nosuchcue') === null);
  a.dispose();
}

// ---- volume, and where the sound is ---------------------------------------
{
  const k = fakeKit();
  const a = createAudio({ makeElement: k.make, storage: null, listen: false, fadeMs: 0 });
  a.unlock();
  a.setListener(100, 100);

  const at = a.play('rockBreak', { at: { x: 100, z: 100 } });
  check('a sound at your feet is sfx volume times the cue gain',
    Math.abs(at.volume - SFX_VOLUME * CUES.rockBreak.gain) < 1e-9, String(at.volume));

  const near = a.play('rockBreak', { at: { x: 100, z: 124 } });
  const expect = SFX_VOLUME * CUES.rockBreak.gain * attenuation(24);
  check('a sound 24 m off is attenuated by exactly the model',
    Math.abs(near.volume - expect) < 1e-9, `${near.volume} vs ${expect}`);

  k.reset();
  check('a sound past the max plays nothing', a.play('rockBreak', { at: { x: 100, z: 100 + MAX_DIST + 1 } }) === null);
  check('and does not even build an element', k.built.length === 0, String(k.built.length));

  const loud = a.play('pickup', { gain: 0.5 });
  check('an opts gain multiplies the cue gain',
    Math.abs(loud.volume - SFX_VOLUME * CUES.pickup.gain * 0.5) < 1e-9, String(loud.volume));
  const fast = a.play('pickup', { rate: 1.5 });
  check('an opts rate reaches the element', fast.playbackRate === 1.5);
  check('a cue with its own rate carries it', a.play('oreBreak').playbackRate === CUES.oreBreak.rate);
  check('the same cue without a rate stays at 1', a.play('rockBreak').playbackRate === 1);
  check('volume can never exceed 1', a.play('pickup', { gain: 99 }).volume === 1);
  a.dispose();
}

// ---- a delayed cue, for the tree that is still falling ---------------------
{
  const k = fakeKit();
  const jobs = [];
  const a = createAudio({
    makeElement: k.make, storage: null, listen: false, fadeMs: 0,
    schedule: (fn, ms) => { jobs.push({ fn, ms }); return null; },
  });
  a.unlock();
  a.setListener(0, 0);
  check('a delayed cue plays nothing yet', a.play('chopDown', { at: { x: 3, z: 0 }, delay: 1300 }) === null);
  check('and builds nothing yet', k.built.length === 0, String(k.built.length));
  check('but it is booked for the moment the tree lands', jobs.length === 1 && jobs[0].ms === 1300, JSON.stringify(jobs.map((j) => j.ms)));
  jobs[0].fn();
  check('and when the timer fires it plays', k.built.length === 1 && k.built[0].plays === 1);
  check('at the right file and volume',
    /place-object/.test(k.built[0].url) && k.built[0].volume === SFX_VOLUME * CUES.chopDown.gain,
    `${k.built[0].url} @ ${k.built[0].volume}`);

  // walking away between the swing and the thud makes it quieter, because the
  // distance is measured when the sound fires
  k.reset(); jobs.length = 0;
  a.play('chopDown', { at: { x: 30, z: 0 }, delay: 1300 });
  a.setListener(0, 0);
  jobs[0].fn();
  check('a delayed cue is measured from where the ear is when it lands',
    Math.abs(k.built[0].volume - SFX_VOLUME * CUES.chopDown.gain * attenuation(30)) < 1e-9, String(k.built[0].volume));
  k.reset(); jobs.length = 0;
  a.play('chopDown', { at: { x: 30, z: 0 }, delay: 1300 });
  a.setListener(500, 500);
  jobs[0].fn();
  check('and out of earshot by then it is not heard at all', k.built.length === 0, String(k.built.length));
  a.dispose();
}

// ---- no listener is loud, not silent --------------------------------------
{
  const k = fakeKit();
  const warns = [];
  const realWarn = console.warn;
  console.warn = (m) => warns.push(String(m));
  const a = createAudio({ makeElement: k.make, storage: null, listen: false, fadeMs: 0 });
  a.unlock();
  check('with no listener set the listener is null', a.listener === null);
  const el = a.play('chop', { at: { x: 5000, z: 5000 } });
  check('a positioned sound with no listener is still heard', !!el && el.volume > 0, String(el && el.volume));
  a.play('chop', { at: { x: 5000, z: 5000 } });
  check('and it says so on the console exactly once', warns.length === 1, warns.join(' | '));
  console.warn = realWarn;
  check('setListener records where the ear is', JSON.stringify(a.setListener(3, -4)) === '{"x":3,"z":-4}');
  check('and then the same sound is out of earshot', a.play('chop', { at: { x: 5000, z: 5000 } }) === null);
  a.dispose();
}

// ---- the sliced chop ------------------------------------------------------
{
  const k = fakeKit(1);                       // a cached file, ready to seek
  const stops = [];
  const a = createAudio({
    makeElement: k.make, storage: null, listen: false, fadeMs: 0,
    schedule: (fn, ms) => { stops.push(ms); return null; },
  });
  a.unlock();
  const seeks = [];
  for (let i = 0; i < 9; i++) seeks.push(a.play('chop').currentTime);
  const offsets = CUES.chop.slices.map(([at]) => at);
  check('chop seeks to one of its three strikes every time',
    seeks.every((v) => offsets.includes(v)), seeks.join(','));
  let same = false;
  for (let i = 1; i < seeks.length; i++) if (seeks[i] === seeks[i - 1]) same = true;
  check('and never plays the same strike twice running', !same, seeks.join(','));
  const used = new Set(seeks);
  check('all three strikes get used', used.size === 3, [...used].join(','));
  check('every chop schedules a stop at the end of its slice',
    stops.length === 9 && stops.every((ms) => ms >= 550 && ms <= 700), stops.slice(0, 3).join(','));

  // and the cold path: metadata has not arrived yet, so the seek waits for it
  const k2 = fakeKit(0);
  const b = createAudio({ makeElement: k2.make, storage: null, listen: false, fadeMs: 0, schedule: () => null });
  b.unlock();
  const cold = b.play('chop');
  check('a cold element is played from the top', cold.currentTime === 0 && cold.plays === 1);
  cold.fire('loadedmetadata');
  check('and seeks the moment its metadata lands', offsets.includes(cold.currentTime), String(cold.currentTime));
  a.dispose(); b.dispose();
}

// ---- the two mutes are independent ----------------------------------------
{
  const k = fakeKit();
  const a = createAudio({ makeElement: k.make, storage: memStore(), listen: false, fadeMs: 0 });
  a.music.setBiome('meadow');
  a.music.start();
  a.unlock();
  const track = a.music.el;
  check('music is playing to begin with', !!track && track.paused === false);

  check('toggling sfx off reports off', a.toggleSfx() === false && a.sfxOn === false);
  k.reset();
  check('a cue with sfx muted plays nothing', a.play('pickup') === null && k.built.length === 0);
  check('and the music is still running', a.music.el.paused === false && a.musicOn === true);

  check('toggling sfx back on reports on', a.toggleSfx() === true);
  check('and the cue plays again', a.play('pickup') !== null);

  check('toggling music off reports off', a.toggleMusic() === false && a.musicOn === false);
  check('the track is paused', a.music.el.paused === true);
  check('the ambience bed is paused too', a.music.ambience === null || a.music.ambience.paused === true);
  check('and sfx still play', a.play('pickup') !== null && a.sfxOn === true);
  check('toggling music back on resumes the same track',
    a.toggleMusic() === true && a.music.el.paused === false);
  a.dispose();
}

// ---- the settings survive a reload ----------------------------------------
{
  const store = memStore();
  const k = fakeKit();
  const a = createAudio({ makeElement: k.make, storage: store, listen: false, fadeMs: 0 });
  check('both are on by default', a.musicOn === true && a.sfxOn === true);
  check('and the volumes are the documented defaults',
    a.musicVolume === MUSIC_VOLUME && a.sfxVolume === SFX_VOLUME, `${a.musicVolume} / ${a.sfxVolume}`);
  a.toggleSfx();
  a.setMusicVolume(0.12);
  check('the blob is written under the one key', !!store.getItem(STORE_KEY), String(store.getItem(STORE_KEY)));

  const b = createAudio({ makeElement: k.make, storage: store, listen: false, fadeMs: 0 });
  check('a reload remembers sfx were muted', b.sfxOn === false);
  check('and that music was not', b.musicOn === true);
  check('and the volume that was set', b.musicVolume === 0.12, String(b.musicVolume));
  b.toggleSfx();
  const c = createAudio({ makeElement: k.make, storage: store, listen: false, fadeMs: 0 });
  check('unmuting round-trips as well', c.sfxOn === true);

  const junk = memStore();
  junk.setItem(STORE_KEY, '{not json');
  const d = createAudio({ makeElement: k.make, storage: junk, listen: false, fadeMs: 0 });
  check('a corrupt blob falls back to the defaults', d.musicOn === true && d.sfxOn === true);
  const e = createAudio({ makeElement: k.make, storage: null, listen: false, fadeMs: 0 });
  check('with no storage at all it still runs', e.musicOn === true && e.sfxOn === true);
  a.dispose(); b.dispose(); c.dispose(); d.dispose(); e.dispose();
}

// ---- the music rotation ---------------------------------------------------
{
  check('every biome main.js can name has a kit', ['ocean', 'beach', 'meadow', 'boreal', 'desert', 'sakura', 'mountain', 'snow']
    .every((b) => !!kitFor(b)));
  check('a biome nobody has heard of falls back to the meadow', kitFor('lava') === MUSIC_KITS.meadow);
  check('boreal has no lively track and knows it', MUSIC_KITS.boreal.lively === null);

  let t = 1000;
  const k = fakeKit();
  const a = createAudio({ makeElement: k.make, storage: null, listen: false, fadeMs: 0, now: () => t });
  check('setBiome before anything starts reports the change', a.music.setBiome('meadow') === true);
  a.music.start();
  a.unlock();
  check('it opens on the theme', a.music.kind === 'theme' && /meadow\/theme/.test(a.music.track), String(a.music.track));
  check('and lays the ambience bed under it', /meadow\/ambience/.test(a.music.ambience.url));
  check('the bed loops', a.music.ambience.loop === true && a.music.el.loop === true);
  check('the track is at music volume, not sfx volume', a.music.el.volume === MUSIC_VOLUME, String(a.music.el.volume));

  check('mid-slot nothing rotates', a.music.tick() === null);
  t += SLOT_MS.theme + 1;
  a.music.tick();
  check('an idle player gets the calm track next', a.music.kind === 'calm', String(a.music.kind));
  a.play('chop');                                  // the player is working again
  t += SLOT_MS.calm + 1;
  a.music.tick();
  check('then the lively one', a.music.kind === 'lively', String(a.music.kind));
  t += SLOT_MS.lively + 1;
  a.music.tick();
  check('and the theme comes back on the third slot', a.music.kind === 'theme', String(a.music.kind));

  check('crossing into a biome with the same kit changes nothing', a.music.setBiome('meadow') === false);
  check('beach and ocean share the shore kit', a.music.setBiome('beach') === true && a.music.setBiome('ocean') === false);
  check('and the shore music is now what is playing', /oceanside\//.test(a.music.track), String(a.music.track));

  check('sakura is a different kit', a.music.setBiome('sakura') === true);
  const first = a.music.track;
  t += 400_000;
  a.music.tick();
  check('sakura has two themes and alternates them',
    a.music.track !== first && /sakura\/theme/.test(a.music.track), `${first} -> ${a.music.track}`);
  check('and borrows the meadow ambience, because it has none of its own',
    /meadow\/ambience/.test(a.music.ambience.url));

  a.music.stop();
  check('stop pauses the track', a.music.el.paused === true && a.music.playing === false);
  a.dispose();
}

// ---- muted music is ready, not thrown away --------------------------------
{
  const store = memStore();
  store.setItem(STORE_KEY, JSON.stringify({ music: false, sfx: true }));
  const k = fakeKit();
  const a = createAudio({ makeElement: k.make, storage: store, listen: false, fadeMs: 0, now: () => 1 });
  a.music.setBiome('desert');
  a.music.start();
  a.unlock();
  check('starting muted builds the track but never plays it',
    !!a.music.el && a.music.el.plays === 0, String(a.music.el && a.music.el.plays));
  check('and it is already at the right volume for the moment it is unmuted',
    a.music.el.volume === MUSIC_VOLUME, String(a.music.el.volume));
  check('unmuting plays what was waiting', a.toggleMusic() === true && a.music.el.plays === 1);
  a.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
