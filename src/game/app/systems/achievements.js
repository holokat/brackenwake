import { createAchievementTracker } from '../../achievements/tracker.js';
import { ISLAND_LANDMARKS } from '../../achievements/locations.js';
import { recompute } from '../../actor.js';

export const achievements = {
  name: 'achievements', deps: ['world', 'player', 'combat', 'ui'],
  create(ctx) {
    const player = ctx.get('player');
    const world = ctx.get('world');
    const tracker = createAchievementTracker({
      character: ctx.character, state: ctx.state, actor: player.actor,
      combat: ctx.get('combat').combat, landmarks: ISLAND_LANDMARKS,
      enabled: () => !ctx.state.dev && !player.dying && world.runtime.field?.sculpt?.world === 'island',
      recompute,
      notify(rows) {
        for (const row of rows) ctx.hud.log(`Achievement earned: ${row.name}. Title unlocked: ${row.title}.${row.reward ? ` ${row.reward.description}` : ''}`, 'good');
        ctx.hud.toast(rows.length === 1 ? `Achievement earned: ${rows[0].name}` : `${rows.length} achievements earned. Open Achievements to see your rewards.`, 'good');
      },
    });
    const windows = ctx.get('ui').windows;
    const open = () => windows.open('achievements');
    const onOpen = () => open();
    globalThis.window?.addEventListener('brackenwake:open-achievements', onOpen);
    ctx.get('ui').panelCtx.achievements = tracker;
    const off = ctx.state.onChange((state, what) => { if (what === 'skills' || what === 'equipment') tracker.observeCharacter(); });
    const dispose = () => { off(); tracker.dispose(); globalThis.window?.removeEventListener('brackenwake:open-achievements', onOpen); };
    this._dispose = dispose;
    return { tracker, elapsed: 0,
      dispose,
      bw: { achievements: tracker, openAchievements: open },
    };
  },
  late(ctx, frame) {
    const self = ctx.get('achievements');
    self.elapsed += frame.dt;
    if (self.elapsed < .5) return;
    self.elapsed = 0;
    const world = ctx.get('world');
    const p = ctx.get('player').pos;
    self.tracker.position({ x: p.x, z: p.z, dungeon: world.runtime.inDungeon ? world.runtime.dungeonLayout() : null,
      night: world.dayFactor(frame.worldNow ?? frame.now) < .4 });
  },
  dispose() { this._dispose?.(); this._dispose = null; },
};
