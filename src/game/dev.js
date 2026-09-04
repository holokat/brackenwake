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

export function createDev({ sc, camera, player, hud, runtime, state }) {
  let on = false;

  function setOn(next) {
    if (next === on) return on;
    on = next;
    if (on) {
      camera.setMode('fly');
      player?.setVisible(false);
      hud?.setDev(true);
      if (state) state.dev = true;
      hud?.toast('dev mode on. WASD flies, Q down, E up, shift for speed. Every tool is in hand and the market is free and opens anywhere.');
    } else {
      const p = sc.camera.position;
      const [cx, cz] = runtime ? runtime.clampWalkable(p.x, p.z) : [p.x, p.z];
      player?.teleport(cx, cz, (x, z) => runtime.heightAt(x, z));
      camera.setMode('follow');
      player?.setVisible(true);
      hud?.setDev(false);
      // the lens comes off: what was bought is what is carried
      if (state) { state.dev = false; if (!state.boughtTool?.(state.tool)) state.tool = 'hand'; }
      hud?.toast(`dev mode off. You are on the ground at ${Math.round(cx)}, ${Math.round(cz)}, carrying what you actually own.`);
    }
    return on;
  }

  return {
    toggle() { return setOn(!on); },
    set(v) { return setOn(!!v); },
    get on() { return on; },
    update(dt) { if (on) camera.flyUpdate(dt, (x, z) => runtime.heightAt(x, z)); },
  };
}
