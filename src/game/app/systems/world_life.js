import {createStudioForage} from '../../studio/forage.js';
// What lives in the world and can be talked to, worked at, picked or sold to:
// the people in the settlements, the crafting stations, what grows under the
// trees, the market, and the interactor that owns trees, rock and doorways.

import {buildStudioNpc as buildCharacter} from '../../studio/npcs.js';
import { createNpcs } from '../../npcs_runtime.js';
import { createStations } from '../../stations.js';
import { createInteract } from '../../interact.js';
import { createChests } from '../../chests.js';
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
    panelCtx.stationAccess = id => !runtime.inDungeon && !!stations.nearest(rig.pos, undefined, id);

    // The boxes underground (D3): built here because every dependency is in
    // this hand already, and handed to the interactor so E and a click open them.
    const chests = createChests({
      character, inventory: pack, progression, combat: fight.combat, actor,
      hud, audio, floaters, runtime, loot: fight.loot, state,
    });
    // the story system is built after this one, so the interactor gets a getter
    // that finds it when a stone is touched, not the thing (S2)
    const later = (name) => () => (ctx.has(name) ? ctx.get(name) : null);
    const interact = createInteract({ sc, runtime, player: rig, state, hud, input, audio, progression, loot: fight.loot, monsters: fight.monsters, onMine: () => ctx.get('abilities').effects.swing(rig, {hands:2,seconds:.65}), chests, story: later('story'), character });
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
    const studioForage = createStudioForage(forage), pickForage = forage.pick.bind(forage);
    forage.pick = ray => { const near = studioForage.pick(ray), far = pickForage(ray); return near && (!far || near.distance < far.distance) ? near : far; };
    const foraging = createForaging({ field: forage, inventory: pack, progression, hud, audio, floaters, character, actor, combat: fight.combat });

    const unregisterPeople=runtime.physical?.registerActors('people',()=>npcs.list());
    const unregisterCreatures=runtime.physical?.registerActors('creatures',()=>fight.monsters.all());

    // the panels reach these through the one context, as they always did
    panelCtx.foraging = foraging;
    panelCtx.forage = forage;

    return {
      npcs, stations, interact, shop, forage, foraging, studioForage,
      dispose(){unregisterPeople?.();unregisterCreatures?.();studioForage.dispose();forage.dispose();stations.dispose();npcs.dispose();},
      bw: { npcs, stations, interact, chests, shop, forage, foraging, studioForage },
    };
  },

  update(ctx, frame) {
    const { npcs, stations, forage, interact, studioForage } = ctx.get('world_life');
    const pos = ctx.get('player').pos;
    // The people, the workshops and what grows are the world, so all four run
    // on the WORLD clock. `frame.worldDt` and `frame.worldNow` are the same
    // numbers as `dt` and `now` in ordinary time (app/context.js, app/system.js).
    const dt = frame.worldDt ?? frame.dt;
    const now = frame.worldNow ?? frame.now;
    const day = frame.worldNow != null ? ctx.get('world').dayFactor(now) : frame.day;
    npcs.update(dt, pos, day);
    stations.update(pos.x, pos.z, now);
    forage.update(pos.x, pos.z, seasonAt(Date.now()), now);   // one clock with harvest
    studioForage.update(dt,pos);
    interact.update(dt, now);
  },
};
