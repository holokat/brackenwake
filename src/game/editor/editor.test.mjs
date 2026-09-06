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
import { createEditor, SPACE_PATH, SAVE_URL } from './editor.js';
import { paletteFor, entryFor, search, TABS, TAB_IDS, BRUSH_IDS, MARKER_KINDS, brushRow, brushRows, brushParam } from './palette.js';
import { emptySpace } from '../../mmo/spaces/index.js';
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

  check('placing with nothing open is refused in words',
    ed.placeAt(0, 0).ok === false && /no space open/.test(ed.lastLine));
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
  check('placing outside the radius is refused, with how far outside it was',
    ed.placeAt(300 + 60, -200).ok === false && /m outside/.test(ed.lastLine), ed.lastLine);

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
  { kind: 'ground', label: 'the ground itself', params: [{ name: 'r', min: 1, max: 400, step: 1, default: 30 }], words: ['dirt', 'rock', 'sand', 'grass', 'mud', 'snow', 'gravel', 'ash', 'cobble', 'path'] },
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

console.log('\neditor: the Terrain tab is built out of kinds(), slider for slider');
{
  const t = fakeTerrain();
  const root = document.createElement('div');
  const ctx = { terrain: t, hud: { log() {} } };
  panel.build(root, ctx);
  const ed = panel._ed;
  ed.setTab('terrain');
  panel._setLive(true);
  panel._drawAll();

  const rows = panel._brushList.children;
  check('the tab shows one row per kind the contract named, and no more',
    rows.length === KINDS.length, `${rows.length} rows for ${KINDS.length} kinds`);
  check('each row is numbered for its key and carries the contract\'s own label',
    rows[0].textContent.startsWith('1. raise') && rows[2].textContent.startsWith('3. a mountain'),
    rows[2].textContent.slice(0, 24));
  check('and a two click brush says so on its face',
    /two clicks/.test(rows[3].textContent) && !/two clicks/.test(rows[0].textContent));

  const mtn = rows[2];
  const sl = slidersOf(mtn);
  check('the mountain row has a slider for each of its three knobs', sl.length === 3, `${sl.length} sliders`);
  check('and the radius slider runs to the 600 m the contract allows, not to 120',
    sl[0].min === '20' && sl[0].max === '600' && sl[0].step === '5' && sl[0].value === '300',
    `${sl[0].min}..${sl[0].max} step ${sl[0].step} at ${sl[0].value}`);
  check('the lift slider runs to 400 m',
    sl[1].min === '5' && sl[1].max === '400' && sl[1].value === '120');
  check('and a knob that is not a distance keeps its own fine step',
    sl[2].min === '0' && sl[2].max === '1' && sl[2].step === '0.05' && sl[2].value === '0.4');
  check('a smaller brush gets a smaller slider, off its own row and not a shared one',
    (() => { const s = slidersOf(rows[0]); return s[0].max === '200' && s[1].max === '60'; })());
  check('every slider on the tab came from a knob in kinds(), one for one',
    slidersOf(panel._brushList).length === KINDS.reduce((n, k) => n + (k.params || []).length, 0),
    `${slidersOf(panel._brushList).length} sliders`);

  const ground = rows[10];
  const picker = findOne(ground, (n) => n.tagName === 'SELECT');
  check('the ground brush gets a word picker holding all ten words',
    !!picker && picker.children.length === 10 && picker.children.map((o) => o.value).join(',') === 'dirt,rock,sand,grass,mud,snow,gravel,ash,cobble,path');
  check('and it is the only picker on the tab, because it is the only kind with words',
    findAll(panel._brushList, (n) => n.tagName === 'SELECT').length === 1);
  picker.value = 'snow';
  picker.fire('change');
  check('choosing snow in it really reaches the editor',
    ed.brushWord('ground') === 'snow', `${ed.brushWord('ground')}`);

  // a slider really moves the brush, and the readout says the new number
  const rad = slidersOf(mtn)[0];
  rad.value = '455';
  rad.fire('input');
  check('dragging the radius slider sets the brush and shows the number beside it',
    ed.brushValue('mountain', 'radius') === 455 && /455 m/.test(mtn.textContent), mtn.textContent.slice(0, 60));
  rad.value = '9999';
  rad.fire('input');
  check('and a slider dragged past the end is pulled back to the contract\'s own maximum',
    ed.brushValue('mountain', 'radius') === 600 && rad.value === '600' && /600 m/.test(mtn.textContent));

  // clicking a row arms it
  rows[5].fire('click');
  check('clicking a row puts that brush in hand and marks the row', ed.brush.kind === 'plateau'
    && rows[5].classList.contains('here') && !rows[0].classList.contains('here'));

  // the keys
  check('1 to 9 pick the first nine brushes',
    key('3') && ed.brush.kind === 'mountain' && key('1') && ed.brush.kind === 'raise' && key('9') && ed.brush.kind === 'erode',
    ed.brush.kind);
  ed.setBrushParam('raise', 'r', 20);
  key('1');
  const before = ed.brush.r;
  check('plus widens the brush and minus narrows it, by a share of itself',
    key('+') && ed.brush.r === 23 && key('-') && ed.brush.r === 19.55, `${before} then ${ed.brush.r}`);
  check('and the panel says those keys on its face',
    /1 to 9 pick a brush/.test(root.textContent) && /\+ and - widen/.test(root.textContent));
  check('a key the editor has no use for is left for the game',
    key('q') === false);
  check('ctrl Z on the Terrain tab takes back ground, not a placement',
    (() => { ed.arm('raise'); ed.strokeOnce(0, 0); const n = t.undone.length; key('z', { ctrlKey: true }); return t.undone.length === n + 1; })());

  // the World row
  const world = panel._worldRow;
  check('the World row says which mode the terrain half is in',
    /sculpt mode/.test(world.textContent), world.textContent.slice(0, 40));
  const [hIn, gIn, sIn] = findAll(world, (n) => n.tagName === 'INPUT');
  check('and shows the floor the contract reports, so the fields are not blank',
    hIn.value === '0' && gIn.value === 'grass' && sIn.value === '220',
    `${hIn.value} / ${gIn.value} / ${sIn.value}`);
  hIn.value = '40'; gIn.value = 'snow'; sIn.value = '35';
  buttonWith(world, /set the floor/).fire('click');
  check('Set sends all three fields down the contract',
    t.based.length === 1 && t.based[0].height === 40 && t.based[0].ground === 'snow' && t.based[0].snowLine === 35,
    JSON.stringify(t.based[0]));

  const reset = buttonWith(world, /reset terrain/);
  reset.fire('click');
  check('the reset button asks before it drops anything, on the button itself',
    t.resets === 0 && /press again/.test(reset.textContent) && reset.classList.contains('armed'), reset.textContent);
  reset.fire('click');
  check('and a second press drops every stroke, once',
    t.resets === 1 && !/press again/.test(reset.textContent), `${t.resets} resets`);

  // the tab hides itself when another tab is up
  ed.setTab('trees');
  panel._drawAll();
  check('the terrain rows are put away on any other tab',
    panel._brushList.style.display === 'none' && world.style.display === 'none');
  ed.setTab('terrain');
  panel._drawAll();
  check('and come back on this one', panel._brushList.style.display === '' && world.style.display === '');
}

console.log('\neditor: the Terrain tab with no contract behind it');
{
  const root = document.createElement('div');
  const ctx = { hud: { log() {} } };
  panel.build(root, ctx);
  const ed = panel._ed;
  ed.setTab('terrain');
  panel._setLive(true);
  panel._drawAll();
  check('with nothing on window.__bw.terrain the tab shows one line of words and no brushes',
    panel._brushList.children.length === 1
    && /window.__bw.terrain/.test(panel._brushList.textContent)
    && slidersOf(panel._brushList).length === 0,
    panel._brushList.textContent);
  check('and the keys do nothing but say why',
    key('3') && /name no brushes/.test(ed.lastLine) && ed.brush.kind === 'raise', ed.lastLine);

  ctx.terrain = { stroke: () => 'cut' };
  panel._drawAll();
  check('with a half a contract it names the half that is missing',
    panel._brushList.children.length === 1 && /no kinds\(\)/.test(panel._brushList.textContent),
    panel._brushList.textContent);
  check('and the World row says there is no mode to read',
    /no mode/.test(panel._worldRow.textContent));

  ctx.terrain = fakeTerrain();
  panel._drawAll();
  check('and the moment the contract answers, the brushes are there with no reload',
    panel._brushList.children.length === KINDS.length && slidersOf(panel._brushList).length > 20,
    `${panel._brushList.children.length} rows`);
  panel._setLive(false);
}



// ============================================================================
console.log('\neditor: the ring under the brush is the ground the brush will take');
{
  const { ghostFor, brushRing, lineGhost, LINE_SAMPLES } = await import('./ghost.js');
  const outerOf = (group) => {
    let r = null;
    group.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.type === 'RingGeometry') r = o.geometry.parameters.outerRadius;
    });
    return r;
  };
  check('a 20 m brush draws a ring of 20 m, not of 28 m corner to corner',
    outerOf(brushRing(20)) === 20, `${outerOf(brushRing(20))}`);
  check('and a 600 m one draws 600', outerOf(brushRing(600)) === 600, `${outerOf(brushRing(600))}`);
  const g = ghostFor('terrain', 'mountain', { r: 300 });
  check('the terrain ghost is that ring, at the radius the brush is set to',
    outerOf(g.group) === 300 && /300 m across the radius/.test(g.words), g.words);
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


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
