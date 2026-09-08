import * as T from 'three';
// Shared, original low-poly funerary architecture. Static detail is instanced.
export function createCellarArtKit(root, bodies) {
    const batches = new Map(), animated = [], lamps = [], dummy = new T.Object3D(), clock = { value: 0 };
    const colors = { stone: 0x3b4659, edge: 0x707785, dark: 0x192330, gold: 0x937345, bone: 0xc1b79c, iron: 0x323840, wood: 0x523a2e, wax: 0xe6c996, cloth: 0x59334f, green: 0x385a4b, fire: 0xffc46b, soul: 0x7ac5e7 };
    const materials = Object.fromEntries(Object.entries(colors).map(([id, color]) => [id, new T.MeshStandardMaterial({ color, roughness: id === 'gold' ? .45 : .85, metalness: id === 'gold' ? .65 : id === 'iron' ? .6 : 0, flatShading: true, ...(['fire', 'soul'].includes(id) ? { emissive: color, emissiveIntensity: .65 } : {}) })]));
    for (const id of ['book-red', 'book-blue', 'book-green', 'book-brown'])
        materials[id] = new T.MeshStandardMaterial({ color: { 'book-red': 0x794745, 'book-blue': 0x475d72, 'book-green': 0x556752, 'book-brown': 0x9a7952 }[id], roughness: 1 });
    const bevelShape = new T.Shape([[-.46, -.5], [.46, -.5], [.5, -.46], [.5, .46], [.46, .5], [-.46, .5], [-.5, .46], [-.5, -.46]].map(p => new T.Vector2(...p)));
    const bevelBox = new T.ExtrudeGeometry(bevelShape, { depth: .92, bevelEnabled: true, bevelThickness: .04, bevelSize: .035, bevelSegments: 1, steps: 1, curveSegments: 1 });
    bevelBox.translate(0, 0, -.46);
    const geos = { box: new T.BoxGeometry(1, 1, 1), masonry: bevelBox, rock: new T.IcosahedronGeometry(1, 0), cone: new T.ConeGeometry(1, 1, 6), cylinder: new T.CylinderGeometry(1, 1, 1, 10), ring: new T.TorusGeometry(1, .065, 4, 12), flame: new T.OctahedronGeometry(1, 0) };
    const profile = (points, depth, holes = []) => {
        const shape = new T.Shape(points.map(p => new T.Vector2(...p)));
        for (const loop of holes)
            shape.holes.push(new T.Path(loop.map(p => new T.Vector2(...p))));
        const g = new T.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: false });
        g.translate(0, 0, -depth / 2);
        return g;
    };
    geos.coffin = profile([[-.35, .5], [.35, .5], [.5, .25], [.28, -.45], [0, -.6], [-.28, -.45], [-.5, .25]], 1);
    geos.skull = profile([[-.5, .15], [-.38, .5], [0, .64], [.38, .5], [.5, .15], [.3, -.35], [-.3, -.35]], .65, [[[-.38, .2], [-.08, .15], [-.18, -.05]], [[.38, .2], [.18, -.05], [.08, .15]], [[-.08, -.18], [.08, -.18], [0, .01]]]);
    geos.banner = profile([[-.5, 0], [.5, 0], [.5, -1], [.26, -.9], [.09, -1.1], [-.08, -.93], [-.3, -1.05], [-.5, -.9]], .016);
    geos.bell = new T.LatheGeometry([new T.Vector2(.86, -.5), new T.Vector2(1, -.43), new T.Vector2(.94, -.3), new T.Vector2(.66, -.2), new T.Vector2(.57, .25), new T.Vector2(.38, .48), new T.Vector2(.13, .53)], 12);
    function add(geo, mat, x, y, z, w = 1, h = 1, d = 1, rx = 0, ry = 0, rz = 0) {
        geo = typeof geo === 'string' ? geos[geo] : geo;
        const key = geo.uuid + mat;
        if (!batches.has(key))
            batches.set(key, { geo, mat, items: [] });
        batches.get(key).items.push({ x, y, z, w, h, d, rx, ry, rz });
    }
    const box = (mat, x, y, z, w, h, d, ry = 0) => add(['stone', 'edge'].includes(mat) ? 'masonry' : 'box', mat, x, y, z, w, h, d, 0, ry);
    function beam(mat, a, b, w = .2, d = w) { const v = new T.Vector3(...b).sub(new T.Vector3(...a)), mid = new T.Vector3(...a).addScaledVector(v, .5), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), v.clone().normalize()), e = new T.Euler().setFromQuaternion(q); add('box', mat, mid.x, mid.y, mid.z, w, v.length(), d, e.x, e.y, e.z); }
    function chain(a, b, size = .2) {
        const v = new T.Vector3(...b).sub(new T.Vector3(...a)), len = v.length(), n = Math.ceil(len / (size * 1.4)), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), v.clone().normalize());
        for (let i = 0; i <= n; i++) {
            const p = new T.Vector3(...a).addScaledVector(v, i / n), e = new T.Euler().setFromQuaternion(q);
            add('ring', 'iron', p.x, p.y, p.z, size, size * 1.45, size, e.x, e.y + (i % 2) * Math.PI / 2, e.z);
        }
    }
    function candle(x, y, z, h = .6) { add('cylinder', 'wax', x, y + h / 2, z, .13, h, .13); add('flame', 'fire', x, y + h + .18, z, .095, .27, .095); }
    function candles(x, y, z, count = 7, spread = 1.5) {
        for (let i = 0; i < count; i++)
            candle(x + Math.sin(i * 5.17) * spread, y, z + Math.cos(i * 3.71) * spread, .28 + (i * 7 % 9) * .12);
    }
    function skull(x, y, z, scale = 1, ry = 0) {
        const fx = Math.sin(ry), fz = Math.cos(ry);
        add('rock', 'bone', x - fx * scale, y + scale * .1, z - fz * scale, scale * .52, scale * .58, scale * .65, 0, ry);
        box('dark', x - fx * .42 * scale, y, z - fz * .42 * scale, .8 * scale, .85 * scale, .03 * scale, ry);
        add('skull', 'bone', x, y, z, scale, scale, scale, 0, ry);
        for (let i = 0; i < 5; i++)
            add('box', 'bone', x + Math.cos(ry) * (i - 2) * scale * .13, y - scale * .4, z - Math.sin(ry) * (i - 2) * scale * .13, scale * .09, scale * .24, scale * .35, 0, ry);
    }
    function coffin(x, y, z, size = 1, ry = 0, standing = false) {
        const rot = standing ? 0 : -Math.PI / 2, fx = Math.sin(ry), fz = Math.cos(ry);
        bodies.push({ kind: 'box', model: 'cellar coffin', x, y, z, w: 2.16 * size, d: (standing ? 1.43 : 4.12) * size, h: (standing ? 4.2 : 1.5) * size, c: Math.cos(ry), s: Math.sin(ry) });
        add('coffin', 'stone', x, y + (standing ? 2 : .7) * size, z, 2 * size, 4 * size, 1.25 * size, rot, ry);
        add('coffin', 'edge', x + (standing ? fx * .67 * size : 0), y + (standing ? 2 : 1.38) * size, z + (standing ? fz * .67 * size : 0), 2.16 * size, 4.12 * size, .18 * size, rot, ry);
        if (standing) {
            skull(x + fx * .85 * size, y + 2.9 * size, z + fz * .85 * size, .55 * size, ry);
            for (let i = 0; i < 4; i++)
                box('gold', x + fx * .8 * size, y + (1.3 + i * .35) * size, z + fz * .8 * size, .5 * size, .08 * size, .07 * size, ry);
        }
        else {
            add('box', 'gold', x, y + 1.5 * size, z, .18 * size, .06 * size, 2.1 * size, 0, ry);
            candles(x + size * .8, y + 1.5 * size, z + size, 3, size * .3);
        }
    }
    function floorInlay(x, y, z, radius, width = .16, mat = 'gold') { const g = new T.RingGeometry(radius - width / 2, radius + width / 2, 96); add(g, mat, x, y, z, 1, 1, 1, -Math.PI / 2); }
    function arch(x, y, z, width, height, depth = 1.2, ry = 0) {
        const radius = width / 2, rise = Math.min(height * .55, radius * .92), stem = height - rise;
        const thickness = Math.min(3.2, Math.max(.3, width * .045));
        const world = (px, py) => [x + px * Math.cos(ry), y + py, z - px * Math.sin(ry)];
        for (const side of [-1, 1]) {
            for (let j = 0; j < Math.ceil(stem / 2.5); j++) {
                const h = stem / Math.ceil(stem / 2.5);
                box('stone', ...world(side * (radius + thickness * .25), (j + .5) * h), thickness, h - .035, depth, ry);
            }
            for (let i = 0; i < 16; i++) {
                const point = v => world(side * radius * (1 - v), stem + rise * (1 - (1 - v) ** 2));
                beam(i === 15 ? 'edge' : 'stone', point(i / 16), point((i + 1) / 16), thickness, depth);
            }
            box('edge', ...world(side * (radius + thickness * .25), .25), thickness * 1.6, .5, depth * 1.2, ry);
            box('edge', ...world(side * (radius + thickness * .25), stem), thickness * 1.4, .3, depth * 1.15, ry);
        }
    }
    function banner(x, y, z, w = 2, h = 5, ry = 0) {
        add('banner', 'cloth', x, y, z, w, h, 1, 0, ry);
        beam('gold', [x - Math.cos(ry) * w * .6, y, z + Math.sin(ry) * w * .6], [x + Math.cos(ry) * w * .6, y, z - Math.sin(ry) * w * .6], .13);
        const mark = [[0, -.2], [.24, -.43], [0, -.67], [-.24, -.43], [0, -.2]];
        for (let i = 0; i < 4; i++)
            beam('gold', [x + mark[i][0] * w * Math.cos(ry), y + mark[i][1] * h, z - mark[i][0] * w * Math.sin(ry) + .07], [x + mark[i + 1][0] * w * Math.cos(ry), y + mark[i + 1][1] * h, z - mark[i + 1][0] * w * Math.sin(ry) + .07], .065);
        for (const side of [-1, 1])
            beam('gold', [x, y - h * .25, z + .1], [x + side * w * .18, y - h * .5, z + .1], .035);
    }
    function brazier(x, y, z, size = 1, soul = false) {
        add('cylinder', 'stone', x, y + .25 * size, z, .8 * size, .5 * size, .8 * size);
        add('cylinder', 'gold', x, y + 1.25 * size, z, .32 * size, 2 * size, .32 * size);
        add('cone', 'iron', x, y + 2.4 * size, z, 1.1 * size, .7 * size, 1.1 * size, Math.PI);
        for (let i = 0; i < 5; i++)
            add('flame', soul ? 'soul' : 'fire', x + Math.sin(i * 2.3) * size * .45, y + (2.9 + i % 2 * .3) * size, z + Math.cos(i * 2.3) * size * .45, .22 * size, (.65 + i % 3 * .2) * size, .22 * size);
        lamps.push(new T.Vector3(x, y + 3.3 * size, z));
    }
    function chandelier(x, y, z, size = 3, drop = 8) {
        // Hexagonal coffin lanterns, with open iron ribs around the fire.
        chain([x, y + drop, z], [x, y + size * 1.4, z], .24);
        const radius = size * .45, h = size * 1.5;
        for (const dy of [-h * .5, h * .5]) {
            add('cylinder', 'gold', x, y + dy, z, radius * 1.13, .18 * size, radius * 1.13);
            add('cone', 'iron', x, y + dy + Math.sign(dy) * .3 * size, z, radius, .6 * size, radius, dy > 0 ? 0 : Math.PI);
        }
        for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3, px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
            box('iron', px, y, pz, .12 * size, h, .12 * size);
            add('cone', 'gold', px, y + h * .5 + .32 * size, pz, .1 * size, .6 * size, .1 * size);
        }
        for (let i = 0; i < 5; i++)
            add('flame', 'fire', x + Math.sin(i * 2.4) * radius * .35, y - h * .25, z + Math.cos(i * 2.4) * radius * .35, size * .1, size * .65, size * .1);
        lamps.push(new T.Vector3(x, y, z));
    }
    function bookcase(x, y, z, w = 6, h = 9, ry = 0) {
        const at = (px, py, pz) => [x + px * Math.cos(ry) + pz * Math.sin(ry), y + py, z - px * Math.sin(ry) + pz * Math.cos(ry)];
        box('wood', ...at(0, h / 2, 0), w, h, .3, ry);
        for (const side of [-1, 1])
            box('wood', ...at(side * w / 2, h / 2, .65), .27, h, 1.6, ry);
        for (let row = 0; row <= Math.floor(h / 1.4); row++) {
            const yy = row * 1.4;
            box('wood', ...at(0, yy, .65), w, .18, 1.6, ry);
            for (let i = 0; i < Math.floor(w / .36); i++) {
                const bh = .55 + ((i * 3 + row * 5) % 7) * .08;
                box(['book-red', 'book-blue', 'book-green', 'book-brown'][(i + row) % 4], ...at(-w / 2 + .25 + i * .36, yy + .1 + bh / 2, .8), .27, bh, .9, ry);
                box('gold', ...at(-w / 2 + .25 + i * .36, yy + .26, 1.27), .2, .035, .03, ry);
            }
        }
    }
    function niche(x, y, z, size = 1, ry = 0) { arch(x, y, z, 2.6 * size, 5 * size, 1, ry); box('dark', x - Math.sin(ry) * .1, y + 2.1 * size, z - Math.cos(ry) * .1, 2.7 * size, 4.2 * size, .2, ry); coffin(x, y + .1, z + .25, size * .68, ry, true); candles(x, y + .1, z + size, 4, size * .65); }
    function barrel(x, y, z, size = 1, ry = 0) {
        add('cylinder', 'wood', x, y + size, z, size, 2 * size, size, Math.PI / 2, ry);
        for (const side of [-1, 1])
            add('ring', 'iron', x, y + size, z + side * size * .7, size, size, .5, 0, ry);
    }
    function stair(x, y, z, w = 5, rise = 5, length = 16, direction = -1) {
        const n = Math.ceil(rise / .08);
        for (let i = 0; i < n; i++) {
            const t = (i + .5) / n, sy = y + rise * t, sz = z + direction * (t - .5) * length;
            box('stone', x, sy - .12, sz, w, .24, length / n + .025);
        }
        bodies.push({ kind: 'ramp', model: 'cellar gallery stair', x, y, z, w, d: length, h: rise, direction, c: 1, s: 0 });
        for (const side of [-1, 1]) {
            const ax = x + side * (w / 2 - .15);
            beam('edge', [ax, y + 1.2, z - direction * length / 2], [ax, y + rise + 1.2, z + direction * length / 2], .16);
            for (let i = 0; i < 9; i++) {
                const t = i / 8;
                box('edge', ax, y + t * rise + .6, z + direction * (t - .5) * length, .14, 1.2, .14);
            }
        }
    }
    function deck(x, y, z, w, d, rail = true) {
        box('stone', x, y - .35, z, w, .7, d);
        bodies.push({ kind: 'box', model: 'cellar gallery', x, y: y - .7, z, w, d, h: .7, c: 1, s: 0 });
        for (let i = 0; i < Math.floor(d / 3); i++)
            box('edge', x, y + .04, z - d / 2 + (i + .5) * 3, w, .08, .045);
        if (rail)
            for (const side of [-1, 1]) {
                box('edge', x + side * (w / 2 - .25), y + 1.25, z, .18, .18, d);
                for (let i = 0; i <= Math.ceil(d / 2); i++)
                    box('stone', x + side * (w / 2 - .25), y + .6, z - d / 2 + i * d / Math.ceil(d / 2), .2, 1.2, .2);
            }
    }
    function finish() {
        for (const { geo, mat, items } of batches.values()) {
            const mesh = new T.InstancedMesh(geo, materials[mat], items.length);
            mesh.name = 'Cellar art ' + mat;
            mesh.receiveShadow = true;
            mesh.castShadow = ['stone', 'wood', 'bone', 'iron'].includes(mat);
            items.forEach((p, i) => { dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rx, p.ry, p.rz); dummy.scale.set(p.w, p.h, p.d); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
            mesh.computeBoundingSphere();
            root.add(mesh);
        }
        for (const id of ['fire', 'soul']) {
            materials[id].onBeforeCompile = shader => { shader.uniforms.cellarTime = clock; shader.vertexShader = 'uniform float cellarTime;\n' + shader.vertexShader; shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.x += sin(cellarTime*4.0+position.y*4.0+instanceMatrix[3].x)*max(0.0,position.y)*0.13;'); };
        }
        return { lamps, update(t) {
                clock.value = t;
                for (const fn of animated)
                    fn(t);
            }, counts: { instances: [...batches.values()].reduce((n, b) => n + b.items.length, 0), batches: batches.size } };
    }
    return { root, bodies, materials, geos, profile, add, box, beam, chain, candle, candles, skull, coffin, floorInlay, arch, banner, brazier, chandelier, bookcase, niche, barrel, stair, deck, animated, finish };
}
