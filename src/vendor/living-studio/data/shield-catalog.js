import {wiki} from './wiki.js';

// Studio designs extend the captured wiki without inventing game statistics.
export const shieldCatalog = Object.freeze([
 {id:'buckler',shape:'round',name:'Round shield'},
 {id:'kite',shape:'kite',name:'Kite shield'},
 {id:'heater',shape:'heater',name:'Heater shield'},
 {id:'tower',shape:'tower',name:'Tower shield'},
].map(design => ({...wiki.bases.find(item=>item.id===design.id),...design,
 kind:'shield',family:'shield',slot:'offhand',construction:'wood',
 sourceUrl:design.id==='heater'||design.id==='buckler'?null:wiki.source.url,
})));
export const shieldById = new Map(shieldCatalog.map(item=>[item.id,item]));
export const shieldConstructions = Object.freeze(['wood','metal']);
