/** Headwear fits the block head directly. Every face remains a root mesh for skin binding. */
export function buildHeadwear(p, {kind, role, colors: c, wizard}) {
  p.with('head', role, () => {
    if (role === 'metal') buildHelmet(p, c);
    else if (wizard && role === 'cloth') buildWizardHat(p, c);
    else buildHood(p, c, kind === 'ranger');
    if (kind === 'rogue' || kind === 'ranger' || role === 'metal') buildFaceScarf(p, c, role === 'metal');
  });
}

function buildWizardHat(p, c) {
  const sides = 12, vertices = [], faces = [];
  // Continuous annular upper face, underside, and both returned edges.
  // Return the annulus beneath the eight-sided crown. The inner edge must fit
  // inside its facets, not merely touch the crown's circumscribed ellipse.
  for (const [rx, ry, z] of [[.91, .76, 7.27], [1.79, 1.40, 6.99], [1.79, 1.40, 6.90], [.91, .76, 7.18]]) {
    for (let i = 0; i < sides; i++) {
      const a = i * Math.PI * 2 / sides;
      vertices.push([rx * Math.sin(a), -ry * Math.cos(a), z + .075 * Math.sin(a) - .08 * Math.cos(a)]);
    }
  }
  for (let row = 0; row < 4; row++) for (let i = 0; i < sides; i++) {
    const a = row * sides + i, b = row * sides + (i + 1) % sides;
    const next = ((row + 1) % 4) * sides;
    faces.push([a, b, next + (i + 1) % sides, next + i]);
  }
  p.mesh('Chibi wizard broad returned brim', vertices, faces, c.cloth, {variation: .025});
  p.loft('Chibi wizard bent crown', [[0, 0, 7.20, 1.08, .95], [0, .02, 7.72, .86, .77],
    [-.15, .025, 8.24, .61, .54], [-.50, .025, 8.71, .38, .34], [-.99, -.025, 8.66, .18, .18],
    [-1.37, -.11, 8.24, .025, .024]], c.cloth, {n: 8, phase: Math.PI / 8, variation: .022});
  p.with('head', 'leather', () => p.shell('Chibi wizard leather hat band', [[0, .007, 7.29, 1.065, .965],
    [0, .018, 7.56, .963, .86]], c.leather, {sides: 12, thickness: .055}));
  p.with('head', 'trim', () => {
    p.panel('Chibi hat diamond setting', [[0, -.922, 7.82], [.22, -1.00, 7.52], [0, -1.06, 7.21],
      [-.22, -1.00, 7.52]], .16, c.trim);
    p.panel('Chibi hat blue diamond', [[0, -.969, 7.72], [.13, -1.047, 7.52], [0, -1.105, 7.31],
      [-.13, -1.047, 7.52]], .048, '#6d8cb6');
  });
}

function buildHood(p, c, ranger) {
  const material = ranger ? c.cloth : c.hood;
  const outer = [[0, -.62, 7.77], [1.03, -.62, 7.47], [1.42, -.77, 5.68], [.82, -.72, 5.18],
    [-.73, -.72, 5.18], [-1.42, -.77, 5.68], [-1.31, -.70, 6.68], [-.97, -.63, 7.47]];
  // Slightly off-center brow reproduces a sewn, folded hood, with the eye region open.
  const opening = [[.34, -1.02, 7.20], [.91, -1.01, 6.78], [1.065, -1.02, 5.64], [.67, -.98, 5.29],
    [-.65, -.98, 5.29], [-1.065, -1.02, 5.64], [-1.015, -1.01, 6.45], [-.51, -1.01, 6.88]];
  const inside = opening.map(([x, y, z]) => [x, y + .11, z]);
  const vertices = [...outer, ...opening, ...inside], faces = [];
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    faces.push([i, j, 8 + j, 8 + i], [8 + i, 8 + j, 16 + j, 16 + i]);
  }
  roundedRear(vertices, faces, outer, 6.38);
  p.mesh(`Chibi ${ranger ? 'ranger' : 'rogue'} angular hood`, vertices, faces, material, {variation: .018});
  p.with('head', 'cloth', () => p.shell('Chibi hood neck return', [[0, .10, 5.13, .76, .56], [0, .09, 5.45, 1.07, .78]],
    material, {sides: 8, thickness: .075}));
}

function buildHelmet(p, c) {
  // Outer crown and front opening are connected into one thick shell, with a continuous nape.
  const outer = [[0, -.38, 7.76], [.89, -.48, 7.45], [1.26, -.69, 6.75], [1.26, -.70, 5.40],
    [.86, -.77, 5.30], [-.86, -.77, 5.30], [-1.26, -.70, 5.40], [-1.26, -.69, 6.75], [-.89, -.48, 7.45]];
  const opening = [[0, -.99, 6.53], [.69, -.99, 6.87], [1.00, -.99, 6.54], [1.045, -.96, 5.58],
    [.80, -.98, 5.39], [-.80, -.98, 5.39], [-1.045, -.96, 5.58], [-1.00, -.99, 6.54], [-.69, -.99, 6.87]];
  const n = outer.length;
  const inner = opening.map(([x, y, z]) => [x, y + .10, z]);
  const vertices = [...outer, ...opening, ...inner], faces = [];
  // The three bottom opening edges stay open, so no visor crosses the face or scarf.
  for (const i of [0, 1, 2, 3, 5, 6, 7, 8]) {
    const j = (i + 1) % n;
    faces.push([i, j, n + j, n + i], [n + i, n + j, n * 2 + j, n * 2 + i]);
  }
  roundedRear(vertices, faces, outer, 6.42);
  const helmet = p.mesh('Chibi angular steel helmet', vertices, faces, c.metal, {variation: .018});
  p.with('head', 'trim', () => {
    p.mountedStrip('Chibi helmet raised nose ridge', [[0, 0, 7.70], [0, 0, 7.27], [0, 0, 6.62]], .14, c.metalEdge, [helmet], .045);
    p.panel('Chibi helmet nose ridge point', [[-.07, -1.035, 6.65], [.07, -1.035, 6.65], [0, -1.05, 6.51]], .065, c.metalEdge);
  });
}

/** Broad side, rear-corner, and occipital facets replace the box-shaped extrusion. */
function roundedRear(vertices, faces, outer, centerZ) {
  const n = outer.length;
  let previous = 0;
  for (const [y, width, height] of [[.10, 1.035, 1.01], [.70, .97, .94], [1.03, .59, .66], [1.15, .20, .30]]) {
    const start = vertices.length;
    vertices.push(...outer.map(([x, , z]) => [x * width, y, centerZ + (z - centerZ) * height]));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push([previous + i, start + i, start + j, previous + j]);
    }
    previous = start;
  }
  faces.push(Array.from({length: n}, (_, i) => previous + i));
}

function buildFaceScarf(p, c, neckReturn = false) {
  p.with('head', 'cloth', () => {
    const vertices = [[-.98, -.86, 5.82], [0, -1.01, 5.84], [.98, -.86, 5.82],
      [.75, -.91, 5.36], [0, -1.02, 5.18], [-.75, -.91, 5.36], [0, -1.105, 5.51]];
    const faces = [[0, 1, 6], [1, 2, 6], [2, 3, 6], [3, 4, 6], [4, 5, 6], [5, 0, 6]];
    if (neckReturn) {
      vertices.push([-.54, -.44, 5.06], [.54, -.44, 5.06]);
      faces.push([5, 4, 7], [4, 8, 7], [4, 3, 8]);
    }
    p.mesh('Chibi folded face scarf', vertices, faces,
      c.scarf, {variation: .018});
    p.shell('Chibi face scarf wrapped sides', [[0, .005, 5.27, .82, .75], [0, .01, 5.64, 1.055, .875]],
      c.scarf, {sides: 10, thickness: .075});
  });
}
