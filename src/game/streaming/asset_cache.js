/** Deduplicated downloads, one decode at a time, pinned live assets and bounded warm caches. */
export function createAssetCache({fetchBytes, decode, dispose = () => {}, sizeOf = () => 0, work,
  maxDownloads = 2, maxWarmBytes = 48 * 1024 * 1024, maxWarmAssets = 2, maxWarmAssetBytes = 96 * 1024 * 1024,
  now = () => performance.now(), allowPrefetch = () => true} = {}) {
  const entries = new Map();
  let downloading = 0, decoding = false, clock = 0;
  const totals = {downloads: 0, decodes: 0, hits: 0, evictions: 0, failures: 0, bytesDownloaded: 0, longestDecodeMs: 0, peakDownloads: 0};
  const touch = entry => {entry.used = ++clock;};
  function make(url) {
    let e = entries.get(url);
    if (e) {touch(e); return e;}
    e = {url, refs: 0, priority: 0, phase: 'queued', bytes: null, asset: null, used: ++clock, controller: new AbortController()};
    e.promise = new Promise((resolve, reject) => {e.resolve = resolve; e.reject = reject;});
    // Prefetch has no caller awaiting decoding. Keep rejection observed until acquisition.
    e.promise.catch(() => {});
    entries.set(url, e); return e;
  }
  function evict(e) {
    if (e.refs || e.phase === 'decoding') return;
    entries.delete(e.url); e.controller.abort();
    if (e.asset) dispose(e.asset);
    e.bytes = null; e.asset = null; e.resolve(null); totals.evictions++;
  }
  function trim() {
    const unused = [...entries.values()].filter(e => !e.refs).sort((a, b) => a.used - b.used);
    let bytes = unused.reduce((n, e) => n + (e.bytes?.byteLength || 0), 0);
    let assets = unused.filter(e => e.asset).length;
    let assetBytes = unused.reduce((n, e) => n + (e.asset ? e.assetBytes : 0), 0);
    for (const e of unused) {
      if (e.phase === 'queued' || e.phase === 'fetching') continue;
      const raw = e.bytes?.byteLength || 0;
      if ((raw && bytes > maxWarmBytes) || (e.asset && (assets > maxWarmAssets || assetBytes > maxWarmAssetBytes))) {
        bytes -= raw;
        if (e.asset) {assets--; assetBytes -= e.assetBytes;}
        evict(e);
      }
    }
  }
  function fail(e, error) {
    if (entries.get(e.url) === e) entries.delete(e.url);
    e.bytes = null; e.phase = 'failed'; e.reject(error);
    if (!e.controller.signal.aborted) totals.failures++;
  }
  function pumpDecode() {
    if (decoding) return;
    const e = [...entries.values()].filter(e => e.phase === 'downloaded' && e.refs > 0).sort((a,b) => b.priority-a.priority || b.used-a.used)[0];
    if (!e) return;
    decoding = true; e.phase = 'decoding';
    work.run(async () => {
      if (!e.refs || e.controller.signal.aborted) { e.phase = 'downloaded'; return; }
      const at = now();
      const asset = await decode(e.bytes, e.url);
      totals.longestDecodeMs = Math.max(totals.longestDecodeMs, now() - at); totals.decodes++;
      e.asset = asset; e.assetBytes = sizeOf(asset); e.bytes = null; e.phase = 'ready'; e.resolve(asset);
    }, {priority: e.priority}).catch(error => fail(e, error)).finally(() => {decoding = false; trim(); pumpDecode();});
  }
  function pump() {
    const pending = [...entries.values()].filter(e => e.phase === 'queued').sort((a,b) => b.priority-a.priority || a.used-b.used);
    for (const e of pending) {
      if (downloading >= maxDownloads) break;
      // One download slot always remains available to visible rooms.
      if (!e.refs && (!allowPrefetch() || downloading >= maxDownloads - 1)) continue;
      downloading++; totals.peakDownloads = Math.max(totals.peakDownloads, downloading); e.phase = 'fetching';
      Promise.resolve().then(() => fetchBytes(e.url, e.controller.signal, e.priority)).then(bytes => {
        if (entries.get(e.url) !== e || e.controller.signal.aborted) return;
        e.bytes = bytes; e.phase = 'downloaded'; totals.downloads++; totals.bytesDownloaded += bytes.byteLength; trim(); pumpDecode();
      }).catch(error => fail(e, error)).finally(() => {downloading--; pump();});
    }
    pumpDecode();
  }
  return {
    acquire(url, {priority = 2} = {}) {
      const existing = entries.get(url);
      if (existing) totals.hits++;
      const e = make(url); e.refs++; e.priority = Math.max(e.priority, priority); pump();
      let released = false;
      return {promise: e.promise,
        promote(priority = 3) {e.priority = Math.max(e.priority, priority); pump();},
        release() {
          if (released) return; released = true; e.refs--; touch(e);
          if (!e.refs && (e.phase === 'queued' || e.phase === 'fetching')) evict(e);
          trim(); pump();
        },
      };
    },
    prefetch(url) {if (!allowPrefetch()) return false; const e = make(url); touch(e); pump(); return true;},
    cancelPrefetchExcept(urls = []) {
      const keep = new Set(urls);
      // Completed bytes remain in the bounded LRU for backtracking and floor transitions.
      for (const e of entries.values()) if (!e.refs && !keep.has(e.url) && (e.phase === 'queued' || e.phase === 'fetching')) evict(e);
    },
    clearUnused() {for (const e of entries.values()) if (!e.refs) evict(e);},
    get stats() {
      const all = [...entries.values()];
      return {...totals, downloading, decoding: Number(decoding), entries: all.length,
        pinned: all.filter(e=>e.refs).length, queued: all.filter(e=>e.phase==='queued').length,
        warmBytes: all.filter(e=>!e.refs).reduce((n,e)=>n+(e.bytes?.byteLength||0),0),
        warmAssets: all.filter(e=>!e.refs&&e.asset).length,
        assetBytes: all.reduce((n,e)=>n+(e.assetBytes||0),0)};
    },
  };
}
