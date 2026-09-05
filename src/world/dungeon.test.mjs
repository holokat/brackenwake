// The level as geometry: what a player would actually meet down there.
// Run: node src/world/dungeon.test.mjs
//
// three runs in node as long as the handful of browser globals tree_edit.js
// reaches for exist. Nothing here draws; it builds the same scene graph the
// game builds and then asks it questions.
//
// The questions that matter most are in "the walls are solid" and "the roof".
// The walls used to be single sided faces pointing into the room, so the wall
// between the camera and the player was culled and you looked through it. The
// test for that is not "the material says DoubleSide", it is a ray fired from
// the floor at the wall AND a ray fired at the same wall from out in the rock,
// with a hit demanded both ways, plus a regression that flips the material back
// to FrontSide and insists the outside ray then MISSES. A test that cannot fail
// on the bug it was written for proves nothing.
globalThis.performance ||= { now: () => Date.now() };
globalThis.requestAnimationFrame ||= (fn) => setTimeout(() => fn(performance.now()), 16);
globalThis.window ||= { addEventListener() {} };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

const THREE = await import('three');
const { generateDungeon, maxLevel, worldOf, gridOf, walkable, roomAt, CELL } = await import('./dungeon_gen.js');
const {
  createDungeonScene, cameraClamp, cellsCrossed, ceilingAt,
  LIGHT_BUDGET, TORCH_POOL, TORCH_RANGE, TORCH_SPACING, WALL_H, CEIL, TEX_SIZE,
  CAM_CEIL_GAP, CAM_MIN_Y,
  setDungeonCanvasFactory, stubCanvasFactory, stoneSheets,
} = await import('./dungeon.js');
const { treeFieldsFor } = await import('../farm/tree_edit.js');

// node has no canvas. The sheets are still built, still cached and still wired
// to real materials; only the pixels are blank. Geometry and placement, which
// is what this file measures, are untouched by that.
setDungeonCanvasFactory(stubCanvasFactory);

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const seed = 20260904;

const built = [];
let genMs = 0, buildMs = 0;
for (const kind of ['dungeon', 'cave']) {
  for (let i = 0; i < 6; i++) {
    const site = { id: `${i},${kind}`, cx: i * 5 - 12, cz: 3 - i * 4, kind, name: `site ${i}` };
    for (let l = 1; l <= maxLevel(kind); l++) {
      let t = performance.now();
      const layout = generateDungeon(seed, site, l);
      genMs += performance.now() - t;
      t = performance.now();
      const scene = createDungeonScene(THREE, layout, {});
      buildMs += performance.now() - t;
      scene.group.updateMatrixWorld(true);
      built.push({ layout, scene });
    }
  }
}
check('built a scene for every level', built.length === 6 * 3 + 6 * 1, `${built.length} scenes`);

// ---- what a level costs, measured ---------------------------------------
{
  console.log('  --- per level, measured ---');
  const rows = {};
  for (const b of built) (rows[`${b.layout.kind} L${b.layout.level}`] ||= []).push(b.scene);
  let worstTris = 0;
  for (const [k, list] of Object.entries(rows)) {
    const num = (f) => list.map(f);
    const mm = (a) => `${Math.min(...a)}..${Math.max(...a)}`;
    const tris = num((s) => s.stats.triangles);
    worstTris = Math.max(worstTris, ...tris);
    console.log(`      ${k.padEnd(11)} grid ${mm(num((s) => s.layout.w))} x ${mm(num((s) => s.layout.h))}`
      + `  floor ${mm(num((s) => s.stats.floorCells))} cells`
      + `  wall faces ${mm(num((s) => s.stats.wallFaces))}`
      + `  tris ${mm(tris)}`
      + `  lights ${mm(num((s) => s.lightCount))}`
      + `  torches ${mm(num((s) => s.stats.torches))}`
      + `  pillars ${mm(num((s) => s.stats.pillars))}`
      + `  props ${mm(num((s) => s.stats.props))}`
      + `  pools ${mm(num((s) => s.stats.pools))}`);
  }
  console.log(`      generation ${(genMs / built.length).toFixed(2)} ms a level, geometry ${(buildMs / built.length).toFixed(1)} ms a level`);
  check('no level costs more than 60k triangles', worstTris < 60000, `worst ${worstTris}`);
  check('and generating one takes under 5 ms', genMs / built.length < 5, `${(genMs / built.length).toFixed(2)} ms mean`);
}

// ---- the light budget ----------------------------------------------------
{
  let over = 0, most = 0, dark = 0;
  for (const { scene } of built) {
    let n = 0;
    scene.group.traverse((o) => { if (o.isPointLight) n++; });
    most = Math.max(most, n);
    if (n > LIGHT_BUDGET) over++;
    if (n < 3) dark++;
    if (n !== scene.lightCount) over++;
  }
  check(`no level lights more than ${LIGHT_BUDGET} point lights`, over === 0, `most ${most}`);
  check('and no level is lit by fewer than three', dark === 0);
  check('the roaming pool is smaller than the budget', TORCH_POOL < LIGHT_BUDGET, `${TORCH_POOL} roaming + entrance + stair`);
  // a fill that is not a point light, so a corner with no torch is not black
  let filled = 0;
  for (const { scene } of built) {
    let amb = false, hemi = false;
    scene.group.traverse((o) => { if (o.isAmbientLight) amb = true; if (o.isHemisphereLight) hemi = true; });
    if (amb && hemi) filled++;
  }
  check('every level carries an ambient and a hemisphere fill, off the budget', filled === built.length, `${filled}/${built.length}`);
}

// ---- torches: walking the level lights every one of them -----------------
{
  let missed = 0, torches = 0, lit = 0;
  for (const { scene } of built) {
    const seen = new Set();
    for (const t of scene.torches) {
      scene.update(0.016, { x: t.x, z: t.z });
      let n = 0;
      scene.group.traverse((o) => { if (o.isPointLight && o.visible) { n++; seen.add(`${o.position.x.toFixed(2)},${o.position.z.toFixed(2)}`); } });
      lit = Math.max(lit, n);
    }
    torches += scene.torches.length;
    for (const t of scene.torches) if (!seen.has(`${t.x.toFixed(2)},${t.z.toFixed(2)}`)) missed++;
  }
  check('standing at each torch in turn lights every torch', torches > 0 && missed === 0, `${torches} stands, ${missed} never lit`);
  check('and never more lights burn at once than the budget', lit <= LIGHT_BUDGET, `most lit at once ${lit}`);
  // the promise that a torch never winks is a promise about the distance
  // between STANDS, so measure that distance rather than restating the promise
  let minSep = Infinity;
  for (const { scene } of built) {
    for (let i = 0; i < scene.torches.length; i++) for (let j = i + 1; j < scene.torches.length; j++) {
      const a = scene.torches[i], b = scene.torches[j];
      minSep = Math.min(minSep, Math.hypot(a.x - b.x, a.z - b.z));
    }
  }
  check('no two light stands are closer than a torch light reaches', minSep > TORCH_RANGE,
    `closest pair ${minSep.toFixed(2)} m, reach ${TORCH_RANGE} m, spacing rule ${TORCH_SPACING * CELL} m`);
  let inRange = 0;
  for (const { scene } of built) {
    scene.update(0.016, { x: scene.entrancePos.x, z: scene.entrancePos.z });
    const on = [];
    scene.group.traverse((o) => { if (o.isPointLight && o.visible) on.push(o); });
    const off = scene.torches.filter((t) => !on.some((l) => l.position.distanceTo(t) < 0.01));
    for (const t of off) {
      const d = Math.hypot(t.x - scene.entrancePos.x, t.z - scene.entrancePos.z);
      const reach = on[0]?.distance ?? TORCH_RANGE;
      if (d < reach) inRange++;
    }
  }
  check('an unlit torch is always out of a torch light\'s reach', inRange === 0, `${inRange} would have winked`);
}

// ---- the flicker, and both shapes of update() ----------------------------
{
  const { scene } = built[0];
  const at = { x: scene.entrancePos.x, z: scene.entrancePos.z };
  const lit = () => { const o = []; scene.group.traverse((l) => { if (l.isPointLight && l.visible) o.push(l); }); return o; };
  // the stair light is a cold blue beacon and is meant to be steady; every
  // flame in the level is meant to move. Name which is which and check both.
  // the stair light stands 2.1 m over the hole, so tell it apart on the floor
  // plan and not in three dimensions
  const isStair = (l) => !!scene.stairPos
    && Math.hypot(l.position.x - scene.stairPos.x, l.position.z - scene.stairPos.z) < 0.5;
  scene.update(0, at);
  const i0 = lit().map((l) => l.intensity);
  scene.update(0.05, at);
  const l1 = lit(), i1 = l1.map((l) => l.intensity);
  scene.update(0.05, at);
  const i2 = lit().map((l) => l.intensity);
  const flames = l1.map((l, i) => [l, i]).filter(([l]) => !isStair(l));
  const steady = l1.map((l, i) => [l, i]).filter(([l]) => isStair(l));
  const moved = flames.filter(([, i]) => Math.abs(i0[i] - i1[i]) > 1e-6 && Math.abs(i1[i] - i2[i]) > 1e-6).length;
  check('time passing moves every flame\'s intensity', flames.length > 0 && moved === flames.length,
    `${moved}/${flames.length} flames, e.g. ${i0[0].toFixed(3)} -> ${i1[0].toFixed(3)} -> ${i2[0].toFixed(3)}`);
  check('and the cold light over the stair does not flicker', steady.length === 1 && steady.every(([, i]) => i0[i] === i1[i] && i1[i] === i2[i]),
    `${steady.length} steady light`);
  check('and no flame goes dark or doubles', flames.every(([, i]) => i1[i] > 6 && i1[i] < 16),
    `range ${Math.min(...flames.map(([, i]) => i1[i])).toFixed(2)}..${Math.max(...flames.map(([, i]) => i1[i])).toFixed(2)}`);
  // world_runtime.js still says update({ x, z }); that must keep working
  const far = scene.torches[scene.torches.length - 1];
  const legacy = scene.update({ x: far.x, z: far.z });
  const near = lit().some((l) => l.position.distanceTo(far) < 0.01);
  check('the old one argument update(pos) still moves the pool', legacy === true && near);
  check('and update(dt, pos) with no movement reports no move', scene.update(0.016, { x: far.x, z: far.z }) === false);
}

// ---- the exits -----------------------------------------------------------
{
  let up = 0, down = 0, bottoms = 0, bottomDown = 0, hitAtEntrance = 0;
  for (const { layout, scene } of built) {
    const tags = new Set();
    scene.group.traverse((o) => { if (o.userData.exit) tags.add(o.userData.exit); });
    if (tags.has('up')) up++;
    if (layout.stair) { if (tags.has('down')) down++; }
    else { bottoms++; if (!tags.has('down')) bottomDown++; }
    // the hit box stands on the entrance cell and is invisible on purpose:
    // three raycasts invisible objects, which is what makes it a free target
    const hb = scene.exits.find((e) => e.userData.exit === 'up');
    if (hb && !hb.visible && Math.abs(hb.position.x - scene.entrancePos.x) < 1e-9) hitAtEntrance++;
  }
  check('every level has a way up', up === built.length, `${up}/${built.length}`);
  const withStair = built.filter(({ layout }) => layout.stair).length;
  check('every level above the bottom has a way down', down === withStair, `${down}/${withStair}`);
  check('and the bottom level renders no stair at all', bottoms > 0 && bottomDown === bottoms, `${bottomDown}/${bottoms}`);
  check('the way up has an invisible hit box on the entrance cell', hitAtEntrance === built.length, `${hitAtEntrance}/${built.length}`);
  let mismatched = 0;
  for (const { layout, scene } of built) {
    const e = worldOf(layout, layout.entrance.gx, layout.entrance.gz);
    if (Math.abs(scene.entrancePos.x - e.x) > 1e-9 || Math.abs(scene.entrancePos.z - e.z) > 1e-9) mismatched++;
    if (layout.stair) { const s = worldOf(layout, layout.stair.gx, layout.stair.gz); if (Math.abs(scene.stairPos.x - s.x) > 1e-9) mismatched++; }
  }
  check('the markers stand on the cells the layout named', mismatched === 0);
  // world_runtime.js picks the exits by raycasting scene.exits and nothing else
  let boxes = 0;
  for (const { layout, scene } of built) {
    const want = layout.stair ? 2 : 1;
    if (scene.exits.length === want && scene.exits.every((e) => e.geometry.type === 'BoxGeometry' && !e.visible)) boxes++;
  }
  check('the hit boxes world_runtime picks are still boxes, still invisible', boxes === built.length, `${boxes}/${built.length}`);
}

// ---- geometry ------------------------------------------------------------
{
  let empty = 0, tall = 0, floors = 0;
  for (const { layout, scene } of built) {
    let verts = 0, maxY = 0;
    scene.group.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const p = o.geometry.attributes.position;
      verts += p.count;
      for (let i = 1; i < p.array.length; i += 3) maxY = Math.max(maxY, p.array[i]);
    });
    if (!verts) empty++;
    if (maxY >= WALL_H - 1e-6) tall++;
    // a floor quad and a roof quad per walkable cell, and the walls on top
    let cells = 0;
    for (let gz = 0; gz < layout.h; gz++) for (let gx = 0; gx < layout.w; gx++) if (walkable(layout, gx, gz)) cells++;
    if (verts >= cells * 12) floors++;
  }
  check('no level builds an empty scene', empty === 0);
  check('walls reach full height on every level', tall === built.length, `${tall}/${built.length}`);
  check('there is a floor quad and a roof quad per walkable cell', floors === built.length, `${floors}/${built.length}`);
  // every merged surface has to carry uvs, or a textured material draws nothing
  let uvOk = 0, meshes = 0;
  for (const { scene } of built) {
    for (const part of Object.values(scene.parts)) {
      for (const mesh of [].concat(part)) {
        if (!mesh || !mesh.isMesh) continue;
        meshes++;
        const g = mesh.geometry;
        if (g.attributes.uv && g.attributes.uv.count === g.attributes.position.count) uvOk++;
      }
    }
  }
  check('every merged surface carries one uv per vertex', meshes > 0 && uvOk === meshes, `${uvOk}/${meshes}`);

  // The winding audit. three culls and flips normals by the TRIANGLE's winding,
  // never by the normal attribute, so a triangle wound against its own normal
  // is drawn from the wrong side under FrontSide and lit from the wrong side
  // under DoubleSide. Half of every wall in this level used to be exactly that.
  let tris = 0, backwards = 0, worst = '';
  for (const { scene } of built) {
    scene.group.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.normal || o.geometry.index) return;
      const p = o.geometry.attributes.position.array, nr = o.geometry.attributes.normal.array;
      for (let i = 0; i < p.length; i += 9) {
        const e1 = [p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]];
        const e2 = [p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]];
        const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const len = Math.hypot(c[0], c[1], c[2]);
        if (len < 1e-9) continue;                 // a degenerate sliver has no side
        tris++;
        if ((c[0] * nr[i] + c[1] * nr[i + 1] + c[2] * nr[i + 2]) / len < 1e-6) { backwards++; worst = o.name || o.type; }
      }
    });
  }
  check('every triangle is wound the way its own normal points', tris > 0 && backwards === 0,
    `${backwards} of ${tris} triangles wound backwards${backwards ? ', worst in ' + worst : ''}`);
}

// ==========================================================================
// The walls are solid.
// ==========================================================================
const deepLevel = built.find(({ layout }) => layout.kind === 'dungeon' && layout.level === 3);
const caveLevel = built.find(({ layout }) => layout.kind === 'cave');
{
  // 1. the material. A FrontSide wall face points into the room it borders, so
  //    the wall between the camera and the room is culled and you see through.
  let sided = 0, walls = 0;
  for (const { scene } of built) for (const m of scene.parts.walls) { walls++; if (m.material.side === THREE.DoubleSide) sided++; }
  check('every wall mesh is drawn from both sides', walls > 0 && sided === walls, `${sided}/${walls}`);

  // 2. the rays. From the floor beside a wall cell, and from out in the rock
  //    behind it, at chest height. Exhaustive on one level of each kind and
  //    sampled on the others, because a full sweep of 24 levels is a minute.
  const ray = new THREE.Raycaster();
  // The outside ray starts BACK m into the rock and looks back at the room, so
  // the wall face it has to find stands at BACK + half a cell. Asking only for
  // "some hit before the room" is not good enough: where the rock is one cell
  // thick the ray starts in the next room along and meets that room's own wall
  // first, and a FrontSide build would pass on that. So the demand is that the
  // face of THIS cell is among the hits, at the distance it must be at.
  const BACK = 4, FACE = BACK + CELL / 2;
  const sweep = (entry, everyNth) => {
    const { layout, scene } = entry;
    let cells = 0, inHit = 0, outHit = 0, inWrong = 0, seen = 0, sampled = 0;
    for (let gz = 0; gz < layout.h; gz++) for (let gx = 0; gx < layout.w; gx++) {
      if (walkable(layout, gx, gz)) continue;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => walkable(layout, gx + dx, gz + dz));
      if (!dirs.length) continue;
      seen++;
      if (seen % everyNth) continue;
      sampled++;
      for (const [dx, dz] of dirs) {
        cells++;
        const F = worldOf(layout, gx + dx, gz + dz);
        // from the floor cell centre toward the wall cell centre
        ray.set(new THREE.Vector3(F.x, 1.2, F.z), new THREE.Vector3(-dx, 0, -dz));
        ray.far = 4;
        const h1 = ray.intersectObjects(scene.parts.walls, false);
        if (!h1.length) continue;
        inHit++;
        // and it is the face at the cell boundary, one metre out, not some
        // wall three cells further on that happens to be in line
        if (Math.abs(h1[0].distance - CELL / 2) > 0.05) inWrong++;
      }
      // and from outside the rock, back toward the room
      const [dx, dz] = dirs[0];
      const W = worldOf(layout, gx, gz);
      ray.set(new THREE.Vector3(W.x - dx * BACK, 1.2, W.z - dz * BACK), new THREE.Vector3(dx, 0, dz));
      ray.far = FACE + 0.5;
      if (ray.intersectObjects(scene.parts.walls, false).some((h) => Math.abs(h.distance - FACE) < 0.05)) outHit++;
    }
    return { cells, inHit, outHit, inWrong, sampled };
  };

  for (const [name, entry] of [['a dungeon level', deepLevel], ['a cave level', caveLevel]]) {
    const r = sweep(entry, 1);
    check(`${name}: every wall face answers a ray from the floor beside it`, r.cells > 0 && r.inHit === r.cells,
      `${r.inHit}/${r.cells} faces on ${r.sampled} wall cells`);
    check(`${name}: and every one of them stands at the cell boundary`, r.inWrong === 0, `${r.inWrong} at the wrong distance`);
    check(`${name}: and a ray from out in the rock cannot see into the room`, r.outHit === r.sampled,
      `${r.outHit}/${r.sampled} wall cells blocked`);
  }
  let allIn = 0, allOut = 0, allCells = 0, allSampled = 0;
  for (const entry of built) {
    if (entry === deepLevel || entry === caveLevel) continue;
    const r = sweep(entry, 7);
    allIn += r.inHit; allCells += r.cells; allOut += r.outHit; allSampled += r.sampled;
  }
  check('and on every other level, sampled, the same holds both ways',
    allCells > 0 && allIn === allCells && allOut === allSampled,
    `${allIn}/${allCells} faces inside, ${allOut}/${allSampled} cells outside, over ${built.length - 2} levels`);

  // 3. the regression. Put the material back the way it shipped, and the
  //    outside ray must MISS, or this test would have passed on the broken
  //    build too and proved nothing about anything.
  {
    for (const m of deepLevel.scene.parts.walls) m.material.side = THREE.FrontSide;
    const broke = sweep(deepLevel, 5);
    for (const m of deepLevel.scene.parts.walls) m.material.side = THREE.DoubleSide;
    const fixed = sweep(deepLevel, 5);
    check('with FrontSide walls the outside ray sees straight in, which was the bug',
      broke.outHit === 0 && broke.sampled > 0, `${broke.sampled - broke.outHit}/${broke.sampled} wall cells were see-through`);
    check('and putting DoubleSide back closes every one of them', fixed.outHit === fixed.sampled, `${fixed.outHit}/${fixed.sampled}`);
  }
}

// ==========================================================================
// The roof.
// ==========================================================================
{
  let roofed = 0;
  for (const { scene } of built) if (scene.parts.ceiling) roofed++;
  check('every level builds a ceiling', roofed === built.length, `${roofed}/${built.length}`);

  const ray = new THREE.Raycaster();
  const up = new THREE.Vector3(0, 1, 0), down = new THREE.Vector3(0, -1, 0);
  const roofSweep = (entry, everyNth) => {
    const { layout, scene } = entry;
    let cells = 0, hit = 0, low = 0, seen = 0;
    for (let gz = 0; gz < layout.h; gz++) for (let gx = 0; gx < layout.w; gx++) {
      if (!walkable(layout, gx, gz)) continue;
      seen++;
      if (seen % everyNth) continue;
      cells++;
      const p = worldOf(layout, gx, gz);
      ray.set(new THREE.Vector3(p.x, 0.05, p.z), up); ray.far = 40;
      const h = ray.intersectObject(scene.parts.ceiling, false);
      if (!h.length) continue;
      hit++;
      if (h[0].point.y < 2.6) low++;                 // a roof you would walk into
    }
    return { cells, hit, low };
  };
  for (const [name, entry] of [['a dungeon level', deepLevel], ['a cave level', caveLevel]]) {
    const r = roofSweep(entry, 1);
    check(`${name}: there is roof over every floor cell`, r.cells > 0 && r.hit === r.cells, `${r.hit}/${r.cells}`);
    check(`${name}: and none of it is low enough to walk into`, r.low === 0, `${r.low} under 2.6 m`);
  }
  let allHit = 0, allCells = 0, allLow = 0;
  for (const entry of built) {
    if (entry === deepLevel || entry === caveLevel) continue;
    const r = roofSweep(entry, 5);
    allHit += r.hit; allCells += r.cells; allLow += r.low;
  }
  check('and on every other level, sampled, the roof is unbroken', allCells > 0 && allHit === allCells && allLow === 0,
    `${allHit}/${allCells} covered, ${allLow} too low`);

  // the wall tops and the roof edges are the SAME points, so there is no slot
  // of daylight where a 4 m corridor meets a 6 m room
  let slots = 0, tops = 0;
  for (const { scene } of built) {
    const roof = new Set();
    const rp = scene.parts.ceiling.geometry.attributes.position.array;
    for (let i = 0; i < rp.length; i += 3) roof.add(`${rp[i].toFixed(3)}|${rp[i + 1].toFixed(3)}|${rp[i + 2].toFixed(3)}`);
    for (const m of scene.parts.walls) {
      const wp = m.geometry.attributes.position.array;
      // every wall vertex is either on the floor at y = 0 or up at the roof
      for (let i = 0; i < wp.length; i += 3) {
        if (wp[i + 1] < 1e-6) continue;
        tops++;
        if (!roof.has(`${wp[i].toFixed(3)}|${wp[i + 1].toFixed(3)}|${wp[i + 2].toFixed(3)}`)) slots++;
      }
    }
  }
  check('every wall top corner is also a roof corner, so nothing gapes', tops > 0 && slots === 0,
    `${slots} of ${tops} wall top corners were not on the roof`);

  // one sided, facing down, on purpose: a camera that gets above it looks in
  // rather than at a black lid. Say so with a ray instead of with a comment.
  {
    const { layout, scene } = deepLevel;
    const p = worldOf(layout, layout.entrance.gx, layout.entrance.gz);
    ray.set(new THREE.Vector3(p.x, 0.05, p.z), up); ray.far = 40;
    const fromBelow = ray.intersectObject(scene.parts.ceiling, false);
    ray.set(new THREE.Vector3(p.x, 30, p.z), down); ray.far = 60;
    const fromAbove = ray.intersectObject(scene.parts.ceiling, false);
    check('the roof is there from below', fromBelow.length > 0, fromBelow.length ? `at ${fromBelow[0].point.y.toFixed(2)} m` : 'nothing');
    check('and deliberately not there from above', fromAbove.length === 0);
  }

  // the heights the design asked for, measured off the grid rather than stated
  const heights = { corridor: [], room: [], hall: [], boss: [] };
  for (const { layout } of built.filter((b) => b.layout.kind === 'dungeon')) {
    for (let gz = 0; gz < layout.h; gz++) for (let gx = 0; gx < layout.w; gx++) {
      if (!walkable(layout, gx, gz)) continue;
      const r = roomAt(layout, gx, gz);
      const key = !r ? 'corridor' : (r.kind === 'boss' ? 'boss' : r.kind === 'hall' ? 'hall' : 'room');
      heights[key].push(ceilingAt(layout, gx, gz));
    }
  }
  const flat = (a) => a.length > 0 && Math.min(...a) === Math.max(...a);
  console.log(`  --- dungeon ceilings, metres --- corridor ${heights.corridor[0]}  room ${heights.room[0]}  hall ${heights.hall[0]}  great hall ${heights.boss[0]}`);
  check('a dungeon corridor is 4 m, a room 6, a hall 7 and the great hall 8',
    flat(heights.corridor) && heights.corridor[0] === CEIL.dungeon.corridor
    && flat(heights.room) && heights.room[0] === CEIL.dungeon.room
    && flat(heights.hall) && heights.hall[0] === CEIL.dungeon.hall
    && flat(heights.boss) && heights.boss[0] === CEIL.dungeon.boss);
  // a cave is domed, so its cavern ceilings must NOT all be one number
  const caveRoom = [];
  for (const { layout } of built.filter((b) => b.layout.kind === 'cave')) {
    const boss = layout.rooms.find((r) => r.kind === 'boss');
    if (!boss) continue;
    for (let gz = boss.z; gz < boss.z + boss.h; gz++) for (let gx = boss.x; gx < boss.x + boss.w; gx++) {
      if (walkable(layout, gx, gz)) caveRoom.push(ceilingAt(layout, gx, gz));
    }
  }
  check('a cave cavern is domed and not a flat lid', caveRoom.length > 0 && Math.max(...caveRoom) - Math.min(...caveRoom) > 2,
    `${Math.min(...caveRoom).toFixed(2)} m at the rim to ${Math.max(...caveRoom).toFixed(2)} m at the peak`);
}

// ==========================================================================
// The camera, kept in the room.
// ==========================================================================
{
  const { layout } = built.find(({ layout: L }) => L.kind === 'dungeon' && L.level === 1);
  const ent = worldOf(layout, layout.entrance.gx, layout.entrance.gz);
  const player = { x: ent.x, y: 0, z: ent.z };

  // 1. a clear camera is left exactly where it is
  {
    const cam = { x: ent.x + 0.5, y: 2.0, z: ent.z + 0.5 };
    const c = cameraClamp(layout, cam, player);
    check('a camera with a clear line and headroom is not touched',
      c.moved === false && c.x === cam.x && c.y === cam.y && c.z === cam.z,
      `(${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`);
  }

  // 2. a camera behind a wall is pulled inside
  {
    let hidden = null;
    for (let a = 0; a < 6.283 && !hidden; a += 0.05) {
      const dx = Math.cos(a), dz = Math.sin(a);
      for (let d = 2; d < 30; d += 0.5) {
        const g = gridOf(layout, ent.x + dx * d, ent.z + dz * d);
        if (walkable(layout, g.gx, g.gz)) continue;
        hidden = { x: ent.x + dx * (d + 4), y: 2.0, z: ent.z + dz * (d + 4), rockAt: d };
        break;
      }
    }
    check('found a wall to hide the camera behind', !!hidden, hidden ? `rock ${hidden.rockAt} m from the player` : 'none');
    const c = cameraClamp(layout, hidden, player);
    const g = gridOf(layout, c.x, c.z);
    const was = Math.hypot(hidden.x - player.x, hidden.z - player.z);
    const now = Math.hypot(c.x - player.x, c.z - player.z);
    check('a camera behind a wall is pulled back to the near side of it',
      c.moved === true && walkable(layout, g.gx, g.gz) && now < was,
      `${was.toFixed(2)} m -> ${now.toFixed(2)} m, and it lands on floor`);
  }

  // 3. the sweep: every angle, every distance camera.js can reach, on every
  //    level. After the clamp the segment from the player to the camera must
  //    cross no rock, checked with the same exact cell walk the clamp used, so
  //    a corner the clamp skipped would show up here.
  {
    let cases = 0, throughRock = 0, aboveRoof = 0, underFloor = 0, untouched = 0;
    for (const { layout: L } of built) {
      const e = worldOf(L, L.entrance.gx, L.entrance.gz);
      for (let a = 0; a < 6.283; a += 0.13) {
        for (const dist of [3, 6, 9, 14, 22, 32]) {
          for (const pitch of [0.15, 0.55, 1.35]) {
            const p = { x: e.x, y: 0, z: e.z };
            const cam = {
              x: e.x - Math.sin(a) * Math.cos(pitch) * dist,
              y: 1.5 + Math.sin(pitch) * dist,
              z: e.z - Math.cos(a) * Math.cos(pitch) * dist,
            };
            const c = cameraClamp(L, cam, p);
            cases++;
            if (!c.moved) untouched++;
            for (const cell of cellsCrossed(L, p.x, p.z, c.x, c.z)) {
              if (!walkable(L, cell.gx, cell.gz)) { throughRock++; break; }
            }
            const g = gridOf(L, c.x, c.z);
            if (c.y > ceilingAt(L, g.gx, g.gz) - CAM_CEIL_GAP + 1e-6) aboveRoof++;
            if (c.y < CAM_MIN_Y - 1e-6) underFloor++;
          }
        }
      }
    }
    check(`${cases} camera positions on every level, none of them left in the rock`, throughRock === 0, `${throughRock} through rock`);
    check('and none of them left above the roof', aboveRoof === 0, `${aboveRoof} above`);
    check('and none of them left under the floor', underFloor === 0, `${underFloor} under`);
    check('and the ones with a clear line were left alone', untouched > 0, `${untouched} of ${cases} untouched`);
  }

  // 4. the roof and the floor, each on its own
  {
    const c = cameraClamp(layout, { x: ent.x, y: 40, z: ent.z }, player);
    const g = gridOf(layout, c.x, c.z);
    check('a camera above the roof is dropped to just under it',
      c.moved && Math.abs(c.y - (ceilingAt(layout, g.gx, g.gz) - CAM_CEIL_GAP)) < 1e-6,
      `y ${c.y.toFixed(2)} under a ${ceilingAt(layout, g.gx, g.gz).toFixed(2)} m roof`);
    const d = cameraClamp(layout, { x: ent.x, y: -4, z: ent.z }, player);
    check('and one below the floor is lifted to head height', d.moved && d.y === CAM_MIN_Y, `y ${d.y}`);
  }

  // 5. a null layout is a no-op, because main.js calls this above ground too
  {
    const c = cameraClamp(null, { x: 3, y: 9, z: -4 }, player);
    check('no layout, no clamp', c.moved === false && c.x === 3 && c.y === 9 && c.z === -4);
  }
}

// ---- ore, water, and the pickaxe that has to reach it --------------------
{
  const caves = built.filter(({ layout }) => layout.kind === 'cave');
  const dungeons = built.filter(({ layout }) => layout.kind === 'dungeon');
  check('every cave level builds an ore field', caves.length > 0 && caves.every(({ scene }) => scene.oreField), `${caves.length} caves`);
  check('a dungeon level builds none', dungeons.every(({ scene }) => !scene.oreField));
  check('an ore rock stands on every ore cell', caves.every(({ layout, scene }) => scene.oreField.trees.length === layout.ore.length));
  check('the field is rock, takes five swings and gives up ore', caves.every(({ scene }) => scene.oreField.kind === 'rock' && scene.oreField.hits === 5 && scene.oreField.yield === 'ore'));
  check('and it drew instanced meshes, so the pickaxe has something to hit', caves.every(({ scene }) => scene.oreField.meshes.length > 0), `${caves[0].scene.oreField.meshes.length} layers`);
  check('the ore field is registered, so pickTree can find it', caves.every(({ scene }) => treeFieldsFor().includes(scene.oreField)));
  let onFloor = 0, total = 0;
  for (const { layout, scene } of caves) for (const t of scene.oreField.trees) {
    total++;
    const near = layout.ore.some((o) => { const p = worldOf(layout, o.gx, o.gz); return Math.abs(p.x - t.x) < 1e-9 && Math.abs(p.z - t.z) < 1e-9; });
    if (near && t.gy === 0) onFloor++;
  }
  check('every ore rock sits on the floor of its own cell', total > 0 && onFloor === total, `${onFloor}/${total}`);
  let pooled = 0, overDoor = 0, poolCells = 0;
  for (const { layout, scene } of caves) {
    if (scene.pools.length) pooled++;
    for (const p of scene.pools) {
      poolCells += p.cells;
      if (Math.abs(p.gx - layout.entrance.gx) < 1 && Math.abs(p.gz - layout.entrance.gz) < 1) overDoor++;
    }
  }
  check('caves have water in them', pooled > 0, `${pooled}/${caves.length} caves, ${poolCells} cells of water`);
  check('and none of it is poured over the way out', overDoor === 0);
  check('a dungeon has none', dungeons.every(({ scene }) => scene.pools.length === 0));
}

// ---- the pickaxe underground, and the farm it must not reach through -------
// pickTree raycasts every registered tree field at once, and three's raycaster
// does not skip invisible objects. If a hidden field still answered, a swing in
// a cave would land on an overworld boulder under the floor.
{
  const { pickTree } = await import('../farm/tree_edit.js');
  const site = { id: 'pick,1', cx: 4, cz: -9, kind: 'cave', name: 'the pick test' };
  const layout = generateDungeon(seed, site, 1);
  const scene = createDungeonScene(THREE, layout, {});
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const farm = { camera: cam, renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } } };
  const rock = scene.oreField.trees[0];
  cam.position.set(rock.x, 9, rock.z);
  cam.lookAt(rock.x, 0.4, rock.z);
  cam.updateMatrixWorld(true);
  scene.group.updateMatrixWorld(true);
  const seen = pickTree(farm, 50, 50);
  check('looking straight down at an ore rock picks it', !!seen && seen.field === scene.oreField, seen ? `index ${seen.index}` : 'nothing');
  scene.group.visible = false;
  scene.group.updateMatrixWorld(true);
  const hiddenPick = pickTree(farm, 50, 50);
  check('and the same swing picks nothing once the group is hidden', hiddenPick === null);
  scene.group.visible = true;
  check('turning it back on brings it back', !!pickTree(farm, 50, 50));
  scene.dispose();
  check('a disposed level answers no swing at all', pickTree(farm, 50, 50) === null);
}

// ---- the stone sheets ----------------------------------------------------
{
  const a = stoneSheets(THREE, 'blocks'), b = stoneSheets(THREE, 'blocks');
  check('a stone family is drawn once and shared', a === b);
  check('and it carries an albedo, a normal and a roughness', !!a.map && !!a.normalMap && !!a.roughnessMap);
  check('all four families draw', ['blocks', 'flags', 'rock', 'gravel'].every((f) => !!stoneSheets(THREE, f).map));
  let threw = false;
  try { stoneSheets(THREE, 'marble'); } catch { threw = true; }
  check('and a family nobody drew throws instead of shipping a blank wall', threw);

  // The stub swallows every call, so "the sheets were built" says nothing about
  // whether the drawing code WORKS. Swap in a context that counts what it is
  // asked to draw and throws on a coordinate that is not a number, and make the
  // four families draw for real. This still looks at no pixel. What it proves
  // is that the calls happen, on a 512 canvas, with finite arguments, which a
  // blank stub cannot tell you and which "it built a texture" hides.
  const seen = [];
  const recorder = (w, h) => {
    const calls = { n: 0 };
    const finite = (a) => { if (a.some((v) => !Number.isFinite(v))) throw new Error(`not a number: ${a}`); };
    const px = new Uint8ClampedArray(w * h * 4).fill(128);
    const ctx = {
      canvas: null, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
      fillRect: (...a) => { calls.n++; finite(a); },
      beginPath() {}, closePath() {},
      moveTo: (...a) => finite(a), lineTo: (...a) => finite(a),
      arc: (...a) => { calls.n++; finite(a); },
      fill() {}, stroke: () => { calls.n++; },
      save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
      getImageData: (x, y, gw, gh) => ({ width: gw, height: gh, data: px.slice(0, gw * gh * 4) }),
      createImageData: (gw, gh) => ({ width: gw, height: gh, data: new Uint8ClampedArray(gw * gh * 4) }),
      putImageData() {},
    };
    ctx.canvas = { width: w, height: h, getContext: () => ctx, calls };
    seen.push(ctx.canvas);
    return ctx.canvas;
  };
  setDungeonCanvasFactory(recorder);
  let drawn = 0, badSize = 0, thin = 0;
  for (const f of ['blocks', 'flags', 'rock', 'gravel']) {
    seen.length = 0;
    const s = stoneSheets(THREE, f);
    const n = seen.reduce((acc, c) => acc + c.calls.n, 0);
    if (seen.some((c) => c.width !== TEX_SIZE || c.height !== TEX_SIZE)) badSize++;
    if (n < 500) thin++;
    if (s.map && s.normalMap && s.roughnessMap) drawn++;
    console.log(`      ${f.padEnd(7)} ${seen.length} canvases at ${seen[0].width} px, ${n} drawing calls`);
  }
  check(`all four families draw on a real ${TEX_SIZE} px context with no bad coordinate`, drawn === 4 && badSize === 0);
  check('and none of them draws so little it would come out flat', thin === 0);
  setDungeonCanvasFactory(stubCanvasFactory);   // back to blank for anything after
}

// ---- dispose -------------------------------------------------------------
{
  const before = treeFieldsFor().length;
  const sheets = stoneSheets(THREE, 'blocks');
  for (const { scene } of built) scene.dispose();
  let left = 0, stillRegistered = 0, stillDrawn = 0;
  for (const { scene } of built) {
    if (scene.group.children.length) left++;
    if (scene.oreField) {
      if (treeFieldsFor().includes(scene.oreField)) stillRegistered++;
      if (scene.oreField.meshes.length) stillDrawn++;
    }
  }
  check('dispose empties every level group', left === 0);
  check('and takes its ore field out of the registry', stillRegistered === 0, `registry ${before} -> ${treeFieldsFor().length}`);
  check('and drops the meshes pickTree would have raycast', stillDrawn === 0);
  // the sheets are shared by every level; tearing one level down must not take
  // the stone away from the next one
  check('and leaves the shared stone sheets alone', stoneSheets(THREE, 'blocks') === sheets);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
