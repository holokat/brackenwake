// Fly mode, the badge, and the bench behind F2.

import { createDev } from '../../dev.js';
import { panel as devPanel, benchOf as devBenchOf } from '../../win_dev.js';
import { buildModelTown, disposeModelTown } from '../../../world/model_town.js';
import { panel as editorPanel, editorOf } from '../../editor/panel.js';
import { setMarkersVisible } from '../../../world/plan_models.js';

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
    // Model Town stands on the origin pad while dev mode is on: every real
    // model the props folder holds, in rows, each with its name over it. It
    // comes down with the mode so a player never meets it.
    let town = null, building = false;
    runtimeDev.onChange(async (on) => {
      if (on) {
        if (town || building) return;
        building = true;
        try {
          const g = await buildModelTown({ heightAt: (x, z) => runtime.heightAt(x, z) });
          if (g && runtimeDev.on) { town = g; sc.scene.add(g); hud.toast?.(`Model Town is up on the origin pad: ${g.userData.ids.length} models. The bench's "model town" button takes you there.`); }
          else if (!g) hud.toast?.('Model Town has nothing to show: public/models/props/manifest.json lists no models. Run node tools/validate-props.mjs.', 'bad');
        } catch (e) { console.warn('model town', e); hud.toast?.('Model Town would not build: ' + (e && e.message), 'bad'); }
        building = false;
      } else if (town) {
        sc.scene.remove(town); disposeModelTown(town); town = null;
      }
    });
    // A space's MARKERS are notes to ourselves standing in the world, and they
    // come up and go down with dev mode, so a player never meets one. The
    // scene is walked, not only the flag set, because a space that streamed in
    // an hour ago is already standing.
    runtimeDev.onChange((on) => {
      const { turned } = setMarkersVisible(on, sc.scene);
      if (turned) hud.toast?.(`${turned} marker ${turned === 1 ? 'post is' : 'posts are'} ${on ? 'up' : 'down'}.`);
    });
    // The editor closes with dev mode: it flies the camera and writes files,
    // and neither belongs to a player.
    runtimeDev.onChange((on) => {
      const windows = face.windows;
      if (!on && windows && windows.isOpen('editor')) windows.close('editor');
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
        dev: runtimeDev, devPanel, editorPanel,
        get devBench() { return devBenchOf(); },
        /** The editor the open window built, for the console. Null until it opens. */
        get editor() { return editorOf(); },
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
