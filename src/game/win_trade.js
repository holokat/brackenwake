// The trade window: two players, two piles, two ticks.
//
// 06-ECONOMY-UI.md: "each places items and gold, each ticks accept, both must
// accept after the last change. Nothing moves until both accept, and any change
// unticks both."
//
// The session below is pure: no THREE, no DOM, no timers. A side is anything
// with `{ name, gold, items, slots }`, which the player's own character
// document already is, and which the stub partner also is. When a server
// exists it replaces `createStubPartner` and nothing else changes, because the
// session never asks a side for anything but those four fields and never
// writes to one except inside `commit`.

/** Two players have to be this close to keep a trade open. */
export const TRADE_RANGE = 4;

const clampInt = (n) => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));

/** A side of the table, from a character document or a stub. */
export function sideOf(who, name) {
  return {
    name: name || who?.name || 'someone',
    get gold() { return who?.gold ?? 0; },
    set gold(v) { if (who) who.gold = v; },
    items: () => (who?.pack?.items || who?.items || []).filter(Boolean),
    slots: () => who?.pack?.slots ?? who?.slots ?? 20,
    give(item) {
      const list = who?.pack?.items || who?.items;
      if (!list) return false;
      const i = list.indexOf(item);
      if (i < 0) return false;
      if (who?.pack?.items) list[i] = null; else list.splice(i, 1);
      return true;
    },
    take(item) {
      const list = who?.pack?.items || who?.items;
      if (!list) return false;
      if (who?.pack?.items) {
        const free = list.indexOf(null);
        if (free < 0) {
          if (list.length >= this.slots()) return false;
          list.push(item);
          return true;
        }
        list[free] = item;
        return true;
      }
      if (list.length >= this.slots()) return false;
      list.push(item);
      return true;
    },
    room() {
      const list = (who?.pack?.items || who?.items || []);
      return this.slots() - list.filter(Boolean).length;
    },
  };
}

/**
 * A partner with the same interface as the player's side, so the flow is real
 * before there is anybody on the other end of it. It holds its own pack and its
 * own gold, and `mind` decides whether it ticks accept: 'never', 'always', or a
 * function of the offer. The default is 'never', which is honest: nobody is
 * there, and the window should say so rather than trading with a ghost.
 */
export function createStubPartner(opts = {}) {
  const who = {
    name: opts.name || 'a stranger',
    gold: opts.gold ?? 0,
    pack: { slots: opts.slots ?? 20, items: (opts.items || []).slice() },
  };
  const mind = opts.mind || 'never';
  return {
    who,
    isStub: true,
    side: sideOf(who, who.name),
    /** Called by the session after every change, so a server could answer here. */
    consider(state) {
      if (mind === 'always') return true;
      if (typeof mind === 'function') return !!mind(state);
      return false;
    },
  };
}

/**
 * @param opts.me       the player's character document
 * @param opts.them     a stub partner (or, later, a remote peer with the same shape)
 * @param opts.onChange called with the state after every change
 * @param opts.say      how the window talks; every state change goes through it
 */
export function createTrade(opts = {}) {
  const me = sideOf(opts.me, opts.me?.name || 'you');
  const partner = opts.them || createStubPartner();
  const them = partner.side || sideOf(partner, partner.name);
  const say = opts.say || (() => {});

  const offer = { me: { items: [], gold: 0 }, them: { items: [], gold: 0 } };
  const accepted = { me: false, them: false };
  let done = false;
  let lastChange = 0;

  const sideFor = (w) => (w === 'me' ? me : them);
  const other = (w) => (w === 'me' ? 'them' : 'me');

  function state() {
    return {
      done,
      names: { me: me.name, them: them.name },
      offer: { me: { items: [...offer.me.items], gold: offer.me.gold }, them: { items: [...offer.them.items], gold: offer.them.gold } },
      accepted: { ...accepted },
      changes: lastChange,
      ready: accepted.me && accepted.them,
    };
  }

  /** Any change to either pile unticks both, every time. That is the rule. */
  function changed(why) {
    lastChange++;
    const wasMe = accepted.me, wasThem = accepted.them;
    accepted.me = false;
    accepted.them = false;
    if (wasMe || wasThem) say(`${why} The ticks come off, and both of you have to accept again.`);
    else say(why);
    opts.onChange?.(state());
    // the other end gets to look again, which is where a server would answer
    if (partner.consider && partner.consider(state())) accepted.them = true;
    return state();
  }

  function put(w, item) {
    if (done) return { ok: false, text: say('That trade is over.') };
    const s = sideFor(w);
    if (!s.items().includes(item)) return { ok: false, text: say('That is not in the pack.') };
    if (offer[w].items.includes(item)) return { ok: false, text: say('It is already on the table.') };
    offer[w].items.push(item);
    changed(`${s.name} put ${nameOf(item)} on the table.`);
    return { ok: true, state: state() };
  }

  function pull(w, item) {
    if (done) return { ok: false, text: say('That trade is over.') };
    const i = offer[w].items.indexOf(item);
    if (i < 0) return { ok: false, text: say('That was never on the table.') };
    offer[w].items.splice(i, 1);
    changed(`${sideFor(w).name} took ${nameOf(item)} back.`);
    return { ok: true, state: state() };
  }

  function setGold(w, n) {
    if (done) return { ok: false, text: say('That trade is over.') };
    const s = sideFor(w);
    const want = clampInt(n);
    if (want > s.gold) {
      return { ok: false, text: say(`${s.name}: ${want} gold is more than the ${s.gold} in the purse.`) };
    }
    if (want === offer[w].gold) return { ok: true, state: state() };
    offer[w].gold = want;
    changed(`${s.name} offers ${want} gold.`);
    return { ok: true, state: state() };
  }

  /** Why a commit would fail, or null. Checked before either side can accept. */
  function blocker() {
    for (const w of ['me', 'them']) {
      const s = sideFor(w), o = offer[w], inc = offer[other(w)];
      if (o.gold > s.gold) return `${s.name}: ${o.gold} gold is not in the purse any more.`;
      for (const it of o.items) if (!s.items().includes(it)) return `${nameOf(it)} has gone from the pack on ${s.name}'s side.`;
      // room is counted after their own offered items leave
      const room = s.room() + o.items.length;
      if (inc.items.length > room) {
        return `${s.name}: room for ${room} more thing${room === 1 ? '' : 's'}, and ${inc.items.length} are being handed over.`;
      }
    }
    return null;
  }

  function setAccept(w, on = true) {
    if (done) return { ok: false, text: say('That trade is over.') };
    if (on) {
      const why = blocker();
      if (why) return { ok: false, text: say(`${why} Nothing has moved.`) };
      if (offer.me.items.length === 0 && offer.me.gold === 0 && offer.them.items.length === 0 && offer.them.gold === 0) {
        return { ok: false, text: say('There is nothing on the table to accept.') };
      }
    }
    accepted[w] = !!on;
    say(on ? `${sideFor(w).name} accepts.` : `${sideFor(w).name} takes the tick off.`);
    opts.onChange?.(state());
    if (accepted.me && accepted.them) return commit();
    return { ok: true, state: state() };
  }

  /** Nothing moves until here, and here only runs when both ticks are on. */
  function commit() {
    if (done) return { ok: false, text: say('That trade is over.') };
    if (!(accepted.me && accepted.them)) return { ok: false, text: say('Both of you have to accept first.') };
    const why = blocker();
    if (why) {
      accepted.me = false; accepted.them = false;
      return { ok: false, text: say(`${why} Nothing moved, and the ticks are off.`) };
    }
    // items first, out of both packs, then into the other, then the gold
    for (const w of ['me', 'them']) for (const it of offer[w].items) sideFor(w).give(it);
    for (const w of ['me', 'them']) for (const it of offer[w].items) sideFor(other(w)).take(it);
    const g = offer.me.gold - offer.them.gold;
    me.gold = me.gold - offer.me.gold + offer.them.gold;
    them.gold = them.gold - offer.them.gold + offer.me.gold;
    done = true;
    const mine = offer.me.items.length, theirs = offer.them.items.length;
    const text = say(
      `Done. You handed over ${mine} thing${mine === 1 ? '' : 's'} and ${offer.me.gold} gold, `
      + `and took ${theirs} thing${theirs === 1 ? '' : 's'} and ${offer.them.gold} gold. `
      + `${g > 0 ? `You are ${g} gold down.` : g < 0 ? `You are ${-g} gold up.` : 'The gold came out even.'}`,
    );
    opts.onChange?.(state());
    return { ok: true, committed: true, state: state(), text };
  }

  function cancel(who = 'me') {
    if (done) return { ok: false };
    done = true;
    const text = say(`The trade is off. ${sideFor(who).name} walked away, and nothing moved.`);
    opts.onChange?.(state());
    return { ok: true, cancelled: true, text };
  }

  return { me, them, partner, put, pull, setGold, setAccept, commit, cancel, state, blocker, offer, accepted };
}

const nameOf = (it) => it?.label || it?.name || it?.base || 'something';

// ---------------------------------------------------------------------------
// The panel.

const CSS = `
.bw-win-trade .bw-two{display:flex;gap:14px}
.bw-win-trade .bw-pane{flex:1 1 0;min-width:0;border:1px solid #2f3a2e;border-radius:8px;padding:8px 10px}
.bw-win-trade .bw-pane h4{margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8fa387}
.bw-win-trade .bw-slot{display:flex;align-items:center;gap:8px;padding:4px 0;border-top:1px solid #262f26}
.bw-win-trade .bw-slot .n{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
.bw-win-trade button{font:inherit;font-size:12px;padding:3px 8px;border-radius:6px;
  border:1px solid #4f6349;background:#2c3a2b;color:#e8f0e2;cursor:pointer}
.bw-win-trade button:disabled{opacity:.5;cursor:default}
.bw-win-trade .bw-tick{margin-top:8px;display:flex;align-items:center;gap:8px}
.bw-win-trade .bw-tick .on{color:#8fe08a}
.bw-win-trade .bw-tick .off{color:#8b9686}
.bw-win-trade .bw-gold{display:flex;align-items:center;gap:6px;margin-top:8px;color:#e3c26a}
.bw-win-trade .bw-gold input{width:82px;font:inherit;padding:2px 6px;border-radius:5px;
  border:1px solid #4f6349;background:#1a211a;color:#e8f0e2}
.bw-win-trade .bw-log{margin-top:10px;color:#95a08f;font-size:12.5px;min-height:2.6em}
`;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export const panel = {
  id: 'trade',
  title: 'Trade',
  key: null,

  build(root, ctx) {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('bw-trade-css')) {
      const st = document.createElement('style');
      st.id = 'bw-trade-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    root.classList.add('bw-win-trade');
    root.textContent = '';
    this._root = root;
    this._ctx = ctx;
    this._two = el('div', 'bw-two');
    this._log = el('div', 'bw-log');
    root.append(this._two, this._log);
  },

  open(ctx, extra) {
    this._ctx = ctx || this._ctx;
    const them = extra?.partner || createStubPartner({ name: extra?.name || 'a stranger' });
    this._trade = createTrade({
      me: this._ctx?.character,
      them,
      say: (t) => { this._say(t); return t; },
      onChange: () => this.render(),
    });
    this._say(`A trade with ${them.side?.name || 'a stranger'}. Nothing moves until you both accept.`);
    this.render();
  },

  close() { this._trade?.cancel('me'); this._trade = null; },

  _say(text) {
    this._ctx?.hud?.log?.(text);
    if (this._log) this._log.textContent = text;
  },

  render() {
    const t = this._trade;
    if (!this._root || !t || typeof document === 'undefined') return;
    const s = t.state();
    this._two.textContent = '';

    const pane = (which) => {
      const side = which === 'me' ? t.me : t.them;
      const box = el('div', 'bw-pane');
      box.appendChild(el('h4', null, `${side.name}${which === 'me' ? '' : ''}`));
      const offered = s.offer[which].items;
      if (!offered.length) box.appendChild(el('div', 'bw-slot', 'nothing on the table'));
      for (const it of offered) {
        const r = el('div', 'bw-slot');
        r.appendChild(el('span', 'n', nameOf(it)));
        if (which === 'me') {
          const b = el('button', null, 'take back');
          b.disabled = s.done;
          b.addEventListener('click', () => t.pull('me', it));
          r.appendChild(b);
        }
        box.appendChild(r);
      }
      const gold = el('div', 'bw-gold');
      gold.appendChild(el('span', null, 'gold'));
      if (which === 'me') {
        const inp = el('input');
        inp.type = 'number'; inp.min = '0'; inp.value = String(s.offer.me.gold);
        inp.disabled = s.done;
        inp.addEventListener('change', () => t.setGold('me', Number(inp.value)));
        gold.appendChild(inp);
        gold.appendChild(el('span', null, `of ${t.me.gold}`));
      } else {
        gold.appendChild(el('span', null, String(s.offer.them.gold)));
      }
      box.appendChild(gold);
      const tick = el('div', 'bw-tick');
      tick.appendChild(el('span', s.accepted[which] ? 'on' : 'off', s.accepted[which] ? 'accepted' : 'not accepted'));
      if (which === 'me') {
        const b = el('button', null, s.accepted.me ? 'take the tick off' : 'accept');
        b.disabled = s.done;
        b.addEventListener('click', () => t.setAccept('me', !s.accepted.me));
        tick.appendChild(b);
      }
      box.appendChild(tick);
      return box;
    };

    this._two.append(pane('me'), pane('them'));

    // what you could still put on the table
    const mine = el('div', 'bw-pane');
    mine.appendChild(el('h4', null, 'your pack'));
    const on = new Set(s.offer.me.items);
    const spare = t.me.items().filter((i) => !on.has(i));
    if (!spare.length) mine.appendChild(el('div', 'bw-slot', 'the pack is empty'));
    for (const it of spare.slice(0, 20)) {
      const r = el('div', 'bw-slot');
      r.appendChild(el('span', 'n', nameOf(it)));
      const b = el('button', null, 'offer');
      b.disabled = s.done;
      b.addEventListener('click', () => t.put('me', it));
      r.appendChild(b);
      mine.appendChild(r);
    }
    this._two.appendChild(mine);
  },
};

export default panel;
