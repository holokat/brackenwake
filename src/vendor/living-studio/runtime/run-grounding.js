// Run contacts transfer between different sole vertices. Applying every small
// change directly to the pelvis makes the whole character chatter. Calibrate a
// periodic pelvis curve once for the actor's actual feet, without seek history.
export function createRunGrounding(samplePose, count = 480) {
  const heights = [], floorLimits = [];
  for (let index = 0; index < count; index++) {
    const {height, soleHeight} = samplePose(index / count);
    if (!Number.isFinite(height) || !Number.isFinite(soleHeight)) {
      throw new Error('Run grounding requires finite posed pelvis and sole heights.');
    }
    heights.push(height);
    floorLimits.push(height - soleHeight);
  }
  // 0.8% of the loop removes contact chatter without flattening either stride.
  const sigma = .008 * count, radius = Math.ceil(3 * sigma), weights = [];
  let weightTotal = 0;
  for (let offset = -radius; offset <= radius; offset++) {
    const weight = Math.exp(-.5 * (offset / sigma) ** 2);
    weights.push(weight); weightTotal += weight;
  }
  const smooth = heights.map((_, index) => weights.reduce((sum, weight, offset) =>
    sum + heights[(index + offset - radius + count) % count] * weight, 0) / weightTotal);
  const deficits = smooth.map((height, index) => Math.max(0, floorLimits[index] - height));
  const calibrated = smooth.map((height, index) => {
    // Rounded local lifts keep the smoothed pelvis above the real posed soles.
    // A small margin also covers interpolation between calibration samples.
    let lift = 0;
    for (let other = 0; other < count; other++) {
      const separation = Math.abs(index - other);
      const distance = Math.min(separation, count - separation) / count;
      lift = Math.max(lift, deficits[other] * Math.exp(-((distance / .03) ** 2)));
    }
    return height + lift + .002;
  });
  return phase => {
    const position = ((phase % 1) + 1) % 1 * count, index = Math.floor(position), t = position - index;
    const a = calibrated[(index - 1 + count) % count], b = calibrated[index];
    const c = calibrated[(index + 1) % count], d = calibrated[(index + 2) % count];
    // Periodic Catmull-Rom interpolation closes both value and first derivative.
    return b + .5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  };
}
