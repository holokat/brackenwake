import {wiki} from './wiki.js';
import {materialPresets} from './materials.js';
import {shieldCatalog} from './shield-catalog.js';

const tools=new Set(['pickaxe','smith_hammer','tongs']);
const ammunition=new Set(['arrow','bolt']);
const included=new Set(['weapon','shield','offhand','instrument','jewellery']);
export const itemCatalog=[
 ...wiki.bases.filter(b=>b.kind!=='shield'&&(included.has(b.kind)||tools.has(b.id)||ammunition.has(b.id))).map(base=>({
  ...base,kind:base.kind==='instrument'?'offhand':tools.has(base.id)?'tool':ammunition.has(base.id)?'ammunition':base.kind,
  family:base.kind==='weapon'?(wiki.weapons.find(w=>w.id===base.id)?.skill||'magery'):base.kind,
  sourceUrl:wiki.source.url,
 })),
 ...shieldCatalog,
 ...materialPresets.map(p=>({...p,id:'material:'+p.id,materialId:p.id,kind:'material',family:p.role,slot:null,sourceUrl:wiki.source.url})),
];
const kindOrder=['weapon','shield','offhand','tool','jewellery','ammunition','material'];
itemCatalog.sort((a,b)=>kindOrder.indexOf(a.kind)-kindOrder.indexOf(b.kind));
export const itemById=new Map(itemCatalog.map(i=>[i.id,i]));
export const defaultItemId='longsword';
export const resolveItemId=id=>itemById.has(id)?id:defaultItemId;
export const categoryOptions=[['all','All items'],['weapon','Weapons'],['shield','Shields'],['offhand','Books and offhands'],['tool','Tools'],['jewellery','Jewelry'],['ammunition','Ammunition'],['material','Materials']];
export const sentenceCase=s=>s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();
export function itemLabel(item){return sentenceCase(item.name);}
export function defaultMaterial(item){
 if(item.kind==='material')return item.materialId;
 if(/bow|staff|wand|lute|torch|arrow|bolt/.test(item.id))return 'oak';
 return 'iron';
}
export function itemDetail(item){
 if(item.kind==='material')return [item.role==='gem'?'Gemstone':item.role==='leather'?'Hide':item.role==='wood'?'Wood':'Metal',item.colour].filter(Boolean).join(' · ');
 if(item.kind==='weapon'){const w=wiki.weapons.find(w=>w.id===item.id)||item;return [w.hands===2?'Two hands':w.hands===0?'Unarmed':'One hand',w.skill?.replace(/([a-z])([A-Z])/g,'$1 $2')].filter(Boolean).join(' · ');}
 return sentenceCase(item.kind);
}
