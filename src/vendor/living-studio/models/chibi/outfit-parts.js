/** Shared, flat-root construction helpers for the chibi wardrobe. Native Z-up, forward -Y. */
export function outfitParts(h, {slot, itemId, binding = 'chest', role = 'cloth'}) {
  const state = {binding, role};
  const tag = mesh => {
    Object.assign(mesh.userData, {part: 'outfit', wikiSlot: slot, slot, wikiItemId: itemId, itemId,
      armorBinding: state.binding, materialRole: state.role, chibiWardrobe: true});
    return mesh;
  };
  const p = {
    with(binding, role, build) {
      const before = {...state};
      Object.assign(state, {binding, role});
      try { return build(p); } finally { Object.assign(state, before); }
    },
    panel(name, outline, depth, material) {
      const n = outline.length;
      const vertices = [...outline, ...outline.map(([x, y, z]) => [x, y + depth, z])];
      const faces = [Array.from({length: n}, (_, i) => n - 1 - i), Array.from({length: n}, (_, i) => i + n)];
      for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, (i + 1) % n + n, i + n]);
      return p.mesh(name, vertices, faces, material, {variation: .018});
    },
    strip(name, points, width, material, depth = .045) {
      const vertices = [];
      points.forEach(([x, y, z], i) => {
        const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
        const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz) || 1;
        vertices.push([x - dz / length * width / 2, y, z + dx / length * width / 2],
          [x + dz / length * width / 2, y, z - dx / length * width / 2]);
      });
      return p.solidStrip(name, vertices, material, depth);
    },
    solidStrip(name, front, material, depth) {
      const count = front.length, vertices = [...front, ...front.map(([x, y, z], i) => [x, y + (Array.isArray(depth) ? depth[i] : depth), z])], faces = [];
      for (let i = 0; i < count - 2; i += 2) {
        faces.push([i, i + 1, i + 3, i + 2], [i + count, i + count + 2, i + count + 3, i + count + 1],
          [i, i + 2, i + count + 2, i + count], [i + 1, i + count + 1, i + count + 3, i + 3]);
      }
      faces.push([0, count, count + 1, 1], [count - 2, count - 1, count * 2 - 1, count * 2 - 2]);
      return p.mesh(name, vertices, faces, material, {variation: .008});
    },
    /** Project both strap edges onto the real faceted garment, including crossed straps. */
    mountedStrip(name, points, width, material, supports, depth = .055, face = -1) {
      const samples = [], front = [], thickness = [];
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1], count = Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / .095);
        for (let step = 0; step < count; step++) {
          const t = step / count;
          samples.push(a.map((value, axis) => value + (b[axis] - value) * t));
        }
      }
      samples.push(points.at(-1));
      for (let i = 0; i < samples.length; i++) {
        const [x, , z] = samples[i], a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
        const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
        let crest = face < 0 ? Infinity : -Infinity;
        const outward = face < 0 ? Math.min : Math.max;
        for (const offset of [-1, -.5, 0, .5, 1]) crest = outward(crest,
          frontSurface(supports, x + offset * dz / length * width / 2, z - offset * dx / length * width / 2, face));
        for (const side of [-1, 1]) {
          const px = x + side * dz / length * width / 2, pz = z - side * dx / length * width / 2;
          const y = frontSurface(supports, px, pz, face);
          if (!Number.isFinite(y)) throw new Error(`${name}: unsupported strap edge at ${px.toFixed(3)}, ${pz.toFixed(3)}`);
          const frontY = outward(y, crest) + face * (depth + .012);
          front.push([px, frontY, pz]);
          thickness.push(y - frontY - face * .008);
        }
      }
      const mesh = p.solidStrip(name, front, material, thickness);
      mesh.userData.chibiMountedOn = supports.map(support => support.name);
      mesh.userData.chibiMountedDepth = depth;
      mesh.userData.chibiMountedSide = face;
      return mesh;
    },
    /** Closed thickness at hems and openings; no discs covering the wearer's neck. */
    shell(name, rings, material, {sides = 10, thickness = .045, phase = 0} = {}) {
      const vertices = [], faces = [], count = rings.length * sides;
      for (const inner of [false, true]) for (const [x, y, z, rx, ry] of rings) for (let i = 0; i < sides; i++) {
        const angle = phase + i * Math.PI * 2 / sides;
        vertices.push([x + (rx - (inner ? thickness : 0)) * Math.sin(angle),
          y - (ry - (inner ? thickness : 0)) * Math.cos(angle), z]);
      }
      for (let row = 0; row < rings.length - 1; row++) for (let i = 0; i < sides; i++) {
        const a = row * sides + i, b = row * sides + (i + 1) % sides;
        faces.push([a, b, b + sides, a + sides], [a + count, a + count + sides, b + count + sides, b + count]);
      }
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides, top = count - sides;
        faces.push([i, i + count, j + count, j], [top + i, top + j, top + j + count, top + i + count]);
      }
      return p.mesh(name, vertices, faces, material, {variation: .018});
    },
    /** Thick, joined open skirt panels with hem strips following the same faceted surface. */
    skirt(name, {top = 2.96, bottom = 1.00, width = .77, flare = 1.18,
      material, trim, gap = .19, depth = .50, hem = .12} = {}) {
      const angles = [gap, .70, 1.33, 1.91, 2.50, Math.PI, 3.78, 4.37, 4.95, 5.58, Math.PI * 2 - gap];
      const vertices = [], faces = [];
      for (let row = 0; row < 3; row++) for (const a of angles) {
        const t = row / 2, rx = width + (flare - width) * t;
        vertices.push([rx * Math.sin(a), .03 - (depth + .19 * t) * Math.cos(a), top + (bottom - top) * t + .055 * Math.cos(a)]);
      }
      for (let row = 0; row < 2; row++) for (let i = 0; i < angles.length - 1; i++) {
        const a = row * angles.length + i;
        faces.push([a, a + 1, a + 1 + angles.length, a + angles.length]);
      }
      const count = angles.length, created = [];
      // Each coat half follows its own thigh when the character walks.
      for (const [start, end, side] of [[0, 5, 'R'], [5, 10, 'L']]) {
        const v = [], f = [], width = end - start + 1;
        for (let row = 0; row < 3; row++) for (let i = start; i <= end; i++) v.push(vertices[row * count + i]);
        const outerCount = v.length;
        for (const [x, y, z] of [...v]) v.push([x * .96, .03 + (y - .03) * .94, z]);
        for (let row = 0; row < 2; row++) for (let i = 0; i < width - 1; i++) {
          const a = row * width + i, b = a + 1, d = a + width, e = d + 1;
          f.push([a, b, e, d], [a + outerCount, d + outerCount, e + outerCount, b + outerCount]);
        }
        for (let i = 0; i < width - 1; i++) {
          f.push([i, i + outerCount, i + outerCount + 1, i + 1]);
          const a = width * 2 + i;
          f.push([a, a + 1, a + outerCount + 1, a + outerCount]);
        }
        for (const i of [0, width - 1]) for (let row = 0; row < 2; row++) {
          const a = row * width + i, b = a + width;
          f.push([a, b, b + outerCount, a + outerCount]);
        }
        const shell = p.mesh(`${name} ${side}`, v, f, material, {variation: .018});
        shell.userData.armorSide = side;
        created.push(shell);
        if (trim) p.with(state.binding, 'trim', () => {
          const hemVertices = [], hemFaces = [];
          for (let row = 0; row < 2; row++) for (let i = start; i <= end; i++) {
            const a = vertices[2 * count + i], b = vertices[count + i], t = row * hem / ((top - bottom) / 2);
            hemVertices.push([a[0] + (b[0] - a[0]) * t + .012 * Math.sin(angles[i]),
              a[1] + (b[1] - a[1]) * t - .012 * Math.cos(angles[i]), a[2] + row * hem]);
          }
          for (let i = 0; i < width - 1; i++) hemFaces.push([i, i + 1, i + width + 1, i + width]);
          const facing = p.mesh(`${name} broad hem ${side}`, hemVertices, hemFaces, trim, {variation: 0});
          facing.userData.armorSide = side;
          const index = side === 'R' ? 0 : count - 1;
          const line = [vertices[index], vertices[count + index], vertices[count * 2 + index]].map(([x, y, z]) => [x, y - .02, z]);
          const edge = p.strip(`${name} opening facing ${side}`, line, hem * .70, trim, .035);
          edge.userData.armorSide = side;
        });
      }
      return created;
    },
  };
  for (const method of ['mesh', 'loft', 'tube', 'cube', 'ico']) p[method] = (...args) => tag(h[method](...args));
  return p;
}

function frontSurface(supports, x, z, face = -1) {
  let nearest = face < 0 ? Infinity : -Infinity;
  for (const mesh of supports) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const ax = p.getX(i), az = p.getZ(i), bx = p.getX(i + 1), bz = p.getZ(i + 1), cx = p.getX(i + 2), cz = p.getZ(i + 2);
      const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(denominator) < 1e-10) continue;
      const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
      const b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator, c = 1 - a - b;
      if (a < -1e-6 || b < -1e-6 || c < -1e-6) continue;
      nearest = (face < 0 ? Math.min : Math.max)(nearest, a * p.getY(i) + b * p.getY(i + 1) + c * p.getY(i + 2));
    }
  }
  return nearest;
}

export const sideParts = Object.freeze([[-1, 'L'], [1, 'R']]);

export function buildBoots(p, c, role) {
  for (const [s, side] of sideParts) {
    const surface = c.leatherDark;
    p.with(`shin${side}`, 'leather', () => {
      p.loft(`Chibi boot shaft ${side}`, [[s * .65, .01, .29, .265, .27], [s * .62, .01, .88, .29, .29],
        [s * .61, .01, 1.15, .34, .31]], surface, {n: 8, variation: .018});
      p.shell(`Chibi boot cuff ${side}`, [[s * .61, .01, 1.04, .365, .335], [s * .60, .01, 1.25, .365, .335]],
        c.leather, {sides: 8, thickness: .055});
      if (role === 'metal') p.with(`shin${side}`, 'metal', () => p.panel(`Chibi broad greave ${side}`,
        [[s * .61 - .28, -.315, 1.14], [s * .61 + .28, -.315, 1.14],
          [s * .65 + .215, -.375, .36], [s * .65 - .215, -.375, .36]], .12, c.metal));
    });
    p.with(`foot${side}`, 'leather', () => {
      p.loft(`Chibi boot toe ${side}`, [[s * .65, -.19, .035, .32, .48], [s * .65, -.23, .19, .33, .50],
        [s * .65, -.19, .37, .265, .41], [s * .65, -.03, .48, .23, .25]], surface, {n: 8, variation: .018});
      p.loft(`Chibi boot sole ${side}`, [[s * .65, -.205, .015, .335, .485], [s * .65, -.205, .095, .335, .485]],
        c.dark, {n: 8, variation: 0});
      if (role === 'metal') p.with(`foot${side}`, 'metal', () => {
        const top = [[s * .65 - .28, -.61, .235], [s * .65 + .28, -.61, .235],
          [s * .65 + .24, -.18, .37], [s * .65 - .24, -.18, .37]];
        p.mesh(`Chibi broad toe plate ${side}`, [...top, ...top.map(([x, y, z]) => [x, y, z - .065])],
          [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]], c.metal, {variation: 0});
      });
    });
  }
}

export function buildTrousers(p, c, role) {
  p.with('hips', 'cloth', () => p.loft('Chibi trouser seat', [[0, .035, 2.22, .71, .40], [0, .025, 2.87, .74, .43]],
    c.dark, {n: 10, variation: .018}));
  for (const [s, side] of sideParts) p.with('leg', 'cloth', () => {
    p.tube(`Chibi trouser leg ${side}`, [[s * .45, .02, 2.72], [s * .52, .015, 2.17], [s * .60, -.025, 1.38],
      [s * .61, .0, 1.12]], [[.35, .36], [.335, .34], [.30, .29], [.285, .27]], c.dark, {sides: 8, variation: .018});
    if (role === 'metal') p.with(`shin${side}`, 'metal', () => p.panel(`Chibi knee guard ${side}`,
      [[s * .60 - .295, -.325, 1.67], [s * .60, -.415, 1.80], [s * .60 + .295, -.325, 1.67],
        [s * .60 + .245, -.36, 1.34], [s * .60, -.415, 1.24], [s * .60 - .245, -.36, 1.34]], .10, c.metal));
  });
}

export function buildCuffs(p, c, role, slot) {
  for (const [s, side] of sideParts) {
    const surface = role === 'metal' ? c.metal : c.leatherDark;
    p.with(`forearm${side}`, role, () => {
      const isWrist = slot === 'wrists';
      p.tube(`Chibi ${isWrist ? 'bracer' : 'glove cuff'} ${side}`,
        isWrist ? [[s * 1.39, -.052, 3.57], [s * 1.48, -.14, 3.01]] : [[s * 1.47, -.13, 3.10], [s * 1.51, -.18, 2.87]],
        isWrist ? [[role === 'metal' ? .335 : .30, role === 'metal' ? .335 : .30], [.295, .29]] : [[.315, .31], [.30, .30]], surface, {sides: 6, variation: .008});
      if (isWrist && role !== 'metal') p.tube(`Chibi bracer top binding ${side}`, [[s * 1.385, -.046, 3.60], [s * 1.405, -.063, 3.47]],
        [.312, .310], role === 'metal' ? c.metalEdge : c.leather, {sides: 6, variation: .018});
    });
    // The anatomy builder owns the gripping block glove; this slot supplies its connected cuff.
  }
}

export function buildBelt(p, c, role, wizard) {
  p.with('hips', 'leather', () => {
    p.shell('Chibi broad waist belt', [[0, .015, 2.91, .81, .48], [0, .015, 3.20, .79, .475]], c.leather,
      {sides: 10, thickness: .085});
    p.cube('Chibi belt keeper', [.53, -.427, 3.06], [.095, .12, .325], c.leatherDark, {bevel: .008});
    p.with('hips', 'trim', () => {
      const mat = wizard ? c.trim : c.metalEdge;
      p.cube('Chibi buckle top', [0, -.511, 3.208], [.44, .095, .07], mat);
      p.cube('Chibi buckle bottom', [0, -.511, 2.936], [.44, .095, .07], mat);
      for (const s of [-1, 1]) p.cube(`Chibi buckle side ${s}`, [s * .185, -.511, 3.073], [.07, .095, .275], mat);
      p.cube('Chibi buckle tongue', [.03, -.572, 3.077], [.235, .05, .043], mat);
    });
    p.cube('Chibi belt pouch', [-.82, .005, 2.83], [.31, .42, .48], c.leatherDark, {bevel: .055});
    p.cube('Chibi pouch flap', [-.833, -.018, 3.015], [.34, .46, .16], c.leather, {bevel: .03});
  });
  if (wizard) buildBook(p, c);
}

function buildBook(p, c) {
  p.with('hips', 'leather', () => p.strip('Chibi book hanger', [[.60, -.28, 3.18], [.86, -.26, 2.83], [.91, -.25, 2.41]], .115, c.leather));
  p.with('hips', 'cloth', () => {
    p.cube('Chibi book pages', [.94, -.10, 2.39], [.44, .26, .73], '#baa887', {bevel: .015});
    for (const y of [-.27, .062]) p.cube(`Chibi blue book cover ${y}`, [.94, y, 2.39], [.52, .07, .84], c.cloth, {bevel: .015});
    p.cube('Chibi leather book spine', [.688, -.10, 2.39], [.085, .38, .84], c.leather, {bevel: .01});
    p.with('hips', 'trim', () => {
      for (const x of [.735, 1.145]) for (const z of [2.045, 2.735]) p.cube(`Chibi book corner ${x} ${z}`, [x, -.319, z], [.11, .045, .14], c.trim);
      p.panel('Chibi book diamond setting', [[.94, -.322, 2.63], [1.08, -.322, 2.39], [.94, -.322, 2.15], [.80, -.322, 2.39]], .05, c.trim);
      p.panel('Chibi book diamond inlay', [[.94, -.353, 2.54], [1.025, -.353, 2.39], [.94, -.353, 2.24], [.855, -.353, 2.39]], .038, c.clothDark);
    });
  });
}
