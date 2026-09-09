import {gltfAssets, canPrefetch} from './gltf_assets.js';
import {assetWork} from './work_queue.js';
import {cellarArrivalAsset} from '../../world/cellar_asset_catalog.js';
import {specFor} from '../../mmo/dungeons.js';

export function dungeonArrivalAsset(site, level = 1) {
  if (site?.kind !== 'dungeon' && site?.kind !== 'cave') return null;
  return specFor(site)?.id === 'oldcellars' ? cellarArrivalAsset(level) : null;
}

/** Prepare one arrival model. Surface prediction never constructs or explores a dungeon. */
export function createDungeonApproach({
  sitesNear, pool = gltfAssets, assetForSite = dungeonArrivalAsset,
  canSpeculate = canPrefetch, canDecode = () => assetWork.stats.frameMs <= 14,
  now = () => performance.now(), radius = 140, doorway = 18, decodeRadius = 45,
  lookahead = 25, grace = 3, retrySeconds = 10,
  visibilityTarget = globalThis.document, connection = globalThis.navigator?.connection,
} = {}) {
  let active = null, previous = null, elapsed = 0, sincePlan = 0, disposed = false;
  let requests = 0, handoffs = 0, decodedHandoffs = 0, lastHandoff = null;

  function clear() {
    if (!active) return;
    const old = active;
    active = null;
    old.lease?.release();
    pool.cancelPrefetch(old.url);
  }

  const suspend = () => {
    if (!canSpeculate()) {clear(); previous = null; sincePlan = 0;}
  };
  // A hidden tab may stop receiving animation frames before update can cancel work.
  visibilityTarget?.addEventListener?.('visibilitychange', suspend);
  connection?.addEventListener?.('change', suspend);

  function decode(record) {
    if (record.lease || elapsed < record.retryAt || !canDecode()) return;
    record.phase = 'decoding';
    const lease = pool.acquire(record.url, {priority: 0});
    record.lease = lease;
    lease.promise.then(asset => {
      if (active !== record) return;
      if (asset) {
        record.phase = 'ready';
        record.readyAfterMs = now() - record.startedAt;
      } else failed();
    }, failed);
    function failed() {
      lease.release();
      if (active !== record) return;
      record.lease = null;
      record.phase = 'failed';
      record.retryAt = elapsed + retrySeconds;
    }
  }

  function update(dt, point) {
    if (disposed || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    const delta = Math.max(0, dt || 0);
    elapsed += delta;
    sincePlan += delta;
    if (!canSpeculate()) {clear(); previous = null; sincePlan = 0; return;}
    const moved = previous ? Math.hypot(point.x - previous.x, point.z - previous.z) : 0;
    if (previous && sincePlan < .2 && moved < 12) return;
    let vx = previous && sincePlan > 0 ? (point.x - previous.x) / sincePlan : 0;
    let vz = previous && sincePlan > 0 ? (point.z - previous.z) / sincePlan : 0;
    const speed = Math.hypot(vx, vz);
    if (speed > 12) {vx = 0; vz = 0;} // A teleport is not evidence of heading toward a door.
    previous = {x: point.x, z: point.z};
    sincePlan = 0;

    let target = null;
    for (const site of sitesNear(point.x, point.z, radius)) {
      const url = assetForSite(site);
      if (!url) continue;
      const dx = site.x - point.x, dz = site.z - point.z, distance = Math.hypot(dx, dz);
      if (!Number.isFinite(distance) || distance > radius) continue;
      const closing = distance ? (dx * vx + dz * vz) / distance : 0;
      const heading = speed > 0 ? closing / speed : 0;
      const eta = closing > 0 ? distance / closing : Infinity;
      const approaching = closing >= .75 && heading >= .7 && eta <= lookahead;
      if (distance > doorway && !approaching) continue;
      if (!target || distance < target.distance) target = {site, url, distance, eta};
    }

    if (!target) {
      if (active && (elapsed - active.lastWanted >= grace
        || Math.hypot(point.x - active.site.x, point.z - active.site.z) > radius + 20)) clear();
      return;
    }
    if (active?.url !== target.url) {
      clear();
      active = {...target, phase: 'prefetching', lease: null, startedAt: now(),
        lastWanted: elapsed, lastRequest: -Infinity, retryAt: 0, readyAfterMs: null};
    }
    Object.assign(active, target, {lastWanted: elapsed});
    // A failed byte-only request has no lease to observe. Retry at a bounded rate.
    if (!active.lease && elapsed >= active.retryAt && elapsed - active.lastRequest >= retrySeconds) {
      if (pool.prefetch(active.url)) requests++;
      active.lastRequest = elapsed;
    }
    if (target.distance <= decodeRadius && (target.distance <= doorway || target.eta <= 8)) decode(active);
  }

  return {
    update,
    claim(site, level = 1) {
      if (disposed) return null;
      const url = assetForSite(site, level);
      const record = active?.url === url ? active : null;
      lastHandoff = {siteId: site?.id ?? null, url, phase: record?.phase ?? 'cold',
        leadMs: record ? now() - record.startedAt : 0, readyAfterMs: record?.readyAfterMs ?? null};
      // Acquire before releasing the surface lease or cancelling its byte prefetch.
      // Explicit entry remains allowed with data saving or slow-frame deferral enabled.
      const lease = url ? pool.acquire(url, {priority: 3}) : null;
      if (lease) {handoffs++; if (record?.phase === 'ready') decodedHandoffs++;}
      clear();
      previous = null;
      sincePlan = 0;
      return lease;
    },
    get stats() {
      return {phase: active?.phase ?? 'idle', siteId: active?.site.id ?? null,
        url: active?.url ?? null, distance: active?.distance ?? null,
        readyAfterMs: active?.readyAfterMs ?? null, requests, handoffs, decodedHandoffs, lastHandoff};
    },
    dispose() {
      if (disposed) return;
      disposed = true; clear(); previous = null;
      visibilityTarget?.removeEventListener?.('visibilitychange', suspend);
      connection?.removeEventListener?.('change', suspend);
    },
  };
}
