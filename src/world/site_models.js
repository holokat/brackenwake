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
    // the mound is terrain (field.js); the mouth is a dark opening under a rock lintel
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(2.4, 12), M.dark);
    mouth.position.set(site.x + Math.sin(site.facing) * 2.2, y0 - 1.2, site.z + Math.cos(site.facing) * 2.2);
    mouth.rotation.y = site.facing;
    mouth.scale.y = 0.75;
    g.add(mouth);
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1 + rng() * 0.9, 0), rng() < 0.5 ? M.rock : M.rockDark);
      const a = site.facing + (i - 2) * 0.55, d = 2.6 + rng() * 0.8;
      r.position.set(site.x + Math.sin(a) * d, y0 - 1.6 + 0.9 * Math.abs(i - 2) * 0.5 + 0.9, site.z + Math.cos(a) * d);
      r.rotation.set(rng() * 3, rng() * 3, rng() * 3); r.castShadow = true;
      g.add(r);
    }
  } else if (site.kind === 'camp') {
    const fire = buildCamp('campfire'); fire.position.set(site.x, y0, site.z); g.add(fire);
    const tent = buildCamp('tent'); tent.position.set(site.x + 4, ground(4, 0), site.z); tent.rotation.y = site.facing; g.add(tent);
    const chair = buildCamp('camp_chair'); chair.position.set(site.x - 2.4, ground(-2.4, 1.6), site.z + 1.6); chair.rotation.y = 0.9; g.add(chair);
  }
  g.userData.site = site;
  g.traverse((o) => { if (o.isMesh) o.userData.site = site; });
  return g;
}

/** Keeps markers alive for every site within `radius` of (x, z). */
export function createSiteMarkers(scene, discovery, heightAt) {
  const live = new Map();
  let lastX = Infinity, lastZ = Infinity;
  let meshCache = null;
  return {
    update(x, z, radius) {
      if (Math.hypot(x - lastX, z - lastZ) < 48) return;
      lastX = x; lastZ = z;
      const near = discovery.sitesNear(x, z, radius);
      const keep = new Set();
      let changed = false;
      for (const s of near) {
        keep.add(s.id);
        if (!live.has(s.id)) { const g = buildSiteMarker(s, heightAt); scene.add(g); live.set(s.id, g); changed = true; }
      }
      for (const [id, g] of live) if (!keep.has(id)) { scene.remove(g); live.delete(id); changed = true; }
      if (changed) meshCache = null;
    },
    /** Every mesh of every live marker, for raycasting. */
    meshes() {
      if (!meshCache) { meshCache = []; for (const g of live.values()) g.traverse((o) => { if (o.isMesh) meshCache.push(o); }); }
      return meshCache;
    },
    get count() { return live.size; },
    dispose() { for (const g of live.values()) scene.remove(g); live.clear(); meshCache = null; },
  };
}
