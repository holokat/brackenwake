// The right click, wired to the game.
//
// `src/game/context_menu.js` is the model and the list. This file is the wire:
// it turns a ray into one of the seven targets, hands the model the real
// functions, and puts the list on the screen at the cursor.
//
// WHERE THE CLICK COMES FROM. `app/systems/input.js` owns the click router and
// asks this system first when the button was the right one. That keeps the
// whole of "what a click does" in one file, which is the rule R1.md set down
// for the left click and there is no reason for the right one to be different.
//
// HOW A RAY BECOMES A TARGET, and this order is not the left click's order.
// A left click resolves a held spell first, because it is choosing a victim.
// A right click never is, so it starts with what is actually under the cursor:
//
//   a sack, a person, the dragon, a body, a live monster, yourself, the ground
//
// A body comes before a live monster because `monsters.pick` only ever answers
// with something whose health is above zero and `pickCorpse` only ever answers
// with something whose health is not, so the two cannot both hit; the order is
// written down so that a future pick that answers for both has an answer here.
// YOURSELF IS NEW: nothing in the game raycast the player's own rig before
// this, and the first thing the user asked for was a right click on the player.
//
// WHAT IT MAY REACH. The bundle handed to `menuFor` is:
//
//   hud, audio, state, character   the services
//   player   { pos, dying }        app/systems/player.js
//   emotes   { start, walking }    app/systems/emotes.js
//   combat   { startAttack, swingAt, targeting }
//   loot     { take, nearest, bags, labelFor }
//   takeLoot                       app/systems/inventory.js, the pack's hand
//   skinning { canSkin, skin, knifeOf }
//   windows                        the window layer
//   map                            the registered map panel, for the waypoint
//   dragon() -> the entity or null
//   now()    -> the frame clock
//
// Every one of those is the object the rest of the game uses. Nothing here
// wraps a call in a version of its own, so a row that says it attacked really
// did go through `combat.startAttack`.

import { menuFor, createContextMenu, auditContextMenu, TARGET_KINDS } from '../../context_menu.js';

// The runner calls `dispose()` with no arguments, so the one thing that has to
// be taken down is held here rather than looked up off a context that is not
// handed over.
let live = null;

export const context_menu = {
  name: 'context_menu',
  deps: ['world', 'player', 'combat', 'inventory', 'world_life', 'ui', 'emotes', 'dragon'],

  create(ctx) {
    // a kind with no rows, or rows for a kind nothing can resolve to, stops the
    // boot rather than shipping as a menu that opens empty
    auditContextMenu();

    const { hud, audio, state, character, hudRoot } = ctx;
    const player = ctx.get('player');
    const fight = ctx.get('combat');
    const bag = ctx.get('inventory');
    const life = ctx.get('world_life');
    const face = ctx.get('ui');
    const mime = ctx.get('emotes');
    const wyrm = ctx.get('dragon');

    const menu = createContextMenu(hudRoot, {});
    live = menu;

    /** The registered map panel, which is where a waypoint is written. */
    const mapPanel = () => {
      const p = (face.windows.panels || []).find((x) => x && x.id === 'map');
      if (!p) return null;
      // The panel is handed the panel context when it is BUILT, which only
      // happens the first time the map is opened. A waypoint set from the
      // ground before that would have written to nothing at all, silently, so
      // the context is filled in here first. It is the same object the build
      // would have handed it.
      if (!p._ctx) p._ctx = face.windows.ctx || face.panelCtx;
      return p;
    };

    const game = {
      hud, audio, state, character,
      player,
      emotes: mime,
      combat: fight,
      loot: fight.loot,
      takeLoot: bag.takeLoot,
      skinning: bag.skinning,
      npcs: life.npcs,
      windows: face.windows,
      get map() { return mapPanel(); },
      dragon: () => (wyrm && wyrm.entity ? wyrm.entity : null),
      now: () => ctx.frame.now,
    };

    /** Is the ray on the player's own body? */
    function pickSelf(ray) {
      const g = player.rig?.group;
      if (!ray || !g || g.visible === false) return false;
      return ray.intersectObject(g, true).length > 0;
    }

    /** Is the ray on the dragon? */
    function pickDragon(ray) {
      const g = wyrm?.entity?.model?.group;
      if (!ray || !g || g.visible === false) return false;
      return ray.intersectObject(g, true).length > 0;
    }

    /**
     * A ray to one of the seven targets. Never null: a ray that hits nothing
     * the game knows about is the ground, and the ground has a menu.
     */
    function resolve(ray) {
      const sack = fight.loot.pick(ray);
      if (sack) return { kind: 'item', bag: sack };
      const who = life.npcs.pick(ray);
      if (who && who.npc) return { kind: 'npc', npc: who.npc };
      if (pickDragon(ray)) return { kind: 'dragon' };
      const corpse = bag.skinning.pick(ray);
      if (corpse) return { kind: 'corpse', corpse };
      const mon = fight.monsters.pick(ray);
      if (mon) return { kind: 'monster', actor: mon };
      if (pickSelf(ray)) return { kind: 'player' };
      // The cursor is where the click was: input.js writes `pointer` from the
      // same pointerup that made the click, so this is the spot that was
      // clicked and not wherever the mouse has since wandered.
      const p = fight.targeting.groundPoint(player.pos.y) || { x: player.pos.x, z: player.pos.z };
      return { kind: 'ground', point: { x: p.x, z: p.z } };
    }

    /** What the little header over the list says this menu is about. */
    function titleFor(t) {
      if (t.kind === 'player') return character?.name || 'you';
      if (t.kind === 'monster') return t.actor?.name || 'it';
      if (t.kind === 'npc') return t.npc?.personName || 'them';
      if (t.kind === 'corpse') return String(t.corpse?.row?.name || 'a body');
      if (t.kind === 'item') return fight.loot.labelFor ? fight.loot.labelFor(t.bag) : 'a sack';
      if (t.kind === 'dragon') return game.dragon()?.name || 'the hatchling';
      return 'the ground';
    }

    /** Build a menu for a target and put it on the screen. */
    function open(target, x, y) {
      const rows = menuFor(target, game);
      if (!rows.length) { menu.close(); return null; }
      menu.openAt(rows, x, y, titleFor(target));
      return rows;
    }

    return {
      menu, game, resolve, open, menuFor: (t) => menuFor(t, game),
      /** The input system's hook. Returns truthy when it took the click. */
      openAt(ray, x, y) {
        const target = resolve(ray);
        return open(target, x, y) ? { menu: target.kind } : false;
      },
      close: () => menu.close(),
      get rows() { return menu.rows; },
      get isOpen() { return menu.open; },

      bw: {
        contextMenu: {
          open: (target, x = 200, y = 200) => open(target, x, y),
          close: () => menu.close(),
          resolve,
          menuFor: (t) => menuFor(t, game),
          key: menu.key,
          move: menu.move,
          activate: () => menu.activate(),
          kinds: TARGET_KINDS.slice(),
          get rows() { return menu.rows; },
          get index() { return menu.index; },
          get isOpen() { return menu.open; },
        },
      },
    };
  },

  dispose() { live?.dispose?.(); live = null; },
};

export default context_menu;
