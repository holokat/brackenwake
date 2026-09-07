// Placement comes from the space file. Rendering, harvesting and rewards use
// the same fields as wild resources, so a placed oak is a working oak.
import { SPACES } from '../mmo/spaces/index.js';
import { CHUNK } from './field.js';

export function authoredResources(field, cx, cz, spaces = SPACES) {
  const out = {};
  const inside = (x, z) => Math.floor(x / CHUNK) === cx && Math.floor(z / CHUNK) === cz;
  for (const s of Object.values(spaces)) {
    if (!s.at) continue;
    const add = (p, kind, rock = false) => {
      if (!p.harvest) return;
      const x = s.at.x + p.x, z = s.at.z + p.z;
      if (!inside(x, z)) return;
      const ground = field.sampleAt(x, z);
      if (ground.water) return;
      (out[kind] ||= []).push({ x, z, gy: ground.h - 0.12,
        s: (p.scale ?? 1) * (rock ? 1.6 : 1), sy: 1,
        ry: (p.yaw || 0) * Math.PI / 180, alt: 0, oa: 0,
        chunk: `${cx},${cz}`, ore: kind === 'ore', tier: p.ore || null,
        authored: `${s.id}:${kind}:${p.x}:${p.z}` });
    };
    for (const p of s.trees || []) add(p, p.species);
    for (const p of s.rocks || []) if (p.kind === 'rock' || p.kind === 'ore') add(p, p.kind, true);
  }
  return out;
}

export function authoredForage(field, cx, cz, season, catalog, spaces = SPACES) {
  const out = [];
  for (const s of Object.values(spaces)) {
    for (const p of s.forage || []) {
      const row = catalog[p.id];
      if (!row || !row.seasons.includes(season)) continue;
      const x = s.at.x + p.x, z = s.at.z + p.z;
      if (Math.floor(x / CHUNK) !== cx || Math.floor(z / CHUNK) !== cz) continue;
      const ground = field.sampleAt(x, z);
      if (ground.water) continue;
      const y = ground.h + 0.03;
      const count = p.count || 1;
      const members = [{ x, y, z, yaw: 0, scale: 1 }];
      if (count === 2) members.push({ x: x + 0.35, y: field.heightAt(x + 0.35, z + 0.2) + 0.03, z: z + 0.2, yaw: 1.7, scale: 0.85 });
      out.push({ id: p.id, x, y, z, count, onTrunk: false, members,
        authored: `${s.id}:${p.id}:${p.x}:${p.z}` });
    }
  }
  return out;
}
