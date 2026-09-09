/** Drives the existing production camera loop with the playtest's memory-only
 * character. No alternate camera/controller implementation lives here. */
export function installCameraReview(b,place,write,status){
 const host=document.querySelector('#nave').parentElement;
 const button=(label,fn)=>{const el=document.createElement('button');el.textContent=label;el.onclick=fn;host.appendChild(el);return el;};
 button('At reported wall',()=>place(19,124,Math.PI));
 button('Under gallery',()=>place(-26,98,Math.PI/2));
 const test=button('Test camera orbit',async()=>{
  test.disabled=true;let frames=0,blocked=0,shortest=Infinity,worstClip=0,maxCameraMs=0;
  const cases=[[19,124,'Reported nave wall'],[1,136,'Connector corridor'],[-26,98,'Under the gallery']];
  try{for(const [x,z,label]of cases){
   place(x,z);b.camera.pitch=.45;const start=performance.now();status.textContent=label+'. Testing camera orbit.';
   while(performance.now()-start<7000){
    await new Promise(requestAnimationFrame);
    const p=b.player.pos,target={x:p.x,y:p.y+1.5,z:p.z},cam=b.sc.camera;
    const distance=Math.hypot(cam.position.x-target.x,cam.position.y-target.y,cam.position.z-target.z);
    const at=performance.now(),safe=b.runtime.physical.cameraDistance(target,cam.position,.28);maxCameraMs=Math.max(maxCameraMs,performance.now()-at);
    worstClip=Math.max(worstClip,distance-safe);shortest=Math.min(shortest,distance);if(distance<b.camera.distance-.1)blocked++;frames++;
    b.camera.yaw=(performance.now()-start)/7000*Math.PI*2;
   }
  }}finally{test.disabled=false;}
  write({cameraOrbit:worstClip<.001?'passed':'failed',frames,blockedFrames:blocked,shortestDistance:shortest,worstClip,maxCameraQueryMs:maxCameraMs,webglError:b.sc.renderer.getContext().getError()});
  place(19,124,Math.PI);status.textContent='Camera orbit review finished. Back at the reported wall.';
 });
}
