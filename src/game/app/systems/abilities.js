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

  // THE PLAYER'S CLOCK, all of it, and on purpose. `14-KALDERA.md` section 3:
  // "The player's cooldowns and casts run at full speed, so a rogue gets ten
  // seconds of free hits; a mage gets ten seconds of casts that all land as
  // time resumes." So `runtime.update` and the item bar take `dt` and `nowS`
  // and never the world's.
  //
  // `effects.update` is the player's clock too, which is a decision and not an
  // oversight: the pool holds the player's own bolts and the swing, cast and
  // flinch clips on the player's rig, and every one of those is the player's.
  // A monster's shot is NOT in here at all: `monsters.js` steps its own
  // projectiles inside `monsters.update`, which is already on the world clock,
  // so an arrow really does hang. What is on the player's clock and belongs to
  // the world is the impact burst a monster's blow throws, which lasts a third
  // of a second and is over before anybody could time it. Written down here
  // rather than left to be found.
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
