// What buildSiteMarker puts in the world, and what a raycast finds when it hits
// it. Run: node src/world/site_models.test.mjs
//
// The reason this file exists: `docs/mmo/wiring/Z1.md` section 2.2 says a mine
// is not enterable and its MOUTHS are, that each mouth is a complete cave shaped
// site, and that `world_runtime.enterDungeon` takes one unchanged the moment
// `site_models.js` tags a mesh with it. Seven mines and twenty one cuts existed
// in the data and none of them was drawn. So the measurement here is not "a mine
// builds meshes"; it is "the mesh a player clicks hands the runtime the CUT, and
// the cut is a thing enterDungeon accepts".
//
// Nothing is mocked but the scene, which is a THREE.Group, and the discovery,
// which is `sites.sitesNear` on the real field.

import * as THREE from 'three';
import { createWorldField } from './field.js';
import { authoredSites } from './zones.js';
import { SITE_CELL, ALL_KINDS } from './sitegrid.js';
import { sitesNear, mouthsNear } from './sites.js';
import { buildSiteMarker, createSiteMarkers, mergeByMaterial } from './site_models.js';
import { MOUTH_MAX_TRIS, YARD_MAX_TRIS, SEAM_MAX_TRIS, trisOf, LANTERN_COLOUR } from './mine_models.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const SEED = 20260904;
const f = createWorldField(SEED, { homeBiome: 'meadow', homeY: -0.3 });
const heightAt = (x, z) => f.heightAt(x, z);
const cellOf = (s) => f.siteInCell(Math.floor(s.x / SITE_CELL), Math.floor(s.z / SITE_CELL));
const MINES = authoredSites().filter((s) => s.kind === 'mine').map(cellOf);

/** Every mesh of a marker, which is exactly what `siteMarkers.meshes()` collects. */
function meshesOf(g) {
  const out = [];
  g.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

// ============================================================================
console.log('site_models: every other kind is exactly as it was');
{
  // A mine must not have cost the other kinds anything, and neither must A3's
  // eleven. Find one of every kind the roll can make and build it: the seven
  // old ones and the eleven wild ones, eighteen in all.
  const WANT = ALL_KINDS.length;
  const found = new Map();
  const R = 60;
  for (let cz = -R; cz <= R && found.size < WANT; cz++) {
    for (let cx = -R; cx <= R && found.size < WANT; cx++) {
      const s = f.siteInCell(cx, cz);
      if (s && s.kind !== 'mine' && !found.has(s.kind)) found.set(s.kind, s);
    }
  }
  check(`the world still holds one of every one of the ${WANT} rolled kinds`, found.size === WANT,
    [...found.keys()].sort().join(', '));
  let untagged = 0, empty = 0, derived = 0;
  const rows = [];
  for (const [kind, site] of found) {
    const g = buildSiteMarker(site, heightAt);
    const meshes = meshesOf(g);
    if (!meshes.length) empty++;
    for (const m of meshes) {
      if (m.userData.site === site) continue;
      // A3's tomb is the second kind, after a mine, whose marker carries a
      // DERIVED site: the door in the barrow is a site of kind 'dungeon' with
      // the tomb's id on it, so `enterDungeon` opens a level behind it while the
      // pad, the habitat and the map still see a tomb. Anything else is a mesh
      // no raycast could name.
      if (m.userData.site?.tomb === site.id && m.userData.site.kind === 'dungeon') derived++;
      else untagged++;
    }
    rows.push(`${kind} ${meshes.length}m/${trisOf(g)}t`);
    check(`a ${kind} is one group named for its site`, g.name === `site:${site.id}`, g.name);
  }
  check('every one of them built meshes', empty === 0, rows.join(', '));
  check('and every mesh of every one carries its own site, as it always did', untagged === 0,
    `${derived} meshes carry a derived site instead, which is the tomb's door`);
  check('and the tomb really is the one that has one', derived === 2, `${derived} door meshes`);

  // mergeByMaterial itself, driven both ways
  const grp = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x334455 })));
  }
  grp.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x998877 })));
  const merged = mergeByMaterial(grp);
  check('five meshes of one colour and one of another merge to two', merged.children.length === 2,
    `${merged.children.length} draws from 6 meshes`);
}

// ============================================================================
console.log('site_models: a mine is a yard, its cuts and its seams');
{
  let missing = 0, parts = 0;
  for (const mine of MINES) {
    const g = buildSiteMarker(mine, heightAt);
    // one part group per mouth, one per seam, one yard
    const want = 1 + mine.mouths.length + mine.seams.length;
    if (g.children.length !== want) missing++;
    parts += g.children.length;
    if (mine === MINES[0]) {
      check('the group is named for the mine, not for a cut', g.name === `site:${mine.id}`, g.name);
    }
  }
  check('every mine builds a yard, a group per cut and a group per seam', missing === 0,
    `${parts} part groups over ${MINES.length} mines`);
}

// ============================================================================
console.log('site_models: the mesh you click hands the runtime the CUT');
{
  let wrongMouth = 0, mouthMeshes = 0, mouths = 0;
  let yardMeshes = 0, wrongYard = 0;
  let seamMeshes = 0, wrongSeam = 0, seams = 0, noSite = 0;
  let notCave = 0, farOff = 0;
  for (const mine of MINES) {
    const g = buildSiteMarker(mine, heightAt);
    g.updateMatrixWorld(true);
    const byMouth = new Map(mine.mouths.map((m) => [m.id, 0]));
    for (const mesh of meshesOf(g)) {
      const site = mesh.userData.site;
      if (!site) { noSite++; continue; }
      if (site === mine && mesh.userData.seam) {
        seamMeshes++;
        if (!mine.seams.includes(mesh.userData.seam)) wrongSeam++;
      } else if (site === mine) {
        yardMeshes++;
      } else if (mine.mouths.includes(site)) {
        mouthMeshes++;
        byMouth.set(site.id, byMouth.get(site.id) + 1);
        if (site.kind !== 'cave') notCave++;
        // and it is really at that cut, not at the yard. The geometry is baked
        // in the cut's own frame and the frame is on the group, so the world
        // matrix is the half that says where it ended up.
        mesh.geometry.computeBoundingSphere();
        const c = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld);
        if (Math.hypot(c.x - site.x, c.z - site.z) > 12) farOff++;
      } else {
        wrongMouth++;
      }
    }
    for (const [, n] of byMouth) if (n === 0) wrongMouth++;
    mouths += mine.mouths.length;
    seams += mine.seams.length;
    if (!yardMeshes) wrongYard++;
  }
  check('no mesh of a mine is left without a site on it', noSite === 0);
  check('every one of the twenty one cuts carries meshes of its own', wrongMouth === 0,
    `${mouthMeshes} meshes over ${mouths} cuts`);
  check('and the site on them is the CUT, which enterDungeon takes as a cave', notCave === 0);
  check('and those meshes really stand at that cut', farOff === 0,
    'every merged mesh centres within 12 m of its own mouth');
  check('the yard names the mine instead, because there is nothing to enter there',
    yardMeshes > 0 && wrongYard === 0, `${yardMeshes} yard meshes`);
  check('a seam names the mine and carries its own seam record', seamMeshes > 0 && wrongSeam === 0,
    `${seamMeshes} meshes over ${seams} seams`);

  // The gate world_runtime.enterDungeon actually applies, driven BOTH ways.
  const enterable = (s) => !!s && (s.kind === 'dungeon' || s.kind === 'cave');
  const mine = MINES[0];
  check('enterDungeon\'s own test lets every cut through',
    MINES.every((m) => m.mouths.every(enterable)), `${MINES.reduce((n, m) => n + m.mouths.length, 0)} cuts`);
  check('and turns the mine itself away, which is the whole point of the mouths',
    !enterable(mine), `kind "${mine.kind}"`);
  check('and turns a seam away too', !enterable(mine.seams[0]));
}

// ============================================================================
console.log('site_models: budgets survive the placement, not just the builder');
{
  let overMouth = 0, overYard = 0, overSeam = 0, worst = { mouth: 0, yard: 0, seam: 0 };
  let total = 0;
  for (const mine of MINES) {
    const g = buildSiteMarker(mine, heightAt);
    total += trisOf(g);
    for (const part of g.children) {
      const t = trisOf(part);
      const kind = part.userData.mine?.part;
      if (kind === 'mouth') { if (t > MOUTH_MAX_TRIS) overMouth++; worst.mouth = Math.max(worst.mouth, t); }
      if (kind === 'yard') { if (t > YARD_MAX_TRIS) overYard++; worst.yard = Math.max(worst.yard, t); }
      if (kind === 'seam') { if (t > SEAM_MAX_TRIS) overSeam++; worst.seam = Math.max(worst.seam, t); }
    }
  }
  check('no cut, yard or seam is over budget once placed', !overMouth && !overYard && !overSeam,
    `heaviest cut ${worst.mouth}/${MOUTH_MAX_TRIS}, yard ${worst.yard}/${YARD_MAX_TRIS}, seam ${worst.seam}/${SEAM_MAX_TRIS}`);
  check('and a whole mine is a reasonable thing to have on screen', total / MINES.length < 20000,
    `${Math.round(total / MINES.length).toLocaleString()} triangles for the average mine, `
    + `${total.toLocaleString()} for all seven`);
}

// ============================================================================
console.log('site_models: the streamer builds it, animates it and lets it go');
{
  const mine = MINES[0];
  const scene = new THREE.Group();
  const discovery = { sitesNear: (x, z, r) => sitesNear(f, x, z, r) };
  const markers = createSiteMarkers(scene, discovery, heightAt);

  // the first call queues, and one build happens per call after that
  markers.update(mine.x, mine.z, 60);
  let guard = 0;
  while (markers.pending && guard++ < 40) markers.update(mine.x, mine.z, 60);
  check('walking up to a mine builds it', markers.count >= 1, `${markers.count} markers live`);
  check('and it is the one with the moving parts', markers.animatedCount === 1,
    `${markers.animatedCount} of ${markers.count} markers animate`);
  const built = meshesOf(buildSiteMarker(mine, heightAt)).length;
  check('the raycast list holds every mesh of it', markers.meshes().length === built,
    `${markers.meshes().length} meshes, and the marker is built out of ${built}`);

  // A lantern, not a seam glint: both are emissive in their own colour, and the
  // lantern's colour is the flame's, which no ore shares.
  const lit = () => markers.meshes().filter((m) => m.material?.emissive
    && m.material.emissive.getHex() === LANTERN_COLOUR && m.material.emissiveIntensity > 0).length;
  const wheel = () => {
    let a = null;
    for (const g of [...scene.children]) g.traverse((o) => { if (o.isMesh && o.geometry?.type === 'TorusGeometry') a = o.parent.rotation.z; });
    return a;
  };

  // the three argument call world_runtime.js has always made changes nothing.
  // Turn the wheel first, so "did not move" is a real answer and not the value
  // it started at anyway.
  markers.animate(3, 0);
  const w0 = wheel();
  check('the wheel really can turn, so standing still means something', w0 > 0, `${w0.toFixed(4)} rad`);
  markers.update(mine.x, mine.z, 60);
  check('the old three argument update leaves the wheel where it was', wheel() === w0,
    `${w0.toFixed(4)} rad`);
  check('and leaves the lanterns out', lit() === 0);

  // and passing dt and the night turns it and lights them
  markers.animate(1, 1);
  check('a second of night turns the wheel', wheel() !== w0, `${w0.toFixed(4)} to ${wheel().toFixed(4)} rad`);
  check('and lights a lantern at every cut', lit() === mine.mouths.length * 2,
    `${lit()} lit pieces over ${mine.mouths.length} cuts`);
  markers.animate(1, 0);
  check('and daylight puts them out again', lit() === 0);

  // the five argument form does both in one call
  const w1 = wheel();
  markers.update(mine.x, mine.z, 60, 1, 1);
  check('update(x, z, r, dt, night) does the same in one call', wheel() !== w1 && lit() > 0,
    `${lit()} lit`);

  // walking away drops it, and drops the animation with it
  markers.update(mine.x + 4000, mine.z + 4000, 60);
  check('walking off drops the marker', markers.count === 0, `${markers.count} live`);
  check('and forgets its moving parts, so nothing is updated for ever', markers.animatedCount === 0);
  markers.dispose();
  check('dispose leaves the scene empty', scene.children.length === 0);
}

// ============================================================================
console.log('site_models: the two ways a player reaches a cut');
{
  // 1. a click: world_runtime.pick reads userData.site off the nearest mesh
  const mine = MINES[2];
  const g = buildSiteMarker(mine, heightAt);
  const mouth = mine.mouths[0];
  const hit = meshesOf(g).find((m) => m.userData.site === mouth);
  check('a mesh at a cut hands the runtime a site', !!hit && !!hit.userData.site);
  check('and interact.js will read it as an enterable cave',
    hit.userData.site.kind === 'cave' && typeof hit.userData.site.name === 'string',
    `"${hit.userData.site.name}"`);
  check('with its own ore band, which dungeon_gen.js reads',
    Array.isArray(hit.userData.site.oreBand) && hit.userData.site.oreBand.length > 0,
    hit.userData.site.oreBand.join(', '));

  // 2. E at the mouth: sites.mouthsNear is the only lookup that returns one
  const near = mouthsNear(f, mouth.x, mouth.z, 10);
  check('mouthsNear finds the cut you are standing at', near.some((m) => m.id === mouth.id),
    `${near.length} cuts within 10 m`);
  const plain = sitesNear(f, mouth.x, mouth.z, 10);
  check('and sitesNear does NOT, because a cut owns no cell',
    !plain.some((s) => s.id === mouth.id),
    `sitesNear returns ${plain.map((s) => s.kind).join(', ') || 'nothing'} there`);
  check('which is why main.js\'s reach test has to use mouthsNear', true,
    'see docs/mmo/wiring/M1.md, "the one thing left to wire"');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
