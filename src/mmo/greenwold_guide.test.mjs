// The painted Greenwold, measured. Run: node src/mmo/greenwold_guide.test.mjs
//
// The guide is a MAPPING and a LIST, and both of them are the kind of thing
// that is wrong silently. A mapping that is not an exact inverse puts the
// player arrow beside the painted village instead of on it, and nobody can see
// the difference on a picture. A model id that matches nothing tells the user
// to place a prop that does not exist, and they find out in the editor.
//
// So: the mapping is driven BOTH WAYS at the four corners of the sheet and at
// all twelve centres, the audit is driven true AND false on every rule it
// keeps, and every model id is checked against the real FOOTPRINT table.
//
// Nothing here needs a canvas, a document or a world field.

const {
  GUIDE_ART, GUIDE_ZONES, GUIDE_BY_ID, GUIDE_ROADS, GUIDE_RIVER, GUIDE_AUDIT,
  GUIDE_REALM, OVERLAP_MAX,
  imageToWorld, worldToImage, widthToMetres, artRect, lensArea, insideRing,
  guideZoneAt, auditGuide,
  guideArt, loadGuideArt, onGuideArt, resetGuideArt,
} = await import('./greenwold_guide.js');
const { FOOTPRINT } = await import('./plans/footprints.js');
const { ZONE } = await import('../world/zones.js');
const { openAt } = await import('./release.js');
const { bearingOf } = await import('../game/compass.js');

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const threw = (fn) => { try { fn(); return null; } catch (e) { return e; } };
// Built from their code points, so this file can be checked for them as well.
const DASHES = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`);

// ------------------------------------------------------------ the mapping --

console.log('greenwold_guide: the sheet and the ground');
{
  const F = GUIDE_ART.frame;
  ck('the green country of the sheet is the realm, corner to corner', (() => {
    const [ax, az] = imageToWorld(F.u0, F.v0);
    const [bx, bz] = imageToWorld(F.u1, F.v1);
    return Math.abs(ax - F.x0) < 1e-9 && Math.abs(az - F.z0) < 1e-9
      && Math.abs(bx - F.x1) < 1e-9 && Math.abs(bz - F.z1) < 1e-9;
  })(), `${F.u0},${F.v0} -> ${F.x0},${F.z0} and ${F.u1},${F.v1} -> ${F.x1},${F.z1}`);

  // NORTH IS MINUS Z in Kaldera (compass.js takes atan2(dx, -dz)), so the top of
  // the sheet, which is north on any painted map, is the LESSER z. Written the
  // other way the picture is drawn upside down on a north up map and every
  // bearing in the column beside it is reversed, which is the check below.
  ck('north is up on the sheet, and north is minus z, so the top of it is the lesser z',
    imageToWorld(0.5, 0.1)[1] < imageToWorld(0.5, 0.9)[1],
    `${imageToWorld(0.5, 0.1)[1].toFixed(0)} at v 0.1, ${imageToWorld(0.5, 0.9)[1].toFixed(0)} at v 0.9`);
  ck('and east is right: the right of the sheet is the greater x',
    imageToWorld(0.9, 0.5)[0] > imageToWorld(0.1, 0.5)[0]);

  // THE ROUND TRIP, both ways, at the four corners of the whole sheet and at
  // all twelve centres. This is the check that says the arrow stands on the
  // painted village: the pixel the map draws the village at and the pixel it
  // draws the player at come out of these two functions.
  const spots = [
    ['the sheet top left', 0, 0], ['the sheet top right', 1, 0],
    ['the sheet bottom left', 0, 1], ['the sheet bottom right', 1, 1],
    ...GUIDE_ZONES.map((g) => [g.name, g.u, g.v]),
  ];
  let worstUV = 0, worstXZ = 0, worstAt = '';
  for (const [name, u, v] of spots) {
    const [x, z] = imageToWorld(u, v);
    const [bu, bv] = worldToImage(x, z);
    const e = Math.max(Math.abs(bu - u), Math.abs(bv - v));
    if (e > worstUV) { worstUV = e; worstAt = name; }
    const [fx, fz] = imageToWorld(bu, bv);
    worstXZ = Math.max(worstXZ, Math.abs(fx - x), Math.abs(fz - z));
  }
  ck(`the mapping is an exact inverse at the four corners and the twelve centres`,
    worstUV < 1e-12 && worstXZ < 1e-9,
    `${spots.length} spots, worst ${worstUV.toExponential(1)} of an image fraction (at ${worstAt}), ${worstXZ.toExponential(1)} m`);

  // and the other way round: start in world metres, not on the sheet
  let worstW = 0;
  for (let x = -2200; x <= 2200; x += 275) {
    for (let z = -2200; z <= 2200; z += 275) {
      const [u, v] = worldToImage(x, z);
      const [bx, bz] = imageToWorld(u, v);
      worstW = Math.max(worstW, Math.abs(bx - x), Math.abs(bz - z));
    }
  }
  ck('and an exact inverse driven from the world end, over a 17 by 17 grid of the realm',
    worstW < 1e-9, `worst ${worstW.toExponential(1)} m`);

  ck('a zone\'s world point IS its image point put through the mapping',
    GUIDE_ZONES.every((g) => {
      const [x, z] = imageToWorld(g.u, g.v);
      return Math.abs(x - g.x) < 1e-9 && Math.abs(z - g.z) < 1e-9;
    }));

  // the sheet is 16:9 over a square realm, so the two directions do NOT scale
  // alike, and this is the number the doc quotes
  const mpp = GUIDE_ART.metresPerPixel;
  ck('the mapping is not isotropic, and by how much is measured and not guessed',
    mpp.z / mpp.x > 1.7 && mpp.z / mpp.x < 1.9,
    `${mpp.x.toFixed(3)} m an image pixel across, ${mpp.z.toFixed(3)} down, ${(mpp.z / mpp.x).toFixed(2)} times`);

  const r = artRect();
  ck('the whole sheet reaches a little past the realm on all four sides',
    r.x0 < -2200 && r.x1 > 2200 && r.z0 < -2200 && r.z1 > 2200 && r.w > 0 && r.h > 0,
    `x ${r.x0.toFixed(0)} to ${r.x1.toFixed(0)}, z ${r.z0.toFixed(0)} to ${r.z1.toFixed(0)}`);

  ck('a width on the sheet turns into metres',
    Math.abs(widthToMetres(GUIDE_ART.frame.u1 - GUIDE_ART.frame.u0) - 4400) < 1e-9,
    `the green country is ${widthToMetres(GUIDE_ART.frame.u1 - GUIDE_ART.frame.u0).toFixed(0)} m across`);
}

// ---------------------------------------------------------- which way is it --
//
// The one that would have shipped wrong. Every one of these bearings is written
// down in docs/mmo/22-GREENWOLD-SPACES.md and drawn on the painting, and every
// one of them comes out of `compass.bearingOf`, which is the same function the
// strip across the top of the screen and the column beside the map both use.
// With the sheet's z the other way up, every one of them reverses.

console.log('\nthe painting\'s own compass, against the game\'s');
{
  const POINT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const wordOf = (a, b) => POINT[Math.round(bearingOf(b.x - a.x, b.z - a.z) / (Math.PI * 2 / 8)) % 8];
  const G = GUIDE_BY_ID;
  const want = [
    ['hearthhome', 'kingsroad', 'NE', 'the Kingsroad enters the Greenwold from the north east'],
    ['hearthhome', 'standinghedge', 'SW', "the Hedge's nearest stone stands on the ridge to the south west"],
    ['hearthhome', 'chalkpits', 'NW', 'the chalk hills are in the north west'],
    ['standinghedge', 'millrun', 'W', 'the lane runs west past the long meadow to the mill'],
    ['hearthhome', 'coldwake', 'SW', 'Coldwake is the hamlet on the far side'],
    ['beechhangar', 'chalkpits', 'N', 'the ridge path climbs out of the wood and the chalk scar is ahead'],
  ];
  for (const [a, b, w, why] of want) {
    ck(`${G[a].name} to ${G[b].name} is ${w}, which is what the doc says`,
      wordOf(G[a], G[b]) === w, `${wordOf(G[a], G[b])}: ${why}`);
  }
  // and the same six with the sheet flipped, to prove the check has teeth. Due
  // west stays due west under a flip of z, which is why it is counted apart
  // rather than claimed: five of the six reverse, and the sixth cannot.
  const flipped = (g) => ({ x: g.x, z: -g.z });
  const turned = want.filter(([a, b, w]) => wordOf(flipped(G[a]), flipped(G[b])) !== w);
  const flat = want.filter(([, , w]) => w === 'E' || w === 'W');
  ck('and with the sheet\'s z the other way up, every bearing with a north or a south in it reverses',
    turned.length === want.length - flat.length && flat.length === 1,
    `${turned.length} of ${want.length} reverse; ${flat.length} is due west and cannot`);
}

// -------------------------------------------------------------- the twelve --

console.log('\nthe twelve spaces');
{
  ck('there are twelve of them', GUIDE_ZONES.length === 12, GUIDE_ZONES.map((g) => g.id).join(', '));
  const realm = ZONE[GUIDE_REALM];
  for (const g of GUIDE_ZONES) {
    const d = Math.hypot(g.x - realm.x, g.z - realm.z);
    console.log(`    ${g.name.padEnd(21)} ${g.x.toFixed(0).padStart(6)}, ${g.z.toFixed(0).padStart(6)}   r ${String(g.r).padStart(4)} m   ${d.toFixed(0).padStart(4)} m out   ${g.models.length} models`);
  }
  ck('every one of them stands on ground the release gate calls open',
    GUIDE_ZONES.every((g) => openAt(g.x, g.z)),
    `the furthest out is ${Math.round(Math.max(...GUIDE_ZONES.map((g) => Math.hypot(g.x, g.z))))} m, and the gate reaches ${realm.r + realm.edge * 0.5} m`);
  ck('and all but the Kingsroad camp stand inside the realm circle itself',
    GUIDE_AUDIT.beyondCore.join() === 'kingsroad',
    `beyond ${realm.r} m: ${GUIDE_AUDIT.beyondCore.join(', ') || 'none'}; the camp is where the road ENTERS the realm`);

  ck('every name, line and landmark is written',
    GUIDE_ZONES.every((g) => g.name && g.line && g.landmark));
  ck('and no line has an em dash in it',
    GUIDE_ZONES.every((g) => !DASHES.test(`${g.line} ${g.landmark} ${g.name}`)));

  ck('every model id names a real footprint',
    GUIDE_ZONES.every((g) => g.models.every((m) => !!FOOTPRINT[m])),
    `${GUIDE_AUDIT.models} model ids over ${GUIDE_ZONES.length} spaces, out of ${Object.keys(FOOTPRINT).length} footprints`);
  ck('and every space names something to put in it',
    GUIDE_ZONES.every((g) => g.models.length + g.wanted.length > 0),
    `fewest is ${Math.min(...GUIDE_ZONES.map((g) => g.models.length))}`);
  ck('what the doc names and nobody has modelled yet is kept apart, not dropped',
    GUIDE_AUDIT.wanted === 3 && GUIDE_BY_ID.millrun.wanted.length === 1 && GUIDE_BY_ID.watermeadows.wanted.length === 2,
    GUIDE_ZONES.flatMap((g) => g.wanted).join(', '));

  ck('the Standing Hedge is a ring and nothing else is',
    GUIDE_ZONES.filter((g) => g.annulus).map((g) => g.id).join() === 'standinghedge'
    && GUIDE_BY_ID.standinghedge.band > 0,
    `r ${GUIDE_BY_ID.standinghedge.r} m, band ${GUIDE_BY_ID.standinghedge.band} m`);
  ck('and the village and the cellars stand INSIDE the ring, which is what its own line says',
    insideRing(GUIDE_BY_ID.hearthhome.x, GUIDE_BY_ID.hearthhome.z)
    && insideRing(GUIDE_BY_ID.oldcellars.x, GUIDE_BY_ID.oldcellars.z),
    `the village is ${Math.round(Math.hypot(GUIDE_BY_ID.hearthhome.x - GUIDE_BY_ID.standinghedge.x, GUIDE_BY_ID.hearthhome.z - GUIDE_BY_ID.standinghedge.z))} m from the ring's middle`);
  ck('and the mill, which is west of it, does not',
    !insideRing(GUIDE_BY_ID.millrun.x, GUIDE_BY_ID.millrun.z));
}

// --------------------------------------------------------------- picking ---

console.log('\nwhat is under a point');
{
  const v = GUIDE_BY_ID.hearthhome;
  ck('the middle of the village is the village', guideZoneAt(v.x, v.z)?.id === 'hearthhome');
  ck('and a metre inside its boundary still is',
    guideZoneAt(v.x + v.r - 1, v.z)?.id === 'hearthhome');
  ck('and a metre outside it is not', (() => {
    const hit = guideZoneAt(v.x + v.r + 1, v.z);
    return !hit || hit.id !== 'hearthhome';
  })(), `${guideZoneAt(v.x + v.r + 1, v.z)?.id || 'nothing'} at ${Math.round(v.x + v.r + 1)}, ${Math.round(v.z)}`);

  // the ring is an ANNULUS, and this is the whole reason for the flag: the
  // middle of the ring is 1000 m of open field with the village in it, and a
  // hover there must not say "the Standing Hedge"
  const ring = GUIDE_BY_ID.standinghedge;
  ck('a point ON the ring is the ring', guideZoneAt(ring.x + ring.r, ring.z)?.id === 'standinghedge');
  ck('and a point in the middle of the ring is NOT the ring, it is open ground',
    guideZoneAt(ring.x + 40, ring.z + 40) === null,
    `${guideZoneAt(ring.x + 40, ring.z + 40)?.id || 'nothing'} 57 m from the ring's middle`);
  ck('and a point well outside the ring is not the ring either',
    guideZoneAt(ring.x + ring.r + ring.band + 40, ring.z) === null);
  ck('the smallest thing you stand in wins, so the village beats the ring where they meet',
    (() => {
      // a point on the ring's circle that is also inside the village
      const dx = v.x - ring.x, dz = v.z - ring.z, d = Math.hypot(dx, dz);
      const px = ring.x + (dx / d) * ring.r, pz = ring.z + (dz / d) * ring.r;
      const near = guideZoneAt(px, pz);
      return near && near.r <= ring.r;
    })());
  ck('slack widens the reach and nothing else', (() => {
    const out = [v.x + v.r + 30, v.z];
    return guideZoneAt(out[0], out[1], 0) === null && guideZoneAt(out[0], out[1], 60)?.id === 'hearthhome';
  })());
  ck('open country between the spaces is nothing at all',
    guideZoneAt(2100, -2000) === null);
}

// ------------------------------------------------------- roads and river ---

console.log('\nthe ways across it');
{
  ck('there are two roads and one river',
    GUIDE_ROADS.length === 2 && GUIDE_RIVER.pts.length >= 12,
    `${GUIDE_ROADS.map((r) => `${r.id} (${r.pts.length} pts)`).join(', ')}, river ${GUIDE_RIVER.pts.length} pts`);
  const all = [...GUIDE_ROADS.flatMap((r) => r.pts), ...GUIDE_RIVER.pts];
  ck('every traced point carries the image fraction it was traced at AND the world metres',
    all.every((p) => Number.isFinite(p.u) && Number.isFinite(p.v) && Number.isFinite(p.x) && Number.isFinite(p.z)));
  ck('and every one of them is the mapping applied to its own fraction, so the line on the sheet is the line on the ground',
    all.every((p) => {
      const [x, z] = imageToWorld(p.u, p.v);
      return Math.abs(x - p.x) < 1e-9 && Math.abs(z - p.z) < 1e-9;
    }), `${all.length} points`);

  const near = (pt, g, m) => Math.hypot(pt.x - g.x, pt.z - g.z) <= m;
  const road = GUIDE_ROADS.find((r) => r.id === 'kingsroad');
  ck('the Kingsroad passes the Legion camp and ends at the village',
    road.pts.some((p) => near(p, GUIDE_BY_ID.kingsroad, 60))
    && near(road.pts[road.pts.length - 1], GUIDE_BY_ID.hearthhome, 40));
  ck('and it comes in from the north east corner, which is +x and -z',
    road.pts[0].x > 1900 && road.pts[0].z < -1900,
    `${road.pts[0].x.toFixed(0)}, ${road.pts[0].z.toFixed(0)}`);

  const lane = GUIDE_ROADS.find((r) => r.id === 'villagelane');
  ck('the lane leaves the village, crosses the ring and ends at the mill',
    near(lane.pts[0], GUIDE_BY_ID.hearthhome, 40)
    && lane.pts.some((p) => Math.abs(Math.hypot(p.x - GUIDE_BY_ID.standinghedge.x, p.z - GUIDE_BY_ID.standinghedge.z) - GUIDE_BY_ID.standinghedge.r) < GUIDE_BY_ID.standinghedge.band)
    && near(lane.pts[lane.pts.length - 1], GUIDE_BY_ID.millrun, 40));
  ck('and it passes the Long Meadow on the way',
    lane.pts.some((p) => near(p, GUIDE_BY_ID.longmeadow, GUIDE_BY_ID.longmeadow.r)));

  const passes = (id, m) => GUIDE_RIVER.pts.some((p) => near(p, GUIDE_BY_ID[id], m));
  ck('the river runs past the mill, the water meadows, the cellars and the village',
    // the river keeps to the banks: within the place's own reach plus a bank
    passes('millrun', GUIDE_BY_ID.millrun.r + 40) && passes('watermeadows', 60) && passes('oldcellars', GUIDE_BY_ID.oldcellars.r + 40) && passes('hearthhome', GUIDE_BY_ID.hearthhome.r + 40));
  ck('and it runs west to east, out of the north west and off the east side',
    GUIDE_RIVER.pts[0].x < -1000 && GUIDE_RIVER.pts[0].z < -1500
    && GUIDE_RIVER.pts[GUIDE_RIVER.pts.length - 1].x > 2000,
    `${GUIDE_RIVER.pts[0].x.toFixed(0)}, ${GUIDE_RIVER.pts[0].z.toFixed(0)} to ${GUIDE_RIVER.pts[GUIDE_RIVER.pts.length - 1].x.toFixed(0)}, ${GUIDE_RIVER.pts[GUIDE_RIVER.pts.length - 1].z.toFixed(0)}`);
}

// ---------------------------------------------------------------- the audit --
//
// Every rule, driven TRUE and FALSE. An audit that only ever sees the good case
// passes just as happily when it is `return true`.

console.log('\nthe audit, both ways');
{
  ck('the real guide passes', !!GUIDE_AUDIT && GUIDE_AUDIT.zones === 12, JSON.stringify(GUIDE_AUDIT));
  const good = GUIDE_ZONES.map((g) => ({ ...g, models: g.models.slice(), wanted: g.wanted.slice() }));
  const bend = (id, over) => good.map((g) => (g.id === id ? { ...g, ...over } : g));

  ck('and it passes again when it is handed its own list back, so the harness is honest',
    !threw(() => auditGuide(good)));

  let e = threw(() => auditGuide(bend('coldwake', { x: 6000, z: 0 })));
  ck('a space outside the realm is refused', !!e && /closed ground/.test(e.message), e && e.message.split('\n')[1]);

  e = threw(() => auditGuide(bend('coldwake', { models: ['a_model_nobody_made'] })));
  ck('a model id that is not a footprint is refused', !!e && /not a footprint/.test(e.message));

  e = threw(() => auditGuide(bend('coldwake', { models: [], wanted: [] })));
  ck('a space that names nothing to put in it is refused', !!e && /names nothing/.test(e.message));

  e = threw(() => auditGuide(bend('coldwake', { line: '' })));
  ck('a space with no line is refused', !!e && /has no line/.test(e.message));

  e = threw(() => auditGuide(bend('coldwake', { r: 0 })));
  ck('a space with no boundary is refused', !!e && /no boundary/.test(e.message));

  e = threw(() => auditGuide(bend('standinghedge', { band: 0 })));
  ck('a ring with no band is refused, because nothing could ever be inside it', !!e && /no band/.test(e.message));

  // the overlap rule, on both sides of the line: two discs 220 m apart share
  // most of the smaller, and the audit refuses it; move them apart and it does not
  const pair = (gap) => bend('coldwake', { x: GUIDE_BY_ID.beechhangar.x + gap, z: GUIDE_BY_ID.beechhangar.z });
  e = threw(() => auditGuide(pair(220)));
  ck('two spaces claiming the same field are refused', !!e && /share \d+ percent/.test(e.message), e && e.message.split('\n')[1]);
  ck('and the same two, far enough apart, are not',
    !threw(() => auditGuide(pair(900))),
    `${Math.round(lensArea(900, 420, 220) / (Math.PI * 220 * 220) * 100)} percent shared at 900 m, and the limit is ${Math.round(OVERLAP_MAX * 100)}`);

  // and the exemption is real: the village and the cellars are both inside the
  // ring and both overlap it completely, and that is allowed on purpose
  ck('the ring may hold other spaces inside it, and does', (() => {
    const ring = GUIDE_BY_ID.standinghedge;
    const share = lensArea(Math.hypot(GUIDE_BY_ID.hearthhome.x - ring.x, GUIDE_BY_ID.hearthhome.z - ring.z), ring.r, GUIDE_BY_ID.hearthhome.r)
      / (Math.PI * GUIDE_BY_ID.hearthhome.r * GUIDE_BY_ID.hearthhome.r);
    return share > 0.99 && !threw(() => auditGuide(good));
  })(), 'the village is wholly inside the ring and the audit allows it');

  e = threw(() => auditGuide([...good, { ...good[0] }]));
  ck('two spaces with the same id are refused', !!e && /two spaces are called/.test(e.message));
}

// ---------------------------------------------------------- the picture ----

console.log('\nthe painting itself');
{
  ck('it is looked for at one path, and the file it comes from is named',
    GUIDE_ART.url === '/maps/greenwold.png' && GUIDE_ART.file === 'public/maps/greenwold.png');
  ck('and the sentence that says so names the path a user has to type',
    GUIDE_ART.missing.includes(GUIDE_ART.file) && !DASHES.test(GUIDE_ART.missing),
    GUIDE_ART.missing);

  resetGuideArt();
  ck('with no browser at all it settles on missing rather than throwing', (() => {
    const a = loadGuideArt({ Image: null });
    return a.state === 'missing';
  })(), guideArt().state);

  // the real path, driven with a fake Image: loading, then ready, and the
  // listeners are told. This is the path a browser takes.
  resetGuideArt();
  {
    let told = 0, lastState = null;
    const off = onGuideArt((a) => { told++; lastState = a.state; });
    let made = null;
    class FakeImage { constructor() { made = this; this.width = 1676; this.height = 942; } }
    const started = loadGuideArt({ Image: FakeImage });
    ck('asking for it puts it in loading and sets the src', started.state === 'loading' && made.src === GUIDE_ART.url, made.src);
    ck('and asking twice does not start a second load', loadGuideArt({ Image: FakeImage }) === guideArt());
    made.onload();
    ck('when it arrives it is ready, with its own size', guideArt().state === 'ready' && guideArt().w === 1676 && guideArt().h === 942,
      `${guideArt().w} by ${guideArt().h}`);
    ck('and everyone waiting on it was told', told === 2 && lastState === 'ready', `${told} calls, last "${lastState}"`);
    off();
  }
  // and the other way: a 404, which is where the user is until they drop the file in
  resetGuideArt();
  {
    let told = 0;
    const off = onGuideArt(() => { told++; });
    let made = null;
    class FakeImage { constructor() { made = this; } }
    loadGuideArt({ Image: FakeImage });
    made.onerror();
    ck('a picture that is not there ends missing, and says where to put it',
      guideArt().state === 'missing' && guideArt().why === GUIDE_ART.missing);
    ck('and the listeners were told that too', told === 2, `${told} calls`);
    off();
  }
  resetGuideArt();
  ck('and it can be put back to the beginning, which is where every other suite finds it',
    guideArt().state === 'idle');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
