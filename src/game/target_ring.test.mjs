// The ring under a target: gold for a look, red and breathing for a fight,
// and either side of a fair fight, gold pulled toward the con colour.
import {
  ringState, tintFor, mix, setCon, conLevel,
  TARGET_COLOUR, ATTACK_COLOUR, RING_TINT, BOSS_TINT,
} from './target_ring.js';
import { CON_LEVELS } from './con.js';
let pass = 0, fail = 0;
const check = (name, ok, note = '') => { if (ok) pass++; else fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${note ? '   ' + note : ''}`); };
check('no target, no ring', ringState(null, false, 0).visible === false);
const rat = { radius: 0.4, pos: { x: 0, y: 0, z: 0 } };
const look = ringState(rat, false, 0.3), fight = ringState(rat, true, 0.3);
check('a looked-at target wears gold, steady', look.colour === TARGET_COLOUR && look.scale === 0.65 && look.opacity === 0.55, `scale ${look.scale}`);
check('a fought target wears red', fight.colour === ATTACK_COLOUR);
const a = ringState(rat, true, 0), b = ringState(rat, true, 0.26);
check('and breathes: the scale moves over a quarter second', Math.abs(a.scale - b.scale) > 0.01, `${a.scale.toFixed(3)} then ${b.scale.toFixed(3)}`);
check('a bigger body gets a bigger ring', ringState({ radius: 1.2 }, false, 0).scale > look.scale);

// --- the con tint --------------------------------------------------------------
console.log('ring: the con tint');
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const ch = (n, i) => (n >> (8 * i)) & 0xff;
for (const c of CON_LEVELS) console.log(`       ${c.level.padEnd(8)} ${hex(tintFor(c.level))}`);
check('a fair fight is the gold the ring has always been, exactly',
  tintFor('even') === TARGET_COLOUR, hex(tintFor('even')));
check('and so is a target nothing has set a level for', tintFor(null) === TARGET_COLOUR && tintFor('nonsense') === TARGET_COLOUR);
check('every other level moves the ring off gold',
  CON_LEVELS.filter((c) => c.level !== 'even').every((c) => tintFor(c.level) !== TARGET_COLOUR),
  CON_LEVELS.map((c) => `${c.level} ${hex(tintFor(c.level))}`).join(', '));
check('all seven levels are seven different rings, the friend (MP1) among them',
  new Set(CON_LEVELS.map((c) => tintFor(c.level))).size === 7 && tintFor('friend') !== TARGET_COLOUR);
check('a deadly ring is redder and less blue than gold',
  ch(tintFor('deadly'), 2) > ch(TARGET_COLOUR, 2) && ch(tintFor('deadly'), 1) < ch(TARGET_COLOUR, 1),
  `${hex(tintFor('deadly'))} against ${hex(TARGET_COLOUR)}`);
check('a trivial ring is greyer: its red and green have come together',
  Math.abs(ch(tintFor('trivial'), 2) - ch(tintFor('trivial'), 1)) < Math.abs(ch(TARGET_COLOUR, 2) - ch(TARGET_COLOUR, 1)),
  hex(tintFor('trivial')));
check('a boss ring is properly purple, its blue above its green',
  ch(tintFor('boss'), 0) > ch(tintFor('boss'), 1) && ch(tintFor('boss'), 0) > ch(TARGET_COLOUR, 0),
  `${hex(tintFor('boss'))}, blue ${ch(tintFor('boss'), 0)} over green ${ch(tintFor('boss'), 1)}`);
check('and it is pulled further than the rest, because gold and purple go pink',
  BOSS_TINT > RING_TINT, `${BOSS_TINT} against ${RING_TINT}`);
check('mixing nowhere leaves the first colour and mixing all the way gives the second',
  mix(0x000000, 0xffffff, 0) === 0x000000 && mix(0x000000, 0xffffff, 1) === 0xffffff);
check('and half way is half way', mix(0x000000, 0xffffff, 0.5) === 0x808080, hex(mix(0x000000, 0xffffff, 0.5)));
check('a mix outside 0 to 1 is clamped rather than wrapping',
  mix(0x000000, 0xffffff, -3) === 0x000000 && mix(0x000000, 0xffffff, 9) === 0xffffff);

console.log('ring: what you are doing beats what it is');
for (const c of CON_LEVELS) {
  check(`a ${c.level} target you are FIGHTING still wears the red`,
    ringState(rat, true, 0, c.level).colour === ATTACK_COLOUR);
}
check('and a boss you are only looking at wears the purple ring, not the red',
  ringState(rat, false, 0, 'boss').colour === tintFor('boss'), hex(ringState(rat, false, 0, 'boss').colour));

console.log('ring: the level targeting.js pushes in');
check('nothing is set to begin with', conLevel() === null);
setCon('deadly');
check('setCon takes it, and the ring reads it with no argument',
  conLevel() === 'deadly' && ringState(rat, false, 0).colour === tintFor('deadly'), hex(ringState(rat, false, 0).colour));
check('an argument still overrides it', ringState(rat, false, 0, 'even').colour === TARGET_COLOUR);
setCon(null);
check('and clearing it puts the gold back', conLevel() === null && ringState(rat, false, 0).colour === TARGET_COLOUR);

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
