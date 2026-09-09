/** Nearby bodies are immediate; distant preparation is cancelled when its roster changes. */
export function createSpawnQueue({work, spawn, has, canSpawn = () => true, immediateRadius = () => 48, onError = console.warn}) {
  const pending = new Map();
  function cancel(key) {const job=pending.get(key);if(job){job.abort();pending.delete(key);}}
  return {
    reconcile(wanted) {
      const keys=new Set(wanted.map(w=>w.rec.key));
      for(const key of pending.keys())if(!keys.has(key))cancel(key);
      for(const {rec,d2} of wanted) {
        if(has(rec.key)){cancel(rec.key);continue;}
        if(!work || d2 <= immediateRadius(rec)**2){cancel(rec.key);if(canSpawn(rec))spawn(rec);continue;}
        if(pending.has(rec.key))continue;
        const controller=new AbortController();pending.set(rec.key,controller);
        work.run(()=>{
          if(controller.signal.aborted || has(rec.key) || !canSpawn(rec))return;
          spawn(rec);
        },{signal:controller.signal,priority:1}).catch(error=>onError(`Creature preparation: ${error.message}`)).finally(()=>{
          if(pending.get(rec.key)===controller)pending.delete(rec.key);
        });
      }
    },
    clear(){for(const key of pending.keys())cancel(key);},
    get pending(){return pending.size;},
  };
}
