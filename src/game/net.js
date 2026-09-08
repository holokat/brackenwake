// The multiplayer client, the pure half. Nothing in here touches the DOM, the
// scene or a real socket, so every rule is measured in node (net.test.mjs); the
// system in app/systems/net.js owns the bodies, the plates and the frame.
//
// The wire is JSON text frames against server/room_logic.mjs, one room per
// world (`roomNameFor`). The client says hello once, then its state ten times
// a second, and casts, when an ability lands on another player, go to that
// player alone as an `effect`. Everything the server relays carries the sender's
// `pid`, which is the character's id or `id#2` when two of the same are in.
//
//   client -> server   { t:'hello', id, name, look }
//                      { t:'state', p:[x,y,z], yaw, sp, an, hp, mhp, mp, mmp, st, mst, tg, hd }
//                      { t:'cast', to: pid, ability, payload }
//                      { t:'say', text }     { t:'ping', n }
//   server -> client   { t:'welcome', pid, players:[{pid,id,name,look,state}] }
//                      { t:'join', player }  { t:'leave', pid }  { t:'state', pid, ... }
//                      { t:'effect', from, name, ability, payload }
//                      { t:'say', from, name, text }   { t:'pong', n, now }

/** How often the local state goes out. Ten a second is the usual for a walking body. */
export const STATE_HZ = 10;
/** A remote body is drawn this far behind the newest sample, so there is always a next sample to lean on. */
export const INTERP_DELAY_S = 0.12;
/** Samples older than this are forgotten; a body with none for this long is treated as gone. */
export const REMOTE_TIMEOUT_S = 20;
/** Reconnect backoff, doubling from the first to the second. */
export const BACKOFF_MS = [1000, 10000];
/** A world name the server accepts. */
export const ROOM_RE = /^[a-z0-9_-]{1,40}$/;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const r2 = (v) => Math.round(num(v) * 100) / 100;

/** The room a world plays in: the sculpt header's world, else the seeded world's one room. */
export function roomNameFor(field) {
  const w = field && field.sculpt && field.sculpt.world;
  if (typeof w === 'string' && ROOM_RE.test(w)) return w;
  return field && field.sculpt ? 'sculpt' : 'seed';
}

/** The socket URL for a room, on the page's own origin (Vite proxies /ws to the worker in dev). */
export function wsUrlFor(loc, room) {
  const proto = loc && loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${loc.host}/ws/${room}`;
}

/** What another client needs to build this character's body. */
export function lookFor(character) {
  const eq = (character && character.equipment) || {};
  const gear = {};
  for (const slot of ['mainHand', 'offHand', 'outfit', 'neck', 'ring1', 'ring2']) {
    gear[slot] = eq[slot] && eq[slot].base ? eq[slot].base : null;
  }
  return { appearance: (character && character.appearance) || null, opening: (character && character.opening) || 'ranger', gear };
}

/** The hello, from the character. */
export function helloFor(character) {
  return { t: 'hello', id: String((character && character.id) || 'someone'), name: String((character && character.name) || 'Someone'), look: lookFor(character) };
}

/** One state frame off the local body and actor. */
export function encodeState({ pos, yaw, speed, anim, actor, target } = {}) {
  const p = pos || { x: 0, y: 0, z: 0 };
  const a = actor || {};
  return {
    t: 'state',
    p: [r2(p.x), r2(p.y), r2(p.z)],
    yaw: r2(yaw), sp: r2(speed), an: String(anim || 'idle'),
    hp: Math.round(num(a.health)), mhp: Math.round(num(a.maxHealth)),
    mp: Math.round(num(a.mana)), mmp: Math.round(num(a.maxMana)),
    st: Math.round(num(a.stamina)), mst: Math.round(num(a.maxStamina)),
    tg: target && target.pid ? String(target.pid) : '',
    hd: !!a.hidden,
  };
}

/** Shortest turn from a to b, in radians. */
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * The other players, as the wire describes them: who is here, and where each
 * one was over the last second, so a body can be drawn a little behind the
 * newest sample and move smoothly between two of them.
 */
export function createRemotes() {
  const byPid = new Map();
  const players = () => [...byPid.values()];

  function put(player, nowS) {
    const rec = byPid.get(player.pid) || { pid: player.pid, samples: [], seenAt: nowS };
    rec.id = player.id; rec.name = player.name; rec.look = player.look || null;
    rec.seenAt = nowS;
    if (player.state) sample(rec, player.state, nowS);
    byPid.set(player.pid, rec);
    return rec;
  }
  function sample(rec, st, nowS) {
    if (!Array.isArray(st.p) || st.p.length !== 3) return;
    rec.samples.push({ t: nowS, x: num(st.p[0]), y: num(st.p[1]), z: num(st.p[2]), yaw: num(st.yaw), sp: num(st.sp), an: st.an || 'idle' });
    while (rec.samples.length > 12) rec.samples.shift();
    rec.hp = num(st.hp); rec.mhp = num(st.mhp); rec.mp = num(st.mp); rec.mmp = num(st.mmp); rec.st = num(st.st); rec.mst = num(st.mst);
    rec.tg = st.tg || '';
    rec.hidden = !!st.hd;
    rec.seenAt = nowS;
  }

  return {
    /** Apply a server message. Returns what changed: { type, pid, rec } or null for messages that are not about a player. */
    apply(msg, nowS) {
      if (!msg || typeof msg !== 'object') return null;
      if (msg.t === 'welcome') {
        for (const p of msg.players || []) if (p && p.pid) put(p, nowS);
        return { type: 'welcome', pids: (msg.players || []).map((p) => p.pid) };
      }
      if (msg.t === 'join' && msg.player && msg.player.pid) return { type: 'join', pid: msg.player.pid, rec: put(msg.player, nowS) };
      if (msg.t === 'leave' && msg.pid) { const rec = byPid.get(msg.pid); byPid.delete(msg.pid); return { type: 'leave', pid: msg.pid, rec: rec || null }; }
      if (msg.t === 'state' && msg.pid) {
        const rec = byPid.get(msg.pid);
        if (!rec) return null;
        sample(rec, msg, nowS);
        return { type: 'state', pid: msg.pid, rec };
      }
      return null;
    },
    get(pid) { return byPid.get(pid) || null; },
    all: players,
    get size() { return byPid.size; },
    forget(pid) { byPid.delete(pid); },
    /** Everyone not heard from for REMOTE_TIMEOUT_S. */
    stale(nowS) { return players().filter((r) => nowS - r.seenAt > REMOTE_TIMEOUT_S).map((r) => r.pid); },
    /**
     * Where to draw a body now: the position INTERP_DELAY_S behind the newest
     * sample, between the two samples around that moment. Past the newest, it
     * holds still at the newest rather than guessing ahead. Null with no samples.
     */
    poseAt(pid, nowS) {
      const rec = byPid.get(pid);
      if (!rec || !rec.samples.length) return null;
      const s = rec.samples;
      const t = nowS - INTERP_DELAY_S;
      if (t >= s[s.length - 1].t || s.length === 1) { const l = s[s.length - 1]; return { x: l.x, y: l.y, z: l.z, yaw: l.yaw, speed: t > l.t + 0.5 ? 0 : l.sp, anim: l.an, hidden: !!rec.hidden }; }
      let i = s.length - 2;
      while (i > 0 && s[i].t > t) i--;
      const a = s[i], b = s[i + 1];
      const span = b.t - a.t;
      const u = span > 1e-6 ? Math.max(0, Math.min(1, (t - a.t) / span)) : 1;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, yaw: lerpAngle(a.yaw, b.yaw, u), speed: a.sp + (b.sp - a.sp) * u, anim: u < 0.5 ? a.an : b.an, hidden: !!rec.hidden };
    },
  };
}

/**
 * The socket, with the hello on open, JSON both ways and a reconnect that
 * backs off. `socketFactory(url)` makes something with the WebSocket shape
 * (onopen, onmessage, onclose, onerror, send, close, readyState); the test
 * hands in a fake, the game hands in `new WebSocket(url)`.
 */
/** The room beside this one: /ws/seed to /ws/seed-2, /ws/seed-2 to /ws/seed-3. */
export function nextRoomUrl(url) {
  const m = String(url).match(/^(.*\/ws\/[a-z0-9_]+(?:-[a-z0-9_]+)*?)(?:-(\d+))?$/);
  if (!m) return url;
  const n = m[2] ? Number(m[2]) + 1 : 2;
  return `${m[1]}-${n}`;
}

export function createNetClient({ url: firstUrl, hello, socketFactory, onMessage, onStatus, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let url = firstUrl;
  if (!url) throw new Error('createNetClient: no url');
  if (typeof socketFactory !== 'function') throw new Error('createNetClient: no socketFactory');
  let ws = null, pid = null, status = 'idle', attempts = 0, timer = null, closedByUs = false, sent = 0, received = 0, rooms = 0;
  const say = (s) => { status = s; if (typeof onStatus === 'function') onStatus(s, { attempts, pid }); };

  function connect() {
    if (closedByUs) return;
    if (timer) { clearTimer(timer); timer = null; }
    say(attempts ? 'reconnecting' : 'connecting');
    let sock;
    try { sock = socketFactory(url); } catch (e) { scheduleRetry(); return; }
    ws = sock;
    sock.onopen = () => {
      attempts = 0;
      say('open');
      if (hello) sock.send(JSON.stringify(typeof hello === 'function' ? hello() : hello));
    };
    sock.onmessage = (ev) => {
      let msg = null;
      try { msg = JSON.parse(typeof ev === 'string' ? ev : ev.data); } catch { return; }
      received++;
      if (msg && msg.t === 'welcome') pid = msg.pid;
      if (msg && msg.t === 'full') {
        // Twenty already in: the next room of this world, at once, not after a
        // backoff. The server keeps the socket open; we are the ones leaving.
        url = nextRoomUrl(url);
        rooms++;
        say('full');
        ws = null;
        try { sock.close(); } catch { /* closing anyway */ }
        connect();
        return;
      }
      if (typeof onMessage === 'function') onMessage(msg);
    };
    sock.onclose = () => { if (ws === sock) { ws = null; if (!closedByUs) { say('closed'); scheduleRetry(); } } };
    sock.onerror = () => { /* onclose follows */ };
  }
  function scheduleRetry() {
    if (closedByUs || timer) return;
    const wait = Math.min(BACKOFF_MS[1], BACKOFF_MS[0] * Math.pow(2, attempts));
    attempts++;
    say('waiting');
    timer = setTimer(() => { timer = null; connect(); }, wait);
  }

  return {
    connect,
    /** Send one message. False when there is no open socket; nothing is queued, the next state frame will do. */
    send(obj) {
      if (!ws || ws.readyState !== 1) return false;
      try { ws.send(JSON.stringify(obj)); sent++; return true; } catch { return false; }
    },
    close() { closedByUs = true; if (timer) { clearTimer(timer); timer = null; } if (ws) { try { ws.close(); } catch { /* already gone */ } ws = null; } say('closed'); },
    get connected() { return !!ws && ws.readyState === 1; },
    get pid() { return pid; },
    get status() { return status; },
    get url() { return url; },
    get rooms() { return rooms; },
    get attempts() { return attempts; },
    get counts() { return { sent, received }; },
  };
}
