import {wiki} from '../data/wiki.js';
import {studioClasses} from '../data/studio-classes.js';
import {studioNpcs} from '../data/studio-npcs.js';

// Retain historical profiles for source ability fixtures and imported characters.
const colors={
 warrior:['#733e30','#644632','#b59a64'],paladin:['#c2b898','#715b40','#c6a868'],
 ranger:['#566243','#584734','#a59163'],rogue:['#3b414b','#35393b','#929792'],
 mage:['#425d80','#4a4447','#b8a47b'],sorcerer:['#665277','#4b3e47','#b5a2b9'],
 necromancer:['#373b42','#413c37','#aaa28c'],healer:['#c7c2a8','#827258','#9ea99b'],
 bard:['#934e43','#72523e','#c5a463'],artisan:['#677578','#765138','#bba27b'],
 blank:['#8a8477','#76644e','#b7ae94'],
};
// Construction metadata for complete outfits and historical imports. These IDs
// are not selectable items in the studio's active catalog.
export const outfitComponentById=new Map(wiki.bases.filter(item=>item.kind==='armour').map(item=>[item.id,item]));
const weaponIds=new Set([...wiki.weapons.map(item=>item.id),'bone_staff','pickaxe','axe','smith_hammer','tongs']);
const offhandIds=new Set([...wiki.shields.map(item=>item.id),'holy_book','skull','lute']);
export const canonicalSlots=Object.freeze(wiki.pieces.map(piece=>piece.slot));
const sourceProfiles=Object.fromEntries(wiki.openings.map(opening=>{
 const equipment=Object.fromEntries(canonicalSlots.map(slot=>[slot,'none']));
 for(const {base} of opening.kit){const item=outfitComponentById.get(base);if(item)equipment[item.slot]=base;}
 const [cloth,leather,trim]=colors[opening.id];
 return [opening.id,Object.freeze({id:opening.id,name:opening.name,equipment:Object.freeze(equipment),
  weapon:opening.kit.find(item=>weaponIds.has(item.base))?.base||'fists',
  shield:opening.kit.find(item=>offhandIds.has(item.base))?.base||'none',
  colors:Object.freeze({cloth,leather,trim})})];
}));
export const classProfiles=Object.freeze({
 ...sourceProfiles,
 ...Object.fromEntries([...studioClasses,...studioNpcs].map(({id,name,equipment,weapon,shield,colors})=>
  [id,Object.freeze({id,name,equipment,weapon,shield,colors})])),
});
export function classProfile(kind){
 const profile=Object.hasOwn(classProfiles,kind)?classProfiles[kind]:null;
 if(!profile)throw new Error(`Unknown wiki class: ${kind}`);
 return profile;
}
