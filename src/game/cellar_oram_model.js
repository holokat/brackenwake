import * as T from 'three';
import { registerModel, isLoaded } from './models.js';
import { buildGlbRig } from './rig_glb.js';
const id = registerModel('cellar-oram', {
    url: new URL('../../assets/models/cellars/oram/oram.glb', import.meta.url).href,
    clips: ['idle', 'walk', 'run', 'attack', 'cast', 'hurt', 'die', 'special'],
    alias: { swing: 'attack', jump: 'special' },
});
/** Oram keeps his combat envelope and authored equipment while gaining his own rig. */
export function buildCellarOram(fallback) {
    const cached = isLoaded(id);
    if (cached)
        fallback.dispose();
    const rig = buildGlbRig(id, { height: fallback.silhouette || fallback.height, dieSeconds: 1.45, fallback: () => fallback });
    rig.group.name = 'Sergeant Oram Blackhand';
    rig.monster = 'oramBlackhand';
    rig.shape = fallback.shape;
    rig.radius = fallback.radius;
    rig.height = fallback.height;
    rig.silhouette = fallback.silhouette;
    rig.clickRadius = fallback.clickRadius;
    rig.clickHeight = fallback.clickHeight;
    const hit = new T.Mesh(new T.CylinderGeometry(rig.clickRadius, rig.clickRadius, rig.clickHeight, 8), new T.MeshBasicMaterial({ visible: false }));
    hit.position.y = rig.clickHeight * .5;
    rig.group.add(hit);
    rig.parts.hit = hit;
    // buildGlbRig owns anchors and materials; this extra click envelope is ours.
    const dispose = rig.dispose.bind(rig);
    rig.dispose = () => { if (rig.disposed)
        return; hit.removeFromParent(); hit.geometry.dispose(); hit.material.dispose(); dispose(); };
    return rig;
}
