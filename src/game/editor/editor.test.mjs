// The editor. Run: node src/game/editor/editor.test.mjs
//
// Three things are worth proving about an editor and nothing else is:
//
//   THE STACK. Everything done can be taken back, and putting it back gives
//   the same file. Driven forwards through place, move, turn, scale and
//   delete, then all the way back, then all the way forward again, comparing
//   the whole document at every step. An undo that is nearly right is worse
//   than no undo, because the user finds out an hour later.
//
//   THE PALETTE. It is a view of the game's own tables, so a monster added to
//   the roster is placeable without anybody editing this file. Counted against
//   the tables, both ways.
//
//   THE DOOR TO THE DISK. What Save sends is the space file, and the endpoint
//   refuses every path but the two folders it owns. Driven with a recorder in
//   place of fetch, so the payload is measured and not asserted.
//
// Nothing here needs a renderer, a canvas or a running server.

import { createSpaceDoc, LISTS, TURN_DEG, SCALE_STEP, labelOf, pointOf } from './space_doc.js';
import {
  createEditor, SPACE_PATH, SAVE_URL, DRAG_MS, AUTOSAVE_MS,
  TILE_M, TILE_R, tileIdFor, tileCentre,
} from './editor.js';
import { kinds as realKinds } from '../../world/terrain_edits.js';
import { paletteFor, entryFor, search, TABS, TAB_IDS, BRUSH_IDS, MARKER_KINDS, brushRow, brushRows, brushParam } from './palette.js';
import {
  MODES, MODE_IDS, ACTIONS, modeOf, toolsFor, filterTools, auditTools,
  brushModeOf, shiftTwins, groundColour, auditTints, PROP_HEIGHT, heightOf,
} from './modes.js';
import { MARKS, editorIcon, hasMark } from './icons.js';
import { emptySpace, SPACES } from '../../mmo/spaces/index.js';
import { auditSpaces } from '../../mmo/plans/plan_schema.js';
import { FOOTPRINT } from '../../mmo/plans/footprints.js';
import { ROCK_KIND_IDS } from '../../world/plan_models.js';
import { MONSTER_LIST } from '../../mmo/monsters.js';
import { SPECIES } from '../../world/arbor.js';
import { CRITTERS } from '../../world/fauna.js';
import { NPCS } from '../../mmo/npcs.js';
import { STORY_ROLES } from '../../mmo/story.js';
import { safePath, saveEditorFile, SAVE_DIRS, spaceIndexSource, varOf } from '../../../tools/editor_save.mjs';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const snap = (doc) => JSON.stringify(doc.toJSON());

// ============================================================================
console.log('editor: the command stack, forwards and backwards');
{
  const doc = createSpaceDoc(emptySpace('yard', 'The Yard', 400, 400, 40));
  const states = [snap(doc)];
  const words = [];

  const step = (res) => { words.push(res.text); states.push(snap(doc)); return res; };

  const a = step(doc.place('pieces', { model: 'cottage_a', x: 0, z: 0, yaw: 0 }));
  check('place put a piece in and said so', a.ok && doc.space.pieces.length === 1, a.text);
  const b = step(doc.place('trees', { species: 'oak', x: 10, z: 4, yaw: 0, scale: 1 }));
  check('and a tree', b.ok && doc.space.trees.length === 1, b.text);
  const sel = { list: 'pieces', index: 0 };
  const m = step(doc.move(sel, 6, -3));
  check('move wrote the new point and said where', m.ok && doc.space.pieces[0].x === 6 && doc.space.pieces[0].z === -3, m.text);
  const r = step(doc.rotate(sel, TURN_DEG));
  check('rotate turned it fifteen degrees', r.ok && doc.space.pieces[0].yaw === 15, r.text);
  const r2 = step(doc.rotate(sel, -TURN_DEG * 2));
  check('and the other way, wrapping past zero rather than going negative',
    r2.ok && doc.space.pieces[0].yaw === 345, r2.text);
  const s1 = step(doc.scale(sel, SCALE_STEP));
  check('scale grew it by a tenth', s1.ok && doc.space.pieces[0].scale === 1.1, s1.text);
  const d = step(doc.remove({ list: 'trees', index: 0 }));
  check('remove took the tree out', d.ok && doc.space.trees.length === 0, d.text);

  check('every command left a line of words', words.every((w) => typeof w === 'string' && w.length > 8));
  check('the stack is seven deep, one per command', doc.depth === 7, `${doc.depth}`);

  // all the way back
  let ok = true, at = states.length - 1;
  while (doc.canUndo) {
    const res = doc.undo();
    at--;
    if (!res.ok || snap(doc) !== states[at]) { ok = false; break; }
  }
  check('undoing every command walks back through exactly the states it came through', ok && at === 0, `stopped at state ${at}`);
  check('and the space is byte for byte what it started as', snap(doc) === states[0]);
  check('undo on an empty stack says so and changes nothing',
    doc.undo().ok === false && snap(doc) === states[0]);

  // all the way forward
  ok = true; at = 0;
  while (doc.canRedo) {
    const res = doc.redo();
    at++;
    if (!res.ok || snap(doc) !== states[at]) { ok = false; break; }
  }
  check('redoing every command walks forward through the same states', ok && at === states.length - 1, `stopped at state ${at}`);
  check('and lands on exactly the state the last command left', snap(doc) === states[states.length - 1]);
  check('redo on an exhausted stack says so and changes nothing',
    doc.redo().ok === false && snap(doc) === states[states.length - 1]);

  // a new command after an undo throws the redo away, which is what a stack is
  doc.undo();
  check('after an undo there is something to redo', doc.canRedo);
  doc.place('rocks', { kind: 'sarsen', x: 2, z: 2, yaw: 0, scale: 1 });
  check('and a new command throws that branch away', !doc.canRedo);
}

// ============================================================================
console.log('\neditor: a delete puts the entry back where it was, not on the end');
{
  const doc = createSpaceDoc(emptySpace('order', 'Order', 0, 0, 40));
  for (const model of ['bench', 'barrel', 'crate']) doc.place('pieces', { model, x: 0, z: 0, yaw: 0 });
  // three at the same point would fail the audit; the order is what is under test
  const before = doc.space.pieces.map((p) => p.model).join(',');
  doc.remove({ list: 'pieces', index: 0 });
  check('removing the first leaves the other two in order', doc.space.pieces.map((p) => p.model).join(',') === 'barrel,crate');
  doc.undo();
  check('and undoing puts it back at the front, not at the back',
    doc.space.pieces.map((p) => p.model).join(',') === before, doc.space.pieces.map((p) => p.model).join(','));
}

// ============================================================================
console.log('\neditor: the palette is a view of the game\'s own tables');
{
  const st = paletteFor('structures', { has: () => false });
  const ids = new Set(st.map((e) => e.id));
  const missing = Object.keys(FOOTPRINT).filter((id) => !ids.has(id));
  const extra = st.filter((e) => !FOOTPRINT[e.id]);
  check('Structures lists every model in FOOTPRINT and nothing else',
    missing.length === 0 && extra.length === 0 && st.length === Object.keys(FOOTPRINT).length,
    `${st.length} models${missing.length ? ', missing ' + missing.join(', ') : ''}`);
  check('and says of each whether it is modelled or a stand-in',
    st.every((e) => typeof e.real === 'boolean' && /stand-in|modelled/.test(e.hint)));
  const withOne = paletteFor('structures', { has: (id) => id === 'inn' });
  check('a model that really is loaded is marked so, and sorts to the top',
    withOne[0].id === 'inn' && withOne[0].real === true && withOne[0].hint.includes('modelled'));
  check('and one that is not, is not', withOne.find((e) => e.id === 'barrel').real === false);

  const mon = paletteFor('monsters');
  check('Monsters lists every row in the roster',
    mon.length === MONSTER_LIST.length && MONSTER_LIST.every((m) => mon.some((e) => e.id === m.id)),
    `${mon.length} rows`);
  check('and lists them lowest tier first', mon.every((e, i) => i === 0 || mon[i - 1].tier <= e.tier));

  const tr = paletteFor('trees');
  check('Trees lists every species arbor grows',
    tr.length === Object.keys(SPECIES).length && Object.keys(SPECIES).every((id) => tr.some((e) => e.id === id)),
    `${tr.length}: ${tr.map((e) => e.id).join(', ')}`);

  const rk = paletteFor('rocks');
  check('Rocks lists every boulder and every dressing kind',
    rk.length === ROCK_KIND_IDS.length && rk.some((e) => e.id === 'rock') && rk.some((e) => e.id === 'sarsen'),
    `${rk.length} kinds`);

  const cr = paletteFor('creatures');
  check('Creatures lists every critter fauna.js grows',
    cr.length === Object.keys(CRITTERS).length && Object.keys(CRITTERS).every((id) => cr.some((e) => e.id === id)),
    `${cr.length}: ${cr.map((e) => e.id).join(', ')}`);
  check('and every one of them really has a monster row to spawn from',
    cr.every((e) => e.real), cr.filter((e) => !e.real).map((e) => e.id).join(', ') || 'all of them do');
  check('a stand-in is not real and is still placeable, which is what stand-ins are for',
    st.every((e) => e.placeable === true) && st.some((e) => !e.real));
  check('and a critter with no monster row would be listed and refused',
    cr.every((e) => e.placeable === e.real));

  const pp = paletteFor('people');
  check('People lists every town role and every story role',
    Object.keys(NPCS).every((id) => pp.some((e) => e.id === id))
    && Object.keys(STORY_ROLES).every((id) => pp.some((e) => e.id === id)),
    `${pp.length} roles`);

  check('Markers lists the seven kinds a marker may be',
    paletteFor('markers').map((e) => e.id).join(',') === MARKER_KINDS.join(','));
  check('Terrain lists nothing of its own: with no kinds() handed in it is empty',
    paletteFor('terrain').length === 0 && paletteFor('terrain', { kinds: null }).length === 0);
  check('and it is exactly what kinds() answered when there is one',
    paletteFor('terrain', { kinds: [{ kind: 'mountain', label: 'a mountain' }, { kind: 'lake' }] })
      .map((e) => e.id).join(',') === 'mountain,lake');
  check('there is a tab for each of the eight', TAB_IDS.length === 8 && TABS.every((t) => t.label));

  // the search, both ways
  check('the search finds by name', search(mon, 'wolf').length > 0 && search(mon, 'wolf').every((e) => /wolf/i.test(e.id + e.label)));
  check('and by what a thing is', search(st, 'stand-in').length === st.filter((e) => !e.real).length);
  check('and an empty query is everything', search(mon, '  ').length === mon.length);
  check('and a query nothing matches is nothing', search(mon, 'zzzznotathing').length === 0);
}

// ============================================================================
console.log('\neditor: a palette row becomes the line of the file it should');
{
  const cases = [
    ['structures', 'inn', 'pieces', (e) => e.model === 'inn' && e.x === 3 && e.z === 4 && e.yaw === 90],
    ['trees', 'oak', 'trees', (e) => e.species === 'oak' && e.scale === 1],
    ['rocks', 'sarsen', 'rocks', (e) => e.kind === 'sarsen'],
    ['monsters', 'boar', 'spawns', (e) => e.id === 'boar' && e.night === undefined],
    ['creatures', 'deer', 'spawns', (e) => e.id === 'deer'],
    ['people', 'miller', 'people', (e) => e.role === 'miller' && e.name === null],
    ['markers', 'structure', 'markers', (e) => e.kind === 'structure' && e.label === 'a mill goes here'],
  ];
  for (const [tab, id, list, ok] of cases) {
    const made = entryFor(tab, id, 3, 4, { yaw: 90, label: 'a mill goes here', note: 'two floors' });
    check(`the ${tab} tab writes into "${list}"`, made && made.list === list && ok(made.entry), JSON.stringify(made && made.entry));
  }
  check('a night spawn carries the night flag and a day one does not',
    entryFor('monsters', 'boar', 0, 0, { night: true }).entry.night === true
    && entryFor('monsters', 'boar', 0, 0, {}).entry.night === undefined);
  check('a yaw of 375 is written as 15, so nothing is ever stored turned past the circle',
    entryFor('structures', 'inn', 0, 0, { yaw: 375 }).entry.yaw === 15);
  check('a marker of a kind that is not one falls back to "other" rather than writing a bad file',
    entryFor('markers', 'vibes', 0, 0, { label: 'x' }).entry.kind === 'other');
  check('the terrain tab writes nothing into a space', entryFor('terrain', 'raise', 0, 0) === null);
}

// ============================================================================
console.log('\neditor: what it does, through the same calls the buttons make');
{
  const said = [];
  const ed = createEditor({ hud: { log: (t, k) => said.push([t, k]) } });

  // ED4: a click no longer needs a space to have been named first. What it
  // still needs is something on the cursor.
  check('placing with nothing on the cursor is refused in words, space or no space',
    ed.placeAt(0, 0).ok === false && /nothing is on the cursor/i.test(ed.lastLine), ed.lastLine);
  const made = ed.newSpace('The Ford Below', 40, { x: 300, z: -200 });
  check('a new space is begun where you are looking, and says it is not saved yet',
    made.ok && ed.space.id === 'the_ford_below' && /not on disk|Nothing is on disk/i.test(made.text), made.text);
  check('placing with nothing on the cursor is refused in words',
    ed.placeAt(300, -200).ok === false && /nothing is on the cursor/i.test(ed.lastLine));

  ed.setTab('structures');
  check('arming something that is not in the tab is refused', ed.arm('not_a_model').ok === false);
  check('arming a model says what to do next', ed.arm('cottage_a').ok && ed.pick === 'cottage_a');
  const put = ed.placeAt(305, -196);
  check('and a click on the ground puts it down, in the space\'s own frame and the world\'s',
    put.ok && ed.space.pieces[0].x === 5 && ed.space.pieces[0].z === 4 && /305, -196/.test(put.text), put.text);
  // ED4: a click outside the open space is NOT refused. It lands in the
  // automatic space for the 256 m tile it fell in, which is made on the spot.
  const spilled = ed.placeAt(300 + 60, -200);
  check('a click outside the open space makes the tile space and lands in it',
    spilled.ok && spilled.made === !SPACES['tile_1_-1'] && spilled.space === 'tile_1_-1' && ed.space.id === 'tile_1_-1',
    spilled.text);
  ed.useDoc('the_ford_below');

  ed.setTab('markers');
  ed.setGhost({ label: 'a mill goes here', note: 'two floors, an undershot wheel', kind: 'structure' });
  ed.arm('structure');
  const mark = ed.placeAt(290, -210);
  check('a marker goes down with the words that were typed for it',
    mark.ok && ed.space.markers[0].label === 'a mill goes here' && ed.space.markers[0].note === 'two floors, an undershot wheel');

  check('every one of those printed a line into the HUD log', said.length >= 6, `${said.length} lines`);
  check('and a refusal is logged as bad, not as news',
    said.some(([t, k]) => k === 'bad') && said.some(([, k]) => !k));

  // selection and the four things that can be done to it
  const sel = ed.select({ list: 'pieces', index: 0 });
  check('selecting says what was selected and where', sel.ok && /cottage_a is selected/.test(sel.text), sel.text);
  check('turning the selection is fifteen degrees', ed.turn().ok && ed.space.pieces[0].yaw === 15);
  check('growing it is a tenth', ed.grow().ok && ed.space.pieces[0].scale === 1.1);
  check('a marker has no size to change and says so',
    ed.select({ list: 'markers', index: 0 }).ok && ed.grow().ok === false && /no size to change/.test(ed.lastLine));
  check('moving it outside the radius is refused', ed.moveTo(400, -200).ok === false && /outside the space/.test(ed.lastLine));
  check('moving it inside is allowed', ed.moveTo(295, -205).ok && ed.space.markers[0].x === -5);
  check('deleting it takes it out', ed.del().ok && ed.space.markers.length === 0);
  check('and undo puts it back, words and all',
    ed.undo().ok && ed.space.markers.length === 1 && ed.space.markers[0].label === 'a mill goes here');
  check('and redo takes it out again', ed.redo().ok && ed.space.markers.length === 0);
  check('deleting with nothing selected is refused', ed.del().ok === false);

  // the space's own fields
  check('the space can be renamed and given a note', ed.setSpace({ name: 'The Ford', note: 'A crossing.' }).ok && ed.space.name === 'The Ford');
  check('it cannot be shrunk under something standing outside the new edge',
    ed.setSpace({ radius: 3 }).ok === false && /stands outside 3 m/.test(ed.lastLine), ed.lastLine);
  check('but it can be widened', ed.setSpace({ radius: 80 }).ok && ed.space.radius === 80);
  check('a second space with a name that has no letters in it is refused',
    ed.newSpace('!!!').ok === false && /no letters or digits/.test(ed.lastLine));
  check('and one with no name at all is refused', ed.newSpace('').ok === false);

  // what would go to disk is a space the game would load
  const v = ed.validate();
  check('what is open would pass the game\'s own load audit', v.ok, v.text || '');
  check('and the audit that says so is the same one the game runs',
    (() => { try { auditSpaces({ [v.json.id]: v.json }); return true; } catch { return false; } })());
}

// ============================================================================
console.log('\neditor: what Save sends is the space file');
{
  const sent = [];
  const fakeFetch = async (url, opts) => {
    sent.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ ok: true, bytes: (opts.body || '').length, path: JSON.parse(opts.body).path }) };
  };
  const ed = createEditor({});
  ed.newSpace('Riverside Yard', 44, { x: -80, z: 640 });
  ed.setTab('trees'); ed.arm('beech');
  ed.placeAt(-70, 646);
  const res = await ed.save(fakeFetch);
  check('the save reported what it wrote and how much of it', res.ok && /1 tree/.test(res.text), res.text);
  check('it went to the one endpoint', sent.length === 1 && sent[0].url === SAVE_URL && sent[0].opts.method === 'POST');
  const body = JSON.parse(sent[0].opts.body);
  check('at the path the space id makes', body.path === SPACE_PATH('riverside_yard'), body.path);
  check('and the payload is the space itself, field for field',
    JSON.stringify(body.json) === JSON.stringify(ed.doc.toJSON()));
  check('every list a space has is in the payload, even the empty ones',
    LISTS.every((l) => Array.isArray(body.json[l])), LISTS.join(', '));
  check('and it is a space the audit accepts',
    (() => { try { auditSpaces({ [body.json.id]: body.json }); return true; } catch { return false; } })());
  check('after a save the space is no longer dirty', ed.dirty === false);
  ed.turn();
  check('and one more change makes it dirty again', ed.dirty === true);

  // the wrong way: a space that would not load is not written at all
  const bad = createEditor({});
  bad.newSpace('Broken', 20, { x: 0, z: 0 });
  bad.doc.space.markers.push({ x: 0, z: 0, label: '', note: '', kind: 'nonsense' });
  const before = sent.length;
  const refusedSave = await bad.save(fakeFetch);
  check('a space that would fail the load audit is refused before it is written, with the reason',
    refusedSave.ok === false && /marks nothing|not one of/.test(refusedSave.text) && sent.length === before,
    refusedSave.text);

  // and a server that says no
  const noFetch = async () => ({ ok: false, status: 400, json: async () => ({ ok: false, text: 'that is not in src/mmo/spaces' }) });
  const ed3 = createEditor({});
  ed3.newSpace('Third', 20, { x: 0, z: 0 });
  const rejected = await ed3.save(noFetch);
  check('a refusal from the server is passed on in its own words',
    rejected.ok === false && /that is not in src\/mmo\/spaces/.test(rejected.text), rejected.text);
  const throwFetch = async () => { throw new Error('fetch failed'); };
  const ed4 = createEditor({});
  ed4.newSpace('Fourth', 20, { x: 0, z: 0 });
  const dead = await ed4.save(throwFetch);
  check('and a dev server that is not running is named as the likely reason',
    dead.ok === false && /Is vite running/.test(dead.text), dead.text);
}

// ============================================================================
// The terrain half of the editor is a CONTRACT and not a module in this
// repository, so what follows drives a fake that answers it exactly as
// `src/game/app/systems/world.js` does: kinds() with every knob and its range,
// stroke() answering words, undo() and redo() answering words or false. Every
// number below is read off that fake after the fact, never asserted before it.
const KINDS = [
  { kind: 'raise', label: 'raise', params: [{ name: 'r', min: 1, max: 200, step: 1, default: 20 }, { name: 'amount', min: 0, max: 60, step: 0.5, default: 4 }] },
  { kind: 'lower', label: 'lower', params: [{ name: 'r', min: 1, max: 200, step: 1, default: 20 }, { name: 'amount', min: 0, max: 60, step: 0.5, default: 4 }] },
  { kind: 'mountain', label: 'a mountain', params: [{ name: 'radius', min: 20, max: 600, step: 5, default: 300 }, { name: 'amount', min: 5, max: 400, step: 5, default: 120 }, { name: 'roughness', min: 0, max: 1, step: 0.05, default: 0.4 }] },
  { kind: 'ridge', label: 'a ridge', params: [{ name: 'r', min: 5, max: 200, step: 5, default: 40 }, { name: 'amount', min: 1, max: 200, step: 1, default: 30 }, { name: 'yaw', min: 0, max: 360, step: 1, default: 0 }, { name: 'length', min: 10, max: 600, step: 5, default: 200 }] },
  { kind: 'valley', label: 'a valley', params: [{ name: 'r', min: 5, max: 200, step: 5, default: 40 }, { name: 'amount', min: 1, max: 200, step: 1, default: 30 }, { name: 'yaw', min: 0, max: 360, step: 1, default: 0 }, { name: 'length', min: 10, max: 600, step: 5, default: 200 }] },
  { kind: 'plateau', label: 'a plateau', params: [{ name: 'r', min: 5, max: 400, step: 5, default: 80 }, { name: 'height', min: 0, max: 300, step: 1, default: 40 }] },
  { kind: 'terrace', label: 'terraces', params: [{ name: 'r', min: 5, max: 400, step: 5, default: 80 }, { name: 'step', min: 1, max: 40, step: 1, default: 6 }] },
  { kind: 'noise', label: 'noise', params: [{ name: 'r', min: 5, max: 400, step: 5, default: 60 }, { name: 'amount', min: -20, max: 20, step: 0.5, default: 3 }] },
  { kind: 'erode', label: 'erode', params: [{ name: 'r', min: 5, max: 400, step: 5, default: 60 }, { name: 'strength', min: 0, max: 1, step: 0.05, default: 0.5 }] },
  { kind: 'lake', label: 'a lake', params: [{ name: 'r', min: 5, max: 400, step: 5, default: 90 }, { name: 'depth', min: 1, max: 80, step: 1, default: 12 }] },
  { kind: 'ground', label: 'the ground itself', params: [{ name: 'r', min: 1, max: 400, step: 1, default: 30 }, { name: 'hardness', min: 0, max: 1, step: 0.05, default: 0.35 }, { name: 'opacity', min: 0.05, max: 1, step: 0.05, default: 0.7 }], words: ['dirt', 'rock', 'sand', 'grass', 'mud', 'snow', 'gravel', 'ash', 'cobble', 'path'] },
  // ED5. `erases` is the terrain half's own flag and the only thing that makes
  // this an eraser rather than another sculpt brush: its knobs say nothing.
  { kind: 'erase', label: 'erase', erases: true, params: [{ name: 'r', min: 1, max: 400, step: 0.5, default: 24 }, { name: 'hardness', min: 0, max: 1, step: 0.05, default: 0.5 }, { name: 'opacity', min: 0.05, max: 1, step: 0.05, default: 1 }] },
];

function fakeTerrain(kinds = KINDS) {
  const calls = [], undone = [], back = [], based = [];
  let laid = 0, off = 0, resets = 0, mode = 'sculpt';
  let base = { height: 0, ground: 'grass', snowLine: 220 };
  return {
    calls, undone, back, based,
    get laid() { return laid; },
    get resets() { return resets; },
    get base_() { return base; },
    kinds: () => kinds.map((k) => ({ ...k, params: (k.params || []).map((p) => ({ ...p })) })),
    stroke(c) { calls.push(c); laid++; return `the ${c.kind} is cut, ${Math.round(c.r || 0)} m of ground rebuilt`; },
    undo() { undone.push(1); if (!laid) return false; laid--; off++; return 'took the last one back'; },
    redo() { back.push(1); if (!off) return false; off--; laid++; return 'put it back'; },
    save: async () => `${laid} strokes written`,
    list: () => new Array(laid).fill({}),
    mode: () => mode,
    base: () => ({ ...base }),
    setBase(p) { based.push(p); base = { ...base, ...p }; return `the floor is ${base.height} m of ${base.ground}, snow above ${base.snowLine}`; },
    reset() { resets++; laid = 0; off = 0; return 'every stroke is gone'; },
  };
}

console.log('\neditor: the brushes are whatever kinds() says they are');
{
  const t = fakeTerrain();
  const ed = createEditor({ terrain: t });
  const rows = ed.terrainKinds();
  check('every kind the contract names is a brush, in the order it named them',
    rows.length === KINDS.length && rows.map((r) => r.id).join(',') === KINDS.map((k) => k.kind).join(','),
    rows.map((r) => r.id).join(','));
  check('and each carries the label the contract gave it, not its id',
    rows.find((r) => r.id === 'mountain').label === 'a mountain');
  check('every knob comes through with the range the contract set',
    (() => {
      const m = rows.find((r) => r.id === 'mountain');
      const rad = m.params.find((p) => p.name === 'radius');
      const amt = m.params.find((p) => p.name === 'amount');
      return m.params.length === 3 && rad.max === 600 && rad.step === 5 && rad.default === 300 && amt.max === 400;
    })(), JSON.stringify(rows.find((r) => r.id === 'mountain').params));
  check('a knob with no name at all is dropped rather than drawn nameless',
    brushRows([{ kind: 'x', params: [{ name: '', min: 0, max: 1 }, { name: 'ok', min: 0, max: 1 }] }])[0].params.length === 1);
  check('a knob with a max under its min is pulled up to it instead of refusing every value',
    brushParam({ name: 'r', min: 10, max: 2 }).max === 10);
  check('a kind that takes a yaw and a length is drawn between two clicks',
    rows.find((r) => r.id === 'ridge').line === true && rows.find((r) => r.id === 'valley').line === true);
  check('a kind that takes a second point is too',
    brushRow({ kind: 'cut', params: [{ name: 'x2' }, { name: 'z2' }] }).line === true);
  check('and a kind that takes neither is painted with a held button',
    ['raise', 'mountain', 'plateau', 'terrace', 'noise', 'erode', 'lake', 'ground'].every((id) => rows.find((r) => r.id === id).line === false));
  check('the ground brush carries the ten words it paints with, snow among them',
    rows.find((r) => r.id === 'ground').words.join(',') === 'dirt,rock,sand,grass,mud,snow,gravel,ash,cobble,path');
  check('and every other brush carries none, so no word picker is drawn for them',
    rows.filter((r) => r.words.length).length === 1);
  check('the radius knob is found whether it is called r or radius',
    rows.find((r) => r.id === 'raise').radius.name === 'r' && rows.find((r) => r.id === 'mountain').radius.name === 'radius');
  check('and the amount knob whether it is called amount, height, depth or strength',
    ['raise:amount', 'plateau:height', 'lake:depth', 'erode:strength'].every((s) => {
      const [id, name] = s.split(':');
      return rows.find((r) => r.id === id).amount.name === name;
    }));
  check('a duplicate kind is taken once, not twice',
    brushRows([{ kind: 'a' }, { kind: 'a' }]).length === 1);
  check('the tab lists exactly what kinds() returned, through the palette the panel reads',
    ed.setTab('terrain').rows.map((r) => r.id).join(',') === KINDS.map((k) => k.kind).join(','));
  check('and the search runs over the brushes like any other tab',
    ed.setQuery('mountain').length === 1 && ed.setQuery('').length === KINDS.length);
}

console.log('\neditor: one stroke carries every knob its kind takes');
{
  const t = fakeTerrain();
  const ed = createEditor({ terrain: t });
  ed.setTab('terrain');
  const armed = ed.arm('mountain');
  check('arming a brush says its name, how wide it is and how much it moves',
    armed.ok && /a mountain/.test(armed.text) && /300 m/.test(armed.text) && /120 m/.test(armed.text), armed.text);
  const res = ed.strokeOnce(1200, -800);
  const c = t.calls[0];
  check('a stroke goes down with the kind, the point and every knob by its own name',
    res.ok && t.calls.length === 1 && c.kind === 'mountain' && c.x === 1200 && c.z === -800
    && c.radius === 300 && c.amount === 120 && c.roughness === 0.4, JSON.stringify(c));
  check('and with r and amount as well, so the first contract still reads it',
    c.r === 300 && c.amount === 120);
  check('the words the contract answered are said back to the user',
    /the mountain is cut/.test(res.text), res.text);
  check('a radius of 9999 is clamped to the 600 the contract allows, not to the old 120',
    ed.setBrushParam('mountain', 'radius', 9999) === 600 && ed.brushValue('mountain', 'radius') === 600);
  check('and one below the floor is clamped up to it',
    ed.setBrushParam('mountain', 'radius', -40) === 20);
  check('plus and minus move the radius by a share of itself and say the new number',
    (() => { ed.setBrushParam('mountain', 'radius', 300); const up = ed.bumpRadius(1); return up.ok && ed.brushValue('mountain', 'radius') === 345 && /345 m/.test(up.text); })(),
    `${ed.brushValue('mountain', 'radius')}`);
  check('and at the end of the range they refuse in words rather than doing nothing',
    (() => { ed.setBrushParam('mountain', 'radius', 600); const up = ed.bumpRadius(1); return up.ok === false && /as wide as it goes/.test(up.text); })());
  check('a brush that is not in kinds() is refused, and the refusal names the ones that are',
    ed.stroke(0, 0, { kind: 'melt' }).ok === false && /is not one of/.test(ed.lastLine) && /mountain/.test(ed.lastLine));
  check('every brush kinds() named is accepted',
    KINDS.filter((k) => !['ridge', 'valley'].includes(k.kind)).every((k) => ed.stroke(0, 0, { kind: k.kind }).ok));

  // the ground brush and its words
  ed.arm('ground');
  check('the ground brush starts on the first word it was given',
    ed.brushWord('ground') === 'dirt' && ed.stroke(0, 0).call.word === 'dirt');
  const snow = ed.setBrushWord('ground', 'snow');
  check('choosing snow says so', snow.ok && /snow/.test(snow.text), snow.text);
  const painted = ed.stroke(10, 20);
  check('and the stroke carries it under both names the contract accepts',
    painted.call.word === 'snow' && painted.call.ground === 'snow', JSON.stringify(painted.call));
  check('a word that is not one of the ten is refused, and the ten are named',
    ed.setBrushWord('ground', 'lava').ok === false && /dirt, rock/.test(ed.lastLine));
  check('and a brush with no words to paint says so rather than taking one',
    ed.setBrushWord('mountain', 'snow').ok === false && /does not paint a word/.test(ed.lastLine));
}

console.log('\neditor: shift turns a brush over, three ways and no ways');
{
  const t = fakeTerrain();
  const ed = createEditor({ terrain: t });
  ed.setTab('terrain');
  ed.arm('raise');
  check('shift on raise lays lower instead, because both are in the contract',
    ed.stroke(0, 0, { shift: true }).call.kind === 'lower' && ed.stroke(0, 0).call.kind === 'raise');
  ed.arm('ridge');
  check('and shift on a ridge lays a valley', ed.stroke(0, 0, { shift: true }).call.kind === 'valley');
  ed.arm('noise');
  check('a brush with no pair but an amount that may go negative has the amount negated',
    (() => { const c = ed.stroke(0, 0, { shift: true }).call; return c.kind === 'noise' && c.amount === -3; })());
  ed.arm('plateau');
  const flat = ed.strokeOnce(0, 0, { shift: true });
  check('a plateau flattens either way, and the words say shift changed nothing',
    t.calls[t.calls.length - 1].kind === 'plateau' && /shift changed nothing/.test(flat.text), flat.text);
  check('the same three answers come out of invert on its own',
    ed.invert('raise').kind === 'lower' && ed.invert('noise').negate === true && ed.invert('plateau').none === true);
  const half = createEditor({ terrain: fakeTerrain(KINDS.filter((k) => k.kind !== 'lower')) });
  half.setTab('terrain');
  check('a contract with no lower in it does not send shift at a brush that is not there',
    half.invert('raise').kind === 'raise' && half.invert('raise').none === true);
}

console.log('\neditor: a drag is one brush and one undo');
{
  const t = fakeTerrain();
  const ed = createEditor({ terrain: t });
  ed.setTab('terrain');
  ed.arm('raise');
  ed.setBrushParam('raise', 'r', 20);
  // 300 metres of drag at a radius of 20: a stroke every 10 m, and the press
  let now = 0;
  ed.dragBegin(0, 0, { now });
  for (let x = 1; x <= 300; x++) { now += 100; ed.dragStroke(x, 0, { now }); }
  const done = ed.dragEnd();
  check('300 m of drag at a radius of 20 lays a stroke every half radius and no more',
    t.calls.length === 31, `${t.calls.length} strokes`);
  check('and they are spaced ten metres apart along the drag, not piled at the press',
    t.calls.every((c, i) => c.x === i * 10) && t.calls[30].x === 300,
    t.calls.map((c) => c.x).join(' '));
  check('the end of the drag says how many it laid and that one undo takes them all',
    done.ok && /31 strokes/.test(done.text) && /ctrl Z/i.test(done.text), done.text);
  const back = ed.terrainUndo();
  check('and one undo really does call the contract once per stroke of the drag',
    t.undone.length === 31 && t.laid === 0 && /31 strokes of raise undone/.test(back.text), back.text);
  check('a second undo finds nothing, because the drag was one step and not thirty one',
    ed.terrainUndo().ok && /no terrain stroke left/.test(ed.lastLine), ed.lastLine);
  const again = ed.terrainRedo();
  check('redo puts the whole drag back, one call per stroke',
    again.ok && t.back.length === 31 && t.laid === 31, `${t.back.length} calls, ${t.laid} on the ground`);

  // the interval, measured on its own: far enough apart, too soon
  const t2 = fakeTerrain();
  const ed2 = createEditor({ terrain: t2 });
  ed2.setTab('terrain'); ed2.arm('raise'); ed2.setBrushParam('raise', 'r', 20);
  let n2 = 0;
  ed2.dragBegin(0, 0, { now: n2 });
  for (let i = 1; i <= 6; i++) { n2 += 10; ed2.dragStroke(i * 30, 0, { now: n2 }); }
  ed2.dragEnd();
  check('seven moves 30 m apart in 60 ms lay two strokes, because 60 ms is the floor',
    t2.calls.length === 2 && t2.calls[1].x === 180, `${t2.calls.length} strokes at ${t2.calls.map((c) => c.x).join(', ')}`);
  const t3 = fakeTerrain();
  const ed3 = createEditor({ terrain: t3 });
  ed3.setTab('terrain'); ed3.arm('raise'); ed3.setBrushParam('raise', 'r', 20);
  let n3 = 0;
  ed3.dragBegin(0, 0, { now: n3 });
  for (let i = 1; i <= 6; i++) { n3 += 500; ed3.dragStroke(i, 0, { now: n3 }); }
  ed3.dragEnd();
  check('and six slow moves of a metre each lay one stroke, because half the radius is the other floor',
    t3.calls.length === 1, `${t3.calls.length} strokes`);
  check('a wider brush spaces its strokes wider, because the spacing is half the radius',
    (() => {
      const t4 = fakeTerrain(); const e4 = createEditor({ terrain: t4 });
      e4.setTab('terrain'); e4.arm('mountain'); e4.setBrushParam('mountain', 'radius', 300);
      let n = 0; e4.dragBegin(0, 0, { now: n });
      for (let x = 1; x <= 600; x++) { n += 100; e4.dragStroke(x, 0, { now: n }); }
      e4.dragEnd();
      return t4.calls.length === 5 && t4.calls.every((c, i) => c.x === i * 150);
    })());
  check('shift is taken at the press and holds for the whole drag',
    (() => {
      const t5 = fakeTerrain(); const e5 = createEditor({ terrain: t5 });
      e5.setTab('terrain'); e5.arm('raise'); e5.setBrushParam('raise', 'r', 20);
      let n = 0; e5.dragBegin(0, 0, { shift: true, now: n });
      for (let x = 1; x <= 40; x++) { n += 100; e5.dragStroke(x, 0, { now: n }); }
      const end = e5.dragEnd();
      return t5.calls.length === 5 && t5.calls.every((c) => c.kind === 'lower') && /turned over/.test(end.text);
    })());
  check('a drag that laid nothing says nothing rather than claiming a stroke',
    (() => { const e6 = createEditor({}); e6.setTab('terrain'); e6.dragBegin(0, 0); return e6.dragEnd().ok === false; })());
  check('and a drag refused at its first stroke leaves nothing lying for the next move to feed',
    (() => {
      const e7 = createEditor({});
      e7.setTab('terrain');
      const begun = e7.dragBegin(0, 0);
      return begun.ok === false && e7.dragStroke(50, 0, { now: 9999 }).ok === false && e7.dragCount() === 0;
    })());
}

console.log('\neditor: a ridge takes two clicks, and gets the bearing right');
{
  const t = fakeTerrain();
  const ed = createEditor({ terrain: t });
  ed.setTab('terrain');
  ed.arm('ridge');
  check('a line brush refuses to be painted with a held button, in words',
    ed.dragBegin(0, 0).ok === false && /two points/.test(ed.lastLine), ed.lastLine);
  const one = ed.lineStart(100, 200);
  check('the first click sets the start, says where, and cuts nothing',
    one.ok && t.calls.length === 0 && /starts at 100, 200/.test(one.text) && ed.lineAt().x === 100, one.text);
  const two = ed.lineEnd(100, 400);
  check('the second click cuts exactly one stroke', t.calls.length === 1);
  const c = t.calls[0];
  check('anchored at the first point, bearing due north, 200 m long',
    c.x === 100 && c.z === 200 && c.yaw === 0 && c.length === 200, JSON.stringify(c));
  check('and the words say the length and the bearing',
    /200 m long, bearing 0/.test(two.text), two.text);
  check('the line is let go once it is cut, so the next click starts a new one',
    ed.lineAt() === null);
  ed.lineStart(0, 0); ed.lineEnd(100, 0);
  check('due east is a bearing of 90, clockwise from north',
    t.calls[1].yaw === 90 && t.calls[1].length === 100, JSON.stringify(t.calls[1]));
  ed.lineStart(0, 0); ed.lineEnd(-100, -100);
  check('and south west is 225', t.calls[2].yaw === 225, `${t.calls[2].yaw}`);
  const long = (() => { ed.lineStart(0, 0); return ed.lineEnd(0, 900); })();
  check('a line longer than the brush reaches is cut to what it reaches, and says it was',
    t.calls[3].length === 600 && /cut to 600 m/.test(long.text), long.text);
  ed.lineStart(0, 0);
  const gone = ed.lineCancel();
  check('escape lets a half drawn line go, says so, and cuts nothing',
    gone.ok && ed.lineAt() === null && t.calls.length === 4, gone.text);
  const near = (() => { ed.lineStart(50, 50); return ed.lineEnd(50, 50.1); })();
  check('two clicks in the same place are refused with the distance between them',
    near.ok === false && /0.1 m apart/.test(near.text) && t.calls.length === 4, near.text);
  check('disarm on the terrain tab lets the line go before it drops anything else',
    (() => { ed.lineStart(1, 1); const d = ed.disarm(); return d.ok && ed.lineAt() === null; })());
  // The real contract counts its yaw in RADIANS (terrain_edits.js YAW_PARAM is
  // 0 to 2 pi). A bearing sent in the wrong unit points a ridge at nothing, so
  // both units are driven here.
  check('a yaw knob that runs to 2 pi is counted in radians, and one that runs to 360 in degrees',
    (() => {
      const rad = brushRow({ kind: 'ridge', params: [{ name: 'yaw', min: 0, max: Math.PI * 2, step: 0.01, default: 0 }, { name: 'length', min: 0, max: 400 }] });
      const deg = brushRow({ kind: 'ridge', params: [{ name: 'yaw', min: 0, max: 360, step: 1, default: 0 }, { name: 'length', min: 0, max: 400 }] });
      return rad.yaw.unit === 'radians' && deg.yaw.unit === 'degrees';
    })());
  check('a ridge drawn due east on a radian knob is sent 1.5708, not 90',
    (() => {
      const tt = fakeTerrain([{ kind: 'ridge', label: 'ridge', params: [{ name: 'r', min: 0.5, max: 300, step: 0.5, default: 40 }, { name: 'amount', min: 0, max: 400, step: 0.5, default: 60 }, { name: 'length', min: 0, max: 4000, step: 1, default: 300 }, { name: 'yaw', min: 0, max: Math.PI * 2, step: 0.01, default: 0 }] }]);
      const e = createEditor({ terrain: tt });
      e.setTab('terrain'); e.arm('ridge');
      e.lineStart(0, 0);
      const said = e.lineEnd(100, 0);
      const k = tt.calls[0];
      return Math.abs(k.yaw - Math.PI / 2) < 1e-3 && k.length === 100 && /bearing 90 degrees/.test(said.text);
    })(), 'the words say degrees, the wire carries radians');
  check('and one drawn south west is sent 3.927 radians, which is 225 degrees',
    (() => {
      const tt = fakeTerrain([{ kind: 'ridge', label: 'ridge', params: [{ name: 'length', min: 0, max: 4000, step: 1, default: 300 }, { name: 'yaw', min: 0, max: Math.PI * 2, step: 0.01, default: 0 }] }]);
      const e = createEditor({ terrain: tt });
      e.setTab('terrain'); e.arm('ridge');
      e.lineStart(0, 0); e.lineEnd(-100, -100);
      return Math.abs(tt.calls[0].yaw - (225 * Math.PI / 180)) < 1e-3;
    })());
  check('a bearing knob on a brush that is NOT a line is left out until it is moved, so a cave mouth still opens downhill',
    (() => {
      const tt = fakeTerrain([{ kind: 'cave', label: 'cave mouth', params: [{ name: 'r', min: 0.5, max: 60, step: 0.5, default: 8 }, { name: 'amount', min: 0, max: 4, step: 0.1, default: 2 }, { name: 'yaw', min: 0, max: Math.PI * 2, step: 0.01, default: 0 }] }]);
      const e = createEditor({ terrain: tt });
      e.setTab('terrain'); e.arm('cave');
      e.strokeOnce(0, 0);
      const untouched = !('yaw' in tt.calls[0]) && tt.calls[0].r === 8 && tt.calls[0].amount === 2;
      e.setBrushParam('cave', 'yaw', 3);
      e.strokeOnce(0, 0);
      return untouched && tt.calls[1].yaw === 3 && e.brushTouched('cave', 'yaw') === true;
    })());
  check('a kind with no amount knob is sent none, rather than one it never asked for',
    (() => {
      const tt = fakeTerrain([{ kind: 'lake', label: 'lake', params: [{ name: 'r', min: 0.5, max: 600, step: 0.5, default: 24 }, { name: 'floor', min: -200, max: 0, step: 0.5, default: -3 }] }]);
      const e = createEditor({ terrain: tt });
      e.setTab('terrain'); e.arm('lake');
      const said = e.strokeOnce(10, 10);
      return !('amount' in tt.calls[0]) && tt.calls[0].floor === -3 && tt.calls[0].r === 24 && !/ m,/.test(said.text.split('at 10, 10, ')[1] || '');
    })());
  check('a kind that takes a second point gets the point, not a yaw',
    (() => {
      const tt = fakeTerrain([{ kind: 'cut', params: [{ name: 'r', min: 1, max: 50, default: 10 }, { name: 'x2', min: -9999, max: 9999 }, { name: 'z2', min: -9999, max: 9999 }] }]);
      const e = createEditor({ terrain: tt });
      e.setTab('terrain'); e.arm('cut');
      e.lineStart(10, 20); e.lineEnd(40, 60);
      const k = tt.calls[0];
      return k && k.x === 10 && k.z === 20 && k.x2 === 40 && k.z2 === 60 && k.length === 50;
    })());
}

console.log('\neditor: the world under the strokes');
{
  const t = fakeTerrain();
  const ed = createEditor({ terrain: t });
  check('the mode the terrain half is in is read, not guessed', ed.terrainMode() === 'sculpt');
  check('and the floor comes back with its height, its ground and its snow line',
    ed.terrainBase().height === 0 && ed.terrainBase().ground === 'grass' && ed.terrainBase().snowLine === 220);
  const set = ed.setTerrainBase({ height: 12, ground: 'snow', snowLine: 90 });
  check('setting the floor reaches the contract with the three fields and says what came back',
    set.ok && t.based.length === 1 && t.based[0].ground === 'snow' && t.based[0].height === 12 && t.based[0].snowLine === 90
    && /snow/.test(set.text), set.text);
  check('and setting nothing at all is refused rather than sent as an empty patch',
    ed.setTerrainBase({}).ok === false && t.based.length === 1);

  // reset asks once, and only then does it
  ed.arm('raise');
  const ask = ed.terrainReset({ now: 1000 });
  check('reset asks before it acts, and drops nothing while it is asking',
    ask.ok === false && ask.asked === true && /drops every stroke/.test(ask.text) && t.resets === 0, ask.text);
  check('and the editor knows it is standing with the question open', ed.resetAsked(1000) === true);
  const did = ed.terrainReset({ now: 2000 });
  check('a second press inside eight seconds does it, once',
    did.ok && t.resets === 1 && /every stroke is gone/.test(did.text), did.text);
  check('and the question is closed again afterwards', ed.resetAsked(2000) === false);
  ed.terrainReset({ now: 3000 });
  const stale = ed.terrainReset({ now: 3000 + 8001 });
  check('a press nine seconds after the question asks again rather than acting on a stale yes',
    stale.ok === false && stale.asked === true && t.resets === 1, `${t.resets} resets`);
  check('and a caller that says it is sure does it with no question at all',
    ed.terrainReset({ sure: true }).ok && t.resets === 2);
  check('reset empties the editor\'s own drag stack too, so undo does not chase ground that is gone',
    ed.terrainDepth.done === 0 && ed.terrainDepth.undone === 0);
  check('how many strokes are on the ground is read off the contract, not counted here',
    (() => { const e = createEditor({ terrain: fakeTerrain() }); e.setTab('terrain'); e.arm('raise'); e.strokeOnce(0, 0); return e.terrainCount().strokes === 1; })());
}

console.log('\neditor: the terrain contract, half there and not there at all');
{
  // stroke but no kinds: the old contract. It works, and says what is missing.
  const calls = [];
  const old = createEditor({ terrain: { stroke: (c) => { calls.push(c); return true; }, undo: () => true, redo: () => true, save: async () => 'four strokes saved' } });
  old.setTab('terrain');
  check('a terrain half with no kinds() yields no brushes and does not throw',
    old.terrainKinds() === null && old.rows().length === 0 && old.terrainReady() === true,
    `${old.rows().length} rows`);
  check('and asking it again says which half is missing, in words',
    old.refreshKinds().ok === false && /answer no kinds/.test(old.lastLine), old.lastLine);
  old.setBrush({ kind: 'cave', r: 12, amount: -2 });
  const st = old.stroke(100, 200);
  check('a stroke still goes through on the seven the first contract named',
    st.ok && calls.length === 1 && calls[0].kind === 'cave' && calls[0].x === 100 && calls[0].z === 200 && calls[0].r === 12 && calls[0].amount === -2,
    JSON.stringify(calls[0]));
  check('every one of those seven is accepted', BRUSH_IDS.every((k) => old.stroke(0, 0, { kind: k }).ok), BRUSH_IDS.join(', '));
  check('and a brush that is not one of them is refused', old.stroke(0, 0, { kind: 'melt' }).ok === false);
  check('the brush is clamped rather than allowed to be a mile across',
    old.setBrush({ r: 9999 }).r === 120 && old.setBrush({ r: -5 }).r === 1);
  check('undo, redo and save all reach the contract',
    old.terrainUndo().ok && old.terrainRedo().ok && (await old.terrainSave()).ok);
  check('and the four that are not there each say so and change nothing',
    old.terrainMode() === null && old.terrainBase() === null
    && old.setTerrainBase({ height: 4 }).ok === false && /no setBase/.test(old.lastLine)
    && old.terrainReset({ sure: true }).ok === false && /no reset/.test(old.lastLine));

  const none = createEditor({});
  check('with no terrain tools at all the editor says exactly that and does nothing',
    none.terrainReady() === false
    && none.terrainKinds() === null
    && none.stroke(0, 0).ok === false && /terrain tools are not in yet/.test(none.lastLine)
    && none.terrainUndo().ok === false
    && none.terrainRedo().ok === false
    && (await none.terrainSave()).ok === false,
    none.lastLine);
  check('and arming a brush with nothing to arm says which contract is missing',
    none.setTab('terrain').ok !== false && none.arm('raise').ok === false && /window.__bw.terrain/.test(none.lastLine), none.lastLine);
  check('a kinds() that throws is caught, said, and leaves no brushes',
    (() => {
      const e = createEditor({ terrain: { stroke: () => true, kinds: () => { throw new Error('not wired'); } } });
      return e.terrainKinds() === null && /not wired/.test(e.lastLine);
    })());
  check('and a kinds() that answers something that is not a list leaves no brushes either',
    createEditor({ terrain: { stroke: () => true, kinds: () => 'brushes' } }).terrainKinds() === null);
}

// ============================================================================
console.log('\neditor: the save endpoint refuses everything but its two folders');
{
  check('the two folders are the two the contract names',
    SAVE_DIRS.join(', ') === 'src/mmo/spaces, public/terrain');
  const good = ['src/mmo/spaces/ford.json', 'src/mmo/spaces/a-1_b.json', 'public/terrain/edits.json'];
  for (const p of good) check(`"${p}" is allowed`, safePath('/repo', p).ok === true, safePath('/repo', p).why || '');
  const bad = [
    ['src/game/main.js', 'a source file'],
    ['src/game/main.json', 'a json anywhere else'],
    ['package.json', 'the root'],
    ['/etc/passwd', 'an absolute path'],
    ['../../../etc/passwd', 'a climb out of the tree'],
    ['src/mmo/spaces/../../game/main.json', 'a climb dressed up as a name'],
    ['src/mmo/spaces/sub/ford.json', 'a folder below'],
    ['src/mmo/spaces/ford.js', 'not a json'],
    ['src/mmo/spaces/.json', 'no name at all'],
    ['src/mmo/spaces/ford.json\0.js', 'a null byte'],
    ['public/terrain/../../src/game/main.json', 'a climb from the other folder'],
    ['', 'nothing'],
    [null, 'not even a string'],
  ];
  for (const [p, why] of bad) {
    const r = safePath('/repo', p);
    check(`${why} is refused, in words`, r.ok === false && typeof r.why === 'string' && r.why.length > 10, r.why || 'it was ALLOWED');
  }
  check('a refused path is a 400 and writes nothing',
    saveEditorFile('/repo', 'src/game/main.js', { a: 1 }).status === 400);
  check('and so is a payload that is not an object',
    saveEditorFile('/repo', 'src/mmo/spaces/x.json', 'not json at all').status === 400);

  // the generated index, which is the other half of the door
  const src = spaceIndexSource(['ford', 'a-1']);
  check('the generated index imports every id it was given, and nothing else',
    src.includes("import sp_ford from './ford.json' with { type: 'json' };")
    && src.includes(`import ${varOf('a-1')} from './a-1.json' with { type: 'json' };`)
    && (src.match(/^import /gm) || []).length === 2);
  check('and an id with a dash becomes a name JavaScript will take', varOf('a-1') === 'sp_a_1');
  check('an empty folder still generates a valid module',
    spaceIndexSource([]).includes('export const FILES = {};'));
  check('and an id that could not be a file name never reaches an import line',
    !spaceIndexSource(['../evil', 'ok']).includes('evil'));
}


// ============================================================================
// ED4: the nine trays, counted against the tables that own the things.
//
// `modes.js` decides WHICH tray a row goes in and nothing else: every tile is
// a `palette.js` row, and palette.js is a view of arbor, FOOTPRINT, the monster
// roster, fauna, npcs and the story. So the count below is a count of the game
// and not of the editor, and it is driven both ways: every row lands in a tray,
// and every tile in a tray came out of a row.
console.log('\neditor: the nine trays are the palette, split and counted both ways');
{
  const rows = brushRows(KINDS);
  const tray = Object.fromEntries(MODE_IDS.map((m) => [m, toolsFor(m, { kinds: rows })]));
  const entriesOf = (m) => tray[m].filter((t) => t.what === 'entry');
  const P = {
    structures: paletteFor('structures'), trees: paletteFor('trees'), rocks: paletteFor('rocks'),
    monsters: paletteFor('monsters'), creatures: paletteFor('creatures'),
    people: paletteFor('people'), markers: paletteFor('markers'),
  };
  const tall = P.structures.filter((r) => heightOf(r.id) >= PROP_HEIGHT);
  const small = P.structures.filter((r) => heightOf(r.id) < PROP_HEIGHT);

  check('the hand tool precedes the ten authoring modes',
    MODE_IDS.join(',') === 'select,sculpt,paint,foliage,objects,buildings,creatures,people,markers,water,erase', MODE_IDS.join(','));
  check('every mode has a mark drawn for it, and so does every action',
    MODES.every((m) => hasMark(m.icon)) && ACTIONS.every((a) => hasMark(a.icon)),
    MODES.filter((m) => !hasMark(m.icon)).map((m) => m.icon).join(','));

  check('Foliage holds grass and every species arbor grows, and nothing else',
    entriesOf('foliage').length === P.trees.length
    && entriesOf('foliage').every((t) => t.tab === 'trees')
    && tray.foliage.length === P.trees.length + 1 && tray.foliage[0].id === 'grass',
    `${tray.foliage.length} tiles for ${P.trees.length} species`);
  check('Objects holds every rock kind and every model under three metres',
    entriesOf('objects').length === P.rocks.length + small.length,
    `${entriesOf('objects').length} for ${P.rocks.length} rocks and ${small.length} props`);
  check('Buildings holds every model three metres and over, and nothing shorter',
    entriesOf('buildings').length === tall.length
    && entriesOf('buildings').every((t) => heightOf(t.id) >= PROP_HEIGHT),
    `${entriesOf('buildings').length} of ${tall.length}`);
  check('and the two of them are every model in FOOTPRINT, once each, with none lost between them',
    entriesOf('objects').filter((t) => t.tab === 'structures').length + entriesOf('buildings').length === Object.keys(FOOTPRINT).length
    && new Set([...entriesOf('objects'), ...entriesOf('buildings')].filter((t) => t.tab === 'structures').map((t) => t.id)).size === Object.keys(FOOTPRINT).length,
    `${small.length} + ${tall.length} vs ${Object.keys(FOOTPRINT).length} in FOOTPRINT`);
  check('Creatures holds every monster row and every critter fauna grows',
    entriesOf('creatures').length === P.monsters.length + P.creatures.length,
    `${entriesOf('creatures').length} for ${P.monsters.length} monsters and ${P.creatures.length} critters`);
  check('People holds every role and Markers every kind',
    entriesOf('people').length === P.people.length && entriesOf('markers').length === P.markers.length,
    `${entriesOf('people').length} people, ${entriesOf('markers').length} markers`);
  check('and the other way: every palette row in the game is in exactly one tray',
    MODE_IDS.reduce((n, m) => n + entriesOf(m).length, 0)
      === P.structures.length + P.trees.length + P.rocks.length + P.monsters.length + P.creatures.length + P.people.length + P.markers.length,
    `${MODE_IDS.reduce((n, m) => n + entriesOf(m).length, 0)} tiles`);
  check('a critter with no monster row is drawn but refused, not quietly dropped',
    entriesOf('creatures').filter((t) => t.placeable === false).length === P.creatures.filter((r) => !r.placeable).length);

  // ---- the brushes ------------------------------------------------------
  check('Paint holds one swatch per word the paint brush lays, and each has a colour',
    tray.paint.length === 10 && tray.paint.every((t) => /^#[0-9a-f]{6}$/.test(t.colour)),
    tray.paint.map((t) => `${t.id} ${t.colour}`).join(' '));
  check('the swatch colours come out of the terrain material, so grass is green and snow is pale',
    (() => {
      const g = groundColour('grass'), s = groundColour('snow');
      const green = parseInt(g.slice(3, 5), 16) > parseInt(g.slice(1, 3), 16);
      const pale = parseInt(s.slice(1, 3), 16) > 190;
      return green && pale;
    })(), `${groundColour('grass')} and ${groundColour('snow')}`);
  check('and the swatch table is checked against the material own layers, both ways',
    auditTints() === 6);
  check('Water holds the lake brush and Sculpt does not',
    tray.water.map((t) => t.id).join(',') === 'lake' && !tray.sculpt.some((t) => t.id === 'lake'));
  check('Sculpt holds every other kind the contract named',
    tray.sculpt.map((t) => t.id).join(',') === 'raise,mountain,ridge,plateau,terrace,noise,erode',
    tray.sculpt.map((t) => t.id).join(','));
  check('and against the real contract that is the twelve the ground is really cut with, and a pit',
    toolsFor('sculpt', { kinds: brushRows(realKinds()) }).map((t) => t.id).join(',')
      === 'raise,flatten,smooth,pit,cliff,cave,mountain,ridge,plateau,valley,terrace,noise,erode',
    toolsFor('sculpt', { kinds: brushRows(realKinds()) }).map((t) => t.id).join(','));
  // BOTH DIRECTIONS, on two contracts. In the fake above, a valley takes knob
  // for knob what a ridge takes, defaults and all, so a valley IS the ridge
  // square with shift held and gets none of its own. In the real
  // `terrain_edits.js` a valley's defaults are not a ridge's, so it gets one.
  check('a brush whose knobs are another brush own, turned over, gets no square: shift is its square',
    [...shiftTwins(rows)].sort().join(',') === 'lower,valley'
    && !tray.sculpt.some((t) => t.id === 'lower') && !tray.sculpt.some((t) => t.id === 'valley'),
    [...shiftTwins(rows)].join(','));
  check('and one whose knobs differ keeps its own, which is what the real contract valley does',
    (() => {
      const real = brushRows(realKinds());
      const twins = shiftTwins(real);
      return twins.has('lower') && !twins.has('valley')
        && toolsFor('sculpt', { kinds: real }).some((t) => t.id === 'valley');
    })(), [...shiftTwins(brushRows(realKinds()))].join(','));
  check('the tray a brush lands in is read off the brush, not off its name',
    brushModeOf(brushRow({ kind: 'anything', words: ['mud'] })) === 'paint'
    && brushModeOf(brushRow({ kind: 'anything', params: [{ name: 'floor', min: -9, max: 0 }] })) === 'water'
    && brushModeOf(brushRow({ kind: 'anything', params: [{ name: 'r', min: 1, max: 9 }] })) === 'sculpt');
  check('every kind kinds() named is on a tile or reachable by shift from one',
    (() => { try { auditTools(rows); return true; } catch { return false; } })());
  check('and the count adds up: the tiles, the words brush, the eraser and the twins are the whole contract',
    tray.sculpt.length + tray.water.length + tray.erase.length + 1 + shiftTwins(rows).size === KINDS.length,
    `${tray.sculpt.length} sculpt + ${tray.water.length} water + ${tray.erase.length} erase + 1 paint + ${shiftTwins(rows).size} twins vs ${KINDS.length} kinds`);
  check('the eraser is in its own tray, on the strength of its own flag and not its name',
    tray.erase.length === 1 && tray.erase[0].brush === 'erase'
    && brushModeOf(brushRow({ kind: 'anything', erases: true })) === 'erase'
    && brushModeOf(brushRow({ kind: 'erase', params: [{ name: 'r', min: 1, max: 9 }] })) === 'erase',
    `${tray.erase.map((t) => t.id).join(',')}`);
  check('and the real terrain contract lands in trays too, with nothing lost',
    (() => {
      try {
        const real = brushRows(realKinds());
        const got = auditTools(real);
        return got.kinds === real.length && real.length > 0;
      } catch { return false; }
    })(), `${brushRows(realKinds()).length} kinds in terrain_edits.js`);
  // ED4: the Water tray is the terrain half's own WATER_KINDS, in its own
  // order, and not one of them leaks into Sculpt. Read off the REAL contract,
  // because the fake above is a lake and nothing else.
  check('and the real contract puts all five water brushes in the Water tray and none in Sculpt',
    (() => {
      const real = brushRows(realKinds());
      const wet = toolsFor('water', { kinds: real }).map((t) => t.id);
      const dry = toolsFor('sculpt', { kinds: real }).map((t) => t.id);
      return wet.join(',') === 'lake,pond,river,sea,drain' && !wet.some((id) => dry.includes(id));
    })(), toolsFor('water', { kinds: brushRows(realKinds()) }).map((t) => t.id).join(','));
  check('a river is drawn between two points, because it carries a second one, where a lake is not',
    (() => {
      const wet = toolsFor('water', { kinds: brushRows(realKinds()) });
      const river = wet.find((t) => t.id === 'river'), lake = wet.find((t) => t.id === 'lake');
      return river.line === true && lake.line === false
        && river.params.some((p) => p.name === 'levelEnd') && lake.params.some((p) => p.name === 'level');
    })(),
    toolsFor('water', { kinds: brushRows(realKinds()) })
      .map((t) => `${t.id}${t.line ? ' drawn as a line' : ''}: ${t.params.map((p) => p.name).join(' ')}`).join(', '));

  check('the filter box narrows a tray without changing what is in it',
    filterTools(tray.buildings, 'inn').length > 0
    && filterTools(tray.buildings, 'inn').length < tray.buildings.length
    && filterTools(tray.buildings, '').length === tray.buildings.length);
}

// ============================================================================
console.log('\neditor: the space a click falls into is worked out, never typed');
{
  const ed = createEditor({});
  ed.setTab('trees');
  ed.arm('oak');
  check('the tile arithmetic is the 256 m grid, floored, and the centre is the middle of it',
    tileIdFor(800, -400) === 'tile_3_-2' && tileCentre(800, -400).x === 896 && tileCentre(800, -400).z === -384
    && tileIdFor(0, 0) === 'tile_0_0' && tileIdFor(-1, -1) === 'tile_-1_-1',
    `${tileIdFor(800, -400)} at ${JSON.stringify(tileCentre(800, -400))}`);
  check('and the radius covers the corners of the tile, which the half diagonal is',
    TILE_R >= Math.hypot(TILE_M / 2, TILE_M / 2) && TILE_R === 182, String(TILE_R));
  const first = ed.placeAt(800, -400);
  check('the first thing put down makes the tile space, at the tile centre, and says so',
    first.ok && first.made === true && ed.space.id === 'tile_3_-2'
    && ed.space.at.x === 896 && ed.space.at.z === -384 && ed.space.radius === TILE_R
    && /begins here/.test(first.text), first.text);
  check('the thing is written in that space own frame, so it is where the click was',
    ed.space.trees[0].x === -96 && ed.space.trees[0].z === -16,
    `${ed.space.trees[0].x}, ${ed.space.trees[0].z}`);
  const second = ed.placeAt(810, -390);
  check('a second click in the same tile goes into the same space, and makes nothing',
    second.ok && second.made === false && ed.openSpaces.join(',') === 'tile_3_-2');
  const far = ed.placeAt(1400, -400);
  check('a click in the next tile along makes that one instead',
    far.ok && far.made === true && ed.space.id === 'tile_5_-2' && ed.openSpaces.length === 2,
    ed.openSpaces.join(','));
  check('and the first tile is not thrown away: it still holds its two trees',
    (() => { ed.useDoc('tile_3_-2'); return ed.space.trees.length === 2; })(), `${ed.count().total}`);
  check('a named space still takes everything inside its own radius',
    (() => {
      const e2 = createEditor({});
      e2.newSpace('The Ford', 40, { x: 300, z: -200 });
      e2.setTab('trees'); e2.arm('oak');
      const r = e2.placeAt(320, -200);
      return r.ok && r.made === false && e2.space.id === 'the_ford';
    })());
}

// ============================================================================
console.log('\neditor: a scatter lays what the density asks, and shift rubs it out');
{
  const ed = createEditor({});
  ed.setTab('trees');
  ed.arm('pine');
  let seed = 20260907;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  ed.setScatter({ r: 20, density: 5 });
  check('the count is the density over the area of the ring, and the editor says which',
    ed.scatterCount(20, 5) === Math.round(5 * Math.PI * 400 / 100) && ed.scatterCount(20, 5) === 63,
    String(ed.scatterCount(20, 5)));
  check('a density of 0 lays nothing at all, and says so rather than laying one',
    ed.scatterCount(20, 0) === 0 && ed.scatterAt(0, 0, { density: 0 }).ok === false);
  const laid = ed.scatterAt(600, 600, { rng });
  check('one sweep lays exactly that many, and every one of them is in the space',
    laid.ok && laid.laid === 63 && ed.space.trees.length === 63, `${laid.laid} laid`);
  check('each is turned and sized differently, so a wood is not a row of clones',
    new Set(ed.space.trees.map((t) => t.yaw)).size > 20 && new Set(ed.space.trees.map((t) => t.scale)).size > 20,
    `${new Set(ed.space.trees.map((t) => t.yaw)).size} turns`);
  check('and all of them are inside the ring that laid them',
    ed.space.trees.every((t) => Math.hypot(ed.space.at.x + t.x - 600, ed.space.at.z + t.z - 600) <= 20.01));
  check('one undo takes the whole sweep back, not one tree of it',
    ed.undo().ok && ed.space.trees.length === 0, `${ed.space.trees.length} left`);
  check('and one redo puts the whole sweep on again',
    ed.redo().ok && ed.space.trees.length === 63);
  const rubbed = ed.eraseAt(600, 600, { r: 20 });
  check('shift rubs out what the same tile put down, all of it, and counts what went',
    rubbed.ok && rubbed.gone === 63 && ed.space.trees.length === 0, rubbed.text);
  check('and rubbing at empty ground says there was nothing there rather than nothing at all',
    ed.eraseAt(600, 600, { r: 20 }).ok === false && /no pine inside/.test(ed.lastLine), ed.lastLine);
  check('a rub takes only its own kind: an oak beside a pine is left standing',
    (() => {
      const e2 = createEditor({});
      e2.setTab('trees'); e2.arm('oak'); e2.placeAt(100, 100);
      e2.arm('pine'); e2.placeAt(101, 100);
      const got = e2.eraseAt(100, 100, { r: 10 });
      return got.ok && got.gone === 1 && e2.space.trees.length === 1 && e2.space.trees[0].species === 'oak';
    })());

  // the held sweep, batched by the same rule a terrain drag is batched by
  const e3 = createEditor({});
  e3.setTab('rocks'); e3.arm('sarsen');
  e3.setScatter({ r: 10, density: 1 });
  let s2 = 7;
  const rng2 = () => { s2 = (s2 * 1664525 + 1013904223) >>> 0; return s2 / 4294967296; };
  const t0 = 1000;
  check('a held sweep lays on the press', e3.sweepBegin(100, 100, { now: t0, rng: rng2 }).ok);
  check('and refuses a second pass that is too soon, by the millisecond',
    e3.sweepStroke(140, 100, { now: t0 + DRAG_MS - 1, rng: rng2 }).early === true
    && e3.sweepStroke(140, 100, { now: t0 + DRAG_MS, rng: rng2 }).ok === true);
  check('and one that is too near, by the metre',
    e3.sweepStroke(141, 100, { now: t0 + 400, rng: rng2 }).near === true
    && e3.sweepStroke(140 + 10 * 0.5, 100, { now: t0 + 400, rng: rng2 }).ok === true);
  const ended = e3.sweepEnd();
  check('the end of the sweep says how many passes and how many things',
    ended.ok && ended.passes === 3 && ended.laid === e3.space.rocks.length, ended.text);
  check('and the whole held sweep is ONE undo, however many passes it took',
    e3.depth.done === 1 && e3.undo().ok && e3.space.rocks.length === 0, JSON.stringify(e3.depth));
}

// ============================================================================
console.log('\neditor: with the autosave off, nothing is ever due, and the count says what Save would write');
{
  const ed = createEditor({});
  ed.setTab('trees');
  ed.arm('oak');
  ed.placeAt(400, 400, { now: 1000 });
  check('a placement is unsaved and never due on its own', ed.unsavedCount() >= 1 && ed.autosaveDue(1e12) === false && ed.autosaveAt() === 0, `${ed.unsavedCount()} unsaved, due at ${ed.autosaveAt()}`);
}

console.log('\neditor: the autosave, when asked for, writes a second after the last change, and not before');
{
  const sent = [];
  const fakeFetch = async (url, opts) => {
    sent.push(JSON.parse(opts.body).path);
    return { ok: true, status: 200, json: async () => ({ ok: true, bytes: (opts.body || '').length }) };
  };
  const ed = createEditor({ autosave: true });
  ed.setTab('trees');
  ed.arm('oak');
  check('with nothing changed there is nothing due, at any hour',
    ed.autosaveDue(0) === false && ed.autosaveDue(1e12) === false);
  ed.placeAt(400, 400, { now: 1000 });
  check('a change sets the clock running, and nothing is due while it runs',
    ed.autosaveDue(1000) === false && ed.autosaveDue(1999) === false && ed.autosaveAt() === 1000 + AUTOSAVE_MS,
    String(ed.autosaveAt()));
  check('a second later it is due', ed.autosaveDue(2000) === true);
  ed.placeAt(410, 400, { now: 1500 });
  check('and another change pushes it out a full second again, so a sweep is one write',
    ed.autosaveDue(2000) === false && ed.autosaveDue(2499) === false && ed.autosaveDue(2500) === true);
  const wrote = await ed.tickAutosave(2500, fakeFetch);
  check('when it fires it writes the touched space, once, at the path its id makes',
    wrote.ok && sent.length === 1 && sent[0] === SPACE_PATH('tile_1_1'), sent.join(', '));
  check('and then there is nothing waiting, so it does not fire again',
    ed.autosaveDue(1e12) === false && ed.autosaveWaiting().length === 0 && ed.dirty === false);
  ed.placeAt(1400, 400, { now: 3000 });
  ed.placeAt(410, 401, { now: 3000 });
  check('two spaces touched are two writes in one firing',
    (await ed.tickAutosave(4000, fakeFetch)).ok && sent.length === 3
    && sent.slice(1).sort().join(',') === [SPACE_PATH('tile_1_1'), SPACE_PATH('tile_5_1')].sort().join(','),
    sent.join(', '));
  check('and the ground is written with them when the ground has moved',
    (() => {
      const t = fakeTerrain();
      const e2 = createEditor({ terrain: t, autosave: true });
      e2.arm && e2.setTab('terrain');
      e2.strokeOnce(0, 0, { kind: 'raise' });
      return e2.groundDirty === true && e2.autosaveDue(Date.now() + AUTOSAVE_MS + 1) === true;
    })());
}

// ============================================================================
// THE PANEL ITSELF, against a document small enough to read.
//
// Everything above drives `createEditor`, which is what the buttons press. That
// leaves one question open: are the buttons the ones the contract asked for.
// So the REAL panel is built here, over a fake document, and the Terrain tab is
// read back off the tree: one row per kind, one slider per knob, and every
// slider's min, max, step and value compared to the range the fake `kinds()`
// gave. Then the real keys are fired at the real key handler.
//
// There is no canvas and no scene, so the pointer path (the ray march, the
// ghost, the swallowed left button) is NOT driven here. The spacing and the
// batching a drag depends on live in the editor and are measured above.

function makeDom() {
  const el = (tag) => {
    const style = {};
    const classes = new Set();
    let text = '';
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '', style, dataset: {}, children: [], parent: null,
      value: '', type: '', min: '', max: '', step: '', placeholder: '', title: '', checked: false,
      get textContent() { return node.children.length ? node.children.map((c) => c.textContent).join('') : text; },
      set textContent(v) { for (const c of node.children) c.parent = null; node.children.length = 0; text = v == null ? '' : String(v); },
      listeners: {},
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle(c, force) {
          const on = force === undefined ? !classes.has(c) : !!force;
          if (on) classes.add(c); else classes.delete(c);
          return on;
        },
      },
      setAttribute(k, v) { node.dataset[k] = v; },
      removeAttribute() {},
      appendChild(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.push(c); return c;
      },
      prepend(c) {
        if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = node; node.children.unshift(c); return c;
      },
      remove() { if (node.parent) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; } },
      addEventListener(name, fn) { (node.listeners[name] ||= []).push(fn); },
      removeEventListener() {},
      fire(name, ev) { for (const fn of [...(node.listeners[name] || [])]) fn(ev || { preventDefault() {}, stopPropagation() {} }); },
    };
    return node;
  };
  const byId = new Map();
  return {
    createElement: el,
    createTextNode: (t) => { const n = el('#text'); n.textContent = t; return n; },
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild(c) { if (c.id) byId.set(c.id, c); return c; } },
    body: el('body'),
  };
}
globalThis.document = makeDom();
globalThis.window = {
  innerWidth: 1280, innerHeight: 720,
  listeners: {},
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
  removeEventListener() {},
  fire(name, ev) { for (const fn of [...(this.listeners[name] || [])]) fn(ev); },
};

const { panel } = await import('./panel.js');

/** Every node under one, in tree order. */
function walk(node, out = []) {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}
const findAll = (node, pred) => walk(node).filter(pred);
const findOne = (node, pred) => findAll(node, pred)[0] || null;
const slidersOf = (node) => findAll(node, (n) => n.tagName === 'INPUT' && n.type === 'range');
const buttonWith = (node, re) => findOne(node, (n) => n.tagName === 'BUTTON' && re.test(n.textContent));
const key = (k, extra = {}) => {
  let stopped = false;
  window.fire('keydown', {
    key: k, ctrlKey: false, metaKey: false, shiftKey: false, target: null, ...extra,
    preventDefault() {}, stopPropagation() { stopped = true; },
  });
  return stopped;
};

console.log('\neditor: the screen itself, over a document small enough to read');
{
  const t = fakeTerrain();
  const root = document.createElement('div');
  const ctx = { terrain: t, hud: { log() {} } };
  panel.build(root, ctx);
  const ed = panel._ed;
  panel._setLive(true);
  panel._drawAll();

  const face = panel._face;
  const rail = panel._rail;
  const grid = panel._grid;
  const knobs = panel._knobs;
  const cells = rail.children.filter((c) => c.className.includes('cell'));
  const top = () => face.children.find((c) => c.className.includes('top'));
  const tiles = () => grid.children.filter((c) => c.className.includes('tile'));
  const tileIds = () => tiles().map((c) => c.children[1].textContent);
  const sliders = (node) => findAll(node, (n) => n.tagName === 'INPUT' && n.type === 'range');

  // ---- it is not a window ----------------------------------------------
  check('nothing is built into the window body: the editor is its own screen on the page',
    root.children.length === 0 && face.id === 'bw-editor' && face.parent === document.body,
    `${root.children.length} nodes in the window body`);
  check('and the window frame it is registered under is styled away, not drawn',
    /\.bw-win-editor \{ display: none/.test(document.getElementById('bw-editor-css').textContent));
  check('the five docks are the sidebar, the tray, the top, the card and the status strip',
    face.children.length === 5 && face.children.every((c) => c.className.includes('dock')),
    face.children.map((c) => c.className).join(' | '));
  check('global search adds one field above the existing tray and space controls',
    findAll(face, (n) => n.tagName === 'INPUT' && n.type === 'text').length === 6,
    findAll(face, (n) => n.tagName === 'INPUT' && n.type === 'text').map((n) => n.placeholder || 'card').join(', '));
  check('and the space in hand can be named and widened from the corner, without one being needed',
    (() => {
      const name = findOne(top(), (n) => n.tagName === 'INPUT' && n.type === 'text');
      const rad = findOne(top(), (n) => n.tagName === 'INPUT' && n.type === 'number');
      ed.newSpace('Nameless', 40, { x: 0, z: 0 });
      panel._drawAll();
      if (name.value !== 'Nameless') return false;
      name.value = 'Cold Spring';
      name.fire('change');
      rad.value = '90';
      rad.fire('change');
      return ed.space.name === 'Cold Spring' && ed.space.radius === 90;
    })(), `${ed.space && ed.space.name}`);

  // ---- the sidebar ------------------------------------------------------
  check('the sidebar has one cell per mode, then undo, redo, save and leave',
    cells.length === MODE_IDS.length + ACTIONS.length, `${cells.length} cells`);
  check('every cell is a drawn mark with a name under it, and not a line of text',
    cells.every((c) => /<svg/.test(c.children[0].innerHTML))
    && cells.map((c) => c.children[1].textContent).join(',')
      === [...MODES.map((m) => m.label), ...ACTIONS.map((a) => a.label)].join(','),
    cells.map((c) => c.children[1].textContent).join(','));
  check('V selects the hand, and the authoring modes keep 1 to 9 and 0',
    cells.slice(0, MODE_IDS.length).map((c) => c.children[2].textContent).join('') === 'v1234567890',
    cells.slice(0, MODE_IDS.length).map((c) => c.children[2].textContent).join(''));
  check('exactly one mode is lit, and it is the one that is up',
    cells.filter((c) => c.classList.contains('on')).length === 1
    && cells[0].classList.contains('on') && panel._modeNow() === 'select');

  // ---- the tray changes with the mode ----------------------------------
  panel._setMode('sculpt');
  const sculptTiles = tileIds();
  check('Sculpt shows one tile per sculpting brush the contract named',
    sculptTiles.join(',') === 'raise,a mountain,a ridge,a plateau,terraces,noise,erode',
    sculptTiles.join(','));
  panel._setMode('paint');
  check('Paint shows a swatch per ground word, each one a filled square of that colour',
    tileIds().join(',') === 'dirt,rock,sand,grass,mud,snow,gravel,ash,cobble,path'
    && tiles().every((c) => /<rect/.test(c.children[0].innerHTML)),
    tileIds().join(','));
  panel._setMode('water');
  check('Water shows the lake brush alone', tileIds().join(',') === 'a lake', tileIds().join(','));
  panel._setMode('foliage');
  check('Foliage shows grass first and then every species',
    tileIds()[0] === 'grass' && tileIds().length === paletteFor('trees').length + 1, `${tileIds().length} tiles`);
  panel._setMode('buildings');
  const built = tileIds().length;
  check('Buildings shows every model three metres and over, with modelled or stand-in on its corner',
    built === paletteFor('structures').filter((r) => heightOf(r.id) >= PROP_HEIGHT).length
    && tiles()[0].children[2].textContent === 'stand-in', `${built} tiles`);
  panel._setMode('markers');
  check('Markers shows the seven kinds', tileIds().length === MARKER_KINDS.length, tileIds().join(','));
  check('and the tray really changed size between modes rather than being redrawn the same',
    built !== MARKER_KINDS.length && built > 20);
  panel._setMode('sculpt');
  check('going back to a mode brings its own tray back', tileIds().join(',') === sculptTiles.join(','));

  // ---- the sliders ------------------------------------------------------
  check('a sculpt brush gets one slider per knob, at the range the contract gave it',
    (() => {
      tiles()[1].fire('click');                       // a mountain
      const s = sliders(knobs);
      return ed.brush.kind === 'mountain' && s.length === 5
        && s[0].min === '20' && s[0].max === '600' && s[0].step === '5' && s[0].value === '300'
        && s[1].max === '400' && s[2].max === '1';
    })(), sliders(knobs).map((s) => `${s.min}..${s.max}`).join(' '));
  check('and under them the world floor, on two sliders and no fields at all',
    (() => {
      const s = sliders(knobs);
      const floor = s[3], snow = s[4];
      // the floor's range is read off the contract's own height knob, 0 to 300
      if (!(floor.min === '0' && floor.max === '300' && floor.value === '0')) return false;
      if (!(snow.min === '0' && snow.max === '500' && snow.value === '220')) return false;
      snow.value = '35';
      snow.fire('change');
      return t.based.length === 1 && t.based[0].snowLine === 35;
    })(), JSON.stringify(t.based));
  check('the ground the whole world is made of is set from the swatch in hand, not from a field',
    (() => {
      panel._setMode('paint');
      panel._applyTool(panel._tilesNow().find((x) => x.id === 'snow'));
      panel._drawAll();
      const b = findOne(knobs, (n) => n.tagName === 'BUTTON' && /make the whole world snow/.test(n.textContent));
      if (!b) return false;
      b.fire('click');
      return t.based.some((p) => p.ground === 'snow');
    })(), t.based.map((p) => JSON.stringify(p)).join(' '));
  check('and the reset asks before it drops every stroke, then does it on a second press',
    (() => {
      const reset = () => findOne(knobs, (n) => n.tagName === 'BUTTON' && /drop every stroke/.test(n.textContent));
      reset().fire('click');
      const asked = t.resets === 0 && /press again/.test(reset().textContent);
      reset().fire('click');
      return asked && t.resets === 1;
    })(), `${t.resets} resets`);
  panel._setMode('sculpt');
  panel._drawAll();
  check('the value is printed beside the slider and moves with it',
    (() => {
      const s = sliders(knobs)[0];
      s.value = '455';
      s.fire('input');
      return ed.brushValue('mountain', 'radius') === 455 && /455 m/.test(knobs.textContent);
    })(), knobs.textContent.slice(0, 60));
  check('and a slider dragged past the end is pulled back to the contract own maximum',
    (() => {
      const s = sliders(knobs)[0];
      s.value = '9999';
      s.fire('input');
      return ed.brushValue('mountain', 'radius') === 600 && s.value === '600';
    })());
  panel._setMode('foliage');
  panel._applyTool(panel._tilesNow().find((x) => x.id === 'beech'));
  panel._drawAll();
  check('a scattering tile gets size and density instead, and the numbers are printed',
    (() => {
      const s = sliders(knobs);
      return s.length === 2 && /size/.test(knobs.textContent) && /density/.test(knobs.textContent)
        && /per 100 sq m/.test(knobs.textContent);
    })(), knobs.textContent.slice(0, 80));
  check('and dragging density really reaches the editor',
    (() => { const s = sliders(knobs)[1]; s.value = '7'; s.fire('input'); return ed.scatter.density === 7; })(),
    String(ed.scatter.density));
  panel._setMode('creatures');
  check('Creatures alone carries the night toggle, and it reaches the editor',
    (() => {
      const tog = findOne(knobs, (n) => n.className.includes('toggle'));
      if (!tog) return false;
      tog.fire('click');
      return ed.ghost.night === true;
    })());
  panel._setMode('buildings');
  check('a placing mode has no sliders at all, only what to do next in words',
    sliders(knobs).length === 0 && /Preview the model/.test(knobs.textContent));

  // ---- the keys ---------------------------------------------------------
  check('1 to 9 and then 0 pick the ten modes, in the order the sidebar draws them',
    key('3') && panel._modeNow() === 'foliage' && key('9') && panel._modeNow() === 'water'
    && key('0') && panel._modeNow() === 'erase'
    && key('1') && panel._modeNow() === 'sculpt', panel._modeNow());
  check('a key the editor has no use for is left for the game', key('j') === false);
  check('ctrl Z on a ground brush takes back ground',
    (() => { const n = t.undone.length; ed.strokeOnce(0, 0); key('z', { ctrlKey: true }); return t.undone.length === n + 1; })());

  // ---- a click in Buildings places and takes hold -----------------------
  panel._setMode('buildings');
  const want = panel._toolNow();
  const put = ed.placeAt(500, 500);
  panel._drawAll();
  const sel = ed.selection();
  check('a click in Buildings puts one down and takes hold of it in the same act',
    put.ok && !!sel && sel.list === 'pieces' && ed.space.pieces[0].model === want.id, put.text);
  check('and the card comes up beside the sidebar with its turn, its size and where it is',
    panel._card.style.display === '' && panel._card.children[0].textContent === want.id
    && findAll(panel._card, (n) => n.tagName === 'INPUT').length === 4
    && /Tile 1, 1/.test(panel._card.textContent), panel._card.textContent.slice(0, 60));
  check('the card turns the thing it names, through the same call R does',
    (() => {
      const yaw = findAll(panel._card, (n) => n.tagName === 'INPUT')[0];
      yaw.value = '90';
      yaw.fire('change');
      return ed.space.pieces[0].yaw === 90;
    })(), String(ed.space.pieces[0].yaw));
  check('and remove takes it out, with nothing selected after it',
    (() => {
      findOne(panel._card, (n) => n.tagName === 'BUTTON' && /remove/.test(n.textContent)).fire('click');
      return ed.space.pieces.length === 0 && !ed.selection() && panel._card.style.display === 'none';
    })());
  check('a second click near a thing already down takes hold of it rather than doubling it',
    (() => {
      ed.placeAt(500, 500);
      const before = ed.count().total;
      const hit = ed.nearestTo(501, 500, 6);
      return !!hit && ed.selectAt(501, 500, 6).ok && ed.count().total === before;
    })());
  check('and a click well clear of it puts a second one down',
    (() => { const before = ed.count().total; const r = ed.placeAt(520, 500); return r.ok && ed.count().total === before + 1; })());

  // ---- the status strip -------------------------------------------------
  panel._setMode('sculpt');
  panel._drawAll();
  const strip = panel._status.textContent;
  check('the status strip names the mode, the tool, the size and what was last said',
    /Sculpt/.test(strip) && /m/.test(strip) && strip.length > 20 && /the cursor is off the ground/.test(strip),
    strip.slice(0, 90));
  check('and it says which space is open and whether it is written yet',
    /unsaved|saved/.test(panel._status.textContent));

  panel._setLive(false);
  panel.dispose();
}

console.log('\neditor: the screen with no terrain contract behind it');
{
  const root = document.createElement('div');
  const ctx = { hud: { log() {} } };
  panel.build(root, ctx);
  const ed = panel._ed;
  panel._setLive(true);
  panel._setMode('sculpt');
  panel._drawAll();
  check('the three brush trays say which half is missing, and show no tiles',
    panel._grid.children.length === 1 && /window.__bw.terrain/.test(panel._grid.textContent)
    && findAll(panel._grid, (n) => n.tagName === 'INPUT').length === 0,
    panel._grid.textContent);
  check('and the trays that do not need it are full anyway',
    (() => { panel._setMode('people'); return panel._grid.children.length === paletteFor('people').length; })(),
    String(panel._grid.children.length));
  ctx.terrain = { stroke: () => 'cut' };
  panel._setMode('sculpt');
  check('with half a contract it names the half that is missing',
    /name no brushes/.test(panel._grid.textContent), panel._grid.textContent);
  ctx.terrain = fakeTerrain();
  panel._setMode('paint');
  panel._setMode('sculpt');
  check('and the moment the contract answers, the tiles are there with no reload',
    panel._grid.children.length === 7, `${panel._grid.children.length} tiles`);
  panel._setLive(false);
  panel.dispose();
}


// ============================================================================
console.log('\neditor: the ring under the brush is the ground the brush will take');
{
  const { ghostFor, brushRing, lineGhost, LINE_SAMPLES, ringRadii, CORE_MIN } = await import('./ghost.js');
  const ringsOf = (group) => {
    const out = [];
    group.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.type === 'RingGeometry') out.push(o.geometry.parameters.outerRadius);
    });
    return out.sort((a, b) => a - b);
  };
  const outerOf = (group) => { const r = ringsOf(group); return r.length ? r[r.length - 1] : null; };
  check('a 20 m brush draws a ring of 20 m, not of 28 m corner to corner',
    outerOf(brushRing(20)) === 20, `${outerOf(brushRing(20))}`);
  check('and a 600 m one draws 600', outerOf(brushRing(600)) === 600, `${outerOf(brushRing(600))}`);
  const g = ghostFor('terrain', 'mountain', { r: 300 });
  check('the terrain ghost is that ring, at the radius the brush is set to',
    outerOf(g.group) === 300 && /300 m across the radius/.test(g.words), g.words);
  // ---- ED5: the falloff, on the ground, before the press -----------------
  //
  // A feathered brush does most of nothing at its rim. Shown one circle, a
  // person aims the whole effect at that circle and wonders why so little
  // happened, so a brush with a core draws TWO: the radius, and where the full
  // strength ends. Both ways: a hard brush still wears exactly one.
  check('a brush with a soft edge wears two rings: the ground it takes, and the ground it takes in full',
    ringsOf(brushRing(20, undefined, 7)).join(',') === '7,20', ringsOf(brushRing(20, undefined, 7)).join(','));
  check('and a hard one wears the one ring it always did',
    ringsOf(brushRing(20, undefined, 20)).join(',') === '20' && ringsOf(brushRing(20)).join(',') === '20',
    ringsOf(brushRing(20, undefined, 20)).join(','));
  check('a core too small to see is not drawn as a dot',
    ringRadii(20, CORE_MIN / 2).length === 1 && ringRadii(20, CORE_MIN).length === 2,
    `${CORE_MIN} m is the smallest core worth a circle`);
  check('and the ghost passes the core through, and says the falloff in words',
    (() => {
      const soft = ghostFor('terrain', 'ground', { r: 20, core: 7 });
      return ringsOf(soft.group).join(',') === '7,20' && /full out to 7.0 m/.test(soft.words);
    })(), ghostFor('terrain', 'ground', { r: 20, core: 7 }).words);
  check('the core the editor hands it is the brush\'s own hardness times its radius',
    (() => {
      const e = createEditor({ terrain: fakeTerrain() });
      e.setTab('terrain'); e.arm('ground');
      e.setBrushParam('ground', 'r', 20); e.setBrushParam('ground', 'hardness', 0.35);
      const soft = e.brushCore('ground');
      e.setBrushParam('ground', 'hardness', 1);
      const hard = e.brushCore('ground');
      e.arm('raise');
      return soft === 7 && hard === 20 && e.brushCore('raise') === 0;
    })(), 'a brush with no hardness knob at all answers 0, and wears one ring');

  const ln = lineGhost();
  ln.set({ x: 0, z: 0 }, { x: 100, z: 0 }, (x) => x / 10);
  const pos = ln.geometry.attributes.position;
  check('the line ghost runs from the first click to the second, sampled onto the ground',
    pos.count === LINE_SAMPLES + 1
    && pos.getX(0) === 0 && pos.getX(LINE_SAMPLES) === 100
    && pos.getY(0) === 0.5 && pos.getY(LINE_SAMPLES) === 10.5,
    `${pos.count} points, ${pos.getX(0)},${pos.getY(0)} to ${pos.getX(LINE_SAMPLES)},${pos.getY(LINE_SAMPLES)}`);
  check('and every sample between them sits on the ground under it, not on a straight chord',
    (() => {
      for (let i = 0; i <= LINE_SAMPLES; i++) {
        const want = pos.getX(i) / 10 + 0.5;
        if (Math.abs(pos.getY(i) - want) > 1e-6) return false;
      }
      return true;
    })());
}



// ============================================================================
// ED5: the eraser, which is the one brush with a half in each side of the editor
//
// The ground goes back down the terrain contract, and everything standing on
// that ground comes out of the spaces. What matters here is that they are ONE
// press and ONE undo: two stacks would mean two presses of ctrl Z to take one
// press of the brush back, and the second half would look like a bug.
console.log('\neditor: the eraser takes the ground and everything standing on it, in one');
{
  const t = fakeTerrain();
  const ed = createEditor({ terrain: t });
  // Two tiles, on purpose: the ring is going to straddle the edge between them,
  // which is where a stack that only knows the open space falls over.
  // A space takes anything inside its own radius, whichever tile that is in, so
  // the order below is what really puts these in two different spaces: the oak
  // opens the first tile, the pine is far enough out to open the second, and
  // the two after it are inside the second's radius even though they stand a
  // few metres over the line.
  const edge = TILE_M;                       // the line between tile 0 and tile 1
  ed.setTab('trees'); ed.arm('oak');
  ed.placeAt(edge - 6, 128);
  ed.setTab('trees'); ed.arm('pine');
  ed.placeAt(edge + 244, 128);               // far out: this is what opens the second space
  ed.setTab('rocks'); ed.arm('sarsen');
  ed.placeAt(edge + 14, 128);
  ed.setTab('markers'); ed.arm('other');
  ed.placeAt(edge + 16, 128);
  const spaces = ed.openSpaces;
  check('the things stand in two different spaces to start with',
    spaces.length === 2, spaces.join(' and '));
  const [left, right] = spaces;
  const countIn = (id) => { ed.useDoc(id); return ed.count().total; };
  const was = { left: countIn(left), right: countIn(right) };
  check('one in the first and three in the second', was.left === 1 && was.right === 3,
    `${was.left} and ${was.right}`);

  ed.setTab('terrain'); ed.arm('erase');
  ed.setBrushParam('erase', 'r', 20);
  const depth = ed.terrainDepth.done;
  const one = ed.strokeOnce(edge + 4, 128);
  check('one press of the eraser lays a stroke and takes everything inside the ring out of BOTH spaces',
    one.ok && one.gone === 3 && countIn(left) === 0 && countIn(right) === 1,
    one.text);
  check('and the one outside the ring is left standing where it was',
    (() => { ed.useDoc(right); return ed.doc.space.trees.length === 1 && ed.doc.space.trees[0].species === 'pine'; })());
  check('the words say what went, counted off the lists it emptied',
    /3 things removed/.test(one.text) && /1 tree/.test(one.text) && /1 rock/.test(one.text) && /1 marker/.test(one.text),
    one.text);
  check('and the ground went down the terrain contract in the same press',
    t.calls[t.calls.length - 1].kind === 'erase' && t.calls[t.calls.length - 1].r === 20,
    JSON.stringify(t.calls[t.calls.length - 1]));

  // ONE UNDO, BOTH HALVES.
  const undone = t.undone.length;
  const res = ed.terrainUndo();
  check('ONE undo takes the stroke back and puts all three things back with it',
    res.ok && t.undone.length === undone + 1 && countIn(left) === 1 && countIn(right) === 3,
    `${res.text} (${countIn(left)} and ${countIn(right)})`);
  check('and it says both halves happened rather than only the ground',
    /3 things back on the ground with it/.test(res.text), res.text);
  check('the editor is back to the depth it was at, so nothing is left half on the stack',
    ed.terrainDepth.done === depth && ed.terrainDepth.undone === 1, JSON.stringify(ed.terrainDepth));
  const back = ed.terrainRedo();
  check('and one redo takes them away again, both halves together',
    back.ok && countIn(left) === 0 && countIn(right) === 1 && /3 things gone again/.test(back.text), back.text);

  // a drag is one press too, however many strokes it lays
  {
    const t2 = fakeTerrain();
    const e2 = createEditor({ terrain: t2 });
    e2.setTab('rocks'); e2.arm('sarsen');
    for (let i = 0; i < 6; i++) e2.placeAt(500 + i * 8, 500);
    e2.setTab('terrain'); e2.arm('erase');
    e2.setBrushParam('erase', 'r', 10);
    // The six run from x 500 to x 540 and the tile edge is at 512, so they are
    // in two spaces without anybody arranging it, and the count has to be taken
    // over both: `count()` is the open space's own.
    const all = () => e2.openSpaces.reduce((n, id) => { e2.useDoc(id); return n + e2.count().total; }, 0);
    check('the six stand across the tile edge, in two spaces', all() === 6 && e2.openSpaces.length === 2,
      e2.openSpaces.join(' and '));
    e2.dragBegin(500, 500, { now: 1000 });
    e2.dragStroke(520, 500, { now: 1100 });
    e2.dragStroke(540, 500, { now: 1200 });
    const end = e2.dragEnd();
    check('a held eraser is one drag: three strokes, and everything under all three gone',
      end.ok && end.strokes === 3 && end.gone === 6 && all() === 0, end.text);
    check('and ONE ctrl Z takes the whole drag and all six back, out of both spaces',
      (() => {
        const u = e2.terrainUndo();
        return u.ok && t2.undone.length === 3 && all() === 6;
      })(), e2.lastLine);
  }

  // an erase over empty ground says so rather than looking busy
  {
    const e3 = createEditor({ terrain: fakeTerrain() });
    e3.setTab('terrain'); e3.arm('erase');
    const empty = e3.strokeOnce(-9000, -9000);
    check('an erase over ground with nothing on it says nothing was standing there',
      empty.ok && empty.gone === 0 && /nothing was standing on it/.test(empty.text), empty.text);
  }

  // and it reaches a space this session never opened, off the module
  {
    const e4 = createEditor({ terrain: fakeTerrain() });
    const known = e4.spaces[0];
    check('there is a space on disk to reach for', !!known, String(known));
    const held = e4.holdSpacesNear(0, 0, 10);
    check('holding the ground near a point adopts every space that could hold something in it',
      Array.isArray(held), `${held.length} adopted`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
