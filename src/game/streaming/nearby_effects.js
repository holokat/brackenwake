import {assetWork} from './work_queue.js';
/** Decorative effects are created only near the player, on lower-priority frame slices. */
export function createNearbyEffects(root,{work=assetWork,load=async id=>{
 const {createEffectModel}=await import('../../vendor/living-studio/runtime/world-effects/index.js');
 return createEffectModel(id);
}}={}) {
 const records=[];let disposed=false;
 return {
  add(id,pos,scale=1,configure){records.push({id,pos,scale,configure,fx:null,pending:false,lastNear:0,retryAt:0});},
  update(time,pos){
   if(disposed||!pos)return;
   for(const rec of records){
    const distance=Math.hypot(rec.pos.x-pos.x,rec.pos.z-pos.z);
    if(distance<90){
     rec.lastNear=time;
     if(!rec.fx&&!rec.pending&&time>=rec.retryAt){
      rec.pending=true;const controller=new AbortController();rec.controller=controller;
      work.run(async()=>{
       if(controller.signal.aborted)return;
       const fx=await load(rec.id);
       if(disposed||controller.signal.aborted){fx.dispose();return;}
       rec.configure?.(fx);fx.group.position.set(rec.pos.x,rec.pos.y,rec.pos.z);fx.group.scale.setScalar(rec.scale);root.add(fx.group);rec.fx=fx;
      },{priority:0,signal:controller.signal}).catch(error=>{rec.retryAt=time+15;if(!disposed)console.warn('Cellar effect',rec.id,error.message);}).finally(()=>rec.pending=false);
     }
    }else if(distance>140&&time-rec.lastNear>6){rec.controller?.abort();rec.fx?.dispose();rec.fx=null;}
    if(rec.fx){rec.fx.group.visible=distance<100;if(rec.fx.group.visible)rec.fx.update(time);}
   }
  },
  dispose(){if(disposed)return;disposed=true;for(const rec of records){rec.controller?.abort();rec.fx?.dispose();rec.fx=null;}},
 };
}
