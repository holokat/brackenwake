import * as THREE from 'three';
import { CELLAR_BOSSES, getCellarBoss } from '../mmo/cellar_bosses.js';
import { registerModel } from './models.js';
import { buildGlbRig } from './rig_glb.js';

const URLS = {
  morvaOssuaryMother: new URL('../../assets/models/cellars/depth-bosses/morvaOssuaryMother.glb', import.meta.url).href,
  sextonBellkeeper: new URL('../../assets/models/cellars/depth-bosses/sextonBellkeeper.glb', import.meta.url).href,
  abbotCinder: new URL('../../assets/models/cellars/depth-bosses/abbotCinder.glb', import.meta.url).href,
  ilexChainArchivist: new URL('../../assets/models/cellars/depth-bosses/ilexChainArchivist.glb', import.meta.url).href,
  vossInvertedSaint: new URL('../../assets/models/cellars/depth-bosses/vossInvertedSaint.glb', import.meta.url).href,
  asterFirstKing: new URL('../../assets/models/cellars/depth-bosses/asterFirstKing.glb', import.meta.url).href,
};
// Combat radius covers the load-bearing body; picking also includes spread limbs.
const ENVELOPES = {
  morvaOssuaryMother: { radius: 2.1, clickRadius: 3.4 },
  sextonBellkeeper: { radius: 1.1, clickRadius: 1.65 },
  abbotCinder: { radius: 1.65, clickRadius: 2.6 },
  ilexChainArchivist: { radius: 1.45, clickRadius: 3.8 },
  vossInvertedSaint: { radius: 3.2, clickRadius: 4.2 },
  asterFirstKing: { radius: 2.4, clickRadius: 3.3 },
};
export const CELLAR_BOSS_MODEL_IDS = Object.fromEntries(CELLAR_BOSSES.map(boss => [boss.id,
  registerModel(`cellar-depth-${boss.id}`, {
    url: URLS[boss.id], clips: ['idle', 'walk', 'run', 'attack', 'cast', 'hurt', 'die', 'special'],
    alias: { swing: 'attack', jump: 'special' },
  }),
]));

/** Synchronous stable rig contract; the shared GLB adapter owns async swapping. */
export function buildCellarDepthBoss(id, fallbackFactory) {
  const boss = getCellarBoss(id);
  if (!boss || !CELLAR_BOSS_MODEL_IDS[id]) return null;
  const envelope = ENVELOPES[id];
  const rig = buildGlbRig(CELLAR_BOSS_MODEL_IDS[id], {
    height: boss.height, dieSeconds: 2.35,
    fallback: () => {
      const model = fallbackFactory?.(id);
      if (!model) return null;
      const native = model.silhouette || model.height;
      if (native > 0) model.group.scale.multiplyScalar(boss.height / native);
      return model;
    },
  });
  rig.group.name = boss.name;
  rig.monster = id;
  rig.shape = boss.family;
  rig.height = boss.height;
  rig.silhouette = boss.height;
  rig.radius = envelope.radius;
  rig.clickRadius = envelope.clickRadius;
  rig.clickHeight = boss.height;
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(envelope.clickRadius, envelope.clickRadius, boss.height, 12),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.name = `${id} click envelope`;
  hit.position.y = boss.height / 2;
  rig.group.add(hit);
  rig.parts.hit = hit;
  const setAnim = rig.setAnim.bind(rig);
  rig.setAnim = name => setAnim(name === 'attack' ? 'swing' : name === 'special' ? 'air' : name);
  const dispose = rig.dispose.bind(rig);
  rig.dispose = () => {
    if (rig.disposed) return rig;
    const skeletons = new Set();
    rig.group.traverse(object => { if (object.isSkinnedMesh) skeletons.add(object.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
    hit.removeFromParent();
    hit.geometry.dispose();
    hit.material.dispose();
    return dispose();
  };
  return rig;
}
