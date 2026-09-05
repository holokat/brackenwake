// The world runtime, driven through its own real surface.
// Run: node src/game/world_runtime.test.mjs
//
// This is the successor to src/world/dungeon_farm.test.mjs, which drove the
// same code while it still lived on the farm class. The claim under test is
// the same hard one: going under the ground switches the daylight world off,
// and coming back up puts it back EXACTLY, down to the fog numbers and the
// background object, so the streamed world carries on from the chunk you left.
//
// What is new is the thing that replaced the farm's blanket sweep. There is a
// player in the scene now, and hiding "every visible child" would have taken
// it down the stairs as a corpse. The runtime hides a named list instead, and
// the first block below proves that list still matches the names scene.js
// gives its nodes. Rename one and this suite goes red instead of the sky
// quietly appearing through a cave roof.

globalThis.performance ||= { now: () => Date.now() };
globalThis.requestAnimationFrame ||= (fn) => setTimeout(() => fn(performance.now()), 16);

// A canvas good enough for the two textures the sky and the water paint. Three
// never reads the pixels back without a renderer, so no-ops are honest here.
function fakeCanvas() {
  const noop = () => {};
  const ctx = {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    fillRect: noop, clearRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, ellipse: noop, rect: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, fill: noop, stroke: noop,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    drawImage: noop, putImageData: noop, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    fillText: noop, measureText: () => ({ width: 0 }),
  };
  return { width: 0, height: 0, style: {}, getContext: () => ctx, addEventListener: noop, remove: noop };
}
globalThis.document ||= {
  createElement: (tag) => (tag === 'canvas' ? fakeCanvas() : { style: {}, appendChild() {}, addEventListener() {}, remove() {} }),
  addEventListener() {}, head: { appendChild() {} }, body: { appendChild() {} },
  getElementById: () => null,
};
globalThis.window ||= { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
const mem = new Map();
globalThis.localStorage ||= {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.navigator ||= { userAgent: 'node' };

const warn = console.warn; console.warn = () => {};
const THREE = await import('three');
const { createWorldRuntime, WORLD_SEED, DUNGEON_FLOOR_Y } = await import('./world_runtime.js');
const { PALETTE, WORLD_FOG, dayFactorAt , DAY_CYCLE_MS } = await import('./scene.js');
const { maxLevel, walkable, gridOf } = await import('../world/dungeon_gen.js');
const { createWorldField } = await import('../world/field.js');
const { treeFieldsFor } = await import('../farm/tree_edit.js');
console.warn = warn;

let bad = 0, pass = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : bad++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// A stand-in for createScene that builds the same named nodes, so the runtime
// is driven exactly as the game drives it without needing a WebGL context.
function standScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.colors.fogDay, WORLD_FOG.near, WORLD_FOG.far);
  scene.background = new THREE.Color(PALETTE.skyDay[1]);
  const sky = new THREE.Group(); sky.name = 'sky'; scene.add(sky);
  for (const [name, light] of [
    ['sun-light', new THREE.DirectionalLight(0xffffff, 2.4)],
    ['hemi-light', new THREE.HemisphereLight(0xbfe0ff, 0xa98a63, 0.9)],
    ['ambient-light', new THREE.AmbientLight(0xffe8d0, 0.22)],
    ['fill-light', new THREE.DirectionalLight(0x9fc0ff, 0.4)],
  ]) { light.name = name; scene.add(light); }
  let pinned = false;
  return {
    scene, sky,
    camera: new THREE.PerspectiveCamera(55, 1.3, 0.1, 1800),
    setFog(near, far, hex) {
      scene.fog.near = near; scene.fog.far = far;
      if (hex != null) { scene.fog.color.setHex(hex); pinned = true; } else pinned = false;
    },
    get fogPinned() { return pinned; },
  };
}

// ---------------------------------------------------------------------------
// 1. the names the runtime hides by are the names scene.js hands out
// ---------------------------------------------------------------------------
{
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('./scene.js', import.meta.url), 'utf8'));
  const rt = await import('node:fs').then((fs) => fs.readFileSync(new URL('./world_runtime.js', import.meta.url), 'utf8'));
  const wanted = ['sky', 'sun-light', 'hemi-light', 'ambient-light', 'fill-light'];
  const inRuntime = wanted.filter((n) => rt.includes(`'${n}'`));
  const inScene = wanted.filter((n) => src.includes(`'${n}'`));
  ck('the runtime hides five named scene nodes', inRuntime.length === 5, inRuntime.join(' '));
  ck('scene.js names all five of them', inScene.length === 5, inScene.join(' '));
}

// ---------------------------------------------------------------------------
// 2. the build
// ---------------------------------------------------------------------------
const sc = standScene();
const player = new THREE.Group(); player.name = 'player';
sc.scene.add(player);
const rt = createWorldRuntime(sc, { homeBiome: 'meadow' });

ck('the runtime hands back every module the contract names',
  !!(rt.field && rt.world && rt.flora && rt.fauna && rt.discovery && rt.siteMarkers));
ck('fog in the open is 90 to 536', sc.scene.fog.near === 90 && sc.scene.fog.far === 536,
  `${sc.scene.fog.near}-${sc.scene.fog.far}`);
ck('the fog colour is not pinned above ground', sc.fogPinned === false);
// Two, not three. `world-fauna` is gone: fauna draws nothing now, it says where
// the world's animals belong and the monster layer stands them up (F1). What
// used to be checked here is checked in src/world/fauna.test.mjs instead.
ck('the two streamed groups are in the scene',
  ['world-stream', 'world-flora'].every((n) => sc.scene.children.some((o) => o.name === n)));
ck('and there is no fauna group any more, because fauna draws nothing',
  !sc.scene.children.some((o) => o.name === 'world-fauna'));

// heightAt above ground is the field, not an approximation of it
{
  const f = createWorldField(WORLD_SEED, { homeBiome: 'meadow', homeY: -0.3 });
  let same = 0;
  for (let i = 0; i < 40; i++) {
    const x = (i * 37) % 900 - 450, z = (i * 71) % 900 - 450;
    if (rt.heightAt(x, z) === f.heightAt(x, z)) same++;
  }
  ck('heightAt above ground is the field verbatim', same === 40, `${same}/40`);
}
ck('clampWalkable above ground is the identity', (() => {
  const [x, z] = rt.clampWalkable(123.5, -87.25);
  return x === 123.5 && z === -87.25;
})());

// stream a few frames so trees and a site marker actually get built.
// Nothing stands within the 576 m ring of the origin, so the walk is out to
// the nearest place there is: markers only build for sites the ring reaches.
const NEAR_SITE = rt.sitesNear(0, 0, 1200).sort(
  (a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
{
  ck('there is a place to walk to inside 1200 m', !!NEAR_SITE,
    NEAR_SITE ? `${NEAR_SITE.kind} at ${Math.round(Math.hypot(NEAR_SITE.x, NEAR_SITE.z))} m` : 'none');
  ck('and nothing at all inside the streamed ring of the spawn', rt.sitesNear(0, 0, 576).length === 0);
  let t = 1000;
  for (let i = 0; i < 400 && rt.siteMarkers.count < 1; i++) {
    t += 16;
    rt.update(0.016, t, NEAR_SITE.x, NEAR_SITE.z, 1);
  }
  ck(`${rt.siteMarkers.count} site marker(s) built at ${NEAR_SITE.name}`, rt.siteMarkers.count >= 1);
  ck('site marker groups are named for the site', sc.scene.children.some((o) => o.name.startsWith('site:')));
  ck('trees streamed in around it', treeFieldsFor().some((f) => f.trees.length > 0),
    `${treeFieldsFor().reduce((a, f) => a + f.trees.length, 0)} trees in ${treeFieldsFor().length} fields`);
}

// ---------------------------------------------------------------------------
// 3. the night gate is driven both ways through the real update
// ---------------------------------------------------------------------------
// The runtime no longer tells fauna what time it is: `monsters.js` already
// knows, and it is the thing that asks. What the runtime owes the monster layer
// is the critter source, so that is what is checked.
{
  // a chunk that actually rolls something, or every check below passes on an
  // empty array and proves nothing
  let at = null, day = [];
  for (let cx = 0; cx < 300 && !day.length; cx++) { day = rt.critterSpawns(cx, 17, false); at = [cx, 17]; }
  const night = rt.critterSpawns(at[0], at[1], true);
  ck('the runtime hands out critter spawn records', day.length > 0, `${day.length} at chunk ${at.join(',')}`);
  ck('and they are the records fauna placed, in the monster layer\'s shape',
    day.every((r) => typeof r.id === 'string' && r.key.startsWith('critter:')
      && Number.isFinite(r.x) && Number.isFinite(r.z) && Number.isFinite(r.y)),
    day.map((r) => r.id).join(', '));
  ck('a night ask carries the night flag through to the record',
    night.length > 0 && night.every((r) => r.night === true) && day.every((r) => r.night === false),
    `${day.length} by day, ${night.length} by night`);
  let placed = 0;
  for (let cx = 0; cx < 60; cx++) for (let cz = 0; cz < 6; cz++) placed += rt.critterSpawns(cx, cz, false).length;
  ck('and over 360 chunks of real world it places a good number of them', placed > 20, `${placed} animals`);
}

// ---------------------------------------------------------------------------
// 4. a site that is not a door does not open
// ---------------------------------------------------------------------------
ck('a town is not a door', rt.enterDungeon({ id: '0,0', cx: 0, cz: 0, kind: 'town', name: 'Bracken', x: 0, z: 0 }) === null);
ck('and nothing was hidden by asking', rt.inDungeon === false && sc.scene.children.every((o) => o.visible));

// ---------------------------------------------------------------------------
// 5. down, and back up, for both kinds
// ---------------------------------------------------------------------------
let clock = 1e6;   // keeps climbing, so the 400 ms sweep gate actually opens
for (const kind of ['dungeon', 'cave']) {
  const site = {
    id: '3,-7', cx: 3, cz: -7, x: 1500, z: -3300, kind,
    name: kind === 'cave' ? "Ash's Delve" : 'the Ash Cut', article: 'a', facing: 1,
  };
  const states = [];
  rt.onDungeonState((st) => states.push(st));

  const before = {
    fogNear: sc.scene.fog.near, fogFar: sc.scene.fog.far, fogHex: sc.scene.fog.color.getHex(),
    pinned: sc.fogPinned, bg: sc.scene.background,
    visible: sc.scene.children.filter((o) => o.visible).map((o) => o.name),
  };
  // something that was already off before you went down
  const alreadyOff = new THREE.Group(); alreadyOff.name = 'sky-extra-off';
  alreadyOff.visible = false; sc.scene.add(alreadyOff);

  rt.enterDungeon(site);
  ck(`${kind}: inside at level 1`, rt.inDungeon && rt.dungeonLevel === 1);
  ck(`${kind}: the sky, the four lights and the two world groups are all off`,
    ['sky', 'sun-light', 'hemi-light', 'ambient-light', 'fill-light', 'world-stream', 'world-flora']
      .every((n) => !sc.scene.children.find((o) => o.name === n).visible));
  ck(`${kind}: and there are no critters underground, because a level is not a meadow`,
    rt.critterSpawns(6, 17, false).length === 0);
  ck(`${kind}: every site marker is off`, sc.scene.children.filter((o) => o.name.startsWith('site:')).every((o) => !o.visible));
  ck(`${kind}: THE PLAYER IS STILL VISIBLE`, player.visible === true);
  ck(`${kind}: the fog is pinned to the level's own colour`,
    sc.fogPinned === true && sc.scene.fog.color.getHex() !== before.fogHex && sc.scene.fog.far < before.fogFar,
    `#${sc.scene.fog.color.getHexString()} ${sc.scene.fog.near}-${sc.scene.fog.far}`);
  ck(`${kind}: the background went dark`, sc.scene.background.getHex() < 0x101010,
    `#${sc.scene.background.getHexString()}`);
  ck(`${kind}: entering fired one state, inside, with somewhere to stand`,
    states.length === 1 && states[0].inside === true && states[0].level === 1
    && states[0].at && Number.isFinite(states[0].at.x));
  ck(`${kind}: it arrived at the entrance`,
    states[0].arrivedAt === 'entrance'
    && Math.hypot(states[0].at.x - rt.dungeonScene.entrancePos.x, states[0].at.z - rt.dungeonScene.entrancePos.z) < 1e-9);
  ck(`${kind}: it counted what is down there without promising a stair`,
    states[0].kind === kind && states[0].bottom === (maxLevel(kind) === 1)
    && states[0].ore === rt.dungeonScene.layout.ore.length
    && states[0].chests === rt.dungeonScene.layout.chests.length);
  ck(`${kind}: it named its exits`, states[0].exits.length === (maxLevel(kind) > 1 ? 2 : 1),
    states[0].exits.map((e) => e.dir).join(' '));
  ck(`${kind}: heightAt underground is the floor, not the terrain`,
    rt.heightAt(0, 0) === DUNGEON_FLOOR_Y && rt.heightAt(9e5, -9e5) === DUNGEON_FLOOR_Y);

  // walk into the rock from every angle and watch the clamp hold the line
  let offFloor = 0, steps = 0;
  const at = states[0].at;
  for (let a = 0; a < 6.28; a += 0.4) {
    let x = at.x, z = at.z;
    for (let i = 0; i < 60; i++) {
      x += Math.cos(a) * 1.4; z += Math.sin(a) * 1.4;
      [x, z] = rt.clampWalkable(x, z);
      steps++;
      const g = gridOf(rt.dungeonScene.layout, x, z);
      if (!walkable(rt.dungeonScene.layout, g.gx, g.gz)) offFloor++;
    }
  }
  ck(`${kind}: ${steps} steps into the walls, never once off the floor`, offFloor === 0, `${offFloor} off`);

  // a pick underground finds the exit and not a tree from the world above
  {
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(at.x, 20, at.z), new THREE.Vector3(0, -1, 0));
    const hit = rt.pick(ray);
    ck(`${kind}: a ray down the entrance picks the way up`, hit && hit.kind === 'exit' && hit.exit === 'up',
      hit ? `${hit.kind} ${hit.exit || ''}` : 'nothing');
    const away = new THREE.Raycaster();
    away.set(new THREE.Vector3(at.x, 20, at.z + 4000), new THREE.Vector3(0, -1, 0));
    const miss = rt.pick(away);
    ck(`${kind}: a ray into the dark, over hidden overworld trees, picks nothing`, miss === null,
      miss ? miss.kind : 'null');
  }

  // a group that shows up while you are down there is swept, and comes back
  const latecomer = new THREE.Group(); latecomer.name = 'world-flora-late';
  sc.scene.add(latecomer);
  // the sweep only looks at nodes the runtime owns, so give it one it owns
  const lateMarker = new THREE.Group(); lateMarker.name = 'site:9,9';
  sc.scene.add(lateMarker);
  clock += 5000;
  rt.update(0.016, clock, at.x, at.z, 0.5);
  ck(`${kind}: a site marker added underground is swept off`, lateMarker.visible === false);
  ck(`${kind}: a group the runtime does not own is left alone`, latecomer.visible === true);

  // deeper
  const top = maxLevel(kind);
  if (top > 1) {
    const l1 = JSON.stringify(rt.dungeonScene.layout.cells);
    rt.dungeonGo('down');
    ck(`${kind}: down reaches level 2`, rt.dungeonLevel === 2 && states.at(-1).level === 2 && states.at(-1).inside);
    ck(`${kind}: level 2 is a different level`, JSON.stringify(rt.dungeonScene.layout.cells) !== l1);
    rt.dungeonGo('down');
    ck(`${kind}: down again reaches the bottom`, rt.dungeonLevel === 3 && states.at(-1).bottom === true);
    ck(`${kind}: the bottom has no stair, and says so`,
      rt.dungeonScene.stairPos === null && states.at(-1).exits.length === 1 && states.at(-1).exits[0].dir === 'up');
    ck(`${kind}: down at the bottom does nothing`, rt.dungeonGo('down') === null && rt.dungeonLevel === 3);
    rt.dungeonGo('up');
    ck(`${kind}: up returns to level 2, at the stair`,
      rt.dungeonLevel === 2 && states.at(-1).arrivedAt === 'stair'
      && Math.hypot(states.at(-1).at.x - rt.dungeonScene.stairPos.x, states.at(-1).at.z - rt.dungeonScene.stairPos.z) < 1e-9);
    const cells = JSON.stringify(rt.dungeonScene.layout.cells);
    rt.dungeonGo('up'); rt.dungeonGo('down');
    ck(`${kind}: level 2 rebuilt is byte for byte the level you left`,
      JSON.stringify(rt.dungeonScene.layout.cells) === cells);
    rt.dungeonGo('up');
  } else {
    ck(`${kind}: a cave is one level and down does nothing`, rt.dungeonGo('down') === null && rt.dungeonLevel === 1);
  }

  // out
  const levelGroup = rt.dungeonScene.group;
  rt.dungeonGo('up');
  ck(`${kind}: up from level 1 leaves`, rt.inDungeon === false && rt.dungeonLevel === 0);
  ck(`${kind}: the level group is out of the scene and emptied`,
    !sc.scene.children.includes(levelGroup) && levelGroup.children.length === 0);
  ck(`${kind}: leaving fired inside:false, at the mouth it went in by`,
    states.at(-1).inside === false && states.at(-1).at.x === site.x && states.at(-1).at.z === site.z);
  ck(`${kind}: fog restored exactly`,
    sc.scene.fog.near === before.fogNear && sc.scene.fog.far === before.fogFar
    && sc.scene.fog.color.getHex() === before.fogHex && sc.fogPinned === before.pinned,
    `${sc.scene.fog.near}-${sc.scene.fog.far} #${sc.scene.fog.color.getHexString()} pinned=${sc.fogPinned}`);
  ck(`${kind}: the background is the same object it was`, sc.scene.background === before.bg);
  ck(`${kind}: every node that was on is on again`,
    before.visible.every((n) => sc.scene.children.find((o) => o.name === n)?.visible !== false),
    before.visible.filter((n) => sc.scene.children.find((o) => o.name === n)?.visible === false).join(' '));
  ck(`${kind}: what was already hidden stayed hidden`, alreadyOff.visible === false);
  ck(`${kind}: the swept latecomer came back`, lateMarker.visible === true);
  ck(`${kind}: leaving twice is harmless`, rt.leaveDungeon() === false);

  // and again from scratch
  rt.enterDungeon(site); rt.leaveDungeon();
  ck(`${kind}: a second visit restores just as exactly`,
    sc.scene.fog.near === before.fogNear && sc.scene.fog.far === before.fogFar
    && sc.scene.fog.color.getHex() === before.fogHex && sc.scene.background === before.bg
    && sc.scene.children.find((o) => o.name === 'sky').visible === true
    && player.visible === true);

  sc.scene.remove(alreadyOff, latecomer, lateMarker);
  rt.onDungeonState(null);
}

// ---------------------------------------------------------------------------
// 5b. a cavern: the other generator, the sheet's depth, the ledges, the boss
// ---------------------------------------------------------------------------
//
// Everything here is driven through the same surface the game drives: nothing
// reaches into the runtime's own variables. The claims are that the sheet
// decides which generator builds a place and how deep it goes, that the floor
// underground is the cell you are standing on rather than a plane at zero, that
// the camera stays above that floor, that the boss's hall says the boss's name
// through the banner path, and that a box is something a ray can pick.
{
  const { DUNGEONS } = await import('../mmo/dungeons.js');
  const { worldOf } = await import('../world/dungeon_gen.js');
  const { cameraClamp, CAM_MIN_Y } = await import('../world/dungeon.js');
  const spec = DUNGEONS.icevault_deep;                    // a cavern, three levels
  const site = {
    id: `z:${spec.id}`, sub: spec.id, kind: 'dungeon', name: spec.name,
    cx: 41, cz: -13, x: -1900, z: -4900, article: 'a', facing: 1, oreBand: ['coldiron'],
  };
  const zones = [];
  rt.onZone((z) => zones.push(z));
  const states = [];
  rt.onDungeonState((st) => states.push(st));

  rt.enterDungeon(site);
  const L1 = rt.dungeonLayout();
  ck('a cavern in the sheet is built by the cavern generator', L1.gen === 'cavern', String(L1.gen));
  ck('and it carries heights, bridges, water and boxes',
    !!L1.heights && Array.isArray(L1.bridges) && Array.isArray(L1.water) && L1.chests.length > 0,
    `${L1.bridges.length} spans, ${L1.water.length} water cells, ${L1.chests.length} boxes`);
  ck('the sheet says how deep it goes, not the old default',
    rt.dungeonTop === spec.levels && states.at(-1).bottom === false, `${rt.dungeonTop} levels`);
  ck('and the spec came from the table', rt.dungeonSpec?.id === spec.id && rt.dungeonSpec.boss === 'legateOssory');

  // the floor is the cell, not a plane
  {
    const hs = [];
    for (const r of L1.rooms) { const p = worldOf(L1, r.cx, r.cz); hs.push(rt.heightAt(p.x, p.z)); }
    const spread = Math.max(...hs) - Math.min(...hs);
    ck('heightAt underground reads the cell the player stands on', spread > 2,
      `chambers at ${hs.map((h) => h.toFixed(0)).join(', ')} m`);
    ck('and it is the layout\'s own number, to the bit', hs.every((h, i) => {
      const r = L1.rooms[i];
      return h === L1.heights[r.cz * L1.w + r.cx];
    }));
    // The camera, on the LOWEST ledge there is, which is where the old clamp
    // would have been wrong: it held the camera at CAM_MIN_Y above a floor it
    // believed was at zero, so on a chamber twelve metres down it sat eleven
    // metres over the player's head, out through the roof.
    const low = L1.rooms[hs.indexOf(Math.min(...hs))];
    const p = worldOf(L1, low.cx, low.cz);
    const feet = { x: p.x, y: rt.heightAt(p.x, p.z), z: p.z };
    ck('there is a chamber well below the mouth to test the camera on', feet.y <= -4,
      `${feet.y.toFixed(1)} m down`);
    const cam = cameraClamp(L1, { x: feet.x, y: feet.y + 4, z: feet.z + 4 }, feet);
    ck('a camera over a deep chamber is left where it is, under that chamber\'s roof',
      cam.y >= feet.y && cam.y <= feet.y + 4 + 1e-9,
      `camera ${cam.y.toFixed(1)} m, floor ${feet.y.toFixed(1)} m`);
    const sunk = cameraClamp(L1, { x: feet.x, y: feet.y - 5, z: feet.z }, feet);
    ck('and a camera pushed into the floor is pulled up to THAT floor, not to zero',
      Math.abs(sunk.y - (feet.y + CAM_MIN_Y)) < 1e-6 && sunk.moved === true,
      `${sunk.y.toFixed(2)} m, wanted ${(feet.y + CAM_MIN_Y).toFixed(2)}`);
  }

  // a box, picked by a ray, exactly as the cursor would
  {
    rt.dungeonScene.group.updateMatrixWorld(true);
    const c = rt.dungeonChests()[0];
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(c.x, c.y + 20, c.z), new THREE.Vector3(0, -1, 0));
    const hit = rt.pick(ray);
    ck('a ray onto a box picks the box', hit && hit.kind === 'chest' && hit.chest.key === c.key,
      hit ? `${hit.kind} ${hit.chest?.key || ''}` : 'nothing');
    ck('and the box knows which level it is on and what it is worth',
      c.key === `${spec.id}:1:${c.i}` && c.tier === spec.tier, `${c.key} tier ${c.tier}`);
    ck('and the scene can swing its lid open', rt.dungeonScene.openChest(c) === true);
  }

  // down to the bottom, and into the hall
  rt.dungeonGo('down'); rt.dungeonGo('down');
  const L3 = rt.dungeonLayout();
  ck('three levels down is the bottom, and the sheet said so',
    rt.dungeonLevel === 3 && states.at(-1).bottom === true && rt.dungeonGo('down') === null);
  ck('the arena is on this level and was on neither of the two above',
    L3.arena != null && L1.arena === null, `arena room ${L3.arena}`);
  {
    const before = zones.length;
    const at = states.at(-1).at;
    rt.update(0.016, clock += 100, at.x, at.z);
    ck('standing at the mouth says nothing about a boss', zones.length === before);
    const r = L3.rooms[L3.arena];
    const p = worldOf(L3, r.cx, r.cz);
    rt.update(0.016, clock += 100, p.x, p.z);
    const z = zones.at(-1);
    ck('walking into the arena names the boss in the banner',
      zones.length === before + 1 && z && z.name === 'Legate Ossory', z ? z.name : 'nothing said');
    ck('and the banner has a subtitle to read', Array.isArray(z.danger) && z.danger[1] === spec.tier);
    ck('and words to go with it', typeof z.line === 'string' && z.line.includes('Legate Ossory')
      && !z.line.includes('\u2014'), z.line);
    rt.update(0.016, clock += 100, p.x, p.z);
    ck('and it says it once, not every frame you stand there', zones.length === before + 1);
  }
  rt.leaveDungeon();
  ck('and the world came back after a cavern too',
    rt.inDungeon === false && sc.scene.children.find((o) => o.name === 'sky').visible === true);

  // the other generator is untouched for the places that keep it
  {
    const rooms = DUNGEONS.throneofash;
    const built = rt.enterDungeon({
      id: `z:${rooms.id}`, sub: rooms.id, kind: 'dungeon', name: rooms.name,
      cx: 7, cz: 9, x: 6700, z: -160, article: 'a', facing: 1,
    });
    const L = rt.dungeonLayout();
    ck('a place the table marks "rooms" is built by the old generator',
      !!built && L.gen !== 'cavern' && !L.heights, `gen ${L.gen || 'rooms'}`);
    ck('and its floor is the flat one it always was',
      rt.heightAt(0, 0) === DUNGEON_FLOOR_Y && rt.heightAt(30, -30) === DUNGEON_FLOOR_Y);
    ck('and it still carries the boss lair, so Malachar stands in its deep room',
      L.bossLair === 'throneofash');
    // and its boxes are the same boxes, so one file opens a box wherever it stands
    const boxes = rt.dungeonChests();
    ck('a rooms level carries the same box records a cavern does',
      boxes.length > 0 && boxes.every((c) => typeof c.key === 'string' && c.tier === rooms.tier
        && Number.isFinite(c.x) && Number.isFinite(c.z) && (c.kind === 'chest' || c.kind === 'cache')),
      `${boxes.length} boxes, ${boxes.filter((c) => c.kind === 'chest').length} of them locked`);
    ck('and it holds both kinds, not one kind twice',
      boxes.some((c) => c.kind === 'chest') && boxes.some((c) => c.kind === 'cache'));
    rt.dungeonScene.group.updateMatrixWorld(true);
    const b0 = boxes[0];
    const rray = new THREE.Raycaster();
    rray.set(new THREE.Vector3(b0.x, 20, b0.z), new THREE.Vector3(0, -1, 0));
    const rhit = rt.pick(rray);
    ck('and a ray onto one picks it, exactly as in a cavern',
      rhit && rhit.kind === 'chest' && rhit.chest.key === b0.key, rhit ? rhit.kind : 'nothing');
    ck('and the old generator can open a lid too', rt.dungeonScene.openChest(b0) === true);
    rt.leaveDungeon();
  }
  rt.onZone(null);
  rt.onDungeonState(null);
}

// ---------------------------------------------------------------------------
// 6. picking above ground
// ---------------------------------------------------------------------------
{
  // a ray straight down onto a tree the world actually streamed in
  let found = null;
  for (const f of treeFieldsFor()) {
    const t = f.trees.find((x) => !x.felledUntil);
    if (f.meshes.length && t) { found = t; break; }
  }
  if (found) {
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(found.x, found.gy + 40, found.z), new THREE.Vector3(0, -1, 0));
    const hit = rt.pick(ray);
    ck('a ray down onto a streamed tree picks that tree',
      hit && hit.kind === 'tree' && hit.tree && hit.tree.field.trees[hit.tree.index] != null,
      hit ? hit.kind : 'nothing');
  } else {
    ck('a ray down onto a streamed tree picks that tree', false, 'no tree was streamed to aim at');
  }
  // a ray onto the place itself picks the place. The renderer is what normally
  // refreshes matrixWorld, so stand in for it once here.
  sc.scene.updateMatrixWorld(true);
  {
    // walking back to the origin unloaded the marker, which is the ring doing
    // its job; walk out to the place again before asking what is under a ray
    for (let i = 0; i < 400 && rt.siteMarkers.count < 1; i++) {
      clock += 16;
      rt.update(0.016, clock, NEAR_SITE.x, NEAR_SITE.z, 1);
    }
    sc.scene.updateMatrixWorld(true);
    ck(`${NEAR_SITE.name} loads again when you walk back to it`, rt.siteMarkers.count >= 1);

    // merged markers keep their geometry at the group origin, so aim at where
    // each mesh actually is in the world, not at where its transform says
    const meshes = rt.siteMarkers.meshes();
    let hit = null, tried = 0;
    const box = new THREE.Box3(), c = new THREE.Vector3();
    for (const m of meshes) {
      if (hit) break;
      box.setFromObject(m);
      if (box.isEmpty()) continue;
      box.getCenter(c);
      tried++;
      const ray = new THREE.Raycaster();
      ray.set(new THREE.Vector3(c.x, box.max.y + 60, c.z), new THREE.Vector3(0, -1, 0));
      const p = rt.pick(ray);
      if (p && p.kind === 'site') hit = p;
    }
    ck(`a ray onto ${NEAR_SITE.name} picks the site`, !!hit && hit.site.id === NEAR_SITE.id,
      hit ? hit.site.name : `nothing over ${tried} of ${meshes.length} meshes`);
  }

  // a ray into empty sky picks nothing at all
  const sky = new THREE.Raycaster();
  sky.set(new THREE.Vector3(0, 500, 0), new THREE.Vector3(0, 1, 0));
  ck('a ray into the sky picks nothing', rt.pick(sky) === null);
}

// ---------------------------------------------------------------------------
// 7. dispose
// ---------------------------------------------------------------------------
{
  const site = { id: '3,-7', cx: 3, cz: -7, x: 1500, z: -3300, kind: 'dungeon', name: 'the Ash Cut', article: 'a', facing: 1 };
  rt.enterDungeon(site);
  const g = rt.dungeonScene.group;
  rt.dispose();
  ck('dispose underground tears the level down too', g.children.length === 0);
  ck('and empties the tree field registry', treeFieldsFor().length === 0);
}

console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
