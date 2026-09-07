import {CHUNK} from './field.js';
// A shelf mushroom needs its tree. Support is independent of harvesting, so
// felling a tree neither awards a mushroom nor resets a harvested patch.
export function updateForageSupports(chunks,treesFor,onChange){
  if(!treesFor)return;
  const cache=new Map();
  for(const entry of chunks.values()){
    const attached=entry.recs.filter(r=>r.tree);if(!attached.length)continue;
    for(const rec of attached){
      const cx=Math.floor(rec.tree.x/CHUNK),cz=Math.floor(rec.tree.z/CHUNK),key=cx+','+cz;
      if(!cache.has(key))cache.set(key,treesFor(cx,cz)||[]);const trees=cache.get(key);
      const missing=!trees.some(t=>Math.hypot(t.x-rec.tree.x,t.z-rec.tree.z)<.15);
      if(missing===!!rec.supportMissing)continue;
      rec.supportMissing=missing;if(!rec.harvestedUntil)onChange(entry,rec,missing);
    }
  }
}
