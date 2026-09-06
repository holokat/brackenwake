// Dev mode. F1 or backquote (the key under Escape), or the Settings toggle.
//
// Two things at once: the camera flies, and the game stops asking whether you
// can afford anything. Every tool counts as CARRIED, the market opens anywhere
// and charges nothing. None of that is written to the save, so turning it off
// leaves you with exactly what you bought.
//
// "Carried", not "in hand": there is no hand to hold a tool in since T3 took
// the tool row off the screen. `toolFor` in src/game/tools.js is asked for the
// dev flag and answers with the tool the work wants, from nowhere, and every
// refusal that would have named an axe stops happening while the lens is up.
//
// On: the camera leaves the player where it is and flies free, the player is
// hidden and stops being simulated, the badge lights, and the world streams
// around the camera instead of around the player.
//
// Off: the player is put on the ground directly under the camera, which is the
// only landing that does not drop you into a hillside or leave you standing in
// the air, and the camera goes back to following.
//
// Every switch says which way it went. A debug mode that changes what the
// world streams around and says nothing is a bug generator.
//
// ---------------------------------------------------------------------------
// What the lens keeps, and what it remembers
// ---------------------------------------------------------------------------
// `state.dev` is still the lens: a live flag, never written to the save, read
// by the market and by the tool rule while it is up. What IS remembered is the
// intent, as `character.settings.dev`, which 08-POLISH-CONTRACT asks for by
// name. It goes on the document, so `state.save()` carries it and main.js's
// `applySettings` puts the mode back at the next boot without this file
// knowing anything about storage.
//
// The two are not one thing and must not be collapsed. `state.dev` is what the
// game asks sixty times a second; `settings.dev` is what the save holds. So
// this file writes both, and neither writes the other.
//
// `debug` is the overlay switches the dev bench (win_dev.js) flips. This file
// owns the object so there is exactly one of it, and main.js hands the same
// reference to the window layer as `ctx.debug`. Nothing here draws anything: a
// flag is a request, and docs/mmo/wiring/G1.md names who has to answer it.
//
// ---------------------------------------------------------------------------
// The frame rate
// ---------------------------------------------------------------------------
// "Dev mode needs to show current FPS." `dev.stats` is the live object while
// the mode is on and null while it is off, and `dev.update(dt)` refreshes it
// every frame: fps and the average frame in milliseconds over a rolling second,
// plus draw calls, triangles, monsters, chunks, floaters and sacks read
// straight off the renderer and the runtimes. Anything that is not wired reads
// null, never a zero. `createFrameMeter` is the averaging, exported so the dev
// bench's own readout uses the same one and the two agree.
//
// docs/mmo/wiring/U2.md has the two lines main.js needs to hand the counts over.

/** Overlay switches. False until something is written that reads them. */
export const DEBUG_FLAGS = ['chunks', 'colliders'];

/** The window the frame rate is averaged over, in seconds. */
export const FPS_WINDOW = 1;

/**
 * A frame rate that does not jitter. One frame's dt reads anywhere between 50
 * and 70 fps on a steady machine, which is a number nobody can use, so this
 * counts whole frames over a second of real time and publishes fps and the
 * average frame in milliseconds once a second.
 *
 * Until the first second is up it publishes the instantaneous reading, so the
 * badge is never blank and never a zero it made up.
 */
export function createFrameMeter(window = FPS_WINDOW) {
  let frames = 0, elapsed = 0, fps = 0, frameMs = 0;
  return {
    /** One frame. Returns the current published reading. */
    push(dt) {
      const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (d > 0) { frames++; elapsed += d; }
      if (elapsed >= window && frames > 0) {
        fps = Math.round(frames / elapsed);
        frameMs = Math.round((elapsed / frames) * 1000 * 100) / 100;
        frames = 0; elapsed = 0;
      } else if (!fps && d > 0) {
        fps = Math.round(1 / d);
        frameMs = Math.round(d * 1000 * 100) / 100;
      }
      return { fps, frameMs };
    },
    get fps() { return fps; },
    get frameMs() { return frameMs; },
    reset() { frames = 0; elapsed = 0; fps = 0; frameMs = 0; },
  };
}

const numOf = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * `sc`, `camera`, `player`, `hud`, `runtime` and `state` are what F1 has always
 * needed. `monsters`, `floaters` and `loot` are new and OPTIONAL: they are only
 * read for the counts on the badge, and every one of them reports null rather
 * than a zero when it is not handed over. docs/mmo/wiring/U2.md has the line
 * main.js needs.
 */
export function createDev({ sc, camera, player, hud, runtime, state, monsters, floaters, loot }) {
  let on = false;
  // Who wants to know when the mode flips. The dev system opens and closes the
  // bench from here, so the Settings toggle, the key and a saved setting all
  // bring the bench with them: one path, not three.
  const listeners = [];
  const debug = Object.fromEntries(DEBUG_FLAGS.map((k) => [k, false]));
  const meter = createFrameMeter();
  // One object, rewritten in place every frame, so whoever holds it holds the
  // live numbers and main.js does not allocate sixty of these a second.
  const stats = {
    fps: 0, frameMs: 0, draws: null, tris: null,
    monsters: null, chunks: null, floaters: null, sacks: null,
  };

  /** Read the counts off whoever is wired. Nothing here is computed or guessed. */
  function sample(dt) {
    const r = meter.push(dt);
    stats.fps = r.fps;
    stats.frameMs = r.frameMs;
    const info = sc && sc.renderer && sc.renderer.info;
    stats.draws = info ? numOf(info.render.calls) : null;
    stats.tris = info ? numOf(info.render.triangles) : null;
    stats.monsters = numOf(monsters?.count);
    stats.chunks = numOf(runtime?.world?.stats?.loaded);
    stats.floaters = numOf(floaters?.count);
    stats.sacks = numOf(loot?.count);
    return stats;
  }

  /**
   * Remember the mode on the document. Quiet when nothing changed, so a
   * settings write that only echoes the current mode does not redraw the HUD.
   */
  function persist(next) {
    const c = state && state.character;
    if (!c) return false;
    if (!c.settings || typeof c.settings !== 'object') c.settings = {};
    if (c.settings.dev === next) return false;
    c.settings.dev = next;
    state.touch?.('settings');
    return true;
  }

  function setOn(next) {
    if (next === on) return on;
    on = next;
    if (on) {
      camera.setMode('fly');
      player?.setVisible(false);
      hud?.setDev(true);
      if (state) state.dev = true;
      persist(true);
      hud?.toast('dev mode on. WASD flies, Q down, E up, shift for speed. Every tool counts as carried and the market is free and opens anywhere. The bench is open: Tour warps you place to place. Click the numbers at the top right to hide or show it.');
    } else {
      const p = sc.camera.position;
      const [cx, cz] = runtime ? runtime.clampWalkable(p.x, p.z) : [p.x, p.z];
      player?.teleport(cx, cz, (x, z) => runtime.heightAt(x, z));
      camera.setMode('follow');
      player?.setVisible(true);
      hud?.setDev(false);
      // The lens comes off: what was bought is what is carried. Nothing has to
      // be put down, because nothing was ever taken up. `toolFor` reads the
      // pack and the doll again the moment `state.dev` goes false, so an axe
      // the lens lent you stops chopping on the next click and says so.
      if (state) state.dev = false;
      persist(false);
      hud?.toast(`dev mode off. You are on the ground at ${Math.round(cx)}, ${Math.round(cz)}, carrying what you actually own.`);
    }
    for (const fn of listeners) { try { fn(on); } catch (e) { console.warn('dev listener', e); } }
    return on;
  }

  return {
    toggle() { return setOn(!on); },
    set(v) { return setOn(!!v); },
    /** Called with the new mode every time it flips. Returns a function that stops listening. */
    onChange(fn) { if (typeof fn === 'function') listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    get on() { return on; },
    /** The overlay switches. win_dev.js writes them; docs/mmo/wiring/G1.md says who reads them. */
    debug,
    /** Write one switch and say what it is now. An unknown name is refused. */
    setDebug(key, value) {
      if (!DEBUG_FLAGS.includes(key)) return null;
      debug[key] = !!value;
      return debug[key];
    },
    /**
     * The live numbers while dev mode is up, and null while it is not, so a
     * badge reading them shows nothing rather than a stale frame rate from
     * whenever the mode was last on.
     */
    get stats() { return on ? stats : null; },
    /** The same object whether or not the mode is on. The panel's readout. */
    get liveStats() { return stats; },
    update(dt) {
      // Counted every frame, not only while flying, so the first second after
      // F1 already has a real reading in it.
      sample(dt);
      if (on) camera.flyUpdate(dt, (x, z) => runtime.heightAt(x, z));
    },
  };
}
