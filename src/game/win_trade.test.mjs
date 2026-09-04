// The trade window: the accept rules. Run: node src/game/win_trade.test.mjs
import { createTrade, createStubPartner, sideOf, TRADE_RANGE } from './win_trade.js';
import { makeItem } from '../mmo/items.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const item = (base, label) => { const i = makeItem({ base, rarity: 'common' }); i.label = label; return i; };

function table(opts = {}) {
  const mine = [item('longsword', 'Longsword'), item('kite', 'Kite Shield'), item('dagger', 'Dagger')];
  const me = { name: 'You', gold: opts.myGold ?? 200, pack: { slots: opts.mySlots ?? 20, items: [...mine, ...new Array((opts.mySlots ?? 20) - 3).fill(null)] } };
  const them = createStubPartner({
    name: 'Wren', gold: opts.theirGold ?? 500, slots: opts.theirSlots ?? 20,
    items: [item('shortbow', 'Shortbow')],
    mind: opts.mind || 'never',
  });
  const said = [];
  const t = createTrade({ me, them, say: (s) => { said.push(s); return s; } });
  return { t, me, them, said, mine };
}

console.log('win_trade: nothing moves until both accept');
{
  const { t, me, them, mine } = table();
  t.put('me', mine[0]);
  t.setGold('me', 50);
  t.setAccept('me', true);
  check('one tick is not a trade', t.state().accepted.me === true && t.state().accepted.them === false);
  check('the sword is still in your pack', me.pack.items.includes(mine[0]));
  check('the gold is still yours', me.gold === 200);
  check('the trade is not done', t.state().done === false);
  t.setAccept('them', true);
  check('two ticks and it goes through', t.state().done === true);
  check('the sword left your pack', !me.pack.items.includes(mine[0]));
  check('the sword arrived in theirs', them.who.pack.items.includes(mine[0]));
  check('50 gold left you', me.gold === 150, `${me.gold}`);
  check('50 gold reached them', them.who.gold === 550, `${them.who.gold}`);
}

console.log('win_trade: any change unticks both');
{
  const { t, mine, said } = table();
  t.put('me', mine[0]);
  t.setAccept('me', true);
  t.setAccept('them', false);        // they had not accepted; make sure the state is clean
  t.setAccept('them', true);
  // that would commit, so start again and change something in between
  const b = table();
  b.t.put('me', b.mine[0]);
  b.t.setAccept('me', true);
  b.t.setAccept('them', true);
  check('the second trade committed on the second tick', b.t.state().done === true);

  const c = table();
  c.t.put('me', c.mine[0]);
  c.t.setAccept('me', true);
  check('you are ticked', c.t.state().accepted.me === true);
  c.t.put('me', c.mine[1]);
  check('adding a shield unticks you', c.t.state().accepted.me === false);
  check('and it said why', c.said.some((s) => /ticks come off/.test(s)), c.said[c.said.length - 1]);

  const d = table();
  d.t.put('me', d.mine[0]);
  d.t.setAccept('me', true);
  d.t.pull('me', d.mine[0]);
  check('taking a thing back unticks you too', d.t.state().accepted.me === false);

  const e = table();
  e.t.put('me', e.mine[0]);
  e.t.setAccept('me', true);
  e.t.setGold('me', 10);
  check('changing the gold unticks you', e.t.state().accepted.me === false);

  // and the other side's change unticks yours, which is the half that matters
  const f = table();
  f.t.put('me', f.mine[0]);
  f.t.setAccept('me', true);
  f.t.setGold('them', 5);
  check('their change unticks you as well', f.t.state().accepted.me === false, 'both ticks come off, not just theirs');
}

console.log('win_trade: what cannot be put on the table');
{
  const { t, me, mine, said } = table({ myGold: 30 });
  const r = t.setGold('me', 100);
  check('you cannot offer gold you do not have', r.ok === false && /more than the 30 in the purse/.test(r.text), r.text);
  check('and the offer stayed at nothing', t.state().offer.me.gold === 0);
  t.put('me', mine[0]);
  const twice = t.put('me', mine[0]);
  check('the same thing cannot go on twice', twice.ok === false && /already on the table/.test(twice.text));
  const alien = t.put('me', item('mace', 'Mace'));
  check('you cannot offer what is not in your pack', alien.ok === false && /not in the pack/.test(alien.text));
  const gone = t.pull('me', mine[2]);
  check('you cannot take back what was never down', gone.ok === false && /never on the table/.test(gone.text));
}

console.log('win_trade: an empty table cannot be accepted');
{
  const { t } = table();
  const r = t.setAccept('me', true);
  check('accepting nothing is refused and said', r.ok === false && /nothing on the table/.test(r.text), r.text);
  check('nobody is ticked', t.state().accepted.me === false);
}

console.log('win_trade: a pack with no room');
{
  // their pack has one slot and they are being handed two things
  const { t, mine } = table({ theirSlots: 2 });
  t.put('me', mine[0]);
  t.put('me', mine[1]);
  const r = t.setAccept('me', true);
  check('a full pack on the other side stops the accept', r.ok === false && /room for/.test(r.text), r.text);
  check('nothing moved', t.state().done === false);
  t.pull('me', mine[1]);
  const ok = t.setAccept('me', true);
  check('one thing fits, and the accept goes through', ok.ok === true, ok.text || 'accepted');
}

console.log('win_trade: gold that disappears between the tick and the commit');
{
  const { t, me, mine, them } = table({ myGold: 100 });
  t.put('me', mine[0]);
  t.setGold('me', 100);
  t.setAccept('me', true);
  me.gold = 10;                       // spent it somewhere else in the same frame
  const r = t.setAccept('them', true);
  check('the commit refuses when the purse emptied', r.ok === false && /not in the purse any more/.test(r.text), r.text);
  check('the sword is still yours', me.pack.items.includes(mine[0]));
  check('and their gold is untouched', them.who.gold === 500);
}

console.log('win_trade: the stub partner');
{
  const p = createStubPartner({ name: 'Wren', gold: 40 });
  check('a stub does not accept on its own', p.consider({}) === false);
  const eager = createStubPartner({ name: 'Rook', mind: 'always' });
  check('a stub told to accept does', eager.consider({}) === true);
  const picky = createStubPartner({ name: 'Kett', mind: (s) => s.offer.me.gold >= 100 });
  check('a stub can look at the offer', picky.consider({ offer: { me: { gold: 100 } } }) === true && picky.consider({ offer: { me: { gold: 5 } } }) === false);

  // the whole flow with a partner that answers, so the two sided path is real
  const mine = [item('longsword', 'Longsword')];
  const me = { name: 'You', gold: 0, pack: { slots: 4, items: [...mine, null, null, null] } };
  const them = createStubPartner({ name: 'Rook', gold: 90, slots: 4, mind: 'always' });
  const t = createTrade({ me, them });
  t.setGold('them', 90);
  t.put('me', mine[0]);
  check('the partner ticked on its own after the change', t.state().accepted.them === true);
  t.setAccept('me', true);
  check('the trade closed', t.state().done === true);
  check('you have their 90 gold', me.gold === 90);
  check('they have your sword', them.who.pack.items.includes(mine[0]));
}

console.log('win_trade: walking away');
{
  const { t, me, mine } = table();
  t.put('me', mine[0]);
  const r = t.cancel('me');
  check('cancelling says nothing moved', /nothing moved/.test(r.text), r.text);
  check('and nothing did', me.pack.items.includes(mine[0]));
  check('a closed trade takes nothing more', t.put('me', mine[1]).ok === false);
}

console.log('win_trade: the shape of a side');
{
  const who = { name: 'x', gold: 5, pack: { slots: 3, items: [null, null, null] } };
  const s = sideOf(who);
  check('room is counted in free slots', s.room() === 3);
  const i = item('dagger', 'Dagger');
  s.take(i);
  check('taking fills one', s.room() === 2 && who.pack.items.includes(i));
  s.give(i);
  check('giving empties it again', s.room() === 3);
  check('four metres is the range 06 gives', TRADE_RANGE === 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
