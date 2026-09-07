// The Greenwold's story, in the frame: the named people, the first hour, and
// the waystones.
//
// `src/mmo/story.js` is the cast and the script, `src/game/story_runtime.js` is
// the part a player meets, `src/game/waystones.js` is the fast travel. This
// file is the wiring and nothing else, and it is the only place any of the
// three touches the running game. `docs/mmo/wiring/S2.md` is the map.
//
// WHY IT RUNS AFTER dragon AND BEFORE ui. It reads three things another system
// settled this frame: the townsfolk it puts names on are restreamed in
// `world_life.update`, the Tithe Wagon's position is `events.update`'s, and the
// dragon's own frame has already run, so `dragon.grant` grows the animal and
// `ui.late` draws the Bond arc and the thirteenth cell in the same frame the
// gift lands. Anything earlier would name a person who is not standing yet, see
// the wagon a frame late, and light the Wyrmsoul cell a frame after that.
//
// THE CLICK. This system takes the click BEFORE `input`, because the six named
// people are bodies `input.route` has never heard of and a person in front of a
// house should take the click. It refuses the click in exactly the cases the
// router would want it: a held spell is choosing a victim, and a window is
// open, and neither of those is a conversation.

import { createStory } from '../../story_runtime.js';
import { createWaystones, waystonesFrom, panel as waystonePanel } from '../../waystones.js';
import { authoredSites } from '../../../world/zones.js';
import { spaceStoneRows } from '../../../mmo/greenwold/places.js';
import { createChapelEncounter } from '../../../mmo/greenwold/chapel_encounter.js';
import {buildStudioNpc as buildCharacter} from '../../studio/npcs.js';
import {createStrongholdEncounters} from '../../stronghold_encounters.js';

export const story = {
  name: 'story',
  deps: ['world', 'player', 'combat', 'world_life', 'events', 'dragon', 'ui'],

  create(ctx) {
    const { sc, hud, audio, state, character, hudRoot, camera } = ctx;
    const world = ctx.get('world');
    const runtime = world.runtime;
    const player = ctx.get('player');
    const fight = ctx.get('combat');
    const life = ctx.get('world_life');
    const face = ctx.get('ui');
    const dragonOf = () => ctx.get('dragon')?.dragon || null;

    // The sixteen stones, worked out once off the site rows. They do not move.
    const generatedStones = waystonesFrom(authoredSites());
    const sculptStones = spaceStoneRows();
    const stones = () => runtime.field.sculpt ? sculptStones : generatedStones;

    /**
     * The five things a warp is, in the order `win_dev.warp` does them, so a
     * stone puts you down as completely as the bench does: out of any dungeon
     * first, the feet, the camera, the document, and the world swept for what
     * should be standing around the new spot.
     */
    function teleport(x, z, label) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
      if (runtime.inDungeon && typeof runtime.leaveDungeon === 'function') runtime.leaveDungeon();
      player.teleport(x, z);
      camera?.snap?.(player.pos);
      state?.setPos?.(x, z);
      fight.monsters?.rescan?.(x, z, world.dayFactor(ctx.frame.worldNow ?? ctx.frame.now) < 0.4);
      fight.combat?.forget?.(player.actor);
      life.forage?.update?.(x, z);
      return true;
    }

    const waystones = createWaystones({
      character,
      stones,
      hud, audio,
      dragon: dragonOf,
      teleport,
      pos: () => player.pos,
      now: () => ctx.frame.now,
    });

    const story = createStory({
      character, runtime, hud, scene: sc.scene, camera: sc.camera,
      npcs: life.npcs,
      dragon: dragonOf,
      events: () => ctx.get('events').events,
      waystones,
      realmAt: () => (runtime.inDungeon
        ? (world.lastInside?.site?.realm || null)
        : (runtime.field.sampleAt(player.pos.x, player.pos.z).realm || null)),
      pos: () => player.pos,
      dayFactor: () => world.dayFactor(ctx.frame.worldNow ?? ctx.frame.now),
      root: hudRoot,
      buildCharacter,
    });

    // Two beats hang off a death. `combat.onDeath` takes as many listeners as
    // it is given and hands back the unsubscribe, and this system is built
    // after combat, so it holds the wire (R1.md, "wiring late").
    this._offDeath = fight.combat?.onDeath?.((who) => {
      if (who === player.actor) return;
      const mon = fight.monsters.forActor(who);
      if (mon?.id) story.onDeath(mon.id);
    }) || null;

    // The picker is a window of this system's own, registered here rather than
    // in ui.js: ui is built first and cannot hold a wire to a panel that does
    // not exist yet, and `windows.register` is the whole of what it takes.
    face.windows.register(waystonePanel);
    face.panelCtx.waystones = waystones;
    face.panelCtx.story = story;

    /**
     * A hand on the stone in front of you. One gesture, two answers: a stone
     * you do not hold becomes yours and says so, and a stone you already hold
     * opens the picker with itself as the door you are leaving by.
     */
    function touchStone(opts = {}) {
      const before = waystones.count;
      const res = waystones.touch(opts.stone || null, opts);
      if (res.ok || waystones.count > before) {
        // the first stone is a beat, and it should not wait a quarter second
        story.checkBeats(ctx.frame.now, true);
        return res;
      }
      if (res.reason === 'already') {
        face.windows.open('waystones', { from: res.stone.id });
        return { ...res, opened: true };
      }
      return res;
    }

    const chapel=createChapelEncounter({field:runtime.field,character,monsters:fight.monsters,loot:fight.loot,hud,now:()=>ctx.frame.worldNow??ctx.frame.now});
    this._chapel=chapel;
    const strongholds=createStrongholdEncounters({character,combat:fight.combat,monsters:fight.monsters,hud,root:hudRoot,state});
    this._strongholds=strongholds;
    const ringChapelBell=()=>{const r=chapel.ring();if(r.ok)story.ringChapelBell();return r;};
    return { story, chapel, strongholds, ringChapelBell, waystones, get stones() { return stones(); }, teleport, touchStone, bw: { story, chapel, strongholds, ringChapelBell, waystones, get stones() { return stones(); }, touchStone } };
  },

  /**
   * A click on one of the named six, or a hand on a waystone.
   *
   * The stone is picked through `runtime.pick`, which carries `waystone: true`
   * off the mesh's own `userData` (T1.md, wiring 1). Until `interact.js` has
   * S2's own line, this is the whole of what makes a stone answer a click.
   */
  click(ctx, ray) {
    if (ctx.get('dev').on || ctx.get('player').dying) return false;
    if (ctx.get('ui').windows.anyOpen) return false;
    if (ctx.get('abilities').abilities.pending) return false;      // a held spell is choosing a victim
    const self = ctx.get('story');
    const windows = ctx.get('ui').windows;
    const who = self.story.click(ray, ctx.get('player').pos, windows);
    if (who) return who;
    const hit = ctx.get('world').runtime.pick?.(ray);
    if (hit?.waystone) return self.touchStone();
    return false;
  },

  update(ctx, frame) {
    const self = ctx.get('story');
    self.story.update(frame.worldDt ?? frame.dt, frame.worldNow ?? frame.now);
    self.chapel.update(frame.worldNow ?? frame.now);
    self.strongholds.update(frame.dt,ctx.get('player').pos,{hidden:ctx.get('ui').windows.anyOpen||ctx.get('dev').on,inDungeon:ctx.get('world').runtime.inDungeon,sculpt:ctx.get('world').runtime.field.sculpt});
  },

  save(ctx) {
    // `character.story` and `character.waystones` are written in place by the
    // two runtimes, so there is nothing to copy out; this is the touch that
    // tells the save layer they moved.
    ctx.state?.touch?.('story');
  },

  dispose() { this._offDeath?.(); this._offDeath = null; this._chapel?.dispose(); this._chapel=null; this._strongholds?.dispose(); this._strongholds=null; },
};

export default story;
