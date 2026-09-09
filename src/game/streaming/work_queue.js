/** Small, priority-ordered main-thread jobs. Work never runs in a promise burst. */
export function createWorkQueue({
  schedule = fn => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(fn, 0)) : setTimeout(fn, 0),
  now = () => performance.now(), budgetMs = 2, maxJobs = 2,
} = {}) {
  const jobs = [];
  let scheduled = false, serial = 0, frameMs = 0;
  const stats = {completed: 0, cancelled: 0, longestJobMs: 0, longestSliceMs: 0, overruns: 0};
  function pump() {
    scheduled = false;
    const start = now();
    let count = 0;
    const allowance = frameMs > 14 ? Math.min(.75, budgetMs) : budgetMs;
    const limit = frameMs > 14 ? 1 : maxJobs;
    jobs.sort((a, b) => b.priority - a.priority || a.order - b.order);
    while (jobs.length && count < limit && (count === 0 || now() - start < allowance)) {
      const job = jobs.shift();
      if (job.signal?.aborted) { stats.cancelled++; job.resolve(null); continue; }
      const at = now();
      try { job.resolve(job.run()); } catch (error) { job.reject(error); }
      const cost = now() - at;
      stats.longestJobMs = Math.max(stats.longestJobMs, cost);
      if (cost > budgetMs) stats.overruns++;
      stats.completed++; count++;
    }
    stats.longestSliceMs = Math.max(stats.longestSliceMs, now() - start);
    request();
  }
  function request() { if (!scheduled && jobs.length) { scheduled = true; schedule(pump); } }
  return {
    run(run, {priority = 1, signal} = {}) {
      if (signal?.aborted) return Promise.resolve(null);
      const promise = new Promise((resolve, reject) => jobs.push({run, priority, signal, resolve, reject, order: serial++}));
      request(); return promise;
    },
    reportFrame(ms) {if (Number.isFinite(ms) && ms >= 0) frameMs = frameMs ? frameMs * .9 + ms * .1 : ms;},
    get stats() { return {...stats, queued: jobs.length, frameMs}; },
  };
}
export const assetWork = createWorkQueue();
