// Hand cut ground: the list of strokes a person made, and what they do to the
// height at a point. Pure, no THREE, runs in node.
//
//   const edits = createTerrainEdits({ baseHeight });
//   edits.stroke({ kind: 'raise', x: 749, z: 1579, r: 12, amount: 2 });
//   edits.heightDelta(x, z, h)     metres to add to the ground at (x, z)
//   edits.groundOverride(x, z)     'dirt' | 'rock' | 'sand' | 'grass' | 'mud' | null
//
// The world field is a function of the seed and nothing else, and it stays that
// way: this is a SECOND function, laid over it, that is a function of a list a
// person wrote. `field.setTerrainEdits(edits)` is the only join between the two,
// and a field with no edits set is bit for bit the field that shipped.
//
// ---- why every profile is a smooth function of distance ---------------------
//
// The ground is meshed in 64 m chunks at three resolutions, and two chunks that
// share a vertex must agree about it to the last bit or the seam shows as a
// crack of sky. Nothing in here reads a chunk, a vertex, a tier or a neighbour:
// a stroke's contribution at (x, z) depends on (x, z), on the stroke, and on the
// ground height passed in. So the same point gets the same answer from either
// side of any border, at any resolution, in any order of building.
//
// Every profile also has ZERO SLOPE at its own rim, so the join with the world
// outside it is C1 and not a ridge. `(1 - t^2)^2` and `smoothstep` are the only
// two shapes used, for exactly that reason.
//
// ---- the eight kinds --------------------------------------------------------
//
//   raise     a dome, `amount` metres at the centre, 0 at r
//   lower     the same, down
//   flatten   pulls the ground to the height the centre had when the stroke was
//             made: full inside r/2, feathered to nothing at r
//   smooth    pulls the ground a fraction of the way toward the average of a
//             ring at 1.5 r, taken once, when the stroke was made
//   pit       a flat floor `amount` metres down, a wall steeper than a roof, and
//             a lip that meets the hillside with no step in it
//   cliff     a step of `amount` metres across the line through the stroke: the
//             side the yaw points at goes up, the other side is not touched
//   cave      a cut into the hillside in front of the mouth, and a marker that
//             `field.js` turns into a cave site you can walk into
//   ground    no height at all: the word the ground is made of, inside r, which
//             grass and dressing read to keep off it
//
// ---- what a stroke has to carry --------------------------------------------
//
// Three kinds cannot be worked out from (x, z) alone. `flatten` needs the height
// it is flattening to and `smooth` needs the ring average, so `stroke()` asks
// the `baseHeight` sampler for them ONCE, at the moment the stroke is made, and
// writes the answer into the stroke as `h0`. `cliff` and `cave` need a bearing,
// which the caller supplies as `yaw` (world bearing: +x is sin, +z is cos, the
// same convention `site.facing` uses in field.js). A stroke with no yaw is
// treated as yaw 0, which is a step facing +z.
//
// That is also why the list serialises: `h0` is IN the stroke, so a saved file
// lays the same ground back down on a machine that never took the sample.

/** The eight things a stroke can be. */
export const STROKE_KINDS = ['raise', 'lower', 'flatten', 'smooth', 'pit', 'cliff', 'cave', 'ground'];
/** The words `ground` may paint. Anything else is refused. */
export const GROUND_WORDS = ['dirt', 'rock', 'sand', 'grass', 'mud'];
/** Metres of a stroke's radius under which nothing is worth drawing. */
export const MIN_R = 0.5;
/** The steepest wall a pit may cut, in metres of fall per metre of ground. */
export const MAX_WALL_GRADE = 6;
/**
 * How much of a pit's radius is flat floor, when the wall does not need more.
 *
 * 0.7 and not 0.5, and it is the difference between a hollow and a bowl: at 0.5
 * a three metre pit in a nine metre radius came out at exactly 1.0 m per metre,
 * which is a hillside you can run up. At 0.7 the same pit stands at 1.67, which
 * is 59 degrees, and the floor is a floor out to 6.3 m of the 9.
 */
export const PIT_FLOOR = 0.7;
/** How deep the cut in front of a cave mouth is, in metres. */
export const CAVE_CUT = 2.0;
/** How far in front of the mouth the centre of that cut stands, as a fraction of r. */
export const CAVE_CUT_AHEAD = 0.3;
/** How much of the way a `smooth` stroke pulls, when it is not told. */
export const SMOOTH_PULL = 0.6;
/** The ring a `smooth` stroke averages over, as a multiple of its own radius. */
export const SMOOTH_RING = 1.5;
/** Metres of the spatial index's cell. A stroke goes into every cell it touches. */
export const GRID = 32;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function smoothstep(e0, e1, v) {
  const t = clamp01((v - e0) / (e1 - e0 || 1e-9));
  return t * t * (3 - 2 * t);
}
/** 1 at the centre, 0 at the rim, flat at both ends: the dome every raise uses. */
export function dome(t) {
  if (t >= 1) return 0;
  const u = 1 - t * t;
  return u * u;
}
/** 1 out to `hold` of the radius, 0 at it, smooth between. */
const plateau = (t, hold) => 1 - smoothstep(hold, 1, t);

/**
 * The floor, the wall and the lip of a pit, as a fraction of its depth.
 *
 * The wall starts at `t0`, and `t0` is not always 0.5: a deep pit in a small
 * radius would cut a wall the mesher cannot show (over 8 m per metre it is a
 * hole in the world rather than a hollow), so the wall is WIDENED until its
 * steepest metre is inside MAX_WALL_GRADE. `wallStart` says where that is, and
 * `stroke()` reports it, so a pit that had to be widened says so out loud.
 */
export function wallStart(amount, r) {
  const want = Math.abs(amount) * 1.5 / MAX_WALL_GRADE;      // metres of run the wall needs
  const t0 = 1 - want / Math.max(MIN_R, r);
  return Math.max(0.05, Math.min(PIT_FLOOR, t0));
}
export function pitProfile(t, amount, r) {
  const t0 = wallStart(amount, r);
  return 1 - smoothstep(t0, 1, t);
}

/**
 * The steepest metre a stroke cuts anywhere, in metres of rise per metre.
 *
 * Analytic, not probed: every profile in this file has a derivative anyone can
 * write down, and the words a stroke reports quote this so a user cutting a
 * four metre pit in a three metre radius is told it is a hole and not a hollow.
 * `terrain_edits.test.mjs` measures each one against the real profile.
 *
 *   dome      a(1 - t^2)^2, steepest at t = 1/sqrt(3): 8a / (3 sqrt(3) r)
 *   smoothstep  steepest in the middle of its own run: 1.5 * rise / run
 */
export function maxGrade(s) {
  const r = Math.max(MIN_R, s.r || 0), a = Math.abs(s.amount || 0);
  switch (s.kind) {
    case 'raise': case 'lower': return 8 * a / (3 * Math.sqrt(3) * r);
    // A flatten and a smooth cut whatever the ground was already doing, and
    // this function is not given the ground. Null, rather than a number taken
    // from the wrong variable.
    case 'flatten': case 'smooth': return null;
    case 'pit': return 1.5 * a / ((1 - wallStart(a, r)) * r);
    case 'cliff': return 1.5 * a / (2 * Math.max(0.25, a / 4));
    case 'cave': {
      const cut = s.cut == null ? CAVE_CUT : s.cut;
      return 1.5 * cut / ((1 - wallStart(cut, r)) * r);
    }
    default: return 0;
  }
}

/** Where a stroke reaches, in metres from its own centre. */
export function reachOf(s) {
  const r = Math.max(MIN_R, s.r || 0);
  if (s.kind === 'cave') return r * (1 + CAVE_CUT_AHEAD);
  return r;
}

/**
 * One stroke's contribution at (x, z), given the ground height there.
 *
 * `h` is the height the world has ALREADY, including every stroke made before
 * this one, which is what makes `flatten` on top of `raise` flatten the raised
 * ground rather than the hillside under it.
 */
export function deltaOf(s, x, z, h) {
  const r = Math.max(MIN_R, s.r || 0);
  const a = s.amount || 0;
  if (s.kind === 'ground') return 0;
  if (s.kind === 'cave') {
    // the cut stands in front of the mouth, on the mouth's own bearing
    const yaw = s.yaw || 0;
    const cx = s.x + Math.sin(yaw) * r * CAVE_CUT_AHEAD;
    const cz = s.z + Math.cos(yaw) * r * CAVE_CUT_AHEAD;
    const d = Math.hypot(x - cx, z - cz);
    if (d >= r) return 0;
    const cut = s.cut == null ? CAVE_CUT : s.cut;
    return -cut * pitProfile(d / r, cut, r);
  }
  const dx = x - s.x, dz = z - s.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return 0;
  const t = Math.sqrt(d2) / r;
  switch (s.kind) {
    case 'raise': return a * dome(t);
    case 'lower': return -a * dome(t);
    case 'pit': return -Math.abs(a) * pitProfile(t, a, r);
    case 'flatten': {
      const h0 = s.h0;
      if (h0 == null) return 0;
      return (h0 - h) * plateau(t, 0.5);
    }
    case 'smooth': {
      const h0 = s.h0;
      if (h0 == null) return 0;
      const pull = s.amount == null ? SMOOTH_PULL : clamp01(Math.abs(s.amount));
      return (h0 - h) * dome(t) * pull;
    }
    case 'cliff': {
      const yaw = s.yaw || 0;
      // metres along the yaw, so the side the bearing points at is the high side
      const u = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const b = Math.max(0.25, Math.abs(a) / 4);       // half the run of the step
      return a * smoothstep(-b, b, u) * plateau(t, 0.6);
    }
    default: return 0;
  }
}

/**
 * The stroke list.
 *
 * `baseHeight(x, z)` is the ground as it stands NOW, edits and all. It is asked
 * only by `stroke()`, only for `flatten` and `smooth`, and only when the stroke
 * does not already carry its own `h0` (a loaded file does).
 */
export function createTerrainEdits(opts = {}) {
  const baseHeight = typeof opts.baseHeight === 'function' ? opts.baseHeight : null;
  const strokes = [];
  const undone = [];
  let nextId = 1;
  let version = 0;
  // key -> array of strokes touching that cell, in the order they were made
  let index = null;

  // A HASH, not a coordinate, and a collision is safe by construction: two
  // cells that land on the same key share one list, so a lookup can only ever
  // see MORE strokes than it should, and every one of those answers 0 outside
  // its own radius. A stroke can never go missing, because it is put in and
  // looked up with the same function. `terrain_edits.test.mjs` checks the
  // indexed answer against a walk of all 2,000 strokes at 400 points.
  const cellKey = (ix, iz) => ix * 73856093 ^ iz * 19349663;

  function reindex() {
    index = new Map();
    for (const s of strokes) put(s);
  }
  function put(s) {
    const reach = reachOf(s);
    const i0 = Math.floor((s.x - reach) / GRID), i1 = Math.floor((s.x + reach) / GRID);
    const j0 = Math.floor((s.z - reach) / GRID), j1 = Math.floor((s.z + reach) / GRID);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = cellKey(i, j);
        const list = index.get(k);
        if (list) list.push(s); else index.set(k, [s]);
      }
    }
  }
  function at(x, z) {
    if (!index) reindex();
    return index.get(cellKey(Math.floor(x / GRID), Math.floor(z / GRID))) || null;
  }
  const mark = () => { api.live = strokes.length > 0; };
  const touch = () => { version++; index = null; mark(); };

  /** A stroke, cleaned up, with its captured samples taken. Throws on nonsense. */
  function makeStroke(input) {
    const s = { ...input };
    if (!STROKE_KINDS.includes(s.kind)) throw new Error(`no such stroke kind: ${s.kind}`);
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) throw new Error('a stroke needs x and z');
    s.r = Math.max(MIN_R, Number.isFinite(s.r) ? s.r : 8);
    if (!Number.isFinite(s.amount)) s.amount = s.kind === 'smooth' ? SMOOTH_PULL : 1;
    if (s.yaw != null && !Number.isFinite(s.yaw)) s.yaw = 0;
    if (s.kind === 'ground') {
      s.word = s.word || s.ground || 'dirt';
      if (!GROUND_WORDS.includes(s.word)) throw new Error(`no such ground: ${s.word}, try ${GROUND_WORDS.join(', ')}`);
    }
    if ((s.kind === 'flatten' || s.kind === 'smooth') && s.h0 == null) {
      if (!baseHeight) throw new Error(`a ${s.kind} stroke needs a baseHeight sampler or its own h0`);
      s.h0 = s.kind === 'flatten' ? baseHeight(s.x, s.z) : ringAverage(s);
    }
    if (s.id == null) s.id = nextId++;
    else nextId = Math.max(nextId, (s.id | 0) + 1);
    return s;
  }

  /** The average height of a ring at SMOOTH_RING radii out, taken once. */
  function ringAverage(s) {
    const rr = s.r * SMOOTH_RING;
    let sum = 0, n = 0;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      sum += baseHeight(s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr); n++;
    }
    sum += baseHeight(s.x, s.z); n++;
    return sum / n;
  }

  const api = {
    /**
     * A PLAIN BOOLEAN, and the reason it is not `count > 0`.
     *
     * `field.sampleAt` asks this on every vertex of every chunk of the world,
     * so the ordinary case (nobody has cut anything) has to be a property read
     * and not a call. Measured over 200,000 samples: asking `heightDelta` and
     * `groundOverride` on an empty list cost 5.2% of sampleAt, this costs 1.3%.
     * Kept true by `mark()` on every path that can change the list.
     */
    live: false,
    get strokes() { return strokes; },
    get version() { return version; },
    /** How many strokes are on the ground, and how many are waiting to come back. */
    get count() { return strokes.length; },
    get undoneCount() { return undone.length; },

    /** Lay a stroke down. Returns the stroke as it was stored. */
    stroke(input) {
      const s = makeStroke(input);
      strokes.push(s);
      undone.length = 0;                 // a new stroke is a new future
      if (index) put(s);                 // one stroke into a live index, not a rebuild
      version++;
      mark();
      return s;
    },

    /** Take the last stroke back. Returns it, or null if there was none. */
    undo() {
      const s = strokes.pop();
      if (!s) return null;
      undone.push(s);
      touch();
      return s;
    },

    /** Put the last undone stroke back. Returns it, or null. */
    redo() {
      const s = undone.pop();
      if (!s) return null;
      strokes.push(s);
      touch();
      return s;
    },

    /**
     * Metres to add to the ground at (x, z).
     *
     * `h` is the world's own height there, which `flatten` and `smooth` need.
     * `skipKind` drops one kind out of the answer, which is how field.js asks
     * which way a hillside falls without the cave's own cut in the way.
     */
    heightDelta(x, z, h = 0, skipKind = null) {
      if (!strokes.length) return 0;
      const list = at(x, z);
      if (!list) return 0;
      let cur = h;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (skipKind && s.kind === skipKind) continue;
        cur += deltaOf(s, x, z, cur);
      }
      return cur - h;
    },

    /** The word painted here, or null. The last stroke over a point wins. */
    groundOverride(x, z) {
      if (!strokes.length) return null;
      const list = at(x, z);
      if (!list) return null;
      let word = null;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (s.kind !== 'ground') continue;
        const dx = x - s.x, dz = z - s.z;
        if (dx * dx + dz * dz < s.r * s.r) word = s.word;
      }
      return word;
    },

    /** Every cave mouth asked for, in the order they were cut. */
    caves() { return strokes.filter((s) => s.kind === 'cave'); },

    /** The box every stroke fits inside, or null if there are none. */
    bounds() {
      if (!strokes.length) return null;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const s of strokes) {
        const reach = reachOf(s);
        x0 = Math.min(x0, s.x - reach); x1 = Math.max(x1, s.x + reach);
        z0 = Math.min(z0, s.z - reach); z1 = Math.max(z1, s.z + reach);
      }
      return { x0, z0, x1, z1 };
    },

    /** The file. Plain JSON, no functions, no undo history. */
    serialize() {
      return { v: 1, strokes: strokes.map((s) => ({ ...s })) };
    },

    /**
     * Take a file as the whole truth. Accepts what `serialize` wrote, or a bare
     * array of strokes. Returns how many were laid down.
     */
    load(json) {
      const rows = Array.isArray(json) ? json : (json && Array.isArray(json.strokes) ? json.strokes : []);
      strokes.length = 0; undone.length = 0; nextId = 1;
      for (const row of rows) {
        try { strokes.push(makeStroke(row)); } catch (err) { console.warn('a stroke would not load', row, err.message); }
      }
      touch();
      return strokes.length;
    },

    /** Everything gone, as if the field had never been touched. */
    clear() { strokes.length = 0; undone.length = 0; touch(); return true; },
  };
  return api;
}
