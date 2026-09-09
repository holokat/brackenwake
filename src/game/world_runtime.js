import {cellarFloorAt} from '../world/cellar_floor.js';
import {isShoulder,SHOULDER_SPEC,createShoulderWorking} from '../world/shoulder_working.js';
import {furnishShoulder} from '../world/shoulder_scene.js';
import {createOldCellars} from '../world/old_cellars.js';
import {furnishOldCellars} from '../world/old_cellars_scene.js';
import {createPhysicalWorld} from '../world/collision/runtime.js';
// The world, streamed, and the way down into it.
//
// Ported from farm.js: `_buildWorld`, `_updateWorld` (without the camera
// follow, which camera.js owns now), `enterDungeon`, `_openLevel`,
// `dungeonGo`, `leaveDungeon`, `_updateDungeon` and `_pickDungeon`. The
// modules in src/world/ are untouched; this is the wiring that was inside the
// farm class.
//
// What changed, and why:
//
//  - There is no farm island, so "hide the overworld" is no longer a blanket
//    sweep of every visible scene child. That sweep would take the player with
//    it. The list is explicit: the streamed chunks, the flora, the site
//    markers, the sky group and the four overworld lights. Everything else in
//    the scene (the player, the level you are standing in) is left alone.
//    The wild animals are NOT on that list any more: they are monsters now,
//    and monsters.js empties its own layer on the way underground.
//  - The camera is not this module's business. Entering reports where you
//    arrived through onDungeonState, and main.js walks the player there.
//  - Fog goes through sc.setFog, which pins the colour while a level owns it
//    and hands it back on the way out.

import { authoredPick } from '../mmo/greenwold/interactions.js';
import { authoredDeckAt, createAuthoredCrossings } from '../world/authored_traversal.js';
import * as THREE from 'three';
import { createWorldField, CHUNK } from '../world/field.js';
import { createTerrainEdits } from '../world/terrain_edits.js';
import { setSnowBand } from '../world/terrain_material.js';
import { createWorldStream, buildPalette } from '../world/chunks.js';
import { createDiscovery } from '../world/sites.js';
import { setSculptOpen } from '../mmo/release.js';
import { createSiteMarkers } from '../world/site_models.js';
import { createFlora } from '../world/flora.js';
import { createDressing } from '../world/dressing_models.js';
import { createWayside } from '../world/wayside_models.js';
import { loadPropLibrary } from '../world/plan_models.js';
import { deckAt } from '../world/wayside.js';
import { createFauna } from '../world/fauna.js';
import { generateDungeon, clampToWalkable, maxLevel, floorAt, gridOf, walkable, roomAt } from '../world/dungeon_gen.js';
import { createDungeonScene } from '../world/dungeon.js';
import { generateCavern } from '../world/cavern_gen.js';
import { createCavernScene } from '../world/cavern_scene.js';
import { specFor, levelsFor, CAVERN } from '../mmo/dungeons.js';
import { THEMES, waterTexture } from '../farm/themes.js';
import { clearTreeFields, treeFieldsFor } from '../farm/tree_edit.js';

export const WORLD_SEED = 20260904;
/**
 * The floor of a room and corridor level is a quad at y = 0. Feet go there, not
 * an inch above.
 *
 * A CAVERN's floor is not one plane: every cell carries its own height and the
 * player stands on the one under his feet, so `heightAt` underground reads
 * `floorAt` and this constant is what that comes to on a level with no heights
 * on it, which is every level the old generator builds. See D3.md.
 */
export const DUNGEON_FLOOR_Y = 0;
/** Fog in the open closes just inside the streamed ring, so chunks never pop. */
export const FOG_MARGIN = 40;

/** Scene children scene.js owns that have no business being lit underground. */
const SKY_AND_LIGHTS = new Set(['sky', 'water', 'sun-light', 'hemi-light', 'ambient-light', 'fill-light']);

/** Where a hand cut world is kept, and what the editor's save button writes. */
/**
 * THE ACTIVE WORLD. One file boots; the others sit in public/terrain unloaded.
 * The Starting Island since 2026-09-08 ("a smaller island with a dungeon
 * entrance... leave the other area unavailable"); the Greenwold is
 * /terrain/greenwold.json and comes back by changing this one line. The
 * editor saves to the same file it loaded (world.js derives its path here).
 */
export const TERRAIN_FILE = '/terrain/island.json';

/**
 * What a hand cut cave is inside, by the size the stroke asked for.
 *
 * A `cave` stroke is a mouth and a size, and this is where a size becomes an
 * underground. The rows are the shape of a row of `src/mmo/dungeons.js`, which
 * is what `generateCavern` reads, and the only knobs that generator has are
 * these: how many levels, how hard the loot is, how many boxes, and whether the
 * last level ends in a boss hall. So SIZE MEANS DEPTH AND WHAT IS IN IT. The
 * grid itself is the generator's own (62 to 74 cells a side at 2 m a cell, and
 * six cells wider for every level down), and nothing here can change that
 * without changing cavern_gen.js.
 *
 * `arena: false` on all three: nobody's boss lairs in a hole somebody dug this
 * afternoon, and the habitat's own roll fills it instead.
 */
export const EDIT_CAVE_SPEC = {
  small:  { id: 'edit_cave_small',  name: 'a hollow', kind: CAVERN, theme: 'granite', levels: 1, tier: 1, chests: [1, 2], caches: [1, 3], arena: false, boss: null, bossName: null },
  medium: { id: 'edit_cave_medium', name: 'a cave',   kind: CAVERN, theme: 'granite', levels: 2, tier: 2, chests: [2, 3], caches: [2, 4], arena: false, boss: null, bossName: null },
  large:  { id: 'edit_cave_large',  name: 'a delve',  kind: CAVERN, theme: 'granite', levels: 3, tier: 3, chests: [3, 4], caches: [3, 5], arena: false, boss: null, bossName: null },
};
/** The row for a site, hand cut or not. One place, so the depth and the inside agree. */
export function specOfSite(site) {
  if(isShoulder(site))return SHOULDER_SPEC;
  if (site && site.edit && site.kind === 'cave') return EDIT_CAVE_SPEC[site.size] || EDIT_CAVE_SPEC.medium;
  return specFor(site);
}

/** three does not skip invisible objects, so ask the whole chain. */
function worldVisible(o) {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}

export function createWorldRuntime(sc, opts = {}) {
  const seed = opts.seed ?? WORLD_SEED;
  const homeBiome = opts.homeBiome || 'meadow';
  const scene = sc.scene;

  // a rebuild must not stack another copy of every world tree field on the
  // registry pickTree walks
  clearTreeFields();

  const field = createWorldField(seed, { homeBiome, homeY: opts.homeY ?? -0.3 });
  const terrainY = (x, z) => field.heightAt(x, z);

  // ---- the hand cut ground (ED2) ------------------------------------------
  //
  // One stroke list per runtime, laid over the field before anything is built.
  // Empty it moves nothing and paints nothing (field.test.mjs measures that
  // over 200 points), so a world nobody has edited is the world the seed made.
  // `baseHeight` is `field.heightAt` and the field already has the list, which
  // is what makes a `flatten` flatten the ground as it stands rather than the
  // hillside three strokes ago.
  let terrainEdits = opts.terrainEdits || createTerrainEdits({ baseHeight: (x, z) => field.heightAt(x, z) });
  // `applyTerrainHeader` and not `field.setTerrainEdits`: a list handed in by a
  // test may already carry a sculpt header, and the snow line has to go with it
  // from the first chunk. A hoisted function declaration, so it exists here.
  applyTerrainHeader();

  const discovery = createDiscovery(field);
  // A HAND CUT CAVE IS A PLACE, and this is the one line that makes it one.
  //
  // `field.editSitesNear` holds the cave strokes as site records. They are not
  // in `siteInCell`, because a cell holds one site and most cells already hold
  // one, so they are added here instead: every reader of `sitesNear` (the site
  // markers that build the mouth, the flora and dressing that keep off it, the
  // monsters and the people that avoid it, `runtime.sitesNear`) sees them from
  // this point on. `discovery.check` still does not, so a cave you cut yourself
  // is not announced to you as a discovery, which is right.
  const baseSitesNear = discovery.sitesNear;
  discovery.sitesNear = (x, z, r) => {
    const out = baseSitesNear(x, z, r);
    const extra = field.editSitesNear(x, z, r);
    return extra.length ? out.concat(extra) : out;
  };
  const flora = createFlora(scene, field, { sitesNear: discovery.sitesNear });
  // The realm's own things on the ground (Z3): rib cages, pillars, hedgerows,
  // wrecks. Streams with the chunks exactly as flora does.
  const dressing = createDressing(scene, field, { sitesNear: discovery.sitesNear });
  // The roads' own furniture (A2): lamps lit at dusk, signs at the forks,
  // bridges over the rivers, gates at the realm lines.
  const wayside = createWayside(scene, field);
  const crossings = createAuthoredCrossings(scene, field);
  // P1: a painted place's models, if the user has made them, load ahead of the
  // build; a model not on disk leaves its stand-in standing
  const propsReady=globalThis.location?.protocol?.startsWith('http')?loadPropLibrary():Promise.resolve([]);
  // fauna draws nothing any more. It says where the world's animals belong and
  // the monster layer stands them up, which is what makes a squirrel a thing
  // you can click. See src/world/fauna.js and docs/mmo/wiring/F1.md.
  const fauna = createFauna(field, { sitesNear: discovery.sitesNear });
  const world = createWorldStream(scene, field, {
    palette: buildPalette(THEMES), waterMap: waterTexture(),
    onBuilt: (cx, cz, verts) => { flora.onChunk(cx, cz, verts); dressing.onChunk(cx, cz, verts); wayside.onChunk(cx, cz, verts); },
    onDisposed: (cx, cz) => { flora.offChunk(cx, cz); dressing.offChunk(cx, cz); wayside.offChunk(cx, cz); },
  });
  // `effects` is the shared particle pool (a burning wreck puffs smoke into it,
  // A3) and `field` lets a town face its gates at the roads (T1); both optional.
  const siteMarkers = createSiteMarkers(scene, discovery, terrainY, { effects: opts.effects || null, field });
  const physical = createPhysicalWorld({siteMarkers,heightAt:(x,z)=>terrainY(x,z),get inDungeon(){return !!dungeon;},get dungeonLayout(){return dungeon?.layout;},get dungeonScene(){return dungeon?.scene;}});

  const viewFar = world.viewRadius - FOG_MARGIN;
  sc.setFog(Math.min(90, viewFar * 0.28), viewFar);

  const center = new THREE.Vector3();
  let dungeon = null;      // { site, level, layout, scene, spec, top, said }
  let surface = null;      // what was switched off on the way in
  let discoverFn = null, stateFn = null, zoneFn = null, terrainFn = null, rebuildFn = null;
  let lastSweep = 0;

  world.update(center);
  siteMarkers.update(0, 0, world.viewRadius);
  // The hand cut world on disk. `fetch` cannot be waited for here without
  // making the whole runtime asynchronous, so it lands when it lands and
  // rebuilds what was built in the meantime. `terrainFile: false` turns it off,
  // which is what a test that owns its own list does.
  const terrainReady = opts.terrainFile !== false
    ? loadTerrainFile(typeof opts.terrainFile === 'string' ? opts.terrainFile : TERRAIN_FILE)
    : Promise.resolve(null);
  const ready=Promise.all([terrainReady,propsReady]).then(([terrain])=>{
    siteMarkers.update(center.x+1e6,center.z+1e6,world.viewRadius);
    siteMarkers.update(center.x,center.z,world.viewRadius);
    return terrain;
  });

  // ---------------------------------------------------------------- above --

  /** Every scene node that belongs to the daylight world, right now. */
  function overworldNodes() {
    const out = new Set();
    for (const o of scene.children) {
      if (SKY_AND_LIGHTS.has(o.name) || o.name === 'world-forage' || o.name.startsWith('site:')) out.add(o);
    }
    if (world.group) out.add(world.group);
    if (flora.group) out.add(flora.group);
    if (dressing.group) out.add(dressing.group);   // without it a rib cage stays lit underground
    if (wayside.group) out.add(wayside.group);     // or the lamps burn underground
    return [...out];
  }

  function updateWorld(dt, nowMs, x, z, dayFactor) {
    center.set(x, terrainY(x, z), z);
    world.update(center);
    flora.update(nowMs, x, z);
    dressing.update(nowMs);
    // the mines' headframe wheel turns and their lanterns light at dusk (M1)
    siteMarkers.update(x, z, world.viewRadius, dt, 1 - dayFactor);
    physical.update(dt);
    wayside.update(dt, 1 - dayFactor);
    crossings.update(x,z);
    const found = discovery.check(x, z, nowMs);
    if (found && discoverFn) { try { discoverFn(found); } catch (err) { console.warn('onDiscover threw', err); } }
    // a named region, entered for the first time: once per zone, ever
    const zone = discovery.checkZone?.(x, z, nowMs);
    if (zone && zoneFn) { try { zoneFn(zone); } catch (err) { console.warn('onZone threw', err); } }
  }

  // ------------------------------------------------------- the ground moves --
  //
  // Until the world could be edited, a built chunk's ground could not change,
  // so the streamer had no way to build one again. A stroke changes it, and
  // everything downstream of the field has to be told: the terrain mesh, the
  // grass and trees on it, the dressing, the wayside, and the site markers,
  // which stand at a height they read from the field when they were built.

  /** Does the square of chunk (cx, cz) touch the circle at (x, z) of radius r? */
  function chunkTouches(cx, cz, x, z, r) {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const nx = Math.max(x0, Math.min(x, x0 + CHUNK));
    const nz = Math.max(z0, Math.min(z, z0 + CHUNK));
    const dx = x - nx, dz = z - nz;
    return dx * dx + dz * dz <= r * r;
  }

  /**
   * Take down and put back every built chunk whose square touches the circle.
   *
   * Synchronous on purpose: the editor's whole promise is that the ground moves
   * under the stroke you just made, and a job queued behind the streamer's
   * three-a-frame budget would land a second later, half a hill at a time. A
   * 33 vert chunk is 2.5 ms to mesh (measured in chunks.js's own header), and a
   * 12 m brush touches one to four of them.
   *
   * The site markers are refreshed too, but only when a site is inside the
   * circle: a marker is built once, at the height the field gave it, and a mine
   * whose hillside has just moved would otherwise stand in the air. There is no
   * "rebuild this one marker" in site_models.js, so the whole live set is
   * dropped and the ring rebuilds it, one marker a frame, which is what it does
   * when you walk into a valley anyway.
   *
   * Returns what it did, in numbers, so the words the HUD says are counted and
   * not claimed.
   */
  /**
   * THE ONE PLACE ANYTHING ELSE HEARS THAT THE GROUND MOVED (ED4).
   *
   * The water is built in `src/game/app/systems/world.js`, not here, because it
   * belongs to the frame and to the sky. But water somebody PLACED is a
   * function of the stroke list, so it has to be rebuilt on exactly the events
   * that rebuild the ground: a stroke, an undo, a redo, a reset, a header
   * change and a file landing. Every one of those goes through `rebuildAround`
   * or `rebuildAll`, so this is the seam, and it is one seam rather than six
   * call sites that a seventh event would be forgotten out of.
   */
  function fireRebuild(what) {
    if (!rebuildFn) return;
    try { rebuildFn(what); } catch (err) { console.warn('onRebuild threw', err); }
  }

  function rebuildAround(x, z, r) {
    const chunks = world.rebuildWhere((cx, cz) => chunkTouches(cx, cz, x, z, r));
    let sites = 0;
    for (const s of discovery.sitesNear(x, z, r + 120)) sites++;
    if (sites) {
      // the two step nudge: `update` only re-plans when the point has moved
      // 48 m, so it is walked away and walked back
      siteMarkers.update(x + 1e6, z + 1e6, world.viewRadius);
      siteMarkers.update(x, z, world.viewRadius);
    }
    const did = { chunks, sites, x, z, r, all: false };
    fireRebuild(did);
    return did;
  }

  /** Every built chunk, whatever it stands under. What a loaded file needs. */
  function rebuildAll() {
    const chunks = world.rebuildWhere(() => true);
    siteMarkers.update(center.x + 1e6, center.z + 1e6, world.viewRadius);
    siteMarkers.update(center.x, center.z, world.viewRadius);
    const did = {
      chunks, sites: discovery.sitesNear(center.x, center.z, world.viewRadius).length,
      x: center.x, z: center.z, r: Infinity, all: true,
    };
    fireRebuild(did);
    return did;
  }

  /**
   * Hand the field whatever the stroke list's header now says, and put the snow
   * line where the header puts it. Returns whether the world moved.
   *
   * ONE FUNCTION, because a header change has to reach three places and missing
   * any of them leaves the world half changed: the field (which drops its site
   * and road caches and swaps the generator for the table), the terrain material
   * (whose snow ramp is a module constant and would otherwise go white at 64 m
   * in a world whose header says 180), and everything already built.
   */
  function applyTerrainHeader() {
    const was = field.sculpt;
    field.setTerrainEdits(terrainEdits);
    const now = field.sculpt;
    setSnowBand(now ? now.snowLine : null);
    return was !== now
      || !!(was && now && (was.height !== now.height || was.ground !== now.ground
        || was.snowLine !== now.snowLine || was.beachLine !== now.beachLine));
  }

  /**
   * The hand cut world on disk, if there is one.
   *
   * Missing is the ordinary case and is silent: nobody has cut anything yet.
   * Present, it is applied and everything already built is built again, because
   * `fetch` is asynchronous and the streamer does not wait for anybody. In
   * practice the first ring is a few chunks old when the file lands and those
   * few are rebuilt; `onTerrain` says how many, so the words are counted.
   *
   * A FILE WITH NO STROKES IN IT IS NOT NOTHING (ED3). It used to be: `if (!n)
   * return null` walked away from an empty list, which was right while a file
   * was only a list. A file now carries a header, and `{ "mode": "sculpt",
   * "strokes": [] }` is the whole request "give me a blank world to build in".
   * So the header is applied first and the early return only happens when
   * neither the header nor the list said anything.
   */
  async function loadTerrainFile(url = TERRAIN_FILE) {
    try {
      const res = await fetch(url);
      if (!res || !res.ok) return null;
      const json = await res.json();
      const n = terrainEdits.load(json);
      const moved = applyTerrainHeader();
      // a sculpt world's own gate (`base.open`), or none, so the realm circles rule
      setSculptOpen(field.sculpt && field.sculpt.open ? field.sculpt.open : null);
      if (!n && !moved) return null;
      const did = rebuildAll();
      const info = {
        url, strokes: n, chunks: did.chunks, caves: terrainEdits.caves().length,
        mode: terrainEdits.mode, base: field.sculpt ? { ...field.sculpt } : null,
      };
      if (terrainFn) { try { terrainFn(info); } catch (err) { console.warn('onTerrain threw', err); } }
      return info;
    } catch {
      return null;                 // no file, no server, no network: all the same thing
    }
  }

  // ---------------------------------------------------------------- below --

  function fire(st) {
    if (!stateFn) return;
    try { stateFn(st); } catch (err) { console.warn('onDungeonState threw', err); }
  }

  /**
   * How deep this place goes.
   *
   * The sheet says it: `src/mmo/dungeons.js` reads `levels` off realms.js for
   * every authored dungeon and cave, so the Old Cellars are one level and the
   * Throne of Ash is three. A rolled cave in the hills is in nobody's table and
   * keeps the old rule, which is what `maxLevel` has always said.
   */
  function topOf(site) {
    if(isShoulder(site))return 1;
    // a hand cut cave is in nobody's sheet, so its own row says how deep it goes
    if (site && site.edit) return Math.max(1, specOfSite(site).levels);
    return levelsFor(site, maxLevel(site?.kind === 'cave' ? 'cave' : 'dungeon'));
  }

  /** Build one level and say where you landed. `arriveAt` is which door. */
  function openLevel(site, level, arriveAt = 'entrance') {
    // Pin the destination before disposing the old floor, including an in-flight prefetch.
    const arrivalLease = dungeon.scene?.streaming?.claimArrival(level, arriveAt === 'stair' ? 'up' : 'down');
    let arrivalReady;
    try {
      dungeon.scene?.dispose();
      const spec = dungeon.spec;
      const cavern = spec?.kind === CAVERN;
      const layout = isShoulder(site) ? createShoulderWorking(seed,site) : spec?.id === 'oldcellars'
        ? createOldCellars(seed, site, level) : cavern
        ? generateCavern(seed, site, level, spec)
        : generateDungeon(seed, site, level, spec);
      const built = cavern
        ? createCavernScene(THREE, layout, {})
        : createDungeonScene(THREE, layout, {});
      if(isShoulder(site))furnishShoulder(built,layout);
      if(spec?.id==='oldcellars')furnishOldCellars(built,layout,{sc});
      scene.add(built.group);
      // three raycasts against matrixWorld, and only the renderer refreshes it.
      // Without this the first pick after arriving tests every exit hit box at
      // the scene origin, so the way out is unclickable for exactly one frame.
      built.group.updateMatrixWorld(true);
      const P = built.palette;
      scene.background = new THREE.Color(P.bg);
      sc.setFog(P.fogNear, P.fogFar, P.fog);
      // coming up from below you arrive at the stair you just climbed, not at
      // the entrance on the far side of the level
      const at = (arriveAt === 'stair' && built.stairPos) ? built.stairPos : built.entrancePos;
      dungeon.level = level;
      dungeon.layout = layout;
      dungeon.scene = built;
      dungeon.said = false;                      // the arena has not spoken on this level
      built.update({ x: at.x, z: at.z });
      if (arrivalLease) arrivalReady = built.ready;
      fire({
        site, level, inside: true, kind: layout.kind,
        gen: cavern ? CAVERN : 'rooms',
        bottom: level >= dungeon.top,
        arrivedAt: arriveAt, at: { x: at.x, z: at.z },
        ore: layout.ore.length, chests: layout.chests.length,
        rooms: layout.rooms.length, torches: built.torches.length,
        exits: exitPositions(built),
      });
    } finally {
      if (arrivalLease) Promise.resolve(arrivalReady).then(() => arrivalLease.release(), () => arrivalLease.release());
    }
  }

  /** Where the two doors are, so a key press can measure reach against them. */
  function exitPositions(built) {
    const out = [{ dir: 'up', x: built.entrancePos.x, z: built.entrancePos.z }];
    if (built.stairPos) out.push({ dir: 'down', x: built.stairPos.x, z: built.stairPos.z });
    return out;
  }

  function enterDungeon(site, level = 1) {
    if (!site || (site.kind !== 'dungeon' && site.kind !== 'cave')) return null;
    if (dungeon) {
      if (dungeon.site.id === site.id) return dungeon;
      leaveDungeon();
    }
    const hidden = [];
    for (const o of overworldNodes()) {
      if (o.visible) { o.visible = false; hidden.push(o); }
    }
    surface = {
      hidden,
      background: scene.background,
      fog: { near: scene.fog.near, far: scene.fog.far, color: scene.fog.color.getHex(), pinned: sc.fogPinned },
    };
    dungeon = { site, level: 0, scene: null, layout: null, spec: specOfSite(site), top: topOf(site), said: false };
    openLevel(site, level, 'entrance');
    return dungeon;
  }

  /** Take an exit. 'up' from level 1 leaves; 'down' goes deeper. */
  function dungeonGo(dir) {
    if (!dungeon) return null;
    const { site, level } = dungeon;
    if (dir === 'up') {
      if (level <= 1) { leaveDungeon(); return { inside: false, level: 0 }; }
      openLevel(site, level - 1, 'stair');
      return { inside: true, level: level - 1 };
    }
    if (level >= dungeon.top) return null;                     // nothing built a stair here
    openLevel(site, level + 1, 'entrance');
    return { inside: true, level: level + 1 };
  }

  function leaveDungeon() {
    if (!dungeon) return false;
    const { site, level } = dungeon;
    dungeon.scene?.dispose();
    const s = surface;
    dungeon = null; surface = null;
    if (s) {
      for (const o of s.hidden) o.visible = true;
      scene.background = s.background;
      // the pinned colour goes back first, then the pin itself, so the day
      // pass takes the fog over again exactly where it left off
      scene.fog.color.setHex(s.fog.color);
      if (s.fog.pinned) sc.setFog(s.fog.near, s.fog.far, s.fog.color);
      else sc.setFog(s.fog.near, s.fog.far);
    }
    // you come back out at the mouth you went in by
    fire({ site, level, inside: false, at: { x: site.x, z: site.z } });
    return true;
  }

  /**
   * The floor under a point, underground, in metres.
   *
   * On a room and corridor level that is DUNGEON_FLOOR_Y and nothing else. In a
   * cavern it is the height of the cell the point stands in, which is what puts
   * the player on the ledge he walked up and the monsters on it with him: every
   * body in `monsters.js` takes its y from `runtime.heightAt`, so this one
   * function is the whole of the path.
   *
   * A point in the rock has no floor of its own, so it takes the floor of the
   * nearest cell that has one. Without that a body the clamp has not caught yet
   * would drop to zero for a frame and then jump back.
   */
  function dungeonFloor(x, z) {
    const L = dungeon.layout;
    if (!L || !L.heights) return DUNGEON_FLOOR_Y;
    if (L.siteId === 'oldcellars') return cellarFloorAt(L,x,z);
    const g = gridOf(L, x, z);
    if (walkable(L, g.gx, g.gz)) return floorAt(L, g.gx, g.gz);
    const c = clampToWalkable(L, x, z);
    const n = gridOf(L, c.x, c.z);
    return floorAt(L, n.gx, n.gz);
  }

  /**
   * The boss's hall, said once, the first time you set foot in it.
   *
   * It goes out through `onZone`, which is the words path that reaches the
   * BANNER: `app/systems/world.js` answers it with `hud.zone(name, sub)` and a
   * toast of the line. `onDungeonState` only toasts, and a boss deserves the
   * plate. `zoneSub` reads `danger[1]`, so the subtitle is the realm's own
   * danger word.
   */
  function checkArena(x, z) {
    if (!dungeon || dungeon.said) return;
    const L = dungeon.layout;
    if (!L || L.arena == null) return;
    const g = gridOf(L, x, z);
    const r = roomAt(L, g.gx, g.gz);
    if (!r || r.i !== L.arena) return;
    dungeon.said = true;
    if (!zoneFn) return;
    const spec = dungeon.spec;
    const t = spec?.tier || 3;
    const zone = spec?.bossName
      ? {
        id: `lair:${spec.id}:${spec.boss}`,
        name: spec.bossName,
        danger: [t, t],
        line: `${spec.bossName} is standing in the middle of this hall, and the door you came in by is behind you.`,
      }
      : {
        id: `lair:${L.siteId || L.id}:${L.level}`,
        name: `${dungeon.site.name}, the deep hall`,
        danger: [t, t],
        line: 'The hall at the bottom of it, and whatever was left here to hold it.',
      };
    try { zoneFn(zone); } catch (err) { console.warn('onZone threw', err); }
  }

  // Per frame underground. The overworld is not streamed, the sky is not
  // moved, discovery does not run: none of it is on screen.
  function updateDungeon(dt, nowMs, x, z) {
    dungeon.scene.update(dt, { x, z });
    checkArena(x, z);
    // Anything that adds itself to the scene lazily while you are down here
    // would hang in the dark. Sweep now and then for scene children that are
    // neither the level nor anything the player owns, and remember what was
    // switched off so leaving still puts back exactly what was on.
    if (nowMs - lastSweep > 400) {
      lastSweep = nowMs;
      for (const o of overworldNodes()) {
        if (!o.visible) continue;
        o.visible = false; surface.hidden.push(o);
      }
    }
  }

  // ---------------------------------------------------------------- picks --

  function pickTreeWith(raycaster) {
    const meshes = treeFieldsFor().flatMap((f) => f.meshes).filter(worldVisible);
    if (!meshes.length) return null;
    const hits = raycaster.intersectObjects(meshes, false);
    for (const h of hits) {
      const f = h.object.userData.treeField;
      const map = h.object.userData.treeMap;
      if (f && map && h.instanceId != null) {
        return { d: h.distance, tree: { field: f, index: map[h.instanceId], point: h.point } };
      }
    }
    return null;
  }

  /**
   * What is under the ray. Nearest wins, so a tree in front of a town gets the
   * click and not the roof behind it.
   */
  function pick(raycaster) {
    const cands = [];
    if (dungeon) {
      const surface=dungeon.scene.mine?.pick(raycaster);
      if(surface)cands.push({d:surface.distance,out:surface});
      // the exits' hit boxes are invisible on purpose; three raycasts them anyway
      const hits = raycaster.intersectObjects(dungeon.scene.exits, false);
      if (hits.length && hits[0].object.userData.exit) {
        cands.push({ d: hits[0].distance, out: { kind: 'exit', exit: hits[0].object.userData.exit } });
      }
      // a box in a cavern, and the same invisible generous target as an exit
      const boxes = dungeon.scene.chestMeshes;
      if (boxes && boxes.length) {
        const bh = raycaster.intersectObjects(boxes, true);
        for (const h of bh) {
          const chest = h.object.userData.chest;
          if (chest) { cands.push({ d: h.distance, out: { kind: 'chest', chest, site: dungeon.site } }); break; }
        }
      }
    } else {
      const meshes = siteMarkers.meshes().filter(worldVisible);
      if (meshes.length) {
        const hits = raycaster.intersectObjects(meshes, false);
        for (const h of hits) {
          const site = h.object.userData.site;
          if (site) { cands.push({ d: h.distance, out: authoredPick(site,h.object.userData.plan?.piece,h.point) || { kind: 'site', site, waystone: !!h.object.userData.waystone } }); break; }
        }
      }
    }
    const t = pickTreeWith(raycaster);
    if (t) cands.push({ d: t.d, out: { kind: 'tree', tree: t.tree } });
    if (!cands.length) return null;
    cands.sort((a, b) => a.d - b.d);
    return cands[0].out;
  }

  // ------------------------------------------------------------- surfaces --

  return {
    field, world, flora, dressing, wayside, fauna, discovery, siteMarkers, physical,

    // ---- the hand cut ground (docs/mmo/wiring/ED2-TERRAIN.md) -------------
    /** The stroke list this world is standing on. */
    get terrainEdits() { return terrainEdits; },
    /** Hand it a different list: it goes onto the field and the world rebuilds. */
    setTerrainEdits(edits) {
      terrainEdits = edits || createTerrainEdits({ baseHeight: (x, z) => field.heightAt(x, z) });
      applyTerrainHeader();
      return rebuildAll();
    },
    /**
     * Say what the flat world is: its height, its ground, its snow and beach
     * lines, or its mode (ED3). Rebuilds everything that is loaded, because a
     * base height is under every chunk in the ring and not just the near ones.
     *
     * Returns `{ base, mode, changed, chunks }`, where `changed` is the list of
     * what actually moved and `chunks` is counted off the rebuild.
     */
    setBase(patch) {
      const did = terrainEdits.setBase(patch);
      applyTerrainHeader();
      const built = did.changed.length ? rebuildAll() : { chunks: 0, sites: 0 };
      return { ...did, chunks: built.chunks };
    },
    /** Ground moved at (x, z): put every chunk the circle touches back up. */
    rebuildAround,
    rebuildAll,
    /** Fetch and apply a saved stroke list. Missing is null and is not a fault. */
    loadTerrainFile,
    ready,
    /** Called when a file has landed and been applied, with what it did. */
    onTerrain(fn) { terrainFn = fn; },
    /**
     * Called every time the ground was put back up, with what the rebuild did:
     * `{ chunks, sites, x, z, r, all }`. ED4's water listens on this, so a lake
     * a stroke made appears in the same breath as the bed under it.
     */
    onRebuild(fn) { rebuildFn = fn; },

    heightAt(x, z) {
      if (dungeon) return dungeonFloor(x, z);
      // a bridge deck is the ground where there is one (A2), or the player
      // swims under his own bridge
      const deck = authoredDeckAt(field,x,z) ?? deckAt(field, x, z);
      return deck === null ? terrainY(x, z) : deck;
    },

    update(dt, nowMs, x, z, dayFactor = 1) {
      if (dungeon) updateDungeon(dt, nowMs, x, z);
      else updateWorld(dt, nowMs, x, z, dayFactor);
    },

    sitesNear(x, z, r) { return discovery.sitesNear(x, z, r); },

    /**
     * THE CRITTER SOURCE. Spawn records for one chunk's worth of the world's
     * own animals, in `monsters.spawnsForChunk`'s exact record shape.
     *
     * `monsters.js` already holds this runtime, so this is the seam: one line
     * in its `chunkFor` concatenates these onto the chunk's own roll and every
     * rule downstream (the cap, the dead list, the eight to fifteen minute
     * respawn, the despawn when the ring moves) applies to a rabbit exactly as
     * it does to a wolf. docs/mmo/wiring/F1.md quotes the line.
     *
     * Underground there are no critters: a level is not a meadow.
     */
    critterSpawns(cx, cz, night = false) {
      if (dungeon) return [];
      return fauna.spawnsFor(cx, cz, !!night);
    },
    /** The character's own found list and walked zones become discovery's truth (S1 follow-up). */
    adoptDiscovery(character) { discovery.adopt?.(character?.discovered, character?.zones); },

    pick,
    enterDungeon, dungeonGo, leaveDungeon,
    get inDungeon() { return !!dungeon; },
    /** The settings window's grass density and wind strength, handed to flora. */
    setGrass(v) { flora?.setGrass?.(v); },
    setWind(v) { flora?.setWind?.(v); },
    setGround(q) { world?.setQuality?.(q); },
    /** The level's room grid for the monster layer (docs/mmo/wiring/G3.md). Null above ground. */
    dungeonLayout() {
      if (!dungeon || !dungeon.layout) return null;
      const L = dungeon.layout;
      return {
        ...L,
        level: dungeon.level,
        bottom: dungeon.level >= dungeon.top,
        id: L.id ?? dungeon.site?.id ?? null,
        // which room the boss stands in, and which place in the sheet this is,
        // so monster_ai.js stands the boss that lairs here and not a rolled one
        arena: L.arena ?? null,
        bossLair: dungeon.spec ? dungeon.spec.id : null,
      };
    },
    get dungeonLevel() { return dungeon ? dungeon.level : 0; },
    /** How deep this place goes: the sheet's own answer. Zero above ground. */
    get dungeonTop() { return dungeon ? dungeon.top : 0; },
    /** The row out of src/mmo/dungeons.js for the place you are in, or null. */
    get dungeonSpec() { return dungeon ? dungeon.spec : null; },
    /** Every box on the level you are standing in. Empty above ground. */
    dungeonChests() { return dungeon && dungeon.layout ? dungeon.layout.chests.slice() : []; },
    get dungeonSite() { return dungeon ? dungeon.site : null; },
    get dungeonScene() { return dungeon ? dungeon.scene : null; },

    /** Identity in the open; the nearest floor cell underground. */
    clampWalkable(x, z) {
      if (!dungeon) return [x, z];
      const c = clampToWalkable(dungeon.layout, x, z);
      return [c.x, c.z];
    },

    onDiscover(fn) { discoverFn = fn; },
    onZone(fn) { zoneFn = fn; },
    zoneNow(x, z) { return discovery.zoneNow?.(x, z) ?? null; },
    onDungeonState(fn) { stateFn = fn; },

    dispose() {
      if (dungeon) { try { dungeon.scene?.dispose(); } catch { /* already gone */ } dungeon = null; surface = null; }
      siteMarkers.dispose(); flora.dispose(); dressing.dispose(); wayside.dispose();
      crossings.dispose(); fauna.dispose(); world.dispose();
      clearTreeFields();
    },
  };
}
