// What lives in the world and can be talked to, worked at, picked or sold to:
// the people in the settlements, the crafting stations, what grows under the
// trees, the market, and the interactor that owns trees, rock and doorways.

import { buildCharacter } from '../../player.js';
import { createNpcs } from '../../npcs_runtime.js';
import { createStations } from '../../stations.js';
import { createInteract } from '../../interact.js';
import { createShop } from '../../shop.js';
import { createForaging } from '../../foraging.js';
import { createForageField, seasonAt } from '../../../world/forage.js';
import { variantOf } from '../../../world/flora.js';

export const world_life = {
  name: 'world_life',
  deps: ['world', 'player', 'combat', 'inventory', 'abilities', 'ui'],

  create(ctx) {
    const { sc, state, hud, audio, floaters, input, hudRoot, character } = ctx;
    const world = ctx.get('world');
    const runtime = world.runtime;
    const player = ctx.get('player');
    const { rig, actor, progression } = player;
    const fight = ctx.get('combat');
    const pack = ctx.get('inventory').inventory;
    const panelCtx = ctx.get('ui').panelCtx;

    const npcs = createNpcs(sc, runtime, { buildCharacter, root: hudRoot, at: state.pos, ctx: panelCtx });
    const stations = createStations(sc, runtime, { hud });

    const interact = createInteract({ sc, runtime, player: rig, state, hud, input, audio, progression, loot: fight.loot });
    const shop = createShop({
      state, hud, audio,
      nearestSettlement: () => world.nearestSettlement(),
    });

    // what grows under the trees: mushrooms by the trunks, berries in the
    // clearings, honey on the bark. The trees are handed over as plain records.
    const treesFor = (cx, cz) => {
      const flora = runtime.flora;
      if (typeof flora?.treesFor === 'function') return flora.treesFor(cx, cz);
      const key = `${cx},${cz}`, out = [];
      for (const f of Object.values(flora?.kinds || {})) {
        if ((f.kind || 'tree') !== 'tree' || !f.variants?.length) continue;
        for (const t of f.trees || []) {
          if (t.chunk !== key || t.felledUntil) continue;
          const v = f.variants[variantOf(t, f.variants.length)];
          out.push({ x: t.x, z: t.z, radius: (v?.baseR ?? 0.35) * (t.s ?? 1) });
        }
      }
      return out;
    };
    const forage = createForageField(sc, { field: runtime.field, treesFor, season: seasonAt(Date.now()) });
    const foraging = createForaging({ field: forage, inventory: pack, progression, hud, audio, floaters, character, actor, combat: fight.combat });

    // the panels reach these through the one context, as they always did
    panelCtx.foraging = foraging;
    panelCtx.forage = forage;

    return {
      npcs, stations, interact, shop, forage, foraging,
      bw: { npcs, stations, interact, shop, forage, foraging },
    };
  },

  update(ctx, frame) {
    const { npcs, stations, forage, interact } = ctx.get('world_life');
    const pos = ctx.get('player').pos;
    const { dt, now, day } = frame;
    npcs.update(dt, pos, day);
    stations.update(pos.x, pos.z, now);
    forage.update(pos.x, pos.z, seasonAt(Date.now()), now);   // one clock with harvest
    interact.update(dt, now);
  },
};
