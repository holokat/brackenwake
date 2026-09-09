import * as T from 'three';

// compileAsync traverses hidden objects too. Give it just the visible material
// variants so entering a cellar cannot compile the entire hidden overworld.
function visibleMaterials(scene) {
  const root = new T.Group(), seen = new Set();
  scene.traverseVisible(o => {
    if (!o.material) return;
    const key = o.type + ':' + [].concat(o.material).map(m => m.id).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    // Compilation reads mesh flags, geometry and material. A facade preserves
    // those without cloning instance buffers or serializing circular gameplay
    // userData. It never reparents or renders the original object.
    const proxy = Object.create(o); proxy.children = []; proxy.parent = null; proxy._listeners = undefined;
    root.add(proxy);
  });
  return root;
}

/** Compile the actual light count and output format, restoring live state before yielding. */
export async function compileRoomPrograms(root, sc, {lights = [], work, signal} = {}) {
  const renderer = sc?.renderer;
  if (!renderer?.compileAsync) return;
  let glow = false;
  root.traverse(o => {if ([].concat(o.material || []).some(m => m.userData.spellBloom)) glow = true;});
  const effects = sc.spellPass || (glow && sc.prepareEffects ? await work.run(() => sc.prepareEffects(), {signal}) : null);
  const targets = effects ? [null, effects.composer.renderTarget2] : [null];
  for (const target of targets) {
    if (signal?.aborted) return;
    const objects = lights.length ? [root, visibleMaterials(sc.scene)] : [root];
    for (const object of objects) await work.run(() => {
      const previous = lights.map(l => l.visible), oldTarget = renderer.getRenderTarget?.();
      try {
        for (const light of lights) light.visible = true;
        renderer.setRenderTarget?.(target);
        return renderer.compileAsync(object, sc.camera, sc.scene);
      } finally {
        lights.forEach((l, i) => {l.visible = previous[i];});
        renderer.setRenderTarget?.(oldTarget || null);
      }
    }, {signal, priority: 2});
  }
}

/** Build one static cube shadow per queued slice, before the room becomes visible. */
export async function prepareRoomShadows(root, parent, lights, {sc, work, signal} = {}) {
  const renderer = sc?.renderer;
  if (!renderer?.shadowMap?.enabled || !lights.length) return true;
  const stage = new T.Scene(), placement = new T.Group(), camera = new T.PerspectiveCamera();
  const target = new T.WebGLRenderTarget(1, 1), prepared = [];
  // This isolated scene has only room meshes on layer 3 and one light on layer 31.
  // The warm-up camera draws no colour geometry, but the light sees architecture.
  camera.layers.set(31);
  parent.updateWorldMatrix(true, false); placement.matrixAutoUpdate = false;
  placement.matrix.copy(parent.matrixWorld); placement.add(root); stage.add(placement);
  try {
    for (const light of lights) {
      if (signal?.aborted) return false;
      const copy = light.clone(); copy.layers.set(31); copy.visible = true;
      light.getWorldPosition(copy.position); copy.shadow.autoUpdate = false; copy.shadow.needsUpdate = true;
      stage.add(copy); prepared.push({light, copy});
      await work.run(() => {
        const oldTarget = renderer.getRenderTarget(), autoUpdate = renderer.shadowMap.autoUpdate;
        try {
          renderer.shadowMap.autoUpdate = true;
          renderer.setRenderTarget(target); renderer.render(stage, camera);
        } finally {renderer.setRenderTarget(oldTarget); renderer.shadowMap.autoUpdate = autoUpdate;}
      }, {signal, priority: 2});
      stage.remove(copy);
    }
    if (signal?.aborted) return false;
    for (const {light, copy} of prepared) {
      light.shadow.map?.dispose(); light.shadow.map = copy.shadow.map; copy.shadow.map = null;
      light.shadow.camera.copy(copy.shadow.camera); light.shadow.matrix.copy(copy.shadow.matrix);
      light.shadow.needsUpdate = false;
    }
    return true;
  } finally {
    root.removeFromParent(); target.dispose();
    for (const {copy} of prepared) copy.dispose();
  }
}
