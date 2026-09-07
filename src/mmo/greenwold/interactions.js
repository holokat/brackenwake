import { SPACES } from '../spaces/index.js';
import { placeAt } from './places.js';

export const READINGS = {
  hearthhome:{text:'The mill lane goes west through the Long Meadow. The east lane reaches the Standing Hedge. Cobb keeps the forge on the north side of the green.',to:'millrun'},
  millrun:{text:'The quarry track follows the river upstream. The hollow way behind the mill enters the Beech Hangar. The towpath follows the water back to Hearthhome.',to:'beechhangar'},
  beechhangar:{text:'Badger tracks end at the bank. Beyond the fallen beech, the east path climbs to a view over the mill. The low path turns south toward Coldwake.',to:'coldwake'},
  chalkpits:{text:'Copper stands by the left rail, tin beyond the spoil heap. The switchback reaches the chalk rim. Cobb can smelt your ore at Hearthhome.',to:'hearthhome'},
  oldcellars:{text:'The Legion banner marks the Old Cellars. Sergeant Oram Blackhand is below. The towpath continues west through the Water Meadows.',to:'watermeadows'},
  sunkenchapel:{text:'The narrow causeway reaches the chapel bell. The dead return after dark. The shore path turns east toward the outlaws\' lookout.',to:'highwaymanshollow'},
  highwaymanshollow:{text:'The lookout watches the Kingsroad track. A narrow trail behind the tents returns to the Standing Hedge.',to:'waystones'},
  kingsroad_camp:{text:'The Kingsroad returns south to Hearthhome. The track west leads to Highwayman\'s Hollow. The lands beyond Greenwold are not open in this build.',to:'hearthhome'},
  longmeadow:{text:'The old oak stands above the haymakers lane. The mill is west. To the southeast, the cellar cutting drops to the river.',to:'millrun'},
  watermeadows:{text:'The north bank leads east to the Old Cellars. Across the bridge, the drovers path goes south to Coldwake.',to:'oldcellars'},
  coldwake:{text:'The drovers path returns north to the river. The west bridleway enters the Beech Hangar. The east lane reaches the Standing Hedge.',to:'watermeadows'},
  chalk_rim:{text:'The quarry benches fall away below. The river runs from the chalk valley past the mill; beyond it, the beeches cover the western ridge.',to:'millrun'},
  drovers_rest:{text:'Coldwake is south along the drovers path. North, the bridge reaches the Water Meadows and the old towpath.',to:'watermeadows'},
};

// Resolve the actual picked piece, never the space's entire bounding circle.
export function authoredPick(site,piece,point,spaces=SPACES) {
  if(!site?.space)return null;
  const s=spaces[site.space];if(!s)return null;
  const matches=(s.pieces||[]).filter(p=>p.model===piece);
  const p=matches.sort((a,b)=>Math.hypot(s.at.x+a.x-point.x,s.at.z+a.z-point.z)-Math.hypot(s.at.x+b.x-point.x,s.at.z+b.z-point.z))[0];
  if(!p)return null;
  const at={x:s.at.x+p.x,z:s.at.z+p.z};
  if(piece==='cellar_arch')return {kind:'site',site:{...site,...at,id:`entry:${s.id}`,sub:'oldcellars',kind:'dungeon',realm:'greenwold',levels:1}};
  if(piece==='mine_mouth')return {kind:'site',site:{...site,...at,id:`entry:${s.id}:${p.x}`,sub:'greenwoldpits',kind:'cave',realm:'greenwold',levels:1,oreBand:['copper','tin']}};
  if(piece==='loot_sack')return {kind:'chest',chest:{...at,kind:'cache',siteId:s.id,level:1,i:s.pieces.indexOf(p),tier:1,locked:false}};
  const key=s.id.slice('greenwold_'.length);
  if(piece==='chapel_sunken')return {kind:'site',site:{...site,...at,inspect:'bell'}};
  if(piece==='fingerpost' && READINGS[key])return {kind:'site',site:{...site,...at,inspect:key}};
  return null;
}

export function inspectAuthored(site,{character,hud,story,field}) {
  const log=t=>{hud?.log?.(t);hud?.toast?.(t);};
  if(site.inspect==='bell'){
    const fired=story?.story||story;
    if(!fired?.ringChapelBell)return {ok:false,reason:'unavailable'};
    const result=story?.ringChapelBell ? story.ringChapelBell() : fired.ringChapelBell();
    if(result?.ok===false)return result;
    fired.checkBeats?.(performance.now(),true);
    log('The chapel bell rings across the mere.');return {ok:true};
  }
  const row=READINGS[site.inspect];if(!row)return {ok:false,reason:'unknown'};
  log(row.text);
  // Reading a sign deliberately sets a destination. It never invents a reward.
  const target=placeAt(field,row.to);
  if(target&&character){character.waypoint={x:target.x,z:target.z,name:target.name};hud?.log?.(`Your compass points to ${target.name}.`);}
  return {ok:true,target};
}
