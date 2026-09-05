// The waystones, and what happens when you put your hand on one.
//
// The sheet, `src/mmo/realms.js`, the place `waystones`, The Standing Hedge:
//
//   "Touch a stone with the dragon awake and it is yours; from then on any
//    waystone carries you to any other you own, once a day per stone. The
//    Legion has tried for a century and been refused."
//
// That sentence is the whole of this file. Every clause of it is a gate here
// with words of its own, and `waystones.test.mjs` drives all four both ways.
//
// WHERE THE STONES ARE, and why this file does not invent one of them.
//
//   Sixteen stones stand in the world today and not one of them is placed here.
//   Seven are the standing stones at the edge of the seven precinct towns'
//   squares, laid out by `town_layout.layoutTown` and built by `town_models`
//   with `userData.waystone` on them. Nine are the tall stones of the Standing
//   Hedge, built by `megalith_models.waystones` on a ring 805 m out from the
//   site's own centre. This file reads the first seven off the same plan the
//   town is built from, and rebuilds the nine off the same two numbers the
//   megalith uses, which are `HEDGE_R` and nine.
//
//   HEDGE_R IS A COPY. `megalith_models.js` is V1's file and holds its 805 as a
//   local. The number is checkable from outside: `zones.BODY_R.waystones` is
//   811, which that file sets as `R + 6`, and `waystones.test.mjs` asserts
//   HEDGE_R + 6 === BODY_R.waystones. If V1 widens the ring and forgets this
//   file, the test fails rather than the stones quietly moving apart.
//
// WHICH STONE IS WHICH. The sheet says the nine "each twinned with a stone in
// another realm". So each of the nine carries a realm, assigned by compass:
// the nine realms are sorted by their bearing from the middle of the ring and
// laid onto the nine stones in that order, at the rotation that puts every
// realm nearest to its own side of the ring. It is worked out once, at load,
// from `realms.js` alone, so moving a realm moves its stone.
//
// A DAY IS THE DAY CLOCK'S DAY. `DAY_CYCLE_MS` is 25 real minutes, and "once a
// day per stone" is that, counted from the moment you left a stone. The stone
// you arrive at is not spent; the one you left is.

import { DAY_CYCLE_MS } from './dayclock.js';
import { REALMS } from '../mmo/realms.js';
import { layoutTown } from '../world/town_layout.js';

/** The radius of the Standing Hedge's ring of nine, in metres. See the note above. */
export const HEDGE_R = 805;
/** How many tall stones the ring has. The sheet's own number. */
export const HEDGE_STONES = 9;
/** How near a stone you have to be to put your hand on it, in metres. */
export const TOUCH_REACH = 8;
/** A stone you have left carries nobody else for this long. One day clock. */
export const COOLDOWN_MS = DAY_CYCLE_MS;

const num = (v) => (Number.isFinite(v) ? v : 0);
const dist = (a, b) => Math.hypot(num(a?.x) - num(b?.x), num(a?.z) - num(b?.z));

/** "in 12 minutes", "in under a minute". Never a bare number of milliseconds. */
export function whenAgain(ms) {
  if (!(ms > 0)) return 'now';
  const mins = Math.ceil(ms / 60000);
  if (mins <= 1) return 'in under a minute';
  return `in ${mins} minutes`;
}

/** "240 m", "3.1 km". What a picker puts beside a name. */
export function farWords(m) {
  const d = Math.max(0, num(m));
  return d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
}

// ---------------------------------------------------------------------------
// The nine, and which realm each of them answers.

/**
 * The realms in the order they lie round the ring, and the rotation that puts
 * each of them on its own side of it. Pure, from `realms.js` and one centre.
 */
export function twinsFor(cx, cz, realms = REALMS) {
  const TAU = Math.PI * 2;
  const rs = realms
    .map((r) => ({ id: r.id, name: r.name, a: ((Math.atan2(r.z - cz, r.x - cx) % TAU) + TAU) % TAU }))
    .sort((a, b) => a.a - b.a);
  let best = { k: 0, worst: Infinity };
  for (let k = 0; k < HEDGE_STONES; k++) {
    let worst = 0;
    rs.forEach((r, i) => {
      const sa = (((i + k) % HEDGE_STONES) / HEDGE_STONES) * TAU;
      const d = Math.abs((((r.a - sa + Math.PI * 3) % TAU)) - Math.PI);
      if (d > worst) worst = d;
    });
    if (worst < best.worst) best = { k, worst };
  }
  const out = new Array(HEDGE_STONES).fill(null);
  rs.forEach((r, i) => { out[(i + best.k) % HEDGE_STONES] = r; });
  return { stones: out, worst: best.worst };
}

/**
 * What a stone calls a realm. "The Saltmarch and the Thousand Isles Stone" is
 * a signpost nobody would read, so a realm's name is taken as far as its first
 * "and". Every other realm's name is left exactly as the sheet writes it.
 */
export const shortRealm = (name) => String(name).replace(/^The /, '').split(' and ')[0];

/** The compass word for a bearing, for a line that says where on the ring. */
const COMPASS = ['east', 'south east', 'south', 'south west', 'west', 'north west', 'north', 'north east'];
export function bearingWord(a) {
  const TAU = Math.PI * 2;
  const t = ((a % TAU) + TAU) % TAU;
  return COMPASS[Math.round(t / TAU * 8) % 8];
}

/**
 * The nine stones of the Standing Hedge, at the same nine points
 * `megalith_models.waystones` raises them.
 */
export function hedgeStones(site, realms = REALMS) {
  if (!site) return [];
  const { stones } = twinsFor(site.x, site.z, realms);
  const out = [];
  for (let i = 0; i < HEDGE_STONES; i++) {
    const a = (i / HEDGE_STONES) * Math.PI * 2;
    const twin = stones[i];
    out.push({
      id: `way:hedge:${twin.id}`,
      kind: 'hedge',
      name: `the ${shortRealm(twin.name)} Stone`,
      where: `the Standing Hedge, ${bearingWord(a)} of the ring`,
      realm: site.realm || 'greenwold',
      place: site.sub || 'waystones',
      twin: twin.id,
      x: site.x + Math.cos(a) * HEDGE_R,
      z: site.z + Math.sin(a) * HEDGE_R,
    });
  }
  return out;
}

/**
 * Every waystone in the world, from the authored site rows. Pure: hand it
 * `zones.authoredSites()` and it hands back the sixteen.
 *
 * A town that has no plan has no square and therefore no stone, which is what
 * keeps the rolled villages and the Drowned Mill out of the list.
 */
export function waystonesFrom(sites, opts = {}) {
  const realms = opts.realms || REALMS;
  const plan = opts.layoutTown || layoutTown;
  const out = [];
  for (const s of sites || []) {
    if (s.kind === 'town') {
      let p = null;
      try { p = plan(s, 0); } catch { p = null; }
      if (!p || !p.waystone) continue;
      out.push({
        id: `way:${s.sub}`,
        kind: 'town',
        name: s.name,
        where: `the square at ${s.name}`,
        realm: s.realm,
        place: s.sub,
        twin: null,
        x: p.waystone.x,
        z: p.waystone.z,
      });
    } else if (s.sub === 'waystones') {
      out.push(...hedgeStones(s, realms));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The runtime.

/**
 * @param deps {
 *   character,          the document. `character.waystones` is the record.
 *   stones,             () => the rows from waystonesFrom, or the array itself
 *   hud,                log and toast: every gate here owes a line
 *   dragon,             () => the dragon entity, for `awake`
 *   teleport,           (x, z, label) => truthy: the five things a warp is
 *   pos,                () => the player's position
 *   now,                () => ms, the same clock the frame runs on
 *   audio,              optional, for the refusal cue
 *   legion,             () => whether this character wears the Legion's colours
 * }
 */
export function createWaystones(deps = {}) {
  const {
    character = {}, hud = null, dragon = null, teleport = null,
    pos = null, now = null, audio = null, legion = null,
  } = deps;

  const stonesOf = () => {
    const s = typeof deps.stones === 'function' ? deps.stones() : deps.stones;
    return Array.isArray(s) ? s : [];
  };
  const at = () => (typeof pos === 'function' ? pos() : pos) || { x: 0, z: 0 };
  const clock = () => (typeof now === 'function' ? num(now()) : num(now));
  const beast = () => (typeof dragon === 'function' ? dragon() : dragon);
  const isLegion = () => {
    if (typeof legion === 'function') return !!legion();
    if (legion != null) return !!legion;
    return character.faction === 'legion' || character.legion === true;
  };

  // ---- the record, made whole whatever the save had in it ------------------
  const rec = (() => {
    const raw = character.waystones;
    const r = { owned: [], used: {} };
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if (Array.isArray(raw.owned)) r.owned = raw.owned.filter((k) => typeof k === 'string');
      if (raw.used && typeof raw.used === 'object') {
        for (const [k, v] of Object.entries(raw.used)) if (Number.isFinite(v)) r.used[k] = v;
      }
    }
    character.waystones = r;
    return r;
  })();

  const say = (text, kind) => {
    if (!text) return text;
    if (hud && typeof hud.log === 'function') hud.log(text, kind);
    else if (hud && typeof hud.toast === 'function') hud.toast(text, kind);
    return text;
  };
  const refuse = (text) => { audio?.play?.('denied'); return say(text, 'bad'); };

  const byId = (id) => stonesOf().find((s) => s.id === id) || null;
  const owns = (id) => rec.owned.includes(id);
  const owned = () => stonesOf().filter((s) => owns(s.id));

  /** How long this stone will not carry anybody, in ms. 0 when it will. */
  function cooldownLeft(id, t = clock()) {
    const used = num(rec.used[id]);
    if (!used) return 0;
    const left = COOLDOWN_MS - (t - used);
    // A clock that has gone backwards (a fresh session, a save from another
    // day) must never leave a stone cold for ever.
    if (left > COOLDOWN_MS) { delete rec.used[id]; return 0; }
    return left > 0 ? left : 0;
  }

  /** The nearest stone to a point, and how far off it is. */
  function nearest(p = at()) {
    let best = null, bd = Infinity;
    for (const s of stonesOf()) {
      const d = dist(s, p);
      if (d < bd) { bd = d; best = s; }
    }
    return best ? { stone: best, distance: bd } : null;
  }

  /** The stone you are standing at, or null. */
  const standingAt = (p = at()) => {
    const n = nearest(p);
    return n && n.distance <= TOUCH_REACH ? n.stone : null;
  };

  /**
   * Put your hand on one. The four clauses of the sheet's sentence, in the
   * order a player meets them, each with words.
   */
  function touch(which, opts = {}) {
    const p = opts.at || at();
    const stone = typeof which === 'string' ? byId(which) : (which || null);
    const target = stone || standingAt(p);
    if (!target) {
      const n = nearest(p);
      return { ok: false, reason: 'no_stone', text: refuse(n
        ? `There is no waystone in reach. The nearest is ${n.stone.name}, ${farWords(n.distance)} off.`
        : 'There is no waystone in reach.') };
    }
    const d = dist(target, p);
    if (d > TOUCH_REACH) {
      return { ok: false, reason: 'too_far', stone: target, text: refuse(`${target.name} is ${farWords(d)} off. Walk up and put your hand on it.`) };
    }
    if (isLegion()) {
      return { ok: false, reason: 'legion', stone: target, text: refuse(`${target.name} does nothing at all under your hand. The Legion has been trying this for a century and the stones have never once answered.`) };
    }
    const dr = beast();
    if (!dr) {
      return { ok: false, reason: 'no_dragon', stone: target, text: refuse(`${target.name} is cold. A waystone takes a dragon's word for you and there is no dragon on your shoulder.`) };
    }
    if (!dr.awake) {
      const name = dr.name || 'the hatchling';
      return { ok: false, reason: 'asleep', stone: target, text: refuse(`${target.name} stays cold. ${name} is down, and a stone will not know you while the dragon that vouches for you is not awake.`) };
    }
    if (owns(target.id)) {
      return { ok: false, reason: 'already', stone: target, text: say(`${target.name} is already yours. It is warm where your hand goes and it will carry you ${whenAgain(cooldownLeft(target.id))}.`) };
    }
    rec.owned.push(target.id);
    opts.onOwn?.(target, rec.owned.length);
    const others = owned().filter((s) => s.id !== target.id);
    const tail = others.length
      ? ` You hold ${others.length + 1} stones now, and any one of them will carry you to any other.`
      : ' It is the first stone you hold. Take a second one and the two of them will answer each other.';
    return {
      ok: true, stone: target, owned: rec.owned.length,
      text: say(`${target.name} knows you. The stone goes warm under your hand and stays warm.${tail}`, 'good'),
    };
  }

  /** Everywhere an owned stone could carry you from `fromId`, for the picker. */
  function destinations(fromId, t = clock()) {
    const from = byId(fromId);
    const p = from || at();
    return owned()
      .filter((s) => s.id !== fromId)
      .map((s) => ({ stone: s, distance: dist(s, p), cooldown: 0 }))
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Go. `fromId` defaults to the stone you are standing at, because that is the
   * only place the sheet lets you leave from.
   */
  function travel(toId, opts = {}) {
    const t = num(opts.now ?? clock());
    const p = opts.at || at();
    const from = opts.from ? byId(opts.from) : standingAt(p);
    const to = byId(toId);
    if (!to) return { ok: false, reason: 'no_such', text: refuse('There is no waystone by that name.') };
    if (!from) {
      return { ok: false, reason: 'not_at_stone', text: refuse('You are not standing at a waystone. They carry you from one stone to another and from nowhere else.') };
    }
    if (isLegion()) {
      return { ok: false, reason: 'legion', from, to, text: refuse(`${from.name} does nothing. The stones do not carry the Legion and never have.`) };
    }
    if (!owns(from.id)) {
      return { ok: false, reason: 'unowned_from', from, to, text: refuse(`${from.name} is not yours yet. Put your hand on it with the dragon awake first.`) };
    }
    if (!owns(to.id)) {
      return { ok: false, reason: 'unowned_to', from, to, text: refuse(`${to.name} is not yours. A stone only answers a stone you have touched.`) };
    }
    if (from.id === to.id) {
      return { ok: false, reason: 'same', from, to, text: refuse(`You are standing at ${to.name}. It will not carry you to itself.`) };
    }
    const left = cooldownLeft(from.id, t);
    if (left > 0) {
      return { ok: false, reason: 'cooldown', from, to, left, text: refuse(`${from.name} has already carried you today. It will answer again ${whenAgain(left)}.`) };
    }
    const moved = teleport ? teleport(to.x, to.z, to.name) : false;
    if (!moved) {
      return { ok: false, reason: 'no_teleport', from, to, text: refuse(`${from.name} goes warm and nothing happens. Nothing here can move you.`) };
    }
    rec.used[from.id] = t;
    return {
      ok: true, from, to, x: to.x, z: to.z,
      text: say(`${from.name} carries you to ${to.name}, ${farWords(dist(from, to))} in the time it takes to take your hand off the stone. ${from.name} is spent now and will answer again ${whenAgain(COOLDOWN_MS)}.`, 'good'),
    };
  }

  return {
    all: stonesOf, byId, owns, owned, nearest, standingAt,
    touch, travel, destinations, cooldownLeft,
    record: rec,
    get count() { return rec.owned.length; },
    TOUCH_REACH, COOLDOWN_MS,
  };
}

// ---------------------------------------------------------------------------
// The picker.
//
// A window of its own rather than a tab of Talk: a stone is not a person, and
// the Talk panel's whole shape is a role's shelf. It is registered by
// `app/systems/story.js` and opened by a touch on a stone you already own.

const CSS = `
.bw-win-waystones .bw-way-head{font-size:15px;font-weight:600;margin:0 0 2px}
.bw-win-waystones .bw-way-where{color:#95a08f;font-size:12px;margin:0 0 10px}
.bw-win-waystones .bw-list{display:flex;flex-direction:column;gap:2px;max-height:46vh;overflow:auto}
.bw-win-waystones .bw-r{display:flex;align-items:center;gap:10px;padding:6px 2px;border-top:1px solid #2a332a}
.bw-win-waystones .bw-r .n{flex:1 1 auto}
.bw-win-waystones .bw-r .n small{display:block;color:#8b9686;font-size:11.5px}
.bw-win-waystones .bw-r .p{color:#e3c26a;font-variant-numeric:tabular-nums;min-width:72px;text-align:right}
.bw-win-waystones .bw-r button{font:inherit;font-size:12px;padding:4px 9px;border-radius:6px;
  border:1px solid #4f6349;background:#2c3a2b;color:#e8f0e2;cursor:pointer;white-space:nowrap}
.bw-win-waystones .bw-r button:disabled{opacity:.5;cursor:default}
.bw-win-waystones .bw-none{color:#8b9686;padding:8px 2px}
`;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export const panel = {
  id: 'waystones',
  title: 'Waystones',
  key: null,                 // opened by a hand on a stone, never by a key

  build(root, ctx) {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('bw-waystones-css')) {
      const st = document.createElement('style');
      st.id = 'bw-waystones-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    root.classList.add('bw-win-waystones');
    this._root = root;
    this._ctx = ctx;
    root.textContent = '';
    this._head = el('p', 'bw-way-head');
    this._where = el('p', 'bw-way-where');
    this._body = el('div', 'bw-body');
    root.append(this._head, this._where, this._body);
  },

  open(ctx, extra) {
    this._ctx = ctx || this._ctx;
    this._from = extra?.from || extra?.stone || null;
    this.render();
  },

  close() { this._from = null; },

  render() {
    const ways = this._ctx?.waystones;
    if (!this._root || typeof document === 'undefined') return;
    if (!ways) { this._body.textContent = 'The stones are not wired here.'; return; }
    const from = typeof this._from === 'string' ? ways.byId(this._from) : (this._from || ways.standingAt());
    this._head.textContent = from ? from.name : 'No stone under your hand';
    this._where.textContent = from
      ? `${from.where}. ${ways.cooldownLeft(from.id) > 0 ? `Spent, and it answers again ${whenAgain(ways.cooldownLeft(from.id))}.` : 'It will carry you once, and then not again today.'}`
      : 'Walk up to a waystone and put your hand on it.';
    this._body.textContent = '';
    const list = el('div', 'bw-list');
    const rows = from ? ways.destinations(from.id) : [];
    if (!rows.length) {
      list.appendChild(el('div', 'bw-none', from
        ? 'You hold no other stone yet. Every one you touch is somewhere this one can put you.'
        : 'You hold no stones.'));
    }
    const cold = from ? ways.cooldownLeft(from.id) : 0;
    for (const d of rows) {
      const r = el('div', 'bw-r');
      const n = el('span', 'n', d.stone.name);
      n.appendChild(el('small', null, d.stone.where));
      r.append(n, el('span', 'p', farWords(d.distance)));
      const b = el('button', null, 'go');
      b.disabled = cold > 0;
      b.addEventListener('click', () => {
        const res = ways.travel(d.stone.id, { from: from.id });
        if (res.ok) this._ctx?.windows?.close?.('waystones');
        else this.render();
      });
      r.appendChild(b);
      list.appendChild(r);
    }
    // What the ring is for, said where a player can read it: the nine stones
    // name the realms, and a name with nothing behind it is a direction.
    if (from && from.kind === 'hedge') {
      const twin = ways.all().find((s) => s.realm === from.twin && s.kind === 'town');
      const line = !twin
        ? `${from.name} is twinned with a stone that has not been raised yet.`
        : ways.owns(twin.id)
          ? `${from.name} is twinned with ${twin.name}, and you hold that one.`
          : `${from.name} is twinned with ${twin.name}, which you have not touched.`;
      this._body.appendChild(el('div', 'bw-none', line));
    }
    this._body.appendChild(list);
  },
};

export default panel;
