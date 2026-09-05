// Brackenwake boots here.
//
// This is the only file that knows all the modules. Everything else talks
// through the surfaces in docs/GAME-CONTRACT.md and docs/mmo/07-RUNTIME-CONTRACT.md,
// and every agent's wiring note under docs/mmo/wiring/ says what it needs from
// this file. The boot order:
//
//   scene -> state.load -> runtime -> hud -> audio -> floaters -> input -> camera
//   -> (creation, if the character has never been chosen)
//   -> player -> actor -> progression -> combat -> loot -> monsters -> inventory
//   -> effects -> targeting -> abilities -> windows -> interact -> shop -> dev
//
// and the frame is the one in 07-RUNTIME-CONTRACT.md, with W4's two constraints:
// effects after the player's gait has posed the rig, abilities after the
// monsters and the combat resolver have had their turn.
//
// Two clocks. combat.js and the world run on performance.now() milliseconds;
// abilities and everything W4 wrote take seconds. `now` is ms and `nowS` is s,
// and nothing else is ever passed.

import * as THREE from 'three';
import { createScene } from './scene.js';
import { createWorldRuntime } from './world_runtime.js';
import { createHud } from './hud.js';
import { createDev } from './dev.js';
import { createState } from './state.js';
import { createPlayer, buildCharacter } from './player.js';
import { createFollowCamera } from './camera.js';
import { createInput } from './input.js';
import { createInteract } from './interact.js';
import { createShop } from './shop.js';
import { createAudio } from './audio.js';
import { createFloaters } from './floaters.js';
// wave two
import { playerActor as buildPlayerActor, spawnMonster, recompute, tickPools, syncToCharacter } from './actor.js';
import { createProgression } from './progression.js';
import { createCombat } from './combat.js';
import { createLootDrops } from './loot_drops.js';
import { createMonsters } from './monsters.js';
import { createInventory } from './inventory.js';
import { createWindows } from './windows.js';
import { createCreation } from './creation.js';
import { panel as characterPanel } from './win_character.js';
import { panel as bagPanel } from './win_bag.js';
import { panel as skillsPanel } from './win_skills.js';
import { panel as abilitiesPanel, setBarSlot, barOf } from './win_abilities.js';
import { unlockedFor } from '../mmo/abilities.js';
import { makeItem } from '../mmo/items.js';
import { createEffects } from './effects.js';
import { createTargeting } from './targeting.js';
import { createAbilities } from './abilities_runtime.js';
import { dressRig } from './gear_visuals.js';
import { createSky } from './sky.js';
import { createTargetRing } from './target_ring.js';
import { createPaperdoll } from './paperdoll.js';
import { createItemBar } from './item_bar.js';
import { labelFor as lootLabel } from './loot_drops.js';
import { createCompass } from './compass.js';
import { zoneSub, clampToWorld } from '../world/zones.js';
import { cameraClamp } from '../world/dungeon.js';
import { createWater } from '../world/water.js';
import { createForageField, seasonAt } from '../world/forage.js';
import { createForaging } from './foraging.js';
import { preloadRigs } from './rig_glb.js';
import { monsterModelIds } from './monster_models.js';
import { variantOf } from '../world/flora.js';
import { createNpcs } from './npcs_runtime.js';
import { createStations, STATION_REACH } from './stations.js';
import { panel as talkPanel } from './win_talk.js';
import { panel as tradePanel } from './win_trade.js';
import { panel as craftingPanel } from './win_crafting.js';
import { panel as mapPanel } from './win_map.js';
import { panel as settingsPanel, normalise as normaliseSettings } from './win_settings.js';
import { panel as devPanel, benchOf as devBenchOf } from './win_dev.js';
import { createSkinning } from './skinning.js';
import { createTradeNet } from './trade_net.js';

const SAVE_EVERY_MS = 5000;
/** How close a place has to be before the HUD calls this spot by its name. */
const PLACE_RADIUS = 90;
/** Reach for E, matched to interact's own REACH when it declares one. */
const DEFAULT_REACH = 6;
/** The world's night flag, the same threshold world_runtime hands fauna. */
const NIGHT_BELOW = 0.4;
/** How long the death screen holds before you wake. 06-ECONOMY-UI: "a 5 second count". */
const DEATH_S = 5;
/** Health you wake with, as a fraction of the maximum. */
const WAKE_HEALTH = 0.5;
/** Where the follow camera looks on the body, matching camera.js. */
const CAMERA_EYE = 1.5;

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
  const ENV_EVERY_MS = 15000;
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
    if ('environmentIntensity' in sc.scene) sc.scene.environmentIntensity = 0.55;
    return true;
  }
  const hud = createHud(hudRoot);

  // Sound. Browsers refuse audio until the player clicks or presses a key;
  // createAudio listens for that itself, so there is nothing to unlock here.
  const audio = createAudio();
  // numbers that fly off things; gains, damage and falls all go through here.
  // The size follows the settings window's text scale.
  const floaters = createFloaters(sc, hudRoot, { textScale: () => state.character?.settings?.textScale ?? 1 });

  // input comes before the camera: createFollowCamera takes it, so the boot
  // order in the contract is read as "the camera rig, and the input it needs"
  const input = createInput(sc.renderer.domElement);
  const camera = createFollowCamera(sc.camera, input);

  // A player who has never chosen anything, or one migrated from the old save,
  // picks an opening first. creation.js runs its own render loop over the
  // scene and removes itself before onDone, so the game loop waits for it.
  if (state.needsCreation) {
    createCreation(hudRoot, {
      sc, buildCharacter,
      onDone: (character) => {
        state.setCharacter(character);
        state.save();
        startGame();
      },
    });
    window.__bw = { sc, state, hud, audio, input, camera, THREE, creating: true };
    return window.__bw;
  }
  return startGame();

  function startGame() {
    const character = state.character;
    // the Blender monster rigs load in the background; a monster spawned before
    // its file lands wears its box and swaps in place when it does (V5.md)
    preloadRigs(monsterModelIds()).catch(() => {});
    // an old save's settings are filled in and clamped before anything reads them
    character.settings = normaliseSettings(character.settings);

    // the body is built from the chosen appearance; an old save without one gets the house default
    const player = createPlayer(sc.scene, character.appearance);
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
    const spawnPoint = { x: player.pos.x, z: player.pos.z };
    // A lantern's worth of warm light rides at the shoulder and comes up as the
    // day goes down, so the character is never a black cutout against a moonlit
    // field. Off by day, full at midnight.
    const lantern = new THREE.PointLight(0xffc082, 0, 9, 2);
    lantern.position.set(0.35, 1.7, 0.25);
    lantern.name = 'lantern';
    player.group.add(lantern);

    // the kit is chosen from where you actually woke up, not from the origin
    audio.music.setBiome(runtime.field.sampleAt(player.pos.x, player.pos.z).biome);
    audio.music.start();

    // the first thing a new player sees is the settlement, not its back
    if (faceTo) camera.yaw = Math.atan2(faceTo.x - player.pos.x, faceTo.z - player.pos.z);
    camera.snap?.(player.pos);            // start on the orbit, not flying in to it

    // ------------------------------------------------------------ the actor --
    // The actor and the model share one position object, so they can never be
    // in two places. Health, mana and stamina live on the actor during play and
    // are copied back to the document before every save (syncToCharacter).
    const actor = buildPlayerActor(character, { pos: player.pos });
    // gains go to the ticker bottom right when the HUD has one, so they never
    // sit over the label of what you just picked up; everything else floats
    const gainFloaters = {
      spawn: (pos, text, kind, extra) => (kind === 'gain' || kind === 'stat') && typeof hud.gain === 'function'
        ? hud.gain(text, kind) : floaters.spawn(pos, text, kind, extra),
      get count() { return floaters.count; },
    };
    const progression = createProgression({ character, actor, floaters: gainFloaters, hud, audio, state });
    // combat.js teaches by actor: (who, skill, difficulty, success). Only the
    // player has a document to learn into; a skeleton is never taught.
    const teach = {
      lesson: (who, skill, difficulty, success) => (who === actor ? progression.lesson(skill, difficulty, success) : null),
      statLesson: (who, stat) => (who === actor ? progression.statLesson(stat) : null),
    };
    const combat = createCombat({ floaters, hud, audio, progression: teach, recompute });
    const loot = createLootDrops(sc, { floaters, hud, audio });
    const monsters = createMonsters(sc, runtime, {
      // W2 calls actorFactory(id, { pos, key, row, rec }); W1's builder takes (id, pos)
      actorFactory: (id, o) => spawnMonster(id, o.pos),
      combat, loot, floaters, hud, audio,
      deadUntil: character.deadUntil,
      spawnPoint,
    });

    // abilities is built after inventory; the passives call binds late
    let abilities = null;
    // what is worn is on the body: the weapon in the right hand, the shield on
    // the left, every armour piece on its slot. The bow is drawn when the main
    // hand is empty and a bow is in the ranged slot, which is the same rule the
    // ranged abilities use.
    const dress = () => dressRig(player, character.equipment, { ranged: !character.equipment.mainHand && !!character.equipment.ranged });
    const inventory = createInventory({
      character, actor, recompute,
      onChange: (c, what) => { state.touch(what); if (what === 'equipment') { dress(); abilities?.applyPassives?.(); } },
      hud, audio, floaters,
      onSell: () => ({ ok: false, reason: 'nobody out here is buying; find a vendor in town' }),
      onDrop: (item) => loot.drop(player.pos, { items: [item], gold: 0 }),
    });

    // Every settler gets tools once: an axe, a pickaxe, a hunting bow with
    // arrows and a skinning knife, so chopping, mining, shooting and skinning
    // can be tried without a market first. Said once, then never again.
    // The flag would not survive hydrate, which keeps only the document's own
    // keys, so the pack itself is the record: a settler with no axe and no
    // pickaxe anywhere has not had the kit.
    const owns = (base) => character.pack.items.some((it) => it && it.base === base) || Object.values(character.equipment || {}).some((it) => it && it.base === base);
    if (!owns('axe') && !owns('pickaxe')) {
      const given = [];
      for (const [base, count] of [['axe', 1], ['pickaxe', 1], ['shortbow', 1], ['arrow', 40], ['skinning_knife', 1]]) {
        const r = inventory.add(makeItem({ base, count, rarity: 'common' }), { quiet: true });
        if (r && r.added) given.push(count > 1 ? `${count} arrows` : base.replace('_', ' '));
      }
      state.touch('pack');
      if (given.length) hud.log(`Your kit has a settler's tools in it: ${given.join(', ')}.`, 'good');
    }
    dress();
    const effects = createEffects(sc, { audio });
    // a weapon's hit effect bursts where it landed, in its colour
    combat.onHit?.(({ defender, colour, damage, fired }) => {
      if (!fired || !defender?.pos) return;
      effects.burst(defender.pos, colour, damage > 20 ? 1.4 : 1);
    });
    const targetRing = createTargetRing(sc);
    // Auto attack, the UO way: a single click on a monster looks at it, a
    // double click fights it until it or you is down, or you click the ground.
    let attacking = null;
    const ATTACK_LEASH = 30;
    const targeting = createTargeting(sc, input, monsters, {
      self: actor, hud,
      pos: () => player.pos,
      yaw: () => player.yaw,
      clearOnMiss: true,
    });

    // the window layer is built before the ability bar so `enabled` can ask it
    const ctx = {
      character, actor, inventory, state, hud, audio, floaters, runtime, player,
      sc, camera, combat, monsters, loot,
      windows: null,
      recompute: (who) => recompute(who || actor),
      onBarChange: () => { /* hud.update reads character.bar through barView every frame */ },
      onSkillLock: () => state.touch('skills'),
      applySettings: (s) => applySettings(s),
      newCharacter: () => { syncToCharacter(actor); state.clearSave?.(); location.reload(); },
      now: () => last,
      station: null,
      progression: null,
    };
    const windows = createWindows(hudRoot, input, ctx);
    ctx.windows = windows;
    for (const p of [characterPanel, bagPanel, skillsPanel, abilitiesPanel, talkPanel, tradePanel, craftingPanel, mapPanel, settingsPanel, devPanel]) windows.register(p);
    // A fresh character's bar is not left empty: what the opening already
    // unlocked goes on it in order, so the first fight has something on key 1.
    if (barOf(character).every((x) => !x)) {
      const ready = unlockedFor(character.skills, character.stats).filter((a) => !a.passive);
      ready.slice(0, 12).forEach((a, i) => setBarSlot(character, i, a.id));
      if (ready.length) hud.log(`${Math.min(12, ready.length)} abilities go on the bar: ${ready.slice(0, 12).map((a) => a.name).join(', ')}`);
    }
    ctx.progression = {
      // win_crafting teaches by document: (character, skillId, difficulty, success, rng)
      lesson: (c, skill, difficulty, success, rng) => progression.lesson(skill, difficulty, success, rng),
    };
    const npcs = createNpcs(sc, runtime, { buildCharacter, root: hudRoot, at: state.pos, ctx });
    const stations = createStations(sc, runtime, { hud });

    abilities = createAbilities({
      character, actor, input, combat, monsters, targeting, effects, floaters, hud, audio,
      player, camera, progression,
      heightAt: (x, z) => runtime.heightAt(x, z),
      enabled: () => !windows.anyOpen && !shop.isOpen && !dev.on && !dying,
      recompute: (who) => recompute(who || actor),
      rng: Math.random,
    });

    const interact = createInteract({ sc, runtime, player, state, hud, input, audio, progression, loot });
    const shop = createShop({
      state, hud, audio,
      nearestSettlement: () => nearestSettlement(),
    });
    const dev = createDev({ sc, camera, player, hud, runtime, state, monsters, floaters, loot });
    applySettings(character.settings);
    // the dev bench reaches everything through ctx; nothing here is a second path
    ctx.targeting = targeting; ctx.abilities = abilities; ctx.effects = effects;
    ctx.dev = dev; ctx.debug = dev.debug;

    // a knife on a body, and the trade channel between tabs
    const skinning = createSkinning({ monsters, inventory, progression, character, hud, audio, floaters, at: () => player.pos, rng: Math.random });
    const tradeNet = createTradeNet({ character, name: character.name, at: () => player.pos, now: () => performance.now(), hud });
    ctx.tradeNet = tradeNet;

    // what grows under the trees: mushrooms by the trunks, berries in the
    // clearings, honey on the bark. The trees are handed over as plain records.
    const treesFor = (cx, cz) => {
      const flora = runtime.flora;
      if (typeof flora?.treesFor === 'function') return flora.treesFor(cx, cz);
      const key = `${cx},${cz}`, out = [];
      for (const f of Object.values(flora?.kinds || {})) {
        if ((f.kind || 'tree') !== 'tree' || !f.variants?.length) continue;
        for (const t of f.trees || []) {
          if (t.chunk !== key || t.felledUntil) continue;
          const v = f.variants[variantOf(t, f.variants.length)];
          out.push({ x: t.x, z: t.z, radius: (v?.baseR ?? 0.35) * (t.s ?? 1) });
        }
      }
      return out;
    };
    const forage = createForageField(sc, { field: runtime.field, treesFor, season: seasonAt(Date.now()) });
    const foraging = createForaging({ field: forage, inventory, progression, hud, audio, floaters, character, actor, combat });
    ctx.foraging = foraging;
    ctx.forage = forage;
    // one likeness shared by the character sheet and the HUD portrait plate
    try {
      ctx.paperdoll = createPaperdoll(sc, () => player, { width: 244, height: 400 });
      hud.setPortrait?.(ctx.paperdoll.canvas);
    } catch (err) { console.warn('paperdoll not available', err); }
    ctx.useItem = (item, where) => foraging.useItem(item, where);
    // the item bar: eight slots on F5 to F12 for potions, food, weapons and tools,
    // kept apart from the ability bar so a sword and a spell never share a key
    const itemBar = createItemBar({
      character, inventory, input, hud,
      useItem: (item, where) => ctx.useItem(item, where),
      setTool: (id) => pickTool(id),
      enabled: () => !windows.anyOpen && !dying,
    });
    hud.onItem?.((slot, how) => (how === 'clear' ? itemBar.clear(slot) : itemBar.use(slot)));
    hud.onItemDrop?.((slot, payload) => itemBar.assign(slot, payload));
    tradeNet.onInvite((partner, peer) => {
      hud.log(`${peer?.name || 'somebody'} wants to trade.`);
      windows.open('trade', { partner });
    });

    // one raycaster for the things interact.js does not know about: monsters and sacks
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    function aim() {
      ndc.set(input.pointer?.x ?? 0, input.pointer?.y ?? 0);
      raycaster.setFromCamera(ndc, sc.camera);
      return raycaster;
    }

    // docs/mmo/wiring/W5.md section 6: every key and what it does here. Drag
    // inversion and sensitivity are applied to input.drag before the camera
    // reads it, each frame, from character.settings.
    function applySettings(s) {
      if (!s) return;
      if (Number.isFinite(s.music)) audio.setMusicVolume(s.music);
      if (Number.isFinite(s.sfx)) audio.setSfxVolume(s.sfx);
      if (typeof s.musicOn === 'boolean' && audio.musicOn !== s.musicOn) audio.toggleMusic();
      if (typeof s.sfxOn === 'boolean' && audio.sfxOn !== s.sfxOn) audio.toggleSfx();
      if (typeof s.shadows === 'boolean') {
        sc.renderer.shadowMap.enabled = s.shadows;
        if (sc.lights?.sun) sc.lights.sun.castShadow = s.shadows;
      }
      if (s.pixelRatio !== undefined) {
        sc.renderer.setPixelRatio(s.pixelRatio === 'device' ? (window.devicePixelRatio || 1) : 1);
        sc.resize?.();
      }
      if (Number.isFinite(s.ring) && typeof runtime.setRing === 'function') runtime.setRing(s.ring);
      if (Number.isFinite(s.grass) && typeof runtime.setGrass === 'function') runtime.setGrass(s.grass);
      if (typeof s.dev === 'boolean' && dev.on !== s.dev) dev.toggle();
      if (typeof s.hudScale === 'string') hud.setScale?.(s.hudScale);
    }
    function shapeDrag() {
      const st = character.settings || {};
      const k = Number.isFinite(st.sensitivity) ? st.sensitivity : 1;
      if (input.drag) {
        input.drag.dx *= k;
        input.drag.dy *= k * (st.invertDrag ? -1 : 1);
      }
    }

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
    // The tool row is click only. Keys 1 to 0, minus and equals belong to the
    // ability bar (07-RUNTIME-CONTRACT.md), and a key that did both would swing
    // and swap in one press.
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
    // the compass strip under the place plate: heading, and the map's waypoint
    const compass = createCompass(hudRoot, { player, camera, character });
    if (!Array.isArray(character.zones)) character.zones = [];
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
        combat.forget(actor);
        monsters.rescan(player.pos.x, player.pos.z, isNight(performance.now()));
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
    let placeSub = '';
    // frame timing for the dev badge: a one second rolling average
    let fpsFrames = 0, fpsAt = performance.now(), fps = 0;
    function tickFps(now) {
      fpsFrames++;
      if (now - fpsAt >= 1000) {
        fps = Math.round(fpsFrames * 1000 / (now - fpsAt));
        fpsFrames = 0; fpsAt = now;
        if (dev.on) hud.setDev(true, { fps, frameMs: +(1000 / Math.max(1, fps)).toFixed(1), draws: sc.renderer.info.render.calls, tris: sc.renderer.info.render.triangles, monsters: monsters.count, ...(dev.stats || {}) });
      }
    }
    function updatePlace(nowMs) {
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
        const sample = runtime.field.sampleAt(p.x, p.z);
        audio.music.setBiome(sample.biome);
        const zone = runtime.zoneNow?.(p.x, p.z);
        if (best) text = best.name;
        else if (zone) text = zone.name;       // a named region beats "meadow"
        else text = BIOME_NAMES[sample.biome] || sample.biome;
      }
      if (text !== placeText) {
        placeText = text; hud.setPlace(text);
        // the banner: a named place gets its kind, the open ground its biome
        const sample = runtime.field.sampleAt(p.x, p.z);
        placeSub = runtime.inDungeon ? 'underground' : (BIOME_NAMES[sample.biome] || sample.biome);
        hud.zone?.(text, placeSub);
      }
    }

    // -------------------------------------------------------------- death --
    // Red vignette, the words, a five second count, then you wake at the
    // nearest settlement with everything you carried. 06-ECONOMY-UI.md.
    let dying = null;
    const deathEl = document.createElement('div');
    deathEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;'
      + 'background:radial-gradient(ellipse at center, rgba(90,0,0,.35) 0%, rgba(40,0,0,.85) 100%);color:#f4f1ea;'
      + 'font:700 42px/1.2 "Segoe UI",system-ui,sans-serif;text-shadow:0 2px 8px #000;z-index:40;pointer-events:none';
    deathEl.innerHTML = '<div>You have died.</div><div class="bw-count" style="font-size:22px;margin-top:14px;opacity:.85"></div>';
    hudRoot.appendChild(deathEl);

    combat.onDeath((who, killer) => {
      if (who !== actor) {
        const m = monsters.forActor(who);
        if (m?.model) effects.die(m.model);
        return;
      }
      if (dying) return;
      dying = { left: DEATH_S, killer };
      effects.die(player);
      deathEl.style.display = 'flex';
      const by = killer?.name ? ` The ${killer.name} did it.` : '';
      hud.log(`You have died.${by}`, 'bad');
    });

    function wake() {
      const town = nearestSettlement();
      const p = player.pos;
      let x = p.x, z = p.z;
      if (town) {
        const d = Math.hypot(town.x - p.x, town.z - p.z) || 1;
        const off = (town.flatR || 26) + 10;
        x = town.x + ((p.x - town.x) / d) * off;
        z = town.z + ((p.z - town.z) / d) * off;
      }
      if (runtime.inDungeon) runtime.leaveDungeon();
      player.teleport(x, z, (hx, hz) => runtime.heightAt(hx, hz));
      camera.snap?.(player.pos);
      state.setPos(x, z);
      actor.health = Math.max(1, Math.round(actor.maxHealth * WAKE_HEALTH));
      actor.status = {};
      actor.dots = [];
      combat.forget(actor);
      monsters.rescan(x, z, isNight(performance.now()));
      deathEl.style.display = 'none';
      dying = null;
      const where = town ? `at the edge of <b>${town.name}</b>` : 'where you fell';
      hud.toast(`You wake ${where}, with ${actor.health} of ${actor.maxHealth} health and everything you carried.`, 'good');
      hud.log(`You wake ${town ? `at ${town.name}` : 'where you fell'}, ${actor.health} of ${actor.maxHealth} health.`);
    }

    // ------------------------------------------------------------- the keys --
    const REACH = interact.REACH ?? DEFAULT_REACH;
    const isNight = (nowMs) => sc.dayFactor(nowMs) < NIGHT_BELOW;

    function onHotkeys() {
      if (input.pressed('f1') || input.pressed('`')) dev.toggle();
      if (dev.on) return;
      if (dying) return;
      if (input.pressed('e') && !shop.isOpen && !windows.anyOpen) doInteract();
    }

    /**
     * E. Whatever is in reach: a mouth to go into, an exit to take, or nothing,
     * and it says which. interact.js owns the rules, so E and a mouse click come
     * out at the same place; the fallback below only runs for a build of
     * interact.js that predates `enter()`.
     */
    function doInteract() {
      // a sack within reach comes first: you bent down for it
      const bag = loot.nearest(player.pos, 3);
      if (bag) return loot.take(bag, takeLoot);
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

    /** What a sack hands over: everything the pack takes, and all the gold. */
    function takeLoot(items, gold) {
      // the sack does the talking: loot_drops floats the gold and each item by
      // rarity and says the whole take in one line, so the pack adds quietly
      const accepted = [];
      for (const it of items) {
        const r = inventory.add(it, { quiet: true });
        if (r && r.added) accepted.push(it);
      }
      if (gold > 0) {
        character.gold = (character.gold || 0) + gold;
        state.touch('gold');
      }
      return { items: accepted, gold };
    }

    /**
     * A click. A sack or a monster under the cursor beats the trees and the
     * animals interact.js knows about; otherwise the click is interact's.
     */
    function onClick(now, nowS) {
      const ray = aim();
      // a held spell owns the click: it is choosing who, not starting a fight
      if (abilities.pending) {
        const mon = monsters.pick(ray);
        return abilities.onTargetPicked(mon ? mon.actor : null, nowS);
      }
      const bag = loot.pick(ray);
      if (bag) return loot.take(bag, takeLoot);
      // a person in front of a house takes the click, not the roof
      const who = npcs.click(ray, player.pos);
      if (who && who.npc) return who;
      const st = stations.pick(ray);
      if (st) {
        const d = Math.hypot(st.x - player.pos.x, st.z - player.pos.z);
        if (d > STATION_REACH) { hud.toast(`the ${st.name} is ${Math.round(d)} m off`, 'bad'); return st; }
        ctx.station = st.id;
        windows.open('crafting', { station: st.id });
        return st;
      }
      // a mushroom at your feet beats the oak behind it; out of reach, the click falls through
      const pickF = forage.pick(ray);
      if (pickF) {
        const r = foraging.harvest(pickF.rec, now);
        if (r.ok || r.reason !== 'too_far') return r;
      }
      const mon = monsters.pick(ray);
      if (mon) {
        // a first click looks; a second click on the same one, or a double
        // click, fights. Clicking another monster mid fight switches to it.
        const again = targeting.current === mon.actor || !!attacking;
        targeting.set?.(mon.actor, 'click');
        if (input.dblclick || again) {
          startAttack(mon);
          return swingAt(mon.actor, now, nowS, true);
        }
        return { targeted: mon.name };
      }
      // a click on bare ground with a fight running calls it off
      if (attacking) stopAttack('you look away');
      // a body under the cursor, with a knife in hand and something to skin
      const corpse = skinning.pick(ray) || skinning.nearest(player.pos);
      if (corpse && skinning.canSkin(corpse)) return skinning.skin(corpse, now);
      return interact.click();
    }

    function startAttack(mon) {
      if (attacking?.actor === mon.actor) return;
      attacking = mon;
      hud.log(`You attack the ${mon.name}.`, 'good');
      hud.setHint?.(`fighting the ${mon.name}`);
    }
    function stopAttack(why) {
      if (!attacking) return;
      const name = attacking.name;
      attacking = null;
      hud.setHint?.('');
      if (why) hud.log(`You stop fighting the ${name}: ${why}.`);
    }
    let lastReachLine = -1e9, lastEdgeLine = -1e9;
    function swingAt(target, now, nowS, sayReach) {
      const extra = abilities.takeNextSwing(nowS) || {};
      // swingAt is queueSwing with the monster's weaknesses folded in
      const r = monsters.swingAt(actor, target, { now, jumpAttack: player.airborne, ...extra });
      if (r && r.queued) {
        // the arm goes through: a plain swing is animated like an ability's
        effects.swing(player, { hands: actor.weapon?.hands ?? 1 });
        if (attacking) hud.setHint?.(`fighting the ${attacking.name}`);
      } else if (r && !r.queued && r.reason === 'out_of_reach') {
        if (attacking) hud.setHint?.(`too far from the ${attacking.name}, walk closer`);
        if (sayReach || now - lastReachLine > 2500) {
          lastReachLine = now;
          hud.log(`${attacking?.name || 'It'} is ${Math.round(r.dist)} m off, walk closer`);
        }
      }
      return r;
    }
    /** Each frame: swing at the fight, and let it go when it is over. */
    function updateAttack(now, nowS) {
      if (!attacking || dying) return;
      const t = attacking.actor;
      if (!t || t.health <= 0) { const n = attacking.name; attacking = null; hud.setHint?.(''); hud.log(`The ${n} is down.`, 'good'); return; }
      if (Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z) > ATTACK_LEASH) return stopAttack('it is too far away');
      if (targeting.current !== t) targeting.set?.(t, 'attack');
      swingAt(t, now, nowS, false);
    }

    // The cursor says what a click would do: a grab over a sack, a body to
    // skin or a thing to pick, a pointer over a person or a station.
    let cursorAt = -1e9, cursorNow = '', hoverNow = '';
    function updateCursor(now) {
      if (now - cursorAt < 100 || dev.on || windows.anyOpen) return;
      cursorAt = now;
      const ray = aim();
      // the cursor says what a click would do, and the hint line names it:
      // "a patch of dandelions, seven of them", "a pile of 46 gold", "wolf, not yet skinned"
      let want = abilities.cursor || '', hover = '';
      const bag = loot.pick(ray);
      const patch = bag ? null : forage.pick(ray);
      const who = bag || patch ? null : npcs.pick?.(ray);
      const st = bag || patch || who ? null : stations.pick(ray);
      const mon = bag || patch || who || st ? null : monsters.pick(ray);
      const corpse = bag || patch || who || st || mon ? null : skinning.pick(ray);
      if (bag) { want = want || 'grab'; hover = lootLabel(bag); }
      else if (patch) { want = want || 'grab'; hover = foraging.hoverText(patch.rec); }
      else if (who) { want = want || 'pointer'; hover = who.name ? `${who.name}, click to talk` : ''; }
      else if (st) { want = want || 'pointer'; hover = `the ${st.name}, click to craft`; }
      else if (mon) { want = want || 'crosshair'; }
      else if (corpse && skinning.canSkin(corpse)) { want = want || 'grab'; hover = skinning.labelFor(corpse); }
      if (want !== cursorNow) { cursorNow = want; sc.renderer.domElement.style.cursor = want; }
      if (hover !== hoverNow) {
        hoverNow = hover;
        if (hover) hud.setHint?.(hover);
        else if (!attacking) hud.setHint?.('');
      }
    }

    // ------------------------------------------------------------- the loop --
    let last = performance.now();
    let lastSave = last;
    let lastHealth = actor.health;
    let dead = false;

    // `manual` is the harness: __bw.step(ms) runs this same function with a
    // synthetic clock and no rAF, so a hidden tab can still be driven a frame at
    // a time. There is no second code path; the test path is the frame.
    function frame(now, manual = false) {
      if (dead) return;
      if (!manual) requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const nowS = now / 1000;

      onHotkeys();

      if (input.click && !shop.isOpen && !dev.on && !dying) onClick(now, nowS);

      if (dev.on) {
        dev.update(dt);
      } else {
        const move = dying ? { x: 0, z: 0, sprint: false, jump: false, yaw: camera.forwardYaw } : {
          x: (input.down('d') ? 1 : 0) - (input.down('a') ? 1 : 0),
          z: (input.down('w') ? 1 : 0) - (input.down('s') ? 1 : 0),
          sprint: input.down('shift'),
          jump: input.down(' '),
          yaw: camera.forwardYaw,
        };
        player.update(dt, move, (x, z) => runtime.heightAt(x, z));
        // a landing is one frame: fall damage through the resolver, and Leap
        // Slam comes down where the feet do
        if (player.landed) {
          combat.applyFall(actor, player.landed.fallMetres, now);
          abilities.onLanded(nowS, player.landed.fallMetres);
          if (player.landed.fallMetres > 4) audio.play('land', { at: { x: player.pos.x, z: player.pos.z } });
        }
        // the continent ends in deep water: the sea floor is walkable, the edge is not
        if (!runtime.inDungeon) {
          const edge = clampToWorld(player.pos.x, player.pos.z);
          if (edge.moved) { player.pos.x = edge.x; player.pos.z = edge.z; if (now - lastEdgeLine > 4000) { lastEdgeLine = now; hud.toast('the sea, and no way across it'); } }
        }
        // underground the walls are the edge of the world
        const [cx, cz] = runtime.clampWalkable(player.pos.x, player.pos.z);
        if (cx !== player.pos.x || cz !== player.pos.z) {
          player.pos.x = cx; player.pos.z = cz;
          player.pos.y = runtime.heightAt(cx, cz);
        }
        shapeDrag();
        camera.update(dt, player.pos, (x, z) => runtime.heightAt(x, z));
        // underground the camera stays inside the room: dungeon.js walks the grid
        // from the player to the eye and stops it short of the first rock cell
        if (runtime.inDungeon) {
          const L = runtime.dungeonLayout();
          const c = cameraClamp(L, sc.camera.position, player.pos);
          if (c.moved) {
            sc.camera.position.set(c.x, c.y, c.z);
            sc.camera.lookAt(player.pos.x, player.pos.y + CAMERA_EYE, player.pos.z);
          }
        }
        state.setPos(player.pos.x, player.pos.z);
      }

      const centre = dev.on ? sc.camera.position : player.pos;
      audio.setListener(centre.x, centre.z);
      const day = sc.dayFactor(now);
      const night = day < NIGHT_BELOW;
      lantern.intensity = Math.max(0, 1 - day / 0.6) * 14;
      runtime.update(dt, now, centre.x, centre.z, day);
      npcs.update(dt, player.pos, day);
      stations.update(player.pos.x, player.pos.z, now);
      forage.update(player.pos.x, player.pos.z, seasonAt(Date.now()), now);   // one clock with harvest

      // the fight: monsters queue, combat resolves, the bar reacts
      monsters.update(dt, now, actor, night);
      combat.update(dt, now);
      if (actor.health < lastHealth) {
        abilities.onDamaged(lastHealth - actor.health, nowS);
        effects.flinch(player);
      }
      lastHealth = actor.health;
      targeting.update(dt);
      updateAttack(now, nowS);
      // a held spell that Escape lets go must not also open the settings window
      const hadPending = !!abilities.pending;
      abilities.update(dt, nowS);
      if (hadPending && !abilities.pending && input.pressed('escape')) input.swallow('escape');
      itemBar.update(dt);
      tickPools(actor, dt, combat.inCombat(actor, now));
      loot.update(dt);

      if (dying) {
        dying.left -= dt;
        const c = deathEl.querySelector('.bw-count');
        if (c) c.textContent = dying.left > 0 ? `You wake in ${Math.ceil(dying.left)}` : 'waking';
        if (dying.left <= 0) wake();
      }

      interact.update(dt, now);
      tickFps(now);
      updateCursor(now);
      tradeNet.update(now);
      updatePlace(now);

      const ringTarget = attacking?.actor || targeting.current;
      targetRing.update(dt, ringTarget, !!attacking, ringTarget ? runtime.heightAt(ringTarget.pos.x, ringTarget.pos.z) : 0);
      floaters.update(dt);
      effects.update(dt);               // after player.update: the clips add to the gait
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
      hud.update(dt, {
        actor,
        target: targeting.frame(character),
        bar: abilities.barView(nowS),
        items: itemBar.view(),
        buffs: abilities.buffsView(nowS),
      });
      windows.update(dt);
      ctx.paperdoll?.update?.(dt);
      compass.update();
      sc.follow(centre);
      sc.setDay(day);
      water.beforeRender(sc.renderer, sc.scene, sc.camera);   // the refraction pass, right before the frame
      sc.render();
      input.endFrame();

      if (now - lastSave > SAVE_EVERY_MS) { lastSave = now; syncToCharacter(actor); state.save(); }
    }
    // A save written mid death (health 0, no count running) comes back as a
    // corpse that cannot fight or die again. Wake it at once.
    if (actor.health <= 0) {
      hud.log('You were dead when the world came back.');
      wake();
    }
    requestAnimationFrame(frame);

    const saveNow = () => { syncToCharacter(actor); state.save(); };
    window.addEventListener('beforeunload', saveNow);
    window.addEventListener('pagehide', saveNow);

    window.__bw = {
      step: (ms = 16.7) => frame(last + ms, true),
      get now() { return last; },
      sc, runtime, player, camera, state, hud, dev, input, interact, shop, audio, floaters, THREE, sky, water,
      actor, get playerActor() { return actor; }, get character() { return state.character; },
      progression, combat, loot, monsters, inventory, windows, effects, targeting, abilities, npcs, stations,
      panels: { talk: talkPanel, trade: tradePanel, crafting: craftingPanel, map: mapPanel, settings: settingsPanel },
      spawnMonster, recompute, tickPools, syncToCharacter, skinning, tradeNet, dress, forage, foraging, itemBar, compass, refreshEnvironment, targetRing, get attacking() { return attacking; }, stopAttack, get fps() { return fps; }, get codexTab() { return windows.tab; }, devPanel, get devBench() { return devBenchOf(); },
      wake, get dying() { return dying; },
    };
    hud.toast('WASD walks, Space jumps, drag to look. Click a monster to look at it, double click to fight it. 1 to = use the bar. C character, B bag, K skills, P abilities, V crafting, M map, Escape settings, F2 dev bench, E goes in.');
    return window.__bw;
  }
}

boot();
