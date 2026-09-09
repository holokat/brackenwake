import {createSpatialStream} from '../game/streaming/spatial_stream.js';
import {gltfAssets,canPrefetch} from '../game/streaming/gltf_assets.js';
import {assetWork} from '../game/streaming/work_queue.js';
import {cellarArrivalAsset} from './cellar_asset_catalog.js';

export function createCellarAssetStream(L,built,{pool=gltfAssets,canSpeculate=canPrefetch}={}) {
 let stairs=[],nearby=[],disposed=false;
 const refresh=()=>{const urls=[...new Set([...nearby,...stairs])];pool.cancelPrefetchExcept(urls);for(const url of urls)pool.prefetch(url);};
 const spatial=createSpatialStream({canSpeculate,prefetch:()=>{},cancelPrefetch:urls=>{nearby=urls;refresh();}});
 return {
  register:record=>spatial.register(record),
  update(dt,pos){
   if(disposed||!pos)return;
   spatial.update(dt,pos);
   const next=[];
   if(canSpeculate())for(const [at,level,dir]of[[built.stairPos,L.level+1,'down'],[built.entrancePos,L.level-1,'up']]){
    if(at&&Math.hypot(pos.x-at.x,pos.z-at.z)<38){const url=cellarArrivalAsset(level,dir);if(url)next.push(url);}
   }
   if(next.join('|')!==stairs.join('|')){stairs=next;refresh();}
  },
  ready:()=>spatial.ready(),retry:()=>spatial.retry(),
  claimArrival(level,direction){const url=cellarArrivalAsset(level,direction);return url?pool.acquire(url,{priority:3}):null;},
  get stats(){return{...spatial.stats,assets:pool.stats,work:assetWork.stats,stairPrefetch:stairs};},
  dispose(){if(disposed)return;disposed=true;stairs=[];nearby=[];spatial.dispose();},
 };
}
