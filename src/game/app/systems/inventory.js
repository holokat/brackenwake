// The pack: what is in it, what a settler starts with, the knife on a body,
// and the channel two tabs trade over.

import { createInventory } from '../../inventory.js';
import { createSkinning } from '../../skinning.js';
import { createTradeNet } from '../../trade_net.js';
import { recompute } from '../../actor.js';
import { makeItem, baseFor, isFocus } from '../../../mmo/items.js';

// ---------------------------------------------------------------------------
// The settler's kit
// ---------------------------------------------------------------------------
//
// The user's line: "when a new player starts, we have to start them with some
// sort of melee weapon, a ranged weapon - bow maybe with some arrows, and a
// mage weapon so they can choose which to train up with."
//
// So the three ways to train are all in the pack in the first minute, whatever
// opening was picked, and none of them arrives twice. Two entries are
// conditional, because handing a mage a second staff or a warrior a second
// sword is clutter rather than a choice:
//
//   the wand    only if nothing that casts is already carried. A mage, a
//               sorcerer and a necromancer walk out of creation holding a
//               staff; a healer and a Blank already have a wand of their own.
//   the dagger  only if no melee weapon is carried at all. That is the pure
//               casters: their whole kit is a staff, which is a focus and not
//               a weapon anything swings, so without this they would have
//               nothing to hit with but their fists.
//
// The axe and the pickaxe are conditional in the same quiet way, which is what
// stops the artisan (whose own kit is an axe and a pickaxe) being handed a
// second of each.

/** What every settler is handed once, in the order it is granted. */
export const SETTLER_KIT = [
  { base: 'axe', count: 1 },
  { base: 'pickaxe', count: 1 },
  { base: 'shortbow', count: 1 },
  { base: 'arrow', count: 40 },
  { base: 'skinning_knife', count: 1 },
  { base: 'wand', count: 1, unless: 'focus' },
  { base: 'dagger', count: 1, unless: 'melee' },
];

/**
 * THE RECORD OF THE GRANT is the skinning knife, and it is the only base in
 * the kit that no opening's own kit carries. It used to be "no axe and no
 * pickaxe", which read as "has not had the kit" for ten openings and lied
 * about the eleventh: the artisan starts with both, so the artisan never got
 * a bow, arrows or a knife at all and nobody had counted it.
 */
export const hadSettlerKit = (character) => ownsBase(character, 'skinning_knife');

/** Is this base anywhere on the character, in the pack or on the body? */
export function ownsBase(character, base) {
  const items = (character?.pack?.items) || [];
  if (items.some((it) => it && it.base === base)) return true;
  return Object.values(character?.equipment || {}).some((it) => it && it.base === base);
}

/** Every item the character has anywhere, worn or packed. */
const allItems = (character) => [
  ...((character?.pack?.items) || []).filter(Boolean),
  ...Object.values(character?.equipment || {}).filter(Boolean),
];

/**
 * A weapon you swing: a held weapon that is neither a bow nor a focus. This is
 * the same line abilities.js draws for its `anyMelee` kind, and it is why an
 * axe counts and a staff does not.
 */
export function hasMeleeWeapon(character) {
  return allItems(character).some((it) => {
    const b = baseFor(it);
    return !!b && b.kind === 'weapon' && b.hands > 0 && b.range == null && !isFocus(b);
  });
}

/** Anything a spell will go through: a wand, a staff, a bone staff. */
export function hasFocus(character) {
  return allItems(character).some((it) => isFocus(it));
}

/**
 * Pure. What this character should actually be handed, given what they already
 * carry. Empty once the kit has been granted, which is what makes booting
 * twice grant nothing twice.
 */
export function settlerKitFor(character) {
  if (hadSettlerKit(character)) return [];
  const melee = hasMeleeWeapon(character);
  const focus = hasFocus(character);
  return SETTLER_KIT.filter((e) => {
    if (e.unless === 'focus') return !focus;
    if (e.unless === 'melee') return !melee;
    return !ownsBase(character, e.base);
  });
}

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

    // Every settler gets the kit once: an axe, a pickaxe, a hunting bow with
    // arrows, a skinning knife, and the two that decide how you train, so
    // chopping, mining, shooting, skinning, swinging and casting can all be
    // tried without a market first. Said once, then never again; the flag would
    // not survive hydrate, which keeps only the document's own keys, so the
    // pack itself is the record. See settlerKitFor above.
    const wanted = settlerKitFor(character);
    if (wanted.length) {
      const given = [];
      for (const { base, count } of wanted) {
        const r = pack.add(makeItem({ base, count, rarity: 'common' }), { quiet: true });
        if (r && r.added) given.push(count > 1 ? `${count} arrows` : (baseFor(base)?.name || base).toLowerCase());
      }
      state.touch('pack');
      // What did NOT fit is said too: a full pack silently eating the wand
      // would look exactly like a wand that was never granted.
      const short = wanted.length - given.length;
      if (given.length) hud.log(`Your kit has a settler's tools in it: ${given.join(', ')}.`, 'good');
      if (short > 0) hud.log(`${short} of the settler's tools would not fit in your pack.`, 'bad');
    }
    player.dress();

    // a knife on a body, and the trade channel between tabs
    const skinning = createSkinning({ monsters, inventory: pack, progression, character, hud, audio, floaters, at: () => player.pos, rng: Math.random, dev: () => state.dev });
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
