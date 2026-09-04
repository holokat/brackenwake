// Going down and coming back up, driven through the real farm.js methods.
// Run: node src/world/dungeon_farm.test.mjs
//
// The scene, camera and controls are stand-ins, but enterDungeon, dungeonGo,
// leaveDungeon and _updateDungeon are the code the game runs. The claim under
// test is the hard one: that leaving restores the overworld EXACTLY, down to
// the fog object and the camera's coordinates, so the streamed world carries
// on from where you left it.
//
// farm.js is a browser module. It loads in node given these globals; if it ever
// stops loading, that is a real thing to know and this suite says so rather
// than quietly skipping.
globalThis.performance ||= { now: () => Date.now() };
globalThis.requestAnimationFrame ||= (fn) => setTimeout(() => fn(performance.now()), 16);
globalThis.document ||= { createElement: () => ({ style: {}, getContext: () => null, addEventListener() {} }), addEventListener() {}, body: { appendChild() {} } };
globalThis.window ||= { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.navigator ||= { userAgent: 'node' };

// three warns when it is imported down two paths at once; in the bundle it is
// one instance, and the warning is only noise in this harness
const warn = console.warn; console.warn = () => {};
const THREE = await import('three');
const farmMod = await import('../farm/farm.js');
const { maxLevel, walkable, gridOf } = await import('./dungeon_gen.js');
console.warn = warn;
const H = farmMod.Homestead || farmMod.default;
if (!H) { console.log('exports:', Object.keys(farmMod)); throw new Error('no Homestead export'); }

function stand() {
  const f = Object.create(H.prototype);
  f.scene = new THREE.Scene();
  f.scene.fog = new THREE.Fog(0x99ccee, 280, 700);
  f.scene.background = new THREE.Color(0x9fd4f2);
  f.camera = new THREE.PerspectiveCamera(50, 1.3, 0.1, 1800);
  f.camera.position.set(120, 40, 90);
  f.controls = { target: new THREE.Vector3(100, 12, 80), minDistance: 20, maxDistance: 260, maxPolarAngle: Math.PI / 2.3, autoRotate: true, update() { this.updated = (this.updated || 0) + 1; } };
  f.renderer = { domElement: { style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } };
  f.raycaster = new THREE.Raycaster();
  f.pointer = new THREE.Vector2();
  f.onPlotHover = () => {}; f.onObjectHover = () => {};
  // stand-ins for the overworld: three top level groups the farm would own
  f.fakeWorld = [];
  for (const name of ['world-stream', 'world-flora', 'site:3,-7', 'farm-island']) {
    const g = new THREE.Group(); g.name = name; f.scene.add(g); f.fakeWorld.push(g);
  }
  const alreadyOff = new THREE.Group(); alreadyOff.name = 'off-before'; alreadyOff.visible = false;
  f.scene.add(alreadyOff); f.alreadyOff = alreadyOff;
  f.scene.add(f.camera);
  f.states = [];
  f.onDungeonState = (st) => f.states.push(st);
  return f;
}

let bad = 0, pass = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : bad++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

for (const kind of ['dungeon', 'cave']) {
  const f = stand();
  const site = { id: '3,-7', cx: 3, cz: -7, kind, name: kind === 'cave' ? "Ash's Delve" : 'the Ash Cut', article: 'a', facing: 1 };
  const before = {
    cam: f.camera.position.clone(), tgt: f.controls.target.clone(),
    fog: f.scene.fog, bg: f.scene.background, minD: f.controls.minDistance, maxD: f.controls.maxDistance, polar: f.controls.maxPolarAngle, auto: f.controls.autoRotate,
  };
  f.enterDungeon(site);
  ck(`${kind}: inside after enterDungeon`, !!f.dungeon && f.dungeon.level === 1);
  ck(`${kind}: every overworld group is hidden`, f.fakeWorld.every((g) => !g.visible));
  ck(`${kind}: the camera is not hidden`, f.camera.visible);
  ck(`${kind}: the level group is the only visible child`, f.scene.children.filter((c) => c.visible && c !== f.camera).length === 1);
  ck(`${kind}: fog and background went dark`, f.scene.fog !== before.fog && f.scene.background.getHex() < 0x101010, `bg #${f.scene.background.getHexString()} fog ${f.scene.fog.near}-${f.scene.fog.far}`);
  ck(`${kind}: the target stands on the entrance`, Math.abs(f.controls.target.y - 1) < 1e-9 && f.controls.target.distanceTo(f.dungeon.scene.entrancePos) < 3, `${f.controls.target.toArray().map((v) => v.toFixed(1))}`);
  ck(`${kind}: entering fired one state, inside`, f.states.length === 1 && f.states[0].inside === true && f.states[0].level === 1);
  ck(`${kind}: the view is pulled in and tilted to clear a 3.2 m wall`, f.controls.minDistance === 6 && f.controls.maxDistance === 46 && f.controls.maxPolarAngle === 0.9 && f.controls.autoRotate === false);

  // walk into the rock from the entrance and watch the clamp hold the line
  let offFloor = 0, steps = 0, movedWith = 0;
  for (let a = 0; a < 6.28; a += 0.4) {
    f.controls.target.copy(f.dungeon.scene.entrancePos); f.controls.target.y = 1;
    f.camera.position.set(f.controls.target.x + 9, 14, f.controls.target.z + 9);
    for (let i = 0; i < 60; i++) {
      const cam0 = f.camera.position.clone(), t0 = f.controls.target.clone();
      f.controls.target.x += Math.cos(a) * 1.4; f.controls.target.z += Math.sin(a) * 1.4;
      f.camera.position.x += Math.cos(a) * 1.4; f.camera.position.z += Math.sin(a) * 1.4;
      f._updateDungeon(1000 + i * 16, 0.016);
      steps++;
      const g = gridOf(f.dungeon.layout, f.controls.target.x, f.controls.target.z);
      if (!walkable(f.dungeon.layout, g.gx, g.gz)) offFloor++;
      // the camera keeps its offset from the target through a clamp
      const d0 = new THREE.Vector2(cam0.x - t0.x, cam0.z - t0.z);
      const d1 = new THREE.Vector2(f.camera.position.x - f.controls.target.x, f.camera.position.z - f.controls.target.z);
      if (d0.distanceTo(d1) < 1e-6) movedWith++;
    }
  }
  ck(`${kind}: ${steps} steps into walls, never off the floor`, offFloor === 0, `${offFloor} off`);
  ck(`${kind}: the camera keeps its offset through every clamp`, movedWith === steps, `${movedWith}/${steps}`);
  ck(`${kind}: the target is pinned to eye height`, f.controls.target.y === 1);

  // the sweep hides anything that shows up while you are down there
  const latecomer = new THREE.Group(); latecomer.name = 'rain'; f.scene.add(latecomer);
  f._updateDungeon(9e6, 0.016);
  ck(`${kind}: a group added underground is hidden by the sweep`, !latecomer.visible);

  // deeper
  const top = maxLevel(kind);
  if (top > 1) {
    const l1 = f.dungeon.layout;
    const r = f.dungeonGo('down');
    ck(`${kind}: down goes to level 2`, r && f.dungeon.level === 2 && f.states.at(-1).level === 2 && f.states.at(-1).inside);
    ck(`${kind}: level 2 is a different layout`, JSON.stringify(f.dungeon.layout.cells) !== JSON.stringify(l1.cells));
    ck(`${kind}: still only one visible child`, f.scene.children.filter((c) => c.visible && c !== f.camera).length === 1);
    f.dungeonGo('down');
    ck(`${kind}: down again reaches the bottom`, f.dungeon.level === 3 && f.states.at(-1).bottom === true);
    ck(`${kind}: the bottom has no stair`, f.dungeon.layout.stair === null && f.dungeon.scene.stairPos === null);
    ck(`${kind}: down at the bottom does nothing`, f.dungeonGo('down') === null && f.dungeon.level === 3);
    f.dungeonGo('up');
    ck(`${kind}: up returns to level 2, at the stair`, f.dungeon.level === 2 && f.states.at(-1).arrivedAt === 'stair'
      && f.controls.target.distanceTo(f.dungeon.scene.stairPos) < 3);
    // the same level twice is the same level
    const cells = JSON.stringify(f.dungeon.layout.cells);
    f.dungeonGo('up'); f.dungeonGo('down');
    ck(`${kind}: level 2 rebuilt is byte for byte the level you left`, JSON.stringify(f.dungeon.layout.cells) === cells);
    f.dungeonGo('up');
  } else {
    ck(`${kind}: a cave is one level and down does nothing`, f.dungeonGo('down') === null && f.dungeon.level === 1);
  }

  // out
  const disposed = f.dungeon.scene.group;
  f.dungeonGo('up');
  ck(`${kind}: up from level 1 leaves`, f.dungeon == null);
  ck(`${kind}: the level group is out of the scene`, !f.scene.children.includes(disposed) && disposed.children.length === 0);
  ck(`${kind}: leaving fired inside:false last`, f.states.at(-1).inside === false);
  ck(`${kind}: camera restored exactly`, f.camera.position.equals(before.cam), `${f.camera.position.toArray()}`);
  ck(`${kind}: target restored exactly`, f.controls.target.equals(before.tgt));
  ck(`${kind}: fog object restored`, f.scene.fog === before.fog);
  ck(`${kind}: background restored`, f.scene.background === before.bg);
  ck(`${kind}: orbit limits restored`, f.controls.minDistance === before.minD && f.controls.maxDistance === before.maxD && f.controls.maxPolarAngle === before.polar && f.controls.autoRotate === before.auto);
  ck(`${kind}: every overworld group is visible again`, f.fakeWorld.every((g) => g.visible));
  ck(`${kind}: what was already hidden stayed hidden`, f.alreadyOff.visible === false);
  ck(`${kind}: the latecomer came back too`, latecomer.visible === true);
  ck(`${kind}: leaveDungeon twice is harmless`, f.leaveDungeon() === false);
  // and again, from scratch
  f.enterDungeon(site); f.leaveDungeon();
  ck(`${kind}: a second visit restores just as exactly`, f.camera.position.equals(before.cam) && f.scene.fog === before.fog && f.fakeWorld.every((g) => g.visible));
}
// a farm disposed underground must not leak
{
  const f = stand();
  f.enterDungeon({ id: '1,1', cx: 1, cz: 1, kind: 'dungeon', name: 'x' });
  const g = f.dungeon.scene.group;
  f.dead = false;
  f.world = null; f.siteMarkers = null; f.flora = null;
  f.renderer.dispose = () => {}; f.renderer.domElement.remove = () => {};
  f._onResize = f._onKeyDown = f._onKeyUp = () => {};
  f.dispose();
  ck('dispose underground tears the level down', f.dungeon === null && g.children.length === 0);
}
console.log(`\n${pass} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
