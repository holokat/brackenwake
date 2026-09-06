// Model Town: the layout is pure and the town builds from what is loaded.
import * as THREE from 'three';
import { layoutFor, buildModelTown, trianglesOf, GAP, PER_ROW, MODEL_TOWN_ARRIVAL } from './model_town.js';
import { registerProp, forgetProp, hasProp } from './plan_models.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '   ' + detail : ''}`); };

console.log('model_town: the layout');
{
  const fp = { a: [1, 1, 1], b: [2, 2, 3], c: [8, 6, 5.5], d: [1, 1, 0.5], e: [4, 0.7, 3], f: [3, 3, 3], g: [0.8, 0.8, 1] };
  const at = layoutFor(Object.keys(fp), fp);
  check('every id with a footprint stands somewhere', at.length === 7);
  check('an id with no footprint is left out', layoutFor(['a', 'nope'], fp).length === 1);
  check('small things first', at[0].id === 'd' && at[at.length - 1].id === 'c', at.map((p) => p.id).join(', '));
  check(`rows of ${PER_ROW}`, new Set(at.map((p) => p.z.toFixed(2))).size === 2);
  // no two footprints touch: the gap is between every pair in a row
  let touching = 0;
  for (const p of at) for (const q of at) {
    if (p === q) continue;
    const dx = Math.abs(p.x - q.x), dz = Math.abs(p.z - q.z);
    if (dx < (p.w + q.w) / 2 + GAP - 1e-9 && dz < (p.d + q.d) / 2 + GAP - 1e-9) touching++;
  }
  check(`and ${GAP} m of clear ground between every pair`, touching === 0, `${touching} pairs closer than that`);
  const cx = at.reduce((s, p) => s + p.x, 0) / at.length;
  check('centred on the origin, near enough', Math.abs(cx) < 6, `mean x ${cx.toFixed(1)}`);
  check('the visitor arrives outside the rows', MODEL_TOWN_ARRIVAL.z < Math.min(...at.map((p) => p.z - p.d / 2)));
}

console.log('model_town: the town builds from loaded models');
{
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  const wrap = new THREE.Group(); wrap.add(box);
  registerProp('barrel', wrap);
  check('the fixture is in', hasProp('barrel'));
  const town = await buildModelTown({ heightAt: () => 2, ids: ['barrel', 'no_such_model'], fetchIds: async () => [] });
  check('a group comes back', !!town && town.name === 'model-town');
  const m = town && town.getObjectByName('model-town:barrel');
  check('the loaded model stands in it, at the ground height given', !!m && Math.abs(m.position.y - 2) < 1e-9, m ? `y ${m.position.y}` : 'no barrel');
  check('and the unknown one is simply not there', town && !town.getObjectByName('model-town:no_such_model') && town.userData.ids.join() === 'barrel');
  check('the label counts the real triangles', trianglesOf(m) === 12, `${trianglesOf(m)}`);
  const empty = await buildModelTown({ ids: ['no_such_model'], fetchIds: async () => [] });
  check('nothing loaded is null, not an empty group', empty === null);
  forgetProp('barrel');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
