// The spaces: places laid out by hand, space by space, with the editor.
//
// WHAT A SPACE IS, AND WHY IT IS NOT A PLAN.
//
// A PLAN (src/mmo/plans/) is drawn about a named place in `zones.js` LAYOUT.
// There are nine of them, one per painting, and a tenth cannot exist until
// somebody adds a place to the world's own table.
//
// A SPACE stands wherever it says it stands. It carries `at: { x, z }` in
// absolute world metres instead of `place`, so the editor can put one down
// anywhere the camera is looking without touching zones.js. Everything else it
// is is a plan: the same pieces, the same runs, the same ground treatments, the
// same people and the same monster spawns, through the same code.
//
// THE THREE LISTS A PLAN HAS NEVER HAD
//
//   trees    [{ species, x, z, yaw, scale }]  grown by arbor.js, by name
//   rocks    [{ kind, x, z, yaw, scale }]     a flora boulder or a dressing body
//   markers  [{ x, z, label, note, kind }]    a note for a thing we have not made
//
// A MARKER IS THE POINT OF THE WHOLE EXERCISE. The user asked for "just a
// placeholder with some description for an object we create later", so a marker
// is a post with a board on it and words over it, built only while dev mode is
// on and invisible to a player, that says what is meant to stand there.
//
// WHERE A SPACE REACHES THE GAME. Five seams, and all five are the ones the
// plans already use, so a space is not a second code path:
//
//   sites.sitesNear       a space is a site row, so the streamer finds it
//   site_models           its chunk builds it with buildPlan, as a plan builds
//   plans.inPlannedPlace  the scatter stops inside its radius
//   plans.peopleFor       npcs_runtime stands its people
//   plans.spawnsFor       monsters.plannedSpawnsForChunk stands its monsters
//
// docs/mmo/wiring/ED1-EDITOR.md has the lines.

import { FILES } from './list.js';
import { auditSpaces } from '../plans/plan_schema.js';
import { setSculptBirth } from '../../world/zones.js';

/** Every space on disk, by id. Frozen, like PLANS. */
export const SPACES = Object.freeze({ ...FILES });

// A sculpt world with Hearthhome in it births on the green: the village's own
// arrival point, in world metres. zones.js cannot import this file (this file
// imports it, through the schema), so the birth is handed over here.
{
  const H = SPACES.greenwold_hearthhome;
  // on the green itself, beside the well, and not at the plan's arrival point,
  // which is the bridge: a character born over the river is born in it
  setSculptBirth(H && H.at ? { x: H.at.x + 6, z: H.at.z + 6, yaw: H.arrival ? H.arrival.yaw : 0 } : null);
}

/** The ids, in the order the generated list carries them. */
export const SPACE_IDS = Object.freeze(Object.keys(SPACES));

/** The space with this id, or null. */
export const spaceFor = (id) => SPACES[id] || null;

/** What a space is worth, as a site row's centre. */
export const centreOf = (space) => ({ x: space.at.x, z: space.at.z });

/**
 * A fresh, empty, valid space. The editor's "New space here" starts from this,
 * and `auditSpaces` accepts it as it stands, so the first thing the editor can
 * do is save an empty space and have the game load it.
 */
export function emptySpace(id, name, x, z, radius = 60) {
  return {
    id,
    name: name || id,
    note: '',
    at: { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 },
    radius,
    pieces: [], runs: [], areas: [], people: [], spawns: [],
    trees: [], rocks: [], markers: [],
  };
}

/** What the audit measured, so a caller can say the number without counting. */
export const SPACE_STATS = auditSpaces(SPACES);
