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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A kit house is dozens of small meshes, each its own draw call. A town of
// twelve was 377 meshes. Static markers never move, so every mesh with the same
// colour is baked into one geometry: a town becomes a dozen draw calls, and the
// raycast has a dozen objects to test instead of hundreds.
export function mergeByMaterial(group) {
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

export function buildSiteMarker(site, heightAt) {
  const g = new THREE.Group();
  g.name = `site:${site.id}`;
  const rng = mulberry32(hash2(site.cx, site.cz, 77));
  const ground = (dx, dz) => heightAt(site.x + dx, site.z + dz);
  const y0 = site.y;

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
  const merged = mergeByMaterial(g);
  merged.traverse((o) => { if (o.isMesh) o.userData.site = site; });
  return merged;
}

/** Keeps markers alive for every site within `radius` of (x, z). */
export function createSiteMarkers(scene, discovery, heightAt) {
  const live = new Map();
  let lastX = Infinity, lastZ = Infinity;
  let meshCache = null;
  const pending = [];
  return {
    update(x, z, radius) {
      // one build per frame: a town is the most expensive thing the world makes
      if (pending.length) {
        const s = pending.shift();
        if (!live.has(s.id)) { const g = buildSiteMarker(s, heightAt); scene.add(g); live.set(s.id, g); meshCache = null; }
      }
      if (Math.hypot(x - lastX, z - lastZ) < 48) return;
      lastX = x; lastZ = z;
      const near = discovery.sitesNear(x, z, radius);
      const keep = new Set();
      for (const s of near) {
        keep.add(s.id);
        if (!live.has(s.id) && !pending.some((p) => p.id === s.id)) pending.push(s);
      }
      for (const [id, g] of live) if (!keep.has(id)) { scene.remove(g); live.delete(id); meshCache = null; }
      for (let i = pending.length - 1; i >= 0; i--) if (!keep.has(pending[i].id)) pending.splice(i, 1);
    },
    get pending() { return pending.length; },
    /** Every mesh of every live marker, for raycasting. */
    meshes() {
      if (!meshCache) { meshCache = []; for (const g of live.values()) g.traverse((o) => { if (o.isMesh) meshCache.push(o); }); }
      return meshCache;
    },
    get count() { return live.size; },
    dispose() { for (const g of live.values()) scene.remove(g); live.clear(); meshCache = null; },
  };
}
