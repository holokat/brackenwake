// Construction spaces stream scenery. Only destinations belong on a player's
// map or in location announcements. The builder can inspect every space.
const DESTINATIONS=new Set(['hearthhome','millrun','longmeadow','beechhangar','chalkpits','oldcellars','sunkenchapel','highwaymanshollow','kingsroad_camp','watermeadows','coldwake','chalk_rim'].map(id=>'greenwold_'+id));
export function isDestination(space){
  if(!space)return false;
  if(space.landmark===true)return true;
  const id=space.space||space.id;
  if(/^tile_-?\d+_-?\d+$/.test(id))return false;
  if(!id?.startsWith('greenwold_'))return true;
  return DESTINATIONS.has(id)||/^greenwold_hedge_\d+$/.test(id);
}
export function placeLabel(runtime,pos,biomeName){
  const zone=runtime.zoneNow?.(pos.x,pos.z);
  if(runtime.field.sculpt)return zone?.name||'The Greenwold';
  let best=null,distance=Infinity;
  for(const site of runtime.sitesNear(pos.x,pos.z,90)){
    if(!isDestination(site))continue;
    const d=Math.hypot(site.x-pos.x,site.z-pos.z);
    if(d<distance){best=site;distance=d;}
  }
  return best?.name||zone?.name||biomeName;
}
