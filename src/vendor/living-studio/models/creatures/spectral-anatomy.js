/** Creature-specific rest positions. Direct Z-up geometry, facing -Y. */
export const spectralAnatomies = {
  skeleton: {joints: {
    hips: [0, .04, 2.48], spine: [0, .13, 3.22], chest: [0, .10, 4.13],
    neck: [0, .10, 4.99], head: [0, .045, 5.65],
    upperArmL: [-.98, .035, 4.62], upperArmR: [.98, .035, 4.62],
    forearmL: [-1.34, -.07, 3.29], forearmR: [1.34, -.07, 3.29],
    handL: [-1.62, -.19, 2.24], handR: [1.62, -.19, 2.24],
    thighL: [-.50, .055, 2.44], thighR: [.50, .055, 2.44],
    shinL: [-.71, -.13, 1.25], shinR: [.71, -.13, 1.25],
    footL: [-.79, .025, .31], footR: [.79, .025, .31],
  }},
  wraith: {joints: {
    // Hips and leg names are playback helpers inside the floating tail, not visible anatomy.
    hips: [0, .27, 2.55], spine: [0, .16, 3.74], chest: [0, .10, 4.48],
    neck: [0, .13, 5.08], head: [0, .16, 5.72],
    upperArmL: [-1.01, .11, 4.78], upperArmR: [1.01, .11, 4.78],
    forearmL: [-1.64, .005, 3.65], forearmR: [1.64, .005, 3.65],
    handL: [-2.04, -.22, 2.64], handR: [2.04, -.22, 2.64],
    thighL: [-.15, .28, 2.35], thighR: [.15, .28, 2.35],
    shinL: [-.13, .46, 1.42], shinR: [.13, .46, 1.42],
    footL: [-.08, .80, .52], footR: [.08, .80, .52],
  }},
};
