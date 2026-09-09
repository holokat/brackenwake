// Drive the real input/controller/collision loop, with an expendable QA character.
export async function walkMeadow(b,route){
 b.dev.set(false);b.windows.closeAll();document.activeElement?.blur();
 b.player.teleport(...[route[0][0],route[0][1]],(x,z)=>b.runtime.heightAt(x,z));
 b.camera.pitch=.26;b.camera.distance=10;b.camera.snap(b.player.pos);
 let index=1,previous=performance.now(),started=previous;const frames=[];
 const key=(type)=>window.dispatchEvent(new KeyboardEvent(type,{key:'w',bubbles:true}));
 key('keydown');
 try{
  while(index<route.length){
   const now=await new Promise(requestAnimationFrame);frames.push(now-previous);previous=now;
   // A user switching apps triggers the game's legitimate key-release handler.
   // Reassert this QA input so focus loss is not mistaken for a blocked trail.
   key('keydown');
   if(now-started>45000){
    const[x,z]=route[index],hit=b.runtime.physical.at?.(x,b.runtime.heightAt(x,z),z,.35,1.75);
    throw Error(`Walking route stalled at ${b.player.pos.x.toFixed(1)}, ${b.player.pos.z.toFixed(1)}, heading for ${route[index]}, obstacle ${JSON.stringify(hit)}, ${frames.length} frames, visibility ${document.visibilityState}`);
   }
   const[x,z]=route[index],dx=x-b.player.pos.x,dz=z-b.player.pos.z;
   if(Math.hypot(dx,dz)<.9)index++;
   else b.camera.yaw=Math.atan2(dx,dz);
  }
 }finally{key('keyup');}
 const sorted=frames.filter(v=>v>0).sort((a,b)=>a-b),ms=previous-started;
 return {stage:'walk-tested',routePoints:index,seconds:ms/1000,frames:sorted.length,meanFps:sorted.length*1000/ms,p95FrameMs:sorted[Math.floor(sorted.length*.95)],over50ms:sorted.filter(x=>x>50).length,endpoint:{x:b.player.pos.x,z:b.player.pos.z},viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}};
}
