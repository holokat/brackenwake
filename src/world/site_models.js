import {meshEnvelopes} from './collision/mesh-envelopes.js';
// What a site looks like when you get there. Towns and hamlets are built from
// the game's own houses, barns, silos and workshops around a well; camps from
// the camp kit; ruins, shrines, dungeon mouths and cave mouths from primitives.
// Interiors come later; a dungeon mouth is a door with nothing behind it yet
// and says so when clicked.
//
// Every mesh in a marker carries userData.site so a raycast can name the place.
import * as THREE from 'three';
import { mulberry32, hash2 } from './noise.js';
import { buildFarmhouse, buildBarn, buildSilo, HOUSE_ROOF_OPTIONS } from '../farm/buildings.js';
import { buildProcessor } from '../farm/processors.js';
import { buildCamp } from '../farm/camp_models.js';
import { buildMineMouth, buildMineYard, buildSeam } from './mine_models.js';
import { buildTown } from './town_models.js';
import { buildMegalith } from './megalith_models.js';
import { linksForCell } from './roads.js';
import { PLANS } from '../mmo/plans/index.js';
import { SPACES } from '../mmo/spaces/index.js';
import { buildPlan } from './plan_models.js';
import { buildStructure } from './structures.js';
import { createFires, createGlows } from './fire.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A kit house is dozens of small meshes, each its own draw call. A town of
// twelve was 377 meshes. Static markers never move, so every mesh with the same
// colour is baked into one geometry: a town becomes a dozen draw calls, and the
// raycast has a dozen objects to test instead of hundreds.
export function mergeByMaterial(group, {physical=false}={}) {
  if(physical&&!group.userData.colliders)group.userData.colliders=meshEnvelopes(group);
  group.updateWorldMatrix(true, true);
  const buckets = new Map();   // colour hex + flags -> { mat, geos }
  const doomed = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material)) return;
    if (o.isInstancedMesh) return;
    const m = o.material;
    const key = (m.color ? m.color.getHex() : 0) + ':' + (m.transparent ? 't' : 'o') + ':' + (m.type);
    let b = buckets.get(key);
    if (!b) { b = { mat: m, geos: [] }; buckets.set(key, b); }
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    // only position and normal survive; uv sets differ between kit pieces and
    // mergeGeometries refuses mismatched attribute sets
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(o.matrixWorld);
    b.geos.push(g);
    doomed.push(o);
  });
  for (const o of doomed) o.parent?.remove(o);
  const merged = new THREE.Group();
  merged.name = group.name;
  for (const { mat, geos } of buckets.values()) {
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    merged.add(mesh);
  }
  // anything that was not a plain mesh (lights, sprites) rides along untouched
  for (const child of [...group.children]) merged.add(child);
  merged.userData = group.userData;
  return merged;
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
const M = {
  stone: mat(0x7d7873), stoneDark: mat(0x4a4744), wood: mat(0x6b4a2e), ash: mat(0x2a2624),
  dark: mat(0x0b0a0c), gold: mat(0xd8b25a, { metalness: 0.3, roughness: 0.4 }), rock: mat(0x6e6863), rockDark: mat(0x504b47),
};
const TOWN_WORKSHOPS = ['mill', 'bakery', 'smokehouse', 'creamery'];

// Turn a building so its front faces the point (tx, tz). The kit's houses open
// toward +z when unrotated.
function faceToward(g, x, z, tx, tz) { g.rotation.y = Math.atan2(tx - x, tz - z); }

function settlement(g, site, heightAt, rng, opts) {
  const { count, ring, plaza } = opts;
  // the well at the centre, the reason the place is here
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.45, 1.1, 10), M.stone);
  well.position.set(site.x, site.y + 0.55, site.z); well.castShadow = true; g.add(well);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.1, 6), M.wood);
  roof.position.set(site.x, site.y + 2.6, site.z); g.add(roof);
  for (let i = 0; i < 4; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 5), M.wood);
    const a = i * Math.PI / 2 + Math.PI / 4;
    post.position.set(site.x + Math.cos(a) * 1.25, site.y + 1.8, site.z + Math.sin(a) * 1.25); g.add(post);
  }
  // buildings on a ring, evenly spaced with jitter so it reads as grown, not stamped
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.35 + site.facing;
    const d = plaza + rng() * (ring - plaza);
    const x = site.x + Math.cos(a) * d, z = site.z + Math.sin(a) * d;
    const roll = rng();
    let b;
    if (roll < 0.66) {
      const level = 1 + Math.floor(rng() * (opts.maxLevel || 3));
      const roofOpt = HOUSE_ROOF_OPTIONS[1 + Math.floor(rng() * (HOUSE_ROOF_OPTIONS.length - 1))];
      b = buildFarmhouse(level, { roof: roofOpt.id });
    } else if (roll < 0.82 && opts.workshops) {
      b = buildProcessor(TOWN_WORKSHOPS[Math.floor(rng() * TOWN_WORKSHOPS.length)]);
    } else if (roll < 0.93) {
      b = buildBarn(1);
    } else {
      b = buildSilo();
    }
    b.position.set(x, heightAt(x, z) - 0.05, z);
    faceToward(b, x, z, site.x, site.z);
    b.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    g.add(b);
  }
}

/**
 * A mine, which is the one site kind that is not one place. It is a yard with
 * two to four CUTS on the hill above it and four to seven surface SEAMS on the
 * yard, and Z1 built all three as data (`docs/mmo/wiring/Z1.md` section 2.2,
 * `docs/mmo/09-WORLD-ZONES.md` section 4). What makes it different from every
 * other kind here:
 *
 *   A CUT IS THE THING YOU CLICK, not the mine. Each `mine.mouths[i]` is a
 *   complete cave shaped site with its own id, name, generator cell and ore
 *   band, and `world_runtime.enterDungeon` takes one with no change at all. So
 *   every mesh of a mouth carries `userData.site = mouth`, and `pick()` hands
 *   interact.js a site whose kind is 'cave'. Clicking the yard, or a seam,
 *   names the MINE instead, because there is nothing to go into there.
 *
 *   THE PARTS MERGE SEPARATELY. `mergeByMaterial` buckets by colour across a
 *   whole group, so merging the mine in one pass would fuse the second cut's
 *   timber into the first cut's and there would be no way left to say which
 *   mouth a triangle belongs to. Each part is built and merged on its own by
 *   `mine_models.js` and tagged before it joins the group.
 *
 *   A SEAM IS NOT A SECOND MINABLE THING. `flora.js` already puts one ore
 *   boulder at each seam's centre and that is what the pickaxe swings at. What
 *   is added here is the outcrop AROUND it, tagged `userData.seam` so a caller
 *   can tell the two apart, and given no harvest record of its own.
 */
function mineSite(site, heightAt) {
  const g = new THREE.Group();
  g.name = `site:${site.id}`;
  const updates = [];
  const tag = (part, extra) => {
    part.traverse((o) => { if (o.isMesh) Object.assign(o.userData, extra); });
    if (typeof part.userData.mineUpdate === 'function') updates.push(part.userData.mineUpdate);
    g.add(part);
  };

  tag(buildMineYard(site, { heightAt }), { site });
  for (const mouth of site.mouths || []) {
    // a cut opens back down toward the yard; field.js worked out which way that
    // is and put it on the mouth, so nothing here has to guess
    tag(buildMineMouth(mouth, { heightAt }), { site: mouth });
  }
  for (const seam of site.seams || []) {
    tag(buildSeam(seam, { heightAt }), { site, seam });
  }

  g.userData.site = site;
  // The lantern at every cut and the wheel over the yard. Driven from
  // `createSiteMarkers.animate`; see docs/mmo/wiring/M1.md for where that is
  // called from. `nightFactor` is 0 in full day and 1 at midnight, which is
  // `1 - dayFactor` as world_runtime.update is handed it.
  g.userData.update = (dt, nightFactor) => {
    for (const fn of updates) {
      try { fn(dt, nightFactor); } catch (err) { console.warn('a mine update threw', err); }
    }
  };
  return g;
}

/**
 * Hang everything the merge would have destroyed back onto a merged marker.
 *
 * `mergeByMaterial` bakes every mesh into one geometry per colour, in world
 * space, and deletes every attribute but position and normal. That is right for
 * a wall and fatal for four things a wild structure has:
 *
 *   a flame     it has to face the camera and change every frame
 *   a window    it has to come up at dusk, which means its own material
 *   a board     it is lettered, and lettering is a uv set
 *   a door      it carries a DIFFERENT site from the rest of the marker, and the
 *               blanket tag at the end of buildSiteMarker would overwrite it
 *
 * So `structures.js` hands those back beside the group and they are added here,
 * after the merge, with one update hook driving all of them. That hook is the
 * same `userData.update(dt, nightFactor)` a mine's wheel and lantern use, and
 * `createSiteMarkers.animate` already calls it.
 */
function dressStructure(merged, built, site, opts = {}) {
  const seed = (hash2(site.cx, site.cz, 4211) % 100000) + 1;
  const fires = createFires(built.fires, { seed, effects: opts.effects || null });
  const glows = createGlows(built.glows, { seed });
  if (built.fires.length) merged.add(fires.group);
  if (built.glows.length) merged.add(glows.group);
  for (const extra of built.extras) {
    extra.traverse((o) => { if (o.isMesh && !o.userData.site) o.userData.site = site; });
    merged.add(extra);
  }
  merged.userData.wild = { fires, glows, door: built.door, word: built.word, bodyR: built.bodyR };
  if (built.fires.length || built.glows.length) {
    merged.userData.update = (dt, nightFactor = 0) => {
      const n = Math.max(0, Math.min(1, nightFactor));
      fires.setNight(n); fires.update(dt);
      glows.setNight(n); glows.update(dt);
    };
  }
  return merged;
}

/**
 * `opts.effects` is `createEffects`'s return and is optional. With it, a fire in
 * the world also puffs smoke into the shared particle pool; without it, every
 * fire is exactly what it is here and nothing throws. See docs/mmo/wiring/A3.md
 * for the one line in world_runtime.js that hands it over.
 */
export function buildSiteMarker(site, heightAt, opts = {}) {
  // a mine is several places at once and merges per part; every other kind is
  // one group merged in one pass, exactly as it always was
  if (site.kind === 'mine') return mineSite(site, heightAt);
  // P1: a place somebody painted is built from the painting and not rolled.
  if (PLANS[site.sub]) { const g = buildPlan(PLANS[site.sub], site, heightAt); if (g) return g; }
  // ED1: a space somebody laid out with the editor is built the same way, out
  // of the same buildPlan, so what the editor shows is what the world builds.
  if (site.space && SPACES[site.space]) {
    const g = buildPlan(SPACES[site.space], site, heightAt);
    if (g) return g;
  }
  // Wave B hands two kinds to their own builders. Each answers null until it
  // is written (or for a site it does not know), and the old marker stands in.
  if (site.kind === 'town' && site.authored) {
    // the gates face the roads when the field can say where they arrive (T1)
    const bearings = opts.field ? linksForCell(opts.field, site.cx, site.cz).map((b) => Math.atan2(b.x - site.x, b.z - site.z)) : undefined;
    const t = buildTown(site, heightAt, { ...opts, bearings });
    if (t) return t;
  }
  if (site.kind === 'megastructure' || site.kind === 'landmark') { const m = buildMegalith(site, heightAt); if (m) return m; }

  const g = new THREE.Group();
  g.name = `site:${site.id}`;
  const rng = mulberry32(hash2(site.cx, site.cz, 77));
  const ground = (dx, dz) => heightAt(site.x + dx, site.z + dz);
  const y0 = site.y;

  // A3's eleven. Each one is built whole by `structures.js`, merged like every
  // other kind, and then dressed with the pieces the merge would have eaten.
  const built = buildStructure(site, heightAt);
  if (built) {
    g.add(built.group);
    g.userData.site = site;
    const dressed = dressStructure(mergeByMaterial(g,{physical:true}), built, site, opts);
    dressed.traverse((o) => { if (o.isMesh && !o.userData.site) o.userData.site = site; });
    return dressed;
  }

  if (site.kind === 'town') {
    settlement(g, site, heightAt, rng, { count: 9 + Math.floor(rng() * 4), ring: 36, plaza: 12, workshops: true, maxLevel: 4 });
  } else if (site.kind === 'hamlet') {
    settlement(g, site, heightAt, rng, { count: 3 + Math.floor(rng() * 3), ring: 20, plaza: 8, workshops: false, maxLevel: 2 });
  } else if (site.kind === 'ruin') {
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2, d = 3 + rng() * 9;
      const h = 1 + rng() * 6;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, h, 6), rng() < 0.5 ? M.stone : M.stoneDark);
      const dx = Math.cos(a) * d, dz = Math.sin(a) * d;
      p.position.set(site.x + dx, ground(dx, dz) + h / 2 - 0.3, site.z + dz);
      p.rotation.z = (rng() - 0.5) * 0.3; p.castShadow = true;
      g.add(p);
    }
  } else if (site.kind === 'shrine') {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.2, 0.8), M.stoneDark);
    s.position.set(site.x, y0 + 1.6, site.z); s.rotation.y = site.facing; s.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), M.gold);
    cap.position.set(site.x, y0 + 3.5, site.z);
    g.add(s, cap);
  } else if (site.kind === 'dungeon') {
    // a stone arch over a stair going down; the stair is a dark slab for now
    const arch = new THREE.Mesh(new THREE.TorusGeometry(3, 0.7, 6, 12, Math.PI), M.stoneDark);
    arch.position.set(site.x, y0 + 0.2, site.z); arch.rotation.y = site.facing; arch.castShadow = true;
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(2.6, 14), M.dark);
    mouth.position.copy(arch.position); mouth.rotation.copy(arch.rotation);
    const stair = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.4, 5), M.dark);
    stair.position.set(site.x + Math.sin(site.facing) * 2.8, y0 - 0.2, site.z + Math.cos(site.facing) * 2.8);
    stair.rotation.y = site.facing;
    for (let i = 0; i < 2; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.6, 6), M.wood);
      const side = i ? 1 : -1;
      post.position.set(site.x + Math.cos(site.facing) * side * 3.6, y0 + 1.3, site.z - Math.sin(site.facing) * side * 3.6);
      g.add(post);
    }
    g.add(arch, mouth, stair);
  } else if (site.kind === 'cave') {
    // the mound is terrain (field.js): 6 m high at the centre, falling to the
    // hillside at flatR. The mouth sits on the flank, half sunk in the ground,
    // facing site.facing; the rock lintel frames it.
    const D = 7.5;
    const fx = Math.sin(site.facing), fz = Math.cos(site.facing);
    const mx = site.x + fx * D, mz = site.z + fz * D;
    const my = heightAt(mx, mz);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(2.4, 12), M.dark);
    mouth.position.set(mx, my + 1.3, mz);
    mouth.rotation.y = site.facing;
    mouth.scale.y = 0.8;
    g.add(mouth);
    // a short dark throat so the mouth has depth from an angle
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 10, 1, true), M.dark);
    throat.position.set(mx - fx * 1.5, my + 1.3, mz - fz * 1.5);
    throat.rotation.set(Math.PI / 2, 0, -site.facing);
    throat.scale.y = 1; g.add(throat);
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0 + rng() * 0.8, 0), rng() < 0.5 ? M.rock : M.rockDark);
      const a = site.facing + (i - 2) * 0.5, d = D + 0.6 + rng() * 0.6;
      const rx = site.x + Math.sin(a) * d, rz = site.z + Math.cos(a) * d;
      r.position.set(rx, heightAt(rx, rz) + 0.6 + (i === 2 ? 2.6 : 0), rz);   // the middle one is the lintel
      r.rotation.set(rng() * 3, rng() * 3, rng() * 3); r.castShadow = true;
      g.add(r);
    }
  } else if (site.kind === 'camp') {
    const fire = buildCamp('campfire'); fire.position.set(site.x, y0, site.z); g.add(fire);
    const tent = buildCamp('tent'); tent.position.set(site.x + 4, ground(4, 0), site.z); tent.rotation.y = site.facing; g.add(tent);
    const chair = buildCamp('camp_chair'); chair.position.set(site.x - 2.4, ground(-2.4, 1.6), site.z + 1.6); chair.rotation.y = 0.9; g.add(chair);
  }
  g.userData.site = site;
  const merged = mergeByMaterial(g,{physical:true});
  merged.traverse((o) => { if (o.isMesh) o.userData.site = site; });
  return merged;
}

/** Keeps markers alive for every site within `radius` of (x, z). */
export function createSiteMarkers(scene, discovery, heightAt, opts = {}) {
  const live = new Map();
  let lastX = Infinity, lastZ = Infinity;
  let meshCache = null, collisionVersion = 0;
  const pending = [];
  const animated = new Map();          // id -> update(dt, nightFactor)

  /**
   * The moving parts of every live marker: a mine's headframe wheel and the
   * lantern at each of its cuts. Nothing else has any, so this loop is empty
   * until a mine is on screen. `nightFactor` is 0 in full day and 1 at midnight;
   * `world_runtime.update` is handed `dayFactor`, which is the other way round,
   * so pass `1 - dayFactor`.
   */
  function animate(dt, nightFactor = 0) {
    for (const fn of animated.values()) {
      try { fn(dt, nightFactor); } catch (err) { console.warn('a site marker update threw', err); }
    }
  }

  return {
    /**
     * `dt` and `nightFactor` are optional and default to standing still, so the
     * three argument call world_runtime.js has always made keeps working and a
     * mine's lantern simply never lights. Pass them, or call `animate` beside
     * this, and the wheels turn and the lanterns come up at dusk. See
     * docs/mmo/wiring/M1.md.
     */
    update(x, z, radius, dt = 0, nightFactor = 0) {
      if (dt) animate(dt, nightFactor);
      // one build per frame: a town is the most expensive thing the world makes
      if (pending.length) {
        const s = pending.shift();
        if (!live.has(s.id)) {
          const g = buildSiteMarker(s, heightAt, opts);
          /**
           * EVERY MARKER IN THE SCENE IS NAMED FOR ITS SITE, and this is the
           * one line that makes it true rather than five builders each
           * remembering to.
           *
           * `world_runtime.overworldNodes` gathers the scene children whose
           * name starts with "site:" and switches them off on the way into a
           * dungeon. A planned place and a hand laid space both come back from
           * `plan_models.buildPlan`, whose root is named `plan:<id>`, so until
           * a named space stood near the player nothing ever noticed: a village
           * or a wood built by buildPlan would have stayed lit over the
           * player's head underground. The plan's own name lives on every CHILD
           * group (`plan:<id>:trees:beech` and the rest), which is what the
           * picker and `spaces.test.mjs` read, so nothing downstream moves.
           */
          if (!g.name.startsWith('site:')) g.name = `site:${s.id}`;
          scene.add(g); live.set(s.id, g); meshCache = null; collisionVersion++;
          if (typeof g.userData.update === 'function') animated.set(s.id, g.userData.update);
        }
      }
      if (Math.hypot(x - lastX, z - lastZ) < 48) return;
      lastX = x; lastZ = z;
      const near = discovery.sitesNear(x, z, radius);
      const keep = new Set();
      for (const s of near) {
        keep.add(s.id);
        if (!live.has(s.id) && !pending.some((p) => p.id === s.id)) pending.push(s);
      }
      for (const [id, g] of live) {
        if (keep.has(id)) continue;
        scene.remove(g); live.delete(id); animated.delete(id); meshCache = null; collisionVersion++;
      }
      for (let i = pending.length - 1; i >= 0; i--) if (!keep.has(pending[i].id)) pending.splice(i, 1);
    },
    animate,
    /** How many live markers have something that moves. */
    get animatedCount() { return animated.size; },
    get pending() { return pending.length; },
    /** Every mesh of every live marker, for raycasting. */
    meshes() {
      if (!meshCache) { meshCache = []; for (const g of live.values()) g.traverse((o) => { if (o.isMesh) meshCache.push(o); }); }
      return meshCache;
    },
    get collisionVersion() { return collisionVersion; },
    colliders() {const out=[];const collect=g=>{if(!g.visible)return;if(g.userData.colliders)out.push(...g.userData.colliders);else for(const child of g.children)collect(child);};for(const g of live.values())collect(g);return out;},
    get count() { return live.size; },
    dispose() {
      for (const g of live.values()) scene.remove(g);
      live.clear(); animated.clear(); meshCache = null;
    },
  };
}
