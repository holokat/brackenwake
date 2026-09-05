// The dragon: the one companion. It hatches with the character, follows,
// fights what you fight, eats, cannot die, and carries the Bond.
//
// docs/mmo/14-KALDERA.md sections 2 and 7. The rules, the actor and the entity
// are `src/game/dragon.js`; the four bodies are `src/game/dragon_models.js`;
// the window is `src/game/win_dragon.js`. This file is the wiring and nothing
// else: it hands the entity the real world's parts and puts its update in the
// frame after the fight, so the target it closes on is the target the resolver
// settled this frame and not last frame's.
//
// WHY IT RUNS AFTER world_life AND BEFORE ui. It reads what `combat.update`
// decided (who the player is on, whether the player swung) and writes what
// `ui.late` draws (the Bond, the hunger, the window). Anything earlier would
// draw a frame behind; anything later would fight a frame behind.
//
// WHAT THIS FILE DOES NOT OWN. The Bond meter in the HUD and Wyrmsoul are D2's.
// Everything D2 reads from here is listed in docs/mmo/wiring/D1.md.

import { createDragon } from '../../dragon.js';
import { buildDragon } from '../../dragon_models.js';
import { stepToward } from '../../monsters.js';
import { panel as dragonPanel } from '../../win_dragon.js';

export const dragon = {
  name: 'dragon',
  deps: ['world', 'player', 'combat', 'inventory', 'ui'],

  create(ctx) {
    const { sc, hud, character } = ctx;
    const runtime = ctx.get('world').runtime;
    const { rig, actor } = ctx.get('player');
    const fight = ctx.get('combat');
    const bag = ctx.get('inventory');
    const uiSys = ctx.get('ui');

    // The window is registered before the entity is built, because a nameless
    // dragon asks for the window in its own constructor and a panel that is not
    // registered yet cannot be opened.
    uiSys.windows.register(dragonPanel);

    const entity = createDragon({
      character,
      hud,
      scene: sc.scene,
      buildModel: buildDragon,
      playerRig: rig,
      playerActor: actor,
      heightAt: (x, z) => runtime.heightAt(x, z),
      stepToward,
      inventory: bag.inventory,
      // The same call every monster's swing goes through, so the floaters, the
      // hit effects, the weaknesses and the lessons all fire exactly as they do
      // for a wolf. There is no second damage path for the dragon.
      swing: (attacker, defender, o) => fight.monsters.swingAt(attacker, defender, o),
      // Who the player is on. `attacking` is the auto attack; the targeting's
      // current only counts while the player is actually in a fight, or a
      // dragon would charge a rabbit somebody merely clicked on.
      targetActor: () => {
        const t = fight.attacking?.actor;
        if (t && t.health > 0) return t;
        const cur = fight.targeting?.current;
        if (cur && cur !== actor && cur.health > 0 && fight.combat.inCombat(actor, ctx.frame.now)) return cur;
        return null;
      },
      hostiles: () => fight.monsters.actors(),
      onNeedsName: () => uiSys.windows.open('dragon'),
    });

    // The panel reaches the game through the panel context, as the dev bench
    // does. ui.js is built first and cannot hold a wire to this system, so this
    // system holds it: R1.md, "wiring late".
    uiSys.panelCtx.dragon = entity;

    // It cannot die. combat.js is the one place a thing dies, so this is the
    // one place that is told, and what it does about it is a fall.
    fight.combat.onDeath((who, killer) => {
      if (who !== entity.actor) return;
      entity.fall(killer);
    });

    return {
      entity,
      get record() { return entity.record; },
      get actor() { return entity.actor; },
      bw: {
        dragon: {
          entity,
          get record() { return entity.record; },
          get actor() { return entity.actor; },
          get model() { return entity.model; },
          get pos() { return entity.pos; },
          get bond() { return entity.record.bond; },
          get hunger() { return entity.record.hunger; },
          get awake() { return entity.awake; },
          feed: (baseId) => entity.feed(baseId),
          setAge: (age) => entity.setAge(age),
          fall: () => entity.fall(null),
          wake: () => entity.wake(),
          grant: (giftId) => entity.grant(giftId),
          gifts: () => entity.gifts(),
          on: (event, fn) => entity.on(event, fn),
        },
      },
    };
  },

  update(ctx, frame) { ctx.get('dragon').entity.run(frame); },

  dispose() { /* the entity's body is removed with the scene */ },
};
