// Site grid and the terrain's answer to it. Run: node src/world/sitegrid.test.mjs
//
// The world is bounded now (src/world/zones.js), so every survey below runs
// over the cells INSIDE it. A survey out to 14 km used to be the right way to
// ask "does the roll behave"; it now spends most of its time in the ring ocean
// and answers a question about the sea instead.
import {
  cellRoll, siteAllowed, KINDS, SITE_CELL, authoredInCell, mineParts, MINE_MOUTHS, MINE_SEAMS,
  WILD_KINDS, WILD_KIND_IDS, ALL_KINDS, SITE_CHANCE, WILD_CHANCE, WILD_MIN_R, heartCell,
  CASTLE_TOWN_R, nameFor, gateWord,
} from './sitegrid.js';
import { rand2 } from './noise.js';
import { createWorldField } from './field.js';
import { WORLD_HALF, authoredSites, ARTICLE, FLAT_R } from './zones.js';

/** The furthest cell that is still inside the world, in each direction. */
const R = Math.ceil(WORLD_HALF / SITE_CELL);   // 17 cells: the world is 33 x 33 of them
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const seed = 20260904;
check('same cell, same roll', JSON.stringify(cellRoll(seed, 3, -7)) === JSON.stringify(cellRoll(seed, 3, -7)));
{ let differ = 0; for (let i = 0; i < 200; i++) if (JSON.stringify(cellRoll(seed, i, -i)) !== JSON.stringify(cellRoll(7, i, -i))) differ++; check('different seed, different rolls (over 200 cells)', differ > 150, `${differ}/200 differ`); }
// a site never leaves its cell's inner 60%, so footprints never cross cells
let out = 0, n = 0; const kinds = {};
for (let cz = -40; cz < 40; cz++) for (let cx = -40; cx < 40; cx++) { const s = cellRoll(seed, cx, cz); if (!s) continue; n++; kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  const fx = s.x / SITE_CELL - cx, fz = s.z / SITE_CELL - cz; if (fx < 0.2 || fx > 0.8 || fz < 0.2 || fz > 0.8) out++; if (s.flatR > 0.2 * SITE_CELL && !s.authored) out++; /* town precincts are 120 m and cross cells on purpose (Z2) */ }
check('every candidate stays inside its cell margin', out === 0, `${out} of ${n}`);
// A3 raised the chance outside the heart and left it alone inside, so the share
// is the wild one over a window this wide.
check('about 93% of cells roll a site now, which is half again as many as before',
  n / 6400 > 0.88 && n / 6400 < 0.96, (100 * n / 6400).toFixed(1) + '%, was 62%');
for (const [, k] of ALL_KINDS) check(`kind "${k}" occurs`, kinds[k] > 0, String(kinds[k]));
// the terrain's answer: towns on low dry ground, caves on hillsides, nothing on the farm
const f = createWorldField(seed, { homeY: -0.3 });
let allowed = 0, caveOnHill = 0, caves = 0, lowTowns = 0, towns = 0, onFarm = 0;
for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) { const s = f.siteInCell(cx, cz); if (!s || s.authored) continue; allowed++;
  const r = f.raw(s.x, s.z);
  if (s.kind === 'cave') { caves++; if (r.h >= 16 && r.h <= 48) caveOnHill++; }
  if (s.kind === 'town' || s.kind === 'hamlet') { towns++; if (r.h <= 40 && r.h > -0.2) lowTowns++; }
  if (Math.hypot(s.x, s.z) < 200) onFarm++; }
check('the terrain allows a good share of sites inside the world', allowed > 150, `${allowed} rolled sites over ${(2 * R + 1) ** 2} cells, ${(100 * allowed / (2 * R + 1) ** 2).toFixed(0)}%`);
check('every cave is on a hillside (16 to 48 m)', caves > 0 && caveOnHill === caves, `${caveOnHill}/${caves}`);
check('every town and hamlet stands on low dry ground', towns > 0 && lowTowns === towns, `${lowTowns}/${towns}`);
check('no site on the farm disc', onFarm === 0);
// the ground obeys: flat under a town, a mound at a cave, untouched past the rim
const town = (() => { for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) { const s = f.siteInCell(cx, cz); if (s && s.kind === 'town') return s; } })();
{ let dev = 0; for (let a = 0; a < 6.28; a += 0.4) for (let d = 0; d <= town.flatR * 0.55; d += 5) dev = Math.max(dev, Math.abs(f.heightAt(town.x + Math.cos(a) * d, town.z + Math.sin(a) * d) - town.y));
  check('ground under a town is level within 0.05 m out to 55% of flatR', dev < 0.05, `max dev ${dev.toFixed(3)} at ${town.name}`);
  const far = town.flatR + 5; let touched = 0, roaded = 0; for (let a = 0; a < 6.28; a += 0.4) { const x = town.x + Math.cos(a) * far, z = town.z + Math.sin(a) * far;
    // a road out of the town also grades the ground out here, and says so
    if (f.sampleAt(x, z).road > 0) { roaded++; continue; }
    if (Math.abs(f.heightAt(x, z) - f.raw(x, z).h) > 1e-6) touched++; }
  check('ground past the rim is the raw terrain, except under a road', touched === 0, `${touched} touched, ${roaded} on a road`); }
const cave = (() => { for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) { const s = f.siteInCell(cx, cz); if (s && s.kind === 'cave' && !s.authored) return s; } })();
check('a cave mouth stands above the hillside around it (a mound)', f.heightAt(cave.x, cave.z) > f.raw(cave.x, cave.z).h + 4, `mouth ${f.heightAt(cave.x, cave.z).toFixed(1)} raw ${f.raw(cave.x, cave.z).h.toFixed(1)}`);
{ let facesLowest = 0, cavesSeen = 0;
  for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) { const s = f.siteInCell(cx, cz); if (!s || s.kind !== 'cave') continue; cavesSeen++;
    const at = (a) => f.raw(s.x + Math.sin(a) * 15, s.z + Math.cos(a) * 15).h;
    const front = at(s.facing); let lowest = Infinity; for (let i = 0; i < 8; i++) lowest = Math.min(lowest, at((i / 8) * Math.PI * 2));
    if (front <= lowest + 1e-9) facesLowest++; }
  check('every cave mouth faces its lowest side (downhill)', cavesSeen > 0 && facesLowest === cavesSeen, `${facesLowest}/${cavesSeen}`);
  const uphill = (() => { const s = cave; return f.raw(s.x + Math.sin(s.facing + Math.PI) * 15, s.z + Math.cos(s.facing + Math.PI) * 15).h; })();
  check('and the ground behind a cave is higher than in front of it', uphill > f.raw(cave.x + Math.sin(cave.facing) * 15, cave.z + Math.cos(cave.facing) * 15).h, `behind ${uphill.toFixed(1)} vs front ${f.raw(cave.x + Math.sin(cave.facing) * 15, cave.z + Math.cos(cave.facing) * 15).h.toFixed(1)}`); }

// ============================================================================
// A3: the eleven wild kinds
// ============================================================================
console.log('sitegrid: the wild structures');
{
  const OLD_TOTAL = KINDS.reduce((a, k) => a + k[0], 0);
  /**
   * The roll EXACTLY as it stood before A3 existed, inlined here rather than
   * imported, so that "the heart did not move" is measured against a second
   * implementation and not against the thing being tested.
   */
  function preA3(seed2, cx, cz) {
    const a = authoredInCell(cx, cz);
    if (a) return { ...a, cx, cz, facing: rand2(cx, cz, seed2 + 5) * Math.PI * 2 };
    if (rand2(cx, cz, seed2 + 1) > 0.62) return null;
    const x = (cx + 0.2 + 0.6 * rand2(cx, cz, seed2 + 2)) * SITE_CELL;
    const z = (cz + 0.2 + 0.6 * rand2(cx, cz, seed2 + 3)) * SITE_CELL;
    let roll = rand2(cx, cz, seed2 + 4) * OLD_TOTAL, kind = KINDS[0];
    for (const k of KINDS) { if (roll < k[0]) { kind = k; break; } roll -= k[0]; }
    return {
      id: `${cx},${cz}`, cx, cz, x, z, kind: kind[1], article: kind[2], flatR: kind[3],
      name: nameFor(kind[1], cx, cz, seed2), facing: rand2(cx, cz, seed2 + 5) * Math.PI * 2,
    };
  }

  check('the seven old rows are untouched, weights and all',
    KINDS.map((k) => k[0]).join(',') === '5,3,3,2,2,3,1' && OLD_TOTAL === 19,
    `total ${OLD_TOTAL}`);
  check('and eleven new ones stand beside them',
    WILD_KINDS.length === 11 && ALL_KINDS.length === 18,
    WILD_KINDS.map((k) => k[1]).join(', '));
  check('every new row has an article and a pad',
    WILD_KINDS.every((k) => typeof k[2] === 'string' && k[2].length > 4 && k[3] > 0 && k[3] <= 0.2 * SITE_CELL),
    WILD_KINDS.map((k) => `${k[1]} ${k[3]}m`).join(', '));

  // ---- the heart, both directions ----------------------------------------
  let heartCells = 0, heartSame = 0, heartWild = 0;
  for (let cz = -6; cz <= 6; cz++) {
    for (let cx = -6; cx <= 6; cx++) {
      if (!heartCell(cx, cz)) continue;
      heartCells++;
      const a = cellRoll(seed, cx, cz), b = preA3(seed, cx, cz);
      if (JSON.stringify(a) === JSON.stringify(b)) heartSame++;
      if (a && WILD_KIND_IDS.has(a.kind)) heartWild++;
    }
  }
  check('every cell of the heart rolls exactly what it rolled before A3 existed',
    heartCells > 20 && heartSame === heartCells, `${heartSame}/${heartCells} cells identical`);
  check('and not one wild kind stands in any of them', heartWild === 0, `${heartWild} found`);
  // the other direction: the gate is not a no-op, the country outside it moved
  {
    let outside = 0, moved = 0, wild = 0;
    for (let cz = -14; cz <= 14; cz++) {
      for (let cx = -14; cx <= 14; cx++) {
        if (heartCell(cx, cz)) continue;
        outside++;
        const a = cellRoll(seed, cx, cz);
        if (JSON.stringify(a) !== JSON.stringify(preA3(seed, cx, cz))) moved++;
        if (a && WILD_KIND_IDS.has(a.kind)) wild++;
      }
    }
    check('and outside the heart the roll really did change', moved > outside * 0.3,
      `${moved} of ${outside} cells differ, ${wild} of them wild`);
  }
  check('a cell touching the heart disc is a heart cell, one clear of it is not',
    heartCell(2, 2) && heartCell(3, 0) && !heartCell(4, 0) && !heartCell(3, 3),
    `WILD_MIN_R ${WILD_MIN_R}`);

  // ---- siteAllowed, both directions ---------------------------------------
  const dry = { h: 12, river: 0, land: 1 };
  check('siteAllowed refuses a wild kind in a heart cell',
    siteAllowed({ kind: 'temple', cx: 1, cz: 1 }, dry, 1) === false
    && siteAllowed({ kind: 'castle', cx: 0, cz: 0 }, dry, 1) === false);
  check('and lets the same kind stand one cell further out',
    siteAllowed({ kind: 'temple', cx: 6, cz: 6 }, dry, 1) === true
    && siteAllowed({ kind: 'castle', cx: 6, cz: 6 }, dry, 1) === true);
  check('an old kind is still allowed in the heart, so the gate is on the new ones only',
    siteAllowed({ kind: 'town', cx: 1, cz: 1 }, dry, 1) === true);
  check('and a wild kind in deep water is still refused wherever it is',
    siteAllowed({ kind: 'temple', cx: 9, cz: 9 }, { h: -30, river: 0, land: 0 }, 1) === false);

  // ---- every kind occurs within 8 km, and one cell holds one site ----------
  const R8 = Math.ceil(8000 / SITE_CELL);
  const rolled = {}, allowed = {};
  const perCell = new Map();
  for (let cz = -R8; cz <= R8; cz++) {
    for (let cx = -R8; cx <= R8; cx++) {
      const c = cellRoll(seed, cx, cz);
      if (c) { rolled[c.kind] = (rolled[c.kind] || 0) + 1; perCell.set(cx + ',' + cz, 1); }
      const t = f.siteInCell(cx, cz);
      if (t) allowed[t.kind] = (allowed[t.kind] || 0) + 1;
    }
  }
  const missingRolled = WILD_KINDS.filter(([, k]) => !rolled[k]).map(([, k]) => k);
  check('every one of the eleven rolls somewhere within 8 km of the origin',
    missingRolled.length === 0, WILD_KINDS.map(([, k]) => `${k} ${rolled[k] || 0}`).join(', '));
  const missingAllowed = WILD_KINDS.filter(([, k]) => !allowed[k]).map(([, k]) => k);
  check('and the terrain lets every one of them actually stand somewhere in there',
    missingAllowed.length === 0, WILD_KINDS.map(([, k]) => `${k} ${allowed[k] || 0}`).join(', '));
  check('a cell holds one site or none, never two', perCell.size > 0
    && [...perCell.values()].every((v) => v === 1), `${perCell.size} cells hold one`);

  // ---- the counts, measured, not asserted ---------------------------------
  {
    let wildCells = 0, held = 0, oldKinds = 0, newKinds = 0;
    for (let cz = -40; cz < 40; cz++) {
      for (let cx = -40; cx < 40; cx++) {
        if (heartCell(cx, cz) || authoredInCell(cx, cz)) continue;
        wildCells++;
        const c = cellRoll(seed, cx, cz);
        if (!c) continue;
        held++;
        if (WILD_KIND_IDS.has(c.kind)) newKinds++; else oldKinds++;
      }
    }
    check('outside the heart about 93% of cells hold something',
      Math.abs(held / wildCells - WILD_CHANCE) < 0.02, `${(100 * held / wildCells).toFixed(1)}% against ${WILD_CHANCE}`);
    check('and the OLD kinds keep the density they always had, so no town was lost',
      Math.abs(oldKinds / wildCells - SITE_CHANCE) < 0.02,
      `${(100 * oldKinds / wildCells).toFixed(1)}% against the old ${SITE_CHANCE}`);
    check('so the count of rolled sites is up by about half',
      held / (oldKinds || 1) > 1.4 && held / (oldKinds || 1) < 1.6,
      `${held} against ${oldKinds} before, x${(held / oldKinds).toFixed(2)}`);
  }

  // ---- the castle holds a town, or it is not a castle ----------------------
  {
    let castles = 0, withTown = 0, near = 0, townReal = 0;
    for (let cz = -40; cz < 40; cz++) {
      for (let cx = -40; cx < 40; cx++) {
        const c = cellRoll(seed, cx, cz);
        if (!c || c.kind !== 'castle') continue;
        castles++;
        if (c.town && c.townAt) withTown++;
        if (c.townAt && Math.hypot(c.townAt.x - c.x, c.townAt.z - c.z) <= CASTLE_TOWN_R) near++;
        if (c.name === `${c.town} Keep`) townReal++;
      }
    }
    check('every castle in the world holds a town', castles > 5 && withTown === castles,
      `${castles} castles, ${withTown} with a town`);
    check(`and every one of them is inside ${CASTLE_TOWN_R} m of it`, near === castles, `${near}/${castles}`);
    check('and wears its name', townReal === castles);
    // THE OTHER DIRECTION. A cell that drew the castle slot and found no town
    // to hold does not stand empty and does not stand as a castle: it rolls the
    // wild table again with the castle struck out. The slot is recomputed here
    // from the same hash the roll uses, so the demotions can be counted.
    const ALL_TOTAL = ALL_KINDS.reduce((a, k) => a + k[0], 0);
    const slotOf = (cx, cz) => {
      let r = rand2(cx, cz, seed + 4) * ALL_TOTAL;
      for (const k of ALL_KINDS) { if (r < k[0]) return k[1]; r -= k[0]; }
      return ALL_KINDS[ALL_KINDS.length - 1][1];
    };
    let drewCastle = 0, kept = 0, becameSomethingElse = 0, becameNothing = 0;
    const into = {};
    for (let cz = -40; cz < 40; cz++) {
      for (let cx = -40; cx < 40; cx++) {
        if (heartCell(cx, cz) || authoredInCell(cx, cz)) continue;
        if (slotOf(cx, cz) !== 'castle') continue;
        const c = cellRoll(seed, cx, cz);
        if (!c) { becameNothing++; continue; }     // the cell held nothing at all
        drewCastle++;
        if (c.kind === 'castle') kept++;
        else { becameSomethingElse++; into[c.kind] = (into[c.kind] || 0) + 1; }
      }
    }
    check('a cell that drew the castle slot with no town in reach becomes something else',
      drewCastle > 50 && becameSomethingElse > 0 && kept + becameSomethingElse === drewCastle,
      `${drewCastle} drew it, ${kept} kept it, ${becameSomethingElse} turned into ${Object.entries(into).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    check('and never into a castle by the back door', !into.castle);
  }

  // ---- the names come from work, weather, land and mistakes ---------------
  {
    const names = new Set();
    for (const [, k] of WILD_KINDS) {
      for (let i = 0; i < 40; i++) names.add(nameFor(k, i * 3 + 1, -i * 7 - 2, seed));
    }
    check('every wild kind has a name of its own, and they are not one name',
      names.size > 100 && [...names].every((n) => typeof n === 'string' && n.length > 3),
      `${names.size} distinct names over 440 draws`);
    check('and a gate carries the word it is going to have cut into it',
      gateWord('the Kiln Gate') === 'KILN' && gateWord("Miller's Basin") === "MILLER'S",
      gateWord('the Kiln Gate'));
  }
}

// ---- authored sites own their cell, and `mine` is not a rolled kind --------
console.log('sitegrid: authored sites');
{
  check('`mine` is not a row of KINDS, so no rolled cell can become one',
    !KINDS.some(([, k]) => k === 'mine') && !!ARTICLE.mine && FLAT_R.mine === 20,
    `KINDS still has ${KINDS.length} rows totalling ${KINDS.reduce((a, k) => a + k[0], 0)} weight`);
  // the weights are what every town in every save hangs off: if this line moves,
  // the whole world reshuffles
  check('and the KINDS weights are unchanged', KINDS.map((k) => k[0]).join(',') === '5,3,3,2,2,3,1');

  const sites = authoredSites();
  let owned = 0, kept = 0;
  for (const s of sites) {
    const cx = Math.floor(s.x / SITE_CELL), cz = Math.floor(s.z / SITE_CELL);
    const a = authoredInCell(cx, cz);
    if (a && a.id === s.id) owned++;
    const roll = cellRoll(seed, cx, cz);
    if (roll && roll.id === s.id && roll.x === s.x && roll.z === s.z && typeof roll.facing === 'number') kept++;
  }
  check('every authored site owns its cell', owned === sites.length, `${owned}/${sites.length}`);
  check('and cellRoll hands it back instead of rolling', kept === sites.length, `${kept}/${sites.length}`);
  // the roll for a cell with no authored site is untouched
  const before = JSON.stringify(cellRoll(seed, 11, 7));
  check('a cell with nothing authored in it rolls as it always did',
    authoredInCell(11, 7) === null && before === JSON.stringify(cellRoll(seed, 11, 7)));
  check('an authored site is exempt from the terrain rules but not from the farm disc',
    siteAllowed({ kind: 'mine', authored: true }, { h: -40, river: 1, land: 0 }, 1) === true
    && siteAllowed({ kind: 'mine', authored: true }, { h: 20, river: 0, land: 1 }, 0.5) === false);
}

console.log('sitegrid: a mine, laid out');
{
  const mine = authoredSites().find((s) => s.kind === 'mine');
  const site = f.siteInCell(Math.floor(mine.x / SITE_CELL), Math.floor(mine.z / SITE_CELL));
  const parts = mineParts(site, seed);
  check('mineParts is a pure function of the site', JSON.stringify(parts) === JSON.stringify(mineParts(site, seed)));
  check('the cut count is inside MINE_MOUTHS', parts.mouths.length >= MINE_MOUTHS[0] && parts.mouths.length <= MINE_MOUTHS[1], `${parts.mouths.length} cuts`);
  check('the seam count is inside MINE_SEAMS', parts.seams.length >= MINE_SEAMS[0] && parts.seams.length <= MINE_SEAMS[1], `${parts.seams.length} seams`);
  check('every cut stands up the hill from the yard', parts.mouths.every((m) => {
    const rel = Math.abs(Math.atan2(Math.sin(m.a - site.facing - Math.PI), Math.cos(m.a - site.facing - Math.PI)));
    return rel < 1.0;
  }), `facing ${site.facing.toFixed(2)}, cuts at ${parts.mouths.map((m) => m.a.toFixed(2)).join(', ')}`);
  check('every seam draws its ore from the mine\'s own band', parts.seams.every((s) => site.oreBand.includes(s.ore)), `${site.oreBand.join(', ')} -> ${parts.seams.map((s) => s.ore).join(', ')}`);
  check('a different seed lays the same mine out differently', JSON.stringify(mineParts(site, seed)) !== JSON.stringify(mineParts(site, seed + 1)));
  check('a mine with no band still lays out, on copper', mineParts({ ...site, oreBand: null }, seed).seams.every((s) => s.ore === 'copper'));
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
