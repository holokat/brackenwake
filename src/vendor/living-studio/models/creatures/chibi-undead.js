import {undeadAnatomies} from './undead-anatomy.js';

const sides = [[-1, 'L'], [1, 'R']];
const palettes = {
  scarecrow: {skin: '#b69b6a', cloth: '#826542', straw: '#d0b773', dark: '#55452d', wood: '#6c5134', eye: '#332e23'},
  zombie: {skin: '#8d9d7a', shade: '#738462', cloth: '#655344', dark: '#444b37', eye: '#283126'},
  drowned: {skin: '#7eaaa6', shade: '#5e8d88', cloth: '#365e62', dark: '#2c4d50', kelp: '#566e45', eye: '#253e3d'},
};
const add = (p, x = 0, y = 0, z = 0) => [p[0] + x, p[1] + y, p[2] + z];
const between = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);

function limb(s, name, bone, points, radii, color, faces = 8) {
  s.bone = bone;
  return s.tube(name, points, radii, color, faces);
}

/** Closed cloth and webbing. Front outlines are convex. */
function panel(s, name, front, depth, color) {
  const n = front.length, vertices = [...front, ...front.map(([x, y, z]) => [x, y + depth, z])];
  const faces = [Array.from({length: n}, (_, i) => n - i - 1), Array.from({length: n}, (_, i) => n + i)];
  for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, (i + 1) % n + n, i + n]);
  return s.mesh(name, vertices, faces, color);
}

/** Project details onto the actual faceted front, including curved cheeks. */
function frontAt(mesh, x, z) {
  const p = mesh.geometry.attributes.position;
  let front = Infinity;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), az = p.getZ(i), bx = p.getX(i + 1), bz = p.getZ(i + 1), cx = p.getX(i + 2), cz = p.getZ(i + 2);
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denominator) < 1e-9) continue;
    const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
    const b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator, c = 1 - a - b;
    if (a >= -1e-6 && b >= -1e-6 && c >= -1e-6) front = Math.min(front, a * p.getY(i) + b * p.getY(i + 1) + c * p.getY(i + 2));
  }
  if (!Number.isFinite(front)) throw new Error('Unsupported ' + mesh.name + ' detail at ' + x + ', ' + z);
  return front;
}

function patch(s, name, support, points, color, raised = .018, depth = .065) {
  const cell = .075, vertices = [], faces = [], byPoint = new Map(), edges = new Map();
  const clip = (polygon, axis, bound, sign) => {
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const insideA = (a[axis] - bound) * sign >= -1e-9, insideB = (b[axis] - bound) * sign >= -1e-9;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = (bound - a[axis]) / (b[axis] - a[axis]);
        result.push(a.map((n, j) => n + (b[j] - n) * t));
      }
    }
    return result;
  };
  const vertex = ([x, z]) => {
    const key = x.toFixed(6) + ',' + z.toFixed(6);
    if (!byPoint.has(key)) {byPoint.set(key, vertices.length); vertices.push([x, frontAt(support, x, z) - raised, z]);}
    return byPoint.get(key);
  };
  const minX = Math.floor(Math.min(...points.map(p => p[0])) / cell), maxX = Math.ceil(Math.max(...points.map(p => p[0])) / cell);
  const minZ = Math.floor(Math.min(...points.map(p => p[1])) / cell), maxZ = Math.ceil(Math.max(...points.map(p => p[1])) / cell);
  for (let x = minX; x < maxX; x++) for (let z = minZ; z < maxZ; z++) {
    let polygon = points;
    for (const [axis, bound, sign] of [[0, x * cell, 1], [0, (x + 1) * cell, -1], [1, z * cell, 1], [1, (z + 1) * cell, -1]]) polygon = clip(polygon, axis, bound, sign);
    const ids = [...new Set(polygon.map(vertex))];
    if (ids.length < 3) continue;
    for (let i = 1; i < ids.length - 1; i++) {
      const triangle = [ids[0], ids[i], ids[i + 1]], a = vertices[triangle[0]], b = vertices[triangle[1]], c = vertices[triangle[2]];
      if (Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) < 1e-10) continue;
      faces.push(triangle);
      for (let e = 0; e < 3; e++) {
        const pair = [triangle[e], triangle[(e + 1) % 3]], key = [...pair].sort((a, b) => a - b).join(',');
        const existing = edges.get(key); if (existing) existing.count++; else edges.set(key, {pair, count: 1});
      }
    }
  }
  const count = vertices.length, frontFaces = [...faces];
  vertices.push(...vertices.map(([x, y, z]) => [x, y + depth, z]));
  for (const face of frontFaces) faces.push(face.slice().reverse().map(i => i + count));
  for (const {pair: [a, b], count: uses} of edges.values()) if (uses === 1) faces.push([a, a + count, b + count, b]);
  return s.mesh(name, vertices, faces, color);
}

function eye(s, name, head, x, z, width, height, color) {
  const w = width / 2, h = height / 2, c = Math.min(width, height) * .20;
  patch(s, name, head, [[x - w + c, z - h], [x + w - c, z - h], [x + w, z - h + c],
    [x + w, z + h - c], [x + w - c, z + h], [x - w + c, z + h], [x - w, z + h - c], [x - w, z - h + c]], color);
}

function stitch(s, name, support, points, color, radius = .018) {
  s.tube(name, points.map(([x, z]) => [x, frontAt(support, x, z) - .020, z]), radius, color, 4);
}

function tuft(s, name, center, tip, color, spread = .11) {
  for (let i = -1; i <= 1; i++) s.tube(name + ' ' + (i + 1), [add(center, i * spread), add(tip, i * spread * 1.7, Math.abs(i) * .025, Math.abs(i) * .045)], [.060, .014], color, 4);
}

function bareFoot(s, name, side, p, color, width, reach) {
  s.bone = 'foot' + side;
  return s.loft(name, [[p[0], p[1] - reach * .32, .025, width * .9, reach * .76],
    [p[0], p[1] - reach * .38, .15, width, reach], [p[0], p[1] - .08, p[2] + .14, width * .77, reach * .70],
    [p[0], p[1] + .025, p[2] + .24, width * .58, reach * .43]], color, 8);
}

function scarecrow(s, c, j) {
  s.bone = 'chest';
  const sack = s.loft('Scarecrow stuffed asymmetrical body sack', [[.04, .04, 2.48, .53, .32], [.02, .04, 2.82, .75, .44],
    [-.04, .05, 3.44, .87, .49], [0, .03, 3.91, .78, .44], [.02, .02, 4.19, .44, .32]], c.cloth, 10);
  patch(s, 'Scarecrow sewn belly patch', sack, [[-.48, 3.30], [-.09, 3.34], [-.07, 2.96], [-.42, 2.93]], c.skin, .028, .075);
  stitch(s, 'Scarecrow sack belly seam', sack, [[.30, 2.79], [.40, 3.13], [.40, 3.57]], c.dark);
  for (const z of [3.00, 3.21, 3.42]) stitch(s, 'Scarecrow belly cross stitch ' + z, sack, [[.32, z], [.46, z + .035]], c.straw);
  s.bone = 'hips';
  s.loft('Scarecrow tied lower sack', [[0, .04, 2.35, .46, .29], [0, .04, 2.64, .56, .33]], c.skin, 8);
  limb(s, 'Scarecrow visible neck pole', 'neck', [add(j.neck, 0, 0, -.25), add(j.head, 0, 0, .20)], [.14, .125], c.wood, 6);
  s.bone = 'head';
  const head = s.loft('Scarecrow rounded tied sack head', [[.05, -.11, 4.61, .40, .35], [.04, -.12, 4.81, .65, .50],
    [.05, -.13, 5.19, .77, .58], [.02, -.12, 5.58, .70, .53], [-.04, -.10, 5.83, .47, .38]], c.skin, 10);
  eye(s, 'Scarecrow left sewn eye', head, -.23, 5.23, .18, .28, c.eye);
  eye(s, 'Scarecrow right sewn eye', head, .30, 5.22, .19, .31, c.eye);
  stitch(s, 'Scarecrow crooked stitched smile', head, [[-.27, 4.98], [.03, 4.91], [.33, 4.99]], c.eye, .022);
  for (const x of [-.16, .03, .22]) stitch(s, 'Scarecrow smile stitch ' + x, head, [[x - .025, 4.88], [x + .025, 5.00]], c.eye);
  stitch(s, 'Scarecrow head sack seam', head, [[.47, 5.24], [.47, 5.49], [.37, 5.67]], c.dark);
  const brim = s.loft('Scarecrow drooping round farm brim', [[-.03, -.08, 5.73, .77, .59], [-.03, -.08, 5.80, 1.17, .91],
    [-.03, -.08, 5.90, 1.13, .88]], c.dark, 10);
  const bp = brim.geometry.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setZ(i, bp.getZ(i) - Math.max(0, Math.abs(bp.getX(i)) - .65) * .22 + bp.getX(i) * .06);
  bp.needsUpdate = true; brim.geometry.computeVertexNormals();
  s.loft('Scarecrow crumpled hat crown', [[-.04, -.08, 5.83, .73, .57], [-.10, -.02, 6.08, .55, .43], [-.24, .04, 6.30, .27, .27]], c.cloth, 8);
  s.loft('Scarecrow wide hat binding', [[-.04, -.08, 5.84, .745, .58], [-.065, -.055, 5.98, .65, .51]], c.straw, 8);
  for (const [sign, side] of sides) {
    const shoulder = j['upperArm' + side], elbow = j['forearm' + side], hand = j['hand' + side];
    limb(s, 'Scarecrow upper wooden stick ' + side, 'upperArm' + side, [add(shoulder, -sign * .13, 0, .04), add(elbow, 0, 0, -.10)], [.135, .105], c.wood, 6);
    limb(s, 'Scarecrow loose short sacking sleeve ' + side, 'upperArm' + side, [shoulder, between(shoulder, elbow, .54)], [.27, .24], c.cloth, 8);
    tuft(s, 'Scarecrow straw sleeve ' + side, add(between(shoulder, elbow, .50), 0, -.19), add(between(shoulder, elbow, .84), sign * .10, -.23), c.straw);
    limb(s, 'Scarecrow exposed forearm pole ' + side, 'forearm' + side, [add(elbow, 0, 0, .08), add(hand, 0, 0, -.09)], [.115, .085], c.wood, 6);
    s.bone = 'hand' + side;
    s.ico('Scarecrow tied straw palm ' + side, add(hand, 0, -.025, -.09), [.18, .14, .24], c.straw, 1);
    tuft(s, 'Scarecrow straw fingers ' + side, add(hand, 0, -.045, -.10), add(hand, sign * .055, -.09, -.40), c.straw, .085);
    limb(s, 'Scarecrow wrist twine ' + side, 'hand' + side, [add(hand, 0, 0, .08), add(hand, 0, 0, -.01)], [.16, .16], c.dark, 6);
    const thigh = j['thigh' + side], knee = j['shin' + side], foot = j['foot' + side];
    limb(s, 'Scarecrow long thigh pole ' + side, 'thigh' + side, [add(thigh, 0, 0, .13), add(knee, 0, 0, -.08)], [.15, .12], c.wood, 6);
    limb(s, 'Scarecrow short straw hip bundle ' + side, 'thigh' + side, [thigh, between(thigh, knee, .27)], [.255, .22], c.skin, 8);
    tuft(s, 'Scarecrow loose hip straw ' + side, add(between(thigh, knee, .23), 0, -.14), add(between(thigh, knee, .50), 0, -.17), c.straw);
    limb(s, 'Scarecrow lower wooden stick ' + side, 'shin' + side, [add(knee, 0, 0, .08), add(foot, 0, 0, -.08)], [.12, .095], c.wood, 6);
    limb(s, 'Scarecrow knee binding ' + side, 'shin' + side, [add(knee, 0, 0, .07), add(knee, 0, 0, -.08)], [.17, .17], c.dark, 6);
    s.bone = 'foot' + side;
    s.loft('Scarecrow splayed straw foot ' + side, [[foot[0], -.23, .025, .22, .34], [foot[0], -.20, .15, .24, .38],
      [foot[0], -.09, .38, .15, .19]], c.straw, 6);
  }
}

function zombie(s, c, j) {
  s.bone = 'hips';
  s.loft('Zombie crooked bare pelvis', [[0, .12, 1.93, .48, .38], [.02, .13, 2.38, .68, .52], [-.03, .14, 2.75, .65, .53]], c.skin, 10);
  s.bone = 'chest';
  const body = s.loft('Zombie hunched asymmetrical torso', [[-.03, .10, 2.20, .51, .41], [-.08, -.02, 2.68, .78, .62],
    [-.12, .06, 3.32, .87, .65], [-.12, .15, 3.84, .83, .57], [-.16, .16, 4.18, .59, .43], [-.16, .11, 4.36, .27, .25]], c.skin, 10);
  s.ico('Zombie rounded high back hunch', [-.14, .45, 3.94], [.66, .47, .49], c.skin, 2);
  patch(s, 'Zombie muted belly skin patch', body, [[-.35, 2.92], [.09, 3.00], [.22, 2.64], [-.25, 2.46]], c.shade, .014, .045);
  patch(s, 'Zombie ragged shoulder cloth', body, [[-.63, 3.82], [-.28, 4.12], [-.30, 3.17], [-.58, 2.87]], c.cloth, .035, .10);
  limb(s, 'Zombie forward leaning thick neck', 'neck', [[-.15, .04, 3.95], [-.12, -.26, 4.33], [-.10, -.48, 4.70]], [.31, .30, .27], c.skin, 8);
  s.bone = 'head';
  const head = s.loft('Zombie forward drooping lopsided head', [[-.11, -.55, 4.31, .37, .33], [-.09, -.61, 4.46, .61, .51],
    [-.10, -.60, 4.93, .76, .61], [-.15, -.53, 5.33, .71, .57], [-.19, -.47, 5.61, .46, .39], [-.20, -.44, 5.70, .23, .23]], c.skin, 10);
  eye(s, 'Zombie heavy left eye', head, -.39, 4.99, .19, .29, c.eye);
  eye(s, 'Zombie drooping right eye', head, .20, 4.88, .22, .17, c.eye);
  stitch(s, 'Zombie quiet crooked mouth', head, [[-.22, 4.57], [.03, 4.53], [.21, 4.58]], c.eye, .017);
  stitch(s, 'Zombie cheek seam', head, [[.33, 4.74], [.45, 4.78]], c.eye);
  for (const x of [.35, .43]) stitch(s, 'Zombie cheek stitch ' + x, head, [[x - .015, 4.72], [x + .015, 4.81]], c.eye, .014);
  s.ico('Zombie matted crown clump', [-.28, -.33, 5.56], [.57, .44, .25], c.dark, 1);
  s.ico('Zombie matted rear clump', [-.14, -.01, 5.19], [.61, .26, .48], c.dark, 1);
  s.ico('Zombie hanging left hair clump', [-.65, -.40, 5.20], [.24, .31, .39], c.dark, 1);
  s.bone = 'hips';
  s.loft('Zombie small tattered waist wrap', [[0, .12, 2.20, .66, .54], [0, .12, 2.44, .71, .56]], c.cloth, 10);
  panel(s, 'Zombie dangling waist rag', [[.09, -.447, 2.37], [.43, -.40, 2.37], [.38, -.42, 1.94], [.12, -.49, 2.08]], .12, c.cloth);
  for (const [sign, side] of sides) {
    const shoulder = j['upperArm' + side], elbow = j['forearm' + side], hand = j['hand' + side];
    limb(s, 'Zombie long uneven upper arm ' + side, 'upperArm' + side, [add(shoulder, -sign * .09, 0, .11), between(shoulder, elbow, .43), add(elbow, 0, 0, -.09)], [.33, .30, .24], c.skin);
    if (side === 'R') limb(s, 'Zombie single torn sleeve', 'upperArmR', [add(shoulder, 0, 0, .04), between(shoulder, elbow, .43)], [.36, .33], c.cloth);
    limb(s, 'Zombie long drooping forearm ' + side, 'forearm' + side, [add(elbow, 0, 0, .10), between(elbow, hand, .50), add(hand, 0, 0, -.08)], [.25, .25, .21], c.skin);
    s.bone = 'hand' + side;
    s.loft('Zombie heavy dangling palm ' + side, [[hand[0], hand[1], hand[2] + .10, .22, .20],
      [hand[0] + sign * .025, hand[1] - .05, hand[2] - .16, .29, .22], [hand[0] + sign * .035, hand[1] - .02, hand[2] - .34, .23, .19]], c.skin, 8);
    for (let finger = -1; finger <= 1; finger++) s.tube('Zombie blunt finger ' + side + ' ' + finger, [add(hand, finger * .14, -.08, -.20), add(hand, finger * .15, -.10, -.47 + Math.abs(finger) * .07)], [.09, .07], c.shade, 6);
    s.ico('Zombie tucked thumb ' + side, add(hand, -sign * .23, -.08, -.13), [.14, .15, .20], c.skin, 1);
    const thigh = j['thigh' + side], knee = j['shin' + side], foot = j['foot' + side];
    limb(s, 'Zombie bowed bare thigh ' + side, 'thigh' + side, [add(thigh, 0, 0, .15), between(thigh, knee, .54), add(knee, 0, 0, -.10)], [.34, .31, .27], c.skin);
    limb(s, 'Zombie short bare shin ' + side, 'shin' + side, [add(knee, 0, 0, .12), between(knee, foot, .56), add(foot, 0, 0, -.03)], [.28, .25, .23], c.shade);
    bareFoot(s, 'Zombie broad heavy bare foot ' + side, side, foot, c.skin, .37, .53);
    for (const offset of [-.13, .10]) s.tube('Zombie shallow toe crease ' + side + ' ' + offset, [[foot[0] + offset, foot[1] - .53, .17], [foot[0] + offset, foot[1] - .40, .25]], .017, c.shade, 4);
  }
}

function drowned(s, c, j) {
  s.bone = 'hips';
  s.loft('Drowned low heavy pelvis', [[0, .04, 1.55, .61, .50], [0, .04, 1.99, .83, .68], [0, .07, 2.42, .88, .69]], c.skin, 10);
  s.bone = 'chest';
  const body = s.loft('Drowned swollen sagging body', [[0, -.10, 1.80, .61, .50], [0, -.16, 2.16, 1.00, .80],
    [0, -.10, 2.77, 1.13, .87], [0, .09, 3.36, 1.07, .76], [0, .16, 3.77, .78, .55], [.03, .03, 4.04, .40, .32]], c.skin, 12);
  patch(s, 'Drowned pale lower belly', body, [[-.51, 2.91], [.49, 2.95], [.68, 2.37], [.21, 2.04], [-.51, 2.18]], '#90b7ad', .012, .055);
  patch(s, 'Drowned ragged sailor shoulder remnant', body, [[-.59, 3.76], [-.20, 3.94], [-.26, 3.27], [-.76, 2.94]], c.cloth, .025, .08);
  patch(s, 'Drowned kelp across shoulder', body, [[.47, 3.66], [.70, 3.53], [.72, 2.91], [.48, 2.54]], c.kelp, .048, .085);
  limb(s, 'Drowned thick forward neck fold', 'neck', [[.02, -.02, 3.66], [.06, -.25, 4.04], [.06, -.43, 4.42]], [.34, .35, .29], c.shade);
  s.bone = 'head';
  const head = s.loft('Drowned soft swollen head', [[.06, -.45, 4.02, .37, .32], [.06, -.49, 4.23, .62, .51],
    [.06, -.47, 4.62, .75, .60], [.06, -.43, 5.01, .71, .57], [.09, -.39, 5.26, .49, .39], [.10, -.36, 5.37, .20, .20]], c.skin, 10);
  eye(s, 'Drowned left dark eye', head, -.23, 4.66, .19, .25, c.eye);
  eye(s, 'Drowned right dark eye', head, .35, 4.65, .19, .25, c.eye);
  stitch(s, 'Drowned quiet mouth', head, [[-.08, 4.28], [.10, 4.25], [.26, 4.28]], c.dark, .018);
  s.loft('Drowned rounded tied headcloth', [[.06, -.43, 4.98, .77, .63], [.08, -.38, 5.25, .62, .51],
    [.18, -.30, 5.48, .26, .27]], c.cloth, 10);
  s.ico('Drowned sailor cloth knot', [.77, -.08, 4.94], [.20, .19, .20], c.cloth, 1);
  panel(s, 'Drowned short wet cloth tail', [[.72, -.19, 4.94], [.91, -.13, 4.86], [.94, -.12, 4.45], [.70, -.19, 4.58]], .19, c.cloth);
  s.bone = 'hips';
  s.loft('Drowned small ragged hip wrap', [[0, .03, 1.75, .83, .68], [0, .05, 2.10, .91, .72]], c.cloth, 10);
  panel(s, 'Drowned trailing hip cloth', [[.27, -.65, 2.03], [.68, -.52, 2.03], [.72, -.51, 1.41], [.33, -.65, 1.55]], .16, c.cloth);
  for (const [sign, side] of sides) {
    const shoulder = j['upperArm' + side], elbow = j['forearm' + side], hand = j['hand' + side];
    limb(s, 'Drowned broad upper arm ' + side, 'upperArm' + side, [add(shoulder, -sign * .10, 0, .10), between(shoulder, elbow, .5), add(elbow, 0, 0, -.11)], [.40, .38, .32], c.skin);
    limb(s, 'Drowned swollen lower arm ' + side, 'forearm' + side, [add(elbow, 0, 0, .11), between(elbow, hand, .5), add(hand, 0, 0, -.08)], [.33, .35, .29], c.skin);
    s.bone = 'hand' + side;
    panel(s, 'Drowned broad webbed paddle hand ' + side, [[hand[0] - .24, hand[1] - .17, hand[2] + .12], [hand[0] + .24, hand[1] - .17, hand[2] + .12],
      [hand[0] + .39, hand[1] - .21, hand[2] - .25], [hand[0] + .22, hand[1] - .20, hand[2] - .51],
      [hand[0] - .22, hand[1] - .20, hand[2] - .51], [hand[0] - .39, hand[1] - .21, hand[2] - .25]], .34, c.skin);
    for (const offset of [-.16, .16]) s.tube('Drowned joined webbing ridge ' + side + ' ' + offset, [add(hand, offset, -.215, -.13), add(hand, offset * 1.3, -.225, -.40)], [.035, .025], c.shade, 5);
    const thigh = j['thigh' + side], knee = j['shin' + side], foot = j['foot' + side];
    limb(s, 'Drowned squat bowed thigh ' + side, 'thigh' + side, [add(thigh, 0, 0, .15), between(thigh, knee, .5), add(knee, 0, 0, -.10)], [.39, .38, .32], c.skin);
    limb(s, 'Drowned heavy short shin ' + side, 'shin' + side, [add(knee, 0, 0, .12), add(foot, 0, 0, -.02)], [.33, .28], c.shade);
    bareFoot(s, 'Drowned broad webbed foot ' + side, side, foot, c.skin, .41, .54);
    s.bone = 'upperArm' + side;
    for (let growth = 0; growth < 2; growth++) s.ico('Drowned shoulder shell growth ' + side + ' ' + growth,
      add(shoulder, sign * (.11 + growth * .13), -.28, .03 - growth * .18), [.12, .085, .14], '#a2b29b', 1);
  }
  s.bone = 'chest';
  for (const [index, x] of [-.42, -.11, .22].entries()) s.ico('Drowned back barnacle ' + index, [x, .79, 3.05 + index * .18], [.18, .14, .19], '#93a58d', 1);
}

export function buildChibiUndead(s, id, options = {}) {
  if (!Object.hasOwn(palettes, id)) throw new Error('Unknown chibi undead: ' + id);
  const colors = {...palettes[id], ...(options.clothColor ? {cloth: options.clothColor} : {})};
  ({scarecrow, zombie, drowned})[id](s, colors, undeadAnatomies[id].joints);
  return {colors};
}
