// The world: the ground under everything, the sky over it, the sea at the edge.
//
// This system is built before the character creation screen, because creation.js
// turns its rig over real terrain and the world is expensive enough to want the
// head start. So nothing in `create` may touch the character document; anything
// that needs one waits for `ready`.

import * as THREE from 'three';
import { openAt, insidePoint, GATE_LINE, GATE_SAY_EVERY_MS } from '../../../mmo/release.js';
import { createWorldRuntime, EDIT_CAVE_SPEC, TERRAIN_FILE } from '../../world_runtime.js';
import { createSky } from '../../sky.js';
import { createWater } from '../../../world/water.js';
import { zoneSub, clampToWorld, birthplaceFor } from '../../../world/zones.js';
// SEA_LEVEL, so the words a downward brush reports quote the number the field
// used to flood at rather than a second copy of it that could drift.
import { SEA_LEVEL } from '../../../world/field.js';
import { cameraClamp } from '../../../world/dungeon.js';
import {
  reachOf, maxGrade, kinds as strokeKinds, NEEDS_YAW, GROUND_WORDS, BASE_GROUNDS,
  WATER_KINDS, isWaterKind, levelOf, levelEndOf, depthOf,
  ERASE_KIND, hardnessOf, opacityOf, coreRadius,
} from '../../../world/terrain_edits.js';

/** Where the follow camera looks on the body, matching camera.js. */
const CAMERA_EYE = 1.5;
/** Where the editor's save button writes, and where the runtime reads at boot. */
export const TERRAIN_SAVE_PATH = 'public/terrain/greenwold.json';
/** The dev server's own writer. vite.config.js answers it; a built game does not. */
export const EDITOR_SAVE_URL = '/__editor/save';
/** Metres of margin past a stroke's own reach that the ground is put back over. */
export const REBUILD_MARGIN = 8;
/** The steepest ground the mesher can show without it reading as a tear. */
export const MESH_GRADE = 8;

const deg = (rad) => Math.round(((rad * 180 / Math.PI) % 360 + 360) % 360);
const m1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const place = (s) => `${Math.round(s.x)}, ${Math.round(s.z)}`;

/**
 * What a stroke did, in words, for the HUD log.
 *
 * Every one of these numbers is read off the stroke the list actually stored,
 * after it was cleaned up, so a radius the module clamped or an amount it
 * defaulted is the number the words say. Nothing here is a plan; it is a
 * report. `chunks` is what the rebuild counted.
 */
/**
 * How soft a brush's edge was, in words, off the stroke that was stored.
 *
 * Said for the two brushes whose whole point is the edge, and said in metres
 * rather than as the 0 to 1 the slider carries, because a person looking at the
 * ground is looking at metres. A brush at hardness 1 has no falloff to report
 * and says nothing, which is what every stroke made before ED5 does.
 */
export function featherWords(s) {
  const bits = [];
  const core = coreRadius(s), r = Math.max(0, s.r || 0);
  // Said only when there is a falloff to say. A brush with no core is the
  // profile it always was (a dome is not "feathered", it is a dome) and a brush
  // whose core IS its radius is the hard edge paint always had, so both of them
  // say nothing, which is what every stroke made before ED5 does.
  if (core > 0 && core < r) bits.push(`full to ${m1(core)} m and feathered over the last ${m1(r - core)}`);
  if (opacityOf(s) < 1) bits.push(`${Math.round(opacityOf(s) * 100)}% of it in one pass`);
  return bits.length ? `, ${bits.join(', ')}` : '';
}

export function strokeWords(s, chunks, extra = '') {
  const at = place(s), r = Math.round(s.r);
  const grade = maxGrade(s);
  const steep = grade != null && grade > MESH_GRADE
    ? `, and at ${m1(grade)} m per metre it is steeper than the ground can be drawn`
    : '';
  let body;
  switch (s.kind) {
    case 'raise': body = `raised ${m1(s.amount)} m over ${r} m at ${at}`; break;
    case 'lower': body = `lowered ${m1(s.amount)} m over ${r} m at ${at}`; break;
    case 'flatten': body = `flattened ${r} m of ground to ${m1(s.h0)} m at ${at}`; break;
    case 'smooth': body = `smoothed ${r} m of ground toward ${m1(s.h0)} m at ${at}`; break;
    case 'pit': body = `dug a pit ${m1(Math.abs(s.amount))} m deep and ${r * 2} m across at ${at}`; break;
    case 'cliff': body = `cut a step of ${m1(s.amount)} m at ${at}, the high side facing ${deg(s.yaw || 0)} degrees`; break;
    case 'cave': body = `cut a cave mouth at ${at}, facing ${deg(s.yaw || 0)} degrees`; break;
    case 'ground': body = `painted ${s.word} over ${r} m at ${at}`; break;
    // ED3's eight. Every number here is read off the STORED stroke, after the
    // clamps, so a mountain asked for at a kilometre across says 600 m.
    case 'mountain': body = `raised a mountain ${m1(s.amount)} m tall and ${r * 2} m across at ${at}, roughness ${m1(s.roughness == null ? 0.6 : s.roughness)}`; break;
    case 'ridge': body = `drew a ridge ${m1(s.amount)} m high and ${Math.round(s.length || 0)} m long from ${at}, bearing ${deg(s.yaw || 0)} degrees`; break;
    case 'valley': body = `cut a valley ${m1(s.amount)} m deep and ${Math.round(s.length || 0)} m long from ${at}, bearing ${deg(s.yaw || 0)} degrees`; break;
    case 'plateau': body = `levelled ${r} m of ground to ${m1(s.height == null ? s.h0 : s.height)} m at ${at}`; break;
    case 'terrace': body = `stepped ${r} m of ground into ${m1(s.step == null ? 4 : s.step)} m terraces at ${at}`; break;
    case 'noise': body = `roughened ${r} m of ground by ${m1(s.amount)} m at ${at}`; break;
    case 'erode': body = `eroded ${r} m of ground toward ${m1(s.h0)} m at ${at}, taking away only`; break;
    // ED4's five. Every number is read off the stored stroke through the same
    // three functions the field and the renderer read it through, so the words,
    // the sample and the surface cannot say three different things.
    case 'lake': case 'pond': {
      const level = levelOf(s), depth = depthOf(s);
      body = `sank a ${s.kind} ${r * 2} m across at ${at}, its surface at ${m1(level)} m`
        + (depth > 0 ? ` and its bed at ${m1(level - depth)} m, ${m1(depth)} m under it` : ' and no bed cut at all');
      break;
    }
    case 'river': {
      const len = Math.round(Math.hypot((s.x2 ?? s.x) - s.x, (s.z2 ?? s.z) - s.z));
      const a = levelOf(s), b = levelEndOf(s);
      const run = a > b ? `falling from ${m1(a)} m to ${m1(b)} m`
        : a < b ? `climbing from ${m1(a)} m to ${m1(b)} m, which is uphill: swap the ends or drop the far level`
          : `level the whole way at ${m1(a)} m`;
      body = `cut a river ${m1(s.width)} m wide and ${len} m long from ${at} to ${Math.round(s.x2 ?? s.x)}, ${Math.round(s.z2 ?? s.z)}, `
        + `its surface ${run}, its bed ${m1(depthOf(s))} m under it`
        + (s.chained ? ', running on from the river before it, which is where it took its level' : '');
      break;
    }
    case 'sea': body = `laid a sea ${r * 2} m across at ${at}, its surface at ${m1(levelOf(s))} m, cutting no bed: it floods the coast you sculpted and nothing else`; break;
    case 'drain': body = `drained the water inside ${r} m of ${at}, and moved no ground doing it`; break;
    /**
     * ED5. The metres and the count are NOT in this function, because this
     * function is handed a stroke and an eraser is a thing that happens to the
     * strokes under it: how much ground went back is the field before against
     * the field after, and how many strokes it masks is a walk of the list.
     * Both are measured by the caller and arrive as `extra`. What is said here
     * is only what the stroke itself says: where, how wide, and how soft.
     */
    case ERASE_KIND: body = `erased ${r} m of ground back to the flat at ${at}`; break;
    default: body = `${s.kind} at ${at}`;
  }
  const built = chunks == null ? '' : `, ${chunks} ${chunks === 1 ? 'chunk' : 'chunks'} of ground rebuilt`;
  // ED5: the falloff, said for EVERY brush that has one and not for the two it
  // was first written for. One case is never the case: a hardness slider that
  // reported itself on the paint brush and changed a mountain in silence is the
  // same silent state change twice.
  return `${body}${featherWords(s)}${extra}${built}${steep}`;
}
/**
 * The height a sculpt world USED to flood at, before ED4.
 *
 * `field.sampleAt` called a point water at `h < SEA_LEVEL - 0.05` and still
 * does in a generated world, so this is that same line rather than a round
 * number typed out again. It is only a reference now: nothing in a sculpt
 * world floods by height any more, and the words below quote it so a person
 * who dug a canyon expecting a lake is told where the lake would have been.
 */
export const OLD_WATER_LINE = SEA_LEVEL - 0.05;

/**
 * What a downward brush owes a person in a sculpt world, in words.
 *
 * PURE AND EXPORTED, so it can be measured. `lower`, `pit` and `valley` used to
 * flood the moment they crossed the water line and do not any more; saying
 * nothing about that would be the same bug in the other direction, where
 * somebody digs a canyon, expects a lake, and gets neither the lake nor a
 * reason. `floor` is read off the field AFTER the stroke, so it is the ground a
 * player would stand on.
 *
 * Empty for every other kind, for a generated world, and for a sculpt world
 * whose header asked the generator's coast back, because in that last one the
 * canyon really does fill.
 */
export function dryFloorWords(kind, floor, sculpt) {
  if (kind !== 'lower' && kind !== 'pit' && kind !== 'valley') return '';
  if (!sculpt || sculpt.sea) return '';
  if (!Number.isFinite(floor) || floor >= OLD_WATER_LINE) return '';
  return `, and the floor is ${m1(OLD_WATER_LINE - floor)} m under the old sea level, `
    + 'and stays dry: water is its own brush';
}

/**
 * What a water brush actually did to the water, in words, off a real sample.
 *
 * PURE AND EXPORTED for the same reason. `p` is `field.sampleAt` at the point
 * the stroke was made, taken after it was made, which is the same path a
 * player's feet take: a sea laid on ground that stands above its own surface is
 * a real stroke that puts no water anywhere, and a person who is not told that
 * has a brush that looks broken.
 */
export function placedWaterWords(s, p) {
  if (s.kind === 'drain') {
    return p.water
      ? ', though there is still water at that point: something else reaches it'
      : ', and there is no water there now';
  }
  if (!p.water) {
    return `, but no water stands at that point: the ground there is ${m1(p.h)} m `
      + `and the surface you asked for is ${m1(levelOf(s))} m`;
  }
  return `, and the water there stands ${m1(p.waterLevel - p.h)} m deep`;
}

/**
 * What an eraser actually did, in words, off two samples and a count.
 *
 * PURE AND EXPORTED, and it takes the numbers rather than taking them, because
 * every one of them has to be MEASURED by the caller at the right moment: the
 * height at the point before the stroke and after it, and how many earlier
 * strokes the ring really reaches. An eraser that says "erased" and nothing
 * else is indistinguishable from an eraser that found nothing to erase, and
 * over flat ground that is exactly what it usually did.
 */
export function eraseWords(before, after, masked) {
  const moved = Math.abs(before - after);
  const ground = moved > 0.005
    ? `, the ground under it back ${m1(moved)} m`
    : ', and the ground under it did not move';
  const strokes = masked > 0
    ? `, ${masked} ${masked === 1 ? 'stroke' : 'strokes'} masked`
    : ', with no stroke of yours under it';
  return `${ground}${strokes}`;
}

/** How often the sky is baked into the reflection everything metal reads. */
const ENV_EVERY_MS = 15000;

// The world beyond the open realms is being built and a player is held out of
// it (src/mmo/release.js). Checked twice a second on the surface, never in a
// dungeon, never in dev mode, so the tour and the fly camera go anywhere. A
// character loaded from a save that stands on closed ground is brought home
// once, with words, so a Boneyard save does not wake in a realm that is shut.
let gateAt = -Infinity, gateSaidAt = -Infinity, gateChecked = false;
function gate(ctx, frame) {
  if (!ctx.has('player')) return;
  const world = ctx.get('world');
  if (world.runtime.inDungeon) return;
  if (ctx.has('dev') && ctx.get('dev').on) return;
  const now = frame.now;
  if (now - gateAt < 500) return;
  gateAt = now;
  const player = ctx.get('player');
  const p = player.pos || player.actor?.pos || frame.centre;
  if (openAt(p.x, p.z)) { gateChecked = true; return; }
  if (!gateChecked) {
    // the first look after a load: a save standing outside comes home
    gateChecked = true;
    const birth = birthplaceFor(world.runtime.field);
    player.teleport(birth.x, birth.z);
    ctx.hud?.toast?.('The road you were on is not open yet, and you wake on the green at Hearthhome instead.', 'bad');
    ctx.hud?.log?.(GATE_LINE, 'bad');
    return;
  }
  const back = insidePoint(p.x, p.z);
  player.teleport(back.x, back.z);
  if (now - gateSaidAt > GATE_SAY_EVERY_MS) { gateSaidAt = now; ctx.hud?.toast?.(GATE_LINE, 'bad'); }
}

export const world = {
  name: 'world',
  deps: [],

  create(ctx) {
    const { sc, hud, audio, state } = ctx;

    // The particle pool belongs to the abilities system, which is built after
    // this one, so the world gets a proxy that finds it when it is asked.
    const effectsLater = new Proxy({}, {
      get(_, key) {
        const e = ctx.has('abilities') ? ctx.get('abilities').effects : null;
        const v = e ? e[key] : undefined;
        return typeof v === 'function' ? v.bind(e) : v;
      },
    });
    const runtime = createWorldRuntime(sc, { homeBiome: 'meadow', effects: effectsLater });
    // the analytic sky and the ocean sheet share one shader block; the water
    // reads the sky's sun and palette, and scene.js takes its fog colour from it
    const sky = createSky(sc);
    const water = createWater(sc, runtime.field, { sky });
    // a coast, not the open ocean: at 0.30 a crest stood 0.7 m over sea level and
    // broke through any meadow that sits half a metre above the water line
    if (water.uniforms?.uWaveH) water.uniforms.uWaveH.value = 0.14;
    sc.useAnalyticSky(true);
    let wasUnder = false;

    // Metals and water need something to reflect. The sky dome is rendered into
    // a prefiltered environment every ENV_EVERY_MS, so a blade at dusk reflects
    // a dusk sky and not a studio. The dome is borrowed for the render and put
    // straight back.
    const pmrem = new THREE.PMREMGenerator(sc.renderer);
    const envScene = new THREE.Scene();
    let envAt = -1e9, envRT = null;
    function refreshEnvironment(now, force = false) {
      if (!force && now - envAt < ENV_EVERY_MS) return false;
      envAt = now;
      const dome = sky.group || sc.scene.children.find((o) => o.name === 'sky' && o !== sc.sky);
      if (!dome) return false;
      const parent = dome.parent, pos = dome.position.clone();
      dome.position.set(0, 0, 0);
      envScene.add(dome);
      const rt = pmrem.fromScene(envScene, 0, 0.1, 50);
      parent.add(dome);
      dome.position.copy(pos);
      if (envRT) envRT.dispose();
      envRT = rt;
      sc.scene.environment = rt.texture;
      // the sky's light on shaded sides. At 0.55 a cloak seen from the north
      // at noon went to black; 0.9 reads as a bright day's sky filling the shade
      if ('environmentIntensity' in sc.scene) sc.scene.environmentIntensity = 0.9;
      return true;
    }

    // The underground reports where you are and what is there. Nothing here is a
    // promise: a cave has no stair, and the copy must not say it has one.
    let lastInside = null;
    let lastEdgeLine = -1e9;

    function nearestSettlement() {
      const p = ctx.get('player').pos;
      let best = null, bestD = Infinity;
      for (const s of runtime.sitesNear(p.x, p.z, 900)) {
        if (s.kind !== 'town' && s.kind !== 'hamlet') continue;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    }

    /** The two walls the player is never allowed through, in that order. */
    function keepInside(pos, now) {
      // the continent ends in deep water: the sea floor is walkable, the edge is not
      if (!runtime.inDungeon) {
        const edge = clampToWorld(pos.x, pos.z);
        if (edge.moved) {
          pos.x = edge.x; pos.z = edge.z;
          if (now - lastEdgeLine > 4000) { lastEdgeLine = now; hud.toast('the sea, and no way across it'); }
        }
      }
      // underground the walls are the edge of the world
      const [cx, cz] = runtime.clampWalkable(pos.x, pos.z);
      if (cx !== pos.x || cz !== pos.z) {
        pos.x = cx; pos.z = cz;
        pos.y = runtime.heightAt(cx, cz);
      }
    }

    // underground the camera stays inside the room: dungeon.js walks the grid
    // from the player to the eye and stops it short of the first rock cell
    function clampCamera(playerPos) {
      if (!runtime.inDungeon) return;
      const L = runtime.dungeonLayout();
      const c = cameraClamp(L, sc.camera.position, playerPos);
      if (c.moved) {
        sc.camera.position.set(c.x, c.y, c.z);
        sc.camera.lookAt(playerPos.x, playerPos.y + CAMERA_EYE, playerPos.z);
      }
    }

    /** Hooked in `ready`, because every one of these writes to the document. */
    function listen() {
      const character = ctx.character;
      if (!Array.isArray(character.zones)) character.zones = [];
      if (!Array.isArray(character.discovered)) character.discovered = [];
      // discovery reads this character's record, not the browser-wide keys, so
      // a second character in the roster starts knowing nothing
      runtime.adoptDiscovery?.(character);

      runtime.onZone((zone) => {
        hud.zone?.(zone.name, zoneSub(zone));
        hud.toast(zone.line);
        if (!character.zones.includes(zone.id)) { character.zones.push(zone.id); state.touch('zones'); }
        audio.play('discover');
      });

      runtime.onDiscover((s) => {
        hud.toast(`you found <b>${s.name}</b>, ${s.article}`, 'good');
        if (Array.isArray(character.discovered) && !character.discovered.includes(s.id ?? s.name)) {
          character.discovered.push(s.id ?? s.name);
          state.touch('discovered');
        }
        // not positioned: a site is found from up to 70 m off, and the discovery
        // belongs to you rather than to the place
        audio.play('discover');
      });

      runtime.onDungeonState((st) => {
        const player = ctx.get('player');
        const { combat, monsters } = ctx.get('combat');
        lastInside = st.inside ? st : null;
        // a level is built at the origin and the mouth you came out of is a
        // kilometre away, so the camera has to jump with the player or it spends
        // several seconds flying across the world to catch up
        if (st.at) {
          player.teleport(st.at.x, st.at.z);
          state.setPos(player.pos.x, player.pos.z);
          combat.forget(player.actor);
          monsters.rescan(player.pos.x, player.pos.z, ctx.isNight(performance.now()));
        }
        if (st.inside) audio.play('enterCave');
        if (!st.inside) {
          hud.toast(`back above ground at <b>${st.site.name}</b>`, 'good');
          return;
        }
        const where = st.level > 1 ? `<b>${st.site.name}</b>, level ${st.level}` : `<b>${st.site.name}</b>`;
        const ways = st.bottom
          ? 'Nothing goes deeper than this. The pale steps climb out.'
          : 'The black stair goes deeper, the pale steps climb out.';
        const spoil = st.kind === 'cave'
          ? (st.ore ? ` ${st.ore} seams in the rock: swing the pickaxe.` : '')
          : (st.chests ? ` ${st.chests} boxes down here, and a pick opens the locked ones.` : '');
        hud.toast(`${where}. ${ways}${spoil}`);
      });
    }

    // ---- the hand cut ground: what the editor calls ---------------------
    //
    // `window.__bw.terrain` is the whole contract between the two halves of the
    // editor. The placement half (src/game/editor) never touches the field, the
    // stream or the stroke list: it calls these, and every one of them does the
    // work, rebuilds what it moved, and hands back the words it earned.
    //
    // ED3 added `kinds`, `base`, `mode`, `baseWords`, `setBase` and `reset`, and
    // `kinds()` is the one that matters most: the palette is built out of it, so
    // a brush the module clamps is a slider the palette clamps, and a kind added
    // to `terrain_edits.js` is a brush that appears without anybody editing the
    // editor. See docs/mmo/wiring/ED3-SCULPT.md.
    //
    // Every stroke is logged. A silent state change is indistinguishable from a
    // broken button, and a brush that moved four chunks of ground in silence is
    // exactly that.
    const say = (text, tone) => { try { hud.log?.(text, tone); } catch { /* no hud in a test */ } };

    /**
     * The bearing a stroke that needs one gets when the caller did not say.
     *
     * Four kinds need one and all four are handled: a cliff's step, a cave's
     * mouth, and the line a ridge or a valley is drawn along. A ridge with no
     * bearing would run due north for its whole length, which is a range nobody
     * asked for, so it runs the way the player is looking instead.
     */
    function yawFor(kind, x, z) {
      if (kind === 'cave') {
        // a mouth opens out of the hillside, which is the rule field.js already
        // uses for every rolled cave in the world
        const down = runtime.field.downhillAt(x, z);
        if (Number.isFinite(down)) return down;
      }
      const p = ctx.has('player') ? ctx.get('player') : null;
      const yaw = p && (p.actor ? p.actor.yaw : p.yaw);
      return Number.isFinite(yaw) ? yaw : 0;
    }

    // ---- ED4: the water somebody placed, and the water nobody did ---------
    //
    // Two jobs, both of them second order effects of "no height makes water any
    // more", and both of them things a player would otherwise find out the hard
    // way.

    /**
     * The scene's water made to match the stroke list, and what it cost.
     *
     * THE GLOBAL PLANE GOES AWAY in a sculpt world with no sea in its header,
     * and that is not a tidy up: leave it on and the first pit anybody digs to
     * -10 m has the ocean at the bottom of it, which is the whole complaint ED4
     * was opened for, still there in the picture after the field stopped saying
     * it. Measured by `water.globalPlane` in world_runtime.test.mjs.
     */
    function syncWater() {
      const sculpt = runtime.field.sculpt;
      water.setGlobalPlane(!sculpt || !!sculpt.sea);
      return water.setBodies(runtime.terrainEdits.waterBodies());
    }
    runtime.onRebuild(syncWater);
    syncWater();

    /** The two above, asked of the real field at the point the stroke was made. */
    const waterWords = (s) => placedWaterWords(s, runtime.field.sampleAt(s.x, s.z));
    const dryWords = (s) => dryFloorWords(s.kind, runtime.field.heightAt(s.x, s.z), runtime.field.sculpt);

    const terrain = {
      /**
       * Lay one stroke down, put the ground back up around it, and say what it
       * did. Returns the words. Throws only on a stroke nobody can read, which
       * is what the editor's own catch reports.
       */
      stroke(input) {
        const edits = runtime.terrainEdits;
        const kind = input && input.kind;
        const req = { ...input };
        if (NEEDS_YAW.has(kind) && !Number.isFinite(req.yaw)) req.yaw = yawFor(kind, req.x, req.z);
        // ED5: the ground BEFORE the eraser, taken through the same field a
        // player's feet take, so the metres the words quote are metres of the
        // world and not of a profile somebody worked out on paper.
        const was = kind === ERASE_KIND && Number.isFinite(req.x) ? runtime.field.heightAt(req.x, req.z) : 0;
        const s = edits.stroke(req);
        const did = runtime.rebuildAround(s.x, s.z, reachOf(s) + REBUILD_MARGIN);
        let extra = isWaterKind(s.kind) ? waterWords(s) : dryWords(s);
        if (s.kind === ERASE_KIND) extra = eraseWords(was, runtime.field.heightAt(s.x, s.z), edits.maskedBefore(s));
        if (s.kind === 'cave') {
          const site = runtime.sitesNear(s.x, s.z, 4).find((p) => p.id === `edit:cave:${s.id}`);
          const spec = EDIT_CAVE_SPEC[site ? site.size : 'medium'];
          extra = site
            ? `, ${site.size}, ${spec.levels} ${spec.levels === 1 ? 'level' : 'levels'} of cavern under it, E at the mouth to go in`
            : ', but no mouth stands there: the cave did not register';
        }
        const text = strokeWords(s, did.chunks, extra);
        say(text);
        return text;
      },

      /**
       * Take the last STEP back. False when there was nothing to take.
       *
       * A step is usually one stroke. `reset` is a step too, of however many it
       * dropped, so taking a reset back is one undo, it puts the whole world on
       * again, and it rebuilds everything rather than a circle round a point
       * that a thousand strokes were never inside.
       */
      undo() {
        const s = runtime.terrainEdits.undo();
        if (!s) { say('there is no terrain stroke left to take back'); return false; }
        if (s.kind === 'reset') {
          const did = runtime.rebuildAll();
          const text = `put back the ${s.restored} ${s.restored === 1 ? 'stroke' : 'strokes'} the reset dropped, `
            + `${did.chunks} ${did.chunks === 1 ? 'chunk' : 'chunks'} of ground rebuilt`;
          say(text);
          return text;
        }
        const did = runtime.rebuildAround(s.x, s.z, reachOf(s) + REBUILD_MARGIN);
        const text = `took back the ${s.kind} at ${Math.round(s.x)}, ${Math.round(s.z)}, ${did.chunks} ${did.chunks === 1 ? 'chunk' : 'chunks'} of ground rebuilt`;
        say(text);
        return text;
      },

      /** Put the last undone step back. False when there was none. */
      redo() {
        const s = runtime.terrainEdits.redo();
        if (!s) { say('there is no terrain stroke waiting to come back'); return false; }
        if (s.kind === 'reset') {
          const did = runtime.rebuildAll();
          const text = `dropped the ${s.dropped} ${s.dropped === 1 ? 'stroke' : 'strokes'} again, `
            + `${did.chunks} ${did.chunks === 1 ? 'chunk' : 'chunks'} of ground rebuilt`;
          say(text);
          return text;
        }
        const did = runtime.rebuildAround(s.x, s.z, reachOf(s) + REBUILD_MARGIN);
        const text = strokeWords(s, did.chunks, ', again');
        say(text);
        return text;
      },

      /**
       * Write the list to public/terrain/greenwold.json through the dev
       * server's own endpoint. Throws when there is no endpoint, because a save
       * that did not happen must not read like one that did.
       */
      async save(path = TERRAIN_SAVE_PATH) {
        const edits = runtime.terrainEdits;
        const json = edits.serialize();
        let res;
        try {
          res = await fetch(EDITOR_SAVE_URL, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path, json }),
          });
        } catch (err) {
          throw new Error(`nothing was written: ${EDITOR_SAVE_URL} could not be reached (${err && err.message}). It only exists on the dev server.`);
        }
        if (!res || !res.ok) {
          throw new Error(`nothing was written: ${EDITOR_SAVE_URL} answered ${res ? res.status : 'nothing'}. It only exists on the dev server.`);
        }
        const caves = edits.caves().length;
        const text = `${json.strokes.length} ${json.strokes.length === 1 ? 'stroke' : 'strokes'} written to ${path}`
          + (caves ? `, ${caves} of them ${caves === 1 ? 'a cave' : 'caves'}` : '')
          + `, and the world loads it at ${TERRAIN_FILE} next boot`;
        say(text);
        return text;
      },

      /** Every stroke on the ground right now, as plain rows. */
      list() { return runtime.terrainEdits.serialize().strokes; },
      /** The five brushes that place water, so a caller need not hold its own list. */
      waterKinds: WATER_KINDS.slice(),
      /** Every body of water somebody placed, exactly as water.js draws them. */
      water() { return runtime.terrainEdits.waterBodies(); },
      /** Whether there is water at a point, and what its surface stands at. */
      waterAt(x, z) {
        const p = runtime.field.sampleAt(x, z);
        return { water: p.water, level: p.waterLevel, ground: p.h };
      },
      /** Make the scene's water match the list again. Returns what it built. */
      syncWater,
      /** How many strokes, and how many caves among them. */
      count() {
        const e = runtime.terrainEdits;
        return { strokes: e.count, caves: e.caves().length, undone: e.undoneCount };
      },
      /** The words a `ground` stroke will take. */
      words: GROUND_WORDS.slice(),

      // ---- ED3: the brushes, the base and the reset ---------------------
      /**
       * EVERY BRUSH, WITH ITS SLIDERS, so the editor's palette is built out of
       * this and not out of a second copy of the same numbers.
       *
       * `[{ kind, label, params: [{ name, min, max, step, default }], words? }]`,
       * straight out of `terrain_edits.KIND_PARAMS`, fresh objects every call
       * because the caller is a UI and a UI writes to what it is handed. A
       * brush the module clamps is clamped by the module and reported by the
       * module, so a slider that goes to 600 is a slider whose 600 arrives.
       */
      kinds() { return strokeKinds(); },
      /** What the flat world is: `{ height, ground, snowLine, beachLine }`. */
      base() { return runtime.terrainEdits.base(); },
      /** 'sculpt' or 'generate'. What kind of world the field is handing back. */
      mode() { return runtime.terrainEdits.mode; },
      /** The words a whole world may be made of, which is shorter than `words`. */
      baseWords: BASE_GROUNDS.slice(),
      /**
       * Say what the flat world is, and rebuild everything that is loaded.
       *
       * Everything, and not a circle: a base height is under every chunk in the
       * ring. Says what changed and what it cost, and says so even when nothing
       * changed, because a setting that was already what you asked for should
       * not read like one that was refused.
       */
      setBase(patch) {
        const did = runtime.setBase(patch);
        const text = did.changed.length
          ? `${did.changed.join(', ')}, ${did.chunks} ${did.chunks === 1 ? 'chunk' : 'chunks'} of ground rebuilt`
          : `the base was already ${did.base.height} m of ${did.base.ground}, snow at ${did.base.snowLine} m, beach under ${did.base.beachLine} m, in ${did.mode} mode: nothing moved`;
        say(text);
        return text;
      },
      /**
       * Every stroke off the ground, in ONE step that `undo` puts back.
       *
       * The count is read off the list it emptied, not off anything it was
       * told, and it is said before the rebuild so a reset that moved nothing
       * says so rather than looking like a button that did not work.
       */
      reset() {
        const did = runtime.terrainEdits.reset();
        if (!did.dropped) { say('there was nothing on the ground to reset'); return false; }
        const built = runtime.rebuildAll();
        const text = `dropped all ${did.dropped} ${did.dropped === 1 ? 'stroke' : 'strokes'}`
          + (did.caves ? `, ${did.caves} of them ${did.caves === 1 ? 'a cave' : 'caves'}` : '')
          + `, ${built.chunks} ${built.chunks === 1 ? 'chunk' : 'chunks'} of ground rebuilt. One undo puts them all back`;
        say(text);
        return text;
      },
      /** Put the ground back up around a point, without laying anything down. */
      rebuildAround: (x, z, r) => runtime.rebuildAround(x, z, r),
      get runtime() { return runtime; },
      get edits() { return runtime.terrainEdits; },
    };

    // a file on disk says so once, when it lands, with the numbers it moved
    runtime.onTerrain((info) => {
      // what the strokes hold, counted, and not "no hills, no rivers, no roads"
      // typed once for a blank canvas and read out over a sculpted realm
      const rows = runtime.terrainEdits?.serialize().strokes || [];
      const n = (pred) => rows.reduce((c, s) => c + (pred(s) ? 1 : 0), 0);
      const hills = n((s) => s.kind === 'mountain' || s.kind === 'ridge' || s.kind === 'raise' || s.kind === 'cliff');
      const rivers = n((s) => s.kind === 'river');
      const lakes = n((s) => s.kind === 'lake' || s.kind === 'pond' || s.kind === 'sea');
      const roads = n((s) => s.kind === 'ground' && (s.word === 'path' || s.word === 'cobble'));
      const paints = n((s) => s.kind === 'ground');
      const held = rows.length
        ? `${hills ? `${hills} hill strokes` : 'no hills'}, ${rivers ? `${rivers} river ribbons` : 'no rivers'}, `
          + `${lakes ? `${lakes} still waters` : 'no lakes'}, ${roads ? `${roads} road strokes in ${paints} paints` : 'no roads'}`
        : 'no hills, no rivers, no roads';
      say(`the hand cut ground loaded: ${info.strokes} ${info.strokes === 1 ? 'stroke' : 'strokes'}`
        + (info.caves ? `, ${info.caves} of them ${info.caves === 1 ? 'a cave' : 'caves'}` : '')
        + (info.base
          ? `, and the file says sculpt: a base of ${info.base.height} m of ${info.base.ground}, `
            + `snow above ${info.base.snowLine} m, beach under ${info.base.beachLine} m, `
            + `${held}, nothing rolled and nothing scattered`
          : '')
        + `, ${info.chunks} ${info.chunks === 1 ? 'chunk' : 'chunks'} of ground rebuilt`);
    });

    return {
      runtime, sky, water, terrain,
      refreshEnvironment, nearestSettlement, keepInside, clampCamera, listen,
      heightAt: (x, z) => runtime.heightAt(x, z),
      /** The day, at any instant of the WORLD clock. One place, so it agrees. */
      dayFactor: (nowMs) => sc.dayFactor(nowMs),
      get lastInside() { return lastInside; },
      get underwater() { return wasUnder; },

      bw: { runtime, sky, water, refreshEnvironment, terrain },

      /**
       * The picture, and only ever last.
       *
       * THE WORLD CLOCK. The sky, the sea and the day belong to the world, so
       * every one of them reads `worldDt / worldNow / worldNowS` and the day
       * factor is taken from `worldNow` rather than from the frame's own `day`,
       * which main.js computes off the player's clock. In ordinary time the two
       * are the same number; in dragon time the sun and the swell hang with
       * everything else. docs/mmo/wiring/D2.md lists every call by name.
       */
      draw(frame) {
        const dt = frame.worldDt ?? frame.dt;
        const now = frame.worldNow ?? frame.now;
        const nowS = frame.worldNowS ?? frame.nowS;
        const day = sc.dayFactor(now);
        const { centre } = frame;
        // sky first, then the water that reflects it; both centre on the eye
        sky.update(day, sc.camera.position, dt, now);
        sc.setSunDir(sky.shadowDir);
        refreshEnvironment(now);
        water.update(dt, sc.camera.position, sky.sunDir, sky.colours, nowS);
        if (!runtime.inDungeon && water.underwater !== wasUnder) {
          wasUnder = water.underwater;
          if (wasUnder) sc.setFog(0.5, 45, 0x0b3550);
          else sc.setFog(90, 536);
        }
        sc.follow(centre);
        sc.setDay(day);
        water.beforeRender(sc.renderer, sc.scene, sc.camera);   // the refraction pass, right before the frame
        // The PLAYER'S dt, not the world's, and deliberately: the only thing
        // that reads it is the spell pass in scene.js, and a spell is the
        // player's, so its heat shimmer does not hang in dragon time either.
        // A frame with no spell alive takes the same plain render it always did.
        sc.render(frame.dt);
      },
    };
  },

  ready(ctx) { ctx.get('world').listen(); },

  // The world streams on the WORLD clock: chunks, fauna, weather and the
  // dungeon's own timers all belong to the world and hang with it in dragon
  // time. `frame.centre` is still the eye's real position, because the eye is
  // the player's and the player never slows.
  update(ctx, frame) {
    const self = ctx.get('world');
    const now = frame.worldNow ?? frame.now;
    self.runtime.update(frame.worldDt ?? frame.dt, now, frame.centre.x, frame.centre.z, self.dayFactor(now));
    gate(ctx, frame);
  },

  render(ctx, frame) { ctx.get('world').draw(frame); },
};
