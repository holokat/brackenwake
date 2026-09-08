/** Creature-specific author-space joints. Z is up, negative Y is forward. */
export const undeadAnatomies = Object.freeze({
  scarecrow: {joints: {
    hips: [0, .02, 2.48], spine: [0, .03, 3.13], chest: [0, .04, 3.76],
    neck: [.03, -.03, 4.39], head: [.05, -.13, 4.99],
    upperArmL: [-.83, .02, 4.00], upperArmR: [.83, .02, 4.00],
    forearmL: [-1.30, -.03, 3.23], forearmR: [1.30, -.03, 3.23],
    handL: [-1.55, -.14, 2.43], handR: [1.55, -.14, 2.43],
    thighL: [-.42, .03, 2.43], thighR: [.42, .03, 2.43],
    shinL: [-.52, .01, 1.26], shinR: [.52, .01, 1.26],
    footL: [-.57, -.08, .25], footR: [.57, -.08, .25],
  }},
  zombie: {joints: {
    hips: [0, .10, 2.22], spine: [-.03, .13, 2.99], chest: [-.08, .08, 3.64],
    neck: [-.10, -.25, 4.18], head: [-.10, -.48, 4.70],
    upperArmL: [-.85, 0, 3.96], upperArmR: [.86, .13, 3.72],
    forearmL: [-1.26, -.08, 2.72], forearmR: [1.25, .16, 2.80],
    handL: [-1.46, -.24, 1.58], handR: [1.39, -.04, 1.90],
    thighL: [-.41, .14, 2.10], thighR: [.44, .18, 2.10],
    shinL: [-.45, -.04, 1.04], shinR: [.55, .15, 1.12],
    footL: [-.55, -.25, .30], footR: [.58, -.12, .27],
  }},
  drowned: {joints: {
    hips: [0, .05, 1.82], spine: [0, .10, 2.60], chest: [0, .18, 3.32],
    neck: [.06, -.20, 3.93], head: [.06, -.43, 4.55],
    upperArmL: [-1.00, .12, 3.65], upperArmR: [1.00, .12, 3.65],
    forearmL: [-1.32, -.05, 2.74], forearmR: [1.32, -.05, 2.74],
    handL: [-1.50, -.38, 1.96], handR: [1.50, -.38, 1.96],
    thighL: [-.48, .09, 1.80], thighR: [.48, .09, 1.80],
    shinL: [-.61, -.01, .88], shinR: [.61, -.01, .88],
    footL: [-.68, -.23, .22], footR: [.68, -.23, .22],
  }},
});
