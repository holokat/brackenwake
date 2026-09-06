// Validate the prop and building models in public/models/props against the
// footprint table and the budgets the spec gives by size.
//
//   node tools/validate-props.mjs                 every glb in public/models/props
//   node tools/validate-props.mjs --file x.glb    one file, wherever it is
//   node tools/validate-props.mjs --quiet         one line per file, failures only
//
// What each check protects against, all of them things a model has already
// arrived with in this repo:
//
//   unknown id       a file named for nothing in FOOTPRINT is never loaded, so
//                    it stands in the folder doing nothing (the wall corner)
//   height           the loader scales a model to its footprint height; a
//                    model built to the wrong height arrives stretched or
//                    squashed, texture and all (a 1 m Tripo cottage at 5.5 m)
//   footprint        width and depth off the footprint means the plan's
//                    spacing is wrong round it (walls that overlap or gap)
//   ground, centre   a base under y=0 sinks, an off-centre model stands
//                    beside its mark
//   texture size     three 2048 sheets on a fence panel made a 10 MB file
//                    that every player downloads and holds in VRAM
//   triangles        a fence at 4,300 triangles times a hundred panels
//   materials        every material is a draw call per copy
//   draco, cameras,  the loader has no decoder, and an exporter's camera
//   lights, skins    ends up in the scene
//
// The budgets are by the model's footprint height, which is the one number
// every model has:
//
//   under 2 m    a prop: barrel, crate, bench, fence panel, headstone
//                512 textures, 800 triangles
//   under 4 m    a wall piece, a stall, a well, a bridge, a standing stone
//                1024 textures, 1,500 triangles (2,500 for a bridge or a
//                well, which are more than a panel)
//   under 7 m    a cottage, a stable, a smithy, a gate tower
//                2048 textures, 8,000 triangles
//   7 m and up   the inn, the chapel, the manor, the mill, the castle
//                2048 textures, 15,000 triangles
//
// No dependencies beyond the glb reader in validate-glb.mjs and the footprint
// table itself, so what is checked is the FILE against the game's own table.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGLB } from './validate-glb.mjs';
import { FOOTPRINT } from '../src/mmo/plans/footprints.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROP_DIR = join(HERE, '..', 'public', 'models', 'props');

export const HEIGHT_TOLERANCE = 0.05;      // 5 per cent: the loader fits to this axis
export const FOOTPRINT_TOLERANCE = 0.35;   // 35 per cent on width and depth: the loader fits height only, and a cottage may sit small on its lot
export const GROUND_TOLERANCE = 0.05;      // metres under or over y = 0
export const CENTRE_TOLERANCE = 0.15;      // metres off the footprint's middle

/** The budget a model of this footprint height gets. */
export function budgetFor(height, id = '') {
  if (height < 2) return { texture: 512, triangles: 800, kind: 'prop' };
  if (height < 4) return { texture: 1024, triangles: /bridge|well|pavilion|mill_wheel/.test(id) ? 2500 : 1500, kind: 'piece' };
  if (height < 7) return { texture: 2048, triangles: 8000, kind: 'small building' };
  return { texture: 2048, triangles: 15000, kind: 'building' };
}

/** Width and height of a PNG or JPEG from its bytes, or null. */
export function imageSize(bytes) {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') {
    return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20), type: 'png' };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) { at++; continue; }
      const marker = bytes[at + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
      const len = bytes.readUInt16BE(at + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { h: bytes.readUInt16BE(at + 5), w: bytes.readUInt16BE(at + 7), type: 'jpeg' };
      }
      at += 2 + len;
    }
  }
  return null;
}

// --- a node's world matrix, the same way validate-glb.mjs walks the scene
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [
    (1 - 2 * (yy + zz)) * sx, (2 * (xy + wz)) * sx, (2 * (xz - wy)) * sx, 0,
    (2 * (xy - wz)) * sy, (1 - 2 * (xx + zz)) * sy, (2 * (yz + wx)) * sy, 0,
    (2 * (xz + wy)) * sz, (2 * (yz - wx)) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function apply(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/**
 * Validate one glb's bytes as the prop `id`. Returns { ok, checks, stats }.
 * A file with no footprint row fails on that alone and is otherwise measured.
 */
export function validatePropBuffer(buf, id) {
  const checks = [];
  const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); return !!ok; };
  const { json, bin } = parseGLB(buf);
  const stats = { bytes: buf.length, triangles: 0, materials: 0, textures: [], size: null };

  // the footprint row
  const f = FOOTPRINT[id];
  check('a footprint row', !!f, f ? `[${f.join(', ')}]` : `no FOOTPRINT["${id}"] in src/mmo/plans/footprints.js: nothing would ever load this file`);

  // nothing the loader cannot use
  const required = json.extensionsRequired || [];
  check('no compression', !required.some((e) => /draco|meshopt|KHR_texture_basisu/i.test(e)), required.join(', ') || 'none required');
  check('no cameras', !(json.cameras && json.cameras.length), `${json.cameras?.length || 0}`);
  check('no lights', !(json.extensions && json.extensions.KHR_lights_punctual), json.extensions ? Object.keys(json.extensions).join(', ') : 'none');
  check('no skins or animations', !(json.skins?.length) && !(json.animations?.length), `${json.skins?.length || 0} skins, ${json.animations?.length || 0} clips`);

  // the bounds, walked through the node tree
  const scene = json.scenes?.[json.scene || 0];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const walk = (ni, parent) => {
    const node = json.nodes[ni];
    const m = mul(parent, trs(node));
    if (node.mesh !== undefined) {
      const mesh = json.meshes[node.mesh];
      for (const prim of mesh.primitives) {
        // glTF requires min and max on every POSITION accessor, so the bounds
        // are the eight corners of that box through the node's matrix
        const a = json.accessors[prim.attributes.POSITION];
        if (a.min && a.max) {
          for (const p of [[a.min[0], a.min[1], a.min[2]], [a.max[0], a.min[1], a.min[2]], [a.min[0], a.max[1], a.min[2]], [a.min[0], a.min[1], a.max[2]],
            [a.max[0], a.max[1], a.min[2]], [a.max[0], a.min[1], a.max[2]], [a.min[0], a.max[1], a.max[2]], [a.max[0], a.max[1], a.max[2]]]) {
            const w = apply(m, p); for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], w[i]); max[i] = Math.max(max[i], w[i]); }
          }
        }
        const n = prim.indices !== undefined ? json.accessors[prim.indices].count : a.count;
        stats.triangles += Math.floor(n / 3);
      }
    }
    for (const c of node.children || []) walk(c, m);
  };
  for (const ni of scene?.nodes || []) walk(ni, IDENTITY);
  const size = max.map((v, i) => v - min[i]);
  stats.size = size.map((v) => +v.toFixed(3));
  stats.min = min.map((v) => +v.toFixed(3));

  if (f) {
    const [fw, fd, fh] = f;
    check('height matches the footprint', Math.abs(size[1] - fh) <= fh * HEIGHT_TOLERANCE, `${size[1].toFixed(2)} m against ${fh} m`);
    const wOk = Math.abs(size[0] - fw) <= fw * FOOTPRINT_TOLERANCE, dOk = Math.abs(size[2] - fd) <= fd * FOOTPRINT_TOLERANCE;
    check('width and depth match the footprint', wOk && dOk, `${size[0].toFixed(2)} by ${size[2].toFixed(2)} m against ${fw} by ${fd} m`);
  }
  check('base on the ground', Math.abs(min[1]) <= GROUND_TOLERANCE, `lowest point at y = ${min[1].toFixed(3)}`);
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
  check('centred on the origin', Math.abs(cx) <= CENTRE_TOLERANCE && Math.abs(cz) <= CENTRE_TOLERANCE, `middle at ${cx.toFixed(2)}, ${cz.toFixed(2)}`);

  // materials and textures against the budget for this height
  const height = f ? f[2] : size[1];
  const budget = budgetFor(height, id);
  stats.budget = budget;
  const mats = json.materials || [];
  stats.materials = mats.length;
  const masked = mats.filter((m) => m.alphaMode === 'MASK').length;
  check('one material, or two with an alpha-cut second', mats.length === 1 || (mats.length === 2 && masked === 1), `${mats.length} materials, ${masked} alpha-cut`);
  check('triangles inside the budget', stats.triangles <= budget.triangles, `${stats.triangles} against ${budget.triangles} for a ${budget.kind} ${height} m high`);
  for (const [i, img] of (json.images || []).entries()) {
    let dims = null;
    if (img.bufferView !== undefined) {
      const bv = json.bufferViews[img.bufferView];
      dims = imageSize(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
    }
    stats.textures.push({ name: img.name || `image ${i}`, w: dims?.w, h: dims?.h, type: dims?.type || img.mimeType });
    check(`texture ${img.name || i} inside the budget`, dims && Math.max(dims.w, dims.h) <= budget.texture, dims ? `${dims.w} by ${dims.h} against ${budget.texture}` : 'unreadable image');
  }
  check('under three textures per material', (json.images || []).length <= 3 * Math.max(1, mats.length), `${(json.images || []).length} images`);

  return { ok: checks.every((c) => c.ok), checks, stats };
}

export function validatePropFile(path, id = basename(path, '.glb')) {
  const buf = readFileSync(path);
  const r = validatePropBuffer(buf, id);
  return { name: id, path, ...r };
}

export function main(argv = []) {
  const quiet = argv.includes('--quiet');
  const fi = argv.indexOf('--file');
  const files = fi >= 0 ? [argv[fi + 1]] : readdirSync(PROP_DIR).filter((f) => f.endsWith('.glb')).sort().map((f) => join(PROP_DIR, f));
  let failed = 0, bytes = 0;
  for (const path of files) {
    const r = validatePropFile(path);
    bytes += statSync(path).size;
    if (!r.ok) failed++;
    if (!quiet || !r.ok) {
      const s = r.stats;
      console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(22)} ${String(s.triangles).padStart(6)} tris  ${s.size ? s.size.map((v) => v.toFixed(2)).join(' x ') : '?'} m  ${s.materials} mat  ${s.textures.map((t) => t.w ? `${t.w}` : '?').join('/') || 'no tex'}  ${(s.bytes / 1048576).toFixed(1)} MB`);
      for (const c of r.checks) if (!c.ok || argv.includes('--verbose')) console.log(`      ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`);
    }
  }
  console.log(`${files.length - failed}/${files.length} props pass, ${(bytes / 1048576).toFixed(1)} MB in all`);
  return failed === 0;
}

if (process.argv[1] && process.argv[1].endsWith('validate-props.mjs')) {
  process.exit(main(process.argv.slice(2)) ? 0 : 1);
}
