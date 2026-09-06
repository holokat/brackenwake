// What is open to a player, and what is still being built behind the fog.
//
// The whole world exists in the data and the tour can reach all of it, but a
// player is held inside the realms named here until the rest is ready. The
// Greenwold is the vertical slice: everything the first hour needs, complete,
// before a second realm opens. Beyond the open ground the road is closed in
// the fiction's own words, said once, and the player is set back a few
// metres inside the line. Dev mode walks through it.
//
// Streaming already loads only the chunks around the player, so a closed realm
// costs nothing until it is entered; this gate is for the game, not the frame
// rate, and it says so honestly in the docs.
import { ZONE, weightOf } from '../world/zones.js';

/** The realms a player may stand in. Add one when it is finished, not before. */
export const OPEN_REALMS = ['greenwold'];

/** Metres inside the line the player is set back to when they cross it. */
export const GATE_STEP_BACK = 6;

/** Said the first time a player is turned back, and again after this many ms. */
export const GATE_SAY_EVERY_MS = 20000;

export const GATE_LINE = 'The stones hum and the road beyond them is not open yet. The Greenwold is the whole of the world for now.';

export const isOpen = (realmId) => OPEN_REALMS.includes(realmId);

/**
 * Is this point on open ground? Inside any open realm's radius plus half its
 * edge band, so a player can stand on the border and look out, and not in a
 * realm that is closed. Pure.
 */
export function openAt(x, z) {
  for (const id of OPEN_REALMS) {
    const zn = ZONE[id];
    if (!zn) continue;
    const reach = zn.r + (zn.edge || 0) * 0.5;
    if (Math.hypot(x - zn.x, z - zn.z) <= reach) return true;
  }
  return false;
}

/**
 * Where a player who has crossed the line is set back to: the nearest point
 * on the nearest open realm's line, GATE_STEP_BACK metres inside it. Pure.
 */
export function insidePoint(x, z) {
  let best = null, bestD = Infinity;
  for (const id of OPEN_REALMS) {
    const zn = ZONE[id];
    if (!zn) continue;
    const d = Math.hypot(x - zn.x, z - zn.z);
    if (d < bestD) { bestD = d; best = zn; }
  }
  if (!best) return { x: 0, z: 0 };
  const reach = best.r + (best.edge || 0) * 0.5 - GATE_STEP_BACK;
  const d = Math.hypot(x - best.x, z - best.z) || 1;
  return { x: best.x + (x - best.x) / d * reach, z: best.z + (z - best.z) / d * reach };
}

/** A weight in the open world at a point, for anything that fades at the line. */
export const openWeight = (x, z) => Math.max(0, ...OPEN_REALMS.map((id) => (ZONE[id] ? weightOf(ZONE[id], x, z) : 0)));
