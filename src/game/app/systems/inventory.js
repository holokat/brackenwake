// The pack: what is in it, what a settler starts with, the knife on a body,
// and the channel two tabs trade over.

import { createInventory } from '../../inventory.js';
import { createSkinning } from '../../skinning.js';
import { createTradeNet } from '../../trade_net.js';
import { recompute } from '../../actor.js';
import { makeItem } from '../../../mmo/items.js';

export const inventory = {
  name: 'inventory',
  deps: ['world', 'player', 'combat'],

  create(ctx) {
    const { state, hud, audio, floaters, character } = ctx;
    const player = ctx.get('player');
    const { actor, progression } = player;
    const { monsters, loot } = ctx.get('combat');

    const pack = createInventory({
      character, actor, recompute,
      onChange: (c, what) => {
        state.touch(what);
        if (what === 'equipment') {
          player.dress();
          if (ctx.has('abilities')) ctx.get('abilities').abilities?.applyPassives?.();
        }
      },
      hud, audio, floaters,
      onSell: () => ({ ok: false, reason: 'nobody out here is buying; find a vendor in town' }),
      onDrop: (item) => loot.drop(player.pos, { items: [item], gold: 0 }),
    });

    // Every settler gets tools once: an axe, a pickaxe, a hunting bow with
    // arrows and a skinning knife, so chopping, mining, shooting and skinning
    // can be tried without a market first. Said once, then never again.
    // The flag would not survive hydrate, which keeps only the document's own
    // keys, so the pack itself is the record: a settler with no axe and no
    // pickaxe anywhere has not had the kit.
    const owns = (base) => character.pack.items.some((it) => it && it.base === base) || Object.values(character.equipment || {}).some((it) => it && it.base === base);
    if (!owns('axe') && !owns('pickaxe')) {
      const given = [];
      for (const [base, count] of [['axe', 1], ['pickaxe', 1], ['shortbow', 1], ['arrow', 40], ['skinning_knife', 1]]) {
        const r = pack.add(makeItem({ base, count, rarity: 'common' }), { quiet: true });
        if (r && r.added) given.push(count > 1 ? `${count} arrows` : base.replace('_', ' '));
      }
      state.touch('pack');
      if (given.length) hud.log(`Your kit has a settler's tools in it: ${given.join(', ')}.`, 'good');
    }
    player.dress();

    // a knife on a body, and the trade channel between tabs
    const skinning = createSkinning({ monsters, inventory: pack, progression, character, hud, audio, floaters, at: () => player.pos, rng: Math.random });
    const tradeNet = createTradeNet({ character, name: character.name, at: () => player.pos, now: () => performance.now(), hud });
    tradeNet.onInvite((partner, peer) => {
      hud.log(`${peer?.name || 'somebody'} wants to trade.`);
      ctx.get('ui').windows.open('trade', { partner });
    });

    /** What a sack hands over: everything the pack takes, and all the gold. */
    function takeLoot(items, gold) {
      // the sack does the talking: loot_drops floats the gold and each item by
      // rarity and says the whole take in one line, so the pack adds quietly
      const accepted = [];
      for (const it of items) {
        const r = pack.add(it, { quiet: true });
        if (r && r.added) accepted.push(it);
      }
      if (gold > 0) {
        character.gold = (character.gold || 0) + gold;
        state.touch('gold');
      }
      return { items: accepted, gold };
    }

    return {
      inventory: pack, skinning, tradeNet, takeLoot,
      bw: { inventory: pack, skinning, tradeNet },
    };
  },

  late(ctx, frame) { ctx.get('inventory').tradeNet.update(frame.now); },
};
