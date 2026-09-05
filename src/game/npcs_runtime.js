// The people in the settlements, and the click that starts a conversation.
//
// `npcs.js` decides who stands in a town, a hamlet or a ruin. This module puts
// them on the ground, gives each one a body, a name and a plate over its head,
// turns it toward you when you come close, and hands a click to the Talk panel.
//
// WHERE THEY STAND, which is now two different things.
//
//   A PRECINCT TOWN has a plan. `town_layout.layoutTown` says where the inn,
//   the forge, the pens, the healer and the bank are and which way each of them
//   faces, so the five people who keep those buildings stand at their own doors
//   and everybody else takes the square. Nothing is copied and nothing is
//   guessed: the door is `doorOf(lot, DOOR_STAND)` off the same plan
//   `town_models.js` builds the walls from, so a person cannot end up standing
//   in one.
//
//   A ROLLED VILLAGE has no plan, and keeps the ring it has always had.
//   `site_models.settlement()` lays it out between `plaza` and `ring` metres
//   from the well but keeps those numbers private, so `PLAZA` below is a COPY,
//   read off that function: town plaza 12, hamlet plaza 8. If site_models.js
//   ever shrinks its plaza the people will stand in a wall and nothing here
//   will notice. `auditNpcSpots()` at least holds the ring inside the flattened
//   ground and clear of the well, and runs at load.
//
// Everything geometric is a pure function, so the placement is tested in node
// against the real field without a renderer.

import * as THREE from 'three';
import { mulberry32, hash2 } from '../world/noise.js';
import { npcsFor, NPCS, NPC_LIST, TOWN_NPCS } from '../mmo/npcs.js';
import { layoutTown, lotOf, doorOf, REQUIRED_LOTS } from '../world/town_layout.js';
import { buildCharacter as defaultBuildCharacter, poseCharacter, PALETTE } from './player.js';

/** How far out settlements are peopled. Smaller than the world's view radius. */
export const NEAR_RING = 320;
/** You have to walk up to somebody to talk to them. */
export const TALK_REACH = 4;
/** They notice you at this range and turn. */
export const NOTICE = 6;
/** Name plates stop drawing past this, so a town does not become a wall of text. */
export const PLATE_RANGE = 45;
/** How fast a standing person turns, radians a second. */
export const TURN_RATE = 1.8;
/** The player has to move this far before the town list is asked for again. */
export const RESTREAM = 48;

// Copies of site_models.js's private layout numbers. See the note at the top.
export const PLAZA = { town: 12, hamlet: 8, ruin: 3 };
/** The ring the people stand on, inside the plaza and clear of the well. */
export const NPC_RING = { town: 8, hamlet: 5, ruin: 1.6 };
/** The well and its roof posts take the middle of a settlement square. */
export const WELL_CLEAR = 2.2;

/** Which site kinds hold people at all. `npcs.js` names the same three. */
export const PEOPLED = ['town', 'hamlet', 'ruin'];

/**
 * The seven precinct towns have real buildings, so their people stand at real
 * doors: the innkeeper under the sign, the smith at his forge, the stablemaster
 * at the pens, the healer and the banker at their own doors. Everybody else
 * takes the ring in the square, which is where the market is.
 *
 * A rolled village has no plan and keeps the ring it has always had.
 */
export const TOWN_ANCHOR = {
  innkeeper: 'inn', blacksmith: 'forge', healer: 'healer',
  stablemaster: 'pens', banker: 'bank',
};
/** Metres a person stands out from the wall of the building they keep. */
export const DOOR_STAND = 2.0;

// Given names, from work and weather and birds, the same register the site
// names use. Never a fantasy word list.
export const GIVEN_NAMES = [
  'Alred', 'Bess', 'Cobb', 'Dunnock', 'Elsy', 'Fenn', 'Gerry', 'Hald',
  'Ivy', 'Jem', 'Kett', 'Lark', 'Mabb', 'Nell', 'Orrin', 'Pell',
  'Quill', 'Rook', 'Sef', 'Tam', 'Udd', 'Vess', 'Wren', 'Yarrow',
];

// A tunic colour for each of the fifteen roles, so a street reads at a glance
// before any plate is legible. Every id in npcs.js has one; the audit says so.
export const ROLE_TINT = {
  blacksmith: 0x4a3f38, tailor: 0x8a5f7a, bowyer: 0x5d6b3a, alchemist: 0x3f6f6a,
  healer: 0xcfc7b4, mage: 0x3d4a86, provisioner: 0x7a6234, stablemaster: 0x6b4a2e,
  weaponsmaster: 0x7a3b32, ranger: 0x38553a, bard: 0x8a6f2e, necromancer: 0x2b2733,
  thief: 0x33333a, innkeeper: 0x6d5136, banker: 0x2f3c4e,
};

/** The plate over a head. Named the way the world would name them. */
export const plateText = (npc) => `${npc.personName}, the ${npc.role.name}`;

/**
 * The spots for `n` people at a site: a ring inside the plaza, evenly spaced
 * from the site's own facing so the street is the same for everybody, each
 * turned toward the centre. Pure: no field, no THREE.
 */
export function npcSpotsFor(site, n) {
  const r = NPC_RING[site.kind] ?? NPC_RING.hamlet;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + (site.facing || 0);
    const x = site.x + Math.cos(a) * r;
    const z = site.z + Math.sin(a) * r;
    out.push({ x, z, yaw: Math.atan2(site.x - x, site.z - z) });
  }
  return out;
}

/** A person's given name, stable for a site, a role and a place in the street. */
export function nameFor(site, roleId, index) {
  const h = hash2(site.cx | 0, site.cz | 0, 3907 + index * 31 + roleId.length);
  return GIVEN_NAMES[h % GIVEN_NAMES.length];
}

/**
 * Whether a hamlet stands on a forest edge, which is the one thing `npcsFor`
 * asks about a settlement. Eight samples at 45 m: any boreal or sakura ground
 * makes it a forest edge. Deterministic, because the field is.
 */
export function forestEdgeAt(field, x, z, r = 45) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = field.sampleAt(x + Math.cos(a) * r, z + Math.sin(a) * r).biome;
    if (b === 'boreal' || b === 'sakura') return true;
  }
  return false;
}

// A town's plan is worked out once and kept. `restream` asks for a street every
// time the player walks 48 m, and packing forty five lots on every one of those
// would be paid for out of the frame the player is standing in.
const PLANS = new Map();
/** The plan of a precinct town, or null for a village the world rolled. */
export function townPlanFor(site) {
  if (!site || site.kind !== 'town' || !site.authored) return null;
  if (PLANS.has(site.id)) return PLANS.get(site.id);
  let plan = null;
  try { plan = layoutTown(site, 0); } catch (err) { console.warn('a town plan threw', err); }
  PLANS.set(site.id, plan);
  return plan;
}

/**
 * Who stands in a precinct town: everybody with a building, and enough of the
 * rolled street to fill the square. `npcsFor` alone would leave the smithy shut
 * and the bank empty two towns in three, because it draws six to nine roles out
 * of thirteen and does not know which of them own a door.
 */
function townRoles(site, rng) {
  const want = new Set(['provisioner', ...Object.keys(TOWN_ANCHOR)]);
  for (const role of npcsFor({ kind: 'town', bank: true }, rng)) {
    if (want.size >= TOWN_NPCS[1]) break;
    want.add(role.id);
  }
  return NPC_LIST.filter((n) => want.has(n.id));
}

/**
 * The whole street of one site: role, name, spot, in a stable order. Pure but
 * for the field it samples. This is the function the node test drives.
 */
export function streetFor(site, field, opts = {}) {
  if (!PEOPLED.includes(site.kind)) return [];
  const rng = mulberry32(hash2(site.cx | 0, site.cz | 0, opts.salt ?? 0x9e37));
  const plan = site.kind === 'town' ? townPlanFor(site) : null;
  const forestEdge = site.kind === 'hamlet' && field ? forestEdgeAt(field, site.x, site.z) : false;
  // `bank` is false without a plan, and that is what keeps a Banker out of a
  // village that has no bank for one to stand in.
  const roles = plan ? townRoles(site, rng) : npcsFor({ kind: site.kind, forestEdge, bank: false }, rng);

  // The people without a building of their own share the ring in the square,
  // and are spaced as if they were the whole street, so a town of nine with
  // five doors does not put its four traders shoulder to shoulder.
  const loose = roles.filter((r) => !(plan && TOWN_ANCHOR[r.id]));
  const ring = npcSpotsFor(site, Math.max(3, loose.length));
  let next = 0;

  return roles.map((role, i) => {
    let spot = null;
    if (plan && TOWN_ANCHOR[role.id]) {
      const lot = lotOf(plan, TOWN_ANCHOR[role.id]);
      if (lot) {
        const at = doorOf(lot, DOOR_STAND);
        spot = { x: at.x, z: at.z, yaw: at.yaw };
      }
    }
    if (!spot) spot = ring[next++ % ring.length];
    return {
      id: `${site.id}:${role.id}`,
      site,
      role,
      personName: nameFor(site, role.id, i),
      nightOnly: !!role.nightOnly,
      at: plan && TOWN_ANCHOR[role.id] ? TOWN_ANCHOR[role.id] : 'square',
      x: spot.x,
      z: spot.z,
      homeYaw: spot.yaw,
    };
  });
}

/** Every claim this module's layout makes, checked at load. */
export function auditNpcSpots() {
  const bad = [];
  for (const kind of PEOPLED) {
    const ring = NPC_RING[kind], plaza = PLAZA[kind];
    if (!(ring > 0)) bad.push(`${kind}: no ring radius`);
    if (!(ring < plaza)) bad.push(`${kind}: the ring is ${ring} m, the innermost building stands at ${plaza} m`);
    if (kind !== 'ruin' && !(ring > WELL_CLEAR)) bad.push(`${kind}: the ring is ${ring} m and the well takes ${WELL_CLEAR} m`);
  }
  for (const id of Object.keys(NPCS)) {
    if (ROLE_TINT[id] === undefined) bad.push(`role ${id} has no tunic colour`);
  }
  for (const id of Object.keys(ROLE_TINT)) {
    if (!NPCS[id]) bad.push(`there is a tunic colour for "${id}", which is not a role`);
  }
  // Every role that owns a building has one to own, and every building it is
  // pointed at is a building `town_layout` promises every town has.
  for (const [roleId, kind] of Object.entries(TOWN_ANCHOR)) {
    if (!NPCS[roleId]) bad.push(`the ${roleId} keeps the ${kind} and is not a role`);
    else if (!NPCS[roleId].appearsIn.includes('town')) bad.push(`the ${roleId} keeps the ${kind} and never stands in a town`);
    if (!REQUIRED_LOTS.includes(kind)) bad.push(`the ${roleId} stands at a ${kind}, which is not a building every town has`);
  }
  // A precinct town holds its anchors plus a provisioner, and npcs.js has to
  // allow a street that wide or somebody's door would always be shut.
  const anchored = Object.keys(TOWN_ANCHOR).length + 1;
  if (anchored > TOWN_NPCS[1]) bad.push(`a town needs ${anchored} people to keep its doors and npcs.js allows ${TOWN_NPCS[1]}`);

  // Two people must never share a spot. The tightest case is a ruin's one
  // stall; the widest is a town of nine.
  for (const [kind, n] of [['town', 9], ['hamlet', 4], ['ruin', 1]]) {
    const spots = npcSpotsFor({ x: 0, z: 0, kind, facing: 0 }, n);
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      const d = Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z);
      if (d < 1.2) bad.push(`${kind} of ${n}: two people stand ${d.toFixed(2)} m apart`);
    }
  }
  if (bad.length) throw new Error(`auditNpcSpots: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { kinds: PEOPLED.length, roles: Object.keys(ROLE_TINT).length };
}

auditNpcSpots();

// ---------------------------------------------------------------------------

const CSS = `
.bw-plate-layer{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:28}
.bw-plate{position:absolute;left:0;top:0;transform:translate(-50%,-100%);white-space:nowrap;
  font:600 12px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:#f0e9da;text-shadow:0 1px 0 #000,0 0 4px #000;padding:1px 5px;border-radius:4px;
  background:rgba(14,16,20,.42);will-change:transform,opacity}
.bw-plate.near{color:#ffe4a6}
`;

/**
 * @param sc         the object from createScene
 * @param runtime    the object from createWorldRuntime
 * @param opts.buildCharacter  the rig factory; player.js's by default
 * @param opts.rng   accepted for the contract. Placement never uses it: every
 *                   roll comes off the site's own cell hash, so two clients
 *                   with the same seed see the same street.
 * @param opts.root  where name plates go; the HUD root in the running game
 * @param opts.ctx   the window ctx, for `windows`, `hud` and `audio` on a click
 */
export function createNpcs(sc, runtime, opts = {}) {
  const build = opts.buildCharacter || defaultBuildCharacter;
  const ring = opts.ring ?? NEAR_RING;
  const field = runtime?.field;
  const ctx = opts.ctx || {};
  const scene = sc?.scene;
  const doc = typeof document !== 'undefined' ? document : null;
  const root = opts.root || (doc ? doc.body : null);

  const live = new Map();          // id -> npc record
  let lastX = Infinity, lastZ = Infinity;
  let meshCache = null;
  let night = false;

  // ---- the plate layer ----------------------------------------------------
  let layer = null;
  if (doc && root) {
    if (!doc.getElementById('bw-plate-css')) {
      const st = doc.createElement('style');
      st.id = 'bw-plate-css';
      st.textContent = CSS;
      doc.head.appendChild(st);
    }
    layer = doc.createElement('div');
    layer.className = 'bw-plate-layer';
    root.appendChild(layer);
  }

  // ---- bodies -------------------------------------------------------------

  /**
   * One rig, tinted. player.js caches its five materials on the module, so
   * every character in the world shares them: colouring one would colour the
   * player too. Each body therefore gets its own clones, and the tunic clone is
   * the one that takes the role's colour. The tunic is found by its palette
   * value rather than by a name, so a rig that renames its parts still works.
   */
  function bodyFor(npc) {
    const rig = build();
    const seen = new Map();
    const tint = ROLE_TINT[npc.role.id] ?? PALETTE.tunic;
    const h = hash2(npc.site.cx | 0, npc.site.cz | 0, npc.personName.length * 17 + 5);
    rig.group.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      let clone = seen.get(o.material);
      if (!clone) {
        clone = o.material.clone ? o.material.clone() : o.material;
        const hex = clone.color?.getHex?.();
        if (hex === PALETTE.tunic) clone.color.setHex(tint);
        // a little variety in skin and hair so a street is not fourteen twins
        else if (hex === PALETTE.skin) clone.color.offsetHSL(0, 0, ((h % 7) - 3) * 0.012);
        else if (hex === PALETTE.hair) clone.color.offsetHSL(((h >> 3) % 9 - 4) * 0.01, 0, ((h >> 6) % 5 - 2) * 0.02);
        seen.set(o.material, clone);
      }
      o.material = clone;
      o.castShadow = true;
      o.userData.npc = npc;
    });
    return rig;
  }

  function spawn(rec) {
    const y = field ? field.heightAt(rec.x, rec.z) : 0;
    const rig = bodyFor(rec);
    rig.group.position.set(rec.x, y, rec.z);
    rig.group.rotation.y = rec.homeYaw;
    rig.group.name = `npc:${rec.id}`;
    const npc = Object.assign(rec, {
      group: rig.group,
      parts: rig.parts,
      y,
      yaw: rec.homeYaw,
      t: 0,
      plate: null,
      posed: !!(rig.parts && rig.parts.hips && rig.parts.shinL),
    });
    npc.group.userData.npc = npc;
    scene?.add(npc.group);
    if (layer) {
      const el = doc.createElement('div');
      el.className = 'bw-plate';
      el.textContent = plateText(npc);
      layer.appendChild(el);
      npc.plate = el;
    }
    live.set(npc.id, npc);
    meshCache = null;
    return npc;
  }

  function despawn(npc) {
    scene?.remove(npc.group);
    npc.group.traverse?.((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (o.material && !Array.isArray(o.material)) o.material.dispose?.();
      }
    });
    npc.plate?.remove();
    live.delete(npc.id);
    meshCache = null;
  }

  /** Rebuild the list of who is nearby. Only when the player has really moved. */
  function restream(x, z, force) {
    if (!force && Math.hypot(x - lastX, z - lastZ) < RESTREAM) return;
    lastX = x; lastZ = z;
    const keep = new Set();
    for (const site of (runtime.sitesNear(x, z, ring) || [])) {
      if (!PEOPLED.includes(site.kind)) continue;
      for (const rec of streetFor(site, field)) {
        keep.add(rec.id);
        if (!live.has(rec.id)) spawn(rec);
      }
    }
    for (const npc of [...live.values()]) if (!keep.has(npc.id)) despawn(npc);
  }

  // ---- the frame ----------------------------------------------------------

  const v = new THREE.Vector3();

  /**
   * @param dayFactor 0 at night, 1 in the day, the same number scene.js uses.
   *   The Necromancer keeps his stall at night and is not there by day, which
   *   is the only thing npcs.js says about time, so when this is left out
   *   nobody is hidden and the ruin's stall stands all day.
   */
  function update(dt, playerPos, dayFactor) {
    if (!playerPos) return;
    night = dayFactor == null ? night : dayFactor < 0.4;
    restream(playerPos.x, playerPos.z, false);

    const camReady = !!sc?.camera;
    const w = layer ? (layer.clientWidth || 1) : 1;
    const h = layer ? (layer.clientHeight || 1) : 1;

    for (const npc of live.values()) {
      const hidden = npc.nightOnly && dayFactor != null && !night;
      npc.group.visible = !hidden;
      if (npc.plate) npc.plate.style.display = hidden ? 'none' : '';
      if (hidden) continue;

      npc.t += dt;
      const dx = playerPos.x - npc.x, dz = playerPos.z - npc.z;
      const d = Math.hypot(dx, dz);
      // a slow turn toward you when you are close, and back to the square when
      // you are not: the body never snaps
      const want = d <= NOTICE && d > 1e-3 ? Math.atan2(dx, dz) : npc.homeYaw;
      let diff = want - npc.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const step = TURN_RATE * dt;
      npc.yaw += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
      npc.group.rotation.y = npc.yaw;

      if (npc.posed) {
        try {
          poseCharacter(npc.parts, { anim: 'idle', phase: 0, stride: 1.4, idleMix: 1, t: npc.t });
        } catch { npc.posed = false; }
      }

      if (npc.plate && camReady) {
        if (d > PLATE_RANGE) { npc.plate.style.opacity = '0'; continue; }
        v.set(npc.x, npc.y + 2.05, npc.z).project(sc.camera);
        if (v.z > 1) { npc.plate.style.opacity = '0'; continue; }
        const px = (v.x + 1) / 2 * w, py = (1 - v.y) / 2 * h;
        npc.plate.style.transform = `translate(${px.toFixed(0)}px,${py.toFixed(0)}px) translate(-50%,-100%)`;
        npc.plate.style.opacity = (d > PLATE_RANGE * 0.8 ? 0.45 : 1).toFixed(2);
        npc.plate.classList.toggle('near', d <= TALK_REACH);
      }
    }
  }

  /** Every mesh of every visible body, for the raycaster. */
  function meshes() {
    if (!meshCache) {
      meshCache = [];
      for (const npc of live.values()) {
        if (!npc.group.visible) continue;
        npc.group.traverse((o) => { if (o.isMesh) meshCache.push(o); });
      }
    }
    return meshCache;
  }

  /** Whoever is under the ray, nearest first, or null. */
  function pick(raycaster) {
    if (!raycaster) return null;
    const list = meshes().filter((m) => m.visible !== false);
    if (!list.length) return null;
    const hits = raycaster.intersectObjects(list, false);
    for (const hit of hits) {
      const npc = hit.object.userData.npc;
      if (npc && live.has(npc.id)) return { npc, distance: hit.distance, point: hit.point };
    }
    return null;
  }

  /** The closest person to a point within `r` metres, or null. */
  function nearest(pos, r = TALK_REACH) {
    if (!pos) return null;
    let best = null, bd = r;
    for (const npc of live.values()) {
      if (!npc.group.visible) continue;
      const d = Math.hypot(npc.x - pos.x, npc.z - pos.z);
      if (d <= bd) { bd = d; best = npc; }
    }
    return best ? { npc: best, distance: bd } : null;
  }

  /**
   * A click. Opens Talk when the ray found somebody and you are close enough,
   * and says why not when it did not, because a click that does nothing and
   * says nothing is indistinguishable from a broken button.
   */
  function click(raycaster, playerPos) {
    const hit = pick(raycaster);
    if (!hit) return { npc: null, opened: false, text: null };
    const npc = hit.npc;
    const d = playerPos ? Math.hypot(npc.x - playerPos.x, npc.z - playerPos.z) : 0;
    if (d > TALK_REACH) {
      const text = `${plateText(npc)} is ${Math.round(d)} m off. Walk up to them.`;
      ctx.hud?.toast?.(text);
      ctx.audio?.play?.('denied');
      return { npc, opened: false, text };
    }
    const opened = !!ctx.windows?.open?.('talk', { npc });
    if (!opened) {
      const text = `${plateText(npc)} has nothing to say yet.`;
      ctx.hud?.toast?.(text);
      return { npc, opened: false, text };
    }
    return { npc, opened: true, text: plateText(npc) };
  }

  function dispose() {
    for (const npc of [...live.values()]) despawn(npc);
    layer?.remove();
  }

  // the first street, so a town the player is already standing in has people
  // in it on the frame the game boots and not 48 m later
  if (runtime?.sitesNear) {
    const p = opts.at || { x: 0, z: 0 };
    restream(p.x, p.z, true);
  }

  return {
    update, pick, nearest, click, meshes, dispose,
    list: () => [...live.values()],
    get count() { return live.size; },
    at: (id) => live.get(id) || null,
    TALK_REACH,
  };
}
