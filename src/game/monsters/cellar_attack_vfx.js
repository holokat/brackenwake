import * as THREE from 'three';

const themes = {
  tidalRing: 'water', brineJets: 'water', crawlerBrood: 'brood', bellShock: 'bell',
  bellHammer: 'stone', silenceMarks: 'bell', cinderSweep: 'fire', cinderMarks: 'fire',
  furnacePulse: 'fire', chainLanes: 'chain', bookCurses: 'book', archiveRitual: 'book',
  fallingTombs: 'stone', gravityShock: 'gravity', saintCrush: 'stone',
  royalCleave: 'blade', graveCross: 'grave', royalCollapse: 'stone',
};
const dummy = new THREE.Object3D();
const clamp = v => Math.max(0, Math.min(1, v));

/** Small, clock-driven effects, owned and disposed with the actual damage mark.
 * No lights, textures, per-frame geometry, or additional asset downloads. */
export function createCellarAttackVfx(parent, mark) {
  const s = mark.shape, theme = themes[mark.attackId] || 'stone';
  const group = new THREE.Group();
  group.name = `attack-vfx:${mark.attackId}`;
  parent.add(group);
  const material = new THREE.MeshBasicMaterial({ color: mark.colour, transparent: true,
    opacity: .6, depthWrite: false, side: THREE.DoubleSide });
  const count = theme === 'chain' ? 32 : 24;
  const geometry = theme === 'chain' || theme === 'bell'
    ? new THREE.TorusGeometry(.28, .055, 4, 8)
    : theme === 'book' ? new THREE.BoxGeometry(.65, .09, .48)
    : new THREE.OctahedronGeometry(theme === 'stone' ? .3 : .14, 0);
  const motes = new THREE.InstancedMesh(geometry, material, count);
  motes.name = `${theme} fragments`; motes.frustumCulled = false;
  motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(motes);

  // A vertical crest carries the impact across a lane, ring or sword arc.
  // Its reach is derived from the same shape used by combat.
  let crestGeo;
  if (s.kind === 'lane') crestGeo = new THREE.PlaneGeometry(s.width, 1);
  else if (s.kind === 'sanctuary') crestGeo = new THREE.TorusGeometry(s.safe.radius, .13, 4, 48);
  else crestGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true,
    s.kind === 'cone' ? s.yaw - s.halfAngle : 0, s.kind === 'cone' ? s.halfAngle * 2 : Math.PI * 2);
  const crestMat = material.clone();
  const crest = new THREE.Mesh(crestGeo, crestMat); crest.name = `${theme} crest`;
  group.add(crest);
  if (s.kind === 'sanctuary') {
    crest.rotation.x = Math.PI / 2;
    crest.position.set(s.safe.x - s.x, .15, s.safe.z - s.z);
    crestMat.color.setHex(0x7dffb1);
  }

  const placements = Array.from({ length: count }, (_, i) => {
    const u = (i + .5) / count;
    // Deterministic locations keep replay, QA and low-frame-rate clients alike.
    if (s.kind === 'lane') return { x: ((i % 3) - 1) * s.width * .32, z: (u - .5) * s.length };
    if (s.kind === 'sanctuary') {
      const a = u * Math.PI * 2;
      return { x: s.safe.x - s.x + Math.sin(a) * s.safe.radius,
        z: s.safe.z - s.z + Math.cos(a) * s.safe.radius };
    }
    const a = s.kind === 'cone' ? s.yaw - s.halfAngle + u * s.halfAngle * 2 : u * Math.PI * 2;
    const r = theme === 'brood' ? s.radius * .6 : s.radius * (.65 + (i % 3) * .1);
    return { x: Math.sin(a) * r, z: Math.cos(a) * r };
  });
  function update(progress, impact = false) {
    const u = clamp(progress), fade = impact ? 1 - u : .35 + u * .5;
    material.opacity = fade * .72;
    crestMat.opacity = impact ? Math.sin(u * Math.PI) * .5 : .08 + u * .12;
    if (s.kind === 'lane') {
      crest.position.set(0, impact ? .25 + Math.sin(u * Math.PI) * 1.1 : .1, (u - .5) * s.length);
      crest.scale.y = impact ? .5 + Math.sin(u * Math.PI) * 2 : .2;
    } else if (s.kind !== 'sanctuary') {
      const inner = s.inner || 0;
      const r = impact ? inner + (s.radius - inner) * u : s.radius;
      crest.scale.set(Math.max(.05, r), impact ? .2 + Math.sin(u * Math.PI) * 1.5 : .12, Math.max(.05, r));
      crest.position.y = crest.scale.y / 2;
    }
    for (let i = 0; i < count; i++) {
      const p = placements[i], seed = (i % 7) / 7;
      let y = impact ? Math.sin(u * Math.PI) * (1 + seed * 2) : .08 + u * (.3 + seed);
      if (theme === 'book') y += impact ? (1 - u) * 1.3 : .5 + u;
      if (theme === 'stone' && mark.attackId === 'royalCollapse') y = impact ? y : 1 + 7 * (1 - u * u);
      if (theme === 'chain') y = .15 + Math.sin(u * Math.PI) * (impact ? 1.5 : .45);
      if (theme === 'gravity') y = impact ? (1 - u) * 2 : u * 1.6;
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(u * (i % 2 ? 4 : -3), i + u * 2, theme === 'chain' ? (i % 2) * Math.PI / 2 : u * 3);
      const size = impact ? Math.max(.01, 1 - u) * (theme === 'fire' ? 2.5 : 1.3) : .35 + u * .6;
      dummy.scale.setScalar(size);
      if (theme === 'water' || theme === 'fire') dummy.scale.y *= impact ? 3 : 1.5;
      dummy.updateMatrix(); motes.setMatrixAt(i, dummy.matrix);
    }
    motes.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { update, group, theme, count };
}
