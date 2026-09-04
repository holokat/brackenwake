// What a site looks like from a distance, built from primitives so it costs
// nothing to load. These are markers, not the places themselves: a hamlet is a
// few roofs, a dungeon is a dark mouth in the ground. Real interiors come later.
import * as THREE from 'three';
import { mulberry32, hash2 } from './noise.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
const M = {
  wall: mat(0xd9c9a8), wallDark: mat(0x9c8a6a), roof: mat(0x8a3f2e), roofDark: mat(0x5a4a3a),
  stone: mat(0x7d7873), stoneDark: mat(0x4a4744), wood: mat(0x6b4a2e), ash: mat(0x2a2624),
  dark: mat(0x0b0a0c), gold: mat(0xd8b25a, { metalness: 0.3, roughness: 0.4 }),
};

function house(g, rng, x, z, y, scale = 1) {
  const w = (4 + rng() * 3) * scale, d = (4 + rng() * 3) * scale, h = (2.6 + rng() * 1.2) * scale;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rng() < 0.7 ? M.wall : M.wallDark);
  body.position.set(x, y + h / 2, z);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.8, 4), rng() < 0.6 ? M.roof : M.roofDark);
  roof.position.set(x, y + h + h * 0.4, z);
  roof.rotation.y = Math.PI / 4;
  body.castShadow = roof.castShadow = true;
  g.add(body, roof);
}

export function buildSiteMarker(site, heightAt) {
  const g = new THREE.Group();
  g.name = `site:${site.id}`;
  const rng = mulberry32(hash2(site.cx, site.cz, 77));
  const ground = (dx, dz) => heightAt(site.x + dx, site.z + dz);
  const y0 = site.y;

  if (site.kind === 'hamlet' || site.kind === 'town') {
    const n = site.kind === 'town' ? 10 + Math.floor(rng() * 5) : 3 + Math.floor(rng() * 4);
    const r = site.kind === 'town' ? 26 : 14;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, d = 6 + rng() * r;
      const dx = Math.cos(a) * d, dz = Math.sin(a) * d;
      house(g, rng, site.x + dx, site.z + dz, ground(dx, dz) - 0.2);
    }
    if (site.kind === 'town') {   // a well in the middle
      const well = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 1.2, 10), M.stone);
      well.position.set(site.x, y0 + 0.6, site.z); g.add(well);
    }
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
    s.position.set(site.x, y0 + 1.6, site.z); s.rotation.y = rng() * Math.PI; s.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), M.gold);
    cap.position.set(site.x, y0 + 3.5, site.z);
    g.add(s, cap);
  } else if (site.kind === 'dungeon') {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(3, 0.7, 6, 12, Math.PI), M.stoneDark);
    arch.position.set(site.x, y0 + 0.2, site.z); arch.rotation.y = rng() * Math.PI; arch.castShadow = true;
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(2.6, 14), M.dark);
    mouth.position.set(site.x, y0 + 0.2, site.z); mouth.rotation.copy(arch.rotation);
    g.add(arch, mouth);
  } else if (site.kind === 'camp') {
    const fire = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.3, 8), M.ash);
    fire.position.set(site.x, y0 + 0.15, site.z);
    g.add(fire);
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 6), M.wood);
      const a = rng() * Math.PI * 2;
      log.position.set(site.x + Math.cos(a) * 2.6, y0 + 0.25, site.z + Math.sin(a) * 2.6);
      log.rotation.set(Math.PI / 2, 0, a);
      g.add(log);
    }
  }
  g.userData.site = site;
  return g;
}

/** Keeps markers alive for every site within `radius` of (x, z). */
export function createSiteMarkers(scene, discovery, heightAt) {
  const live = new Map();
  let lastX = Infinity, lastZ = Infinity;
  return {
    update(x, z, radius) {
      if (Math.hypot(x - lastX, z - lastZ) < 48) return;
      lastX = x; lastZ = z;
      const near = discovery.sitesNear(x, z, radius);
      const keep = new Set();
      for (const s of near) {
        keep.add(s.id);
        if (!live.has(s.id)) { const g = buildSiteMarker(s, heightAt); scene.add(g); live.set(s.id, g); }
      }
      for (const [id, g] of live) if (!keep.has(id)) { scene.remove(g); live.delete(id); }
    },
    get count() { return live.size; },
    dispose() { for (const g of live.values()) scene.remove(g); live.clear(); },
  };
}
