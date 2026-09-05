// The keys that are not movement, and the click router.
//
// THE RIGHT BUTTON IS A MENU, AND IT USED TO BE A SECOND LEFT BUTTON. `input.js`
// prevents the browser's own context menu on the canvas and then reports the
// press as a click like any other, with `button: 2` on it, and nothing here read
// that button. So a right click on a wolf started a fight, and a right click on
// bare ground called one off. It now goes to `context_menu`, which resolves the
// same ray and opens a list at the cursor. `targeting.js` already gated itself
// on `button === 0` and is unchanged.
//
// THE ORDER OF A CLICK, and it is the order it has always been: a held spell
// owns the click before anything else, because it is choosing a target and not
// starting a fight. Then a sack, a person, a station, a plant at your feet, a
// monster, a body to skin, and last of all the interactor, which owns the
// trees, the rock and the doorways. The first one that answers ends the click.

import { STATION_REACH } from '../../stations.js';

/** Reach for E, matched to interact's own REACH when it declares one. */
const DEFAULT_REACH = 6;

export const input = {
  name: 'input',
  deps: ['world', 'player', 'combat', 'abilities', 'inventory', 'world_life', 'ui', 'dev'],

  create(ctx) {
    const { hud } = ctx;
    const keys = ctx.input;
    const world = ctx.get('world');
    const runtime = world.runtime;
    const player = ctx.get('player');
    const fight = ctx.get('combat');
    const bag = ctx.get('inventory');
    const bars = ctx.get('abilities');
    const life = ctx.get('world_life');
    const face = ctx.get('ui');

    const REACH = life.interact.REACH ?? DEFAULT_REACH;

    /**
     * E. Whatever is in reach: a mouth to go into, an exit to take, or nothing,
     * and it says which. interact.js owns the rules, so E and a mouse click come
     * out at the same place; the fallback below only runs for a build of
     * interact.js that predates `enter()`.
     */
    function doInteract() {
      // a sack within reach comes first: you bent down for it
      const sack = fight.loot.nearest(player.pos, 3);
      if (sack) return fight.loot.take(sack, bag.takeLoot);
      if (typeof life.interact.enter === 'function') return life.interact.enter();
      const p = player.pos;
      if (runtime.inDungeon) {
        const exits = (world.lastInside && world.lastInside.exits) || [];
        let best = null, bestD = Infinity;
        for (const e of exits) {
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best && bestD <= REACH) return runtime.dungeonGo(best.dir);
        hud.toast(best ? `the way out is ${Math.round(bestD)} m off` : 'no way out from here', 'bad');
        return null;
      }
      let best = null, bestD = Infinity;
      for (const s of runtime.sitesNear(p.x, p.z, 60)) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < bestD) { bestD = d; best = s; }
      }
      if (!best) { hud.toast('there is nothing to go into here'); return null; }
      if (bestD > REACH + (best.flatR || 0)) {
        hud.toast(`${best.name} is ${Math.round(bestD)} m off, walk to the mouth`, 'bad');
        return null;
      }
      if (best.kind === 'dungeon' || best.kind === 'cave') return runtime.enterDungeon(best);
      hud.toast(`${best.name}. Nothing to go into here yet.`);
      return null;
    }

    /**
     * A click. A sack or a monster under the cursor beats the trees and the
     * animals interact.js knows about; otherwise the click is interact's.
     */
    function route(ray, now, nowS) {
      // a held spell owns the click: it is choosing who, not starting a fight
      if (bars.abilities.pending) {
        const held = fight.monsters.pick(ray);
        return bars.abilities.onTargetPicked(held ? held.actor : null, nowS);
      }
      const sack = fight.loot.pick(ray);
      if (sack) return fight.loot.take(sack, bag.takeLoot);
      // a person in front of a house takes the click, not the roof
      const who = life.npcs.click(ray, player.pos);
      if (who && who.npc) return who;
      const st = life.stations.pick(ray);
      if (st) {
        const d = Math.hypot(st.x - player.pos.x, st.z - player.pos.z);
        if (d > STATION_REACH) { hud.toast(`the ${st.name} is ${Math.round(d)} m off`, 'bad'); return st; }
        face.panelCtx.station = st.id;
        face.windows.open('crafting', { station: st.id });
        return st;
      }
      // a mushroom at your feet beats the oak behind it; out of reach, the click falls through
      const pickF = life.forage.pick(ray);
      if (pickF) {
        const r = life.foraging.harvest(pickF.rec, now);
        if (r.ok || r.reason !== 'too_far') return r;
      }
      const mon = fight.monsters.pick(ray);
      if (mon) {
        // a first click looks; a second click on the same one, or a double
        // click, fights. Clicking another monster mid fight switches to it.
        const again = fight.targeting.current === mon.actor || !!fight.attacking;
        fight.targeting.set?.(mon.actor, 'click');
        if (keys.dblclick || again) {
          fight.startAttack(mon);
          return fight.swingAt(mon.actor, now, nowS, true);
        }
        return { targeted: mon.name };
      }
      // a click on bare ground with a fight running calls it off
      if (fight.attacking) fight.stopAttack('you look away');
      // a body under the cursor, with a knife in hand and something to skin
      const corpse = bag.skinning.pick(ray) || bag.skinning.nearest(player.pos);
      if (corpse && bag.skinning.canSkin(corpse)) return bag.skinning.skin(corpse, now);
      return life.interact.click();
    }

    return { REACH, doInteract, route, bw: {} };
  },

  hotkeys(ctx) {
    // the dev system took F1 before this ran, so `on` is already the new answer
    if (ctx.get('dev').on) return;
    if (ctx.get('player').dying) return;
    const keys = ctx.input;
    const self = ctx.get('input');
    if (keys.pressed('e') && !ctx.get('world_life').shop.isOpen && !ctx.get('ui').windows.anyOpen) self.doInteract();
  },

  click(ctx, ray, frame) {
    if (ctx.get('world_life').shop.isOpen || ctx.get('dev').on || ctx.get('player').dying) return false;
    // The right button never routes. It resolves the same ray and asks for the
    // short list of what can be done to whatever it found, which for an empty
    // ray is the ground.
    if ((ctx.input.click?.button || 0) === 2) {
      return ctx.has('context_menu')
        ? ctx.get('context_menu').openAt(ray, ctx.input.click.px, ctx.input.click.py)
        : false;
    }
    return ctx.get('input').route(ray, frame.now, frame.nowS);
  },
};
