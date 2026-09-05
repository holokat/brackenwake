// The eleven wild structures: what they cost, where they stand, and what burns
// on them. Run: node src/world/structures.test.mjs
//
// Nothing here is mocked. The field is the real one, the sites are the ones the
// real roll puts in the real world, the bodies are built by the real
// `buildSiteMarker` and merged by the real `mergeByMaterial`, and the fires are
// driven through the real `createSiteMarkers.animate`, which is the call
// `world_runtime.js` makes. The one thing node does not have is a 2D canvas, so
// the gate's lettering goes through the recording stub `structures.js` uses when
// there is no canvas, and the test reads the word off it.
//
// What is measured, and why each measurement exists:
//
//   draw calls      a marker is streamed in one build a frame and then drawn
//                   every frame after. `mergeByMaterial` is the whole reason a
//                   kit town is affordable; a structure that leaks materials
//                   would quietly cost forty draws instead of ten.
//   triangles       so the number is on the record and a later change to a body
//                   can be seen to have doubled it.
//   reach vs pad    `field.js` levels dead flat only to `flatR * 0.55`. A body
//                   wider than that stands on the shoulder of its own pad. This
//                   is the check that the eleven pads in `sitegrid.KINDS` were
//                   chosen from the bodies and not from a guess.
//   one light       a fire owns at most one PointLight for the whole structure.
//                   Four braziers round a temple with a light each is four
//                   shadow casting lights on one marker.
//   the door        a tomb hands `interact.decide` a site of kind 'dungeon' and
//                   the tomb itself is refused, which is the same shape a mine's
//                   cut has and the reason the enter path needed no change.

import * as THREE from 'three';
import { createWorldField } from './field.js';
import { WILD_KINDS, WILD_KIND_IDS, SITE_CELL } from './sitegrid.js';
import { sitesNear } from './sites.js';
import { buildSiteMarker, createSiteMarkers } from './site_models.js';
import {
  buildStructure, auditStructures, trisOf, tombDoor,
  PAD_FLAT, MAX_DRAWS, MAX_TRIS, BUILDERS, wordTexture, REALM_STONE, DEFAULT_STONE,
} from './structures.js';
import { createFires, createGlows, FIRE_KINDS, FLAME_FRAMES, FLAME_FPS, DAY_GLOW, SMOKE_EVERY } from './fire.js';
import { createEffects, stepParticle, EMBER_DRAG } from '../game/effects.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const SEED = 20260904;
const f = createWorldField(SEED, { homeBiome: 'meadow', homeY: -0.3 });
const heightAt = (x, z) => f.heightAt(x, z);

/** One real site of every wild kind, out of the world the seed made. */
const SITES = (() => {
  const found = new Map();
  const R = 60;
  for (let cz = -R; cz <= R && found.size < WILD_KINDS.length; cz++) {
    for (let cx = -R; cx <= R && found.size < WILD_KINDS.length; cx++) {
      const s = f.siteInCell(cx, cz);
      if (s && WILD_KIND_IDS.has(s.kind) && !found.has(s.kind)) found.set(s.kind, s);
    }
  }
  return found;
})();

/** Every drawable under an object: meshes, sprites and point clouds all cost one. */
function drawsOf(g) {
  let n = 0;
  g.traverse((o) => { if (o.isMesh || o.isSprite || o.isPoints) n++; });
  return n;
}
function lightsOf(g) {
  let n = 0;
  g.traverse((o) => { if (o.isLight) n++; });
  return n;
}
/** The furthest any vertex of a marker stands from the site's own centre. */
function reachOf(g, site) {
  g.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let far = 0;
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      far = Math.max(far, Math.hypot(v.x - site.x, v.z - site.z));
    }
  });
  return far;
}
/** How far the lowest vertex of a marker is above or below the ground under it. */
function footGap(g) {
  g.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let deepest = Infinity, nearest = Infinity;
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      const d = v.y - heightAt(v.x, v.z);
      deepest = Math.min(deepest, d);
      nearest = Math.min(nearest, Math.abs(d));
    }
  });
  return { deepest, nearest };
}

// ============================================================================
console.log('structures: the table and this file agree');
{
  const counted = auditStructures();
  check('every kind sitegrid rolls has a builder here', counted.kinds === WILD_KINDS.length,
    `${counted.kinds} builders for ${WILD_KINDS.length} rows`);
  // the other direction: take a builder away and the audit has to say so
  const keep = BUILDERS.arena;
  delete BUILDERS.arena;
  let threw = '';
  try { auditStructures(); } catch (e) { threw = e.message; }
  BUILDERS.arena = keep;
  check('and a missing builder is caught, not shipped', /arena/.test(threw), threw.split('\n')[1]?.trim());
  // and a builder for a kind nobody rolls
  BUILDERS.ziggurat = () => {};
  let threw2 = '';
  try { auditStructures(); } catch (e) { threw2 = e.message; }
  delete BUILDERS.ziggurat;
  check('and so is a builder for a kind the world never makes', /ziggurat/.test(threw2), threw2.split('\n')[1]?.trim());
  check('and with both put back the audit is green again', !!auditStructures());
}

// ============================================================================
console.log('structures: every one of the eleven builds, and what it costs');
{
  check('the world holds one of every wild kind within 29 km', SITES.size === WILD_KINDS.length,
    [...SITES.keys()].join(', '));
  let overDraws = 0, overTris = 0, empty = 0, untagged = 0, overLit = 0;
  const rows = [];
  for (const [, kind] of WILD_KINDS) {
    const site = SITES.get(kind);
    if (!site) { empty++; continue; }
    const t0 = performance.now();
    const g = buildSiteMarker(site, heightAt);
    const ms = performance.now() - t0;
    const draws = drawsOf(g), tris = Math.round(trisOf(g)), lights = lightsOf(g);
    if (draws > MAX_DRAWS) overDraws++;
    if (tris > MAX_TRIS) overTris++;
    if (draws === 0) empty++;
    if (lights > 1) overLit++;
    g.traverse((o) => { if (o.isMesh && !o.userData.site) untagged++; });
    rows.push(`${kind} ${draws}d/${tris}t/${lights}L ${ms.toFixed(1)}ms`);
  }
  console.log('        ' + rows.join('\n        '));
  check(`no structure is over ${MAX_DRAWS} draw calls once merged`, overDraws === 0);
  check(`nor over ${MAX_TRIS.toLocaleString()} triangles`, overTris === 0);
  check('every one of them put meshes in the world', empty === 0);
  check('and every mesh of every one carries a site, so a raycast can name it', untagged === 0);
  check('and no structure owns more than one PointLight', overLit === 0);
}

// ============================================================================
console.log('structures: the pad under it is wide enough for the body on it');
{
  // Not one instance of each: the ground and the roll differ from place to
  // place, so this walks every wild site in a 12 km square and measures the
  // worst reach of each kind.
  const worst = new Map();
  const R = 25;
  let built = 0;
  for (let cz = -R; cz <= R; cz++) {
    for (let cx = -R; cx <= R; cx++) {
      const s = f.siteInCell(cx, cz);
      if (!s || !WILD_KIND_IDS.has(s.kind)) continue;
      const g = buildSiteMarker(s, heightAt);
      built++;
      const r = reachOf(g, s);
      const w = worst.get(s.kind);
      if (!w || r > w.r) worst.set(s.kind, { r, flat: s.flatR * PAD_FLAT, pad: s.flatR, name: s.name });
    }
  }
  let over = 0;
  const rows = [];
  for (const [kind, w] of worst) {
    if (w.r > w.flat) over++;
    rows.push(`${kind} reach ${w.r.toFixed(1)} of ${w.flat.toFixed(1)} flat (pad ${w.pad})`);
  }
  console.log('        ' + rows.join('\n        '));
  check(`every body stands inside the dead level part of its own pad, over ${built} structures`,
    over === 0 && worst.size > 6, `${worst.size} kinds measured, ${over} over`);
  // the other direction: a pad that is too small has to be caught, so shrink one
  {
    const s = SITES.get('temple');
    const shrunk = { ...s, flatR: 8 };
    const g = buildSiteMarker(shrunk, heightAt);
    check('and a temple on an eight metre pad is caught by the same measurement',
      reachOf(g, shrunk) > 8 * PAD_FLAT, `${reachOf(g, shrunk).toFixed(1)} m of body on ${(8 * PAD_FLAT).toFixed(1)} m of level ground`);
  }
}

// ============================================================================
console.log('structures: nothing floats and nothing is buried');
{
  let floating = 0, buried = 0;
  const rows = [];
  for (const [, kind] of WILD_KINDS) {
    const site = SITES.get(kind);
    const g = buildSiteMarker(site, heightAt);
    const { deepest } = footGap(g);
    // something has to reach the ground, and nothing may be lost in it
    if (deepest > 0.05) floating++;
    if (deepest < -3.2) buried++;
    rows.push(`${kind} ${deepest.toFixed(2)}`);
  }
  console.log('        lowest vertex against its own ground: ' + rows.join(', '));
  check('every structure reaches the ground somewhere', floating === 0);
  check('and none of them is more than 3.2 m into it', buried === 0);
}

// ============================================================================
console.log('structures: a tomb hands the runtime a door, not a tomb');
{
  const tomb = SITES.get('tomb');
  const door = tombDoor(tomb);
  // this is the gate world_runtime.enterDungeon and interact.decide both apply
  const enterable = (s) => !!s && (s.kind === 'dungeon' || s.kind === 'cave');
  check('the door is a dungeon and the runtime will open it', enterable(door), `kind "${door.kind}"`);
  check('and the tomb itself is not, which is why the pad, the habitat and the map still see a tomb',
    !enterable(tomb), `kind "${tomb.kind}"`);
  check('the door is handed a generator cell far from every real one, so it is not some other dungeon',
    door.cx - tomb.cx === 200003 && door.cz === tomb.cz, `cx ${tomb.cx} -> ${door.cx}`);
  check('and it owns no cell, so no roll and no sitesNear will ever hand it back',
    !sitesNear(f, door.x, door.z, 30).some((s) => s.id === door.id),
    `sitesNear there returns ${sitesNear(f, door.x, door.z, 30).map((s) => s.kind).join(', ') || 'nothing'}`);
  check('and the dungeon roll is untouched: dungeon is still a row of its own weight',
    !WILD_KIND_IDS.has('dungeon'));

  const g = buildSiteMarker(tomb, heightAt);
  const doors = [];
  g.traverse((o) => { if (o.isMesh && o.userData.site && o.userData.site !== tomb) doors.push(o); });
  check('the meshes at the door carry the DOOR, and nothing else does',
    doors.length === 2 && doors.every((o) => o.userData.site.kind === 'dungeon'),
    `${doors.length} meshes on the door`);
  const at = doors[0].userData.site;
  check('and it stands where the door is, not at the middle of the barrow',
    Math.hypot(at.x - tomb.x, at.z - tomb.z) > 5, `${Math.hypot(at.x - tomb.x, at.z - tomb.z).toFixed(1)} m out`);
  check('it is named for the tomb, so the banner says a place and not an id',
    at.name === tomb.name, at.name);
}

// ============================================================================
console.log('structures: the gate says a word');
{
  const gate = SITES.get('gate');
  const g = buildSiteMarker(gate, heightAt);
  const word = g.userData.wild.word;
  check('a gate carries a word taken out of its own name', !!word && gate.name.toUpperCase().includes(word),
    `"${gate.name}" -> ${word}`);
  // and the word really reached a texture: the node stub records every fillText
  let texts = null;
  g.traverse((o) => {
    if (o.isMesh && o.material?.map?.userData?.canvas) texts = o.material.map.userData.canvas.__texts;
  });
  check('and the word is really painted on the lintel, twice, shadow and face',
    !!texts && texts.length === 2 && texts.every((t) => t.text === word),
    texts ? texts.map((t) => t.text).join(', ') : 'no lettered texture found');
  // the other direction: the lettering survived the merge, which is the whole
  // reason it is an extra and not a mesh of the group
  let withUv = 0;
  g.traverse((o) => { if (o.isMesh && o.material?.map && o.geometry.attributes.uv) withUv++; });
  check('the lettered plates kept their uvs, which the merge would have deleted', withUv === 2,
    `${withUv} lettered plates with uvs`);
  const t = wordTexture('KILN');
  check('and wordTexture is a pure function of the word', t.userData.word === 'KILN');
}

// ============================================================================
console.log('structures: a temple is built in its realm\'s own stone');
{
  const hexes = new Set();
  const R = 25;
  for (let cz = -R; cz <= R; cz++) {
    for (let cx = -R; cx <= R; cx++) {
      const s = f.siteInCell(cx, cz);
      if (!s || s.kind !== 'temple') continue;
      const built = buildStructure(s, heightAt);
      let biggest = null, area = 0;
      built.group.traverse((o) => {
        if (!o.isMesh || !o.material?.color) return;
        const n = o.geometry.attributes.position.count;
        if (n > area) { area = n; biggest = o.material.color.getHex(); }
      });
      if (biggest != null) hexes.add(biggest);
    }
  }
  const known = new Set([...Object.values(REALM_STONE), DEFAULT_STONE]);
  check('the temples of the world are not all the same colour', hexes.size > 1,
    `${hexes.size} stones over the temples found`);
  check('and every stone one of them is built in is a realm\'s own',
    hexes.size > 0 && [...hexes].every((h) => known.has(h)),
    [...hexes].map((h) => '#' + h.toString(16)).join(', '));
  check('the table covers all nine realms', Object.keys(REALM_STONE).length === 9,
    Object.keys(REALM_STONE).join(', '));
  // the other direction: open country between the realms falls back, and the
  // fallback is a colour and not undefined
  check('and a temple outside every realm still has a stone to be built in',
    typeof DEFAULT_STONE === 'number' && !Object.values(REALM_STONE).includes(DEFAULT_STONE),
    '#' + DEFAULT_STONE.toString(16));
}

// ============================================================================
console.log('fire: the flame runs, the night opens it up, and it owns one light');
{
  const fires = createFires([
    { x: 0, y: 0, z: 0, kind: 'campfire' },
    { x: 6, y: 0, z: 0, kind: 'brazier', scale: 0.8 },
    { x: -6, y: 0, z: 3, kind: 'wreck', scale: 1.2 },
  ], { seed: 7 });
  check('three fires, one light between them', fires.lightCount === 1, `${fires.lightCount} PointLight`);
  check('and they cost eight draws, two quads each plus the coals and the sparks',
    fires.drawCount === 8, `${fires.drawCount} draws`);

  // the frames really advance, and standing still really stands still
  const f0 = fires.frame;
  fires.update(0);
  check('no time passing leaves the flame on the frame it was on', fires.frame === f0, `frame ${f0}`);
  const seen = new Set([f0]);
  for (let i = 0; i < 40; i++) { fires.update(1 / 30); seen.add(fires.frame); }
  check(`a second and a third of flame walks all ${FLAME_FRAMES} frames of the sheet`,
    seen.size === FLAME_FRAMES, `${[...seen].sort().join(', ')} at ${FLAME_FPS} fps`);
  // and the sheet offset really moved with it, which is the thing on screen
  const offsets = new Set();
  for (let i = 0; i < 40; i++) {
    fires.update(1 / 30);
    fires.group.traverse((o) => { if (o.isSprite) offsets.add(o.material.map.offset.x.toFixed(3)); });
  }
  check('and the texture offset walked with it, so it is the sheet moving and not a counter',
    offsets.size === FLAME_FRAMES, [...offsets].sort().join(', '));

  // the night, both ways
  fires.setNight(0);
  const dayGlow = fires.coalMaterial.emissiveIntensity;
  const dayLight = fires.light.intensity;
  fires.setNight(1);
  const nightGlow = fires.coalMaterial.emissiveIntensity;
  const nightLight = fires.light.intensity;
  check('midnight makes the coals brighter than noon does',
    nightGlow > dayGlow * 1.5, `${dayGlow.toFixed(2)} by day, ${nightGlow.toFixed(2)} at midnight`);
  check('and the one light with them', nightLight > dayLight * 1.5,
    `${dayLight.toFixed(2)} to ${nightLight.toFixed(2)}`);
  check('but a fire is never out by day, because a cold camp is an empty camp',
    dayGlow > 0 && dayLight > 0 && Math.abs(dayGlow / nightGlow - DAY_GLOW) < 0.02,
    `day is ${(100 * dayGlow / nightGlow).toFixed(0)}% of night`);
  fires.setNight(0);
  check('and going back to day puts it back down', fires.coalMaterial.emissiveIntensity < nightGlow * 0.6);

  // a fire may be built with no light at all
  const dark = createFires([{ x: 0, y: 0, z: 0, kind: 'brazier' }], { castLight: false });
  check('a fire told not to light anything builds no PointLight', dark.lightCount === 0);
  const none = createFires([], {});
  check('and no fires at all is a group with nothing in it, not a throw',
    none.lightCount === 0 && none.drawCount === 0 && none.group.children.length === 0);
  const bogus = createFires([{ x: 0, y: 0, z: 0, kind: 'bonfire-of-the-vanities' }], {});
  check('and a kind fire.js does not know is dropped, not drawn', bogus.drawCount === 0);
  check('the four kinds it does know all have a flame, embers, a reach and a warmth',
    Object.values(FIRE_KINDS).every((k) => k.flame > 0 && k.embers > 0 && k.reach > 0 && k.warm > 0),
    Object.keys(FIRE_KINDS).join(', '));
  fires.dispose(); dark.dispose(); bogus.dispose();
}

// ============================================================================
console.log('fire: smoke goes into the game\'s own particle pool');
{
  // the REAL effects, not a stand in: the pool, the instanced mesh and the
  // particle step are the ones a spell uses
  const scene = new THREE.Group();
  const effects = createEffects(scene);
  const before = effects.particleCount;
  effects.fire({ x: 0, y: 1, z: 0 }, 1.4);
  check('effects.fire puts embers and smoke in the shared pool',
    effects.particleCount > before, `${before} to ${effects.particleCount} particles`);

  // an ember rises. `stepParticle` does vy -= gravity * drag, so the drag has
  // to be negative or a spark off a fire falls like gravel.
  const p = { x: 0, y: 1, z: 0, vx: 0, vy: 0.4, vz: 0, age: 0, life: 2, size: 1, drag: EMBER_DRAG, friction: 0.5, dead: false };
  const y0 = p.y;
  for (let i = 0; i < 30; i++) stepParticle(p, 1 / 30);
  check('and an ember climbs instead of falling', p.y > y0, `${y0.toFixed(2)} to ${p.y.toFixed(2)} m in a second`);
  const stone = { ...p, y: 1, vy: 0.4, age: 0, drag: 1 };
  for (let i = 0; i < 30; i++) stepParticle(stone, 1 / 30);
  check('and the same particle with an ordinary drag falls, so the sign is doing the work',
    stone.y < 1, `${stone.y.toFixed(2)} m`);

  // and a fire hands its smoke over on a clock
  const withPool = createFires([{ x: 0, y: 0, z: 0, kind: 'wreck' }], { seed: 2, effects });
  const n0 = effects.particleCount;
  for (let i = 0; i < 60; i++) withPool.update(1 / 30);
  check(`two seconds of a burning wreck is ${Math.floor(2 / SMOKE_EVERY)} puffs of smoke`,
    withPool.puffs === Math.floor(2 / SMOKE_EVERY) && effects.particleCount > n0,
    `${withPool.puffs} puffs, ${effects.particleCount - n0} more particles`);
  const noPool = createFires([{ x: 0, y: 0, z: 0, kind: 'wreck' }], { seed: 2 });
  for (let i = 0; i < 60; i++) noPool.update(1 / 30);
  check('and the same fire with nothing to put smoke in burns just the same and makes none',
    noPool.puffs === 0 && noPool.drawCount === withPool.drawCount, `${noPool.puffs} puffs`);
  const junk = createFires([{ x: 0, y: 0, z: 0, kind: 'wreck' }], { seed: 2, effects: { nope: 1 } });
  junk.update(1);
  check('and an effects with no fire on it is ignored rather than thrown at', junk.puffs === 0);
  withPool.dispose(); noPool.dispose(); junk.dispose();
  effects.dispose();
}

// ============================================================================
console.log('fire: a lit window comes up at dusk');
{
  const glows = createGlows([{ x: 0, y: 12, z: 3, ry: 0.4, w: 0.8, h: 1.2, colour: 0xffcf78 }]);
  check('three windows of one colour are one draw call',
    createGlows([1, 2, 3].map((i) => ({ x: i, y: 4, z: 0, colour: 0xffcf78 }))).drawCount === 1);
  glows.setNight(0);
  const day = glows.panes[0].material.opacity;
  glows.setNight(1);
  const night = glows.panes[0].material.opacity;
  check('a window is nearly dark by day and open at night', night > day * 8,
    `${day.toFixed(3)} to ${night.toFixed(3)}`);
  const before = glows.panes[0].material.opacity;
  glows.update(0.7);
  check('and it wanders while you look at it, because a candle does',
    glows.panes[0].material.opacity !== before,
    `${before.toFixed(4)} to ${glows.panes[0].material.opacity.toFixed(4)}`);
  glows.dispose();
}

// ============================================================================
console.log('structures: the fires reach the world through the real streamer');
{
  const camp = SITES.get('bandit_camp');
  const scene = new THREE.Group();
  const discovery = { sitesNear: (x, z, r) => sitesNear(f, x, z, r) };
  const markers = createSiteMarkers(scene, discovery, heightAt);
  markers.update(camp.x, camp.z, 60);
  let guard = 0;
  while (markers.pending && guard++ < 40) markers.update(camp.x, camp.z, 60);
  check('walking up to a bandit camp builds it', markers.count >= 1, `${markers.count} markers live`);
  check('and it is one of the markers with something that moves', markers.animatedCount >= 1,
    `${markers.animatedCount} of ${markers.count} animate`);

  const fire = () => {
    let out = null;
    for (const g of scene.children) if (g.userData.wild?.fires?.fires?.length) out = g.userData.wild.fires;
    return out;
  };
  const fx = fire();
  check('the camp really has a fire on it', !!fx && fx.fires.length === 1);
  const f0 = fx.frame;
  markers.update(camp.x, camp.z, 60);
  check('the three argument update world_runtime has always made leaves the flame alone',
    fx.frame === f0, `frame ${f0}`);
  let moved = false;
  for (let i = 0; i < 20 && !moved; i++) { markers.animate(1 / 30, 1); if (fx.frame !== f0) moved = true; }
  check('and animate(dt, night) runs it', moved, `frame ${f0} to ${fx.frame}`);
  check('and the night opened the coals up', fx.night === 1 && fx.coalMaterial.emissiveIntensity > DAY_GLOW,
    `emissive ${fx.coalMaterial.emissiveIntensity.toFixed(2)}`);
  markers.animate(1 / 30, 0);
  check('and daylight closes them again', fx.night === 0);

  markers.update(camp.x + 6000, camp.z + 6000, 60);
  check('walking off drops the camp and its fire with it', markers.count === 0 && markers.animatedCount === 0);
  markers.dispose();
  check('dispose leaves the scene empty', scene.children.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
