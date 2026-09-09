import {publicTitleId} from '../src/game/achievements/titles.js';
import {createCellarRaid} from './cellar_raid.mjs';
const STATE_NUMBER_FIELDS = ['yaw', 'sp', 'hp', 'mhp', 'mp', 'mmp', 'st', 'mst'];

const emptyResult = () => ({ toSelf: [], toOthers: [], toAll: [], to: [] });

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const asString = (value) => String(value ?? '');

const publicPlayer = (player) => ({
  pid: player.pid,
  id: player.id,
  name: player.name,
  look: player.look,
  state: player.state ? { ...player.state, p: [...player.state.p] } : null,
});

const fullPlayer = (player) => ({
  ...publicPlayer(player),
  connId: player.connId,
});

const normalizeState = (msg) => {
  if (!Array.isArray(msg.p) || msg.p.length !== 3) return null;
  const p = msg.p.map(Number);
  if (!p.every(Number.isFinite)) return null;

  const state = {
    ...(publicTitleId(msg.title) ? {title: publicTitleId(msg.title)} : {}),
    ...(typeof msg.layer==='string'&&msg.layer.length<=80?{layer:msg.layer}:{}),
    p,
    yaw: 0,
    sp: 0,
    an: asString(msg.an),
    hp: 0,
    mhp: 0,
    mp: 0,
    mmp: 0,
    st: 0,
    mst: 0,
    tg: asString(msg.tg),
    hd: !!msg.hd,
  };

  for (const field of STATE_NUMBER_FIELDS) state[field] = Number(msg[field]);
  return state;
};

/** Players a room seats before it sends the next one to the room beside it. */
export const ROOM_CAP = 20;

export function createRoomLogic() {
  const raid=createCellarRaid();
  const mergeRaid=(out,events)=>{for(const e of events){if(e.broadcast)out.toAll.push(e.broadcast);else if(e.to)out.to.push({connId:e.to,msg:e.msg});}return out;};
  const byConn = new Map();
  const connByPid = new Map();

  const removeConn = (connId) => {
    const player = byConn.get(connId);
    if (!player) return null;
    byConn.delete(connId);
    if (connByPid.get(player.pid) === connId) connByPid.delete(player.pid);
    return player;
  };

  const putPlayer = (player) => {
    removeConn(player.connId);
    const previousConnId = connByPid.get(player.pid);
    if (previousConnId && previousConnId !== player.connId) byConn.delete(previousConnId);
    byConn.set(player.connId, player);
    connByPid.set(player.pid, player.connId);
  };

  const claimPid = (id) => {
    const base = asString(id);
    if (!connByPid.has(base)) return base;
    for (let i = 2; ; i++) {
      const pid = `${base}#${i}`;
      if (!connByPid.has(pid)) return pid;
    }
  };

  return {
    join(connId, hello) {
      removeConn(connId);
      const id = asString(hello?.id ?? connId);
      // The same character arriving again is the same player, not a second
      // one: a reload, a dropped line, a tab that never said goodbye. The old
      // seat is emptied (the room closes that socket) and the plain pid is
      // theirs again, so nobody is haunted by "ada" standing beside "ada#2".
      const evict = [];
      const toOthers = [];
      const oldConn = connByPid.get(id);
      if (oldConn && oldConn !== connId) {
        const old = removeConn(oldConn);
        evict.push(oldConn);
        if (old) toOthers.push({ t: 'leave', pid: old.pid });
      }
      // Twenty to a room (the user, 2026-09-08). The next arrival is told
      // 'full' and takes no seat; the client moves to the next room of the
      // same world (`seed-2`, then `seed-3`) until one has a place.
      if (byConn.size >= ROOM_CAP) {
        return { toSelf: [{ t: 'full', cap: ROOM_CAP }], toOthers, toAll: [], to: [], evict };
      }
      const pid = claimPid(id);
      const player = {
        pid,
        id,
        name: asString(hello?.name),
        look: hello?.look,
        state: null,
        connId,
        seenAt: Date.now(),
      };
      const others = [...byConn.values()].map(publicPlayer);
      putPlayer(player);
      toOthers.push({ t: 'join', player: publicPlayer(player) });
      return {
        toSelf: [{ t: 'welcome', pid, players: others },raid.packet([...byConn.values()],Date.now())],
        toOthers,
        toAll: [],
        to: [],
        evict,
      };
    },

    /**
     * Seats nobody has spoken from for `maxAgeMs`. A socket that died without
     * a close frame keeps its seat otherwise; the room's alarm calls this.
     */
    sweep(nowMs = Date.now(), maxAgeMs = 45000) {
      const toOthers = [];
      const evict = [];
      for (const player of [...byConn.values()]) {
        if (nowMs - (player.seenAt || 0) <= maxAgeMs) continue;
        removeConn(player.connId);
        evict.push(player.connId);
        toOthers.push({ t: 'leave', pid: player.pid });
      }
      return mergeRaid({ toSelf: [], toOthers, toAll: [], to: [], evict },raid.tick([...byConn.values()],nowMs));
    },

    handle(connId, msg) {
      const player = byConn.get(connId);
      if (!player || !isObject(msg)) return emptyResult();

      player.seenAt = Date.now();
      if(msg.t==='raidStrike')return mergeRaid(emptyResult(),raid.strike(player,msg,[...byConn.values()],Date.now()));
      if(msg.t==='raidAck'){raid.ack(player.pid,msg.run);return emptyResult();}
      if (msg.t === 'state') {
        const state = normalizeState(msg);
        if (!state) return emptyResult();
        player.state = state;
        return mergeRaid({
          toSelf: [],
          toOthers: [{ t: 'state', pid: player.pid, ...state }],
          toAll: [],
          to: [],
        },raid.tick([...byConn.values()],Date.now()));
      }

      if (msg.t === 'cast') {
        const targetConnId = connByPid.get(asString(msg.to));
        if (!targetConnId) return emptyResult();
        return {
          toSelf: [],
          toOthers: [],
          toAll: [],
          to: [{
            connId: targetConnId,
            msg: { t: 'effect', from: player.pid, name: player.name, ability: msg.ability, payload: msg.payload },
          }],
        };
      }

      if (msg.t === 'say') {
        const text = asString(msg.text).trim().slice(0, 240);
        if (!text) return emptyResult();
        return {
          toSelf: [],
          toOthers: [],
          toAll: [{ t: 'say', from: player.pid, name: player.name, text }],
          to: [],
        };
      }

      if (msg.t === 'ping') {
        return {
          toSelf: [{ t: 'pong', n: msg.n, now: Date.now() }],
          toOthers: [],
          toAll: [],
          to: [],
        };
      }

      return emptyResult();
    },

    leave(connId) {
      const player = removeConn(connId);
      if (!player) return emptyResult();
      return {
        toSelf: [],
        toOthers: [{ t: 'leave', pid: player.pid }],
        toAll: [],
        to: [],
      };
    },

    restore(connId, player) {
      if (!isObject(player)) return emptyResult();
      const restored = {
        pid: asString(player.pid ?? player.id ?? connId),
        id: asString(player.id ?? player.pid ?? connId),
        name: asString(player.name),
        look: player.look,
        state: isObject(player.state) ? normalizeState(player.state) : null,
        connId,
        seenAt: Number.isFinite(player.seenAt) ? player.seenAt : Date.now(),
      };
      putPlayer(restored);
      return emptyResult();
    },

    saveRaid:()=>raid.save(), restoreRaid:raw=>raid.restore(raw), get raidActive(){return raid.active;}, get raidRevision(){return raid.revision;},
    players() {
      return [...byConn.values()].map(fullPlayer);
    },

    get size() {
      return byConn.size;
    },
  };
}
