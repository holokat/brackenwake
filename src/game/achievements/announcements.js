import {achievementArt} from './art.js';

/** Announce committed unlocks once, with sound when their queued banner appears. */
export function createAchievementAnnouncements({hud, audio}) {
  const announced = new Set();
  return rows => {
    for (const row of rows) {
      if (announced.has(row.id)) continue;
      announced.add(row.id);
      const reward = `Title unlocked: ${row.title}.${row.reward ? ` ${row.reward.description}` : ''}`;
      hud.log?.(`Achievement earned: ${row.name}. ${reward}`, 'good');
      hud.unlock?.({id: `achievement:${row.id}`, name: row.name, label: 'Achievement unlocked',
        art: achievementArt(row.number), key: `${reward} Press J to view achievements.`,
        onShow: () => audio?.play?.('achievementSuccess'),
      });
    }
  };
}
