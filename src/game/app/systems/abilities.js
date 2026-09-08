import {createGameEnchantments} from '../../studio/enchantments.js';
import {createStudioSpells} from '../../studio/spells.js';
// What the bars do: the twelve ability slots, the eight item slots, and every
// spark, burst and flinch either of them throws.

import * as THREE from 'three';
import { createEffects, colourFor } from '../../effects.js';
import { birthplaceFor } from '../../../world/zones.js';
import { createAbilities } from '../../abilities_runtime.js';
import { createSpellVfx } from '../../spell_vfx.js';
import { loadSpellTextures } from '../../vfx/textures.js';
import { moveInfo, abilityMoves } from '../../models.js';
import { createAbilityHooks } from '../../ability_hooks.js';
import { createItemBar } from '../../item_bar.js';
import { setBarSlot, swapBarSlots, barHand } from '../../win_abilities.js';
import { recompute } from '../../actor.js';

/** How often a mote leaves a buffed body, and how far out it circles. */
export const AURA_EVERY_S = 0.09;
export const AURA_R = 0.55;

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
    // knows nothing about Brackenwake. docs/mmo/wiring/VFX1-SPELLS.md.
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

    const legacySpellVfx = createSpellVfx({
      body: rig.group,
      scene: sc.scene,
      // the code body has no socket bones: the rig's anchors stand in, so the
      // effects gather in the hand and not at a fixed point on the chest
      anchors: rig.parts ? {
        Socket_HandVFX_Right: rig.parts.handR, Socket_HandVFX_Left: rig.parts.handL,
        Socket_Weapon_Right: rig.parts.handR, Socket_Weapon_Left: rig.parts.handL,
        Socket_HeadVFX: rig.parts.head, Socket_RootVFX: rig.parts.hips,
        Socket_FootVFX_Left: rig.parts.footL, Socket_FootVFX_Right: rig.parts.footR,
      } : null,
      moveInfo: (move) => moveInfo(rig.rig.modelId, move),
      abilityMoves: (id) => abilityMoves(rig.rig.modelId, id),
      resolveImpact: groundImpact,
    });
    const spellVfx=createStudioSpells(legacySpellVfx,rig);
    const enchantments=createGameEnchantments(sc.scene,rig,actor);
    const removeStrike=fight.combat.onStrike?.(info=>enchantments.impact(info));
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
      // MP1: the other players in the room; the net system is built after this one, so it is asked for at call time
      others: () => (ctx.has('net') ? ctx.get('net').others() : []),
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
      onAllyEffect: (who, payload) => { if (ctx.has('net')) ctx.get('net').sendEffect(who, payload); },
      resurrect: hooks.resurrect,
      utility: {
        ...hooks.utility,
        // Recall: the world's birth, which on the island is Haven's green
        recall: () => {
          const birth = birthplaceFor(runtime.field);
          player.teleport(birth.x, birth.z);
          return 'The road folds up under you, and you are on the green at Haven.';
        },
      },
      // an armed shot with a chosen target starts the auto attack on it
      attack: (who) => {
        const mon = fight.monsters.forActor?.(who);
        if (!mon) return false;
        if (fight.attacking && fight.attacking.actor === who) return true;
        fight.startAttack(mon);
        return true;
      },
      onMark: (target, mark) => markBadges.on(target, mark),
    });

    // ---- the mark badge -----------------------------------------------------
    //
    // A red chevron over a marked body, parented to the body's own group so it
    // walks where the body walks: the cast's accent icon stood where the target
    // WAS at the cast and the creature walked out from under it. Taken down
    // when the mark runs out, or the body dies, or the body is gone.
    const markBadges = (() => {
      const live = new Map();          // actor -> { sprite, until, mon }
      let texture = null;
      const textureOnce = () => {
        if (texture || typeof document === 'undefined') return texture;
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const g = canvas.getContext('2d');
        if (!g) return null;
        g.lineWidth = 6; g.lineJoin = 'round';
        g.strokeStyle = '#fff2e6'; g.fillStyle = '#e8322a';
        g.beginPath(); g.moveTo(10, 10); g.lineTo(54, 10); g.lineTo(32, 56); g.closePath();
        g.stroke(); g.fill();
        texture = new THREE.CanvasTexture(canvas);
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      };
      return {
        on(target, mark) {
          const mon = fight.monsters.forActor?.(target);
          const group = mon && mon.model && mon.model.group;
          if (!group) return false;
          const have = live.get(target);
          if (have) { have.until = mark.until; return true; }
          const tex = textureOnce();
          if (!tex) return false;
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
          sprite.name = 'mark-badge';
          sprite.scale.set(0.42, 0.42, 1);
          sprite.position.set(0, (mon.model.height || 1.8) + 0.45, 0);
          sprite.renderOrder = 998;
          group.add(sprite);
          live.set(target, { sprite, until: mark.until, mon });
          return true;
        },
        update(nowS) {
          for (const [target, b] of live) {
            const gone = target.health <= 0 || target.dead === true || (Number.isFinite(b.until) && nowS >= b.until) || !b.sprite.parent;
            if (!gone) { b.sprite.position.y = (b.mon.model?.height || 1.8) + 0.45 + Math.sin(nowS * 3) * 0.04; continue; }
            b.sprite.removeFromParent();
            b.sprite.material.dispose();
            live.delete(target);
          }
        },
        get count() { return live.size; },
      };
    })();

    // the item bar: eight slots on F5 to F12 for potions, food, weapons and
    // tools, kept apart from the ability bar so a sword and a spell never share
    // a key. Since T3 it is also where a tool is CHOSEN: there is no tool row,
    // and a slot holding a pickaxe answers its key by becoming the pickaxe that
    // `toolFor` reaches for first. No setTool hook, because there is no hand to
    // put anything into.
    const itemBar = createItemBar({
      character, inventory: pack, input, hud,
      useItem: (item, where) => ctx.get('ui').panelCtx.useItem(item, where),
      enabled: () => !ctx.get('ui').windows.anyOpen && !player.dying,
    });
    hud.onItem?.((slot, how) => (how === 'clear' ? itemBar.clear(slot) : itemBar.use(slot)));
    hud.onItemDrop?.((slot, payload) => itemBar.assign(slot, payload));

    // THE ABILITY BAR TAKES CARDS FROM THE ABILITIES PAGE (2026-09-08). A card
    // dragged onto a cell, a card in hand and a click on a cell, a right click
    // to empty a cell: all three write character.bar through setBarSlot and
    // say what happened, because a silent bar is a broken bar. A plain click
    // on a filled cell with nothing in hand uses the ability, as its key would.
    const clock = { now: 0 };
    const sayBar = (res) => { if (res && res.reason) hud.log?.(res.reason, res.ok ? undefined : 'bad'); };
    hud.onAbilityDrop?.((slot, payload) => {
      if (!payload) return;
      if (Number.isInteger(payload.barSlot)) sayBar(swapBarSlots(character, payload.barSlot, slot));
      else if (payload.ability) sayBar(setBarSlot(character, slot, payload.ability));
    });
    hud.onBarClear?.((slot) => sayBar(setBarSlot(character, slot, null)));
    hud.onBar?.((slot, empty) => {
      if (barHand.id) { barHand.place(slot); return; }
      if (empty) { hud.log?.(`Slot ${slot + 1} is empty. Drag an ability onto it from the Abilities page.`, 'bad'); return; }
      runtimeAbilities.use(slot, clock.now);
    });

    return {
      abilities: runtimeAbilities, effects, itemBar, hooks, spellVfx, enchantments, markBadges, clock,
      dispose(){removeStrike?.();enchantments.dispose();spellVfx.dispose();effects.dispose?.();hooks.dispose?.();},
      bw: { abilities: runtimeAbilities, effects, itemBar, hooks, spellVfx, enchantments, markBadges, get summons() { return hooks.summons; } },
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
    const { abilities: runtimeAbilities, itemBar, hooks, clock } = ctx.get('abilities');
    const input = ctx.input;
    if (clock) clock.now = frame.nowS;
    // a held spell that Escape lets go must not also open the settings window
    const hadPending = !!runtimeAbilities.pending;
    runtimeAbilities.update(frame.dt, frame.nowS);
    if (hadPending && !runtimeAbilities.pending && input.pressed('escape')) input.swallow('escape');
    itemBar.update(frame.dt);

    // THE BUFF STAYS ON THE BODY (2026-09-08, the user: "keep the effect on the
    // person for as long as the buff remains"). The cast's own visual is over
    // in two seconds; from then until the buff runs out, a slow ring of motes
    // in the ability's colour circles the player, one buff at a time round
    // the ring so three blessings read as three colours and not a cloud.
    const { effects } = ctx.get('abilities');
    const { rig, actor: me } = ctx.get('player');
    rig.studio?.setHidden?.(!!me?.hidden);
    const live = (Array.isArray(me?.buffs) ? me.buffs : []).filter((b) => b.kind === 'buff' && b.until > frame.nowS && !b.channelled);
    if (live.length && rig?.pos && frame.nowS - (clock.aura || 0) >= AURA_EVERY_S) {
      clock.aura = frame.nowS;
      clock.auraTurn = ((clock.auraTurn || 0) + 1) % live.length;
      const b = live[clock.auraTurn];
      const a = frame.nowS * 2.2 + clock.auraTurn * 2.1;
      effects.emit(rig.pos.x + Math.cos(a) * AURA_R, rig.pos.y + 0.35 + Math.random() * 1.2, rig.pos.z + Math.sin(a) * AURA_R,
        colourFor(b.abilityId), 1, 0.12, 0.25, 1.1, 0.7, 0.3);
    }

    // THE SUMMONS ARE ON THE WORLD'S CLOCK, and that is the one thing in this
    // system that is not on the player's. Everything above is the player's on
    // purpose (see the note over this function); a raised skeleton is a BODY IN
    // THE WORLD, walked by `monsters.update` and swinging through
    // `combat.queueSwing`, both of which are stamped off the world clock. Put
    // it on the player's and a summon in slow time would take ten swings
    // while the wolf beside it took one, out of a queue the resolver would land
    // all at once when time came back. Meditate and Camp ride along on the
    // same call because they are worlds' seconds too: sitting still through a
    // slowed minute is a slowed minute of mana.
    hooks.update(frame.worldDt ?? frame.dt, frame.worldNow ?? frame.now, frame.nowS);
    ctx.get('abilities').markBadges.update(frame.nowS);
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
    self.enchantments.update(frame.dt,frame.nowS);
  },
};
