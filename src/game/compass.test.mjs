// The compass strip, driven both ways. Run: node src/game/compass.test.mjs
//
// The last section builds the real strip against a small fake document and
// measures where the coordinates land, because "they are out from under the
// place name now" is not a thing anybody should have to take on trust.

// --- a document, small enough to read ---------------------------------------
function makeDom() {
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null, innerHTML: '', title: '',
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; },
      },
      appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = node; node.children.push(c); return c; },
      get parentNode() { return node.parent; },
      removeChild(c) { const i = node.children.indexOf(c); if (i >= 0) { node.children.splice(i, 1); c.parent = null; } return c; },
      addEventListener() {},
    };
    return node;
  };
  const byId = new Map();
  return {
    createElement: el,
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { if (c.id) byId.set(c.id, c); return c; } },
    body: el('body'),
  };
}
globalThis.document = makeDom();

const {
  createCompass, compassFrame, bearingOf, headingOf, relativeAngle, markerX,
  distanceText, coordsText, markerName, coordBox, trackBox,
  COMPASS_SPAN, COMPASS_W, COMPASS_H, COMPASS_SIDE_W, COMPASS_STRIP_W, POINTS,
} = await import('./compass.js');
// the column the strip is a row in: hud.js owns those numbers
const { placeBox, boxesOverlap, COMPASS_SLOT_TOP, TOP_CENTRE, PLACE_H } = await import('./hud.js');

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

console.log('compass: the marker prints the words, not the coordinates');
{
  // context_menu.js names every mark on open ground this way, and it was this
  // string, centred on the track, that ran through the place plate
  check('a mark on open ground keeps its words and drops its numbers',
    markerName('the ground at 1209, -226') === 'the ground', markerName('the ground at 1209, -226'));
  check('and the same with a comma instead of the word at',
    markerName('a spot, 1209, -226') === 'a spot', markerName('a spot, 1209, -226'));
  check('a real name with no numbers on it is untouched',
    markerName('the Millrun Adit') === 'the Millrun Adit');
  check('a name that is only numbers still says something',
    markerName('at 12, 30') === 'your mark' && markerName('') === 'your mark' && markerName(null) === 'your mark',
    `"${markerName('at 12, 30')}"`);
  check('a name with a number in it that is not a coordinate keeps it',
    markerName('Mile 12') === 'Mile 12', markerName('Mile 12'));
  check('and a very long name is cut rather than reaching across the screen',
    markerName('the Hall of the Nine Sleeping Kings').length === 18, markerName('the Hall of the Nine Sleeping Kings'));

  check('where you stand reads as two rounded numbers',
    coordsText({ x: 1208.7, z: -226.2 }) === '1209, -226', coordsText({ x: 1208.7, z: -226.2 }));
  check('and nowhere reads as nothing',
    coordsText(null) === '' && coordsText({ x: NaN, z: 0 }) === '');

  const f = compassFrame(0, { x: 1209, z: -226 }, { x: 0, z: -1000, name: 'the ground at 40, -50' });
  check('the frame carries both: the full name and what the marker prints',
    f.waypoint.name === 'the ground at 40, -50' && f.waypoint.short === 'the ground',
    `${f.waypoint.name} | ${f.waypoint.short}`);
  check('and the coordinates of where you are, not of the mark',
    f.coords === '1209, -226', f.coords);
}

console.log('compass: the strip, built in a document');
{
  const root = document.createElement('div');
  const player = { pos: { x: 1209, z: -226 }, yaw: Math.PI };
  const character = { waypoint: { x: 1209, z: -1226, name: 'the ground at 1209, -1226' } };
  const c = createCompass(root, { player, character, flow: true });
  check('the strip is three cells: a side, the track, a side',
    c.el.children.length === 3
    && c.el.children[0].className === 'bw-c-side left'
    && c.el.children[1].className === 'bw-c-track'
    && c.el.children[2].className === 'bw-c-side right',
    c.el.children.map((n) => n.className).join(' | '));
  check('mounted in the HUD column it knows it is in the flow',
    c.el.classList.contains('flow') && c.el.parent === root);
  check('the ticks and the marker are in the TRACK, not loose in the strip',
    c.el.children[1].children.length === 1 + POINTS.length + 1,
    String(c.el.children[1].children.length));

  const f = c.update();
  const dist = c.el.children[0].children[0];
  const coords = c.el.children[2].children[0];
  check('the coordinates are the right hand cell, right aligned',
    coords.className === 'bw-c-at' && coords.textContent === '1209, -226', coords.textContent);
  check('the distance is the left hand cell, out of the middle too',
    dist.className === 'bw-c-dist' && dist.textContent === '1.0 km', dist.textContent);
  const wp = c.el.children[1].children[POINTS.length + 1];
  check('the marker prints the words and no numbers at all',
    wp.textContent === '◆ the ground' && !/\d/.test(wp.textContent), wp.textContent);
  check('and it is still dead centre, because that is where the mark is',
    Math.abs(f.waypoint.x) < 1e-12 && wp.style.left === '50.000%', wp.style.left);

  // the readouts are written only when they change
  const same = c.update();
  check('standing still, the frame is the same reading', same.coords === f.coords);
  player.pos = { x: 1210, z: -226 };
  c.update();
  check('a metre east moves the readout', coords.textContent === '1210, -226', coords.textContent);
  character.waypoint = null;
  c.update();
  check('clearing the mark clears the distance and keeps the coordinates',
    dist.textContent === '' && coords.textContent === '1210, -226',
    `"${dist.textContent}" "${coords.textContent}"`);
  c.setShown(false);
  check('the settings window can still put the whole strip away', !c.el.classList.contains('on'));
  c.dispose();
  check('and dispose takes it out of the document', root.children.length === 0);
}

console.log('compass: the coordinates are clear of the place plate');
{
  // What the user saw: "...ND AT 1209, -226" printed through MARLFIELD. Two
  // things were wrong. The strip sat at a fixed 38px from the top of the HUD,
  // which is inside the plate's own box, and the coordinates were part of the
  // waypoint's name, printed by the marker in the middle of the track. The
  // strip is a row in the plate's column now and the coordinates are a readout
  // at the far right, so the two boxes are disjoint on BOTH axes.
  check('the plate ends before the strip begins',
    TOP_CENTRE.top + PLACE_H <= COMPASS_SLOT_TOP,
    `plate to ${(TOP_CENTRE.top + PLACE_H).toFixed(2)}, strip from ${COMPASS_SLOT_TOP.toFixed(2)}`);
  check('the old 38px offset really was inside the plate, which is why it broke',
    38 < TOP_CENTRE.top + PLACE_H, `plate runs to ${(TOP_CENTRE.top + PLACE_H).toFixed(2)}px`);
  for (const [w, name] of [[1280, 'MARLFIELD'], [1600, 'THE SNOWLINE'], [1920, 'THE GREAT NORTHERN WOODLANDS OF MARLFIELD']]) {
    const plate = placeBox(name, w);
    const box = coordBox(w, COMPASS_SLOT_TOP);
    check(`"${name}" on a ${w} wide screen never touches the readout`,
      !boxesOverlap(plate, box),
      `plate ${plate.left.toFixed(0)}..${plate.right.toFixed(0)}, coords ${box.left.toFixed(0)}..${box.right.toFixed(0)}`);
  }
  // The old geometry, to prove the measurement can fail. The coordinates used
  // to be part of the marker, so the box to test them in is the TRACK, and at
  // 38px from the top the track ran through the plate.
  check('at the old 38px the very same measurement says the track hit the plate',
    boxesOverlap(placeBox('MARLFIELD', 1280), trackBox(1280, 38)) === true,
    `track ${JSON.stringify(trackBox(1280, 38))}`);
  check('and in the column it does not, so the letters are clear of the name too',
    !boxesOverlap(placeBox('MARLFIELD', 1280), trackBox(1280, COMPASS_SLOT_TOP)));
  check('the readout is the far right cell of the row',
    coordBox(1280, 0).right === 640 + COMPASS_STRIP_W / 2
    && coordBox(1280, 0).width === COMPASS_SIDE_W
    && COMPASS_STRIP_W === COMPASS_W + COMPASS_SIDE_W * 2,
    `${COMPASS_W} track, ${COMPASS_SIDE_W} a side, ${COMPASS_STRIP_W} in all`);
  check('the track is still centred on the screen, so the middle is still ahead',
    (coordBox(1280, 0).right - COMPASS_STRIP_W / 2) === 640
    && COMPASS_H === 20);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
