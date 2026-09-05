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
//    it. The list is explicit: the streamed chunks, the flora, the fauna, the
//    site markers, the sky group and the four overworld lights. Everything
//    else in the scene (the player, the level you are standing in) is left
//    alone.
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
import { createFauna } from '../world/fauna.js';
import { generateDungeon, clampToWalkable, maxLevel } from '../world/dungeon_gen.js';
import { createDungeonScene } from '../world/dungeon.js';
import { THEMES, waterTexture } from '../farm/themes.js';
import { clearTreeFields, treeFieldsFor } from '../farm/tree_edit.js';

export const WORLD_SEED = 20260904;
/** The floor of a level is a quad at y = 0. Feet go there, not an inch above. */
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
  const fauna = createFauna(scene, field, { sitesNear: discovery.sitesNear });
  const world = createWorldStream(scene, field, {
    palette: buildPalette(THEMES), waterMap: waterTexture(),
    onBuilt: (cx, cz, verts) => { flora.onChunk(cx, cz, verts); fauna.onChunk(cx, cz, verts); },
    onDisposed: (cx, cz) => { flora.offChunk(cx, cz); fauna.offChunk(cx, cz); },
  });
  const siteMarkers = createSiteMarkers(scene, discovery, terrainY);

  const viewFar = world.viewRadius - FOG_MARGIN;
  sc.setFog(Math.min(90, viewFar * 0.28), viewFar);

  const center = new THREE.Vector3();
  let dungeon = null;      // { site, level, layout, scene }
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
    if (fauna.group) out.add(fauna.group);
    return [...out];
  }

  function updateWorld(dt, nowMs, x, z, dayFactor) {
    center.set(x, terrainY(x, z), z);
    world.update(center);
    flora.update(nowMs, x, z);
    fauna.update(dt, nowMs, x, z, dayFactor < 0.4);
    siteMarkers.update(x, z, world.viewRadius);
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

  /** Build one level and say where you landed. `arriveAt` is which door. */
  function openLevel(site, level, arriveAt = 'entrance') {
    dungeon.scene?.dispose();
    const layout = generateDungeon(seed, site, level);
    const built = createDungeonScene(THREE, layout, {});
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
    built.update({ x: at.x, z: at.z });
    fire({
      site, level, inside: true, kind: layout.kind,
      bottom: level >= maxLevel(layout.kind),
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
    dungeon = { site, level: 0, scene: null, layout: null };
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
    if (level >= maxLevel(dungeon.layout.kind)) return null;  // nothing built a stair here
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

  // Per frame underground. The overworld is not streamed, the sky is not
  // moved, discovery does not run: none of it is on screen.
  function updateDungeon(dt, nowMs, x, z) {
    dungeon.scene.update({ x, z });
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
    } else {
      const meshes = siteMarkers.meshes().filter(worldVisible);
      if (meshes.length) {
        const hits = raycaster.intersectObjects(meshes, false);
        for (const h of hits) {
          const site = h.object.userData.site;
          if (site) { cands.push({ d: h.distance, out: { kind: 'site', site } }); break; }
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
    field, world, flora, fauna, discovery, siteMarkers,

    heightAt(x, z) { return dungeon ? DUNGEON_FLOOR_Y : terrainY(x, z); },

    update(dt, nowMs, x, z, dayFactor = 1) {
      if (dungeon) updateDungeon(dt, nowMs, x, z);
      else updateWorld(dt, nowMs, x, z, dayFactor);
    },

    sitesNear(x, z, r) { return discovery.sitesNear(x, z, r); },

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
      return { ...L, level: dungeon.level, bottom: dungeon.level >= maxLevel(L.kind), id: L.id ?? dungeon.site?.id ?? null };
    },
    get dungeonLevel() { return dungeon ? dungeon.level : 0; },
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
      siteMarkers.dispose(); flora.dispose(); fauna.dispose(); world.dispose();
      clearTreeFields();
    },
  };
}
