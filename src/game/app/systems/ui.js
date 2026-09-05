// Everything the player reads: the windows and their panels, the paper doll,
// the compass, the plate that names this spot, the cursor and the line under
// it, and the frame counter behind the dev badge.

import { createWindows } from '../../windows.js';
import { createPaperdoll } from '../../paperdoll.js';
import { createCompass } from '../../compass.js';
import { recompute, syncToCharacter } from '../../actor.js';
import { toRoster } from '../../state.js';
import { panel as characterPanel } from '../../win_character.js';
import { panel as bagPanel } from '../../win_bag.js';
import { panel as skillsPanel } from '../../win_skills.js';
import { panel as abilitiesPanel, setBarSlot, barOf } from '../../win_abilities.js';
import { panel as talkPanel } from '../../win_talk.js';
import { panel as tradePanel } from '../../win_trade.js';
import { panel as craftingPanel } from '../../win_crafting.js';
import { panel as mapPanel } from '../../win_map.js';
import { panel as settingsPanel } from '../../win_settings.js';
import { panel as devPanel } from '../../win_dev.js';
import { unlockedFor } from '../../../mmo/abilities.js';
import { labelFor as lootLabel } from '../../loot_drops.js';
import { conOf, conLabel } from '../../con.js';

/** How close a place has to be before the HUD calls this spot by its name. */
const PLACE_RADIUS = 90;

const BIOME_NAMES = {
  ocean: 'open water', beach: 'the shore', meadow: 'open meadow',
  boreal: 'pine woods', desert: 'dry country', sakura: 'blossom country',
  mountain: 'high ground', snow: 'the snowline',
};

export const ui = {
  name: 'ui',
  deps: ['world', 'player', 'combat', 'inventory', 'abilities'],

  create(ctx) {
    const { sc, state, hud, audio, floaters, input, camera, hudRoot, character } = ctx;
    const world = ctx.get('world');
    const runtime = world.runtime;
    const player = ctx.get('player');
    const { rig, actor, progression } = player;
    const fight = ctx.get('combat');
    const bag = ctx.get('inventory');
    const bars = ctx.get('abilities');

    // The panel context. This is the object every window, every NPC talk and
    // the dev bench reach the game through, and its keys are the ones
    // 07-RUNTIME-CONTRACT.md names. Anything built after this one is a getter,
    // so a panel sees the real system rather than the null it was at boot.
    const panelCtx = {
      character, actor, inventory: bag.inventory, state, hud, audio, floaters, runtime, player: rig,
      sc, camera, combat: fight.combat, monsters: fight.monsters, loot: fight.loot,
      windows: null,
      recompute: (who) => recompute(who || actor),
      onBarChange: () => { /* hud.update reads character.bar through barView every frame */ },
      onSkillLock: () => state.touch('skills'),
      applySettings: (s) => applySettings(s),
      // Save this character and go to the roster. This used to clear the save
      // and reload, and the pagehide handler wrote the same document straight
      // back on the way out, so the button destroyed nothing and did nothing.
      // toRoster saves the open slot, leaves the note the roster screen reads
      // and takes down, and reloads. Deleting happens on the roster, where the
      // player can see the name, the skills and the purse of who is going.
      newCharacter: () => { syncToCharacter(actor); toRoster(state); },
      now: () => ctx.frame.now,
      station: null,
      // win_crafting teaches by document: (character, skillId, difficulty, success, rng)
      progression: {
        lesson: (c, skill, difficulty, success, rng) => progression.lesson(skill, difficulty, success, rng),
      },
      targeting: fight.targeting,
      abilities: bars.abilities,
      effects: bars.effects,
      tradeNet: bag.tradeNet,
      paperdoll: null,
      // the four below are filled in by the systems that own them, the moment
      // they are built, exactly as the old boot filled them in: win_dev.js
      // writes to ctx.debug, so none of these may be a getter
      dev: null, debug: null, foraging: null, forage: null,
      useItem: (item, where) => ctx.get('world_life').foraging.useItem(item, where),
    };

    const windows = createWindows(hudRoot, input, panelCtx);
    panelCtx.windows = windows;
    for (const p of [characterPanel, bagPanel, skillsPanel, abilitiesPanel, talkPanel, tradePanel, craftingPanel, mapPanel, settingsPanel, devPanel]) windows.register(p);
    // A fresh character's bar is not left empty: what the opening already
    // unlocked goes on it in order, so the first fight has something on key 1.
    if (barOf(character).every((x) => !x)) {
      const ready = unlockedFor(character.skills, character.stats).filter((a) => !a.passive);
      ready.slice(0, 12).forEach((a, i) => setBarSlot(character, i, a.id));
      if (ready.length) hud.log(`${Math.min(12, ready.length)} abilities go on the bar: ${ready.slice(0, 12).map((a) => a.name).join(', ')}`);
    }

    // one likeness shared by the character sheet and the HUD portrait plate
    try {
      panelCtx.paperdoll = createPaperdoll(sc, () => rig, { width: 244, height: 400 });
      // the portrait is the doll's second canvas: the first hangs in the
      // character sheet's arch, and a node can only be in one place
      hud.setPortrait?.(panelCtx.paperdoll.portrait || panelCtx.paperdoll.canvas);
    } catch (err) { console.warn('paperdoll not available', err); }

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

    // the compass strip under the place plate: heading, and the map's waypoint
    const compass = createCompass(hudRoot, { player: rig, camera, character });

    // docs/mmo/wiring/W5.md section 6: every key and what it does here.
    function applySettings(s) {
      if (!s) return;
      // panelCtx.dev, not ctx.get('dev'): the dev system calls this from inside
      // its own create, before the runner has registered it
      const dev = panelCtx.dev;
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
      if (typeof s.dev === 'boolean' && dev && dev.on !== s.dev) dev.toggle();
      if (typeof s.hudScale === 'string') hud.setScale?.(s.hudScale);
    }

    // What the top of the screen calls this spot. A named place wins over the
    // biome, because a name is what a player can point at on the way back.
    let placeText = '';
    let placeCheck = -1e9;
    let placeSub = '';
    // frame timing for the dev badge: a one second rolling average
    let fpsFrames = 0, fpsAt = performance.now(), fps = 0;
    function tickFps(now) {
      const dev = ctx.get('dev').dev;
      fpsFrames++;
      if (now - fpsAt >= 1000) {
        fps = Math.round(fpsFrames * 1000 / (now - fpsAt));
        fpsFrames = 0; fpsAt = now;
        if (dev.on) hud.setDev(true, { fps, frameMs: +(1000 / Math.max(1, fps)).toFixed(1), draws: sc.renderer.info.render.calls, tris: sc.renderer.info.render.triangles, monsters: fight.monsters.count, ...(dev.stats || {}) });
      }
    }
    function updatePlace(nowMs) {
      if (nowMs - placeCheck < 500) return;
      placeCheck = nowMs;
      const p = rig.pos;
      const lastInside = world.lastInside;
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

    // The cursor says what a click would do: a grab over a sack, a body to
    // skin or a thing to pick, a pointer over a person or a station.
    let cursorAt = -1e9, cursorNow = '', hoverNow = '', hoverColourNow = '';
    function updateCursor(now) {
      if (now - cursorAt < 100 || ctx.get('dev').on || windows.anyOpen) return;
      cursorAt = now;
      const life = ctx.get('world_life');
      const skinning = bag.skinning;
      const ray = ctx.aim();
      // the cursor says what a click would do, and the hint line names it:
      // "a patch of dandelions, seven of them", "a pile of 46 gold", "wolf, not yet skinned"
      let want = bars.abilities.cursor || '', hover = '', hoverColour = '';
      const sack = fight.loot.pick(ray);
      const patch = sack ? null : life.forage.pick(ray);
      const who = sack || patch ? null : life.npcs.pick?.(ray);
      // S2: the six named people the story raises are not in npcs.pick
      const named = sack || patch || who ? null : (ctx.has('story') ? ctx.get('story').story?.pick?.(ray) : null);
      const st = sack || patch || who ? null : life.stations.pick(ray);
      const mon = sack || patch || who || st ? null : fight.monsters.pick(ray);
      const corpse = sack || patch || who || st || mon ? null : skinning.pick(ray);
      if (sack) { want = want || 'grab'; hover = lootLabel(sack); }
      else if (patch) { want = want || 'grab'; hover = life.foraging.hoverText(patch.rec); }
      else if (named) { want = want || 'pointer'; hover = `${named.npc?.person?.name || named.name || 'somebody'}, click to talk`; }
      else if (who) { want = want || 'pointer'; hover = who.name ? `${who.name}, click to talk` : ''; }
      else if (st) { want = want || 'pointer'; hover = `the ${st.name}, click to craft`; }
      // a monster says what it is and how dangerous it is, in the con colour:
      // "Wolf, a fair fight" in yellow, "the Ashen King, a boss" in purple.
      // The rule is con.js's and moves as the character trains (C2.md).
      else if (mon) {
        want = want || 'crosshair';
        const who = mon.actor || mon;
        hover = conLabel(who, character);
        hoverColour = conOf(who, character).colour;
      }
      else if (corpse && skinning.canSkin(corpse)) { want = want || 'grab'; hover = skinning.labelFor(corpse); }
      if (want !== cursorNow) { cursorNow = want; sc.renderer.domElement.style.cursor = want; }
      // the colour is part of what changed: the same wolf can go from yellow to
      // grey without a letter of the line moving, the first time a character
      // crosses a band mid fight
      if (hover !== hoverNow || hoverColour !== hoverColourNow) {
        hoverNow = hover; hoverColourNow = hoverColour;
        if (hover) hud.setHint?.(hover, hoverColour || undefined);
        else if (!fight.attacking) hud.setHint?.('');
      }
    }

    return {
      windows, panelCtx, compass, applySettings, pickTool, drawHud,
      get fps() { return fps; },
      get placeText() { return placeText; },
      bw: {
        windows, compass,
        panels: { talk: talkPanel, trade: tradePanel, crafting: craftingPanel, map: mapPanel, settings: settingsPanel },
        get codexTab() { return windows.tab; },
        get fps() { return fps; },
      },

      draw(frame) {
        const { dt, now, nowS } = frame;
        tickFps(now);
        updateCursor(now);
        updatePlace(now);
        floaters.update(dt);
        hud.update(dt, {
          actor,
          target: fight.targeting.frame(character),
          bar: bars.abilities.barView(nowS),
          items: bars.itemBar.view(),
          buffs: bars.abilities.buffsView(nowS),
        });
        windows.update(dt);
        panelCtx.paperdoll?.update?.(dt);
        compass.update();
      },
    };
  },

  ready(ctx) {
    ctx.hud.toast('WASD walks, Space jumps, drag to look. Click a monster to look at it, double click to fight it. 1 to = use the bar. C character, B bag, K skills, P abilities, V crafting, M map, X emotes, Escape settings, F2 dev bench, E goes in.');
  },

  late(ctx, frame) { ctx.get('ui').draw(frame); },
};
