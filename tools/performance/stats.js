export const round = n => Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
export function distribution(values) {
  const a = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!a.length) return { count: 0, mean: null, p50: null, p95: null, p99: null, max: null };
  const at = p => a[Math.max(0, Math.ceil(a.length * p) - 1)];
  return { count: a.length, mean: round(a.reduce((x, y) => x + y, 0) / a.length), p50: round(at(.5)), p95: round(at(.95)), p99: round(at(.99)), max: round(a.at(-1)) };
}
export function summariseFrames(frames) {
  const intervals = frames.filter(f => f.dt > 0).map(f => f.dt), timing = distribution(intervals);
  const names = [...new Set(frames.flatMap(f => Object.keys(f.systems)))];
  return { frames: frames.length, frameMs: timing, averageFps: round(1000 / timing.mean),
    over33ms: intervals.filter(t => t > 33.34).length, over50ms: intervals.filter(t => t > 50).length,
    over100ms: intervals.filter(t => t > 100).length, cpuMs: distribution(frames.map(f => f.cpu)),
    drawCalls: distribution(frames.map(f => f.calls)), triangles: distribution(frames.map(f => f.triangles)),
    systems: Object.fromEntries(names.map(name => [name, distribution(frames.map(f => f.systems[name] || 0))]).sort((a, b) => b[1].mean - a[1].mean)),
    spikes: frames.slice().sort((a, b) => b.dt - a.dt).slice(0, 12).map(f => ({...f, systems: Object.fromEntries(Object.entries(f.systems).sort((a, b) => b[1] - a[1]).slice(0, 6))})),
  };
}
