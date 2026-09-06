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
// WYRMSOUL LIVES HERE TOO (D2). The rules are `src/game/wyrmsoul.js`, pure and
// testable on their own; the pictures are `src/game/wyrmsoul_visuals.js`; the
// arc, the thirteenth cell and the amber shell are `hud.js`. This file is the
// only place any of the three touches the running game, and it is the only
// place the world clock is ever slowed. docs/mmo/wiring/D2.md is the map.

import { createDragon } from '../../dragon.js';
import { buildDragon, preloadDragonModel, DRAGON_MODEL_ID } from '../../dragon_models.js';
import { stepToward } from '../../monsters.js';
import { panel as dragonPanel } from '../../win_dragon.js';
import { WYRMSOUL_KEY } from '../../hud.js';
import { BAR_KEYS } from '../../abilities_runtime.js';
import { createWyrmsoulVisuals } from '../../wyrmsoul_visuals.js';
import * as W from '../../wyrmsoul.js';

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

    // The studio hatchling. Nothing else in the tree fetches it: the player
    // system preloads the human bodies and the combat system the monsters, and
    // dragon-hatchling is on neither list, so without this line `buildDragon`
    // would find an empty cache every time and the file would be 8 MB nobody
    // ever asked for. The entity is already built by now, so the body it is
    // holding is the code one; `rebuildBody` swaps it when the file lands and
    // puts the state it was in straight back on.
    preloadDragonModel().then(() => entity.rebuildBody()).catch((err) => {
      console.warn(`dragon: ${DRAGON_MODEL_ID} would not load, the code body stands in`, err && err.message);
    });

    // It cannot die. combat.js is the one place a thing dies, so this is the
    // one place that is told, and what it does about it is a fall.
    fight.combat.onDeath((who, killer) => {
      if (who !== entity.actor) return;
      entity.fall(killer);
    });

    // =======================================================================
    // Wyrmsoul
    // =======================================================================
    //
    // Everything below is D2. The rules it asks are pure functions in
    // `wyrmsoul.js`; the numbers it writes are said out loud where it writes
    // them; and the one thing it does that nothing else in the game does is
    // slow `ctx.clock`, which is what every other system reads its `worldDt`
    // and `worldNow` from.

    const { hud: face, audio, input, camera, sc: scene3 } = ctx;
    const visuals = createWyrmsoulVisuals(sc, rig);
    let soul = W.blankWyrmsoul(entity.record);
    let saidTired = false;
    // what the player set in motion while the world was slow. Counted, never
    // guessed: the swing counter watches `actor.lastSwingAt`, which is the
    // stamp `combat.queueSwing` writes and the only observable a swing leaves.
    let swingsInSoul = 0;
    let lastSwingSeen = 0;
    let breathsInSoul = 0;
    let flying = false;
    let flyY = 0;
    let lastRefusal = null;
    // counted at release, not guessed: what the resolver accepted and what it
    // refused because the thing was already down by the time time caught up
    let landedOk = 0;
    let landedDead = 0;
    let pulseRouted = 0;
    let pulseStunned = 0;
    // how many gifts had been said about, so a new one is said about once
    let giftsSeen = entity.record.gifts.length;

    const say = (text, kind) => { hud.log(text, kind); return text; };

    /** Everything alive that is not the player and not the dragon. */
    const hostiles = () => fight.monsters.actors();

    /**
     * The one refusal path, so a click on the cell and a press of R give the
     * same answer in the same words.
     */
    function refusalNow(now) {
      return W.canCall(entity.record, entity, actor, {
        now,
        state: soul,
        playerPos: rig.pos,
        underwater: !!ctx.get('world').underwater,
      });
    }

    /**
     * The call. Everything it changes, it says.
     */
    function callWyrmsoul(now) {
      const may = refusalNow(now);
      if (!may.ok) { say(may.say, 'bad'); audio.play?.('denied'); return may; }

      soul = W.call(soul, now, entity.record);
      held.length = 0;
      landedOk = 0;
      landedDead = 0;
      // the Bond is spent, and the dragon is tired for thirty seconds
      entity.record.bond = soul.bondTo;
      saidTired = false;
      swingsInSoul = 0;
      breathsInSoul = 0;
      lastSwingSeen = Number.isFinite(actor.lastSwingAt) ? actor.lastSwingAt : 0;

      ctx.clock.setScale(W.TIME_SCALE);
      visuals.attach({ senses: soul.gifts.senses });
      audio.play?.('wyrmsoul_call');
      face.wyrmFlash?.(0.35);
      // Its own wings go out for as long as it lasts. On the studio body this
      // is the wing_spread clip into the wing_flex beat; on the code body it is
      // the wings unfolding off the flanks. Either way it is the one thing on
      // your shoulder that shows Wyrmsoul is running without looking at the HUD.
      entity.flap(1);

      say(`${W.CALL_LINE} ${soul.seconds} seconds of it, and the Bond is spent.`, 'good');
      if (soul.gifts.senses) say('You see what is alive through leaf, wall and dark.');
      if (soul.gifts.wings) say('Space flies while it lasts, and you land where you are when it ends.');

      // the tail, on the call, if the Saltmarch gave it back
      if (soul.gifts.tail) {
        const moves = W.tailSweep(hostiles(), rig.pos);
        for (const m of moves) { m.actor.pos.x = m.x; m.actor.pos.z = m.z; }
        say(moves.length
          ? `The tail sweeps: ${moves.length === 1 ? 'one thing goes' : `${moves.length} of them go`} off ${W.TAIL_KNOCK_M} m and off their feet.`
          : `The tail sweeps, and finds nothing within ${W.TAIL_M} m.`);
      }
      return may;
    }

    // What the breath threw and has not resolved yet. THE ONE PLACE the design's
    // "everything you touched happens at once" is made literally true rather
    // than approximately true.
    //
    // WHY IT IS HELD AND NOT SIMPLY QUEUED. A spell queued on the player's
    // clock carries `at = now + SPELL_LAND_S`, and the world clock walks past
    // that number about a second and a half into dragon time, so the first
    // breath of a call would land while the world was still hanging. Holding
    // the fire and releasing it in the end pulse, one entry a frame, makes the
    // ORDER a fact rather than a hope: `combat.update` flushes everything due in
    // a frame in reverse queue order, so two jobs that fall in one frame come
    // out backwards. One a frame cannot.
    const held = [];
    // patches of ground still burning, on the WORLD clock
    const fires = [];
    // the world clock as of this frame, for anything the fire writes
    let frameWorldNow = 0;

    /**
     * One breath. A cone from the hands. The picture goes out NOW, at full
     * speed, because 14-KALDERA gives the player's own projectiles full speed;
     * the damage is held and goes through the REAL resolver in the end pulse, so
     * the floaters, the hit effects, the resists and the lessons are the ones
     * every other spell in the game fires. There is no second damage path.
     */
    function breathe(which, now) {
      if (!W.canBreathe(soul, now)) return { fired: false, reason: 'too soon' };
      const list = W.breathFor(soul);
      const b = list[which];
      if (!b) return { fired: false, reason: 'no such breath' };

      soul = { ...soul, breathAt: now, breaths: soul.breaths + 1 };
      breathsInSoul++;
      // The breath is the player's, and the animal on the player's shoulder is
      // the one it comes out of. `cast` is the file's own cast_spell clip, whose
      // manifest puts the release at 0.57 of the way through it at socket_mouth;
      // the code body lunges with its jaw open instead. It says nothing here:
      // the breath's own lines below are the words for this.
      entity.setAnim('cast');

      const from = { x: rig.pos.x, y: rig.pos.y + 1.35, z: rig.pos.z };
      const found = W.coneTargets(hostiles(), rig.pos, rig.yaw, b.range, b.arcDegrees);
      const fx = ctx.has('abilities') ? ctx.get('abilities').effects : null;
      // the cone itself, drawn whether or not it caught anything: a breath that
      // hits nothing must still look like a breath
      const tipX = rig.pos.x + Math.sin(rig.yaw) * b.range * 0.6;
      const tipZ = rig.pos.z + Math.cos(rig.yaw) * b.range * 0.6;
      fx?.bolt?.(from, { x: tipX, y: from.y, z: tipZ }, b.colour, {});
      for (const m of found) held.push({ breath: b, target: m, order: held.length });

      // The Ember Wastes' gift: the fire stays in the ground. It burns on the
      // WORLD clock, so it hangs with everything else while dragon time is up
      // and keeps burning for seconds after the effect is over, which is what
      // "burns after time resumes" means.
      if (b.ground) {
        const zone = W.fireGround(rig.pos, rig.yaw, entity.age, frameWorldNow);
        fires.push(zone);
        fx?.ring?.({ x: zone.x, y: runtime.heightAt(zone.x, zone.z), z: zone.z }, zone.r, b.colour, W.FIRE_GROUND_S);
        say(`The ground takes the fire: ${zone.r} m of it, ${zone.per} a second for ${W.FIRE_GROUND_S} s.`);
      }
      say(found.length
        ? `${b.name}: ${found.length === 1 ? 'one of them' : `${found.length} of them`} inside the cone, ${b.base[0]} to ${b.base[1]} ${b.damageType}. It lands when time does.`
        : `${b.name}, and nothing inside ${b.range} m of the cone.`);
      return { fired: true, caught: found.length, breath: b, held: held.length };
    }

    /**
     * Let one held breath go, into the real resolver. Called once a frame for
     * the length of the end pulse, and then flushed if anything is left, so
     * nothing is ever dropped. Returns what happened to it.
     */
    function releaseOne(now) {
      const job = held.shift();
      if (!job) return null;
      const b = job.breath;
      const r = fight.combat.queueSpell(actor, { id: b.id, base: b.base, damageType: b.damageType }, job.target, {
        abilityId: b.id, name: b.name, now, travel: 0,
      });
      if (r && r.queued) {
        const fx = ctx.has('abilities') ? ctx.get('abilities').effects : null;
        fx?.burst?.(job.target.pos, b.colour, 1.2);
      }
      return { ...job, queued: !!(r && r.queued), reason: r && r.reason };
    }

    /**
     * The end pulse. The clock pays back everything the world did not get, over
     * half a second, and the swings and breaths already in combat.js's pending
     * list land in order as it does. The roar, if the Boneyard gave it back,
     * goes off here, on the frame dragon time is over.
     */
    function endPulse(now) {
      ctx.clock.setScale(1);
      const owed = ctx.clock.catchUp(W.END_MS, now);
      let routed = 0, stunnedN = 0;
      if (soul.gifts.roar) {
        const tier = W.playerTier(actor);
        const out = W.roarOutcome(hostiles(), tier, rig.pos, W.BREATH_RANGE_M * 2);
        for (const a of out.flee) {
          if (a.ai) { a.ai.state = 'flee'; a.ai.fleeFrom = actor; a.ai.target = null; }
          routed++;
        }
        for (const a of out.stun) {
          fight.combat.applyStatus(a, 'stun', { seconds: out.seconds }, ctx.frame.worldNow ?? now);
          stunnedN++;
        }
        say(`The roar goes out at tier ${tier}: ${routed} run, ${stunnedN} are stunned for ${out.seconds} s.`);
      }
      audio.play?.('wyrmsoul_end');
      face.wyrmFlash?.(1);
      pulseRouted = routed;
      pulseStunned = stunnedN;
      if (flying) {
        flying = false;
        say('The wings go out and you land where you are.');
        // and the dragon comes down with you. Its own line, said once, is in
        // dragon.js ANIM_LINES under `land`.
        entity.setAnim('land');
      }
      // and its wings fold again, which is where the wing_fold clip goes
      entity.flap(0);
      return { owed, routed, stunned: stunnedN, swings: swingsInSoul, breaths: breathsInSoul };
    }

    /**
     * The keys, in the `hotkeys` phase, which runs BEFORE `abilities.update`.
     * That order is the whole reason the breath can take slot 1 without the
     * ability in slot 1 also firing: the press is swallowed here and the bar
     * never sees it. `abilities_runtime.js` needed no line changed.
     */
    function keys(frame) {
      const now = frame.now;
      frameWorldNow = frame.worldNow ?? now;
      if (input.pressed?.(WYRMSOUL_KEY)) {
        input.swallow?.(WYRMSOUL_KEY);
        callWyrmsoul(now);
      }
      if (!W.isRunning(soul)) return;
      const list = W.breathFor(soul);
      for (let i = 0; i < list.length; i++) {
        const key = BAR_KEYS[list[i].slot];
        if (!input.pressed?.(key)) continue;
        input.swallow?.(key);
        breathe(i, now);
      }
    }

    /**
     * The wings, in `move`, after the player system has walked the body. The
     * dev fly camera's own movement rule, bounded to the ground and 30 m over
     * it, and it writes the same `rig.pos` the walk writes, which player.js
     * already knows how to be pushed about through.
     */
    function fly(frame) {
      if (!W.isRunning(soul) || !soul.gifts.wings) {
        // the flight is over: it lands. endPulse says the same thing when the
        // effect runs out; whichever gets here first sets the state and the
        // second finds it already set and says nothing.
        if (flying) { flying = false; entity.setAnim('land'); entity.flap(0); }
        return false;
      }
      const down = (k) => !!input.down?.(k);
      const move = {
        f: (down('w') ? 1 : 0) - (down('s') ? 1 : 0),
        r: (down('d') ? 1 : 0) - (down('a') ? 1 : 0),
        u: (down(' ') ? 1 : 0) - (down('control') ? 1 : 0),
      };
      const ground = runtime.heightAt(rig.pos.x, rig.pos.z);
      if (!flying) { flying = true; flyY = Math.max(rig.pos.y, ground); }
      const speed = camera.flySpeed ? Math.min(28, camera.flySpeed) : 18;
      const p = W.flyStep({ x: rig.pos.x, y: flyY, z: rig.pos.z }, camera.yaw ?? rig.yaw, camera.pitch ?? 0,
        move, speed, frame.dt, ground, W.FLY_CEILING_M);
      rig.pos.x = p.x; rig.pos.z = p.z; rig.pos.y = p.y;
      flyY = p.y;
      // What the animal on your shoulder does while you are up: it beats when
      // you are driving and rides the air when you have let go. The studio body
      // opens on take_off and holds the fly loop, and glides on the glide loop;
      // the code body reads both as standing, with its wings out.
      entity.setAnim(move.f || move.r || move.u ? 'fly' : 'glide');
      entity.flap(1);
      return true;
    }

    /**
     * The ground the true fire is still in, ticked on the WORLD clock so a
     * patch hangs with everything else during dragon time and keeps burning for
     * seconds after it. Damage goes through `combat.hurt`, which is the same
     * door poison and a fall come through, so the floater and the death are the
     * ones every other source fires.
     */
    function burnGround(worldNow) {
      for (let i = fires.length - 1; i >= 0; i--) {
        const z = fires[i];
        if (worldNow >= z.until) { fires.splice(i, 1); continue; }
        if (worldNow < z.nextTick) continue;
        z.nextTick += W.FIRE_TICK_MS;
        for (const a of W.inGround(hostiles(), z)) {
          fight.combat.hurt(a, z.per, { now: worldNow, kind: 'damage' });
        }
      }
      return fires.length;
    }

    /** One frame of the effect, on the PLAYER's clock, after the dragon's own. */
    function runSoul(frame) {
      const now = frame.now;
      frameWorldNow = frame.worldNow ?? now;
      burnGround(frameWorldNow);
      const wasRunning = W.isRunning(soul);
      const wasEnding = W.isEnding(soul);

      // swings begun by the player while the world was slow. `lastSwingAt` is
      // the only stamp a started swing leaves, and it is the same one D1 counts
      // hitTogether off, so the two numbers can never disagree.
      if (wasRunning) {
        const st = Number.isFinite(actor.lastSwingAt) ? actor.lastSwingAt : 0;
        if (st > lastSwingSeen) { lastSwingSeen = st; swingsInSoul++; }
      }

      const t = W.tick(soul, now);
      soul = t.state;
      if (t.justEnded) endPulse(now);
      // the end pulse: one held breath a frame, in the order it was thrown, into
      // the real resolver, which settles it on the NEXT frame's combat.update.
      // One a frame is what makes the order a fact: see `held` above.
      if (t.ending && held.length) {
        const r = releaseOne(frame.worldNow ?? now);
        if (r && !r.queued && r.reason === 'dead') landedDead++;
        if (r && r.queued) landedOk++;
      }
      // whatever is still held when the pulse is over goes at once rather than
      // being dropped: nothing the player threw is ever lost
      if (!t.ending && !t.running && held.length) {
        let n = 0;
        while (held.length) { const r = releaseOne(frame.worldNow ?? now); if (r?.queued) landedOk++; else landedDead++; n++; }
        say(`${n === 1 ? 'One last breath arrives' : `${n} last breaths arrive`} a moment behind the rest.`);
      }
      // the pulse is over: NOW the count is real, because every held breath has
      // been through the resolver and been accepted or refused by name
      if (wasEnding && !t.ending) {
        say(W.endLine({
          swings: swingsInSoul, breaths: landedOk, routed: pulseRouted, stunned: pulseStunned,
        }), 'good');
        if (landedDead) {
          say(`${landedDead === 1 ? 'One breath' : `${landedDead} breaths`} found nothing left standing to land on.`);
        }
      }
      if (wasRunning && !t.running && !t.ending) ctx.clock.setScale(1);
      if (!W.isActive(soul) && ctx.clock.scale !== 1) ctx.clock.setScale(1);

      // the picture: the wings and the eyes beat on the player's clock, the
      // trails ride whatever the monsters actually did this frame
      const models = soul.gifts.senses ? fight.monsters.all().map((m) => m.model).filter(Boolean) : null;
      visuals.update(frame.dt, t.running, t.running ? hostiles() : [], models);
      if (!t.running && !t.ending && visuals.fade === 0 && visuals.on) visuals.detach();

      // A gift taken back is a new thing Wyrmsoul can do, and D1's own line only
      // says which realm gave it. This says what it MEANS, and it is watched off
      // the record rather than off an event, because a realm's dungeon calls
      // `entity.grant` directly and there is no gift event to listen to.
      const heldNow = entity.record.gifts.length;
      if (heldNow > giftsSeen) {
        for (const id of entity.record.gifts.slice(giftsSeen)) {
          const line = W.giftGainedLine(id);
          if (line) say(line, 'good');
        }
        giftsSeen = heldNow;
      } else if (heldNow < giftsSeen) {
        giftsSeen = heldNow;
      }

      // the tired window: the dragon fights, and the Bond does not climb
      if (W.isTired(soul, now) && !saidTired && !W.isActive(soul)) {
        saidTired = true;
        say(`${entity.name || 'It'} is spent. It fights, but the Bond does not climb for ${Math.round(W.TIRED_MS / 1000)} s.`);
      }
      if (!W.isTired(soul, now) && saidTired) {
        saidTired = false;
        say(`${entity.name || 'It'} has its wind back. The Bond climbs again.`);
      }

      // the HUD, every frame, so the arc and the cell are never a frame behind
      const callable = !W.isActive(soul) && refusalNow(now).ok;
      face.setBond?.(entity.record.bond, entity.name, callable);
      const refusal = callable ? null : (W.isActive(soul) ? null : refusalNow(now));
      lastRefusal = refusal;
      face.setWyrmsoul?.({
        callable,
        active: W.isActive(soul),
        left: t.left,
        reason: refusal && !refusal.ok ? refusal.say : '',
        tip: W.tooltipFor({ record: entity.record, refusal, state: soul, now }),
      });
    }

    // The Bond does not climb while the dragon is tired. dragon.js owns the
    // number and is not this agent's file, so the gain is taken back the moment
    // it is made, off the events D1 fires AFTER the write with `gained` on them.
    // One place, three events, and it is said once rather than every swing.
    let saidNoGain = false;
    for (const ev of ['hitTogether', 'fed', 'tookBlow']) {
      entity.on(ev, (info) => {
        if (!W.isTired(soul, ctx.frame.now)) return;
        const back = Number(info?.gained) || 0;
        if (back <= 0) return;
        entity.record.bond = Math.max(0, entity.record.bond - back);
        if (!saidNoGain) {
          saidNoGain = true;
          say('It is still spent from Wyrmsoul, so that was worth no Bond.');
        }
      });
    }
    // and armed again the moment the thirty seconds are out
    entity.on('woke', () => { saidNoGain = false; });

    // A gift taken back is a new thing Wyrmsoul can do, and D1's own line only
    // says the realm gave something back. This says what it means here.
    entity.on('grew', () => { saidNoGain = false; });

    // "If the player is killed during Wyrmsoul, Bond empties and the dragon
    // falls too." combat.js is the one place anything dies, so this is the one
    // place that is told.
    fight.combat.onDeath((who) => {
      if (who !== actor || !W.isActive(soul)) return;
      soul = W.blankWyrmsoul(entity.record);
      ctx.clock.setScale(1);
      ctx.clock.catchUp(W.END_MS, ctx.frame.now);
      visuals.detach();
      flying = false;
      entity.record.bond = 0;
      say('You go down inside Wyrmsoul. The Bond empties, and it falls with you.', 'bad');
      if (entity.awake) entity.fall(null);
    });

    // the mouse, on the thirteenth cell, through the same door as the key
    face.onWyrmsoul?.(() => callWyrmsoul(ctx.frame.now));

    const wyrmsoulApi = {
      get state() { return soul; },
      get timeScale() { return ctx.clock.scale; },
      get gifts() { return W.giftsHeld(entity.record); },
      get refusal() { return lastRefusal; },
      get flying() { return flying; },
      get counts() { return { swings: swingsInSoul, breaths: breathsInSoul, held: held.length, landed: landedOk, missed: landedDead, fires: fires.length }; },
      get fires() { return fires.map((f) => ({ ...f })); },
      visuals,
      /** The harness: call it now, whatever the clock says about the frame. */
      call: (now = ctx.frame.now) => callWyrmsoul(now),
      /** End it now: the pulse fires exactly as it does when the time runs out. */
      end: (now = ctx.frame.now) => {
        if (!W.isRunning(soul)) return false;
        soul = { ...soul, until: now };
        return true;
      },
      breathe: (which = 0, now = ctx.frame.now) => breathe(which, now),
      /** A realm's gift, through D1, so the age moves with it. */
      grant: (giftId) => entity.grant(giftId),
      canCall: (now = ctx.frame.now) => refusalNow(now),
      /** NOT WIRED: the Ashen Throne boss fight does not exist. See wyrmsoul.js. */
      deathSwap: (opts) => W.deathSwap(actor, entity, opts),
    };

    return {
      entity,
      wyrmsoul: wyrmsoulApi,
      soulKeys: keys,
      soulFly: fly,
      soulRun: runSoul,
      get record() { return entity.record; },
      get actor() { return entity.actor; },
      bw: {
        wyrmsoul: wyrmsoulApi,
        dragon: {
          entity,
          get record() { return entity.record; },
          get actor() { return entity.actor; },
          get model() { return entity.model; },
          // what the body is, and what it is doing, so a reviewer at the
          // console can read both rather than infer them from the screen
          get made() { return entity.made; },
          get anim() { return entity.anim; },
          get seat() { return entity.seat; },
          setAnim: (a) => entity.setAnim(a),
          flap: (k) => entity.flap(k),
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

  /**
   * R calls it, and the bar's first slot (and its second, with frost) becomes
   * the breath. This phase runs before `abilities.update`, so a swallowed key
   * never reaches the ability in that slot.
   */
  hotkeys(ctx, frame) { ctx.get('dragon').soulKeys(frame); },

  /** The wings, after the player system has walked the body. */
  move(ctx, frame) { ctx.get('dragon').soulFly(frame); },

  update(ctx, frame) {
    const self = ctx.get('dragon');
    // the dragon itself runs on the PLAYER's clock: 14-KALDERA, "the player,
    // the dragon ... run at full speed"
    self.entity.run(frame);
    self.soulRun(frame);
  },

  dispose() { /* the entity's body is removed with the scene */ },
};
