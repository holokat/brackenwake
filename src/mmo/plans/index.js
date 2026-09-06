// The Greenwold's nine plans, loaded and checked.
//
// Every named place in the realm is authored from a concept image rather than
// rolled by the world. `docs/concepts/greenwold/PLANS.md` is Fable's reading of
// the nine paintings, the JSON beside this file is that reading as data, and
// `plan_schema.js` says what a plan is and refuses a broken one at load. See
// `docs/mmo/wiring/P1.md` for the lines that put these in the running game.
//
// `PLANS` is keyed by the PLACE id in `zones.js` LAYOUT, which is what
// `site.sub` carries, so the whole of the hook in `site_models.buildSiteMarker`
// is `PLANS[site.sub]`.

import hearthhome from './hearthhome.json' with { type: 'json' };
import waystones from './waystones.json' with { type: 'json' };
import millrun from './millrun.json' with { type: 'json' };
import oldcellars from './oldcellars.json' with { type: 'json' };
import beechhangar from './beechhangar.json' with { type: 'json' };
import kingsroad from './kingsroad.json' with { type: 'json' };
import greenwoldpits from './greenwoldpits.json' with { type: 'json' };
import highwaymanshollow from './highwaymanshollow.json' with { type: 'json' };
import sunkenchapel from './sunkenchapel.json' with { type: 'json' };
import { auditPlans } from './plan_schema.js';
import { insidePlan, PLAN_MARGIN } from './footprints.js';
import { SPACES } from '../spaces/index.js';

/** Every plan, by the place it is drawn about. */
export const PLANS = Object.freeze({
  hearthhome, waystones, millrun, oldcellars, beechhangar,
  kingsroad, greenwoldpits, highwaymanshollow, sunkenchapel,
});

/** The nine ids, in the order the sheet lists the Greenwold's places. */
export const PLAN_IDS = Object.freeze(Object.keys(PLANS));

/** The plan of a place, or null. `site.sub` is the key. */
export const planFor = (place) => PLANS[place] || null;

/**
 * The plan OR the space keyed by this id.
 *
 * A space (src/mmo/spaces/) is a plan that stands at a point instead of at a
 * named place, and a space's site row carries its id as `sub` exactly as a
 * planned place does. So the three functions below, which are the whole of
 * what the rest of the game asks a plan for, answer for both. There is no
 * second path: a space's people are stood by `npcs_runtime.streetFor`, its
 * monsters by `monsters.plannedSpawnsForChunk` and its ground is left alone by
 * `dressing.js`, all through these three calls and no others.
 */
export const layoutFor = (id) => PLANS[id] || SPACES[id] || null;

/**
 * The people a plan stands, for `npcs_runtime.streetFor`.
 *
 * `name` is a person id in `story.js` where the plan names one of the cast and
 * null where it only asks for whoever keeps that door: the game names those
 * itself, the way it always has. `role` is a role id in `npcs.js` or in
 * `story.js`'s STORY_ROLES, and both are checked at load.
 */
export const peopleFor = (place) => (layoutFor(place)?.people || []);

/**
 * The monsters a plan puts in a place, for `monsters.placeFor`.
 *
 * `night` is true for a row that is only there after dark, so a caller that
 * knows the hour passes it and one that does not gets the day's list. Old Grist
 * standing in the Beech Hangar and the Miller's Son's six in the hollow are
 * both night rows and both come back empty by day.
 */
export function spawnsFor(place, night = false) {
  const all = layoutFor(place)?.spawns || [];
  return night ? all : all.filter((s) => !s.night);
}

/**
 * Whether a world point stands on planned ground.
 *
 * `dressing.js` asks this so that the hay ricks and the wayside shrines the
 * open Greenwold grows every forty metres stop at the edge of a place somebody
 * painted. It takes the SITE row rather than a point, because the Standing
 * Hedge's plan is laid nine times on a ring a mile across and the middle of
 * that ring is an empty field.
 */
export function inPlannedPlace(site, x, z, margin = PLAN_MARGIN) {
  if (!site || !site.sub) return false;
  const plan = layoutFor(site.sub);
  return plan ? insidePlan(plan, site, x, z, margin) : false;
}

/** What the audit measured, so a caller can say the number without counting. */
export const PLAN_STATS = auditPlans(PLANS);
