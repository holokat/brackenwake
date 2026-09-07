import {createHoverHalo} from '../../hover_halo.js';
import {placeLabel} from '../../../mmo/greenwold/navigation.js';
// Everything the player reads: the windows and their panels, the paper doll,
// the compass, the minimap, the plate that names this spot, the cursor and the
// line under it, and the frame counter behind the dev badge.

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
import { panel as devPanel, benchOf as devBenchOf } from '../../win_dev.js';
import { panel as editorPanel } from '../../editor/panel.js';
import { SPACES } from '../../../mmo/spaces/index.js';
import { ZONE } from '../../../world/zones.js';
import { unlockedFor, ABILITY_FOR_ITEM } from '../../../mmo/abilities.js';
import { labelFor as lootLabel } from '../../loot_drops.js';
import { conOf, conLabel } from '../../con.js';

/** How close a place has to be before the HUD calls this spot by its name. */

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
      // The editor reads keys off the document in the capture phase and has to
      // be able to take a press back out of the frame: an Escape that let go of
      // a half drawn ridge must not ALSO be read by windows.js as "close the
      // editor". `input.swallow` is the one call it makes.
      input,
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
      worldNow: () => ctx.frame.worldNow ?? ctx.frame.now,
      weather: world.weather,
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
      /**
       * "Use" on something in the pack, from the bag window and from the item
       * bar alike, because both of them come through this one key.
       *
       * A BANDAGE IS AN ABILITY, NOT A DRINK. `foraging.useItem` reads the
       * item's own `use` block, and the bandage base has none, so every press
       * of it answered "nothing has been written yet that uses bandage" while
       * the Bandage ability sat on the ability bar with a four second cast and
       * a real heal in it. Two paths, one of them dead. So an item that IS an
       * ability is routed to that ability by id and both paths land in the same
       * `doBandage`: the same cast bar, the same Healing scaling, the same
       * lesson, the same one bandage out of the pack. ABILITY_FOR_ITEM is the
       * table and abilities.test.mjs walks it against items.js both ways.
       */
      useItem: (item, where) => {
        const id = ABILITY_FOR_ITEM[item && (item.base || item.id)];
        if (id) return bars.abilities.useById(id, ctx.frame.nowS);
        return ctx.get('world_life').foraging.useItem(item, where);
      },
    };

    const windows = createWindows(hudRoot, input, panelCtx);
    panelCtx.windows = windows;
    for (const p of [characterPanel, bagPanel, skillsPanel, abilitiesPanel, talkPanel, tradePanel, craftingPanel, mapPanel, settingsPanel, devPanel]) windows.register(p);
    // The editor is registered on its own line and not in the row above,
    // because it is not one of the player's windows: it refuses to open unless
    // dev mode is on, and `wiring.test.mjs` reads that row by name.
    windows.register(editorPanel);
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
    // THE TOOL ROW IS GONE (T3). There is no cell to light and no tool to pick:
    // what does a piece of work is derived from what the character carries, by
    // `toolFor` in src/game/tools.js, and the one choice a player still makes
    // is which item bar slot to select, which item_bar.js owns. So the purse is
    // all this draws, and keys 1 to 0, minus and equals are the ability bar's
    // outright (07-RUNTIME-CONTRACT.md).
    const drawHud = () => {
      hud.setCoins(state.coins);
      hud.setMaterials(state.materials, state.caps);
    };
    state.onChange(drawHud);
    drawHud();

    // The compass strip: heading, the map's waypoint, and where you stand.
    //
    // It goes in the HUD's own top centre column, under the place plate, so
    // the layout stacks the two. It used to be dropped on hudRoot at a fixed
    // 38px from the top, which is inside the plate's box, and the strip
    // printed itself through the name of the place you were in. `flow` is what
    // tells compass.js it is a row in a column rather than a floating strip;
    // an older HUD with no slot still gets the strip it always had.
    const compass = createCompass(hud.compassSlot || hudRoot, {
      player: rig, camera, character, flow: !!hud.compassSlot,
    });

    // The minimap: a square of the country you are standing in, top right,
    // under the dev badge. docs/mmo/wiring/HUD4-MINIMAP.md has the lines.
    //
    // It is mounted through hud.mountMinimap and not dropped on hudRoot,
    // because the HUD's own setMode is what keeps it up in editor mode, and
    // setMode only reaches the children of the HUD root. The compass strip is
    // mounted the same way and for the same kind of reason.
    //
    // FIVE HOOKS, and every one of them is a live read rather than a value
    // captured now: `runtime.field` is replaced outright when a sculpt world is
    // laid over the generated one, `terrainEdits.version` counts every stroke
    // the editor lays, `SPACES` is rewritten by the editor's save endpoint and
    // reloaded by vite, the waypoint is win_map.js's, and the places are the
    // world's own site rows so Hearthhome and the Hedge have names on the map
    // before a single space has been authored around them.
    const minimap = hud.mountMinimap?.({
      player: rig,
      camera,
      field: () => runtime.field,
      spaces: () => SPACES,
      zone: () => ZONE.greenwold,
      dirty: () => runtime.terrainEdits?.version ?? 0,
      isDev: () => !!panelCtx.dev?.on,
      waypoint: () => character.waypoint || null,
      places: (x, z, r) => (typeof runtime.sitesNear === 'function' ? runtime.sitesNear(x, z, r) : null),
      /**
       * A click on the map in dev mode. It goes through the dev bench's own
       * `warp`, which is the five step arrival main.js already does (feet,
       * camera, document, monsters, forage) and NOT a second teleport of this
       * file's own: a warp that only moved the feet is exactly the half arrived
       * jump the bench exists to stop. The bench is built when dev mode opens
       * the bench window, so it is asked for at the moment of the click.
       */
      onWarp: (x, z) => {
        const bench = devBenchOf();
        if (!bench || typeof bench.warp !== 'function') {
          return { ok: false, text: 'the dev bench is not open, so there is nowhere to warp from' };
        }
        const res = bench.warp(x, z, { label: `the map at ${Math.round(x)}, ${Math.round(z)}` });
        if (res && res.ok) hud.toast(`Warped to ${Math.round(x)}, ${Math.round(z)} off the minimap. The ground is ${res.biome || 'unnamed here'}.`);
        else hud.toast(res && res.text ? res.text : 'that warp did not happen', 'bad');
        return res;
      },
    });

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
        sc.renderer.setPixelRatio(s.pixelRatio === 'device' ? Math.min(window.devicePixelRatio || 1, 2) : Number(s.pixelRatio) || 1);
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
        const sample = runtime.field.sampleAt(p.x, p.z);
        audio.music.setBiome(sample.biome);
        text = placeLabel(runtime,p,BIOME_NAMES[sample.biome] || sample.biome);
      }
      if (text !== placeText) {
        placeText = text; hud.setPlace(text);
        // First discovery and dungeon entry own banners. Routine compass
        // updates must not restart an announcement while crossing scenery.
      }
    }

    // The cursor says what a click would do: a grab over a sack, a body to
    // skin or a thing to pick, a pointer over a person or a station.
    const hoverHalo = createHoverHalo(sc.scene,(x,z)=>runtime.heightAt(x,z));
    let cursorAt = -1e9, cursorNow = '', hoverNow = '', hoverColourNow = '';
    function updateCursor(now) {
      if (ctx.get('dev').on || windows.anyOpen) { hoverHalo.clear(); return; }
      if (now - cursorAt < 100) return;
      cursorAt = now;
      const life = ctx.get('world_life');
      const skinning = bag.skinning;
      const ray = ctx.aim();
      // the cursor says what a click would do, and the hint line names it:
      // "a patch of dandelions, three of them", "a pile of 46 gold", "wolf, not yet skinned"
      let want = bars.abilities.cursor || '', hover = '', hoverColour = '';
      const sack = fight.loot.pick(ray);
      const who = sack ? null : life.npcs.pick?.(ray);
      const st = sack || who ? null : life.stations.pick(ray);
      const patch = sack || who || st ? null : life.forage.pick(ray);
      // S2: the six named people the story raises are not in npcs.pick
      const named = sack || patch || who ? null : (ctx.has('story') ? ctx.get('story').story?.pick?.(ray) : null);
      const mon = sack || patch || who || st ? null : fight.monsters.pick(ray);
      const corpse = sack || patch || who || st || mon ? null : skinning.pick(ray);
      if (sack) { want = want || 'grab'; hover = lootLabel(sack); }
      else if (patch) { want = want || 'grab'; hover = life.foraging.hoverText(patch.rec); }
      else if (named) { want = want || 'pointer'; hover = `${named.npc?.person?.name || named.name || 'somebody'}, click to talk`; }
      else if (who) { want = want || 'pointer'; hover = `${who.npc?.personName || who.npc?.name || who.name || 'Somebody'}, click to talk`; }
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
      const object = sack || who?.npc || named?.npc || st || patch?.rec || mon?.actor || (corpse && skinning.canSkin(corpse) ? corpse.actor || corpse : null);
      let point = object?.pos || object, radius = mon?.model?.radius ? mon.model.radius + .3 : .75;
      if (!object) {
        const picked = runtime.pick(ray);
        if (picked?.kind === 'tree') {
          const t = picked.tree.field.trees[picked.tree.index]; point = t; radius = Math.max(.6,(t?.s || 1)*.45);
          want = want || 'pointer'; hover = picked.tree.field.kind === 'rock' ? 'Click to mine' : 'Click to chop';
        } else if (picked?.kind === 'chest') { point = picked.chest; want = want || 'grab'; hover = 'Click to open'; }
        else if (picked?.kind === 'site' && (picked.site.inspect || picked.waystone || ['dungeon','cave'].includes(picked.site.kind))) {
          point = picked.site; want = want || 'pointer'; hover = picked.site.inspect ? 'Click to inspect' : picked.waystone ? 'Click to travel' : 'E to enter';
        }
      }
      hoverHalo.show(point,radius,rig.pos);
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
      windows, panelCtx, compass, minimap, applySettings, drawHud,
      dispose(){hoverHalo.dispose();minimap?.dispose();},
      get fps() { return fps; },
      get placeText() { return placeText; },
      bw: {
        windows, compass, minimap, hoverHalo,
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
        // The effects row needs BOTH clocks and every place an effect can be
        // kept. `buffsView` measures actor.buffs in the abilities runtime's
        // seconds, and app/systems/abilities.js runs that runtime on the
        // PLAYER's clock: `nowS`. `actor.status` is written by combat.js,
        // which app/systems/combat.js runs on the WORLD clock, so a poison's
        // `until` is world milliseconds and reading it against `now` would
        // count it down at the wrong rate the whole time the dragon is holding
        // the world still. Meditating, hidden, absorb and enchant sit on the
        // actor with no clock of their own, and a bandage is a cast, so while
        // it runs it is `channelling` and is nowhere else. hud.effectsView
        // gathers all five, and hud.js says what each one costs to draw.
        hud.update(dt, {
          actor,
          target: fight.targeting.frame(character, nowS),
          bar: bars.abilities.barView(nowS),
          items: bars.itemBar.view(),
          buffs: bars.abilities.buffsView(nowS),
          binding: bars.abilities.channelling,
          nowS,
          nowMs: frame.worldNow ?? now,
        });
        windows.update(dt);
        panelCtx.paperdoll?.update?.(dt);
        compass.update();
        // The minimap takes the frame's own dt in seconds and keeps its own
        // clock out of it, which is what puts its half second leash and its 8 m
        // step under a test's control instead of a wall clock's. The expensive
        // half of it is behind that leash; this call is the cheap half.
        minimap?.update(dt);
      },
    };
  },

  ready(ctx) {
    ctx.hud.toast('WASD walks, Space jumps, drag to look. Click a monster to look at it, double click to fight it. 1 to = use the ability bar, F5 to F12 the things you carry. An axe or a pickaxe works from your pack, with nothing to pick up first. C character, B bag, K skills, P abilities, V crafting, M map, X emotes, Escape settings, the key under Escape for dev mode and its bench, E goes in. The square in the top right is the minimap: north is up, you are the gold arrow, and the wheel over it zooms.');
  },

  late(ctx, frame) { ctx.get('ui').draw(frame); },
};
