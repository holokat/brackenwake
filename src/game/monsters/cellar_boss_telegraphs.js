import * as THREE from 'three';

// Both geometry and damage consume the same shape records. No visual-only radii.
function shapeGeometry(s) {
  if (s.kind === 'lane') return new THREE.PlaneGeometry(s.width, s.length);
  if (s.kind === 'ring') return new THREE.RingGeometry(Math.max(.001, s.inner), s.radius, 72);
  if (s.kind === 'cone') return new THREE.CircleGeometry(s.radius, 64,
    Math.PI / 2 - s.yaw - s.halfAngle, s.halfAngle * 2);
  if (s.kind === 'sanctuary') {
    const outline = new THREE.Shape();
    outline.moveTo(-s.halfWidth, s.offsetZ - s.halfDepth);
    outline.lineTo(s.halfWidth, s.offsetZ - s.halfDepth);
    outline.lineTo(s.halfWidth, s.offsetZ + s.halfDepth);
    outline.lineTo(-s.halfWidth, s.offsetZ + s.halfDepth);
    outline.closePath();
    const hole = new THREE.Path();
    hole.absarc(s.safe.x - s.x, s.safe.z - s.z, s.safe.radius, 0, Math.PI * 2, true);
    outline.holes.push(hole);
    return new THREE.ShapeGeometry(outline, 72);
  }
  return new THREE.CircleGeometry(s.radius, 64);
}

function free(group) {
  group.removeFromParent();
  group.traverse(o => {
    o.geometry?.dispose();
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    for (const material of materials) material?.dispose();
  });
}

export function createCellarBossTelegraphs(parent) {
  const marks = new Map(), flashes = [];
  const make = mark => {
    const s = mark.shape, group = new THREE.Group();
    group.name = `cellar-telegraph:${mark.id}`;
    group.position.set(s.x, (s.y || 0) + .075, s.z);
    const geometry = shapeGeometry(s);
    const material = new THREE.MeshBasicMaterial({ color: mark.colour,
      transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const fill = new THREE.Mesh(geometry, material);
    fill.rotation.x = Math.PI / 2;
    if (s.kind === 'lane') group.rotation.y = s.yaw;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffddbe, transparent: true, opacity: .9, depthWrite: false }));
    edge.rotation.x = Math.PI / 2;
    fill.renderOrder = 2; edge.renderOrder = 3;
    group.add(fill, edge);
    if (s.kind === 'sanctuary') {
      const safe = new THREE.Mesh(new THREE.RingGeometry(s.safe.radius - .15, s.safe.radius, 64),
        new THREE.MeshBasicMaterial({ color: 0x7dffb1, transparent: true, opacity: .95, depthWrite: false, side: THREE.DoubleSide }));
      safe.rotation.x = Math.PI / 2;
      safe.position.set(s.safe.x - s.x, .025, s.safe.z - s.z);
      group.add(safe);
    }
    let falling = null;
    if (mark.attackId === 'fallingTombs') {
      falling = new THREE.Group();
      falling.name = 'falling tomb';
      const stone = new THREE.MeshStandardMaterial({ color: 0x747a8e, roughness: .9,
        transparent: true, opacity: .72 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(s.width * .68, 1.25, s.length * .82), stone);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(s.width * .76, .28, s.length * .88), stone.clone());
      lid.position.y = .76; falling.add(body, lid); falling.position.y = 10.65;
      group.add(falling);
    }
    parent?.add(group);
    return { group, fill, edge, mark, falling };
  };
  return {
    add(mark) {
      if (marks.has(mark.id)) return;
      marks.set(mark.id, make(mark));
    },
    remove(mark, impact = false, now = 0) {
      const item = marks.get(mark.id);
      if (!item) return;
      marks.delete(mark.id);
      if (impact) {
        item.fill.material.opacity = .7;
        if (item.falling) item.falling.position.y = .65;
        item.edge.material.color.setHex(mark.colour);
        flashes.push({ ...item, until: now + 450 });
      } else free(item.group);
    },
    update(now) {
      for (const item of marks.values()) {
        const progress = Math.max(0, Math.min(1, (now - item.mark.born) / (item.mark.impactAt - item.mark.born)));
        item.fill.material.opacity = .12 + progress * .25;
        item.edge.material.opacity = .65 + progress * .35;
        if (item.falling) item.falling.position.y = .65 + 10 * (1 - progress * progress);
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const item = flashes[i], left = Math.max(0, (item.until - now) / 450);
        item.fill.material.opacity = left * .6;
        item.edge.material.opacity = left;
        if (item.falling) for (const mesh of item.falling.children) mesh.material.opacity = left * .72;
        if (!left) { free(item.group); flashes.splice(i, 1); }
      }
    },
    clear() {
      for (const item of marks.values()) free(item.group);
      for (const item of flashes) free(item.group);
      marks.clear(); flashes.length = 0;
    },
    get size() { return marks.size; },
  };
}
