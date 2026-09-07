// Resolve gameplay against the layout the player is standing in.
import { SPACES } from '../spaces/index.js';
import { ZONE } from '../../world/zones.js';

export const PLACE_SPACE = Object.freeze({
  hearthhome: 'greenwold_hearthhome', waystones: 'greenwold_hedge_1',
  millrun: 'greenwold_millrun', beechhangar: 'greenwold_beechhangar',
  greenwoldpits: 'greenwold_chalkpits', chalkpits: 'greenwold_chalkpits',
  oldcellars: 'greenwold_oldcellars', kingsroad: 'greenwold_kingsroad_camp',
  highwaymanshollow: 'greenwold_highwaymanshollow', sunkenchapel: 'greenwold_sunkenchapel',
  longmeadow: 'greenwold_longmeadow', watermeadows: 'greenwold_watermeadows',
  coldwake: 'greenwold_coldwake',
});

export function placeAt(field, id, spaces = SPACES) {
  if (!field?.sculpt) return ZONE[id] || null;
  const s = spaces[PLACE_SPACE[id] || id];
  return s?.at ? { ...s.at, id: s.id, name: s.name, realm: 'greenwold', radius: s.radius } : null;
}

export function spaceStoneRows(spaces = SPACES) {
  const out = [];
  for (const s of Object.values(spaces)) {
    for (const [i, p] of (s.pieces || []).entries()) {
      if (p.model !== 'waystone_village') continue;
      out.push({ id: `way:space:${s.id}:${i}`, kind: 'town', name: s.name,
        where: s.name, realm: 'greenwold', place: s.id, twin: null,
        x: s.at.x + p.x, z: s.at.z + p.z });
    }
  }
  return out;
}

export function nearestSpaceStone(pos, spaces = SPACES) {
  return spaceStoneRows(spaces).filter(s => s.place.startsWith('greenwold_hedge_'))
    .sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z))[0] || null;
}

const zoneSpaces=spaces=>{
  const canonical=new Map();
  for(const [id,space] of Object.entries(PLACE_SPACE))if(!canonical.has(space))canonical.set(space,id);
  return Object.values(spaces).filter(s=>canonical.has(s.id)||s.landmark||/^greenwold_hedge_\d+$/.test(s.id)).map(s=>({s,canonical:canonical.get(s.id)||s.district||'waystones'}));
};
const DEFAULT_ZONE_SPACES=zoneSpaces(SPACES);
export function authoredZoneAt(x,z,spaces=SPACES) {
  let best=null,rank=Infinity;
  for(const {s,canonical} of spaces===SPACES?DEFAULT_ZONE_SPACES:zoneSpaces(spaces)){
    const d=Math.hypot(x-s.at.x,z-s.at.z),r=s.radius+35;
    if(d>r||d/r>=rank)continue;
    best={...(ZONE[canonical]||ZONE.greenwold),id:s.id,name:s.name,x:s.at.x,z:s.at.z,r,parent:'greenwold',biome:'meadow'};
    rank=d/r;
  }
  return best||{...ZONE.greenwold};
}
