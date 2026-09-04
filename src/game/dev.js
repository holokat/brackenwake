// Dev mode. F1 or backquote.
//
// Two things at once: the camera flies, and the game stops asking whether you
// can afford anything. Every tool reports as owned, the market opens anywhere
// and charges nothing. None of that is written to the save, so turning it off
// leaves you with exactly what you bought.
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
// by the tool row and the market while it is up. What IS remembered is the
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

/** Overlay switches. False until something is written that reads them. */
export const DEBUG_FLAGS = ['chunks', 'colliders'];

export function createDev({ sc, camera, player, hud, runtime, state }) {
  let on = false;
  const debug = Object.fromEntries(DEBUG_FLAGS.map((k) => [k, false]));

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
      hud?.toast('dev mode on. WASD flies, Q down, E up, shift for speed. Every tool is in hand and the market is free and opens anywhere. F2 opens the dev bench.');
    } else {
      const p = sc.camera.position;
      const [cx, cz] = runtime ? runtime.clampWalkable(p.x, p.z) : [p.x, p.z];
      player?.teleport(cx, cz, (x, z) => runtime.heightAt(x, z));
      camera.setMode('follow');
      player?.setVisible(true);
      hud?.setDev(false);
      // the lens comes off: what was bought is what is carried
      if (state) { state.dev = false; if (!state.boughtTool?.(state.tool)) state.tool = 'hand'; }
      persist(false);
      hud?.toast(`dev mode off. You are on the ground at ${Math.round(cx)}, ${Math.round(cz)}, carrying what you actually own.`);
    }
    return on;
  }

  return {
    toggle() { return setOn(!on); },
    set(v) { return setOn(!!v); },
    get on() { return on; },
    /** The overlay switches. win_dev.js writes them; docs/mmo/wiring/G1.md says who reads them. */
    debug,
    /** Write one switch and say what it is now. An unknown name is refused. */
    setDebug(key, value) {
      if (!DEBUG_FLAGS.includes(key)) return null;
      debug[key] = !!value;
      return debug[key];
    },
    update(dt) { if (on) camera.flyUpdate(dt, (x, z) => runtime.heightAt(x, z)); },
  };
}
