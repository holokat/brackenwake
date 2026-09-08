// The events, in the frame. Everything this system does is four wires and a
// call: `src/mmo/events.js` is the calendar, `src/game/events_runtime.js` is
// the thing that meets the player, and this is where they are handed the real
// world's parts.
//
// WHY IT RUNS AFTER world_life AND BEFORE story. It puts bodies in the world
// through `monsters.spawnAt` and moves them by their `ai.home`, and the
// monster runtime steps those bodies inside `combat.update`, which runs
// earlier in the list. Moving a home after the step means the column walks on
// the next frame instead of this one, which is right: the events are the
// world's weather and the fight is the fight. Anything drawn from it (the map)
// runs later still.
//
// THE WORLD CLOCK, AND THE BENCH'S HOLD ON IT. The calendar is the day clock,
// so this reads `frame.worldNow` like everything else the world owns, and it
// adds `sc.clockOffset`, which is the number `win_dev.js` moves when a tester
// drags the time of day slider. Set the bench to 15:00 and the Bone Wind is up
// over the Boneyard, because the sky and the schedule are reading one clock.

import { createEvents } from '../../events_runtime.js';

export const events = {
  name: 'events',
  deps: ['world', 'player', 'combat', 'ui'],

  create(ctx) {
    const { sc, hud } = ctx;
    const runtime = ctx.get('world').runtime;
    const monsters = ctx.get('combat').monsters;
    const player = ctx.get('player');

    const ev = createEvents(
      runtime, monsters, hud,
      { offset: () => sc?.clockOffset || 0 },
      { actor: () => player.actor, sky: sc },
    );

    // The map reads the marks through the one panel context, the way the dev
    // bench reads the world. ui.js is built before this and cannot hold a wire
    // to it, so this system holds it: R1.md, "wiring late".
    const panelCtx = ctx.get('ui').panelCtx;
    if (panelCtx) panelCtx.events = ev;

    this._ev = ev;
    return { events: ev, bw: { events: ev } };
  },

  update(ctx, frame) {
    const { events: ev } = ctx.get('events');
    ev.update(frame.worldDt ?? frame.dt, frame.worldNow ?? frame.now, ctx.get('player').pos);
  },

  dispose() { this._ev?.dispose?.(); this._ev = null; },
};
