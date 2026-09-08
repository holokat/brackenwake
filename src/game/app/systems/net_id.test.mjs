// The id a room knows a character by. Run: node src/game/app/systems/net_id.test.mjs
//
// It was the roster slot number, and everyone's first character is slot 1, so
// two players in the same world were one player to the room and evicted each
// other on every join (2026-09-08). Now it is minted once per character,
// saved on the document, and never the same for two characters.

import { netIdOf } from './net.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

console.log('net: the room id of a character');
{
  let saves = 0;
  const ctx = { state: { slot: '1', save: () => { saves++; } } };
  const a = { name: 'Karnage' }, b = { name: 'Sep' }, c = { name: 'Karnage' };
  const ia = netIdOf(ctx, a), ib = netIdOf(ctx, b), ic = netIdOf(ctx, c);
  check('two characters on slot 1 of two browsers get different ids', ia !== ib && ia !== ic, `${ia} ${ib} ${ic}`);
  check('the id carries the name for the server log and a random tail', /^karnage-[a-z0-9]{6,12}$/.test(ia), ia);
  check('it is written on the character and the save is asked for', a.netId === ia && saves === 3, `${a.netId}, ${saves} saves`);
  check('asked again it is the same id, with no new save', netIdOf(ctx, a) === ia && saves === 3, String(saves));
  const kept = { name: 'Karnage', netId: 'karnage-abc123' };
  check('a saved id is kept across reloads', netIdOf(ctx, kept) === 'karnage-abc123');
  check('a character with no name still gets an id', /^someone-/.test(netIdOf(ctx, {})));
  check('the random tail is what makes it unique', netIdOf(ctx, { name: 'x' }, () => 'fixed') === 'x-fixed' && netIdOf(ctx, { name: 'y' }, () => 'fixed') === 'y-fixed');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
