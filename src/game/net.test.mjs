// The pure half of the multiplayer client, measured: the room name, the state
// frame, the interpolation and the socket's reconnect, against a fake socket.
import {
  roomNameFor, wsUrlFor, lookFor, helloFor, encodeState, lerpAngle, createRemotes, createNetClient,
  INTERP_DELAY_S, REMOTE_TIMEOUT_S, BACKOFF_MS, nextRoomUrl } from './net.js';
import { createRoomLogic } from '../../server/room_logic.mjs';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

console.log('net: the room and the hello');
{
  check('the island plays in the island room', roomNameFor({ sculpt: { world: 'island' } }) === 'island');
  check('a sculpt with no world name still has a room', roomNameFor({ sculpt: {} }) === 'sculpt');
  check('the seeded world is one room', roomNameFor({}) === 'seed' && roomNameFor(null) === 'seed');
  check('a world name the server would refuse is not used', roomNameFor({ sculpt: { world: 'Bad Name!' } }) === 'sculpt');
  check('the url is on the page origin, ws for http and wss for https',
    wsUrlFor({ protocol: 'http:', host: 'localhost:5198' }, 'island') === 'ws://localhost:5198/ws/island'
    && wsUrlFor({ protocol: 'https:', host: 'kaldera.example' }, 'seed') === 'wss://kaldera.example/ws/seed');
  const c = { id: 'ranger-x1', name: 'Bob', opening: 'ranger', appearance: { skin: 2 }, equipment: { mainHand: { base: 'shortbow' }, offHand: { base: 'dagger' }, outfit: { base: 'leather_outfit' } } };
  const h = helloFor(c);
  check('the hello carries id, name and the look another client needs', h.t === 'hello' && h.id === 'ranger-x1' && h.name === 'Bob' && h.look.opening === 'ranger' && h.look.gear.mainHand === 'shortbow' && h.look.gear.offHand === 'dagger' && h.look.gear.outfit === 'leather_outfit' && h.look.gear.neck === null, JSON.stringify(h.look.gear));
  check('a look carries no item records, only bases', !JSON.stringify(lookFor(c)).includes('"rarity"'));
}

console.log('\nnet: the state frame');
{
  const s = encodeState({ pos: { x: 1.234, y: 8.005, z: -3.999 }, yaw: 3.14159, speed: 6.5, anim: 'run', actor: { health: 80.4, maxHealth: 157.5, mana: 10, maxMana: 100, stamina: 5, maxStamina: 90, hidden: { since: 1 } }, target: { pid: 'tour' } });
  check('positions to the centimetre, pools to the point and hidden as a boolean', s.p.join() === '1.23,8.01,-4' && s.hp === 80 && s.mhp === 158 && s.sp === 6.5 && s.an === 'run' && s.tg === 'tour' && s.hd === true, JSON.stringify(s));
  const bare = encodeState({});
  check('an empty frame is still a well formed frame', bare.t === 'state' && bare.p.join() === '0,0,0' && bare.an === 'idle' && bare.tg === '' && bare.hd === false);
  check('the server accepts what the client sends', (() => {
    const room = createRoomLogic();
    room.join('c1', helloFor({ id: 'a', name: 'A' }));
    const out = room.handle('c1', encodeState({ pos: { x: 1, y: 2, z: 3 }, actor: { health: 5 } }));
    return out.toOthers.length === 1 && out.toOthers[0].t === 'state' && out.toOthers[0].hp === 5;
  })());
}

console.log('\nnet: the others, interpolated');
{
  check('lerpAngle takes the short way round', near(lerpAngle(3.0, -3.0, 0.5), Math.PI, 1e-6) || near(lerpAngle(3.0, -3.0, 0.5), -Math.PI, 1e-6), String(lerpAngle(3.0, -3.0, 0.5)));
  const R = createRemotes();
  const w = R.apply({ t: 'welcome', pid: 'me', players: [{ pid: 'tour', id: 'tour', name: 'Tour', look: {}, state: { p: [0, 0, 0], yaw: 0, sp: 0, an: 'idle', hp: 50, mhp: 100, hd: true } }] }, 10);
  check('welcome seats the others and keeps hidden state', w.type === 'welcome' && R.size === 1 && R.get('tour').hp === 50 && R.get('tour').hidden === true);
  check('a state for a stranger is ignored', R.apply({ t: 'state', pid: 'nobody', p: [1, 1, 1] }, 10) === null && R.size === 1);
  R.apply({ t: 'state', pid: 'tour', p: [10, 0, 0], yaw: 1, sp: 7, an: 'walk', hp: 40, mhp: 100, hd: true }, 11);
  const mid = R.poseAt('tour', 10.5 + INTERP_DELAY_S);
  check('between two samples the body is between the two points and still hidden', mid && near(mid.x, 5, 1e-6) && near(mid.yaw, 0.5, 1e-6) && mid.speed > 0 && mid.hidden === true, JSON.stringify(mid));
  R.apply({ t: 'state', pid: 'tour', p: [10, 0, 0], yaw: 1, sp: 0, an: 'idle', hp: 40, mhp: 100, hd: false }, 11.5);
  check('a later visible frame clears hidden on the remote record and pose', R.get('tour').hidden === false && R.poseAt('tour', 30).hidden === false);
  const late = R.poseAt('tour', 30);
  check('past the newest sample it holds at the newest and stops walking', late && late.x === 10 && late.speed === 0, JSON.stringify(late));
  check('the pools follow the newest state', R.get('tour').hp === 40);
  const j = R.apply({ t: 'join', player: { pid: 'x', id: 'x', name: 'X', look: null, state: null } }, 12);
  check('a join with no state yet has no pose', j.type === 'join' && R.poseAt('x', 12) === null);
  check('stale bodies are named after the timeout', R.stale(12 + REMOTE_TIMEOUT_S + 1).includes('tour') && !R.stale(13).includes('tour'));
  const l = R.apply({ t: 'leave', pid: 'tour' }, 13);
  check('a leave removes the body', l.type === 'leave' && R.get('tour') === null && R.size === 1);
}

console.log('\nnet: the socket, against a fake');
{
  const made = [];
  const fake = () => { const s = { readyState: 0, sent: [], send(x) { s.sent.push(JSON.parse(x)); }, close() { s.readyState = 3; s.onclose && s.onclose(); } }; made.push(s); return s; };
  const timers = [];
  const statuses = [];
  const got = [];
  const client = createNetClient({
    url: 'ws://x/ws/island', hello: { t: 'hello', id: 'me', name: 'Me' }, socketFactory: fake,
    onMessage: (m) => got.push(m), onStatus: (s) => statuses.push(s),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {},
  });
  check('nothing goes out before the socket is open', client.send({ t: 'ping' }) === false && client.connected === false);
  client.connect();
  const s1 = made[0];
  s1.readyState = 1; s1.onopen();
  check('the hello goes first, once the socket opens', s1.sent.length === 1 && s1.sent[0].t === 'hello' && client.status === 'open');
  s1.onmessage({ data: JSON.stringify({ t: 'welcome', pid: 'me', players: [] }) });
  check('the welcome sets the pid', client.pid === 'me' && got.length === 1);
  s1.onmessage({ data: 'not json' });
  check('a frame that is not JSON is dropped, not thrown', got.length === 1);
  check('a message goes out as JSON', client.send({ t: 'say', text: 'hi' }) === true && s1.sent[1].text === 'hi');
  s1.close();
  check('a drop schedules a reconnect with the first backoff', timers.length === 1 && timers[0].ms === BACKOFF_MS[0] && client.status === 'waiting', JSON.stringify(timers.map((t) => t.ms)));
  timers[0].fn();
  check('the retry makes a new socket', made.length === 2 && client.status === 'reconnecting');
  made[1].close();
  check('and the second wait is double the first', timers[1].ms === BACKOFF_MS[0] * 2, String(timers[1].ms));
  client.close();
  timers[1].fn();
  check('closed by us, it does not come back', made.length === 2 && client.status === 'closed');
}

console.log('\nnet: a full room sends the client next door');
{
  check('the next room of seed is seed-2, then seed-3, and a dashed world keeps its name', nextRoomUrl('ws://x/ws/seed') === 'ws://x/ws/seed-2' && nextRoomUrl('ws://x/ws/seed-2') === 'ws://x/ws/seed-3' && nextRoomUrl('ws://x/ws/green_wold-9') === 'ws://x/ws/green_wold-10', [nextRoomUrl('ws://x/ws/seed'), nextRoomUrl('ws://x/ws/seed-2')].join(' '));
  const made = [];
  const fake = (url) => { const s = { url, readyState: 0, sent: [], send(x) { s.sent.push(JSON.parse(x)); }, close() { s.readyState = 3; if (s.onclose) s.onclose(); } }; made.push(s); return s; };
  const timers = [];
  const client = createNetClient({ url: 'ws://x/ws/island', hello: { t: 'hello', id: 'me', name: 'Me' }, socketFactory: fake, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {} });
  client.connect();
  made[0].onopen();
  made[0].onmessage({ data: JSON.stringify({ t: 'full', cap: 20 }) });
  check('told full, the client opens the next room at once, without a backoff timer', made.length === 2 && made[1].url === 'ws://x/ws/island-2' && timers.length === 0, `${made.length} sockets, ${made[1]?.url}, ${timers.length} timers`);
  made[1].onopen();
  check('and says hello there too', made[1].sent[0]?.t === 'hello' && client.url === 'ws://x/ws/island-2' && client.rooms === 1, JSON.stringify(made[1].sent[0]));
  made[1].onmessage({ data: JSON.stringify({ t: 'welcome', pid: 'me', players: [] }) });
  check('and is seated', client.pid === 'me' && client.status === 'open', client.status);
  client.close?.();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
