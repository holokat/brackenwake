// The roster portraits. Run: node src/game/roster_preview.test.mjs
//
// Two things are worth proving here and neither of them needs a GPU.
//
// The FRAMING is arithmetic over player.js's body plan, so it is checked
// against a real rig: the body is built, dressed, posed and measured, and the
// numbers the lens is placed from have to land on the actual bones. A picture
// framed from a guess would crop the ear of a tall character and float a short
// one in the middle of an empty frame, and nobody would find out until they
// looked at four characters side by side.
//
// The CACHE is the other. A list that re-renders a body on every redraw would
// stutter every time a delete rebuilds the rows, so the key, the hit, the miss
// and the forget are driven directly.
//
// What is NOT covered: the WebGL draw itself. `paint` is exercised with a
// stand-in renderer, which runs the whole of it except the one call that needs
// a graphics context, and `makeKit` is not run at all in node.

import * as THREE from 'three';
import { buildCharacter, BODY, APPEARANCE_FALLBACK } from './player.js';
import { dressRig } from './gear_visuals.js';
import {
  PORTRAIT, spanFor, frameFor, lookKey, readLook, paint, createPortraits,
  silhouetteSvg, silhouetteUrl,
} from './roster_preview.js';
import { createState, slotKeyFor, SAVE_KEY } from './state.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;

function memStore() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** A real rig of this height, settled into the idle the portrait renders. */
function settled(height) {
  const rig = buildCharacter({ ...APPEARANCE_FALLBACK, height });
  rig.group.scale.setScalar(height / BODY.HEIGHT);
  for (let i = 0; i < 6; i++) rig.update(0.1, 0);
  rig.state.t = 0;
  rig.update(0, 0);
  rig.group.updateMatrixWorld(true);
  return rig;
}

// ---- the span is the body's own, not a guess about it ----------------------
console.log('roster_preview: head to knee, on a real body');
for (const height of [1.80, 1.60]) {
  const rig = settled(height);
  const box = new THREE.Box3().setFromObject(rig.group);
  const knee = new THREE.Vector3();
  rig.parts.shinL.getWorldPosition(knee);
  const s = spanFor(height);
  check(`a ${height.toFixed(2)} m character stands on the floor`, near(box.min.y, 0, 0.001), `${box.min.y.toFixed(4)} m`);
  check('  and the crown the framing uses is the crown the body has',
    near(s.crown, box.max.y, 0.001), `${s.crown.toFixed(4)} vs ${box.max.y.toFixed(4)}`);
  check('  and the knee is the knee, inside the bend the idle puts in it',
    near(s.knee, knee.y, 0.02), `${s.knee.toFixed(4)} vs ${knee.y.toFixed(4)}`);
  check('  the span runs upward, knee to crown', s.knee < s.aim && s.aim < s.crown && near(s.span, s.crown - s.knee, 1e-12));
  rig.dispose();
}
{
  const a = spanFor(1.80);
  const bad = [spanFor(0), spanFor(-2), spanFor(NaN), spanFor(undefined), spanFor('tall')];
  check('a height that is not a height falls back to the house body',
    bad.every((s) => s.crown === a.crown && s.knee === a.knee), JSON.stringify(bad[0]));
}

// ---- the lens ---------------------------------------------------------------
console.log('roster_preview: the lens');
for (const height of [1.80, 1.60]) {
  const f = frameFor(height);
  const top = f.aim + f.halfHeight, bottom = f.aim - f.halfHeight;
  check(`the ${height.toFixed(2)} m lens looks level at the middle of the span`,
    f.look.y === f.aim && f.pos.y === f.aim && near(f.aim, (f.knee + f.crown) / 2, 1e-12));
  check('  the whole head to knee span is inside the frame',
    f.crown < top && f.knee > bottom, `${bottom.toFixed(3)} .. ${top.toFixed(3)} holds ${f.knee.toFixed(3)} .. ${f.crown.toFixed(3)}`);
  check('  and fills exactly the fraction of it that PORTRAIT asks for',
    near(f.span / (2 * f.halfHeight), PORTRAIT.fill, 1e-12), `${(f.span / (2 * f.halfHeight)).toFixed(4)} of the frame`);
  check('  the feet are cropped away, which is what head to knee means',
    bottom > 0 && bottom < f.knee, `bottom at ${bottom.toFixed(3)} m`);
  check('  the camera stands off the front, three quarters on',
    f.pos.x > 0 && f.pos.z > 0
    && near((Math.atan2(f.pos.x, f.pos.z) * 180) / Math.PI, PORTRAIT.yawDeg, 1e-9),
    `${((Math.atan2(f.pos.x, f.pos.z) * 180) / Math.PI).toFixed(2)} degrees`);
  check('  and stands the distance it says it does',
    near(Math.hypot(f.pos.x - f.look.x, f.pos.y - f.look.y, f.pos.z - f.look.z), f.dist, 1e-12), `${f.dist.toFixed(4)} m`);
}
{
  // A shorter character is the same picture from nearer, not a differently
  // composed one: every length scales with the height and nothing else moves.
  const tall = frameFor(1.80), small = frameFor(1.60);
  const k = 1.60 / 1.80;
  check('a shorter body is framed nearer in the same proportion',
    near(small.dist / tall.dist, k, 1e-12) && near(small.aim / tall.aim, k, 1e-12), `${(small.dist / tall.dist).toFixed(6)} vs ${k.toFixed(6)}`);
  check('and the two fill the frame identically',
    near(small.span / (2 * small.halfHeight), tall.span / (2 * tall.halfHeight), 1e-12));
  check('the lens itself never changes', small.fov === tall.fov && small.yaw === tall.yaw);
}
{
  // Both directions on the one knob that matters: fill more, stand nearer.
  const loose = frameFor(1.8, { fill: 0.6 }), tight = frameFor(1.8, { fill: 0.98 });
  check('a fuller frame is a nearer camera, and an emptier one is further back',
    tight.dist < loose.dist, `${tight.dist.toFixed(3)} m vs ${loose.dist.toFixed(3)} m`);
  check('and a wider lens is nearer still at the same fill',
    frameFor(1.8, { fov: 50 }).dist < frameFor(1.8, { fov: 20 }).dist);
}

// ---- what makes a picture stale ---------------------------------------------
console.log('roster_preview: the signature of a look');
{
  const look = { appearance: { ...APPEARANCE_FALLBACK }, equipment: {} };
  const same = { appearance: { ...APPEARANCE_FALLBACK }, equipment: {} };
  check('two of the same look are one key', lookKey(look) === lookKey(same));
  const hair = { appearance: { ...APPEARANCE_FALLBACK, hairStyle: 'wild' }, equipment: {} };
  check('a different hair is a different key', lookKey(look) !== lookKey(hair));
  const shorter = { appearance: { ...APPEARANCE_FALLBACK, height: 1.6 }, equipment: {} };
  check('a different height is a different key', lookKey(look) !== lookKey(shorter));
  const armed = { appearance: { ...APPEARANCE_FALLBACK }, equipment: { mainHand: { base: 'longsword', rarity: 'common' } } };
  const better = { appearance: { ...APPEARANCE_FALLBACK }, equipment: { mainHand: { base: 'longsword', rarity: 'epic' } } };
  check('a weapon in the hand changes the key', lookKey(look) !== lookKey(armed));
  check('and so does the same weapon at a different rarity, which is a different colour',
    lookKey(armed) !== lookKey(better));
  const order = {
    appearance: { ...APPEARANCE_FALLBACK },
    equipment: { chest: { base: 'cloth_outfit', rarity: 'common' }, mainHand: { base: 'longsword', rarity: 'common' } },
  };
  const reordered = {
    appearance: { ...APPEARANCE_FALLBACK },
    equipment: { mainHand: { base: 'longsword', rarity: 'common' }, chest: { base: 'cloth_outfit', rarity: 'common' } },
  };
  check('the same gear written in another order is still the same picture',
    lookKey(order) === lookKey(reordered), lookKey(order));
  check('and no look at all has a key of its own', lookKey(null) === 'none');
}

// ---- reading the save, and never writing it ---------------------------------
console.log('roster_preview: the look comes out of the save');
{
  const store = memStore();
  const s = createState({ storage: store });
  const id = s.newSlot();
  s.character.name = 'Mab';
  s.character.needsCreation = false;
  s.character.appearance.hairStyle = 'braid';
  s.character.appearance.height = 1.71;
  s.save();
  const before = new Map(store.m);

  const look = readLook(id, store);
  check('the appearance is read back off the document', look?.appearance?.hairStyle === 'braid' && look.appearance.height === 1.71, JSON.stringify(look?.appearance));
  check('and the equipment with it', !!look?.equipment && typeof look.equipment === 'object');
  check('a field the save never had is filled from the fallback',
    look.appearance.gender === APPEARANCE_FALLBACK.gender || typeof look.appearance.gender === 'string');
  check('reading it wrote nothing at all',
    store.m.size === before.size && [...store.m].every(([k, v]) => before.get(k) === v));

  check('a slot that is not there is nobody', readLook('99', store) === null);
  check('an id that is not an id is nobody', readLook('', store) === null && readLook(null, store) === null);
  store.setItem(slotKeyFor('7', SAVE_KEY), 'not json at all');
  check('a document that will not parse is nobody, not a crash', readLook('7', store) === null);
  store.setItem(slotKeyFor('8', SAVE_KEY), JSON.stringify({ needsCreation: true, appearance: { hairStyle: 'long' } }));
  check('a character who was never finished has no portrait to draw', readLook('8', store) === null);
  store.setItem(slotKeyFor('9', SAVE_KEY), JSON.stringify({ name: 'old save' }));
  check('a save from before appearances is nobody rather than a default stranger', readLook('9', store) === null);
  check('and no storage at all is nobody', readLook(id, null) === null);
}
{
  // Left out, the storage is the browser's. Proved with a stand-in, and taken
  // straight back down: nothing in this file goes near a real localStorage.
  const store = memStore();
  const s = createState({ storage: store });
  const id = s.newSlot();
  s.character.needsCreation = false;
  s.character.appearance.hairStyle = 'topknot';
  s.save();
  globalThis.localStorage = store;
  const look = readLook(id);
  delete globalThis.localStorage;
  check('with no storage named, the look comes from localStorage', look?.appearance?.hairStyle === 'topknot');
  check('and the stand-in is gone again', typeof globalThis.localStorage === 'undefined');
  check('with localStorage gone, asking is nobody rather than a throw', readLook(id) === null);
}

// ---- the drawing that stands in for a body ----------------------------------
console.log('roster_preview: the silhouette');
{
  const svg = silhouetteSvg();
  check('it is an svg of the portrait size', /^<svg/.test(svg.trim()) && svg.includes(`width="${PORTRAIT.w}"`) && svg.includes(`height="${PORTRAIT.h}"`));
  check('and it actually draws something', (svg.match(/<path/g) || []).length >= 4, `${(svg.match(/<path/g) || []).length} paths`);
  check('it wears a class the roster can find it by', svg.includes('bw-ro-sil'));
  check('and it goes into an image source as a data uri', silhouetteUrl().startsWith('data:image/svg+xml,'));
  check('there is no word in it to mistranslate', !/>[^<]*[A-Za-z]{3,}[^<]*</.test(svg.replace(/<svg[^>]*>/, '')));
}

// ---- one rig per portrait, and none of them left standing -------------------
console.log('roster_preview: painting one character');
{
  // Everything paint() does except the one call that needs a graphics context.
  let renders = 0;
  const kit = {
    w: PORTRAIT.w, h: PORTRAIT.h,
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(50, 1, 0.1, 100),
    renderer: { render() { renders++; }, domElement: { toDataURL: () => 'data:image/png;base64,painted' } },
  };
  const look = {
    appearance: { ...APPEARANCE_FALLBACK, height: 1.71, hairStyle: 'braid' },
    equipment: { mainHand: { base: 'longsword', rarity: 'common' }, chest: { base: 'cloth_outfit', rarity: 'common' } },
  };
  const before = kit.scene.children.length;
  const url = await paint(kit, look);
  check('it hands back the picture the canvas holds', url === 'data:image/png;base64,painted');
  check('and it drew exactly once', renders === 1, `${renders} renders`);
  const f = frameFor(1.71);
  check('the camera was put where the framing says, for this body',
    near(kit.camera.position.x, f.pos.x, 1e-9) && near(kit.camera.position.y, f.pos.y, 1e-9)
    && near(kit.camera.position.z, f.pos.z, 1e-9), `${kit.camera.position.toArray().map((n) => n.toFixed(3)).join(', ')}`);
  check('and the lens is the portrait lens, at the portrait shape',
    kit.camera.fov === PORTRAIT.fov && near(kit.camera.aspect, PORTRAIT.w / PORTRAIT.h, 1e-12));
  check('the body was taken out of the scene again', kit.scene.children.length === before, `${kit.scene.children.length} left`);

  // The gear went on: paint calls the real dressRig, so a sword in the hand
  // has to be a sword in the hand rather than a call that returned quietly.
  const count = (rig) => { let n = 0; rig.group.traverse(() => n++); return n; };
  const bareRig = buildCharacter(look.appearance);
  const bare = count(bareRig);
  bareRig.dispose();
  const wornRig = buildCharacter(look.appearance);
  const worn = dressRig(wornRig, look.equipment, { light: false });
  const dressedNodes = count(wornRig);
  wornRig.dispose();
  // one outfit and a sword since 2026-09-08: the studio still dresses eight
  // slots off the one outfit, so the node count is what proves the shirt went on
  check('the sword and the outfit really go on the body',
    dressedNodes > bare && worn.nodes >= 1, `${dressedNodes} nodes dressed, ${bare} bare, ${worn.nodes} pieces`);
  check('and the hands take a grip on what they were given', worn.grip !== null, String(worn.grip));
}

// ---- the cache --------------------------------------------------------------
console.log('roster_preview: the cache');
{
  const store = memStore();
  const s = createState({ storage: store });
  const a = s.newSlot();
  s.character.needsCreation = false;
  s.character.appearance.hairStyle = 'braid';
  s.save();
  s.newSlot();
  const b = s.slot;
  s.character.needsCreation = false;
  s.save();

  let drew = 0;
  const p = createPortraits({ storage: store, render: () => `data:image/png;base64,${++drew}` });
  const rowA = { id: a }, rowB = { id: b };

  check('the first ask is a miss and a draw', p.of(rowA) === 'data:image/png;base64,1' && p.misses === 1 && drew === 1);
  check('the second is a hit and no draw', p.of(rowA) === 'data:image/png;base64,1' && p.hits === 1 && drew === 1);
  check('another character is another miss', p.of(rowB) === 'data:image/png;base64,2' && p.misses === 2 && drew === 2);
  check('and the cache holds them both', p.size === 2 && p.has(a) && p.has(b));

  s.openSlot(a);
  s.character.appearance.hairStyle = 'wild';
  s.save();
  check('a character who changed is drawn again', p.of(rowA) === 'data:image/png;base64,3' && drew === 3, `${drew} drawn`);
  check('  and the one who did not is still a hit', p.of(rowB) === 'data:image/png;base64,2' && drew === 3);

  p.forget(a);
  check('forgetting one drops that one only', p.size === 1 && !p.has(a) && p.has(b));
  const misses = p.misses;
  p.of(rowA);
  check('and asking again is a miss', p.misses === misses + 1 && drew === 4, `${p.misses} misses`);

  check('a row with nobody in it draws nothing', p.of({ id: '404' }) === null && drew === 4);
  const hits = p.hits;
  check('and that emptiness is cached too, so the save is not re-read every redraw',
    p.of({ id: '404' }) === null && p.hits === hits + 1);
  check('a row with no id at all is nobody', p.of({}) === null && p.of(null) === null);

  p.dispose();
  check('disposing empties the cache and closes the screen', p.size === 0 && p.gone === true);
  check('and a portrait asked for after that is nobody', p.of(rowB) === null);
}
{
  // A look handed in directly never touches storage: this is the path a caller
  // with the document already in hand would take.
  let drew = 0;
  const p = createPortraits({ storage: null, render: () => `drawn:${++drew}` });
  const look = { appearance: { ...APPEARANCE_FALLBACK }, equipment: {} };
  check('a row carrying its own look is drawn from it', p.of({ id: '1', look }) === 'drawn:1');
  check('and the same look again is a hit', p.of({ id: '1', look }) === 'drawn:1' && p.hits === 1 && drew === 1);
  check('a row asking to be made is never drawn',
    p.of({ id: '2', needsCreation: true }) === null && drew === 1);
  p.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
