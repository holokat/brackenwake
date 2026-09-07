import {wiki} from './wiki.js';

// Hex colors and surface responses are studio interpretations of the wiki's
// named colors. The source descriptions remain attached to each preset.
const appearances={
 copper:['#ad6945',.76,.37],tin:['#bec3c5',.7,.4],iron:['#515963',.78,.38],silver:['#d3dbe0',.9,.22],
 coldiron:['#202d43',.82,.31],emberite:['#713c39',.72,.35],rimesteel:['#95bdce',.76,.28],verdite:['#7a9260',.74,.33],
 voidrock:['#171b20',0,1],starfall:['#8795a5',.87,.17],bronze:['#b58b4e',.76,.36],
 oak:['#956b3d',0,.8],ash:['#c2ae84',0,.83],heartwood:['#643c34',0,.77],ironbark:['#3b3a35',0,.87],
 amber:['#dc9b2e',.08,.24],jade:['#44916b',.1,.31],garnet:['#81283f',.13,.23],sapphire:['#3461ae',.15,.2],ruby:['#b43545',.12,.22],diamond:['#e6edf1',.14,.13],starstone:['#8492a4',.48,.13],
 hide:['#946740',0,.87],thickHide:['#604632',0,.95],scaledHide:['#4e695d',.08,.72],
};
const groups={ores:'metal',alloys:'metal',woods:'wood',gems:'gem',leathers:'leather'};
export const materialPresets=Object.entries(groups).flatMap(([key,role])=>wiki.materials[key].map(entry=>{
 const [color,metalness,roughness]=appearances[entry.id];
 return {...entry,role,color,metalness,roughness,sourceGroup:key};
}));
export const materialById=new Map(materialPresets.map(m=>[m.id,m]));
export const materialGroups=[['metal','Metals'],['wood','Woods'],['leather','Hides'],['gem','Gemstones']];

