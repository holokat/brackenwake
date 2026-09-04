// The level as geometry: what a player would actually meet down there.
// Run: node src/world/dungeon.test.mjs
//
// three runs in node as long as the handful of browser globals tree_edit.js
// reaches for exist. Nothing here draws; it builds the same scene graph the
// game builds and then asks it questions.
globalThis.performance ||= { now: () => Date.now() };
globalThis.requestAnimationFrame ||= (fn) => setTimeout(() => fn(performance.now()), 16);
globalThis.window ||= { addEventListener() {} };
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

const THREE = await import('three');
const { generateDungeon, maxLevel, worldOf, walkable } = await import('./dungeon_gen.js');
const { createDungeonScene, LIGHT_BUDGET, TORCH_POOL, WALL_H } = await import('./dungeon.js');
const { treeFieldsFor } = await import('../farm/tree_edit.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const seed = 20260904;

const built = [];
for (const kind of ['dungeon', 'cave']) {
  for (let i = 0; i < 6; i++) {
    const site = { id: `${i},${kind}`, cx: i * 5 - 12, cz: 3 - i * 4, kind, name: `site ${i}` };
    for (let l = 1; l <= maxLevel(kind); l++) {
      const layout = generateDungeon(seed, site, l);
      built.push({ layout, scene: createDungeonScene(THREE, layout, {}) });
    }
  }
}
check('built a scene for every level', built.length === 6 * 3 + 6 * 1, `${built.length} scenes`);

// ---- the light budget ----------------------------------------------------
{
  let over = 0, most = 0, dark = 0;
  for (const { scene } of built) {
    let n = 0;
    scene.group.traverse((o) => { if (o.isPointLight) n++; });
    most = Math.max(most, n);
    if (n > LIGHT_BUDGET) over++;
    if (n < 3) dark++;
    if (n !== scene.lightCount) over++;
  }
  check(`no level lights more than ${LIGHT_BUDGET} point lights`, over === 0, `most ${most}`);
  check('and no level is lit by fewer than three', dark === 0);
  check('the roaming pool is smaller than the budget', TORCH_POOL < LIGHT_BUDGET, `${TORCH_POOL} roaming + entrance + stair`);
}

// ---- torches: walking the level lights every one of them -----------------
{
  let missed = 0, torches = 0, lit = 0;
  for (const { scene } of built) {
    const seen = new Set();
    for (const t of scene.torches) {
      scene.update({ x: t.x, z: t.z });
      let n = 0;
      scene.group.traverse((o) => { if (o.isPointLight && o.visible) { n++; seen.add(`${o.position.x.toFixed(2)},${o.position.z.toFixed(2)}`); } });
      lit = Math.max(lit, n);
    }
    torches += scene.torches.length;
    for (const t of scene.torches) if (!seen.has(`${t.x.toFixed(2)},${t.z.toFixed(2)}`)) missed++;
  }
  check('standing at each torch in turn lights every torch', torches > 0 && missed === 0, `${torches} torches, ${missed} never lit`);
  check('and never more lights burn at once than the budget', lit <= LIGHT_BUDGET, `most lit at once ${lit}`);
  // the swap happens outside a torch's reach, so no torch visibly winks
  let inRange = 0;
  for (const { scene } of built) {
    scene.update({ x: scene.entrancePos.x, z: scene.entrancePos.z });
    const on = [];
    scene.group.traverse((o) => { if (o.isPointLight && o.visible) on.push(o); });
    const off = scene.torches.filter((t) => !on.some((l) => l.position.distanceTo(t) < 0.01));
    for (const t of off) {
      const d = Math.hypot(t.x - scene.entrancePos.x, t.z - scene.entrancePos.z);
      const reach = on[0]?.distance ?? 11;
      if (d < reach) inRange++;
    }
  }
  check('an unlit torch is always out of a torch light\'s reach', inRange === 0, `${inRange} would have winked`);
}

// ---- the exits -----------------------------------------------------------
{
  let up = 0, down = 0, bottoms = 0, bottomDown = 0, hitAtEntrance = 0;
  for (const { layout, scene } of built) {
    const tags = new Set();
    scene.group.traverse((o) => { if (o.userData.exit) tags.add(o.userData.exit); });
    if (tags.has('up')) up++;
    if (layout.stair) { if (tags.has('down')) down++; }
    else { bottoms++; if (!tags.has('down')) bottomDown++; }
    // the hit box stands on the entrance cell and is invisible on purpose:
    // three raycasts invisible objects, which is what makes it a free target
    const hb = scene.exits.find((e) => e.userData.exit === 'up');
    if (hb && !hb.visible && Math.abs(hb.position.x - scene.entrancePos.x) < 1e-9) hitAtEntrance++;
  }
  check('every level has a way up', up === built.length, `${up}/${built.length}`);
  const withStair = built.filter(({ layout }) => layout.stair).length;
  check('every level above the bottom has a way down', down === withStair, `${down}/${withStair}`);
  check('and the bottom level renders no stair at all', bottoms > 0 && bottomDown === bottoms, `${bottomDown}/${bottoms}`);
  check('the way up has an invisible hit box on the entrance cell', hitAtEntrance === built.length, `${hitAtEntrance}/${built.length}`);
  let mismatched = 0;
  for (const { layout, scene } of built) {
    const e = worldOf(layout, layout.entrance.gx, layout.entrance.gz);
    if (Math.abs(scene.entrancePos.x - e.x) > 1e-9 || Math.abs(scene.entrancePos.z - e.z) > 1e-9) mismatched++;
    if (layout.stair) { const s = worldOf(layout, layout.stair.gx, layout.stair.gz); if (Math.abs(scene.stairPos.x - s.x) > 1e-9) mismatched++; }
  }
  check('the markers stand on the cells the layout named', mismatched === 0);
}

// ---- geometry ------------------------------------------------------------
{
  let empty = 0, tall = 0, floors = 0;
  for (const { layout, scene } of built) {
    let verts = 0, maxY = 0, minY = 0;
    scene.group.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const p = o.geometry.attributes.position;
      verts += p.count;
      for (let i = 1; i < p.array.length; i += 3) { maxY = Math.max(maxY, p.array[i]); minY = Math.min(minY, p.array[i]); }
    });
    if (!verts) empty++;
    if (maxY >= WALL_H - 1e-6) tall++;
    // one floor quad per walkable cell, and the wall faces on top of that
    let cells = 0;
    for (let gz = 0; gz < layout.h; gz++) for (let gx = 0; gx < layout.w; gx++) if (walkable(layout, gx, gz)) cells++;
    if (verts >= cells * 6) floors++;
  }
  check('no level builds an empty scene', empty === 0);
  check('walls reach full height on every level', tall === built.length, `${tall}/${built.length}`);
  check('there is at least a floor quad per walkable cell', floors === built.length, `${floors}/${built.length}`);
}

// ---- ore, and the pickaxe that has to reach it ---------------------------
{
  const caves = built.filter(({ layout }) => layout.kind === 'cave');
  const dungeons = built.filter(({ layout }) => layout.kind === 'dungeon');
  check('every cave level builds an ore field', caves.length > 0 && caves.every(({ scene }) => scene.oreField), `${caves.length} caves`);
  check('a dungeon level builds none', dungeons.every(({ scene }) => !scene.oreField));
  check('an ore rock stands on every ore cell', caves.every(({ layout, scene }) => scene.oreField.trees.length === layout.ore.length));
  check('the field is rock, takes five swings and gives up ore', caves.every(({ scene }) => scene.oreField.kind === 'rock' && scene.oreField.hits === 5 && scene.oreField.yield === 'ore'));
  check('and it drew instanced meshes, so the pickaxe has something to hit', caves.every(({ scene }) => scene.oreField.meshes.length > 0), `${caves[0].scene.oreField.meshes.length} layers`);
  check('the ore field is registered, so pickTree can find it', caves.every(({ scene }) => treeFieldsFor().includes(scene.oreField)));
  let onFloor = 0, total = 0;
  for (const { layout, scene } of caves) for (const t of scene.oreField.trees) {
    total++;
    const near = layout.ore.some((o) => { const p = worldOf(layout, o.gx, o.gz); return Math.abs(p.x - t.x) < 1e-9 && Math.abs(p.z - t.z) < 1e-9; });
    if (near && t.gy === 0) onFloor++;
  }
  check('every ore rock sits on the floor of its own cell', total > 0 && onFloor === total, `${onFloor}/${total}`);
}

// ---- the pickaxe underground, and the farm it must not reach through -------
// pickTree raycasts every registered tree field at once, and three's raycaster
// does not skip invisible objects. If a hidden field still answered, a swing in
// a cave would land on an overworld boulder under the floor.
{
  const { pickTree } = await import('../farm/tree_edit.js');
  const site = { id: 'pick,1', cx: 4, cz: -9, kind: 'cave', name: 'the pick test' };
  const layout = generateDungeon(seed, site, 1);
  const scene = createDungeonScene(THREE, layout, {});
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const farm = { camera: cam, renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } } };
  const rock = scene.oreField.trees[0];
  cam.position.set(rock.x, 9, rock.z);
  cam.lookAt(rock.x, 0.4, rock.z);
  cam.updateMatrixWorld(true);
  scene.group.updateMatrixWorld(true);
  const seen = pickTree(farm, 50, 50);
  check('looking straight down at an ore rock picks it', !!seen && seen.field === scene.oreField, seen ? `index ${seen.index}` : 'nothing');
  scene.group.visible = false;
  scene.group.updateMatrixWorld(true);
  const hiddenPick = pickTree(farm, 50, 50);
  check('and the same swing picks nothing once the group is hidden', hiddenPick === null);
  scene.group.visible = true;
  check('turning it back on brings it back', !!pickTree(farm, 50, 50));
  scene.dispose();
  check('a disposed level answers no swing at all', pickTree(farm, 50, 50) === null);
}

// ---- dispose -------------------------------------------------------------
{
  const before = treeFieldsFor().length;
  for (const { scene } of built) scene.dispose();
  let left = 0, stillRegistered = 0, stillDrawn = 0;
  for (const { scene } of built) {
    if (scene.group.children.length) left++;
    if (scene.oreField) {
      if (treeFieldsFor().includes(scene.oreField)) stillRegistered++;
      if (scene.oreField.meshes.length) stillDrawn++;
    }
  }
  check('dispose empties every level group', left === 0);
  check('and takes its ore field out of the registry', stillRegistered === 0, `registry ${before} -> ${treeFieldsFor().length}`);
  check('and drops the meshes pickTree would have raycast', stillDrawn === 0);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
