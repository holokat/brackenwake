// The compass strip, driven both ways. Run: node src/game/compass.test.mjs
import {
  createCompass, compassFrame, bearingOf, headingOf, relativeAngle, markerX,
  distanceText, COMPASS_SPAN, COMPASS_W, POINTS,
} from './compass.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;

console.log('compass: which way is north');
{
  // north is -z, because that is the direction that is up on the map
  check('north is -z', Math.abs(bearingOf(0, -1)) < 1e-12, `${deg(bearingOf(0, -1)).toFixed(1)} deg`);
  check('east is +x, at 90', Math.abs(deg(bearingOf(1, 0)) - 90) < 1e-9);
  check('south is +z, at 180', Math.abs(deg(bearingOf(0, 1)) - 180) < 1e-9);
  check('west is -x, at 270', Math.abs(deg(bearingOf(-1, 0)) - 270) < 1e-9);
  check('northeast is at 45', Math.abs(deg(bearingOf(1, -1)) - 45) < 1e-9);
  check('every bearing comes back in [0, 360)', (() => {
    for (let i = 0; i < 360; i++) {
      const a = rad(i);
      const b = bearingOf(Math.sin(a), Math.cos(a));
      if (!(b >= 0 && b < Math.PI * 2)) return false;
    }
    return true;
  })());

  // player.js: forward is (sin yaw, cos yaw), so yaw 0 faces +z, which is SOUTH
  check('yaw 0 is facing south, which is what player.js means by forward', Math.abs(deg(headingOf(0)) - 180) < 1e-9, `${deg(headingOf(0)).toFixed(1)} deg`);
  check('yaw PI/2 is facing east', Math.abs(deg(headingOf(Math.PI / 2)) - 90) < 1e-9);
  check('yaw PI is facing north', Math.abs(deg(headingOf(Math.PI))) < 1e-9 || Math.abs(deg(headingOf(Math.PI)) - 360) < 1e-9, `${deg(headingOf(Math.PI)).toFixed(1)} deg`);
  check('yaw -PI/2 is facing west', Math.abs(deg(headingOf(-Math.PI / 2)) - 270) < 1e-9);
}

console.log('compass: the relative angle wraps the short way');
{
  check('dead ahead is nothing', relativeAngle(rad(90), rad(90)) === 0);
  check('90 to the right is +90', Math.abs(deg(relativeAngle(rad(180), rad(90))) - 90) < 1e-9);
  check('90 to the left is -90', Math.abs(deg(relativeAngle(rad(0), rad(90))) + 90) < 1e-9);
  check('across the north seam it still goes the short way', Math.abs(deg(relativeAngle(rad(350), rad(10))) + 20) < 1e-9, `${deg(relativeAngle(rad(350), rad(10))).toFixed(1)} deg`);
  check('and the other way across it', Math.abs(deg(relativeAngle(rad(10), rad(350))) - 20) < 1e-9);
  check('directly behind lands at exactly PI, never at -PI', relativeAngle(rad(180), 0) === Math.PI);
  check('every pair wraps into (-PI, PI]', (() => {
    for (let a = 0; a < 360; a += 7) for (let b = 0; b < 360; b += 11) {
      const d = relativeAngle(rad(a), rad(b));
      if (!(d > -Math.PI - 1e-12 && d <= Math.PI + 1e-12)) return false;
    }
    return true;
  })());
}

console.log('compass: THE WORKED CASE, a waypoint due north while facing east');
{
  // the strip is 180 degrees wide, so 90 degrees to the left is its left edge
  const at = { x: 0, z: 0 };
  const waypoint = { x: 0, z: -500, name: 'the Millrun Adit' };
  const yawEast = Math.PI / 2;
  const f = compassFrame(yawEast, at, waypoint);
  check('the heading really is east', Math.abs(deg(f.heading) - 90) < 1e-9, `${deg(f.heading).toFixed(1)} deg`);
  check('the waypoint marker is hard left, at exactly -1', f.waypoint.x === -1, `${f.waypoint.x}`);
  check('and the distance is the 500 m it is', Math.abs(f.waypoint.dist - 500) < 1e-9, `${f.waypoint.dist} m`);
  check('the N tick is in the same place as the marker', (() => {
    const n = f.points.find((p) => p.label === 'N');
    return n && Math.abs(n.x - f.waypoint.x) < 1e-12;
  })(), f.points.map((p) => `${p.label}@${p.x.toFixed(2)}`).join(' '));

  // turn to face it, and the marker walks to the middle
  const facing = compassFrame(Math.PI, at, waypoint);
  check('turn north and the marker is dead ahead', Math.abs(facing.waypoint.x) < 1e-12, `${facing.waypoint.x}`);
  // turn the other way and it goes off the strip
  const away = compassFrame(0, at, waypoint);
  check('turn south and it falls off the strip entirely', away.waypoint.x === null && away.waypoint.behind !== null, `behind: ${away.waypoint.behind}`);
  const westward = compassFrame(-Math.PI / 2, at, waypoint);
  check('facing west it is hard right, at exactly +1', westward.waypoint.x === 1, `${westward.waypoint.x}`);
  check('and the two edges are opposite signs of the same thing', f.waypoint.x === -westward.waypoint.x);
}

console.log('compass: markerX');
{
  check('dead ahead is the middle', markerX(0) === 0);
  check('half the span to the right is the right edge', markerX(COMPASS_SPAN / 2) === 1);
  check('half the span to the left is the left edge', markerX(-COMPASS_SPAN / 2) === -1);
  check('a whisker past the edge is off the strip, not pinned to it', markerX(COMPASS_SPAN / 2 + 1e-4) === null);
  check('and the same on the left', markerX(-COMPASS_SPAN / 2 - 1e-4) === null);
  check('behind you is off the strip', markerX(Math.PI - 1e-9) === null && markerX(-Math.PI + 1e-9) === null);
  check('the span is settable', markerX(rad(45), rad(90)) === 1 && markerX(rad(46), rad(90)) === null);
  check('the edge slack is a billionth of a radian, not a policy', markerX(COMPASS_SPAN / 2 + 1e-10) === 1 && markerX(COMPASS_SPAN / 2 + 1e-7) === null);
  check('the strip is 180 degrees wide', Math.abs(deg(COMPASS_SPAN) - 180) < 1e-9 && COMPASS_W === 300);
}

console.log('compass: the eight points');
{
  check('there are eight of them, at 45 degree steps', POINTS.length === 8 && POINTS.every(([, b], i) => Math.abs(deg(b) - i * 45) < 1e-9), POINTS.map(([n]) => n).join(' '));
  // on a 180 degree strip you can see five of them at a heading that lands on
  // one, and four when it lands between two
  const onPoint = compassFrame(Math.PI, { x: 0, z: 0 }, null);       // facing north
  check('facing a cardinal you see five points', onPoint.points.length === 5, onPoint.points.map((p) => p.label).join(' '));
  const between = compassFrame(Math.PI - rad(22.5), { x: 0, z: 0 }, null);
  check('facing between two you see four', between.points.length === 4, between.points.map((p) => p.label).join(' '));
  check('and they are in left to right order', between.points.every((p, i, a) => i === 0 || a[i - 1].x <= p.x));
  check('N is dead centre when you face north', Math.abs(onPoint.points.find((p) => p.label === 'N').x) < 1e-12);
  check('S is not on the strip at all when you face north', !onPoint.points.some((p) => p.label === 'S'));
}

console.log('compass: no waypoint, no marker');
{
  const f = compassFrame(0, { x: 0, z: 0 }, null);
  check('nothing set means nothing to show', f.waypoint === null);
  check('a waypoint with no coordinates is nothing too', compassFrame(0, { x: 0, z: 0 }, { name: 'nowhere' }).waypoint === null);
  check('and a waypoint with no position to measure from is nothing', compassFrame(0, null, { x: 10, z: 10 }).waypoint === null);
  const unnamed = compassFrame(0, { x: 0, z: 0 }, { x: 0, z: 10 });
  check('a waypoint with no name still gets one', unnamed.waypoint.name === 'your mark');
}

console.log('compass: distances read like a person wrote them');
{
  check('under a kilometre is metres', distanceText(0) === '0 m' && distanceText(940) === '940 m' && distanceText(999.4) === '999 m');
  check('a kilometre and over is kilometres, one decimal', distanceText(1000) === '1.0 km' && distanceText(2437) === '2.4 km');
  check('nothing is nothing', distanceText(NaN) === '' && distanceText(undefined) === '');
}

console.log('compass: createCompass without a document');
{
  const player = { pos: { x: 0, z: 0 }, yaw: Math.PI / 2 };
  const character = { waypoint: { x: 0, z: -1200, name: 'the Deep Shoulder' } };
  const c = createCompass(null, { player, character });
  check('it builds with no DOM at all', c && c.el === null);
  const f = c.update();
  check('and update still does the arithmetic', f.waypoint.x === -1 && Math.abs(f.waypoint.dist - 1200) < 1e-9, `${f.waypoint.x}, ${f.waypoint.dist} m`);
  check('the frame is kept for anything that wants to read it', c.frame === f);
  // the camera wins over the player, because the strip follows where you look
  const camera = { forwardYaw: Math.PI };
  const c2 = createCompass(null, { player, camera, character });
  check('the camera heading wins over the body', Math.abs(c2.update().waypoint.x) < 1e-12, 'facing the mark, dead centre');
  // and falls back when the camera has nothing to say
  const c3 = createCompass(null, { player, camera: {}, character });
  check('and falls back to the body when the camera has no yaw', c3.update().waypoint.x === -1);
  // walking toward it shortens the distance and keeps the bearing
  player.pos = { x: 0, z: -600 };
  const f2 = c2.update();
  check('walking toward it shortens the distance', Math.abs(f2.waypoint.dist - 600) < 1e-9, `${f2.waypoint.dist} m`);
  character.waypoint = null;
  check('clearing the waypoint clears the marker', c2.update().waypoint === null);
  c.dispose();
  check('dispose on a DOM-less compass is harmless', true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
