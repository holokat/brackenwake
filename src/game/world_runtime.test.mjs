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
  // The Standing Hedge is a mile wide and pad-less, so its body reaches the
  // ring; nothing WITH A PAD may (the heart promise is about the ground)
  const inRing = rt.sitesNear(0, 0, 576);
  ck('and nothing with a pad inside the streamed ring of the spawn', inRing.every((s) => !(s.flatR > 0)), inRing.map((s) => `${s.kind} flatR ${s.flatR}`).join(', ') || 'nothing');
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
    // Wait for the PLACE, not for a marker. Two markers reach this spot and the
    // Standing Hedge is the wide one, so "count >= 1" was satisfied by a body
    // 837 m away while the one being walked to was still in the build queue.
    const builtNear = () => rt.siteMarkers.meshes().some((o) => o.userData.site && o.userData.site.id === NEAR_SITE.id);
    for (let i = 0; i < 400 && !builtNear(); i++) {
      clock += 16;
      rt.update(0.016, clock, NEAR_SITE.x, NEAR_SITE.z, 1);
    }
    sc.scene.updateMatrixWorld(true);
    ck(`${NEAR_SITE.name} loads again when you walk back to it`, builtNear(),
      `${rt.siteMarkers.count} markers live`);

    // Merged markers keep their geometry at the group origin, so aim at where
    // the body actually IS in the world and not at where its transform says.
    //
    // At its OWN VERTICES, and not at the centre of its bounding box. The
    // nearest place to the spawn used to be a village and a box centre stood
    // over its roofs; the nearest place is a dungeon mouth now, and the centre
    // of the box round an arch is the hole in the middle of the arch, so every
    // ray went straight through and the check read "nothing" over a marker that
    // was standing there in one piece. A vertex is on the body by definition.
    // And the claim is about EVERY marker mesh in the world, not about one of
    // them: a ray onto a body picks the place that body belongs to. The old
    // form asked only whether SOME mesh answered with the nearest place, and
    // two markers are loaded here (the Standing Hedge is a mile across and its
    // stones reach the ring from 837 m away), so the first mesh answered with
    // the hedge and the check went red over a Tanner Cut that was standing
    // there in one piece.
    // A MARKER POST IS NOT A SITE'S BODY. A hand laid space may carry markers,
    // which are dev-only posts built invisible and carrying no `userData.site`
    // at all, and the picker never sees them. The claim is about the meshes
    // that stand for a place, so those are the ones counted, and the count of
    // what was left out is said out loud rather than hidden in a `continue`.
    const meshes = rt.siteMarkers.meshes();
    const bodies = meshes.filter((m) => m.userData.site && m.geometry && m.geometry.getAttribute('position'));
    let proved = 0, wrong = '', aimed = 0;
    const names = new Set();
    const box = new THREE.Box3(), v = new THREE.Vector3();
    for (const m of bodies) {
      box.setFromObject(m);
      const pos = m.geometry && m.geometry.getAttribute('position');
      const own = m.userData.site;
      if (box.isEmpty() || !pos || !own) continue;
      let hit = null;
      const saw = new Set();
      // AN INSTANCED MESH IS NOT WHERE ITS VERTICES SAY IT IS. A plan's trees
      // and rocks are InstancedMeshes: `geometry.position` is the PROTOTYPE,
      // sitting about the origin, and every copy is placed by its own instance
      // matrix. Aiming at a prototype vertex through `matrixWorld` aims at
      // nothing, and measured on The Cellar Bank's willows it aimed 413.6 m
      // away from the nearest real tree. So an instanced mesh is aimed at
      // through its instance matrices, which is where the wood really stands.
      const im = new THREE.Matrix4();
      const points = [];
      if (m.isInstancedMesh) {
        const step = Math.max(1, Math.floor(m.count / 8));
        for (let k = 0; k < m.count; k += step) {
          m.getMatrixAt(k, im);
          points.push(new THREE.Vector3().setFromMatrixPosition(im).applyMatrix4(m.matrixWorld));
        }
      } else {
        // AT THE MIDDLE OF A TRIANGLE, AND NOT AT A VERTEX. "A vertex is on the
        // body by definition" is true and is not enough: a ray straight down
        // through a vertex passes along the body's own edge, and whether it
        // counts as a hit is a floating point coin toss. The Old Cellars' arch
        // came back "nothing" over thirty aims at its own vertices and is hit
        // every time at the middle of the same triangles. A centroid is inside
        // the face, which is what the claim is really about.
        const idx = m.geometry.getIndex();
        const tris = idx ? idx.count / 3 : pos.count / 3;
        const stride = Math.max(1, Math.floor(tris / 24));
        const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
        for (let t = 0; t < tris; t += stride) {
          const i0 = idx ? idx.getX(t * 3) : t * 3;
          const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
          const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); cc.fromBufferAttribute(pos, i2);
          points.push(a.add(b).add(cc).multiplyScalar(1 / 3).applyMatrix4(m.matrixWorld).clone());
        }
      }
      for (const at of points) {
        if (hit) break;
        v.copy(at);
        aimed++;
        const ray = new THREE.Raycaster();
        ray.set(new THREE.Vector3(v.x, box.max.y + 60, v.z), new THREE.Vector3(0, -1, 0));
        const p = rt.pick(ray);
        if (p && p.kind === 'site') hit = p; else saw.add(p ? p.kind : 'nothing');
      }
      if (hit && hit.site.id === own.id) { proved++; names.add(own.name); }
      else if (!wrong) {
        wrong = hit ? `${own.name} answered with ${hit.site.name}`
          : `${own.name} answered with ${[...saw].join(', ') || 'nothing'} over ${points.length} aims at ${m.name || '(unnamed)'}${m.isInstancedMesh ? ` (instanced, ${m.count})` : ` (${pos.count} verts)`}`;
      }
    }
    ck('a ray onto a streamed marker picks the place that marker belongs to',
      proved === bodies.length && proved > 0,
      wrong || `${proved} of ${bodies.length} bodies over ${aimed} aims, ${meshes.length - bodies.length} dev-only marker meshes left out: ${[...names].join(', ')}`);
  }

  // a ray into empty sky picks nothing at all
  const sky = new THREE.Raycaster();
  sky.set(new THREE.Vector3(0, 500, 0), new THREE.Vector3(0, 1, 0));
  ck('a ray into the sky picks nothing', rt.pick(sky) === null);
}

// ---------------------------------------------------------------------------
// 6b. the hand cut ground (ED2)
//
// The runtime carries a stroke list, lays it on the field, and can put a built
// chunk back up when the ground under it moves. Everything below is driven
// through the runtime's own surface, and the mesh is read out of the geometry
// the streamer actually built.
// ---------------------------------------------------------------------------
{
  const PX = NEAR_SITE.x, PZ = NEAR_SITE.z;
  const edits = rt.terrainEdits;
  ck('the runtime carries a stroke list, and it starts empty',
    !!edits && edits.count === 0 && rt.field.terrainEdits === edits);

  // ---- a rebuild with nothing changed leaks nothing -----------------------
  const disposed = new Set();
  const realDispose = THREE.BufferGeometry.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function patched() { disposed.add(this.uuid); return realDispose.call(this); };
  const census = () => {
    const geo = new Set();
    let nodes = 0;
    for (const g of [rt.world.group, rt.dressing.group, rt.wayside.group]) {
      if (!g) continue;
      g.traverse((o) => { nodes++; if (o.geometry) geo.add(o.geometry.uuid); });
    }
    return { geo, nodes, records: rt.flora.stats.records, chunks: rt.flora.stats.chunks, loaded: rt.world.stats.loaded };
  };
  const before = census();
  const nowhere = rt.rebuildAround(PX + 200000, PZ + 200000, 30);
  ck('a rebuild a long way from anything built rebuilds nothing', nowhere.chunks === 0, `${nowhere.chunks} chunks`);
  const did = rt.rebuildAround(PX, PZ, 10);
  const after = census();
  ck('a rebuild over one point puts back the chunks whose squares it touches',
    did.chunks >= 1 && did.chunks <= 4, `${did.chunks} chunks of the ${before.loaded} built`);
  ck('and the same number of chunks is loaded afterwards', after.loaded === before.loaded,
    `${before.loaded} to ${after.loaded}`);
  ck('the same number of nodes and geometries stand in the world groups',
    after.nodes === before.nodes && after.geo.size === before.geo.size,
    `${before.nodes} nodes / ${before.geo.size} geometries to ${after.nodes} / ${after.geo.size}`);
  ck('flora holds the same chunks and the same records',
    after.records === before.records && after.chunks === before.chunks,
    `${before.records} records in ${before.chunks} chunks to ${after.records} in ${after.chunks}`);
  const gone = [...before.geo].filter((u) => !after.geo.has(u));
  ck('and every geometry the rebuild replaced had dispose called on it',
    gone.length > 0 && gone.every((u) => disposed.has(u)), `${gone.length} replaced, ${gone.filter((u) => !disposed.has(u)).length} leaked`);
  THREE.BufferGeometry.prototype.dispose = realDispose;

  // ---- a stroke moves the mesh, not just the field ------------------------
  const meshAt = (x, z) => {
    const [cx, cz] = rt.field.chunkOf(x, z);
    return rt.world.group.children.find((m) => m.userData.chunk && m.userData.chunk[0] === cx && m.userData.chunk[1] === cz);
  };
  const nearestVert = (mesh, x, z) => {
    const pos = mesh.geometry.getAttribute('position');
    let best = -1, bestD = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i) - x, pos.getZ(i) - z);
      if (d < bestD) { bestD = d; best = i; }
    }
    return { i: best, x: pos.getX(best), y: pos.getY(best), z: pos.getZ(best), d: bestD };
  };
  const m0 = meshAt(PX, PZ);
  ck('there is a terrain mesh under the player to measure', !!m0);
  const v0 = nearestVert(m0, PX, PZ);
  const hBefore = rt.heightAt(v0.x, v0.z);
  // 1e-4 and not 1e-9: a position attribute is a Float32Array and the field
  // answers in doubles, so agreement here is agreement to a tenth of a millimetre
  ck('and its vertices carry the height the field gives', Math.abs(v0.y - hBefore) < 1e-4,
    `vertex ${v0.y.toFixed(3)} m, field ${hBefore.toFixed(3)} m, ${v0.d.toFixed(2)} m from the point`);
  edits.stroke({ kind: 'raise', x: PX, z: PZ, r: 24, amount: 4 });
  ck('the field knows about the stroke straight away',
    Math.abs(rt.heightAt(PX, PZ) - (hBefore + 4)) < 1.0, `${(rt.heightAt(PX, PZ) - hBefore).toFixed(3)} m of rise at the centre`);
  ck('but the mesh does not, until the world is told to put it back',
    nearestVert(meshAt(PX, PZ), PX, PZ).y === v0.y);
  const raised = rt.rebuildAround(PX, PZ, 24);
  const v1 = nearestVert(meshAt(PX, PZ), PX, PZ);
  ck('after rebuildAround the ground you stand on is the ground the stroke made',
    Math.abs(v1.y - rt.heightAt(v1.x, v1.z)) < 1e-4 && v1.y > v0.y + 1,
    `${v0.y.toFixed(3)} m to ${v1.y.toFixed(3)} m over ${raised.chunks} chunks`);
  // and a chunk the circle never touched still carries the old ground
  {
    // the built chunk furthest from the stroke, whichever that is: the ring is
    // only as wide as the frames this file has driven
    const live = rt.world.live().map(([cx, cz]) => [cx * 64 + 32, cz * 64 + 32])
      .sort((a, b) => Math.hypot(b[0] - PX, b[1] - PZ) - Math.hypot(a[0] - PX, a[1] - PZ));
    const far = live[0];
    const mf = meshAt(far[0], far[1]);
    const vf = mf ? nearestVert(mf, far[0], far[1]) : null;
    ck('the chunks the circle never touched still carry the ground they were built with',
      !!vf && Math.abs(vf.y - rt.heightAt(vf.x, vf.z)) < 1e-4,
      vf ? `${vf.y.toFixed(2)} m, ${Math.hypot(far[0] - PX, far[1] - PZ).toFixed(0)} m away` : 'no mesh out there');
  }
  edits.undo();
  rt.rebuildAround(PX, PZ, 24);
  ck('undo and one more rebuild puts the hillside back exactly',
    nearestVert(meshAt(PX, PZ), PX, PZ).y === v0.y);

  // ---- a cave stroke is a place you can walk into -------------------------
  {
    const CX = PX + 260, CZ = PZ + 140;
    ck('nothing stands at the point before the stroke',
      rt.sitesNear(CX, CZ, 40).length === 0, rt.sitesNear(CX, CZ, 40).map((s) => s.name).join(', '));
    edits.stroke({ kind: 'cave', x: CX, z: CZ, r: 10, amount: 2, name: 'the Hollow' });
    const near = rt.sitesNear(CX, CZ, 40);
    const cave = near.find((s) => s.edit);
    ck('a cave stroke stands a place up that sitesNear hands out',
      !!cave && cave.kind === 'cave' && cave.name === 'the Hollow', cave ? cave.id : 'nothing');
    rt.rebuildAround(CX, CZ, 40);
    // the marker is built one a frame, like every other place in the world
    let built = null;
    for (let i = 0; i < 400 && !built; i++) {
      clock += 16;
      rt.update(0.016, clock, CX, CZ, 1);
      built = rt.siteMarkers.meshes().find((o) => o.userData.site && o.userData.site.id === cave.id) || null;
    }
    ck('and the world builds a mouth for it, like any other cave', !!built,
      built ? `${rt.siteMarkers.count} markers live` : 'no marker was built');
    sc.scene.updateMatrixWorld(true);
    if (built) {
      const box = new THREE.Box3().setFromObject(built);
      const pos = built.geometry.getAttribute('position');
      const v = new THREE.Vector3().fromBufferAttribute(pos, 0).applyMatrix4(built.matrixWorld);
      const ray = new THREE.Raycaster();
      ray.set(new THREE.Vector3(v.x, box.max.y + 40, v.z), new THREE.Vector3(0, -1, 0));
      const hit = rt.pick(ray);
      ck('a ray onto that mouth picks the cave, which is what E asks',
        hit && hit.kind === 'site' && hit.site.id === cave.id, hit ? `${hit.kind} ${hit.site?.name}` : 'nothing');
    }
    const d = rt.enterDungeon(cave);
    ck('and going in builds a cavern, sized by the stroke',
      !!d && rt.inDungeon && rt.dungeonLayout().gen === 'cavern' && rt.dungeonTop === 2,
      d ? `${rt.dungeonLayout().rooms.length} chambers, level ${rt.dungeonLevel} of ${rt.dungeonTop}` : 'it would not open');
    ck('the floor under you down there is the level and not the hillside',
      Math.abs(rt.heightAt(0, 0)) < 40 && rt.inDungeon);
    const down = rt.dungeonGo('down');
    ck('a medium cave has a second level under it', !!down && down.level === 2, down ? `level ${down.level}` : 'no stair');
    rt.leaveDungeon();
    ck('and you come back out into the daylight world', rt.inDungeon === false);
    // the sizes are not all the same cave with a different word on it
    const { EDIT_CAVE_SPEC } = await import('./world_runtime.js');
    ck('small, medium and large are three different depths',
      EDIT_CAVE_SPEC.small.levels === 1 && EDIT_CAVE_SPEC.medium.levels === 2 && EDIT_CAVE_SPEC.large.levels === 3,
      Object.entries(EDIT_CAVE_SPEC).map(([k, v]) => `${k} ${v.levels}`).join(', '));
    edits.undo();
    ck('undoing the stroke takes the place away again', rt.sitesNear(CX, CZ, 40).length === 0);
  }

  // ---- the file the editor writes, loaded at boot -------------------------
  {
    const file = {
      v: 1,
      strokes: [
        { kind: 'raise', x: PX, z: PZ, r: 20, amount: 3, id: 1 },
        { kind: 'ground', x: PX, z: PZ, r: 8, word: 'dirt', id: 2 },
      ],
    };
    const realFetch = globalThis.fetch;
    let asked = null;
    globalThis.fetch = async (url) => { asked = url; return { ok: true, json: async () => file }; };
    let said = null;
    rt.onTerrain((info) => { said = info; });
    const h0 = rt.heightAt(PX, PZ);
    const info = await rt.loadTerrainFile('/terrain/greenwold.json');
    ck('the boot load asks for the file the editor writes', asked === '/terrain/greenwold.json', String(asked));
    ck('and applies every stroke in it', !!info && info.strokes === 2 && rt.terrainEdits.count === 2,
      info ? `${info.strokes} strokes` : 'nothing was applied');
    ck('the ground moved by what the file said', Math.abs(rt.heightAt(PX, PZ) - (h0 + 3)) < 1e-9,
      `${(rt.heightAt(PX, PZ) - h0).toFixed(3)} m`);
    ck('the paint in it is on the sample too', rt.field.sampleAt(PX, PZ).ground === 'dirt');
    ck('everything already built was built again', info.chunks === rt.world.stats.loaded && info.chunks > 0,
      `${info.chunks} chunks of ${rt.world.stats.loaded}`);
    ck('and it said so, with numbers, through onTerrain', !!said && said.strokes === 2, said ? JSON.stringify(said) : 'it said nothing');
    {
      const v = nearestVert(meshAt(PX, PZ), PX, PZ);
      ck('the mesh under the player carries the loaded ground',
        Math.abs(v.y - rt.heightAt(v.x, v.z)) < 1e-4 && v.y > h0,
        `${v.y.toFixed(3)} m against the field's ${rt.heightAt(v.x, v.z).toFixed(3)} m`);
    }

    // a file that is not there is not a fault
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    ck('a missing file is null and changes nothing',
      (await rt.loadTerrainFile('/terrain/nothing.json')) === null && rt.terrainEdits.count === 2);
    globalThis.fetch = async () => { throw new Error('no server'); };
    ck('and no server at all is null too, not a throw',
      (await rt.loadTerrainFile('/terrain/greenwold.json')) === null);
    if (realFetch) globalThis.fetch = realFetch; else delete globalThis.fetch;

    // put the world back the way the rest of this file expects to find it
    rt.terrainEdits.clear();
    rt.rebuildAll();
    ck('clearing the list gives the seed its world back',
      rt.heightAt(PX, PZ) === h0 && rt.field.sampleAt(PX, PZ).ground === null,
      `${rt.heightAt(PX, PZ).toFixed(3)} m against ${h0.toFixed(3)} m`);
  }
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

// ---------------------------------------------------------------------------
// 8. SCULPT MODE AT BOOT (ED3)
//
// A runtime of its own, with its own scene, so nothing above this line can be
// touched by it and so this is the real boot path and not a poke at the field.
// The file the server ships is `{ "mode": "sculpt", "base": {...},
// "strokes": [] }`, and the whole claim is that a world booted on it comes up
// blank: flat ground, no trees, no boulders, no dressing, nothing the seed
// rolled, and the authored places still standing on it.
// ---------------------------------------------------------------------------
{
  const sc2 = standScene();
  const rt2 = createWorldRuntime(sc2, { homeBiome: 'meadow', terrainFile: false });
  const blank = { v: 1, mode: 'sculpt', base: { height: 6, ground: 'grass', snowLine: 180, beachLine: 1 }, strokes: [] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => blank });
  let said = null;
  rt2.onTerrain((info) => { said = info; });

  // what it looked like before the file landed, so the change is measured
  const wasSculpt = rt2.field.sculpt;
  const info = await rt2.loadTerrainFile('/terrain/greenwold.json');
  if (realFetch) globalThis.fetch = realFetch; else delete globalThis.fetch;

  ck('a file with a header and NO strokes is applied, where before ED3 it was walked away from',
    !!info && info.strokes === 0 && info.mode === 'sculpt' && wasSculpt === null,
    info ? `${info.strokes} strokes, mode ${info.mode}, base ${JSON.stringify(info.base)}` : 'nothing was applied');
  ck('and it said so, with the numbers, through onTerrain',
    !!said && said.chunks === rt2.world.stats.loaded && said.chunks > 0,
    said ? `${said.chunks} chunks of ${rt2.world.stats.loaded} rebuilt` : 'it said nothing');
  ck('the field is a sculpt field now', !!rt2.field.sculpt && rt2.field.sculpt.height === 6, JSON.stringify(rt2.field.sculpt));

  // the ground the streamer actually meshed, read off the meshes and not off
  // the field, because a mesh built before the file landed and never rebuilt is
  // exactly the bug this is here to catch
  //
  // THE GRID VERTICES ONLY. A chunk is n by n of ground plus 4n of skirt hung
  // SKIRT metres below its own rim to hide a seam between two resolutions
  // (chunks.js), and total = n^2 + 4n, so n is exactly sqrt(total + 4) - 2 and
  // the skirt is everything past n^2. Counting it would report 396 vertices
  // "off the field" by exactly 4.0000 m, which is the skirt doing its job.
  const gridVerts = (pos) => { const n = Math.round(Math.sqrt(pos.count + 4)) - 2; return n * n; };
  const meshOff = () => {
    let verts = 0, off = 0, worst = 0;
    for (const g of rt2.world.group.children) {
      const pos = g.geometry && g.geometry.getAttribute && g.geometry.getAttribute('position');
      if (!pos) continue;
      const grid = gridVerts(pos);
      for (let i = 0; i < grid; i++) {
        const x = pos.getX(i) + g.position.x, y = pos.getY(i) + g.position.y, z = pos.getZ(i) + g.position.z;
        verts++;
        const d = Math.abs(y - rt2.field.heightAt(x, z));
        if (d > 1e-3) { off++; worst = Math.max(worst, d); }
      }
    }
    return { verts, off, worst };
  };
  {
    const m = meshOff();
    ck('every vertex of every built chunk carries the sculpt world and not the one it was built with',
      m.verts > 0 && m.off === 0, `${m.verts} ground vertices, ${m.off} off the field, worst ${m.worst.toFixed(4)} m`);
  }

  // nothing grew, nothing was scattered, nothing was rolled
  {
    ck('no trees and no boulders stand in it, over every chunk the ring has built',
      rt2.flora.stats.records === 0 && rt2.flora.stats.chunks > 0,
      `flora holds ${rt2.flora.stats.records} records over ${rt2.flora.stats.chunks} chunks`);
    ck('and nothing is dressed in it',
      rt2.dressing.stats.records === 0 && rt2.dressing.stats.chunks > 0,
      `dressing holds ${rt2.dressing.stats.records} records over ${rt2.dressing.stats.chunks} chunks`);
  }
  {
    const near = rt2.sitesNear(0, 0, 3000);
    const rolledNear = near.filter((s) => !s.authored && !s.edit);
    ck('nothing the seed rolled for itself stands anywhere near the spawn',
      rolledNear.length === 0, `${near.length} places within 3 km, ${rolledNear.length} of them rolled`);
  }

  // 8a. setBase moves the whole world and says what it cost
  {
    const before = rt2.heightAt(400, 400);
    const did = rt2.setBase({ height: 22 });
    ck('setBase moves the base height under everything and rebuilds every loaded chunk',
      rt2.heightAt(400, 400) === 22 && before === 6 && did.chunks === rt2.world.stats.loaded && did.chunks > 0,
      `${before} m to ${rt2.heightAt(400, 400)} m, ${did.chunks} chunks of ${rt2.world.stats.loaded} rebuilt, changed: ${did.changed.join('; ')}`);
    const m = meshOff();
    ck('and the meshes came with it', m.off === 0, `${m.off} of ${m.verts} ground vertices left behind`);
    rt2.setBase({ height: 6 });
  }

  // 8b. what a 600 m mountain costs to put back up, in node, with no GPU
  //
  // The ring is FILLED first. The streamer builds three chunks a frame, so a
  // runtime that has never been updated holds the three the constructor's own
  // first `world.update` got round to, and a rebuild measured against three
  // chunks would be a measurement of nothing.
  {
    const edits = rt2.terrainEdits;
    let clk = 0;
    for (let i = 0; i < 60; i++) rt2.update(0.016, clk += 16, 0, 0, 1);
    const s = edits.stroke({ kind: 'mountain', x: 0, z: 0, r: 600, amount: 300, roughness: 0.6 });
    const t0 = performance.now();
    const did = rt2.rebuildAround(s.x, s.z, 608);
    const ms = performance.now() - t0;
    ck('a 600 m mountain puts every chunk it touches back up, and this is what that costs',
      did.chunks > 0 && ms < 4000,
      `${did.chunks} of the ${rt2.world.stats.loaded} loaded chunks rebuilt in ${ms.toFixed(0)} ms in node, ${(ms / did.chunks).toFixed(1)} ms a chunk`);
    ck('and the mountain is in the mesh, not only in the field',
      (() => { let top = -Infinity;
        for (const g of rt2.world.group.children) {
          const pos = g.geometry && g.geometry.getAttribute && g.geometry.getAttribute('position');
          if (!pos) continue;
          for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i) + g.position.y);
        }
        return top > 100; })(),
      `the highest vertex in the streamed world stands well above the 6 m base`);
    // and one undo takes it away again
    rt2.terrainEdits.undo();
    rt2.rebuildAround(s.x, s.z, 608);
    ck('and one undo takes it off again', rt2.heightAt(0, 0) === 6, `${rt2.heightAt(0, 0)} m`);
  }

  // 8c. reset, as one step
  {
    const edits = rt2.terrainEdits;
    for (let i = 0; i < 12; i++) edits.stroke({ kind: 'raise', x: i * 30 - 180, z: 40, r: 20, amount: 4 });
    const raised = rt2.heightAt(0, 40);
    const did = edits.reset();
    rt2.rebuildAll();
    ck('reset drops every stroke and counts what it dropped',
      did.dropped === 12 && rt2.heightAt(0, 40) === 6, `${did.dropped} dropped, ground back to ${rt2.heightAt(0, 40)} m`);
    const u = edits.undo();
    rt2.rebuildAll();
    ck('and one undo puts all twelve back on the ground',
      u.kind === 'reset' && u.restored === 12 && rt2.heightAt(0, 40) === raised,
      `${u.restored} restored, ${rt2.heightAt(0, 40).toFixed(3)} m against the ${raised.toFixed(3)} m it was`);
    edits.reset();
    rt2.rebuildAll();
  }

  // 8d. ED4: the seam the water hangs on, and what one lake really touches
  //
  // `src/game/app/systems/world.js` is the one caller of `onRebuild`, and what
  // it hangs there is `syncWater`. That WIRING is checked by name in
  // wiring.test.mjs; what is checked here is the seam itself, because a hook
  // that never fires is a lake that never appears however right the renderer
  // is. What the renderer then does with the list is driven in water.test.mjs.
  {
    const { createWater } = await import('../world/water.js');
    const { reachOf } = await import('../world/terrain_edits.js');
    const fired = [];
    rt2.onRebuild((what) => fired.push(what));

    let clk = 0;
    for (let i = 0; i < 60; i++) rt2.update(0.016, clk += 16, 0, 0, 1);
    const loaded = rt2.world.stats.loaded;

    const edits = rt2.terrainEdits;
    const lake = edits.stroke({ kind: 'lake', x: 400, z: 0, r: 24, level: 6, depth: 4 });
    const did = rt2.rebuildAround(lake.x, lake.z, reachOf(lake) + 8);
    ck('a rebuild fires onRebuild once, with the numbers it counted',
      fired.length === 1 && fired[0].chunks === did.chunks && fired[0].all === false && fired[0].x === 400,
      fired.length ? JSON.stringify(fired[0]) : 'it did not fire');
    // A 24 m lake with an 8 m margin is a 64 m circle: at CHUNK 64 that is a
    // handful of chunks, and it has to be far fewer than the ring holds or the
    // claim that a lake puts back its own ground and nobody else's is empty.
    ck('and one lake puts back only the chunks it stands on, not the ring',
      did.chunks > 0 && did.chunks <= 6 && did.chunks < loaded / 4,
      `${did.chunks} chunks of the ${loaded} loaded`);

    ck('the ground under it is the bed, and the field says there is water on it',
      Math.abs(rt2.heightAt(400, 0) - 2) < 1e-9 && rt2.field.sampleAt(400, 0).water
      && rt2.field.sampleAt(400, 0).waterLevel === 6,
      `bed ${rt2.heightAt(400, 0).toFixed(2)} m, surface ${rt2.field.sampleAt(400, 0).waterLevel} m`);

    // the same list, through the same two calls the system makes, into a real water
    const water = createWater(sc2, rt2.field);
    const sculpt = rt2.field.sculpt;
    water.setGlobalPlane(!sculpt || !!sculpt.sea);
    const built = water.setBodies(edits.waterBodies());
    ck('and a sculpt world takes the endless sheet away and draws the one lake instead',
      water.globalPlane === false && built.built === 1 && water.bodyCount === 1
      && water.bodyMesh(lake.id).material.uniforms.uSeaY.value === 6,
      `${built.built} surfaces at ${water.bodyMesh(lake.id).material.uniforms.uSeaY.value} m, sheet ${water.globalPlane ? 'on' : 'off'}`);

    // a valley 20 m deep beside it, and no water anywhere in it
    const v = edits.stroke({ kind: 'valley', x: 1200, z: 0, r: 40, amount: 20, length: 200, yaw: 0 });
    rt2.rebuildAround(v.x, v.z, reachOf(v) + 8);
    let wet = 0, deepest = 99, n = 0;
    for (let z = -40; z <= 240; z += 8) for (let x = 1160; x <= 1240; x += 8) {
      const p = rt2.field.sampleAt(x, z); n++;
      deepest = Math.min(deepest, p.h);
      if (p.water) wet++;
    }
    ck('a valley beside it goes 20 m under and stays dry ground, which is the whole of ED4',
      wet === 0 && deepest < -10, `deepest ${deepest.toFixed(2)} m, ${wet} of ${n} samples wet`);
    ck('and no surface was drawn for it either',
      water.setBodies(edits.waterBodies()).bodies === 1, `${water.bodyCount} surfaces`);

    edits.undo();                                    // the valley
    edits.undo();                                    // the lake
    rt2.rebuildAll();
    ck('an undo of the lake takes its surface out of the scene as well as its bed',
      water.setBodies(edits.waterBodies()).dropped === 1 && water.bodyCount === 0
      && rt2.heightAt(400, 0) === 6 && !rt2.field.sampleAt(400, 0).water,
      `${water.bodyCount} surfaces, ground back to ${rt2.heightAt(400, 0)} m`);
    ck('and the hook fired once for each of the three rebuilds and not once more',
      fired.length === 3 && fired.filter((f) => f.all).length === 1 && fired[2].all === true,
      `${fired.length} rebuilds: ${fired.map((f) => (f.all ? 'the whole ring' : `${f.chunks} chunks at ${f.x}, ${f.z}`)).join('; ')}`);
    water.dispose();
    rt2.onRebuild(null);
  }

  // 8e. ED4: what a stroke SAYS, which is the half a player actually meets
  //
  // A silent real effect is indistinguishable from a broken button, and both
  // halves of ED4 have one: a sea laid on high ground is a real stroke that
  // makes no water, and a valley cut to -14 m is a real hole that no longer
  // fills. Both owe words. The two are pure functions so they can be measured
  // here rather than asserted; `strokeWords` is the sentence they hang off.
  {
    const { strokeWords, dryFloorWords, placedWaterWords, OLD_WATER_LINE } = await import('./app/systems/world.js');
    const dry = { sea: false }, coast = { sea: true };
    // 13.2 and not 14: the line the world flooded at was `SEA_LEVEL - 0.05`,
    // which is -0.85 m, so a floor at -14 stands 13.15 m under it. The words
    // quote the real line rather than rounding to a friendlier zero.
    ck('a valley cut under the old water line says so, and says water is its own brush',
      /13\.2 m under the old sea level/.test(dryFloorWords('valley', -14, dry))
      && /water is its own brush/.test(dryFloorWords('valley', -14, dry)),
      dryFloorWords('valley', -14, dry).trim());
    ck('and the number it quotes is the line the field really used',
      dryFloorWords('valley', OLD_WATER_LINE - 1, dry).includes('1.0 m under')
      && dryFloorWords('valley', OLD_WATER_LINE + 0.01, dry) === '',
      `the old line is ${OLD_WATER_LINE} m`);
    ck('driven the other way: a valley in a generated world, and in a sculpt world with the sea back, says nothing',
      dryFloorWords('valley', -14, null) === '' && dryFloorWords('valley', -14, coast) === '',
      'both empty, because both of those really do flood');
    ck('and no other brush says it', ['raise', 'mountain', 'flatten', 'lake'].every((k) => dryFloorWords(k, -14, dry) === ''));

    ck('a lake that made water says how deep it is',
      placedWaterWords({ kind: 'lake', level: 6 }, { water: true, h: 2, waterLevel: 6 }) === ', and the water there stands 4.0 m deep');
    ck('and a sea laid on ground above its own surface says NO water stands there, with both numbers',
      /no water stands at that point: the ground there is 6\.0 m and the surface you asked for is 0\.0 m/
        .test(placedWaterWords({ kind: 'sea', level: 0 }, { water: false, h: 6, waterLevel: null })),
      placedWaterWords({ kind: 'sea', level: 0 }, { water: false, h: 6, waterLevel: null }).trim());
    ck('and a drain says whether the water really went',
      placedWaterWords({ kind: 'drain' }, { water: false }) === ', and there is no water there now'
      && /still water at that point/.test(placedWaterWords({ kind: 'drain' }, { water: true })));

    const said = (s) => strokeWords(s, 4, '');
    ck('every water brush names itself, where it is, and the level it put the surface at',
      said({ kind: 'lake', x: 0, z: 0, r: 24, level: 6, depth: 4 }).includes('its surface at 6.0 m and its bed at 2.0 m')
      && said({ kind: 'pond', x: 0, z: 0, r: 8, level: 6, depth: 2 }).startsWith('sank a pond 16 m across')
      && said({ kind: 'sea', x: 0, z: 0, r: 400, level: 3 }).includes('cutting no bed')
      && said({ kind: 'drain', x: 0, z: 0, r: 24 }).includes('moved no ground'),
      said({ kind: 'lake', x: 0, z: 0, r: 24, level: 6, depth: 4 }));
    ck('and a river says which way its water runs, in metres, both ends',
      said({ kind: 'river', x: 0, z: 0, x2: 0, z2: 200, width: 12, level: 6, levelEnd: 2, depth: 2, r: 8 })
        .includes('falling from 6.0 m to 2.0 m'),
      said({ kind: 'river', x: 0, z: 0, x2: 0, z2: 200, width: 12, level: 6, levelEnd: 2, depth: 2, r: 8 }));
    ck('and a river drawn uphill says THAT, rather than letting somebody find out later',
      said({ kind: 'river', x: 0, z: 0, x2: 0, z2: 200, width: 12, level: 2, levelEnd: 6, depth: 2, r: 8 })
        .includes('which is uphill: swap the ends or drop the far level'),
      said({ kind: 'river', x: 0, z: 0, x2: 0, z2: 200, width: 12, level: 2, levelEnd: 6, depth: 2, r: 8 }));
    ck('and a chained river says where it took its level from',
      said({ kind: 'river', x: 0, z: 0, x2: 0, z2: 200, width: 12, level: 6, levelEnd: 2, depth: 2, r: 8, chained: 3 })
        .includes('running on from the river before it'));
    // The character itself is built rather than typed, so a sweep of the repo
    // for em dashes does not trip over the guard that forbids them.
    const EM_DASH = String.fromCharCode(0x2014);
    ck('and none of them uses an em dash, which this project does not write',
      ['lake', 'pond', 'sea', 'drain', 'river'].every((k) => !said({
        kind: k, x: 0, z: 0, r: 24, level: 6, depth: 4, width: 12, levelEnd: 2, x2: 0, z2: 200,
      }).includes(EM_DASH)));
  }

  rt2.dispose();
}

console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
