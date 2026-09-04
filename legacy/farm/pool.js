// Generic NIP-01 relay pool for the homestead: named subscriptions + profile cache.

export const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

export function npubToHex(input) {
  const s = input.trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase();
  if (!s.startsWith('npub1')) return null;
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const data = [];
  for (const ch of s.slice(5).toLowerCase()) {
    const v = CHARSET.indexOf(ch);
    if (v === -1) return null;
    data.push(v);
  }
  const words = data.slice(0, -6); // drop checksum
  let acc = 0, bits = 0;
  const bytes = [];
  for (const w of words) {
    acc = (acc << 5) | w;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  if (bytes.length !== 32) return null;
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class Pool {
  constructor({ onStatus, onProfile } = {}) {
    this.onStatus = onStatus || (() => {});
    this.onProfile = onProfile || (() => {});
    this.sockets = new Map();
    this.subs = new Map();   // id -> { filters, onEvent, seen:Set }
    this.backoff = new Map();
    this.profiles = new Map();
    this.wantProfiles = new Set();
    this.askedProfiles = new Set();
    this.profSerial = 0;
    this.okWaiters = new Map();
  }

  publish(event) {
    const frame = JSON.stringify(['EVENT', event]);
    let sent = 0;
    for (const ws of this.sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) { ws.send(frame); sent++; }
    }
    if (!sent) return Promise.reject(new Error('no open relays'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.okWaiters.delete(event.id); reject(new Error('relay timeout')); }, 8000);
      this.okWaiters.set(event.id, (accepted) => {
        clearTimeout(timer);
        accepted ? resolve() : reject(new Error('relay rejected the note'));
      });
    });
  }

  connect() {
    for (const url of RELAYS) this._open(url);
    setInterval(() => this._flushProfiles(), 900);
  }

  _open(url) {
    this.onStatus(url, 'connecting');
    let ws;
    try { ws = new WebSocket(url); } catch { this.onStatus(url, 'error'); return; }
    this.sockets.set(url, ws);

    ws.onopen = () => {
      this.onStatus(url, 'open');
      this.backoff.delete(url);
      for (const [id, sub] of this.subs) {
        ws.send(JSON.stringify(['REQ', id, ...sub.filters]));
      }
    };

    ws.onmessage = (msg) => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      const [type, subId, ev] = data;
      if (type === 'EVENT') {
        if (!ev || typeof ev !== 'object') return;
        if (subId.startsWith('prof-')) { this._takeProfile(ev); return; }
        const sub = this.subs.get(subId);
        if (!sub || sub.seen.has(ev.id)) return;
        sub.seen.add(ev.id);
        sub.onEvent(ev, url);
      } else if (type === 'EOSE') {
        const sub = this.subs.get(subId);
        if (sub?.onEose) sub.onEose(url);
      } else if (type === 'OK') {
        const [, id, accepted] = data;
        const waiter = this.okWaiters.get(id);
        if (waiter) { waiter(!!accepted); this.okWaiters.delete(id); }
      }
    };

    ws.onclose = () => {
      this.onStatus(url, 'closed');
      const delay = this.backoff.get(url) || 5000;
      this.backoff.set(url, Math.min(delay * 2, 120000));
      setTimeout(() => { if (this.sockets.get(url) === ws) this._open(url); }, delay);
    };
    ws.onerror = () => this.onStatus(url, 'error');
  }

  req(id, filters, onEvent, onEose) {
    this.subs.set(id, { filters, onEvent, onEose, seen: new Set() });
    const frame = JSON.stringify(['REQ', id, ...filters]);
    for (const ws of this.sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(frame);
    }
  }

  close(id) {
    this.subs.delete(id);
    const frame = JSON.stringify(['CLOSE', id]);
    for (const ws of this.sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(frame);
    }
  }

  // ---- profiles ----

  _takeProfile(ev) {
    if (ev.kind !== 0) return;
    const prev = this.profiles.get(ev.pubkey);
    if (prev && prev.created_at >= ev.created_at) return;
    let profile;
    try { profile = JSON.parse(ev.content); } catch { return; }
    this.profiles.set(ev.pubkey, { profile, created_at: ev.created_at });
    this.onProfile(ev.pubkey, profile);
  }

  wantProfile(pubkey) {
    if (!this.profiles.has(pubkey) && !this.askedProfiles.has(pubkey)) this.wantProfiles.add(pubkey);
  }

  refetchProfile(pubkey) {
    if (this.profiles.has(pubkey)) return;
    this.askedProfiles.delete(pubkey);
    this.wantProfiles.add(pubkey);
  }

  getProfile(pubkey) {
    return this.profiles.get(pubkey)?.profile;
  }

  _flushProfiles() {
    const open = [...this.sockets.values()].filter((ws) => ws.readyState === WebSocket.OPEN);
    if (!open.length) return; // keep the queue until a relay is up
    const batch = [...this.wantProfiles].slice(0, 50);
    if (!batch.length) return;
    for (const pk of batch) { this.askedProfiles.add(pk); this.wantProfiles.delete(pk); }
    const sub = `prof-${++this.profSerial}`;
    const frame = JSON.stringify(['REQ', sub, { kinds: [0], authors: batch }]);
    for (const ws of this.sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(frame);
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(['CLOSE', sub]));
        }, 8000);
      }
    }
  }
}
