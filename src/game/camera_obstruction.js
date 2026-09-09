export const CAMERA_CLEARANCE = .28;
export const CAMERA_RELEASE_TAU = .22;
export const CAMERA_RELEASE_HOLD = .12;
const length = (a,b) => Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
const along = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});

export function cameraClearance(camera) {
  const near = camera.near || .1, halfH = near * Math.tan((camera.fov || 55) * Math.PI / 360);
  return Math.max(CAMERA_CLEARANCE, Math.hypot(near,halfH,halfH*(camera.aspect || 1))+.08);
}

/** Retraction is immediate. Only recovery waits and eases, so a pillar edge
 * cannot alternate between full zoom and a close-up on adjacent frames. */
export function createCameraObstruction() {
  let distance = Infinity, hold = 0;
  function safeDistance(target,want,query,radius) {
    const requested=length(target,want),hit=query(target,want,radius);
    return Number.isFinite(hit)&&hit<requested ? Math.max(0,hit-.015) : requested;
  }
  return {
    reset(){distance=Infinity;hold=0;},
    boom(dt,target,want,query,radius) {
      const requested=length(target,want),safe=safeDistance(target,want,query,radius);
      if(safe<distance){distance=safe;hold=CAMERA_RELEASE_HOLD;}
      else if(safe<requested-.02&&safe<=distance+.02)hold=CAMERA_RELEASE_HOLD;
      else if(hold>0)hold=Math.max(0,hold-dt);
      else distance+=(safe-distance)*(1-Math.exp(-dt/CAMERA_RELEASE_TAU));
      return along(target,want,requested>1e-9?Math.min(1,distance/requested):0);
    },
    finish(target,position,query,radius){
      const requested=length(target,position),safe=safeDistance(target,position,query,radius);
      // This last sweep is essential: smoothing between two clear orbit
      // endpoints can still cut through the corner between them.
      if(safe<requested-.016){distance=Math.min(distance,safe);hold=CAMERA_RELEASE_HOLD;}
      return along(target,position,requested>1e-9?Math.min(1,safe/requested):0);
    },
  };
}
