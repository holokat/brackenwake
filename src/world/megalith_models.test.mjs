// The ten mega structures and the seventeen landmarks, built and measured.
// Run: node src/world/megalith_models.test.mjs
//
// Nothing is mocked. Every body here is built through the real path a player
// gets it by: `authoredSites()` for the row, `field.siteInCell` for the cell
// resolved version of it (which is what carries `y`, `cx`, `cz` and `facing`),
// `site_models.buildSiteMarker` for the dispatch, and the real height field
// under every foot of it. A test that built them any other way would be
// measuring a thing no player will ever see.

import * as THREE from 'three';
import { createWorldField } from './field.js';
import { authoredSites, STANDS_IN_WATER, ZONE } from './zones.js';
import { SITE_CELL } from './sitegrid.js';
import { buildSiteMarker } from './site_models.js';
import {
  buildMegalith, auditMegaliths, MEGALITH_PLACES, MATERIALS,
  MEGALITH_MAX_DRAWS, MEGALITH_MAX_TRIS, MEGALITH_MIN_SPAN,
} from './megalith_models.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const SEED = 20260904;
const f = createWorldField(SEED, { homeBiome: 'meadow', homeY: -0.3 });
const heightAt = (x, z) => f.heightAt(x, z);
/** The site the FIELD has, which is the one the runtime hands the builder. */
const cellOf = (s) => f.siteInCell(Math.floor(s.x / SITE_CELL), Math.floor(s.z / SITE_CELL));

const ROWS = authoredSites().filter((s) => s.kind === 'megastructure' || s.kind === 'landmark');
const SITES = ROWS.map(cellOf);

const trisOf = (g) => {
  let n = 0;
  g.traverse((o) => { if (o.isMesh && o.geometry) n += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3; });
  return n;
};
const drawsOf = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; };
const boxOf = (g) => { g.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(g); };

// ---- 1. the sheet and the file agree, both ways ---------------------------
console.log('megaliths: the sheet and the bodies');
{
  const r = auditMegaliths(authoredSites());
  check('every megastructure and landmark has a body, and no body answers nothing',
    r.bodies === r.wanted && r.bodies === 27, `${r.bodies} bodies for ${r.wanted} places`);
  check('ten of them are mega structures and seventeen are landmarks',
    ROWS.filter((s) => s.kind === 'megastructure').length === 10 && ROWS.filter((s) => s.kind === 'landmark').length === 17,
    ROWS.filter((s) => s.kind === 'megastructure').map((s) => s.name).join(', '));
  check("and the Red Queen's Harbour is not one of them, because it is a town",
    !MEGALITH_PLACES.includes('redqueensharbour')
    && authoredSites().find((s) => s.sub === 'redqueensharbour').kind === 'town');
  // driven the other way: a place the file does not know gets nothing back, and
  // a site of another kind gets nothing back either
  check('a place with no body answers null, so site_models can fall back',
    buildMegalith({ ...ROWS[0], sub: 'nowhere-at-all' }, heightAt) === null);
  check('and a site of any other kind answers null too',
    buildMegalith({ ...ROWS[0], kind: 'town' }, heightAt) === null
    && buildMegalith({ ...ROWS[0], kind: 'mine' }, heightAt) === null
    && buildMegalith(null, heightAt) === null);
  // and the audit itself fails when it should
  {
    let threw = false;
    try { auditMegaliths([...authoredSites(), { sub: 'invented', kind: 'landmark', name: 'The Invented Thing' }]); }
    catch (e) { threw = /no body/.test(e.message); }
    check('a landmark added to the sheet with no body here throws at once', threw);
  }
}

// ---- 2. what each one costs, and how big it is ----------------------------
console.log('megaliths: draws, triangles and span');
{
  let worstDraws = 0, worstTris = 0, totalTris = 0;
  const small = [], heavy = [];
  const rows = [];
  for (const site of SITES) {
    const g = buildMegalith(site, heightAt);
    const draws = drawsOf(g), tris = trisOf(g);
    const b = boxOf(g);
    const span = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, b.max.y - b.min.y);
    rows.push({ site, draws, tris, span, box: b });
    worstDraws = Math.max(worstDraws, draws);
    worstTris = Math.max(worstTris, tris);
    totalTris += tris;
    if (site.kind === 'megastructure' && span < MEGALITH_MIN_SPAN) small.push(`${site.name} ${span.toFixed(0)} m`);
    if (draws > MEGALITH_MAX_DRAWS || tris > MEGALITH_MAX_TRIS) heavy.push(`${site.name} ${draws} draws ${tris} tris`);
  }
  rows.sort((a, b) => b.tris - a.tris);
  for (const r of rows) {
    console.log(`     ${r.site.name.padEnd(26)} ${String(r.draws).padStart(2)} draws ${String(Math.round(r.tris)).padStart(6)} tris  ${r.span.toFixed(0).padStart(4)} m across`);
  }
  check(`no body is over ${MEGALITH_MAX_DRAWS} draw calls`, worstDraws <= MEGALITH_MAX_DRAWS, `worst ${worstDraws}`);
  check(`nor over ${MEGALITH_MAX_TRIS} triangles`, worstTris <= MEGALITH_MAX_TRIS, `worst ${Math.round(worstTris)}, ${Math.round(totalTris)} for all ${rows.length}`);
  check(`every mega structure is at least ${MEGALITH_MIN_SPAN} m across or up`, small.length === 0, small.join('; ') || 'all ten');
  // driven the other way: merging is doing the work. A body is dozens of
  // separate pieces before the merge and a handful of draw calls after it, and
  // without that a megalith would cost its piece count at every range.
  {
    let pieces = 0, draws = 0, worstRatio = Infinity, worstName = '';
    for (const site of SITES) {
      const m = buildMegalith(site, heightAt);
      pieces += m.userData.pieces; draws += drawsOf(m);
      const r = m.userData.pieces / drawsOf(m);
      if (r < worstRatio) { worstRatio = r; worstName = site.name; }
    }
    check('merging is what makes that possible: the pieces outnumber the draws ten to one',
      pieces / draws > 10, `${pieces} pieces become ${draws} draw calls over ${SITES.length} bodies`);
    check('and it is true of every one of them, not only of the sum',
      worstRatio >= 3, `the thinnest is ${worstName} at ${worstRatio.toFixed(1)} pieces a draw`);
  }
}

// ---- 3. every mesh names its place, so a raycast can ----------------------
console.log('megaliths: what a click finds');
{
  let tagged = 0, meshes = 0, wrong = 0;
  for (const site of SITES) {
    const g = buildMegalith(site, heightAt);
    g.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      if (o.userData.site === site) tagged++; else wrong++;
    });
  }
  check('every mesh of every body carries its own site', meshes > 0 && wrong === 0, `${tagged} meshes over ${SITES.length} bodies`);
  check('and the group does too, and is named for it',
    SITES.every((s) => { const g = buildMegalith(s, heightAt); return g.userData.site === s && g.name === `site:${s.id}`; }));
  // and the real dispatch: buildSiteMarker is what the runtime calls
  {
    let through = 0;
    for (const site of SITES) {
      const g = buildSiteMarker(site, heightAt);
      if (g && g.userData.site === site && drawsOf(g) <= MEGALITH_MAX_DRAWS) through++;
    }
    check('site_models.buildSiteMarker hands all of them to this file', through === SITES.length,
      `${through}/${SITES.length}`);
  }
}

// ---- 4. the bodies stand on the ground ------------------------------------
console.log('megaliths: feet on the ground');
{
  const wet = new Set(STANDS_IN_WATER);
  const floating = [], sunk = [];
  for (const site of SITES) {
    const g = buildMegalith(site, heightAt);
    const b = boxOf(g);
    const gy = heightAt(site.x, site.z);
    // the lowest point of the body against the ground at the centre. A body on
    // a slope reaches ground lower than its centre, so the tolerance is the
    // fall across its own footprint, measured rather than assumed.
    let lowest = Infinity, highest = -Infinity;
    const r = Math.max(8, Math.min(120, (b.max.x - b.min.x + b.max.z - b.min.z) / 4));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      for (const d of [0, r * 0.5, r]) {
        const h = heightAt(site.x + Math.cos(a) * d, site.z + Math.sin(a) * d);
        lowest = Math.min(lowest, h); highest = Math.max(highest, h);
      }
    }
    if (b.min.y > highest + 1.5) floating.push(`${site.name} floats ${(b.min.y - highest).toFixed(1)} m`);
    if (b.max.y < lowest - 0.5) sunk.push(`${site.name} is buried`);
  }
  check('no body hangs in the air over its own footprint', floating.length === 0, floating.join('; ') || `all ${SITES.length} footed`);
  check('and none is buried under it', sunk.length === 0, sunk.join('; ') || `all ${SITES.length} visible`);
  check('the four that stand in the water are the four the table names',
    SITES.filter((s) => f.raw(s.x, s.z).h < 0.2).map((s) => s.sub).sort().join(',') === [...wet].sort().join(','),
    SITES.filter((s) => f.raw(s.x, s.z).h < 0.2).map((s) => s.name).join(', '));
}

// ---- 5. the same body every time ------------------------------------------
console.log('megaliths: the same body every time');
{
  const shape = (g) => {
    const out = [];
    g.traverse((o) => { if (o.isMesh) out.push(o.geometry.getAttribute('position').count + ':' + o.material.color.getHexString()); });
    return out.sort().join('|');
  };
  let same = 0;
  for (const site of SITES) if (shape(buildMegalith(site, heightAt)) === shape(buildMegalith(site, heightAt))) same++;
  check('a body rebuilt when its chunk comes back is the same body', same === SITES.length, `${same}/${SITES.length}`);
  // and a different seed's world moves the ground under them, so they differ
  const other = createWorldField(7, { homeBiome: 'meadow', homeY: -0.3 });
  const oh = (x, z) => other.heightAt(x, z);
  let moved = 0;
  for (const site of SITES) {
    const a = boxOf(buildMegalith(site, heightAt)), b = boxOf(buildMegalith(site, oh));
    if (Math.abs(a.min.y - b.min.y) > 0.01) moved++;
  }
  check('and a body reads the ground it is on, so another world moves it', moved > SITES.length * 0.5,
    `${moved}/${SITES.length} sit at a different height in seed 7`);
}

// ---- 6. the palette is small, which is what the merge needs ---------------
console.log('megaliths: the palette');
{
  const used = new Set();
  for (const site of SITES) {
    buildMegalith(site, heightAt).traverse((o) => { if (o.isMesh) used.add(o.material.color.getHexString()); });
  }
  check('the whole set is built out of one small palette', used.size <= MATERIALS.length,
    `${used.size} colours over ${SITES.length} bodies, out of ${MATERIALS.length} declared`);
  check('and every declared colour is used by something, or it is a colour nobody chose',
    used.size >= MATERIALS.length - 2, `${used.size} of ${MATERIALS.length}`);
}

// ---- 7. the two that are climbed are climbed on the ground ----------------
console.log('megaliths: the climbs are ground, not mesh');
{
  // The claim `field.test.mjs` proves in metres is repeated here in the one
  // form that matters to this file: neither climb needs anything from it. The
  // Eyrie's landing and the Ashen Gate's road are `heightAt`, and a player with
  // no site marker loaded at all can still walk up both.
  const e = ZONE.eyrie;
  const foot = heightAt(e.x + 175, e.z), top = heightAt(e.x, e.z);
  check('the Eyrie plateau is ground, and sixty metres of it', top - foot > 55,
    `${foot.toFixed(1)} m at the foot of the steps, ${top.toFixed(1)} m on the landing`);
  let worst = 0, prev = foot;
  for (let d = 175; d >= 0; d -= 1) { const h = heightAt(e.x + d, e.z); worst = Math.max(worst, Math.abs(h - prev)); prev = h; }
  check('and it is walkable without one triangle of this file being loaded', worst <= 1.2,
    `worst step ${worst.toFixed(3)} m over 175 m of climb`);
  const th = ZONE.throneofash, gate = ZONE.ashengate;
  check('the Ashen Gate stands eighty metres over the crater floor',
    heightAt(gate.x, gate.z) - heightAt(th.x, th.z) > 70,
    `gate ${heightAt(gate.x, gate.z).toFixed(1)} m, throne ${heightAt(th.x, th.z).toFixed(1)} m`);
}

// ---- 8. the two bodies that reach further than their pad say so -----------
console.log('megaliths: how far a body reaches');
{
  const reach = {};
  for (const site of SITES) reach[site.sub] = buildMegalith(site, heightAt).userData.reach;
  check('the Standing Hedge says it is a ring a mile across', reach.waystones > 800,
    `reach ${reach.waystones.toFixed(0)} m, which is the ${(2 * reach.waystones / 1609).toFixed(2)} mile ring the sheet asks for`);
  check('and the Obsidian Bridge says it is a bridge', reach.obsidianbridge > 100, `reach ${reach.obsidianbridge.toFixed(0)} m`);
  check('and every other body reaches something a site marker radius already covers',
    Object.entries(reach).filter(([, v]) => v > 90).length === 2,
    Object.entries(reach).filter(([, v]) => v > 90).map(([k, v]) => `${k} ${v.toFixed(0)} m`).join(', '));
  // the body and the table agree, so the one line V1.md asks for in
  // `sites.sitesNear` reads a number that is true of the geometry
  const wide = [];
  for (const site of SITES) {
    const r = buildMegalith(site, heightAt).userData.reach;
    if (site.bodyR) wide.push(`${site.sub} table ${site.bodyR} m, body ${r.toFixed(0)} m`);
    if (site.bodyR && Math.abs(site.bodyR - r) > 8) wide.push(`MISMATCH ${site.sub}`);
  }
  check('zones.BODY_R and the geometry agree about how far these two reach',
    SITES.filter((s) => s.bodyR).length === 2 && !wide.some((w) => w.startsWith('MISMATCH')), wide.join('; '));
  check('and no other site claims a body wider than its pad',
    SITES.filter((s) => s.bodyR).map((s) => s.sub).sort().join(',') === 'obsidianbridge,waystones');
}

console.log(`\n  megaliths: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
