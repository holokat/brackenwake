// Levels under the ground. Run: node src/world/dungeon_gen.test.mjs
import {
  generateDungeon, cellAt, walkable, clampToWalkable, floodFrom, worldOf, gridOf, roomAt,
  maxLevel, MAX_GRID, CELL, CORRIDOR_W, ROOM_SIDE, HALL_GROW,
} from './dungeon_gen.js';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const seed = 20260904;

// A spread of real site cells, both kinds, every legal depth.
const sites = [];
for (let i = 0; i < 40; i++) sites.push({ id: `${i},${-i}`, cx: i * 3 - 40, cz: 17 - i * 2, kind: i % 2 ? 'dungeon' : 'cave', name: `site ${i}` });
const levels = [];
const t0 = performance.now();
for (const s of sites) for (let l = 1; l <= maxLevel(s.kind); l++) levels.push({ site: s, l, L: generateDungeon(seed, s, l) });
const genMs = performance.now() - t0;
check('generated a level for every site and depth', levels.length === 40 / 2 * 1 + 40 / 2 * 3, `${levels.length} levels`);
check('and generating one takes under 5 ms', genMs / levels.length < 5,
  `${(genMs / levels.length).toFixed(2)} ms a level, ${genMs.toFixed(0)} ms for all ${levels.length}`);

// ---- how big a level is, measured ----------------------------------------
{
  console.log('  --- the size of a level, measured ---');
  const rows = {};
  for (const { L } of levels) (rows[`${L.kind} L${L.level}`] ||= []).push(L);
  const mm = (a) => `${Math.min(...a)}..${Math.max(...a)}`;
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  for (const [k, list] of Object.entries(rows)) {
    const sides = list.flatMap((L) => L.rooms.flatMap((r) => [r.w, r.h]));
    const grid = list.flatMap((L) => [L.w, L.h]);
    const floor = list.map((L) => L.cells.reduce((n, c) => n + c, 0));
    console.log(`      ${k.padEnd(11)} grid ${mm(grid)} cells (${Math.min(...grid) * CELL}..${Math.max(...grid) * CELL} m)`
      + `  rooms ${mm(list.map((L) => L.rooms.length))}`
      + `  room side ${mm(sides)} cells (${Math.min(...sides) * CELL}..${Math.max(...sides) * CELL} m, mean ${avg(sides)})`
      + `  floor ${mm(floor)} cells`);
  }
  // The old generator drew rooms 3 to 8 cells a side, which is 6 by 6 metres at
  // the small end, on a 26 to 48 cell grid. These are the numbers that replaced
  // those, and they are checked rather than described.
  const ordinary = (kind) => levels.filter(({ L }) => L.kind === kind)
    .flatMap(({ L }) => L.rooms.filter((r) => r.kind !== 'boss').flatMap((r) => [r.w, r.h]));
  const d = ordinary('dungeon'), c = ordinary('cave');
  check('an ordinary dungeon room is 6 to 14 cells a side',
    Math.min(...d) === ROOM_SIDE.dungeon[0] && Math.max(...d) === ROOM_SIDE.dungeon[1],
    `${Math.min(...d)}..${Math.max(...d)} cells, ${Math.min(...d) * CELL}..${Math.max(...d) * CELL} m`);
  check('and an ordinary cavern 8 to 18',
    Math.min(...c) === ROOM_SIDE.cave[0] && Math.max(...c) === ROOM_SIDE.cave[1],
    `${Math.min(...c)}..${Math.max(...c)} cells, ${Math.min(...c) * CELL}..${Math.max(...c) * CELL} m`);
  const smallest = Math.min(...levels.map(({ L }) => Math.min(L.w, L.h)));
  check('and no level is smaller than 60 cells a side', smallest >= 60, `smallest side ${smallest} cells, ${smallest * CELL} m`);
}

// ---- the entry room, the hall and the great hall -------------------------
// Room `kind` is read by monster_ai.js normalizeDungeonLayout: 'entry' is the
// room that holds nothing and 'boss' is the room the boss stands in. A label
// nobody sets is decoration, and a label on the wrong room puts the boss in the
// wrong room, so both are checked against where the doors actually are.
{
  let entry = 0, oneBoss = 0, bossAtBottom = 0, bossAbove = 0, grown = 0, bottoms = 0;
  for (const { L } of levels) {
    const bosses = L.rooms.filter((r) => r.kind === 'boss');
    if (L.rooms[0].kind === 'entry' && L.rooms.filter((r) => r.kind === 'entry').length === 1) entry++;
    if (bosses.length <= 1) oneBoss++;
    if (L.level >= L.top) {
      bottoms++;
      if (bosses.length === 1) bossAtBottom++;
      if (bosses[0] && Math.max(bosses[0].w, bosses[0].h) > ROOM_SIDE[L.kind][0]) grown++;
    } else if (bosses.length) bossAbove++;
  }
  check('room zero is the entry room and nothing else is', entry === levels.length, `${entry}/${levels.length}`);
  check('exactly one room is labelled boss, and only on the bottom level',
    oneBoss === levels.length && bossAtBottom === bottoms && bossAbove === 0,
    `${bossAtBottom}/${bottoms} bottom levels, ${bossAbove} above the bottom`);
  const area = levels.flatMap(({ L }) => L.rooms.filter((r) => r.kind === 'boss')).map((r) => r.w * r.h * CELL * CELL);
  check('and the great hall is a hall', grown === bottoms && Math.min(...area) > 200,
    `${Math.min(...area)}..${Math.max(...area)} square metres of floor, grown by up to ${HALL_GROW} cells a side`);
  // On the levels above the bottom the hall is where the stair down is, so the
  // long walk and the big room are the same walk.
  let inHall = 0, withStair = 0;
  for (const { L } of levels) {
    if (!L.stair) continue;
    withStair++;
    const r = roomAt(L, L.stair.gx, L.stair.gz);
    if (r && r.kind === 'hall') inHall++;
  }
  check('the stair down always stands in the hall', withStair > 0 && inHall === withStair, `${inHall}/${withStair}`);
}

// ---- corridors two cells wide --------------------------------------------
{
  // Measured, not asserted: at every floor cell outside a room, how wide the
  // walkable run is across the passage. A single cell anywhere is a pinch two
  // bodies cannot pass in, which is what every corridor used to be.
  const hist = {}; const by = { dungeon: { pinch: 0, cells: 0 }, cave: { pinch: 0, cells: 0 } };
  let cells = 0;
  for (const { L } of levels) {
    for (let gz = 1; gz < L.h - 1; gz++) for (let gx = 1; gx < L.w - 1; gx++) {
      if (!walkable(L, gx, gz) || roomAt(L, gx, gz)) continue;
      let nz = 1; for (let dd = 1; walkable(L, gx, gz + dd); dd++) nz++;
      for (let dd = 1; walkable(L, gx, gz - dd); dd++) nz++;
      let nx = 1; for (let dd = 1; walkable(L, gx + dd, gz); dd++) nx++;
      for (let dd = 1; walkable(L, gx - dd, gz); dd++) nx++;
      const wide = Math.min(nx, nz);
      cells++;
      by[L.kind].cells++;
      hist[wide] = (hist[wide] || 0) + 1;
      if (wide < CORRIDOR_W) by[L.kind].pinch++;
    }
  }
  const near = Object.entries(hist).filter(([k]) => +k <= 5);
  console.log(`  --- corridor cross sections --- ${cells} corridor cells: `
    + `${near.map(([k, v]) => `${k} cells x${v}`).join(', ')}, `
    + `wider than 5: ${cells - near.reduce((n, [, v]) => n + v, 0)}`);
  check(`a dungeon corridor is never narrower than ${CORRIDOR_W} cells anywhere`,
    by.dungeon.cells > 0 && by.dungeon.pinch === 0,
    `${by.dungeon.pinch} pinches in ${by.dungeon.cells} cells, ${hist[2] || 0} of them exactly ${CORRIDOR_W} across`);
  check(`and ${CORRIDOR_W} cells is ${CORRIDOR_W * CELL} metres, so two bodies pass`, CORRIDOR_W * CELL === 4);
  // A cave's passages are deliberately ragged, so the cross section metric
  // finds single cell nooks off a wide passage. A nook is not a pinch: you walk
  // past it. What matters is whether a body two cells wide can get everywhere,
  // so ask THAT, of both kinds, rather than excusing the cave and moving on.
  let reachable = 0, poor = '';
  for (const { L } of levels) {
    const wide = new Uint8Array(L.w * L.h);
    for (let gz = 0; gz < L.h - 1; gz++) for (let gx = 0; gx < L.w - 1; gx++) {
      if (!(walkable(L, gx, gz) && walkable(L, gx + 1, gz) && walkable(L, gx, gz + 1) && walkable(L, gx + 1, gz + 1))) continue;
      wide[gz * L.w + gx] = 1; wide[gz * L.w + gx + 1] = 1;
      wide[(gz + 1) * L.w + gx] = 1; wide[(gz + 1) * L.w + gx + 1] = 1;
    }
    const seen = new Set(); const stack = [[L.entrance.gx, L.entrance.gz]];
    if (!wide[L.entrance.gz * L.w + L.entrance.gx]) { poor = `${L.id} L${L.level} entrance`; continue; }
    seen.add(L.entrance.gz * L.w + L.entrance.gx);
    while (stack.length) {
      const [x, z] = stack.pop();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue;
        const i = nz * L.w + nx;
        if (!wide[i] || seen.has(i)) continue;
        seen.add(i); stack.push([nx, nz]);
      }
    }
    const allRooms = L.rooms.every((r) => seen.has(r.cz * L.w + r.cx));
    const stairOk = !L.stair || seen.has(L.stair.gz * L.w + L.stair.gx);
    if (allRooms && stairOk) reachable++; else poor = `${L.id} L${L.level}`;
  }
  check('a body two cells wide can reach every room and the stair, on every level',
    reachable === levels.length, `${reachable}/${levels.length}${poor ? ', worst ' + poor : ''}`);
}

// ---- deterministic -------------------------------------------------------
{
  let same = 0;
  for (const { site, l, L } of levels) if (JSON.stringify(generateDungeon(seed, site, l)) === JSON.stringify(L)) same++;
  check('same site and depth, same level, byte for byte', same === levels.length, `${same}/${levels.length}`);
  let differL = 0, deep = 0;
  for (const { site, l, L } of levels) { if (l === 1 && maxLevel(site.kind) > 1) { deep++; if (JSON.stringify(generateDungeon(seed, site, 2)) !== JSON.stringify(L)) differL++; } }
  check('level 2 is not level 1', deep > 0 && differL === deep, `${differL}/${deep}`);
  let differS = 0;
  for (const { site, l, L } of levels) if (JSON.stringify(generateDungeon(seed + 1, site, l)) !== JSON.stringify(L)) differS++;
  check('a different world seed digs a different level', differS === levels.length, `${differS}/${levels.length}`);
}

// ---- size ----------------------------------------------------------------
{
  let over = 0, big = 0;
  for (const { L } of levels) { if (L.w > MAX_GRID || L.h > MAX_GRID) over++; big = Math.max(big, L.w, L.h); }
  check(`no level exceeds ${MAX_GRID} x ${MAX_GRID} cells`, over === 0, `largest side ${big}`);
  let sealed = 0;
  for (const { L } of levels) { let ok = true; for (let x = 0; x < L.w; x++) { if (walkable(L, x, 0) || walkable(L, x, L.h - 1)) ok = false; } for (let z = 0; z < L.h; z++) { if (walkable(L, 0, z) || walkable(L, L.w - 1, z)) ok = false; } if (ok) sealed++; }
  check('every level is sealed by a rim of rock', sealed === levels.length, `${sealed}/${levels.length}`);
}

// ---- reachability --------------------------------------------------------
{
  let allRooms = 0, allFloor = 0, worst = '';
  for (const { L } of levels) {
    const seen = floodFrom(L, L.entrance.gx, L.entrance.gz);
    let roomsOk = true;
    for (const r of L.rooms) for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) if (!seen.has(z * L.w + x)) roomsOk = false;
    if (roomsOk) allRooms++; else worst = L.id + ' L' + L.level;
    let floor = 0;
    for (let i = 0; i < L.cells.length; i++) if (L.cells[i] === 1) floor++;
    if (floor === seen.size) allFloor++;
  }
  check('every room is reachable from the entrance', allRooms === levels.length, `${allRooms}/${levels.length}${worst ? ' worst ' + worst : ''}`);
  check('and so is every floor cell: no level has a sealed pocket', allFloor === levels.length, `${allFloor}/${levels.length}`);
}

// ---- the stair down ------------------------------------------------------
{
  let ok = 0, deepest = 0, bottomNull = 0;
  for (const { L } of levels) {
    if (L.level < L.top) {
      const seen = floodFrom(L, L.entrance.gx, L.entrance.gz);
      const isEnt = L.stair.gx === L.entrance.gx && L.stair.gz === L.entrance.gz;
      if (L.stair && !isEnt && seen.has(L.stair.gz * L.w + L.stair.gx)) ok++;
    } else { deepest++; if (L.stair === null) bottomNull++; }
  }
  const withStair = levels.filter(({ L }) => L.level < L.top).length;
  check('the stair down is reachable and is not the entrance', withStair > 0 && ok === withStair, `${ok}/${withStair}`);
  check('the deepest level has no stair down at all', deepest > 0 && bottomNull === deepest, `${bottomNull}/${deepest}`);
  check('a dungeon goes three deep, a cave one', maxLevel('dungeon') === 3 && maxLevel('cave') === 1);
}

// ---- what is down there --------------------------------------------------
{
  const caves = levels.filter(({ L }) => L.kind === 'cave');
  const dungeons = levels.filter(({ L }) => L.kind === 'dungeon');
  check('every cave level has ore to mine', caves.length > 0 && caves.every(({ L }) => L.ore.length >= 6), `min ${Math.min(...caves.map(({ L }) => L.ore.length))} pockets`);
  check('every dungeon level has chests', dungeons.length > 0 && dungeons.every(({ L }) => L.chests.length >= 2), `min ${Math.min(...dungeons.map(({ L }) => L.chests.length))} chests`);
  check('caves hold no chests and dungeons hold no ore', caves.every(({ L }) => !L.chests.length) && dungeons.every(({ L }) => !L.ore.length));
  let tagged = 0, standable = 0, total = 0;
  for (const { L } of levels) for (const p of [...L.ore, ...L.chests]) { total++; if (cellAt(L, p.gx, p.gz) === (L.kind === 'cave' ? 'ore' : 'chest')) tagged++; if (walkable(L, p.gx, p.gz)) standable++; }
  check('every ore and chest cell reads back as its tag', total > 0 && tagged === total, `${tagged}/${total}`);
  check('and every one of them is still floor you can stand on', standable === total, `${standable}/${total}`);
  const L0 = levels[0].L;
  check('cellAt off the grid is rock', cellAt(L0, -1, 4) === 'rock' && cellAt(L0, L0.w, 4) === 'rock' && cellAt(L0, 4, L0.h) === 'rock');
  check('walkable off the grid is false', !walkable(L0, -1, 4) && !walkable(L0, 4, -1) && !walkable(L0, L0.w, L0.h));
  check('the entrance cell reads as the entrance', cellAt(L0, L0.entrance.gx, L0.entrance.gz) === 'entrance');
}

// ---- clamp to walkable ---------------------------------------------------
{
  const L = levels.find(({ L }) => L.kind === 'dungeon').L;
  const ent = worldOf(L, L.entrance.gx, L.entrance.gz);
  const onFloor = clampToWalkable(L, ent.x + 0.3, ent.z - 0.4);
  check('a point on a floor cell does not move', !onFloor.moved && onFloor.x === ent.x + 0.3 && onFloor.z === ent.z - 0.4, `(${onFloor.x.toFixed(2)}, ${onFloor.z.toFixed(2)})`);
  // every rock cell on the level: the clamp must land on floor, and on the
  // nearest floor cell there is, checked against a full scan of the grid
  let moved = 0, landedOnFloor = 0, nearest = 0, rocks = 0;
  for (let gz = 0; gz < L.h; gz++) for (let gx = 0; gx < L.w; gx++) {
    if (walkable(L, gx, gz)) continue;
    rocks++;
    const p = worldOf(L, gx, gz);
    const c = clampToWalkable(L, p.x, p.z);
    if (c.moved) moved++;
    const g = gridOf(L, c.x, c.z);
    if (walkable(L, g.gx, g.gz)) landedOnFloor++;
    let best = Infinity;
    for (let z2 = 0; z2 < L.h; z2++) for (let x2 = 0; x2 < L.w; x2++) {
      if (!walkable(L, x2, z2)) continue;
      const q = worldOf(L, x2, z2);
      best = Math.min(best, Math.hypot(q.x - p.x, q.z - p.z));
    }
    if (Math.abs(Math.hypot(c.x - p.x, c.z - p.z) - best) < 1e-9) nearest++;
  }
  check('every point in the rock is moved', rocks > 0 && moved === rocks, `${moved}/${rocks}`);
  check('every clamped point lands on a floor cell', landedOnFloor === rocks, `${landedOnFloor}/${rocks}`);
  check('and it is the nearest floor cell there is', nearest === rocks, `${nearest}/${rocks}`);
  // walking a straight line across the level never leaves the floor
  let off = 0, steps = 0;
  for (let a = 0; a < 6.28; a += 0.35) {
    let x = ent.x, z = ent.z;
    for (let i = 0; i < 120; i++) {
      const c = clampToWalkable(L, x + Math.cos(a) * 0.5, z + Math.sin(a) * 0.5);
      x = c.x; z = c.z; steps++;
      const g = gridOf(L, x, z);
      if (!walkable(L, g.gx, g.gz)) off++;
    }
  }
  check('walking into a wall from every angle never leaves the floor', off === 0, `${steps} steps, ${off} off the floor`);
  check('one cell is two metres', CELL === 2 && Math.abs(worldOf(L, 5, 5).x - worldOf(L, 4, 5).x) === 2);
  check('worldOf and gridOf are inverses', (() => { let bad = 0; for (let gz = 0; gz < L.h; gz++) for (let gx = 0; gx < L.w; gx++) { const p = worldOf(L, gx, gz); const g = gridOf(L, p.x, p.z); if (g.gx !== gx || g.gz !== gz) bad++; } return bad === 0; })());
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
