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
import { paletteFor, entryFor, search, TABS, TAB_IDS, BRUSH_IDS, MARKER_KINDS } from './palette.js';
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
  check('Terrain lists the seven brushes the contract names',
    paletteFor('terrain').map((e) => e.id).join(',') === BRUSH_IDS.join(',')
    && BRUSH_IDS.join(',') === 'raise,lower,flatten,smooth,pit,cliff,cave');
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
console.log('\neditor: the terrain contract, present and absent');
{
  const calls = [];
  const ed = createEditor({ terrain: { stroke: (c) => { calls.push(c); return true; }, undo: () => true, redo: () => true, save: async () => 'four strokes saved' } });
  check('the editor sees the terrain tools when they are there', ed.terrainReady());
  ed.setBrush({ kind: 'cave', r: 12, amount: -2 });
  const st = ed.stroke(100, 200);
  check('a stroke goes through with the kind, the point, the radius and the amount',
    st.ok && calls.length === 1 && calls[0].kind === 'cave' && calls[0].x === 100 && calls[0].z === 200 && calls[0].r === 12 && calls[0].amount === -2,
    JSON.stringify(calls[0]));
  check('every brush the contract names is accepted',
    BRUSH_IDS.every((k) => ed.stroke(0, 0, { kind: k }).ok), BRUSH_IDS.join(', '));
  check('and a brush that is not one is refused', ed.stroke(0, 0, { kind: 'melt' }).ok === false);
  check('the end of a drag says how many strokes it laid', /strokes of cave/.test(ed.strokeDone(4).text));
  check('undo, redo and save all reach the contract',
    ed.terrainUndo().ok && ed.terrainRedo().ok && (await ed.terrainSave()).ok);
  check('the brush is clamped rather than allowed to be a mile across',
    ed.setBrush({ r: 9999 }).r === 120 && ed.setBrush({ r: -5 }).r === 1);

  const none = createEditor({});
  check('with no terrain tools the editor says exactly that and does nothing',
    none.terrainReady() === false
    && none.stroke(0, 0).ok === false && /terrain tools are not in yet/.test(none.lastLine)
    && none.terrainUndo().ok === false
    && none.terrainRedo().ok === false
    && (await none.terrainSave()).ok === false,
    none.lastLine);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
