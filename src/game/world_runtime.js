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

import * as THREE from 'three';
import { createWorldField } from '../world/field.js';
import { createWorldStream, buildPalette } from '../world/chunks.js';
import { createDiscovery } from '../world/sites.js';
import { createSiteMarkers } from '../world/site_models.js';
import { createFlora } from '../world/flora.js';
import { createDressing } from '../world/dressing_models.js';
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
  const discovery = createDiscovery(field);
  const flora = createFlora(scene, field, { sitesNear: discovery.sitesNear });
  // The realm's own things on the ground (Z3): rib cages, pillars, hedgerows,
  // wrecks. Streams with the chunks exactly as flora does.
  const dressing = createDressing(scene, field, { sitesNear: discovery.sitesNear });
  // fauna draws nothing any more. It says where the world's animals belong and
  // the monster layer stands them up, which is what makes a squirrel a thing
  // you can click. See src/world/fauna.js and docs/mmo/wiring/F1.md.
  const fauna = createFauna(field, { sitesNear: discovery.sitesNear });
  const world = createWorldStream(scene, field, {
    palette: buildPalette(THEMES), waterMap: waterTexture(),
    onBuilt: (cx, cz, verts) => { flora.onChunk(cx, cz, verts); dressing.onChunk(cx, cz, verts); },
    onDisposed: (cx, cz) => { flora.offChunk(cx, cz); dressing.offChunk(cx, cz); },
  });
  // `effects` is the shared particle pool (a burning wreck puffs smoke into it,
  // A3) and `field` lets a town face its gates at the roads (T1); both optional.
  const siteMarkers = createSiteMarkers(scene, discovery, terrainY, { effects: opts.effects || null, field });

  const viewFar = world.viewRadius - FOG_MARGIN;
  sc.setFog(Math.min(90, viewFar * 0.28), viewFar);

  const center = new THREE.Vector3();
  let dungeon = null;      // { site, level, layout, scene, spec, top, said }
  let surface = null;      // what was switched off on the way in
  let discoverFn = null, stateFn = null, zoneFn = null;
  let lastSweep = 0;

  world.update(center);
  siteMarkers.update(0, 0, world.viewRadius);

  // ---------------------------------------------------------------- above --

  /** Every scene node that belongs to the daylight world, right now. */
  function overworldNodes() {
    const out = new Set();
    for (const o of scene.children) {
      if (SKY_AND_LIGHTS.has(o.name) || o.name.startsWith('site:')) out.add(o);
    }
    if (world.group) out.add(world.group);
    if (flora.group) out.add(flora.group);
    if (dressing.group) out.add(dressing.group);   // without it a rib cage stays lit underground
    return [...out];
  }

  function updateWorld(dt, nowMs, x, z, dayFactor) {
    center.set(x, terrainY(x, z), z);
    world.update(center);
    flora.update(nowMs, x, z);
    dressing.update(nowMs);
    // the mines' headframe wheel turns and their lanterns light at dusk (M1)
    siteMarkers.update(x, z, world.viewRadius, dt, 1 - dayFactor);
    const found = discovery.check(x, z, nowMs);
    if (found && discoverFn) { try { discoverFn(found); } catch (err) { console.warn('onDiscover threw', err); } }
    // a named region, entered for the first time: once per zone, ever
    const zone = discovery.checkZone?.(x, z, nowMs);
    if (zone && zoneFn) { try { zoneFn(zone); } catch (err) { console.warn('onZone threw', err); } }
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
    return levelsFor(site, maxLevel(site?.kind === 'cave' ? 'cave' : 'dungeon'));
  }

  /** Build one level and say where you landed. `arriveAt` is which door. */
  function openLevel(site, level, arriveAt = 'entrance') {
    dungeon.scene?.dispose();
    const spec = dungeon.spec;
    const cavern = spec?.kind === CAVERN;
    const layout = cavern
      ? generateCavern(seed, site, level, spec)
      : generateDungeon(seed, site, level, spec);
    const built = cavern
      ? createCavernScene(THREE, layout, {})
      : createDungeonScene(THREE, layout, {});
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
    fire({
      site, level, inside: true, kind: layout.kind,
      gen: cavern ? CAVERN : 'rooms',
      bottom: level >= dungeon.top,
      arrivedAt: arriveAt, at: { x: at.x, z: at.z },
      ore: layout.ore.length, chests: layout.chests.length,
      rooms: layout.rooms.length, torches: built.torches.length,
      exits: exitPositions(built),
    });
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
    dungeon = { site, level: 0, scene: null, layout: null, spec: specFor(site), top: topOf(site), said: false };
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
    dungeon.scene.update({ x, z });
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
          if (site) { cands.push({ d: h.distance, out: { kind: 'site', site, waystone: !!h.object.userData.waystone } }); break; }
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
    field, world, flora, dressing, fauna, discovery, siteMarkers,

    heightAt(x, z) { return dungeon ? dungeonFloor(x, z) : terrainY(x, z); },

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
      siteMarkers.dispose(); flora.dispose(); dressing.dispose(); fauna.dispose(); world.dispose();
      clearTreeFields();
    },
  };
}
