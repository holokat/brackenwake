// Validate the Brackenwake glb models against the spec they were built to.
//
//   node tools/validate-glb.mjs            checks public/models/mmo, writes validation.json
//   node tools/validate-glb.mjs --quiet    the same, one summary line
//
// No dependencies. A glb is a 12 byte header and a run of chunks; the first
// chunk is JSON and the second is the binary buffer. Everything below reads
// that structure directly, so what is checked is the FILE, not Blender's idea
// of the file and not three's.
//
// What each check is protecting against, all of them things that have actually
// gone wrong in this repo or would be silent if they did:
//
//   cameras and lights   an exporter default that drops a camera into every
//                        scene and puts it in the player's model
//   one skin             a mesh that lost its armature binding still loads,
//                        it just never animates
//   clip names           the game asks for 'walk' by name; a renamed clip is
//                        a monster that stands still and says nothing
//   clip durations       a clip built at the wrong frame rate plays at the
//                        wrong speed and nothing errors
//   size and ground      a model built in centimetres, or one whose feet are
//                        not on y = 0, floats or sinks with no warning
//   triangles            the budget is the budget
//   no textures          the world is flat shaded; a texture reference that
//                        cannot resolve renders black
//   joint names          three strips . [ ] : / out of node names and turns
//                        whitespace into an underscore, so "upperarm.L"
//                        arrives as "upperarmL". That is survivable, and
//                        models.js `boneKey` is how a lookup survives it. What
//                        is not is a name that sanitises to nothing, or two
//                        that sanitise to the SAME string: the loader numbers
//                        the second one and every table naming it gets the
//                        first bone or no bone at all.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MODEL_DIR = join(HERE, '..', 'public', 'models', 'mmo');
export const ANIM_DIR = join(HERE, '..', 'public', 'animations');

export const HUMAN_CLIPS = { idle: 2.0, walk: 1.0, run: 0.6, swing: 0.5, cast: 0.8, hurt: 0.3, die: 1.2, jump: 0.7 };
export const MONSTER_CLIPS = { idle: 2.0, walk: 1.0, attack: 0.6, hurt: 0.3, die: 1.2, special: 0.8 };

// The studio bodies are not built by tools/blender, so their clip lengths are
// not this repo's to choose. What can be checked is that every move is really
// there and that none of them is an empty clip, so these numbers are FLOORS
// rather than targets and `minClips` says to read them that way. A loop that
// has to read as a cycle gets a bigger floor than a one shot.
const LOOP_FLOOR = 0.40;
const SHOT_FLOOR = 0.12;
const LOOPS = new Set(['idle', 'combat-idle', 'walk', 'run', 'surface-swim', 'tread-water']);
const floors = (names) => Object.fromEntries(names.map(
  (n) => [n, LOOPS.has(n) ? LOOP_FLOOR : (n === 'die' ? 0.5 : SHOT_FLOOR)]));

/** The 36 moves the human clip bank promises. models.js STUDIO_MOVES is this list. */
export const STUDIO_MOVES = [
  'idle', 'combat-idle', 'idle-shift', 'idle-scan',
  'walk-start', 'walk', 'walk-stop', 'walk-backward', 'strafe-left', 'strafe-right',
  'run-start', 'run', 'run-stop', 'turn-left', 'turn-right',
  'jump-launch', 'jump-air', 'running-leap', 'airborne',
  'surface-swim', 'tread-water', 'land-soft', 'land-hard', 'dodge',
  'light-attack', 'heavy-attack', 'two-handed-strike',
  'cast', 'fireball', 'lightning', 'energy-missiles', 'healing', 'whirlwind',
  'hit', 'die', 'jump',
];

export const STUDIO_CLIPS = floors(STUDIO_MOVES);

// axis is the dimension the stated size describes: the humans and the uprights
// are measured by height, the rat by how long it is, the spider and the bat by
// how far across they reach.
//
// `bank` names a file in public/animations that carries the clips instead of
// the glb. When one is set the clip check reads that file, and the glb's own
// animations are free to be anything, because a studio body ships with one
// neutral hold in it and its motion beside it.
//
// `textured` allows an embedded texture. The Blender models have none and are
// still held to that; a studio body is one texture and one material.
//
// `studio` marks a file this repo does not build. It is checked as hard as any
// other when it is there, and its absence is reported as pending rather than
// as a build that broke.
export const SPECS = {
  'human-slim': { clips: HUMAN_CLIPS, axis: 'y', size: 1.8, tris: 1800, bones: 40 },
  'human-medium': { clips: HUMAN_CLIPS, axis: 'y', size: 1.8, tris: 1800, bones: 40 },
  'human-heavy': { clips: HUMAN_CLIPS, axis: 'y', size: 1.8, tris: 1800, bones: 40 },
  'human-male': {
    clips: STUDIO_CLIPS, minClips: true, bank: 'human-male.json', axis: 'y', size: 1.8,
    tris: 12000, bones: 60, textured: true, studio: true, bytes: 8 * 1024 * 1024,
  },
  'human-female': {
    clips: STUDIO_CLIPS, minClips: true, bank: 'human-female.json', axis: 'y', size: 1.8,
    tris: 60000, bones: 60, textured: true, studio: true, bytes: 8 * 1024 * 1024,
  },
  'monster-skeleton': { clips: MONSTER_CLIPS, axis: 'y', size: 1.8, tris: 1500, bones: 40 },
  'monster-goblin': { clips: MONSTER_CLIPS, axis: 'y', size: 1.3, tris: 1500, bones: 40 },
  'monster-rat': { clips: MONSTER_CLIPS, axis: 'z', size: 0.5, tris: 1500, bones: 40 },
  'monster-zombie': { clips: MONSTER_CLIPS, axis: 'y', size: 1.8, tris: 1500, bones: 40 },
  'monster-spider': { clips: MONSTER_CLIPS, axis: 'x', size: 1.2, tris: 1500, bones: 40 },
  'monster-bat': { clips: MONSTER_CLIPS, axis: 'x', size: 0.4, tris: 1500, bones: 40 },
};

/**
 * A clip bank beside a model, or null when the file is not there. `moves` is
 * what the game reads and `clips` is what it plays, so both are returned and
 * the check below holds them to each other: a move with no clip behind it is a
 * promise nothing can keep.
 */
export function readBank(name) {
  const path = join(ANIM_DIR, name);
  if (!existsSync(path)) return null;
  try {
    const json = JSON.parse(readFileSync(path, 'utf8'));
    const moves = json.moves || {};
    const durations = {};
    for (const [id, m] of Object.entries(moves)) durations[id] = Number(m && m.duration) || 0;
    return {
      path, broken: null,
      version: json.version, body: json.body, fps: json.fps,
      durations, moves,
      clipNames: (json.clips || []).map((c) => (c && c.name) || ''),
      abilities: json.abilities || {},
      bytes: readFileSync(path).length,
    };
  } catch (err) {
    return { path, broken: err.message, durations: {}, moves: {}, clipNames: [], abilities: {}, bytes: 0 };
  }
}

export const DURATION_TOLERANCE = 0.10;   // 10 per cent
export const SIZE_TOLERANCE = 0.15;       // 15 per cent
export const GROUND_TOLERANCE = 0.05;     // metres

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const CTYPE = { 5120: [1, 'Int8'], 5121: [1, 'Uint8'], 5122: [2, 'Int16'], 5123: [2, 'Uint16'], 5125: [4, 'Uint32'], 5126: [4, 'Float32'] };

// --- glb container --------------------------------------------------------

export function parseGLB(buf) {
  if (buf.length < 12) throw new Error('too short to be a glb');
  const magic = buf.toString('ascii', 0, 4);
  const version = buf.readUInt32LE(4);
  const total = buf.readUInt32LE(8);
  let json = null, bin = null, at = 12;
  while (at + 8 <= buf.length) {
    const len = buf.readUInt32LE(at);
    const type = buf.readUInt32LE(at + 4);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === 0x4e4f534a && json === null) json = JSON.parse(body.toString('utf8'));
    else if (type === 0x004e4942 && bin === null) bin = Buffer.from(body);
    at += 8 + len + ((4 - (len % 4)) % 4);
  }
  return { magic, version, total, json, bin };
}

export function packGLB(json, bin) {
  const pad = (b, fill) => {
    const n = (4 - (b.length % 4)) % 4;
    return n ? Buffer.concat([b, Buffer.alloc(n, fill)]) : b;
  };
  const j = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const b = bin && bin.length ? pad(Buffer.from(bin), 0) : null;
  const total = 12 + 8 + j.length + (b ? 8 + b.length : 0);
  const head = Buffer.alloc(12);
  head.write('glTF', 0, 'ascii');
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(j.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const parts = [head, jh, j];
  if (b) {
    const bh = Buffer.alloc(8);
    bh.writeUInt32LE(b.length, 0);
    bh.writeUInt32LE(0x004e4942, 4);
    parts.push(bh, b);
  }
  return Buffer.concat(parts);
}

export function readAccessor(json, bin, index) {
  const a = json.accessors[index];
  const comps = COMPONENTS[a.type];
  const [size, kind] = CTYPE[a.componentType];
  const out = [];
  if (a.bufferView === undefined) return new Array(a.count).fill(null).map(() => new Array(comps).fill(0));
  const bv = json.bufferViews[a.bufferView];
  const stride = bv.byteStride || size * comps;
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const get = bin['read' + kind + (size === 1 ? '' : 'LE')].bind(bin);
  for (let i = 0; i < a.count; i++) {
    const row = [];
    for (let c = 0; c < comps; c++) row.push(get(base + i * stride + c * size));
    out.push(row);
  }
  return out;
}

// --- small matrix helpers -------------------------------------------------

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(a, b) {   // column major, a then b applied as b * a in glTF order
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

function trs(node) {
  if (node.matrix) return node.matrix.slice();
  const [x, y, z] = node.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const r = [
    1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw), 0,
    2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw), 0,
    2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy), 0,
    x, y, z, 1,
  ];
  for (let c = 0; c < 3; c++) for (let i = 0; i < 3; i++) r[c * 4 + i] *= [sx, sy, sz][c];
  return r;
}

function apply(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

// --- the checks -----------------------------------------------------------

/**
 * THREE.PropertyBinding.sanitizeNodeName, written out because this file has no
 * dependencies. Whitespace becomes an underscore and `. [ ] : /` are dropped.
 * GLTFLoader runs every node name through it, so this is the name the bone
 * really has once the file is in the game.
 */
export const sanitizeNodeName = (name) => String(name == null ? '' : name)
  .replace(/\s/g, '_').replace(/[[\].:/]/g, '');

export function validateBuffer(buf, spec, name) {
  const checks = [];
  const add = (n, ok, detail) => checks.push({ name: n, ok: !!ok, detail: String(detail) });
  const stats = {};
  let g;
  try {
    g = parseGLB(buf);
  } catch (err) {
    add('container', false, err.message);
    return { name, ok: false, checks, stats };
  }
  const { json, bin } = g;
  add('magic and version', g.magic === 'glTF' && g.version === 2, `${g.magic} v${g.version}`);
  if (!json) {
    add('json chunk', false, 'no JSON chunk');
    return { name, ok: false, checks, stats };
  }

  // no cameras, no lights
  const cams = (json.cameras || []).length;
  const lights = ((json.extensions || {}).KHR_lights_punctual || {}).lights || [];
  const camNodes = (json.nodes || []).filter((n) => n.camera !== undefined).length;
  add('no cameras or lights', cams === 0 && camNodes === 0 && lights.length === 0,
    `${cams} cameras, ${camNodes} camera nodes, ${lights.length} lights`);

  // exactly one skin, and a sane number of joints in it
  const skins = json.skins || [];
  add('exactly one skin', skins.length === 1, `${skins.length} skins`);
  const joints = skins.length === 1 ? skins[0].joints : [];
  stats.bones = joints.length;
  add(`under ${spec.bones} bones`, joints.length > 0 && joints.length < spec.bones, `${joints.length} bones`);

  // Joint names have to survive three's node name sanitiser.
  //
  // Surviving does NOT mean coming through unchanged. `wing_upper.L` arrives as
  // `wing_upperL`, and that is harmless as long as every lookup by name runs
  // the same function first, which models.js `boneKey` does. Two things are not
  // harmless, and they are what this check is for:
  //
  //   an empty name        nothing can be looked up at all
  //   a collision          two joints that sanitise to one string. GLTFLoader
  //                        makes the second unique by appending a number, so a
  //                        table pointing at that name silently gets the FIRST
  //                        bone, or a bone called `wing_upperL_1` that no table
  //                        will ever name.
  const names = joints.map((i) => (json.nodes[i] || {}).name || '');
  const clean = names.map(sanitizeNodeName);
  const empty = names.filter((n, i) => !n || !clean[i]);
  const seen = new Map();
  const clash = [];
  for (let i = 0; i < clean.length; i++) {
    if (seen.has(clean[i])) clash.push(`${seen.get(clean[i])} and ${names[i]} both become ${clean[i]}`);
    else seen.set(clean[i], names[i]);
  }
  const changed = names.filter((n, i) => n !== clean[i]);
  stats.renamedJoints = changed.length;
  const trouble = [...empty.map((n) => `"${n}" has no name left`), ...clash];
  add('joint names survive three', trouble.length === 0,
    trouble.length ? `${trouble.slice(0, 4).join('; ')}${trouble.length > 4 ? ' and so on' : ''}`
      : changed.length
        ? `${names.length} names, ${changed.length} rewritten (${changed[0]} becomes ${sanitizeNodeName(changed[0])}), all still unique`
        : `${names.length} names clean`);

  // triangles, and nothing but triangles
  let tris = 0;
  let nonTri = 0;
  const meshUse = new Map();
  for (const node of json.nodes || []) if (node.mesh !== undefined) meshUse.set(node.mesh, (meshUse.get(node.mesh) || 0) + 1);
  for (const [mi, uses] of meshUse) {
    for (const p of json.meshes[mi].primitives) {
      if (p.mode !== undefined && p.mode !== 4) nonTri++;
      const count = p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count;
      tris += (count / 3) * uses;
    }
  }
  stats.triangles = tris;
  add(`under ${spec.tris} triangles`, tris > 0 && tris < spec.tris, `${tris} triangles`);
  add('triangles only', nonTri === 0, `${nonTri} primitives are not TRIANGLES`);

  // materials: flat colour or vertex colour, and never a texture
  const images = (json.images || []).length;
  const textures = (json.textures || []).length;
  const mats = json.materials || [];
  const textured = mats.filter((m) => JSON.stringify(m).includes('Texture')).length;
  const colourless = [];
  for (const [mi] of meshUse) {
    for (const p of json.meshes[mi].primitives) {
      const m = mats[p.material] || {};
      const hasVC = p.attributes.COLOR_0 !== undefined;
      const pbr = m.pbrMetallicRoughness || {};
      const hasFlat = pbr.baseColorFactor !== undefined || p.material !== undefined;
      if (!hasVC && !hasFlat) colourless.push(m.name || String(p.material));
    }
  }
  stats.materials = mats.length;
  stats.images = images;
  if (spec.textured) {
    // A texture that is not in the binary chunk is a file the game would have
    // to fetch beside the glb, and nothing fetches one. It renders black.
    const external = (json.images || []).filter((im) => im.uri !== undefined && !String(im.uri).startsWith('data:'));
    add('every texture is embedded', external.length === 0,
      external.length ? `${external.map((im) => im.uri).join(', ')} would have to be fetched`
        : `${images} images, ${textures} textures, ${mats.length} materials`);
  } else {
    add('no textures', images === 0 && textures === 0 && textured === 0,
      `${images} images, ${textures} textures, ${textured} textured materials`);
  }
  add('vertex or flat colour on every primitive', colourless.length === 0,
    colourless.length ? colourless.join(', ') : `${mats.length} materials`);

  // clips: present, named right, and the right length
  const anims = json.animations || [];
  const durations = {};
  for (const a of anims) {
    let end = 0;
    for (const s of a.samplers) {
      const acc = json.accessors[s.input];
      let max = acc.max ? acc.max[0] : null;
      if (max === null && bin) {
        const rows = readAccessor(json, bin, s.input);
        max = rows.length ? rows[rows.length - 1][0] : 0;
      }
      end = Math.max(end, max || 0);
    }
    durations[a.name] = end;
  }
  stats.clips = durations;

  // Where the motion lives outside the file, the clip check reads the bank and
  // the glb is only asked to carry its hold clip. Everything after this point
  // works off `source`, which is the bank's durations or the file's.
  let source = durations;
  if (spec.bank) {
    const bank = readBank(spec.bank);
    stats.bank = spec.bank;
    if (!bank) {
      add('the clip bank is on disk', false, `public/animations/${spec.bank} is missing`);
      source = {};
    } else if (bank.broken) {
      add('the clip bank is on disk', false, `${spec.bank} will not parse: ${bank.broken}`);
      source = {};
    } else {
      source = bank.durations;
      stats.bankBytes = bank.bytes;
      stats.bankClips = bank.clipNames.length;
      add('the clip bank is on disk', true,
        `${spec.bank}, ${bank.clipNames.length} clips, ${Object.keys(bank.moves).length} moves, ${(bank.bytes / 1024).toFixed(0)} KB`);
      add('the bank is version 1, 30 fps, and says which body it is for',
        bank.version === 1 && Number(bank.fps) > 0 && bank.body === name,
        `version ${bank.version}, ${bank.fps} fps, body ${bank.body}`);
      const clipNames = new Set(bank.clipNames);
      const unbacked = Object.keys(bank.moves).filter((m) => !clipNames.has(m));
      add('every move in the bank has a clip behind it', unbacked.length === 0,
        unbacked.length ? `${unbacked.join(', ')} name no clip` : `${clipNames.size} clips`);
      const glbClips = Object.keys(durations);
      add('the glb itself carries a hold clip and nothing that shadows the bank',
        glbClips.every((c) => !(c in bank.durations)),
        glbClips.length ? glbClips.join(', ') : 'no clips in the glb');
    }
  }

  const missing = Object.keys(spec.clips).filter((c) => !(c in source));
  // A bank may carry more than the contract asks for; a Blender model may not,
  // because an unexpected clip there means a rename went half way.
  const extra = spec.minClips ? [] : Object.keys(source).filter((c) => !(c in spec.clips));
  add('every clip present', missing.length === 0 && extra.length === 0,
    missing.length || extra.length ? `missing ${missing.join(',') || 'none'}; unexpected ${extra.join(',') || 'none'}` : Object.keys(source).join(', '));
  const offSpec = [];
  for (const [clip, want] of Object.entries(spec.clips)) {
    const got = source[clip];
    if (got === undefined) { offSpec.push(`${clip} absent`); continue; }
    if (spec.minClips ? got < want : Math.abs(got - want) > want * DURATION_TOLERANCE) {
      offSpec.push(`${clip} ${got.toFixed(3)}s want ${spec.minClips ? 'at least ' : ''}${want}s`);
    }
  }
  add(spec.minClips ? 'no clip is shorter than its floor' : `clip durations within ${DURATION_TOLERANCE * 100}%`,
    offSpec.length === 0,
    offSpec.length ? offSpec.join('; ') : Object.entries(source).map(([k, v]) => `${k} ${v.toFixed(2)}s`).join(', '));

  // the bind pose bounding box, through every node transform on the way
  const world = new Array((json.nodes || []).length).fill(null);
  const walk = (i, parent) => {
    const n = json.nodes[i];
    world[i] = mul(trs(n), parent);
    for (const c of n.children || []) walk(c, world[i]);
  };
  const roots = new Set((json.nodes || []).map((_, i) => i));
  for (const n of json.nodes || []) for (const c of n.children || []) roots.delete(c);
  for (const r of roots) walk(r, IDENTITY);
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < (json.nodes || []).length; i++) {
    const n = json.nodes[i];
    if (n.mesh === undefined) continue;
    for (const p of json.meshes[n.mesh].primitives) {
      const acc = json.accessors[p.attributes.POSITION];
      const [ax, ay, az] = acc.min, [bx, by, bz] = acc.max;
      for (const corner of [[ax, ay, az], [bx, ay, az], [ax, by, az], [bx, by, az],
        [ax, ay, bz], [bx, ay, bz], [ax, by, bz], [bx, by, bz]]) {
        const w = apply(world[i] || IDENTITY, corner);
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], w[k]);
          hi[k] = Math.max(hi[k], w[k]);
        }
      }
    }
  }
  const dims = { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2] };
  stats.bounds = { min: lo, max: hi, size: [dims.x, dims.y, dims.z] };
  const got = dims[spec.axis];
  add(`${spec.axis} extent within ${SIZE_TOLERANCE * 100}% of ${spec.size} m`,
    Math.abs(got - spec.size) <= spec.size * SIZE_TOLERANCE,
    `${got.toFixed(3)} m (x ${dims.x.toFixed(2)} y ${dims.y.toFixed(2)} z ${dims.z.toFixed(2)})`);
  add(`bind pose stands on y = 0 within ${GROUND_TOLERANCE} m`, Math.abs(lo[1]) <= GROUND_TOLERANCE,
    `min y ${lo[1].toFixed(4)}`);

  stats.bytes = buf.length;
  const budget = spec.bytes || 300 * 1024;
  add(`under ${(budget / 1024).toFixed(0)} KB`, buf.length < budget, `${(buf.length / 1024).toFixed(0)} KB`);
  return { name, ok: checks.every((c) => c.ok), checks, stats };
}

export function validateFile(path, spec) {
  const name = basename(path, '.glb');
  return validateBuffer(readFileSync(path), spec || SPECS[name], name);
}

export function validateAll(dir = MODEL_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.glb')).sort();
  const results = files.map((f) => validateFile(join(dir, f)));
  const unknown = files.map((f) => basename(f, '.glb')).filter((n) => !SPECS[n]);
  const absent = Object.keys(SPECS).filter((n) => !files.includes(n + '.glb'));
  // A Blender model that is not on disk is a build that broke. A studio body
  // that is not on disk has not been delivered yet, which is a different thing
  // and is reported as its own list rather than as a failure.
  const expected = absent.filter((n) => !SPECS[n].studio);
  const pending = absent.filter((n) => SPECS[n].studio);
  return { results, unknown, expected, pending };
}

export function main(argv = []) {
  const quiet = argv.includes('--quiet');
  const { results, unknown, expected, pending } = validateAll();
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    if (!quiet) {
      console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(18)} ${r.stats.triangles} tris, ${r.stats.bones} bones, ${(r.stats.bytes / 1024).toFixed(0)} KB`);
      for (const c of r.checks) if (!c.ok || argv.includes('--verbose')) console.log(`      ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`);
    }
  }
  if (expected.length) {
    failed++;
    console.log(`FAIL missing files: ${expected.join(', ')}`);
  }
  if (pending.length) console.log(`note: ${pending.join(', ')} have a spec but have not been delivered yet`);
  if (unknown.length) console.log(`note: no spec for ${unknown.join(', ')}, not checked`);
  // No timestamp. validation.json is committed, and a date in it would make
  // the file dirty on every run; without one, a dirty validation.json means
  // the models themselves changed, which is worth noticing.
  const out = {
    tolerances: { duration: DURATION_TOLERANCE, size: SIZE_TOLERANCE, groundMetres: GROUND_TOLERANCE },
    models: results,
    missing: expected,
    pending,
    unspecified: unknown,
    ok: failed === 0,
  };
  writeFileSync(join(MODEL_DIR, 'validation.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`${results.length - failed}/${results.length} models pass, validation.json written`);
  return failed === 0;
}

if (process.argv[1] && process.argv[1].endsWith('validate-glb.mjs')) {
  process.exit(main(process.argv.slice(2)) ? 0 : 1);
}
