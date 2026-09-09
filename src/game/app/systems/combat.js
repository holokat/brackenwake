// The fight: the resolver, the monsters that queue swings into it, the sacks
// they leave, what the cursor is looking at, and the auto attack that keeps
// swinging until one of you is down.

import { spawnMonster, recompute } from '../../actor.js';
import { createCombat } from '../../combat.js';
import { createLootDrops } from '../../loot_drops.js';
import { createMonsters } from '../../monsters.js';
import { createTargeting } from '../../targeting.js';
import { createTargetRing } from '../../target_ring.js';

/** Past this the fight is called off: it walked away and so did you. */
const ATTACK_LEASH = 30;

export const combat = {
  name: 'combat',
  deps: ['world', 'player'],

  create(ctx) {
    const { sc, hud, audio, floaters, input, character } = ctx;
    const runtime = ctx.get('world').runtime;
    const { rig, actor, teach, spawnPoint } = ctx.get('player');

    // Each nearby spawn requests its own rig through the shared asset scheduler.
    // Unvisited dungeon bosses do not compete with the player and current area.

    const combatRules = createCombat({ floaters, hud, audio, progression: teach, recompute });
    const loot = createLootDrops(sc, { floaters, hud, audio });
    const monsters = createMonsters(sc, runtime, {
      // W2 calls actorFactory(id, { pos, key, row, rec }); W1's builder takes (id, pos)
      actorFactory: (id, o) => spawnMonster(id, o.pos),
      combat: combatRules, loot, floaters, hud, audio,
      deadUntil: character.deadUntil,
      character,                            // L1: the class the drops steer toward
      spawnPoint,
    });

    const targetRing = createTargetRing(sc);
    // Auto attack, the UO way: a single click on a monster looks at it, a
    // double click fights it until it or you is down, or you click the ground.
    let attacking = null;
    const targeting = createTargeting(sc, input, monsters, {
      self: actor, hud,
      pos: () => rig.pos,
      yaw: () => rig.yaw,
      clearOnMiss: true,
    });

    // The death hook is registered here rather than by the player, because the
    // player system is built first and cannot hold a wire to this one.
    combatRules.onDeath((who, killer) => {
      if (who !== actor) {
        const m = monsters.forActor(who);
        if (m?.model) ctx.get('abilities').effects.die(m.model);
        return;
      }
      ctx.get('player').die(killer);
    });

    let lastHealth = actor.health;
    let lastReachLine = -1e9;

    function startAttack(mon) {
      if (attacking?.actor === mon.actor) return;
      attacking = mon;
      hud.log(`You attack the ${mon.name}.`, 'good');
      hud.setHint?.(`fighting the ${mon.name}`);
    }
    function stopAttack(why) {
      if (!attacking) return;
      const name = attacking.name;
      attacking = null;
      hud.setHint?.('');
      if (why) hud.log(`You stop fighting the ${name}: ${why}.`);
    }
    function swingAt(target, now, nowS, sayReach) {
      const abilities = ctx.get('abilities').abilities;
      const effects = ctx.get('abilities').effects;
      const extra = abilities.takeNextSwing(nowS) || {};
      // swingAt is queueSwing with the monster's weaknesses folded in
      const r = monsters.swingAt(actor, target, { now, jumpAttack: rig.airborne, ...extra });
      if (r && r.queued) {
        // the arm goes through: a plain swing is animated like an ability's
        effects.swing(rig, { hands: actor.weapon?.hands ?? 1 });
        if (attacking) hud.setHint?.(`fighting the ${attacking.name}`);
      } else if (r && !r.queued && r.reason === 'out_of_reach') {
        if (attacking) hud.setHint?.(`too far from the ${attacking.name}, walk closer`);
        if (sayReach || now - lastReachLine > 2500) {
          lastReachLine = now;
          hud.log(`${attacking?.name || 'It'} is ${Math.round(r.dist)} m off, walk closer`);
        }
      }
      return r;
    }
    /** Each frame: swing at the fight, and let it go when it is over. */
    function updateAttack(now, nowS) {
      if (!attacking || ctx.get('player').dying) return;
      const t = attacking.actor;
      if (!t || t.health <= 0) { const n = attacking.name; attacking = null; hud.setHint?.(''); hud.log(`The ${n} is down.`, 'good'); return; }
      if (Math.hypot(t.pos.x - rig.pos.x, t.pos.z - rig.pos.z) > ATTACK_LEASH) return stopAttack('it is too far away');
      if (targeting.current !== t) targeting.set?.(t, 'attack');
      swingAt(t, now, nowS, false);
    }

    return {
      combat: combatRules, monsters, loot, targeting, targetRing,
      startAttack, stopAttack, swingAt,
      get attacking() { return attacking; },
      bw: {
        combat: combatRules, loot, monsters, targeting, targetRing, spawnMonster, stopAttack,
        // the same auto attack a double click starts, for the bench and the tests
        startAttack: (mon) => (mon && mon.actor ? startAttack(mon) : undefined),
        get attacking() { return attacking; },
      },

      /**
       * THE TWO CLOCKS, and this is the joint they turn on.
       *
       *   monsters.update      the WORLD clock. Their walking, their swings,
       *                        their shots and their cast bars all hang.
       *   combatRules.update   the WORLD clock, and that is what makes slow
       *                        time work. `queueSwing` stamps a job with
       *                        `now + SWING_LAND_S` off whatever clock the
       *                        QUEUER used: a monster queues on the world clock
       *                        (it is called from inside monsters.update, which
       *                        was handed the world clock), the player queues on
       *                        the player clock through `swingAt` below. One
       *                        pending list, driven by the world clock, so a
       *                        monster's blow lands on its own time and the
       *                        player's blows pile up until the end pulse pays
       *                        the clock back and they all land at once, in
       *                        order. That IS "everything you touched happens
       *                        at once", and it needed no line in combat.js.
       *   targeting.update     the PLAYER's clock: the cursor is the player's.
       *   updateAttack         the PLAYER's clock: the auto attack's rhythm is
       *                        the player's own swing timer, at full speed.
       *   loot.update          the WORLD clock: a sack ages with the world.
       *
       * `night` is read off the world clock too, so a dusk that is hanging does
       * not spawn a wolf a second early.
       */
      run(frame) {
        const { dt, now, nowS } = frame;
        const worldDt = frame.worldDt ?? dt;
        const worldNow = frame.worldNow ?? now;
        const night = frame.worldNow != null ? ctx.isNight(worldNow) : frame.night;
        // the fight: monsters queue, combat resolves, the bar reacts
        monsters.update(worldDt, worldNow, actor, night);
        combatRules.update(worldDt, worldNow);
        if (actor.health < lastHealth) {
          const { abilities, effects } = ctx.get('abilities');
          abilities.onDamaged(lastHealth - actor.health, nowS);
          effects.flinch(rig);
        }
        lastHealth = actor.health;
        targeting.update(dt);
        updateAttack(now, nowS);
        loot.update(worldDt);
      },

      ring(dt) {
        const runtimeWorld = ctx.get('world').runtime;
        const ringTarget = attacking?.actor || targeting.current;
        targetRing.update(dt, ringTarget, !!attacking, ringTarget ? runtimeWorld.heightAt(ringTarget.pos.x, ringTarget.pos.z) : 0);
      },
    };
  },

  update(ctx, frame) { ctx.get('combat').run(frame); },
  late(ctx, frame) { ctx.get('combat').ring(frame.dt); },
};
