import {gltfAssets, prepareRoom} from './gltf_assets.js';
import {assetWork} from './work_queue.js';

/** One room owns its instances; the asset cache owns shared geometry and textures. */
export function createRoomArtwork({id, url, bounds, stream, sc, load, configure, configureMesh, attach, detach, beforeAttach,
  work = assetWork, pool = gltfAssets, prepare = prepareRoom, onError = console.warn} = {}) {
  let disposed = false, generation = 0, current = null, pending = null;
  let promise = Promise.resolve(false);
  function unload() {
    generation++; pending?.abort(); pending = null;
    if (current) {detach?.(current.instance); current.instance.dispose(); current.lease.release(); current = null;}
  }
  function start(signal) {
    if (disposed || signal?.aborted) return Promise.resolve(false);
    const token = ++generation, controller = new AbortController(); pending = controller;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once:true});
    if (signal?.aborted) abort();
    const lease = load ? {promise: Promise.resolve(load()), release(){}} : pool.acquire(url, {priority:3});
    let instance = null, retained = false, waiting = true;
    let settleCancelled;
    const cancelled = new Promise(resolve => {settleCancelled = resolve;});
    const cancelDownload = () => {if (waiting) lease.release(); settleCancelled(null);};
    controller.signal.addEventListener('abort',cancelDownload,{once:true});
    if (controller.signal.aborted) cancelDownload();
    promise = Promise.race([lease.promise,cancelled]).then(async asset => {
      waiting = false;
      if (!asset || disposed || controller.signal.aborted) return false;
      instance = await prepare(asset, configure, {signal:controller.signal, sc, work, configureMesh});
      if (!instance || disposed || controller.signal.aborted || token !== generation) return false;
      if (beforeAttach && !await beforeAttach(instance,controller.signal)) return false;
      await work.run(() => {
        if (disposed || controller.signal.aborted || token !== generation) return;
        attach(instance); current = {instance, lease}; retained = true;
      }, {priority:3, signal:controller.signal});
      return retained;
    }).catch(error => {if (!disposed && !controller.signal.aborted) onError(`Room artwork ${id}: ${error.message}`); return false;})
      .finally(() => {
        signal?.removeEventListener('abort', abort);
        controller.signal.removeEventListener('abort',cancelDownload);
        if (!retained) {instance?.dispose(); lease.release();}
        if (pending === controller) pending = null;
      });
    return promise;
  }
  if (stream) stream.register({id,url,bounds,load:start,unload});
  else start();
  return {get ready(){return promise;}, get loaded(){return !!current;}, get materials(){return current?.instance.materials||[];},
    dispose(){if(disposed)return;disposed=true;unload();},
  };
}
