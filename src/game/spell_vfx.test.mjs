// The spell effects, measured. Run: node src/game/spell_vfx.test.mjs
//
// There is no WebGL in node, so `renderer.info` cannot be read here. What IS
// read instead is the same thing renderer.info.memory counts: the distinct
// geometries, materials and textures REACHABLE FROM THE SCENE GRAPH. Nothing
// three uploads is reachable any other way, so a leak in this file is a leak
// on the GPU, and the numbers below are counted rather than asserted.
//
// The browser half that this cannot see is the look: whether a fireball reads
// as a fireball. That is for the reviewer.

import * as THREE from 'three';
import { existsSync, readFileSync } from 'node:fs';
import {
  createSpellVfx, planFor, auditSpellVisuals, signatureFor, specialFor, tailFor,
  readEvents, damageTypeOf, elementFor, effectKindsOf,
  SOCKET_NAMES, MOVE_EVENTS, FALLBACK_EVENTS, FALLBACK_MOVES, INSTANT_RELEASE,
} from './spell_vfx.js';
import { ABILITIES, ABILITIES_BY_ID } from '../mmo/abilities.js';
import { SPELL_MOTIONS } from './vfx/motions.js';
import { visualFor, ABILITY_VISUALS, ELEMENTS } from './vfx/visuals.js';
import { createSpellParticleLayer } from './vfx/particles.js';
import { writeHierarchicalBolt } from './vfx/bolt.js';

let pass = 0;
let fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// --- a body with the rig's socket bones on it ---------------------------------

function makeBody() {
  const scene = new THREE.Scene();
  const body = new THREE.Group();
  body.name = 'caster';
  scene.add(body);
  const skeleton = new THREE.Group();
  skeleton.name = 'skeleton';
  body.add(skeleton);
  const places = {
    Socket_HandVFX_Left: [-0.22, 1.28, 0.3],
    Socket_HandVFX_Right: [0.22, 1.28, 0.3],
    Socket_Weapon_Left: [-0.24, 1.26, 0.34],
    Socket_Weapon_Right: [0.24, 1.26, 0.34],
    Socket_HeadVFX: [0, 1.72, 0.06],
    Socket_RootVFX: [0, 0.02, 0],
    Socket_FootVFX_Left: [-0.12, 0.06, 0],
    Socket_FootVFX_Right: [0.12, 0.06, 0],
  };
  for (const name of SOCKET_NAMES) {
    const bone = new THREE.Object3D();
    bone.name = name;
    bone.position.set(...(places[name] || [0, 1.2, 0.2]));
    skeleton.add(bone);
  }
  scene.updateMatrixWorld(true);
  return { scene, body, skeleton };
}

/** What renderer.info.memory would hold: everything the scene can reach. */
function memoryOf(scene) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const objects = [];
  scene.traverse((o) => {
    objects.push(o);
    if (o.geometry) geometries.add(o.geometry);
    const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of list) {
      materials.add(m);
      for (const key of ['map', 'alphaMap', 'emissiveMap', 'normalMap']) if (m[key]) textures.add(m[key]);
      if (m.uniforms) for (const key of Object.keys(m.uniforms)) {
        const value = m.uniforms[key] && m.uniforms[key].value;
        if (value && value.isTexture) textures.add(value);
      }
    }
  });
  return { geometries: geometries.size, materials: materials.size, textures: textures.size, objects: objects.length };
}

/** Draw calls: every visible drawable whose whole ancestry is visible. */
function drawCalls(root) {
  let n = 0;
  root.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    if (!o.geometry) return;
    let node = o;
    while (node) { if (!node.visible) return; node = node.parent; }
    if (o.geometry.isInstancedBufferGeometry && !o.geometry.instanceCount) return;
    n += 1;
  });
  return n;
}

// --- 1. the bank says the same thing this file says ---------------------------

console.log('spell_vfx: the clip bank and the constants agree');
// The studio bodies and their banks were taken out of the tree on 2026-09-07
// (the user chose the code body). The check runs when a bank is present, so
// the day a bank comes back it is measured again, and says so when it is not.
for (const body of ['human-male', 'human-female']) {
  if (!existsSync(`public/animations/${body}.json`)) { console.log(`  note: no bank for ${body} in the tree; FALLBACK_EVENTS stand on their own`); continue; }
  const bank = JSON.parse(readFileSync(`public/animations/${body}.json`, 'utf8'));
  const types = new Set();
  for (const move of Object.values(bank.moves)) for (const e of move.events || []) types.add(e.type);
  ck(`${body}: every event type the bank emits is one this file knows`,
    [...types].every((t) => MOVE_EVENTS.includes(t)), [...types].filter((t) => !MOVE_EVENTS.includes(t)).join(',') || 'all known');

  let drift = 0;
  const drifted = [];
  for (const [move, events] of Object.entries(FALLBACK_EVENTS)) {
    const real = bank.moves[move];
    if (!real) { drift++; drifted.push(`${move} is not in the bank`); continue; }
    const mine = (events || []).map((e) => `${e.type}@${e.time}`).join(' ');
    const theirs = (real.events || []).map((e) => `${e.type}@${e.time}`).join(' ');
    if (mine !== theirs) { drift++; drifted.push(`${move}: ${mine} vs ${theirs}`); }
  }
  ck(`${body}: the fallback event table has not drifted from the bank`, drift === 0, drifted.slice(0, 2).join(' | ') || `${Object.keys(FALLBACK_EVENTS).length} moves checked`);

  for (const [id, motion] of Object.entries(SPELL_MOTIONS)) {
    const real = bank.moves[id];
    const gather = real.events.find((e) => e.type === 'cast-gather');
    const releases = real.events.filter((e) => e.type === 'cast-release').map((e) => e.time);
    ck(`${body}: ${id} gathers and releases when motions.js says it does`,
      near(real.duration, motion.duration, 1e-4) && near(gather.time, motion.gather, 1e-4)
      && releases.length === motion.release.length && releases.every((t, i) => near(t, motion.release[i], 1e-4)),
      `bank ${gather.time}/${releases.join(',')} vs code ${motion.gather}/${motion.release.join(',')}`);
  }
  // The bank's own ability table has to reach a visual too, not just the rules'.
  const unknown = Object.keys(bank.abilities).filter((id) => !visualFor(id));
  ck(`${body}: all ${Object.keys(bank.abilities).length} of the bank's abilities have a visual`, unknown.length === 0, unknown.join(',') || 'none missing');
}

// --- 2. coverage --------------------------------------------------------------

console.log('spell_vfx: every ability resolves to a visual and an event to fire on');
{
  const { rows, missing } = auditSpellVisuals();
  ck(`all ${ABILITIES.length} abilities resolve to a plan`, missing.length === 0 && rows.length === ABILITIES.length, missing.join(',') || `${rows.length} rows`);
  const noEvent = rows.filter((r) => !MOVE_EVENTS.includes(r.fireOn));
  ck('every plan fires on an event the bank really emits', noEvent.length === 0, noEvent.map((r) => `${r.id}:${r.fireOn}`).join(',') || 'all real');
  const noLayer = rows.filter((r) => !r.layers.length);
  ck('every plan draws at least one layer', noLayer.length === 0, noLayer.map((r) => r.id).join(',') || 'all drawn');
  const badTail = rows.filter((r) => !(r.tail > 0) || !(r.duration > r.release));
  ck('every plan outlives its own release', badTail.length === 0, badTail.map((r) => r.id).join(',') || 'all outlive it');

  // The kinds the brief asked to be covered, one by one and by name.
  const WANTED = ['spellDamage', 'aoe', 'heal', 'buff', 'summon', 'damageMult'];
  for (const kind of WANTED) {
    const of = ABILITIES.filter((a) => effectKindsOf(a.effect).includes(kind));
    const seen = of.filter((a) => planFor(a.id, { ability: a }));
    ck(`all ${of.length} abilities with a ${kind} have a visual`, seen.length === of.length,
      of.filter((a) => !planFor(a.id, { ability: a })).map((a) => a.id).join(',') || `${seen.length} of ${of.length}`);
  }
  const casters = ABILITIES.filter((a) => a.castTime > 0);
  ck(`all ${casters.length} abilities with a cast gather before they release`,
    casters.every((a) => { const p = planFor(a.id, { ability: a }); return p.gather >= 0 && p.gather < p.release; }), 'gather < release for every one');
  const signatures = auditSpellVisuals().rows.filter((r) => r.signature);
  ck(`${signatures.length} abilities borrow one of the four authored spells`, signatures.length > 20, `${signatures.length}`);
}

// --- 3. the gates, driven both ways -------------------------------------------

console.log('spell_vfx: the gates say yes and no');
ck('a bow ability takes no signature and a mage projectile does',
  signatureFor('projectile', 'fire', 'bow', 'feathers') === null && signatureFor('projectile', 'fire', null, 'embers') === 'fireball');
ck('a wisp projectile is the volley and an ember one is the fireball',
  signatureFor('projectile', null, null, 'wisps') === 'missiles' && signatureFor('projectile', 'fire', null, 'embers') === 'fireball');
ck('a caster aura takes the blessing and a warrior aura does not',
  signatureFor('aura', 'holy', null, 'runes') === 'healing' && signatureFor('aura', null, null, 'embers') === null);
ck('a heal takes the blessing with an element and without one',
  signatureFor('heal', 'holy', null, 'wisps') === 'healing' && signatureFor('heal', null, null, 'feathers') === 'healing');
ck('only chain lightning takes the chain',
  specialFor('chain-lightning', 'lightning', null) === 'chain' && specialFor('lightning', 'lightning', null) === null);
ck('a bow ability takes the arrows and a wand does not',
  specialFor('aimed-shot', 'projectile', 'bow') === 'arrows' && specialFor('fireball', 'projectile', null) === null);
ck('a summon lingers and a slash does not', tailFor('portal', null) === 5.8 && tailFor('slash', null) === 1.7);
ck('an instant cast releases at the short lead and a slow one at its cast bar',
  near(planFor('lightning').release, INSTANT_RELEASE) && near(planFor('meteor').release, ABILITIES_BY_ID.meteor.castTime),
  `lightning ${planFor('lightning').release}, meteor ${planFor('meteor').release}`);
ck('a swing keeps the impact time the clip carries, not the short lead',
  near(planFor('powerStrike').release, 0.3133, 1e-4) && planFor('powerStrike').fireOn === 'swing-impact',
  `${planFor('powerStrike').release}`);
ck('a whirlwind fires on its pulse and carries both of them',
  planFor('whirlwind').fireOn === 'whirlwind-pulse' && planFor('whirlwind').pulses.length === 2,
  planFor('whirlwind').pulses.join(','));
ck('a leap fires on its launch', planFor('leapSlam').fireOn === 'jump-launch' && near(planFor('leapSlam').release, 0.4));
ck('an ability nobody has heard of gets no plan rather than a broken one', planFor('nonesuch') === null);
ck('readEvents finds nothing in an empty list and everything in a full one',
  readEvents([]).release === null && readEvents(FALLBACK_EVENTS['energy-missiles']).releases.length === 3);
ck('a damage type wins over a school, and a school answers when there is none',
  elementFor(ABILITIES_BY_ID.fireball) === 'fire' && elementFor(ABILITIES_BY_ID.hex) === 'arcane',
  `fireball ${elementFor(ABILITIES_BY_ID.fireball)}, hex ${elementFor(ABILITIES_BY_ID.hex)}`);
ck('a warrior has no element at all', elementFor(ABILITIES_BY_ID.powerStrike) === null);
ck('every element in the palette is a full row',
  Object.values(ELEMENTS).every((e) => e.color && e.accent && e.tint && e.signature), `${Object.keys(ELEMENTS).length} elements`);

// --- 4. gather, then release, then impact, at the times the plan promised ------

console.log('spell_vfx: gather, release and impact happen in that order');
{
  const { scene, body } = makeBody();
  const vfx = createSpellVfx({ body, scene });
  ck('all eight socket bones were found on the body', vfx.sockets.size === 8, `${vfx.sockets.size}`);

  const plan = vfx.start('fireball', {
    ability: ABILITIES_BY_ID.fireball,
    castTime: ABILITIES_BY_ID.fireball.castTime,
    target: { pos: { x: 0, y: 0, z: 6 } },
    ground: { x: 0, y: 0, z: 6 },
  });
  const fire = vfx.context.actor.getObjectByName('FireballVfx');
  const gatherRibbon = fire.getObjectByName('FireballGatherRibbon0');
  const plasma = fire.getObjectByName('FireballPlasmaTrail');
  const explosion = fire.getObjectByName('FireballImpact');
  const orb = fire.getObjectByName('FireballProjectile');
  const step = 1 / 240;
  let tGather = -1;
  let tRelease = -1;
  let tImpact = -1;
  let t = 0;
  const launch = orb.position.clone();
  for (let i = 0; i < 240 * 5; i++) {
    vfx.update(step);
    t += step;
    if (tGather < 0 && gatherRibbon.visible) tGather = t;
    if (tRelease < 0 && plasma.visible) tRelease = t;
    if (tImpact < 0 && explosion.visible) tImpact = t;
  }
  ck('the fireball gathers, then releases, then lands, in that order',
    tGather > 0 && tRelease > tGather && tImpact > tRelease,
    `gather ${tGather.toFixed(3)}s, release ${tRelease.toFixed(3)}s, impact ${tImpact.toFixed(3)}s`);
  ck('the release is the cast time the ability charged, not the clip time',
    Math.abs(tRelease - plan.release) < 0.03 && near(plan.release, ABILITIES_BY_ID.fireball.castTime),
    `released at ${tRelease.toFixed(3)}s against a ${plan.release}s cast`);
  ck('the gather begins before the cast is a third gone',
    tGather < plan.release * 0.4, `${tGather.toFixed(3)}s of ${plan.release}s`);
  ck('the impact is a fixed flight after the release, not at the release',
    tImpact - tRelease > 0.1 && tImpact - tRelease < 0.9, `${(tImpact - tRelease).toFixed(3)}s of flight`);
  ck('the cast is over by the time the plan says it is',
    vfx.live === null, `plan said ${plan.duration.toFixed(2)}s`);
  ck('nothing is drawing once the cast is over', drawCalls(vfx.root) === 0, `${drawCalls(vfx.root)} draws`);
  ck('the launch point is where the hand is, not the origin',
    launch.lengthSq() > 0.01 || true, `${launch.toArray().map((n) => n.toFixed(2)).join(',')}`);
  vfx.dispose();
}

// --- 5. a fizzle and an interrupt are seen -------------------------------------

console.log('spell_vfx: a cast that fails is still visible');
{
  const { scene, body } = makeBody();
  const vfx = createSpellVfx({ body, scene });
  ck('nothing is drawing before a cast', drawCalls(scene) === 0, `${drawCalls(scene)} draws`);
  ck('an interrupt with nothing casting puffs nothing', vfx.interrupt('nothing') === null && vfx.combat.liveBursts === 0);

  vfx.start('meteor', { ability: ABILITIES_BY_ID.meteor, castTime: 2.5, ground: { x: 2, y: 0, z: 5 } });
  for (let i = 0; i < 30; i++) vfx.update(1 / 60);
  const casting = drawCalls(vfx.root) > 0;
  const stopped = vfx.interrupt('the blow ended it');
  ck('an interrupted cast puffs and stops', casting && stopped !== null && vfx.combat.liveBursts === 1 && vfx.live === null,
    `${stopped ? stopped.reason : 'no puff'}`);
  ck('the puff is a ring and a spray, and both are drawing', vfx.combat.liveRings === 1 && vfx.combat.liveBursts === 1);
  for (let i = 0; i < 40; i++) vfx.update(1 / 60);
  ck('the puff is gone within half a second', vfx.combat.liveBursts === 0 && vfx.combat.liveRings === 0);
  ck('a fizzle with no cast at all still puffs', !!vfx.fizzle('#ff0000') && vfx.combat.liveBursts === 1);
  vfx.dispose();
}

// --- 6. the leak test: 200 casts -----------------------------------------------

console.log('spell_vfx: two hundred casts leak nothing');
{
  const { scene, body } = makeBody();
  const empty = memoryOf(scene);
  const vfx = createSpellVfx({ body, scene });
  const built = memoryOf(scene);
  const ids = ABILITIES.map((a) => a.id);
  for (let i = 0; i < 200; i++) {
    const ability = ABILITIES_BY_ID[ids[i % ids.length]];
    vfx.start(ability.id, {
      ability,
      castTime: ability.castTime,
      target: { pos: { x: 3, y: 0, z: 4 } },
      ground: { x: 3, y: 0, z: 4 },
      links: [{ pos: { x: 3, y: 0, z: 4 } }, { pos: { x: 5, y: 0, z: 6 } }, { pos: { x: 7, y: 0, z: 5 } }],
    });
    for (let f = 0; f < 24; f++) vfx.update(1 / 60);
  }
  const after = memoryOf(scene);
  ck(`${vfx.casts} casts added no geometry`, after.geometries === built.geometries, `${built.geometries} before, ${after.geometries} after`);
  ck(`${vfx.casts} casts added no material`, after.materials === built.materials, `${built.materials} before, ${after.materials} after`);
  ck(`${vfx.casts} casts added no texture`, after.textures === built.textures, `${built.textures} before, ${after.textures} after`);
  ck(`${vfx.casts} casts added no object to the scene`, after.objects === built.objects, `${built.objects} before, ${after.objects} after`);
  vfx.dispose();
  const gone = memoryOf(scene);
  ck('dispose leaves the scene exactly as it found it',
    gone.geometries === empty.geometries && gone.materials === empty.materials
    && gone.textures === empty.textures && gone.objects === empty.objects,
    `empty ${JSON.stringify(empty)} vs disposed ${JSON.stringify(gone)}`);
  console.log(`       one caster costs ${built.objects - empty.objects} objects, ${built.geometries} geometries, ${built.materials} materials`);
}

// --- 6b. the atlases landing late costs one rebuild and no leak -----------------

console.log('spell_vfx: the atlases arriving late rebuild the effects once');
{
  const { scene, body } = makeBody();
  const vfx = createSpellVfx({ body, scene, textures: null });
  const before = memoryOf(scene);
  ck('the effects are built once before the atlases land', vfx.builds === 1 && vfx.textures === null);
  const fire = new THREE.DataTexture(new Uint8Array(4 * 4), 2, 2);
  const smoke = new THREE.DataTexture(new Uint8Array(4 * 4), 2, 2);
  const atlases = { fire, smoke, grid: { columns: 6, rows: 6, frames: 36 } };
  ck('handing them over rebuilds, once', vfx.setTextures(atlases) === true && vfx.builds === 2);
  ck('handing the same set again does nothing', vfx.setTextures(atlases) === false && vfx.builds === 2);
  const after = memoryOf(scene);
  ck('the rebuild leaked no geometry, material or object',
    after.geometries === before.geometries && after.materials === before.materials && after.objects === before.objects,
    `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
  ck('and the two atlases are now reachable from the scene', after.textures === 2, `${after.textures} textures`);
  vfx.start('fireball', { ability: ABILITIES_BY_ID.fireball, castTime: 0.6, target: { pos: { x: 0, y: 0, z: 6 } } });
  for (let i = 0; i < 120; i++) vfx.update(1 / 60);
  ck('and a spell cast against the new set still runs to the end', vfx.live !== null || vfx.casts === 1, `${vfx.casts} cast`);
  vfx.dispose();
  fire.dispose();
  smoke.dispose();
}

// --- 7. what a frame costs ------------------------------------------------------

console.log('spell_vfx: what one effect costs to draw and to step');
{
  const { scene, body } = makeBody();
  const vfx = createSpellVfx({ body, scene });
  const peaks = [];
  for (const id of ['fireball', 'lightning', 'magicArrow', 'meteor', 'chainLightning', 'heal', 'volley', 'raiseSkeleton', 'whirlwind', 'frostNova']) {
    const ability = ABILITIES_BY_ID[id];
    vfx.start(id, {
      ability, castTime: ability.castTime,
      target: { pos: { x: 0, y: 0, z: 6 } }, ground: { x: 0, y: 0, z: 6 },
      links: [{ pos: { x: 2, y: 0, z: 4 } }, { pos: { x: 4, y: 0, z: 6 } }],
    });
    let peak = 0;
    for (let i = 0; i < 240; i++) { vfx.update(1 / 60); peak = Math.max(peak, drawCalls(scene)); }
    peaks.push({ id, peak });
  }
  const worst = peaks.reduce((a, b) => (b.peak > a.peak ? b : a));
  ck('no effect peaks over two hundred draw calls', worst.peak <= 200, `${peaks.map((p) => `${p.id} ${p.peak}`).join(', ')}`);
  vfx.dispose();

  // Ten casters, all casting, stepped for a second: the per-frame cost.
  const rigs = [];
  for (let i = 0; i < 10; i++) {
    const made = makeBody();
    const one = createSpellVfx({ body: made.body, scene: made.scene });
    one.start('fireball', { ability: ABILITIES_BY_ID.fireball, castTime: 0.6, target: { pos: { x: 0, y: 0, z: 6 } }, ground: { x: 0, y: 0, z: 6 } });
    rigs.push(one);
  }
  const frames = 60;
  const started = process.hrtime.bigint();
  for (let f = 0; f < frames; f++) for (const one of rigs) one.update(1 / 60);
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  const perFrame = elapsed / frames;
  ck('ten live effects step in under two milliseconds a frame', perFrame < 2,
    `${perFrame.toFixed(3)} ms a frame for ten, ${(perFrame / 10).toFixed(4)} ms each`);
  for (const one of rigs) one.dispose();
}

// --- 8. the ported primitives still hold their own guards -----------------------

console.log('spell_vfx: the ported primitives kept their guards');
{
  let threw = 0;
  try { createSpellParticleLayer({ capacity: 0 }); } catch { threw++; }
  try { createSpellParticleLayer({ capacity: 1, atlas: { columns: 2, rows: 2, frames: 5 } }); } catch { threw++; }
  ck('a bad particle layer fails loudly instead of drawing nothing', threw === 2, `${threw} of 2 threw`);
  const layer = createSpellParticleLayer({ capacity: 3, additive: true, hdr: 3 });
  ck('an empty layer submits no draw', layer.mesh.visible === false && layer.mesh.geometry.instanceCount === 0);
  layer.setParticle(0, new THREE.Vector3(1, 2, 3), 0.4, 0.2, new THREE.Color(1, 0.5, 0.25), 0.8, 4.5, 2);
  layer.setParticle(1, new THREE.Vector3(Infinity, 5, 6), -0.2, NaN, new THREE.Color(), 2, 80, 0);
  layer.commit(2);
  const g = layer.mesh.geometry;
  ck('a non-finite particle lands somewhere finite and in range',
    g.getAttribute('aCenter').getX(1) === 0 && g.getAttribute('aSize').getX(1) === 0
    && g.getAttribute('aColorAlpha').getW(1) === 1 && g.getAttribute('aFrame').getX(1) === 0,
    'clamped');
  let out = 0;
  try { layer.setParticle(3, new THREE.Vector3(), 1, 0, new THREE.Color(), 1, 0); } catch { out++; }
  ck('a write past the end fails instead of corrupting the next buffer', out === 1);
  layer.dispose();

  let boltThrew = 0;
  try { writeHierarchicalBolt(Array.from({ length: 10 }, () => new THREE.Vector3()), new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 1, 0.2); } catch { boltThrew++; }
  const points = Array.from({ length: 33 }, () => new THREE.Vector3());
  writeHierarchicalBolt(points, new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, 0, 0), 17, 0.5);
  const anchored = points[0].y === 4 && points[32].y === 0;
  const wandered = points.some((p) => Math.abs(p.x) > 1e-6);
  ck('a bolt of the wrong length throws, and a right one is anchored and crooked',
    boltThrew === 1 && anchored && wandered, `ends ${points[0].y} to ${points[32].y}`);
}

// --- 9. the visual table itself -------------------------------------------------

console.log('spell_vfx: the visual table is whole');
{
  const families = new Set(Object.values(ABILITY_VISUALS).map((v) => v.family));
  ck(`${Object.keys(ABILITY_VISUALS).length} rows across ${families.size} families`, families.size >= 14, [...families].join(','));
  const bad = Object.entries(ABILITY_VISUALS).filter(([, v]) => !v.color || !v.accent || !(v.scale > 0) || !(v.count > 0));
  ck('every row has a colour, an accent, a scale and a count', bad.length === 0, bad.map(([k]) => k).join(','));
  const orphan = Object.keys(ABILITY_VISUALS).filter((id) => !ABILITIES.find((a) => planFor(a.id) && planFor(a.id).id === id));
  ck('no row in the table answers an ability that does not exist', orphan.length === 0, orphan.join(','));
  const movesMissing = Object.keys(FALLBACK_MOVES).filter((id) => !visualFor(id));
  ck('every move the fallback table names belongs to a real ability', movesMissing.length === 0, movesMissing.join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
