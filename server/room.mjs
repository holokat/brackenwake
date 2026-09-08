import { DurableObject } from 'cloudflare:workers';
import { createRoomLogic } from './room_logic.mjs';

const decoder = new TextDecoder();

const parseMessage = (message) => {
  try {
    if (typeof message === 'string') return JSON.parse(message);
    if (message instanceof ArrayBuffer) return JSON.parse(decoder.decode(message));
    return null;
  } catch {
    return null;
  }
};

/** How often the room checks for seats nobody has spoken from. */
export const SWEEP_MS = 20000;

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.logic = createRoomLogic();
    this.sockets = new Map();
    this.rebuildSockets();
    this.raidRevision=-1;
    ctx.blockConcurrencyWhile(async()=>{this.logic.restoreRaid(await ctx.storage.get('cellarRaid'));});
  }

  fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const connId = crypto.randomUUID();

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ connId });
    this.sockets.set(connId, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const msg = parseMessage(message);
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;

    const connId = this.connIdFor(ws);
    if (!connId) return;

    if (msg.t === 'hello') {
      const out = this.logic.join(connId, msg);
      this.savePlayer(ws, connId);
      this.deliver(out, connId);
      // the sweep runs while anyone is seated; setAlarm replaces any earlier one
      this.ctx.storage.getAlarm().then((at) => { if (at == null) return this.ctx.storage.setAlarm(Date.now() + SWEEP_MS); }).catch(() => {});
      return;
    }

    const out = this.logic.handle(connId, msg);
    this.savePlayer(ws, connId);
    await this.saveRaid();
    this.deliver(out, connId);
  }

  webSocketClose(ws) {
    this.drop(ws);
  }

  webSocketError(ws) {
    this.drop(ws);
  }

  rebuildSockets() {
    this.sockets.clear();
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (!attachment?.connId) continue;
      this.sockets.set(attachment.connId, ws);
      if (attachment.player) this.logic.restore(attachment.connId, attachment.player);
    }
  }

  ensureSockets() {
    if (this.sockets.size === 0) this.rebuildSockets();
  }

  connIdFor(ws) {
    const attachment = ws.deserializeAttachment();
    if (attachment?.connId) {
      this.sockets.set(attachment.connId, ws);
      return attachment.connId;
    }

    this.ensureSockets();
    for (const [connId, socket] of this.sockets) {
      if (socket === ws) return connId;
    }
    return '';
  }

  savePlayer(ws, connId) {
    const player = this.logic.players().find((p) => p.connId === connId);
    if (player) ws.serializeAttachment({ connId, player });
  }

  deliver(out, sourceConnId) {
    this.ensureSockets();
    // a seat the logic emptied: the old socket of a character who came back, or one nobody heard from
    for (const connId of out.evict || []) {
      const ws = this.sockets.get(connId);
      this.sockets.delete(connId);
      if (ws) { try { ws.close(4000, 'replaced'); } catch { /* already gone */ } }
    }
    for (const msg of out.toSelf) this.sendToConn(sourceConnId, msg);
    for (const msg of out.toOthers) this.sendToOthers(sourceConnId, msg);
    for (const msg of out.toAll) this.sendToAll(msg);
    for (const entry of out.to) this.sendToConn(entry.connId, entry.msg);
  }

  async saveRaid(){
    if(this.logic.raidRevision!==this.raidRevision){const snapshot=this.logic.saveRaid();await this.ctx.storage.put('cellarRaid',snapshot);this.raidRevision=snapshot.revision;}
    if(this.logic.raidActive){const at=await this.ctx.storage.getAlarm();if(!at||at>Date.now()+1000)await this.ctx.storage.setAlarm(Date.now()+1000);}
  }

  /** The sweep: every SWEEP_MS, seats nobody has spoken from are emptied. Set on each hello. */
  async alarm() {
    this.ensureSockets();
    const out=this.logic.sweep(Date.now());
    await this.saveRaid();
    this.deliver(out,null);
    if (this.logic.size > 0) await this.ctx.storage.setAlarm(Date.now() + (this.logic.raidActive?1000:SWEEP_MS));
  }

  sendToConn(connId, msg) {
    const ws = this.sockets.get(connId);
    if (ws) this.send(ws, msg);
  }

  sendToOthers(sourceConnId, msg) {
    for (const [connId, ws] of this.sockets) {
      if (connId !== sourceConnId) this.send(ws, msg);
    }
  }

  sendToAll(msg) {
    for (const ws of this.sockets.values()) this.send(ws, msg);
  }

  send(ws, msg) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    } catch {
      // A closing socket has already left the room from the player's seat.
    }
  }

  drop(ws) {
    const connId = this.connIdFor(ws);
    if (!connId) return;
    this.sockets.delete(connId);
    this.deliver(this.logic.leave(connId), connId);
  }
}
