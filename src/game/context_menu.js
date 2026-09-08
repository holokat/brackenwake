// The right click: what is under the cursor, and the short list of things you
// can do to it.
//
// TWO HALVES, AND THEY DO NOT KNOW EACH OTHER.
//
//   menuFor(target, game)   pure. A target and the game's own handles in, an
//                           ordered list of rows out. No document, no THREE,
//                           no clock of its own. Every row's `run` is a call
//                           into the same function the left click, the key or
//                           the window would have called: there is no second
//                           code path and no preview, which is CLAUDE.md's
//                           "the test path must be the real path".
//   createContextMenu(...)  the small list at the cursor. Draws rows, walks
//                           them with the arrows, runs one on Enter, and goes
//                           away on Escape or on a click anywhere else.
//
// WHAT A ROW IS
//
//   { id, label, hint, disabled, why, run }
//
// `hint` is what the row says about itself when it can run. `why` is what it
// says when it cannot, and a row that cannot run is drawn dimmed and carries
// `why` as its tooltip rather than being left off the list: a menu that hides
// Skin says nothing about the knife you are not carrying, and a menu that dims
// it says exactly that.
//
// WHAT SAYS WHAT HAPPENED. Nothing in this file writes a line about a state
// change of its own except Pet, which is the one action here that no other door
// into the game leads to. Everything else calls a function that already speaks:
// `combat.startAttack` logs the fight, `emotes.start` writes the emote's line,
// `loot.take` says what went in the pack AND what stayed on the ground,
// `skinning.skin` says every one of its outcomes, and `map.setWaypoint` toasts
// the mark and the distance to it.
//
// THE BAR'S RIGHT CLICK IS STILL THE BAR'S. The ability bar, the item row and
// the pack each listen for `contextmenu` on their own cells to clear a slot.
// Those cells live in the HUD layer over the canvas, so their event never
// reaches the canvas and the hook in `app/systems/input.js` never sees it. This
// menu only ever opens on a click that landed on the world.

import { BAG_REACH } from './loot_drops.js';
import { plateText, TALK_REACH } from './npcs_runtime.js';
import { SKIN_REACH } from './skinning.js';
import { injectTheme, theme } from './ui_theme.js';

/** The kinds a target may be. A `menuFor` of anything else is an empty list. */
export const TARGET_KINDS = ['player', 'monster', 'npc', 'corpse', 'ground', 'item'];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const flat = (a, b) => Math.hypot(num(a?.x) - num(b?.x), num(a?.z) - num(b?.z));
const round = (n) => Math.round(num(n));

/** A row, with the two states of "can this run" filled in the same way every time. */
function row(id, label, run, { hint = '', why = '' } = {}) {
  return { id, label, hint, why, disabled: !!why, run: why ? () => ({ ok: false, why }) : run };
}

// ---------------------------------------------------------------------------
// The seven lists
// ---------------------------------------------------------------------------

/**
 * Your own body. The two emotes here are the two anybody uses; the wheel is one
 * row up from them for the other six.
 */
function playerRows(game) {
  const emotes = game.emotes || null;
  const windows = game.windows || null;
  const down = !!game.player?.dying;
  // The same two gates emotes.js checks, asked before the click rather than
  // after it, so a sit you cannot do is dim instead of being a refusal.
  const moving = !!(emotes && typeof emotes.walking === 'function' && emotes.walking());
  const noEmote = down ? 'not while you are down'
    : moving ? 'not on the move, stand still first'
      : !emotes ? 'the emotes are not running' : '';
  return [
    row('emote', 'Emotes', () => windows?.open('emotes'),
      { hint: 'the wheel of eight, the same one X opens', why: windows ? '' : 'there is no window layer' }),
    row('sit', 'Sit down', () => emotes.start('sit'), { hint: 'and stay sitting until you move', why: noEmote }),
    row('wave', 'Wave', () => emotes.start('wave'), { hint: 'two seconds of it', why: noEmote }),
    row('sheet', 'Character sheet', () => windows?.open('character'),
      { hint: 'stats, skills and what you are wearing', why: windows ? '' : 'there is no window layer' }),
    row('bag', 'Inventory', () => windows?.open('bag'),
      { hint: 'the pack', why: windows ? '' : 'there is no window layer' }),
  ];
}

/**
 * What the record says about a monster, as the lines a tooltip would carry.
 * Read off `mmo/monsters.js`'s own row and the live actor, so a health that
 * moved since the menu opened is the health the row was built from and nothing
 * is claimed that was not counted.
 */
export function monsterLines(mon) {
  const r = mon?.row || {};
  const a = mon?.actor || mon || {};
  const out = [];
  const name = mon?.name || r.name || 'it';
  out.push(`${name}${r.tier ? `, tier ${r.tier}` : ''}${r.boss ? ', a boss' : ''}`);
  if (r.kind || r.temperament) out.push([r.kind, r.temperament].filter(Boolean).join(', '));
  if (Number.isFinite(a.health) && Number.isFinite(a.maxHealth)) {
    out.push(`${Math.max(0, Math.round(a.health))} of ${Math.round(a.maxHealth)} health`);
  }
  if (Array.isArray(r.damage) && r.damage.length === 2) out.push(`hits for ${r.damage[0]} to ${r.damage[1]}`);
  if (Number.isFinite(r.hit) || Number.isFinite(r.def)) out.push(`attacks at ${num(r.hit)}, defends at ${num(r.def)}`);
  if (Array.isArray(r.notes) && r.notes.length) out.push(r.notes.join(', '));
  return out;
}

function monsterRows(game, target) {
  // `actor` on the target is monsters.pick's own record: the thing startAttack
  // takes, with the resolver's actor hanging off it as `.actor`.
  const mon = target.actor || null;
  const who = mon?.actor || mon || null;
  const name = mon?.name || 'it';
  const fight = game.combat || null;
  const dead = !who || num(who.health) <= 0;
  const already = !!(fight?.targeting && fight.targeting.current === who);
  const lines = monsterLines(mon);
  return [
    row('attack', `Attack the ${name}`, () => {
      fight.targeting?.set?.(who, 'menu');
      fight.startAttack(mon);
      return fight.swingAt(who, game.now(), game.now() / 1000, true);
    }, {
      hint: 'and keep swinging until one of you is down',
      why: !fight ? 'there is no fight running' : dead ? `the ${name} is already down` : '',
    }),
    row('inspect', `Inspect the ${name}`, () => {
      for (const line of lines) game.hud?.log?.(line);
      return { ok: true, lines };
    }, { hint: lines.join(' . ') }),
    row('target', 'Target only', () => fight.targeting.set(who, 'menu'), {
      hint: 'look at it without starting anything',
      why: !fight?.targeting?.set ? 'there is nothing to target with'
        : dead ? `the ${name} is already down` : already ? `you are already looking at the ${name}` : '',
    }),
  ];
}

/**
 * Talk, and the two things a role earns. Opening Talk is `windows.open('talk',
 * { npc })`, which is exactly the call `npcs_runtime.click` makes, so a person
 * reached by the menu and a person reached by a left click land on the same
 * panel with the same engine behind it.
 *
 * THE ONE SEAM. `win_talk.js` opens on its Talk tab and takes no tab in its
 * `extra`, and this agent does not own that file. So Trade and Train open the
 * panel the real way and THEN set the tab on the registered panel object, which
 * is the same object the window manager just called `open` on. If the panel is
 * ever given a tab in its `extra`, this becomes one argument and the reach into
 * `_tab` goes.
 */
function openTalk(game, npc, tab) {
  const windows = game.windows;
  const opened = !!windows?.open?.('talk', { npc, tab });
  if (!opened || !tab) return { ok: opened, tab: 'talk' };
  const panel = (windows.panels || []).find((p) => p && p.id === 'talk');
  if (panel && typeof panel.render === 'function' && panel._tab !== undefined) {
    panel._tab = tab;
    panel.render();
    return { ok: true, tab };
  }
  return { ok: true, tab: 'talk' };
}

function npcRows(game, target) {
  const npc = target.npc || null;
  const role = npc?.role || {};
  const who = npc ? plateText(npc) : 'nobody';
  const d = npc ? flat(npc, game.player?.pos) : Infinity;
  const far = d > TALK_REACH ? `${who} is ${round(d)} m off. Walk up to them.` : '';
  const sells = !!(role.sells?.length || role.buys?.length);
  const teaches = !!role.teaches?.length;
  const out = [row('talk', `Talk to ${npc?.personName || 'them'}`, () => openTalk(game, npc, null),
    { hint: who, why: far })];
  // Only the roles that have something behind the tab get the row, which is
  // the rule `win_talk.tabsFor` already applies to the tabs themselves.
  if (sells) {
    out.push(row('trade', 'Trade', () => openTalk(game, npc, role.sells?.length ? 'buy' : 'sell'),
      { hint: role.sells?.length ? `the ${role.name} sells ${role.sells.join(', ')}` : `the ${role.name} buys ${role.buys.join(', ')}`, why: far }));
  }
  if (teaches) {
    out.push(row('train', 'Train', () => openTalk(game, npc, 'train'),
      { hint: `teaches ${role.teaches.join(', ')}`, why: far }));
  }
  return out;
}

function corpseRows(game, target) {
  const corpse = target.corpse || null;
  const skinning = game.skinning || null;
  const loot = game.loot || null;
  const name = String(corpse?.row?.name || corpse?.name || 'it').toLowerCase();
  const knife = skinning?.knifeOf ? skinning.knifeOf() : { ok: false };
  const d = corpse ? flat(corpse.pos, game.player?.pos) : Infinity;
  const can = !!(skinning && corpse && skinning.canSkin(corpse));
  const whySkin = !skinning ? 'there is nothing to skin with'
    : corpse?.skinned ? `the ${name} is already skinned`
      : !knife.ok ? 'you carry no knife. A dagger in hand or a skinning knife in the pack.'
        : !can ? `there is nothing to skin on the ${name}`
          : d > SKIN_REACH ? `the ${name} is ${round(d)} m off, walk up to it` : '';
  // A body and its sack are two objects in the same place: the corpse is a
  // model monsters.js keeps for a while, and what it dropped is a loot_drops
  // bag lying beside it. Loot takes the bag, if there is one.
  const bag = loot && corpse ? loot.nearest(corpse.pos, BAG_REACH) : null;
  const reach = bag ? flat(bag.pos, game.player?.pos) : Infinity;
  return [
    row('skin', `Skin the ${name}`, () => skinning.skin(corpse, game.now()), {
      hint: knife.ok ? `with the ${knife.what} in your ${knife.where}` : 'a dagger or a skinning knife',
      why: whySkin,
    }),
    row('loot', 'Loot', () => loot.take(bag, game.takeLoot), {
      hint: 'everything the sack will give up',
      why: !loot ? 'there are no sacks in this world'
        : !bag ? `the ${name} left nothing lying here`
          : reach > BAG_REACH ? `the sack is ${round(reach)} m off, walk over to it` : '',
    }),
  ];
}

/**
 * Bare ground.
 *
 * THERE IS NO "WALK HERE", AND THAT IS NOT AN OVERSIGHT. Brackenwake has no
 * click to move: `app/systems/player.js` builds its move vector out of W, A, S,
 * D, shift and space and nothing else, and the rig's `update(dt, move,
 * heightAt)` takes that vector. A Walk here row would need a path, a follower
 * and a way to cancel it, none of which exist, and a row that quietly did
 * nothing would be the broken button CLAUDE.md keeps naming. The day there is a
 * mover, it goes in at the top of this list.
 */
function groundRows(game, target) {
  const p = target.point || { x: 0, z: 0 };
  const map = game.map || null;
  const had = game.character?.waypoint || null;
  const name = `the ground at ${round(p.x)}, ${round(p.z)}`;
  const out = [
    row('waypoint', 'Place a waypoint here', () => map.setWaypoint({ x: num(p.x), z: num(p.z), name }), {
      hint: 'the compass points at it until you clear it',
      why: map ? '' : 'there is no map to mark',
    }),
  ];
  // Only offered when there is one, because "clear" over an empty map is a
  // button whose whole answer is "there was nothing to clear".
  if (had) {
    out.push(row('clearWaypoint', `Clear the mark on ${had.name || 'the map'}`, () => map.clearWaypoint(), {
      hint: 'the compass goes back to pointing at nothing',
      why: map ? '' : 'there is no map to clear',
    }));
  }
  return out;
}

function itemRows(game, target) {
  const bag = target.bag || null;
  const loot = game.loot || null;
  const pos = game.player?.pos;
  const near = loot && typeof loot.bags === 'function'
    ? loot.bags().filter((b) => flat(b.pos, pos) <= BAG_REACH)
    : [];
  const d = bag ? flat(bag.pos, pos) : Infinity;
  const far = d > BAG_REACH ? `it is ${round(d)} m off, walk over to it` : '';
  const others = near.filter((b) => b !== bag);
  return [
    row('take', 'Take', () => loot.take(bag, game.takeLoot), {
      hint: loot?.labelFor ? loot.labelFor(bag) : 'what is in it',
      why: !loot || !bag ? 'there is nothing there' : far,
    }),
    row('takeAll', 'Take all', () => {
      // Every sack within arm's reach, this one first, each through the same
      // `take` a single click goes through, so each one says what went into the
      // pack and what would not fit.
      const done = [];
      for (const b of [bag, ...others]) done.push(loot.take(b, game.takeLoot));
      return { ok: true, bags: done.length, results: done };
    }, {
      hint: `${near.length} sack${near.length === 1 ? '' : 's'} within ${BAG_REACH} m`,
      why: !loot || !bag ? 'there is nothing there'
        : far ? far
          : others.length ? '' : 'this is the only sack in reach',
    }),
  ];
}

const BUILDERS = {
  player: playerRows,
  monster: monsterRows,
  npc: npcRows,
  corpse: corpseRows,
  ground: groundRows,
  item: itemRows,
};

/**
 * The rows for a target, in their fixed order.
 *
 * @param target { kind, ... }: `player`, `monster` (with monsters.pick's record
 *   as `actor`), `npc` (`npc`), `corpse` (`corpse`), `ground` (`point`) or
 *   `item` (`bag`).
 * @param game   the handles listed at the top of `app/systems/context_menu.js`.
 */
export function menuFor(target, game = {}) {
  const kind = target && target.kind;
  const build = BUILDERS[kind];
  if (!build) return [];
  const g = { now: () => Date.now(), ...game };
  return build(g, target || {});
}

/** Fails loudly if a kind is added to one list and not the other. */
export function auditContextMenu() {
  const bad = [];
  for (const k of TARGET_KINDS) if (!BUILDERS[k]) bad.push(`${k} is a kind with no rows`);
  for (const k of Object.keys(BUILDERS)) if (!TARGET_KINDS.includes(k)) bad.push(`${k} builds rows and is not a kind`);
  if (bad.length) throw new Error(`auditContextMenu: ${bad.join('; ')}`);
  return TARGET_KINDS.length;
}

// ---------------------------------------------------------------------------
// The list at the cursor
// ---------------------------------------------------------------------------

/** How wide and tall the list is assumed to be before it has been laid out. */
export const MENU_SIZE = { w: 190, rowH: 24, pad: 10 };
/** Kept this far in from the edge of the window. */
export const MENU_MARGIN = 6;

const CSS = `
#bw-ctx, #bw-ctx * { box-sizing: border-box; }
#bw-ctx {
  position: fixed; z-index: 400; min-width: ${MENU_SIZE.w}px; padding: 4px 0;
  font-family: ${theme.fonts.plain}; font-size: 12px;
  color: ${theme.parchment};
  background: linear-gradient(180deg, rgba(20,16,11,.97), rgba(6,5,4,.98));
  border: 1px solid ${theme.goldDim};
  box-shadow: 0 8px 26px rgba(0,0,0,.75), inset 0 0 0 1px rgba(0,0,0,.6);
  user-select: none;
}
#bw-ctx .bw-ctx-head {
  padding: 3px 12px 5px; margin-bottom: 3px;
  font-family: ${theme.fonts.display}; font-size: 9px; letter-spacing: .18em;
  text-transform: uppercase; color: ${theme.gold};
  border-bottom: 1px solid ${theme.goldDim}55;
}
#bw-ctx .bw-ctx-row {
  display: block; width: 100%; text-align: left;
  padding: 4px 12px; cursor: pointer; color: ${theme.parchment};
  background: transparent; border: 0; font: inherit;
}
#bw-ctx .bw-ctx-row.on { background: rgba(201,164,74,.18); color: ${theme.goldBright}; }
#bw-ctx .bw-ctx-row.off { color: ${theme.parchmentFaint}; cursor: default; }
#bw-ctx .bw-ctx-row.off.on { background: rgba(201,164,74,.07); color: ${theme.parchmentFaint}; }
`;

function ensureCss(doc) {
  if (!doc || typeof doc.createElement !== 'function' || !doc.head) return;
  // The shared tokens and the fonts, in case this is the first thing on the
  // page that wants them. It is a no-op every time after the first.
  injectTheme(doc);
  if (doc.getElementById && doc.getElementById('bw-ctx-css')) return;
  const s = doc.createElement('style');
  s.id = 'bw-ctx-css';
  s.textContent = CSS;
  doc.head.appendChild(s);
}

/**
 * The menu itself.
 *
 * THE KEYS ARE TAKEN IN THE CAPTURE PHASE AND STOPPED THERE. `input.js` listens
 * for keydown on `window` in the bubble phase, so a listener registered on
 * `window` with `capture: true` sees the key first, and `stopPropagation()`
 * there means the event never comes back up to the game's own listener. Without
 * that, Escape would close this menu AND the top window behind it, and the
 * arrows would be handed to whatever else reads them.
 *
 * A POINTER DOWN OUTSIDE CLOSES IT, AND IS EATEN. It is stopped and its default
 * prevented for the same reason: the click that dismisses a menu must not also
 * be a click on the wolf standing behind the menu.
 */
export function createContextMenu(root, opts = {}) {
  const doc = opts.document || (typeof document !== 'undefined' ? document : null);
  const win = opts.win || (typeof window !== 'undefined' ? window : null);
  if (!doc || typeof doc.createElement !== 'function') {
    return {
      el: null, get open() { return false; }, get rows() { return []; }, get index() { return -1; },
      openAt() { return null; }, close() { return false; }, move() { return -1; }, activate() { return null; },
      dispose() {},
    };
  }
  ensureCss(doc);

  const el = doc.createElement('div');
  el.id = 'bw-ctx';
  el.className = 'bw-ui';
  el.hidden = true;
  (root || doc.body).appendChild(el);

  let rows = [];
  let buttons = [];
  let index = -1;
  let open = false;
  const onRun = typeof opts.onRun === 'function' ? opts.onRun : null;

  const runnable = () => rows.map((r, i) => (r.disabled ? -1 : i)).filter((i) => i >= 0);

  function paint() {
    for (let i = 0; i < buttons.length; i++) buttons[i].classList.toggle('on', i === index);
  }

  /** Put the highlight on a row, without running it. */
  function focus(i) {
    if (i < 0 || i >= rows.length) return index;
    index = i;
    paint();
    return index;
  }

  /** One step through the rows that can actually run, wrapping at both ends. */
  function move(dir) {
    const live = runnable();
    if (!live.length) return index;
    const at = live.indexOf(index);
    const next = at < 0
      ? (dir > 0 ? live[0] : live[live.length - 1])
      : live[(at + (dir > 0 ? 1 : -1) + live.length) % live.length];
    return focus(next);
  }

  /** Run the highlighted row. A dimmed row is not run and the menu stays up. */
  function activate(i = index) {
    const r = rows[i];
    if (!r || r.disabled) return null;
    close();
    const out = r.run ? r.run() : null;
    if (onRun) onRun(r, out);
    return out;
  }

  function openAt(list, x, y, title = '') {
    rows = Array.isArray(list) ? list.filter(Boolean) : [];
    buttons = [];
    el.textContent = '';
    if (!rows.length) { close(); return null; }
    if (title) {
      const head = doc.createElement('div');
      head.className = 'bw-ctx-head';
      head.textContent = title;
      el.appendChild(head);
    }
    for (const r of rows) {
      const b = doc.createElement('button');
      b.className = `bw-ctx-row${r.disabled ? ' off' : ''}`;
      b.textContent = r.label;
      b.dataset.row = r.id;
      // A dimmed row wears its reason; a live one wears what it is about to do.
      const tip = r.disabled ? (r.why || '') : (r.hint || '');
      if (tip) b.title = tip;
      const at = buttons.length;
      b.addEventListener('mouseenter', () => focus(at));
      b.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        activate(at);
      });
      buttons.push(b);
      el.appendChild(b);
    }
    const live = runnable();
    index = live.length ? live[0] : -1;
    paint();

    // Keep it on the screen. Nothing has been laid out yet, so the height is
    // counted off the rows rather than read back off a box that is still empty.
    const w = MENU_SIZE.w;
    const h = MENU_SIZE.pad + rows.length * MENU_SIZE.rowH + (title ? MENU_SIZE.rowH : 0);
    const W = num(win?.innerWidth) || 1280;
    const H = num(win?.innerHeight) || 720;
    const left = Math.max(MENU_MARGIN, Math.min(num(x), W - w - MENU_MARGIN));
    const top = Math.max(MENU_MARGIN, Math.min(num(y), H - h - MENU_MARGIN));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.hidden = false;
    open = true;
    return rows;
  }

  function close() {
    if (!open) return false;
    open = false;
    el.hidden = true;
    el.textContent = '';
    rows = [];
    buttons = [];
    index = -1;
    return true;
  }

  const onKey = (e) => {
    if (!open) return;
    const k = String(e?.key || '').toLowerCase();
    const stop = () => { e.preventDefault?.(); e.stopPropagation?.(); };
    if (k === 'escape') { stop(); close(); return; }
    if (k === 'arrowdown') { stop(); move(1); return; }
    if (k === 'arrowup') { stop(); move(-1); return; }
    if (k === 'enter' || k === ' ') { stop(); activate(); }
  };

  const inside = (node) => { for (let n = node; n; n = n.parent || n.parentNode) if (n === el) return true; return false; };

  const onDown = (e) => {
    if (!open) return;
    if (inside(e?.target)) return;
    e?.preventDefault?.();
    e?.stopPropagation?.();
    close();
  };

  // A window that loses focus loses the menu with it: the keys that would have
  // walked it are going somewhere else now.
  const onBlur = () => { close(); };
  if (win?.addEventListener) {
    win.addEventListener('keydown', onKey, true);
    win.addEventListener('pointerdown', onDown, true);
    win.addEventListener('blur', onBlur);
  }

  return {
    el,
    get open() { return open; },
    get rows() { return rows.slice(); },
    get index() { return index; },
    get buttons() { return buttons.slice(); },
    openAt, close, move, focus, activate,
    /** For the harness and the suite: the keys, through the real listener. */
    key: (name) => onKey({ key: name, preventDefault() {}, stopPropagation() {} }),
    outside: (target) => onDown({ target: target || null, preventDefault() {}, stopPropagation() {} }),
    dispose() {
      close();
      if (win?.removeEventListener) {
        win.removeEventListener('keydown', onKey, true);
        win.removeEventListener('pointerdown', onDown, true);
        win.removeEventListener('blur', onBlur);
      }
      el.remove?.();
    },
  };
}

export default createContextMenu;
