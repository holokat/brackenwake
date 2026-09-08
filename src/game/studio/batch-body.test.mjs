// The body batcher keeps what the studio's pieces need. Run: node src/game/studio/batch-body.test.mjs
//
// A hood is a shell the studio draws double sided. Merged under a front side
// material its near faces were culled and the face showed through the helmet
// (the user, 2026-09-08). So: one double sided source makes the batch double
// sided, and a body of closed pieces stays front side, which is the cheap case.

import * as THREE from 'three';
import { batchBody } from './batch-body.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

/** A rig of one bone and `sides` skinned boxes, each with its own material side. */
function actorOf(sides) {
  const group = new THREE.Group();
  const bone = new THREE.Bone();
  const skeleton = new THREE.Skeleton([bone]);
  group.add(bone);
  for (const side of sides) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
    const w = new Float32Array(n * 4); for (let i = 0; i < n; i++) w[i * 4] = 1;
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ color: 0x804020, side }));
    m.userData.itemId = side === THREE.DoubleSide ? 'hood' : 'tunic';
    group.add(m);
    m.bind(skeleton);
  }
  return { group, rig: { skeleton } };
}

const batched = (actor) => actor.group.children.find((o) => o.isSkinnedMesh && o.name === 'Studio body and worn armour');

console.log('batch-body: sidedness');
{
  const closed = actorOf([THREE.FrontSide, THREE.FrontSide]);
  batchBody(closed);
  const a = batched(closed);
  check('two closed pieces batch to one mesh', !!a && closed.group.userData.batchedSourceMeshes === 2);
  check('and the batch is front side', a && a.material.side === THREE.FrontSide, `side ${a && a.material.side}`);

  const hooded = actorOf([THREE.FrontSide, THREE.DoubleSide, THREE.FrontSide]);
  batchBody(hooded);
  const b = batched(hooded);
  check('a hood among closed pieces batches to one mesh', !!b && hooded.group.userData.batchedSourceMeshes === 3);
  check('and that batch is double sided, so the hood keeps its inside', b && b.material.side === THREE.DoubleSide, `side ${b && b.material.side}`);
  check('the batch names the items it holds', b && b.userData.studioItems.sort().join(' ') === 'hood tunic', b && b.userData.studioItems.join(' '));
  check('the sources are gone from the group', hooded.group.children.filter((o) => o.isSkinnedMesh).length === 1);
  check('and the batch carries the pieces\' triangles', b && b.geometry.attributes.position.count === 3 * 36, b && String(b.geometry.attributes.position.count));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
