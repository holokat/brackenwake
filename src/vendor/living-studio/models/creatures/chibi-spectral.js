/** Monster anatomy authored directly in Z-up space. No neutral NPC body is used. */
const sides = [[-1, 'L'], [1, 'R']];
const bone = '#c6bea3', oldBone = '#aaa18a', shadow = '#202527';

function octagon(width, depth, corner = .16) {
  return [[-width + corner, -depth], [width - corner, -depth], [width, -depth + corner],
    [width, depth - corner], [width - corner, depth], [-width + corner, depth],
    [-width, depth - corner], [-width, -depth + corner]];
}

function volume(s, name, rings, material) {
  const vertices = rings.flatMap(([z, width, depth, y = 0]) => octagon(width, depth).map(([x, d]) => [x, y + d, z]));
  const faces = [];
  for (let row = 0; row < rings.length - 1; row++) for (let i = 0; i < 8; i++) {
    const a = row * 8 + i, b = row * 8 + (i + 1) % 8;
    faces.push([a, b, b + 8, a + 8]);
  }
  faces.push([7, 6, 5, 4, 3, 2, 1, 0], Array.from({length: 8}, (_, i) => (rings.length - 1) * 8 + i));
  return s.mesh(name, vertices, faces, material);
}

/** Closed front-facing extrusion, embedded in a supporting volume. */
function panel(s, name, points, y, depth, material) {
  const n = points.length, vertices = points.map(([x, z]) => [x, y, z]);
  vertices.push(...points.map(([x, z]) => [x, y + depth, z]));
  const faces = [Array.from({length: n}, (_, i) => n - i - 1), Array.from({length: n}, (_, i) => n + i)];
  for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, (i + 1) % n + n, i + n]);
  return s.mesh(name, vertices, faces, material);
}

function skull(s) {
  s.bone = 'neck';
  s.tube('Skeleton narrow cervical column', [[0, .10, 4.76], [0, .08, 5.30], [0, .04, 5.65]], [.115, .12, .16], oldBone, 6);
  s.bone = 'head';
  // A tall cranium, pinched temples, open cheek silhouette and small heavy jaw.
  volume(s, 'Skeleton tapered cranium', [[5.52, .48, .37], [5.80, .69, .53], [6.11, .80, .61],
    [6.39, .72, .57], [6.63, .48, .43], [6.72, .25, .28]], bone);
  volume(s, 'Skeleton substantial mandible', [[5.29, .35, .29, -.08], [5.38, .51, .39, -.08],
    [5.57, .56, .44, -.065]], oldBone);
  for (const [sign, side] of sides) {
    s.tube(`Skeleton joined cheek arch ${side}`, [[sign * .66, -.24, 5.95], [sign * .68, -.45, 5.76],
      [sign * .47, -.49, 5.45]], [.13, .14, .13], bone, 6);
    const x = sign * .31;
    panel(s, `Skeleton deep orbital socket ${side}`, [[x - .20, 6.18], [x + .17, 6.20], [x + .21, 6.01],
      [x + .12, 5.86], [x - .15, 5.85], [x - .23, 5.98]], -.616, .125, shadow);
    s.tube(`Skeleton orbital brow ${side}`, [[sign * .095, -.54, 6.22], [sign * .37, -.61, 6.26],
      [sign * .65, -.43, 6.17]], [.075, .085, .08], oldBone, 5);
  }
  panel(s, 'Skeleton nasal cavity', [[0, 5.94], [.125, 5.66], [-.125, 5.66]], -.563, .10, shadow);
  panel(s, 'Skeleton inset jaw opening', [[-.40, 5.65], [.40, 5.65], [.36, 5.44], [-.36, 5.44]], -.542, .14, shadow);
  for (const x of [-.27, -.09, .09, .27]) s.cube(`Skeleton joined broad tooth ${x}`,
    [x, -.555, 5.607], [.13, .11, .13], bone);
}

function ribcage(s) {
  s.bone = 'spine';
  s.tube('Skeleton narrow lumbar column', [[0, .12, 2.49], [0, .16, 3.25], [0, .16, 3.73]], [.12, .11, .13], oldBone, 6);
  s.bone = 'chest';
  s.tube('Skeleton thoracic column', [[0, .17, 3.35], [0, .20, 4.10], [0, .13, 4.73]], [.13, .14, .15], oldBone, 6);
  s.tube('Skeleton breastbone', [[0, -.46, 3.30], [0, -.61, 3.93], [0, -.50, 4.64]], [.09, .13, .11], bone, 6);
  for (let row = 0; row < 4; row++) for (const [sign, side] of sides) {
    const z = 4.55 - row * .335, width = [.78, .93, .90, .72][row], front = [-.50, -.61, -.61, -.52][row];
    s.tube(`Skeleton barrel rib ${side} ${row}`, [[0, .19, z + .05], [sign * width * .77, .25, z + .025],
      [sign * width, -.065, z - .08], [sign * width * .72, front + .025, z - .23],
      [sign * .08, front, z - .27]], [.095, .105, .105, .105, .09], bone, 6);
  }
  for (const [sign, side] of sides) {
    s.tube(`Skeleton high clavicle ${side}`, [[0, -.11, 4.72], [sign * .50, -.18, 4.82],
      [sign * .98, .035, 4.62]], [.11, .13, .16], bone, 6);
    s.ico(`Skeleton shoulder blade ${side}`, [sign * .62, .30, 4.45], [.29, .16, .39], oldBone, 1);
  }
}

function pelvis(s) {
  s.bone = 'hips';
  s.tube('Skeleton joined pelvic bowl', [[-.60, .03, 2.68], [-.62, -.19, 2.42], [-.29, -.32, 2.17],
    [.29, -.32, 2.17], [.62, -.19, 2.42], [.60, .03, 2.68]], [.17, .20, .14, .14, .20, .17], bone, 6);
  s.tube('Skeleton sacral bridge', [[-.55, .22, 2.63], [0, .24, 2.53], [.55, .22, 2.63]], [.17, .20, .17], oldBone, 6);
  for (const [sign, side] of sides) s.ico(`Skeleton flared iliac crest ${side}`,
    [sign * .54, .045, 2.62], [.35, .31, .38], bone, 1);
}

function skeletalLimbs(s) {
  for (const [sign, side] of sides) {
    s.bone = `thigh${side}`;
    s.ico(`Skeleton hip joint ${side}`, [sign * .50, .055, 2.44], [.205, .215, .215], oldBone, 1);
    s.tube(`Skeleton long femur ${side}`, [[sign * .50, .055, 2.48], [sign * .57, -.01, 1.97],
      [sign * .71, -.13, 1.26]], [.17, .115, .17], bone, 6);
    s.bone = `shin${side}`;
    s.ico(`Skeleton angular knee ${side}`, [sign * .71, -.145, 1.25], [.22, .23, .205], oldBone, 1);
    s.tube(`Skeleton long tibia ${side}`, [[sign * .71, -.105, 1.26], [sign * .75, .025, .82],
      [sign * .79, .025, .31]], [.155, .105, .16], bone, 6);
    s.tube(`Skeleton separate fibula ${side}`, [[sign * .81, .00, 1.20], [sign * .89, .09, .38]], [.065, .075], oldBone, 5);
    s.bone = `foot${side}`;
    s.loft(`Skeleton connected heel ${side}`, [[sign * .79, .015, .025, .22, .24],
      [sign * .79, -.035, .22, .23, .26], [sign * .79, .025, .37, .17, .19]], bone, 6);
    for (const [i, offset] of [-.16, 0, .16].entries()) s.tube(`Skeleton long toe ${side} ${i}`,
      [[sign * .79 + offset, -.055, .20], [sign * .79 + offset, -.38, .10],
        [sign * .79 + offset, -.57 + Math.abs(offset) * .4, .105]], [.095, .085, .075], bone, 5);
    s.bone = `upperArm${side}`;
    s.ico(`Skeleton large shoulder joint ${side}`, [sign * .98, .035, 4.62], [.235, .23, .24], bone, 1);
    s.tube(`Skeleton long humerus ${side}`, [[sign * .98, .035, 4.64], [sign * 1.18, -.015, 3.93],
      [sign * 1.34, -.07, 3.29]], [.17, .105, .17], bone, 6);
    s.bone = `forearm${side}`;
    s.ico(`Skeleton elbow joint ${side}`, [sign * 1.34, -.07, 3.29], [.195, .195, .20], oldBone, 1);
    for (const offset of [-.075, .075]) s.tube(`Skeleton paired forearm bone ${side} ${offset}`,
      [[sign * 1.34 + offset, -.07, 3.29], [sign * 1.49 + offset, -.14, 2.72],
        [sign * 1.62 + offset * .7, -.19, 2.25]], [.095, .065, .10], bone, 5);
    bonyHand(s, sign, side);
  }
}

function bonyHand(s, sign, side) {
  s.bone = `hand${side}`;
  s.loft(`Skeleton broad metacarpal palm ${side}`, [[sign * 1.63, -.20, 1.96, .29, .145],
    [sign * 1.63, -.19, 2.19, .26, .16], [sign * 1.62, -.19, 2.36, .16, .15]], bone, 6);
  for (const [i, offset] of [-.18, 0, .18].entries()) s.tube(`Skeleton articulated finger ${side} ${i}`,
    [[sign * 1.63 + offset, -.20, 2.03], [sign * 1.63 + offset, -.19, 1.74],
      [sign * 1.63 + offset, -.39, 1.65], [sign * 1.63 + offset, -.47, 1.80]], [.075, .075, .07, .055], bone, 5);
  s.tube(`Skeleton opposing thumb ${side}`, [[sign * 1.39, -.20, 2.21], [sign * 1.29, -.33, 2.02],
    [sign * 1.37, -.49, 1.92]], [.105, .095, .075], bone, 5);
}

function waistcloth(s, cloth) {
  s.bone = 'hips';
  s.loft('Skeleton narrow waistcloth binding', [[0, .075, 2.40, .62, .35], [0, .075, 2.62, .62, .33]], cloth, 8);
  panel(s, 'Skeleton torn hanging waistcloth', [[-.29, 2.57], [.29, 2.57], [.25, 2.05], [.025, 1.89], [-.23, 2.13]], -.405, .16, cloth);
}

function skeletonWarrior(s, cloth) {
  const rust = '#655043', rim = '#8a7257';
  s.bone = 'head';
  volume(s, 'Skeleton fitted rusty skull helmet', [[6.28, .88, .70], [6.48, .80, .66],
    [6.73, .57, .51], [6.90, .29, .28]], rust);
  volume(s, 'Skeleton helmet brow rim', [[6.25, .90, .72], [6.37, .89, .71]], rim);
  s.bone = 'upperArmL';
  s.loft('Skeleton broad battered shoulder plate', [[-1.06, .06, 4.37, .36, .36],
    [-1.03, .065, 4.68, .42, .40], [-.99, .075, 4.88, .23, .25]], rust, 6);
  s.bone = 'chest';
  // A narrow banner leaves the barrel of the ribcage readable on both sides.
  panel(s, 'Skeleton tattered ribcage tabard', [[-.35, 4.70], [.34, 4.70], [.41, 3.26],
    [.12, 3.08], [-.34, 3.28]], -.81, .12, cloth);
  s.tube('Skeleton tabard shoulder binding', [[-.30, -.755, 4.66], [-.37, -.03, 4.83], [-.35, .38, 4.52]], .08, '#4b392d', 5);
  s.bone = 'forearmR';
  s.tube('Skeleton old wrist binding', [[1.54, -.16, 2.61], [1.61, -.185, 2.33]], [.21, .20], '#4b392d', 6);
}

function wraithHood(s, cloth) {
  s.bone = 'head';
  const outer = [[-.39, 4.96], [-.78, 5.20], [-.92, 5.81], [-.77, 6.32], [-.25, 6.98],
    [.26, 6.54], [.76, 6.13], [.88, 5.56], [.63, 5.07], [.18, 4.94]];
  const inner = [[-.27, 5.12], [-.56, 5.34], [-.62, 5.78], [-.45, 6.10], [-.08, 6.44],
    [.22, 6.18], [.54, 5.96], [.63, 5.54], [.42, 5.21], [.11, 5.10]];
  const n = outer.length, vertices = [
    ...outer.map(([x, z]) => [x, z > 6.45 ? .35 : z > 6.10 ? -.16 : -.48, z]),
    ...outer.map(([x, z], i) => [i === 4 ? x - .035 : x * .72, i === 4 ? .67 : .92, i === 4 ? z - .06 : 5.8 + (z - 5.8) * .91]),
    ...inner.map(([x, z]) => [x, -.785, z]),
    ...inner.map(([x, z]) => [x * .95, -.45, 5.7 + (z - 5.7) * .95]),
  ];
  const faces = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([i, j, j + n, i + n], [i, i + 2 * n, j + 2 * n, j],
      [i + 2 * n, i + 3 * n, j + 3 * n, j + 2 * n]);
  }
  faces.push(Array.from({length: n}, (_, i) => 2 * n - i - 1), Array.from({length: n}, (_, i) => 3 * n + i));
  s.mesh('Wraith swept pointed hood volume', vertices, faces, cloth);
  panel(s, 'Wraith deep faceless cavity', inner.map(([x, z]) => [x * .956, 5.7 + (z - 5.7) * .956]), -.475, .07, '#0d1319');
  for (const [sign, side] of sides) {
    const x = sign * .255;
    const eye = panel(s, `Wraith cold flame eye ${side}`, [[x - .068, 5.81], [x + .045, 5.94],
      [x + .065, 5.66], [x - .03, 5.60]], -.499, .055, '#abd7d3');
    eye.material.emissive.set('#79b7bf'); eye.material.emissiveIntensity = .25;
  }
}

function wraithBody(s, cloth) {
  s.bone = 'chest';
  // The lower body is one swept taper. There is no pelvis, leg skin or foot geometry.
  // The taper and shroud share a joint so reaching never opens a false waist seam.
  s.loft('Wraith continuous swept spectral tail', [[-.23, 1.04, .39, .08, .11], [-.15, .73, .91, .21, .22],
    [.07, .49, 1.68, .33, .30], [.06, .30, 2.65, .44, .38], [0, .18, 3.49, .57, .43],
    [0, .13, 4.09, .64, .46]], cloth, 9);
  for (const [sign, side] of sides) s.tube(`Wraith joined trailing wisp ${side}`,
    [[sign * .22, .30, 3.18], [sign * .38, .43, 2.53], [sign * .43, .58, 2.06],
      [sign * .31, .88, 1.34], [sign * .19, 1.21, 1.04]],
    [[.035, .045], [.14, .16], [.14, .15], [.085, .09], [.018, .018]], cloth, 5);
  s.bone = 'chest';
  s.loft('Wraith spectral shoulder shroud', [[0, .17, 3.37, .53, .41], [0, .11, 4.09, .74, .49],
    [0, .13, 4.66, 1.04, .51], [0, .14, 4.96, .76, .44], [0, .16, 5.26, .42, .33]], cloth, 9);
  s.bone = 'neck';
  s.loft('Wraith deep hood root', [[0, .16, 4.96, .38, .31], [0, .14, 5.50, .42, .34]], cloth, 8);
  for (const [sign, side] of sides) {
    s.bone = `upperArm${side}`;
    s.ico(`Wraith continuous shoulder root ${side}`, [sign * 1.01, .11, 4.78], [.37, .37, .36], cloth, 2);
    s.tube(`Wraith long descending upper shroud ${side}`, [[sign * 1.0, .11, 4.81],
      [sign * 1.34, .075, 4.22], [sign * 1.64, .005, 3.65]], [[.29, .32], [.235, .265], [.29, .29]], cloth, 6);
    s.bone = `forearm${side}`;
    s.tube(`Wraith elongated forearm shroud ${side}`, [[sign * 1.59, .015, 3.80],
      [sign * 1.81, -.105, 3.23], [sign * 2.04, -.22, 2.66]], [[.31, .31], [.25, .26], [.18, .22]], cloth, 6);
    spectralClaw(s, sign, side);
  }
  wraithHood(s, cloth);
}

function spectralClaw(s, sign, side) {
  const ghost = '#99b0ad';
  s.bone = `hand${side}`;
  s.loft(`Wraith long spectral palm ${side}`, [[sign * 2.065, -.245, 2.17, .22, .14],
    [sign * 2.05, -.24, 2.48, .205, .17], [sign * 2.04, -.22, 2.80, .14, .16]], ghost, 6);
  for (const [i, offset] of [-.15, .015, .17].entries()) s.tube(`Wraith hooked spectral claw ${side} ${i}`,
    [[sign * 2.065 + offset, -.25, 2.25], [sign * 2.08 + offset * 1.2, -.28, 1.87 - i * .035],
      [sign * 2.05 + offset * 1.2, -.49, 1.68 - i * .035], [sign * 2.01 + offset, -.67, 1.82 - i * .035]],
    [.075, .065, .046, .018], ghost, 5);
  s.tube(`Wraith opposing hook ${side}`, [[sign * 1.88, -.28, 2.46], [sign * 1.74, -.41, 2.22],
    [sign * 1.81, -.62, 2.02], [sign * 1.90, -.67, 2.15]], [.095, .077, .046, .02], ghost, 5);
}

export function buildChibiSpectral(s, id, options = {}) {
  if (id === 'skeleton') {
    skull(s); ribcage(s); pelvis(s); skeletalLimbs(s);
    const cloth = options.clothColor || '#66513e';
    waistcloth(s, cloth);
    if (options.armor === 'warrior') skeletonWarrior(s, cloth);
  } else if (id === 'wraith') wraithBody(s, options.clothColor || '#343e4d');
  else throw new Error(`Unknown spectral creature: ${id}`);
}
