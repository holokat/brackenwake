/** Adjust only 3D pixel density. The HUD and saved quality ceiling stay sharp. */
export function createAdaptiveResolution({ceiling = 1.5, minimum = .85} = {}) {
  let limit = ceiling, ratio = ceiling, samples = [], elapsed = 0, slow = 0, fast = 0;
  const reset = () => {samples = []; elapsed = 0; slow = 0; fast = 0;};
  return {
    enabled: true,
    get ratio() {return ratio;},
    get ceiling() {return limit;},
    setCeiling(value) {
      limit = Number.isFinite(value) ? Math.max(.5, Math.min(2, value)) : 1;
      ratio = limit; reset(); return ratio;
    },
    sample(ms) {
      // Backgrounding and individual loading stalls must not lower steady quality.
      if (!this.enabled || !Number.isFinite(ms) || ms <= 0 || ms > 100) {reset(); return ratio;}
      samples.push(ms); elapsed += ms;
      if (elapsed < 1000 || samples.length < 20) return ratio;
      samples.sort((a, b) => a - b);
      const typical = samples[Math.floor(samples.length * .75)];
      slow = typical > 19 ? slow + 1 : 0;
      fast = typical < 17.5 ? fast + elapsed : 0;
      samples = []; elapsed = 0;
      const floor = Math.min(minimum, limit);
      if (slow >= 2 && ratio > floor) {
        ratio = Math.max(floor, Math.round(Math.max(ratio - .2, ratio * Math.sqrt(16.7 / typical)) * 20) / 20);
        slow = 0; fast = 0;
      } else if (fast >= 12000 && ratio < limit) {
        ratio = Math.min(limit, Math.round((ratio + .05) * 20) / 20); fast = 0;
      }
      return ratio;
    },
  };
}
