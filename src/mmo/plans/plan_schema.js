// What a plan is, and the check that a plan is one.
//
// Every named place in the Greenwold is authored from a concept image rather
// than rolled. `docs/concepts/greenwold/PLANS.md` is the reading of the nine
// paintings and the nine JSON files beside this one are that reading as data.
// This file says what shape those files have and refuses, at load, to let a
// broken one into the game.
//
// THE SHAPE
//
//   {
//     id       'hearthhome', the plan's own name and the key in PLANS
//     place    the id in zones.js LAYOUT this plan is drawn about
//     radius   metres from the centre; nothing in the plan stands outside it
//     arrival  { x, z, yaw } where a player arrives and which way they look
//     pieces   [{ model, x, z, yaw, scale?, tag?, on? }]
//     runs     [{ model, from: {x,z}, to: {x,z}, scale? }]
//     areas    [{ kind, points, w?, y?, lift? }]
//     people   [{ name, role, x, z, yaw }]
//     spawns   [{ id, x, z, night? }]
//     notes    a sentence about the place, in an author's voice
//   }
//
// x is east and z is north, both in metres from the place's centre in zones.js
// LAYOUT. `yaw` is degrees clockwise from north, the way the sheet writes it,
// and is turned into radians once, in `plan_models.buildPlan`.
//
//   A PIECE stands somewhere. `model` is an id in `MODELS.md` and therefore a
//   row in `plan_models.FOOTPRINT`. `scale` multiplies the footprint and the
//   body together, so a scaled piece is checked at the size it is really built.
//   `on` names another piece's model that this one stands on or in: a lookout
//   platform on an oak, a wheel on a mill, a lantern hung in an arch. It is the
//   only way two footprints may overlap, and the audit demands that a piece
//   which claims it really does overlap one of those.
//
//   A RUN is laid piece by piece along a line: a wall, a hedge, a fence, a rail
//   or a road. Its pieces are made to touch, which is why they are not checked
//   against each other, and `plan_models.RUN_SPAN` is the only table that says
//   which models may be run.
//
//   AN AREA is ground, not a body. `lane` is a POLYLINE and `points` is the
//   line it follows, `w` metres wide. `water`, `mud`, `bare` and `wheat` are
//   POLYGONS and `points` is the outline. A lane and a polygon both lie
//   `plan_models.DECAL_LIFT` over the terrain and follow it, except water,
//   which is flat: `y` is metres above the ground at the place's own centre.
//
//   A PERSON is data, not a body. `plan_models` does not build people;
//   `npcs_runtime` does, off `peopleFor(planId)`. `role` is a role id in
//   `npcs.js` or in `story.js`'s STORY_ROLES. `name` is a person id in
//   `story.js` when the plan names one of the cast, and null when the plan only
//   asks for whoever keeps that door, which the game names itself.
//
//   A SPAWN is a monster row id out of `src/mmo/monsters.js` and a point to put
//   it at. `night: true` means it is only there after dark.
//
// WHAT THE AUDIT REFUSES, at import, both directions driven in
// `src/mmo/plans/plans.test.mjs`.

import { ZONE } from '../../world/zones.js';
import { MONSTERS } from '../monsters.js';
import { NPCS } from '../npcs.js';
import { STORY_ROLES, PERSON } from '../story.js';
import { FOOTPRINT, footprintOf, isRunKind, hasStandIn, AREA_KINDS } from './footprints.js';

/** How close two footprints may come before it counts as an overlap, metres. */
export const OVERLAP_SLACK = 0.02;

/** A rectangle in the plan's own frame: centre, half extents, yaw in radians. */
export function rectOf(piece) {
  const f = footprintOf(piece);
  if (!f) return null;
  return { x: piece.x, z: piece.z, hw: f[0] / 2, hd: f[1] / 2, a: (piece.yaw || 0) * Math.PI / 180 };
}

/** The four corners of a rectangle, in the plan's frame. */
export function cornersOf(r) {
  const c = Math.cos(r.a), s = Math.sin(r.a);
  const out = [];
  for (const [ox, oz] of [[-r.hw, -r.hd], [r.hw, -r.hd], [r.hw, r.hd], [-r.hw, r.hd]]) {
    // yaw turns local +z toward the bearing: local (x, z) lands at
    // (x cos + z sin, z cos - x sin).
    out.push([r.x + ox * c + oz * s, r.z + oz * c - ox * s]);
  }
  return out;
}

/**
 * Whether two rectangles overlap, by separating axis on the real corners at the
 * real angles. Driven both ways in the test, including one rectangle clipping
 * another's corner at 45 degrees.
 */
export function rectsOverlap(a, b, slack = OVERLAP_SLACK) {
  const A = cornersOf(a), B = cornersOf(b);
  for (const [p, q] of [[A, B], [B, A]]) {
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % 4];
      const nx = -(z1 - z0), nz = x1 - x0;
      const len = Math.hypot(nx, nz) || 1;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const [x, z] of p) { const d = (x * nx + z * nz) / len; aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
      for (const [x, z] of q) { const d = (x * nx + z * nz) / len; bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
      if (aMax - slack <= bMin || bMax - slack <= aMin) return false;
    }
  }
  return true;
}

/** Whether a point is inside a rectangle. A person, or an arrival. */
export function pointInRect(x, z, r) {
  const c = Math.cos(-r.a), s = Math.sin(-r.a);
  const dx = x - r.x, dz = z - r.z;
  const lx = dx * c + dz * s, lz = dz * c - dx * s;
  return Math.abs(lx) <= r.hw && Math.abs(lz) <= r.hd;
}

/** How far the furthest corner of a piece reaches from the plan's centre. */
export const reachOf = (r) => Math.max(...cornersOf(r).map(([x, z]) => Math.hypot(x, z)));

const isRole = (id) => !!(NPCS[id] || STORY_ROLES[id]);

/** What a marker may be a marker FOR. The editor's Markers tab is this list. */
export const MARKER_KINDS = ['structure', 'monster', 'creature', 'tree', 'rock', 'prop', 'other'];

/**
 * Every plan, checked. Throws with all of it at once rather than the first
 * thing wrong, because a JSON is usually wrong in several places and finding
 * them one run at a time is how an afternoon goes.
 */
export function auditPlans(plans) { return auditAll(plans, 'plan'); }

/**
 * Every space, checked the same way.
 *
 * A SPACE is a plan that stands at a point rather than at a named place: it
 * carries `at: { x, z }` in absolute world metres instead of `place`, a `name`
 * and a `note` instead of `notes`, and three lists a plan has never had. It is
 * what the editor writes, and the editor is how the Greenwold gets laid out
 * space by space instead of scattered.
 *
 * Every rule a plan is held to, a space is held to as well: nothing outside
 * the radius, no two footprints in each other, no person inside a wall, no
 * monster id that is not a monster, no model without a body, no em dash.
 *
 * What it does NOT check is whether a tree species or a rock kind is real,
 * because that answer lives in arbor.js and dressing.js and this file is pure.
 * `plan_models.auditSpaceKinds` asks that question, at import, where those two
 * tables are already in hand, and spaces.test.mjs drives it both ways.
 */
export function auditSpaces(spaces) { return auditAll(spaces, 'space'); }

function auditAll(plans, kind = 'plan') {
  const isSpace = kind === 'space';
  const bad = [];
  const seen = new Set();
  let pieces = 0, runs = 0, areas = 0, people = 0, spawns = 0, exempt = 0;
  let trees = 0, rocks = 0, markers = 0;

  for (const [key, plan] of Object.entries(plans)) {
    const at = `the ${kind} "${key}"`;
    if (!plan || typeof plan !== 'object') { bad.push(`${at} is not a ${kind}`); continue; }
    if (plan.id !== key) bad.push(`${at} calls itself "${plan.id}"`);
    if (isSpace) {
      if (!plan.at || !Number.isFinite(plan.at.x) || !Number.isFinite(plan.at.z)) {
        bad.push(`${at} does not say where in the world it stands`);
      }
      if (typeof plan.name !== 'string' || !plan.name.trim()) bad.push(`${at} has no name`);
      if (plan.place) bad.push(`${at} names a place; a space stands at a point and carries "at" instead`);
    } else {
      if (seen.has(plan.place)) bad.push(`${at} is the second plan for the place "${plan.place}"`);
      seen.add(plan.place);
      if (!ZONE[plan.place]) bad.push(`${at} stands at "${plan.place}", which is not a place in zones.js`);
    }
    if (!(plan.radius > 0)) bad.push(`${at} has no radius`);
    const said = isSpace ? plan.note : plan.notes;
    if (isSpace) {
      if (said != null && typeof said !== 'string') bad.push(`${at} has a note that is not words`);
    } else if (typeof said !== 'string' || said.length < 12) bad.push(`${at} says nothing about itself`);
    if (/—/.test(JSON.stringify(plan))) bad.push(`${at} has an em dash in it`);

    const R = plan.radius || 0;
    const rects = [];
    for (const p of plan.pieces || []) {
      pieces++;
      const where = `${at}: the ${p.model} at ${p.x},${p.z}`;
      if (!FOOTPRINT[p.model]) { bad.push(`${where} has no footprint`); continue; }
      if (!hasStandIn(p.model)) bad.push(`${where} has no stand-in builder`);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { bad.push(`${where} is not anywhere`); continue; }
      const r = rectOf(p);
      r.model = p.model; r.on = p.on || null;
      if (reachOf(r) > R + 0.001) bad.push(`${where} reaches ${reachOf(r).toFixed(1)} m, outside the plan's ${R} m`);
      rects.push(r);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (!rectsOverlap(rects[i], rects[j])) continue;
        const a = rects[i], b = rects[j];
        if (a.on === b.model || b.on === a.model) { exempt++; continue; }
        bad.push(`${at}: the ${a.model} at ${a.x},${a.z} stands in the ${b.model} at ${b.x},${b.z}`);
      }
    }
    // A piece that claims to stand on another one had better be standing on it.
    for (const r of rects) {
      if (!r.on) continue;
      if (!rects.some((o) => o !== r && o.model === r.on && rectsOverlap(r, o))) {
        bad.push(`${at}: the ${r.model} at ${r.x},${r.z} says it stands on a ${r.on} and there is none under it`);
      }
    }

    for (const r of plan.runs || []) {
      runs++;
      const where = `${at}: the run of ${r.model}`;
      if (!isRunKind(r.model)) { bad.push(`${where} is not a model that may be run along a line`); continue; }
      if (!r.from || !r.to || !Number.isFinite(r.from.x) || !Number.isFinite(r.to.x)) { bad.push(`${where} has no line`); continue; }
      for (const end of [r.from, r.to]) {
        const d = Math.hypot(end.x, end.z);
        if (d > R + 0.001) bad.push(`${where} ends ${d.toFixed(1)} m out, outside the plan's ${R} m`);
      }
    }

    for (const a of plan.areas || []) {
      areas++;
      const where = `${at}: the ${a.kind} area`;
      if (!AREA_KINDS.includes(a.kind)) { bad.push(`${where} is not a ground treatment`); continue; }
      if (!Array.isArray(a.points) || a.points.length < 2) { bad.push(`${where} has no points`); continue; }
      if (a.kind !== 'lane' && a.points.length < 3) bad.push(`${where} is a polygon with ${a.points.length} corners`);
      for (const [x, z] of a.points) {
        if (Math.hypot(x, z) > R + 0.001) bad.push(`${where} reaches ${Math.hypot(x, z).toFixed(1)} m, outside the plan's ${R} m`);
      }
    }

    if (plan.arrival) {
      const { x, z } = plan.arrival;
      if (Math.hypot(x, z) > R + 0.001) bad.push(`${at}: the arrival is ${Math.hypot(x, z).toFixed(1)} m out, outside the ${kind}'s ${R} m`);
      for (const r of rects) if (pointInRect(x, z, r)) bad.push(`${at}: the arrival stands inside the ${r.model}`);
    } else if (!isSpace) bad.push(`${at} has no arrival`);

    for (const p of plan.people || []) {
      people++;
      const who = p.name || p.role;
      if (!isRole(p.role)) bad.push(`${at}: "${who}" keeps the role "${p.role}", which is not one`);
      if (p.name && !PERSON[p.name]) bad.push(`${at}: "${p.name}" is not one of the story's people`);
      if (p.name && PERSON[p.name] && PERSON[p.name].place !== plan.place) {
        bad.push(`${at}: ${PERSON[p.name].name} belongs to ${PERSON[p.name].place} and is standing in ${plan.place}`);
      }
      if (Math.hypot(p.x, p.z) > R + 0.001) bad.push(`${at}: "${who}" stands ${Math.hypot(p.x, p.z).toFixed(1)} m out, outside the plan's ${R} m`);
      for (const r of rects) if (pointInRect(p.x, p.z, r)) bad.push(`${at}: "${who}" is standing inside the ${r.model}`);
    }

    for (const s of plan.spawns || []) {
      spawns++;
      if (!MONSTERS[s.id]) bad.push(`${at}: "${s.id}" is not a monster row`);
      if (Math.hypot(s.x, s.z) > R + 0.001) bad.push(`${at}: the ${s.id} spawns ${Math.hypot(s.x, s.z).toFixed(1)} m out, outside the ${kind}'s ${R} m`);
    }

    // ---- the three lists only a space carries.
    //
    // A plan that grew one would be a plan the editor wrote, so they are
    // checked wherever they appear rather than only inside a space, and a PLAN
    // that carries one is told to be a space instead.
    for (const t of plan.trees || []) {
      trees++;
      if (!isSpace) { bad.push(`${at} plants trees, which only a space may do`); break; }
      const where = `${at}: the ${t.species || 'nameless'} at ${t.x},${t.z}`;
      if (typeof t.species !== 'string' || !t.species) bad.push(`${where} is not a species`);
      if (!Number.isFinite(t.x) || !Number.isFinite(t.z)) { bad.push(`${where} is not anywhere`); continue; }
      if (t.scale != null && !(t.scale > 0)) bad.push(`${where} is grown to a scale of ${t.scale}`);
      if (Math.hypot(t.x, t.z) > R + 0.001) bad.push(`${where} stands ${Math.hypot(t.x, t.z).toFixed(1)} m out, outside the ${kind}'s ${R} m`);
    }
    for (const r of plan.rocks || []) {
      rocks++;
      if (!isSpace) { bad.push(`${at} lays rocks, which only a space may do`); break; }
      const where = `${at}: the ${r.kind || 'nameless'} at ${r.x},${r.z}`;
      if (typeof r.kind !== 'string' || !r.kind) bad.push(`${where} is not a kind`);
      if (!Number.isFinite(r.x) || !Number.isFinite(r.z)) { bad.push(`${where} is not anywhere`); continue; }
      if (r.scale != null && !(r.scale > 0)) bad.push(`${where} is built to a scale of ${r.scale}`);
      if (Math.hypot(r.x, r.z) > R + 0.001) bad.push(`${where} lies ${Math.hypot(r.x, r.z).toFixed(1)} m out, outside the ${kind}'s ${R} m`);
    }
    for (const m of plan.markers || []) {
      markers++;
      if (!isSpace) { bad.push(`${at} carries markers, which only a space may do`); break; }
      const where = `${at}: the marker "${m.label || ''}" at ${m.x},${m.z}`;
      if (typeof m.label !== 'string' || !m.label.trim()) bad.push(`${where} says nothing, and a marker that says nothing marks nothing`);
      if (!MARKER_KINDS.includes(m.kind)) bad.push(`${where} is a "${m.kind}", which is not one of ${MARKER_KINDS.join(', ')}`);
      if (!Number.isFinite(m.x) || !Number.isFinite(m.z)) { bad.push(`${where} is not anywhere`); continue; }
      if (Math.hypot(m.x, m.z) > R + 0.001) bad.push(`${where} stands ${Math.hypot(m.x, m.z).toFixed(1)} m out, outside the ${kind}'s ${R} m`);
    }
  }

  if (bad.length) throw new Error(`${isSpace ? 'spaces' : 'plans'}: ` + bad.join('; '));
  const out = { plans: Object.keys(plans).length, pieces, runs, areas, people, spawns, exempt };
  if (isSpace) { out.spaces = out.plans; out.trees = trees; out.rocks = rocks; out.markers = markers; }
  return out;
}
