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

export function authoredForage(field, cx, cz, season, catalog, spaces = SPACES, trees = null) {
  const out = [];
  for (const s of Object.values(spaces)) {
    for (const p of s.forage || []) {
      const row = catalog[p.id];
      if (!row || !row.seasons.includes(season)) continue;
      let x = s.at.x + p.x, z = s.at.z + p.z;
      if (Math.floor(x / CHUNK) !== cx || Math.floor(z / CHUNK) !== cz) continue;
      const ground = field.sampleAt(x, z);
      if (ground.water) continue;
      let y = ground.h + 0.03, yaw=0, tree=null;
      const onTrunk=row.place==='trunk';
      if(onTrunk){
        const candidates=p.tree?[p.tree]:(s.trees||[]);
        const t=candidates.map(t=>({...t,d:Math.hypot(t.x-p.x,t.z-p.z)})).filter(t=>t.d<20).sort((a,b)=>a.d-b.d)[0];
        if(!t)continue;
        const tx=s.at.x+t.x,tz=s.at.z+t.z;
        const liveTrees=typeof trees==='function'?trees(Math.floor(tx/CHUNK),Math.floor(tz/CHUNK)):trees;
        const live=liveTrees?.find(q=>Math.hypot(q.x-tx,q.z-tz)<.15);
        const radius=live?.radius??.35*(t.scale||1),angle=(p.yaw||0)*Math.PI/180;
        x=tx+Math.sin(angle)*radius*.94;z=tz+Math.cos(angle)*radius*.94;
        y=field.heightAt(tx,tz)+(p.height||.9);yaw=angle;
        tree={x:tx,z:tz};
      }
      const count = p.count || 1;
      const members = [{ x, y, z, yaw, scale: 1 }];
      if (count === 2) members.push(onTrunk?{x,y:y+.2,z,yaw,scale:.85}:{ x: x + 0.35, y: field.heightAt(x + 0.35, z + 0.2) + 0.03, z: z + 0.2, yaw: 1.7, scale: 0.85 });
      out.push({ id: p.id, x, y, z, count, onTrunk, tree, members,
        authored: `${s.id}:${p.id}:${p.x}:${p.z}` });
    }
  }
  return out;
}
