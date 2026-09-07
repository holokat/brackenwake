// The emotes: the wheel on X, the pose the body wears, and the five things
// that take it off you.
//
// WHERE IT SITS IN THE FRAME. Straight after `player`, because the player
// system has just walked the body and posed the gait, and this writes over that
// pose. Before `combat`, so the pose is on the rig by the time `abilities.late`
// runs effects.update and lays a swing or a flinch on top of it, which is the
// order effects.js documents and expects.
//
// THE WALK ALWAYS WINS. Two gates, and both are checked every frame:
// `emoteStep` is handed `walking()`, which is true if he has any speed, is in
// the air, or is leaning on a movement key; and even after that the pose is
// only written when the controller's own anim came out `idle`. A moving player
// never wears an emote, and nothing here reaches into player.js's decision.
//
// WHAT ENDS ONE, and every one of them says so out loud:
//   moving      you walked out of it. Sit and lie say "you get up".
//   swinging    `actor.lastSwingAt` moved, which is combat.queueSwing's own mark
//   casting     abilities has a cast or a spell on the cursor
//   being hit   your health went down between two frames
//   going down  the player system says you are dying
//
// WHY THE HIT IS WATCHED AND NOT HOOKED. `combat.onHit` fires for hit EFFECTS
// (a burning blade, thorns, a reflect) and NOT for a plain bite, so a system
// that only listened to it would sit through a wolf eating it. The general case
// is the one combat.js's own system uses on itself: health lower than it was
// last frame. The hook is registered as well, because when it does fire it
// carries the attacker by name and it fires in the same frame.
//
// THE CHANNELS. player.js's emote poses reach past the ones poseCharacter
// rewrites every frame, so `clearEmotePose` is called exactly once on the frame
// an emote stops. Without it a body that sat down once would never stand up.
//
// THE CAMERA IS NOT TOUCHED. An emote is something the body does; where you are
// looking from is yours.

import { poseCharacter, clearEmotePose, auditEmotePoses, STRIDE_WALK } from '../../player.js';
import {
  EMOTE_IDS, createEmoteState, startEmote, emoteStep, endEmote, emoteById,
  auditEmotes, commandFor,
} from '../../emotes.js';
import { panel as emotesPanel } from '../../win_emotes.js';

/** Under this ground speed he is standing still enough to hold a pose. */
export const STILL_SPEED = 0.2;
/** Any of these down means he is trying to walk, even if a wall says otherwise. */
export const MOVE_KEYS = ['w', 'a', 's', 'd', ' '];
/** How close a monster has to be before it can be the one that hit you. */
export const HIT_REACH = 3.5;

export const emotes = {
  name: 'emotes',
  deps: ['player', 'combat', 'ui'],

  create(ctx) {
    const { hud, input } = ctx;
    const player = ctx.get('player');
    const fight = ctx.get('combat');
    const face = ctx.get('ui');

    // Both tables checked against each other before a single frame runs: eight
    // emotes, eight poses, and every row complete. A ninth emote with no body
    // for it stops the boot rather than shipping as an invisible menu entry.
    auditEmotes();
    auditEmotePoses(EMOTE_IDS);

    const rig = player.rig;
    const actor = player.actor;
    const state = createEmoteState();

    // One object, reused: a held emote poses sixty times a second and there is
    // no reason for sixty pieces of garbage a second behind it.
    const pose = { anim: null, emoteT: 0, t: 0, phase: 0, stride: STRIDE_WALK, idleMix: 1, grip: null, gripMix: 0 };
    let posed = false;
    let lastSwing = Number(actor.lastSwingAt) || 0;
    let lastHealth = Number(actor.health) || 0;

    const say = (line, kind) => { if (line) hud.log(line, kind); };

    /** Put the extra channels back, once, on the frame the pose comes off. */
    function drop() {
      if (!posed) return;
      clearEmotePose(rig.parts);
      posed = false;
    }

    function stop(why, opts) {
      const r = endEmote(state, why, opts);
      if (r.ended) { drop(); say(r.line); }
      return r;
    }

    /** He is walking, jumping, or asking to. */
    function walking() {
      const s = rig.state;
      if (s.speed > STILL_SPEED || s.airborne) return true;
      for (const k of MOVE_KEYS) if (input.down(k)) return true;
      return false;
    }

    /**
     * Start one, from the wheel, from a slash command, or from the console.
     * The line is said here and nowhere else, so every door into an emote says
     * the same words.
     */
    function start(id) {
      const e = emoteById(id);
      if (!e) { hud.log(`there is no emote called "${id}".`, 'bad'); return null; }
      if (player.dying) { hud.log('not while you are down.', 'bad'); return null; }
      if (walking()) { hud.log(`you cannot ${e.noun === 'rest' ? 'lie down' : e.noun} on the move.`, 'bad'); return null; }
      const r = startEmote(state, e.id, ctx.frame.now);
      say(r.line);
      return r;
    }

    /**
     * What hit you, when the answer is not in doubt: the one live monster
     * within HIT_REACH of where you are standing. Two of them on you at once
     * and the honest answer is null, which endLineFor turns into "something".
     * Naming the wrong wolf is worse than naming none.
     */
    function whoHit() {
      const mon = fight.monsters;
      if (!mon || typeof mon.actors !== 'function') return null;
      const p = rig.pos;
      const close = mon.actors().filter((a) => a && a.pos && a.health > 0
        && Math.hypot(a.pos.x - p.x, a.pos.z - p.z) <= HIT_REACH);
      // MONSTERS names them "Wolf"; the log writes "the wolf", as combat.js does.
      return close.length === 1 && close[0].name ? String(close[0].name).toLowerCase() : null;
    }

    // An effect hit, which is the one case the resolver announces by name, and
    // it announces it in the same frame. combat.onHit is a list, so this hook
    // stands beside the one abilities.js registered rather than over it.
    fight.combat.onHit((info) => {
      if (!state.id || !info || info.defender !== actor) return;
      const by = info.attacker && info.attacker.name ? String(info.attacker.name).toLowerCase() : null;
      stop('hit', { by: by || whoHit() });
    });

    const self = {
      state, start, stop, walking,
      /** The id running now, or null. */
      get current() { return state.id; },
      /** The eight, in the wheel's order. */
      get list() { return EMOTE_IDS.slice(); },

      /**
       * One frame. Everything that could end the emote is asked before the pose
       * is written, so the frame an emote ends is a frame the gait owns.
       */
      step(frame) {
        const swung = Number(actor.lastSwingAt) || 0;
        const justSwung = !!state.id && swung !== lastSwing;
        lastSwing = swung;
        const health = Number(actor.health) || 0;
        const justHurt = !!state.id && health < lastHealth;
        lastHealth = health;
        if (!state.id) { drop(); return null; }
        if (justSwung) return stop('swing');
        if (player.dying) return stop('down');
        if (justHurt) return stop('hit', { by: whoHit() });
        const spells = ctx.has('abilities') ? ctx.get('abilities').abilities : null;
        if (spells && (spells.casting || spells.pending)) return stop('cast');

        const r = emoteStep(state, frame.now, walking());
        if (r.ended) { drop(); say(r.line); return r; }
        if (!r.pose) { drop(); return r; }
        // The player system already decided what he is doing this frame. If it
        // is anything but standing about, it wins and the emote waits a frame
        // for `walking()` to catch up with it.
        if (rig.state.anim !== 'idle') { drop(); return r; }
        pose.anim = r.pose;
        pose.emoteT = r.elapsed;
        pose.t = rig.state.t;
        if(rig.studio)rig.studio.poseEmote(pose);else poseCharacter(rig.parts, pose);
        posed = true;
        return r;
      },

      bw: {
        emotes: {
          start,
          stop: (why) => stop(why || 'stop'),
          commandFor,
          get current() { return state.id; },
          get list() { return EMOTE_IDS.slice(); },
        },
      },
    };

    // The wheel reaches the game through the panel context, the way the dev
    // bench and the dragon window do: ui.js is built first and cannot hold a
    // wire to this system, so this system holds it. R1.md, "wiring late".
    face.panelCtx.emotes = self;
    face.windows.register(emotesPanel);

    return self;
  },

  update(ctx, frame) { ctx.get('emotes').step(frame); },
};

export default emotes;
