// Two tabs, one channel, one trade.
//
//   const net = createTradeNet({ character, name: character.name, at: () => player.pos });
//   net.update(now);                              // in the frame; sends hello, ages peers
//   for (const p of net.nearby()) ...             // who is within 4 m
//   windows.open('trade', { partner: net.partnerFor(p.id) });
//
// 06-ECONOMY-UI: "Two players within 4 m can open a trade window: each places
// items and gold, each ticks accept, both must accept after the last change.
// Nothing moves until both accept, and any change unticks both. This is written
// now against the local state and becomes a server call unchanged when the
// server exists."
//
// So this file is the wire and nothing else. The rules stay in `win_trade.js`
// where they were written and tested: everything arriving from the other tab is
// applied through the same public calls the buttons use (`put('them', item)`,
// `setAccept('them', true)`, `cancel('them')`), so there is one accept rule in
// the game and the test path is the real path.
//
// ---------------------------------------------------------------------------
// The protocol
// ---------------------------------------------------------------------------
// Every message: `{ p, from, to, seq, kind, ... }`.
//
//   p      the protocol number. A tab running an older build is ignored.
//   from   the sender's session id, made fresh per tab per load.
//   to     a session id, or null for everybody (hello).
//   seq    the sender's own counter, one message one step, never reused.
//
//   hello     { name, pos, gold }        every second, to everybody
//   offer     { rev, items, gold, room, slots }
//   accept    { rev, ack }
//   unaccept  { rev, ack }
//   cancel    { why }
//   complete  { rev }
//
// Three things are thrown away rather than acted on, and each is counted in
// `stats` so a test can prove it happened:
//
//   a `seq` that is not ahead of the last one seen from that session   (stale)
//   a message from a session that is not the one being traded with     (stranger)
//   an `accept` whose `ack` is not the revision of the offer we are
//     actually showing, or whose `rev` is not the offer we have applied,
//     which is the case where both sides changed something at once      (crossed)
//
// ---------------------------------------------------------------------------
// Where the items really are
// ---------------------------------------------------------------------------
// Each tab runs its own `createTrade` against its own character document, and
// mirrors the other side: the remote `side` holds copies of what the peer put
// on the table, and its `room()` is what the peer says it has left. Nothing
// leaves a document until that document's own `commit` runs, and that only runs
// when both ticks are on. So an item leaves one document and arrives in the
// other exactly once, and a cancel, a crossed message or a tab that closes
// mid-trade moves nothing at all, because nothing had moved yet.
//
// A bare `complete` NEVER moves anything. If the peer says it committed and we
// did not, the trade is cancelled and said out loud, because the alternative is
// a message that can take items out of a pack.

import { TRADE_RANGE } from './win_trade.js';

export const TRADE_CHANNEL = 'brackenwake-trade';
export const PROTOCOL = 1;
/** How often a hello goes out, and how long a silent peer stays on the list. */
export const HELLO_MS = 1000;
export const PEER_STALE_MS = 4000;

const num = (v) => (Number.isFinite(v) ? v : 0);
const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

// ---------------------------------------------------------------- the wire

const LOOPS = new Map();

/**
 * A BroadcastChannel that works where there is no BroadcastChannel: a set of
 * ports sharing a name, delivering to everyone but the sender, one microtask
 * later, which is what a real channel does. The tests drive two of these.
 */
export function createLoopback(name = TRADE_CHANNEL) {
  let set = LOOPS.get(name);
  if (!set) { set = new Set(); LOOPS.set(name, set); }
  const port = {
    name, onmessage: null, closed: false, loopback: true,
    postMessage(data) {
      if (port.closed) return;
      const wire = clone(data);
      for (const other of set) {
        if (other === port || other.closed) continue;
        queueMicrotask(() => { if (!other.closed) other.onmessage?.({ data: clone(wire) }); });
      }
    },
    close() { port.closed = true; set.delete(port); },
  };
  set.add(port);
  return port;
}

/** A real channel where there is one, and the loopback where there is not. */
export function openChannel(name = TRADE_CHANNEL) {
  if (typeof BroadcastChannel === 'function') {
    try { return new BroadcastChannel(name); } catch (e) { /* fall through */ }
  }
  return createLoopback(name);
}

/** What one item on the table looks like on the wire, for a minimal diff. */
const sigOf = (it) => [it?.base, it?.rarity, it?.seed, it?.count ?? 1, it?.label ?? '', it?.material ?? ''].join('|');

// ---------------------------------------------------------------- the net

export function createTradeNet(opts = {}) {
  const { character } = opts;
  const myName = opts.name || character?.name || 'someone';
  const chan = opts.transport || openChannel(opts.channel || TRADE_CHANNEL);
  const rng = opts.rng || Math.random;
  const id = opts.id || `s${Math.floor(rng() * 0xffffffff).toString(36)}${Math.floor(rng() * 0xffffffff).toString(36)}`;
  const at = () => {
    const p = typeof opts.at === 'function' ? opts.at() : opts.at;
    return p || character?.pos || { x: 0, y: 0, z: 0 };
  };
  /** One clock for the whole net, so ageing a peer and the frame agree. */
  const clock = () => (typeof opts.now === 'function' ? opts.now() : Date.now());
  const say = (text, kind) => {
    if (!text) return text;
    if (typeof opts.hud?.log === 'function') opts.hud.log(text, kind);
    else opts.hud?.toast?.(text, kind);
    return text;
  };

  let seq = 0;
  const lastSeq = new Map();          // session id -> the last seq acted on
  const peers = new Map();            // session id -> { id, name, pos, gold, room, slots, at }
  const partners = new Map();         // session id -> the partner object
  const stats = { sent: 0, seen: 0, stale: 0, stranger: 0, crossed: 0, hellos: 0, trades: 0, committed: 0 };
  const onPeers = [];
  const onInvite = [];
  let lastHello = -Infinity;
  let closed = false;

  const send = (kind, to, body = {}) => {
    if (closed) return null;
    // The name rides on every message, not only the hello: a tab that opens a
    // trade before its first hello has landed should still be a person by name
    // and not "someone".
    const msg = { p: PROTOCOL, from: id, to: to || null, seq: ++seq, kind, name: myName, ...body };
    stats.sent++;
    chan.postMessage(msg);
    return msg;
  };

  const firePeers = () => { for (const cb of onPeers) { try { cb(list()); } catch (e) { /* a listener is not the net */ } } };

  // ------------------------------------------------------------- the peers

  function list() {
    const here = at();
    const out = [];
    for (const p of peers.values()) {
      const dist = Math.hypot(num(p.pos?.x) - num(here.x), num(p.pos?.z) - num(here.z));
      out.push({ ...p, dist, nearby: dist <= TRADE_RANGE, trading: partners.has(p.id) });
    }
    return out.sort((a, b) => a.dist - b.dist);
  }

  const nearby = () => list().filter((p) => p.nearby);

  /** A hello now, whatever the clock says. Sent on open and on every update. */
  function hello() {
    const here = at();
    stats.hellos++;
    return send('hello', null, {
      name: myName,
      pos: { x: Math.round(num(here.x) * 100) / 100, z: Math.round(num(here.z) * 100) / 100 },
      gold: num(character?.gold),
    });
  }

  /** In the frame. Sends a hello every second and drops peers gone 4 s. */
  function update(now) {
    if (closed) return;
    const t = num(now == null ? clock() : now);
    if (t - lastHello >= HELLO_MS) { lastHello = t; hello(); }
    let dropped = false;
    for (const [pid, p] of [...peers]) {
      if (t - p.at < PEER_STALE_MS) continue;
      peers.delete(pid);
      dropped = true;
      const partner = partners.get(pid);
      if (partner) partner.end(`${p.name} is gone. The trade is off and nothing moved.`);
    }
    if (dropped) firePeers();
  }

  // ---------------------------------------------------------- the partner

  /**
   * The other side of the table, with exactly the shape `createStubPartner`
   * has (`who`, `side`, `consider`) plus the two optional methods win_trade.js
   * calls on a partner that has them.
   */
  function makePartner(peerId, hint) {
    const peer = peers.get(peerId) || { id: peerId, name: hint || 'someone', gold: 0, room: 20, slots: 20 };
    const mirror = [];                       // what they have put on the table
    let purse = num(peer.gold);
    let free = num(peer.room) || 20;
    let slotCount = num(peer.slots) || 20;

    let api = null;
    let applying = null;                     // the kind being applied from the wire
    let rev = 0;                             // our own offer revision
    let theirRev = -1;                       // the last offer revision of theirs
    let ack = -1;                            // the rev of ours they last saw
    let ended = false;
    const queue = [];

    const side = {
      get name() { return peers.get(peerId)?.name || peer.name; },
      get gold() { return purse; },
      set gold(v) { purse = num(v); },
      items: () => mirror.slice(),
      slots: () => slotCount,
      give(item) {
        const i = mirror.indexOf(item);
        if (i < 0) return false;
        mirror.splice(i, 1);
        return true;
      },
      take() { if (free <= 0) return false; free--; return true; },
      room: () => free,
    };

    const partner = {
      peerId,
      remote: true,
      isStub: false,
      /** For shape parity with the stub. The real pack is in the other tab. */
      who: { get name() { return side.name; }, get gold() { return purse; }, pack: { get slots() { return slotCount; }, items: mirror } },
      side,
      /** A person answers by message, never by mind. */
      consider() { return false; },

      attach(a) {
        api = a;
        stats.trades++;
        sendOffer();
        while (queue.length) partner.receive(queue.shift());
      },

      sync(kind, state) {
        if (ended || !api) return;
        if (applying && kind !== 'complete') return;    // never echo what arrived
        if (kind === 'offer') return sendOffer(state);
        if (kind === 'accept' || kind === 'unaccept') return send(kind, peerId, { rev, ack: theirRev });
        if (kind === 'cancel') { ended = true; partners.delete(peerId); return send('cancel', peerId, { why: 'walked away' }); }
        if (kind === 'complete') { stats.committed++; return send('complete', peerId, { rev }); }
        return null;
      },

      receive(msg) {
        if (ended) return { applied: false, why: 'over' };
        if (!api) { queue.push(msg); return { applied: false, why: 'queued' }; }
        switch (msg.kind) {
          case 'offer': return applyOffer(msg);
          case 'accept': return applyAccept(msg, true);
          case 'unaccept': return applyAccept(msg, false);
          case 'cancel': return applyCancel(msg);
          case 'complete': return applyComplete(msg);
          default: return { applied: false, why: 'unknown' };
        }
      },

      /** Walk away and say so on the wire. A tab closing does this. */
      leave(why) {
        if (ended) return;
        send('cancel', peerId, { why: 'walked away' });
        partner.end(why);
      },

      /** The peer went quiet or the window closed. Nothing had moved. */
      end(why) {
        if (ended) return;
        ended = true;
        partners.delete(peerId);
        if (api && !api.state().done) {
          applying = 'cancel';
          try { api.cancel('them'); } finally { applying = null; }
        }
        say(why, 'bad');
      },

      get rev() { return rev; },
      get theirRev() { return theirRev; },
      get mirror() { return mirror.slice(); },
    };

    function sendOffer(state) {
      const s = state || api?.state();
      if (!s) return null;
      rev++;
      return send('offer', peerId, {
        rev,
        items: clone(s.offer.me.items),
        gold: s.offer.me.gold,          // what is on the table
        purse: num(character?.gold),    // what is in the purse behind it
        room: api.me.room(),            // free slots, offered items still in them
        slots: api.me.slots(),
      });
    }

    function applyOffer(msg) {
      theirRev = num(msg.rev);
      purse = Math.max(num(msg.gold), num(msg.purse));
      free = num(msg.room);
      slotCount = num(msg.slots) || slotCount;

      const want = (msg.items || []).filter(Boolean);
      const have = api.state().offer.them.items;
      const wantSigs = want.map(sigOf);
      const haveSigs = have.map(sigOf);

      // what is on the table and should not be, and what should be and is not
      const spare = [...wantSigs];
      const drop = [];
      for (let i = 0; i < have.length; i++) {
        const k = spare.indexOf(haveSigs[i]);
        if (k >= 0) spare.splice(k, 1); else drop.push(have[i]);
      }
      const keep = [...haveSigs];
      const add = [];
      for (let i = 0; i < want.length; i++) {
        const k = keep.indexOf(wantSigs[i]);
        if (k >= 0) keep.splice(k, 1); else add.push(want[i]);
      }

      applying = 'offer';
      try {
        for (const it of drop) { api.pull('them', it); side.give(it); }
        for (const it of add) { mirror.push(it); api.put('them', it); }
        api.setGold('them', num(msg.gold));
      } finally { applying = null; }

      // Their table moved without our tick coming off, which happens when a
      // crossed accept made us re-send an offer that changed nothing. Our tick
      // is still on, so it has to be said again against the new revisions or
      // the trade sits there with one side ticked and the other never told.
      if (api.state().accepted.me) send('accept', peerId, { rev, ack: theirRev });
      return { applied: true, added: add.length, removed: drop.length };
    }

    function applyAccept(msg, on) {
      // Both sides changed something at once: their tick is for a table that is
      // no longer the one either of us is looking at. Throw it away and say
      // where we are, rather than committing a trade nobody agreed to.
      if (on && (num(msg.ack) !== rev || num(msg.rev) !== theirRev)) {
        stats.crossed++;
        sendOffer();
        return { applied: false, why: 'crossed', ack: num(msg.ack), rev, theirRev };
      }
      if (!on && !api.state().accepted.them) return { applied: false, why: 'was not ticked' };
      applying = on ? 'accept' : 'unaccept';
      try { api.setAccept('them', on); } finally { applying = null; }
      return { applied: true, committed: api.state().done };
    }

    function applyCancel() {
      ended = true;
      partners.delete(peerId);
      applying = 'cancel';
      try { if (!api.state().done) api.cancel('them'); } finally { applying = null; }
      return { applied: true };
    }

    function applyComplete() {
      if (api.state().done) return { applied: true, why: 'both sides are done' };
      // See the header: a bare complete never moves anything.
      partner.end(`${side.name} says the trade went through and it did not go through here. Nothing moved.`);
      return { applied: false, why: 'not committed here' };
    }

    partners.set(peerId, partner);
    return partner;
  }

  /** The partner for a peer, made once and kept while the trade is open. */
  function partnerFor(peerId, hint) {
    return partners.get(peerId) || makePartner(peerId, hint);
  }

  // ------------------------------------------------------------ receiving

  function receive(data) {
    if (closed) return { ok: false, why: 'closed' };
    const msg = data && data.data ? data.data : data;
    if (!msg || msg.p !== PROTOCOL) return { ok: false, why: 'protocol' };
    if (msg.from === id) return { ok: false, why: 'self' };
    if (msg.to && msg.to !== id) return { ok: false, why: 'not for us' };

    const seen = lastSeq.get(msg.from);
    if (seen != null && num(msg.seq) <= seen) { stats.stale++; return { ok: false, why: 'stale', seq: msg.seq, seen }; }
    lastSeq.set(msg.from, num(msg.seq));
    stats.seen++;

    if (msg.kind === 'hello') {
      const had = peers.has(msg.from);
      peers.set(msg.from, {
        id: msg.from, name: msg.name || 'someone', pos: msg.pos || { x: 0, z: 0 },
        gold: num(msg.gold), room: num(msg.room) || 20, slots: num(msg.slots) || 20,
        at: clock(),
      });
      if (!had) firePeers();
      return { ok: true, kind: 'hello' };
    }

    // Everything else belongs to a trade, and only to the session it is with.
    const partner = partners.get(msg.from);
    if (!partner) {
      // Only an offer opens a table. An accept, an unaccept, a cancel or a
      // complete from a session we are not trading with is somebody else's
      // trade, or somebody trying to steer ours, and is thrown away.
      if (msg.kind !== 'offer') { stats.stranger++; return { ok: false, why: 'stranger', from: msg.from }; }
      if (!onInvite.length) {
        send('cancel', msg.from, { why: 'nobody is at that table' });
        return { ok: false, why: 'no window' };
      }
      const made = makePartner(msg.from, msg.name);
      made.receive(msg);                         // queued until the window attaches
      for (const cb of onInvite) { try { cb(made, peers.get(msg.from) || null); } catch (e) { /* a listener is not the net */ } }
      return { ok: true, kind: 'invite' };
    }
    return { ok: true, kind: msg.kind, result: partner.receive(msg) };
  }

  chan.onmessage = (ev) => { receive(ev); };
  hello();

  return {
    id, name: myName, channel: chan, stats,
    peers: list, nearby, partnerFor, update, hello, receive,
    /** True for a session whose partner is open. */
    trading: (peerId) => partners.has(peerId),
    /** The trade this net has open with a peer, if any. */
    partner: (peerId) => partners.get(peerId) || null,
    onPeers(cb) { onPeers.push(cb); return () => { const i = onPeers.indexOf(cb); if (i >= 0) onPeers.splice(i, 1); }; },
    /** Somebody opened a trade with us. Open the window against this partner. */
    onInvite(cb) { onInvite.push(cb); return () => { const i = onInvite.indexOf(cb); if (i >= 0) onInvite.splice(i, 1); }; },
    /** A tab closing mid-trade. Everything is still where it was. */
    close() {
      if (closed) return;
      for (const p of [...partners.values()]) {
        try { p.leave('You closed the window. Nothing moved.'); } catch (e) { /* going anyway */ }
      }
      closed = true;
      try { chan.close?.(); } catch (e) { /* going anyway */ }
    },
  };
}

export default createTradeNet;
