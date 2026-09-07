// Model Town: every real model the game has, standing in rows on the flat pad
// at the origin with its name over it, so a model can be walked round and
// looked at without hunting for the one place a plan happens to put it.
//
//   const town = await buildModelTown({ heightAt });   // a THREE.Group, or null
//   scene.add(town);  ...  scene.remove(town); disposeModelTown(town);
//
// It is a dev thing. The dev system builds it when dev mode turns on and takes
// it down when dev mode turns off, and the bench has a button that warps to
// it. The origin pad is HOME_RADIUS (110 m) of flat ground that nothing else
// uses since a character is born in Hearthhome, and SPAWN_CLEAR keeps every
// rolled site 600 m away from it, so nothing is ever built over.
//
// WHICH MODELS. The list is public/models/props/manifest.json, which
// tools/validate-props.mjs rewrites on every run from the files actually in
// the folder. The browser cannot list a folder and Vite answers 200 with the
// index page for a file that is not there, so guessing ids from FOOTPRINT
// would cost a hundred and ninety fetches to find eleven files. The manifest
// is the honest list; a model that is not in it was never validated.
//
// The label over each one says the id, the file's size in metres and its
// triangle count, read off the loaded geometry, never off the table.

import * as THREE from 'three';
import { FOOTPRINT } from '../mmo/plans/footprints.js';
import { loadProp, hasProp, pieceBody, PROP_DIR } from './plan_models.js';

/** Where the town stands: the middle of the origin pad. */
export const MODEL_TOWN = { x: 0, z: 0 };
/** Where the bench puts a visitor: at the near corner, looking across the rows. */
export const MODEL_TOWN_ARRIVAL = { x: 0, z: -24 };
export const MANIFEST_URL = PROP_DIR + 'manifest.json';
/** Clear ground between one model's footprint and the next, metres. */
export const GAP = 4;
/** Models per row. */
export const PER_ROW = 5;

/** The ids in the manifest, or [] when there is none. Pure fetch, no THREE. */
export async function manifestIds(url = MANIFEST_URL) {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.ids) ? j.ids.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Where each id stands: rows of PER_ROW, small things first, each column as
 * wide as the widest thing in it plus the gap, each row as deep as the
 * deepest thing in it plus the gap. Pure; footprints come in so a test can
 * lay out ids that have no file.
 *
 * Returns [{ id, x, z, w, d, h }] centred on (0, 0).
 */
export function layoutFor(ids, footprints = FOOTPRINT) {
  const rows = [];
  const sorted = ids.filter((id) => footprints[id]).sort((a, b) => footprints[a][2] - footprints[b][2] || a.localeCompare(b));
  for (let i = 0; i < sorted.length; i += PER_ROW) rows.push(sorted.slice(i, i + PER_ROW));
  const out = [];
  let z = 0;
  const rowDepths = rows.map((row) => Math.max(...row.map((id) => footprints[id][1])) + GAP);
  const totalDepth = rowDepths.reduce((a, b) => a + b, 0);
  z = -totalDepth / 2;
  rows.forEach((row, ri) => {
    const widths = row.map((id) => footprints[id][0] + GAP);
    const totalWidth = widths.reduce((a, b) => a + b, 0);
    let x = -totalWidth / 2;
    row.forEach((id, ci) => {
      const [w, d, h] = footprints[id];
      out.push({ id, x: x + widths[ci] / 2, z: z + rowDepths[ri] / 2, w, d, h });
      x += widths[ci];
    });
    z += rowDepths[ri];
  });
  return out;
}

/** A canvas sprite that says the words, sized to read from ten metres. */
export function labelSprite(lines, scale = 1) {
  if (typeof document === 'undefined') return null;   // node: the town still builds, unlabelled
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 64 * lines.length + 24;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(20, 16, 10, 0.78)';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#ffd479';
  g.textAlign = 'center';
  lines.forEach((line, i) => {
    g.font = `${i === 0 ? 'bold 44px' : '30px'} Georgia, serif`;
    g.fillText(line, canvas.width / 2, 48 + i * 64);
  });
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(3.2 * scale, (3.2 * scale) / aspect, 1);
  sprite.renderOrder = 999;
  return sprite;
}

/** Triangles in a group, counted off its geometry. */
export function trianglesOf(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += Math.floor((g.index ? g.index.count : g.attributes.position?.count || 0) / 3);
  });
  return n;
}

/**
 * Build the town. Loads every manifest model that is not in yet, lays them
 * out, and returns the group, or null when there is nothing to show. Each
 * model is the same clone a plan would place, so what is seen here is what a
 * plan shows, scale and all.
 */
export async function buildModelTown({ heightAt = () => 0, ids = null, fetchIds = manifestIds, sculpt = null } = {}) {
  // Not on a blank canvas: a sculpt world shows nothing the user did not put
  // there, and Model Town is a gallery, not the user's. `sculpt` is handed in
  // by the caller; in the game it is read off the terrain contract.
  const blank = sculpt != null ? !!sculpt : (typeof window !== 'undefined' && window.__bw?.terrain?.mode?.() === 'sculpt');
  if (blank) return null;
  const list = ids || await fetchIds();
  await Promise.all(list.map((id) => loadProp(id).catch(() => false)));
  const have = list.filter((id) => hasProp(id));
  if (!have.length) return null;
  const group = new THREE.Group();
  group.name = 'model-town';
  const at = layoutFor(have);
  for (const p of at) {
    const body = pieceBody(p.id, 1);
    if (!body || body.source !== 'glb') continue;
    const wx = MODEL_TOWN.x + p.x, wz = MODEL_TOWN.z + p.z;
    const y = heightAt(wx, wz);
    body.group.position.set(wx, y, wz);
    body.group.name = `model-town:${p.id}`;
    body.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.modelTown = p.id; } });
    group.add(body.group);
    // the label, read off the loaded geometry
    const box = new THREE.Box3().setFromObject(body.group);
    const size = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
    const label = labelSprite([p.id, `${size[0].toFixed(1)} by ${size[2].toFixed(1)} by ${size[1].toFixed(1)} m`, `${trianglesOf(body.group).toLocaleString()} triangles`], Math.max(1, size[1] / 4));
    if (label) {
      label.position.set(wx, y + size[1] + 1.2 + size[1] * 0.1, wz);
      label.name = `model-town:label:${p.id}`;
      group.add(label);
    }
  }
  group.userData.ids = at.map((p) => p.id);
  return group;
}

/** Free the labels; the models are the prototypes' own and stay. */
export function disposeModelTown(group) {
  if (!group) return;
  group.traverse((o) => {
    if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); }
  });
}
