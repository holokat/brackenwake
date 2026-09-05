// The player: the body on the ground, the actor the resolver fights over, the
// lessons it learns, what it is wearing, the light it carries, and dying.
//
// The actor and the model share one position object, so they can never be in
// two places. Health, mana and stamina live on the actor during play and are
// copied back to the document before every save (syncToCharacter).

import * as THREE from 'three';
import { createPlayer } from '../../player.js';
import { playerActor as buildPlayerActor, recompute, tickPools, syncToCharacter } from '../../actor.js';
import { createProgression } from '../../progression.js';
import { dressRig } from '../../gear_visuals.js';

/** How long the death screen holds before you wake. 06-ECONOMY-UI: "a 5 second count". */
const DEATH_S = 5;
/** Health you wake with, as a fraction of the maximum. */
const WAKE_HEALTH = 0.5;

export const player = {
  name: 'player',
  deps: ['world'],

  create(ctx) {
    const { sc, state, hud, audio, floaters, camera, input, hudRoot, character } = ctx;
    const runtime = ctx.get('world').runtime;
    const heightAt = (x, z) => runtime.heightAt(x, z);

    // the body is built from the chosen appearance; an old save without one gets the house default
    const rig = createPlayer(sc.scene, character.appearance);
    // First boot: no site stands within the streamed ring of the origin, so a new
    // player would face empty meadow with nowhere to walk to. Spawn instead a
    // short walk outside the nearest settlement, on the side facing the origin.
    let faceTo = null;
    if (!state.pos.x && !state.pos.z) {
      const towns = runtime.sitesNear(0, 0, 4000).filter((s) => s.kind === 'town' || s.kind === 'hamlet')
        .sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
      if (towns.length) {
        const t = towns[0];
        const d = Math.hypot(t.x, t.z) || 1;
        const off = t.flatR + 22;
        state.setPos(t.x - (t.x / d) * off, t.z - (t.z / d) * off);
        faceTo = t;
        hud.toast(`you wake a short walk from <b>${t.name}</b>, ${t.article}`);
      }
    }
    rig.teleport(state.pos.x || 0, state.pos.z || 0, heightAt);
    const spawnPoint = { x: rig.pos.x, z: rig.pos.z };
    // A lantern's worth of warm light rides at the shoulder and comes up as the
    // day goes down, so the character is never a black cutout against a moonlit
    // field. Off by day, full at midnight.
    const lantern = new THREE.PointLight(0xffc082, 0, 9, 2);
    lantern.position.set(0.35, 1.7, 0.25);
    lantern.name = 'lantern';
    rig.group.add(lantern);

    // the kit is chosen from where you actually woke up, not from the origin
    audio.music.setBiome(runtime.field.sampleAt(rig.pos.x, rig.pos.z).biome);
    audio.music.start();

    // the first thing a new player sees is the settlement, not its back
    if (faceTo) camera.yaw = Math.atan2(faceTo.x - rig.pos.x, faceTo.z - rig.pos.z);
    camera.snap?.(rig.pos);            // start on the orbit, not flying in to it

    const actor = buildPlayerActor(character, { pos: rig.pos });
    // gains go to the ticker bottom right when the HUD has one, so they never
    // sit over the label of what you just picked up; everything else floats
    const gainFloaters = {
      spawn: (pos, text, kind, extra) => (kind === 'gain' || kind === 'stat') && typeof hud.gain === 'function'
        ? hud.gain(text, kind) : floaters.spawn(pos, text, kind, extra),
      get count() { return floaters.count; },
    };
    const progression = createProgression({ character, actor, floaters: gainFloaters, hud, audio, state });
    // combat.js teaches by actor: (who, skill, difficulty, success). Only the
    // player has a document to learn into; a skeleton is never taught.
    const teach = {
      lesson: (who, skill, difficulty, success) => (who === actor ? progression.lesson(skill, difficulty, success) : null),
      statLesson: (who, stat) => (who === actor ? progression.statLesson(stat) : null),
    };

    // what is worn is on the body: the weapon in the right hand, the shield on
    // the left, every armour piece on its slot. The bow is drawn when the main
    // hand is empty and a bow is in the ranged slot, which is the same rule the
    // ranged abilities use.
    const dress = () => dressRig(rig, character.equipment, { ranged: !character.equipment.mainHand && !!character.equipment.ranged });

    // docs/mmo/wiring/W5.md section 6. Drag inversion and sensitivity are
    // applied to input.drag before the camera reads it, each frame, from
    // character.settings.
    function shapeDrag() {
      const st = character.settings || {};
      const k = Number.isFinite(st.sensitivity) ? st.sensitivity : 1;
      if (input.drag) {
        input.drag.dx *= k;
        input.drag.dy *= k * (st.invertDrag ? -1 : 1);
      }
    }

    // -------------------------------------------------------------- death --
    // Red vignette, the words, a five second count, then you wake at the
    // nearest settlement with everything you carried. 06-ECONOMY-UI.md.
    let dying = null;
    const deathEl = document.createElement('div');
    deathEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;'
      + 'background:radial-gradient(ellipse at center, rgba(90,0,0,.35) 0%, rgba(40,0,0,.85) 100%);color:#f4f1ea;'
      + 'font:700 42px/1.2 "Segoe UI",system-ui,sans-serif;text-shadow:0 2px 8px #000;z-index:40;pointer-events:none';
    deathEl.innerHTML = '<div>You have died.</div><div class="bw-count" style="font-size:22px;margin-top:14px;opacity:.85"></div>';
    hudRoot.appendChild(deathEl);

    /** combat.js found the player at zero. The count starts here. */
    function die(killer) {
      if (dying) return;
      dying = { left: DEATH_S, killer };
      ctx.get('abilities').effects.die(rig);
      deathEl.style.display = 'flex';
      const by = killer?.name ? ` The ${killer.name} did it.` : '';
      hud.log(`You have died.${by}`, 'bad');
    }

    function teleport(x, z) {
      rig.teleport(x, z, heightAt);
      camera.snap?.(rig.pos);
    }

    function wake() {
      const world = ctx.get('world');
      const { combat, monsters } = ctx.get('combat');
      const town = world.nearestSettlement();
      const p = rig.pos;
      let x = p.x, z = p.z;
      if (town) {
        const d = Math.hypot(town.x - p.x, town.z - p.z) || 1;
        const off = (town.flatR || 26) + 10;
        x = town.x + ((p.x - town.x) / d) * off;
        z = town.z + ((p.z - town.z) / d) * off;
      }
      if (runtime.inDungeon) runtime.leaveDungeon();
      teleport(x, z);
      state.setPos(x, z);
      actor.health = Math.max(1, Math.round(actor.maxHealth * WAKE_HEALTH));
      // combat.kill latched this; without clearing it a second death never
      // fired onDeath and the death screen never came back (found by D1)
      actor.dead = false;
      actor.status = {};
      actor.dots = [];
      combat.forget(actor);
      monsters.rescan(x, z, ctx.isNight(performance.now()));
      deathEl.style.display = 'none';
      dying = null;
      const where = town ? `at the edge of <b>${town.name}</b>` : 'where you fell';
      hud.toast(`You wake ${where}, with ${actor.health} of ${actor.maxHealth} health and everything you carried.`, 'good');
      hud.log(`You wake ${town ? `at ${town.name}` : 'where you fell'}, ${actor.health} of ${actor.maxHealth} health.`);
    }

    return {
      rig, actor, progression, teach, spawnPoint, dress, wake, die, teleport, shapeDrag,
      get pos() { return rig.pos; },
      get yaw() { return rig.yaw; },
      get dying() { return dying; },

      /** Where the world streams from, and where the ear is. */
      eye() { return ctx.get('dev').on ? sc.camera.position : rig.pos; },

      /** The one place that says who is walking this frame. */
      walk(frame) {
        const dev = ctx.get('dev');
        if (dev.on) { dev.fly(frame.dt); return; }
        const { dt, now, nowS } = frame;
        const { combat } = ctx.get('combat');
        const abilities = ctx.get('abilities').abilities;
        const move = dying ? { x: 0, z: 0, sprint: false, jump: false, yaw: camera.forwardYaw } : {
          x: (input.down('d') ? 1 : 0) - (input.down('a') ? 1 : 0),
          z: (input.down('w') ? 1 : 0) - (input.down('s') ? 1 : 0),
          sprint: input.down('shift'),
          jump: input.down(' '),
          yaw: camera.forwardYaw,
        };
        rig.update(dt, move, heightAt);
        // a landing is one frame: fall damage through the resolver, and Leap
        // Slam comes down where the feet do
        if (rig.landed) {
          combat.applyFall(actor, rig.landed.fallMetres, now);
          abilities.onLanded(nowS, rig.landed.fallMetres);
          if (rig.landed.fallMetres > 4) audio.play('land', { at: { x: rig.pos.x, z: rig.pos.z } });
        }
        ctx.get('world').keepInside(rig.pos, now);
        shapeDrag();
        camera.update(dt, rig.pos, heightAt);
        ctx.get('world').clampCamera(rig.pos);
        state.setPos(rig.pos.x, rig.pos.z);
      },

      /** The count on the death screen, and the waking at the end of it. */
      tickDeath(dt) {
        if (!dying) return;
        dying.left -= dt;
        const c = deathEl.querySelector('.bw-count');
        if (c) c.textContent = dying.left > 0 ? `You wake in ${Math.ceil(dying.left)}` : 'waking';
        if (dying.left <= 0) wake();
      },

      lantern,
      bw: {
        player: rig, actor, progression, dress, wake,
        get playerActor() { return actor; },
        get dying() { return dying; },
        recompute, tickPools, syncToCharacter,
      },
    };
  },

  // A save written mid death (health 0, no count running) comes back as a
  // corpse that cannot fight or die again. Wake it at once.
  ready(ctx) {
    const self = ctx.get('player');
    if (self.actor.health <= 0) {
      ctx.hud.log('You were dead when the world came back.');
      self.wake();
    }
  },

  move(ctx, frame) {
    const self = ctx.get('player');
    self.walk(frame);
    // by night, and underground at any hour: a dungeon is as dark as midnight
    // and the player was a silhouette in it
    const underground = ctx.get('world').runtime.inDungeon;
    self.lantern.intensity = underground ? 14 : Math.max(0, 1 - frame.day / 0.6) * 14;
  },

  late(ctx, frame) {
    const self = ctx.get('player');
    const { combat } = ctx.get('combat');
    tickPools(self.actor, frame.dt, combat.inCombat(self.actor, frame.now));
    self.tickDeath(frame.dt);
  },

  save(ctx) { syncToCharacter(ctx.get('player').actor); },
};
