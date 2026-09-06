// Fly mode, the badge, and the bench behind F2.

import { createDev } from '../../dev.js';
import { panel as devPanel, benchOf as devBenchOf } from '../../win_dev.js';

export const dev = {
  name: 'dev',
  deps: ['world', 'player', 'combat', 'ui'],

  create(ctx) {
    const { sc, state, hud, camera, floaters } = ctx;
    const runtime = ctx.get('world').runtime;
    const rig = ctx.get('player').rig;
    const { monsters, loot } = ctx.get('combat');

    const runtimeDev = createDev({ sc, camera, player: rig, hud, runtime, state, monsters, floaters, loot });
    // the dev bench reaches everything through the panel context; nothing here
    // is a second path. These are set before applySettings below, because
    // applySettings reads panelCtx.dev: this system is not registered until
    // create has returned, so ctx.get('dev') would not find it yet.
    const face = ctx.get('ui');
    face.panelCtx.dev = runtimeDev;
    face.panelCtx.debug = runtimeDev.debug;
    // Dev mode and the bench are one idea: turning the mode on, by the key,
    // by the Settings toggle or by a saved setting, opens the bench with the
    // tour, the warps and the lab; turning it off closes it. Before this the
    // Settings toggle turned the mode on and opened nothing, and the only way
    // to the bench was F2, which on a Mac is a brightness key.
    runtimeDev.onChange((on) => {
      const windows = face.windows;
      if (!windows) return;
      if (on) { if (!windows.isOpen('dev')) windows.open('dev'); }
      else if (windows.isOpen('dev')) windows.close('dev');
    });
    // the numbers at the top right are a button: a click hides or shows the bench
    ctx.hud.onDev?.(() => { const w = face.windows; if (w && runtimeDev.on) w.toggle('dev'); });
    // The settings window can turn fly mode on, so the saved settings are
    // applied the moment there is a dev to turn on, which is where the old
    // single file applied them too: after createDev and before anything wakes.
    face.applySettings(ctx.character.settings);

    return {
      dev: runtimeDev,
      get on() { return runtimeDev.on; },
      get stats() { return runtimeDev.stats; },
      toggle: () => runtimeDev.toggle(),
      /** The eye flies instead of walking. The player system decides which. */
      fly: (dt) => runtimeDev.update(dt),
      bw: {
        dev: runtimeDev, devPanel,
        get devBench() { return devBenchOf(); },
      },
    };
  },

  hotkeys(ctx, frame) {
    const input = ctx.input;
    if (input.pressed('f1') || input.pressed('`')) {
      // the bench follows the mode through runtimeDev.onChange above
      ctx.get('dev').toggle();
    }
  },
};
