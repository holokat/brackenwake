import {createWander} from '../world/living/wander.js';
// The Greenwold's story, running: the named people standing in it, and the
// first hour happening to a character once.
//
// `src/mmo/story.js` is the cast and the script. This file is the part a player
// meets. It does three things and nothing else:
//
//   THE NAMES GO ON. Three of the cast keep a building Hearthhome already has,
//   and `npcs_runtime` has already stood a Blacksmith, a Healer and an
//   Innkeeper in those three doorways. Those three people are given their names
//   and their lines where they stand, so the forge under Cobb Ashby is the
//   forge that was always there and no second body appears in the door. The
//   other six have no building, so this file raises a body for each of them at
//   the spot the sheet puts them on.
//
//   THE BEATS FIRE ONCE. Every beat is a predicate over one plain object, the
//   VIEW, which is built here off the running world and off nothing else. A
//   beat that fires is written to `character.story.beats` and never fires
//   again, in this life or after a reload. No beat is even read outside the
//   Greenwold: the realm is checked before the loop, and again inside every
//   trigger, because one gate is a gate and two are a rule.
//
//   THE WORDS ARE THE POINT. A beat says its lines in the log and its first
//   line in a toast, and an effect says what it did AND what it did not do: a
//   compass already pointed somewhere is not quietly turned.
//
// WHAT THIS FILE DOES NOT OWN. It does not place a waystone, it does not decide
// what touching one does, and it does not open the picker: `waystones.js` is
// all three. It holds the runtime so that the first stone can ring a beat.

import * as THREE from 'three';
import { REALM, PEOPLE, PERSON, BEATS, BEAT, blankView, roleOf, CELLAR_MOUTH_M, WAGON_SEEN_M, HEARTHHOME_M } from '../mmo/story.js';
import { ZONE } from '../world/zones.js';
import { SPACES } from '../mmo/spaces/index.js';
import { placeAt, nearestSpaceStone, PLACE_SPACE } from '../mmo/greenwold/places.js';
import { layoutTown, lotOf, doorOf } from '../world/town_layout.js';
import { buildCharacter as defaultBuildCharacter, poseCharacter, PALETTE } from './player.js';

/** How far out the named people are raised. The same ring the townsfolk use. */
export const NEAR_RING = 320;
/** You have to walk up to somebody to talk to them, as everywhere else. */
export const TALK_REACH = 4;
/** They notice you at this range and turn, as everywhere else. */
export const NOTICE = 6;
/** Name plates stop drawing past this. */
export const PLATE_RANGE = 60;
/** Radians a second a standing person turns. */
export const TURN_RATE = 1.8;
/** The beats are asked this often. Cheap, and not once a frame. */
export const CHECK_MS = 250;
/** Below this the day is night, the same number npcs_runtime reads. */
export const NIGHT_AT = 0.4;

/** A tunic colour for each story role, so the cast reads before a plate does. */
export const ROLE_TINT = {
  farmer: 0x6f5a30, elder: 0x8c8578, child: 0xb4784f, miller: 0xa39a80,
  officer: 0x241f26, outlaw: 0x3f3a2c, sexton: 0x545a55,
};

const num = (v) => (Number.isFinite(v) ? v : 0);
const dist = (a, b) => Math.hypot(num(a?.x) - num(b?.x), num(a?.z) - num(b?.z));

/** The plate over a named head. The name first, then what they are. */
export const plateText = (p) => `${p.name}, ${p.title}`;

/**
 * Where one person stands, in world metres, or null when the world cannot say.
 * Pure but for the two tables it reads, so the test can drive it with no scene.
 *
 * A door person's spot is `doorOf` on the town's own plan, which is the same
 * function `npcs_runtime` and `town_models` both use, so a name and a lantern
 * can never be at two different doors.
 */
export function spotFor(person, opts = {}) {
  if (!person) return null;
  const zone = (opts.zones || ZONE)[person.place];
  if (!zone) return null;
  if (person.at.kind === 'door') {
    const site = opts.site || null;
    const plan = site ? (opts.layoutTown || layoutTown)(site, 0) : null;
    const lot = plan ? lotOf(plan, person.at.lot) : null;
    if (!lot) return null;
    const d = doorOf(lot, opts.doorStand ?? 2.0);
    return { x: d.x, z: d.z, yaw: d.yaw, at: person.at.lot };
  }
  const { bearing, out } = person.at;
  const x = zone.x + Math.cos(bearing) * out;
  const z = zone.z + Math.sin(bearing) * out;
  return { x, z, yaw: Math.atan2(zone.x - x, zone.z - z), at: 'spot' };
}

const CSS = `
.bw-story-layer{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:29}
.bw-story-plate{position:absolute;left:0;top:0;transform:translate(-50%,-100%);white-space:nowrap;
  font:600 12px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:#f4e6c4;text-shadow:0 1px 0 #000,0 0 4px #000;padding:1px 5px;border-radius:4px;
  background:rgba(20,16,10,.5);will-change:transform,opacity}
.bw-story-plate.near{color:#ffd98a}
`;

/**
 * @param deps {
 *   character,      the document. `character.story` is the memory.
 *   runtime,        createWorldRuntime: field, heightAt, sitesNear, inDungeon
 *   hud,            log and toast
 *   scene,          THREE scene, or null to run headless
 *   npcs,           createNpcs, so the three names can go on the three doors
 *   dragon,         () => the dragon entity, for the gift and for the stones
 *   events,         () => createEvents, for the Tithe Wagon
 *   waystones,      createWaystones, for how many stones are held
 *   realmAt,        () => the realm id the player is standing in
 *   pos,            () => the player's position
 *   dayFactor,      () => 0 at night, 1 at noon
 *   camera,         the scene camera, for plates
 *   root,           where plates go
 *   buildCharacter, the rig factory; player.js's by default
 * }
 */
export function createStory(deps = {}) {
  const {
    character = {}, runtime = null, hud = null, scene = null, npcs = null,
    dragon = null, events = null, waystones = null, realmAt = null,
    pos = null, dayFactor = null, camera = null, root = null,
  } = deps;
  const build = deps.buildCharacter || defaultBuildCharacter;
  const doc = typeof document !== 'undefined' ? document : null;
  const field = runtime?.field || null;

  const at = () => (typeof pos === 'function' ? pos() : pos) || { x: 0, y: 0, z: 0 };
  const beast = () => (typeof dragon === 'function' ? dragon() : dragon);
  const eventsNow = () => (typeof events === 'function' ? events() : events);
  const dayNow = () => (typeof dayFactor === 'function' ? num(dayFactor()) : 1);

  // ---- the memory ---------------------------------------------------------
  const mem = (() => {
    const raw = character.story;
    const m = { beats: [], met: [] };
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if (Array.isArray(raw.beats)) m.beats = raw.beats.filter((k) => typeof k === 'string');
      if (Array.isArray(raw.met)) m.met = raw.met.filter((k) => typeof k === 'string');
    }
    character.story = m;
    return m;
  })();

  const said = (id) => mem.beats.includes(id);

  const log = (text, kind) => { if (text) hud?.log?.(text, kind); return text; };
  const toast = (text, kind) => { if (text) hud?.toast?.(text, kind); return text; };

  // ---- the latches --------------------------------------------------------
  //
  // Three of the seven triggers are events and not places: a wolf going down
  // after dark, Oram going down, the chapel bell being rung. Each is latched
  // when it happens and read by the view on the next check, which is at most a
  // quarter of a second later.
  const latch = { wolfAtNight: false, oram: false, bell: false };

  /** Every death in the world. Two of the beats are hanging off this. */
  function onDeath(id, opts = {}) {
    const night = opts.night != null ? !!opts.night : dayNow() < NIGHT_AT;
    if (id === 'wolf' && night) latch.wolfAtNight = true;
    if (id === 'oramBlackhand') latch.oram = true;
    return latch;
  }

  /**
   * The authored chapel encounter calls this after a successful bell ring.
   * The story latch and the combat encounter share the player's action.
   */
  function ringChapelBell() { latch.bell = true; return true; }

  // ---- the view -----------------------------------------------------------

  /**
   * Everything a trigger is allowed to know, built off the running world. One
   * object, no functions in it, so a test can hand a beat exactly what the game
   * would and the two cannot diverge.
   */
  function viewNow() {
    const v = blankView();
    const p = at();
    v.realm = typeof realmAt === 'function'
      ? (realmAt() || null)
      : (field?.sampleAt ? (field.sampleAt(p.x, p.z).realm || null) : null);
    const under = !!runtime?.inDungeon;
    const home = placeAt(runtime?.field, 'hearthhome', deps.spaces);
    const cellars = placeAt(runtime?.field, 'oldcellars', deps.spaces);
    if (!under && home) v.inHearthhome = dist(home, p) <= HEARTHHOME_M;
    if (!under && cellars) v.atCellarMouth = dist(cellars, p) <= CELLAR_MOUTH_M;
    v.stonesOwned = waystones ? waystones.count : 0;
    if (!under) {
      const live = eventsNow()?.active?.() || [];
      for (const e of live) {
        if (e.id === 'tithewagon' && dist(e, p) <= WAGON_SEEN_M) { v.wagonNear = true; break; }
      }
    }
    v.wolfKilledAtNight = latch.wolfAtNight;
    v.oramDown = latch.oram;
    v.bellRung = latch.bell;
    return v;
  }

  // ---- the effects --------------------------------------------------------
  //
  // Two kinds, and both of them say what they did. An effect that changed
  // nothing says that too, because a silent no is indistinguishable from a bug.

  function applyEffect(beat) {
    const e = beat.effect;
    if (!e) return null;
    if (e.kind === 'waypoint') {
      const z = runtime?.field?.sculpt && e.place === 'waystones'
        ? nearestSpaceStone(at(), deps.spaces) : placeAt(runtime?.field, e.place, deps.spaces);
      if (!z) return log('The ring is not on any map this build has.', 'bad');
      if (character.waypoint && Number.isFinite(character.waypoint.x)) {
        return log(`Your compass is already set on ${character.waypoint.name || 'a mark of your own'}, so the ring is not marked over it. The Standing Hedge is out there whether or not the needle says so.`);
      }
      character.waypoint = { x: z.x, z: z.z, name: e.name || z.name };
      return log(`Your compass turns to ${e.name || z.name}.`, 'good');
    }
    if (e.kind === 'gift') {
      const dr = beast();
      if (!dr || typeof dr.grant !== 'function') {
        return log('Something passes between the two of you and there is no dragon here to take it.', 'bad');
      }
      const got = dr.grant(e.gift);
      const name = dr.name || 'the hatchling';
      if (!got) return log(`${name} already holds what the Greenwold had to give.`);
      return log(`Wyrmsoul is yours. Fill the Bond and the last cell of the bar lights, and for six seconds the world moves at a fifth of your speed while you do not.`, 'good');
    }
    return null;
  }

  // ---- the beats ----------------------------------------------------------

  /**
   * Fire one beat by hand, in the real path: the same words, the same effect,
   * the same memory. `force` is for the dev bench and the test; without it a
   * beat that has already been said says nothing.
   */
  function fire(id, opts = {}) {
    const beat = BEAT[id];
    if (!beat) return { ok: false, reason: 'no_such' };
    if (said(id) && !opts.force) return { ok: false, reason: 'already', beat };
    const words = beat.words.slice();
    toast(words[0], 'good');
    for (const w of words) log(w);
    const effect = applyEffect(beat);
    if (!said(id)) mem.beats.push(id);
    const who = beat.who ? PERSON[beat.who] : null;
    if (who && !mem.met.includes(who.id)) mem.met.push(who.id);
    return { ok: true, beat, words, effect, who };
  }

  let checkAt = -1e9;

  /** Every beat that is due, in the order the file writes them. */
  function checkBeats(now, force = false) {
    if (!force && now - checkAt < CHECK_MS) return [];
    checkAt = now;
    const v = viewNow();
    // Out of the Greenwold nothing here is even asked. The triggers ask again
    // themselves; this is the rule and that is the belt.
    if (v.realm !== REALM) return [];
    const fired = [];
    for (const b of BEATS) {
      if (said(b.id)) continue;
      let hit = false;
      try { hit = !!b.when(v); } catch (err) { console.warn(`[story] the ${b.id} trigger threw`, err); }
      if (!hit) continue;
      const res = fire(b.id);
      if (res.ok) fired.push(res);
    }
    return fired;
  }

  // ---- the names on the three doors ---------------------------------------
  //
  // `npcs_runtime` streams its people in and out as the player walks, so this
  // is done every time the list changes rather than once: a person who walked
  // out of range and back would otherwise come back nameless.

  const overs = PEOPLE.filter((p) => p.over);

  function nameTheDoors() {
    if (!npcs || typeof npcs.list !== 'function') return 0;
    let n = 0;
    for (const rec of npcs.list()) {
      if (rec.story) { n++; continue; }
      const person = PEOPLE.find((p) => rec.at === p.id) || overs.find((p) =>
        p.over === rec.role?.id && (rec.site?.sub === p.place || rec.site?.sub === PLACE_SPACE[p.place]));
      if (!person) continue;
      rec.story = person;
      rec.personName = person.name;
      if (rec.plate) rec.plate.textContent = plateText(person);
      if (!mem.met.includes(person.id)) mem.met.push(person.id);
      n++;
    }
    return n;
  }

  // ---- the bodies of the six ----------------------------------------------

  const live = new Map();       // person id -> record
  const unregisterBodies=runtime?.physical?.registerActors('story',()=>live.values());
  let layer = null;
  let meshCache = null;

  if (doc && root) {
    if (!doc.getElementById('bw-story-plate-css')) {
      const st = doc.createElement('style');
      st.id = 'bw-story-plate-css';
      st.textContent = CSS;
      doc.head.appendChild(st);
    }
    layer = doc.createElement('div');
    layer.className = 'bw-story-layer';
    root.appendChild(layer);
  }

  function bodyFor(person) {
    const rig = build(person);
    const seen = new Map();
    const tint = ROLE_TINT[person.role] ?? PALETTE.tunic;
    rig.group.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      let clone = seen.get(o.material);
      if (!clone) {
        clone = o.material.clone ? o.material.clone() : o.material;
        if (clone.color?.getHex?.() === PALETTE.tunic) clone.color.setHex(tint);
        seen.set(o.material, clone);
      }
      o.material = clone;
      o.castShadow = true;
    });
    return rig;
  }

  function spawn(person, spot) {
    const y = runtime?.heightAt ? runtime.heightAt(spot.x, spot.z) : 0;
    const rig = scene ? bodyFor(person) : null;
    const rec = {
      id: person.id,
      person,
      // The talk engine wants exactly this shape: a role, a name and a site.
      role: roleOf(person.role),
      personName: person.name,
      site: { id: `z:${person.place}`, sub: person.place, name: ZONE[person.place]?.name || person.place, x: ZONE[person.place]?.x ?? spot.x, z: ZONE[person.place]?.z ?? spot.z, kind: ZONE[person.place]?.kind || 'wild' },
      story: person,
      x: spot.x, z: spot.z, y,
      homeYaw: spot.yaw, yaw: spot.yaw,
      rig, group: rig?.group || null, parts: rig?.parts || null,
      posed: !!(rig?.parts && rig.parts.hips && rig.parts.shinL),
      t: 0, plate: null, wander:createWander({id:person.id,x:spot.x,y,z:spot.z,range:1.8,pause:7}),
    };
    if (rig) {
      rig.group.position.set(spot.x, y, spot.z);
      rig.group.rotation.y = spot.yaw;
      rig.group.name = `story:${person.id}`;
      rig.group.traverse((o) => { if (o.isMesh) o.userData.storyPerson = rec; });
      rig.group.userData.storyPerson = rec;
      scene?.add?.(rig.group);
    }
    if (layer) {
      const el = doc.createElement('div');
      el.className = 'bw-story-plate';
      el.textContent = plateText(person);
      layer.appendChild(el);
      rec.plate = el;
    }
    rig?.ready?.then(()=>{if(!live.has(person.id))return;rig.group.traverse(o=>{if(o.isMesh)o.userData.storyPerson=rec;});meshCache=null;});
    live.set(person.id, rec);
    meshCache = null;
    return rec;
  }

  function despawn(rec) {
    rec.rig?.dispose?.();
    if (rec.group&&!rec.rig?.studio) {
      scene?.remove?.(rec.group);
      rec.group.traverse?.((o) => {
        if (o.isMesh) {
          o.geometry?.dispose?.();
          if (o.material && !Array.isArray(o.material)) o.material.dispose?.();
        }
      });
    }
    rec.plate?.remove();
    live.delete(rec.id);
    meshCache = null;
  }

  /**
   * In a sculpt world (terrain_edits.js, ED3) a story person stands ONLY where
   * the user placed them: a space whose people list carries their name. The
   * sheet's own spot at Hearthhome is not consulted, because the user said
   * "I want to be able to place these myself". Matched by name, case blind.
   */
  const spaces = deps.spaces || SPACES;
  function spotInSpaces(person) {
    const want = String(person.name || '').toLowerCase();
    for (const space of Object.values(spaces)) {
      const at = space && space.at;
      if (!at) continue;
      for (const q of space.people || []) {
        if (q.name !== person.id && String(q.name || '').toLowerCase() !== want) continue;
        const x = at.x + num(q.x), z = at.z + num(q.z);
        return { x, z, yaw: Number.isFinite(q.yaw) ? q.yaw * Math.PI / 180 : 0, at: space.id };
      }
    }
    return null;
  }
  const sculptWorld = () => !!(runtime && runtime.field && runtime.field.sculpt);

  /** Who is near enough to be standing there. */
  function restream(p) {
    const keep = new Set();
    for (const person of PEOPLE) {
      if (!person.body) continue;
      // Planned NPCs already carry the cast. Do not place a second body.
      if (sculptWorld() && npcs?.list?.().some(n => n.at === person.id)) continue;
      const spot = sculptWorld() ? spotInSpaces(person) : spotFor(person);
      if (!spot) continue;
      if (dist(spot, p) > NEAR_RING) continue;
      keep.add(person.id);
      if (!live.has(person.id)) spawn(person, spot);
    }
    for (const rec of [...live.values()]) if (!keep.has(rec.id)) despawn(rec);
  }

  // ---- the frame ----------------------------------------------------------

  const v3 = new THREE.Vector3();

  function update(dt, now) {
    const p = at();
    restream(p);
    nameTheDoors();
    const fired = checkBeats(num(now));

    const w = layer ? (layer.clientWidth || 1) : 1;
    const h = layer ? (layer.clientHeight || 1) : 1;
    for (const rec of live.values()) {
      rec.t += num(dt);
      const moved=rec.wander.update(dt,{field:runtime?.field,physical:runtime?.physical,observer:p,others:[...live.values()].filter(n=>n!==rec).map(n=>n.wander.pos)});
      rec.x=moved.x;rec.y=moved.y;rec.z=moved.z;rec.group?.position.set(rec.x,rec.y,rec.z);
      const dx = p.x - rec.x, dz = p.z - rec.z;
      const d = Math.hypot(dx, dz);
      const want = d <= NOTICE && d > 1e-3 ? Math.atan2(dx, dz) : rec.wander.mode==='walk'?rec.wander.yaw:rec.homeYaw;
      let diff = want - rec.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const step = TURN_RATE * num(dt);
      rec.yaw += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
      if (rec.group) rec.group.rotation.y = rec.yaw;
      if (rec.posed) {
        try { const pose={anim:rec.wander.mode,phase:rec.wander.phase,stride:1.4,idleMix:1,t:rec.t};if(rec.rig?.pose)rec.rig.pose(pose);else poseCharacter(rec.parts,pose); }
        catch { rec.posed = false; }
      }
      if (rec.plate && camera) {
        if (d > PLATE_RANGE) { rec.plate.style.opacity = '0'; continue; }
        v3.set(rec.x, rec.y + 2.05, rec.z).project(camera);
        if (v3.z > 1) { rec.plate.style.opacity = '0'; continue; }
        rec.plate.style.transform = `translate(${((v3.x + 1) / 2 * w).toFixed(0)}px,${((1 - v3.y) / 2 * h).toFixed(0)}px) translate(-50%,-100%)`;
        rec.plate.style.opacity = (d > PLATE_RANGE * 0.8 ? 0.45 : 1).toFixed(2);
        rec.plate.classList.toggle('near', d <= TALK_REACH);
      }
    }
    return fired;
  }

  // ---- the click ----------------------------------------------------------

  function meshes() {
    if (!meshCache) {
      meshCache = [];
      for (const rec of live.values()) rec.group?.traverse?.((o) => { if (o.isMesh) meshCache.push(o); });
    }
    return meshCache;
  }

  /** Whoever is under the ray, nearest first, or null. */
  function pick(raycaster) {
    if (!raycaster) return null;
    const list = meshes();
    if (!list.length) return null;
    const hits = raycaster.intersectObjects(list, false);
    for (const hit of hits) {
      const rec = hit.object.userData.storyPerson;
      if (rec && live.has(rec.id)) return { npc: rec, distance: hit.distance };
    }
    return null;
  }

  /** The closest named person to a point within `r` metres, or null. */
  function nearest(p = at(), r = TALK_REACH) {
    let best = null, bd = r;
    for (const rec of live.values()) {
      const d = dist(rec, p);
      if (d <= bd) { bd = d; best = rec; }
    }
    return best ? { npc: best, distance: bd } : null;
  }

  /**
   * A click. Opens Talk when the ray found one of them and you are near enough,
   * and says why not when it did not.
   */
  function click(raycaster, playerPos, windows) {
    const hit = pick(raycaster);
    if (!hit) return null;
    const rec = hit.npc;
    const d = dist(rec, playerPos || at());
    if (d > TALK_REACH) {
      toast(`${plateText(rec.person)} is ${Math.round(d)} m off. Walk up to them.`);
      return { npc: rec, opened: false };
    }
    if (!mem.met.includes(rec.id)) mem.met.push(rec.id);
    const opened = !!windows?.open?.('talk', { npc: rec });
    if (!opened) toast(`${plateText(rec.person)} has nothing to say yet.`);
    return { npc: rec, opened };
  }

  function dispose() {
    unregisterBodies?.();
    for (const rec of [...live.values()]) despawn(rec);
    layer?.remove();
  }

  return {
    update, viewNow, fire, checkBeats, onDeath, ringChapelBell,
    pick, nearest, click, spotFor, nameTheDoors,
    memory: mem,
    said,
    people: () => [...live.values()],
    get count() { return live.size; },
    person: (id) => live.get(id) || null,
    dispose,
    TALK_REACH,
  };
}
