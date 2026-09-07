// Training yard bodies, measured as real Three.js objects.
// Run: node src/game/training_models.test.mjs

import * as THREE from 'three';
import { buildArcheryTarget, buildTrainingDummy } from './training_models.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '   ' + detail : ''}`);
};

function boxOf(o) {
  o.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(o);
}

function triangleCount(o) {
  let n = 0;
  o.traverse((part) => {
    if (!part.isMesh || !part.geometry) return;
    const g = part.geometry;
    const pos = g.getAttribute('position');
    n += g.index ? g.index.count / 3 : (pos?.count || 0) / 3;
  });
  return Math.round(n);
}

function vertexCount(o) {
  let n = 0;
  o.traverse((part) => {
    if (part.isMesh && part.geometry) n += part.geometry.getAttribute('position')?.count || 0;
  });
  return n;
}

function shadowReport(o) {
  let meshes = 0;
  const bad = [];
  o.traverse((part) => {
    if (!part.isMesh) return;
    meshes++;
    if (part.castShadow !== true) bad.push(part.name || '(unnamed)');
  });
  return { meshes, bad };
}

function worldPos(o) {
  return o.getWorldPosition(new THREE.Vector3());
}

function byName(o, name) {
  let found = null;
  o.traverse((part) => { if (part.name === name) found = part; });
  return found;
}

function namedWith(o, prefix) {
  const rows = [];
  o.traverse((part) => { if (part.name?.startsWith(prefix)) rows.push(part); });
  return rows;
}

const rows = [];
const specs = [
  { label: 'training dummy', kind: 'trainingDummy', height: 1.75, variants: [0, 1, 2], build: buildTrainingDummy },
  { label: 'archery target', kind: 'archeryTarget', height: 1.6, variants: [0, 1], build: buildArcheryTarget },
];

console.log('training_models: contract, size and triangle budgets');
for (const spec of specs) {
  for (const variant of spec.variants) {
    const label = `${spec.label} v${variant}`;
    const built = spec.build({ variant, seed: 424242 });
    const again = spec.build({ variant, seed: 424242 });
    const box = boxOf(built);
    const actualHeight = box.max.y - box.min.y;
    const tris = triangleCount(built);
    const verts = vertexCount(built);
    const shadows = shadowReport(built);
    const data = built.userData;

    check(`${label} returns a THREE.Group`, built instanceof THREE.Group);
    check(`${label} stands on the ground`, Math.abs(box.min.y) <= 0.05, `min.y ${box.min.y.toFixed(3)} m`);
    check(`${label} height is within 15 percent of ${spec.height} m`,
      Math.abs(actualHeight - spec.height) <= spec.height * 0.15,
      `${actualHeight.toFixed(3)} m`);
    check(`${label} userData carries the hit contract`,
      data.kind === spec.kind
      && data.height === spec.height
      && Number.isFinite(data.radius)
      && data.radius > 0
      && data.hitY >= 0.6
      && data.hitY <= 1.4,
      JSON.stringify(data));
    check(`${label} is under 1500 triangles`, tris > 0 && tris < 1500, `${tris} triangles`);
    check(`${label} casts shadows on every mesh`, shadows.meshes > 0 && shadows.bad.length === 0,
      `${shadows.meshes} meshes${shadows.bad.length ? ', missing ' + shadows.bad.join(', ') : ''}`);
    check(`${label} builds the same vertex count for the same seed`,
      verts === vertexCount(again), `${verts} vertices`);

    if (spec.kind === 'archeryTarget') {
      built.updateWorldMatrix(true, true);
      const boss = byName(built, 'archeryTarget:boss');
      const rings = namedWith(built, 'archeryTarget:ring:');
      const bossZ = boss ? worldPos(boss).z : 0;
      const front = rings.filter((ring) => worldPos(ring).z > bossZ + 0.001);
      check(`${label} painted rings sit in front of the boss`,
        !!boss && rings.length === 5 && front.length === rings.length,
        `boss z ${bossZ.toFixed(3)}, rings ${rings.map((r) => worldPos(r).z.toFixed(3)).join(', ')}`);
    }

    rows.push({ label, tris, verts });
  }
}

console.log('\ntriangle counts');
for (const row of rows) console.log(`       ${row.label.padEnd(18)} ${String(row.tris).padStart(4)} triangles  ${row.verts} vertices`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
