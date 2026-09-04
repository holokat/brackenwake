// Floating numbers: the pure parts. Run: node src/game/floaters.test.mjs
import { lifeState, pickEviction, KINDS, LIFE, RISE, MAX_PER_ANCHOR } from './floaters.js';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;

console.log('floaters: life');
check('at birth it has not risen and is opaque', lifeState(0).rise === 0 && lifeState(0).alpha === 1);
check('at two thirds of life it is still fully opaque', near(lifeState(LIFE * 2 / 3).alpha, 1, 1e-9));
check('at the end it is transparent and dead', lifeState(LIFE).alpha <= 1e-9 && lifeState(LIFE).dead);
check('it never rises above RISE', lifeState(LIFE).rise <= RISE + 1e-9 && lifeState(LIFE * 10).rise <= RISE + 1e-9);
{ let mono = true, prev = -1; for (let t = 0; t <= LIFE; t += 0.05) { const r = lifeState(t).rise; if (r < prev - 1e-9) mono = false; prev = r; } check('the rise is monotonic', mono); }
check('it rises faster at first than at the end', (lifeState(0.2).rise - lifeState(0).rise) > (lifeState(LIFE).rise - lifeState(LIFE - 0.2).rise), `${lifeState(0.2).rise.toFixed(3)} m in the first 0.2 s vs ${(lifeState(LIFE).rise - lifeState(LIFE - 0.2).rise).toFixed(3)} in the last`);

console.log('floaters: crowding');
check('the oldest is evicted, not the newest', pickEviction([{ age: 0.1 }, { age: 0.9 }, { age: 0.4 }]).age === 0.9);
check('an empty crowd evicts nothing', pickEviction([]) === null);
check('six is the per-anchor limit', MAX_PER_ANCHOR === 6);

console.log('floaters: kinds');
check('gains are the largest text after stats', KINDS.stat.size > KINDS.gain.size && KINDS.gain.size > KINDS.damage.size, `${KINDS.stat.size} > ${KINDS.gain.size} > ${KINDS.damage.size}`);
check('gains and stats glow', KINDS.gain.glow === true && KINDS.stat.glow === true);
check('crits shake', KINDS.crit.shake === true);
check('every kind has a colour and a size', Object.values(KINDS).every((k) => /^#[0-9a-f]{6}$/i.test(k.color) && k.size > 0));

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
