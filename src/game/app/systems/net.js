// MP1: the other players. One room per world on the server (server/room.mjs),
// this system on every client: it says where this body is ten times a second,
// draws everyone else's body where they said they were, lets the cursor choose
// one of them, and carries a heal, a blessing or a cure that landed on one of
// those bodies to the client that owns it. Monsters are still each client's
// own; this is presence and helping hands, not a shared fight yet.
//
// A remote body is a real player rig (player.js createPlayer, the studio body
// off their look), walked by the same stepPlayer physics toward the point the
// wire says they are at, so it strides and stops like a player. Its actor is a
// mirror: faction 'player', `remote: true`, the pools the wire last reported.
// ability_hooks.allies() counts it, targeting.set accepts it, and doHeal /
// doBuff / doCure call onAllyEffect for it, which sendEffect turns into a cast.
//
// `?solo` on the URL, or no server answering, leaves the game exactly as it
// was: the system stands with nothing in it.
import * as THREE from 'three';
import { createPlayer, WALK_SPEED, RUN_SPEED } from '../../player.js';
import { buildStudioCharacter } from '../../studio/body.js';
import {
  createNetClient, createRemotes, encodeState, helloFor, roomNameFor, wsUrlFor, STATE_HZ,
} from '../../net.js';
import { createChatBox } from '../../chat_box.js';

export const PLATE_LIFT = 0.35;
/** Past this the body is put down where it belongs rather than walked. */
export const SNAP_M = 12;
/** Inside this the body stands still and takes the wire's yaw. */
export const ARRIVE_M = 0.25;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/** The save slot's id, however the state exposes it. */
function slotIdOf(ctx) {
  const slot = ctx.state && ctx.state.slot;
  if (typeof slot === 'string') return slot;
  if (slot && typeof slot === 'object' && typeof slot.id === 'string') return slot.id;
  return null;
}

/**
 * The id a room knows this character by. It was the roster slot number, and
 * everyone's first character is slot 1, so two players in the same world were
 * one player to the room and evicted each other on every join (the user and a
 * friend, 2026-09-08: "we dont see each other"). It is now a random id minted
 * once and kept on the character document, so it survives a reload and never
 * collides with anyone else's.
 */
export function netIdOf(ctx, character, random = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))) {
  if (character && typeof character.netId === 'string' && character.netId) return character.netId;
  const id = `${(character && character.name ? String(character.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 16) : 'someone')}-${String(random()).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
  if (character) { character.netId = id; try { ctx.state?.save?.(); } catch { /* it is minted again next time, which is the same id if the save held */ } }
  return id;
}

export const net = {
  name: 'net',
  deps: ['world', 'player', 'combat', 'abilities', 'ui'],

  create(ctx) {
    const { sc, hud, character } = ctx;
    const runtime = ctx.get('world').runtime;
    const player = ctx.get('player');
    const fight = ctx.get('combat');
    const bars = ctx.get('abilities');
    const heightAt = (x, z) => runtime.heightAt(x, z);

    const solo = typeof location !== 'undefined' && /[?&]solo\b/.test(location.search);
    const room = roomNameFor(runtime.field);
    const remotes = createRemotes();
    const bodies = new Map();          // pid -> { rec, rig, actor, plate, group }
    const group = new THREE.Group();
    group.name = 'net-players';
    sc.scene.add(group);
    const stats = { sent: 0, effectsOut: 0, effectsIn: 0, joins: 0, leaves: 0 };
    let lastSentAt = -Infinity;

    const say = (text, kind) => { if (hud?.log) hud.log(text, kind); else hud?.toast?.(text, kind); };
    // the chat box: what the room says, and a line to say back (asked 2026-09-08)
    const chat = createChatBox(ctx.hudRoot || (typeof document !== 'undefined' ? document.body : null), {
      name: character.name,
      onSend: (text) => !!(client && client.send({ t: 'say', text })),
    });
    // Network time is wall time. The frame clock stops in a hidden tab and is
    // driven by hand in the harness, and a body timed on it was dropped as
    // stale the moment a real frame jumped the clock forward.
    const wall = () => performance.now() / 1000;

    function equipmentFromLook(look) {
      const gear = look?.gear || {};
      const out = {};
      for (const slot of ['mainHand', 'offHand', 'outfit', 'neck', 'ring1', 'ring2']) out[slot] = gear[slot] ? { base: gear[slot] } : null;
      return out;
    }

    // ---------------------------------------------------------- the bodies --

    function makePlate(name) {
      if (typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 96;
      const texture = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
      sprite.scale.set(2.6, 0.49, 1);
      sprite.renderOrder = 10;
      const plate = { canvas, texture, sprite, name, hp: -1, mhp: -1 };
      drawPlate(plate, 1, 1);
      return plate;
    }
    function drawPlate(plate, hp, mhp) {
      if (!plate) return;
      if (plate.hp === hp && plate.mhp === mhp) return;
      plate.hp = hp; plate.mhp = mhp;
      const g = plate.canvas.getContext('2d');
      g.clearRect(0, 0, 512, 96);
      g.font = 'bold 40px Georgia, serif';
      g.textAlign = 'center';
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(plate.name, 256, 44);
      g.fillStyle = '#7ad0ff'; g.fillText(plate.name, 256, 44);
      const w = 300, x = 106, y = 60;
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x, y, w, 18);
      g.fillStyle = '#3fbf5a'; g.fillRect(x + 2, y + 2, (w - 4) * Math.max(0, Math.min(1, mhp > 0 ? hp / mhp : 1)), 14);
      plate.texture.needsUpdate = true;
    }

    function build(rec) {
      if (bodies.has(rec.pid)) return bodies.get(rec.pid);
      const look = rec.look || {};
      const rig = createPlayer(group, look.appearance || character.appearance, {
        buildCharacter: (a) => buildStudioCharacter(a, { sourceMotion: true, classId: look.opening || 'blank' }),
      });
      rig.studio?.setEquipment?.(equipmentFromLook(look));
      rig.group.name = `player:${rec.pid}`;
      rig.group.userData.remote = rec.pid;
      const actor = {
        id: rec.pid, pid: rec.pid, name: rec.name || 'Someone', faction: 'player', kind: 'player', remote: true,
        pos: rig.pos, health: 1, maxHealth: 1, mana: 0, maxMana: 0, stamina: 0, maxStamina: 0,
        buffs: [], status: {}, tier: 2, skills: {}, stats: {}, bonuses: {}, resists: {},
      };
      const plate = makePlate(actor.name);
      if (plate) { plate.sprite.position.y = 1.9 + PLATE_LIFT; rig.group.add(plate.sprite); }
      const body = { rec, rig, actor, plate, placed: false };
      bodies.set(rec.pid, body);
      stats.joins++;
      return body;
    }
    function drop(pid) {
      const body = bodies.get(pid);
      if (!body) return;
      if (fight.targeting.current === body.actor) fight.targeting.clear();
      body.actor.dead = true; body.actor.health = 0;
      body.rig.dispose();
      if (body.plate) { body.plate.texture.dispose(); body.plate.sprite.material.dispose(); }
      bodies.delete(pid);
      stats.leaves++;
    }
    function mirror(body) {
      const r = body.rec;
      const a = body.actor;
      a.hidden = r.hidden ? { remote: true } : null;
      body.rig.studio?.setHidden?.(!!a.hidden);
      // before their first state frame the pools are unknown, not empty: a
      // player who has only just said hello is standing, not a corpse
      if (!(num(r.mhp) > 0)) { a.health = 1; a.maxHealth = 1; a.dead = false; drawPlate(body.plate, 1, 1); return; }
      a.health = num(r.hp); a.maxHealth = Math.max(1, num(r.mhp));
      a.mana = num(r.mp); a.maxMana = num(r.mmp); a.stamina = num(r.st); a.maxStamina = num(r.mst);
      a.dead = a.health <= 0;
      drawPlate(body.plate, Math.round(a.health), Math.round(a.maxHealth));
    }

    // ------------------------------------------------------------ the wire --

    let client = null;
    const messageListeners=new Set();
    const layer=()=>runtime.inDungeon?`${runtime.dungeonLayout()?.siteId||runtime.dungeonSite.id}:${runtime.dungeonLevel}`:'world';
    function onMessage(msg) {
      if (!msg || typeof msg !== 'object') return;
      for(const fn of messageListeners)fn(msg);
      const nowS = wall();
      if (msg.t === 'effect') {
        stats.effectsIn++;
        bars.abilities.takeRemoteEffect?.(msg.name, msg.payload, ctx.frame.nowS);
        return;
      }
      if (msg.t === 'say') { chat.add({ name: msg.name || 'Someone', text: String(msg.text || '') }); return; }
      const ev = remotes.apply(msg, nowS);
      if (!ev) return;
      if (ev.type === 'welcome') {
        for (const pid of ev.pids) { const rec = remotes.get(pid); if (rec) { const b = build(rec); mirror(b); } }
        say(ev.pids.length ? `You are not alone: ${ev.pids.map((p) => remotes.get(p)?.name || p).join(', ')} ${ev.pids.length === 1 ? 'is' : 'are'} here.` : 'The road is yours alone for now.', 'good');
      } else if (ev.type === 'join') {
        const b = build(ev.rec); mirror(b);
        say(`${ev.rec.name || 'Someone'} arrives.`, 'good'); chat.system(`${ev.rec.name || 'Someone'} arrives.`);
      } else if (ev.type === 'leave') {
        say(`${ev.rec?.name || 'Someone'} leaves.`, 'ability'); chat.system(`${ev.rec?.name || 'Someone'} leaves.`);
        drop(ev.pid);
      } else if (ev.type === 'state') {
        const b = bodies.get(ev.pid) || build(ev.rec);
        mirror(b);
      }
    }

    // A hidden tab stops its frames (requestAnimationFrame pauses), and with
    // them its state; twenty seconds later everyone else read it as lost to the
    // road. The heartbeat runs on the wall clock so a player who alt tabbed is
    // still standing where they stood.
    let heartbeat = null;
    if (!solo && typeof WebSocket !== 'undefined' && typeof location !== 'undefined') {
      heartbeat = setInterval(() => { if (client && client.connected && performance.now() - lastSentWallMs > 1000) sendState(ctx.frame.nowS, true); }, 1000);
      client = createNetClient({
        url: wsUrlFor(location, room),
        // the character document carries no id of its own; the roster slot is the stable name for this save
        hello: () => helloFor(Object.assign({}, character, { id: netIdOf(ctx, character) })),
        socketFactory: (u) => new WebSocket(u),
        onMessage,
        onStatus: (s) => { if (s === 'open') say('You are on the road with the others; anyone else here will show as they arrive.', 'ability'); },
      });
      client.connect();
    }

    // ------------------------------------------------------------ the api --

    function others() {
      const out = [];
      for (const b of bodies.values()) if (b.actor.health > 0&&(b.rec.layer||'world')===layer()) out.push(b.actor);
      return out;
    }
    function forActor(actor) {
      for (const b of bodies.values()) if (b.actor === actor) return b;
      return null;
    }
    function pick(raycaster) {
      if (!raycaster || !bodies.size) return null;
      const hits = raycaster.intersectObjects(group.children, true);
      for (const h of hits) {
        let o = h.object;
        for (let n = 0; o && n < 8; n++, o = o.parent) {
          const pid = o.userData && o.userData.remote;
          if (pid && bodies.has(pid)) { const b = bodies.get(pid);if((b.rec.layer||'world')!==layer())continue; return { pid, name: b.actor.name, actor: b.actor }; }
        }
      }
      return null;
    }
    function sendEffect(who, payload) {
      const b = forActor(who);
      if (!b || !client) return false;
      stats.effectsOut++;
      return client.send({ t: 'cast', to: b.rec.pid, ability: payload.ability, payload });
    }
    let lastSentWallMs = -Infinity;      // the wall clock, for the heartbeat; the frame clock gates the ten a second
    function sendState(nowS, wall = false) {
      if (!client || !client.connected) return false;
      const target = fight.targeting.current;
      const ok = client.send(encodeState({
        pos: player.rig.pos, yaw: player.rig.yaw, speed: player.rig.speed, anim: player.rig.anim,
        actor: player.actor, target: target && target.remote ? target : null, layer:layer(),
      }));
      if (ok) { stats.sent++; lastSentWallMs = performance.now(); if (!wall) lastSentAt = nowS; }
      return ok;
    }

    function step(frame) {
      const nowS = frame.nowS, dt = frame.dt, w = wall();
      if (client && client.connected && nowS - lastSentAt >= 1 / STATE_HZ) sendState(nowS);
      for (const pid of remotes.stale(w)) { say(`${remotes.get(pid)?.name || 'Someone'} is lost to the road.`, 'ability'); remotes.forget(pid); drop(pid); }
      for (const body of bodies.values()) {
        body.rig.group.visible=(body.rec.layer||'world')===layer();if(!body.rig.group.visible)continue;
        const want = remotes.poseAt(body.rec.pid, w);
        if (!want) continue;
        body.rig.studio?.setHidden?.(!!want.hidden);
        const rig = body.rig;
        const dx = want.x - rig.pos.x, dz = want.z - rig.pos.z;
        const d = Math.hypot(dx, dz);
        if (!body.placed || d > SNAP_M) { rig.teleport(want.x, want.z, heightAt); rig.state.yaw = want.yaw; body.placed = true; continue; }
        // walk toward the point with the player's own physics: the wire's speed says how fast
        const move = { x: 0, z: 0, yaw: 0, sprint: want.speed > WALK_SPEED * 1.15, speedMult: 1 };
        if (d > ARRIVE_M) {
          // stepPlayer with yaw 0 reads x as -world x and z as world z
          const k = Math.min(1, d / 1.5);
          move.x = -(dx / d) * k; move.z = (dz / d) * k;
          // catch up a little when behind, never faster than a run
          if (want.speed > 0.1) move.speedMult = Math.min(RUN_SPEED / Math.max(1, want.speed), Math.max(1, d / 0.8));
        }
        rig.update(dt, move, heightAt);
        if (d <= ARRIVE_M) rig.state.yaw = want.yaw;
        if (want.anim && want.anim !== 'idle' && want.anim !== 'walk' && want.anim !== 'run') rig.setAnim(want.anim);
      }
    }

    return {
      room, remotes, others, forActor, pick, sendEffect, sendState, step, layer,
      instance:()=>client?.url?.split('/').at(-1)||room,
      send:msg=>client?.send(msg)||false, onMessage(fn){messageListeners.add(fn);return()=>messageListeners.delete(fn);},
      get enabled() { return !!client; },
      get connected() { return !!client && client.connected; },
      get pid() { return client ? client.pid : null; },
      say(text) { return client ? client.send({ t: 'say', text: String(text) }) : false; },
      bodies,
      stats,
      actorOf(pid) { const b = bodies.get(String(pid)); return b ? b.actor : null; },
      chat,
      dispose() { chat.dispose(); if (heartbeat) clearInterval(heartbeat); if (client) client.close(); for (const pid of [...bodies.keys()]) drop(pid); if (group.parent) group.parent.remove(group); },
      bw: {
        get net() {
          return {
            room, get pid() { return client ? client.pid : null; }, get status() { return client ? client.status : 'solo'; },
            get connected() { return !!client && client.connected; },
            others: () => others().map((a) => ({ pid: a.pid, name: a.name, hp: a.health, mhp: a.maxHealth, x: Math.round(a.pos.x * 10) / 10, z: Math.round(a.pos.z * 10) / 10 })),
            stats, say: (t) => (client ? client.send({ t: 'say', text: String(t) }) : false), sendState: () => sendState(ctx.frame.nowS),
            actorOf: (pid) => { const b = bodies.get(String(pid)); return b ? b.actor : null; },
          };
        },
      },
    };
  },

  update(ctx, frame) { ctx.get('net').step(frame); },

  click(ctx, ray) {
    const n = ctx.get('net');
    if (!n.bodies.size) return false;
    if ((ctx.input.click?.button || 0) === 2) return false;
    const hit = n.pick(ray);
    if (!hit) return false;
    ctx.get('combat').targeting.set(hit.actor, 'click');
    return true;
  },

  dispose(ctx) { ctx.get('net').dispose(); },
};
