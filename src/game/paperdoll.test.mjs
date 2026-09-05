// Where the paper doll's camera stands. Run: node src/game/paperdoll.test.mjs
//
// The framing is arithmetic and is measured here rather than eyeballed in a
// browser: a taller character stands further off, a narrower frame stands
// further off still rather than cutting the shoulders, and the eye is at the
// character's own eye and not at its feet.
//
// createPaperdoll is built here too, with no document and no renderer, because
// what it must NOT do is throw. It says why it is blank instead.

import {
  framing, turnFromDrag, dueAt, createPaperdoll,
  DOLL_FOV, FILL, WIDTH_RATIO, EYE_FRACTION, TURN_PER_PX, PAPERDOLL_FPS,
} from './paperdoll.js';
import { BODY } from './player.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;

// ---- the arithmetic, done by hand -------------------------------------------
console.log('paperdoll: the framing');
{
  // A 1.8 m rig in a 244 x 400 frame, 30 degree lens, filling 0.86 of the height:
  //   half the height it must fit  = 1.8 / 0.86 / 2 = 1.04651 m
  //   tan(15 degrees)              = 0.267949
  //   distance                     = 1.04651 / 0.267949 = 3.9056 m
  const f = framing({ height: 1.8, aspect: 244 / 400 });
  check('a 1.8 m character in a tall frame stands 3.906 m off',
    near(f.distance, 3.9056, 0.001), f.distance.toFixed(4));
  check('and the height is what decided it', f.limitedBy === 'height', f.limitedBy);
  check('the camera looks at the eye, not the feet',
    near(f.eye, 1.8 * EYE_FRACTION, 1e-9), f.eye.toFixed(3));
  check('which is 0.94 m up a 1.8 m body', near(f.eye, 0.936, 0.001), f.eye.toFixed(3));
}
{
  const short = framing({ height: 1.6, aspect: 0.61 });
  const tall = framing({ height: 2.2, aspect: 0.61 });
  check('a taller character stands further off', tall.distance > short.distance,
    `${short.distance.toFixed(2)} m then ${tall.distance.toFixed(2)} m`);
  check('and exactly in proportion to the height',
    near(tall.distance / short.distance, 2.2 / 1.6, 1e-6),
    (tall.distance / short.distance).toFixed(5));
}
{
  const wide = framing({ height: 1.8, aspect: 1.2 });
  const narrow = framing({ height: 1.8, aspect: 0.2 });
  check('a narrow frame backs the camera off rather than cropping the shoulders',
    narrow.distance > wide.distance, `${wide.distance.toFixed(2)} m then ${narrow.distance.toFixed(2)} m`);
  check('and says the width was what decided it', narrow.limitedBy === 'width');
  check('a wide frame is still decided by the height', wide.limitedBy === 'height');
  // width needed = 1.8 * 0.42 / 0.86 = 0.87907 m, half is 0.439535
  // tan(15) * 0.2 = 0.0535898, so 0.439535 / 0.0535898 = 8.2018 m
  check('the narrow frame s number is the width formula s own',
    near(narrow.distance, 8.2018, 0.001), narrow.distance.toFixed(4));
}
{
  const loose = framing({ height: 1.8, fill: 0.5, aspect: 0.61 });
  const tight = framing({ height: 1.8, fill: 1, aspect: 0.61 });
  check('filling less of the frame means standing further back', loose.distance > tight.distance,
    `${tight.distance.toFixed(2)} m at full, ${loose.distance.toFixed(2)} m at half`);
  const wideLens = framing({ height: 1.8, fov: 60, aspect: 0.61 });
  const longLens = framing({ height: 1.8, fov: 20, aspect: 0.61 });
  check('a longer lens stands further off', longLens.distance > wideLens.distance,
    `${wideLens.distance.toFixed(2)} m at 60, ${longLens.distance.toFixed(2)} m at 20`);
}
{
  const d = framing();
  check('with nothing given it frames the rig player.js actually builds',
    d.height === BODY.HEIGHT, `${d.height} m`);
  check('at the default lens and fill', d.fov === DOLL_FOV && d.fill === FILL);
  check('nonsense is refused rather than dividing by zero',
    framing({ height: 0, fov: -3, fill: 0, aspect: 0 }).distance > 0,
    String(framing({ height: 0, fov: -3, fill: 0, aspect: 0 }).distance));
  check('the shoulders are counted at a fraction of the height', WIDTH_RATIO > 0.2 && WIDTH_RATIO < 0.7);
}

// ---- the turn ---------------------------------------------------------------
console.log('paperdoll: the turn');
check('a hundred pixels of drag turn 1.2 radians', near(turnFromDrag(0, 100), 100 * TURN_PER_PX, 1e-9),
  turnFromDrag(0, 100).toFixed(4));
check('a full turn is about 524 px', near((Math.PI * 2) / TURN_PER_PX, 523.6, 0.5),
  ((Math.PI * 2) / TURN_PER_PX).toFixed(1));
check('the turn wraps rather than growing forever', turnFromDrag(6.2, 200) < Math.PI * 2,
  turnFromDrag(6.2, 200).toFixed(4));
check('and never goes negative', turnFromDrag(0.1, -500) >= 0, turnFromDrag(0.1, -500).toFixed(4));
check('nonsense leaves it where it was', turnFromDrag(1, NaN) === 1 && turnFromDrag(NaN, 0) === 0);

// ---- how often it draws -----------------------------------------------------
console.log('paperdoll: the rate');
check('fifteen frames a second is 66.7 ms apart', near(1000 / PAPERDOLL_FPS, 66.667, 0.01));
check('64 ms is too soon', dueAt(0, 64) === false);
check('67 ms is not', dueAt(0, 67) === true);
check('a doll that has never drawn draws at once', dueAt(-1e9, 0) === true);

// ---- with no browser at all -------------------------------------------------
console.log('paperdoll: with nothing to draw into');
{
  let threw = null;
  let doll = null;
  try { doll = createPaperdoll(null, () => null, { width: 244, height: 400 }); } catch (e) { threw = e; }
  check('it builds with no renderer and no document', threw === null, threw ? threw.message : '');
  check('the portrait is a second node, never the doll canvas itself (a node can only hang in one place)',
    doll && 'portrait' in doll && (doll.canvas === null ? doll.portrait === null : doll.portrait !== doll.canvas),
    doll ? `canvas ${doll.canvas}, portrait ${doll.portrait}` : 'no doll');
  check('and there is no canvas to show', doll.canvas === null);
  check('the framing is still worked out', doll.framing.distance > 0, doll.framing.distance.toFixed(3));
  check('the pixel size is not mistaken for the body height',
    doll.framing.height === BODY.HEIGHT, `${doll.framing.height} m, not 400`);
  doll.setVisible(true);
  check('an update draws nothing rather than throwing', doll.update(0.1) === false);
  check('and says why in words', typeof doll.trouble === 'string' && doll.trouble.length > 4, String(doll.trouble));
  check('nothing was drawn', doll.drawn === 0);
  doll.setVisible(false);
  check('and a hidden doll does not even try', doll.update(0.1) === false);
  doll.dispose();
}
{
  const doll = createPaperdoll(null, () => null, { width: 200, height: 200, rigHeight: 2.4 });
  check('a taller rig can be asked for', doll.framing.height === 2.4);
  check('and a square frame is decided by the height', doll.framing.limitedBy === 'height');
  doll.yaw = 3;
  check('the turn can be set from outside', near(doll.yaw, 3, 1e-9), String(doll.yaw));
  doll.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
