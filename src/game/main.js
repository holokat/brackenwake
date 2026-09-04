// Brackenwake boots here.
//
// This is the only file that knows all the modules. Everything else talks
// through the surfaces in docs/GAME-CONTRACT.md, so the order below is the
// whole of the wiring:
//
//   scene -> state.load -> runtime -> hud -> audio -> player -> camera
//   -> input -> interact -> shop -> dev
//
// and the frame is
//
//   input -> dev or player -> camera -> runtime.update -> interact.update
//   -> sc.follow -> sc.setDay -> render -> input.endFrame
//
// The world clock is real time: performance.now() through the six minute day
// curve in scene.js. Nothing about the sky is saved, so a reload puts you back
// under whatever sky the clock says it is.

import * as THREE from 'three';
import { createScene } from './scene.js';
import { createWorldRuntime } from './world_runtime.js';
import { createHud, TOOLS } from './hud.js';
import { createDev } from './dev.js';
import { createState } from './state.js';
import { createPlayer } from './player.js';
import { createFollowCamera } from './camera.js';
import { createInput } from './input.js';
import { createInteract } from './interact.js';
import { createShop } from './shop.js';
import { createAudio } from './audio.js';
import { createFloaters } from './floaters.js';

const SAVE_EVERY_MS = 5000;
/** How close a place has to be before the HUD calls this spot by its name. */
const PLACE_RADIUS = 90;
/** Reach for E, matched to interact's own REACH when it declares one. */
const DEFAULT_REACH = 6;

const BIOME_NAMES = {
  ocean: 'open water', beach: 'the shore', meadow: 'open meadow',
  boreal: 'pine woods', desert: 'dry country', sakura: 'blossom country',
  mountain: 'high ground', snow: 'the snowline',
};

function boot() {
  const container = document.getElementById('game') || document.body;
  const hudRoot = document.getElementById('hud') || document.body;

  const sc = createScene(container);
  const state = createState();
  state.load();

  const runtime = createWorldRuntime(sc, { homeBiome: 'meadow' });
  const hud = createHud(hudRoot);

  // Sound. Browsers refuse audio until the player clicks or presses a key;
  // createAudio listens for that itself, so there is nothing to unlock here.
  const audio = createAudio();
  // numbers that fly off things; gains, damage and falls all go through here
  const floaters = createFloaters(sc, hudRoot);

  const player = createPlayer(sc.scene);
  // First boot: no site stands within the streamed ring of the origin, so a new
  // player would face empty meadow with nowhere to walk to. Spawn instead a
  // short walk outside the nearest settlement, on the side facing the origin.
  let faceTo = null;
  if (!state.pos.x && !state.pos.z) {
    const towns = runtime.sitesNear(0, 0, 4000).filter((s) => s.kind === 'town' || s.kind === 'hamlet')
      .sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
    if (towns.length) {
      const t = towns[0];
      const d = Math.hypot(t.x, t.z) || 1;
      const off = t.flatR + 22;
      state.setPos(t.x - (t.x / d) * off, t.z - (t.z / d) * off);
      faceTo = t;
      hud.toast(`you wake a short walk from <b>${t.name}</b>, ${t.article}`);
    }
  }
  player.teleport(state.pos.x || 0, state.pos.z || 0, (x, z) => runtime.heightAt(x, z));

  // the kit is chosen from where you actually woke up, not from the origin
  audio.music.setBiome(runtime.field.sampleAt(player.pos.x, player.pos.z).biome);
  audio.music.start();

  // input comes before the camera: createFollowCamera takes it, so the boot
  // order in the contract is read as "the camera rig, and the input it needs"
  const input = createInput(sc.renderer.domElement);
  const camera = createFollowCamera(sc.camera, input);
  // the first thing a new player sees is the settlement, not its back
  if (faceTo) camera.yaw = Math.atan2(faceTo.x - player.pos.x, faceTo.z - player.pos.z);
  camera.snap?.(player.pos);            // start on the orbit, not flying in to it

  const interact = createInteract({ sc, runtime, player, state, hud, input, audio });
  const shop = createShop({
    state, hud, audio,
    nearestSettlement: () => nearestSettlement(),
  });
  const dev = createDev({ sc, camera, player, hud, runtime, state });

  // ------------------------------------------------------------- the HUD --
  const drawHud = () => {
    hud.setCoins(state.coins);
    hud.setMaterials(state.materials, state.caps);
    // in dev mode every slot is live, so the bar shows what the game will let
    // you hold rather than what is in the purse
    hud.setTool(state.tool, state.dev ? new Set(['axe', 'pickaxe', 'bow']) : state.tools);
  };
  state.onChange(drawHud);
  drawHud();
  hud.onTool?.((id) => pickTool(id));

  function pickTool(id) {
    if (id !== 'hand' && !state.tools.has(id)) {
      hud.toast(`you do not own a ${id} yet. The market in town sells one.`, 'bad');
      return false;
    }
    if (state.tool === id) return true;
    state.tool = id;
    hud.toast(id === 'hand' ? 'bare hands' : `${id} in hand`);
    return true;
  }

  // ---------------------------------------------------------- the world ----
  runtime.onDiscover((s) => {
    hud.toast(`you found <b>${s.name}</b>, ${s.article}`, 'good');
    // not positioned: a site is found from up to 70 m off, and the discovery
    // belongs to you rather than to the place
    audio.play('discover');
  });

  // The underground reports where you are and what is there. Nothing here is a
  // promise: a cave has no stair, and the copy must not say it has one.
  let lastInside = null;
  runtime.onDungeonState((st) => {
    lastInside = st.inside ? st : null;
    // a level is built at the origin and the mouth you came out of is a
    // kilometre away, so the camera has to jump with the player or it spends
    // several seconds flying across the world to catch up
    if (st.at) {
      player.teleport(st.at.x, st.at.z, (x, z) => runtime.heightAt(x, z));
      camera.snap?.(player.pos);
      state.setPos(player.pos.x, player.pos.z);
    }
    // going under, and going deeper, are both going under. Climbing out has no
    // cue: nothing in the folder is a way opening onto daylight, and the toast
    // below already says where you came up.
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
      : (st.chests ? ` ${st.chests} chests down here, and no way into them yet.` : '');
    hud.toast(`${where}. ${ways}${spoil}`);
  });

  function nearestSettlement() {
    const p = player.pos;
    let best = null, bestD = Infinity;
    for (const s of runtime.sitesNear(p.x, p.z, 900)) {
      if (s.kind !== 'town' && s.kind !== 'hamlet') continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  // What the top of the screen calls this spot. A named place wins over the
  // biome, because a name is what a player can point at on the way back.
  let placeText = '';
  let placeCheck = -1e9;
  function updatePlace(nowMs) {
    // sitesNear walks 480 m cells; twice a second is plenty for a label that
    // only changes when you cross into somewhere with a name
    if (nowMs - placeCheck < 500) return;
    placeCheck = nowMs;
    const p = player.pos;
    let text;
    if (runtime.inDungeon && lastInside) {
      text = lastInside.level > 1 ? `${lastInside.site.name}, level ${lastInside.level}` : lastInside.site.name;
    } else {
      let best = null, bestD = Infinity;
      for (const s of runtime.sitesNear(p.x, p.z, PLACE_RADIUS)) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < bestD) { bestD = d; best = s; }
      }
      // the music follows the ground even when a place name is what is shown.
      // setBiome does nothing when the new biome shares a kit with the old one,
      // so a border does not restart the track.
      const sample = runtime.field.sampleAt(p.x, p.z);
      audio.music.setBiome(sample.biome);
      if (best) text = best.name;
      else text = BIOME_NAMES[sample.biome] || sample.biome;
    }
    if (text !== placeText) { placeText = text; hud.setPlace(text); }
  }

  // ------------------------------------------------------------- the keys --
  const REACH = interact.REACH ?? DEFAULT_REACH;

  function onHotkeys() {
    if (input.pressed('f1') || input.pressed('`')) dev.toggle();
    // fly mode flies on E and Q. Handing E to the interact rules as well would
    // make every metre climbed also a swing at whatever the cursor is over.
    if (dev.on) return;
    for (let i = 0; i < TOOLS.length; i++) {
      if (input.pressed(TOOLS[i].key)) pickTool(TOOLS[i].id);
    }
    if (input.pressed('b')) toggleShop();
    // a mute with no confirmation is indistinguishable from a broken key
    if (input.pressed('m')) hud.toast(audio.toggleMusic() ? 'music on' : 'music off');
    if (input.pressed('n')) hud.toast(audio.toggleSfx() ? 'sound on' : 'sound off');
    if (input.pressed('e') && !shop.isOpen) doInteract();
  }

  function toggleShop() {
    shop.toggle();
  }

  /**
   * E. Whatever is in reach: a mouth to go into, an exit to take, or nothing,
   * and it says which. interact.js owns the rules, so E and a mouse click come
   * out at the same place; the fallback below only runs for a build of
   * interact.js that predates `enter()`.
   */
  function doInteract() {
    if (typeof interact.enter === 'function') return interact.enter();
    const p = player.pos;
    if (runtime.inDungeon) {
      const exits = (lastInside && lastInside.exits) || [];
      let best = null, bestD = Infinity;
      for (const e of exits) {
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best && bestD <= REACH) return runtime.dungeonGo(best.dir);
      hud.toast(best ? `the way out is ${Math.round(bestD)} m off` : 'no way out from here', 'bad');
      return null;
    }
    let best = null, bestD = Infinity;
    for (const s of runtime.sitesNear(p.x, p.z, 60)) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) { hud.toast('there is nothing to go into here'); return null; }
    if (bestD > REACH + (best.flatR || 0)) {
      hud.toast(`${best.name} is ${Math.round(bestD)} m off, walk to the mouth`, 'bad');
      return null;
    }
    if (best.kind === 'dungeon' || best.kind === 'cave') return runtime.enterDungeon(best);
    hud.toast(`${best.name}. Nothing to go into here yet.`);
    return null;
  }

  // ------------------------------------------------------------- the loop --
  let last = performance.now();
  let lastSave = last;
  let dead = false;

  // `manual` is the harness: __bw.step(ms) runs this same function with a
  // synthetic clock and no rAF, so a hidden tab can still be driven a frame at
  // a time. There is no second code path; the test path is the frame.
  function frame(now, manual = false) {
    if (dead) return;
    if (!manual) requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    onHotkeys();

    // a click goes to interact, which does the raycast version of E
    if (input.click && !shop.isOpen) interact.click();

    if (dev.on) {
      dev.update(dt);
    } else {
      const move = {
        x: (input.down('d') ? 1 : 0) - (input.down('a') ? 1 : 0),
        z: (input.down('w') ? 1 : 0) - (input.down('s') ? 1 : 0),
        sprint: input.down('shift'),
        jump: input.down(' '),
        yaw: camera.forwardYaw,
      };
      player.update(dt, move, (x, z) => runtime.heightAt(x, z));
      // a landing from height is announced in orange; when health exists the
      // combat runtime charges for it (docs/mmo/02-COMBAT.md: (m - 4) * 6)
      if (player.landed && player.landed.fallMetres > 4) {
        const m = player.landed.fallMetres;
        floaters.spawn(player.pos, `${m.toFixed(0)} m fall`, 'fall');
        hud.toast(m > 12 ? `a hard landing, ${m.toFixed(0)} m` : `you drop ${m.toFixed(0)} m and land on your feet`, m > 12 ? 'bad' : undefined);
        audio.play('land', { at: { x: player.pos.x, z: player.pos.z } });
      }
      // underground the walls are the edge of the world
      const [cx, cz] = runtime.clampWalkable(player.pos.x, player.pos.z);
      if (cx !== player.pos.x || cz !== player.pos.z) {
        player.pos.x = cx; player.pos.z = cz;
        player.pos.y = runtime.heightAt(cx, cz);
      }
      camera.update(dt, player.pos, (x, z) => runtime.heightAt(x, z));
      state.setPos(player.pos.x, player.pos.z);
    }

    // in fly mode the world streams around the camera, because that is what is
    // on screen; on the ground it streams around the player
    const centre = dev.on ? sc.camera.position : player.pos;
    // the ear goes where the eye is, before anything this frame can fire a cue
    audio.setListener(centre.x, centre.z);
    const day = sc.dayFactor(now);
    runtime.update(dt, now, centre.x, centre.z, day);
    interact.update(dt, now);
    updatePlace(now);

    floaters.update(dt);
    sc.follow(centre);
    sc.setDay(day);
    sc.render();
    input.endFrame();

    if (now - lastSave > SAVE_EVERY_MS) { lastSave = now; state.save(); }
  }
  requestAnimationFrame(frame);

  window.addEventListener('beforeunload', () => { state.save(); });
  window.addEventListener('pagehide', () => { state.save(); });

  window.__bw = { step: (ms = 16.7) => frame(last + ms, true), floaters, sc, runtime, player, camera, state, hud, dev, input, interact, shop, audio, THREE };
  hud.toast('WASD walks, drag to look, 1 to 4 pick a tool, E goes in, B is the market, M and N mute the music and the sound.');
  return window.__bw;
}

boot();
