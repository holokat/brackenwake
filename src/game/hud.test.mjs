// The tool row, counted. Run: node src/game/hud.test.mjs
//
// The farm shipped a HUD whose painted frame had three tool cells and whose
// TOOLS list had five entries. The two extra slots rendered with no position,
// stacked on the first, and the last one in the DOM ate every click, so tool
// switching was impossible for days. That bug was a mismatch between a list
// and a container, and this suite is the guard against it coming back:
// the row is flex and sized by TOOLS, the hotkeys are TOOLS' own indices, and
// the tools the HUD can show are exactly the tools state.js can own.

globalThis.document ||= { createElement: () => ({ style: {}, addEventListener() {} }), head: { appendChild() {} }, getElementById: () => null };

const { TOOLS, MATERIALS } = await import('./hud.js');
const state = await import('./state.js');

let bad = 0, pass = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : bad++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

ck('there are four tool slots', TOOLS.length === 4, TOOLS.map((t) => t.id).join(' '));
ck('the keys are 1 to 4, in order', TOOLS.every((t, i) => t.key === String(i + 1)),
  TOOLS.map((t) => t.key).join(''));
ck('every key is distinct', new Set(TOOLS.map((t) => t.key)).size === TOOLS.length);
ck('every id is distinct', new Set(TOOLS.map((t) => t.id)).size === TOOLS.length);
ck('every slot has a label to read', TOOLS.every((t) => typeof t.label === 'string' && t.label.length > 0));

ck('hand is the only free slot', TOOLS.filter((t) => t.free).length === 1 && TOOLS[0].id === 'hand');
ck('the first slot is the one you start with', TOOLS[0].id === 'hand');

// the two lists have to agree, or a tool you can buy has nowhere to appear
const buyable = TOOLS.filter((t) => !t.free).map((t) => t.id).sort();
ck('every tool state.js can own has a slot', JSON.stringify(buyable) === JSON.stringify([...state.TOOLS].sort()),
  `hud ${buyable.join(',')} vs state ${[...state.TOOLS].sort().join(',')}`);
ck('and no slot names a tool state.js has never heard of',
  TOOLS.every((t) => t.free || state.TOOLS.includes(t.id)));

ck('the purse shows every material state.js carries',
  JSON.stringify([...MATERIALS].sort()) === JSON.stringify([...state.MATERIALS].sort()),
  `hud ${MATERIALS.join(',')} vs state ${state.MATERIALS.join(',')}`);

console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
