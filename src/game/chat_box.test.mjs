// The chat box's pure half: the line list, the words, the drag clamp, and the
// DOM-less box that the net system can still hand lines to in node.
import { pushLine, lineText, clampPos, createChatBox, MAX_LINES, DEFAULT_POS } from './chat_box.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

console.log('chat_box: the list and the words');
{
  const lines = [];
  for (let i = 0; i < MAX_LINES + 5; i++) pushLine(lines, { name: 'a', text: String(i) });
  check(`the list keeps the last ${MAX_LINES}`, lines.length === MAX_LINES && lines[0].text === '5', `${lines.length}, first ${lines[0].text}`);
  check('a line names the speaker', lineText({ name: 'tour', text: 'hello' }, 'rangertest') === 'tour: hello');
  check('and your own line says you', lineText({ name: 'rangertest', text: 'hi' }, 'rangertest') === 'you: hi');
  check('a nameless line is someone', lineText({ text: 'x' }, 'me') === 'someone: x');
}

console.log('\nchat_box: the drag stays on the screen');
{
  const box = { w: 340, h: 170 }, view = { w: 1280, h: 720 };
  check('a box in the middle stays where it was', JSON.stringify(clampPos({ x: 400, y: 300 }, box, view)) === '{"x":400,"y":300}');
  check('dragged off the left it stops at the edge', clampPos({ x: -50, y: 10 }, box, view).x === 0);
  check('dragged off the right it stops with its whole width showing', clampPos({ x: 2000, y: 10 }, box, view).x === 1280 - 340);
  check('and off the top likewise', clampPos({ x: 10, y: 5000 }, box, view).y === 720 - 170);
  check('a viewport smaller than the box pins it to the corner', JSON.stringify(clampPos({ x: 50, y: 50 }, box, { w: 200, h: 100 })) === '{"x":0,"y":0}');
}

console.log('\nchat_box: without a document it is still a list');
{
  const c = createChatBox(null, { name: 'me' });
  c.add({ name: 'tour', text: 'hello' });
  c.system('tour arrives');
  check('lines are kept', c.lines.length === 2 && c.lines[1].sys === true, JSON.stringify(c.lines));
  check('and the box reports the default place', JSON.stringify(c.pos) === JSON.stringify(DEFAULT_POS) && DEFAULT_POS.x === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
