// The trade wire: two ends, one channel. Run: node src/game/trade_net.test.mjs
//
// Every case drives TWO nets over one loopback, each with its own character
// document and its own `createTrade`, which is exactly what two tabs are. The
// items are counted in both documents after every step, so "moves exactly
// once" is a count and not a claim.
import {
  createTradeNet, createLoopback, TRADE_CHANNEL, PROTOCOL, HELLO_MS, PEER_STALE_MS,
} from './trade_net.js';
import { createTrade, TRADE_RANGE } from './win_trade.js';
import { makeItem } from '../mmo/items.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

/** A microtask hop is how a real BroadcastChannel delivers; drain them all. */
const flush = () => new Promise((r) => setTimeout(r, 0));

let channelN = 0;
const item = (base, seed, label) => { const i = makeItem({ base, rarity: 'common', seed }); if (label) i.label = label; return i; };
const doc = (name, gold, items, slots = 20) => ({
  name, gold, pos: { x: 0, z: 0 },
  pack: { slots, items: [...items, ...new Array(Math.max(0, slots - items.length)).fill(null)] },
});
const held = (d) => d.pack.items.filter(Boolean);
const countOf = (d, base) => held(d).filter((i) => i.base === base).length;

/**
 * Two tabs, both windows open, ready to put things on the table. `apart` is
 * how many metres between them, so the 4 m rule can be driven both ways.
 */
async function table({ apart = 1, aGold = 200, bGold = 500, aSlots = 20, bSlots = 20 } = {}) {
  const name = `${TRADE_CHANNEL}-test-${++channelN}`;
  const A = doc('Ash', aGold, [item('longsword', 1), item('dagger', 2)], aSlots);
  const B = doc('Bryn', bGold, [item('shortbow', 3)], bSlots);
  B.pos = { x: apart, z: 0 };

  const saidA = [], saidB = [];
  const clock = { t: 0 };
  const netA = createTradeNet({ character: A, name: 'Ash', at: () => A.pos, now: () => clock.t, transport: createLoopback(name), id: 'A' });
  const netB = createTradeNet({ character: B, name: 'Bryn', at: () => B.pos, now: () => clock.t, transport: createLoopback(name), id: 'B' });

  let tradeB = null;
  netB.onInvite((partner) => { tradeB = createTrade({ me: B, them: partner, say: (t) => { saidB.push(t); return t; } }); });
  await flush();                                   // B's opening hello lands on A
  netA.hello(); netB.hello();                      // the next second, both ways
  await flush();

  const tradeA = createTrade({ me: A, them: netA.partnerFor('B'), say: (t) => { saidA.push(t); return t; } });
  await flush();                                   // A's opening offer opens B's window

  return { name, A, B, netA, netB, tradeA, clock, get tradeB() { return tradeB; }, saidA, saidB };
}

// ===================================================================== hello
console.log('trade_net: who is on the channel');
{
  const t = await table({ apart: 1 });
  const seenByA = t.netA.peers();
  check('A sees exactly one peer', seenByA.length === 1, seenByA.map((p) => p.name).join(', '));
  check('and it is Bryn, by name', seenByA[0].name === 'Bryn');
  check('one metre apart is tradeable', t.netA.nearby().length === 1, `${seenByA[0].dist.toFixed(2)} m`);

  const far = await table({ apart: 5 });
  check('five metres is not', far.netA.nearby().length === 0, `${far.netA.peers()[0].dist.toFixed(2)} m, range ${TRADE_RANGE}`);
  check('but they are still on the channel', far.netA.peers().length === 1);
}

// ================================================== offer, accept, complete
console.log('trade_net: both accept, and the items move exactly once');
{
  const t = await table();
  const sword = held(t.A)[0];
  const bow = held(t.B)[0];

  t.tradeA.put('me', sword);
  t.tradeA.setGold('me', 50);
  await flush();
  check('B sees the sword on A\'s side of the table',
    t.tradeB.state().offer.them.items.length === 1, `${t.tradeB.state().offer.them.items.length}`);
  check('and the 50 gold with it', t.tradeB.state().offer.them.gold === 50);

  t.tradeB.put('me', bow);
  await flush();
  check('A sees the bow', t.tradeA.state().offer.them.items.length === 1);

  t.tradeA.setAccept('me', true);
  await flush();
  check('one tick moves nothing', countOf(t.A, 'longsword') === 1 && countOf(t.B, 'longsword') === 0);
  check('B knows A has ticked', t.tradeB.state().accepted.them === true);
  check('and B has not', t.tradeB.state().accepted.me === false);

  t.tradeB.setAccept('me', true);
  await flush();
  check('two ticks and both sides are done',
    t.tradeA.state().done === true && t.tradeB.state().done === true);

  check('the sword left A once', countOf(t.A, 'longsword') === 0);
  check('and arrived in B once', countOf(t.B, 'longsword') === 1, `${countOf(t.B, 'longsword')}`);
  check('the bow left B once', countOf(t.B, 'shortbow') === 0);
  check('and arrived in A once', countOf(t.A, 'shortbow') === 1, `${countOf(t.A, 'shortbow')}`);
  check('A still holds the dagger it never offered', countOf(t.A, 'dagger') === 1);
  check('A is 50 gold down', t.A.gold === 150, `${t.A.gold}`);
  check('B is 50 gold up', t.B.gold === 550, `${t.B.gold}`);
  check('nothing was duplicated: two things in, two things out',
    held(t.A).length === 2 && held(t.B).length === 1,
    `A ${held(t.A).map((i) => i.base).join('+')}, B ${held(t.B).map((i) => i.base).join('+')}`);
  check('and both nets counted one commit each',
    t.netA.stats.committed === 1 && t.netB.stats.committed === 1);
}

// ============================================================ a late change
console.log('trade_net: a change after one accept unticks both, on both sides');
{
  const t = await table();
  const [sword, dagger] = held(t.A);
  t.tradeA.put('me', sword);
  await flush();
  t.tradeA.setAccept('me', true);
  await flush();
  check('A is ticked and B knows',
    t.tradeA.state().accepted.me === true && t.tradeB.state().accepted.them === true);

  t.tradeA.put('me', dagger);
  await flush();
  check('A\'s own tick came off', t.tradeA.state().accepted.me === false);
  check('and B\'s view of A\'s tick came off too', t.tradeB.state().accepted.them === false);
  check('B now sees two things on the table', t.tradeB.state().offer.them.items.length === 2);
  check('and still nothing has moved', countOf(t.A, 'longsword') === 1 && countOf(t.B, 'longsword') === 0);

  // the other direction: B changes after B ticked
  t.tradeA.setAccept('me', true);
  await flush();
  t.tradeB.setAccept('me', true);
  await flush();
  check('and then it goes through', t.tradeA.state().done && t.tradeB.state().done);
  check('both swords moved', countOf(t.B, 'longsword') === 1 && countOf(t.B, 'dagger') === 1);
}

console.log('trade_net: a change by THEM unticks us');
{
  const t = await table();
  const sword = held(t.A)[0];
  const bow = held(t.B)[0];
  t.tradeA.put('me', sword);
  await flush();
  t.tradeA.setAccept('me', true);
  await flush();
  t.tradeB.put('me', bow);            // they change something after we ticked
  await flush();
  check('our tick came off because they moved', t.tradeA.state().accepted.me === false);
  check('and theirs is off too', t.tradeB.state().accepted.me === false);
  check('nothing moved', countOf(t.A, 'longsword') === 1 && countOf(t.B, 'shortbow') === 1);
}

// ================================================================= a cancel
console.log('trade_net: a cancel returns everything');
{
  const t = await table();
  const sword = held(t.A)[0];
  const bow = held(t.B)[0];
  t.tradeA.put('me', sword);
  t.tradeA.setGold('me', 90);
  await flush();
  t.tradeB.put('me', bow);
  await flush();
  t.tradeB.setAccept('me', true);
  await flush();
  check('B is ticked before the cancel', t.tradeA.state().accepted.them === true);

  t.tradeA.cancel('me');
  await flush();
  check('A\'s trade is over', t.tradeA.state().done === true);
  check('and B was told', t.tradeB.state().done === true);
  check('the sword never left A', countOf(t.A, 'longsword') === 1);
  check('the bow never left B', countOf(t.B, 'shortbow') === 1);
  check('the gold never moved', t.A.gold === 200 && t.B.gold === 500, `${t.A.gold} / ${t.B.gold}`);
  check('B heard it in words', t.saidB.some((l) => /trade is off/i.test(l)), t.saidB[t.saidB.length - 1]);
}

console.log('trade_net: a tab that closes mid-trade returns everything');
{
  const t = await table();
  t.tradeA.put('me', held(t.A)[0]);
  await flush();
  t.tradeB.put('me', held(t.B)[0]);
  await flush();
  t.netA.close();                       // the tab goes
  await flush();
  check('B\'s trade is over', t.tradeB.state().done === true);
  check('B kept its bow', countOf(t.B, 'shortbow') === 1);
  check('A kept its sword', countOf(t.A, 'longsword') === 1);
}

console.log('trade_net: a peer that goes silent takes the trade with it');
{
  const t = await table();
  t.tradeA.put('me', held(t.A)[0]);
  await flush();
  // B stops sending hellos: age A's view of it past the stale window
  t.netA.update(0);
  t.clock.t = PEER_STALE_MS * 2 + HELLO_MS;
  t.netA.update(t.clock.t);
  await flush();
  check('the peer is off A\'s list', t.netA.peers().length === 0);
  check('and A\'s trade is over', t.tradeA.state().done === true);
  check('with the sword still in A\'s pack', countOf(t.A, 'longsword') === 1);
}

// ============================================================ bad messages
console.log('trade_net: a stale sequence is ignored');
{
  const t = await table();
  t.tradeA.put('me', held(t.A)[0]);
  await flush();
  const before = t.tradeB.state().offer.them.items.length;
  const seenBefore = t.netB.stats.seen;

  // A's real offer had some seq; replay one behind it, saying the table is empty
  const stale = { p: PROTOCOL, from: 'A', to: 'B', seq: 1, kind: 'offer', rev: 99, items: [], gold: 0, purse: 200, room: 18, slots: 20 };
  const res = t.netB.receive(stale);
  check('the stale message is named as stale', res.why === 'stale', `${res.why}`);
  check('and counted', t.netB.stats.stale === 1);
  check('and never reached the trade', t.tradeB.state().offer.them.items.length === before, `${before}`);
  check('and was not counted as seen', t.netB.stats.seen === seenBefore);

  // one step ahead of the last is not stale
  const ahead = { ...stale, seq: 9999, items: [], gold: 0 };
  t.netB.receive(ahead);
  check('a message ahead of the last one IS applied', t.tradeB.state().offer.them.items.length === 0);
}

console.log('trade_net: a third session is ignored');
{
  const t = await table();
  t.tradeA.put('me', held(t.A)[0]);
  await flush();
  t.tradeB.put('me', held(t.B)[0]);
  await flush();
  t.tradeA.setAccept('me', true);
  await flush();

  // C tries to tick the accept that would commit the trade
  const forged = { p: PROTOCOL, from: 'C', to: 'B', seq: 1, kind: 'accept', rev: 1, ack: 1 };
  const res = t.netB.receive(forged);
  check('the forged accept is named as a stranger', res.why === 'stranger', `${res.why}`);
  check('and counted', t.netB.stats.stranger === 1);
  check('B did not tick', t.tradeB.state().accepted.me === false);
  check('and nothing moved', countOf(t.A, 'longsword') === 1 && countOf(t.B, 'longsword') === 0);

  // and a forged complete cannot take the items either
  const forgedDone = { p: PROTOCOL, from: 'C', to: 'B', seq: 2, kind: 'complete', rev: 1 };
  t.netB.receive(forgedDone);
  check('a forged complete moves nothing', countOf(t.B, 'shortbow') === 1 && t.tradeB.state().done === false);
  check('and is counted a stranger too', t.netB.stats.stranger === 2);
}

console.log('trade_net: a crossed accept is not a trade');
{
  const t = await table();
  t.tradeA.put('me', held(t.A)[0]);
  await flush();
  // an accept quoting a revision of A's offer that B has never shown
  const crossed = { p: PROTOCOL, from: 'A', to: 'B', seq: 9000, kind: 'accept', rev: 77, ack: 77 };
  t.netB.receive(crossed);
  check('B did not take a tick from a table it is not showing', t.tradeB.state().accepted.them === false);
  check('and counted it crossed', t.netB.stats.crossed === 1);
  check('nothing moved', countOf(t.A, 'longsword') === 1);
}

console.log('trade_net: a message on an older protocol is ignored');
{
  const t = await table();
  const res = t.netB.receive({ p: PROTOCOL + 1, from: 'A', to: 'B', seq: 5000, kind: 'cancel' });
  check('an unknown protocol is refused', res.why === 'protocol');
  check('and the trade is untouched', t.tradeB.state().done === false);
}

// ============================================================== no listener
console.log('trade_net: nobody at the table says so rather than hanging');
{
  const name = `${TRADE_CHANNEL}-test-${++channelN}`;
  const A = doc('Ash', 100, [item('dagger', 9)]);
  const B = doc('Bryn', 100, []);
  const netA = createTradeNet({ character: A, name: 'Ash', at: () => A.pos, transport: createLoopback(name), id: 'A' });
  const netB = createTradeNet({ character: B, name: 'Bryn', at: () => B.pos, transport: createLoopback(name), id: 'B' });
  await flush();                                  // B registered no onInvite
  const said = [];
  const tradeA = createTrade({ me: A, them: netA.partnerFor('B'), say: (t) => { said.push(t); return t; } });
  await flush();
  check('B answered with a cancel', tradeA.state().done === true);
  check('and A was told in words', said.some((l) => /trade is off/i.test(l)), said[said.length - 1]);
  check('and the dagger is still A\'s', countOf(A, 'dagger') === 1);
  netA.close(); netB.close();
}

// =============================================================== the pack
console.log('trade_net: a pack with no room refuses before anything moves');
{
  const t = await table({ bSlots: 1 });            // B's one slot holds the bow
  t.tradeA.put('me', held(t.A)[0]);
  await flush();
  const r = t.tradeA.setAccept('me', true);
  check('A cannot tick into a full pack', r.ok === false, r.text);
  check('and the reason names the room', /room for/i.test(r.text || ''), r.text);
  check('nothing moved', countOf(t.A, 'longsword') === 1 && countOf(t.B, 'longsword') === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
