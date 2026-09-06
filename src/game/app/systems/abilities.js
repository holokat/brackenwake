// What the bars do: the twelve ability slots, the eight item slots, and every
// spark, burst and flinch either of them throws.

import * as THREE from 'three';
import { createEffects } from '../../effects.js';
import { createAbilities } from '../../abilities_runtime.js';
import { createSpellVfx } from '../../spell_vfx.js';
import { loadSpellTextures } from '../../vfx/textures.js';
import { moveInfo, abilityMoves } from '../../models.js';
import { createAbilityHooks } from '../../ability_hooks.js';
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

    // ------------------------------------------------------------ spells --
    //
    // The studio's spell effects, bridged onto this character's sockets and
    // this ability's clip events. `spell_vfx.js` is the only thing that knows
    // both halves; everything under `src/game/vfx/` is the studio's port and
    // knows nothing about Kaldera. docs/mmo/wiring/VFX1-SPELLS.md.
    //
    // A bolt should burn the ground it lands on, so the resolver below walks
    // the ray against the height field. It is called ONCE per release, not per
    // frame: twenty four steps over the flight is a metre of resolution at
    // spell range and costs nothing at that rate.
    const groundImpact = (origin, direction, distance, position, normal) => {
      const step = Math.max(0.35, distance / 24);
      const probe = new THREE.Vector3();
      for (let travelled = step; travelled <= distance; travelled += step) {
        probe.copy(origin).addScaledVector(direction, travelled);
        const ground = runtime.heightAt(probe.x, probe.z);
        if (!Number.isFinite(ground) || probe.y > ground) continue;
        position.copy(probe);
        position.y = ground;
        // The slope, from two samples a quarter metre apart. A bolt landing on
        // a hillside should scorch the hillside and not a level disc floating
        // through it.
        const dx = runtime.heightAt(probe.x + 0.25, probe.z) - runtime.heightAt(probe.x - 0.25, probe.z);
        const dz = runtime.heightAt(probe.x, probe.z + 0.25) - runtime.heightAt(probe.x, probe.z - 0.25);
        normal.set(-dx / 0.5, 1, -dz / 0.5).normalize();
        return true;
      }
      return false;
    };

    const spellVfx = createSpellVfx({
      body: rig.group,
      scene: sc.scene,
      moveInfo: (move) => moveInfo(rig.rig.modelId, move),
      abilityMoves: (id) => abilityMoves(rig.rig.modelId, id),
      resolveImpact: groundImpact,
    });
    // The flipbook atlases arrive after the first frame and are handed to a
    // fresh set of effects when they do. Until then the same effects run on
    // the untextured soft disc, which is why a missing atlas is a look and
    // never a crash. See vfx/textures.js.
    loadSpellTextures().then((textures) => {
      if (textures) spellVfx.setTextures(textures);
    }).catch(() => {});
    // The composer in scene.js runs only on the frames this says are live.
    sc.setSpellSource(() => ({ active: spellVfx.active, presentation: spellVfx.presentation() }));
    // a weapon's hit effect bursts where it landed, in its colour
    fight.combat.onHit?.(({ defender, colour, damage, fired }) => {
      if (!fired || !defender?.pos) return;
      effects.burst(defender.pos, colour, damage > 20 ? 1.4 : 1);
    });

    // THE FOUR HOOKS. `abilities_runtime` asks for `summon`, `allies`,
    // `resurrect` and `utility`, and this system used to pass none of them, so
    // six summons, Resurrect, Meditate, Camp, Transmute and Pick Pocket each
    // took their cost and said "that is not wired yet". `ability_hooks.js` is
    // the wire, and `scripts/audit-abilities.mjs` builds it out of the same
    // module with the same arguments so the harness cannot measure a kinder
    // version of the game than the one being played.
    const hooks = createAbilityHooks({
      character, actor, monsters: fight.monsters, combat: fight.combat,
      inventory: pack, hud, floaters, audio, player: rig,
      // who the summons pile onto: what you are swinging at, else what the
      // frame at the top of the screen is showing
      ownerTarget: () => fight.attacking?.actor || fight.targeting.current || null,
      // the dragon is an ally for a buff with a radius, and only while it is awake
      dragon: () => (ctx.has('dragon') && ctx.get('dragon').entity?.awake ? ctx.get('dragon').actor : null),
      inCombat: (who) => fight.combat.inCombat(who, ctx.frame?.now ?? 0),
      isDying: () => !!player.dying,
      wake: () => player.wake(),
      recompute: (who) => recompute(who || actor),
      rng: Math.random,
    });

    const runtimeAbilities = createAbilities({
      character, actor, input, combat: fight.combat, monsters: fight.monsters, targeting: fight.targeting,
      effects, floaters, hud, audio, spellVfx,
      player: rig, camera, progression,
      heightAt: (x, z) => runtime.heightAt(x, z),
      enabled: () => !ctx.get('ui').windows.anyOpen && !ctx.get('world_life').shop.isOpen && !ctx.get('dev').on && !player.dying,
      recompute: (who) => recompute(who || actor),
      rng: Math.random,
      // An item cost comes out of the REAL pack through the REAL remove, so the
      // bag redraws, the weight changes and the stack empties. Without this the
      // runtime falls back to editing the pack array in place, which is right
      // for a node fixture and would leave the open bag window showing a
      // bandage that is not there any more.
      spendFromPack: (where, n) => {
        const r = pack.remove(where, n);
        return r && r.ok ? r.removed : 0;
      },
      summon: hooks.summon,
      allies: hooks.allies,
      resurrect: hooks.resurrect,
      utility: hooks.utility,
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
      abilities: runtimeAbilities, effects, itemBar, hooks, spellVfx,
      bw: { abilities: runtimeAbilities, effects, itemBar, hooks, spellVfx, get summons() { return hooks.summons; } },
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
    const { abilities: runtimeAbilities, itemBar, hooks } = ctx.get('abilities');
    const input = ctx.input;
    // a held spell that Escape lets go must not also open the settings window
    const hadPending = !!runtimeAbilities.pending;
    runtimeAbilities.update(frame.dt, frame.nowS);
    if (hadPending && !runtimeAbilities.pending && input.pressed('escape')) input.swallow('escape');
    itemBar.update(frame.dt);

    // THE SUMMONS ARE ON THE WORLD'S CLOCK, and that is the one thing in this
    // system that is not on the player's. Everything above is the player's on
    // purpose (see the note over this function); a raised skeleton is a BODY IN
    // THE WORLD, walked by `monsters.update` and swinging through
    // `combat.queueSwing`, both of which are stamped off the world clock. Put
    // it on the player's and a summon in dragon time would take ten swings
    // while the wolf beside it took one, out of a queue the resolver would land
    // all at once when time came back. Meditate and Camp ride along on the
    // same call because they are worlds' seconds too: sitting still through a
    // slowed minute is a slowed minute of mana.
    hooks.update(frame.worldDt ?? frame.dt, frame.worldNow ?? frame.now, frame.nowS);
  },

  // `late` and not `update`, and that is the whole reason this line is here
  // rather than beside the runtime's own step: the spell effects read the
  // SOCKET BONES, and the socket bones are wherever the mixer and the gait
  // last put them. Stepped any earlier and a fireball would gather at the hand
  // the character had a frame ago.
  late(ctx, frame) {
    const self = ctx.get('abilities');
    self.effects.update(frame.dt);   // after the player's gait has posed the rig: the clips add to it
    self.spellVfx.update(frame.dt);
  },
};
