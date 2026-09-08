// Room relay logic. Run: node server/room_logic.test.mjs
import { createRoomLogic } from './room_logic.mjs';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };

{
  const room = createRoomLogic();
  const a = room.join('c1', { t: 'hello', id: 'ada', name: 'Ada', look: { hair: 1 } });
  const b = room.join('c2', { t: 'hello', id: 'bea', name: 'Bea', look: { hair: 2 } });
  check('the first player sees no others', a.toSelf[0].players.length === 0);
  check('welcome lists the others only',
    b.toSelf[0].pid === 'bea' && b.toSelf[0].players.length === 1 && b.toSelf[0].players[0].pid === 'ada',
    JSON.stringify(b.toSelf[0]));
  check('a join broadcasts the new player',
    b.toOthers.length === 1 && b.toOthers[0].t === 'join' && b.toOthers[0].player.pid === 'bea',
    JSON.stringify(b.toOthers));
}

{
  const room = createRoomLogic();
  room.join('c1', { t: 'hello', id: 'ada', name: 'Ada', look: null });
  room.join('c2', { t: 'hello', id: 'bea', name: 'Bea', look: null });
  const msg = { t: 'state', p: ['1', 2, 3], yaw: '4', sp: '5', an: 6, hp: '7', mhp: 8, mp: 9, mmp: 10, st: 11, mst: 12, tg: 13, hd: true, extra: 'drop me' };
  const out = room.handle('c1', msg);
  const relayed = out.toOthers[0];
  check('state relays with the player pid',
    relayed.pid === 'ada' && relayed.p.join(',') === '1,2,3' && relayed.yaw === 4 && relayed.an === '6' && relayed.tg === '13' && relayed.hd === true && !('extra' in relayed),
    JSON.stringify(relayed));
  const bad = room.handle('c1', { ...msg, p: [1, Infinity, 3] });
  check('state drops a bad position', bad.toOthers.length === 0 && room.players()[0].state.p.join(',') === '1,2,3');
}

{
  const room = createRoomLogic();
  const a = room.join('c1', { t: 'hello', id: 'ada', name: 'Ada', look: null });
  const b = room.join('c2', { t: 'hello', id: 'ada', name: 'Ada again', look: null });
  check('the same character back again takes its own seat and the old seat is emptied',
    a.toSelf[0].pid === 'ada' && b.toSelf[0].pid === 'ada' && b.evict.includes('c1') && b.toOthers[0].t === 'leave' && b.toOthers[0].pid === 'ada' && b.toOthers[1].t === 'join',
    JSON.stringify({ pid: b.toSelf[0].pid, evict: b.evict, others: b.toOthers.map((m) => m.t) }));
  check('and only the newcomer is seated', room.size === 1 && room.players()[0].connId === 'c2');
  const later = room.handle('c1', { t: 'state', p: [1, 2, 3] });
  check('the emptied seat can no longer speak', later.toOthers.length === 0);
}
{
  const room = createRoomLogic();
  room.join('c1', { t: 'hello', id: 'ada', name: 'Ada', look: null });
  room.join('c2', { t: 'hello', id: 'bo', name: 'Bo', look: null });
  const t0 = Date.now();
  room.handle('c2', { t: 'state', p: [0, 0, 0] });
  const quiet = room.sweep(t0 + 10000, 45000);
  check('a sweep inside the age empties nobody', quiet.evict.length === 0 && room.size === 2);
  // the seat is restored as a hibernated room would restore it, last heard from a minute ago
  room.restore('c1', { pid: 'ada', id: 'ada', name: 'Ada', look: null, state: null, seenAt: t0 - 60000 });
  const swept = room.sweep(t0, 45000);
  check('a seat silent past the age is emptied and the others are told', swept.evict.includes('c1') && swept.toOthers.some((m) => m.t === 'leave' && m.pid === 'ada') && room.size === 1,
    JSON.stringify(swept));
}

{
  const room = createRoomLogic();
  room.join('c1', { t: 'hello', id: 'ada', name: 'Ada', look: null });
  room.join('c2', { t: 'hello', id: 'bea', name: 'Bea', look: null });
  room.join('c3', { t: 'hello', id: 'cy', name: 'Cy', look: null });
  const hit = room.handle('c1', { t: 'cast', to: 'bea', ability: 'spark', payload: { n: 1 } });
  check('cast reaches only its target',
    hit.to.length === 1 && hit.to[0].connId === 'c2' && hit.to[0].msg.from === 'ada' && hit.to[0].msg.name === 'Ada',
    JSON.stringify(hit.to));
  const miss = room.handle('c1', { t: 'cast', to: 'nobody', ability: 'spark', payload: {} });
  check('cast to an unknown target reaches nobody', miss.to.length === 0 && miss.toSelf.length === 0 && miss.toOthers.length === 0 && miss.toAll.length === 0);
}

{
  const room = createRoomLogic();
  room.join('c1', { t: 'hello', id: 'ada', name: 'Ada', look: null });
  const long = `  ${'x'.repeat(260)}  `;
  const said = room.handle('c1', { t: 'say', text: long });
  check('say is trimmed and capped and goes to all',
    said.toAll.length === 1 && said.toAll[0].text.length === 240 && said.toAll[0].text === 'x'.repeat(240),
    `${said.toAll[0]?.text.length}`);
  const blank = room.handle('c1', { t: 'say', text: '     ' });
  check('empty say is dropped', blank.toAll.length === 0);
}

{
  const room = createRoomLogic();
  room.join('c1', { t: 'hello', id: 'ada', name: 'Ada', look: null });
  const before = Date.now();
  const out = room.handle('c1', { t: 'ping', n: 42 });
  const after = Date.now();
  check('ping replies to self with the same nonce and a current clock',
    out.toSelf.length === 1 && out.toSelf[0].t === 'pong' && out.toSelf[0].n === 42 && out.toSelf[0].now >= before && out.toSelf[0].now <= after,
    JSON.stringify(out.toSelf));
}

{
  const room = createRoomLogic();
  room.join('c1', { t: 'hello', id: 'ada', name: 'Ada', look: null });
  room.join('c2', { t: 'hello', id: 'ada', name: 'Ada again', look: null });   // c1 was evicted by this
  const gone = room.leave('c2');
  const next = room.join('c3', { t: 'hello', id: 'ada', name: 'Ada return', look: null });
  check('leave broadcasts and frees the pid',
    gone.toOthers[0].pid === 'ada' && next.toSelf[0].pid === 'ada',
    JSON.stringify({ gone, next: next.toSelf[0] }));
}

{
  const room = createRoomLogic();
  const player = { pid: 'ada', id: 'ada', name: 'Ada', look: { coat: 'blue' }, state: null, connId: 'old' };
  room.restore('c1', player);
  room.join('c2', { t: 'hello', id: 'bea', name: 'Bea', look: null });
  const out = room.handle('c1', { t: 'state', p: [2, 4, 6], yaw: 8, sp: 10, an: 'idle', hp: 12, mhp: 14, mp: 16, mmp: 18, st: 20, mst: 22, tg: 'bea', hd: true });
  check('restore after hibernation lets state relay again',
    room.size === 2 && out.toOthers.length === 1 && out.toOthers[0].pid === 'ada' && out.toOthers[0].p.join(',') === '2,4,6' && out.toOthers[0].hd === true,
    JSON.stringify(out.toOthers));
}

{
  const room = createRoomLogic();
  const cases = [
    () => room.handle('missing', null),
    () => room.handle('missing', 'hello'),
    () => room.handle('missing', { t: 'state', p: [1, 2, 3] }),
    () => room.join('c1', { t: 'hello', id: 'ada', name: 'Ada', look: null }),
    () => room.handle('c1', null),
    () => room.handle('c1', []),
    () => room.handle('c1', { t: 'state', p: ['no', 2, 3] }),
    () => room.handle('c1', { t: 'wat' }),
    () => room.leave('missing'),
    () => room.restore('c2', null),
  ];
  const results = cases.map((fn) => {
    try {
      return { threw: false, out: fn() };
    } catch (error) {
      return { threw: true, out: { toSelf: [], toOthers: [], toAll: [], to: [] }, error };
    }
  });
  check('garbage input never throws', results.every((r) => !r.threw), JSON.stringify(results));
  check('garbage returns message lists', results.every((r) => ['toSelf', 'toOthers', 'toAll', 'to'].every((k) => Array.isArray(r.out[k]))));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
