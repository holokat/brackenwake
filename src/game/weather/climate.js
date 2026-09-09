// Authored climates and a shared passing front. Weather never places scenery.
import { REALM_ZONES } from '../../world/zones.js';
import { SPACES } from '../../mmo/spaces/index.js';

export const FRONT_MS = 47 * 60_000;
export const CLIMATES = Object.freeze({
  greenwold:     { cloud: .22, wet: .76, mist: .08, wind: .30, snow: 0, dust: 0 },
  verdant:       { cloud: .40, wet: .95, mist: .30, wind: .18, snow: 0, dust: 0 },
  saltmarch:     { cloud: .48, wet: 1,   mist: .40, wind: .65, snow: 0, dust: 0 },
  emberwastes:   { cloud: .08, wet: 0,   mist: .02, wind: .65, snow: 0, dust: .45 },
  stormpeaks:    { cloud: .50, wet: 1,   mist: .20, wind: .90, snow: 0, dust: 0 },
  boneyard:      { cloud: .44, wet: 0,   mist: .20, wind: .65, snow: 0, dust: .65 },
  frostreach:    { cloud: .48, wet: .90, mist: .25, wind: .72, snow: 1, dust: 0 },
  sunkenkingdom: { cloud: .48, wet: 1,   mist: .60, wind: .42, snow: 0, dust: 0 },
  ashenthrone:   { cloud: .56, wet: 0,   mist: .18, wind: .55, snow: 0, dust: .80 },
});

// Additions fade across each place's outer shoulder. Coldwake is a farming
// hamlet, not a snow biome; its name alone is no reason to put snow there.
export const GREENWOLD_AIR = Object.freeze({
  hearthhome:        { mist: -.04, cloud: -.04, wind: -.12 },
  hedge_1:           { mist: .04, cloud: .02, wind: .08 },
  longmeadow:        { mist: .08, cloud: -.02, wind: .12 },
  millrun:           { mist: .30, cloud: .06, wind: -.08 },
  beechhangar:       { mist: .22, cloud: .13, wind: -.17 },
  chalkpits:         { mist: -.05, cloud: .08, wind: .26 },
  oldcellars:        { mist: .12, cloud: .08, wind: -.10 },
  kingsroad_camp:    { mist: -.04, cloud: .02, wind: .20 },
  highwaymanshollow: { mist: .10, cloud: .11, wind: -.14 },
  sunkenchapel:      { mist: .48, cloud: .20, wind: -.06 },
  watermeadows:      { mist: .42, cloud: .12, wind: .02 },
  coldwake:          { mist: .10, cloud: .08, wind: .16 },
  occult_tower:      { mist: .42, cloud: .36, wind: -.18 },
});

const clamp = v => Math.max(0, Math.min(1, v));
const smooth = (a,b,x) => { const t=clamp((x-a)/(b-a)); return t*t*(3-2*t); };
// Clear spell, gathering cloud, rain band, clearing showers. Interpolation is
// continuous through the wrap and the rain always arrives after the cloud.
const FRONT = [[0,0,0],[.18,0,0],[.32,.55,0],[.43,1,.80],[.60,1,1],[.73,.75,.35],[.87,.18,0],[1,0,0]];
export const WEATHER_MODES = Object.freeze(['auto','clear','overcast','rain','snow','mist','dust']);

// Seven minutes of snow and sleet in each 47-minute front, with a three-minute
// all-snow centre. Phase boundaries blend through sleet instead of switching.
export const ISLAND_COLD_FRONT = Object.freeze({ begins: .51, frozen: .55, thaws: .62, ends: .66 });
export function islandSnowAt(phase) {
  const c=ISLAND_COLD_FRONT;
  return smooth(c.begins,c.frozen,phase)*(1-smooth(c.thaws,c.ends,phase));
}

export function auditClimates(table=CLIMATES, realms=REALM_ZONES) {
  for (const r of realms) {
    if (!table[r.id]) throw Error(`Weather climate missing: ${r.id}`);
    for (const key of ['cloud','wet','mist','wind','snow','dust']) {
      const v=table[r.id][key];
      if (!Number.isFinite(v)||v<0||v>1) throw Error(`Invalid weather climate: ${r.id}.${key}`);
    }
  }
  return realms.length;
}

export function weatherAt({x=0,z=0,height=0,biome='meadow',snowLine=64,now=0,day=1,mix=[['greenwold',1]],sculpt=false,world=null,mode='auto'}, out={}) {
  const p=((now / FRONT_MS - (x*.7+z*.3)/18000)%1+1)%1;
  let i=0; while(i<FRONT.length-2 && p>FRONT[i+1][0])i++;
  const a=FRONT[i],b=FRONT[i+1],t=smooth(a[0],b[0],p);
  const front=a[1]+(b[1]-a[1])*t, shower=a[2]+(b[2]-a[2])*t;
  let cloud=0,wet=0,mist=0,wind=0,snow=0,dust=0,green=0;
  for (const [id,w] of mix) {
    const c=CLIMATES[id]||CLIMATES.greenwold;
    cloud+=c.cloud*w; wet+=c.wet*w; mist+=c.mist*w;
    wind+=c.wind*w; snow+=c.snow*w; dust+=c.dust*w;
    if(id==='greenwold')green+=w;
  }
  if(sculpt && green>0) for(const [id,c] of Object.entries(GREENWOLD_AIR)) {
    const s=SPACES[`greenwold_${id}`]; if(!s)continue;
    const w=(1-smooth(s.radius*.65,s.radius+100,Math.hypot(x-s.at.x,z-s.at.z)))*green;
    cloud+=c.cloud*w; mist+=c.mist*w; wind+=c.wind*w;
  }
  // The rendered ground's snow band is the altitude contract. Arid volcanic
  // climates never become snowy just because their crater rim is high.
  if(wet>.1) snow=Math.max(snow,biome==='snow'?1:smooth(snowLine-12,snowLine+8,height));
  // Haven's low island has no alpine snow band. A short cold spell in the
  // passing front brings snow to sea level, then gives way to clearing rain.
  // This changes falling precipitation, not the terrain's permanent snow line.
  if(world==='island') snow=Math.max(snow,islandSnowAt(p));
  const precipitation=clamp(wet*shower + snow*.12);
  out.cloud=clamp(cloud+front*.66);
  out.rain=precipitation*(1-snow);
  out.snow=precipitation*snow;
  out.dust=clamp(dust*(.15+front*.75));
  out.mist=clamp(mist*(.30+(1-day)*.70)+precipitation*.18);
  out.wind=clamp(wind+front*.25);
  if(mode!=='auto' && WEATHER_MODES.includes(mode)) {
    out.rain=out.snow=out.dust=0;
    out.cloud=mode==='clear'?.12:mode==='mist'?.55:.96;
    out.mist=mode==='mist'?.90:mode==='clear'?.015:.18;
    if(mode==='rain')out.rain=.85;
    if(mode==='snow')out.snow=.85;
    if(mode==='dust')out.dust=.8;
  }
  out.windX=(.65+Math.sin(now/380000)*.18)*out.wind;
  out.windZ=.32*out.wind;
  out.label=out.snow>.08?'Snow':out.rain>.08?'Rain':out.dust>.15?'Drifting dust':out.mist>.26?'Mist':out.cloud>.65?'Overcast':'Fair';
  return out;
}
auditClimates();
