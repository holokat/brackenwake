import * as T from 'three';
import { enableSpellBloom } from '../game/vfx/bloom.js';
/** Small, bounded emitters for the room's authored magical fixtures. */
export function createCellarMagic(parent, anchors, {lightLimit = 3} = {}) {
    const root = new T.Group();
    root.name = 'Cellar fixture magic';
    parent.add(root);
    const updates = [], fixtures = [], nearest = [];
    // A fixed pool keeps distant fixtures out of every fragment's light loop
    // and avoids compiling new light-count variants as the player walks.
    const lights = Array.from({length: Math.min(lightLimit, anchors.filter(a => ['arcane', 'soulFlame', 'bell'].includes(a.kind)).length)}, () => {
        const light = new T.PointLight(0xffffff, 0, 26, 1.4); root.add(light); return light;
    });
    for (const anchor of anchors) {
        if (!['arcane', 'soulFlame', 'bell'].includes(anchor.kind))
            continue;
        const group = new T.Group();
        group.position.set(anchor.x, anchor.y, anchor.z);
        root.add(group);
        const color = new T.Color(anchor.color), arcane = anchor.kind === 'arcane', bell = anchor.kind === 'bell';
        const positions = new Float32Array((arcane ? 72 : 24) * 3), geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(positions, 3));
        const material = enableSpellBloom(new T.PointsMaterial({ color, size: arcane ? .16 : .1, transparent: true, opacity: .6, blending: T.AdditiveBlending, depthWrite: false }));
        const motes = new T.Points(geo, material);
        motes.frustumCulled = false;
        group.add(motes);
        const rings = [];
        if (arcane || bell)
            for (let j = 0; j < (arcane ? 3 : 1); j++) {
                const mat = enableSpellBloom(new T.MeshBasicMaterial({ color, transparent: true, opacity: .34, blending: T.AdditiveBlending, depthWrite: false }));
                const ring = new T.Mesh(new T.TorusGeometry(arcane ? 3.2 + j * .55 : 5, .025, 4, 80), mat);
                ring.rotation.x = Math.PI / 2;
                group.add(ring);
                rings.push(ring);
            }
        const fixture = {group, color, power: arcane ? 42 : 18, range: arcane ? 26 : 13, distance: 0};
        fixtures.push(fixture);
        updates.push(time => {
            if (!group.visible) return;
            for (let i = 0; i < positions.length / 3; i++) {
                const phase = (time * (arcane ? .08 : .2) + i * .618) % 1, angle = i * 2.399 + time * .2, r = arcane ? 2.6 + Math.sin(i * 3) * 1.5 : bell ? 3.5 : Math.sin(i * 3) * .6;
                positions[i * 3] = Math.cos(angle) * r;
                positions[i * 3 + 1] = arcane ? Math.sin(angle * .7) * 2 : bell ? -phase * 8 : phase * 2.5;
                positions[i * 3 + 2] = Math.sin(angle) * r;
            }
            geo.attributes.position.needsUpdate = true;
            rings.forEach((ring, j) => { ring.rotation.y = time * .07 * (j % 2 ? -1 : 1); ring.rotation.x = Math.PI / 2 + (arcane ? Math.sin(time * .09 + j) * .35 : 0); ring.rotation.z = time * .05 + j; ring.material.opacity = .2 + Math.sin(time * .7 + j) * .08; });
        });
    }
    let disposed = false;
    return {group: root, update(time, pos) {
        if (disposed) return;
        nearest.length = 0;
        for (const fixture of fixtures) {
            fixture.distance = pos ? Math.hypot(pos.x-fixture.group.position.x, pos.z-fixture.group.position.z) : 0;
            fixture.group.visible = fixture.distance < 80;
            if (fixture.group.visible) nearest.push(fixture);
        }
        nearest.sort((a,b) => a.distance-b.distance);
        lights.forEach((light,i) => {
            const fixture = nearest[i];
            light.intensity = fixture ? fixture.power * (1 + Math.sin(time * 1.3) * .06) : 0;
            if (fixture) {light.position.copy(fixture.group.position);light.color.copy(fixture.color);light.distance=fixture.range;}
        });
        for (const fn of updates) fn(time);
    }, dispose() { if (disposed)
            return; disposed = true; root.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); if (o.isLight)
            o.dispose(); }); root.removeFromParent(); } };
}
