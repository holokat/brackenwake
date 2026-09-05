// The ring under a target: gold for a look, red and breathing for a fight.
import { ringState, TARGET_COLOUR, ATTACK_COLOUR } from './target_ring.js';
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
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
