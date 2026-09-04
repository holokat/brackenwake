// Site grid and the terrain's answer to it. Run: node src/world/sitegrid.test.mjs
import { cellRoll, siteAllowed, KINDS, SITE_CELL } from './sitegrid.js';
import { createWorldField } from './field.js';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const seed = 20260904;
check('same cell, same roll', JSON.stringify(cellRoll(seed, 3, -7)) === JSON.stringify(cellRoll(seed, 3, -7)));
{ let differ = 0; for (let i = 0; i < 200; i++) if (JSON.stringify(cellRoll(seed, i, -i)) !== JSON.stringify(cellRoll(7, i, -i))) differ++; check('different seed, different rolls (over 200 cells)', differ > 150, `${differ}/200 differ`); }
// a site never leaves its cell's inner 60%, so footprints never cross cells
let out = 0, n = 0; const kinds = {};
for (let cz = -40; cz < 40; cz++) for (let cx = -40; cx < 40; cx++) { const s = cellRoll(seed, cx, cz); if (!s) continue; n++; kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  const fx = s.x / SITE_CELL - cx, fz = s.z / SITE_CELL - cz; if (fx < 0.2 || fx > 0.8 || fz < 0.2 || fz > 0.8) out++; if (s.flatR > 0.2 * SITE_CELL) out++; }
check('every candidate stays inside its cell margin', out === 0, `${out} of ${n}`);
check('about 62% of cells roll a site', n / 6400 > 0.55 && n / 6400 < 0.7, (100 * n / 6400).toFixed(0) + '%');
for (const [, k] of KINDS) check(`kind "${k}" occurs`, kinds[k] > 0, String(kinds[k]));
// the terrain's answer: towns on low dry ground, caves on hillsides, nothing on the farm
const f = createWorldField(seed, { homeY: -0.3 });
let allowed = 0, caveOnHill = 0, caves = 0, lowTowns = 0, towns = 0, onFarm = 0;
for (let cz = -30; cz < 30; cz++) for (let cx = -30; cx < 30; cx++) { const s = f.siteInCell(cx, cz); if (!s) continue; allowed++;
  const r = f.raw(s.x, s.z);
  if (s.kind === 'cave') { caves++; if (r.h >= 16 && r.h <= 48) caveOnHill++; }
  if (s.kind === 'town' || s.kind === 'hamlet') { towns++; if (r.h <= 40 && r.h > -0.2) lowTowns++; }
  if (Math.hypot(s.x, s.z) < 200) onFarm++; }
check('the terrain allows a good share of sites', allowed > 800, String(allowed));
check('every cave is on a hillside (16 to 48 m)', caves > 0 && caveOnHill === caves, `${caveOnHill}/${caves}`);
check('every town and hamlet stands on low dry ground', towns > 0 && lowTowns === towns, `${lowTowns}/${towns}`);
check('no site on the farm disc', onFarm === 0);
// the ground obeys: flat under a town, a mound at a cave, untouched past the rim
const town = (() => { for (let cz = -30; cz < 30; cz++) for (let cx = -30; cx < 30; cx++) { const s = f.siteInCell(cx, cz); if (s && s.kind === 'town') return s; } })();
{ let dev = 0; for (let a = 0; a < 6.28; a += 0.4) for (let d = 0; d <= town.flatR * 0.55; d += 5) dev = Math.max(dev, Math.abs(f.heightAt(town.x + Math.cos(a) * d, town.z + Math.sin(a) * d) - town.y));
  check('ground under a town is level within 0.05 m out to 55% of flatR', dev < 0.05, `max dev ${dev.toFixed(3)} at ${town.name}`);
  const far = town.flatR + 5; let touched = 0, roaded = 0; for (let a = 0; a < 6.28; a += 0.4) { const x = town.x + Math.cos(a) * far, z = town.z + Math.sin(a) * far;
    // a road out of the town also grades the ground out here, and says so
    if (f.sampleAt(x, z).road > 0) { roaded++; continue; }
    if (Math.abs(f.heightAt(x, z) - f.raw(x, z).h) > 1e-6) touched++; }
  check('ground past the rim is the raw terrain, except under a road', touched === 0, `${touched} touched, ${roaded} on a road`); }
const cave = (() => { for (let cz = -30; cz < 30; cz++) for (let cx = -30; cx < 30; cx++) { const s = f.siteInCell(cx, cz); if (s && s.kind === 'cave') return s; } })();
check('a cave mouth stands above the hillside around it (a mound)', f.heightAt(cave.x, cave.z) > f.raw(cave.x, cave.z).h + 4, `mouth ${f.heightAt(cave.x, cave.z).toFixed(1)} raw ${f.raw(cave.x, cave.z).h.toFixed(1)}`);
{ let facesLowest = 0, cavesSeen = 0;
  for (let cz = -30; cz < 30; cz++) for (let cx = -30; cx < 30; cx++) { const s = f.siteInCell(cx, cz); if (!s || s.kind !== 'cave') continue; cavesSeen++;
    const at = (a) => f.raw(s.x + Math.sin(a) * 15, s.z + Math.cos(a) * 15).h;
    const front = at(s.facing); let lowest = Infinity; for (let i = 0; i < 8; i++) lowest = Math.min(lowest, at((i / 8) * Math.PI * 2));
    if (front <= lowest + 1e-9) facesLowest++; }
  check('every cave mouth faces its lowest side (downhill)', cavesSeen > 0 && facesLowest === cavesSeen, `${facesLowest}/${cavesSeen}`);
  const uphill = (() => { const s = cave; return f.raw(s.x + Math.sin(s.facing + Math.PI) * 15, s.z + Math.cos(s.facing + Math.PI) * 15).h; })();
  check('and the ground behind a cave is higher than in front of it', uphill > f.raw(cave.x + Math.sin(cave.facing) * 15, cave.z + Math.cos(cave.facing) * 15).h, `behind ${uphill.toFixed(1)} vs front ${f.raw(cave.x + Math.sin(cave.facing) * 15, cave.z + Math.cos(cave.facing) * 15).h.toFixed(1)}`); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
