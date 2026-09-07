// Spaces: places laid out by hand, and every rule that keeps one loadable.
// Run: node src/mmo/spaces/spaces.test.mjs
//
// The reason this file exists: a space is a JSON the editor writes at three in
// the afternoon and the game loads at three in the afternoon. Nobody reviews
// it. So every way one can be wrong is checked at load, both directions are
// driven here, and the thing the test builds is built by the same `buildPlan`
// the world builds a village with.

import * as THREE from 'three';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, unlinkSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSpaceIndex, spaceIndexSource, saveEditorFile } from '../../../tools/editor_save.mjs';
import { SPACES, SPACE_IDS, SPACE_STATS, emptySpace, spaceFor } from './index.js';
import { auditSpaces, auditPlans, MARKER_KINDS } from '../plans/plan_schema.js';
import { PLANS, peopleFor, spawnsFor, inPlannedPlace, layoutFor } from '../plans/index.js';
import { PLAN_MARGIN } from '../plans/footprints.js';
import { buildPlan, auditSpaceKinds, ROCK_KINDS, ROCK_KIND_IDS, setMarkersVisible, markersAreVisible, MARKER_COLOUR, SPACE_KIND_STATS } from '../../world/plan_models.js';
import { spaceSiteRow, spaceSitesNear, isTileSpace, isSculptSpace, sitesNear } from '../../world/sites.js';
import { createWorldField } from '../../world/field.js';
import { SPECIES } from '../../world/arbor.js';
import { MONSTERS } from '../monsters.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
/** Whether the audit refuses a set of spaces, and what it said. */
function refused(spaces) {
  try { auditSpaces(spaces); return null; } catch (err) { return err.message; }
}
function refusedKinds(spaces) {
  try { auditSpaceKinds(spaces); return null; } catch (err) { return err.message; }
}

const SEED = 20260904;
const field = createWorldField(SEED, { homeBiome: 'meadow', homeY: -0.3 });
const heightAt = (x, z) => field.heightAt(x, z);

/** The fixture: one of everything, at a spot the world field really has. */
const AT = { x: 1400, z: -900 };
function fixture() {
  const s = emptySpace('a_test_space', 'The Ford Below', AT.x, AT.z, 50);
  s.note = 'A crossing with a mill on the far bank, and nobody who admits to owning it.';
  s.pieces = [{ model: 'millers_house', x: -12, z: 6, yaw: 90 }];
  s.runs = [{ model: 'stone_wall_4m', from: { x: -20, z: -20 }, to: { x: 4, z: -20 } }];
  s.areas = [{ kind: 'mud', points: [[6, 6], [16, 6], [16, 16], [6, 16]] }];
  s.trees = [{ species: 'willow', x: 10, z: -4, yaw: 30, scale: 1 }];
  s.rocks = [{ kind: 'sarsen', x: -4, z: 14, yaw: 0, scale: 1.4 }];
  s.markers = [{ x: 0, z: 20, label: 'a footbridge goes here', note: 'one span, no rails', kind: 'structure' }];
  s.people = [{ name: null, role: 'miller', x: -18, z: 2, yaw: 180 }];
  s.spawns = [{ id: 'boar', x: 18, z: 2 }];
  return s;
}

// ============================================================================
console.log('spaces: the folder loads and the audit runs at import');
{
  check('SPACES loaded and was audited', !!SPACE_STATS && typeof SPACE_STATS.spaces === 'number',
    `${SPACE_IDS.length} on disk, ${SPACE_STATS.pieces} pieces, ${SPACE_STATS.trees} trees, ${SPACE_STATS.rocks} rocks, ${SPACE_STATS.markers} markers`);
  check('the vocabulary was audited too', !!SPACE_KIND_STATS,
    `${SPACE_KIND_STATS.species} species, ${SPACE_KIND_STATS.rockKinds} rock kinds`);
  check('spaceFor answers for one it has and declines for one it does not',
    spaceFor('nothing_at_all') === null && SPACE_IDS.every((id) => spaceFor(id) === SPACES[id]));
  check('an empty space is a valid space', refused({ x: emptySpace('x', 'X', 0, 0, 30) }) === null);
  check('no space shares an id with one of the nine plans',
    SPACE_IDS.every((id) => !PLANS[id]), SPACE_IDS.join(', ') || 'there are none yet');
}

// ============================================================================
console.log('\nspaces: a space file round trips through the schema');
{
  const s = fixture();
  check('the fixture passes the audit as an object', refused({ [s.id]: s }) === null, refused({ [s.id]: s }) || '');
  const dir = mkdtempSync(join(tmpdir(), 'bw-space-'));
  const path = join(dir, s.id + '.json');
  // Exactly what the editor's save writes: JSON.stringify with two spaces.
  writeFileSync(path, JSON.stringify(s, null, 2) + '\n', 'utf8');
  const back = JSON.parse(readFileSync(path, 'utf8'));
  check('what comes off the disk is what went on it', JSON.stringify(back) === JSON.stringify(s));
  check('and it passes the audit again, off the disk', refused({ [back.id]: back }) === null);
  check('and its vocabulary passes too', refusedKinds({ [back.id]: back }) === null);
  const counts = auditSpaces({ [back.id]: back });
  check('the audit counted every list', counts.pieces === 1 && counts.runs === 1 && counts.areas === 1
    && counts.trees === 1 && counts.rocks === 1 && counts.markers === 1 && counts.people === 1 && counts.spawns === 1,
    JSON.stringify(counts));
  rmSync(dir, { recursive: true, force: true });
}

// ============================================================================
console.log('\nspaces: every rule the audit has, driven the wrong way');
{
  const one = (mutate) => { const s = fixture(); mutate(s); return refused({ [s.id]: s }) || ''; };
  check('a space with no "at" is refused', /does not say where in the world/.test(one((s) => { delete s.at; })));
  check('a space with no name is refused', /has no name/.test(one((s) => { s.name = '  '; })));
  check('a space that names a zones.js place is refused', /a space stands at a point/.test(one((s) => { s.place = 'hearthhome'; })));
  check('a space with no radius is refused', /has no radius/.test(one((s) => { delete s.radius; })));
  check('a space under the wrong key is refused', /calls itself/.test(refused({ wrong: fixture() }) || ''));
  check('an em dash is refused', /em dash/.test(one((s) => { s.note = 'a ford — and a mill'; })));
  check('a piece outside the radius is refused', /outside the/.test(one((s) => { s.pieces.push({ model: 'barrel', x: 90, z: 0, yaw: 0 }); })));
  check('a tree outside the radius is refused', /stands 90.0 m out/.test(one((s) => { s.trees.push({ species: 'oak', x: 90, z: 0, yaw: 0, scale: 1 }); })));
  check('a rock outside the radius is refused', /lies 90.0 m out/.test(one((s) => { s.rocks.push({ kind: 'sarsen', x: 90, z: 0, yaw: 0, scale: 1 }); })));
  check('a marker outside the radius is refused', /stands 90.0 m out/.test(one((s) => { s.markers.push({ x: 90, z: 0, label: 'far', note: '', kind: 'other' }); })));
  check('a marker that says nothing is refused', /marks nothing/.test(one((s) => { s.markers[0].label = '   '; })));
  check('a marker of a kind that is not one is refused', /which is not one of/.test(one((s) => { s.markers[0].kind = 'vibes'; })));
  check('a tree with no species is refused', /is not a species/.test(one((s) => { s.trees[0].species = ''; })));
  check('a tree at no point is refused', /is not anywhere/.test(one((s) => { s.trees[0].x = null; })));
  check('a rock scaled to nothing is refused', /is built to a scale of 0/.test(one((s) => { s.rocks[0].scale = 0; })));
  check('a spawn that is not a monster row is refused', /is not a monster row/.test(one((s) => { s.spawns[0].id = 'wyrmling_of_doom'; })));
  check('a person with a role nobody has is refused', /which is not one/.test(one((s) => { s.people[0].role = 'ferryman'; })));
  check('a person standing inside a wall is refused', /is standing inside/.test(one((s) => { s.people[0].x = -12; s.people[0].z = 6; })));
  check('a model with no footprint is refused', /has no footprint/.test(one((s) => { s.pieces[0].model = 'cathedral'; })));
  check('and the good fixture still passes after all that', refused({ a_test_space: fixture() }) === null);

  // the vocabulary, which lives in plan_models and not in the schema
  check('a species arbor does not grow is refused', /which arbor.js does not grow/.test(refusedKinds({ s: { ...fixture(), trees: [{ species: 'ent', x: 0, z: 0, yaw: 0, scale: 1 }] } }) || ''));
  check('a rock kind nothing builds is refused', /neither a boulder nor a dressing kind/.test(refusedKinds({ s: { ...fixture(), rocks: [{ kind: 'moonstone', x: 0, z: 0, yaw: 0, scale: 1 }] } }) || ''));
  check('every arbor species is an acceptable tree',
    Object.keys(SPECIES).every((id) => refusedKinds({ s: { ...fixture(), trees: [{ species: id, x: 0, z: 0, yaw: 0, scale: 1 }] } }) === null),
    `${Object.keys(SPECIES).length} species`);
  check('every rock kind is an acceptable rock',
    ROCK_KIND_IDS.every((id) => refusedKinds({ s: { ...fixture(), rocks: [{ kind: id, x: 0, z: 0, yaw: 0, scale: 1 }] } }) === null),
    `${ROCK_KIND_IDS.length} kinds`);
  check('a plan may not carry a space\'s three lists',
    /only a space may do/.test((() => { const p = JSON.parse(JSON.stringify(PLANS.oldcellars)); p.trees = [{ species: 'oak', x: 0, z: 0 }]; try { auditPlans({ oldcellars: p }); return ''; } catch (e) { return e.message; } })()));
}

// ============================================================================
console.log('\nspaces: one builds through buildPlan, with all five kinds in it');
{
  const s = fixture();
  const site = { ...spaceSiteRow(s, field), realm: 'greenwold' };
  const g = buildPlan(s, site, heightAt);
  check('buildPlan built something', !!g, g ? `${g.children.length} groups` : 'nothing');

  const names = [];
  const meshes = [];
  g.traverse((o) => { if (o.name) names.push(o.name); if (o.isMesh) meshes.push(o); });
  const has = (frag) => names.some((n) => n.includes(frag));

  check('the piece is in it', meshes.some((m) => m.userData.plan && m.userData.plan.piece === 'millers_house'),
    [...new Set(meshes.map((m) => m.userData.plan && m.userData.plan.piece).filter(Boolean))].join(', '));
  check('the tree is in it, grown by arbor and instanced', has('trees:willow'));
  check('the rock is in it, instanced by kind', has('rocks:sarsen'));
  check('the marker is in it', has('markers'));
  check('the run and the ground treatment came through the shared merge', has(`plan:${s.id}:plan`));

  // the marker itself: the words it carries, and the fact it is dev only
  let marker = null;
  g.traverse((o) => { if (o.userData && o.userData.marker && !marker) marker = o; });
  check('the marker carries the label it was given', !!marker && marker.userData.marker.label === 'a footbridge goes here',
    marker ? marker.userData.marker.label : 'no marker at all');
  check('and the note and the kind with it',
    !!marker && marker.userData.marker.note === 'one span, no rails' && marker.userData.marker.kind === 'structure');
  check('a marker kind has a colour of its own', MARKER_KINDS.every((k) => Number.isFinite(MARKER_COLOUR[k])));

  let markerGroup = null;
  for (const c of g.children) if (c.name && c.name.includes(':markers')) markerGroup = c;
  const post = markerGroup && markerGroup.children[0];
  check('markers are hidden until dev mode asks for them', !markersAreVisible() && post && post.visible === false);
  const up = setMarkersVisible(true, g);
  check('and setMarkersVisible turns the ones already standing', up.visible && up.turned > 0 && post.visible === true,
    `${up.turned} turned`);
  const down = setMarkersVisible(false, g);
  check('and turns them off again', !down.visible && post.visible === false, `${down.turned} turned`);

  check('the group knows what is in it',
    g.userData.plan.counts.trees === 1 && g.userData.plan.counts.rocks === 1 && g.userData.plan.counts.markers === 1,
    JSON.stringify(g.userData.plan.counts));
  check('and it knows it is a space and not a place', g.userData.plan.space && g.userData.plan.place === null);

  // the ground it stands on is the real ground
  const box = new THREE.Box3().setFromObject(g);
  const ground = heightAt(AT.x, AT.z);
  check('it stands on the world\'s own ground', Math.abs(box.min.y - ground) < 12,
    `the space's lowest point is ${box.min.y.toFixed(1)} m, the ground at its centre is ${ground.toFixed(1)} m`);

  const far = buildPlan({ ...s, at: { x: AT.x + 3000, z: AT.z + 3000 } }, { ...spaceSiteRow({ ...s, at: { x: AT.x + 3000, z: AT.z + 3000 } }, field), realm: 'greenwold' }, heightAt);
  const boxFar = new THREE.Box3().setFromObject(far);
  check('and on different ground three kilometres away it sits at a different height',
    Math.abs(boxFar.min.y - box.min.y) > 0.05,
    `${box.min.y.toFixed(2)} m here, ${boxFar.min.y.toFixed(2)} m there`);

  check('an empty space builds nothing rather than throwing',
    (() => { const e = emptySpace('e', 'E', 0, 0, 20); const gg = buildPlan(e, spaceSiteRow(e, field), heightAt); return !!gg && gg.children.length === 0; })());
  check('and something that is not a layout at all is still declined',
    buildPlan({ id: 'x' }, spaceSiteRow(fixture(), field), heightAt) === null && buildPlan(null, {}, heightAt) === null);
}

// ============================================================================
console.log('\nspaces: the five seams into the running game');
{
  const s = fixture();
  const site = spaceSiteRow(s, field);

  check('a space is a site row with its id as "sub"', site.sub === s.id && site.space === s.id && site.kind === 'space');
  check('and it stands where the space says it stands', site.x === AT.x && site.z === AT.z);
  check('and it carries the ground under it', Math.abs(site.y - heightAt(AT.x, AT.z)) < 1e-9);
  check('and its body reaches its own radius, so the streamer keeps it alive from outside',
    site.bodyR === s.radius);

  check('a site that names no layout claims no ground at all', !inPlannedPlace({ sub: 'no_such_space', x: 0, z: 0 }, 0, 0));

  // the people and the spawns, through the same two calls the plans use
  const spaces = { [s.id]: s };
  check('layoutFor answers for a plan', layoutFor('hearthhome') === PLANS.hearthhome);
  check('peopleFor and spawnsFor read a plan\'s lists', peopleFor('millrun').length > 0);
  check('a space\'s own people and spawns are reachable the same way',
    s.people.length === 1 && s.spawns.length === 1 && MONSTERS[s.spawns[0].id]);
  check('spawnsFor keeps a night row out of the day list',
    spawnsFor('highwaymanshollow', false).every((r) => !r.night)
    && spawnsFor('highwaymanshollow', true).length >= spawnsFor('highwaymanshollow', false).length);

  // the streamer
  const near = spaceSitesNear(AT.x + 30, AT.z, 60, field, spaces);
  check('spaceSitesNear finds a space you are standing in', near.length === 1 && near[0].sub === s.id);
  check('and does not find one a kilometre off', spaceSitesNear(AT.x + 1000, AT.z, 60, field, spaces).length === 0);
  check('and finds one just inside its own reach',
    spaceSitesNear(AT.x + s.radius + 59, AT.z, 60, field, spaces).length === 1,
    `${s.radius} m of body plus 60 m of radius`);
  check('sitesNear ships with no spaces of its own yet, and does not throw',
    Array.isArray(sitesNear(field, 0, 0, 200)));
  // A tile space (tile_x_z, the editor's own) belongs to the sculpt canvas
  // and is left out of a generated field; a named space turns up in either.
  // Driven both ways on a field with and without the sculpt header.
  // the Greenwold's own spaces are the sculpt world's too: traced off the
  // painting, they mean nothing on the generated sheet
  const named = SPACE_IDS.filter((id) => !isSculptSpace(id));
  const tiles = SPACE_IDS.filter((id) => isSculptSpace(id));
  check('and every named space really on disk turns up in sitesNear at its own centre',
    named.every((id) => sitesNear(field, SPACES[id].at.x, SPACES[id].at.z, 10).some((r) => r.sub === id)),
    named.length ? named.join(', ') : 'there are none yet, so this passes vacuously');
  check('and no tile space does, in a generated field',
    tiles.every((id) => !sitesNear(field, SPACES[id].at.x, SPACES[id].at.z, 10).some((r) => r.sub === id)),
    tiles.length ? tiles.join(', ') : 'there are none on disk, so this passes vacuously');
  {
    const sculptField = Object.create(field);
    Object.defineProperty(sculptField, 'sculpt', { value: { height: 6, ground: 'grass' } });
    check('but every tile space does in a sculpt field',
      tiles.every((id) => spaceSitesNear(SPACES[id].at.x, SPACES[id].at.z, 10, sculptField).some((r) => r.sub === id)),
      tiles.length ? tiles.join(', ') : 'none on disk');
  }
}

// ============================================================================
// The whole path, on the real disk, in a real process.
//
// Everything above builds a space out of an object in memory. That proves the
// audit and the builder and proves nothing at all about the thing that
// actually has to work: a file appears in src/mmo/spaces, the generated index
// picks it up, SPACES holds it, and the world's own sitesNear and
// inPlannedPlace answer for it. So the fixture is WRITTEN, through the
// editor's own save function, and a fresh node reads it back and reports.
//
// The file and the index are put back in a finally, whatever happens.
console.log('\nspaces: a real file on the real disk, read by a fresh process');
{
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const s = fixture();
  const file = join(root, 'src/mmo/spaces', s.id + '.json');
  const indexPath = join(root, 'src/mmo/spaces/list.js');
  const indexBefore = readFileSync(indexPath, 'utf8');
  let report = null;
  try {
    const saved = saveEditorFile(root, `src/mmo/spaces/${s.id}.json`, s);
    check('the editor\'s own save wrote the file', saved.ok && existsSync(file), saved.text || saved.status);
    check('and rewrote the generated index to name it', saved.spaces.includes(s.id) && readFileSync(indexPath, 'utf8').includes(`'${s.id}': `));
    const code = `
      const { SPACES } = await import('./src/mmo/spaces/index.js');
      const { inPlannedPlace } = await import('./src/mmo/plans/index.js');
      const { sitesNear, spaceSiteRow } = await import('./src/world/sites.js');
      const { createWorldField } = await import('./src/world/field.js');
      const f = createWorldField(${SEED}, { homeBiome: 'meadow', homeY: -0.3 });
      const sp = SPACES['${s.id}'];
      const site = sp ? spaceSiteRow(sp, f) : null;
      const R = sp ? sp.radius : 0, M = ${PLAN_MARGIN};
      const near = sitesNear(f, ${AT.x}, ${AT.z}, 40).filter((r) => r.sub === '${s.id}');
      process.stdout.write('REPORT' + JSON.stringify({
        loaded: !!sp,
        name: sp && sp.name,
        trees: sp && sp.trees.length,
        markers: sp && sp.markers.length,
        inMiddle: !!site && inPlannedPlace(site, ${AT.x}, ${AT.z}),
        atEdge: !!site && inPlannedPlace(site, ${AT.x} + R - 1, ${AT.z}),
        inMargin: !!site && inPlannedPlace(site, ${AT.x} + R + M - 1, ${AT.z}),
        pastMargin: !!site && inPlannedPlace(site, ${AT.x} + R + M + 1, ${AT.z}),
        streamed: near.length,
        kind: near[0] && near[0].kind,
      }));
    `;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: root, encoding: 'utf8' });
    const at = (run.stdout || '').indexOf('REPORT');
    report = at >= 0 ? JSON.parse(run.stdout.slice(at + 6)) : null;
    check('a fresh process loads the space off disk', !!report && report.loaded && report.name === s.name,
      report ? `${report.trees} tree, ${report.markers} marker` : (run.stderr || '').split('\n').slice(-6).join(' '));
    check('the middle of it is planned ground, so the scatter stops', !!report && report.inMiddle);
    check('and so is the far edge of it', !!report && report.atEdge);
    check('and so is the margin outside it', !!report && report.inMargin);
    check('and a metre past the margin is not', !!report && report.pastMargin === false,
      `${s.radius} m of space and ${PLAN_MARGIN} m of margin`);
    check('and the world\'s own sitesNear hands it to the streamer as a site',
      !!report && report.streamed === 1 && report.kind === 'space');
  } finally {
    if (existsSync(file)) unlinkSync(file);
    writeFileSync(indexPath, indexBefore, 'utf8');
    const ids = writeSpaceIndex(root);
    check('the fixture is off the disk again and the index is back to what it was',
      !existsSync(file) && readFileSync(indexPath, 'utf8') === spaceIndexSource(ids),
      `${ids.length} ${ids.length === 1 ? 'space' : 'spaces'} left on disk`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
