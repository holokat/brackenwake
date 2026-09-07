import {propColliders} from '../world/collision/shapes.js';
// Crafting stations in the settlements: a forge, a workbench, a kitchen and the
// rest, one marker each at the spots win_crafting.js's stationsForSite gives.
// Until real models land they are squat blocks with a lid, coloured per
// station, and a name plate the HUD can read on hover. Click within reach and
// main.js opens the Crafting window at that station.
//
//   const stations = createStations(sc, runtime, { hud });
//   stations.update(px, pz);              // twice a second is plenty
//   const s = stations.pick(raycaster);   // { id, name, site, x, z } | null

import * as THREE from 'three';
import { stationsForSite, STATION } from './win_crafting.js';

export const STATION_REACH = 4;
export const SCAN_R = 700;
export const COLOURS = {
  forge: 0x7a3b2e, tanningRack: 0x705137, workbench: 0x8a6a3c, loom: 0xb8a58c,
  kitchen: 0x9a7a4a, alchemyTable: 0x4f6d5a, inscriptionDesk: 0x6e5a8a,
};

export function createStations(sc, runtime, { hud } = {}) {
  const group = new THREE.Group();
  group.name = 'stations';
  sc.scene.add(group);
  const live = new Map();     // `${siteId}:${stationId}` -> { rec, mesh }
  const geo = new THREE.BoxGeometry(1.4, 0.9, 1.0);
  const lidGeo = new THREE.BoxGeometry(1.6, 0.12, 1.2);
  const mats = new Map();
  const matFor = (id) => {
    if (!mats.has(id)) mats.set(id, new THREE.MeshLambertMaterial({ color: COLOURS[id] ?? 0x777777, flatShading: true }));
    return mats.get(id);
  };
  let lastScan = -1e9;
  const unregister=runtime.physical?.register('stations',()=>[...live.values()].flatMap(e=>propColliders('workshop',e.rec.x,e.rec.z,e.mesh.position.y-.45,1.6,1.2,1.1,e.rec.yaw||0)));

  function place(rec) {
    const key = `${rec.site.id ?? rec.site.name}:${rec.id}`;
    if (live.has(key)) return live.get(key);
    const y = runtime.heightAt(rec.x, rec.z);
    const mesh = new THREE.Mesh(geo, matFor(rec.id));
    mesh.position.set(rec.x, y + 0.45, rec.z);
    mesh.rotation.y = rec.yaw || 0;
    mesh.castShadow = true;
    const lid = new THREE.Mesh(lidGeo, matFor(rec.id));
    lid.position.y = 0.5;
    mesh.add(lid);
    mesh.userData.station = rec;
    group.add(mesh);
    const e = { rec, mesh, key };
    live.set(key, e);runtime.physical?.changed();
    return e;
  }

  function update(px, pz, nowMs = performance.now()) {
    if (nowMs - lastScan < 500) return;
    lastScan = nowMs;
    const want = new Set();
    for (const site of runtime.sitesNear(px, pz, SCAN_R)) {
      for (const rec of stationsForSite(site)) want.add(place(rec).key);
    }
    for (const [key, e] of live) {
      if (want.has(key)) continue;
      group.remove(e.mesh); live.delete(key);runtime.physical?.changed();
    }
  }

  function pick(raycaster) {
    if (!live.size) return null;
    const hits = raycaster.intersectObjects(group.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.station) o = o.parent;
      if (o) return o.userData.station;
    }
    return null;
  }

  return {
    group, update, pick,
    nearest(pos, r = STATION_REACH, id = null) {
      let best = null, bestD = Infinity;
      for (const e of live.values()) {
        if (id && e.rec.id !== id) continue;
        const d = Math.hypot(e.rec.x - pos.x, e.rec.z - pos.z);
        if (d < bestD && d <= r) { bestD = d; best = e.rec; }
      }
      return best;
    },
    nameOf: (id) => STATION[id]?.name ?? id,
    get count() { return live.size; },
    dispose() { unregister?.();for (const e of live.values()) group.remove(e.mesh); live.clear(); sc.scene.remove(group); geo.dispose(); lidGeo.dispose();for(const mat of mats.values())mat.dispose();mats.clear(); },
  };
}
