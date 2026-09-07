/** Swept horizontal capsules for live bodies. Positions are read when moving. */
export function actorsAllowMove(from,to,actors,radius=.32,height=1.75){
 const dx=to.x-from.x,dz=to.z-from.z,length=dx*dx+dz*dz;
 for(const entry of actors){
  const actor=entry.actor||entry,group=entry.model?.group||entry.group;
  if(entry.hidden||actor.hidden||actor.health<=0)continue;
  let visible=true;for(let p=group;p;p=p.parent)if(!p.visible){visible=false;break;}
  if(!visible)continue;
  const p=actor.pos||actor,ar=entry.model?.radius??actor.radius??.32,ah=entry.model?.height??actor.height??1.75;
  if(!Number.isFinite(p.x)||!Number.isFinite(p.z))continue;
  const before=Math.hypot(from.x-p.x,from.z-p.z),after=Math.hypot(to.x-p.x,to.z-p.z);
  // A mover sees itself in its provider. Old overlapping spawns may separate.
  if(before<.001||before<radius+ar&&after>before+1e-8)continue;
  const t=length?Math.max(0,Math.min(1,((p.x-from.x)*dx+(p.z-from.z)*dz)/length)):0;
  const y=from.y+(to.y-from.y)*t,feet=p.y??0;
  if(y>=feet+ah-.03||y+height<=feet+.03)continue;
  if(Math.hypot(from.x+dx*t-p.x,from.z+dz*t-p.z)<radius+ar)return false;
 }return true;
}
