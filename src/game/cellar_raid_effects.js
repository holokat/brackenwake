import * as T from 'three';
import { enableSpellBloom } from './vfx/bloom.js';
import { RAID } from '../mmo/cellar_raid_rules.js';
// The authoritative warning timestamps drive every animation, including late joins.
// These effects never apply damage, move a player, or decide that an attack hit.
export function createRaidImpacts(scene) {
    const group = new T.Group();
    group.name = 'Cathedral impacts';
    scene.add(group);
    const events = new Set(), bursts = [], rock = new T.OctahedronGeometry(1), dummy = new T.Object3D();
    const shape = new T.Shape([[-1, 3], [-1.8, 1.6], [-1.1, -2.7], [0, -3.6], [1.1, -2.7], [1.8, 1.6], [1, 3]].map(p => new T.Vector2(...p)));
    const coffin = new T.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: true, bevelThickness: .14, bevelSize: .14, bevelSegments: 1, steps: 1 });
    const fallMaterial = enableSpellBloom(new T.MeshStandardMaterial({ color: 0x47414b, roughness: .7, metalness: .3, emissive: 0xff5b39, emissiveIntensity: .65 }));
    const falling = new T.InstancedMesh(coffin, fallMaterial, 8);
    falling.count = 0;
    falling.frustumCulled = false;
    group.add(falling);
    let warning = null;
    const glow = (color) => enableSpellBloom(new T.MeshBasicMaterial({ color, transparent: true, opacity: .85, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    function prepare(attack, now) {
        warning = attack?.shape === 'marks' && now < attack.landAt ? attack : null;
        falling.count = warning ? Math.min(8, warning.marks.length) : 0;
        if (!warning)
            return;
        const seconds = Math.max(0, (warning.landAt - now) / 1000), height = seconds > 1.25 ? 58 : 58 * (seconds / 1.25) ** 1.5;
        for (let i = 0; i < falling.count; i++) {
            const [x, z] = warning.marks[i];
            dummy.position.set(x, height + 3, z);
            dummy.rotation.set(.13, Math.sin(i * 3.1) * .4, Math.sin(i * 2) * .15);
            dummy.scale.setScalar(1.5);
            dummy.updateMatrix();
            falling.setMatrixAt(i, dummy.matrix);
        }
        falling.instanceMatrix.needsUpdate = true;
    }
    function fireMaterial(color) { return new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, uniforms: { t: { value: 0 }, fade: { value: 1 }, color: { value: new T.Color(color) } }, vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec2 v;uniform float t;uniform float fade;uniform vec3 color;void main(){float ribbon=pow(max(0.,sin(v.x*3.14159)),.45);float tongues=.62+.38*sin(v.x*80.+sin(v.x*27.-t*7.)*3.+t*11.);float edge=(1.-smoothstep(tongues-.3,tongues,v.y));float alpha=ribbon*edge*fade*.5;gl_FragColor=vec4(mix(color,vec3(1.),pow(1.-v.y,4.)*.55),alpha);}' }); }
    function trigger(attack, now) {
        if (events.has(attack.event) || now < attack.landAt)
            return;
        events.add(attack.event);
        if (events.size > 64)
            events.delete(events.values().next().value);
        falling.count = 0;
        const centres = attack.shape === 'marks' ? attack.marks : [[RAID.x, RAID.z]];
        for (const [x, z] of centres) {
            const root = new T.Group();
            root.position.set(x, .15, z);
            group.add(root);
            const light = glow(attack.color), ring = new T.Mesh(new T.RingGeometry(.965, 1, 96), light);
            ring.rotation.x = -Math.PI / 2;
            root.add(ring);
            const debrisMaterial = new T.MeshStandardMaterial({ color: 0x5a5562, roughness: .86, emissive: attack.color, emissiveIntensity: .35, transparent: true });
            const debris = new T.InstancedMesh(rock, debrisMaterial, attack.shape === 'marks' ? 32 : 64);
            debris.frustumCulled = false;
            root.add(debris);
            const walls = [], rays = [];
            if (attack.shape === 'cross') {
                const mat = fireMaterial(attack.color);
                for (let i = 0; i < 4; i++) {
                    const wall = new T.Mesh(new T.PlaneGeometry(RAID.radius, 10, 1, 1), mat);
                    wall.position.set(Math.cos(i * Math.PI / 2) * RAID.radius / 2, 4.8, Math.sin(i * Math.PI / 2) * RAID.radius / 2);
                    wall.rotation.y = -i * Math.PI / 2;
                    root.add(wall);
                    walls.push(wall);
                }
            }
            if (attack.shape === 'outside') {
                for (let i = 0; i < 12; i++) {
                    const a = i * Math.PI / 6, ray = new T.Mesh(new T.ConeGeometry(1.7, 54, 5), light);
                    ray.position.set(Math.cos(a) * 54, 26, Math.sin(a) * 54);
                    ray.rotation.z = Math.cos(a) * .18;
                    ray.rotation.x = Math.sin(a) * .18;
                    root.add(ray);
                    rays.push(ray);
                }
            }
            const cracks = [];
            for (let i = 0; i < 32; i++) {
                const a = i * Math.PI / 16, radius = attack.shape === 'marks' ? 9 : attack.shape === 'circle' ? 29 : 74;
                let px = 0, pz = 0;
                for (let j = 1; j <= 5; j++) {
                    const r = radius * j / 5, xx = Math.cos(a) * r + Math.sin(i * 9 + j * 3) * 1.3, zz = Math.sin(a) * r + Math.cos(i * 6 + j * 7) * 1.3;
                    cracks.push(px, .04, pz, xx, .04, zz);
                    px = xx;
                    pz = zz;
                }
            }
            const cg = new T.BufferGeometry();
            cg.setAttribute('position', new T.Float32BufferAttribute(cracks, 3));
            const cm = new T.LineBasicMaterial({ color: attack.color, transparent: true, opacity: .9, blending: T.AdditiveBlending, depthWrite: false });
            root.add(new T.LineSegments(cg, cm));
            bursts.push({ root, ring, light, debris, debrisMaterial, walls, rays, cg, cm, at: attack.landAt, shape: attack.shape, radius: attack.shape === 'marks' ? 9 : attack.shape === 'circle' ? 29 : 74 });
        }
    }
    function release(b) {
        const geos = new Set(), mats = new Set();
        b.root.traverse(o => {
            if (o.geometry && o.geometry !== rock)
                geos.add(o.geometry);
            if (o.material)
                mats.add(o.material);
        });
        geos.forEach(g => g.dispose());
        mats.forEach(m => m.dispose());
        b.root.removeFromParent();
    }
    function reset() { for (const b of bursts)
        release(b); bursts.length = 0; warning = null; falling.count = 0; }
    return { prepare, trigger, reset, get activeBursts() { return bursts.length; }, get fallingCount() { return falling.count; }, update(now, visible = true) {
            group.visible = visible;
            for (let i = bursts.length - 1; i >= 0; i--) {
                const b = bursts[i], t = Math.max(0, (now - b.at) / 1000);
                if (t > 3) {
                    release(b);
                    bursts.splice(i, 1);
                    continue;
                }
                const p = Math.min(1, t / 1.2);
                b.ring.scale.setScalar(b.shape === 'outside' ? 25 + p * 49 : 1 + p * b.radius);
                b.light.opacity = (1 - Math.min(1, t / 2.2)) * .8;
                b.cm.opacity = Math.max(0, .8 - t * .3);
                b.debrisMaterial.opacity = Math.max(0, 1 - t / 3);
                for (let n = 0; n < b.debris.count; n++) {
                    const a = n / b.debris.count * Math.PI * 2, r = (2 + n % 13 * 1.3) * (b.shape === 'marks' ? .5 : b.shape === 'outside' ? 3 : 1.2), spread = 1 + t * .3;
                    let x = Math.cos(a) * r * spread, z = Math.sin(a) * r * spread;
                    if (b.shape === 'cross') {
                        x = n % 2 ? (n % 16 - 8) * 8 : Math.sin(n) * 4;
                        z = n % 2 ? Math.sin(n) * 4 : (n % 16 - 8) * 8;
                    }
                    const h = Math.max(0, (b.shape === 'circle' ? 20 : 14) * t - 10 * t * t);
                    dummy.position.set(x, h, z);
                    dummy.rotation.set(t * 1.8 + a, t * .6, a);
                    dummy.scale.set(.35 + n % 3 * .25, 1 + n % 5 * .6, .45 + n % 2 * .35);
                    dummy.updateMatrix();
                    b.debris.setMatrixAt(n, dummy.matrix);
                }
                b.debris.instanceMatrix.needsUpdate = true;
                for (const wall of b.walls) {
                    wall.material.uniforms.t.value = t;
                    wall.material.uniforms.fade.value = Math.max(0, 1 - t / 2.3);
                    wall.scale.y = Math.min(1, t * 7) * (1 - t * .12);
                }
                for (const ray of b.rays)
                    ray.scale.setScalar(Math.max(.01, Math.sin(Math.min(1, t / 2.8) * Math.PI)));
            }
        }, dispose() {
            for (const b of bursts)
                release(b);
            bursts.length = 0;
            rock.dispose();
            coffin.dispose();
            fallMaterial.dispose();
            group.removeFromParent();
        } };
}
