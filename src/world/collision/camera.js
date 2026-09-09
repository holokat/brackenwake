// Continuous camera sweeps against the same metre-space architecture as the
// player. Inflate each envelope by the camera's near-plane radius; a point ray
// alone lets the edge of the picture enter stone at oblique angles.
export function cameraBodyFraction(body, from, to, radius) {
  if (body.enabled && !body.enabled()) return 1;
  const c = body.c ?? 1, s = body.s ?? 0;
  const dx = from.x - body.x, dz = from.z - body.z;
  const x = dx * c - dz * s, z = dx * s + dz * c, y = from.y - body.y;
  const vx = (to.x - from.x) * c - (to.z - from.z) * s;
  const vz = (to.x - from.x) * s + (to.z - from.z) * c, vy = to.y - from.y;
  let enter = 0, leave = 1;
  // Clip a segment against n dot p <= limit. Keeping the interval analytic
  // catches thin walls even during a fast orbit or a teleport.
  const plane = (value, velocity, limit) => {
    if (Math.abs(velocity) < 1e-12) return value <= limit;
    const t = (limit - value) / velocity;
    if (velocity < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    return enter <= leave;
  };
  if (body.kind === 'circle') {
    const a = vx * vx + vz * vz, b = 2 * (x * vx + z * vz);
    const k = x * x + z * z - (body.r + radius) ** 2;
    if (a < 1e-12) { if (k > 0) return 1; }
    else {
      const d = b * b - 4 * a * k;
      if (d < 0) return 1;
      enter = Math.max(enter, (-b - Math.sqrt(d)) / (2 * a));
      leave = Math.min(leave, (-b + Math.sqrt(d)) / (2 * a));
    }
  } else if (!plane(x, vx, body.w / 2 + radius) || !plane(-x, -vx, body.w / 2 + radius)
    || !plane(z, vz, body.d / 2 + radius) || !plane(-z, -vz, body.d / 2 + radius)) return 1;
  if (body.kind === 'ramp') {
    const slope = body.h / body.d * (body.direction < 0 ? -1 : 1);
    const pad = radius * Math.hypot(1, slope);
    if (!plane(y - slope * z, vy - slope * vz, body.h / 2 + pad)) return 1;
    if (body.thickness > 0) {
      if (!plane(-y + slope * z, -vy + slope * vz, -body.h / 2 + body.thickness + pad)) return 1;
    } else if (!plane(-y, -vy, radius)) return 1;
  } else if (!plane(y, vy, body.h + radius) || !plane(-y, -vy, radius)) return 1;
  return enter <= leave && leave >= 0 && enter <= 1 ? Math.max(0, enter) : 1;
}

/** Spatial buckets are shared with player collision; no scene-wide raycast. */
export function cameraSweep(cells, cell, from, to, radius) {
  const seen = new Set(); let fraction = 1;
  for (let x = Math.floor((Math.min(from.x, to.x) - radius) / cell); x <= Math.floor((Math.max(from.x, to.x) + radius) / cell); x++) {
    for (let z = Math.floor((Math.min(from.z, to.z) - radius) / cell); z <= Math.floor((Math.max(from.z, to.z) + radius) / cell); z++) {
      for (const body of cells.get(x + ',' + z) || []) {
        if (seen.has(body)) continue;
        seen.add(body);
        fraction = Math.min(fraction, cameraBodyFraction(body, from, to, radius));
      }
    }
  }
  return fraction * Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}
