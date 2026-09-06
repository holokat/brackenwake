// The space being edited, and the stack of everything done to it.
//
// PURE. No THREE, no DOM, no fetch. `editor.test.mjs` drives this file
// directly, which is the whole reason it is a file: an undo that only works
// when a renderer is up is an undo nobody can prove.
//
// HOW A THING IS ADDRESSED. A space is eight plain arrays and an entry is its
// position in one of them: `{ list: 'pieces', index: 3 }`. There is no id on an
// entry, because an id would have to be written into the JSON and the JSON is
// the space file the game loads, not the editor's scratch pad. A delete
// therefore MOVES everything after it, and the stack knows that: a delete
// remembers the index it removed from and puts the entry back at exactly that
// index, so undoing a delete restores the order and not just the contents.
//
// THREE COMMANDS AND NO MORE. Everything the editor does is one of:
//
//   place    splice one entry in at an index
//   remove   splice one entry out of an index
//   patch    write fields onto an entry, remembering what was there
//
// Move, rotate and scale are all patches. That is why undo and redo can be
// proved by driving the three, in order and in reverse, rather than by driving
// nine buttons and hoping.

/** The eight lists a space carries, in the order the editor lists them. */
export const LISTS = ['pieces', 'runs', 'areas', 'trees', 'rocks', 'markers', 'people', 'spawns'];

/** What one of them is called, singular, when a line has to say it. */
export const LIST_WORD = {
  pieces: 'piece', runs: 'run', areas: 'area', trees: 'tree',
  rocks: 'rock', markers: 'marker', people: 'person', spawns: 'spawn',
};

/** How far one press of R turns a thing, in degrees. */
export const TURN_DEG = 15;
/** What one press of a bracket does to a scale. */
export const SCALE_STEP = 1.1;
/** How small and how large a thing may be scaled. */
export const SCALE_MIN = 0.2;
export const SCALE_MAX = 6;

const round2 = (v) => Math.round(v * 100) / 100;
const wrapDeg = (d) => ((d % 360) + 360) % 360;

/** What one entry is called in a list, in words a person can find it by. */
export function labelOf(list, entry) {
  if (!entry) return 'nothing';
  switch (list) {
    case 'pieces': return entry.model;
    case 'runs': return `a run of ${entry.model}`;
    case 'areas': return `${entry.kind} ground`;
    case 'trees': return entry.species;
    case 'rocks': return entry.kind;
    case 'markers': return `"${entry.label}"`;
    case 'people': return entry.name ? `${entry.name} the ${entry.role}` : entry.role;
    case 'spawns': return entry.night ? `${entry.id} after dark` : entry.id;
    default: return list;
  }
}

/** Where an entry stands, in the space's own frame. A run has two ends. */
export function pointOf(list, entry) {
  if (!entry) return null;
  if (list === 'runs') return { x: (entry.from.x + entry.to.x) / 2, z: (entry.from.z + entry.to.z) / 2 };
  if (list === 'areas') {
    const pts = entry.points || [];
    if (!pts.length) return null;
    let x = 0, z = 0;
    for (const p of pts) { x += p[0]; z += p[1]; }
    return { x: x / pts.length, z: z / pts.length };
  }
  return { x: entry.x, z: entry.z };
}

/**
 * The document. `space` is the space object itself and is mutated in place, so
 * `doc.space` is always what would be written to disk this second.
 */
export function createSpaceDoc(space) {
  const done = [];      // commands applied, oldest first
  const undone = [];    // commands taken back, newest first
  let selection = null;

  const listOf = (name) => {
    if (!LISTS.includes(name)) return null;
    if (!Array.isArray(space[name])) space[name] = [];
    return space[name];
  };

  const at = (sel) => {
    if (!sel) return null;
    const l = listOf(sel.list);
    return l && sel.index >= 0 && sel.index < l.length ? l[sel.index] : null;
  };

  function run(cmd, forward) {
    const l = listOf(cmd.list);
    if (!l) return false;
    if (cmd.kind === 'place') {
      if (forward) l.splice(cmd.index, 0, cmd.entry);
      else l.splice(cmd.index, 1);
    } else if (cmd.kind === 'remove') {
      if (forward) l.splice(cmd.index, 1);
      else l.splice(cmd.index, 0, cmd.entry);
    } else if (cmd.kind === 'patch') {
      const e = l[cmd.index];
      if (!e) return false;
      Object.assign(e, forward ? cmd.after : cmd.before);
    } else return false;
    return true;
  }

  function push(cmd) {
    if (!run(cmd, true)) return null;
    done.push(cmd);
    undone.length = 0;
    return cmd;
  }

  /** Put a new entry at the end of its list. Answers the selection for it. */
  function place(list, entry, words) {
    const l = listOf(list);
    if (!l) return { ok: false, text: `there is no list called "${list}"` };
    const cmd = push({ kind: 'place', list, index: l.length, entry, words: words || `${labelOf(list, entry)} is down.` });
    if (!cmd) return { ok: false, text: 'that went nowhere' };
    selection = { list, index: cmd.index };
    return { ok: true, sel: { ...selection }, entry, text: cmd.words };
  }

  /** Take one entry out. */
  function remove(sel) {
    const e = at(sel);
    if (!e) return { ok: false, text: 'nothing is selected, so nothing was removed' };
    const words = `${labelOf(sel.list, e)} is gone.`;
    push({ kind: 'remove', list: sel.list, index: sel.index, entry: e, words });
    if (selection && selection.list === sel.list && selection.index >= sel.index) selection = null;
    return { ok: true, text: words, entry: e };
  }

  /** Write fields onto one entry, remembering what they were. */
  function patch(sel, after, words) {
    const e = at(sel);
    if (!e) return { ok: false, text: 'nothing is selected, so nothing changed' };
    const before = {};
    for (const k of Object.keys(after)) before[k] = e[k];
    const same = Object.keys(after).every((k) => JSON.stringify(before[k]) === JSON.stringify(after[k]));
    if (same) return { ok: false, text: 'that would change nothing, so nothing was written' };
    push({ kind: 'patch', list: sel.list, index: sel.index, before, after, words: words || `${labelOf(sel.list, e)} changed.` });
    return { ok: true, text: words || `${labelOf(sel.list, e)} changed.`, entry: e };
  }

  /** Move one entry to a point in the space's own frame. */
  function move(sel, x, z) {
    const e = at(sel);
    if (!e) return { ok: false, text: 'nothing is selected, so nothing moved' };
    const nx = round2(x), nz = round2(z);
    if (sel.list === 'runs') {
      const mid = pointOf('runs', e);
      const dx = nx - mid.x, dz = nz - mid.z;
      return patch(sel, {
        from: { x: round2(e.from.x + dx), z: round2(e.from.z + dz) },
        to: { x: round2(e.to.x + dx), z: round2(e.to.z + dz) },
      }, `the run of ${e.model} moves to ${nx}, ${nz}.`);
    }
    if (sel.list === 'areas') {
      const mid = pointOf('areas', e);
      const dx = nx - mid.x, dz = nz - mid.z;
      return patch(sel, { points: e.points.map(([px, pz]) => [round2(px + dx), round2(pz + dz)]) },
        `the ${e.kind} ground moves to ${nx}, ${nz}.`);
    }
    return patch(sel, { x: nx, z: nz }, `${labelOf(sel.list, e)} moves to ${nx}, ${nz}.`);
  }

  /** Turn one entry. Degrees, clockwise from north, the way the files write it. */
  function rotate(sel, deg = TURN_DEG) {
    const e = at(sel);
    if (!e) return { ok: false, text: 'nothing is selected, so nothing turned' };
    if (!('yaw' in e)) return { ok: false, text: `${labelOf(sel.list, e)} has no facing to turn` };
    const yaw = round2(wrapDeg((e.yaw || 0) + deg));
    return patch(sel, { yaw }, `${labelOf(sel.list, e)} turns ${deg > 0 ? 'right' : 'left'} to ${yaw} degrees.`);
  }

  /** Grow or shrink one entry, clamped so nothing becomes a speck or a mountain. */
  function scale(sel, mul = SCALE_STEP) {
    const e = at(sel);
    if (!e) return { ok: false, text: 'nothing is selected, so nothing was scaled' };
    if (sel.list === 'markers' || sel.list === 'people' || sel.list === 'spawns' || sel.list === 'areas') {
      return { ok: false, text: `a ${LIST_WORD[sel.list]} has no size to change` };
    }
    const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, round2((e.scale ?? 1) * mul)));
    if (next === (e.scale ?? 1)) {
      return { ok: false, text: `${labelOf(sel.list, e)} is already at ${next > 1 ? 'the largest' : 'the smallest'} it may be, ${next}.` };
    }
    return patch(sel, { scale: next }, `${labelOf(sel.list, e)} is now ${next} times its own size.`);
  }

  function undo() {
    const cmd = done.pop();
    if (!cmd) return { ok: false, text: 'there is nothing to undo' };
    run(cmd, false);
    undone.push(cmd);
    selection = null;
    return { ok: true, cmd, text: `undone: ${cmd.words}` };
  }

  function redo() {
    const cmd = undone.pop();
    if (!cmd) return { ok: false, text: 'there is nothing to redo' };
    run(cmd, true);
    done.push(cmd);
    return { ok: true, cmd, text: `again: ${cmd.words}` };
  }

  /** Every entry in the space, in list order, for the panel's list. */
  function contents() {
    const out = [];
    for (const list of LISTS) {
      (space[list] || []).forEach((entry, index) => {
        const p = pointOf(list, entry);
        out.push({ list, index, entry, label: labelOf(list, entry), x: p ? p.x : null, z: p ? p.z : null });
      });
    }
    return out;
  }

  /** How many things stand in this space. */
  function count() {
    const out = {};
    let total = 0;
    for (const list of LISTS) { out[list] = (space[list] || []).length; total += out[list]; }
    out.total = total;
    return out;
  }

  return {
    get space() { return space; },
    get selection() { return selection ? { ...selection } : null; },
    select(sel) { selection = at(sel) ? { ...sel } : null; return selection; },
    at,
    place, remove, patch, move, rotate, scale,
    undo, redo,
    get canUndo() { return done.length > 0; },
    get canRedo() { return undone.length > 0; },
    get depth() { return done.length; },
    get history() { return done.map((c) => c.words); },
    contents, count,
    /** Exactly what would be written to disk. */
    toJSON() { return JSON.parse(JSON.stringify(space)); },
  };
}
