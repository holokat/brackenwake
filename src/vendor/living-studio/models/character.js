import {createChibiCharacter,isChibiClass} from './chibi/character.js';
export {disposeCharacter} from './dispose-character.js';

/** Complete outfits are the active character path. Older imports remain loadable. */
export async function createCharacter(kind,options={}){
 if(isChibiClass(kind)&&!Object.hasOwn(options.equipment||{},'armor'))return createChibiCharacter(kind,options);
 const {createHistoricalCharacter}=await import('./armor/source-character.js');
 return createHistoricalCharacter(kind,options);
}
