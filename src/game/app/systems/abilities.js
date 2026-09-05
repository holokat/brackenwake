// What the bars do: the twelve ability slots, the eight item slots, and every
// spark, burst and flinch either of them throws.

import { createEffects } from '../../effects.js';
import { createAbilities } from '../../abilities_runtime.js';
import { createItemBar } from '../../item_bar.js';
import { recompute } from '../../actor.js';

export const abilities = {
  name: 'abilities',
  deps: ['world', 'player', 'combat', 'inventory'],

  create(ctx) {
    const { sc, hud, audio, floaters, input, camera, character } = ctx;
    const runtime = ctx.get('world').runtime;
    const player = ctx.get('player');
    const { rig, actor, progression } = player;
    const fight = ctx.get('combat');
    const pack = ctx.get('inventory').inventory;

    const effects = createEffects(sc, { audio });
    // a weapon's hit effect bursts where it landed, in its colour
    fight.combat.onHit?.(({ defender, colour, damage, fired }) => {
      if (!fired || !defender?.pos) return;
      effects.burst(defender.pos, colour, damage > 20 ? 1.4 : 1);
    });

    const runtimeAbilities = createAbilities({
      character, actor, input, combat: fight.combat, monsters: fight.monsters, targeting: fight.targeting,
      effects, floaters, hud, audio,
      player: rig, camera, progression,
      heightAt: (x, z) => runtime.heightAt(x, z),
      enabled: () => !ctx.get('ui').windows.anyOpen && !ctx.get('world_life').shop.isOpen && !ctx.get('dev').on && !player.dying,
      recompute: (who) => recompute(who || actor),
      rng: Math.random,
    });

    // the item bar: eight slots on F5 to F12 for potions, food, weapons and tools,
    // kept apart from the ability bar so a sword and a spell never share a key
    const itemBar = createItemBar({
      character, inventory: pack, input, hud,
      useItem: (item, where) => ctx.get('ui').panelCtx.useItem(item, where),
      setTool: (id) => ctx.get('ui').pickTool(id),
      enabled: () => !ctx.get('ui').windows.anyOpen && !player.dying,
    });
    hud.onItem?.((slot, how) => (how === 'clear' ? itemBar.clear(slot) : itemBar.use(slot)));
    hud.onItemDrop?.((slot, payload) => itemBar.assign(slot, payload));

    return {
      abilities: runtimeAbilities, effects, itemBar,
      bw: { abilities: runtimeAbilities, effects, itemBar },
    };
  },

  update(ctx, frame) {
    const { abilities: runtimeAbilities, itemBar } = ctx.get('abilities');
    const input = ctx.input;
    // a held spell that Escape lets go must not also open the settings window
    const hadPending = !!runtimeAbilities.pending;
    runtimeAbilities.update(frame.dt, frame.nowS);
    if (hadPending && !runtimeAbilities.pending && input.pressed('escape')) input.swallow('escape');
    itemBar.update(frame.dt);
  },

  late(ctx, frame) {
    ctx.get('abilities').effects.update(frame.dt);   // after the player's gait has posed the rig: the clips add to it
  },
};
