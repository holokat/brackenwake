import * as T from 'three';
import { createBlenderVharos } from './cellar_blender_boss.js';
import { CELLAR_CREATURE } from '../mmo/cellar_monsters.js';
export function buildCellarCreature(id, baseBuilder) {
    const e = CELLAR_CREATURE[id];
    if (!e)
        return null;
    const model = baseBuilder(e.base), ornaments = new T.Group();
    model.group.add(ornaments);
    const stone = new T.MeshStandardMaterial({ color: e.color, roughness: .78, metalness: .3 });
    const soul = new T.MeshStandardMaterial({ color: e.glow, emissive: e.glow, emissiveIntensity: 1.1 });
    const geo = new T.OctahedronGeometry(.18, 0), rings = [];
    const height = model.height || 2;
    for (let i = 0; i < 7; i++) {
        const shard = new T.Mesh(geo, i % 2 ? stone : soul);
        shard.position.set(Math.cos(i * 2.4) * .55, height * .6 + Math.sin(i) * .45, Math.sin(i * 2.4) * .45);
        shard.scale.y = 2.2;
        ornaments.add(shard);
        rings.push(shard);
    }
    const crown = new T.Mesh(new T.TorusGeometry(.42, .035, 4, 12), soul);
    crown.position.y = height + .12;
    crown.rotation.x = Math.PI / 2;
    ornaments.add(crown);
    model.group.scale.multiplyScalar(e.size);
    model.radius *= e.size;
    model.height *= e.size;
    model.silhouette = model.height;
    const update = model.update.bind(model), dispose = model.dispose.bind(model);
    let time = 0;
    model.update = (dt, speed) => { update(dt, speed); time += dt; ornaments.rotation.y = Math.sin(time * .4) * .15; for (let i = 0; i < rings.length; i++)
        rings[i].rotation.y = time * .8 + i; soul.emissiveIntensity = 1 + Math.sin(time * 2) * .25; };
    model.dispose = () => { ornaments.removeFromParent(); geo.dispose(); crown.geometry.dispose(); stone.dispose(); soul.dispose(); dispose(); };
    return model;
}
export function buildSepulcher() { return createBlenderVharos(buildSepulcherFallback()); }
function buildSepulcherFallback() {
    const group = new T.Group();
    group.name = 'Vharos, the buried cathedral';
    const core = new T.Group();
    group.add(core);
    const stone = new T.MeshStandardMaterial({ color: 0x4e4658, roughness: .82, metalness: .25, flatShading: true });
    const trim = new T.MeshStandardMaterial({ color: 0x907c65, metalness: .5, roughness: .55 });
    const soul = new T.MeshStandardMaterial({ color: 0xffbe73, emissive: 0xf79948, emissiveIntensity: 2 });
    const rock = new T.IcosahedronGeometry(1, 0), cube = new T.BoxGeometry(1, 1, 1), parts = [], arms = [], rings = [];
    const piece = (parent, geo, mat, x, y, z, sx, sy, sz) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); parts.push({ m, p: m.position.clone() }); return m; };
    piece(core, rock, stone, 0, 18, 0, 8, 11, 6);
    piece(core, rock, stone, 0, 31, 0, 4.5, 5, 4);
    for (const side of [-1, 1]) {
        piece(core, rock, stone, side * 5, 6, 0, 4, 7, 4);
        piece(core, cube, trim, side * 5, 1, 2, 8, 2, 10);
        const arm = new T.Group();
        arm.position.set(side * 9, 25, 0);
        core.add(arm);
        arms.push(arm);
        piece(arm, rock, stone, side * 2, -2, 0, 4, 7, 4);
        piece(arm, rock, stone, side * 4, -11, 2, 5, 5, 5);
        piece(core, cube, soul, side * 1.8, 32, 3.7, 1.8, .7, .6);
        for (let i = 0; i < 5; i++) {
            const rib = piece(core, cube, trim, side * 4.8, 13 + i * 2.5, 5, 5, .6, 1);
            rib.rotation.z = side * .18;
        }
        for (let i = 0; i < 4; i++)
            piece(core, cube, trim, side * (3.5 + i * .8), 33 + i % 2 * 3, -1, 1, 8 - i, 1);
    }
    const obsidian = new T.MeshStandardMaterial({ color: 0x272b34, roughness: .9, metalness: .15 });
    // Stacked funerary armour and carved tablets distinguish the cathedral from a golem.
    for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
            const plate = piece(core, rock, obsidian, side * (5.8 - i * .35), 14 + i * 2.4, 4.4, 2.6, 1.3, 1.5);
            plate.rotation.z = side * .2;
            piece(core, cube, soul, side * (5.9 - i * .35), 14 + i * 2.4, 5.8, .2, .65, .14);
        }
        const tablet = piece(arms[side < 0 ? 0 : 1], cube, obsidian, side * 2, 2, -.2, 5, 8, 4);
        tablet.rotation.z = side * .14;
        for (let j = 0; j < 4; j++)
            piece(arms[side < 0 ? 0 : 1], cube, trim, side * 2, 1 + j * 1.2, 2, 3, .3, .35);
        for (let j = 0; j < 6; j++) {
            const link = new T.Mesh(new T.TorusGeometry(.5, .12, 4, 8), trim);
            link.position.set(side * 7.5, 12 - j * 1.15, 4);
            link.rotation.y = j % 2 * Math.PI / 2;
            core.add(link);
        }
        piece(core, rock, obsidian, side * 2.4, 30.3, 3.4, 2.8, 2.7, 1.6);
    }
    piece(core, rock, soul, 0, 20, 5.8, 2.6, 4, 1.2);
    for (let i = 0; i < 3; i++) {
        const ring = new T.Mesh(new T.TorusGeometry(10 + i * 2, .12, 5, 64), soul);
        ring.position.y = 22 + i * 3;
        ring.rotation.x = Math.PI / 2 + i * .2;
        core.add(ring);
        rings.push(ring);
    }
    const hit = new T.Mesh(new T.CylinderGeometry(12, 12, 38, 12), new T.MeshBasicMaterial({ visible: false }));
    hit.position.y = 19;
    group.add(hit);
    let time = 0, dead = false, deathTime = 0;
    return { group, hit, height: 38, radius: 12, setDead(v) { if (v !== dead)
            deathTime = 0; dead = v; }, update(dt, phase = 1, attacking = false) { time += dt; if (dead)
            deathTime += dt; core.position.y = dead ? -Math.min(40, deathTime * 5) : Math.sin(time * .55) * .35; for (let i = 0; i < arms.length; i++)
            arms[i].rotation.x = attacking ? -Math.PI * .35 + Math.sin(time * 2) * .18 : Math.sin(time * .6 + i) * .07; for (let i = 0; i < rings.length; i++)
            rings[i].rotation.z = time * (.12 + i * .07); soul.emissiveIntensity = 1.5 + phase * .35 + Math.sin(time * 2) * .25; }, dispose() { group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); group.removeFromParent(); } };
}
