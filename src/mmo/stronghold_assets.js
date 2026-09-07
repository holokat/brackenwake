// Reusable, metre-scale architecture for the occupied Greenwold encounters.
export const STRONGHOLD_ASSETS = {
  occult_tower: {name:'Occult tower', size:[13,13,27]},
  ritual_altar: {name:'Ritual altar', size:[5,4,2.4]},
};
export const STRONGHOLD_FOOTPRINTS=Object.fromEntries(Object.entries(STRONGHOLD_ASSETS).map(([id,row])=>[id,row.size]));
